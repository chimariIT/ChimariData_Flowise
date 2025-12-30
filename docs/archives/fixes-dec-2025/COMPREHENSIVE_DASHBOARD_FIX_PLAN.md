# Comprehensive Dashboard Fix - Implementation Plan

**Date**: December 5, 2025
**Status**: Implementation Plan - Long-Term Fix
**Approach**: Thorough review, planning, and systematic implementation

---

## 🎯 **Executive Summary**

**PLAN STATUS**: ✅ **ANALYSIS COMPLETE** | ❌ **IMPLEMENTATION: 0% COMPLETE**

After comprehensive code review and schema analysis, I've identified that **all database tables and columns exist correctly**. The issues are **service integration and data flow** problems, not architectural issues.

### **Key Findings**:

✅ **Database Schema**: Complete and correct
- `projects` table has `lockedCostEstimate`, `totalCostIncurred` (lines 651-652)
- `projects` table has `journeyProgress` JSONB field (line 660)
- `decisionAudits` table exists (line 1202)
- `projectArtifacts` table exists (line 539)
- `generatedArtifacts` table exists (line 1224)

❌ **Problems**: Services not populating data
- Cost estimation service not called during planning
- Artifact generation service not called during execution
- Decision audits not recorded during workflow
- Metrics not tracked during uploads

### **⚠️ IMPORTANT**: All 9 phases documented below are **PENDING IMPLEMENTATION**. None of the fixes have been applied to the codebase yet.

---

## ⚠️ Dec 14, 2025 Impact Update

- **Dashboards still cannot trust uploaded data** – multi-file journeys surface only the first dataset in both `data-step.tsx` and `data-verification-step.tsx`, so overview/data tabs never receive the merged table they expect.
- **Privacy indicators remain inaccurate** – because excluded columns are hidden only in client state, the dashboard’s data tab re-renders PII-labeled columns after any refresh.
- **Timeline & insights tabs are gated on transformations that cannot run** – `/api/projects/:id/execute-transformations` is never implemented server-side, so no transformed dataset IDs reach the artifact/insight services documented later in this plan.

These regressions map directly to Issues #18-#20 in `PROJECT_DASHBOARD_ISSUES_AND_FIXES.md` and must be resolved before the phased dashboard rollout below can proceed.

---

## 📊 **Database Schema Status** ✅ VERIFIED COMPLETE

### **Projects Table** (shared/schema.ts:635-687)

| Column | Type | Purpose | Currently Populated |
|--------|------|---------|-------------------|
| `id` | varchar | Primary key | ✅ Yes |
| `userId` | varchar | Owner reference | ✅ Yes |
| `name` | varchar | Project name | ✅ Yes |
| `status` | varchar | Workflow status | ✅ Yes |
| `journeyType` | varchar | Journey type | ✅ Yes |
| `analysisGoals` | text | User's goals | ✅ Yes (from prepare step) |
| `businessQuestions` | text | User questions | ✅ Yes (from prepare step) |
| **`lockedCostEstimate`** | decimal(10,2) | Estimated cost | ❌ **NOT POPULATED** |
| **`totalCostIncurred`** | decimal(10,2) | Actual cost | ❌ **NOT POPULATED** |
| `costBreakdown` | jsonb | Cost details | ❌ Not populated |
| **`journeyProgress`** | jsonb | Journey state | ✅ Yes (by journey-state-manager) |
| `stepCompletionStatus` | jsonb | Step flags | ⚠️ Partially populated |
| `lastAccessedStep` | varchar | Current step | ⚠️ Partially populated |
| `approvedPlanId` | varchar | Plan reference | ⚠️ Only if plan approved |
| `analysisExecutedAt` | timestamp | Execution time | ⚠️ Only after execution |
| `analysisBilledAt` | timestamp | Billing time | ❌ Not populated |

### **Decision Audits Table** (shared/schema.ts:1202-1221)

| Column | Type | Purpose | Currently Populated |
|--------|------|---------|-------------------|
| `id` | varchar | Primary key | - |
| `projectId` | varchar | Project reference | - |
| `agent` | varchar | Agent name | - |
| `decisionType` | varchar | Decision category | - |
| `decision` | text | Actual decision | - |
| `reasoning` | text | Why decision made | - |
| `alternatives` | jsonb | Other options | - |
| `confidence` | integer | Confidence 0-100 | - |
| `impact` | varchar | low/medium/high | - |
| `timestamp` | timestamp | When decided | - |

**Status**: ❌ **TABLE EXISTS BUT NO DATA BEING INSERTED**

### **Project Artifacts Table** (shared/schema.ts:539-570)

| Column | Type | Purpose | Currently Populated |
|--------|------|---------|-------------------|
| `id` | varchar | Primary key | - |
| `projectId` | varchar | Project reference | - |
| `type` | varchar | Artifact type | - |
| `status` | varchar | Generation status | - |
| `output` | jsonb | Results data | - |
| **`fileRefs`** | jsonb | **File URIs** | - |
| `metrics` | jsonb | Performance data | - |

**Status**: ❌ **TABLE EXISTS BUT NO ARTIFACTS BEING CREATED**

### **Generated Artifacts Table** (shared/schema.ts:1224-1250)

Similar structure for adaptive content engine artifacts.

**Status**: ❌ **TABLE EXISTS BUT NOT INTEGRATED**

---

## 🔍 **Root Cause Analysis by Issue**

### **Issue #1: Resume Journey Fails**

**Root Cause**: Logic in `journey-state-manager.ts:281`
```typescript
canResume: Boolean(progress?.currentStepId) && percentComplete < 100,
```

**Problem**: Doesn't account for:
- Paused journeys
- Steps waiting for approval
- User explicitly cancelling journey

**Fix Required**: Add `journeyStatus` column check

---

### **Issue #2: Billing Amounts Zero**

**Root Cause**: Services not integrated

**Missing Integration Points**:

1. **Plan Step** - Should call cost estimation:
   - File: `server/routes/analysis-plans.ts`
   - Service: `server/services/billing/unified-billing-service.ts`
   - Action: Calculate costs, set `lockedCostEstimate`

2. **Execute Step** - Should track actual usage:
   - File: `server/routes/analysis-execution.ts`
   - Service: `server/services/usage-tracking.ts`
   - Action: Record AI usage, increment `totalCostIncurred`

**Services Exist**: ✅ Yes
**Services Called**: ❌ No

---

### **Issue #3: Workflow Steps Pre-Checked**

**Root Cause**: Components use mock data or incorrect state

**Files to Check**:
- `client/src/components/workflow-transparency-dashboard.tsx`
- `client/src/components/JourneyLifecycleIndicator.tsx`

**Expected**: Should read from `journeyState.completedSteps[]`

**Actual**: Likely hardcoded or using test data

---

### **Issue #4: Upload SLA No Records**

**Root Cause**: Metrics endpoint missing or not recording

**Missing**:
1. Metrics recording during upload
2. Metrics API endpoint

**Files to Create/Fix**:
- `server/routes/performance-metrics.ts` (endpoint)
- `server/services/metric-tracker.ts` (recording)

---

### **Issue #5: Decision Trail Hardcoded**

**Root Cause**: Decision audits not being inserted

**Table Exists**: ✅ Yes (`decisionAudits`)
**Data Inserted**: ❌ No

**Where to Insert**:
- Plan creation: PM agent decisions
- Execution: Analysis approach decisions
- Transformation: Data processing decisions
- User approvals: Manual decisions

---

### **Issue #6: No Artifacts**

**Root Cause**: Artifact generator not called

**Service Exists**: ✅ `server/services/artifact-generator.ts`
**Service Called**: ❌ No

**Where to Call**:
- After upload: Dataset artifact
- After execution: Chart/report artifacts
- After analysis: Statistical output artifacts

---

### **Issue #7: Charts Not Generating**

**Root Cause**: Visualization engine not integrated

**Service Exists**: ✅ `server/services/enhanced-visualization-engine.ts`
**API Endpoint**: ❌ Missing

**Need**:
- POST `/api/projects/:id/generate-chart`
- Integration in dashboard-builder component

---

### **Issue #8: Data Tab No Dataset**

**Root Cause**: Need to verify dataset linking logic

**Component**: ✅ Correctly implemented
**API Call**: ✅ Correct endpoint
**Backend**: ⚠️ Need to verify linking logic

---

## 🛠️ **Implementation Plan**

### **Phase 1: Critical Database Additions** (30 minutes)

#### **1.1: Add Missing Column (if needed)**

```sql
-- Check if column exists
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'projects'
AND column_name = 'journeyStatus';

-- Add if missing
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS "journeyStatus" VARCHAR(50) DEFAULT 'active'
CHECK ("journeyStatus" IN ('active', 'paused', 'cancelled', 'completed'));

-- Set default for existing rows
UPDATE projects
SET "journeyStatus" = 'active'
WHERE "journeyStatus" IS NULL;
```

#### **1.2: Verify All Tables Exist**

```sql
-- Check critical tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'projects',
  'decision_audits',
  'project_artifacts',
  'generated_artifacts',
  'datasets',
  'project_datasets'
);
```

---

### **Phase 2: Fix Resume Journey Logic** (15 minutes)

**File**: `server/services/journey-state-manager.ts`

**Line 281 - BEFORE**:
```typescript
canResume: Boolean(progress?.currentStepId) && percentComplete < 100,
```

**Line 281 - AFTER**:
```typescript
canResume: Boolean(progress?.currentStepId) &&
           percentComplete < 100 &&
           (project as any).journeyStatus !== 'cancelled',
```

**Also update line 676 in schema.ts to add journeyStatus to CHECK constraint if not present**.

---

### **Phase 3: Integrate Cost Tracking** (2 hours)

#### **3.1: Plan Step Cost Estimation**

**File**: `server/routes/analysis-plans.ts` or wherever plan is created

**Add**:
```typescript
import { UnifiedBillingService } from '../services/billing/unified-billing-service';

// After plan generation
const billingService = new UnifiedBillingService();
const costEstimate = await billingService.estimateJourneyCost({
  projectId,
  datasetSize: datasets[0]?.fileSize || 0,
  analysisTypes: plan.analysisSteps.map(s => s.type),
  visualizations: plan.visualizations.length,
  mlModels: plan.mlModels.length
});

// Update project with locked estimate
await db.update(projects)
  .set({
    lockedCostEstimate: costEstimate.total.toString(),
    costBreakdown: costEstimate
  })
  .where(eq(projects.id, projectId));
```

#### **3.2: Execution Step Usage Tracking**

**File**: `server/routes/analysis-execution.ts`

**Add**:
```typescript
import { usageTracker } from '../services/usage-tracking';

// After analysis execution
await usageTracker.recordUsage({
  projectId,
  userId,
  type: 'ai_inference',
  provider: 'gemini',
  tokens: tokensUsed,
  cost: calculatedCost
});

// Update total cost incurred
await db.update(projects)
  .set({
    totalCostIncurred: sql`COALESCE(${projects.totalCostIncurred}, 0) + ${calculatedCost}`,
    analysisExecutedAt: new Date()
  })
  .where(eq(projects.id, projectId));
```

#### **3.3: Temporary Fallback (While Integration Pending)**

**File**: `server/services/journey-state-manager.ts` lines 253-279

**Add fallback logic**:
```typescript
const estimatedCost = Number((project as any).lockedCostEstimate ?? 0);
const spentCost = Number((project as any).totalCostIncurred ?? 0);

// Temporary fallback estimates based on journey type
const fallbackEstimates: Record<string, number> = {
  'non-tech': 15,
  'business': 25,
  'technical': 50,
  'consultation': 100,
  'custom': 75
};

const finalEstimate = estimatedCost > 0 ? estimatedCost :
                      fallbackEstimates[project.journeyType as string] || 25;

const finalSpent = spentCost > 0 ? spentCost :
                   Math.floor(finalEstimate * (percentComplete / 100));

costs: {
  estimated: finalEstimate,
  spent: finalSpent,
  remaining: Math.max(finalEstimate - finalSpent, 0),
}
```

---

### **Phase 4: Fix Workflow Components** (1 hour)

#### **4.1: JourneyLifecycleIndicator**

**File**: `client/src/components/JourneyLifecycleIndicator.tsx`

**Ensure it uses real journey state**:
```typescript
const { data: journeyState } = useJourneyState(projectId);

{journeyState?.steps.map((step, index) => {
  const isCompleted = journeyState.completedSteps.includes(step.id);
  const isCurrent = step.id === journeyState.currentStep.id;
  const isPending = !isCompleted && index > journeyState.currentStep.index;

  return (
    <StepIndicator
      key={step.id}
      status={isCompleted ? 'completed' : isCurrent ? 'current' : 'pending'}
      step={step}
    />
  );
})}
```

#### **4.2: WorkflowTransparencyDashboard**

**File**: `client/src/components/workflow-transparency-dashboard.tsx`

**Same pattern** - ensure it reads from `journeyState` not mock data.

---

### **Phase 5: Decision Audit Integration** (1.5 hours)

**Create helper service**: `server/services/decision-logger.ts`

```typescript
import { db } from '../db';
import { decisionAudits } from '@shared/schema';
import { nanoid } from 'nanoid';

export async function logDecision({
  projectId,
  agent,
  decisionType,
  decision,
  reasoning,
  alternatives = [],
  confidence,
  impact = 'medium',
  userInput
}: {
  projectId: string;
  agent: string;
  decisionType: string;
  decision: string;
  reasoning: string;
  alternatives?: any[];
  confidence: number;
  impact?: 'low' | 'medium' | 'high';
  userInput?: string;
}) {
  await db.insert(decisionAudits).values({
    id: nanoid(),
    projectId,
    agent,
    decisionType,
    decision,
    reasoning,
    alternatives,
    confidence,
    impact,
    userInput,
    reversible: true,
    context: {},
    timestamp: new Date()
  });
}
```

**Integration Points**:

1. **Plan Creation** - Log PM agent decisions
2. **User Approvals** - Log checkpoint approvals
3. **Analysis Execution** - Log analysis approach choices
4. **Transformations** - Log data processing decisions

---

### **Phase 6: Artifact Generation** (2 hours)

#### **6.1: Upload Step Integration**

**File**: `server/routes/project.ts` (upload endpoint)

```typescript
import { artifactGenerator } from '../services/artifact-generator';

// After successful upload
await db.insert(projectArtifacts).values({
  id: nanoid(),
  projectId,
  type: 'ingestion',
  status: 'completed',
  output: {
    fileName: file.originalname,
    fileSize: file.size,
    recordCount: data.length,
    schema: detectedSchema
  },
  fileRefs: [{
    url: `/uploads/${projectId}/${file.filename}`,
    fileName: file.originalname,
    mimeType: file.mimetype
  }],
  createdBy: userId,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

#### **6.2: Analysis Step Integration**

**File**: `server/routes/analysis-execution.ts`

```typescript
// After analysis completes
const artifacts = await artifactGenerator.generateArtifacts({
  projectId,
  type: 'analysis',
  results: analysisResults,
  charts: generatedCharts
});

for (const artifact of artifacts) {
  await db.insert(projectArtifacts).values(artifact);
}
```

---

### **Phase 7: Chart Generation API** (1.5 hours)

#### **7.1: Create Visualization Route**

**File**: `server/routes/visualization.ts` (NEW)

```typescript
import express from 'express';
import { enhancedVisualizationEngine } from '../services/enhanced-visualization-engine';
import { ensureAuthenticated } from './auth';

const router = express.Router();

router.post("/:projectId/generate-chart", ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { chartType, xAxis, yAxis, aggregation, filters } = req.body;

    const chartResult = await enhancedVisualizationEngine.generateChart({
      projectId,
      chartType,
      xAxis,
      yAxis,
      aggregation,
      filters
    });

    res.json({ success: true, chart: chartResult });
  } catch (error: any) {
    console.error('Chart generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

#### **7.2: Register Route**

**File**: `server/index.ts`

```typescript
import visualizationRoutes from './routes/visualization';
app.use('/api/visualization', visualizationRoutes);
```

#### **7.3: Update Frontend**

**File**: `client/src/components/dashboard-builder.tsx`

```typescript
const generateChart = async (config: ChartConfig) => {
  const result = await apiClient.post(
    `/api/visualization/${projectId}/generate-chart`,
    config
  );
  return result.chart;
};
```

---

### **Phase 8: Performance Metrics** (1 hour)

#### **8.1: Create Metrics Tracker**

**File**: `server/services/metric-tracker.ts` (NEW)

```typescript
interface MetricData {
  service: string;
  operation: string;
  duration: number;
  success: boolean;
  userId?: string;
}

const metrics: Map<string, MetricData[]> = new Map();

export const metricTracker = {
  record(data: MetricData) {
    const key = `${data.service}:${data.operation}`;
    if (!metrics.has(key)) {
      metrics.set(key, []);
    }
    metrics.get(key)!.push({
      ...data,
      timestamp: Date.now()
    });
  },

  getSummary(timeWindowMs: number = 3600000) {
    const now = Date.now();
    const cutoff = now - timeWindowMs;

    const summary: any = { services: {} };

    for (const [key, records] of metrics.entries()) {
      const recent = records.filter(r => r.timestamp > cutoff);
      const [service, operation] = key.split(':');

      if (!summary.services[service]) {
        summary.services[service] = { operations: {} };
      }

      summary.services[service].operations[operation] = {
        count: recent.length,
        avgDuration: recent.reduce((sum, r) => sum + r.duration, 0) / recent.length,
        p95Duration: calculateP95(recent.map(r => r.duration)),
        errorRate: recent.filter(r => !r.success).length / recent.length
      };
    }

    return summary;
  }
};
```

#### **8.2: Create Metrics Endpoint**

**File**: `server/routes/performance-metrics.ts` (NEW)

```typescript
import express from 'express';
import { metricTracker } from '../services/metric-tracker';
import { ensureAuthenticated } from './auth';

const router = express.Router();

router.get("/metrics/my-uploads", ensureAuthenticated, async (req, res) => {
  const timeWindow = parseInt(req.query.timeWindow as string) || 3600000;
  const summary = metricTracker.getSummary(timeWindow);
  res.json({ success: true, summary });
});

export default router;
```

#### **8.3: Register Route**

**File**: `server/index.ts`

```typescript
import performanceRoutes from './routes/performance-metrics';
app.use('/api/performance', performanceRoutes);
```

#### **8.4: Track Upload Metrics**

**File**: `server/routes/project.ts` (upload endpoint)

```typescript
import { metricTracker } from '../services/metric-tracker';

router.post("/upload", async (req, res) => {
  const startTime = Date.now();
  try {
    // ... upload logic ...

    metricTracker.record({
      service: 'client_upload',
      operation: 'upload_flow_total',
      duration: Date.now() - startTime,
      success: true,
      userId: (req.user as any)?.id
    });
  } catch (error) {
    metricTracker.record({
      service: 'client_upload',
      operation: 'upload_flow_total',
      duration: Date.now() - startTime,
      success: false,
      userId: (req.user as any)?.id
    });
    throw error;
  }
});
```

---

### **Phase 9: Dataset Recognition Fix** (30 minutes)

**File**: `server/routes/project.ts` (check linking logic)

**Verify**:
```typescript
// After dataset creation in upload endpoint
const dataset = await storage.createDataset({ ... });

// CRITICAL: Ensure linking happens
await storage.linkDatasetToProject(projectId, dataset.id);

// Or if using addDatasetToProject from apiClient
await storage.addDatasetToProject(projectId, dataset.id, 'primary');
```

**Test query**:
```sql
-- Verify datasets are linked
SELECT
  p.id as project_id,
  p.name as project_name,
  pd.dataset_id,
  d.original_file_name
FROM projects p
LEFT JOIN project_datasets pd ON p.id = pd."projectId"
LEFT JOIN datasets d ON pd."datasetId" = d.id
WHERE p.id = '<test-project-id>';
```

---

## 📋 **Implementation Checklist**

**STATUS**: ❌ **NOT STARTED** - All phases pending implementation

### **Day 1 - Critical Fixes** (4 hours)

- [ ] ❌ Phase 1: Add journeyStatus column if missing
- [ ] ❌ Phase 2: Fix canResume logic
- [ ] ❌ Phase 3: Add billing fallback (temporary)
- [ ] ❌ Phase 5: Create decision logger service
- [ ] ❌ Phase 9: Verify dataset linking

### **Day 2 - Service Integration** (6 hours)

- [ ] ❌ Phase 3: Full cost tracking integration
- [ ] ❌ Phase 4: Fix workflow components
- [ ] ❌ Phase 6: Artifact generation integration
- [ ] ❌ Phase 7: Chart generation API

### **Day 3 - Polish & Testing** (4 hours)

- [ ] ❌ Phase 8: Performance metrics
- [ ] ❌ End-to-end testing
- [ ] ❌ Documentation updates
- [ ] ❌ Migration guide

### **ADDITIONAL CRITICAL ISSUES FOUND** (Not in original plan)

- [ ] 🔴 Data upload preview not showing (Type mismatch bug in data-step.tsx:1070)
- [ ] ⚠️ Horizontal scroll not working (Missing ScrollBar in data-verification-step.tsx:608)
- [ ] ⚠️ DescriptiveStats display verification needed (data-step.tsx:1154)

---

## 🧪 **Testing Plan**

### **Test 1: Resume Journey**
1. Create project
2. Complete some steps
3. Navigate to dashboard
4. Click "Resume Journey"
5. ✅ Should go to correct step

### **Test 2: Billing Display**
1. Create new project
2. Complete plan step
3. Check journey lifecycle
4. ✅ Should show estimated costs (even if fallback)

### **Test 3: Workflow Status**
1. Create project
2. Complete steps
3. Check workflow dashboard
4. ✅ Should show correct completed/current/pending

### **Test 4: Decision Trail**
1. Complete journey
2. Go to timeline tab
3. ✅ Should show decision audit entries

### **Test 5: Artifacts**
1. Upload data
2. Run analysis
3. Go to timeline tab
4. ✅ Should show artifacts with preview/download

### **Test 6: Charts**
1. Go to visualizations tab
2. Build chart
3. ✅ Should generate and display

### **Test 7: Upload SLA**
1. Upload file
2. Go to overview tab
3. ✅ Should show upload metrics

### **Test 8: Dataset Recognition**
1. Upload file
2. Go to data tab
3. ✅ Should show uploaded dataset

---

## 📝 **Migration Guide**

### **For Existing Projects**

```sql
-- Set default journey status
UPDATE projects
SET "journeyStatus" = 'active'
WHERE "journeyStatus" IS NULL
AND status NOT IN ('completed', 'cancelled');

UPDATE projects
SET "journeyStatus" = 'completed'
WHERE status = 'completed';

UPDATE projects
SET "journeyStatus" = 'cancelled'
WHERE status = 'cancelled';

-- Set fallback cost estimates (optional)
UPDATE projects
SET "lockedCostEstimate" = CASE
  WHEN "journeyType" = 'non-tech' THEN 15
  WHEN "journeyType" = 'business' THEN 25
  WHEN "journeyType" = 'technical' THEN 50
  WHEN "journeyType" = 'consultation' THEN 100
  ELSE 25
END
WHERE "lockedCostEstimate" IS NULL OR "lockedCostEstimate" = 0;
```

---

## 📊 **FINAL STATUS SUMMARY** (Updated Dec 8, 2025)

### **Implementation Progress**: ~40% Complete

| Phase | Status | Time Est. | Priority |
|-------|--------|-----------|----------|
| Phase 1: Database Setup | ⚠️ PARTIAL (journeyStatus exists) | 30 min | P0 |
| Phase 2: Resume Logic | ✅ **FIXED** (Dec 8) | 15 min | P1 |
| Phase 3: Cost Tracking | ⚠️ TEMP FIX (fallback estimates) | 2-4 hours | P0 |
| Phase 4: Workflow UI | ❌ NOT STARTED | 1 hour | P2 |
| Phase 5: Decision Logging | ❌ NOT STARTED | 1.5 hours | P2 |
| Phase 6: Artifacts | ⚠️ PARTIAL (generates, display pending) | 2 hours | P1 |
| Phase 7: Chart API | ❌ NOT STARTED | 1.5 hours | P1 |
| Phase 8: Metrics | ❌ NOT STARTED | 1 hour | P2 |
| Phase 9: Dataset Linking | ✅ **FIXED** (Dec 8) | 30 min | P0 |
| **TOTAL** | **2 complete, 3 partial, 4 pending** | **~7 hours remaining** | - |

### **Session Fixes Applied (Dec 8, 2025)**:

1. ✅ **Multi-file Upload Duplicate Data - FIXED**
   - File: `client/src/pages/data-step.tsx`
   - Issue: sampleData vs preview priority was wrong
   - Fix: Changed to `data.sampleData || data.project?.preview`

2. ✅ **Journey Resume 409 Error Handling - FIXED**
   - File: `client/src/pages/user-dashboard.tsx`
   - Issue: 409 Conflict not handled, no redirect to approvals
   - Fix: Added pendingCheckpoints detection and auto-redirect

3. ✅ **Approvals Tab Routing - FIXED**
   - File: `client/src/pages/project-page.tsx`
   - Issue: URL param ?tab=approvals not recognized
   - Fix: Added to allowedTabs, mapped to agents tab

4. ✅ **View Statistics Page Buttons - FIXED**
   - File: `client/src/pages/descriptive-stats-page.tsx`
   - Issue: Export, Generate Visualizations buttons had no handlers
   - Fix: Added all handlers, replaced Analysis Paths with project summary

5. ✅ **TypeScript Error - FIXED**
   - File: `server/routes/project.ts:2816`
   - Issue: Type mismatch on dataCandidate
   - Fix: Added explicit `: any` type annotation

### **Remaining Critical Issues**:

1. 🔴 **Hardcoded Price Estimates** (PENDING)
   - Location: Billing display on project page
   - Issue: Prices don't match journey estimates
   - Fix needed: Integrate UnifiedBillingService

2. 🟡 **Chart Generation API** (PENDING)
   - Endpoint needed: POST `/api/visualization/:id/generate-chart`
   - Service exists: `enhanced-visualization-engine.ts`

3. 🟡 **Decision Trail Recording** (PENDING)
   - Table exists: `decisionAudits`
   - Service needed: `decision-logger.ts` integration

4. 🟡 **Upload SLA Metrics** (PENDING)
   - Endpoint needed: `/api/performance/metrics/my-uploads`

### **What This Document Contains**:

✅ Comprehensive root cause analysis for all 8 dashboard issues
✅ Detailed implementation code for all phases
✅ Database migration scripts
✅ Service integration patterns
✅ Testing procedures
✅ SQL verification queries
✅ **Dec 8 session fixes documented**

### **Recommended Next Action**:

**Priority 1 - Billing Integration** (2-3 hours):
1. Fix hardcoded price estimates on project page
2. Integrate UnifiedBillingService for real cost calculation

**Priority 2 - Missing APIs** (2-3 hours):
3. Create chart generation API endpoint
4. Add performance metrics tracking

**Priority 3 - Polish** (2 hours):
5. Workflow UI verification
6. Decision logging integration

---

**Document Status**: ✅ Analysis Complete | ⚠️ **~40% IMPLEMENTED** | Remaining: ~7 hours
