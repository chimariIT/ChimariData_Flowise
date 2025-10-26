// DEPRECATED: This file is being migrated to shared/unified-subscription-tiers.ts
// Import the unified system for new code
import { 
  UNIFIED_SUBSCRIPTION_TIERS, 
  type UnifiedSubscriptionTier,
  getUnifiedTierLimits,
  canUserUploadUnified,
  canUserRequestAIInsightUnified
} from './unified-subscription-tiers';

// Legacy interface for backward compatibility
export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  description: string;
  features: {
    maxFiles: number;
    maxFileSizeMB: number;
    totalDataVolumeMB: number;
    aiInsights: number;
    maxAnalysisComponents: number;
    maxVisualizations: number;
    dataTransformation: boolean;
    statisticalAnalysis: boolean;
    advancedInsights: boolean;
    piiDetection: boolean;
    exportOptions: string[];
    support: string;
  };
  stripeProductId?: string;
  stripePriceId?: string;
}

// Legacy export - maps to unified system
export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    price: 1,
    description: 'Perfect for testing our platform with basic analytics',
    features: {
      maxFiles: 1,
      maxFileSizeMB: 10,
      totalDataVolumeMB: 10,
      aiInsights: 1,
      maxAnalysisComponents: 5,
      maxVisualizations: 3,
      dataTransformation: false,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      exportOptions: ['CSV'],
      support: 'Community'
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 10,
    description: 'Great for small teams with basic data transformation needs',
    features: {
      maxFiles: 2,
      maxFileSizeMB: 50,
      totalDataVolumeMB: 100,
      aiInsights: 3,
      maxAnalysisComponents: 15,
      maxVisualizations: 10,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: false,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF'],
      support: 'Email'
    }
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 20,
    description: 'Comprehensive analytics for growing businesses',
    features: {
      maxFiles: 5,
      maxFileSizeMB: 100,
      totalDataVolumeMB: 500,
      aiInsights: 5,
      maxAnalysisComponents: 50,
      maxVisualizations: 25,
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON'],
      support: 'Priority Email'
    }
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 50,
    description: 'Full access to all features with premium support',
    features: {
      // Set to exactly 2× Professional limits as requested
      maxFiles: 10, // 2× 5
      maxFileSizeMB: 200, // 2× 100
      totalDataVolumeMB: 1000, // 2× 500
      aiInsights: 10, // 2× 5
      maxAnalysisComponents: 100, // 2× 50
      maxVisualizations: 50, // 2× 25
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON', 'API'],
      support: 'Phone & Priority'
    }
  }
};

// Union type of supported subscription tier IDs plus 'none' for pay-per-use users
export type SubscriptionTierId = keyof typeof SUBSCRIPTION_TIERS | 'none';

export function getTierLimits(tier: string) {
  return SUBSCRIPTION_TIERS[tier]?.features || SUBSCRIPTION_TIERS.trial.features;
}

export function canUserUpload(userTier: string, currentUploads: number, fileSizeMB: number, currentDataVolumeMB: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getTierLimits(userTier);
  
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

export function canUserRequestAIInsight(userTier: string, currentInsights: number): {
  allowed: boolean;
  reason?: string;
} {
  const limits = getTierLimits(userTier);
  
  if (limits.aiInsights !== -1 && currentInsights >= limits.aiInsights) {
    return {
      allowed: false,
      reason: `AI insight limit reached. Your ${userTier} plan allows ${limits.aiInsights} insight(s) per month.`
    };
  }
  
  return { allowed: true };
}