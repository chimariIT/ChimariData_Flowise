export type OrchestrationStatus =
  | 'goal_extraction'
  | 'path_selection'
  | 'cost_approval'
  | 'ready_for_execution'
  | 'executing'
  | 'completed'
  | 'error';

export interface WorkflowDependency {
  id: string;
  stepName: string;
  dependsOn: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  artifacts?: string[];
  metadata?: any;
}

export interface ProjectArtifact {
  id: string;
  type: 'dataset' | 'analysis' | 'visualization' | 'model' | 'report';
  name: string;
  description?: string;
  filePath?: string;
  metadata?: any;
  dependencies?: string[];
  createdAt: Date;
  version: string;
}

export interface OrchestrationState {
  status: OrchestrationStatus;
  history: Array<{
    step: string;
    userInput?: any;
    agentOutput?: any;
    timestamp: Date;
  }>;
  lastAgentOutput?: any;
  userFeedback?: any;
  currentWorkflowStep?: string;
  dependencies?: WorkflowDependency[];
  artifacts?: ProjectArtifact[];
}

export type CommunicationStyle = 'plain-language' | 'executive' | 'technical' | 'consultation' | 'mixed';

export interface JourneyRequest {
  projectId: string;
  journeyType: 'non-tech' | 'business' | 'technical' | 'consultation' | 'custom';
  userId: string;
  analysisGoal?: string;
  businessContext?: string;
  templateId?: string;
  datasetId?: string;
  selectedCapabilityIds?: string[];
}

export interface OrchestrationPlan {
  planId: string;
  journeyType: string;
  selectedAgent: string;
  tools: string[];
  workflowSteps: Array<{
    stepId: string;
    stepName: string;
    agent: string;
    tools: string[];
    estimatedDuration: number;
    dependencies: string[];
  }>;
  estimatedTotalDuration: number;
  confidence: number;
  templateId?: string;
  templateTitle?: string;
  expectedArtifacts?: string[];
  communicationProfile?: {
    style: CommunicationStyle;
    guidelines?: string[];
  };
  metadata?: Record<string, any>;
}

export interface ExpertOpinion {
  agentId: 'data_engineer' | 'data_scientist' | 'business_agent';
  agentName: string;
  opinion: any;
  confidence: number;
  timestamp: Date;
  responseTime: number;
}

export interface SynthesizedRecommendation {
  overallAssessment: 'proceed' | 'proceed_with_caution' | 'revise_approach' | 'not_feasible';
  confidence: number;
  keyFindings: string[];
  combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }>;
  actionableRecommendations: string[];
  expertConsensus: {
    dataQuality: 'good' | 'acceptable' | 'poor';
    technicalFeasibility: 'feasible' | 'challenging' | 'not_feasible';
    businessValue: 'high' | 'medium' | 'low';
  };
  estimatedTimeline: string;
  estimatedCost?: string;
  nextSteps?: string[];
}

export interface MultiAgentCoordinationResult {
  coordinationId: string;
  projectId: string;
  expertOpinions: ExpertOpinion[];
  synthesis: SynthesizedRecommendation;
  timestamp: Date;
  totalResponseTime: number;
}

export interface DecisionAuditRecord {
  auditId: string;
  projectId: string;
  userId: string;
  decisionType:
    | 'journey_selection'
    | 'agent_selection'
    | 'tool_selection'
    | 'checkpoint_approval'
    | 'workflow_modification'
    | 'cost_approval';
  decisionMaker: 'user' | 'pm_agent' | 'technical_agent' | 'business_agent' | 'data_engineer';
  decision: any;
  rationale?: string;
  alternatives?: any[];
  confidence?: number;
  timestamp: Date;
  executionContext?: {
    journeyType?: string;
    templateId?: string;
    orchestrationPlanId?: string;
  };
}
