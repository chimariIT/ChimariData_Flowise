/**
 * Agent execution validation schemas
 * Discriminated unions ensure type safety per agent type
 */

import { z } from 'zod';
import { AgentTypeEnum, ExecutionStatusEnum, SeverityEnum, PIIHandlingEnum } from './enums';

// ============================================
// AGENT-SPECIFIC INPUTS (Discriminated Union)
// ============================================

const DataEngineerInput = z.object({
  agentType: z.literal('data_engineer'),
  datasetIds: z.array(z.string()).min(1, 'At least one dataset required'),
  validateSchema: z.boolean().default(true),
  detectPII: z.boolean().default(true),
  qualityThreshold: z.number().min(0).max(100).default(70)
});

const DataScientistInput = z.object({
  agentType: z.literal('data_scientist'),
  analysisTypes: z.array(z.string()).min(1, 'At least one analysis type required'),
  questions: z.array(z.string()),
  priorResultIds: z.array(z.string()).optional(),
  confidenceThreshold: z.number().min(0).max(100).default(80)
});

const BusinessAgentInput = z.object({
  agentType: z.literal('business_agent'),
  industryContext: z.string().optional(),
  complianceRequirements: z.array(z.string()).optional(),
  priorResultIds: z.array(z.string()).optional(),
  audienceType: z.enum(['non-tech', 'business', 'technical', 'executive']).optional()
});

const ProjectManagerInput = z.object({
  agentType: z.literal('project_manager'),
  goals: z.array(z.string()).min(1),
  questions: z.array(z.string()),
  delegateTo: z.array(AgentTypeEnum).optional()
});

// Combined discriminated union
export const AgentExecutionInput = z.discriminatedUnion('agentType', [
  DataEngineerInput,
  DataScientistInput,
  BusinessAgentInput,
  ProjectManagerInput
]);

// ============================================
// AGENT-SPECIFIC OUTPUTS
// ============================================

// Schema issue structure
const SchemaIssue = z.object({
  column: z.string(),
  issue: z.string(),
  severity: SeverityEnum,
  suggestedFix: z.string().optional()
});

// PII detection structure
const PIIDetection = z.object({
  column: z.string(),
  piiType: z.string(),
  confidence: z.number().min(0).max(100),
  sampleCount: z.number().int().optional(),
  recommendation: PIIHandlingEnum.optional()
});

export const DataEngineerOutput = z.object({
  qualityScore: z.number().min(0).max(100),
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
  missingValuePercent: z.number().min(0).max(100),
  duplicateRowPercent: z.number().min(0).max(100).optional(),
  schemaIssues: z.array(SchemaIssue),
  piiDetected: z.array(PIIDetection),
  dataTypes: z.record(z.string()).optional(),
  recommendations: z.array(z.string()).optional()
});

// Insight structure
const Insight = z.object({
  id: z.string(),
  finding: z.string(),
  analysisType: z.string(),
  confidence: z.number().min(0).max(100),
  pValue: z.number().optional(),
  coefficient: z.number().optional(),
  rSquared: z.number().optional(),
  category: z.string().optional(),
  businessImplication: z.string().optional()
});

// Visualization config
const Visualization = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string().optional(),
  config: z.record(z.unknown())
});

// Model artifact
const ModelArtifact = z.object({
  id: z.string(),
  modelType: z.string(),
  modelName: z.string().optional(),
  metrics: z.record(z.number()),
  featureImportance: z.record(z.number()).optional(),
  artifactPath: z.string().optional()
});

export const DataScientistOutput = z.object({
  insights: z.array(Insight),
  visualizations: z.array(Visualization).optional(),
  modelArtifacts: z.array(ModelArtifact).optional(),
  statisticalSummary: z.object({
    testsPerformed: z.number().int(),
    significantFindings: z.number().int(),
    avgConfidence: z.number()
  }).optional()
});

// Recommendation structure
const Recommendation = z.object({
  text: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  category: z.string(),
  rationale: z.string().optional(),
  estimatedImpact: z.string().optional()
});

export const BusinessAgentOutput = z.object({
  validationPassed: z.boolean(),
  industryInsights: z.array(z.string()),
  complianceNotes: z.array(z.string()),
  recommendations: z.array(Recommendation),
  executiveSummary: z.string().optional(),
  riskAssessment: z.object({
    level: z.enum(['low', 'medium', 'high']),
    factors: z.array(z.string())
  }).optional()
});

// Union of all output types
export const AgentOutput = z.union([
  DataEngineerOutput,
  DataScientistOutput,
  BusinessAgentOutput
]);

// ============================================
// EXECUTION RECORD
// ============================================

export const AgentExecutionRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  workflowId: z.string().nullable().optional(),
  agentType: AgentTypeEnum,
  status: ExecutionStatusEnum,

  // Timestamps
  startedAt: z.date(),
  completedAt: z.date().nullable(),
  executionTimeMs: z.number().int().nullable(),

  // Resource tracking
  tokensUsed: z.number().int().nullable(),
  modelUsed: z.string().nullable(),

  // Dependencies
  dependsOnIds: z.array(z.string()),

  // Error handling
  errorMessage: z.string().nullable(),
  errorCode: z.string().nullable()
});

// ============================================
// API INPUT/OUTPUT
// ============================================

export const StartExecutionInput = z.object({
  projectId: z.string().min(1).max(50),
  agentType: AgentTypeEnum,
  input: AgentExecutionInput
});

export const ExecutionResponse = AgentExecutionRecord.extend({
  output: AgentOutput.nullable()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type AgentExecutionInput = z.infer<typeof AgentExecutionInput>;
export type DataEngineerOutput = z.infer<typeof DataEngineerOutput>;
export type DataScientistOutput = z.infer<typeof DataScientistOutput>;
export type BusinessAgentOutput = z.infer<typeof BusinessAgentOutput>;
export type AgentOutput = z.infer<typeof AgentOutput>;
export type AgentExecutionRecord = z.infer<typeof AgentExecutionRecord>;
export type StartExecutionInput = z.infer<typeof StartExecutionInput>;
export type ExecutionResponse = z.infer<typeof ExecutionResponse>;
