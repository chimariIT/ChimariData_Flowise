import { apiClient } from './api';

type MetricStatus = 'success' | 'warning' | 'error';

interface PendingMetric {
  timestamp: string;
  service: string;
  operation: string;
  duration: number;
  status: MetricStatus;
  metadata?: Record<string, any>;
}

export interface ClientMetricHandle {
  end: (status: MetricStatus, extraMetadata?: Record<string, any>) => void;
}

const METRIC_SERVICE = 'client_upload';
const BUFFER_LIMIT = 10;
const FLUSH_INTERVAL_MS = 5000;
const MAX_QUEUE_SIZE = 100;

let buffer: PendingMetric[] = [];
let flushTimeout: number | undefined;
let flushInFlight = false;

const noopHandle: ClientMetricHandle = {
  end: () => undefined
};

const scheduleFlush = () => {
  if (typeof window === 'undefined') {
    return;
  }

  if (flushTimeout) {
    return;
  }

  flushTimeout = window.setTimeout(() => {
    flushTimeout = undefined;
    void flushClientMetrics();
  }, FLUSH_INTERVAL_MS);
};

const queueMetric = (metric: PendingMetric) => {
  buffer.push(metric);

  if (buffer.length >= MAX_QUEUE_SIZE) {
    buffer = buffer.slice(buffer.length - MAX_QUEUE_SIZE);
  }

  if (buffer.length >= BUFFER_LIMIT) {
    void flushClientMetrics();
    return;
  }

  scheduleFlush();
};

export async function flushClientMetrics(): Promise<void> {
  if (flushInFlight) {
    return;
  }

  if (flushTimeout) {
    if (typeof window !== 'undefined') {
      clearTimeout(flushTimeout);
    }
    flushTimeout = undefined;
  }

  if (buffer.length === 0) {
    return;
  }

  const payload = buffer.slice();
  buffer = [];
  flushInFlight = true;

  try {
    await apiClient.post('/api/performance/metrics/batch', {
      metrics: payload
    });
  } catch (error) {
    console.warn('Failed to flush client performance metrics:', error);
    buffer = payload.concat(buffer).slice(-MAX_QUEUE_SIZE);
  } finally {
    flushInFlight = false;
  }
}

export function startClientMetric(operation: string, baseMetadata: Record<string, any> = {}): ClientMetricHandle {
  if (!operation || typeof operation !== 'string') {
    return noopHandle;
  }

  const metadata = { ...baseMetadata };
  const hasPerformance = typeof performance !== 'undefined' && typeof performance.now === 'function';
  const startTime = hasPerformance ? performance.now() : Date.now();
  const markBase = hasPerformance ? `chimari_${operation}_${Date.now()}` : null;
  let ended = false;

  if (markBase) {
    try {
      performance.mark(`${markBase}_start`);
    } catch (error) {
      console.warn('Failed to create performance start mark:', error);
    }
  }

  return {
    end: (status: MetricStatus, extraMetadata: Record<string, any> = {}) => {
      if (ended) {
        return;
      }
      ended = true;

      const endTime = hasPerformance ? performance.now() : Date.now();
      const duration = Math.max(0, Math.round(endTime - startTime));
      const timestamp = new Date().toISOString();

      if (markBase) {
        try {
          performance.mark(`${markBase}_end`);
          performance.measure(`chimari_${operation}`, `${markBase}_start`, `${markBase}_end`);
        } catch (error) {
          console.warn('Failed to measure performance mark:', error);
        } finally {
          try {
            performance.clearMarks(`${markBase}_start`);
            performance.clearMarks(`${markBase}_end`);
          } catch (clearError) {
            console.warn('Failed to clear performance marks:', clearError);
          }
        }
      }

      queueMetric({
        timestamp,
        service: METRIC_SERVICE,
        operation,
        duration,
        status,
        metadata: { ...metadata, ...extraMetadata }
      });
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushClientMetrics();
    }
  });

  window.addEventListener('beforeunload', () => {
    void flushClientMetrics();
  });
}
