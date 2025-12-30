# Detailed Execution Plan for Critical Fixes

**Generated**: November 30, 2025
**Based On**: CRITICAL_ISSUES_AND_FIXES.md
**Total Estimated Time**: 4-6 days for all phases

This document provides step-by-step instructions for implementing each fix, including file locations, code changes, testing procedures, and rollback strategies.

---

## 📋 Table of Contents

- [Phase 1: CRITICAL Fixes (Days 1-3)](#phase-1-critical-fixes-days-1-3)
  - [Fix #1: Billing Service Files](#fix-1-billing-service-files)
  - [Fix #2: Journey Type Routing](#fix-2-journey-type-routing)
  - [Fix #5: Real Stripe Integration](#fix-5-real-stripe-integration)
  - [Fix #6: Unified Data Retrieval](#fix-6-unified-data-retrieval)
- [Phase 2: HIGH Priority Fixes (Days 4-5)](#phase-2-high-priority-fixes-days-4-5)
- [Phase 3: MEDIUM Priority Fixes (Day 6)](#phase-3-medium-priority-fixes-day-6)
- [Phase 4: Component Fixes (Additional 0.5 day)](#phase-4-component-fixes-additional-05-day)

---

## Phase 1: CRITICAL Fixes (Days 1-3)

### Fix #1: Billing Service Files

**Estimated Time**: 4-8 hours
**Priority**: 🔴 P0
**Blocker**: ALL payment flows

#### Step 1.1: Locate Existing Billing Files (30 min)

**Search Strategy**:

```bash
# Search entire server directory
find server -name "*billing*" -type f
find server -name "*pricing*" -type f
find server -name "*payment*" -type f

# Windows PowerShell alternative:
Get-ChildItem -Path server -Recurse -Filter "*billing*"
Get-ChildItem -Path server -Recurse -Filter "*pricing*"
Get-ChildItem -Path server -Recurse -Filter "*payment*"

# Search for imports in route files
grep -r "import.*billing" server/routes/
grep -r "import.*pricing" server/routes/
```

**Expected Outcomes**:
- Option A: Files exist in `server/` root (legacy location)
- Option B: Files exist elsewhere with different names
- Option C: Files truly missing (need to create)

---

#### Step 1.2A: If Files Found in Legacy Location (2 hours)

**Files to Move**:
```
server/billing-service.ts           → server/services/billing/unified-billing-service.ts
server/pricing-service.ts           → server/services/pricing.ts
server/payment-processor.ts         → server/services/payment-processor.ts
```

**Migration Steps**:

1. **Create directory structure**:
```bash
mkdir -p server/services/billing
```

2. **Move files with Git (preserves history)**:
```bash
git mv server/billing-service.ts server/services/billing/unified-billing-service.ts
git mv server/pricing-service.ts server/services/pricing.ts
```

3. **Update exports in moved files**:
```typescript
// server/services/billing/unified-billing-service.ts
// ADD at bottom if missing:
export function getBillingService() {
  return billingService; // or singleton instance
}
```

4. **Update all imports**:
```bash
# Find all files importing old paths
grep -r "from.*['\"].*\/billing-service" server/
grep -r "from.*['\"].*\/pricing-service" server/

# Replace (example):
# Before: import { getBillingService } from '../billing-service';
# After:  import { getBillingService } from '../services/billing/unified-billing-service';
```

5. **Test compilation**:
```bash
npm run check
```

---

#### Step 1.2B: If Files Truly Missing (4-6 hours)

**Create `server/services/billing/unified-billing-service.ts`**:

```typescript
import Stripe from 'stripe';
import { storage } from '../../storage';
import { db } from '../../db';
import { users, projects } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
});

interface UsageSummary {
  dataUsage: {
    totalUploadSizeMB: number;
    totalProjects: number;
  };
  computeUsage: {
    toolExecutions: number;
    aiQueries: number;
  };
}

interface CapacitySummary extends UsageSummary {
  dataQuota: {
    maxDataUploadsMB: number;
    maxProjects: number;
  };
  computeQuota: {
    maxAIQueries: number;
    maxToolExecutions: number;
  };
  tier: string;
}

class UnifiedBillingService {
  private static instance: UnifiedBillingService;

  private constructor() {}

  static getInstance(): UnifiedBillingService {
    if (!UnifiedBillingService.instance) {
      UnifiedBillingService.instance = new UnifiedBillingService();
    }
    return UnifiedBillingService.instance;
  }

  /**
   * Get user's current usage summary
   */
  async getUserUsageSummary(userId: string): Promise<UsageSummary> {
    try {
      // Get user's projects
      const userProjects = await db.select()
        .from(projects)
        .where(eq(projects.userId, userId));

      // Calculate data usage
      let totalUploadSizeMB = 0;
      userProjects.forEach(project => {
        if (project.data && Array.isArray(project.data)) {
          // Estimate size (rough calculation)
          const sizeEstimate = JSON.stringify(project.data).length / (1024 * 1024);
          totalUploadSizeMB += sizeEstimate;
        }
      });

      // Get compute usage (simplified - enhance with actual tracking)
      const computeUsage = {
        toolExecutions: 0, // TODO: Track from usage logs
        aiQueries: 0       // TODO: Track from AI service
      };

      return {
        dataUsage: {
          totalUploadSizeMB: Math.round(totalUploadSizeMB * 100) / 100,
          totalProjects: userProjects.length
        },
        computeUsage
      };
    } catch (error) {
      console.error('Error getting usage summary:', error);
      throw error;
    }
  }

  /**
   * Get user's capacity summary (usage + quotas)
   */
  async getUserCapacitySummary(userId: string): Promise<CapacitySummary> {
    try {
      const usage = await this.getUserUsageSummary(userId);

      // Get user tier
      const user = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const tier = user[0]?.subscriptionTier || 'trial';

      // Define quotas based on tier
      const quotas = this.getTierQuotas(tier);

      return {
        ...usage,
        dataQuota: quotas.data,
        computeQuota: quotas.compute,
        tier
      };
    } catch (error) {
      console.error('Error getting capacity summary:', error);
      throw error;
    }
  }

  /**
   * Get tier quotas
   */
  private getTierQuotas(tier: string) {
    const quotaMap: Record<string, any> = {
      trial: {
        data: { maxDataUploadsMB: 100, maxProjects: 2 },
        compute: { maxAIQueries: 5, maxToolExecutions: 10 }
      },
      starter: {
        data: { maxDataUploadsMB: 500, maxProjects: 10 },
        compute: { maxAIQueries: 50, maxToolExecutions: 100 }
      },
      professional: {
        data: { maxDataUploadsMB: 5000, maxProjects: 50 },
        compute: { maxAIQueries: 500, maxToolExecutions: 1000 }
      },
      enterprise: {
        data: { maxDataUploadsMB: 50000, maxProjects: 999 },
        compute: { maxAIQueries: 9999, maxToolExecutions: 9999 }
      }
    };

    return quotaMap[tier] || quotaMap.trial;
  }

  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    try {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const session = await stripe.checkout.sessions.create({
        customer_email: user[0]?.email,
        client_reference_id: userId,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId
        }
      });

      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook event
   */
  async handleWebhookEvent(event: Stripe.Event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id || session.metadata?.userId;
    if (!userId) return;

    // Update user subscription in database
    await db.update(users)
      .set({
        subscriptionTier: 'professional', // Map from price ID
        subscriptionStatus: 'active'
      })
      .where(eq(users.id, userId));
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    // Handle subscription updates
    console.log('Subscription updated:', subscription.id);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    // Handle subscription cancellation
    console.log('Subscription deleted:', subscription.id);
  }
}

export function getBillingService(): UnifiedBillingService {
  return UnifiedBillingService.getInstance();
}

export { UnifiedBillingService };
```

**Create `server/services/pricing.ts`**:

```typescript
import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export class PricingService {
  private static instance: PricingService;

  private constructor() {}

  static getInstance(): PricingService {
    if (!PricingService.instance) {
      PricingService.instance = new PricingService();
    }
    return PricingService.instance;
  }

  /**
   * Get pricing tiers
   */
  async getTiers() {
    return [
      {
        id: 'trial',
        name: 'Trial',
        price: 0,
        priceId: null,
        features: [
          '100 MB data upload',
          '5 AI queries',
          '2 projects',
          'Email support'
        ]
      },
      {
        id: 'starter',
        name: 'Starter',
        price: 29,
        priceId: process.env.STRIPE_STARTER_PRICE_ID,
        features: [
          '500 MB data upload',
          '50 AI queries',
          '10 projects',
          'Priority email support'
        ]
      },
      {
        id: 'professional',
        name: 'Professional',
        price: 99,
        priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
        features: [
          '5 GB data upload',
          '500 AI queries',
          '50 projects',
          'Priority support',
          'Advanced analysis'
        ]
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: null,
        priceId: null,
        features: [
          'Unlimited data',
          'Unlimited queries',
          'Unlimited projects',
          'Dedicated support',
          'Custom integrations'
        ]
      }
    ];
  }

  /**
   * Calculate journey cost
   */
  async calculateJourneyCost(journeyType: string, complexity: string) {
    const costs: Record<string, Record<string, number>> = {
      ai_guided: { simple: 10, moderate: 25, complex: 50 },
      template_based: { simple: 15, moderate: 35, complex: 75 },
      self_service: { simple: 5, moderate: 15, complex: 30 },
      consultation: { simple: 100, moderate: 250, complex: 500 }
    };

    return costs[journeyType]?.[complexity] || 0;
  }

  /**
   * Check if user can access feature
   */
  async canUserAccessFeature(userId: string, featureId: string): Promise<boolean> {
    const user = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const tier = user[0]?.subscriptionTier || 'trial';

    const tierFeatures: Record<string, string[]> = {
      trial: ['basic_upload', 'basic_analysis'],
      starter: ['basic_upload', 'basic_analysis', 'templates', 'export'],
      professional: ['basic_upload', 'basic_analysis', 'templates', 'export', 'advanced_analysis', 'ml_models'],
      enterprise: ['*'] // All features
    };

    if (tierFeatures[tier]?.includes('*')) return true;
    return tierFeatures[tier]?.includes(featureId) || false;
  }
}

export const pricingService = PricingService.getInstance();
```

---

#### Step 1.3: Update Route Imports (30 min)

**Files to Update**:

1. **server/routes/billing.ts**:
```typescript
// Line 2-6: Update imports
import { getBillingService } from '../services/billing/unified-billing-service';
import { PricingService } from '../services/pricing';

const billingService = getBillingService();
const pricingService = PricingService.getInstance();
```

2. **Check other routes**:
```bash
grep -r "getBillingService\|PricingService" server/routes/
# Update each file found
```

---

#### Step 1.4: Testing (1-2 hours)

**Unit Tests**:

Create `server/services/__tests__/billing.test.ts`:
```typescript
import { getBillingService } from '../billing/unified-billing-service';
import { describe, it, expect } from 'vitest';

describe('UnifiedBillingService', () => {
  it('should return singleton instance', () => {
    const service1 = getBillingService();
    const service2 = getBillingService();
    expect(service1).toBe(service2);
  });

  it('should calculate usage summary', async () => {
    const service = getBillingService();
    const summary = await service.getUserUsageSummary('test-user-id');
    expect(summary).toHaveProperty('dataUsage');
    expect(summary).toHaveProperty('computeUsage');
  });
});
```

**Integration Tests**:
```bash
# Test billing endpoints
npm run test:backend -- billing

# Test API endpoints
curl -X GET http://localhost:5000/api/billing/health
curl -X GET http://localhost:5000/api/billing/usage-summary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Manual Testing**:
1. Start server: `npm run dev:server-only`
2. Check logs for billing service initialization
3. Test `/api/billing/health` endpoint
4. Test `/api/billing/usage-summary` with authenticated user

---

#### Step 1.5: Rollback Strategy

**If issues occur**:

1. **Revert file moves** (if using Git):
```bash
git revert HEAD
```

2. **Restore old imports temporarily**:
```typescript
// Add compatibility layer
// server/billing-service.ts (temporary)
export { getBillingService } from './services/billing/unified-billing-service';
export { PricingService } from './services/pricing';
```

3. **Feature flag**:
```typescript
// .env
USE_NEW_BILLING_SERVICE=false

// server/routes/billing.ts
const billingService = process.env.USE_NEW_BILLING_SERVICE === 'true'
  ? getBillingService()
  : getLegacyBillingService();
```

---

### Fix #2: Journey Type Routing

**Estimated Time**: 2-4 hours
**Priority**: 🔴 P0
**Blocker**: Journey navigation

#### Step 2.1: Decide on Canonical Naming (30 min)

**Options**:

**Option A: Use Database Types** (RECOMMENDED)
- Routes: `/journeys/ai_guided/prepare`
- Database: `journeyType: "ai_guided"`
- ✅ No conversion needed
- ✅ Consistent with backend
- ❌ Less user-friendly URLs

**Option B: Use Display Names**
- Routes: `/journeys/non-tech/prepare`
- Database: `journeyType: "non-tech"`
- ❌ Requires schema migration
- ❌ Updates to journey-templates.ts
- ✅ More user-friendly URLs

**RECOMMENDATION: Option A** - Less risky, no database migration needed

---

#### Step 2.2: Update Frontend Routes (1 hour)

**File**: `client/src/App.tsx`

**Changes**:

```typescript
// Lines 182-307: Update ALL journey routes

// BEFORE:
<Route path="/journeys/:type/prepare">
  {/* :type could be "non-tech", "business", "technical" */}
</Route>

// AFTER:
<Route path="/journeys/:type/prepare">
  {(params) => {
    // Validate journey type
    const validTypes = ['ai_guided', 'template_based', 'self_service', 'consultation', 'custom'];
    const journeyType = validTypes.includes(params.type) ? params.type : 'ai_guided';

    if (user) {
      return (
        <JourneyWizard
          journeyType={journeyType}
          currentStage="prepare"
        />
      );
    }
    routeStorage.setIntendedRoute(`/journeys/${journeyType}/prepare`);
    return <AuthPage onLogin={handleLogin} />;
  }}
</Route>

// Apply same pattern to ALL journey routes:
// - /journeys/:type/data
// - /journeys/:type/data-verification
// - /journeys/:type/plan
// - /journeys/:type/project-setup
// - /journeys/:type/execute
// - /journeys/:type/preview
// - /journeys/:type/pricing
// - /journeys/:type/results
```

---

#### Step 2.3: Update SmartJourneys Mapping (30 min)

**File**: `client/src/App.tsx`

```typescript
// Lines 713-767: SmartJourneys component

function SmartJourneys({ user }: { user: any }) {
  const { loading, userRoleData, getRecommendedJourney, canAccessJourney } = useUserRole();
  const [, setLocation] = useLocation();

  // REMOVE mapping - use journey types directly
  // DELETE lines 718-731

  useEffect(() => {
    if (!user) return;
    if (loading) return;

    try {
      const recommendedType = getRecommendedJourney(); // Should return 'ai_guided', etc.

      // Validate it's a valid journey type
      const validTypes = ['ai_guided', 'template_based', 'self_service', 'consultation', 'custom'];
      const targetType = validTypes.includes(recommendedType) ? recommendedType : 'ai_guided';

      // Redirect directly to the journey type
      setLocation(`/journeys/${targetType}/prepare`);
    } catch (e) {
      console.warn("SmartJourneys redirect skipped:", e);
      // Fallback: show journeys hub
    }
  }, [user, loading, userRoleData]);

  return <JourneysHub user={user} />;
}
```

---

#### Step 2.4: Update useUserRole Hook (30 min)

**File**: `client/src/hooks/useUserRole.ts`

Ensure `getRecommendedJourney()` returns canonical types:

```typescript
const getRecommendedJourney = (): JourneyType => {
  if (!userRoleData) {
    return 'ai_guided'; // Default
  }

  // Map user role to journey type
  const roleToJourneyMap: Record<UserRole, JourneyType> = {
    'non-tech': 'ai_guided',
    'business': 'template_based',
    'technical': 'self_service',
    'consultation': 'consultation',
    'custom': 'custom'
  };

  return roleToJourneyMap[userRoleData.role] || 'ai_guided';
};
```

---

#### Step 2.5: Add Redirect for Old URLs (30 min)

**Support legacy URLs** during transition:

```typescript
// client/src/App.tsx
// Add BEFORE journey routes

// Redirect old display names to canonical types
<Route path="/journeys/non-tech/:stage">
  {(params) => {
    setLocation(`/journeys/ai_guided/${params.stage}`);
    return null;
  }}
</Route>

<Route path="/journeys/business/:stage">
  {(params) => {
    setLocation(`/journeys/template_based/${params.stage}`);
    return null;
  }}
</Route>

<Route path="/journeys/technical/:stage">
  {(params) => {
    setLocation(`/journeys/self_service/${params.stage}`);
    return null;
  }}
</Route>
```

---

#### Step 2.6: Update Journey Templates (30 min)

**File**: `shared/journey-templates.ts`

Verify all templates use canonical types:

```typescript
export const journeyTemplates = {
  ai_guided: {  // ✅ Use canonical name
    name: 'AI-Guided Analysis',
    // ...
  },
  template_based: {  // ✅ Use canonical name
    name: 'Template-Based Analysis',
    // ...
  },
  // etc.
};
```

---

#### Step 2.7: Testing (1 hour)

**Test Cases**:

1. **New user journey**:
   - Register as `userRole: "non-tech"`
   - Should redirect to `/journeys/ai_guided/prepare`
   - Verify URL matches expected

2. **Direct URL navigation**:
   - Navigate to `/journeys/ai_guided/prepare`
   - Should load correctly

3. **Legacy URL redirect**:
   - Navigate to `/journeys/non-tech/prepare`
   - Should redirect to `/journeys/ai_guided/prepare`

4. **Invalid journey type**:
   - Navigate to `/journeys/invalid/prepare`
   - Should fallback to `ai_guided`

5. **Backend consistency**:
   - Create project via API
   - Check `journeyType` in database
   - Should be `"ai_guided"`, not `"non-tech"`

**Automated Test**:

```typescript
// tests/journey-routing.spec.ts
import { test, expect } from '@playwright/test';

test('journey type routing', async ({ page }) => {
  // Login
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Navigate to journey
  await page.goto('/journeys/ai_guided/prepare');

  // Verify URL
  await expect(page).toHaveURL(/\/journeys\/ai_guided\/prepare/);

  // Verify page loaded
  await expect(page.locator('h1')).toContainText('Prepare');
});

test('legacy URL redirect', async ({ page }) => {
  await page.goto('/journeys/non-tech/prepare');

  // Should redirect
  await expect(page).toHaveURL(/\/journeys\/ai_guided\/prepare/);
});
```

---

#### Step 2.8: Rollback Strategy

**Rollback Plan**:

1. **Keep old mapping temporarily**:
```typescript
// Feature flag in .env
USE_CANONICAL_JOURNEY_TYPES=false

// In App.tsx
const journeyType = process.env.USE_CANONICAL_JOURNEY_TYPES === 'true'
  ? params.type  // ai_guided
  : mapToCanonical(params.type);  // non-tech → ai_guided
```

2. **Database cleanup** (if needed):
```sql
-- If accidentally created projects with wrong types
UPDATE projects
SET journey_type = 'ai_guided'
WHERE journey_type = 'non-tech';

UPDATE projects
SET journey_type = 'template_based'
WHERE journey_type = 'business';

UPDATE projects
SET journey_type = 'self_service'
WHERE journey_type = 'technical';
```

---

### Fix #5: Real Stripe Integration

**Estimated Time**: 4-6 hours
**Priority**: 🔴 P0
**Blocker**: All payments

#### Step 5.1: Setup Stripe Account (1 hour)

**Prerequisites**:
1. Stripe account created
2. Test API keys obtained
3. Production API keys (for production)

**Environment Setup**:

```bash
# .env
STRIPE_SECRET_KEY=sk_test_51A...  # Test key
STRIPE_WEBHOOK_SECRET=whsec_...   # Webhook signing secret
VITE_STRIPE_PUBLIC_KEY=pk_test_51A...  # Public key for frontend

# Create price IDs in Stripe Dashboard:
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PROFESSIONAL_PRICE_ID=price_...
```

**Stripe Dashboard Setup**:
1. Create Products:
   - Starter ($29/month)
   - Professional ($99/month)
2. Create Prices (recurring, monthly)
3. Copy Price IDs to .env
4. Setup Webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`

---

#### Step 5.2: Install Stripe SDK (15 min)

```bash
npm install stripe @stripe/stripe-js
npm install --save-dev @types/stripe
```

---

#### Step 5.3: Replace Mock Payment Intent (1 hour)

**File**: `server/routes/index.ts`

**BEFORE** (lines 117-137):
```typescript
router.post('/create-payment-intent', async (req, res) => {
  // Mock payment intent
  const id = `pi_${crypto.randomBytes(12).toString('hex')}`;
  const secret = crypto.randomBytes(24).toString('hex');
  const clientSecret = `${id}_secret_${secret}`;

  res.json({
    clientSecret,
    amount: amount || 29.99,
    currency: 'usd',
    status: 'requires_payment_method'
  });
});
```

**AFTER**:
```typescript
import Stripe from 'stripe';
import { ensureAuthenticated } from './routes/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
});

router.post('/create-payment-intent', ensureAuthenticated, async (req, res) => {
  try {
    const { amount, description, metadata } = req.body;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert dollars to cents
      currency: 'usd',
      description: description || 'ChimariData Service',
      metadata: {
        userId,
        ...metadata
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Log payment intent creation
    console.log(`Payment intent created: ${paymentIntent.id} for user ${userId}`);

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount: amount,
      currency: 'usd',
      status: paymentIntent.status
    });
  } catch (error: any) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      error: 'Failed to create payment intent',
      message: error.message
    });
  }
});
```

---

#### Step 5.4: Update Stripe Webhook Handler (2 hours)

**File**: `server/routes/stripe-webhooks.ts`

**Verify webhook signature validation**:

```typescript
import Stripe from 'stripe';
import { Router } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16'
});

// RAW BODY PARSING - Required for webhook signature verification
// This route MUST be registered BEFORE express.json() middleware
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error('Missing Stripe signature or webhook secret');
    return res.status(400).send('Webhook signature missing');
  }

  let event: Stripe.Event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      req.body,  // Raw body buffer
      sig,
      webhookSecret
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    const billingService = getBillingService();
    await billingService.handleWebhookEvent(event);

    res.json({ received: true });
  } catch (error: any) {
    console.error('Error handling webhook event:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;
```

**IMPORTANT**: Ensure webhook route uses raw body:

**File**: `server/index.ts`

```typescript
// BEFORE any express.json() middleware:
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhooksRouter);

// AFTER webhook routes:
app.use(express.json());  // JSON parsing for other routes
app.use(express.urlencoded({ extended: true }));
```

---

#### Step 5.5: Update Frontend Checkout (1-2 hours)

**File**: `client/src/pages/checkout.tsx`

**Install Stripe React components**:
```bash
cd client
npm install @stripe/react-stripe-js @stripe/stripe-js
```

**Update checkout component**:

```typescript
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ amount, onSuccess }: { amount: number; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success`,
      },
    });

    if (submitError) {
      setError(submitError.message || 'Payment failed');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div className="text-red-600 mt-2">{error}</div>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="mt-4 w-full bg-blue-600 text-white py-2 rounded disabled:opacity-50"
      >
        {processing ? 'Processing...' : `Pay $${amount}`}
      </button>
    </form>
  );
}

export default function GuidedAnalysisCheckout() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [amount, setAmount] = useState(29.99);

  useEffect(() => {
    // Create payment intent
    apiClient.post('/create-payment-intent', {
      amount: amount,
      description: 'Professional Subscription'
    })
      .then((data) => {
        setClientSecret(data.clientSecret);
      })
      .catch((error) => {
        console.error('Error creating payment intent:', error);
      });
  }, [amount]);

  if (!clientSecret) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Complete Your Purchase</h1>
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <CheckoutForm
          amount={amount}
          onSuccess={() => window.location.href = '/dashboard'}
        />
      </Elements>
    </div>
  );
}
```

---

#### Step 5.6: Testing (1-2 hours)

**Test Cards** (Stripe test mode):
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`
- Requires Auth: `4000 0025 0000 3155`

**Test Checklist**:

1. **Payment Intent Creation**:
```bash
curl -X POST http://localhost:5000/api/create-payment-intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"amount": 29.99, "description": "Test payment"}'

# Expected: Real client_secret starting with "pi_"
```

2. **Frontend Payment Flow**:
   - Navigate to `/checkout`
   - Enter test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
   - Click "Pay"
   - Should redirect to success page

3. **Webhook Testing** (use Stripe CLI):
```bash
# Install Stripe CLI
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5000/api/webhooks/stripe

# Trigger test event
stripe trigger payment_intent.succeeded
```

4. **Verify Database Update**:
   - After successful payment
   - Check user subscription tier updated
   - Check subscription status = 'active'

---

#### Step 5.7: Rollback Strategy

**Feature Flag**:

```typescript
// .env
USE_REAL_STRIPE=false  # Set to true when ready

// server/routes/index.ts
router.post('/create-payment-intent', ensureAuthenticated, async (req, res) => {
  if (process.env.USE_REAL_STRIPE !== 'true') {
    // Return mock for testing
    return res.json({
      clientSecret: 'pi_test_secret_123',
      amount: 29.99,
      currency: 'usd',
      status: 'requires_payment_method'
    });
  }

  // Real Stripe integration
  // ...
});
```

**Monitoring**:
- Log all payment intent creations
- Alert on payment failures
- Track conversion rate

---

### Fix #6: Unified Data Retrieval

**Estimated Time**: 3-4 hours
**Priority**: 🔴 P0
**Blocker**: Project data access

#### Step 6.1: Create Unified Data Service (2 hours)

**File**: `server/services/unified-data-service.ts`

```typescript
import { db } from '../db';
import { projects, datasets, projectDatasets } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export interface ProjectData {
  data: any[];  // Array of data rows
  schema: any;  // Column schema
  source: 'inline' | 'datasets' | 'none';
  datasetInfo?: {
    id: string;
    fileName: string;
    recordCount: number;
  };
}

export class UnifiedDataService {
  private static instance: UnifiedDataService;

  private constructor() {}

  static getInstance(): UnifiedDataService {
    if (!UnifiedDataService.instance) {
      UnifiedDataService.instance = new UnifiedDataService();
    }
    return UnifiedDataService.instance;
  }

  /**
   * Get project data from any source (inline or datasets table)
   *
   * @param projectId - Project ID
   * @returns ProjectData or null if no data found
   */
  async getProjectData(projectId: string): Promise<ProjectData | null> {
    try {
      // Get project
      const projectResult = await db.select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (projectResult.length === 0) {
        console.error(`Project not found: ${projectId}`);
        return null;
      }

      const project = projectResult[0];

      // Strategy 1: Check inline data first
      if (project.data && Array.isArray(project.data) && project.data.length > 0) {
        console.log(`[UnifiedDataService] Using inline data for project ${projectId}`);
        return {
          data: project.data,
          schema: project.schema || this.inferSchema(project.data),
          source: 'inline'
        };
      }

      // Strategy 2: Check datasets table
      const linkedDatasets = await db.select({
        dataset: datasets,
        link: projectDatasets
      })
        .from(projectDatasets)
        .innerJoin(datasets, eq(datasets.id, projectDatasets.datasetId))
        .where(eq(projectDatasets.projectId, projectId))
        .orderBy(projectDatasets.createdAt); // Get oldest first (primary dataset)

      if (linkedDatasets.length > 0) {
        const primaryDataset = linkedDatasets[0].dataset;

        console.log(`[UnifiedDataService] Using datasets table for project ${projectId}, dataset ${primaryDataset.id}`);

        return {
          data: primaryDataset.data || [],
          schema: primaryDataset.schema || this.inferSchema(primaryDataset.data),
          source: 'datasets',
          datasetInfo: {
            id: primaryDataset.id,
            fileName: primaryDataset.originalFileName || 'Unknown',
            recordCount: primaryDataset.recordCount || 0
          }
        };
      }

      // No data found
      console.warn(`[UnifiedDataService] No data found for project ${projectId}`);
      return {
        data: [],
        schema: null,
        source: 'none'
      };

    } catch (error) {
      console.error('[UnifiedDataService] Error getting project data:', error);
      throw error;
    }
  }

  /**
   * Save data to project (chooses best storage strategy)
   *
   * @param projectId - Project ID
   * @param data - Data rows
   * @param schema - Column schema
   * @param fileName - Original file name (optional)
   */
  async saveProjectData(
    projectId: string,
    data: any[],
    schema: any,
    fileName?: string
  ): Promise<void> {
    try {
      const dataSize = JSON.stringify(data).length;
      const sizeMB = dataSize / (1024 * 1024);

      // Decision: Use inline storage for small datasets (< 10 MB)
      if (sizeMB < 10) {
        console.log(`[UnifiedDataService] Using inline storage (${sizeMB.toFixed(2)} MB)`);

        await db.update(projects)
          .set({
            data: data,
            schema: schema,
            updatedAt: new Date()
          })
          .where(eq(projects.id, projectId));

        return;
      }

      // Decision: Use datasets table for larger datasets
      console.log(`[UnifiedDataService] Using datasets table (${sizeMB.toFixed(2)} MB)`);

      // Create dataset
      const datasetId = `ds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await db.insert(datasets).values({
        id: datasetId,
        userId: (await db.select().from(projects).where(eq(projects.id, projectId)).limit(1))[0]?.userId || 'unknown',
        sourceType: 'upload',
        originalFileName: fileName || 'uploaded-data.csv',
        schema: schema,
        recordCount: data.length,
        preview: data.slice(0, 100), // First 100 rows
        data: data,
        mode: 'static',
        status: 'ready',
        createdAt: new Date()
      });

      // Link to project
      await db.insert(projectDatasets).values({
        projectId: projectId,
        datasetId: datasetId,
        role: 'primary',
        createdAt: new Date()
      });

      // Clear inline data to avoid duplication
      await db.update(projects)
        .set({
          data: null,  // Clear inline data
          schema: schema,  // Keep schema reference
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

    } catch (error) {
      console.error('[UnifiedDataService] Error saving project data:', error);
      throw error;
    }
  }

  /**
   * Infer schema from data
   */
  private inferSchema(data: any[]): any {
    if (!data || data.length === 0) return null;

    const firstRow = data[0];
    const schema: any = {};

    Object.keys(firstRow).forEach(key => {
      const value = firstRow[key];
      let type = 'text';

      if (typeof value === 'number') {
        type = 'numeric';
      } else if (value instanceof Date) {
        type = 'datetime';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
      } else if (typeof value === 'string') {
        // Try to detect datetime strings
        if (!isNaN(Date.parse(value))) {
          type = 'datetime';
        }
        // Try to detect numeric strings
        else if (!isNaN(Number(value))) {
          type = 'numeric';
        }
      }

      schema[key] = {
        name: key,
        type: type,
        nullable: true
      };
    });

    return schema;
  }

  /**
   * Get all datasets linked to a project
   */
  async getProjectDatasets(projectId: string) {
    return db.select({
      dataset: datasets,
      link: projectDatasets
    })
      .from(projectDatasets)
      .innerJoin(datasets, eq(datasets.id, projectDatasets.datasetId))
      .where(eq(projectDatasets.projectId, projectId));
  }

  /**
   * Check if project has data
   */
  async hasProjectData(projectId: string): Promise<boolean> {
    const projectData = await this.getProjectData(projectId);
    return projectData !== null && projectData.data.length > 0;
  }
}

export const unifiedDataService = UnifiedDataService.getInstance();
```

---

#### Step 6.2: Update Project Routes (1 hour)

**File**: `server/routes/project.ts`

**Find and replace direct data access**:

```typescript
import { unifiedDataService } from '../services/unified-data-service';

// BEFORE:
router.get('/:id', ensureAuthenticated, async (req, res) => {
  const project = await db.select()
    .from(projects)
    .where(eq(projects.id, req.params.id))
    .limit(1);

  const data = project[0]?.data || [];  // ❌ Only checks inline
  // ...
});

// AFTER:
router.get('/:id', ensureAuthenticated, async (req, res) => {
  const projectData = await unifiedDataService.getProjectData(req.params.id);

  if (!projectData) {
    return res.status(404).json({ error: 'Project data not found' });
  }

  // Return project with unified data
  res.json({
    id: req.params.id,
    data: projectData.data,
    schema: projectData.schema,
    dataSource: projectData.source,  // For debugging
    recordCount: projectData.data.length
  });
});
```

**Update data upload endpoint**:

```typescript
router.post('/:id/upload', ensureAuthenticated, upload.single('file'), async (req, res) => {
  const { parsedData, schema } = await parseUploadedFile(req.file);

  // Use unified service instead of direct DB write
  await unifiedDataService.saveProjectData(
    req.params.id,
    parsedData,
    schema,
    req.file.originalname
  );

  res.json({
    success: true,
    recordCount: parsedData.length,
    storageType: parsedData.length > 1000 ? 'datasets' : 'inline'  // For info
  });
});
```

---

#### Step 6.3: Update Other Routes Using Project Data (30 min)

**Search for direct data access**:

```bash
grep -r "projects\.data\|project\.data\|project\[0\]\.data" server/routes/
```

**Update each occurrence**:

```typescript
// Example: server/routes/analyze-data.ts
const projectData = await unifiedDataService.getProjectData(projectId);

if (!projectData || projectData.data.length === 0) {
  return res.status(400).json({ error: 'No data available for analysis' });
}

// Use projectData.data instead of project.data
const analysis = await performAnalysis(projectData.data, projectData.schema);
```

---

#### Step 6.4: Testing (1 hour)

**Test Cases**:

1. **Small dataset (inline storage)**:
```bash
# Upload small CSV (< 10MB)
curl -X POST http://localhost:5000/api/projects/PROJECT_ID/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@small-data.csv"

# Verify stored inline
# Check database: projects.data should contain array
```

2. **Large dataset (datasets table)**:
```bash
# Upload large CSV (> 10MB)
curl -X POST http://localhost:5000/api/projects/PROJECT_ID/upload \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@large-data.csv"

# Verify stored in datasets table
# Check database: datasets table should have entry
# Check database: projects.data should be null
```

3. **Data retrieval consistency**:
```bash
# Get project data
curl http://localhost:5000/api/projects/PROJECT_ID \
  -H "Authorization: Bearer TOKEN"

# Should return data regardless of storage location
```

4. **Migration of existing data**:
```typescript
// Create migration script if needed
// server/scripts/migrate-inline-to-datasets.ts

import { db } from '../db';
import { projects } from '../../shared/schema';
import { unifiedDataService } from '../services/unified-data-service';

async function migrateInlineData() {
  const projectsWithInlineData = await db.select()
    .from(projects)
    .where(/* data is not null */);

  for (const project of projectsWithInlineData) {
    if (project.data && Array.isArray(project.data)) {
      const dataSize = JSON.stringify(project.data).length / (1024 * 1024);

      if (dataSize > 10) {
        console.log(`Migrating project ${project.id} (${dataSize.toFixed(2)} MB)`);
        await unifiedDataService.saveProjectData(
          project.id,
          project.data,
          project.schema,
          'migrated-data'
        );
      }
    }
  }
}

migrateInlineData().catch(console.error);
```

---

#### Step 6.5: Rollback Strategy

**Gradual Rollout**:

```typescript
// .env
USE_UNIFIED_DATA_SERVICE=true

// server/routes/project.ts
const projectData = process.env.USE_UNIFIED_DATA_SERVICE === 'true'
  ? await unifiedDataService.getProjectData(projectId)
  : await getLegacyProjectData(projectId);
```

**Legacy function** (keep temporarily):
```typescript
async function getLegacyProjectData(projectId: string) {
  const project = await db.select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  return {
    data: project[0]?.data || [],
    schema: project[0]?.schema,
    source: 'inline'
  };
}
```

---

## Phase 2: HIGH Priority Fixes (Days 4-5)

### Fix #3: Consolidate Duplicate Routes

**Estimated Time**: 1-2 hours

**Step 3.1: Choose Canonical Route Pattern**

**Decision**: Use `/projects/:id` (plural, RESTful standard)

**Step 3.2: Add Redirect**

```typescript
// client/src/App.tsx

// Remove duplicate /project/:id route (line 346-354)
// Keep only /projects/:id route (line 436-444)

// Add redirect for old URLs
<Route path="/project/:id">
  {(params) => {
    setLocation(`/projects/${params.id}`);
    return null;
  }}
</Route>
```

**Step 3.3: Update Hardcoded Links**

```bash
# Find all references to /project/ (singular)
grep -r "'/project/" client/src/
grep -r '"/project/' client/src/
grep -r "\`/project/" client/src/

# Replace each with /projects/ (plural)
```

**Testing**:
- Navigate to `/project/123` → should redirect to `/projects/123`
- All links in UI should use `/projects/:id`

---

### Fix #4: Add Data Verification Stage

**Estimated Time**: 2-3 hours

**Step 4.1: Create Data Verification Component**

**File**: `client/src/pages/data-verification-step.tsx`

```typescript
import { useState, useEffect } from 'react';
import { useProjectSession } from '@/hooks/useProjectSession';
import { apiClient } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface DataVerificationStepProps {
  journeyType: string;
  projectId?: string;
}

export default function DataVerificationStep({ journeyType, projectId }: DataVerificationStepProps) {
  const { project } = useProjectSession(projectId);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'running' | 'complete' | 'failed'>('pending');
  const [qualityScore, setQualityScore] = useState<number | null>(null);
  const [issues, setIssues] = useState<any[]>([]);

  useEffect(() => {
    if (project?.id) {
      runDataVerification(project.id);
    }
  }, [project?.id]);

  const runDataVerification = async (projectId: string) => {
    setVerificationStatus('running');

    try {
      const result = await apiClient.post(`/api/projects/${projectId}/verify-data`);

      setQualityScore(result.qualityScore);
      setIssues(result.issues || []);
      setVerificationStatus('complete');
    } catch (error) {
      console.error('Data verification failed:', error);
      setVerificationStatus('failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Data Verification</h1>

      {verificationStatus === 'running' && (
        <Card>
          <CardContent className="p-8 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-lg">Verifying your data quality...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {verificationStatus === 'complete' && (
        <>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-6 h-6 text-green-600" />
                Data Quality Score: {qualityScore}/100
              </CardTitle>
            </CardHeader>
            <CardContent>
              {qualityScore && qualityScore >= 80 ? (
                <Alert className="bg-green-50 border-green-200">
                  <AlertDescription>
                    Your data quality is excellent! Ready to proceed with analysis.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert className="bg-yellow-50 border-yellow-200">
                  <AlertDescription>
                    Some data quality issues detected. Review below for details.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Issues Found</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {issues.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                      <div>
                        <p className="font-medium">{issue.type}</p>
                        <p className="text-sm text-gray-600">{issue.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="mt-6 flex gap-4">
            <button
              onClick={() => window.location.href = `/journeys/${journeyType}/data`}
              className="px-4 py-2 border rounded"
            >
              Back to Data Upload
            </button>
            <button
              onClick={() => window.location.href = `/journeys/${journeyType}/plan`}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              Continue to Planning
            </button>
          </div>
        </>
      )}

      {verificationStatus === 'failed' && (
        <Alert variant="destructive">
          <AlertDescription>
            Data verification failed. Please try uploading your data again.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

**Step 4.2: Add to JourneyWizard**

**File**: `client/src/components/JourneyWizard.tsx`

```typescript
import DataVerificationStep from '@/pages/data-verification-step';

function JourneyWizard({ journeyType, currentStage }: Props) {
  // ... existing code

  switch (currentStage) {
    case 'prepare':
      return <PrepareStep journeyType={journeyType} />;
    case 'data':
      return <DataStep journeyType={journeyType} />;
    case 'data-verification':  // ✅ Add this case
      return <DataVerificationStep journeyType={journeyType} />;
    case 'plan':
      return <PlanStep journeyType={journeyType} />;
    // ... other cases
  }
}
```

**Step 4.3: Create Backend Endpoint**

**File**: `server/routes/data-verification.ts`

```typescript
router.post('/projects/:id/verify-data', ensureAuthenticated, async (req, res) => {
  const projectId = req.params.id;

  try {
    const projectData = await unifiedDataService.getProjectData(projectId);

    if (!projectData || projectData.data.length === 0) {
      return res.status(400).json({ error: 'No data to verify' });
    }

    // Run quality checks
    const qualityScore = calculateQualityScore(projectData.data, projectData.schema);
    const issues = findDataIssues(projectData.data);

    res.json({
      qualityScore,
      issues,
      recordCount: projectData.data.length
    });
  } catch (error) {
    console.error('Data verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

function calculateQualityScore(data: any[], schema: any): number {
  let score = 100;

  // Check for missing values
  const missingCount = data.reduce((count, row) => {
    return count + Object.values(row).filter(v => v === null || v === '').length;
  }, 0);
  const missingRate = missingCount / (data.length * Object.keys(data[0] || {}).length);
  score -= missingRate * 30;  // -30 points max for missing values

  // Check for duplicates
  const uniqueRows = new Set(data.map(JSON.stringify)).size;
  const duplicateRate = 1 - (uniqueRows / data.length);
  score -= duplicateRate * 20;  // -20 points max for duplicates

  // Check for data type consistency
  // ... additional checks

  return Math.max(0, Math.round(score));
}

function findDataIssues(data: any[]): any[] {
  const issues: any[] = [];

  // Check for missing values
  const firstRow = data[0] || {};
  Object.keys(firstRow).forEach(col => {
    const missingCount = data.filter(row => !row[col]).length;
    if (missingCount > data.length * 0.1) {  // > 10% missing
      issues.push({
        type: 'Missing Values',
        column: col,
        description: `${missingCount} rows (${((missingCount/data.length)*100).toFixed(1)}%) have missing values in column "${col}"`
      });
    }
  });

  return issues;
}
```

**Testing**:
- Upload data
- Navigate to data-verification step
- Should show quality score
- Should list issues if any
- Should allow proceeding to next step

---

---

## Phase 2 Continued: Additional HIGH Priority Fixes

### Fix #7: Authentication Token Storage Standardization

**Estimated Time**: 1 hour
**Priority**: 🟡 MEDIUM
**Impact**: Consistency and future maintainability

#### Analysis Results

Good news! After comprehensive grep analysis:
- ✅ **ALL files use `'auth_token'` consistently**
- ✅ **No alternate token keys found** (`'token'`, `'authToken'`, etc.)
- ✅ **87 files checked** across the codebase

**Files using `'auth_token'`** (excerpt):
- `client/src/lib/api.ts` - 24 occurrences
- `client/src/App.tsx` - 6 occurrences
- `client/src/hooks/useOptimizedAuth.ts` - 5 occurrences
- All other files consistent

#### Step 7.1: Document Token Standard (15 min)

**Create**: `client/src/lib/auth-storage.ts`

```typescript
/**
 * Centralized authentication storage utilities
 * SINGLE SOURCE OF TRUTH for auth token management
 */

export const AUTH_TOKEN_KEY = 'auth_token' as const;
export const AUTH_USER_KEY = 'user' as const;

/**
 * Token storage utilities
 * Use these functions instead of direct localStorage access
 */
export const authStorage = {
  /**
   * Get authentication token
   */
  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },

  /**
   * Set authentication token
   */
  setToken(token: string): void {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.dispatchEvent(new Event('auth-token-stored'));
  },

  /**
   * Remove authentication token
   */
  removeToken(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event('auth-token-cleared'));
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  },

  /**
   * Get stored user data
   */
  getUser(): any | null {
    const userData = localStorage.getItem(AUTH_USER_KEY);
    if (!userData) return null;

    try {
      return JSON.parse(userData);
    } catch {
      return null;
    }
  },

  /**
   * Set user data
   */
  setUser(user: any): void {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  },

  /**
   * Remove user data
   */
  removeUser(): void {
    localStorage.removeItem(AUTH_USER_KEY);
  },

  /**
   * Clear all auth data
   */
  clearAll(): void {
    this.removeToken();
    this.removeUser();
  }
};
```

#### Step 7.2: Refactor High-Traffic Files (30 min)

**File**: `client/src/lib/api.ts`

**BEFORE**:
```typescript
const token = localStorage.getItem('auth_token');
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

**AFTER**:
```typescript
import { authStorage } from './auth-storage';

const token = authStorage.getToken();
if (token) {
  headers['Authorization'] = `Bearer ${token}`;
}
```

**Update these critical files**:
1. `client/src/lib/api.ts`
2. `client/src/App.tsx`
3. `client/src/hooks/useOptimizedAuth.ts`
4. `client/src/hooks/useProjectContext.tsx`

#### Step 7.3: Add Type Safety (15 min)

```typescript
// client/src/lib/auth-storage.ts

export interface AuthTokenData {
  token: string;
  expiresAt?: number;
  refreshToken?: string;
}

export interface UserData {
  id: string;
  email: string;
  name?: string;
  role?: string;
  subscriptionTier?: string;
}

// Update functions with type safety
export const authStorage = {
  getToken(): string | null { /* ... */ },

  setTokenData(tokenData: AuthTokenData): void {
    this.setToken(tokenData.token);
    if (tokenData.expiresAt) {
      localStorage.setItem('auth_token_expires', tokenData.expiresAt.toString());
    }
  },

  getUser(): UserData | null {
    const userData = localStorage.getItem(AUTH_USER_KEY);
    if (!userData) return null;

    try {
      return JSON.parse(userData) as UserData;
    } catch {
      return null;
    }
  },

  setUser(user: UserData): void {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
};
```

#### Step 7.4: Testing (15 min)

**Test Cases**:

```typescript
// client/src/lib/__tests__/auth-storage.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { authStorage, AUTH_TOKEN_KEY } from '../auth-storage';

describe('authStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store and retrieve token', () => {
    authStorage.setToken('test-token');
    expect(authStorage.getToken()).toBe('test-token');
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('test-token');
  });

  it('should remove token', () => {
    authStorage.setToken('test-token');
    authStorage.removeToken();
    expect(authStorage.getToken()).toBeNull();
  });

  it('should check authentication status', () => {
    expect(authStorage.isAuthenticated()).toBe(false);
    authStorage.setToken('test-token');
    expect(authStorage.isAuthenticated()).toBe(true);
  });

  it('should store and retrieve user data', () => {
    const user = { id: '123', email: 'test@example.com' };
    authStorage.setUser(user);
    expect(authStorage.getUser()).toEqual(user);
  });

  it('should clear all auth data', () => {
    authStorage.setToken('token');
    authStorage.setUser({ id: '123', email: 'test@test.com' });
    authStorage.clearAll();
    expect(authStorage.getToken()).toBeNull();
    expect(authStorage.getUser()).toBeNull();
  });
});
```

#### Step 7.5: Rollback Strategy

**No breaking changes** - This is purely refactoring:
- Still uses `'auth_token'` key (no change)
- Wraps existing behavior
- Can be adopted incrementally

**Migration Path**:
1. Add `auth-storage.ts`
2. Update files one at a time
3. Keep both patterns working during transition
4. No user impact

---

### Fix #8: Journey Hub Redirect Logic

**Estimated Time**: 30 minutes
**Priority**: 🟡 MEDIUM
**Impact**: User experience clarity

#### Step 8.1: Update Journey Routes (15 min)

**File**: `client/src/App.tsx`

**BEFORE** (lines 318-323):
```typescript
<Route path="/journeys">
  {() => { setLocation('/'); return <></>; }}
</Route>
<Route path="/journeys/hub">
  {() => { setLocation('/'); return <></>; }}
</Route>
```

**AFTER**:
```typescript
<Route path="/journeys">
  {() => {
    // Show journey selection if authenticated, otherwise redirect home
    if (user) {
      return <SmartJourneys user={user} />;
    }
    setLocation('/');
    return null;
  }}
</Route>

<Route path="/journeys/hub">
  {() => {
    // Alias for /journeys
    setLocation('/journeys');
    return null;
  }}
</Route>
```

#### Step 8.2: Activate SmartJourneys Component (10 min)

The `SmartJourneys` component exists but was never used. Now it will be:

```typescript
// App.tsx line 713-767
function SmartJourneys({ user }: { user: any }) {
  const { loading, userRoleData, getRecommendedJourney } = useUserRole();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!user) {
      // Not logged in - show landing page
      setLocation('/');
      return;
    }

    if (loading) {
      return; // Wait for role data
    }

    try {
      const recommendedType = getRecommendedJourney(); // Returns 'ai_guided', etc.

      // Validate journey type
      const validTypes = ['ai_guided', 'template_based', 'self_service', 'consultation', 'custom'];
      const targetType = validTypes.includes(recommendedType) ? recommendedType : 'ai_guided';

      // Redirect to recommended journey
      setLocation(`/journeys/${targetType}/prepare`);
    } catch (e) {
      console.warn("SmartJourneys redirect failed:", e);
      // Show journey selection page on error
    }
  }, [user, loading, userRoleData]);

  // Show loading state while determining journey
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Finding the best journey for you...</p>
        </div>
      </div>
    );
  }

  // Fallback: Show journey hub if redirect fails
  return <JourneysHub user={user} />;
}
```

#### Step 8.3: Testing (5 min)

**Test Cases**:

1. **Unauthenticated user**:
   - Navigate to `/journeys`
   - Should redirect to `/` (home)

2. **Authenticated user**:
   - Navigate to `/journeys`
   - Should show loading
   - Should redirect to recommended journey (e.g., `/journeys/ai_guided/prepare`)

3. **Journey hub alias**:
   - Navigate to `/journeys/hub`
   - Should redirect to `/journeys`

**Manual Test**:
```bash
# Start server
npm run dev

# Test flows:
# 1. Go to /journeys (logged out) → should go to /
# 2. Login → Go to /journeys → should redirect to journey type
# 3. Go to /journeys/hub → should redirect to /journeys
```

---

### Fix #9: Pricing Route Backend Verification

**Estimated Time**: 1-2 hours
**Priority**: 🟠 HIGH
**Impact**: Pricing page functionality

#### Step 9.1: Audit Existing Endpoints (30 min)

**Current Endpoints** in `server/routes/pricing.ts`:

✅ **Implemented**:
- `GET /api/pricing/tiers` - Returns subscription tiers
- `GET /api/pricing/services` - Returns service pricing
- `GET /api/pricing/subscription-tiers` - Alias for tiers
- `POST /api/pricing/subscription` - Create subscription
- `POST /api/pricing/subscription/cancel` - Cancel subscription
- `POST /api/pricing/subscription/reactivate` - Reactivate subscription

**Missing** (check frontend references):

```bash
# Search frontend for pricing API calls
grep -r "api/pricing" client/src/ --include="*.tsx" --include="*.ts"
```

#### Step 9.2: Add Missing Endpoints (1 hour)

**File**: `server/routes/pricing.ts`

**Add missing endpoints based on frontend needs**:

```typescript
/**
 * GET /api/pricing/features
 * Get feature comparison for all tiers
 */
router.get('/features', async (req: Request, res: Response) => {
  try {
    const features = [
      {
        category: 'Data Processing',
        items: [
          { name: 'File Upload', trial: '100MB', starter: '500MB', professional: '5GB', enterprise: 'Unlimited' },
          { name: 'Projects', trial: '2', starter: '10', professional: '50', enterprise: 'Unlimited' },
          { name: 'AI Queries', trial: '5/month', starter: '50/month', professional: '500/month', enterprise: 'Unlimited' }
        ]
      },
      {
        category: 'Analysis Features',
        items: [
          { name: 'Basic Analysis', trial: true, starter: true, professional: true, enterprise: true },
          { name: 'Advanced ML', trial: false, starter: false, professional: true, enterprise: true },
          { name: 'Custom Models', trial: false, starter: false, professional: false, enterprise: true }
        ]
      },
      {
        category: 'Support',
        items: [
          { name: 'Email Support', trial: '48hr', starter: '24hr', professional: '4hr', enterprise: '1hr' },
          { name: 'Dedicated Manager', trial: false, starter: false, professional: false, enterprise: true }
        ]
      }
    ];

    res.json({ success: true, features });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/pricing/calculate
 * Calculate cost for specific journey/analysis
 */
router.post('/calculate', async (req: Request, res: Response) => {
  try {
    const { journeyType, complexity, dataSize, analysisCount } = req.body;

    // Base costs by journey type
    const baseCosts: Record<string, number> = {
      ai_guided: 10,
      template_based: 15,
      self_service: 5,
      consultation: 100,
      custom: 50
    };

    // Complexity multipliers
    const complexityMultipliers: Record<string, number> = {
      simple: 1.0,
      moderate: 2.0,
      complex: 4.0,
      enterprise: 10.0
    };

    const baseCost = baseCosts[journeyType] || 10;
    const multiplier = complexityMultipliers[complexity] || 1.0;
    const dataSizeCost = (dataSize || 0) * 0.001; // $0.001 per MB
    const analysisCost = (analysisCount || 1) * 5; // $5 per analysis component

    const totalCost = (baseCost * multiplier) + dataSizeCost + analysisCost;

    res.json({
      success: true,
      breakdown: {
        base: baseCost,
        complexity: baseCost * (multiplier - 1),
        dataSize: dataSizeCost,
        analyses: analysisCost
      },
      total: Math.round(totalCost * 100) / 100,
      currency: 'USD'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/pricing/tier-comparison
 * Get side-by-side tier comparison
 */
router.get('/tier-comparison', async (req: Request, res: Response) => {
  try {
    const tiers = await getAllUnifiedTiers();

    const comparison = {
      tiers: tiers.map(tier => ({
        id: tier.id,
        name: tier.name,
        price: tier.monthlyPriceUsd / 100,
        limits: tier.limits
      })),
      features: [
        'File Upload',
        'Projects',
        'AI Queries',
        'Advanced Analysis',
        'Custom Models',
        'API Access',
        'Team Collaboration'
      ]
    };

    res.json({ success: true, comparison });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

#### Step 9.3: Testing (30 min)

```bash
# Test all endpoints
curl http://localhost:5000/api/pricing/tiers
curl http://localhost:5000/api/pricing/features
curl http://localhost:5000/api/pricing/tier-comparison

curl -X POST http://localhost:5000/api/pricing/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "journeyType": "ai_guided",
    "complexity": "moderate",
    "dataSize": 100,
    "analysisCount": 3
  }'

# Expected: Cost calculation result
```

---

### Fix #10: SmartJourneys Component Integration

**Estimated Time**: 1 hour
**Priority**: 🟡 MEDIUM
**Impact**: Improved user experience

#### Status: ✅ ALREADY FIXED

**Resolved by Fix #8**: Journey Hub Redirect now uses SmartJourneys component

**Additional Enhancement** (30 min):

Add journey selection UI for when auto-redirect fails:

```typescript
// client/src/components/JourneySelection.tsx
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Target, Briefcase, Code, Users } from "lucide-react";

export function JourneySelection() {
  const [, setLocation] = useLocation();

  const journeys = [
    {
      type: 'ai_guided',
      name: 'AI-Guided Analysis',
      description: 'Perfect for non-technical users. AI guides you through every step.',
      icon: Target,
      recommended: true
    },
    {
      type: 'template_based',
      name: 'Template-Based',
      description: 'Business users: Use proven templates for common analyses.',
      icon: Briefcase,
      recommended: false
    },
    {
      type: 'self_service',
      name: 'Self-Service',
      description: 'Technical users: Full control over your analysis workflow.',
      icon: Code,
      recommended: false
    },
    {
      type: 'consultation',
      name: 'Expert Consultation',
      description: 'Work with our data science experts for complex projects.',
      icon: Users,
      recommended: false
    }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Choose Your Analysis Journey</h1>
      <p className="text-gray-600 mb-8">Select the approach that best fits your needs</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {journeys.map((journey) => (
          <Card
            key={journey.type}
            className={journey.recommended ? 'border-blue-500 border-2' : ''}
          >
            <CardHeader>
              <div className="flex items-start gap-4">
                <journey.icon className="w-8 h-8 text-blue-600" />
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    {journey.name}
                    {journey.recommended && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        Recommended
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-2">
                    {journey.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setLocation(`/journeys/${journey.type}/prepare`)}
                className="w-full"
                variant={journey.recommended ? 'default' : 'outline'}
              >
                Start Journey
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Update SmartJourneys to use it**:

```typescript
function SmartJourneys({ user }: { user: any }) {
  // ... existing code

  // Show selection UI if redirect fails or user preference
  return <JourneySelection />;
}
```

---

### Fix #11: Multiple Project Routers Consolidation

**Estimated Time**: 2-3 hours
**Priority**: 🟠 HIGH
**Impact**: Code maintainability

#### Step 11.1: Audit Project Routers (30 min)

**Current Files**:
1. `server/routes/project.ts` - Main project CRUD (1,800+ lines)
2. `server/routes/project-optimized.ts` - Performance optimizations
3. `server/routes/project-session.ts` - Session state management
4. `server/routes/project-manager.ts` - PM agent endpoints

**Analyze Overlap**:

```bash
# Find duplicate route definitions
grep -h "router\.get\|router\.post" server/routes/project*.ts | sort | uniq -d
```

#### Step 11.2: Document Router Responsibilities (30 min)

**Create**: `server/routes/PROJECT_ROUTERS_README.md`

```markdown
# Project Router Architecture

## Router Files

### 1. project.ts (Main Router)
**Purpose**: Core project CRUD operations
**Routes**:
- `GET /api/projects` - List user's projects
- `GET /api/projects/:id` - Get specific project
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/upload` - Upload data to project

**Use When**: Standard project operations needed

---

### 2. project-optimized.ts
**Purpose**: Performance-optimized queries for large datasets
**Routes**:
- `GET /api/projects/:id/optimized` - Optimized project fetch
- `GET /api/projects/:id/preview` - Get data preview (first 100 rows)
- `GET /api/projects/:id/stats` - Get project statistics

**Use When**:
- Project has large dataset (>10MB)
- Need quick preview without full data load
- Dashboard widgets (summary data only)

---

### 3. project-session.ts
**Purpose**: Server-side session state management
**Routes**:
- `GET /api/project-session/:id` - Get session state
- `PUT /api/project-session/:id` - Update session state
- `POST /api/project-session/:id/checkpoint` - Save checkpoint

**Use When**:
- Managing journey progress
- Saving user's current step
- Checkpoint/resume functionality

---

### 4. project-manager.ts
**Purpose**: PM Agent interaction endpoints
**Routes**:
- `POST /api/project-manager/clarify` - Request PM clarification
- `POST /api/project-manager/recommend` - Get PM recommendations
- `POST /api/project-manager/coordinate` - Coordinate multi-agent work

**Use When**:
- PM agent needs to interact with project
- Clarification dialogs
- Agent coordination

## Decision Tree

```
Need to...
├── Create/Read/Update/Delete project? → project.ts
├── Load large project data? → project-optimized.ts
├── Save journey progress? → project-session.ts
└── Interact with PM agent? → project-manager.ts
```

## Migration Notes

**No changes needed** - Each router has distinct purpose.

**Recommendation**: Keep all four routers. They serve different concerns and don't overlap.
```

#### Step 11.3: Add Route Prefixes (1 hour)

**File**: `server/routes/index.ts`

**Update registration to use clear prefixes**:

```typescript
// BEFORE:
router.use('/projects', dataVerificationRouter, projectRouter);

// AFTER - Add prefixes for clarity:
router.use('/projects', projectRouter);              // Main CRUD
router.use('/projects', projectOptimizedRouter);     // Optimized reads
router.use('/project-session', projectSessionRouter); // Session state (already prefixed)
router.use('/project-manager', projectManagerRouter); // PM agent (already prefixed)
```

**Update project-optimized.ts routes to avoid conflicts**:

```typescript
// server/routes/project-optimized.ts

// Add "/optimized" prefix to all routes
router.get('/:id/optimized', ensureAuthenticated, async (req, res) => {
  // ... optimized fetch logic
});

router.get('/:id/preview', ensureAuthenticated, async (req, res) => {
  // ... preview logic
});

router.get('/:id/stats', ensureAuthenticated, async (req, res) => {
  // ... stats logic
});
```

#### Step 11.4: Testing (30 min)

**Test all project endpoints**:

```bash
# Main CRUD
curl http://localhost:5000/api/projects \
  -H "Authorization: Bearer TOKEN"

# Optimized
curl http://localhost:5000/api/projects/PROJECT_ID/optimized \
  -H "Authorization: Bearer TOKEN"

# Preview
curl http://localhost:5000/api/projects/PROJECT_ID/preview \
  -H "Authorization: Bearer TOKEN"

# Session
curl http://localhost:5000/api/project-session/PROJECT_ID \
  -H "Authorization: Bearer TOKEN"

# PM Agent
curl -X POST http://localhost:5000/api/project-manager/recommend \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"projectId": "PROJECT_ID"}'
```

---

### Fix #12: Multiple Admin Routers Cleanup

**Estimated Time**: 2-3 hours
**Priority**: 🟠 HIGH
**Impact**: Security and maintainability

#### Step 12.1: Audit Admin Routers (45 min)

**Current Files**:
1. `server/routes/admin.ts` - Legacy admin (200+ lines)
2. `server/routes/admin-secured.ts` - New RBAC admin (300+ lines)
3. `server/routes/admin-billing.ts` - Billing management
4. `server/routes/admin-service-pricing.ts` - Service pricing config
5. `server/routes/admin-consultation.ts` - Consultation management
6. `server/routes/admin-consultation-pricing.ts` - Consultation pricing

**Registration in index.ts**:
```typescript
router.use('/admin', adminSecuredRouter);         // Line 106 - Active
router.use('/admin-legacy', adminRouter);         // Line 107 - Legacy
router.use('/admin/billing', adminBillingRouter); // Billing
router.use('/admin/service-pricing', adminServicePricingRouter);
router.use('/admin/consultations', adminConsultationRouter);
router.use('/admin/consultation-pricing', adminConsultationPricingRouter);
```

#### Step 12.2: Compare admin.ts vs admin-secured.ts (30 min)

**Create comparison script**:

```bash
# Compare route definitions
echo "=== admin.ts routes ===" > admin-comparison.txt
grep "router\.\(get\|post\|put\|delete\)" server/routes/admin.ts >> admin-comparison.txt

echo "" >> admin-comparison.txt
echo "=== admin-secured.ts routes ===" >> admin-comparison.txt
grep "router\.\(get\|post\|put\|delete\)" server/routes/admin-secured.ts >> admin-comparison.txt

# Review for duplicates
cat admin-comparison.txt
```

#### Step 12.3: Deprecation Plan (1 hour)

**File**: `server/routes/admin.ts`

**Add deprecation warnings**:

```typescript
import { Router } from 'express';

const router = Router();

// Deprecation middleware
router.use((req, res, next) => {
  console.warn(`⚠️  DEPRECATED: ${req.method} /api/admin-legacy${req.path} accessed`);
  console.warn(`   Please use /api/admin${req.path} instead`);
  console.warn(`   Legacy routes will be removed in version 2.0`);

  // Add deprecation header
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Deprecation-Date', '2026-03-01');
  res.setHeader('X-API-Replacement', `/api/admin${req.path}`);

  next();
});

// ... existing routes ...

export default router;
```

**Add deprecation notice to responses**:

```typescript
// In each route handler
res.json({
  ...data,
  _deprecation: {
    message: 'This endpoint is deprecated and will be removed in v2.0',
    replacement: `/api/admin${req.path}`,
    sunset: '2026-03-01'
  }
});
```

#### Step 12.4: Frontend Migration Checklist (30 min)

**Search frontend for legacy admin calls**:

```bash
# Find all admin API calls
grep -r "/admin-legacy\|/api/admin" client/src/ --include="*.tsx" --include="*.ts" > admin-frontend-usage.txt

# Review each occurrence
cat admin-frontend-usage.txt
```

**Create migration task list**:

```markdown
# Admin Route Migration Checklist

## Frontend Files to Update

- [ ] client/src/pages/admin/index.tsx
- [ ] client/src/pages/admin/users.tsx
- [ ] client/src/pages/admin/billing.tsx
- [ ] client/src/pages/admin/consultations.tsx

## Changes Needed

Replace:
- `/api/admin-legacy/*` → `/api/admin/*`
- Check for auth headers
- Test admin dashboard loads
```

#### Step 12.5: Security Audit (30 min)

**Verify RBAC on all admin routes**:

```typescript
// server/routes/admin-secured.ts

import { requirePermission } from '../middleware/rbac';

// All routes should have permission checks
router.get('/users',
  ensureAuthenticated,
  requirePermission('admin:users:read'),  // ✅ Good
  async (req, res) => {
    // ...
  }
);

router.post('/users/:id/suspend',
  ensureAuthenticated,
  requirePermission('admin:users:write'),  // ✅ Good
  async (req, res) => {
    // ...
  }
);
```

**Check legacy router for security gaps**:

```bash
# Find routes without requirePermission
grep -A 5 "router\.\(get\|post\)" server/routes/admin.ts | grep -v "requirePermission"
```

#### Step 12.6: Testing (30 min)

**Test admin routes**:

```bash
# Test new secured routes
curl http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Test legacy routes (should show deprecation warning)
curl http://localhost:5000/api/admin-legacy/users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Check for deprecation headers
curl -I http://localhost:5000/api/admin-legacy/users \
  -H "Authorization: Bearer ADMIN_TOKEN"
# Should show: X-API-Deprecated: true
```

---

## Phase 3: MEDIUM Priority Fixes (Day 6)

### Summary Table

| Fix # | Name | Time | Complexity | Rollback Risk |
|-------|------|------|------------|---------------|
| #7 | Auth Token Storage | 1 hour | Low | None |
| #8 | Journey Hub Redirect | 30 min | Low | Low |
| #9 | Pricing Endpoints | 1-2 hours | Medium | Low |
| #10 | SmartJourneys | Included in #8 | Low | None |
| #11 | Project Routers | 2-3 hours | Medium | Medium |
| #12 | Admin Routers | 2-3 hours | Medium | High |

**Total Phase 2-3 Time**: 7-11 hours (1-1.5 days)

---

## Phase 4: Cost Tracking Implementation - 3-Table Architecture

**Priority**: 🔴 **CRITICAL** - Required for accurate billing
**Estimated Time**: 4-6 hours (migration from simplified approach)
**Current Status**: ⚠️ **SIMPLIFIED VERSION IMPLEMENTED** - Needs migration to full 3-table architecture
**Dependencies**: Must complete after Phase 1 (billing service exists)

### Overview

Migrate from simplified cost tracking (fields in projects table) to full 3-table architecture for comprehensive cost tracking with audit trails, pricing snapshots, and monthly billing.

**Key Constraint**: All pricing must be configured through Admin UI, not hardcoded.

### What's Already Implemented (Simplified Approach)

✅ **Database**: Cost fields added to projects table (totalCostIncurred, lockedCostEstimate, costBreakdown)
✅ **Service**: CostTrackingService with calculateEstimatedCost, lockEstimatedCost, trackExecutionCost
✅ **Admin Pricing**: PricingDataService reads from subscriptionTierPricing table
✅ **Integration**: Costs locked at plan approval, tracked at execution

### Why Migrate to 3-Table Architecture?

| Capability | Current (Simplified) | After Migration |
|-----------|---------------------|-----------------|
| **Cost History** | Aggregated only | Full line-item detail |
| **Pricing Snapshots** | ❌ Not stored | ✅ Stored per transaction |
| **Audit Trail** | ❌ Limited | ✅ Complete audit log |
| **Monthly Billing** | ❌ Manual aggregation | ✅ Automated summaries |
| **Cost Attribution** | Project-level only | Line-item with metadata |
| **Historical Pricing** | ❌ Lost on price changes | ✅ Preserved in snapshots |
| **Dispute Resolution** | ❌ Difficult | ✅ Full transaction history |

### Migration Strategy: Zero Downtime

1. **Add new tables** (keep old fields for backward compatibility)
2. **Dual-write pattern** (write to both old and new tables)
3. **Verify new tables** work correctly
4. **Switch read path** to new tables
5. **Deprecate old fields** (optional cleanup)

### Current Infrastructure Analysis

**✅ Existing Components**:
- `subscriptionTierPricing` table - Admin-managed tier pricing with `journeyPricing`, `overagePricing` JSONB fields
- `servicePricing` table - Admin-managed service pricing with `pricingConfig` JSONB
- `admin-billing.ts` routes - Full CRUD for pricing tiers
- `admin-service-pricing.ts` routes - Service pricing management
- `UsageTrackingService` - Tracks AI queries, uploads, data volume
- Stripe sync service - Auto-syncs pricing with Stripe

**❌ Missing Components**:
1. Cost calculation based on admin-configured pricing
2. Per-project cost tracking and breakdown
3. Itemized cost line items storage
4. Monthly cost aggregation
5. Cost history and reporting

### Architecture Design

```
Admin UI (Pricing Config)
    ↓
Database Tables
├── subscriptionTierPricing
│   ├── journeyPricing: { ai_guided: 1.5, template_based: 1.2, ... }
│   ├── overagePricing: { aiQueries: 10, dataProcessing: 5, ... }  (in cents)
│   └── features: { costBreakdown: true, ... }
└── servicePricing
    └── pricingConfig: { complexity: { simple: 500, moderate: 1500 }, ... }
    ↓
NEW: Cost Calculation Service
├── Reads pricing from admin tables
├── Calculates costs based on usage
├── Stores itemized charges
└── Aggregates to monthly billing
    ↓
NEW: Database Tables
├── projectCostTracking (project-level costs)
├── costLineItems (itemized charges)
└── userMonthlyBilling (monthly aggregates)
```

### Step 4.1: Extend Database Schema (1 hour)

**File**: `shared/schema.ts`
**Time**: 1 hour (schema update + migration)
**Status**: ⚠️ Needs implementation (simplified version exists, need 3 tables)

#### Migration Notes

The simplified cost tracking added fields to the `projects` table:
- `totalCostIncurred` (decimal)
- `lockedCostEstimate` (decimal)
- `costBreakdown` (JSONB)

We'll **keep these fields** for backward compatibility and add 3 new tables alongside them. The CostTrackingService will write to both during migration.

#### Add Three New Tables

Add these tables after line 1947 (after analysisPlans table):

```typescript
// ============ COST TRACKING TABLES ============

/**
 * Project-level cost tracking
 * Aggregated costs for each project
 */
export const projectCostTracking = pgTable("project_cost_tracking", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Cost breakdown by category (in cents)
  dataProcessingCost: integer("data_processing_cost").default(0),
  aiQueryCost: integer("ai_query_cost").default(0),
  analysisExecutionCost: integer("analysis_execution_cost").default(0),
  visualizationCost: integer("visualization_cost").default(0),
  exportCost: integer("export_cost").default(0),
  collaborationCost: integer("collaboration_cost").default(0),

  totalCost: integer("total_cost").default(0).notNull(),

  // Metadata
  journeyType: varchar("journey_type"),
  subscriptionTier: varchar("subscription_tier"),
  billingCycle: varchar("billing_cycle").default("monthly"),

  // Period tracking
  periodStart: timestamp("period_start").defaultNow(),
  periodEnd: timestamp("period_end"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("pct_project_id_idx").on(table.projectId),
  userIdIdx: index("pct_user_id_idx").on(table.userId),
  periodIdx: index("pct_period_idx").on(table.periodStart, table.periodEnd),
}));

/**
 * Itemized cost line items
 * Individual cost-incurring events
 */
export const costLineItems = pgTable("cost_line_items", {
  id: varchar("id").primaryKey().notNull(),
  projectId: varchar("project_id").references(() => projects.id, { onDelete: 'set null' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Cost details
  category: varchar("category").notNull(), // data_processing, ai_query, etc.
  description: text("description").notNull(),
  unitCost: integer("unit_cost").notNull(), // Cost per unit in cents
  quantity: integer("quantity").default(1).notNull(),
  totalCost: integer("total_cost").notNull(),

  // Pricing configuration snapshot (what pricing was used)
  pricingTierId: varchar("pricing_tier_id"),
  pricingRuleId: varchar("pricing_rule_id"),
  pricingSnapshot: jsonb("pricing_snapshot"), // Snapshot of pricing rules at time of charge

  metadata: jsonb("metadata").default('{}'),

  incurredAt: timestamp("incurred_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectIdIdx: index("cli_project_id_idx").on(table.projectId),
  userIdIdx: index("cli_user_id_idx").on(table.userId),
  categoryIdx: index("cli_category_idx").on(table.category),
  incurredIdx: index("cli_incurred_idx").on(table.incurredAt),
}));

/**
 * User monthly billing aggregates
 * Pre-calculated monthly costs for invoicing
 */
export const userMonthlyBilling = pgTable("user_monthly_billing", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),

  // Billing period
  billingMonth: varchar("billing_month").notNull(), // YYYY-MM format
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),

  // Costs (in cents)
  subscriptionCost: integer("subscription_cost").default(0),
  usageCost: integer("usage_cost").default(0),
  overageCost: integer("overage_cost").default(0),
  totalCost: integer("total_cost").notNull(),

  // Breakdown
  categoryBreakdown: jsonb("category_breakdown").default('{}'),

  // Billing status
  status: varchar("status").default("pending"), // pending, invoiced, paid, failed
  invoiceId: varchar("invoice_id"),
  paidAt: timestamp("paid_at"),

  subscriptionTier: varchar("subscription_tier"),
  projectCount: integer("project_count").default(0),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("umb_user_id_idx").on(table.userId),
  monthIdx: index("umb_month_idx").on(table.billingMonth),
  statusIdx: index("umb_status_idx").on(table.status),
  periodIdx: index("umb_period_idx").on(table.periodStart, table.periodEnd),
  uniqueUserMonth: uniqueIndex("umb_user_month_unique").on(table.userId, table.billingMonth),
}));
```

**Update projects table** to add cost tracking reference:

```typescript
// In projects table definition, add these fields:
export const projects = pgTable("projects", {
  // ... existing fields ...

  // Cost tracking
  currentCostTrackingId: varchar("current_cost_tracking_id").references(() => projectCostTracking.id),
  totalCostToDate: integer("total_cost_to_date").default(0), // Lifetime cost in cents

  // ... rest of fields ...
});
```

**Run migration**:
```bash
npm run db:push
```

### Step 4.2: Refactor CostTrackingService (2-3 hours)

**File**: `server/services/cost-tracking.ts` (EXISTING - needs refactoring)
**Time**: 2-3 hours (update existing service to use 3 tables)
**Status**: ⚠️ Needs refactoring (simplified version exists, uses projects table fields)

#### Migration Strategy

The existing `CostTrackingService` (246 lines) already has:
- ✅ `calculateEstimatedCost()` - Calculates costs from admin pricing
- ✅ `lockEstimatedCost()` - Stores estimate when plan approved
- ✅ `trackExecutionCost()` - Tracks actual costs after execution
- ✅ `addCost()` - Adds individual costs
- ✅ `getCostSummary()` - Returns cost summary

**Refactoring Approach**:
1. Keep all method signatures (no breaking changes for callers)
2. Change implementation to write to new tables
3. Add dual-write to old fields for backward compatibility
4. Add new methods for monthly billing

#### Updated Implementation

Replace `server/services/cost-tracking.ts` with:

```typescript
import { db } from '../db';
import {
  subscriptionTierPricing,
  servicePricing,
  projectCostTracking,
  costLineItems,
  userMonthlyBilling,
  users,
  projects
} from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';

export interface FeatureCostInput {
  userId: string;
  projectId?: string;
  category: 'data_processing' | 'ai_query' | 'analysis_execution' | 'visualization' | 'export' | 'collaboration';
  description: string;
  quantity?: number;
  metadata?: any;
}

export interface CostResult {
  totalCost: number; // in cents
  unitCost: number;
  quantity: number;
  pricingUsed: {
    tierId: string;
    tierName: string;
    rule: string;
  };
}

export class CostCalculationService {
  private static instance: CostCalculationService;

  static getInstance() {
    if (!this.instance) {
      this.instance = new CostCalculationService();
    }
    return this.instance;
  }

  /**
   * Calculate and track cost for a feature usage
   * IMPORTANT: All pricing comes from admin-configured database tables
   */
  async trackFeatureCost(input: FeatureCostInput): Promise<string> {
    try {
      // 1. Get user's subscription tier
      const [user] = await db.select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) throw new Error('User not found');

      const tierName = user.subscriptionTier || 'trial';

      // 2. Get tier pricing from admin-managed table
      const [tierPricing] = await db.select()
        .from(subscriptionTierPricing)
        .where(eq(subscriptionTierPricing.id, tierName));

      if (!tierPricing) {
        console.warn(`No pricing found for tier: ${tierName}, using zero cost`);
        return this.createZeroCostLineItem(input);
      }

      // 3. Calculate unit cost from admin-configured pricing
      const costResult = this.calculateUnitCostFromPricing(
        input.category,
        tierPricing,
        input.metadata
      );

      const quantity = input.quantity || 1;
      const totalCost = costResult.unitCost * quantity;

      // 4. Create cost line item
      const lineItemId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      await db.insert(costLineItems).values({
        id: lineItemId,
        userId: input.userId,
        projectId: input.projectId || null,
        category: input.category,
        description: input.description,
        unitCost: costResult.unitCost,
        quantity: quantity,
        totalCost: totalCost,
        pricingTierId: tierName,
        pricingRuleId: costResult.ruleUsed,
        pricingSnapshot: {
          tierName: tierPricing.displayName,
          overagePricing: tierPricing.overagePricing,
          journeyPricing: tierPricing.journeyPricing
        },
        metadata: input.metadata || {},
        incurredAt: new Date()
      });

      // 5. Update project cost tracking
      if (input.projectId) {
        await this.updateProjectCosts(input.projectId, input.category, totalCost);
      }

      // 6. Update monthly billing
      await this.updateMonthlyBilling(input.userId, totalCost, input.category);

      console.log(`✅ Tracked cost: $${(totalCost / 100).toFixed(2)} for ${input.category}`);

      return lineItemId;
    } catch (error) {
      console.error('Error tracking feature cost:', error);
      throw error;
    }
  }

  /**
   * Calculate unit cost from admin-configured pricing
   */
  private calculateUnitCostFromPricing(
    category: string,
    tierPricing: any,
    metadata: any
  ): { unitCost: number; ruleUsed: string } {
    const overagePricing = (tierPricing.overagePricing as any) || {};

    // Map categories to pricing keys
    const categoryMap: Record<string, string> = {
      data_processing: 'dataProcessing',
      ai_query: 'aiQueries',
      analysis_execution: 'analysisExecution',
      visualization: 'visualizations',
      export: 'exports',
      collaboration: 'collaboration'
    };

    const pricingKey = categoryMap[category] || category;
    let unitCost = overagePricing[pricingKey] || 0; // Already in cents from admin config

    // Apply metadata-based multipliers (business logic only, not pricing)
    if (category === 'ai_query') {
      const queryType = metadata?.type || 'simple';
      const multipliers = { simple: 1.0, advanced: 2.0, code_generation: 3.0 };
      unitCost *= (multipliers[queryType] || 1.0);
    }

    if (category === 'analysis_execution') {
      const complexity = metadata?.complexity || 'moderate';
      const multipliers = { simple: 1.0, moderate: 2.0, complex: 4.0 };
      unitCost *= (multipliers[complexity] || 1.0);
    }

    return {
      unitCost: Math.round(unitCost),
      ruleUsed: `${pricingKey}_${metadata?.type || metadata?.complexity || 'standard'}`
    };
  }

  /**
   * Update project cost tracking
   */
  private async updateProjectCosts(projectId: string, category: string, cost: number) {
    const [project] = await db.select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) return;

    let trackingId = project.currentCostTrackingId;

    if (!trackingId) {
      // Create new tracking record
      trackingId = `pct_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      await db.insert(projectCostTracking).values({
        id: trackingId,
        projectId: projectId,
        userId: project.userId,
        journeyType: project.journeyType,
        subscriptionTier: project.subscriptionTier,
        totalCost: 0,
        periodStart: new Date()
      });

      await db.update(projects)
        .set({ currentCostTrackingId: trackingId })
        .where(eq(projects.id, projectId));
    }

    // Update costs
    const categoryCol = this.getCategoryColumn(category);

    await db.execute(sql`
      UPDATE project_cost_tracking
      SET ${sql.identifier(categoryCol)} = ${sql.identifier(categoryCol)} + ${cost},
          total_cost = total_cost + ${cost},
          updated_at = NOW()
      WHERE id = ${trackingId}
    `);

    await db.execute(sql`
      UPDATE projects
      SET total_cost_to_date = total_cost_to_date + ${cost}
      WHERE id = ${projectId}
    `);
  }

  /**
   * Update user monthly billing
   */
  private async updateMonthlyBilling(userId: string, cost: number, category: string) {
    const month = this.getCurrentMonth();
    const { start, end } = this.getMonthPeriod();

    const [existing] = await db.select()
      .from(userMonthlyBilling)
      .where(and(
        eq(userMonthlyBilling.userId, userId),
        eq(userMonthlyBilling.billingMonth, month)
      ));

    if (existing) {
      // Update existing
      const breakdown = (existing.categoryBreakdown as any) || {};
      breakdown[category] = (breakdown[category] || 0) + cost;

      await db.update(userMonthlyBilling)
        .set({
          usageCost: existing.usageCost + cost,
          totalCost: existing.totalCost + cost,
          categoryBreakdown: breakdown,
          updatedAt: new Date()
        })
        .where(eq(userMonthlyBilling.id, existing.id));
    } else {
      // Create new
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const tier = user?.subscriptionTier || 'trial';

      const [tierPricing] = await db.select()
        .from(subscriptionTierPricing)
        .where(eq(subscriptionTierPricing.id, tier));

      const subscriptionCost = tierPricing?.monthlyPriceUsd || 0;

      await db.insert(userMonthlyBilling).values({
        id: `umb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: userId,
        billingMonth: month,
        periodStart: start,
        periodEnd: end,
        subscriptionCost: subscriptionCost,
        usageCost: cost,
        overageCost: 0,
        totalCost: subscriptionCost + cost,
        categoryBreakdown: { [category]: cost },
        subscriptionTier: tier,
        status: 'pending'
      });
    }
  }

  /**
   * Get project cost breakdown
   */
  async getProjectCostBreakdown(projectId: string) {
    const lineItems = await db.select()
      .from(costLineItems)
      .where(eq(costLineItems.projectId, projectId));

    const breakdown: Record<string, number> = {};
    let total = 0;

    lineItems.forEach(item => {
      breakdown[item.category] = (breakdown[item.category] || 0) + item.totalCost;
      total += item.totalCost;
    });

    return { totalCost: total, categoryBreakdown: breakdown, lineItems };
  }

  /**
   * Get user monthly summary
   */
  async getUserMonthlySummary(userId: string, month?: string) {
    const billingMonth = month || this.getCurrentMonth();

    const [summary] = await db.select()
      .from(userMonthlyBilling)
      .where(and(
        eq(userMonthlyBilling.userId, userId),
        eq(userMonthlyBilling.billingMonth, billingMonth)
      ));

    return summary || {
      billingMonth,
      totalCost: 0,
      subscriptionCost: 0,
      usageCost: 0,
      overageCost: 0,
      categoryBreakdown: {},
      status: 'pending'
    };
  }

  // Helper methods
  private createZeroCostLineItem(input: FeatureCostInput): string {
    const id = `cli_${Date.now()}_zero`;
    // Don't actually insert zero-cost items
    console.log(`Zero cost for ${input.category} (no pricing configured)`);
    return id;
  }

  private getCategoryColumn(category: string): string {
    const map: Record<string, string> = {
      data_processing: 'data_processing_cost',
      ai_query: 'ai_query_cost',
      analysis_execution: 'analysis_execution_cost',
      visualization: 'visualization_cost',
      export: 'export_cost',
      collaboration: 'collaboration_cost'
    };
    return map[category] || 'data_processing_cost';
  }

  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonthPeriod() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  }
}

export const costCalculationService = CostCalculationService.getInstance();
```

### Step 4.3: Integrate with UsageTrackingService (1-2 hours)

**File**: `server/services/usage-tracking.ts`

Update existing tracking methods to also track costs:

```typescript
import { costCalculationService } from './cost-calculation-service';

export class UsageTrackingService {
  /**
   * Track AI query usage (UPDATED to track cost)
   */
  static async trackAiQuery(userId: string, queryType: 'simple' | 'advanced' | 'code_generation' = 'simple'): Promise<UsageCheckResult> {
    // Existing usage limit check
    const result = await this.checkUsageLimit(userId, 'aiQueries');

    if (!result.allowed) {
      return result;
    }

    // Existing usage increment
    const queryCost = this.getQueryCost(queryType);
    await db.update(users)
      .set({
        monthlyAIInsights: (result.currentUsage + queryCost),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // ⭐ NEW: Track cost
    await costCalculationService.trackFeatureCost({
      userId: userId,
      category: 'ai_query',
      description: `AI ${queryType} query`,
      quantity: queryCost,
      metadata: { type: queryType }
    });

    return {
      ...result,
      currentUsage: result.currentUsage + queryCost,
      remainingUsage: result.limit - (result.currentUsage + queryCost),
      percentageUsed: ((result.currentUsage + queryCost) / result.limit) * 100
    };
  }

  /**
   * Track data upload usage (UPDATED to track cost)
   */
  static async trackDataUpload(userId: string, fileSizeMB: number): Promise<UsageCheckResult> {
    // Existing checks...
    const sizeCheck = await this.checkUsageLimit(userId, 'dataVolume', fileSizeMB);
    if (!sizeCheck.allowed) return sizeCheck;

    const uploadCheck = await this.checkUsageLimit(userId, 'dataUploads');
    if (!uploadCheck.allowed) return uploadCheck;

    // Existing usage update
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length > 0) {
      await db.update(users)
        .set({
          monthlyUploads: (user[0].monthlyUploads || 0) + 1,
          monthlyDataVolume: (user[0].monthlyDataVolume || 0) + fileSizeMB,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    // ⭐ NEW: Track cost
    await costCalculationService.trackFeatureCost({
      userId: userId,
      category: 'data_processing',
      description: `Data upload (${fileSizeMB}MB)`,
      quantity: Math.ceil(fileSizeMB), // Round up MB
      metadata: { sizeMB: fileSizeMB }
    });

    return uploadCheck;
  }

  // Similarly update:
  // - trackVisualizationGeneration
  // - trackCodeGeneration
  // - trackConsultationUsage
}
```

### Step 4.4: Create API Endpoints (2 hours)

**File**: `server/routes/cost-tracking.ts`

```typescript
import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { costCalculationService } from '../services/cost-calculation-service';

const router = Router();

/**
 * GET /api/cost-tracking/project/:projectId
 * Get project cost breakdown
 */
router.get('/project/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    // TODO: Add ownership check

    const breakdown = await costCalculationService.getProjectCostBreakdown(projectId);

    res.json({
      success: true,
      projectId,
      totalCost: breakdown.totalCost / 100, // Convert to dollars
      totalCostCents: breakdown.totalCost,
      categoryBreakdown: Object.entries(breakdown.categoryBreakdown).reduce((acc, [k, v]) => {
        acc[k] = { cents: v, dollars: v / 100 };
        return acc;
      }, {} as any),
      lineItems: breakdown.lineItems.map(item => ({
        ...item,
        totalCost: item.totalCost / 100,
        unitCost: item.unitCost / 100
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cost-tracking/monthly
 * Get user's monthly cost summary
 */
router.get('/monthly', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { month } = req.query; // Optional: YYYY-MM format

    const summary = await costCalculationService.getUserMonthlySummary(
      userId,
      month as string
    );

    res.json({
      success: true,
      summary: {
        ...summary,
        totalCost: summary.totalCost / 100,
        subscriptionCost: summary.subscriptionCost / 100,
        usageCost: summary.usageCost / 100,
        overageCost: summary.overageCost / 100
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

**Register router** in `server/routes/index.ts`:

```typescript
import costTrackingRouter from './cost-tracking';

router.use('/cost-tracking', ensureAuthenticated, costTrackingRouter);
```

### Step 4.5: Admin UI - Configure Pricing (30 min)

**Example pricing configuration** (via Admin UI):

```json
// subscriptionTierPricing.overagePricing for "professional" tier
{
  "dataProcessing": 5,      // 5 cents per MB over limit
  "aiQueries": 10,          // 10 cents per query over limit
  "analysisExecution": 50,  // 50 cents per analysis over limit
  "visualizations": 20,     // 20 cents per visualization over limit
  "exports": 15,            // 15 cents per export over limit
  "collaboration": 30       // 30 cents per collaboration feature use
}

// subscriptionTierPricing.journeyPricing
{
  "ai_guided": 1.5,         // 1.5x multiplier for AI-guided journeys
  "template_based": 1.2,    // 1.2x multiplier
  "self_service": 1.0,      // 1.0x (no multiplier)
  "consultation": 3.0,      // 3.0x multiplier
  "custom": 2.5             // 2.5x multiplier
}
```

Admin can update these via existing `/api/admin/billing/tiers` POST endpoint.

### Step 4.6: Testing (2-3 hours)

**Test Scenarios**:

1. **Configure Pricing via Admin UI**:
```bash
curl -X POST http://localhost:5000/api/admin/billing/tiers \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tier": {
      "id": "professional",
      "displayName": "Professional",
      "monthlyPriceUsd": 9900,
      "overagePricing": {
        "aiQueries": 10,
        "dataProcessing": 5
      }
    }
  }'
```

2. **Track AI Query Cost**:
```typescript
// In your code
await UsageTrackingService.trackAiQuery(userId, 'advanced');

// Should create:
// - Usage record (existing)
// - Cost line item (new) with cost from admin pricing
```

3. **Get Project Cost Breakdown**:
```bash
curl http://localhost:5000/api/cost-tracking/project/PROJECT_ID \
  -H "Authorization: Bearer TOKEN"

# Expected response:
{
  "success": true,
  "totalCost": 12.50,
  "categoryBreakdown": {
    "ai_query": { "cents": 800, "dollars": 8.00 },
    "data_processing": { "cents": 450, "dollars": 4.50 }
  },
  "lineItems": [...]
}
```

4. **Get Monthly Summary**:
```bash
curl http://localhost:5000/api/cost-tracking/monthly \
  -H "Authorization: Bearer TOKEN"

# Expected:
{
  "summary": {
    "billingMonth": "2025-11",
    "totalCost": 112.50,
    "subscriptionCost": 99.00,
    "usageCost": 13.50,
    "categoryBreakdown": {...}
  }
}
```

### Success Criteria

- ✅ All pricing configured via Admin UI
- ✅ Costs calculated from database pricing (no hardcoded values)
- ✅ Per-project cost breakdown available
- ✅ Monthly cost aggregation working
- ✅ Line items stored with pricing snapshots
- ✅ Existing usage tracking enhanced with cost tracking
- ✅ Admin can adjust pricing and it affects new cost calculations
- ✅ Historical costs preserved (pricing snapshot in line items)

---

## Summary Checklist

### Phase 1 (Days 1-3) - CRITICAL
- [ ] Fix #1: Billing Service Files (4-8 hours)
- [ ] Fix #2: Journey Type Routing (2-4 hours)
- [ ] Fix #5: Real Stripe Integration (4-6 hours)
- [ ] Fix #6: Unified Data Retrieval (3-4 hours)

### Phase 2 (Days 4-5) - HIGH
- [ ] Fix #3: Consolidate Routes (1-2 hours)
- [ ] Fix #4: Data Verification Stage (2-3 hours)
- [ ] Fix #9: Pricing Endpoints (1-2 hours)
- [ ] Fix #11: Project Routers (2-3 hours)

### Phase 3 (Day 6) - MEDIUM
- [ ] Fix #7: Token Storage (1 hour)
- [ ] Fix #8: Journey Redirect (30 min)
- [ ] Fix #10: SmartJourneys (1 hour)
- [ ] Fix #12: Admin Routers (2-3 hours)

### Phase 4 (0.5 day) - Component Fixes
- [ ] Fix #20: Null Validation (30 min)
- [ ] Fix #21: Loading States (1 hour)
- [ ] Fix #22: Array Keys (15 min)
- [ ] Fix #23: Geospatial Support (20 min)
- [ ] Fix #24: Accessibility (45 min)
- [ ] Fix #25: Performance (15 min)
- [ ] Fix #26: Dynamic Messages (20 min)
- [ ] Fix #27: Theme Centralization (1 hour)

---

**Total Estimated Time**: 4-6 days for complete implementation

**Next Steps**:
1. Review this execution plan with team
2. Assign developers to each phase
3. Set up feature flags for gradual rollout
4. Create tracking board for progress monitoring
