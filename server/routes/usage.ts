import { Router } from "express";
import { UsageTrackingService } from "../services/usage-tracking.js";
import { validateSubscriptionLimits, trackAiUsage, requireFeatureAccess } from "../middleware/subscription-validation.js";

const router = Router();

// Get current usage and limits
router.get("/current", async (req, res) => {
  try {
    const userId = req.user?.id;
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
    const userId = req.user?.id;
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
    const userId = req.user?.id;
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
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // TODO: Implement detailed usage history tracking
    // For now, return mock data
    const history = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      history.push({
        date: date.toISOString().split('T')[0],
        aiQueries: Math.floor(Math.random() * 5),
        dataUploads: Math.floor(Math.random() * 3),
        dataVolumeMB: Math.floor(Math.random() * 10)
      });
    }

    res.json({ history });
  } catch (error) {
    console.error("Error fetching usage history:", error);
    res.status(500).json({ error: "Failed to fetch usage history" });
  }
});

// Reset usage (admin only or for testing)
router.post("/reset", async (req, res) => {
  try {
    const userId = req.user?.id;
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
    const userId = req.user?.id;
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

export default router;