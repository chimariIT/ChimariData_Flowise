/**
 * @deprecated LEGACY: Socket.IO Client - DO NOT USE FOR NEW FEATURES
 *
 * This Socket.IO client is deprecated in favor of the native WebSocket client.
 *
 * PREFERRED APPROACH:
 * Use the RealtimeClient from `client/src/lib/realtime.ts` instead.
 *
 * Example:
 * ```typescript
 * import { realtimeClient } from '@/lib/realtime';
 *
 * // Subscribe to project events
 * const unsubscribe = realtimeClient.subscribe(`project:${projectId}`, (event) => {
 *   console.log('Event received:', event);
 * });
 *
 * // Clean up on unmount
 * return () => unsubscribe();
 * ```
 *
 * See CLAUDE.md for WebSocket architecture details.
 *
 * -------------------------------------------------------------------------
 * Original Socket.IO Client Description (for reference):
 *
 * FIX: Socket.IO Migration - Enhanced client with automatic reconnection
 * and agent-specific event handlers for better reliability.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - User authentication via socket auth
 * - Project room management
 * - Agent checkpoint and progress events
 * - Connection state tracking
 */

import { io, Socket } from 'socket.io-client';

// Connection state types
export type SocketConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

// Agent event types (match server-side interfaces)
export interface AgentCheckpointEvent {
    checkpointId: string;
    projectId: string;
    agentType: string;
    stepName: string;
    status: string;
    message: string;
    timestamp: Date;
    userVisible?: boolean;
    data?: any;
}

export interface JourneyProgressEvent {
    projectId: string;
    currentStep: string;
    currentStepIndex: number;
    totalSteps: number;
    percentComplete: number;
    estimatedTimeRemaining?: string;
}

export interface ExecutionProgressEvent {
    projectId: string;
    phase: string;
    status: 'starting' | 'in_progress' | 'completed' | 'failed';
    message: string;
    progress?: number;
    data?: any;
}

// Configuration options
export interface SocketClientConfig {
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
    timeout?: number;
    debug?: boolean;
}

export class SocketClient {
    private static instance: SocketClient;
    private socket: Socket | null = null;
    private listeners: Map<string, Set<Function>> = new Map();
    private connectionState: SocketConnectionState = 'disconnected';
    private stateListeners: Set<(state: SocketConnectionState) => void> = new Set();
    private joinedProjects: Set<string> = new Set();
    private userId: string | null = null;
    private config: Required<SocketClientConfig>;

    private constructor(config: SocketClientConfig = {}) {
        this.config = {
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            debug: false,
            ...config
        };
    }

    public static getInstance(): SocketClient {
        if (!SocketClient.instance) {
            SocketClient.instance = new SocketClient({
                debug: import.meta.env?.DEV || false
            });
        }
        return SocketClient.instance;
    }

    private log(message: string, ...args: any[]): void {
        if (this.config.debug) {
            console.log(`🔌 [Socket.IO] ${message}`, ...args);
        }
    }

    private error(message: string, ...args: any[]): void {
        console.error(`❌ [Socket.IO] ${message}`, ...args);
    }

    public connect(url?: string): void {
        if (this.socket?.connected) {
            this.log('Already connected');
            return;
        }

        const socketUrl = url || window.location.origin;
        this.setConnectionState('connecting');
        this.log('Connecting to', socketUrl);

        this.socket = io(socketUrl, {
            path: '/socket.io',
            withCredentials: true,
            // FIX: Socket.IO reconnection settings for better reliability
            reconnection: this.config.reconnection,
            reconnectionAttempts: this.config.reconnectionAttempts,
            reconnectionDelay: this.config.reconnectionDelay,
            reconnectionDelayMax: this.config.reconnectionDelayMax,
            timeout: this.config.timeout,
            transports: ['websocket', 'polling'],  // Prefer websocket, fallback to polling
            autoConnect: true,
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        if (!this.socket) return;

        // Connection lifecycle events
        this.socket.on('connect', () => {
            this.log('Connected, socket ID:', this.socket?.id);
            this.setConnectionState('connected');

            // Authenticate if we have a user ID
            if (this.userId) {
                this.authenticate(this.userId);
            } else {
                // Try to get user ID from localStorage
                const authToken = localStorage.getItem('auth_token');
                if (authToken) {
                    this.socket?.emit('authenticate', authToken);
                }
            }

            // Rejoin any previously joined project rooms
            this.joinedProjects.forEach(projectId => {
                this.socket?.emit('join_project', projectId);
                this.log('Rejoined project room:', projectId);
            });
        });

        this.socket.on('disconnect', (reason) => {
            this.log('Disconnected, reason:', reason);
            this.setConnectionState('disconnected');
        });

        this.socket.on('connect_error', (error) => {
            this.error('Connection error:', error.message);
            this.setConnectionState('failed');
        });

        // FIX: Socket.IO reconnection events
        this.socket.io.on('reconnect_attempt', (attempt) => {
            this.log(`Reconnection attempt ${attempt}`);
            this.setConnectionState('reconnecting');
        });

        this.socket.io.on('reconnect', (attempt) => {
            this.log(`Reconnected after ${attempt} attempts`);
            this.setConnectionState('connected');
        });

        this.socket.io.on('reconnect_failed', () => {
            this.error('Reconnection failed after max attempts');
            this.setConnectionState('failed');
        });

        // Agent-specific events
        this.socket.on('agent_checkpoint', (data: AgentCheckpointEvent) => {
            this.log('Agent checkpoint received:', data.stepName);
            this.notifyListeners('agent_checkpoint', data);
        });

        this.socket.on('journey_progress', (data: JourneyProgressEvent) => {
            this.log('Journey progress:', data.currentStep, `${data.percentComplete}%`);
            this.notifyListeners('journey_progress', data);
        });

        this.socket.on('execution_progress', (data: ExecutionProgressEvent) => {
            this.log('Execution progress:', data.phase, data.status);
            this.notifyListeners('execution_progress', data);
        });

        this.socket.on('agent_status', (data: any) => {
            this.log('Agent status:', data.agentId, data.status);
            this.notifyListeners('agent_status', data);
        });

        // Sync acknowledgment (for reconnection handling)
        this.socket.on('sync_ack', (data: any) => {
            this.log('Sync acknowledged:', data);
            this.notifyListeners('sync_ack', data);
        });
    }

    private setConnectionState(state: SocketConnectionState): void {
        if (this.connectionState !== state) {
            this.connectionState = state;
            this.log('Connection state changed to:', state);
            this.stateListeners.forEach(listener => {
                try {
                    listener(state);
                } catch (err) {
                    this.error('State listener error:', err);
                }
            });
        }
    }

    public authenticate(userId: string): void {
        this.userId = userId;
        if (this.socket?.connected) {
            this.socket.emit('authenticate', userId);
            this.log('Authenticated as user:', userId);
        }
    }

    public joinProject(projectId: string): void {
        this.joinedProjects.add(projectId);
        if (this.socket?.connected) {
            this.socket.emit('join_project', projectId);
            this.log('Joined project room:', projectId);
        } else {
            // Will join when connected
            this.log('Will join project room when connected:', projectId);
        }
    }

    public leaveProject(projectId: string): void {
        this.joinedProjects.delete(projectId);
        if (this.socket?.connected) {
            this.socket.emit('leave_project', projectId);
            this.log('Left project room:', projectId);
        }
    }

    // Request sync after reconnection
    public requestSync(projectId: string, lastEventTimestamp?: string): void {
        if (this.socket?.connected) {
            this.socket.emit('request_sync', { projectId, lastEventTimestamp });
            this.log('Requested sync for project:', projectId);
        }
    }

    // Event listener management
    public on(event: string, callback: Function): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        this.log('Added listener for:', event);

        // Return unsubscribe function
        return () => {
            this.off(event, callback);
        };
    }

    public off(event: string, callback: Function): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            this.log('Removed listener for:', event);
        }
    }

    private notifyListeners(event: string, data: any): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                try {
                    cb(data);
                } catch (err) {
                    this.error(`Listener error for ${event}:`, err);
                }
            });
        }
    }

    // Connection state subscriptions
    public onConnectionStateChange(listener: (state: SocketConnectionState) => void): () => void {
        this.stateListeners.add(listener);
        // Immediately notify of current state
        listener(this.connectionState);
        return () => {
            this.stateListeners.delete(listener);
        };
    }

    public getConnectionState(): SocketConnectionState {
        return this.connectionState;
    }

    public isConnected(): boolean {
        return this.connectionState === 'connected';
    }

    public getSocketId(): string | undefined {
        return this.socket?.id;
    }

    public disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.joinedProjects.clear();
        this.setConnectionState('disconnected');
        this.log('Disconnected');
    }

    public destroy(): void {
        this.disconnect();
        this.listeners.clear();
        this.stateListeners.clear();
        this.userId = null;
        this.log('Destroyed');
    }
}

// Export singleton instance
export const socketClient = SocketClient.getInstance();

export default socketClient;
