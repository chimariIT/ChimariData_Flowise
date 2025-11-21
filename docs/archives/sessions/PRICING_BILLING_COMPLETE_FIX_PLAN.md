# Pricing & Billing Complete Fix Plan

## Executive Summary

This document outlines a comprehensive plan to centralize all pricing, subscription, and billing data in the database with full Stripe integration and admin management capabilities.

**Goal**: All pricing, subscriptions, and usage data should come from admin-managed database records tied to Stripe. No hardcoded pricing values anywhere.

---

## Current State Analysis

### ✅ What's Already Working

#### 1. Service Pricing Infrastructure (Partial)
- **Database Table**: `servicePricing` table exists in `shared/schema.ts:625-641`
- **Admin API**: `/api/admin/service-pricing` endpoints exist in `server/routes/admin-service-pricing.ts`
  - GET `/api/admin/service-pricing` - List all services
  - POST `/api/admin/service-pricing` - Create new service
  - PUT `/api/admin/service-pricing/:id` - Update service
  - DELETE `/api/admin/service-pricing/:id` - Deactivate service
  - POST `/api/admin/service-pricing/:id/sync-stripe` - Stripe sync endpoint (stub)
- **Admin UI**: `client/src/pages/admin/pricing-services.tsx` - Service pricing management page
- **Frontend Integration**: `client/src/pages/pricing.tsx:68-78` - Fetches service pricing from database

#### 2. Subscription Tier Infrastructure (Partial)
- **Database Table**: `subscriptionTierPricing` table exists in `shared/schema.ts:644-664`
- **Stripe Sync Service**: `server/services/stripe-sync.ts` - Product/price sync (uses hardcoded data)

#### 3. Billing Infrastructure
- **Unified Billing Service**: `server/services/billing/unified-billing-service.ts` - Consolidated billing logic
- **Usage Tracking**: ML/LLM usage tracker integrated
- **Stripe Webhooks**: Signature verification and event handling

### ❌ Critical Gaps

#### 1. Service Pricing Issues
**Location**: `server/routes/admin-service-pricing.ts:305-306`
```typescript
// TODO: Implement Stripe product/price creation for services
// This would create a Stripe product for the service and update the database with IDs
```

**Impact**:
- Admin can update service prices in database
- Changes DO NOT propagate to Stripe
- Payments still use old Stripe prices
- No sync between database and Stripe

**Files Affected**:
- `server/routes/admin-service-pricing.ts` - Stripe sync stub
- Frontend fetches from database but Stripe uses different prices

#### 2. Subscription Tiers Not Database-Backed
**Location**: `shared/unified-subscription-tiers.ts` (entire file - 500+ lines)

**Impact**:
- All subscription tiers are hardcoded in TypeScript file
- Admin CANNOT update subscription prices
- Admin CANNOT update tier features/limits
- Admin CANNOT add new tiers
- `subscriptionTierPricing` database table exists but is UNUSED
- Changes require code deployment

**Files Affected**:
- `server/routes/pricing.ts:2` - Imports hardcoded tiers
- `client/src/pages/pricing.tsx:8` - Imports hardcoded tiers
- `server/services/stripe-sync.ts:12` - Uses hardcoded tiers for Stripe sync
- Multiple other files import `UNIFIED_SUBSCRIPTION_TIERS`

#### 3. Usage Billing Uses Hardcoded Pricing
**Location**: `server/services/billing/unified-billing-service.ts`

**Impact**:
- Usage calculations use hardcoded prices
- Feature pricing not pulled from database
- Overage charges use hardcoded rates
- Journey pricing multipliers hardcoded

**Specific Issues**:
- `AdminSubscriptionTierConfig` interface (lines 42-105) defines hardcoded structure
- No database queries for pricing during usage billing
- All pricing logic uses in-memory configuration

#### 4. Feature Pricing Not Implemented
**Missing**:
- No database table for individual feature pricing (analysis, visualization, ML, etc.)
- No admin API for feature pricing management
- No admin UI for feature configuration
- All feature prices hardcoded in service files

**Impact**:
- Cannot adjust individual feature prices (e.g., statistical analysis, ML pipeline)
- Cannot create pricing rules (size/complexity multipliers)
- Cannot track feature-level revenue

#### 5. Eligibility Rules Not Tied to Database
**Location**: Throughout codebase

**Impact**:
- Feature eligibility checks use hardcoded tier data
- Quota enforcement uses hardcoded limits
- Admin cannot adjust quotas without code changes

---

## Complete Solution Architecture

### Phase 1: Service Pricing Stripe Integration (High Priority)

#### Implementation Steps

**1.1. Implement Stripe Sync for Services**

Update `server/routes/admin-service-pricing.ts:285-317`:

```typescript
/**
 * POST /api/admin/service-pricing/:id/sync-stripe
 * Sync service pricing with Stripe
 */
router.post('/:id/sync-stripe', ensureAuthenticated, ensureAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stripeSyncService = getStripeSyncService();

    if (!stripeSyncService.isStripeConfigured()) {
      return res.status(400).json({ error: 'Stripe is not configured' });
    }

    const [service] = await db.select().from(servicePricing).where(eq(servicePricing.id, id));

    if (!service) {
      return res.status(404).json({ error: 'Service pricing not found' });
    }

    // Create or update Stripe product
    const result = await stripeSyncService.syncServiceWithStripe(service.id, {
      name: service.displayName,
      description: service.description || '',
      price: service.basePrice / 100, // Convert cents to dollars
      serviceType: service.serviceType
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Update database with Stripe IDs
    await db.update(servicePricing)
      .set({
        stripeProductId: result.stripeProductId,
        stripePriceId: result.stripePriceId,
        updatedAt: new Date()
      })
      .where(eq(servicePricing.id, id));

    res.json({
      success: true,
      message: 'Stripe sync completed successfully',
      stripeProductId: result.stripeProductId,
      stripePriceId: result.stripePriceId
    });
  } catch (error: any) {
    console.error('Error syncing with Stripe:', error);
    res.status(500).json({ error: error.message || 'Failed to sync with Stripe' });
  }
});
```

**1.2. Extend Stripe Sync Service**

Add to `server/services/stripe-sync.ts`:

```typescript
/**
 * Sync a one-time service with Stripe
 * Creates or updates the Stripe product and price
 */
async syncServiceWithStripe(
  serviceId: string,
  serviceData: {
    name: string;
    description: string;
    price: number;
    serviceType: string;
  }
): Promise<{
  success: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  error?: string;
}> {
  if (!this.isConfigured) {
    return { success: false, error: 'Stripe not configured' };
  }

  try {
    // Create or update product
    const product = await this.stripe.products.create({
      name: serviceData.name,
      description: serviceData.description,
      metadata: {
        serviceId: serviceId,
        serviceType: serviceData.serviceType
      }
    });

    // Create price (one-time payment)
    const price = await this.stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(serviceData.price * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        serviceType: serviceData.serviceType
      }
    });

    return {
      success: true,
      stripeProductId: product.id,
      stripePriceId: price.id
    };
  } catch (error: any) {
    console.error('Error syncing service with Stripe:', error);
    return { success: false, error: error.message };
  }
}
```

**1.3. Auto-Sync on Price Update**

Update `server/routes/admin-service-pricing.ts` PUT endpoint to auto-sync:

```typescript
// After updating service in database
if (updateData.basePrice !== undefined) {
  // Auto-sync with Stripe if price changed
  const stripeSyncService = getStripeSyncService();
  if (stripeSyncService.isStripeConfigured()) {
    await stripeSyncService.syncServiceWithStripe(id, {
      name: updated.displayName,
      description: updated.description || '',
      price: updated.basePrice / 100,
      serviceType: updated.serviceType
    });
  }
}
```

**1.4. Seed Initial Service Pricing Data**

Create `migrations/seed-service-pricing.sql`:

```sql
-- Seed initial service pricing data
INSERT INTO service_pricing (id, service_type, display_name, description, base_price, pricing_model, is_active, created_at, updated_at)
VALUES
  ('sp_pay_per_analysis', 'pay-per-analysis', 'Pay-Per-Analysis', 'One-time data analysis with comprehensive insights', 2500, 'calculated', true, NOW(), NOW()),
  ('sp_expert_consultation', 'expert-consultation', 'Expert Consultation', 'Personalized consultation with data science experts', 15000, 'fixed', true, NOW(), NOW())
ON CONFLICT (service_type) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  base_price = EXCLUDED.base_price,
  updated_at = NOW();
```

---

### Phase 2: Subscription Tier Database Migration (High Priority)

#### Implementation Steps

**2.1. Seed Subscription Tiers into Database**

Create `migrations/seed-subscription-tiers.sql`:

```sql
-- Migrate subscription tiers from code file to database
INSERT INTO subscription_tier_pricing (
  id, name, display_name, description,
  monthly_price_usd, yearly_price_usd,
  limits, features, support_config,
  journey_pricing, overage_pricing, discounts,
  is_active, created_at, updated_at
)
VALUES
  -- Trial Tier
  (
    'trial',
    'trial',
    'Free Trial',
    'Try ChimariData with limited features',
    0, -- $0/month
    0, -- $0/year
    '{
      "maxFiles": 2,
      "maxFileSizeMB": 5,
      "totalDataVolumeMB": 10,
      "aiInsights": 5,
      "maxAnalysisComponents": 2,
      "maxVisualizations": 3
    }'::jsonb,
    '["dataTransformation", "statisticalAnalysis", "piiDetection"]'::jsonb,
    '{
      "level": "community",
      "responseTime": "72 hours",
      "channels": ["documentation"]
    }'::jsonb,
    '{
      "non-tech": 1.0,
      "business": 1.2,
      "technical": 0.8,
      "consultation": 2.0
    }'::jsonb,
    '{
      "dataPerMB": 0.10,
      "computePerMinute": 0.05,
      "storagePerMB": 0.01,
      "agentInteractionCost": 0.02,
      "toolExecutionCost": 0.01
    }'::jsonb,
    '{
      "dataProcessingDiscount": 0,
      "agentUsageDiscount": 0,
      "toolUsageDiscount": 0
    }'::jsonb,
    true,
    NOW(),
    NOW()
  ),

  -- Starter Tier
  (
    'starter',
    'starter',
    'Starter',
    'Perfect for individuals and small projects',
    29, -- $29/month
    290, -- $290/year (2 months free)
    '{
      "maxFiles": 10,
      "maxFileSizeMB": 50,
      "totalDataVolumeMB": 500,
      "aiInsights": 50,
      "maxAnalysisComponents": 5,
      "maxVisualizations": 10,
      "mlBasic": true
    }'::jsonb,
    '["dataTransformation", "statisticalAnalysis", "advancedInsights", "piiDetection", "mlBasic"]'::jsonb,
    '{
      "level": "email",
      "responseTime": "48 hours",
      "channels": ["email", "documentation"]
    }'::jsonb,
    '{
      "non-tech": 1.0,
      "business": 1.2,
      "technical": 0.8,
      "consultation": 1.8
    }'::jsonb,
    '{
      "dataPerMB": 0.08,
      "computePerMinute": 0.04,
      "storagePerMB": 0.008,
      "agentInteractionCost": 0.015,
      "toolExecutionCost": 0.008
    }'::jsonb,
    '{
      "dataProcessingDiscount": 10,
      "agentUsageDiscount": 10,
      "toolUsageDiscount": 10
    }'::jsonb,
    true,
    NOW(),
    NOW()
  ),

  -- Professional Tier (add remaining tiers)
  -- ... (similar structure for professional and enterprise)

ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  yearly_price_usd = EXCLUDED.yearly_price_usd,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  support_config = EXCLUDED.support_config,
  journey_pricing = EXCLUDED.journey_pricing,
  overage_pricing = EXCLUDED.overage_pricing,
  discounts = EXCLUDED.discounts,
  updated_at = NOW();
```

**2.2. Update Pricing API to Use Database**

Update `server/routes/pricing.ts:18-93`:

```typescript
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const billingCycle = req.query.cycle as 'monthly' | 'yearly' || 'monthly';

    // Fetch tiers from database instead of code file
    const dbTiers = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.isActive, true));

    // Convert database tiers to API format
    const tiers = dbTiers.map(tier => {
      const price = billingCycle === 'yearly' ? tier.yearlyPriceUsd : tier.monthlyPriceUsd;
      const limits = tier.limits as any;
      const features = tier.features as string[];
      const supportConfig = tier.supportConfig as any;

      return {
        id: tier.id,
        name: tier.displayName,
        type: tier.id,
        description: tier.description,
        price: price,
        priceLabel: billingCycle === 'yearly' ? `$${price}/year` : `$${price}/month`,
        features: buildFeaturesList(limits, features),
        limits: buildLimitsObject(limits),
        recommended: tier.id === 'professional',
        stripeProductId: tier.stripeProductId,
        stripePriceId: tier.stripePriceId,
        journeyPricing: tier.journeyPricing,
        overagePricing: tier.overagePricing
      };
    });

    res.json({ success: true, tiers, billingCycle });
  } catch (error: any) {
    console.error('Error getting pricing tiers:', error);
    res.status(500).json({ success: false, error: 'Failed to get pricing tiers' });
  }
});
```

**2.3. Create Admin UI for Subscription Tiers**

Create `client/src/pages/admin/subscription-tiers.tsx`:

```typescript
/**
 * Admin Subscription Tier Management Page
 *
 * Allows admins to configure subscription tiers, pricing, features, and limits
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
// ... (similar structure to pricing-services.tsx but for subscription tiers)

export default function SubscriptionTiersPage({ onBack }: { onBack: () => void }) {
  // Implementation for tier management
  // - View all tiers
  // - Edit tier pricing (monthly/yearly)
  // - Edit tier limits and features
  // - Edit journey pricing multipliers
  // - Edit overage pricing
  // - Sync with Stripe button
}
```

**2.4. Create Admin API for Subscription Tiers**

Create `server/routes/admin-subscription-tiers.ts`:

```typescript
/**
 * Admin Subscription Tier Management Routes
 *
 * Admin-only endpoints for managing subscription tiers
 */

import { Router } from 'express';
import { db } from '../db';
import { subscriptionTierPricing } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { ensureAuthenticated } from './auth';

const router = Router();

// GET /api/admin/subscription-tiers - List all tiers
router.get('/', ensureAuthenticated, ensureAdmin, async (req, res) => {
  // Implementation
});

// GET /api/admin/subscription-tiers/:id - Get specific tier
router.get('/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  // Implementation
});

// PUT /api/admin/subscription-tiers/:id - Update tier
router.put('/:id', ensureAuthenticated, ensureAdmin, async (req, res) => {
  // Implementation
  // Auto-sync with Stripe after update
});

// POST /api/admin/subscription-tiers/:id/sync-stripe - Sync with Stripe
router.post('/:id/sync-stripe', ensureAuthenticated, ensureAdmin, async (req, res) => {
  // Implementation
});

export default router;
```

**2.5. Update Stripe Sync Service**

Update `server/services/stripe-sync.ts` to read from database:

```typescript
/**
 * Sync subscription tier from database with Stripe
 */
async syncTierFromDatabase(tierId: string): Promise<SyncResult> {
  // Fetch tier from database
  const [tier] = await db
    .select()
    .from(subscriptionTierPricing)
    .where(eq(subscriptionTierPricing.id, tierId));

  if (!tier) {
    return { success: false, error: 'Tier not found in database' };
  }

  // Sync with Stripe using database values
  return await this.syncTierWithStripe(tier.id, {
    name: tier.displayName,
    description: tier.description,
    price: tier.monthlyPriceUsd,
    // ... other tier data from database
  });
}
```

---

### Phase 3: Feature Pricing System (Medium Priority)

#### Implementation Steps

**3.1. Create Feature Pricing Tables**

Add to `shared/schema.ts`:

```typescript
// Feature pricing configuration (admin-managed)
export const featurePricing = pgTable("feature_pricing", {
  id: varchar("id").primaryKey().notNull(),
  featureId: varchar("feature_id").notNull().unique(), // 'statistical_analysis', 'ml_pipeline', etc.
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  category: varchar("category").notNull(), // 'analysis', 'ml', 'visualization', 'data_processing'

  // Complexity-based pricing
  basePrice: integer("base_price").notNull(), // Base price in cents
  smallComplexity: integer("small_complexity").notNull(), // Multiplier for small datasets
  mediumComplexity: integer("medium_complexity").notNull(), // Multiplier for medium datasets
  largeComplexity: integer("large_complexity").notNull(), // Multiplier for large datasets
  extraLargeComplexity: integer("extra_large_complexity").notNull(), // Multiplier for XL datasets

  // Tier-based access
  availableInTiers: jsonb("available_in_tiers").notNull(), // ['starter', 'professional', 'enterprise']

  // Stripe integration
  stripeProductId: varchar("stripe_product_id"),

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pricing rules (size multipliers, addons, discounts)
export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id").primaryKey().notNull(),
  ruleType: varchar("rule_type").notNull(), // 'size_multiplier', 'complexity_addon', 'bundle_discount'
  name: varchar("name").notNull(),
  description: text("description"),

  // Rule configuration
  conditions: jsonb("conditions").notNull(), // Conditions for rule application
  action: jsonb("action").notNull(), // Pricing adjustment action

  priority: integer("priority").default(0), // Rule priority for conflict resolution
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**3.2. Create Feature Pricing Admin API**

Create `server/routes/admin-feature-pricing.ts`:

```typescript
/**
 * Admin Feature Pricing Management Routes
 */

// GET /api/admin/feature-pricing - List all features
// POST /api/admin/feature-pricing - Create new feature
// PUT /api/admin/feature-pricing/:id - Update feature pricing
// DELETE /api/admin/feature-pricing/:id - Deactivate feature
// POST /api/admin/feature-pricing/:id/sync-stripe - Sync with Stripe
```

**3.3. Create Feature Pricing Admin UI**

Create `client/src/pages/admin/feature-pricing.tsx`:

```typescript
/**
 * Admin Feature Pricing Management Page
 *
 * Manage individual feature pricing:
 * - Statistical analysis
 * - ML pipelines
 * - Visualization engine
 * - Data transformation
 * - etc.
 */
```

**3.4. Seed Initial Feature Pricing**

Create `migrations/seed-feature-pricing.sql`:

```sql
-- Seed feature pricing data
INSERT INTO feature_pricing (
  id, feature_id, display_name, description, category,
  base_price, small_complexity, medium_complexity, large_complexity, extra_large_complexity,
  available_in_tiers, is_active, created_at, updated_at
)
VALUES
  (
    'fp_statistical_analysis',
    'statistical_analysis',
    'Statistical Analysis',
    'ANOVA, regression, correlation, hypothesis testing',
    'analysis',
    500, -- $5.00 base
    100, -- 1x for small
    200, -- 2x for medium
    400, -- 4x for large
    800, -- 8x for extra large
    '["starter", "professional", "enterprise"]'::jsonb,
    true,
    NOW(),
    NOW()
  ),
  (
    'fp_ml_pipeline',
    'ml_pipeline',
    'ML Pipeline',
    'Machine learning model training and evaluation',
    'ml',
    1000, -- $10.00 base
    100, -- 1x for small
    250, -- 2.5x for medium
    500, -- 5x for large
    1000, -- 10x for extra large
    '["professional", "enterprise"]'::jsonb,
    true,
    NOW(),
    NOW()
  )
  -- Add more features...
;
```

---

### Phase 4: Update Usage Billing (High Priority)

#### Implementation Steps

**4.1. Create Pricing Data Service**

Create `server/services/pricing-data-service.ts`:

```typescript
/**
 * Pricing Data Service
 *
 * Centralized service for fetching all pricing data from database
 * Used by billing service for calculations
 */

export class PricingDataService {
  /**
   * Get subscription tier pricing from database
   */
  async getTierPricing(tierId: string) {
    const [tier] = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.id, tierId));

    return tier;
  }

  /**
   * Get service pricing from database
   */
  async getServicePricing(serviceType: string) {
    const [service] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.serviceType, serviceType));

    return service;
  }

  /**
   * Get feature pricing from database
   */
  async getFeaturePricing(featureId: string) {
    const [feature] = await db
      .select()
      .from(featurePricing)
      .where(eq(featurePricing.featureId, featureId));

    return feature;
  }

  /**
   * Calculate feature price based on complexity
   */
  calculateFeaturePrice(feature: any, complexity: string, dataSize: number) {
    const basePrice = feature.basePrice;
    const multiplier = this.getComplexityMultiplier(feature, complexity);
    return Math.round((basePrice * multiplier) / 100); // Convert cents to dollars
  }

  private getComplexityMultiplier(feature: any, complexity: string) {
    switch (complexity) {
      case 'small': return feature.smallComplexity / 100;
      case 'medium': return feature.mediumComplexity / 100;
      case 'large': return feature.largeComplexity / 100;
      case 'extra_large': return feature.extraLargeComplexity / 100;
      default: return 1.0;
    }
  }
}

export const pricingDataService = new PricingDataService();
```

**4.2. Update Unified Billing Service**

Update `server/services/billing/unified-billing-service.ts`:

```typescript
import { pricingDataService } from '../pricing-data-service';

export class UnifiedBillingService {
  /**
   * Track feature usage with database pricing
   */
  async trackFeatureUsage(
    userId: string,
    featureId: string,
    complexity: string,
    dataSize: number
  ) {
    // Get feature pricing from database
    const featurePricing = await pricingDataService.getFeaturePricing(featureId);

    if (!featurePricing) {
      throw new Error(`Feature pricing not found: ${featureId}`);
    }

    // Calculate actual cost based on database pricing
    const cost = pricingDataService.calculateFeaturePrice(
      featurePricing,
      complexity,
      dataSize
    );

    // Check user's subscription tier and quota
    const user = await this.getUserWithSubscription(userId);
    const tierPricing = await pricingDataService.getTierPricing(user.subscriptionTier);

    // Check if feature is available in user's tier
    const availableTiers = featurePricing.availableInTiers as string[];
    if (!availableTiers.includes(user.subscriptionTier)) {
      throw new Error(`Feature '${featureId}' not available in ${user.subscriptionTier} tier`);
    }

    // Deduct from quota or charge overage
    const usageResult = await this.deductFromQuotaOrChargeOverage(
      user,
      tierPricing,
      featureId,
      cost
    );

    // Record usage in database
    await this.recordUsageTransaction(userId, featureId, cost, usageResult);

    return {
      success: true,
      cost,
      chargedAmount: usageResult.chargedAmount,
      remainingQuota: usageResult.remainingQuota
    };
  }

  /**
   * Calculate journey cost with database pricing
   */
  async calculateJourneyCost(
    userId: string,
    journeyType: string,
    features: string[],
    dataSize: number
  ) {
    // Get user's tier
    const user = await this.getUserWithSubscription(userId);
    const tierPricing = await pricingDataService.getTierPricing(user.subscriptionTier);

    if (!tierPricing) {
      throw new Error('Tier pricing not found');
    }

    // Get journey pricing multiplier from database
    const journeyPricingConfig = tierPricing.journeyPricing as any;
    const journeyMultiplier = journeyPricingConfig[journeyType] || 1.0;

    // Calculate base cost from features
    let totalCost = 0;
    for (const featureId of features) {
      const featurePricing = await pricingDataService.getFeaturePricing(featureId);
      if (featurePricing) {
        const complexity = this.determineComplexity(dataSize);
        const featureCost = pricingDataService.calculateFeaturePrice(
          featurePricing,
          complexity,
          dataSize
        );
        totalCost += featureCost;
      }
    }

    // Apply journey multiplier
    totalCost *= journeyMultiplier;

    // Apply tier discounts
    const discounts = tierPricing.discounts as any;
    const dataProcessingDiscount = discounts.dataProcessingDiscount || 0;
    totalCost *= (1 - dataProcessingDiscount / 100);

    return {
      baseCost: totalCost / journeyMultiplier,
      journeyMultiplier,
      discount: dataProcessingDiscount,
      finalCost: Math.round(totalCost)
    };
  }
}
```

---

### Phase 5: Testing & Validation

#### Test Cases

**5.1. Service Pricing Tests**
- [ ] Admin can update pay-per-analysis price
- [ ] Price change propagates to Stripe
- [ ] Frontend displays updated price
- [ ] Payment uses correct Stripe price

**5.2. Subscription Tier Tests**
- [ ] Admin can update tier pricing
- [ ] Admin can update tier limits
- [ ] Changes sync with Stripe
- [ ] Frontend displays updated tiers
- [ ] User eligibility checks use database tiers

**5.3. Usage Billing Tests**
- [ ] Feature usage charges use database pricing
- [ ] Quota enforcement uses database limits
- [ ] Overage charges use database pricing
- [ ] Journey pricing uses database multipliers

**5.4. End-to-End Test**
- [ ] Admin updates all pricing
- [ ] All changes sync to Stripe
- [ ] User creates project
- [ ] Usage billing uses correct prices
- [ ] Invoice shows correct amounts
- [ ] Stripe webhook updates subscription status

---

## Migration Path

### Step 1: Database Setup
1. Run migration: `npm run db:push`
2. Seed service pricing: Run `seed-service-pricing.sql`
3. Seed subscription tiers: Run `seed-subscription-tiers.sql`
4. Verify data in database

### Step 2: Service Pricing (Week 1)
1. Implement Stripe sync for services
2. Test admin UI updates
3. Verify Stripe product/price creation
4. Test payment flow with new prices

### Step 3: Subscription Tiers (Week 2)
1. Update pricing API to use database
2. Create admin UI for tier management
3. Update Stripe sync service
4. Test tier updates and Stripe sync
5. Remove hardcoded tier imports (gradual)

### Step 4: Feature Pricing (Week 3)
1. Create feature pricing tables
2. Implement admin API
3. Create admin UI
4. Seed initial feature data
5. Test feature management

### Step 5: Billing Integration (Week 4)
1. Create pricing data service
2. Update unified billing service
3. Remove all hardcoded pricing
4. Test usage billing end-to-end
5. Test Stripe webhooks

### Step 6: Validation (Week 5)
1. Run comprehensive test suite
2. Verify admin UI functionality
3. Verify Stripe integration
4. Verify usage billing accuracy
5. Performance testing

---

## Success Criteria

✅ **All pricing data is in database**
- No hardcoded prices in code
- All prices admin-configurable

✅ **Stripe integration complete**
- Service pricing syncs to Stripe
- Subscription tiers sync to Stripe
- Admin changes propagate automatically

✅ **Usage billing uses database**
- Feature pricing from database
- Tier limits from database
- Overage pricing from database
- Journey multipliers from database

✅ **Admin can manage everything**
- Update service prices
- Update subscription tiers
- Update feature pricing
- Sync with Stripe
- View pricing history

✅ **Frontend reflects changes**
- Pricing page shows database prices
- Admin UI shows all pricing
- Real-time updates when prices change

---

## Files to Create/Modify

### New Files (16)
1. `migrations/seed-service-pricing.sql`
2. `migrations/seed-subscription-tiers.sql`
3. `migrations/seed-feature-pricing.sql`
4. `server/routes/admin-subscription-tiers.ts`
5. `server/routes/admin-feature-pricing.ts`
6. `server/services/pricing-data-service.ts`
7. `client/src/pages/admin/subscription-tiers.tsx`
8. `client/src/pages/admin/feature-pricing.tsx`
9. `tests/unit/pricing-data-service.test.ts`
10. `tests/integration/stripe-sync.test.ts`
11. `tests/e2e/admin-pricing-management.test.ts`
12. `scripts/migrate-tiers-to-database.ts` (migration utility)

### Modified Files (10)
1. `shared/schema.ts` - Add feature pricing tables
2. `server/routes/admin-service-pricing.ts` - Implement Stripe sync
3. `server/routes/pricing.ts` - Use database for tiers
4. `server/services/stripe-sync.ts` - Extend for services and database tiers
5. `server/services/billing/unified-billing-service.ts` - Use pricing data service
6. `client/src/pages/pricing.tsx` - Already uses database (verify)
7. `client/src/pages/admin/index.tsx` - Add new admin tabs
8. `server/routes/index.ts` - Register new admin routes
9. `package.json` - Add migration scripts
10. Remove/deprecate: `shared/unified-subscription-tiers.ts` (gradual)

---

## Estimated Timeline

- **Phase 1**: 2-3 days (Service Pricing Stripe Integration)
- **Phase 2**: 4-5 days (Subscription Tier Migration)
- **Phase 3**: 3-4 days (Feature Pricing System)
- **Phase 4**: 3-4 days (Billing Integration)
- **Phase 5**: 2-3 days (Testing & Validation)

**Total**: 14-19 days (~3-4 weeks)

---

## Risk Mitigation

### Risk 1: Breaking Existing Functionality
**Mitigation**:
- Gradual migration with feature flags
- Keep hardcoded fallbacks during transition
- Comprehensive test coverage before removal

### Risk 2: Stripe Sync Failures
**Mitigation**:
- Implement retry logic with exponential backoff
- Store sync status in database
- Admin UI shows sync status and errors
- Manual retry option for failed syncs

### Risk 3: Data Migration Errors
**Mitigation**:
- Backup database before migrations
- Test migrations on staging environment
- Rollback scripts for each migration
- Validation scripts to verify data integrity

### Risk 4: Performance Impact
**Mitigation**:
- Cache pricing data in Redis
- Database indexes on pricing tables
- Lazy loading for pricing config
- Monitor query performance

---

## Next Steps

1. **Review and approve this plan**
2. **Set up staging environment** for testing
3. **Create GitHub issues** for each phase
4. **Assign owners** to each phase
5. **Schedule sprint planning** for implementation
6. **Begin Phase 1** (Service Pricing Stripe Integration)
