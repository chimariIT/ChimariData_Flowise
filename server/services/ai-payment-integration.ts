import { UsageTrackingService } from './usage-tracking';
import { RolePermissionService } from './role-permission';
import { SubscriptionJourneyMappingService } from './subscription-journey-mapping';
import type { UserRole } from '../../shared/schema';
import type { SubscriptionTierId as SubscriptionTier } from '../../shared/subscription-tiers';

export interface PaymentContext {
  userId: string;
  userRole: UserRole;
  subscriptionTier: SubscriptionTier;
  requestType: 'ai_query' | 'data_upload' | 'code_generation' | 'consultation' | 'analysis';
  complexity: 'simple' | 'advanced' | 'expert';
  resourceUsage: {
    computeUnits?: number;
    storageSize?: number;
    processingTime?: number;
    modelCost?: number;
  };
}

export interface PaymentCalculation {
  paymentModel: 'subscription' | 'pay_per_use';
  costs: {
    baseCost: number;
    discountedCost: number;
    finalCost: number;
    discountPercentage: number;
    currency: 'USD';
  };
  subscription: {
    includedInPlan: boolean;
    remainingQuota: number;
    upgradeRequired: boolean;
    upgradeReason?: string;
  };
  usage: {
    withinLimits: boolean;
    currentUsage: number;
    limitExceeded: boolean;
    requiresPayment: boolean;
  };
  chargeDetails: {
    shouldCharge: boolean;
    chargeAmount: number;
    description: string;
    itemizedCosts: Array<{
      item: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }>;
  };
}

export interface PricingConfig {
  basePrices: {
    ai_query_simple: number;
    ai_query_advanced: number;
    ai_query_expert: number;
    data_upload_per_mb: number;
    code_generation: number;
    consultation_per_minute: number;
    analysis_complex: number;
  };
  subscriptionDiscounts: Record<SubscriptionTier, number> & {
    none: number;     // 0% - full price
    trial: number;    // 20% discount
    starter: number;  // 40% discount
    professional: number; // 60% discount
    enterprise: number;   // 80% discount
  };
  roleMultipliers: Record<UserRole, number> & {
    'non-tech': number;    // 1.0x
    'business': number;    // 1.2x
    'technical': number;   // 1.5x
    'consultation': number; // 2.0x
    'custom': number;       // Bespoke hybrid workflows
  };
}

export class AIPaymentIntegrationService {

  private static readonly PRICING_CONFIG: PricingConfig = {
    basePrices: {
      ai_query_simple: 0.05,        // $0.05 per simple query
      ai_query_advanced: 0.15,      // $0.15 per advanced query
      ai_query_expert: 0.30,        // $0.30 per expert query
      data_upload_per_mb: 0.02,     // $0.02 per MB
      code_generation: 0.25,        // $0.25 per generation
      consultation_per_minute: 2.00, // $2.00 per minute
      analysis_complex: 0.50        // $0.50 per complex analysis
    },
    subscriptionDiscounts: {
      none: 0,      // 0% discount - full price
      trial: 0.2,   // 20% discount
      starter: 0.4, // 40% discount
      professional: 0.6, // 60% discount
      enterprise: 0.8    // 80% discount
    },
    roleMultipliers: {
      'non-tech': 1.0,     // Standard pricing
      'business': 1.2,     // 20% premium for business features
      'technical': 1.5,    // 50% premium for technical features
      'consultation': 2.0, // 100% premium for consultation
      'custom': 1.8        // Hybrid journey sits between technical and consultation
    }
  };

  /**
   * Calculate payment for AI service usage
   */
  static async calculatePayment(context: PaymentContext): Promise<PaymentCalculation> {
    // Get user's current usage and limits
    const userPermissions = await RolePermissionService.getUserPermissions(context.userId);
    const currentUsage = await UsageTrackingService.getCurrentUsage(context.userId);

    // Determine if user is subscription or pay-per-use
    const paymentModel = context.subscriptionTier === 'none' ? 'pay_per_use' : 'subscription';

    // Calculate base cost
    const baseCost = this.calculateBaseCost(context);

    // Apply discounts and multipliers
    const costs = this.calculateDiscountedCost(baseCost, context);

    // Check subscription quotas and limits
    const subscription = await this.checkSubscriptionQuotas(context, userPermissions);

    // Determine if payment is required
    const chargeDetails = this.calculateChargeDetails(costs, subscription, paymentModel);

    return {
      paymentModel,
      costs,
      subscription,
      usage: {
        withinLimits: subscription.remainingQuota > 0,
        currentUsage: this.getCurrentUsageCount(currentUsage, context.requestType),
        limitExceeded: subscription.remainingQuota <= 0 && !subscription.upgradeRequired,
        requiresPayment: chargeDetails.shouldCharge
      },
      chargeDetails
    };
  }

  /**
   * Process payment for AI service usage
   */
  static async processPayment(
    context: PaymentContext,
    calculation: PaymentCalculation
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
    usageTracked: boolean;
  }> {
    try {
      let paymentSuccess = true;
      let transactionId: string | undefined;

      // Process payment if required
      if (calculation.chargeDetails.shouldCharge) {
        const paymentResult = await this.chargeUser(
          context.userId,
          calculation.chargeDetails.chargeAmount,
          calculation.chargeDetails.description,
          calculation.chargeDetails.itemizedCosts
        );

        paymentSuccess = paymentResult.success;
        transactionId = paymentResult.transactionId;

        if (!paymentSuccess) {
          return {
            success: false,
            error: paymentResult.error || 'Payment failed',
            usageTracked: false
          };
        }
      }

      // Track usage regardless of payment (subscription users get tracked usage)
      const usageTracked = await this.trackServiceUsage(context, calculation, transactionId);

      return {
        success: true,
        transactionId,
        usageTracked
      };

    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown payment error',
        usageTracked: false
      };
    }
  }

  /**
   * Get pricing estimate for user
   */
  static async getPricingEstimate(
    userId: string,
    userRole: UserRole,
    subscriptionTier: SubscriptionTier,
    requestType: PaymentContext['requestType'],
    complexity: PaymentContext['complexity'] = 'simple'
  ): Promise<{
    paymentModel: 'subscription' | 'pay_per_use';
    estimatedCost: number;
    includedInPlan: boolean;
    quotaRemaining: number;
    upgradeRecommendation?: {
      tier: SubscriptionTier;
      savings: number;
      reason: string;
    };
  }> {
    const context: PaymentContext = {
      userId,
      userRole,
      subscriptionTier,
      requestType,
      complexity,
      resourceUsage: {}
    };

    const calculation = await this.calculatePayment(context);

    // Check if upgrade would be beneficial
    const upgradeRecommendationDetails = await this.getUpgradeRecommendation(
      context,
      calculation
    );

    return {
      paymentModel: calculation.paymentModel,
      estimatedCost: calculation.costs.finalCost,
      includedInPlan: calculation.subscription.includedInPlan,
      quotaRemaining: calculation.subscription.remainingQuota,
      upgradeRecommendation: upgradeRecommendationDetails
    };
  }

  /**
   * Calculate base cost before discounts
   */
  private static calculateBaseCost(context: PaymentContext): number {
    const { requestType, complexity, resourceUsage } = context;
    let baseCost = 0;

    switch (requestType) {
      case 'ai_query':
        const queryKey = `ai_query_${complexity}` as keyof PricingConfig['basePrices'];
        baseCost = this.PRICING_CONFIG.basePrices[queryKey];
        break;

      case 'data_upload':
        const sizeMB = resourceUsage.storageSize || 1;
        baseCost = this.PRICING_CONFIG.basePrices.data_upload_per_mb * sizeMB;
        break;

      case 'code_generation':
        baseCost = this.PRICING_CONFIG.basePrices.code_generation;
        break;

      case 'consultation':
        const minutes = (resourceUsage.processingTime || 60) / 60; // Convert seconds to minutes
        baseCost = this.PRICING_CONFIG.basePrices.consultation_per_minute * minutes;
        break;

      case 'analysis':
        baseCost = this.PRICING_CONFIG.basePrices.analysis_complex;
        break;

      default:
        baseCost = this.PRICING_CONFIG.basePrices.ai_query_simple;
    }

    return baseCost;
  }

  /**
   * Apply role multipliers and subscription discounts
   */
  private static calculateDiscountedCost(
    baseCost: number,
    context: PaymentContext
  ): PaymentCalculation['costs'] {
    // Apply role multiplier
    const roleMultiplier = this.PRICING_CONFIG.roleMultipliers[context.userRole];
    const roleAdjustedCost = baseCost * roleMultiplier;

    // Apply subscription discount
  const tierKey: SubscriptionTier = context.subscriptionTier;
  const discountPercentage = this.PRICING_CONFIG.subscriptionDiscounts[tierKey] || 0;
    const discountAmount = roleAdjustedCost * discountPercentage;
    const discountedCost = roleAdjustedCost - discountAmount;

    return {
      baseCost: baseCost,
      discountedCost: discountedCost,
      finalCost: discountedCost,
      discountPercentage: discountPercentage * 100,
      currency: 'USD'
    };
  }

  /**
   * Check subscription quotas and limits
   */
  private static async checkSubscriptionQuotas(
    context: PaymentContext,
    userPermissions: any
  ): Promise<PaymentCalculation['subscription']> {
    if (context.subscriptionTier === 'none') {
      return {
        includedInPlan: false,
        remainingQuota: 0,
        upgradeRequired: false
      };
    }

    // Get subscription limits based on request type
    const limits = await this.getSubscriptionLimits(context);
    const currentUsage = await this.getCurrentRequestTypeUsage(context);

    const remainingQuota = Math.max(0, limits.quota - currentUsage);
    const includedInPlan = remainingQuota > 0;

    return {
      includedInPlan,
      remainingQuota,
      upgradeRequired: !includedInPlan && context.subscriptionTier !== 'enterprise',
      upgradeReason: !includedInPlan ? 'Quota exceeded for current tier' : undefined
    };
  }

  /**
   * Calculate final charge details
   */
  private static calculateChargeDetails(
    costs: PaymentCalculation['costs'],
    subscription: PaymentCalculation['subscription'],
    paymentModel: 'subscription' | 'pay_per_use'
  ): PaymentCalculation['chargeDetails'] {
    // Subscription users only pay if they exceed their quota
    if (paymentModel === 'subscription' && subscription.includedInPlan) {
      return {
        shouldCharge: false,
        chargeAmount: 0,
        description: 'Included in subscription plan',
        itemizedCosts: []
      };
    }

    // Pay-per-use users always pay, subscription users pay for overages
    const shouldCharge = true;
    const chargeAmount = costs.finalCost;
    const description = paymentModel === 'subscription'
      ? 'Usage beyond subscription quota'
      : 'Pay-per-use service charge';

    return {
      shouldCharge,
      chargeAmount,
      description,
      itemizedCosts: [
        {
          item: description,
          quantity: 1,
          unitPrice: chargeAmount,
          total: chargeAmount
        }
      ]
    };
  }

  /**
   * Charge user for service usage
   */
  private static async chargeUser(
    userId: string,
    amount: number,
    description: string,
    itemizedCosts: any[]
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> {
    try {
      // P0-6 FIX: Block mock payments in production
      const isProduction = process.env.NODE_ENV === 'production';
      const stripeConfigured = !!process.env.STRIPE_SECRET_KEY &&
        process.env.STRIPE_SECRET_KEY !== 'sk_test_your_stripe_secret_key';

      if (isProduction && !stripeConfigured) {
        console.error('🔴 CRITICAL: AI payment processing called in production without Stripe!');
        return {
          success: false,
          error: 'Payment service unavailable. Please contact support.'
        };
      }

      if (isProduction) {
        // In production, AI usage charges should go through the billing service
        // which properly integrates with Stripe
        console.error('🔴 AI payment integration should use UnifiedBillingService in production');
        return {
          success: false,
          error: 'Use billing service for production charges'
        };
      }

      // Development mode only: Mock payment processing
      const crypto = await import('crypto');
      const transactionId = `ai_charge_dev_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

      // Log mock payment for development
      console.log(`[DEV] Mock AI payment: $${amount.toFixed(2)} for user ${userId}`);
      console.log(`[DEV] Description: ${description}`);
      console.log(`[DEV] Transaction ID: ${transactionId}`);

      return {
        success: true,
        transactionId
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Payment processing failed'
      };
    }
  }

  /**
   * Track service usage after successful payment/quota deduction
   */
  private static async trackServiceUsage(
    context: PaymentContext,
    calculation: PaymentCalculation,
    transactionId?: string
  ): Promise<boolean> {
    try {
      const metadata = {
        requestType: context.requestType,
        complexity: context.complexity,
        paymentModel: calculation.paymentModel,
        cost: calculation.costs.finalCost,
        transactionId,
        subscriptionTier: context.subscriptionTier
      };

      // Track based on request type
      switch (context.requestType) {
        case 'ai_query':
          await UsageTrackingService.trackAiQuery(
            context.userId,
            context.complexity === 'expert' ? 'advanced' : context.complexity
          );
          break;

        case 'data_upload':
          if (context.resourceUsage.storageSize) {
            await UsageTrackingService.trackDataUpload(
              context.userId,
              context.resourceUsage.storageSize
            );
          }
          break;

        case 'code_generation':
          await UsageTrackingService.trackCodeGeneration(context.userId);
          break;

        case 'consultation':
          const minutes = (context.resourceUsage.processingTime || 60) / 60;
          await UsageTrackingService.trackConsultationUsage(context.userId, minutes);
          break;

        default:
          // Treat as simple AI query for tracking purposes
          await UsageTrackingService.trackAiQuery(
            context.userId,
            context.complexity === 'expert' ? 'advanced' : context.complexity
          );
      }

      return true;
    } catch (error) {
      console.error('Failed to track service usage:', error);
      return false;
    }
  }

  /**
   * Helper methods
   */
  private static async getSubscriptionLimits(context: PaymentContext): Promise<{ quota: number }> {
    // Get limits from subscription tier
    const tierLimits = {
      none: { quota: 0 },
      trial: { quota: 10 },
      starter: { quota: 100 },
      professional: { quota: 500 },
      enterprise: { quota: 2000 }
    };

  const tierKey2 = context.subscriptionTier as unknown as import('../../shared/subscription-tiers').SubscriptionTierId;
  return tierLimits[tierKey2 as keyof typeof tierLimits];
  }

  private static async getCurrentRequestTypeUsage(context: PaymentContext): Promise<number> {
    // Mock implementation - in production would query actual usage
    return 0;
  }

  private static getCurrentUsageCount(currentUsage: any, requestType: string): number {
    if (!currentUsage) return 0;

    switch (requestType) {
      case 'ai_query':
        return currentUsage.aiQueries || 0;
      case 'data_upload':
        return currentUsage.dataUploads || 0;
      case 'code_generation':
        return currentUsage.codeGenerations || 0;
      case 'consultation':
        return currentUsage.consultationMinutes || 0;
      default:
        return currentUsage.aiQueries || 0;
    }
  }

  private static async getUpgradeRecommendation(
    context: PaymentContext,
    calculation: PaymentCalculation
  ): Promise<{ tier: SubscriptionTier; savings: number; reason: string } | undefined> {
    // Simple logic to recommend upgrade if user would save money
    if (context.subscriptionTier === 'none' && calculation.costs.finalCost > 5.00) {
      return {
        tier: 'starter',
        savings: calculation.costs.finalCost * 0.2,
        reason: 'Consider upgrading to Starter plan to save on frequent usage'
      };
    }

    return undefined;
  }

  /**
   * Get pricing breakdown for display to user
   */
  static getPricingBreakdown(
    userRole: UserRole,
    subscriptionTier: SubscriptionTier
  ): {
    baseRates: Record<string, number>;
    yourRates: Record<string, number>;
    discountPercentage: number;
    paymentModel: 'subscription' | 'pay_per_use';
  } {
    const baseRates = {
      'Simple AI Query': this.PRICING_CONFIG.basePrices.ai_query_simple,
      'Advanced AI Query': this.PRICING_CONFIG.basePrices.ai_query_advanced,
      'Expert AI Query': this.PRICING_CONFIG.basePrices.ai_query_expert,
      'Data Upload (per MB)': this.PRICING_CONFIG.basePrices.data_upload_per_mb,
      'Code Generation': this.PRICING_CONFIG.basePrices.code_generation,
      'Consultation (per minute)': this.PRICING_CONFIG.basePrices.consultation_per_minute
    };

    const roleMultiplier = this.PRICING_CONFIG.roleMultipliers[userRole];
  const discountPercentage = this.PRICING_CONFIG.subscriptionDiscounts[subscriptionTier] || 0;

    const yourRates = Object.entries(baseRates).reduce((rates, [key, price]) => {
      const adjustedPrice = price * roleMultiplier * (1 - discountPercentage);
      rates[key] = adjustedPrice;
      return rates;
    }, {} as Record<string, number>);

    return {
      baseRates,
      yourRates,
      discountPercentage: discountPercentage * 100,
      paymentModel: subscriptionTier === 'none' ? 'pay_per_use' : 'subscription'
    };
  }
}