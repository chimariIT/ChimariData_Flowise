/**
 * Agent Message Broker
 *
 * Redis-based pub/sub system for real-time agent communication
 * Replaces polling-based coordination with event-driven architecture
 *
 * Features:
 * - Real-time message delivery between agents
 * - Request/response pattern with timeout
 * - Broadcast messaging
 * - Message persistence (optional)
 * - Agent status tracking
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';

// ==========================================
// MESSAGE TYPES
// ==========================================

export interface AgentMessage {
  id: string;
  from: string; // Agent ID (e.g., 'project_manager', 'data_scientist')
  to: string; // Agent ID or 'broadcast'
  type: 'task' | 'checkpoint' | 'status' | 'result' | 'error' | 'ping';
  payload: any;
  timestamp: Date;
  correlationId?: string; // For request/response tracking
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  ttl?: number; // Time-to-live in seconds
}

export interface AgentCheckpoint {
  checkpointId: string;
  projectId: string;
  agentId: string;
  step: string;
  question: string;
  options: string[];
  artifacts?: any[];
  timestamp: Date;
}

export interface AgentStatus {
  agentId: string;
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentTask?: string;
  lastActivity: Date;
  queuedTasks: number;
  activeConnections: number;
}

// ==========================================
// MESSAGE BROKER
// ==========================================

export class AgentMessageBroker extends EventEmitter {
  private publisher: Redis;
  private subscriber: Redis;
  private agentChannels: Map<string, string> = new Map();
  private pendingResponses: Map<string, NodeJS.Timeout> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();

  constructor(redisUrl?: string) {
    super();

    const connectionString = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';

    this.publisher = new Redis(connectionString, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.subscriber = new Redis(connectionString, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.setupEventHandlers();
    this.subscriber.on('message', this.handleMessage.bind(this));
    this.subscriber.on('pmessage', this.handlePatternMessage.bind(this));

    console.log('Agent Message Broker initialized');
  }

  private setupEventHandlers(): void {
    this.publisher.on('error', (error) => {
      console.error('Redis publisher error:', error);
      this.emit('error', { source: 'publisher', error });
    });

    this.subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
      this.emit('error', { source: 'subscriber', error });
    });

    this.publisher.on('connect', () => {
      console.log('Redis publisher connected');
    });

    this.subscriber.on('connect', () => {
      console.log('Redis subscriber connected');
    });
  }

  // ==========================================
  // AGENT REGISTRATION
  // ==========================================

  /**
   * Register an agent to receive messages
   */
  async registerAgent(agentId: string): Promise<void> {
    const channel = `agent:${agentId}`;
    this.agentChannels.set(agentId, channel);

    // Subscribe to agent-specific channel and broadcast channel
    await this.subscriber.subscribe(channel);
    await this.subscriber.subscribe('agent:broadcast');

    // Initialize agent status
    this.agentStatuses.set(agentId, {
      agentId,
      status: 'idle',
      lastActivity: new Date(),
      queuedTasks: 0,
      activeConnections: 1,
    });

    console.log(`Agent ${agentId} registered on channel ${channel}`);
    this.emit('agent_registered', { agentId, channel });
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const channel = this.agentChannels.get(agentId);
    if (channel) {
      await this.subscriber.unsubscribe(channel);
      this.agentChannels.delete(agentId);
    }

    this.agentStatuses.delete(agentId);
    console.log(`Agent ${agentId} unregistered`);
    this.emit('agent_unregistered', { agentId });
  }

  // ==========================================
  // MESSAGE SENDING
  // ==========================================

  /**
   * Send a message to a specific agent or broadcast
   */
  async sendMessage(message: Omit<AgentMessage, 'id' | 'timestamp'>): Promise<void> {
    const fullMessage: AgentMessage = {
      ...message,
      id: nanoid(),
      timestamp: new Date(),
    };

    const channel = message.to === 'broadcast'
      ? 'agent:broadcast'
      : `agent:${message.to}`;

    await this.publisher.publish(channel, JSON.stringify(fullMessage));

    // Update sender status
    this.updateAgentActivity(message.from);

    this.emit('message_sent', fullMessage);
  }

  /**
   * Send a message and wait for response (request/response pattern)
   */
  async sendAndWait<T = any>(
    message: Omit<AgentMessage, 'id' | 'timestamp' | 'correlationId'>,
    timeout: number = 30000
  ): Promise<T> {
    const correlationId = nanoid();
    const fullMessage: AgentMessage = {
      ...message,
      id: nanoid(),
      timestamp: new Date(),
      correlationId,
    };

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponses.delete(correlationId);
        this.off(`response:${correlationId}`, responseHandler);
        reject(new Error(`Agent response timeout after ${timeout}ms`));
      }, timeout);

      this.pendingResponses.set(correlationId, timeoutId);

      const responseHandler = (response: T) => {
        const timeoutHandle = this.pendingResponses.get(correlationId);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          this.pendingResponses.delete(correlationId);
        }
        resolve(response);
      };

      this.once(`response:${correlationId}`, responseHandler);

      // Send the message
      this.sendMessage(fullMessage).catch(reject);
    });
  }

  /**
   * Broadcast to all agents
   */
  async broadcast(message: Omit<AgentMessage, 'id' | 'timestamp' | 'to'>): Promise<void> {
    await this.sendMessage({
      ...message,
      to: 'broadcast',
    });
  }

  // ==========================================
  // CHECKPOINT COMMUNICATION
  // ==========================================

  /**
   * Send checkpoint to user for approval
   */
  async sendCheckpoint(checkpoint: AgentCheckpoint): Promise<string> {
    const message: Omit<AgentMessage, 'id' | 'timestamp'> = {
      from: checkpoint.agentId,
      to: 'user_interface', // Special channel for UI
      type: 'checkpoint',
      payload: checkpoint,
      priority: 'high',
    };

    await this.sendMessage(message);
    return checkpoint.checkpointId;
  }

  /**
   * Wait for checkpoint approval from user
   */
  async waitForCheckpointResponse(checkpointId: string, timeout: number = 300000): Promise<{
    approved: boolean;
    feedback?: string;
    modifications?: any;
  }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(`checkpoint:${checkpointId}`, responseHandler);
        reject(new Error(`Checkpoint response timeout after ${timeout}ms`));
      }, timeout);

      const responseHandler = (response: any) => {
        clearTimeout(timeoutId);
        resolve(response);
      };

      this.once(`checkpoint:${checkpointId}`, responseHandler);
    });
  }

  /**
   * Submit checkpoint response (called by UI)
   */
  async submitCheckpointResponse(checkpointId: string, response: {
    approved: boolean;
    feedback?: string;
    modifications?: any;
  }): Promise<void> {
    this.emit(`checkpoint:${checkpointId}`, response);
  }

  // ==========================================
  // AGENT STATUS
  // ==========================================

  /**
   * Update agent status
   */
  updateAgentStatus(agentId: string, status: Partial<AgentStatus>): void {
    const current = this.agentStatuses.get(agentId) || {
      agentId,
      status: 'idle',
      lastActivity: new Date(),
      queuedTasks: 0,
      activeConnections: 0,
    };

    const updated = {
      ...current,
      ...status,
      lastActivity: new Date(),
    };

    this.agentStatuses.set(agentId, updated);
    this.emit('agent_status_changed', updated);

    // Broadcast status update to other agents
    this.broadcast({
      from: agentId,
      type: 'status',
      payload: updated,
      priority: 'low',
    }).catch(console.error);
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId: string): AgentStatus | null {
    return this.agentStatuses.get(agentId) || null;
  }

  /**
   * Get all agent statuses
   */
  getAllAgentStatuses(): AgentStatus[] {
    return Array.from(this.agentStatuses.values());
  }

  // ==========================================
  // MESSAGE HANDLING
  // ==========================================

  private handleMessage(channel: string, message: string): void {
    try {
      const parsed: AgentMessage = JSON.parse(message);

      // Handle correlation responses
      if (parsed.correlationId) {
        this.emit(`response:${parsed.correlationId}`, parsed.payload);
      }

      // Update recipient activity
      const agentId = channel.replace('agent:', '');
      if (agentId !== 'broadcast') {
        this.updateAgentActivity(agentId);
      }

      // Emit general events
      this.emit('message', parsed);
      this.emit(`message:${parsed.type}`, parsed);

      // Emit agent-specific events
      if (parsed.to !== 'broadcast') {
        this.emit(`message:${parsed.to}`, parsed);
      }

    } catch (error) {
      console.error('Failed to parse agent message:', error);
      this.emit('parse_error', { channel, message, error });
    }
  }

  private handlePatternMessage(pattern: string, channel: string, message: string): void {
    // Handle pattern-based subscriptions (for future use)
    this.handleMessage(channel, message);
  }

  private updateAgentActivity(agentId: string): void {
    const status = this.agentStatuses.get(agentId);
    if (status) {
      status.lastActivity = new Date();
      this.agentStatuses.set(agentId, status);
    }
  }

  // ==========================================
  // HEALTH & MONITORING
  // ==========================================

  /**
   * Check if broker is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.publisher.ping();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get broker statistics
   */
  getStats(): {
    registeredAgents: number;
    pendingResponses: number;
    channels: number;
    uptime: number;
  } {
    return {
      registeredAgents: this.agentChannels.size,
      pendingResponses: this.pendingResponses.size,
      channels: this.agentChannels.size + 1, // +1 for broadcast
      uptime: process.uptime(),
    };
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  /**
   * Shutdown broker gracefully
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down Agent Message Broker...');

    // Clear all pending timeouts
    for (const timeout of this.pendingResponses.values()) {
      clearTimeout(timeout);
    }
    this.pendingResponses.clear();

    // Unsubscribe from all channels
    await this.subscriber.unsubscribe();

    // Close Redis connections
    await this.subscriber.quit();
    await this.publisher.quit();

    this.removeAllListeners();

    console.log('Agent Message Broker shut down');
  }
}

// ==========================================
// SINGLETON
// ==========================================

let messageBroker: AgentMessageBroker | null = null;

export function getMessageBroker(redisUrl?: string): AgentMessageBroker {
  if (!messageBroker) {
    messageBroker = new AgentMessageBroker(redisUrl);
  }
  return messageBroker;
}

/**
 * Reset singleton (for testing)
 */
export function resetMessageBroker(): void {
  if (messageBroker) {
    messageBroker.shutdown().catch(console.error);
    messageBroker = null;
  }
}
