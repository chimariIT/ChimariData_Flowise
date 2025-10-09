// Enhanced Subscription Tiers with Feature-Based Management
// This replaces the old subscription-tiers.ts with a comprehensive feature-based system

import { FeatureDefinition, FeatureComplexity, getFeatureDefinition } from './feature-definitions';

export interface FeatureLimit {
  featureId: string;
  maxComplexity: FeatureComplexity;
  monthlyLimits: {
    [key in FeatureComplexity]: number;
  };
  enabled: boolean;
}

export interface EnhancedSubscriptionTier {
  id: string;
  name: string;
  price: number; // Monthly price in cents
  description: string;
  features: FeatureLimit[];
  
  // Legacy compatibility - these will be calculated from feature limits
  legacyFeatures: {
    maxFiles: number;
    maxFileSizeMB: number;
    aiInsights: number;
    maxAnalysisComponents: number;
    maxVisualizations: number;
    dataTransformation: boolean;
    statisticalAnalysis: boolean;
    advancedInsights: boolean;
    piiDetection: boolean;
    exportOptions: string[];
    support: string;
    totalDataVolumeMB: number;
  };
  
  // Usage categories with monthly limits - aligned with billing service
  usageLimits: {
    storageCapacityMB: number;
    analysisComplexityUnits: number;
    dataIngestionSizeMB: number;
    dataTransformationComplexityUnits: number;
    artifactsComplexityUnits: number;
    // Legacy limits for backward compatibility
    dataVolumeMB: number;
    aiInsights: number;
    analysisComponents: number;
    visualizations: number;
    fileUploads: number;
  };
  
  // Journey-specific pricing multipliers (base price * multiplier)
  journeyPricing: {
    'non-tech': number;
    'business': number;
    'technical': number;
    'consultation': number;
  };
  
  stripeProductId?: string;
  stripePriceId?: string;
}

// Enhanced subscription tiers with feature-based limits
export const ENHANCED_SUBSCRIPTION_TIERS: Record<string, EnhancedSubscriptionTier> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    price: 100, // $1.00 in cents
    description: 'Perfect for testing our platform with basic analytics and a small dataset',
    features: [
      {
        featureId: 'file_upload',
        maxComplexity: 'small',
        monthlyLimits: { small: 2, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_validation',
        maxComplexity: 'small',
        monthlyLimits: { small: 5, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_transformation',
        maxComplexity: 'small',
        monthlyLimits: { small: 3, medium: 0, large: 0, extra_large: 0 },
        enabled: false
      },
      {
        featureId: 'statistical_analysis',
        maxComplexity: 'small',
        monthlyLimits: { small: 5, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'machine_learning',
        maxComplexity: 'small',
        monthlyLimits: { small: 1, medium: 0, large: 0, extra_large: 0 },
        enabled: false
      },
      {
        featureId: 'ai_insights',
        maxComplexity: 'small',
        monthlyLimits: { small: 1, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'visualization',
        maxComplexity: 'small',
        monthlyLimits: { small: 3, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'artifacts',
        maxComplexity: 'small',
        monthlyLimits: { small: 2, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'exports',
        maxComplexity: 'small',
        monthlyLimits: { small: 5, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'dashboards',
        maxComplexity: 'small',
        monthlyLimits: { small: 1, medium: 0, large: 0, extra_large: 0 },
        enabled: false
      }
    ],
    legacyFeatures: {
      maxFiles: 2,
      maxFileSizeMB: 10,
      aiInsights: 1,
      maxAnalysisComponents: 5,
      maxVisualizations: 3,
      dataTransformation: false,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      exportOptions: ['CSV'],
      support: 'Community',
      totalDataVolumeMB: 25
    },
    usageLimits: {
      storageCapacityMB: 25,
      analysisComplexityUnits: 5,
      dataIngestionSizeMB: 10,
      dataTransformationComplexityUnits: 5,
      artifactsComplexityUnits: 15,
      dataVolumeMB: 25,
      aiInsights: 1,
      analysisComponents: 5,
      visualizations: 3,
      fileUploads: 2
    },
    journeyPricing: {
      'non-tech': 25,
      'business': 35,
      'technical': 45,
      'consultation': 99
    }
  },
  
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 1000, // $10.00 in cents
    description: 'Great for small teams with basic data transformation needs',
    features: [
      {
        featureId: 'file_upload',
        maxComplexity: 'medium',
        monthlyLimits: { small: 10, medium: 5, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_validation',
        maxComplexity: 'medium',
        monthlyLimits: { small: 25, medium: 10, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_transformation',
        maxComplexity: 'medium',
        monthlyLimits: { small: 15, medium: 5, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'statistical_analysis',
        maxComplexity: 'medium',
        monthlyLimits: { small: 20, medium: 8, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'machine_learning',
        maxComplexity: 'small',
        monthlyLimits: { small: 3, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'ai_insights',
        maxComplexity: 'medium',
        monthlyLimits: { small: 10, medium: 3, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'visualization',
        maxComplexity: 'medium',
        monthlyLimits: { small: 15, medium: 5, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'artifacts',
        maxComplexity: 'medium',
        monthlyLimits: { small: 10, medium: 3, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'exports',
        maxComplexity: 'medium',
        monthlyLimits: { small: 25, medium: 10, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'dashboards',
        maxComplexity: 'small',
        monthlyLimits: { small: 3, medium: 0, large: 0, extra_large: 0 },
        enabled: true
      }
    ],
    legacyFeatures: {
      maxFiles: 2,
      maxFileSizeMB: 50,
      aiInsights: 3,
      maxAnalysisComponents: 15,
      maxVisualizations: 10,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF'],
      support: 'Email',
      totalDataVolumeMB: 500
    },
    usageLimits: {
      storageCapacityMB: 500,
      analysisComplexityUnits: 50,
      dataIngestionSizeMB: 250,
      dataTransformationComplexityUnits: 25,
      artifactsComplexityUnits: 75,
      dataVolumeMB: 500,
      aiInsights: 3,
      analysisComponents: 15,
      visualizations: 10,
      fileUploads: 2
    },
    journeyPricing: {
      'non-tech': 20,
      'business': 30,
      'technical': 40,
      'consultation': 89
    }
  },
  
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 2000, // $20.00 in cents
    description: 'Comprehensive analytics for growing businesses',
    features: [
      {
        featureId: 'file_upload',
        maxComplexity: 'large',
        monthlyLimits: { small: 25, medium: 15, large: 5, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_validation',
        maxComplexity: 'large',
        monthlyLimits: { small: 50, medium: 25, large: 8, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'data_transformation',
        maxComplexity: 'large',
        monthlyLimits: { small: 30, medium: 15, large: 5, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'statistical_analysis',
        maxComplexity: 'large',
        monthlyLimits: { small: 40, medium: 20, large: 8, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'machine_learning',
        maxComplexity: 'medium',
        monthlyLimits: { small: 10, medium: 5, large: 0, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'ai_insights',
        maxComplexity: 'large',
        monthlyLimits: { small: 25, medium: 10, large: 3, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'visualization',
        maxComplexity: 'large',
        monthlyLimits: { small: 30, medium: 15, large: 5, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'artifacts',
        maxComplexity: 'large',
        monthlyLimits: { small: 20, medium: 10, large: 3, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'exports',
        maxComplexity: 'large',
        monthlyLimits: { small: 50, medium: 25, large: 8, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'dashboards',
        maxComplexity: 'medium',
        monthlyLimits: { small: 10, medium: 5, large: 0, extra_large: 0 },
        enabled: true
      }
    ],
    legacyFeatures: {
      maxFiles: 5,
      maxFileSizeMB: 100,
      aiInsights: 5,
      maxAnalysisComponents: 50,
      maxVisualizations: 25,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON'],
      support: 'Priority Email',
      totalDataVolumeMB: 2000
    },
    usageLimits: {
      storageCapacityMB: 2000,
      analysisComplexityUnits: 200,
      dataIngestionSizeMB: 1000,
      dataTransformationComplexityUnits: 100,
      artifactsComplexityUnits: 300,
      dataVolumeMB: 2000,
      aiInsights: 5,
      analysisComponents: 50,
      visualizations: 25,
      fileUploads: 5
    },
    journeyPricing: {
      'non-tech': 15,
      'business': 25,
      'technical': 35,
      'consultation': 79
    }
  },
  
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 5000, // $50.00 in cents
    description: 'Full access to all features with premium support',
    features: [
      {
        featureId: 'file_upload',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 50, medium: 30, large: 15, extra_large: 5 },
        enabled: true
      },
      {
        featureId: 'data_validation',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 100, medium: 50, large: 20, extra_large: 5 },
        enabled: true
      },
      {
        featureId: 'data_transformation',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 60, medium: 30, large: 15, extra_large: 3 },
        enabled: true
      },
      {
        featureId: 'statistical_analysis',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 80, medium: 40, large: 20, extra_large: 5 },
        enabled: true
      },
      {
        featureId: 'machine_learning',
        maxComplexity: 'large',
        monthlyLimits: { small: 20, medium: 10, large: 5, extra_large: 0 },
        enabled: true
      },
      {
        featureId: 'ai_insights',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 50, medium: 25, large: 10, extra_large: 2 },
        enabled: true
      },
      {
        featureId: 'visualization',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 60, medium: 30, large: 15, extra_large: 3 },
        enabled: true
      },
      {
        featureId: 'artifacts',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 40, medium: 20, large: 10, extra_large: 2 },
        enabled: true
      },
      {
        featureId: 'exports',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 100, medium: 50, large: 20, extra_large: 5 },
        enabled: true
      },
      {
        featureId: 'dashboards',
        maxComplexity: 'extra_large',
        monthlyLimits: { small: 20, medium: 10, large: 5, extra_large: 2 },
        enabled: true
      }
    ],
    legacyFeatures: {
      maxFiles: 10,
      maxFileSizeMB: 200,
      aiInsights: 10,
      maxAnalysisComponents: 100,
      maxVisualizations: 50,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON', 'API'],
      support: 'Phone & Priority',
      totalDataVolumeMB: 5000
    },
    usageLimits: {
      storageCapacityMB: 5000,
      analysisComplexityUnits: 500,
      dataIngestionSizeMB: 2500,
      dataTransformationComplexityUnits: 250,
      artifactsComplexityUnits: 750,
      dataVolumeMB: 5000,
      aiInsights: 10,
      analysisComponents: 100,
      visualizations: 50,
      fileUploads: 10
    },
    journeyPricing: {
      'non-tech': 10,
      'business': 20,
      'technical': 30,
      'consultation': 69
    }
  }
};

// Helper functions for enhanced subscription management
export function getEnhancedTierLimits(tierId: string): EnhancedSubscriptionTier | undefined {
  return ENHANCED_SUBSCRIPTION_TIERS[tierId];
}

export function getFeatureLimit(tierId: string, featureId: string): FeatureLimit | undefined {
  const tier = getEnhancedTierLimits(tierId);
  if (!tier) return undefined;
  
  return tier.features.find(f => f.featureId === featureId);
}

export function canUseFeature(
  tierId: string, 
  featureId: string, 
  complexity: FeatureComplexity,
  currentUsage: number
): { allowed: boolean; reason?: string; limit?: number } {
  const featureLimit = getFeatureLimit(tierId, featureId);
  if (!featureLimit) {
    return { allowed: false, reason: 'Feature not available for this tier' };
  }
  
  if (!featureLimit.enabled) {
    return { allowed: false, reason: 'Feature is disabled for this tier' };
  }
  
  // Check if the requested complexity is allowed
  const complexityLevels = ['small', 'medium', 'large', 'extra_large'];
  const requestedIndex = complexityLevels.indexOf(complexity);
  const maxIndex = complexityLevels.indexOf(featureLimit.maxComplexity);
  
  if (requestedIndex > maxIndex) {
    return { allowed: false, reason: `Complexity ${complexity} not allowed. Maximum complexity is ${featureLimit.maxComplexity}` };
  }
  
  // Check monthly limits
  const monthlyLimit = featureLimit.monthlyLimits[complexity];
  if (currentUsage >= monthlyLimit) {
    return { 
      allowed: false, 
      reason: `Monthly limit reached for ${complexity} ${featureId} (${currentUsage}/${monthlyLimit})`,
      limit: monthlyLimit
    };
  }
  
  return { allowed: true, limit: monthlyLimit };
}

export function calculateFeatureUsageCost(
  tierId: string,
  featureId: string,
  complexity: FeatureComplexity,
  quantity: number = 1
): number {
  const featureDef = getFeatureDefinition(featureId);
  if (!featureDef) return 0;
  
  const complexityConfig = featureDef.complexities[complexity];
  if (!complexityConfig) return 0;
  
  // For subscription tiers, the cost is already included in the monthly fee
  // This function calculates the overage cost if limits are exceeded
  return complexityConfig.processingCost * quantity;
}

export function getTierFeatureSummary(tierId: string) {
  const tier = getEnhancedTierLimits(tierId);
  if (!tier) return null;
  
  return tier.features.map(featureLimit => {
    const featureDef = getFeatureDefinition(featureLimit.featureId);
    return {
      feature: featureDef,
      limit: featureLimit,
      maxComplexity: featureLimit.maxComplexity,
      totalMonthlyLimits: Object.values(featureLimit.monthlyLimits).reduce((sum, limit) => sum + limit, 0)
    };
  });
}

// Migration helper to maintain backward compatibility
export function migrateLegacyTier(legacyTier: any): EnhancedSubscriptionTier | undefined {
  // This function can be used to migrate old subscription tier data
  // to the new enhanced format
  return ENHANCED_SUBSCRIPTION_TIERS[legacyTier.id];
}
