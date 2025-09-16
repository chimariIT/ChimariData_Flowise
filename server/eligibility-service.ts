import { storage } from './storage';
import { 
  EligibilityCheckRequest, 
  EligibilityCheckResponse,
  EligibilityCheck,
  InsertEligibilityCheck,
  User 
} from '@shared/schema';
import { 
  SUBSCRIPTION_TIERS, 
  getTierLimits, 
  canUserUpload, 
  canUserRequestAIInsight 
} from '@shared/subscription-tiers';
import { nanoid } from 'nanoid';

interface FeatureEligibility {
  feature: string;
  allowed: boolean;
  reason?: string;
  requiredTier?: string;
  upgradeRequired: boolean;
}

interface CacheEntry {
  response: EligibilityCheckResponse;
  timestamp: number;
  ttlMs: number;
}

export class EligibilityService {
  private static instance: EligibilityService;
  private eligibilityCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

  // Feature requirements mapping
  private readonly FEATURE_REQUIREMENTS = {
    preparation: {
      minTier: 'trial',
      requiresAuth: true,
      usageType: 'uploads',
    },
    data_processing: {
      minTier: 'starter',
      requiresAuth: true,
      usageType: 'data_volume',
    },
    analysis: {
      minTier: 'starter',
      requiresAuth: true,
      usageType: 'ai_insights',
    },
    visualization: {
      minTier: 'trial',
      requiresAuth: true,
      usageType: 'uploads',
    },
    ai_insights: {
      minTier: 'professional',
      requiresAuth: true,
      usageType: 'ai_insights',
    },
  };

  // Tier hierarchy for upgrade recommendations
  private readonly TIER_HIERARCHY = ['none', 'trial', 'starter', 'professional', 'enterprise'];

  public static getInstance(): EligibilityService {
    if (!EligibilityService.instance) {
      EligibilityService.instance = new EligibilityService();
    }
    return EligibilityService.instance;
  }

  /**
   * Generate cache key for eligibility check
   */
  private generateCacheKey(userId: string, request: EligibilityCheckRequest): string {
    const canonical = {
      userId,
      features: request.features.sort(),
      dataSizeMB: request.dataSizeMB,
      journeyType: request.journeyType,
    };
    
    return Buffer.from(JSON.stringify(canonical)).toString('base64');
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.eligibilityCache.entries()) {
      if (now - entry.timestamp > entry.ttlMs) {
        this.eligibilityCache.delete(key);
      }
    }
  }

  /**
   * Get tier level number for comparison
   */
  private getTierLevel(tier: string): number {
    return this.TIER_HIERARCHY.indexOf(tier);
  }

  /**
   * Check if a user's subscription tier allows a specific feature
   */
  private checkFeatureEligibility(
    user: User, 
    feature: string, 
    currentUsage: any, 
    limits: any
  ): FeatureEligibility {
    const requirement = this.FEATURE_REQUIREMENTS[feature as keyof typeof this.FEATURE_REQUIREMENTS];
    
    if (!requirement) {
      return {
        feature,
        allowed: false,
        reason: 'Unknown feature',
        upgradeRequired: false,
      };
    }

    const userTierLevel = this.getTierLevel(user.subscriptionTier || 'none');
    const requiredTierLevel = this.getTierLevel(requirement.minTier);

    // Check tier requirement
    if (userTierLevel < requiredTierLevel) {
      return {
        feature,
        allowed: false,
        reason: `Requires ${requirement.minTier} tier or higher`,
        requiredTier: requirement.minTier,
        upgradeRequired: true,
      };
    }

    // Check usage limits for the specific feature type
    const usageType = requirement.usageType;
    if (usageType && limits[usageType] !== undefined) {
      const usage = currentUsage[usageType] || 0;
      const limit = limits[usageType];
      
      if (usage >= limit) {
        // Suggest upgrade to next tier
        const nextTierIndex = Math.min(
          this.TIER_HIERARCHY.length - 1,
          userTierLevel + 1
        );
        const suggestedTier = this.TIER_HIERARCHY[nextTierIndex];
        
        return {
          feature,
          allowed: false,
          reason: `Monthly ${usageType} limit exceeded (${usage}/${limit})`,
          requiredTier: suggestedTier,
          upgradeRequired: true,
        };
      }
    }

    return {
      feature,
      allowed: true,
      upgradeRequired: false,
    };
  }

  /**
   * Check data size limits
   */
  private checkDataSizeLimits(
    user: User, 
    dataSizeMB: number, 
    limits: any
  ): { allowed: boolean; reason?: string; requiredTier?: string } {
    const currentDataUsage = user.monthlyDataVolume || 0;
    const dataLimit = limits.monthlyDataVolume;
    
    if (currentDataUsage + dataSizeMB > dataLimit) {
      const userTierLevel = this.getTierLevel(user.subscriptionTier || 'none');
      const nextTierIndex = Math.min(
        this.TIER_HIERARCHY.length - 1,
        userTierLevel + 1
      );
      const suggestedTier = this.TIER_HIERARCHY[nextTierIndex];
      
      return {
        allowed: false,
        reason: `Data size would exceed monthly limit (${currentDataUsage + dataSizeMB}MB > ${dataLimit}MB)`,
        requiredTier: suggestedTier,
      };
    }

    return { allowed: true };
  }

  /**
   * Generate upgrade recommendation
   */
  private generateUpgradeRecommendation(
    currentTier: string, 
    blockedFeatures: FeatureEligibility[]
  ): string | undefined {
    if (blockedFeatures.length === 0) return undefined;

    // Find the highest required tier
    const requiredTiers = blockedFeatures
      .filter(f => f.requiredTier)
      .map(f => f.requiredTier!);
    
    if (requiredTiers.length === 0) return undefined;

    const highestRequiredTier = requiredTiers.reduce((highest, tier) => {
      return this.getTierLevel(tier) > this.getTierLevel(highest) ? tier : highest;
    });

    const tierInfo = SUBSCRIPTION_TIERS[highestRequiredTier as keyof typeof SUBSCRIPTION_TIERS];
    if (!tierInfo) return undefined;

    return `Upgrade to ${highestRequiredTier.toUpperCase()} ($${tierInfo.price}/month) to access all requested features`;
  }

  /**
   * Perform comprehensive eligibility check
   */
  public async checkEligibility(
    userId: string, 
    request: EligibilityCheckRequest
  ): Promise<EligibilityCheckResponse> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(userId, request);
      this.cleanExpiredCache();
      
      const cached = this.eligibilityCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cached.ttlMs) {
        return cached.response;
      }

      // Get user information
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          success: false,
          eligible: false,
          checkId: '',
          blockedFeatures: [],
          currentTier: 'none',
          usage: { monthlyUploads: 0, monthlyDataVolume: 0, monthlyAIInsights: 0 },
          limits: { monthlyUploads: 0, monthlyDataVolume: 0, monthlyAIInsights: 0 },
          error: 'User not found',
        };
      }

      const currentTier = user.subscriptionTier || 'none';
      const limits = getTierLimits(currentTier);
      
      const currentUsage = {
        monthlyUploads: user.monthlyUploads || 0,
        monthlyDataVolume: user.monthlyDataVolume || 0,
        monthlyAIInsights: user.monthlyAIInsights || 0,
      };

      // Check each feature individually
      const featureChecks = request.features.map(feature => 
        this.checkFeatureEligibility(user, feature, currentUsage, limits)
      );

      // Check data size limits
      const dataSizeCheck = this.checkDataSizeLimits(user, request.dataSizeMB, limits);

      // Compile blocked features
      const blockedFeatures = featureChecks
        .filter(check => !check.allowed)
        .map(check => ({
          feature: check.feature,
          reason: check.reason || 'Not allowed',
          requiredTier: check.requiredTier,
          upgradeRequired: check.upgradeRequired,
        }));

      // Add data size blocking if applicable
      if (!dataSizeCheck.allowed) {
        blockedFeatures.push({
          feature: 'data_size',
          reason: dataSizeCheck.reason || 'Data size limit exceeded',
          requiredTier: dataSizeCheck.requiredTier,
          upgradeRequired: true,
        });
      }

      const isEligible = blockedFeatures.length === 0;
      const upgradeRecommendation = this.generateUpgradeRecommendation(currentTier, featureChecks);

      // Create eligibility check record
      const checkData: InsertEligibilityCheck = {
        userId,
        feature: request.features.join(','),
        allowed: isEligible,
        reason: isEligible ? 'All features allowed' : `Blocked features: ${blockedFeatures.map(f => f.feature).join(', ')}`,
        requiredTier: blockedFeatures.find(f => f.requiredTier)?.requiredTier || null,
        currentUsage,
        limits,
        nextResetAt: user.usageResetAt || null,
        checkResult: isEligible ? 'allowed' : (
          blockedFeatures.some(f => f.upgradeRequired) ? 'tier_required' : 'limit_exceeded'
        ),
      };

      const checkRecord = await storage.createEligibilityCheck(checkData);

      const response: EligibilityCheckResponse = {
        success: true,
        eligible: isEligible,
        checkId: checkRecord.id,
        blockedFeatures,
        currentTier,
        usage: currentUsage,
        limits,
        nextResetAt: user.usageResetAt || undefined,
        upgradeRecommendation,
      };

      // Cache the result
      this.eligibilityCache.set(cacheKey, {
        response,
        timestamp: Date.now(),
        ttlMs: this.CACHE_TTL_MS,
      });

      return response;

    } catch (error) {
      console.error('Error checking eligibility:', error);
      return {
        success: false,
        eligible: false,
        checkId: '',
        blockedFeatures: [],
        currentTier: 'none',
        usage: { monthlyUploads: 0, monthlyDataVolume: 0, monthlyAIInsights: 0 },
        limits: { monthlyUploads: 0, monthlyDataVolume: 0, monthlyAIInsights: 0 },
        error: 'Eligibility check failed',
      };
    }
  }

  /**
   * Quick check if user can perform specific action
   */
  public async canUserPerformAction(
    userId: string, 
    action: 'upload' | 'ai_insight' | 'analysis'
  ): Promise<{ allowed: boolean; reason?: string; tier?: string }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { allowed: false, reason: 'User not found' };
      }

      switch (action) {
        case 'upload':
          return canUserUpload(user) 
            ? { allowed: true } 
            : { allowed: false, reason: 'Upload limit exceeded', tier: user.subscriptionTier || 'none' };
            
        case 'ai_insight':
          return canUserRequestAIInsight(user)
            ? { allowed: true }
            : { allowed: false, reason: 'AI insight limit exceeded', tier: user.subscriptionTier || 'none' };
            
        case 'analysis':
          // Check if user has analysis capabilities
          const limits = getTierLimits(user.subscriptionTier || 'none');
          const hasAnalysisAccess = limits.monthlyAIInsights > 0;
          return hasAnalysisAccess
            ? { allowed: true }
            : { allowed: false, reason: 'Analysis requires paid subscription', tier: user.subscriptionTier || 'none' };
            
        default:
          return { allowed: false, reason: 'Unknown action' };
      }
    } catch (error) {
      console.error('Error checking user action eligibility:', error);
      return { allowed: false, reason: 'Check failed' };
    }
  }

  /**
   * Get current user usage summary
   */
  public async getUserUsageSummary(userId: string): Promise<{
    currentTier: string;
    usage: any;
    limits: any;
    utilizationPercentage: Record<string, number>;
    nextResetAt?: Date;
  } | null> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return null;

      const currentTier = user.subscriptionTier || 'none';
      const limits = getTierLimits(currentTier);
      
      const usage = {
        monthlyUploads: user.monthlyUploads || 0,
        monthlyDataVolume: user.monthlyDataVolume || 0,
        monthlyAIInsights: user.monthlyAIInsights || 0,
      };

      const utilizationPercentage = {
        uploads: limits.monthlyUploads > 0 ? (usage.monthlyUploads / limits.monthlyUploads) * 100 : 0,
        dataVolume: limits.monthlyDataVolume > 0 ? (usage.monthlyDataVolume / limits.monthlyDataVolume) * 100 : 0,
        aiInsights: limits.monthlyAIInsights > 0 ? (usage.monthlyAIInsights / limits.monthlyAIInsights) * 100 : 0,
      };

      return {
        currentTier,
        usage,
        limits,
        utilizationPercentage,
        nextResetAt: user.usageResetAt || undefined,
      };

    } catch (error) {
      console.error('Error getting user usage summary:', error);
      return null;
    }
  }
}

// Export singleton instance
export const eligibilityService = EligibilityService.getInstance();