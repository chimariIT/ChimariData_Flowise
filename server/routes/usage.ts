import { Router } from "express";
import { UsageTrackingService } from "../services/usage-tracking.js";
import { validateSubscriptionLimits, trackAiUsage, requireFeatureAccess } from "../middleware/subscription-validation.js";
import { tokenStorage } from "../token-storage.js";
import { storage } from "../services/storage.js";
import { getAuthHeader } from "../utils/auth-headers";

const router = Router();

// Helper function to extract user from token
async function getUserFromRequest(req: any): Promise<any> {
  const authHeader = getAuthHeader(req);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenData = tokenStorage.validateToken(token);
    if (tokenData) {
      const user = await storage.getUser(tokenData.userId);
      return user;
    }
  }
  return null;
}

// Get current usage and limits
router.get("/current", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const [usage, limits] = await Promise.all([
      UsageTrackingService.getCurrentUsage(userId),
      UsageTrackingService.getUserLimits(userId)
    ]);

    res.json({
      usage,
      limits
    });
  } catch (error) {
    console.error("Error fetching current usage:", error);
    res.status(500).json({ error: "Failed to fetch usage data" });
  }
});

// Check if user can perform a specific action
router.post("/check", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { action, amount = 1 } = req.body;

    let usageResult;

    switch (action) {
      case 'ai_query':
        usageResult = await UsageTrackingService.checkUsageLimit(userId, 'aiQueries', amount);
        break;
      case 'data_upload':
        usageResult = await UsageTrackingService.checkUsageLimit(userId, 'dataUploads', amount);
        break;
      case 'data_volume':
        const fileSizeMB = req.body.metadata?.sizeMB || amount;
        usageResult = await UsageTrackingService.checkUsageLimit(userId, 'dataVolume', fileSizeMB);
        break;
      case 'project_creation':
        usageResult = await UsageTrackingService.checkUsageLimit(userId, 'projects', amount);
        break;
      default:
        return res.status(400).json({ error: "Unknown action type" });
    }

    res.json(usageResult);
  } catch (error) {
    console.error("Error checking usage:", error);
    res.status(500).json({ error: "Failed to check usage" });
  }
});

// Track usage for a specific action
router.post("/track", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { action, metadata = {} } = req.body;
    let usageResult;

    switch (action) {
      case 'ai_query':
        const queryType = metadata.type || 'simple';
        usageResult = await UsageTrackingService.trackAiQuery(userId, queryType);
        break;

      case 'data_upload':
        const fileSizeMB = metadata.sizeMB || 1;
        usageResult = await UsageTrackingService.trackDataUpload(userId, fileSizeMB);
        break;

      case 'project_creation':
        usageResult = await UsageTrackingService.trackProjectCreation(userId);
        break;

      case 'visualization_generation':
        usageResult = await UsageTrackingService.trackVisualizationGeneration(userId, metadata.projectId);
        break;

      case 'code_generation':
        usageResult = await UsageTrackingService.trackCodeGeneration(userId);
        break;

      case 'consultation':
        const minutes = metadata.minutes || 0;
        usageResult = await UsageTrackingService.trackConsultationUsage(userId, minutes);
        break;

      default:
        return res.status(400).json({ error: "Unknown action type" });
    }

    if (!usageResult.allowed) {
      return res.status(429).json({
        error: "Usage limit exceeded",
        usageResult
      });
    }

    res.json({
      success: true,
      usageResult
    });
  } catch (error) {
    console.error("Error tracking usage:", error);
    res.status(500).json({ error: "Failed to track usage" });
  }
});

// Get usage history (last 30 days)
router.get("/history", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // P0-5 FIX: Return empty history instead of random mock data
    // TODO: Implement detailed usage history tracking from database
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // In production, return empty history until real tracking is implemented
      console.warn('[Usage History] Detailed history tracking not yet implemented');
      res.json({
        history: [],
        message: 'Detailed usage history is not yet available. Check your billing dashboard for current usage.'
      });
      return;
    }

    // In development only, return sample data with zeros
    const history = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      history.push({
        date: date.toISOString().split('T')[0],
        aiQueries: 0,
        dataUploads: 0,
        dataVolumeMB: 0
      });
    }

    res.json({ history, devMode: true });
  } catch (error) {
    console.error("Error fetching usage history:", error);
    res.status(500).json({ error: "Failed to fetch usage history" });
  }
});

// Reset usage (admin only or for testing)
router.post("/reset", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // In production, this should be admin-only or disabled
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: "Usage reset not allowed in production" });
    }

    await UsageTrackingService.resetMonthlyUsage(userId);

    res.json({
      success: true,
      message: "Usage counters reset successfully"
    });
  } catch (error) {
    console.error("Error resetting usage:", error);
    res.status(500).json({ error: "Failed to reset usage" });
  }
});

// Get upgrade recommendations
router.get("/upgrade-recommendations", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const upgradeRecommendation = await UsageTrackingService.shouldPromptUpgrade(userId);

    res.json(upgradeRecommendation);
  } catch (error) {
    console.error("Error getting upgrade recommendations:", error);
    res.status(500).json({ error: "Failed to get upgrade recommendations" });
  }
});

// Middleware-protected routes for specific actions

// AI query endpoint with automatic tracking
router.post("/ai-query",
  validateSubscriptionLimits({ usageType: 'aiQueries' }),
  trackAiUsage('simple'),
  async (req, res) => {
    try {
      // AI query logic would go here
      // The middleware already tracked the usage

      res.json({
        success: true,
        message: "AI query processed successfully",
        usageInfo: req.usageCheck
      });
    } catch (error) {
      console.error("Error processing AI query:", error);
      res.status(500).json({ error: "Failed to process AI query" });
    }
  }
);

// Advanced AI query endpoint
router.post("/ai-query/advanced",
  requireFeatureAccess('advancedAnalytics'),
  validateSubscriptionLimits({ usageType: 'aiQueries' }),
  trackAiUsage('advanced'),
  async (req, res) => {
    try {
      // Advanced AI query logic would go here

      res.json({
        success: true,
        message: "Advanced AI query processed successfully",
        usageInfo: req.usageCheck
      });
    } catch (error) {
      console.error("Error processing advanced AI query:", error);
      res.status(500).json({ error: "Failed to process advanced AI query" });
    }
  }
);

// Code generation endpoint
router.post("/code-generation",
  requireFeatureAccess('codeGeneration'),
  validateSubscriptionLimits({ usageType: 'aiQueries' }),
  trackAiUsage('code_generation'),
  async (req, res) => {
    try {
      // Code generation logic would go here

      res.json({
        success: true,
        message: "Code generated successfully",
        usageInfo: req.usageCheck
      });
    } catch (error) {
      console.error("Error generating code:", error);
      res.status(500).json({ error: "Failed to generate code" });
    }
  }
);

// ==========================================
// USAGE ALERTS ENDPOINTS (Sprint 3)
// ==========================================

/**
 * GET /api/usage/alerts/status
 * Get current usage status with alert levels for all metrics
 */
router.get("/alerts/status", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { usageAlertsService } = await import('../services/usage-alerts-service');
    const status = await usageAlertsService.getUserUsageStatus(userId);

    res.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error fetching usage status:", error);
    res.status(500).json({ error: "Failed to fetch usage status" });
  }
});

/**
 * GET /api/usage/alerts/check
 * Check all usage metrics and trigger alerts if thresholds exceeded
 */
router.get("/alerts/check", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { usageAlertsService } = await import('../services/usage-alerts-service');
    const alerts = await usageAlertsService.checkUserUsage(userId);

    res.json({
      success: true,
      alertsTriggered: alerts.length,
      alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error checking usage alerts:", error);
    res.status(500).json({ error: "Failed to check usage alerts" });
  }
});

/**
 * GET /api/usage/alerts/history
 * Get alert history for the current user
 */
router.get("/alerts/history", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const { usageAlertsService } = await import('../services/usage-alerts-service');
    const history = usageAlertsService.getAlertHistory(userId, limit);

    res.json({
      success: true,
      alerts: history,
      total: history.length
    });
  } catch (error) {
    console.error("Error fetching alert history:", error);
    res.status(500).json({ error: "Failed to fetch alert history" });
  }
});

/**
 * POST /api/usage/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post("/alerts/:alertId/acknowledge", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { alertId } = req.params;

    const { usageAlertsService } = await import('../services/usage-alerts-service');
    const acknowledged = usageAlertsService.acknowledgeAlert(userId, alertId);

    if (acknowledged) {
      res.json({
        success: true,
        message: "Alert acknowledged"
      });
    } else {
      res.status(404).json({
        success: false,
        error: "Alert not found"
      });
    }
  } catch (error) {
    console.error("Error acknowledging alert:", error);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// Get usage history for the current user
router.get("/history", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const days = Math.min(parseInt(req.query.days as string) || 30, 90);
    const history = await UsageTrackingService.getUsageHistory(userId, days);

    res.json({
      success: true,
      history
    });
  } catch (error) {
    console.error("Error fetching usage history:", error);
    res.status(500).json({ error: "Failed to fetch usage history" });
  }
});

export default router;