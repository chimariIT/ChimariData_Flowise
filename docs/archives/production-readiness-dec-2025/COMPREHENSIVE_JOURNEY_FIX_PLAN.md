# Comprehensive User Journey Fix Plan

**Created:** December 18, 2025
**Last Updated:** December 19, 2025
**Status:** ACTION REQUIRED - CRITICAL BLOCKERS IDENTIFIED
**Problem:** End-to-end user journey has not been successfully tested for 6 months due to data continuity issues across all steps.

## December 19, 2025 Update - NEW CRITICAL ISSUES DISCOVERED

After reviewing error screenshots and console logs from `error_images/user journey/`, I've identified **7 critical blockers** that must be fixed before the journey can work:

### CRITICAL BLOCKERS (Must Fix First)

| Priority | Issue | File | Impact |
|----------|-------|------|--------|
| **P0-1** | CORS missing PATCH method | `server/middleware/security-headers.ts:227` | ALL progress updates blocked |
| **P0-2** | Infinite loop in prepare-step | `client/src/pages/prepare-step.tsx` | Browser freezes, 400+ API calls |
| **P0-3** | PII exclusions 500 error | `server/routes/project.ts` | PII filtering doesn't work |

### DATA FLOW ISSUES

| Priority | Issue | Root Cause | Impact |
|----------|-------|------------|--------|
| **P1-1** | Full joined dataset not persisted | Only 50-row preview stored | Transformation/Execute have incomplete data |
| **P1-2** | PII removal after join | Join uses original data with PII | Joined dataset contains PII columns |
| **P1-3** | Required Data Elements not mapped | DataElementsMappingUI not rendered | No link between business elements and columns |
| **P1-4** | Analysis recommendations regenerated | API regenerates instead of using locked | Different analyses shown in each step |

### STEP-SPECIFIC ISSUES

| Issue | From Screenshot | Root Cause |
|-------|-----------------|------------|
| Verification shows 15 columns (individual) not 27 (joined) | Data Verification Schema.PNG | Falls back to individual datasets |
| Transformation shows "Action Required: Join datasets" | Data Transformation step Action Required.PNG | Join not persisted from Upload |
| Analysis Execution Failed: "datasets not joined" | Analysis Execution Failed.PNG | Execute uses individual datasets |
| Transformation shows different analyses than Prepare | Recommended Planned Analysis.PNG | Requirements regenerated per-step |

---

**Antigravity Review:** I have analyzed the codebase and confirmed that the issues stem from a three-way split in state management between the `projects` table (`journeyProgress` column), the `project_sessions` table (managed via `useProjectSession`), and `localStorage`. The current implementation relies on complex heuristics (e.g., `extractRowsForTransformation`) that often pick stale or incorrect data sources when one is missing.
---

## Executive Summary

The user journey suffers from a **systemic lack of data continuity**. Each step independently loads data from different sources, causing:
1. Goals/Questions promised in one step differ in later steps
2. Recommended analyses change between Prepare and Execute
3. Joined datasets differ between Verification and Transformation
4. Billing calculations may be inaccurate due to mock values
5. Results don't trace back to original questions
6. Projects may not appear on dashboard immediately

---

## Journey Step Analysis

### Complete Journey Flow

```
┌──────────────┐     ┌─────────┐     ┌────────┐     ┌─────────────┐     ┌─────────────────┐
│ Project      │────▶│  Data   │────▶│Prepare │────▶│ Verification│────▶│ Transformation  │
│ Setup        │     │ Upload  │     │ Step   │     │    Step     │     │     Step        │
└──────────────┘     └─────────┘     └────────┘     └─────────────┘     └─────────────────┘
       │                  │               │                │                    │
       │                  │               │                │                    │
       ▼                  ▼               ▼                ▼                    ▼
   Creates          Uploads        Defines goals     Validates data       Maps elements
   project          datasets       & questions       quality & PII        to columns
                    Joins data     Gets analysis     Approves schema
                                   recommendations

┌─────────┐     ┌───────────┐     ┌──────────────────┐     ┌─────────────┐     ┌─────────────┐
│  Plan   │────▶│  Execute  │────▶│ Results Preview  │────▶│  Pricing &  │────▶│   Results   │
│  Step   │     │   Step    │     │     Step         │     │  Payment    │     │    Step     │
└─────────┘     └───────────┘     └──────────────────┘     └─────────────┘     └─────────────┘
     │               │                   │                       │                  │
     │               │                   │                       │                  │
     ▼               ▼                   ▼                       ▼                  ▼
  Creates       Runs Python         Shows preview           Stripe            Full results
  analysis      analysis            of results              payment           & artifacts
  plan          scripts             before payment          flow              for download
```

---

## Issue Inventory By Category

### A. Goals, Questions & Recommended Analysis

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| A.1 | Project Setup | Loads goals/questions from localStorage | Different data than DB | `project-setup-step.tsx:102-119` |
| A.2 | Prepare | Saves questions to localStorage AND session | Multiple sources of truth | `prepare-step.tsx` |
| A.3 | Verification | Loads required-data-elements endpoint fresh | May regenerate different analysis path | `data-verification-step.tsx:338-346` |
| A.4 | Transformation | Reloads requirements from API | Analysis path may differ from Prepare | `data-transformation-step.tsx:234-282` |
| A.5 | Execute | Loads questions from DB OR localStorage fallback | May get different questions | `execute-step.tsx:150-200` |
| A.6 | Plan | Creates new plan via POST if not found | Plan may differ from Prepare recommendations | `plan-step.tsx:149` |

**Root Cause:** Questions and analysis recommendations stored in multiple places:
- `localStorage.chimari_analysis_questions`
- `localStorage.chimari_analysis_goals`
- `project.journeyProgress.requirementsDocument`
- `project_questions` table
- Session storage via `useProjectSession`

### B. Data (Datasets, Previews, PII, Joins, Transformations)

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| B.1 | Upload | Creates joined preview but may not persist | Later steps rebuild joins | `server/routes/project.ts` upload handler |
| B.2 | Verification | Rebuilds schema from datasets if no joinedSchema | Different column count than Upload showed | `data-verification-step.tsx:226-273` |
| B.3 | Transformation | Auto-detects join keys AGAIN | May detect different join columns | `data-transformation-step.tsx:196-231` |
| B.4 | Transformation | Loads required elements fresh | May not match Prepare step elements | `data-transformation-step.tsx:234-270` |
| B.5 | Verification | PII decision saved to project.metadata | May not be read by Transformation | `data-verification-step.tsx:397-498` |
| B.6 | Execute | Extracts dataset rows with priority system | May use different data than Transformation approved | `analysis-execution.ts:extractDatasetRows()` |

**Root Cause:** Joined dataset stored in multiple locations:
- `datasets[].preview` (per-dataset)
- `datasetsResponse.joinedPreview` (ephemeral, not persisted)
- `project.journeyProgress.joinedData` (not always populated)
- `dataset.ingestionMetadata.transformedData` (after transformation)

### C. Analysis (Pipeline & Methodology)

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| C.1 | Prepare | Analysis recommendations generated by AI | Not persisted, regenerated each step | `required-data-elements-routes.ts:283-411` |
| C.2 | Execute | selectedAnalyses auto-selected | User may not confirm which analyses | `execute-step.tsx:322-330` |
| C.3 | Execute | Question-to-analysis mapping not enforced | Results may not answer original questions | `analysis-execution.ts:109-119` |
| C.4 | Plan | Plan creation generates new analysis steps | May differ from DS agent recommendations | `plan-step.tsx:180-243` |

**Root Cause:** Analysis configuration regenerated at multiple points:
- Prepare step generates recommendations
- Plan step creates analysis plan (may differ)
- Execute step auto-selects analyses (may differ)

### D. Results & Artifacts

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| D.1 | Results | Results loaded from execution results only | No evidence chain to questions | `results-step.tsx:59-98` |
| D.2 | Results | Artifacts may be empty if orchestrator fails | Users see no output after paying | `artifact-generator.ts:474-996` |
| D.3 | Results | No "How we answered this" section | Can't trace insight to question | `UserQuestionAnswers.tsx` |
| D.4 | Preview | Preview uses session data only | May show different preview than actual results | `results-preview-step.tsx:51-109` |

**Root Cause:** Results don't link back to original questions:
- `AnalysisResults.questionAnswers` may be empty
- No `questionId` in insights to trace back
- Artifacts generated without question context

### E. Billing & Pricing

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| E.1 | Pricing | Returns mock/zero values | Inaccurate cost display | `unified-billing-service.ts:2354-2380` |
| E.2 | Payment | Falls back to hardcoded $50 | Wrong amount charged | `payment.ts:72-76` |
| E.3 | Pricing | lockedCostEstimate may be undefined | Uses fallback pricing | `payment.ts:72-76` |
| E.4 | Execute | Execution costs not tracked | Usage metrics incomplete | `cost-tracking.ts:281-355` |

**Root Cause:** Cost estimation pipeline incomplete:
- `project.lockedCostEstimate` not always set
- `project.costEstimation` not always set
- Billing service returns zeros in getUserUsage()

### F. Project Dashboard & Resume

| Issue ID | Step | Problem | Impact | Current Location |
|----------|------|---------|--------|------------------|
| F.1 | Dashboard | Projects loaded via API query | May not show until cache invalidates | `user-dashboard.tsx:66-80` |
| F.2 | Dashboard | Resume uses journeyState API | If state incomplete, resume fails | `user-dashboard.tsx:110-130` |
| F.3 | Resume | getResumeRoute() calculates route | May route to wrong step | `utils/journey-routing.ts` |
| F.4 | Project Page | Incomplete journeys show empty tabs | User confused about progress | `project-page.tsx` |

**Root Cause:** Journey state not consistently tracked:
- `project.stepCompletionStatus` may be out of sync
- `journeyState.canResume` logic may be incorrect
- No clear indicator of which step is next

---

## Antigravity's Critique & Additional Technical Details

### 1. Session Convergence Strategy
The current `project_sessions` table and `useProjectSession` hook were intended to provide a "tamper-proof" session, but they have drifted from the `projects` table. 
- **Recommendation:** Consolidate `project_sessions` data into `projects.journeyProgress`.
- **Action:** Deprecate `project_sessions` and update the backend to use `journeyProgress` as the single source of truth for both the project data and the active session state.

### 2. Atomic Journey State Updates
To prevent "last-write-wins" issues where a frontend update might wipe out backend agent progress:
- **Recommendation:** Use JSONB merge operations in PostgreSQL/Drizzle.
- **Action:** Implement a `PATCH /api/projects/:id/progress` endpoint that performs a deep merge of the provided JSON into `journeyProgress` using `jsonb_set` or similar logic.

### 3. Frontend State Management Overhaul
`localStorage` usage is currently required because the React state is lost on refresh and the DB isn't sempre updated.
- **Recommendation:** Move from `useProjectSession` + `localStorage` to **TanStack Query** (React Query) synchronization.
- **Action:** Ensure every step uses the `useProject(id)` query which fetches from the DB. Use `staleTime: Infinity` during a journey to ensure the UI stays consistent, but invalidate on every successful step completion.

### 4. Data "Extraction" Heuristic Cleanup
`extractRowsForTransformation` in `server/routes/project.ts` checks 6 different fields.
- **Critique:** This is dangerous. It should *only* ever look at `journeyProgress.joinedData` after the upload/join step, or `journeyProgress.transformedData` after the transformation step.
- **Action:** Refactor all "execute" and "transform" logic to strictly use the paths defined in the `JourneyProgress` interface.

### 5. Deep Dive on Architectural Considerations (Reviewing Claude's Points)

#### 5.1 Architecture: Single Source of Truth
Using `project.journeyProgress` (JSONB) is the most pragmatic choice for Chimari at its current scale. 
- **Comparison:** A dedicated `journey_state` table would offer slightly better typing and constraint checking, while Redis would offer lower latency. However, given our journey steps happen over minutes/hours, the 10-50ms of SQL overhead is negligible.
- **Verdict:** Stick with `journeyProgress` but enforce a strict Zod schema on both frontend and backend to avoid JSON drift.

#### 5.2 Migration Strategy: "Lazy Migration"
Existing projects will break if they don't have the new `journeyProgress` structure.
- **Strategy:** Implement a **Middleware or Ingestion Layer** in `storage.getProject`. When a project is loaded, if `journeyProgress` is empty but legacy fields (`status`, `metadata`) contain data, run an on-the-fly "upgrader" that populates the progress object and saves it back. 
- **Risk:** High if legacy fields are deleted before migration. We should keep legacy fields for one release cycle during transition.

#### 5.3 Performance: "Lean State" Pattern
Loading a nested 1MB JSON object on every API call (like the dashboard project list) *will* slow down the app.
- **Strategy:** 
  1. **Strictly Limit Preview Size:** Store only the first 5-10 rows in `journeyProgress`. Move full joined/transformed data to separate `datasets` table entries or file storage.
  2. **Selective Selection:** Update the Dashboard API to *exclude* the `journeyProgress` column, fetching it only when viewing or resuming a specific project.

#### 5.4 Prioritization: Blockers First
The current order (**Continuity → Traceability → Billing → Dashboard**) is optimal because:
1. **Continuity** is a functional blocker; without it, the app is broken.
2. **Traceability** is a value blocker; without it, the user doesn't trust the output.
3. **Billing/Dashboard** are operational/UX polish.

#### 5.5 Missing Issues: Agent State Sync
One critical item missed: **Multi-agent coordination state**. 
- **Observation:** Agents might update `project.multiAgentCoordination` or `project.agentExecutionState`. 
- **Conflict:** If a user is on a step and an agent completes a task, who wins during the next save?
- **Action:** The new `PATCH /api/projects/:id/progress` endpoint must support **Deep Merging** of JSONB so that user-driven progress updates don't overwrite agent-driven metadata updates.

---

## Solution Architecture

### Single Source of Truth: `project.journeyProgress`

All journey data must flow through `project.journeyProgress`:

```typescript
interface JourneyProgress {
  // Step tracking
  currentStep: string;
  completedSteps: string[];
  stepTimestamps: Record<string, string>;

  // Project Setup outputs
  projectName: string;
  projectDescription: string;

  // Data Upload outputs
  uploadedDatasetIds: string[];
  joinedData: {
    schema: Record<string, any>;
    preview: any[];
    joinConfig: JoinConfig;
    joinInsights: any;
    columnCount: number;
    rowCount: number;
    persistedAt: string;
  };

  // Prepare Step outputs (CRITICAL - must be persisted ONCE)
  analysisGoal: string;
  userQuestions: Array<{
    id: string;
    text: string;
    category?: string;
  }>;
  selectedAnalysisTypes: string[];
  audience: {
    primary: string;
    secondary: string[];
    decisionContext: string;
  };

  // Requirements Document (generated ONCE in Prepare, never regenerated)
  requirementsDocument: {
    analysisPath: AnalysisPathItem[];
    requiredDataElements: RequiredDataElement[];
    questionAnswerMapping: QuestionAnswerMapping[];
    completeness: CompletenessStatus;
    gaps: Gap[];
    generatedAt: string;
    version: number;
    generatedBy: 'data_scientist_agent';
  };

  // Verification Step outputs
  piiDecision: {
    excludedColumns: string[];
    anonymizedColumns: string[];
    decisionTimestamp: string;
  };
  dataQualityScore: number;
  dataQualityApproved: boolean;
  schemaValidated: boolean;

  // Transformation Step outputs
  transformationMappings: TransformationMapping[];
  transformedDatasetId: string;
  transformedSchema: Record<string, string>;
  transformationApprovedAt: string;

  // Plan Step outputs
  analysisPlanId: string;
  planApprovedAt: string;

  // Execute Step outputs
  executionId: string;
  executionConfig: {
    selectedAnalyses: string[];
    confirmedAt: string;
  };
  executionStartedAt: string;
  executionCompletedAt: string;

  // Results
  analysisResultsId: string;
  artifactIds: string[];

  // Billing
  costEstimate: {
    amount: number;
    currency: string;
    lockedAt: string;
  };
  paymentStatus: 'pending' | 'paid' | 'failed';
  paymentId: string;
}
```

---

## Implementation Phases

### Phase 1: Critical Data Continuity (MUST FIX FIRST)

#### Fix 1.1: Persist Joined Data at Upload Time
**Files:** `server/routes/project.ts`

```typescript
// After processing uploaded files:
const joinedResult = await datasetJoiner.joinDatasets(datasets);

await storage.updateProject(projectId, {
  journeyProgress: {
    ...existingProgress,
    joinedData: {
      schema: joinedResult.schema,
      preview: joinedResult.preview.slice(0, 100),
      joinConfig: joinedResult.config,
      joinInsights: joinedResult.insights,
      columnCount: Object.keys(joinedResult.schema).length,
      rowCount: joinedResult.totalRows,
      persistedAt: new Date().toISOString()
    }
  }
} as any);
```

#### Fix 1.2: Persist Requirements Document ONCE in Prepare
**Files:** `server/routes/required-data-elements-routes.ts`

```typescript
// GET endpoint should NEVER regenerate if document exists
router.get("/:id/required-data-elements", async (req, res) => {
  const storedDoc = journeyProgress.requirementsDocument;

  if (storedDoc) {
    return res.json({
      success: true,
      document: storedDoc,
      fromCache: true
    });
  }

  // ONLY generate if called from prepare step with explicit flag
  if (req.query.generateNew !== 'true') {
    return res.status(404).json({
      success: false,
      error: "Requirements not found. Complete Prepare step first.",
      redirectTo: `/journeys/${journeyType}/prepare`
    });
  }

  // Generate and persist...
});
```

#### Fix 1.3: All Steps Read from journeyProgress, Never Regenerate
**Files:** All step components (`data-verification-step.tsx`, `data-transformation-step.tsx`, `execute-step.tsx`)

```typescript
// BEFORE (broken):
const reqElements = await apiClient.get(`/api/projects/${pid}/required-data-elements`);

// AFTER (fixed):
const project = await apiClient.getProject(projectId);
const reqElements = project.journeyProgress?.requirementsDocument;
if (!reqElements) {
  toast({ title: "Please complete Prepare step first" });
  setLocation(`/journeys/${journeyType}/prepare`);
  return;
}
```

### Phase 2: Question-to-Results Traceability

#### Fix 2.1: Persist Questions to Database in Prepare Step
**Files:** `client/src/pages/prepare-step.tsx`, `server/routes/project.ts`

```typescript
// Frontend - when user confirms questions:
await apiClient.post(`/api/projects/${projectId}/questions`, {
  questions: userQuestions.map((q, idx) => ({
    id: `q-${idx}`,
    text: q.text,
    category: q.category
  }))
});

// Also update journeyProgress
await apiClient.put(`/api/projects/${projectId}`, {
  journeyProgress: {
    ...currentProgress,
    userQuestions: userQuestions,
    questionsConfirmedAt: new Date().toISOString()
  }
});
```

#### Fix 2.2: Link Insights to Questions in Analysis Execution
**Files:** `server/services/analysis-execution.ts`

```typescript
// When generating insights, link back to questions:
const insightsWithQuestions = insights.map(insight => ({
  ...insight,
  answersQuestions: questionAnswerMapping
    .filter(qa => qa.recommendedAnalyses.includes(insight.analysisType))
    .map(qa => qa.questionId)
}));
```

#### Fix 2.3: Display "How We Answered" in Results
**Files:** `client/src/components/UserQuestionAnswers.tsx`

```typescript
// Show question → insight → methodology chain
{questions.map(q => {
  const relatedInsights = insights.filter(i =>
    i.answersQuestions?.includes(q.id)
  );
  return (
    <QuestionCard question={q} insights={relatedInsights} />
  );
})}
```

### Phase 3: Billing & Payment Accuracy

#### Fix 3.1: Calculate Real Costs Based on Actual Data
**Files:** `server/services/billing/unified-billing-service.ts`

```typescript
// Replace mock values with real calculations:
async getUserUsageSummary(userId: string) {
  // Get actual dataset sizes
  const datasets = await storage.getUserDatasets(userId);
  const totalSizeMB = datasets.reduce((sum, ds) => sum + (ds.sizeMB || 0), 0);

  // Get actual executions
  const executions = await db.select().from(agentExecutions)
    .where(eq(agentExecutions.userId, userId));

  return {
    dataUsage: { totalUploadSizeMB: totalSizeMB },
    computeUsage: { toolExecutions: executions.length }
  };
}
```

#### Fix 3.2: Lock Cost Estimate Before Execute Step
**Files:** `client/src/pages/execute-step.tsx`, `server/routes/analysis-execution.ts`

```typescript
// Before running analysis, lock the cost:
const costBreakdown = await apiClient.post('/api/billing/journey-breakdown', {
  journeyType,
  datasetSizeMB,
  analysisCount: selectedAnalyses.length
});

await apiClient.put(`/api/projects/${projectId}`, {
  lockedCostEstimate: costBreakdown.totalCost,
  costLockedAt: new Date().toISOString()
} as any);
```

### Phase 4: Project Dashboard & Resume

#### Fix 4.1: Invalidate React Query Cache After Project Creation
**Files:** `client/src/pages/project-setup-step.tsx`

```typescript
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

// After creating project:
queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
```

#### Fix 4.2: Accurate Journey State for Resume
**Files:** `server/routes/project.ts`, `client/src/utils/journey-routing.ts`

```typescript
// Calculate next step from journeyProgress:
function getNextStep(progress: JourneyProgress): string {
  const stepOrder = ['setup', 'data', 'prepare', 'verification', 'transformation', 'plan', 'execute', 'preview', 'pricing', 'results'];

  for (const step of stepOrder) {
    if (!progress.completedSteps?.includes(step)) {
      return step;
    }
  }
  return 'results';
}
```

---

## Implementation Order

### Week 1: Critical Path (Fixes 1.1 - 1.3)
1. Persist joined data at upload
2. Make requirements document read-only after Prepare
3. Update all steps to read from journeyProgress

### Week 2: Question Traceability (Fixes 2.1 - 2.3)
4. Persist questions to database
5. Link insights to questions
6. Add "How We Answered" UI

### Week 3: Billing & Dashboard (Fixes 3.1 - 4.2)
7. Calculate real costs
8. Lock cost estimates
9. Fix dashboard cache invalidation
10. Accurate resume routing

---

## Validation Checklist

After implementing fixes, verify:

### Data Continuity
- [ ] Upload 2 CSV files → Verification shows SAME column count as Upload
- [ ] Questions entered in Prepare → EXACT same questions in Execute
- [ ] Analysis types shown in Prepare → SAME types in Execute
- [ ] Required data elements in Prepare → SAME elements in Transformation
- [ ] PII exclusion in Verification → Columns NOT in final dataset

### Question Traceability
- [ ] Each question shows which insight answers it
- [ ] Each insight shows which question(s) it addresses
- [ ] Results page has "How We Answered Your Questions" section

### Billing Accuracy
- [ ] Pricing step shows real cost based on data size
- [ ] Payment amount matches pricing step
- [ ] Usage metrics update after execution

### Dashboard & Resume
- [ ] New project appears on dashboard immediately
- [ ] Incomplete journey shows correct "Resume" button
- [ ] Resume routes to correct step
- [ ] Project page shows accurate progress indicator

---

## Files Modified Summary

| File | Priority | Changes |
|------|----------|---------|
| `server/routes/project.ts` | P1 | Persist joined data at upload |
| `server/routes/required-data-elements-routes.ts` | P1 | Read-only after generation |
| `client/src/pages/data-verification-step.tsx` | P1 | Read from journeyProgress |
| `client/src/pages/data-transformation-step.tsx` | P1 | Read from journeyProgress |
| `client/src/pages/execute-step.tsx` | P1 | Read from journeyProgress |
| `client/src/pages/prepare-step.tsx` | P2 | Save questions to DB |
| `server/services/analysis-execution.ts` | P2 | Link insights to questions |
| `client/src/components/UserQuestionAnswers.tsx` | P2 | Show question→insight chain |
| `server/services/billing/unified-billing-service.ts` | P3 | Real cost calculations |
| `client/src/pages/pricing-step.tsx` | P3 | Lock cost before execute |
| `client/src/pages/project-setup-step.tsx` | P3 | Invalidate query cache |
| `client/src/utils/journey-routing.ts` | P3 | Accurate resume logic |

---

## Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | Critical Data Continuity | 8-12 hours |
| Phase 2 | Question Traceability | 6-8 hours |
| Phase 3 | Billing & Payment | 4-6 hours |
| Phase 4 | Dashboard & Resume | 3-4 hours |
| Testing | End-to-end validation | 4-6 hours |
| **Total** | | **25-36 hours** |

---

## Risk Mitigation

1. **Backward Compatibility**: Existing projects may have old data structure. Add migration script to populate `journeyProgress` from existing fields.

2. **Data Loss**: If user refreshes mid-step, ensure all data is persisted to DB, not just session/localStorage.

3. **Performance**: Loading full `journeyProgress` on each step could be slow. Consider partial loading or caching.

4. **Testing**: Create E2E test that runs complete journey with real data to verify all fixes work together.

---

---

## Detailed Task Checklist

### Part 1: Backend Infrastructure & Data Persistence
- [ ] **Database Schema Alignment**
  - [ ] Verify `journeyProgress` JSONB column exists and has proper indexing.
  - [ ] Create a migration to copy data from `project_sessions` to `journeyProgress` for existing projects.
- [ ] **Unified Progress API**
  - [ ] Implement `PATCH /api/projects/:id/progress` for atomic JSONB merging.
  - [ ] Refactor `storage.updateProject` to handle deep merging of `journeyProgress`.
- [ ] **Requirement Generation Persistence**
  - [ ] Update `required-data-elements-routes.ts` to check `journeyProgress.requirementsDocument` before calling AI agents.
  - [ ] Implement the `generateNew=true` flag logic to allow explicit regeneration.

### Part 2: Frontend "Single Source of Truth" implementation
- [ ] **Query Hook Refactor**
  - [ ] Create/Update `useProject` hook to fetch full project data including `journeyProgress`.
  - [ ] Deprecate `useProjectSession` in favor of shared TanStack Query state.
- [ ] **Step Data Binding**
  - [ ] `DataStep`: Persist `joinedData` directly to `journeyProgress` immediately after upload/join.
  - [ ] `PrepareStep`: Save `userQuestions` and `analysisGoal` to `journeyProgress` (removing `localStorage` dependency).
  - [ ] `VerificationStep`: Read schema ONLY from `journeyProgress.joinedData`.
  - [ ] `TransformationStep`: Save `transformationMappings` and resulting dataset ID to `journeyProgress`.

### Part 3: Execution & Traceability
- [ ] **Analysis Execution Refactor**
  - [ ] Modify `analysis-execution.ts` to strictly take `journeyProgress.transformedDatasetId` as input.
  - [ ] Ensure `AnalysisResults` are tagged with `questionId` from `journeyProgress.userQuestions`.
- [ ] **Traceability UI**
  - [ ] Update `ResultsStep` to render the "How We Answered Your Questions" component using `questionAnswerMapping`.

### Part 4: Billing, Project Management & Performance
- [ ] **Billing Service Fixes**
  - [ ] Replace mock values in `unified-billing-service.ts` with real `datasetSizeMB` and `computeUsage`.
- [ ] **Dashboard Sync & Performance**
  - [ ] Add `queryClient.invalidateQueries(['/api/projects'])` to the project creation success handler.
  - [ ] Update Dashboard API to exclude the `journeyProgress` blob for faster loading.
  - [ ] Update `journey-routing.ts` to use `journeyProgress.completedSteps` for resume logic.

### Part 5: Migration & Sustainability
- [ ] **Legacy Data Migration**
  - [ ] Implement a "lazy migration" utility in the `getProject` storage method.
  - [ ] Write a one-time migration script for the production database to initialize `journeyProgress` for all active projects.
- [ ] **Schema Enforcement**
  - [ ] Define the `JourneyProgress` interface in `shared/schema.ts` and ensure it's synced with the Drizzle schema.

### Part 5: E2E Verification
- [ ] **Automated Test Suite**
  - [ ] Create a Playwright test that completes a full 2-file join journey.
  - [ ] Verify that refresh at any step (Verification, Plan, Execute) maintains identical state.
- [ ] **Data Integrity Audit**
  - [ ] Verify no instances of `chimari_*` remain in `localStorage` after a journey completes.

---

## Platform-Wide Issues (Expanded Scope)

### G. Admin Components & Features

| Issue ID | Component | Problem | Impact | Current Location |
|----------|-----------|---------|--------|------------------|
| G.1 | Admin Dashboard | Stats widgets may show mock/placeholder data | Admins see incorrect metrics | `server/routes/admin.ts:112-180` |
| G.2 | User Management | Role changes may not cascade to active sessions | Users retain old permissions | `server/routes/admin.ts:getUserStats()` |
| G.3 | Agent Management | Agent status shows as "mock" or placeholder | Can't verify real agent health | `admin.ts:getAgentStatus()` |
| G.4 | System Health | Python bridge health check may return stale status | System appears healthy when broken | `admin.ts:systemHealth endpoint` |
| G.5 | Subscription Sync | Stripe tier sync trigger may fail silently | Billing tiers out of sync | `server/routes/admin-billing.ts` |
| G.6 | Billing Analytics | Revenue calculations may use mock values | Incorrect revenue reports | `unified-billing-service.ts:getAdminStats()` |
| G.7 | Template Management | Template seeding may fail without feedback | Missing journey templates | `scripts/seed-templates.ts` |

**Root Cause:** Admin endpoints often use placeholders/mock data patterns similar to user-facing endpoints. System health checks may not reflect actual service state.

### H. Authentication & Security

| Issue ID | Component | Problem | Impact | Current Location |
|----------|-----------|---------|--------|------------------|
| H.1 | Setup Admin | `/api/auth/setup-admin` endpoint unprotected in production | Anyone can create admin | `server/routes/auth.ts:1101-1183` |
| H.2 | Test Endpoints | `/api/auth/login-test` available in all environments | Security vulnerability | `server/routes/auth.ts:559-606` |
| H.3 | Password Reset | Reset tokens stored in-memory only | Lost on server restart | `server/routes/auth.ts:resetTokens Map` |
| H.4 | Reset Code | 6-digit reset codes vulnerable to brute force | Account takeover risk | `server/routes/auth.ts:generateResetCode()` |
| H.5 | Debug Logging | Excessive auth logging in production | Log file bloat, PII exposure | `server/routes/auth.ts` (multiple) |
| H.6 | Session Config | Session cookie may lack secure flags in production | Session hijacking risk | `server/index.ts:sessionConfig` |
| H.7 | OAuth Callbacks | OAuth error handling may expose internal errors | Information disclosure | `server/oauth-config.ts` |
| H.8 | Rate Limiting | Auth rate limiter may be disabled in development | Easy to overlook in deployment | `server/middleware/rate-limiter.ts` |

**Critical Fixes Required:**
```typescript
// H.1 FIX: Protect setup-admin in production
router.post('/api/auth/setup-admin', (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_SETUP_ADMIN) {
    return res.status(403).json({ error: 'Setup admin disabled in production' });
  }
  next();
}, handleSetupAdmin);

// H.3 FIX: Move reset tokens to database
// Create table: password_reset_tokens (user_id, token_hash, expires_at, used)

// H.4 FIX: Use longer, cryptographically secure tokens
const resetToken = crypto.randomBytes(32).toString('base64url'); // Instead of 6-digit
```

### I. Agent System & Real-time Communication

| Issue ID | Component | Problem | Impact | Current Location |
|----------|-----------|---------|--------|------------------|
| I.1 | Checkpoint Storage | Checkpoints stored in-memory only | Lost on server restart | `server/services/agents/message-broker.ts` |
| I.2 | User ID Broadcast | `userId = 'user_placeholder'` in bridge | Checkpoints sent to all users | `realtime-agent-bridge.ts:98-100` |
| I.3 | Dual WebSocket | Both native `ws` and Socket.IO initialized | Confusion, resource waste | `server/index.ts` |
| I.4 | Timeout Configuration | 5-minute default checkpoint timeout | Poor UX for real-time feedback | `message-broker.ts` |
| I.5 | Redis Fallback | In-memory fallback loses coordination state | Multi-instance deployments broken | `message-broker.ts:getRedis()` |
| I.6 | Agent Health | No persistent health metrics for agents | Can't track agent performance | `project-agent-orchestrator.ts` |
| I.7 | Error Recovery | Agent failures not persisted for retry | Lost work on crash | `journey-execution-machine.ts` |
| I.8 | WebSocket Auth | WebSocket connections may not verify auth | Unauthorized subscriptions | `server/index.ts:WebSocket upgrade` |

**Architecture Decision: WebSocket Consolidation**
```
Current State:
  - Native `ws` library (primary, used by realtime-agent-bridge)
  - Socket.IO (secondary, installed but underutilized)

Recommendation:
  - Keep native `ws` as primary (lighter, faster)
  - Remove Socket.IO dependencies OR
  - Migrate fully to Socket.IO for built-in rooms/namespaces
```

**Critical Fixes Required:**
```typescript
// I.1 FIX: Persist checkpoints to database
// Create table: agent_checkpoints (id, project_id, agent_type, checkpoint_type, data, status, created_at)

// I.2 FIX: Get real user ID from WebSocket connection
const userId = socket.user?.id || session?.userId;
if (!userId) {
  console.warn('[RealtimeAgentBridge] Cannot send checkpoint: no userId');
  return;
}

// I.8 FIX: Verify auth on WebSocket upgrade
wss.on('connection', (ws, req) => {
  const session = await getSessionFromCookie(req);
  if (!session?.userId) {
    ws.close(4001, 'Unauthorized');
    return;
  }
  ws.userId = session.userId;
});
```

---

## Implementation Phases (Updated with Platform-Wide Fixes)

### Phase 1: Critical Data Continuity (MUST FIX FIRST)
*Original fixes 1.1 - 1.3 remain unchanged*

### Phase 2: Question-to-Results Traceability
*Original fixes 2.1 - 2.3 remain unchanged*

### Phase 3: Billing & Payment Accuracy
*Original fixes 3.1 - 3.2 remain unchanged*

### Phase 4: Project Dashboard & Resume
*Original fixes 4.1 - 4.2 remain unchanged*

### Phase 5: Security Hardening (NEW)

#### Fix 5.1: Protect Admin Setup Endpoint
**Files:** `server/routes/auth.ts`
- Add production check to `/api/auth/setup-admin`
- Require `ALLOW_SETUP_ADMIN=true` env var for production setup

#### Fix 5.2: Persistent Password Reset Tokens
**Files:** `server/routes/auth.ts`, `shared/schema.ts`
- Create `password_reset_tokens` table
- Move reset tokens from in-memory Map to database
- Use 32-byte cryptographically secure tokens (not 6-digit codes)

#### Fix 5.3: Environment-Conditional Test Endpoints
**Files:** `server/routes/auth.ts`
- Wrap `/api/auth/login-test` with `NODE_ENV !== 'production'` check
- Remove all other test-only endpoints from production builds

#### Fix 5.4: Reduce Auth Debug Logging
**Files:** `server/routes/auth.ts`
- Move detailed auth logging behind `ENABLE_DEBUG_LOGGING` flag
- Ensure no PII in production logs

### Phase 6: Agent System Reliability (NEW)

#### Fix 6.1: Persist Checkpoints to Database
**Files:** `server/services/agents/message-broker.ts`, `shared/schema.ts`
- Create `agent_checkpoints` table
- Store checkpoint data with project_id, user_id, status
- Enable recovery after server restart

#### Fix 6.2: Fix User ID in Realtime Bridge
**Files:** `server/services/agents/realtime-agent-bridge.ts`
- Get userId from WebSocket connection context
- Only send checkpoints to the user who owns the project
- Fall back to project owner if session unavailable

#### Fix 6.3: WebSocket Authentication
**Files:** `server/index.ts`
- Verify session on WebSocket upgrade
- Attach userId to WebSocket connection
- Close unauthorized connections

#### Fix 6.4: Reduce Checkpoint Timeout
**Files:** `server/services/agents/message-broker.ts`
- Reduce default timeout from 5 minutes to 60 seconds
- Add configurable timeout per checkpoint type

### Phase 7: Admin Component Accuracy (NEW)

#### Fix 7.1: Real Admin Dashboard Stats
**Files:** `server/routes/admin.ts`
- Replace mock stats with actual database queries
- Get real user counts, project counts, active sessions

#### Fix 7.2: Agent Health from Service
**Files:** `server/routes/admin.ts`, `server/services/agent-initialization.ts`
- Query actual agent instances for health
- Return real memory usage, request counts

#### Fix 7.3: Billing Analytics from Real Data
**Files:** `server/services/billing/unified-billing-service.ts`
- Calculate revenue from actual payments table
- Track real usage metrics

---

## Work Division: Claude vs. Gemini (Antigravity)

### Claude Code Focus (Backend & Infrastructure)

| Task Area | Specific Tasks | Priority |
|-----------|---------------|----------|
| **Database & Schema** | Create migrations, JSONB merge endpoint, lazy migration | P1 |
| **Backend Routes** | Fix required-data-elements endpoint, progress API | P1 |
| **Security Hardening** | Auth endpoint protection, password reset persistence | P2 |
| **Agent Infrastructure** | Checkpoint persistence, user ID fix, WebSocket auth | P2 |
| **Billing Service** | Replace mock values with real calculations | P3 |
| **Admin Routes** | Fix admin stats, agent health, billing analytics | P3 |

### Gemini (Antigravity) Focus (Frontend & UX)

| Task Area | Specific Tasks | Priority |
|-----------|---------------|----------|
| **State Management** | Migrate from localStorage to TanStack Query | P1 |
| **Step Components** | Update all steps to read from journeyProgress | P1 |
| **Query Hooks** | Create `useProject` hook, deprecate `useProjectSession` | P1 |
| **Results UI** | Build "How We Answered" component, question tracing | P2 |
| **Dashboard UX** | Cache invalidation, resume routing, progress display | P3 |
| **Admin UI** | Verify admin component data binding to real endpoints | P3 |

### Coordination Protocol

```
1. BOTH work on same feature branch: fix/end-to-end-journey-continuity

2. Communication checkpoints:
   - Before starting: Announce which file(s) you're modifying
   - After completing: Commit with clear message, notify partner
   - If blocked: Document blocker, move to next task

3. Integration points (require both):
   - JourneyProgress interface definition (Claude defines in schema, Gemini uses in types)
   - API endpoint contracts (Claude implements, Gemini consumes)
   - WebSocket message formats (Claude sends, Gemini handles)

4. Testing responsibility:
   - Claude: Backend unit tests, API integration tests
   - Gemini: Frontend component tests, E2E journey tests
   - BOTH: Full E2E validation before merge
```

---

## Extended Task Checklist

### Part 6: Security Hardening (NEW)
- [ ] **Auth Endpoint Protection**
  - [ ] Add production guard to `/api/auth/setup-admin`
  - [ ] Remove or guard `/api/auth/login-test` in production
- [ ] **Password Reset Persistence**
  - [ ] Create `password_reset_tokens` table in schema.ts
  - [ ] Run migration: `npm run db:push`
  - [ ] Update reset endpoints to use database instead of in-memory Map
  - [ ] Use 32-byte secure tokens instead of 6-digit codes
- [ ] **Session Security**
  - [ ] Verify `secure: true` on cookies in production
  - [ ] Verify `sameSite: 'strict'` setting
- [ ] **Logging Cleanup**
  - [ ] Audit auth.ts for excessive logging
  - [ ] Gate debug logs behind `ENABLE_DEBUG_LOGGING`

### Part 7: Agent System Reliability (NEW)
- [ ] **Checkpoint Persistence**
  - [ ] Create `agent_checkpoints` table in schema.ts
  - [ ] Update message-broker to write checkpoints to DB
  - [ ] Add recovery logic on server startup
- [ ] **User Targeting**
  - [ ] Fix `userId = 'user_placeholder'` in realtime-agent-bridge.ts
  - [ ] Get userId from WebSocket connection or project owner
- [ ] **WebSocket Security**
  - [ ] Add session verification on WebSocket upgrade in index.ts
  - [ ] Close unauthorized connections with appropriate error code
- [ ] **Timeout Optimization**
  - [ ] Reduce default checkpoint timeout to 60 seconds
  - [ ] Add per-checkpoint-type timeout configuration

### Part 8: Admin Component Accuracy (NEW)
- [ ] **Dashboard Stats**
  - [ ] Replace mock stats in `GET /api/admin/stats` with real queries
  - [ ] Verify user count, project count, active sessions are accurate
- [ ] **Agent Health**
  - [ ] Query actual agent service instances for health status
  - [ ] Return real metrics (not placeholders)
- [ ] **Billing Analytics**
  - [ ] Fix `getAdminStats()` in unified-billing-service.ts
  - [ ] Calculate revenue from actual payments table
- [ ] **System Health**
  - [ ] Ensure Python bridge health reflects actual status
  - [ ] Add Redis health check to system status

---

## Updated Estimated Effort

| Phase | Tasks | Estimated Time | Owner |
|-------|-------|----------------|-------|
| Phase 1 | Critical Data Continuity | 8-12 hours | Claude (backend) + Gemini (frontend) |
| Phase 2 | Question Traceability | 6-8 hours | Claude (backend) + Gemini (UI) |
| Phase 3 | Billing & Payment | 4-6 hours | Claude |
| Phase 4 | Dashboard & Resume | 3-4 hours | Gemini |
| Phase 5 | Security Hardening | 4-6 hours | Claude |
| Phase 6 | Agent Reliability | 6-8 hours | Claude |
| Phase 7 | Admin Accuracy | 4-6 hours | Claude (backend) + Gemini (verify UI) |
| Testing | End-to-end validation | 4-6 hours | Both |
| **Total** | | **39-56 hours** | |

---

## Next Steps

1. Review and approve this fix plan
2. Create feature branch: `fix/end-to-end-journey-continuity`
3. **Claude starts:** Phase 1 backend (JSONB merge endpoint, lazy migration)
4. **Gemini starts:** Phase 1 frontend (useProject hook, step refactoring)
5. Daily sync on progress
6. Integrate and test Phase 1 before moving to Phase 2
7. Continue through phases in priority order
8. Full E2E test before merge
9. Deploy to staging for user acceptance testing

---

## DECEMBER 19, 2025 - DETAILED FIX IMPLEMENTATIONS

### P0-1: Fix CORS Missing PATCH Method

**File**: `server/middleware/security-headers.ts`
**Line**: 227

**Current Code**:
```typescript
methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
```

**Fixed Code**:
```typescript
methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
```

**Impact**: Without this fix, ALL `PATCH /api/projects/:id/progress` calls fail with CORS error. This blocks all journey progress updates.

---

### P0-2: Fix Infinite Loop in prepare-step.tsx

**File**: `client/src/pages/prepare-step.tsx`

**Problem**: Console shows 400+ "Saved goals and questions for agent recommendations" messages, indicating an infinite useEffect loop.

**Root Cause**: The useEffect that saves goals/questions triggers on state changes that are caused by the save itself.

**Fix Pattern**:
```typescript
// Add a debounce and dependency check
const [isSaving, setIsSaving] = useState(false);
const lastSavedRef = useRef<string>('');

useEffect(() => {
  if (isSaving) return;

  const dataToSave = JSON.stringify({ goals, questions });
  if (dataToSave === lastSavedRef.current) return;

  setIsSaving(true);
  lastSavedRef.current = dataToSave;

  // ... save logic

  setIsSaving(false);
}, [goals, questions]);
```

---

### P0-3: Debug PII Exclusions 500 Error

**File**: `server/routes/project.ts` - apply-pii-exclusions endpoint

**Action**: Check server logs for actual error. Likely causes:
1. Missing dataset in database
2. Invalid column names in exclusion list
3. Tool handler throwing unhandled exception

---

### P1-1: Persist Full Joined Dataset (Not Just Preview)

**Current Flow** (Broken):
```
buildMultiDatasetPreview() → stores only 50 rows in journeyProgress.joinedData.preview
```

**Fix** in `server/routes/project.ts` around line 3966:

```typescript
// Store FULL joined data, not just preview
await storage.updateProject(projectId, {
  journeyProgress: {
    ...existingProgress,
    joinedData: {
      preview: joinedRows.slice(0, 50),           // For UI display
      fullRowCount: joinedRows.length,            // Total count
      datasetId: `joined_${projectId}`,           // Reference to full data
      schema: mergedSchema,
      joinConfig: joinConfig,
      piiFiltered: false,
      generatedAt: new Date().toISOString()
    }
  }
});

// Store full joined data in a dedicated location
await storage.createDataset({
  id: `joined_${projectId}`,
  projectId,
  name: 'Joined Dataset',
  type: 'joined',
  data: joinedRows,                               // FULL DATA
  schema: mergedSchema,
  preview: joinedRows.slice(0, 100)
});
```

---

### P1-2: Fix PII Removal Timing (Filter Before Join)

**Current Flow** (Broken):
```
Upload → Join (with PII) → PII Dialog → Filter individual datasets → joinedData still has PII
```

**Required Flow**:
```
Upload → PII Dialog → Filter individual datasets → THEN Join (without PII)
```

**Fix** in `server/routes/project.ts` buildMultiDatasetPreview():

```typescript
async function buildMultiDatasetPreview(
  project: any,
  datasets: any[],
  agent: any,
  excludedColumns?: string[]  // NEW PARAMETER
) {
  // Filter columns BEFORE joining
  const filteredDatasets = datasets.map(ds => {
    if (!excludedColumns?.length) return ds;

    const filteredData = ds.data.map((row: any) => {
      const newRow: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (!excludedColumns.includes(key)) {
          newRow[key] = value;
        }
      }
      return newRow;
    });

    return { ...ds, data: filteredData };
  });

  // Now join the filtered datasets
  // ... existing join logic using filteredDatasets
}
```

**Also fix** in `client/src/pages/data-step.tsx`:
- Call `apply-pii-exclusions` BEFORE calling `refreshDatasets()`
- Pass excluded columns to the datasets refresh

---

### P1-3: Render DataElementsMappingUI in Verification Step

**File**: `client/src/pages/data-verification-step.tsx`

**Current**: Component imported at line 31 but never rendered

**Fix**: Add a new tab for element mapping:

```tsx
{/* Add after the existing tabs */}
<TabsContent value="elements">
  <Card>
    <CardHeader>
      <CardTitle>Map Required Data Elements</CardTitle>
      <CardDescription>
        Connect your business requirements to actual data columns
      </CardDescription>
    </CardHeader>
    <CardContent>
      <DataElementsMappingUI
        requiredElements={journeyProgress?.requirementsDocument?.requiredDataElements || []}
        availableColumns={Object.keys(joinedSchema || {})}
        existingMappings={journeyProgress?.elementMappings || []}
        onMappingsChange={async (mappings) => {
          await updateProgress({ elementMappings: mappings });
        }}
      />
    </CardContent>
  </Card>
</TabsContent>
```

**Also add** to schema.ts JourneyProgress:
```typescript
elementMappings: z.array(z.object({
  requiredElement: z.string(),
  mappedColumn: z.string(),
  transformationNeeded: z.boolean(),
  userApproved: z.boolean()
})).optional(),
```

---

### P1-4: Lock Analysis Recommendations After Prepare Step

**File**: `server/routes/project.ts` around line 5272 (GET required-data-elements)

**Current**: May regenerate requirements on each call

**Fix**:
```typescript
router.get("/:id/required-data-elements", async (req, res) => {
  const project = await storage.getProject(id);
  const journeyProgress = parseJourneyProgress(project);
  const stored = journeyProgress?.requirementsDocument;

  // If document exists and is locked, ALWAYS return it
  if (stored?.locked === true) {
    return res.json({
      success: true,
      document: stored,
      wasLocked: true,
      message: "Requirements locked from Prepare step"
    });
  }

  // If document exists but not locked, still return it
  if (stored) {
    return res.json({
      success: true,
      document: stored,
      wasLocked: false
    });
  }

  // Only if missing, indicate user needs to complete Prepare step
  return res.status(404).json({
    success: false,
    error: "Requirements not found. Complete Prepare step first."
  });
});
```

**Also add** locking in Prepare step save:
```typescript
// When saving requirements in prepare-step.tsx
await updateProgress({
  requirementsDocument: {
    ...generatedDocument,
    locked: true,
    lockedAt: new Date().toISOString()
  }
});
```

---

### P2-1: Fix Execute Step to Use Joined Dataset

**File**: `server/services/analysis-execution.ts` around line 1735

**Current** `extractDatasetRows()` priority:
1. Individual dataset ingestionMetadata.transformedData
2. Individual dataset data/preview

**Fixed priority**:
1. **journeyProgress.joinedData (from Upload step)**
2. **Joined dataset from dedicated table**
3. Individual dataset transformedData
4. Fallback

```typescript
private static async extractDatasetRows(
  datasets: any[],
  journeyProgress: any
): Promise<any[]> {
  // Priority 1: Use joined transformed data
  const joinedTransformed = journeyProgress?.joinedData?.transformedData;
  if (Array.isArray(joinedTransformed) && joinedTransformed.length > 0) {
    console.log(`📊 Using joined transformed data: ${joinedTransformed.length} rows`);
    return joinedTransformed;
  }

  // Priority 2: Use joined data (non-transformed but filtered)
  const joinedDatasetId = journeyProgress?.joinedData?.datasetId;
  if (joinedDatasetId) {
    const joinedDataset = await storage.getDataset(joinedDatasetId);
    if (joinedDataset?.data?.length > 0) {
      console.log(`📊 Using joined dataset: ${joinedDataset.data.length} rows`);
      return joinedDataset.data;
    }
  }

  // Priority 3: Full data from journeyProgress preview (if complete)
  const joinedPreview = journeyProgress?.joinedData?.preview;
  const fullRowCount = journeyProgress?.joinedData?.fullRowCount;
  if (joinedPreview && joinedPreview.length === fullRowCount) {
    console.log(`📊 Using joined preview (complete): ${joinedPreview.length} rows`);
    return joinedPreview;
  }

  // Priority 4: Fallback to individual datasets (last resort)
  console.warn('⚠️ Falling back to individual datasets - join may be needed');
  // ... existing individual dataset logic
}
```

---

### Correct User Journey Step Order

Based on user requirements, the step order should be:

1. **Data Upload** - Upload files, PII detection, DE agent joins post-PII decision
2. **Prepare Step** - Goals, questions, audience → PM recommends analyses & required elements
3. **Verification Step** - Review joined data, map required elements to columns, confirm PII decisions
4. **Transformation Step** - Add transformation rules to element-column mappings
5. **Execute Step** - Run analyses with per-analysis data views
6. **Results Step** - View results with evidence chain

**Key Principle**: Each step builds on the previous step's output. NO regeneration of upstream data.

---

## Validation Commands

After implementing fixes:

```bash
# 1. Check CORS fix
curl -X OPTIONS http://localhost:5000/api/projects/test/progress \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: PATCH" -v

# 2. Check infinite loop fixed
# In browser DevTools console, count API calls during Prepare step
# Should be < 5 calls, not 400+

# 3. Test PII exclusions
curl -X POST http://localhost:5000/api/projects/{id}/apply-pii-exclusions \
  -H "Content-Type: application/json" \
  -d '{"excludedColumns": ["name", "email"], "strategy": "remove"}'

# 4. Verify joined dataset persisted
curl http://localhost:5000/api/projects/{id}/datasets | jq '.joinedPreview | length'
# Should return full row count, not 50

# 5. Verify requirements locked
# Complete Prepare step, then:
curl http://localhost:5000/api/projects/{id}/required-data-elements
# Should return wasLocked: true
```

---

## Summary: Implementation Priority

1. **Day 1 (Critical Blockers)**:
   - [ ] P0-1: Add PATCH to CORS methods
   - [ ] P0-2: Fix infinite loop in prepare-step
   - [ ] P0-3: Debug PII exclusions 500 error

2. **Day 2 (Data Flow)**:
   - [ ] P1-1: Persist full joined dataset
   - [ ] P1-2: Fix PII removal timing
   - [ ] P1-4: Lock requirements after Prepare

3. **Day 3 (UI & Mapping)**:
   - [ ] P1-3: Render DataElementsMappingUI
   - [ ] P2-1: Fix Execute to use joined data

4. **Day 4 (Testing)**:
   - [ ] E2E test complete journey
   - [ ] Verify all screenshots issues resolved
