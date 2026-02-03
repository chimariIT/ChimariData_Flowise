/**
 * Cost Estimation Service - Thin Wrapper
 *
 * CONSOLIDATED: Analysis pricing logic now lives in UnifiedBillingService.
 * This file delegates all calls to the unified service for backward compatibility.
 * All 18+ import sites continue to work without changes.
 */

import { getBillingService } from './billing/unified-billing-service';
import type { AnalysisPricingConfig, AnalysisCostEstimate } from './billing/unified-billing-service';
import { FeatureComplexity } from '@shared/canonical-types';

// Re-export types for backward compatibility
export type { AnalysisPricingConfig, AnalysisCostEstimate };

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

/**
 * Thin wrapper - delegates to UnifiedBillingService
 */
export class CostEstimationService {

  static async loadPricingConfig(): Promise<AnalysisPricingConfig> {
    return getBillingService().loadAnalysisPricingConfig();
  }

  static async savePricingConfig(config: Partial<AnalysisPricingConfig>): Promise<boolean> {
    return getBillingService().saveAnalysisPricingConfig(config);
  }

  static async estimateAnalysisCost(
    projectId: string,
    analysisTypes: string[],
    dataSize: DataSize,
    complexity: 'basic' | 'intermediate' | 'advanced' | 'expert' = 'intermediate',
    includeArtifacts: string[] = ['report']
  ): Promise<CostEstimate> {
    return getBillingService().estimateAnalysisCost(
      projectId, analysisTypes, dataSize, complexity, includeArtifacts
    );
  }

  static async calculateOverageCost(
    userId: string,
    usageType: 'data_processing' | 'analysis' | 'storage' | 'ai_queries',
    amount: number
  ): Promise<{ cost: number; units: string; rate: number }> {
    return getBillingService().calculateConsumptionCost(userId, usageType, amount)
      .then(result => ({ cost: result, units: 'units', rate: result / Math.max(amount, 1) }));
  }

  static calculateCreditsRequired(
    complexity: FeatureComplexity,
    analysisCount: number = 1
  ): number {
    return getBillingService().calculateAnalysisCreditsRequired(complexity, analysisCount);
  }
}

// Export singleton-style access for backward compatibility
export const costEstimationService = CostEstimationService;
