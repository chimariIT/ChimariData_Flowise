/**
 * Row-Level Security Middleware
 * 
 * Automatically applies RLS filters to database queries based on
 * user context and configured policies.
 */

import { Request, Response, NextFunction } from 'express';
import { RowLevelSecurityService, RLSOperation, RLSUserContext } from '../services/row-level-security';

/**
 * Apply RLS middleware to a route
 * 
 * @param tableName - The table name to apply RLS to
 * @param operation - The operation being performed (defaults to req.method)
 * 
 * @example
 * ```typescript
 * router.get('/projects', applyRLS('projects'), async (req, res) => {
 *   // req.rlsFilter contains the filter to apply
 *   const projects = await db.select().from(projects).where(req.rlsFilter.where);
 * });
 * ```
 */
export const applyRLS = (tableName: string, operation?: RLSOperation) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Ensure user is authenticated
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            // Build user context
            const userContext: RLSUserContext = {
                userId: req.user.id || '',
                userRole: req.user.userRole || 'user',
                isAdmin: req.user.isAdmin || false,
                department: (req.user as any).department || undefined,
                groups: (req.user as any).groups || []
            };

            // Determine operation from HTTP method if not specified
            const rlsOperation = operation || mapHttpMethodToRLSOperation(req.method);

            // Apply RLS filters
            const rlsFilter = await RowLevelSecurityService.applyRLSFilters(
                tableName,
                rlsOperation,
                userContext
            );

            // Attach filter to request
            (req as any).rlsFilter = rlsFilter;

            // Log RLS application for audit
            console.log(`🔒 RLS applied to ${tableName} for user ${req.user.id}:`, {
                operation: rlsOperation,
                policiesApplied: rlsFilter.metadata.policiesApplied.length,
                bypassReason: rlsFilter.metadata.bypassReason
            });

            next();
        } catch (error: any) {
            console.error('RLS middleware error:', error);
            res.status(500).json({ error: 'Security policy error' });
        }
    };
};

/**
 * Map HTTP method to RLS operation
 */
function mapHttpMethodToRLSOperation(method: string): RLSOperation {
    switch (method.toUpperCase()) {
        case 'GET':
            return 'SELECT';
        case 'POST':
            return 'INSERT';
        case 'PUT':
        case 'PATCH':
            return 'UPDATE';
        case 'DELETE':
            return 'DELETE';
        default:
            return 'SELECT';
    }
}

/**
 * Require admin access (bypass RLS)
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
