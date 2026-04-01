/**
 * Project CRUD Handler
 *
 * HTTP route handlers for project CRUD operations
 */

import { Router, Request, Response } from 'express';
import { ensureAuthenticated } from '../../../routes/auth';
import { isAdmin } from '../../../middleware/ownership';
import { projectService } from '../project-service';
import {
  ServiceError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
} from '../../../shared/utils/error-handling';

const router = Router();

/**
 * POST /api/projects - Create new project
 */
router.post('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { name, description, journeyType } = req.body;

    const project = await projectService.createProject(
      {
        name,
        description,
        journeyType,
      },
      userId
    );

    res.status(200).json({
      success: true,
      project,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({
        success: false,
        error: error.message,
        requiresUpgrade: true,
      });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ success: false, error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects - Get all projects for user
 */
router.get('/', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const projects = await projectService.getProjectsByUser(userId);

    res.json({ projects });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('[ERROR] GET /api/projects failed:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

/**
 * GET /api/projects/:id - Get project by ID
 */
router.get('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    const userIsAdmin = isAdmin(req);

    const project = await projectService.getProjectById(id, userId, userIsAdmin);

    res.json(project);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Failed to fetch project:', error);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

/**
 * PUT /api/projects/:id - Update project
 */
router.put('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req.user as any)?.id;
    const userIsAdmin = isAdmin(req);

    const success = await projectService.updateProject(id, updates, userId, userIsAdmin);

    if (success) {
      // Return updated project
      const project = await projectService.getProjectById(id, userId, userIsAdmin);
      return res.json({
        success: true,
        project,
        message: 'Project updated successfully',
      });
    } else {
      return res.status(500).json({ success: false, error: 'Failed to update project' });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Failed to update project:', error);
    return res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id - Delete project
 */
router.delete('/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req.user as any)?.id;
    const userIsAdmin = isAdmin(req);

    const success = await projectService.deleteProject(id, userId, userIsAdmin);

    if (success) {
      return res.status(200).json({
        success: true,
        message: 'Project deleted successfully',
      });
    } else {
      return res.status(500).json({ success: false, error: 'Failed to delete project' });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    if (error instanceof UnauthorizedError) {
      return res.status(401).json({ error: error.message });
    }
    if (error instanceof ServiceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ success: false, error: 'Failed to delete project' });
  }
});

export default router;
