// server/services/performance-webhook-service.ts
import fetch from 'node-fetch';

export interface PerformanceMetric {
    timestamp: Date;
    service: string;
    operation: string;
    duration: number;
    status: 'success' | 'error' | 'warning';
    details: Record<string, any>;
    userId?: string;
    sessionId?: string;
}

export interface WebhookEndpoint {
    id: string;
    url: string;
    secret?: string;
    enabled: boolean;
    events: string[];
    thresholds: {
        slowOperationMs?: number;
        errorRate?: number;
        concurrentUsers?: number;
    };
    retrySettings: {
        maxRetries: number;
        retryDelay: number;
    };
    headers?: Record<string, string>;
}

export interface PerformanceAlert {
    type: 'slow_operation' | 'high_error_rate' | 'high_load' | 'system_health';
    severity: 'low' | 'medium' | 'high' | 'critical';
    metric: PerformanceMetric;
    threshold: number;
    message: string;
    aggregation?: {
        count: number;
        timeWindow: string;
        avgDuration: number;
    };
}

class PerformanceWebhookService {
    private webhookEndpoints: Map<string, WebhookEndpoint> = new Map();
    private metricsBuffer: PerformanceMetric[] = [];
    private alertHistory: Map<string, Date> = new Map();
    private readonly bufferSize = 1000;
    private readonly batchInterval = 5000; // 5 seconds
    private batchTimer?: NodeJS.Timeout;

    constructor() {
        this.initializeDefaultEndpoints();
        this.startBatchProcessor();
    }

    private initializeDefaultEndpoints() {
        // Default webhook endpoint for development/testing
        if (process.env.PERFORMANCE_WEBHOOK_URL) {
            this.registerWebhook({
                id: 'default',
                url: process.env.PERFORMANCE_WEBHOOK_URL,
                secret: process.env.PERFORMANCE_WEBHOOK_SECRET,
                enabled: true,
                events: ['slow_operation', 'high_error_rate', 'system_health'],
                thresholds: {
                    slowOperationMs: 1000,
                    errorRate: 0.1, // 10%
                    concurrentUsers: 100
                },
                retrySettings: {
                    maxRetries: 3,
                    retryDelay: 1000
                },
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'ChimariData-Performance-Monitor/1.0'
                }
            });
        }
    }

    registerWebhook(endpoint: WebhookEndpoint): void {
        this.webhookEndpoints.set(endpoint.id, endpoint);
        console.log(`📡 Registered webhook endpoint: ${endpoint.id} -> ${endpoint.url}`);
    }

    unregisterWebhook(id: string): boolean {
        const removed = this.webhookEndpoints.delete(id);
        if (removed) {
            console.log(`📡 Unregistered webhook endpoint: ${id}`);
        }
        return removed;
    }

    async recordMetric(metric: PerformanceMetric): Promise<void> {
        // Add to buffer for batch processing
        this.metricsBuffer.push(metric);
        
        // Trim buffer if it gets too large
        if (this.metricsBuffer.length > this.bufferSize) {
            this.metricsBuffer = this.metricsBuffer.slice(-this.bufferSize);
        }

        // Check for immediate alerts
        await this.checkForAlerts(metric);
    }

    private async checkForAlerts(metric: PerformanceMetric): Promise<void> {
        for (const [id, endpoint] of this.webhookEndpoints.entries()) {
            if (!endpoint.enabled) continue;

            // Check slow operation threshold
            if (endpoint.thresholds.slowOperationMs && 
                metric.duration > endpoint.thresholds.slowOperationMs &&
                endpoint.events.includes('slow_operation')) {
                
                const alert: PerformanceAlert = {
                    type: 'slow_operation',
                    severity: this.calculateSeverity(metric.duration, endpoint.thresholds.slowOperationMs),
                    metric,
                    threshold: endpoint.thresholds.slowOperationMs,
                    message: `Slow operation detected: ${metric.service}.${metric.operation} took ${metric.duration}ms`
                };

                await this.sendAlert(endpoint, alert);
            }

            // Check error rate (requires recent metrics analysis)
            if (endpoint.thresholds.errorRate && 
                endpoint.events.includes('high_error_rate')) {
                await this.checkErrorRate(endpoint, metric);
            }
        }
    }

    private calculateSeverity(value: number, threshold: number): 'low' | 'medium' | 'high' | 'critical' {
        const ratio = value / threshold;
        if (ratio >= 5) return 'critical';
        if (ratio >= 3) return 'high';
        if (ratio >= 2) return 'medium';
        return 'low';
    }

    private async checkErrorRate(endpoint: WebhookEndpoint, currentMetric: PerformanceMetric): Promise<void> {
        const recentMetrics = this.getRecentMetrics(5 * 60 * 1000); // Last 5 minutes
        const serviceMetrics = recentMetrics.filter(m => 
            m.service === currentMetric.service && m.operation === currentMetric.operation
        );

        if (serviceMetrics.length < 10) return; // Need minimum sample size

        const errorCount = serviceMetrics.filter(m => m.status === 'error').length;
        const errorRate = errorCount / serviceMetrics.length;

        if (errorRate > (endpoint.thresholds.errorRate || 0.1)) {
            const alertKey = `error_rate_${currentMetric.service}_${currentMetric.operation}`;
            const lastAlert = this.alertHistory.get(alertKey);
            
            // Avoid spam - only alert once per 10 minutes for same issue
            if (!lastAlert || (Date.now() - lastAlert.getTime()) > 10 * 60 * 1000) {
                const alert: PerformanceAlert = {
                    type: 'high_error_rate',
                    severity: errorRate > 0.5 ? 'critical' : errorRate > 0.25 ? 'high' : 'medium',
                    metric: currentMetric,
                    threshold: endpoint.thresholds.errorRate,
                    message: `High error rate detected: ${(errorRate * 100).toFixed(1)}% errors in ${currentMetric.service}.${currentMetric.operation}`,
                    aggregation: {
                        count: serviceMetrics.length,
                        timeWindow: '5m',
                        avgDuration: serviceMetrics.reduce((sum, m) => sum + m.duration, 0) / serviceMetrics.length
                    }
                };

                await this.sendAlert(endpoint, alert);
                this.alertHistory.set(alertKey, new Date());
            }
        }
    }

    private getRecentMetrics(timeWindowMs: number): PerformanceMetric[] {
        const cutoff = new Date(Date.now() - timeWindowMs);
        return this.metricsBuffer.filter(m => m.timestamp >= cutoff);
    }

    private async sendAlert(endpoint: WebhookEndpoint, alert: PerformanceAlert): Promise<void> {
        const payload = {
            timestamp: new Date().toISOString(),
            source: 'ChimariData-Performance-Monitor',
            alert,
            environment: process.env.NODE_ENV || 'development'
        };

        await this.sendWebhook(endpoint, payload, 0);
    }

    private async sendWebhook(endpoint: WebhookEndpoint, payload: any, attempt: number): Promise<void> {
        try {
            const headers: Record<string, string> = {
                ...endpoint.headers,
                'Content-Type': 'application/json'
            };

            // Add HMAC signature if secret is provided
            if (endpoint.secret) {
                const crypto = await import('crypto');
                const signature = crypto
                    .createHmac('sha256', endpoint.secret)
                    .update(JSON.stringify(payload))
                    .digest('hex');
                headers['X-Chimari-Signature'] = `sha256=${signature}`;
            }

            const response = await fetch(endpoint.url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                timeout: 10000 // 10 second timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log(`📡 Webhook sent successfully to ${endpoint.id}: ${response.status}`);
        } catch (error: any) {
            console.error(`📡 Webhook failed to ${endpoint.id} (attempt ${attempt + 1}):`, error.message);

            // Retry logic
            if (attempt < endpoint.retrySettings.maxRetries) {
                setTimeout(() => {
                    this.sendWebhook(endpoint, payload, attempt + 1);
                }, endpoint.retrySettings.retryDelay * Math.pow(2, attempt)); // Exponential backoff
            } else {
                console.error(`📡 Webhook to ${endpoint.id} failed after ${endpoint.retrySettings.maxRetries} attempts`);
            }
        }
    }

    private startBatchProcessor(): void {
        this.batchTimer = setInterval(() => {
            this.processBatchMetrics();
        }, this.batchInterval);
    }

    private async processBatchMetrics(): Promise<void> {
        if (this.metricsBuffer.length === 0) return;

        const recentMetrics = this.getRecentMetrics(this.batchInterval);
        if (recentMetrics.length === 0) return;

        // Generate system health summary
        const healthSummary = this.generateHealthSummary(recentMetrics);
        
        for (const [id, endpoint] of this.webhookEndpoints.entries()) {
            if (!endpoint.enabled || !endpoint.events.includes('system_health')) continue;

            const payload = {
                timestamp: new Date().toISOString(),
                source: 'ChimariData-Performance-Monitor',
                type: 'system_health_batch',
                summary: healthSummary,
                metrics: recentMetrics,
                environment: process.env.NODE_ENV || 'development'
            };

            await this.sendWebhook(endpoint, payload, 0);
        }
    }

    private generateHealthSummary(metrics: PerformanceMetric[]) {
        const services = new Map<string, { operations: Map<string, PerformanceMetric[]> }>();
        
        // Group metrics by service and operation
        metrics.forEach(metric => {
            if (!services.has(metric.service)) {
                services.set(metric.service, { operations: new Map() });
            }
            const service = services.get(metric.service)!;
            if (!service.operations.has(metric.operation)) {
                service.operations.set(metric.operation, []);
            }
            service.operations.get(metric.operation)!.push(metric);
        });

        const summary: any = {
            totalRequests: metrics.length,
            services: {}
        };

        services.forEach((service, serviceName) => {
            summary.services[serviceName] = {
                operations: {}
            };

            service.operations.forEach((opMetrics, operationName) => {
                const durations = opMetrics.map(m => m.duration);
                const errorCount = opMetrics.filter(m => m.status === 'error').length;
                
                summary.services[serviceName].operations[operationName] = {
                    count: opMetrics.length,
                    avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
                    minDuration: Math.min(...durations),
                    maxDuration: Math.max(...durations),
                    errorRate: errorCount / opMetrics.length,
                    successRate: (opMetrics.length - errorCount) / opMetrics.length
                };
            });
        });

        return summary;
    }

    // Public API methods
    getWebhookEndpoints(): WebhookEndpoint[] {
        return Array.from(this.webhookEndpoints.values());
    }

    getMetricsSummary(timeWindowMs: number = 60000): any {
        const metrics = this.getRecentMetrics(timeWindowMs);
        return this.generateHealthSummary(metrics);
    }

    stop(): void {
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
            this.batchTimer = undefined;
        }
    }
}

// Export singleton instance
export const performanceWebhookService = new PerformanceWebhookService();
export { PerformanceWebhookService };