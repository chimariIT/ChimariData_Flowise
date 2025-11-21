/**
 * Project Status Middleware
 * Prevents modification of completed projects to protect data integrity
 */

import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

/**
 * Middleware to prevent modification of completed projects
 *
 * Usage:
 * router.put('/projects/:id', ensureAuthenticated, preventCompletedProjectModification, async (req, res) => { ... });
 */
export async function preventCompletedProjectModification(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract projectId from various possible locations
    const projectId = req.params.projectId || req.params.id || req.body.projectId;

    if (!projectId) {
      return next(); // No projectId to check, let route handler deal with it
    }

    // Get project to check status
    const project = await storage.getProject(projectId);

    if (!project) {
      return next(); // Project doesn't exist, let route handler return 404
    }

    // Define statuses that indicate a project should not be modified
    const completedStatuses = [
      'completed',
      'plan_approved',
      'generating',
      'analysing' // typo in some places
    ];

    // Check if project is in a completed state
    const projectAny = project as any;
    const projectStatus = projectAny.status as string;

    if (projectStatus && completedStatuses.includes(projectStatus)) {
      console.log(`⚠️  Attempt to modify completed project ${projectId} (status: ${projectStatus})`);
      return res.status(403).json({
        success: false,
        error: 'Cannot modify a completed project',
        projectStatus,
        message: 'This project has been completed and cannot be modified. Please create a new project if you need to make changes.'
      });
    }

    // Project is not completed, allow modification
    next();
  } catch (error) {
    console.error('❌ Error in preventCompletedProjectModification middleware:', error);
    // Don't block request on middleware error, let it through
    next();
  }
}

/**
 * Check if a project is in a completed state (utility function)
 */
export function isProjectCompleted(status: string): boolean {
  const completedStatuses = ['completed', 'plan_approved', 'generating', 'analysing'];
  return completedStatuses.includes(status);
}
