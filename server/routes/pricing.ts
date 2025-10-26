import { Router, Request, Response } from 'express';
import { SUBSCRIPTION_TIERS } from '@shared/subscription-tiers';
import { getStripeSyncService } from '../services/stripe-sync';
import { ensureAuthenticated } from './auth';
import { requirePermission } from '../middleware/rbac';
import fs from 'fs';
import path from 'path';

const router = Router();

/**
 * Get available subscription tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const tiers = Object.values(SUBSCRIPTION_TIERS).map(tier => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      description: tier.description,
      features: [
        `${tier.features.maxFiles} file${tier.features.maxFiles > 1 ? 's' : ''} per month`,
        `${tier.features.maxFileSizeMB}MB max file size`,
        `${tier.features.totalDataVolumeMB}MB total data volume`,
        `${tier.features.aiInsights === -1 ? 'Unlimited' : tier.features.aiInsights} AI insights`,
        `${tier.features.maxAnalysisComponents === -1 ? 'Unlimited' : tier.features.maxAnalysisComponents} analysis components`,
        `${tier.features.maxVisualizations === -1 ? 'Unlimited' : tier.features.maxVisualizations} visualizations`,
        tier.features.dataTransformation ? 'Data transformation' : null,
        tier.features.statisticalAnalysis ? 'Statistical analysis' : null,
        tier.features.advancedInsights ? 'Advanced insights' : null,
        tier.features.piiDetection ? 'PII detection' : null,
        `${tier.features.exportOptions.join(', ')} export`,
        `${tier.features.support} support`
      ].filter(Boolean),
      limits: {
        analysesPerMonth: tier.features.maxAnalysisComponents,
        maxDataSizeMB: tier.features.maxFileSizeMB,
        maxRecords: tier.features.totalDataVolumeMB * 1000, // Rough estimate
        aiQueries: tier.features.aiInsights,
        supportLevel: tier.features.support,
        customModels: tier.features.advancedInsights,
        apiAccess: tier.id === 'enterprise',
        teamCollaboration: tier.id !== 'trial'
      },
      recommended: tier.id === 'professional',
      stripeProductId: tier.stripeProductId,
      stripePriceId: tier.stripePriceId
    }));

    res.json({
      success: true,
      tiers
    });
  } catch (error: any) {
    console.error('Error getting pricing tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing tiers'
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

    // Verify tier exists
    if (!SUBSCRIPTION_TIERS[tierId]) {
      return res.status(404).json({
        success: false,
        error: `Subscription tier '${tierId}' not found`
      });
    }

    // Admin authentication enforced by middleware

    // Build updated tier object
    const updatedTier = {
      ...SUBSCRIPTION_TIERS[tierId],
      price: price !== undefined ? price : SUBSCRIPTION_TIERS[tierId].price,
      description: description !== undefined ? description : SUBSCRIPTION_TIERS[tierId].description,
    };

    // Update features if provided
    if (features) {
      updatedTier.features = {
        ...SUBSCRIPTION_TIERS[tierId].features,
        maxFiles: limits?.maxFiles !== undefined ? limits.maxFiles : SUBSCRIPTION_TIERS[tierId].features.maxFiles,
        maxFileSizeMB: limits?.maxFilesSizeMB !== undefined ? limits.maxFilesSizeMB : SUBSCRIPTION_TIERS[tierId].features.maxFileSizeMB,
        totalDataVolumeMB: limits?.maxDataProcessingMB !== undefined ? limits.maxDataProcessingMB : SUBSCRIPTION_TIERS[tierId].features.totalDataVolumeMB,
        aiInsights: limits?.maxAgentInteractions !== undefined ? Math.floor(limits.maxAgentInteractions / 10) : SUBSCRIPTION_TIERS[tierId].features.aiInsights,
        maxAnalysisComponents: limits?.maxToolExecutions !== undefined ? Math.floor(limits.maxToolExecutions / 2) : SUBSCRIPTION_TIERS[tierId].features.maxAnalysisComponents,
        maxVisualizations: SUBSCRIPTION_TIERS[tierId].features.maxVisualizations,
        dataTransformation: SUBSCRIPTION_TIERS[tierId].features.dataTransformation,
        statisticalAnalysis: SUBSCRIPTION_TIERS[tierId].features.statisticalAnalysis,
        advancedInsights: SUBSCRIPTION_TIERS[tierId].features.advancedInsights,
        piiDetection: SUBSCRIPTION_TIERS[tierId].features.piiDetection,
        exportOptions: SUBSCRIPTION_TIERS[tierId].features.exportOptions,
        support: SUBSCRIPTION_TIERS[tierId].features.support
      };
    }

    // Sync with Stripe before updating local data
    const stripeSyncService = getStripeSyncService();
    const stripeSyncResult = await stripeSyncService.syncTierWithStripe(tierId, updatedTier as any);

    // Update Stripe IDs if sync was successful
    if (stripeSyncResult.success && stripeSyncResult.stripeProductId && stripeSyncResult.stripePriceId) {
      updatedTier.stripeProductId = stripeSyncResult.stripeProductId;
      updatedTier.stripePriceId = stripeSyncResult.stripePriceId;
      console.log(`✅ Synced tier ${tierId} with Stripe: Product ${stripeSyncResult.stripeProductId}, Price ${stripeSyncResult.stripePriceId}`);
    } else {
      console.warn(`⚠️  Stripe sync failed for tier ${tierId}: ${stripeSyncResult.error}`);
      // Continue with local update even if Stripe sync fails
    }

    // Update the in-memory tier data
    SUBSCRIPTION_TIERS[tierId] = updatedTier as any;

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
      message: `Subscription tier '${tierId}' updated successfully`,
      tier: updatedTier,
      stripeSync: {
        synced: stripeSyncResult.success,
        productId: stripeSyncResult.stripeProductId,
        priceId: stripeSyncResult.stripePriceId,
        error: stripeSyncResult.error
      }
    });

  } catch (error: any) {
    console.error('Error updating pricing tier:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing tier'
    });
  }
});

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

    if (!planType || !SUBSCRIPTION_TIERS[planType]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan type'
      });
    }

    const tier = SUBSCRIPTION_TIERS[planType];
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
    const syncResult = await stripeSyncService.syncTierWithStripe(planType, tier);

    if (!syncResult.success || !syncResult.stripePriceId) {
      return res.status(500).json({
        success: false,
        error: `Failed to sync subscription tier with Stripe: ${syncResult.error}`
      });
    }

    // Import Stripe and create real PaymentIntent
    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
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
      amount: tier.price * 100, // Convert to cents
      currency: 'usd',
      customer: stripeCustomerId,
      metadata: {
        userId: userId,
        planType: planType,
        priceId: syncResult.stripePriceId,
        productId: syncResult.stripeProductId || ''
      },
      setup_future_usage: 'off_session', // Save payment method for future charges
      description: `Subscription: ${tier.name} - $${tier.price}/month`
    });

    console.log(`✅ Created PaymentIntent: ${paymentIntent.id} for ${tier.name} subscription`);

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      priceId: syncResult.stripePriceId,
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
      apiVersion: '2024-12-18.acacia',
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
      apiVersion: '2024-12-18.acacia',
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

export default router;















