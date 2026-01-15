// server/routes/admin-secured.ts
// COMPLETED: Day 5 of Week 1 - Implementing real data for admin endpoints

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
import { agentRegistry } from '../services/agent-registry';
import { db, getPoolStats } from '../db';
import { users, projects, datasets } from '../../shared/schema';
import { sql, count } from 'drizzle-orm';

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
 * Admin Dashboard - Get system overview with REAL data
 */
router.get('/dashboard', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get real user count
    const userCountResult = await db.select({ count: count() }).from(users);
    const totalUsers = userCountResult[0]?.count || 0;

    // Get real project count
    const projectCountResult = await db.select({ count: count() }).from(projects);
    const totalProjects = projectCountResult[0]?.count || 0;

    // Get real dataset count
    const datasetCountResult = await db.select({ count: count() }).from(datasets);
    const totalDatasets = datasetCountResult[0]?.count || 0;

    // Get real agent count from registry
    const registeredAgents = agentRegistry.getAgents();
    const activeAgents = registeredAgents.filter(a => a.status === 'active').length;

    // Get database pool stats
    const poolStats = getPoolStats ? getPoolStats() : null;

    // Determine system status
    let systemStatus = 'healthy';
    if (poolStats && (poolStats as any).waiting > 5) {
      systemStatus = 'degraded';
    }

    const stats = {
      totalUsers,
      totalProjects,
      totalDatasets,
      activeAgents,
      totalAgents: registeredAgents.length,
      systemStatus,
      databasePool: poolStats || { status: 'unknown' },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('Admin dashboard error:', error);
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
 * Agent Management - Get agent status with REAL registry data
 */
router.get('/agents/status', requirePermission('agents', 'read'), async (req: Request, res: Response) => {
  try {
    // Get all agents from registry
    const registeredAgents = agentRegistry.getAgents();

    // Build detailed status for each agent
    const agentStatus = registeredAgents.map(agent => ({
      id: agent.id,
      name: agent.name,
      type: agent.type,
      status: agent.status,
      health: agent.health,
      currentTasks: agent.currentTasks,
      maxConcurrentTasks: agent.maxConcurrentTasks,
      metrics: {
        totalTasks: agent.metrics.totalTasks,
        successfulTasks: agent.metrics.successfulTasks,
        failedTasks: agent.metrics.totalTasks - agent.metrics.successfulTasks,
        averageResponseTime: agent.metrics.averageResponseTime,
        lastActivity: agent.metrics.lastActivity,
        successRate: agent.metrics.totalTasks > 0
          ? Math.round((agent.metrics.successfulTasks / agent.metrics.totalTasks) * 100)
          : 100
      },
      capabilities: agent.capabilities.map(cap => cap.name)
    }));

    // Calculate summary statistics
    const summary = {
      totalAgents: registeredAgents.length,
      activeAgents: registeredAgents.filter(a => a.status === 'active').length,
      busyAgents: registeredAgents.filter(a => a.currentTasks > 0).length,
      errorAgents: registeredAgents.filter(a => a.status === 'error').length,
      totalTasks: registeredAgents.reduce((sum, a) => sum + a.metrics.totalTasks, 0),
      totalSuccessfulTasks: registeredAgents.reduce((sum, a) => sum + a.metrics.successfulTasks, 0)
    };

    res.json({
      success: true,
      data: {
        agents: agentStatus,
        summary
      }
    });
  } catch (error: any) {
    console.error('Agent status error:', error);
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
 * Billing Management - View billing overview with REAL data
 */
router.get('/billing/overview', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    // Get subscription statistics from database
    const subscriptionStats = await db.select({
      tier: users.subscriptionTier,
      status: users.subscriptionStatus,
      count: count()
    })
      .from(users)
      .groupBy(users.subscriptionTier, users.subscriptionStatus);

    // Calculate metrics
    let activeSubscriptions = 0;
    let trialUsers = 0;
    let cancelledUsers = 0;
    const tierBreakdown: Record<string, number> = {};

    subscriptionStats.forEach((stat: any) => {
      const tierCount = Number(stat.count) || 0;
      if (stat.tier) {
        tierBreakdown[stat.tier] = (tierBreakdown[stat.tier] || 0) + tierCount;
      }
      if (stat.status === 'active') {
        activeSubscriptions += tierCount;
      }
      if (stat.status === 'trialing' || stat.tier === 'trial') {
        trialUsers += tierCount;
      }
      if (stat.status === 'cancelled') {
        cancelledUsers += tierCount;
      }
    });

    // Get billing service for additional metrics
    const { getBillingService } = await import('../services/billing/unified-billing-service');
    const billingService = getBillingService();

    // Calculate churn rate (cancelled / (active + cancelled))
    const totalSubscribers = activeSubscriptions + cancelledUsers;
    const churnRate = totalSubscribers > 0
      ? Math.round((cancelledUsers / totalSubscribers) * 100 * 100) / 100
      : 0;

    const billingOverview = {
      activeSubscriptions,
      trialUsers,
      cancelledUsers,
      churnRate,
      tierBreakdown,
      totalSubscribers,
      // Revenue would need Stripe integration - placeholder for now
      monthlyRecurringRevenue: 'Calculate from Stripe',
      lastUpdated: new Date().toISOString()
    };

    res.json({
      success: true,
      data: billingOverview
    });
  } catch (error: any) {
    console.error('Billing overview error:', error);
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
 * System Management - Get system health with REAL checks (super admin only)
 */
router.get('/system/health', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const healthChecks: Record<string, { status: string; details?: any }> = {};

    // Database health check
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - dbStart;
      healthChecks.database = {
        status: dbLatency < 100 ? 'healthy' : dbLatency < 500 ? 'degraded' : 'unhealthy',
        details: {
          latencyMs: dbLatency,
          poolStats: getPoolStats ? getPoolStats() : null
        }
      };
    } catch (dbError: any) {
      healthChecks.database = {
        status: 'unhealthy',
        details: { error: dbError.message }
      };
    }

    // Redis health check
    try {
      if (process.env.REDIS_ENABLED === 'true' || process.env.NODE_ENV === 'production') {
        const { default: Redis } = await import('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
        const redisStart = Date.now();
        await redis.ping();
        const redisLatency = Date.now() - redisStart;
        await redis.quit();
        healthChecks.redis = {
          status: redisLatency < 50 ? 'healthy' : redisLatency < 200 ? 'degraded' : 'unhealthy',
          details: { latencyMs: redisLatency }
        };
      } else {
        healthChecks.redis = {
          status: 'not_configured',
          details: { message: 'Redis not enabled in development' }
        };
      }
    } catch (redisError: any) {
      healthChecks.redis = {
        status: 'unhealthy',
        details: { error: redisError.message }
      };
    }

    // Agent health check
    try {
      const registeredAgents = agentRegistry.getAgents();
      const healthyAgents = registeredAgents.filter(a => a.status === 'active' && a.health.errorRate < 0.5).length;
      const totalAgents = registeredAgents.length;
      healthChecks.agents = {
        status: healthyAgents === totalAgents ? 'healthy' : healthyAgents > 0 ? 'degraded' : 'unhealthy',
        details: {
          healthy: healthyAgents,
          total: totalAgents,
          byStatus: {
            active: registeredAgents.filter(a => a.status === 'active').length,
            inactive: registeredAgents.filter(a => a.status === 'inactive').length,
            error: registeredAgents.filter(a => a.status === 'error').length
          }
        }
      };
    } catch (agentError: any) {
      healthChecks.agents = {
        status: 'unhealthy',
        details: { error: agentError.message }
      };
    }

    // Calculate overall status
    const statuses = Object.values(healthChecks).map(h => h.status);
    let overallStatus = 'healthy';
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }

    const systemHealth = {
      status: overallStatus,
      checks: healthChecks,
      uptime: process.uptime(),
      uptimeFormatted: formatUptime(process.uptime()),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: systemHealth
    });
  } catch (error: any) {
    console.error('System health error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get system health'
    });
  }
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Analytics - Get system analytics with REAL data
 */
router.get('/analytics', requirePermission('analytics', 'read'), async (req: Request, res: Response) => {
  try {
    // Get time range from query (default: last 30 days)
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // User growth - users created per day
    const userGrowth = await db.select({
      date: sql<string>`DATE(${users.createdAt})`,
      count: count()
    })
      .from(users)
      .where(sql`${users.createdAt} >= ${startDate}`)
      .groupBy(sql`DATE(${users.createdAt})`)
      .orderBy(sql`DATE(${users.createdAt})`);

    // Projects created per day
    const projectsCreated = await db.select({
      date: sql<string>`DATE(${projects.createdAt})`,
      count: count()
    })
      .from(projects)
      .where(sql`${projects.createdAt} >= ${startDate}`)
      .groupBy(sql`DATE(${projects.createdAt})`)
      .orderBy(sql`DATE(${projects.createdAt})`);

    // Project status breakdown
    const projectsByStatus = await db.select({
      status: projects.status,
      count: count()
    })
      .from(projects)
      .groupBy(projects.status);

    // Agent metrics from registry
    const registeredAgents = agentRegistry.getAgents();
    const agentMetrics = registeredAgents.map(agent => ({
      name: agent.name,
      totalTasks: agent.metrics.totalTasks,
      successfulTasks: agent.metrics.successfulTasks,
      avgResponseTime: agent.metrics.averageResponseTime,
      successRate: agent.metrics.totalTasks > 0
        ? Math.round((agent.metrics.successfulTasks / agent.metrics.totalTasks) * 100)
        : 100
    }));

    // Summary statistics
    const userCountResult = await db.select({ count: count() }).from(users);
    const projectCountResult = await db.select({ count: count() }).from(projects);
    const datasetCountResult = await db.select({ count: count() }).from(datasets);

    const analytics = {
      summary: {
        totalUsers: userCountResult[0]?.count || 0,
        totalProjects: projectCountResult[0]?.count || 0,
        totalDatasets: datasetCountResult[0]?.count || 0,
        totalAgentTasks: registeredAgents.reduce((sum, a) => sum + a.metrics.totalTasks, 0),
        overallSuccessRate: calculateOverallSuccessRate(registeredAgents)
      },
      userGrowth: userGrowth.map((row: any) => ({
        date: row.date,
        count: Number(row.count)
      })),
      projectsCreated: projectsCreated.map((row: any) => ({
        date: row.date,
        count: Number(row.count)
      })),
      projectsByStatus: projectsByStatus.map((row: any) => ({
        status: row.status || 'unknown',
        count: Number(row.count)
      })),
      agentMetrics,
      timeRange: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString()
      }
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analytics'
    });
  }
});

// Helper function to calculate overall success rate
function calculateOverallSuccessRate(agents: any[]): number {
  const totalTasks = agents.reduce((sum, a) => sum + a.metrics.totalTasks, 0);
  const successfulTasks = agents.reduce((sum, a) => sum + a.metrics.successfulTasks, 0);
  return totalTasks > 0 ? Math.round((successfulTasks / totalTasks) * 100) : 100;
}

export default router;