/**
 * Ownership verification middleware and helpers
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from '../services/storage';
import { isUserAdmin } from './rbac';

/**
 * Check if user can access a project
 * Admins can access all projects, regular users only their own
 */
export async function canAccessProject(
  userId: string,
  projectId: string,
  isAdminFlag: boolean = false
): Promise<{ allowed: boolean; reason?: string; project?: any }> {

  const userRecord = await storage.getUser(userId).catch(() => undefined);
  const userIsAdmin = (userRecord && isUserAdmin(userRecord)) || isAdminFlag;

  // Get project
  const project = await db.select().from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project.length === 0) {
    return {
      allowed: false,
      reason: 'Project not found'
    };
  }

  const projectData = project[0];

  // Admins can access any project
  if (userIsAdmin) {
    console.log(`[Ownership] Admin user ${userId} accessing project ${projectId}`);
    return {
      allowed: true,
      project: projectData
    };
  }

  // Regular users can only access their own projects
  if (projectData.userId === userId) {
    console.log(`[Ownership] User ${userId} accessing their own project ${projectId}`);
    return {
      allowed: true,
      project: projectData
    };
  }

  // Access denied
  console.warn(`[Ownership] User ${userId} attempted to access project ${projectId} owned by ${projectData.userId}`);
  return {
    allowed: false,
    reason: 'Access denied - you do not own this project'
  };
}

/**
 * Middleware to verify project ownership
 * Extracts projectId from req.params and checks ownership
 */
export async function verifyProjectOwnership(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const userIsAdmin = isUserAdmin(req.user);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required'
      });
    }

  const accessCheck = await canAccessProject(userId, projectId, userIsAdmin);

    if (!accessCheck.allowed) {
      return res.status(accessCheck.reason === 'Project not found' ? 404 : 403).json({
        success: false,
        error: accessCheck.reason
      });
    }

    // Attach project to request for downstream use
    (req as any).project = accessCheck.project;

    next();
  } catch (error) {
    console.error('Ownership verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to verify project ownership'
    });
  }
}

/**
 * Check if user is admin
 */
export function isAdmin(req: Request): boolean {
  return isUserAdmin(req.user);
}

/**
 * Get user role from request
 */
export function getUserRole(req: Request): string {
  return (req.user as any)?.userRole || (req.user as any)?.role || 'non-tech';
}
