/**
 * Audit Logging Service
 * 
 * Comprehensive audit logging for security, compliance, and operational monitoring.
 * Tracks all data access, authentication events, and administrative actions.
 * 
 * @module AuditLogger
 */

import { db } from '../db';
import { auditLogs } from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/** Audit log severity levels */
export type AuditSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

/** Audit log categories */
export type AuditCategory = 'DATA_ACCESS' | 'AUTH' | 'ADMIN' | 'COMPLIANCE' | 'SECURITY';

/** Audit log action types */
export type AuditAction =
    | 'READ' | 'WRITE' | 'UPDATE' | 'DELETE'
    | 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN'
    | 'EXPORT' | 'IMPORT' | 'SHARE'
    | 'CONFIG_CHANGE' | 'USER_MANAGEMENT' | 'POLICY_CHANGE';

/** Audit log entry */
export interface AuditLog {
    id: string;
    timestamp: Date;
    userId: string;
    userEmail: string;
    userRole: string;
    action: AuditAction;
    resource: string;
    resourceId: string;
    details: {
        method?: string;
        endpoint?: string;
        ipAddress?: string;
        userAgent?: string;
        requestBody?: any;
        responseStatus?: number;
        duration?: number;
        changes?: {
            before: any;
            after: any;
        };
    };
    severity: AuditSeverity;
    category: AuditCategory;
    success: boolean;
    errorMessage?: string;
}

/** Audit log filter options */
export interface AuditLogFilter {
    userId?: string;
    action?: AuditAction;
    resource?: string;
    category?: AuditCategory;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
    limit?: number;
    offset?: number;
}

/** Audit log statistics */
export interface AuditStats {
    totalLogs: number;
    byCategory: Record<AuditCategory, number>;
    bySeverity: Record<AuditSeverity, number>;
    byAction: Record<string, number>;
    failedActions: number;
    uniqueUsers: number;
}

/**
 * Audit Logger Service
 * 
 * Provides comprehensive audit logging capabilities for security,
 * compliance, and operational monitoring.
 */
export class AuditLogger {
    /**
     * Log a data access event
     * 
     * @param userId - User ID
     * @param userEmail - User email
     * @param userRole - User role
     * @param resource - Resource type (e.g., 'project', 'dataset')
     * @param resourceId - Resource ID
     * @param action - Action performed
     * @param details - Additional details
     */
    static async logDataAccess(
        userId: string,
        userEmail: string,
        userRole: string,
        resource: string,
        resourceId: string,
        action: AuditAction,
        details: any = {}
    ): Promise<void> {
        try {
            await this.createLog({
                userId,
                userEmail,
                userRole,
                action,
                resource,
                resourceId,
                details,
                severity: 'INFO',
                category: 'DATA_ACCESS',
                success: details.responseStatus ? details.responseStatus < 400 : true
            });
        } catch (error) {
            console.error('Failed to log data access:', error);
            // Don't throw - audit logging failures shouldn't break the app
        }
    }

    /**
     * Log an authentication event
     * 
     * @param email - User email
     * @param action - Auth action (LOGIN, LOGOUT, FAILED_LOGIN)
     * @param details - Additional details (IP, user agent, etc.)
     * @param success - Whether the action succeeded
     */
    static async logAuth(
        email: string,
        action: 'LOGIN' | 'LOGOUT' | 'FAILED_LOGIN',
        details: any = {},
        success: boolean = true
    ): Promise<void> {
        try {
            await this.createLog({
                userId: details.userId || 'unknown',
                userEmail: email,
                userRole: details.userRole || 'unknown',
                action,
                resource: 'auth',
                resourceId: email,
                details,
                severity: success ? 'INFO' : 'WARNING',
                category: 'AUTH',
                success,
                errorMessage: success ? undefined : details.error
            });
        } catch (error) {
            console.error('Failed to log auth event:', error);
        }
    }

    /**
     * Log an administrative action
     * 
     * @param adminUserId - Admin user ID
     * @param adminEmail - Admin email
     * @param action - Action performed
     * @param target - Target resource/user
     * @param details - Additional details
     */
    static async logAdminAction(
        adminUserId: string,
        adminEmail: string,
        action: AuditAction,
        target: string,
        details: any = {}
    ): Promise<void> {
        try {
            await this.createLog({
                userId: adminUserId,
                userEmail: adminEmail,
                userRole: 'admin',
                action,
                resource: 'admin',
                resourceId: target,
                details,
                severity: 'WARNING',
                category: 'ADMIN',
                success: true
            });
        } catch (error) {
            console.error('Failed to log admin action:', error);
        }
    }

    /**
     * Log a compliance-related event
     * 
     * @param userId - User ID
     * @param userEmail - User email
     * @param action - Compliance action
     * @param details - Additional details
     */
    static async logComplianceEvent(
        userId: string,
        userEmail: string,
        action: string,
        details: any = {}
    ): Promise<void> {
        try {
            await this.createLog({
                userId,
                userEmail,
                userRole: details.userRole || 'user',
                action: action as AuditAction,
                resource: 'compliance',
                resourceId: details.requestId || nanoid(),
                details,
                severity: 'INFO',
                category: 'COMPLIANCE',
                success: true
            });
        } catch (error) {
            console.error('Failed to log compliance event:', error);
        }
    }

    /**
     * Log a security event
     * 
     * @param userId - User ID
     * @param event - Security event description
     * @param severity - Event severity
     * @param details - Additional details
     */
    static async logSecurityEvent(
        userId: string,
        event: string,
        severity: AuditSeverity,
        details: any = {}
    ): Promise<void> {
        try {
            await this.createLog({
                userId,
                userEmail: details.userEmail || 'unknown',
                userRole: details.userRole || 'unknown',
                action: 'READ' as AuditAction,
                resource: 'security',
                resourceId: event,
                details,
                severity,
                category: 'SECURITY',
                success: false
            });
        } catch (error) {
            console.error('Failed to log security event:', error);
        }
    }

    /**
     * Create an audit log entry
     * 
     * @param log - Audit log data
     */
    private static async createLog(log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> {
        await db.insert(auditLogs).values({
            id: nanoid(),
            timestamp: new Date(),
            ...log,
            details: log.details || {}
        });
    }

    /**
     * Query audit logs with filters
     * 
     * @param filters - Filter options
     * @returns Array of audit logs
     */
    static async queryLogs(filters: AuditLogFilter = {}): Promise<AuditLog[]> {
        const conditions = [];

        if (filters.userId) {
            conditions.push(eq(auditLogs.userId, filters.userId));
        }

        if (filters.action) {
            conditions.push(eq(auditLogs.action, filters.action));
        }

        if (filters.resource) {
            conditions.push(eq(auditLogs.resource, filters.resource));
        }

        if (filters.category) {
            conditions.push(eq(auditLogs.category, filters.category));
        }

        if (filters.severity) {
            conditions.push(eq(auditLogs.severity, filters.severity));
        }

        if (filters.success !== undefined) {
            conditions.push(eq(auditLogs.success, filters.success));
        }

        if (filters.startDate) {
            conditions.push(gte(auditLogs.timestamp, filters.startDate));
        }

        if (filters.endDate) {
            conditions.push(lte(auditLogs.timestamp, filters.endDate));
        }

        const query = db
            .select()
            .from(auditLogs)
            .where(conditions.length > 0 ? and(...conditions) : undefined)
            .orderBy(desc(auditLogs.timestamp))
            .limit(filters.limit || 100)
            .offset(filters.offset || 0);

        return await query as AuditLog[];
    }

    /**
     * Get audit log statistics
     * 
     * @param filters - Optional filters
     * @returns Audit statistics
     */
    static async getStats(filters: AuditLogFilter = {}): Promise<AuditStats> {
        const logs = await this.queryLogs({ ...filters, limit: 10000 });

        const stats: AuditStats = {
            totalLogs: logs.length,
            byCategory: {
                DATA_ACCESS: 0,
                AUTH: 0,
                ADMIN: 0,
                COMPLIANCE: 0,
                SECURITY: 0
            },
            bySeverity: {
                INFO: 0,
                WARNING: 0,
                ERROR: 0,
                CRITICAL: 0
            },
            byAction: {},
            failedActions: 0,
            uniqueUsers: new Set(logs.map(l => l.userId)).size
        };

        logs.forEach(log => {
            stats.byCategory[log.category]++;
            stats.bySeverity[log.severity]++;
            stats.byAction[log.action] = (stats.byAction[log.action] || 0) + 1;
            if (!log.success) stats.failedActions++;
        });

        return stats;
    }

    /**
     * Export audit logs to CSV
     * 
     * @param filters - Filter options
     * @returns CSV string
     */
    static async exportToCSV(filters: AuditLogFilter = {}): Promise<string> {
        const logs = await this.queryLogs({ ...filters, limit: 100000 });

        const headers = [
            'Timestamp',
            'User Email',
            'User Role',
            'Action',
            'Resource',
            'Resource ID',
            'Category',
            'Severity',
            'Success',
            'IP Address',
            'Details'
        ];

        const rows = logs.map(log => [
            log.timestamp.toISOString(),
            log.userEmail,
            log.userRole,
            log.action,
            log.resource,
            log.resourceId,
            log.category,
            log.severity,
            log.success ? 'Yes' : 'No',
            log.details.ipAddress || 'N/A',
            JSON.stringify(log.details)
        ]);

        return [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
    }

    /**
     * Export audit logs to JSON
     * 
     * @param filters - Filter options
     * @returns JSON string
     */
    static async exportToJSON(filters: AuditLogFilter = {}): Promise<string> {
        const logs = await this.queryLogs({ ...filters, limit: 100000 });
        return JSON.stringify(logs, null, 2);
    }

    /**
     * Delete old audit logs (for retention policy)
     * 
     * @param olderThan - Delete logs older than this date
     * @returns Number of logs deleted
     */
    static async deleteOldLogs(olderThan: Date): Promise<number> {
        const result = await db
            .delete(auditLogs)
            .where(lte(auditLogs.timestamp, olderThan));

        return result.rowCount || 0;
    }

    /**
     * Get recent failed login attempts for a user
     * 
     * @param email - User email
     * @param minutes - Time window in minutes
     * @returns Number of failed attempts
     */
    static async getRecentFailedLogins(email: string, minutes: number = 15): Promise<number> {
        const since = new Date(Date.now() - minutes * 60 * 1000);

        const logs = await this.queryLogs({
            action: 'FAILED_LOGIN',
            startDate: since,
            success: false
        });

        return logs.filter(log => log.userEmail === email).length;
    }
}
