import { Router } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';
import { ensureAuthenticated } from './auth';
import { db } from '../db';
import { subscriptionTierPricing, servicePricing, billingCampaigns, adminProjectActions } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { getStripeSyncService } from '../services/stripe-sync';
import { AdminAuditLogService } from '../services/admin-audit-log';
// FIX: Production Readiness - Use standardized admin middleware from RBAC
import { requireAdmin } from '../middleware/rbac';
// PHASE 6: Import PricingService for admin-configurable analysis pricing
import { PricingService, type AnalysisPricingConfig } from '../services/pricing';
import { getVolumeTierKey, getTieredAnalysisPrice, type AnalysisTypePricing, type VolumeTierThreshold } from '../../shared/pricing-config';

const billingService = getBillingService();

const router = Router();

// FIX: Production Readiness - Use standardized requireAdmin from RBAC
// This ensures consistent admin validation (checks isAdmin flag, role, and super_admin)
const ensureAdmin = requireAdmin;

// Get billing overview
router.get('/overview', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const overview = await billingService.getAdminBillingOverview();
        res.json({ success: true, data: overview });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Subscription Tier Management - CONNECTED TO DATABASE
router.get('/tiers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Query database instead of in-memory config
        const tiers = await db.select().from(subscriptionTierPricing);

        res.json({ success: true, tiers });
    } catch (error: any) {
        console.error('Error fetching tiers from database:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/tiers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { tier } = req.body;

        // Validate tier structure - updated for database schema
        if (!tier.id || !tier.displayName || !tier.monthlyPriceUsd) {
            return res.status(400).json({
                success: false,
                error: 'Invalid tier structure. Required: id, displayName, monthlyPriceUsd'
            });
        }

        // Check if tier exists
        const [existing] = await db
            .select()
            .from(subscriptionTierPricing)
            .where(eq(subscriptionTierPricing.id, tier.id));

        if (existing) {
            // Update existing tier
            const [updated] = await db
                .update(subscriptionTierPricing)
                .set({
                    name: tier.name || existing.name,
                    displayName: tier.displayName,
                    description: tier.description || existing.description,
                    monthlyPriceUsd: tier.monthlyPriceUsd,
                    yearlyPriceUsd: tier.yearlyPriceUsd || tier.monthlyPriceUsd * 10, // Default: 2 months free
                    limits: tier.limits || existing.limits,
                    features: tier.features || existing.features,
                    journeyPricing: tier.journeyPricing || existing.journeyPricing,
                    overagePricing: tier.overagePricing || existing.overagePricing,
                    discounts: tier.discounts || existing.discounts,
                    compliance: tier.compliance || existing.compliance,
                    isActive: tier.isActive !== undefined ? tier.isActive : existing.isActive,
                    updatedAt: new Date(),
                })
                .where(eq(subscriptionTierPricing.id, tier.id))
                .returning();

            // Sync with Stripe after database update
            const stripeSync = getStripeSyncService();
            if (stripeSync.isStripeConfigured()) {
                console.log(`🔄 Syncing updated tier ${tier.id} with Stripe...`);
                const syncResult = await stripeSync.syncTierWithStripe(tier.id, {
                    displayName: updated.displayName,
                    description: updated.description || '',
                    monthlyPriceUsd: updated.monthlyPriceUsd,
                    yearlyPriceUsd: updated.yearlyPriceUsd,
                    stripeProductId: updated.stripeProductId,
                    stripeMonthlyPriceId: updated.stripeMonthlyPriceId,
                    stripeYearlyPriceId: updated.stripeYearlyPriceId,
                    limits: updated.limits,
                    features: updated.features
                });

                if (syncResult.success) {
                    console.log(`✅ Stripe sync completed for tier ${tier.id}`);
                } else {
                    console.warn(`⚠️  Stripe sync failed for tier ${tier.id}:`, syncResult.error);
                }
            }

            // Log audit trail
            await AdminAuditLogService.log({
                action: 'tier_updated',
                adminId: (req as any).user?.id || 'unknown',
                entityType: 'subscription',
                changes: { before: existing, after: updated },
                reason: 'Admin tier configuration update',
                ipAddress: (req as any).ip,
                userAgent: (req as any).headers?.['user-agent']
            });

            res.json({ success: true, message: 'Tier updated successfully', tier: updated });
        } else {
            // Create new tier
            const [newTier] = await db
                .insert(subscriptionTierPricing)
                .values({
                    id: tier.id,
                    name: tier.name || tier.displayName,
                    displayName: tier.displayName,
                    description: tier.description || '',
                    monthlyPriceUsd: tier.monthlyPriceUsd,
                    yearlyPriceUsd: tier.yearlyPriceUsd || tier.monthlyPriceUsd * 10,
                    limits: tier.limits || {},
                    features: tier.features || {},
                    journeyPricing: tier.journeyPricing || {},
                    overagePricing: tier.overagePricing || {},
                    discounts: tier.discounts || {},
                    compliance: tier.compliance || {},
                    isActive: tier.isActive !== undefined ? tier.isActive : true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .returning();

            // Sync with Stripe after database insert
            const stripeSync = getStripeSyncService();
            if (stripeSync.isStripeConfigured()) {
                console.log(`🔄 Syncing new tier ${tier.id} with Stripe...`);
                const syncResult = await stripeSync.syncTierWithStripe(tier.id, {
                    displayName: newTier.displayName,
                    description: newTier.description || '',
                    monthlyPriceUsd: newTier.monthlyPriceUsd,
                    yearlyPriceUsd: newTier.yearlyPriceUsd,
                    stripeProductId: newTier.stripeProductId,
                    stripeMonthlyPriceId: newTier.stripeMonthlyPriceId,
                    stripeYearlyPriceId: newTier.stripeYearlyPriceId,
                    limits: newTier.limits,
                    features: newTier.features
                });

                if (syncResult.success) {
                    console.log(`✅ Stripe sync completed for new tier ${tier.id}`);
                } else {
                    console.warn(`⚠️  Stripe sync failed for tier ${tier.id}:`, syncResult.error);
                }
            }

            // Log audit trail
            await AdminAuditLogService.log({
                action: 'tier_created',
                adminId: (req as any).user?.id || 'unknown',
                entityType: 'subscription',
                changes: { tier: newTier },
                reason: 'Admin created new subscription tier',
                ipAddress: (req as any).ip,
                userAgent: (req as any).headers?.['user-agent']
            });

            res.json({ success: true, message: 'Tier created successfully', tier: newTier });
        }
    } catch (error: any) {
        console.error('Error saving tier to database:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/tiers/:tierId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { tierId } = req.params;

        // Soft delete by deactivating instead of hard delete
        const [deactivated] = await db
            .update(subscriptionTierPricing)
            .set({
                isActive: false,
                updatedAt: new Date(),
            })
            .where(eq(subscriptionTierPricing.id, tierId))
            .returning();

        if (!deactivated) {
            return res.status(404).json({ success: false, error: 'Tier not found' });
        }

        res.json({ success: true, message: 'Tier deactivated successfully', tier: deactivated });
    } catch (error: any) {
        console.error('Error deactivating tier:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Consumption Rates Management
router.get('/consumption-rates', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;
        res.json({ success: true, rates: config.consumptionRates });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/consumption-rates', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { rate } = req.body;

        if (!rate.type || !rate.baseRate || !rate.currency) {
            return res.status(400).json({
                success: false,
                error: 'Invalid rate structure. Required: type, baseRate, currency'
            });
        }

        const config = (billingService as any).config;
        const existingIndex = config.consumptionRates.findIndex((r: any) => r.type === rate.type);

        if (existingIndex >= 0) {
            config.consumptionRates[existingIndex] = rate;
        } else {
            config.consumptionRates.push(rate);
        }

        await billingService.updateBillingConfiguration({ consumptionRates: config.consumptionRates });

        res.json({ success: true, message: 'Consumption rate updated successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Campaign Management - Now reads from database
router.get('/campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Fetch campaigns from database for persistence
        const dbCampaigns = await db.select().from(billingCampaigns);
        res.json({ success: true, campaigns: dbCampaigns });
    } catch (error: any) {
        console.error('Error fetching campaigns:', error);
        // Fallback to in-memory if database fails
        const config = (billingService as any).config;
        res.json({ success: true, campaigns: config.campaigns });
    }
});

router.post('/campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { campaign } = req.body;

        if (!campaign.name || !campaign.type || !campaign.value || !campaign.validFrom || !campaign.validTo) {
            return res.status(400).json({
                success: false,
                error: 'Invalid campaign structure. Required: name, type, value, validFrom, validTo'
            });
        }

        // Convert date strings to Date objects
        campaign.validFrom = new Date(campaign.validFrom);
        campaign.validTo = new Date(campaign.validTo);

        const newCampaign = await billingService.createCampaign(campaign);

        res.json({ success: true, campaign: newCampaign });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/campaigns/:campaignId/toggle', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;

        // Fetch from database
        const [campaign] = await db.select().from(billingCampaigns).where(eq(billingCampaigns.id, campaignId));
        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        const newIsActive = !campaign.isActive;

        // Update in database
        await db.update(billingCampaigns)
            .set({
                isActive: newIsActive,
                updatedAt: new Date(),
            })
            .where(eq(billingCampaigns.id, campaignId));

        // Also update in-memory cache
        const config = (billingService as any).config;
        const memCampaign = config.campaigns.find((c: any) => c.id === campaignId);
        if (memCampaign) {
            memCampaign.isActive = newIsActive;
        }

        res.json({
            success: true,
            message: `Campaign ${newIsActive ? 'activated' : 'deactivated'} successfully`,
            isActive: newIsActive
        });
    } catch (error: any) {
        console.error('Error toggling campaign:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// Campaign CRUD: Update and Delete
// ============================================================================

/**
 * PUT /api/admin/billing/campaigns/:campaignId
 * Update an existing campaign
 */
router.put('/campaigns/:campaignId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { campaign } = req.body;

        if (!campaign || typeof campaign !== 'object') {
            return res.status(400).json({ success: false, error: 'Request body must include a campaign object' });
        }

        // Validate campaign type if provided
        const validTypes = ['percentage_discount', 'fixed_discount', 'trial_extension', 'quota_boost'];
        if (campaign.type && !validTypes.includes(campaign.type)) {
            return res.status(400).json({
                success: false,
                error: `Invalid campaign type. Must be one of: ${validTypes.join(', ')}`
            });
        }

        // Validate value if provided
        if (campaign.value !== undefined && (typeof campaign.value !== 'number' || campaign.value < 0)) {
            return res.status(400).json({ success: false, error: 'Campaign value must be a non-negative number' });
        }

        // Validate percentage is <= 100
        if (campaign.type === 'percentage_discount' && campaign.value > 100) {
            return res.status(400).json({ success: false, error: 'Percentage discount cannot exceed 100%' });
        }

        // Validate date range
        if (campaign.validFrom && campaign.validTo) {
            const from = new Date(campaign.validFrom);
            const to = new Date(campaign.validTo);
            if (from >= to) {
                return res.status(400).json({ success: false, error: 'validFrom must be before validTo' });
            }
        }

        const updated = await billingService.updateCampaign(campaignId, campaign);
        if (!updated) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        // Audit log
        await AdminAuditLogService.log({
            action: 'campaign_updated',
            adminId: (req as any).user?.id || 'unknown',
            entityType: 'other',
            changes: { campaignId, updates: campaign, result: updated },
            reason: 'Admin campaign update',
            ipAddress: (req as any).ip,
            userAgent: (req as any).headers?.['user-agent']
        });

        res.json({ success: true, message: 'Campaign updated successfully', campaign: updated });
    } catch (error: any) {
        console.error('Error updating campaign:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/admin/billing/campaigns/:campaignId
 * Delete a campaign
 */
router.delete('/campaigns/:campaignId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;

        // Verify campaign exists
        const [existing] = await db.select().from(billingCampaigns).where(eq(billingCampaigns.id, campaignId));
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        await billingService.deleteCampaign(campaignId);

        // Audit log
        await AdminAuditLogService.log({
            action: 'campaign_deleted',
            adminId: (req as any).user?.id || 'unknown',
            entityType: 'other',
            changes: { campaignId, deletedCampaign: existing },
            reason: 'Admin campaign deletion',
            ipAddress: (req as any).ip,
            userAgent: (req as any).headers?.['user-agent']
        });

        res.json({ success: true, message: 'Campaign deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting campaign:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Tax Configuration
router.get('/tax-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;
        res.json({ success: true, taxConfig: config.taxConfig });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/tax-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { taxConfig } = req.body;

        await billingService.updateBillingConfiguration({ taxConfig });

        res.json({ success: true, message: 'Tax configuration updated successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Currency Configuration
router.get('/currency-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;
        res.json({ success: true, currency: config.currency });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/currency-config', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { currency } = req.body;

        // Update conversion rates timestamp
        currency.lastUpdated = new Date();

        await billingService.updateBillingConfiguration({ currency });

        res.json({ success: true, message: 'Currency configuration updated successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk Operations
router.post('/bulk-operations/tier-pricing-update', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { multiplier, targetRoles } = req.body;

        if (!multiplier || multiplier <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid multiplier. Must be positive number.'
            });
        }

        const config = (billingService as any).config;
        let updatedCount = 0;

        config.tiers.forEach((tier: any) => {
            if (!targetRoles || targetRoles.includes(tier.role)) {
                tier.pricing.monthly = Math.round(tier.pricing.monthly * multiplier);
                tier.pricing.yearly = Math.round(tier.pricing.yearly * multiplier);
                updatedCount++;
            }
        });

        await billingService.updateBillingConfiguration({ tiers: config.tiers });

        res.json({
            success: true,
            message: `Updated pricing for ${updatedCount} tiers`,
            updatedTiers: updatedCount
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/bulk-operations/consumption-rate-update', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { multiplier, targetTypes } = req.body;

        if (!multiplier || multiplier <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid multiplier. Must be positive number.'
            });
        }

        const config = (billingService as any).config;
        let updatedCount = 0;

        config.consumptionRates.forEach((rate: any) => {
            if (!targetTypes || targetTypes.includes(rate.type)) {
                rate.baseRate = Math.round(rate.baseRate * multiplier * 100) / 100; // Round to 2 decimals
                updatedCount++;
            }
        });

        await billingService.updateBillingConfiguration({ consumptionRates: config.consumptionRates });

        res.json({
            success: true,
            message: `Updated consumption rates for ${updatedCount} types`,
            updatedRates: updatedCount
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Analytics and Reporting
router.get('/analytics/revenue', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const { db } = await import('../db');
        const { users, subscriptionTierPricing } = await import('../../shared/schema');
        const { sql, eq, and, gte, lte, count } = await import('drizzle-orm');

        // Parse date filters
        const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: last 30 days
        const end = endDate ? new Date(endDate as string) : new Date();

        // Query all users with their subscription data
        const allUsers = await db.select({
            id: users.id,
            email: users.email,
            subscriptionTier: users.subscriptionTier,
            subscriptionStatus: users.subscriptionStatus,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            monthlyUploads: users.monthlyUploads,
            monthlyDataVolume: users.monthlyDataVolume,
            monthlyAnalysisComponents: users.monthlyAnalysisComponents,
            monthlyAIInsights: users.monthlyAIInsights,
        }).from(users);

        // Get subscription tier pricing to calculate revenue
        const tierPricing = await db.select().from(subscriptionTierPricing);
        const pricingMap = new Map<string, { monthly: number; yearly: number }>(
            tierPricing.map((tier: any) => [tier.id, { monthly: tier.monthlyPriceUsd / 100, yearly: tier.yearlyPriceUsd / 100 }])
        );

        // Calculate revenue metrics
        let totalRevenue = 0;
        let subscriptionRevenue = 0;
        let consumptionRevenue = 0;

        const tierStats = new Map<string, { revenue: number; customers: number; }>();

        for (const user of allUsers) {
            const tier = user.subscriptionTier;

            // Skip users without active subscriptions
            if (!tier || tier === 'none' || user.subscriptionStatus !== 'active') {
                continue;
            }

            // Calculate subscription revenue (assume monthly for simplicity)
            const tierPrice = pricingMap.get(tier);
            if (tierPrice) {
                const monthlyRevenue = tierPrice.monthly;
                subscriptionRevenue += monthlyRevenue;
                totalRevenue += monthlyRevenue;

                // Track tier performance
                const existing = tierStats.get(tier) || { revenue: 0, customers: 0 };
                existing.revenue += monthlyRevenue;
                existing.customers += 1;
                tierStats.set(tier, existing);
            }

            // Calculate consumption/overage revenue (simplified - based on usage over quotas)
            // This is a basic estimation; in production, you'd track actual billing transactions
            const overageUsage = {
                dataVolume: Math.max(0, (user.monthlyDataVolume || 0) - 1000),        // Assume 1000MB base quota
                uploads: Math.max(0, (user.monthlyUploads || 0) - 10),                // Assume 10 uploads base
                analysisComponents: Math.max(0, (user.monthlyAnalysisComponents || 0) - 20),  // Assume 20 components base
                insights: Math.max(0, (user.monthlyAIInsights || 0) - 50)              // Assume 50 insights base
            };

            const overageRevenue =
                (overageUsage.dataVolume * 0.01) +          // $0.01 per MB overage
                (overageUsage.uploads * 1.00) +             // $1.00 per upload overage
                (overageUsage.analysisComponents * 0.50) +  // $0.50 per analysis component overage
                (overageUsage.insights * 0.50);             // $0.50 per insight overage

            consumptionRevenue += overageRevenue;
            totalRevenue += overageRevenue;

            // Add overage to tier stats
            if (overageRevenue > 0) {
                const existing = tierStats.get(tier) || { revenue: 0, customers: 0 };
                existing.revenue += overageRevenue;
                tierStats.set(tier, existing);
            }
        }

        // Generate breakdown by date (simplified - in production, use transaction timestamps)
        const breakdown = [];
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

        if (groupBy === 'day' && daysDiff <= 31) {
            const dailyAvgSubscription = subscriptionRevenue / Math.max(daysDiff, 1);
            const dailyAvgConsumption = consumptionRevenue / Math.max(daysDiff, 1);

            for (let i = 0; i < Math.min(daysDiff, 31); i++) {
                const date = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
                breakdown.push({
                    date: date.toISOString().split('T')[0],
                    subscription: Math.round(dailyAvgSubscription * 100) / 100,
                    consumption: Math.round(dailyAvgConsumption * 100) / 100,
                    total: Math.round((dailyAvgSubscription + dailyAvgConsumption) * 100) / 100
                });
            }
        } else {
            // For longer periods or different groupBy, aggregate by month
            breakdown.push({
                date: start.toISOString().split('T')[0],
                subscription: Math.round(subscriptionRevenue * 100) / 100,
                consumption: Math.round(consumptionRevenue * 100) / 100,
                total: Math.round(totalRevenue * 100) / 100
            });
        }

        // Get top performing tiers
        const topPerformingTiers = Array.from(tierStats.entries())
            .map(([tier, stats]) => ({
                tier,
                revenue: Math.round(stats.revenue * 100) / 100,
                customers: stats.customers
            }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const analyticsData = {
            totalRevenue: Math.round(totalRevenue * 100) / 100,
            subscriptionRevenue: Math.round(subscriptionRevenue * 100) / 100,
            consumptionRevenue: Math.round(consumptionRevenue * 100) / 100,
            period: {
                startDate: start.toISOString().split('T')[0],
                endDate: end.toISOString().split('T')[0]
            },
            breakdown,
            topPerformingTiers,
            metadata: {
                totalActiveSubscriptions: allUsers.filter((u: any) => u.subscriptionStatus === 'active').length,
                totalUsers: allUsers.length,
                calculatedAt: new Date().toISOString()
            }
        };

        res.json({ success: true, analytics: analyticsData });
    } catch (error: any) {
        console.error('Revenue analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/analytics/campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        // Read from DB (authoritative) instead of in-memory cache
        const dbCampaigns = await db.select().from(billingCampaigns);

        const now = new Date();
        const campaignAnalytics = dbCampaigns.map((campaign: any) => ({
            id: campaign.id,
            name: campaign.name,
            type: campaign.type,
            value: campaign.value,
            couponCode: campaign.couponCode,
            uses: campaign.currentUses || 0,
            maxUses: campaign.maxUses,
            utilizationRate: campaign.maxUses ? ((campaign.currentUses || 0) / campaign.maxUses * 100) : 0,
            isActive: campaign.isActive,
            isExpired: campaign.validTo ? new Date(campaign.validTo) < now : false,
            validFrom: campaign.validFrom,
            validTo: campaign.validTo,
            estimatedSavings: (campaign.currentUses || 0) * (campaign.value || 0) // Simplified calculation
        }));

        // Summary stats
        const summary = {
            totalCampaigns: campaignAnalytics.length,
            activeCampaigns: campaignAnalytics.filter((c: any) => c.isActive && !c.isExpired).length,
            totalUses: campaignAnalytics.reduce((sum: number, c: any) => sum + c.uses, 0),
            totalEstimatedSavings: campaignAnalytics.reduce((sum: number, c: any) => sum + c.estimatedSavings, 0),
        };

        res.json({ success: true, campaigns: campaignAnalytics, summary });
    } catch (error: any) {
        console.error('Campaign analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Testing and Validation
router.post('/test/calculate-cost', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { userId, consumptionType, volume, complexity } = req.body;

        const cost = await billingService.calculateConsumptionCost(
            userId,
            consumptionType,
            volume,
            complexity
        );

        res.json({ success: true, cost });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/test/apply-campaign', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { userId, campaignCode } = req.body;

        const applied = await billingService.applyCampaign(userId, campaignCode);

        res.json({
            success: true,
            applied,
            message: applied ? 'Campaign applied successfully' : 'Campaign could not be applied'
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// PHASE 6: Analysis Pricing Configuration Endpoints
// ============================================================================

/**
 * GET /api/admin/billing/analysis-pricing
 * Get current analysis pricing configuration
 */
router.get('/analysis-pricing', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = PricingService.getPricingConfig();
        console.log(`📊 [Admin] Retrieved analysis pricing config`);

        res.json({
            success: true,
            config,
            description: {
                platformFee: 'Platform fee added once per project ($)',
                analysisTypePricing: 'Tiered cost matrix: analysisType → volumeTier → complexity → price ($)',
                dataVolumeTiers: 'Data volume tier thresholds (small, medium, large, xlarge)',
                baseCost: 'Legacy: base cost for any analysis ($)',
                dataSizeCostPer1K: 'Legacy: cost per 1000 records ($)',
                complexityMultipliers: 'Legacy: multipliers for different complexity levels',
                analysisTypeFactors: 'Legacy: cost multipliers for each analysis type'
            }
        });
    } catch (error: any) {
        console.error('❌ [Admin] Error fetching analysis pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/admin/billing/analysis-pricing
 * Update analysis pricing configuration
 */
router.put('/analysis-pricing', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const updates: Partial<AnalysisPricingConfig> = req.body;

        // Validate input
        if (updates.baseCost !== undefined && (typeof updates.baseCost !== 'number' || updates.baseCost < 0)) {
            return res.status(400).json({
                success: false,
                error: 'baseCost must be a non-negative number'
            });
        }

        if (updates.dataSizeCostPer1K !== undefined && (typeof updates.dataSizeCostPer1K !== 'number' || updates.dataSizeCostPer1K < 0)) {
            return res.status(400).json({
                success: false,
                error: 'dataSizeCostPer1K must be a non-negative number'
            });
        }

        if (updates.platformFee !== undefined && (typeof updates.platformFee !== 'number' || updates.platformFee < 0)) {
            return res.status(400).json({
                success: false,
                error: 'platformFee must be a non-negative number'
            });
        }

        // Validate complexity multipliers
        if (updates.complexityMultipliers) {
            for (const [key, value] of Object.entries(updates.complexityMultipliers)) {
                if (typeof value !== 'number' || value < 0) {
                    return res.status(400).json({
                        success: false,
                        error: `complexityMultipliers.${key} must be a non-negative number`
                    });
                }
            }
        }

        // Validate analysis type factors (legacy)
        if (updates.analysisTypeFactors) {
            for (const [key, value] of Object.entries(updates.analysisTypeFactors)) {
                if (typeof value !== 'number' || value < 0) {
                    return res.status(400).json({
                        success: false,
                        error: `analysisTypeFactors.${key} must be a non-negative number`
                    });
                }
            }
        }

        // Validate tiered pricing matrix (new model)
        if (updates.analysisTypePricing) {
            const volumeTierKeys = ['small', 'medium', 'large', 'xlarge'];
            const complexityKeys = ['basic', 'intermediate', 'advanced'];

            for (const [typeName, tierCosts] of Object.entries(updates.analysisTypePricing)) {
                if (!tierCosts || typeof tierCosts !== 'object') {
                    return res.status(400).json({
                        success: false,
                        error: `analysisTypePricing.${typeName} must be an object with volume tier costs`
                    });
                }
                for (const vtKey of volumeTierKeys) {
                    const complexityCosts = (tierCosts as any)[vtKey];
                    if (!complexityCosts || typeof complexityCosts !== 'object') {
                        return res.status(400).json({
                            success: false,
                            error: `analysisTypePricing.${typeName}.${vtKey} must be an object with complexity costs`
                        });
                    }
                    for (const cKey of complexityKeys) {
                        const val = complexityCosts[cKey];
                        if (typeof val !== 'number' || val < 0) {
                            return res.status(400).json({
                                success: false,
                                error: `analysisTypePricing.${typeName}.${vtKey}.${cKey} must be a non-negative number (got ${val})`
                            });
                        }
                    }
                }
            }
        }

        // Validate data volume tiers
        if (updates.dataVolumeTiers) {
            for (const [tierKey, tierDef] of Object.entries(updates.dataVolumeTiers)) {
                if (!tierDef || typeof (tierDef as any).maxRows !== 'number' || typeof (tierDef as any).label !== 'string') {
                    return res.status(400).json({
                        success: false,
                        error: `dataVolumeTiers.${tierKey} must have numeric maxRows and string label`
                    });
                }
            }
        }

        const updatedConfig = PricingService.updatePricingConfig(updates);

        // P1-9 FIX: Force refresh pricing from database to invalidate cache
        // This ensures all subsequent requests use the updated config
        try {
            await PricingService.refreshFromDatabase();
            console.log(`🔄 [P1-9] Pricing cache invalidated after admin update`);
        } catch (refreshErr) {
            console.warn(`⚠️ [P1-9] Cache refresh failed (in-memory update still applied):`, refreshErr);
        }

        // FIX P0-2: Broadcast config change to ALL connected clients via WebSocket (not just message broker)
        // Uses same pattern as admin.ts broadcastAdminEvent to reach frontend RealtimeClient
        try {
            const mod = await import('../index.js');
            const realtimeServer = (mod as any)?.realtimeServer as { broadcast: (payload: any) => void } | undefined;
            if (realtimeServer) {
                realtimeServer.broadcast({
                    type: 'status_change',
                    sourceType: 'streaming',
                    sourceId: 'admin',
                    userId: 'system',
                    timestamp: new Date(),
                    data: {
                        eventType: 'analysis_pricing_updated',
                        updatedAt: new Date().toISOString(),
                        updatedBy: (req.user as any)?.id || 'admin',
                    }
                });
                console.log(`📡 [P0-2] Broadcasted pricing update to WebSocket clients`);
            }
        } catch (broadcastErr) {
            console.warn(`⚠️ [P0-2] Failed to broadcast config update (non-blocking):`, broadcastErr);
        }

        // Log the admin action with audit trail
        const userId = (req.user as any)?.id;
        console.log(`✅ [Admin] User ${userId} updated analysis pricing config:`, updates);

        await AdminAuditLogService.log({
            action: 'update_analysis_pricing',
            adminId: userId || 'unknown',
            entityType: 'other',
            changes: {
                updatedFields: Object.keys(updates),
                previousValues: 'see prior log entry',
                newValues: updates,
            },
            reason: 'Admin pricing configuration update',
            metadata: { timestamp: new Date().toISOString() }
        });

        res.json({
            success: true,
            config: updatedConfig,
            message: 'Analysis pricing configuration updated successfully'
        });
    } catch (error: any) {
        console.error('❌ [Admin] Error updating analysis pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/billing/analysis-pricing/reset
 * Reset analysis pricing to defaults
 */
router.post('/analysis-pricing/reset', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = PricingService.resetPricingConfig();

        const userId = (req.user as any)?.id;
        console.log(`🔄 [Admin] User ${userId} reset analysis pricing to defaults`);

        await AdminAuditLogService.log({
            action: 'reset_analysis_pricing',
            adminId: userId || 'unknown',
            entityType: 'other',
            changes: { resetTo: 'defaults' },
            reason: 'Admin reset pricing to defaults',
            metadata: { timestamp: new Date().toISOString() }
        });

        res.json({
            success: true,
            config,
            message: 'Analysis pricing reset to defaults'
        });
    } catch (error: any) {
        console.error('❌ [Admin] Error resetting analysis pricing:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/admin/billing/pricing-audit-log
 * Retrieve audit trail for pricing changes
 */
router.get('/pricing-audit-log', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const logs = await db
            .select()
            .from(adminProjectActions)
            .where(
                eq(adminProjectActions.entityType, 'other')
            )
            .orderBy(desc(adminProjectActions.createdAt))
            .limit(100);

        // Filter to pricing-related actions
        const pricingLogs = logs.filter(log =>
            log.action.includes('pricing') || log.action.includes('tier') || log.action.includes('billing')
        );

        res.json({
            success: true,
            logs: pricingLogs,
            count: pricingLogs.length
        });
    } catch (error: any) {
        console.error('❌ [Admin] Error fetching pricing audit log:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/admin/billing/analysis-pricing/preview
 * Preview cost calculation with current or proposed config
 */
router.post('/analysis-pricing/preview', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { analysisType, recordCount, complexity, proposedConfig } = req.body;

        const type = analysisType || 'statistical';
        const rows = recordCount || 10000;
        const cmplx = complexity || 'intermediate';

        // Determine which config to use for preview
        const currentConfig = PricingService.getPricingConfig();
        const previewConfig = proposedConfig
            ? { ...currentConfig, ...proposedConfig }
            : currentConfig;

        // Use tiered pricing if available
        const hasTieredPricing = !!previewConfig.analysisTypePricing &&
            Object.keys(previewConfig.analysisTypePricing).length > 0;

        let analysisCost: number;
        let volumeTierLabel = '';

        if (hasTieredPricing) {
            // Tiered pricing: lookup from matrix
            const volumeTierKey = getVolumeTierKey(rows, previewConfig.dataVolumeTiers);
            const tierDef = previewConfig.dataVolumeTiers?.[volumeTierKey];
            volumeTierLabel = tierDef?.label || volumeTierKey;

            analysisCost = getTieredAnalysisPrice(
                type,
                volumeTierKey,
                cmplx,
                previewConfig.analysisTypePricing
            );
        } else {
            // Legacy formula fallback
            const legacyResult = PricingService.calculateAnalysisCost(type, rows, cmplx as any);
            analysisCost = legacyResult.totalCost;
        }

        // Platform fee
        const platformFee = previewConfig.platformFee || PricingService.getPlatformFee();
        const totalProjectCost = platformFee + analysisCost;

        res.json({
            success: true,
            preview: {
                analysisType: type,
                recordCount: rows,
                complexity: cmplx,
                volumeTier: volumeTierLabel,
                pricingModel: hasTieredPricing ? 'tiered' : 'legacy',
                analysisCost: parseFloat(analysisCost.toFixed(2)),
                platformFee: parseFloat(platformFee.toFixed(2)),
                totalProjectCost: parseFloat(totalProjectCost.toFixed(2))
            }
        });
    } catch (error: any) {
        console.error('❌ [Admin] Error previewing analysis cost:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;