import { RealtimeEvent, WebSocketMessage } from '@shared/schema';
import { queryClient } from './queryClient';

// Event handler type
export type EventHandler<T = any> = (event: RealtimeEvent & { data: T }) => void;

// Connection states
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed';

// Connection statistics
export interface ConnectionStats {
  totalConnections: number;
  totalReconnections: number;
  totalMessages: number;
  lastConnected?: Date;
  lastDisconnected?: Date;
  connectionDuration: number;
}

// Real-time client configuration
export interface RealtimeClientConfig {
  url?: string;
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  debug?: boolean;
}

// Subscription options
export interface SubscriptionOptions {
  immediate?: boolean; // Trigger handler immediately with cached data
  persistent?: boolean; // Keep subscription across reconnections
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private eventListeners: Map<string, Set<EventHandler>> = new Map();
  private subscriptions: Set<string> = new Set();
  private persistentSubscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectionTimer: NodeJS.Timeout | null = null;
  private stats: ConnectionStats;
  private config: Required<RealtimeClientConfig>;
  private lastEventCache: Map<string, RealtimeEvent> = new Map();
  private stateChangeListeners: Set<(state: ConnectionState) => void> = new Set();

  constructor(config: RealtimeClientConfig = {}) {
    this.config = {
      url: this.getWebSocketUrl(),
      maxReconnectAttempts: 10,
      reconnectBaseDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      debug: false,
      ...config,
    };

    this.stats = {
      totalConnections: 0,
      totalReconnections: 0,
      totalMessages: 0,
      connectionDuration: 0,
    };

    // Auto-connect on instantiation
    this.connect();

    // Handle page visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    // Handle online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline.bind(this));
      window.addEventListener('offline', this.handleOffline.bind(this));
    }
  }

  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') {
      return 'ws://localhost:5000/ws';
    }

    // Use same-origin to avoid port mismatch issues
    const wsOrigin = window.location.origin.replace(/^http/, 'ws');
    return `${wsOrigin}/ws`;
  }

  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[RealtimeClient] ${message}`, ...args);
    }
  }

  private error(message: string, ...args: any[]): void {
    console.error(`[RealtimeClient] ${message}`, ...args);
  }

  public connect(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      return;
    }

    this.setConnectionState('connecting');
    this.log('Connecting to real-time server...');

    try {
      // Get authentication token
      const authToken = this.getAuthToken();
      const baseUrl = this.getWebSocketUrl(); // Use fresh URL each time
      const url = authToken 
        ? `${baseUrl}?token=${encodeURIComponent(authToken)}`
        : baseUrl;

      console.log('[DEBUG] WebSocket connecting to:', url); // Debug logging
      this.ws = new WebSocket(url);

      // Set connection timeout
      this.connectionTimer = setTimeout(() => {
        if (this.connectionState === 'connecting') {
          this.error('Connection timeout');
          this.ws?.close();
          this.handleConnectionError(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeout);

      this.setupWebSocketEventHandlers();

    } catch (error) {
      this.error('Failed to create WebSocket connection:', error);
      this.handleConnectionError(error as Error);
    }
  }

  private getAuthToken(): string | null {
    // Try localStorage first (for email auth)
    const localToken = localStorage.getItem('auth_token');
    if (localToken) {
      return localToken;
    }

    // Try sessionStorage
    const sessionToken = sessionStorage.getItem('auth_token');
    if (sessionToken) {
      return sessionToken;
    }

    // For OAuth, we might need to check cookies or make an API call
    // For now, return null - the server should handle unauthenticated connections
    // in development mode
    return null;
  }

  private setupWebSocketEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = this.handleOpen.bind(this);
    this.ws.onmessage = this.handleMessage.bind(this);
    this.ws.onclose = this.handleClose.bind(this);
    this.ws.onerror = this.handleError.bind(this);
  }

  private handleOpen(): void {
    this.log('WebSocket connection established');
    
    // Clear connection timeout
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }

    this.setConnectionState('connected');
    this.stats.totalConnections++;
    this.stats.lastConnected = new Date();
    this.reconnectAttempts = 0;

    // Resubscribe to persistent subscriptions
    this.resubscribePersistentChannels();

    // Start heartbeat
    this.startHeartbeat();
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      this.stats.totalMessages++;

      // Handle system messages
      if (data.type === 'connection_established') {
        this.log('Connection established', data);
        return;
      }

      if (data.type === 'subscription_confirmed') {
        this.log('Subscription confirmed for channels:', data.data.channels);
        return;
      }

      if (data.type === 'unsubscription_confirmed') {
        this.log('Unsubscription confirmed for channels:', data.data.channels);
        return;
      }

      if (data.type === 'pong') {
        this.log('Heartbeat pong received');
        return;
      }

      // Handle real-time events
      if (this.isRealtimeEvent(data)) {
        this.handleRealtimeEvent(data);
      } else {
        this.log('Unknown message type:', data);
      }

    } catch (error) {
      this.error('Failed to parse WebSocket message:', error);
    }
  }

  private handleClose(event: CloseEvent): void {
    this.log('WebSocket connection closed', { code: event.code, reason: event.reason });
    
    this.setConnectionState('disconnected');
    this.stats.lastDisconnected = new Date();
    
    if (this.stats.lastConnected) {
      this.stats.connectionDuration += Date.now() - this.stats.lastConnected.getTime();
    }

    this.stopHeartbeat();

    // Attempt reconnection unless it was a manual close
    if (event.code !== 1000 && event.code !== 1001) {
      this.scheduleReconnect();
    }
  }

  private handleError(event: Event): void {
    this.error('WebSocket error:', event);
    this.handleConnectionError(new Error('WebSocket error'));
  }

  private handleConnectionError(error: Error): void {
    this.setConnectionState('failed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.error('Max reconnection attempts reached');
      this.setConnectionState('failed');
      return;
    }

    this.setConnectionState('reconnecting');
    this.stats.totalReconnections++;

    const delay = Math.min(
      this.config.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.log(`Scheduling reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private isRealtimeEvent(data: any): data is RealtimeEvent {
    return data && 
           typeof data.type === 'string' &&
           typeof data.sourceType === 'string' &&
           typeof data.sourceId === 'string' &&
           typeof data.userId === 'string' &&
           data.timestamp &&
           data.data !== undefined;
  }

  private handleRealtimeEvent(event: RealtimeEvent): void {
    this.log('Received real-time event:', event);

    // Cache the event for late subscribers
    const cacheKey = `${event.sourceType}:${event.sourceId}:${event.type}`;
    this.lastEventCache.set(cacheKey, event);

    // Emit to specific listeners
    const specificKey = `${event.sourceType}:${event.sourceId}`;
    this.emitToListeners(specificKey, event);

    // Emit to type listeners
    const typeKey = `type:${event.sourceType}`;
    this.emitToListeners(typeKey, event);

    // Emit to global listeners
    this.emitToListeners('all', event);
    this.emitToListeners('*', event);

    // Update React Query cache if relevant
    this.updateReactQueryCache(event);
  }

  private emitToListeners(key: string, event: RealtimeEvent): void {
    const listeners = this.eventListeners.get(key);
    if (listeners) {
      listeners.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          this.error(`Event handler error for ${key}:`, error);
        }
      });
    }
  }

  private updateReactQueryCache(event: RealtimeEvent): void {
    try {
      // Invalidate relevant queries based on event type
      switch (event.type) {
        case 'status_change':
          queryClient.invalidateQueries({
            queryKey: [`/api/${event.sourceType === 'streaming' ? 'streaming-sources' : 'scraping-jobs'}`, event.sourceId]
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/${event.sourceType === 'streaming' ? 'streaming-sources' : 'scraping-jobs'}`]
          });
          break;

        case 'metrics_update':
          queryClient.invalidateQueries({
            queryKey: ['/api/live-sources/overview']
          });
          break;

        case 'job_complete':
          queryClient.invalidateQueries({
            queryKey: [`/api/scraping-jobs`, event.sourceId]
          });
          queryClient.invalidateQueries({
            queryKey: ['/api/scraping-jobs']
          });
          break;

        default:
          // For other events, just invalidate the specific source
          queryClient.invalidateQueries({
            queryKey: [`/api/${event.sourceType === 'streaming' ? 'streaming-sources' : 'scraping-jobs'}`, event.sourceId]
          });
      }
    } catch (error) {
      this.error('Failed to update React Query cache:', error);
    }
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.log(`Connection state changed to: ${state}`);
      
      this.stateChangeListeners.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          this.error('State change listener error:', error);
        }
      });
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({ type: 'ping' });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private sendMessage(message: WebSocketMessage | any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('Cannot send message - WebSocket not open');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.error('Failed to send message:', error);
      return false;
    }
  }

  private resubscribePersistentChannels(): void {
    if (this.persistentSubscriptions.size > 0) {
      const channels = Array.from(this.persistentSubscriptions);
      this.sendMessage({
        type: 'subscribe',
        channels: channels,
      });
    }
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.log('Page hidden - maintaining connection');
    } else {
      this.log('Page visible - ensuring connection');
      if (this.connectionState === 'disconnected' || this.connectionState === 'failed') {
        this.connect();
      }
    }
  }

  private handleOnline(): void {
    this.log('Network online - ensuring connection');
    if (this.connectionState !== 'connected' && this.connectionState !== 'connecting') {
      this.connect();
    }
  }

  private handleOffline(): void {
    this.log('Network offline');
  }

  // Public API
  public subscribe<T = any>(
    channel: string, 
    handler: EventHandler<T>, 
    options: SubscriptionOptions = {}
  ): () => void {
    const { immediate = false, persistent = true } = options;

    // Add to listeners
    if (!this.eventListeners.has(channel)) {
      this.eventListeners.set(channel, new Set());
    }
    this.eventListeners.get(channel)!.add(handler);

    // Add to subscriptions
    this.subscriptions.add(channel);
    if (persistent) {
      this.persistentSubscriptions.add(channel);
    }

    // Subscribe on server if connected
    if (this.connectionState === 'connected') {
      this.sendMessage({
        type: 'subscribe',
        channels: [channel],
      });
    }

    // Trigger with cached data if requested
    if (immediate) {
      const cacheKey = `${channel}:status_change`; // Try common patterns
      const cachedEvent = this.lastEventCache.get(cacheKey);
      if (cachedEvent) {
        setTimeout(() => handler(cachedEvent as any), 0);
      }
    }

    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(channel);
      if (listeners) {
        listeners.delete(handler);
        if (listeners.size === 0) {
          this.eventListeners.delete(channel);
          this.subscriptions.delete(channel);
          this.persistentSubscriptions.delete(channel);

          // Unsubscribe on server if connected
          if (this.connectionState === 'connected') {
            this.sendMessage({
              type: 'unsubscribe',
              channels: [channel],
            });
          }
        }
      }
    };
  }

  public unsubscribe(channel: string): void {
    this.eventListeners.delete(channel);
    this.subscriptions.delete(channel);
    this.persistentSubscriptions.delete(channel);

    if (this.connectionState === 'connected') {
      this.sendMessage({
        type: 'unsubscribe',
        channels: [channel],
      });
    }
  }

  public onConnectionStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateChangeListeners.add(listener);
    
    // Immediately call with current state
    listener(this.connectionState);
    
    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public getStats(): ConnectionStats {
    return { ...this.stats };
  }

  public isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  public disconnect(): void {
    this.log('Manually disconnecting');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.setConnectionState('disconnected');
  }

  public destroy(): void {
    this.disconnect();

    // Clear all listeners
    this.eventListeners.clear();
    this.subscriptions.clear();
    this.persistentSubscriptions.clear();
    this.stateChangeListeners.clear();
    this.lastEventCache.clear();

    // Remove global event listeners
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }
}

// Global instance
export const realtimeClient = new RealtimeClient({
  debug: import.meta.env.DEV,
});

// Export singleton instance and class for custom instances
export default realtimeClient;