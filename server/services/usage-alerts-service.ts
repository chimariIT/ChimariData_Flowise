/**
 * Usage Alerts Service
 *
 * Sprint 3: Monitors user usage against subscription quotas and sends alerts
 * when approaching or exceeding limits.
 *
 * Key features:
 * - Configurable alert thresholds (80%, 90%, 100%)
 * - Email notifications via SendGrid
 * - In-app notifications via WebSocket
 * - Alert history to prevent spam
 * - Integration with billing service for quota data
 */

import { db } from '../db';
import { users, projects } from '../../shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { getBillingService } from './billing/unified-billing-service';
import { nanoid } from 'nanoid';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export type AlertType = 'warning' | 'critical' | 'exceeded';
export type UsageMetric = 'projects' | 'data_processing_mb' | 'analyses' | 'storage_mb' | 'ai_queries';

export interface UsageAlert {
  id: string;
  userId: string;
  metric: UsageMetric;
  type: AlertType;
  threshold: number;
  currentUsage: number;
  limit: number;
  percentUsed: number;
  message: string;
  createdAt: Date;
  acknowledged: boolean;
  notificationSent: boolean;
}

export interface UsageStatus {
  metric: UsageMetric;
  current: number;
  limit: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'critical' | 'exceeded';
}

export interface AlertConfig {
  warningThreshold: number;   // e.g., 0.8 = 80%
  criticalThreshold: number;  // e.g., 0.9 = 90%
  emailEnabled: boolean;
  inAppEnabled: boolean;
  cooldownMinutes: number;    // Minimum time between repeat alerts
}

// Default configuration
const DEFAULT_CONFIG: AlertConfig = {
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  emailEnabled: true,
  inAppEnabled: true,
  cooldownMinutes: 60 // 1 hour between repeat alerts
};

// In-memory alert history (could be moved to Redis for distributed systems)
const alertHistory: Map<string, UsageAlert[]> = new Map();

// ==========================================
// USAGE ALERTS SERVICE
// ==========================================

export class UsageAlertsService {
  private config: AlertConfig;

  constructor(config: Partial<AlertConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check all usage metrics for a user and generate alerts if needed
   */
  async checkUserUsage(userId: string): Promise<UsageAlert[]> {
    console.log(`📊 [UsageAlerts] Checking usage for user ${userId}`);

    const billingService = getBillingService();
    const alerts: UsageAlert[] = [];

    try {
      // Get user's subscription tier
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        console.warn(`[UsageAlerts] User ${userId} not found`);
        return [];
      }

      const tier = (user as any).subscriptionTier || 'trial';
      const tierConfig = billingService.getTierConfig(tier);

      if (!tierConfig) {
        console.warn(`[UsageAlerts] No tier config for ${tier}`);
        return [];
      }

      const quotas = tierConfig.quotas;

      // Check each metric
      const metrics: UsageMetric[] = ['projects', 'analyses', 'storage_mb', 'ai_queries'];

      for (const metric of metrics) {
        const usage = await this.getUsageForMetric(userId, metric);
        const limit = this.getQuotaLimit(quotas, metric);

        if (limit > 0) { // Skip unlimited quotas (-1 or 0)
          const alert = this.evaluateUsage(userId, metric, usage, limit);
          if (alert) {
            alerts.push(alert);
          }
        }
      }

      // Store alerts and send notifications
      for (const alert of alerts) {
        if (!this.isInCooldown(userId, alert.metric, alert.type)) {
          await this.storeAlert(alert);
          await this.sendNotifications(alert, user);
        }
      }

      return alerts;
    } catch (error) {
      console.error('[UsageAlerts] Error checking usage:', error);
      return [];
    }
  }

  /**
   * Get current usage for a specific metric
   */
  private async getUsageForMetric(userId: string, metric: UsageMetric): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    switch (metric) {
      case 'projects': {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(projects)
          .where(eq(projects.userId, userId));
        return Number(result[0]?.count || 0);
      }

      case 'analyses': {
        // Count analyses run this month from journeyProgress
        const userProjects = await db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.userId, userId),
              gte(projects.updatedAt, startOfMonth)
            )
          );

        let analysisCount = 0;
        for (const project of userProjects) {
          const progress = (project as any).journeyProgress;
          if (progress?.analysisExecutions) {
            analysisCount += progress.analysisExecutions.length;
          }
        }
        return analysisCount;
      }

      case 'storage_mb': {
        // Estimate storage from datasets
        const userProjects = await db
          .select()
          .from(projects)
          .where(eq(projects.userId, userId));

        let totalBytes = 0;
        for (const project of userProjects) {
          const datasets = (project as any).datasets || [];
          for (const ds of datasets) {
            totalBytes += ds.sizeBytes || 0;
          }
        }
        return totalBytes / (1024 * 1024); // Convert to MB
      }

      case 'ai_queries': {
        // P2-6 FIX: Fetch actual AI query usage from tracking service
        try {
          const { UsageTrackingService } = await import('./usage-tracking');
          const usage = await UsageTrackingService.getCurrentUsage(userId);
          return usage.aiQueries || 0;
        } catch {
          return 0;
        }
      }

      default:
        return 0;
    }
  }

  /**
   * Get quota limit from tier config
   */
  private getQuotaLimit(quotas: any, metric: UsageMetric): number {
    const mapping: Record<UsageMetric, string> = {
      'projects': 'maxProjects',
      'analyses': 'maxAnalysesPerMonth',
      'storage_mb': 'maxStorageMB',
      'ai_queries': 'maxAIQueriesPerMonth',
      'data_processing_mb': 'maxDataProcessingMB'
    };

    const key = mapping[metric];
    return quotas?.[key] ?? -1; // -1 = unlimited
  }

  /**
   * Evaluate usage against limits and return alert if threshold exceeded
   */
  private evaluateUsage(
    userId: string,
    metric: UsageMetric,
    current: number,
    limit: number
  ): UsageAlert | null {
    const percentUsed = current / limit;

    let alertType: AlertType | null = null;
    let message = '';

    if (percentUsed >= 1.0) {
      alertType = 'exceeded';
      message = `You have exceeded your ${this.formatMetricName(metric)} limit`;
    } else if (percentUsed >= this.config.criticalThreshold) {
      alertType = 'critical';
      message = `You are at ${Math.round(percentUsed * 100)}% of your ${this.formatMetricName(metric)} limit`;
    } else if (percentUsed >= this.config.warningThreshold) {
      alertType = 'warning';
      message = `You have used ${Math.round(percentUsed * 100)}% of your ${this.formatMetricName(metric)} quota`;
    }

    if (!alertType) {
      return null;
    }

    return {
      id: nanoid(),
      userId,
      metric,
      type: alertType,
      threshold: alertType === 'exceeded' ? 1.0 :
        alertType === 'critical' ? this.config.criticalThreshold :
          this.config.warningThreshold,
      currentUsage: current,
      limit,
      percentUsed,
      message,
      createdAt: new Date(),
      acknowledged: false,
      notificationSent: false
    };
  }

  /**
   * Format metric name for display
   */
  private formatMetricName(metric: UsageMetric): string {
    const names: Record<UsageMetric, string> = {
      'projects': 'Projects',
      'analyses': 'Monthly Analyses',
      'storage_mb': 'Storage',
      'ai_queries': 'AI Queries',
      'data_processing_mb': 'Data Processing'
    };
    return names[metric] || metric;
  }

  /**
   * Check if an alert is in cooldown period
   */
  private isInCooldown(userId: string, metric: UsageMetric, type: AlertType): boolean {
    const userAlerts = alertHistory.get(userId) || [];
    const recentAlert = userAlerts.find(a =>
      a.metric === metric &&
      a.type === type &&
      (Date.now() - a.createdAt.getTime()) < this.config.cooldownMinutes * 60 * 1000
    );
    return !!recentAlert;
  }

  /**
   * Store alert in history
   */
  private async storeAlert(alert: UsageAlert): Promise<void> {
    const userAlerts = alertHistory.get(alert.userId) || [];
    userAlerts.push(alert);

    // Keep only last 100 alerts per user
    if (userAlerts.length > 100) {
      userAlerts.splice(0, userAlerts.length - 100);
    }

    alertHistory.set(alert.userId, userAlerts);

    console.log(`📋 [UsageAlerts] Stored alert: ${alert.type} for ${alert.metric} (${alert.percentUsed * 100}%)`);
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(alert: UsageAlert, user: any): Promise<void> {
    // In-app notification via WebSocket
    if (this.config.inAppEnabled) {
      try {
        const { getMessageBroker } = await import('./agents/message-broker');
        const broker = getMessageBroker();

        broker.emit('usage_alert', {
          type: 'usage_alert',
          projectId: 'system',
          userId: alert.userId,
          agent: 'system',
          timestamp: new Date().toISOString(),
          payload: {
            alert: {
              id: alert.id,
              type: alert.type,
              metric: alert.metric,
              message: alert.message,
              percentUsed: alert.percentUsed,
              currentUsage: alert.currentUsage,
              limit: alert.limit
            }
          }
        });

        console.log(`📬 [UsageAlerts] In-app notification sent for ${alert.metric}`);
      } catch (error) {
        console.warn('[UsageAlerts] Failed to send in-app notification:', error);
      }
    }

    // Email notification
    if (this.config.emailEnabled && user.email) {
      try {
        await this.sendEmailAlert(alert, user.email, user.name || user.email);
        alert.notificationSent = true;
        console.log(`📧 [UsageAlerts] Email sent to ${user.email}`);
      } catch (error) {
        console.warn('[UsageAlerts] Failed to send email notification:', error);
      }
    }
  }

  /**
   * Send email alert via SendGrid
   */
  private async sendEmailAlert(alert: UsageAlert, email: string, name: string): Promise<void> {
    const sgMail = await import('@sendgrid/mail').then(m => m.default);

    if (!process.env.SENDGRID_API_KEY) {
      console.warn('[UsageAlerts] SENDGRID_API_KEY not configured');
      return;
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const subject = alert.type === 'exceeded'
      ? `Action Required: ${this.formatMetricName(alert.metric)} Limit Exceeded`
      : `Usage Alert: ${this.formatMetricName(alert.metric)} at ${Math.round(alert.percentUsed * 100)}%`;

    const urgencyColor = alert.type === 'exceeded' ? '#dc2626' :
      alert.type === 'critical' ? '#f59e0b' : '#3b82f6';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: ${urgencyColor}; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">${alert.type === 'exceeded' ? 'Limit Exceeded' : 'Usage Alert'}</h1>
        </div>
        <div style="padding: 20px; background: #f9fafb;">
          <p>Hi ${name},</p>
          <p>${alert.message}.</p>
          <div style="background: white; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Usage Summary</h3>
            <p><strong>Metric:</strong> ${this.formatMetricName(alert.metric)}</p>
            <p><strong>Current Usage:</strong> ${alert.currentUsage.toLocaleString()}</p>
            <p><strong>Limit:</strong> ${alert.limit.toLocaleString()}</p>
            <p><strong>Percentage Used:</strong> ${Math.round(alert.percentUsed * 100)}%</p>
          </div>
          ${alert.type === 'exceeded' ? `
            <p style="color: ${urgencyColor}; font-weight: bold;">
              Your access to this feature may be restricted until you upgrade your plan.
            </p>
          ` : ''}
          <a href="${process.env.APP_URL || 'https://chimaridata.com'}/pricing"
             style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            View Plans & Upgrade
          </a>
          <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">
            You received this email because your ChimariData account usage has reached a notification threshold.
            To manage your notification preferences, visit your account settings.
          </p>
        </div>
      </div>
    `;

    await sgMail.send({
      to: email,
      from: process.env.FROM_EMAIL || 'noreply@chimaridata.com',
      subject,
      html
    });
  }

  /**
   * Get usage status for all metrics for a user
   */
  async getUserUsageStatus(userId: string): Promise<UsageStatus[]> {
    const billingService = getBillingService();
    const statuses: UsageStatus[] = [];

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) return [];

      const tier = (user as any).subscriptionTier || 'trial';
      const tierConfig = billingService.getTierConfig(tier);
      const quotas = tierConfig?.quotas || {};

      const metrics: UsageMetric[] = ['projects', 'analyses', 'storage_mb'];

      for (const metric of metrics) {
        const current = await this.getUsageForMetric(userId, metric);
        const limit = this.getQuotaLimit(quotas, metric);

        if (limit > 0) {
          const percentUsed = current / limit;
          let status: 'ok' | 'warning' | 'critical' | 'exceeded' = 'ok';

          if (percentUsed >= 1.0) status = 'exceeded';
          else if (percentUsed >= this.config.criticalThreshold) status = 'critical';
          else if (percentUsed >= this.config.warningThreshold) status = 'warning';

          statuses.push({
            metric,
            current,
            limit,
            percentUsed,
            status
          });
        }
      }

      return statuses;
    } catch (error) {
      console.error('[UsageAlerts] Error getting usage status:', error);
      return [];
    }
  }

  /**
   * Get alert history for a user
   */
  getAlertHistory(userId: string, limit: number = 20): UsageAlert[] {
    const userAlerts = alertHistory.get(userId) || [];
    return userAlerts.slice(-limit).reverse(); // Most recent first
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(userId: string, alertId: string): boolean {
    const userAlerts = alertHistory.get(userId) || [];
    const alert = userAlerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('📋 [UsageAlerts] Configuration updated');
  }
}

// Export singleton instance
export const usageAlertsService = new UsageAlertsService();
