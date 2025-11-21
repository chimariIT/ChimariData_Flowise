// server/routes/live-sources.ts
import { Router } from 'express';
import { z } from 'zod';
import { ensureAuthenticated } from './auth';
import { isUserAdmin } from '../middleware/rbac';
import { canAccessProject } from '../middleware/ownership';
import { storage } from '../services/storage';
import { liveSourcesRegistry } from '../services/live-sources-registry';

const router = Router();

router.use(ensureAuthenticated);

const overviewQuerySchema = z.object({
  projectId: z.string().optional(),
});

async function synchronizeLiveSources(userId: string, admin: boolean, projectId?: string) {
  let datasetIds: string[] = [];

  if (projectId) {
    const projectDatasets = await storage.getProjectDatasets(projectId);
    datasetIds = projectDatasets.map((entry) => entry.dataset.id);
  } else if (admin) {
    const allProjects = await storage.getAllProjects();
    const ids = new Set<string>();
    for (const project of allProjects) {
      const projectDatasets = await storage.getProjectDatasets(project.id);
      projectDatasets.forEach((entry) => ids.add(entry.dataset.id));
    }
    datasetIds = Array.from(ids);
  } else {
    const datasets = await storage.getDatasetsByOwner(userId);
    datasetIds = datasets.map((dataset: any) => dataset.id);
  }

  const uniqueDatasetIds = Array.from(new Set(datasetIds));

  for (const datasetId of uniqueDatasetIds) {
    const streamingSources = await storage.getStreamingSourcesByDataset(datasetId);
    for (const source of streamingSources) {
      const datasetProjects = await storage.getDatasetProjects(source.datasetId).catch(() => []);
      const linkedProjectId = datasetProjects[0]?.project?.id ?? null;
      liveSourcesRegistry.upsertStreamingSource(
        {
          id: source.id,
          datasetId: source.datasetId,
          projectId: linkedProjectId,
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
    }

    const scrapingJobs = await storage.getScrapingJobsByDataset(datasetId);
    for (const job of scrapingJobs) {
      const datasetProjects = await storage.getDatasetProjects(job.datasetId).catch(() => []);
      const linkedProjectId = datasetProjects[0]?.project?.id ?? null;
      liveSourcesRegistry.upsertScrapingJob(
        {
          id: job.id,
          datasetId: job.datasetId,
          projectId: linkedProjectId,
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
    }
  }
}

router.get('/overview', async (req, res) => {
  try {
    const { projectId } = overviewQuerySchema.parse(req.query ?? {});
    const user = req.user as any;
    const userId = user?.id;
    const admin = isUserAdmin(user);

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (projectId) {
      const accessCheck = await canAccessProject(userId, projectId, admin);
      if (!accessCheck.allowed) {
        return res
          .status(accessCheck.reason === 'Project not found' ? 404 : 403)
          .json({ success: false, error: accessCheck.reason });
      }
    }

    await synchronizeLiveSources(userId, admin, projectId);

    const overview = liveSourcesRegistry.computeOverview(projectId);

    return res.json({ success: true, data: overview });
  } catch (error) {
    console.error('[Live Sources] Error computing overview:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.flatten().formErrors.join(', ') || 'Invalid query' });
    }

    return res.status(500).json({ success: false, error: 'Failed to load live sources overview' });
  }
});

export default router;
