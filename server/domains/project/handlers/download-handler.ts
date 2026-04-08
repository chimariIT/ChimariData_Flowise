/**
 * Download Handler
 *
 * HTTP route handlers for file downloads and exports
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { storage } from '../../../services/storage';
import { NotFoundError, ForbiddenError, UnauthorizedError, ValidationError } from '../../../shared/utils/error-handling';

const router = Router();

/**
 * Download original file
 */
router.get('/:id/download/original', ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }

    // Get datasets
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length === 0) {
      throw new ValidationError('No datasets found');
    }

    const primaryAssociation =
      datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    if (!primaryDataset) {
      throw new ValidationError('No primary dataset found');
    }

    // Check if original file exists
    const fileName = (primaryDataset as any)?.originalFileName;
    const filePath = `uploads/originals/${fileName}`;

    // Stream file to response
    const fs = await import('fs');
    const path = await import('path');

    if (await fs.promises.access(filePath).catch(() => false)) {
      res.download(filePath, fileName);
    } else {
      res.status(404).json({
        success: false,
        error: 'Original file not found',
      });
    }
  } catch (error: any) {
    console.error('Download original error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to download original file',
    });
  }
});

/**
 * Download transformed data
 */
router.get('/:id/download/transformed', ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }

    // Get transformed data
    const journeyProgress = (project as any)?.journeyProgress || {};
    const transformedData = journeyProgress.transformedData || [];

    if (transformedData.length === 0) {
      throw new ValidationError('No transformed data available');
    }

    // Generate CSV
    const csvData = generateCSV(transformedData);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transformed_data_${projectId}.csv"`
    );
    res.send(csvData);
  } catch (error: any) {
    console.error('Download transformed data error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to download transformed data',
    });
  }
});

/**
 * Get export options
 */
router.get('/:id/export', ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }

    // Get available export options
    const exportOptions = {
      formats: ['csv', 'json'],
      endpoints: {
        csv: `/api/projects/${projectId}/download/transformed`,
        json: `/api/projects/${projectId}/export-json`,
      },
    };

    res.json({
      success: true,
      exportOptions,
    });
  } catch (error: any) {
    console.error('Get export options error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get export options',
    });
  }
});

/**
 * Export as PDF
 */
router.post('/:id/export-pdf', ensureAuthenticated, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId && !isAdmin) {
      throw new ForbiddenError('Access denied');
    }

    const { sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
      throw new ValidationError('Sections array is required');
    }

    // TODO: Implement PDF export logic
    // This would use a PDF generation library
    res.status(501).json({
      success: false,
      error: 'PDF export not yet implemented',
    });
  } catch (error: any) {
    console.error('Export PDF error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to export PDF',
    });
  }
});

/**
 * Helper function to generate CSV from data
 */
function generateCSV(data: any[]): string {
  if (!data || data.length === 0) {
    return '';
  }

  const headers = Object.keys(data[0]);
  const csvRows = data.map((row) => {
    return headers
      .map((header) => {
        const value = row[header];
        // Escape quotes and commas in values
        const strValue = String(value ?? '');
        return strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')
          ? `"${strValue.replace(/"/g, '""')}"`
          : strValue;
      })
      .join(',');
  });

  return [headers.join(','), ...csvRows].join('\n');
}

export default router;
