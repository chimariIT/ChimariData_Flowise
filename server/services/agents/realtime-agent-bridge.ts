/**
 * Real-Time Agent Bridge
 *
 * Bridges agent message broker (Redis) with WebSocket server (user UI)
 * Enables real-time agent → user communication for checkpoints and status updates
 *
 * Flow:
 * 1. Agent sends checkpoint via message broker
 * 2. Bridge receives message and forwards to WebSocket
 * 3. User responds via WebSocket
 * 4. Bridge forwards response back to agent via message broker
 */

import { getMessageBroker, AgentMessage, AgentCheckpoint, PendingCheckpointInfo } from './message-broker';
import { RealtimeServer, RealtimeEvent } from '../../realtime';
import { EventEmitter } from 'events';

export class RealtimeAgentBridge extends EventEmitter {
  private messageBroker: ReturnType<typeof getMessageBroker>;
  private realtimeServer: RealtimeServer;
  private checkpointMap: Map<string, {
    projectId: string;
    userId: string;
    agentId?: string | null;
    agentName?: string | null;
    step?: string | null;
    stepId?: string | null;
    journeyId?: string | null;
    options?: string[];
    question?: string | null;
    artifacts?: any[];
  }> = new Map();
  private pendingCheckpointIds: Set<string> = new Set();
  private teardownCallbacks: Array<() => void> = [];

  constructor(realtimeServer: RealtimeServer, redisUrl?: string) {
    super();
    this.realtimeServer = realtimeServer;
    this.messageBroker = getMessageBroker(redisUrl);

    this.setupAgentListeners();
    this.setupWebSocketListeners();
    this.setupCheckpointTracking();

    console.log('Real-Time Agent Bridge initialized');
  }

  // ==========================================
  // AGENT → USER (via WebSocket)
  // ==========================================

  private setupAgentListeners(): void {
    // Listen for checkpoint messages from agents
    this.messageBroker.on('message:checkpoint', async (message: AgentMessage) => {
      await this.handleAgentCheckpoint(message);
    });

    // Listen for status updates from agents
    this.messageBroker.on('message:status', async (message: AgentMessage) => {
      await this.handleAgentStatus(message);
    });

    // Listen for progress updates from agents
    this.messageBroker.on('message:result', async (message: AgentMessage) => {
      await this.handleAgentResult(message);
    });

    // Listen for errors from agents
    this.messageBroker.on('message:error', async (message: AgentMessage) => {
      await this.handleAgentError(message);
    });
  }

  /**
   * Forward agent checkpoint to user via WebSocket
   */
  private async handleAgentCheckpoint(message: AgentMessage): Promise<void> {
    const checkpoint = message.payload as AgentCheckpoint;

    // Store checkpoint metadata for response routing
    this.checkpointMap.set(checkpoint.checkpointId, {
      projectId: checkpoint.projectId,
      userId: '', // Will be set from project lookup
      agentId: checkpoint.agentId,
      agentName: checkpoint.agentId,
      step: checkpoint.step,
      stepId: checkpoint.step,
      options: checkpoint.options,
      question: checkpoint.question,
      artifacts: checkpoint.artifacts,
    });
    this.pendingCheckpointIds.add(checkpoint.checkpointId);

    // Get project owner (userId) from database
    // TODO: Query database for project owner
    const userId = 'user_placeholder'; // Replace with actual lookup

    // Forward to WebSocket
    const event: RealtimeEvent = {
      type: 'status_change',
      sourceType: 'streaming', // Using existing event type
      sourceId: checkpoint.agentId,
      userId,
      projectId: checkpoint.projectId,
      timestamp: new Date(),
      data: {
        eventType: 'agent_checkpoint',
        checkpoint: {
          checkpointId: checkpoint.checkpointId,
          step: checkpoint.step,
          question: checkpoint.question,
          options: checkpoint.options,
          artifacts: checkpoint.artifacts,
          agentId: checkpoint.agentId,
        },
      },
    };

    this.realtimeServer.broadcast(event, { userId, projectId: checkpoint.projectId });

    console.log(`Checkpoint ${checkpoint.checkpointId} forwarded to user ${userId}`);
    this.emit('checkpoint_forwarded', { checkpointId: checkpoint.checkpointId, userId });
  }

  /**
   * Forward agent status to user via WebSocket
   */
  private async handleAgentStatus(message: AgentMessage): Promise<void> {
    const status = message.payload;

    // Broadcast status to all users (could be filtered by project)
    const event: RealtimeEvent = {
      type: 'status_change',
      sourceType: 'streaming',
      sourceId: message.from,
      userId: 'system', // System-wide status
      timestamp: new Date(),
      data: {
        eventType: 'agent_status',
        agentId: message.from,
        status: status.status,
        currentTask: status.currentTask,
        queuedTasks: status.queuedTasks,
      },
    };

    this.realtimeServer.broadcast(event);
  }

  /**
   * Forward agent result to user via WebSocket
   */
  private async handleAgentResult(message: AgentMessage): Promise<void> {
    const result = message.payload;

    // TODO: Get userId from project/task context
    const userId = result.userId || 'user_placeholder';
    const projectId = result.projectId;

    const event: RealtimeEvent = {
      type: 'job_complete',
      sourceType: 'streaming',
      sourceId: message.from,
      userId,
      projectId,
      timestamp: new Date(),
      data: {
        eventType: 'agent_result',
        agentId: message.from,
        result,
      },
    };

    this.realtimeServer.broadcast(event, { userId, projectId });
  }

  /**
   * Forward agent error to user via WebSocket
   */
  private async handleAgentError(message: AgentMessage): Promise<void> {
    const error = message.payload;

    // TODO: Get userId from project/task context
    const userId = error.userId || 'user_placeholder';
    const projectId = error.projectId;

    const event: RealtimeEvent = {
      type: 'error',
      sourceType: 'streaming',
      sourceId: message.from,
      userId,
      projectId,
      timestamp: new Date(),
      data: {
        eventType: 'agent_error',
        agentId: message.from,
        error: error.message || 'Agent error occurred',
        details: error,
      },
    };

    this.realtimeServer.broadcast(event, { userId, projectId });
  }

  // ==========================================
  // USER → AGENT (via Message Broker)
  // ==========================================

  private setupWebSocketListeners(): void {
    // Listen for checkpoint responses from WebSocket clients
    this.realtimeServer.on('client_message', (data: any) => {
      if (data.type === 'checkpoint_response') {
        this.handleCheckpointResponse(data);
      }
    });
  }

  private setupCheckpointTracking(): void {
    const pendingHandler = (payload: PendingCheckpointInfo) => {
      this.pendingCheckpointIds.add(payload.checkpointId);
      const existing = this.checkpointMap.get(payload.checkpointId);
      this.checkpointMap.set(payload.checkpointId, {
        projectId: payload.projectId ?? existing?.projectId ?? '',
        userId: existing?.userId ?? '',
        agentId: payload.agentId ?? existing?.agentId ?? null,
        agentName: payload.agentName ?? existing?.agentName ?? payload.agentId ?? existing?.agentId ?? null,
        step: payload.step ?? existing?.step ?? null,
        stepId: payload.stepId ?? existing?.stepId ?? payload.step ?? existing?.step ?? null,
        journeyId: payload.journeyId ?? existing?.journeyId ?? null,
        options: payload.options ?? existing?.options,
        question: payload.question ?? existing?.question ?? null,
        artifacts: payload.artifacts ?? existing?.artifacts,
      });
    };

    const resolvedHandler = (payload: Partial<PendingCheckpointInfo> & { checkpointId: string }) => {
      this.pendingCheckpointIds.delete(payload.checkpointId);
      this.checkpointMap.delete(payload.checkpointId);
    };

    const timeoutHandler = (payload: Partial<PendingCheckpointInfo> & { checkpointId: string }) => {
      this.pendingCheckpointIds.delete(payload.checkpointId);
      this.checkpointMap.delete(payload.checkpointId);
    };

    this.messageBroker.on('checkpoint_pending', pendingHandler);
    this.messageBroker.on('checkpoint_resolved', resolvedHandler);
    this.messageBroker.on('checkpoint_timeout', timeoutHandler);

    this.teardownCallbacks.push(() => this.messageBroker.off('checkpoint_pending', pendingHandler));
    this.teardownCallbacks.push(() => this.messageBroker.off('checkpoint_resolved', resolvedHandler));
    this.teardownCallbacks.push(() => this.messageBroker.off('checkpoint_timeout', timeoutHandler));
  }

  /**
   * Forward user's checkpoint response to agent
   */
  private async handleCheckpointResponse(data: any): Promise<void> {
    const { checkpointId, approved, feedback, modifications } = data;

    // Get checkpoint metadata
    const metadata = this.checkpointMap.get(checkpointId);
    try {
      await this.messageBroker.submitCheckpointResponse(checkpointId, {
      approved,
      feedback,
      modifications,
      });
    } finally {
      if (metadata) {
        this.checkpointMap.delete(checkpointId);
      }
      this.pendingCheckpointIds.delete(checkpointId);

      console.log(`Checkpoint ${checkpointId} response forwarded to agent`);
      this.emit('checkpoint_response_forwarded', { checkpointId, approved });
    }
  }

  /**
   * Public API: Send checkpoint from agent
   */
  async sendCheckpointToUser(checkpoint: AgentCheckpoint): Promise<void> {
    await this.messageBroker.sendCheckpoint(checkpoint);
  }

  /**
   * Public API: Wait for user response to checkpoint
   */
  async waitForUserResponse(checkpointId: string, timeout?: number): Promise<{
    approved: boolean;
    feedback?: string;
    modifications?: any;
  }> {
    const metadata = this.checkpointMap.get(checkpointId);
    return await this.messageBroker.waitForCheckpointResponse(
      checkpointId,
      timeout,
      metadata
        ? {
            projectId: metadata.projectId,
            agentId: metadata.agentId ?? undefined,
            agentName: metadata.agentName ?? metadata.agentId ?? undefined,
            step: metadata.step ?? undefined,
            stepId: metadata.stepId ?? metadata.step ?? undefined,
            journeyId: metadata.journeyId ?? undefined,
            options: metadata.options,
            question: metadata.question ?? undefined,
            artifacts: metadata.artifacts,
          }
        : undefined
    );
  }

  // ==========================================
  // HEALTH & MONITORING
  // ==========================================

  /**
   * Get bridge statistics
   */
  getStats(): {
    pendingCheckpoints: number;
    messageBrokerStats: any;
    realtimeStats: any;
  } {
    return {
      pendingCheckpoints: this.pendingCheckpointIds.size,
      messageBrokerStats: this.messageBroker.getStats(),
      realtimeStats: {
        // Add RealtimeServer stats if available
      },
    };
  }

  /**
   * Check if bridge is healthy
   */
  async isHealthy(): Promise<boolean> {
    return await this.messageBroker.isHealthy();
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async shutdown(): Promise<void> {
    console.log('Shutting down Real-Time Agent Bridge...');
    for (const dispose of this.teardownCallbacks) {
      try {
        dispose();
      } catch (error) {
        console.warn('Failed to dispose bridge listener:', error);
      }
    }
    this.teardownCallbacks = [];
    this.checkpointMap.clear();
    this.pendingCheckpointIds.clear();
    this.removeAllListeners();
    console.log('Real-Time Agent Bridge shut down');
  }
}

// ==========================================
// SINGLETON
// ==========================================

let agentBridge: RealtimeAgentBridge | null = null;

export function getAgentBridge(realtimeServer: RealtimeServer, redisUrl?: string): RealtimeAgentBridge {
  if (!agentBridge) {
    agentBridge = new RealtimeAgentBridge(realtimeServer, redisUrl);
  }
  return agentBridge;
}

/**
 * Reset singleton (for testing)
 */
export function resetAgentBridge(): void {
  if (agentBridge) {
    agentBridge.shutdown().catch(console.error);
    agentBridge = null;
  }
}
