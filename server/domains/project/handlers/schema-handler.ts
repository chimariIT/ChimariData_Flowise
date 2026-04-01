/**
 * Schema Handler
 *
 * HTTP route handlers for schema updates
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { requireOwnership } from '../../../middleware/rbac';
import { projectService } from '../project-service';

const router = Router();

/**
 * Update project schema
 */
router.put('/:id/schema', ensureAuthenticated, requireOwnership('project'), async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    const { schema } = req.body;

    if (!schema || typeof schema !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Schema object is required',
      });
    }

    // Update project with schema
    const success = await projectService.updateProject(
      projectId,
      { schema },
      userId,
      isAdmin
    );

    if (success) {
      res.json({
        success: true,
        message: 'Schema updated',
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update schema',
      });
    }
  } catch (error: any) {
    console.error('Update schema error:', error);
    const status = error instanceof NotFoundError ? 404 :
                  error instanceof ForbiddenError ? 403 :
                  error instanceof UnauthorizedError ? 401 : 500;

    res.status(status).json({
      success: false,
      error: error.message || 'Failed to update schema',
    });
  }
});

export default router;
