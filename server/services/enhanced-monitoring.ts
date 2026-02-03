/**
 * Enhanced Performance Monitoring System
 * 
 * Comprehensive monitoring and metrics collection for ChimariData platform.
 * Provides real-time observability, alerting, and performance insights.
 * 
 * Features:
 * - System-wide metrics collection
 * - Real-time performance dashboards
 * - Intelligent alerting and notifications
 * - Resource usage monitoring
 * - Agent workflow analytics
 * - User experience metrics
 * - Predictive performance analysis
 */

import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';
import { performance } from 'perf_hooks';
import os from 'os';

export interface SystemMetrics {
  timestamp: Date;
  system: {
    cpuUsage: number;
    memoryUsage: {
      used: number;
      total: number;
      free: number;
      percentage: number;
    };
    diskUsage: {
      used: number;
      total: number;
      free: number;
      percentage: number;
    };
    networkIO: {
      bytesIn: number;
      bytesOut: number;
    };
    loadAverage: number[];
  };
  nodejs: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    uptime: number;
    eventLoopDelay: number;
  };
  database: {
    activeConnections: number;
    idleConnections: number;
    totalQueries: number;
    averageQueryTime: number;
    slowQueries: number;
    connectionErrors: number;
  };
  cache: {
    hitRate: number;
    memoryUsage: number;
    totalKeys: number;
    operationsPerSecond: number;
  };
  taskQueue: {
    queuedTasks: number;
    processingTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageProcessingTime: number;
    throughput: number;
  };
  agents: {
    totalAgents: number;
    activeAgents: number;
    tasksCompleted: number;
    averageTaskDuration: number;
    errorRate: number;
  };
}

export interface UserExperienceMetrics {
  timestamp: Date;
  userId?: string;
  sessionId: string;
  pageLoadTime: number;
  apiResponseTime: number;
  errorRate: number;
  userSatisfactionScore?: number;
  featureUsage: { [feature: string]: number };
  journeyCompletionRate: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: {
    metric: string;
    operator: '>' | '<' | '=' | '>=' | '<=';
    threshold: number;
    duration: number; // Duration in ms the condition must persist
  };
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  channels: ('email' | 'slack' | 'webhook')[];
  cooldown: number; // Minimum time between alerts in ms
  lastTriggered?: Date;
}

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertRule['severity'];
  message: string;
  metric: string;
  value: number;
  threshold: number;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged: boolean;
}

export interface PerformanceInsight {
  type: 'trend' | 'anomaly' | 'prediction' | 'recommendation';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  data: any;
  actionable: boolean;
  recommendations?: string[];
  createdAt: Date;
}

export class EnhancedMonitoringService extends EventEmitter {
  private metrics: SystemMetrics[] = [];
  private userMetrics: UserExperienceMetrics[] = [];
  private alerts: Alert[] = [];
  private alertRules: AlertRule[] = [];
  private insights: PerformanceInsight[] = [];
  
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  private insightGenerationInterval: NodeJS.Timeout | null = null;
  
  private maxMetricsHistory: number = 1440; // 24 hours of minute-by-minute data
  private alertCooldowns = new Map<string, Date>();
  
  private eventLoopMonitor: any = null;

  constructor(private config: {
    metricsInterval?: number;
    alertCheckInterval?: number;
    insightInterval?: number;
    enableEventLoopMonitoring?: boolean;
  } = {}) {
    super();
    
    this.config = {
      metricsInterval: 60000,        // 1 minute
      alertCheckInterval: 30000,     // 30 seconds
      insightInterval: 300000,       // 5 minutes
      enableEventLoopMonitoring: true,
      ...config
    };

    this.initializeDefaultAlertRules();
    this.startMonitoring();
  }

  /**
   * Start all monitoring processes
   */
  private startMonitoring(): void {
    // System metrics collection
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsInterval);

    // Alert checking
    this.alertCheckInterval = setInterval(() => {
      this.checkAlertRules();
    }, this.config.alertCheckInterval);

    // Insight generation
    this.insightGenerationInterval = setInterval(() => {
      this.generateInsights();
    }, this.config.insightInterval);

    // Event loop monitoring
    if (this.config.enableEventLoopMonitoring) {
      this.startEventLoopMonitoring();
    }

    console.log('Enhanced monitoring service started');
    this.emit('monitoring_started');
  }

  /**
   * Collect comprehensive system metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      const timestamp = new Date();
      
      // System metrics
      const systemMetrics = await this.getSystemMetrics();
      
      // Node.js metrics
      const nodejsMetrics = this.getNodeJSMetrics();
      
      // Database metrics (if available)
      const databaseMetrics = await this.getDatabaseMetrics();
      
      // Cache metrics (if available)
      const cacheMetrics = await this.getCacheMetrics();
      
      // Task queue metrics (if available)
      const taskQueueMetrics = await this.getTaskQueueMetrics();
      
      // Agent metrics (if available)
      const agentMetrics = await this.getAgentMetrics();

      const metrics: SystemMetrics = {
        timestamp,
        system: systemMetrics,
        nodejs: nodejsMetrics,
        database: databaseMetrics,
        cache: cacheMetrics,
        taskQueue: taskQueueMetrics,
        agents: agentMetrics
      };

      this.metrics.push(metrics);
      
      // Trim old metrics
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics = this.metrics.slice(-this.maxMetricsHistory);
      }

      this.emit('metrics_collected', metrics);
      
    } catch (error) {
      console.error('Failed to collect system metrics:', error);
    }
  }

  /**
   * Get system-level metrics
   */
  private async getSystemMetrics(): Promise<SystemMetrics['system']> {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const loadAvg = os.loadavg();

    // CPU usage calculation (simplified)
    const cpuUsage = loadAvg[0] / cpus.length * 100;

    return {
      cpuUsage: Math.min(100, Math.max(0, cpuUsage)),
      memoryUsage: {
        used: totalMem - freeMem,
        total: totalMem,
        free: freeMem,
        percentage: ((totalMem - freeMem) / totalMem) * 100
      },
      diskUsage: {
        used: 0, // Would require fs-extra or similar
        total: 0,
        free: 0,
        percentage: 0
      },
      networkIO: {
        bytesIn: 0, // Would require network monitoring
        bytesOut: 0
      },
      loadAverage: loadAvg
    };
  }

  /**
   * Get Node.js process metrics
   */
  private getNodeJSMetrics(): SystemMetrics['nodejs'] {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      uptime,
      eventLoopDelay: this.getEventLoopDelay()
    };
  }

  /**
   * Get database metrics (integrates with enhanced-db service)
   */
  private async getDatabaseMetrics(): Promise<SystemMetrics['database']> {
    try {
      // This would integrate with your enhanced database service
      const { getPoolStats } = await import('../db');
      const stats = getPoolStats();
      
      return {
        activeConnections: stats?.totalCount || 0,
        idleConnections: stats?.idleCount || 0,
        totalQueries: 0, // Would come from enhanced-db metrics
        averageQueryTime: 0,
        slowQueries: 0,
        connectionErrors: 0
      };
    } catch (error) {
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalQueries: 0,
        averageQueryTime: 0,
        slowQueries: 0,
        connectionErrors: 0
      };
    }
  }

  /**
   * Get cache metrics (integrates with enhanced-cache service)
   */
  private async getCacheMetrics(): Promise<SystemMetrics['cache']> {
    try {
      const { cacheService } = await import('./enhanced-cache');
      const metrics = cacheService.getMetrics();
      
      return {
        hitRate: metrics.hitRate,
        memoryUsage: metrics.memoryUsage,
        totalKeys: metrics.sets - metrics.deletes,
        operationsPerSecond: (metrics.hits + metrics.misses + metrics.sets) / 60 // Per minute to per second
      };
    } catch (error) {
      return {
        hitRate: 0,
        memoryUsage: 0,
        totalKeys: 0,
        operationsPerSecond: 0
      };
    }
  }

  /**
   * Get task queue metrics (integrates with enhanced-task-queue service)
   */
  private async getTaskQueueMetrics(): Promise<SystemMetrics['taskQueue']> {
    try {
      const { taskQueue } = await import('./enhanced-task-queue');
      const metrics = taskQueue.getMetrics();
      
      return {
        queuedTasks: metrics.queuedTasks,
        processingTasks: metrics.processingTasks,
        completedTasks: metrics.completedTasks,
        failedTasks: metrics.failedTasks,
        averageProcessingTime: metrics.averageProcessingTime,
        throughput: metrics.throughput
      };
    } catch (error) {
      return {
        queuedTasks: 0,
        processingTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageProcessingTime: 0,
        throughput: 0
      };
    }
  }

  /**
   * Get agent metrics
   */
  private async getAgentMetrics(): Promise<SystemMetrics['agents']> {
    try {
      const { taskQueue } = await import('./enhanced-task-queue');
      const agentCapacities = taskQueue.getAgentCapacities();
      
      const totalAgents = agentCapacities.size;
      const activeAgents = Array.from(agentCapacities.values())
        .filter(agent => agent.status === 'available' || agent.status === 'busy').length;
      
      const totalCompleted = Array.from(agentCapacities.values())
        .reduce((sum, agent) => sum + agent.performance.tasksCompleted, 0);
      
      const totalDuration = Array.from(agentCapacities.values())
        .reduce((sum, agent) => sum + agent.performance.totalDuration, 0);
      
      const totalErrors = Array.from(agentCapacities.values())
        .reduce((sum, agent) => sum + agent.performance.errors, 0);

      return {
        totalAgents,
        activeAgents,
        tasksCompleted: totalCompleted,
        averageTaskDuration: totalCompleted > 0 ? totalDuration / totalCompleted : 0,
        errorRate: totalCompleted > 0 ? totalErrors / totalCompleted : 0
      };
    } catch (error) {
      return {
        totalAgents: 0,
        activeAgents: 0,
        tasksCompleted: 0,
        averageTaskDuration: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Record user experience metrics
   */
  recordUserMetrics(metrics: Omit<UserExperienceMetrics, 'timestamp'>): void {
    const userMetric: UserExperienceMetrics = {
      ...metrics,
      timestamp: new Date()
    };

    this.userMetrics.push(userMetric);
    
    // Trim old user metrics (keep last 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.userMetrics = this.userMetrics.filter(m => m.timestamp.getTime() > cutoff);

    this.emit('user_metrics_recorded', userMetric);
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    this.alertRules = [
      {
        id: 'high_cpu_usage',
        name: 'High CPU Usage',
        condition: {
          metric: 'system.cpuUsage',
          operator: '>',
          threshold: 80,
          duration: 300000 // 5 minutes
        },
        severity: 'warning',
        enabled: true,
        channels: ['email'],
        cooldown: 900000 // 15 minutes
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        condition: {
          metric: 'system.memoryUsage.percentage',
          operator: '>',
          threshold: 85,
          duration: 300000
        },
        severity: 'warning',
        enabled: true,
        channels: ['email'],
        cooldown: 900000
      },
      {
        id: 'database_connection_errors',
        name: 'Database Connection Errors',
        condition: {
          metric: 'database.connectionErrors',
          operator: '>',
          threshold: 5,
          duration: 60000 // 1 minute
        },
        severity: 'error',
        enabled: true,
        channels: ['email', 'slack'],
        cooldown: 600000 // 10 minutes
      },
      {
        id: 'low_cache_hit_rate',
        name: 'Low Cache Hit Rate',
        condition: {
          metric: 'cache.hitRate',
          operator: '<',
          threshold: 0.3,
          duration: 600000 // 10 minutes
        },
        severity: 'warning',
        enabled: true,
        channels: ['email'],
        cooldown: 1800000 // 30 minutes
      },
      {
        id: 'high_task_queue_backlog',
        name: 'High Task Queue Backlog',
        condition: {
          metric: 'taskQueue.queuedTasks',
          operator: '>',
          threshold: 500,
          duration: 300000
        },
        severity: 'warning',
        enabled: true,
        channels: ['email'],
        cooldown: 600000
      },
      {
        id: 'high_agent_error_rate',
        name: 'High Agent Error Rate',
        condition: {
          metric: 'agents.errorRate',
          operator: '>',
          threshold: 0.1, // 10% error rate
          duration: 300000
        },
        severity: 'error',
        enabled: true,
        channels: ['email', 'slack'],
        cooldown: 900000
      }
    ];
  }

  /**
   * Check alert rules against current metrics
   */
  private checkAlertRules(): void {
    if (this.metrics.length === 0) return;

    const latestMetrics = this.metrics[this.metrics.length - 1];
    
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastAlert = this.alertCooldowns.get(rule.id);
      if (lastAlert && Date.now() - lastAlert.getTime() < rule.cooldown) {
        continue;
      }

      const value = this.getMetricValue(latestMetrics, rule.condition.metric);
      if (value === null || value === undefined) continue;

      const conditionMet = this.evaluateCondition(value, rule.condition);
      
      if (conditionMet) {
        this.triggerAlert(rule, value);
      }
    }
  }

  /**
   * Extract metric value from metrics object
   */
  private getMetricValue(metrics: SystemMetrics, metricPath: string): number | null {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, condition: AlertRule['condition']): boolean {
    switch (condition.operator) {
      case '>': return value > condition.threshold;
      case '<': return value < condition.threshold;
      case '>=': return value >= condition.threshold;
      case '<=': return value <= condition.threshold;
      case '=': return value === condition.threshold;
      default: return false;
    }
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(rule: AlertRule, value: number): void {
    const alert: Alert = {
      id: `alert_${nanoid()}`,
      ruleId: rule.id,
      severity: rule.severity,
      message: `${rule.name}: ${rule.condition.metric} is ${value} (threshold: ${rule.condition.threshold})`,
      metric: rule.condition.metric,
      value,
      threshold: rule.condition.threshold,
      triggeredAt: new Date(),
      acknowledged: false
    };

    this.alerts.push(alert);
    this.alertCooldowns.set(rule.id, new Date());

    // Send notifications
    this.sendAlertNotifications(alert, rule);

    this.emit('alert_triggered', alert);
    console.warn(`Alert triggered: ${alert.message}`);
  }

  /**
   * Send alert notifications through configured channels
   */
  private async sendAlertNotifications(alert: Alert, rule: AlertRule): Promise<void> {
    for (const channel of rule.channels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmailAlert(alert);
            break;
          case 'slack':
            await this.sendSlackAlert(alert);
            break;
          case 'webhook':
            await this.sendWebhookAlert(alert);
            break;
        }
      } catch (error) {
        console.error(`Failed to send alert via ${channel}:`, error);
      }
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<void> {
    // Implement email notification
    console.log(`Email alert: ${alert.message}`);
  }

  private async sendSlackAlert(alert: Alert): Promise<void> {
    // Implement Slack notification
    console.log(`Slack alert: ${alert.message}`);
  }

  private async sendWebhookAlert(alert: Alert): Promise<void> {
    // Implement webhook notification
    console.log(`Webhook alert: ${alert.message}`);
  }

  /**
   * Generate performance insights
   */
  private generateInsights(): void {
    if (this.metrics.length < 10) return; // Need sufficient data

    try {
      // Analyze trends
      this.analyzePerformanceTrends();
      
      // Detect anomalies
      this.detectAnomalies();
      
      // Generate predictions
      this.generatePredictions();
      
      // Create recommendations
      this.generateRecommendations();

    } catch (error) {
      console.error('Failed to generate insights:', error);
    }
  }

  private analyzePerformanceTrends(): void {
    const recentMetrics = this.metrics.slice(-60); // Last hour
    
    // CPU trend analysis
    const cpuValues = recentMetrics.map(m => m.system.cpuUsage);
    const cpuTrend = this.calculateTrend(cpuValues);
    
    if (Math.abs(cpuTrend) > 5) { // Significant trend
      this.insights.push({
        type: 'trend',
        title: `CPU Usage ${cpuTrend > 0 ? 'Increasing' : 'Decreasing'} Trend`,
        description: `CPU usage has been ${cpuTrend > 0 ? 'rising' : 'falling'} by ${Math.abs(cpuTrend).toFixed(1)}% over the last hour`,
        impact: cpuTrend > 10 ? 'high' : cpuTrend > 5 ? 'medium' : 'low',
        confidence: 0.8,
        data: { trend: cpuTrend, values: cpuValues },
        actionable: true,
        recommendations: cpuTrend > 0 ? [
          'Monitor CPU-intensive processes',
          'Consider scaling resources',
          'Optimize algorithms'
        ] : [],
        createdAt: new Date()
      });
    }
  }

  private detectAnomalies(): void {
    const recentMetrics = this.metrics.slice(-30); // Last 30 minutes
    
    // Simple anomaly detection using z-score
    const memoryValues = recentMetrics.map(m => m.system.memoryUsage.percentage);
    const mean = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
    const std = Math.sqrt(memoryValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / memoryValues.length);
    
    const latest = memoryValues[memoryValues.length - 1];
    const zScore = Math.abs((latest - mean) / std);
    
    if (zScore > 2) { // Significant anomaly
      this.insights.push({
        type: 'anomaly',
        title: 'Memory Usage Anomaly Detected',
        description: `Current memory usage (${latest.toFixed(1)}%) is significantly different from normal patterns`,
        impact: zScore > 3 ? 'high' : 'medium',
        confidence: Math.min(0.95, zScore / 3),
        data: { zScore, current: latest, mean, std },
        actionable: true,
        recommendations: [
          'Investigate memory-intensive processes',
          'Check for memory leaks',
          'Monitor garbage collection'
        ],
        createdAt: new Date()
      });
    }
  }

  private generatePredictions(): void {
    // Simple linear regression for prediction
    const values = this.metrics.slice(-120).map(m => m.taskQueue.queuedTasks); // Last 2 hours
    
    if (values.length > 10) {
      const trend = this.calculateTrend(values);
      const currentValue = values[values.length - 1];
      const predicted30min = currentValue + (trend * 30);
      
      if (predicted30min > 1000) { // Predict overload
        this.insights.push({
          type: 'prediction',
          title: 'Task Queue Overload Predicted',
          description: `Based on current trends, task queue may reach ${predicted30min.toFixed(0)} tasks in 30 minutes`,
          impact: 'high',
          confidence: 0.7,
          data: { trend, current: currentValue, predicted: predicted30min },
          actionable: true,
          recommendations: [
            'Scale up agent capacity',
            'Optimize task processing',
            'Implement load balancing'
          ],
          createdAt: new Date()
        });
      }
    }
  }

  private generateRecommendations(): void {
    const latest = this.metrics[this.metrics.length - 1];
    
    // Cache optimization recommendation
    if (latest.cache.hitRate < 0.5) {
      this.insights.push({
        type: 'recommendation',
        title: 'Cache Optimization Opportunity',
        description: `Cache hit rate is ${(latest.cache.hitRate * 100).toFixed(1)}%. Optimizing cache strategy could improve performance`,
        impact: 'medium',
        confidence: 0.85,
        data: { hitRate: latest.cache.hitRate },
        actionable: true,
        recommendations: [
          'Review cache TTL settings',
          'Implement cache warming',
          'Analyze cache key patterns'
        ],
        createdAt: new Date()
      });
    }
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    const y = values;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  private startEventLoopMonitoring(): void {
    const hrtime = process.hrtime;
    let lastTime = hrtime();
    
    setInterval(() => {
      const currentTime = hrtime(lastTime);
      const delay = currentTime[0] * 1000 + currentTime[1] * 1e-6 - 10; // Expected 10ms
      
      if (delay > 50) { // Significant delay
        this.emit('event_loop_delay', { delay });
      }
      
      lastTime = hrtime();
    }, 10);
  }

  private getEventLoopDelay(): number {
    // This would return actual event loop delay from monitoring
    return 0; // Placeholder
  }

  /**
   * Get current system metrics
   */
  getCurrentMetrics(): SystemMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(hours: number = 1): SystemMetrics[] {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.resolvedAt);
  }

  /**
   * Get performance insights
   */
  getInsights(limit: number = 10): PerformanceInsight[] {
    return this.insights
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert_acknowledged', alert);
      return true;
    }
    return false;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolvedAt = new Date();
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  /**
   * Shutdown monitoring service
   */
  shutdown(): void {
    console.log('Shutting down monitoring service...');
    
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.alertCheckInterval) clearInterval(this.alertCheckInterval);
    if (this.insightGenerationInterval) clearInterval(this.insightGenerationInterval);
    
    this.emit('monitoring_stopped');
    console.log('Monitoring service shutdown complete');
  }
}

// Export singleton instance
export const monitoringService = new EnhancedMonitoringService();
export default monitoringService;