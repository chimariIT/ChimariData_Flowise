/**
 * ML & LLM Pricing Service
 *
 * Centralized service for calculating billing units and costs
 * Supports admin-configurable pricing from database
 */

import {
  MLPricingTier,
  LLMPricingTier,
  FeatureAccessConfig,
  PricingCalculation,
  SubscriptionTierId,
  DEFAULT_ML_PRICING,
  DEFAULT_LLM_PRICING,
  DEFAULT_FEATURE_ACCESS
} from '@shared/ml-llm-pricing-config';

/**
 * Pricing Service
 *
 * Handles all ML/LLM pricing calculations
 * Can load custom pricing from database or use defaults
 */
export class MLLLMPricingService {
  private mlPricing: MLPricingTier;
  private llmPricing: LLMPricingTier;
  private featureAccess: FeatureAccessConfig;

  constructor(
    mlPricing?: MLPricingTier,
    llmPricing?: LLMPricingTier,
    featureAccess?: FeatureAccessConfig
  ) {
    this.mlPricing = mlPricing || DEFAULT_ML_PRICING;
    this.llmPricing = llmPricing || DEFAULT_LLM_PRICING;
    this.featureAccess = featureAccess || DEFAULT_FEATURE_ACCESS;
  }

  /**
   * Calculate ML training cost
   */
  calculateMLTrainingCost(params: {
    datasetSize: number;
    useAutoML: boolean;
    useExplainability: boolean;
    library: 'sklearn' | 'lightgbm' | 'xgboost' | 'spark' | 'tensorflow';
  }): PricingCalculation {
    const { datasetSize, useAutoML, useExplainability, library } = params;

    // Determine data volume tier
    const volumeTier = this.getDataVolumeTier(datasetSize);

    // Calculate base units
    const baseUnits = datasetSize * this.mlPricing.baseUnitsPerRow;

    // Apply multipliers
    const dataVolumeMultiplier = volumeTier.multiplier;
    const featureMultiplier =
      (useAutoML ? this.mlPricing.autoMLMultiplier : 1) *
      (useExplainability ? this.mlPricing.explainabilityMultiplier : 1);
    const libraryMultiplier = this.mlPricing.libraryMultipliers[library] || 1;

    const totalUnits = Math.ceil(
      baseUnits * dataVolumeMultiplier * featureMultiplier * libraryMultiplier
    );

    // Build cost breakdown
    const breakdown = [
      {
        component: 'Base (data volume)',
        units: Math.ceil(baseUnits),
        cost: Math.ceil(baseUnits) * this.featureAccess.payPerUse.mlTrainingCostPerUnit
      }
    ];

    if (dataVolumeMultiplier > 1) {
      breakdown.push({
        component: `Data volume tier (${volumeTier.maxRows} rows)`,
        units: Math.ceil(baseUnits * (dataVolumeMultiplier - 1)),
        cost: Math.ceil(baseUnits * (dataVolumeMultiplier - 1)) * this.featureAccess.payPerUse.mlTrainingCostPerUnit
      });
    }

    if (useAutoML) {
      breakdown.push({
        component: 'AutoML',
        units: Math.ceil(baseUnits * (this.mlPricing.autoMLMultiplier - 1)),
        cost: Math.ceil(baseUnits * (this.mlPricing.autoMLMultiplier - 1)) * this.featureAccess.payPerUse.mlTrainingCostPerUnit
      });
    }

    if (useExplainability) {
      breakdown.push({
        component: 'Explainability (SHAP/LIME)',
        units: Math.ceil(baseUnits * (this.mlPricing.explainabilityMultiplier - 1)),
        cost: Math.ceil(baseUnits * (this.mlPricing.explainabilityMultiplier - 1)) * this.featureAccess.payPerUse.mlTrainingCostPerUnit
      });
    }

    if (libraryMultiplier > 1) {
      breakdown.push({
        component: `Library (${library})`,
        units: Math.ceil(baseUnits * (libraryMultiplier - 1)),
        cost: Math.ceil(baseUnits * (libraryMultiplier - 1)) * this.featureAccess.payPerUse.mlTrainingCostPerUnit
      });
    }

    const estimatedCost = Math.max(
      totalUnits * this.featureAccess.payPerUse.mlTrainingCostPerUnit,
      this.featureAccess.payPerUse.minimumCharge
    );

    return {
      baseUnits,
      multipliers: {
        dataVolume: dataVolumeMultiplier,
        feature: featureMultiplier,
        library: libraryMultiplier
      },
      totalUnits,
      estimatedCost,
      breakdown
    };
  }

  /**
   * Calculate AutoML optimization cost
   */
  calculateAutoMLCost(params: {
    trials: number;
    datasetSize: number;
  }): PricingCalculation {
    const { trials, datasetSize } = params;

    const baseUnits = trials * this.mlPricing.autoMLUnitsPerTrial;
    const volumeTier = this.getDataVolumeTier(datasetSize);
    const totalUnits = Math.ceil(baseUnits * volumeTier.multiplier);

    const estimatedCost = Math.max(
      totalUnits * this.featureAccess.payPerUse.mlTrainingCostPerUnit,
      this.featureAccess.payPerUse.minimumCharge
    );

    return {
      baseUnits,
      multipliers: {
        dataVolume: volumeTier.multiplier,
        feature: 1,
        library: 1
      },
      totalUnits,
      estimatedCost,
      breakdown: [
        {
          component: `AutoML (${trials} trials)`,
          units: totalUnits,
          cost: estimatedCost
        }
      ]
    };
  }

  /**
   * Calculate LLM fine-tuning cost
   */
  calculateLLMFineTuningCost(params: {
    method: 'full' | 'lora' | 'qlora' | 'prefix_tuning' | 'prompt_tuning';
    numEpochs: number;
    trainSamples: number;
    modelSize: 'small' | 'medium' | 'large' | 'xlarge';
  }): PricingCalculation {
    const { method, numEpochs, trainSamples, modelSize } = params;

    // Base cost per 1K samples per epoch
    const baseCostPer1K = this.llmPricing.methodCosts[method] || 5;
    const samplesInK = trainSamples / 1000;
    const modelMultiplier = this.llmPricing.modelSizeMultipliers[modelSize] || 1;

    const baseUnits = baseCostPer1K * samplesInK * numEpochs;
    const totalUnits = Math.ceil(baseUnits * modelMultiplier);

    const estimatedCost = Math.max(
      totalUnits * this.featureAccess.payPerUse.llmFineTuningCostPerUnit,
      this.featureAccess.payPerUse.minimumCharge
    );

    return {
      baseUnits,
      multipliers: {
        dataVolume: 1,
        feature: 1,
        library: 1,
        modelSize: modelMultiplier
      },
      totalUnits,
      estimatedCost,
      breakdown: [
        {
          component: `${method} fine-tuning`,
          units: Math.ceil(baseUnits),
          cost: Math.ceil(baseUnits) * this.featureAccess.payPerUse.llmFineTuningCostPerUnit
        },
        {
          component: `Model size (${modelSize})`,
          units: Math.ceil(baseUnits * (modelMultiplier - 1)),
          cost: Math.ceil(baseUnits * (modelMultiplier - 1)) * this.featureAccess.payPerUse.llmFineTuningCostPerUnit
        }
      ]
    };
  }

  /**
   * Check if user can access a tool based on subscription tier
   */
  canAccessTool(toolName: string, tier: SubscriptionTierId): boolean {
    if (tier === 'none') {
      // Pay-per-use users can access all tools but pay for usage
      return true;
    }

    const allowedTools = this.featureAccess.tierAccess[tier] || [];
    return allowedTools.includes(toolName);
  }

  /**
   * Check if user has remaining quota
   */
  checkQuota(params: {
    tier: SubscriptionTierId;
    operationType: 'ml' | 'llm';
    currentUsage: {
      mlTrainings: number;
      llmFineTunings: number;
      dataRowsProcessed: number;
      gpuHoursUsed: number;
    };
    requestedDataRows?: number;
  }): {
    allowed: boolean;
    reason?: string;
    remaining?: {
      mlTrainings: number;
      llmFineTunings: number;
      dataRows: number;
      gpuHours: number;
    };
  } {
    const { tier, operationType, currentUsage, requestedDataRows = 0 } = params;

    if (tier === 'none') {
      // Pay-per-use users have no quotas
      return { allowed: true };
    }

    const quota = this.featureAccess.quotas[tier];
    if (!quota) {
      return { allowed: false, reason: 'Invalid subscription tier' };
    }

    // Check ML training quota
    if (operationType === 'ml') {
      if (quota.maxMLTrainings !== -1 && currentUsage.mlTrainings >= quota.maxMLTrainings) {
        return {
          allowed: false,
          reason: `ML training quota exceeded. Your ${tier} plan allows ${quota.maxMLTrainings} trainings per month.`
        };
      }

      // Check data rows quota
      if (quota.maxDataRows !== -1 && (currentUsage.dataRowsProcessed + requestedDataRows) > quota.maxDataRows) {
        return {
          allowed: false,
          reason: `Data rows quota exceeded. Your ${tier} plan allows ${quota.maxDataRows} rows per month.`
        };
      }
    }

    // Check LLM fine-tuning quota
    if (operationType === 'llm') {
      if (quota.maxLLMFineTunings !== -1 && currentUsage.llmFineTunings >= quota.maxLLMFineTunings) {
        return {
          allowed: false,
          reason: `LLM fine-tuning quota exceeded. Your ${tier} plan allows ${quota.maxLLMFineTunings} fine-tunings per month.`
        };
      }
    }

    // Calculate remaining quota
    const remaining = {
      mlTrainings: quota.maxMLTrainings === -1 ? -1 : quota.maxMLTrainings - currentUsage.mlTrainings,
      llmFineTunings: quota.maxLLMFineTunings === -1 ? -1 : quota.maxLLMFineTunings - currentUsage.llmFineTunings,
      dataRows: quota.maxDataRows === -1 ? -1 : quota.maxDataRows - currentUsage.dataRowsProcessed,
      gpuHours: quota.maxGPUHours === -1 ? -1 : quota.maxGPUHours - currentUsage.gpuHoursUsed
    };

    return { allowed: true, remaining };
  }

  /**
   * Get data volume tier based on dataset size
   */
  private getDataVolumeTier(datasetSize: number): { maxRows: number; multiplier: number } {
    if (datasetSize < this.mlPricing.dataVolumeTiers.small.maxRows) {
      return this.mlPricing.dataVolumeTiers.small;
    } else if (datasetSize < this.mlPricing.dataVolumeTiers.medium.maxRows) {
      return this.mlPricing.dataVolumeTiers.medium;
    } else {
      return this.mlPricing.dataVolumeTiers.large;
    }
  }

  /**
   * Update pricing configuration (admin only)
   */
  updateMLPricing(newPricing: Partial<MLPricingTier>): void {
    this.mlPricing = { ...this.mlPricing, ...newPricing };
  }

  updateLLMPricing(newPricing: Partial<LLMPricingTier>): void {
    this.llmPricing = { ...this.llmPricing, ...newPricing };
  }

  updateFeatureAccess(newAccess: Partial<FeatureAccessConfig>): void {
    this.featureAccess = { ...this.featureAccess, ...newAccess };
  }

  /**
   * Get current pricing configuration
   */
  getMLPricing(): MLPricingTier {
    return { ...this.mlPricing };
  }

  getLLMPricing(): LLMPricingTier {
    return { ...this.llmPricing };
  }

  getFeatureAccess(): FeatureAccessConfig {
    return { ...this.featureAccess };
  }
}

// Export singleton instance
export const mlLLMPricingService = new MLLLMPricingService();
