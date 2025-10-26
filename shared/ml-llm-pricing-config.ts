/**
 * ML & LLM Pricing Configuration
 *
 * Admin-configurable pricing for ML and LLM features
 * All values can be modified via admin dashboard
 */

export interface MLPricingTier {
  // Data volume-based pricing
  baseUnitsPerRow: number;          // Units per row of data
  dataVolumeTiers: {
    small: { maxRows: number; multiplier: number };     // < threshold
    medium: { maxRows: number; multiplier: number };    // threshold - 10M
    large: { maxRows: number; multiplier: number };     // > 10M
  };

  // Feature-based pricing
  autoMLMultiplier: number;          // Additional cost for AutoML
  explainabilityMultiplier: number;  // Additional cost for SHAP/LIME

  // AutoML-specific
  autoMLUnitsPerTrial: number;       // Units per optimization trial

  // Library-specific multipliers
  libraryMultipliers: {
    sklearn: number;
    lightgbm: number;
    xgboost: number;
    spark: number;
    tensorflow: number;
  };
}

export interface LLMPricingTier {
  // Method-based pricing (cost per 1K samples per epoch)
  methodCosts: {
    full: number;
    lora: number;
    qlora: number;
    prefix_tuning: number;
    prompt_tuning: number;
  };

  // Model size multipliers
  modelSizeMultipliers: {
    small: number;     // < 1B params
    medium: number;    // 1-7B params
    large: number;     // 7-20B params
    xlarge: number;    // > 20B params
  };

  // Compute-based pricing
  gpuHourRate: number;               // Units per GPU hour
  cpuHourRate: number;               // Units per CPU hour
}

export interface FeatureAccessConfig {
  // Subscription tier eligibility
  tierAccess: {
    trial: string[];        // List of tool names accessible
    starter: string[];
    professional: string[];
    enterprise: string[];
  };

  // Feature quotas by tier
  quotas: {
    trial: {
      maxMLTrainings: number;
      maxLLMFineTunings: number;
      maxDataRows: number;
      maxGPUHours: number;
    };
    starter: {
      maxMLTrainings: number;
      maxLLMFineTunings: number;
      maxDataRows: number;
      maxGPUHours: number;
    };
    professional: {
      maxMLTrainings: number;
      maxLLMFineTunings: number;
      maxDataRows: number;
      maxGPUHours: number;
    };
    enterprise: {
      maxMLTrainings: number;
      maxLLMFineTunings: number;
      maxDataRows: number;
      maxGPUHours: number;
    };
  };

  // Pay-per-use pricing (for non-subscription users)
  payPerUse: {
    mlTrainingCostPerUnit: number;     // $ per billing unit
    llmFineTuningCostPerUnit: number;  // $ per billing unit
    minimumCharge: number;              // Minimum charge per operation
  };
}

/**
 * DEFAULT PRICING CONFIGURATION
 * These are sensible defaults - admins can override via database
 */
export const DEFAULT_ML_PRICING: MLPricingTier = {
  baseUnitsPerRow: 0.0001,  // 1 unit per 10K rows

  dataVolumeTiers: {
    small: { maxRows: 100000, multiplier: 1.0 },      // < 100K: 1x
    medium: { maxRows: 10000000, multiplier: 1.5 },   // 100K-10M: 1.5x
    large: { maxRows: Infinity, multiplier: 2.0 }     // > 10M: 2x
  },

  autoMLMultiplier: 5.0,           // AutoML is 5x base cost
  explainabilityMultiplier: 1.5,   // SHAP/LIME adds 50%

  autoMLUnitsPerTrial: 0.1,        // 1 unit per 10 trials

  libraryMultipliers: {
    sklearn: 1.0,       // Baseline
    lightgbm: 1.2,      // Faster but slightly more expensive
    xgboost: 1.3,       // More powerful, higher cost
    spark: 2.5,         // Distributed processing premium
    tensorflow: 3.0     // GPU usage premium
  }
};

export const DEFAULT_LLM_PRICING: LLMPricingTier = {
  methodCosts: {
    full: 10,             // $10 per 1K samples per epoch
    lora: 3,              // $3 per 1K samples per epoch
    qlora: 2,             // $2 per 1K samples per epoch
    prefix_tuning: 1.5,   // $1.50 per 1K samples per epoch
    prompt_tuning: 1.0    // $1 per 1K samples per epoch
  },

  modelSizeMultipliers: {
    small: 1.0,    // < 1B params
    medium: 2.0,   // 1-7B params (2x)
    large: 5.0,    // 7-20B params (5x)
    xlarge: 10.0   // > 20B params (10x)
  },

  gpuHourRate: 50,   // 50 units per GPU hour
  cpuHourRate: 5     // 5 units per CPU hour
};

export const DEFAULT_FEATURE_ACCESS: FeatureAccessConfig = {
  tierAccess: {
    trial: [
      'ml_library_selector',
      'ml_health_check',
      'llm_method_recommendation',
      'llm_health_check'
    ],
    starter: [
      'ml_library_selector',
      'ml_health_check',
      'llm_method_recommendation',
      'llm_health_check',
      'comprehensive_ml_pipeline'  // Basic ML only
    ],
    professional: [
      'ml_library_selector',
      'ml_health_check',
      'comprehensive_ml_pipeline',
      'automl_optimizer',
      'llm_method_recommendation',
      'llm_health_check',
      'lora_fine_tuning',
      'llm_fine_tuning'
    ],
    enterprise: [
      // All tools available
      'ml_library_selector',
      'ml_health_check',
      'comprehensive_ml_pipeline',
      'automl_optimizer',
      'llm_method_recommendation',
      'llm_health_check',
      'lora_fine_tuning',
      'llm_fine_tuning'
    ]
  },

  quotas: {
    trial: {
      maxMLTrainings: 2,
      maxLLMFineTunings: 0,
      maxDataRows: 10000,
      maxGPUHours: 0
    },
    starter: {
      maxMLTrainings: 10,
      maxLLMFineTunings: 1,
      maxDataRows: 100000,
      maxGPUHours: 1
    },
    professional: {
      maxMLTrainings: 50,
      maxLLMFineTunings: 10,
      maxDataRows: 1000000,
      maxGPUHours: 10
    },
    enterprise: {
      maxMLTrainings: -1,  // Unlimited
      maxLLMFineTunings: -1,  // Unlimited
      maxDataRows: -1,  // Unlimited
      maxGPUHours: -1  // Unlimited
    }
  },

  payPerUse: {
    mlTrainingCostPerUnit: 0.01,       // $0.01 per unit
    llmFineTuningCostPerUnit: 0.05,    // $0.05 per unit
    minimumCharge: 0.10                 // $0.10 minimum per operation
  }
};

/**
 * Pricing Calculator Interface
 */
export interface PricingCalculation {
  baseUnits: number;
  multipliers: {
    dataVolume: number;
    feature: number;
    library: number;
    modelSize?: number;
  };
  totalUnits: number;
  estimatedCost: number;
  breakdown: {
    component: string;
    units: number;
    cost: number;
  }[];
}

export type SubscriptionTierId = 'trial' | 'starter' | 'professional' | 'enterprise' | 'none';
