/**
 * Initialization Health Check Service
 *
 * Provides health checks for critical service dependencies
 * to be used by admin endpoints before accessing dependent services.
 */

import { enhancedPool } from '../enhanced-db';
import { agentRegistry } from './agent-registry';
import { agentSystem } from './agent-initialization';
import { MCPToolRegistry } from './mcp-tool-registry';
import { getInitializationState } from '../index';

export interface InitializationHealthStatus {
  database: boolean;
  agentSystem: boolean;
  toolRegistry: boolean;
  messagePool: boolean;
  allReady: boolean;
  errors: string[];
}

/**
 * Check if all critical dependencies are initialized and ready
 */
export function checkInitializationHealth(): InitializationHealthStatus {
  const errors: string[] = [];
  let database = false;
  let agentSystem = false;
  let toolRegistry = false;
  let messagePool = false;

  // Check database (enhancedPool)
  try {
    const pool = enhancedPool.getPool();
    if (pool && pool.totalCount > 0) {
      database = true;
      console.debug('✅ Database pool initialized and healthy');
    } else {
      errors.push('Database pool not initialized or no connections');
    }
  } catch (error) {
    errors.push(`Database health check failed: ${error}`);
  }

  // Check agent system
  try {
    const agents = agentRegistry.getAgents();
    if (agents && agents.length > 0) {
      agentSystem = true;
      console.debug(`✅ Agent system initialized with ${agents.length} agents`);
    } else {
      errors.push('Agent system not initialized or no agents registered');
    }
  } catch (error) {
    errors.push(`Agent system health check failed: ${error}`);
  }

  // Check MCP tool registry
  try {
    const tools = MCPToolRegistry.getTools();
    if (tools && tools.length > 0) {
      toolRegistry = true;
      console.debug(`✅ MCP tool registry initialized with ${tools.length} tools`);
    } else {
      errors.push('MCP tool registry not initialized or no tools registered');
    }
  } catch (error) {
    errors.push(`MCP tool registry health check failed: ${error}`);
  }

  // Check message broker (via initialization state)
  try {
    const initState = getInitializationState();
    if (initState && initState.toolsInitialized && initState.agentsInitialized) {
      messagePool = true;
      console.debug('✅ Message pool initialized');
    } else {
      errors.push('Message pool not fully initialized');
    }
  } catch (error) {
    errors.push(`Message pool health check failed: ${error}`);
  }

  const allReady = database && agentSystem && toolRegistry && messagePool;

  const healthStatus: InitializationHealthStatus = {
    database,
    agentSystem,
    toolRegistry,
    messagePool,
    allReady,
    errors
  };

  if (!allReady) {
    console.error('❌ Initialization health check failed:');
    errors.forEach(err => console.error(`  - ${err}`));
  } else {
    console.log('✅ All critical dependencies initialized and healthy');
  }

  return healthStatus;
}

/**
 * Middleware to ensure dependencies are ready before serving admin requests
 */
export function requireInitializedHealth(req: any, res: any, next: any) {
  const health = checkInitializationHealth();

  if (!health.allReady) {
    console.warn('⚠️ Admin endpoint called before full initialization');
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'System is still initializing. Please try again in a few moments.',
      status: health
    });
  }

  next();
}
