/**
 * Shared Pricing Configuration
 * P1-B FIX: Single source of truth for all pricing constants
 *
 * Used by:
 * - server/routes/analysis-payment.ts (buildPricing)
 * - server/services/cost-estimation-service.ts (DEFAULT_PRICING_CONFIG)
 * - server/routes/pricing.ts (tier pricing)
 */

// ==========================================
// Tiered Pricing Types
// ==========================================

/** Per-complexity cost for a single analysis type at a specific volume tier */
export interface ComplexityCosts {
  basic: number;
  intermediate: number;
  advanced: number;
}

/** Per-volume-tier cost matrix for a single analysis type */
export interface VolumeTierCosts {
  small: ComplexityCosts;
  medium: ComplexityCosts;
  large: ComplexityCosts;
  xlarge: ComplexityCosts;
}

/** Volume tier threshold definition */
export interface VolumeTierThreshold {
  maxRows: number;
  label: string;
}

/** Full tiered pricing for all analysis types */
export type AnalysisTypePricing = Record<string, VolumeTierCosts>;

// ==========================================
// Default Tiered Pricing Matrix
// ==========================================

/** Default per-type tiered pricing. Admin can override via analysis_pricing_config table. */
export const DEFAULT_ANALYSIS_TYPE_PRICING: AnalysisTypePricing = {
  descriptive: {
    small:  { basic: 3.00,  intermediate: 5.00,  advanced: 8.00 },
    medium: { basic: 5.00,  intermediate: 8.00,  advanced: 12.00 },
    large:  { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    xlarge: { basic: 12.00, intermediate: 18.00, advanced: 25.00 },
  },
  statistical: {
    small:  { basic: 5.00,  intermediate: 8.00,  advanced: 12.00 },
    medium: { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    large:  { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    xlarge: { basic: 18.00, intermediate: 28.00, advanced: 40.00 },
  },
  correlation: {
    small:  { basic: 5.00,  intermediate: 8.00,  advanced: 12.00 },
    medium: { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    large:  { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    xlarge: { basic: 18.00, intermediate: 28.00, advanced: 40.00 },
  },
  regression: {
    small:  { basic: 6.00,  intermediate: 10.00, advanced: 15.00 },
    medium: { basic: 10.00, intermediate: 15.00, advanced: 22.00 },
    large:  { basic: 15.00, intermediate: 22.00, advanced: 35.00 },
    xlarge: { basic: 22.00, intermediate: 35.00, advanced: 50.00 },
  },
  clustering: {
    small:  { basic: 6.00,  intermediate: 10.00, advanced: 15.00 },
    medium: { basic: 10.00, intermediate: 15.00, advanced: 22.00 },
    large:  { basic: 15.00, intermediate: 22.00, advanced: 35.00 },
    xlarge: { basic: 22.00, intermediate: 35.00, advanced: 50.00 },
  },
  time_series: {
    small:  { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    medium: { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    large:  { basic: 18.00, intermediate: 28.00, advanced: 42.00 },
    xlarge: { basic: 28.00, intermediate: 42.00, advanced: 60.00 },
  },
  machine_learning: {
    small:  { basic: 10.00, intermediate: 18.00, advanced: 28.00 },
    medium: { basic: 18.00, intermediate: 28.00, advanced: 42.00 },
    large:  { basic: 28.00, intermediate: 42.00, advanced: 65.00 },
    xlarge: { basic: 42.00, intermediate: 65.00, advanced: 95.00 },
  },
  visualization: {
    small:  { basic: 2.00,  intermediate: 4.00,  advanced: 6.00 },
    medium: { basic: 4.00,  intermediate: 6.00,  advanced: 10.00 },
    large:  { basic: 6.00,  intermediate: 10.00, advanced: 15.00 },
    xlarge: { basic: 10.00, intermediate: 15.00, advanced: 22.00 },
  },
  business_intelligence: {
    small:  { basic: 8.00,  intermediate: 14.00, advanced: 22.00 },
    medium: { basic: 14.00, intermediate: 22.00, advanced: 35.00 },
    large:  { basic: 22.00, intermediate: 35.00, advanced: 55.00 },
    xlarge: { basic: 35.00, intermediate: 55.00, advanced: 80.00 },
  },
  sentiment: {
    small:  { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    medium: { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    large:  { basic: 18.00, intermediate: 28.00, advanced: 42.00 },
    xlarge: { basic: 28.00, intermediate: 42.00, advanced: 60.00 },
  },
  diagnostic: {
    small:  { basic: 5.00,  intermediate: 8.00,  advanced: 12.00 },
    medium: { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    large:  { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    xlarge: { basic: 18.00, intermediate: 28.00, advanced: 40.00 },
  },
  predictive: {
    small:  { basic: 8.00,  intermediate: 14.00, advanced: 22.00 },
    medium: { basic: 14.00, intermediate: 22.00, advanced: 35.00 },
    large:  { basic: 22.00, intermediate: 35.00, advanced: 55.00 },
    xlarge: { basic: 35.00, intermediate: 55.00, advanced: 80.00 },
  },
  prescriptive: {
    small:  { basic: 10.00, intermediate: 18.00, advanced: 28.00 },
    medium: { basic: 18.00, intermediate: 28.00, advanced: 42.00 },
    large:  { basic: 28.00, intermediate: 42.00, advanced: 65.00 },
    xlarge: { basic: 42.00, intermediate: 65.00, advanced: 95.00 },
  },
  default: {
    small:  { basic: 5.00,  intermediate: 8.00,  advanced: 12.00 },
    medium: { basic: 8.00,  intermediate: 12.00, advanced: 18.00 },
    large:  { basic: 12.00, intermediate: 18.00, advanced: 28.00 },
    xlarge: { basic: 18.00, intermediate: 28.00, advanced: 40.00 },
  },
};

/** Default data volume tier thresholds */
export const DEFAULT_DATA_VOLUME_TIERS: Record<string, VolumeTierThreshold> = {
  small:  { maxRows: 1_000,     label: 'Small (≤1K rows)' },
  medium: { maxRows: 10_000,    label: 'Medium (1K–10K rows)' },
  large:  { maxRows: 100_000,   label: 'Large (10K–100K rows)' },
  xlarge: { maxRows: Infinity,  label: 'Extra Large (100K+ rows)' },
};

// ==========================================
// Legacy Constants (backward compat)
// ==========================================

export const PRICING_CONSTANTS = {
  /** Platform fee: charged once per project. $25 from service_pricing table, this is the fallback. */
  basePlatformFee: 25.00,
  /** Legacy: data processing cost per 1K rows (used in fallback formula only) */
  dataProcessingPer1K: 0.10,
  /** Legacy: base analysis cost (used in fallback formula only when tiered pricing unavailable) */
  baseAnalysisCost: 5.00,

  complexityMultipliers: {
    basic: 1.0,
    intermediate: 1.5,
    advanced: 2.5,
    expert: 4.0
  } as Record<string, number>,

  /** Legacy: type multipliers (used as fallback when tiered pricing not configured) */
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

  /** Record count thresholds for complexity multiplier (legacy) */
  complexityThresholds: {
    complex: 100_000,   // > 100K rows = complex (2.5x)
    moderate: 10_000,   // > 10K rows = moderate (1.5x)
  },

  /** Service-level pricing defaults (in dollars).
   *  These are overridden by admin-configured values in service_pricing table.
   *  Used as fallbacks when API data hasn't loaded yet. */
  servicePricingDefaults: {
    payPerAnalysis: 25,      // $25 base for pay-per-analysis service (= platform fee)
    expertConsultation: 150, // $150 base for expert consultation
  },

  /** Admin analysis pricing defaults (used when no DB config exists). */
  adminPricingDefaults: {
    baseCost: 5.00,
    dataSizeCostPer1K: 0.10,
    platformFee: 25.00,
  },

  /** Tiered pricing (new model). Overrides legacy formula when present in DB config. */
  dataVolumeTiers: DEFAULT_DATA_VOLUME_TIERS,
  analysisTypePricing: DEFAULT_ANALYSIS_TYPE_PRICING,
} as const;

export type PricingConstants = typeof PRICING_CONSTANTS;

/**
 * Get complexity multiplier based on record count (legacy)
 */
export function getRecordCountMultiplier(recordCount: number): number {
  if (recordCount > PRICING_CONSTANTS.complexityThresholds.complex) return 2.5;
  if (recordCount > PRICING_CONSTANTS.complexityThresholds.moderate) return 1.5;
  return 1.0;
}

/**
 * Get analysis type factor (normalized key lookup, legacy)
 */
export function getAnalysisTypeFactor(analysisType: string): number {
  const normalized = (analysisType || 'default').toLowerCase().replace(/[^a-z_]/g, '_');
  return PRICING_CONSTANTS.analysisTypeFactors[normalized] || PRICING_CONSTANTS.analysisTypeFactors.default;
}

/**
 * Get the data volume tier key for a given row count
 */
export function getVolumeTierKey(rows: number, tiers?: Record<string, VolumeTierThreshold>): string {
  const t = tiers || DEFAULT_DATA_VOLUME_TIERS;
  if (rows <= (t.small?.maxRows ?? 1000)) return 'small';
  if (rows <= (t.medium?.maxRows ?? 10000)) return 'medium';
  if (rows <= (t.large?.maxRows ?? 100000)) return 'large';
  return 'xlarge';
}

/**
 * Look up the tiered price for a specific analysis type, volume tier, and complexity
 */
export function getTieredAnalysisPrice(
  analysisType: string,
  volumeTierKey: string,
  complexity: string,
  pricing?: AnalysisTypePricing
): number {
  const p = pricing || DEFAULT_ANALYSIS_TYPE_PRICING;
  const normalized = (analysisType || 'default').toLowerCase().replace(/[^a-z_]/g, '_');
  const typeMatrix = p[normalized] || p['default'];
  if (!typeMatrix) return 5.00; // ultimate fallback
  const tierCosts = (typeMatrix as any)[volumeTierKey] || typeMatrix.small;
  return (tierCosts as any)[complexity] || tierCosts.basic;
}
