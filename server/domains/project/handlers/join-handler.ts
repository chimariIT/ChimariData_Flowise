/**
 * Join Handler
 *
 * HTTP route handlers for multi-dataset join operations
 */

import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { joinService } from '../join-service';
import { ServiceError, ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../../shared/utils/error-handling';
import type { JoinConfig } from '../join-service';

const router = Router();

/**
 * POST /api/projects/:id/detect-join-keys - Auto-detect join keys
 */
router.post('/:id/detect-join-keys', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await joinService.autoDetectJoinKeys(projectId, userId);

    res.json({
      success: true,
      foreignKeys: result.foreignKeys,
      message: `Detected ${result.foreignKeys.length} join key(s)`,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to detect join keys' });
  }
});

/**
 * POST /api/projects/:id/join - Execute multi-dataset join
 */
router.post('/:id/join', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const config: JoinConfig = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await joinService.executeJoin(projectId, userId, config);

    res.json({
      success: true,
      message: 'Join executed successfully',
      preview: result.preview,
      rowCount: result.rowCount,
      schema: result.schema,
      joinInsights: result.joinInsights,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to execute join' });
  }
});

/**
 * GET /api/projects/:id/joined-data - Get joined data
 */
router.get('/:id/joined-data', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await joinService.getJoinedData(projectId, userId);

    res.json({
      success: true,
      data: result.joinedData || [],
      totalRows: result.rowCount || 0,
      schema: result.schema,
      joinInsights: result.joinInsights,
      message: 'Joined data retrieved successfully',
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof NotFoundError) {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ success: false, error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to get joined data' });
  }
});

export default router;
