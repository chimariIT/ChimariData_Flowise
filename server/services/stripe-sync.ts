/**
 * Stripe Sync Service
 *
 * Synchronizes subscription tier pricing and features with Stripe
 * - Creates/updates Stripe products for each subscription tier
 * - Creates/updates Stripe prices when tier pricing changes
 * - Archives old prices and creates new ones for price changes
 * - Maintains mapping between local tiers and Stripe product/price IDs
 */

import Stripe from 'stripe';
import { SUBSCRIPTION_TIERS, SubscriptionTier } from '@shared/subscription-tiers';

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
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2024-12-18.acacia',
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
   * Sync a subscription tier with Stripe
   * Creates or updates the Stripe product and price
   */
  async syncTierWithStripe(
    tierId: string,
    tierData: SubscriptionTier
  ): Promise<{
    success: boolean;
    stripeProductId?: string;
    stripePriceId?: string;
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

      // Step 2: Create or update Stripe Price
      const priceResult = await this.syncPrice(
        stripeProductId,
        tierData.price,
        tierData.name
      );

      if (!priceResult.success || !priceResult.priceId) {
        return {
          success: false,
          stripeProductId,
          error: `Failed to sync price: ${priceResult.error}`,
        };
      }

      return {
        success: true,
        stripeProductId,
        stripePriceId: priceResult.priceId,
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
    tierData: SubscriptionTier
  ): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
  }> {
    try {
      const existingProductId = tierData.stripeProductId;

      // If product ID exists, try to update it
      if (existingProductId) {
        try {
          const product = await this.stripe.products.update(existingProductId, {
            name: tierData.name,
            description: tierData.description,
            metadata: {
              tierId: tierId,
              maxFiles: tierData.features.maxFiles.toString(),
              maxFileSizeMB: tierData.features.maxFileSizeMB.toString(),
              totalDataVolumeMB: tierData.features.totalDataVolumeMB.toString(),
              aiInsights: tierData.features.aiInsights.toString(),
            },
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
        name: tierData.name,
        description: tierData.description,
        metadata: {
          tierId: tierId,
          maxFiles: tierData.features.maxFiles.toString(),
          maxFileSizeMB: tierData.features.maxFileSizeMB.toString(),
          totalDataVolumeMB: tierData.features.totalDataVolumeMB.toString(),
          aiInsights: tierData.features.aiInsights.toString(),
        },
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
    tierName: string
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
        limit: 10,
      });

      // Check if a price with the same amount already exists
      const matchingPrice = existingPrices.data.find(
        (price) =>
          price.unit_amount === priceAmount * 100 && // Stripe uses cents
          price.recurring?.interval === 'month'
      );

      if (matchingPrice) {
        console.log(`✅ Using existing Stripe price: ${matchingPrice.id} for product: ${productId}`);
        return {
          success: true,
          priceId: matchingPrice.id,
        };
      }

      // Archive old prices (make them inactive)
      for (const oldPrice of existingPrices.data) {
        if (oldPrice.recurring?.interval === 'month') {
          try {
            await this.stripe.prices.update(oldPrice.id, {
              active: false,
            });
            console.log(`📦 Archived old price: ${oldPrice.id}`);
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
          interval: 'month',
        },
        metadata: {
          tierName: tierName,
        },
      });

      console.log(`✅ Created new Stripe price: ${newPrice.id} ($${priceAmount}/month) for product: ${productId}`);
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
   * Sync all subscription tiers with Stripe
   */
  async syncAllTiersWithStripe(): Promise<{
    success: boolean;
    results: Array<{
      tierId: string;
      success: boolean;
      stripeProductId?: string;
      stripePriceId?: string;
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

    const results = [];

    for (const [tierId, tierData] of Object.entries(SUBSCRIPTION_TIERS)) {
      console.log(`🔄 Syncing tier ${tierId} with Stripe...`);
      const result = await this.syncTierWithStripe(tierId, tierData);
      results.push({
        tierId,
        ...result,
      });
    }

    const allSucceeded = results.every((r) => r.success);

    return {
      success: allSucceeded,
      results,
    };
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
