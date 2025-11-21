/**
 * Agent Context Type Definitions
 *
 * Provides full execution context to agents including user info, project data,
 * and actual dataset for processing.
 *
 * From COMPREHENSIVE_FIX_PLAN Issue #4
 */

export interface AgentExecutionContext {
  // User Information
  userId: string;
  userEmail: string;
  userRole?: string;
  subscriptionTier?: string;
  isAdmin?: boolean;

  // Project Information
  projectId: string;
  projectName?: string;
  journeyType?: string;
  goals?: string[];
  businessContext?: string;
  project?: {
    id: string;
    userId?: string | null;
    name?: string | null;
    description?: string | null;
    journeyType?: string | null;
    status?: string | null;
    data?: unknown;
    schema?: unknown;
    transformedData?: unknown;
  };

  // Data Access
  data?: any[]; // Actual dataset rows
  schema?: any; // Column metadata and types
  datasetMetadata?: {
    rowCount: number;
    columnCount: number;
    sizeBytes: number;
    uploadedAt: Date;
  };

  // Analysis Context
  analysisType?: string;
  requirements?: any;
  previousResults?: any;
  recordCount?: number;
  ownershipVerified?: boolean;

  // Request Metadata
  requestId?: string;
  timestamp: Date;
  source: 'api' | 'websocket' | 'internal';

  // Optional Features
  features?: string[];
  config?: Record<string, any>;
}

/**
 * Agent Query Context - for goal clarification and requirements
 */
export interface AgentQueryContext {
  userId: string;
  projectId?: string;
  query: string;
  queryType: 'goal_clarification' | 'data_requirements' | 'analysis_recommendation' | 'custom';
  context?: Record<string, any>;
}

/**
 * Agent Response with Context
 */
export interface AgentResponse<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  context: {
    agentType: string;
    executionTimeMs: number;
    timestamp: Date;
    requestId?: string;
  };
}

/**
 * Data Engineer Context - for data assessment and transformation
 */
export interface DataEngineerContext extends AgentExecutionContext {
  transformationRules?: any[];
  qualityThresholds?: {
    minCompleteness: number;
    minAccuracy: number;
    maxDuplicates: number;
  };
  questions?: string[];
  dataSource?: string;
}

/**
 * Data Scientist Context - for analysis execution
 */
export interface DataScientistContext extends AgentExecutionContext {
  analysisConfig?: {
    statisticalTests?: string[];
    mlModels?: string[];
    visualizations?: string[];
    confidenceLevel?: number;
  };
  dataAnalysis?: unknown;
  analysisGoal?: string[];
  computeResources?: {
    maxMemoryMB: number;
    maxExecutionTimeSeconds: number;
    useSparkCluster: boolean;
  };
  userQuestions?: string[];
  complexity?: string;
}

/**
 * Project Manager Context - for workflow orchestration
 */
export interface ProjectManagerContext extends AgentExecutionContext {
  workflowState?: {
    currentStep: string;
    completedSteps: string[];
    pendingSteps: string[];
  };
  agentCoordination?: {
    activeAgents: string[];
    waitingForUser: boolean;
    blockedBy?: string;
  };
}

/**
 * Business Agent Context - for business insights
 */
export interface BusinessAgentContext extends AgentExecutionContext {
  industry?: string;
  targetAudience?: string[];
  reportingPreferences?: {
    format: 'executive' | 'detailed' | 'technical';
    visualStyle: string;
    includeRecommendations: boolean;
  };
}
