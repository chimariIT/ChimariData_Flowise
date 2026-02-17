/**
 * @deprecated P2-5: This file is LEGACY. Use server/services/billing/unified-billing-service.ts instead.
 * This enhanced feature billing service should be migrated to the unified service.
 * All new billing code should go into unified-billing-service.ts.
 */
// Enhanced Feature-Based Billing Service
// Integrates with the new feature complexity system and adaptive billing

import { storage } from './storage';
import { users } from '@shared/schema';
import { 
  FeatureDefinition, 
  FeatureComplexity, 
  getFeatureDefinition, 
  calculateFeatureCost,
  calculateFeatureResourceUsage 
} from '@shared/feature-definitions';
import { 
  EnhancedSubscriptionTier, 
  getEnhancedTierLimits, 
  getFeatureLimit, 
  canUseFeature,
  calculateFeatureUsageCost 
} from '@shared/enhanced-subscription-tiers';

type User = typeof users.$inferSelect;

interface FeatureUsage {
  featureId: string;
  complexity: FeatureComplexity;
  quantity: number;
  timestamp: Date;
  userId: string;
  projectId?: string;
  metadata?: Record<string, any>;
}

interface FeatureUsageSummary {
  featureId: string;
  complexity: FeatureComplexity;
  totalUsage: number;
  monthlyUsage: number;
  lastUsed: Date;
  cost: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
  };
}

interface FeatureBillingCalculation {
  baseCost: number;
  subscriptionCredits: number;
  overageCost: number;
  finalCost: number;
  breakdown: Array<{
    featureId: string;
    complexity: FeatureComplexity;
    quantity: number;
    unitCost: number;
    totalCost: number;
    subscriptionCoverage: number;
    overageCost: number;
  }>;
  resourceUsage: {
    totalCpu: number;
    totalMemory: number;
    totalStorage: number;
  };
}

export class EnhancedFeatureBillingService {
  private static instance: EnhancedFeatureBillingService;

  public static getInstance(): EnhancedFeatureBillingService {
    if (!EnhancedFeatureBillingService.instance) {
      EnhancedFeatureBillingService.instance = new EnhancedFeatureBillingService();
    }
    return EnhancedFeatureBillingService.instance;
  }

  // Record feature usage
  async recordFeatureUsage(usage: FeatureUsage): Promise<{ success: boolean; error?: string }> {
    try {
      // This would integrate with your existing usage tracking system
      // For now, we'll simulate the storage
      console.log('📊 Recording feature usage:', usage);
      
      // In a real implementation, you would:
      // 1. Store usage in database
      // 2. Update user's monthly usage counters
      // 3. Trigger billing calculations if needed
      // 4. Send notifications for limit warnings
      
      return { success: true };
    } catch (error) {
      console.error('Error recording feature usage:', error);
      return { success: false, error: 'Failed to record usage' };
    }
  }

  // Check if user can use a feature
  async canUserUseFeature(
    userId: string,
    featureId: string,
    complexity: FeatureComplexity,
    quantity: number = 1
  ): Promise<{ allowed: boolean; reason?: string; limit?: number; currentUsage?: number }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { allowed: false, reason: 'User not found' };
      }

      const tierId = user.subscriptionTier || 'trial';
      const currentUsage = await this.getCurrentFeatureUsage(userId, featureId, complexity);
      
      const canUse = canUseFeature(tierId, featureId, complexity, currentUsage);
      
      if (!canUse.allowed) {
        return {
          allowed: false,
          reason: canUse.reason,
          limit: canUse.limit,
          currentUsage
        };
      }

      // Check if the requested quantity would exceed limits
      if (canUse.limit && (currentUsage + quantity) > canUse.limit) {
        return {
          allowed: false,
          reason: `Requested quantity (${quantity}) would exceed monthly limit (${canUse.limit - currentUsage} remaining)`,
          limit: canUse.limit,
          currentUsage
        };
      }

      return {
        allowed: true,
        limit: canUse.limit,
        currentUsage
      };
    } catch (error) {
      console.error('Error checking feature usage:', error);
      return { allowed: false, reason: 'Error checking usage limits' };
    }
  }

  // Get current usage for a specific feature and complexity
  async getCurrentFeatureUsage(
    userId: string,
    featureId: string,
    complexity: FeatureComplexity
  ): Promise<number> {
    try {
      // This would query your usage tracking database
      // For now, return 0 as a placeholder
      // In real implementation, you would:
      // 1. Query usage table for current month
      // 2. Filter by userId, featureId, complexity
      // 3. Sum the quantities
      
      return 0; // Placeholder
    } catch (error) {
      console.error('Error getting current feature usage:', error);
      return 0;
    }
  }

  // Calculate billing for feature usage
  async calculateFeatureBilling(
    userId: string,
    featureUsages: Array<{
      featureId: string;
      complexity: FeatureComplexity;
      quantity: number;
    }>
  ): Promise<{ success: boolean; billing?: FeatureBillingCalculation; error?: string }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const tierId = user.subscriptionTier || 'trial';
      const tier = getEnhancedTierLimits(tierId);
      if (!tier) {
        return { success: false, error: 'Invalid subscription tier' };
      }

      let baseCost = 0;
      let subscriptionCredits = 0;
      let overageCost = 0;
      const breakdown: Array<{
        featureId: string;
        complexity: FeatureComplexity;
        quantity: number;
        unitCost: number;
        totalCost: number;
        subscriptionCoverage: number;
        overageCost: number;
      }> = [];

      let totalCpu = 0;
      let totalMemory = 0;
      let totalStorage = 0;

      for (const usage of featureUsages) {
        const featureDef = getFeatureDefinition(usage.featureId);
        if (!featureDef) continue;

        const complexityConfig = featureDef.complexities[usage.complexity];
        if (!complexityConfig) continue;

        const unitCost = complexityConfig.processingCost;
        const totalCost = unitCost * usage.quantity;
        baseCost += totalCost;

        // Calculate resource usage
        const resourceUsage = calculateFeatureResourceUsage(
          usage.featureId,
          usage.complexity,
          usage.quantity
        );
        totalCpu += resourceUsage.cpu;
        totalMemory += resourceUsage.memory;
        totalStorage += resourceUsage.storage;

        // Check if this usage is covered by subscription
        const featureLimit = getFeatureLimit(tierId, usage.featureId);
        if (featureLimit && featureLimit.enabled) {
          const currentUsage = await this.getCurrentFeatureUsage(userId, usage.featureId, usage.complexity);
          const monthlyLimit = featureLimit.monthlyLimits[usage.complexity];
          
          const coveredQuantity = Math.min(usage.quantity, Math.max(0, monthlyLimit - currentUsage));
          const overageQuantity = Math.max(0, usage.quantity - coveredQuantity);
          
          const subscriptionCoverage = coveredQuantity * unitCost;
          const usageOverageCost = overageQuantity * unitCost;
          
          subscriptionCredits += subscriptionCoverage;
          overageCost += usageOverageCost;

          breakdown.push({
            featureId: usage.featureId,
            complexity: usage.complexity,
            quantity: usage.quantity,
            unitCost,
            totalCost,
            subscriptionCoverage,
            overageCost: usageOverageCost
          });
        } else {
          // Feature not covered by subscription, full cost
          overageCost += totalCost;
          breakdown.push({
            featureId: usage.featureId,
            complexity: usage.complexity,
            quantity: usage.quantity,
            unitCost,
            totalCost,
            subscriptionCoverage: 0,
            overageCost: totalCost
          });
        }
      }

      const finalCost = Math.max(0, overageCost);

      return {
        success: true,
        billing: {
          baseCost,
          subscriptionCredits,
          overageCost,
          finalCost,
          breakdown,
          resourceUsage: {
            totalCpu,
            totalMemory,
            totalStorage
          }
        }
      };
    } catch (error) {
      console.error('Error calculating feature billing:', error);
      return { success: false, error: 'Billing calculation failed' };
    }
  }

  // Get user's feature usage summary
  async getUserFeatureUsageSummary(userId: string): Promise<{
    success: boolean;
    summary?: FeatureUsageSummary[];
    error?: string;
  }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const tierId = user.subscriptionTier || 'trial';
      const tier = getEnhancedTierLimits(tierId);
      if (!tier) {
        return { success: false, error: 'Invalid subscription tier' };
      }

      const summary: FeatureUsageSummary[] = [];

      for (const featureLimit of tier.features) {
        if (!featureLimit.enabled) continue;

        const featureDef = getFeatureDefinition(featureLimit.featureId);
        if (!featureDef) continue;

        // Get usage for each complexity level
        for (const complexity of ['small', 'medium', 'large', 'extra_large'] as FeatureComplexity[]) {
          const monthlyLimit = featureLimit.monthlyLimits[complexity];
          if (monthlyLimit === 0) continue;

          const currentUsage = await this.getCurrentFeatureUsage(userId, featureLimit.featureId, complexity);
          if (currentUsage === 0) continue;

          const complexityConfig = featureDef.complexities[complexity];
          if (!complexityConfig) continue;

          const resourceUsage = calculateFeatureResourceUsage(
            featureLimit.featureId,
            complexity,
            currentUsage
          );

          summary.push({
            featureId: featureLimit.featureId,
            complexity,
            totalUsage: currentUsage,
            monthlyUsage: currentUsage,
            lastUsed: new Date(), // This would come from actual usage data
            cost: complexityConfig.processingCost * currentUsage,
            resourceUsage
          });
        }
      }

      return { success: true, summary };
    } catch (error) {
      console.error('Error getting user feature usage summary:', error);
      return { success: false, error: 'Failed to get usage summary' };
    }
  }

  // Get tier feature capabilities
  async getTierFeatureCapabilities(tierId: string): Promise<{
    success: boolean;
    capabilities?: any;
    error?: string;
  }> {
    try {
      const tier = getEnhancedTierLimits(tierId);
      if (!tier) {
        return { success: false, error: 'Invalid tier ID' };
      }

      const capabilities = {
        tier: tier,
        features: tier.features.map(featureLimit => {
          const featureDef = getFeatureDefinition(featureLimit.featureId);
          return {
            feature: featureDef,
            limit: featureLimit,
            enabled: featureLimit.enabled,
            maxComplexity: featureLimit.maxComplexity,
            monthlyLimits: featureLimit.monthlyLimits,
            totalMonthlyLimits: Object.values(featureLimit.monthlyLimits).reduce((sum, limit) => sum + limit, 0)
          };
        }),
        legacyFeatures: tier.legacyFeatures,
        usageLimits: tier.usageLimits,
        journeyPricing: tier.journeyPricing
      };

      return { success: true, capabilities };
    } catch (error) {
      console.error('Error getting tier capabilities:', error);
      return { success: false, error: 'Failed to get tier capabilities' };
    }
  }

  // Calculate upgrade recommendation
  async calculateUpgradeRecommendation(userId: string): Promise<{
    success: boolean;
    recommendation?: {
      currentTier: string;
      recommendedTier: string;
      reason: string;
      benefits: string[];
      costIncrease: number;
    };
    error?: string;
  }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const currentTierId = user.subscriptionTier || 'trial';
      const currentTier = getEnhancedTierLimits(currentTierId);
      if (!currentTier) {
        return { success: false, error: 'Invalid current tier' };
      }

      // Analyze usage patterns to recommend upgrades
      const usageSummary = await this.getUserFeatureUsageSummary(userId);
      if (!usageSummary.success || !usageSummary.summary) {
        return { success: false, error: 'Could not analyze usage' };
      }

      // Simple upgrade logic - in practice, this would be more sophisticated
      const tiers = ['trial', 'starter', 'professional', 'enterprise'];
      const currentIndex = tiers.indexOf(currentTierId);
      
      if (currentIndex >= tiers.length - 1) {
        return { success: false, error: 'Already on highest tier' };
      }

      const nextTierId = tiers[currentIndex + 1];
      const nextTier = getEnhancedTierLimits(nextTierId);
      if (!nextTier) {
        return { success: false, error: 'Invalid next tier' };
      }

      const costIncrease = nextTier.price - currentTier.price;
      
      return {
        success: true,
        recommendation: {
          currentTier: currentTierId,
          recommendedTier: nextTierId,
          reason: 'Based on your usage patterns, upgrading would provide more capacity and features',
          benefits: [
            `Access to ${nextTier.features.filter(f => f.enabled).length} enabled features`,
            `Higher complexity limits for advanced analysis`,
            'Priority support',
            'Increased monthly limits'
          ],
          costIncrease
        }
      };
    } catch (error) {
      console.error('Error calculating upgrade recommendation:', error);
      return { success: false, error: 'Failed to calculate recommendation' };
    }
  }
}

export const enhancedFeatureBillingService = EnhancedFeatureBillingService.getInstance();
