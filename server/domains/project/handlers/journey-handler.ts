/**
 * Journey Handler
 *
 * HTTP route handlers for journey state management
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { journeyService } from '../journey-service';

const router = Router();

/**
 * Get current journey state
 */
router.get('/:id/journey-state', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await journeyService.getJourneyStatus(projectId, userId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Get journey state error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get journey state',
    });
  }
});

/**
 * Complete a journey step
 */
router.post('/:id/journey/complete-step', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { step, data } = req.body;

    if (!step) {
      return res.status(400).json({
        success: false,
        error: 'Step is required',
      });
    }

    const result = await journeyService.completeStep(projectId, userId, step, data);

    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('Complete step error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to complete step',
    });
  }
});

export default router;
