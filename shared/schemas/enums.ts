/**
 * Centralized Zod enum definitions
 * These replace magic strings throughout the codebase
 * FAIL FAST: Invalid values rejected at API boundary
 */

import { z } from 'zod';

// ============================================
// AGENT TYPES
// ============================================
export const AgentTypeEnum = z.enum([
  'project_manager',
  'data_engineer',
  'data_scientist',
  'business_agent',
  'template_research',
  'customer_support'
]);
export type AgentType = z.infer<typeof AgentTypeEnum>;

// ============================================
// EXECUTION STATUS
// ============================================
export const ExecutionStatusEnum = z.enum([
  'pending',
  'running',
  'success',
  'partial',
  'failed',
  'cancelled'
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

// ============================================
// ANALYSIS TYPES
// ============================================
export const AnalysisTypeEnum = z.enum([
  'descriptive',
  'correlation',
  'regression',
  'classification',
  'clustering',
  'time_series',
  'hypothesis_test',
  'anomaly_detection',
  'feature_importance',
  'dimensionality_reduction',
  'survival_analysis'
]);
export type AnalysisType = z.infer<typeof AnalysisTypeEnum>;

// ============================================
// AUDIENCE TYPES
// ============================================
export const AudienceTypeEnum = z.enum([
  'non-tech',
  'business',
  'technical',
  'executive',
  'marketing'
]);
export type AudienceType = z.infer<typeof AudienceTypeEnum>;

// ============================================
// COMPLEXITY LEVELS
// ============================================
export const ComplexityEnum = z.enum(['low', 'medium', 'high']);
export type Complexity = z.infer<typeof ComplexityEnum>;

// ============================================
// JOURNEY STEPS
// ============================================
export const JourneyStepEnum = z.enum([
  'setup',
  'data',
  'verify',
  'transform',
  'plan',
  'execute',
  'results'
]);
export type JourneyStep = z.infer<typeof JourneyStepEnum>;

// ============================================
// WORKFLOW PHASES (U2A2A2U)
// ============================================
export const WorkflowPhaseEnum = z.enum([
  'data_engineer',
  'data_scientist',
  'business_agent',
  'synthesis',
  'checkpoint',
  'execution',
  'results'
]);
export type WorkflowPhase = z.infer<typeof WorkflowPhaseEnum>;

// ============================================
// SEVERITY LEVELS
// ============================================
export const SeverityEnum = z.enum(['low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof SeverityEnum>;

// ============================================
// EVIDENCE SOURCE TYPES
// ============================================
export const EvidenceSourceTypeEnum = z.enum([
  'dataset',
  'transformation',
  'analysis',
  'insight',
  'model',
  'visualization'
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeEnum>;

// ============================================
// GENERATION SOURCE
// ============================================
export const GenerationSourceEnum = z.enum(['ai', 'template', 'manual', 'hybrid']);
export type GenerationSource = z.infer<typeof GenerationSourceEnum>;

// ============================================
// PII HANDLING RECOMMENDATIONS
// ============================================
export const PIIHandlingEnum = z.enum(['mask', 'remove', 'encrypt', 'review']);
export type PIIHandling = z.infer<typeof PIIHandlingEnum>;

// ============================================
// VISUALIZATION TYPES
// ============================================
export const VisualizationTypeEnum = z.enum([
  'bar',
  'line',
  'scatter',
  'heatmap',
  'histogram',
  'box',
  'pie',
  'area',
  'treemap',
  'sankey',
  'gauge',
  'table'
]);
export type VisualizationType = z.infer<typeof VisualizationTypeEnum>;

// ============================================
// IMPACT LEVELS
// ============================================
export const ImpactEnum = z.enum(['low', 'medium', 'high']);
export type Impact = z.infer<typeof ImpactEnum>;

// ============================================
// WORKFLOW STATUS
// ============================================
export const WorkflowStatusEnum = z.enum([
  'pending',
  'running',
  'waiting_user',
  'success',
  'failed',
  'cancelled'
]);
export type WorkflowStatus = z.infer<typeof WorkflowStatusEnum>;
