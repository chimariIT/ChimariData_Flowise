import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';

/**
 * @deprecated LEGACY: This Socket.IO implementation is deprecated.
 *
 * The platform is migrating to native WebSocket (`ws` library) for all real-time communication.
 *
 * PREFERRED APPROACH:
 * - Server: Use RealtimeServer in `server/realtime.ts` with `ws` library
 * - Client: Use RealtimeClient in `client/src/lib/realtime.ts`
 * - Agent Bridge: Use RealtimeAgentBridge in `server/services/agents/realtime-agent-bridge.ts`
 *
 * CURRENT USAGE (to be migrated):
 * - Transformation queue events (server/index.ts lines 283-336)
 * - Some agent orchestration events
 *
 * DO NOT add new features to this file. New real-time features should use
 * the native WebSocket system via RealtimeAgentBridge.
 *
 * See CLAUDE.md for details on WebSocket architecture.
 */

// FIX: Socket.IO Migration - Enhanced SocketManager with agent events and reconnection support

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

export class SocketManager {
    private static instance: SocketManager;
    private io: Server | null = null;
    private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socket IDs

    private constructor() { }

    public static getInstance(): SocketManager {
        if (!SocketManager.instance) {
            SocketManager.instance = new SocketManager();
        }
        return SocketManager.instance;
    }

    public initialize(httpServer: HttpServer): void {
        if (this.io) {
            console.warn('SocketManager already initialized');
            return;
        }

        this.io = new Server(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL || "http://localhost:5173",
                methods: ["GET", "POST"],
                credentials: true
            },
            path: '/socket.io',
            // FIX: Socket.IO reconnection settings for better reliability
            pingTimeout: 60000,
            pingInterval: 25000,
            transports: ['websocket', 'polling'],  // Prefer websocket, fallback to polling
            allowUpgrades: true
        });

        this.io.on('connection', (socket: Socket) => {
            console.log(`🔌 [Socket.IO] Client connected: ${socket.id}`);

            // FIX: Handle user authentication for socket
            socket.on('authenticate', (userId: string) => {
                if (userId) {
                    socket.data.userId = userId;
                    socket.join(`user:${userId}`);

                    // Track connected sockets per user
                    if (!this.connectedUsers.has(userId)) {
                        this.connectedUsers.set(userId, new Set());
                    }
                    this.connectedUsers.get(userId)!.add(socket.id);

                    console.log(`🔐 [Socket.IO] User ${userId} authenticated on socket ${socket.id}`);
                }
            });

            socket.on('join_project', (projectId: string) => {
                console.log(`📁 [Socket.IO] Socket ${socket.id} joined project room: project:${projectId}`);
                socket.join(`project:${projectId}`);
            });

            socket.on('leave_project', (projectId: string) => {
                console.log(`📁 [Socket.IO] Socket ${socket.id} left project room: project:${projectId}`);
                socket.leave(`project:${projectId}`);
            });

            // FIX: Handle reconnection - client can request missed events
            socket.on('request_sync', async (data: { projectId: string; lastEventTimestamp?: string }) => {
                console.log(`🔄 [Socket.IO] Sync requested for project ${data.projectId}`);
                // Emit current state to help client sync after reconnection
                socket.emit('sync_ack', {
                    projectId: data.projectId,
                    timestamp: new Date().toISOString(),
                    message: 'Sync acknowledged - refresh data from API'
                });
            });

            socket.on('disconnect', (reason) => {
                console.log(`🔌 [Socket.IO] Client disconnected: ${socket.id}, reason: ${reason}`);

                // Clean up user tracking
                const userId = socket.data.userId;
                if (userId && this.connectedUsers.has(userId)) {
                    this.connectedUsers.get(userId)!.delete(socket.id);
                    if (this.connectedUsers.get(userId)!.size === 0) {
                        this.connectedUsers.delete(userId);
                    }
                }
            });

            socket.on('error', (error) => {
                console.error(`❌ [Socket.IO] Socket error: ${socket.id}`, error);
            });
        });

        console.log('✅ Socket.IO initialized with enhanced agent support');
    }

    // Basic project event emission
    public emitToProject(projectId: string, event: string, data: any): void {
        if (!this.io) {
            console.warn('SocketManager not initialized, cannot emit event');
            return;
        }
        this.io.to(`project:${projectId}`).emit(event, data);
    }

    // FIX: Emit to specific user (across all their connected sockets)
    public emitToUser(userId: string, event: string, data: any): void {
        if (!this.io) {
            console.warn('SocketManager not initialized, cannot emit event');
            return;
        }
        this.io.to(`user:${userId}`).emit(event, data);
    }

    // FIX: Agent checkpoint events
    public emitAgentCheckpoint(projectId: string, checkpoint: AgentCheckpointEvent): void {
        if (!this.io) {
            console.warn('SocketManager not initialized');
            return;
        }
        console.log(`📋 [Socket.IO] Emitting checkpoint to project:${projectId}`, checkpoint.stepName);
        this.io.to(`project:${projectId}`).emit('agent_checkpoint', checkpoint);
    }

    // FIX: Journey progress events
    public emitJourneyProgress(projectId: string, progress: JourneyProgressEvent): void {
        if (!this.io) {
            console.warn('SocketManager not initialized');
            return;
        }
        console.log(`📊 [Socket.IO] Emitting journey progress to project:${projectId}`, progress.currentStep);
        this.io.to(`project:${projectId}`).emit('journey_progress', progress);
    }

    // FIX: Execution progress events
    public emitExecutionProgress(projectId: string, progress: ExecutionProgressEvent): void {
        if (!this.io) {
            console.warn('SocketManager not initialized');
            return;
        }
        console.log(`⚙️ [Socket.IO] Emitting execution progress to project:${projectId}`, progress.phase);
        this.io.to(`project:${projectId}`).emit('execution_progress', progress);
    }

    // FIX: Broadcast to all connected clients
    public broadcast(event: string, data: any): void {
        if (!this.io) {
            console.warn('SocketManager not initialized');
            return;
        }
        this.io.emit(event, data);
    }

    // FIX: Get connection stats
    public getConnectionStats(): { totalConnections: number; connectedUsers: number } {
        const totalConnections = this.io?.sockets.sockets.size || 0;
        const connectedUsers = this.connectedUsers.size;
        return { totalConnections, connectedUsers };
    }

    // FIX: Check if user is connected
    public isUserConnected(userId: string): boolean {
        return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0;
    }

    // Get the underlying Socket.IO server instance
    public getIO(): Server | null {
        return this.io;
    }
}
