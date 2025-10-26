import { Router } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';
import { ensureAuthenticated } from './auth';

const billingService = getBillingService();

const router = Router();

// Middleware to ensure admin access
const ensureAdmin = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

// Get billing overview
router.get('/overview', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const overview = await billingService.getAdminBillingOverview();
        res.json({ success: true, data: overview });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Subscription Tier Management
router.get('/tiers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;
        res.json({ success: true, tiers: config.tiers });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/tiers', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { tier } = req.body;

        // Validate tier structure
        if (!tier.id || !tier.name || !tier.role || !tier.pricing || !tier.quotas) {
            return res.status(400).json({
                success: false,
                error: 'Invalid tier structure. Required: id, name, role, pricing, quotas'
            });
        }

        const config = (billingService as any).config;
        const existingIndex = config.tiers.findIndex((t: any) => t.id === tier.id);

        if (existingIndex >= 0) {
            config.tiers[existingIndex] = tier;
        } else {
            config.tiers.push(tier);
        }

        await billingService.updateBillingConfiguration({ tiers: config.tiers });

        res.json({ success: true, message: 'Tier updated successfully' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/tiers/:tierId', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const { tierId } = req.params;
        const config = (billingService as any).config;

        config.tiers = config.tiers.filter((t: any) => t.id !== tierId);
        await billingService.updateBillingConfiguration({ tiers: config.tiers });

        res.json({ success: true, message: 'Tier deleted successfully' });
    } catch (error: any) {
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

// Campaign Management
router.get('/campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;
        res.json({ success: true, campaigns: config.campaigns });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
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
        const config = (billingService as any).config;

        const campaign = config.campaigns.find((c: any) => c.id === campaignId);
        if (!campaign) {
            return res.status(404).json({ success: false, error: 'Campaign not found' });
        }

        campaign.isActive = !campaign.isActive;
        await billingService.updateBillingConfiguration({ campaigns: config.campaigns });

        res.json({
            success: true,
            message: `Campaign ${campaign.isActive ? 'activated' : 'deactivated'} successfully`,
            isActive: campaign.isActive
        });
    } catch (error: any) {
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

        // This would integrate with your analytics service
        const analyticsData = {
            totalRevenue: 125400.50,
            subscriptionRevenue: 89800.00,
            consumptionRevenue: 35600.50,
            period: { startDate, endDate },
            breakdown: [
                { date: '2024-01-01', subscription: 2980, consumption: 1120, total: 4100 },
                { date: '2024-01-02', subscription: 3240, consumption: 980, total: 4220 },
                // ... more data points
            ],
            topPerformingTiers: [
                { tier: 'professional-business', revenue: 45200, customers: 152 },
                { tier: 'enterprise-technical', revenue: 39800, customers: 67 }
            ]
        };

        res.json({ success: true, analytics: analyticsData });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/analytics/campaigns', ensureAuthenticated, ensureAdmin, async (req, res) => {
    try {
        const config = (billingService as any).config;

        const campaignAnalytics = config.campaigns.map((campaign: any) => ({
            id: campaign.id,
            name: campaign.name,
            type: campaign.type,
            uses: campaign.currentUses,
            maxUses: campaign.maxUses,
            utilizationRate: campaign.maxUses ? (campaign.currentUses / campaign.maxUses * 100) : 0,
            isActive: campaign.isActive,
            validFrom: campaign.validFrom,
            validTo: campaign.validTo,
            estimatedSavings: campaign.currentUses * (campaign.value || 0) // Simplified calculation
        }));

        res.json({ success: true, campaigns: campaignAnalytics });
    } catch (error: any) {
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

export default router;