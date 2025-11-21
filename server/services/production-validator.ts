import { spawn } from 'child_process';
import { SparkProcessor } from './spark-processor';
import { PythonProcessor } from '../python-processor.js';

export interface ValidationResult {
    ready: boolean;
    failures: string[];
    warnings: string[];
    services: {
        python: ServiceStatus;
        spark: ServiceStatus;
        redis: ServiceStatus;
        database: ServiceStatus;
    };
}

interface ServiceStatus {
    available: boolean;
    details: string;
    critical: boolean;
}

/**
 * Validates that all critical services are available before starting the server.
 * Prevents production deployment with mock/simulated data.
 */
export async function validateProductionReadiness(): Promise<ValidationResult> {
    const failures: string[] = [];
    const warnings: string[] = [];
    const isProduction = process.env.NODE_ENV === 'production';

    console.log('🔍 Validating production readiness...');

    // Check Python availability
    const pythonCheck = await checkPythonBridge();
    if (!pythonCheck.available) {
        if (isProduction) {
            failures.push('Python bridge not available - analysis will fail');
        } else {
            warnings.push('Python bridge not available - using fallback mode');
        }
    }

    // Check Spark cluster for large dataset processing
    const sparkCheck = await checkSparkCluster();
    if (!sparkCheck.available) {
        if (isProduction) {
            failures.push('Spark cluster not available - large datasets cannot be processed');
        } else {
            warnings.push('Spark cluster not available - large dataset processing disabled');
        }
    }

    // Check Redis for agent coordination
    const redisCheck = await checkRedisConnection();
    if (!redisCheck.available) {
        if (isProduction) {
            failures.push('Redis not available - agent coordination will fail');
        } else {
            warnings.push('Redis not available - using in-memory fallback');
        }
    }

    // Check database connection
    const dbCheck = await checkDatabaseConnection();
    if (!dbCheck.available) {
        failures.push('Database not available - critical failure');
    }

    // Check for forced mock modes
    if (process.env.FORCE_SPARK_MOCK === 'true') {
        if (isProduction) {
            failures.push('FORCE_SPARK_MOCK is enabled - mock data will be returned to users');
        } else {
            warnings.push('FORCE_SPARK_MOCK enabled - using mock Spark data');
        }
    }

    // Check for ENABLE_MOCK_MODE flag
    if (process.env.ENABLE_MOCK_MODE === 'true') {
        if (isProduction) {
            failures.push('ENABLE_MOCK_MODE is enabled - mock data will be returned to users');
        } else {
            warnings.push('ENABLE_MOCK_MODE enabled - using mock data');
        }
    }

    // Check for client-side mock data (Vite environment variable)
    // Note: This can't be checked at runtime, but we document it
    if (isProduction) {
        // Verify production build doesn't have VITE_ENABLE_MOCK set
        const viteMockMode = process.env.VITE_ENABLE_MOCK_MODE;
        if (viteMockMode === 'true') {
            warnings.push('VITE_ENABLE_MOCK_MODE is set - verify client-side mock data is disabled in production build');
        }
    }

    // Check for missing required environment variables
    const envCheck = checkRequiredEnvironmentVariables();
    if (envCheck.missing.length > 0) {
        if (isProduction) {
            failures.push(`Missing required environment variables: ${envCheck.missing.join(', ')}`);
        } else {
            warnings.push(`Missing optional environment variables: ${envCheck.missing.join(', ')}`);
        }
    }

    const ready = failures.length === 0;

    return {
        ready,
        failures,
        warnings,
        services: {
            python: pythonCheck,
            spark: sparkCheck,
            redis: redisCheck,
            database: dbCheck
        }
    };
}

/**
 * Timeout helper for health checks
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
    ]);
}

/**
 * Check if Python and required data science libraries are available
 */
async function checkPythonBridge(): Promise<ServiceStatus> {
    const pythonPath = process.env.PYTHON_PATH || 'python3';

    try {
        // PythonProcessor.healthCheck is a static method
        const health = await withTimeout(
            PythonProcessor.healthCheck(),
            5000,
            { healthy: false, details: { error: 'Health check timed out after 5s' } }
        );

        if (health.healthy) {
            return {
                available: true,
                details: `Python available with required libraries`,
                critical: true
            };
        } else {
            return {
                available: false,
                details: `Python available but missing libraries: ${health.details.error || 'unknown'}`,
                critical: true
            };
        }
    } catch (error) {
        return {
            available: false,
            details: error instanceof Error ? error.message : 'Python not accessible',
            critical: true
        };
    }
}

/**
 * Check if Spark cluster is accessible
 */
async function checkSparkCluster(): Promise<ServiceStatus> {
    try {
        const sparkProcessor = new SparkProcessor();

        // Add 3 second timeout for Spark health check
        const health = await withTimeout(
            sparkProcessor.healthCheck(),
            3000,
            { healthy: false, details: { error: 'Spark health check timed out after 3s', isMock: true } }
        );

        if (health.healthy && !health.details.isMock) {
            return {
                available: true,
                details: `Spark cluster available at ${health.details.config.master}`,
                critical: false // Not critical for small datasets
            };
        } else if (health.details.isMock) {
            return {
                available: false,
                details: 'Spark running in mock mode',
                critical: false
            };
        } else {
            return {
                available: false,
                details: health.details.error || 'Spark cluster not accessible',
                critical: false
            };
        }
    } catch (error) {
        return {
            available: false,
            details: error instanceof Error ? error.message : 'Spark check failed',
            critical: false
        };
    }
}

/**
 * Check Redis connection for agent coordination
 */
async function checkRedisConnection(): Promise<ServiceStatus> {
    const isProduction = process.env.NODE_ENV === 'production';
    const redisEnabled = process.env.REDIS_ENABLED === 'true' || isProduction;

    if (!redisEnabled) {
        return {
            available: false,
            details: 'Redis disabled in development mode',
            critical: false
        };
    }

    try {
        // Import Redis client and test connection with 2 second timeout
        const Redis = await import('ioredis');
        const redis = new Redis.default(process.env.REDIS_URL || 'redis://localhost:6379');

        await withTimeout(redis.ping(), 2000, 'TIMEOUT' as any);
        await redis.quit();

        return {
            available: true,
            details: 'Redis connection successful',
            critical: isProduction
        };
    } catch (error) {
        return {
            available: false,
            details: error instanceof Error ? error.message : 'Redis connection failed',
            critical: isProduction
        };
    }
}

/**
 * Check database connection
 */
async function checkDatabaseConnection(): Promise<ServiceStatus> {
    try {
        // Import database client
        const { db } = await import('../db');

        // Try a simple query with 2 second timeout
        await withTimeout(
            db.execute('SELECT 1'),
            2000,
            null as any
        );

        return {
            available: true,
            details: 'Database connection successful',
            critical: true
        };
    } catch (error) {
        return {
            available: false,
            details: error instanceof Error ? error.message : 'Database connection failed',
            critical: true
        };
    }
}

/**
 * Check required environment variables
 */
function checkRequiredEnvironmentVariables(): { missing: string[], optional: string[] } {
    const isProduction = process.env.NODE_ENV === 'production';

    const required = [
        'DATABASE_URL',
        'GOOGLE_AI_API_KEY'
    ];

    const productionRequired = [
        'REDIS_URL',
        'SPARK_MASTER_URL',
        'PYTHON_PATH'
    ];

    const optional = [
        'STRIPE_SECRET_KEY',
        'SENDGRID_API_KEY',
        'AWS_ACCESS_KEY_ID',
        'GOOGLE_CLIENT_ID'
    ];

    const missing: string[] = [];
    const missingOptional: string[] = [];

    // Check always-required variables
    for (const envVar of required) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }

    // Check production-only required variables
    if (isProduction) {
        for (const envVar of productionRequired) {
            if (!process.env[envVar]) {
                missing.push(envVar);
            }
        }
    }

    // Check optional variables
    for (const envVar of optional) {
        if (!process.env[envVar]) {
            missingOptional.push(envVar);
        }
    }

    return { missing, optional: missingOptional };
}

/**
 * Get current service health status (for monitoring/admin dashboard)
 */
export async function getServiceHealth(): Promise<{
    allServicesOperational: boolean;
    sparkAvailable: boolean;
    pythonAvailable: boolean;
    redisAvailable: boolean;
    databaseAvailable: boolean;
    usingMockData: boolean;
    details: any;
}> {
    const validation = await validateProductionReadiness();

    const sparkAvailable = validation.services.spark.available;
    const pythonAvailable = validation.services.python.available;
    const redisAvailable = validation.services.redis.available;
    const databaseAvailable = validation.services.database.available;

    // Check if any service is using mock data
    const usingMockData = !sparkAvailable || !pythonAvailable ||
                          process.env.FORCE_SPARK_MOCK === 'true';

    const allServicesOperational = validation.ready && !usingMockData;

    return {
        allServicesOperational,
        sparkAvailable,
        pythonAvailable,
        redisAvailable,
        databaseAvailable,
        usingMockData,
        details: {
            failures: validation.failures,
            warnings: validation.warnings,
            services: validation.services
        }
    };
}
