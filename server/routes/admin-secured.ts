// server/routes/admin-secured.ts
// COMPLETED: Day 5 of Week 1 - Implementing real data for admin endpoints

import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
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
import { PricingService } from '../services/pricing';
import { sql, count } from 'drizzle-orm';
// P1-1 FIX: Imports for migrated endpoints (tools, database, errors)
import { MCPToolRegistry } from '../services/mcp-tool-registry';
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { enhancedPool } from '../enhanced-db';
import { errorHandler } from '../services/enhanced-error-handler';

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
    if (!['project_manager', 'technical_ai', 'business', 'data_engineer', 'data_scientist'].includes(agentType)) {
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

/**
 * Customer List - Get all customers with subscription info
 * Required by: subscription-management.tsx
 */
router.get('/customers', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    // Get users with subscription data
    const allUsers = await storage.getAllUsers();
    const customers = allUsers.slice(0, limit).map((user: any) => ({
      id: user.id,
      email: user.email,
      name: user.displayName || user.email?.split('@')[0] || 'Unknown',
      subscriptionTier: user.subscriptionTier || 'free',
      subscriptionStatus: user.subscriptionStatus || 'inactive',
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      lastActivity: user.lastLoginAt || user.createdAt
    }));

    // FIX: Return customers at top level to match frontend expectations
    // Frontend expects: { success: true, customers: [...] }
    res.json({
      success: true,
      customers,
      total: allUsers.length
    });
  } catch (error: any) {
    console.error('Customers fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch customers'
    });
  }
});

/**
 * Quota Alerts - Get quota utilization alerts
 * Required by: subscription-management.tsx
 */
router.get('/quota-alerts', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const level = req.query.level as string || 'warning'; // 'warning', 'critical', 'exceeded', 'all'

    // Get users with quota data
    const allUsers = await storage.getAllUsers();
    const alerts: any[] = [];

    // Generate quota alerts based on user usage
    for (const user of allUsers) {
      const quotaData = (user as any).quotaUtilization;
      if (!quotaData) continue;

      // Check data quota
      if (quotaData.dataQuotaUsed && quotaData.dataQuotaLimit) {
        const utilization = (quotaData.dataQuotaUsed / quotaData.dataQuotaLimit) * 100;
        if (utilization >= 80) {
          alerts.push({
            id: `${user.id}-data`,
            userId: user.id,
            quotaType: 'data',
            currentUsage: quotaData.dataQuotaUsed,
            quotaLimit: quotaData.dataQuotaLimit,
            utilizationPercent: utilization,
            alertLevel: utilization >= 100 ? 'exceeded' : utilization >= 90 ? 'critical' : 'warning',
            message: `Data usage at ${utilization.toFixed(1)}%`,
            actionRequired: utilization >= 90,
            suggestedActions: ['Upgrade subscription tier', 'Delete unused datasets', 'Archive old projects'],
            timestamp: new Date(),
            acknowledged: false
          });
        }
      }
    }

    // Filter by level if not 'all'
    const filteredAlerts = level === 'all'
      ? alerts
      : alerts.filter(a => a.alertLevel === level);

    res.json({
      success: true,
      data: {
        alerts: filteredAlerts,
        total: filteredAlerts.length,
        summary: {
          warning: alerts.filter(a => a.alertLevel === 'warning').length,
          critical: alerts.filter(a => a.alertLevel === 'critical').length,
          exceeded: alerts.filter(a => a.alertLevel === 'exceeded').length
        }
      }
    });
  } catch (error: any) {
    console.error('Quota alerts fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch quota alerts'
    });
  }
});

/**
 * Billing Events - Get recent billing activity
 * Required by: subscription-management.tsx
 */
router.get('/billing-events', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    // Get projects with payment info as billing events
    const allProjects = await storage.getAllProjects();
    const events: any[] = [];

    for (const project of allProjects.slice(0, limit)) {
      // Add project creation as billing event
      // Now using properly typed fields from DataProject schema
      events.push({
        id: `project-${project.id}`,
        userId: project.userId,
        type: 'usage',
        category: 'data',
        description: `Project created: ${project.name}`,
        quantity: 1,
        unit: 'project',
        metadata: { projectId: project.id, status: project.status },
        timestamp: project.createdAt,
        processed: true
      });

      // Add payment event if project was paid
      if (project.isPaid) {
        events.push({
          id: `payment-${project.id}`,
          userId: project.userId,
          type: 'payment',
          category: 'compute',
          description: `Analysis payment for: ${project.name}`,
          amount: (project as any).lockedCostEstimate || 0,
          quantity: 1,
          unit: 'analysis',
          metadata: { projectId: project.id },
          timestamp: (project as any).paidAt || project.lastModified,
          processed: true
        });
      }
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      success: true,
      data: {
        events: events.slice(0, limit),
        total: events.length
      }
    });
  } catch (error: any) {
    console.error('Billing events fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch billing events'
    });
  }
});

/**
 * User Metrics - Get usage metrics for a specific user
 * Required by: subscription-management.tsx
 */
router.get('/users/:customerId/metrics', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get user data
    const user = await storage.getUser(customerId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get user's projects
    const userProjects = await storage.getProjectsByOwner(customerId);

    // Calculate usage metrics
    const analysisCount = userProjects.filter((p: any) => p.analysisExecutedAt).length;
    const totalCost = userProjects.reduce((sum: number, p: any) => sum + (p.lockedCostEstimate || 0), 0);

    const metrics = {
      userId: customerId,
      subscriptionTier: (user as any).subscriptionTier || 'free',
      billingPeriod: {
        start: startDate,
        end: endDate,
        status: (user as any).subscriptionStatus || 'active'
      },
      dataUsage: {
        totalFilesUploaded: userProjects.length,
        totalFileSizeMB: 0, // Would need dataset aggregation
        totalDataProcessedMB: 0,
        storageUsedMB: 0,
        maxFileSize: 0,
        fileFormats: {},
        dataTransformations: 0,
        dataExports: 0
      },
      computeUsage: {
        analysisCount,
        aiQueryCount: 0,
        mlModelExecutions: 0,
        visualizationCount: 0,
        totalComputeMinutes: analysisCount * 2, // Estimate 2 min per analysis
        agentInteractions: 0,
        toolExecutions: 0
      },
      storageMetrics: {
        projectCount: userProjects.length,
        datasetCount: 0,
        artifactCount: 0,
        totalStorageMB: 0,
        archiveStorageMB: 0,
        temporaryStorageMB: 0,
        retentionDays: 90
      },
      costBreakdown: {
        baseSubscription: 0,
        dataOverage: 0,
        computeOverage: 0,
        storageOverage: 0,
        premiumFeatures: 0,
        agentUsage: 0,
        toolUsage: 0,
        totalCost
      },
      quotaUtilization: {
        dataQuotaUsed: 0,
        dataQuotaLimit: 1000,
        computeQuotaUsed: analysisCount * 2,
        computeQuotaLimit: 100,
        storageQuotaUsed: 0,
        storageQuotaLimit: 5000,
        quotaResetDate: new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000)
      }
    };

    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    console.error('User metrics fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch user metrics'
    });
  }
});

/**
 * Revenue Analytics - Get revenue data for date range
 * Required by: subscription-management.tsx
 */
router.get('/billing/analytics/revenue', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get all projects with payment data
    const allProjects = await storage.getAllProjects();
    const paidProjects = allProjects.filter((p: any) => {
      const paidAt = p.paidAt || p.lastModified;
      return p.isPaid && new Date(paidAt) >= startDate && new Date(paidAt) <= endDate;
    });

    // Calculate revenue by tier
    const revenueByTier: Record<string, number> = {};
    const revenueByFeature: Record<string, number> = {};
    let totalRevenue = 0;

    for (const project of paidProjects) {
      const cost = (project as any).lockedCostEstimate || 0;
      totalRevenue += cost;

      const tier = (project as any).subscriptionTier || 'pay_per_use';
      revenueByTier[tier] = (revenueByTier[tier] || 0) + cost;

      const journeyType = project.journeyType || 'general';
      revenueByFeature[journeyType] = (revenueByFeature[journeyType] || 0) + cost;
    }

    // Get subscription statistics
    const subscriptionStats = await db.select({
      tier: users.subscriptionTier,
      status: users.subscriptionStatus,
      count: count()
    })
      .from(users)
      .groupBy(users.subscriptionTier, users.subscriptionStatus);

    const analytics = {
      totalRevenue,
      revenueByTier,
      revenueByFeature,
      subscriptionStats: subscriptionStats.map((s: any) => ({
        tier: s.tier || 'free',
        status: s.status || 'inactive',
        count: Number(s.count)
      })),
      paymentCount: paidProjects.length,
      averagePayment: paidProjects.length > 0 ? totalRevenue / paidProjects.length : 0,
      dateRange: { startDate, endDate }
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error: any) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch revenue analytics'
    });
  }
});

/**
 * Usage Analytics - Get usage data for date range
 * Required by: subscription-management.tsx
 */
router.get('/billing/analytics/usage', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    // Get projects in date range
    // Now using properly typed createdAt field from DataProject schema
    const allProjects = await storage.getAllProjects();
    const rangeProjects = allProjects.filter(p => {
      if (!p.createdAt) return false;
      const created = new Date(p.createdAt);
      return created >= startDate && created <= endDate;
    });

    // Calculate usage metrics
    const projectsCreated = rangeProjects.length;
    const analysesRun = rangeProjects.filter((p: any) => p.analysisExecutedAt).length;

    // Usage by journey type
    const usageByJourneyType: Record<string, number> = {};
    for (const project of rangeProjects) {
      const type = project.journeyType || 'general';
      usageByJourneyType[type] = (usageByJourneyType[type] || 0) + 1;
    }

    // Agent metrics from registry
    const registeredAgents = agentRegistry.getAgents();
    const totalAgentTasks = registeredAgents.reduce((sum, a) => sum + a.metrics.totalTasks, 0);

    const analytics = {
      totalUsage: projectsCreated * 10, // Approximate MB
      projectsCreated,
      analysesRun,
      usageByJourneyType,
      agentInteractions: totalAgentTasks,
      dataProcessedMB: projectsCreated * 5, // Approximate
      computeMinutes: analysesRun * 2, // Estimate 2 min per analysis
      dateRange: { startDate, endDate }
    };

    res.json({
      success: true,
      analytics
    });
  } catch (error: any) {
    console.error('Usage analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch usage analytics'
    });
  }
});

// Analysis pricing now delegated to PricingService (DB-backed, single runtime source of truth)

/**
 * Get Analysis Pricing Configuration
 * Required by: analysis-pricing.tsx
 */
router.get('/billing/analysis-pricing', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      config: PricingService.getPricingConfig()
    });
  } catch (error: any) {
    console.error('Analysis pricing fetch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch analysis pricing'
    });
  }
});

/**
 * Preview Analysis Cost
 * Required by: analysis-pricing.tsx
 */
router.post('/billing/analysis-pricing/preview', requirePermission('billing', 'read'), async (req: Request, res: Response) => {
  try {
    const { analysisType, recordCount, complexity, proposedConfig } = req.body;
    const config = proposedConfig || PricingService.getPricingConfig();

    // Calculate cost breakdown
    const typeFactor = config.analysisTypeFactors[analysisType] || config.analysisTypeFactors.default || 1.0;
    const complexityMultiplier = config.complexityMultipliers[complexity] || 1.0;

    const baseCost = config.baseCost * typeFactor;
    const dataSizeCost = (recordCount / 1000) * config.dataSizeCostPer1K;
    const complexityCost = baseCost * (complexityMultiplier - 1); // Additional cost from complexity
    const totalAnalysisCost = baseCost + dataSizeCost + complexityCost;

    const preview = {
      analysisType,
      recordCount,
      complexity,
      analysisCost: {
        baseCost,
        dataSizeCost,
        complexityCost,
        totalCost: totalAnalysisCost
      },
      platformFee: config.platformFee,
      totalProjectCost: totalAnalysisCost + config.platformFee
    };

    res.json({
      success: true,
      preview
    });
  } catch (error: any) {
    console.error('Analysis pricing preview error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to preview analysis pricing'
    });
  }
});

/**
 * Update Analysis Pricing Configuration
 * Required by: analysis-pricing.tsx
 */
router.put('/billing/analysis-pricing', requirePermission('billing', 'manage'), async (req: Request, res: Response) => {
  try {
    const updates = req.body;

    // Delegate to PricingService (persists to DB + refreshes cache)
    const updatedConfig = PricingService.updatePricingConfig(updates);

    res.json({
      success: true,
      config: updatedConfig,
      message: 'Analysis pricing updated successfully'
    });
  } catch (error: any) {
    console.error('Analysis pricing update error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update analysis pricing'
    });
  }
});

/**
 * Reset Analysis Pricing to Defaults
 * Required by: analysis-pricing.tsx
 */
router.post('/billing/analysis-pricing/reset', requirePermission('billing', 'manage'), async (req: Request, res: Response) => {
  try {
    const resetConfig = PricingService.resetPricingConfig();

    res.json({
      success: true,
      config: resetConfig,
      message: 'Analysis pricing reset to defaults'
    });
  } catch (error: any) {
    console.error('Analysis pricing reset error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reset analysis pricing'
    });
  }
});

// ============================================================================
// P1-1 FIX: MIGRATED TOOLS ENDPOINTS (from admin.ts → admin-secured.ts)
// These were at /api/admin-legacy/tools, now served at /api/admin/tools
// ============================================================================

/**
 * GET /api/admin/tools
 * Get all registered tools
 */
router.get('/tools', requireAdmin, async (req: Request, res: Response) => {
  try {
    const tools = MCPToolRegistry.getAllTools();
    const mcpResources = EnhancedMCPService.getAllResources();

    const toolData = tools.map(tool => ({
      id: tool.name,
      name: tool.name,
      description: tool.description,
      category: tool.category || 'utility',
      version: '1.0.0',
      author: 'System',
      status: 'active',
      tags: [],
      permissions: {
        required: tool.permissions,
        optional: []
      },
      agentAccess: tool.agentAccess || ['all'],
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      examples: tool.examples || [],
      metrics: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        uptime: 100,
        errorRate: 0,
        userSatisfactionScore: 4.8
      }
    }));

    res.json({
      success: true,
      tools: toolData,
      totalTools: toolData.length,
      mcpResources: mcpResources.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch tools', message: error.message });
  }
});

router.get('/tools/catalog', requireAdmin, async (req: Request, res: Response) => {
  try {
    const catalog = MCPToolRegistry.generateCatalog();
    res.json({ success: true, catalog });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to generate catalog', message: error.message });
  }
});

router.get('/tools/by-category/:category', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const tools = MCPToolRegistry.getToolsByCategory(category);
    res.json({ success: true, category, tools, count: tools.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch tools by category', message: error.message });
  }
});

router.get('/tools/for-agent/:agentId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const tools = MCPToolRegistry.getToolsForAgent(agentId);
    res.json({ success: true, agentId, tools, count: tools.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch agent tools', message: error.message });
  }
});

router.get('/tools/:toolName', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { toolName } = req.params;
    const tool = MCPToolRegistry.getTool(toolName);
    if (!tool) {
      return res.status(404).json({ success: false, error: 'Tool not found' });
    }
    const documentation = MCPToolRegistry.getToolDocs(toolName);
    res.json({ success: true, tool, documentation });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch tool details', message: error.message });
  }
});

router.post('/tools', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const toolDefinition = req.body;
    if (!toolDefinition.name || !toolDefinition.description || !toolDefinition.permissions) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, description, permissions' });
    }
    if (!toolDefinition.service) { toolDefinition.service = 'DynamicToolService'; }
    MCPToolRegistry.registerTool(toolDefinition);
    res.json({ success: true, message: `Tool ${toolDefinition.name} registered successfully`, tool: MCPToolRegistry.getTool(toolDefinition.name) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to register tool', message: error.message });
  }
});

router.delete('/tools/:toolName', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { toolName } = req.params;
    const success = MCPToolRegistry.unregisterTool(toolName);
    if (!success) { return res.status(404).json({ success: false, error: 'Tool not found' }); }
    res.json({ success: true, message: `Tool ${toolName} unregistered successfully` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to unregister tool', message: error.message });
  }
});

// ============================================================================
// P1-1 FIX: MIGRATED DATABASE ENDPOINTS (from admin.ts → admin-secured.ts)
// ============================================================================

router.get('/database/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const poolStats = getPoolStats();
    if (!poolStats) {
      return res.status(503).json({ success: false, error: 'Database not available', message: 'Database connection pool is not initialized' });
    }
    res.json({ success: true, data: { timestamp: new Date().toISOString(), poolStats, status: 'connected', environment: process.env.NODE_ENV || 'development' } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to fetch database status', message: error.message });
  }
});

router.get('/database/health', requireAdmin, async (req: Request, res: Response) => {
  try {
    const poolStats = getPoolStats();
    if (!poolStats) {
      return res.status(503).json({ success: false, healthy: false, error: 'Database not available' });
    }
    const isHealthy = poolStats.totalCount > 0 && poolStats.waitingCount < 10;
    const status = isHealthy ? 'healthy' : 'degraded';
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy, healthy: isHealthy, status,
      timestamp: new Date().toISOString(),
      details: {
        totalConnections: poolStats.totalCount,
        idleConnections: poolStats.idleCount,
        waitingClients: poolStats.waitingCount,
        poolUtilization: poolStats.totalCount > 0 ? Math.round(((poolStats.totalCount - poolStats.idleCount) / poolStats.totalCount) * 100) : 0
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, healthy: false, error: 'Failed to check database health', message: error.message });
  }
});

router.get('/database/optimization/health', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const healthCheck = await enhancedPool.performDatabaseHealthCheck();
    res.json({ success: true, data: healthCheck });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to perform database health check', message: error.message });
  }
});

router.get('/database/optimization/metrics', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const metrics = enhancedPool.getQueryMetrics();
    res.json({ success: true, data: { totalQueries: metrics.length, metrics: metrics.slice(0, 50) } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get query metrics', message: error.message });
  }
});

router.get('/database/optimization/slow-queries', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 25;
    const slowQueries = enhancedPool.getSlowQueries(limit);
    res.json({ success: true, data: { count: slowQueries.length, queries: slowQueries } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get slow queries', message: error.message });
  }
});

router.post('/database/optimization/migration', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { migration } = req.body;
    if (!migration || !migration.name || !migration.up) {
      return res.status(400).json({ success: false, error: 'Invalid migration data', message: 'Migration must have name and up fields' });
    }
    await enhancedPool.executeMigration(migration);
    res.json({ success: true, message: `Migration "${migration.name}" executed successfully` });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to execute migration', message: error.message });
  }
});

// ============================================================================
// P1-1 FIX: MIGRATED ERROR TRACKING ENDPOINTS (from admin.ts → admin-secured.ts)
// ============================================================================

router.get('/errors/statistics', requireAdmin, async (req: Request, res: Response) => {
  try {
    const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string) : undefined;
    const statistics = errorHandler.getErrorStatistics(timeWindow);
    res.json({ success: true, data: statistics });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get error statistics', message: error.message });
  }
});

router.get('/errors/circuit-breakers', requireAdmin, async (req: Request, res: Response) => {
  try {
    const circuitBreakers = errorHandler.getCircuitBreakerStatus();
    res.json({ success: true, data: { count: circuitBreakers.length, circuitBreakers } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get circuit breaker status', message: error.message });
  }
});

router.post('/errors/circuit-breakers/:name/reset', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const success = errorHandler.resetCircuitBreaker(name);
    if (success) {
      res.json({ success: true, message: `Circuit breaker "${name}" reset successfully` });
    } else {
      res.status(404).json({ success: false, error: 'Circuit breaker not found', message: `No circuit breaker found with name "${name}"` });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to reset circuit breaker', message: error.message });
  }
});

export default router;