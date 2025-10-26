/**
 * Enhanced WebSocket Lifecycle Management
 * 
 * Provides robust WebSocket connection management with:
 * - Automatic reconnection strategies
 * - Advanced heartbeat monitoring
 * - Connection health tracking
 * - Graceful degradation handling
 * - Performance metrics collection
 */

import WebSocket from 'ws';

export interface ConnectionHealth {
  clientId: string;
  status: 'healthy' | 'degraded' | 'critical' | 'disconnected';
  lastPing: number;
  lastPong: number;
  latency: number;
  pingFailures: number;
  reconnectAttempts: number;
  connectionQuality: number; // 0-100 score
  consecutiveFailures: number;
}

export interface ReconnectionConfig {
  maxAttempts: number;
  baseDelay: number;        // Base delay in ms
  maxDelay: number;         // Maximum delay in ms
  backoffMultiplier: number;
  jitterFactor: number;     // Add randomness to prevent thundering herd
}

export interface HeartbeatConfig {
  pingInterval: number;     // How often to send pings (ms)
  pongTimeout: number;      // How long to wait for pong (ms)
  maxFailures: number;      // Max ping failures before disconnect
  degradedThreshold: number; // Latency threshold for degraded status (ms)
  criticalThreshold: number; // Latency threshold for critical status (ms)
}

export interface LifecycleMetrics {
  totalConnections: number;
  successfulConnections: number;
  failedConnections: number;
  totalReconnections: number;
  averageConnectionDuration: number;
  averageLatency: number;
  healthyConnections: number;
  degradedConnections: number;
  criticalConnections: number;
}

export class WebSocketLifecycleManager {
  private connectionHealth: Map<string, ConnectionHealth> = new Map();
  private reconnectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private metrics: LifecycleMetrics;
  
  private defaultReconnectionConfig: ReconnectionConfig = {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitterFactor: 0.3
  };
  
  private defaultHeartbeatConfig: HeartbeatConfig = {
    pingInterval: 30000,      // 30 seconds
    pongTimeout: 10000,       // 10 seconds
    maxFailures: 3,
    degradedThreshold: 1000,  // 1 second
    criticalThreshold: 5000   // 5 seconds
  };

  constructor(
    private reconnectionConfig: Partial<ReconnectionConfig> = {},
    private heartbeatConfig: Partial<HeartbeatConfig> = {}
  ) {
    this.reconnectionConfig = { ...this.defaultReconnectionConfig, ...reconnectionConfig };
    this.heartbeatConfig = { ...this.defaultHeartbeatConfig, ...heartbeatConfig };
    
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      totalReconnections: 0,
      averageConnectionDuration: 0,
      averageLatency: 0,
      healthyConnections: 0,
      degradedConnections: 0,
      criticalConnections: 0
    };
  }

  /**
   * Initialize connection monitoring for a new client
   */
  initializeConnection(clientId: string): void {
    const health: ConnectionHealth = {
      clientId,
      status: 'healthy',
      lastPing: Date.now(),
      lastPong: Date.now(),
      latency: 0,
      pingFailures: 0,
      reconnectAttempts: 0,
      connectionQuality: 100,
      consecutiveFailures: 0
    };

    this.connectionHealth.set(clientId, health);
    this.startHeartbeatMonitoring(clientId);
    this.metrics.totalConnections++;
    this.metrics.successfulConnections++;
    
    console.log(`WebSocket lifecycle initialized for client ${clientId}`);
  }

  /**
   * Start heartbeat monitoring for a client
   */
  private startHeartbeatMonitoring(clientId: string): void {
    const config = this.heartbeatConfig;
    
    const heartbeatTimer = setInterval(() => {
      this.performHeartbeatCheck(clientId);
    }, config.pingInterval);
    
    this.heartbeatTimers.set(clientId, heartbeatTimer);
  }

  /**
   * Perform heartbeat check for a client
   */
  private async performHeartbeatCheck(clientId: string): Promise<void> {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    const now = Date.now();
    const timeSinceLastPong = now - health.lastPong;
    
    // Check if previous ping timed out
    if (timeSinceLastPong > this.heartbeatConfig.pongTimeout && health.lastPing > health.lastPong) {
      health.pingFailures++;
      health.consecutiveFailures++;
      
      console.warn(`Ping timeout for client ${clientId}, failures: ${health.pingFailures}`);
      
      if (health.pingFailures >= this.heartbeatConfig.maxFailures) {
        this.handleConnectionFailure(clientId, 'heartbeat_failure');
        return;
      }
    }

    // Send new ping
    try {
      health.lastPing = now;
      await this.sendPing(clientId);
      
      // Update connection status based on latency
      this.updateConnectionStatus(clientId);
      
    } catch (error) {
      console.error(`Failed to send ping to client ${clientId}:`, error);
      this.handleConnectionFailure(clientId, 'ping_send_failure');
    }
  }

  /**
   * Handle pong response from client
   */
  handlePongReceived(clientId: string): void {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    const now = Date.now();
    health.lastPong = now;
    health.latency = now - health.lastPing;
    health.pingFailures = 0; // Reset failure count on successful pong
    health.consecutiveFailures = 0;
    
    // Update connection quality based on latency
    this.updateConnectionQuality(clientId);
    this.updateConnectionStatus(clientId);
    
    console.debug(`Pong received from client ${clientId}, latency: ${health.latency}ms`);
  }

  /**
   * Update connection status based on latency and health
   */
  private updateConnectionStatus(clientId: string): void {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    const { degradedThreshold, criticalThreshold } = this.heartbeatConfig;
    
    if (health.latency > criticalThreshold || health.pingFailures >= 2) {
      health.status = 'critical';
    } else if (health.latency > degradedThreshold || health.pingFailures >= 1) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }
    
    this.updateMetrics();
  }

  /**
   * Update connection quality score (0-100)
   */
  private updateConnectionQuality(clientId: string): void {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    let quality = 100;
    
    // Reduce quality based on latency
    if (health.latency > 100) {
      quality -= Math.min(50, health.latency / 100);
    }
    
    // Reduce quality based on ping failures
    quality -= health.pingFailures * 20;
    
    // Reduce quality based on consecutive failures
    quality -= health.consecutiveFailures * 10;
    
    health.connectionQuality = Math.max(0, Math.round(quality));
  }

  /**
   * Handle connection failure
   */
  private handleConnectionFailure(clientId: string, reason: string): void {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    console.error(`Connection failure for client ${clientId}: ${reason}`);
    
    health.status = 'disconnected';
    this.stopHeartbeatMonitoring(clientId);
    this.metrics.failedConnections++;
    
    // Attempt reconnection if configured
    this.scheduleReconnection(clientId, reason);
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnection(clientId: string, reason: string): void {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    const config = this.reconnectionConfig;
    
    if (health.reconnectAttempts >= config.maxAttempts) {
      console.error(`Max reconnection attempts reached for client ${clientId}`);
      this.cleanupConnection(clientId);
      return;
    }

    health.reconnectAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      config.baseDelay * Math.pow(config.backoffMultiplier, health.reconnectAttempts - 1),
      config.maxDelay
    );
    
    // Add jitter to prevent thundering herd
    const jitter = baseDelay * config.jitterFactor * (Math.random() - 0.5);
    const delay = Math.round(baseDelay + jitter);
    
    console.log(`Scheduling reconnection for client ${clientId} in ${delay}ms (attempt ${health.reconnectAttempts})`);
    
    const timer = setTimeout(() => {
      this.attemptReconnection(clientId, reason);
    }, delay);
    
    this.reconnectionTimers.set(clientId, timer);
  }

  /**
   * Attempt to reconnect a client
   */
  private async attemptReconnection(clientId: string, originalReason: string): Promise<void> {
    const health = this.connectionHealth.get(clientId);
    if (!health) return;

    console.log(`Attempting reconnection for client ${clientId} (attempt ${health.reconnectAttempts})`);
    
    try {
      // This would trigger the actual reconnection logic in the main WebSocket server
      // For now, we just simulate the reconnection attempt
      const success = await this.simulateReconnection(clientId);
      
      if (success) {
        console.log(`Reconnection successful for client ${clientId}`);
        health.status = 'healthy';
        health.reconnectAttempts = 0;
        health.pingFailures = 0;
        health.consecutiveFailures = 0;
        this.startHeartbeatMonitoring(clientId);
        this.metrics.totalReconnections++;
      } else {
        console.warn(`Reconnection failed for client ${clientId}`);
        this.scheduleReconnection(clientId, 'reconnection_failed');
      }
      
    } catch (error) {
      console.error(`Reconnection error for client ${clientId}:`, error);
      this.scheduleReconnection(clientId, 'reconnection_error');
    }
  }

  /**
   * Simulate reconnection attempt (would be replaced with actual logic)
   */
  private async simulateReconnection(clientId: string): Promise<boolean> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate 70% success rate for testing
    return Math.random() > 0.3;
  }

  /**
   * Send ping to client (would integrate with actual WebSocket)
   */
  private async sendPing(clientId: string): Promise<void> {
    // This would integrate with the actual WebSocket client
    // For now, just simulate the ping
    console.debug(`Sending ping to client ${clientId}`);
  }

  /**
   * Stop heartbeat monitoring for a client
   */
  private stopHeartbeatMonitoring(clientId: string): void {
    const timer = this.heartbeatTimers.get(clientId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(clientId);
    }
  }

  /**
   * Clean up connection resources
   */
  cleanupConnection(clientId: string): void {
    this.stopHeartbeatMonitoring(clientId);
    
    const reconnectTimer = this.reconnectionTimers.get(clientId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectionTimers.delete(clientId);
    }
    
    this.connectionHealth.delete(clientId);
    console.log(`Cleaned up connection resources for client ${clientId}`);
  }

  /**
   * Update lifecycle metrics
   */
  private updateMetrics(): void {
    let healthy = 0;
    let degraded = 0;
    let critical = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    this.connectionHealth.forEach(health => {
      switch (health.status) {
        case 'healthy':
          healthy++;
          break;
        case 'degraded':
          degraded++;
          break;
        case 'critical':
          critical++;
          break;
      }
      
      if (health.latency > 0) {
        totalLatency += health.latency;
        latencyCount++;
      }
    });

    this.metrics.healthyConnections = healthy;
    this.metrics.degradedConnections = degraded;
    this.metrics.criticalConnections = critical;
    this.metrics.averageLatency = latencyCount > 0 ? totalLatency / latencyCount : 0;
  }

  /**
   * Get connection health for a specific client
   */
  getConnectionHealth(clientId: string): ConnectionHealth | null {
    return this.connectionHealth.get(clientId) || null;
  }

  /**
   * Get all connection health statuses
   */
  getAllConnectionHealth(): Map<string, ConnectionHealth> {
    return new Map(this.connectionHealth);
  }

  /**
   * Get lifecycle metrics
   */
  getMetrics(): LifecycleMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  /**
   * Get system health summary
   */
  getHealthSummary(): {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    totalConnections: number;
    healthyPercentage: number;
    averageLatency: number;
    issues: string[];
  } {
    this.updateMetrics();
    
    const total = this.metrics.healthyConnections + this.metrics.degradedConnections + this.metrics.criticalConnections;
    const healthyPercentage = total > 0 ? (this.metrics.healthyConnections / total) * 100 : 100;
    
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    const issues: string[] = [];
    
    if (this.metrics.criticalConnections > 0) {
      overallHealth = 'critical';
      issues.push(`${this.metrics.criticalConnections} critical connections`);
    } else if (this.metrics.degradedConnections > 0 || healthyPercentage < 80) {
      overallHealth = 'degraded';
      issues.push(`${this.metrics.degradedConnections} degraded connections`);
    }
    
    if (this.metrics.averageLatency > this.heartbeatConfig.degradedThreshold) {
      issues.push(`High average latency: ${Math.round(this.metrics.averageLatency)}ms`);
    }
    
    return {
      overallHealth,
      totalConnections: total,
      healthyPercentage: Math.round(healthyPercentage),
      averageLatency: Math.round(this.metrics.averageLatency),
      issues
    };
  }

  /**
   * Force disconnect a client (for testing or maintenance)
   */
  forceDisconnect(clientId: string, reason: string): void {
    this.handleConnectionFailure(clientId, `forced_disconnect: ${reason}`);
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalConnections: 0,
      successfulConnections: 0,
      failedConnections: 0,
      totalReconnections: 0,
      averageConnectionDuration: 0,
      averageLatency: 0,
      healthyConnections: 0,
      degradedConnections: 0,
      criticalConnections: 0
    };
  }

  /**
   * Shutdown lifecycle manager
   */
  shutdown(): void {
    // Clear all timers
    this.heartbeatTimers.forEach(timer => clearInterval(timer));
    this.reconnectionTimers.forEach(timer => clearTimeout(timer));
    
    this.heartbeatTimers.clear();
    this.reconnectionTimers.clear();
    this.connectionHealth.clear();
    
    console.log('WebSocket Lifecycle Manager shutdown complete');
  }
}