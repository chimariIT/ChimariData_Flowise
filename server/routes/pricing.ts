import { Router, Request, Response } from 'express';
import { UNIFIED_SUBSCRIPTION_TIERS, getAllUnifiedTiers, type UnifiedSubscriptionTier } from '@shared/unified-subscription-tiers';
import { SUBSCRIPTION_TIERS } from '@shared/subscription-tiers';
import { getStripeSyncService } from '../services/stripe-sync';
import { resolveTierForStripeSync } from '../services/stripe-tier-sync-helper';
import { ensureAuthenticated } from './auth';
import { requirePermission } from '../middleware/rbac';
import { db } from '../db';
import { servicePricing, subscriptionTierPricing } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const router = Router();

type SubscriptionTierPricingRow = typeof subscriptionTierPricing.$inferSelect;
type ServicePricingRow = typeof servicePricing.$inferSelect;

/**
 * Get available subscription tiers - DATABASE BACKED
 * Returns tiers from database with fallback to code-based tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const billingCycle = req.query.cycle as 'monthly' | 'yearly' || 'monthly';

    // Query database for active subscription tiers
    const dbTiers: SubscriptionTierPricingRow[] = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.isActive, true));

    // If database has tiers, use them
    if (dbTiers.length > 0) {
      const tiers = dbTiers.map((tier: SubscriptionTierPricingRow) => {
        const limits = (tier.limits as Record<string, any>) || {};
        const features = (tier.features as Record<string, any>) || {};
        const journeyPricing = (tier.journeyPricing as Record<string, any>) || {};
        const overagePricing = (tier.overagePricing as Record<string, any>) || {};

        // Get pricing based on billing cycle (convert cents to dollars)
        const price = billingCycle === 'yearly'
          ? (tier.yearlyPriceUsd / 100)
          : (tier.monthlyPriceUsd / 100);

        // Build features list from database tier
        const featuresList = [
          limits.maxFiles === -1 ? 'Unlimited files per month' : limits.maxFiles ? `${limits.maxFiles} file${limits.maxFiles !== 1 ? 's' : ''} per month` : null,
          limits.maxFileSizeMB === -1 ? 'Unlimited file size' : limits.maxFileSizeMB ? `${limits.maxFileSizeMB}MB max file size` : null,
          limits.totalDataVolumeMB === -1 ? 'Unlimited data volume' : limits.totalDataVolumeMB ? `${limits.totalDataVolumeMB}MB total data volume` : null,
          limits.aiInsights === -1 ? 'Unlimited AI insights' : limits.aiInsights ? `${limits.aiInsights} AI insights per month` : null,
          limits.maxAnalysisComponents === -1 ? 'Unlimited analysis components' : limits.maxAnalysisComponents ? `${limits.maxAnalysisComponents} analysis components` : null,
          limits.maxVisualizations === -1 ? 'Unlimited visualizations' : limits.maxVisualizations ? `${limits.maxVisualizations} visualizations` : null,
          features.dataTransformation ? 'Data transformation' : null,
          features.statisticalAnalysis ? 'Statistical analysis' : null,
          features.advancedInsights ? 'Advanced insights' : null,
          features.piiDetection ? 'PII detection' : null,
        ].filter(Boolean) as string[];

        return {
          id: tier.id,
          name: tier.displayName,
          type: tier.id,
          description: tier.description || '',
          price: price,
          priceLabel: billingCycle === 'yearly' ? `$${price}/year` : `$${price}/month`,
          features: featuresList,
          limits: {
            analysesPerMonth: limits.maxAnalysisComponents || 0,
            maxDataSizeMB: limits.maxFileSizeMB || 0,
            maxRecords: (limits.totalDataVolumeMB || 0) * 1000,
            aiQueries: limits.aiInsights || 0,
            supportLevel: 'email',
            customModels: false,
            apiAccess: tier.id === 'enterprise',
            teamCollaboration: tier.id !== 'trial'
          },
          recommended: tier.id === 'professional',
          stripeProductId: tier.stripeProductId || undefined,
          stripePriceId: tier.stripeMonthlyPriceId || tier.stripeYearlyPriceId || undefined,
          journeyPricing: journeyPricing,
          monthlyPrice: tier.monthlyPriceUsd / 100,
          yearlyPrice: tier.yearlyPriceUsd / 100,
          overagePricing: overagePricing
        };
      });

      console.log(`✅ Returning ${tiers.length} tiers from database`);

      return res.json({
        success: true,
        tiers,
        billingCycle,
        source: 'database'
      });
    }

    // Fallback to code-based tiers if database is empty
    console.warn('⚠️  No tiers in database, falling back to code-based tiers');

    const tiers = getAllUnifiedTiers().map(tier => {
      const price = billingCycle === 'yearly' ? tier.yearlyPrice : tier.monthlyPrice;

      const features = [
        tier.limits.maxFiles === -1 ? 'Unlimited files per month' : `${tier.limits.maxFiles} file${tier.limits.maxFiles !== 1 ? 's' : ''} per month`,
        tier.limits.maxFileSizeMB === -1 ? 'Unlimited file size' : `${tier.limits.maxFileSizeMB}MB max file size`,
        tier.limits.totalDataVolumeMB === -1 ? 'Unlimited data volume' : `${tier.limits.totalDataVolumeMB}MB total data volume`,
        tier.limits.aiInsights === -1 ? 'Unlimited AI insights' : `${tier.limits.aiInsights} AI insights per month`,
        tier.limits.maxAnalysisComponents === -1 ? 'Unlimited analysis components' : `${tier.limits.maxAnalysisComponents} analysis components`,
        tier.limits.maxVisualizations === -1 ? 'Unlimited visualizations' : `${tier.limits.maxVisualizations} visualizations`,
        tier.limits.dataTransformation ? 'Data transformation' : null,
        tier.limits.statisticalAnalysis ? 'Statistical analysis' : null,
        tier.limits.advancedInsights ? 'Advanced insights' : null,
        tier.limits.piiDetection ? 'PII detection' : null,
        tier.limits.mlBasic ? 'Basic ML models' : null,
        tier.limits.mlAdvanced ? 'Advanced ML (AutoML, XGBoost)' : null,
        tier.limits.llmFineTuning ? 'LLM fine-tuning' : null,
        `${tier.limits.exportOptions.join(', ')} export`,
        `${tier.support.level} support`
      ].filter(Boolean) as string[];

      return {
        id: tier.id,
        name: tier.displayName,
        type: tier.id,
        description: tier.description,
        price: price,
        priceLabel: billingCycle === 'yearly' ? `$${price}/year` : `$${price}/month`,
        features,
        limits: {
          analysesPerMonth: tier.limits.maxAnalysisComponents,
          maxDataSizeMB: tier.limits.maxFileSizeMB,
          maxRecords: tier.limits.totalDataVolumeMB * 1000,
          aiQueries: tier.limits.aiInsights,
          supportLevel: tier.support.level,
          customModels: tier.limits.customMLModels,
          apiAccess: tier.id === 'enterprise',
          teamCollaboration: tier.id !== 'trial'
        },
        recommended: tier.id === 'professional',
        stripeProductId: tier.stripeProductId,
        stripePriceId: tier.stripePriceId,
        journeyPricing: tier.journeyPricing,
        monthlyPrice: tier.monthlyPrice,
        yearlyPrice: tier.yearlyPrice,
        overagePricing: tier.overagePricing
      };
    });

    res.json({
      success: true,
      tiers,
      billingCycle,
      source: 'fallback'
    });
  } catch (error: any) {
    console.error('Error getting pricing tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing tiers',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update a subscription tier (Admin only)
 * Syncs changes with Stripe automatically
 */
router.put('/tiers/:tierId', ensureAuthenticated, requirePermission('subscriptions', 'manage'), async (req: Request, res: Response) => {
  try {
    const { tierId } = req.params;
    const { price, description, features, limits, overagePricing, discounts } = req.body;

    // Verify tier exists in unified tiers
    if (!UNIFIED_SUBSCRIPTION_TIERS[tierId]) {
      return res.status(404).json({
        success: false,
        error: `Subscription tier '${tierId}' not found`
      });
    }
    
    const tier = UNIFIED_SUBSCRIPTION_TIERS[tierId];

    // Admin authentication enforced by middleware

    // Build updated tier object from unified tier
    const updatedTier = {
      ...tier,
      monthlyPrice: price?.monthly !== undefined ? price.monthly : tier.monthlyPrice,
      yearlyPrice: price?.yearly !== undefined ? price.yearly : tier.yearlyPrice,
      description: description !== undefined ? description : tier.description,
    };

    // Update limits if provided
    if (limits) {
      updatedTier.limits = {
        ...tier.limits,
        maxFiles: limits.maxFiles !== undefined ? limits.maxFiles : tier.limits.maxFiles,
        maxFileSizeMB: limits.maxFileSizeMB !== undefined ? limits.maxFileSizeMB : tier.limits.maxFileSizeMB,
        totalDataVolumeMB: limits.totalDataVolumeMB !== undefined ? limits.totalDataVolumeMB : tier.limits.totalDataVolumeMB,
        aiInsights: limits.aiInsights !== undefined ? limits.aiInsights : tier.limits.aiInsights,
        maxAnalysisComponents: limits.maxAnalysisComponents !== undefined ? limits.maxAnalysisComponents : tier.limits.maxAnalysisComponents,
        maxVisualizations: limits.maxVisualizations !== undefined ? limits.maxVisualizations : tier.limits.maxVisualizations,
        // Update other limits if provided
        ...(limits.dataTransformation !== undefined && { dataTransformation: limits.dataTransformation }),
        ...(limits.statisticalAnalysis !== undefined && { statisticalAnalysis: limits.statisticalAnalysis }),
        ...(limits.advancedInsights !== undefined && { advancedInsights: limits.advancedInsights }),
        ...(limits.piiDetection !== undefined && { piiDetection: limits.piiDetection }),
      };
    }
    
    // Update overage pricing if provided
    if (overagePricing) {
      updatedTier.overagePricing = {
        ...tier.overagePricing,
        ...overagePricing
      };
    }
    
    // Update discounts if provided
    if (discounts) {
      updatedTier.discounts = {
        ...tier.discounts,
        ...discounts
      };
    }

    // Sync with Stripe if configured
    const stripeSyncService = getStripeSyncService();
    if (stripeSyncService.isStripeConfigured()) {
      // TODO: Implement Stripe sync for unified tiers
      // This would need to sync with Stripe products/prices
      console.log(`📋 Stripe sync for unified tier ${tierId} - TODO: implement Stripe integration`);
    } else {
      console.warn('⚠️  Stripe not configured - skipping sync');
    }

    // Note: We don't update the hardcoded tier definitions in shared/unified-subscription-tiers.ts
    // Admin updates to pricing should be made through Stripe directly
    // This endpoint is here for feature/limit updates

    // Write to file for persistence
    const sharedDir = path.join(__dirname, '../../shared');
    const tierFilePath = path.join(sharedDir, 'subscription-tiers.ts');

    try {
      const fileContent = `export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  description: string;
  features: {
    maxFiles: number;
    maxFileSizeMB: number;
    totalDataVolumeMB: number;
    aiInsights: number;
    maxAnalysisComponents: number;
    maxVisualizations: number;
    dataTransformation: boolean;
    statisticalAnalysis: boolean;
    advancedInsights: boolean;
    piiDetection: boolean;
    exportOptions: string[];
    support: string;
  };
  stripeProductId?: string;
  stripePriceId?: string;
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = ${JSON.stringify(SUBSCRIPTION_TIERS, null, 2)};

// Union type of supported subscription tier IDs plus 'none' for pay-per-use users
export type SubscriptionTierId = keyof typeof SUBSCRIPTION_TIERS | 'none';

export function getTierLimits(tier: string) {
  return SUBSCRIPTION_TIERS[tier]?.features || SUBSCRIPTION_TIERS.trial.features;
}

export function canUserUpload(userTier: string, currentUploads: number, fileSizeMB: number, currentDataVolumeMB: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getTierLimits(userTier);

  if (limits.maxFiles !== -1 && currentUploads >= limits.maxFiles) {
    return {
      allowed: false,
      reason: \`Upload limit reached. Your \${userTier} plan allows \${limits.maxFiles} file(s) per month.\`
    };
  }

  if (limits.maxFileSizeMB !== -1 && fileSizeMB > limits.maxFileSizeMB) {
    return {
      allowed: false,
      reason: \`File too large. Your \${userTier} plan allows files up to \${limits.maxFileSizeMB}MB.\`
    };
  }

  if (limits.totalDataVolumeMB !== -1 && (currentDataVolumeMB + fileSizeMB) > limits.totalDataVolumeMB) {
    return {
      allowed: false,
      reason: \`Data volume limit exceeded. Your \${userTier} plan allows \${limits.totalDataVolumeMB}MB total per month.\`
    };
  }

  return { allowed: true };
}

export function canUserRequestAIInsight(userTier: string, currentInsights: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getTierLimits(userTier);

  if (limits.aiInsights !== -1 && currentInsights >= limits.aiInsights) {
    return {
      allowed: false,
      reason: \`AI insight limit reached. Your \${userTier} plan allows \${limits.aiInsights} insight(s) per month.\`
    };
  }

  return { allowed: true };
}
`;

      fs.writeFileSync(tierFilePath, fileContent, 'utf8');
      console.log(`✅ Successfully updated subscription tier '${tierId}' and persisted to file`);
    } catch (fileError) {
      console.error('Error persisting tier changes to file:', fileError);
      // Continue even if file write fails - the in-memory update still succeeded
    }

    res.json({
      success: true,
      message: `Subscription tier '${tierId}' configuration updated (runtime only)`,
      tier: updatedTier,
      note: 'To make permanent pricing changes, update them in Stripe or modify shared/unified-subscription-tiers.ts'
    });

  } catch (error: any) {
    console.error('Error updating pricing tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing tier'
    });
  }
});

router.post(
  '/tiers/:tierId/sync-stripe',
  ensureAuthenticated,
  requirePermission('billing', 'manage'),
  async (req: Request, res: Response) => {
    try {
      const { tierId } = req.params;
      const stripeSyncService = getStripeSyncService();

      if (!stripeSyncService.isStripeConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'Stripe not configured. Set STRIPE_SECRET_KEY to enable syncing.',
          code: 'STRIPE_NOT_CONFIGURED',
        });
      }

      const { source, record } = await resolveTierForStripeSync(tierId);

      const tierLimits = record && typeof record.limits === 'object' ? record.limits : {};
      const tierFeatures = record && typeof record.features === 'object' ? record.features : tierLimits;

      const tierData = {
        displayName: record.displayName || record.name || tierId,
        description: record.description || '',
        monthlyPriceUsd: record.monthlyPriceUsd,
        yearlyPriceUsd: record.yearlyPriceUsd,
        stripeProductId: record.stripeProductId ?? undefined,
        stripeMonthlyPriceId: record.stripeMonthlyPriceId ?? undefined,
        stripeYearlyPriceId: record.stripeYearlyPriceId ?? undefined,
        limits: tierLimits,
        features: tierFeatures,
      };

      const syncResult = await stripeSyncService.syncTierWithStripe(tierId, tierData);

      if (!syncResult.success) {
        return res.status(502).json({
          success: false,
          error: syncResult.error || 'Failed to sync Stripe pricing',
          stripeSync: syncResult,
        });
      }

      res.json({
        success: true,
        message: `Tier '${tierId}' synced with Stripe`,
        tierSource: source,
        stripeSync: syncResult,
      });
    } catch (error: any) {
      console.error('Error syncing tier with Stripe:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to sync tier with Stripe',
        details: error?.message || 'Unknown error',
      });
    }
  }
);

/**
 * Create a Stripe subscription for a user
 * POST /api/pricing/subscription
 */
router.post('/subscription', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { planType } = req.body;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    if (!planType || !UNIFIED_SUBSCRIPTION_TIERS[planType]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan type'
      });
    }

    const tier = UNIFIED_SUBSCRIPTION_TIERS[planType];
    const stripeSyncService = getStripeSyncService();

    // Check if Stripe is configured
    if (!stripeSyncService.isStripeConfigured()) {
      // Return mock client secret for development/testing
      const mockClientSecret = `pi_mock_${Date.now()}_secret_${Math.random().toString(36).slice(2)}`;
      console.warn('⚠️  Stripe not configured - returning mock payment intent');
      return res.json({
        success: true,
        clientSecret: mockClientSecret,
        message: 'Stripe not configured - using mock payment for development',
        development: true
      });
    }

    // Ensure tier is synced with Stripe
    const tierSyncPayload: Parameters<typeof stripeSyncService.syncTierWithStripe>[1] = {
      displayName: tier.displayName,
      description: tier.description,
      monthlyPriceUsd: Math.round(tier.monthlyPrice * 100),
      yearlyPriceUsd: Math.round(tier.yearlyPrice * 100),
      stripeProductId: tier.stripeProductId ?? null,
      stripeMonthlyPriceId: tier.stripePriceId ?? null,
      stripeYearlyPriceId: tier.stripePriceId ?? null,
      limits: tier.limits,
  features: tier.limits,
    };

    const syncResult = await stripeSyncService.syncTierWithStripe(planType, tierSyncPayload);

    const priceId = syncResult.stripeMonthlyPriceId ?? syncResult.stripeYearlyPriceId;

    if (!syncResult.success || !priceId) {
      return res.status(500).json({
        success: false,
        error: `Failed to sync subscription tier with Stripe: ${syncResult.error}`
      });
    }

    // Import Stripe and create real PaymentIntent
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-08-27.basil',
    });

    // Create or get Stripe customer for this user
    const { db } = require('../db');
    const { users } = require('@shared/schema');
    const { eq } = require('drizzle-orm');

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    let stripeCustomerId = user.stripeCustomerId;

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
        metadata: {
          userId: userId
        }
      });

      stripeCustomerId = customer.id;

      // Update user with Stripe customer ID
      await db.update(users)
        .set({ stripeCustomerId: customer.id })
        .where(eq(users.id, userId));

      console.log(`✅ Created Stripe customer: ${customer.id} for user: ${userId}`);
    }

    // Create PaymentIntent for subscription payment
    const paymentIntent = await stripe.paymentIntents.create({
      amount: tier.monthlyPrice * 100, // Convert to cents
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: {
        userId: userId,
        planType: planType,
        priceId,
        productId: syncResult.stripeProductId || ''
      },
      setup_future_usage: 'off_session', // Save payment method for future charges
      description: `Subscription: ${tier.displayName} - $${tier.monthlyPrice}/month`
    });

    console.log(`✅ Created PaymentIntent: ${paymentIntent.id} for ${tier.name} subscription`);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
  priceId,
      productId: syncResult.stripeProductId,
      paymentIntentId: paymentIntent.id
    });

  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create subscription',
      details: error.message
    });
  }
});

/**
 * Cancel a user's subscription
 * POST /api/pricing/subscription/cancel
 */
router.post('/subscription/cancel', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stripeSyncService = getStripeSyncService();

    // Check if Stripe is configured
    if (!stripeSyncService.isStripeConfigured()) {
      console.warn('⚠️  Stripe not configured - simulating cancellation');

      // Update user subscription status in database
      const { db } = require('../db');
      const { users } = require('@shared/schema');
      const { eq } = require('drizzle-orm');

      await db.update(users)
        .set({
          subscriptionTier: 'none',
          subscriptionStatus: 'cancelled',
          subscriptionExpiresAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      return res.json({
        success: true,
        message: 'Subscription cancelled (development mode)',
        development: true
      });
    }

    // Get user's Stripe subscription
    const { db } = require('../db');
    const { users } = require('@shared/schema');
    const { eq } = require('drizzle-orm');

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    // Import Stripe and cancel subscription
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
    });

    // Cancel the subscription at period end
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        cancel_at_period_end: true
      }
    );

    console.log(`✅ Scheduled subscription cancellation: ${subscription.id} for user: ${userId}`);

    // Update user subscription status
    await db.update(users)
      .set({
        subscriptionStatus: 'active', // Still active until period end
        subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the current billing period',
      cancelAt: new Date(subscription.current_period_end * 1000),
      subscriptionId: subscription.id
    });

  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      details: error.message
    });
  }
});

/**
 * Reactivate a cancelled subscription
 * POST /api/pricing/subscription/reactivate
 */
router.post('/subscription/reactivate', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    const stripeSyncService = getStripeSyncService();

    // Get user's Stripe subscription
    const { db } = require('../db');
    const { users } = require('@shared/schema');
    const { eq } = require('drizzle-orm');

    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!stripeSyncService.isStripeConfigured()) {
      console.warn('⚠️  Stripe not configured - simulating reactivation');

      await db.update(users)
        .set({
          subscriptionStatus: 'active',
          updatedAt: new Date()
        })
        .where(eq(users.id, userId));

      return res.json({
        success: true,
        message: 'Subscription reactivated (development mode)',
        development: true
      });
    }

    if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'No subscription found to reactivate'
      });
    }

    // Import Stripe and reactivate subscription
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
    });

    // Remove cancellation
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        cancel_at_period_end: false
      }
    );

    console.log(`✅ Reactivated subscription: ${subscription.id} for user: ${userId}`);

    // Update user subscription status
    await db.update(users)
      .set({
        subscriptionStatus: 'active',
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
      subscriptionId: subscription.id
    });

  } catch (error: any) {
    console.error('Error reactivating subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reactivate subscription',
      details: error.message
    });
  }
});

/**
 * GET /api/pricing/services
 * Get active service pricing for one-time services from database
 */
router.get('/services', async (req: Request, res: Response) => {
  try {
    // Query database for active service pricing
    const services = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.isActive, true));

    // If no services in database, return defaults
    if (services.length === 0) {
      const defaultServices = [
        {
          id: 'pay-per-analysis',
          serviceType: 'pay-per-analysis',
          displayName: 'Pay-per-Analysis',
          description: 'Perfect for one-time insights without monthly commitment',
          basePrice: 2500, // $25 in cents
          pricingModel: 'fixed',
          isActive: true
        },
        {
          id: 'expert-consultation',
          serviceType: 'expert-consultation',
          displayName: 'Expert Consultation',
          description: '1-hour session with our data science experts',
          basePrice: 15000, // $150 in cents
          pricingModel: 'fixed',
          isActive: true
        }
      ];

      return res.json({
        success: true,
        services: defaultServices,
        note: 'Using default pricing - no services configured in database'
      });
    }

    res.json({
      success: true,
      services
    });
  } catch (error: any) {
    console.error('Error getting service pricing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service pricing',
      details: error.message
    });
  }
});

/**
 * GET /api/pricing/subscription-tiers
 * Get subscription tier pricing from database
 */
router.get('/subscription-tiers', async (req: Request, res: Response) => {
  try {
    const billingCycle = req.query.cycle as 'monthly' | 'yearly' || 'monthly';
    
    // Query database for active subscription tiers
    const tiers = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.isActive, true));

    // If no tiers in database, fall back to code-based tiers
    if (tiers.length === 0) {
      const fallbackTiers = getAllUnifiedTiers().map(tier => ({
        id: tier.id,
        name: tier.displayName,
        type: tier.id,
        description: tier.description,
        price: billingCycle === 'yearly' ? tier.yearlyPrice : tier.monthlyPrice,
        priceLabel: billingCycle === 'yearly' ? `$${tier.yearlyPrice}/year` : `$${tier.monthlyPrice}/month`,
        features: [
          tier.limits.maxFiles === -1 ? 'Unlimited files per month' : `${tier.limits.maxFiles} files per month`,
          tier.limits.maxFileSizeMB === -1 ? 'Unlimited file size' : `${tier.limits.maxFileSizeMB}MB max file size`,
          `${tier.support.level} support`
        ],
        limits: {
          analysesPerMonth: tier.limits.maxAnalysisComponents,
          maxDataSizeMB: tier.limits.maxFileSizeMB,
          maxRecords: tier.limits.totalDataVolumeMB * 1000,
          aiQueries: tier.limits.aiInsights,
          supportLevel: tier.support.level
        },
        recommended: tier.id === 'professional',
        monthlyPrice: tier.monthlyPrice,
        yearlyPrice: tier.yearlyPrice
      }));

      return res.json({
        success: true,
        tiers: fallbackTiers,
        billingCycle,
        note: 'Using default pricing from code - no tiers configured in database'
      });
    }

    // Convert database tiers to API format
    const formattedTiers = tiers.map((tier: SubscriptionTierPricingRow) => {
      const limits = (tier.limits as Partial<UnifiedSubscriptionTier['limits']>) || {};
      const maxFiles = typeof limits.maxFiles === 'number' ? limits.maxFiles : undefined;

      return {
        id: tier.id,
        name: tier.displayName,
        type: tier.id,
        description: tier.description,
        price: billingCycle === 'yearly' ? (tier.yearlyPriceUsd / 100) : (tier.monthlyPriceUsd / 100),
        priceLabel: billingCycle === 'yearly' ? `$${tier.yearlyPriceUsd / 100}/year` : `$${tier.monthlyPriceUsd / 100}/month`,
        features: maxFiles !== undefined ? [`${maxFiles} files per month`] : [],
        limits,
        recommended: tier.id === 'professional',
        monthlyPrice: tier.monthlyPriceUsd / 100,
        yearlyPrice: tier.yearlyPriceUsd / 100,
        stripeProductId: tier.stripeProductId,
        stripeMonthlyPriceId: tier.stripeMonthlyPriceId,
        stripeYearlyPriceId: tier.stripeYearlyPriceId
      };
    });

    res.json({
      success: true,
      tiers: formattedTiers,
      billingCycle
    });
  } catch (error: any) {
    console.error('Error getting subscription tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription tiers',
      details: error.message
    });
  }
});

export default router;















