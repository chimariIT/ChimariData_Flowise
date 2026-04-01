/**
 * Socket.IO to Native WebSocket Bridge
 *
 * Bridges Socket.IO events (legacy) to native WebSocket events (current)
 * This resolves JO-3: Execution progress channel mismatch between SocketManager and WS
 *
 * Architecture:
 * Socket.IO (SocketManager) → SocketIOBridge → RealtimeServer (WebSocket) → Client
 *
 * References:
 * - server/socket-manager.ts - Socket.IO source
 * - server/realtime.ts - Native WebSocket server
 * - server/services/agents/realtime-agent-bridge.ts - Pattern to follow
 */

import { SocketManager } from '../socket-manager';
import { RealtimeServer, RealtimeEvent } from '../realtime';
import type { ExecutionProgressEvent } from '../socket-manager';

export class SocketIOBridge {
  private socketManager: SocketManager;
  private realtimeServer: RealtimeServer;

  constructor(socketManager: SocketManager, realtimeServer: RealtimeServer) {
    this.socketManager = socketManager;
    this.realtimeServer = realtimeServer;
    this.setupEventListeners();
  }

  /**
   * Set up listeners for Socket.IO events and bridge them to native WebSocket
   */
  private setupEventListeners(): void {
    console.log('🌉 SocketIO Bridge: Setting up event listeners...');

    // Listen for execution_progress events from Socket.IO
    this.socketManager.on('execution_progress', (data: ExecutionProgressEvent) => {
      this.handleExecutionProgress(data);
    });

    console.log('✅ SocketIO Bridge: Listening for execution_progress events');
  }

  /**
   * Handle execution progress event from Socket.IO and forward to native WebSocket
   */
  private handleExecutionProgress(data: ExecutionProgressEvent): void {
    try {
      if (!data?.projectId) {
        console.warn('⚠️ SocketIO Bridge: execution_progress event missing projectId');
        return;
      }

      // Convert Socket.IO event to RealtimeEvent format
      const event: RealtimeEvent = {
        type: 'execution_progress',
        sourceType: 'analysis',
        sourceId: data.analysisId || 'progress',
        userId: data.userId || '',
        projectId: data.projectId,
        timestamp: new Date(),
        data: {
          step: data.step,
          status: data.status,
          progress: data.progress,
          totalSteps: data.totalSteps,
          analysisName: data.analysisName,
          analysisType: data.analysisType,
        },
      };

      // Broadcast to native WebSocket
      this.realtimeServer.broadcastToProject(data.projectId, event);

      console.log(`📤 SocketIO Bridge: execution_progress bridged for project ${data.projectId}`);
    } catch (error) {
      console.error('❌ SocketIO Bridge: Failed to handle execution_progress event:', error);
    }
  }

  /**
   * Get bridge statistics
   */
  getStats() {
    return {
      listenersActive: true,
      bridgedEvents: 'execution_progress',
      targetServer: 'native WebSocket (ws)'
    };
  }
}

// Singleton instance
let bridgeInstance: SocketIOBridge | null = null;

/**
 * Initialize the Socket.IO bridge (singleton pattern)
 */
export function initializeSocketIOBridge(
  socketManager: SocketManager,
  realtimeServer: RealtimeServer
): SocketIOBridge {
  if (bridgeInstance) {
    console.log('⏭️ SocketIO Bridge: Already initialized, returning existing instance');
    return bridgeInstance;
  }

  console.log('🚀 SocketIO Bridge: Initializing new instance...');
  bridgeInstance = new SocketIOBridge(socketManager, realtimeServer);
  return bridgeInstance;
}

/**
 * Get the bridge instance
 */
export function getSocketIOBridge(): SocketIOBridge | null {
  return bridgeInstance;
}
