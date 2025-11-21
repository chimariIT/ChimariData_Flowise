// server/routes/streaming-sources.ts
import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  createStreamingSourceSchema,
  updateStreamingSourceSchema,
  streamingSourceStatusQuerySchema,
} from '@shared/schema';
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import { isUserAdmin } from '../middleware/rbac';
import { canAccessProject } from '../middleware/ownership';
import { liveSourcesRegistry } from '../services/live-sources-registry';

const router = Router();

router.use(ensureAuthenticated);

const createStreamingSourceRequestSchema = createStreamingSourceSchema.extend({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
});

const updateStreamingSourceRequestSchema = updateStreamingSourceSchema.extend({
  name: z.string().optional(),
  description: z.string().optional(),
});

const listStreamingSourcesQuerySchema = streamingSourceStatusQuerySchema.extend({
  projectId: z.string().optional(),
});

const testConnectionSchema = z.object({
  protocol: z.enum(['websocket', 'sse', 'poll']),
  endpoint: z.string().url('Must be a valid URL'),
  headers: z.record(z.any()).optional(),
});

interface DatasetAccessResult {
  dataset: any;
  projectId?: string;
  projectIds: string[];
  created: boolean;
}

async function ensureDatasetAccess(
  req: any,
  datasetId?: string | null,
  projectId?: string | null,
  datasetLabel?: string,
  sourceType: 'streaming' | 'scraping' = 'streaming',
): Promise<DatasetAccessResult> {
  const user = req.user as any;
  const userId = user?.id;
  const admin = isUserAdmin(user);

  if (!userId) {
    throw { status: 401, message: 'Authentication required' };
  }

  const normalizedDatasetId = datasetId && datasetId.trim().length > 0 ? datasetId : undefined;
  const needsNewDataset = !normalizedDatasetId || normalizedDatasetId.startsWith('temp-');

  if (!needsNewDataset) {
    const existing = await storage.getDataset(normalizedDatasetId!);
    if (!existing) {
      throw { status: 404, message: 'Dataset not found' };
    }

    const ownerId = (existing as any).userId ?? (existing as any).ownerId;
    if (!admin && ownerId && ownerId !== userId) {
      const datasetProjects = await storage.getDatasetProjects(existing.id);
      const ownsLinkedProject = datasetProjects.some(({ project }) => (project as any).userId === userId);
      if (!ownsLinkedProject) {
        throw { status: 403, message: 'You do not have access to this dataset' };
      }
    }

    const datasetProjects = await storage.getDatasetProjects(existing.id).catch(() => []);
    return {
      dataset: existing,
      projectId: datasetProjects[0]?.project?.id,
      projectIds: datasetProjects.map((entry) => entry.project.id),
      created: false,
    };
  }

  if (!projectId) {
    throw { status: 400, message: 'projectId is required when datasetId is not provided' };
  }

  const accessCheck = await canAccessProject(userId, projectId, admin);
  if (!accessCheck.allowed) {
    throw {
      status: accessCheck.reason === 'Project not found' ? 404 : 403,
      message: accessCheck.reason ?? 'Access denied',
    };
  }

  const datasetName = datasetLabel ?? `${sourceType === 'streaming' ? 'Streaming' : 'Scraping'} Dataset`;
  const datasetIdGenerated = nanoid();
  const now = new Date();

  const newDataset = await storage.createDataset({
    id: datasetIdGenerated,
    userId,
    sourceType: sourceType === 'streaming' ? 'streaming' : 'scraping',
    originalFileName: `${datasetName.replace(/\s+/g, '_').toLowerCase()}.json`,
    mimeType: 'application/json',
    fileSize: 0,
    checksum: null,
    storageUri: `${sourceType}://${datasetIdGenerated}`,
    dataType: sourceType === 'streaming' ? 'timeseries' : 'tabular',
    schema: null,
    recordCount: 0,
    preview: null,
    piiAnalysis: null,
    ingestionMetadata: {
      createdAt: now.toISOString(),
      createdBy: userId,
      mode: sourceType,
    },
    status: 'ready',
    data: null,
    mode: sourceType === 'streaming' ? 'stream' : 'refreshable',
    retentionDays: sourceType === 'streaming' ? 7 : 30,
    createdAt: now,
    updatedAt: now,
  } as any);

  await storage.linkProjectToDataset(projectId, newDataset.id, sourceType === 'streaming' ? 'streaming' : 'scraping', datasetName);

  return {
    dataset: newDataset,
    projectId,
    projectIds: [projectId],
    created: true,
  };
}

function extractMetadataFromParams(params: any) {
  if (!params || typeof params !== 'object') {
    return {} as Record<string, unknown>;
  }

  if (params.metadata && typeof params.metadata === 'object') {
    return params.metadata as Record<string, unknown>;
  }

  return {} as Record<string, unknown>;
}

function transformStreamingSource(source: any) {
  const params = (source?.params ?? {}) as Record<string, unknown>;
  const metadata = extractMetadataFromParams(params);
  const registryRecord = liveSourcesRegistry.getStreamingSource(source.id);
  const metrics = registryRecord?.metrics ?? {
    recordsProcessed: 0,
    successRate: 100,
    avgRecordsPerMinute: 0,
    errorRate: 0,
    lastActivity: source.updatedAt ? new Date(source.updatedAt).toISOString() : undefined,
  };

  return {
    id: source.id,
    type: 'streaming' as const,
    datasetId: source.datasetId,
    projectId: registryRecord?.projectId ?? (metadata.projectId as string | undefined) ?? null,
    name: registryRecord?.name ?? (metadata.name as string | undefined) ?? null,
    description: registryRecord?.description ?? (metadata.description as string | undefined) ?? null,
    protocol: source.protocol,
    endpoint: source.endpoint,
    headers: source.headers,
    params,
    parseSpec: source.parseSpec,
    batchSize: source.batchSize,
    flushMs: source.flushMs,
    maxBuffer: source.maxBuffer,
    pollInterval: (params?.pollInterval as number | undefined) ?? null,
    status: source.status ?? 'inactive',
    lastCheckpoint: source.lastCheckpoint,
    lastError: source.lastError,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    metrics,
  };
}

function parseQuery(query: Record<string, unknown>) {
  const parsed = listStreamingSourcesQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw { status: 400, message: parsed.error.flatten().formErrors.join(', ') || 'Invalid query parameters' };
  }
  return parsed.data;
}

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, error: error.message ?? fallbackMessage });
  }

  console.error('[Streaming Sources] Unexpected error:', error);
  return res.status(500).json({ success: false, error: fallbackMessage });
}

router.get('/', async (req, res) => {
  try {
    const query = parseQuery(req.query as any);
    const user = req.user as any;
    const userId = user?.id;
    const admin = isUserAdmin(user);

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    let datasetIds: string[] = [];

    if (query.datasetId) {
      const datasetAccess = await ensureDatasetAccess(req, query.datasetId, undefined, undefined, 'streaming');
      datasetIds = [datasetAccess.dataset.id];
    } else if (query.projectId) {
      const accessCheck = await canAccessProject(userId, query.projectId, admin);
      if (!accessCheck.allowed) {
        return res
          .status(accessCheck.reason === 'Project not found' ? 404 : 403)
          .json({ success: false, error: accessCheck.reason });
      }

      const projectDatasets = await storage.getProjectDatasets(query.projectId);
      datasetIds = projectDatasets.map((entry) => entry.dataset.id);
    } else {
      const datasets = await storage.getDatasetsByOwner(userId);
      datasetIds = datasets.map((dataset: any) => dataset.id);
    }

    const results: any[] = [];

    for (const datasetId of datasetIds) {
      const sources = await storage.getStreamingSourcesByDataset(datasetId);
      for (const source of sources) {
        if (query.status && (source.status ?? 'inactive') !== query.status) {
          continue;
        }
        if (query.protocol && source.protocol !== query.protocol) {
          continue;
        }
        const datasetProjects = await storage.getDatasetProjects(source.datasetId).catch(() => []);
        const projectId = datasetProjects[0]?.project?.id ?? null;
        liveSourcesRegistry.upsertStreamingSource(
          {
            id: source.id,
            datasetId: source.datasetId,
            projectId,
            status: source.status ?? 'inactive',
            protocol: source.protocol,
            endpoint: source.endpoint,
            lastError: source.lastError ?? null,
            metrics: {
              lastActivity: source.updatedAt ? new Date(source.updatedAt).toISOString() : undefined,
            },
            metadata: {
              ...(source.params as any)?.metadata,
            },
          },
          { recordActivity: false },
        );
        results.push(transformStreamingSource(source));
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    return handleError(res, error, 'Failed to load streaming sources');
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = createStreamingSourceRequestSchema.parse(req.body ?? {});
    const datasetAccess = await ensureDatasetAccess(
      req,
      parsed.datasetId,
      parsed.projectId,
      parsed.name,
      'streaming',
    );

    const user = req.user as any;
    const userId = user?.id;
    const metadata = {
      name: parsed.name,
      description: parsed.description,
      projectId: datasetAccess.projectId,
      createdBy: userId,
    };

    const created = await storage.createStreamingSource({
      datasetId: datasetAccess.dataset.id,
      protocol: parsed.protocol,
      endpoint: parsed.endpoint,
      headers: parsed.headers ?? null,
      params: {
        ...(parsed.params ?? {}),
        pollInterval: parsed.pollInterval,
        retryConfig: parsed.retryConfig,
        metadata,
      },
      parseSpec: parsed.parseSpec ?? null,
      batchSize: parsed.batchSize,
      flushMs: parsed.flushMs,
      maxBuffer: parsed.maxBuffer,
      dedupeKeyPath: parsed.parseSpec?.dedupeKeyPath ?? null,
      timestampPath: parsed.parseSpec?.timestampPath ?? null,
      status: 'inactive',
      lastCheckpoint: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.upsertStreamingSource(
      {
        id: created.id,
        datasetId: created.datasetId,
        projectId: datasetAccess.projectId ?? datasetAccess.projectIds[0],
        name: parsed.name,
        description: parsed.description,
        status: created.status ?? 'inactive',
        protocol: created.protocol,
        endpoint: created.endpoint,
        lastError: created.lastError ?? null,
        metrics: {
          lastActivity: created.createdAt ? new Date(created.createdAt).toISOString() : undefined,
        },
        metadata,
      },
      {
        recordActivity: true,
        activityType: 'created',
        activityMessage: `Streaming source ${parsed.name ?? created.id} created`,
      },
    );

    return res.status(201).json({
      success: true,
      data: transformStreamingSource(created),
      message: 'Streaming source created successfully',
      datasetCreated: datasetAccess.created,
      datasetId: datasetAccess.dataset.id,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to create streaming source');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const source = await storage.getStreamingSource(req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, error: 'Streaming source not found' });
    }

    liveSourcesRegistry.upsertStreamingSource(
      {
        id: source.id,
        datasetId: source.datasetId,
        status: source.status ?? 'inactive',
        protocol: source.protocol,
        endpoint: source.endpoint,
        lastError: source.lastError ?? null,
        metrics: {
          lastActivity: source.updatedAt ? new Date(source.updatedAt).toISOString() : undefined,
        },
        metadata: (source.params as any)?.metadata,
      },
      { recordActivity: false },
    );

    return res.json({ success: true, data: transformStreamingSource(source) });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch streaming source');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const parsed = updateStreamingSourceRequestSchema.parse(req.body ?? {});
    const existing = await storage.getStreamingSource(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Streaming source not found' });
    }

    const params = (existing.params ?? {}) as Record<string, unknown>;
    const metadata = {
      ...(extractMetadataFromParams(params) ?? {}),
      name: parsed.name ?? (extractMetadataFromParams(params).name as string | undefined) ?? null,
      description: parsed.description ?? (extractMetadataFromParams(params).description as string | undefined) ?? null,
    };

    const updated = await storage.updateStreamingSource(req.params.id, {
      endpoint: parsed.endpoint ?? existing.endpoint,
      headers: parsed.headers ?? existing.headers,
      params: {
        ...(parsed.params ?? params),
        pollInterval: parsed.pollInterval ?? (params?.pollInterval as number | undefined),
        retryConfig: parsed.retryConfig ?? (params?.retryConfig as Record<string, unknown> | undefined),
        metadata,
      },
      parseSpec: parsed.parseSpec ?? existing.parseSpec,
      batchSize: parsed.batchSize ?? existing.batchSize,
      flushMs: parsed.flushMs ?? existing.flushMs,
      maxBuffer: parsed.maxBuffer ?? existing.maxBuffer,
      dedupeKeyPath: parsed.parseSpec?.dedupeKeyPath ?? existing.dedupeKeyPath,
      timestampPath: parsed.parseSpec?.timestampPath ?? existing.timestampPath,
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.upsertStreamingSource(
      {
        id: updated!.id,
        datasetId: updated!.datasetId,
        name: metadata.name as string | undefined,
        description: metadata.description as string | undefined,
        status: updated!.status ?? 'inactive',
        protocol: updated!.protocol,
        endpoint: updated!.endpoint,
        lastError: updated!.lastError ?? null,
        metrics: {
          lastActivity: updated!.updatedAt ? new Date(updated!.updatedAt).toISOString() : undefined,
        },
        metadata,
      },
      {
        recordActivity: true,
        activityType: 'updated',
        activityMessage: `Streaming source ${metadata.name ?? updated!.id} updated`,
      },
    );

    return res.json({ success: true, data: transformStreamingSource(updated), message: 'Streaming source updated' });
  } catch (error) {
    return handleError(res, error, 'Failed to update streaming source');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await storage.getStreamingSource(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Streaming source not found' });
    }

    await storage.deleteStreamingSource(req.params.id);

    liveSourcesRegistry.removeStreamingSource(req.params.id, {
      recordActivity: true,
      activityType: 'deleted',
      activityMessage: `Streaming source ${req.params.id} deleted`,
    });

    return res.json({ success: true, message: 'Streaming source deleted' });
  } catch (error) {
    return handleError(res, error, 'Failed to delete streaming source');
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const existing = await storage.getStreamingSource(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Streaming source not found' });
    }

    await storage.startStreamingSource(req.params.id);

    const updated = liveSourcesRegistry.updateStreamingStatus(
      req.params.id,
      'active',
      {
        endpoint: existing.endpoint,
        protocol: existing.protocol,
      },
      {
        recordActivity: true,
        activityType: 'started',
        activityMessage: `Streaming source ${req.params.id} started`,
      },
    );

    return res.json({ success: true, data: transformStreamingSource({ ...existing, status: 'active', updatedAt: new Date() }), message: 'Streaming source started' });
  } catch (error) {
    return handleError(res, error, 'Failed to start streaming source');
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const existing = await storage.getStreamingSource(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Streaming source not found' });
    }

    await storage.stopStreamingSource(req.params.id);

    liveSourcesRegistry.updateStreamingStatus(
      req.params.id,
      'inactive',
      {
        endpoint: existing.endpoint,
        protocol: existing.protocol,
      },
      {
        recordActivity: true,
        activityType: 'stopped',
        activityMessage: `Streaming source ${req.params.id} stopped`,
      },
    );

    return res.json({ success: true, data: transformStreamingSource({ ...existing, status: 'inactive', updatedAt: new Date() }), message: 'Streaming source stopped' });
  } catch (error) {
    return handleError(res, error, 'Failed to stop streaming source');
  }
});

router.post('/test-connection', async (req, res) => {
  try {
    const parsed = testConnectionSchema.parse(req.body ?? {});
    const start = Date.now();

    if (parsed.protocol === 'websocket') {
      const { default: WebSocket } = await import('ws');
      await new Promise((resolve, reject) => {
        const ws = new WebSocket(parsed.endpoint, {
          handshakeTimeout: 5000,
          headers: parsed.headers as Record<string, string> | undefined,
        });
        ws.on('open', () => {
          ws.close();
          resolve(undefined);
        });
        ws.on('error', (err) => {
          reject(err);
        });
      });

      const latencyMs = Date.now() - start;
      return res.json({
        success: true,
        message: 'WebSocket connection successful',
        latencyMs,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(parsed.endpoint, {
      method: 'GET',
      headers: parsed.headers as Record<string, string> | undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw {
        status: response.status,
        message: `Endpoint responded with status ${response.status}`,
      };
    }

    const latencyMs = Date.now() - start;
    const contentType = response.headers.get('content-type') ?? 'unknown';

    return res.json({
      success: true,
      message: 'Endpoint is reachable',
      latencyMs,
      contentType,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to test streaming connection');
  }
});

export default router;
