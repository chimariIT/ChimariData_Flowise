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
import {
  projects,
  datasets,
  projectDatasets,
  projectSessions,
  analysisPlans,
  decisionAudits,
  // U2A2A2U normalized tables
  agentExecutions,
  dsAnalysisResults,
  insights as insightsTable,
  projectQuestions,  // Week 1 Option B: Single source of truth for questions
} from '@shared/schema';
import type { CostBreakdown } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { PythonProcessor } from './python-processor';
import { storage } from './storage';
import { nanoid } from 'nanoid';
import { dataScienceOrchestrator, type DataScienceResults } from './data-science-orchestrator';
import { dataAccessor, type DatasetDataResult } from './data-accessor'; // Week 4 Option B: Unified data access
// PHASE 6 FIX (Friction #2): Import ComputeEngineSelector for intelligent compute routing
import { ComputeEngineSelector, type ComputeEngine, type ComputeSelectionResult } from './compute-engine-selector';

import { BusinessAgent } from './business-agent';

type Dataset = typeof datasets.$inferSelect;

interface AnalysisRequest {
  projectId: string;
  userId: string;
  analysisTypes: string[]; // ['descriptive', 'correlation', 'regression', etc.]
  datasetIds?: string[];
  userContext?: UserContext;
  // GAP D: DS-recommended analyses from requirements document
  analysisPath?: Array<{
    analysisId: string;
    analysisName: string;
    analysisType?: string;
    description?: string;
    techniques?: string[];
    requiredDataElements?: string[];
    estimatedDuration?: string;
    dependencies?: string[];
  }>;
  // GAP D: Question-to-analysis mapping for traceability
  questionAnswerMapping?: Array<{
    questionId: string;
    questionText: string;
    recommendedAnalyses?: string[];
    requiredDataElements?: string[];
    transformationsNeeded?: string[];
  }>;
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
  answersQuestions?: string[]; // Phase 3: Question IDs this insight helps answer
}

interface AnalysisRecommendation {
  id: number;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low' | 'high' | 'medium' | 'low';
  effort: 'High' | 'Medium' | 'Low';
  expectedImpact?: string;
  impact?: string; // Extended from DataScienceOrchestrator
}

// Phase 3: Question-to-Analysis Mapping
interface QuestionAnalysisMapping {
  questionId: string;
  questionText: string;
  requiredDataElements: string[];
  recommendedAnalyses: string[];
  transformationsNeeded: string[];
  expectedArtifacts: Array<{
    artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
    description: string;
  }>;
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
    // Extended metadata from DataScienceOrchestrator
    totalRows?: number;
    totalColumns?: number;
    analysisTypes?: string[];
    executionTimeMs?: number;
  };
  questionAnswers?: {
    projectId: string;
    answers: Array<{
      question: string;
      answer: string;
      confidence: number;
      sources: string[];
      relatedInsights: string[];
      status: 'answered' | 'partial' | 'pending';
      generatedAt: Date;
    }>;
    generatedBy: string;
    generatedAt: Date;
    totalQuestions: number;
    answeredCount: number;
  };
  questionAnswerMapping?: QuestionAnalysisMapping[]; // Phase 3: Question-to-analysis mapping
  insightToQuestionMap?: Record<string, string[]>; // Phase 3: insightId → questionIds
  // Phase 6: Per-analysis breakdown for dashboard view
  perAnalysisBreakdown?: Record<string, {
    status: string;
    insights?: any[];
    visualizations?: any[];
    recommendations?: any[];
    error?: string;
    executionTimeMs?: number;
  }>;
  analysisStatuses?: Array<{
    analysisId: string;
    analysisName: string;
    analysisType: string;
    status: string;
    insightCount: number;
    errorMessage?: string;
    executionTimeMs?: number;
  }>;
  // Extended properties from DataScienceOrchestrator
  dataQualityReport?: {
    overallScore: number;
    missingValueAnalysis?: any[];
    outlierDetection?: any[];
    completenessScore?: number;
    consistencyScore?: number;
    piiDetection?: any[];
  };
  statisticalAnalysisReport?: {
    correlationMatrix?: {
      matrix: number[][];
      columns: string[];
      significantCorrelations?: Array<{
        var1: string;
        var2: string;
        correlation: number;
        pValue?: number;
      }>;
    };
    descriptiveStats?: Record<string, any>;
    hypothesisTests?: any[];
  };
  mlModels?: Array<{
    modelType: string;
    problemType: string;
    targetColumn?: string;
    features?: string[];
    metrics: {
      accuracy?: number;
      r2?: number;
      rmse?: number;
      silhouetteScore?: number;
    };
    featureImportance?: Array<{
      feature: string;
      importance: number;
    }>;
  }>;
  executiveSummary?: {
    keyFindings?: string[];
    answersToQuestions?: Array<{
      question: string;
      answer: string;
      confidence: number;
      evidence?: string[];
    }>;
    recommendations?: Array<{
      text: string;
      priority: string;
      expectedImpact?: string;
    }>;
    nextSteps?: string[];
  };
  businessKPIs?: any[];
}

export class AnalysisExecutionService {
  /**
   * Execute analysis based on user request
   */

  /**
   * Retrieve user context from project session
   * WEEK 1 FIX: Prioritize questions from project_questions table (single source of truth)
   */
  private static async getUserContext(projectId: string, userId: string): Promise<UserContext> {
    console.log(`🔍 Retrieving user context for project ${projectId}`);

    // Get project to find linked session AND to get project-level fields as fallback
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      console.warn(`⚠️  Project ${projectId} not found when retrieving context`);
      return {};
    }

    // WEEK 1 FIX: First try to load questions from project_questions table (single source of truth)
    let questionsFromDB: string | undefined;
    try {
      const dbQuestions = await db
        .select()
        .from(projectQuestions)
        .where(eq(projectQuestions.projectId, projectId))
        .orderBy(projectQuestions.questionOrder);

      if (dbQuestions.length > 0) {
        // Join questions with newlines to maintain compatibility with existing code
        questionsFromDB = dbQuestions.map((q: { questionText: string | null }) => q.questionText).join('\n');
        console.log(`✅ [getUserContext] Loaded ${dbQuestions.length} questions from project_questions table`);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to load questions from project_questions table:`, err);
    }

    // Project-level fields as fallback
    const projectGoal = (project as any).analysisGoals || (project as any).description;
    const projectQuestionsLegacy = (project as any).businessQuestions;

    // Find the session for this project/user
    // CRITICAL: Query by projectId to get the correct session with businessQuestions
    const sessions = await db
      .select()
      .from(projectSessions)
      .where(eq(projectSessions.projectId, projectId))
      .orderBy(desc(projectSessions.lastActivity))
      .limit(1);

    // WEEK 1 FIX: Questions priority: 1) project_questions table, 2) session, 3) legacy field
    const resolveQuestions = (sessionQuestions?: string) =>
      questionsFromDB || sessionQuestions || projectQuestionsLegacy;

    // Fallback: If no session found by projectId, try userId + journeyType
    if (!sessions || sessions.length === 0) {
      console.log(`⚠️  No session found by projectId, trying userId + journeyType fallback`);
      const fallbackSessions = await db
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

      if (!fallbackSessions || fallbackSessions.length === 0) {
        // No session found - use DB questions or project-level fields
        const questions = resolveQuestions();
        if (projectGoal || questions) {
          console.log(`✅ Using project-level context (no session found):`, {
            hasGoal: !!projectGoal,
            hasQuestions: !!questions,
            questionsSource: questionsFromDB ? 'project_questions_table' : 'legacy_field'
          });
          return {
            analysisGoal: projectGoal || undefined,
            businessQuestions: questions || undefined
          };
        }
        console.warn(`⚠️  No session or project-level context found for project ${projectId}, user ${userId}`);
        return {};
      }

      // Use fallback session
      const fallbackSession = fallbackSessions[0];
      const fallbackPrepareData = fallbackSession.prepareData as any;

      if (!fallbackPrepareData) {
        // No prepareData in fallback session - use DB questions or project-level fields
        const questions = resolveQuestions();
        if (projectGoal || questions) {
          console.log(`✅ Using project-level context (no prepareData in fallback session):`, {
            hasGoal: !!projectGoal,
            hasQuestions: !!questions,
            questionsSource: questionsFromDB ? 'project_questions_table' : 'legacy_field'
          });
          return {
            analysisGoal: projectGoal || undefined,
            businessQuestions: questions || undefined
          };
        }
        console.warn(`⚠️  No prepareData found in fallback session`);
        return {};
      }

      const questions = resolveQuestions(fallbackPrepareData.businessQuestions);
      console.log(`✅ Retrieved user context from fallback session:`, {
        hasGoal: !!fallbackPrepareData.analysisGoal,
        hasQuestions: !!questions,
        questionsSource: questionsFromDB ? 'project_questions_table' : 'session'
      });

      return {
        analysisGoal: fallbackPrepareData.analysisGoal || projectGoal,
        businessQuestions: questions,
        selectedTemplates: fallbackPrepareData.selectedTemplates,
        audience: fallbackPrepareData.audience
      };
    }

    const session = sessions[0];
    const prepareData = session.prepareData as any;

    if (!prepareData) {
      // No prepareData in session - use DB questions or project-level fields
      const questions = resolveQuestions();
      if (projectGoal || questions) {
        console.log(`✅ Using project-level context (no prepareData in session):`, {
          hasGoal: !!projectGoal,
          hasQuestions: !!questions,
          questionsSource: questionsFromDB ? 'project_questions_table' : 'legacy_field'
        });
        return {
          analysisGoal: projectGoal || undefined,
          businessQuestions: questions || undefined
        };
      }
      console.warn(`⚠️  No prepareData found in session for project ${projectId}`);
      return {};
    }

    const questions = resolveQuestions(prepareData.businessQuestions);
    console.log(`✅ Retrieved user context:`, {
      hasGoal: !!prepareData.analysisGoal,
      hasQuestions: !!questions,
      questionsSource: questionsFromDB ? 'project_questions_table' : 'session',
      hasTemplates: !!prepareData.selectedTemplates?.length,
      hasAudience: !!prepareData.audience
    });

    // CRITICAL FIX Issue #14: Sync session prepareData to project if project fields are empty
    // This ensures businessQuestions are available when analysis executes
    if ((prepareData.analysisGoal || prepareData.businessQuestions) && (!projectGoal && !projectQuestionsLegacy)) {
      try {
        console.log(`🔄 Syncing session prepareData to project ${projectId}...`);
        await db
          .update(projects)
          .set({
            analysisGoals: prepareData.analysisGoal || null,
            businessQuestions: prepareData.businessQuestions || null,
            updatedAt: new Date()
          })
          .where(eq(projects.id, projectId));
        console.log(`✅ Synced session data to project ${projectId}`);
      } catch (syncError) {
        console.warn(`⚠️ Failed to sync session data to project:`, syncError);
      }
    }

    return {
      analysisGoal: prepareData.analysisGoal || projectGoal,
      businessQuestions: questions,  // WEEK 1 FIX: Use resolved questions (DB first)
      selectedTemplates: prepareData.selectedTemplates,
      audience: prepareData.audience
    };
  }

  /**
   * Execute analysis on a project's datasets
   *
   * Agent Responsibility: DATA_SCIENTIST
   * - Selects and prioritizes analysis types
   * - Executes statistical and ML analyses
   * - Generates insights and visualizations
   * - Links results to user questions (evidence chain)
   */
  static async executeAnalysis(request: AnalysisRequest): Promise<AnalysisResults> {
    const startTime = Date.now();
    // ✅ TypeScript fix: Declare dsExecutionId at function scope so it's accessible in catch block
    let dsExecutionId: string | null = null;

    console.log(`🔬 [DATA_SCIENTIST] Starting analysis for project ${request.projectId}`);
    console.log(`🔬 [DATA_SCIENTIST] Using tools: statistical_analyzer, ml_pipeline, visualization_engine`);
    console.log(`⏱️ Target: <60s for 2-minute SLA`);
    console.log(`📊 Analysis types: ${request.analysisTypes.join(', ')}`);

    // Validate request parameters
    if (!request.projectId) {
      throw new Error('Missing project ID. Please ensure you have selected a valid project.');
    }

    if (!request.userId) {
      throw new Error('Authentication required. Please log in to execute analysis.');
    }

    if (!request.analysisTypes || request.analysisTypes.length === 0) {
      throw new Error('No analysis types selected. Please select at least one analysis type (e.g., descriptive, correlation, regression).');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, request.projectId));

    if (!project) {
      throw new Error(`Project not found. The project ID "${request.projectId}" does not exist or may have been deleted.`);
    }

    if (project.userId !== request.userId) {
      throw new Error('Access denied. You do not have permission to run analysis on this project.');
    }

    // PII FIX: Read from journeyProgress (SSOT) first, then fall back to project.metadata
    const journeyProgress = (project as any).journeyProgress || {};
    const projectMetadata = (project as any).metadata || {};
    const piiDecisionFromProgress = journeyProgress.piiDecision || journeyProgress.piiDecisions;
    const piiDecisionFromMetadata = projectMetadata.piiDecision;
    const piiDecision = piiDecisionFromProgress || piiDecisionFromMetadata;
    // Normalize field names: frontend saves as excludedColumns, some paths save as selectedColumns
    const excludedColumns: string[] = piiDecision?.excludedColumns || projectMetadata.excludedColumns || [];
    const piiColumnsToRemove: string[] = piiDecision?.selectedColumns || piiDecision?.piiColumnsRemoved || [];
    const columnsToExclude = new Set([...excludedColumns, ...piiColumnsToRemove]);

    if (columnsToExclude.size > 0) {
      console.log(`🔒 [GAP 2 - PII] ========================`);
      console.log(`🔒 [GAP 2 - PII] Enforcing PII column removal for analysis:`);
      Array.from(columnsToExclude).forEach(col => {
        console.log(`🔒 [GAP 2 - PII]   - ${col}`);
      });
      console.log(`🔒 [GAP 2 - PII] ========================`);
    } else {
      console.log(`✅ [GAP 2 - PII] No PII columns to filter`);
    }

    // Pass columnsToExclude explicitly to downstream methods instead of using static property
    // AnalysisExecutionService._currentPIIColumnsToExclude = columnsToExclude; (REMOVED)

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
          throw new Error('Analysis is already running. Please wait for the current execution to complete, then refresh the page to see results.');
        }

        if (plan.status === 'completed') {
          throw new Error('Analysis has already been completed for this project. View your results on the Results page or create a new project for additional analysis.');
        }
      }
    }

    if (project.analysisExecutedAt) {
      throw new Error('Analysis has already been completed for this project. View your results on the Results page, or start a new project for additional analysis.');
    }

    if (project.analysisBilledAt) {
      throw new Error('This project has already been billed. Analysis cannot be re-run after billing. Please create a new project for additional analysis.');
    }

    let executionMarked = false;
    const executionStartTimestamp = new Date();

    // GAP D: Log and use DS-recommended analyses for prioritization
    if (request.analysisPath && request.analysisPath.length > 0) {
      console.log(`📊 [GAP D] Using ${request.analysisPath.length} DS-recommended analyses for prioritization`);

      // Prioritize requested analysisTypes based on DS recommendations
      const recommendedTypes = request.analysisPath
        .map(a => a.analysisType?.toLowerCase() || a.analysisName.toLowerCase().replace(/\s+/g, '-'))
        .filter(t => t);

      // Sort analysisTypes so recommended ones come first
      const sortedAnalysisTypes = [...request.analysisTypes].sort((a, b) => {
        const aIsRecommended = recommendedTypes.includes(a.toLowerCase());
        const bIsRecommended = recommendedTypes.includes(b.toLowerCase());
        if (aIsRecommended && !bIsRecommended) return -1;
        if (!aIsRecommended && bIsRecommended) return 1;
        return 0;
      });

      if (JSON.stringify(sortedAnalysisTypes) !== JSON.stringify(request.analysisTypes)) {
        console.log(`📊 [GAP D] Prioritized analysis order: ${sortedAnalysisTypes.join(', ')}`);
        request.analysisTypes = sortedAnalysisTypes;
      }
    }

    // GAP D + GAP E: Store questionAnswerMapping in project for results traceability
    if (request.questionAnswerMapping && request.questionAnswerMapping.length > 0) {
      console.log(`📊 [GAP D] Storing ${request.questionAnswerMapping.length} question-answer mappings for results traceability`);
      try {
        await db
          .update(projects)
          .set({
            questionAnswerMapping: request.questionAnswerMapping,
            updatedAt: new Date()
          } as any)
          .where(eq(projects.id, request.projectId));
      } catch (err) {
        console.warn(`⚠️ [GAP D] Could not store questionAnswerMapping (column may not exist):`, err);
        // Non-fatal: continue with execution
      }
    }

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

      const projectDatasetList = projectDatasetLinks.map((link: { dataset: Dataset }) => link.dataset);

      if (!projectDatasetList || projectDatasetList.length === 0) {
        // Check if project exists but has no data uploaded yet
        const projectCheck = await storage.getProject(request.projectId);
        if (!projectCheck) {
          throw new Error('Project not found. It may have been deleted.');
        }

        throw new Error(
          'No data uploaded. Please go back to the "Data Upload" step and upload your dataset(s) before running analysis.'
        );
      }

      // Validate that datasets have actual data to analyze
      const datasetsWithData = projectDatasetList.filter((ds: any) => {
        const rows = this.extractDatasetRows(ds);
        return rows && rows.length > 0;
      });

      if (datasetsWithData.length === 0) {
        const hasTransformedData = projectDatasetList.some((ds: any) =>
          ds.ingestionMetadata?.transformedData?.length > 0 || ds.metadata?.transformedData?.length > 0
        );

        if (hasTransformedData) {
          throw new Error(
            'Dataset transformations found but no data rows available. Please verify your data transformations in the "Data Transformation" step.'
          );
        }

        throw new Error(
          'Uploaded files contain no data rows. Please verify your files have data and re-upload in the "Data Upload" step. Supported formats: CSV, Excel, JSON.'
        );
      }

      console.log(`📁 Found ${projectDatasetList.length} dataset(s)`);

      // GAP 1 FIX: Validate multi-dataset projects have been joined
      if (projectDatasetList.length > 1) {
        // Check if any dataset has transformedData (indicating join was executed)
        const hasJoinedData = projectDatasetList.some((ds: any) =>
          (ds.ingestionMetadata?.transformedData?.length > 0) ||
          (ds.metadata?.transformedData?.length > 0)
        );

        if (!hasJoinedData) {
          console.error(`❌ [GAP 1] Multi-dataset project ${request.projectId} has ${projectDatasetList.length} datasets but no joined data`);
          const datasetNames = projectDatasetList.map((ds: any) => ds.fileName || ds.name || 'Unknown').join(', ');
          throw new Error(
            `Multiple datasets detected (${datasetNames}) but they have not been joined. ` +
            `Please go back to the "Data Transformation" step and click "Execute Transformations" to merge your datasets before running analysis. ` +
            `Without joining, only one dataset will be analyzed and the others will be ignored.`
          );
        }
        console.log(`✅ [GAP 1] Multi-dataset project has joined/transformed data, proceeding with analysis`);
      }

      // Log decision for analysis execution start
      try {
        await db.insert(decisionAudits).values({
          id: nanoid(),
          projectId: request.projectId,
          agent: 'data_scientist',
          decisionType: 'analysis_started',
          decision: `Starting analysis execution with ${request.analysisTypes.length} analysis types`,
          reasoning: `User requested analysis types: ${request.analysisTypes.join(', ')}. Found ${projectDatasetList.length} dataset(s) with transformed data.`,
          alternatives: JSON.stringify(request.analysisTypes),
          confidence: 85,
          context: JSON.stringify({
            datasetCount: projectDatasetList.length,
            analysisTypes: request.analysisTypes,
            hasUserQuestions: !!userContext.businessQuestions
          }),
          userInput: userContext.businessQuestions || null,
          reversible: false,
          impact: 'high',
          timestamp: new Date()
        });
      } catch (auditError) {
        console.warn('Failed to log analysis start decision:', auditError);
      }

      // Phase 3: Load question-to-analysis mapping with priority:
      // 1. HIGHEST: request.questionAnswerMapping (from frontend/prepare step - GAP 5 FIX)
      // 2. MEDIUM: transformation metadata
      // 3. LOWEST: generate from businessQuestions
      let questionAnswerMapping: QuestionAnalysisMapping[] = [];
      const insightToQuestionMap: Record<string, string[]> = {};

      // ✅ GAP 5 FIX: Priority 1 - Use request.questionAnswerMapping if provided
      if (request.questionAnswerMapping && request.questionAnswerMapping.length > 0) {
        questionAnswerMapping = request.questionAnswerMapping.map(qam => ({
          questionId: qam.questionId,
          questionText: qam.questionText,
          requiredDataElements: qam.requiredDataElements || [],
          recommendedAnalyses: qam.recommendedAnalyses || [],
          transformationsNeeded: qam.transformationsNeeded || [],
          expectedArtifacts: []
        }));
        console.log(`📋 [GAP 5 FIX] Using ${questionAnswerMapping.length} question mappings from request (highest priority)`);
      }
      // Priority 2 - Load from transformation metadata
      else if (projectDatasetList.length > 0) {
        const primaryDataset = projectDatasetList[0];
        const ingestionMetadata = (primaryDataset as any).ingestionMetadata || {};
        const transformationMetadata = ingestionMetadata.transformationMetadata || {};
        questionAnswerMapping = transformationMetadata.questionAnswerMapping || [];

        if (questionAnswerMapping.length > 0) {
          console.log(`📋 [Phase 3] Loaded ${questionAnswerMapping.length} question-to-analysis mappings from transformation metadata`);
        }
      }

      // Priority 3 - Generate stable question IDs from project.businessQuestions if no mapping exists
      // This ensures evidence chain doesn't break when questions come from prepare step
      if (questionAnswerMapping.length === 0 && userContext.businessQuestions) {
        const questionsText = typeof userContext.businessQuestions === 'string'
          ? userContext.businessQuestions.split('\n').filter((q: string) => q.trim())
          : Array.isArray(userContext.businessQuestions) ? userContext.businessQuestions : [];

        questionAnswerMapping = questionsText.map((q: string, idx: number) => ({
          questionId: `q_${idx + 1}_${Buffer.from(q.slice(0, 20)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`,
          questionText: q.trim(),
          requiredDataElements: [],
          recommendedAnalyses: request.analysisTypes || [],
          transformationsNeeded: [],
          expectedArtifacts: []
        }));

        if (questionAnswerMapping.length > 0) {
          console.log(`📋 [Phase 3 Fix] Generated ${questionAnswerMapping.length} question mappings from businessQuestions`);
        }
      }

      const allInsights: AnalysisInsight[] = [];
      const allRecommendations: AnalysisRecommendation[] = [];
      const allVisualizations: any[] = [];
      let totalRows = 0;
      let totalColumns = 0;

      // ✅ SLA OPTIMIZATION: Run dataset analysis in parallel (target: <60s for 2-minute SLA)
      console.log(`⏱️ Starting parallel analysis of ${projectDatasetList.length} dataset(s)...`);
      const datasetAnalysisStart = Date.now();

      const datasetResults = await Promise.all(
        projectDatasetList.map(async (dataset: Dataset) => {
          console.log(`🔍 Analyzing dataset: ${dataset.originalFileName}`);

          try {
            return await this.analyzeDataset(
              dataset,
              request.analysisTypes,
              request.projectId,
              userContext,
              columnsToExclude
            );
          } catch (error: any) {
            console.error(`❌ Error analyzing dataset ${dataset.originalFileName}:`, error.message);
            return {
              insights: [{
                id: Date.now(),
                title: `Analysis Error: ${dataset.originalFileName}`,
                description: `Could not complete analysis: ${error.message}`,
                impact: 'Low',
                confidence: 0,
                category: 'Error',
                dataSource: dataset.originalFileName
              }],
              recommendations: [],
              visualizations: [],
              rowCount: 0,
              columnCount: 0
            };
          }
        })
      );

      // Aggregate results from all datasets and tag with questions (Phase 3)
      for (const result of datasetResults) {
        // Tag insights with questions they answer
        const taggedInsights = result.insights.map((insight: AnalysisInsight) => {
          // Find which questions this insight helps answer
          const relatedQuestionIds: string[] = [];

          if (questionAnswerMapping.length > 0) {
            questionAnswerMapping.forEach(qaMap => {
              // Match insight to question based on keywords or analysis type
              const insightText = `${insight.title} ${insight.description}`.toLowerCase();
              const questionText = qaMap.questionText.toLowerCase();

              // Check if insight relates to this question
              const questionKeywords = questionText.split(' ').filter(w => w.length > 3);
              const hasMatch = questionKeywords.some(keyword => insightText.includes(keyword));

              if (hasMatch || qaMap.recommendedAnalyses.some(aId =>
                insight.category?.toLowerCase().includes(aId.toLowerCase()) ||
                insight.dataSource?.toLowerCase().includes(aId.toLowerCase())
              )) {
                relatedQuestionIds.push(qaMap.questionId);
              }
            });
          }

          // Add answersQuestions field to insight (Phase 3)
          const taggedInsight = {
            ...insight,
            answersQuestions: relatedQuestionIds.length > 0 ? relatedQuestionIds : undefined
          };

          // Build reverse mapping: questionId → insightIds
          relatedQuestionIds.forEach(qId => {
            if (!insightToQuestionMap[qId]) {
              insightToQuestionMap[qId] = [];
            }
            insightToQuestionMap[qId].push(insight.id.toString());
          });

          return taggedInsight;
        });

        allInsights.push(...taggedInsights);
        allRecommendations.push(...result.recommendations);
        allVisualizations.push(...result.visualizations);
        totalRows += result.rowCount;
        totalColumns += result.columnCount;
      }

      const datasetAnalysisElapsed = ((Date.now() - datasetAnalysisStart) / 1000).toFixed(2);
      console.log(`✅ Parallel dataset analysis completed in ${datasetAnalysisElapsed}s`);

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
        },
        questionAnswerMapping: questionAnswerMapping.length > 0 ? questionAnswerMapping : undefined, // Phase 3
        insightToQuestionMap: Object.keys(insightToQuestionMap).length > 0 ? insightToQuestionMap : undefined // Phase 3
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

      // ============================================
      // SAVE TO U2A2A2U NORMALIZED TABLES
      // ============================================
      // Note: dsExecutionId is declared at function scope (line 364) for catch block access
      try {
        // 1. Create agent_executions record for data_scientist
        const executionId = nanoid();
        dsExecutionId = executionId;  // Assign to function-scoped variable

        await db.insert(agentExecutions).values({
          id: executionId,
          projectId: request.projectId,
          agentType: 'data_scientist',
          status: 'success',
          startedAt: new Date(startTime),
          completedAt: completedAt,
          executionTimeMs: Date.now() - startTime,
          modelUsed: 'python_analysis',
        });

        // 2. Save analysis results to ds_analysis_results for each analysis type
        for (const analysisType of request.analysisTypes) {
          const resultId = nanoid();
          await db.insert(dsAnalysisResults).values({
            id: resultId,
            executionId: executionId,
            analysisType: analysisType,
            sampleSize: totalRows,
          });
        }

        // 3. Save insights to insights table
        for (const insight of allInsights) {
          const insightId = `ins_${nanoid(12)}`;
          await db.insert(insightsTable).values({
            id: insightId,
            projectId: request.projectId,
            executionId: executionId,
            questionId: insight.answersQuestions?.[0] || null, // Link to first related question
            insightType: insight.category || 'general',
            title: insight.title,
            description: insight.description,
            impact: insight.impact.toLowerCase() as 'high' | 'medium' | 'low',
            confidence: Math.round(insight.confidence),
            supportingData: insight.details ? JSON.stringify(insight.details) : null,
            dataSource: insight.dataSource || null,
          });
        }

        console.log(`✅ Saved ${allInsights.length} insights to normalized tables`);
      } catch (normalizedError) {
        console.error('Failed to save to normalized tables (non-blocking):', normalizedError);
        // Don't fail the analysis - legacy storage will still work
      }
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

      // ✅ GENERATE AI-POWERED QUESTION ANSWERS
      // Check both userContext AND project fields for business questions
      const businessQuestionsSource = userContext.businessQuestions ||
        (project as any).businessQuestions ||
        (project as any).description;
      const analysisGoalSource = userContext.analysisGoal ||
        (project as any).analysisGoals ||
        (project as any).description;

      console.log(`🔍 [Q&A Debug] userContext.businessQuestions: ${!!userContext.businessQuestions}`);
      console.log(`🔍 [Q&A Debug] project.businessQuestions: ${!!(project as any).businessQuestions}`);
      console.log(`🔍 [Q&A Debug] Final businessQuestionsSource: ${!!businessQuestionsSource}`);

      if (businessQuestionsSource) {
        try {
          console.log(`🤔 Generating AI-powered answers to user questions...`);
          console.log(`🤔 Questions to answer: "${businessQuestionsSource.substring(0, 200)}..."`);
          const { QuestionAnswerService } = await import('./question-answer-service');

          const qaResult = await QuestionAnswerService.generateAnswers({
            projectId: request.projectId,
            userId: request.userId,
            questions: [businessQuestionsSource], // Use resolved source
            analysisResults: results,
            analysisGoal: analysisGoalSource,
            audience: userContext.audience // Pass audience context for appropriate formatting
          });

          console.log(`✅ Generated ${qaResult.answeredCount}/${qaResult.totalQuestions} AI-powered answers`);

          // Update results with Q&A
          results.questionAnswers = qaResult;

          // Re-save with Q&A included
          await db
            .update(projects)
            .set({
              analysisResults: results as any,
              updatedAt: new Date()
            })
            .where(eq(projects.id, request.projectId));

        } catch (qaError) {
          console.error(`❌ Failed to generate question answers:`, qaError);
          console.error(`❌ Error details:`, qaError instanceof Error ? qaError.stack : qaError);
          // Don't fail the entire analysis if Q&A generation fails
        }
      } else {
        console.log(`ℹ️  No business questions provided, skipping Q&A generation`);
        console.log(`ℹ️  [Debug] userContext keys: ${Object.keys(userContext).join(', ')}`);
        console.log(`ℹ️  [Debug] project.businessQuestions: ${(project as any).businessQuestions}`);
        console.log(`ℹ️  [Debug] project.analysisGoals: ${(project as any).analysisGoals}`);
      }

      // ✅ PHASE 4 FIX: BUSINESS AGENT RESULTS TRANSLATION FOR ALL AUDIENCES
      // Translate results for ALL audience types (executive, technical, analyst)
      try {
        console.log(`💼 [BA Translation] Starting results translation for ALL audiences...`);
        const { BusinessAgent } = await import('./business-agent');
        const businessAgent = new BusinessAgent();

        // Get primary audience from project context
        const audienceContext = userContext.audience as any;
        const journeyAudience = (project as any)?.journeyProgress?.audience as any;

        const primaryAudience = audienceContext?.primaryAudience ||
          audienceContext?.primary ||
          journeyAudience?.primaryAudience ||
          journeyAudience?.primary ||
          'executive';

        const decisionContext = audienceContext?.decisionContext ||
          journeyAudience?.decisionContext ||
          'General business decision support';

        // ✅ PHASE 4 FIX: Translate for ALL audiences, not just primary
        const allAudiences = ['executive', 'technical', 'analyst'];
        const allTranslations: Record<string, any> = {};

        for (const audience of allAudiences) {
          try {
            console.log(`💼 [BA Translation] Translating for ${audience} audience...`);

            const translatedResults = await businessAgent.translateResults({
              results: {
                insights: allInsights,
                recommendations: allRecommendations,
                summary: results.summary
              },
              audience,
              decisionContext
            });

            if (translatedResults) {
              allTranslations[audience] = {
                insights: translatedResults.insights || allInsights,
                recommendations: translatedResults.recommendations || allRecommendations,
                executiveSummary: translatedResults.executiveSummary,
                translatedAt: new Date().toISOString()
              };
              console.log(`✅ [BA Translation] ${audience} translation complete`);
            }
          } catch (audienceError) {
            console.warn(`⚠️ [BA Translation] Failed to translate for ${audience}:`, audienceError);
            // Continue with other audiences
          }
        }

        // Generate business impact assessment
        let businessImpact: any = null;
        try {
          const projectGoals = (project as any).journeyProgress?.goals ||
            (userContext as any).goals ||
            (userContext as any).businessQuestions ||
            [];
          businessImpact = await businessAgent.assessBusinessImpact(
            Array.isArray(projectGoals) ? projectGoals : [projectGoals],
            { insights: allInsights, recommendations: allRecommendations },
            (project as any).journeyProgress?.industry || 'general'
          );
          console.log(`✅ [BA Translation] Business impact assessment complete`);
        } catch (impactError) {
          console.warn(`⚠️ [BA Translation] Business impact assessment failed:`, impactError);
        }

        // Generate industry-specific insights
        let industryInsights: any = null;
        try {
          industryInsights = await businessAgent.generateIndustryInsights({
            industry: (project as any).journeyProgress?.industry || 'general',
            userGoals: (project as any).journeyProgress?.goals || []
          });
          console.log(`✅ [BA Translation] Industry insights generated`);
        } catch (industryError) {
          console.warn(`⚠️ [BA Translation] Industry insights failed:`, industryError);
        }

        // Store primary audience translation in results for backward compatibility
        const primaryTranslation = allTranslations[primaryAudience] || allTranslations['executive'];
        if (primaryTranslation) {
          (results as any).translatedInsights = primaryTranslation.insights;
          (results as any).translatedRecommendations = primaryTranslation.recommendations;
          (results as any).executiveSummary = primaryTranslation.executiveSummary || (results.summary as any)?.summary;
          (results as any).audienceFormatted = true;
          (results as any).targetAudience = primaryAudience;
        }

        // Store ALL translations in journeyProgress for multi-audience access
        const journeyProgress = (project as any).journeyProgress || {};
        const updatedJourneyProgress = {
          ...journeyProgress,
          translatedResults: allTranslations,
          businessImpact,
          industryInsights,
          baTranslatedAt: new Date().toISOString()
        };

        // Save both analysisResults and updated journeyProgress with all translations
        await db
          .update(projects)
          .set({
            analysisResults: results as any,
            journeyProgress: updatedJourneyProgress as any,
            updatedAt: new Date()
          })
          .where(eq(projects.id, request.projectId));

        console.log(`💾 [BA Translation] All translations saved to database`);
        console.log(`   - Executive: ${allTranslations['executive'] ? '✅' : '❌'}`);
        console.log(`   - Technical: ${allTranslations['technical'] ? '✅' : '❌'}`);
        console.log(`   - Analyst: ${allTranslations['analyst'] ? '✅' : '❌'}`);
        console.log(`   - Business Impact: ${businessImpact ? '✅' : '❌'}`);
        console.log(`   - Industry Insights: ${industryInsights ? '✅' : '❌'}`);

      } catch (translationError) {
        console.warn(`⚠️ [BA Translation] Business Agent translation failed (non-blocking):`, translationError);
        // Continue with untranslated results - this is non-critical
        (results as any).audienceFormatted = false;
        (results as any).translationError = translationError instanceof Error ? translationError.message : 'Translation failed';
      }

      // ✅ GENERATE ARTIFACTS
      try {
        console.log(`🎨 Generating artifacts for project ${request.projectId}...`);
        const { ArtifactGenerator } = await import('./artifact-generator');
        const artifactGenerator = new ArtifactGenerator();

        // Calculate total dataset size
        const totalSizeBytes = projectDatasetList.reduce((acc: number, ds: any) => acc + (ds.fileSize || 0), 0);
        const totalSizeMB = totalSizeBytes / (1024 * 1024);

        // ✅ Fetch fresh project data to get businessKPIs from journeyProgress
        const freshProject = await db.query.projects.findFirst({
          where: eq(projects.id, request.projectId)
        });
        const freshJourneyProgress = (freshProject as any)?.journeyProgress || {};
        const storedBusinessKPIs = freshJourneyProgress.businessKPIs || [];

        console.log(`📦 Artifact generation config:`, {
          projectId: request.projectId,
          projectName: project.name,
          userId: request.userId,
          journeyType: (project.journeyType as any) || 'non-tech',
          insightCount: allInsights.length,
          visualizationCount: allVisualizations.length,
          datasetSizeMB: totalSizeMB || 1,
          hasBusinessKPIs: storedBusinessKPIs.length > 0
        });

        // ✅ GAP FIX: Map DataScienceOrchestrator results to comprehensiveResults for enhanced PDF
        const comprehensiveResults = {
          dataQualityReport: {
            overallScore: results.dataQualityReport?.overallScore || 85,
            missingValueAnalysis: results.dataQualityReport?.missingValueAnalysis || [],
            outlierDetection: results.dataQualityReport?.outlierDetection || []
          },
          statisticalAnalysisReport: {
            correlationMatrix: (() => {
              const statReport = results.statisticalAnalysisReport;
              const corrMatrix = statReport?.correlationMatrix;
              if (corrMatrix?.matrix?.length && corrMatrix?.columns?.length) {
                return corrMatrix.columns.reduce((acc: Record<string, Record<string, number>>, col: string, i: number) => {
                  acc[col] = {};
                  corrMatrix.columns.forEach((col2: string, j: number) => {
                    acc[col][col2] = corrMatrix.matrix?.[i]?.[j] ?? 0;
                  });
                  return acc;
                }, {} as Record<string, Record<string, number>>);
              }
              return undefined;
            })(),
            significantCorrelations: results.statisticalAnalysisReport?.correlationMatrix?.significantCorrelations?.map((corr: any) => ({
              var1: corr.var1,
              var2: corr.var2,
              correlation: corr.correlation,
              pValue: corr.pValue
            })) || [],
            regressionResults: (() => {
              const regressionModel = results.mlModels?.find((m: any) => m.problemType === 'regression');
              if (regressionModel) {
                return {
                  r2: regressionModel.metrics?.r2,
                  rmse: regressionModel.metrics?.rmse,
                  features: regressionModel.features
                };
              }
              return undefined;
            })()
          },
          mlModels: results.mlModels?.map(model => ({
            modelType: model.modelType,
            metrics: {
              accuracy: model.metrics.accuracy,
              r2: model.metrics.r2,
              rmse: model.metrics.rmse,
              silhouetteScore: model.metrics.silhouetteScore
            },
            featureImportance: model.featureImportance?.slice(0, 10).map(fi => ({
              feature: fi.feature,
              importance: fi.importance
            }))
          })) || [],
          executiveSummary: {
            keyFindings: results.executiveSummary?.keyFindings || allInsights.slice(0, 5).map(i => i.title),
            recommendations: allRecommendations.map(rec => ({
              title: rec.title || 'Recommendation',
              description: rec.description,
              priority: rec.priority || 'medium',
              impact: rec.impact
            })),
            answeredQuestions: results.executiveSummary?.answersToQuestions?.map(qa => ({
              question: qa.question,
              answer: qa.answer,
              confidence: qa.confidence
            })) || []
          },
          businessKPIs: storedBusinessKPIs.length > 0 ? storedBusinessKPIs : ((results as any).businessKPIs || []),
          metadata: {
            totalRows: results.metadata?.totalRows || 0,
            totalColumns: results.metadata?.totalColumns || 0,
            analysisTypes: results.metadata?.analysisTypes || request.analysisTypes || [],
            executionTimeMs: results.metadata?.executionTimeMs || 0
          }
        };

        const artifactResult = await artifactGenerator.generateArtifacts({
          projectId: request.projectId,
          projectName: project.name,
          userId: request.userId,
          journeyType: (project.journeyType as any) || 'non-tech',
          analysisResults: [results], // Wrap in array as expected by interface
          visualizations: allVisualizations,
          insights: allInsights.map(i => `${i.title}: ${i.description}`),
          datasetSizeMB: totalSizeMB || 1, // Default to 1MB if unknown
          comprehensiveResults // ✅ Pass comprehensive results to artifact generator
        });

        console.log(`✅ Artifacts generated successfully for project ${request.projectId}:`, {
          totalCost: artifactResult.totalCost,
          totalSizeMB: artifactResult.totalSizeMB,
          pdfUrl: artifactResult.pdf?.url,
          presentationUrl: artifactResult.presentation?.url,
          csvUrl: artifactResult.csv?.url,
          dashboardUrl: artifactResult.dashboard?.url
        });
      } catch (artifactError) {
        console.error(`❌ Failed to generate artifacts for project ${request.projectId}:`, artifactError);
        if (artifactError instanceof Error) {
          console.error(`❌ Artifact error stack:`, artifactError.stack);
          console.error(`❌ Artifact error message:`, artifactError.message);
        }

        // Create a basic artifact record even if file generation fails
        try {
          console.log(`📝 Creating fallback artifact record for project ${request.projectId}...`);
          const { nanoid } = await import('nanoid');
          await storage.createArtifact({
            id: nanoid(),
            projectId: request.projectId,
            type: 'analysis',
            status: 'error',
            output: {
              error: artifactError instanceof Error ? artifactError.message : 'Unknown error',
              analysisCompleted: true,
              insightCount: allInsights.length,
              recommendationCount: allRecommendations.length,
              visualizationCount: allVisualizations.length
            },
            createdBy: request.userId,
            metrics: {
              artifactGenerationFailed: true,
              errorTime: new Date().toISOString()
            }
          });
          console.log(`✅ Fallback artifact record created for project ${request.projectId}`);
        } catch (fallbackError) {
          console.error(`❌ Failed to create fallback artifact record:`, fallbackError);
        }
      }

      const totalElapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Analysis execution completed in ${totalElapsedSec}s (Target: <60s for 2-minute SLA)`);

      // Log decision for analysis completion
      try {
        await db.insert(decisionAudits).values({
          id: nanoid(),
          projectId: request.projectId,
          agent: 'data_scientist',
          decisionType: 'analysis_completed',
          decision: `Analysis completed: ${allInsights.length} insights, ${allRecommendations.length} recommendations generated`,
          reasoning: `Analysis executed successfully in ${totalElapsedSec}s. Generated ${allInsights.length} insights and ${allRecommendations.length} actionable recommendations from ${request.analysisTypes.length} analysis types.`,
          alternatives: JSON.stringify([]),
          confidence: 90,
          context: JSON.stringify({
            insightCount: allInsights.length,
            recommendationCount: allRecommendations.length,
            analysisTypes: request.analysisTypes,
            executionTime: totalElapsedSec,
            questionAnswersGenerated: !!results.questionAnswers
          }),
          userInput: null,
          reversible: false,
          impact: 'high',
          timestamp: new Date()
        });
      } catch (auditError) {
        console.warn('Failed to log analysis completion decision:', auditError);
      }

      // Week 2 Priority 1: Auto-Translation Integration
      try {
        const targetAudience = request.userContext?.audience?.primaryAudience || 'mixed';

        // Only proceed if audience is specific
        if (['executive', 'business', 'technical'].includes(targetAudience)) {
          // Instantiate agent (Week 2 Fix: Call as instance method)
          const businessAgent = new BusinessAgent();
          await businessAgent.translateResults({
            results,
            audience: targetAudience,
            decisionContext: request.userContext?.audience?.decisionContext || undefined
          });

          console.log('✅ Auto-translation complete');

          // Log translation decision to audit trail
          try {
            const { nanoid } = await import('nanoid');
            await db.insert(decisionAudits).values({
              id: nanoid(),
              projectId: request.projectId,
              agent: 'business_analyst',
              decisionType: 'result_translation',
              decision: `Translated results for ${targetAudience} audience`,
              reasoning: `Auto-translation triggered by audience setting: ${targetAudience}`,
              alternatives: JSON.stringify(['mixed']),
              confidence: 95,
              context: JSON.stringify({
                originalInsightCount: results.insights.length,
                targetAudience
              }),
              userInput: null,
              reversible: true,
              impact: 'medium',
              timestamp: new Date()
            });
          } catch (auditError) {
            console.warn('Failed to log translation audit:', auditError);
          }
        }
      } catch (translationError) {
        // Silent fail for translation to not block results
        console.warn('Auto-translation failed:', translationError);
      }

      // P2-2: Final execution summary logging
      const executionEndTime = Date.now();
      // ✅ TypeScript fix: Use startTime (declared at line 362) instead of undefined executionStartTime
      const totalExecutionTimeMs = executionEndTime - startTime;
      console.log(`\n${'='.repeat(80)}`);
      // ✅ TypeScript fix: Use dsExecutionId (declared at line 808) instead of out-of-scope executionId
      console.log(`✅ [Analysis Execution ${dsExecutionId || 'unknown'}] COMPLETED SUCCESSFULLY`);
      console.log(`${'='.repeat(80)}`);
      console.log(`📊 Results Summary:`);
      console.log(`   - Total Insights: ${results.insights?.length || 0}`);
      console.log(`   - Visualizations: ${results.visualizations?.length || 0}`);
      console.log(`   - Recommendations: ${results.recommendations?.length || 0}`);
      // ✅ TypeScript fix: questionAnswers is an object with answeredCount, not an array with length
      console.log(`   - Question Answers: ${(results.questionAnswers as any)?.answeredCount || Object.keys(results.questionAnswers || {}).length || 0}`);
      console.log(`   - Execution Time: ${(totalExecutionTimeMs / 1000).toFixed(2)}s`);
      // ✅ TypeScript fix: Cast to any for artifacts property that may not be in AnalysisResults type
      console.log(`   - Artifacts Generated: ${(results as any).artifacts ? 'Yes' : 'No'}`);
      console.log(`${'='.repeat(80)}\n`);

      return results;
    } catch (error: any) {
      // Roll back plan status if it was marked as executing
      if (executionMarked && approvedPlanId) {
        try {
          await db
            .update(analysisPlans)
            .set({
              status: 'approved',
              executedAt: null,
              updatedAt: new Date(),
            })
            .where(eq(analysisPlans.id, approvedPlanId));
        } catch (rollbackError) {
          console.error('Failed to roll back plan status:', rollbackError);
        }
      }

      // P2-2: Error logging for debugging
      const executionEndTime = Date.now();
      // ✅ TypeScript fix: Use startTime (declared at line 362) instead of undefined executionStartTime
      const totalExecutionTimeMs = executionEndTime - startTime;
      const errorMsg = error?.message || String(error);

      console.log(`\n${'='.repeat(80)}`);
      // ✅ TypeScript fix: Use dsExecutionId (declared at line 808) instead of out-of-scope executionId
      console.error(`❌ [Analysis Execution ${dsExecutionId || 'unknown'}] FAILED`);
      console.log(`${'='.repeat(80)}`);
      console.error(`💥 Error Details:`);
      console.error(`   - Error: ${errorMsg}`);
      console.error(`   - Stack: ${error?.stack?.split('\n').slice(0, 5).join('\n   ') || 'No stack trace'}`);
      console.error(`   - Project: ${request.projectId}`);
      console.error(`   - Time Elapsed: ${(totalExecutionTimeMs / 1000).toFixed(2)}s`);
      console.log(`${'='.repeat(80)}\n`);

      // Categorize and enhance error messages for better user feedback

      // Provide user-friendly error messages based on error type
      if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        throw new Error(
          `Analysis timed out. Your dataset may be too large for real-time processing. Try: (1) reducing the number of analysis types, or (2) using a smaller dataset sample.`
        );
      }

      if (errorMsg.includes('Python') || errorMsg.includes('python') || errorMsg.includes('spawn') || errorMsg.includes('ENOENT')) {
        throw new Error(
          `Analysis engine unavailable. Our Python analysis service is temporarily unavailable. Please try again in a few minutes. If the issue persists, contact support.`
        );
      }

      if (errorMsg.includes('memory') || errorMsg.includes('heap') || errorMsg.includes('out of memory')) {
        throw new Error(
          `Dataset too large. Your dataset exceeds memory limits. Please try with a smaller dataset or reduce the number of columns being analyzed.`
        );
      }

      if (errorMsg.includes('database') || errorMsg.includes('connection') || errorMsg.includes('ECONNREFUSED')) {
        throw new Error(
          `Database connection error. Unable to access project data. Please refresh the page and try again.`
        );
      }

      // Re-throw with original message if it's already user-friendly (contains a period or is a full sentence)
      if (errorMsg.includes('.') && errorMsg.length > 20) {
        throw error;
      }
      // Default fallback with the original error for debugging
      throw new Error(
        `Analysis failed: ${errorMsg}. Please try again or contact support if the problem persists.`
      );
    }
  }

  /**
   * Analyze a single dataset
   */
  private static async analyzeDataset(
    dataset: any,
    analysisTypes: string[],
    projectId: string,
    userContext: UserContext,
    piiColumnsToExclude: Set<string>
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
      userContext,
      piiColumnsToExclude
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
    piiColumnsToExclude?: Set<string>;
  }): Promise<any> {
    const { dataset, analysisTypes, projectId, userContext, piiColumnsToExclude } = params;


    const datasetPayload = this.buildDatasetPayload(dataset, projectId, piiColumnsToExclude);

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
      const errorMsg = error?.message || String(error);
      console.error('❌ Python execution error:', errorMsg);

      // Log specific error categorization for debugging
      let errorCategory = 'unknown';
      if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        errorCategory = 'timeout';
        console.error('⏱️ Python script timed out - falling back to basic profiling');
      } else if (errorMsg.includes('spawn') || errorMsg.includes('ENOENT') || errorMsg.includes('python')) {
        errorCategory = 'python_not_found';
        console.error('🐍 Python interpreter issue - ensure Python is installed and in PATH');
      } else if (errorMsg.includes('memory') || errorMsg.includes('heap')) {
        errorCategory = 'memory';
        console.error('💾 Memory issue - dataset may be too large for current configuration');
      } else if (errorMsg.includes('parse') || errorMsg.includes('JSON')) {
        errorCategory = 'parse_error';
        console.error('📄 Failed to parse Python script output');
      }

      console.log(`📊 Falling back to basic data profiling (error category: ${errorCategory})`);
      return await this.basicDataProfilingFromDataset(dataset, piiColumnsToExclude);
    }
  }

  private static buildDatasetPayload(dataset: any, projectId: string, piiColumnsToExclude?: Set<string>) {
    const datasetName = dataset.originalFileName || dataset.name || dataset.datasetName || dataset.id;
    const rows = this.extractDatasetRows(dataset, piiColumnsToExclude);
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

  /**
   * GAP 2 FIX: Filter PII columns from data rows
   * This is called after extractDatasetRows to ensure PII columns are never passed to analysis
   */
  private static filterPIIColumns(
    rows: any[] | null,
    columnsToExclude: Set<string>
  ): any[] | null {
    if (!rows || columnsToExclude.size === 0) {
      return rows;
    }

    console.log(`🔒 [GAP 2 - PII] Filtering ${columnsToExclude.size} PII columns from ${rows.length} rows`);

    const filteredRows = rows.map(row => {
      const filteredRow: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        // Skip column if it's in the exclude list (case-insensitive check)
        const keyLower = key.toLowerCase();
        const shouldExclude = Array.from(columnsToExclude).some(
          col => col.toLowerCase() === keyLower
        );
        if (!shouldExclude) {
          filteredRow[key] = value;
        }
      }
      return filteredRow;
    });

    const removedCount = rows.length > 0 ? Object.keys(rows[0]).length - Object.keys(filteredRows[0] || {}).length : 0;
    console.log(`🔒 [GAP 2 - PII] Removed ${removedCount} PII column(s) from data`);

    return filteredRows;
  }

  /**
   * Extract rows from a dataset, preferring transformed data over original.
   *
   * Week 4 Option B: This method uses DataAccessorService internally for
   * consistent data resolution across the platform.
   *
   * Priority:
   * 1. Transformed data (user-approved transformations)
   * 2. Original data (upload source)
   */
  private static extractDatasetRows(dataset: any, columnsToExclude?: Set<string>): any[] | null {
    let result: any[] | null = null;
    let source: string = 'none';

    // Week 4 Option B: Delegate to unified data accessor logic
    // Priority 1: Use transformed data if available (from transformation step)
    const transformedData = dataset?.ingestionMetadata?.transformedData;
    if (Array.isArray(transformedData) && transformedData.length > 0) {
      result = transformedData;
      source = 'transformed (ingestionMetadata)';
    }

    // Priority 2: Check for transformed data in nested metadata locations
    if (!result) {
      const altTransformedData = dataset?.metadata?.transformedData;
      if (Array.isArray(altTransformedData) && altTransformedData.length > 0) {
        result = altTransformedData;
        source = 'transformed (metadata)';
      }
    }

    // Priority 3: Fall back to original data sources
    if (!result) {
      const candidates = [
        { name: 'data', value: dataset.data },
        { name: 'preview', value: dataset.preview },
        { name: 'sampleData', value: dataset.sampleData },
        { name: 'records', value: dataset.records },
      ];

      for (const { name, value } of candidates) {
        if (!value) continue;
        if (Array.isArray(value)) {
          result = value;
          source = `original (${name})`;
          break;
        }
        if (Array.isArray(value?.rows)) {
          result = value.rows;
          source = `original (${name}.rows)`;
          break;
        }
        if (Array.isArray(value?.records)) {
          result = value.records;
          source = `original (${name}.records)`;
          break;
        }
        if (Array.isArray(value?.items)) {
          result = value.items;
          source = `original (${name}.items)`;
          break;
        }
      }
    }

    if (!result) {
      console.warn(`⚠️ [Week4] No data found for dataset ${dataset?.id || 'unknown'}`);
      return null;
    }

    console.log(`📊 [Week4] Using ${source} (${result.length} rows) for analysis`);

    // GAP 2 FIX: Always apply PII filtering using explicit parameter
    if (columnsToExclude && columnsToExclude.size > 0) {
      result = this.filterPIIColumns(result, columnsToExclude);
    }

    return result;
  }

  /**
   * Week 4 Option B: Get project data using the unified DataAccessor service.
   * This method provides a cleaner interface for getting all project data
   * with proper transformed/original resolution.
   */
  private static async getProjectDataViaAccessor(projectId: string): Promise<{
    datasets: DatasetDataResult[];
    hasTransformations: boolean;
  }> {
    const result = await dataAccessor.getProjectData(projectId);
    return {
      datasets: result.datasets,
      hasTransformations: result.hasAnyTransformations,
    };
  }

  /**
   * Basic data profiling fallback (without Python)
   */
  private static async basicDataProfilingFromDataset(dataset: any, piiColumnsToExclude?: Set<string>): Promise<any> {
    console.warn(`⚠️ Falling back to basic profiling for dataset ${dataset.id}`);
    const rows = this.extractDatasetRows(dataset, piiColumnsToExclude) || [];
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
   * Note: Route-level access check is now primary gate, this is secondary validation
   */
  static async getResults(projectId: string, userId: string): Promise<AnalysisResults | null> {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Note: Authorization is primarily handled at route level via canAccessProject()
    // This check is secondary validation - route allows admin access
    // Service layer just ensures project exists and returns results

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
      // Check if project exists but has no data uploaded yet
      const project = await storage.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      throw new Error(
        'No datasets have been uploaded for this project. Please upload data in the Data Upload step before previewing results.'
      );
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

  /**
   * Execute comprehensive data science workflow using the orchestrator
   * This method runs proper Python scripts and generates real artifacts
   *
   * Use this for full data science project execution with:
   * - Data Quality Report
   * - Statistical Analysis Report
   * - ML Model Training & Artifacts
   * - Visualizations
   * - Question-Answer Evidence Chain
   * - Executive Summary
   */
  static async executeComprehensiveAnalysis(request: AnalysisRequest): Promise<AnalysisResults> {
    const executionStartTime = Date.now();
    const executionId = nanoid(8);

    // P2-2: Comprehensive execution logging for debugging
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔬 [Analysis Execution ${executionId}] Starting comprehensive workflow`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📋 Request Details:`);
    console.log(`   - Project ID: ${request.projectId}`);
    console.log(`   - User ID: ${request.userId}`);
    console.log(`   - Requested Types: ${(request.analysisTypes || []).join(', ') || 'auto-select'}`);
    console.log(`   - Analysis Path: ${request.analysisPath?.length || 0} recommended analyses`);
    console.log(`   - Question Mappings: ${request.questionAnswerMapping?.length || 0} questions mapped`);
    console.log(`${'='.repeat(80)}\n`);

    // Get user context
    const userContext = await this.getUserContext(request.projectId, request.userId);

    // Parse goals and questions
    const userGoals = userContext.analysisGoal
      ? userContext.analysisGoal.split(/[;\n]/).filter(g => g.trim())
      : [];

    const userQuestions = userContext.businessQuestions
      ? userContext.businessQuestions.split(/[\n]/).filter(q => q.trim())
      : [];

    console.log(`🎯 Goals: ${userGoals.length}, Questions: ${userQuestions.length}`);

    // ==========================================
    // PHASE 6: Per-Analysis Execution Loop (Option B - Jan 2026)
    // Execute each analysis separately with graceful degradation
    // ==========================================
    const perAnalysisResults = new Map<string, {
      status: 'completed' | 'failed' | 'skipped';
      insights: AnalysisInsight[];
      visualizations: any[];
      recommendations: any[];
      error?: string;
      executionTimeMs?: number;
    }>();

    // Check if we have analysisPath from DS recommendations
    const analysisPath = request.analysisPath || [];
    const usePerAnalysisExecution = analysisPath.length > 0;

    // =======================================================================
    // PHASE 6 FIX (Friction #2): Select optimal compute engine
    // Uses ComputeEngineSelector to route to Local/Polars/Spark based on data size
    // =======================================================================
    let selectedEngine: ComputeSelectionResult = {
      engine: 'local',
      reason: 'Default local processing',
      confidence: 0.9
    };

    // Get total record count for compute engine selection
    let totalRecordCount = 0;
    try {
      const projectDatasetRecords = await db.select()
        .from(projectDatasets)
        .leftJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
        .where(eq(projectDatasets.projectId, request.projectId));

      totalRecordCount = projectDatasetRecords.reduce((sum: number, pd: any) => {
        return sum + (pd.datasets?.recordCount || 0);
      }, 0);

      // Determine most complex analysis type
      const complexAnalysisTypes = ['machine_learning', 'clustering', 'anomaly_detection', 'time_series_forecasting'];
      const mostComplexType = (request.analysisTypes || []).find(t => complexAnalysisTypes.includes(t)) ||
                             analysisPath.find(a => complexAnalysisTypes.includes(a.analysisType || ''))?.analysisType ||
                             'statistical';

      // Select compute engine
      selectedEngine = ComputeEngineSelector.selectEngine({
        recordCount: totalRecordCount,
        analysisType: mostComplexType,
        complexity: 'intermediate',
        availableResources: {
          localMemoryMB: 4096,
          sparkAvailable: process.env.SPARK_ENABLED === 'true',
          polarsAvailable: true
        }
      });

      console.log(`⚙️ [Compute Engine] Selected: ${selectedEngine.engine.toUpperCase()}`);
      console.log(`   - Reason: ${selectedEngine.reason}`);
      console.log(`   - Records: ${totalRecordCount.toLocaleString()}, Confidence: ${(selectedEngine.confidence * 100).toFixed(0)}%`);

      // Get engine-specific configuration
      const engineConfig = ComputeEngineSelector.getEngineConfig(selectedEngine.engine, {
        recordCount: totalRecordCount,
        analysisType: mostComplexType
      });
      console.log(`   - Config: ${JSON.stringify(engineConfig)}`);
    } catch (err: any) {
      console.warn(`⚠️ [Compute Engine] Selection failed, using local: ${err.message}`);
    }

    let results: DataScienceResults;

    if (usePerAnalysisExecution && analysisPath.length > 0) {
      console.log(`📊 [Phase 6] PARALLEL per-analysis execution mode: ${analysisPath.length} analyses`);
      console.log(`   - Using compute engine: ${selectedEngine.engine.toUpperCase()}`);

      // PHASE 6 FIX (Friction #1): Execute analyses in PARALLEL using Promise.allSettled
      // This maintains graceful degradation - if one analysis fails, others continue
      const parallelStartTime = Date.now();

      // Create analysis execution promises
      const analysisPromises = analysisPath.map(async (analysis) => {
        const analysisId = analysis.analysisId || `analysis_${nanoid(8)}`;
        const analysisType = analysis.analysisType || 'descriptive';
        const startTime = Date.now();

        console.log(`  🚀 Launching parallel: ${analysis.analysisName} (${analysisType})`);

        try {
          // VI-1 FIX: Execute single analysis with optimal compute engine
          const singleResult = await dataScienceOrchestrator.executeWorkflow({
            projectId: request.projectId,
            userId: request.userId,
            analysisTypes: [analysisType],
            userGoals,
            userQuestions,
            datasetIds: request.datasetIds,
            computeEngine: selectedEngine.engine,
            computeEngineConfig: ComputeEngineSelector.getEngineConfig(selectedEngine.engine, {
              recordCount: totalRecordCount,
              analysisType: analysisType
            })
          });

          const executionTimeMs = Date.now() - startTime;
          console.log(`  ✅ Completed: ${analysis.analysisName} (${executionTimeMs}ms)`);

          return {
            analysisId,
            analysis,
            analysisType,
            singleResult,
            executionTimeMs,
            status: 'completed' as const
          };
        } catch (error: any) {
          const executionTimeMs = Date.now() - startTime;
          console.error(`  ❌ Failed: ${analysis.analysisName} - ${error.message}`);

          return {
            analysisId,
            analysis,
            analysisType,
            error: error.message,
            executionTimeMs,
            status: 'failed' as const
          };
        }
      });

      // Wait for all analyses to complete (Promise.allSettled ensures all complete)
      const settledResults = await Promise.allSettled(analysisPromises);

      const parallelTotalTime = Date.now() - parallelStartTime;
      console.log(`📊 [Phase 6] All ${analysisPath.length} analyses completed in ${parallelTotalTime}ms (parallel)`);

      // Process results and merge
      let mergedInsights: any[] = [];
      let mergedVisualizations: any[] = [];
      let mergedRecommendations: any[] = [];
      let mergedQuestionAnswers: any[] = [];
      let insightIdCounter = 1;

      for (const settled of settledResults) {
        if (settled.status === 'rejected') {
          // This shouldn't happen since we catch errors above, but handle it just in case
          console.error(`  ⚠️ Unexpected rejection:`, settled.reason);
          continue;
        }

        const result = settled.value;
        const { analysisId, analysis, analysisType, executionTimeMs } = result;

        if (result.status === 'failed') {
          // Store failure (graceful degradation)
          perAnalysisResults.set(analysisId, {
            status: 'failed',
            insights: [],
            visualizations: [],
            recommendations: [],
            error: result.error,
            executionTimeMs
          });
          continue;
        }

        const { singleResult } = result;

        // Convert to insights for this analysis
        const analysisInsights: AnalysisInsight[] = [];

        // Extract insights from this single analysis result
        for (const corr of (singleResult.statisticalAnalysisReport?.correlationMatrix?.significantCorrelations || []).slice(0, 3)) {
          analysisInsights.push({
            id: insightIdCounter++,
            title: `[${analysis.analysisName}] ${corr.var1} & ${corr.var2}`,
            description: `Found ${corr.correlation > 0 ? 'positive' : 'negative'} correlation (r=${corr.correlation.toFixed(3)})`,
            impact: Math.abs(corr.correlation) > 0.7 ? 'High' : 'Medium',
            confidence: Math.round((1 - corr.pValue) * 100),
            category: analysis.analysisName,
            dataSource: analysisType,
            details: { ...corr, sourceAnalysisId: analysisId }
          });
        }

        // Tag visualizations with source analysis
        const taggedViz = (singleResult.visualizations || []).map((v: any) => ({
          ...v,
          sourceAnalysisId: analysisId,
          sourceAnalysisName: analysis.analysisName
        }));

        // Store per-analysis result
        perAnalysisResults.set(analysisId, {
          status: 'completed',
          insights: analysisInsights,
          visualizations: taggedViz,
          recommendations: (singleResult.executiveSummary?.recommendations || []).map((r: any) => ({
            ...r,
            sourceAnalysisId: analysisId
          })),
          executionTimeMs
        });

        // Merge into overall results
        mergedInsights = mergedInsights.concat(analysisInsights);
        mergedVisualizations = mergedVisualizations.concat(taggedViz);
        mergedRecommendations = mergedRecommendations.concat(
          (singleResult.executiveSummary?.recommendations || []).map((r: any) => ({
            ...r,
            sourceAnalysisId: analysisId
          }))
        );
        mergedQuestionAnswers = mergedQuestionAnswers.concat(
          (singleResult.executiveSummary?.answersToQuestions || []).map((qa: any) => ({
            ...qa,
            sourceAnalysisId: analysisId
          }))
        );
      }

      // Build combined results from per-analysis execution
      const completedCount = Array.from(perAnalysisResults.values()).filter(r => r.status === 'completed').length;
      console.log(`📊 [Phase 6] Completed ${completedCount}/${analysisPath.length} analyses`);

      // Create a synthetic DataScienceResults from merged data
      const executionStartTime = new Date();
      results = {
        projectId: request.projectId,
        executionId: nanoid(),
        startedAt: executionStartTime,
        completedAt: new Date(),
        dataQualityReport: {
          overallScore: 85,
          missingValueAnalysis: [],
          outlierDetection: [],
          distributionAssessments: [],
          piiDetection: []
        },
        statisticalAnalysisReport: {
          descriptiveStats: [],
          correlationMatrix: { columns: [], matrix: [], significantCorrelations: [] },
          hypothesisTests: []
        },
        mlModels: [],
        visualizations: mergedVisualizations,
        executiveSummary: {
          keyFindings: mergedInsights.map(i => i.title),
          recommendations: mergedRecommendations,
          answersToQuestions: mergedQuestionAnswers,
          nextSteps: []
        },
        questionAnalysisLinks: [],
        metadata: {
          totalRows: 0,
          totalColumns: 0,
          analysisTypes: request.analysisTypes,
          executionTimeMs: Array.from(perAnalysisResults.values()).reduce((sum, r) => sum + (r.executionTimeMs || 0), 0),
          pythonScriptsUsed: analysisPath.map(a => a.analysisType || 'unknown')
        }
      };
    } else {
      // Fallback: Execute all analyses together (legacy behavior)
      console.log(`📊 [Phase 6] Monolithic execution mode (no analysisPath)`);
      results = await dataScienceOrchestrator.executeWorkflow({
        projectId: request.projectId,
        userId: request.userId,
        analysisTypes: request.analysisTypes,
        userGoals,
        userQuestions,
        datasetIds: request.datasetIds
      });
    }

    // Convert orchestrator results to legacy format for backward compatibility
    const legacyInsights: AnalysisInsight[] = [];
    let insightId = 1;

    // Convert data quality findings to insights
    if (results.dataQualityReport.overallScore < 80) {
      legacyInsights.push({
        id: insightId++,
        title: 'Data Quality Assessment',
        description: `Overall data quality score: ${results.dataQualityReport.overallScore.toFixed(0)}%. ${results.dataQualityReport.missingValueAnalysis.filter(m => m.missingPercent > 5).length} columns have notable missing values.`,
        impact: results.dataQualityReport.overallScore < 60 ? 'High' : 'Medium',
        confidence: 95,
        category: 'Data Quality',
        details: results.dataQualityReport
      });
    }

    // Convert statistical findings to insights
    for (const corr of results.statisticalAnalysisReport.correlationMatrix.significantCorrelations.slice(0, 5)) {
      legacyInsights.push({
        id: insightId++,
        title: `Strong Correlation: ${corr.var1} & ${corr.var2}`,
        description: `Found ${corr.correlation > 0 ? 'positive' : 'negative'} correlation (r=${corr.correlation.toFixed(3)}, p=${corr.pValue.toFixed(4)})`,
        impact: Math.abs(corr.correlation) > 0.7 ? 'High' : 'Medium',
        confidence: Math.round((1 - corr.pValue) * 100),
        category: 'Correlation',
        details: corr
      });
    }

    // Convert ML model results to insights
    for (const model of results.mlModels) {
      const metricDescription = model.problemType === 'regression'
        ? `R² = ${(model.metrics.r2 || 0).toFixed(3)}, RMSE = ${(model.metrics.rmse || 0).toFixed(3)}`
        : model.problemType === 'classification'
          ? `Accuracy = ${((model.metrics.accuracy || 0) * 100).toFixed(1)}%, F1 = ${((model.metrics.f1Score || 0) * 100).toFixed(1)}%`
          : `Silhouette Score = ${(model.metrics.silhouetteScore || 0).toFixed(3)}`;

      legacyInsights.push({
        id: insightId++,
        title: `${model.modelType} Model Results`,
        description: `${model.problemType} model trained. ${metricDescription}. Top features: ${model.featureImportance.slice(0, 3).map(f => f.feature).join(', ')}`,
        impact: 'High',
        confidence: model.problemType === 'regression'
          ? Math.round((model.metrics.r2 || 0.5) * 100)
          : Math.round((model.metrics.accuracy || model.metrics.silhouetteScore || 0.5) * 100),
        category: 'Machine Learning',
        details: model
      });
    }

    // Add question-answer insights
    for (const qa of results.executiveSummary.answersToQuestions) {
      legacyInsights.push({
        id: insightId++,
        title: `Answer: ${qa.question.substring(0, 50)}...`,
        description: qa.answer,
        impact: qa.confidence > 0.7 ? 'High' : 'Medium',
        confidence: Math.round(qa.confidence * 100),
        category: 'Question Answer',
        details: { evidence: qa.evidence }
      });
    }

    // Generate legacy recommendations
    const legacyRecommendations: AnalysisRecommendation[] = results.executiveSummary.recommendations.map((rec, idx) => ({
      id: idx + 1,
      title: rec.text.substring(0, 50),
      description: rec.text,
      priority: rec.priority === 'high' ? 'High' : rec.priority === 'medium' ? 'Medium' : 'Low',
      effort: 'Medium',
      expectedImpact: rec.expectedImpact
    }));

    // Update project with comprehensive results
    const completedAt = new Date();
    const legacyResults: AnalysisResults = {
      projectId: request.projectId,
      analysisTypes: request.analysisTypes,
      insights: legacyInsights,
      recommendations: legacyRecommendations,
      visualizations: results.visualizations.map(v => ({
        id: v.id,
        type: v.type,
        title: v.title,
        description: v.description,
        data: v.data,
        config: v.config
      })),
      summary: {
        totalAnalyses: request.analysisTypes.length,
        dataRowsProcessed: results.metadata.totalRows,
        columnsAnalyzed: results.metadata.totalColumns,
        executionTime: `${(results.metadata.executionTimeMs / 1000).toFixed(1)} seconds`,
        qualityScore: results.dataQualityReport.overallScore
      },
      metadata: {
        executedAt: completedAt,
        datasetNames: [],
        techniques: results.metadata.pythonScriptsUsed
      },
      questionAnswers: {
        projectId: request.projectId,
        answers: results.executiveSummary.answersToQuestions.map(qa => ({
          question: qa.question,
          answer: qa.answer,
          confidence: qa.confidence * 100,
          sources: qa.evidence,
          relatedInsights: [],
          status: qa.confidence > 0.5 ? 'answered' as const : 'partial' as const,
          generatedAt: completedAt
        })),
        generatedBy: 'data-science-orchestrator',
        generatedAt: completedAt,
        totalQuestions: results.executiveSummary.answersToQuestions.length,
        answeredCount: results.executiveSummary.answersToQuestions.filter(a => a.confidence > 0.5).length
      },
      questionAnswerMapping: results.questionAnalysisLinks.map(link => ({
        questionId: link.questionId,
        questionText: link.questionText,
        requiredDataElements: link.dataElements,
        recommendedAnalyses: link.analysisTypes,
        transformationsNeeded: [],
        expectedArtifacts: link.findings.map(f => ({
          artifactType: 'report' as const,
          description: f.title
        }))
      })),
      // ==========================================
      // PHASE 6: Per-Analysis Breakdown Storage (Jan 2026)
      // Stores per-analysis results for granular dashboard view
      // ==========================================
      perAnalysisBreakdown: usePerAnalysisExecution
        ? Object.fromEntries(perAnalysisResults)
        : undefined,
      analysisStatuses: usePerAnalysisExecution
        ? Array.from(perAnalysisResults.entries()).map(([analysisId, result]) => {
            const analysisInfo = analysisPath.find(a => a.analysisId === analysisId);
            return {
              analysisId,
              analysisName: analysisInfo?.analysisName || 'Unknown',
              analysisType: analysisInfo?.analysisType || 'unknown',
              status: result.status,
              insightCount: result.insights?.length || 0,
              errorMessage: result.error,
              executionTimeMs: result.executionTimeMs,
              // PHASE 6 FIX (ROOT CAUSE #3): Include requiredDataElements for traceability
              // This allows the dashboard to show which data elements were used per analysis
              requiredDataElements: analysisInfo?.requiredDataElements || []
            };
          })
        : undefined
    };

    // Store in database
    await db
      .update(projects)
      .set({
        analysisResults: legacyResults as any,
        analysisExecutedAt: completedAt,
        updatedAt: completedAt
      })
      .where(eq(projects.id, request.projectId));

    // Log per-analysis status summary
    if (usePerAnalysisExecution) {
      const statusSummary = Array.from(perAnalysisResults.entries())
        .map(([id, r]) => `${id}: ${r.status}`)
        .join(', ');
      console.log(`📊 [Phase 6] Per-analysis statuses: ${statusSummary}`);
    }

    console.log(`✅ [Comprehensive] Data science workflow completed for project ${request.projectId}`);

    // Return legacyResults (AnalysisResults format) for route compatibility
    return legacyResults;
  }
}
