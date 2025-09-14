import { useState, useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { realtimeClient, type ConnectionState, type EventHandler } from '@/lib/realtime';
import type {
  RealtimeEvent,
  StreamingConnectionEstablished,
  StreamingConnectionLost,
  StreamingDataReceived,
  StreamingBufferStatus,
  StreamingErrorOccurred,
  StreamingMetricsUpdate,
  ScrapingJobStarted,
  ScrapingJobCompleted,
  ScrapingPageScraped,
  ScrapingExtractionProgress,
  ScrapingRateLimitHit,
  ScrapingErrorOccurred,
} from '@shared/schema';

// Generic real-time event hook
export function useRealtimeEvent<T = any>(
  channel: string,
  handler: EventHandler<T>,
  dependencies: any[] = []
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrappedHandler = (event: RealtimeEvent & { data: T }) => {
      handlerRef.current(event);
    };

    const unsubscribe = realtimeClient.subscribe(channel, wrappedHandler, {
      persistent: true,
      immediate: true,
    });

    return unsubscribe;
  }, [channel, ...dependencies]);
}

// Connection state hook
export function useRealtimeConnectionState(): {
  connectionState: ConnectionState;
  isConnected: boolean;
  stats: ReturnType<typeof realtimeClient.getStats>;
} {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    realtimeClient.getConnectionState()
  );
  const [stats, setStats] = useState(realtimeClient.getStats());

  useEffect(() => {
    const unsubscribe = realtimeClient.onConnectionStateChange((state) => {
      setConnectionState(state);
      setStats(realtimeClient.getStats());
    });

    // Update stats periodically
    const interval = setInterval(() => {
      setStats(realtimeClient.getStats());
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    stats,
  };
}

// Streaming source specific hooks
export function useRealtimeStreamingStatus(sourceId?: string): {
  connectionStatus: string | null;
  lastConnectionTime: Date | null;
  lastError: string | null;
  isReceivingData: boolean;
} {
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [lastConnectionTime, setLastConnectionTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isReceivingData, setIsReceivingData] = useState(false);

  useRealtimeEvent(
    sourceId ? `streaming:${sourceId}` : 'none',
    useCallback((event: RealtimeEvent) => {
      switch (event.type) {
        case 'status_change':
          setConnectionStatus(event.data.status || event.data.connectionStatus);
          if (event.data.status === 'connected') {
            setLastConnectionTime(new Date(event.timestamp));
            setLastError(null);
          }
          break;

        case 'error':
          setLastError(event.data.error || event.data.message);
          setConnectionStatus('error');
          break;

        case 'data_received':
          setIsReceivingData(true);
          // Reset data receiving flag after 5 seconds
          setTimeout(() => setIsReceivingData(false), 5000);
          break;
      }
    }, []),
    [sourceId]
  );

  return {
    connectionStatus,
    lastConnectionTime,
    lastError,
    isReceivingData,
  };
}

export function useRealtimeStreamingMetrics(sourceId?: string): {
  recordsPerSecond: number;
  totalRecords: number;
  avgProcessingTime: number;
  errorRate: number;
  bufferStatus: { currentSize: number; maxSize: number; flushPending: boolean } | null;
} {
  const [metrics, setMetrics] = useState({
    recordsPerSecond: 0,
    totalRecords: 0,
    avgProcessingTime: 0,
    errorRate: 0,
  });
  const [bufferStatus, setBufferStatus] = useState<{
    currentSize: number;
    maxSize: number;
    flushPending: boolean;
  } | null>(null);

  useRealtimeEvent(
    sourceId ? `streaming:${sourceId}` : 'none',
    useCallback((event: RealtimeEvent) => {
      switch (event.type) {
        case 'metrics_update':
          setMetrics({
            recordsPerSecond: event.data.recordsPerSecond || 0,
            totalRecords: event.data.totalRecords || 0,
            avgProcessingTime: event.data.avgProcessingTime || 0,
            errorRate: event.data.errorRate || 0,
          });
          break;

        case 'buffer_status':
          setBufferStatus({
            currentSize: event.data.currentSize || 0,
            maxSize: event.data.maxSize || 0,
            flushPending: event.data.flushPending || false,
          });
          break;
      }
    }, []),
    [sourceId]
  );

  return {
    ...metrics,
    bufferStatus,
  };
}

// Scraping job specific hooks
export function useRealtimeScrapingProgress(jobId?: string): {
  isRunning: boolean;
  pagesCompleted: number;
  totalPages: number;
  recordsExtracted: number;
  currentUrl: string | null;
  estimatedRemaining: number;
  lastError: string | null;
} {
  const [progress, setProgress] = useState({
    isRunning: false,
    pagesCompleted: 0,
    totalPages: 0,
    recordsExtracted: 0,
    currentUrl: null as string | null,
    estimatedRemaining: 0,
    lastError: null as string | null,
  });

  useRealtimeEvent(
    jobId ? `scraping:${jobId}` : 'none',
    useCallback((event: RealtimeEvent) => {
      switch (event.type) {
        case 'status_change':
          if (event.data.status) {
            setProgress(prev => ({
              ...prev,
              isRunning: event.data.status === 'running',
            }));
          }
          break;

        case 'progress':
          setProgress(prev => ({
            ...prev,
            pagesCompleted: event.data.pagesCompleted || prev.pagesCompleted,
            totalPages: event.data.totalPages || prev.totalPages,
            estimatedRemaining: event.data.estimatedRemaining || prev.estimatedRemaining,
            currentUrl: event.data.url || prev.currentUrl,
          }));
          break;

        case 'data_received':
          setProgress(prev => ({
            ...prev,
            recordsExtracted: prev.recordsExtracted + (event.data.recordCount || 0),
          }));
          break;

        case 'error':
          setProgress(prev => ({
            ...prev,
            lastError: event.data.error || event.data.message,
          }));
          break;

        case 'job_complete':
          setProgress(prev => ({
            ...prev,
            isRunning: false,
            recordsExtracted: event.data.recordsExtracted || prev.recordsExtracted,
          }));
          break;
      }
    }, []),
    [jobId]
  );

  return progress;
}

export function useRealtimeScrapingJobEvents(jobId?: string): {
  events: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: Date;
    severity?: 'info' | 'warning' | 'error';
  }>;
  clearEvents: () => void;
} {
  const [events, setEvents] = useState<Array<{
    id: string;
    type: string;
    message: string;
    timestamp: Date;
    severity?: 'info' | 'warning' | 'error';
  }>>([]);

  useRealtimeEvent(
    jobId ? `scraping:${jobId}` : 'none',
    useCallback((event: RealtimeEvent) => {
      const newEvent = {
        id: `${event.timestamp}-${event.type}`,
        type: event.type,
        message: this.formatEventMessage(event),
        timestamp: new Date(event.timestamp),
        severity: this.getEventSeverity(event),
      };

      setEvents(prev => [newEvent, ...prev].slice(0, 100)); // Keep last 100 events
    }, []),
    [jobId]
  );

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return { events, clearEvents };
}

// Live sources overview hook
export function useRealtimeLiveSourcesOverview(): {
  streamingStats: { total: number; active: number; inactive: number; error: number };
  scrapingStats: { total: number; active: number; inactive: number; running: number; error: number };
  metrics: { totalDataReceived: number; activeSources: number; errorRate: number };
  recentActivity: Array<{
    id: string;
    type: string;
    sourceType: 'streaming' | 'scraping';
    sourceId: string;
    message: string;
    timestamp: Date;
  }>;
} {
  const [overview, setOverview] = useState({
    streamingStats: { total: 0, active: 0, inactive: 0, error: 0 },
    scrapingStats: { total: 0, active: 0, inactive: 0, running: 0, error: 0 },
    metrics: { totalDataReceived: 0, activeSources: 0, errorRate: 0 },
    recentActivity: [] as Array<{
      id: string;
      type: string;
      sourceType: 'streaming' | 'scraping';
      sourceId: string;
      message: string;
      timestamp: Date;
    }>,
  });

  useRealtimeEvent(
    'overview_metrics',
    useCallback((event: RealtimeEvent) => {
      if (event.type === 'metrics_update') {
        setOverview(prev => ({
          ...prev,
          ...event.data,
        }));
      }
    }, []),
    []
  );

  // Listen to all events for recent activity
  useRealtimeEvent(
    'all',
    useCallback((event: RealtimeEvent) => {
      const activity = {
        id: `${event.timestamp}-${event.sourceId}`,
        type: event.type,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        message: formatEventMessage(event),
        timestamp: new Date(event.timestamp),
      };

      setOverview(prev => ({
        ...prev,
        recentActivity: [activity, ...prev.recentActivity].slice(0, 50), // Keep last 50 activities
      }));
    }, []),
    []
  );

  return overview;
}

// Multi-source status hook
export function useRealtimeMultiSourceStatus(sourceIds: string[]): {
  statuses: Record<string, {
    status: string;
    lastUpdate: Date;
    isActive: boolean;
    errorCount: number;
  }>;
} {
  const [statuses, setStatuses] = useState<Record<string, {
    status: string;
    lastUpdate: Date;
    isActive: boolean;
    errorCount: number;
  }>>({});

  // Subscribe to each source
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    sourceIds.forEach(sourceId => {
      const unsubscribe = realtimeClient.subscribe(
        `source:${sourceId}`,
        (event: RealtimeEvent) => {
          setStatuses(prev => ({
            ...prev,
            [sourceId]: {
              status: event.data.status || event.data.connectionStatus || 'unknown',
              lastUpdate: new Date(event.timestamp),
              isActive: ['connected', 'running', 'active'].includes(
                event.data.status || event.data.connectionStatus
              ),
              errorCount: event.type === 'error' 
                ? (prev[sourceId]?.errorCount || 0) + 1 
                : prev[sourceId]?.errorCount || 0,
            },
          }));
        }
      );

      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(fn => fn());
    };
  }, [sourceIds.join(',')]);

  return { statuses };
}

// Utility functions
function formatEventMessage(event: RealtimeEvent): string {
  switch (event.type) {
    case 'status_change':
      return `Status changed to ${event.data.status || event.data.connectionStatus}`;
    case 'data_received':
      return `Received ${event.data.recordCount || 0} records`;
    case 'error':
      return event.data.error || event.data.message || 'Unknown error occurred';
    case 'progress':
      return `Progress: ${event.data.pagesCompleted || 0}/${event.data.totalPages || 0} pages`;
    case 'job_complete':
      return `Job completed with ${event.data.recordsExtracted || 0} records extracted`;
    default:
      return `${event.type} event`;
  }
}

function getEventSeverity(event: RealtimeEvent): 'info' | 'warning' | 'error' {
  switch (event.type) {
    case 'error':
      return 'error';
    case 'status_change':
      return event.data.status === 'error' ? 'error' : 'info';
    default:
      return 'info';
  }
}

// Connection health hook
export function useRealtimeConnectionHealth(): {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
} {
  const { connectionState, stats } = useRealtimeConnectionState();
  const [health, setHealth] = useState({
    isHealthy: true,
    issues: [] as string[],
    recommendations: [] as string[],
  });

  useEffect(() => {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check connection state
    if (connectionState === 'disconnected') {
      issues.push('Real-time connection is disconnected');
      recommendations.push('Check your internet connection and try refreshing the page');
    } else if (connectionState === 'failed') {
      issues.push('Real-time connection failed');
      recommendations.push('The real-time service may be temporarily unavailable');
    } else if (connectionState === 'reconnecting') {
      issues.push('Real-time connection is reconnecting');
      recommendations.push('Please wait while we restore the connection');
    }

    // Check reconnection frequency
    if (stats.totalReconnections > 5) {
      issues.push('Frequent reconnections detected');
      recommendations.push('You may have an unstable internet connection');
    }

    // Check connection duration
    if (stats.connectionDuration < 60000 && stats.totalConnections > 1) {
      issues.push('Short-lived connections detected');
      recommendations.push('Consider checking your network stability');
    }

    setHealth({
      isHealthy: issues.length === 0 && connectionState === 'connected',
      issues,
      recommendations,
    });
  }, [connectionState, stats]);

  return health;
}