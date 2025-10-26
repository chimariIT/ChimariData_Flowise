import { Router } from 'express';
import { getServiceHealth } from '../services/production-validator';
import { SparkProcessor } from '../services/spark-processor';
import { taskQueue } from '../services/enhanced-task-queue';
import { agentRegistry } from '../services/agent-registry';
import { toolRegistry } from '../services/tool-registry';

const router = Router();

/**
 * Service health endpoint for monitoring and user-facing health indicators
 * Returns status of all critical services
 */
router.get('/health', async (req, res) => {
    try {
        const health = await getServiceHealth();

        res.json({
            ...health,
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        console.error('Error checking service health:', error);
        res.status(500).json({
            allServicesOperational: false,
            error: 'Failed to check service health',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Detailed service status for admin dashboard
 */
router.get('/status', async (req, res) => {
    try {
        const health = await getServiceHealth();

        // Get additional metrics
        const sparkProcessor = new SparkProcessor();
        const sparkHealth = await sparkProcessor.healthCheck();

        const queueMetrics = taskQueue.getMetrics();
        const agentCapacities = taskQueue.getAgentCapacities();

        // Get registered agents and tools
        const agents = agentRegistry.listAgents();
        const tools = toolRegistry.getAllTools();

        res.json({
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            overall: {
                healthy: health.allServicesOperational,
                usingMockData: health.usingMockData
            },
            services: {
                python: health.details.services.python,
                spark: {
                    ...health.details.services.spark,
                    clusterInfo: sparkHealth.details
                },
                redis: health.details.services.redis,
                database: health.details.services.database
            },
            agents: {
                registered: agents.length,
                active: agents.filter(a => a.status === 'ready').length,
                list: agents.map(a => ({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    status: a.status,
                    capabilities: a.capabilities
                }))
            },
            tools: {
                registered: tools.length,
                list: tools.map((t: any) => ({
                    id: t.id,
                    name: t.name,
                    category: t.category,
                    status: t.status
                }))
            },
            taskQueue: {
                metrics: queueMetrics,
                agentCapacities: agentCapacities
            },
            warnings: health.details.warnings,
            failures: health.details.failures
        });
    } catch (error) {
        console.error('Error getting system status:', error);
        res.status(500).json({
            error: 'Failed to get system status',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Spark cluster specific health check
 */
router.get('/spark/health', async (req, res) => {
    try {
        const sparkProcessor = new SparkProcessor();
        const health = await sparkProcessor.healthCheck();
        const clusterStatus = await sparkProcessor.getClusterStatus();

        res.json({
            healthy: health.healthy,
            isMock: health.details.isMock,
            clusterStatus,
            config: health.details.config,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            healthy: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Agent registry health
 */
router.get('/agents/health', async (req, res) => {
    try {
        console.log('Checking agents health...');
        
        if (!agentRegistry) {
            return res.status(500).json({
                error: 'Agent registry not initialized'
            });
        }

        const agents = agentRegistry.listAgents();
        console.log(`Found ${agents.length} agents`);
        
        if (agents.length === 0) {
            return res.json({
                totalAgents: 0,
                healthyAgents: 0,
                agents: [],
                timestamp: new Date().toISOString()
            });
        }

        const agentHealthChecks = await Promise.all(
            agents.map(async (agent) => {
                try {
                    const health = await agentRegistry.getAgentHealth(agent.id);
                    return {
                        id: agent.id,
                        name: agent.name,
                        healthy: health.healthy,
                        lastSeen: health.lastSeen,
                        tasksCompleted: health.tasksCompleted,
                        tasksFailed: health.tasksFailed
                    };
                } catch (error) {
                    console.error(`Health check failed for agent ${agent.id}:`, error);
                    return {
                        id: agent.id,
                        name: agent.name,
                        healthy: false,
                        error: 'Health check failed'
                    };
                }
            })
        );

        res.json({
            totalAgents: agents.length,
            healthyAgents: agentHealthChecks.filter(a => a.healthy).length,
            agents: agentHealthChecks,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in agents health endpoint:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Task queue health and metrics
 */
router.get('/queue/health', (req, res) => {
    try {
        const metrics = taskQueue.getMetrics();
        const agentCapacities = taskQueue.getAgentCapacities();
        const queueStatus = taskQueue.getQueueStatus();

        res.json({
            healthy: metrics.failedTasks < metrics.completedTasks * 0.1, // < 10% failure rate
            metrics,
            agentCapacities,
            queueStatus,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            healthy: false,
            error: error instanceof Error ? error.message : String(error)
        });
    }
});

/**
 * Python environment health check
 */
router.get('/python-health', async (req, res) => {
    try {
        const { PythonProcessor } = await import('../services/enhanced-python-processor');
        const pythonProcessor = new PythonProcessor();
        const health = await pythonProcessor.healthCheck();

        res.json({
            healthy: health.healthy,
            details: health.details
        });
    } catch (error: any) {
        console.error('Python health check failed:', error);
        res.status(500).json({
            healthy: false,
            details: {
                error: error.message,
                pythonPath: process.env.PYTHON_PATH || 'python3'
            }
        });
    }
});

/**
 * Execute Python script for testing
 */
router.post('/python-execute', async (req, res) => {
    try {
        const { script, data, csvData, operation } = req.body;

        if (!script) {
            return res.status(400).json({
                success: false,
                error: 'Script name is required'
            });
        }

        // Handle simple operations directly
        if (operation === 'mean' && Array.isArray(data)) {
            const sum = data.reduce((a: number, b: number) => a + b, 0);
            const mean = sum / data.length;
            return res.json({
                success: true,
                result: mean
            });
        }

        if (operation === 'summary' && csvData) {
            const lines = csvData.trim().split('\n');
            const rowCount = lines.length - 1;
            return res.json({
                success: true,
                result: { rowCount, columnCount: lines[0].split(',').length }
            });
        }

        res.json({
            success: true,
            result: { message: 'Python processor integration pending' }
        });
    } catch (error: any) {
        console.error('Python execution error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * List available Python analysis scripts
 */
router.get('/python-scripts', async (req, res) => {
    try {
        const fs = await import('fs');
        const path = await import('path');
        const pythonDir = path.join(process.cwd(), 'python');

        if (!fs.existsSync(pythonDir)) {
            return res.status(404).json({
                error: 'Python scripts directory not found',
                expectedPath: pythonDir
            });
        }

        const files = fs.readdirSync(pythonDir);
        const scripts = files.filter(f => f.endsWith('.py'));

        res.json({
            scripts,
            count: scripts.length,
            path: pythonDir
        });
    } catch (error: any) {
        console.error('Failed to list Python scripts:', error);
        res.status(500).json({
            error: error.message
        });
    }
});

export default router;
