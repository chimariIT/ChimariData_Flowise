/**
 * Cost Estimation Service
 *
 * V-1 Fix: Implements proper cost estimation using admin pricing configuration
 *
 * Features:
 * - Loads pricing from database (admin-configurable)
 * - Calculates analysis costs based on data size, complexity, and analysis type
 * - Provides detailed cost breakdown for transparency
 * - Caches configuration with TTL for performance
 * - Supports overage calculations for subscription users
 */

import { db } from '../db';
import { subscriptionTierPricing, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { PricingService } from './pricing';
import { FeatureComplexity } from '@shared/canonical-types';
import { storage } from '../storage';
// P1-B FIX: Import shared pricing constants
import { PRICING_CONSTANTS } from '../../shared/pricing-config';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export interface AnalysisPricingConfig {
  basePlatformFee: number;
  dataProcessingPer1K: number;
  baseAnalysisCost: number;
  complexityMultipliers: {
    basic: number;
    intermediate: number;
    advanced: number;
    expert: number;
  };
  analysisTypeFactors: {
    descriptive: number;
    diagnostic: number;
    predictive: number;
    prescriptive: number;
    statistical: number;
    machine_learning: number;
    visualization: number;
    time_series: number;
    clustering: number;
    regression: number;
    correlation: number;
    business_intelligence: number;
    sentiment: number;
    default: number;
  };
  artifactCosts: {
    report: number;
    dashboard: number;
    presentation: number;
    exportData: number;
  };
}

export interface CostBreakdown {
  item: string;
  cost: number;
  units?: string;
  factor?: number;
  description?: string;
}

export interface CostEstimate {
  totalCost: number;
  breakdown: CostBreakdown[];
  currency: string;
  creditsRequired: number;
  estimatedDuration: string;
  confidenceScore: number;
  warnings?: string[];
}

export interface DataSize {
  rows: number;
  columns: number;
  sizeBytes?: number;
}

// P1-B FIX: Use shared pricing constants (single source of truth)
// Note: PRICING_CONSTANTS uses Record<string, number> for flexibility,
// but AnalysisPricingConfig expects specific keys - cast to satisfy TypeScript
const DEFAULT_PRICING_CONFIG: AnalysisPricingConfig = {
  basePlatformFee: PRICING_CONSTANTS.basePlatformFee,
  dataProcessingPer1K: PRICING_CONSTANTS.dataProcessingPer1K,
  baseAnalysisCost: PRICING_CONSTANTS.baseAnalysisCost,
  complexityMultipliers: PRICING_CONSTANTS.complexityMultipliers as AnalysisPricingConfig['complexityMultipliers'],
  analysisTypeFactors: PRICING_CONSTANTS.analysisTypeFactors as AnalysisPricingConfig['analysisTypeFactors'],
  artifactCosts: PRICING_CONSTANTS.artifactCosts as AnalysisPricingConfig['artifactCosts']
};

// Cache for pricing configuration
let cachedConfig: AnalysisPricingConfig | null = null;
let cacheExpiresAt: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ==========================================
// COST ESTIMATION SERVICE
// ==========================================

export class CostEstimationService {

  /**
   * Load pricing configuration from PricingService (admin-configurable)
   * Uses PricingService.getPricingConfig() which can be updated via admin API
   */
  static async loadPricingConfig(): Promise<AnalysisPricingConfig> {
    // Check cache
    if (cachedConfig && cacheExpiresAt && new Date() < cacheExpiresAt) {
      return cachedConfig;
    }

    // Load from PricingService which is the source of truth
    const pricingServiceConfig = PricingService.getPricingConfig();

    cachedConfig = {
      basePlatformFee: pricingServiceConfig.platformFee || DEFAULT_PRICING_CONFIG.basePlatformFee,
      dataProcessingPer1K: pricingServiceConfig.dataSizeCostPer1K || DEFAULT_PRICING_CONFIG.dataProcessingPer1K,
      baseAnalysisCost: pricingServiceConfig.baseCost || DEFAULT_PRICING_CONFIG.baseAnalysisCost,
      complexityMultipliers: {
        basic: pricingServiceConfig.complexityMultipliers?.basic || DEFAULT_PRICING_CONFIG.complexityMultipliers.basic,
        intermediate: pricingServiceConfig.complexityMultipliers?.intermediate || DEFAULT_PRICING_CONFIG.complexityMultipliers.intermediate,
        advanced: pricingServiceConfig.complexityMultipliers?.advanced || DEFAULT_PRICING_CONFIG.complexityMultipliers.advanced,
        expert: 4.0
      },
      analysisTypeFactors: {
        ...DEFAULT_PRICING_CONFIG.analysisTypeFactors,
        ...(pricingServiceConfig.analysisTypeFactors || {})
      },
      artifactCosts: DEFAULT_PRICING_CONFIG.artifactCosts
    };
    cacheExpiresAt = new Date(Date.now() + CACHE_TTL_MS);
    console.log('💲 [CostEstimation] Loaded pricing config from PricingService');
    return cachedConfig;
  }

  /**
   * Save pricing configuration to PricingService
   */
  static async savePricingConfig(config: Partial<AnalysisPricingConfig>): Promise<boolean> {
    try {
      const currentConfig = await this.loadPricingConfig();
      const mergedConfig = {
        ...currentConfig,
        ...config
      };

      // Update PricingService (source of truth)
      PricingService.updatePricingConfig({
        baseCost: mergedConfig.baseAnalysisCost,
        dataSizeCostPer1K: mergedConfig.dataProcessingPer1K,
        platformFee: mergedConfig.basePlatformFee,
        complexityMultipliers: mergedConfig.complexityMultipliers as any,
        analysisTypeFactors: mergedConfig.analysisTypeFactors
      });

      // Invalidate cache to pick up new values
      cachedConfig = null;
      cacheExpiresAt = null;

      console.log('✅ [CostEstimation] Updated pricing config in PricingService');
      return true;
    } catch (error) {
      console.error('❌ [CostEstimation] Failed to save pricing config:', error);
      return false;
    }
  }

  /**
   * Estimate analysis cost for a project
   *
   * @param projectId - Project ID
   * @param analysisTypes - List of analysis types to run
   * @param dataSize - Data dimensions
   * @param complexity - Overall complexity level
   * @param includeArtifacts - Which artifacts to generate
   */
  static async estimateAnalysisCost(
    projectId: string,
    analysisTypes: string[],
    dataSize: DataSize,
    complexity: 'basic' | 'intermediate' | 'advanced' | 'expert' = 'intermediate',
    includeArtifacts: string[] = ['report']
  ): Promise<CostEstimate> {
    const config = await this.loadPricingConfig();
    const breakdown: CostBreakdown[] = [];
    const warnings: string[] = [];
    let totalCost = 0;

    // 1. Platform fee
    breakdown.push({
      item: 'Platform Fee',
      cost: config.basePlatformFee,
      description: 'Base platform access fee'
    });
    totalCost += config.basePlatformFee;

    // 2. Data processing cost
    const dataRowsK = dataSize.rows / 1000;
    const dataCost = dataRowsK * config.dataProcessingPer1K;
    breakdown.push({
      item: 'Data Processing',
      cost: parseFloat(dataCost.toFixed(2)),
      units: `${dataSize.rows.toLocaleString()} rows`,
      factor: config.dataProcessingPer1K,
      description: `$${config.dataProcessingPer1K}/1K rows`
    });
    totalCost += dataCost;

    // 3. Analysis costs (per type)
    const complexityMultiplier = config.complexityMultipliers[complexity] || 1.0;

    for (const analysisType of analysisTypes) {
      const normalizedType = analysisType.toLowerCase().replace(/[^a-z_]/g, '_');
      const typeFactor = (config.analysisTypeFactors as any)[normalizedType]
        || config.analysisTypeFactors.default;

      const analysisCost = config.baseAnalysisCost * typeFactor * complexityMultiplier;

      breakdown.push({
        item: `${this.formatAnalysisName(analysisType)} Analysis`,
        cost: parseFloat(analysisCost.toFixed(2)),
        factor: typeFactor,
        description: `Base: $${config.baseAnalysisCost} × ${typeFactor} (type) × ${complexityMultiplier} (${complexity})`
      });
      totalCost += analysisCost;
    }

    // 4. Artifact generation costs
    for (const artifact of includeArtifacts) {
      const artifactCost = (config.artifactCosts as any)[artifact] || 0.10;
      if (artifactCost > 0) {
        breakdown.push({
          item: `${this.formatArtifactName(artifact)} Generation`,
          cost: artifactCost,
          description: 'Artifact generation and formatting'
        });
        totalCost += artifactCost;
      }
    }

    // 5. Calculate credits required (100 credits = $1)
    const creditsRequired = Math.ceil(totalCost * 100);

    // 6. Estimate duration based on data size and analysis count
    const estimatedMinutes = this.estimateDuration(dataSize.rows, analysisTypes.length, complexity);
    const estimatedDuration = estimatedMinutes < 60
      ? `${estimatedMinutes} minutes`
      : `${Math.round(estimatedMinutes / 60 * 10) / 10} hours`;

    // 7. Calculate confidence score
    const confidenceScore = this.calculateConfidenceScore(dataSize, analysisTypes, complexity);

    // Add warnings for edge cases
    if (dataSize.rows > 100000) {
      warnings.push('Large dataset may require additional processing time');
    }
    if (analysisTypes.includes('machine_learning') && dataSize.rows < 1000) {
      warnings.push('Small dataset may affect ML model accuracy');
    }

    return {
      totalCost: parseFloat(totalCost.toFixed(2)),
      breakdown,
      currency: 'USD',
      creditsRequired,
      estimatedDuration,
      confidenceScore,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Calculate overage cost for subscription users who exceed quotas
   */
  static async calculateOverageCost(
    userId: string,
    usageType: 'data_processing' | 'analysis' | 'storage' | 'ai_queries',
    amount: number
  ): Promise<{ cost: number; units: string; rate: number }> {
    try {
      // Get user's subscription tier
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        throw new Error('User not found');
      }

      const tier = (user as any).subscriptionTier || 'free';

      // Get tier's overage rates
      const [tierConfig] = await db
        .select()
        .from(subscriptionTierPricing)
        .where(eq(subscriptionTierPricing.id, tier));

      const overageRates = (tierConfig as any)?.overagePricing || {
        dataPerMB: 0.05,
        computePerMinute: 0.02,
        storagePerMB: 0.01,
        aiQueryCost: 0.01
      };

      let rate: number;
      let units: string;

      switch (usageType) {
        case 'data_processing':
          rate = overageRates.dataPerMB || 0.05;
          units = 'MB';
          break;
        case 'analysis':
          rate = overageRates.computePerMinute || 0.02;
          units = 'minutes';
          break;
        case 'storage':
          rate = overageRates.storagePerMB || 0.01;
          units = 'MB';
          break;
        case 'ai_queries':
          rate = overageRates.aiQueryCost || 0.01;
          units = 'queries';
          break;
        default:
          rate = 0.01;
          units = 'units';
      }

      return {
        cost: parseFloat((amount * rate).toFixed(2)),
        units,
        rate
      };
    } catch (error) {
      console.error('Calculate overage cost error:', error);
      return { cost: 0, units: 'units', rate: 0 };
    }
  }

  /**
   * Get cost estimate in credits (for trial users)
   */
  static calculateCreditsRequired(
    complexity: FeatureComplexity,
    analysisCount: number = 1
  ): number {
    const creditCosts: Record<FeatureComplexity, number> = {
      small: 10,
      medium: 25,
      large: 50,
      extra_large: 100
    };
    return (creditCosts[complexity] || 10) * analysisCount;
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private static formatAnalysisName(type: string): string {
    return type
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private static formatArtifactName(type: string): string {
    const names: Record<string, string> = {
      report: 'PDF Report',
      dashboard: 'Interactive Dashboard',
      presentation: 'PowerPoint Presentation',
      exportData: 'Data Export'
    };
    return names[type] || this.formatAnalysisName(type);
  }

  private static estimateDuration(
    rows: number,
    analysisCount: number,
    complexity: string
  ): number {
    // Base time per 10K rows
    const baseTimePerUnit = 0.5; // minutes
    const rowUnits = Math.ceil(rows / 10000);

    // Complexity multipliers
    const complexityTime: Record<string, number> = {
      basic: 1,
      intermediate: 2,
      advanced: 4,
      expert: 8
    };

    const complexityFactor = complexityTime[complexity] || 2;

    // Calculate total
    return Math.max(1, Math.round(
      (rowUnits * baseTimePerUnit + analysisCount * 2) * complexityFactor
    ));
  }

  private static calculateConfidenceScore(
    dataSize: DataSize,
    analysisTypes: string[],
    complexity: string
  ): number {
    let score = 0.95; // Base confidence

    // Reduce for very small datasets
    if (dataSize.rows < 100) {
      score -= 0.15;
    } else if (dataSize.rows < 1000) {
      score -= 0.05;
    }

    // Reduce for complex analyses
    if (analysisTypes.some(t => ['machine_learning', 'predictive', 'prescriptive'].includes(t))) {
      score -= 0.05;
    }

    // Reduce for high complexity
    if (complexity === 'advanced') {
      score -= 0.05;
    } else if (complexity === 'expert') {
      score -= 0.10;
    }

    return Math.max(0.5, parseFloat(score.toFixed(2)));
  }
}

// Export singleton-style access
export const costEstimationService = CostEstimationService;
