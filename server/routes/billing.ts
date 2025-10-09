import { Router, Request, Response, NextFunction } from 'express';
import { enhancedBillingService } from '../enhanced-billing-service';
import { storage } from '../storage';
import { z } from 'zod';
import { tokenStorage } from '../token-storage';

const router = Router();

// Import the standardized auth middleware
import { ensureAuthenticated } from './auth';

// Custom authentication middleware for billing routes that optionally allows unauthenticated access
const billingAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For billing routes that don't require auth (like capacity summary without user), continue
      return next();
    }

    const token = authHeader.substring(7);
    const tokenData = tokenStorage.validateToken(token);
    
    if (!tokenData) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const user = await storage.getUser(tokenData.userId);
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = user;
    req.userId = user.id;
    return next();
  } catch (error: any) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: "Authentication required" });
  }
};

// Routes use individual authentication as needed

// Request validation schemas
const billingCalculationSchema = z.object({
  journeyType: z.enum(['non-tech', 'business', 'technical']),
  datasetSizeMB: z.number().min(0),
  additionalFeatures: z.array(z.string()).optional(),
});

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

    const result = await enhancedBillingService.calculateBillingWithCapacity(
      userId,
      journeyType,
      datasetSizeMB,
      additionalFeatures
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

    const result = await enhancedBillingService.getUserCapacitySummary(userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      summary: result.summary,
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
    const requirements = enhancedBillingService['calculateJourneyRequirements'](
      journeyType,
      datasetSizeMB,
      additionalFeatures
    );

    const result = await enhancedBillingService.updateUserUsage(userId, requirements);

    if (!result.success) {
      return res.status(400).json(result);
    }

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

    const { journeyType, datasetSizeMB, additionalFeatures } = validation.data;

    const result = await enhancedBillingService.calculateBillingWithCapacity(
      userId,
      journeyType,
      datasetSizeMB,
      additionalFeatures
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Format response for UI display
    const formattedBreakdown = {
      journeyType,
      datasetSizeMB,
      totalCost: result.billing!.finalCost,
      baseCost: result.billing!.baseCost,
      subscriptionCredits: result.billing!.subscriptionCredits,
      capacityUsed: result.billing!.capacityUsed,
      capacityRemaining: result.billing!.capacityRemaining,
      utilizationPercentage: result.billing!.utilizationPercentage,
      breakdown: result.billing!.breakdown.map(item => ({
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

    const result = await enhancedBillingService.getUserCapacitySummary(userId);

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

export default router;
