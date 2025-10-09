import { db } from './db';
import { users, analysisSubscriptions, generatedArtifacts, projects } from '../shared/schema';
import { eq, and, gte, count, sum, desc } from 'drizzle-orm';
import Stripe from 'stripe';
import type { AudienceProfile, AnalysisSubscription } from '../shared/schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil'
});

interface AnalysisRequest {
  userId: string;
  type: 'one_time' | 'recurring' | 'continuous' | 'event_driven';
  complexity: 'basic' | 'intermediate' | 'advanced';
  audiences: AudienceProfile[];
  industry: string;
  dataVolume: number; // in GB
  estimatedExecutionTime: number; // in minutes
  features: string[];
  customRequirements?: string[];
}

interface CostEstimate {
  baseCost: number;
  multipliers: {
    audienceMultiplier: number;
    industryMultiplier: number;
    complexityMultiplier: number;
    volumeMultiplier: number;
    featureMultiplier: number;
  };
  additionalCosts: {
    dataProcessing: number;
    customizations: number;
    prioritySupport: number;
  };
  totalCost: number;
  estimatedDeliveryTime: number;
  breakdown: CostBreakdown[];
}

interface CostBreakdown {
  component: string;
  description: string;
  unitCost: number;
  quantity: number;
  totalCost: number;
}

interface UsageAnalysis {
  totalAnalyses: number;
  monthlyAnalyses: number;
  avgComplexity: string;
  preferredFormats: string[];
  industryFocus: string;
  satisfactionScore: number;
  retentionProbability: number;
  lifetimeValue: number;
  churnRisk: 'low' | 'medium' | 'high';
}

interface RetentionStrategy {
  tier: 'champion' | 'loyal' | 'at_risk' | 'churning';
  interventions: RetentionIntervention[];
  incentives: RetentionIncentive[];
  communicationPlan: CommunicationPlan;
  upgradeOpportunities: UpgradeOpportunity[];
  expectedImpact: {
    retentionIncrease: number;
    revenueImpact: number;
    timeframe: string;
  };
}

interface RetentionIntervention {
  type: 'educational' | 'technical' | 'commercial' | 'engagement';
  action: string;
  trigger: string;
  timing: string;
  priority: 'high' | 'medium' | 'low';
}

interface RetentionIncentive {
  type: 'discount' | 'free_credits' | 'feature_unlock' | 'priority_support';
  value: number;
  duration: string;
  conditions: string[];
  expectedConversion: number;
}

interface CommunicationPlan {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  channels: ('email' | 'in_app' | 'phone' | 'webinar')[];
  contentThemes: string[];
  personalizedContent: boolean;
}

interface UpgradeOpportunity {
  targetTier: string;
  features: string[];
  valueProp: string;
  discount?: number;
  urgency: 'high' | 'medium' | 'low';
  likelihood: number; // 0-1 probability
}

// Flexible pricing models
const PRICING_MODELS = {
  base_rates: {
    one_time: {
      basic: 29,
      intermediate: 79,
      advanced: 149,
      premium: 299
    },
    recurring: {
      basic: 99,
      intermediate: 199,
      advanced: 399,
      premium: 799
    },
    continuous: {
      basic: 199,
      intermediate: 399,
      advanced: 799,
      premium: 1599
    },
    event_driven: {
      basic: 149,
      intermediate: 299,
      advanced: 599,
      premium: 1199
    }
  },
  multipliers: {
    audience: {
      1: 1.0,
      2: 1.3,
      3: 1.5,
      4: 1.7,
      5: 1.9,
      '6+': 2.2
    },
    industry: {
      retail: 1.0,
      saas: 1.1,
      finance: 1.4,
      healthcare: 1.3,
      manufacturing: 1.2,
      consulting: 1.1,
      technology: 1.2,
      education: 0.9
    },
    complexity_boost: {
      basic: 1.0,
      intermediate: 1.3,
      advanced: 1.7
    }
  },
  usage_rates: {
    dataProcessingPerGB: 5,
    aiInsightGeneration: 2,
    customVisualization: 15,
    exportDownload: 1,
    apiAccess: 25,
    prioritySupport: 50
  }
};

export class AdaptiveBillingService {
  private static instance: AdaptiveBillingService;

  public static getInstance(): AdaptiveBillingService {
    if (!AdaptiveBillingService.instance) {
      AdaptiveBillingService.instance = new AdaptiveBillingService();
    }
    return AdaptiveBillingService.instance;
  }

  /**
   * Calculate cost for analysis request
   */
  async calculateCost(request: AnalysisRequest): Promise<CostEstimate> {
    const baseRates = PRICING_MODELS.base_rates[request.type];
    const baseCost = baseRates[request.complexity as keyof typeof baseRates];

    // Calculate multipliers
    const audienceCount = request.audiences.length;
    const audienceMultiplier = this.getAudienceMultiplier(audienceCount);
    const industryMultiplier = PRICING_MODELS.multipliers.industry[request.industry as keyof typeof PRICING_MODELS.multipliers.industry] || 1.0;
    const complexityMultiplier = PRICING_MODELS.multipliers.complexity_boost[request.complexity];
    const volumeMultiplier = this.calculateVolumeMultiplier(request.dataVolume);
    const featureMultiplier = this.calculateFeatureMultiplier(request.features);

    // Calculate additional costs
    const additionalCosts = {
      dataProcessing: request.dataVolume * PRICING_MODELS.usage_rates.dataProcessingPerGB,
      customizations: (request.customRequirements?.length || 0) * 25,
      prioritySupport: request.features.includes('priority_support') ? PRICING_MODELS.usage_rates.prioritySupport : 0
    };

    const multipliedCost = baseCost * audienceMultiplier * industryMultiplier * complexityMultiplier * volumeMultiplier * featureMultiplier;
    const totalAdditionalCosts = Object.values(additionalCosts).reduce((sum, cost) => sum + cost, 0);
    const totalCost = multipliedCost + totalAdditionalCosts;

    // Generate cost breakdown
    const breakdown = this.generateCostBreakdown({
      baseCost,
      audienceCount,
      dataVolume: request.dataVolume,
      features: request.features,
      additionalCosts,
      multipliers: { audienceMultiplier, industryMultiplier, complexityMultiplier, volumeMultiplier, featureMultiplier }
    });

    return {
      baseCost,
      multipliers: { audienceMultiplier, industryMultiplier, complexityMultiplier, volumeMultiplier, featureMultiplier },
      additionalCosts,
      totalCost: Math.round(totalCost),
      estimatedDeliveryTime: this.estimateDeliveryTime(request),
      breakdown
    };
  }

  /**
   * Analyze user usage patterns
   */
  async analyzeUsagePatterns(userId: string): Promise<UsageAnalysis> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12); // Last 12 months

    // Get user's analysis history
    const [userAnalyses] = await db
      .select({
        totalCount: count(),
      })
      .from(analysisSubscriptions)
      .where(and(
        eq(analysisSubscriptions.userId, userId),
        gte(analysisSubscriptions.createdAt, startDate)
      ));

    const [monthlyAnalyses] = await db
      .select({
        monthlyCount: count(),
      })
      .from(analysisSubscriptions)
      .where(and(
        eq(analysisSubscriptions.userId, userId),
        gte(analysisSubscriptions.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      ));

    // Get user preferences
    const recentSubscriptions = await db
      .select()
      .from(analysisSubscriptions)
      .where(eq(analysisSubscriptions.userId, userId))
      .orderBy(desc(analysisSubscriptions.createdAt))
      .limit(10);

    const complexityDistribution = this.analyzeComplexityPreferences(recentSubscriptions);
    const formatPreferences = this.analyzeFormatPreferences(recentSubscriptions);
    const industryFocus = this.determineIndustryFocus(recentSubscriptions);

    // Calculate satisfaction and retention metrics
    const satisfactionScore = await this.calculateSatisfactionScore(userId);
    const retentionProbability = await this.calculateRetentionProbability(userId);
    const lifetimeValue = await this.calculateLifetimeValue(userId);
    const churnRisk = this.assessChurnRisk(retentionProbability, satisfactionScore);

    return {
      totalAnalyses: userAnalyses.totalCount || 0,
      monthlyAnalyses: monthlyAnalyses.monthlyCount || 0,
      avgComplexity: complexityDistribution[0] || 'intermediate',
      preferredFormats: formatPreferences,
      industryFocus,
      satisfactionScore,
      retentionProbability,
      lifetimeValue,
      churnRisk
    };
  }

  /**
   * Generate retention strategy
   */
  async setupRetentionStrategy(userId: string): Promise<RetentionStrategy> {
    const usage = await this.analyzeUsagePatterns(userId);
    const user = await this.getUserProfile(userId);

    const tier = this.calculateRetentionTier(usage);
    const interventions = await this.generateRetentionInterventions(usage, tier);
    const incentives = await this.generateRetentionIncentives(usage, tier);
    const communicationPlan = this.createCommunicationPlan(usage, tier);
    const upgradeOpportunities = await this.identifyUpgradeOpportunities(userId, usage);

    return {
      tier,
      interventions,
      incentives,
      communicationPlan,
      upgradeOpportunities,
      expectedImpact: this.calculateExpectedImpact(tier, interventions, incentives)
    };
  }

  /**
   * Process payment for analysis
   */
  async processPayment(
    userId: string,
    costEstimate: CostEstimate,
    paymentMethodId: string,
    subscriptionId?: string
  ): Promise<{
    success: boolean;
    paymentIntentId?: string;
    error?: string;
  }> {
    try {
      // Get user for Stripe customer ID
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        throw new Error('User not found');
      }

      // Create or retrieve Stripe customer
      const stripeCustomer = await this.getOrCreateStripeCustomer(user);

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(costEstimate.totalCost * 100), // Convert to cents
        currency: 'usd',
        customer: stripeCustomer.id,
        payment_method: paymentMethodId,
        confirm: true,
        return_url: `${process.env.APP_URL}/payment/success`,
        metadata: {
          userId,
          subscriptionId: subscriptionId || '',
          analysisType: 'adaptive_analysis'
        }
      });

      if (paymentIntent.status === 'succeeded') {
        // Update subscription billing info
        if (subscriptionId) {
          await this.updateSubscriptionBilling(subscriptionId, paymentIntent.id, costEstimate.totalCost);
        }

        return {
          success: true,
          paymentIntentId: paymentIntent.id
        };
      } else {
        return {
          success: false,
          error: `Payment failed with status: ${paymentIntent.status}`
        };
      }
    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: (error as Error).message || String(error)
      };
    }
  }

  /**
   * Setup subscription billing for recurring analyses
   */
  async setupSubscriptionBilling(
    userId: string,
    subscriptionConfig: AnalysisSubscription,
    paymentMethodId: string
  ): Promise<{
    success: boolean;
    stripeSubscriptionId?: string;
    error?: string;
  }> {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (!user) {
        throw new Error('User not found');
      }

      const stripeCustomer = await this.getOrCreateStripeCustomer(user);

      // Create subscription price based on billing config
      const billingConfig = (subscriptionConfig as any)?.billingConfig || { baseCost: 10, billingCycle: 'monthly' };
      const price = await stripe.prices.create({
        unit_amount: Math.round(billingConfig.baseCost * 100),
        currency: 'usd',
        recurring: {
          interval: this.mapBillingCycleToStripe(billingConfig.billingCycle)
        },
        product_data: {
          name: `Analysis Subscription - ${subscriptionConfig.name}`
        }
      });

      // Create Stripe subscription
      const stripeSubscription = await stripe.subscriptions.create({
        customer: stripeCustomer.id,
        items: [{ price: price.id }],
        default_payment_method: paymentMethodId,
        metadata: {
          userId,
          analysisSubscriptionId: subscriptionConfig.id,
          audienceCount: ((subscriptionConfig as any)?.audienceProfiles?.length || 0).toString()
        }
      });

      return {
        success: true,
        stripeSubscriptionId: stripeSubscription.id
      };
    } catch (error) {
      console.error('Subscription billing setup error:', error);
      return {
        success: false,
        error: (error as Error).message || String(error)
      };
    }
  }

  /**
   * Helper methods
   */
  private getAudienceMultiplier(count: number): number {
    const multipliers = PRICING_MODELS.multipliers.audience;
    if (count <= 5) {
      return multipliers[count as keyof typeof multipliers];
    }
    return multipliers['6+'];
  }

  private calculateVolumeMultiplier(volumeGB: number): number {
    if (volumeGB <= 1) return 1.0;
    if (volumeGB <= 5) return 1.1;
    if (volumeGB <= 10) return 1.2;
    if (volumeGB <= 50) return 1.4;
    return 1.6;
  }

  private calculateFeatureMultiplier(features: string[]): number {
    const featureMultipliers = {
      'advanced_ml': 1.3,
      'real_time_data': 1.4,
      'custom_integrations': 1.5,
      'white_label': 1.6,
      'priority_support': 1.1,
      'api_access': 1.2
    };

    return features.reduce((multiplier, feature) => {
      return multiplier * (featureMultipliers[feature as keyof typeof featureMultipliers] || 1.0);
    }, 1.0);
  }

  private estimateDeliveryTime(request: AnalysisRequest): number {
    const baseTimes = {
      one_time: 30, // minutes
      recurring: 45,
      continuous: 60,
      event_driven: 40
    };

    const complexityMultiplier = {
      basic: 1.0,
      intermediate: 1.5,
      advanced: 2.0
    };

    const audienceMultiplier = 1 + (request.audiences.length - 1) * 0.2;
    const volumeMultiplier = Math.max(1.0, request.dataVolume * 0.1);

    return Math.round(
      baseTimes[request.type] *
      complexityMultiplier[request.complexity] *
      audienceMultiplier *
      volumeMultiplier
    );
  }

  private generateCostBreakdown(params: any): CostBreakdown[] {
    const breakdown: CostBreakdown[] = [];

    breakdown.push({
      component: 'Base Analysis',
      description: `${params.multipliers.complexityMultiplier === 1.7 ? 'Advanced' : 'Standard'} analysis`,
      unitCost: params.baseCost,
      quantity: 1,
      totalCost: params.baseCost
    });

    if (params.audienceCount > 1) {
      breakdown.push({
        component: 'Additional Audiences',
        description: `${params.audienceCount - 1} additional audience profiles`,
        unitCost: params.baseCost * (params.multipliers.audienceMultiplier - 1),
        quantity: 1,
        totalCost: params.baseCost * (params.multipliers.audienceMultiplier - 1)
      });
    }

    if (params.dataVolume > 0) {
      breakdown.push({
        component: 'Data Processing',
        description: 'Data ingestion and processing',
        unitCost: PRICING_MODELS.usage_rates.dataProcessingPerGB,
        quantity: params.dataVolume,
        totalCost: params.additionalCosts.dataProcessing
      });
    }

    if (params.additionalCosts.customizations > 0) {
      breakdown.push({
        component: 'Customizations',
        description: 'Custom requirements and features',
        unitCost: 25,
        quantity: params.additionalCosts.customizations / 25,
        totalCost: params.additionalCosts.customizations
      });
    }

    return breakdown;
  }

  private analyzeComplexityPreferences(subscriptions: any[]): string[] {
    // Analyze user's preferred complexity levels
    const complexities = subscriptions.map(s => s.billingConfig?.complexity || 'intermediate');
    const counts = complexities.reduce((acc, c) => {
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .map(([complexity]) => complexity);
  }

  private analyzeFormatPreferences(subscriptions: any[]): string[] {
    // Extract format preferences from audience profiles
    const formats = subscriptions.flatMap(s =>
      s.audienceProfiles?.flatMap((profile: AudienceProfile) => (profile as any)?.preferredFormats) || []
    );

    const counts = formats.reduce((acc, f) => {
      acc[f] = (acc[f] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([format]) => format);
  }

  private determineIndustryFocus(subscriptions: any[]): string {
    const industries = subscriptions.flatMap(s =>
      s.audienceProfiles?.map((profile: AudienceProfile) => profile.industry) || []
    );

    const counts = industries.reduce((acc, i) => {
      acc[i] = (acc[i] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(counts)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0]?.[0] || 'general';
  }

  private async calculateSatisfactionScore(userId: string): Promise<number> {
    // This would integrate with actual satisfaction tracking
    // For now, return a placeholder based on usage patterns
    return 0.75 + Math.random() * 0.2; // 0.75-0.95 range
  }

  private async calculateRetentionProbability(userId: string): Promise<number> {
    // Calculate retention probability based on engagement metrics
    const usage = await this.analyzeUsagePatterns(userId);
    const engagementScore = Math.min(usage.monthlyAnalyses / 5, 1.0); // Normalize to max 5 analyses per month
    const consistencyScore = usage.totalAnalyses > 0 ? Math.min(usage.monthlyAnalyses / (usage.totalAnalyses / 12), 1.0) : 0;

    return (engagementScore * 0.6) + (consistencyScore * 0.4);
  }

  private async calculateLifetimeValue(userId: string): Promise<number> {
    const [totalSpent] = await db
      .select({ total: sum(analysisSubscriptions.totalCost) })
      .from(analysisSubscriptions)
      .where(eq(analysisSubscriptions.userId, userId));

    return totalSpent.total || 0;
  }

  private assessChurnRisk(retentionProbability: number, satisfactionScore: number): 'low' | 'medium' | 'high' {
    const riskScore = (1 - retentionProbability) * 0.6 + (1 - satisfactionScore) * 0.4;

    if (riskScore < 0.3) return 'low';
    if (riskScore < 0.6) return 'medium';
    return 'high';
  }

  private calculateRetentionTier(usage: UsageAnalysis): RetentionStrategy['tier'] {
    if (usage.satisfactionScore > 0.8 && usage.retentionProbability > 0.7) {
      return 'champion';
    }
    if (usage.satisfactionScore > 0.6 && usage.retentionProbability > 0.5) {
      return 'loyal';
    }
    if (usage.churnRisk === 'medium') {
      return 'at_risk';
    }
    return 'churning';
  }

  private async generateRetentionInterventions(usage: UsageAnalysis, tier: RetentionStrategy['tier']): Promise<RetentionIntervention[]> {
    const interventions: RetentionIntervention[] = [];

    if (tier === 'at_risk' || tier === 'churning') {
      interventions.push({
        type: 'engagement',
        action: 'Schedule personalized demo of advanced features',
        trigger: 'Low usage detected',
        timing: 'immediate',
        priority: 'high'
      });

      interventions.push({
        type: 'commercial',
        action: 'Offer limited-time discount on next analysis',
        trigger: 'Risk threshold exceeded',
        timing: 'within_week',
        priority: 'high'
      });
    }

    if (usage.avgComplexity === 'basic' && tier !== 'churning') {
      interventions.push({
        type: 'educational',
        action: 'Provide intermediate analysis tutorial',
        trigger: 'Consistent basic usage',
        timing: 'monthly',
        priority: 'medium'
      });
    }

    return interventions;
  }

  private async generateRetentionIncentives(usage: UsageAnalysis, tier: RetentionStrategy['tier']): Promise<RetentionIncentive[]> {
    const incentives: RetentionIncentive[] = [];

    switch (tier) {
      case 'champion':
        incentives.push({
          type: 'feature_unlock',
          value: 100, // Percentage
          duration: 'permanent',
          conditions: ['Continue current usage level'],
          expectedConversion: 0.9
        });
        break;

      case 'loyal':
        incentives.push({
          type: 'discount',
          value: 15, // Percentage
          duration: '3_months',
          conditions: ['Upgrade to higher tier'],
          expectedConversion: 0.6
        });
        break;

      case 'at_risk':
        incentives.push({
          type: 'free_credits',
          value: 50, // Dollar amount
          duration: '1_month',
          conditions: ['Complete one analysis'],
          expectedConversion: 0.4
        });
        break;

      case 'churning':
        incentives.push({
          type: 'discount',
          value: 50, // Percentage
          duration: '1_month',
          conditions: ['Immediate action required'],
          expectedConversion: 0.3
        });
        break;
    }

    return incentives;
  }

  private createCommunicationPlan(usage: UsageAnalysis, tier: RetentionStrategy['tier']): CommunicationPlan {
    const basePlan: CommunicationPlan = {
      frequency: 'monthly',
      channels: ['email'],
      contentThemes: ['tips', 'case_studies'],
      personalizedContent: false
    };

    switch (tier) {
      case 'champion':
        return {
          ...basePlan,
          frequency: 'weekly',
          channels: ['email', 'in_app'],
          contentThemes: ['advanced_features', 'industry_insights', 'exclusive_content'],
          personalizedContent: true
        };

      case 'at_risk':
      case 'churning':
        return {
          ...basePlan,
          frequency: 'weekly',
          channels: ['email', 'phone'],
          contentThemes: ['support', 'value_demonstration', 'success_stories'],
          personalizedContent: true
        };

      default:
        return basePlan;
    }
  }

  private async identifyUpgradeOpportunities(userId: string, usage: UsageAnalysis): Promise<UpgradeOpportunity[]> {
    const opportunities: UpgradeOpportunity[] = [];

    if (usage.avgComplexity === 'basic' && usage.monthlyAnalyses > 2) {
      opportunities.push({
        targetTier: 'intermediate',
        features: ['Advanced visualizations', 'Custom insights', 'API access'],
        valueProp: 'Get 3x more insights with intermediate analysis',
        discount: 20,
        urgency: 'medium',
        likelihood: 0.6
      });
    }

    if (usage.monthlyAnalyses > 5) {
      opportunities.push({
        targetTier: 'enterprise',
        features: ['Unlimited analyses', 'Priority support', 'Custom integrations'],
        valueProp: 'Scale your analytics with enterprise features',
        urgency: 'low',
        likelihood: 0.4
      });
    }

    return opportunities;
  }

  private calculateExpectedImpact(
    tier: RetentionStrategy['tier'],
    interventions: RetentionIntervention[],
    incentives: RetentionIncentive[]
  ): RetentionStrategy['expectedImpact'] {
    const baseRetentionIncrease = {
      champion: 0.05,
      loyal: 0.15,
      at_risk: 0.35,
      churning: 0.25
    }[tier];

    const interventionBoost = interventions.length * 0.05;
    const incentiveBoost = incentives.reduce((sum, incentive) => sum + (incentive.expectedConversion * 0.1), 0);

    return {
      retentionIncrease: Math.min(baseRetentionIncrease + interventionBoost + incentiveBoost, 0.8),
      revenueImpact: this.calculateRevenueImpact(tier),
      timeframe: tier === 'churning' ? '1_month' : '3_months'
    };
  }

  private calculateRevenueImpact(tier: RetentionStrategy['tier']): number {
    const impacts = {
      champion: 500,
      loyal: 300,
      at_risk: 200,
      churning: 100
    };
    return impacts[tier];
  }

  private async getOrCreateStripeCustomer(user: any): Promise<Stripe.Customer> {
    // Check if user already has a Stripe customer ID
    if (user.stripeCustomerId) {
      try {
        return await stripe.customers.retrieve(user.stripeCustomerId) as Stripe.Customer;
      } catch (error) {
        // Customer doesn't exist, create a new one
      }
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || undefined,
      metadata: {
        userId: user.id.toString()
      }
    });

    // Update user record with Stripe customer ID
    await db
      .update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, user.id));

    return customer;
  }

  private mapBillingCycleToStripe(cycle: 'monthly' | 'quarterly' | 'annually'): 'month' | 'year' {
    switch (cycle) {
      case 'monthly':
      case 'quarterly': // Stripe doesn't support quarterly directly, so use monthly
        return 'month';
      case 'annually':
        return 'year';
      default:
        return 'month';
    }
  }

  private async updateSubscriptionBilling(
    subscriptionId: string,
    paymentIntentId: string,
    amount: number
  ): Promise<void> {
    // Update subscription with payment information
    // This would typically update a billing/payments table
    console.log(`Updated billing for subscription ${subscriptionId}: ${paymentIntentId} - $${amount}`);
  }

  private async getUserProfile(userId: string): Promise<any> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    return user;
  }
}

export const adaptiveBillingService = AdaptiveBillingService.getInstance();