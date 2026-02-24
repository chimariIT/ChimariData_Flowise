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
 *
 * FIX P1-4: Removed Socket.IO dual-emission. Platform uses native ws (per CLAUDE.md).
 * Socket.IO migration was incomplete and caused message duplication.
 */

import { getMessageBroker, AgentMessage, AgentCheckpoint, PendingCheckpointInfo } from './message-broker';
import { RealtimeServer, RealtimeEvent } from '../../realtime';
// FIX P1-4: Socket.IO import kept for type compat but not used for emission
import type { AgentCheckpointEvent, ExecutionProgressEvent } from '../../socket-manager';
import { EventEmitter } from 'events';
import { storage } from '../../storage';

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

  /**
   * Get the owner userId for a project
   * FIX: Production Readiness - Replace hardcoded 'user_placeholder' with actual DB lookup
   */
  private async getProjectOwner(projectId: string): Promise<string> {
    if (!projectId) {
      console.warn('[RealtimeAgentBridge] No projectId provided for owner lookup');
      return 'system';
    }

    try {
      const project = await storage.getProject(projectId);
      if (project?.userId) {
        return project.userId;
      }
      console.warn(`[RealtimeAgentBridge] Project ${projectId} has no userId, using 'system'`);
      return 'system';
    } catch (error) {
      console.error(`[RealtimeAgentBridge] Failed to lookup project owner for ${projectId}:`, error);
      return 'system';
    }
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

    // [DAY 10] Listen for workflow progress events from agent coordination service
    this.messageBroker.on('workflow:progress', async (payload: any) => {
      await this.handleWorkflowProgress(payload);
    });

    // JO-2 FIX: Listen for per-analysis progress events and forward to WebSocket
    this.messageBroker.on('analysis:progress', async (data: any) => {
      if (!data?.projectId) return;
      const event: RealtimeEvent = {
        type: 'progress',
        sourceType: 'analysis',
        sourceId: data.analysisId || 'progress',
        userId: data.userId || '',
        projectId: data.projectId,
        timestamp: new Date(),
        data: {
          analysisName: data.analysisName,
          analysisType: data.analysisType,
          status: data.status,
          executionTimeMs: data.executionTimeMs,
          error: data.error,
          analysisId: data.analysisId,
        },
      };
      this.realtimeServer.broadcastToProject(data.projectId, event);
    });
  }

  /**
   * Forward agent checkpoint to user via WebSocket
   * FIX: Socket.IO Migration - Now emits via both native ws and Socket.IO for transition
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
    const userId = await this.getProjectOwner(checkpoint.projectId);

    // Update checkpoint map with resolved userId
    const existingCheckpoint = this.checkpointMap.get(checkpoint.checkpointId);
    if (existingCheckpoint) {
      existingCheckpoint.userId = userId;
    }

    // Forward to native WebSocket (legacy - kept for backwards compatibility)
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

    // FIX P1-4: Removed Socket.IO dual-emission (native ws only)
    console.log(`Checkpoint ${checkpoint.checkpointId} forwarded to user ${userId} (ws)`);
    this.emit('checkpoint_forwarded', { checkpointId: checkpoint.checkpointId, userId });

    // P1-17 FIX: Set timeout to auto-expire stale checkpoints that never got a response
    setTimeout(() => {
      if (this.pendingCheckpointIds.has(checkpoint.checkpointId)) {
        console.warn(`⚠️ [P1-17] Checkpoint ${checkpoint.checkpointId} timed out after 5 minutes without user response`);
        this.pendingCheckpointIds.delete(checkpoint.checkpointId);
        this.checkpointMap.delete(checkpoint.checkpointId);
        this.emit('checkpoint_timeout', { checkpointId: checkpoint.checkpointId, userId });
      }
    }, 5 * 60 * 1000); // 5 minute timeout
  }

  /**
   * Forward agent status to user via WebSocket
   * FIX: Socket.IO Migration - Now emits via both native ws and Socket.IO
   */
  private async handleAgentStatus(message: AgentMessage): Promise<void> {
    const status = message.payload;

    // Broadcast status to all users via native WebSocket (legacy)
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

    // FIX P1-4: Removed Socket.IO dual-emission (native ws only)
  }

  /**
   * Forward agent result to user via WebSocket
   * FIX: Socket.IO Migration - Now emits via both native ws and Socket.IO
   */
  private async handleAgentResult(message: AgentMessage): Promise<void> {
    const result = message.payload;
    const projectId = result.projectId;

    // Get userId from result payload or lookup from project owner
    const userId = result.userId || (projectId ? await this.getProjectOwner(projectId) : 'system');

    // Emit via native WebSocket (legacy)
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

    // FIX P1-4: Removed Socket.IO dual-emission (native ws only)
  }

  /**
   * Forward agent error to user via WebSocket
   */
  private async handleAgentError(message: AgentMessage): Promise<void> {
    const error = message.payload;
    const projectId = error.projectId;

    // Get userId from error payload or lookup from project owner
    const userId = error.userId || (projectId ? await this.getProjectOwner(projectId) : 'system');

    // Emit via native WebSocket (legacy)
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

    // FIX P1-4: Removed Socket.IO dual-emission (native ws only)
  }

  /**
   * [DAY 10] Forward workflow progress events to user via WebSocket
   * This handles real-time U2A2A2U workflow phase updates
   */
  private async handleWorkflowProgress(payload: any): Promise<void> {
    const progressData = payload.data || payload;
    const projectId = progressData.projectId;

    if (!projectId) {
      console.warn('[RealtimeAgentBridge] Workflow progress missing projectId:', progressData);
      return;
    }

    // Get userId from project owner
    const userId = await this.getProjectOwner(projectId);

    console.log(`📊 [Workflow Progress] Phase: ${progressData.phase}, Progress: ${progressData.percentComplete}%, Status: ${progressData.status}`);

    // Emit via native WebSocket
    const event: RealtimeEvent = {
      type: 'status_change',
      sourceType: 'analysis',
      sourceId: progressData.workflowId || projectId,
      userId,
      projectId,
      timestamp: new Date(),
      data: {
        eventType: 'workflow_progress',
        workflowId: progressData.workflowId,
        phase: progressData.phase,
        phaseIndex: progressData.phaseIndex,
        totalPhases: progressData.totalPhases,
        status: progressData.status,
        percentComplete: progressData.percentComplete,
        message: progressData.message,
        slaCompliant: progressData.slaCompliant,
        durationMs: progressData.durationMs,
      },
    };

    this.realtimeServer.broadcast(event, { userId, projectId });

    // FIX P1-4: Removed Socket.IO dual-emission (native ws only)
    this.emit('workflow_progress', progressData);
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
