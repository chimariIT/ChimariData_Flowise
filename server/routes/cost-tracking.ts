import { Router } from 'express';
import { costTrackingService } from '../services/cost-tracking';
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';

const router = Router();

/**
 * Cost Tracking API Endpoints
 *
 * Provides access to the 3-table cost tracking architecture
 */

/**
 * GET /api/costs/projects/:projectId/summary
 * Get cost summary for a project
 */
router.get('/projects/:projectId/summary', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Check project access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason || 'Access denied'
      });
    }

    const summary = await costTrackingService.getCostSummary(projectId);

    return res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('Error fetching cost summary:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cost summary'
    });
  }
});

/**
 * GET /api/costs/projects/:projectId/line-items
 * Get detailed cost line items for a project
 *
 * Query params:
 * - category: Filter by category (optional)
 * - startDate: Filter by start date (optional)
 * - endDate: Filter by end date (optional)
 * - limit: Limit results (optional, default 100)
 */
router.get('/projects/:projectId/line-items', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Check project access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason || 'Access denied'
      });
    }

    // Parse query params
    const { category, startDate, endDate, limit } = req.query;

    const options: any = {};
    if (category) options.category = category as string;
    if (startDate) options.startDate = new Date(startDate as string);
    if (endDate) options.endDate = new Date(endDate as string);
    if (limit) options.limit = parseInt(limit as string, 10);
    else options.limit = 100; // Default limit

    const lineItems = await costTrackingService.getProjectLineItems(projectId, options);

    // Convert cents to dollars for client
    const formattedItems = lineItems.map(item => ({
      ...item,
      unitCost: item.unitCost / 100,
      totalCost: item.totalCost / 100
    }));

    return res.json({
      success: true,
      data: {
        items: formattedItems,
        count: formattedItems.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching line items:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch line items'
    });
  }
});

/**
 * GET /api/costs/users/:userId/monthly-billing/:billingMonth
 * Get monthly billing summary for a user
 *
 * billingMonth format: YYYY-MM (e.g., 2025-12)
 */
router.get('/users/:userId/monthly-billing/:billingMonth', ensureAuthenticated, async (req, res) => {
  try {
    const { userId: targetUserId, billingMonth } = req.params;
    const requestUserId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Only allow users to access their own billing or admins
    if (requestUserId !== targetUserId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Validate billingMonth format
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid billing month format. Use YYYY-MM'
      });
    }

    const monthlyBilling = await costTrackingService.getOrCreateMonthlyBilling(
      targetUserId,
      billingMonth
    );

    // Convert cents to dollars for client
    const formattedBilling = {
      ...monthlyBilling,
      subscriptionCost: monthlyBilling.subscriptionCost / 100,
      usageCost: monthlyBilling.usageCost / 100,
      overageCost: monthlyBilling.overageCost / 100,
      totalCost: monthlyBilling.totalCost / 100,
      categoryBreakdown: Object.entries(monthlyBilling.categoryBreakdown as Record<string, number>).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: value / 100
        }),
        {}
      )
    };

    return res.json({
      success: true,
      data: formattedBilling
    });
  } catch (error: any) {
    console.error('Error fetching monthly billing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch monthly billing'
    });
  }
});

/**
 * POST /api/costs/users/:userId/monthly-billing/:billingMonth/calculate
 * Calculate/update monthly billing summary for a user
 *
 * Admin only - aggregates all costs for the month
 */
router.post('/users/:userId/monthly-billing/:billingMonth/calculate', ensureAuthenticated, async (req, res) => {
  try {
    const { userId: targetUserId, billingMonth } = req.params;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Admin only
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    // Validate billingMonth format
    if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid billing month format. Use YYYY-MM'
      });
    }

    await costTrackingService.calculateMonthlyBilling(targetUserId, billingMonth);

    // Fetch updated billing
    const monthlyBilling = await costTrackingService.getOrCreateMonthlyBilling(
      targetUserId,
      billingMonth
    );

    // Convert cents to dollars for client
    const formattedBilling = {
      ...monthlyBilling,
      subscriptionCost: monthlyBilling.subscriptionCost / 100,
      usageCost: monthlyBilling.usageCost / 100,
      overageCost: monthlyBilling.overageCost / 100,
      totalCost: monthlyBilling.totalCost / 100,
      categoryBreakdown: Object.entries(monthlyBilling.categoryBreakdown as Record<string, number>).reduce(
        (acc, [key, value]) => ({
          ...acc,
          [key]: value / 100
        }),
        {}
      )
    };

    return res.json({
      success: true,
      data: formattedBilling,
      message: 'Monthly billing calculated successfully'
    });
  } catch (error: any) {
    console.error('Error calculating monthly billing:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate monthly billing'
    });
  }
});

/**
 * GET /api/costs/projects/:projectId/tracking
 * Get project cost tracking record (aggregated costs)
 */
router.get('/projects/:projectId/tracking', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Check project access
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: accessCheck.reason || 'Access denied'
      });
    }

    // Import here to avoid circular dependencies
    const { db } = await import('../db');
    const { projectCostTracking } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const [tracking] = await db
      .select()
      .from(projectCostTracking)
      .where(eq(projectCostTracking.projectId, projectId))
      .limit(1);

    if (!tracking) {
      return res.status(404).json({
        success: false,
        error: 'No cost tracking record found for this project'
      });
    }

    // Convert cents to dollars for client
    const formattedTracking = {
      ...tracking,
      dataProcessingCost: tracking.dataProcessingCost / 100,
      aiQueryCost: tracking.aiQueryCost / 100,
      analysisExecutionCost: tracking.analysisExecutionCost / 100,
      visualizationCost: tracking.visualizationCost / 100,
      exportCost: tracking.exportCost / 100,
      collaborationCost: tracking.collaborationCost / 100,
      totalCost: tracking.totalCost / 100
    };

    return res.json({
      success: true,
      data: formattedTracking
    });
  } catch (error: any) {
    console.error('Error fetching cost tracking:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch cost tracking'
    });
  }
});

export default router;
