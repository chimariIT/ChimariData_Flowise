// server/services/live-sources-registry.ts
import { nanoid } from 'nanoid';

type LiveSourceType = 'streaming' | 'scraping';

export type StatusType =
  | 'inactive'
  | 'active'
  | 'running'
  | 'stopped'
  | 'paused'
  | 'error'
  | 'ready'
  | 'scheduled'
  | 'starting'
  | 'stopping';

export interface LiveSourceMetrics {
  recordsProcessed: number;
  successRate: number;
  avgRecordsPerMinute: number;
  errorRate: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastActivity?: string;
}

export interface LiveSourceRecord {
  id: string;
  type: LiveSourceType;
  datasetId: string;
  projectId?: string | null;
  name?: string | null;
  description?: string | null;
  status: StatusType;
  protocol?: string | null;
  endpoint?: string | null;
  strategy?: string | null;
  targetUrl?: string | null;
  schedule?: string | null;
  lastError?: string | null;
  metrics: LiveSourceMetrics;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityEvent {
  id: string;
  sourceId: string;
  sourceType: LiveSourceType;
  type: 'created' | 'updated' | 'started' | 'stopped' | 'error' | 'deleted' | 'run_completed' | 'run_failed';
  message: string;
  timestamp: string;
  projectId?: string | null;
  datasetId?: string | null;
  metadata?: Record<string, unknown>;
}

interface UpsertOptions {
  recordActivity?: boolean;
  activityType?: ActivityEvent['type'];
  activityMessage?: string;
  activityMetadata?: Record<string, unknown>;
  timestamp?: Date;
}

type LiveSourceUpsertInput = Omit<Partial<LiveSourceRecord>, 'metrics' | 'status'> & {
  id: string;
  datasetId: string;
  metrics?: Partial<LiveSourceMetrics>;
  status?: StatusType | string | null;
};

const DEFAULT_METRICS: LiveSourceMetrics = {
  recordsProcessed: 0,
  successRate: 100,
  avgRecordsPerMinute: 0,
  errorRate: 0,
};

function nowIso(): string {
  return new Date().toISOString();
}

function mergeMetrics(existing?: LiveSourceMetrics, updates?: Partial<LiveSourceMetrics>): LiveSourceMetrics {
  return {
    ...DEFAULT_METRICS,
    ...(existing ?? {}),
    ...(updates ?? {}),
  };
}

const VALID_STATUSES: StatusType[] = ['inactive', 'active', 'running', 'stopped', 'paused', 'error', 'ready', 'scheduled', 'starting', 'stopping'];

function normalizeStatus(status: StatusType | string | null | undefined, fallback: StatusType = 'inactive'): StatusType {
  if (status && VALID_STATUSES.includes(status as StatusType)) {
    return status as StatusType;
  }

  return fallback;
}

class LiveSourcesRegistry {
  private streamingSources = new Map<string, LiveSourceRecord>();
  private scrapingJobs = new Map<string, LiveSourceRecord>();
  private activityLog: ActivityEvent[] = [];
  private readonly maxActivityEntries = 200;

  private recordActivity(event: Omit<ActivityEvent, 'id' | 'timestamp'> & { timestamp?: Date }): void {
    const { timestamp: rawTimestamp, ...rest } = event;
    const timestamp = rawTimestamp ?? new Date();
    const entry: ActivityEvent = {
      id: nanoid(),
      timestamp: timestamp.toISOString(),
      ...rest,
    };

    this.activityLog.unshift(entry);
    if (this.activityLog.length > this.maxActivityEntries) {
      this.activityLog.length = this.maxActivityEntries;
    }
  }

  private projectFilter<T extends LiveSourceRecord>(records: Iterable<T>, projectId?: string): T[] {
    if (!projectId) {
      return Array.from(records);
    }

    return Array.from(records).filter((record) => {
      if (!record.projectId) {
        return false;
      }
      return record.projectId === projectId;
    });
  }

  upsertStreamingSource(record: LiveSourceUpsertInput, options: UpsertOptions = {}): LiveSourceRecord {
    const existing = this.streamingSources.get(record.id);
    const merged: LiveSourceRecord = {
      id: record.id,
      type: 'streaming',
      datasetId: record.datasetId,
      projectId: record.projectId ?? existing?.projectId ?? null,
      name: record.name ?? existing?.name ?? null,
      description: record.description ?? existing?.description ?? null,
      status: normalizeStatus(record.status ?? existing?.status, existing?.status ?? 'inactive'),
      protocol: record.protocol ?? existing?.protocol ?? null,
      endpoint: record.endpoint ?? existing?.endpoint ?? null,
      lastError: record.lastError ?? (record.status === 'error' ? record.lastError ?? existing?.lastError ?? null : existing?.lastError ?? null),
      strategy: null,
      targetUrl: null,
      schedule: null,
      metrics: mergeMetrics(existing?.metrics, record.metrics),
      metadata: record.metadata ?? existing?.metadata ?? null,
    };

    merged.metrics.lastActivity = record.metrics?.lastActivity ?? existing?.metrics.lastActivity ?? nowIso();
    this.streamingSources.set(record.id, merged);

    if (options.recordActivity) {
      this.recordActivity({
        sourceId: record.id,
        sourceType: 'streaming',
        type: options.activityType ?? 'updated',
        message: options.activityMessage ?? 'Streaming source updated',
        projectId: merged.projectId,
        datasetId: merged.datasetId,
        metadata: options.activityMetadata,
        timestamp: options.timestamp,
      });
    }

    return merged;
  }

  upsertScrapingJob(record: LiveSourceUpsertInput, options: UpsertOptions = {}): LiveSourceRecord {
    const existing = this.scrapingJobs.get(record.id);
    const merged: LiveSourceRecord = {
      id: record.id,
      type: 'scraping',
      datasetId: record.datasetId,
      projectId: record.projectId ?? existing?.projectId ?? null,
      name: record.name ?? existing?.name ?? null,
      description: record.description ?? existing?.description ?? null,
      status: normalizeStatus(record.status ?? existing?.status, existing?.status ?? 'inactive'),
      protocol: null,
      endpoint: null,
      strategy: record.strategy ?? existing?.strategy ?? null,
      targetUrl: record.targetUrl ?? existing?.targetUrl ?? null,
      schedule: record.schedule ?? existing?.schedule ?? null,
      lastError: record.lastError ?? (record.status === 'error' ? record.lastError ?? existing?.lastError ?? null : existing?.lastError ?? null),
      metrics: mergeMetrics(existing?.metrics, record.metrics),
      metadata: record.metadata ?? existing?.metadata ?? null,
    };

    merged.metrics.lastActivity = record.metrics?.lastActivity ?? existing?.metrics.lastActivity ?? nowIso();
    this.scrapingJobs.set(record.id, merged);

    if (options.recordActivity) {
      this.recordActivity({
        sourceId: record.id,
        sourceType: 'scraping',
        type: options.activityType ?? 'updated',
        message: options.activityMessage ?? 'Scraping job updated',
        projectId: merged.projectId,
        datasetId: merged.datasetId,
        metadata: options.activityMetadata,
        timestamp: options.timestamp,
      });
    }

    return merged;
  }

  updateStreamingStatus(id: string, status: StatusType, metadata: Partial<LiveSourceRecord> = {}, options: UpsertOptions = {}): LiveSourceRecord | undefined {
    const existing = this.streamingSources.get(id);
    if (!existing) {
      return undefined;
    }

    return this.upsertStreamingSource(
      {
        ...existing,
        ...metadata,
        id,
        datasetId: existing.datasetId,
        status,
        metrics: {
          ...existing.metrics,
          lastActivity: nowIso(),
        },
      },
      options,
    );
  }

  updateScrapingStatus(id: string, status: StatusType, metadata: Partial<LiveSourceRecord> = {}, options: UpsertOptions = {}): LiveSourceRecord | undefined {
    const existing = this.scrapingJobs.get(id);
    if (!existing) {
      return undefined;
    }

    return this.upsertScrapingJob(
      {
        ...existing,
        ...metadata,
        id,
        datasetId: existing.datasetId,
        status,
        metrics: {
          ...existing.metrics,
          lastActivity: nowIso(),
        },
      },
      options,
    );
  }

  incrementStreamingMetrics(id: string, metrics: Partial<LiveSourceMetrics>): LiveSourceRecord | undefined {
    const existing = this.streamingSources.get(id);
    if (!existing) {
      return undefined;
    }

    return this.upsertStreamingSource({
      ...existing,
      id,
      datasetId: existing.datasetId,
      metrics: mergeMetrics(existing.metrics, {
        ...metrics,
        recordsProcessed: (existing.metrics.recordsProcessed ?? 0) + (metrics.recordsProcessed ?? 0),
      }),
    });
  }

  incrementScrapingMetrics(id: string, metrics: Partial<LiveSourceMetrics>): LiveSourceRecord | undefined {
    const existing = this.scrapingJobs.get(id);
    if (!existing) {
      return undefined;
    }

    return this.upsertScrapingJob({
      ...existing,
      id,
      datasetId: existing.datasetId,
      metrics: mergeMetrics(existing.metrics, {
        ...metrics,
        recordsProcessed: (existing.metrics.recordsProcessed ?? 0) + (metrics.recordsProcessed ?? 0),
      }),
    });
  }

  removeStreamingSource(id: string, options: UpsertOptions = {}): void {
    const existing = this.streamingSources.get(id);
    if (!existing) {
      return;
    }

    this.streamingSources.delete(id);
    if (options.recordActivity) {
      this.recordActivity({
        sourceId: id,
        sourceType: 'streaming',
        type: options.activityType ?? 'deleted',
        message: options.activityMessage ?? 'Streaming source deleted',
        projectId: existing.projectId,
        datasetId: existing.datasetId,
        metadata: options.activityMetadata,
        timestamp: options.timestamp,
      });
    }
  }

  removeScrapingJob(id: string, options: UpsertOptions = {}): void {
    const existing = this.scrapingJobs.get(id);
    if (!existing) {
      return;
    }

    this.scrapingJobs.delete(id);
    if (options.recordActivity) {
      this.recordActivity({
        sourceId: id,
        sourceType: 'scraping',
        type: options.activityType ?? 'deleted',
        message: options.activityMessage ?? 'Scraping job deleted',
        projectId: existing.projectId,
        datasetId: existing.datasetId,
        metadata: options.activityMetadata,
        timestamp: options.timestamp,
      });
    }
  }

  getStreamingSource(id: string): LiveSourceRecord | undefined {
    return this.streamingSources.get(id);
  }

  getScrapingJob(id: string): LiveSourceRecord | undefined {
    return this.scrapingJobs.get(id);
  }

  listStreamingSources(projectId?: string): LiveSourceRecord[] {
    return this.projectFilter(this.streamingSources.values(), projectId);
  }

  listScrapingJobs(projectId?: string): LiveSourceRecord[] {
    return this.projectFilter(this.scrapingJobs.values(), projectId);
  }

  getRecentActivity(limit = 50, projectId?: string): ActivityEvent[] {
    const filtered = projectId
      ? this.activityLog.filter((event) => event.projectId === projectId)
      : this.activityLog;

    return filtered.slice(0, limit);
  }

  computeOverview(projectId?: string) {
    const streaming = this.listStreamingSources(projectId);
    const scraping = this.listScrapingJobs(projectId);

    const streamingCounts = {
      total: streaming.length,
      active: streaming.filter((s) => s.status === 'active').length,
      inactive: streaming.filter((s) => s.status === 'inactive' || s.status === 'stopped' || s.status === 'paused').length,
      error: streaming.filter((s) => s.status === 'error').length,
    };

    const scrapingCounts = {
      total: scraping.length,
      active: scraping.filter((s) => s.status === 'active').length,
      inactive: scraping.filter((s) => s.status === 'inactive' || s.status === 'stopped' || s.status === 'paused').length,
      running: scraping.filter((s) => s.status === 'running').length,
      error: scraping.filter((s) => s.status === 'error').length,
    };

    const totalRecords = [...streaming, ...scraping].reduce((acc, source) => acc + (source.metrics.recordsProcessed ?? 0), 0);
    const activeSources = [...streaming, ...scraping].filter((s) => s.status === 'active' || s.status === 'running').length;
    const errorSources = [...streaming, ...scraping].filter((s) => s.status === 'error').length;
    const totalSources = streamingCounts.total + scrapingCounts.total;
    const errorRate = totalSources === 0 ? 0 : Math.round((errorSources / totalSources) * 100);

    return {
      streaming: streamingCounts,
      scraping: scrapingCounts,
      metrics: {
        totalDataReceived: totalRecords,
        activeSources,
        errorRate,
      },
      recentActivity: this.getRecentActivity(50, projectId),
    };
  }
}

export const liveSourcesRegistry = new LiveSourcesRegistry();
