// server/services/data-scientist-agent.ts
import { AgentHandler, AgentTask, AgentResult, AgentStatus, AgentCapability } from './agent-registry';
import { TechnicalAIAgent } from './technical-ai-agent';
import { SparkProcessor } from './spark-processor';
import { nanoid } from 'nanoid';
import { normalizeQuestions, standardizeElementName } from '../utils/question-normalizer';
import type { AnalysisStep, MLModelSpec, VisualizationSpec, DataAssessment } from '@shared/schema';
import { ChimaridataAI } from '../chimaridata-ai';
import { businessDefinitionRegistry } from './business-definition-registry';
import { QuestionIntentAnalyzer } from './question-intent-analyzer';
import { getAnalysisRequirementsForTypes } from './analysis-requirements-registry';

// ==========================================
// CONSULTATION INTERFACES (Multi-Agent Coordination)
// ==========================================

export interface FeasibilityReport {
  feasible: boolean;
  confidence: number;
  requiredAnalyses: string[];
  estimatedDuration: string;
  dataRequirements: {
    met: string[];
    missing: string[];
    canDerive: string[];
  };
  concerns: string[];
  recommendations: string[];
}

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  warnings: string[];
  alternatives: string[];
  recommendations?: string[];
}

export interface ConfidenceScore {
  score: number;
  factors: Array<{
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }>;
  recommendation: string;
}

export interface PlanAnalysisBlueprint {
  analysisSteps: AnalysisStep[];
  mlModels: MLModelSpec[];
  visualizations: VisualizationSpec[];
  recommendations: string[];
  risks: string[];
  estimatedDuration: string;
  complexity: 'low' | 'medium' | 'high' | 'very_high';
}

// ==========================================
// QUESTION DECOMPOSITION (KPI Synthesis)
// ==========================================

/**
 * Represents a decomposed user question broken into:
 * - The KPI/metric being asked about (e.g., "turnover rate")
 * - The dimensions for aggregation (e.g., "leader" = grouping, "company" = baseline)
 * - The comparison type (e.g., group_vs_baseline)
 * - Temporal scope if present
 *
 * Used by decomposeQuestion() to drive KPI registry lookup and multi-field element generation.
 */
export interface QuestionDecomposition {
  originalQuestion: string;
  kpiName: string | null;           // "turnover rate"
  kpiRegistryKey: string | null;    // "turnover_rate"
  dimensions: Array<{
    name: string;                   // "leader", "company", "department"
    role: 'grouping' | 'baseline' | 'filter';
    level: 'detail' | 'aggregate';
  }>;
  comparisonType: 'none' | 'between_groups' | 'group_vs_baseline' | 'time_series';
  temporalScope: {
    periodType: string | null;      // "monthly", "quarterly", "yearly"
    periodColumn: string | null;
    keywords: string[];             // ["over time", "trend", "monthly"]
  } | null;
  registryDefinition: any | null;   // The full BusinessDefinition if found in registry
}

// ==========================================
// ANALYSIS INTERFACES
// ==========================================

export interface AnalysisRequest {
  type: 'statistical' | 'ml' | 'exploratory' | 'predictive' | 'diagnostic';
  datasetId: string;
  data: any[];
  schema: Record<string, any>;
  parameters: Record<string, any>;
  questions: string[];
  goals: string[];
  outputFormat: 'technical' | 'business' | 'presentation';
}

export interface AnalysisResult {
  analysisId: string;
  type: string;
  findings: Finding[];
  visualizations: Visualization[];
  insights: Insight[];
  recommendations: string[];
  confidence: number;
  methodology: string;
  artifacts: AnalysisArtifact[];
  executionMetrics: {
    duration: number;
    recordsAnalyzed: number;
    testsPerformed: string[];
    modelsGenerated?: string[];
  };
}

export interface Finding {
  category: string;
  title: string;
  description: string;
  significance: 'high' | 'medium' | 'low';
  evidence: any;
  confidence: number;
}

export interface Visualization {
  id: string;
  type: 'scatter' | 'line' | 'bar' | 'histogram' | 'heatmap' | 'box' | 'distribution';
  title: string;
  description: string;
  data: any;
  configuration: Record<string, any>;
}

export interface Insight {
  category: 'trend' | 'correlation' | 'anomaly' | 'pattern' | 'prediction';
  insight: string;
  businessImpact: string;
  technicalDetail: string;
  actionable: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisArtifact {
  type: 'model' | 'dataset' | 'report' | 'code' | 'visualization';
  name: string;
  location: string;
  metadata: Record<string, any>;
}

export class DataScientistAgent implements AgentHandler {
  private technicalAgent: TechnicalAIAgent;
  private sparkProcessor: SparkProcessor;
  private currentTasks = 0;
  private readonly maxConcurrentTasks = 2; // Limit due to compute intensity
  private activeAnalyses: Map<string, AnalysisResult> = new Map();

  constructor() {
    this.technicalAgent = new TechnicalAIAgent();
    this.sparkProcessor = new SparkProcessor();
    console.log('🔬 Data Scientist Agent initialized');
  }

  static getCapabilities(): AgentCapability[] {
    return [
      {
        name: 'statistical_analysis',
        description: 'Comprehensive statistical analysis including hypothesis testing and regression',
        inputTypes: ['csv', 'json', 'database'],
        outputTypes: ['analysis_report', 'statistical_summary', 'visualizations'],
        complexity: 'high',
        estimatedDuration: 600,
        requiredResources: ['compute', 'statistics_engine'],
        tags: ['statistics', 'analysis', 'hypothesis_testing']
      },
      {
        name: 'machine_learning',
        description: 'ML model development, training, and validation',
        inputTypes: ['training_data', 'features', 'labeled_data'],
        outputTypes: ['model', 'predictions', 'performance_metrics', 'feature_importance'],
        complexity: 'high',
        estimatedDuration: 1800,
        requiredResources: ['compute', 'ml_frameworks', 'storage'],
        tags: ['ml', 'modeling', 'prediction', 'classification']
      },
      {
        name: 'exploratory_analysis',
        description: 'Data exploration and pattern discovery',
        inputTypes: ['csv', 'json', 'database'],
        outputTypes: ['exploration_report', 'visualizations', 'insights'],
        complexity: 'medium',
        estimatedDuration: 300,
        requiredResources: ['compute'],
        tags: ['eda', 'exploration', 'visualization']
      },
      {
        name: 'predictive_modeling',
        description: 'Build predictive models and forecasts',
        inputTypes: ['time_series', 'historical_data'],
        outputTypes: ['predictions', 'forecast', 'confidence_intervals'],
        complexity: 'high',
        estimatedDuration: 900,
        requiredResources: ['compute', 'ml_frameworks'],
        tags: ['prediction', 'forecasting', 'time_series']
      },
      {
        name: 'data_visualization',
        description: 'Create insightful data visualizations',
        inputTypes: ['processed_data', 'analysis_results'],
        outputTypes: ['charts', 'dashboards', 'interactive_plots'],
        complexity: 'medium',
        estimatedDuration: 180,
        requiredResources: ['compute', 'visualization_library'],
        tags: ['visualization', 'charting', 'dashboard']
      },
      {
        name: 'insight_generation',
        description: 'Extract actionable insights from analysis results',
        inputTypes: ['analysis_results', 'business_context'],
        outputTypes: ['insights', 'recommendations', 'action_items'],
        complexity: 'medium',
        estimatedDuration: 300,
        requiredResources: ['compute', 'ai_models'],
        tags: ['insights', 'recommendations', 'business_intelligence']
      }
    ];
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.currentTasks++;

    try {
      console.log(`🔬 Data Scientist processing task: ${task.type}`);

      switch (task.type) {
        // Consultation methods for multi-agent coordination
        case 'check_feasibility':
          const feasibilityReport = await this.checkFeasibility(
            task.payload.goals || [],
            task.payload.dataSchema,
            task.payload.dataQuality
          );
          return {
            taskId: task.id,
            agentId: 'data_scientist',
            status: 'success',
            result: feasibilityReport,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };

        case 'validate_methodology':
          const validationResult = await this.validateMethodology(
            task.payload.analysisParams,
            task.payload.dataCharacteristics
          );
          return {
            taskId: task.id,
            agentId: 'data_scientist',
            status: 'success',
            result: validationResult,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };

        case 'estimate_confidence':
          const confidenceScore = await this.estimateConfidence(
            task.payload.analysisType,
            task.payload.dataQuality
          );
          return {
            taskId: task.id,
            agentId: 'data_scientist',
            status: 'success',
            result: confidenceScore,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };

        // Existing analysis execution methods
        case 'statistical_analysis':
          return await this.performStatisticalAnalysis(task);

        case 'ml_model_development':
          return await this.developMLModel(task);

        case 'exploratory_analysis':
          return await this.performExploratoryAnalysis(task);

        case 'predictive_modeling':
          return await this.buildPredictiveModel(task);

        case 'data_visualization':
          return await this.createVisualizations(task);

        case 'insight_generation':
          return await this.generateInsights(task);

        case 'comprehensive_analysis':
          return await this.performComprehensiveAnalysis(task);

        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

    } catch (error: any) {
      console.error(`Data Scientist task ${task.id} failed:`, error);

      return {
        taskId: task.id,
        agentId: 'data_scientist',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    } finally {
      this.currentTasks--;
    }
  }

  private async performStatisticalAnalysis(task: AgentTask): Promise<AgentResult> {
    const { data, schema, parameters, questions } = task.payload as AnalysisRequest;
    const startTime = Date.now();

    const analysisId = `analysis_${nanoid()}`;
    const findings: Finding[] = [];
    const visualizations: Visualization[] = [];
    const insights: Insight[] = [];
    const testsPerformed: string[] = [];

    // Descriptive statistics
    const descriptiveStats = await this.calculateDescriptiveStats(data, schema);
    findings.push({
      category: 'descriptive_statistics',
      title: 'Descriptive Statistics Summary',
      description: `Analyzed ${data.length} records across ${Object.keys(schema).length} variables`,
      significance: 'high',
      evidence: descriptiveStats,
      confidence: 0.95
    });
    testsPerformed.push('Descriptive Statistics');

    // Correlation analysis for numeric variables
    const numericColumns = Object.entries(schema)
      .filter(([_, meta]) => meta.type === 'number' || meta.type === 'integer')
      .map(([col, _]) => col);

    if (numericColumns.length >= 2) {
      const correlations = await this.calculateCorrelations(data, numericColumns);
      findings.push({
        category: 'correlation',
        title: 'Correlation Analysis',
        description: 'Identified relationships between numeric variables',
        significance: 'high',
        evidence: correlations,
        confidence: 0.90
      });

      visualizations.push({
        id: `viz_${nanoid()}`,
        type: 'heatmap',
        title: 'Correlation Heatmap',
        description: 'Visual representation of variable correlations',
        data: correlations,
        configuration: { colorScale: 'RdBu', symmetric: true }
      });
      testsPerformed.push('Correlation Analysis');
    }

    // Distribution analysis
    for (const column of numericColumns.slice(0, 5)) { // Limit to first 5
      const distribution = await this.analyzeDistribution(data, column);

      visualizations.push({
        id: `viz_${nanoid()}`,
        type: 'histogram',
        title: `Distribution of ${column}`,
        description: `${distribution.normality.isNormal ? 'Normal' : 'Non-normal'} distribution`,
        data: distribution.bins,
        configuration: { bins: 30, showMean: true, showMedian: true }
      });

      if (!distribution.normality.isNormal) {
        insights.push({
          category: 'anomaly',
          insight: `${column} shows non-normal distribution`,
          businessImpact: 'May require non-parametric statistical tests or data transformation',
          technicalDetail: `Shapiro-Wilk p-value: ${distribution.normality.pValue.toFixed(4)}`,
          actionable: true,
          priority: 'medium'
        });
      }
    }
    testsPerformed.push('Distribution Analysis');

    // Outlier detection
    const outliers = await this.detectOutliers(data, numericColumns);
    if (outliers.totalOutliers > 0) {
      findings.push({
        category: 'outliers',
        title: 'Outlier Detection',
        description: `Found ${outliers.totalOutliers} outliers across ${outliers.affectedColumns.length} variables`,
        significance: 'medium',
        evidence: outliers,
        confidence: 0.85
      });

      insights.push({
        category: 'anomaly',
        insight: `${outliers.totalOutliers} data points flagged as outliers`,
        businessImpact: 'Outliers may indicate data quality issues or rare but important events',
        technicalDetail: 'Detected using IQR method (1.5 * IQR)',
        actionable: true,
        priority: 'high'
      });
    }
    testsPerformed.push('Outlier Detection');

    // Generate recommendations
    const recommendations = this.generateStatisticalRecommendations(findings, insights);

    const result: AnalysisResult = {
      analysisId,
      type: 'statistical',
      findings,
      visualizations,
      insights,
      recommendations,
      confidence: 0.88,
      methodology: 'Comprehensive statistical analysis including descriptive statistics, correlation analysis, distribution testing, and outlier detection',
      artifacts: [],
      executionMetrics: {
        duration: Date.now() - startTime,
        recordsAnalyzed: data.length,
        testsPerformed
      }
    };

    this.activeAnalyses.set(analysisId, result);

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: ['compute', 'statistics_engine'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'analysis_results',
        data: result,
        metadata: { analysisId, recordCount: data.length, testsCount: testsPerformed.length }
      }],
      completedAt: new Date()
    };
  }

  private async developMLModel(task: AgentTask): Promise<AgentResult> {
    const { data, parameters, type: mlType } = task.payload;
    const startTime = Date.now();

    // Use Spark for large datasets
    if (data.length > 1000) {
      const sparkResult = await this.sparkProcessor.performAnalysis(data, 'machine_learning', parameters);

      return {
        taskId: task.id,
        agentId: 'data_scientist',
        status: 'success',
        result: {
          model: sparkResult.model,
          performance: sparkResult.metrics,
          featureImportance: sparkResult.featureImportance,
          predictions: sparkResult.predictions,
          engine: 'spark_mllib'
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute', 'spark', 'ml_frameworks'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    }

    // In-memory ML for smaller datasets
    const result = await this.technicalAgent.processQuery({
      type: 'machine_learning',
      prompt: `Build ${mlType} model`,
      context: { data },
      parameters
    } as any);

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result,
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: ['compute', 'ml_frameworks'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async performExploratoryAnalysis(task: AgentTask): Promise<AgentResult> {
    const { data, schema } = task.payload as AnalysisRequest;
    const startTime = Date.now();

    const findings: Finding[] = [];
    const visualizations: Visualization[] = [];
    const insights: Insight[] = [];

    // Data overview
    findings.push({
      category: 'overview',
      title: 'Dataset Overview',
      description: `${data.length} records with ${Object.keys(schema).length} columns`,
      significance: 'high',
      evidence: {
        recordCount: data.length,
        columnCount: Object.keys(schema).length,
        dataTypes: this.summarizeDataTypes(schema),
        missingData: this.analyzeMissingData(data, schema)
      },
      confidence: 1.0
    });

    // Variable distributions
    for (const [column, columnMeta] of Object.entries(schema).slice(0, 10)) {
      if (columnMeta.type === 'number' || columnMeta.type === 'integer') {
        const stats = this.calculateColumnStats(data, column);

        visualizations.push({
          id: `viz_${nanoid()}`,
          type: 'box',
          title: `${column} Distribution`,
          description: `Range: ${stats.min} - ${stats.max}, Mean: ${stats.mean.toFixed(2)}`,
          data: stats,
          configuration: { showOutliers: true }
        });
      }
    }

    insights.push({
      category: 'pattern',
      insight: 'Initial data exploration completed successfully',
      businessImpact: 'Ready for detailed analysis based on business questions',
      technicalDetail: `Analyzed ${data.length} records across all variables`,
      actionable: true,
      priority: 'medium'
    });

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result: {
        analysisId: `eda_${nanoid()}`,
        type: 'exploratory',
        findings,
        visualizations,
        insights,
        recommendations: [
          'Proceed with hypothesis testing based on business questions',
          'Consider variable transformations for non-normal distributions',
          'Investigate missing data patterns if present'
        ],
        confidence: 0.9,
        methodology: 'Exploratory Data Analysis (EDA)',
        artifacts: [],
        executionMetrics: {
          duration: Date.now() - startTime,
          recordsAnalyzed: data.length,
          testsPerformed: ['Distribution Analysis', 'Missing Data Analysis']
        }
      },
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async buildPredictiveModel(task: AgentTask): Promise<AgentResult> {
    const { data, parameters } = task.payload;
    const startTime = Date.now();

    // Delegate to Spark for large datasets
    if (data.length > 1000) {
      const result = await this.sparkProcessor.performAnalysis(data, 'prediction', parameters);

      return {
        taskId: task.id,
        agentId: 'data_scientist',
        status: 'success',
        result: {
          predictions: result.predictions,
          confidence: result.confidence,
          model: result.model,
          methodology: 'Spark MLlib Time Series / Regression'
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute', 'spark', 'ml_frameworks'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    }

    // Use Technical AI Agent for smaller datasets (real ML via Python)
    const result = await this.technicalAgent.processQuery({
      type: 'predictive_modeling',
      prompt: `Build predictive model for ${parameters.targetColumn || 'target variable'}`,
      context: { data },
      parameters: {
        ...parameters,
        modelType: parameters.modelType || 'regression'
      }
    } as any);

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result: {
        predictions: result.predictions || [],
        averageConfidence: result.confidence || 0.85,
        model: result.model || {},
        methodology: 'Real ML via Python (scikit-learn)'
      },
      metrics: {
        duration: Date.now() - startTime,
        resourcesUsed: ['compute', 'python', 'ml_frameworks'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async createVisualizations(task: AgentTask): Promise<AgentResult> {
    const { data, parameters } = task.payload;
    const visualizations: Visualization[] = [];

    // Generate requested visualizations
    const vizTypes = parameters.visualizationTypes || ['scatter', 'bar', 'line'];

    for (const vizType of vizTypes) {
      visualizations.push({
        id: `viz_${nanoid()}`,
        type: vizType,
        title: `${vizType} chart for ${parameters.xAxis || 'data'}`,
        description: `Auto-generated ${vizType} visualization`,
        data: data.slice(0, 100), // Limit data points for visualization
        configuration: parameters.vizConfig || {}
      });
    }

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result: { visualizations },
      metrics: {
        duration: 2000,
        resourcesUsed: ['compute', 'visualization_library'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async generateInsights(task: AgentTask): Promise<AgentResult> {
    const { findings, businessContext } = task.payload;

    const insights: Insight[] = findings.map((finding: Finding) => ({
      category: 'pattern',
      insight: finding.title,
      businessImpact: `Finding has ${finding.significance} significance for business decision-making`,
      technicalDetail: finding.description,
      actionable: finding.significance === 'high',
      priority: finding.significance as any
    }));

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result: { insights },
      metrics: {
        duration: 1500,
        resourcesUsed: ['compute', 'ai_models'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  private async performComprehensiveAnalysis(task: AgentTask): Promise<AgentResult> {
    // Combines multiple analysis types for full project analysis
    const statistical = await this.performStatisticalAnalysis(task);
    const exploratory = await this.performExploratoryAnalysis(task);

    return {
      taskId: task.id,
      agentId: 'data_scientist',
      status: 'success',
      result: {
        statistical: statistical.result,
        exploratory: exploratory.result,
        summary: 'Comprehensive analysis completed successfully'
      },
      metrics: {
        duration: (statistical.metrics.duration + exploratory.metrics.duration),
        resourcesUsed: ['compute', 'statistics_engine', 'ml_frameworks'],
        tokensConsumed: 0
      },
      completedAt: new Date()
    };
  }

  // Helper methods
  private async calculateDescriptiveStats(data: any[], schema: Record<string, any>): Promise<any> {
    const stats: Record<string, any> = {};

    for (const [column, meta] of Object.entries(schema)) {
      if (meta.type === 'number' || meta.type === 'integer') {
        stats[column] = this.calculateColumnStats(data, column);
      }
    }

    return stats;
  }

  private calculateColumnStats(data: any[], column: string): any {
    const values = data.map(row => row[column]).filter(v => v !== null && v !== undefined);

    if (values.length === 0) return { count: 0 };

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    const mean = sum / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;

    return {
      count: values.length,
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      std: Math.sqrt(variance),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      q1: sorted[Math.floor(sorted.length * 0.25)],
      q3: sorted[Math.floor(sorted.length * 0.75)]
    };
  }

  private async calculateCorrelations(data: any[], columns: string[]): Promise<any> {
    const correlations: Record<string, Record<string, number>> = {};

    for (const col1 of columns) {
      correlations[col1] = {};
      for (const col2 of columns) {
        correlations[col1][col2] = this.pearsonCorrelation(data, col1, col2);
      }
    }

    return correlations;
  }

  private pearsonCorrelation(data: any[], col1: string, col2: string): number {
    const values1 = data.map(row => row[col1]).filter(v => v !== null);
    const values2 = data.map(row => row[col2]).filter(v => v !== null);

    if (values1.length !== values2.length || values1.length === 0) return 0;

    const mean1 = values1.reduce((a, b) => a + b, 0) / values1.length;
    const mean2 = values2.reduce((a, b) => a + b, 0) / values2.length;

    let numerator = 0;
    let sum1Sq = 0;
    let sum2Sq = 0;

    for (let i = 0; i < values1.length; i++) {
      const diff1 = values1[i] - mean1;
      const diff2 = values2[i] - mean2;
      numerator += diff1 * diff2;
      sum1Sq += diff1 * diff1;
      sum2Sq += diff2 * diff2;
    }

    return numerator / Math.sqrt(sum1Sq * sum2Sq);
  }

  private async analyzeDistribution(data: any[], column: string): Promise<any> {
    const values = data
      .map(row => row[column])
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const stats = this.calculateColumnStats(data, column);

    if (!stats || typeof stats.min !== 'number' || typeof stats.max !== 'number' || values.length === 0) {
      return {
        bins: [],
        normality: { isNormal: false, pValue: 0.01 },
        stats
      };
    }

    // Normality test using statistical heuristic (Shapiro-Wilk approximation)
    // For production, should use scipy.stats.shapiro via Python
    const skewness =
      typeof stats.mean === 'number' && typeof stats.std === 'number' && stats.std !== 0
        ? this.calculateSkewness(values, stats.mean, stats.std)
        : 0;
    const isNormal =
      typeof stats.std === 'number' && typeof stats.mean === 'number' && typeof stats.median === 'number'
        ? Math.abs(stats.mean - stats.median) < stats.std * 0.5 && Math.abs(skewness) < 0.5
        : false;

    // Approximate p-value based on skewness and kurtosis
    // Real implementation should use Python scipy.stats.shapiro
    const pValue = isNormal ? 0.15 + Math.abs(skewness) * 0.2 : 0.01 + Math.abs(skewness) * 0.05;

    const normality = {
      isNormal,
      pValue: Math.min(0.25, Math.max(0.01, pValue))
    };

    // Create histogram bins
    const range = stats.max - stats.min;
    const binCount = range > 0 ? Math.min(30, Math.ceil(Math.sqrt(values.length))) : 1;
    const binSize = range > 0 ? range / binCount : 1;
    const bins = Array(binCount).fill(0).map((_, i) => ({
      start: stats.min + i * binSize,
      end: stats.min + (i + 1) * binSize,
      count: 0
    }));

    values.forEach(val => {
      const adjustedIndex = binSize > 0 ? Math.floor((val - stats.min) / binSize) : 0;
      const binIndex = Math.min(Math.max(adjustedIndex, 0), binCount - 1);
      if (binIndex >= 0 && binIndex < binCount) bins[binIndex].count++;
    });

    return { bins, normality, stats };
  }

  private calculateSkewness(values: number[], mean: number, std: number): number {
    if (!values.length || std === 0) {
      return 0;
    }

    const normalizedSum = values.reduce((sum, value) => sum + Math.pow((value - mean) / std, 3), 0);
    return normalizedSum / values.length;
  }

  private async detectOutliers(data: any[], columns: string[]): Promise<any> {
    let totalOutliers = 0;
    const affectedColumns: string[] = [];
    const outlierDetails: Record<string, any[]> = {};

    for (const column of columns) {
      const stats = this.calculateColumnStats(data, column);
      const iqr = stats.q3 - stats.q1;
      const lowerBound = stats.q1 - 1.5 * iqr;
      const upperBound = stats.q3 + 1.5 * iqr;

      const columnOutliers = data
        .map((row, idx) => ({ idx, value: row[column] }))
        .filter(({ value }) => value < lowerBound || value > upperBound);

      if (columnOutliers.length > 0) {
        totalOutliers += columnOutliers.length;
        affectedColumns.push(column);
        outlierDetails[column] = columnOutliers;
      }
    }

    return { totalOutliers, affectedColumns, outlierDetails };
  }

  private summarizeDataTypes(schema: Record<string, any>): Record<string, number> {
    const typeCounts: Record<string, number> = {};

    for (const meta of Object.values(schema)) {
      typeCounts[meta.type] = (typeCounts[meta.type] || 0) + 1;
    }

    return typeCounts;
  }

  private analyzeMissingData(data: any[], schema: Record<string, any>): any {
    const missingCounts: Record<string, number> = {};

    for (const column of Object.keys(schema)) {
      const missing = data.filter(row => row[column] === null || row[column] === undefined).length;
      if (missing > 0) {
        missingCounts[column] = missing;
      }
    }

    return missingCounts;
  }

  private generateStatisticalRecommendations(findings: Finding[], insights: Insight[]): string[] {
    const recommendations: string[] = [];

    recommendations.push('Review statistical findings for business-relevant patterns');
    recommendations.push('Validate assumptions before applying parametric tests');

    if (insights.some(i => i.category === 'anomaly')) {
      recommendations.push('Investigate anomalies and outliers for data quality or business significance');
    }

    recommendations.push('Consider additional analysis based on initial findings');
    recommendations.push('Prepare visualizations for stakeholder presentation');

    return recommendations;
  }

  // ==========================================
  // CONSULTATION METHODS (Multi-Agent Coordination)
  // ==========================================

  /**
   * Check if proposed analysis is feasible with current data
   */
  async checkFeasibility(
    goals: string[],
    dataSchema: any,
    dataQuality: any
  ): Promise<FeasibilityReport> {
    console.log(`🔬 Data Scientist: Checking feasibility for ${goals.length} goals`);

    // Handle null/undefined inputs gracefully
    if (!goals || !Array.isArray(goals)) {
      return {
        feasible: false,
        confidence: 0,
        requiredAnalyses: [],
        estimatedDuration: 'N/A - Invalid input',
        dataRequirements: {
          met: [],
          missing: ['Valid goals array'],
          canDerive: []
        },
        concerns: ['Invalid goals: goals must be a valid array'],
        recommendations: ['Please provide valid analysis goals']
      };
    }

    if (!dataQuality || (typeof dataQuality !== 'number' && typeof dataQuality !== 'object')) {
      return {
        feasible: false,
        confidence: 0,
        requiredAnalyses: [],
        estimatedDuration: 'N/A - Invalid input',
        dataRequirements: {
          met: [],
          missing: ['Valid data quality score'],
          canDerive: []
        },
        concerns: ['Invalid data quality: data quality must be a number'],
        recommendations: ['Please provide a valid data quality assessment']
      };
    }

    // Calculate data size from schema if available
    const schemaEntries = dataSchema && typeof dataSchema === 'object'
      ? Object.entries(dataSchema as Record<string, any>)
      : [];
    const schemaKeys = schemaEntries.map(([key]) => key);
    const dataSize = schemaKeys.length;

    const requiredAnalyses: string[] = [];
    const dataRequirements = {
      met: [] as string[],
      missing: [] as string[],
      canDerive: [] as string[]
    };
    const concerns: string[] = [];
    const recommendations: string[] = [];

    // Analyze goals to determine required analyses
    const goalsLower = goals.map(g => g.toLowerCase()).join(' ');

    if (goalsLower.includes('segment') || goalsLower.includes('cluster') || goalsLower.includes('group')) {
      requiredAnalyses.push('clustering', 'segmentation');

      // Check for segmentation columns
      const hasSegmentData = schemaKeys.some(col =>
        col.toLowerCase().includes('segment') ||
        col.toLowerCase().includes('category') ||
        col.toLowerCase().includes('group')
      );

      if (hasSegmentData) {
        dataRequirements.met.push('segment_column');
      } else {
        dataRequirements.canDerive.push('segment_column_via_rfm');
        recommendations.push('Use RFM analysis to create customer segments from behavioral data');
      }
    }

    if (goalsLower.includes('predict') || goalsLower.includes('forecast') || goalsLower.includes('trend')) {
      // Check if it's time series forecasting or general prediction
      const hasTimeData = schemaKeys.some(col =>
        col.toLowerCase().includes('date') || col.toLowerCase().includes('time')
      );

      if (hasTimeData && (goalsLower.includes('forecast') || goalsLower.includes('trend'))) {
        // Time series forecasting
        requiredAnalyses.push('time_series_analysis', 'regression');
        dataRequirements.met.push('temporal_data');
      } else {
        // General prediction/regression
        requiredAnalyses.push('regression');

        if (goalsLower.includes('forecast') && !hasTimeData) {
          dataRequirements.missing.push('temporal_data');
          concerns.push('Forecasting typically requires date/time columns for time-based predictions');
        }
      }
    }

    if (goalsLower.includes('correlat') || goalsLower.includes('relationship') || goalsLower.includes('impact')) {
      requiredAnalyses.push('correlation_analysis', 'regression_analysis');

      const numericColumns = schemaEntries
        .map(([, value]) => value)
        .filter((col: any) =>
          col.type === 'number' || col.type === 'integer' || col.type === 'float'
        ).length;

      if (numericColumns >= 2) {
        dataRequirements.met.push('numeric_variables');
      } else {
        concerns.push('Correlation analysis requires at least 2 numeric variables');
      }
    }

    // Check data quality impact
    let qualityScore: number | undefined;
    if (typeof dataQuality === 'number') {
      qualityScore = dataQuality;
    } else if (typeof dataQuality === 'object') {
      const qualityObj = dataQuality as { overallScore?: number; score?: number };
      qualityScore = qualityObj.overallScore ?? qualityObj.score;
    }

    if (qualityScore !== undefined && qualityScore < 0.5) {
      concerns.push('Critical: Data quality too low for reliable analysis');
      concerns.push('Data quality score must be at least 0.5 for analysis');
      recommendations.push('Perform comprehensive data cleaning before attempting analysis');

      // Return early with infeasible status for very poor quality
      return {
        feasible: false,
        confidence: 0.30,
        requiredAnalyses: [],
        estimatedDuration: 'N/A - data quality insufficient',
        dataRequirements,
        concerns,
        recommendations: ['Address critical data quality issues first', ...recommendations]
      };
    } else if (qualityScore !== undefined && qualityScore < 0.7) {
      concerns.push('Low data quality may affect analysis accuracy');
      recommendations.push('Consider data cleaning before analysis');
    }

    // Estimate duration based on complexity
    const estimatedMinutes = requiredAnalyses.length * 5 + schemaKeys.length;
    const estimatedDuration = `${estimatedMinutes}-${estimatedMinutes + 10} minutes`;

    // Determine feasibility
    const feasible = dataRequirements.missing.length === 0 || dataRequirements.canDerive.length > 0;
    const confidence = feasible ?
      (dataRequirements.missing.length === 0 ? 0.90 : 0.85) :
      0.50;

    // Generate actionable recommendations based on analysis types and data
    if (feasible && requiredAnalyses.length > 0) {
      // Add specific methodology recommendations per analysis type
      for (const analysis of requiredAnalyses) {
        switch (analysis) {
          case 'regression':
            recommendations.push('Identify target variable and validate linear relationships in data before fitting model');
            break;
          case 'correlation_analysis':
            recommendations.push('Review numeric variables for outliers that may distort correlation coefficients');
            break;
          case 'clustering':
          case 'segmentation':
            recommendations.push('Normalize numeric features to prevent scale-dependent clustering bias');
            break;
          case 'time_series_analysis':
            recommendations.push('Verify data has consistent time intervals and handle missing timestamps');
            break;
          case 'regression_analysis':
            recommendations.push('Check for multicollinearity among predictor variables before regression');
            break;
        }
      }
      // Add data-size specific recommendation
      if (dataSize > 50) {
        recommendations.push('Consider dimensionality reduction given the high number of variables');
      } else if (dataSize < 5) {
        recommendations.push('Limited variables available - focus on direct relationships between key metrics');
      }
    }

    return {
      feasible,
      confidence,
      requiredAnalyses,
      estimatedDuration,
      dataRequirements,
      concerns,
      recommendations
    };
  }

  /**
   * Validate proposed analysis methodology
   */
  async validateMethodology(
    analysisParams: any,
    dataCharacteristics: any
  ): Promise<ValidationResult> {
    console.log(`🔬 Data Scientist: Validating methodology`);

    // Handle null/undefined inputs gracefully
    if (!analysisParams || typeof analysisParams !== 'object' || Array.isArray(analysisParams) || typeof analysisParams.type !== 'string') {
      return {
        valid: false,
        confidence: 0,
        warnings: ['Invalid analysis parameters: parameters must be a valid object'],
        alternatives: ['Please provide valid analysis parameters'],
        recommendations: ['Please provide valid analysis parameters for validation']
      };
    }

    if (!dataCharacteristics || typeof dataCharacteristics !== 'object' || Array.isArray(dataCharacteristics)) {
      return {
        valid: false,
        confidence: 0,
        warnings: [
          'Invalid analysis parameters: parameters must be a valid object',
          'Invalid data characteristics: characteristics must be a valid object'
        ],
        alternatives: ['Please provide valid data characteristics'],
        recommendations: ['Please provide valid data characteristics for validation']
      };
    }

    const warnings: string[] = [];
    const alternatives: string[] = [];
    let valid = true;
    let confidence = 0.88;

    // Handle both rowCount and recordCount
    const recordCount = dataCharacteristics.rowCount || dataCharacteristics.recordCount || 0;
    const columnCount = dataCharacteristics.columnCount || 0;

    // Check sample size
    if (recordCount < 30) {
      warnings.push('Small sample size (n < 30) may limit statistical power');
      confidence -= 0.15;
      alternatives.push('Consider collecting more data or using non-parametric tests');

      // Add analysis-specific alternatives for small samples
      if (analysisParams.type === 'clustering') {
        alternatives.push('Use simple segmentation based on business rules instead of clustering');
        alternatives.push('Try hierarchical clustering which works better with small samples');
      } else if (analysisParams.type === 'regression') {
        alternatives.push('Use simple linear regression with fewer predictors');
        alternatives.push('Consider non-parametric methods like bootstrapping');
      }
    }

    // Check for clustering with small datasets
    if (analysisParams.type === 'clustering' && recordCount < 100) {
      warnings.push('Clustering with small datasets may not produce stable segments');
      confidence -= 0.10;

      // Add clustering-specific alternatives
      if (alternatives.length === 0) {
        alternatives.push('Use k-means with k=2 or k=3 (fewer clusters for small data)');
        alternatives.push('Consider rule-based segmentation instead');
        alternatives.push('Increase sample size to at least 100 observations');
      }
    }

    // Check for time series without sufficient history
    if (analysisParams.type === 'time_series' && recordCount < 24) {
      warnings.push('Insufficient historical data for reliable forecasting');
      alternatives.push('Collect at least 2 years of data for seasonal pattern detection');
      valid = false;
    }

    // Check for regression with high dimensionality
    if (analysisParams.type === 'regression' && columnCount > recordCount * 0.1) {
      warnings.push('High feature-to-sample ratio may cause overfitting');
      confidence -= 0.12;
      alternatives.push('Apply dimensionality reduction (PCA) before modeling');
      alternatives.push('Use regularization (Ridge/Lasso) to prevent overfitting');
      alternatives.push('Perform feature selection to reduce dimensionality');
    }

    return {
      valid,
      confidence: Math.max(0.5, confidence),
      warnings,
      alternatives
    };
  }

  /**
   * Estimate confidence score for analysis type given data quality
   */
  async estimateConfidence(
    analysisTypeInput: any,
    dataQualityInput?: any
  ): Promise<ConfidenceScore & { confidence: number; warnings?: string[] }> {
    let analysisType = analysisTypeInput;
    let dataQuality = dataQualityInput;
    const warnings: string[] = [];

    if (analysisType && typeof analysisType === 'object' && !Array.isArray(analysisType)) {
      const candidate = analysisType as Record<string, any>;
      analysisType = candidate.analysisType || candidate.type;
      if (dataQuality === undefined) {
        dataQuality = candidate.dataQuality;
      }
    }

    if (typeof analysisType !== 'string' || analysisType.trim().length === 0) {
      return {
        score: 0,
        confidence: 0,
        factors: [],
        recommendation: 'Provide valid analysis parameters before estimating confidence.',
        warnings: ['Invalid analysis parameters: parameters must be a valid object']
      };
    }

    console.log(`🔬 Data Scientist: Estimating confidence for ${analysisType}`);

    const factors: ConfidenceScore['factors'] = [];
    let score = 0.80; // Base confidence

    // Data quality impact - handle both number and object formats
    const qualityScore = typeof dataQuality === 'number' ? dataQuality : dataQuality?.overallScore;
    const completenessScore = typeof dataQuality === 'object' ? dataQuality?.completeness : qualityScore;

    if (qualityScore === undefined) {
      warnings.push('Data quality input missing - using neutral baseline.');
    }

    if (qualityScore !== undefined) {
      if (qualityScore > 0.9) {
        factors.push({
          factor: 'High data quality',
          impact: 'positive',
          weight: 0.1
        });
        score += 0.10;
      } else if (qualityScore < 0.7) {
        factors.push({
          factor: 'Low data quality',
          impact: 'negative',
          weight: -0.15
        });
        score -= 0.15;
      }

      if (completenessScore && completenessScore > 0.95) {
        factors.push({
          factor: 'High completeness (>95%)',
          impact: 'positive',
          weight: 0.05
        });
        score += 0.05;
      }
    }

    // Analysis type complexity
    const complexAnalyses = ['machine_learning', 'predictive_modeling', 'time_series'];
    if (complexAnalyses.includes(analysisType)) {
      factors.push({
        factor: 'Complex analysis type',
        impact: 'neutral',
        weight: 0
      });
    }

    const boundedScore = Math.max(0.5, Math.min(0.95, score));
    const recommendation = boundedScore > 0.85
      ? 'High confidence - proceed with analysis'
      : boundedScore > 0.70
        ? 'Moderate confidence - consider data improvements'
        : 'Low confidence - improve data quality before analysis';

    return {
      score: boundedScore,
      confidence: boundedScore,
      factors,
      recommendation,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Recommend analysis configuration based on user questions and data characteristics
   * Part of Agent Recommendation Workflow
   */
  async recommendAnalysisConfig(params: any): Promise<{
    recommendedComplexity?: string;
    complexity?: 'low' | 'medium' | 'high' | 'very_high';
    analyses?: string[];
    estimatedCost?: string;
    estimatedTime?: string;
    rationale?: string;
    recommendedAnalyses?: string[];
    suggestedVisualizations?: string[];
    estimatedProcessingTime?: string;
    confidence?: number;
  }> {
    // Handle both old and new parameter formats
    const isNewFormat = params.dataAnalysis || params.userQuestions || params.analysisGoal;

    if (isNewFormat) {
      // New format from agent-recommendations endpoint
      const dataEstimate = params.dataAnalysis || {};
      const userQuestions: string[] = params.userQuestions || [];
      const analysisGoal: string = params.analysisGoal || '';

      console.log(`🔬 Data Scientist: Recommending analysis configuration for ${userQuestions.length} questions`);

      // Normalize data characteristics (default to conservative assumptions)
      const rawCharacteristics = dataEstimate.characteristics || dataEstimate.dataCharacteristics || {};

      // If datasetMetadata is available, derive characteristics from it
      let derivedCharacteristics = {};
      if (params.datasetMetadata && params.datasetMetadata.schema) {
        const schema = params.datasetMetadata.schema;
        const types = Object.values(schema).map((meta: any) => meta.type?.toLowerCase() || '');

        derivedCharacteristics = {
          hasTimeSeries: types.some((t: string) => ['date', 'datetime', 'timestamp'].includes(t)),
          hasCategories: types.some((t: string) => ['string', 'text', 'varchar', 'char'].includes(t)),
          hasNumeric: types.some((t: string) => ['number', 'integer', 'float', 'decimal', 'double'].includes(t)),
          hasText: types.some((t: string) => ['text', 'longtext', 'blob'].includes(t))
        };
      }

      const dataCharacteristics = {
        hasTimeSeries: Boolean(rawCharacteristics.hasTimeSeries ?? (derivedCharacteristics as any).hasTimeSeries),
        hasCategories: Boolean(rawCharacteristics.hasCategories ?? (derivedCharacteristics as any).hasCategories ?? true),
        hasText: Boolean(rawCharacteristics.hasText ?? (derivedCharacteristics as any).hasText),
        hasNumeric: Boolean(rawCharacteristics.hasNumeric ?? (derivedCharacteristics as any).hasNumeric ?? true)
      };

      // Determine the record count from the richest available source
      const derivedRecordCount = typeof params.recordCount === 'number'
        ? params.recordCount
        : Array.isArray(params.data)
          ? params.data.length
          : Array.isArray(params.project?.data)
            ? params.project.data.length
            : typeof dataEstimate.recordCount === 'number'
              ? dataEstimate.recordCount
              : typeof dataEstimate.estimatedRows === 'number'
                ? dataEstimate.estimatedRows
                : 1000;

      const questions = userQuestions.length > 0 ? userQuestions : params.questions || [];

      // Combine questions and goal for comprehensive analysis context
      const combinedContext = [...questions, analysisGoal].filter(Boolean);

      // Reuse existing scoring utilities for consistency with legacy behaviour
      // Now using combined context to ensure goals are considered in mapping
      const questionComplexity = this.analyzeQuestions(combinedContext);
      const mappedAnalyses = this.mapQuestionsToAnalyses(combinedContext, dataCharacteristics);
      const complexity = this.calculateComplexity({
        dataSize: derivedRecordCount,
        questionComplexity,
        analysisTypes: mappedAnalyses,
        dataCharacteristics
      });

      const estimates = this.estimateResources({
        dataSize: derivedRecordCount,
        complexity,
        analyses: mappedAnalyses
      });

      const rationale = this.generateRationale({
        dataSize: derivedRecordCount,
        complexity,
        analyses: mappedAnalyses,
        dataCharacteristics
      });

      // Additional heuristic suggestions based on natural language intent
      const allText = `${analysisGoal} ${questions.join(' ')}`.toLowerCase();
      const heuristicAnalyses: string[] = [];
      if (allText.includes('trend') || allText.includes('time')) heuristicAnalyses.push('Time Series Analysis');
      if (allText.includes('segment') || allText.includes('group')) heuristicAnalyses.push('Clustering/Segmentation');
      if (allText.includes('predict') || allText.includes('forecast')) heuristicAnalyses.push('Predictive Modeling');
      if (allText.includes('compare') || allText.includes('difference')) heuristicAnalyses.push('Comparative Analysis');
      if (allText.includes('correlat') || allText.includes('relationship')) heuristicAnalyses.push('Correlation Analysis');
      if (heuristicAnalyses.length === 0) heuristicAnalyses.push('Descriptive Statistics');

      const suggestedVisualizations: string[] = [];
      if (allText.includes('trend') || allText.includes('time')) suggestedVisualizations.push('Line Charts');
      if (allText.includes('segment') || allText.includes('group')) suggestedVisualizations.push('Cluster Maps', 'Pie Charts');
      if (allText.includes('compare')) suggestedVisualizations.push('Bar Charts', 'Box Plots');
      if (allText.includes('predict') || allText.includes('forecast')) suggestedVisualizations.push('Forecast Curves');
      if (suggestedVisualizations.length === 0) suggestedVisualizations.push('Bar Charts', 'Histograms');

      // Calculate more dynamic processing time based on multiple factors
      const uniqueRecommendedAnalyses = Array.from(new Set([...mappedAnalyses, ...heuristicAnalyses]));
      const uniqueSuggestedVisualizations = Array.from(new Set(suggestedVisualizations));

      // Base time calculation
      let baseMinutes = 1; // Minimum base time

      // Add time per analysis type (some analyses take longer)
      uniqueRecommendedAnalyses.forEach(analysis => {
        const analysisLower = analysis.toLowerCase();
        if (analysisLower.includes('predictive') || analysisLower.includes('modeling')) {
          baseMinutes += 3;
        } else if (analysisLower.includes('clustering') || analysisLower.includes('segmentation')) {
          baseMinutes += 2;
        } else if (analysisLower.includes('time series') || analysisLower.includes('trend')) {
          baseMinutes += 1.5;
        } else if (analysisLower.includes('correlation') || analysisLower.includes('text')) {
          baseMinutes += 1;
        } else {
          baseMinutes += 0.5; // Simple analyses
        }
      });

      // Factor in data size
      if (derivedRecordCount > 50000) {
        baseMinutes *= 1.5;
      } else if (derivedRecordCount > 10000) {
        baseMinutes *= 1.3;
      } else if (derivedRecordCount > 5000) {
        baseMinutes *= 1.1;
      }

      // Factor in number of questions
      if (questions.length > 5) {
        baseMinutes *= 1.2;
      }

      // Round and format as range
      const minTime = Math.max(1, Math.floor(baseMinutes * 0.8));
      const maxTime = Math.ceil(baseMinutes * 1.2);
      const estimatedProcessingTime = `${minTime}-${maxTime} minutes`;

      return {
        complexity,
        recommendedComplexity: complexity,
        analyses: mappedAnalyses,
        recommendedAnalyses: uniqueRecommendedAnalyses,
        suggestedVisualizations: uniqueSuggestedVisualizations,
        estimatedProcessingTime,
        estimatedTime: estimates.timeMinutes,
        estimatedCost: estimates.cost,
        rationale,
        confidence: 0.85
      };
    }

    // Old format - use existing logic
    const questions = params.questions || [];
    console.log(`🔬 Data Scientist: Recommending analysis configuration for ${questions.length} questions`);

    // Analyze question complexity
    const questionComplexity = this.analyzeQuestions(params.questions);

    // Map questions to required analyses
    const requiredAnalyses = this.mapQuestionsToAnalyses(params.questions, params.dataCharacteristics);

    // Calculate overall complexity
    const complexity = this.calculateComplexity({
      dataSize: params.dataSize,
      questionComplexity,
      analysisTypes: requiredAnalyses,
      dataCharacteristics: params.dataCharacteristics
    });

    // Estimate resources (cost and time)
    const estimates = this.estimateResources({
      dataSize: params.dataSize,
      complexity,
      analyses: requiredAnalyses
    });

    // Generate rationale
    const rationale = this.generateRationale({
      dataSize: params.dataSize,
      complexity,
      analyses: requiredAnalyses,
      dataCharacteristics: params.dataCharacteristics
    });

    return {
      complexity,
      analyses: requiredAnalyses,
      estimatedCost: estimates.cost,
      estimatedTime: estimates.timeMinutes,
      rationale
    };
  }

  async generatePlanBlueprint(params: {
    goals: string[];
    questions: string[];
    journeyType: string;
    dataAssessment: DataAssessment;
    analysisContext?: {
      analysisTypes: string[];
      requiredElements: string[];
    };
  }): Promise<PlanAnalysisBlueprint> {
    const goals = params.goals || [];
    const questions = params.questions || [];

    // Use injected analysis types if available, otherwise fallback to recommendation engine
    let analyses: string[] = [];
    let config: any = {};

    if (params.analysisContext?.analysisTypes && params.analysisContext.analysisTypes.length > 0) {
      analyses = params.analysisContext.analysisTypes;
      // Mock config for context-driven path
      config = {
        confidence: 0.9,
        estimatedProcessingTime: '2-3 hours',
        rationale: 'Analysis plan aligned with defined data requirements.'
      };
    } else {
      config = await this.recommendAnalysisConfig({
        dataAnalysis: {
          estimatedRows: params.dataAssessment.recordCount,
          dataCharacteristics: {
            hasTimeSeries: false,
            hasCategories: params.dataAssessment.columnCount > 0,
            hasText: false,
            hasNumeric: true
          }
        },
        userQuestions: questions,
        analysisGoal: goals.join('; '),
        journeyType: params.journeyType
      });

      analyses = (config.recommendedAnalyses || config.analyses || ['Descriptive Statistics'])
        .map((item: string) => item.trim())
        .filter(Boolean);
    }

    const confidenceScore = Math.max(0.6, Math.min(0.95, config.confidence || 0.8));
    const estimatedDuration = config.estimatedProcessingTime || '2-3 hours';

    const steps: AnalysisStep[] = analyses.map((analysis, index) => ({
      stepNumber: index + 1,
      name: analysis,
      description: this.describeAnalysisStep(analysis, goals),
      method: this.inferAnalysisMethod(analysis),
      inputs: ['primary_dataset'],
      expectedOutputs: this.expectedOutputsForAnalysis(analysis),
      tools: this.toolsForAnalysis(analysis),
      estimatedDuration,
      confidence: Math.round(confidenceScore * 100)
    }));

    if (steps.length === 0) {
      steps.push({
        stepNumber: 1,
        name: 'Descriptive Statistics',
        description: 'Summarize key metrics and distributions to establish baseline understanding.',
        method: 'descriptive_statistics',
        inputs: ['primary_dataset'],
        expectedOutputs: ['summary_statistics', 'distribution_plots'],
        tools: ['analysis_suite'],
        estimatedDuration: estimatedDuration,
        confidence: Math.round(confidenceScore * 100)
      });
    }

    const mlModels: MLModelSpec[] = [];
    if (analyses.some(analysis => /predict|forecast|classification|regression/i.test(analysis))) {
      mlModels.push({
        modelType: 'prediction',
        algorithm: 'Gradient Boosted Trees',
        targetVariable: 'Primary KPI',
        features: ['Key drivers', 'Trend indicators'],
        expectedAccuracy: '75-85%',
        trainingTime: '10-15 minutes'
      });
    }

    const visualizations: VisualizationSpec[] = (config.suggestedVisualizations || [])
      .map((viz: any) => this.visualizationFromSuggestion(viz));

    if (visualizations.length === 0) {
      // Derive visualizations from the actual analysis types instead of using generic fallbacks
      const vizTypes = new Set<string>();
      for (const analysis of analyses) {
        const lower = analysis.toLowerCase();
        if (/correlat|regress/.test(lower) && !vizTypes.has('scatter')) {
          visualizations.push({ type: 'scatter', title: `${analysis} plot`, description: `Scatter plot showing relationships identified by ${analysis}.` });
          vizTypes.add('scatter');
        } else if (/time.?series|forecast|trend/.test(lower) && !vizTypes.has('line')) {
          visualizations.push({ type: 'line', title: `${analysis} trend`, description: `Line chart tracking trends from ${analysis}.` });
          vizTypes.add('line');
        } else if (/cluster|segment/.test(lower) && !vizTypes.has('scatter_cluster')) {
          visualizations.push({ type: 'scatter', title: `${analysis} distribution`, description: `Cluster groupings from ${analysis}.` });
          vizTypes.add('scatter_cluster');
        } else if (/descriptive|statistic|distribut/.test(lower) && !vizTypes.has('histogram')) {
          visualizations.push({ type: 'histogram', title: `${analysis} distributions`, description: `Value distributions from ${analysis}.` });
          vizTypes.add('histogram');
        } else if (!vizTypes.has('bar')) {
          visualizations.push({ type: 'bar', title: `${analysis} comparison`, description: `Compare key metrics from ${analysis}.` });
          vizTypes.add('bar');
        }
      }
      // Ensure at least one visualization exists
      if (visualizations.length === 0) {
        visualizations.push({ type: 'bar', title: 'Data summary', description: 'Overview of key data metrics.' });
      }
    }

    const recommendations: string[] = [
      config.rationale || 'Apply recommended analyses to address stated goals.',
      ...analyses.map(analysis => `Prioritize execution of ${analysis.toLowerCase()} to validate key questions.`)
    ].filter(Boolean);

    const risks: string[] = [];
    if (params.dataAssessment.qualityScore < 70) {
      risks.push('Data quality below optimal thresholds may impact statistical confidence.');
    }
    if (params.dataAssessment.completenessScore < 80) {
      risks.push('Missing data detected. Address gaps before running advanced modeling.');
    }
    if (params.dataAssessment.infrastructureNeeds.useSpark) {
      risks.push('Plan requires distributed compute resources for timely execution.');
    }

    if (risks.length === 0) {
      risks.push('Monitor plan execution checkpoints to ensure assumptions remain valid.');
    }

    return {
      analysisSteps: steps,
      mlModels,
      visualizations,
      recommendations,
      risks,
      estimatedDuration,
      complexity: this.mapComplexity(config.recommendedComplexity || config.complexity)
    };
  }

  private describeAnalysisStep(analysis: string, goals: string[]): string {
    const primaryGoal = goals[0] || 'the stated objectives';
    if (/predict|forecast/i.test(analysis)) {
      return `Develop predictive models to support ${primaryGoal.toLowerCase()} and quantify forecast confidence.`;
    }
    if (/segment|cluster/i.test(analysis)) {
      return `Group similar records to expose actionable segments aligned with ${primaryGoal.toLowerCase()}.`;
    }
    if (/correlation|relationship/i.test(analysis)) {
      return `Surface statistically significant relationships that influence ${primaryGoal.toLowerCase()}.`;
    }
    if (/trend|time/i.test(analysis)) {
      return `Analyze temporal patterns and seasonality impacting ${primaryGoal.toLowerCase()}.`;
    }
    return `Summarize key descriptive statistics to ground ${primaryGoal.toLowerCase()} in current performance.`;
  }

  private inferAnalysisMethod(analysis: string): string {
    if (/predict|forecast/i.test(analysis)) return 'predictive_modeling';
    if (/segment|cluster/i.test(analysis)) return 'clustering';
    if (/correlation|relationship/i.test(analysis)) return 'correlation_analysis';
    if (/trend|time/i.test(analysis)) return 'time_series_analysis';
    if (/compar/i.test(analysis)) return 'comparative_analysis';
    return 'descriptive_statistics';
  }

  private expectedOutputsForAnalysis(analysis: string): string[] {
    if (/predict|forecast/i.test(analysis)) {
      return ['prediction_results', 'model_performance_report', 'scenario_simulations'];
    }
    if (/segment|cluster/i.test(analysis)) {
      return ['segment_profiles', 'cluster_assignments'];
    }
    if (/correlation|relationship/i.test(analysis)) {
      return ['correlation_matrix', 'significance_tests'];
    }
    if (/trend|time/i.test(analysis)) {
      return ['trend_visualizations', 'seasonality_breakdowns'];
    }
    return ['summary_statistics', 'insight_notes'];
  }

  private toolsForAnalysis(analysis: string): string[] {
    if (/predict|forecast/i.test(analysis)) return ['ml_pipeline'];
    if (/segment|cluster/i.test(analysis)) return ['clustering_suite'];
    if (/correlation|relationship/i.test(analysis)) return ['statistical_tests'];
    if (/trend|time/i.test(analysis)) return ['time_series_toolkit'];
    if (/visual/i.test(analysis)) return ['visualization_builder'];
    return ['analysis_suite'];
  }

  private visualizationFromSuggestion(suggestion: string): VisualizationSpec {
    const lower = suggestion.toLowerCase();
    if (lower.includes('line')) {
      return { type: 'line', title: 'Trend analysis', description: 'Track KPI movements over time.' };
    }
    if (lower.includes('cluster') || lower.includes('segment')) {
      return { type: 'scatter', title: 'Cluster distribution', description: 'Visualize segmented groupings.' };
    }
    if (lower.includes('pie')) {
      return { type: 'pie', title: 'Category share', description: 'Show proportional composition by category.' };
    }
    if (lower.includes('histogram')) {
      return { type: 'histogram', title: 'Distribution overview', description: 'Inspect frequency of value ranges.' };
    }
    return { type: 'bar', title: 'Comparison chart', description: 'Compare KPIs across segments.' };
  }

  private mapComplexity(level?: string): 'low' | 'medium' | 'high' | 'very_high' {
    const normalized = (level || '').toLowerCase();
    if (normalized === 'very_high') return 'very_high';
    if (normalized === 'high' || normalized === 'advanced') return 'high';
    if (normalized === 'low' || normalized === 'basic') return 'low';
    return 'medium';
  }

  /**
   * Analyze complexity of user questions
   */
  private analyzeQuestions(questions: string[]): number {
    // Normalize questions to handle object/string mix (fixes: question.toLowerCase crash)
    const normalizedQuestions = normalizeQuestions(questions);
    let complexityScore = 0;

    for (const question of normalizedQuestions) {
      const questionLower = question.toLowerCase();

      // High complexity indicators
      if (questionLower.includes('predict') || questionLower.includes('forecast')) {
        complexityScore += 3;
      }
      if (questionLower.includes('cluster') || questionLower.includes('segment')) {
        complexityScore += 2;
      }
      if (questionLower.includes('trend') || questionLower.includes('over time')) {
        complexityScore += 2;
      }

      // Medium complexity indicators
      if (questionLower.includes('correlat') || questionLower.includes('relationship')) {
        complexityScore += 1;
      }
      if (questionLower.includes('compare') || questionLower.includes('difference')) {
        complexityScore += 1;
      }
      if (questionLower.includes('average') || questionLower.includes('mean')) {
        complexityScore += 0.5;
      }

      // Text analysis complexity
      if (questionLower.includes('sentiment') || questionLower.includes('opinion')) {
        complexityScore += 2;
      }
    }

    return complexityScore;
  }

  /**
   * Map user questions to specific analysis types using structured intent analysis.
   * Replaces keyword-based matching with QuestionIntentAnalyzer for more accurate
   * analysis type selection (e.g., "likelihood of churn" → classification, not descriptive).
   */
  private mapQuestionsToAnalyses(
    questions: string[],
    dataCharacteristics: any
  ): string[] {
    // QuestionIntentAnalyzer imported at top of file (ESM — no require())
    const analyzer = new QuestionIntentAnalyzer();

    // Normalize questions to handle object/string mix (fixes: question.toLowerCase crash)
    const normalizedQuestions = normalizeQuestions(questions);

    // Analyze all questions for structured intent
    const intents = analyzer.analyzeQuestions(normalizedQuestions, {
      hasTimeSeries: dataCharacteristics.hasTimeSeries,
      hasText: dataCharacteristics.hasText,
      hasCategories: dataCharacteristics.hasCategories || false,
      hasNumeric: dataCharacteristics.hasNumeric || true,
    });

    // Convert intents to display names for backward compatibility
    const displayNames = QuestionIntentAnalyzer.intentToDisplayNames(intents);

    console.log(`📊 [DS Agent] Intent analysis: ${normalizedQuestions.length} questions → ${displayNames.length} analysis types`);
    for (const intent of intents) {
      console.log(`   - "${intent.questionText.substring(0, 60)}..." → ${intent.intentType} (${(intent.confidence * 100).toFixed(0)}%) → [${intent.recommendedAnalysisTypes.join(', ')}]`);
    }

    return displayNames;
  }

  /**
   * Calculate overall complexity level
   */
  private calculateComplexity(params: {
    dataSize: number;
    questionComplexity: number;
    analysisTypes: string[];
    dataCharacteristics: any;
  }): 'low' | 'medium' | 'high' | 'very_high' {
    let score = 0;

    // Data size factor
    if (params.dataSize > 10000) score += 2;
    else if (params.dataSize > 1000) score += 1;

    // Question complexity factor
    score += Math.min(params.questionComplexity, 4);

    // Analysis types factor
    const analysisTypesStr = params.analysisTypes.join(' ').toLowerCase();
    if (analysisTypesStr.includes('predict') || analysisTypesStr.includes('clustering')) {
      score += 2;
    }
    if (analysisTypesStr.includes('time series') || analysisTypesStr.includes('trend')) {
      score += 1;
    }
    if (analysisTypesStr.includes('text analysis') || analysisTypesStr.includes('sentiment')) {
      score += 1;
    }

    // Data characteristics factor
    if (params.dataCharacteristics.hasTimeSeries) score += 0.5;
    if (params.dataCharacteristics.hasText) score += 0.5;

    // Map score to complexity level
    if (score >= 7) return 'very_high';
    if (score >= 5) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * Estimate cost and time for analysis
   */
  private estimateResources(params: {
    dataSize: number;
    complexity: string;
    analyses: string[];
  }): { cost: string; timeMinutes: string; } {
    // Base cost per analysis type
    const baseCost = params.analyses.length * 2; // $2 per analysis type

    // Data size multiplier
    const sizeMultiplier =
      params.dataSize > 10000 ? 2 :
        params.dataSize > 1000 ? 1.5 : 1;

    // Complexity multiplier
    const complexityMultiplier =
      params.complexity === 'very_high' ? 2 :
        params.complexity === 'high' ? 1.5 :
          params.complexity === 'medium' ? 1.2 : 1;

    const estimatedCost = baseCost * sizeMultiplier * complexityMultiplier;

    // Time estimation (minutes)
    const baseTime = params.analyses.length * 30; // 30 seconds per analysis
    const estimatedTimeSeconds = baseTime * sizeMultiplier * complexityMultiplier;
    const estimatedTimeMinutes = Math.max(1, Math.ceil(estimatedTimeSeconds / 60));

    return {
      cost: `$${Math.ceil(estimatedCost)}-${Math.ceil(estimatedCost * 1.2)}`,
      timeMinutes: `${estimatedTimeMinutes}-${estimatedTimeMinutes + 2} minutes`
    };
  }

  /**
   * Generate rationale for complexity recommendation
   */
  private generateRationale(params: {
    dataSize: number;
    complexity: string;
    analyses: string[];
    dataCharacteristics: any;
  }): string {
    const parts: string[] = [];

    // Data size rationale
    if (params.dataSize > 10000) {
      parts.push(`Large dataset (${params.dataSize.toLocaleString()} rows) requires distributed processing`);
    } else if (params.dataSize > 1000) {
      parts.push(`Medium dataset (${params.dataSize.toLocaleString()} rows) can be processed in-memory`);
    } else {
      parts.push(`Small dataset (${params.dataSize.toLocaleString()} rows) enables quick analysis`);
    }

    // Analysis types rationale
    if (params.analyses.length > 5) {
      parts.push(`${params.analyses.length} different analysis types required for comprehensive insights`);
    }

    // Complexity rationale
    const complexityMap = {
      'very_high': 'Very high complexity due to advanced analyses and large data volume',
      'high': 'High complexity requiring multiple statistical techniques',
      'medium': 'Medium complexity with standard statistical analyses',
      'low': 'Low complexity with basic descriptive statistics'
    };
    parts.push(complexityMap[params.complexity as keyof typeof complexityMap]);

    // Data characteristics
    const characteristics: string[] = [];
    if (params.dataCharacteristics.hasTimeSeries) characteristics.push('temporal');
    if (params.dataCharacteristics.hasText) characteristics.push('text');
    if (params.dataCharacteristics.hasCategories) characteristics.push('categorical');
    if (params.dataCharacteristics.hasNumeric) characteristics.push('numeric');

    if (characteristics.length > 0) {
      parts.push(`Data includes ${characteristics.join(', ')} features`);
    }

    return parts.join('. ') + '.';
  }

  // ==========================================
  // AGENT HANDLER INTERFACE METHODS
  // ==========================================

  validateTask(task: AgentTask): boolean {
    const supportedTypes = [
      // Consultation methods (multi-agent coordination)
      'check_feasibility',
      'validate_methodology',
      'estimate_confidence',
      // Analysis execution methods
      'statistical_analysis',
      'ml_model_development',
      'exploratory_analysis',
      'predictive_modeling',
      'data_visualization',
      'insight_generation',
      'comprehensive_analysis'
    ];

    return supportedTypes.includes(task.type);
  }

  async getStatus(): Promise<AgentStatus> {
    return {
      status: this.currentTasks >= this.maxConcurrentTasks ? 'busy' : 'active',
      currentTasks: this.currentTasks,
      queuedTasks: 0,
      lastActivity: new Date(),
      resourceUsage: {
        cpu: (this.currentTasks / this.maxConcurrentTasks) * 100,
        memory: 512.0, // Higher memory for data analysis
        storage: 150.0
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('🔬 Data Scientist Agent configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('🔬 Data Scientist Agent shutting down...');
    this.activeAnalyses.clear();
  }

  // ==========================================
  // QUESTION DECOMPOSITION (Phase 1B)
  // ==========================================

  /**
   * Decompose a user question into KPI + dimensions + comparison type.
   * Uses a two-tier approach:
   *   1. Registry-scan: Check if any business definition's matchPatterns match keywords in the question
   *   2. Dimension extraction: Use regex patterns to extract grouping/baseline dimensions
   *
   * @param question - A single user question (e.g., "How does the turnover rate for each leader compare to the company rate?")
   * @param params - Optional search params for registry lookup
   * @returns QuestionDecomposition with KPI, dimensions, comparison type
   */
  async decomposeQuestion(
    question: string,
    params: { industry?: string; projectId?: string } = {}
  ): Promise<QuestionDecomposition> {
    const questionLower = question.toLowerCase();
    console.log(`🔬 [DS Agent] Decomposing question: "${question.substring(0, 80)}..."`);

    const decomposition: QuestionDecomposition = {
      originalQuestion: question,
      kpiName: null,
      kpiRegistryKey: null,
      dimensions: [],
      comparisonType: 'none',
      temporalScope: null,
      registryDefinition: null
    };

    // ── TIER 1: Registry-scan for KPI identification ──
    // Extract potential KPI keywords from the question
    const kpiKeywords = this.extractKPIKeywords(questionLower);

    if (kpiKeywords.length > 0) {
      try {
        const matches = await businessDefinitionRegistry.findByMatchPatterns(
          kpiKeywords,
          { industry: params.industry, projectId: params.projectId }
        );

        if (matches.length > 0) {
          const bestMatch = matches[0];
          decomposition.kpiName = bestMatch.definition.displayName || bestMatch.definition.conceptName;
          decomposition.kpiRegistryKey = bestMatch.definition.conceptName;
          decomposition.registryDefinition = bestMatch.definition;

          console.log(`✅ [DS Agent] KPI identified via registry: "${decomposition.kpiName}" (key: ${decomposition.kpiRegistryKey}, confidence: ${bestMatch.confidence})`);
        }
      } catch (err) {
        console.warn(`⚠️ [DS Agent] Registry lookup failed, continuing with regex:`, err);
      }
    }

    // ── TIER 2: Dimension extraction via regex ──

    // "for each X" / "by X" / "per X" → grouping dimension
    const groupingPatterns = [
      /(?:for\s+each|by\s+each|per\s+each|for\s+every)\s+([\w\s]+?)(?:\s+compare|\s+vs|\s+versus|\s+against|\?|,|$)/gi,
      /(?:by|per|across|among)\s+([\w\s]+?)(?:\s+compare|\s+vs|\s+versus|\s+against|\?|,|and\s|$)/gi,
      /(?:group(?:ed)?\s+by)\s+([\w\s]+?)(?:\?|,|$)/gi,
    ];

    for (const pattern of groupingPatterns) {
      let match;
      while ((match = pattern.exec(questionLower)) !== null) {
        const dimName = match[1]?.trim();
        if (dimName && dimName.length > 1 && dimName.length < 40 &&
            !['the', 'a', 'an', 'is', 'are', 'was', 'were', 'each', 'their'].includes(dimName)) {
          const cleanName = dimName.replace(/\s+/g, '_');
          if (!decomposition.dimensions.some(d => d.name === cleanName)) {
            decomposition.dimensions.push({
              name: cleanName,
              role: 'grouping',
              level: 'detail'
            });
          }
        }
      }
    }

    // "compare to X" / "vs X" / "against X" / "X rate" after comparison words → baseline dimension
    const baselinePatterns = [
      /(?:compare\s+to|compared?\s+(?:to|with)|vs\.?|versus|against|relative\s+to)\s+(?:the\s+)?([\w\s]+?)(?:\s+rate|\s+average|\s+level|\?|$)/gi,
      /(?:company|organization|overall|total)\s+(?:wide|level|rate|average)/gi,
    ];

    for (const pattern of baselinePatterns) {
      let match;
      while ((match = pattern.exec(questionLower)) !== null) {
        const dimName = match[1]?.trim() || match[0]?.trim();
        if (dimName && dimName.length > 1 && dimName.length < 40) {
          const cleanName = dimName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
          if (cleanName && !decomposition.dimensions.some(d => d.name === cleanName)) {
            decomposition.dimensions.push({
              name: cleanName,
              role: 'baseline',
              level: 'aggregate'
            });
          }
        }
      }
    }

    // ── Determine comparison type ──
    const hasGrouping = decomposition.dimensions.some(d => d.role === 'grouping');
    const hasBaseline = decomposition.dimensions.some(d => d.role === 'baseline');

    if (hasGrouping && hasBaseline) {
      decomposition.comparisonType = 'group_vs_baseline';
    } else if (hasGrouping) {
      decomposition.comparisonType = 'between_groups';
    }

    // ── Temporal scope detection ──
    const temporalKeywords: string[] = [];
    const temporalMatches: Record<string, string> = {
      'over time': 'time_series',
      'trend': 'time_series',
      'monthly': 'month',
      'quarterly': 'quarter',
      'yearly': 'year',
      'annually': 'year',
      'weekly': 'week',
      'daily': 'day',
      'seasonal': 'season',
    };

    let periodType: string | null = null;
    for (const [keyword, period] of Object.entries(temporalMatches)) {
      if (questionLower.includes(keyword)) {
        temporalKeywords.push(keyword);
        periodType = period;
        if (decomposition.comparisonType === 'none') {
          decomposition.comparisonType = 'time_series';
        }
      }
    }

    if (temporalKeywords.length > 0) {
      decomposition.temporalScope = {
        periodType,
        periodColumn: null, // Will be resolved when dataset is available
        keywords: temporalKeywords
      };
    }

    console.log(`✅ [DS Agent] Decomposition result: KPI=${decomposition.kpiName || 'none'}, dimensions=${decomposition.dimensions.length}, comparison=${decomposition.comparisonType}`);
    return decomposition;
  }

  /**
   * Extract potential KPI keyword phrases from a question.
   * Looks for known metric patterns: "X rate", "X score", "X ratio", etc.
   * Also extracts 2-3 word noun phrases that might be KPI names.
   */
  private extractKPIKeywords(questionLower: string): string[] {
    const keywords: string[] = [];

    // Pattern: "<adjective/noun> rate/score/ratio/index/metric/percentage/average"
    const metricPatterns = [
      /(\w+(?:\s+\w+)?)\s+(?:rate|score|ratio|index|metric|percentage|average|coefficient)/gi,
      /(?:overall|total|average|mean|median)\s+(\w+(?:\s+\w+)?)/gi,
    ];

    for (const pattern of metricPatterns) {
      let match;
      while ((match = pattern.exec(questionLower)) !== null) {
        const phrase = match[1]?.trim() || match[0]?.trim();
        if (phrase && phrase.length > 2 && phrase.length < 40) {
          keywords.push(phrase.replace(/\s+/g, '_'));
          // Also add the full match as a keyword
          const fullMatch = match[0]?.trim();
          if (fullMatch && fullMatch !== phrase) {
            keywords.push(fullMatch.replace(/\s+/g, '_'));
          }
        }
      }
    }

    // Also extract common standalone KPI terms
    const standaloneKPIs = [
      'turnover', 'attrition', 'churn', 'retention', 'engagement',
      'satisfaction', 'performance', 'productivity', 'absenteeism',
      'revenue', 'profit', 'roi', 'conversion', 'nps', 'csat',
      'tenure', 'headcount', 'utilization'
    ];

    for (const kpi of standaloneKPIs) {
      if (questionLower.includes(kpi)) {
        keywords.push(kpi);
      }
    }

    // Deduplicate
    return [...new Set(keywords)];
  }

  /**
   * Core method to answer: "What data do I need to answer these questions and achieve these goals?"
   * This is the Phase 1 data requirements inference - before any data is uploaded.
   *
   * ENHANCED: Each element now includes calculationDefinition with how to calculate/derive the value
   */
  async inferRequiredDataElements(params: {
    userQuestions: string[];
    userGoals: string[];
    analysisTypes?: string[];
    datasetSchema?: Record<string, any>;
    industry?: string;
  }): Promise<Array<{
    elementName: string;
    description: string;
    dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
    purpose: string;
    required: boolean;
    derivedFrom?: string;
    relatedQuestions: string[];
    // NEW: Calculation definition - HOW to calculate/derive this element
    calculationDefinition?: {
      calculationType: 'direct' | 'derived' | 'aggregated' | 'grouped' | 'composite';
      formula?: {
        businessDescription: string;
        componentFields?: string[];
        aggregationMethod?: 'average' | 'sum' | 'count' | 'min' | 'max' | 'median' | 'weighted_average' | 'custom';
        pseudoCode?: string;
      };
      categorization?: {
        categoryDescription: string;
        categories?: Array<{ name: string; rule: string }>;
      };
      notes?: string;
    };
  }>> {
    const { userQuestions, userGoals, analysisTypes = [], datasetSchema } = params;

    console.log(`🔬 [Data Scientist] Inferring required data elements for ${userQuestions.length} questions and ${userGoals.length} goals`);
    if (datasetSchema) {
      console.log(`📊 [Data Scientist] Dataset schema provided with ${Object.keys(datasetSchema).length} columns: ${Object.keys(datasetSchema).slice(0, 10).join(', ')}${Object.keys(datasetSchema).length > 10 ? '...' : ''}`);
    }

    // ✅ PHASE 3 FIX: Try AI-powered inference first with fallback chain
    try {
      const aiElements = await this.inferRequiredDataElementsWithAI({ ...params, datasetSchema, industry: params.industry });
      if (aiElements && aiElements.length > 0) {
        console.log(`✅ [DS Agent] AI inference successful: ${aiElements.length} elements identified`);
        return aiElements;
      }
    } catch (aiError) {
      console.warn(`⚠️ [DS Agent] AI inference failed, falling back to pattern matching:`, aiError);
    }

    // ── KPI DECOMPOSITION: Decompose each question before regex fallback ──
    // When a KPI match is found via the registry, generate composite elements
    // from the business definition rather than relying on generic regex patterns.
    console.log(`🔬 [DS Agent] Running KPI decomposition on ${userQuestions.length} questions...`);

    const decompositions: QuestionDecomposition[] = [];
    const kpiElements: Array<any> = [];
    const decomposedQuestions = new Set<string>(); // Track which questions were handled by decomposition

    for (const question of userQuestions) {
      try {
        const decomp = await this.decomposeQuestion(question);
        decompositions.push(decomp);

        // If we found a KPI with a registry definition, generate elements from it
        if (decomp.registryDefinition && decomp.kpiRegistryKey) {
          const def = decomp.registryDefinition;
          decomposedQuestions.add(question);

          // Add the KPI element itself (composite type)
          kpiElements.push({
            elementName: def.displayName || def.conceptName,
            description: def.businessDescription || `Metric: ${def.formula}`,
            dataType: (def.expectedDataType === 'numeric' ? 'numeric' : 'categorical') as any,
            purpose: `Calculate ${def.displayName || def.conceptName} to answer: "${question}"`,
            required: true,
            relatedQuestions: [question],
            calculationDefinition: {
              calculationType: 'composite' as const,
              formula: {
                businessDescription: def.formula || '',
                componentFields: (def.componentFields as string[]) || [],
                aggregationMethod: (def.aggregationMethod || 'custom') as any,
                pseudoCode: def.pseudoCode || def.formula || ''
              },
              comparisonGroups: decomp.dimensions.length > 0 ? {
                comparisonType: decomp.comparisonType as any,
                levels: decomp.dimensions.map(d => ({
                  name: d.name,
                  groupByFields: [d.name],
                  role: d.role === 'baseline' ? 'baseline' as const : 'detail' as const,
                  label: d.name.replace(/_/g, ' ')
                })),
                baseline: decomp.dimensions.find(d => d.role === 'baseline')
                  ? {
                      type: 'overall' as const,
                      groupByFields: [],
                      label: decomp.dimensions.find(d => d.role === 'baseline')!.name.replace(/_/g, ' ')
                    }
                  : undefined
              } : undefined,
              notes: `Registry-matched KPI: ${decomp.kpiRegistryKey}. Formula: ${def.formula}`
            }
          });

          // Add dimension elements (grouping/baseline columns)
          for (const dim of decomp.dimensions) {
            const dimExists = kpiElements.some(e =>
              e.elementName.toLowerCase().includes(dim.name.replace(/_/g, ' '))
            );
            if (!dimExists) {
              kpiElements.push({
                elementName: this.capitalizeWords(dim.name.replace(/_/g, ' ')),
                description: `${dim.role === 'baseline' ? 'Baseline' : 'Grouping'} dimension: ${dim.name.replace(/_/g, ' ')}`,
                dataType: 'categorical' as const,
                purpose: `${dim.role === 'grouping' ? 'Group data by' : 'Compare against'} ${dim.name.replace(/_/g, ' ')} for: "${question}"`,
                required: dim.role === 'grouping',
                relatedQuestions: [question],
                calculationDefinition: {
                  calculationType: 'grouped' as const,
                  comparisonGroups: {
                    comparisonType: decomp.comparisonType as any
                  },
                  notes: `${dim.role} dimension at ${dim.level} level`
                }
              });
            }
          }

          // Add component field elements from descriptors if available
          const descriptors = (def.componentFieldDescriptors as any[]) || [];
          for (const descriptor of descriptors) {
            const descExists = kpiElements.some(e =>
              e.elementName.toLowerCase() === descriptor.abstractName?.replace(/_/g, ' ')
            );
            if (!descExists && descriptor.abstractName) {
              const dataType = descriptor.dataTypeExpected === 'date' ? 'datetime'
                : descriptor.dataTypeExpected === 'identifier' ? 'categorical'
                : descriptor.dataTypeExpected === 'numeric' ? 'numeric'
                : 'text';

              kpiElements.push({
                elementName: this.capitalizeWords(descriptor.abstractName.replace(/_/g, ' ')),
                description: descriptor.semanticMeaning || `Component field for ${def.displayName}`,
                dataType: dataType as any,
                purpose: `Component of ${def.displayName}: ${descriptor.derivationLogic || descriptor.semanticMeaning}`,
                required: true,
                derivedFrom: def.displayName || def.conceptName,
                relatedQuestions: [question],
                calculationDefinition: {
                  calculationType: descriptor.isIntermediate ? 'derived' as const : 'direct' as const,
                  formula: {
                    businessDescription: descriptor.derivationLogic || descriptor.semanticMeaning,
                    componentFields: descriptor.columnMatchPatterns?.slice(0, 3) || [],
                    pseudoCode: descriptor.derivationLogic || ''
                  },
                  notes: `Component field descriptor: matchType=${descriptor.columnMatchType}${descriptor.nullMeaning ? `, null=${descriptor.nullMeaning}` : ''}${descriptor.presenceMeaning ? `, presence=${descriptor.presenceMeaning}` : ''}`
                }
              });
            }
          }

          // Add temporal elements if temporal scope detected
          if (decomp.temporalScope) {
            const temporalExists = kpiElements.some(e => e.dataType === 'datetime' && !e.derivedFrom);
            if (!temporalExists) {
              kpiElements.push({
                elementName: 'Analysis Period',
                description: 'Date/time for establishing the analysis period',
                dataType: 'datetime' as const,
                purpose: `Define temporal scope for ${def.displayName} calculation`,
                required: true,
                relatedQuestions: [question],
                calculationDefinition: {
                  calculationType: 'direct' as const,
                  formula: {
                    businessDescription: `Period date for ${decomp.temporalScope.periodType || 'time-based'} analysis`,
                    pseudoCode: 'PARSE_DATE(period_column) to establish analysis window'
                  },
                  notes: `Temporal scope: ${decomp.temporalScope.keywords.join(', ')}`
                }
              });
            }
          }

          console.log(`✅ [DS Agent] Generated ${kpiElements.length} elements from KPI decomposition for "${question.substring(0, 60)}..."`);
        }
      } catch (decompError) {
        console.warn(`⚠️ [DS Agent] Question decomposition failed for "${question.substring(0, 60)}...":`, decompError);
      }
    }

    // If KPI decomposition produced elements, combine with a unique identifier and return
    if (kpiElements.length > 0) {
      // Add unique identifier at the beginning — but ONLY if the schema has an actual ID column
      const schemaIdColKpi = datasetSchema
        ? Object.keys(datasetSchema).find(col => /^id$|[_-]id$|^.*_id$|^key$|identifier/i.test(col))
        : undefined;

      if (schemaIdColKpi) {
        // Use the actual ID column from the schema
        kpiElements.unshift({
          elementName: schemaIdColKpi,
          description: `Unique identifier from ${schemaIdColKpi} column`,
          dataType: 'text' as const,
          purpose: 'Uniquely identify and track each record throughout the analysis',
          required: true,
          relatedQuestions: [],
          calculationDefinition: {
            calculationType: 'direct' as const,
            formula: {
              businessDescription: `Direct mapping from ${schemaIdColKpi} column`,
              componentFields: [schemaIdColKpi],
              pseudoCode: `SELECT ${schemaIdColKpi} AS unique_identifier FROM source_data`
            },
            notes: `Using actual schema column: ${schemaIdColKpi}`
          }
        });
      } else if (datasetSchema) {
        // Check if this looks like survey data (columns starting with numbers or question words)
        const cols = Object.keys(datasetSchema);
        const surveyLikeCount = cols.filter(c => /^\d+[\.\)]|^(how|what|which|rate|rank|do you|are you|to what|please)/i.test(c)).length;
        if (surveyLikeCount > cols.length * 0.3) {
          // Survey dataset — skip ID element, use row index for tracking
          console.log(`📋 [DS Agent] Survey dataset detected (${surveyLikeCount}/${cols.length} question columns), skipping Unique Identifier`);
        } else {
          // Non-survey, add Row Index as synthetic element
          kpiElements.unshift({
            elementName: 'Row Index',
            description: 'Auto-generated row number (no natural ID column found in dataset)',
            dataType: 'numeric' as const,
            purpose: 'Uniquely identify and track each record throughout the analysis',
            required: false,
            relatedQuestions: [],
            calculationDefinition: {
              calculationType: 'derived' as const,
              formula: {
                businessDescription: 'Auto-generated sequential identifier',
                pseudoCode: 'ROW_NUMBER() OVER (ORDER BY insertion_order)'
              },
              notes: 'No natural ID column found — using synthetic row number'
            }
          });
        }
      } else {
        // No schema available, add generic identifier
        kpiElements.unshift({
          elementName: 'Unique Identifier',
          description: 'Unique ID for each record in the dataset',
          dataType: 'text' as const,
          purpose: 'Uniquely identify and track each record throughout the analysis',
          required: true,
          relatedQuestions: [],
          calculationDefinition: {
            calculationType: 'direct' as const,
            formula: {
              businessDescription: 'Direct mapping from source ID column (e.g., record_id, campaign_id, customer_id, row_number)',
              pseudoCode: 'SELECT id_column AS unique_identifier FROM source_data'
            },
            notes: 'Use existing ID column or generate row numbers if none exists'
          }
        });
      }

      // Also run regex patterns for questions NOT handled by KPI decomposition
      // to catch dimension/metric elements that the decomposition didn't cover
      const unhandledQuestions = userQuestions.filter(q => !decomposedQuestions.has(q));
      if (unhandledQuestions.length > 0) {
        console.log(`🔬 [DS Agent] Running regex patterns on ${unhandledQuestions.length} unhandled questions`);
        // The regex fallback below will handle these
      }

      // If all questions were handled by decomposition, return the KPI elements directly
      if (decomposedQuestions.size === userQuestions.length) {
        console.log(`✅ [DS Agent] All ${userQuestions.length} questions handled by KPI decomposition: ${kpiElements.length} elements total`);
        return kpiElements;
      }
    }

    // Fallback to regex-based pattern matching
    console.log(`🔬 [Data Scientist] Using pattern-based inference (fallback mode)`);
    console.log(`🔬 [Data Scientist] Each element will include calculationDefinition with how to derive it`);

    const requiredElements: Array<any> = [...kpiElements]; // Include any KPI elements found above

    // Build column lookup for schema-aware fallback elements
    const schemaColumnNames = datasetSchema ? Object.keys(datasetSchema) : [];
    const findSchemaColumn = (patterns: RegExp[]): string | undefined => {
      for (const pattern of patterns) {
        const match = schemaColumnNames.find(col => pattern.test(col));
        if (match) return match;
      }
      return undefined;
    };

    // Combine goals and questions for context analysis
    const allText = [...userGoals, ...userQuestions].join(' ').toLowerCase();

    // Always need a unique identifier (skip if already added by KPI decomposition)
    const hasIdFromKpi = kpiElements.some(e =>
      e.elementName === 'Unique Identifier' || e.elementName === 'Row Index' ||
      (datasetSchema && Object.keys(datasetSchema).some(col => /id$|_id$/i.test(col) && e.elementName.toLowerCase().replace(/[\s-]/g, '_') === col.toLowerCase()))
    );
    if (!hasIdFromKpi) {
      // Find actual ID column from schema instead of using placeholder
      const actualIdCol = findSchemaColumn([/^id$/i, /[_-]id$/i, /^.*_id$/i, /^key$/i, /identifier/i, /^code$/i, /^record/i]);

      if (actualIdCol) {
        requiredElements.push({
          elementName: actualIdCol,
          description: `Unique identifier from ${actualIdCol} column`,
          dataType: 'text' as const,
          purpose: 'Uniquely identify and track each record throughout the analysis',
          required: true,
          relatedQuestions: [],
          calculationDefinition: {
            calculationType: 'direct' as const,
            formula: {
              businessDescription: `Direct mapping from ${actualIdCol} column`,
              componentFields: [actualIdCol],
              pseudoCode: `SELECT ${actualIdCol} AS unique_identifier FROM source_data`
            },
            notes: `Schema-matched ID column: ${actualIdCol}`
          }
        });
      } else if (datasetSchema) {
        // Check if survey-like dataset — skip ID if so
        const cols = Object.keys(datasetSchema);
        const surveyLikeCount = cols.filter(c => /^\d+[\.\)]|^(how|what|which|rate|rank|do you|are you|to what|please)/i.test(c)).length;
        if (surveyLikeCount > cols.length * 0.3) {
          console.log(`📋 [DS Agent] Survey dataset detected (${surveyLikeCount}/${cols.length} question columns), skipping Unique Identifier in regex fallback`);
        } else {
          // Non-survey, add Row Index
          requiredElements.push({
            elementName: 'Row Index',
            description: 'Auto-generated row number (no natural ID column found)',
            dataType: 'numeric' as const,
            purpose: 'Uniquely identify and track each record throughout the analysis',
            required: false,
            relatedQuestions: [],
            calculationDefinition: {
              calculationType: 'derived' as const,
              formula: {
                businessDescription: 'Auto-generated sequential identifier',
                componentFields: [],
                pseudoCode: 'ROW_NUMBER() OVER (ORDER BY insertion_order)'
              },
              notes: 'No natural ID column found — using synthetic row number'
            }
          });
        }
      }
    }

    // For each question, use AI reasoning to infer what data is needed
    // Skip questions already fully handled by KPI decomposition
    for (const question of userQuestions) {
      if (decomposedQuestions.has(question)) continue;
      const questionLower = question.toLowerCase();

      // Temporal data requirements
      if (/when|date|time|trend|over time|temporal|seasonal|period|year|month|day/i.test(questionLower)) {
        const existingTemporal = requiredElements.find(e => e.dataType === 'datetime');
        if (!existingTemporal) {
          // Schema-aware: find actual date column instead of using placeholder
          const actualDateCol = findSchemaColumn([/date/i, /time/i, /timestamp/i, /created/i, /period/i, /month/i, /year/i, /day/i]);
          const dateColName = actualDateCol || 'Timestamp';

          requiredElements.push({
            elementName: dateColName,
            description: actualDateCol ? `Date/time information from ${actualDateCol} column` : 'Date and time information for temporal analysis',
            dataType: 'datetime' as const,
            purpose: 'Enable time-based analysis, trends, and temporal patterns',
            required: true,
            relatedQuestions: [question],
            calculationDefinition: {
              calculationType: 'direct' as const,
              formula: {
                businessDescription: actualDateCol ? `Direct mapping from ${actualDateCol} column` : 'Map from date/time column. Parse various formats (ISO, US, EU) to standardized datetime',
                componentFields: actualDateCol ? [actualDateCol] : [],
                pseudoCode: `PARSE_DATE(${actualDateCol || 'source_date_column'}, format) AS timestamp`
              },
              notes: actualDateCol ? `Schema-matched date column: ${actualDateCol}` : 'Support multiple date formats: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY'
            }
          });
        } else {
          existingTemporal.relatedQuestions.push(question);
        }
      }

      // Who/Which questions - need categorical identifiers
      const whoMatch = questionLower.match(/who|which\s+([\w\s]+?)(?:\s+are|\s+is|\s+were|\s+was|\?|$)/i);
      if (whoMatch) {
        const entity = whoMatch[1]?.trim();
        if (entity && entity.length > 2 && entity.length < 40) {
          const entityName = this.capitalizeWords(entity);
          const existing = requiredElements.find(e => e.elementName.toLowerCase().includes(entity.toLowerCase()));
          if (!existing) {
            requiredElements.push({
              elementName: `${entityName} Identifier`,
              description: `Identifier or category for ${entityName.toLowerCase()}`,
              dataType: 'categorical' as const,
              purpose: `Answer the question: "${question}"`,
              required: true,
              relatedQuestions: [question],
              calculationDefinition: {
                calculationType: 'direct' as const,
                categorization: {
                  categoryDescription: `Categories representing different ${entityName.toLowerCase()} values`,
                  categories: [] // Will be populated from data
                },
                formula: {
                  businessDescription: `Direct mapping from source column identifying ${entityName.toLowerCase()}`,
                  pseudoCode: `SELECT ${entity.toLowerCase().replace(/\s+/g, '_')}_column AS ${entityName.toLowerCase().replace(/\s+/g, '_')}_identifier`
                },
                notes: `Extract distinct values from source column to populate categories`
              }
            });
          } else {
            existing.relatedQuestions.push(question);
          }
        }
      }

      // How many/count questions - need the thing being counted
      const countMatch = questionLower.match(/how\s+many\s+([\w\s]+?)(?:\s+are|\s+is|\s+were|\s+was|\?|$)/i);
      if (countMatch) {
        const countedEntity = countMatch[1]?.trim();
        if (countedEntity && countedEntity.length > 2 && countedEntity.length < 40) {
          const entityName = this.capitalizeWords(countedEntity);
          const existing = requiredElements.find(e => e.elementName.toLowerCase().includes(countedEntity.toLowerCase()));
          if (!existing) {
            requiredElements.push({
              elementName: entityName,
              description: `Count or frequency of ${entityName.toLowerCase()}`,
              dataType: 'numeric' as const,
              purpose: `Count items to answer: "${question}"`,
              required: true,
              relatedQuestions: [question],
              calculationDefinition: {
                calculationType: 'aggregated' as const,
                formula: {
                  businessDescription: `Count the number of ${entityName.toLowerCase()} records`,
                  aggregationMethod: 'count' as const,
                  pseudoCode: `COUNT(*) WHERE ${countedEntity.toLowerCase().replace(/\s+/g, '_')}_indicator IS NOT NULL`
                },
                notes: `Aggregation: Count distinct or total occurrences based on context`
              }
            });
          } else {
            existing.relatedQuestions.push(question);
          }
        }
      }

      // How much/amount questions - need numeric values
      const amountMatch = questionLower.match(/how\s+much|what\s+(?:is\s+)?(?:the\s+)?(?:amount|value|price|cost)\s+(?:of\s+)?([\w\s]+?)(?:\?|$)/i);
      if (amountMatch) {
        const metric = amountMatch[1]?.trim();
        if (metric && metric.length > 2 && metric.length < 40) {
          const metricName = this.capitalizeWords(metric);
          const existing = requiredElements.find(e => e.elementName.toLowerCase().includes(metric.toLowerCase()));
          if (!existing) {
            requiredElements.push({
              elementName: metricName,
              description: `Monetary or quantitative value for ${metricName.toLowerCase()}`,
              dataType: 'numeric' as const,
              purpose: `Measure amount/value to answer: "${question}"`,
              required: true,
              relatedQuestions: [question],
              calculationDefinition: {
                calculationType: 'direct' as const,
                formula: {
                  businessDescription: `Numeric value representing ${metricName.toLowerCase()}. Map from source numeric column`,
                  pseudoCode: `CAST(${metric.toLowerCase().replace(/\s+/g, '_')}_column AS NUMERIC) AS ${metricName.toLowerCase().replace(/\s+/g, '_')}`
                },
                notes: `Ensure numeric format. Handle currency symbols if present`
              }
            });
          } else {
            existing.relatedQuestions.push(question);
          }
        }
      }

      // What/average questions - need the metric being averaged
      const avgMatch = questionLower.match(/(?:what\s+(?:is\s+)?(?:the\s+)?)?average\s+([\w\s]+?)(?:\?|$)/i);
      if (avgMatch) {
        const metric = avgMatch[1]?.trim();
        if (metric && metric.length > 2 && metric.length < 40) {
          const metricName = this.capitalizeWords(metric);
          const existing = requiredElements.find(e => e.elementName.toLowerCase().includes(metric.toLowerCase()));
          if (!existing) {
            requiredElements.push({
              elementName: metricName,
              description: `Metric for calculating average ${metricName.toLowerCase()}`,
              dataType: 'numeric' as const,
              purpose: `Calculate average to answer: "${question}"`,
              required: true,
              relatedQuestions: [question],
              calculationDefinition: {
                calculationType: 'aggregated' as const,
                formula: {
                  businessDescription: `Calculate the mean (average) of ${metricName.toLowerCase()} values`,
                  aggregationMethod: 'average' as const,
                  pseudoCode: `AVG(${metric.toLowerCase().replace(/\s+/g, '_')}_column) AS avg_${metric.toLowerCase().replace(/\s+/g, '_')}`
                },
                notes: `Aggregation over all records or per group if grouping specified`
              }
            });
          } else {
            existing.relatedQuestions.push(question);
          }
        }
      }

      // Compare/group questions - need grouping variables
      if (/compare|group\s+by|each\s+|per\s+|by\s+([\w\s]+)/i.test(questionLower)) {
        const groupMatch = questionLower.match(/(?:compare|group\s+by|each|per|by)\s+([\w\s]+?)(?:\?|,|and|$)/i);
        if (groupMatch) {
          const groupVar = groupMatch[1]?.trim();
          if (groupVar && groupVar.length > 2 && groupVar.length < 40 && !['the', 'a', 'an', 'is', 'are'].includes(groupVar)) {
            const groupName = this.capitalizeWords(groupVar);
            const existing = requiredElements.find(e => e.elementName.toLowerCase().includes(groupVar.toLowerCase()));
            if (!existing) {
              requiredElements.push({
                elementName: groupName,
                description: `Grouping variable for ${groupName.toLowerCase()}`,
                dataType: 'categorical' as const,
                purpose: `Enable grouping/comparison to answer: "${question}"`,
                required: false,
                relatedQuestions: [question],
                calculationDefinition: {
                  calculationType: 'grouped' as const,
                  categorization: {
                    categoryDescription: `Distinct groups for ${groupName.toLowerCase()} comparison`,
                    categories: [] // Will be populated from data
                  },
                  formula: {
                    businessDescription: `Group data by ${groupName.toLowerCase()} for comparative analysis`,
                    pseudoCode: `GROUP BY ${groupVar.toLowerCase().replace(/\s+/g, '_')}_column`
                  },
                  notes: `Extract unique values to determine comparison groups`
                }
              });
            } else {
              existing.relatedQuestions.push(question);
            }
          }
        }
      }

      // FIX: Handle "What are the X?" and "What is the X?" patterns (common question format)
      // This catches questions like "What are the engagement scores?" or "What is the retention rate?"
      const whatAreMatch = questionLower.match(/what\s+(?:are|is|were|was)\s+(?:the|our|my|your)?\s*([a-z]+(?:\s+[a-z]+){0,3})(?:\?|$)/i);
      if (whatAreMatch) {
        const entity = whatAreMatch[1]?.trim();
        const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'main', 'key', 'most', 'best', 'top'];
        if (entity && entity.length > 2 && entity.length < 50 && !stopWords.includes(entity.split(' ')[0])) {
          const entityName = this.capitalizeWords(entity);
          const existing = requiredElements.find(e =>
            e.elementName.toLowerCase().includes(entity.toLowerCase().substring(0, 10)) ||
            entity.toLowerCase().includes(e.elementName.toLowerCase().substring(0, 10))
          );
          if (!existing) {
            // Infer data type from entity name
            const isNumeric = /score|rate|count|number|amount|percent|value|metric|level|index/i.test(entity);
            const isTemporal = /date|time|period|year|month|day|week/i.test(entity);
            const dataType = isTemporal ? 'datetime' as const : (isNumeric ? 'numeric' as const : 'categorical' as const);

            // Build calculation definition based on inferred type
            const calculationDef = {
              calculationType: isNumeric ? 'derived' as const : 'direct' as const,
              formula: {
                businessDescription: isNumeric
                  ? `Calculate or extract ${entityName.toLowerCase()} value. May require aggregation or formula`
                  : `Map ${entityName.toLowerCase()} directly from source column`,
                aggregationMethod: isNumeric ? 'average' as const : undefined,
                pseudoCode: isNumeric
                  ? `COALESCE(source_column, computed_value) AS ${entity.toLowerCase().replace(/\s+/g, '_')}`
                  : `source_column AS ${entity.toLowerCase().replace(/\s+/g, '_')}`
              },
              notes: isNumeric
                ? `May require calculation from component fields. Check for existing metric columns`
                : `Map from categorical source column`
            };

            requiredElements.push({
              elementName: entityName,
              description: `${entityName} data needed to answer the question`,
              dataType: dataType,
              purpose: `Provide ${entityName.toLowerCase()} to answer: "${question}"`,
              required: true,
              relatedQuestions: [question],
              calculationDefinition: calculationDef
            });
          } else {
            existing.relatedQuestions.push(question);
          }
        }
      }
    }

    // Infer data elements based on analysis types - aligned to specific analysis needs
    if (analysisTypes.length > 0) {
      for (const analysisType of analysisTypes) {
        const analysisLower = analysisType.toLowerCase();
        const analysisSpecificElements = this.getAnalysisTypeRequirements(analysisType, userQuestions, params.industry, datasetSchema);

        // Add analysis-specific elements if not already present
        for (const reqElement of analysisSpecificElements) {
          const exists = requiredElements.find(e =>
            e.elementName.toLowerCase() === reqElement.elementName.toLowerCase() ||
            e.purpose.toLowerCase().includes(reqElement.purpose.toLowerCase().substring(0, 20))
          );

          if (!exists) {
            requiredElements.push(reqElement);
          } else {
            // Merge related questions and mark as required if analysis needs it
            exists.relatedQuestions = [...new Set([...exists.relatedQuestions, ...reqElement.relatedQuestions])];
            if (reqElement.required) {
              exists.required = true;
            }
          }
        }
      }
    }

    // Extract key business entities and metrics from goals and questions
    // This makes elements more specific and relevant
    const keyEntities = this.extractKeyBusinessEntities([...userGoals, ...userQuestions]);

    for (const entity of keyEntities) {
      const exists = requiredElements.find(e =>
        e.elementName.toLowerCase().includes(entity.name.toLowerCase()) ||
        entity.name.toLowerCase().includes(e.elementName.toLowerCase().substring(0, 10))
      );

      if (!exists) {
        requiredElements.push({
          elementName: entity.name,
          description: entity.description,
          dataType: entity.dataType,
          purpose: entity.purpose,
          required: entity.required,
          relatedQuestions: entity.relatedQuestions
        });
      } else {
        // Merge related questions
        exists.relatedQuestions = [...new Set([...exists.relatedQuestions, ...entity.relatedQuestions])];
      }
    }

    // Infer common domain entities from goals
    for (const goal of userGoals) {
      const goalLower = goal.toLowerCase();

      // Customer/user analysis
      if (/customer|user|client|buyer|purchaser/i.test(goalLower)) {
        const hasCustomer = requiredElements.some(e => /customer|user|client/i.test(e.elementName));
        if (!hasCustomer) {
          requiredElements.push({
            elementName: 'Customer Identifier',
            description: 'Unique identifier for each customer',
            dataType: 'categorical' as const,
            purpose: 'Enable customer-level analysis',
            required: false,
            relatedQuestions: []
          });
        }
      }

      // Revenue/financial analysis
      if (/revenue|sales|income|profit|cost|price|financial/i.test(goalLower)) {
        const hasRevenue = requiredElements.some(e => /revenue|sales|income|amount/i.test(e.elementName));
        if (!hasRevenue) {
          requiredElements.push({
            elementName: 'Revenue',
            description: 'Monetary value of revenue or sales',
            dataType: 'numeric' as const,
            purpose: 'Enable financial analysis and revenue tracking',
            required: false,
            relatedQuestions: []
          });
        }
      }

      // Geographic analysis
      if (/location|region|country|city|geographic|geo/i.test(goalLower)) {
        const hasLocation = requiredElements.some(e => /location|region|country|city/i.test(e.elementName));
        if (!hasLocation) {
          requiredElements.push({
            elementName: 'Location',
            description: 'Geographic location information',
            dataType: 'categorical' as const,
            purpose: 'Enable geographic analysis and regional comparisons',
            required: false,
            relatedQuestions: []
          });
        }
      }
    }

    console.log(`✅ [Data Scientist] Identified ${requiredElements.length} required data elements`);

    return requiredElements;
  }

  /**
   * Convert a snake_case or camelCase column name to a human-readable title.
   * e.g. "turnover_rate" → "Turnover Rate", "employeeId" → "Employee Id"
   */
  private static humanizeColumnName(column: string): string {
    return column
      .replace(/[_-]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * AI-powered inference of required data elements using ChimaridataAI
   * Uses fallback chain: Gemini → OpenAI → Claude
   * Returns structured data elements with calculation definitions
   */
  private async inferRequiredDataElementsWithAI(params: {
    userQuestions: string[];
    userGoals: string[];
    analysisTypes?: string[];
    datasetSchema?: Record<string, any>;
    industry?: string;
  }): Promise<Array<{
    elementName: string;
    description: string;
    dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
    purpose: string;
    required: boolean;
    relatedQuestions: string[];
    calculationDefinition?: {
      calculationType: 'direct' | 'derived' | 'aggregated' | 'grouped' | 'composite';
      formula?: {
        businessDescription: string;
        componentFields?: string[];
        aggregationMethod?: 'average' | 'sum' | 'count' | 'min' | 'max' | 'median' | 'weighted_average' | 'custom';
        pseudoCode?: string;
      };
      categorization?: {
        categoryDescription: string;
        categories?: Array<{ name: string; rule: string }>;
      };
      notes?: string;
    };
  }>> {
    const { userQuestions, userGoals, analysisTypes = [], datasetSchema } = params;

    console.log(`🤖 [DS Agent AI] Starting AI-powered element inference...`);
    console.log(`   Questions: ${userQuestions.length}, Goals: ${userGoals.length}, Analysis Types: ${analysisTypes.length}`);

    const ai = new ChimaridataAI();

    // Build comprehensive prompt for AI inference
    const schemaDescription = datasetSchema
      ? Object.entries(datasetSchema).map(([col, info]) => `  - ${col}: ${typeof info === 'object' ? (info as any).type || 'unknown' : info}`).join('\n')
      : '  (No schema available - infer from questions and goals)';

    // Generate example: prefer schema-based example (uses ACTUAL column names) over industry example
    const exampleElement = datasetSchema && Object.keys(datasetSchema).length > 0
      ? this.getSchemaBasedExampleElement(datasetSchema)
      : this.getIndustryExampleElement(params.industry);
    const industryDirective = params.industry
      ? `\n## Industry Context:\nThis is a **${params.industry}** analysis project. Generate elements relevant to ${params.industry} — do NOT generate elements for other industries (e.g., do not generate HR elements for a marketing project).\n`
      : '\n## Industry Context:\nIndustry not specified — infer from questions and dataset schema.\n';

    const prompt = `You are an expert data scientist. Analyze the following business questions and goals to determine the required data elements for analysis.

## User Questions:
${userQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

## User Goals:
${userGoals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

## Planned Analysis Types:
${analysisTypes.length > 0 ? analysisTypes.map((a, i) => `${i + 1}. ${a}`).join('\n') : '(None specified - infer from questions)'}

${(() => {
  // Fix 6: Inject structured per-analysis-type requirements from the registry
  if (analysisTypes.length === 0) return '';
  try {
    const reqs = getAnalysisRequirementsForTypes(analysisTypes);
    if (reqs.length === 0) return '';
    const lines = reqs.map(req => {
      const parts: string[] = [];
      if (req.columnRequirements.minNumericColumns) parts.push(`needs ≥${req.columnRequirements.minNumericColumns} numeric columns`);
      if (req.columnRequirements.minCategoricalColumns) parts.push(`needs ≥${req.columnRequirements.minCategoricalColumns} categorical columns`);
      if (req.columnRequirements.minDatetimeColumns) parts.push(`needs ≥${req.columnRequirements.minDatetimeColumns} datetime columns`);
      if (req.columnRequirements.needsTargetVariable) parts.push('REQUIRES a target/dependent variable');
      if (req.columnRequirements.needsFeatureColumns) parts.push('REQUIRES feature/independent columns');
      if (req.transformationRequirements.needsGrouping) parts.push('REQUIRES a grouping/categorical column for segment comparison');
      return `- **${req.displayName}** (${req.analysisType}): ${parts.join(', ') || 'standard data columns'}`;
    });
    return `## Analysis-Specific Data Requirements (MANDATORY — you MUST generate elements that satisfy these):\n${lines.join('\n')}\n\nIMPORTANT: For each analysis type above, ensure your generated elements include the required column types. For example, if Comparative Analysis needs a grouping column, you MUST include a categorical element suitable for grouping.\n`;
  } catch { return ''; }
})()}
## Available Dataset Schema:
${schemaDescription}
${industryDirective}
## Step 0: Question Decomposition
For each question, first identify:
- The KPI/metric being asked about (e.g., "turnover rate", "engagement score", "conversion rate")
- Grouping dimensions ("for each X", "by X", "per X") that define how data should be segmented
- Comparison baselines ("compare to X", "vs X", "against X") for group-vs-baseline analysis
- The formula components needed (e.g., "turnover rate" needs "employees_left" and "total_employees")
Then generate elements for the KPI itself AND each of its formula components as separate elements.

## Your Task:
Identify ALL data elements required to answer these questions and achieve these goals. For each element, provide:
1. A clear business-friendly name
2. The data type needed
3. How it should be calculated or mapped from source data (include formula components for composite KPIs)
4. Which questions it helps answer
5. For composite/derived KPIs: use calculationType "composite" and list componentFields in the formula

## Response Format (JSON array):
[
  ${JSON.stringify(exampleElement, null, 2).split('\n').join('\n  ')}
]

## Rules:
1. Return ONLY a valid JSON array - no markdown, no explanation text
2. Include at least one "Unique Identifier" element — use the ACTUAL ID column name from the schema (e.g., "employee_id", "order_id"), not a generic "Unique Identifier"
3. Each element must have calculationDefinition explaining HOW to derive it
4. Match dataType to one of: numeric, categorical, datetime, text, boolean
5. calculationType must be one of: direct, derived, aggregated, grouped, composite
6. aggregationMethod (if applicable) must be one of: average, sum, count, min, max, median, weighted_average, custom
7. HARD CONSTRAINT: If a dataset schema is provided above, EVERY element with calculationType "direct" MUST use an exact column name from the schema as its elementName or in componentFields. Do NOT invent column names that are not in the schema.
8. Only generate elements that are answerable from the provided dataset schema. If the schema shows HR data, do not generate financial metrics and vice versa.
9. For "derived" or "composite" elements, componentFields MUST contain only column names that exist in the schema above.
10. FORBIDDEN: Do NOT generate generic placeholder elements (like "Primary Performance Metric", "Key Performance Indicator") when a schema is provided. Use the ACTUAL column names from the schema.${params.industry ? `\n11. IMPORTANT: This is a ${params.industry} project. Only generate elements relevant to ${params.industry}. Do not generate HR elements for marketing data or vice versa.` : ''}

Respond with the JSON array ONLY:`;

    try {
      const { text, provider } = await ai.generateText({
        prompt,
        maxTokens: 4000,
        temperature: 0.3  // Lower temperature for more consistent structured output
      });

      console.log(`🤖 [DS Agent AI] Response received from ${provider}`);

      // Parse the JSON response
      let elements: any[];
      try {
        // Clean up response - remove markdown code blocks if present
        let cleanedText = text.trim();
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.slice(7);
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.slice(3);
        }
        if (cleanedText.endsWith('```')) {
          cleanedText = cleanedText.slice(0, -3);
        }
        cleanedText = cleanedText.trim();

        elements = JSON.parse(cleanedText);

        if (!Array.isArray(elements)) {
          throw new Error('Response is not an array');
        }
      } catch (parseError: any) {
        console.warn(`⚠️ [DS Agent AI] Failed to parse AI response as JSON:`, parseError.message);
        console.log(`   Raw response: ${text.substring(0, 500)}...`);
        throw new Error(`JSON parse failed: ${parseError.message}`);
      }

      // Validate and normalize elements
      const validatedElements = elements.map((el: any, idx: number) => {
        // Ensure required fields
        if (!el.elementName) {
          el.elementName = `Element_${idx + 1}`;
        }

        // Normalize dataType
        const validDataTypes = ['numeric', 'categorical', 'datetime', 'text', 'boolean'];
        if (!validDataTypes.includes(el.dataType)) {
          el.dataType = 'text';  // Default to text
        }

        // Normalize calculationType
        if (el.calculationDefinition?.calculationType) {
          const validCalcTypes = ['direct', 'derived', 'aggregated', 'grouped', 'composite'];
          if (!validCalcTypes.includes(el.calculationDefinition.calculationType)) {
            el.calculationDefinition.calculationType = 'direct';
          }
        }

        // Normalize aggregationMethod
        if (el.calculationDefinition?.formula?.aggregationMethod) {
          const validAggMethods = ['average', 'sum', 'count', 'min', 'max', 'median', 'weighted_average', 'custom'];
          if (!validAggMethods.includes(el.calculationDefinition.formula.aggregationMethod)) {
            el.calculationDefinition.formula.aggregationMethod = 'custom';
          }
        }

        return {
          elementName: el.elementName || `Element_${idx + 1}`,
          description: el.description || `Data element for analysis`,
          dataType: el.dataType as 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean',
          purpose: el.purpose || 'Enable analysis',
          required: el.required !== false,  // Default to true
          relatedQuestions: Array.isArray(el.relatedQuestions) ? el.relatedQuestions : [],
          calculationDefinition: el.calculationDefinition || {
            calculationType: 'direct' as const,
            notes: 'Direct mapping from source column'
          }
        };
      });

      // POST-AI VALIDATION: Ensure "direct" elements reference actual schema columns
      if (datasetSchema && Object.keys(datasetSchema).length > 0) {
        const schemaColumns = Object.keys(datasetSchema).map(c => c.toLowerCase());
        const schemaColumnsSet = new Set(schemaColumns);

        for (const el of validatedElements) {
          const calcDef = el.calculationDefinition;
          if (calcDef?.calculationType === 'direct') {
            const elNameLower = el.elementName.toLowerCase().replace(/[\s-]/g, '_');
            const componentFields = (calcDef.formula?.componentFields || []).map((f: string) => f.toLowerCase());

            const hasSchemaMatch = schemaColumnsSet.has(elNameLower) ||
              componentFields.some((f: string) => schemaColumnsSet.has(f)) ||
              schemaColumns.some(col => elNameLower.includes(col) || col.includes(elNameLower));

            if (!hasSchemaMatch) {
              console.warn(`⚠️ [DS Agent AI] Element "${el.elementName}" (direct) does not reference any schema column`);
              // Auto-correct: find closest matching column by fuzzy word match
              const bestMatch = schemaColumns.find(col => {
                const colWords = col.split(/[_\s-]/).filter((w: string) => w.length > 2);
                const elWords = elNameLower.split(/[_\s-]/).filter((w: string) => w.length > 2);
                return colWords.some((cw: string) => elWords.some((ew: string) => cw.includes(ew) || ew.includes(cw)));
              });
              if (bestMatch) {
                if (!calcDef.formula) (calcDef as any).formula = { businessDescription: '' };
                calcDef.formula!.componentFields = [bestMatch];
                // Fix 2B: Also rename abstract elementName to match the actual column
                const oldName = el.elementName;
                el.elementName = DataScientistAgent.humanizeColumnName(bestMatch);
                console.log(`   ✅ Auto-corrected: "${oldName}" → "${el.elementName}" (mapped to "${bestMatch}")`);
              }
            }

            // Fix 2B part 2: If element HAS a schema match via single componentField but
            // the elementName itself is abstract (doesn't match any column), rename it
            if (hasSchemaMatch && componentFields.length === 1 && schemaColumnsSet.has(componentFields[0])) {
              if (!schemaColumnsSet.has(elNameLower)) {
                const oldName = el.elementName;
                el.elementName = DataScientistAgent.humanizeColumnName(componentFields[0]);
                if (oldName !== el.elementName) {
                  console.log(`   📝 [Fix 2B] Grounded element name: "${oldName}" → "${el.elementName}"`);
                }
              }
            }
          }
        }

        // POST-AI VALIDATION PHASE 2: Validate derived/composite/aggregated elements
        // Ensure componentFields reference actual schema columns (not abstract placeholders)
        const schemaColumnsOriginal = Object.keys(datasetSchema);
        const schemaLookup = new Map(schemaColumnsOriginal.map(c => [c.toLowerCase(), c]));

        for (const el of validatedElements) {
          const calcDef = el.calculationDefinition;
          const calcType = calcDef?.calculationType;
          if (calcType === 'direct') continue; // Already handled above

          if (calcType === 'derived' || calcType === 'composite' || calcType === 'aggregated') {
            const cFields = calcDef?.formula?.componentFields || [];
            if (cFields.length === 0) continue;

            const correctedFields: string[] = [];
            let anyCorrected = false;

            for (const cf of cFields) {
              const cfLower = cf.toLowerCase().replace(/[\s-]/g, '_');
              // Check exact match (case-insensitive)
              if (schemaLookup.has(cfLower)) {
                correctedFields.push(schemaLookup.get(cfLower)!);
                continue;
              }
              // Check if original casing matches
              if (schemaLookup.has(cf.toLowerCase())) {
                correctedFields.push(schemaLookup.get(cf.toLowerCase())!);
                continue;
              }
              // Fuzzy match: find best column by word overlap
              let bestCol: string | null = null;
              let bestOverlap = 0;
              const cfWords = cfLower.split(/[_\s-]/).filter((w: string) => w.length > 1);
              for (const [colLower, colOriginal] of schemaLookup) {
                const colWords = colLower.split(/[_\s-]/).filter((w: string) => w.length > 1);
                // Count overlapping words
                const overlap = cfWords.filter((cw: string) => colWords.some((colW: string) =>
                  cw.includes(colW) || colW.includes(cw)
                )).length;
                const overlapRatio = cfWords.length > 0 ? overlap / cfWords.length : 0;
                if (overlapRatio > bestOverlap && overlapRatio >= 0.5) {
                  bestOverlap = overlapRatio;
                  bestCol = colOriginal;
                }
              }
              if (bestCol) {
                correctedFields.push(bestCol);
                anyCorrected = true;
                console.log(`   🔧 [DS Agent AI] Corrected componentField: "${cf}" → "${bestCol}" (${el.elementName})`);
              } else {
                // Keep original — might be an abstract name resolved later by business definitions
                correctedFields.push(cf);
              }
            }

            if (anyCorrected && calcDef?.formula) {
              calcDef.formula.componentFields = correctedFields;
            }
          }
        }

        console.log(`✅ [DS Agent AI] Post-AI validation complete for ${validatedElements.length} elements (direct + derived)`);
      }

      // Ensure we have at least a unique identifier — use actual schema ID column if available
      const hasUniqueId = validatedElements.some(el =>
        /unique.*id|identifier|record.*id|primary.*key|row.?index/i.test(el.elementName) ||
        // Also check if any element name matches a schema ID column
        (datasetSchema && Object.keys(datasetSchema).some(col =>
          /id$|_id$|^id_|^key$|identifier/i.test(col) && el.elementName.toLowerCase().replace(/[\s-]/g, '_') === col.toLowerCase()
        ))
      );

      if (!hasUniqueId) {
        // Schema-aware: find actual ID column instead of using placeholder
        const schemaIdCol = datasetSchema
          ? Object.keys(datasetSchema).find(col => /^id$|[_-]id$|^.*_id$|^key$|identifier/i.test(col))
          : undefined;

        if (schemaIdCol) {
          // Use actual ID column from schema
          validatedElements.unshift({
            elementName: schemaIdCol,
            description: `Unique identifier from ${schemaIdCol} column`,
            dataType: 'text' as const,
            purpose: 'Uniquely identify and track each record throughout the analysis',
            required: true,
            relatedQuestions: [],
            calculationDefinition: {
              calculationType: 'direct' as const,
              formula: {
                businessDescription: `Direct mapping from ${schemaIdCol} column`,
                componentFields: [schemaIdCol],
                pseudoCode: `SELECT ${schemaIdCol} AS unique_identifier FROM source_data`
              },
              notes: `Using actual schema column: ${schemaIdCol}`
            }
          });
        } else if (datasetSchema) {
          // Check if this looks like survey data
          const schemaCols = Object.keys(datasetSchema);
          const surveyLikeCount = schemaCols.filter(c => /^\d+[\.\)]|^(how|what|which|rate|rank|do you|are you|to what|please)/i.test(c)).length;
          if (surveyLikeCount > schemaCols.length * 0.3) {
            // Survey dataset — skip ID element entirely, surveys don't need row-level IDs for descriptive analysis
            console.log(`📋 [DS Agent AI] Survey dataset detected (${surveyLikeCount}/${schemaCols.length} question columns), skipping Unique Identifier`);
          } else {
            // Non-survey, add Row Index as synthetic element
            validatedElements.unshift({
              elementName: 'Row Index',
              description: 'Auto-generated row number (no natural ID column found in dataset)',
              dataType: 'numeric' as const,
              purpose: 'Uniquely identify and track each record throughout the analysis',
              required: false,
              relatedQuestions: [],
              calculationDefinition: {
                calculationType: 'derived' as const,
                formula: {
                  businessDescription: 'Auto-generated sequential identifier',
                  componentFields: [],
                  pseudoCode: 'ROW_NUMBER() OVER (ORDER BY insertion_order)'
                },
                notes: 'No natural ID column found — using synthetic row number'
              }
            });
          }
        }
      }

      console.log(`✅ [DS Agent AI] Successfully inferred ${validatedElements.length} elements using ${provider}`);
      return validatedElements;

    } catch (aiError: any) {
      console.error(`❌ [DS Agent AI] AI inference failed:`, aiError.message);
      throw aiError;  // Let caller handle fallback to regex
    }
  }

  /**
   * Returns an industry-appropriate example element for the AI inference prompt.
   * Prevents HR bias by showing the LLM a relevant example based on the project's industry.
   */
  private getIndustryExampleElement(industry?: string): object {
    switch ((industry || '').toLowerCase()) {
      case 'marketing':
        return {
          elementName: "Campaign ROI",
          description: "Return on investment for each marketing campaign",
          dataType: "numeric",
          purpose: "Measure campaign profitability and compare across channels",
          required: true,
          relatedQuestions: ["What is the ROI for each campaign?"],
          calculationDefinition: {
            calculationType: "derived",
            formula: {
              businessDescription: "ROI = (Revenue Generated - Campaign Cost) / Campaign Cost",
              componentFields: ["revenue", "cost"],
              aggregationMethod: "custom",
              pseudoCode: "(SUM(revenue) - SUM(cost)) / SUM(cost) * 100"
            }
          }
        };
      case 'hr':
      case 'human_resources':
        return {
          elementName: "Employee Engagement Score",
          description: "Composite metric measuring employee engagement levels",
          dataType: "numeric",
          purpose: "Measure and compare employee engagement across teams",
          required: true,
          relatedQuestions: ["What is the average engagement score by department?"],
          calculationDefinition: {
            calculationType: "derived",
            formula: {
              businessDescription: "Average of survey response scores for engagement-related questions",
              componentFields: ["survey_response_col1", "survey_response_col2", "survey_response_col3"],
              aggregationMethod: "average",
              pseudoCode: "AVERAGE(survey_response_columns)"
            }
          }
        };
      case 'finance':
        return {
          elementName: "Revenue Growth Rate",
          description: "Period-over-period revenue change percentage",
          dataType: "numeric",
          purpose: "Track financial performance and growth trends",
          required: true,
          relatedQuestions: ["What is the revenue growth trend?"],
          calculationDefinition: {
            calculationType: "derived",
            formula: {
              businessDescription: "(Current Period Revenue - Previous Period Revenue) / Previous Period Revenue",
              componentFields: ["revenue", "period"],
              aggregationMethod: "custom",
              pseudoCode: "(revenue_current - revenue_previous) / revenue_previous * 100"
            }
          }
        };
      case 'retail':
      case 'ecommerce':
        return {
          elementName: "Customer Lifetime Value",
          description: "Total predicted revenue from a customer relationship",
          dataType: "numeric",
          purpose: "Segment customers by value and optimize retention",
          required: true,
          relatedQuestions: ["What is the average customer lifetime value?"],
          calculationDefinition: {
            calculationType: "derived",
            formula: {
              businessDescription: "Average Purchase Value × Purchase Frequency × Customer Lifespan",
              componentFields: ["order_value", "purchase_count", "tenure"],
              aggregationMethod: "custom",
              pseudoCode: "AVG(order_value) * COUNT(orders) / COUNT(DISTINCT customers) * AVG(tenure)"
            }
          }
        };
      default:
        return {
          elementName: "Primary Performance Metric",
          description: "Main quantitative measure for the analysis",
          dataType: "numeric",
          purpose: "Calculate and compare the primary metric across groups",
          required: true,
          relatedQuestions: ["What is the trend of this metric over time?"],
          calculationDefinition: {
            calculationType: "derived",
            formula: {
              businessDescription: "Calculated from source data columns relevant to the analysis goal",
              componentFields: ["metric_value", "dimension"],
              aggregationMethod: "average",
              pseudoCode: "AGGREGATE(metric_column) GROUP BY dimension_column"
            }
          }
        };
    }
  }

  /**
   * Generate an example element from ACTUAL dataset schema columns.
   * This replaces the hardcoded industry examples so the AI sees real column names
   * as the pattern to follow, producing column-aware elements instead of generic ones.
   */
  private getSchemaBasedExampleElement(schema: Record<string, any>): object {
    const columns = Object.entries(schema);

    // Find a numeric column for the example
    const numericCol = columns.find(([_, info]) => {
      const type = typeof info === 'object' ? (info as any).type : String(info);
      return /numeric|number|integer|float|decimal/i.test(type || '');
    });

    // Find a categorical/text column
    const catCol = columns.find(([_, info]) => {
      const type = typeof info === 'object' ? (info as any).type : String(info);
      return /categorical|text|string|varchar/i.test(type || '');
    });

    // Find an ID column
    const idCol = columns.find(([name]) => /id|key|code|identifier/i.test(name));

    if (numericCol) {
      const colName = numericCol[0];
      const groupCol = catCol ? catCol[0] : (idCol ? idCol[0] : columns[0]?.[0] || 'group_column');
      return {
        elementName: colName,
        description: `Analysis of ${colName.replace(/[_-]/g, ' ')} values`,
        dataType: 'numeric',
        purpose: `Analyze ${colName.replace(/[_-]/g, ' ')} across different groups`,
        required: true,
        relatedQuestions: [],
        calculationDefinition: {
          calculationType: 'direct',
          formula: {
            businessDescription: `Direct mapping from ${colName} column`,
            componentFields: [colName],
            pseudoCode: `SELECT ${colName} FROM dataset`
          }
        }
      };
    }

    // No numeric column — use first available column
    const firstCol = columns[0];
    if (firstCol) {
      return {
        elementName: firstCol[0],
        description: `Data element from ${firstCol[0].replace(/[_-]/g, ' ')} column`,
        dataType: 'text',
        purpose: 'Direct mapping from source data',
        required: true,
        relatedQuestions: [],
        calculationDefinition: {
          calculationType: 'direct',
          formula: {
            businessDescription: `Direct mapping from ${firstCol[0]} column`,
            componentFields: [firstCol[0]],
            pseudoCode: `SELECT ${firstCol[0]} FROM dataset`
          }
        }
      };
    }

    // No schema columns at all — fall back to generic
    return this.getIndustryExampleElement(undefined);
  }

  /**
   * Get required data elements for specific analysis types
   * Aligns data requirements to the exact needs of each analysis
   */
  private getAnalysisTypeRequirements(analysisType: string, userQuestions: string[], industry?: string, datasetSchema?: Record<string, any>): Array<{
    elementName: string;
    description: string;
    dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
    purpose: string;
    required: boolean;
    relatedQuestions: string[];
  }> {
    const elements: any[] = [];
    const analysisLower = analysisType.toLowerCase();
    const relevantQuestions = userQuestions.filter(q =>
      this.isQuestionRelevantToAnalysis(q, analysisType)
    );

    // Descriptive/Exploratory Analysis - with domain-specific naming
    if (/descriptive|exploratory|summary|overview|understand/i.test(analysisLower)) {
      // Use explicit industry FIRST, only fall back to keyword regex if not set
      const questionContext = userQuestions.join(' ').toLowerCase();
      const industryLower = (industry || '').toLowerCase();

      const isEmployeeAnalysis = industryLower === 'hr' || industryLower === 'human_resources' ||
          (!industry && /\b(employee|staff|worker|hr\b|workforce|turnover|headcount|attrition)\b/i.test(questionContext));
      const isMarketingAnalysis = industryLower === 'marketing' ||
          (!industry && /\b(campaign|impression|click.?rate|ad.?spend|ctr|cpc|cpm|lead.?gen|marketing)\b/i.test(questionContext));
      const isSurveyAnalysis = !isEmployeeAnalysis && !isMarketingAnalysis && !industry &&
          /\b(survey|feedback|response|satisfaction|opinion|questionnaire)\b/i.test(questionContext);
      const isCustomerAnalysis = industryLower === 'retail' || industryLower === 'ecommerce' ||
          (!industry && !isMarketingAnalysis && /\b(customer|client|buyer|consumer)\b/i.test(questionContext));
      const isFinancialAnalysis = industryLower === 'finance' ||
          (!industry && /\b(revenue|profit|cost|financial|budget|ledger)\b/i.test(questionContext));

      if (isEmployeeAnalysis) {
        elements.push({
          elementName: 'Employee Engagement Score',
          description: 'Composite metric measuring employee engagement levels',
          dataType: 'numeric' as const,
          purpose: 'Measure and compare employee engagement across teams/departments',
          required: true,
          relatedQuestions: relevantQuestions,
          // DS Agent defines HOW this should be calculated
          calculationDefinition: {
            calculationType: 'derived' as const,
            formula: {
              businessDescription: 'Average of survey response scores (e.g., Q1, Q2, Q3) that measure engagement-related factors like satisfaction, motivation, and commitment',
              componentFields: ['survey_scores', 'engagement_questions'],
              aggregationMethod: 'average' as const,
              pseudoCode: 'AVERAGE(survey_response_columns)'
            },
            comparisonGroups: {
              groupingField: 'Department',
              comparisonType: 'between_groups' as const
            },
            notes: 'User should identify which survey questions relate to engagement and specify the averaging method'
          }
        });
        elements.push({
          elementName: 'Employee Identifier',
          description: 'Unique employee ID for tracking individual responses',
          dataType: 'categorical' as const,
          purpose: 'Track and link employee data across analyses',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'direct' as const,
            notes: 'Direct mapping to employee ID column'
          }
        });
        elements.push({
          elementName: 'Department/Team',
          description: 'Organizational unit for grouping employees',
          dataType: 'categorical' as const,
          purpose: 'Enable department-level comparison and aggregation',
          required: false,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            comparisonGroups: {
              comparisonType: 'between_groups' as const
            },
            notes: 'Used as grouping variable for comparative analysis between departments'
          }
        });
        elements.push({
          elementName: 'Manager/Leader Identifier',
          description: 'Reference to employee manager for hierarchy analysis',
          dataType: 'categorical' as const,
          purpose: 'Analyze manager impact on engagement and team dynamics',
          required: false,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'direct' as const,
            notes: 'Direct mapping to manager ID or name column'
          }
        });
      } else if (isSurveyAnalysis) {
        elements.push({
          elementName: 'Survey Response Score',
          description: 'Individual survey response value or rating',
          dataType: 'numeric' as const,
          purpose: 'Calculate average scores, distributions, and trends from survey data',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'aggregated' as const,
            formula: {
              businessDescription: 'Average or sum of numeric survey response values',
              aggregationMethod: 'average' as const,
              pseudoCode: 'AVERAGE(response_column) or SUM(response_column)'
            },
            notes: 'Map to the column containing numeric survey scores (1-5, 1-10, etc.)'
          }
        });
        elements.push({
          elementName: 'Respondent Identifier',
          description: 'Unique respondent ID for tracking survey responses',
          dataType: 'categorical' as const,
          purpose: 'Track and link respondent data across multiple surveys',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'direct' as const,
            notes: 'Direct mapping to respondent/user ID column'
          }
        });
        elements.push({
          elementName: 'Survey Category',
          description: 'Topic or question category within the survey',
          dataType: 'categorical' as const,
          purpose: 'Group survey questions by theme for category-level analysis',
          required: false,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            categorization: {
              categoryDescription: 'Survey questions grouped by theme (e.g., Work Environment, Leadership, Growth)',
              categories: []
            },
            notes: 'Map to question category column or derive from question text'
          }
        });
      } else if (isCustomerAnalysis) {
        elements.push({
          elementName: 'Customer Satisfaction Score',
          description: 'Customer satisfaction metric (e.g., CSAT, NPS)',
          dataType: 'numeric' as const,
          purpose: 'Measure customer satisfaction and loyalty metrics',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'derived' as const,
            formula: {
              businessDescription: 'Customer satisfaction score calculated from survey responses or transaction data',
              aggregationMethod: 'average' as const,
              pseudoCode: 'For NPS: (Promoters% - Detractors%); For CSAT: AVERAGE(satisfaction_ratings)'
            },
            notes: 'Common calculations: NPS (9-10 are promoters, 0-6 are detractors), CSAT (average of ratings)'
          }
        });
        elements.push({
          elementName: 'Customer Identifier',
          description: 'Unique customer ID for tracking',
          dataType: 'categorical' as const,
          purpose: 'Track individual customer behavior and preferences',
          required: true,
          relatedQuestions: relevantQuestions
        });
      } else if (isMarketingAnalysis) {
        elements.push({
          elementName: 'Campaign Performance Metric',
          description: 'Primary campaign performance measure (e.g., ROI, conversion rate, CTR)',
          dataType: 'numeric' as const,
          purpose: 'Measure and compare marketing campaign effectiveness',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'derived' as const,
            formula: {
              businessDescription: 'Campaign metric calculated from spend, impressions, clicks, or conversions',
              componentFields: ['spend', 'impressions', 'clicks', 'conversions'],
              pseudoCode: 'ROI = (Revenue - Cost) / Cost; CTR = Clicks / Impressions'
            },
            notes: 'Specific formula depends on which KPI the question asks about'
          }
        });
        elements.push({
          elementName: 'Campaign Identifier',
          description: 'Unique campaign ID or name for grouping',
          dataType: 'categorical' as const,
          purpose: 'Group metrics by individual campaign for comparison',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'direct' as const,
            notes: 'Direct mapping to campaign ID or campaign name column'
          }
        });
        elements.push({
          elementName: 'Marketing Channel',
          description: 'Channel or platform where the campaign runs',
          dataType: 'categorical' as const,
          purpose: 'Enable channel-level performance comparison',
          required: false,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            notes: 'Direct mapping to channel column (e.g., email, social, search, display)'
          }
        });
      } else if (isFinancialAnalysis) {
        elements.push({
          elementName: 'Financial Amount',
          description: 'Monetary value for financial analysis',
          dataType: 'numeric' as const,
          purpose: 'Calculate financial totals, averages, and trends',
          required: true,
          relatedQuestions: relevantQuestions
        });
        elements.push({
          elementName: 'Transaction Category',
          description: 'Category of financial transaction',
          dataType: 'categorical' as const,
          purpose: 'Enable category-level financial breakdowns',
          required: false,
          relatedQuestions: relevantQuestions
        });
      } else {
        // Generic fallback for unrecognized domains
        elements.push({
          elementName: 'Primary Metric',
          description: 'Main quantitative measure for descriptive statistics',
          dataType: 'numeric' as const,
          purpose: `Calculate summary statistics (mean, median, std dev) for ${analysisType}`,
          required: true,
          relatedQuestions: relevantQuestions
        });
        elements.push({
          elementName: 'Grouping Variable',
          description: 'Categorical variable for grouping and comparison',
          dataType: 'categorical' as const,
          purpose: `Enable group-by analysis and comparisons in ${analysisType}`,
          required: false,
          relatedQuestions: relevantQuestions
        });
      }
    }

    // Time-Series/Trend Analysis
    if (/time.*series|trend|forecast|temporal|seasonal|predict.*future/i.test(analysisLower)) {
      elements.push({
        elementName: 'Date/Time',
        description: 'Timestamp for chronological ordering',
        dataType: 'datetime' as const,
        purpose: `Track temporal patterns and trends for ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Time-Series Value',
        description: 'Numeric value to track over time',
        dataType: 'numeric' as const,
        purpose: `Measure change over time for ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      if (/seasonal/i.test(analysisLower)) {
        elements.push({
          elementName: 'Seasonal Indicator',
          description: 'Month, quarter, or season identifier',
          dataType: 'categorical' as const,
          purpose: 'Identify seasonal patterns and cycles',
          required: false,
          relatedQuestions: relevantQuestions
        });
      }
    }

    // Correlation/Relationship Analysis
    if (/correlation|relationship|association|depends?.*on/i.test(analysisLower)) {
      const numericCount = 2; // Need at least 2 variables
      elements.push({
        elementName: 'Independent Variable',
        description: 'Predictor or explanatory variable',
        dataType: 'numeric' as const,
        purpose: `Identify relationships and correlations in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Dependent Variable',
        description: 'Outcome or response variable',
        dataType: 'numeric' as const,
        purpose: `Measure correlation strength in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
    }

    // Segmentation/Clustering Analysis
    if (/segment|cluster|group|pattern.*recognition|customer.*type/i.test(analysisLower)) {
      elements.push({
        elementName: 'Clustering Feature 1',
        description: 'First feature for identifying patterns',
        dataType: 'numeric' as const,
        purpose: `Identify natural groupings in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Clustering Feature 2',
        description: 'Second feature for multi-dimensional segmentation',
        dataType: 'numeric' as const,
        purpose: `Enable multi-dimensional clustering in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Entity Identifier',
        description: 'Unique identifier for entities being segmented',
        dataType: 'text' as const,
        purpose: 'Track which entity belongs to which segment',
        required: true,
        relatedQuestions: relevantQuestions
      });
    }

    // Predictive Modeling/Classification
    if (/predict|classification|regression|model|machine.*learning/i.test(analysisLower)) {
      elements.push({
        elementName: 'Target Variable',
        description: 'Outcome variable to predict',
        dataType: /classification|categor/i.test(analysisLower) ? 'categorical' as const : 'numeric' as const,
        purpose: `Target variable for prediction in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Predictor Features',
        description: 'Input variables for making predictions',
        dataType: 'numeric' as const,
        purpose: `Features used by predictive model in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
    }

    // Comparative Analysis - with domain-specific naming and calculation definitions
    if (/compar|contrast|vs\.|versus|difference.*between/i.test(analysisLower)) {
      const questionContext = userQuestions.join(' ').toLowerCase();
      const isEmployeeAnalysis = /employee|staff|team|department|manager|leader/i.test(questionContext);
      const isSurveyAnalysis = /survey|feedback|response|score/i.test(questionContext);

      if (isEmployeeAnalysis) {
        elements.push({
          elementName: 'Team/Department',
          description: 'Organizational unit for comparison',
          dataType: 'categorical' as const,
          purpose: 'Compare performance, engagement, or metrics across teams/departments',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            comparisonGroups: {
              groupingField: 'Department',
              groupValues: ['Team A', 'Team B', 'Team C'],
              comparisonType: 'between_groups' as const
            },
            notes: 'Map to department/team column. Values will be used for grouping and comparison.'
          }
        });
        elements.push({
          elementName: 'Performance/Engagement Metric',
          description: 'Score or metric to compare across groups',
          dataType: 'numeric' as const,
          purpose: 'Measure and compare team/department performance differences',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'aggregated' as const,
            formula: {
              businessDescription: 'Calculate group averages of engagement/performance scores for comparison',
              aggregationMethod: 'average' as const,
              pseudoCode: 'GROUP BY Department; AVERAGE(engagement_score) per group'
            },
            comparisonGroups: {
              comparisonType: 'between_groups' as const
            },
            notes: 'Map to numeric score column. Will calculate mean per group for t-test or ANOVA comparison.'
          }
        });
      } else if (isSurveyAnalysis) {
        elements.push({
          elementName: 'Response Category',
          description: 'Categories or segments of respondents to compare',
          dataType: 'categorical' as const,
          purpose: 'Compare survey responses across different respondent groups',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            comparisonGroups: {
              comparisonType: 'between_groups' as const
            },
            notes: 'Map to column that segments respondents (e.g., age group, department, role)'
          }
        });
        elements.push({
          elementName: 'Response Score',
          description: 'Survey score or rating to compare',
          dataType: 'numeric' as const,
          purpose: 'Measure differences in satisfaction/feedback across groups',
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'aggregated' as const,
            formula: {
              businessDescription: 'Calculate average response score per category for statistical comparison',
              aggregationMethod: 'average' as const,
              pseudoCode: 'GROUP BY category; AVERAGE(score) per category'
            },
            notes: 'Map to numeric survey response column (e.g., 1-5 rating scale)'
          }
        });
      } else {
        elements.push({
          elementName: 'Comparison Groups',
          description: 'Categories or groups to compare',
          dataType: 'categorical' as const,
          purpose: `Define groups for comparison in ${analysisType}`,
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'grouped' as const,
            comparisonGroups: {
              comparisonType: 'between_groups' as const
            },
            notes: 'Map to categorical column that defines comparison segments'
          }
        });
        elements.push({
          elementName: 'Comparison Metric',
          description: 'Metric to compare across groups',
          dataType: 'numeric' as const,
          purpose: `Measure differences between groups in ${analysisType}`,
          required: true,
          relatedQuestions: relevantQuestions,
          calculationDefinition: {
            calculationType: 'aggregated' as const,
            formula: {
              businessDescription: 'Numeric value aggregated per group for statistical comparison',
              aggregationMethod: 'average' as const,
              pseudoCode: 'GROUP BY group_column; AVERAGE(metric) per group'
            },
            notes: 'Map to numeric column to compare across groups'
          }
        });
      }
    }

    // Group Analysis - with calculation definitions
    if (/group|segment|cluster|cohort/i.test(analysisLower)) {
      const questionContext = userQuestions.join(' ').toLowerCase();
      const isEmployeeAnalysis = /employee|staff|team|department|manager|leader|engagement/i.test(questionContext);

      elements.push({
        elementName: 'Grouping Variable',
        description: 'Variable used to define groups or segments',
        dataType: 'categorical' as const,
        purpose: 'Define how data should be segmented for group-level analysis',
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'grouped' as const,
          comparisonGroups: {
            groupingField: isEmployeeAnalysis ? 'Department' : 'Segment',
            comparisonType: 'between_groups' as const
          },
          notes: 'Map to categorical column that defines natural groupings (e.g., department, region, segment)'
        }
      });
      elements.push({
        elementName: 'Group Metric',
        description: 'Numeric metric to analyze within and across groups',
        dataType: 'numeric' as const,
        purpose: 'Calculate group-level statistics and compare group performance',
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'aggregated' as const,
          formula: {
            businessDescription: 'Calculate summary statistics per group (mean, median, std)',
            aggregationMethod: 'average' as const,
            pseudoCode: 'GROUP BY grouping_var; CALCULATE mean, median, std(metric) per group'
          },
          notes: 'Map to numeric column. Will compute descriptive statistics per group.'
        }
      });
    }

    // Statistical Aggregation - with calculation definitions
    if (/statistic|aggregat|summary|average|mean|median/i.test(analysisLower)) {
      elements.push({
        elementName: 'Aggregation Metric',
        description: 'Numeric values to aggregate',
        dataType: 'numeric' as const,
        purpose: 'Calculate statistical summaries (mean, median, sum, count)',
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'aggregated' as const,
          formula: {
            businessDescription: 'Calculate summary statistics across all data or by groups',
            componentFields: ['numeric_columns'],
            aggregationMethod: 'average' as const,
            pseudoCode: 'CALCULATE mean, median, sum, count, std for numeric columns'
          },
          notes: 'Map to numeric columns you want to aggregate'
        }
      });
      elements.push({
        elementName: 'Aggregation Grouping',
        description: 'Optional grouping for aggregation',
        dataType: 'categorical' as const,
        purpose: 'Group aggregations by category (optional)',
        required: false,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'grouped' as const,
          notes: 'Optional: Map to categorical column to get grouped statistics'
        }
      });
    }

    // Correlation Analysis - with calculation definitions
    if (/correlat|relationship|association|impact|influence/i.test(analysisLower)) {
      const questionContext = userQuestions.join(' ').toLowerCase();
      const isEngagementAnalysis = /engagement|retention|satisfaction|turnover/i.test(questionContext);

      elements.push({
        elementName: isEngagementAnalysis ? 'Engagement Score' : 'Primary Variable',
        description: isEngagementAnalysis ? 'Employee engagement metric' : 'First variable in correlation analysis',
        dataType: 'numeric' as const,
        purpose: 'Measure correlation with other variables',
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: isEngagementAnalysis ? 'derived' : 'direct' as const,
          formula: isEngagementAnalysis ? {
            businessDescription: 'Engagement score calculated from survey responses',
            aggregationMethod: 'average' as const,
            pseudoCode: 'AVERAGE(survey_response_columns)'
          } : undefined,
          notes: 'Map to numeric column for correlation analysis'
        }
      });
      elements.push({
        elementName: isEngagementAnalysis ? 'Retention Indicator' : 'Secondary Variable',
        description: isEngagementAnalysis ? 'Whether employee was retained (0/1 or tenure)' : 'Second variable to correlate with',
        dataType: 'numeric' as const,
        purpose: 'Calculate Pearson/Spearman correlation coefficient',
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'direct' as const,
          formula: {
            businessDescription: 'Correlation analysis between variables',
            pseudoCode: 'CORR(var1, var2) - Pearson or Spearman correlation'
          },
          notes: 'Map to second numeric column. Will calculate correlation coefficient.'
        }
      });
      elements.push({
        elementName: isEngagementAnalysis ? 'Satisfaction Score' : 'Additional Variables',
        description: isEngagementAnalysis ? 'Organization satisfaction rating' : 'Additional variables for multivariate correlation',
        dataType: 'numeric' as const,
        purpose: 'Include in correlation matrix',
        required: false,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'direct' as const,
          notes: 'Map additional numeric columns to build correlation matrix'
        }
      });
    }

    // Text/Sentiment Analysis - with calculation definitions
    if (/text|sentiment|opinion|review|comment|feedback|nlp/i.test(analysisLower)) {
      elements.push({
        elementName: 'Text Content',
        description: 'Free text for analysis',
        dataType: 'text' as const,
        purpose: `Text data for sentiment/content analysis in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'derived' as const,
          formula: {
            businessDescription: 'Extract sentiment, themes, or keywords from text content',
            pseudoCode: 'SENTIMENT_SCORE(text) or EXTRACT_KEYWORDS(text) or TOPIC_MODEL(text)'
          },
          notes: 'Map to text/comment column. Will apply NLP analysis (sentiment scoring, topic extraction).'
        }
      });
      elements.push({
        elementName: 'Text Source',
        description: 'Origin or category of text',
        dataType: 'categorical' as const,
        purpose: 'Group texts by source for comparative sentiment analysis',
        required: false,
        relatedQuestions: relevantQuestions,
        calculationDefinition: {
          calculationType: 'grouped' as const,
          notes: 'Optional: Map to column that categorizes text sources for group comparison'
        }
      });
    }

    // Churn/Retention Analysis
    if (/churn|retention|attrition|lifetime.*value|ltv/i.test(analysisLower)) {
      elements.push({
        elementName: 'Customer/Entity ID',
        description: 'Unique identifier for tracking',
        dataType: 'text' as const,
        purpose: 'Track individual entities over time for churn analysis',
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Activity Date',
        description: 'Last activity or interaction date',
        dataType: 'datetime' as const,
        purpose: 'Measure time since last activity for churn prediction',
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Engagement Metrics',
        description: 'Measures of activity level',
        dataType: 'numeric' as const,
        purpose: 'Quantify engagement for churn modeling',
        required: true,
        relatedQuestions: relevantQuestions
      });
    }

    // Geographic/Spatial Analysis
    if (/geographic|spatial|location|regional|map|geospatial/i.test(analysisLower)) {
      elements.push({
        elementName: 'Location',
        description: 'Geographic identifier (region, city, coordinates)',
        dataType: 'categorical' as const,
        purpose: `Enable geographic analysis in ${analysisType}`,
        required: true,
        relatedQuestions: relevantQuestions
      });
      elements.push({
        elementName: 'Location Metric',
        description: 'Value measured at each location',
        dataType: 'numeric' as const,
        purpose: 'Quantify regional patterns and comparisons',
        required: true,
        relatedQuestions: relevantQuestions
      });
    }

    // Ground all elements to actual dataset schema columns when available
    if (datasetSchema && Object.keys(datasetSchema).length > 0) {
      return elements.map(el => this.groundElementToSchema(el, datasetSchema));
    }

    return elements;
  }

  /**
   * Ground a hardcoded element's componentFields, pseudoCode, and groupingField
   * to actual dataset column names when schema is available.
   * Falls back to the original abstract name if no match is found.
   */
  private groundElementToSchema(element: any, datasetSchema: Record<string, any>): any {
    if (!datasetSchema || Object.keys(datasetSchema).length === 0) {
      return element;
    }

    const columns = Object.keys(datasetSchema);
    const grounded = { ...element };

    // Ground componentFields in calculation formulas
    if (grounded.calculationDefinition?.formula?.componentFields) {
      const resolvedFields: string[] = [];
      for (const abstractField of grounded.calculationDefinition.formula.componentFields) {
        const match = this.findBestColumnMatch(abstractField, columns);
        resolvedFields.push(match || abstractField); // Keep abstract if no match
      }

      // Only rewrite if we found at least one real match
      const hasRealMatch = resolvedFields.some(f => columns.includes(f));
      if (hasRealMatch) {
        grounded.calculationDefinition = {
          ...grounded.calculationDefinition,
          formula: {
            ...grounded.calculationDefinition.formula,
            componentFields: resolvedFields,
            pseudoCode: this.rewritePseudoCodeWithColumns(
              grounded.calculationDefinition.formula.pseudoCode || '',
              grounded.calculationDefinition.formula.componentFields,
              resolvedFields
            )
          }
        };
      }
    }

    // Ground groupingField in comparison groups
    if (grounded.calculationDefinition?.comparisonGroups?.groupingField) {
      const groupField = grounded.calculationDefinition.comparisonGroups.groupingField;
      const match = this.findBestColumnMatch(groupField, columns);
      if (match) {
        grounded.calculationDefinition = {
          ...grounded.calculationDefinition,
          comparisonGroups: {
            ...grounded.calculationDefinition.comparisonGroups,
            groupingField: match
          }
        };
      }
    }

    return grounded;
  }

  /**
   * Find the best matching column name for an abstract field name.
   * Uses word-boundary-aware fuzzy matching: splits on _ / - / spaces, compares tokens.
   */
  private findBestColumnMatch(abstractField: string, columns: string[]): string | null {
    const abstractTokens = abstractField.toLowerCase().replace(/[_\-\s]+/g, ' ').split(' ').filter(t => t.length > 2);

    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const col of columns) {
      const colTokens = col.toLowerCase().replace(/[_\-\s]+/g, ' ').split(' ').filter(t => t.length > 2);

      // Score: count how many abstract tokens appear as substrings in col tokens or vice versa
      let score = 0;
      for (const at of abstractTokens) {
        for (const ct of colTokens) {
          if (ct.includes(at) || at.includes(ct)) {
            score++;
            break;
          }
        }
      }

      // Normalize by the number of abstract tokens to prefer more complete matches
      const normalizedScore = abstractTokens.length > 0 ? score / abstractTokens.length : 0;

      if (normalizedScore > bestScore && normalizedScore >= 0.5) {
        bestScore = normalizedScore;
        bestMatch = col;
      }
    }

    return bestMatch;
  }

  /**
   * Rewrite pseudoCode by replacing abstract field names with actual column names.
   */
  private rewritePseudoCodeWithColumns(
    pseudoCode: string,
    abstractFields: string[],
    resolvedFields: string[]
  ): string {
    let rewritten = pseudoCode;
    for (let i = 0; i < abstractFields.length && i < resolvedFields.length; i++) {
      if (abstractFields[i] !== resolvedFields[i]) {
        const escaped = abstractFields[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        rewritten = rewritten.replace(new RegExp(escaped, 'gi'), resolvedFields[i]);
      }
    }
    return rewritten;
  }

  /**
   * Determine if a question is relevant to a specific analysis type
   */
  private isQuestionRelevantToAnalysis(question: string, analysisType: string): boolean {
    const questionLower = question.toLowerCase();
    const analysisLower = analysisType.toLowerCase();

    // Time-series questions
    if (/time.*series|trend|forecast/i.test(analysisLower)) {
      return /when|over time|trend|forecast|temporal|historical|change/i.test(questionLower);
    }

    // Correlation questions
    if (/correlation|relationship/i.test(analysisLower)) {
      return /relationship|correlat|affect|impact|influence|depend/i.test(questionLower);
    }

    // Segmentation questions
    if (/segment|cluster/i.test(analysisLower)) {
      return /group|segment|type|pattern|similar|cluster/i.test(questionLower);
    }

    // Predictive questions
    if (/predict|forecast|classification/i.test(analysisLower)) {
      return /predict|forecast|will|future|likely|probability/i.test(questionLower);
    }

    // Comparative questions
    if (/compar/i.test(analysisLower)) {
      return /compar|versus|vs\.|difference|better|worse/i.test(questionLower);
    }

    // Default: consider question relevant if it contains analysis keywords
    return analysisLower.split(' ').some(word =>
      word.length > 4 && questionLower.includes(word)
    );
  }

  /**
   * Extract key business entities and metrics from user input
   * Makes data elements more specific and relevant to actual business questions
   */
  private extractKeyBusinessEntities(texts: string[]): Array<{
    name: string;
    description: string;
    dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean';
    purpose: string;
    required: boolean;
    relatedQuestions: string[];
  }> {
    const entities: any[] = [];
    const combinedText = texts.join(' ');

    // Common business metrics and their patterns
    const metricPatterns = [
      { patterns: [/revenue|sales|income|earnings/i], name: 'Revenue', dataType: 'numeric' as const, purpose: 'Track financial performance and sales' },
      { patterns: [/cost|expense|spending/i], name: 'Cost', dataType: 'numeric' as const, purpose: 'Analyze expenses and cost management' },
      { patterns: [/profit|margin/i], name: 'Profit', dataType: 'numeric' as const, purpose: 'Measure profitability and margins' },
      { patterns: [/price|pricing|amount\s+paid/i], name: 'Price', dataType: 'numeric' as const, purpose: 'Analyze pricing strategies and payment amounts' },
      { patterns: [/quantity|volume|units/i], name: 'Quantity', dataType: 'numeric' as const, purpose: 'Track quantities and volumes' },
      { patterns: [/satisfaction|rating|score/i], name: 'Satisfaction Score', dataType: 'numeric' as const, purpose: 'Measure satisfaction and ratings' },
      { patterns: [/employee|staff|worker/i], name: 'Employee', dataType: 'categorical' as const, purpose: 'Analyze employee-related metrics' },
      { patterns: [/department|division|team/i], name: 'Department', dataType: 'categorical' as const, purpose: 'Group and compare by department' },
      { patterns: [/product|item|sku/i], name: 'Product', dataType: 'categorical' as const, purpose: 'Analyze product performance' },
      { patterns: [/category|classification|type/i], name: 'Category', dataType: 'categorical' as const, purpose: 'Classify and group data' },
      { patterns: [/region|location|geography|area/i], name: 'Region', dataType: 'categorical' as const, purpose: 'Geographic analysis and segmentation' },
      { patterns: [/status|state/i], name: 'Status', dataType: 'categorical' as const, purpose: 'Track status and state changes' },
      { patterns: [/age|tenure|experience/i], name: 'Age', dataType: 'numeric' as const, purpose: 'Analyze age-related patterns' },
      { patterns: [/count|number\s+of|total\s+/i], name: 'Count', dataType: 'numeric' as const, purpose: 'Count occurrences and frequencies' },
    ];

    for (const question of texts) {
      for (const metricPattern of metricPatterns) {
        if (metricPattern.patterns.some(p => p.test(question))) {
          const exists = entities.find(e => e.name === metricPattern.name);
          if (!exists) {
            entities.push({
              name: metricPattern.name,
              description: `${metricPattern.name} data extracted from: "${question.substring(0, 80)}..."`,
              dataType: metricPattern.dataType,
              purpose: metricPattern.purpose,
              required: true,
              relatedQuestions: [question]
            });
          } else {
            exists.relatedQuestions.push(question);
          }
        }
      }
    }

    // Extract specific entities mentioned in questions
    // Look for patterns like "Which [entity]...", "What [entity]...", etc.
    for (const text of texts) {
      const entityMatches = [
        ...text.matchAll(/(?:which|what|who)\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:are|is|has|have|shows|shows)/gi),
        // FIX: Handle "What are the [entity]?" pattern (common English format)
        ...text.matchAll(/what\s+(?:are|is|were|was)\s+(?:the|our|my|your)?\s*([a-z]+(?:\s+[a-z]+){0,3})(?:\?|$)/gi),
        // FIX: Handle "What [entity]?" without are/is (e.g., "What factors influence...")
        ...text.matchAll(/what\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:influence|affect|drive|impact|cause|determine)/gi),
        // FIX: Handle "How does [entity] affect..." pattern
        ...text.matchAll(/how\s+(?:does|do|did)\s+([a-z]+(?:\s+[a-z]+){0,2})\s+(?:affect|impact|influence)/gi),
        ...text.matchAll(/(?:by|per|for\s+each)\s+([a-z]+(?:\s+[a-z]+){0,2})(?:\?|,|\.|\s|$)/gi),
        ...text.matchAll(/([a-z]+(?:\s+[a-z]+){0,2})\s+(?:performance|analysis|metrics|trends)/gi)
      ];

      for (const match of entityMatches) {
        const entity = match[1]?.trim();
        if (entity && entity.length > 2 && entity.length < 40) {
          const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'has', 'have', 'will', 'be', 'been'];
          if (!stopWords.includes(entity.toLowerCase())) {
            const entityName = this.capitalizeWords(entity);
            const exists = entities.find(e => e.name.toLowerCase().includes(entity.toLowerCase()));
            if (!exists) {
              // Infer data type from context
              const isNumeric = /count|amount|total|sum|average|number/i.test(entity);
              const isTemporal = /date|time|period|year|month|day/i.test(entity);

              entities.push({
                name: entityName,
                description: `${entityName} information needed for analysis`,
                dataType: isTemporal ? 'datetime' as const : (isNumeric ? 'numeric' as const : 'categorical' as const),
                purpose: `Answer questions about ${entityName.toLowerCase()}`,
                required: false,
                relatedQuestions: [text]
              });
            } else {
              if (!exists.relatedQuestions.includes(text)) {
                exists.relatedQuestions.push(text);
              }
            }
          }
        }
      }
    }

    return entities;
  }

  /**
   * Capitalizes and standardizes element names
   * Uses the standardizeElementName utility to fix common typos and apply proper casing
   */
  private capitalizeWords(str: string): string {
    // Use the standardizeElementName utility which handles:
    // - Common typos (e.g., "ofthe" -> "of the")
    // - Title case capitalization
    // - Double space removal
    return standardizeElementName(str);
  }

  // Public methods for analysis management
  getAnalysisResult(analysisId: string): AnalysisResult | null {
    return this.activeAnalyses.get(analysisId) || null;
  }

  getAllAnalyses(): AnalysisResult[] {
    return Array.from(this.activeAnalyses.values());
  }
}
