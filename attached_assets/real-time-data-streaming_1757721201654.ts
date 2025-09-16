/**
 * Real-time Data Streaming Service
 * Provides capabilities for streaming data from various sources
 * including WebSocket connections, Server-Sent Events, and API endpoints
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

export interface StreamingConfig {
  source: 'websocket' | 'sse' | 'api' | 'database' | 'file';
  url?: string;
  interval?: number;
  batchSize?: number;
  transform?: (data: any) => any;
  filter?: (data: any) => boolean;
  bufferSize?: number;
  reconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface StreamingData {
  id: string;
  timestamp: Date;
  source: string;
  data: any;
  metadata?: {
    size: number;
    type: string;
    quality: number;
  };
}

export interface StreamingStats {
  totalRecords: number;
  recordsPerSecond: number;
  averageLatency: number;
  errorCount: number;
  uptime: number;
  lastUpdate: Date;
}

export class RealTimeDataStreamingService extends EventEmitter {
  private streams: Map<string, any> = new Map();
  private stats: Map<string, StreamingStats> = new Map();
  private isRunning: boolean = false;

  constructor() {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('data', (streamId: string, data: StreamingData) => {
      this.updateStats(streamId, data);
    });

    this.on('error', (streamId: string, error: Error) => {
      this.updateErrorStats(streamId);
      console.error(`Streaming error for ${streamId}:`, error);
    });
  }

  async createStream(streamId: string, config: StreamingConfig): Promise<void> {
    try {
      let stream: any;

      switch (config.source) {
        case 'websocket':
          stream = await this.createWebSocketStream(streamId, config);
          break;
        case 'sse':
          stream = await this.createSSEStream(streamId, config);
          break;
        case 'api':
          stream = await this.createAPIStream(streamId, config);
          break;
        case 'database':
          stream = await this.createDatabaseStream(streamId, config);
          break;
        case 'file':
          stream = await this.createFileStream(streamId, config);
          break;
        default:
          throw new Error(`Unsupported streaming source: ${config.source}`);
      }

      this.streams.set(streamId, stream);
      this.initializeStats(streamId);
      
      console.log(`Created ${config.source} stream: ${streamId}`);
      this.emit('streamCreated', streamId, config);
    } catch (error) {
      console.error(`Failed to create stream ${streamId}:`, error);
      throw error;
    }
  }

  private async createWebSocketStream(streamId: string, config: StreamingConfig): Promise<any> {
    if (!config.url) {
      throw new Error('WebSocket URL is required');
    }

    const ws = new WebSocket(config.url);
    let reconnectAttempts = 0;
    const maxReconnectAttempts = config.reconnectAttempts || 5;
    const reconnectDelay = config.reconnectDelay || 1000;

    const stream = {
      type: 'websocket',
      connection: ws,
      config,
      buffer: [],
      isConnected: false
    };

    ws.on('open', () => {
      console.log(`WebSocket connected: ${streamId}`);
      stream.isConnected = true;
      reconnectAttempts = 0;
      this.emit('connected', streamId);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const parsedData = JSON.parse(data.toString());
        this.processStreamData(streamId, parsedData, config);
      } catch (error) {
        console.error(`Error parsing WebSocket data for ${streamId}:`, error);
        this.emit('error', streamId, error);
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket disconnected: ${streamId}`);
      stream.isConnected = false;
      this.emit('disconnected', streamId);
      
      // Attempt reconnection
      if (reconnectAttempts < maxReconnectAttempts) {
        setTimeout(() => {
          reconnectAttempts++;
          console.log(`Attempting to reconnect WebSocket ${streamId} (attempt ${reconnectAttempts})`);
          this.createWebSocketStream(streamId, config);
        }, reconnectDelay * reconnectAttempts);
      }
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${streamId}:`, error);
      this.emit('error', streamId, error);
    });

    return stream;
  }

  private async createSSEStream(streamId: string, config: StreamingConfig): Promise<any> {
    if (!config.url) {
      throw new Error('SSE URL is required');
    }

    const stream = {
      type: 'sse',
      config,
      buffer: [],
      isConnected: false,
      eventSource: null as EventSource | null
    };

    try {
      const eventSource = new EventSource(config.url);
      stream.eventSource = eventSource;
      stream.isConnected = true;

      eventSource.onopen = () => {
        console.log(`SSE connected: ${streamId}`);
        this.emit('connected', streamId);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.processStreamData(streamId, data, config);
        } catch (error) {
          console.error(`Error parsing SSE data for ${streamId}:`, error);
          this.emit('error', streamId, error);
        }
      };

      eventSource.onerror = (error) => {
        console.error(`SSE error for ${streamId}:`, error);
        stream.isConnected = false;
        this.emit('error', streamId, error);
      };

      return stream;
    } catch (error) {
      console.error(`Failed to create SSE stream ${streamId}:`, error);
      throw error;
    }
  }

  private async createAPIStream(streamId: string, config: StreamingConfig): Promise<any> {
    if (!config.url) {
      throw new Error('API URL is required');
    }

    const stream = {
      type: 'api',
      config,
      buffer: [],
      isConnected: false,
      intervalId: null as NodeJS.Timeout | null
    };

    const pollData = async () => {
      try {
        const response = await fetch(config.url!);
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        this.processStreamData(streamId, data, config);
      } catch (error) {
        console.error(`API polling error for ${streamId}:`, error);
        this.emit('error', streamId, error);
      }
    };

    // Initial connection
    stream.isConnected = true;
    this.emit('connected', streamId);

    // Start polling
    const interval = config.interval || 1000;
    stream.intervalId = setInterval(pollData, interval);

    return stream;
  }

  private async createDatabaseStream(streamId: string, config: StreamingConfig): Promise<any> {
    const stream = {
      type: 'database',
      config,
      buffer: [],
      isConnected: false,
      intervalId: null as NodeJS.Timeout | null
    };

    const pollDatabase = async () => {
      try {
        // This would integrate with your database service
        // For now, we'll simulate database polling
        const data = await this.simulateDatabaseQuery(config);
        this.processStreamData(streamId, data, config);
      } catch (error) {
        console.error(`Database polling error for ${streamId}:`, error);
        this.emit('error', streamId, error);
      }
    };

    stream.isConnected = true;
    this.emit('connected', streamId);

    const interval = config.interval || 5000;
    stream.intervalId = setInterval(pollDatabase, interval);

    return stream;
  }

  private async createFileStream(streamId: string, config: StreamingConfig): Promise<any> {
    const stream = {
      type: 'file',
      config,
      buffer: [],
      isConnected: false,
      intervalId: null as NodeJS.Timeout | null,
      lastPosition: 0
    };

    const pollFile = async () => {
      try {
        // This would read from a file and track position
        // For now, we'll simulate file reading
        const data = await this.simulateFileRead(config, stream.lastPosition);
        if (data.length > 0) {
          stream.lastPosition += data.length;
          this.processStreamData(streamId, data, config);
        }
      } catch (error) {
        console.error(`File polling error for ${streamId}:`, error);
        this.emit('error', streamId, error);
      }
    };

    stream.isConnected = true;
    this.emit('connected', streamId);

    const interval = config.interval || 2000;
    stream.intervalId = setInterval(pollFile, interval);

    return stream;
  }

  private processStreamData(streamId: string, rawData: any, config: StreamingConfig): void {
    try {
      // Apply transformation if provided
      let processedData = rawData;
      if (config.transform) {
        processedData = config.transform(rawData);
      }

      // Apply filter if provided
      if (config.filter && !config.filter(processedData)) {
        return; // Skip this data point
      }

      // Create streaming data object
      const streamingData: StreamingData = {
        id: `${streamId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        source: streamId,
        data: processedData,
        metadata: {
          size: JSON.stringify(processedData).length,
          type: typeof processedData,
          quality: this.calculateDataQuality(processedData)
        }
      };

      // Add to buffer if configured
      const stream = this.streams.get(streamId);
      if (stream && config.bufferSize) {
        stream.buffer.push(streamingData);
        if (stream.buffer.length > config.bufferSize) {
          stream.buffer.shift(); // Remove oldest item
        }
      }

      // Emit the data
      this.emit('data', streamId, streamingData);
    } catch (error) {
      console.error(`Error processing stream data for ${streamId}:`, error);
      this.emit('error', streamId, error);
    }
  }

  private calculateDataQuality(data: any): number {
    // Simple data quality calculation
    let quality = 1.0;
    
    if (data === null || data === undefined) {
      quality = 0.0;
    } else if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length === 0) {
        quality = 0.5;
      } else {
        // Check for null/undefined values
        const nullCount = keys.filter(key => data[key] === null || data[key] === undefined).length;
        quality = 1.0 - (nullCount / keys.length);
      }
    }
    
    return Math.max(0, Math.min(1, quality));
  }

  private async simulateDatabaseQuery(config: StreamingConfig): Promise<any[]> {
    // Simulate database query results
    return [
      { id: Date.now(), value: Math.random() * 100, timestamp: new Date() },
      { id: Date.now() + 1, value: Math.random() * 100, timestamp: new Date() }
    ];
  }

  private async simulateFileRead(config: StreamingConfig, lastPosition: number): Promise<any[]> {
    // Simulate reading new lines from a file
    const newLines = Math.floor(Math.random() * 3); // 0-2 new lines
    const data = [];
    
    for (let i = 0; i < newLines; i++) {
      data.push({
        line: lastPosition + i + 1,
        content: `Line ${lastPosition + i + 1}: ${Math.random()}`,
        timestamp: new Date()
      });
    }
    
    return data;
  }

  private initializeStats(streamId: string): void {
    this.stats.set(streamId, {
      totalRecords: 0,
      recordsPerSecond: 0,
      averageLatency: 0,
      errorCount: 0,
      uptime: Date.now(),
      lastUpdate: new Date()
    });
  }

  private updateStats(streamId: string, data: StreamingData): void {
    const stats = this.stats.get(streamId);
    if (!stats) return;

    stats.totalRecords++;
    stats.lastUpdate = new Date();
    
    // Calculate records per second (simple moving average)
    const uptime = (Date.now() - stats.uptime) / 1000;
    stats.recordsPerSecond = stats.totalRecords / uptime;
    
    // Update latency (simplified)
    const latency = Date.now() - data.timestamp.getTime();
    stats.averageLatency = (stats.averageLatency + latency) / 2;
  }

  private updateErrorStats(streamId: string): void {
    const stats = this.stats.get(streamId);
    if (stats) {
      stats.errorCount++;
    }
  }

  // Public API methods
  async startStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    if (stream.isConnected) {
      console.log(`Stream ${streamId} is already running`);
      return;
    }

    // Restart the stream
    await this.createStream(streamId, stream.config);
  }

  async stopStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Clean up based on stream type
    switch (stream.type) {
      case 'websocket':
        if (stream.connection) {
          stream.connection.close();
        }
        break;
      case 'sse':
        if (stream.eventSource) {
          stream.eventSource.close();
        }
        break;
      case 'api':
      case 'database':
      case 'file':
        if (stream.intervalId) {
          clearInterval(stream.intervalId);
        }
        break;
    }

    stream.isConnected = false;
    this.emit('stopped', streamId);
    console.log(`Stopped stream: ${streamId}`);
  }

  async getStreamData(streamId: string, limit: number = 100): Promise<StreamingData[]> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    if (stream.buffer) {
      return stream.buffer.slice(-limit);
    }

    return [];
  }

  getStreamStats(streamId: string): StreamingStats | null {
    return this.stats.get(streamId) || null;
  }

  getAllStreams(): string[] {
    return Array.from(this.streams.keys());
  }

  getActiveStreams(): string[] {
    return Array.from(this.streams.entries())
      .filter(([_, stream]) => stream.isConnected)
      .map(([id, _]) => id);
  }

  async destroyStream(streamId: string): Promise<void> {
    await this.stopStream(streamId);
    this.streams.delete(streamId);
    this.stats.delete(streamId);
    console.log(`Destroyed stream: ${streamId}`);
  }

  async destroyAllStreams(): Promise<void> {
    const streamIds = Array.from(this.streams.keys());
    await Promise.all(streamIds.map(id => this.destroyStream(id)));
  }

  // Utility methods
  addDataTransform(streamId: string, transform: (data: any) => any): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.config.transform = transform;
    }
  }

  addDataFilter(streamId: string, filter: (data: any) => boolean): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.config.filter = filter;
    }
  }

  updateStreamConfig(streamId: string, config: Partial<StreamingConfig>): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.config = { ...stream.config, ...config };
    }
  }

  // Health check
  getHealthStatus(): { status: string; activeStreams: number; totalStreams: number; errors: number } {
    const activeStreams = this.getActiveStreams().length;
    const totalStreams = this.streams.size;
    const totalErrors = Array.from(this.stats.values()).reduce((sum, stats) => sum + stats.errorCount, 0);
    
    const status = activeStreams > 0 ? 'healthy' : 'no_active_streams';
    
    return {
      status,
      activeStreams,
      totalStreams,
      errors: totalErrors
    };
  }
}

// Export singleton instance
export const realTimeStreamingService = new RealTimeDataStreamingService();









