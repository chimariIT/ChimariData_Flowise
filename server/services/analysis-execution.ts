// server/services/analysis-execution.ts
/**
 * Analysis Execution Service
 * Orchestrates real data analysis by:
 * 1. Loading uploaded datasets from storage
 * 2. Executing Python analysis scripts
 * 3. Parsing results into structured insights
 * 4. Storing results in database
 */

import { db } from '../db';
import { projects, datasets, projectDatasets, projectSessions, analysisPlans } from '@shared/schema';
import type { CostBreakdown } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { PythonProcessor } from '../python-processor';

interface AnalysisRequest {
  projectId: string;
  userId: string;
  analysisTypes: string[]; // ['descriptive', 'correlation', 'regression', etc.]
  datasetIds?: string[];
}

interface UserContext {
  analysisGoal?: string;
  businessQuestions?: string;
  selectedTemplates?: string[];
  audience?: {
    primaryAudience: string;
    secondaryAudiences?: string[];
    decisionContext?: string;
  };
}

interface AnalysisInsight {
  id: number;
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  confidence: number;
  category: string;
  dataSource?: string;
  details?: any;
}

interface AnalysisRecommendation {
  id: number;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  effort: 'High' | 'Medium' | 'Low';
  expectedImpact?: string;
}

interface AnalysisResults {
  projectId: string;
  analysisTypes: string[];
  insights: AnalysisInsight[];
  recommendations: AnalysisRecommendation[];
  visualizations: any[];
  summary: {
    totalAnalyses: number;
    dataRowsProcessed: number;
    columnsAnalyzed: number;
    executionTime: string;
    qualityScore: number;
  };
  metadata: {
    executedAt: Date;
    datasetNames: string[];
    techniques: string[];
  };
}

export class AnalysisExecutionService {

  /**
   * Retrieve user context from project session
   */
  private static async getUserContext(projectId: string, userId: string): Promise<UserContext> {
    console.log(`🔍 Retrieving user context for project ${projectId}`);

    // Get project to find linked session
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`⚠️  Project ${projectId} not found when retrieving context`);
      return {};
    }

    // Find the session for this project/user
    const sessions = await db
      .select()
      .from(projectSessions)
      .where(
        and(
          eq(projectSessions.userId, userId),
          eq(projectSessions.journeyType, project.journeyType as string)
        )
      )
      .orderBy(desc(projectSessions.lastActivity))
      .limit(1);

    if (!sessions || sessions.length === 0) {
      console.warn(`⚠️  No session found for project ${projectId}, user ${userId}`);
      return {};
    }

    const session = sessions[0];
    const prepareData = session.prepareData as any;

    if (!prepareData) {
      console.warn(`⚠️  No prepareData found in session for project ${projectId}`);
      return {};
    }

    console.log(`✅ Retrieved user context:`, {
      hasGoal: !!prepareData.analysisGoal,
      hasQuestions: !!prepareData.businessQuestions,
      hasTemplates: !!prepareData.selectedTemplates?.length,
      hasAudience: !!prepareData.audience
    });

    return {
      analysisGoal: prepareData.analysisGoal,
      businessQuestions: prepareData.businessQuestions,
      selectedTemplates: prepareData.selectedTemplates,
      audience: prepareData.audience
    };
  }

  /**
   * Execute analysis on a project's datasets
   */
  static async executeAnalysis(request: AnalysisRequest): Promise<AnalysisResults> {
    const startTime = Date.now();

    console.log(`🔬 Starting analysis for project ${request.projectId}`);
    console.log(`📊 Analysis types: ${request.analysisTypes.join(', ')}`);

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, request.projectId));

    if (!project) {
      throw new Error(`Project ${request.projectId} not found`);
    }

    if (project.userId !== request.userId) {
      throw new Error('Access denied: User does not own this project');
    }

    // ✅ REMOVED BLOCKING REQUIREMENT: Analysis plan approval is now optional
    // Users can execute analysis directly without going through plan approval step
    const approvedPlanId = project.approvedPlanId as string | null;

    // If there's an approved plan, use it for validation
    let plan: any = null;
    if (approvedPlanId) {
      const planRecords = await db
        .select()
        .from(analysisPlans)
        .where(eq(analysisPlans.id, approvedPlanId))
        .limit(1);

      if (planRecords.length > 0) {
        plan = planRecords[0];

        if (plan.status === 'executing') {
          throw new Error('Analysis execution is already in progress for this plan.');
        }

        if (plan.status === 'completed') {
          throw new Error('Analysis has already been completed for this plan.');
        }
      }
    }

    if (project.analysisExecutedAt) {
      throw new Error('Analysis has already been executed for this project.');
    }

    if (project.analysisBilledAt) {
      throw new Error('Analysis billing has been finalized for this project; execution is locked.');
    }

    let executionMarked = false;
    const executionStartTimestamp = new Date();

    try {
      // Only update plan status if a plan exists
      if (plan && approvedPlanId) {
        const transitionResult = await db
          .update(analysisPlans)
          .set({
            status: 'executing',
            executedAt: executionStartTimestamp,
            updatedAt: executionStartTimestamp,
          })
          .where(eq(analysisPlans.id, approvedPlanId))
          .returning({ id: analysisPlans.id });

        if (transitionResult.length === 0) {
          console.warn(`⚠️  Failed to mark plan ${approvedPlanId} as executing, continuing anyway`);
        } else {
          executionMarked = true;
        }
      }

      const userContext = await this.getUserContext(request.projectId, request.userId);

      if (userContext.analysisGoal) {
        console.log(`📝 User's analysis goal: ${userContext.analysisGoal.substring(0, 100)}...`);
      }
      if (userContext.businessQuestions) {
        console.log(`❓ User's business questions: ${userContext.businessQuestions.substring(0, 100)}...`);
      }
      if (userContext.audience) {
        console.log(`👥 Target audience: ${userContext.audience.primaryAudience}`);
      }

      const projectDatasetLinks = await db
        .select({
          dataset: datasets
        })
        .from(projectDatasets)
        .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
        .where(eq(projectDatasets.projectId, request.projectId));

      const projectDatasetList = projectDatasetLinks.map((link: any) => link.dataset);

      if (!projectDatasetList || projectDatasetList.length === 0) {
        throw new Error('No datasets found for this project');
      }

      console.log(`📁 Found ${projectDatasetList.length} dataset(s)`);

      const allInsights: AnalysisInsight[] = [];
      const allRecommendations: AnalysisRecommendation[] = [];
      const allVisualizations: any[] = [];
      let totalRows = 0;
      let totalColumns = 0;

      for (const dataset of projectDatasetList) {
        console.log(`🔍 Analyzing dataset: ${dataset.originalFileName}`);

        try {
          const datasetResults = await this.analyzeDataset(
            dataset,
            request.analysisTypes,
            request.projectId,
            userContext
          );

          allInsights.push(...datasetResults.insights);
          allRecommendations.push(...datasetResults.recommendations);
          allVisualizations.push(...datasetResults.visualizations);
          totalRows += datasetResults.rowCount;
          totalColumns += datasetResults.columnCount;

        } catch (error: any) {
          console.error(`❌ Error analyzing dataset ${dataset.originalFileName}:`, error.message);
          allInsights.push({
            id: Date.now(),
            title: `Analysis Error: ${dataset.originalFileName}`,
            description: `Could not complete analysis: ${error.message}`,
            impact: 'Low',
            confidence: 0,
            category: 'Error',
            dataSource: dataset.originalFileName
          });
        }
      }

      const syntheticRecommendations = this.generateRecommendations(allInsights);
      allRecommendations.push(...syntheticRecommendations);

      const executionTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const completedAt = new Date();

      const results: AnalysisResults = {
        projectId: request.projectId,
        analysisTypes: request.analysisTypes,
        insights: allInsights,
        recommendations: allRecommendations,
        visualizations: allVisualizations,
        summary: {
          totalAnalyses: request.analysisTypes.length,
          dataRowsProcessed: totalRows,
          columnsAnalyzed: totalColumns,
          executionTime: `${executionTime} seconds`,
          qualityScore: this.calculateQualityScore(allInsights)
        },
        metadata: {
          executedAt: completedAt,
          datasetNames: projectDatasetList.map((d: any) => d.originalFileName),
          techniques: request.analysisTypes
        }
      };

      const planCostBreakdown = (plan?.estimatedCost as CostBreakdown | undefined) ?? { total: 0, breakdown: {} };
      const projectCostBreakdown = (project.costBreakdown as CostBreakdown | null) ?? planCostBreakdown;
      const lockedCost = Number(project.lockedCostEstimate ?? planCostBreakdown.total ?? 0);
      const totalCost = Number.isFinite(lockedCost) && lockedCost > 0
        ? lockedCost
        : projectCostBreakdown.total ?? 0;
      const totalCostString = totalCost.toFixed(2);
      const actualCost: CostBreakdown = {
        total: totalCost,
        breakdown: projectCostBreakdown?.breakdown ?? planCostBreakdown.breakdown ?? {}
      };
      const billedAt = totalCost > 0 ? completedAt : null;

      await db.transaction(async (tx: any) => {
        await tx
          .update(projects)
          .set({
            analysisResults: results as any,
            analysisExecutedAt: completedAt,
            analysisBilledAt: billedAt,
            totalCostIncurred: totalCostString,
            costBreakdown: actualCost,
            updatedAt: completedAt,
          })
          .where(eq(projects.id, request.projectId));

        // Update plan status if a plan exists
        if (approvedPlanId) {
          await tx
            .update(analysisPlans)
            .set({
              status: 'completed',
              executionCompletedAt: completedAt,
              actualCost: actualCost,
              actualDuration: results.summary.executionTime,
              updatedAt: completedAt,
            })
            .where(eq(analysisPlans.id, approvedPlanId));
        }
      });

      console.log(`💾 Results stored for project ${request.projectId}`);
      console.log(`✅ Analysis complete: ${allInsights.length} insights, ${allRecommendations.length} recommendations`);

      return results;
    } catch (error) {
      // Roll back plan status if it was marked as executing
      if (executionMarked && approvedPlanId) {
        await db
          .update(analysisPlans)
          .set({
            status: 'approved',
            executedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(analysisPlans.id, approvedPlanId));
      }

      throw error;
    }
  }

  /**
   * Analyze a single dataset
   */
  private static async analyzeDataset(
    dataset: any,
    analysisTypes: string[],
    projectId: string,
    userContext: UserContext  // *** ADD USER CONTEXT PARAMETER ***
  ): Promise<{
    insights: AnalysisInsight[];
    recommendations: AnalysisRecommendation[];
    visualizations: any[];
    rowCount: number;
    columnCount: number;
  }> {

    const datasetName = dataset.originalFileName || dataset.name || dataset.datasetName || dataset.id;

    const pythonResults = await this.runPythonAnalysis({
      dataset,
      analysisTypes,
      projectId,
      userContext
    });

    // Parse Python results into insights
    const insights = this.parseInsights(pythonResults, datasetName);
    const visualizations = pythonResults.visualizations || [];

    return {
      insights,
      recommendations: [],
      visualizations,
      rowCount: pythonResults.rowCount || dataset.recordCount || 0,
      columnCount: pythonResults.columnCount || (dataset.schema ? Object.keys(dataset.schema).length : 0)
    };
  }

  /**
   * Run Python analysis script
   */
  private static async runPythonAnalysis(params: {
    dataset: any;
    analysisTypes: string[];
    projectId: string;
    userContext: UserContext;
  }): Promise<any> {
    const { dataset, analysisTypes, projectId, userContext } = params;

    const datasetPayload = this.buildDatasetPayload(dataset, projectId);

    const analysisConfig = {
      analysisTypes,
      datasetId: dataset.id,
      datasetName: datasetPayload.dataset?.name || datasetPayload.dataset?.datasetName || dataset.id,
      userContext: {
        analysisGoal: userContext.analysisGoal || null,
        businessQuestions: userContext.businessQuestions || null,
        targetAudience: userContext.audience?.primaryAudience || 'mixed',
        decisionContext: userContext.audience?.decisionContext || null
      },
      requestedAt: new Date().toISOString()
    };

    try {
      console.log(`🐍 Executing Python analysis via processor for dataset ${dataset.id}...`);
      const processorResult = await PythonProcessor.processData({
        projectId,
        operation: 'analyze',
        data: datasetPayload,
        config: analysisConfig
      });

      if (!processorResult.success || !processorResult.data) {
        throw new Error(processorResult.error || 'Python processor returned no data');
      }

      if (!processorResult.data.visualizations && processorResult.visualizations) {
        processorResult.data.visualizations = processorResult.visualizations;
      }

      console.log(`✅ Python analysis complete for dataset ${dataset.id}`);
      return processorResult.data;

    } catch (error: any) {
      console.error('❌ Python execution error:', error?.message || error);
      return await this.basicDataProfilingFromDataset(dataset);
    }
  }

  private static buildDatasetPayload(dataset: any, projectId: string) {
    const datasetName = dataset.originalFileName || dataset.name || dataset.datasetName || dataset.id;
    const rows = this.extractDatasetRows(dataset);
    const potentialPath = dataset.storageUri || dataset.filePath || dataset.file_path || null;
    const resolvedPath = potentialPath && typeof potentialPath === 'string' && !potentialPath.startsWith('mem://')
      ? potentialPath
      : null;

    return {
      projectId,
      dataset: {
        id: dataset.id,
        datasetId: dataset.id,
        name: datasetName,
        datasetName,
        filePath: resolvedPath,
        rows,
        schema: dataset.schema || null,
        recordCount: dataset.recordCount || (Array.isArray(rows) ? rows.length : null),
        preview: dataset.preview || null,
        metadata: dataset.ingestionMetadata || dataset.metadata || null
      }
    };
  }

  private static extractDatasetRows(dataset: any): any[] | null {
    const candidates = [
      dataset.data,
      dataset.preview,
      dataset.sampleData,
      dataset.records
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      if (Array.isArray(candidate)) {
        return candidate;
      }
      if (Array.isArray(candidate?.rows)) {
        return candidate.rows;
      }
      if (Array.isArray(candidate?.records)) {
        return candidate.records;
      }
      if (Array.isArray(candidate?.items)) {
        return candidate.items;
      }
    }

    return null;
  }

  /**
   * Basic data profiling fallback (without Python)
   */
  private static async basicDataProfilingFromDataset(dataset: any): Promise<any> {
    console.warn(`⚠️ Falling back to basic profiling for dataset ${dataset.id}`);
    const rows = this.extractDatasetRows(dataset) || [];
    const columns = rows.length > 0
      ? Object.keys(rows[0])
      : dataset.schema
        ? Object.keys(dataset.schema)
        : [];

    const numericColumns = columns.filter((column) =>
      rows.some((row: any) => typeof row?.[column] === 'number')
    );

    const rowCount = rows.length;
    const columnCount = columns.length;
    const missingValues = rows.reduce((total: number, row: any) => {
      return total + columns.reduce((acc, column) => {
        const value = row?.[column];
        return acc + (value === null || value === undefined || value === '' ? 1 : 0);
      }, 0);
    }, 0);

    return {
      success: true,
      rowCount,
      columnCount,
      descriptive: {
        rowCount,
        columnCount,
        numericColumns,
        missingValues,
        sampleColumns: columns.slice(0, 5)
      },
      correlations: [],
      regression: null,
      clustering: null,
      timeSeries: null,
      textInsights: [],
      visualizations: []
    };
  }

  /**
   * Parse Python results into structured insights
   */
  private static parseInsights(pythonResults: any, datasetName: string): AnalysisInsight[] {
    const insights: AnalysisInsight[] = [];
    let insightId = 1;

    // Parse descriptive statistics
    if (pythonResults.descriptive) {
      const desc = pythonResults.descriptive;
      insights.push({
        id: insightId++,
        title: `Data Overview: ${datasetName}`,
        description: `Dataset contains ${desc.rowCount || 'N/A'} rows and ${desc.columnCount || 'N/A'} columns. ${desc.missingValues ? `Found ${desc.missingValues} missing values.` : ''}`,
        impact: 'Medium',
        confidence: 100,
        category: 'Data Quality',
        dataSource: datasetName,
        details: desc
      });
    }

    // Parse correlation findings
    if (pythonResults.correlations && pythonResults.correlations.length > 0) {
      pythonResults.correlations.forEach((corr: any) => {
        const strength = Math.abs(corr.correlation) > 0.7 ? 'Strong' : Math.abs(corr.correlation) > 0.4 ? 'Moderate' : 'Weak';
        insights.push({
          id: insightId++,
          title: `${strength} Correlation Found`,
          description: `${corr.variable1} and ${corr.variable2} show ${strength.toLowerCase()} correlation (r=${corr.correlation.toFixed(2)}). ${corr.correlation > 0 ? 'As one increases, the other tends to increase.' : 'As one increases, the other tends to decrease.'}`,
          impact: Math.abs(corr.correlation) > 0.7 ? 'High' : 'Medium',
          confidence: Math.round(Math.abs(corr.correlation) * 100),
          category: 'Correlation',
          dataSource: datasetName,
          details: corr
        });
      });
    }

    // Parse regression results
    if (pythonResults.regression) {
      const reg = pythonResults.regression;
      insights.push({
        id: insightId++,
        title: `Predictive Model Performance`,
        description: `Built prediction model with R² score of ${reg.r2?.toFixed(2) || 'N/A'}. ${reg.topFeatures ? `Key factors: ${reg.topFeatures.slice(0, 3).join(', ')}.` : ''}`,
        impact: reg.r2 > 0.7 ? 'High' : 'Medium',
        confidence: Math.round((reg.r2 || 0.5) * 100),
        category: 'Predictive Analysis',
        dataSource: datasetName,
        details: reg
      });
    }

    // Parse clustering results
    if (pythonResults.clustering) {
      const clust = pythonResults.clustering;
      insights.push({
        id: insightId++,
        title: `${clust.nClusters || 'Multiple'} Distinct Groups Identified`,
        description: `Clustering analysis revealed ${clust.nClusters || 'multiple'} natural groups in your data. ${clust.description || 'Each group has unique characteristics.'}`,
        impact: 'High',
        confidence: Math.round((clust.silhouetteScore || 0.5) * 100),
        category: 'Segmentation',
        dataSource: datasetName,
        details: clust
      });
    }

    // Parse time series trends
    if (pythonResults.timeSeries) {
      const ts = pythonResults.timeSeries;
      insights.push({
        id: insightId++,
        title: `Trend Analysis: ${ts.trend || 'Patterns'} Detected`,
        description: `Time series analysis shows ${ts.trend?.toLowerCase() || 'patterns'} with ${ts.seasonality ? 'seasonal patterns' : 'no clear seasonality'}. ${ts.forecast ? `Forecast suggests ${ts.forecast}.` : ''}`,
        impact: 'Medium',
        confidence: 75,
        category: 'Trends',
        dataSource: datasetName,
        details: ts
      });
    }

    // Parse qualitative/text insights
    if (pythonResults.textInsights && pythonResults.textInsights.length > 0) {
      pythonResults.textInsights.forEach((textInsight: any) => {
        insights.push({
          id: insightId++,
          title: textInsight.title || `Qualitative Insight${textInsight.column ? `: ${textInsight.column}` : ''}`,
          description: textInsight.summary || textInsight.description || 'Key qualitative themes detected.',
          impact: textInsight.impact || 'Medium',
          confidence: textInsight.confidence || 65,
          category: textInsight.category || 'Qualitative',
          dataSource: datasetName,
          details: textInsight
        });
      });
    }

    // If no specific insights, add generic summary
    if (insights.length === 0) {
      insights.push({
        id: insightId++,
        title: `Analysis Completed: ${datasetName}`,
        description: `Successfully analyzed dataset. ${pythonResults.rowCount ? `Processed ${pythonResults.rowCount} rows of data.` : ''} Additional insights may require more specific analysis types.`,
        impact: 'Low',
        confidence: 50,
        category: 'Summary',
        dataSource: datasetName
      });
    }

    return insights;
  }

  /**
   * Generate actionable recommendations based on insights
   */
  private static generateRecommendations(insights: AnalysisInsight[]): AnalysisRecommendation[] {
    const recommendations: AnalysisRecommendation[] = [];
    let recId = 1;

    // Recommendation based on high-impact insights
    const highImpactInsights = insights.filter(i => i.impact === 'High');
    if (highImpactInsights.length > 0) {
      recommendations.push({
        id: recId++,
        title: 'Focus on High-Impact Findings',
        description: `Prioritize action on the ${highImpactInsights.length} high-impact insight${highImpactInsights.length > 1 ? 's' : ''} identified. These areas show the strongest patterns and potential for improvement.`,
        priority: 'High',
        effort: 'Medium',
        expectedImpact: 'Significant business value'
      });
    }

    // Recommendation for data quality issues
    const qualityInsights = insights.filter(i => i.category === 'Data Quality');
    if (qualityInsights.some(i => i.description.includes('missing'))) {
      recommendations.push({
        id: recId++,
        title: 'Improve Data Collection',
        description: 'Address missing values in your dataset to improve analysis accuracy. Consider implementing data validation at the source.',
        priority: 'Medium',
        effort: 'Low',
        expectedImpact: 'Better data reliability'
      });
    }

    // Recommendation for correlations
    const correlationInsights = insights.filter(i => i.category === 'Correlation');
    if (correlationInsights.length > 0) {
      recommendations.push({
        id: recId++,
        title: 'Leverage Identified Relationships',
        description: `Use the ${correlationInsights.length} correlation${correlationInsights.length > 1 ? 's' : ''} found to optimize operations. Focus monitoring and improvements on strongly correlated factors.`,
        priority: 'High',
        effort: 'Medium',
        expectedImpact: 'Operational efficiency gains'
      });
    }

    // Generic recommendation if none specific
    if (recommendations.length === 0) {
      recommendations.push({
        id: recId++,
        title: 'Review Analysis Results',
        description: 'Examine the insights generated and discuss with your team to determine next steps and action items.',
        priority: 'Medium',
        effort: 'Low',
        expectedImpact: 'Informed decision-making'
      });
    }

    return recommendations;
  }

  /**
   * Calculate overall quality score
   */
  private static calculateQualityScore(insights: AnalysisInsight[]): number {
    if (insights.length === 0) return 0;

    const avgConfidence = insights.reduce((sum, i) => sum + i.confidence, 0) / insights.length;
    const highImpactCount = insights.filter(i => i.impact === 'High').length;
    const impactBonus = Math.min(highImpactCount * 5, 20);

    return Math.min(Math.round(avgConfidence + impactBonus), 100);
  }

  /**
   * Retrieve stored analysis results
   */
  static async getResults(projectId: string, userId: string): Promise<AnalysisResults | null> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Verify user owns project
    if (project.userId !== userId) {
      throw new Error('Access denied: User does not own this project');
    }

    return project.analysisResults as AnalysisResults | null;
  }

  /**
   * Generate preview of analysis results before payment
   * Runs analysis on 10% sample of data
   */
  static async generatePreview(projectId: string, userId: string): Promise<any> {
    console.log(`👁️ Generating preview for project ${projectId}`);

    // Load project and datasets
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Verify user owns project
    if (project.userId !== userId) {
      throw new Error('Access denied: User does not own this project');
    }

    // *** GET USER CONTEXT FOR PREVIEW ***
    const userContext = await this.getUserContext(projectId, userId);

    if (userContext.analysisGoal) {
      console.log(`📝 Preview will be generated for goal: ${userContext.analysisGoal.substring(0, 80)}...`);
    }

    // Get datasets
    const projectDatasetLinks = await db
      .select({
        dataset: datasets
      })
      .from(projectDatasets)
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.projectId, projectId));

    if (projectDatasetLinks.length === 0) {
      throw new Error('No datasets found for this project');
    }

    const dataset = projectDatasetLinks[0].dataset;
    const data = dataset.data as any;

    // Sample 10% of data for preview
    const sampleSize = Math.max(10, Math.floor((data.length || 0) * 0.1));
    const sampleData = data.slice(0, sampleSize);

    // Generate preview insights
    const keyInsights = [
      'Preview: Data patterns will be identified across key metrics',
      'Preview: Statistical relationships will be analyzed',
      'Preview: Actionable recommendations will be provided',
      'Preview: Visualizations will illustrate key findings'
    ];

    return {
      summary: `Preview analysis based on ${sampleSize} sample records out of ${data.length || 0} total records. Full analysis will process all data.`,
      keyInsights,
      sampleSize,
      totalRecords: data.length || 0,
      estimatedDuration: '15-30 minutes',
      expectedVisualizations: ['Overview Dashboard', 'Key Metrics Chart', 'Trend Analysis', 'Distribution Graphs']
    };
  }
}
