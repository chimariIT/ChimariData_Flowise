// server/routes/health.ts
import { Router } from 'express';

const router = Router();

// Lazy load Spark processor to avoid initialization issues
let sparkProcessor: any = null;

async function getSparkProcessor() {
  if (!sparkProcessor) {
    try {
      const { SparkProcessor } = await import('../services/spark-processor');
      sparkProcessor = new SparkProcessor();
    } catch (error) {
      console.warn('SparkProcessor not available for health checks:', error instanceof Error ? error.message : String(error));
      sparkProcessor = null;
    }
  }
  return sparkProcessor;
}

/**
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: {
        database: await checkDatabase(),
        spark: await checkSpark(),
        memory: getMemoryUsage(),
        uptime: process.uptime()
      }
    };

    // Determine overall health status
    const allServicesHealthy = Object.values(health.services).every(service => {
      if (typeof service === 'object' && service !== null && 'healthy' in service) {
        return service.healthy;
      }
      return true; // Memory usage and uptime are always considered healthy if present
    });

    if (!allServicesHealthy) {
      health.status = 'degraded';
      return res.status(503).json(health);
    }

    res.json(health);

  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Detailed Spark health check endpoint
 */
router.get('/health/spark', async (req, res) => {
  try {
    if (!sparkProcessor) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'Spark processor not initialized'
      });
    }

    const sparkHealth = await sparkProcessor.healthCheck();
    const clusterStatus = await sparkProcessor.getClusterStatus();

    res.json({
      status: sparkHealth.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      spark: {
        ...sparkHealth.details,
        cluster: clusterStatus
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Readiness probe for Kubernetes/Docker
 */
router.get('/ready', async (req, res) => {
  try {
    const checks = await Promise.all([
      checkDatabase(),
      checkSpark()
    ]);

    const allReady = checks.every(check => check.healthy);

    if (allReady) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not_ready',
        checks: {
          database: checks[0],
          spark: checks[1]
        }
      });
    }

  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Liveness probe for Kubernetes/Docker
 */
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({ 
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

// Helper functions
async function checkDatabase(): Promise<{ healthy: boolean; details?: any }> {
  try {
    // Import db here to avoid circular dependencies
    const { db } = await import('../db');
    
    // Simple query to check database connectivity
    await db.execute('SELECT 1');
    
    return { 
      healthy: true,
      details: {
        connected: true,
        type: 'postgresql'
      }
    };
  } catch (error) {
    return { 
      healthy: false, 
      details: { 
        error: error instanceof Error ? error.message : String(error),
        connected: false
      }
    };
  }
}

async function checkSpark(): Promise<{ healthy: boolean; details?: any }> {
  try {
    if (!sparkProcessor) {
      return {
        healthy: false,
        details: {
          error: 'Spark processor not initialized',
          available: false
        }
      };
    }

    const health = await sparkProcessor.healthCheck();
    return {
      healthy: health.healthy,
      details: health.details
    };

  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
        available: false
      }
    };
  }
}

function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
    external: Math.round(memoryUsage.external / 1024 / 1024), // MB
    arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024) // MB
  };
}

export default router;