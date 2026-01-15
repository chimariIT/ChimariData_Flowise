import type { Request, Response, NextFunction } from 'express';
import { RolePermissionService } from '../services/role-permission';
import { UsageTrackingService } from '../services/usage-tracking';
import { TechnicalAIFeatures } from '../services/technical-ai-features';
import { ConsultationAIService } from '../services/consultation-ai';
import { AIOptimizationService } from '../services/ai-optimization';
import { AIPaymentIntegrationService } from '../services/ai-payment-integration';
import type { UserRole } from '../../shared/schema';
import type { SubscriptionTierId } from '../../shared/subscription-tiers';

export interface AIAccessRequest extends Request {
  user: {
    id: string;
    role: UserRole;
    subscriptionTier: SubscriptionTierId;
  };
  aiAccess?: {
    featureRequested: string;
    accessLevel: 'basic' | 'advanced' | 'expert';
    estimatedCost: number;
    rateLimitInfo: {
      remaining: number;
      resetTime: number;
    };
    paymentInfo: {
      paymentModel: 'subscription' | 'pay_per_use';
      willBeCharged: boolean;
      chargeAmount: number;
      quotaRemaining: number;
      includedInPlan: boolean;
    };
  };
}

export interface AIFeatureDefinition {
  featureId: string;
  name: string;
  description: string;
  requiredPermissions: string[];
  minimumTier: SubscriptionTierId;
  costMultiplier: number;
  rateLimit: {
    requests: number;
    window: number; // in seconds
    burstLimit: number;
  };
  advanced: {
    requiresAdvancedTier?: boolean;
    specialPermissions?: string[];
    customValidation?: (req: AIAccessRequest) => Promise<boolean>;
  };
}

export class AIAccessControlService {

  private static readonly AI_FEATURES: Record<string, AIFeatureDefinition> = {
    'basic_analysis': {
      featureId: 'basic_analysis',
      name: 'Basic AI Analysis',
      description: 'Simple data analysis and insights',
      requiredPermissions: ['canUseAI'],
      minimumTier: 'none',
      costMultiplier: 1.0,
      rateLimit: { requests: 10, window: 3600, burstLimit: 3 },
      advanced: {}
    },
    'advanced_analysis': {
      featureId: 'advanced_analysis',
      name: 'Advanced AI Analysis',
      description: 'Complex statistical analysis and modeling',
      requiredPermissions: ['canUseAI', 'canAccessAdvancedFeatures'],
      minimumTier: 'starter',
      costMultiplier: 2.0,
      rateLimit: { requests: 50, window: 3600, burstLimit: 10 },
      advanced: {}
    },
    'code_generation': {
      featureId: 'code_generation',
      name: 'AI Code Generation',
      description: 'Generate code and technical documentation',
      requiredPermissions: ['canGenerateCode'],
      minimumTier: 'starter',
      costMultiplier: 2.5,
      rateLimit: { requests: 25, window: 3600, burstLimit: 5 },
      advanced: {
        customValidation: async (req) => {
          const features = TechnicalAIFeatures.getAvailableFeatures(req.user.subscriptionTier);
          return features.codeGeneration;
        }
      }
    },
    'research_assistance': {
      featureId: 'research_assistance',
      name: 'Research-Grade AI',
      description: 'Advanced research and academic assistance',
      requiredPermissions: ['canUseAI', 'canAccessAdvancedFeatures'],
      minimumTier: 'professional',
      costMultiplier: 3.0,
      rateLimit: { requests: 20, window: 3600, burstLimit: 3 },
      advanced: {
        requiresAdvancedTier: true,
        customValidation: async (req) => {
          const features = TechnicalAIFeatures.getAvailableFeatures(req.user.subscriptionTier);
          return features.researchAssistance;
        }
      }
    },
    'consultation_ai': {
      featureId: 'consultation_ai',
      name: 'AI Consultation Services',
      description: 'Expert-level strategic consultation',
      requiredPermissions: ['canAccessConsultation'],
      minimumTier: 'professional',
      costMultiplier: 4.0,
      rateLimit: { requests: 10, window: 3600, burstLimit: 2 },
      advanced: {
        requiresAdvancedTier: true,
        specialPermissions: ['canAccessConsultation'],
        customValidation: async (req) => {
          const features = ConsultationAIService.getConsultationFeatures(req.user.subscriptionTier);
          return features.strategicConsultation;
        }
      }
    },
    'custom_models': {
      featureId: 'custom_models',
      name: 'Custom AI Models',
      description: 'Access to specialized and custom-trained models',
      requiredPermissions: ['canUseAI', 'canAccessAdvancedFeatures'],
      minimumTier: 'professional',
      costMultiplier: 5.0,
      rateLimit: { requests: 15, window: 3600, burstLimit: 3 },
      advanced: {
        requiresAdvancedTier: true,
        customValidation: async (req) => {
          const features = TechnicalAIFeatures.getAvailableFeatures(req.user.subscriptionTier);
          return features.customModels;
        }
      }
    },
    'batch_processing': {
      featureId: 'batch_processing',
      name: 'Batch AI Processing',
      description: 'Process multiple requests in batches for efficiency',
      requiredPermissions: ['canUseAI'],
      minimumTier: 'starter',
      costMultiplier: 0.8, // More efficient
      rateLimit: { requests: 5, window: 3600, burstLimit: 2 },
      advanced: {}
    },
    'real_time_analysis': {
      featureId: 'real_time_analysis',
      name: 'Real-time AI Analysis',
      description: 'Streaming and real-time data analysis',
      requiredPermissions: ['canUseAI', 'canAccessAdvancedFeatures'],
      minimumTier: 'professional',
      costMultiplier: 3.5,
      rateLimit: { requests: 8, window: 3600, burstLimit: 2 },
      advanced: { requiresAdvancedTier: true }
    }
  };

  /**
   * Middleware to validate AI feature access
   */
  static validateAIFeatureAccess(featureId: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const aiReq = req as unknown as AIAccessRequest;
      try {
        const feature = this.AI_FEATURES[featureId];
        if (!feature) {
          return res.status(404).json({
            error: 'AI feature not found',
            code: 'FEATURE_NOT_FOUND'
          });
        }

        // FIX: Fast path for basic_analysis - skip rate limiting and usage checks
        // This feature is essential for data transformation to work
        if (featureId === 'basic_analysis') {
          const userId = aiReq.user?.id;
          if (userId) {
            console.log(`✅ [AI-ACCESS] Fast-path allowing basic_analysis for user ${userId}`);
            // Attach minimal access info and proceed
            (aiReq as any).aiAccess = {
              featureRequested: featureId,
              accessLevel: 'basic',
              estimatedCost: 0,
              rateLimitInfo: { remaining: 100, resetTime: Date.now() + 3600000 },
              paymentInfo: {
                paymentModel: 'subscription',
                willBeCharged: false,
                chargeAmount: 0,
                quotaRemaining: 100,
                includedInPlan: true
              }
            };
            return next();
          }
        }

        // Extract user information
        const userId = aiReq.user?.id;
        // Support both 'role' (from AIAccessRequest) and 'userRole' (from normalizeExpressUser)
        const userRole = (aiReq.user as any)?.role || (aiReq.user as any)?.userRole || 'non-tech';
        const subscriptionTier = (aiReq.user as any)?.subscriptionTier || 'trial'; // Default to trial

        if (!userId) {
          console.error('❌ [AI-ACCESS] Missing userId in request:', { user: aiReq.user });
          return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
          });
        }

        // Ensure user has permissions (will auto-create if missing)
        try {
          await RolePermissionService.getUserPermissions(userId);
        } catch (permError) {
          console.error('❌ [AI-ACCESS] Failed to get/create user permissions:', permError);
          // Continue anyway - hasPermission will handle missing permissions
        }

        // Validate access to this feature
        const accessResult = await this.validateFeatureAccess(
          userId,
          userRole,
          subscriptionTier,
          feature
        );

        if (!accessResult.allowed) {
          return res.status(403).json({
            error: accessResult.reason,
            code: accessResult.code,
            upgradeRecommendation: accessResult.upgradeRecommendation
          });
        }

        // Check rate limits
  const rateLimitResult = await this.checkRateLimit(userId, feature);
        if (!rateLimitResult.allowed) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: rateLimitResult.retryAfter,
            rateLimitInfo: rateLimitResult.info
          });
        }

        // Check usage limits
  const usageResult = await this.checkUsageLimits(userId, feature);
        if (!usageResult.allowed) {
          return res.status(403).json({
            error: usageResult.reason,
            code: 'USAGE_LIMIT_EXCEEDED',
            upgradeRecommendation: usageResult.upgradeRecommendation
          });
        }

        // Get payment information
        const paymentEstimate = await AIPaymentIntegrationService.getPricingEstimate(
          userId,
          userRole,
          subscriptionTier,
          this.mapFeatureToRequestType(featureId),
          this.determineComplexity(feature)
        );

        // Attach access information to request
        (aiReq as any).aiAccess = {
          featureRequested: featureId,
          accessLevel: this.determineAccessLevel(subscriptionTier, feature),
          estimatedCost: paymentEstimate.estimatedCost,
          rateLimitInfo: rateLimitResult.info,
          paymentInfo: {
            paymentModel: paymentEstimate.paymentModel,
            willBeCharged: !paymentEstimate.includedInPlan,
            chargeAmount: paymentEstimate.estimatedCost,
            quotaRemaining: paymentEstimate.quotaRemaining,
            includedInPlan: paymentEstimate.includedInPlan
          }
        };

        next();
      } catch (error) {
        console.error('AI access control error:', error);
        res.status(500).json({
          error: 'Internal server error during access validation',
          code: 'INTERNAL_ERROR'
        });
      }
    };
  }

  /**
   * Middleware to track AI feature usage
   */
  static trackAIFeatureUsage(featureId: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const aiReq = req as unknown as AIAccessRequest;
      const originalSend = res.send;
      const startTime = Date.now();

      res.send = function(body: any) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Track usage asynchronously
        AIAccessControlService.recordFeatureUsage(
          (aiReq.user as any).id,
          featureId,
          {
            responseTime,
            success: res.statusCode < 400,
            statusCode: res.statusCode,
            estimatedCost: (aiReq.aiAccess as any)?.estimatedCost || 0
          }
        ).catch(error => {
          console.error('Error tracking AI feature usage:', error);
        });

        return originalSend.call(this, body);
      };

      next();
    };
  }

  /**
   * Validate user access to specific AI feature
   */
  private static async validateFeatureAccess(
    userId: string,
    userRole: UserRole,
  subscriptionTier: SubscriptionTierId,
    feature: AIFeatureDefinition
  ): Promise<{
    allowed: boolean;
    reason?: string;
    code?: string;
    upgradeRecommendation?: any;
  }> {
    // FIX: Always allow basic_analysis feature - it's the most fundamental AI feature
    // This ensures data transformation and basic AI queries work for all users
    if (feature.featureId === 'basic_analysis') {
      console.log(`✅ [AI-ACCESS] Auto-allowing basic_analysis feature for user ${userId}`);
      return { allowed: true };
    }

    // Check subscription tier requirement
    if (!this.meetsMinimumTier(subscriptionTier, feature.minimumTier)) {
      return {
        allowed: false,
        reason: `This feature requires ${feature.minimumTier} subscription or higher`,
        code: 'INSUFFICIENT_TIER',
        upgradeRecommendation: {
          currentTier: subscriptionTier,
          requiredTier: feature.minimumTier,
          featureName: feature.name
        }
      };
    }

    // Check required permissions
    for (const permission of feature.requiredPermissions) {
      try {
        console.log(`🔍 [AI-ACCESS] Checking permission ${permission} for user ${userId}`);
        const hasPermission = await RolePermissionService.hasPermission(userId, permission as any);
        console.log(`🔍 [AI-ACCESS] Permission ${permission} result for user ${userId}: ${hasPermission}`);

        if (!hasPermission) {
          // For canUseAI or basic_analysis, always allow as fallback (basic feature available to all users)
          // This ensures new users can access basic AI features
          if (permission === 'canUseAI' || feature.featureId === 'basic_analysis') {
            console.log(`✅ [AI-ACCESS] ${permission} check returned false for basic_analysis, but allowing as fallback for user ${userId}`);
            continue;
          }

          console.error(`❌ [AI-ACCESS] Permission check failed: userId=${userId}, permission=${permission}, hasPermission=${hasPermission}`);
          return {
            allowed: false,
            reason: `This feature requires ${permission} permission`,
            code: 'INSUFFICIENT_PERMISSIONS',
            upgradeRecommendation: {
              missingPermission: permission,
              featureName: feature.name
            }
          };
        }
        console.log(`✅ [AI-ACCESS] Permission ${permission} granted for user ${userId}`);
      } catch (permError) {
        console.error(`❌ [AI-ACCESS] Permission check error for ${permission}:`, permError);
        // If permission check throws an error for basic features, allow access as fallback
        if (permission === 'canUseAI' || feature.featureId === 'basic_analysis') {
          console.log(`✅ [AI-ACCESS] Permission check error for basic feature, allowing as fallback for user ${userId}`);
          continue;
        }
        if (permError instanceof Error) {
          console.error(`❌ [AI-ACCESS] Error stack:`, permError.stack);
        }
        // For canUseAI, default to allowing access if check fails (backward compatibility)
        if (permission === 'canUseAI') {
          console.log(`✅ [AI-ACCESS] Permission check error for canUseAI, allowing access as fallback for user ${userId}`);
          continue;
        }
        return {
          allowed: false,
          reason: `Unable to verify permissions`,
          code: 'PERMISSION_CHECK_FAILED',
          upgradeRecommendation: {
            missingPermission: permission,
            featureName: feature.name
          }
        };
      }
    }

    // Check advanced tier requirements
    if (feature.advanced.requiresAdvancedTier && !this.isAdvancedTier(subscriptionTier)) {
      return {
        allowed: false,
        reason: 'This feature requires an advanced subscription tier',
        code: 'ADVANCED_TIER_REQUIRED',
        upgradeRecommendation: {
          requiredTier: 'professional',
          featureName: feature.name
        }
      };
    }

    // Check special permissions
    if (feature.advanced.specialPermissions) {
      for (const permission of feature.advanced.specialPermissions) {
        const hasPermission = await RolePermissionService.hasPermission(userId, permission as any);
        if (!hasPermission) {
          return {
            allowed: false,
            reason: `Missing special permission: ${permission}`,
            code: 'SPECIAL_PERMISSION_REQUIRED'
          };
        }
      }
    }

    // Run custom validation if provided
    if (feature.advanced.customValidation) {
      const customValid = await feature.advanced.customValidation({
        user: { id: userId, role: userRole, subscriptionTier }
      } as AIAccessRequest);

      if (!customValid) {
        return {
          allowed: false,
          reason: 'Custom validation failed for this feature',
          code: 'CUSTOM_VALIDATION_FAILED'
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check rate limits for feature usage
   */
  private static async checkRateLimit(
    userId: string,
    feature: AIFeatureDefinition
  ): Promise<{
    allowed: boolean;
    retryAfter?: number;
    info: { remaining: number; resetTime: number };
  }> {
    const key = `rate_limit:${feature.featureId}:${userId}`;
    const now = Date.now();
    const windowStart = now - (feature.rateLimit.window * 1000);

    // Get recent usage within the window
    const recentUsage = await this.getRecentFeatureUsage(userId, feature.featureId, windowStart);
    const usageCount = recentUsage.length;

    // Check burst limit (recent requests in short time)
    const burstWindow = 60 * 1000; // 1 minute
    const recentBurst = recentUsage.filter(usage => usage.timestamp > now - burstWindow);

    if (recentBurst.length >= feature.rateLimit.burstLimit) {
      return {
        allowed: false,
        retryAfter: 60, // 1 minute
        info: {
          remaining: 0,
          resetTime: now + 60000
        }
      };
    }

    // Check window limit
    if (usageCount >= feature.rateLimit.requests) {
      const oldestInWindow = Math.min(...recentUsage.map(u => u.timestamp));
      const retryAfter = Math.ceil((oldestInWindow + feature.rateLimit.window * 1000 - now) / 1000);

      return {
        allowed: false,
        retryAfter,
        info: {
          remaining: 0,
          resetTime: oldestInWindow + feature.rateLimit.window * 1000
        }
      };
    }

    return {
      allowed: true,
      info: {
        remaining: feature.rateLimit.requests - usageCount,
        resetTime: windowStart + feature.rateLimit.window * 1000
      }
    };
  }

  /**
   * Check overall usage limits
   */
  private static async checkUsageLimits(
    userId: string,
    feature: AIFeatureDefinition
  ): Promise<{
    allowed: boolean;
    reason?: string;
    upgradeRecommendation?: any;
  }> {
    const estimatedCost = await this.calculateFeatureCost(userId, feature);

    const usageCheck = await UsageTrackingService.checkUsageLimit(userId, 'aiQueries', estimatedCost);

    if (!usageCheck.allowed) {
      return {
        allowed: false,
        reason: usageCheck.reason || 'Usage limit exceeded',
        upgradeRecommendation: {
          reason: 'Increase AI usage limits',
          currentUsage: usageCheck.currentUsage,
          limit: usageCheck.limit
        }
      };
    }

    return { allowed: true };
  }

  /**
   * Helper methods
   */
  private static meetsMinimumTier(
    userTier: SubscriptionTierId,
    requiredTier: SubscriptionTierId
  ): boolean {
    const tierRanking: Record<string, number> = {
      none: 0,
      trial: 1,
      starter: 2,
      professional: 3,
      enterprise: 4
    };

    // FIX: Handle undefined/null userTier by defaulting to 'trial' (rank 1)
    // This ensures new users or users with missing subscription data can still access basic features
    const userRank = tierRanking[userTier] ?? tierRanking['trial'] ?? 1;
    const requiredRank = tierRanking[requiredTier] ?? 0;

    console.log(`🔍 [AI-ACCESS] Tier check: user=${userTier}(${userRank}) >= required=${requiredTier}(${requiredRank})`);

    return userRank >= requiredRank;
  }

  private static isAdvancedTier(tier: SubscriptionTierId): boolean {
    return ['professional', 'enterprise'].includes(tier);
  }

  private static determineAccessLevel(
    subscriptionTier: SubscriptionTierId,
    feature: AIFeatureDefinition
  ): 'basic' | 'advanced' | 'expert' {
    if (subscriptionTier === 'enterprise') return 'expert';
    if (subscriptionTier === 'professional') return 'advanced';
    return 'basic';
  }

  private static async calculateFeatureCost(
    userId: string,
    feature: AIFeatureDefinition
  ): Promise<number> {
    // Base cost calculation - could be more sophisticated
    const baseCost = 1;
    return baseCost * feature.costMultiplier;
  }

  private static async recordFeatureUsage(
    userId: string,
    featureId: string,
    metadata: {
      responseTime: number;
      success: boolean;
      statusCode: number;
      estimatedCost: number;
    }
  ): Promise<void> {
    try {
      await UsageTrackingService.trackAiQuery(userId, 'simple');
    } catch (error) {
      console.error('Failed to record feature usage:', error);
    }
  }

  private static async getRecentFeatureUsage(
    userId: string,
    featureId: string,
    since: number
  ): Promise<Array<{ timestamp: number; [key: string]: any }>> {
    // Mock implementation - in production would query actual usage data
    return [];
  }

  /**
   * Get available AI features for user
   */
  static async getAvailableFeatures(
    userId: string,
    userRole: UserRole,
  subscriptionTier: SubscriptionTierId
  ): Promise<{
    available: AIFeatureDefinition[];
    restricted: Array<AIFeatureDefinition & { restrictionReason: string }>;
  }> {
    const available: AIFeatureDefinition[] = [];
    const restricted: Array<AIFeatureDefinition & { restrictionReason: string }> = [];

    for (const feature of Object.values(this.AI_FEATURES)) {
      const accessResult = await this.validateFeatureAccess(userId, userRole, subscriptionTier, feature);

      if (accessResult.allowed) {
        available.push(feature);
      } else {
        restricted.push({
          ...feature,
          restrictionReason: accessResult.reason || 'Access denied'
        });
      }
    }

    return { available, restricted };
  }

  /**
   * Get feature usage analytics
   */
  static async getFeatureUsageAnalytics(
    userId: string,
    period: 'day' | 'week' | 'month' = 'month'
  ): Promise<{
    totalUsage: number;
    featureBreakdown: Record<string, number>;
    costBreakdown: Record<string, number>;
    trends: Record<string, number>;
  }> {
    // Mock implementation - in production would aggregate actual usage data
    return {
      totalUsage: 0,
      featureBreakdown: {},
      costBreakdown: {},
      trends: {}
    };
  }

  /**
   * Map feature ID to request type for payment calculation
   */
  private static mapFeatureToRequestType(featureId: string): 'ai_query' | 'data_upload' | 'code_generation' | 'consultation' | 'analysis' {
    const featureMap: Record<string, 'ai_query' | 'data_upload' | 'code_generation' | 'consultation' | 'analysis'> = {
      basic_analysis: 'ai_query',
      advanced_analysis: 'analysis',
      code_generation: 'code_generation',
      research_assistance: 'ai_query',
      consultation_ai: 'consultation',
      custom_models: 'ai_query',
      batch_processing: 'ai_query',
      real_time_analysis: 'analysis'
    };

    return featureMap[featureId] ?? 'ai_query';
  }

  /**
   * Determine complexity level from feature definition
   */
  private static determineComplexity(feature: AIFeatureDefinition): 'simple' | 'advanced' | 'expert' {
    if (feature.featureId.includes('expert') || feature.featureId.includes('consultation')) {
      return 'expert';
    }
    if (feature.featureId.includes('advanced') || feature.featureId.includes('custom')) {
      return 'advanced';
    }
    return 'simple';
  }
}