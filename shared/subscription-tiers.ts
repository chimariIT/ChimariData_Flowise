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

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  trial: {
    id: 'trial',
    name: 'Trial',
    price: 5,
    description: 'Perfect for testing our platform with basic analytics',
    features: {
      maxFiles: 1,
      maxFileSizeMB: 10,
      totalDataVolumeMB: 10,
      aiInsights: 1,
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
      maxFiles: -1, // Unlimited
      maxFileSizeMB: -1, // Unlimited
      totalDataVolumeMB: -1, // Unlimited
      aiInsights: -1, // Unlimited
      dataTransformation: true,
      statisticalAnalysis: true,
      advancedInsights: true,
      piiDetection: true,
      exportOptions: ['CSV', 'Excel', 'PDF', 'JSON', 'API'],
      support: 'Phone & Priority'
    }
  }
};

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