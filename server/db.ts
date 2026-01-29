import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import { resolveDatabaseSslConfig } from './utils/database-ssl';

// Lazy-initialized database connection.
// Uses getter pattern so that process.env.DATABASE_URL can be populated
// by test setup (dotenv) before the first actual DB access.
let pool: Pool | null = null;
let db: any = null;
let resolvedPoolConfig: Record<string, any> | null = null;
let initialized = false;

function initializeDb() {
  if (initialized) return;
  initialized = true;

  if (process.env.DATABASE_URL) {
    try {
      const poolConfig = {
        connectionString: process.env.DATABASE_URL,
        ssl: resolveDatabaseSslConfig(process.env.DATABASE_URL),

        ...(process.env.NODE_ENV === 'production' ? {
          min: 5,
          max: 30,
          idleTimeoutMillis: 60000,
          connectionTimeoutMillis: 15000,
          maxUses: 10000,
          allowExitOnIdle: false,
          statement_timeout: 30000,
          query_timeout: 30000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000
        } : process.env.NODE_ENV === 'test' ? {
          min: 1,
          max: 5,
          idleTimeoutMillis: 10000,
          connectionTimeoutMillis: 5000,
          maxUses: 1000,
          allowExitOnIdle: true
        } : {
          min: 2,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          maxUses: 7500,
          allowExitOnIdle: true,
          application_name: 'chimaridata_agents',
          statement_timeout: 30000,
          idle_in_transaction_session_timeout: 60000,
        })
      };

      pool = new Pool(poolConfig);
      resolvedPoolConfig = poolConfig;
      db = drizzle(pool, { schema });

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
}

// Initialize eagerly in non-test environments (server startup)
if (process.env.NODE_ENV !== 'test') {
  initializeDb();
}

// Export pool statistics function for monitoring
export function getPoolStats() {
  initializeDb();
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

export { initializeDb, pool, db };
