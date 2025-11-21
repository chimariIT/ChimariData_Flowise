import { db } from '../db';
import { subscriptionTierPricing } from '@shared/schema';
import { UNIFIED_SUBSCRIPTION_TIERS } from '@shared/unified-subscription-tiers';
import { eq } from 'drizzle-orm';

export type SubscriptionTierPricingRow = typeof subscriptionTierPricing.$inferSelect;
export type TierSyncSource = 'database' | 'seeded_from_default';

export async function resolveTierForStripeSync(
  tierId: string,
  database = db
): Promise<{ source: TierSyncSource; record: SubscriptionTierPricingRow; }> {
  const existing = await database
    .select()
    .from(subscriptionTierPricing)
    .where(eq(subscriptionTierPricing.id, tierId))
    .limit(1);

  if (existing.length > 0) {
    return { source: 'database', record: existing[0] };
  }

  const fallback = UNIFIED_SUBSCRIPTION_TIERS[tierId];
  if (!fallback) {
    throw new Error(`Subscription tier '${tierId}' not found in database or defaults`);
  }

  const timestamp = new Date();
  const fallbackRecord: SubscriptionTierPricingRow = {
    id: fallback.id,
    name: fallback.name,
    displayName: fallback.displayName,
    description: fallback.description,
    monthlyPriceUsd: Math.round(fallback.monthlyPrice * 100),
    yearlyPriceUsd: Math.round(fallback.yearlyPrice * 100),
    stripeProductId: fallback.stripeProductId ?? null,
    stripeMonthlyPriceId: null,
    stripeYearlyPriceId: null,
    limits: fallback.limits,
    features: {
      dataTransformation: fallback.limits.dataTransformation,
      statisticalAnalysis: fallback.limits.statisticalAnalysis,
      advancedInsights: fallback.limits.advancedInsights,
      piiDetection: fallback.limits.piiDetection,
      mlBasic: fallback.limits.mlBasic,
      mlAdvanced: fallback.limits.mlAdvanced,
      mlAutoML: fallback.limits.mlAutoML,
      modelExplainability: fallback.limits.modelExplainability,
      llmFineTuning: fallback.limits.llmFineTuning,
      llmLora: fallback.limits.llmLora,
      llmQlora: fallback.limits.llmQlora,
      llmFullFineTuning: fallback.limits.llmFullFineTuning,
      llmDistributed: fallback.limits.llmDistributed,
      customMLModels: fallback.limits.customMLModels,
    },
    journeyPricing: fallback.journeyPricing,
    overagePricing: fallback.overagePricing,
    discounts: fallback.discounts,
    compliance: fallback.compliance,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await database.insert(subscriptionTierPricing).values(fallbackRecord);

  return {
    source: 'seeded_from_default',
    record: fallbackRecord,
  };
}

