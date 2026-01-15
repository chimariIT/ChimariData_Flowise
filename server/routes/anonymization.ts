import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { storage } from '../storage';
import { AnonymizationEngine, AnonymizationOptions } from '../anonymization-engine';
import { canAccessProject, isAdmin } from '../middleware/ownership';
import { db } from '../db';
import { dePiiDetections } from '@shared/schema';
import { eq } from 'drizzle-orm';

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
    (project as any)?.preview
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

    // Build reference mapping for later de-anonymization (if needed)
    // This stores the technique used for each column and any reversible mappings
    const referenceMapping: Record<string, {
      technique: string;
      originalColumnName: string;
      anonymizedAt: string;
      isReversible: boolean;
      sampleOriginal?: string;
      sampleAnonymized?: string;
    }> = {};

    for (const [column, options] of Object.entries(mappings)) {
      const technique = options.technique || 'mask';
      // Only hash and format-preserving techniques are potentially reversible with the key
      const isReversible = technique === 'hash' || technique === 'format_preserving';

      // Store sample for verification (first non-null value)
      let sampleOriginal: string | undefined;
      let sampleAnonymized: string | undefined;

      for (let i = 0; i < Math.min(snapshot.rows.length, 10); i++) {
        if (snapshot.rows[i]?.[column] != null && anonymizedData[i]?.[column] != null) {
          sampleOriginal = String(snapshot.rows[i][column]).substring(0, 20);
          sampleAnonymized = String(anonymizedData[i][column]).substring(0, 20);
          break;
        }
      }

      referenceMapping[column] = {
        technique,
        originalColumnName: column,
        anonymizedAt: new Date().toISOString(),
        isReversible,
        sampleOriginal,
        sampleAnonymized
      };
    }

    await storage.updateProject(projectId, {
      preview: anonymizedData.slice(0, 5),
      piiAnalysis: {
        ...(accessCheck.project?.piiAnalysis || {}),
        userDecision: 'anonymized',
        decisionTimestamp: new Date(),
        // Store reference mapping for audit trail and potential de-anonymization
        referenceMapping,
        anonymizedColumns: Object.keys(mappings),
        totalRecordsAnonymized: anonymizedData.length
      }
    } as any);

    // Update de_pii_detections table with user actions
    try {
      for (const column of Object.keys(mappings)) {
        await db.update(dePiiDetections)
          .set({
            userAction: 'anonymize',
            actionAppliedAt: new Date(),
          })
          .where(eq(dePiiDetections.columnName, column));
      }
      console.log(`[anonymization.ts] Updated de_pii_detections for ${Object.keys(mappings).length} columns`);
    } catch (dbError) {
      console.error('Failed to update de_pii_detections:', dbError);
      // Non-blocking - don't fail the anonymization
    }

    res.json({
      success: true,
      updatedRows: anonymizedData.length,
      // Return mapping info (without sensitive samples) for confirmation
      anonymizedColumns: Object.keys(mappings).map(col => ({
        column: col,
        technique: mappings[col].technique || 'mask'
      }))
    });
  } catch (error: any) {
    console.error('Failed to apply anonymization:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply anonymization'
    });
  }
});

/**
 * Simple PII actions endpoint for keep/remove actions
 * POST /api/anonymization/pii-actions
 * This endpoint handles the basic keep/remove/anonymize actions per column
 */
router.post('/pii-actions', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, actions } = req.body || {};
    const userId = (req.user as any)?.id;

    if (!projectId || !actions || !Array.isArray(actions)) {
      return res.status(400).json({
        success: false,
        error: 'projectId and actions array are required'
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

    const appliedActions: Array<{
      column: string;
      action: string;
      success: boolean;
      message: string;
    }> = [];
    const removedColumns: string[] = [];
    const anonymizedColumns: string[] = [];
    let transformedData = snapshot.rows.map(row => ({ ...row }));
    let transformedSchema = { ...snapshot.schema };

    for (const actionItem of actions) {
      const { columnName, action, piiType } = actionItem;

      try {
        if (action === 'keep') {
          // No data changes, just record the decision
          appliedActions.push({
            column: columnName,
            action: 'keep',
            success: true,
            message: `Column "${columnName}" kept as-is`
          });
        } else if (action === 'remove') {
          // Remove column from all rows
          transformedData = transformedData.map(row => {
            const newRow = { ...row };
            delete newRow[columnName];
            return newRow;
          });
          delete transformedSchema[columnName];
          removedColumns.push(columnName);

          appliedActions.push({
            column: columnName,
            action: 'remove',
            success: true,
            message: `Column "${columnName}" removed from dataset`
          });
        } else if (action === 'anonymize') {
          // Use the existing anonymization engine with default technique based on PII type
          const technique = piiType === 'email' ? 'substitute_fake'
            : piiType === 'phone' ? 'mask_partial'
            : piiType === 'ssn' ? 'mask_partial'
            : piiType === 'name' ? 'substitute_fake'
            : 'mask_partial';

          const mappings: Record<string, AnonymizationOptions> = {
            [columnName]: { technique }
          };
          transformedData = AnonymizationEngine.anonymizeDataset(transformedData, mappings);
          anonymizedColumns.push(columnName);

          appliedActions.push({
            column: columnName,
            action: 'anonymize',
            success: true,
            message: `Column "${columnName}" anonymized with ${technique}`
          });
        }

        // Update de_pii_detections table
        await db.update(dePiiDetections)
          .set({
            userAction: action,
            actionAppliedAt: new Date(),
          })
          .where(eq(dePiiDetections.columnName, columnName));

      } catch (actionError: any) {
        appliedActions.push({
          column: columnName,
          action,
          success: false,
          message: actionError.message || 'Failed to apply action'
        });
      }
    }

    // Save transformed data
    await storage.updateDataset(snapshot.datasetId, {
      data: transformedData,
      preview: transformedData.slice(0, 20),
      schema: transformedSchema
    });

    // Update project with PII action info
    await storage.updateProject(projectId, {
      piiAnalysis: {
        ...(accessCheck.project?.piiAnalysis || {}),
        userDecision: removedColumns.length > 0 || anonymizedColumns.length > 0 ? 'processed' : 'kept',
        decisionTimestamp: new Date(),
        appliedActions,
        removedColumns,
        anonymizedColumns
      }
    } as any);

    res.json({
      success: true,
      appliedActions,
      removedColumns,
      anonymizedColumns,
      transformedRowCount: transformedData.length
    });

  } catch (error: any) {
    console.error('Failed to apply PII actions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to apply PII actions'
    });
  }
});

export default router;

