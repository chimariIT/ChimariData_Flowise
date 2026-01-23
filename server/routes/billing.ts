import { Router, Request, Response, NextFunction } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';
import { storage } from '../storage';
import { z } from 'zod';
import { tokenStorage } from '../token-storage';
import { PricingService } from '../services/pricing';
import { mlLLMUsageTracker } from '../services/ml-llm-usage-tracker';
import { getAuthHeader } from '../utils/auth-headers';
import type { FeatureComplexity, JourneyType } from '@shared/canonical-types';

const billingService = getBillingService();

const router = Router();

// Import the standardized auth middleware
import { ensureAuthenticated } from './auth';

// Custom authentication middleware for billing routes that optionally allows unauthenticated access
const billingAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = getAuthHeader(req);
    if (!authHeader) {
      // For billing routes that don't require auth (like capacity summary without user), continue
      return next();
    }

    const [scheme, token] = authHeader.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') {
      return next();
    }

    const tokenData = tokenStorage.validateToken(token);

    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const user = await storage.getUser(tokenData.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = { ...user, role: user.role ?? undefined } as any;
    req.userId = user.id;
    return next();
  } catch (error: any) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * GET /api/billing/health
 * Billing service health check
 */
router.get('/health', async (req, res) => {
  res.json({
    healthy: true,
    service: 'unified-billing-service',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/billing/overage-summary
 * Get overage charges summary for current user
 */
router.get('/overage-summary', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const overageSummary = await billingService.getOverageSummary(userId);

    res.json({
      success: true,
      overage: overageSummary,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting overage summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/trial-credits
 * Get trial credits status for current user
 */
router.get('/trial-credits', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const creditsStatus = await billingService.getTrialCreditsStatus(userId);

    if (!creditsStatus) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({
      success: true,
      trialCredits: {
        total: creditsStatus.total,
        used: creditsStatus.used,
        remaining: creditsStatus.remaining,
        percentUsed: Math.round(creditsStatus.percentUsed),
        expired: creditsStatus.expired,
        expiresAt: creditsStatus.expiresAt?.toISOString() || null,
        // Credit cost reference for UI
        costReference: {
          small: 10,
          medium: 25,
          large: 50,
          extra_large: 100
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting trial credits:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/features
 * Get available features for current user based on subscription tier
 * P0-3: Feature access gating - endpoint for frontend to check available features
 */
router.get('/features', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Import feature gate utilities
    const { getUserFeatures, checkFeatureAccess, GATED_FEATURES } = await import('../middleware/feature-gate');

    const availableFeatures = await getUserFeatures(userId);
    const user = await storage.getUser(userId);
    const tier = user?.subscriptionTier || 'none';

    // Build a feature access map for common features
    const featureAccessMap: Record<string, boolean> = {};
    for (const [key, featureId] of Object.entries(GATED_FEATURES)) {
      const result = await checkFeatureAccess(userId, featureId);
      featureAccessMap[featureId] = result.allowed;
    }

    res.json({
      success: true,
      tier,
      availableFeatures,
      featureAccess: featureAccessMap,
      allFeatures: GATED_FEATURES,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting user features:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/features/:featureId
 * Check if user has access to a specific feature
 */
router.get('/features/:featureId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { featureId } = req.params;
    const { checkFeatureAccess } = await import('../middleware/feature-gate');

    const result = await checkFeatureAccess(userId, featureId);

    res.json({
      success: true,
      featureId,
      allowed: result.allowed,
      tier: result.tier,
      reason: result.reason,
      upgradeUrl: result.allowed ? undefined : '/pricing',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error checking feature access:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/usage-summary
 * Get usage summary for current user
 */
router.get('/usage-summary', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const usage = await billingService.getUserUsageSummary(userId);
    
    res.json({
      success: true,
      userId,
      dataUsage: usage.dataUsage || { totalUploadSizeMB: 0 },
      computeUsage: usage.computeUsage || { toolExecutions: 0, aiQueries: 0 },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/quota-check/data
 * Check data quota for current user
 */
router.get('/quota-check/data', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const quotaInfo = await billingService.getUserCapacitySummary(userId);
    
    res.json({
      success: true,
      userId,
      quotaUsed: quotaInfo.dataUsage?.totalUploadSizeMB || 0,
      quotaLimit: quotaInfo.dataQuota?.maxDataUploadsMB || 1000,
      quotaRemaining: Math.max(0, (quotaInfo.dataQuota?.maxDataUploadsMB || 1000) - (quotaInfo.dataUsage?.totalUploadSizeMB || 0)),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/billing/quota-check/compute
 * Check compute quota for current user
 */
router.get('/quota-check/compute', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const quotaInfo = await billingService.getUserCapacitySummary(userId);
    
    res.json({
      success: true,
      userId,
      quotaUsed: quotaInfo.computeUsage?.toolExecutions || 0,
      quotaLimit: quotaInfo.computeQuota?.maxToolExecutions || 100,
      quotaRemaining: Math.max(0, (quotaInfo.computeQuota?.maxToolExecutions || 100) - (quotaInfo.computeUsage?.toolExecutions || 0)),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Routes use individual authentication as needed

// Request validation schemas
// Accept both old and new journey type names for backwards compatibility
const billingCalculationSchema = z.object({
  journeyType: z.enum([
    // New canonical names
    'non-tech', 'business', 'technical', 'consultation', 'custom',
    // Old legacy names (for backwards compatibility) - now deprecated
    'ai_guided', 'template_based', 'self_service'
  ]),
  datasetSizeMB: z.number().min(0),
  additionalFeatures: z.array(z.string()).optional(),
});

// Map old journey types to new canonical names
const normalizeJourneyType = (journeyType: string): string => {
  const mapping: Record<string, string> = {
    'ai_guided': 'non-tech',
    'template_based': 'business',
    'self_service': 'technical',
    // New names pass through unchanged
    'non-tech': 'non-tech',
    'business': 'business',
    'technical': 'technical',
    'consultation': 'consultation',
    'custom': 'custom'
  };
  return mapping[journeyType] || journeyType;
};

const capacitySummarySchema = z.object({
  userId: z.string(),
});

/**
 * Calculate billing with subscription capacity tracking
 */
router.post('/calculate', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const validation = billingCalculationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.errors,
      });
    }

    const { journeyType, datasetSizeMB, additionalFeatures } = validation.data;

    const result = await billingService.calculateBillingWithCapacity(
      userId,
      { journeyType, datasetSizeMB, additionalFeatures }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      billing: result.billing,
    });

  } catch (error) {
    console.error('Error calculating billing:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Get user capacity summary
 */
router.get('/capacity-summary', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const summary = await billingService.getUserCapacitySummary(userId);

    res.json({
      success: true,
      summary: summary,
    });

  } catch (error) {
    console.error('Error getting capacity summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Update user usage after journey execution
 */
router.post('/update-usage', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const validation = z.object({
      journeyType: z.enum(['non-tech', 'business', 'technical']),
      datasetSizeMB: z.number().min(0),
      additionalFeatures: z.array(z.string()).optional(),
    }).safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.errors,
      });
    }

    const { journeyType, datasetSizeMB, additionalFeatures } = validation.data;

    // Calculate journey requirements
    const requirements = await billingService.calculateJourneyRequirements(
      journeyType,
      datasetSizeMB
    );

    await billingService.updateUserUsage(userId, requirements);

    res.json({
      success: true,
      message: 'Usage updated successfully',
    });

  } catch (error) {
    console.error('Error updating usage:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Get billing breakdown for a specific journey
 */
router.post('/journey-breakdown', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const validation = billingCalculationSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.errors,
      });
    }

    const { journeyType: rawJourneyType, datasetSizeMB, additionalFeatures } = validation.data;

    // Normalize journey type (convert old names to new canonical names)
    const journeyType = normalizeJourneyType(rawJourneyType);

    const result = await billingService.calculateBillingWithCapacity(
      userId,
      { journeyType, datasetSizeMB, additionalFeatures }
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Format response for UI display
    type BillingBreakdownItem = {
      item: string;
      cost: number;
      capacityUsed?: number;
      capacityRemaining?: number;
    };

    const breakdownItems: BillingBreakdownItem[] = Array.isArray(result.billing?.breakdown)
      ? (result.billing!.breakdown as BillingBreakdownItem[])
      : [];

    const formattedBreakdown = {
      journeyType,
      datasetSizeMB,
      totalCost: result.billing!.finalCost,
      baseCost: result.billing!.baseCost,
      subscriptionCredits: result.billing!.subscriptionCredits,
      capacityUsed: result.billing!.capacityUsed,
      capacityRemaining: result.billing!.capacityRemaining,
      utilizationPercentage: result.billing!.utilizationPercentage,
      breakdown: breakdownItems.map(item => ({
        description: item.item,
        cost: item.cost,
        capacityImpact: {
          used: item.capacityUsed,
          remaining: item.capacityRemaining,
        },
      })),
    };

    res.json({
      success: true,
      breakdown: formattedBreakdown,
    });

  } catch (error) {
    console.error('Error getting journey breakdown:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

/**
 * Get user capacity summary and usage
 */
router.get('/capacity-summary-old', async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await billingService.getUserCapacitySummary(userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      ...result.summary,
    });
  } catch (error: any) {
    console.error('Error getting capacity summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get capacity summary',
    });
  }
});

// ML/LLM Usage and Cost Estimation Endpoints

/**
 * Get ML/LLM usage summary
 */
router.get('/ml-usage-summary', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const usage = await billingService.getMLUsageSummary(userId);
    
    res.json({
      success: true,
      usage
    });
  } catch (error) {
    console.error('Error getting ML usage summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML usage summary'
    });
  }
});

/**
 * Calculate ML training cost estimate
 */
router.post('/ml-cost-estimate', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const { toolName, datasetSize, useAutoML, enableExplainability, trials } = req.body;

    if (!toolName || !datasetSize) {
      return res.status(400).json({
        success: false,
        error: 'toolName and datasetSize are required'
      });
    }

    const estimate = await billingService.calculateMLCostEstimate({
      userId,
      toolName,
      datasetSize,
      useAutoML,
      enableExplainability,
      trials
    });

    res.json(estimate);
  } catch (error) {
    console.error('Error calculating ML cost estimate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate ML cost estimate'
    });
  }
});

/**
 * Calculate LLM fine-tuning cost estimate
 */
router.post('/llm-cost-estimate', billingAuth, async (req, res) => {
  try {
    const userId = req.userId || 'anonymous';
    const { toolName, datasetSize, method, numEpochs } = req.body;

    if (!toolName || !datasetSize) {
      return res.status(400).json({
        success: false,
        error: 'toolName and datasetSize are required'
      });
    }

    const estimate = await billingService.calculateLLMCostEstimate({
      userId,
      toolName,
      datasetSize,
      method,
      numEpochs
    });

    res.json(estimate);
  } catch (error) {
    console.error('Error calculating LLM cost estimate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate LLM cost estimate'
    });
  }
});

/**
 * Get ML/LLM pricing examples for all tiers
 */
router.get('/ml-pricing-examples', async (req, res) => {
  try {
    const examples = PricingService.getMLPricingExamples();

    res.json({
      success: true,
      pricing_examples: examples
    });
  } catch (error) {
    console.error('Error getting ML pricing examples:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get ML pricing examples'
    });
  }
});

// ============================================================
// QUOTA STATUS ENDPOINTS (Subscription-Aligned Billing)
// ============================================================

/**
 * GET /api/billing/quota-status
 * Get user's current quota status for all features
 * Returns quota info per feature for the user's subscription tier
 */
router.get('/quota-status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    const userTier = (user as any)?.subscriptionTier || 'trial';
    const subscriptionStatus = (user as any)?.subscriptionStatus || 'inactive';

    // Get quota status for common features
    const featureIds = ['statistical_analysis', 'visualization', 'data_upload', 'machine_learning'];
    const complexities: FeatureComplexity[] = ['small', 'medium', 'large', 'extra_large'];

    const features: Record<string, Record<string, any>> = {};

    for (const featureId of featureIds) {
      features[featureId] = {};
      for (const complexity of complexities) {
        const status = await billingService.getQuotaStatus(userId, featureId, complexity);
        if (status) {
          features[featureId][complexity] = status;
        }
      }
    }

    res.json({
      success: true,
      userId,
      subscriptionTier: userTier,
      subscriptionStatus,
      features,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting quota status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get quota status'
    });
  }
});

/**
 * GET /api/billing/quota-status/:featureId
 * Get quota status for a specific feature
 */
router.get('/quota-status/:featureId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { featureId } = req.params;
    const complexity = (req.query.complexity as FeatureComplexity) || 'small';

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const status = await billingService.getQuotaStatus(userId, featureId, complexity);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: `Quota status not found for feature: ${featureId}`
      });
    }

    const user = await storage.getUser(userId);

    res.json({
      success: true,
      featureId,
      complexity,
      subscriptionTier: (user as any)?.subscriptionTier || 'trial',
      ...status,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting feature quota status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get quota status'
    });
  }
});

/**
 * GET /api/billing/subscription-status
 * Get current subscription status and tier info
 */
router.get('/subscription-status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = await storage.getUser(userId);
    // Default to 'trial' not 'none' - all new users should get trial quotas
    const userTier = (user as any)?.subscriptionTier || 'trial';
    const subscriptionStatus = (user as any)?.subscriptionStatus || (userTier === 'trial' ? 'trialing' : 'inactive');

    // Get tier configuration
    let tierConfig = billingService.getTierConfig(userTier);

    // Fallback: If tier config not in DB, construct from defaults
    if (!tierConfig && (userTier === 'trial' || userTier === 'none')) {
      tierConfig = {
        tier: 'trial' as any,
        displayName: 'Trial',
        description: 'Free trial with limited analyses',
        pricing: { monthly: 0, yearly: 0, currency: 'USD' },
        stripeProductId: '',
        stripePriceIds: { monthly: '', yearly: '' },
        quotas: {
          maxProjects: 3,
          maxDatasetsPerProject: 2,
          maxDataUploadsMB: 50,
          maxAIQueries: 10,
          maxAnalysisComponents: 3,
          maxVisualizationsPerProject: 5,
          maxComputeMinutes: 30,
          maxStorageMB: 50,
          maxDataProcessingMB: 50,
          allowedJourneys: ['non-tech', 'business'],
          featureQuotas: {
            data_upload: { small: 5, medium: 0, large: 0, extra_large: 0 },
            statistical_analysis: { small: 3, medium: 0, large: 0, extra_large: 0 },
            visualization: { small: 5, medium: 0, large: 0, extra_large: 0 },
            machine_learning: { small: 0, medium: 0, large: 0, extra_large: 0 },
          }
        },
        overagePricing: {
          dataPerMB: 0,
          computePerMinute: 0,
          storagePerMB: 0,
          aiQueryCost: 0,
          visualizationCost: 0,
          featureOveragePricing: {}
        },
        features: ['basic_analysis', 'data_upload', 'visualizations'],
        isActive: true
      };
    }

    res.json({
      success: true,
      userId,
      subscription: {
        tier: userTier,
        status: subscriptionStatus,
        displayName: tierConfig?.displayName || userTier,
        expiresAt: (user as any)?.subscriptionExpiresAt || null,
        stripeSubscriptionId: (user as any)?.stripeSubscriptionId || null
      },
      quotas: tierConfig ? {
        maxProjects: tierConfig.quotas.maxProjects,
        maxDatasetsPerProject: tierConfig.quotas.maxDatasetsPerProject,
        maxDataUploadsMB: tierConfig.quotas.maxDataUploadsMB,
        maxAIQueries: tierConfig.quotas.maxAIQueries,
        allowedJourneys: tierConfig.quotas.allowedJourneys,
        featureQuotas: tierConfig.quotas.featureQuotas
      } : null,
      features: tierConfig?.features || [],
      pricing: tierConfig ? {
        monthly: tierConfig.pricing.monthly,
        yearly: tierConfig.pricing.yearly,
        currency: tierConfig.pricing.currency
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get subscription status'
    });
  }
});

/**
 * POST /api/billing/check-journey-access
 * Check if user can access a specific journey type
 */
router.post('/check-journey-access', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { journeyType } = req.body;
    if (!journeyType) {
      return res.status(400).json({
        success: false,
        error: 'journeyType is required'
      });
    }

    const access = await billingService.canAccessJourney(userId, journeyType as JourneyType);

    res.json({
      success: true,
      journeyType,
      ...access
    });
  } catch (error: any) {
    console.error('Error checking journey access:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check journey access'
    });
  }
});

/**
 * GET /api/billing/usage-metrics
 * Get detailed usage metrics for current billing period
 */
router.get('/usage-metrics', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const metrics = await billingService.getUsageMetrics(userId);

    if (!metrics) {
      return res.status(404).json({
        success: false,
        error: 'Usage metrics not found'
      });
    }

    res.json({
      success: true,
      metrics
    });
  } catch (error: any) {
    console.error('Error getting usage metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get usage metrics'
    });
  }
});

/**
 * GET /api/billing/available-tiers
 * Get all available subscription tiers for upgrade
 */
router.get('/available-tiers', async (req, res) => {
  try {
    const tiers = billingService.config.tiers.filter(tier => tier.isActive);

    res.json({
      success: true,
      tiers: tiers.map(tier => ({
        id: tier.id,
        displayName: tier.displayName,
        description: tier.description,
        pricing: tier.pricing,
        quotas: tier.quotas,
        features: tier.features
      }))
    });
  } catch (error: any) {
    console.error('Error getting available tiers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get available tiers'
    });
  }
});

export default router;
