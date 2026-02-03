// server/services/tool-analytics.ts
import { db } from '../db';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

/**
 * Tool Usage Analytics and Monitoring Service
 *
 * Tracks tool execution metrics for:
 * - Performance monitoring
 * - Usage patterns
 * - Cost analysis
 * - Error tracking
 * - Capacity planning
 */

export interface ToolExecutionMetrics {
  toolId: string;
  executionId: string;
  agentId: string;
  userId?: string;
  projectId?: string;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  startTime: Date;
  endTime: Date;
  duration: number;
  resourcesUsed: {
    cpu: number;
    memory: number;
    storage: number;
  };
  cost: number;
  errorMessage?: string;
  inputSize?: number;
  outputSize?: number;
}

export interface ToolAnalytics {
  toolId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  totalCost: number;
  averageCost: number;
  peakUsageTime?: Date;
  commonErrors: { error: string; count: number }[];
  performanceTrend: 'improving' | 'stable' | 'degrading';
}

export interface SystemMetrics {
  timestamp: Date;
  activeTools: number;
  totalExecutions: number;
  averageLatency: number;
  errorRate: number;
  throughput: number; // executions per minute
  resourceUtilization: {
    cpu: number;
    memory: number;
    storage: number;
  };
}

export class ToolAnalyticsService {
  private metricsBuffer: ToolExecutionMetrics[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;
  private readonly BUFFER_SIZE = 100;
  private readonly FLUSH_INTERVAL = 30000; // 30 seconds

  constructor() {
    // Start background flush
    this.startBackgroundFlush();
  }

  /**
   * Record tool execution metrics
   */
  async recordExecution(metrics: ToolExecutionMetrics): Promise<void> {
    // Add to buffer for batch processing
    this.metricsBuffer.push(metrics);

    // Flush if buffer is full
    if (this.metricsBuffer.length >= this.BUFFER_SIZE) {
      await this.flushMetrics();
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_DEBUG_LOGGING === 'true') {
      console.log(`[ToolAnalytics] ${metrics.toolId} executed in ${metrics.duration}ms (${metrics.status})`);
    }
  }

  /**
   * Start execution tracking (returns metrics object to be completed)
   */
  startExecution(params: {
    toolId: string;
    agentId: string;
    userId?: string;
    projectId?: string;
    executionId?: string;
  }): { executionId: string; startTime: Date; complete: (result: any) => Promise<void> } {
    const executionId = params.executionId || `exec_${nanoid()}`;
    const startTime = new Date();

    return {
      executionId,
      startTime,
      complete: async (result: any) => {
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        const metrics: ToolExecutionMetrics = {
          toolId: params.toolId,
          executionId,
          agentId: params.agentId,
          userId: params.userId,
          projectId: params.projectId,
          status: result.status || 'success',
          startTime,
          endTime,
          duration,
          resourcesUsed: result.metrics?.resourcesUsed || { cpu: 0, memory: 0, storage: 0 },
          cost: result.metrics?.cost || 0,
          errorMessage: result.error,
          inputSize: result.inputSize,
          outputSize: result.outputSize
        };

        await this.recordExecution(metrics);
      }
    };
  }

  /**
   * Get analytics for a specific tool
   */
  async getToolAnalytics(toolId: string, timeRange?: { start: Date; end: Date }): Promise<ToolAnalytics> {
    // Flush current buffer
    await this.flushMetrics();

    // Query metrics from buffer and historical data
    const metrics = this.metricsBuffer.filter(m => m.toolId === toolId);

    if (metrics.length === 0) {
      return {
        toolId,
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        totalCost: 0,
        averageCost: 0,
        commonErrors: [],
        performanceTrend: 'stable'
      };
    }

    const totalExecutions = metrics.length;
    const successfulExecutions = metrics.filter(m => m.status === 'success').length;
    const failedExecutions = metrics.filter(m => m.status === 'error').length;
    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0);

    // Calculate common errors
    const errorCounts = new Map<string, number>();
    metrics
      .filter(m => m.errorMessage)
      .forEach(m => {
        const count = errorCounts.get(m.errorMessage!) || 0;
        errorCounts.set(m.errorMessage!, count + 1);
      });

    const commonErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate performance trend
    const recentMetrics = metrics.slice(-20);
    const olderMetrics = metrics.slice(0, 20);
    const recentAvgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    const olderAvgDuration = olderMetrics.length > 0
      ? olderMetrics.reduce((sum, m) => sum + m.duration, 0) / olderMetrics.length
      : recentAvgDuration;

    let performanceTrend: 'improving' | 'stable' | 'degrading' = 'stable';
    const changePercent = ((recentAvgDuration - olderAvgDuration) / olderAvgDuration) * 100;

    if (changePercent > 10) {
      performanceTrend = 'degrading';
    } else if (changePercent < -10) {
      performanceTrend = 'improving';
    }

    return {
      toolId,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageDuration: totalDuration / totalExecutions,
      totalCost,
      averageCost: totalCost / totalExecutions,
      peakUsageTime: metrics.reduce((peak, m) => m.startTime > peak ? m.startTime : peak, metrics[0].startTime),
      commonErrors,
      performanceTrend
    };
  }

  /**
   * Get system-wide metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    await this.flushMetrics();

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);

    // Get recent metrics (last minute)
    const recentMetrics = this.metricsBuffer.filter(m => m.startTime >= oneMinuteAgo);

    const totalExecutions = recentMetrics.length;
    const errorCount = recentMetrics.filter(m => m.status === 'error').length;
    const totalDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
    const avgLatency = totalExecutions > 0 ? totalDuration / totalExecutions : 0;
    const errorRate = totalExecutions > 0 ? errorCount / totalExecutions : 0;

    // Calculate resource utilization (average across all executions)
    const totalCpu = recentMetrics.reduce((sum, m) => sum + m.resourcesUsed.cpu, 0);
    const totalMemory = recentMetrics.reduce((sum, m) => sum + m.resourcesUsed.memory, 0);
    const totalStorage = recentMetrics.reduce((sum, m) => sum + m.resourcesUsed.storage, 0);

    const resourceUtilization = {
      cpu: totalExecutions > 0 ? totalCpu / totalExecutions : 0,
      memory: totalExecutions > 0 ? totalMemory / totalExecutions : 0,
      storage: totalExecutions > 0 ? totalStorage / totalExecutions : 0
    };

    // Get unique tools used
    const activeTools = new Set(recentMetrics.map(m => m.toolId)).size;

    return {
      timestamp: now,
      activeTools,
      totalExecutions,
      averageLatency: avgLatency,
      errorRate,
      throughput: totalExecutions, // executions in last minute
      resourceUtilization
    };
  }

  /**
   * Get usage breakdown by agent
   */
  async getAgentUsageBreakdown(agentId: string): Promise<{
    agentId: string;
    totalExecutions: number;
    toolsUsed: { toolId: string; count: number }[];
    totalCost: number;
    averageDuration: number;
  }> {
    await this.flushMetrics();

    const agentMetrics = this.metricsBuffer.filter(m => m.agentId === agentId);

    const toolCounts = new Map<string, number>();
    agentMetrics.forEach(m => {
      toolCounts.set(m.toolId, (toolCounts.get(m.toolId) || 0) + 1);
    });

    const toolsUsed = Array.from(toolCounts.entries())
      .map(([toolId, count]) => ({ toolId, count }))
      .sort((a, b) => b.count - a.count);

    const totalCost = agentMetrics.reduce((sum, m) => sum + m.cost, 0);
    const totalDuration = agentMetrics.reduce((sum, m) => sum + m.duration, 0);

    return {
      agentId,
      totalExecutions: agentMetrics.length,
      toolsUsed,
      totalCost,
      averageDuration: agentMetrics.length > 0 ? totalDuration / agentMetrics.length : 0
    };
  }

  /**
   * Get cost breakdown by user
   */
  async getUserCostBreakdown(userId: string, startDate?: Date, endDate?: Date): Promise<{
    userId: string;
    totalCost: number;
    executionCount: number;
    toolBreakdown: { toolId: string; cost: number; count: number }[];
    projectBreakdown: { projectId: string; cost: number; count: number }[];
  }> {
    await this.flushMetrics();

  let userMetrics = this.metricsBuffer.filter(m => m.userId === userId);

    // Apply date filters if provided
    if (startDate) {
      userMetrics = userMetrics.filter(m => m.startTime >= startDate);
    }
    if (endDate) {
      userMetrics = userMetrics.filter(m => m.endTime <= endDate);
    }

    // Calculate tool breakdown
    const toolCosts = new Map<string, { cost: number; count: number }>();
    userMetrics.forEach(m => {
      const existing = toolCosts.get(m.toolId) || { cost: 0, count: 0 };
      toolCosts.set(m.toolId, {
        cost: existing.cost + m.cost,
        count: existing.count + 1
      });
    });

    const toolBreakdown = Array.from(toolCosts.entries())
      .map(([toolId, data]) => ({ toolId, ...data }))
      .sort((a, b) => b.cost - a.cost);

    // Calculate project breakdown
    const projectCosts = new Map<string, { cost: number; count: number }>();
    userMetrics
      .filter(m => m.projectId)
      .forEach(m => {
        const existing = projectCosts.get(m.projectId!) || { cost: 0, count: 0 };
        projectCosts.set(m.projectId!, {
          cost: existing.cost + m.cost,
          count: existing.count + 1
        });
      });

    const projectBreakdown = Array.from(projectCosts.entries())
      .map(([projectId, data]) => ({ projectId, ...data }))
      .sort((a, b) => b.cost - a.cost);

    const totalCost = userMetrics.reduce((sum, m) => sum + m.cost, 0);

    return {
      userId,
      totalCost,
      executionCount: userMetrics.length,
      toolBreakdown,
      projectBreakdown
    };
  }

  /**
   * Get performance alerts
   */
  async getPerformanceAlerts(): Promise<Array<{
    severity: 'critical' | 'warning' | 'info';
    toolId: string;
    message: string;
    metric: string;
    value: number;
    threshold: number;
  }>> {
    const alerts: Array<{
      severity: 'critical' | 'warning' | 'info';
      toolId: string;
      message: string;
      metric: string;
      value: number;
      threshold: number;
    }> = [];

    const systemMetrics = await this.getSystemMetrics();

    // Check error rate
    if (systemMetrics.errorRate > 0.2) {
      alerts.push({
        severity: 'critical',
        toolId: 'system',
        message: 'High error rate detected',
        metric: 'error_rate',
        value: systemMetrics.errorRate,
        threshold: 0.2
      });
    } else if (systemMetrics.errorRate > 0.1) {
      alerts.push({
        severity: 'warning',
        toolId: 'system',
        message: 'Elevated error rate',
        metric: 'error_rate',
        value: systemMetrics.errorRate,
        threshold: 0.1
      });
    }

    // Check average latency
    if (systemMetrics.averageLatency > 30000) {
      alerts.push({
        severity: 'critical',
        toolId: 'system',
        message: 'High latency detected',
        metric: 'latency',
        value: systemMetrics.averageLatency,
        threshold: 30000
      });
    } else if (systemMetrics.averageLatency > 15000) {
      alerts.push({
        severity: 'warning',
        toolId: 'system',
        message: 'Elevated latency',
        metric: 'latency',
        value: systemMetrics.averageLatency,
        threshold: 15000
      });
    }

    // Check resource utilization
    if (systemMetrics.resourceUtilization.memory > 90) {
      alerts.push({
        severity: 'critical',
        toolId: 'system',
        message: 'Memory utilization critical',
        metric: 'memory',
        value: systemMetrics.resourceUtilization.memory,
        threshold: 90
      });
    }

    return alerts;
  }

  /**
   * Export metrics to external monitoring system
   */
  async exportMetrics(format: 'prometheus' | 'datadog' | 'cloudwatch'): Promise<string> {
    const systemMetrics = await this.getSystemMetrics();

    switch (format) {
      case 'prometheus':
        return this.formatPrometheusMetrics(systemMetrics);
      case 'datadog':
        return JSON.stringify(this.formatDatadogMetrics(systemMetrics));
      case 'cloudwatch':
        return JSON.stringify(this.formatCloudWatchMetrics(systemMetrics));
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Flush metrics buffer to persistent storage
   */
  private async flushMetrics(): Promise<void> {
    if (this.metricsBuffer.length === 0) {
      return;
    }

    try {
      // In production, write to database or external monitoring service
      // For now, we'll keep them in memory and log summary
      console.log(`[ToolAnalytics] Flushed ${this.metricsBuffer.length} metrics`);

      // Keep only recent metrics in buffer (last hour)
      const oneHourAgo = new Date(Date.now() - 3600000);
      this.metricsBuffer = this.metricsBuffer.filter(m => m.startTime >= oneHourAgo);
    } catch (error) {
      console.error('[ToolAnalytics] Failed to flush metrics:', error);
    }
  }

  /**
   * Start background flush process
   */
  private startBackgroundFlush(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    this.bufferFlushInterval = setInterval(() => {
      this.flushMetrics().catch(error => {
        console.error('[ToolAnalytics] Background flush failed:', error);
      });
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Stop background flush process
   */
  stopBackgroundFlush(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }
  }

  /**
   * Format metrics for Prometheus
   */
  private formatPrometheusMetrics(metrics: SystemMetrics): string {
    return `
# HELP tool_executions_total Total number of tool executions
# TYPE tool_executions_total counter
tool_executions_total ${metrics.totalExecutions}

# HELP tool_latency_avg Average tool execution latency in ms
# TYPE tool_latency_avg gauge
tool_latency_avg ${metrics.averageLatency}

# HELP tool_error_rate Tool execution error rate
# TYPE tool_error_rate gauge
tool_error_rate ${metrics.errorRate}

# HELP tool_throughput Tool execution throughput per minute
# TYPE tool_throughput gauge
tool_throughput ${metrics.throughput}
    `.trim();
  }

  /**
   * Format metrics for Datadog
   */
  private formatDatadogMetrics(metrics: SystemMetrics): any {
    return {
      series: [
        {
          metric: 'chimaridata.tools.executions',
          points: [[Math.floor(metrics.timestamp.getTime() / 1000), metrics.totalExecutions]],
          type: 'count'
        },
        {
          metric: 'chimaridata.tools.latency',
          points: [[Math.floor(metrics.timestamp.getTime() / 1000), metrics.averageLatency]],
          type: 'gauge'
        },
        {
          metric: 'chimaridata.tools.error_rate',
          points: [[Math.floor(metrics.timestamp.getTime() / 1000), metrics.errorRate]],
          type: 'gauge'
        }
      ]
    };
  }

  /**
   * Format metrics for CloudWatch
   */
  private formatCloudWatchMetrics(metrics: SystemMetrics): any {
    return {
      Namespace: 'ChimariData/Tools',
      MetricData: [
        {
          MetricName: 'TotalExecutions',
          Value: metrics.totalExecutions,
          Unit: 'Count',
          Timestamp: metrics.timestamp.toISOString()
        },
        {
          MetricName: 'AverageLatency',
          Value: metrics.averageLatency,
          Unit: 'Milliseconds',
          Timestamp: metrics.timestamp.toISOString()
        },
        {
          MetricName: 'ErrorRate',
          Value: metrics.errorRate,
          Unit: 'Percent',
          Timestamp: metrics.timestamp.toISOString()
        }
      ]
    };
  }
}

// Export singleton instance
export const toolAnalyticsService = new ToolAnalyticsService();
