# Production Readiness Audit - User Journey Steps

**Audit Date:** December 30, 2025
**Overall Readiness Score: 6.8/10**
**Status:** NOT PRODUCTION READY - Critical fixes required

---

## Executive Summary

The 8-step user journey has significant data flow issues, missing endpoints, and incomplete integrations that would cause user confusion and stuck journeys in production. The core issues are:

1. **Data continuity breaks** between steps (data saved but not loaded by next step)
2. **Missing API endpoints** referenced by frontend code
3. **Payment flow incomplete** (can't verify payment success)
4. **Artifact generation async** with no notification mechanism
5. **Race conditions** in step transitions

---

## Step-by-Step Readiness Scores

| Step | Name | Score | Critical Issues |
|------|------|-------|-----------------|
| 1 | Data Upload | 8.5/10 | Agent-recommendations signature mismatch |
| 2 | Prepare | 6.5/10 | Race conditions, hardcoded delays |
| 3 | Verification | 6.5/10 | **MISSING endpoint**, fallback issues |
| 4 | Transformation | 7.0/10 | Checkpoint bypass, no validation |
| 5 | Plan | 8.5/10 | Plan regeneration not implemented |
| 6 | Execute | 6.0/10 | No atomic transactions, no timeouts |
| 7 | Pricing | 6.5/10 | **Payment verification missing** |
| 8 | Dashboard | 6.5/10 | Fragmented data flow, async gaps |

---

## CRITICAL ISSUES (Must Fix Before Production)

### Issue #1: Missing `enhance-requirements-mappings` Endpoint
**Location:** Step 3 (Verification)
**Severity:** CRITICAL
**Impact:** Frontend calls endpoint that doesn't exist

**Problem:**
```typescript
// client/src/pages/data-verification-step.tsx line 525
const response = await apiClient.post(`/api/projects/${projectId}/enhance-requirements-mappings`, {...});
```

**Fix Required:** Create endpoint in `server/routes/data-verification.ts`:
```typescript
router.post('/api/projects/:projectId/enhance-requirements-mappings', ensureAuthenticated, async (req, res) => {
  // Implement AI-enhanced mapping suggestions
});
```

---

### Issue #2: Payment Verification Flow Missing
**Location:** Step 7 (Pricing)
**Severity:** CRITICAL
**Impact:** Users complete Stripe payment but journey doesn't advance

**Problems:**
1. No `/api/payment/verify-session` endpoint
2. No handler for `?payment=success` URL parameter after Stripe redirect
3. Webhook doesn't handle `payment_intent.succeeded` events
4. `journeyProgress.paymentStatus` never updated after payment

**Fix Required:**
1. Create payment verification endpoint
2. Add client-side payment success handler
3. Add webhook handler for payment_intent events
4. Update journey progress after successful payment

---

### Issue #3: Step Transition Race Conditions
**Location:** Steps 2-3 transition, Steps 5-6 transition
**Severity:** CRITICAL
**Impact:** Data saved but not available when next step loads

**Problem:**
```typescript
// prepare-step.tsx: Updates progress then immediately navigates
updateProgress({ currentStep: 'data-verification', ... });
if (onNext) onNext();  // Navigates before data persists
```

**Fix Required:**
- Use `updateProgressAsync` (mutateAsync) and await before navigation
- Add explicit cache invalidation before navigation
- Add retry logic in destination step

---

### Issue #4: Artifact Generation Async with No Notification
**Location:** Step 6 to Step 8
**Severity:** CRITICAL
**Impact:** Users see "No Results" or "Still Generating" indefinitely

**Problem:**
```typescript
// analysis-execution.ts line 121
setImmediate(async () => {
  await artifactGenerator.generateAllArtifacts(...);
  // No notification sent to client
});
```

**Fix Required:**
1. Emit WebSocket event when artifact generation completes
2. Add polling with exponential backoff in dashboard
3. Implement proper "generating" vs "complete" status tracking

---

### Issue #5: No Atomic Transactions in Execution
**Location:** Step 6 (Execute)
**Severity:** HIGH
**Impact:** Partial execution results on error leave database inconsistent

**Problem:** Analysis execution runs multiple Python scripts sequentially without transaction wrapper.

**Fix Required:**
- Wrap execution in database transaction
- Implement rollback on failure
- Add retry mechanism for transient failures

---

## MAJOR ISSUES (Fix Before GA)

### Issue #6: Agent-Recommendations Endpoint Signature Mismatch
**Location:** Step 1 (Data Upload)
**Problem:** Frontend sends `{ projectId, datasetId }` but backend expects `{ datasetId }` in params

### Issue #7: Hardcoded 300ms Delay in Prepare Step
**Location:** Step 2, line 665
**Problem:** `await new Promise(resolve => setTimeout(resolve, 300))` - arbitrary delay masking real issue

### Issue #8: Plan Regeneration Not Implemented
**Location:** Step 5 (Plan)
**Problem:** "Regenerate Plan" button exists but `handleRegeneratePlan()` is empty

### Issue #9: Execute Step Ignores analysisSteps
**Location:** Step 6
**Problem:** Frontend passes `analysisSteps` from plan but execution ignores it

### Issue #10: Cost Calculation Mismatch
**Location:** Step 7
**Problem:** Client calculates cost differently than server, could show wrong price

### Issue #11: Dashboard Multiple Data Sources
**Location:** Step 8
**Problem:** Loads from API, journeyProgress, and artifacts separately without clear precedence

---

## DATA FLOW GAPS

### Step 1 → Step 2: Datasets
- **Expected:** `datasets[]`, `projectId`, `piiExclusions`
- **Status:** WORKING

### Step 2 → Step 3: Requirements
- **Expected:** `requiredDataElements[]`, `userQuestions[]`, `audience`
- **Status:** RACE CONDITION - data may not be persisted before Step 3 loads

### Step 3 → Step 4: Mappings
- **Expected:** `dataElementMappings[]`, `dataQualityApproved`
- **Status:** WORKING (but enhance-mappings endpoint missing)

### Step 4 → Step 5: Transformations
- **Expected:** `transformationRules[]`, `transformedData`
- **Status:** PARTIAL - checkpoint can be bypassed

### Step 5 → Step 6: Plan
- **Expected:** `executionPlan`, `expectedArtifacts[]`, `estimatedCosts`
- **Status:** PARTIAL - analysisSteps ignored in execution

### Step 6 → Step 7: Results
- **Expected:** `analysisResults[]`, `executionMetrics`
- **Status:** WORKING (costs flow through)

### Step 7 → Step 8: Payment
- **Expected:** `paymentStatus: 'paid'`, `paymentCompletedAt`
- **Status:** BROKEN - payment status never updated after Stripe success

---

## MISSING ENDPOINTS

| Endpoint | Called By | Status |
|----------|-----------|--------|
| `POST /api/projects/:id/enhance-requirements-mappings` | data-verification-step.tsx:525 | MISSING |
| `GET /api/payment/verify-session` | (needed) | MISSING |
| `POST /api/analysis-execution/:id/regenerate-plan` | plan-step.tsx | MISSING |

---

## RECOMMENDED FIX ORDER

### Phase 1: Critical Path (Week 1)
1. Create `enhance-requirements-mappings` endpoint
2. Implement payment verification flow
3. Fix step transition race conditions (async mutations)
4. Add artifact completion WebSocket events
5. Wrap execution in database transaction

### Phase 2: Data Integrity (Week 2)
6. Fix agent-recommendations endpoint signature
7. Implement plan regeneration
8. Connect analysisSteps to execution service
9. Unify cost calculation logic
10. Consolidate dashboard data sources

### Phase 3: Polish (Week 3)
11. Remove hardcoded delays
12. Add proper error recovery flows
13. Implement checkpoint enforcement
14. Add execution timeouts
15. Improve artifact polling with exponential backoff

---

## TESTING CHECKLIST

Before production, verify these scenarios:

### Happy Path
- [ ] Upload 2 datasets, join them, complete PII review
- [ ] Enter analysis goals, see PM recommendations appear
- [ ] Map data elements, approve quality
- [ ] Define transformations, approve checkpoint
- [ ] Review execution plan, see accurate cost estimate
- [ ] Execute analysis, see real-time progress
- [ ] Complete payment, verify redirect works
- [ ] View all artifacts in dashboard, download works

### Error Paths
- [ ] Network timeout during file upload - recovery works
- [ ] API failure during step transition - data not lost
- [ ] Payment cancelled - can retry without restart
- [ ] Artifact generation fails - user sees clear error
- [ ] Browser refresh mid-journey - resumes correctly

### Edge Cases
- [ ] Zero-cost analysis (covered by subscription) - journey completes
- [ ] Large dataset (>1000 rows) - no timeout
- [ ] Back navigation - data preserved
- [ ] Multiple simultaneous users on same project

---

## FILES REQUIRING CHANGES

### Critical
- `server/routes/data-verification.ts` - Add enhance-mappings endpoint
- `server/routes/payment.ts` - Add verify-session endpoint
- `client/src/pages/pricing-step.tsx` - Add payment success handler
- `server/routes/stripe-webhooks.ts` - Add payment_intent handler
- `client/src/pages/prepare-step.tsx` - Use async mutation

### Major
- `server/routes/agent.ts` - Fix agent-recommendations signature
- `client/src/pages/plan-step.tsx` - Implement regenerate
- `server/services/analysis-execution.ts` - Use analysisSteps, add transactions
- `client/src/pages/dashboard-step.tsx` - Consolidate data sources

### Minor
- `client/src/pages/data-verification-step.tsx` - Add retry logic
- `client/src/pages/data-transformation-step.tsx` - Enforce checkpoint
- `server/realtime.ts` - Add artifact completion events

---

## CONCLUSION

The user journey is **approximately 70% production ready**. The core workflows exist but data continuity and error handling are insufficient for real users. Primary risks:

1. **Payment stuck** - Users pay but journey doesn't advance
2. **Data lost** - Step transitions may lose user progress
3. **Empty dashboards** - Async artifact generation not signaled

**Recommendation:** Fix Phase 1 issues before any production deployment. Current state would generate significant support burden.
