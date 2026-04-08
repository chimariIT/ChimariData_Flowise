/**
 * Real-time Agent Bridge - Fixed for WebSocket Integration
 *
 * CRITICAL FIX A-2: Ensures progress events reach the UI
 *
 * Problem:
 * - Some services emit via SocketManager (Socket.IO)
 * - Frontend uses native ws library via RealtimeClient
 * - No bridging layer between them
 *
 * Solution: Add analysis:progress forwarding from message broker to WebSocket server
 *
 * Created: March 18, 2026
 */

import { getMessageBroker } from './message-broker';
import { realtimeServer } from '../realtime';

/**
 * Analysis progress event data
 */
export interface AnalysisProgressEvent {
  projectId: string;
  analysisType?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number; // 0-100
  message?: string;
  timestamp: string;
}

/**
 * Fixed RealtimeAgentBridge
 * Extends existing bridge with analysis progress forwarding
 */
class FixedRealtimeAgentBridge {
  private static instance: FixedRealtimeAgentBridge;
  private initialized = false;
  private analysisProgressListeners = new Set<string>();

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): FixedRealtimeAgentBridge {
    if (!FixedRealtimeAgentBridge.instance) {
      FixedRealtimeAgentBridge.instance = new FixedRealtimeAgentBridge();
    }
    return FixedRealtimeAgentBridge.instance;
  }

  /**
   * Initialize the bridge
   * Sets up message broker listeners and forwards to WebSocket
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[RealtimeBridge] Already initialized');
      return;
    }

    console.log('[RealtimeBridge] Initializing...');
    const messageBroker = getMessageBroker();

    // Forward agent messages to WebSocket
    messageBroker.on('agent:message', (data: any) => {
      console.log('[RealtimeBridge] Forwarding agent:message to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'agent_message',
        data
      });
    });

    // Forward checkpoint messages to WebSocket
    messageBroker.on('checkpoint:request', (data: any) => {
      console.log('[RealtimeBridge] Forwarding checkpoint:request to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'checkpoint_request',
        data
      });
    });

    messageBroker.on('checkpoint:approved', (data: any) => {
      console.log('[RealtimeBridge] Forwarding checkpoint:approved to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'checkpoint_approved',
        data
      });
    });

    // CRITICAL FIX: Forward analysis:progress events to WebSocket
    // This was missing, causing progress updates to not reach the UI
    messageBroker.on('analysis:progress', (data: any) => {
      console.log('[RealtimeBridge] Forwarding analysis:progress to WebSocket', data);

      // Normalize the event data
      const progressEvent: AnalysisProgressEvent = {
        projectId: data.projectId,
        analysisType: data.analysisType,
        status: data.status || 'running',
        progress: data.progress || 0,
        message: data.message,
        timestamp: new Date().toISOString()
      };

      // Forward to WebSocket clients
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'analysis_progress',
        data: progressEvent
      });
    });

    messageBroker.on('analysis:complete', (data: any) => {
      console.log('[RealtimeBridge] Forwarding analysis:complete to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'analysis_complete',
        data
      });
    });

    messageBroker.on('analysis:error', (data: any) => {
      console.log('[RealtimeBridge] Forwarding analysis:error to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'analysis_error',
        data
      });
    });

    // Forward execution_progress events (legacy name, some services use this)
    messageBroker.on('execution_progress', (data: any) => {
      console.log('[RealtimeBridge] Forwarding execution_progress to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'execution_progress',
        data: data
      });
    });

    // Forward tool execution events
    messageBroker.on('tool:progress', (data: any) => {
      console.log('[RealtimeBridge] Forwarding tool:progress to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'tool_progress',
        data
      });
    });

    messageBroker.on('tool:complete', (data: any) => {
      console.log('[RealtimeBridge] Forwarding tool:complete to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'tool_complete',
        data
      });
    });

    // Forward transformation events
    messageBroker.on('transformation:progress', (data: any) => {
      console.log('[RealtimeBridge] Forwarding transformation:progress to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'transformation_progress',
        data
      });
    });

    messageBroker.on('transformation:complete', (data: any) => {
      console.log('[RealtimeBridge] Forwarding transformation:complete to WebSocket', data);
      realtimeServer.broadcastToProject(data.projectId, {
        type: 'transformation_complete',
        data
      });
    });

    this.initialized = true;
    console.log('[RealtimeBridge] Initialization complete');
  }

  /**
   * Register for analysis progress events
   * Components can call this to ensure they receive updates
   */
  public registerForAnalysisProgress(projectId: string, callback: (event: AnalysisProgressEvent) => void): () => {
    console.log(`[RealtimeBridge] Registering for analysis progress for project ${projectId}`);
    const listenerId = `analysis_progress_${projectId}`;

    if (this.analysisProgressListeners.has(listenerId)) {
      console.warn('[RealtimeBridge] Listener already registered');
      return;
    }

    this.analysisProgressListeners.add(listenerId);

    // Setup a one-time listener on message broker that forwards to callback
    const messageBroker = getMessageBroker();
    messageBroker.on('analysis:progress', (data: any) => {
      if (data.projectId === projectId) {
        callback(data);
      }
    });
  }

  /**
   * Unregister from analysis progress events
   */
  public unregisterFromAnalysisProgress(projectId: string): void {
    const listenerId = `analysis_progress_${projectId}`;
    this.analysisProgressListeners.delete(listenerId);
    console.log(`[RealtimeBridge] Unregistered from analysis progress for project ${projectId}`);
  }

  /**
   * Get current status of all registered progress listeners
   */
  public getAnalysisProgressListeners(): string[] {
    return Array.from(this.analysisProgressListeners);
  }
}

// Export singleton instance
export const fixedRealtimeBridge = FixedRealtimeAgentBridge.getInstance();

/**
 * Backwards compatible export
 * Old code imports 'realtimeAgentBridge' - this alias provides the fixed version
 * After migration, update all imports from './realtime-agent-bridge' to './realtime-bridge-fixed'
 */
export { fixedRealtimeBridge as realtimeAgentBridge };
