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

// Lazy load Python processor to avoid initialization issues
let pythonProcessor: any = null;

async function getPythonProcessor() {
  if (!pythonProcessor) {
    try {
      const { PythonProcessor } = await import('../services/enhanced-python-processor');
      pythonProcessor = new PythonProcessor();
    } catch (error) {
      console.warn('PythonProcessor not available for health checks:', error instanceof Error ? error.message : String(error));
      pythonProcessor = null;
    }
  }
  return pythonProcessor;
}

// Lazy load Redis client to avoid initialization issues
async function getRedisClient() {
  try {
    const Redis = await import('ioredis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const client = new Redis.default(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry
      connectTimeout: 2000
    });

    // Add error handler to prevent unhandled error events
    client.on('error', () => {
      // Silently ignore errors - we'll handle them via the ping check
    });

    await client.connect();
    return client;
  } catch (error) {
    // Silently return null - Redis is optional in development
    return null;
  }
}

/**
 * Basic health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    // Check all services in parallel with error handling
    const [database, redis, python, spark] = await Promise.allSettled([
      checkDatabase(),
      checkRedis(),
      checkPython(),
      checkSpark()
    ]);

    const pythonOptional = process.env.PYTHON_HEALTH_OPTIONAL === 'true';

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      services: {
        database: database.status === 'fulfilled' ? database.value : { healthy: false, details: { error: database.reason?.message || 'Check failed' } },
        redis: redis.status === 'fulfilled' ? redis.value : { healthy: false, details: { error: redis.reason?.message || 'Check failed' } },
        python: python.status === 'fulfilled' ? python.value : { healthy: pythonOptional, details: { error: python.reason?.message || 'Check failed' } },
        spark: spark.status === 'fulfilled' ? spark.value : { healthy: false, details: { error: spark.reason?.message || 'Check failed' } },
        memory: getMemoryUsage(),
        uptime: process.uptime()
      }
    };

    // Determine overall health status
    // Spark is optional - only check it if enabled
    const sparkEnabled = process.env.SPARK_ENABLED?.toLowerCase() === 'true';
    const redisEnabled = process.env.REDIS_ENABLED?.toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
    
    // Critical services: Database, Redis (if enabled), Python
    const criticalServices = [
      health.services.database,
      ...(pythonOptional ? [] : [health.services.python]),
      ...(redisEnabled ? [health.services.redis] : []),
      // Only include Spark if it's enabled
      ...(sparkEnabled ? [health.services.spark] : [])
    ];
    
    const allServicesHealthy = criticalServices.every(service => {
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
    const sparkEnabled = process.env.SPARK_ENABLED?.toLowerCase() === 'true';
    const redisEnabled = process.env.REDIS_ENABLED?.toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
    
    const checks = await Promise.all([
      checkDatabase(),
      checkPython(),
      ...(redisEnabled ? [checkRedis()] : []),
      ...(sparkEnabled ? [checkSpark()] : [])
    ]);

    const allReady = checks.every(check => check.healthy);

    if (allReady) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ 
        status: 'not_ready',
        checks: {
          database: checks[0],
          python: checks[1],
          ...(redisEnabled && checks[2] ? { redis: checks[2] } : {}),
          ...(sparkEnabled && checks[redisEnabled ? 3 : 2] ? { spark: checks[redisEnabled ? 3 : 2] } : {})
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
    // Spark is optional - only required if explicitly enabled
    const sparkEnabled = process.env.SPARK_ENABLED?.toLowerCase() === 'true';
    
    if (!sparkEnabled) {
      // Spark is disabled - consider it healthy (optional service)
      return {
        healthy: true,
        details: {
          enabled: false,
          available: false,
          message: 'Spark is disabled (optional service)'
        }
      };
    }

    // Spark is enabled - check if it's actually available
    if (!sparkProcessor) {
      return {
        healthy: false,
        details: {
          error: 'Spark processor not initialized',
          available: false,
          enabled: true
        }
      };
    }

    const health = await sparkProcessor.healthCheck();
    return {
      healthy: health.healthy,
      details: {
        ...health.details,
        enabled: true
      }
    };

  } catch (error) {
    // If Spark is enabled but check fails, it's unhealthy
    // If Spark is disabled, this shouldn't be called, but handle gracefully
    const sparkEnabled = process.env.SPARK_ENABLED?.toLowerCase() === 'true';
    return {
      healthy: !sparkEnabled, // Only unhealthy if Spark is enabled
      details: {
        error: error instanceof Error ? error.message : String(error),
        available: false,
        enabled: sparkEnabled
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

async function checkRedis(): Promise<{ healthy: boolean; details?: any }> {
  try {
    const redisEnabled = process.env.REDIS_ENABLED?.toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
    
    if (!redisEnabled) {
      // Redis is disabled in development - consider it healthy (optional service)
      return {
        healthy: true,
        details: {
          enabled: false,
          available: false,
          message: 'Redis is disabled (optional in development, required in production)'
        }
      };
    }

    // Redis is enabled - check if it's actually available
    const redis = await getRedisClient();
    if (!redis) {
      return {
        healthy: false,
        details: {
          error: 'Redis client not initialized',
          available: false,
          enabled: true
        }
      };
    }

    // Try to ping Redis with timeout
    const pingResult = await Promise.race([
      redis.ping(),
      new Promise<string>((resolve) => setTimeout(() => resolve('TIMEOUT'), 2000))
    ]);

    await redis.quit();

    if (pingResult === 'TIMEOUT' || pingResult !== 'PONG') {
      return {
        healthy: false,
        details: {
          error: 'Redis ping failed or timed out',
          available: false,
          enabled: true
        }
      };
    }

    return {
      healthy: true,
      details: {
        enabled: true,
        available: true,
        message: 'Redis connection successful'
      }
    };

  } catch (error) {
    const redisEnabled = process.env.REDIS_ENABLED?.toLowerCase() === 'true' || process.env.NODE_ENV === 'production';
    return {
      healthy: !redisEnabled, // Only unhealthy if Redis is enabled
      details: {
        error: error instanceof Error ? error.message : String(error),
        available: false,
        enabled: redisEnabled
      }
    };
  }
}

async function checkPython(): Promise<{ healthy: boolean; details?: any }> {
  try {
    if (process.env.PYTHON_HEALTH_OPTIONAL === 'true') {
      return {
        healthy: true,
        details: {
          enabled: false,
          available: false,
          message: 'Python health checks skipped (PYTHON_HEALTH_OPTIONAL=true)'
        }
      };
    }

    const pythonPath = process.env.PYTHON_PATH || (process.platform === 'win32' ? 'python' : 'python3');
    
    const processor = await getPythonProcessor();
    if (!processor) {
      return {
        healthy: false,
        details: {
          error: 'Python processor not initialized',
          available: false,
          pythonPath
        }
      };
    }

    const health = await Promise.race([
      processor.healthCheck(),
      new Promise<any>((resolve) => setTimeout(() => resolve({ healthy: false, details: { error: 'Health check timed out after 5s' } }), 5000))
    ]);

    return {
      healthy: health.healthy,
      details: {
        ...health.details,
        pythonPath,
        enabled: true
      }
    };

  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : String(error),
        available: false,
        pythonPath: process.env.PYTHON_PATH || 'python3'
      }
    };
  }
}

export default router;