import { Router } from 'express';
import { z } from 'zod';
import { ensureAuthenticated } from './auth';
import { storage } from '../services/storage';
import { isUserAdmin } from '../middleware/rbac';
import { nanoid } from 'nanoid';

const router = Router();

router.use(ensureAuthenticated);

const createDatasetSchema = z.object({
  name: z.string().min(1, 'Dataset name is required'),
  description: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUri: z.string().optional(),
  schema: z.any().optional(),
  content: z.any().optional(),
  ingestionMetadata: z.record(z.any()).optional(),
  dataType: z.string().optional(),
  mode: z.string().optional(),
  retentionDays: z.number().nullable().optional(),
});

function deriveDatasetName(dataset: any): string {
  const metadataName = (dataset?.ingestionMetadata as any)?.name;
  if (typeof metadataName === 'string' && metadataName.trim().length > 0) {
    return metadataName.trim();
  }
  if (typeof dataset?.originalFileName === 'string' && dataset.originalFileName.trim().length > 0) {
    return dataset.originalFileName.trim();
  }
  return 'Dataset';
}

function deriveDatasetDescription(dataset: any): string {
  const metadataDesc = (dataset?.ingestionMetadata as any)?.description;
  return typeof metadataDesc === 'string' ? metadataDesc : '';
}

function transformDataset(dataset: any) {
  if (!dataset) {
    return dataset;
  }

  return {
    ...dataset,
    name: deriveDatasetName(dataset),
    description: deriveDatasetDescription(dataset),
  };
}

router.get('/', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const datasets = await storage.getDatasetsByOwner(userId);
    return res.json({ datasets: datasets.map(transformDataset) });
  } catch (error: any) {
    console.error('[Datasets] Failed to list datasets:', error);
    return res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const dataset = await storage.getDataset(req.params.id);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const user = req.user as any;
    const userId = user?.id;
    const admin = isUserAdmin(user);

    if (!admin && dataset.userId && dataset.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this dataset' });
    }

    return res.json(transformDataset(dataset));
  } catch (error: any) {
    console.error('[Datasets] Failed to fetch dataset:', error);
    return res.status(500).json({ error: 'Failed to fetch dataset' });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = req.user as any;
    const userId = user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const parsed = createDatasetSchema.parse(req.body ?? {});
    const datasetId = nanoid();
    const content = parsed.content;
    const ingestionMetadata = parsed.ingestionMetadata ?? {};
    const originalFileName =
      (typeof ingestionMetadata.fileName === 'string' && ingestionMetadata.fileName.trim().length > 0)
        ? ingestionMetadata.fileName.trim()
        : `${parsed.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    const mimeType =
      (typeof ingestionMetadata.fileType === 'string' && ingestionMetadata.fileType.trim().length > 0)
        ? ingestionMetadata.fileType.trim()
        : 'application/json';
    const recordCount =
      typeof ingestionMetadata.recordCount === 'number'
        ? ingestionMetadata.recordCount
        : Array.isArray(content)
          ? content.length
          : null;
    const fileSize =
      typeof ingestionMetadata.fileSize === 'number'
        ? ingestionMetadata.fileSize
        : Array.isArray(content)
          ? JSON.stringify(content).length
          : 0;

    const dataset = await storage.createDataset({
      id: datasetId,
      userId,
      sourceType: parsed.sourceType ?? 'upload',
      originalFileName,
      mimeType,
      fileSize,
      checksum: ingestionMetadata.checksum ?? null,
      storageUri: parsed.sourceUri ?? `memory://${datasetId}`,
      dataType: parsed.dataType ?? (typeof ingestionMetadata.dataType === 'string' ? ingestionMetadata.dataType : 'tabular'),
      schema: parsed.schema ?? ingestionMetadata.schema ?? null,
      recordCount,
      preview: Array.isArray(content) ? content.slice(0, 20) : ingestionMetadata.preview ?? null,
      piiAnalysis: ingestionMetadata.piiAnalysis ?? null,
      ingestionMetadata: {
        name: parsed.name,
        description: parsed.description ?? '',
        ...ingestionMetadata,
      },
      status: 'ready',
      data: content ?? null,
      mode:
        parsed.mode ??
        (typeof ingestionMetadata.mode === 'string'
          ? ingestionMetadata.mode
          : parsed.sourceType === 'streaming'
            ? 'stream'
            : parsed.sourceType === 'scraping'
              ? 'refreshable'
              : 'static'),
      retentionDays: parsed.retentionDays ?? (typeof ingestionMetadata.retentionDays === 'number' ? ingestionMetadata.retentionDays : null),
    } as any);

    return res.status(201).json(transformDataset(dataset));
  } catch (error: any) {
    console.error('[Datasets] Failed to create dataset:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.flatten().formErrors.join(', ') || 'Invalid dataset payload' });
    }
    return res.status(500).json({ error: error.message || 'Failed to create dataset' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const dataset = await storage.getDataset(req.params.id);
    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const user = req.user as any;
    const userId = user?.id;
    const admin = isUserAdmin(user);

    if (!admin && dataset.userId && dataset.userId !== userId) {
      return res.status(403).json({ error: 'You do not have access to this dataset' });
    }

    await storage.deleteDataset(req.params.id);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Datasets] Failed to delete dataset:', error);
    return res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

export default router;
