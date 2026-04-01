/**
 * Checkpoint Handler
 *
 * HTTP route handlers for checkpoint management
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { checkpointService } from '../checkpoint-service';

const router = Router();

/**
 * Get all checkpoints for project
 */
router.get('/:id/checkpoints', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const result = await checkpointService.getCheckpoints(projectId, userId);

    res.json({
      success: true,
      checkpoints: result,
    });
  } catch (error: any) {
    console.error('Get checkpoints error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to get checkpoints',
    });
  }
});

/**
 * Create checkpoint
 */
router.post('/:id/checkpoints', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    const { name, description, metadata } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Checkpoint name is required',
      });
    }

    const result = await checkpointService.createCheckpoint(
      projectId,
      userId,
      {
        name: name.trim(),
        description: description || '',
        metadata: metadata || {},
      }
    );

    res.json({
      success: true,
      checkpoint: result,
    });
  } catch (error: any) {
    console.error('Create checkpoint error:', error);
    const status = error instanceof ValidationError ? 400 :
                  error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to create checkpoint',
    });
  }
});

/**
 * Update checkpoint status
 */
router.put('/:id/checkpoints/:checkpointId', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { checkpointId } = req.params;

    const { status, metadata } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: 'Checkpoint status is required',
      });
    }

    const success = await checkpointService.updateCheckpointStatus(
      projectId,
      userId,
      checkpointId,
      { status, metadata }
    );

    if (success) {
      res.json({
        success: true,
        message: 'Checkpoint status updated',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update checkpoint',
      });
    }
  } catch (error: any) {
    console.error('Update checkpoint error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ValidationError ? 400 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to update checkpoint',
    });
  }
});

/**
 * Delete checkpoint
 */
router.delete('/:id/checkpoints/:checkpointId', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const { checkpointId } = req.params;

    const success = await checkpointService.deleteCheckpoint(
      projectId,
      userId,
      checkpointId
    );

    if (success) {
      res.json({
        success: true,
        message: 'Checkpoint deleted',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to delete checkpoint',
      });
    }
  } catch (error: any) {
    console.error('Delete checkpoint error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to delete checkpoint',
    });
  }
});

export default router;
