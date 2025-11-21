// server/services/admin-audit-log.ts
import { db } from '../db';
import { adminProjectActions } from '@shared/schema';
import { nanoid } from 'nanoid';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export interface AdminAuditLogEntry {
  action: string;
  adminId: string;
  userId?: string;
  projectId?: string;
  entityType: 'project' | 'user' | 'subscription' | 'tool' | 'agent' | 'consultation' | 'other';
  changes?: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: any;
}

export class AdminAuditLogService {
  /**
   * Log an admin action
   */
  static async log(entry: AdminAuditLogEntry): Promise<void> {
    try {
      await db.insert(adminProjectActions).values({
        id: nanoid(),
        adminId: entry.adminId,
        projectId: entry.projectId || null,
        userId: entry.userId || null,
        action: entry.action,
        entityType: entry.entityType,
        changes: entry.changes || null,
        reason: entry.reason || null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
        metadata: entry.metadata || null,
        createdAt: new Date(),
      });

      console.log(`📝 Admin audit log: ${entry.adminId} performed ${entry.action} on ${entry.entityType}`);
    } catch (error: any) {
      console.error('Failed to log admin action:', error);
      // Don't throw - audit logging failures shouldn't break the main operation
    }
  }

  /**
   * Get audit trail for a specific project
   */
  static async getAuditTrail(projectId: string) {
    try {
      return await db
        .select()
        .from(adminProjectActions)
        .where(eq(adminProjectActions.projectId, projectId))
        .orderBy(desc(adminProjectActions.createdAt));
    } catch (error: any) {
      console.error('Failed to get audit trail:', error);
      return [];
    }
  }

  /**
   * Get admin activity for a specific admin
   */
  static async getAdminActivity(
    adminId: string,
    startDate?: Date,
    endDate?: Date
  ) {
    try {
      let query = db
        .select()
        .from(adminProjectActions)
        .where(eq(adminProjectActions.adminId, adminId));

      if (startDate) {
        query = query.where(
          and(
            eq(adminProjectActions.adminId, adminId),
            gte(adminProjectActions.createdAt, startDate)
          )!
        );
      }

      if (endDate) {
        const conditions = [
          eq(adminProjectActions.adminId, adminId)
        ];
        if (startDate) {
          conditions.push(gte(adminProjectActions.createdAt, startDate));
        }
        conditions.push(lte(adminProjectActions.createdAt, endDate));
        query = query.where(and(...conditions)!);
      }

      return await query.orderBy(desc(adminProjectActions.createdAt));
    } catch (error: any) {
      console.error('Failed to get admin activity:', error);
      return [];
    }
  }

  /**
   * Get actions by entity type
   */
  static async getActionsByEntity(
    entityType: string,
    entityId?: string,
    limit: number = 100
  ) {
    try {
      let query = db
        .select()
        .from(adminProjectActions)
        .where(eq(adminProjectActions.entityType, entityType));

      if (entityType === 'project' && entityId) {
        query = query.where(
          and(
            eq(adminProjectActions.entityType, entityType),
            eq(adminProjectActions.projectId, entityId)
          )!
        );
      } else if (entityType === 'user' && entityId) {
        query = query.where(
          and(
            eq(adminProjectActions.entityType, entityType),
            eq(adminProjectActions.userId, entityId)
          )!
        );
      }

      return await query
        .orderBy(desc(adminProjectActions.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error('Failed to get actions by entity:', error);
      return [];
    }
  }
}





