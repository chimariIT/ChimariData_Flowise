import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { AIPaymentIntegrationService } from '../services/ai-payment-integration';
import { AIAccessControlService } from '../middleware/ai-access-control';
// Types for user/tiers come from shared subscription-tiers utilities; no direct import needed here

const router = Router();

// Get pricing breakdown for user's current role and subscription
router.get('/pricing', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || 'non-tech';
    const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

    const pricingBreakdown = AIPaymentIntegrationService.getPricingBreakdown(
      userRole,
      subscriptionTier
    );

    res.json({
      success: true,
      pricing: pricingBreakdown,
      userContext: {
        userRole,
        subscriptionTier,
        paymentModel: pricingBreakdown.paymentModel
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pricing estimate for specific AI feature
router.post('/estimate', ensureAuthenticated, async (req, res) => {
  try {
    const { featureType, complexity = 'simple', quantity = 1 } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || 'non-tech';
    const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

    // Map feature types to request types
    const requestTypeMap: Record<string, any> = {
      'ai_query': 'ai_query',
      'data_upload': 'data_upload',
      'code_generation': 'code_generation',
      'consultation': 'consultation',
      'analysis': 'analysis'
    };

    const requestType = requestTypeMap[featureType] || 'ai_query';

    const estimate = await AIPaymentIntegrationService.getPricingEstimate(
      userId,
      userRole,
      subscriptionTier,
      requestType,
      complexity
    );

    // Calculate for quantity
    const totalEstimate = {
      ...estimate,
      estimatedCost: estimate.estimatedCost * quantity,
      upgradeRecommendation: estimate.upgradeRecommendation ? {
        ...estimate.upgradeRecommendation,
        savings: estimate.upgradeRecommendation.savings * quantity
      } : undefined
    };

    res.json({
      success: true,
      estimate: totalEstimate,
      requestDetails: {
        featureType,
        complexity,
        quantity,
        requestType
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get payment history for AI services
router.get('/history', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { period = 'month', page = 1, limit = 10 } = req.query;

    // Mock payment history - in production would query actual payment records
    const paymentHistory = {
      transactions: [
        {
          id: 'txn_001',
          date: new Date().toISOString(),
          description: 'AI Query - Advanced Analysis',
          amount: 0.15,
          currency: 'USD',
          paymentModel: 'pay_per_use',
          featureType: 'advanced_analysis',
          status: 'completed'
        },
        {
          id: 'txn_002',
          date: new Date(Date.now() - 86400000).toISOString(),
          description: 'Code Generation Service',
          amount: 0.25,
          currency: 'USD',
          paymentModel: 'pay_per_use',
          featureType: 'code_generation',
          status: 'completed'
        }
      ],
      summary: {
        totalSpent: 0.40,
        totalTransactions: 2,
        averageTransactionAmount: 0.20,
        period: period as string
      },
      pagination: {
        currentPage: parseInt(page as string),
        totalPages: 1,
        totalItems: 2,
        itemsPerPage: parseInt(limit as string)
      }
    };

    res.json({
      success: true,
      paymentHistory
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current payment status and quotas
router.get('/status', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || 'non-tech';
    const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

    // Get available features with payment info
    const availableFeatures = await AIAccessControlService.getAvailableFeatures(
      userId,
      userRole,
      subscriptionTier
    );

    // Get quota information for each available feature
    const featureQuotas = await Promise.all(
      availableFeatures.available.map(async (feature) => {
        const requestType = mapFeatureToRequestType(feature.featureId);
        const estimate = await AIPaymentIntegrationService.getPricingEstimate(
          userId,
          userRole,
          subscriptionTier,
          requestType
        );

        return {
          featureId: feature.featureId,
          featureName: feature.name,
          paymentModel: estimate.paymentModel,
          quotaRemaining: estimate.quotaRemaining,
          includedInPlan: estimate.includedInPlan,
          estimatedCost: estimate.estimatedCost
        };
      })
    );

    const paymentStatus = {
      paymentModel: subscriptionTier === 'none' ? 'pay_per_use' : 'subscription',
      subscriptionTier,
      userRole,
      features: featureQuotas,
      restricted: availableFeatures.restricted.map(feature => ({
        featureId: feature.featureId,
        featureName: feature.name,
        restrictionReason: feature.restrictionReason
      }))
    };

    res.json({
      success: true,
      paymentStatus
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Validate payment before AI service usage
router.post('/validate', ensureAuthenticated, async (req, res) => {
  try {
    const { requestType, complexity = 'simple', resourceUsage = {} } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || 'non-tech';
    const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

    const paymentContext = {
      userId,
      userRole,
      subscriptionTier,
      requestType,
      complexity,
      resourceUsage
    };

    const paymentCalculation = await AIPaymentIntegrationService.calculatePayment(paymentContext);

    res.json({
      success: true,
      validation: {
        canProceed: !paymentCalculation.chargeDetails.shouldCharge || paymentCalculation.subscription.includedInPlan,
        paymentRequired: paymentCalculation.chargeDetails.shouldCharge,
        chargeAmount: paymentCalculation.chargeDetails.chargeAmount,
        paymentModel: paymentCalculation.paymentModel,
        quotaAvailable: paymentCalculation.subscription.remainingQuota > 0,
        reason: paymentCalculation.chargeDetails.description
      },
      details: paymentCalculation
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process immediate payment for AI service
router.post('/charge', ensureAuthenticated, async (req, res) => {
  try {
    const { requestType, complexity = 'simple', resourceUsage = {} } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role || 'non-tech';
    const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

    const paymentContext = {
      userId,
      userRole,
      subscriptionTier,
      requestType,
      complexity,
      resourceUsage
    };

    const paymentCalculation = await AIPaymentIntegrationService.calculatePayment(paymentContext);
    const paymentResult = await AIPaymentIntegrationService.processPayment(
      paymentContext,
      paymentCalculation
    );

    if (paymentResult.success) {
      res.json({
        success: true,
        payment: {
          transactionId: paymentResult.transactionId,
          chargeAmount: paymentCalculation.chargeDetails.chargeAmount,
          description: paymentCalculation.chargeDetails.description,
          paymentModel: paymentCalculation.paymentModel
        },
        quotaUpdated: paymentResult.usageTracked
      });
    } else {
      res.status(402).json({
        success: false,
        error: paymentResult.error || 'Payment failed',
        paymentRequired: true
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to map feature IDs to request types
function mapFeatureToRequestType(featureId: string): 'ai_query' | 'data_upload' | 'code_generation' | 'consultation' | 'analysis' {
  const featureMap: Record<string, 'ai_query' | 'data_upload' | 'code_generation' | 'consultation' | 'analysis'> = {
    'basic_analysis': 'ai_query',
    'advanced_analysis': 'analysis',
    'code_generation': 'code_generation',
    'research_assistance': 'ai_query',
    'consultation_ai': 'consultation',
    'custom_models': 'ai_query',
    'batch_processing': 'ai_query',
    'real_time_analysis': 'analysis'
  };

  return featureMap[featureId] ?? 'ai_query';
}

export default router;