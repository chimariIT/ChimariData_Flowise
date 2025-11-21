import { Router } from 'express';
import { ensureAuthenticated } from './auth';
import { db } from '../db';
import { projects } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

type DatasetAssociation = {
  dataset: Record<string, any>;
  association?: Record<string, any>;
};

const isDatasetAssociation = (value: unknown): value is DatasetAssociation => {
  return Boolean(value && typeof value === 'object' && 'dataset' in (value as Record<string, any>));
};

const toRecord = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object') {
    return value as Record<string, any>;
  }
  return {};
};

const buildUserContext = (req: any, project?: any) => {
  const user = (req.user as any) || {};
  const computedRole = user.role || (user.isAdmin ? 'admin' : 'user');

  return {
    userId: user.id,
    userEmail: user.email,
    userRole: computedRole || 'user',
    isAdmin: Boolean(user.isAdmin),
    subscriptionTier: user.subscriptionTier || 'trial',
    projectId: project?.id,
    projectName: project?.name,
    journeyType: project?.journeyType || project?.journey_type || 'ai_guided'
  };
};

/**
 * Get data quality assessment for a project
 * GET /api/projects/:projectId/data-quality
 */
router.get('/:projectId/data-quality', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Get project
    const project = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const projectRecord = project[0];
    const ownerId = (projectRecord as any)?.ownerId ?? (projectRecord as any)?.userId;
    const isAdmin = Boolean((req.user as any)?.isAdmin);

    if (!isAdmin && ownerId && ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get datasets using storage service
    const { storage } = await import('../services/storage');
    const projectDatasets = await storage.getProjectDatasets(projectId);
    const datasetEntry: unknown = projectDatasets && projectDatasets.length > 0
      ? projectDatasets[0]
      : null;

    const datasetObj = isDatasetAssociation(datasetEntry)
      ? datasetEntry.dataset
      : datasetEntry;

    const datasetAvailable = Boolean(datasetObj);
    const dataset: {
      schema: Record<string, any>;
      rowCount: number;
      id: string | null;
      qualityMetrics: any;
    } = datasetAvailable && datasetObj && typeof datasetObj === 'object'
      ? {
          schema: toRecord((datasetObj as any).schema),
          rowCount: Number((datasetObj as any).recordCount ?? (datasetObj as any).rowCount ?? 0),
          id: (datasetObj as any).id ?? null,
          qualityMetrics: (datasetObj as any).qualityMetrics ?? null
        }
      : { schema: {}, rowCount: 0, id: null, qualityMetrics: null };

    const schema = dataset.schema;
    const columns = Object.keys(schema);
    let qualityScore = datasetAvailable ? 75 : 0;
    const issues: any[] = [];
    const recommendations: string[] = [];

    if (datasetAvailable) {
      if (columns.length < 2) {
        issues.push({
          severity: 'warning',
          message: 'Dataset has very few columns',
          suggestion: 'Consider adding more data features'
        });
        qualityScore -= 10;
      }

      if (dataset.rowCount && dataset.rowCount < 10) {
        issues.push({
          severity: 'warning',
          message: 'Dataset has very few rows',
          suggestion: 'Consider adding more data for robust analysis'
        });
        qualityScore -= 15;
      }

      recommendations.push(
        'Review recent uploads for missing values before running exploratory analysis.',
        'Enable automated validation rules to maintain data consistency.'
      );

      if (dataset.qualityMetrics) {
        const metrics = dataset.qualityMetrics;

        if (typeof metrics.dataQualityScore === 'number') {
          qualityScore = Math.round(metrics.dataQualityScore);
        }

        const completeness = typeof metrics.completeness === 'number' ? metrics.completeness : 1.0;
        const totalRows = dataset.rowCount || 1;
        const duplicateRows = metrics.duplicateRows || 0;
        const uniqueness = Math.max(0, (totalRows - duplicateRows) / totalRows);
        const typeConsistency = typeof metrics.typeConsistency === 'number' ? metrics.typeConsistency : 1.0;

        if (qualityScore === 75) {
          qualityScore = Math.round(((completeness * 0.4) + (uniqueness * 0.3) + (typeConsistency * 0.3)) * 100);
        }

        if (completeness < 0.9) {
          issues.push({
            severity: completeness < 0.7 ? 'error' : 'warning',
            message: `Data completeness is ${Math.round(completeness * 100)}%`,
            suggestion: 'Some fields contain missing values'
          });
        }

        if (duplicateRows > 0) {
          const duplicatePct = (duplicateRows / totalRows) * 100;
          issues.push({
            severity: duplicatePct > 20 ? 'error' : 'warning',
            message: `${duplicateRows} duplicate rows detected (${Math.round(duplicatePct)}%)`,
            suggestion: 'Consider removing duplicates before analysis'
          });
        }
      } else {
        if (columns.length > 0) {
          qualityScore = 75 + Math.min(10, Math.floor(columns.length / 3));
        }
      }
    } else {
      issues.push({
        severity: 'info',
        message: 'Dataset not uploaded yet. Upload data to enable detailed quality checks.',
        suggestion: 'Upload a dataset to unlock automated quality assessments.'
      });

      recommendations.push(
        'Upload a dataset to unlock automated quality assessments.',
        'Set data quality thresholds to monitor future uploads.'
      );
    }

    const metrics = datasetAvailable && dataset.qualityMetrics ? {
      completeness: Math.round((dataset.qualityMetrics.completeness ?? 1) * 100),
      consistency: Math.round((dataset.qualityMetrics.consistency ?? 1) * 100),
      accuracy: Math.round((dataset.qualityMetrics.accuracy ?? 1) * 100),
      validity: Math.round((dataset.qualityMetrics.validity ?? 1) * 100)
    } : {
      completeness: datasetAvailable ? 95 : 0,
      consistency: datasetAvailable ? 92 : 0,
      accuracy: datasetAvailable ? 90 : 0,
      validity: datasetAvailable ? 88 : 0
    };

    if (!datasetAvailable || !(dataset.qualityMetrics && typeof dataset.qualityMetrics.dataQualityScore === 'number')) {
      const average = (metrics.completeness + metrics.consistency + metrics.accuracy + metrics.validity) / 4;
      qualityScore = Math.round(average);
    }

    const userContext = buildUserContext(req, projectRecord);

    res.json({
      success: true,
      assessedBy: 'data_engineer_agent',
      userContext,
      datasetId: dataset.id,
      recordCount: dataset.rowCount,
      metrics,
      qualityScore: {
        overall: Math.max(0, Math.min(100, qualityScore)),
        label: datasetAvailable ? (dataset.qualityMetrics?.label || 'review_recommended') : 'insufficient_data'
      },
      issues,
      recommendations,
      metadata: {
        datasetAvailable,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Data quality assessment error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to assess data quality'
    });
  }
});

/**
 * Get PII detection results for a project
 * GET /api/projects/:projectId/pii-analysis
 */
router.get('/:projectId/pii-analysis', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const project = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const projectRecord = project[0];
    const ownerId = (projectRecord as any)?.ownerId ?? (projectRecord as any)?.userId;
    const isAdmin = Boolean((req.user as any)?.isAdmin);

    if (!isAdmin && ownerId && ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get datasets using storage service
    const { storage } = await import('../services/storage');
    const projectDatasets = await storage.getProjectDatasets(projectId);
    const datasetEntry: unknown = projectDatasets && projectDatasets.length > 0
      ? projectDatasets[0]
      : null;

    const datasetObj = isDatasetAssociation(datasetEntry)
      ? datasetEntry.dataset
      : datasetEntry;
    const dataset = datasetObj && typeof datasetObj === 'object'
      ? datasetObj
      : { schema: {} };

    const schema = toRecord((dataset as any).schema);
    
    // Check for potential PII based on column names and types
    const detectedPII: any[] = [];
    const piiKeywords = ['email', 'phone', 'name', 'address', 'ssn', 'id', 'username', 'user', 'person'];

    Object.keys(schema).forEach(columnName => {
      const lowerColumn = columnName.toLowerCase();
      if (piiKeywords.some(keyword => lowerColumn.includes(keyword))) {
        detectedPII.push({
          column: columnName,
          type: 'potential',
          suggestion: schema[columnName].type === 'string' ? 'Consider anonymizing this column' : 'Review data classification'
        });
      }
    });

    const userContext = buildUserContext(req, projectRecord);

    res.json({
      success: true,
      assessedBy: 'data_verification_service_enhanced',
      userContext,
      hasPII: detectedPII.length > 0,
      detectedPII,
      anonymizationApplied: Boolean((dataset as any)?.piiAnalysis?.userDecision === 'anonymized'),
      userConsent: (dataset as any)?.piiAnalysis?.userConsent ?? false,
      metadata: {
        datasetAvailable: Boolean(datasetObj),
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('PII analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze PII'
    });
  }
});

/**
 * Get schema analysis for a project
 * GET /api/projects/:projectId/schema-analysis
 */
router.get('/:projectId/schema-analysis', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const project = await db.select().from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found'
      });
    }

    const projectRecord = project[0];
    const ownerId = (projectRecord as any)?.ownerId ?? (projectRecord as any)?.userId;
    const isAdmin = Boolean((req.user as any)?.isAdmin);

    if (!isAdmin && ownerId && ownerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get datasets using storage service
    const { storage } = await import('../services/storage');
    const projectDatasets = await storage.getProjectDatasets(projectId);
    const datasetEntry: unknown = projectDatasets && projectDatasets.length > 0
      ? projectDatasets[0]
      : null;

    let datasetObj = isDatasetAssociation(datasetEntry)
      ? datasetEntry.dataset
      : datasetEntry;

    let schema: Record<string, any> = {};
    if (datasetObj && typeof datasetObj === 'object') {
      const candidateSchema = (datasetObj as any).schema;
      schema = toRecord(candidateSchema);
    }

    const datasetAvailable = Object.keys(schema).length > 0;

    if (!datasetAvailable) {
      const fallbackSchema = toRecord((projectRecord as any).schema);
      if (Object.keys(fallbackSchema).length > 0) {
        schema = fallbackSchema;
      }
    }

    const columns = Object.keys(schema);
    const columnTypes: Record<string, number> = {};
    const columnDetails = columns.map((columnName) => {
      const details = schema[columnName];
      const type = typeof details === 'string' ? details : details?.type || 'unknown';
      columnTypes[type] = (columnTypes[type] || 0) + 1;
      return {
        name: columnName,
        type,
        nullable: details?.nullable ?? true,
        sampleValues: Array.isArray(details?.sampleValues) ? details.sampleValues.slice(0, 5) : []
      };
    });

    const recommendations = columns.length > 0
      ? [
          'Validate detected data types before training models.',
          'Document business meaning for key columns to support collaboration.'
        ]
      : [
          'Upload a dataset to generate schema insights.',
          'Define expected columns for this project to guide future uploads.'
        ];

    const userContext = buildUserContext(req, projectRecord);

    res.json({
      success: true,
      assessedBy: 'data_verification_service_enhanced',
      userContext,
      datasetId: datasetObj && typeof datasetObj === 'object' ? (datasetObj as any).id || null : null,
      columnCount: columns.length,
      columnNames: columns,
      columnTypes,
      columnDetails,
      schema,
      recommendations,
      metadata: {
        datasetAvailable: columns.length > 0,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Schema analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze schema'
    });
  }
});

export default router;
