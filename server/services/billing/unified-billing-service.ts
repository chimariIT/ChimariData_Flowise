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
import { subscriptionTierPricing, users, billingCampaigns, projects } from '../../../shared/schema';
import { PricingService } from '../pricing';
import { getPricingDataService } from '../pricing-data-service';
import { mlLLMUsageTracker } from '../ml-llm-usage-tracker';
import { eq, sql, and, gte, lte } from 'drizzle-orm';
import type { InferSelectModel } from 'drizzle-orm';
import { eligibilityService } from '../../eligibility-service';
import { UsageTrackingService } from '../usage-tracking';
import { nanoid } from 'nanoid';
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

type EligibilityFeatureName = 'preparation' | 'data_processing' | 'analysis' | 'visualization' | 'ai_insights';

interface LegacyConsumptionRate {
  type: string;
  baseRate: number;
  currency: string;
  description?: string;
  complexityMultiplier?: Record<string, number>;
}

interface LegacyTaxRegion {
  region: string;
  rate: number;
}

interface LegacyTaxConfig {
  defaultRate: number;
  regions: LegacyTaxRegion[];
}

interface LegacyCurrencyConfig {
  code: string;
  symbol: string;
  lastUpdated: Date;
  exchangeRates: Record<string, number>;
}

interface LegacyTierPricing {
  id: string;
  role: string;
  displayName: string;
  description: string;
  pricing: {
    monthly: number;
    yearly: number;
    currency: string;
  };
  quotas: AdminSubscriptionTierConfig['quotas'];
  features: string[];
  isActive: boolean;
}

interface LegacyBillingConfig {
  consumptionRates: LegacyConsumptionRate[];
  campaigns: AdminCampaignConfig[];
  taxConfig: LegacyTaxConfig;
  currency: LegacyCurrencyConfig;
  tiers: LegacyTierPricing[];
}

type SubscriptionTierPricingRow = InferSelectModel<typeof subscriptionTierPricing>;
type ActiveSubscriptionRow = { tier: SubscriptionTier | null };

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

  // ==========================================
  // WEBHOOK IDEMPOTENCY TRACKING
  // ==========================================
  // Prevents duplicate webhook processing when Stripe retries
  // Set holds event IDs that have been successfully processed
  // Cleaned up periodically to prevent memory growth
  private processedWebhooks: Set<string> = new Set();
  private readonly MAX_PROCESSED_WEBHOOKS = 1000;

  // In-memory cache for admin configurations (refreshed periodically)
  private tierConfigs: Map<SubscriptionTier, AdminSubscriptionTierConfig> = new Map();
  private featureConfigs: Map<string, AdminFeatureConfig> = new Map();
  private activeCampaigns: AdminCampaignConfig[] = [];
  private legacyConfig: LegacyBillingConfig = {
    consumptionRates: [
      {
        type: 'data_processing',
        baseRate: 0.05,
        currency: 'USD',
        description: 'Per megabyte processed beyond quota',
        complexityMultiplier: { basic: 1, intermediate: 1.25, advanced: 1.5 }
      },
      {
        type: 'compute',
        baseRate: 0.03,
        currency: 'USD',
        description: 'Per compute minute beyond quota',
        complexityMultiplier: { basic: 1, intermediate: 1.2, advanced: 1.4 }
      },
      {
        type: 'storage',
        baseRate: 0.001,
        currency: 'USD',
        description: 'Per megabyte stored beyond quota'
      },
      {
        type: 'ai_query',
        baseRate: 0.2,
        currency: 'USD',
        description: 'Per AI insight beyond quota'
      }
    ],
    campaigns: [],
    taxConfig: {
      defaultRate: 0.0,
      regions: []
    },
    currency: {
      code: 'USD',
      symbol: '$',
      lastUpdated: new Date(),
      exchangeRates: {}
    },
    tiers: []
  };
  private configurationReady: Promise<void>;
  private configurationLoaded = false;
  private readonly featureComplexityLevels: FeatureComplexity[] = ['small', 'medium', 'large', 'extra_large'];
  private readonly featureQuotaDefaults: Record<string, Record<string, Record<FeatureComplexity, number>>> = {
    default: {
      data_upload: { small: 500, medium: 100, large: 10, extra_large: 0 },
      statistical_analysis: { small: 300, medium: 50, large: 10, extra_large: 0 },
      visualization: { small: 500, medium: 100, large: 10, extra_large: 0 },
      machine_learning: { small: 50, medium: 10, large: 2, extra_large: 0 },
    },
    trial: {
      data_upload: { small: 5, medium: 0, large: 0, extra_large: 0 },
      statistical_analysis: { small: 3, medium: 0, large: 0, extra_large: 0 },
      visualization: { small: 5, medium: 0, large: 0, extra_large: 0 },
    },
    starter: {
      data_upload: { small: 50, medium: 10, large: 0, extra_large: 0 },
      statistical_analysis: { small: 30, medium: 5, large: 0, extra_large: 0 },
      visualization: { small: 50, medium: 10, large: 0, extra_large: 0 },
    },
    professional: {
      data_upload: { small: 500, medium: 100, large: 10, extra_large: 0 },
      statistical_analysis: { small: 300, medium: 50, large: 10, extra_large: 0 },
      visualization: { small: 500, medium: 100, large: 10, extra_large: 0 },
      machine_learning: { small: 50, medium: 10, large: 2, extra_large: 0 },
    },
    enterprise: {
      // Enterprise tier: unlimited quotas for all features (-1 = unlimited)
      data_upload: { small: -1, medium: -1, large: -1, extra_large: -1 },
      statistical_analysis: { small: -1, medium: -1, large: -1, extra_large: -1 },
      visualization: { small: -1, medium: -1, large: -1, extra_large: -1 },
      machine_learning: { small: -1, medium: -1, large: -1, extra_large: -1 },
    },
    none: {
      data_upload: { small: 0, medium: 0, large: 0, extra_large: 0 },
    },
  };

  public get config(): LegacyBillingConfig {
    return this.legacyConfig;
  }

  private getConfigurations(): LegacyBillingConfig {
    return this.legacyConfig;
  }

  constructor(config: {
    stripeSecretKey: string;
    webhookSecret: string;
  }) {
    // FIX Jan 20: Use stable Stripe API version that matches installed package
    // stripe@18.5.0 supports '2024-12-18.acacia' - using this stable version
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2024-12-18.acacia' as any,
    });
    this.webhookSecret = config.webhookSecret;

    // Load configurations on initialization
    this.configurationReady = (async () => {
      await this.ensureSubscriptionBalanceColumn();
      await this.loadConfigurations();
      this.configurationLoaded = true;
    })();
  }

  // ==========================================
  // CONFIGURATION MANAGEMENT
  // ==========================================

  /**
   * Load admin configurations from database/storage
   * Called on initialization and periodically
   */
  private async loadConfigurations(): Promise<void> {
    try {
      const pricingService = getPricingDataService();

      // Load all active tiers from database
      const dbTiers = await pricingService.getAllActiveTiers();

      // Transform database tiers to AdminSubscriptionTierConfig format
      this.tierConfigs.clear();
      for (const dbTier of dbTiers) {
        const limits = dbTier.limits as any || {};
        const features = dbTier.features as any || {};
        const journeyPricing = dbTier.journeyPricing as any || {};
        const overagePricing = dbTier.overagePricing as any || {};

        const featureQuotas: AdminSubscriptionTierConfig['quotas']['featureQuotas'] = {
          data_upload: {},
          statistical_analysis: {},
          visualization: {},
          machine_learning: {},
        };

        if (typeof limits.maxFiles === 'number' && Number.isFinite(limits.maxFiles)) {
          featureQuotas.data_upload.small = limits.maxFiles;
        }

        if (typeof limits.maxAnalysisComponents === 'number' && Number.isFinite(limits.maxAnalysisComponents)) {
          featureQuotas.statistical_analysis.small = limits.maxAnalysisComponents;
        }

        if (typeof limits.maxVisualizations === 'number' && Number.isFinite(limits.maxVisualizations)) {
          featureQuotas.visualization.small = limits.maxVisualizations;
        }

        if (typeof limits.maxMLExperiments === 'number' && Number.isFinite(limits.maxMLExperiments)) {
          featureQuotas.machine_learning.small = limits.maxMLExperiments;
        }

        const tierConfig: AdminSubscriptionTierConfig = {
          tier: dbTier.id as SubscriptionTier,
          displayName: dbTier.displayName,
          description: dbTier.description || '',
          pricing: {
            monthly: dbTier.monthlyPriceUsd / 100, // Convert cents to dollars
            yearly: dbTier.yearlyPriceUsd / 100,
            currency: 'USD'
          },
          stripeProductId: dbTier.stripeProductId || `prod_${dbTier.id}`,
          stripePriceIds: {
            monthly: dbTier.stripeMonthlyPriceId || `price_${dbTier.id}_monthly`,
            yearly: dbTier.stripeYearlyPriceId || `price_${dbTier.id}_yearly`
          },
          quotas: {
            maxDataUploadsMB: limits.totalDataVolumeMB || 0,
            maxStorageMB: limits.totalDataVolumeMB || 0,
            maxDataProcessingMB: limits.totalDataVolumeMB || 0,
            maxAIQueries: limits.aiInsights || 0,
            maxAnalysisComponents: limits.maxAnalysisComponents || 0,
            maxVisualizationsPerProject: limits.maxVisualizations || 0,
            maxComputeMinutes: limits.maxComputeMinutes || 300,
            maxProjects: limits.maxProjects || 5,
            maxDatasetsPerProject: limits.maxDatasetsPerProject || 3,
            allowedJourneys: this.parseAllowedJourneys(dbTier.id),
            featureQuotas,
          },
          overagePricing: {
            dataPerMB: overagePricing.dataPerMB || 0.005,
            computePerMinute: overagePricing.computePerMinute || 0.03,
            storagePerMB: overagePricing.storagePerMB || 0.001,
            aiQueryCost: 0.20,
            visualizationCost: 0.50,
            featureOveragePricing: overagePricing.featureOveragePricing || {}
          },
          features: this.parseFeatureList(features),
          isActive: dbTier.isActive
        };

        this.applyDefaultOveragePricing(tierConfig);
        this.applyDefaultFeatureQuotas(tierConfig);

        this.tierConfigs.set(tierConfig.tier, tierConfig);
      }

      console.log(`✅ Loaded ${dbTiers.length} tier configurations from database`);

      // Load campaigns from database
      await this.loadCampaignsFromDatabase();

      this.legacyConfig.tiers = Array.from(this.tierConfigs.values()).map(tierConfig => ({
        id: tierConfig.tier,
        role: tierConfig.tier,
        displayName: tierConfig.displayName,
        description: tierConfig.description,
        pricing: {
          monthly: tierConfig.pricing.monthly,
          yearly: tierConfig.pricing.yearly,
          currency: tierConfig.pricing.currency
        },
        quotas: tierConfig.quotas,
        features: tierConfig.features,
        isActive: tierConfig.isActive
      }));
    } catch (error) {
      console.error('❌ Failed to load configurations from database, using defaults:', error);
      this.setDefaultConfigurations();
    } finally {
      this.configurationLoaded = true;
    }
  }

  private async ensureSubscriptionBalanceColumn(): Promise<void> {
    try {
      await db.execute(sql`
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS subscription_balances jsonb NOT NULL DEFAULT '{}'::jsonb
      `);
    } catch (error) {
      console.error('⚠️ Unable to ensure subscription_balances column exists:', error);
    }
  }

  /**
   * Load campaigns from database
   * Campaigns are now persisted in the billing_campaigns table
   */
  private async loadCampaignsFromDatabase(): Promise<void> {
    try {
      const dbCampaigns = await db.select().from(billingCampaigns);

      this.activeCampaigns = dbCampaigns.map((c: InferSelectModel<typeof billingCampaigns>) => ({
        id: c.id,
        name: c.name,
        type: c.type as AdminCampaignConfig['type'],
        value: c.value,
        targetTiers: (c.targetTiers as string[]) || [],
        targetRoles: (c.targetRoles as string[]) || [],
        validFrom: c.validFrom,
        validTo: c.validTo,
        maxUses: c.maxUses ?? undefined,
        currentUses: c.currentUses,
        couponCode: c.couponCode ?? undefined,
        isActive: c.isActive ?? true,
      }));

      this.legacyConfig.campaigns = this.activeCampaigns;
      console.log(`✅ Loaded ${dbCampaigns.length} campaigns from database`);
    } catch (error) {
      console.error('⚠️ Failed to load campaigns from database:', error);
      // Keep existing in-memory campaigns if load fails
    }
  }

  private applyDefaultOveragePricing(tierConfig: AdminSubscriptionTierConfig): void {
    const defaults: Record<string, Record<FeatureComplexity, number>> = {
      data_upload: { small: 0.35, medium: 1.2, large: 8.0, extra_large: 24.0 },
      statistical_analysis: { small: 0.75, medium: 3, large: 9, extra_large: 30 },
      visualization: { small: 0.5, medium: 1.5, large: 4, extra_large: 12 },
      machine_learning: { small: 2, medium: 6, large: 18, extra_large: 48 }
    } as const;

    if (!tierConfig.overagePricing.featureOveragePricing) {
      tierConfig.overagePricing.featureOveragePricing = {};
    }

    for (const [featureId, pricing] of Object.entries(defaults)) {
      if (!tierConfig.overagePricing.featureOveragePricing[featureId]) {
        tierConfig.overagePricing.featureOveragePricing[featureId] = { ...pricing };
      }
    }
  }

  private applyDefaultFeatureQuotas(tierConfig: AdminSubscriptionTierConfig): void {
    if (!tierConfig.quotas.featureQuotas) {
      tierConfig.quotas.featureQuotas = {};
    }

    const tierDefaults = this.featureQuotaDefaults[tierConfig.tier] || this.featureQuotaDefaults.default;
    const baseDefaults = this.featureQuotaDefaults.default;

    const allFeatureIds = new Set<string>([
      ...Object.keys(baseDefaults),
      ...Object.keys(tierDefaults),
      ...Object.keys(tierConfig.quotas.featureQuotas),
    ]);

    for (const featureId of allFeatureIds) {
      const featureQuota = tierConfig.quotas.featureQuotas[featureId] || {} as Record<FeatureComplexity, number>;
      const defaultQuota = tierDefaults?.[featureId] || {};
      const fallbackQuota = baseDefaults?.[featureId] || {};

      for (const level of this.featureComplexityLevels) {
        const desiredDefault = defaultQuota[level] ?? fallbackQuota[level] ?? 0;
        const currentValue = featureQuota[level];

        if (currentValue === undefined || currentValue === null || Number.isNaN(currentValue as number)) {
          featureQuota[level] = desiredDefault;
          continue;
        }

        if (typeof currentValue === 'number' && typeof desiredDefault === 'number') {
          const hasUnlimitedQuota = currentValue === -1 || desiredDefault === -1;
          if (hasUnlimitedQuota) {
            featureQuota[level] = -1;
            continue;
          }

          if (currentValue < desiredDefault) {
            featureQuota[level] = desiredDefault;
          }
        }
      }

      tierConfig.quotas.featureQuotas[featureId] = featureQuota;
    }
  }

  private async ensureConfigurationsLoaded(): Promise<void> {
    if (!this.configurationLoaded) {
      await this.configurationReady;
    }
  }

  /**
   * Helper: Map analysis types to billing feature IDs
   * Analysis types like 'descriptive-statistics', 'correlation-analysis' map to 'statistical_analysis'
   */
  private mapAnalysisTypeToFeature(featureId: string): string {
    const analysisTypeMapping: Record<string, string> = {
      // Statistical analysis types
      'descriptive-statistics': 'statistical_analysis',
      'correlation-analysis': 'statistical_analysis',
      'regression-analysis': 'statistical_analysis',
      'hypothesis-testing': 'statistical_analysis',
      'factor-analysis': 'statistical_analysis',
      'cluster-analysis': 'statistical_analysis',
      'time-series-analysis': 'statistical_analysis',
      // ML types
      'machine-learning': 'machine_learning',
      'predictive-modeling': 'machine_learning',
      'classification': 'machine_learning',
      'clustering-analysis': 'machine_learning',
      // Visualization types
      'chart-generation': 'visualization',
      'dashboard-creation': 'visualization',
      // Data types
      'data-upload': 'data_upload',
      'data-transformation': 'data_upload',
      // Agent workflow
      'agent_workflow': 'statistical_analysis',
    };

    return analysisTypeMapping[featureId] || featureId;
  }

  /**
   * Helper: Parse allowed journeys based on tier
   */
  private parseAllowedJourneys(tierId: string): JourneyType[] {
    switch (tierId) {
      case 'trial':
        return ['non-tech'];
      case 'starter':
        return ['non-tech', 'business'];
      case 'professional':
        return ['non-tech', 'business', 'technical'];
      case 'enterprise':
        return ['non-tech', 'business', 'technical', 'consultation'];
      default:
        return ['non-tech'];
    }
  }

  /**
   * Helper: Parse database features into feature list
   */
  private parseFeatureList(features: any): string[] {
    const featureList: string[] = [];

    if (features.dataTransformation) featureList.push('data_transformation');
    if (features.statisticalAnalysis) featureList.push('statistical_analysis');
    if (features.advancedInsights) featureList.push('advanced_insights');
    if (features.piiDetection) featureList.push('pii_detection');
    if (features.mlBasic) featureList.push('ml_basic');
    if (features.mlAdvanced) featureList.push('ml_advanced');
    if (features.llmFineTuning) featureList.push('llm_fine_tuning');

    return featureList;
  }

  /**
   * Set default configurations (fallback)
   */
  private setDefaultConfigurations(): void {
    // Default tier configurations based on canonical types
    const defaultTiers: AdminSubscriptionTierConfig[] = [
      // P0-C FIX: Add 'none' tier for new users without explicit subscription
      // This ensures users can use trial credits even with subscriptionTier='none' or null
      {
        tier: 'none' as any, // Not in SubscriptionTier type but needed for fallback
        displayName: 'Free Trial',
        description: 'New user with trial credits',
        pricing: { monthly: 0, yearly: 0, currency: 'USD' },
        stripeProductId: '',
        stripePriceIds: { monthly: '', yearly: '' },
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
          allowedJourneys: ['non-tech'],
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
        // Same features as trial - allows basic_analysis with trial credits
        features: ['non_tech_journey', 'basic_analysis', 'advanced_analysis'],
        isActive: true,
      },
      {
        tier: 'trial',
        displayName: 'Trial',
        description: '14-day trial with AI-guided journey',
        pricing: { monthly: 1, yearly: 10, currency: 'USD' },
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
          allowedJourneys: ['non-tech'],
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
        features: ['non_tech_journey', 'basic_analysis'],
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
          allowedJourneys: ['non-tech', 'business'],
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
        features: ['non_tech_journey', 'business_journey', 'advanced_analysis', 'data_export'],
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
          allowedJourneys: ['non-tech', 'business', 'technical'],
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
          'non_tech_journey',
          'business_journey',
          'technical_journey',
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
          allowedJourneys: ['non-tech', 'business', 'technical', 'consultation'],
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

    this.tierConfigs.clear();
    defaultTiers.forEach(config => {
      this.applyDefaultOveragePricing(config);
      this.applyDefaultFeatureQuotas(config);
      this.tierConfigs.set(config.tier, config);
    });

    this.legacyConfig.tiers = defaultTiers.map(config => ({
      id: config.tier,
      role: config.tier,
      displayName: config.displayName,
      description: config.description,
      pricing: {
        monthly: config.pricing.monthly,
        yearly: config.pricing.yearly,
        currency: config.pricing.currency
      },
      quotas: config.quotas,
      features: config.features,
      isActive: config.isActive
    }));
  }

  /**
   * Reload configurations from admin API/database
   * Called when admin updates configurations
   */
  public async reloadConfigurations(): Promise<void> {
    this.configurationLoaded = false;
    this.configurationReady = (async () => {
      await this.loadConfigurations();
      this.configurationLoaded = true;
    })();

    await this.configurationReady;
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

  public async getAdminBillingOverview(): Promise<{
    totals: { users: number; activeSubscriptions: number; trialUsers: number };
    revenue: { monthlyRecurringRevenue: number };
    tiers: Array<{
      id: string;
      displayName: string;
      customers: number;
      monthlyPriceUsd: number;
      yearlyPriceUsd: number;
      isActive: boolean;
    }>;
    currency: LegacyCurrencyConfig;
    taxConfig: LegacyTaxConfig;
    consumptionRates: LegacyConsumptionRate[];
    campaigns: AdminCampaignConfig[];
  }> {
    const [{ value: totalUsers = 0 }] = await db.select({ value: sql<number>`count(*)` }).from(users);
    const [{ value: activeSubscriptions = 0 }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.subscriptionStatus, 'active'));
    const [{ value: trialUsers = 0 }] = await db
      .select({ value: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.subscriptionTier, 'trial'));

    const pricingService = getPricingDataService();
    const tierPricing = (await pricingService.getAllActiveTiers()) as SubscriptionTierPricingRow[];

    const activeUsers = (await db
      .select({ tier: users.subscriptionTier })
      .from(users)
      .where(eq(users.subscriptionStatus, 'active'))) as ActiveSubscriptionRow[];

    const tierCustomerCounts = activeUsers.reduce<Record<string, number>>((acc, row) => {
      const key = row.tier ?? 'none';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const tierPriceMap = new Map<string, number>(
      tierPricing.map((tier) => [tier.id, tier.monthlyPriceUsd / 100])
    );

    const monthlyRecurringRevenue = activeUsers.reduce<number>((sum, row) => {
      const tierId = row.tier ?? '';
      return sum + (tierPriceMap.get(tierId) ?? 0);
    }, 0);

    return {
      totals: {
        users: totalUsers,
        activeSubscriptions,
        trialUsers
      },
      revenue: {
        monthlyRecurringRevenue
      },
      tiers: tierPricing.map((tier) => ({
        id: tier.id,
        displayName: tier.displayName,
        customers: tierCustomerCounts[tier.id] ?? 0,
        monthlyPriceUsd: tier.monthlyPriceUsd,
        yearlyPriceUsd: tier.yearlyPriceUsd,
        isActive: tier.isActive ?? false
      })),
      currency: this.legacyConfig.currency,
      taxConfig: this.legacyConfig.taxConfig,
      consumptionRates: this.legacyConfig.consumptionRates,
      campaigns: this.legacyConfig.campaigns
    };
  }

  public async updateBillingConfiguration(update: Partial<LegacyBillingConfig>): Promise<LegacyBillingConfig> {
    if (update.consumptionRates) {
      this.legacyConfig.consumptionRates = update.consumptionRates.map((rate) => ({ ...rate }));
    }

    if (update.campaigns) {
      this.legacyConfig.campaigns = update.campaigns.map((campaign) => ({ ...campaign }));
      this.activeCampaigns = this.legacyConfig.campaigns;
    }

    if (update.taxConfig) {
      this.legacyConfig.taxConfig = {
        defaultRate: update.taxConfig.defaultRate ?? this.legacyConfig.taxConfig.defaultRate,
        regions: update.taxConfig.regions
          ? update.taxConfig.regions.map(region => ({ ...region }))
          : [...this.legacyConfig.taxConfig.regions]
      };
    }

    if (update.currency) {
      this.legacyConfig.currency = {
        ...this.legacyConfig.currency,
        ...update.currency,
        lastUpdated: update.currency.lastUpdated ?? new Date()
      };
    }

    if (update.tiers) {
      this.legacyConfig.tiers = update.tiers.map((tier) => ({
        ...tier,
        pricing: { ...tier.pricing },
        quotas: tier.quotas,
        features: [...tier.features]
      }));

      update.tiers.forEach((tier) => {
        const tierId = tier.id as SubscriptionTier;
        const existing = this.tierConfigs.get(tierId);
        if (existing) {
          existing.pricing.monthly = tier.pricing.monthly;
          existing.pricing.yearly = tier.pricing.yearly;
          existing.pricing.currency = tier.pricing.currency;
          existing.quotas = tier.quotas;
          existing.features = tier.features;
          existing.isActive = tier.isActive;
        }
      });
    }

    return this.legacyConfig;
  }

  public async createCampaign(campaign: Partial<AdminCampaignConfig>): Promise<AdminCampaignConfig> {
    const normalizeDate = (value: Date | string | undefined, fallback: Date) =>
      value instanceof Date ? value : value ? new Date(value) : fallback;

    const now = new Date();
    const campaignId = campaign.id ?? nanoid();
    const newCampaign: AdminCampaignConfig = {
      id: campaignId,
      name: campaign.name ?? 'Untitled Campaign',
      type: campaign.type ?? 'percentage_discount',
      value: campaign.value ?? 0,
      targetTiers: campaign.targetTiers ?? [],
      targetRoles: campaign.targetRoles ?? [],
      validFrom: normalizeDate(campaign.validFrom, now),
      validTo: normalizeDate(campaign.validTo, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)),
      maxUses: campaign.maxUses,
      currentUses: campaign.currentUses ?? 0,
      couponCode: campaign.couponCode ?? campaignId,
      isActive: campaign.isActive ?? true,
    };

    // Save to database for persistence
    try {
      const [existing] = await db.select().from(billingCampaigns).where(eq(billingCampaigns.id, newCampaign.id));

      if (existing) {
        // Update existing campaign
        await db.update(billingCampaigns)
          .set({
            name: newCampaign.name,
            type: newCampaign.type,
            value: newCampaign.value,
            targetTiers: newCampaign.targetTiers,
            targetRoles: newCampaign.targetRoles,
            validFrom: newCampaign.validFrom,
            validTo: newCampaign.validTo,
            maxUses: newCampaign.maxUses ?? null,
            currentUses: newCampaign.currentUses,
            couponCode: newCampaign.couponCode ?? null,
            isActive: newCampaign.isActive,
            updatedAt: new Date(),
          })
          .where(eq(billingCampaigns.id, newCampaign.id));
        console.log(`✅ Updated campaign ${newCampaign.id} in database`);
      } else {
        // Insert new campaign
        await db.insert(billingCampaigns).values({
          id: newCampaign.id,
          name: newCampaign.name,
          type: newCampaign.type,
          value: newCampaign.value,
          targetTiers: newCampaign.targetTiers,
          targetRoles: newCampaign.targetRoles,
          validFrom: newCampaign.validFrom,
          validTo: newCampaign.validTo,
          maxUses: newCampaign.maxUses ?? null,
          currentUses: newCampaign.currentUses,
          couponCode: newCampaign.couponCode ?? null,
          isActive: newCampaign.isActive,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        console.log(`✅ Created campaign ${newCampaign.id} in database`);
      }
    } catch (error) {
      console.error('❌ Failed to persist campaign to database:', error);
      // Continue with in-memory storage as fallback
    }

    // Update in-memory cache
    this.legacyConfig.campaigns = [
      ...this.legacyConfig.campaigns.filter(existing => existing.id !== newCampaign.id),
      newCampaign
    ];

    this.activeCampaigns = this.legacyConfig.campaigns;
    return newCampaign;
  }

  public async calculateConsumptionCost(
    userId: string,
    consumptionType: string,
    volume: number,
    complexity?: string
  ): Promise<number> {
    if (volume <= 0) {
      return 0;
    }

    const user = await this.getUser(userId);
    if (!user?.subscriptionTier) {
      return 0;
    }

    const tier = user.subscriptionTier as SubscriptionTier;
    const tierConfig = this.getTierConfig(tier);
    if (!tierConfig) {
      return 0;
    }

    const overageKey = this.mapConsumptionType(consumptionType);
    if (!overageKey) {
      return 0;
    }

    if (overageKey === 'dataPerMB' || overageKey === 'computePerMinute' || overageKey === 'storagePerMB') {
      const pricingService = getPricingDataService();
      return pricingService.calculateOverageCost(tier, overageKey, volume);
    }

    const baseRate = tierConfig.overagePricing[overageKey];
    if (typeof baseRate !== 'number') {
      return 0;
    }

    let rate = baseRate;

    if (overageKey === 'aiQueryCost' && complexity) {
      const multiplier = this.legacyConfig.consumptionRates
        .find(rateEntry => rateEntry.type === 'ai_query')?.complexityMultiplier?.[complexity];
      if (multiplier) {
        rate *= multiplier;
      }
    }

    return rate * volume;
  }

  public async applyCampaign(userId: string, campaignCode: string): Promise<boolean> {
    const campaign = this.legacyConfig.campaigns.find(c => c.couponCode === campaignCode || c.id === campaignCode);
    if (!campaign || !campaign.isActive) {
      return false;
    }

    // Check if within valid date range
    const now = new Date();
    if (now < campaign.validFrom || now > campaign.validTo) {
      return false;
    }

    if (campaign.maxUses && campaign.currentUses >= campaign.maxUses) {
      return false;
    }

    campaign.currentUses += 1;

    // Persist the usage count to database
    try {
      await db.update(billingCampaigns)
        .set({
          currentUses: campaign.currentUses,
          updatedAt: new Date(),
        })
        .where(eq(billingCampaigns.id, campaign.id));
      console.log(`✅ Applied campaign ${campaign.id} for user ${userId} (uses: ${campaign.currentUses})`);
    } catch (error) {
      console.error('⚠️ Failed to persist campaign usage to database:', error);
      // Continue anyway - in-memory count is updated
    }

    return true;
  }

  public async checkEligibility(
    userId: string,
    request: {
      journeyType: string;
      dataVolume?: number;
      dataSizeMB?: number;
      complexity?: string;
      features?: string[];
    }
  ): Promise<{
    canProceed: boolean;
    reason?: string;
    quotaRemaining: {
      uploads: number;
      dataVolumeMB: number;
      aiInsights: number;
    };
    upgradeRequired: boolean;
    recommendation?: string;
    details: any;
  }> {
    const features = this.deriveEligibilityFeatures(request.journeyType, request.features, request.complexity);

    const normalizedJourney: 'non-tech' | 'business' | 'technical' =
      request.journeyType === 'business'
        ? 'business'
        : request.journeyType === 'non-tech'
          ? 'non-tech'
          : 'technical';

    const dataSizeMB = request.dataSizeMB ?? (typeof request.dataVolume === 'number' ? request.dataVolume * 1024 : 0);

    const eligibilityResult = await eligibilityService.checkEligibility(userId, {
      features,
      dataSizeMB,
      journeyType: normalizedJourney
    });

    const canProceed = eligibilityResult.success && eligibilityResult.eligible;
    const reason =
      canProceed
        ? undefined
        : eligibilityResult.error || eligibilityResult.blockedFeatures[0]?.reason || 'Eligibility requirements not met';

    const quotaRemaining = {
      uploads: this.calculateRemaining(
        eligibilityResult.limits.monthlyUploads,
        eligibilityResult.usage.monthlyUploads
      ),
      dataVolumeMB: this.calculateRemaining(
        eligibilityResult.limits.monthlyDataVolume,
        eligibilityResult.usage.monthlyDataVolume
      ),
      aiInsights: this.calculateRemaining(
        eligibilityResult.limits.monthlyAIInsights,
        eligibilityResult.usage.monthlyAIInsights
      )
    };

    return {
      canProceed,
      reason,
      quotaRemaining,
      upgradeRequired: eligibilityResult.blockedFeatures.some(feature => feature.upgradeRequired),
      recommendation: eligibilityResult.upgradeRecommendation,
      details: eligibilityResult
    };
  }

  private mapConsumptionType(
    consumptionType: string
  ): keyof AdminSubscriptionTierConfig['overagePricing'] | null {
    switch (consumptionType) {
      case 'data_processing':
      case 'dataPerMB':
      case 'data':
        return 'dataPerMB';
      case 'compute':
      case 'computePerMinute':
        return 'computePerMinute';
      case 'storage':
      case 'storagePerMB':
        return 'storagePerMB';
      case 'ai_query':
      case 'ai':
        return 'aiQueryCost';
      case 'visualization':
        return 'visualizationCost';
      default:
        return null;
    }
  }

  private calculateRemaining(limit: number, used: number): number {
    if (!isFinite(limit) || limit < 0) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, limit - used);
  }

  private deriveEligibilityFeatures(
    journeyType: string,
    requested?: string[],
    complexity?: string
  ): EligibilityFeatureName[] {
    const validFeatures: EligibilityFeatureName[] = [
      'preparation',
      'data_processing',
      'analysis',
      'visualization',
      'ai_insights'
    ];

    const aliasMap: Record<string, EligibilityFeatureName> = {
      data_upload: 'preparation',
      data_transformation: 'data_processing',
      data_processing: 'data_processing',
      statistical_analysis: 'analysis',
      machine_learning: 'analysis',
      business_intelligence: 'analysis',
      visualization: 'visualization',
      visualizations: 'visualization',
      big_data: 'data_processing',
      ai_insights: 'ai_insights',
      llm_fine_tuning: 'ai_insights'
    };

    const collected = new Set<EligibilityFeatureName>();

    (requested ?? []).forEach(feature => {
      const normalized = aliasMap[feature] ?? (validFeatures.includes(feature as EligibilityFeatureName)
        ? (feature as EligibilityFeatureName)
        : undefined);
      if (normalized) {
        collected.add(normalized);
      }
    });

    if (collected.size === 0) {
      switch (journeyType) {
        case 'business':
          collected.add('preparation');
          collected.add('analysis');
          collected.add('visualization');
          break;
        case 'non-tech':
          collected.add('preparation');
          collected.add('analysis');
          break;
        case 'custom':
        case 'technical':
        default:
          collected.add('analysis');
          collected.add('data_processing');
          break;
      }
    }

    if (complexity === 'advanced') {
      collected.add('ai_insights');
    }

    return Array.from(collected);
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
      const result = await db.transaction(async (tx: typeof db) => {
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
   * Create Stripe Checkout Session for one-off payment
   */
  async createCheckoutSession(
    projectId: string,
    userId: string,
    amount: number,
    currency: string = 'usd',
    metadata: Record<string, string> = {}
  ): Promise<{ sessionId: string; url: string }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await this.stripe.customers.create({
          email: user.email,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
          metadata: { userId },
        });
        customerId = customer.id;

        // Update user with new customer ID
        await db.update(users)
          .set({ stripeCustomerId: customerId })
          .where(eq(users.id, userId));
      }

      // Get journey type from project for proper redirect back to journey
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      const journeyType = (project as any)?.journeyType || 'non-tech';

      // CRITICAL FIX: Redirect back to journey pricing step instead of project page
      // This ensures the payment success handler in pricing-step.tsx is triggered
      const baseUrl = process.env.APP_URL || 'http://localhost:5000';
      const successUrl = `${baseUrl}/journeys/${journeyType}/pricing?projectId=${projectId}&payment=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${baseUrl}/journeys/${journeyType}/pricing?projectId=${projectId}&payment=cancelled`;

      console.log(`📍 [Checkout] Success URL: ${successUrl}`);
      console.log(`📍 [Checkout] Cancel URL: ${cancelUrl}`);

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: 'Analysis Project Execution',
                description: `Payment for project ${projectId}`,
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          projectId,
          userId,
          type: 'one_off_analysis',
          journeyType, // Store for potential recovery
          ...metadata
        },
      });

      if (!session.url) {
        throw new Error('Failed to generate checkout URL');
      }

      return {
        sessionId: session.id,
        url: session.url
      };
    } catch (error: any) {
      console.error('Create checkout session error:', error);
      throw error;
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

      await db.transaction(async (tx: typeof db) => {
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

      await db.transaction(async (tx: typeof db) => {
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
  ): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
    try {
      // Verify webhook signature (SECURITY)
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      // ==========================================
      // IDEMPOTENCY CHECK
      // ==========================================
      // Prevent duplicate processing when Stripe retries webhooks
      if (this.processedWebhooks.has(event.id)) {
        console.log(`⚠️ [Webhook] Event ${event.id} already processed, skipping`);
        return { success: true, skipped: true };
      }

      console.log(`🔔 [Webhook] Processing: ${event.type} (ID: ${event.id})`);

      // P0-A FIX: Mark as processing BEFORE transaction to prevent concurrent duplicates
      this.processedWebhooks.add(event.id);

      // Process event within transaction
      try {
      await db.transaction(async (tx: typeof db) => {
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

          // ✅ FIX: Add missing event handlers
          case 'checkout.session.completed':
            await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session, tx);
            break;

          case 'charge.refunded':
            await this.handleChargeRefunded(event.data.object as Stripe.Charge, tx);
            break;

          case 'customer.deleted':
            await this.handleCustomerDeleted(event.data.object as Stripe.Customer, tx);
            break;

          default:
            console.log(`ℹ️ [Webhook] Unhandled event type: ${event.type}`);
        }
      });
      } catch (txError: any) {
        // P0-A FIX: On transaction failure, remove from processed set so retry can succeed
        this.processedWebhooks.delete(event.id);
        throw txError;
      }

      // Cleanup old entries to prevent memory growth
      if (this.processedWebhooks.size > this.MAX_PROCESSED_WEBHOOKS) {
        const entriesToRemove = Array.from(this.processedWebhooks).slice(0, this.MAX_PROCESSED_WEBHOOKS / 2);
        entriesToRemove.forEach(id => this.processedWebhooks.delete(id));
        console.log(`🧹 [Webhook] Cleaned up ${entriesToRemove.length} old webhook entries`);
      }

      console.log(`✅ [Webhook] Successfully processed: ${event.type}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ [Webhook] Processing error:', error);
      return { success: false, error: error.message };
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription, tx: any): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (!userId) return;

    // PHASE 11 FIX: Extract subscription tier from metadata or Stripe product
    // The tier is stored in subscription.metadata.tierId when created via /api/pricing/subscription
    const tierId = subscription.metadata?.tierId ||
                   subscription.metadata?.tier ||
                   subscription.metadata?.planType;

    const updateData: any = {
      subscriptionStatus: subscription.status as SubscriptionStatus,
      subscriptionExpiresAt: new Date((subscription as any).current_period_end * 1000),
      stripeSubscriptionId: subscription.id,
      updatedAt: new Date(),
    };

    // Update tier if available from metadata
    if (tierId) {
      updateData.subscriptionTier = tierId;
      console.log(`✅ [Webhook] Updated subscription tier to: ${tierId}`);
    } else {
      // Try to extract tier from the price/product if metadata missing
      const priceId = subscription.items.data[0]?.price?.id;
      if (priceId) {
        // Look up tier by stripe price ID in database
        const [matchingTier] = await tx
          .select()
          .from(subscriptionTierPricing)
          .where(
            sql`${subscriptionTierPricing.stripeMonthlyPriceId} = ${priceId} OR ${subscriptionTierPricing.stripeYearlyPriceId} = ${priceId}`
          );

        if (matchingTier) {
          updateData.subscriptionTier = matchingTier.id;
          console.log(`✅ [Webhook] Resolved tier from price ID: ${matchingTier.id}`);
        }
      }
    }

    await tx.update(users)
      .set(updateData)
      .where(eq(users.id, userId));
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription, tx: any): Promise<void> {
    const userId = subscription.metadata?.userId;
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

  // ✅ FIX: Add missing webhook handlers

  /**
   * Handle checkout session completed (one-off payments)
   * Marks projects as paid after successful checkout
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session, tx: any): Promise<void> {
    const projectId = session.metadata?.projectId;
    const userId = session.metadata?.userId;

    if (!projectId || !userId) {
      console.log(`ℹ️ [Webhook] Checkout session completed but no project/user metadata`);
      return;
    }

    console.log(`✅ [Webhook] Checkout completed for project ${projectId}`);

    // Update project as paid
    const { projects } = await import('../../../shared/schema');
    await tx.update(projects)
      .set({
        isPaid: true,
        paymentIntentId: session.payment_intent as string || session.id,
        upgradedAt: new Date(),
      } as any)
      .where(eq(projects.id, projectId));

    console.log(`💳 [Webhook] Project ${projectId} marked as paid`);
  }

  /**
   * Handle charge refunded
   * Logs refund and optionally revokes access
   */
  private async handleChargeRefunded(charge: Stripe.Charge, tx: any): Promise<void> {
    const customerId = charge.customer as string;
    if (!customerId) return;

    console.log(`💰 [Webhook] Charge refunded for customer ${customerId}`);
    console.log(`   Amount refunded: $${(charge.amount_refunded / 100).toFixed(2)}`);

    // Note: For subscription refunds, we typically don't revoke access immediately
    // as the refund might be partial or for a specific billing period
    // This could be extended to revoke access for project-specific refunds if needed
  }

  /**
   * Handle customer deleted
   * Cleans up user Stripe association
   */
  private async handleCustomerDeleted(customer: Stripe.Customer, tx: any): Promise<void> {
    const customerId = customer.id;

    const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customerId));
    if (!user) return;

    console.log(`🗑️ [Webhook] Stripe customer ${customerId} deleted, cleaning up user ${user.id}`);

    await tx.update(users)
      .set({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        subscriptionStatus: 'inactive',
        subscriptionTier: 'none',
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  // ==========================================
  // USAGE TRACKING & QUOTA MANAGEMENT
  // ==========================================

  /**
   * Check if user can access a specific journey type based on subscription tier
   */
  async canAccessJourney(
    userId: string,
    journeyType: JourneyType
  ): Promise<{
    allowed: boolean;
    requiresUpgrade: boolean;
    message?: string;
    minimumTier?: string;
  }> {
    try {
      // Get user with subscription details
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return {
          allowed: false,
          requiresUpgrade: false,
          message: 'User not found'
        };
      }

      // Get tier configuration
      const tierConfig = this.getTierConfig(user.subscriptionTier as SubscriptionTier);
      if (!tierConfig) {
        // Check if user has trial credits before rejecting
        const trialCredits = (user as any).trialCredits ?? 100;
        const trialCreditsUsed = (user as any).trialCreditsUsed ?? 0;
        const available = trialCredits - trialCreditsUsed;
        const expireAt = (user as any).trialCreditsExpireAt;
        const isExpired = expireAt && new Date(expireAt) < new Date();

        if (available > 0 && !isExpired) {
          // Trial credits available - allow access to non-tech and business journeys
          const trialJourneys: JourneyType[] = ['non-tech', 'business'];
          if (trialJourneys.includes(journeyType)) {
            console.log(`✅ [Billing] User ${userId} granted journey access via trial credits (${available} remaining)`);
            return {
              allowed: true,
              requiresUpgrade: false,
              message: 'Access granted via trial credits'
            };
          }
        }

        return {
          allowed: false,
          requiresUpgrade: true,
          message: 'Invalid subscription tier',
          minimumTier: 'trial'
        };
      }

      // Check if journey type is allowed
      const allowed = tierConfig.quotas.allowedJourneys.includes(journeyType);

      if (allowed) {
        return {
          allowed: true,
          requiresUpgrade: false
        };
      }

      const bypassBilling =
        process.env.CHIMARI_BILLING_BYPASS === 'true' || process.env.NODE_ENV !== 'production';

      if (!allowed && bypassBilling) {
        console.warn(
          `[Billing] Bypassing journey access requirements for ${journeyType} (tier: ${user.subscriptionTier})`
        );
        return {
          allowed: true,
          requiresUpgrade: false,
          message: 'Development bypass applied'
        };
      }

      // Determine minimum tier needed
      let minimumTier = 'starter';
      if (journeyType === 'technical') {
        minimumTier = 'professional';
      } else if (journeyType === 'consultation') {
        minimumTier = 'enterprise';
      } else if (journeyType === 'business') {
        minimumTier = 'starter';
      }

      return {
        allowed: false,
        requiresUpgrade: true,
        message: `${journeyType} journey requires ${minimumTier} tier or higher`,
        minimumTier
      };
    } catch (error: any) {
      console.error('Error checking journey access:', error);
      return {
        allowed: false,
        requiresUpgrade: false,
        message: `Error checking access: ${error.message}`
      };
    }
  }

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
      await this.ensureConfigurationsLoaded();
      return await db.transaction(async (tx: typeof db) => {
        // Lock user row to guarantee atomic updates under concurrency
        await tx.execute(sql`SELECT ${users.id} FROM ${users} WHERE ${users.id} = ${userId} FOR UPDATE`);

        // Get user with subscription details using camelCase mapping
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
        // Map analysis types to statistical_analysis feature if not explicitly defined
        const mappedFeatureId = this.mapAnalysisTypeToFeature(featureId);
        let featureQuotas = tierConfig.quotas.featureQuotas[mappedFeatureId];

        // If feature quotas not in tier config, check default quotas for the tier
        if (!featureQuotas) {
          const tierDefaults = this.featureQuotaDefaults[user.subscriptionTier || 'trial'];
          const baseDefaults = this.featureQuotaDefaults.default;
          featureQuotas = tierDefaults?.[mappedFeatureId] || baseDefaults?.[mappedFeatureId];

          if (!featureQuotas) {
            return { allowed: false, cost: 0, remainingQuota: 0, message: 'Feature not available for tier' };
          }
        }

        const quota = featureQuotas[complexity] ?? featureQuotas['small'] ?? 0;
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
          // FIX: Use mappedFeatureId (not featureId) to lookup overage pricing
          // This ensures 'correlation', 'statistical', etc. map to 'statistical_analysis' pricing
          const overagePricing = tierConfig.overagePricing.featureOveragePricing[mappedFeatureId]
            || tierConfig.overagePricing.featureOveragePricing[featureId];

          if (!overagePricing) {
            // FIX: Calculate overage cost from PRICING_CONSTANTS if no tier-specific pricing
            // Instead of returning $0.00, use base pricing as fallback
            const fallbackCost = 1.00 * overageQuantity; // $1.00 base overage per unit
            console.log(`⚠️ [Billing] No overage pricing for ${mappedFeatureId}, using fallback: $${fallbackCost.toFixed(2)}`);
            return {
              allowed: false,
              cost: fallbackCost,
              remainingQuota: 0,
              message: `Quota exceeded. Overage charge: $${fallbackCost.toFixed(2)}`,
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
      await this.ensureConfigurationsLoaded();
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;

      const userTier = (user.subscriptionTier || 'trial') as SubscriptionTier;
      const tierConfig = this.getTierConfig(userTier);

      // Get quota from tier config, or fallback to hardcoded defaults
      let quota = 0;
      if (tierConfig) {
        const featureQuotas = tierConfig.quotas.featureQuotas[featureId];
        quota = featureQuotas?.[complexity] || 0;
      }

      // Fallback: Use featureQuotaDefaults if tier config missing or quota is 0
      if (quota === 0) {
        const tierDefaults = this.featureQuotaDefaults[userTier] || this.featureQuotaDefaults.default;
        const featureDefaults = tierDefaults?.[featureId];
        if (featureDefaults) {
          quota = featureDefaults[complexity] || 0;
        }
        // Final fallback for trial users: ensure at least small analyses available
        if (quota === 0 && complexity === 'small' && (userTier === 'trial' || !tierConfig)) {
          quota = this.featureQuotaDefaults.trial?.[featureId]?.small || 3;
        }
      }

      const subscriptionBalances = user.subscriptionBalances as any || {};
      const featureBalances = subscriptionBalances[featureId] || {};
      const complexityBalance = featureBalances[complexity] || { used: 0, remaining: quota, limit: quota };

      const used = complexityBalance.used || 0;
      const remaining = quota === -1 ? -1 : Math.max(0, quota - used);
      const percentUsed = quota === -1 ? 0 : (quota > 0 ? Math.min(100, (used / quota) * 100) : 0);
      const isExceeded = quota !== -1 && quota > 0 && used >= quota;

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

  // ==========================================
  // TRIAL CREDITS SYSTEM
  // ==========================================

  /**
   * Check if user has sufficient trial credits for an analysis
   * Credits are used when user has no paid subscription
   *
   * Credit calculation:
   * - Small complexity: 10 credits
   * - Medium complexity: 25 credits
   * - Large complexity: 50 credits
   * - Extra large complexity: 100 credits
   */
  async checkTrialCredits(userId: string, requiredCredits: number): Promise<{
    hasCredits: boolean;
    remaining: number;
    required: number;
    expired: boolean;
  }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return { hasCredits: false, remaining: 0, required: requiredCredits, expired: false };
      }

      const totalCredits = (user as any).trialCredits || 100; // Default 100 credits for new users
      const usedCredits = (user as any).trialCreditsUsed || 0;
      const remaining = Math.max(0, totalCredits - usedCredits);

      // Check if credits have expired
      const expireAt = (user as any).trialCreditsExpireAt;
      const expired = expireAt ? new Date(expireAt) < new Date() : false;

      return {
        hasCredits: !expired && remaining >= requiredCredits,
        remaining,
        required: requiredCredits,
        expired
      };
    } catch (error: any) {
      console.error('Check trial credits error:', error);
      return { hasCredits: false, remaining: 0, required: requiredCredits, expired: false };
    }
  }

  /**
   * Deduct trial credits after successful analysis execution
   *
   * TRANSACTION-SAFE: Updates credits atomically
   */
  async deductTrialCredits(userId: string, credits: number): Promise<{
    success: boolean;
    newBalance: number;
    message?: string;
  }> {
    try {
      return await db.transaction(async (tx: typeof db) => {
        // Lock user row for atomic update
        await tx.execute(sql`SELECT ${users.id} FROM ${users} WHERE ${users.id} = ${userId} FOR UPDATE`);

        const [user] = await tx.select().from(users).where(eq(users.id, userId));
        if (!user) {
          return { success: false, newBalance: 0, message: 'User not found' };
        }

        const totalCredits = (user as any).trialCredits || 100;
        const usedCredits = (user as any).trialCreditsUsed || 0;
        const remaining = totalCredits - usedCredits;

        if (remaining < credits) {
          return {
            success: false,
            newBalance: remaining,
            message: `Insufficient credits. Required: ${credits}, Available: ${remaining}`
          };
        }

        const newUsed = usedCredits + credits;

        await tx.update(users)
          .set({
            trialCreditsUsed: newUsed,
            updatedAt: new Date(),
          } as any)
          .where(eq(users.id, userId));

        console.log(`💳 [Trial Credits] Deducted ${credits} credits from user ${userId}. New balance: ${totalCredits - newUsed}`);

        return {
          success: true,
          newBalance: totalCredits - newUsed
        };
      });
    } catch (error: any) {
      console.error('Deduct trial credits error:', error);
      return { success: false, newBalance: 0, message: error.message };
    }
  }

  /**
   * Get trial credits status for a user
   */
  async getTrialCreditsStatus(userId: string): Promise<{
    total: number;
    used: number;
    remaining: number;
    percentUsed: number;
    expired: boolean;
    expiresAt: Date | null;
  } | null> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) return null;

      const total = (user as any).trialCredits || 100;
      const used = (user as any).trialCreditsUsed || 0;
      const remaining = Math.max(0, total - used);
      const expireAt = (user as any).trialCreditsExpireAt;
      const expired = expireAt ? new Date(expireAt) < new Date() : false;

      return {
        total,
        used,
        remaining,
        percentUsed: total > 0 ? Math.min(100, (used / total) * 100) : 0,
        expired,
        expiresAt: expireAt ? new Date(expireAt) : null
      };
    } catch (error: any) {
      console.error('Get trial credits status error:', error);
      return null;
    }
  }

  /**
   * Calculate credits required for an analysis based on complexity
   */
  calculateCreditsRequired(complexity: FeatureComplexity, analysisCount: number = 1): number {
    const creditCosts: Record<FeatureComplexity, number> = {
      small: 10,
      medium: 25,
      large: 50,
      extra_large: 100
    };
    return (creditCosts[complexity] || 10) * analysisCount;
  }

  /**
   * Initialize trial credits for a new user
   * Called during user registration
   */
  async initializeTrialCredits(userId: string, credits: number = 100): Promise<boolean> {
    try {
      // Set expiration to 30 days from now
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await db.update(users)
        .set({
          trialCredits: credits,
          trialCreditsUsed: 0,
          trialCreditsRefreshedAt: new Date(),
          trialCreditsExpireAt: expiresAt,
          updatedAt: new Date(),
        } as any)
        .where(eq(users.id, userId));

      console.log(`🎁 [Trial Credits] Initialized ${credits} credits for user ${userId}, expires ${expiresAt.toISOString()}`);
      return true;
    } catch (error: any) {
      console.error('Initialize trial credits error:', error);
      return false;
    }
  }

  /**
   * Get usage metrics for a user
   */
  async getUsageMetrics(userId: string, period?: { start: Date; end: Date }): Promise<UsageMetrics | null> {
    try {
      await this.ensureConfigurationsLoaded();
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

      // Calculate actual overage costs from subscription balances
      // Note: Convert null to undefined for type compatibility
      const overageResult = await this.calculateAccumulatedOverage(userId, tierConfig ?? undefined);
      const overageCosts = overageResult.totalOverage;
      const featureCosts = 0; // Feature costs are included in overage
      const campaignDiscounts = 0; // TODO: Apply active campaigns

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
      await this.ensureConfigurationsLoaded();
      await db.transaction(async (tx: typeof db) => {
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
  // OVERAGE TRACKING & BILLING
  // ==========================================

  /**
   * Calculate accumulated overage charges for a user
   * Checks all feature usage against quotas and calculates total overage
   */
  async calculateAccumulatedOverage(userId: string, tierConfig?: AdminSubscriptionTierConfig): Promise<{
    hasOverage: boolean;
    charges: Array<{
      featureId: string;
      complexity: FeatureComplexity;
      quotaLimit: number;
      used: number;
      overage: number;
      rate: number;
      cost: number;
    }>;
    totalOverage: number;
  }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        return { hasOverage: false, charges: [], totalOverage: 0 };
      }

      const config = tierConfig || this.getTierConfig(user.subscriptionTier as SubscriptionTier);
      if (!config) {
        return { hasOverage: false, charges: [], totalOverage: 0 };
      }

      const subscriptionBalances = user.subscriptionBalances as any || {};
      const charges: Array<{
        featureId: string;
        complexity: FeatureComplexity;
        quotaLimit: number;
        used: number;
        overage: number;
        rate: number;
        cost: number;
      }> = [];

      // Check each feature in subscription balances
      for (const [featureId, complexityBalances] of Object.entries(subscriptionBalances)) {
        const featureQuotas = config.quotas.featureQuotas[featureId];
        const featureOveragePricing = config.overagePricing.featureOveragePricing[featureId];

        if (!featureQuotas || !featureOveragePricing) continue;

        // Check each complexity level
        for (const complexity of this.featureComplexityLevels) {
          const balance = (complexityBalances as any)[complexity];
          if (!balance) continue;

          const quota = featureQuotas[complexity] || 0;
          const used = balance.used || 0;

          // Skip unlimited quotas
          if (quota === -1) continue;

          // Check for overage
          if (used > quota) {
            const overage = used - quota;
            const rate = featureOveragePricing[complexity] || 0;
            const cost = overage * rate;

            if (cost > 0) {
              charges.push({
                featureId,
                complexity,
                quotaLimit: quota,
                used,
                overage,
                rate,
                cost
              });
            }
          }
        }
      }

      // Also check legacy usage fields
      const legacyOverage = this.calculateLegacyOverage(user, config);
      charges.push(...legacyOverage);

      const totalOverage = charges.reduce((sum, c) => sum + c.cost, 0);

      return {
        hasOverage: totalOverage > 0,
        charges,
        totalOverage
      };
    } catch (error: any) {
      console.error('Calculate accumulated overage error:', error);
      return { hasOverage: false, charges: [], totalOverage: 0 };
    }
  }

  /**
   * Calculate overage from legacy usage tracking fields
   */
  private calculateLegacyOverage(user: any, tierConfig: AdminSubscriptionTierConfig): Array<{
    featureId: string;
    complexity: FeatureComplexity;
    quotaLimit: number;
    used: number;
    overage: number;
    rate: number;
    cost: number;
  }> {
    const charges: Array<{
      featureId: string;
      complexity: FeatureComplexity;
      quotaLimit: number;
      used: number;
      overage: number;
      rate: number;
      cost: number;
    }> = [];

    // Check data uploads
    const dataUsed = user.monthlyDataVolume || 0;
    const dataLimit = tierConfig.quotas.maxDataUploadsMB;
    if (dataUsed > dataLimit && dataLimit !== -1) {
      const overage = dataUsed - dataLimit;
      const rate = tierConfig.overagePricing.dataPerMB;
      charges.push({
        featureId: 'data_upload_legacy',
        complexity: 'small',
        quotaLimit: dataLimit,
        used: dataUsed,
        overage,
        rate,
        cost: overage * rate
      });
    }

    // Check AI queries
    const aiUsed = user.monthlyAIInsights || 0;
    const aiLimit = tierConfig.quotas.maxAIQueries;
    if (aiUsed > aiLimit && aiLimit !== -1) {
      const overage = aiUsed - aiLimit;
      const rate = tierConfig.overagePricing.aiQueryCost;
      charges.push({
        featureId: 'ai_query_legacy',
        complexity: 'small',
        quotaLimit: aiLimit,
        used: aiUsed,
        overage,
        rate,
        cost: overage * rate
      });
    }

    // Check visualizations
    const vizUsed = user.monthlyVisualizations || 0;
    const vizLimit = tierConfig.quotas.maxVisualizationsPerProject * (tierConfig.quotas.maxProjects || 1);
    if (vizUsed > vizLimit && vizLimit !== -1) {
      const overage = vizUsed - vizLimit;
      const rate = tierConfig.overagePricing.visualizationCost;
      charges.push({
        featureId: 'visualization_legacy',
        complexity: 'small',
        quotaLimit: vizLimit,
        used: vizUsed,
        overage,
        rate,
        cost: overage * rate
      });
    }

    return charges;
  }

  /**
   * Add overage charges to Stripe invoice for a user
   * Call this at the end of billing period or when user upgrades
   */
  async addOverageToStripeInvoice(userId: string): Promise<{
    success: boolean;
    invoiceItemIds?: string[];
    totalCharged?: number;
    error?: string;
  }> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user || !user.stripeCustomerId) {
        return { success: false, error: 'User has no Stripe customer ID' };
      }

      const overageResult = await this.calculateAccumulatedOverage(userId);
      if (!overageResult.hasOverage) {
        return { success: true, invoiceItemIds: [], totalCharged: 0 };
      }

      const invoiceItemIds: string[] = [];
      let totalCharged = 0;

      for (const charge of overageResult.charges) {
        if (charge.cost <= 0) continue;

        try {
          // Create invoice item in Stripe
          const invoiceItem = await this.stripe.invoiceItems.create({
            customer: user.stripeCustomerId,
            amount: Math.round(charge.cost * 100), // Convert to cents
            currency: 'usd',
            description: `Overage: ${charge.featureId} (${charge.complexity}) - ${charge.overage} units at $${charge.rate.toFixed(4)}/unit`
          });

          invoiceItemIds.push(invoiceItem.id);
          totalCharged += charge.cost;

          console.log(`💰 [Overage] Added ${charge.featureId} overage charge: $${charge.cost.toFixed(2)} for user ${userId}`);
        } catch (stripeError: any) {
          console.error(`Failed to add overage item to Stripe: ${stripeError.message}`);
        }
      }

      return {
        success: true,
        invoiceItemIds,
        totalCharged
      };
    } catch (error: any) {
      console.error('Add overage to Stripe invoice error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get overage summary for display in UI
   */
  async getOverageSummary(userId: string): Promise<{
    hasOverage: boolean;
    totalOverage: number;
    charges: Array<{
      feature: string;
      complexity: string;
      overage: number;
      cost: number;
    }>;
    message?: string;
  }> {
    const result = await this.calculateAccumulatedOverage(userId);

    return {
      hasOverage: result.hasOverage,
      totalOverage: result.totalOverage,
      charges: result.charges.map(c => ({
        feature: c.featureId,
        complexity: c.complexity,
        overage: c.overage,
        cost: c.cost
      })),
      message: result.hasOverage
        ? `You have $${result.totalOverage.toFixed(2)} in overage charges that will be added to your next invoice.`
        : undefined
    };
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
   * ✅ PHASE 3 FIX: Return { success: true, billing: {...} } structure
   * Route at billing.ts:320 checks result.success - was returning 400 because success was undefined
   */
  async calculateBillingWithCapacity(userId: string, usage: any): Promise<any> {
    await this.ensureConfigurationsLoaded();
    const userTier = await this.getUserTier(userId);
    const usageMetrics = await this.getUsageMetricsSimple(userId);
    const tierConfig = this.getTierConfig(userTier);

    // Calculate actual billing based on usage
    // Note: tierConfig.pricing has { monthly, yearly, currency } - use monthly as base
    const baseCost = tierConfig?.pricing?.monthly || 0;
    const datasetSizeMB = usage?.datasetSizeMB || 0;
    const dataCost = datasetSizeMB * 0.01; // $0.01 per MB
    const finalCost = Math.max(baseCost + dataCost, 0);

    const capacityUsed = (usageMetrics as any)?.totalDataUsageMB || 0;
    const capacityLimit = tierConfig?.quotas?.maxDataUploadsMB || 1000;
    const capacityRemaining = Math.max(0, capacityLimit - capacityUsed);

    console.log(`✅ [Billing] Returning success=true with billing structure for user ${userId}`);

    return {
      success: true,  // ✅ ADD: Required by billing.ts:320
      billing: {
        baseCost,
        dataCost,
        finalCost,
        subscriptionCredits: 0,
        capacityUsed,
        capacityRemaining,
        utilizationPercentage: {
          data: capacityLimit > 0 ? (capacityUsed / capacityLimit) * 100 : 0
        },
        breakdown: [
          { item: 'Base platform fee', cost: baseCost, capacityUsed: 0, capacityRemaining: capacityRemaining },
          { item: `Data processing (${datasetSizeMB} MB)`, cost: dataCost, capacityUsed: datasetSizeMB, capacityRemaining: capacityRemaining - datasetSizeMB }
        ]
      },
      // Legacy fields for backwards compatibility
      userId,
      tier: userTier,
      usage: usageMetrics,
      cost: finalCost,
      capacityUsed,
      capacityLimit
    };
  }

  /**
   * Get user capacity summary (for compatibility)
   */
  async getUserCapacitySummary(userId: string): Promise<any> {
    await this.ensureConfigurationsLoaded();
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
    await this.ensureConfigurationsLoaded();
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
    await this.ensureConfigurationsLoaded();
    await this.trackFeatureUsage(userId, 'data_upload', 'small', usage.dataSizeMB || 0);
  }

  /**
   * Get user by ID
   */
  async getUser(userId: string): Promise<any> {
    const { storage } = await import('../../storage');
    const user = await storage.getUser(userId);
    if (!user) {
      return {
        id: userId,
        subscriptionTier: 'trial',
        email: 'user@example.com'
      };
    }
    return user;
  }

  /**
   * Get user usage by ID
   */
  async getUserUsage(userId: string): Promise<any> {
    try {
      const usage = await UsageTrackingService.getCurrentUsage(userId);
      return {
        dataUploadsMB: usage.dataVolumeMB || 0,
        toolExecutions: usage.codeGenerations || 0,
        aiQueries: usage.aiQueries || 0
      };
    } catch (error) {
      console.error('Failed to fetch user usage:', error);
      return { dataUploadsMB: 0, toolExecutions: 0, aiQueries: 0 };
    }
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
    try {
      const usage = await UsageTrackingService.getCurrentUsage(userId);
      return {
        totalDataUsageMB: usage.dataVolumeMB || 0,
        totalToolExecutions: usage.codeGenerations || 0,
        totalAIQueries: usage.aiQueries || 0
      };
    } catch (error) {
      console.error('Failed to fetch usage metrics:', error);
      return { totalDataUsageMB: 0, totalToolExecutions: 0, totalAIQueries: 0 };
    }
  }

  /**
   * Get ML/LLM usage summary for user
   */
  async getMLUsageSummary(userId: string): Promise<any> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const mlUsage = await mlLLMUsageTracker.getUserUsage(
        userId,
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
      return await mlLLMUsageTracker.checkMLTrainingQuota(userId, userTier);
    } else if (toolName === 'automl_optimizer') {
      return await mlLLMUsageTracker.checkAutoMLQuota(userId, userTier);
    }
    return { allowed: true };
  }

  /**
   * Check LLM quota before execution
   */
  private async checkLLMQuota(userId: string, toolName: string, userTier: string): Promise<any> {
    if (toolName.includes('llm')) {
      return await mlLLMUsageTracker.checkLLMFineTuningQuota(userId, userTier);
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
        userId: event.userId,
        projectId: event.projectId,
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
  private getTierConfigByString(tier: string): LegacyTierPricing | undefined {
    return this.legacyConfig.tiers.find(t => t.id === tier);
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
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'stripe_test_key_placeholder';
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder';

    // Log warning if using development keys
    if (stripeSecretKey === 'stripe_test_key_placeholder') {
      console.warn('⚠️  Using development Stripe key. Set STRIPE_SECRET_KEY for production.');
    }

    billingService = new UnifiedBillingService({
      stripeSecretKey,
      webhookSecret,
    });
  }
  return billingService;
}
