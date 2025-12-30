# Analysis Plan Step - Detailed Implementation Plan

**Feature**: Add a dedicated "Plan Step" where the PM agent coordinates with all specialist agents to create and present a comprehensive analysis plan for user approval.

**Last Updated**: November 3, 2025
**Status**: Design Phase - Ready for Implementation

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Proposed Architecture](#proposed-architecture)
4. [Database Schema Changes](#database-schema-changes)
5. [Agent Coordination Workflow](#agent-coordination-workflow)
6. [API Endpoints](#api-endpoints)
7. [Frontend Components](#frontend-components)
8. [Integration Points](#integration-points)
9. [Implementation Phases](#implementation-phases)
10. [Testing Strategy](#testing-strategy)
11. [Rollout Plan](#rollout-plan)

---

## Executive Summary

### Problem Statement
Currently, users go directly from data preparation (schema definition) to execution without seeing a comprehensive analysis plan. This can lead to:
- Uncertainty about what analyses will be performed
- Lack of transparency in AI decision-making
- Missed opportunities for user input on analysis approach
- Surprise cost overruns

### Proposed Solution
Introduce a new **"Plan Step"** between `prepare-step` and `execute-step` where:
1. PM agent coordinates with Data Engineer, Data Scientist, and Business agents
2. Agents collaboratively create a detailed analysis plan
3. Plan includes: analysis methods, expected outputs, estimated costs, timeline
4. User reviews and approves/modifies the plan before execution begins
5. Approved plan stored as a checkpoint for auditing

### Key Benefits
- ✅ Increased transparency and user confidence
- ✅ Better cost estimation before execution
- ✅ Opportunity for user feedback on approach
- ✅ Clearer expectations for results
- ✅ Auditable decision trail
- ✅ Aligns with existing checkpoint architecture

---

## Current Architecture Analysis

### Existing Journey Steps

**Current Flow**:
```
1. project-setup-step     → Define goals, questions, context
2. data-step              → Upload data
3. data-verification-step → Validate data quality
4. prepare-step           → Define schema, data transformations
5. pricing-step           → Get cost estimate
6. execute-step           → Run analysis
7. results-preview-step   → Preview results
8. results-step           → View final results
```

**Proposed Flow** (Plan Step inserted):
```
1. project-setup-step     → Define goals, questions, context
2. data-step              → Upload data
3. data-verification-step → Validate data quality
4. prepare-step           → Define schema, data transformations
5. 🆕 plan-step           → Review and approve analysis plan
6. pricing-step           → Confirm costs based on approved plan
7. execute-step           → Run approved analysis
8. results-preview-step   → Preview results
9. results-step           → View final results
```

### Existing Infrastructure to Leverage

#### 1. Agent Checkpoint System (`shared/schema.ts:814-829`)
```typescript
export const agentCheckpoints = pgTable("agent_checkpoints", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  agentType: varchar("agent_type").notNull(), // pm, data_engineer, data_scientist, business
  checkpointName: varchar("checkpoint_name").notNull(),
  status: varchar("status").notNull().default("pending"),
  // Status: pending, in_progress, waiting_approval, approved, completed, rejected
  data: jsonb("data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

✅ **Already supports approval workflow!**

#### 2. Agent Message Broker (`server/services/agents/message-broker.ts`)
- Handles agent-to-agent communication
- Event-based coordination
- Already used in routes for coordination

✅ **Can orchestrate multi-agent plan creation!**

#### 3. Existing Agent Methods

**Data Engineer Agent** (`server/services/data-engineer-agent.ts:1299`):
```typescript
async estimateDataRequirements(params: {
  goals: string;
  questions: string[];
  dataSource: string;
  journeyType: string;
}): Promise<{
  estimatedRows: number;
  estimatedColumns: number;
  dataCharacteristics: string[];
}>
```

**Data Scientist Agent** (`server/services/data-scientist-agent.ts:1242`):
```typescript
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
}>
```

✅ **Agents already have estimation capabilities!**

#### 4. Project Status Flow (`shared/schema.ts:509-519`)
```typescript
status: varchar("status")
  .notNull()
  .default("draft")
  // States: "draft", "uploading", "processing", "pii_review",
  //         "ready", "analyzing", "checkpoint", "generating",
  //         "completed", "error", "cancelled"
```

✅ **"checkpoint" status already exists!**

---

## Proposed Architecture

### Multi-Agent Coordination Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      PLAN STEP WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

User completes prepare-step → Navigates to plan-step
                                      ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 1: PM Agent Initiates Plan Creation                     │
│  --------------------------------------------------------       │
│  1. PM agent fetches project context:                          │
│     - Goals, questions, schema                                 │
│     - Data characteristics, record count                       │
│     - User role, journey type                                  │
│  2. PM creates coordination checkpoint                         │
│  3. PM broadcasts plan_creation_started event                  │
└────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 2: Data Engineer Agent - Data Assessment                │
│  --------------------------------------------------------       │
│  1. Receives plan_creation_started event                       │
│  2. Calls estimateDataRequirements()                           │
│  3. Analyzes data quality and completeness                     │
│  4. Recommends data transformations if needed                  │
│  5. Publishes data_assessment_completed event                  │
│     Output:                                                     │
│     - Estimated processing time                                │
│     - Data quality score                                       │
│     - Required transformations                                 │
│     - Infrastructure needs (Spark, memory)                     │
└────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 3: Data Scientist Agent - Analysis Recommendation       │
│  --------------------------------------------------------       │
│  1. Receives data_assessment_completed event                   │
│  2. Calls recommendAnalysisConfig()                            │
│  3. Maps goals/questions to analysis types                     │
│  4. Selects appropriate ML algorithms if needed                │
│  5. Suggests visualizations                                    │
│  6. Publishes analysis_recommended event                       │
│     Output:                                                     │
│     - Recommended analyses (ANOVA, regression, etc.)           │
│     - ML models to train (if applicable)                       │
│     - Visualization types                                      │
│     - Statistical tests to perform                             │
│     - Complexity estimate                                      │
└────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 4: Business Agent - Domain Context                      │
│  --------------------------------------------------------       │
│  1. Receives analysis_recommended event                        │
│  2. Provides industry-specific insights                        │
│  3. Suggests business KPIs to track                            │
│  4. Recommends benchmarks/comparisons                          │
│  5. Adds regulatory compliance considerations                  │
│  6. Publishes business_context_added event                     │
│     Output:                                                     │
│     - Industry benchmarks                                      │
│     - Relevant KPIs                                            │
│     - Compliance requirements                                  │
│     - Report formatting preferences                            │
└────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 5: PM Agent - Synthesize Comprehensive Plan             │
│  --------------------------------------------------------       │
│  1. Receives all agent outputs                                 │
│  2. Synthesizes unified analysis plan                          │
│  3. Estimates total cost and timeline                          │
│  4. Identifies potential risks/challenges                      │
│  5. Creates approval checkpoint                                │
│  6. Saves plan to database                                     │
│  7. Returns plan to frontend                                   │
│     Plan Structure:                                             │
│     {                                                           │
│       executiveSummary: string                                 │
│       dataAssessment: { ... }                                  │
│       analysisSteps: [                                         │
│         {                                                       │
│           stepNumber: 1,                                       │
│           name: "Descriptive Statistics",                      │
│           description: "...",                                  │
│           expectedOutputs: [...],                              │
│           estimatedDuration: "5 minutes",                      │
│           tools: ["statistical_analyzer"]                      │
│         },                                                      │
│         ...                                                     │
│       ],                                                        │
│       visualizations: [...],                                   │
│       businessContext: { ... },                                │
│       estimatedCost: { total, breakdown },                     │
│       estimatedTotalTime: "15-20 minutes",                     │
│       risks: [...],                                            │
│       recommendations: [...]                                   │
│     }                                                           │
└────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────┐
│  PHASE 6: User Review and Approval                             │
│  --------------------------------------------------------       │
│  Frontend displays plan with:                                  │
│  - Executive summary                                           │
│  - Step-by-step analysis breakdown                            │
│  - Expected outputs and visualizations                         │
│  - Cost and time estimates                                     │
│  - Risk assessment                                             │
│                                                                 │
│  User Actions:                                                  │
│  ✅ Approve → Update checkpoint status to "approved"           │
│  ❌ Reject → Request modifications                             │
│  ✏️  Modify → Adjust plan parameters                           │
│                                                                 │
│  On Approval:                                                   │
│  - Save approved plan                                          │
│  - Update project status                                       │
│  - Navigate to pricing-step (if needed)                        │
│  - Then to execute-step                                        │
└────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### 1. New Table: `analysis_plans`

```sql
CREATE TABLE analysis_plans (
  id TEXT PRIMARY KEY DEFAULT nanoid(),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by VARCHAR(50) NOT NULL DEFAULT 'pm_agent', -- Agent that created the plan

  -- Plan Content
  executive_summary TEXT,
  data_assessment JSONB NOT NULL,      -- Data Engineer's assessment
  analysis_steps JSONB NOT NULL,       -- Array of analysis steps
  visualizations JSONB,                -- Planned visualizations
  business_context JSONB,              -- Business Agent's input
  ml_models JSONB,                     -- ML models to train (if any)

  -- Estimates
  estimated_cost JSONB NOT NULL,       -- {total, breakdown}
  estimated_duration VARCHAR(50),      -- "15-20 minutes"
  complexity VARCHAR(20),               -- low, medium, high, very_high

  -- Metadata
  risks JSONB,                          -- Identified risks
  recommendations JSONB,                -- Agent recommendations
  agent_contributions JSONB NOT NULL,  -- Track which agents contributed

  -- Approval Workflow
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  -- Status: pending, approved, rejected, modified, executed
  approved_at TIMESTAMP,
  approved_by TEXT,                    -- User ID who approved
  rejection_reason TEXT,
  modifications_requested TEXT,

  -- Execution Tracking
  executed_at TIMESTAMP,
  execution_completed_at TIMESTAMP,
  actual_cost JSONB,                   -- Actual cost after execution
  actual_duration VARCHAR(50),         -- Actual time taken

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Indexes
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected', 'modified', 'executed', 'completed'))
);

CREATE INDEX idx_analysis_plans_project ON analysis_plans(project_id);
CREATE INDEX idx_analysis_plans_status ON analysis_plans(status);
CREATE INDEX idx_analysis_plans_created ON analysis_plans(created_at DESC);
```

### 2. Update Existing `agentCheckpoints` Table

Add new checkpoint types for plan step:
```typescript
// New checkpoint types:
// - "plan_creation_started"
// - "data_assessment_completed"
// - "analysis_recommended"
// - "business_context_added"
// - "plan_synthesized"
// - "plan_awaiting_approval"
// - "plan_approved"
// - "plan_rejected"
```

### 3. Update `projects` Table

Add new status values:
```typescript
// Add to status enum:
// - "plan_creation"      (Plan Step - agents creating plan)
// - "plan_review"        (Plan Step - awaiting user approval)
// - "plan_approved"      (Plan approved, ready for execution)
```

---

## Agent Coordination Workflow

### PM Agent New Method: `createAnalysisPlan()`

**Location**: `server/services/project-manager-agent.ts`

```typescript
async createAnalysisPlan(params: {
  projectId: string;
  userId: string;
  journeyType: string;
}): Promise<{
  planId: string;
  plan: AnalysisPlan;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}> {
  // 1. Update project status to "plan_creation"
  // 2. Create plan_creation_started checkpoint
  // 3. Broadcast event to message broker
  // 4. Coordinate with all agents (in parallel):
  //    - Data Engineer: estimateDataRequirements()
  //    - Data Scientist: recommendAnalysisConfig()
  //    - Business Agent: getBusinessContext()
  // 5. Wait for all agents to respond (with timeout)
  // 6. Synthesize unified plan
  // 7. Estimate total cost using PricingService
  // 8. Save plan to database
  // 9. Create plan_awaiting_approval checkpoint
  // 10. Update project status to "plan_review"
  // 11. Return plan
}
```

### Data Engineer Agent New Method: `assessDataForPlan()`

**Location**: `server/services/data-engineer-agent.ts`

```typescript
async assessDataForPlan(params: {
  projectId: string;
  schema: Record<string, any>;
  data: any[];
  goals: string;
  questions: string[];
}): Promise<{
  dataQualityScore: number;
  completenessScore: number;
  recommendedTransformations: string[];
  infrastructureNeeds: {
    useSpark: boolean;
    estimatedMemoryGB: number;
    parallelizable: boolean;
  };
  estimatedProcessingTime: string;
  risks: string[];
}> {
  // Use existing estimateDataRequirements() plus additional analysis
}
```

### Data Scientist Agent Enhancement

**Location**: `server/services/data-scientist-agent.ts`

Enhance existing `recommendAnalysisConfig()` to return more detailed plan structure:
```typescript
// Add to return type:
{
  ...existing fields,
  analysisSteps: [
    {
      stepNumber: number;
      name: string;
      description: string;
      method: string; // "ANOVA", "Linear Regression", etc.
      inputs: string[];
      expectedOutputs: string[];
      tools: string[];
      estimatedDuration: string;
      confidence: number;
    }
  ],
  mlModels: [
    {
      modelType: string;
      algorithm: string;
      targetVariable: string;
      features: string[];
      expectedAccuracy: string;
      trainingTime: string;
    }
  ]
}
```

### Business Agent New Method: `provideBusinessContext()`

**Location**: `server/services/business-agent.ts`

```typescript
async provideBusinessContext(params: {
  industry: string;
  goals: string;
  analysisTypes: string[];
}): Promise<{
  industryBenchmarks: any[];
  relevantKPIs: string[];
  complianceRequirements: string[];
  reportingStandards: string[];
  recommendations: string[];
}> {
  // Leverage existing business templates knowledge base
}
```

---

## API Endpoints

### New Routes: `/api/projects/:projectId/plan`

**File**: `server/routes/analysis-plan.ts` (new file)

```typescript
import express from 'express';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { projectManagerAgent } from '../services/project-agent-orchestrator';
import { db } from '../db';
import { analysisPlans, agentCheckpoints } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

// 1. POST /api/projects/:projectId/plan/create
//    Create new analysis plan (triggers PM agent coordination)
router.post('/:projectId/plan/create', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  // Check project access
  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Trigger plan creation
  const result = await projectManagerAgent.createAnalysisPlan({
    projectId,
    userId,
    journeyType: accessCheck.project.journeyType
  });

  res.json(result);
});

// 2. GET /api/projects/:projectId/plan
//    Get current analysis plan
router.get('/:projectId/plan', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  const plan = await db.select()
    .from(analysisPlans)
    .where(eq(analysisPlans.projectId, projectId))
    .orderBy(analysisPlans.createdAt, 'desc')
    .limit(1);

  res.json({ success: true, plan: plan[0] || null });
});

// 3. POST /api/projects/:projectId/plan/:planId/approve
//    User approves the plan
router.post('/:projectId/plan/:planId/approve', ensureAuthenticated, async (req, res) => {
  const { projectId, planId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Update plan status
  await db.update(analysisPlans)
    .set({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy: userId,
      updatedAt: new Date()
    })
    .where(and(
      eq(analysisPlans.id, planId),
      eq(analysisPlans.projectId, projectId)
    ));

  // Create approval checkpoint
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
    .set({ status: 'plan_approved' })
    .where(eq(projects.id, projectId));

  res.json({ success: true });
});

// 4. POST /api/projects/:projectId/plan/:planId/reject
//    User rejects the plan and requests modifications
router.post('/:projectId/plan/:planId/reject', ensureAuthenticated, async (req, res) => {
  const { projectId, planId } = req.params;
  const { reason, modifications } = req.body;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Update plan status
  await db.update(analysisPlans)
    .set({
      status: 'rejected',
      rejectionReason: reason,
      modificationsRequested: modifications,
      updatedAt: new Date()
    })
    .where(and(
      eq(analysisPlans.id, planId),
      eq(analysisPlans.projectId, projectId)
    ));

  // Create rejection checkpoint
  await db.insert(agentCheckpoints).values({
    id: nanoid(),
    projectId,
    agentType: 'user',
    checkpointName: 'plan_rejected',
    status: 'rejected',
    data: { planId, reason, modifications },
  });

  res.json({ success: true });
});

// 5. GET /api/projects/:projectId/plan/:planId/progress
//    Get real-time plan creation progress (for loading state)
router.get('/:projectId/plan/:planId/progress', ensureAuthenticated, async (req, res) => {
  const { projectId, planId } = req.params;
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const accessCheck = await canAccessProject(userId, projectId, isAdmin);
  if (!accessCheck.allowed) {
    return res.status(403).json({ success: false, error: accessCheck.reason });
  }

  // Get checkpoints for this plan creation
  const checkpoints = await db.select()
    .from(agentCheckpoints)
    .where(and(
      eq(agentCheckpoints.projectId, projectId),
      // Filter for plan-related checkpoints
    ))
    .orderBy(agentCheckpoints.createdAt, 'asc');

  const progress = {
    dataEngineerComplete: checkpoints.some(c => c.checkpointName === 'data_assessment_completed'),
    dataScientistComplete: checkpoints.some(c => c.checkpointName === 'analysis_recommended'),
    businessAgentComplete: checkpoints.some(c => c.checkpointName === 'business_context_added'),
    synthesisComplete: checkpoints.some(c => c.checkpointName === 'plan_synthesized'),
  };

  res.json({ success: true, progress });
});

export default router;
```

### Integration with Main Router

**File**: `server/routes/index.ts`

```typescript
import analysisPlanRouter from './analysis-plan';

// Add to existing routes:
app.use('/api/projects', analysisPlanRouter);
```

---

## Frontend Components

### 1. New Page: `plan-step.tsx`

**Location**: `client/src/pages/plan-step.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, AlertTriangle, Clock, DollarSign } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function PlanStep() {
  const [, params] = useRoute('/projects/:projectId/plan');
  const [, navigate] = useLocation();
  const projectId = params?.projectId;

  // Fetch or create plan
  const { data: planData, isLoading, error } = useQuery({
    queryKey: ['analysis-plan', projectId],
    queryFn: async () => {
      const existing = await apiClient.get(`/api/projects/${projectId}/plan`);
      if (existing.plan) return existing.plan;

      // No plan exists, create one
      const result = await apiClient.post(`/api/projects/${projectId}/plan/create`);
      return result.plan;
    },
    enabled: !!projectId,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/api/projects/${projectId}/plan/${planData.id}/approve`);
    },
    onSuccess: () => {
      navigate(`/projects/${projectId}/pricing`);
    }
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ reason, modifications }: { reason: string; modifications: string }) => {
      return apiClient.post(`/api/projects/${projectId}/plan/${planData.id}/reject`, {
        reason,
        modifications
      });
    }
  });

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <h1 className="text-3xl font-bold mb-6">Creating Your Analysis Plan...</h1>
        <PlanCreationProgress projectId={projectId} />
      </div>
    );
  }

  if (error || !planData) {
    return <div>Error loading plan</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-2">Analysis Plan Review</h1>
      <p className="text-gray-600 mb-8">
        Our AI agents have created a comprehensive analysis plan. Review and approve to proceed.
      </p>

      {/* Executive Summary */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Executive Summary</h2>
        <p className="text-gray-700">{planData.executive_summary}</p>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold">Estimated Time</h3>
          </div>
          <p className="text-2xl font-bold">{planData.estimated_duration}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            <h3 className="font-semibold">Estimated Cost</h3>
          </div>
          <p className="text-2xl font-bold">${planData.estimated_cost.total}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="font-semibold">Complexity</h3>
          </div>
          <p className="text-2xl font-bold capitalize">{planData.complexity}</p>
        </Card>
      </div>

      {/* Analysis Steps */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Analysis Steps</h2>
        <div className="space-y-4">
          {planData.analysis_steps.map((step: any, index: number) => (
            <AnalysisStepCard key={index} step={step} />
          ))}
        </div>
      </Card>

      {/* Data Assessment */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Data Assessment</h2>
        <DataAssessmentView assessment={planData.data_assessment} />
      </Card>

      {/* Visualizations */}
      {planData.visualizations && planData.visualizations.length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Planned Visualizations</h2>
          <VisualizationsList visualizations={planData.visualizations} />
        </Card>
      )}

      {/* Business Context */}
      {planData.business_context && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Business Context</h2>
          <BusinessContextView context={planData.business_context} />
        </Card>
      )}

      {/* Risks */}
      {planData.risks && planData.risks.length > 0 && (
        <Card className="p-6 mb-6 border-yellow-200 bg-yellow-50">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Identified Risks
          </h2>
          <ul className="list-disc list-inside space-y-2">
            {planData.risks.map((risk: string, index: number) => (
              <li key={index} className="text-gray-700">{risk}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recommendations */}
      {planData.recommendations && planData.recommendations.length > 0 && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Agent Recommendations</h2>
          <ul className="list-disc list-inside space-y-2">
            {planData.recommendations.map((rec: string, index: number) => (
              <li key={index} className="text-gray-700">{rec}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Approval Actions */}
      <div className="flex gap-4 justify-end">
        <Button
          variant="outline"
          size="lg"
          onClick={() => {
            const reason = prompt('Why are you rejecting this plan?');
            const modifications = prompt('What modifications would you like?');
            if (reason) {
              rejectMutation.mutate({ reason, modifications: modifications || '' });
            }
          }}
        >
          Request Changes
        </Button>

        <Button
          size="lg"
          onClick={() => approveMutation.mutate()}
          disabled={approveMutation.isPending}
        >
          <Check className="w-5 h-5 mr-2" />
          Approve & Continue
        </Button>
      </div>
    </div>
  );
}

// Supporting Components (implementations would be detailed separately)
function PlanCreationProgress({ projectId }: { projectId: string }) { /* ... */ }
function AnalysisStepCard({ step }: { step: any }) { /* ... */ }
function DataAssessmentView({ assessment }: { assessment: any }) { /* ... */ }
function VisualizationsList({ visualizations }: { visualizations: any[] }) { /* ... */ }
function BusinessContextView({ context }: { context: any }) { /* ... */ }
```

### 2. Update Routing

**File**: `client/src/App.tsx`

```tsx
// Add new route for plan step
<Route path="/projects/:projectId/plan" component={lazy(() => import('./pages/plan-step'))} />
```

### 3. Update Navigation Flow

**File**: `client/src/pages/prepare-step.tsx`

After schema is approved and preparation is complete, navigate to:
```tsx
navigate(`/projects/${projectId}/plan`);
// Instead of directly to pricing or execute
```

---

## Integration Points

### 1. Message Broker Events

**File**: `server/routes/project.ts`

Add new event subscriptions:
```typescript
messageBroker.subscribe('plan_creation_started', async (message) => {
  console.log('📋 Plan creation initiated for project', message.data?.projectId);
});

messageBroker.subscribe('data_assessment_completed', async (message) => {
  console.log('📊 Data Engineer completed assessment', message.data?.projectId);
});

messageBroker.subscribe('analysis_recommended', async (message) => {
  console.log('🔬 Data Scientist recommended analysis', message.data?.projectId);
});

messageBroker.subscribe('business_context_added', async (message) => {
  console.log('💼 Business Agent added context', message.data?.projectId);
});

messageBroker.subscribe('plan_synthesized', async (message) => {
  console.log('✅ PM synthesized final plan', message.data?.projectId);
});

messageBroker.subscribe('plan_approved', async (message) => {
  console.log('👍 User approved plan', message.data?.projectId);
});
```

### 2. Real-Time Updates via WebSocket

**File**: `server/realtime.ts`

Send progress updates as agents complete their work:
```typescript
// In PM agent createAnalysisPlan():
realtimeServer.sendProjectUpdate(projectId, {
  type: 'plan_progress',
  stage: 'data_assessment',
  completed: false
});

// When Data Engineer completes:
realtimeServer.sendProjectUpdate(projectId, {
  type: 'plan_progress',
  stage: 'data_assessment',
  completed: true,
  data: dataAssessment
});
```

Frontend listens for these updates to show real-time progress.

### 3. Cost Estimation Integration

**File**: `server/services/pricing.ts`

Use approved plan to refine cost estimates:
```typescript
async estimateCostFromPlan(plan: AnalysisPlan): Promise<CostEstimate> {
  // More accurate estimation based on specific analysis steps
  // vs. generic estimation
}
```

### 4. Execution Step Integration

**File**: `client/src/pages/execute-step.tsx` & `server/routes/analysis-execution.ts`

When executing analysis, reference the approved plan:
```typescript
// Fetch approved plan
const approvedPlan = await db.select()
  .from(analysisPlans)
  .where(and(
    eq(analysisPlans.projectId, projectId),
    eq(analysisPlans.status, 'approved')
  ))
  .limit(1);

// Execute each step from the plan
for (const step of approvedPlan.analysis_steps) {
  await executeAnalysisStep(step);
}
```

---

## Implementation Phases

### Phase 1: Database & Backend Core (Week 1)

**Tasks**:
1. ✅ Create `analysis_plans` table migration
2. ✅ Add new checkpoint types to `agentCheckpoints`
3. ✅ Update `projects` status enum
4. ✅ Implement PM Agent `createAnalysisPlan()` method
5. ✅ Enhance Data Engineer `assessDataForPlan()` method
6. ✅ Enhance Data Scientist `recommendAnalysisConfig()` method
7. ✅ Implement Business Agent `provideBusinessContext()` method
8. ✅ Write unit tests for agent methods

**Deliverables**:
- Database migrations
- Agent coordination logic
- Unit tests passing

### Phase 2: API Endpoints (Week 1-2)

**Tasks**:
1. ✅ Create `server/routes/analysis-plan.ts`
2. ✅ Implement all 5 endpoints
3. ✅ Add message broker event handlers
4. ✅ Integrate with existing authentication & ownership middleware
5. ✅ Add API endpoint tests

**Deliverables**:
- Functional API endpoints
- Integration with existing auth system
- API tests passing

### Phase 3: Frontend Components (Week 2-3)

**Tasks**:
1. ✅ Create `plan-step.tsx` page component
2. ✅ Build sub-components:
   - PlanCreationProgress (loading state)
   - AnalysisStepCard
   - DataAssessmentView
   - VisualizationsList
   - BusinessContextView
3. ✅ Add routing for plan step
4. ✅ Update navigation flow from prepare-step
5. ✅ Implement real-time progress updates via WebSocket
6. ✅ Add frontend tests

**Deliverables**:
- Complete plan step UI
- Real-time progress indicators
- Frontend tests passing

### Phase 4: Integration & Testing (Week 3-4)

**Tasks**:
1. ✅ End-to-end testing of complete flow
2. ✅ Test multi-agent coordination timing
3. ✅ Test approval/rejection workflows
4. ✅ Performance testing (plan creation time)
5. ✅ User acceptance testing
6. ✅ Fix bugs and refine UX

**Deliverables**:
- All E2E tests passing
- Performance benchmarks met
- User feedback incorporated

### Phase 5: Documentation & Deployment (Week 4)

**Tasks**:
1. ✅ Update CLAUDE.md with plan step documentation
2. ✅ Add user guide for plan review
3. ✅ Create developer guide for extending plan creation
4. ✅ Deploy to staging environment
5. ✅ Monitor and fix any issues
6. ✅ Deploy to production

**Deliverables**:
- Complete documentation
- Production deployment
- Monitoring dashboards

---

## Testing Strategy

### Unit Tests

**Agent Methods**:
```typescript
// test/unit/services/project-manager-agent.test.ts
describe('ProjectManagerAgent.createAnalysisPlan', () => {
  it('should coordinate with all agents successfully', async () => { });
  it('should handle Data Engineer timeout gracefully', async () => { });
  it('should synthesize plan from partial agent responses', async () => { });
  it('should estimate cost accurately', async () => { });
});

// test/unit/services/data-engineer-agent.test.ts
describe('DataEngineerAgent.assessDataForPlan', () => {
  it('should assess data quality correctly', async () => { });
  it('should recommend Spark for large datasets', async () => { });
  it('should identify missing data', async () => { });
});
```

### Integration Tests

**API Endpoints**:
```typescript
// test/integration/routes/analysis-plan.test.ts
describe('POST /api/projects/:id/plan/create', () => {
  it('should create plan with valid project', async () => { });
  it('should return 403 for unauthorized access', async () => { });
  it('should handle concurrent plan creation requests', async () => { });
});
```

### E2E Tests

**Complete User Flow**:
```typescript
// test/e2e/plan-step-flow.spec.ts
test('Complete HR analysis flow with plan approval', async ({ page }) => {
  // 1. Create project
  // 2. Upload HR data
  // 3. Define schema
  // 4. Navigate to plan step
  // 5. Wait for plan creation
  // 6. Verify plan content
  // 7. Approve plan
  // 8. Verify navigation to pricing
  // 9. Execute analysis
  // 10. Verify results
});
```

### Performance Tests

**Benchmarks**:
- Plan creation should complete in < 30 seconds
- Agent coordination should handle up to 10 concurrent requests
- Database writes should be transactional and fast

---

## Rollout Plan

### Phase 1: Alpha Testing (Internal)
- Deploy to development environment
- Test with 5 internal projects
- Gather feedback from team
- Fix critical bugs

### Phase 2: Beta Testing (Select Users)
- Deploy to staging environment
- Invite 20 beta users
- Monitor plan creation success rate
- Iterate based on feedback

### Phase 3: Gradual Rollout (Production)
- Week 1: 10% of new projects get plan step
- Week 2: 25% of new projects
- Week 3: 50% of new projects
- Week 4: 100% rollout

### Phase 4: Migration (Existing Projects)
- Offer plan creation for existing projects in "ready" or "analyzing" status
- Optional feature - users can skip if desired

---

## Success Metrics

### Quantitative
- **Adoption Rate**: % of users who review plan vs. skip
- **Approval Rate**: % of plans approved on first review
- **Time to Approval**: Median time from plan creation to approval
- **Cost Accuracy**: Difference between estimated and actual cost
- **User Satisfaction**: Survey score for plan clarity

### Qualitative
- User feedback on plan comprehensiveness
- Reduction in support tickets about "what will happen?"
- Increased confidence in AI-generated analysis approach

---

## Future Enhancements

### V1.1: Interactive Plan Modification
- Allow users to adjust analysis parameters inline
- Drag-and-drop to reorder analysis steps
- Add/remove specific analyses

### V1.2: Plan Templates
- Save approved plans as templates
- Reuse plans for similar projects
- Share templates across organization

### V1.3: Advanced Risk Analysis
- ML-based risk prediction
- Historical project data for accuracy estimation
- Automated mitigation suggestions

### V1.4: Collaborative Review
- Multi-stakeholder approval workflow
- Comments and discussions on plan sections
- Version control for plan iterations

---

## Appendix

### A. Example Plan JSON Structure

```json
{
  "id": "plan_abc123",
  "project_id": "proj_xyz789",
  "created_by": "pm_agent",
  "executive_summary": "This analysis will examine employee engagement trends across departments, identify key drivers of satisfaction, and predict turnover risk. We'll perform statistical analysis including ANOVA and regression, train a turnover prediction model, and generate executive dashboards.",
  "data_assessment": {
    "quality_score": 92,
    "completeness_score": 88,
    "record_count": 500,
    "column_count": 15,
    "missing_data": ["optional_field_1", "optional_field_2"],
    "recommended_transformations": [
      "Convert hire_date to tenure_months",
      "Normalize salary across departments",
      "Create engagement_score composite"
    ],
    "infrastructure_needs": {
      "use_spark": false,
      "estimated_memory_gb": 0.5,
      "parallelizable": true
    },
    "estimated_processing_time": "5-8 minutes"
  },
  "analysis_steps": [
    {
      "step_number": 1,
      "name": "Descriptive Statistics",
      "description": "Calculate summary statistics for all numeric fields including mean, median, standard deviation, and distributions.",
      "method": "Descriptive Analysis",
      "inputs": ["engagement_score", "tenure_months", "salary"],
      "expected_outputs": [
        "Summary statistics table",
        "Distribution histograms"
      ],
      "tools": ["statistical_analyzer"],
      "estimated_duration": "2 minutes",
      "confidence": 95
    },
    {
      "step_number": 2,
      "name": "Department Comparison",
      "description": "Compare engagement scores across departments using ANOVA to identify significant differences.",
      "method": "One-Way ANOVA",
      "inputs": ["department", "engagement_score"],
      "expected_outputs": [
        "ANOVA results table",
        "Post-hoc Tukey HSD comparisons",
        "Box plots by department"
      ],
      "tools": ["statistical_analyzer"],
      "estimated_duration": "3 minutes",
      "confidence": 90
    },
    {
      "step_number": 3,
      "name": "Engagement Drivers",
      "description": "Identify factors influencing engagement using multiple linear regression.",
      "method": "Multiple Linear Regression",
      "inputs": ["tenure_months", "salary", "manager_rating", "training_hours"],
      "expected_outputs": [
        "Regression coefficients",
        "R-squared value",
        "Feature importance chart"
      ],
      "tools": ["statistical_analyzer", "ml_pipeline"],
      "estimated_duration": "4 minutes",
      "confidence": 85
    },
    {
      "step_number": 4,
      "name": "Turnover Prediction",
      "description": "Train a Random Forest classifier to predict turnover risk based on engagement and other factors.",
      "method": "Random Forest Classification",
      "inputs": ["engagement_score", "tenure_months", "salary", "performance_rating"],
      "expected_outputs": [
        "Trained model with 82% accuracy",
        "Feature importance rankings",
        "Confusion matrix",
        "High-risk employee list"
      ],
      "tools": ["ml_pipeline"],
      "estimated_duration": "6 minutes",
      "confidence": 80
    },
    {
      "step_number": 5,
      "name": "Executive Dashboard",
      "description": "Generate interactive visualizations and executive summary.",
      "method": "Visualization Generation",
      "inputs": ["All analysis results"],
      "expected_outputs": [
        "Executive summary report",
        "Interactive dashboard",
        "Recommendation list"
      ],
      "tools": ["visualization_engine", "business_templates"],
      "estimated_duration": "3 minutes",
      "confidence": 95
    }
  ],
  "visualizations": [
    {
      "type": "histogram",
      "title": "Engagement Score Distribution",
      "description": "Shows the distribution of engagement scores across all employees"
    },
    {
      "type": "box_plot",
      "title": "Engagement by Department",
      "description": "Compares engagement scores across different departments"
    },
    {
      "type": "bar_chart",
      "title": "Feature Importance",
      "description": "Shows which factors most influence engagement"
    },
    {
      "type": "scatter_plot",
      "title": "Tenure vs Engagement",
      "description": "Explores relationship between employee tenure and engagement"
    },
    {
      "type": "dashboard",
      "title": "Executive HR Dashboard",
      "description": "Interactive dashboard with key metrics and trends"
    }
  ],
  "business_context": {
    "industry_benchmarks": [
      "Average engagement score: 7.2/10 (Industry: 6.8/10)",
      "Turnover rate: 12% (Industry: 15%)"
    ],
    "relevant_kpis": [
      "Employee Net Promoter Score (eNPS)",
      "Retention Rate",
      "Time to Productivity",
      "Training ROI"
    ],
    "compliance_requirements": [
      "GDPR compliance for employee data",
      "Equal opportunity analysis required"
    ],
    "reporting_standards": [
      "Use SHRM (Society for Human Resource Management) metrics",
      "Follow ISO 30414 guidelines for HR reporting"
    ],
    "recommendations": [
      "Focus on departments with scores below 6.5",
      "Implement quarterly pulse surveys",
      "Develop retention strategy for high-risk employees"
    ]
  },
  "ml_models": [
    {
      "model_type": "Classification",
      "algorithm": "Random Forest",
      "target_variable": "turnover_risk",
      "features": ["engagement_score", "tenure_months", "salary", "performance_rating", "training_hours"],
      "expected_accuracy": "80-85%",
      "training_time": "4-6 minutes",
      "interpretability": "High (feature importance available)"
    }
  ],
  "estimated_cost": {
    "total": 12.50,
    "breakdown": {
      "data_processing": 2.00,
      "statistical_analysis": 3.00,
      "ml_training": 4.50,
      "visualization": 2.00,
      "ai_queries": 1.00
    }
  },
  "estimated_duration": "18-25 minutes",
  "complexity": "medium",
  "risks": [
    "Small sample size (n=500) may limit ML model generalizability",
    "Missing data in optional fields may affect some analyses",
    "Cross-department comparisons may be affected by different team sizes"
  ],
  "recommendations": [
    "Consider collecting more training-related data for future analyses",
    "Set up regular (quarterly) data collection for trend analysis",
    "Implement early warning system based on turnover prediction model"
  ],
  "agent_contributions": {
    "data_engineer": {
      "completed_at": "2025-11-03T10:30:15Z",
      "contribution": "Data assessment and infrastructure recommendations"
    },
    "data_scientist": {
      "completed_at": "2025-11-03T10:30:42Z",
      "contribution": "Analysis methods and ML model specifications"
    },
    "business_agent": {
      "completed_at": "2025-11-03T10:30:58Z",
      "contribution": "Industry context and KPI recommendations"
    },
    "pm_agent": {
      "completed_at": "2025-11-03T10:31:15Z",
      "contribution": "Plan synthesis and coordination"
    }
  },
  "status": "pending",
  "created_at": "2025-11-03T10:29:45Z",
  "updated_at": "2025-11-03T10:31:15Z"
}
```

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding an **Analysis Plan Step** to the ChimariData platform. The plan leverages existing infrastructure (checkpoint system, message broker, agent coordination) while adding new capabilities for multi-agent collaboration and user transparency.

**Key Advantages**:
1. ✅ Builds on existing checkpoint architecture
2. ✅ Leverages agent methods already implemented
3. ✅ Provides clear user value (transparency, confidence)
4. ✅ Improves cost accuracy before execution
5. ✅ Creates audit trail for regulatory compliance
6. ✅ Extensible for future enhancements

**Next Steps**:
1. Review and approve this implementation plan
2. Create detailed technical specifications for each phase
3. Set up project tracking and milestones
4. Begin Phase 1 implementation
5. Conduct regular design reviews and adjust as needed

**Timeline**: 4 weeks from start to production deployment

**Resources Needed**:
- 1 Backend Developer (agent coordination, API)
- 1 Frontend Developer (UI components)
- 1 QA Engineer (testing)
- PM oversight and coordination

---

**Document Version**: 1.0
**Created**: November 3, 2025
**Author**: Claude Code AI Assistant
**Status**: Ready for Review
