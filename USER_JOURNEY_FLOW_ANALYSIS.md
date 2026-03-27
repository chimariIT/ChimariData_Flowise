# User Journey Flow Analysis & Friction Points Fixed
**Date**: March 27, 2026
**Scope**: Goals/Questions → Data Insights → Payment Processing

---

## Complete User Journey Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           USER JOURNEY FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  1. PREPARE STEP (/journeys/:type/prepare)                                      │
│     ├── User enters: analysisGoal, businessQuestions, audience                  │
│     ├── Auto-generate: requirementsDocument (AI analysis recommendations)        │
│     ├── Extract: analysis types from analysisPath                               │
│     └── Save to: journeyProgress SSOT                                           │
│                                                                                 │
│  2. DATA UPLOAD → VERIFICATION → TRANSFORMATION → PLAN                          │
│     ├── Upload: CSV/Excel files                                                 │
│     ├── Verify: PII detection, data quality                                    │
│     ├── Transform: Column mappings, data type conversions                       │
│     └── Plan: Review execution plan, costs, approve for execution               │
│                                                                                 │
│  3. EXECUTE STEP (/journeys/:type/execute)                                     │
│     ├── Payment Check: isPaid OR subscription OR trial                          │
│     ├── Select analysis types                                                   │
│     ├── Execute: Python scripts via DataScienceOrchestrator                    │
│     └── Return: insights, correlations, visualizations                         │
│                                                                                 │
│  4. PAYMENT FLOW (if required)                                                  │
│     ├── User: Completes Stripe payment                                         │
│     ├── Stripe: Redirects to /projects/:id?payment_intent=pi_xxx&redirect_status=succeeded │
│     ├── Frontend: Auto-detects payment, verifies with backend                  │
│     ├── Backend: Sets isPaid=true in DB + journeyProgress SSOT                  │
│     └── Auto-trigger: Execute analysis immediately                             │
│                                                                                 │
│  5. RESULTS (/journeys/:type/results)                                           │
│     ├── Display: AI insights, recommendations                                   │
│     ├── Tabs: Chat (paid), Visualizations (paid), Data Schema (free)           │
│     └── Gating: unpaid users see preview, locked tabs                          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Friction Points Found & Fixed

### ✅ Friction Point #1: Payment Auto-Trigger Broken (FIXED)

**Location**: `client/src/pages/execute-step.tsx:1564`

**Issue**:
```typescript
// BEFORE (BROKEN)
if (!paymentSuccess || !resolvedProjectId || paymentVerified || ...) return;
```

The code only checked for `?payment=success` query parameter, but Stripe Elements redirects with:
- `?payment_intent=pi_xxx&redirect_status=succeeded`

**Result**: Payment auto-trigger NEVER worked for Stripe Elements flow!

**Fix Applied**:
```typescript
// AFTER (FIXED)
const isCheckoutSuccess = paymentSuccess && sessionId;
const isStripeIntentSuccess = redirectStatus === 'succeeded' && paymentIntentId;
const shouldVerifyPayment = isCheckoutSuccess || isStripeIntentSuccess;

if (!shouldVerifyPayment || !resolvedProjectId || ...) return;
```

**Impact**: After payment completes, analysis now auto-executes without user intervention.

---

## Additional Friction Points (Identified, Not Critical)

### ⚠️ Friction Point #2: Backend Transition Partial

**Issue**: Python backend (port 8000) is primary, but some endpoints still use Node.js:
- `/api/analysis-execution/results` - Falls back to Node.js (line 96-100 of project-results.tsx)
- `/api/payment/verify-session` - Only available in Node.js

**Impact**: Mixed backend usage, potential CORS issues if Node.js backend not running

**Recommendation**: Complete Python backend migration for all endpoints

---

### ⚠️ Friction Point #3: Results Gating Logic

**Location**: `client/src/pages/project-results.tsx:669-671`

**Current Logic**:
```typescript
const isPaid = (project as any)?.isPaid === true;
const isPreview = (analysisResults as any)?.isPreview === true;
const lockedTabs = !isPaid && isPreview ? new Set(['chat', 'visualizations']) : new Set<string>();
```

**Issue**: Complex dual-condition gating. If `isPreview` is missing from response, tabs won't lock properly.

**Recommendation**: Simplify to single source of truth from backend response

---

## Key API Endpoints

### Payment Flow
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/payment/verify-session` | POST | Verify Stripe session/payment intent |
| `/api/projects/:id/cost-estimate` | GET | Get analysis cost estimate |
| `/api/analysis-execution/execute` | POST | Execute analysis (checks payment) |
| `/api/analysis-execution/results/:id` | GET | Get results (returns isPreview flag) |

### Journey Progress
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/projects/:id/journey-state` | GET | Get journeyProgress (SSOT) |
| `/api/projects/:id/questions` | POST | Save user questions |

---

## Testing Checklist

### Payment Flow
- [ ] User completes payment in Stripe
- [ ] Stripe redirects to `/projects/:id?payment_intent=pi_xxx&redirect_status=succeeded`
- [ ] Execute step auto-detects payment
- [ ] Backend verifies payment with Stripe API
- [ ] Backend sets `isPaid=true` in DB and journeyProgress
- [ ] Analysis auto-executes
- [ ] User navigated to results

### Results Display
- [ ] Paid users see all tabs unlocked
- [ ] Unpaid users see preview only
- [ ] Chat/Visualizations tabs show lock icon for unpaid
- [ ] Clicking locked tab shows payment prompt

### Backend Selection
- [ ] Vite proxy routes `/api/*` to Python backend (8000)
- [ ] Health check responds: `curl http://localhost:8000/health`
- [ ] Frontend feature flag: `VITE_USE_PYTHON_BACKEND=true`

---

## Files Modified

1. **client/src/pages/execute-step.tsx** (lines 1564-1571)
   - Fixed payment auto-trigger to support Stripe Elements redirect

---

## Test Results

### Unit Tests: Payment Redirect Logic ✅
**File**: `tests/payment-redirect-logic.spec.ts`
**Result**: 54/54 tests passed

Tests cover:
- Stripe Elements flow (`redirect_status=succeeded`) ✅
- Checkout Session flow (`payment=success`) ✅
- Failed payments not triggering ✅
- Edge cases (missing params, mixed parameters) ✅
- Real-world scenarios ✅
- Regression tests (bug fix verified) ✅

```bash
$ npx playwright test payment-redirect-logic
Running 54 tests using 2 workers
✅ 54 passed (13.2s)
```

---

## References

- **Payment Flow**: `server/routes/payment.ts:266-282`
- **Analysis Execution**: `server/routes/analysis-execution.ts:220-361`
- **Results Gating**: `server/routes/analysis-execution.ts:915-979`
- **Journey Routing**: `client/src/utils/journey-routing.ts`
- **Vite Proxy**: `vite.config.ts:111-148`
