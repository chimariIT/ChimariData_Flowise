import { Router, Request, Response } from 'express';
import { SUBSCRIPTION_TIERS } from '@shared/subscription-tiers';

const router = Router();

/**
 * Get available subscription tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    const tiers = Object.values(SUBSCRIPTION_TIERS).map(tier => ({
      id: tier.id,
      name: tier.name,
      price: tier.price,
      description: tier.description,
      features: [
        `${tier.features.maxFiles} file${tier.features.maxFiles > 1 ? 's' : ''} per month`,
        `${tier.features.maxFileSizeMB}MB max file size`,
        `${tier.features.totalDataVolumeMB}MB total data volume`,
        `${tier.features.aiInsights === -1 ? 'Unlimited' : tier.features.aiInsights} AI insights`,
        `${tier.features.maxAnalysisComponents === -1 ? 'Unlimited' : tier.features.maxAnalysisComponents} analysis components`,
        `${tier.features.maxVisualizations === -1 ? 'Unlimited' : tier.features.maxVisualizations} visualizations`,
        tier.features.dataTransformation ? 'Data transformation' : null,
        tier.features.statisticalAnalysis ? 'Statistical analysis' : null,
        tier.features.advancedInsights ? 'Advanced insights' : null,
        tier.features.piiDetection ? 'PII detection' : null,
        `${tier.features.exportOptions.join(', ')} export`,
        `${tier.features.support} support`
      ].filter(Boolean),
      limits: {
        analysesPerMonth: tier.features.maxAnalysisComponents,
        maxDataSizeMB: tier.features.maxFileSizeMB,
        maxRecords: tier.features.totalDataVolumeMB * 1000, // Rough estimate
        aiQueries: tier.features.aiInsights,
        supportLevel: tier.features.support,
        customModels: tier.features.advancedInsights,
        apiAccess: tier.id === 'enterprise',
        teamCollaboration: tier.id !== 'trial'
      },
      recommended: tier.id === 'professional',
      stripeProductId: tier.stripeProductId,
      stripePriceId: tier.stripePriceId
    }));

    res.json({
      success: true,
      tiers
    });
  } catch (error: any) {
    console.error('Error getting pricing tiers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get pricing tiers'
    });
  }
});

export default router;







