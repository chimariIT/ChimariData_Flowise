/**
 * User Issue Tracker
 *
 * Ticket management system for Customer Support agents.
 * Tracks user issues, provides troubleshooting, and manages escalations.
 *
 * Features:
 * - Issue creation and tracking
 * - Priority management
 * - Status workflow (open -> in_progress -> resolved -> closed)
 * - Escalation management
 * - Activity logging
 * - SLA tracking
 */

import { nanoid } from 'nanoid';

export interface UserIssue {
  issueId: string;
  userId: string;
  issueType: 'technical' | 'billing' | 'feature_request' | 'bug' | 'question' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_user' | 'resolved' | 'closed';
  title: string;
  description: string;
  attachments?: Array<{
    filename: string;
    url: string;
    type: string;
  }>;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  closedAt?: Date;
  escalationLevel: 0 | 1 | 2 | 3; // 0 = normal, 1-3 = escalation levels
  sla?: {
    responseBy: Date;
    resolveBy: Date;
    breached: boolean;
  };
  activity: IssueActivity[];
  relatedIssues?: string[];
  tags?: string[];
}

export interface IssueActivity {
  activityId: string;
  timestamp: Date;
  type: 'created' | 'updated' | 'comment' | 'status_change' | 'assigned' | 'escalated' | 'resolved';
  userId: string;
  details: string;
  changes?: Record<string, { old: any; new: any }>;
}

export interface CreateIssueRequest {
  userId: string;
  issueType: UserIssue['issueType'];
  priority: UserIssue['priority'];
  title: string;
  description: string;
  attachments?: UserIssue['attachments'];
  tags?: string[];
}

export interface UpdateIssueRequest {
  issueId: string;
  status?: UserIssue['status'];
  assignedTo?: string;
  priority?: UserIssue['priority'];
  comment?: string;
  escalate?: boolean;
}

export interface IssueSearchQuery {
  userId?: string;
  status?: UserIssue['status'] | UserIssue['status'][];
  issueType?: UserIssue['issueType'];
  priority?: UserIssue['priority'];
  assignedTo?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  tags?: string[];
  limit?: number;
}

export class UserIssueTracker {
  private issues: Map<string, UserIssue> = new Map();
  private userIssueIndex: Map<string, Set<string>> = new Map();
  private slaConfig = {
    response: {
      urgent: 1 * 60 * 60 * 1000, // 1 hour
      high: 4 * 60 * 60 * 1000, // 4 hours
      medium: 24 * 60 * 60 * 1000, // 24 hours
      low: 48 * 60 * 60 * 1000 // 48 hours
    },
    resolution: {
      urgent: 4 * 60 * 60 * 1000, // 4 hours
      high: 24 * 60 * 60 * 1000, // 24 hours
      medium: 72 * 60 * 60 * 1000, // 3 days
      low: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  };

  constructor() {
    console.log('[UserIssueTracker] Issue tracking system initialized');
  }

  /**
   * Create a new issue
   */
  async createIssue(request: CreateIssueRequest): Promise<UserIssue> {
    const issueId = `issue_${nanoid()}`;
    const now = new Date();

    // Calculate SLA deadlines
    const responseBy = new Date(now.getTime() + this.slaConfig.response[request.priority]);
    const resolveBy = new Date(now.getTime() + this.slaConfig.resolution[request.priority]);

    const issue: UserIssue = {
      issueId,
      userId: request.userId,
      issueType: request.issueType,
      priority: request.priority,
      status: 'open',
      title: request.title,
      description: request.description,
      attachments: request.attachments,
      tags: request.tags,
      createdAt: now,
      updatedAt: now,
      escalationLevel: 0,
      sla: {
        responseBy,
        resolveBy,
        breached: false
      },
      activity: [
        {
          activityId: `activity_${Date.now()}`,
          timestamp: now,
          type: 'created',
          userId: request.userId,
          details: 'Issue created'
        }
      ]
    };

    // Store issue
    this.issues.set(issueId, issue);

    // Index by user
    if (!this.userIssueIndex.has(request.userId)) {
      this.userIssueIndex.set(request.userId, new Set());
    }
    this.userIssueIndex.get(request.userId)!.add(issueId);

    console.log(`[IssueTracker] Created issue ${issueId} for user ${request.userId}`);

    return issue;
  }

  /**
   * Update an existing issue
   */
  async updateIssue(request: UpdateIssueRequest, updatedBy: string): Promise<UserIssue> {
    const issue = this.issues.get(request.issueId);

    if (!issue) {
      throw new Error(`Issue ${request.issueId} not found`);
    }

    const now = new Date();
    const changes: Record<string, { old: any; new: any }> = {};

    // Track status change
    if (request.status && request.status !== issue.status) {
      changes.status = { old: issue.status, new: request.status };
      issue.status = request.status;

      if (request.status === 'resolved') {
        issue.resolvedAt = now;
      } else if (request.status === 'closed') {
        issue.closedAt = now;
      }
    }

    // Track assignment change
    if (request.assignedTo && request.assignedTo !== issue.assignedTo) {
      changes.assignedTo = { old: issue.assignedTo, new: request.assignedTo };
      issue.assignedTo = request.assignedTo;
    }

    // Track priority change
    if (request.priority && request.priority !== issue.priority) {
      changes.priority = { old: issue.priority, new: request.priority };
      issue.priority = request.priority;

      // Recalculate SLA
      const responseBy = new Date(issue.createdAt.getTime() + this.slaConfig.response[request.priority]);
      const resolveBy = new Date(issue.createdAt.getTime() + this.slaConfig.resolution[request.priority]);
      issue.sla = {
        responseBy,
        resolveBy,
        breached: now > resolveBy
      };
    }

    // Handle escalation
    if (request.escalate && issue.escalationLevel < 3) {
      issue.escalationLevel = (issue.escalationLevel + 1) as 0 | 1 | 2 | 3;
      changes.escalationLevel = { old: issue.escalationLevel - 1, new: issue.escalationLevel };

      issue.activity.push({
        activityId: `activity_${Date.now()}`,
        timestamp: now,
        type: 'escalated',
        userId: updatedBy,
        details: `Escalated to level ${issue.escalationLevel}`,
        changes
      });
    }

    // Add comment activity
    if (request.comment) {
      issue.activity.push({
        activityId: `activity_${Date.now()}`,
        timestamp: now,
        type: 'comment',
        userId: updatedBy,
        details: request.comment
      });
    }

    // Add update activity if there were changes
    if (Object.keys(changes).length > 0) {
      issue.activity.push({
        activityId: `activity_${Date.now()}`,
        timestamp: now,
        type: 'updated',
        userId: updatedBy,
        details: 'Issue updated',
        changes
      });
    }

    issue.updatedAt = now;

    console.log(`[IssueTracker] Updated issue ${request.issueId}`);

    return issue;
  }

  /**
   * Get issue by ID
   */
  async getIssue(issueId: string): Promise<UserIssue | null> {
    return this.issues.get(issueId) || null;
  }

  /**
   * Search issues
   */
  async searchIssues(query: IssueSearchQuery): Promise<UserIssue[]> {
    let results = Array.from(this.issues.values());

    // Filter by user
    if (query.userId) {
      const userIssueIds = this.userIssueIndex.get(query.userId);
      if (userIssueIds) {
        results = results.filter(issue => userIssueIds.has(issue.issueId));
      } else {
        return [];
      }
    }

    // Filter by status
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      results = results.filter(issue => statuses.includes(issue.status));
    }

    // Filter by type
    if (query.issueType) {
      results = results.filter(issue => issue.issueType === query.issueType);
    }

    // Filter by priority
    if (query.priority) {
      results = results.filter(issue => issue.priority === query.priority);
    }

    // Filter by assignee
    if (query.assignedTo) {
      results = results.filter(issue => issue.assignedTo === query.assignedTo);
    }

    // Filter by date range
    if (query.createdAfter) {
      results = results.filter(issue => issue.createdAt >= query.createdAfter!);
    }

    if (query.createdBefore) {
      results = results.filter(issue => issue.createdAt <= query.createdBefore!);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(issue =>
        issue.tags && query.tags!.some(tag => issue.tags!.includes(tag))
      );
    }

    // Sort by priority (urgent first) and then by created date (newest first)
    results.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDiff !== 0) {
        return priorityDiff;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get SLA breach report
   */
  async getSLABreaches(): Promise<UserIssue[]> {
    const now = new Date();

    return Array.from(this.issues.values()).filter(issue => {
      if (!issue.sla) return false;

      // Check if resolved/closed issues had breaches
      if (issue.status === 'resolved' || issue.status === 'closed') {
        return issue.sla.breached;
      }

      // Check if open issues are past SLA
      return now > issue.sla.resolveBy;
    });
  }

  /**
   * Get issue statistics
   */
  async getStatistics(userId?: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
    averageResolutionTime: number;
    slaBreachRate: number;
  }> {
    let issues = Array.from(this.issues.values());

    if (userId) {
      const userIssueIds = this.userIssueIndex.get(userId);
      if (userIssueIds) {
        issues = issues.filter(issue => userIssueIds.has(issue.issueId));
      } else {
        issues = [];
      }
    }

    const stats = {
      total: issues.length,
      byStatus: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      byPriority: {} as Record<string, number>,
      averageResolutionTime: 0,
      slaBreachRate: 0
    };

    // Calculate statistics
    let totalResolutionTime = 0;
    let resolvedCount = 0;
    let slaBreaches = 0;

    issues.forEach(issue => {
      // Count by status
      stats.byStatus[issue.status] = (stats.byStatus[issue.status] || 0) + 1;

      // Count by type
      stats.byType[issue.issueType] = (stats.byType[issue.issueType] || 0) + 1;

      // Count by priority
      stats.byPriority[issue.priority] = (stats.byPriority[issue.priority] || 0) + 1;

      // Calculate resolution time
      if (issue.resolvedAt) {
        const resolutionTime = issue.resolvedAt.getTime() - issue.createdAt.getTime();
        totalResolutionTime += resolutionTime;
        resolvedCount++;
      }

      // Count SLA breaches
      if (issue.sla?.breached) {
        slaBreaches++;
      }
    });

    stats.averageResolutionTime = resolvedCount > 0 ? totalResolutionTime / resolvedCount : 0;
    stats.slaBreachRate = issues.length > 0 ? (slaBreaches / issues.length) * 100 : 0;

    return stats;
  }

  /**
   * Add comment to issue
   */
  async addComment(issueId: string, userId: string, comment: string): Promise<UserIssue> {
    return this.updateIssue({ issueId, comment }, userId);
  }

  /**
   * Escalate issue
   */
  async escalateIssue(issueId: string, userId: string, reason?: string): Promise<UserIssue> {
    const comment = reason ? `Escalating: ${reason}` : 'Issue escalated';
    return this.updateIssue({ issueId, escalate: true, comment }, userId);
  }

  /**
   * Resolve issue
   */
  async resolveIssue(issueId: string, userId: string, resolution: string): Promise<UserIssue> {
    return this.updateIssue({
      issueId,
      status: 'resolved',
      comment: `Resolution: ${resolution}`
    }, userId);
  }

  /**
   * Close issue
   */
  async closeIssue(issueId: string, userId: string): Promise<UserIssue> {
    return this.updateIssue({
      issueId,
      status: 'closed'
    }, userId);
  }
}

// Singleton instance
export const userIssueTracker = new UserIssueTracker();
