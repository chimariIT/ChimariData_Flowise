/**
 * Transformation Handler
 *
 * HTTP route handlers for transformation operations
 */

import { Router, Request, Response } from 'express';
import { ensureAuthenticated, unifiedAuth } from '../../../routes/auth';
import { storage } from '../../../services/storage';
import { transformationService } from '../transformation-service';
import { ServiceError, ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../../shared/utils/error-handling';
import type { TransformationStep } from '../../../services/data-transformation';

const router = Router();

/**
 * POST /api/projects/:id/save-transformations - Save transformations
 */
router.post("/save-transformations/:projectId", unifiedAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { transformations } = req.body;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await transformationService.executeTransformations({
      projectId,
      userId,
      transformations: transformations || [],
    });

    const project = await storage.getProject(projectId);

    res.json({
      success: true,
      message: 'Transformations saved successfully',
      project,
      preview: result.preview,
      rowCount: result.rowCount,
      warnings: result.warnings,
      summary: result.summary,
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
    res.status(500).json({ error: 'Failed to save transformations' });
  }
});

/**
 * POST /api/projects/:id/execute-transformations - Execute transformations
 */
router.post("/:id/execute-transformations", ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id: projectId } = req.params;
    const userId = (req.user as any)?.id;
    const {
      transformationSteps = [],
      mappings = [],
      questionAnswerMapping = [],
      joinConfig
    } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const result = await transformationService.executeTransformations({
      projectId,
      userId,
      transformations: transformationSteps || [],
      // TODO: Implement joinResolver for multi-dataset joins
      // joinResolver: async (targetProjectId) => { ... }
    });

    const project = await storage.getProject(projectId);

    res.json({
      success: true,
      message: 'Transformations executed successfully',
      project,
      preview: result.preview,
      rowCount: result.rowCount,
      warnings: result.warnings,
      summary: result.summary,
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
    res.status(500).json({ success: false, error: 'Failed to execute transformations' });
  }
});

/**
 * GET /api/projects/:id/get-transformed-data - Get transformed data
 */
router.get("/get-transformed-data/:projectId", unifiedAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await transformationService.getTransformations(projectId, userId);

    res.json({
      success: true,
      data: result.transformedData || [],
      totalRows: result.rowCount || 0,
      message: 'Transformed data retrieved successfully',
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
    res.status(500).json({ error: 'Failed to get transformed data' });
  }
});

export default router;
