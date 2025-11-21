/**
 * MCP Resource: Billing & Analytics Integration
 *
 * Exposes billing and analytics capabilities to agents via MCP,
 * allowing the Project Manager and Billing Agent to:
 * - Track tool usage costs
 * - Monitor quota status
 * - Calculate billing
 * - Generate usage reports
 *
 * This resource is admin-configurable and follows the platform's
 * architecture of making all features configurable via admin UI.
 */

import { EnhancedMCPService } from '../enhanced-mcp-service';
import { MCPResource } from '../mcp-ai-service';
import { toolAnalyticsService } from './tool-analytics';
import { billingAnalyticsIntegration } from './billing-analytics-integration';
import { getBillingService } from './billing/unified-billing-service';

/**
 * Register billing and analytics as MCP resources
 * Agents can use these to track costs and manage billing
 */
export function registerBillingAnalyticsResources(): void {
  console.log('🔧 Registering billing & analytics MCP resources...');

  // ==========================================
  // ANALYTICS RESOURCES
  // ==========================================

  const toolAnalyticsResource: MCPResource = {
    type: 'tool',
    name: 'tool_analytics',
    config: {
      service: 'ToolAnalyticsService',
      description: 'Track and analyze tool execution metrics, costs, and performance',
      category: 'analytics',
      agentAccess: ['project_manager', 'billing_agent', 'admin'],
      methods: {
        getToolAnalytics: {
          description: 'Get analytics for a specific tool',
          params: {
            toolId: 'string',
            timeRange: 'object (optional): { start: Date, end: Date }'
          },
          returns: 'ToolAnalytics object with execution metrics'
        },
        getSystemMetrics: {
          description: 'Get system-wide performance metrics',
          params: {},
          returns: 'SystemMetrics object'
        },
        getUserCostBreakdown: {
          description: 'Get cost breakdown for a user',
          params: {
            userId: 'number',
            startDate: 'Date (optional)',
            endDate: 'Date (optional)'
          },
          returns: 'Cost breakdown by tool and project'
        },
        getPerformanceAlerts: {
          description: 'Get performance alerts for tool execution',
          params: {},
          returns: 'Array of performance alerts'
        }
      }
    },
    permissions: ['read_analytics', 'monitor_system']
  };

  // ==========================================
  // BILLING RESOURCES
  // ==========================================

  const billingResource: MCPResource = {
    type: 'tool',
    name: 'billing_management',
    config: {
      service: 'UnifiedBillingService',
      description: 'Manage subscriptions, quotas, and billing calculations',
      category: 'billing',
      agentAccess: ['project_manager', 'billing_agent', 'admin'],
      methods: {
        getQuotaStatus: {
          description: 'Check quota status for a user and feature',
          params: {
            userId: 'string',
            featureId: 'string',
            complexity: 'FeatureComplexity'
          },
          returns: 'QuotaStatus object'
        },
        trackFeatureUsage: {
          description: 'Record feature usage and calculate billing',
          params: {
            userId: 'string',
            featureId: 'string',
            complexity: 'FeatureComplexity',
            quantity: 'number'
          },
          returns: 'Usage result with cost and remaining quota'
        },
        getUsageMetrics: {
          description: 'Get usage metrics for a user',
          params: {
            userId: 'string',
            period: 'object (optional): { start: Date, end: Date }'
          },
          returns: 'UsageMetrics object with cost breakdown'
        },
        getTierConfig: {
          description: 'Get subscription tier configuration',
          params: {
            tier: 'SubscriptionTier'
          },
          returns: 'AdminSubscriptionTierConfig object'
        }
      }
    },
    permissions: ['read_billing', 'write_billing', 'manage_quotas']
  };

  // ==========================================
  // INTEGRATED BILLING ANALYTICS RESOURCE
  // ==========================================

  const billingAnalyticsResource: MCPResource = {
    type: 'tool',
    name: 'billing_analytics_integration',
    config: {
      service: 'BillingAnalyticsIntegrationService',
      description: 'Bridge between tool analytics and billing for usage-based billing',
      category: 'billing',
      agentAccess: ['project_manager', 'billing_agent'],
      methods: {
        recordToolUsageAndBill: {
          description: 'Record tool usage and automatically calculate billing',
          params: {
            userId: 'string',
            toolId: 'string',
            complexity: 'string',
            executionCost: 'number'
          },
          returns: 'Billing result with quota status and charges'
        },
        getToolQuotaStatus: {
          description: 'Get quota status for a specific tool and complexity',
          params: {
            userId: 'string',
            toolId: 'string',
            complexity: 'string'
          },
          returns: 'Quota status with remaining usage'
        },
        canUserExecuteTool: {
          description: 'Check if user can execute tool (quota check)',
          params: {
            userId: 'string',
            toolId: 'string',
            complexity: 'string'
          },
          returns: 'Permission status with cost estimate'
        },
        getUserUsageAndBillingReport: {
          description: 'Get comprehensive usage and billing report',
          params: {
            userId: 'number',
            period: 'object (optional): { start: Date, end: Date }'
          },
          returns: 'Detailed report with analytics and billing data'
        },
        syncAnalyticsWithBilling: {
          description: 'Sync analytics costs with billing system',
          params: {
            userId: 'number'
          },
          returns: 'Sync result with items processed and errors'
        }
      }
    },
    permissions: ['read_analytics', 'read_billing', 'write_billing']
  };

  // ==========================================
  // COST CALCULATION RESOURCE
  // ==========================================

  const costCalculationResource: MCPResource = {
    type: 'tool',
    name: 'cost_calculator',
    config: {
      service: 'CostCalculationService',
      description: 'Calculate costs for tool execution and project workflows',
      category: 'billing',
      agentAccess: ['project_manager', 'billing_agent', 'data_scientist'],
      methods: {
        estimateToolCost: {
          description: 'Estimate cost for executing a tool',
          params: {
            userId: 'string',
            toolId: 'string',
            complexity: 'string',
            inputSize: 'number (optional)'
          },
          returns: 'Cost estimate with breakdown'
        },
        estimateProjectCost: {
          description: 'Estimate total cost for a project workflow',
          params: {
            userId: 'string',
            workflow: 'array of tool executions'
          },
          returns: 'Total cost estimate with per-tool breakdown'
        },
        getQuotaImpact: {
          description: 'Calculate quota impact of executing tools',
          params: {
            userId: 'string',
            toolExecutions: 'array of {toolId, complexity}'
          },
          returns: 'Quota impact analysis'
        }
      }
    },
    permissions: ['read_billing', 'read_analytics']
  };

  // Register all resources with MCP
  EnhancedMCPService.addResource(toolAnalyticsResource);
  EnhancedMCPService.addResource(billingResource);
  EnhancedMCPService.addResource(billingAnalyticsResource);
  EnhancedMCPService.addResource(costCalculationResource);

  console.log('✅ Billing & analytics MCP resources registered');
  console.log('   - tool_analytics: Tool execution metrics and performance');
  console.log('   - billing_management: Subscription and quota management');
  console.log('   - billing_analytics_integration: Automated usage-based billing');
  console.log('   - cost_calculator: Cost estimation and quota planning');
}

/**
 * Agent handlers for billing & analytics operations
 * These are called by agents through MCP
 */
export const billingAnalyticHandlers = {
  /**
   * Get tool analytics (callable by agents via MCP)
   */
  async getToolAnalytics(params: { toolId: string; timeRange?: { start: Date; end: Date } }) {
    return await toolAnalyticsService.getToolAnalytics(params.toolId, params.timeRange);
  },

  /**
   * Get system metrics (callable by agents via MCP)
   */
  async getSystemMetrics() {
    return await toolAnalyticsService.getSystemMetrics();
  },

  /**
   * Get user cost breakdown (callable by agents via MCP)
   */
  async getUserCostBreakdown(params: { userId: string; startDate?: Date; endDate?: Date }) {
    return await toolAnalyticsService.getUserCostBreakdown(
      params.userId,
      params.startDate,
      params.endDate
    );
  },

  /**
   * Check quota status (callable by agents via MCP)
   */
  async getQuotaStatus(params: { userId: string; featureId: string; complexity: any }) {
    return await getBillingService().getQuotaStatus(
      params.userId,
      params.featureId,
      params.complexity
    );
  },

  /**
   * Track feature usage (callable by agents via MCP)
   */
  async trackFeatureUsage(params: {
    userId: string;
    featureId: string;
    complexity: any;
    quantity: number
  }) {
    return await getBillingService().trackFeatureUsage(
      params.userId,
      params.featureId,
      params.complexity,
      params.quantity
    );
  },

  /**
   * Get usage metrics (callable by agents via MCP)
   */
  async getUsageMetrics(params: { userId: string; period?: { start: Date; end: Date } }) {
    return await getBillingService().getUsageMetrics(params.userId, params.period);
  },

  /**
   * Check if user can execute tool (callable by agents via MCP)
   */
  async canUserExecuteTool(params: { userId: string; toolId: string; complexity: string }) {
    return await billingAnalyticsIntegration.canUserExecuteTool(params);
  },

  /**
   * Record tool usage and bill (callable by agents via MCP)
   */
  async recordToolUsageAndBill(params: {
    userId: string;
    toolId: string;
    complexity: string;
    executionCost: number;
  }) {
    return await billingAnalyticsIntegration.recordToolUsageAndBill(params);
  },

  /**
   * Get comprehensive usage and billing report (callable by agents via MCP)
   */
  async getUserUsageAndBillingReport(params: {
    userId: string;
    period?: { start: Date; end: Date }
  }) {
    return await billingAnalyticsIntegration.getUserUsageAndBillingReport(
      params.userId,
      params.period
    );
  },

  /**
   * Sync analytics with billing (callable by agents via MCP)
   */
  async syncAnalyticsWithBilling(params: { userId: string }) {
    return await billingAnalyticsIntegration.syncAnalyticsWithBilling(params.userId);
  },

  /**
   * Get tier configuration (callable by agents via MCP)
   */
  async getTierConfig(params: { tier: any }) {
    return getBillingService().getTierConfig(params.tier);
  },

  /**
   * Estimate tool execution cost (callable by agents via MCP)
   */
  async estimateToolCost(params: {
    userId: string;
    toolId: string;
    complexity: string;
    inputSize?: number;
  }): Promise<{
    estimatedCost: number;
    willUseQuota: boolean;
    quotaRemaining: number;
    overageCost: number;
  }> {
    const quotaStatus = await billingAnalyticsIntegration.getToolQuotaStatus(params);

    return {
      estimatedCost: quotaStatus.remaining > 0 ? 0 : 1.0, // TODO: Calculate real cost
      willUseQuota: quotaStatus.remaining > 0,
      quotaRemaining: quotaStatus.remaining,
      overageCost: quotaStatus.remaining > 0 ? 0 : 1.0
    };
  }
};

/**
 * Initialize billing & analytics MCP integration
 * Called during server startup
 */
export function initializeBillingAnalyticsMCP(): void {
  console.log('🚀 Initializing billing & analytics MCP integration...');

  // Register MCP resources
  registerBillingAnalyticsResources();

  // Register handlers with MCP service
  // These handlers will be callable by agents
  const mcpService = EnhancedMCPService;

  // Make handlers accessible to agents
  (mcpService as any).billingAnalyticsHandlers = billingAnalyticHandlers;

  console.log('✅ Billing & analytics MCP integration initialized');
}
