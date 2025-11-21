/**
 * Billing Analytics Integration Service
 *
 * Bridges tool analytics with the billing system to enable usage-based billing.
 *
 * Key Features:
 * - Automatic billing based on tool usage
 * - Quota tracking with overage calculation
 * - Real-time cost estimation
 * - Usage-to-billing sync
 */

import { toolAnalyticsService } from './tool-analytics';
import { getBillingService } from './billing/unified-billing-service';
import { FeatureComplexity } from '../../shared/canonical-types';

export interface ToolToBillingMapping {
  toolId: string;
  featureId: string;
  complexityMapping: {
    [key: string]: FeatureComplexity; // Maps tool parameters to complexity
  };
}

/**
 * Maps tools to billing features
 * This allows tool usage to automatically trigger billing events
 */
const TOOL_TO_FEATURE_MAPPING: ToolToBillingMapping[] = [
  {
    toolId: 'statistical_analyzer',
    featureId: 'statistical_analysis',
    complexityMapping: {
      'basic': 'small',
      'intermediate': 'medium',
      'advanced': 'large',
      'expert': 'extra_large'
    }
  },
  {
    toolId: 'ml_pipeline',
    featureId: 'machine_learning',
    complexityMapping: {
      'simple': 'small',
      'standard': 'medium',
      'complex': 'large',
      'enterprise': 'extra_large'
    }
  },
  {
    toolId: 'visualization_engine',
    featureId: 'visualization',
    complexityMapping: {
      'basic': 'small',
      'interactive': 'medium',
      'dashboard': 'large',
      'custom': 'extra_large'
    }
  },
  {
    toolId: 'data_transformer',
    featureId: 'data_upload',
    complexityMapping: {
      'small': 'small',
      'medium': 'medium',
      'large': 'large',
      'xlarge': 'extra_large'
    }
  },
];

export class BillingAnalyticsIntegrationService {
  private billingService = getBillingService();

  /**
   * Record tool usage and automatically bill the user
   * Called after tool execution completes
   */
  async recordToolUsageAndBill(params: {
    userId: string;
    toolId: string;
    complexity: string;
    executionCost: number;
  }): Promise<{
    success: boolean;
    quotaExceeded: boolean;
    cost: number;
    remainingQuota: number;
    message?: string;
  }> {
    try {
      // Find tool-to-feature mapping
      const mapping = TOOL_TO_FEATURE_MAPPING.find(m => m.toolId === params.toolId);

      if (!mapping) {
        console.warn(`[BillingAnalytics] No billing mapping found for tool: ${params.toolId}`);
        return {
          success: true,
          quotaExceeded: false,
          cost: 0,
          remainingQuota: -1,
          message: 'Tool not configured for billing'
        };
      }

      // Map tool complexity to billing complexity
      const billingComplexity = mapping.complexityMapping[params.complexity] as FeatureComplexity;

      if (!billingComplexity) {
        console.warn(`[BillingAnalytics] Unknown complexity "${params.complexity}" for tool ${params.toolId}`);
        return {
          success: true,
          quotaExceeded: false,
          cost: 0,
          remainingQuota: -1,
          message: 'Complexity not mapped to billing'
        };
      }

      // Track feature usage with billing service
      const result = await this.billingService.trackFeatureUsage(
        params.userId,
        mapping.featureId,
        billingComplexity,
        1 // quantity
      );

      if (!result.allowed) {
        console.error(`[BillingAnalytics] Feature usage not allowed: ${result.message}`);
      }

      return {
        success: result.allowed,
        quotaExceeded: result.cost > 0,
        cost: result.cost,
        remainingQuota: result.remainingQuota,
        message: result.message
      };
    } catch (error: any) {
      console.error('[BillingAnalytics] Error recording tool usage:', error);
      return {
        success: false,
        quotaExceeded: false,
        cost: 0,
        remainingQuota: 0,
        message: error.message
      };
    }
  }

  /**
   * Get user's current quota status for a tool
   */
  async getToolQuotaStatus(params: {
    userId: string;
    toolId: string;
    complexity: string;
  }): Promise<{
    allowed: boolean;
    quota: number;
    used: number;
    remaining: number;
    percentUsed: number;
    message?: string;
  }> {
    try {
      const mapping = TOOL_TO_FEATURE_MAPPING.find(m => m.toolId === params.toolId);

      if (!mapping) {
        return {
          allowed: true,
          quota: -1,
          used: 0,
          remaining: -1,
          percentUsed: 0,
          message: 'Tool not configured for quotas'
        };
      }

      const billingComplexity = mapping.complexityMapping[params.complexity] as FeatureComplexity;

      if (!billingComplexity) {
        return {
          allowed: true,
          quota: -1,
          used: 0,
          remaining: -1,
          percentUsed: 0,
          message: 'Complexity not mapped'
        };
      }

      const quotaStatus = await this.billingService.getQuotaStatus(
        params.userId,
        mapping.featureId,
        billingComplexity
      );

      if (!quotaStatus) {
        return {
          allowed: false,
          quota: 0,
          used: 0,
          remaining: 0,
          percentUsed: 0,
          message: 'Unable to retrieve quota status'
        };
      }

      return {
        allowed: !quotaStatus.isExceeded,
        quota: quotaStatus.quota,
        used: quotaStatus.used,
        remaining: quotaStatus.remaining,
        percentUsed: quotaStatus.percentUsed,
        message: quotaStatus.isExceeded ? 'Quota exceeded - overage charges apply' : undefined
      };
    } catch (error: any) {
      console.error('[BillingAnalytics] Error getting quota status:', error);
      return {
        allowed: false,
        quota: 0,
        used: 0,
        remaining: 0,
        percentUsed: 0,
        message: error.message
      };
    }
  }

  /**
   * Sync analytics costs with billing system
   * Should be called periodically (e.g., daily) to ensure analytics and billing are in sync
   */
  async syncAnalyticsWithBilling(userId: string): Promise<{
    success: boolean;
    totalCost: number;
    itemsSynced: number;
    errors: string[];
  }> {
    try {
      // Get user cost breakdown from analytics
  const costBreakdown = await toolAnalyticsService.getUserCostBreakdown(userId);

      const errors: string[] = [];
      let itemsSynced = 0;

      // Process each tool usage
      for (const toolData of costBreakdown.toolBreakdown) {
        const mapping = TOOL_TO_FEATURE_MAPPING.find(m => m.toolId === toolData.toolId);

        if (!mapping) {
          errors.push(`No billing mapping for tool: ${toolData.toolId}`);
          continue;
        }

        // For now, we assume 'medium' complexity for sync
        // In production, this should be tracked per execution
        const billingComplexity: FeatureComplexity = 'medium';

        const result = await this.billingService.trackFeatureUsage(
          userId,
          mapping.featureId,
          billingComplexity,
          toolData.count
        );

        if (result.allowed) {
          itemsSynced++;
        } else {
          errors.push(`Failed to sync ${toolData.toolId}: ${result.message}`);
        }
      }

      return {
        success: errors.length === 0,
        totalCost: costBreakdown.totalCost,
        itemsSynced,
        errors
      };
    } catch (error: any) {
      console.error('[BillingAnalytics] Error syncing analytics with billing:', error);
      return {
        success: false,
        totalCost: 0,
        itemsSynced: 0,
        errors: [error.message]
      };
    }
  }

  /**
   * Get comprehensive usage and billing report for a user
   */
  async getUserUsageAndBillingReport(userId: string, period?: { start: Date; end: Date }): Promise<{
    analytics: {
      totalCost: number;
      executionCount: number;
      toolBreakdown: { toolId: string; cost: number; count: number }[];
    };
    billing: {
      subscriptionTier: string;
      quotasUsed: { [featureId: string]: { used: number; quota: number; percentUsed: number } };
      overageCosts: number;
      totalBilled: number;
    };
    discrepancies: string[];
  }> {
    try {
      // Get analytics data
      const analyticsData = await toolAnalyticsService.getUserCostBreakdown(
        userId,
        period?.start,
        period?.end
      );

      // Get billing usage metrics
      const billingData = await this.billingService.getUsageMetrics(userId, period);

      const discrepancies: string[] = [];

      // Compare analytics vs billing costs
      if (billingData) {
        const analyticsCost = analyticsData.totalCost;
        const billingCost = billingData.costBreakdown.totalCost;
        const difference = Math.abs(analyticsCost - billingCost);

        if (difference > 0.01) {
          discrepancies.push(
            `Cost mismatch: Analytics=$${analyticsCost.toFixed(2)} vs Billing=$${billingCost.toFixed(2)}`
          );
        }
      }

      // Build quota status for each feature
      const quotasUsed: { [featureId: string]: { used: number; quota: number; percentUsed: number } } = {};

      for (const mapping of TOOL_TO_FEATURE_MAPPING) {
        const quotaStatus = await this.billingService.getQuotaStatus(
          userId.toString(),
          mapping.featureId,
          'medium' as FeatureComplexity
        );

        if (quotaStatus) {
          quotasUsed[mapping.featureId] = {
            used: quotaStatus.used,
            quota: quotaStatus.quota,
            percentUsed: quotaStatus.percentUsed
          };
        }
      }

      return {
        analytics: {
          totalCost: analyticsData.totalCost,
          executionCount: analyticsData.executionCount,
          toolBreakdown: analyticsData.toolBreakdown
        },
        billing: {
          subscriptionTier: billingData?.billingPeriod ? 'active' : 'unknown',
          quotasUsed,
          overageCosts: billingData?.costBreakdown.overageCosts || 0,
          totalBilled: billingData?.costBreakdown.totalCost || 0
        },
        discrepancies
      };
    } catch (error: any) {
      console.error('[BillingAnalytics] Error getting usage report:', error);
      throw error;
    }
  }

  /**
   * Check if user can execute a tool based on quota
   * Call this BEFORE tool execution to prevent quota violations
   */
  async canUserExecuteTool(params: {
    userId: string;
    toolId: string;
    complexity: string;
  }): Promise<{
    allowed: boolean;
    willIncurCharge: boolean;
    estimatedCost: number;
    remainingQuota: number;
    message?: string;
  }> {
    const quotaStatus = await this.getToolQuotaStatus(params);

    return {
      allowed: quotaStatus.allowed || quotaStatus.remaining <= 0, // Allow overage
      willIncurCharge: quotaStatus.remaining <= 0,
      estimatedCost: quotaStatus.remaining <= 0 ? 1.00 : 0, // TODO: Calculate real overage cost
      remainingQuota: quotaStatus.remaining,
      message: quotaStatus.message
    };
  }
}

// Export singleton
export const billingAnalyticsIntegration = new BillingAnalyticsIntegrationService();
