/**
 * Unified Subscription Tiers
 * 
 * This file consolidates the conflicting subscription tier definitions from:
 * - shared/subscription-tiers.ts (simpler, focused on SMB market)
 * - server/services/enhanced-subscription-billing.ts (enterprise-grade with detailed tracking)
 * 
 * Decision: Use the simpler pricing structure from subscription-tiers.ts as it's more appropriate
 * for the SMB market, but incorporate the advanced features from enhanced-subscription-billing.ts
 */

export interface UnifiedSubscriptionTier {
  // Core Identity
  id: string;
  name: string;
  displayName: string;
  description: string;

  // Pricing (using simpler structure from subscription-tiers.ts)
  monthlyPrice: number;
  yearlyPrice: number; // 2 months free (10x monthly)
  stripeProductId?: string;
  stripePriceId?: string;

  // Feature Limits (consolidated from both systems)
  limits: {
    // File Operations (from subscription-tiers.ts)
    maxFiles: number;
    maxFileSizeMB: number;
    totalDataVolumeMB: number;
    
    // Analysis Features
    aiInsights: number;
    maxAnalysisComponents: number;
    maxVisualizations: number;
    dataTransformation: boolean;
    statisticalAnalysis: boolean;
    advancedInsights: boolean;
    piiDetection: boolean;
    
    // ML/LLM Features (new)
    mlBasic: boolean;              // Basic scikit-learn ML
    mlAdvanced: boolean;          // AutoML, XGBoost, LightGBM
    mlAutoML: boolean;             // Bayesian hyperparameter optimization
    modelExplainability: boolean;  // SHAP/LIME explainability
    llmFineTuning: boolean;        // LLM fine-tuning access
    llmLora: boolean;              // LoRA fine-tuning
    llmQlora: boolean;             // QLoRA fine-tuning
    llmFullFineTuning: boolean;    // Full LLM fine-tuning
    llmDistributed: boolean;       // Multi-GPU training
    customMLModels: boolean;       // Bring your own models
    
    // ML/LLM Quotas
    mlTrainingJobs: number;        // ML training jobs per month
    mlAutoMLTrials: number;        // AutoML optimization trials
    llmFineTuningJobs: number;     // LLM fine-tuning jobs per month
    
    // Export Options
    exportOptions: string[];
    
    // Enhanced Limits (from enhanced-subscription-billing.ts)
    maxStorageMB: number;
    maxDataProcessingMB: number;
    maxComputeMinutes: number;
    maxProjects: number;
    maxTeamMembers: number;
    maxApiCalls: number;
    maxAgentInteractions: number;
    maxToolExecutions: number;
    retentionDays: number;
  };

  // Support & Compliance
  support: {
    level: 'community' | 'email' | 'priority' | 'dedicated';
    responseTime: string;
    channels: string[];
  };

  // Journey-Based Pricing (from subscription-tiers.ts)
  journeyPricing: {
    'non-tech': number;      // Multiplier for AI-guided journey
    'business': number;      // Multiplier for template-based journey
    'technical': number;     // Multiplier for self-service journey
    'consultation': number;  // Multiplier for expert consultation
  };

  // Overage Pricing (from enhanced-subscription-billing.ts)
  overagePricing: {
    dataPerMB: number;
    computePerMinute: number;
    storagePerMB: number;
    agentInteractionCost: number;
    toolExecutionCost: number;
  };

  // Discounts (from enhanced-subscription-billing.ts)
  discounts: {
    dataProcessingDiscount: number; // percentage
    agentUsageDiscount: number;
    toolUsageDiscount: number;
    enterpriseDiscount: number;
  };

  // Compliance & Security
  compliance: {
    dataResidency: string[];
    certifications: string[];
    sla: number; // uptime percentage
  };
}

export const UNIFIED_SUBSCRIPTION_TIERS: Record<string, UnifiedSubscriptionTier> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    displayName: 'Trial',
    description: 'Perfect for testing our platform with basic analytics',
    
    // Pricing: $1 (minimal cost to prevent abuse)
    monthlyPrice: 1,
    yearlyPrice: 10, // 2 months free
    
    limits: {
      // File Operations
      maxFiles: 1,
      maxFileSizeMB: 10,
      totalDataVolumeMB: 10,
      
      // Analysis Features
      aiInsights: 1,
      maxAnalysisComponents: 5,
      maxVisualizations: 3,
      dataTransformation: false,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      
      // ML/LLM Features
      mlBasic: true,              // Basic scikit-learn ML
      mlAdvanced: false,          // NO AutoML, XGBoost, LightGBM
      mlAutoML: false,            // NO AutoML optimization
      modelExplainability: false,  // NO SHAP/LIME
      llmFineTuning: false,        // NO LLM fine-tuning
      llmLora: false,              // NO LoRA
      llmQlora: false,             // NO QLoRA
      llmFullFineTuning: false,    // NO full fine-tuning
      llmDistributed: false,       // NO multi-GPU
      customMLModels: false,       // NO custom models
      
      // ML/LLM Quotas
      mlTrainingJobs: 5,           // Limited ML jobs
      mlAutoMLTrials: 0,           // NO AutoML trials
      llmFineTuningJobs: 0,        // NO LLM jobs
      
      exportOptions: ['CSV'],
      
      // Enhanced Limits
      maxStorageMB: 100,
      maxDataProcessingMB: 10,
      maxComputeMinutes: 60,
      maxProjects: 1,
      maxTeamMembers: 1,
      maxApiCalls: 1000,
      maxAgentInteractions: 50,
      maxToolExecutions: 100,
      retentionDays: 30,
    },
    
    support: {
      level: 'community',
      responseTime: '48-72 hours',
      channels: ['documentation', 'community_forum']
    },
    
    journeyPricing: {
      'non-tech': 1.0,      // Full price for AI-guided
      'business': 1.0,      // Full price for template-based
      'technical': 1.0,     // Full price for self-service
      'consultation': 1.0,  // Full price for consultation
    },
    
    overagePricing: {
      dataPerMB: 0.01,
      computePerMinute: 0.05,
      storagePerMB: 0.002,
      agentInteractionCost: 0.02,
      toolExecutionCost: 0.01,
    },
    
    discounts: {
      dataProcessingDiscount: 0,
      agentUsageDiscount: 0,
      toolUsageDiscount: 0,
      enterpriseDiscount: 0,
    },
    
    compliance: {
      dataResidency: ['US'],
      certifications: ['SOC2'],
      sla: 99.0,
    },
  },
  
  starter: {
    id: 'starter',
    name: 'Starter',
    displayName: 'Starter',
    description: 'Great for small teams with basic data transformation needs',
    
    // Pricing: $10/month
    monthlyPrice: 10,
    yearlyPrice: 100, // 2 months free
    
    limits: {
      // File Operations
      maxFiles: 2,
      maxFileSizeMB: 50,
      totalDataVolumeMB: 100,
      
      // Analysis Features
      aiInsights: 3,
      maxAnalysisComponents: 15,
      maxVisualizations: 10,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      
      // ML/LLM Features
      mlBasic: true,              // Basic scikit-learn ML
      mlAdvanced: false,          // NO advanced ML
      mlAutoML: false,            // NO AutoML
      modelExplainability: true,   // YES SHAP/LIME
      llmFineTuning: false,        // NO LLM fine-tuning
      llmLora: false,              // NO LoRA
      llmQlora: false,             // NO QLoRA
      llmFullFineTuning: false,    // NO full fine-tuning
      llmDistributed: false,       // NO multi-GPU
      customMLModels: false,       // NO custom models
      
      // ML/LLM Quotas
      mlTrainingJobs: 50,          // More ML jobs
      mlAutoMLTrials: 0,           // NO AutoML trials
      llmFineTuningJobs: 0,        // NO LLM jobs
      
      exportOptions: ['CSV', 'Excel', 'PDF'],
      
      // Enhanced Limits
      maxStorageMB: 1000,
      maxDataProcessingMB: 100,
      maxComputeMinutes: 500,
      maxProjects: 5,
      maxTeamMembers: 3,
      maxApiCalls: 10000,
      maxAgentInteractions: 500,
      maxToolExecutions: 1000,
      retentionDays: 90,
    },
    
    support: {
      level: 'email',
      responseTime: '24-48 hours',
      channels: ['email', 'documentation', 'tutorials']
    },
    
    journeyPricing: {
      'non-tech': 0.8,      // 20% discount for AI-guided (most automated)
      'business': 0.9,      // 10% discount for template-based
      'technical': 1.0,     // Full price for self-service
      'consultation': 1.2,  // 20% premium for consultation
    },
    
    overagePricing: {
      dataPerMB: 0.008,
      computePerMinute: 0.04,
      storagePerMB: 0.0015,
      agentInteractionCost: 0.015,
      toolExecutionCost: 0.008,
    },
    
    discounts: {
      dataProcessingDiscount: 10,
      agentUsageDiscount: 5,
      toolUsageDiscount: 5,
      enterpriseDiscount: 0,
    },
    
    compliance: {
      dataResidency: ['US', 'EU'],
      certifications: ['SOC2', 'GDPR'],
      sla: 99.5,
    },
  },
  
  professional: {
    id: 'professional',
    name: 'Professional',
    displayName: 'Professional',
    description: 'Comprehensive analytics for growing businesses',
    
    // Pricing: $20/month
    monthlyPrice: 20,
    yearlyPrice: 200, // 2 months free
    
    limits: {
      // File Operations
      maxFiles: 5,
      maxFileSizeMB: 100,
      totalDataVolumeMB: 500,
      
      // Analysis Features
      aiInsights: 5,
      maxAnalysisComponents: 50,
      maxVisualizations: 25,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      
      // ML/LLM Features
      mlBasic: true,              // Basic scikit-learn ML
      mlAdvanced: true,           // YES AutoML, XGBoost, LightGBM
      mlAutoML: true,             // YES AutoML optimization
      modelExplainability: true,   // YES SHAP/LIME
      llmFineTuning: true,        // YES LLM fine-tuning
      llmLora: true,              // YES LoRA fine-tuning
      llmQlora: true,             // YES QLoRA fine-tuning
      llmFullFineTuning: false,    // NO full fine-tuning
      llmDistributed: false,       // NO multi-GPU
      customMLModels: false,       // NO custom models
      
      // ML/LLM Quotas
      mlTrainingJobs: 500,         // Many ML jobs
      mlAutoMLTrials: 1000,        // AutoML trials
      llmFineTuningJobs: 10,       // Limited LLM jobs
      
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON'],
      
      // Enhanced Limits
      maxStorageMB: 5000,
      maxDataProcessingMB: 500,
      maxComputeMinutes: 2500,
      maxProjects: 25,
      maxTeamMembers: 10,
      maxApiCalls: 50000,
      maxAgentInteractions: 2500,
      maxToolExecutions: 5000,
      retentionDays: 365,
    },
    
    support: {
      level: 'priority',
      responseTime: '4-12 hours',
      channels: ['phone', 'email', 'chat', 'dedicated_slack']
    },
    
    journeyPricing: {
      'non-tech': 0.7,      // 30% discount for AI-guided
      'business': 0.8,      // 20% discount for template-based
      'technical': 0.9,     // 10% discount for self-service
      'consultation': 1.1,  // 10% premium for consultation
    },
    
    overagePricing: {
      dataPerMB: 0.005,
      computePerMinute: 0.03,
      storagePerMB: 0.001,
      agentInteractionCost: 0.01,
      toolExecutionCost: 0.005,
    },
    
    discounts: {
      dataProcessingDiscount: 20,
      agentUsageDiscount: 15,
      toolUsageDiscount: 15,
      enterpriseDiscount: 5,
    },
    
    compliance: {
      dataResidency: ['US', 'EU', 'APAC'],
      certifications: ['SOC2', 'GDPR', 'HIPAA', 'ISO27001'],
      sla: 99.8,
    },
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    displayName: 'Enterprise',
    description: 'Full access to all features with premium support',
    
    // Pricing: $50/month (exactly 2× Professional as requested)
    monthlyPrice: 50,
    yearlyPrice: 500, // 2 months free
    
    limits: {
      // File Operations (exactly 2× Professional)
      maxFiles: 10, // 2× 5
      maxFileSizeMB: 200, // 2× 100
      totalDataVolumeMB: 1000, // 2× 500
      
      // Analysis Features
      aiInsights: 10, // 2× 5
      maxAnalysisComponents: 100, // 2× 50
      maxVisualizations: 50, // 2× 25
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      
      // ML/LLM Features
      mlBasic: true,              // Basic scikit-learn ML
      mlAdvanced: true,           // YES AutoML, XGBoost, LightGBM
      mlAutoML: true,             // YES AutoML optimization
      modelExplainability: true,   // YES SHAP/LIME
      llmFineTuning: true,        // YES LLM fine-tuning
      llmLora: true,              // YES LoRA fine-tuning
      llmQlora: true,             // YES QLoRA fine-tuning
      llmFullFineTuning: true,    // YES full LLM fine-tuning
      llmDistributed: true,       // YES multi-GPU training
      customMLModels: true,       // YES bring your own models
      
      // ML/LLM Quotas
      mlTrainingJobs: -1,         // Unlimited ML jobs
      mlAutoMLTrials: -1,         // Unlimited AutoML trials
      llmFineTuningJobs: 100,     // Higher LLM limit
      
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON', 'API'],
      
      // Enhanced Limits (generous for enterprise)
      maxStorageMB: 25000,
      maxDataProcessingMB: 2500,
      maxComputeMinutes: 10000,
      maxProjects: 100,
      maxTeamMembers: 50,
      maxApiCalls: 200000,
      maxAgentInteractions: 10000,
      maxToolExecutions: 25000,
      retentionDays: 1095, // 3 years
    },
    
    support: {
      level: 'dedicated',
      responseTime: '1-4 hours',
      channels: ['dedicated_phone', 'dedicated_email', 'slack_connect', 'teams', 'custom']
    },
    
    journeyPricing: {
      'non-tech': 0.6,      // 40% discount for AI-guided
      'business': 0.7,      // 30% discount for template-based
      'technical': 0.8,     // 20% discount for self-service
      'consultation': 1.0,  // No premium for consultation (included)
    },
    
    overagePricing: {
      dataPerMB: 0.002,
      computePerMinute: 0.02,
      storagePerMB: 0.0005,
      agentInteractionCost: 0.005,
      toolExecutionCost: 0.002,
    },
    
    discounts: {
      dataProcessingDiscount: 30,
      agentUsageDiscount: 25,
      toolUsageDiscount: 25,
      enterpriseDiscount: 15,
    },
    
    compliance: {
      dataResidency: ['US', 'EU', 'APAC', 'custom'],
      certifications: ['SOC2', 'GDPR', 'HIPAA', 'ISO27001', 'FedRAMP', 'custom'],
      sla: 99.95,
    },
  },
};

// Union type of supported subscription tier IDs plus 'none' for pay-per-use users
export type UnifiedSubscriptionTierId = keyof typeof UNIFIED_SUBSCRIPTION_TIERS | 'none';

/**
 * Get tier limits for a given subscription tier
 */
export function getUnifiedTierLimits(tier: string) {
  return UNIFIED_SUBSCRIPTION_TIERS[tier]?.limits || UNIFIED_SUBSCRIPTION_TIERS.trial.limits;
}

/**
 * Get complete tier information
 */
export function getUnifiedTier(tier: string) {
  return UNIFIED_SUBSCRIPTION_TIERS[tier] || UNIFIED_SUBSCRIPTION_TIERS.trial;
}

/**
 * Check if user can upload based on unified tier limits
 */
export function canUserUploadUnified(userTier: string, currentUploads: number, fileSizeMB: number, currentDataVolumeMB: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getUnifiedTierLimits(userTier);
  
  if (limits.maxFiles !== -1 && currentUploads >= limits.maxFiles) {
    return {
      allowed: false,
      reason: `Upload limit reached. Your ${userTier} plan allows ${limits.maxFiles} file(s) per month.`
    };
  }
  
  if (limits.maxFileSizeMB !== -1 && fileSizeMB > limits.maxFileSizeMB) {
    return {
      allowed: false,
      reason: `File too large. Your ${userTier} plan allows files up to ${limits.maxFileSizeMB}MB.`
    };
  }
  
  if (limits.totalDataVolumeMB !== -1 && (currentDataVolumeMB + fileSizeMB) > limits.totalDataVolumeMB) {
    return {
      allowed: false,
      reason: `Data volume limit exceeded. Your ${userTier} plan allows ${limits.totalDataVolumeMB}MB total per month.`
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can request AI insight based on unified tier limits
 */
export function canUserRequestAIInsightUnified(userTier: string, currentInsights: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getUnifiedTierLimits(userTier);
  
  if (limits.aiInsights !== -1 && currentInsights >= limits.aiInsights) {
    return {
      allowed: false,
      reason: `AI insight limit reached. Your ${userTier} plan allows ${limits.aiInsights} insight(s) per month.`
    };
  }
  
  return { allowed: true };
}

/**
 * Calculate journey-specific pricing based on unified tiers
 */
export function calculateJourneyPricing(tier: string, journeyType: 'non-tech' | 'business' | 'technical' | 'consultation', basePrice: number): number {
  const tierInfo = getUnifiedTier(tier);
  const multiplier = tierInfo.journeyPricing[journeyType];
  return basePrice * multiplier;
}

/**
 * Get all subscription tiers as array
 */
export function getAllUnifiedTiers(): UnifiedSubscriptionTier[] {
  return Object.values(UNIFIED_SUBSCRIPTION_TIERS);
}

/**
 * Migration helper: Convert old tier format to unified format
 */
export function migrateToUnifiedTier(oldTier: any): UnifiedSubscriptionTier {
  // This function helps migrate existing tier data to the new unified format
  const tierId = oldTier.id || oldTier.tier || 'trial';
  return getUnifiedTier(tierId);
}

/**
 * ML/LLM Feature Access Functions
 */

/**
 * Check if user has access to basic ML features
 */
export function hasMLBasicFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.mlBasic;
}

/**
 * Check if user has access to advanced ML features (AutoML, XGBoost, LightGBM)
 */
export function hasMLAdvancedFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.mlAdvanced;
}

/**
 * Check if user has access to AutoML optimization
 */
export function hasMLAutoMLFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.mlAutoML;
}

/**
 * Check if user has access to model explainability (SHAP/LIME)
 */
export function hasModelExplainabilityFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.modelExplainability;
}

/**
 * Check if user has access to LLM fine-tuning
 */
export function hasLLMFineTuningFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.llmFineTuning;
}

/**
 * Check if user has access to LoRA fine-tuning
 */
export function hasLLMLoraFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.llmLora;
}

/**
 * Check if user has access to QLoRA fine-tuning
 */
export function hasLLMQloraFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.llmQlora;
}

/**
 * Check if user has access to full LLM fine-tuning
 */
export function hasLLMFullFineTuningFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.llmFullFineTuning;
}

/**
 * Check if user has access to distributed LLM training
 */
export function hasLLMDistributedFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.llmDistributed;
}

/**
 * Check if user has access to custom ML models
 */
export function hasCustomMLModelsFeature(userTier: string): boolean {
  const limits = getUnifiedTierLimits(userTier);
  return limits.customMLModels;
}

/**
 * Check if user can execute ML training job
 */
export function canUserExecuteMLTraining(userTier: string, currentJobs: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getUnifiedTierLimits(userTier);
  
  if (limits.mlTrainingJobs !== -1 && currentJobs >= limits.mlTrainingJobs) {
    return {
      allowed: false,
      reason: `ML training job limit reached. Your ${userTier} plan allows ${limits.mlTrainingJobs} ML training job(s) per month.`
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can execute AutoML trials
 */
export function canUserExecuteAutoML(userTier: string, currentTrials: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getUnifiedTierLimits(userTier);
  
  if (limits.mlAutoMLTrials !== -1 && currentTrials >= limits.mlAutoMLTrials) {
    return {
      allowed: false,
      reason: `AutoML trial limit reached. Your ${userTier} plan allows ${limits.mlAutoMLTrials} AutoML trial(s) per month.`
    };
  }
  
  return { allowed: true };
}

/**
 * Check if user can execute LLM fine-tuning job
 */
export function canUserExecuteLLMFineTuning(userTier: string, currentJobs: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getUnifiedTierLimits(userTier);
  
  if (limits.llmFineTuningJobs !== -1 && currentJobs >= limits.llmFineTuningJobs) {
    return {
      allowed: false,
      reason: `LLM fine-tuning job limit reached. Your ${userTier} plan allows ${limits.llmFineTuningJobs} LLM fine-tuning job(s) per month.`
    };
  }
  
  return { allowed: true };
}

