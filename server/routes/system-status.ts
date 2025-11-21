import { Router, type Request, type Response, type NextFunction } from 'express';
import { ensureAuthenticated } from './auth';
import { getFlexibleDatabaseIfAvailable } from '../db-flexible';
import { users, projects } from '../../shared/schema';
import { PerformanceMonitor } from '../utils/performance-monitor';

const router = Router();

const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
  await ensureAuthenticated(req, res, async () => {
    const role = (req.user as any)?.userRole || (req.user as any)?.role;
    if (role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
};

// Get system status
router.get('/system-status', ensureAuthenticated, async (req, res) => {
  // Check for admin role
  const userRole = (req.user as any)?.userRole || (req.user as any)?.role;
  if (userRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const performanceStats = performanceMonitor.getAllStats();
    
    // Calculate average response time from performance stats
    const avgResponseTime = Object.values(performanceStats).reduce((sum, stat) => {
      return sum + stat.avgDuration;
    }, 0) / Object.keys(performanceStats).length || 0;

    // Get database connection info
    const dbStatus = await checkDatabaseStatus();
    
    // Get agent status (mock for now - would be real in production)
    const agentStatus = await getAgentStatus();
    
    // Get system metrics
    const systemMetrics = await getSystemMetrics();

    const systemStatus = {
      overall: dbStatus.status === 'up' ? 'healthy' : 'degraded',
      services: {
        database: dbStatus,
        agents: {
          status: agentStatus.allWorking ? 'up' : 'degraded',
          responseTime: agentStatus.avgResponseTime,
          lastCheck: new Date().toISOString(),
          uptime: '99.9%'
        },
        api: {
          status: 'up',
          responseTime: avgResponseTime,
          lastCheck: new Date().toISOString(),
          uptime: '99.9%'
        },
        storage: {
          status: 'up',
          responseTime: 5,
          lastCheck: new Date().toISOString(),
          uptime: '99.9%'
        }
      },
      performance: {
        avgResponseTime: Math.round(avgResponseTime),
        activeConnections: systemMetrics.activeConnections,
        memoryUsage: systemMetrics.memoryUsage,
        cpuUsage: systemMetrics.cpuUsage
      },
      agents: agentStatus.agents
    };

    res.json(systemStatus);
  } catch (error: any) {
    console.error('Failed to get system status:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

// Check database status
async function checkDatabaseStatus() {
  try {
    const start = Date.now();
    const database = await getFlexibleDatabaseIfAvailable();
    if (!database) {
      return {
        status: 'down',
        lastCheck: new Date().toISOString(),
        uptime: '0%'
      };
    }

    await database.select().from(users).limit(1);
    const responseTime = Date.now() - start;
    
    return {
      status: 'up',
      responseTime,
      lastCheck: new Date().toISOString(),
      uptime: '99.9%'
    };
  } catch (error) {
    return {
      status: 'down',
      lastCheck: new Date().toISOString(),
      uptime: '0%'
    };
  }
}

// Get agent status (mock implementation)
async function getAgentStatus() {
  // In a real implementation, this would check actual agent status
  const agents = [
    {
      id: 'pm',
      name: 'Project Manager',
      status: 'idle' as const,
      lastActivity: '2 minutes ago'
    },
    {
      id: 'de',
      name: 'Data Engineer',
      status: 'idle' as const,
      lastActivity: '5 minutes ago'
    },
    {
      id: 'ds',
      name: 'Data Scientist',
      status: 'idle' as const,
      lastActivity: '1 minute ago'
    },
    {
      id: 'ba',
      name: 'Business Agent',
      status: 'idle' as const,
      lastActivity: '3 minutes ago'
    }
  ];

  return {
    agents,
    allWorking: true,
    avgResponseTime: 150
  };
}

// Get system metrics (mock implementation)
async function getSystemMetrics() {
  // In a real implementation, this would use system monitoring tools
  return {
    activeConnections: Math.floor(Math.random() * 50) + 10,
    memoryUsage: Math.floor(Math.random() * 30) + 40,
    cpuUsage: Math.floor(Math.random() * 20) + 20
  };
}

// Get real-time agent activity
router.get('/agent-activity', authenticateAdmin, async (req, res) => {
  try {
    const activity = await getRealTimeAgentActivity();
    res.json(activity);
  } catch (error: any) {
    console.error('Failed to get agent activity:', error);
    res.status(500).json({ error: 'Failed to get agent activity' });
  }
});

// Get real-time agent activity (mock implementation)
async function getRealTimeAgentActivity() {
  const activities = [
    'Analyzing data quality',
    'Generating insights',
    'Coordinating workflow',
    'Validating methodology',
    'Assessing business impact',
    'Processing user request',
    'Idle'
  ];

  const agents = ['pm', 'de', 'ds', 'ba'];
  
  return agents.map(agentId => ({
    id: agentId,
    activity: activities[Math.floor(Math.random() * activities.length)],
    status: Math.random() > 0.7 ? 'working' : 'idle',
    progress: Math.random() > 0.7 ? Math.floor(Math.random() * 100) : undefined
  }));
}

// Get system health check
router.get('/health', async (req, res) => {
  try {
    const dbStatus = await checkDatabaseStatus();
    const performanceMonitor = PerformanceMonitor.getInstance();
    const stats = performanceMonitor.getAllStats();
    
    const health = {
      status: dbStatus.status === 'up' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus.status,
        performance: Object.keys(stats).length > 0 ? 'monitoring' : 'idle'
      },
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    };

    res.json(health);
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;
