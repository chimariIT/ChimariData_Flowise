/**
 * Pricing Data Service
 *
 * Centralized service for fetching all pricing data from database.
 * Used by billing service, usage tracking, cost calculations, and analytics.
 *
 * This service ensures all pricing calculations use the latest database values
 * and admin changes to pricing are immediately reflected throughout the system.
 */

import { db } from '../db';
import { subscriptionTierPricing, servicePricing } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class PricingDataService {
  /**
   * Get subscription tier pricing from database
   * @param tierId - The tier ID ('trial', 'starter', 'professional', 'enterprise')
   * @returns Tier pricing data or null if not found
   */
  async getTierPricing(tierId: string) {
    const [tier] = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.id, tierId));

    return tier || null;
  }

  /**
   * Get all active subscription tiers
   * @returns Array of active tier pricing data
   */
  async getAllActiveTiers() {
    const tiers = await db
      .select()
      .from(subscriptionTierPricing)
      .where(eq(subscriptionTierPricing.isActive, true));

    return tiers;
  }

  /**
   * Get service pricing from database
   * @param serviceType - The service type ('pay-per-analysis', 'expert-consultation', etc.)
   * @returns Service pricing data or null if not found
   */
  async getServicePricing(serviceType: string) {
    const [service] = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.serviceType, serviceType));

    return service || null;
  }

  /**
   * Get all active services
   * @returns Array of active service pricing data
   */
  async getAllActiveServices() {
    const services = await db
      .select()
      .from(servicePricing)
      .where(eq(servicePricing.isActive, true));

    return services;
  }

  /**
   * Calculate journey-adjusted cost for a tier
   * @param tierId - The subscription tier ID
   * @param journeyType - The journey type ('non-tech', 'business', 'technical', 'consultation')
   * @returns Adjusted monthly price in dollars
   */
  async calculateJourneyCost(tierId: string, journeyType: string): Promise<number> {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    const basePrice = tier.monthlyPriceUsd / 100; // Convert cents to dollars
    const journeyPricing = tier.journeyPricing as any || {};
    const multiplier = journeyPricing[journeyType] || 1.0;

    return basePrice * multiplier;
  }

  /**
   * Calculate overage cost for a tier
   * @param tierId - The subscription tier ID
   * @param overageType - Type of overage ('dataPerMB', 'computePerMinute', 'storagePerMB')
   * @param amount - Amount of overage (MB, minutes, etc.)
   * @returns Overage cost in dollars
   */
  async calculateOverageCost(
    tierId: string,
    overageType: string,
    amount: number
  ): Promise<number> {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    const overagePricing = tier.overagePricing as any || {};
    const ratePerUnit = overagePricing[overageType] || 0;

    return amount * ratePerUnit;
  }

  /**
   * Get tier limits for quota enforcement
   * @param tierId - The subscription tier ID
   * @returns Tier limits object
   */
  async getTierLimits(tierId: string) {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    return tier.limits as any || {};
  }

  /**
   * Get tier features for feature access control
   * @param tierId - The subscription tier ID
   * @returns Tier features object
   */
  async getTierFeatures(tierId: string) {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    return tier.features as any || {};
  }

  /**
   * Get tier discount configuration
   * @param tierId - The subscription tier ID
   * @returns Tier discounts object
   */
  async getTierDiscounts(tierId: string) {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    return tier.discounts as any || {};
  }

  /**
   * Check if user's tier allows a specific feature
   * @param tierId - The subscription tier ID
   * @param featureName - The feature name (e.g., 'dataTransformation', 'mlBasic')
   * @returns True if feature is allowed
   */
  async canAccessFeature(tierId: string, featureName: string): Promise<boolean> {
    const features = await this.getTierFeatures(tierId);
    return features[featureName] === true;
  }

  /**
   * Check if user has exceeded a specific quota
   * @param tierId - The subscription tier ID
   * @param quotaType - The quota type (e.g., 'maxFiles', 'aiInsights')
   * @param currentUsage - Current usage amount
   * @returns Object with exceeded flag and limit
   */
  async checkQuotaExceeded(
    tierId: string,
    quotaType: string,
    currentUsage: number
  ): Promise<{ exceeded: boolean; limit: number; remaining: number }> {
    const limits = await this.getTierLimits(tierId);
    const limit = limits[quotaType] || 0;

    // -1 means unlimited
    if (limit === -1) {
      return {
        exceeded: false,
        limit: -1,
        remaining: -1
      };
    }

    const exceeded = currentUsage >= limit;
    const remaining = Math.max(0, limit - currentUsage);

    return {
      exceeded,
      limit,
      remaining
    };
  }

  /**
   * Calculate total cost for a user journey with features
   * @param tierId - The subscription tier ID
   * @param journeyType - The journey type
   * @param features - Array of features used
   * @returns Total cost breakdown
   */
  async calculateTotalJourneyCost(
    tierId: string,
    journeyType: string,
    features: string[]
  ): Promise<{
    baseCost: number;
    journeyMultiplier: number;
    discountPercent: number;
    finalCost: number;
  }> {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    const basePrice = tier.monthlyPriceUsd / 100;
    const journeyPricing = tier.journeyPricing as any || {};
    const journeyMultiplier = journeyPricing[journeyType] || 1.0;

    // Calculate journey-adjusted price
    let journeyCost = basePrice * journeyMultiplier;

    // Apply tier discounts
    const discounts = tier.discounts as any || {};
    const dataProcessingDiscount = discounts.dataProcessingDiscount || 0;

    const finalCost = journeyCost * (1 - dataProcessingDiscount / 100);

    return {
      baseCost: basePrice,
      journeyMultiplier,
      discountPercent: dataProcessingDiscount,
      finalCost
    };
  }

  /**
   * Get pricing summary for display/reporting
   * @param tierId - The subscription tier ID
   * @returns Complete pricing summary
   */
  async getPricingSummary(tierId: string) {
    const tier = await this.getTierPricing(tierId);

    if (!tier) {
      throw new Error(`Tier not found: ${tierId}`);
    }

    return {
      id: tier.id,
      name: tier.displayName,
      description: tier.description,
      pricing: {
        monthly: tier.monthlyPriceUsd / 100,
        yearly: tier.yearlyPriceUsd / 100
      },
      limits: tier.limits,
      features: tier.features,
      journeyPricing: tier.journeyPricing,
      overagePricing: tier.overagePricing,
      discounts: tier.discounts,
      compliance: tier.compliance,
      stripe: {
        productId: tier.stripeProductId,
        monthlyPriceId: tier.stripeMonthlyPriceId,
        yearlyPriceId: tier.stripeYearlyPriceId
      }
    };
  }
}

// Export singleton instance
let pricingDataServiceInstance: PricingDataService | null = null;

export function getPricingDataService(): PricingDataService {
  if (!pricingDataServiceInstance) {
    pricingDataServiceInstance = new PricingDataService();
  }
  return pricingDataServiceInstance;
}

// Export class for testing
export default PricingDataService;
