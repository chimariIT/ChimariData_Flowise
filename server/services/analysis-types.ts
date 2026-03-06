// server/services/analysis-types.ts
/**
 * P3-1: Extracted from analysis-execution.ts
 * Shared interfaces, types, and constants for the analysis execution subsystem.
 */

import { datasets } from '@shared/schema';

export type Dataset = typeof datasets.$inferSelect;

/**
 * P2-11: Supported analysis types registry.
 * TODO: Make this admin-configurable via database (analysis_types table).
 * For now, this is the canonical list of supported types and their Python script mappings.
 */
export const SUPPORTED_ANALYSIS_TYPES: Record<string, { script: string; label: string; category: string }> = {
  // Basic analyses
  'descriptive_stats': { script: 'descriptive_stats.py', label: 'Descriptive Statistics', category: 'basic' },
  'descriptive': { script: 'descriptive_stats.py', label: 'Descriptive Statistics', category: 'basic' },
  'descriptive_statistics': { script: 'descriptive_stats.py', label: 'Descriptive Statistics', category: 'basic' },
  'correlation': { script: 'correlation_analysis.py', label: 'Correlation Analysis', category: 'basic' },
  'correlation_analysis': { script: 'correlation_analysis.py', label: 'Correlation Analysis', category: 'basic' },
  'comparative': { script: 'comparative_analysis.py', label: 'Comparative Analysis', category: 'basic' },
  'comparative_analysis': { script: 'comparative_analysis.py', label: 'Comparative Analysis', category: 'basic' },
  'group_analysis': { script: 'group_analysis.py', label: 'Group Analysis', category: 'basic' },
  'group': { script: 'group_analysis.py', label: 'Group Analysis', category: 'basic' },
  'statistical_aggregation': { script: 'descriptive_stats.py', label: 'Statistical Aggregation', category: 'basic' },

  // Advanced analyses
  'regression': { script: 'regression_analysis.py', label: 'Regression Analysis', category: 'advanced' },
  'regression_analysis': { script: 'regression_analysis.py', label: 'Regression Analysis', category: 'advanced' },
  'clustering': { script: 'clustering_analysis.py', label: 'Cluster Analysis', category: 'advanced' },
  'clustering_analysis': { script: 'clustering_analysis.py', label: 'Cluster Analysis', category: 'advanced' },
  'segmentation': { script: 'clustering_analysis.py', label: 'Segmentation Analysis', category: 'advanced' },
  'segmentation_analysis': { script: 'clustering_analysis.py', label: 'Segmentation Analysis', category: 'advanced' },
  'classification': { script: 'classification_analysis.py', label: 'Classification Analysis', category: 'advanced' },
  'classification_analysis': { script: 'classification_analysis.py', label: 'Classification Analysis', category: 'advanced' },
  'time_series': { script: 'time_series_analysis.py', label: 'Time Series Analysis', category: 'advanced' },
  'time_series_analysis': { script: 'time_series_analysis.py', label: 'Time Series Analysis', category: 'advanced' },
  'time-series': { script: 'time_series_analysis.py', label: 'Time Series Analysis', category: 'advanced' },
  'trend': { script: 'time_series_analysis.py', label: 'Trend Analysis', category: 'advanced' },
  'trend_analysis': { script: 'time_series_analysis.py', label: 'Trend Analysis', category: 'advanced' },
  'predictive': { script: 'regression_analysis.py', label: 'Predictive Modeling', category: 'advanced' },
  'predictive_modeling': { script: 'regression_analysis.py', label: 'Predictive Modeling', category: 'advanced' },
  'text_analysis': { script: 'text_analysis.py', label: 'Text Analysis', category: 'advanced' },
  'text': { script: 'text_analysis.py', label: 'Text Analysis', category: 'advanced' },
};

export interface AnalysisRequest {
  projectId: string;
  userId: string;
  analysisTypes: string[]; // ['descriptive', 'correlation', 'regression', etc.]
  datasetIds?: string[];
  userContext?: UserContext;
  // GAP D + GAP A: DS-recommended analyses from requirements document with priority ordering
  analysisPath?: Array<{
    analysisId: string;
    analysisName: string;
    analysisType?: string;
    description?: string;
    techniques?: string[];
    requiredDataElements?: string[];
    estimatedDuration?: string;
    dependencies?: string[]; // GAP A: Other analysis IDs that must complete first
    priority?: number;       // GAP A: Lower number = higher priority (earlier execution)
  }>;
  // GAP D: Question-to-analysis mapping for traceability
  questionAnswerMapping?: Array<{
    questionId: string;
    questionText: string;
    recommendedAnalyses?: string[];
    requiredDataElements?: string[];
    transformationsNeeded?: string[];
  }>;
  // P0-1 FIX: PII columns to exclude from analysis
  columnsToExclude?: string[];
  // Phase 4E: RequirementsDocument from journeyProgress for column role resolution
  requirementsDocument?: {
    requiredDataElements?: any[];
  };
}

export interface UserContext {
  analysisGoal?: string;
  businessQuestions?: string;
  selectedTemplates?: string[];
  audience?: {
    primaryAudience: string;
    secondaryAudiences?: string[];
    decisionContext?: string;
  };
  industry?: string;
}

export interface AnalysisInsight {
  id: number;
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
  confidence: number;
  category: string;
  dataSource?: string;
  details?: any;
  answersQuestions?: string[]; // Phase 3: Question IDs this insight helps answer
  generatedBy?: string; // Component that generated this insight (e.g., 'data-science-orchestrator')
}

export interface AnalysisRecommendation {
  id: number;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low' | 'high' | 'medium' | 'low';
  effort: 'High' | 'Medium' | 'Low';
  expectedImpact?: string;
  impact?: string; // Extended from DataScienceOrchestrator
}

// Phase 3: Question-to-Analysis Mapping
export interface QuestionAnalysisMapping {
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

export interface AnalysisResults {
  projectId: string;
  analysisTypes: string[];
  insights: AnalysisInsight[];
  recommendations: AnalysisRecommendation[];
  visualizations: any[];
  summary: {
    totalAnalyses: number;
    dataRowsProcessed: number;
    columnsAnalyzed: number;
    datasetCount?: number;
    executionTime: string;
    qualityScore: number;
    // FIX 3C: Optional chart-rendering data generated from insights
    trendData?: Array<{ label: string; value: number; category: string }>;
    categoryBreakdown?: Array<{ label: string; value: number; color?: string }>;
    // FIX 3E: Per-analysis status summary
    analysisStatus?: Record<string, { status: string; insightCount: number; error?: string }>;
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
  // Phase 4D: Direct question-to-analysis mapping from Python results (AnalysisDataPreparer evidence chain)
  directQuestionAnalysisMap?: Record<string, Array<{
    analysisId: string;
    analysisType: string;
    analysisName: string;
    columnRoles?: any;
    derivedColumns?: string[];
  }>>;
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
  // Phase 5C: Per-question answer status tracking
  questionAnswerStatus?: Array<{
    questionId: string;
    analysesRan: number;
    analysesSucceeded: number;
    analysesFailed: number;
    insightsMapped: number;
    status: 'answered' | 'partial' | 'no_data' | 'pending';
    analyses: Array<{
      analysisId: string;
      analysisName: string;
      analysisType: string;
      status: string;
    }>;
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
