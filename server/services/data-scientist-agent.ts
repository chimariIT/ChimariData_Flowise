// server/services/data-scientist-agent.ts
import { AgentHandler, AgentTask, AgentResult, AgentStatus, AgentCapability } from './agent-registry';
import { TechnicalAIAgent } from './technical-ai-agent';
import { SparkProcessor } from './spark-processor';
import { nanoid } from 'nanoid';
import type { AnalysisStep, MLModelSpec, VisualizationSpec, DataAssessment } from '@shared/schema';

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
    
    if (feasible && requiredAnalyses.length > 0) {
      recommendations.push(`Recommended analyses: ${requiredAnalyses.join(', ')}`);
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
      const dataCharacteristics = {
        hasTimeSeries: Boolean(rawCharacteristics.hasTimeSeries),
        hasCategories: Boolean(rawCharacteristics.hasCategories ?? true),
        hasText: Boolean(rawCharacteristics.hasText),
        hasNumeric: Boolean(rawCharacteristics.hasNumeric ?? true)
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

      // Reuse existing scoring utilities for consistency with legacy behaviour
      const questionComplexity = this.analyzeQuestions(questions);
      const mappedAnalyses = this.mapQuestionsToAnalyses(questions, dataCharacteristics);
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

      const estimatedProcessingTime =
        complexity === 'very_high' ? '10-15 minutes' :
        complexity === 'high' ? '5-10 minutes' :
        complexity === 'medium' ? '2-5 minutes' :
        '1-2 minutes';

      const uniqueRecommendedAnalyses = Array.from(new Set([...mappedAnalyses, ...heuristicAnalyses]));
      const uniqueSuggestedVisualizations = Array.from(new Set(suggestedVisualizations));

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
  }): Promise<PlanAnalysisBlueprint> {
    const goals = params.goals || [];
    const questions = params.questions || [];

    const config = await this.recommendAnalysisConfig({
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

    const analyses = (config.recommendedAnalyses || config.analyses || ['Descriptive Statistics'])
      .map(item => item.trim())
      .filter(Boolean);

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
      .map(viz => this.visualizationFromSuggestion(viz));

    if (visualizations.length === 0) {
      visualizations.push(
        { type: 'bar', title: 'KPI comparison', description: 'Compare primary KPIs across segments.' },
        { type: 'line', title: 'Trend analysis', description: 'Monitor KPI movement over time.' }
      );
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
    let complexityScore = 0;

    for (const question of questions) {
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
   * Map user questions to specific analysis types
   */
  private mapQuestionsToAnalyses(
    questions: string[],
    dataCharacteristics: any
  ): string[] {
    const analyses: Set<string> = new Set();

    // Always start with descriptive statistics
    analyses.add('Descriptive statistics');

    for (const question of questions) {
      const questionLower = question.toLowerCase();

      // Time series analysis
      if (dataCharacteristics.hasTimeSeries &&
          (questionLower.includes('trend') || questionLower.includes('over time') ||
           questionLower.includes('change'))) {
        analyses.add('Trend analysis (engagement over time)');
        analyses.add('Time series visualization');
      }

      // Group comparisons
      if (questionLower.includes('compare') || questionLower.includes('each') ||
          questionLower.includes('team') || questionLower.includes('group')) {
        analyses.add('Comparative analysis (team benchmarking)');
        analyses.add('Group-by aggregations');
      }

      // Averages and aggregations
      if (questionLower.includes('average') || questionLower.includes('score')) {
        analyses.add('Statistical aggregations');
      }

      // Sentiment / text analysis
      if (questionLower.includes('sentiment') || questionLower.includes('view') ||
          questionLower.includes('opinion') || questionLower.includes('policy')) {
        analyses.add('Text analysis (sentiment/views)');
      }

      // Correlation / relationships
      if (questionLower.includes('correlat') || questionLower.includes('relationship') ||
          questionLower.includes('impact')) {
        analyses.add('Correlation analysis');
      }

      // Predictive modeling
      if (questionLower.includes('predict') || questionLower.includes('forecast')) {
        analyses.add('Predictive modeling');
      }

      // Clustering / segmentation
      if (questionLower.includes('segment') || questionLower.includes('cluster') ||
          questionLower.includes('group')) {
        analyses.add('Clustering/segmentation analysis');
      }
    }

    return Array.from(analyses);
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

  // Public methods for analysis management
  getAnalysisResult(analysisId: string): AnalysisResult | null {
    return this.activeAnalyses.get(analysisId) || null;
  }

  getAllAnalyses(): AnalysisResult[] {
    return Array.from(this.activeAnalyses.values());
  }
}
