/**
 * Unified Billing Service
 *
 * Consolidates:
 * - enhanced-billing-service.ts (campaigns, consumption rates)
 * - enhanced-subscription-billing.ts (usage metrics, quota tracking)
 * - pricing.ts (feature-based pricing)
 *
 * Features:
 * - Admin-configurable subscription tiers, features, and pricing
 * - Stripe integration with webhook signature verification
 * - Transaction-safe database operations
 * - Journey-based and feature-based billing
 * - Usage tracking with quota management
 * - Overage calculation and billing
 */

import Stripe from 'stripe';
import { db } from '../../db';
import { users } from '../../../shared/schema';
import { PricingService } from '../pricing';
import { mlLLMUsageTracker } from '../ml-llm-usage-tracker';
import { eq, sql } from 'drizzle-orm';
import {
  SubscriptionTier,
  SubscriptionTierEnum,
  SubscriptionStatus,
  FeatureComplexity,
  JourneyType,
  UserRole,
} from '../../../shared/canonical-types';
import * as crypto from 'crypto';

// ==========================================
// CONFIGURATION INTERFACES
// ==========================================

/**
 * Admin-configurable subscription tier definition
 * Stored in database and configurable via admin API
 */
export interface AdminSubscriptionTierConfig {
  tier: SubscriptionTier;
  displayName: string;
  description: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: string;
  };
  stripeProductId: string;
  stripePriceIds: {
    monthly: string;
    yearly: string;
  };
  quotas: {
    // Data quotas
    maxDataUploadsMB: number;
    maxStorageMB: number;
    maxDataProcessingMB: number;

    // Compute quotas
    maxAIQueries: number;
    maxAnalysisComponents: number;
    maxVisualizationsPerProject: number;
    maxComputeMinutes: number;

    // Project quotas
    maxProjects: number;
    maxDatasetsPerProject: number;

    // Journey quotas
    allowedJourneys: JourneyType[];

    // Feature-based quotas (by complexity)
    featureQuotas: {
      [featureId: string]: {
        small?: number;
        medium?: number;
        large?: number;
        extra_large?: number;
      };
    };
  };
  overagePricing: {
    dataPerMB: number;
    computePerMinute: number;
    storagePerMB: number;
    aiQueryCost: number;
    visualizationCost: number;

    // Feature-based overage pricing
    featureOveragePricing: {
      [featureId: string]: {
        small: number;
        medium: number;
        large: number;
        extra_large: number;
      };
    };
  };
  features: string[]; // Feature flags enabled for this tier
  isActive: boolean;
}

/**
 * Admin-configurable feature definition
 * Each feature has complexity-based pricing
 */
export interface AdminFeatureConfig {
  id: string; // e.g., "data_upload", "statistical_analysis", "ml_training"
  name: string;
  description: string;
  category: 'data' | 'analysis' | 'visualization' | 'ai' | 'export';
  basePrice: {
    small: number;
    medium: number;
    large: number;
    extra_large: number;
  };
  // Tier-specific discounts (percentage off base price)
  tierDiscounts: {
    [tier in SubscriptionTier]?: number; // e.g., professional: 20 (20% off)
  };
  isActive: boolean;
}

/**
 * Campaign/promotion configuration
 */
export interface AdminCampaignConfig {
  id: string;
  name: string;
  type: 'percentage_discount' | 'fixed_discount' | 'trial_extension' | 'quota_boost';
  value: number; // Percentage or fixed amount
  targetTiers?: SubscriptionTier[];
  targetRoles?: UserRole[];
  validFrom: Date;
  validTo: Date;
  maxUses?: number;
  currentUses: number;
  couponCode?: string;
  isActive: boolean;
}

// ==========================================
// USAGE TRACKING INTERFACES
// ==========================================

export interface UsageMetrics {
  userId: string;
  billingPeriod: {
    start: Date;
    end: Date;
  };
  dataUsage: {
    uploadsCount: number;
    totalUploadSizeMB: number;
    processedDataMB: number;
    storageUsedMB: number;
  };
  computeUsage: {
    aiQueries: number;
    analysisComponents: number;
    visualizations: number;
    computeMinutes: number;
  };
  featureUsage: {
    [featureId: string]: {
      small: number;
      medium: number;
      large: number;
      extra_large: number;
    };
  };
  costBreakdown: {
    baseSubscription: number;
    overageCosts: number;
    featureCosts: number;
    campaignDiscounts: number;
    totalCost: number;
  };
}

export interface QuotaStatus {
  quota: number;
  used: number;
  remaining: number;
  percentUsed: number;
  isExceeded: boolean;
}

// ==========================================
// UNIFIED BILLING SERVICE
// ==========================================

export class UnifiedBillingService {
  private stripe: Stripe;
  private webhookSecret: string;

  // In-memory cache for admin configurations (refreshed periodically)
  private tierConfigs: Map<SubscriptionTier, AdminSubscriptionTierConfig> = new Map();
  private featureConfigs: Map<string, AdminFeatureConfig> = new Map();
  private activeCampaigns: AdminCampaignConfig[] = [];

  constructor(config: {
    stripeSecretKey: string;
    webhookSecret: string;
  }) {
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2025-08-27.basil',
    });
    this.webhookSecret = config.webhookSecret;

    // Load configurations on initialization
    this.loadConfigurations();
  }

  // ==========================================
  // CONFIGURATION MANAGEMENT
  // ==========================================

  /**
   * Load admin configurations from database/storage
   * Called on initialization and periodically
   */
  private async loadConfigurations(): Promise<void> {
    // TODO: Implement loading from database tables:
    // - subscription_tier_configs
    // - feature_configs
    // - campaigns
    //
    // For now, use default configurations
    this.setDefaultConfigurations();
  }

  /**
   * Set default configurations (fallback)
   */
  private setDefaultConfigurations(): void {
    // Default tier configurations based on canonical types
    const defaultTiers: AdminSubscriptionTierConfig[] = [
      {
        tier: 'trial',
        displayName: 'Free Trial',
        description: '14-day trial with AI-guided journey',
        pricing: { monthly: 0, yearly: 0, currency: 'USD' },
        stripeProductId: 'prod_trial',
        stripePriceIds: { monthly: 'price_trial', yearly: 'price_trial' },
        quotas: {
          maxDataUploadsMB: 10,
          maxStorageMB: 50,
          maxDataProcessingMB: 20,
          maxAIQueries: 10,
          maxAnalysisComponents: 3,
          maxVisualizationsPerProject: 3,
          maxComputeMinutes: 30,
          maxProjects: 1,
          maxDatasetsPerProject: 1,
          allowedJourneys: ['ai_guided'],
          featureQuotas: {
            data_upload: { small: 5, medium: 0, large: 0, extra_large: 0 },
            statistical_analysis: { small: 3, medium: 0, large: 0, extra_large: 0 },
            visualization: { small: 5, medium: 0, large: 0, extra_large: 0 },
          },
        },
        overagePricing: {
          dataPerMB: 0.10,
          computePerMinute: 0.50,
          storagePerMB: 0.02,
          aiQueryCost: 0.50,
          visualizationCost: 1.00,
          featureOveragePricing: {
            data_upload: { small: 0.50, medium: 2.00, large: 5.00, extra_large: 20.00 },
            statistical_analysis: { small: 1.00, medium: 5.00, large: 15.00, extra_large: 50.00 },
          },
        },
        features: ['ai_guided_journey', 'basic_analysis'],
        isActive: true,
      },
      {
        tier: 'starter',
        displayName: 'Starter',
        description: 'For individuals and small teams',
        pricing: { monthly: 29, yearly: 290, currency: 'USD' },
        stripeProductId: 'prod_starter',
        stripePriceIds: { monthly: 'price_starter_monthly', yearly: 'price_starter_yearly' },
        quotas: {
          maxDataUploadsMB: 100,
          maxStorageMB: 500,
          maxDataProcessingMB: 200,
          maxAIQueries: 100,
          maxAnalysisComponents: 10,
          maxVisualizationsPerProject: 10,
          maxComputeMinutes: 300,
          maxProjects: 5,
          maxDatasetsPerProject: 3,
          allowedJourneys: ['ai_guided', 'template_based'],
          featureQuotas: {
            data_upload: { small: 50, medium: 10, large: 0, extra_large: 0 },
            statistical_analysis: { small: 30, medium: 5, large: 0, extra_large: 0 },
            visualization: { small: 50, medium: 10, large: 0, extra_large: 0 },
          },
        },
        overagePricing: {
          dataPerMB: 0.08,
          computePerMinute: 0.40,
          storagePerMB: 0.015,
          aiQueryCost: 0.30,
          visualizationCost: 0.80,
          featureOveragePricing: {
            data_upload: { small: 0.40, medium: 1.50, large: 4.00, extra_large: 15.00 },
            statistical_analysis: { small: 0.80, medium: 4.00, large: 12.00, extra_large: 40.00 },
          },
        },
        features: ['ai_guided_journey', 'template_based_journey', 'advanced_analysis', 'data_export'],
        isActive: true,
      },
      {
        tier: 'professional',
        displayName: 'Professional',
        description: 'For power users and growing teams',
        pricing: { monthly: 99, yearly: 990, currency: 'USD' },
        stripeProductId: 'prod_professional',
        stripePriceIds: { monthly: 'price_pro_monthly', yearly: 'price_pro_yearly' },
        quotas: {
          maxDataUploadsMB: 1000,
          maxStorageMB: 5000,
          maxDataProcessingMB: 2000,
          maxAIQueries: 1000,
          maxAnalysisComponents: 50,
          maxVisualizationsPerProject: 50,
          maxComputeMinutes: 3000,
          maxProjects: 25,
          maxDatasetsPerProject: 10,
          allowedJourneys: ['ai_guided', 'template_based', 'self_service'],
          featureQuotas: {
            data_upload: { small: 500, medium: 100, large: 10, extra_large: 0 },
            statistical_analysis: { small: 300, medium: 50, large: 10, extra_large: 0 },
            visualization: { small: 500, medium: 100, large: 10, extra_large: 0 },
            machine_learning: { small: 50, medium: 10, large: 2, extra_large: 0 },
          },
        },
        overagePricing: {
          dataPerMB: 0.05,
          computePerMinute: 0.30,
          storagePerMB: 0.01,
          aiQueryCost: 0.20,
          visualizationCost: 0.50,
          featureOveragePricing: {
            data_upload: { small: 0.30, medium: 1.00, large: 3.00, extra_large: 10.00 },
            statistical_analysis: { small: 0.50, medium: 2.50, large: 8.00, extra_large: 25.00 },
            machine_learning: { small: 2.00, medium: 10.00, large: 30.00, extra_large: 100.00 },
          },
        },
        features: [
          'ai_guided_journey',
          'template_based_journey',
          'self_service_journey',
          'advanced_analysis',
          'ml_models',
          'code_generation',
          'priority_support',
        ],
        isActive: true,
      },
      {
        tier: 'enterprise',
        displayName: 'Enterprise',
        description: 'Custom solutions for large organizations',
        pricing: { monthly: 499, yearly: 4990, currency: 'USD' },
        stripeProductId: 'prod_enterprise',
        stripePriceIds: { monthly: 'price_ent_monthly', yearly: 'price_ent_yearly' },
        quotas: {
          maxDataUploadsMB: -1, // Unlimited
          maxStorageMB: -1,
          maxDataProcessingMB: -1,
          maxAIQueries: -1,
          maxAnalysisComponents: -1,
          maxVisualizationsPerProject: -1,
          maxComputeMinutes: -1,
          maxProjects: -1,
          maxDatasetsPerProject: -1,
          allowedJourneys: ['ai_guided', 'template_based', 'self_service', 'consultation'],
          featureQuotas: {
            data_upload: { small: -1, medium: -1, large: -1, extra_large: -1 },
            statistical_analysis: { small: -1, medium: -1, large: -1, extra_large: -1 },
            visualization: { small: -1, medium: -1, large: -1, extra_large: -1 },
            machine_learning: { small: -1, medium: -1, large: -1, extra_large: -1 },
          },
        },
        overagePricing: {
          dataPerMB: 0,
          computePerMinute: 0,
          storagePerMB: 0,
          aiQueryCost: 0,
          visualizationCost: 0,
          featureOveragePricing: {}, // No overage charges
        },
        features: [
          'all_journeys',
          'consultation_service',
          'unlimited_everything',
          'custom_integrations',
          'dedicated_support',
          'sla_guarantee',
        ],
        isActive: true,
      },
    ];

    defaultTiers.forEach(config => {
      this.tierConfigs.set(config.tier, config);
    });
  }

  /**
   * Reload configurations from admin API/database
   * Called when admin updates configurations
   */
  public async reloadConfigurations(): Promise<void> {
    await this.loadConfigurations();
  }

  /**
   * Get tier configuration
   */
  public getTierConfig(tier: SubscriptionTier): AdminSubscriptionTierConfig | null {
    return this.tierConfigs.get(tier) || null;
  }

  /**
   * Get feature configuration
   */
  public getFeatureConfig(featureId: string): AdminFeatureConfig | null {
    return this.featureConfigs.get(featureId) || null;
  }

  // ==========================================
  // SUBSCRIPTION MANAGEMENT
  // ==========================================

  /**
   * Create new subscription with Stripe
   * Transaction-safe with database rollback on Stripe failure
   */
  async createSubscription(
    userId: string,
    tier: SubscriptionTier,
    billingCycle: 'monthly' | 'yearly'
  ): Promise<{
    success: boolean;
    subscription?: Stripe.Subscription;
    error?: string;
  }> {
    try {
      // Validate tier
      const tierConfig = this.getTierConfig(tier);
      if (!tierConfig || !tierConfig.isActive) {
        return { success: false, error: 'Invalid or inactive subscription tier' };
      }

      // Get user
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Get or create Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          metadata: { userId },
        });
        customerId = customer.id;
      }

      // Get price ID
      const priceId = billingCycle === 'monthly'
        ? tierConfig.stripePriceIds.monthly
        : tierConfig.stripePriceIds.yearly;

      // Create subscription within database transaction
      const result = await db.transaction(async (tx) => {
        // Create Stripe subscription
        const subscription = await this.stripe.subscriptions.create({
          customer: customerId!,
          items: [{ price: priceId }],
          metadata: {
            userId,
            tier,
            billingCycle,
          },
          payment_behavior: 'default_incomplete',
          payment_settings: { save_default_payment_method: 'on_subscription' },
          expand: ['latest_invoice.payment_intent'],
        });

        // Update user record
        await tx.update(users)
          .set({
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            subscriptionTier: tier,
            subscriptionStatus: subscription.status as SubscriptionStatus,
            subscriptionExpiresAt: new Date((subscription as any).current_period_end * 1000),
            subscriptionBalances: this.getInitialBalances(tierConfig),
            isPaid: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));

        return subscription;
      });

      return { success: true, subscription: result };
    } catch (error: any) {
      console.error('Create subscription error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    userId: string,
    immediate: boolean = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.stripeSubscriptionId) {
        return { success: false, error: 'No active subscription found' };
      }

      await db.transaction(async (tx) => {
        // Cancel Stripe subscription
        if (immediate) {
          await this.stripe.subscriptions.cancel(user.stripeSubscriptionId!);
        } else {
          await this.stripe.subscriptions.update(user.stripeSubscriptionId!, {
            cancel_at_period_end: true,
          });
        }

        // Update user record
        await tx.update(users)
          .set({
            subscriptionStatus: 'cancelled',
            subscriptionExpiresAt: immediate ? new Date() : user.subscriptionExpiresAt,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      return { success: true };
    } catch (error: any) {
      console.error('Cancel subscription error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upgrade/downgrade subscription
   */
  async changeSubscription(
    userId: string,
    newTier: SubscriptionTier
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.stripeSubscriptionId) {
        return { success: false, error: 'No active subscription found' };
      }

      const newTierConfig = this.getTierConfig(newTier);
      if (!newTierConfig || !newTierConfig.isActive) {
        return { success: false, error: 'Invalid target tier' };
      }

      await db.transaction(async (tx) => {
        // Update Stripe subscription
        const subscription = await this.stripe.subscriptions.retrieve(user.stripeSubscriptionId!);
        await this.stripe.subscriptions.update(user.stripeSubscriptionId!, {
          items: [{
            id: subscription.items.data[0].id,
            price: newTierConfig.stripePriceIds.monthly, // TODO: Preserve billing cycle
          }],
          proration_behavior: 'create_prorations',
          metadata: { tier: newTier },
        });

        // Update user record
        await tx.update(users)
          .set({
            subscriptionTier: newTier,
            subscriptionBalances: this.getInitialBalances(newTierConfig),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      return { success: true };
    } catch (error: any) {
      console.error('Change subscription error:', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // WEBHOOK HANDLING
  // ==========================================

  /**
   * Verify and process Stripe webhook
   * SECURITY: Validates webhook signature
   */
  async handleWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Verify webhook signature (SECURITY)
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      console.log(`Processing webhook: ${event.type}`);

      // Process event within transaction
      await db.transaction(async (tx) => {
        switch (event.type) {
          case 'customer.subscription.created':
          case 'customer.subscription.updated':
            await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription, tx);
            break;

          case 'customer.subscription.deleted':
            await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription, tx);
            break;

          case 'invoice.paid':
            await this.handleInvoicePaid(event.data.object as Stripe.Invoice, tx);
            break;

          case 'invoice.payment_failed':
            await this.handlePaymentFailed(event.data.object as Stripe.Invoice, tx);
            break;

          default:
            console.log(`Unhandled webhook type: ${event.type}`);
        }
      });

      return { success: true };
    } catch (error: any) {
      console.error('Webhook processing error:', error);
      return { success: false, error: error.message };
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription, tx: any): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    await tx.update(users)
      .set({
        subscriptionStatus: subscription.status as SubscriptionStatus,
        subscriptionExpiresAt: new Date((subscription as any).current_period_end * 1000),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription, tx: any): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    await tx.update(users)
      .set({
        subscriptionStatus: 'cancelled',
        subscriptionTier: 'none',
        subscriptionExpiresAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  private async handleInvoicePaid(invoice: Stripe.Invoice, tx: any): Promise<void> {
    const customerId = invoice.customer as string;
    if (!customerId) return;

    // Find user by Stripe customer ID
    const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customerId));
    if (!user) return;

    await tx.update(users)
      .set({
        isPaid: true,
        subscriptionStatus: 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice, tx: any): Promise<void> {
    const customerId = invoice.customer as string;
    if (!customerId) return;

    const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customerId));
    if (!user) return;

    await tx.update(users)
      .set({
        subscriptionStatus: 'past_due',
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  // ==========================================
  // USAGE TRACKING & QUOTA MANAGEMENT
  // ==========================================

  /**
   * Track feature usage and check against quota
   * Returns cost (0 if within quota, overage cost if exceeded)
   *
   * TRANSACTION-SAFE: Updates usage atomically
   */
  async trackFeatureUsage(
    userId: string,
    featureId: string,
    complexity: FeatureComplexity,
    quantity: number = 1
  ): Promise<{
    allowed: boolean;
    cost: number;
    remainingQuota: number;
    message?: string;
  }> {
    try {
      return await db.transaction(async (tx) => {
        // Get user with subscription details
        const [user] = await tx.select().from(users).where(eq(users.id, userId));
        if (!user) {
          return { allowed: false, cost: 0, remainingQuota: 0, message: 'User not found' };
        }

        // Get tier configuration
        const tierConfig = this.getTierConfig(user.subscriptionTier as SubscriptionTier);
        if (!tierConfig) {
          return { allowed: false, cost: 0, remainingQuota: 0, message: 'Invalid subscription tier' };
        }

        // Get quota for this feature
        const featureQuotas = tierConfig.quotas.featureQuotas[featureId];
        if (!featureQuotas) {
          return { allowed: false, cost: 0, remainingQuota: 0, message: 'Feature not available for tier' };
        }

        const quota = featureQuotas[complexity] || 0;
        const isUnlimited = quota === -1;

        // Get current usage
        const subscriptionBalances = user.subscriptionBalances as any || {};
        const featureBalances = subscriptionBalances[featureId] || {};
        const complexityBalance = featureBalances[complexity] || { used: 0, remaining: quota, limit: quota };

        const currentUsed = complexityBalance.used || 0;
        const newUsed = currentUsed + quantity;

        // Check if within quota
        if (isUnlimited || newUsed <= quota) {
          // Within quota - no cost
          const updatedBalances = {
            ...subscriptionBalances,
            [featureId]: {
              ...featureBalances,
              [complexity]: {
                used: newUsed,
                remaining: isUnlimited ? -1 : quota - newUsed,
                limit: quota,
              },
            },
          };

          // Update user balances
          await tx.update(users)
            .set({
              subscriptionBalances: updatedBalances,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          return {
            allowed: true,
            cost: 0,
            remainingQuota: isUnlimited ? -1 : quota - newUsed,
          };
        } else {
          // Exceeded quota - calculate overage cost
          const overageQuantity = newUsed - quota;
          const overagePricing = tierConfig.overagePricing.featureOveragePricing[featureId];

          if (!overagePricing) {
            return {
              allowed: false,
              cost: 0,
              remainingQuota: 0,
              message: 'Quota exceeded and overage pricing not configured',
            };
          }

          const cost = overagePricing[complexity] * overageQuantity;

          // Update balances
          const updatedBalances = {
            ...subscriptionBalances,
            [featureId]: {
              ...featureBalances,
              [complexity]: {
                used: newUsed,
                remaining: 0,
                limit: quota,
              },
            },
          };

          await tx.update(users)
            .set({
              subscriptionBalances: updatedBalances,
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          // TODO: Create invoice item in Stripe for overage charges

          return {
            allowed: true, // Allow but charge
            cost,
            remainingQuota: 0,
            message: `Quota exceeded. Overage charge: $${cost.toFixed(2)}`,
          };
        }
      });
    } catch (error: any) {
      console.error('Track feature usage error:', error);
      return {
        allowed: false,
        cost: 0,
        remainingQuota: 0,
        message: error.message,
      };
    }
  }

  /**
   * Get current quota status for a user
   */
  async getQuotaStatus(userId: string, featureId: string, complexity: FeatureComplexity): Promise<QuotaStatus | null> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;

      const tierConfig = this.getTierConfig(user.subscriptionTier as SubscriptionTier);
      if (!tierConfig) return null;

      const featureQuotas = tierConfig.quotas.featureQuotas[featureId];
      if (!featureQuotas) return null;

      const quota = featureQuotas[complexity] || 0;
      const subscriptionBalances = user.subscriptionBalances as any || {};
      const featureBalances = subscriptionBalances[featureId] || {};
      const complexityBalance = featureBalances[complexity] || { used: 0, remaining: quota, limit: quota };

      const used = complexityBalance.used || 0;
      const remaining = quota === -1 ? -1 : Math.max(0, quota - used);
      const percentUsed = quota === -1 ? 0 : Math.min(100, (used / quota) * 100);
      const isExceeded = quota !== -1 && used >= quota;

      return {
        quota,
        used,
        remaining,
        percentUsed,
        isExceeded,
      };
    } catch (error: any) {
      console.error('Get quota status error:', error);
      return null;
    }
  }

  /**
   * Get usage metrics for a user
   */
  async getUsageMetrics(userId: string, period?: { start: Date; end: Date }): Promise<UsageMetrics | null> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;

      // Calculate billing period
      const billingPeriod = period || {
        start: user.usageResetAt || new Date(),
        end: new Date(),
      };

      // Get feature usage from subscriptionBalances
      const subscriptionBalances = user.subscriptionBalances as any || {};
      const featureUsage: any = {};

      Object.entries(subscriptionBalances).forEach(([featureId, balances]: [string, any]) => {
        featureUsage[featureId] = {
          small: balances.small?.used || 0,
          medium: balances.medium?.used || 0,
          large: balances.large?.used || 0,
          extra_large: balances.extra_large?.used || 0,
        };
      });

      const tierConfig = this.getTierConfig(user.subscriptionTier as SubscriptionTier);
      const baseSubscriptionCost = tierConfig?.pricing.monthly || 0;

      // TODO: Calculate actual overage costs and feature costs from database
      const overageCosts = 0;
      const featureCosts = 0;
      const campaignDiscounts = 0;

      return {
        userId,
        billingPeriod,
        dataUsage: {
          uploadsCount: user.monthlyUploads || 0,
          totalUploadSizeMB: user.monthlyDataVolume || 0,
          processedDataMB: user.monthlyDataProcessedGb ? parseFloat(user.monthlyDataProcessedGb) * 1024 : 0,
          storageUsedMB: user.currentStorageGb ? parseFloat(user.currentStorageGb) * 1024 : 0,
        },
        computeUsage: {
          aiQueries: user.monthlyAIInsights || 0,
          analysisComponents: user.monthlyAnalysisComponents || 0,
          visualizations: user.monthlyVisualizations || 0,
          computeMinutes: 0, // TODO: Track compute minutes
        },
        featureUsage,
        costBreakdown: {
          baseSubscription: baseSubscriptionCost,
          overageCosts,
          featureCosts,
          campaignDiscounts,
          totalCost: baseSubscriptionCost + overageCosts + featureCosts - campaignDiscounts,
        },
      };
    } catch (error: any) {
      console.error('Get usage metrics error:', error);
      return null;
    }
  }

  /**
   * Reset monthly quotas
   * Called at the start of each billing cycle
   */
  async resetMonthlyQuotas(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await db.transaction(async (tx) => {
        const [user] = await tx.select().from(users).where(eq(users.id, userId));
        if (!user) throw new Error('User not found');

        const tierConfig = this.getTierConfig(user.subscriptionTier as SubscriptionTier);
        if (!tierConfig) throw new Error('Invalid subscription tier');

        // Reset balances to initial values
        const resetBalances = this.getInitialBalances(tierConfig);

        await tx.update(users)
          .set({
            subscriptionBalances: resetBalances,
            monthlyUploads: 0,
            monthlyDataVolume: 0,
            monthlyAIInsights: 0,
            monthlyAnalysisComponents: 0,
            monthlyVisualizations: 0,
            usageResetAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });

      return { success: true };
    } catch (error: any) {
      console.error('Reset monthly quotas error:', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private getInitialBalances(tierConfig: AdminSubscriptionTierConfig): any {
    // Convert tier quotas to subscription balances
    const balances: any = {};

    Object.entries(tierConfig.quotas.featureQuotas).forEach(([featureId, quotas]) => {
      balances[featureId] = {};
      Object.entries(quotas).forEach(([complexity, limit]) => {
        balances[featureId][complexity] = {
          remaining: limit,
          used: 0,
          limit: limit,
        };
      });
    });

    return balances;
  }

  /**
   * Calculate billing with capacity tracking (for compatibility)
   */
  async calculateBillingWithCapacity(userId: string, usage: any): Promise<any> {
    const userTier = await this.getUserTier(userId);
    const usageMetrics = await this.getUsageMetricsSimple(userId);
    
    return {
      userId,
      tier: userTier,
      usage: usageMetrics,
      cost: 0, // Simplified for now
      capacityUsed: (usageMetrics as any)?.totalDataUsageMB || 0,
      capacityLimit: this.getTierConfig(userTier)?.quotas.maxDataUploadsMB || 0
    };
  }

  /**
   * Get user capacity summary (for compatibility)
   */
  async getUserCapacitySummary(userId: string): Promise<any> {
    const userTier = await this.getUserTier(userId);
    const usageMetrics = await this.getUsageMetricsSimple(userId);
    const tierConfig = this.getTierConfig(userTier);
    
    return {
      userId,
      tier: userTier,
      capacityUsed: (usageMetrics as any)?.totalDataUsageMB || 0,
      capacityLimit: tierConfig?.quotas.maxDataUploadsMB || 0,
      percentageUsed: tierConfig ? 
        (((usageMetrics as any)?.totalDataUsageMB || 0) / tierConfig.quotas.maxDataUploadsMB) * 100 : 0
    };
  }

  /**
   * Calculate journey requirements (for compatibility)
   */
  async calculateJourneyRequirements(journeyType: string, datasetSizeMB: number): Promise<any> {
    return {
      journeyType,
      datasetSizeMB,
      estimatedCost: datasetSizeMB * 0.01, // Simple calculation
      complexity: datasetSizeMB > 1000 ? 'large' : datasetSizeMB > 100 ? 'medium' : 'small'
    };
  }

  /**
   * Update user usage (for compatibility)
   */
  async updateUserUsage(userId: string, usage: any): Promise<void> {
    await this.trackFeatureUsage(userId, 'data_upload', 'small', usage.dataSizeMB || 0);
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<any> {
    // This would typically fetch from database
    // For now, return a mock user
    return {
      id: userId,
      subscriptionTier: 'trial',
      email: 'user@example.com'
    };
  }

  /**
   * Get user usage by ID
   */
  async getUserUsage(userId: string): Promise<any> {
    // This would typically fetch from database
    // For now, return mock usage
    return {
      dataUploadsMB: 0,
      toolExecutions: 0,
      aiQueries: 0
    };
  }

  /**
   * Get user tier
   */
  async getUserTier(userId: string): Promise<SubscriptionTier> {
    const user = await this.getUser(userId);
    return user?.subscriptionTier || 'trial';
  }

  /**
   * Get usage metrics (simple version)
   */
  async getUsageMetricsSimple(userId: string): Promise<any> {
    // This would typically fetch from database
    // For now, return mock metrics
    return {
      totalDataUsageMB: 0,
      totalToolExecutions: 0,
      totalAIQueries: 0
    };
  }

  /**
   * Get ML/LLM usage summary for user
   */
  async getMLUsageSummary(userId: string): Promise<any> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const mlUsage = await mlLLMUsageTracker.getUserUsage(
        parseInt(userId), 
        startOfMonth, 
        now
      );

      return {
        total_billing_units: mlUsage.total_billing_units,
        total_jobs: mlUsage.total_jobs,
        successful_jobs: mlUsage.successful_jobs,
        failed_jobs: mlUsage.failed_jobs,
        by_tool: mlUsage.by_tool,
        by_library: mlUsage.by_library,
        by_model_type: mlUsage.by_model_type,
        estimated_cost: mlUsage.total_billing_units * 0.10 // $0.10 per billing unit
      };
    } catch (error) {
      console.error('Failed to get ML usage summary:', error);
      return {
        total_billing_units: 0,
        total_jobs: 0,
        successful_jobs: 0,
        failed_jobs: 0,
        by_tool: {},
        by_library: {},
        by_model_type: {},
        estimated_cost: 0
      };
    }
  }

  /**
   * Calculate ML training cost estimate
   */
  async calculateMLCostEstimate(params: {
    userId: string;
    toolName: string;
    datasetSize: number;
    useAutoML?: boolean;
    enableExplainability?: boolean;
    trials?: number;
  }): Promise<any> {
    try {
      const user = await this.getUser(params.userId);
      const userTier = user?.subscriptionTier || 'trial';

      const cost = PricingService.calculateMLCost({
        toolName: params.toolName,
        datasetSize: params.datasetSize,
        useAutoML: params.useAutoML,
        enableExplainability: params.enableExplainability,
        trials: params.trials,
        userTier
      });

      return {
        success: true,
        cost,
        userTier,
        quota_check: await this.checkMLQuota(params.userId, params.toolName, userTier)
      };
    } catch (error) {
      console.error('Failed to calculate ML cost estimate:', error);
      return {
        success: false,
        error: 'Failed to calculate cost estimate'
      };
    }
  }

  /**
   * Calculate LLM fine-tuning cost estimate
   */
  async calculateLLMCostEstimate(params: {
    userId: string;
    toolName: string;
    datasetSize: number;
    method?: 'full' | 'lora' | 'qlora';
    numEpochs?: number;
  }): Promise<any> {
    try {
      const user = await this.getUser(params.userId);
      const userTier = user?.subscriptionTier || 'trial';

      const cost = PricingService.calculateLLMCost({
        toolName: params.toolName,
        datasetSize: params.datasetSize,
        method: params.method,
        numEpochs: params.numEpochs,
        userTier
      });

      return {
        success: true,
        cost,
        userTier,
        quota_check: await this.checkLLMQuota(params.userId, params.toolName, userTier)
      };
    } catch (error) {
      console.error('Failed to calculate LLM cost estimate:', error);
      return {
        success: false,
        error: 'Failed to calculate cost estimate'
      };
    }
  }

  /**
   * Check ML quota before execution
   */
  private async checkMLQuota(userId: string, toolName: string, userTier: string): Promise<any> {
    if (toolName === 'comprehensive_ml_pipeline') {
      return await mlLLMUsageTracker.checkMLTrainingQuota(parseInt(userId), userTier);
    } else if (toolName === 'automl_optimizer') {
      return await mlLLMUsageTracker.checkAutoMLQuota(parseInt(userId), userTier);
    }
    return { allowed: true };
  }

  /**
   * Check LLM quota before execution
   */
  private async checkLLMQuota(userId: string, toolName: string, userTier: string): Promise<any> {
    if (toolName.includes('llm')) {
      return await mlLLMUsageTracker.checkLLMFineTuningQuota(parseInt(userId), userTier);
    }
    return { allowed: true };
  }

  /**
   * Log ML/LLM usage for billing
   */
  async logMLUsage(event: {
    userId: string;
    projectId?: string;
    toolName: string;
    modelType?: 'traditional_ml' | 'llm';
    libraryUsed?: string;
    datasetSize: number;
    executionTimeMs: number;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      // Calculate billing units
      let billingUnits = 0;
      if (event.toolName.includes('ml')) {
        billingUnits = mlLLMUsageTracker.calculateMLBillingUnits(
          event.toolName,
          event.datasetSize,
          event.metadata?.useAutoML,
          event.metadata?.trials
        );
      } else if (event.toolName.includes('llm')) {
        billingUnits = mlLLMUsageTracker.calculateLLMBillingUnits(
          event.toolName,
          event.datasetSize,
          event.metadata?.method,
          event.metadata?.numEpochs
        );
      }

      await mlLLMUsageTracker.logUsage({
        userId: parseInt(event.userId),
        projectId: event.projectId ? parseInt(event.projectId) : undefined,
        toolName: event.toolName,
        modelType: event.modelType,
        libraryUsed: event.libraryUsed,
        datasetSize: event.datasetSize,
        executionTimeMs: event.executionTimeMs,
        billingUnits,
        success: event.success,
        error: event.error,
        metadata: event.metadata
      });
    } catch (error) {
      console.error('Failed to log ML usage:', error);
      // Don't throw - usage logging shouldn't break the main functionality
    }
  }
  /**
   * Get tier configuration by string
   */
  private getTierConfigByString(tier: string): any {
    const configs = this.getConfigurations();
    return configs.tiers.find(t => t.tier === tier);
  }

  /**
   * Get user usage summary
   */
  async getUserUsageSummary(userId: string): Promise<{
    dataUsage: { totalUploadSizeMB: number };
    computeUsage: { toolExecutions: number; aiQueries: number };
  }> {
    try {
      const user = await this.getUser(userId);
      const usage = await this.getUserUsage(userId);
      
      return {
        dataUsage: {
          totalUploadSizeMB: usage.dataUploadsMB || 0
        },
        computeUsage: {
          toolExecutions: usage.toolExecutions || 0,
          aiQueries: usage.aiQueries || 0
        }
      };
    } catch (error) {
      // Return default values if user not found
      return {
        dataUsage: { totalUploadSizeMB: 0 },
        computeUsage: { toolExecutions: 0, aiQueries: 0 }
      };
    }
  }

}

// Singleton instance
let billingService: UnifiedBillingService | null = null;

export function getBillingService(): UnifiedBillingService {
  if (!billingService) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_development_key';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_development_secret';
    
    // Log warning if using development keys
    if (stripeSecretKey === 'sk_test_development_key') {
      console.warn('⚠️  Using development Stripe key. Set STRIPE_SECRET_KEY for production.');
    }
    
    billingService = new UnifiedBillingService({
      stripeSecretKey,
      webhookSecret,
    });
  }
  return billingService;
}
