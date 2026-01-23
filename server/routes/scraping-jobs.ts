// server/routes/scraping-jobs.ts
import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  createScrapingJobSchema,
  updateScrapingJobSchema,
  scrapingJobStatusQuerySchema,
  scrapingRunsQuerySchema,
} from '@shared/schema';
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import { isUserAdmin } from '../middleware/rbac';
import { canAccessProject } from '../middleware/ownership';
import { liveSourcesRegistry } from '../services/live-sources-registry';
import { load as loadHtml } from 'cheerio';
import * as jsonpath from 'jsonpath';

const router = Router();

router.use(ensureAuthenticated);

const createScrapingJobRequestSchema = createScrapingJobSchema.extend({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  datasetId: z.string().optional(),
  projectId: z.string().optional(),
});

const updateScrapingJobRequestSchema = updateScrapingJobSchema.extend({
  name: z.string().optional(),
  description: z.string().optional(),
});

const listScrapingJobsQuerySchema = scrapingJobStatusQuerySchema.extend({
  projectId: z.string().optional(),
});

const testExtractionSchema = z.object({
  strategy: z.enum(['http', 'puppeteer']).default('http'),
  targetUrl: z.string().url('Must be a valid URL'),
  extractionSpec: z.record(z.any()).optional(),
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

  const datasetName = datasetLabel ?? 'Scraping Dataset';
  const datasetIdGenerated = nanoid();
  const now = new Date();

  const newDataset = await storage.createDataset({
    id: datasetIdGenerated,
    userId,
    sourceType: 'scraping',
    originalFileName: `${datasetName.replace(/\s+/g, '_').toLowerCase()}.json`,
    mimeType: 'application/json',
    fileSize: 0,
    checksum: null,
    storageUri: `scraping://${datasetIdGenerated}`,
    dataType: 'tabular',
    schema: null,
    recordCount: 0,
    preview: null,
    piiAnalysis: null,
    ingestionMetadata: {
      createdAt: now.toISOString(),
      createdBy: userId,
      mode: 'scraping',
    },
    status: 'ready',
    data: null,
    mode: 'refreshable',
    retentionDays: 30,
    createdAt: now,
    updatedAt: now,
  } as any);

  await storage.linkProjectToDataset(projectId, newDataset.id, 'scraping', datasetName);

  return {
    dataset: newDataset,
    projectId,
    projectIds: [projectId],
    created: true,
  };
}

function extractMetadataFromSpec(spec: any) {
  if (!spec || typeof spec !== 'object') {
    return {} as Record<string, unknown>;
  }

  if (spec.metadata && typeof spec.metadata === 'object') {
    return spec.metadata as Record<string, unknown>;
  }

  return {} as Record<string, unknown>;
}

function transformScrapingJob(job: any) {
  const extractionSpec = (job.extractionSpec ?? {}) as Record<string, unknown>;
  const metadata = extractMetadataFromSpec(extractionSpec);
  const registryRecord = liveSourcesRegistry.getScrapingJob(job.id);
  const metrics = registryRecord?.metrics ?? {
    recordsProcessed: 0,
    successRate: 100,
    avgRecordsPerMinute: 0,
    errorRate: 0,
    lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : undefined,
    nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : undefined,
  };

  return {
    id: job.id,
    type: 'scraping' as const,
    datasetId: job.datasetId,
    projectId: registryRecord?.projectId ?? (metadata.projectId as string | undefined) ?? null,
    name: registryRecord?.name ?? (metadata.name as string | undefined) ?? null,
    description: registryRecord?.description ?? (metadata.description as string | undefined) ?? null,
    strategy: job.strategy,
    targetUrl: job.targetUrl,
    schedule: job.schedule,
    extractionSpec,
    loginSpec: job.loginSpec,
    rateLimitRPM: job.rateLimitRPM,
    respectRobots: job.respectRobots,
    maxConcurrency: job.concurrency,
    status: job.status ?? 'inactive',
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
    lastError: job.lastError,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    metrics,
  };
}

function parseQuery(query: Record<string, unknown>) {
  const parsed = listScrapingJobsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw { status: 400, message: parsed.error.flatten().formErrors.join(', ') || 'Invalid query parameters' };
  }
  return parsed.data;
}

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ success: false, error: error.message ?? fallbackMessage });
  }

  console.error('[Scraping Jobs] Unexpected error:', error);
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
      const datasetAccess = await ensureDatasetAccess(req, query.datasetId, undefined, undefined);
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
      const jobs = await storage.getScrapingJobsByDataset(datasetId);
      for (const job of jobs) {
        if (query.status && (job.status ?? 'inactive') !== query.status) {
          continue;
        }
        if (query.strategy && job.strategy !== query.strategy) {
          continue;
        }

        const datasetProjects = await storage.getDatasetProjects(job.datasetId).catch(() => []);
        const projectId = datasetProjects[0]?.project?.id ?? null;

        liveSourcesRegistry.upsertScrapingJob(
          {
            id: job.id,
            datasetId: job.datasetId,
            projectId,
            name: (job.extractionSpec as any)?.metadata?.name,
            description: (job.extractionSpec as any)?.metadata?.description,
            status: job.status ?? 'inactive',
            strategy: job.strategy,
            targetUrl: job.targetUrl,
            schedule: job.schedule,
            lastError: job.lastError ?? null,
            metrics: {
              lastActivity: job.updatedAt ? new Date(job.updatedAt).toISOString() : undefined,
              lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : undefined,
              nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : undefined,
            },
            metadata: (job.extractionSpec as any)?.metadata,
          },
          { recordActivity: false },
        );

        results.push(transformScrapingJob(job));
      }
    }

    return res.json({ success: true, data: results });
  } catch (error) {
    return handleError(res, error, 'Failed to load scraping jobs');
  }
});

router.post('/', async (req, res) => {
  try {
    const parsed = createScrapingJobRequestSchema.parse(req.body ?? {});
    const datasetAccess = await ensureDatasetAccess(req, parsed.datasetId, parsed.projectId, parsed.name);

    const user = req.user as any;
    const userId = user?.id;

    const metadata = {
      name: parsed.name,
      description: parsed.description,
      projectId: datasetAccess.projectId,
      createdBy: userId,
    };

    const created = await storage.createScrapingJob({
      datasetId: datasetAccess.dataset.id,
      strategy: parsed.strategy,
      targetUrl: parsed.targetUrl,
      schedule: parsed.schedule ?? null,
      extractionSpec: {
        ...(parsed.extractionSpec ?? {}),
        metadata,
      },
      paginationSpec: parsed.extractionSpec?.followPagination ?? null,
      loginSpec: parsed.loginSpec ?? null,
      rateLimitRPM: parsed.rateLimitRPM ?? 60,
      concurrency: parsed.maxConcurrency ?? 1,
      respectRobots: parsed.respectRobots ?? true,
      status: 'inactive',
      lastRunAt: null,
      nextRunAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.upsertScrapingJob(
      {
        id: created.id,
        datasetId: created.datasetId,
        projectId: datasetAccess.projectId ?? datasetAccess.projectIds[0],
        name: parsed.name,
        description: parsed.description,
        status: created.status ?? 'inactive',
        strategy: created.strategy,
        targetUrl: created.targetUrl,
        schedule: created.schedule ?? null,
        lastError: created.lastError ?? null,
        metrics: {
          lastActivity: created.createdAt ? new Date(created.createdAt).toISOString() : undefined,
        },
        metadata,
      },
      {
        recordActivity: true,
        activityType: 'created',
        activityMessage: `Scraping job ${parsed.name ?? created.id} created`,
      },
    );

    return res.status(201).json({
      success: true,
      data: transformScrapingJob(created),
      message: 'Scraping job created successfully',
      datasetCreated: datasetAccess.created,
      datasetId: datasetAccess.dataset.id,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to create scraping job');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const job = await storage.getScrapingJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    liveSourcesRegistry.upsertScrapingJob(
      {
        id: job.id,
        datasetId: job.datasetId,
        status: job.status ?? 'inactive',
        strategy: job.strategy,
        targetUrl: job.targetUrl,
        schedule: job.schedule,
        lastError: job.lastError ?? null,
        metrics: {
          lastActivity: job.updatedAt ? new Date(job.updatedAt).toISOString() : undefined,
          lastRunAt: job.lastRunAt ? new Date(job.lastRunAt).toISOString() : undefined,
          nextRunAt: job.nextRunAt ? new Date(job.nextRunAt).toISOString() : undefined,
        },
        metadata: (job.extractionSpec as any)?.metadata,
      },
      { recordActivity: false },
    );

    return res.json({ success: true, data: transformScrapingJob(job) });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch scraping job');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const parsed = updateScrapingJobRequestSchema.parse(req.body ?? {});
    const existing = await storage.getScrapingJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    const extractionSpec = (existing.extractionSpec ?? {}) as Record<string, unknown>;
    const metadata = {
      ...(extractMetadataFromSpec(extractionSpec) ?? {}),
      name: parsed.name ?? (extractMetadataFromSpec(extractionSpec).name as string | undefined) ?? null,
      description: parsed.description ?? (extractMetadataFromSpec(extractionSpec).description as string | undefined) ?? null,
    };

    const updated = await storage.updateScrapingJob(req.params.id, {
      strategy: parsed.strategy ?? existing.strategy,
      targetUrl: parsed.targetUrl ?? existing.targetUrl,
      schedule: parsed.schedule ?? existing.schedule,
      extractionSpec: {
        ...(parsed.extractionSpec ?? extractionSpec),
        metadata,
      },
      paginationSpec: parsed.extractionSpec?.followPagination ?? existing.paginationSpec,
      loginSpec: parsed.loginSpec ?? existing.loginSpec,
      rateLimitRPM: parsed.rateLimitRPM ?? existing.rateLimitRPM,
      concurrency: parsed.maxConcurrency ?? existing.concurrency,
      respectRobots: parsed.respectRobots ?? existing.respectRobots,
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.upsertScrapingJob(
      {
        id: updated!.id,
        datasetId: updated!.datasetId,
        name: metadata.name as string | undefined,
        description: metadata.description as string | undefined,
        status: updated!.status ?? 'inactive',
        strategy: updated!.strategy,
        targetUrl: updated!.targetUrl,
        schedule: updated!.schedule ?? null,
        lastError: updated!.lastError ?? null,
        metrics: {
          lastActivity: updated!.updatedAt ? new Date(updated!.updatedAt).toISOString() : undefined,
          lastRunAt: updated!.lastRunAt ? new Date(updated!.lastRunAt).toISOString() : undefined,
          nextRunAt: updated!.nextRunAt ? new Date(updated!.nextRunAt).toISOString() : undefined,
        },
        metadata,
      },
      {
        recordActivity: true,
        activityType: 'updated',
        activityMessage: `Scraping job ${metadata.name ?? updated!.id} updated`,
      },
    );

    return res.json({ success: true, data: transformScrapingJob(updated), message: 'Scraping job updated' });
  } catch (error) {
    return handleError(res, error, 'Failed to update scraping job');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await storage.getScrapingJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    await storage.deleteScrapingJob(req.params.id);

    liveSourcesRegistry.removeScrapingJob(req.params.id, {
      recordActivity: true,
      activityType: 'deleted',
      activityMessage: `Scraping job ${req.params.id} deleted`,
    });

    return res.json({ success: true, message: 'Scraping job deleted' });
  } catch (error) {
    return handleError(res, error, 'Failed to delete scraping job');
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    const existing = await storage.getScrapingJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    await storage.updateScrapingJob(req.params.id, {
      status: 'running',
      lastRunAt: existing.lastRunAt ?? new Date(),
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.updateScrapingStatus(
      req.params.id,
      'running',
      {
        strategy: existing.strategy,
        targetUrl: existing.targetUrl,
        schedule: existing.schedule,
      },
      {
        recordActivity: true,
        activityType: 'started',
        activityMessage: `Scraping job ${req.params.id} started`,
      },
    );

    return res.json({ success: true, data: transformScrapingJob({ ...existing, status: 'running', updatedAt: new Date() }), message: 'Scraping job started' });
  } catch (error) {
    return handleError(res, error, 'Failed to start scraping job');
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    const existing = await storage.getScrapingJob(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    await storage.updateScrapingJob(req.params.id, {
      status: 'inactive',
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.updateScrapingStatus(
      req.params.id,
      'inactive',
      {
        strategy: existing.strategy,
        targetUrl: existing.targetUrl,
        schedule: existing.schedule,
      },
      {
        recordActivity: true,
        activityType: 'stopped',
        activityMessage: `Scraping job ${req.params.id} stopped`,
      },
    );

    return res.json({ success: true, data: transformScrapingJob({ ...existing, status: 'inactive', updatedAt: new Date() }), message: 'Scraping job stopped' });
  } catch (error) {
    return handleError(res, error, 'Failed to stop scraping job');
  }
});

router.post('/:id/run', async (req, res) => {
  try {
    const job = await storage.getScrapingJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    // P0-4 FIX: Production guard for simulated scraping
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      return res.status(501).json({
        success: false,
        error: 'Web scraping requires integration with actual scraping service in production. Configure scraping provider.',
        code: 'SCRAPING_NOT_IMPLEMENTED'
      });
    }

    // Development only: Simulated scraping run
    console.warn('⚠️ [Scraping] Using simulated scraping execution (dev mode only)');

    const startedAt = new Date();
    const run = await storage.createScrapingRun({
      jobId: job.id,
      status: 'running',
      recordCount: 0,
      artifactId: null,
      startedAt,
      finishedAt: null,
      createdAt: startedAt,
    } as any);

    const simulatedRecordCount = 0; // Dev mode: no actual scraping performed

    const finishedRun = await storage.updateScrapingRun(run.id, {
      status: 'completed',
      recordCount: simulatedRecordCount,
      finishedAt: new Date(),
    });

    const nextRunAt = job.schedule
      ? new Date(Date.now() + 60 * 60 * 1000)
      : null;

    const updatedJob = await storage.updateScrapingJob(job.id, {
      status: 'inactive',
      lastRunAt: new Date(),
      nextRunAt,
      updatedAt: new Date(),
    } as any);

    liveSourcesRegistry.incrementScrapingMetrics(job.id, {
      recordsProcessed: simulatedRecordCount,
      lastRunAt: updatedJob?.lastRunAt ? new Date(updatedJob.lastRunAt).toISOString() : new Date().toISOString(),
      nextRunAt: nextRunAt?.toISOString(),
      lastActivity: new Date().toISOString(),
    });

    liveSourcesRegistry.updateScrapingStatus(
      job.id,
      'inactive',
      {
        strategy: job.strategy,
        targetUrl: job.targetUrl,
        schedule: job.schedule,
      },
      {
        recordActivity: true,
        activityType: 'run_completed',
        activityMessage: `Scraping job ${job.id} completed with ${simulatedRecordCount} records`,
        activityMetadata: { recordCount: simulatedRecordCount },
      },
    );

    return res.json({
      success: true,
      data: transformScrapingJob(updatedJob),
      run: finishedRun,
      message: 'Scraping job executed',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to execute scraping job');
  }
});

router.get('/:id/runs', async (req, res) => {
  try {
    const job = await storage.getScrapingJob(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, error: 'Scraping job not found' });
    }

    const query = scrapingRunsQuerySchema.extend({ jobId: z.string() }).parse({ ...req.query, jobId: req.params.id });
    const runs = await storage.getScrapingRuns(job.id, query.limit);

    return res.json({ success: true, data: runs });
  } catch (error) {
    return handleError(res, error, 'Failed to fetch scraping job runs');
  }
});

router.post('/test-extraction', async (req, res) => {
  try {
    const parsed = testExtractionSchema.parse(req.body ?? {});
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(parsed.targetUrl, {
      method: 'GET',
      headers: parsed.headers as Record<string, string> | undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw {
        status: response.status,
        message: `Target URL responded with status ${response.status}`,
      };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const results: any[] = [];
    const spec = parsed.extractionSpec ?? {};

    if (contentType.includes('application/json') || spec.jsonPath) {
      const data = await response.json().catch(async () => {
        const text = await response.text();
        return JSON.parse(text);
      });

      if (spec.jsonPath) {
        const extracted = jsonpath.query(data, spec.jsonPath as string);
        results.push(...extracted.slice(0, 10));
      } else {
        results.push(data);
      }
    } else {
      const html = await response.text();
      const $ = loadHtml(html);

      if (spec.selectors && typeof spec.selectors === 'object') {
        Object.entries(spec.selectors as Record<string, string>).forEach(([key, selector]) => {
          const elements = $(selector as string)
            .slice(0, 5)
            .map((_, el) => $(el).text().trim())
            .get();
          if (elements.length) {
            results.push({ [key]: elements });
          }
        });
      }

      if (spec.tableSelector && typeof spec.tableSelector === 'string') {
        const rows: Record<string, string>[] = [];
        $(`${spec.tableSelector} tr`).each((_, row) => {
          const cells = $(row)
            .find('th,td')
            .map((__, cell) => $(cell).text().trim())
            .get();
          if (cells.length) {
            rows.push({ row: cells.join(' | ') });
          }
        });
        if (rows.length) {
          results.push(...rows.slice(0, 10));
        }
      }

      if (!results.length) {
        const paragraphs = $('p')
          .slice(0, 3)
          .map((_, el) => $(el).text().trim())
          .get();
        if (paragraphs.length) {
          results.push({ preview: paragraphs });
        }
      }
    }

    return res.json({
      success: true,
      message: 'Extraction test completed',
      results: results.slice(0, 10),
    });
  } catch (error) {
    return handleError(res, error, 'Failed to test scraping extraction');
  }
});

export default router;
