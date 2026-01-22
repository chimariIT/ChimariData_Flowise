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
      '*:*'
    ]
  }
};

export const PERMISSION_PATTERNS = {
  'users:create': 'Create new users',
  'users:read': 'View user information',
  'users:update': 'Modify user data',
  'users:delete': 'Delete users',
  'users:manage': 'Full user management',
  'projects:create': 'Create new projects',
  'projects:read': 'View projects',
  'projects:update': 'Modify projects',
  'projects:delete': 'Delete projects',
  'projects:manage': 'Full project management',
  'agents:interact': 'Interact with AI agents',
  'agents:configure': 'Configure agent settings',
  'agents:manage': 'Full agent management',
  'billing:read': 'View billing information',
  'billing:update': 'Modify billing settings',
  'billing:manage': 'Full billing management',
  'subscriptions:manage': 'Manage subscriptions',
  'system:manage': 'System administration',
  'analytics:read': 'View system analytics',
  'tools:manage': 'Manage MCP tools'
};

const CHIMARI_ADMIN_DOMAIN = '@chimaridata.com';

export function isChimariEmail(email: unknown): boolean {
  if (typeof email !== 'string') {
    return false;
  }

  return email.trim().toLowerCase().endsWith(CHIMARI_ADMIN_DOMAIN);
}

export function isUserAdmin(user: any): boolean {
  if (!user) {
    return false;
  }

  const normalizedRole = typeof user.role === 'string' ? user.role.toLowerCase() : '';
  const hasAdminFlag =
    user.isAdmin === true ||
    normalizedRole === 'admin' ||
    normalizedRole === 'super_admin' ||
    normalizedRole === 'superadmin';

  if (!hasAdminFlag) {
    return false;
  }

  if (!isChimariEmail(user.email)) {
    console.warn(`[RBAC] User ${user.email ?? '<unknown>'} flagged as admin but lacks @chimaridata.com email`);
    return false;
  }

  return true;
}

async function getUserRole(userId: string): Promise<UserRole> {
  try {
    const user = await storage.getUser(userId);

    if (!user) {
      return ROLES.USER;
    }

    if (isUserAdmin(user)) {
      const normalizedRole =
        typeof (user as any).role === 'string' ? (user as any).role.toLowerCase() : 'admin';

      if (normalizedRole === 'super_admin' || normalizedRole === 'superadmin') {
        return ROLES.SUPER_ADMIN;
      }

      return ROLES.ADMIN;
    }

    const userRole =
      typeof (user as any).role === 'string' ? (user as any).role.toLowerCase() : 'user';

    switch (userRole) {
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
    return ROLES.USER;
  }
}

function hasPermission(role: UserRole, resource: string, action: string): boolean {
  const permission = `${resource}:${action}`;

  if (role.permissions.includes('*:*')) {
    return true;
  }

  if (role.permissions.includes(permission)) {
    return true;
  }

  if (role.permissions.includes(`${resource}:manage`)) {
    return true;
  }

  return false;
}

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

      (req as any).userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during permission check',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!isUserAdmin(req.user)) {
      const userEmail = (req.user as any)?.email;
      console.warn(`[RBAC] Admin access denied for user: ${userEmail ?? '<unknown>'}`);
      return res.status(403).json({
        success: false,
        error: 'Admin privileges required',
        code: 'ADMIN_REQUIRED'
      });
    }

    const userId = (req.user as any).id;
    const userRole = await getUserRole(userId);

    if (!hasPermission(userRole, 'system', 'manage')) {
      return res.status(403).json({
        success: false,
        error: 'Admin privileges required',
        code: 'ADMIN_REQUIRED',
        user_role: userRole.name
      });
    }

    (req as any).userRole = userRole;
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during admin check',
      code: 'ADMIN_CHECK_ERROR'
    });
  }
};

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
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during permission check',
      code: 'PERMISSION_CHECK_ERROR'
    });
  }
};

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
      const resourceId =
        req.params.id ?? req.params.projectId ?? req.params.datasetId;

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          error: 'Resource ID required',
          code: 'RESOURCE_ID_REQUIRED'
        });
      }

      const user = await storage.getUser(userId);
      const userRole = await getUserRole(userId);

      if (isUserAdmin(user) || hasPermission(userRole, `${resourceType}s`, 'manage')) {
        (req as any).userRole = userRole;
        return next();
      }

      let isOwner = false;

      if (resourceType === 'project') {
        const project = await storage.getProject(resourceId);
        if (!project) {
          isOwner = false;
        } else {
          const ownerId = (project as any)?.ownerId ?? (project as any)?.userId;
          if (ownerId === userId) {
            isOwner = true;
          } else if (!ownerId) {
            // P0-2 FIX: Legacy project with no owner - allow access with warning
            console.warn(`⚠️ [RBAC] Project ${resourceId} has NULL ownerId - allowing user ${userId}`);
            isOwner = true;
          } else {
            isOwner = false;
          }
        }
      } else if (resourceType === 'dataset') {
        const dataset = await (storage as any).getDataset?.(resourceId);
        if (!dataset) {
          isOwner = false;
        } else {
          const ownerId = (dataset as any).ownerId ?? (dataset as any).userId;
          if (ownerId === userId) {
            isOwner = true;
          } else if (!ownerId) {
            // P0-2 FIX: Legacy dataset with no owner - allow access with warning
            console.warn(`⚠️ [RBAC] Dataset ${resourceId} has NULL ownerId - allowing user ${userId}`);
            isOwner = true;
          } else {
            isOwner = false;
          }
        }
      }

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Access denied: You do not own this resource',
          code: 'OWNERSHIP_REQUIRED'
        });
      }

      (req as any).userRole = userRole;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during ownership check',
        code: 'OWNERSHIP_CHECK_ERROR'
      });
    }
  };
};

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
