// server/middleware/rbac.ts

import type { Request, Response, NextFunction } from 'express';
import { storage } from '../services/storage';

export interface UserRole {
  id: string;
  name: string;
  permissions: string[];
}

export interface Permission {
  resource: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'manage';
}

// Define role hierarchy and permissions
export const ROLES: Record<string, UserRole> = {
  USER: {
    id: 'user',
    name: 'User',
    permissions: [
      'projects:create',
      'projects:read',
      'projects:update',
      'projects:delete',
      'datasets:create',
      'datasets:read',
      'datasets:update',
      'datasets:delete',
      'agents:interact',
      'billing:read'
    ]
  },
  ADMIN: {
    id: 'admin',
    name: 'Admin',
    permissions: [
      'projects:manage',
      'datasets:manage',
      'users:manage',
      'agents:manage',
      'billing:manage',
      'system:manage',
      'analytics:read',
      'subscriptions:manage',
      'tools:manage'
    ]
  },
  SUPER_ADMIN: {
    id: 'super_admin',
    name: 'Super Admin',
    permissions: [
      '*:*' // All permissions
    ]
  }
};

// Permission patterns for different resources
export const PERMISSION_PATTERNS = {
  // User management
  'users:create': 'Create new users',
  'users:read': 'View user information',
  'users:update': 'Modify user data',
  'users:delete': 'Delete users',
  'users:manage': 'Full user management',

  // Project management
  'projects:create': 'Create new projects',
  'projects:read': 'View projects',
  'projects:update': 'Modify projects',
  'projects:delete': 'Delete projects',
  'projects:manage': 'Full project management',

  // Agent management
  'agents:interact': 'Interact with AI agents',
  'agents:configure': 'Configure agent settings',
  'agents:manage': 'Full agent management',

  // Billing and subscriptions
  'billing:read': 'View billing information',
  'billing:update': 'Modify billing settings',
  'billing:manage': 'Full billing management',
  'subscriptions:manage': 'Manage subscriptions',

  // System administration
  'system:manage': 'System administration',
  'analytics:read': 'View system analytics',
  'tools:manage': 'Manage MCP tools',
};

/**
 * Get user role from database or default to USER
 */
async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const user = await storage.getUser(userId);
    const userRole = (user as any)?.role || 'user';
    
    // Map database role to our role system
    switch (userRole.toLowerCase()) {
      case 'admin':
        return ROLES.ADMIN;
      case 'super_admin':
      case 'superadmin':
        return ROLES.SUPER_ADMIN;
      default:
        return ROLES.USER;
    }
  } catch (error) {
    console.error('Error fetching user role:', error);
    return ROLES.USER; // Default to user role
  }
}

/**
 * Check if a role has a specific permission
 */
function hasPermission(role: UserRole, resource: string, action: string): boolean {
  const permission = `${resource}:${action}`;
  
  // Super admin wildcard
  if (role.permissions.includes('*:*')) {
    return true;
  }
  
  // Exact permission match
  if (role.permissions.includes(permission)) {
    return true;
  }
  
  // Resource wildcard (e.g., "projects:manage" includes "projects:read")
  const resourceWildcard = `${resource}:manage`;
  if (role.permissions.includes(resourceWildcard)) {
    return true;
  }
  
  return false;
}

/**
 * Middleware to require authentication
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }
  next();
};

/**
 * Middleware to require specific permission
 */
export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userId = (req.user as any).id;
      const userRole = await getUserRole(userId);
      
      if (!hasPermission(userRole, resource, action)) {
        return res.status(403).json({
          success: false,
          error: `Permission denied: ${resource}:${action}`,
          code: 'PERMISSION_DENIED',
          required_permission: `${resource}:${action}`,
          user_role: userRole.name
        });
      }

      // Add role and permissions to request for further use
      (req as any).userRole = userRole;
      next();
    } catch (error: any) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during permission check',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

/**
 * Middleware to require admin role
 */
export const requireAdmin = requirePermission('system', 'manage');

/**
 * Middleware to require super admin role
 */
export const requireSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userId = (req.user as any).id;
    const userRole = await getUserRole(userId);
    
    if (userRole.id !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Super admin access required',
        code: 'SUPER_ADMIN_REQUIRED',
        user_role: userRole.name
      });
    }

    (req as any).userRole = userRole;
    next();
  } catch (error: any) {
    console.error('Super admin check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during permission check',
      code: 'PERMISSION_CHECK_ERROR'
    });
  }
};

/**
 * Middleware to check resource ownership
 */
export const requireOwnership = (resourceType: 'project' | 'dataset') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const userId = (req.user as any).id;
      const resourceId = req.params.id || req.params.projectId || req.params.datasetId;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: 'Resource ID required',
          code: 'RESOURCE_ID_REQUIRED'
        });
      }

      // Check if user is admin (bypass ownership check)
      const userRole = await getUserRole(userId);
      if (hasPermission(userRole, resourceType + 's', 'manage')) {
        (req as any).userRole = userRole;
        return next();
      }

      // Check ownership
      let isOwner = false;
      if (resourceType === 'project') {
        const project = await storage.getProject(resourceId);
        const ownerId = (project as any)?.ownerId || (project as any)?.userId;
        isOwner = ownerId === userId;
      }
      // Add other resource types as needed

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You do not own this resource',
          code: 'OWNERSHIP_REQUIRED'
        });
      }

      (req as any).userRole = userRole;
      next();
    } catch (error: any) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during ownership check',
        code: 'OWNERSHIP_CHECK_ERROR'
      });
    }
  };
};

/**
 * Helper function to get user permissions for frontend
 */
export async function getUserPermissions(userId: string): Promise<{
  role: UserRole;
  permissions: string[];
}> {
  const role = await getUserRole(userId);
  return {
    role,
    permissions: role.permissions
  };
}