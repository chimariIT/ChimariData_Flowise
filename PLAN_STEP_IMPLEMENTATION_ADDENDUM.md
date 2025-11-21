# Plan Step Implementation - Technical Addendum

**Purpose**: Address technical gaps and ambiguities identified in code review
**Date**: November 3, 2025
**Status**: Specification - Ready for Implementation

---

## Table of Contents

1. [Schema & Type Definitions](#schema--type-definitions)
2. [Database Migration Details](#database-migration-details)
3. [Agent Orchestration Specification](#agent-orchestration-specification)
4. [API Contract Definitions](#api-contract-definitions)
5. [Frontend-Backend Contract](#frontend-backend-contract)
6. [Integration Contract Specifications](#integration-contract-specifications)
7. [Answers to Open Questions](#answers-to-open-questions)

---

## 1. Schema & Type Definitions

### 1.1 Zod Schema for Analysis Plans

**File**: `shared/schema.ts` (additions)

```typescript
import { z } from "zod";

// Analysis Plan Status Enum (canonical list)
export const AnalysisPlanStatusEnum = z.enum([
  "pending",      // Plan creation in progress
  "ready",        // Plan ready for review
  "approved",     // User approved the plan
  "rejected",     // User rejected the plan
  "modified",     // Plan modified and awaiting re-approval
  "executing",    // Plan currently being executed
  "completed",    // Plan execution completed
  "cancelled"     // Plan cancelled by user
]);
export type AnalysisPlanStatus = z.infer<typeof AnalysisPlanStatusEnum>;

// Analysis Step Schema
export const analysisStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  method: z.string().min(1).max(100),
  inputs: z.array(z.string()).default([]),
  expectedOutputs: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  estimatedDuration: z.string().max(50),
  confidence: z.number().min(0).max(100),
});
export type AnalysisStep = z.infer<typeof analysisStepSchema>;

// Data Assessment Schema
export const dataAssessmentSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  completenessScore: z.number().min(0).max(100),
  recordCount: z.number().int().nonnegative(),
  columnCount: z.number().int().positive(),
  missingData: z.array(z.string()).default([]),
  recommendedTransformations: z.array(z.string()).default([]),
  infrastructureNeeds: z.object({
    useSpark: z.boolean(),
    estimatedMemoryGB: z.number().positive(),
    parallelizable: z.boolean(),
  }),
  estimatedProcessingTime: z.string().max(50),
});
export type DataAssessment = z.infer<typeof dataAssessmentSchema>;

// ML Model Specification Schema
export const mlModelSpecSchema = z.object({
  modelType: z.string().max(50),
  algorithm: z.string().max(100),
  targetVariable: z.string().max(100),
  features: z.array(z.string()),
  expectedAccuracy: z.string().max(50),
  trainingTime: z.string().max(50),
  interpretability: z.string().max(100).optional(),
});
export type MLModelSpec = z.infer<typeof mlModelSpecSchema>;

// Visualization Spec Schema
export const visualizationSpecSchema = z.object({
  type: z.string().max(50),
  title: z.string().max(200),
  description: z.string().max(500),
  dataFields: z.array(z.string()).optional(),
});
export type VisualizationSpec = z.infer<typeof visualizationSpecSchema>;

// Business Context Schema
export const businessContextSchema = z.object({
  industryBenchmarks: z.array(z.string()).default([]),
  relevantKPIs: z.array(z.string()).default([]),
  complianceRequirements: z.array(z.string()).default([]),
  reportingStandards: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});
export type BusinessContext = z.infer<typeof businessContextSchema>;

// Cost Breakdown Schema
export const costBreakdownSchema = z.object({
  total: z.number().nonnegative(),
  breakdown: z.record(z.number().nonnegative()),
});
export type CostBreakdown = z.infer<typeof costBreakdownSchema>;

// Agent Contribution Schema
export const agentContributionSchema = z.object({
  completedAt: z.string().datetime(),
  contribution: z.string().max(500),
  duration: z.number().nonnegative().optional(),
  status: z.enum(["success", "partial", "failed"]),
  error: z.string().optional(),
});
export type AgentContribution = z.infer<typeof agentContributionSchema>;

// Complete Analysis Plan Schema
export const analysisPlanSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  createdBy: z.string().default("pm_agent"),
  version: z.number().int().positive().default(1),

  // Plan Content
  executiveSummary: z.string().min(50).max(2000),
  dataAssessment: dataAssessmentSchema,
  analysisSteps: z.array(analysisStepSchema).min(1),
  visualizations: z.array(visualizationSpecSchema).default([]),
  businessContext: businessContextSchema.optional(),
  mlModels: z.array(mlModelSpecSchema).default([]),

  // Estimates
  estimatedCost: costBreakdownSchema,
  estimatedDuration: z.string().max(50),
  complexity: z.enum(["low", "medium", "high", "very_high"]),

  // Metadata
  risks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  agentContributions: z.record(agentContributionSchema),

  // Approval Workflow
  status: AnalysisPlanStatusEnum,
  approvedAt: z.date().optional(),
  approvedBy: z.string().optional(),
  rejectionReason: z.string().optional(),
  modificationsRequested: z.string().optional(),

  // Execution Tracking
  executedAt: z.date().optional(),
  executionCompletedAt: z.date().optional(),
  actualCost: costBreakdownSchema.optional(),
  actualDuration: z.string().optional(),

  // Audit
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;

// Insert schema (for API validation)
export const insertAnalysisPlanSchema = analysisPlanSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  executedAt: true,
  executionCompletedAt: true,
});
export type InsertAnalysisPlan = z.infer<typeof insertAnalysisPlanSchema>;
```

### 1.2 Drizzle Table Definition

**File**: `shared/schema.ts` (additions)

```typescript
import { nanoid } from "nanoid";

// Analysis Plans Table
export const analysisPlans = pgTable("analysis_plans", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by", { length: 50 }).notNull().default("pm_agent"),
  version: integer("version").notNull().default(1),

  // Plan Content (JSONB for complex structures)
  executiveSummary: text("executive_summary").notNull(),
  dataAssessment: jsonb("data_assessment").notNull().$type<DataAssessment>(),
  analysisSteps: jsonb("analysis_steps").notNull().$type<AnalysisStep[]>(),
  visualizations: jsonb("visualizations").default([]).$type<VisualizationSpec[]>(),
  businessContext: jsonb("business_context").$type<BusinessContext>(),
  mlModels: jsonb("ml_models").default([]).$type<MLModelSpec[]>(),

  // Estimates
  estimatedCost: jsonb("estimated_cost").notNull().$type<CostBreakdown>(),
  estimatedDuration: varchar("estimated_duration", { length: 50 }).notNull(),
  complexity: varchar("complexity", { length: 20 }).notNull(),

  // Metadata
  risks: jsonb("risks").default([]).$type<string[]>(),
  recommendations: jsonb("recommendations").default([]).$type<string[]>(),
  agentContributions: jsonb("agent_contributions").notNull().$type<Record<string, AgentContribution>>(),

  // Approval Workflow
  status: varchar("status", { length: 30 }).notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  rejectionReason: text("rejection_reason"),
  modificationsRequested: text("modifications_requested"),

  // Execution Tracking
  executedAt: timestamp("executed_at"),
  executionCompletedAt: timestamp("execution_completed_at"),
  actualCost: jsonb("actual_cost").$type<CostBreakdown>(),
  actualDuration: varchar("actual_duration", { length: 50 }),

  // Audit
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Indexes
  projectIdIdx: index("analysis_plans_project_id_idx").on(table.projectId),
  statusIdx: index("analysis_plans_status_idx").on(table.status),
  createdAtIdx: index("analysis_plans_created_at_idx").on(table.createdAt),
  // Composite index for finding active plans
  projectStatusIdx: index("analysis_plans_project_status_idx").on(table.projectId, table.status),
  // Check constraint for valid statuses
  statusCheck: check(
    "analysis_plans_status_check",
    sql`${table.status} IN ('pending', 'ready', 'approved', 'rejected', 'modified', 'executing', 'completed', 'cancelled')`
  ),
  // Check constraint for complexity
  complexityCheck: check(
    "analysis_plans_complexity_check",
    sql`${table.complexity} IN ('low', 'medium', 'high', 'very_high')`
  ),
}));

// Drizzle insert schema
export const insertAnalysisPlanSchemaDb = createInsertSchema(analysisPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
```

### 1.3 Update Projects Status Enum

**File**: `shared/schema.ts` (modification)

```typescript
// Add new statuses to projects table check constraint
export const projects = pgTable("projects", {
  // ... existing fields ...
  status: varchar("status", { length: 50 }).notNull().default("draft"),
}, (table) => ({
  // ... existing constraints ...
  statusCheck: check(
    "projects_status_check",
    sql`${table.status} IN (
      'draft', 'uploading', 'processing', 'pii_review', 'ready',
      'plan_creation', 'plan_review', 'plan_approved',  -- NEW STATUSES
      'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled'
    )`
  ),
}));
```

### 1.4 Update Agent Checkpoints for Plan

**File**: `shared/schema.ts` (no changes needed, but document checkpoint names)

```typescript
/**
 * New checkpoint names for plan step:
 * - "plan_creation_started"       (PM agent initiates)
 * - "data_assessment_pending"     (Waiting for Data Engineer)
 * - "data_assessment_completed"   (Data Engineer done)
 * - "analysis_recommendation_pending" (Waiting for Data Scientist)
 * - "analysis_recommended"        (Data Scientist done)
 * - "business_context_pending"    (Waiting for Business Agent)
 * - "business_context_added"      (Business Agent done)
 * - "plan_synthesized"            (PM completed synthesis)
 * - "plan_awaiting_approval"      (Ready for user review)
 * - "plan_approved"               (User approved)
 * - "plan_rejected"               (User rejected)
 * - "plan_regeneration_requested" (User wants modifications)
 *
 * All checkpoints include planId in data field:
 * data: { planId: string, ...other fields }
 */
```

---

## 2. Database Migration Details

### 2.1 Migration File: `add_analysis_plans_table.sql`

**File**: `migrations/YYYYMMDDHHMMSS_add_analysis_plans_table.sql`

```sql
-- Migration: Add Analysis Plans Table
-- Date: 2025-11-03
-- Description: Add analysis_plans table for storing AI-generated analysis plans

BEGIN;

-- Create analysis_plans table
CREATE TABLE IF NOT EXISTS analysis_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  created_by VARCHAR(50) NOT NULL DEFAULT 'pm_agent',
  version INTEGER NOT NULL DEFAULT 1,

  -- Plan Content (JSONB)
  executive_summary TEXT NOT NULL,
  data_assessment JSONB NOT NULL,
  analysis_steps JSONB NOT NULL,
  visualizations JSONB DEFAULT '[]'::jsonb,
  business_context JSONB,
  ml_models JSONB DEFAULT '[]'::jsonb,

  -- Estimates
  estimated_cost JSONB NOT NULL,
  estimated_duration VARCHAR(50) NOT NULL,
  complexity VARCHAR(20) NOT NULL,

  -- Metadata
  risks JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  agent_contributions JSONB NOT NULL,

  -- Approval Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMP,
  approved_by TEXT,
  rejection_reason TEXT,
  modifications_requested TEXT,

  -- Execution Tracking
  executed_at TIMESTAMP,
  execution_completed_at TIMESTAMP,
  actual_cost JSONB,
  actual_duration VARCHAR(50),

  -- Audit
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Foreign Key
  CONSTRAINT fk_analysis_plans_project
    FOREIGN KEY (project_id)
    REFERENCES projects(id)
    ON DELETE CASCADE,

  -- Check Constraints
  CONSTRAINT analysis_plans_status_check
    CHECK (status IN ('pending', 'ready', 'approved', 'rejected', 'modified', 'executing', 'completed', 'cancelled')),

  CONSTRAINT analysis_plans_complexity_check
    CHECK (complexity IN ('low', 'medium', 'high', 'very_high'))
);

-- Create indexes
CREATE INDEX idx_analysis_plans_project_id ON analysis_plans(project_id);
CREATE INDEX idx_analysis_plans_status ON analysis_plans(status);
CREATE INDEX idx_analysis_plans_created_at ON analysis_plans(created_at DESC);
CREATE INDEX idx_analysis_plans_project_status ON analysis_plans(project_id, status);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_analysis_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_analysis_plans_updated_at
  BEFORE UPDATE ON analysis_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_analysis_plans_updated_at();

-- Update projects status check constraint to include new plan-related statuses
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft', 'uploading', 'processing', 'pii_review', 'ready',
    'plan_creation', 'plan_review', 'plan_approved',
    'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled'
  ));

COMMIT;
```

### 2.2 Rollback Migration

**File**: `migrations/YYYYMMDDHHMMSS_rollback_analysis_plans_table.sql`

```sql
-- Rollback: Remove Analysis Plans Table
BEGIN;

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_analysis_plans_updated_at ON analysis_plans;
DROP FUNCTION IF EXISTS update_analysis_plans_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_analysis_plans_project_id;
DROP INDEX IF EXISTS idx_analysis_plans_status;
DROP INDEX IF EXISTS idx_analysis_plans_created_at;
DROP INDEX IF EXISTS idx_analysis_plans_project_status;

-- Drop table
DROP TABLE IF EXISTS analysis_plans CASCADE;

-- Restore original projects status constraint
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN (
    'draft', 'uploading', 'processing', 'pii_review', 'ready',
    'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled'
  ));

COMMIT;
```

### 2.3 Apply Migration via Drizzle

**Command**:
```bash
npm run db:push
```

**OR** for production with migration files:
```bash
npx drizzle-kit generate:pg
npx drizzle-kit push:pg
```

---

## 3. Agent Orchestration Specification

### 3.1 Orchestration State Management

**File**: `server/services/project-manager-agent.ts` (new section)

```typescript
interface PlanCreationState {
  planId: string;
  projectId: string;
  userId: string;
  status: 'initializing' | 'gathering' | 'synthesizing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;

  // Agent responses
  dataEngineerResponse?: {
    status: 'pending' | 'completed' | 'failed' | 'timeout';
    data?: any;
    error?: string;
    duration?: number;
  };
  dataScientistResponse?: {
    status: 'pending' | 'completed' | 'failed' | 'timeout';
    data?: any;
    error?: string;
    duration?: number;
  };
  businessAgentResponse?: {
    status: 'pending' | 'completed' | 'failed' | 'timeout';
    data?: any;
    error?: string;
    duration?: number;
  };

  // Retry tracking
  retryCount: number;
  maxRetries: number;

  // Lock management
  lockedAt?: Date;
  lockKey: string;
}

// In-memory state tracker (for single-server setup)
// For multi-server, use Redis
private planCreationStates: Map<string, PlanCreationState> = new Map();

// Lock timeout: 5 minutes (prevents deadlock)
private readonly LOCK_TIMEOUT_MS = 5 * 60 * 1000;
```

### 3.2 Idempotency & Duplicate Prevention

```typescript
/**
 * Acquire lock for plan creation to prevent duplicates
 * Returns existing plan if one is already being created
 */
private async acquirePlanCreationLock(projectId: string): Promise<{
  acquired: boolean;
  existingPlanId?: string;
  lockKey?: string;
}> {
  // Check if a plan is already being created (status: pending or ready)
  const existingPlan = await db.select()
    .from(analysisPlans)
    .where(and(
      eq(analysisPlans.projectId, projectId),
      or(
        eq(analysisPlans.status, 'pending'),
        eq(analysisPlans.status, 'ready')
      )
    ))
    .limit(1);

  if (existingPlan.length > 0) {
    console.log(`⚠️  Plan already exists for project ${projectId}: ${existingPlan[0].id}`);
    return {
      acquired: false,
      existingPlanId: existingPlan[0].id
    };
  }

  // Check in-memory state for active creation
  const existingState = Array.from(this.planCreationStates.values())
    .find(state =>
      state.projectId === projectId &&
      state.status !== 'completed' &&
      state.status !== 'failed'
    );

  if (existingState) {
    const lockAge = Date.now() - existingState.lockedAt!.getTime();
    if (lockAge < this.LOCK_TIMEOUT_MS) {
      console.log(`⚠️  Plan creation in progress for project ${projectId}`);
      return {
        acquired: false,
        existingPlanId: existingState.planId
      };
    } else {
      // Lock expired, remove stale state
      console.log(`⚠️  Lock expired for plan ${existingState.planId}, removing`);
      this.planCreationStates.delete(existingState.lockKey);
    }
  }

  // Create lock
  const lockKey = `plan:${projectId}:${nanoid()}`;
  return {
    acquired: true,
    lockKey
  };
}

/**
 * Release lock after plan creation completes or fails
 */
private releasePlanCreationLock(lockKey: string): void {
  this.planCreationStates.delete(lockKey);
  console.log(`🔓 Released lock: ${lockKey}`);
}
```

### 3.3 Enhanced createAnalysisPlan() with Timeout & Retry

```typescript
async createAnalysisPlan(params: {
  projectId: string;
  userId: string;
  journeyType: string;
  forceRegenerate?: boolean; // For handling rejections
}): Promise<{
  planId: string;
  plan?: AnalysisPlan;
  status: 'success' | 'partial' | 'failed' | 'exists';
  errors?: string[];
  existingPlanId?: string;
}> {
  const { projectId, userId, journeyType, forceRegenerate = false } = params;

  // Step 1: Acquire lock (prevent duplicates)
  const lockResult = await this.acquirePlanCreationLock(projectId);
  if (!lockResult.acquired && !forceRegenerate) {
    return {
      planId: lockResult.existingPlanId!,
      status: 'exists',
      existingPlanId: lockResult.existingPlanId
    };
  }

  const lockKey = lockResult.lockKey!;
  const planId = nanoid();
  const errors: string[] = [];

  try {
    // Step 2: Initialize state
    const state: PlanCreationState = {
      planId,
      projectId,
      userId,
      status: 'initializing',
      startedAt: new Date(),
      retryCount: 0,
      maxRetries: 2,
      lockKey,
      lockedAt: new Date()
    };
    this.planCreationStates.set(lockKey, state);

    // Step 3: Update project status
    await db.update(projects)
      .set({ status: 'plan_creation', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // Step 4: Create initial plan record
    await db.insert(analysisPlans).values({
      id: planId,
      projectId,
      createdBy: 'pm_agent',
      status: 'pending',
      executiveSummary: 'Plan creation in progress...',
      dataAssessment: {} as any, // Will be filled
      analysisSteps: [],
      estimatedCost: { total: 0, breakdown: {} },
      estimatedDuration: 'Calculating...',
      complexity: 'medium',
      agentContributions: {},
    });

    // Step 5: Create checkpoints
    await db.insert(agentCheckpoints).values({
      id: nanoid(),
      projectId,
      agentType: 'pm',
      checkpointName: 'plan_creation_started',
      status: 'in_progress',
      data: { planId },
    });

    // Step 6: Broadcast event
    await this.messageBroker.publish('plan_creation_started', {
      projectId,
      userId,
      planId,
      timestamp: new Date().toISOString()
    });

    // Step 7: Gather agent inputs with timeout
    state.status = 'gathering';
    const agentTimeout = 30000; // 30 seconds per agent

    const [dataEngineerResult, dataScientistResult, businessAgentResult] = await Promise.allSettled([
      this.gatherDataEngineerInput(projectId, planId, agentTimeout),
      this.gatherDataScientistInput(projectId, planId, agentTimeout),
      this.gatherBusinessAgentInput(projectId, planId, agentTimeout)
    ]);

    // Step 8: Process results (handle partial success)
    state.dataEngineerResponse = this.processAgentResult('data_engineer', dataEngineerResult);
    state.dataScientistResponse = this.processAgentResult('data_scientist', dataScientistResult);
    state.businessAgentResponse = this.processAgentResult('business_agent', businessAgentResult);

    if (state.dataEngineerResponse.status === 'failed') {
      errors.push('Data Engineer analysis failed');
    }
    if (state.dataScientistResponse.status === 'failed') {
      errors.push('Data Scientist recommendations failed');
    }
    // Business agent is optional, so failure is not critical

    // Step 9: Synthesize plan
    state.status = 'synthesizing';
    const synthesizedPlan = await this.synthesizePlan({
      planId,
      projectId,
      journeyType,
      dataEngineerInput: state.dataEngineerResponse.data,
      dataScientistInput: state.dataScientistResponse.data,
      businessAgentInput: state.businessAgentResponse.data,
    });

    // Step 10: Update plan in database
    await db.update(analysisPlans)
      .set({
        ...synthesizedPlan,
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(analysisPlans.id, planId));

    // Step 11: Update project status
    await db.update(projects)
      .set({ status: 'plan_review', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    // Step 12: Create completion checkpoint
    await db.insert(agentCheckpoints).values({
      id: nanoid(),
      projectId,
      agentType: 'pm',
      checkpointName: 'plan_awaiting_approval',
      status: 'waiting_approval',
      data: { planId },
    });

    // Step 13: Broadcast completion
    await this.messageBroker.publish('plan_ready', {
      projectId,
      planId,
      timestamp: new Date().toISOString()
    });

    state.status = 'completed';
    state.completedAt = new Date();

    return {
      planId,
      plan: synthesizedPlan as AnalysisPlan,
      status: errors.length > 0 ? 'partial' : 'success',
      errors: errors.length > 0 ? errors : undefined
    };

  } catch (error: any) {
    console.error('❌ Plan creation failed:', error);

    // Update plan status to failed
    await db.update(analysisPlans)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(analysisPlans.id, planId));

    await db.update(projects)
      .set({ status: 'error', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    return {
      planId,
      status: 'failed',
      errors: [error.message || 'Unknown error']
    };

  } finally {
    // Always release lock
    this.releasePlanCreationLock(lockKey);
  }
}

/**
 * Helper to gather Data Engineer input with timeout
 */
private async gatherDataEngineerInput(
  projectId: string,
  planId: string,
  timeout: number
): Promise<any> {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Data Engineer timeout')), timeout)
  );

  const workPromise = (async () => {
    // Fetch project data
    const project = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project[0]) throw new Error('Project not found');

    // Call Data Engineer
    const result = await this.dataEngineerAgent.assessDataForPlan({
      projectId,
      schema: project[0].schema || {},
      data: project[0].data || [],
      goals: project[0].description || '',
      questions: [], // Would parse from project data
    });

    // Create checkpoint
    await db.insert(agentCheckpoints).values({
      id: nanoid(),
      projectId,
      agentType: 'data_engineer',
      checkpointName: 'data_assessment_completed',
      status: 'completed',
      data: { planId, result },
    });

    return result;
  })();

  return Promise.race([workPromise, timeoutPromise]);
}

// Similar implementations for gatherDataScientistInput() and gatherBusinessAgentInput()
```

### 3.4 Rejection & Regeneration Flow

```typescript
/**
 * Handle plan rejection and trigger regeneration
 */
async handlePlanRejection(params: {
  projectId: string;
  planId: string;
  userId: string;
  reason: string;
  modificationsRequested: string;
}): Promise<{
  newPlanId: string;
  status: 'success' | 'failed';
}> {
  const { projectId, planId, userId, reason, modificationsRequested } = params;

  // Step 1: Update rejected plan
  await db.update(analysisPlans)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      modificationsRequested,
      updatedAt: new Date(),
    })
    .where(eq(analysisPlans.id, planId));

  // Step 2: Create rejection checkpoint
  await db.insert(agentCheckpoints).values({
    id: nanoid(),
    projectId,
    agentType: 'user',
    checkpointName: 'plan_rejected',
    status: 'rejected',
    data: { planId, reason, modificationsRequested },
  });

  // Step 3: Update project status back to plan_creation
  await db.update(projects)
    .set({ status: 'plan_creation', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  // Step 4: Trigger regeneration with forceRegenerate flag
  const result = await this.createAnalysisPlan({
    projectId,
    userId,
    journeyType: '', // Would fetch from project
    forceRegenerate: true
  });

  return {
    newPlanId: result.planId,
    status: result.status === 'success' || result.status === 'partial' ? 'success' : 'failed'
  };
}
```

---

## 4. API Contract Definitions

### 4.1 Request/Response Type Definitions

**File**: `server/types/analysis-plan-api.ts` (new file)

```typescript
import { z } from 'zod';
import {
  AnalysisPlan,
  AnalysisPlanStatus,
  analysisPlanSchema,
} from '../../shared/schema';

// POST /api/projects/:projectId/plan/create
export const createPlanRequestSchema = z.object({
  forceRegenerate: z.boolean().optional().default(false),
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const createPlanResponseSchema = z.object({
  success: z.boolean(),
  planId: z.string(),
  plan: analysisPlanSchema.optional(),
  status: z.enum(['success', 'partial', 'failed', 'exists']),
  errors: z.array(z.string()).optional(),
  existingPlanId: z.string().optional(),
});
export type CreatePlanResponse = z.infer<typeof createPlanResponseSchema>;

// GET /api/projects/:projectId/plan
export const getPlanResponseSchema = z.object({
  success: z.boolean(),
  plan: analysisPlanSchema.nullable(),
  versions: z.array(z.object({
    planId: z.string(),
    version: z.number(),
    status: z.string(),
    createdAt: z.string(),
  })).optional(),
});
export type GetPlanResponse = z.infer<typeof getPlanResponseSchema>;

// POST /api/projects/:projectId/plan/:planId/approve
export const approvePlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  nextStep: z.string().optional(), // e.g., "/projects/:id/pricing"
});
export type ApprovePlanResponse = z.infer<typeof approvePlanResponseSchema>;

// POST /api/projects/:projectId/plan/:planId/reject
export const rejectPlanRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
  modificationsRequested: z.string().max(2000).optional(),
  regenerate: z.boolean().optional().default(true),
});
export type RejectPlanRequest = z.infer<typeof rejectPlanRequestSchema>;

export const rejectPlanResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  newPlanId: z.string().optional(),
  regenerationStatus: z.enum(['pending', 'in_progress', 'completed', 'failed']).optional(),
});
export type RejectPlanResponse = z.infer<typeof rejectPlanResponseSchema>;

// GET /api/projects/:projectId/plan/:planId/progress
export const getPlanProgressResponseSchema = z.object({
  success: z.boolean(),
  progress: z.object({
    overall: z.number().min(0).max(100),
    stages: z.object({
      initialization: z.object({ complete: z.boolean(), duration: z.number().optional() }),
      dataEngineer: z.object({ complete: z.boolean(), duration: z.number().optional(), status: z.string() }),
      dataScientist: z.object({ complete: z.boolean(), duration: z.number().optional(), status: z.string() }),
      businessAgent: z.object({ complete: z.boolean(), duration: z.number().optional(), status: z.string() }),
      synthesis: z.object({ complete: z.boolean(), duration: z.number().optional() }),
    }),
    estimatedTimeRemaining: z.string().optional(),
  }),
  status: z.string(),
});
export type GetPlanProgressResponse = z.infer<typeof getPlanProgressResponseSchema>;
```

### 4.2 Updated API Route Implementation

**File**: `server/routes/analysis-plan.ts` (updated with proper contracts)

```typescript
import { createPlanRequestSchema, createPlanResponseSchema, /* ... other schemas */ } from '../types/analysis-plan-api';

// POST /api/projects/:projectId/plan/create
router.post('/:projectId/plan/create', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  // Validate request body
  const bodyValidation = createPlanRequestSchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: bodyValidation.error.errors
    });
  }

  const { forceRegenerate } = bodyValidation.data;

  // Check access
  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Get journey type from project
  const journeyType = accessCheck.project.journeyType || 'ai_guided';

  // Create plan
  const result = await projectManagerAgent.createAnalysisPlan({
    projectId,
    userId,
    journeyType,
    forceRegenerate
  });

  // Format response according to contract
  const response: CreatePlanResponse = {
    success: result.status !== 'failed',
    planId: result.planId,
    plan: result.plan,
    status: result.status,
    errors: result.errors,
    existingPlanId: result.existingPlanId
  };

  res.json(response);
});

// GET /api/projects/:projectId/plan
router.get('/:projectId/plan', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Get most recent plan
  const plans = await db.select()
    .from(analysisPlans)
    .where(eq(analysisPlans.projectId, projectId))
    .orderBy(analysisPlans.createdAt, 'desc')
    .limit(5); // Return last 5 versions

  const response: GetPlanResponse = {
    success: true,
    plan: plans[0] || null,
    versions: plans.map(p => ({
      planId: p.id,
      version: p.version,
      status: p.status,
      createdAt: p.createdAt.toISOString()
    }))
  };

  res.json(response);
});

// POST /api/projects/:projectId/plan/:planId/approve
router.post('/:projectId/plan/:planId/approve', ensureAuthenticated, async (req, res) => {
  const { projectId, planId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Check plan exists and is in correct status
  const plan = await db.select()
    .from(analysisPlans)
    .where(and(
      eq(analysisPlans.id, planId),
      eq(analysisPlans.projectId, projectId)
    ))
    .limit(1);

  if (!plan[0]) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }

  if (plan[0].status !== 'ready' && plan[0].status !== 'modified') {
    return res.status(400).json({
      success: false,
      error: `Cannot approve plan with status: ${plan[0].status}. Plan must be in 'ready' or 'modified' status.`
    });
  }

  // Approve plan
  await db.update(analysisPlans)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: userId,
      updatedAt: new Date()
    })
    .where(eq(analysisPlans.id, planId));

  // Create checkpoint
  await db.insert(agentCheckpoints).values({
    id: nanoid(),
    projectId,
    agentType: 'user',
    checkpointName: 'plan_approved',
    status: 'approved',
    data: { planId, approvedBy: userId },
  });

  // Update project status
  await db.update(projects)
    .set({ status: 'plan_approved', updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  const response: ApprovePlanResponse = {
    success: true,
    message: 'Plan approved successfully',
    nextStep: `/projects/${projectId}/pricing`
  };

  res.json(response);
});

// POST /api/projects/:projectId/plan/:planId/reject
router.post('/:projectId/plan/:planId/reject', ensureAuthenticated, async (req, res) => {
  const { projectId, planId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  // Validate request
  const bodyValidation = rejectPlanRequestSchema.safeParse(req.body);
  if (!bodyValidation.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: bodyValidation.error.errors
    });
  }

  const { reason, modificationsRequested, regenerate } = bodyValidation.data;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Check plan status
  const plan = await db.select()
    .from(analysisPlans)
    .where(and(
      eq(analysisPlans.id, planId),
      eq(analysisPlans.projectId, projectId)
    ))
    .limit(1);

  if (!plan[0]) {
    return res.status(404).json({ success: false, error: 'Plan not found' });
  }

  if (plan[0].status !== 'ready' && plan[0].status !== 'modified') {
    return res.status(400).json({
      success: false,
      error: `Cannot reject plan with status: ${plan[0].status}`
    });
  }

  if (regenerate) {
    // Trigger regeneration
    const regenerationResult = await projectManagerAgent.handlePlanRejection({
      projectId,
      planId,
      userId,
      reason,
      modificationsRequested: modificationsRequested || ''
    });

    const response: RejectPlanResponse = {
      success: regenerationResult.status === 'success',
      message: 'Plan rejected. Generating new plan...',
      newPlanId: regenerationResult.newPlanId,
      regenerationStatus: 'in_progress'
    };

    res.json(response);
  } else {
    // Just reject without regeneration
    await db.update(analysisPlans)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        modificationsRequested,
        updatedAt: new Date()
      })
      .where(eq(analysisPlans.id, planId));

    await db.insert(agentCheckpoints).values({
      id: nanoid(),
      projectId,
      agentType: 'user',
      checkpointName: 'plan_rejected',
      status: 'rejected',
      data: { planId, reason, modificationsRequested },
    });

    // Update project status back to ready (for manual retry)
    await db.update(projects)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    const response: RejectPlanResponse = {
      success: true,
      message: 'Plan rejected. You can create a new plan when ready.'
    };

    res.json(response);
  }
});
```

---

## 5. Frontend-Backend Contract

### 5.1 Frontend API Client Types

**File**: `client/src/types/analysis-plan.ts` (new file)

```typescript
// Mirror backend types
export interface CreatePlanRequest {
  forceRegenerate?: boolean;
}

export interface CreatePlanResponse {
  success: boolean;
  planId: string;
  plan?: AnalysisPlan;
  status: 'success' | 'partial' | 'failed' | 'exists';
  errors?: string[];
  existingPlanId?: string;
}

export interface GetPlanResponse {
  success: boolean;
  plan: AnalysisPlan | null;
  versions?: Array<{
    planId: string;
    version: number;
    status: string;
    createdAt: string;
  }>;
}

export interface ApprovePlanResponse {
  success: boolean;
  message?: string;
  nextStep?: string;
}

export interface RejectPlanRequest {
  reason: string;
  modificationsRequested?: string;
  regenerate?: boolean;
}

export interface RejectPlanResponse {
  success: boolean;
  message?: string;
  newPlanId?: string;
  regenerationStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface PlanProgressResponse {
  success: boolean;
  progress: {
    overall: number;
    stages: {
      initialization: { complete: boolean; duration?: number };
      dataEngineer: { complete: boolean; duration?: number; status: string };
      dataScientist: { complete: boolean; duration?: number; status: string };
      businessAgent: { complete: boolean; duration?: number; status: string };
      synthesis: { complete: boolean; duration?: number };
    };
    estimatedTimeRemaining?: string;
  };
  status: string;
}

// Full AnalysisPlan type (matches backend schema)
export interface AnalysisPlan {
  id: string;
  projectId: string;
  createdBy: string;
  version: number;
  executiveSummary: string;
  dataAssessment: DataAssessment;
  analysisSteps: AnalysisStep[];
  visualizations: VisualizationSpec[];
  businessContext?: BusinessContext;
  mlModels: MLModelSpec[];
  estimatedCost: CostBreakdown;
  estimatedDuration: string;
  complexity: 'low' | 'medium' | 'high' | 'very_high';
  risks: string[];
  recommendations: string[];
  agentContributions: Record<string, AgentContribution>;
  status: AnalysisPlanStatus;
  approvedAt?: string;
  approvedBy?: string;
  rejectionReason?: string;
  modificationsRequested?: string;
  executedAt?: string;
  executionCompletedAt?: string;
  actualCost?: CostBreakdown;
  actualDuration?: string;
  createdAt: string;
  updatedAt: string;
}

// ... other supporting types
```

### 5.2 Updated Frontend Component

**File**: `client/src/pages/plan-step.tsx` (updated with proper API calls)

```tsx
import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import type { CreatePlanResponse, GetPlanResponse, RejectPlanRequest } from '@/types/analysis-plan';

export default function PlanStep() {
  const [, params] = useRoute('/projects/:projectId/plan');
  const [, navigate] = useLocation();
  const projectId = params?.projectId;
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Fetch or create plan with proper typing
  const { data: response, isLoading, error } = useQuery<GetPlanResponse>({
    queryKey: ['analysis-plan', projectId],
    queryFn: async () => {
      // Try to get existing plan first
      const existing = await apiClient.get<GetPlanResponse>(`/api/projects/${projectId}/plan`);

      if (existing.plan && (existing.plan.status === 'ready' || existing.plan.status === 'approved')) {
        return existing;
      }

      // No ready plan, create one
      const createResult = await apiClient.post<CreatePlanResponse>(`/api/projects/${projectId}/plan/create`, {
        forceRegenerate: false
      });

      // Poll for completion if status is pending
      if (createResult.status === 'exists' || createResult.plan) {
        return {
          success: true,
          plan: createResult.plan || null
        };
      }

      // Plan creation started, poll for updates
      return existing; // Will show loading state
    },
    enabled: !!projectId,
    refetchInterval: (data) => {
      // Poll every 2 seconds if plan is pending
      return data?.plan?.status === 'pending' ? 2000 : false;
    }
  });

  // Approve mutation with proper typing
  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/api/projects/${projectId}/plan/${response?.plan?.id}/approve`);
    },
    onSuccess: (data: any) => {
      // Navigate to next step from API response
      if (data.nextStep) {
        navigate(data.nextStep);
      } else {
        navigate(`/projects/${projectId}/pricing`);
      }
    }
  });

  // Reject mutation with modal
  const rejectMutation = useMutation({
    mutationFn: async (data: RejectPlanRequest) => {
      return apiClient.post(`/api/projects/${projectId}/plan/${response?.plan?.id}/reject`, data);
    },
    onSuccess: () => {
      setShowRejectModal(false);
      // Refetch to get new plan
      queryClient.invalidateQueries(['analysis-plan', projectId]);
    }
  });

  const plan = response?.plan;

  if (isLoading || !plan || plan.status === 'pending') {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Creating Your Analysis Plan...</h1>
        <PlanCreationProgress projectId={projectId!} planId={plan?.id} />
      </div>
    );
  }

  // ... rest of component using properly typed plan data
}
```

---

## 6. Integration Contract Specifications

### 6.1 Pricing Integration

**File**: `server/services/pricing.ts` (additions)

```typescript
/**
 * Calculate cost based on approved analysis plan
 * More accurate than generic estimation
 */
export async function estimateCostFromPlan(
  planId: string
): Promise<{
  total: number;
  breakdown: Record<string, number>;
  details: Array<{ item: string; quantity: number; unit_cost: number; total: number }>;
}> {
  // Fetch plan
  const plan = await db.select()
    .from(analysisPlans)
    .where(eq(analysisPlans.id, planId))
    .limit(1);

  if (!plan[0]) throw new Error('Plan not found');

  const breakdown: Record<string, number> = {};
  const details: Array<{ item: string; quantity: number; unit_cost: number; total: number }> = [];

  // Cost per analysis step
  for (const step of plan[0].analysisSteps) {
    const stepCost = calculateAnalysisStepCost(step);
    breakdown[step.name] = stepCost;
    details.push({
      item: step.name,
      quantity: 1,
      unit_cost: stepCost,
      total: stepCost
    });
  }

  // Cost per ML model
  for (const model of plan[0].mlModels) {
    const modelCost = calculateMLModelCost(model);
    breakdown[`ML: ${model.modelType}`] = modelCost;
    details.push({
      item: `Train ${model.algorithm} model`,
      quantity: 1,
      unit_cost: modelCost,
      total: modelCost
    });
  }

  // Cost per visualization
  const vizCost = plan[0].visualizations.length * 0.50; // $0.50 per viz
  breakdown['Visualizations'] = vizCost;
  details.push({
    item: 'Visualizations',
    quantity: plan[0].visualizations.length,
    unit_cost: 0.50,
    total: vizCost
  });

  // Infrastructure costs (Spark, etc.)
  if (plan[0].dataAssessment.infrastructureNeeds.useSpark) {
    const sparkCost = 5.00; // Base Spark cost
    breakdown['Spark Processing'] = sparkCost;
    details.push({
      item: 'Distributed processing (Spark)',
      quantity: 1,
      unit_cost: sparkCost,
      total: sparkCost
    });
  }

  const total = Object.values(breakdown).reduce((sum, cost) => sum + cost, 0);

  return { total, breakdown, details };
}
```

### 6.2 Execution Integration

**File**: `server/routes/analysis-execution.ts` (additions)

```typescript
/**
 * Execute analysis based on approved plan
 */
router.post('/:projectId/execute', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Fetch approved plan
  const approvedPlan = await db.select()
    .from(analysisPlans)
    .where(and(
      eq(analysisPlans.projectId, projectId),
      eq(analysisPlans.status, 'approved')
    ))
    .orderBy(analysisPlans.approvedAt, 'desc')
    .limit(1);

  if (!approvedPlan[0]) {
    return res.status(400).json({
      success: false,
      error: 'No approved plan found. Please create and approve a plan first.'
    });
  }

  const plan = approvedPlan[0];

  // Mark plan as executing
  await db.update(analysisPlans)
    .set({
      status: 'executing',
      executedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(analysisPlans.id, plan.id));

  // Execute each analysis step from the plan
  const results = [];
  for (const step of plan.analysisSteps) {
    try {
      const stepResult = await executeAnalysisStep(projectId, step);
      results.push({
        step: step.name,
        success: true,
        result: stepResult
      });
    } catch (error: any) {
      results.push({
        step: step.name,
        success: false,
        error: error.message
      });
    }
  }

  // Mark plan as completed
  await db.update(analysisPlans)
    .set({
      status: 'completed',
      executionCompletedAt: new Date(),
      actualCost: { /* calculate actual cost */ },
      actualDuration: calculateDuration(plan.executedAt!, new Date()),
      updatedAt: new Date()
    })
    .where(eq(analysisPlans.id, plan.id));

  res.json({
    success: true,
    planId: plan.id,
    results
  });
});

/**
 * Execute a single analysis step according to plan specification
 */
async function executeAnalysisStep(
  projectId: string,
  step: AnalysisStep
): Promise<any> {
  // Route to appropriate tool based on step.tools
  for (const toolName of step.tools) {
    const tool = await MCPToolRegistry.getTool(toolName);
    if (tool) {
      return await MCPToolRegistry.executeTool(
        toolName,
        'pm_agent', // or appropriate agent
        {
          projectId,
          method: step.method,
          inputs: step.inputs,
          // ... other step parameters
        },
        { userId: 'system', projectId }
      );
    }
  }

  throw new Error(`No tool found for step: ${step.name}`);
}
```

### 6.3 WebSocket Integration

**File**: `server/realtime.ts` (additions)

```typescript
/**
 * Send plan creation progress update
 */
sendPlanProgress(projectId: string, planId: string, progress: {
  stage: string;
  complete: boolean;
  status?: string;
  data?: any;
}): void {
  this.broadcastToProject(projectId, 'plan_progress', {
    planId,
    progress,
    timestamp: new Date().toISOString()
  });
}
```

**Frontend listens**:
```tsx
// In plan-step.tsx
useEffect(() => {
  if (!projectId || !planId) return;

  const socket = getWebSocket();

  socket.on('plan_progress', (data) => {
    if (data.planId === planId) {
      setProgress(data.progress);
    }
  });

  return () => {
    socket.off('plan_progress');
  };
}, [projectId, planId]);
```

---

## 7. Answers to Open Questions

### Q1: Block plan creation until schema + validation checkpoints finish?

**Answer**: YES, enforce prerequisites in the route.

**Implementation**:
```typescript
// In POST /api/projects/:projectId/plan/create
router.post('/:projectId/plan/create', ensureAuthenticated, async (req, res) => {
  // ... existing code ...

  // Check if project is ready for plan creation
  const project = accessCheck.project;

  const validStatuses = ['ready', 'plan_review', 'plan_approved'];
  if (!validStatuses.includes(project.status)) {
    return res.status(400).json({
      success: false,
      error: 'Project not ready for plan creation',
      currentStatus: project.status,
      requiredStatus: validStatuses,
      message: 'Please complete data upload, PII review, and schema validation first.'
    });
  }

  // Check for required checkpoints
  const requiredCheckpoints = ['schema_approved', 'data_validated'];
  const checkpoints = await db.select()
    .from(agentCheckpoints)
    .where(and(
      eq(agentCheckpoints.projectId, projectId),
      eq(agentCheckpoints.status, 'approved')
    ));

  const completedCheckpointNames = checkpoints.map(c => c.checkpointName);
  const missingCheckpoints = requiredCheckpoints.filter(name => !completedCheckpointNames.includes(name));

  if (missingCheckpoints.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required checkpoints',
      missingCheckpoints,
      message: 'Please complete all preparation steps before creating an analysis plan.'
    });
  }

  // Proceed with plan creation...
});
```

### Q2: Auto-generate plan on step entry or require user click?

**Answer**: **Auto-generate on entry** for better UX, with option to regenerate.

**Rationale**:
- Users expect progress when navigating to a new step
- Loading states are standard in modern web apps
- Reduces clicks and friction
- Users can still regenerate if unhappy

**Implementation**:
```tsx
// In plan-step.tsx
const { data: response, isLoading } = useQuery({
  queryKey: ['analysis-plan', projectId],
  queryFn: async () => {
    // First, check if a plan exists
    const existing = await apiClient.get(`/api/projects/${projectId}/plan`);

    // If ready/approved plan exists, show it
    if (existing.plan && ['ready', 'approved'].includes(existing.plan.status)) {
      return existing;
    }

    // If pending plan exists, poll for completion
    if (existing.plan && existing.plan.status === 'pending') {
      return existing; // Will trigger refetchInterval
    }

    // No plan exists, auto-create one
    console.log('No plan found, auto-generating...');
    await apiClient.post(`/api/projects/${projectId}/plan/create`, {
      forceRegenerate: false
    });

    // Return loading state, will poll for completion
    return { success: true, plan: null };
  },
  enabled: !!projectId,
  refetchInterval: (data) => {
    // Poll if no plan or plan is pending
    if (!data?.plan || data.plan.status === 'pending') {
      return 2000; // Poll every 2 seconds
    }
    return false; // Stop polling
  }
});

// Show loading state
if (isLoading || !response?.plan || response.plan.status === 'pending') {
  return <PlanCreationProgress projectId={projectId} />;
}

// Show plan review UI
return <PlanReviewUI plan={response.plan} />;
```

**Allow manual regeneration**:
```tsx
<Button
  variant="outline"
  onClick={() => {
    queryClient.invalidateQueries(['analysis-plan', projectId]);
    apiClient.post(`/api/projects/${projectId}/plan/create`, {
      forceRegenerate: true
    });
  }}
>
  Regenerate Plan
</Button>
```

---

## Implementation Checklist

Use this checklist to track implementation progress:

### Phase 1: Database & Types
- [ ] Add Zod schemas to `shared/schema.ts`
- [ ] Add Drizzle table definition for `analysisPlans`
- [ ] Create migration SQL file
- [ ] Update projects status constraint
- [ ] Run migration: `npm run db:push`
- [ ] Verify table created in PostgreSQL
- [ ] Add TypeScript types export

### Phase 2: Backend Agent Coordination
- [ ] Implement `PlanCreationState` interface
- [ ] Implement `acquirePlanCreationLock()` method
- [ ] Implement `releasePlanCreationLock()` method
- [ ] Implement enhanced `createAnalysisPlan()` with timeout
- [ ] Implement `gatherDataEngineerInput()` with timeout
- [ ] Implement `gatherDataScientistInput()` with timeout
- [ ] Implement `gatherBusinessAgentInput()` with timeout
- [ ] Implement `handlePlanRejection()` method
- [ ] Add message broker event handlers
- [ ] Write unit tests for orchestration logic

### Phase 3: API Endpoints
- [ ] Create `server/types/analysis-plan-api.ts` with all schemas
- [ ] Create `server/routes/analysis-plan.ts`
- [ ] Implement POST `/create` endpoint with validation
- [ ] Implement GET `/plan` endpoint
- [ ] Implement POST `/approve` endpoint with status guards
- [ ] Implement POST `/reject` endpoint with regeneration
- [ ] Implement GET `/progress` endpoint
- [ ] Add endpoints to main router
- [ ] Write integration tests for all endpoints

### Phase 4: Frontend
- [ ] Create `client/src/types/analysis-plan.ts` with types
- [ ] Create `client/src/pages/plan-step.tsx`
- [ ] Implement auto-generation on entry
- [ ] Implement `PlanCreationProgress` component
- [ ] Implement `AnalysisStepCard` component
- [ ] Implement approval/rejection UI with modal
- [ ] Add route to `App.tsx`
- [ ] Update navigation from `prepare-step`
- [ ] Add WebSocket listener for progress
- [ ] Write frontend tests

### Phase 5: Integration
- [ ] Update `pricing.ts` with `estimateCostFromPlan()`
- [ ] Update `analysis-execution.ts` to use approved plan
- [ ] Add WebSocket events to `realtime.ts`
- [ ] Test complete flow end-to-end
- [ ] Performance testing
- [ ] Fix any bugs

### Phase 6: Documentation & Deployment
- [ ] Update `CLAUDE.md` with plan step documentation
- [ ] Create user guide
- [ ] Create developer guide
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

---

**Document Version**: 1.0
**Created**: November 3, 2025
**Purpose**: Address technical gaps in Plan Step implementation
**Status**: Ready for Development
