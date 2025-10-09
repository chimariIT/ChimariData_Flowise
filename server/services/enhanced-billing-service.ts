import Stripe from 'stripe';
import { storage } from './storage';
import { nanoid } from 'nanoid';

// Enhanced Billing Configuration Interface
interface BillingConfig {
    tiers: SubscriptionTier[];
    consumptionRates: ConsumptionRate[];
    campaigns: Campaign[];
    taxConfig: TaxConfiguration;
    currency: CurrencyConfig;
}

interface SubscriptionTier {
    id: string;
    name: string;
    role: 'non-tech' | 'business' | 'technical' | 'consultation';
    pricing: {
        monthly: number;
        yearly: number;
        currency: string;
    };
    quotas: {
        aiQueries: number;
        dataVolumeMB: number;
        projects: number;
        visualizations: number;
        consultationMinutes?: number;
    };
    features: string[];
    stripeProductId?: string;
    stripePriceIds?: {
        monthly: string;
        yearly: string;
    };
}

interface ConsumptionRate {
    type: 'ai_query' | 'data_upload' | 'consultation' | 'visualization' | 'export';
    baseRate: number;
    currency: string;
    roleMultipliers: Record<string, number>;
    complexityMultipliers: Record<string, number>;
    volumeDiscounts: VolumeDiscount[];
}

interface VolumeDiscount {
    minVolume: number;
    discountPercent: number;
}

interface Campaign {
    id: string;
    name: string;
    type: 'percentage' | 'fixed_amount' | 'trial_extension' | 'feature_unlock';
    value: number;
    conditions: CampaignCondition[];
    validFrom: Date;
    validTo: Date;
    maxUses?: number;
    currentUses: number;
    targetTiers?: string[];
    targetRoles?: string[];
    isActive: boolean;
}

interface CampaignCondition {
    type: 'new_user' | 'upgrade' | 'usage_threshold' | 'referral' | 'geographic';
    value?: any;
}

interface TaxConfiguration {
    enabled: boolean;
    provider: 'stripe_tax' | 'taxjar' | 'avalara';
    defaultRate: number;
    exemptCountries: string[];
    businessRules: TaxRule[];
}

interface TaxRule {
    country: string;
    region?: string;
    rate: number;
    businessTypeExemptions: string[];
}

interface CurrencyConfig {
    primary: string;
    supported: string[];
    conversionRates: Record<string, number>;
    lastUpdated: Date;
}

// Enhanced Billing Service
export class EnhancedBillingService {
    private stripe: Stripe;
    private config: BillingConfig;

    constructor() {
        this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
            // Use any to avoid strict API version typing mismatches in dev
            apiVersion: (process.env.STRIPE_API_VERSION as any) || ("2023-10-16" as any)
        } as any);
        this.config = this.loadBillingConfiguration();
    }

    // Configuration Management
    private loadBillingConfiguration(): BillingConfig {
        // In production, this would load from database or configuration service
        return {
            tiers: [
                {
                    id: 'starter-nontech',
                    name: 'Starter (Non-Tech)',
                    role: 'non-tech',
                    pricing: { monthly: 19, yearly: 190, currency: 'USD' },
                    quotas: { aiQueries: 50, dataVolumeMB: 100, projects: 5, visualizations: 20 },
                    features: ['basic_analysis', 'guided_workflow', 'email_support']
                },
                {
                    id: 'professional-business',
                    name: 'Professional (Business)',
                    role: 'business',
                    pricing: { monthly: 49, yearly: 490, currency: 'USD' },
                    quotas: { aiQueries: 200, dataVolumeMB: 500, projects: 20, visualizations: 100 },
                    features: ['advanced_analytics', 'business_templates', 'priority_support', 'api_access']
                },
                {
                    id: 'enterprise-technical',
                    name: 'Enterprise (Technical)',
                    role: 'technical',
                    pricing: { monthly: 199, yearly: 1990, currency: 'USD' },
                    quotas: { aiQueries: 1000, dataVolumeMB: 2000, projects: 100, visualizations: 500 },
                    features: ['ml_pipeline', 'custom_models', 'white_label', 'dedicated_support']
                },
                {
                    id: 'consultation-expert',
                    name: 'Consultation (Expert)',
                    role: 'consultation',
                    pricing: { monthly: 299, yearly: 2990, currency: 'USD' },
                    quotas: { aiQueries: 500, dataVolumeMB: 1000, projects: 50, visualizations: 200, consultationMinutes: 120 },
                    features: ['expert_guidance', 'regulatory_compliance', 'custom_reports', 'phone_support']
                }
            ],
            consumptionRates: [
                {
                    type: 'ai_query',
                    baseRate: 0.10,
                    currency: 'USD',
                    roleMultipliers: { 'non-tech': 0.8, 'business': 1.0, 'technical': 1.5, 'consultation': 2.0 },
                    complexityMultipliers: { 'basic': 1.0, 'intermediate': 1.5, 'advanced': 2.5 },
                    volumeDiscounts: [
                        { minVolume: 100, discountPercent: 10 },
                        { minVolume: 500, discountPercent: 20 },
                        { minVolume: 1000, discountPercent: 30 }
                    ]
                },
                {
                    type: 'data_upload',
                    baseRate: 0.05,
                    currency: 'USD',
                    roleMultipliers: { 'non-tech': 1.0, 'business': 1.0, 'technical': 1.2, 'consultation': 1.0 },
                    complexityMultipliers: { 'basic': 1.0, 'intermediate': 1.0, 'advanced': 1.0 },
                    volumeDiscounts: [
                        { minVolume: 1000, discountPercent: 15 },
                        { minVolume: 5000, discountPercent: 25 }
                    ]
                }
            ],
            campaigns: [],
            taxConfig: {
                enabled: true,
                provider: 'stripe_tax',
                defaultRate: 0.08,
                exemptCountries: ['US-DE'], // Delaware
                businessRules: []
            },
            currency: {
                primary: 'USD',
                supported: ['USD', 'EUR', 'GBP', 'CAD'],
                conversionRates: { 'EUR': 0.85, 'GBP': 0.73, 'CAD': 1.35 },
                lastUpdated: new Date()
            }
        };
    }

    async updateBillingConfiguration(config: Partial<BillingConfig>): Promise<void> {
        this.config = { ...this.config, ...config };
        // In production, save to database and notify other instances
        await this.syncConfigurationToDatabase();
    }

    private async syncConfigurationToDatabase(): Promise<void> {
        // Implementation for saving configuration to database
        console.log('Syncing billing configuration to database...');
    }

    // Subscription Management
    async createSubscription(userId: string, tierId: string, paymentMethodId: string): Promise<any> {
        const tier = this.config.tiers.find(t => t.id === tierId);
        if (!tier) throw new Error('Invalid subscription tier');

        const user = await storage.getUser(userId);
        if (!user) throw new Error('User not found');

        try {
            // Create Stripe customer if doesn't exist
            let stripeCustomerId = user.stripeCustomerId;
            if (!stripeCustomerId) {
                const customer = await this.stripe.customers.create({
                    email: user.email,
                    name: ((user as any).name) || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                    metadata: { userId, role: tier.role }
                } as any);
                stripeCustomerId = customer.id;
                await storage.updateUser(userId, { stripeCustomerId });
            }

            // Attach payment method
            await this.stripe.paymentMethods.attach(paymentMethodId, {
                customer: stripeCustomerId
            });

            // Create subscription
            const subscription: any = await this.stripe.subscriptions.create({
                customer: stripeCustomerId,
                items: [{ price: tier.stripePriceIds?.monthly || 'price_default' }],
                default_payment_method: paymentMethodId,
                metadata: {
                    userId,
                    tierId,
                    role: tier.role
                }
            } as any);

            // Update user subscription info
            await storage.updateUser(userId, {
                subscriptionTier: tierId,
                subscriptionStatus: 'active',
                stripeSubscriptionId: subscription.id
            });

            return {
                success: true,
                subscriptionId: subscription.id,
                tier: tier,
                nextBilling: new Date((subscription.current_period_end as number) * 1000)
            };

        } catch (error) {
            console.error('Subscription creation failed:', error);
            throw new Error(`Subscription creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    // Consumption Billing
    async calculateConsumptionCost(
        userId: string,
        consumptionType: string,
        volume: number,
        complexity: string = 'basic'
    ): Promise<any> {
        const user = await storage.getUser(userId);
        if (!user) throw new Error('User not found');

        const rate = this.config.consumptionRates.find(r => r.type === consumptionType);
        if (!rate) throw new Error('Invalid consumption type');

        // Apply campaign discounts
        const applicableCampaigns = await this.getApplicableCampaigns(userId);

        // Calculate base cost
        let baseCost = rate.baseRate * volume;

        // Apply role multiplier
    const roleMultiplier = rate.roleMultipliers[(user as any).role || 'non-tech'] || 1.0;
        baseCost *= roleMultiplier;

        // Apply complexity multiplier
        const complexityMultiplier = rate.complexityMultipliers[complexity] || 1.0;
        baseCost *= complexityMultiplier;

        // Apply volume discounts
        const volumeDiscount = this.calculateVolumeDiscount(rate.volumeDiscounts, volume);
        baseCost *= (1 - volumeDiscount / 100);

        // Apply campaign discounts
        let finalCost = baseCost;
        let appliedDiscounts = [];

        for (const campaign of applicableCampaigns) {
            if (campaign.type === 'percentage') {
                finalCost *= (1 - campaign.value / 100);
                appliedDiscounts.push({
                    campaignId: campaign.id,
                    type: 'percentage',
                    value: campaign.value,
                    savings: baseCost * (campaign.value / 100)
                });
            } else if (campaign.type === 'fixed_amount') {
                finalCost = Math.max(0, finalCost - campaign.value);
                appliedDiscounts.push({
                    campaignId: campaign.id,
                    type: 'fixed_amount',
                    value: campaign.value,
                    savings: Math.min(campaign.value, finalCost)
                });
            }
        }

        return {
            baseCost,
            finalCost,
            breakdown: {
                baseRate: rate.baseRate,
                volume,
                roleMultiplier,
                complexityMultiplier,
                volumeDiscount,
                appliedDiscounts
            },
            currency: rate.currency
        };
    }

    // Campaign Management
    async createCampaign(campaign: Omit<Campaign, 'id' | 'currentUses'>): Promise<Campaign> {
        const newCampaign: Campaign = {
            ...campaign,
            id: nanoid(),
            currentUses: 0
        };

        this.config.campaigns.push(newCampaign);
        await this.syncConfigurationToDatabase();

        return newCampaign;
    }

    async applyCampaign(userId: string, campaignCode: string): Promise<boolean> {
        const campaign = this.config.campaigns.find(c =>
            c.name.toLowerCase() === campaignCode.toLowerCase() &&
            c.isActive &&
            new Date() >= c.validFrom &&
            new Date() <= c.validTo &&
            (!c.maxUses || c.currentUses < c.maxUses)
        );

        if (!campaign) return false;

        const user = await storage.getUser(userId);
        if (!user) return false;

        // Check campaign conditions
        const conditionsMet = await this.validateCampaignConditions(campaign.conditions, userId);
        if (!conditionsMet) return false;

        // Apply campaign to user
        campaign.currentUses++;
        await storage.updateUser(userId, {
            activeCampaigns: [...(((user as any).activeCampaigns) || []), campaign.id] as any
        } as any);

        await this.syncConfigurationToDatabase();
        return true;
    }

    private async getApplicableCampaigns(userId: string): Promise<Campaign[]> {
        const user = await storage.getUser(userId);
    if (!user || !(user as any).activeCampaigns) return [];

        return this.config.campaigns.filter(campaign =>
            ((user as any).activeCampaigns as string[]).includes(campaign.id) &&
            campaign.isActive &&
            new Date() >= campaign.validFrom &&
            new Date() <= campaign.validTo
        );
    }

    private calculateVolumeDiscount(discounts: VolumeDiscount[], volume: number): number {
        const applicableDiscount = discounts
            .filter(d => volume >= d.minVolume)
            .sort((a, b) => b.discountPercent - a.discountPercent)[0];

        return applicableDiscount?.discountPercent || 0;
    }

    private async validateCampaignConditions(conditions: CampaignCondition[], userId: string): Promise<boolean> {
        const user = await storage.getUser(userId);
        if (!user) return false;

        for (const condition of conditions) {
            switch (condition.type) {
                case 'new_user':
                    const daysSinceSignup = (Date.now() - (user.createdAt as Date).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceSignup > (condition.value || 7)) return false;
                    break;

                case 'upgrade':
                    if (user.subscriptionTier) return false; // Already has subscription
                    break;

                case 'usage_threshold':
                    // Check if user has reached certain usage threshold
                    const usage = await this.getUserUsage(userId);
                    if (usage.totalQueries < condition.value) return false;
                    break;

                default:
                    continue;
            }
        }

        return true;
    }

    // Hybrid Billing Logic
    async processHybridBilling(userId: string, usage: any): Promise<any> {
        const user = await storage.getUser(userId);
        if (!user) throw new Error('User not found');

        const isSubscriber = user.subscriptionTier && user.subscriptionStatus === 'active';

        if (isSubscriber) {
            return this.processSubscriptionUsage(userId, usage);
        } else {
            return this.processPayPerUseUsage(userId, usage);
        }
    }

    private async processSubscriptionUsage(userId: string, usage: any): Promise<any> {
        const user = await storage.getUser(userId);
        const currentUsage = await this.getUserUsage(userId);

        // Check quota limits
    const quotaStatus = this.checkQuotaLimits((user as any).quotas || {}, currentUsage);

        if (quotaStatus.withinLimits) {
            // Usage within quota - no additional charge
            return {
                model: 'subscription',
                cost: 0,
                quotaStatus,
                remainingQuota: quotaStatus.remaining
            };
        } else {
            // Overage - charge for excess usage
            const overageCost = await this.calculateOverageCost(userId, quotaStatus.overages);
            return {
                model: 'subscription_overage',
                cost: overageCost.total,
                quotaStatus,
                overageBreakdown: overageCost.breakdown
            };
        }
    }

    private async processPayPerUseUsage(userId: string, usage: any): Promise<any> {
        const costs = [];
        let totalCost = 0;

        for (const [type, volume] of Object.entries(usage)) {
            const cost = await this.calculateConsumptionCost(
                userId,
                type as string,
                volume as number,
                usage.complexity || 'basic'
            );
            costs.push(cost);
            totalCost += cost.finalCost;
        }

        return {
            model: 'pay_per_use',
            cost: totalCost,
            breakdown: costs
        };
    }

    private checkQuotaLimits(quotas: Record<string, number>, currentUsage: any): any {
        const status: any = {
            withinLimits: true,
            remaining: {} as Record<string, number>,
            overages: {} as Record<string, number>,
            utilizationPercent: {} as Record<string, number>
        };

        for (const [quota, limit] of Object.entries(quotas)) {
            const used = (currentUsage?.[quota as any]) || 0;
            const remaining = Math.max(0, (limit as number) - used);
            const overage = Math.max(0, used - (limit as number));
            const utilization = ((used / (limit as number)) * 100);

            status.remaining[quota] = remaining;
            status.overages[quota] = overage;
            status.utilizationPercent[quota] = utilization;

            if (overage > 0) {
                status.withinLimits = false;
            }
        }

        return status;
    }

    private async calculateOverageCost(userId: string, overages: any): Promise<any> {
        const breakdown = [];
        let total = 0;

        for (const [type, volume] of Object.entries(overages)) {
            if ((volume as number) > 0) {
                const cost = await this.calculateConsumptionCost(userId, type, volume as number);
                breakdown.push({ type, volume, cost: cost.finalCost });
                total += cost.finalCost;
            }
        }

        return { total, breakdown };
    }

    private async getUserUsage(userId: string): Promise<any> {
        // Get current month usage from database
        // This would integrate with your usage tracking service
        return {
            aiQueries: 45,
            dataVolumeMB: 250,
            projects: 3,
            visualizations: 12,
            totalQueries: 45
        };
    }

    // Tax Calculation
    async calculateTax(amount: number, userId: string): Promise<number> {
        if (!this.config.taxConfig.enabled) return 0;

        const user = await storage.getUser(userId);
        if (!user) {
            return amount * this.config.taxConfig.defaultRate;
        }

        // Use default tax rate since billingAddress is not available in user schema
        return amount * this.config.taxConfig.defaultRate;

        // Use Stripe Tax for automatic calculation
        if (this.config.taxConfig.provider === 'stripe_tax') {
            try {
                const calculation = await this.stripe.tax.calculations.create({
                    currency: this.config.currency.primary.toLowerCase(),
                    line_items: [{
                        amount: Math.round(amount * 100), // Convert to cents
                        reference: 'analysis-service'
                    }],
                    customer_details: {
                        address: {
                            country: 'US', // Default country since billingAddress not available
                            state: 'CA',
                            postal_code: '90210'
                        },
                        address_source: 'billing'
                    }
                });

                return calculation.tax_amount_exclusive / 100; // Convert back to dollars
            } catch (error) {
                console.error('Stripe tax calculation failed:', error);
                return amount * this.config.taxConfig.defaultRate;
            }
        }

        return amount * this.config.taxConfig.defaultRate;
    }

    // Webhook Processing
    async processStripeWebhook(event: Stripe.Event): Promise<void> {
        switch (event.type) {
            case 'customer.subscription.updated':
                await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
                break;

            case 'customer.subscription.deleted':
                await this.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
                break;

            case 'invoice.payment_failed':
                await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
                break;

            case 'invoice.payment_succeeded':
                await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
                break;

            default:
                console.log(`Unhandled webhook event type: ${event.type}`);
        }
    }

    private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
        const userId = subscription.metadata.userId;
        if (!userId) return;

        await storage.updateUser(userId, {
            subscriptionStatus: subscription.status
        });
    }

    private async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
        const userId = subscription.metadata.userId;
        if (!userId) return;

        await storage.updateUser(userId, {
            subscriptionStatus: 'canceled',
            subscriptionTier: null
        });
    }

    private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
        const customerId = invoice.customer as string;
        const customer = await this.stripe.customers.retrieve(customerId);

        if (customer.deleted) return;

        const userId = customer.metadata?.userId;
        if (!userId) return;

        // Implement dunning logic
        await this.processDunning(userId, invoice);
    }

    private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
        const customerId = invoice.customer as string;
        const customer = await this.stripe.customers.retrieve(customerId);

        if (customer.deleted) return;

        const userId = customer.metadata?.userId;
        if (!userId) return;

        // Reset usage counters for new billing period
        await this.resetUsageCounters(userId);
    }

    private async processDunning(userId: string, invoice: Stripe.Invoice): Promise<void> {
        // Implement progressive dunning logic
        console.log(`Processing dunning for user ${userId}, invoice ${invoice.id}`);

        // Send payment failure notifications
        // Update user status
        // Set grace period
    }

    private async resetUsageCounters(userId: string): Promise<void> {
        // Reset monthly usage counters
        console.log(`Resetting usage counters for user ${userId}`);
    }

    // Admin Functions
    async getAdminBillingOverview(): Promise<any> {
        return {
            activeTiers: this.config.tiers.length,
            activeCampaigns: this.config.campaigns.filter(c => c.isActive).length,
            totalRevenue: 0, // Calculate from database
            subscriptionRevenue: 0,
            consumptionRevenue: 0,
            topPerformingTiers: [], // Calculate from usage data
            campaignPerformance: this.config.campaigns.map(c => ({
                id: c.id,
                name: c.name,
                uses: c.currentUses,
                conversionRate: 0 // Calculate
            }))
        };
    }
}

export const enhancedBillingService = new EnhancedBillingService();