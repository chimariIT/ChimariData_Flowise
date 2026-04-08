// import { EventEmitter } from './event-emitter'; // Removed missing import
import { API_BASE } from './api'; // Assuming API_BASE is exported or we need to redefine it

// Simple Event Emitter implementation if not available
class SimpleEventEmitter {
    private listeners: Map<string, Set<(data: any) => void>> = new Map();

    on(event: string, callback: (data: any) => void) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);
        return () => this.off(event, callback);
    }

    off(event: string, callback: (data: any) => void) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)!.delete(callback);
        }
    }

    emit(event: string, data: any) {
        if (this.listeners.has(event)) {
            this.listeners.get(event)!.forEach(callback => callback(data));
        }
    }
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class WebSocketManager extends SimpleEventEmitter {
    private ws: WebSocket | null = null;
    private status: ConnectionStatus = 'disconnected';
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private subscriptions: Set<string> = new Set();
    private pingInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    public connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }

        this.status = 'connecting';
        this.emit('status', this.status);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = import.meta.env.DEV ? 'localhost:5173' : window.location.host;
        const token = localStorage.getItem('auth_token');

        const url = `${protocol}//${host}/ws?token=${token || ''}`;

        try {
            this.ws = new WebSocket(url);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.handleDisconnect();
        }
    }

    private setupEventHandlers() {
        if (!this.ws) return;

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.status = 'connected';
            this.reconnectAttempts = 0;
            this.emit('status', this.status);
            this.startHeartbeat();
            this.resubscribe();
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // Handle system messages
                if (message.type === 'pong') return;
                if (message.type === 'connection_established') {
                    console.log('WebSocket connection confirmed by server');
                    return;
                }

                // Emit specific event type
                this.emit(message.type, message);

                // Emit generic message event
                this.emit('message', message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
            }
        };

        this.ws.onclose = () => {
            this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.status = 'error';
            this.emit('status', this.status);
        };
    }

    private handleDisconnect() {
        if (this.status === 'disconnected') return;

        this.status = 'disconnected';
        this.emit('status', this.status);
        this.stopHeartbeat();

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`WebSocket reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
            setTimeout(() => this.connect(), delay);
        }
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    private stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    public subscribe(channel: string) {
        this.subscriptions.add(channel);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                channels: [channel]
            }));
        }
    }

    public unsubscribe(channel: string) {
        this.subscriptions.delete(channel);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'unsubscribe',
                channels: [channel]
            }));
        }
    }

    private resubscribe() {
        if (this.subscriptions.size > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'subscribe',
                channels: Array.from(this.subscriptions)
            }));
        }
    }

    public disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.status = 'disconnected';
        this.emit('status', this.status);
    }
}

export const webSocketManager = new WebSocketManager();
