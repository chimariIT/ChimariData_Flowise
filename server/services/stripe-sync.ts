/**
 * Stripe Sync Service
 *
 * Synchronizes subscription tier pricing and features with Stripe
 * - Creates/updates Stripe products for each subscription tier
 * - Creates/updates Stripe prices when tier pricing changes
 * - Archives old prices and creates new ones for price changes
 * - Maintains mapping between local tiers and Stripe product/price IDs
 * - Syncs from database (not hardcoded tiers)
 */

import Stripe from 'stripe';
import { getPricingDataService } from './pricing-data-service';
import { db } from '../db';
import { subscriptionTierPricing, servicePricing } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class StripeSyncService {
  private stripe: Stripe;
  private isConfigured: boolean = false;

  constructor() {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey || secretKey === '') {
      console.warn('⚠️  Stripe not configured - STRIPE_SECRET_KEY is missing');
      this.isConfigured = false;
      // Create a dummy stripe instance to prevent errors
      this.stripe = {} as Stripe;
    } else {
      // FIX Jan 20: Use stable Stripe API version
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-12-18.acacia' as any,
      });
      this.isConfigured = true;
    }
  }

  /**
   * Check if Stripe is properly configured
   */
  isStripeConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Sync a subscription tier with Stripe (from database)
   * Creates or updates the Stripe product and prices (monthly & yearly)
   */
  async syncTierWithStripe(
    tierId: string,
    tierData: {
      displayName: string;
      description: string;
      monthlyPriceUsd: number; // in cents
      yearlyPriceUsd: number; // in cents
      stripeProductId?: string | null;
      stripeMonthlyPriceId?: string | null;
      stripeYearlyPriceId?: string | null;
      limits: any;
      features: any;
    }
  ): Promise<{
    success: boolean;
    stripeProductId?: string;
    stripeMonthlyPriceId?: string;
    stripeYearlyPriceId?: string;
    error?: string;
  }> {
    if (!this.isConfigured) {
      console.warn('⚠️  Skipping Stripe sync - Stripe not configured');
      return {
        success: false,
        error: 'Stripe not configured. Set STRIPE_SECRET_KEY environment variable.',
      };
    }

    try {
      // Step 1: Create or update Stripe Product
      const productResult = await this.syncProduct(tierId, tierData);
      if (!productResult.success || !productResult.productId) {
        return {
          success: false,
          error: `Failed to sync product: ${productResult.error}`,
        };
      }

      const stripeProductId = productResult.productId;

      // Step 2: Sync Monthly Price
      const monthlyPriceResult = await this.syncPrice(
        stripeProductId,
        tierData.monthlyPriceUsd / 100, // Convert cents to dollars
        tierData.displayName,
        'month'
      );

      if (!monthlyPriceResult.success) {
        return {
          success: false,
          stripeProductId,
          error: `Failed to sync monthly price: ${monthlyPriceResult.error}`,
        };
      }

      // Step 3: Sync Yearly Price
      const yearlyPriceResult = await this.syncPrice(
        stripeProductId,
        tierData.yearlyPriceUsd / 100, // Convert cents to dollars
        tierData.displayName,
        'year'
      );

      if (!yearlyPriceResult.success) {
        return {
          success: false,
          stripeProductId,
          stripeMonthlyPriceId: monthlyPriceResult.priceId,
          error: `Failed to sync yearly price: ${yearlyPriceResult.error}`,
        };
      }

      // Step 4: Update database with Stripe IDs
      await db.update(subscriptionTierPricing)
        .set({
          stripeProductId: stripeProductId,
          stripeMonthlyPriceId: monthlyPriceResult.priceId,
          stripeYearlyPriceId: yearlyPriceResult.priceId,
          updatedAt: new Date()
        })
        .where(eq(subscriptionTierPricing.id, tierId));

      console.log(`✅ Synced tier ${tierId} with Stripe and updated database`);

      return {
        success: true,
        stripeProductId,
        stripeMonthlyPriceId: monthlyPriceResult.priceId,
        stripeYearlyPriceId: yearlyPriceResult.priceId,
      };
    } catch (error: any) {
      console.error('❌ Error syncing tier with Stripe:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  /**
   * Create or update a Stripe Product
   */
  private async syncProduct(
    tierId: string,
    tierData: {
      displayName: string;
      description: string;
      stripeProductId?: string | null;
      limits: any;
      features: any;
    }
  ): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
  }> {
    try {
      const existingProductId = tierData.stripeProductId;
      const limits = tierData.limits || {};
      const features = tierData.features || {};

      const metadata: any = {
        tierId: tierId,
        maxFiles: limits.maxFiles?.toString() || '0',
        maxFileSizeMB: limits.maxFileSizeMB?.toString() || '0',
        totalDataVolumeMB: limits.totalDataVolumeMB?.toString() || '0',
        aiInsights: limits.aiInsights?.toString() || '0',
        dataTransformation: features.dataTransformation?.toString() || 'false',
        statisticalAnalysis: features.statisticalAnalysis?.toString() || 'false',
        advancedInsights: features.advancedInsights?.toString() || 'false',
      };

      // If product ID exists, try to update it
      if (existingProductId) {
        try {
          const product = await this.stripe.products.update(existingProductId, {
            name: tierData.displayName,
            description: tierData.description || `${tierData.displayName} subscription tier`,
            metadata,
          });

          console.log(`✅ Updated Stripe product: ${product.id} for tier: ${tierId}`);
          return {
            success: true,
            productId: product.id,
          };
        } catch (updateError: any) {
          // If update fails (product doesn't exist), create new
          if (updateError.code === 'resource_missing') {
            console.log(`⚠️  Product ${existingProductId} not found, creating new one`);
          } else {
            throw updateError;
          }
        }
      }

      // Create new product
      const product = await this.stripe.products.create({
        name: tierData.displayName,
        description: tierData.description || `${tierData.displayName} subscription tier`,
        metadata,
      });

      console.log(`✅ Created Stripe product: ${product.id} for tier: ${tierId}`);
      return {
        success: true,
        productId: product.id,
      };
    } catch (error: any) {
      console.error(`❌ Error syncing product for tier ${tierId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to sync product',
      };
    }
  }

  /**
   * Create or update a Stripe Price
   * Note: Prices are immutable in Stripe, so we archive old and create new
   */
  private async syncPrice(
    productId: string,
    priceAmount: number,
    tierName: string,
    interval: 'month' | 'year' = 'month'
  ): Promise<{
    success: boolean;
    priceId?: string;
    error?: string;
  }> {
    try {
      // List existing prices for this product
      const existingPrices = await this.stripe.prices.list({
        product: productId,
        active: true,
        limit: 20,
      });

      // Check if a price with the same amount and interval already exists
      const matchingPrice = existingPrices.data.find(
        (price) =>
          price.unit_amount === priceAmount * 100 && // Stripe uses cents
          price.recurring?.interval === interval
      );

      if (matchingPrice) {
        console.log(`✅ Using existing Stripe price: ${matchingPrice.id} ($${priceAmount}/${interval}) for product: ${productId}`);
        return {
          success: true,
          priceId: matchingPrice.id,
        };
      }

      // Archive old prices with same interval (make them inactive)
      for (const oldPrice of existingPrices.data) {
        if (oldPrice.recurring?.interval === interval) {
          try {
            await this.stripe.prices.update(oldPrice.id, {
              active: false,
            });
            console.log(`📦 Archived old ${interval}ly price: ${oldPrice.id}`);
          } catch (archiveError) {
            console.warn(`⚠️  Failed to archive price ${oldPrice.id}:`, archiveError);
          }
        }
      }

      // Create new price
      const newPrice = await this.stripe.prices.create({
        product: productId,
        unit_amount: priceAmount * 100, // Convert dollars to cents
        currency: 'usd',
        recurring: {
          interval: interval,
        },
        metadata: {
          tierName: tierName,
          interval: interval,
        },
      });

      console.log(`✅ Created new Stripe price: ${newPrice.id} ($${priceAmount}/${interval}) for product: ${productId}`);
      return {
        success: true,
        priceId: newPrice.id,
      };
    } catch (error: any) {
      console.error(`❌ Error syncing price for product ${productId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to sync price',
      };
    }
  }

  /**
   * Sync a service pricing entry with Stripe (one-time price, not recurring)
   * Creates/updates a Stripe product and a one-time price for the service.
   */
  async syncServiceWithStripe(
    serviceId: string,
    serviceData: {
      displayName: string;
      description: string;
      basePrice: number; // in cents
      serviceType: string;
      stripeProductId?: string | null;
      stripePriceId?: string | null;
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
      // Step 1: Create or update Stripe Product
      const productResult = await this.syncProduct(serviceId, {
        displayName: serviceData.displayName,
        description: serviceData.description,
        stripeProductId: serviceData.stripeProductId,
        limits: {},
        features: { serviceType: serviceData.serviceType },
      });

      if (!productResult.success || !productResult.productId) {
        return { success: false, error: `Failed to sync product: ${productResult.error}` };
      }

      const stripeProductId = productResult.productId;

      // Step 2: Create one-time price (Stripe prices are immutable; archive old, create new)
      const priceAmountCents = serviceData.basePrice;

      // Check for existing matching price
      const existingPrices = await this.stripe.prices.list({
        product: stripeProductId,
        active: true,
        limit: 20,
      });

      const matchingPrice = existingPrices.data.find(
        (p) => p.unit_amount === priceAmountCents && !p.recurring
      );

      if (matchingPrice) {
        console.log(`✅ Using existing Stripe one-time price: ${matchingPrice.id} for service: ${serviceId}`);

        // Update DB with Stripe IDs
        await db.update(servicePricing)
          .set({
            stripeProductId,
            stripePriceId: matchingPrice.id,
            updatedAt: new Date(),
          })
          .where(eq(servicePricing.id, serviceId));

        return { success: true, stripeProductId, stripePriceId: matchingPrice.id };
      }

      // Archive old one-time prices
      for (const oldPrice of existingPrices.data) {
        if (!oldPrice.recurring) {
          try {
            await this.stripe.prices.update(oldPrice.id, { active: false });
            console.log(`📦 Archived old one-time price: ${oldPrice.id}`);
          } catch (e) {
            console.warn(`⚠️  Failed to archive price ${oldPrice.id}`);
          }
        }
      }

      // Create new one-time price
      const newPrice = await this.stripe.prices.create({
        product: stripeProductId,
        unit_amount: priceAmountCents,
        currency: 'usd',
        metadata: {
          serviceId,
          serviceType: serviceData.serviceType,
        },
      });

      console.log(`✅ Created Stripe one-time price: ${newPrice.id} ($${priceAmountCents / 100}) for service: ${serviceId}`);

      // Update DB with Stripe IDs
      await db.update(servicePricing)
        .set({
          stripeProductId,
          stripePriceId: newPrice.id,
          updatedAt: new Date(),
        })
        .where(eq(servicePricing.id, serviceId));

      return { success: true, stripeProductId, stripePriceId: newPrice.id };
    } catch (error: any) {
      console.error(`❌ Error syncing service ${serviceId} with Stripe:`, error);
      return { success: false, error: error.message || 'Unknown error' };
    }
  }

  /**
   * Sync all subscription tiers with Stripe (from database)
   */
  async syncAllTiersWithStripe(): Promise<{
    success: boolean;
    results: Array<{
      tierId: string;
      success: boolean;
      stripeProductId?: string;
      stripeMonthlyPriceId?: string;
      stripeYearlyPriceId?: string;
      error?: string;
    }>;
  }> {
    if (!this.isConfigured) {
      console.warn('⚠️  Skipping Stripe sync - Stripe not configured');
      return {
        success: false,
        results: [],
      };
    }

    try {
      const pricingService = getPricingDataService();
      const dbTiers = await pricingService.getAllActiveTiers();

      const results = [];

      for (const tierData of dbTiers) {
        console.log(`🔄 Syncing tier ${tierData.id} with Stripe...`);
        const result = await this.syncTierWithStripe(tierData.id, {
          displayName: tierData.displayName,
          description: tierData.description || '',
          monthlyPriceUsd: tierData.monthlyPriceUsd,
          yearlyPriceUsd: tierData.yearlyPriceUsd,
          stripeProductId: tierData.stripeProductId,
          stripeMonthlyPriceId: tierData.stripeMonthlyPriceId,
          stripeYearlyPriceId: tierData.stripeYearlyPriceId,
          limits: tierData.limits,
          features: tierData.features
        });

        results.push({
          tierId: tierData.id,
          ...result,
        });
      }

      const allSucceeded = results.every((r) => r.success);

      return {
        success: allSucceeded,
        results,
      };
    } catch (error: any) {
      console.error('❌ Error syncing all tiers:', error);
      return {
        success: false,
        results: [],
      };
    }
  }
}

// Export singleton instance
let stripeSyncInstance: StripeSyncService | null = null;

export function getStripeSyncService(): StripeSyncService {
  if (!stripeSyncInstance) {
    stripeSyncInstance = new StripeSyncService();
  }
  return stripeSyncInstance;
}
