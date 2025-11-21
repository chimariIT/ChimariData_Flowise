import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { storage } from '../storage';
import { AnonymizationEngine, AnonymizationOptions } from '../anonymization-engine';
import { canAccessProject, isAdmin } from '../middleware/ownership';

const router = Router();

type ProjectDataSnapshot = {
  rows: any[];
  schema: Record<string, any>;
  datasetId?: string;
};

function parseArray(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function getProjectDataSnapshot(projectId: string): Promise<ProjectDataSnapshot> {
  const [project, datasets] = await Promise.all([
    storage.getProject(projectId),
    storage.getProjectDatasets(projectId)
  ]);

  const datasetRecord = datasets?.[0]?.dataset as any;

  const rowSources = [
    datasetRecord?.data,
    datasetRecord?.preview,
    datasetRecord?.ingestionMetadata?.preview,
    project?.transformedData,
    project?.data,
    project?.preview
  ];

  let rows: any[] = [];
  for (const source of rowSources) {
    const parsed = parseArray(source);
    if (parsed.length) {
      rows = parsed;
      break;
    }
  }

  const schema = datasetRecord?.schema || project?.schema || {};

  return {
    rows,
    schema,
    datasetId: datasetRecord?.id
  };
}

router.get('/techniques', ensureAuthenticated, (_req, res) => {
  res.json({
    success: true,
    techniques: AnonymizationEngine.getTechniques()
  });
});

router.post('/preview', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, columnMappings, sampleSize = 5 } = req.body || {};
    const userId = (req.user as any)?.id;

    if (!projectId || !columnMappings || typeof columnMappings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'projectId and columnMappings are required'
      });
    }

    const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({ success: false, error: accessCheck.reason });
    }

    const snapshot = await getProjectDataSnapshot(projectId);
    if (!snapshot.rows.length) {
      return res.status(400).json({
        success: false,
        error: 'No data available for anonymization preview'
      });
    }

    const preview = AnonymizationEngine.previewAnonymization(
      snapshot.rows,
      columnMappings,
      sampleSize
    );

    res.json({
      success: true,
      preview: preview.preview,
      summary: preview.summary,
      totalRecords: snapshot.rows.length
    });
  } catch (error: any) {
    console.error('Failed to generate anonymization preview:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate anonymization preview'
    });
  }
});

router.post('/apply', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, columnMappings } = req.body || {};
    const userId = (req.user as any)?.id;

    if (!projectId || !columnMappings || typeof columnMappings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'projectId and columnMappings are required'
      });
    }

    const accessCheck = await canAccessProject(userId, projectId, isAdmin(req));
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({ success: false, error: accessCheck.reason });
    }

    const snapshot = await getProjectDataSnapshot(projectId);
    if (!snapshot.rows.length || !snapshot.datasetId) {
      return res.status(400).json({
        success: false,
        error: 'Dataset not found or is empty'
      });
    }

    const mappings: Record<string, AnonymizationOptions> = columnMappings;
    const anonymizedData = AnonymizationEngine.anonymizeDataset(snapshot.rows, mappings);

    await storage.updateDataset(snapshot.datasetId, {
      data: anonymizedData,
      preview: anonymizedData.slice(0, 20)
    });

    await storage.updateProject(projectId, {
      preview: anonymizedData.slice(0, 5),
      piiAnalysis: {
        ...(accessCheck.project?.piiAnalysis || {}),
        userDecision: 'anonymized',
        decisionTimestamp: new Date()
      }
    } as any);

    res.json({
      success: true,
      updatedRows: anonymizedData.length
    });
  } catch (error: any) {
    console.error('Failed to apply anonymization:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply anonymization'
    });
  }
});

export default router;

