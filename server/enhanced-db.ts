/**
 * Enhanced Database Connection Pool Configuration
 * 
 * Optimized for concurrent agent operations with:
 * - Dynamic pool sizing based on environment
 * - Connection health monitoring
 * - Performance metrics collection
 * - Connection retry logic
 * - Graceful degradation strategies
 * - Intelligent query result caching
 */

import { Pool, PoolConfig, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { dbCache, cacheService } from './services/enhanced-cache';
import DatabaseOptimizationService from './services/database-optimization';
import * as schema from '@shared/schema';
import { resolveDatabaseSslConfig } from './utils/database-ssl';

export interface DatabasePoolConfig extends PoolConfig {
  // Enhanced configuration options
  healthCheckInterval?: number;
  maxRetries?: number;
  retryDelay?: number;
  slowQueryThreshold?: number;
  enableMetrics?: boolean;
}

export interface ConnectionPoolMetrics {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingClients: number;
  totalQueries: number;
  averageQueryTime: number;
  slowQueries: number;
  connectionErrors: number;
  lastHealthCheck: Date;
  poolHealth: 'healthy' | 'degraded' | 'critical';
}

export class EnhancedDatabasePool {
  private readonly config: DatabasePoolConfig;
  private pool: Pool | null = null;
  private drizzleDb: any = null;
  private dbOptimizer: DatabaseOptimizationService | null = null;
  private metrics: ConnectionPoolMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private queryStartTimes: Map<PoolClient, number> = new Map();

  constructor(config: DatabasePoolConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.initialize();
  }

  private initializeMetrics(): ConnectionPoolMetrics {
    return {
      totalConnections: 0,
      idleConnections: 0,
      activeConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      averageQueryTime: 0,
      slowQueries: 0,
      connectionErrors: 0,
      lastHealthCheck: new Date(),
      poolHealth: 'healthy'
    };
  }

  private initialize(): void {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set, running without database');
      return;
    }

    try {
      // Get environment-specific configuration
      const poolConfig = this.getEnvironmentConfig();
      
      this.pool = new Pool(poolConfig);
      this.drizzleDb = drizzle(this.pool, { schema });
      
      // Initialize database optimization service
      this.dbOptimizer = new DatabaseOptimizationService(this.pool, {
        slowQueryThreshold: this.config.slowQueryThreshold || 1000,
        healthCheckInterval: 300000, // 5 minutes
        optimizationInterval: 600000  // 10 minutes
      });
      
      this.setupEventHandlers();
      this.startHealthMonitoring();
      
      console.log('✅ Enhanced database pool initialized with optimized settings');
      console.log(`📊 Pool config: min=${poolConfig.min}, max=${poolConfig.max}, idle_timeout=${poolConfig.idleTimeoutMillis}ms`);
      
    } catch (error) {
      console.error('❌ Enhanced database pool initialization failed:', error);
      this.pool = null;
      this.drizzleDb = null;
    }
  }

  private getEnvironmentConfig(): PoolConfig {
    const baseConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: resolveDatabaseSslConfig(process.env.DATABASE_URL),
      ...this.config
    };

    // Environment-specific optimizations
    if (process.env.NODE_ENV === 'production') {
      return {
        ...baseConfig,
        min: 5,                     // Minimum connections for production
        max: 30,                    // Higher max for production load
        idleTimeoutMillis: 60000,   // Keep idle connections longer
        connectionTimeoutMillis: 15000, // Longer timeout for production
        maxUses: 10000,            // More uses per connection
        allowExitOnIdle: false,    // Don't exit on idle in production
        statement_timeout: 30000,  // 30 second query timeout
        query_timeout: 30000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      };
    } else if (process.env.NODE_ENV === 'test') {
      return {
        ...baseConfig,
        min: 1,                    // Minimal connections for testing
        max: 5,                    // Low max for test environment
        idleTimeoutMillis: 10000,  // Quick cleanup in tests
        connectionTimeoutMillis: 5000,
        maxUses: 1000,
        allowExitOnIdle: true
      };
    } else {
      // Development configuration
      return {
        ...baseConfig,
        min: 2,                    // Development baseline
        max: 15,                   // Moderate max for development
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        maxUses: 5000,
        allowExitOnIdle: true
      };
    }
  }

  private setupEventHandlers(): void {
    if (!this.pool) return;

    this.pool.on('connect', (client: PoolClient) => {
      this.metrics.totalConnections++;
      console.debug(`Database client connected. Total: ${this.metrics.totalConnections}`);
      
      if (this.config.enableMetrics) {
        this.trackClientMetrics(client);
      }

      // Safety check: only wrap release if it exists
      if (client.release && typeof client.release === 'function') {
        const originalRelease = client.release.bind(client);
        client.release = (...releaseArgs: Parameters<PoolClient['release']>) => {
          this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
          this.metrics.idleConnections++;
          return originalRelease(...releaseArgs);
        };
      }
    });

    this.pool.on('acquire', (client: PoolClient) => {
      this.metrics.activeConnections++;
      this.metrics.idleConnections = Math.max(0, this.metrics.idleConnections - 1);
    });

    this.pool.on('remove', (client: PoolClient) => {
      this.metrics.totalConnections = Math.max(0, this.metrics.totalConnections - 1);
      console.debug(`Database client removed. Total: ${this.metrics.totalConnections}`);
    });

    this.pool.on('error', (error: Error, client: PoolClient) => {
      this.metrics.connectionErrors++;
      console.error('Database pool error:', error);
      
      // Update pool health based on error frequency
      this.updatePoolHealth();
    });
  }

  private trackClientMetrics(client: PoolClient): void {
    const originalQuery = client.query.bind(client) as PoolClient['query'];
    type QueryArgs = Parameters<PoolClient['query']>;

    const augmentedQuery = async (
      ...args: QueryArgs
    ): Promise<Awaited<ReturnType<PoolClient['query']>>> => {
      const startTime = Date.now();
      this.queryStartTimes.set(client, startTime);
      this.metrics.totalQueries++;

      const [textOrConfig, valuesOrCallback] = args;
      const queryText = typeof textOrConfig === 'string'
        ? textOrConfig
        : typeof textOrConfig === 'object' && textOrConfig !== null && 'text' in textOrConfig && typeof (textOrConfig as { text?: unknown }).text === 'string'
          ? (textOrConfig as { text?: string }).text ?? ''
          : '';
      const queryParams = Array.isArray(valuesOrCallback)
        ? valuesOrCallback
        : (typeof textOrConfig === 'object' && textOrConfig !== null && 'values' in textOrConfig && Array.isArray((textOrConfig as { values?: unknown }).values))
          ? ((textOrConfig as { values?: unknown[] }).values ?? [])
          : [];

      const isCacheable = this.isCacheableQuery(queryText);

      if (isCacheable) {
        try {
          const cachedResult = await dbCache.getQueryResult(queryText, queryParams);
          if (cachedResult) {
            this.recordQueryCompletion(client, startTime, true);
            console.debug('Database cache hit for query:', queryText.substring(0, 100));
            return cachedResult as Awaited<ReturnType<PoolClient['query']>>;
          }
        } catch (cacheError) {
          console.debug('Database cache lookup failed, continuing with live query', cacheError);
        }
      }

      const invokeOriginal = originalQuery as (...invokeArgs: QueryArgs) => Promise<Awaited<ReturnType<PoolClient['query']>>>;
      try {
        const result = await invokeOriginal(...args);
        this.recordQueryCompletion(client, startTime);

        if (isCacheable && result && (result as { rows?: unknown }).rows) {
          const cacheTTL = this.getCacheTTLForQuery(queryText);
          try {
            await dbCache.cacheQuery(queryText, queryParams, result, cacheTTL);
            console.debug(`Cached query result (TTL: ${cacheTTL}s):`, queryText.substring(0, 100));
          } catch (cacheError) {
            console.debug('Database cache write failed, continuing without cache', cacheError);
          }
        }

        return result as Awaited<ReturnType<PoolClient['query']>>;
      } catch (error) {
        this.recordQueryCompletion(client, startTime);
        throw error;
      }
    };

    client.query = augmentedQuery as PoolClient['query'];
  }

  /**
   * Determine if a query can be safely cached
   */
  private isCacheableQuery(queryText: string): boolean {
    if (!queryText || typeof queryText !== 'string') return false;
    
    const query = queryText.trim().toLowerCase();
    
    // Only cache SELECT queries
    if (!query.startsWith('select')) return false;
    
    // Don't cache queries with certain volatile functions
    const volatileFunctions = ['now()', 'current_timestamp', 'random()', 'uuid_generate_v4()'];
    if (volatileFunctions.some(fn => query.includes(fn))) return false;
    
    // Don't cache queries on session-specific or temporary tables
    if (query.includes('temp_') || query.includes('session_')) return false;
    
    return true;
  }

  /**
   * Determine cache TTL based on query characteristics
   */
  private getCacheTTLForQuery(queryText: string): number {
    const query = queryText.toLowerCase();
    
    // Short TTL for user-specific or frequently changing data
    if (query.includes('user') || query.includes('session') || query.includes('activity')) {
      return 300; // 5 minutes
    }
    
    // Medium TTL for project and dataset queries
    if (query.includes('project') || query.includes('dataset')) {
      return 1800; // 30 minutes
    }
    
    // Long TTL for reference data, settings, or statistical summaries
    if (query.includes('subscription') || query.includes('tier') || query.includes('config')) {
      return 3600; // 1 hour
    }
    
    // Very long TTL for aggregate or summary data
    if (query.includes('count(') || query.includes('sum(') || query.includes('avg(')) {
      return 7200; // 2 hours
    }
    
    // Default TTL
    return 900; // 15 minutes
  }

  private recordQueryCompletion(client: PoolClient, startTime: number, cacheHit: boolean = false): void {
    const duration = Date.now() - startTime;
    
    // Update average query time
    const totalTime = this.metrics.averageQueryTime * (this.metrics.totalQueries - 1) + duration;
    this.metrics.averageQueryTime = totalTime / this.metrics.totalQueries;
    
    // Track slow queries
    const slowThreshold = this.config.slowQueryThreshold || 1000; // 1 second default
    if (duration > slowThreshold) {
      this.metrics.slowQueries++;
      console.warn(`Slow query detected: ${duration}ms`);
    }
    
    this.queryStartTimes.delete(client);
  }

  private startHealthMonitoring(): void {
    const interval = this.config.healthCheckInterval || 30000; // 30 seconds default
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, interval);
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.pool) return;

    try {
      // Simple connectivity test
      const client = await this.pool.connect();
      const start = Date.now();
      await client.query('SELECT 1');
      const duration = Date.now() - start;
      client.release();
      
      this.metrics.lastHealthCheck = new Date();
      
      // Update health status based on response time and pool state
      this.updatePoolHealth();
      
      console.debug(`Database health check completed in ${duration}ms`);
      
    } catch (error) {
      console.error('Database health check failed:', error);
      this.metrics.connectionErrors++;
      this.metrics.poolHealth = 'critical';
    }
  }

  private updatePoolHealth(): void {
    if (!this.pool) {
      this.metrics.poolHealth = 'critical';
      return;
    }

    const errorRate = this.metrics.connectionErrors / Math.max(1, this.metrics.totalQueries);
    const slowQueryRate = this.metrics.slowQueries / Math.max(1, this.metrics.totalQueries);
    
    // Health assessment logic
    if (errorRate > 0.1 || this.metrics.connectionErrors > 10) {
      this.metrics.poolHealth = 'critical';
    } else if (errorRate > 0.05 || slowQueryRate > 0.2 || this.metrics.averageQueryTime > 2000) {
      this.metrics.poolHealth = 'degraded';
    } else {
      this.metrics.poolHealth = 'healthy';
    }
    
    // Update pool statistics
    this.metrics.totalConnections = this.pool.totalCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.waitingClients = this.pool.waitingCount;
  }

  /**
   * Get the Drizzle database instance
   */
  getDb(): any {
    return this.drizzleDb;
  }

  /**
   * Get the raw Pool instance
   */
  getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): ConnectionPoolMetrics {
    this.updatePoolHealth();
    return { ...this.metrics };
  }

  /**
   * Get pool health status
   */
  getHealthStatus(): {
    healthy: boolean;
    status: string;
    details: ConnectionPoolMetrics;
  } {
    const metrics = this.getMetrics();
    
    return {
      healthy: metrics.poolHealth === 'healthy',
      status: metrics.poolHealth,
      details: metrics
    };
  }

  /**
   * Execute a query with retry logic
   */
  async queryWithRetry<T>(
    queryFn: (db: any) => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    if (!this.drizzleDb) {
      throw new Error('Database not available');
    }

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await queryFn(this.drizzleDb);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Query attempt ${attempt} failed:`, error);
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const backoffDelay = delay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    
    throw lastError || new Error('Query failed after all retries');
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
  }

  /**
   * Get database optimization service
   */
  getOptimizer(): DatabaseOptimizationService | null {
    return this.dbOptimizer;
  }

  /**
   * Perform database health check
   */
  async performDatabaseHealthCheck() {
    if (!this.dbOptimizer) {
      throw new Error('Database optimizer not initialized');
    }
    return await this.dbOptimizer.performHealthCheck();
  }

  /**
   * Get query performance metrics
   */
  getQueryMetrics() {
    if (!this.dbOptimizer) {
      return [];
    }
    return this.dbOptimizer.getQueryMetrics();
  }

  /**
   * Get slow query alerts
   */
  getSlowQueries(limit?: number) {
    if (!this.dbOptimizer) {
      return [];
    }
    return this.dbOptimizer.getSlowQueries(limit);
  }

  /**
   * Execute database migration
   */
  async executeMigration(migration: {
    name: string;
    up: string;
    down: string;
  }) {
    if (!this.dbOptimizer) {
      throw new Error('Database optimizer not initialized');
    }
    return await this.dbOptimizer.executeMigration(migration);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down enhanced database pool...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Shutdown database optimizer
    if (this.dbOptimizer) {
      this.dbOptimizer.shutdown();
      this.dbOptimizer = null;
    }
    
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.drizzleDb = null;
    }
    
    console.log('Enhanced database pool shutdown complete');
  }
}

// Create and export the enhanced pool instance
const enhancedPool = new EnhancedDatabasePool({
  enableMetrics: true,
  healthCheckInterval: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  slowQueryThreshold: 1000
});

export const db = enhancedPool.getDb();
export const pool = enhancedPool.getPool();
export { enhancedPool };

// For backwards compatibility, also export the pool and db as before
export default { db, pool, enhancedPool };