/**
 * Data Quality Handler
 *
 * HTTP route handlers for data quality analysis
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { dataQualityService } from '../data-quality-service';

const router = Router();

/**
 * Get data quality metrics
 */
router.get('/:id/data-quality', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await dataQualityService.analyzeQuality(projectId, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Data quality analysis error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to analyze data quality',
    });
  }
});

/**
 * Get schema analysis
 */
router.get('/:id/schema-analysis', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const schema = await dataQualityService.analyzeSchema(projectId, userId);

    res.json({
      success: true,
      schema,
    });
  } catch (error: any) {
    console.error('Schema analysis error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to analyze schema',
    });
  }
});

export default router;
