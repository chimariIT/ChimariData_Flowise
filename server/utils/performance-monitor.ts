// Simple console-based logging for performance monitoring
const log = {
  info: (message: string, ...args: any[]) => console.log(`[PerformanceMonitor] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[PerformanceMonitor] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[PerformanceMonitor] ${message}`, ...args)
};

export interface PerformanceMetrics {
  operation: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface PerformanceThresholds {
  [operation: string]: number; // milliseconds
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private thresholds: PerformanceThresholds = {
    'user_creation': 50,
    'project_creation': 30,
    'data_quality_assessment': 200,
    'feasibility_check': 150,
    'business_impact_assessment': 100,
    'multi_agent_coordination': 5000,
    'database_query': 20,
    'agent_initialization': 2000
  };

  private constructor() {
    // No initialization needed for console logging
  }

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Measure the performance of an async operation
   */
  async measure<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const start = Date.now();
    
    try {
      const result = await fn();
      const duration = Date.now() - start;
      
      this.recordMetric(operation, duration, metadata);
      this.checkThreshold(operation, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordMetric(operation, duration, { ...metadata, error: true });
      log.error(`Performance error in ${operation}:`, error);
      throw error;
    }
  }

  /**
   * Measure the performance of a synchronous operation
   */
  measureSync<T>(
    operation: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): T {
    const start = Date.now();
    
    try {
      const result = fn();
      const duration = Date.now() - start;
      
      this.recordMetric(operation, duration, metadata);
      this.checkThreshold(operation, duration);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.recordMetric(operation, duration, { ...metadata, error: true });
      log.error(`Performance error in ${operation}:`, error);
      throw error;
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const metric: PerformanceMetrics = {
      operation,
      duration,
      timestamp: new Date(),
      metadata
    };

    this.metrics.push(metric);

    // Keep only last 1000 metrics to prevent memory issues
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Check if operation exceeded threshold
   */
  private checkThreshold(operation: string, duration: number): void {
    const threshold = this.thresholds[operation];
    if (threshold && duration > threshold) {
      log.warn(
        `Performance threshold exceeded for ${operation}: ${duration}ms (threshold: ${threshold}ms)`
      );
    }
  }

  /**
   * Get performance statistics for an operation
   */
  getStats(operation: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    p95Duration: number;
    threshold: number;
  } | null {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    
    if (operationMetrics.length === 0) {
      return null;
    }

    const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b);
    const count = durations.length;
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / count;
    const minDuration = durations[0];
    const maxDuration = durations[count - 1];
    const p95Index = Math.floor(count * 0.95);
    const p95Duration = durations[p95Index];

    return {
      count,
      avgDuration: Math.round(avgDuration),
      minDuration,
      maxDuration,
      p95Duration,
      threshold: this.thresholds[operation] || 0
    };
  }

  /**
   * Get all performance statistics
   */
  getAllStats(): Record<string, any> {
    const operations = [...new Set(this.metrics.map(m => m.operation))];
    const stats: Record<string, any> = {};

    operations.forEach(operation => {
      const operationStats = this.getStats(operation);
      if (operationStats) {
        stats[operation] = operationStats;
      }
    });

    return stats;
  }

  /**
   * Get recent metrics (last N minutes)
   */
  getRecentMetrics(minutes: number = 5): PerformanceMetrics[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Set performance threshold for an operation
   */
  setThreshold(operation: string, threshold: number): void {
    this.thresholds[operation] = threshold;
  }

  /**
   * Get current thresholds
   */
  getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const stats = this.getAllStats();
    const report = ['Performance Report', '================'];
    
    Object.entries(stats).forEach(([operation, stat]) => {
      report.push(`\n${operation}:`);
      report.push(`  Count: ${stat.count}`);
      report.push(`  Average: ${stat.avgDuration}ms`);
      report.push(`  Min: ${stat.minDuration}ms`);
      report.push(`  Max: ${stat.maxDuration}ms`);
      report.push(`  P95: ${stat.p95Duration}ms`);
      report.push(`  Threshold: ${stat.threshold}ms`);
      
      if (stat.avgDuration > stat.threshold) {
        report.push(`  ⚠️  WARNING: Average exceeds threshold`);
      }
    });

    return report.join('\n');
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(): PerformanceMetrics[] {
    return [...this.metrics];
  }

  /**
   * Import metrics from external source
   */
  importMetrics(metrics: PerformanceMetrics[]): void {
    this.metrics = [...this.metrics, ...metrics];
  }
}

// Convenience function for measuring async operations
export async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  return PerformanceMonitor.getInstance().measure(operation, fn, metadata);
}

// Convenience function for measuring sync operations
export function measurePerformanceSync<T>(
  operation: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  return PerformanceMonitor.getInstance().measureSync(operation, fn, metadata);
}

// Performance decorator for methods
export function Performance(operation: string, metadata?: Record<string, any>) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return measurePerformance(
        operation,
        () => method.apply(this, args),
        { ...metadata, method: propertyName, args: args.length }
      );
    };
  };
}
