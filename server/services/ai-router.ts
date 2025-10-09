import { RoleBasedAIService } from './role-based-ai';
import { UsageTrackingService } from './usage-tracking';
import { RolePermissionService } from './role-permission';
import type { FeaturePermissions } from './role-permission';
import { AIPaymentIntegrationService } from './ai-payment-integration';
import type { UserRole } from '../../shared/schema';
import type { SubscriptionTierId } from '../../shared/subscription-tiers';

export interface AIRequestContext {
  userId: string;
  userRole: UserRole;
  subscriptionTier: SubscriptionTierId;
  requestType: 'analysis' | 'generation' | 'consultation' | 'visualization' | 'code';
  journeyStep?: string;
  complexity: 'simple' | 'advanced' | 'expert';
  dataContext?: {
    dataSize?: number;
    dataType?: string;
    analysisType?: string;
  };
}

export interface AIResponse {
  content: string;
  metadata: {
    modelUsed: string;
    provider: string;
    tokensUsed?: number;
    processingTime: number;
    usageCost: number;
    upgradeRecommendation?: {
      reason: string;
      recommendedTier: SubscriptionTierId;
      benefits: string[];
    };
  };
  payment: {
    paymentModel: 'subscription' | 'pay_per_use';
    charged: boolean;
    chargeAmount: number;
    transactionId?: string;
    quotaUsed: boolean;
    remainingQuota: number;
  };
}

export class AIRouterService {
  /**
   * Route AI request to appropriate model based on user role and context
   */
  static async routeAIRequest(
    context: AIRequestContext,
    prompt: string,
    systemContext?: string
  ): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Check permissions and limits first
      const canAccess = await this.validateAIAccess(context);
      if (!canAccess.allowed) {
        throw new AIAccessError(canAccess.reason || 'Access denied', canAccess.upgradeRecommendation);
      }

      // Get AI configuration for user's role and tier
      const aiConfig = await RoleBasedAIService.getAIModelForUser(context.userId);

      // Calculate payment before processing
      const paymentContext = {
        userId: context.userId,
        userRole: context.userRole,
        subscriptionTier: context.subscriptionTier,
        requestType: 'ai_query' as const,
        complexity: context.complexity,
        resourceUsage: {
          computeUnits: this.calculateUsageCost(context),
          processingTime: 0 // Will be updated after processing
        }
      };

      const paymentCalculation = await AIPaymentIntegrationService.calculatePayment(paymentContext);

      // Process payment if required
      const paymentResult = await AIPaymentIntegrationService.processPayment(
        paymentContext,
        paymentCalculation
      );

      if (!paymentResult.success) {
        throw new AIAccessError(
          paymentResult.error || 'Payment failed',
          {
            reason: 'Payment required to access AI services',
            recommendedTier: 'starter',
            benefits: ['Included AI queries', 'Discounted rates', 'Priority processing']
          }
        );
      }

      // Process the AI request
      const response = await RoleBasedAIService.processAIRequest(context.userId, { prompt });

      const processingTime = Date.now() - startTime;

      // Update payment context with actual processing time
      paymentContext.resourceUsage.processingTime = processingTime;

      // Check if user should be prompted to upgrade
      const upgradeRecommendation = await this.generateUpgradeRecommendation(context, response.content);

      return {
        content: response.content,
        metadata: {
          modelUsed: aiConfig.modelName,
          provider: aiConfig.providerId,
          processingTime,
          usageCost: paymentCalculation.costs.finalCost,
          upgradeRecommendation
        },
        payment: {
          paymentModel: paymentCalculation.paymentModel,
          charged: paymentCalculation.chargeDetails.shouldCharge,
          chargeAmount: paymentCalculation.chargeDetails.chargeAmount,
          transactionId: paymentResult.transactionId,
          quotaUsed: paymentCalculation.subscription.includedInPlan,
          remainingQuota: paymentCalculation.subscription.remainingQuota
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;

      if (error instanceof AIAccessError) {
        throw error;
      }

      // Log error and return appropriate response
      console.error('AI routing error:', error);

      return {
        content: this.getErrorResponse(context, error),
        metadata: {
          modelUsed: 'fallback',
          provider: 'internal',
          processingTime,
          usageCost: 0,
          upgradeRecommendation: await this.getErrorUpgradeRecommendation(context, error)
        },
        payment: {
          paymentModel: context.subscriptionTier === 'none' ? 'pay_per_use' : 'subscription',
          charged: false,
          chargeAmount: 0,
          quotaUsed: false,
          remainingQuota: 0
        }
      };
    }
  }

  /**
   * Validate if user can access AI features based on their role and subscription
   */
  private static async validateAIAccess(context: AIRequestContext): Promise<{
    allowed: boolean;
    reason?: string;
    upgradeRecommendation?: {
      reason: string;
      recommendedTier: SubscriptionTierId;
      benefits: string[];
    };
  }> {
    // Check if user has permission for this request type
    if (context.requestType === 'consultation') {
      const canConsult = await RolePermissionService.canAccessJourney(context.userId, 'consultation');
      if (!canConsult) {
        return {
          allowed: false,
          reason: `Consultation requests require a subscription upgrade`,
          upgradeRecommendation: {
            reason: `Access consultation features`,
            recommendedTier: this.getRecommendedTier(context.userRole, context.requestType),
            benefits: this.getTierBenefits(context.requestType)
          }
        };
      }
    } else {
      const permissionKey = this.getPermissionKey(context.requestType);
      const hasPermission = await RolePermissionService.hasPermission(
        context.userId,
        permissionKey
      );

      if (!hasPermission) {
        return {
          allowed: false,
          reason: `${context.requestType} requests require a subscription upgrade`,
          upgradeRecommendation: {
            reason: `Access ${context.requestType} AI features`,
            recommendedTier: this.getRecommendedTier(context.userRole, context.requestType),
            benefits: this.getTierBenefits(context.requestType)
          }
        };
      }
    }

    // Check usage limits
    const usageCheck = await UsageTrackingService.checkUsageLimit(context.userId, 'aiQueries', this.calculateUsageCost(context));

    if (!usageCheck.allowed) {
      return {
        allowed: false,
        reason: usageCheck.reason || 'Usage limit exceeded',
        upgradeRecommendation: {
          reason: 'Increase your AI query limits',
          recommendedTier: this.getNextTier(context.subscriptionTier),
          benefits: [
            'Higher AI query limits',
            'Access to advanced models',
            'Priority processing',
            'Extended analysis capabilities'
          ]
        }
      };
    }

    return { allowed: true };
  }

  /**
   * Calculate usage cost based on request complexity and type
   */
  private static calculateUsageCost(context: AIRequestContext): number {
    const baseCosts = {
      simple: 1,
      advanced: 2,
      expert: 3
    };

    const typeMutipliers = {
      analysis: 1,
      generation: 1.5,
      consultation: 2,
      visualization: 1.2,
      code: 2.5
    };

    return Math.ceil(
      baseCosts[context.complexity] *
      typeMutipliers[context.requestType]
    );
  }

  /**
   * Generate upgrade recommendations based on usage patterns
   */
  private static async generateUpgradeRecommendation(
    context: AIRequestContext,
    response: string
  ): Promise<{
    reason: string;
    recommendedTier: SubscriptionTierId;
    benefits: string[];
  } | undefined> {
    // Check current usage status
  const usageStats = await UsageTrackingService.getCurrentUsage(context.userId);
  const limits = await UsageTrackingService.getUserLimits(context.userId);

  // Recommend upgrade if user is approaching limits (80% threshold)
  const usagePercentage = limits.maxAiQueries > 0 ? (usageStats.aiQueries / limits.maxAiQueries) * 100 : 0;

    if (usagePercentage >= 80) {
      return {
        reason: 'You\'re approaching your AI query limits',
        recommendedTier: this.getNextTier(context.subscriptionTier),
        benefits: [
          '5x more AI queries',
          'Access to advanced models',
          'Faster processing',
          'Priority support'
        ]
      };
    }

    // Recommend upgrade if user is using advanced features on basic tier
    if (context.complexity === 'expert' && context.subscriptionTier === 'none') {
      return {
        reason: 'Unlock advanced AI capabilities with a subscription',
        recommendedTier: 'starter',
        benefits: [
          'Advanced AI models',
          'Expert-level analysis',
          'Custom model selection',
          'Extended query limits'
        ]
      };
    }

    return undefined;
  }

  /**
   * Get permission key for request type
   */
  private static getPermissionKey(requestType: string): keyof FeaturePermissions {
    // Map request types to existing FeaturePermissions keys
    const permissionMap: Record<string, keyof FeaturePermissions> = {
      analysis: 'canAccessAdvancedAnalytics',
      generation: 'canGenerateCode',
      visualization: 'canExportResults',
      code: 'canGenerateCode'
    };

    // Default to the most conservative permission
    return permissionMap[requestType] || 'canAccessAdvancedAnalytics';
  }

  /**
   * Get recommended tier for user role and request type
   */
  private static getRecommendedTier(userRole: UserRole, requestType: string): SubscriptionTierId {
    if (requestType === 'consultation') {
      return 'professional';
    }

    if (requestType === 'code' || requestType === 'generation') {
      return userRole === 'technical' ? 'professional' : 'starter';
    }

    return 'starter';
  }

  /**
   * Get next subscription tier
   */
  private static getNextTier(currentTier: SubscriptionTierId): SubscriptionTierId {
    const tierProgression: Record<SubscriptionTierId, SubscriptionTierId> = {
      none: 'starter',
      trial: 'starter',
      starter: 'professional',
      professional: 'enterprise',
      enterprise: 'enterprise'
    };

    return tierProgression[currentTier];
  }

  /**
   * Get benefits for specific request type
   */
  private static getTierBenefits(requestType: string): string[] {
    const benefitMap = {
      analysis: [
        'Advanced statistical analysis',
        'Detailed insights and recommendations',
        'Multi-dimensional data exploration',
        'Custom analysis templates'
      ],
      generation: [
        'AI-powered code generation',
        'Multiple programming languages',
        'Best practices integration',
        'Code optimization suggestions'
      ],
      consultation: [
        'Expert-level AI assistance',
        'Domain-specific knowledge',
        'Advanced problem solving',
        'Personalized recommendations'
      ],
      visualization: [
        'Advanced chart types',
        'Interactive visualizations',
        'Custom styling options',
        'Export capabilities'
      ],
      code: [
        'Full-stack code generation',
        'Framework-specific templates',
        'Testing code generation',
        'Documentation generation'
      ]
    };

    const key = (['analysis','generation','consultation','visualization','code'] as const).includes(requestType as any)
      ? requestType as 'analysis'|'generation'|'consultation'|'visualization'|'code'
      : 'analysis';
    return benefitMap[key];
  }

  /**
   * Get appropriate error response for user role
   */
  private static getErrorResponse(context: AIRequestContext, error: any): string {
    const roleResponses = {
      'non-tech': 'I apologize, but I encountered an issue processing your request. Please try again or contact support for assistance.',
      'business': 'There was a technical issue with your analysis request. Our team has been notified and you can retry or contact support.',
      'technical': `Processing error occurred: ${error.message || 'Unknown error'}. Please check your request parameters and try again.`,
      'consultation': 'I encountered an issue while processing your consultation request. Please provide additional context or contact our expert team directly.'
    };

    return roleResponses[context.userRole] || roleResponses['non-tech'];
  }

  /**
   * Get upgrade recommendation for errors
   */
  private static async getErrorUpgradeRecommendation(
    context: AIRequestContext,
    error: any
  ): Promise<{
    reason: string;
    recommendedTier: SubscriptionTierId;
    benefits: string[];
  } | undefined> {
    // If error is due to model limitations, suggest upgrade
    if (error.message?.includes('model') || error.message?.includes('limit')) {
      return {
        reason: 'Access more advanced AI models and higher limits',
        recommendedTier: this.getNextTier(context.subscriptionTier),
        benefits: [
          'Advanced AI models',
          'Higher processing limits',
          'Priority support',
          'Dedicated resources'
        ]
      };
    }

    return undefined;
  }
}

/**
 * Custom error class for AI access issues
 */
export class AIAccessError extends Error {
  constructor(
    message: string,
    public upgradeRecommendation?: {
      reason: string;
      recommendedTier: SubscriptionTierId;
      benefits: string[];
    }
  ) {
    super(message);
    this.name = 'AIAccessError';
  }
}

/**
 * Convenience functions for common AI routing scenarios
 */
export class AIRoutingHelpers {
  /**
   * Route data analysis request
   */
  static async analyzeData(
    userId: string,
    userRole: UserRole,
    subscriptionTier: SubscriptionTierId,
    prompt: string,
    dataContext: any
  ): Promise<AIResponse> {
    return AIRouterService.routeAIRequest({
      userId,
      userRole,
      subscriptionTier,
      requestType: 'analysis',
      complexity: 'advanced',
      dataContext
    }, prompt);
  }

  /**
   * Route code generation request
   */
  static async generateCode(
    userId: string,
    userRole: UserRole,
    subscriptionTier: SubscriptionTierId,
    prompt: string,
    journeyStep?: string
  ): Promise<AIResponse> {
    return AIRouterService.routeAIRequest({
      userId,
      userRole,
      subscriptionTier,
      requestType: 'code',
      complexity: 'expert',
      journeyStep
    }, prompt);
  }

  /**
   * Route consultation request
   */
  static async processConsultation(
    userId: string,
    userRole: UserRole,
    subscriptionTier: SubscriptionTierId,
    prompt: string,
    systemContext: string
  ): Promise<AIResponse> {
    return AIRouterService.routeAIRequest({
      userId,
      userRole,
      subscriptionTier,
      requestType: 'consultation',
      complexity: 'expert'
    }, prompt, systemContext);
  }
}