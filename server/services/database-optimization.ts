/**
 * Database Query Optimization Service
 * 
 * Advanced database performance optimization including:
 * - Intelligent query analysis and optimization
 * - Dynamic indexing recommendations
 * - Query plan caching and reuse
 * - Slow query detection and analysis
 * - Connection pool optimization
 * - Database migration utilities
 */

import { Pool, PoolClient, QueryConfig } from 'pg';
import { nanoid } from 'nanoid';
import { dbCache } from './enhanced-cache';

export interface QueryPerformanceMetrics {
  queryHash: string;
  query: string;
  executionCount: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  lastExecuted: Date;
  parameters: any[];
  queryPlan?: any;
  indexRecommendations?: IndexRecommendation[];
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  indexType: 'btree' | 'hash' | 'gin' | 'gist' | 'spgist' | 'brin';
  reasoning: string;
  impactScore: number;
  estimatedImprovement: string;
  sqlCommand: string;
}

export interface SlowQueryAlert {
  id: string;
  query: string;
  executionTime: number;
  threshold: number;
  timestamp: Date;
  parameters: any[];
  queryPlan: any;
  recommendations: string[];
}

export interface DatabaseHealthCheck {
  timestamp: Date;
  connectionHealth: {
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    maxConnections: number;
    connectionUtilization: number;
  };
  queryPerformance: {
    averageQueryTime: number;
    slowQueryCount: number;
    queriesPerSecond: number;
    querySuccessRate: number;
  };
  indexHealth: {
    totalIndexes: number;
    unusedIndexes: number;
    duplicateIndexes: number;
    missingIndexes: IndexRecommendation[];
  };
  diskHealth: {
    diskUsage: number;
    tableStats: Array<{
      tableName: string;
      size: number;
      rowCount: number;
      indexSize: number;
    }>;
  };
  recommendations: string[];
}

export class DatabaseOptimizationService {
  private pool: Pool;
  private baseQuery: Pool['query'];
  private queryMetrics = new Map<string, QueryPerformanceMetrics>();
  private slowQueryThreshold: number = 1000; // 1 second
  private slowQueries: SlowQueryAlert[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private optimizationInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool, options: {
    slowQueryThreshold?: number;
    healthCheckInterval?: number;
    optimizationInterval?: number;
  } = {}) {
    this.pool = pool;
    this.baseQuery = pool.query.bind(pool);
    this.slowQueryThreshold = options.slowQueryThreshold || 1000;
    
    this.startPerformanceMonitoring();
    this.startHealthChecks(options.healthCheckInterval || 300000); // 5 minutes
    this.startQueryOptimization(options.optimizationInterval || 600000); // 10 minutes
  }

  /**
   * Start performance monitoring for all queries
   */
  private startPerformanceMonitoring(): void {
    // Wrap pool.query to monitor all queries
    const originalQuery = this.baseQuery as (...params: any[]) => Promise<any>;

    this.pool.query = (async (...args: Parameters<Pool['query']>) => {
      const startTime = Date.now();
      const { text: queryText, params: queryParams } = this.resolveQueryDetails(args);
      const queryHash = this.generateQueryHash(queryText, queryParams);
      
      try {
        const result = await originalQuery(...args);
        const executionTime = Date.now() - startTime;
        
        // Record metrics
        this.recordQueryMetrics(queryHash, queryText, queryParams, executionTime);
        
        // Check for slow queries
        if (executionTime > this.slowQueryThreshold) {
          await this.handleSlowQuery(queryText, queryParams, executionTime);
        }
        
        return result;
      } catch (error) {
        const executionTime = Date.now() - startTime;
        this.recordQueryMetrics(queryHash, queryText, queryParams, executionTime, error);
        throw error;
      }
    }) as Pool['query'];
  }

  private resolveQueryDetails(args: Parameters<Pool['query']>): { text: string; params: any[] } {
    const [firstArg, secondArg] = args;

    if (typeof firstArg === 'string') {
      return {
        text: firstArg,
        params: Array.isArray(secondArg) ? secondArg : [],
      };
    }

    if (firstArg && typeof firstArg === 'object') {
      const config = firstArg as QueryConfig;
      const text = typeof config.text === 'string' ? config.text : '';
      const params = Array.isArray(config.values)
        ? config.values
        : Array.isArray(secondArg)
          ? secondArg as any[]
          : [];

      return { text, params };
    }

    return {
      text: '',
      params: Array.isArray(secondArg) ? secondArg : [],
    };
  }

  /**
   * Generate consistent hash for query identification
   */
  private generateQueryHash(query: string, params: any[]): string {
    // Normalize query by removing extra whitespace and parameters
    const safeQuery = (query ?? '').length ? query : `/*unknown*/${JSON.stringify(params ?? [])}`;
    const normalizedQuery = safeQuery
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .replace(/\$\d+/g, '?'); // Replace parameter placeholders
    
    return Buffer.from(normalizedQuery).toString('base64').substring(0, 16);
  }

  /**
   * Record query performance metrics
   */
  private recordQueryMetrics(
    queryHash: string, 
    query: string, 
    params: any[], 
    executionTime: number,
    error?: any
  ): void {
    let metrics = this.queryMetrics.get(queryHash);
    
    if (!metrics) {
      metrics = {
        queryHash,
        query,
        executionCount: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        lastExecuted: new Date(),
        parameters: []
      };
      this.queryMetrics.set(queryHash, metrics);
    }
    
    metrics.executionCount++;
    metrics.totalExecutionTime += executionTime;
    metrics.averageExecutionTime = metrics.totalExecutionTime / metrics.executionCount;
    metrics.minExecutionTime = Math.min(metrics.minExecutionTime, executionTime);
    metrics.maxExecutionTime = Math.max(metrics.maxExecutionTime, executionTime);
    metrics.lastExecuted = new Date();
    
    // Store unique parameter patterns (limited to prevent memory bloat)
    if (metrics.parameters.length < 10) {
      const paramPattern = params.map(p => typeof p).join(',');
      if (!metrics.parameters.includes(paramPattern)) {
        metrics.parameters.push(paramPattern);
      }
    }
  }

  /**
   * Handle slow query detection and analysis
   */
  private async handleSlowQuery(query: string, params: any[], executionTime: number): Promise<void> {
    try {
      const normalized = (query || '').trim();
      if (!normalized.length || normalized.toLowerCase().startsWith('explain') || normalized.startsWith('/*unknown*/')) {
        console.warn('Skipping slow-query analysis for unsupported statement:', normalized.slice(0, 80) || '<empty>');
        return;
      }

      // Get query execution plan
      const explainQuery = `EXPLAIN (FORMAT JSON, ANALYZE, BUFFERS) ${normalized}`;
      const planResult = await this.baseQuery(explainQuery, params);
      const queryPlan = planResult.rows[0]['QUERY PLAN'][0];
      
      // Generate optimization recommendations
      const recommendations = this.generateOptimizationRecommendations(queryPlan, query);
      
      const slowQueryAlert: SlowQueryAlert = {
        id: `slow_${nanoid()}`,
        query,
        executionTime,
        threshold: this.slowQueryThreshold,
        timestamp: new Date(),
        parameters: params,
        queryPlan,
        recommendations
      };
      
      this.slowQueries.push(slowQueryAlert);
      
      // Keep only recent slow queries (last 1000)
      if (this.slowQueries.length > 1000) {
        this.slowQueries = this.slowQueries.slice(-1000);
      }
      
      console.warn(`Slow query detected (${executionTime}ms):`, query.substring(0, 100) + '...');
      console.log('Recommendations:', recommendations);
      
    } catch (error) {
      console.error('Failed to analyze slow query:', error);
    }
  }

  /**
   * Generate optimization recommendations based on query plan
   */
  private generateOptimizationRecommendations(queryPlan: any, query: string): string[] {
    const recommendations: string[] = [];
    
    // Analyze the query plan for common performance issues
    this.analyzeQueryPlan(queryPlan, recommendations);
    
    // Analyze query text for patterns
    this.analyzeQueryText(query, recommendations);
    
    return recommendations;
  }

  /**
   * Analyze query execution plan for optimization opportunities
   */
  private analyzeQueryPlan(plan: any, recommendations: string[]): void {
    if (!plan) return;
    
    // Check for sequential scans on large tables
    if (plan['Node Type'] === 'Seq Scan' && plan['Plan Rows'] > 1000) {
      recommendations.push(`Consider adding an index on table "${plan['Relation Name']}" for the filtered columns`);
    }
    
    // Check for expensive sorts
    if (plan['Node Type'] === 'Sort' && plan['Total Cost'] > 1000) {
      recommendations.push('Consider adding an index to eliminate expensive sorting');
    }
    
    // Check for nested loop joins on large datasets
    if (plan['Node Type'] === 'Nested Loop' && plan['Plan Rows'] > 1000) {
      recommendations.push('Consider optimizing join conditions or adding indexes to improve join performance');
    }
    
    // Check for hash joins with large memory usage
    if (plan['Node Type'] === 'Hash Join' && plan['Peak Memory Usage']) {
      const memoryMB = parseInt(plan['Peak Memory Usage']) / 1024;
      if (memoryMB > 100) {
        recommendations.push(`Hash join using ${memoryMB.toFixed(1)}MB memory - consider optimizing join conditions`);
      }
    }
    
    // Recursively analyze child plans
    if (plan['Plans']) {
      plan['Plans'].forEach((childPlan: any) => {
        this.analyzeQueryPlan(childPlan, recommendations);
      });
    }
  }

  /**
   * Analyze query text for optimization patterns
   */
  private analyzeQueryText(query: string, recommendations: string[]): void {
    const lowerQuery = query.toLowerCase();
    
    // Check for SELECT *
    if (lowerQuery.includes('select *')) {
      recommendations.push('Avoid SELECT * - specify only needed columns to reduce data transfer');
    }
    
    // Check for LIKE with leading wildcard
    if (lowerQuery.includes('like \'%')) {
      recommendations.push('LIKE patterns starting with % cannot use indexes efficiently');
    }
    
    // Check for OR conditions
    if (lowerQuery.includes(' or ')) {
      recommendations.push('OR conditions can prevent index usage - consider UNION or restructuring');
    }
    
    // Check for functions in WHERE clauses
    if (lowerQuery.match(/where.*\w+\(/)) {
      recommendations.push('Functions in WHERE clauses prevent index usage - consider functional indexes');
    }
    
    // Check for DISTINCT without ORDER BY
    if (lowerQuery.includes('distinct') && !lowerQuery.includes('order by')) {
      recommendations.push('DISTINCT requires sorting - consider if it\'s necessary or add explicit ORDER BY');
    }
  }

  /**
   * Perform comprehensive database health check
   */
  async performHealthCheck(): Promise<DatabaseHealthCheck> {
    const timestamp = new Date();
    
    try {
      // Connection health
      const connectionHealth = await this.checkConnectionHealth();
      
      // Query performance
      const queryPerformance = this.checkQueryPerformance();
      
      // Index health
      const indexHealth = await this.checkIndexHealth();
      
      // Disk health
      const diskHealth = await this.checkDiskHealth();
      
      // Generate recommendations
      const recommendations = this.generateHealthRecommendations(
        connectionHealth, 
        queryPerformance, 
        indexHealth, 
        diskHealth
      );
      
      return {
        timestamp,
        connectionHealth,
        queryPerformance,
        indexHealth,
        diskHealth,
        recommendations
      };
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  }

  /**
   * Check database connection health
   */
  private async checkConnectionHealth(): Promise<DatabaseHealthCheck['connectionHealth']> {
    const result = await this.pool.query(`
      SELECT 
        setting::int as max_connections,
        current_setting('max_connections')::int as max_connections_setting
      FROM pg_settings 
      WHERE name = 'max_connections'
    `);
    
    const maxConnections = result.rows[0]?.max_connections || 100;
    
    const activeResult = await this.pool.query(`
      SELECT 
        count(*) FILTER (WHERE state = 'active') as active,
        count(*) FILTER (WHERE state = 'idle') as idle,
        count(*) as total
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `);
    
    const stats = activeResult.rows[0];
    
    return {
      totalConnections: parseInt(stats.total),
      activeConnections: parseInt(stats.active),
      idleConnections: parseInt(stats.idle),
      maxConnections,
      connectionUtilization: (parseInt(stats.total) / maxConnections) * 100
    };
  }

  /**
   * Check query performance metrics
   */
  private checkQueryPerformance(): DatabaseHealthCheck['queryPerformance'] {
    const metrics = Array.from(this.queryMetrics.values());
    
    const totalQueries = metrics.reduce((sum, m) => sum + m.executionCount, 0);
    const totalTime = metrics.reduce((sum, m) => sum + m.totalExecutionTime, 0);
    const averageTime = totalQueries > 0 ? totalTime / totalQueries : 0;
    
    const slowQueries = this.slowQueries.filter(
      sq => Date.now() - sq.timestamp.getTime() < 3600000 // Last hour
    );
    
    return {
      averageQueryTime: averageTime,
      slowQueryCount: slowQueries.length,
      queriesPerSecond: totalQueries / 3600, // Approximate based on hour
      querySuccessRate: 0.95 // Would calculate from actual error tracking
    };
  }

  /**
   * Check index health and recommendations
   */
  private async checkIndexHealth(): Promise<DatabaseHealthCheck['indexHealth']> {
    // Get index usage statistics
    const indexUsageResult = await this.pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
      FROM pg_stat_user_indexes
      ORDER BY idx_scan ASC
    `);
    
    // Get table statistics for index recommendations
    const tableStatsResult = await this.pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch
      FROM pg_stat_user_tables
      WHERE seq_scan > idx_scan * 10  -- Tables with high sequential scan ratio
      ORDER BY seq_tup_read DESC
      LIMIT 10
    `);
    
    const unusedIndexes = indexUsageResult.rows.filter(row => row.idx_scan === 0).length;
    const totalIndexes = indexUsageResult.rows.length;
    
    // Generate missing index recommendations
    const missingIndexes = await this.generateIndexRecommendations(tableStatsResult.rows);
    
    return {
      totalIndexes,
      unusedIndexes,
      duplicateIndexes: 0, // Would require more complex analysis
      missingIndexes
    };
  }

  /**
   * Generate index recommendations based on query patterns
   */
  private async generateIndexRecommendations(tableStats: any[]): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];
    
    for (const table of tableStats) {
      // Analyze queries against this table
      const tableQueries = Array.from(this.queryMetrics.values())
        .filter(m => m.query.toLowerCase().includes(table.tablename.toLowerCase()));
      
      for (const queryMetric of tableQueries) {
        // Simple pattern matching for WHERE clauses
        const whereMatch = queryMetric.query.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+HAVING|\s+LIMIT|$)/i);
        if (whereMatch) {
          const whereClause = whereMatch[1];
          const columns = this.extractColumnsFromWhere(whereClause);
          
          if (columns.length > 0) {
            recommendations.push({
              table: table.tablename,
              columns,
              indexType: 'btree',
              reasoning: `High sequential scan ratio (${table.seq_scan}:${table.idx_scan}) suggests missing index`,
              impactScore: Math.min(100, table.seq_tup_read / 1000),
              estimatedImprovement: `Could reduce query time by ${Math.min(90, table.seq_tup_read / 10000)}%`,
              sqlCommand: `CREATE INDEX CONCURRENTLY idx_${table.tablename}_${columns.join('_')} ON ${table.tablename} (${columns.join(', ')});`
            });
          }
        }
      }
    }
    
    return recommendations.slice(0, 10); // Limit recommendations
  }

  /**
   * Extract column names from WHERE clause (simplified)
   */
  private extractColumnsFromWhere(whereClause: string): string[] {
    const columns: string[] = [];
    
    // Simple regex to find column = value patterns
    const columnMatches = whereClause.match(/(\w+)\s*[=<>]/g);
    if (columnMatches) {
      columnMatches.forEach(match => {
        const column = match.replace(/\s*[=<>].*/, '').trim();
        if (!columns.includes(column)) {
          columns.push(column);
        }
      });
    }
    
    return columns;
  }

  /**
   * Check disk and storage health
   */
  private async checkDiskHealth(): Promise<DatabaseHealthCheck['diskHealth']> {
    // Optimized query: calculate size once using a subquery/CTE to avoid triple evaluation
    const tableSizeResult = await this.pool.query(`
      WITH table_sizes AS (
        SELECT
          schemaname,
          relname as tablename,
          pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(relname)) as size_bytes,
          n_tup_ins + n_tup_upd + n_tup_del as total_modifications,
          n_live_tup as row_count
        FROM pg_stat_user_tables
      )
      SELECT
        schemaname,
        tablename,
        pg_size_pretty(size_bytes) as size,
        size_bytes,
        total_modifications,
        row_count
      FROM table_sizes
      ORDER BY size_bytes DESC
      LIMIT 20
    `);
    
    const indexSizeResult = await this.pool.query(`
      SELECT 
        schemaname,
        relname as tablename,
        indexrelname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        pg_relation_size(indexrelid) as size_bytes
      FROM pg_stat_user_indexes
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 20
    `);
    
    const totalDiskUsage = tableSizeResult.rows.reduce(
      (sum, row) => sum + parseInt(row.size_bytes), 0
    );
    
    const tableStats = tableSizeResult.rows.map(row => ({
      tableName: row.tablename,
      size: parseInt(row.size_bytes),
      rowCount: parseInt(row.row_count),
      indexSize: indexSizeResult.rows
        .filter(idx => idx.tablename === row.tablename)
        .reduce((sum, idx) => sum + parseInt(idx.size_bytes), 0)
    }));
    
    return {
      diskUsage: totalDiskUsage,
      tableStats
    };
  }

  /**
   * Generate health-based recommendations
   */
  private generateHealthRecommendations(
    connectionHealth: any,
    queryPerformance: any,
    indexHealth: any,
    diskHealth: any
  ): string[] {
    const recommendations: string[] = [];
    
    // Connection recommendations
    if (connectionHealth.connectionUtilization > 80) {
      recommendations.push('Connection pool utilization is high - consider increasing max_connections or optimizing connection usage');
    }
    
    // Query performance recommendations
    if (queryPerformance.averageQueryTime > 500) {
      recommendations.push('Average query time is high - review slow query log and optimize queries');
    }
    
    if (queryPerformance.slowQueryCount > 10) {
      recommendations.push(`${queryPerformance.slowQueryCount} slow queries detected in the last hour - review and optimize`);
    }
    
    // Index recommendations
    if (indexHealth.unusedIndexes > indexHealth.totalIndexes * 0.2) {
      recommendations.push(`${indexHealth.unusedIndexes} unused indexes found - consider removing to improve write performance`);
    }
    
    if (indexHealth.missingIndexes.length > 0) {
      recommendations.push(`${indexHealth.missingIndexes.length} potential missing indexes identified - review recommendations`);
    }
    
    // Disk recommendations
    const largestTable = diskHealth.tableStats[0];
    if (largestTable && largestTable.size > 1024 * 1024 * 1024) { // > 1GB
      recommendations.push(`Table "${largestTable.tableName}" is large (${(largestTable.size / (1024 * 1024 * 1024)).toFixed(1)}GB) - consider partitioning or archiving old data`);
    }
    
    return recommendations;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(interval: number): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthCheck = await this.performHealthCheck();
        console.log('Database health check completed:', {
          connections: healthCheck.connectionHealth.connectionUtilization.toFixed(1) + '%',
          avgQueryTime: healthCheck.queryPerformance.averageQueryTime.toFixed(1) + 'ms',
          slowQueries: healthCheck.queryPerformance.slowQueryCount,
          recommendations: healthCheck.recommendations.length
        });
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, interval);
  }

  /**
   * Start automatic query optimization
   */
  private startQueryOptimization(interval: number): void {
    this.optimizationInterval = setInterval(async () => {
      try {
        await this.optimizeFrequentQueries();
      } catch (error) {
        console.error('Query optimization failed:', error);
      }
    }, interval);
  }

  /**
   * Optimize frequently executed queries
   */
  private async optimizeFrequentQueries(): Promise<void> {
    const frequentQueries = Array.from(this.queryMetrics.values())
      .filter(m => m.executionCount > 10)
      .sort((a, b) => b.totalExecutionTime - a.totalExecutionTime)
      .slice(0, 10);
    
    for (const query of frequentQueries) {
      // Cache query plans for frequent queries
      if (!query.queryPlan && query.executionCount > 50) {
        try {
          const planResult = await this.pool.query(`EXPLAIN (FORMAT JSON) ${query.query}`);
          query.queryPlan = planResult.rows[0]['QUERY PLAN'][0];
          query.indexRecommendations = await this.generateIndexRecommendationsForQuery(query);
        } catch (error) {
          console.error('Failed to cache query plan:', error);
        }
      }
    }
  }

  /**
   * Generate index recommendations for a specific query
   */
  private async generateIndexRecommendationsForQuery(queryMetric: QueryPerformanceMetrics): Promise<IndexRecommendation[]> {
    // This would be more sophisticated in practice
    return [];
  }

  /**
   * Get query performance metrics
   */
  getQueryMetrics(): QueryPerformanceMetrics[] {
    return Array.from(this.queryMetrics.values())
      .sort((a, b) => b.totalExecutionTime - a.totalExecutionTime);
  }

  /**
   * Get slow query alerts
   */
  getSlowQueries(limit: number = 50): SlowQueryAlert[] {
    return this.slowQueries
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Execute database migration
   */
  async executeMigration(migration: {
    name: string;
    up: string;
    down: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Check if migration already applied
      const existingResult = await client.query(
        'SELECT * FROM migrations WHERE name = $1',
        [migration.name]
      );
      
      if (existingResult.rows.length === 0) {
        // Execute migration
        await client.query(migration.up);
        
        // Record migration
        await client.query(
          'INSERT INTO migrations (name, applied_at) VALUES ($1, NOW())',
          [migration.name]
        );
        
        console.log(`Migration "${migration.name}" applied successfully`);
      } else {
        console.log(`Migration "${migration.name}" already applied`);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Migration "${migration.name}" failed:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Shutdown optimization service
   */
  shutdown(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
    }
    
    console.log('Database optimization service shutdown complete');
  }
}

export default DatabaseOptimizationService;
