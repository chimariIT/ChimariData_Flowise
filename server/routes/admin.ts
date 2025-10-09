// server/routes/admin.ts
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { agentRegistry } from '../services/agent-registry';
import { MCPToolRegistry } from '../services/mcp-tool-registry';
import { agentSystem } from '../services/agent-initialization';
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { ensureAuthenticated } from './auth';
import { adminRateLimit } from '../middleware/security-headers';
import { requireAdmin, requirePermission, requireSuperAdmin, getUserPermissions } from '../middleware/rbac';
import {
  agentTemplates,
  getAgentTemplate,
  getTemplatesByCategory,
  searchAgentTemplates,
  createAgentFromTemplate,
  getTemplateRecommendations
} from '../services/agent-templates';

const router = express.Router();

// Apply rate limiting to all admin routes
router.use(adminRateLimit);

// Apply authentication to all admin routes
router.use(ensureAuthenticated);

// Get user permissions endpoint (for frontend RBAC)
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

// Legacy admin check - deprecated, use RBAC middleware instead
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user has admin role
    // TODO: Add proper role check based on your user schema
    // For now, we'll check if user email ends with @admin or has admin role
    const user = req.user as any;
    const isAdmin = user.role === 'admin' ||
                    user.email?.endsWith('@admin.com') ||
                    user.isAdmin === true;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Authorization check failed',
      message: error.message
    });
  }
};

// Apply rate limiting, authentication, and admin check to all routes
router.use(adminRateLimit);
router.use(ensureAuthenticated);
router.use(requireAdmin);

// Helper function to broadcast admin events
function broadcastAdminEvent(type: string, data: any) {
  // Dynamic import to avoid circular dependency
  import('../index.js').then(({ realtimeServer }) => {
    if (realtimeServer) {
      realtimeServer.broadcast({
        type: 'status_change',
        sourceType: 'streaming',
        sourceId: 'admin',
        userId: 'system',
        timestamp: new Date(),
        data: {
          eventType: type,
          ...data
        }
      });
    }
  }).catch(err => {
    console.error('Failed to broadcast admin event:', err);
  });
}

// ==========================================
// AGENT MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /api/admin/agents
 * Get all registered agents with their status
 */
router.get('/agents', async (req, res) => {
  try {
    const agents = agentRegistry.getAgents();

    const agentData = await Promise.all(agents.map(async (agent) => {
      const queueStatus = agentRegistry.getQueueStatus();

      return {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        description: agent.description,
        status: agent.status,
        version: agent.version,
        capabilities: agent.capabilities.map(cap => ({
          name: cap.name,
          description: cap.description,
          complexity: cap.complexity,
          tags: cap.tags
        })),
        priority: agent.priority,
        maxConcurrentTasks: agent.maxConcurrentTasks,
        currentTasks: agent.currentTasks,
        metrics: {
          totalTasks: agent.metrics.totalTasks,
          successfulTasks: agent.metrics.successfulTasks,
          failedTasks: agent.metrics.failedTasks,
          successRate: agent.metrics.totalTasks > 0
            ? (agent.metrics.successfulTasks / agent.metrics.totalTasks) * 100
            : 100,
          lastActivity: agent.metrics.lastActivity
        },
        health: agent.health,
        config: agent.config
      };
    }));

    res.json({
      success: true,
      agents: agentData,
      systemStatus: agentSystem.getSystemStatus ? await agentSystem.getSystemStatus() : null
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agents',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/agents/:agentId
 * Get detailed information about a specific agent
 */
router.get('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const agent = agentRegistry.getAgent(agentId);

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    res.json({
      success: true,
      agent: {
        ...agent,
        activeTasks: agentRegistry.getAgentTasks ? agentRegistry.getAgentTasks(agentId) : [],
        performanceHistory: agent.metrics
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent details',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/agents
 * Register a new agent dynamically
 */
router.post('/agents', async (req, res) => {
  try {
    const agentDefinition = req.body;

    // Validate required fields
    if (!agentDefinition.id || !agentDefinition.name || !agentDefinition.type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, name, type'
      });
    }

    // Create agent handler (placeholder - would need actual implementation)
    const agentHandler = {
      async execute(task: any) {
        return {
          taskId: task.id,
          agentId: agentDefinition.id,
          status: 'success',
          result: { message: 'Task completed' },
          metrics: {
            duration: 1000,
            resourcesUsed: ['compute'],
            tokensConsumed: 0
          },
          completedAt: new Date()
        };
      },
      validateTask: (task: any) => true,
      getStatus: async () => ({
        status: 'active' as const,
        currentTasks: 0,
        queuedTasks: 0,
        lastActivity: new Date(),
        resourceUsage: { cpu: 0, memory: 0, storage: 0 }
      }),
      configure: async (config: any) => {},
      shutdown: async () => {}
    };

    // Register agent
    await agentRegistry.registerAgent(agentDefinition, agentHandler);

    // Broadcast agent created event
    broadcastAdminEvent('agent_created', {
      agentId: agentDefinition.id,
      agentName: agentDefinition.name,
      agentType: agentDefinition.type
    });

    res.json({
      success: true,
      message: `Agent ${agentDefinition.name} registered successfully`,
      agentId: agentDefinition.id
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to register agent',
      message: error.message
    });
  }
});

/**
 * PUT /api/admin/agents/:agentId
 * Update agent configuration
 */
router.put('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const updates = req.body;

    const agent = agentRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Update agent configuration
    if (updates.config) {
      Object.assign(agent.config, updates.config);
    }

    res.json({
      success: true,
      message: `Agent ${agentId} updated successfully`,
      agent
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update agent',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/agents/:agentId
 * Unregister an agent
 */
router.delete('/agents/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;

    const success = await agentRegistry.unregisterAgent(agentId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Broadcast agent deleted event
    broadcastAdminEvent('agent_deleted', {
      agentId
    });

    res.json({
      success: true,
      message: `Agent ${agentId} unregistered successfully`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to unregister agent',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/agents/:agentId/restart
 * Restart an agent
 */
router.post('/agents/:agentId/restart', async (req, res) => {
  try {
    const { agentId } = req.params;

    const agent = agentRegistry.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Set to maintenance mode temporarily
    agent.status = 'maintenance';

    // Simulate restart delay
    setTimeout(() => {
      agent.status = 'active';
    }, 2000);

    res.json({
      success: true,
      message: `Agent ${agentId} is restarting...`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to restart agent',
      message: error.message
    });
  }
});

// ==========================================
// TOOL MANAGEMENT ENDPOINTS
// ==========================================

/**
 * GET /api/admin/tools
 * Get all registered tools
 */
router.get('/tools', async (req, res) => {
  try {
    const tools = MCPToolRegistry.getAllTools();
    const mcpResources = EnhancedMCPService.getAllResources();

    const toolData = tools.map(tool => ({
      id: tool.name,
      name: tool.name,
      description: tool.description,
      category: tool.category || 'utility',
      version: '1.0.0', // TODO: Add versioning to tool registry
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tools',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/tools/:toolName
 * Get detailed information about a specific tool
 */
router.get('/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;
    const tool = MCPToolRegistry.getTool(toolName);

    if (!tool) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }

    const documentation = MCPToolRegistry.getToolDocs(toolName);

    res.json({
      success: true,
      tool,
      documentation
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tool details',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/tools
 * Register a new tool
 */
router.post('/tools', async (req, res) => {
  try {
    const toolDefinition = req.body;

    // Validate required fields
    if (!toolDefinition.name || !toolDefinition.description || !toolDefinition.permissions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, description, permissions'
      });
    }

    // Set default service if not provided
    if (!toolDefinition.service) {
      toolDefinition.service = 'DynamicToolService';
    }

    // Register tool
    MCPToolRegistry.registerTool(toolDefinition);

    // Broadcast tool created event
    broadcastAdminEvent('tool_created', {
      toolName: toolDefinition.name,
      toolCategory: toolDefinition.category
    });

    res.json({
      success: true,
      message: `Tool ${toolDefinition.name} registered successfully`,
      tool: MCPToolRegistry.getTool(toolDefinition.name)
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to register tool',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/tools/:toolName
 * Unregister a tool
 */
router.delete('/tools/:toolName', async (req, res) => {
  try {
    const { toolName } = req.params;

    const success = MCPToolRegistry.unregisterTool(toolName);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Tool not found'
      });
    }

    // Broadcast tool deleted event
    broadcastAdminEvent('tool_deleted', {
      toolName
    });

    res.json({
      success: true,
      message: `Tool ${toolName} unregistered successfully`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to unregister tool',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/tools/catalog
 * Get formatted tool catalog
 */
router.get('/tools/catalog', async (req, res) => {
  try {
    const catalog = MCPToolRegistry.generateCatalog();

    res.json({
      success: true,
      catalog
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to generate catalog',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/tools/by-category/:category
 * Get tools by category
 */
router.get('/tools/by-category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const tools = MCPToolRegistry.getToolsByCategory(category);

    res.json({
      success: true,
      category,
      tools,
      count: tools.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch tools by category',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/tools/for-agent/:agentId
 * Get tools available to a specific agent
 */
router.get('/tools/for-agent/:agentId', async (req, res) => {
  try {
    const { agentId } = req.params;
    const tools = MCPToolRegistry.getToolsForAgent(agentId);

    res.json({
      success: true,
      agentId,
      tools,
      count: tools.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent tools',
      message: error.message
    });
  }
});

// ==========================================
// SYSTEM STATUS ENDPOINTS
// ==========================================

/**
 * GET /api/admin/system/status
 * Get overall system status
 */
router.get('/system/status', async (req, res) => {
  try {
    const queueStatus = agentRegistry.getQueueStatus();
    const agents = agentRegistry.getAgents();
    const tools = MCPToolRegistry.getAllTools();

    const systemStatus = agentSystem.getSystemStatus ? await agentSystem.getSystemStatus() : {
      totalAgents: agents.length,
      activeAgents: agents.filter(a => a.status === 'active').length,
      totalTools: tools.length
    };

    res.json({
      success: true,
      system: {
        ...systemStatus,
        queue: queueStatus,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system status',
      message: error.message
    });
  }
});

// ==========================================
// AGENT TEMPLATE ENDPOINTS
// ==========================================

/**
 * GET /api/admin/templates
 * Get all agent templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { category, search } = req.query;

    let templates = agentTemplates;

    if (category && category !== 'all') {
      templates = getTemplatesByCategory(category as string);
    }

    if (search) {
      templates = searchAgentTemplates(search as string);
    }

    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/templates/:templateId
 * Get specific template details
 */
router.get('/templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const template = getAgentTemplate(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/templates/:templateId/create
 * Create agent from template
 */
router.post('/templates/:templateId/create', async (req, res) => {
  try {
    const { templateId } = req.params;
    const customizations = req.body;

    // Create agent definition from template
    const agentDefinition = createAgentFromTemplate(templateId, customizations);

    // Placeholder agent handler (would need actual implementation)
    const agentHandler = {
      async execute(task: any) {
        return {
          taskId: task.id,
          agentId: agentDefinition.id,
          status: 'success',
          result: { message: 'Task completed' },
          metrics: {
            duration: 1000,
            resourcesUsed: ['compute'],
            tokensConsumed: 0
          },
          completedAt: new Date()
        };
      },
      validateTask: (task: any) => true,
      getStatus: async () => ({
        status: 'active' as const,
        currentTasks: 0,
        queuedTasks: 0,
        lastActivity: new Date(),
        resourceUsage: { cpu: 0, memory: 0, storage: 0 }
      }),
      configure: async (config: any) => {},
      shutdown: async () => {}
    };

    // Register agent
    await agentRegistry.registerAgent(agentDefinition, agentHandler);

    // Broadcast event
    broadcastAdminEvent('agent_created_from_template', {
      agentId: agentDefinition.id,
      templateId,
      agentName: agentDefinition.name
    });

    res.json({
      success: true,
      message: `Agent created from template: ${templateId}`,
      agent: agentDefinition
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to create agent from template',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/templates/recommendations
 * Get template recommendations based on use case
 */
router.get('/templates/recommendations', async (req, res) => {
  try {
    const { useCase } = req.query;

    if (!useCase) {
      return res.status(400).json({
        success: false,
        error: 'Use case parameter required'
      });
    }

    const recommendations = getTemplateRecommendations(useCase as string);

    res.json({
      success: true,
      recommendations,
      count: recommendations.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get recommendations',
      message: error.message
    });
  }
});

// ==========================================
// BILLING & SUBSCRIPTION CONFIGURATION
// ==========================================

import {
  AdminSubscriptionTierConfig,
  AdminFeatureConfig,
  AdminCampaignConfig,
  getBillingService,
} from '../services/billing/unified-billing-service';
import { SubscriptionTierEnum } from '../../shared/canonical-types';

/**
 * GET /api/admin/billing/tiers
 * Get all subscription tier configurations
 */
router.get('/billing/tiers', async (req, res) => {
  try {
    const billingService = getBillingService();
    const tiers: AdminSubscriptionTierConfig[] = [];

    for (const tierValue of SubscriptionTierEnum.options) {
      const config = billingService.getTierConfig(tierValue);
      if (config) {
        tiers.push(config);
      }
    }

    res.json({
      success: true,
      tiers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get tier configurations',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/billing/tiers/:tier
 * Get specific tier configuration
 */
router.get('/billing/tiers/:tier', async (req, res) => {
  try {
    const tier = req.params.tier;

    // Validate tier
    const parseResult = SubscriptionTierEnum.safeParse(tier);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription tier',
      });
    }

    const billingService = getBillingService();
    const config = billingService.getTierConfig(parseResult.data);

    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Tier configuration not found',
      });
    }

    res.json({
      success: true,
      tier: config,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get tier configuration',
      message: error.message,
    });
  }
});

/**
 * PUT /api/admin/billing/tiers/:tier/pricing
 * Update tier pricing (monthly/yearly)
 */
router.put('/billing/tiers/:tier/pricing', async (req, res) => {
  try {
    const tier = req.params.tier;
    const { monthly, yearly, currency } = req.body;

    // Validate
    const parseResult = SubscriptionTierEnum.safeParse(tier);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }

    if (typeof monthly !== 'number' || typeof yearly !== 'number') {
      return res.status(400).json({ success: false, error: 'Invalid pricing' });
    }

    // TODO: Update database table: subscription_tier_configs
    // TODO: Update Stripe prices if needed

    const billingService = getBillingService();
    await billingService.reloadConfigurations();

    broadcastAdminEvent('tier_pricing_updated', {
      tier: parseResult.data,
      monthly,
      yearly,
      currency,
    });

    res.json({
      success: true,
      message: 'Pricing updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update pricing',
      message: error.message,
    });
  }
});

/**
 * PUT /api/admin/billing/tiers/:tier/quotas
 * Update tier quotas
 */
router.put('/billing/tiers/:tier/quotas', async (req, res) => {
  try {
    const tier = req.params.tier;
    const quotas = req.body;

    // Validate
    const parseResult = SubscriptionTierEnum.safeParse(tier);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }

    // TODO: Validate quotas structure with Zod
    // TODO: Update database

    const billingService = getBillingService();
    await billingService.reloadConfigurations();

    broadcastAdminEvent('tier_quotas_updated', {
      tier: parseResult.data,
      quotas,
    });

    res.json({
      success: true,
      message: 'Quotas updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update quotas',
      message: error.message,
    });
  }
});

/**
 * PUT /api/admin/billing/tiers/:tier/features
 * Update tier feature flags
 */
router.put('/billing/tiers/:tier/features', async (req, res) => {
  try {
    const tier = req.params.tier;
    const { features } = req.body;

    // Validate
    const parseResult = SubscriptionTierEnum.safeParse(tier);
    if (!parseResult.success) {
      return res.status(400).json({ success: false, error: 'Invalid tier' });
    }

    if (!Array.isArray(features)) {
      return res.status(400).json({ success: false, error: 'Features must be an array' });
    }

    // TODO: Update database

    const billingService = getBillingService();
    await billingService.reloadConfigurations();

    broadcastAdminEvent('tier_features_updated', {
      tier: parseResult.data,
      features,
    });

    res.json({
      success: true,
      message: 'Features updated successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update features',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/billing/analytics/revenue
 * Get revenue analytics
 */
router.get('/billing/analytics/revenue', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // TODO: Query database for revenue data
    // TODO: Aggregate by tier, feature, time period

    res.json({
      success: true,
      analytics: {
        totalRevenue: 0,
        revenueByTier: {},
        revenueByFeature: {},
        revenueByPeriod: [],
      },
      message: 'Analytics implementation in progress',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue analytics',
      message: error.message,
    });
  }
});

/**
 * GET /api/admin/billing/analytics/usage
 * Get usage analytics
 */
router.get('/billing/analytics/usage', async (req, res) => {
  try {
    // TODO: Query database for usage data
    // TODO: Aggregate by feature, complexity, tier

    res.json({
      success: true,
      analytics: {
        totalUsers: 0,
        activeSubscriptions: 0,
        usageByTier: {},
        usageByFeature: {},
        quotaUtilization: {},
      },
      message: 'Analytics implementation in progress',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get usage analytics',
      message: error.message,
    });
  }
});

export default router;
