import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { resolveDatabaseSslConfig } from './utils/database-ssl';

// Handle missing DATABASE_URL gracefully for development
let pool: Pool | null = null;
let db: any = null;
let resolvedPoolConfig: Record<string, any> | null = null;

if (process.env.DATABASE_URL) {
  try {
    // Enhanced connection pool configuration for better concurrent performance
    const poolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: resolveDatabaseSslConfig(process.env.DATABASE_URL),

      // Environment-specific optimizations
      ...(process.env.NODE_ENV === 'production' ? {
        min: 5,                     // Minimum connections for production
        max: 30,                    // Higher max for production load
        idleTimeoutMillis: 60000,   // Keep idle connections longer in production
        connectionTimeoutMillis: 15000, // Longer timeout for production
        maxUses: 10000,            // More uses per connection
        allowExitOnIdle: false,    // Don't exit on idle in production
        statement_timeout: 30000,  // 30 second query timeout
        query_timeout: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      } : process.env.NODE_ENV === 'test' ? {
        min: 1,                    // Minimal connections for testing
        max: 5,                    // Low max for test environment
        idleTimeoutMillis: 10000,  // Quick cleanup in tests
        connectionTimeoutMillis: 5000,
        maxUses: 1000,
        allowExitOnIdle: true
      } : {
        // Development configuration (default)
        min: 2,                    // Development baseline
        max: 20,                   // Increased from 20 to handle agent concurrency
        idleTimeoutMillis: 30000,  // Keep connections for reasonable time
        connectionTimeoutMillis: 10000, // 10 second timeout
        maxUses: 7500,            // Close connections after 7500 uses
        allowExitOnIdle: true,    // Allow pool to exit when idle
        // Additional optimizations for agent workloads
        application_name: 'chimaridata_agents', // Identify our connections
        statement_timeout: 30000, // Prevent runaway queries
        idle_in_transaction_session_timeout: 60000, // Clean up abandoned transactions
      })
    };

  pool = new Pool(poolConfig);
  resolvedPoolConfig = poolConfig;
    db = drizzle(pool, { schema });

    // Add connection event monitoring for better observability
    pool.on('connect', () => {
      console.debug(
        `✅ Database client connected. Pool stats: total=${pool?.totalCount ?? 0}, idle=${pool?.idleCount ?? 0}, waiting=${pool?.waitingCount ?? 0}`
      );
    });

    pool.on('error', (err) => {
      console.error('❌ Database pool error:', err);
    });

    pool.on('acquire', () => {
      const activeConnections = (pool?.totalCount ?? 0) - (pool?.idleCount ?? 0);
      console.debug(`🔄 Database client acquired. Active connections: ${activeConnections}`);
    });

    console.log(`✅ Database connection established with optimized pool settings for ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Pool config: min=${poolConfig.min}, max=${poolConfig.max}, idle_timeout=${poolConfig.idleTimeoutMillis}ms`);
    
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    pool = null;
    db = null;
  }
} else {
  console.log('⚠️  DATABASE_URL not set, running in development mode without database');
}

// Export pool statistics function for monitoring
export function getPoolStats() {
  if (!pool) return null;
  
  return {
    totalCount: pool.totalCount ?? 0,
    idleCount: pool.idleCount ?? 0,
    waitingCount: pool.waitingCount ?? 0,
    config: resolvedPoolConfig
  };
}

// Graceful shutdown function
export async function shutdownPool() {
  if (pool) {
    console.log('🔄 Shutting down database pool...');
    await pool.end();
    console.log('✅ Database pool shutdown complete');
  }
}

export { pool, db };
