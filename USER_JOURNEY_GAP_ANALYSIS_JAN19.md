# User Journey Gap Analysis - January 19, 2026

## Executive Summary

End-to-end review of the user journey from Data Upload through Results Delivery identified **7 critical gaps** and **5 medium-severity issues** that affect data flow continuity, user experience, and result accuracy.

### FIXES IMPLEMENTED (Jan 19, 2026)

| Gap | Issue | Status |
|-----|-------|--------|
| Gap 1-3 | Verification uses wrong endpoint, mappings/PII not saved to datasets | **FIXED** |
| Gap 4 | BA translations not using fallback | Already working (verified) |
| Gap 5 | UserQuestionAnswers not in project dashboard | **FIXED** |
| Gap 6 | Preview mode unclear UX | **FIXED** |
| Gap 7+ | PDF report lacks data science content | **FIXED** |
| Gap 8+ | Comprehensive results not passed to artifacts | **FIXED** |

**Files Modified:**
- `server/routes/project.ts` - Extended PUT /verify to accept elementMappings, save to datasets
- `client/src/pages/data-verification-step.tsx` - Now calls PUT /verify instead of updateProgress()
- `client/src/pages/project-page.tsx` - Added UserQuestionAnswers, enhanced preview mode
- `server/services/artifact-generator.ts` - Enhanced PDF report with comprehensive data science content
- `server/services/analysis-execution.ts` - Maps DataScienceOrchestrator output to comprehensiveResults for artifacts

### FIXES IMPLEMENTED (Jan 20, 2026)

| Gap | Issue | Status |
|-----|-------|--------|
| Gap 9 | Data element mappings show 0 Auto-Mapped after successful mapping | **FIXED** |
| Gap 10 | Auto-mapping keeps skipping due to missing hasMappedElements flag | **FIXED** |
| Gap 11 | No visual indicator of mapping progress | **FIXED** |

**Files Modified:**
- `client/src/pages/data-verification-step.tsx:313` - Fixed `sourceAvailable` derivation to include `sourceColumn`
- `client/src/pages/data-verification-step.tsx:387-401` - Set `hasMappedElements` flag when restoring from SSOT
- `client/src/pages/data-verification-step.tsx:326-341,713-724` - Added comprehensive debug logging
- `client/src/components/DataElementsMappingUI.tsx:500-518` - Added visual progress bar for mapping status

**Root Causes Fixed:**
1. `sourceAvailable` derivation didn't check `sourceColumn` field (backend sets both `sourceField` AND `sourceColumn`)
2. `hasMappedElements` flag not set when restoring elements from `journeyProgress`, causing repeated mapping attempts
3. Missing visual feedback for mapping progress percentage

### FIXES IMPLEMENTED (Jan 20, 2026 - Session 2)

| Gap | Issue | Status |
|-----|-------|--------|
| Gap 12 | Verification schema showing individual datasets instead of joined | **VERIFIED WORKING** - Schema tab always shows "(Joined Dataset)" |
| Gap 13 | Auto-mapping not triggering on page load | **FIXED** - Added `isLoading` check to prevent race conditions |
| Gap 14 | Business definitions enrichment not running | **FIXED** - Added `isLoading` dependency to trigger after data load |
| Gap 15 | Stripe payment failures due to API version mismatch | **FIXED** - Standardized all Stripe instances to `2024-12-18.acacia` |

**Files Modified:**
- `client/src/pages/data-verification-step.tsx:661-770` - Added `isLoading` to auto-mapping effect dependencies
- `client/src/pages/data-verification-step.tsx:428-445` - Wait for page load before business definitions enrichment
- `server/services/billing/unified-billing-service.ts:364-368` - Use stable Stripe API version
- `server/adaptive-billing-service.ts:7-10` - Use stable Stripe API version
- `server/routes/consultation.ts:58-62` - Use stable Stripe API version
- `server/routes/admin.ts:3185-3188` - Use stable Stripe API version
- `server/routes/analysis-payment.ts:191-193` - Use stable Stripe API version
- `server/services/stripe-sync.ts:31-34` - Use stable Stripe API version

**Root Causes Fixed:**
1. Auto-mapping effect ran before page data loaded, causing skip due to missing `requiredDataElements`
2. Business definitions enrichment triggered during loading state, not after data was available
3. Stripe API version `2025-08-27.basil` is a future version not supported by stripe@18.5.0 - standardized to `2024-12-18.acacia`

### FIXES IMPLEMENTED (Jan 20, 2026 - Session 3)

| Gap | Issue | Status |
|-----|-------|--------|
| Gap 16 | UI shows "0 Auto-Mapped" after mapping API returns success ("Mapped 22 of 22") | **FIXED** - Two fixes applied |
| Gap 17 | DataElementsMappingUI doesn't update when props change | **FIXED** - Added useEffect sync |

**Files Modified:**
- `client/src/pages/data-verification-step.tsx:93-96` - Added `localMappingTimestampRef` to track local mapping
- `client/src/pages/data-verification-step.tsx:396-406` - SSOT now compares timestamps before overwriting
- `client/src/pages/data-verification-step.tsx:773-779` - Set timestamp ref when mapping completes
- `client/src/pages/data-verification-step.tsx:282-302` - Enhanced debug logging for mapping state
- `client/src/components/DataElementsMappingUI.tsx:1` - Added `useEffect` import
- `client/src/components/DataElementsMappingUI.tsx:160-193` - **NEW** useEffect to sync mappings when props change

**Root Causes Fixed:**

**Issue 1: Stale SSOT Overwrite**
Race condition where React Query cache invalidation triggered SSOT effect with stale data before refetch completed:
1. Mapping API returns successfully → `setRequiredDataElements(response.document)` sets correct data
2. `queryClient.invalidateQueries()` triggers project refetch
3. SSOT effect runs with OLD cached `journeyProgress` (before refetch completes)
4. SSOT unconditionally calls `setRequiredDataElements(reqDoc)` with stale data → overwrites correct mappings

**Fix 1:**
- Use `useRef` to track when local mapping was done (`localMappingTimestampRef`)
- SSOT effect now compares server `lastMappedAt` timestamp vs local ref
- Only apply SSOT if server timestamp is newer OR local timestamp is 0 (no local mapping yet)

**Issue 2: DataElementsMappingUI Internal State Not Updating**
`DataElementsMappingUI` component initializes its internal `mappings` state using `useState` initializer which only runs ONCE on mount. When parent passes new `requiredDataElements` prop with mapped data, the internal state doesn't update.

**Fix 2:**
- Added `useEffect` in DataElementsMappingUI to sync mappings when `requiredDataElements` prop changes
- Compares current mapped count with new mapped count
- Only updates if new mappings have more items (avoids overwriting user edits)

**Console Indicators (verify mapping works):**
- `📊 [Data Engineer] Set local mapping timestamp ref: 173XXXXXXXXX` - Timestamp captured
- `✅ [SSOT] ... shouldApplySSOT: false, action: 'SKIPPING_STALE_SSOT'` - Stale data prevented
- `📋 [DataElementsMappingUI] Syncing X mappings from updated props (was Y)` - Component sync working
- `📋 [P1-3 DEBUG] ... rawMappedCount: 22` - Raw elements have mapping data
- UI should now show correct Auto-Mapped count matching toast message without refresh

**Verification Notes:**
- Verification schema tab correctly displays joined dataset schema with "(Joined Dataset)" indicator
- Preview tab has separate buttons for individual datasets (UX choice, not a bug)
- Backend persists `journeyProgress.joinedData.schema` correctly as SSOT

**Key Findings:**
1. Element mappings from verification step are NOT persisted to database (only in React Query cache)
2. PII decisions saved via generic progress endpoint, not verification-specific endpoint
3. Verification uses `PUT /progress` while dedicated `PUT /verify` endpoint exists but unused
4. Results display gaps - BA translations and Q&A evidence not showing in project dashboard
5. Artifact downloads have no payment gate (may be intentional)

---

## Gap Categories

| Severity | Count | Impact |
|----------|-------|--------|
| **P0 - Critical** | 3 | Data loss, broken user flow |
| **P1 - High** | 4 | Missing functionality, poor UX |
| **P2 - Medium** | 5 | Suboptimal behavior, workarounds exist |

---

## P0 - CRITICAL GAPS

### Gap 1: Element Mappings Not Persisted After Verification

**Severity:** P0/CRITICAL
**Status:** BROKEN
**Impact:** User mapping decisions lost on navigation/refresh; must re-map during transformation

**Current Flow:**
```
1. User maps data elements in DataElementsMappingUI component
2. Mappings stored in React component state (useState)
3. handleFinalApproval() calls updateProgress() with mappings embedded in requirementsDocument
4. updateProgress() calls PUT /api/projects/:id/progress
5. Progress endpoint saves to journeyProgress
6. BUT: Mappings are nested in requirementsDocument.requiredDataElements
7. Transformation step may not find them if structure differs
```

**Problem Location:**
- `client/src/pages/data-verification-step.tsx:1399-1424` - Builds mappings into progressUpdate
- `client/src/components/DataElementsMappingUI.tsx:125-155` - Mappings in local state only
- `server/routes/project.ts:6009-6074` - Generic progress endpoint, no explicit mapping field

**Expected Behavior:**
- Mappings should be saved to a dedicated field: `journeyProgress.elementMappings`
- Should also be saved to `dataset.ingestionMetadata.columnMappings` for persistence

**Evidence:**
```typescript
// Current: Mappings buried in nested structure
progressUpdate.requirementsDocument.requiredDataElements[].sourceColumn

// Expected: Dedicated field for easy access
journeyProgress.elementMappings = {
  [elementId]: { sourceField, transformationCode, transformationDescription }
}
```

---

### Gap 2: Verification Endpoint Bypass

**Severity:** P0/CRITICAL
**Status:** BROKEN
**Impact:** Dedicated verification logic not executed; PII/quality decisions may not be properly saved to datasets

**Current Flow:**
```
1. User approves verification in data-verification-step.tsx
2. handleFinalApproval() calls updateProgress() [NOT apiClient.put('/verify')]
3. PUT /api/projects/:id/progress receives data
4. Generic merge into journeyProgress ONLY
5. PUT /api/projects/:id/verify NEVER called
```

**Problem Location:**
- `client/src/pages/data-verification-step.tsx:1427` - Uses `updateProgress()` not direct API call
- `server/routes/project.ts:3778-3927` - Dedicated verify endpoint EXISTS but unused

**What verify endpoint provides (unused):**
```typescript
// Lines 3856-3872: Saves PII to BOTH journeyProgress AND dataset.ingestionMetadata
for (const dataset of datasets) {
  await storage.updateDataset(dataset.id, {
    ingestionMetadata: {
      ...dataset.ingestionMetadata,
      piiMaskingChoices: piiDecisions,
      piiDecisionTimestamp: new Date().toISOString(),
      // ... columnMappings, dataQuality, etc.
    }
  });
}

// Lines 3909-3923: Triggers DE Agent transformation planning
setTimeout(async () => {
  const orchestrator = new ProjectAgentOrchestrator(projectId);
  await orchestrator.startAgentInteraction('data_engineer', { ... });
}, 100);
```

**Expected Behavior:**
- Frontend should call `PUT /api/projects/:id/verify` on approval
- This ensures PII decisions are saved to datasets, not just journeyProgress
- This triggers DE Agent for transformation planning

---

### Gap 3: PII Decisions Not Reaching Dataset Storage

**Severity:** P0/CRITICAL
**Status:** BROKEN
**Impact:** PII masking/exclusion not applied during transformation or analysis

**Current Flow:**
```
1. User makes PII decisions in verification step
2. handleColumnDecision() calls updateProgress() with piiDecision object
3. Saved to journeyProgress.piiDecision ONLY
4. dataset.ingestionMetadata.piiMaskingChoices NOT updated
5. Transformation step cannot find PII config from dataset
6. Analysis may expose PII data
```

**Problem Location:**
- `client/src/pages/data-verification-step.tsx:1030` - Saves to journeyProgress only
- `server/routes/project.ts:6029-6054` - Generic merge, no dataset update
- `server/services/analysis-execution.ts:1562-1565` - Checks for PII config but may not find it

**Evidence:**
```typescript
// Verification step saves here (line 1030):
updateProgress({ piiDecision: { excludedColumns, anonymizedColumns } });

// Analysis expects here (analysis-execution.ts:1562):
const piiConfig = dataset.ingestionMetadata?.piiMaskingChoices || {};
// This will be EMPTY because verification doesn't save to ingestionMetadata
```

---

## P1 - HIGH PRIORITY GAPS

### Gap 4: BA Translations Not Displayed in Project Dashboard

**Severity:** P1/HIGH
**Status:** PARTIALLY WORKING
**Impact:** User doesn't see audience-specific translations in project view

**Current Flow:**
```
1. Business Agent generates translations during analysis
2. Stored in journeyProgress.translatedResults
3. AudienceTranslatedResults component checks journeyProgress.translatedResults
4. Component ONLY rendered when project?.isPaid
5. Even when paid, may show "Results Not Yet Available" fallback
```

**Problem Location:**
- `client/src/pages/project-page.tsx:850` - Gated behind isPaid
- `client/src/components/AudienceTranslatedResults.tsx:118-152` - Checks correct path
- `client/src/components/AudienceTranslatedResults.tsx:275-290` - Shows empty card instead of fallback

**Evidence:**
Component has fallback logic (`createFallbackTranslation()` at line 171-227) but renders "Results Not Yet Available" card instead of using fallback when BA translations missing.

---

### Gap 5: UserQuestionAnswers Not in Project Dashboard

**Severity:** P1/HIGH
**Status:** BROKEN
**Impact:** Evidence chain and Q&A display only in journey, not project dashboard

**Current State:**
```
- UserQuestionAnswers imported in: dashboard-step.tsx (journey)
- NOT imported in: project-page.tsx, ai-insights.tsx
- User completes journey, goes to project dashboard
- Cannot see their questions and AI-generated answers
```

**Problem Location:**
- `client/src/pages/project-page.tsx` - Missing UserQuestionAnswers import
- `client/src/components/ai-insights.tsx` - Missing UserQuestionAnswers integration

**Expected Behavior:**
- Project dashboard Insights tab should show UserQuestionAnswers component
- Should display questions, AI answers, confidence scores, and evidence chain

---

### Gap 6: Preview Mode Shows Partial Data Without Clear Gating

**Severity:** P1/HIGH
**Status:** SUBOPTIMAL
**Impact:** Unpaid users see limited data without clear explanation

**Current Flow:**
```
1. User hasn't paid
2. AIInsights component renders (line 858)
3. Shows "AI Insights Preview" with 2 insights max
4. No clear call-to-action to unlock full results
5. BA translations gated completely (empty)
```

**Problem Location:**
- `client/src/pages/project-page.tsx:873-877` - Shows preview without clear upgrade path
- `client/src/pages/project-page.tsx:850` - AudienceTranslatedResults hidden entirely

**Expected Behavior:**
- Clear "Unlock Full Insights" banner with CTA
- Show count of hidden insights ("Showing 2 of 15 insights")
- Preview mode should be consistent across all components

---

### Gap 7: Artifact Downloads Not Payment Gated

**Severity:** P1/HIGH (or intentional P3)
**Status:** UNCERTAIN
**Impact:** Unpaid users may download full artifacts if they have project access

**Current State:**
```
- handleArtifactDownload() at project-page.tsx:89-116
- Only checks project access via canAccessProject()
- No isPaid check before allowing download
- Artifacts generated post-payment, so may be intentionally ungated
```

**Problem Location:**
- `client/src/pages/project-page.tsx:89-116` - No payment check
- `server/routes/project.ts:3625-3654` - Artifact endpoint has no payment gate

**Recommendation:**
- Either add payment gate to artifact downloads
- OR document this as intentional (artifacts only exist after payment)

---

## P2 - MEDIUM PRIORITY GAPS

### Gap 8: Verification Status Not Synced to Dedicated Endpoint

**Severity:** P2/MEDIUM
**Impact:** Verification analytics and audit trail incomplete

**Details:**
- `PUT /api/projects/:id/verify` has detailed logging and timestamps
- Frontend uses generic `PUT /api/projects/:id/progress` instead
- Verification-specific metadata not captured

---

### Gap 9: Question-Answer Fallback Uses Keyword Matching

**Severity:** P2/MEDIUM
**Impact:** When AI Q&A unavailable, fallback is low-quality keyword matching

**Location:** `client/src/components/UserQuestionAnswers.tsx:38-109`

**Details:**
- Primary: AI-generated answers from `analysisResults.questionAnswers`
- Fallback: Keyword matching against insights (low confidence)
- No indication to user which method was used

---

### Gap 10: Evidence Chain May Be Incomplete

**Severity:** P2/MEDIUM
**Impact:** Question-to-answer traceability may be missing

**Location:** `server/services/data-science-orchestrator.ts:410-421`

**Details:**
- `questionAnswerMapping` passed to `buildEvidenceChain()`
- Unclear if evidence chain is actually built and stored
- Need to verify `buildEvidenceChain()` implementation

---

### Gap 11: Transformation Step May Skip if Already Applied

**Severity:** P2/MEDIUM
**Impact:** User may need to re-transform if changes needed

**Location:** `client/src/pages/data-transformation-step.tsx`

**Details:**
- If `journeyProgress.transformationApplied === true`, step may auto-skip
- No easy way to re-run transformations if data changes
- Should allow re-transformation with warning

---

### Gap 12: analysisPath Type Inconsistency

**Severity:** P2/MEDIUM
**Impact:** Type mismatches between frontend and backend

**Details:**
- Frontend builds `analysisPath[].analysisType: string`
- Backend expects specific format
- May cause analysis routing issues

---

## Data Flow Diagram with Gaps

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PREPARE STEP                                    │
│  ✅ User enters goals/questions                                              │
│  ✅ POST /api/projects/:id/generate-data-requirements                       │
│  ✅ Creates requirementsDocument with requiredDataElements                  │
│  ✅ Saved to journeyProgress.requirementsDocument (SSOT)                    │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VERIFICATION STEP                                  │
│  ✅ Loads requirementsDocument from journeyProgress                         │
│  ✅ DataElementsMappingUI displays elements                                 │
│  ✅ User creates mappings in component state                                │
│  ✅ User makes PII decisions                                                │
│  ❌ GAP 1: Mappings NOT saved to dedicated field                            │
│  ❌ GAP 2: PUT /verify endpoint NOT called (uses /progress instead)         │
│  ❌ GAP 3: PII decisions NOT saved to dataset.ingestionMetadata             │
│                                                                              │
│  Current: updateProgress() → PUT /progress → journeyProgress only           │
│  Expected: apiClient.put('/verify') → journeyProgress + dataset             │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TRANSFORMATION STEP                                 │
│  ✅ Loads from journeyProgress.requirementsDocument                         │
│  ✅ Polls for DE Agent transformation suggestions                           │
│  ⚠️  May not find element mappings (nested in different location)           │
│  ⚠️  May not find PII config (not saved to dataset)                         │
│  ✅ Executes transformations when user approves                             │
│  ✅ Saves transformedData to dataset.ingestionMetadata                      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXECUTION STEP                                     │
│  ✅ Payment gate checks subscription/isPaid                                 │
│  ✅ Passes analysisPath and questionAnswerMapping to backend               │
│  ✅ Uses transformedData (Priority 1) from dataset.ingestionMetadata       │
│  ✅ Calls type-specific Python scripts via DataScienceOrchestrator         │
│  ✅ Business Agent translates results                                       │
│  ✅ Results saved to projects.analysisResults                               │
│  ✅ BA translations saved to journeyProgress.translatedResults              │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RESULTS DELIVERY                                   │
│  ✅ Results loaded from projects.analysisResults                            │
│  ✅ Payment gate returns preview if unpaid                                  │
│  ❌ GAP 4: BA translations may show empty card, not fallback                │
│  ❌ GAP 5: UserQuestionAnswers not in project dashboard                     │
│  ❌ GAP 6: Preview mode unclear UX                                          │
│  ❌ GAP 7: Artifact downloads not payment gated                             │
│  ✅ Artifacts generated and stored                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Fixes by Priority

### Immediate (P0)

1. **Fix Gap 1 & 3: Use PUT /verify endpoint**
   - Modify `handleFinalApproval()` to call `apiClient.put('/api/projects/:id/verify')` instead of `updateProgress()`
   - Include `elementMappings`, `piiDecisions`, and `verificationChecks` in request body
   - Backend verify endpoint already handles saving to both journeyProgress AND dataset

2. **Fix Gap 2: Add dedicated elementMappings field**
   - Add `elementMappings` to journeyProgress schema
   - Save mappings explicitly, not nested in requirementsDocument

### Short-term (P1)

3. **Fix Gap 4: Use fallback translations**
   - Modify AudienceTranslatedResults to use `createFallbackTranslation()` when BA translations missing
   - Remove "Results Not Yet Available" empty card

4. **Fix Gap 5: Add UserQuestionAnswers to project dashboard**
   - Import and render UserQuestionAnswers in project-page.tsx Insights tab
   - Pass `analysisResults.questionAnswers` as prop

5. **Fix Gap 6: Improve preview mode UX**
   - Add clear "Showing X of Y" count
   - Add prominent "Unlock Full Insights" CTA
   - Consistent preview behavior across components

6. **Fix Gap 7: Clarify artifact download policy**
   - Either add payment gate or document as intentional

### Medium-term (P2)

7. **Improve evidence chain**
   - Verify `buildEvidenceChain()` implementation
   - Ensure evidence stored in `questionAnswers.evidenceChain`

8. **Add re-transformation capability**
   - Allow users to re-run transformations with confirmation

---

## Testing Checklist

After fixes, verify:

- [ ] Element mappings persist after browser refresh during verification
- [ ] PII decisions appear in dataset.ingestionMetadata after verification approval
- [ ] DE Agent receives transformed schema for planning
- [ ] Transformation step finds all mappings and PII config
- [ ] Analysis uses transformed data (check console logs)
- [ ] BA translations display in project dashboard (paid users)
- [ ] UserQuestionAnswers visible in project dashboard
- [ ] Unpaid users see clear preview mode with upgrade CTA
- [ ] Evidence chain shows in question answers

---

## Files to Modify

| File | Changes Needed |
|------|----------------|
| `client/src/pages/data-verification-step.tsx` | Call PUT /verify instead of updateProgress() |
| `client/src/pages/project-page.tsx` | Add UserQuestionAnswers, improve preview UX |
| `client/src/components/AudienceTranslatedResults.tsx` | Use fallback instead of empty card |
| `server/routes/project.ts` | Add elementMappings field to progress schema |
| `shared/schema.ts` | Define elementMappings type in journeyProgress |

---

## Enhanced PDF Report (Jan 19, 2026)

The PDF report has been completely rewritten to represent comprehensive data scientist work:

### PDF Report Sections (NEW)

1. **Title Page**
   - Project name and description
   - Generation timestamp
   - Journey type indicator

2. **Executive Summary**
   - Data quality score (0-100 with visual bar)
   - Key findings (top 5)
   - Business KPIs with trends (up/down/stable)

3. **Statistical Analysis**
   - Correlation matrix with significant correlations
   - P-values for statistical significance
   - Regression results (R², RMSE, features used)

4. **Machine Learning Models**
   - Model types (regression, classification, clustering)
   - Performance metrics (Accuracy, R², RMSE, Silhouette Score)
   - Feature importance rankings (top 10)

5. **Recommendations**
   - Priority-ordered recommendations (High/Medium/Low)
   - Impact assessments
   - Clear descriptions

6. **Answered Questions**
   - User questions with AI-generated answers
   - Confidence scores for each answer
   - Evidence chain (if available)

7. **Data Quality Details**
   - Missing value analysis by column
   - Outlier detection with bounds
   - Column-level quality metrics

### Data Flow for Comprehensive Results

```
DataScienceOrchestrator.executeWorkflow()
    ↓
results.dataQualityReport        → comprehensiveResults.dataQualityReport
results.statisticalAnalysisReport → comprehensiveResults.statisticalAnalysisReport
results.mlModels                 → comprehensiveResults.mlModels
results.executiveSummary         → comprehensiveResults.executiveSummary
journeyProgress.businessKPIs     → comprehensiveResults.businessKPIs
    ↓
ArtifactGenerator.generateArtifacts({ comprehensiveResults })
    ↓
generatePDFReport() uses comprehensiveResults to build complete report
```

---

## Appendix: Console Debugging Indicators

Check for these logs to verify data flow:

```
✅ Working indicators:
📋 [DataElementsMappingUI] Restoring X saved mappings
🔒 [PII Frontend] Saving PII decisions
📊 [Progress] Updating journey progress for project
📋 [GAP 5 FIX] Using X question mappings
🔬 DataScienceOrchestrator: Running correlation_analysis.py
📦 Artifact generation config: { hasBusinessKPIs: true }
🎨 Generating artifacts for project...
✅ Artifacts generated successfully

❌ Problem indicators:
📋 [DataElementsMappingUI] Restoring 0 saved mappings (after refresh)
⚠️ [PII] No piiMaskingChoices found in dataset
📊 [Week4] Using original data (fallback) for analysis
📦 Artifact generation config: { hasBusinessKPIs: false } - KPIs not generated
❌ Failed to generate artifacts - PDF generation failed
```
