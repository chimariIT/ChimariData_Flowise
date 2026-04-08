/**
 * Analysis Domain Types
 */

export type AnalysisType =
  | 'descriptive_stats'
  | 'correlation_analysis'
  | 'regression_analysis'
  | 'clustering_analysis'
  | 'time_series_analysis'
  | 'comparative_analysis'
  | 'statistical_tests';

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AnalysisExecutionConfig {
  projectId: string;
  userId: string;
  analysisTypes: AnalysisType[];
  datasetIds?: string[];
}

export interface AnalysisResult {
  workflowId: string;
  status: AnalysisStatus;
  insights: Insight[];
  recommendations: Recommendation[];
  visualizations: Visualization[];
  executionTimeMs: number;
}

export interface Insight {
  id: string;
  title: string;
  type: 'insight' | 'recommendation' | 'visualization';
  content: string;
  metadata?: Record<string, any>;
}

export interface Recommendation {
  id: string;
  title: string;
  category: 'actionable' | 'informational';
  content: string;
  priority: 'high' | 'medium' | 'low';
}

export interface Visualization {
  id: string;
  type: string;
  data: any;
  config?: any;
}
