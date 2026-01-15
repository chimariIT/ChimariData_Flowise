/**
 * Workflow validation schemas
 * U2A2A2U workflow orchestration
 */

import { z } from 'zod';
import {
  AgentTypeEnum,
  WorkflowStatusEnum,
  WorkflowPhaseEnum,
  AudienceTypeEnum,
  AnalysisTypeEnum
} from './enums';

// ============================================
// WORKFLOW RECORD
// ============================================

export const WorkflowRecord = z.object({
  id: z.string(),
  projectId: z.string(),

  status: WorkflowStatusEnum,
  currentPhase: WorkflowPhaseEnum.nullable(),

  // User input that started this workflow
  goals: z.array(z.string()),
  audience: AudienceTypeEnum.nullable(),

  // Timestamps
  startedAt: z.date(),
  completedAt: z.date().nullable(),

  // Error handling
  errorMessage: z.string().nullable()
});

// ============================================
// API INPUTS
// ============================================

export const StartWorkflowInput = z.object({
  projectId: z.string().min(1).max(50),
  userId: z.string().min(1).max(50),

  // User requirements
  goals: z.array(z.string().min(1).max(500))
    .min(1, 'At least one goal required')
    .max(10, 'Maximum 10 goals'),
  questions: z.array(z.string().min(5).max(1000))
    .max(20, 'Maximum 20 questions'),

  // Analysis configuration
  analysisTypes: z.array(AnalysisTypeEnum)
    .min(1, 'At least one analysis type required'),
  audience: AudienceTypeEnum.optional().default('business'),

  // Optional constraints
  confidenceThreshold: z.number().min(0).max(100).default(80),
  maxTokens: z.number().int().positive().optional()
});

export const ContinueWorkflowInput = z.object({
  workflowId: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'clarify']),
  feedback: z.string().max(2000).optional(),
  modifications: z.record(z.unknown()).optional()
});

export const WorkflowCheckpointInput = z.object({
  workflowId: z.string().min(1),
  phase: WorkflowPhaseEnum,
  requiresApproval: z.boolean().default(true),
  summary: z.string().max(2000),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().optional()
  })).optional()
});

// ============================================
// PHASE-SPECIFIC RESULTS
// ============================================

export const DataEngineerPhaseResult = z.object({
  phase: z.literal('data_engineer'),
  executionId: z.string(),
  qualityScore: z.number().min(0).max(100),
  dataReady: z.boolean(),
  issues: z.array(z.object({
    type: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    description: z.string()
  })),
  recommendations: z.array(z.string())
});

export const DataScientistPhaseResult = z.object({
  phase: z.literal('data_scientist'),
  executionId: z.string(),
  analysesCompleted: z.number().int(),
  insightsGenerated: z.number().int(),
  significantFindings: z.number().int(),
  avgConfidence: z.number()
});

export const BusinessAgentPhaseResult = z.object({
  phase: z.literal('business_agent'),
  executionId: z.string(),
  validationPassed: z.boolean(),
  recommendationsCount: z.number().int(),
  complianceNotes: z.array(z.string())
});

export const SynthesisPhaseResult = z.object({
  phase: z.literal('synthesis'),
  answersGenerated: z.number().int(),
  avgConfidence: z.number(),
  executiveSummary: z.string()
});

export const PhaseResult = z.discriminatedUnion('phase', [
  DataEngineerPhaseResult,
  DataScientistPhaseResult,
  BusinessAgentPhaseResult,
  SynthesisPhaseResult
]);

// ============================================
// API RESPONSES
// ============================================

export const WorkflowStatusResponse = z.object({
  workflowId: z.string(),
  projectId: z.string(),
  status: WorkflowStatusEnum,
  currentPhase: WorkflowPhaseEnum.nullable(),

  // Progress tracking
  phasesCompleted: z.array(WorkflowPhaseEnum),
  phasesPending: z.array(WorkflowPhaseEnum),

  // Results by phase
  phaseResults: z.record(PhaseResult).optional(),

  // Timing
  startedAt: z.date(),
  estimatedCompletion: z.date().nullable(),

  // If waiting for user
  pendingCheckpoint: z.object({
    phase: WorkflowPhaseEnum,
    summary: z.string(),
    options: z.array(z.object({
      id: z.string(),
      label: z.string()
    })).optional()
  }).nullable()
});

export const WorkflowResultsResponse = z.object({
  workflowId: z.string(),
  projectId: z.string(),

  // Summary
  totalExecutions: z.number().int(),
  totalInsights: z.number().int(),
  answeredQuestions: z.number().int(),
  avgConfidence: z.number(),

  // Detailed results
  dataQualitySummary: z.object({
    score: z.number(),
    rowCount: z.number().int(),
    issues: z.number().int()
  }).nullable(),

  analysisSummary: z.object({
    typesPerformed: z.array(z.string()),
    significantFindings: z.number().int()
  }).nullable(),

  businessSummary: z.object({
    recommendations: z.number().int(),
    highPriorityItems: z.number().int()
  }).nullable(),

  // Artifacts
  artifacts: z.array(z.object({
    id: z.string(),
    type: z.string(),
    path: z.string().nullable()
  }))
});

// ============================================
// AGENT DELEGATION
// ============================================

export const AgentDelegationRequest = z.object({
  fromAgent: AgentTypeEnum,
  toAgent: AgentTypeEnum,
  taskType: z.string(),
  context: z.record(z.unknown()),
  priorResultIds: z.array(z.string()).optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal')
});

export const AgentDelegationResponse = z.object({
  delegationId: z.string(),
  executionId: z.string(),
  status: z.enum(['queued', 'started', 'completed', 'failed']),
  result: z.record(z.unknown()).nullable()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type WorkflowRecord = z.infer<typeof WorkflowRecord>;
export type StartWorkflowInput = z.infer<typeof StartWorkflowInput>;
export type ContinueWorkflowInput = z.infer<typeof ContinueWorkflowInput>;
export type WorkflowCheckpointInput = z.infer<typeof WorkflowCheckpointInput>;
export type DataEngineerPhaseResult = z.infer<typeof DataEngineerPhaseResult>;
export type DataScientistPhaseResult = z.infer<typeof DataScientistPhaseResult>;
export type BusinessAgentPhaseResult = z.infer<typeof BusinessAgentPhaseResult>;
export type SynthesisPhaseResult = z.infer<typeof SynthesisPhaseResult>;
export type PhaseResult = z.infer<typeof PhaseResult>;
export type WorkflowStatusResponse = z.infer<typeof WorkflowStatusResponse>;
export type WorkflowResultsResponse = z.infer<typeof WorkflowResultsResponse>;
export type AgentDelegationRequest = z.infer<typeof AgentDelegationRequest>;
export type AgentDelegationResponse = z.infer<typeof AgentDelegationResponse>;
