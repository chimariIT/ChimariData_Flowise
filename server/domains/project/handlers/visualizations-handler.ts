/**
 * Visualizations Handler
 *
 * HTTP route handlers for visualization generation
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { visualizationsService } from '../visualizations-service';

const router = Router();

/**
 * Create visualization
 */
router.post('/:id/generate-charts', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const {
      chartType,
      config,
      options,
      fields,
      groupByColumn,
      colorByColumn,
      sizeByColumn,
      aggregate,
    } = req.body;

    const input = {
      chartType,
      config,
      options,
      fields,
      groupByColumn,
      colorByColumn,
      sizeByColumn,
      aggregate,
    };

    const result = await visualizationsService.createVisualization(input, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Create visualization error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to create visualization',
    });
  }
});

/**
 * Get visualizations (legacy endpoint for backward compatibility)
 */
router.get('/:id/visualizations', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await visualizationsService.getVisualizations(projectId, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get visualizations error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get visualizations',
    });
  }
});

/**
 * Create visualization (alternate endpoint - matches monolithic router)
 */
router.post('/create-visualization/:projectId', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    const {
      chartType,
      config,
      options,
      fields,
      groupByColumn,
      colorByColumn,
      sizeByColumn,
      aggregate,
    } = req.body;

    const input = {
      projectId,
      chartType,
      config,
      options,
      fields,
      groupByColumn,
      colorByColumn,
      sizeByColumn,
      aggregate,
    };

    const result = await visualizationsService.createVisualization(input, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Create visualization error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to create visualization',
    });
  }
});

export default router;
