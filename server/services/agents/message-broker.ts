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

export interface BrokerEventPayload<T = any> {
  event: string;
  data: T;
  timestamp: string;
}

export interface BrokerEventTelemetry {
  event: string;
  listenerCount: number;
  totalEmitted: number;
  lastEmittedAt?: number;
  lastEmittedArgsCount?: number;
  lastSubscribedAt?: number;
  lastUnsubscribedAt?: number;
  totalUncaughtErrors?: number;
}

export interface PendingCheckpointInfo {
  checkpointId: string;
  projectId?: string | null;
  agentName?: string | null;
  agentId?: string | null;
  stepId?: string | null;
  step?: string | null;
  journeyId?: string | null;
  question?: string | null;
  options?: string[];
  artifacts?: any[];
  createdAt: number;
  requestedAt: number;
  timeoutAt?: number | null;
  timeoutMs?: number | null;
  resolvedAt?: number;
  timedOutAt?: number;
  status?: 'pending' | 'resolved' | 'timeout';
  response?: {
    approved: boolean;
    feedback?: string;
    modifications?: any;
  };
}

interface PendingCheckpointRecord extends PendingCheckpointInfo {
  timer: NodeJS.Timeout;
}

// ==========================================
// MESSAGE BROKER
// ==========================================

export class AgentMessageBroker extends EventEmitter {
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private agentChannels: Map<string, string> = new Map();
  private pendingResponses: Map<string, NodeJS.Timeout> = new Map();
  private pendingCheckpointResponses: Map<string, PendingCheckpointRecord> = new Map();
  private agentStatuses: Map<string, AgentStatus> = new Map();
  private eventTelemetry: Map<string | symbol, BrokerEventTelemetry> = new Map();
  private telemetrySubscribers: Array<(payload: BrokerEventTelemetry) => void> = [];
  private redisEnabled: boolean = false;
  private fallbackMode: boolean = false;
  private readonly uiChannelName = 'agent:user_interface';
  private uiChannelSubscribed = false;

  constructor(redisUrl?: string) {
    super();

    const connectionString = redisUrl || process.env.REDIS_URL || 'redis://localhost:6379';

    // Only connect to Redis if explicitly enabled or in production
    const shouldConnectRedis = process.env.NODE_ENV === 'production' || process.env.REDIS_ENABLED === 'true';

    if (shouldConnectRedis) {
      try {
        this.publisher = new Redis(connectionString, {
          retryStrategy: (times) => {
            if (times > 3) {
              console.warn('Redis connection failed after 3 retries, switching to fallback mode');
              this.fallbackMode = true;
              return null; // Stop retrying
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: true, // Don't connect immediately
          maxRetriesPerRequest: 3,
        });

        this.subscriber = new Redis(connectionString, {
          retryStrategy: (times) => {
            if (times > 3) {
              this.fallbackMode = true;
              return null;
            }
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });

        this.setupEventHandlers();
        this.subscriber.on('message', this.handleMessage.bind(this));
        this.subscriber.on('pmessage', this.handlePatternMessage.bind(this));

        // Try to connect
        Promise.all([this.publisher.connect(), this.subscriber.connect()])
          .then(() => {
            this.redisEnabled = true;
            console.log('✅ Agent Message Broker initialized with Redis');
            this.subscribeToUiChannel().catch((error) => {
              console.warn('Failed to subscribe UI channel:', error);
            });
          })
          .catch((error) => {
            console.warn('⚠️  Redis not available, Agent Message Broker running in fallback mode (in-memory only)');
            this.fallbackMode = true;
            this.redisEnabled = false;
          });
      } catch (error) {
        console.warn('⚠️  Failed to initialize Redis, using fallback mode:', error);
        this.fallbackMode = true;
        this.redisEnabled = false;
      }
    } else {
      console.log('⚠️  Agent Message Broker running in fallback mode (Redis disabled in development)');
      this.fallbackMode = true;
      this.redisEnabled = false;
    }
  }

  private ensureTelemetry(event: string | symbol): BrokerEventTelemetry {
    const existing = this.eventTelemetry.get(event);
    if (existing) {
      return existing;
    }

    const entry: BrokerEventTelemetry = {
      event: typeof event === 'string' ? event : event.toString(),
      listenerCount: this.listenerCount(event),
      totalEmitted: 0,
    };

    this.eventTelemetry.set(event, entry);
    return entry;
  }

  private trackListenerChange(event: string | symbol, action: 'subscribe' | 'unsubscribe'): void {
    const now = Date.now();
    const stats = this.ensureTelemetry(event);
    stats.listenerCount = this.listenerCount(event);
    if (action === 'subscribe') {
      stats.lastSubscribedAt = now;
    } else {
      stats.lastUnsubscribedAt = now;
    }

    const payload = {
      ...stats,
    };
    super.emit('telemetry:listener_change', payload);
    this.notifyTelemetrySubscribers(payload);
  }

  private trackEmission(event: string | symbol, argsCount: number): void {
    const now = Date.now();
    const stats = this.ensureTelemetry(event);
    stats.totalEmitted += 1;
    stats.lastEmittedAt = now;
    stats.lastEmittedArgsCount = argsCount;

    const payload = {
      ...stats,
    };
    super.emit('telemetry:event_emitted', payload);
    this.notifyTelemetrySubscribers(payload);
  }

  private trackError(event: string | symbol): void {
    const stats = this.ensureTelemetry(event);
    stats.totalUncaughtErrors = (stats.totalUncaughtErrors ?? 0) + 1;
    const payload = {
      ...stats,
    };
    super.emit('telemetry:event_error', payload);
    this.notifyTelemetrySubscribers(payload);
  }

  private notifyTelemetrySubscribers(payload: BrokerEventTelemetry): void {
    for (const subscriber of this.telemetrySubscribers) {
      try {
        subscriber(payload);
      } catch (error) {
        console.warn('Telemetry subscriber failed:', error);
      }
    }
  }

  private setupEventHandlers(): void {
    if (!this.publisher || !this.subscriber) return;

    this.publisher.on('error', (error) => {
      console.warn('Redis publisher error (non-fatal):', error.message);
      this.fallbackMode = true;
      // Don't re-emit to avoid crashing server
    });

    this.subscriber.on('error', (error) => {
      console.warn('Redis subscriber error (non-fatal):', error.message);
      this.fallbackMode = true;
      // Don't re-emit to avoid crashing server
    });

    this.publisher.on('connect', () => {
      console.log('✅ Redis publisher connected');
      this.redisEnabled = true;
      this.fallbackMode = false;
    });

    this.subscriber.on('connect', () => {
      console.log('✅ Redis subscriber connected');
      this.redisEnabled = true;
      this.fallbackMode = false;
      this.subscribeToUiChannel().catch((error) => {
        console.warn('Failed to subscribe UI channel after reconnect:', error);
      });
    });
  }

  private async subscribeToUiChannel(): Promise<void> {
    if (!this.subscriber || !this.redisEnabled || this.uiChannelSubscribed) {
      return;
    }

    try {
      await this.subscriber.subscribe(this.uiChannelName);
      this.uiChannelSubscribed = true;
    } catch (error) {
      console.warn('Failed to subscribe to UI channel:', error);
    }
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

    // Subscribe to agent-specific channel and broadcast channel (only if Redis is enabled)
    if (this.subscriber && this.redisEnabled) {
      try {
        await this.subscriber.subscribe(channel);
        await this.subscriber.subscribe('agent:broadcast');
      } catch (error) {
        console.warn(`Failed to subscribe agent ${agentId} to Redis channels, using fallback mode`);
        this.fallbackMode = true;
      }
    }

    // Initialize agent status
    this.agentStatuses.set(agentId, {
      agentId,
      status: 'idle',
      lastActivity: new Date(),
      queuedTasks: 0,
      activeConnections: 1,
    });

    console.log(`Agent ${agentId} registered${this.fallbackMode ? ' (fallback mode)' : ''} on channel ${channel}`);
    this.emit('agent_registered', { agentId, channel });
  }

  /**
   * Determine if an agent has an active channel registration.
   */
  isAgentRegistered(agentId: string): boolean {
    return this.agentChannels.has(agentId);
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const channel = this.agentChannels.get(agentId);
    if (channel && this.subscriber && this.redisEnabled) {
      try {
        await this.subscriber.unsubscribe(channel);
      } catch (error) {
        console.warn(`Failed to unsubscribe agent ${agentId}`);
      }
      this.agentChannels.delete(agentId);
    }

    // Clear from all tracking maps
    this.agentStatuses.delete(agentId);
    this.agentChannels.delete(agentId);
    
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

    // In fallback mode, just emit the message locally
    if (this.fallbackMode || !this.publisher || !this.redisEnabled) {
      this.emit('message', fullMessage);
      this.emit(`message:${fullMessage.type}`, fullMessage);
      if (fullMessage.to !== 'broadcast') {
        this.emit(`message:${fullMessage.to}`, fullMessage);
      }
      if (fullMessage.correlationId && fullMessage.type !== 'task') {
        this.emit(`response:${fullMessage.correlationId}`, fullMessage.payload);
      }
      this.updateAgentActivity(message.from);
      this.emit('message_sent', fullMessage);
      return;
    }

    // Use Redis if available
    try {
      const channel = message.to === 'broadcast'
        ? 'agent:broadcast'
        : `agent:${message.to}`;

      await this.publisher.publish(channel, JSON.stringify(fullMessage));

      // Update sender status
      this.updateAgentActivity(message.from);

      this.emit('message_sent', fullMessage);
    } catch (error) {
      console.warn('Failed to publish message via Redis, falling back to local emit');
      this.emit('message', fullMessage);
      this.updateAgentActivity(message.from);
    }
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
  // SIMPLE EVENT PUB/SUB (LEGACY COMPAT)
  // ==========================================

  /**
   * Lightweight publish helper for legacy code that expects a simple
   * event bus-style interface (event name + payload).
   */
  async publish<T = any>(event: string, data: T): Promise<void> {
    const payload: BrokerEventPayload<T> = {
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    // Emit dedicated event listeners and general event stream
    this.emit(event, payload);
    this.emit('event', payload);
  }

  /**
   * Subscribe to a simple event stream. Returns an unsubscribe function
   * to mirror common pub/sub interfaces.
   */
  subscribe<T = any>(
    event: string,
    handler: (payload: BrokerEventPayload<T>) => void
  ): () => void {
    this.on(event, handler as (...args: any[]) => void);
    return () => {
      this.off(event, handler as (...args: any[]) => void);
    };
  }

  public override on(event: string | symbol, listener: (...args: any[]) => void): this {
    const result = super.on(event, listener);
    this.trackListenerChange(event, 'subscribe');
    return result;
  }

  public override addListener(event: string | symbol, listener: (...args: any[]) => void): this {
    const result = super.addListener(event, listener);
    this.trackListenerChange(event, 'subscribe');
    return result;
  }

  public override once(event: string | symbol, listener: (...args: any[]) => void): this {
    const result = super.once(event, listener);
    this.trackListenerChange(event, 'subscribe');
    return result;
  }

  public override off(event: string | symbol, listener: (...args: any[]) => void): this {
    const result = super.off(event, listener);
    this.trackListenerChange(event, 'unsubscribe');
    return result;
  }

  public override removeListener(event: string | symbol, listener: (...args: any[]) => void): this {
    const result = super.removeListener(event, listener);
    this.trackListenerChange(event, 'unsubscribe');
    return result;
  }

  public override removeAllListeners(event?: string | symbol): this {
    const events = event !== undefined ? [event] : this.eventNames();
    const result = super.removeAllListeners(event as any);
    for (const evt of events) {
      this.trackListenerChange(evt, 'unsubscribe');
    }
    return result;
  }

  public override emit(event: string | symbol, ...args: any[]): boolean {
    this.trackEmission(event, args.length);
    try {
      return super.emit(event, ...args);
    } catch (error) {
      this.trackError(event);
      throw error;
    }
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
  async waitForCheckpointResponse(
    checkpointId: string,
    timeout: number = 300000,
    metadata?: Partial<PendingCheckpointInfo>
  ): Promise<{
    approved: boolean;
    feedback?: string;
    modifications?: any;
  }> {
    return new Promise((resolve, reject) => {
      if (this.pendingCheckpointResponses.has(checkpointId)) {
        reject(new Error(`Checkpoint ${checkpointId} already pending`));
        return;
      }

      const now = Date.now();
      const timeoutAt = timeout > 0 ? now + timeout : null;
      const timer = setTimeout(() => {
        this.off(`checkpoint:${checkpointId}`, responseHandler);
        const pending = this.pendingCheckpointResponses.get(checkpointId);
        this.pendingCheckpointResponses.delete(checkpointId);
        if (pending) {
          const { timer: _timer, ...info } = pending;
          const payload: PendingCheckpointInfo = {
            ...info,
            status: 'timeout',
            timedOutAt: Date.now(),
          };
          this.emit('checkpoint_timeout', payload);
        } else {
          this.emit('checkpoint_timeout', {
            checkpointId,
            projectId: metadata?.projectId ?? null,
            agentName: metadata?.agentName ?? metadata?.agentId ?? null,
            agentId: metadata?.agentId ?? null,
            stepId: metadata?.stepId ?? null,
            step: metadata?.step ?? null,
            journeyId: metadata?.journeyId ?? null,
            createdAt: now,
            requestedAt: now,
            timeoutAt,
            timeoutMs: timeout,
            status: 'timeout',
            timedOutAt: Date.now(),
          });
        }
        reject(new Error(`Checkpoint response timeout after ${timeout}ms`));
      }, timeout);

      const pendingInfo: PendingCheckpointRecord = {
        checkpointId,
        projectId: metadata?.projectId ?? null,
        agentName: metadata?.agentName ?? metadata?.agentId ?? null,
        agentId: metadata?.agentId ?? null,
        stepId: metadata?.stepId ?? null,
        step: metadata?.step ?? metadata?.stepId ?? null,
        journeyId: metadata?.journeyId ?? null,
        question: metadata?.question ?? null,
        options: metadata?.options,
        artifacts: metadata?.artifacts,
        createdAt: now,
        requestedAt: now,
        timeoutAt,
        timeoutMs: timeout,
        status: 'pending',
        timer,
      };

      this.pendingCheckpointResponses.set(checkpointId, pendingInfo);
      const { timer: _timer, ...pendingEmit } = pendingInfo;
      this.emit('checkpoint_pending', pendingEmit);

      const responseHandler = (response: any) => {
        const pending = this.pendingCheckpointResponses.get(checkpointId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCheckpointResponses.delete(checkpointId);
          const { timer: pendingTimer, ...info } = pending;
          const payload: PendingCheckpointInfo = {
            ...info,
            status: 'resolved',
            resolvedAt: Date.now(),
            response,
          };
          this.emit('checkpoint_resolved', payload);
        } else {
          this.emit('checkpoint_resolved', {
            checkpointId,
            projectId: metadata?.projectId ?? null,
            agentName: metadata?.agentName ?? metadata?.agentId ?? null,
            agentId: metadata?.agentId ?? null,
            stepId: metadata?.stepId ?? null,
            step: metadata?.step ?? metadata?.stepId ?? null,
            journeyId: metadata?.journeyId ?? null,
            createdAt: now,
            requestedAt: now,
            timeoutAt,
            timeoutMs: timeout,
            status: 'resolved',
            resolvedAt: Date.now(),
            response,
          });
        }
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
    const pending = this.pendingCheckpointResponses.get(checkpointId);
    this.emit(`checkpoint:${checkpointId}`, response);
    if (!pending) {
      this.emit('checkpoint_resolved', {
        checkpointId,
        status: 'resolved',
        resolvedAt: Date.now(),
        response,
      });
    }
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
      if (parsed.correlationId && parsed.type !== 'task') {
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
    if (this.fallbackMode) {
      return true; // Fallback mode is always "healthy"
    }

    if (!this.publisher) {
      return false;
    }

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
    redisEnabled: boolean;
    fallbackMode: boolean;
    pendingCheckpoints: number;
  } {
    return {
      registeredAgents: this.agentChannels.size,
      pendingResponses: this.pendingResponses.size,
      channels: this.agentChannels.size + 1, // +1 for broadcast
      uptime: process.uptime(),
      redisEnabled: this.redisEnabled,
      fallbackMode: this.fallbackMode,
      pendingCheckpoints: this.pendingCheckpointResponses.size,
    };
  }

  getPendingCheckpoints(projectId?: string): PendingCheckpointInfo[] {
    const all = Array.from(this.pendingCheckpointResponses.values());
    return all
      .filter((info) => !projectId || info.projectId === projectId)
      .map(({ timer: _timer, ...info }) => ({ ...info }));
  }

  getEventTelemetry(event?: string): BrokerEventTelemetry[] {
    const telemetry = Array.from(this.eventTelemetry.values());
    if (!event) {
      return telemetry.map((entry) => ({ ...entry }));
    }

    return telemetry.filter((entry) => entry.event === event).map((entry) => ({ ...entry }));
  }

  onTelemetryUpdate(listener: (payload: BrokerEventTelemetry) => void): () => void {
    this.telemetrySubscribers.push(listener);
    return () => {
      const index = this.telemetrySubscribers.indexOf(listener);
      if (index >= 0) {
        this.telemetrySubscribers.splice(index, 1);
      }
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
    for (const pending of this.pendingCheckpointResponses.values()) {
      clearTimeout(pending.timer);
    }
    this.pendingCheckpointResponses.clear();

    // Clear all agent tracking maps
    this.agentStatuses.clear();
    this.agentChannels.clear();

    // Unsubscribe from all channels and close connections (only if Redis is enabled)
    if (this.subscriber && this.redisEnabled) {
      try {
        await this.subscriber.unsubscribe();
        await this.subscriber.quit();
      } catch (error) {
        console.warn('Error closing subscriber connection:', error);
      }
    }

    if (this.publisher && this.redisEnabled) {
      try {
        await this.publisher.quit();
      } catch (error) {
        console.warn('Error closing publisher connection:', error);
      }
    }

    this.uiChannelSubscribed = false;

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
