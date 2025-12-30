# Journey Lifecycle Integration Plan

**Created**: November 3, 2025
**Status**: Implementation Ready
**Priority**: CRITICAL - Addresses revenue protection and user experience

---

## Executive Summary

This plan addresses critical gaps in the user journey and project lifecycle integration to achieve two primary goals:

### Goal 1: Journey Progress Visibility
Users will clearly understand:
- Where they are in their journey (Step 3 of 7)
- What's been completed vs. what's remaining
- Expected time and cost for remaining steps
- How to resume their journey after leaving

### Goal 2: Progress Preservation & Cost Protection
The platform will:
- Save progress at each step to prevent rework
- Lock cost estimates when plans are approved
- Prevent duplicate billing for completed work
- Track incremental costs per journey step
- Enable seamless journey resumption

---

## Current State Analysis

### ✅ What Works Well
- Comprehensive database schemas (projects, projectSessions, agentCheckpoints, analysisPlans)
- Well-defined journey templates with clear steps
- Agent checkpoint approval workflow
- Server-authoritative session management with integrity hashing

### ❌ Critical Gaps Identified

1. **No Unified Journey Progress Tracking**
   - Templates define 5-7 steps, but system doesn't track which step user is on
   - Dashboard shows generic "in-progress" status without context
   - No visual journey lifecycle indicator

2. **Cost Tracking Vulnerabilities** (CRITICAL - Revenue Risk)
   - Users can re-execute analysis multiple times → charged each time
   - Cost estimates displayed but never locked or saved
   - No incremental cost tracking per step
   - No "already billed" protection

3. **Resume Journey UX Gap**
   - No "Resume Journey" button with context
   - Users don't know where they left off
   - No automatic redirection to incomplete steps
   - Context may be lost on page refresh

4. **State Synchronization Issues**
   - 5 different state tracking systems not synchronized:
     - `projectSessions.currentStep` (5 values)
     - `projects.status` (14 values)
     - `analysisPlans.status` (8 values)
     - Journey templates (5-7 steps each)
     - localStorage cache

---

## Implementation Plan

### Phase 1: CRITICAL FIXES (Week 1)
**Goal**: Prevent revenue leakage and immediate user confusion

#### 1.1 Duplicate Billing Prevention
**Priority**: P0 - CRITICAL

**Database Changes**:
```sql
-- Add to projects table
ALTER TABLE projects
ADD COLUMN analysis_executed_at TIMESTAMP,
ADD COLUMN analysis_billed_at TIMESTAMP,
ADD COLUMN total_cost_incurred DECIMAL(10,2) DEFAULT 0,
ADD COLUMN locked_cost_estimate DECIMAL(10,2),
ADD COLUMN cost_breakdown JSONB;
```

**Implementation**:
```typescript
// File: server/routes/analysis-execution.ts

router.post('/execute', ensureAuthenticated, async (req, res) => {
  const { projectId } = req.body;

  // CHECK: Has this analysis already been billed?
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId)
  });

  if (project.analysis_billed_at) {
    return res.status(400).json({
      success: false,
      error: 'Analysis already completed and billed',
      message: 'This analysis has already been executed and paid for. View results instead.',
      billedAt: project.analysis_billed_at,
      costIncurred: project.total_cost_incurred,
      redirectTo: `/results-step/${projectId}`
    });
  }

  // Proceed with execution...
  const result = await executeAnalysis(projectId, req.body);

  // On success, mark as billed
  await db.update(projects)
    .set({
      analysis_executed_at: new Date(),
      analysis_billed_at: new Date(),
      total_cost_incurred: result.actualCost,
      status: 'completed'
    })
    .where(eq(projects.id, projectId));

  // Track billing
  await billingService.trackFeatureUsage(
    userId,
    'analysis_execution',
    project.complexity || 'medium',
    1
  );

  res.json({ success: true, result });
});
```

**Testing**:
- [ ] Test: First execution succeeds and bills user
- [ ] Test: Second execution attempt returns error with redirect to results
- [ ] Test: Error message clearly explains analysis is already paid for

---

#### 1.2 Cost Estimate Locking
**Priority**: P0 - CRITICAL

**Implementation**:
```typescript
// File: server/routes/analysis-plans.ts

router.post('/:planId/approve', ensureAuthenticated, async (req, res) => {
  const { planId } = req.params;
  const { projectId } = req.body;

  const plan = await db.query.analysisPlans.findFirst({
    where: eq(analysisPlans.id, planId)
  });

  if (!plan) {
    return res.status(404).json({ error: 'Plan not found' });
  }

  await db.transaction(async (tx) => {
    // 1. Approve the plan
    await tx.update(analysisPlans)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId
      })
      .where(eq(analysisPlans.id, planId));

    // 2. LOCK cost estimate in project
    await tx.update(projects)
      .set({
        status: 'plan_approved',
        approved_plan_id: planId,
        locked_cost_estimate: plan.estimatedCost?.total || 0,
        cost_breakdown: plan.estimatedCost,
        updated_at: new Date()
      })
      .where(eq(projects.id, projectId));
  });

  res.json({
    success: true,
    message: 'Plan approved and cost estimate locked',
    lockedCost: plan.estimatedCost?.total,
    nextStep: 'execute-step'
  });
});
```

**UI Update** (client/src/pages/plan-step.tsx):
```typescript
// After approval, show confirmation
<ApprovalConfirmation>
  <CheckCircle className="text-green-600" />
  <h3>Plan Approved!</h3>
  <div className="cost-lock-notice">
    <Lock className="text-blue-600" />
    <span>Cost estimate locked at ${plan.estimatedCost.total}</span>
    <p className="text-sm text-gray-600">
      You will not be charged more than this amount for the planned analysis.
    </p>
  </div>
  <Button onClick={() => navigate(`/execute-step/${projectId}`)}>
    Continue to Execute Analysis
  </Button>
</ApprovalConfirmation>
```

**Testing**:
- [ ] Test: Plan approval locks cost estimate in database
- [ ] Test: Locked cost is displayed in execute step
- [ ] Test: Actual cost never exceeds locked estimate (or shows overage warning)

---

#### 1.3 Journey Progress Tracking (Database)
**Priority**: P0 - CRITICAL

**Database Changes**:
```sql
-- Add to projects table
ALTER TABLE projects
ADD COLUMN journey_progress JSONB DEFAULT '{}';

-- Structure:
{
  "templateId": "non_tech_guided_essentials",
  "currentStepId": "guided_analysis",
  "currentStepIndex": 3,
  "currentStepName": "Guided Analysis",
  "totalSteps": 7,
  "completedSteps": ["intake_alignment", "auto_schema_detection", "data_preparation"],
  "percentComplete": 43,
  "lastStepCompletedAt": "2025-11-03T10:30:00Z",
  "estimatedTimeRemaining": "18 minutes"
}
```

**New Service**:
```typescript
// File: server/services/journey-state-manager.ts

import { db } from '../db';
import { projects } from '../../shared/schema';
import { getJourneyTemplate } from '../../shared/journey-templates';
import { eq } from 'drizzle-orm';

export class JourneyStateManager {
  /**
   * Update journey progress when a step is completed
   */
  async completeStep(
    projectId: string,
    completedStepId: string
  ): Promise<void> {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const template = getJourneyTemplate(project.journeyType);
    const stepIndex = template.steps.findIndex(s => s.id === completedStepId);

    if (stepIndex === -1) {
      throw new Error(`Step ${completedStepId} not found in template`);
    }

    const currentProgress = project.journeyProgress || {};
    const completedSteps = currentProgress.completedSteps || [];

    // Add to completed steps if not already there
    if (!completedSteps.includes(completedStepId)) {
      completedSteps.push(completedStepId);
    }

    // Determine next step
    const nextStepIndex = stepIndex + 1;
    const nextStep = template.steps[nextStepIndex];

    const updatedProgress = {
      templateId: template.id,
      currentStepId: nextStep?.id || completedStepId,
      currentStepIndex: nextStepIndex < template.steps.length ? nextStepIndex : stepIndex,
      currentStepName: nextStep?.name || 'Completed',
      totalSteps: template.steps.length,
      completedSteps,
      percentComplete: Math.round((completedSteps.length / template.steps.length) * 100),
      lastStepCompletedAt: new Date().toISOString(),
      estimatedTimeRemaining: this.calculateTimeRemaining(template, nextStepIndex)
    };

    await db.update(projects)
      .set({
        journeyProgress: updatedProgress,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));
  }

  /**
   * Get current journey state for a project
   */
  async getJourneyState(projectId: string) {
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project) {
      throw new Error('Project not found');
    }

    const template = getJourneyTemplate(project.journeyType);
    const progress = project.journeyProgress || {};

    return {
      projectId,
      projectName: project.name,
      journeyType: project.journeyType,
      templateId: template.id,
      templateName: template.title,
      currentStep: {
        id: progress.currentStepId,
        name: progress.currentStepName,
        index: progress.currentStepIndex || 0
      },
      totalSteps: progress.totalSteps || template.steps.length,
      completedSteps: progress.completedSteps || [],
      percentComplete: progress.percentComplete || 0,
      estimatedTimeRemaining: progress.estimatedTimeRemaining,
      costs: {
        estimated: project.locked_cost_estimate || 0,
        spent: project.total_cost_incurred || 0,
        remaining: (project.locked_cost_estimate || 0) - (project.total_cost_incurred || 0)
      },
      canResume: progress.currentStepId && progress.percentComplete < 100
    };
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateTimeRemaining(template: any, currentStepIndex: number): string {
    const remainingSteps = template.steps.slice(currentStepIndex);
    const totalMinutes = remainingSteps.reduce((sum: number, step: any) =>
      sum + (step.estimatedDuration || 0), 0
    );

    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hours`;
    }
  }

  /**
   * Initialize journey progress for a new project
   */
  async initializeJourney(projectId: string, journeyType: string): Promise<void> {
    const template = getJourneyTemplate(journeyType);

    const initialProgress = {
      templateId: template.id,
      currentStepId: template.steps[0].id,
      currentStepIndex: 0,
      currentStepName: template.steps[0].name,
      totalSteps: template.steps.length,
      completedSteps: [],
      percentComplete: 0,
      estimatedTimeRemaining: this.calculateTimeRemaining(template, 0)
    };

    await db.update(projects)
      .set({
        journeyProgress: initialProgress,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));
  }
}

export const journeyStateManager = new JourneyStateManager();
```

**API Endpoints**:
```typescript
// File: server/routes/project.ts

import { journeyStateManager } from '../services/journey-state-manager';

// Get journey state
router.get('/:projectId/journey-state', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    // Verify ownership
    const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    const journeyState = await journeyStateManager.getJourneyState(projectId);

    res.json({
      success: true,
      journeyState
    });
  } catch (error) {
    console.error('Error fetching journey state:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark step as complete
router.post('/:projectId/journey/complete-step', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { stepId } = req.body;
    const userId = (req.user as any)?.id;

    const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    await journeyStateManager.completeStep(projectId, stepId);
    const updatedState = await journeyStateManager.getJourneyState(projectId);

    res.json({
      success: true,
      message: `Step ${stepId} marked as complete`,
      journeyState: updatedState
    });
  } catch (error) {
    console.error('Error completing step:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

**Testing**:
- [ ] Test: Journey initialized on project creation
- [ ] Test: Step completion updates progress correctly
- [ ] Test: Progress percentage calculated accurately
- [ ] Test: Time remaining estimated based on remaining steps

---

### Phase 2: RESUME JOURNEY UX (Week 2)
**Goal**: Enable seamless journey resumption with context

#### 2.1 Dashboard Progress Display

**UI Component**:
```typescript
// File: client/src/components/JourneyProgressCard.tsx

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'wouter';
import { Clock, DollarSign, CheckCircle, ArrowRight } from 'lucide-react';

interface JourneyProgressCardProps {
  projectId: string;
  projectName: string;
  journeyState: {
    currentStep: {
      id: string;
      name: string;
      index: number;
    };
    totalSteps: number;
    percentComplete: number;
    estimatedTimeRemaining: string;
    costs: {
      estimated: number;
      spent: number;
      remaining: number;
    };
    canResume: boolean;
  };
}

export function JourneyProgressCard({ projectId, projectName, journeyState }: JourneyProgressCardProps) {
  const navigate = useNavigate();

  const handleResume = () => {
    // Navigate to appropriate step page based on current step
    const stepRoutes = {
      'intake_alignment': `/prepare-step/${projectId}`,
      'auto_schema_detection': `/data-step/${projectId}`,
      'data_preparation': `/data-verification-step/${projectId}`,
      'guided_analysis': `/plan-step/${projectId}`,
      'insight_curation': `/execute-step/${projectId}`,
      'visual_storytelling': `/results-preview-step/${projectId}`,
      'executive_hand_off': `/results-step/${projectId}`
    };

    const route = stepRoutes[journeyState.currentStep.id] || `/project/${projectId}`;
    navigate(route);
  };

  return (
    <div className="border rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg">{projectName}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="default" className="bg-blue-600">
              IN PROGRESS
            </Badge>
            <span className="text-sm text-gray-600">
              Step {journeyState.currentStep.index + 1} of {journeyState.totalSteps}
            </span>
          </div>
        </div>
        <CheckCircle className="text-blue-600" size={24} />
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">{journeyState.currentStep.name}</span>
          <span className="text-sm text-gray-600">{journeyState.percentComplete}%</span>
        </div>
        <Progress value={journeyState.percentComplete} className="h-2" />
      </div>

      {/* Journey Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="text-gray-500" size={16} />
          <div>
            <p className="text-xs text-gray-600">Estimated Time</p>
            <p className="text-sm font-medium">{journeyState.estimatedTimeRemaining}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="text-gray-500" size={16} />
          <div>
            <p className="text-xs text-gray-600">Cost Progress</p>
            <p className="text-sm font-medium">
              ${journeyState.costs.spent.toFixed(2)} / ${journeyState.costs.estimated.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Budget Indicator */}
      {journeyState.costs.estimated > 0 && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-600">Budget Used</span>
            <span className="text-xs font-medium">
              ${journeyState.costs.remaining.toFixed(2)} remaining
            </span>
          </div>
          <Progress
            value={(journeyState.costs.spent / journeyState.costs.estimated) * 100}
            className="h-1"
          />
        </div>
      )}

      {/* Resume Button */}
      {journeyState.canResume && (
        <Button
          onClick={handleResume}
          className="w-full"
          variant="default"
        >
          Resume Journey
          <ArrowRight className="ml-2" size={16} />
        </Button>
      )}
    </div>
  );
}
```

**Dashboard Integration**:
```typescript
// File: client/src/pages/user-dashboard.tsx

import { JourneyProgressCard } from '@/components/JourneyProgressCard';
import { useQuery } from '@tanstack/react-query';

function UserDashboard() {
  const { data: projects } = useQuery({
    queryKey: ['user-projects'],
    queryFn: async () => {
      const res = await apiClient.get('/api/projects');
      return res.data.projects;
    }
  });

  const { data: journeyStates } = useQuery({
    queryKey: ['journey-states', projects],
    queryFn: async () => {
      if (!projects) return [];

      // Fetch journey state for each in-progress project
      const inProgressProjects = projects.filter(p =>
        p.status !== 'completed' && p.status !== 'cancelled'
      );

      const states = await Promise.all(
        inProgressProjects.map(async (project) => {
          const res = await apiClient.get(`/api/projects/${project.id}/journey-state`);
          return {
            projectId: project.id,
            projectName: project.name,
            ...res.data.journeyState
          };
        })
      );

      return states;
    },
    enabled: !!projects
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">My Projects</h1>

      {/* In Progress Projects */}
      {journeyStates && journeyStates.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Continue Your Journey</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {journeyStates.map((state) => (
              <JourneyProgressCard
                key={state.projectId}
                projectId={state.projectId}
                projectName={state.projectName}
                journeyState={state}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed Projects */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Completed Projects</h2>
        {/* Existing project cards... */}
      </section>
    </div>
  );
}
```

---

#### 2.2 Journey Lifecycle Visualization Component

```typescript
// File: client/src/components/JourneyLifecycleIndicator.tsx

import React from 'react';
import { Check, Circle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JourneyStep {
  id: string;
  name: string;
  index: number;
}

interface JourneyLifecycleIndicatorProps {
  steps: JourneyStep[];
  currentStepIndex: number;
  completedSteps: string[];
  className?: string;
}

export function JourneyLifecycleIndicator({
  steps,
  currentStepIndex,
  completedSteps,
  className
}: JourneyLifecycleIndicatorProps) {
  const getStepStatus = (step: JourneyStep) => {
    if (completedSteps.includes(step.id)) return 'completed';
    if (step.index === currentStepIndex) return 'current';
    if (step.index < currentStepIndex) return 'completed';
    return 'upcoming';
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const status = getStepStatus(step);

          return (
            <React.Fragment key={step.id}>
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                    status === 'completed' && "bg-green-600 border-green-600",
                    status === 'current' && "bg-blue-600 border-blue-600",
                    status === 'upcoming' && "bg-gray-200 border-gray-300"
                  )}
                >
                  {status === 'completed' && <Check className="text-white" size={20} />}
                  {status === 'current' && <Circle className="text-white fill-white" size={12} />}
                  {status === 'upcoming' && <Lock className="text-gray-500" size={16} />}
                </div>

                <div className="mt-2 text-center">
                  <p className={cn(
                    "text-xs font-medium",
                    status === 'current' && "text-blue-600",
                    status === 'completed' && "text-green-600",
                    status === 'upcoming' && "text-gray-500"
                  )}>
                    {step.name}
                  </p>
                  <p className="text-xs text-gray-500">Step {index + 1}</p>
                </div>
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 mt-[-30px]">
                  <div className={cn(
                    "h-full",
                    step.index < currentStepIndex ? "bg-green-600" : "bg-gray-300"
                  )} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
```

**Usage in Step Pages**:
```typescript
// Add to all journey step pages (plan-step.tsx, execute-step.tsx, etc.)

import { JourneyLifecycleIndicator } from '@/components/JourneyLifecycleIndicator';

function PlanStepPage() {
  const { projectId } = useParams();
  const { data: journeyState } = useQuery({
    queryKey: ['journey-state', projectId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/projects/${projectId}/journey-state`);
      return res.data.journeyState;
    }
  });

  return (
    <div className="container mx-auto p-6">
      {/* Journey Lifecycle Indicator at top of every step page */}
      {journeyState && (
        <div className="mb-8">
          <JourneyLifecycleIndicator
            steps={journeyState.template.steps}
            currentStepIndex={journeyState.currentStep.index}
            completedSteps={journeyState.completedSteps}
          />
        </div>
      )}

      {/* Rest of page content... */}
    </div>
  );
}
```

---

#### 2.3 Resume Journey API

```typescript
// File: server/routes/project.ts

router.get('/:projectId/resume', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    const journeyState = await journeyStateManager.getJourneyState(projectId);

    // Map current step to appropriate route
    const stepRouteMap = {
      'intake_alignment': 'prepare-step',
      'auto_schema_detection': 'data-step',
      'data_preparation': 'data-verification-step',
      'guided_analysis': 'plan-step',
      'insight_curation': 'execute-step',
      'visual_storytelling': 'results-preview-step',
      'executive_hand_off': 'results-step'
    };

    const currentStepRoute = stepRouteMap[journeyState.currentStep.id] || 'project';

    // Fetch session data to restore context
    const session = await db.query.projectSessions.findFirst({
      where: eq(projectSessions.projectId, projectId)
    });

    res.json({
      success: true,
      resumeInfo: {
        redirectTo: `/${currentStepRoute}/${projectId}`,
        stepName: journeyState.currentStep.name,
        stepIndex: journeyState.currentStep.index,
        totalSteps: journeyState.totalSteps,
        percentComplete: journeyState.percentComplete,
        estimatedTimeRemaining: journeyState.estimatedTimeRemaining,
        context: {
          projectId,
          sessionId: session?.id,
          currentStep: session?.currentStep,
          prepareData: session?.prepareData,
          executeData: session?.executeData
        },
        costs: journeyState.costs
      }
    });
  } catch (error) {
    console.error('Error preparing resume data:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### Phase 3: INCREMENTAL COST TRACKING (Week 3)
**Goal**: Track costs per operation with rollback capability

#### 3.1 Journey Step Costs Table

**Database Migration**:
```sql
-- File: migrations/add_journey_step_costs_table.sql

CREATE TABLE journey_step_costs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id VARCHAR REFERENCES project_sessions(id) ON DELETE SET NULL,
  step_id VARCHAR NOT NULL, -- Template step ID
  step_name VARCHAR NOT NULL,
  operation_type VARCHAR NOT NULL, -- 'data_upload', 'schema_detection', 'analysis_execution', etc.
  estimated_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  actual_cost DECIMAL(10,2),
  status VARCHAR NOT NULL DEFAULT 'estimated', -- 'estimated', 'in_progress', 'completed', 'failed', 'refunded'
  billed_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_journey_costs_project ON journey_step_costs(project_id);
CREATE INDEX idx_journey_costs_status ON journey_step_costs(status);
CREATE INDEX idx_journey_costs_step ON journey_step_costs(step_id);
```

**Schema Definition**:
```typescript
// File: shared/schema.ts

export const journeyStepCosts = pgTable('journey_step_costs', {
  id: varchar('id', { length: 255 }).primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar('project_id', { length: 255 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
  sessionId: varchar('session_id', { length: 255 }).references(() => projectSessions.id, { onDelete: 'set null' }),
  stepId: varchar('step_id', { length: 255 }).notNull(),
  stepName: varchar('step_name', { length: 255 }).notNull(),
  operationType: varchar('operation_type', { length: 100 }).notNull(),
  estimatedCost: decimal('estimated_cost', { precision: 10, scale: 2 }).notNull().default('0'),
  actualCost: decimal('actual_cost', { precision: 10, scale: 2 }),
  status: varchar('status', { length: 50 }).notNull().default('estimated'),
  billedAt: timestamp('billed_at'),
  completedAt: timestamp('completed_at'),
  failedAt: timestamp('failed_at'),
  errorMessage: text('error_message'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});
```

---

#### 3.2 Cost Tracking Service

```typescript
// File: server/services/journey-cost-tracker.ts

import { db } from '../db';
import { journeyStepCosts, projects } from '../../shared/schema';
import { eq, and, sum } from 'drizzle-orm';
import { getBillingService } from './billing/unified-billing-service';

export class JourneyCostTracker {
  /**
   * Create a cost estimate for an upcoming operation
   */
  async estimateCost(
    projectId: string,
    stepId: string,
    stepName: string,
    operationType: string,
    estimatedCost: number,
    metadata?: any
  ) {
    const costRecord = await db.insert(journeyStepCosts)
      .values({
        projectId,
        stepId,
        stepName,
        operationType,
        estimatedCost: estimatedCost.toString(),
        status: 'estimated',
        metadata
      })
      .returning();

    return costRecord[0];
  }

  /**
   * Start tracking actual cost for an in-progress operation
   */
  async startOperation(costRecordId: string) {
    await db.update(journeyStepCosts)
      .set({
        status: 'in_progress',
        updatedAt: new Date()
      })
      .where(eq(journeyStepCosts.id, costRecordId));
  }

  /**
   * Complete operation successfully and bill user
   */
  async completeOperation(
    costRecordId: string,
    actualCost: number,
    userId: string
  ) {
    const costRecord = await db.query.journeyStepCosts.findFirst({
      where: eq(journeyStepCosts.id, costRecordId)
    });

    if (!costRecord) {
      throw new Error('Cost record not found');
    }

    // Update cost record
    await db.update(journeyStepCosts)
      .set({
        status: 'completed',
        actualCost: actualCost.toString(),
        billedAt: new Date(),
        completedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(journeyStepCosts.id, costRecordId));

    // Bill user via unified billing service
    const billingService = getBillingService();
    await billingService.trackFeatureUsage(
      userId,
      costRecord.operationType,
      'medium', // Determine from metadata
      1
    );

    // Update project total cost
    const totalCost = await this.getProjectTotalCost(costRecord.projectId);
    await db.update(projects)
      .set({
        total_cost_incurred: totalCost.toString()
      })
      .where(eq(projects.id, costRecord.projectId));
  }

  /**
   * Mark operation as failed (no billing)
   */
  async failOperation(
    costRecordId: string,
    errorMessage: string
  ) {
    await db.update(journeyStepCosts)
      .set({
        status: 'failed',
        failedAt: new Date(),
        errorMessage,
        updatedAt: new Date()
      })
      .where(eq(journeyStepCosts.id, costRecordId));
  }

  /**
   * Check if operation has already been billed
   */
  async isOperationBilled(
    projectId: string,
    operationType: string
  ): Promise<boolean> {
    const existingBilling = await db.query.journeyStepCosts.findFirst({
      where: and(
        eq(journeyStepCosts.projectId, projectId),
        eq(journeyStepCosts.operationType, operationType),
        eq(journeyStepCosts.status, 'completed')
      )
    });

    return !!existingBilling;
  }

  /**
   * Get total cost incurred for a project
   */
  async getProjectTotalCost(projectId: string): Promise<number> {
    const result = await db
      .select({
        total: sum(journeyStepCosts.actualCost)
      })
      .from(journeyStepCosts)
      .where(
        and(
          eq(journeyStepCosts.projectId, projectId),
          eq(journeyStepCosts.status, 'completed')
        )
      );

    return parseFloat(result[0]?.total || '0');
  }

  /**
   * Get cost breakdown by step
   */
  async getCostBreakdown(projectId: string) {
    const costs = await db.query.journeyStepCosts.findMany({
      where: eq(journeyStepCosts.projectId, projectId),
      orderBy: (costs, { asc }) => [asc(costs.createdAt)]
    });

    return costs.map(cost => ({
      stepId: cost.stepId,
      stepName: cost.stepName,
      operationType: cost.operationType,
      estimated: parseFloat(cost.estimatedCost),
      actual: cost.actualCost ? parseFloat(cost.actualCost) : null,
      status: cost.status,
      billedAt: cost.billedAt,
      failedAt: cost.failedAt
    }));
  }
}

export const journeyCostTracker = new JourneyCostTracker();
```

---

#### 3.3 Updated Execute Flow with Cost Tracking

```typescript
// File: server/routes/analysis-execution.ts

import { journeyCostTracker } from '../services/journey-cost-tracker';

router.post('/execute', ensureAuthenticated, async (req, res) => {
  const { projectId, analysisConfig } = req.body;
  const userId = (req.user as any)?.id;

  try {
    // CHECK: Has this operation already been billed?
    const alreadyBilled = await journeyCostTracker.isOperationBilled(
      projectId,
      'analysis_execution'
    );

    if (alreadyBilled) {
      return res.status(400).json({
        success: false,
        error: 'Analysis already executed and billed',
        message: 'This analysis has already been completed. View results instead.',
        redirectTo: `/results-step/${projectId}`
      });
    }

    // Get locked cost estimate from project
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    const estimatedCost = project?.locked_cost_estimate || 0;

    // Create cost record
    const costRecord = await journeyCostTracker.estimateCost(
      projectId,
      'insight_curation', // Template step ID
      'Insight Curation',
      'analysis_execution',
      estimatedCost,
      { analysisConfig }
    );

    // Mark as in progress
    await journeyCostTracker.startOperation(costRecord.id);

    try {
      // Execute analysis
      const result = await executeAnalysis(projectId, analysisConfig);

      // Calculate actual cost
      const actualCost = calculateActualCost(result);

      // Complete and bill
      await journeyCostTracker.completeOperation(
        costRecord.id,
        actualCost,
        userId
      );

      res.json({
        success: true,
        result,
        costs: {
          estimated: estimatedCost,
          actual: actualCost
        }
      });

    } catch (error) {
      // Mark as failed - NO BILLING
      await journeyCostTracker.failOperation(
        costRecord.id,
        error.message
      );

      throw error;
    }

  } catch (error) {
    console.error('Error executing analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

---

### Phase 4: STATE SYNCHRONIZATION (Week 4)
**Goal**: Unify all state tracking systems

#### 4.1 Unified State Transition Service

```typescript
// File: server/services/unified-journey-state.ts

import { db } from '../db';
import { projects, projectSessions, analysisPlans } from '../../shared/schema';
import { journeyStateManager } from './journey-state-manager';
import { eq } from 'drizzle-orm';

export class UnifiedJourneyState {
  /**
   * Transition project through journey lifecycle
   * Updates ALL relevant tables atomically
   */
  async transition(
    projectId: string,
    transition: {
      templateStepId: string;
      sessionStep?: 'prepare' | 'data' | 'execute' | 'pricing' | 'results';
      projectStatus?: string;
      planStatus?: string;
    }
  ) {
    await db.transaction(async (tx) => {
      // 1. Update journey progress (via journey state manager)
      await journeyStateManager.completeStep(projectId, transition.templateStepId);

      // 2. Update project status if provided
      if (transition.projectStatus) {
        await tx.update(projects)
          .set({
            status: transition.projectStatus,
            updatedAt: new Date()
          })
          .where(eq(projects.id, projectId));
      }

      // 3. Update session current step if provided
      if (transition.sessionStep) {
        await tx.update(projectSessions)
          .set({
            currentStep: transition.sessionStep,
            lastActivity: new Date()
          })
          .where(eq(projectSessions.projectId, projectId));
      }

      // 4. Update plan status if applicable
      if (transition.planStatus) {
        await tx.update(analysisPlans)
          .set({
            status: transition.planStatus,
            updatedAt: new Date()
          })
          .where(eq(analysisPlans.projectId, projectId));
      }
    });
  }

  /**
   * Get complete unified state
   */
  async getUnifiedState(projectId: string) {
    const [project, session, plan, journeyState] = await Promise.all([
      db.query.projects.findFirst({ where: eq(projects.id, projectId) }),
      db.query.projectSessions.findFirst({ where: eq(projectSessions.projectId, projectId) }),
      db.query.analysisPlans.findFirst({ where: eq(analysisPlans.projectId, projectId) }),
      journeyStateManager.getJourneyState(projectId)
    ]);

    return {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
        journeyType: project.journeyType
      },
      session: {
        id: session?.id,
        currentStep: session?.currentStep,
        lastActivity: session?.lastActivity
      },
      plan: {
        id: plan?.id,
        status: plan?.status,
        approvedAt: plan?.approvedAt
      },
      journey: journeyState
    };
  }
}

export const unifiedJourneyState = new UnifiedJourneyState();
```

---

## Migration Guide

### Step 1: Database Migrations
```bash
# Run new migrations
npm run db:push

# Verify tables created:
# - journey_step_costs
# - projects.journey_progress (column)
# - projects.locked_cost_estimate (column)
# - projects.analysis_billed_at (column)
```

### Step 2: Initialize Existing Projects
```typescript
// One-time script to initialize journey progress for existing projects
// File: scripts/initialize-journey-progress.ts

import { db } from '../server/db';
import { projects } from '../shared/schema';
import { journeyStateManager } from '../server/services/journey-state-manager';

async function initializeExistingProjects() {
  const allProjects = await db.query.projects.findMany();

  for (const project of allProjects) {
    if (!project.journeyProgress || Object.keys(project.journeyProgress).length === 0) {
      console.log(`Initializing journey progress for project ${project.id}`);

      try {
        await journeyStateManager.initializeJourney(
          project.id,
          project.journeyType || 'ai_guided'
        );
      } catch (error) {
        console.error(`Failed to initialize project ${project.id}:`, error);
      }
    }
  }

  console.log('Journey progress initialization complete');
}

initializeExistingProjects();
```

### Step 3: Update Journey Step Pages
- Add `JourneyLifecycleIndicator` component to top of each step page
- Call journey state manager when step completes
- Display cost information from locked estimate

### Step 4: Update Dashboard
- Replace simple project cards with `JourneyProgressCard`
- Fetch journey state for in-progress projects
- Add "Resume Journey" functionality

### Step 5: Deploy & Test
- Deploy Phase 1 changes first (critical fixes)
- Monitor for duplicate billing attempts (should be blocked)
- Verify cost estimates are locked on plan approval
- Test resume journey flow end-to-end

---

## Testing Checklist

### Phase 1: Critical Fixes
- [ ] Duplicate billing prevention works
- [ ] Cost estimate locked on plan approval
- [ ] Journey progress tracked in database
- [ ] Progress updates when steps complete

### Phase 2: Resume Journey
- [ ] Dashboard shows journey progress cards
- [ ] Resume button navigates to correct step
- [ ] Context preserved across sessions
- [ ] Journey lifecycle indicator displays correctly

### Phase 3: Cost Tracking
- [ ] Cost records created before operations
- [ ] Successful operations billed correctly
- [ ] Failed operations NOT billed
- [ ] Cost breakdown visible to users

### Phase 4: State Sync
- [ ] All state tables updated atomically
- [ ] No state drift between tables
- [ ] Unified state API returns consistent data

---

## Success Metrics

### User Experience Metrics
- **Time to Resume**: < 5 seconds from dashboard to correct step
- **Context Preservation**: 100% of session data retained
- **Journey Visibility**: Users always know current step and progress

### Cost Protection Metrics
- **Duplicate Billing**: 0 instances
- **Failed Operation Billing**: 0 instances
- **Cost Transparency**: 100% of operations show cost before execution

### Technical Metrics
- **State Consistency**: 100% synchronization across tables
- **Session Reliability**: < 1% session data loss
- **API Performance**: Resume journey < 200ms response time

---

## Rollout Plan

### Week 1: Phase 1 (Critical)
- Database migrations
- Duplicate billing prevention
- Cost locking
- Journey progress tracking

**Risk**: MEDIUM - Database changes, but backwards compatible
**Rollback**: Disable new checks, revert to old flow

### Week 2: Phase 2 (High Value)
- Dashboard UI updates
- Resume journey API
- Journey lifecycle indicator

**Risk**: LOW - Frontend-only changes
**Rollback**: Revert frontend commits

### Week 3: Phase 3 (Enhanced)
- Incremental cost tracking
- Cost breakdown UI
- Refund capability

**Risk**: MEDIUM - New billing integration
**Rollback**: Disable cost tracking, use old billing

### Week 4: Phase 4 (Polish)
- State synchronization
- Analytics dashboard
- Performance optimization

**Risk**: LOW - Internal improvements
**Rollback**: Optional features, safe to disable

---

## Maintenance & Monitoring

### Alerts to Set Up
1. **Duplicate Billing Attempt**: Alert when blocked
2. **State Drift Detected**: Journey progress ≠ session state
3. **Cost Overrun**: Actual > 120% of estimate
4. **Session Expiry**: Warning 1 day before 7-day expiry

### Dashboards to Create
1. **Journey Completion Funnel**: Drop-off by step
2. **Cost Accuracy**: Estimated vs. Actual
3. **Resume Rate**: % of users who resume
4. **Step Duration**: Actual vs. Estimated time

---

## Future Enhancements (Beyond Scope)

1. **Journey Branching**: Multiple paths based on data characteristics
2. **Checkpoint Rollback**: Undo step and retry
3. **Cost Optimization Suggestions**: "Save $X by reducing visualizations"
4. **Collaborative Journeys**: Multiple users on same project
5. **Journey Templates Marketplace**: User-created templates
6. **AI-Powered Step Recommendations**: "Based on your data, skip Step X"

---

## Questions for Clarification

1. **Cost Overrun Policy**: What happens if actual cost exceeds locked estimate?
   - Option A: Absorb overrun (better UX, revenue risk)
   - Option B: Charge difference (accurate billing, worse UX)
   - Option C: Set max overrun threshold (e.g., +10%)

2. **Session Expiry**: Current default is 7 days. Should this be:
   - Configurable per user?
   - Extended for higher tiers?
   - Renewable on activity?

3. **Journey Interruption**: If user leaves at Step 3, should we:
   - Send email reminder to resume?
   - Auto-archive after X days?
   - Offer to restart journey?

4. **Cost Refund Policy**: If analysis fails mid-execution:
   - Full refund?
   - Partial refund (pay for what succeeded)?
   - Credit for future use?

---

## Conclusion

This plan provides a **comprehensive, phased approach** to integrating user journeys with the project lifecycle. The implementation:

✅ **Protects Revenue**: Prevents duplicate billing and tracks costs accurately
✅ **Improves UX**: Clear progress indicators and seamless resumption
✅ **Maintains Quality**: Server-authoritative state management
✅ **Enables Growth**: Foundation for advanced journey features

**Estimated Total Effort**: 4 weeks (1 developer)
**Business Impact**: HIGH - Critical for user trust and revenue integrity
**Technical Risk**: MEDIUM - Database changes and state management complexity

**Recommendation**: Start with Phase 1 immediately to address critical revenue risks, then proceed with Phases 2-4 based on user feedback.
