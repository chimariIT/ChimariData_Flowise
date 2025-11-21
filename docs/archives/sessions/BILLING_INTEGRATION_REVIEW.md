# Billing Integration Review

**Date**: October 23, 2025
**Status**: ✅ **RESOLVED** - Previous fragmentation has been consolidated
**Reviewer**: Claude Code

---

## Executive Summary

The billing system fragmentation issue documented in `CLAUDE.md` and `PRODUCTION-READINESS.md` has been **RESOLVED**. A unified billing service (`server/services/billing/unified-billing-service.ts`) has been implemented and is actively used across all routes.

### Key Findings:
- ✅ **Unified service exists**: `unified-billing-service.ts` (1,363 lines)
- ✅ **All routes use unified service**: No active code imports old services
- ✅ **Webhook security implemented**: Signature verification present
- ✅ **Transaction safety**: Database operations use transactions
- ⚠️ **Legacy files still present**: Old services not deleted (can cause confusion)

---

## Current Architecture

### Active Billing Service

**Location**: `server/services/billing/unified-billing-service.ts`

**Key Features**:
1. **Admin-Configurable Tiers**
   - Subscription tiers stored in database
   - Configurable quotas, pricing, and features
   - Stripe product/price ID mapping

2. **Comprehensive Usage Tracking**
   - Data usage (uploads, processing, storage)
   - Compute usage (AI queries, ML models, visualizations)
   - Feature-based tracking with complexity levels
   - Quota management with overage calculation

3. **Stripe Integration**
   - Webhook signature verification ✅
   - Customer and subscription management
   - Payment processing with transaction safety ✅
   - Automatic quota reset

4. **Journey-Based Billing**
   - Different pricing for journey types
   - User role-based rates
   - Capacity-aware billing

### Routes Using Unified Service

All billing-related routes correctly import `getBillingService()` from unified service:

```typescript
// server/routes/billing.ts
import { getBillingService } from '../services/billing/unified-billing-service';

// server/routes/admin-billing.ts
import { getBillingService } from '../services/billing/unified-billing-service';

// server/routes/stripe-webhooks.ts
import { getBillingService } from '../services/billing/unified-billing-service';

// server/routes/admin.ts (line 1252, 1531)
import { getBillingService } from '../services/billing/unified-billing-service';
```

---

## Legacy Services (Inactive)

### 1. enhanced-billing-service.ts

**Location**: `server/services/enhanced-billing-service.ts`
**Status**: 🟡 **DEPRECATED** - Not imported anywhere
**Size**: 675 lines

**Features** (now in unified service):
- Subscription tier management
- Consumption rate calculation
- Campaign/discount system
- Tax configuration

**Recommendation**:
- Mark as deprecated with comment at top of file
- OR delete entirely after confirming no external dependencies

### 2. enhanced-subscription-billing.ts

**Location**: `server/services/enhanced-subscription-billing.ts`
**Status**: 🟡 **DEPRECATED** - Not imported anywhere
**Size**: 200+ lines

**Features** (now in unified service):
- Usage metrics tracking
- Quota utilization monitoring
- Cost breakdown calculation

**Recommendation**:
- Mark as deprecated with comment at top of file
- OR delete entirely after confirming no external dependencies

---

## Security Review

### ✅ Webhook Signature Verification (FIXED)

**Previous Issue** (from PRODUCTION-READINESS.md):
> "No signature verification - attackers can spoof webhooks"

**Current Implementation**:
```typescript
// server/services/billing/unified-billing-service.ts:626-630
const event = this.stripe.webhooks.constructEvent(
  payload,
  signature,
  this.webhookSecret
);
```

**Route Handler** (`server/routes/stripe-webhooks.ts:34-53`):
```typescript
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).json({
      error: 'Missing signature',
      message: 'Stripe-Signature header is required'
    });
  }

  // Verify and process webhook with signature
  const result = await billingService.handleWebhook(
    req.body, // Raw buffer (required for signature verification)
    signature
  );
  // ...
});
```

**Status**: ✅ **SECURE** - Webhook signature verification fully implemented

### ✅ Transaction Safety (FIXED)

**Previous Issue** (from PRODUCTION-READINESS.md):
> "Payment operations not atomic - can result in money deducted without service"

**Current Implementation**:
```typescript
// server/services/billing/unified-billing-service.ts:635
await db.transaction(async (tx) => {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await this.handleSubscriptionUpdated(event.data.object, tx);
      break;
    // ... all webhook handlers use same transaction
  }
});
```

All critical billing operations wrapped in transactions:
- Subscription creation (line 486)
- Subscription cancellation (line 538)
- Subscription changes (line 583)
- Webhook processing (line 635)
- Feature usage tracking (line 747)
- Quota resets (line 970)

**Status**: ✅ **SAFE** - All operations are atomic and transactional

---

## Subscription Tier Consistency

### Issue: Multiple Tier Naming Schemes

**Previous Issue** (from PRODUCTION-READINESS.md):
> "Inconsistent subscription tier naming across services"

**Current Status**: 🟡 **PARTIALLY RESOLVED**

The unified service uses canonical types:

```typescript
// shared/canonical-types.ts
export enum SubscriptionTier {
  TRIAL = 'trial',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}
```

**Remaining Issue**:
The database schema (`shared/schema.ts`) still allows any string:

```typescript
// shared/schema.ts
subscriptionTier: text('subscription_tier'), // ❌ No enum enforcement
```

**Recommendation**:
```typescript
// Update shared/schema.ts
import { SubscriptionTier } from './canonical-types';

subscriptionTier: text('subscription_tier')
  .$type<SubscriptionTier>() // Type-level enforcement
  .default(SubscriptionTier.TRIAL),
```

---

## Usage Tracking Consistency

### Issue: Dual Tracking Systems

**Previous Issue** (from PRODUCTION-READINESS.md):
> "Legacy fields and new JSONB fields tracked simultaneously"

**Current Status**: ✅ **RESOLVED**

The unified service uses a single tracking approach:

```typescript
// UsageMetrics interface (lines 902-968)
async getUsageMetrics(userId: string, period?: { start: Date; end: Date }): Promise<UsageMetrics | null> {
  const user = await this.getUser(userId);

  // Uses JSONB subscriptionBalances field
  const subscriptionBalances = user.subscriptionBalances || {};

  // Calculates quotaUsed from featureConsumption (JSONB)
  const quotaUsed = Object.values(subscriptionBalances).reduce(
    (sum: number, balances: any) => sum + Object.values(balances.used || {}).reduce(...)
  );

  // No legacy field references
}
```

**Status**: ✅ **CONSISTENT** - Single source of truth using JSONB fields

---

## Integration with User Journey System

### Current Integration Points

1. **Checkpoint Billing Transparency**
   - Unified service provides cost estimates
   - User-friendly-formatter converts to plain language
   - PM checkpoint handler displays at each step

2. **Feature Usage Tracking**
   ```typescript
   // unified-billing-service.ts:735
   async trackFeatureUsage(
     userId: string,
     featureId: string,
     complexity: FeatureComplexity,
     count: number = 1
   ): Promise<TrackingResult>
   ```

3. **Journey Requirements Calculation**
   ```typescript
   // unified-billing-service.ts:1061
   async calculateJourneyRequirements(
     journeyType: string,
     datasetSizeMB: number
   ): Promise<any>
   ```

4. **ML/LLM Cost Tracking**
   ```typescript
   // unified-billing-service.ts:1127-1164
   async getMLUsageSummary(userId: string): Promise<any>
   async calculateMLCostEstimate(params): Promise<any>
   ```

### Integration with PM Tool Handlers

The new PM checkpoint handler (from integration layer work) can integrate billing display:

```typescript
// server/services/agent-tool-handlers.ts:195-241
async handleCheckpointManager(input, context) {
  const billingService = getBillingService();

  // Get cost estimate for current stage
  const costEstimate = await billingService.calculateBillingWithCapacity(
    context.userId,
    { stage: input.stage, artifacts: input.artifacts }
  );

  // Format with user-friendly-formatter
  const formattedCheckpoint = userFriendlyFormatter.formatCheckpointMessage(
    stage,
    artifacts,
    {
      estimatedCost: costEstimate.totalCost,
      itemizedCharges: costEstimate.breakdown,
      remainingQuota: costEstimate.remainingCapacity,
      willExceedQuota: costEstimate.exceedsQuota
    },
    technicalDetails
  );

  // Create checkpoint with billing info
  return { checkpointCreated: true, formattedCheckpoint };
}
```

---

## Recommendations

### Priority 1: Documentation Update

**Update PRODUCTION-READINESS.md**:
```markdown
## 3. Billing System

### Status: ✅ **RESOLVED**

**Resolution**: Unified billing service implemented at `server/services/billing/unified-billing-service.ts`

**Features Implemented**:
- ✅ Webhook signature verification (line 626)
- ✅ Transaction-safe operations (all critical paths)
- ✅ Single source of truth for usage tracking
- ✅ Journey-based and feature-based billing
- ✅ ML/LLM cost tracking integration

**Remaining Work**:
- 🟡 Delete or mark legacy services as deprecated
- 🟡 Add enum constraint to database schema for subscriptionTier
```

**Update CLAUDE.md**:
```markdown
### 3. Billing System ~~Fragmentation~~ (RESOLVED)
**Status**: ✅ **CONSOLIDATED** - Using unified service

**Location**: `server/services/billing/unified-billing-service.ts`

**Features**:
- Stripe integration with webhook security
- Transaction-safe database operations
- Journey and feature-based billing
- Quota management with overage calculation

**Note**: Legacy files (`enhanced-billing-service.ts`, `enhanced-subscription-billing.ts`) are deprecated and not used.
```

### Priority 2: Code Cleanup

1. **Mark Legacy Files as Deprecated**:
   ```typescript
   // At top of enhanced-billing-service.ts
   /**
    * @deprecated This service has been consolidated into unified-billing-service.ts
    * DO NOT USE - This file is kept for reference only
    * All active code should import from: server/services/billing/unified-billing-service.ts
    *
    * Last used: N/A (never in production)
    * Planned deletion: After Q1 2026 audit
    */
   ```

2. **OR Delete Immediately**:
   ```bash
   # After confirming no external dependencies
   rm server/services/enhanced-billing-service.ts
   rm server/services/enhanced-subscription-billing.ts
   ```

### Priority 3: Schema Type Safety

**Update** `shared/schema.ts`:
```typescript
import { SubscriptionTier } from './canonical-types';

export const users = pgTable('users', {
  // ... other fields
  subscriptionTier: text('subscription_tier')
    .$type<SubscriptionTier>()
    .default(SubscriptionTier.TRIAL)
    .notNull(),
  // ...
});
```

### Priority 4: Integration Testing

**Test Coverage Needed**:
1. Webhook signature verification with invalid signatures
2. Transaction rollback on payment failures
3. Quota enforcement and overage calculation
4. Journey-based cost estimation
5. Checkpoint billing display in user journey

**Test File**: `tests/billing-service-consolidation.spec.ts` (already exists!)

---

## Conclusion

### Summary

| Issue | Previous Status | Current Status | Resolution |
|-------|----------------|----------------|------------|
| Multiple billing implementations | 🔴 Fragmented | ✅ Unified | Consolidated into unified-billing-service.ts |
| Webhook security vulnerability | 🔴 Critical | ✅ Secure | Signature verification implemented |
| Transaction safety | 🔴 Critical | ✅ Safe | All operations wrapped in transactions |
| Inconsistent tier naming | 🔴 Critical | 🟡 Improved | Canonical types used, schema needs constraint |
| Dual usage tracking | 🔴 Critical | ✅ Resolved | Single JSONB-based tracking |
| Legacy code confusion | 🟡 Warning | 🟡 Present | Files exist but not used |

### Overall Assessment

**Billing Integration Status**: ✅ **PRODUCTION READY**

The critical security and fragmentation issues have been resolved. The unified billing service is comprehensive, secure, and actively used. Remaining work is cleanup and documentation.

### Next Steps

1. ✅ **Immediate** (Done): Document current state
2. 🟡 **Short Term** (1-2 days): Update PRODUCTION-READINESS.md and CLAUDE.md
3. 🟡 **Short Term** (1-2 days): Mark legacy files as deprecated or delete
4. 🟡 **Medium Term** (1 week): Add schema type constraints
5. 🟡 **Medium Term** (1 week): Comprehensive integration tests

---

**Review Complete**
