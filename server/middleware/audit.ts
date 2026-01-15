/**
 * Audit Logging Middleware
 * 
 * Automatically logs all requests to protected routes for security
 * and compliance monitoring.
 */

import { Request, Response, NextFunction } from 'express';
import { AuditLogger, AuditAction } from '../services/audit-logger';

/**
 * Audit middleware - logs all requests
 * 
 * @example
 * ```typescript
 * router.get('/projects/:id',
 *   ensureAuthenticated,
 *   auditMiddleware,
 *   async (req, res) => {
 *     // Request is automatically logged
 *   }
 * );
 * ```
 */
export const auditMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Capture original send function
    const originalSend = res.send;
    let responseSent = false;

    // Override send to capture response
    res.send = function (data: any) {
        if (!responseSent) {
            responseSent = true;
            res.send = originalSend;

            // Log the request after response is sent
            if (req.user) {
                const duration = Date.now() - startTime;
                const action = mapMethodToAction(req.method);
                const resource = extractResource(req.path);
                const resourceId = req.params.id || req.params.projectId || 'unknown';

                AuditLogger.logDataAccess(
                    req.user.id || 'unknown',
                    req.user.email || 'unknown@unknown.com',
                    req.user.userRole || 'user',
                    resource,
                    resourceId,
                    action,
                    {
                        method: req.method,
                        endpoint: req.originalUrl,
                        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                        userAgent: req.get('user-agent') || 'unknown',
                        responseStatus: res.statusCode,
                        duration
                    }
                ).catch(err => console.error('Audit logging failed:', err));
            }

            return res.send(data);
        }
        return res;
    };

    next();
};

/**
 * Map HTTP method to audit action
 */
function mapMethodToAction(method: string): AuditAction {
    switch (method.toUpperCase()) {
        case 'GET':
            return 'READ';
        case 'POST':
            return 'WRITE';
        case 'PUT':
        case 'PATCH':
            return 'UPDATE';
        case 'DELETE':
            return 'DELETE';
        default:
            return 'READ';
    }
}

/**
 * Extract resource name from path
 */
function extractResource(path: string): string {
    const parts = path.split('/').filter(p => p && !p.match(/^[0-9a-f-]+$/i));
    return parts[parts.length - 1] || 'unknown';
}

/**
 * Audit specific action middleware
 * 
 * @param action - Specific action to log
 * @param resource - Resource type
 */
export const auditAction = (action: AuditAction, resource: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (req.user) {
            const resourceId = req.params.id || req.params.projectId || req.body.id || 'unknown';

            AuditLogger.logDataAccess(
                req.user.id || 'unknown',
                req.user.email || 'unknown@unknown.com',
                req.user.userRole || 'user',
                resource,
                resourceId,
                action,
                {
                    method: req.method,
                    endpoint: req.originalUrl,
                    ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                    requestBody: req.body
                }
            ).catch(err => console.error('Audit logging failed:', err));
        }

        next();
    };
};
