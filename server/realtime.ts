import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { URL } from 'url';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';

// Real-time event types
export interface RealtimeEvent {
  type: 'status_change' | 'metrics_update' | 'error' | 'progress' | 'job_complete' | 'connection_test' | 'data_received' | 'buffer_status';
  sourceType: 'streaming' | 'scraping';
  sourceId: string;
  userId: string;
  projectId?: string;
  timestamp: Date;
  data: any;
}

export interface ClientConnection {
  id: string;
  userId: string;
  websocket: WebSocket;
  subscriptions: Set<string>;
  lastActivity: Date;
  metadata: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export interface BroadcastOptions {
  userId?: string;
  projectId?: string;
  sourceId?: string;
  sourceType?: 'streaming' | 'scraping';
  excludeClient?: string;
}

export class RealtimeServer extends EventEmitter {
  private clients: Map<string, ClientConnection> = new Map();
  private userClients: Map<string, Set<string>> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private wss: WebSocket.Server) {
    super();
    this.setupWebSocketServer();
    this.startHeartbeat();
    this.startCleanup();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
      this.handleNewConnection(ws, request);
    });

    this.wss.on('error', (error: Error) => {
      console.error('WebSocket server error:', error);
      this.emit('server_error', error);
    });

    console.log('Real-time WebSocket server initialized');
  }

  private async handleNewConnection(ws: WebSocket, request: IncomingMessage): Promise<void> {
    try {
      const user = await this.authenticateConnection(request);
      if (!user) {
        ws.close(1008, 'Authentication failed');
        return;
      }

      const clientId = this.generateClientId();
      const client: ClientConnection = {
        id: clientId,
        userId: user.id,
        websocket: ws,
        subscriptions: new Set(),
        lastActivity: new Date(),
        metadata: {
          userAgent: request.headers['user-agent'],
          ipAddress: this.getClientIpAddress(request)
        }
      };

      // Store client connection
      this.clients.set(clientId, client);
      
      // Track user's clients
      if (!this.userClients.has(user.id)) {
        this.userClients.set(user.id, new Set());
      }
      this.userClients.get(user.id)!.add(clientId);

      // Setup client event handlers
      this.setupClientHandlers(client);

      // Send connection confirmation
      this.sendToClient(clientId, {
        type: 'connection_established',
        sourceType: 'streaming',
        sourceId: 'system',
        userId: user.id,
        timestamp: new Date(),
        data: {
          clientId,
          serverId: process.env.SERVER_ID || 'unknown',
          capabilities: ['streaming', 'scraping', 'metrics', 'notifications']
        }
      });

      console.log(`Client ${clientId} connected for user ${user.id}`);
      this.emit('client_connected', { clientId, userId: user.id });

    } catch (error) {
      console.error('Failed to handle new connection:', error);
      ws.close(1011, 'Internal server error');
    }
  }

  private async authenticateConnection(request: IncomingMessage): Promise<{ id: string } | null> {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        // Try to get token from Authorization header
        const authHeader = request.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const bearerToken = authHeader.substring(7);
          return this.validateToken(bearerToken);
        }
        return null;
      }

      return this.validateToken(token);
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  private validateToken(token: string): { id: string } | null {
    try {
      // For development, if no JWT secret is set, allow any token format
      if (!process.env.JWT_SECRET) {
        // Simple validation - assume token is userId for development
        if (token && token.length > 0) {
          return { id: token };
        }
        return null;
      }

      // Production JWT validation
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
      return { id: decoded.userId || decoded.id };
    } catch (error) {
      console.error('Token validation failed:', error);
      return null;
    }
  }

  private getClientIpAddress(request: IncomingMessage): string {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      'unknown'
    );
  }

  private setupClientHandlers(client: ClientConnection): void {
    const { websocket, id: clientId } = client;

    websocket.on('message', (data: WebSocket.Data) => {
      this.handleClientMessage(clientId, data);
    });

    websocket.on('close', (code: number, reason: string) => {
      this.handleClientDisconnect(clientId, code, reason);
    });

    websocket.on('error', (error: Error) => {
      console.error(`Client ${clientId} error:`, error);
      this.handleClientDisconnect(clientId, 1011, 'Client error');
    });

    websocket.on('pong', () => {
      client.lastActivity = new Date();
    });
  }

  private handleClientMessage(clientId: string, data: WebSocket.Data): void {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      client.lastActivity = new Date();

      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message.channels || []);
          break;
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.channels || []);
          break;
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date() });
          break;
        default:
          console.warn(`Unknown message type from client ${clientId}:`, message.type);
      }
    } catch (error) {
      console.error(`Failed to handle message from client ${clientId}:`, error);
    }
  }

  private handleSubscription(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.add(channel);
    });

    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      sourceType: 'streaming',
      sourceId: 'system',
      userId: client.userId,
      timestamp: new Date(),
      data: { channels }
    });
  }

  private handleUnsubscription(clientId: string, channels: string[]): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    channels.forEach(channel => {
      client.subscriptions.delete(channel);
    });

    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      sourceType: 'streaming',
      sourceId: 'system',
      userId: client.userId,
      timestamp: new Date(),
      data: { channels }
    });
  }

  private handleClientDisconnect(clientId: string, code: number, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from clients map
    this.clients.delete(clientId);

    // Remove from user's client set
    const userClients = this.userClients.get(client.userId);
    if (userClients) {
      userClients.delete(clientId);
      if (userClients.size === 0) {
        this.userClients.delete(client.userId);
      }
    }

    console.log(`Client ${clientId} disconnected (code: ${code}, reason: ${reason})`);
    this.emit('client_disconnected', { clientId, userId: client.userId, code, reason });
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Public API for broadcasting events
  public broadcast(event: RealtimeEvent, options: BroadcastOptions = {}): void {
    const targets = this.getTargetClients(options);
    
    targets.forEach(clientId => {
      this.sendToClient(clientId, event);
    });

    this.emit('event_broadcasted', { event, targetCount: targets.length });
  }

  public broadcastToUser(userId: string, event: RealtimeEvent): void {
    const userClients = this.userClients.get(userId);
    if (!userClients) return;

    userClients.forEach(clientId => {
      this.sendToClient(clientId, event);
    });
  }

  public broadcastToProject(projectId: string, event: RealtimeEvent, excludeUserId?: string): void {
    // For now, broadcast to all users. In a full implementation,
    // you'd need to maintain project member mapping
    this.broadcast(event, { projectId, excludeClient: excludeUserId });
  }

  public sendToClient(clientId: string, data: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.websocket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.websocket.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`Failed to send to client ${clientId}:`, error);
      this.handleClientDisconnect(clientId, 1011, 'Send failed');
      return false;
    }
  }

  private getTargetClients(options: BroadcastOptions): string[] {
    const targets: string[] = [];

    for (const [clientId, client] of this.clients.entries()) {
      // Filter by user
      if (options.userId && client.userId !== options.userId) {
        continue;
      }

      // Exclude specific client
      if (options.excludeClient && clientId === options.excludeClient) {
        continue;
      }

      // Check if client is subscribed to relevant channels
      const hasRelevantSubscription = this.clientHasRelevantSubscription(client, options);
      if (hasRelevantSubscription) {
        targets.push(clientId);
      }
    }

    return targets;
  }

  private clientHasRelevantSubscription(client: ClientConnection, options: BroadcastOptions): boolean {
    // If no specific filtering, include all clients
    if (!options.sourceId && !options.sourceType && !options.projectId) {
      return true;
    }

    // Check for specific source subscriptions
    if (options.sourceId) {
      const sourceChannel = `source:${options.sourceId}`;
      if (client.subscriptions.has(sourceChannel)) {
        return true;
      }
    }

    // Check for source type subscriptions
    if (options.sourceType) {
      const typeChannel = `type:${options.sourceType}`;
      if (client.subscriptions.has(typeChannel)) {
        return true;
      }
    }

    // Check for project subscriptions
    if (options.projectId) {
      const projectChannel = `project:${options.projectId}`;
      if (client.subscriptions.has(projectChannel)) {
        return true;
      }
    }

    // Check for global subscriptions
    if (client.subscriptions.has('all') || client.subscriptions.has('*')) {
      return true;
    }

    return false;
  }

  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.websocket.readyState === WebSocket.OPEN) {
          try {
            client.websocket.ping();
          } catch (error) {
            console.error(`Failed to ping client ${clientId}:`, error);
            this.handleClientDisconnect(clientId, 1011, 'Ping failed');
          }
        }
      });
    }, 30000); // Ping every 30 seconds
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const staleThreshold = 60000; // 1 minute

      this.clients.forEach((client, clientId) => {
        const timeSinceActivity = now.getTime() - client.lastActivity.getTime();
        
        if (timeSinceActivity > staleThreshold && client.websocket.readyState !== WebSocket.OPEN) {
          console.log(`Cleaning up stale client ${clientId}`);
          this.handleClientDisconnect(clientId, 1001, 'Stale connection cleanup');
        }
      });
    }, 30000); // Cleanup every 30 seconds
  }

  // Statistics and monitoring
  public getStats(): {
    totalConnections: number;
    connectionsPerUser: { [userId: string]: number };
    totalUsers: number;
    serverUptime: number;
  } {
    const connectionsPerUser: { [userId: string]: number } = {};
    
    this.userClients.forEach((clients, userId) => {
      connectionsPerUser[userId] = clients.size;
    });

    return {
      totalConnections: this.clients.size,
      connectionsPerUser,
      totalUsers: this.userClients.size,
      serverUptime: process.uptime()
    };
  }

  public getClientInfo(clientId: string): ClientConnection | null {
    return this.clients.get(clientId) || null;
  }

  public getUserClients(userId: string): ClientConnection[] {
    const clientIds = this.userClients.get(userId) || new Set();
    return Array.from(clientIds)
      .map(id => this.clients.get(id))
      .filter(client => client !== undefined) as ClientConnection[];
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    console.log('Shutting down real-time server...');

    // Clear intervals
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all client connections
    const closePromises: Promise<void>[] = [];
    
    this.clients.forEach((client, clientId) => {
      const promise = new Promise<void>((resolve) => {
        if (client.websocket.readyState === WebSocket.OPEN) {
          client.websocket.close(1001, 'Server shutdown');
          client.websocket.once('close', () => resolve());
        } else {
          resolve();
        }
      });
      closePromises.push(promise);
    });

    await Promise.all(closePromises);

    // Clear all maps
    this.clients.clear();
    this.userClients.clear();

    console.log('Real-time server shutdown complete');
  }
}

// Utility functions for creating events
export function createStreamingEvent(
  type: RealtimeEvent['type'],
  sourceId: string,
  userId: string,
  data: any,
  projectId?: string
): RealtimeEvent {
  return {
    type,
    sourceType: 'streaming',
    sourceId,
    userId,
    projectId,
    timestamp: new Date(),
    data
  };
}

export function createScrapingEvent(
  type: RealtimeEvent['type'],
  sourceId: string,
  userId: string,
  data: any,
  projectId?: string
): RealtimeEvent {
  return {
    type,
    sourceType: 'scraping',
    sourceId,
    userId,
    projectId,
    timestamp: new Date(),
    data
  };
}

// Global instance - will be initialized when server starts
export let realtimeServer: RealtimeServer | null = null;

export function initializeRealtimeServer(wss: WebSocket.Server): RealtimeServer {
  if (realtimeServer) {
    throw new Error('Real-time server already initialized');
  }
  
  realtimeServer = new RealtimeServer(wss);
  return realtimeServer;
}

export function getRealtimeServer(): RealtimeServer | null {
  return realtimeServer;
}