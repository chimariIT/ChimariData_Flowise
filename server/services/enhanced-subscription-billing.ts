// server/services/enhanced-subscription-billing.ts
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';

export interface UsageMetrics {
  userId: string;
  subscriptionTier: string;
  billingPeriod: {
    start: Date;
    end: Date;
    status: 'active' | 'completed' | 'overdue';
  };
  dataUsage: {
    totalFilesUploaded: number;
    totalFileSizeMB: number;
    totalDataProcessedMB: number;
    storageUsedMB: number;
    maxFileSize: number;
    fileFormats: Record<string, number>; // format -> count
    dataTransformations: number;
    dataExports: number;
  };
  computeUsage: {
    analysisCount: number;
    aiQueryCount: number;
    mlModelExecutions: number;
    visualizationCount: number;
    totalComputeMinutes: number;
    agentInteractions: number;
    toolExecutions: number;
  };
  storageMetrics: {
    projectCount: number;
    datasetCount: number;
    artifactCount: number;
    totalStorageMB: number;
    archiveStorageMB: number;
    temporaryStorageMB: number;
    retentionDays: number;
  };
  networkUsage: {
    apiCalls: number;
    dataTransferMB: number;
    webhookDeliveries: number;
    externalIntegrations: number;
  };
  collaborationMetrics: {
    projectShares: number;
    teamMembers: number;
    collaboratorInvites: number;
    exportShares: number;
  };
  costBreakdown: {
    baseSubscription: number;
    dataOverage: number;
    computeOverage: number;
    storageOverage: number;
    premiumFeatures: number;
    agentUsage: number;
    toolUsage: number;
    totalCost: number;
  };
  quotaUtilization: {
    dataQuotaUsed: number;
    dataQuotaLimit: number;
    computeQuotaUsed: number;
    computeQuotaLimit: number;
    storageQuotaUsed: number;
    storageQuotaLimit: number;
    quotaResetDate: Date;
  };
}

export interface SubscriptionTier {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  limits: {
    maxFilesSizeMB: number;
    maxStorageMB: number;
    maxDataProcessingMB: number;
    maxComputeMinutes: number;
    maxProjects: number;
    maxTeamMembers: number;
    maxApiCalls: number;
    maxAgentInteractions: number;
    maxToolExecutions: number;
    retentionDays: number;
  };
  overagePricing: {
    dataPerMB: number;
    computePerMinute: number;
    storagePerMB: number;
    apiCallsPer1000: number;
    agentInteractionCost: number;
    toolExecutionCost: number;
  };
  discounts: {
    dataProcessingDiscount: number; // percentage
    agentUsageDiscount: number;
    toolUsageDiscount: number;
    enterpriseDiscount: number;
  };
  support: {
    level: 'community' | 'email' | 'priority' | 'dedicated';
    responseTime: string;
    channels: string[];
  };
  compliance: {
    dataResidency: string[];
    certifications: string[];
    sla: number; // uptime percentage
  };
}

export interface BillingEvent {
  id: string;
  userId: string;
  type: 'usage' | 'subscription_change' | 'payment' | 'overage' | 'quota_warning';
  category: 'data' | 'compute' | 'storage' | 'agent' | 'tool' | 'collaboration';
  description: string;
  amount?: number;
  quantity: number;
  unit: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

export interface QuotaAlert {
  id: string;
  userId: string;
  quotaType: 'data' | 'compute' | 'storage' | 'api' | 'agent' | 'tool';
  currentUsage: number;
  quotaLimit: number;
  utilizationPercent: number;
  alertLevel: 'warning' | 'critical' | 'exceeded';
  message: string;
  actionRequired: boolean;
  suggestedActions: string[];
  timestamp: Date;
  acknowledged: boolean;
}

export interface UsageProjection {
  userId: string;
  billingPeriod: {
    current: Date;
    next: Date;
  };
  projectedUsage: {
    dataUsageMB: number;
    computeMinutes: number;
    storageUsageMB: number;
    agentInteractions: number;
    toolExecutions: number;
  };
  projectedCosts: {
    baseCost: number;
    overageCosts: number;
    totalProjected: number;
    confidenceLevel: number;
  };
  recommendations: {
    shouldUpgrade: boolean;
    shouldDowngrade: boolean;
    suggestedTier?: string;
    potentialSavings: number;
    reasoning: string[];
  };
}

export class EnhancedSubscriptionBilling extends EventEmitter {
  private usageMetrics: Map<string, UsageMetrics> = new Map();
  private billingEvents: Map<string, BillingEvent[]> = new Map();
  private quotaAlerts: Map<string, QuotaAlert[]> = new Map();
  private subscriptionTiers: Map<string, SubscriptionTier> = new Map();
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.initializeSubscriptionTiers();
    this.startUsageMonitoring();
    console.log('💰 Enhanced Subscription Billing System initialized');
  }

  private initializeSubscriptionTiers(): void {
    const tiers: SubscriptionTier[] = [
      {
        id: 'trial',
        name: 'trial',
        displayName: 'Free Trial',
        monthlyPrice: 0,
        yearlyPrice: 0,
        description: 'Perfect for getting started with basic data analysis',
        features: [
          'Up to 100MB data processing',
          '500MB storage',
          'Basic analysis tools',
          '50 AI queries',
          'Community support',
          '3 projects',
          'Basic agents',
          'Standard tools'
        ],
        limits: {
          maxFilesSizeMB: 100,
          maxStorageMB: 500,
          maxDataProcessingMB: 100,
          maxComputeMinutes: 60,
          maxProjects: 3,
          maxTeamMembers: 1,
          maxApiCalls: 1000,
          maxAgentInteractions: 50,
          maxToolExecutions: 100,
          retentionDays: 30
        },
        overagePricing: {
          dataPerMB: 0.01,
          computePerMinute: 0.05,
          storagePerMB: 0.002,
          apiCallsPer1000: 0.50,
          agentInteractionCost: 0.02,
          toolExecutionCost: 0.01
        },
        discounts: {
          dataProcessingDiscount: 0,
          agentUsageDiscount: 0,
          toolUsageDiscount: 0,
          enterpriseDiscount: 0
        },
        support: {
          level: 'community',
          responseTime: '48-72 hours',
          channels: ['documentation', 'community_forum']
        },
        compliance: {
          dataResidency: ['US'],
          certifications: ['SOC2'],
          sla: 99.0
        }
      },
      {
        id: 'starter',
        name: 'starter',
        displayName: 'Starter',
        monthlyPrice: 29,
        yearlyPrice: 290,
        description: 'For individuals and small teams starting their data journey',
        features: [
          'Up to 5GB data processing',
          '25GB storage',
          'Advanced analysis tools',
          '1,000 AI queries',
          'Email support',
          '10 projects',
          'All standard agents',
          'Premium tools access',
          'Basic collaboration'
        ],
        limits: {
          maxFilesSizeMB: 5000,
          maxStorageMB: 25000,
          maxDataProcessingMB: 5000,
          maxComputeMinutes: 500,
          maxProjects: 10,
          maxTeamMembers: 3,
          maxApiCalls: 10000,
          maxAgentInteractions: 1000,
          maxToolExecutions: 2000,
          retentionDays: 90
        },
        overagePricing: {
          dataPerMB: 0.008,
          computePerMinute: 0.04,
          storagePerMB: 0.0015,
          apiCallsPer1000: 0.40,
          agentInteractionCost: 0.015,
          toolExecutionCost: 0.008
        },
        discounts: {
          dataProcessingDiscount: 10,
          agentUsageDiscount: 5,
          toolUsageDiscount: 5,
          enterpriseDiscount: 0
        },
        support: {
          level: 'email',
          responseTime: '24-48 hours',
          channels: ['email', 'documentation', 'tutorials']
        },
        compliance: {
          dataResidency: ['US', 'EU'],
          certifications: ['SOC2', 'GDPR'],
          sla: 99.5
        }
      },
      {
        id: 'professional',
        name: 'professional',
        displayName: 'Professional',
        monthlyPrice: 99,
        yearlyPrice: 990,
        description: 'For growing teams with advanced analytics needs',
        features: [
          'Up to 50GB data processing',
          '500GB storage',
          'Premium analysis suite',
          '10,000 AI queries',
          'Priority support',
          '50 projects',
          'All agents + specialists',
          'All tools + custom tools',
          'Advanced collaboration',
          'API access',
          'White-label options'
        ],
        limits: {
          maxFilesSizeMB: 50000,
          maxStorageMB: 500000,
          maxDataProcessingMB: 50000,
          maxComputeMinutes: 5000,
          maxProjects: 50,
          maxTeamMembers: 15,
          maxApiCalls: 100000,
          maxAgentInteractions: 10000,
          maxToolExecutions: 25000,
          retentionDays: 365
        },
        overagePricing: {
          dataPerMB: 0.005,
          computePerMinute: 0.03,
          storagePerMB: 0.001,
          apiCallsPer1000: 0.25,
          agentInteractionCost: 0.01,
          toolExecutionCost: 0.005
        },
        discounts: {
          dataProcessingDiscount: 20,
          agentUsageDiscount: 15,
          toolUsageDiscount: 15,
          enterpriseDiscount: 5
        },
        support: {
          level: 'priority',
          responseTime: '4-12 hours',
          channels: ['phone', 'email', 'chat', 'dedicated_slack']
        },
        compliance: {
          dataResidency: ['US', 'EU', 'APAC'],
          certifications: ['SOC2', 'GDPR', 'HIPAA', 'ISO27001'],
          sla: 99.8
        }
      },
      {
        id: 'enterprise',
        name: 'enterprise',
        displayName: 'Enterprise',
        monthlyPrice: 299,
        yearlyPrice: 2990,
        description: 'For large organizations with enterprise requirements',
        features: [
          'Unlimited data processing',
          'Unlimited storage',
          'Enterprise analysis suite',
          'Unlimited AI queries',
          'Dedicated support',
          'Unlimited projects',
          'Custom agents',
          'Custom tools + integrations',
          'Enterprise collaboration',
          'Full API access',
          'Custom white-label',
          'On-premise deployment',
          'Custom SLA'
        ],
        limits: {
          maxFilesSizeMB: -1, // unlimited
          maxStorageMB: -1,
          maxDataProcessingMB: -1,
          maxComputeMinutes: -1,
          maxProjects: -1,
          maxTeamMembers: -1,
          maxApiCalls: -1,
          maxAgentInteractions: -1,
          maxToolExecutions: -1,
          retentionDays: -1 // custom
        },
        overagePricing: {
          dataPerMB: 0.002,
          computePerMinute: 0.02,
          storagePerMB: 0.0005,
          apiCallsPer1000: 0.10,
          agentInteractionCost: 0.005,
          toolExecutionCost: 0.002
        },
        discounts: {
          dataProcessingDiscount: 30,
          agentUsageDiscount: 25,
          toolUsageDiscount: 25,
          enterpriseDiscount: 15
        },
        support: {
          level: 'dedicated',
          responseTime: '1-4 hours',
          channels: ['dedicated_phone', 'dedicated_email', 'slack_connect', 'teams', 'custom']
        },
        compliance: {
          dataResidency: ['US', 'EU', 'APAC', 'custom'],
          certifications: ['SOC2', 'GDPR', 'HIPAA', 'ISO27001', 'FedRAMP', 'custom'],
          sla: 99.95
        }
      }
    ];

    tiers.forEach(tier => {
      this.subscriptionTiers.set(tier.id, tier);
    });
  }

  /**
   * Track data usage events (file uploads, processing, storage)
   */
  async trackDataUsage(userId: string, event: {
    type: 'file_upload' | 'data_processing' | 'storage_change' | 'export';
    fileSizeMB?: number;
    dataProcessedMB?: number;
    storageChangeMB?: number;
    fileFormat?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const metrics = await this.getUserMetrics(userId);
    const billingEvent: BillingEvent = {
      id: `event_${nanoid()}`,
      userId,
      type: 'usage',
      category: 'data',
      description: `Data usage: ${event.type}`,
      quantity: event.fileSizeMB || event.dataProcessedMB || event.storageChangeMB || 0,
      unit: 'MB',
      metadata: event.metadata || {},
      timestamp: new Date(),
      processed: false
    };

    // Update usage metrics
    switch (event.type) {
      case 'file_upload':
        if (event.fileSizeMB) {
          metrics.dataUsage.totalFilesUploaded += 1;
          metrics.dataUsage.totalFileSizeMB += event.fileSizeMB;
          metrics.dataUsage.maxFileSize = Math.max(metrics.dataUsage.maxFileSize, event.fileSizeMB);
          
          if (event.fileFormat) {
            metrics.dataUsage.fileFormats[event.fileFormat] = 
              (metrics.dataUsage.fileFormats[event.fileFormat] || 0) + 1;
          }

          billingEvent.amount = this.calculateDataCost(userId, event.fileSizeMB);
        }
        break;

      case 'data_processing':
        if (event.dataProcessedMB) {
          metrics.dataUsage.totalDataProcessedMB += event.dataProcessedMB;
          metrics.dataUsage.dataTransformations += 1;
          billingEvent.amount = this.calculateDataCost(userId, event.dataProcessedMB);
        }
        break;

      case 'storage_change':
        if (event.storageChangeMB) {
          metrics.dataUsage.storageUsedMB += event.storageChangeMB;
          metrics.storageMetrics.totalStorageMB += event.storageChangeMB;
          billingEvent.amount = this.calculateStorageCost(userId, event.storageChangeMB);
        }
        break;

      case 'export':
        metrics.dataUsage.dataExports += 1;
        metrics.collaborationMetrics.exportShares += 1;
        break;
    }

    // Store billing event
    if (!this.billingEvents.has(userId)) {
      this.billingEvents.set(userId, []);
    }
    this.billingEvents.get(userId)!.push(billingEvent);

    // Update usage metrics
    this.usageMetrics.set(userId, metrics);

    // Check quotas
    await this.checkQuotas(userId);

    this.emit('dataUsageTracked', { userId, event, billingEvent });
  }

  /**
   * Track compute usage (AI queries, analysis, agent interactions)
   */
  async trackComputeUsage(userId: string, event: {
    type: 'ai_query' | 'analysis' | 'ml_execution' | 'visualization' | 'agent_interaction' | 'tool_execution';
    computeMinutes?: number;
    queryCount?: number;
    agentId?: string;
    toolId?: string;
    complexity?: 'low' | 'medium' | 'high';
    metadata?: Record<string, any>;
  }): Promise<void> {
    const metrics = await this.getUserMetrics(userId);
    const billingEvent: BillingEvent = {
      id: `event_${nanoid()}`,
      userId,
      type: 'usage',
      category: 'compute',
      description: `Compute usage: ${event.type}`,
      quantity: event.computeMinutes || event.queryCount || 1,
      unit: event.computeMinutes ? 'minutes' : 'count',
      metadata: {
        ...event.metadata,
        agentId: event.agentId,
        toolId: event.toolId,
        complexity: event.complexity
      },
      timestamp: new Date(),
      processed: false
    };

    // Update usage metrics
    switch (event.type) {
      case 'ai_query':
        metrics.computeUsage.aiQueryCount += event.queryCount || 1;
        billingEvent.amount = this.calculateAIQueryCost(userId, event.queryCount || 1, event.complexity);
        break;

      case 'analysis':
        metrics.computeUsage.analysisCount += 1;
        if (event.computeMinutes) {
          metrics.computeUsage.totalComputeMinutes += event.computeMinutes;
          billingEvent.amount = this.calculateComputeCost(userId, event.computeMinutes);
        }
        break;

      case 'ml_execution':
        metrics.computeUsage.mlModelExecutions += 1;
        if (event.computeMinutes) {
          metrics.computeUsage.totalComputeMinutes += event.computeMinutes;
          billingEvent.amount = this.calculateComputeCost(userId, event.computeMinutes);
        }
        break;

      case 'visualization':
        metrics.computeUsage.visualizationCount += 1;
        break;

      case 'agent_interaction':
        metrics.computeUsage.agentInteractions += 1;
        billingEvent.category = 'agent';
        billingEvent.amount = this.calculateAgentCost(userId, event.agentId, event.complexity);
        break;

      case 'tool_execution':
        metrics.computeUsage.toolExecutions += 1;
        billingEvent.category = 'tool';
        billingEvent.amount = this.calculateToolCost(userId, event.toolId, event.complexity);
        break;
    }

    // Store billing event
    if (!this.billingEvents.has(userId)) {
      this.billingEvents.set(userId, []);
    }
    this.billingEvents.get(userId)!.push(billingEvent);

    // Update usage metrics
    this.usageMetrics.set(userId, metrics);

    // Check quotas
    await this.checkQuotas(userId);

    this.emit('computeUsageTracked', { userId, event, billingEvent });
  }

  /**
   * Track collaboration and network usage
   */
  async trackCollaborationUsage(userId: string, event: {
    type: 'project_share' | 'team_invite' | 'api_call' | 'webhook' | 'integration';
    count?: number;
    dataTransferMB?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const metrics = await this.getUserMetrics(userId);
    
    switch (event.type) {
      case 'project_share':
        metrics.collaborationMetrics.projectShares += event.count || 1;
        break;
      case 'team_invite':
        metrics.collaborationMetrics.collaboratorInvites += event.count || 1;
        break;
      case 'api_call':
        metrics.networkUsage.apiCalls += event.count || 1;
        break;
      case 'webhook':
        metrics.networkUsage.webhookDeliveries += event.count || 1;
        break;
      case 'integration':
        metrics.networkUsage.externalIntegrations += event.count || 1;
        break;
    }

    if (event.dataTransferMB) {
      metrics.networkUsage.dataTransferMB += event.dataTransferMB;
    }

    this.usageMetrics.set(userId, metrics);
    await this.checkQuotas(userId);

    this.emit('collaborationUsageTracked', { userId, event });
  }

  /**
   * Get comprehensive usage metrics for a user
   */
  async getUserMetrics(userId: string): Promise<UsageMetrics> {
    if (!this.usageMetrics.has(userId)) {
      // Initialize metrics for new user
      const now = new Date();
      const billingPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const billingPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const initialMetrics: UsageMetrics = {
        userId,
        subscriptionTier: 'trial', // Default to trial
        billingPeriod: {
          start: billingPeriodStart,
          end: billingPeriodEnd,
          status: 'active'
        },
        dataUsage: {
          totalFilesUploaded: 0,
          totalFileSizeMB: 0,
          totalDataProcessedMB: 0,
          storageUsedMB: 0,
          maxFileSize: 0,
          fileFormats: {},
          dataTransformations: 0,
          dataExports: 0
        },
        computeUsage: {
          analysisCount: 0,
          aiQueryCount: 0,
          mlModelExecutions: 0,
          visualizationCount: 0,
          totalComputeMinutes: 0,
          agentInteractions: 0,
          toolExecutions: 0
        },
        storageMetrics: {
          projectCount: 0,
          datasetCount: 0,
          artifactCount: 0,
          totalStorageMB: 0,
          archiveStorageMB: 0,
          temporaryStorageMB: 0,
          retentionDays: 30
        },
        networkUsage: {
          apiCalls: 0,
          dataTransferMB: 0,
          webhookDeliveries: 0,
          externalIntegrations: 0
        },
        collaborationMetrics: {
          projectShares: 0,
          teamMembers: 1,
          collaboratorInvites: 0,
          exportShares: 0
        },
        costBreakdown: {
          baseSubscription: 0,
          dataOverage: 0,
          computeOverage: 0,
          storageOverage: 0,
          premiumFeatures: 0,
          agentUsage: 0,
          toolUsage: 0,
          totalCost: 0
        },
        quotaUtilization: {
          dataQuotaUsed: 0,
          dataQuotaLimit: 100, // Default trial limit
          computeQuotaUsed: 0,
          computeQuotaLimit: 60,
          storageQuotaUsed: 0,
          storageQuotaLimit: 500,
          quotaResetDate: billingPeriodEnd
        }
      };

      this.usageMetrics.set(userId, initialMetrics);
    }

    return this.usageMetrics.get(userId)!;
  }

  /**
   * Calculate cost for data usage based on user's subscription
   */
  private calculateDataCost(userId: string, dataMB: number): number {
    const metrics = this.usageMetrics.get(userId);
    if (!metrics) return 0;

    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return 0;

    // Check if within quota
    const currentDataUsage = metrics.dataUsage.totalDataProcessedMB + metrics.dataUsage.totalFileSizeMB;
    const dataQuota = tier.limits.maxDataProcessingMB;
    
    if (dataQuota === -1) return 0; // Unlimited

    const overage = Math.max(0, (currentDataUsage + dataMB) - dataQuota);
    const overageCost = overage * tier.overagePricing.dataPerMB;
    
    // Apply discounts
    const discountedCost = overageCost * (1 - tier.discounts.dataProcessingDiscount / 100);
    
    return Math.round(discountedCost * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Calculate cost for compute usage
   */
  private calculateComputeCost(userId: string, computeMinutes: number): number {
    const metrics = this.usageMetrics.get(userId);
    if (!metrics) return 0;

    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return 0;

    const currentComputeUsage = metrics.computeUsage.totalComputeMinutes;
    const computeQuota = tier.limits.maxComputeMinutes;
    
    if (computeQuota === -1) return 0; // Unlimited

    const overage = Math.max(0, (currentComputeUsage + computeMinutes) - computeQuota);
    const overageCost = overage * tier.overagePricing.computePerMinute;
    
    return Math.round(overageCost * 10000) / 10000;
  }

  /**
   * Calculate cost for AI query usage
   */
  private calculateAIQueryCost(userId: string, queryCount: number, complexity?: string): number {
    const baseCompute = queryCount * (complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1);
    return this.calculateComputeCost(userId, baseCompute);
  }

  /**
   * Calculate cost for agent interaction
   */
  private calculateAgentCost(userId: string, agentId?: string, complexity?: string): number {
    const metrics = this.usageMetrics.get(userId);
    if (!metrics) return 0;

    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return 0;

    const baseCost = tier.overagePricing.agentInteractionCost;
    const complexityMultiplier = complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1;
    const cost = baseCost * complexityMultiplier;
    
    // Apply agent usage discount
    const discountedCost = cost * (1 - tier.discounts.agentUsageDiscount / 100);
    
    return Math.round(discountedCost * 10000) / 10000;
  }

  /**
   * Calculate cost for tool execution
   */
  private calculateToolCost(userId: string, toolId?: string, complexity?: string): number {
    const metrics = this.usageMetrics.get(userId);
    if (!metrics) return 0;

    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return 0;

    const baseCost = tier.overagePricing.toolExecutionCost;
    const complexityMultiplier = complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1;
    const cost = baseCost * complexityMultiplier;
    
    // Apply tool usage discount
    const discountedCost = cost * (1 - tier.discounts.toolUsageDiscount / 100);
    
    return Math.round(discountedCost * 10000) / 10000;
  }

  /**
   * Calculate cost for storage usage
   */
  private calculateStorageCost(userId: string, storageMB: number): number {
    const metrics = this.usageMetrics.get(userId);
    if (!metrics) return 0;

    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return 0;

    const currentStorageUsage = metrics.storageMetrics.totalStorageMB;
    const storageQuota = tier.limits.maxStorageMB;
    
    if (storageQuota === -1) return 0; // Unlimited

    const overage = Math.max(0, (currentStorageUsage + storageMB) - storageQuota);
    const overageCost = overage * tier.overagePricing.storagePerMB;
    
    return Math.round(overageCost * 10000) / 10000;
  }

  /**
   * Check quotas and generate alerts
   */
  private async checkQuotas(userId: string): Promise<void> {
    const metrics = await this.getUserMetrics(userId);
    const tier = this.subscriptionTiers.get(metrics.subscriptionTier);
    if (!tier) return;

    const alerts: QuotaAlert[] = [];

    // Check data quota
    const dataUsage = metrics.dataUsage.totalDataProcessedMB + metrics.dataUsage.totalFileSizeMB;
    if (tier.limits.maxDataProcessingMB > 0) {
      const dataUtilization = (dataUsage / tier.limits.maxDataProcessingMB) * 100;
      
      if (dataUtilization >= 100) {
        alerts.push(this.createQuotaAlert(userId, 'data', dataUsage, tier.limits.maxDataProcessingMB, 'exceeded'));
      } else if (dataUtilization >= 90) {
        alerts.push(this.createQuotaAlert(userId, 'data', dataUsage, tier.limits.maxDataProcessingMB, 'critical'));
      } else if (dataUtilization >= 75) {
        alerts.push(this.createQuotaAlert(userId, 'data', dataUsage, tier.limits.maxDataProcessingMB, 'warning'));
      }
    }

    // Check compute quota
    if (tier.limits.maxComputeMinutes > 0) {
      const computeUtilization = (metrics.computeUsage.totalComputeMinutes / tier.limits.maxComputeMinutes) * 100;
      
      if (computeUtilization >= 100) {
        alerts.push(this.createQuotaAlert(userId, 'compute', metrics.computeUsage.totalComputeMinutes, tier.limits.maxComputeMinutes, 'exceeded'));
      } else if (computeUtilization >= 90) {
        alerts.push(this.createQuotaAlert(userId, 'compute', metrics.computeUsage.totalComputeMinutes, tier.limits.maxComputeMinutes, 'critical'));
      } else if (computeUtilization >= 75) {
        alerts.push(this.createQuotaAlert(userId, 'compute', metrics.computeUsage.totalComputeMinutes, tier.limits.maxComputeMinutes, 'warning'));
      }
    }

    // Check storage quota
    if (tier.limits.maxStorageMB > 0) {
      const storageUtilization = (metrics.storageMetrics.totalStorageMB / tier.limits.maxStorageMB) * 100;
      
      if (storageUtilization >= 100) {
        alerts.push(this.createQuotaAlert(userId, 'storage', metrics.storageMetrics.totalStorageMB, tier.limits.maxStorageMB, 'exceeded'));
      } else if (storageUtilization >= 90) {
        alerts.push(this.createQuotaAlert(userId, 'storage', metrics.storageMetrics.totalStorageMB, tier.limits.maxStorageMB, 'critical'));
      } else if (storageUtilization >= 75) {
        alerts.push(this.createQuotaAlert(userId, 'storage', metrics.storageMetrics.totalStorageMB, tier.limits.maxStorageMB, 'warning'));
      }
    }

    // Store alerts
    if (alerts.length > 0) {
      this.quotaAlerts.set(userId, alerts);
      
      alerts.forEach(alert => {
        this.emit('quotaAlert', { userId, alert });
      });
    }
  }

  private createQuotaAlert(userId: string, quotaType: string, currentUsage: number, quotaLimit: number, alertLevel: string): QuotaAlert {
    const utilizationPercent = (currentUsage / quotaLimit) * 100;
    
    return {
      id: `alert_${nanoid()}`,
      userId,
      quotaType: quotaType as any,
      currentUsage,
      quotaLimit,
      utilizationPercent,
      alertLevel: alertLevel as any,
      message: this.getQuotaAlertMessage(quotaType, alertLevel, utilizationPercent),
      actionRequired: alertLevel === 'exceeded',
      suggestedActions: this.getQuotaAlertActions(quotaType, alertLevel),
      timestamp: new Date(),
      acknowledged: false
    };
  }

  private getQuotaAlertMessage(quotaType: string, alertLevel: string, utilizationPercent: number): string {
    const typeDisplay = quotaType.charAt(0).toUpperCase() + quotaType.slice(1);
    
    switch (alertLevel) {
      case 'warning':
        return `${typeDisplay} usage is at ${utilizationPercent.toFixed(1)}% of your quota limit.`;
      case 'critical':
        return `${typeDisplay} usage is at ${utilizationPercent.toFixed(1)}% of your quota limit. Consider upgrading soon.`;
      case 'exceeded':
        return `${typeDisplay} quota exceeded! You are now incurring overage charges.`;
      default:
        return `${typeDisplay} quota alert at ${utilizationPercent.toFixed(1)}% usage.`;
    }
  }

  private getQuotaAlertActions(quotaType: string, alertLevel: string): string[] {
    const baseActions = [
      'Review your current usage patterns',
      'Consider upgrading to a higher tier',
      'Contact support for assistance'
    ];

    const typeSpecificActions: Record<string, string[]> = {
      data: [
        'Optimize your data processing workflows',
        'Remove unnecessary datasets',
        'Use data compression techniques'
      ],
      compute: [
        'Optimize your analysis queries',
        'Use more efficient algorithms',
        'Schedule heavy computations during off-peak hours'
      ],
      storage: [
        'Archive old projects and datasets',
        'Clean up temporary files',
        'Use external storage for large files'
      ]
    };

    return [...baseActions, ...(typeSpecificActions[quotaType] || [])];
  }

  /**
   * Generate usage projections and recommendations
   */
  async generateUsageProjection(userId: string): Promise<UsageProjection> {
    const metrics = await this.getUserMetrics(userId);
    const billingEvents = this.billingEvents.get(userId) || [];
    
    // Calculate usage trends over the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentEvents = billingEvents.filter(event => event.timestamp >= thirtyDaysAgo);
    
    // Simple linear projection (in reality, you'd use more sophisticated algorithms)
    const dailyDataUsage = recentEvents
      .filter(e => e.category === 'data')
      .reduce((sum, e) => sum + e.quantity, 0) / 30;
    
    const dailyComputeUsage = recentEvents
      .filter(e => e.category === 'compute')
      .reduce((sum, e) => sum + e.quantity, 0) / 30;

    const daysUntilBillingEnd = Math.ceil(
      (metrics.billingPeriod.end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );

    const projectedDataUsage = metrics.dataUsage.totalDataProcessedMB + (dailyDataUsage * daysUntilBillingEnd);
    const projectedComputeUsage = metrics.computeUsage.totalComputeMinutes + (dailyComputeUsage * daysUntilBillingEnd);

    // Calculate projected costs
    const tier = this.subscriptionTiers.get(metrics.subscriptionTier)!;
    const baseCost = tier.monthlyPrice;
    
    const dataOverage = Math.max(0, projectedDataUsage - (tier.limits.maxDataProcessingMB || 0));
    const computeOverage = Math.max(0, projectedComputeUsage - (tier.limits.maxComputeMinutes || 0));
    
    const dataOverageCost = dataOverage * tier.overagePricing.dataPerMB;
    const computeOverageCost = computeOverage * tier.overagePricing.computePerMinute;
    
    const totalOverageCost = dataOverageCost + computeOverageCost;
    const projectedTotalCost = baseCost + totalOverageCost;

    // Generate recommendations
    const recommendations = this.generateUpgradeRecommendations(userId, projectedTotalCost);

    return {
      userId,
      billingPeriod: {
        current: metrics.billingPeriod.start,
        next: metrics.billingPeriod.end
      },
      projectedUsage: {
        dataUsageMB: projectedDataUsage,
        computeMinutes: projectedComputeUsage,
        storageUsageMB: metrics.storageMetrics.totalStorageMB,
        agentInteractions: metrics.computeUsage.agentInteractions + (metrics.computeUsage.agentInteractions * 0.1),
        toolExecutions: metrics.computeUsage.toolExecutions + (metrics.computeUsage.toolExecutions * 0.1)
      },
      projectedCosts: {
        baseCost,
        overageCosts: totalOverageCost,
        totalProjected: projectedTotalCost,
        confidenceLevel: Math.min(95, Math.max(60, 95 - (recentEvents.length < 10 ? 20 : 0)))
      },
      recommendations
    };
  }

  private generateUpgradeRecommendations(userId: string, projectedCost: number): any {
    const metrics = this.usageMetrics.get(userId)!;
    const currentTier = this.subscriptionTiers.get(metrics.subscriptionTier)!;
    
    // Check if upgrading would be cost-effective
    const nextTierIds = ['trial', 'starter', 'professional', 'enterprise'];
    const currentTierIndex = nextTierIds.indexOf(currentTier.id);
    
    if (currentTierIndex < nextTierIds.length - 1) {
      const nextTier = this.subscriptionTiers.get(nextTierIds[currentTierIndex + 1])!;
      const nextTierCost = nextTier.monthlyPrice;
      
      if (projectedCost > nextTierCost * 1.2) { // 20% buffer
        return {
          shouldUpgrade: true,
          shouldDowngrade: false,
          suggestedTier: nextTier.id,
          potentialSavings: projectedCost - nextTierCost,
          reasoning: [
            `Your projected monthly cost of $${projectedCost.toFixed(2)} exceeds the ${nextTier.displayName} plan cost`,
            `Upgrading would save you approximately $${(projectedCost - nextTierCost).toFixed(2)} per month`,
            `You would also get access to additional features and higher quotas`
          ]
        };
      }
    }

    // Check if downgrading makes sense
    if (currentTierIndex > 0 && projectedCost < currentTier.monthlyPrice * 0.6) {
      const previousTier = this.subscriptionTiers.get(nextTierIds[currentTierIndex - 1])!;
      return {
        shouldUpgrade: false,
        shouldDowngrade: true,
        suggestedTier: previousTier.id,
        potentialSavings: currentTier.monthlyPrice - previousTier.monthlyPrice,
        reasoning: [
          `Your usage patterns suggest you could save money with the ${previousTier.displayName} plan`,
          `Your projected usage fits within the lower tier limits`,
          `You could save $${(currentTier.monthlyPrice - previousTier.monthlyPrice).toFixed(2)} per month`
        ]
      };
    }

    return {
      shouldUpgrade: false,
      shouldDowngrade: false,
      suggestedTier: undefined,
      potentialSavings: 0,
      reasoning: ['Your current plan appears to be well-suited for your usage patterns']
    };
  }

  /**
   * Get all subscription tiers
   */
  getSubscriptionTiers(): SubscriptionTier[] {
    return Array.from(this.subscriptionTiers.values());
  }

  /**
   * Get quota alerts for a user
   */
  getQuotaAlerts(userId: string): QuotaAlert[] {
    return this.quotaAlerts.get(userId) || [];
  }

  /**
   * Get billing events for a user
   */
  getBillingEvents(userId: string, limit: number = 100): BillingEvent[] {
    const events = this.billingEvents.get(userId) || [];
    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  private startUsageMonitoring(): void {
    // Monitor usage patterns and generate insights every hour
    const monitoringInterval = setInterval(async () => {
      try {
        for (const [userId] of this.usageMetrics) {
          await this.checkQuotas(userId);
          
          // Generate usage projections for users approaching quota limits
          const alerts = this.getQuotaAlerts(userId);
          const hasWarnings = alerts.some(alert => alert.alertLevel === 'warning' || alert.alertLevel === 'critical');
          
          if (hasWarnings) {
            const projection = await this.generateUsageProjection(userId);
            this.emit('usageProjectionGenerated', { userId, projection });
          }
        }
      } catch (error) {
        console.error('Error in usage monitoring:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    this.monitoringIntervals.set('main', monitoringInterval);
  }

  /**
   * Shutdown the billing service
   */
  async shutdown(): Promise<void> {
    console.log('💰 Shutting down Enhanced Subscription Billing Service...');
    
    // Clear monitoring intervals
    for (const interval of this.monitoringIntervals.values()) {
      clearInterval(interval);
    }
    this.monitoringIntervals.clear();

    // Clear data
    this.usageMetrics.clear();
    this.billingEvents.clear();
    this.quotaAlerts.clear();

    console.log('💰 Enhanced Subscription Billing Service shutdown completed');
  }
}

// Export singleton instance
export const enhancedBilling = new EnhancedSubscriptionBilling();