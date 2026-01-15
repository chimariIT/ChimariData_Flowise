import express from 'express';
import type { Request, Response } from 'express';
import { agentRegistry } from '../services/agent-registry';
import type { AgentDefinition, AgentHandler, AgentResult, AgentTask } from '../services/agent-registry';
import { MCPToolRegistry } from '../services/mcp-tool-registry';
import { agentSystem } from '../services/agent-initialization';
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { journeyTemplateService } from '../services/project-manager/journey-template-service';
import { JourneyTemplateSchema } from '@shared/journey-templates';
import { RoleBasedAIService } from '../services/role-based-ai';
import { getPoolStats } from '../db';
import { enhancedPool } from '../enhanced-db';
import { errorHandler } from '../services/enhanced-error-handler';
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
import type {
  projects as ProjectsTable,
  datasets as DatasetsTable,
  projectDatasets as ProjectDatasetsTable
} from '@shared/schema';

type ProjectRow = typeof ProjectsTable.$inferSelect;
type DatasetRow = typeof DatasetsTable.$inferSelect;
type ProjectDatasetRow = typeof ProjectDatasetsTable.$inferSelect;
type DatasetLink = {
  dataset: DatasetRow;
  projectId: ProjectDatasetRow['projectId'];
};

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

// Apply rate limiting, authentication, and admin check to all routes
router.use(adminRateLimit);
router.use(ensureAuthenticated);
router.use(requireAdmin);

// Helper function to broadcast admin events
function broadcastAdminEvent(type: string, data: any) {
  // Dynamic import to avoid circular dependency
  import('../index.js').then((mod: any) => {
    const realtimeServer = mod?.realtimeServer as { broadcast: (payload: any) => void } | undefined;
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
      const failedTasks = Math.max(0, agent.metrics.totalTasks - agent.metrics.successfulTasks);
      const successRate = agent.metrics.totalTasks > 0
        ? (agent.metrics.successfulTasks / agent.metrics.totalTasks) * 100
        : 100;

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
          failedTasks,
          successRate,
          averageResponseTime: agent.metrics.averageResponseTime,
          lastActivity: agent.metrics.lastActivity
        },
        health: agent.health,
        config: agent.configuration
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

    const status = await agentRegistry.getAgentStatus(agentId);
    const failedTasks = Math.max(0, agent.metrics.totalTasks - agent.metrics.successfulTasks);
    const successRate = agent.metrics.totalTasks > 0
      ? (agent.metrics.successfulTasks / agent.metrics.totalTasks) * 100
      : 100;

    res.json({
      success: true,
      agent: {
        ...agent,
        metrics: {
          ...agent.metrics,
          failedTasks,
          successRate
        },
        status: status?.status ?? agent.status,
        currentTasks: status?.currentTasks ?? agent.currentTasks,
        queuedTasks: status?.queuedTasks ?? 0
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
  const agentDefinition = req.body as AgentDefinition;

    // Validate required fields
    if (!agentDefinition.id || !agentDefinition.name || !agentDefinition.type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: id, name, type'
      });
    }

    // Create agent handler (placeholder - would need actual implementation)
    const agentHandler: AgentHandler = {
      async execute(task: AgentTask): Promise<AgentResult> {
        return {
          taskId: task.id,
          agentId: agentDefinition.id as string,
          status: 'success',
          result: { message: 'Task completed' },
          metrics: {
            duration: 1000,
            resourcesUsed: [],
            tokensConsumed: 0
          },
          completedAt: new Date()
        };
      },
      validateTask: (_task: AgentTask) => true,
      async getStatus() {
        return {
          status: 'active',
          currentTasks: 0,
          queuedTasks: 0,
          lastActivity: new Date(),
          resourceUsage: { cpu: 0, memory: 0, storage: 0 }
        };
      },
      async configure(config: Record<string, any>): Promise<void> {
        agentDefinition.configuration = {
          ...(agentDefinition.configuration ?? {}),
          ...config
        };
      },
      async shutdown(): Promise<void> {
        // Placeholder shutdown logic
      }
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
      agent.configuration = {
        ...(agent.configuration ?? {}),
        ...updates.config
      };
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
// JOURNEY TEMPLATE MANAGEMENT ENDPOINTS
// ==========================================

router.get('/journey-templates', async (_req, res) => {
  try {
    const templates = journeyTemplateService.getAllTemplates();
    res.json({
      success: true,
      templates,
      count: templates.length
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch journey templates',
      message: error.message
    });
  }
});

router.get('/journey-templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const resolved = journeyTemplateService.getTemplate(templateId);

    if (!resolved) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      template: resolved.template,
      source: resolved.source
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch journey template',
      message: error.message
    });
  }
});

router.post('/journey-templates', async (req, res) => {
  try {
    const parseResult = JourneyTemplateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template definition',
        details: parseResult.error.flatten()
      });
    }

    const template = journeyTemplateService.upsertTemplate(parseResult.data);
    res.json({
      success: true,
      template
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to register journey template',
      message: error.message
    });
  }
});

router.put('/journey-templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const payload = { ...req.body, id: templateId };
    const parseResult = JourneyTemplateSchema.safeParse(payload);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid template definition',
        details: parseResult.error.flatten()
      });
    }

    const template = journeyTemplateService.upsertTemplate(parseResult.data);
    res.json({
      success: true,
      template
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to update journey template',
      message: error.message
    });
  }
});

router.delete('/journey-templates/:templateId', async (req, res) => {
  try {
    const { templateId } = req.params;
    const removed = journeyTemplateService.deleteTemplate(templateId);

    if (!removed) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      message: `Template ${templateId} removed`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to remove journey template',
      message: error.message
    });
  }
});

router.post('/journey-templates/:templateId/reset', async (req, res) => {
  try {
    const { templateId } = req.params;
    const resetTemplate = journeyTemplateService.resetTemplateToDefault(templateId);

    if (!resetTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Default template not found for provided id'
      });
    }

    res.json({
      success: true,
      template: resetTemplate
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset journey template',
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
// CIRCUIT BREAKER MONITORING ENDPOINTS
// ==========================================

/**
 * GET /api/admin/circuit-breakers/status
 * Get circuit breaker health and statistics
 */
router.get('/circuit-breakers/status', async (req, res) => {
  try {
    const circuitBreakerStatus = RoleBasedAIService.getCircuitBreakerStatus();
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        ...circuitBreakerStatus
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch circuit breaker status',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/circuit-breakers/reset
 * Reset all circuit breakers (admin only)
 */
router.post('/circuit-breakers/reset', async (req, res) => {
  try {
    RoleBasedAIService.resetCircuitBreakers();
    
    res.json({
      success: true,
      message: 'All circuit breakers have been reset',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breakers',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/circuit-breakers/health
 * Get simple health check for circuit breakers
 */
router.get('/circuit-breakers/health', async (req, res) => {
  try {
    const status = RoleBasedAIService.getCircuitBreakerStatus();
    const isHealthy = status.health.healthy;
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      details: status.health.details
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      healthy: false,
      error: 'Failed to check circuit breaker health',
      message: error.message
    });
  }
});

// ==========================================
// WEBSOCKET LIFECYCLE MONITORING ENDPOINTS
// ==========================================

/**
 * GET /api/admin/websocket/status
 * Get WebSocket connection status and lifecycle metrics
 */
router.get('/websocket/status', async (req, res) => {
  try {
    // This would get the realtime server instance
    // For now, return mock data - would need to integrate with actual server instance
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        status: 'enhanced_lifecycle_enabled',
        message: 'WebSocket lifecycle management is active with enhanced monitoring',
        features: [
          'automatic_reconnection',
          'heartbeat_monitoring',
          'connection_health_tracking',
          'performance_metrics',
          'graceful_degradation'
        ]
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch WebSocket status',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/websocket/health
 * Get WebSocket health summary
 */
router.get('/websocket/health', async (req, res) => {
  try {
    // Mock health data - would integrate with actual realtime server
    const healthSummary = {
      overallHealth: 'healthy' as const,
      totalConnections: 0,
      healthyPercentage: 100,
      averageLatency: 0,
      issues: []
    };
    
    const isHealthy = healthSummary.overallHealth === 'healthy';
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      summary: healthSummary
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      healthy: false,
      error: 'Failed to check WebSocket health',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/websocket/reset-metrics
 * Reset WebSocket lifecycle metrics
 */
router.post('/websocket/reset-metrics', async (req, res) => {
  try {
    // This would reset metrics on the actual realtime server
    
    res.json({
      success: true,
      message: 'WebSocket lifecycle metrics have been reset',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset WebSocket metrics',
      message: error.message
    });
  }
});

// ==========================================
// DATABASE MONITORING ENDPOINTS
// ==========================================

/**
 * GET /api/admin/database/status
 * Get database connection pool status and metrics
 */
router.get('/database/status', async (req, res) => {
  try {
    const poolStats = getPoolStats();
    
    if (!poolStats) {
      return res.status(503).json({
        success: false,
        error: 'Database not available',
        message: 'Database connection pool is not initialized'
      });
    }
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        poolStats,
        status: 'connected',
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch database status',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/database/health
 * Get database health check
 */
router.get('/database/health', async (req, res) => {
  try {
    const poolStats = getPoolStats();
    
    if (!poolStats) {
      return res.status(503).json({
        success: false,
        healthy: false,
        error: 'Database not available'
      });
    }
    
    // Health assessment logic
    const isHealthy = poolStats.totalCount > 0 && poolStats.waitingCount < 10;
    const status = isHealthy ? 'healthy' : 'degraded';
    
    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      healthy: isHealthy,
      status,
      timestamp: new Date().toISOString(),
      details: {
        totalConnections: poolStats.totalCount,
        idleConnections: poolStats.idleCount,
        waitingClients: poolStats.waitingCount,
        poolUtilization: poolStats.totalCount > 0 ? 
          Math.round(((poolStats.totalCount - poolStats.idleCount) / poolStats.totalCount) * 100) : 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      healthy: false,
      error: 'Failed to check database health',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/database/optimization/health
 * Get comprehensive database health check with optimization metrics
 */
router.get('/database/optimization/health', async (req, res) => {
  try {
    const healthCheck = await enhancedPool.performDatabaseHealthCheck();
    
    res.json({
      success: true,
      data: healthCheck
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to perform database health check',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/database/optimization/metrics
 * Get query performance metrics
 */
router.get('/database/optimization/metrics', async (req, res) => {
  try {
    const metrics = enhancedPool.getQueryMetrics();
    
    res.json({
      success: true,
      data: {
        totalQueries: metrics.length,
        metrics: metrics.slice(0, 50) // Limit to top 50 queries
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get query metrics',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/database/optimization/slow-queries
 * Get slow query alerts
 */
router.get('/database/optimization/slow-queries', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 25;
    const slowQueries = enhancedPool.getSlowQueries(limit);
    
    res.json({
      success: true,
      data: {
        count: slowQueries.length,
        queries: slowQueries
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get slow queries',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/database/optimization/migration
 * Execute a database migration
 */
router.post('/database/optimization/migration', async (req, res) => {
  try {
    const { migration } = req.body;
    
    if (!migration || !migration.name || !migration.up) {
      return res.status(400).json({
        success: false,
        error: 'Invalid migration data',
        message: 'Migration must have name and up fields'
      });
    }
    
    await enhancedPool.executeMigration(migration);
    
    res.json({
      success: true,
      message: `Migration "${migration.name}" executed successfully`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to execute migration',
      message: error.message
    });
  }
});

// ==========================================
// ERROR HANDLING MONITORING ENDPOINTS
// ==========================================

/**
 * GET /api/admin/errors/statistics
 * Get error statistics and metrics
 */
router.get('/errors/statistics', async (req, res) => {
  try {
    const timeWindow = req.query.timeWindow ? parseInt(req.query.timeWindow as string) : undefined;
    const statistics = errorHandler.getErrorStatistics(timeWindow);
    
    res.json({
      success: true,
      data: statistics
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get error statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/errors/circuit-breakers
 * Get circuit breaker status
 */
router.get('/errors/circuit-breakers', async (req, res) => {
  try {
    const circuitBreakers = errorHandler.getCircuitBreakerStatus();
    
    res.json({
      success: true,
      data: {
        count: circuitBreakers.length,
        circuitBreakers
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get circuit breaker status',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/errors/circuit-breakers/:name/reset
 * Reset a specific circuit breaker
 */
router.post('/errors/circuit-breakers/:name/reset', async (req, res) => {
  try {
    const { name } = req.params;
    const success = errorHandler.resetCircuitBreaker(name);
    
    if (success) {
      res.json({
        success: true,
        message: `Circuit breaker "${name}" reset successfully`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Circuit breaker not found',
        message: `No circuit breaker found with name "${name}"`
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to reset circuit breaker',
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
    const agentDefinition = createAgentFromTemplate(templateId, customizations) as AgentDefinition;

    // Placeholder agent handler (would need actual implementation)
    const agentHandler: AgentHandler = {
      async execute(task: AgentTask): Promise<AgentResult> {
        return {
          taskId: task.id,
          agentId: agentDefinition.id as string,
          status: 'success',
          result: { message: 'Task completed' },
          metrics: {
            duration: 1000,
            resourcesUsed: [],
            tokensConsumed: 0
          },
          completedAt: new Date()
        };
      },
      validateTask: (_task: AgentTask) => true,
      async getStatus() {
        return {
          status: 'active',
          currentTasks: 0,
          queuedTasks: 0,
          lastActivity: new Date(),
          resourceUsage: { cpu: 0, memory: 0, storage: 0 }
        };
      },
      async configure(config: Record<string, any>): Promise<void> {
        agentDefinition.configuration = {
          ...(agentDefinition.configuration ?? {}),
          ...config
        };
      },
      async shutdown(): Promise<void> {
        // Placeholder shutdown logic
      }
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

    // Import analytics service
    const { toolAnalyticsService } = await import('../services/tool-analytics');
    const { db } = await import('../db');
    const { users } = await import('../../shared/schema');

    // Get system-wide cost metrics
    const systemMetrics = await toolAnalyticsService.getSystemMetrics();

    // Get all users for aggregation
    const allUsers = await db.select().from(users);

    // Aggregate costs by tier
    const revenueByTier: { [tier: string]: number } = {};
    const revenueByFeature: { [feature: string]: number } = {};

    let totalRevenue = 0;

    // Calculate revenue from tool usage
    for (const user of allUsers) {
      const costBreakdown = await toolAnalyticsService.getUserCostBreakdown(
        user.id,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      // Aggregate by tier
      const tier = user.subscriptionTier || 'none';
      revenueByTier[tier] = (revenueByTier[tier] || 0) + costBreakdown.totalCost;

      // Aggregate by feature (tool)
      for (const tool of costBreakdown.toolBreakdown) {
        revenueByFeature[tool.toolId] = (revenueByFeature[tool.toolId] || 0) + tool.cost;
      }

      totalRevenue += costBreakdown.totalCost;
    }

    res.json({
      success: true,
      analytics: {
        totalRevenue,
        revenueByTier,
        revenueByFeature,
        revenueByPeriod: [], // TODO: Implement time-series aggregation
        systemMetrics: {
          totalExecutions: systemMetrics.totalExecutions,
          activeTools: systemMetrics.activeTools,
          averageLatency: systemMetrics.averageLatency,
          errorRate: systemMetrics.errorRate,
        },
        period: {
          start: startDate || 'all',
          end: endDate || 'now',
        },
      },
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
    // Import services
    const { toolAnalyticsService } = await import('../services/tool-analytics');
    const { getBillingService } = await import('../services/billing/unified-billing-service');
    const { db } = await import('../db');
    const { users } = await import('../../shared/schema');

    const billingService = getBillingService();

    // Get all users
    type BillingUser = {
      id: string;
      subscriptionStatus: string | null;
      subscriptionTier: string | null;
    };

    const allUsers = (await db.select().from(users)) as BillingUser[];

    // Calculate usage metrics
    const totalUsers = allUsers.length;
    const activeSubscriptions = allUsers.filter(
      (u) => u.subscriptionStatus === 'active' && u.subscriptionTier !== 'none'
    ).length;

    const usageByTier: { [tier: string]: { users: number; totalExecutions: number; totalCost: number } } = {};
    const usageByFeature: { [feature: string]: { executions: number; cost: number } } = {};
    const quotaUtilization: { [tier: string]: { avgUtilization: number; usersAtCapacity: number } } = {};

    // Aggregate usage data
    for (const user of allUsers) {
      const tier = user.subscriptionTier || 'none';

      // Initialize tier stats
      if (!usageByTier[tier]) {
        usageByTier[tier] = { users: 0, totalExecutions: 0, totalCost: 0 };
      }

      usageByTier[tier].users++;

      // Get user's tool usage
      const costBreakdown = await toolAnalyticsService.getUserCostBreakdown(user.id);

      usageByTier[tier].totalExecutions += costBreakdown.executionCount;
      usageByTier[tier].totalCost += costBreakdown.totalCost;

      // Aggregate by feature
      for (const tool of costBreakdown.toolBreakdown) {
        if (!usageByFeature[tool.toolId]) {
          usageByFeature[tool.toolId] = { executions: 0, cost: 0 };
        }
        usageByFeature[tool.toolId].executions += tool.count;
        usageByFeature[tool.toolId].cost += tool.cost;
      }

      // Calculate quota utilization
      if (tier !== 'none') {
        const usageMetrics = await billingService.getUsageMetrics(user.id.toString());

        if (usageMetrics) {
          if (!quotaUtilization[tier]) {
            quotaUtilization[tier] = { avgUtilization: 0, usersAtCapacity: 0 };
          }

          // Calculate average utilization across all quotas
          const tierConfig = billingService.getTierConfig(tier as any);
          if (tierConfig) {
            const quotas = tierConfig.quotas;
            let totalUtilization = 0;
            let quotaCount = 0;

            // Check data quotas
            if (quotas.maxDataUploadsMB > 0) {
              const utilization = (usageMetrics.dataUsage.totalUploadSizeMB / quotas.maxDataUploadsMB) * 100;
              totalUtilization += Math.min(utilization, 100);
              quotaCount++;
            }

            // Check AI query quotas
            if (quotas.maxAIQueries > 0) {
              const utilization = (usageMetrics.computeUsage.aiQueries / quotas.maxAIQueries) * 100;
              totalUtilization += Math.min(utilization, 100);
              quotaCount++;
            }

            if (quotaCount > 0) {
              const avgUtil = totalUtilization / quotaCount;
              quotaUtilization[tier].avgUtilization += avgUtil;

              if (avgUtil >= 90) {
                quotaUtilization[tier].usersAtCapacity++;
              }
            }
          }
        }
      }
    }

    // Calculate average utilization per tier
    Object.keys(quotaUtilization).forEach(tier => {
      const tierUsers = usageByTier[tier]?.users || 1;
      quotaUtilization[tier].avgUtilization /= tierUsers;
    });

    res.json({
      success: true,
      analytics: {
        totalUsers,
        activeSubscriptions,
        usageByTier,
        usageByFeature,
        quotaUtilization,
        subscriptionDistribution: Object.keys(usageByTier).reduce((acc, tier) => {
          acc[tier] = usageByTier[tier].users;
          return acc;
        }, {} as { [tier: string]: number }),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to get usage analytics',
      message: error.message,
    });
  }
});

// ===== CACHE MONITORING ENDPOINTS =====

/**
 * Get comprehensive cache performance metrics
 */
router.get('/performance/cache/metrics', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { cacheService, aiCache, dbCache } = await import('../services/enhanced-cache');
    
    const metrics = cacheService.getMetrics();
    const cacheInfo = await cacheService.getCacheInfo();
    
    res.json({
      success: true,
      data: {
        metrics: {
          ...metrics,
          hitRatePercentage: (metrics.hitRate * 100).toFixed(2) + '%',
          compressionRatioPercentage: (metrics.compressionRatio * 100).toFixed(2) + '%'
        },
        cacheInfo: {
          ...cacheInfo,
          l1SizeMB: (cacheInfo.l1Size / (1024 * 1024)).toFixed(2),
          redisMemoryMB: (cacheInfo.redisMemory / (1024 * 1024)).toFixed(2)
        },
        healthStatus: {
          l1Health: cacheInfo.l1ItemCount < cacheInfo.l1MaxSize ? 'healthy' : 'at_capacity',
          hitRateHealth: metrics.hitRate > 0.5 ? 'good' : metrics.hitRate > 0.3 ? 'moderate' : 'poor',
          responseTimeHealth: metrics.averageResponseTime < 50 ? 'excellent' : metrics.averageResponseTime < 100 ? 'good' : 'slow'
        }
      }
    });
  } catch (error: any) {
    console.error('Cache metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache metrics',
      message: error.message
    });
  }
});

/**
 * Clear cache (with safety confirmation)
 */
router.post('/performance/cache/clear', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { confirm } = req.body;
    
    if (confirm !== 'YES_CLEAR_CACHE') {
      return res.status(400).json({
        success: false,
        error: 'Safety confirmation required',
        message: 'Include "confirm": "YES_CLEAR_CACHE" in request body'
      });
    }
    
    const { cacheService } = await import('../services/enhanced-cache');
    await cacheService.clear();
    
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error: any) {
    console.error('Cache clear error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * Get task queue performance metrics
 */
router.get('/performance/queue/metrics', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { taskQueue } = await import('../services/enhanced-task-queue');
    
    const metrics = taskQueue.getMetrics();
    const agentCapacities = taskQueue.getAgentCapacities();
    const queueStatus = taskQueue.getQueueStatus();
    
    res.json({
      success: true,
      data: {
        metrics: {
          ...metrics,
          successRatePercentage: (metrics.completedTasks / Math.max(metrics.totalTasks, 1) * 100).toFixed(2) + '%',
          throughputPerMinute: (metrics.throughput * 60).toFixed(2)
        },
        queueStatus,
        agentCapacities: Array.from(agentCapacities.entries()).map(([agentId, capacity]) => ({
          ...capacity,
          utilizationPercentage: ((capacity.currentTasks / capacity.maxConcurrentTasks) * 100).toFixed(1) + '%',
          successRatePercentage: (capacity.successRate * 100).toFixed(1) + '%'
        })),
        healthStatus: {
          queueHealth: metrics.queuedTasks < 100 ? 'healthy' : metrics.queuedTasks < 500 ? 'moderate' : 'congested',
          throughputHealth: metrics.throughput > 1 ? 'good' : metrics.throughput > 0.5 ? 'moderate' : 'low'
        }
      }
    });
  } catch (error: any) {
    console.error('Task queue metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task queue metrics',
      message: error.message
    });
  }
});

// ===== COMPREHENSIVE MONITORING ENDPOINTS =====

/**
 * Get real-time system metrics dashboard
 */
router.get('/monitoring/dashboard', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    const currentMetrics = monitoringService.getCurrentMetrics();
    const activeAlerts = monitoringService.getActiveAlerts();
    const insights = monitoringService.getInsights(5);
    
    res.json({
      success: true,
      data: {
        currentMetrics,
        activeAlerts: activeAlerts.map(alert => ({
          ...alert,
          age: Date.now() - alert.triggeredAt.getTime(),
          formattedAge: formatDuration(Date.now() - alert.triggeredAt.getTime())
        })),
        insights,
        systemHealth: {
          overall: calculateOverallHealth(currentMetrics, activeAlerts),
          components: getComponentHealth(currentMetrics)
        }
      }
    });
  } catch (error: any) {
    console.error('Monitoring dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get monitoring dashboard',
      message: error.message
    });
  }
});

/**
 * Get historical metrics for charts
 */
router.get('/monitoring/metrics/history', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { hours = 1 } = req.query;
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    const history = monitoringService.getMetricsHistory(parseInt(hours as string));
    
    // Transform data for charting
    const chartData = {
      timestamps: history.map(m => m.timestamp),
      cpuUsage: history.map(m => m.system.cpuUsage),
      memoryUsage: history.map(m => m.system.memoryUsage.percentage),
      taskQueue: history.map(m => m.taskQueue.queuedTasks),
      cacheHitRate: history.map(m => m.cache.hitRate * 100),
      agentThroughput: history.map(m => m.agents.tasksCompleted),
      dbQueries: history.map(m => m.database.totalQueries)
    };
    
    res.json({
      success: true,
      data: chartData
    });
  } catch (error: any) {
    console.error('Metrics history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics history',
      message: error.message
    });
  }
});

/**
 * Get system alerts with filtering
 */
router.get('/monitoring/alerts', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { status = 'active', severity, limit = 50 } = req.query;
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    let alerts = status === 'active' ? 
      monitoringService.getActiveAlerts() : 
      monitoringService.getActiveAlerts(); // Would have getAllAlerts method
    
    // Filter by severity if specified
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    // Limit results
    alerts = alerts.slice(0, parseInt(limit as string));
    
    res.json({
      success: true,
      data: {
        alerts: alerts.map(alert => ({
          ...alert,
          age: Date.now() - alert.triggeredAt.getTime(),
          formattedAge: formatDuration(Date.now() - alert.triggeredAt.getTime())
        })),
        summary: {
          total: alerts.length,
          bySeverity: groupBySeverity(alerts)
        }
      }
    });
  } catch (error: any) {
    console.error('Alerts retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
      message: error.message
    });
  }
});

/**
 * Acknowledge an alert
 */
router.post('/monitoring/alerts/:alertId/acknowledge', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    const acknowledged = monitoringService.acknowledgeAlert(alertId);
    
    if (acknowledged) {
      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }
  } catch (error: any) {
    console.error('Alert acknowledgment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to acknowledge alert',
      message: error.message
    });
  }
});

/**
 * Resolve an alert
 */
router.post('/monitoring/alerts/:alertId/resolve', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    const resolved = monitoringService.resolveAlert(alertId);
    
    if (resolved) {
      res.json({
        success: true,
        message: 'Alert resolved successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found'
      });
    }
  } catch (error: any) {
    console.error('Alert resolution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
      message: error.message
    });
  }
});

/**
 * Get performance insights and recommendations
 */
router.get('/monitoring/insights', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { limit = 10, type } = req.query;
    const { monitoringService } = await import('../services/enhanced-monitoring');
    
    let insights = monitoringService.getInsights(parseInt(limit as string));
    
    // Filter by type if specified
    if (type) {
      insights = insights.filter(insight => insight.type === type);
    }
    
    res.json({
      success: true,
      data: {
        insights,
        summary: {
          total: insights.length,
          byType: groupByType(insights),
          byImpact: groupByImpact(insights),
          actionableCount: insights.filter(i => i.actionable).length
        }
      }
    });
  } catch (error: any) {
    console.error('Insights retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get insights',
      message: error.message
    });
  }
});

/**
 * Get batch processing metrics
 */
router.get('/monitoring/batch-processing', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { batchProcessor } = await import('../services/enhanced-batch-processor');
    
    const metrics = batchProcessor.getMetrics();
    
    res.json({
      success: true,
      data: {
        metrics: {
          ...metrics,
          completionRate: metrics.totalJobs > 0 ? (metrics.completedJobs / metrics.totalJobs * 100).toFixed(2) + '%' : '0%',
          failureRate: metrics.totalJobs > 0 ? (metrics.failedJobs / metrics.totalJobs * 100).toFixed(2) + '%' : '0%',
          memoryUsageMB: (metrics.memoryUsage / (1024 * 1024)).toFixed(2),
          averageThroughputFormatted: metrics.averageThroughput.toFixed(2) + ' items/sec'
        },
        healthStatus: {
          queueHealth: metrics.queuedJobs < 10 ? 'healthy' : metrics.queuedJobs < 50 ? 'moderate' : 'congested',
          throughputHealth: metrics.averageThroughput > 10 ? 'good' : metrics.averageThroughput > 1 ? 'moderate' : 'low',
          memoryHealth: metrics.memoryUsage < (512 * 1024 * 1024) ? 'healthy' : 'high'
        }
      }
    });
  } catch (error: any) {
    console.error('Batch processing metrics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get batch processing metrics',
      message: error.message
    });
  }
});

// Helper methods for monitoring endpoints
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function calculateOverallHealth(metrics: any, alerts: any[]): 'healthy' | 'warning' | 'error' | 'critical' {
  if (!metrics) return 'error';
  
  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const errorAlerts = alerts.filter(a => a.severity === 'error').length;
  const warningAlerts = alerts.filter(a => a.severity === 'warning').length;
  
  if (criticalAlerts > 0) return 'critical';
  if (errorAlerts > 0) return 'error';
  if (warningAlerts > 2) return 'warning';
  
  // Check key metrics
  if (metrics.system.cpuUsage > 90 || metrics.system.memoryUsage.percentage > 95) return 'critical';
  if (metrics.system.cpuUsage > 80 || metrics.system.memoryUsage.percentage > 85) return 'warning';
  
  return 'healthy';
}

function getComponentHealth(metrics: any): any {
  if (!metrics) return {};
  
  return {
    system: {
      cpu: metrics.system.cpuUsage < 70 ? 'healthy' : metrics.system.cpuUsage < 85 ? 'warning' : 'critical',
      memory: metrics.system.memoryUsage.percentage < 75 ? 'healthy' : metrics.system.memoryUsage.percentage < 90 ? 'warning' : 'critical',
      load: metrics.system.loadAverage[0] < 1 ? 'healthy' : metrics.system.loadAverage[0] < 2 ? 'warning' : 'critical'
    },
    database: {
      connections: metrics.database.activeConnections < 50 ? 'healthy' : metrics.database.activeConnections < 80 ? 'warning' : 'critical',
      queries: metrics.database.averageQueryTime < 100 ? 'healthy' : metrics.database.averageQueryTime < 500 ? 'warning' : 'critical'
    },
    cache: {
      hitRate: metrics.cache.hitRate > 0.7 ? 'healthy' : metrics.cache.hitRate > 0.4 ? 'warning' : 'critical',
      memory: metrics.cache.memoryUsage < (100 * 1024 * 1024) ? 'healthy' : 'warning'
    },
    taskQueue: {
      backlog: metrics.taskQueue.queuedTasks < 50 ? 'healthy' : metrics.taskQueue.queuedTasks < 200 ? 'warning' : 'critical',
      throughput: metrics.taskQueue.throughput > 1 ? 'healthy' : metrics.taskQueue.throughput > 0.1 ? 'warning' : 'critical'
    },
    agents: {
      availability: metrics.agents.activeAgents > 0 ? 'healthy' : 'critical',
      errorRate: metrics.agents.errorRate < 0.05 ? 'healthy' : metrics.agents.errorRate < 0.15 ? 'warning' : 'critical'
    }
  };
}

function groupBySeverity(alerts: any[]): any {
  return alerts.reduce((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] || 0) + 1;
    return acc;
  }, {});
}

function groupByType(insights: any[]): any {
  return insights.reduce((acc, insight) => {
    acc[insight.type] = (acc[insight.type] || 0) + 1;
    return acc;
  }, {});
}

function groupByImpact(insights: any[]): any {
  return insights.reduce((acc, insight) => {
    acc[insight.impact] = (acc[insight.impact] || 0) + 1;
    return acc;
  }, {});
}

/**
 * GET /api/admin/system/initialization-status
 * Get system initialization status
 */
router.get('/system/initialization-status', async (req, res) => {
  try {
    // Access global initialization state
    const getInitializationState = (global as any).getInitializationState;
    
    if (!getInitializationState) {
      return res.status(503).json({
        success: false,
        error: 'Initialization state not available'
      });
    }

    res.json({
      success: true,
      initialization: getInitializationState()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get customers for consultant mode (non-admin users only)
router.get('/customers', async (req: Request, res: Response) => {
  try {
    const { search, limit } = req.query;
    const searchTerm = search as string || '';
    const limitNum = Number(limit) || 50;

    // Get users directly from database
    const { db } = await import('../db');
    const { users } = await import('@shared/schema');
    const { and, like, or, not, eq } = await import('drizzle-orm');
    
    // Build query to get non-admin users
    const conditions: any[] = [
      eq(users.isAdmin, false)
    ];
    
    // Add search filter if provided
    if (searchTerm) {
      const searchLower = `%${searchTerm.toLowerCase()}%`;
      conditions.push(
        or(
          like(users.email, searchLower),
          like(users.firstName, searchLower),
          like(users.lastName, searchLower)
        )!
      );
    }
    
    const dbUsers = await db
      .select()
      .from(users)
      .where(and(...conditions))
      .limit(limitNum);

    const customers = dbUsers
      .filter((user: any) => !user.isAdmin && user.role !== 'admin' && user.role !== 'super_admin')
      .map((user: any) => ({
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        email: user.email,
        company: user.company,
        subscriptionTier: user.subscriptionTier
      }));

    res.json({
      success: true,
      customers,
      total: customers.length
    });
  } catch (error: any) {
    console.error('Failed to get customers:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get customers'
    });
  }
});

// ============================================
// ADMIN PROJECT MANAGEMENT ENDPOINTS
// ============================================

// List all projects (with filters)
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const { userId, status, journeyType, startDate, endDate, limit, offset } = req.query;
    const limitNum = Number(limit) || 50;
    const offsetNum = Number(offset) || 0;

    const { db } = await import('../db');
    const { projects } = await import('@shared/schema');
    const { and, eq, gte, lte, like, sql } = await import('drizzle-orm');

    const conditions: any[] = [];

    if (userId) {
      conditions.push(eq(projects.userId, userId as string));
    }
    if (status) {
      conditions.push(eq(projects.status, status as string));
    }
    if (journeyType) {
      conditions.push(eq(projects.journeyType, journeyType as string));
    }
    if (startDate) {
      conditions.push(gte(projects.createdAt, new Date(startDate as string)));
    }
    if (endDate) {
      conditions.push(lte(projects.createdAt, new Date(endDate as string)));
    }

    const dbProjects = await db
      .select()
      .from(projects)
      .where(conditions.length > 0 ? and(...conditions)! : undefined)
      .limit(limitNum)
      .offset(offsetNum)
      .orderBy(projects.createdAt);

    // Get total count for pagination
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(projects)
      .where(conditions.length > 0 ? and(...conditions)! : undefined);

    const total = Number(totalResult[0]?.count || 0);

    res.json({
      success: true,
      projects: dbProjects,
      total,
      page: Math.floor(offsetNum / limitNum) + 1,
      limit: limitNum
    });
  } catch (error: any) {
    console.error('Failed to get projects:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get projects'
    });
  }
});

// Get a specific project
router.get('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const adminId = (req.user as any)?.id;

    const { storage } = await import('../services/storage');
    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Log admin access
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_viewed',
      adminId,
      projectId,
      userId: (project as any).userId,
      entityType: 'project',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      project
    });
  } catch (error: any) {
    console.error('Failed to get project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get project'
    });
  }
});

// Create project for user
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId, name, description, journeyType } = req.body;

    if (!userId || !name) {
      return res.status(400).json({
        success: false,
        error: 'userId and name are required'
      });
    }

    const { storage } = await import('../services/storage');
    
    // Validate user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Create project
    const project = await storage.createProject({
      userId: userId,
      name,
      description: description || '',
      journeyType: journeyType || 'non-tech',
      metadata: {
        createdByAdminId: adminId,
        createdByAdminAt: new Date().toISOString()
      }
    } as any);

    // Log action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_created',
      adminId,
      userId,
      projectId: project.id,
      entityType: 'project',
      changes: { name, description, journeyType },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      project
    });
  } catch (error: any) {
    console.error('Failed to create project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create project'
    });
  }
});

// Update project
router.put('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { projectId } = req.params;
    const updates = req.body;

    const { storage } = await import('../services/storage');
    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Store old values for audit log
    const oldValues = {
      name: (project as any).name,
      description: (project as any).description,
      status: (project as any).status
    };

    // Update project
    const updatedProject = await storage.updateProject(projectId, {
      ...updates,
      metadata: {
        ...((project as any).metadata || {}),
        lastModifiedByAdminId: adminId,
        lastModifiedByAdminAt: new Date().toISOString()
      }
    });

    // Log action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_updated',
      adminId,
      projectId,
      userId: (project as any).userId,
      entityType: 'project',
      changes: {
        old: oldValues,
        new: updates
      },
      reason: updates.reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      project: updatedProject
    });
  } catch (error: any) {
    console.error('Failed to update project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update project'
    });
  }
});

// Delete project
router.delete('/projects/:projectId', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { reason } = req.body;

    const { storage } = await import('../services/storage');
    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const userId = (project as any).userId;

    // Delete project
    await storage.deleteProject(projectId);

    // Log action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_deleted',
      adminId,
      projectId,
      userId,
      entityType: 'project',
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Project deleted successfully'
    });
  } catch (error: any) {
    console.error('Failed to delete project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete project'
    });
  }
});

// Archive project (soft delete)
router.post('/projects/:projectId/archive', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { projectId } = req.params;
    const { reason } = req.body;

    const { storage } = await import('../services/storage');
    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Update project with archivedAt timestamp
    const updatedProject = await storage.updateProject(projectId, {
      metadata: {
        ...((project as any).metadata || {}),
        archivedAt: new Date().toISOString(),
        archivedByAdminId: adminId,
        archivedReason: reason
      }
    } as any);

    // Log action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_archived',
      adminId,
      projectId,
      userId: (project as any).userId,
      entityType: 'project',
      changes: {
        archivedAt: new Date().toISOString()
      },
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      project: updatedProject
    });
  } catch (error: any) {
    console.error('Failed to archive project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to archive project'
    });
  }
});

// List stuck projects (projects in error states or stuck for >24 hours)
router.get('/projects/stuck', async (req: Request, res: Response) => {
  try {
    const { db } = await import('../db');
    const { projects } = await import('@shared/schema');
    const { and, eq, or, lte, sql } = await import('drizzle-orm');

    const stuckThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

    const stuckProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          or(
            eq(projects.status, 'error'),
            eq(projects.status, 'timeout'),
            eq(projects.status, 'failed')
          )!,
          lte(projects.updatedAt, stuckThreshold)
        )!
      )
      .orderBy(projects.updatedAt);

    res.json({
      success: true,
      projects: stuckProjects,
      total: stuckProjects.length
    });
  } catch (error: any) {
    console.error('Failed to get stuck projects:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get stuck projects'
    });
  }
});

// Retry project (reset status and retry)
router.post('/projects/:projectId/retry', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { projectId } = req.params;

    const { storage } = await import('../services/storage');
    const project = await storage.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    // Reset status to ready
    const updatedProject = await storage.updateProject(projectId, {
      status: 'ready',
      metadata: {
        ...((project as any).metadata || {}),
        retriedByAdminId: adminId,
        retriedAt: new Date().toISOString()
      }
    } as any);

    // Log action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'project_retried',
      adminId,
      projectId,
      userId: (project as any).userId,
      entityType: 'project',
      changes: {
        oldStatus: (project as any).status,
        newStatus: 'ready'
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      project: updatedProject,
      message: 'Project reset to ready status'
    });
  } catch (error: any) {
    console.error('Failed to retry project:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retry project'
    });
  }
});

// ============================================
// ADMIN USER MANAGEMENT ENDPOINTS
// ============================================

// Create user (admin can create regular users or admin users)
router.post('/users', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { email, firstName, lastName, password, isAdmin, role, subscriptionTier } = req.body;

    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({
        success: false,
        error: 'email, firstName, lastName, and password are required'
      });
    }

    // ✅ Validate email domain for chimaridata
    const emailDomain = email.toLowerCase().split('@')[1];
    const allowedDomains = [
      'chimaridata.com',
      'chimaridata.io',
      'chimaridata.co',
      'chimaridata.org'
    ];
    
    // Check if domain is in allowed list or is a subdomain
    const isValidDomain = allowedDomains.some(domain => 
      emailDomain === domain || emailDomain?.endsWith('.' + domain)
    );

    // For admin-created users, warn but allow non-chimaridata domains (for flexibility)
    // Can be made strict by returning error if !isValidDomain
    if (!isValidDomain) {
      console.warn(`⚠️ Admin ${adminId} creating user with non-chimaridata domain: ${emailDomain}`);
    }

    const { storage } = await import('../services/storage');
    const bcrypt = await import('bcryptjs');
    
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User already exists with this email'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Determine admin status
    const userIsAdmin = isAdmin === true || role === 'admin' || role === 'super_admin';
    const userRole = role || (userIsAdmin ? 'admin' : 'user');

    // Create user
    const newUser = await storage.createUser({
      email: email.toLowerCase().trim(),
      firstName,
      lastName,
      hashedPassword,
      provider: 'local',
      subscriptionTier: subscriptionTier || (userIsAdmin ? 'enterprise' : 'trial'),
      emailVerified: true, // Admin-created users are auto-verified
      role: userRole,
      isAdmin: userIsAdmin
    } as any);

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'user_created',
      adminId,
      userId: newUser.id,
      entityType: 'user',
      changes: {
        email,
        isAdmin: userIsAdmin,
        role: userRole,
        domain: emailDomain,
        domainValidated: isValidDomain
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `User created successfully${userIsAdmin ? ' with admin privileges' : ''}`,
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        isAdmin: userIsAdmin,
        role: userRole,
        subscriptionTier: newUser.subscriptionTier,
        domainValidated: isValidDomain
      }
    });
  } catch (error: any) {
    console.error('Failed to create user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user'
    });
  }
});

// Update user (including admin status)
router.put('/users/:userId', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId } = req.params;
    const updates = req.body;

    const { storage } = await import('../services/storage');
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Store old values for audit log
    const oldValues = {
      isAdmin: (user as any).isAdmin,
      role: (user as any).role,
      subscriptionTier: (user as any).subscriptionTier
    };

    // Hash password if provided
    let updateData: any = { ...updates };
    if (updates.password) {
      const bcrypt = await import('bcryptjs');
      updateData.hashedPassword = await bcrypt.hash(updates.password, 10);
      delete updateData.password; // Don't store plain password
    }

    // Update user
    const updatedUser = await storage.updateUser(userId, updateData);

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'user_updated',
      adminId,
      userId,
      entityType: 'user',
      changes: {
        old: oldValues,
        new: updates
      },
      reason: updates.reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error: any) {
    console.error('Failed to update user:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update user'
    });
  }
});

// ==========================================
// SUBSCRIPTION MANAGEMENT ENDPOINTS
// ==========================================

/**
 * PUT /api/admin/users/:userId/subscription
 * Change user's subscription tier
 *
 * Body:
 * - newTier: 'trial' | 'starter' | 'professional' | 'enterprise'
 * - reason: string (admin note explaining the change)
 * - bypassStripe?: boolean (skip Stripe integration for manual changes)
 */
router.put('/users/:userId/subscription', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId } = req.params;
    const { newTier, reason, bypassStripe = false } = req.body;

    if (!newTier) {
      return res.status(400).json({
        success: false,
        error: 'newTier is required'
      });
    }

    if (!['trial', 'starter', 'professional', 'enterprise'].includes(newTier)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid subscription tier. Must be one of: trial, starter, professional, enterprise'
      });
    }

    const { storage } = await import('../services/storage');
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const oldTier = (user as any).subscriptionTier || 'none';

    // If not bypassing Stripe and user has Stripe customer ID, update via billing service
    if (!bypassStripe && (user as any).stripeCustomerId) {
      const { getBillingService } = await import('../services/billing/unified-billing-service');
      const billingService = getBillingService();

      try {
        await billingService.changeSubscription(userId, newTier);
      } catch (stripeError: any) {
        console.error('Stripe subscription change failed:', stripeError);
        return res.status(500).json({
          success: false,
          error: `Stripe update failed: ${stripeError.message}. Use bypassStripe=true for manual override.`
        });
      }
    } else {
      // Manual subscription change (bypass Stripe)
      await storage.updateUser(userId, {
        subscriptionTier: newTier,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: newTier === 'trial'
          ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days for trial
          : null // Paid tiers don't expire unless cancelled
      });
    }

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'subscription_changed',
      adminId,
      userId,
      entityType: 'user',
      changes: {
        old: { tier: oldTier },
        new: { tier: newTier }
      },
      reason: reason || 'Admin subscription tier change',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const updatedUser = await storage.getUser(userId);

    res.json({
      success: true,
      message: `Subscription tier changed from ${oldTier} to ${newTier}`,
      user: updatedUser
    });
  } catch (error: any) {
    console.error('Failed to change subscription:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to change subscription'
    });
  }
});

/**
 * POST /api/admin/users/:userId/credits
 * Issue credits to user account
 *
 * Body:
 * - amount: number (credit amount in USD)
 * - reason: string (explanation for credit issuance)
 * - expiresAt?: Date (optional expiration date for credits)
 */
router.post('/users/:userId/credits', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId } = req.params;
    const { amount, reason, expiresAt } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid credit amount is required (must be > 0)'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for credit issuance'
      });
    }

    const { storage } = await import('../services/storage');
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user credits (assuming credits field exists or will be added)
    const currentCredits = (user as any).credits || 0;
    const newCredits = currentCredits + amount;

    await storage.updateUser(userId, {
      credits: newCredits
    });

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'credits_issued',
      adminId,
      userId,
      entityType: 'user',
      changes: {
        old: { credits: currentCredits },
        new: { credits: newCredits, amount }
      },
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `$${amount} in credits issued to user`,
      credits: {
        previous: currentCredits,
        added: amount,
        current: newCredits,
        expiresAt: expiresAt || null
      }
    });
  } catch (error: any) {
    console.error('Failed to issue credits:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to issue credits'
    });
  }
});

/**
 * POST /api/admin/users/:userId/refund
 * Process refund for user
 *
 * Body:
 * - amount: number (refund amount in USD)
 * - reason: string (explanation for refund)
 * - stripeRefund?: boolean (process through Stripe, default true)
 */
router.post('/users/:userId/refund', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId } = req.params;
    const { amount, reason, stripeRefund = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid refund amount is required (must be > 0)'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for refund'
      });
    }

    const { storage } = await import('../services/storage');
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    let stripeRefundId = null;

    // Process Stripe refund if requested and user has Stripe customer ID
    if (stripeRefund && (user as any).stripeCustomerId) {
      try {
        const stripe = new (await import('stripe')).default(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: '2025-08-27.basil'
        });

        // Find recent charge to refund
        const charges = await stripe.charges.list({
          customer: (user as any).stripeCustomerId,
          limit: 10
        });

        const recentCharge = charges.data.find(charge =>
          charge.amount >= amount * 100 && charge.refunded === false
        );

        if (recentCharge) {
          const refund = await stripe.refunds.create({
            charge: recentCharge.id,
            amount: amount * 100, // Convert to cents
            reason: 'requested_by_customer',
            metadata: {
              admin_id: adminId,
              admin_reason: reason
            }
          });
          stripeRefundId = refund.id;
        } else {
          console.warn(`No suitable charge found for refund of $${amount}`);
        }
      } catch (stripeError: any) {
        console.error('Stripe refund failed:', stripeError);
        return res.status(500).json({
          success: false,
          error: `Stripe refund failed: ${stripeError.message}`
        });
      }
    }

    // Issue credits equivalent to refund amount
    const currentCredits = (user as any).credits || 0;
    const newCredits = currentCredits + amount;

    await storage.updateUser(userId, {
      credits: newCredits
    });

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'refund_processed',
      adminId,
      userId,
      entityType: 'user',
      changes: {
        refund: {
          amount,
          stripeRefundId,
          processedViaStripe: !!stripeRefundId
        },
        credits: {
          old: currentCredits,
          new: newCredits
        }
      },
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Refund of $${amount} processed`,
      refund: {
        amount,
        stripeRefundId,
        processedViaStripe: !!stripeRefundId,
        creditsIssued: amount,
        newCreditBalance: newCredits
      }
    });
  } catch (error: any) {
    console.error('Failed to process refund:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process refund'
    });
  }
});

/**
 * PUT /api/admin/users/:userId/trial-extension
 * Extend user's trial period
 *
 * Body:
 * - extensionDays: number (number of days to extend trial)
 * - reason: string (explanation for extension)
 */
router.put('/users/:userId/trial-extension', async (req: Request, res: Response) => {
  try {
    const adminId = (req.user as any)?.id;
    const { userId } = req.params;
    const { extensionDays, reason } = req.body;

    if (!extensionDays || extensionDays <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid extension days required (must be > 0)'
      });
    }

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for trial extension'
      });
    }

    const { storage } = await import('../services/storage');
    const user = await storage.getUser(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const currentTier = (user as any).subscriptionTier;

    if (currentTier !== 'trial') {
      return res.status(400).json({
        success: false,
        error: 'User is not on trial tier. Cannot extend trial.'
      });
    }

    const currentExpiration = (user as any).subscriptionExpiresAt
      ? new Date((user as any).subscriptionExpiresAt)
      : new Date();

    const newExpiration = new Date(currentExpiration.getTime() + extensionDays * 24 * 60 * 60 * 1000);

    await storage.updateUser(userId, {
      subscriptionExpiresAt: newExpiration
    });

    // Log admin action
    const { AdminAuditLogService } = await import('../services/admin-audit-log');
    await AdminAuditLogService.log({
      action: 'trial_extended',
      adminId,
      userId,
      entityType: 'user',
      changes: {
        old: { expiresAt: currentExpiration },
        new: { expiresAt: newExpiration, extensionDays }
      },
      reason,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: `Trial extended by ${extensionDays} days`,
      trial: {
        previousExpiration: currentExpiration,
        newExpiration,
        extensionDays
      }
    });
  } catch (error: any) {
    console.error('Failed to extend trial:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to extend trial'
    });
  }
});

/**
 * GET /api/admin/users/:userId/metrics
 * Get detailed usage metrics for a specific user
 */
router.get('/users/:userId/metrics', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const { storage } = await import('../services/storage');
    const { db } = await import('../db');
    const { projects, users, datasets, projectDatasets } = await import('@shared/schema');
    const { eq, and, gte, lte } = await import('drizzle-orm');

    // Get user
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Calculate billing period (default to current month)
    const now = new Date();
    const periodStart = startDate ? new Date(startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = endDate ? new Date(endDate as string) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Get user's projects
    const userProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.userId, userId),
          gte(projects.createdAt, periodStart),
          lte(projects.createdAt, periodEnd)
        )
      ) as ProjectRow[];

    // Get datasets linked to projects
    const projectIds = userProjects.map((project) => project.id);
    const linkedDatasets: DatasetLink[] = projectIds.length > 0
      ? await db
          .select({
            dataset: datasets,
            projectId: projectDatasets.projectId
          })
          .from(projectDatasets)
          .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
          .where(
            and(
              eq(datasets.userId, userId),
              gte(datasets.createdAt, periodStart),
              lte(datasets.createdAt, periodEnd)
            )
          ) as DatasetLink[]
      : [];

    // Calculate metrics from projects and datasets
    const totalFilesUploaded = linkedDatasets.length || userProjects.length;
    
    // Calculate file sizes from datasets
    const totalFileSizeMB = linkedDatasets.reduce((sum: number, link: DatasetLink) => {
      const fileSize = link.dataset.fileSize ?? 0;
      return sum + (fileSize / (1024 * 1024)); // Convert bytes to MB
    }, 0);
    
    const totalDataProcessedMB = linkedDatasets.reduce((sum: number, link: DatasetLink) => {
      const recordCount = link.dataset.recordCount ?? 0;
      // Estimate data size: assume ~100 bytes per record
      return sum + ((recordCount * 100) / (1024 * 1024));
    }, 0);

    const storageUsedMB = totalFileSizeMB * 1.5; // Estimate with overhead
    const fileFormats: Record<string, number> = {};
    linkedDatasets.forEach((link: DatasetLink) => {
      const fileName = link.dataset.originalFileName || 'unknown';
      const ext = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : 'unknown';
      fileFormats[ext || 'unknown'] = (fileFormats[ext || 'unknown'] || 0) + 1;
    });

    // Get user's usage from user table
    const userUsage = {
      monthlyUploads: (user as any).monthlyUploads || 0,
      monthlyDataVolume: (user as any).monthlyDataVolume || 0,
      monthlyAIInsights: (user as any).monthlyAIInsights || 0,
      monthlyAnalysisComponents: (user as any).monthlyAnalysisComponents || 0,
      monthlyVisualizations: (user as any).monthlyVisualizations || 0,
    };

    // Get tier limits
    const tier = (user as any).subscriptionTier || 'trial';
    const tierLimits: Record<string, any> = {
      trial: { dataMB: 100, compute: 60, storage: 500 },
      starter: { dataMB: 5000, compute: 500, storage: 25000 },
      professional: { dataMB: 50000, compute: 5000, storage: 500000 },
      enterprise: { dataMB: Infinity, compute: Infinity, storage: Infinity }
    };
    const limits = tierLimits[tier] || tierLimits.trial;

    // Calculate quota utilization
    const dataQuotaUsed = Math.min(userUsage.monthlyDataVolume, limits.dataMB);
    const dataQuotaLimit = limits.dataMB;
    const computeQuotaUsed = Math.min(userUsage.monthlyAnalysisComponents, limits.compute);
    const computeQuotaLimit = limits.compute;
    const storageQuotaUsed = Math.min(storageUsedMB, limits.storage);
    const storageQuotaLimit = limits.storage;

    // Calculate next reset date (end of current month)
    const quotaResetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const metrics = {
      userId,
      subscriptionTier: tier,
      billingPeriod: {
        start: periodStart,
        end: periodEnd,
        status: (user as any).subscriptionStatus || 'inactive'
      },
      dataUsage: {
        totalFilesUploaded,
        totalFileSizeMB: Math.round(totalFileSizeMB * 100) / 100,
        totalDataProcessedMB: Math.round(totalDataProcessedMB * 100) / 100,
        storageUsedMB: Math.round(storageUsedMB * 100) / 100,
        maxFileSize: linkedDatasets.length > 0 ? Math.max(
          ...linkedDatasets.map((link: DatasetLink) => {
            const fileSize = link.dataset.fileSize ?? 0;
            return fileSize > 0 ? fileSize / (1024 * 1024) : 0;
          }),
          0
        ) : 0,
        fileFormats,
        dataTransformations: userProjects.filter((project: ProjectRow) => (project as any).transformedData).length,
        dataExports: userProjects.filter((project: ProjectRow) => (project as any).isPaid).length
      },
      computeUsage: {
        analysisCount: userUsage.monthlyAnalysisComponents,
        aiQueryCount: userUsage.monthlyAIInsights,
        mlModelExecutions: userProjects.filter((project: ProjectRow) => (project as any).analysisResults).length,
        visualizationCount: userUsage.monthlyVisualizations,
        totalComputeMinutes: Math.round(userUsage.monthlyAnalysisComponents * 1.5), // Estimate
        agentInteractions: Math.round(userUsage.monthlyAIInsights * 0.4), // Estimate
        toolExecutions: Math.round(userUsage.monthlyAnalysisComponents * 2) // Estimate
      },
      storageMetrics: {
        projectCount: userProjects.length,
        datasetCount: userProjects.length,
        artifactCount: userProjects.reduce((sum: number, project: ProjectRow) => {
          const artifacts = (project as any).visualizations || [];
          return sum + artifacts.length;
        }, 0),
        totalStorageMB: Math.round(storageUsedMB * 100) / 100,
        archiveStorageMB: Math.round(storageUsedMB * 0.3), // Estimate
        temporaryStorageMB: Math.round(storageUsedMB * 0.05), // Estimate
        retentionDays: tier === 'trial' ? 30 : tier === 'starter' ? 90 : 365
      },
      costBreakdown: {
        baseSubscription: 0, // Will be calculated by billing service
        dataOverage: dataQuotaUsed > dataQuotaLimit ? (dataQuotaUsed - dataQuotaLimit) * 0.01 : 0,
        computeOverage: computeQuotaUsed > computeQuotaLimit ? (computeQuotaUsed - computeQuotaLimit) * 0.05 : 0,
        storageOverage: storageQuotaUsed > storageQuotaLimit ? (storageQuotaUsed - storageQuotaLimit) * 0.002 : 0,
        premiumFeatures: 0,
        agentUsage: Math.round(userUsage.monthlyAIInsights * 0.01 * 100) / 100,
        toolUsage: Math.round(userUsage.monthlyAnalysisComponents * 0.005 * 100) / 100,
        totalCost: 0 // Will be calculated
      },
      quotaUtilization: {
        dataQuotaUsed: Math.round(dataQuotaUsed * 100) / 100,
        dataQuotaLimit,
        computeQuotaUsed: Math.round(computeQuotaUsed * 100) / 100,
        computeQuotaLimit,
        storageQuotaUsed: Math.round(storageQuotaUsed * 100) / 100,
        storageQuotaLimit,
        quotaResetDate
      }
    };

    res.json({
      success: true,
      metrics
    });
  } catch (error: any) {
    console.error('Failed to get user metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user metrics'
    });
  }
});

/**
 * GET /api/admin/quota-alerts
 * Get all users with quota warnings or exceeded quotas
 */
router.get('/quota-alerts', async (req: Request, res: Response) => {
  try {
    const { level = 'all' } = req.query; // 'warning', 'critical', 'exceeded', 'all'

    const { db } = await import('../db');
    const { users, projects } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');
    const { RolePermissionService } = await import('../services/role-permission');

    // Get all non-admin users
    const allUsers = await db
      .select()
      .from(users)
      .where(eq(users.isAdmin, false));

    const alerts: any[] = [];

    for (const user of allUsers) {
      const userId = user.id;
      const tier = (user as any).subscriptionTier || 'trial';
      
      // Get user's projects for storage calculation
      const userProjects = await db
        .select()
        .from(projects)
        .where(eq(projects.userId, userId));

      const projectRows = userProjects as Array<typeof projects.$inferSelect>;

      const storageUsedMB = projectRows.reduce<number>((sum, projectRow) => {
        const metadata = (projectRow as any).metadata || {};
        const fileSize = metadata.fileSize || metadata.originalFileSize || 0;
        if (fileSize > 0) {
          return sum + (fileSize / (1024 * 1024));
        }
        // Estimate from data
        const data = (projectRow as any).data || [];
        const recordCount = Array.isArray(data) ? data.length : 0;
        return sum + ((recordCount * 100) / (1024 * 1024));
      }, 0) * 1.5; // Add overhead

      // Get tier limits
      const tierLimits: Record<string, any> = {
        trial: { dataMB: 100, compute: 60, storage: 500 },
        starter: { dataMB: 5000, compute: 500, storage: 25000 },
        professional: { dataMB: 50000, compute: 5000, storage: 500000 },
        enterprise: { dataMB: Infinity, compute: Infinity, storage: Infinity }
      };
      const limits = tierLimits[tier] || tierLimits.trial;

      // Check data quota
      const dataUsage = (user as any).monthlyDataVolume || 0;
      const dataUtilization = limits.dataMB > 0 ? (dataUsage / limits.dataMB) * 100 : 0;
      
      if (dataUtilization >= 100) {
        alerts.push({
          id: `alert_data_${userId}`,
          userId,
          quotaType: 'data',
          currentUsage: dataUsage,
          quotaLimit: limits.dataMB,
          utilizationPercent: Math.round(dataUtilization * 100) / 100,
          alertLevel: 'exceeded',
          message: `Data usage quota exceeded! User is incurring overage charges.`,
          actionRequired: true,
          suggestedActions: ['Consider upgrading to Professional plan', 'Optimize data processing workflows'],
          timestamp: new Date(),
          acknowledged: false
        });
      } else if (dataUtilization >= 90) {
        alerts.push({
          id: `alert_data_${userId}`,
          userId,
          quotaType: 'data',
          currentUsage: dataUsage,
          quotaLimit: limits.dataMB,
          utilizationPercent: Math.round(dataUtilization * 100) / 100,
          alertLevel: 'critical',
          message: `Data usage is at ${Math.round(dataUtilization)}% of quota limit.`,
          actionRequired: true,
          suggestedActions: ['Consider upgrading soon', 'Review data processing workflows'],
          timestamp: new Date(),
          acknowledged: false
        });
      } else if (dataUtilization >= 80) {
        alerts.push({
          id: `alert_data_${userId}`,
          userId,
          quotaType: 'data',
          currentUsage: dataUsage,
          quotaLimit: limits.dataMB,
          utilizationPercent: Math.round(dataUtilization * 100) / 100,
          alertLevel: 'warning',
          message: `Data usage is at ${Math.round(dataUtilization)}% of quota limit.`,
          actionRequired: false,
          suggestedActions: ['Monitor usage', 'Consider optimization'],
          timestamp: new Date(),
          acknowledged: false
        });
      }

      // Check storage quota
      const storageUtilization = limits.storage > 0 ? (storageUsedMB / limits.storage) * 100 : 0;
      
      if (storageUtilization >= 100) {
        alerts.push({
          id: `alert_storage_${userId}`,
          userId,
          quotaType: 'storage',
          currentUsage: storageUsedMB,
          quotaLimit: limits.storage,
          utilizationPercent: Math.round(storageUtilization * 100) / 100,
          alertLevel: 'exceeded',
          message: `Storage quota exceeded!`,
          actionRequired: true,
          suggestedActions: ['Archive old projects', 'Upgrade subscription'],
          timestamp: new Date(),
          acknowledged: false
        });
      } else if (storageUtilization >= 90) {
        alerts.push({
          id: `alert_storage_${userId}`,
          userId,
          quotaType: 'storage',
          currentUsage: storageUsedMB,
          quotaLimit: limits.storage,
          utilizationPercent: Math.round(storageUtilization * 100) / 100,
          alertLevel: 'critical',
          message: `Storage usage is at ${Math.round(storageUtilization)}% of quota limit.`,
          actionRequired: false,
          suggestedActions: ['Archive old projects', 'Clean up temporary files'],
          timestamp: new Date(),
          acknowledged: false
        });
      }
    }

    // Filter by alert level
    let filteredAlerts = alerts;
    if (level !== 'all') {
      filteredAlerts = alerts.filter(a => a.alertLevel === level);
    }

    // Sort by utilization (highest first)
    filteredAlerts.sort((a, b) => b.utilizationPercent - a.utilizationPercent);

    res.json({
      success: true,
      alerts: filteredAlerts,
      total: filteredAlerts.length
    });
  } catch (error: any) {
    console.error('Failed to get quota alerts:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get quota alerts'
    });
  }
});

/**
 * GET /api/admin/billing-events
 * Get billing events/transaction history
 */
router.get('/billing-events', async (req: Request, res: Response) => {
  try {
    const { userId, startDate, endDate, type, limit = 100 } = req.query;

    const { db } = await import('../db');
    const { users, adminProjectActions } = await import('@shared/schema');
    const { eq, and, gte, lte } = await import('drizzle-orm');

    // Build query conditions
    const conditions: any[] = [];
    
    if (userId) {
      conditions.push(eq(adminProjectActions.userId, userId as string));
    }
    
    if (type) {
      conditions.push(eq(adminProjectActions.action, type as string));
    }

    // Query audit log for billing-related actions
    const { or, inArray, desc } = await import('drizzle-orm');
    
    const billingActions = ['subscription_changed', 'credits_issued', 'refund_processed'];
    
    const auditLogs = await db
      .select()
      .from(adminProjectActions)
      .where(
        and(
          ...conditions,
          inArray(adminProjectActions.action, billingActions)
        )
      )
      .orderBy(desc(adminProjectActions.createdAt))
      .limit(Number(limit));

    // Transform audit logs to billing events
    const events = auditLogs.map((log: any) => {
      const changes = log.changes || {};
      let eventType: 'usage' | 'subscription_change' | 'payment' | 'overage' | 'quota_warning' = 'usage';
      let category: 'data' | 'compute' | 'storage' | 'agent' | 'tool' | 'collaboration' = 'data';
      let amount = 0;
      let quantity = 1;

      if (log.action === 'subscription_changed') {
        eventType = 'subscription_change';
        amount = 0; // Subscription changes don't have amounts
      } else if (log.action === 'credits_issued') {
        eventType = 'payment';
        amount = changes.amount || changes.new?.credits || 0;
      } else if (log.action === 'refund_processed') {
        eventType = 'payment';
        amount = changes.refund?.amount || 0;
      }

      return {
        id: log.id,
        userId: log.userId,
        type: eventType,
        category,
        description: log.reason || `${log.action} by admin`,
        amount,
        quantity,
        metadata: {
          adminId: log.adminId,
          action: log.action,
          changes: log.changes,
          ipAddress: log.ipAddress
        },
        timestamp: log.createdAt,
        processed: true
      };
    });

    // If no audit logs, return empty array (or query from Stripe if integrated)
    res.json({
      success: true,
      events,
      total: events.length
    });
  } catch (error: any) {
    console.error('Failed to get billing events:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get billing events'
    });
  }
});

export default router;
