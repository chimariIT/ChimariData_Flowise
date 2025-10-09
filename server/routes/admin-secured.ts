// server/routes/admin-secured.ts

import express from 'express';
import type { Request, Response } from 'express';
import { ensureAuthenticated } from './auth';
import { adminRateLimit } from '../middleware/security-headers';
import { 
  requireAdmin, 
  requirePermission, 
  requireSuperAdmin, 
  getUserPermissions,
  requireOwnership 
} from '../middleware/rbac';
import { storage } from '../services/storage';

const router = express.Router();

// Apply middleware to all admin routes
router.use(adminRateLimit);
router.use(ensureAuthenticated);

/**
 * Get current user's permissions (publicly accessible to authenticated users)
 */
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const permissions = await getUserPermissions(userId);
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user permissions'
    });
  }
});

/**
 * Admin Dashboard - Get system overview
 */
router.get('/dashboard', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get basic system stats
    const stats = {
      totalUsers: await storage.getUserCount(),
      totalProjects: await storage.getProjectCount(),
      activeAgents: 3, // Placeholder
      systemStatus: 'healthy'
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get dashboard data'
    });
  }
});

/**
 * User Management - List all users
 */
router.get('/users', requirePermission('users', 'read'), async (req: Request, res: Response) => {
  try {
    const users = await storage.getAllUsers();
    
    // Remove sensitive information
    const sanitizedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      role: (user as any).role || 'user',
      createdAt: user.createdAt,
      isActive: true // Placeholder
    }));

    res.json({
      success: true,
      data: sanitizedUsers
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get users'
    });
  }
});

/**
 * User Management - Update user role
 */
router.put('/users/:userId/role', requirePermission('users', 'update'), async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['user', 'admin', 'super_admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role'
      });
    }

    // Update user role in database
    await storage.updateUserRole(userId, role);

    res.json({
      success: true,
      message: 'User role updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user role'
    });
  }
});

/**
 * Project Management - List all projects (admin view)
 */
router.get('/projects', requirePermission('projects', 'manage'), async (req: Request, res: Response) => {
  try {
    const projects = await storage.getAllProjects();
    
    res.json({
      success: true,
      data: projects
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get projects'
    });
  }
});

/**
 * Agent Management - Get agent status (read access)
 */
router.get('/agents/status', requirePermission('agents', 'read'), async (req: Request, res: Response) => {
  try {
    const agentStatus = {
      projectManager: { status: 'active', lastActivity: new Date() },
      technicalAI: { status: 'active', lastActivity: new Date() },
      business: { status: 'active', lastActivity: new Date() }
    };

    res.json({
      success: true,
      data: agentStatus
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get agent status'
    });
  }
});

/**
 * Agent Management - Configure agents (manage access)
 */
router.post('/agents/configure', requirePermission('agents', 'manage'), async (req: Request, res: Response) => {
  try {
    const { agentType, config } = req.body;

    // Validate agent type
    if (!['project_manager', 'technical_ai', 'business'].includes(agentType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid agent type'
      });
    }

    // Store agent configuration
    // This would integrate with your agent configuration system
    
    res.json({
      success: true,
      message: 'Agent configuration updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to configure agent'
    });
  }
});

/**
 * Billing Management - View billing overview
 */
router.get('/billing/overview', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const billingOverview = {
      totalRevenue: 0, // Placeholder
      activeSubscriptions: 0, // Placeholder
      trialUsers: 0, // Placeholder
      churnRate: 0 // Placeholder
    };

    res.json({
      success: true,
      data: billingOverview
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get billing overview'
    });
  }
});

/**
 * Subscription Management - Manage user subscriptions
 */
router.put('/subscriptions/:subscriptionId', requirePermission('subscriptions', 'manage'), async (req: Request, res: Response) => {
  try {
    const { subscriptionId } = req.params;
    const { status, tier } = req.body;

    // Update subscription
    // This would integrate with your billing service
    
    res.json({
      success: true,
      message: 'Subscription updated successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update subscription'
    });
  }
});

/**
 * System Management - Get system health (super admin only)
 */
router.get('/system/health', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const systemHealth = {
      database: 'healthy',
      redis: 'healthy',
      agents: 'healthy',
      websockets: 'healthy',
      uptime: process.uptime()
    };

    res.json({
      success: true,
      data: systemHealth
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get system health'
    });
  }
});

/**
 * Analytics - Get system analytics
 */
router.get('/analytics', requirePermission('analytics', 'read'), async (req: Request, res: Response) => {
  try {
    const analytics = {
      userGrowth: [], // Placeholder
      projectsCreated: [], // Placeholder
      agentInteractions: [], // Placeholder
      revenueMetrics: [] // Placeholder
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analytics'
    });
  }
});

export default router;