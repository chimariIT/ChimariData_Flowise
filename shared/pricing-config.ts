/**
 * Shared Pricing Configuration
 * P1-B FIX: Single source of truth for all pricing constants
 *
 * Used by:
 * - server/routes/analysis-payment.ts (buildPricing)
 * - server/services/cost-estimation-service.ts (DEFAULT_PRICING_CONFIG)
 * - server/routes/pricing.ts (tier pricing)
 */

export const PRICING_CONSTANTS = {
  basePlatformFee: 0.50,
  dataProcessingPer1K: 0.10,
  baseAnalysisCost: 1.00,

  complexityMultipliers: {
    basic: 1.0,
    intermediate: 1.5,
    advanced: 2.5,
    expert: 4.0
  } as Record<string, number>,

  analysisTypeFactors: {
    descriptive: 1.0,
    diagnostic: 1.3,
    predictive: 2.0,
    prescriptive: 2.5,
    statistical: 1.2,
    machine_learning: 3.0,
    visualization: 0.8,
    time_series: 1.8,
    clustering: 1.5,
    regression: 1.6,
    correlation: 1.2,
    business_intelligence: 2.2,
    sentiment: 1.8,
    advanced: 2.5,
    custom: 3.0,
    default: 1.0
  } as Record<string, number>,

  /** Cost per additional question beyond the included 5 */
  questionsChargePerExtra: 0.10,
  /** Number of questions included in base price */
  questionsIncluded: 5,

  artifactCosts: {
    report: 0.25,
    dashboard: 0.50,
    presentation: 0.35,
    exportData: 0.10
  } as Record<string, number>,

  /** Record count thresholds for complexity multiplier */
  complexityThresholds: {
    complex: 100_000,   // > 100K rows = complex (2.5x)
    moderate: 10_000,   // > 10K rows = moderate (1.5x)
  },

  /** Service-level pricing defaults (in dollars).
   *  These are overridden by admin-configured values in service_pricing table.
   *  Used as fallbacks when API data hasn't loaded yet. */
  servicePricingDefaults: {
    payPerAnalysis: 25,      // $25 base for pay-per-analysis service
    expertConsultation: 150, // $150 base for expert consultation
  },

  /** Admin analysis pricing defaults (used when no DB config exists).
   *  Must match server/routes/admin-secured.ts DEFAULT_ANALYSIS_PRICING. */
  adminPricingDefaults: {
    baseCost: 0.50,
    dataSizeCostPer1K: 0.10,
    platformFee: 0.25,
  }
} as const;

export type PricingConstants = typeof PRICING_CONSTANTS;

/**
 * Get complexity multiplier based on record count
 */
export function getRecordCountMultiplier(recordCount: number): number {
  if (recordCount > PRICING_CONSTANTS.complexityThresholds.complex) return 2.5;
  if (recordCount > PRICING_CONSTANTS.complexityThresholds.moderate) return 1.5;
  return 1.0;
}

/**
 * Get analysis type factor (normalized key lookup)
 */
export function getAnalysisTypeFactor(analysisType: string): number {
  const normalized = (analysisType || 'default').toLowerCase().replace(/[^a-z_]/g, '_');
  return PRICING_CONSTANTS.analysisTypeFactors[normalized] || PRICING_CONSTANTS.analysisTypeFactors.default;
}
