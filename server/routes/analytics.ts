// server/routes/analytics.ts
import express from 'express';
import { toolAnalyticsService } from '../services/tool-analytics';

const router = express.Router();

/**
 * Analytics and Monitoring API Routes
 *
 * Provides endpoints for:
 * - Tool usage analytics
 * - System performance metrics
 * - Cost tracking
 * - Performance alerts
 */

// Middleware to check authentication
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

// Middleware to check admin access
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check if user is admin (email-based check - should be replaced with role-based)
  const userEmail = (req.user as any).email || '';
  if (!userEmail.includes('@admin.com') && (req.user as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * GET /api/analytics/tools/:toolId
 * Get analytics for a specific tool
 */
router.get('/tools/:toolId', requireAuth, async (req, res) => {
  try {
    const { toolId } = req.params;
    const { start, end } = req.query;

    const timeRange = start && end ? {
      start: new Date(start as string),
      end: new Date(end as string)
    } : undefined;

    const analytics = await toolAnalyticsService.getToolAnalytics(toolId, timeRange);

    res.json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting tool analytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve tool analytics'
    });
  }
});

/**
 * GET /api/analytics/system
 * Get system-wide metrics
 */
router.get('/system', requireAdmin, async (req, res) => {
  try {
    const metrics = await toolAnalyticsService.getSystemMetrics();

    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting system metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve system metrics'
    });
  }
});

/**
 * GET /api/analytics/agents/:agentId
 * Get usage breakdown by agent
 */
router.get('/agents/:agentId', requireAdmin, async (req, res) => {
  try {
    const { agentId } = req.params;

    const breakdown = await toolAnalyticsService.getAgentUsageBreakdown(agentId);

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting agent breakdown:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve agent breakdown'
    });
  }
});

/**
 * GET /api/analytics/users/:userId/costs
 * Get cost breakdown for a user
 */
router.get('/users/:userId/costs', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { start, end } = req.query;

    // Check if user is requesting their own data or is admin
    const requestingUser = req.user as any;
  if (requestingUser.id !== userId && !requestingUser.email?.includes('@admin.com')) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized: You can only view your own cost data'
      });
    }

    const startDate = start ? new Date(start as string) : undefined;
    const endDate = end ? new Date(end as string) : undefined;

    const breakdown = await toolAnalyticsService.getUserCostBreakdown(userId, startDate, endDate);

    res.json({
      success: true,
      data: breakdown
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting user costs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve cost breakdown'
    });
  }
});

/**
 * GET /api/analytics/alerts
 * Get performance alerts
 */
router.get('/alerts', requireAdmin, async (req, res) => {
  try {
    const alerts = await toolAnalyticsService.getPerformanceAlerts();

    res.json({
      success: true,
      data: alerts,
      count: alerts.length
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve performance alerts'
    });
  }
});

/**
 * GET /api/analytics/export
 * Export metrics to external monitoring system
 */
router.get('/export', requireAdmin, async (req, res) => {
  try {
    const { format = 'prometheus' } = req.query;

    if (!['prometheus', 'datadog', 'cloudwatch'].includes(format as string)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Supported formats: prometheus, datadog, cloudwatch'
      });
    }

    const metrics = await toolAnalyticsService.exportMetrics(format as 'prometheus' | 'datadog' | 'cloudwatch');

    // Set appropriate content type
    const contentType = format === 'prometheus' ? 'text/plain' : 'application/json';
    res.setHeader('Content-Type', contentType);

    res.send(metrics);
  } catch (error: any) {
    console.error('[Analytics API] Error exporting metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export metrics'
    });
  }
});

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard data
 */
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [systemMetrics, alerts] = await Promise.all([
      toolAnalyticsService.getSystemMetrics(),
      toolAnalyticsService.getPerformanceAlerts()
    ]);

    // Get top tools by usage
    const topTools = await Promise.all([
      toolAnalyticsService.getToolAnalytics('statistical_analyzer'),
      toolAnalyticsService.getToolAnalytics('ml_pipeline'),
      toolAnalyticsService.getToolAnalytics('visualization_engine')
    ]);

    res.json({
      success: true,
      data: {
        system: systemMetrics,
        alerts,
        topTools: topTools.map(t => ({
          toolId: t.toolId,
          executions: t.totalExecutions,
          successRate: t.totalExecutions > 0
            ? (t.successfulExecutions / t.totalExecutions) * 100
            : 0,
          avgDuration: t.averageDuration,
          totalCost: t.totalCost,
          trend: t.performanceTrend
        }))
      }
    });
  } catch (error: any) {
    console.error('[Analytics API] Error getting dashboard data:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve dashboard data'
    });
  }
});

/**
 * POST /api/analytics/record
 * Record a tool execution metric (internal use)
 */
router.post('/record', async (req, res) => {
  try {
    const metrics = req.body;

    // Validate required fields
    if (!metrics.toolId || !metrics.executionId || !metrics.agentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: toolId, executionId, agentId'
      });
    }

    await toolAnalyticsService.recordExecution(metrics);

    res.json({
      success: true,
      message: 'Metrics recorded successfully'
    });
  } catch (error: any) {
    console.error('[Analytics API] Error recording metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to record metrics'
    });
  }
});

export default router;
