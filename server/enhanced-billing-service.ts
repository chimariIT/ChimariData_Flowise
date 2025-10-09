import { storage } from './storage';
import { users } from '@shared/schema';
// Local type alias derived from Drizzle table (schema does not export named User type directly)
type User = typeof users.$inferSelect;
import { SUBSCRIPTION_TIERS, getTierLimits } from '@shared/subscription-tiers';

interface CapacityUsage {
  dataVolumeMB: number;
  aiInsights: number;
  analysisComponents: number;
  visualizations: number;
  fileUploads: number;
}

interface CapacityLimits {
  maxDataVolumeMB: number;
  maxAiInsights: number;
  maxAnalysisComponents: number;
  maxVisualizations: number;
  maxFileUploads: number;
}

interface BillingCalculation {
  baseCost: number;
  capacityUsed: CapacityUsage;
  capacityRemaining: CapacityUsage;
  utilizationPercentage: Record<string, number>;
  subscriptionCredits: number;
  finalCost: number;
  breakdown: {
    item: string;
    cost: number;
    capacityUsed: Partial<CapacityUsage>;
    capacityRemaining: Partial<CapacityUsage>;
  }[];
}

interface JourneyCapacityRequirement {
  dataVolumeMB: number;
  aiInsights: number;
  analysisComponents: number;
  visualizations: number;
  fileUploads: number;
}

export class EnhancedBillingService {
  private static instance: EnhancedBillingService;

  // Journey type capacity requirements (per execution)
  private readonly JOURNEY_CAPACITY_REQUIREMENTS: Record<string, JourneyCapacityRequirement> = {
    'non-tech': {
      dataVolumeMB: 50,
      aiInsights: 2,
      analysisComponents: 3,
      visualizations: 2,
      fileUploads: 1,
    },
    'business': {
      dataVolumeMB: 200,
      aiInsights: 5,
      analysisComponents: 8,
      visualizations: 5,
      fileUploads: 2,
    },
    'technical': {
      dataVolumeMB: 500,
      aiInsights: 10,
      analysisComponents: 15,
      visualizations: 8,
      fileUploads: 3,
    },
  };

  // Base pricing per unit (in cents)
  private readonly UNIT_PRICES = {
    dataVolumeMB: 10, // $0.10 per MB
    aiInsights: 200, // $2.00 per insight
    analysisComponents: 150, // $1.50 per component
    visualizations: 100, // $1.00 per visualization
    fileUploads: 50, // $0.50 per upload
  };

  public static getInstance(): EnhancedBillingService {
    if (!EnhancedBillingService.instance) {
      EnhancedBillingService.instance = new EnhancedBillingService();
    }
    return EnhancedBillingService.instance;
  }

  /**
   * Calculate billing with subscription capacity tracking
   */
  async calculateBillingWithCapacity(
    userId: string,
    journeyType: string,
    datasetSizeMB: number,
    additionalFeatures?: string[]
  ): Promise<{
    success: boolean;
    billing?: BillingCalculation;
    error?: string;
  }> {
    try {
      // Get user and current usage
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const currentTier = user.subscriptionTier || 'trial';
      const tierLimits = getTierLimits(currentTier);
      
      // Get current usage from user record
      const currentUsage = await this.getCurrentUsage(userId);
      
      // Calculate journey requirements
      const journeyRequirements = this.calculateJourneyRequirements(
        journeyType,
        datasetSizeMB,
        additionalFeatures
      );

      // Check capacity availability
      const capacityCheck = this.checkCapacityAvailability(
        currentUsage,
        journeyRequirements,
        tierLimits
      );

      if (!capacityCheck.hasCapacity) {
        return {
          success: false,
          error: `Insufficient capacity. ${capacityCheck.blockingReasons.join(', ')}`,
        };
      }

      // Calculate billing
      const billing = await this.calculateDetailedBilling(
        user,
        journeyRequirements,
        currentUsage,
        tierLimits
      );

      return { success: true, billing };

    } catch (error) {
      console.error('Error calculating billing with capacity:', error);
      return { success: false, error: 'Billing calculation failed' };
    }
  }

  /**
   * Get current user usage from database
   */
  private async getCurrentUsage(userId: string): Promise<CapacityUsage> {
    try {
      // Get user's current monthly usage
      const user = await storage.getUser(userId);
      
      return {
        dataVolumeMB: user?.monthlyDataVolume || 0,
        aiInsights: user?.monthlyAIInsights || 0,
        analysisComponents: user?.monthlyAnalysisComponents || 0,
        visualizations: user?.monthlyVisualizations || 0,
        fileUploads: user?.monthlyUploads || 0,
      };
    } catch (error) {
      console.error('Error getting current usage:', error);
      return {
        dataVolumeMB: 0,
        aiInsights: 0,
        analysisComponents: 0,
        visualizations: 0,
        fileUploads: 0,
      };
    }
  }

  /**
   * Calculate journey capacity requirements
   */
  private calculateJourneyRequirements(
    journeyType: string,
    datasetSizeMB: number,
    additionalFeatures?: string[]
  ): JourneyCapacityRequirement {
    const baseRequirements = this.JOURNEY_CAPACITY_REQUIREMENTS[journeyType] || 
      this.JOURNEY_CAPACITY_REQUIREMENTS['non-tech'];

    // Adjust data volume based on actual dataset size
    const adjustedDataVolume = Math.max(baseRequirements.dataVolumeMB, datasetSizeMB);

    // Add capacity for additional features
    let additionalCapacity = {
      dataVolumeMB: 0,
      aiInsights: 0,
      analysisComponents: 0,
      visualizations: 0,
      fileUploads: 0,
    };

    if (additionalFeatures) {
      additionalFeatures.forEach(feature => {
        switch (feature) {
          case 'advanced_analytics':
            additionalCapacity.aiInsights += 3;
            additionalCapacity.analysisComponents += 5;
            break;
          case 'custom_visualizations':
            additionalCapacity.visualizations += 3;
            break;
          case 'data_transformation':
            additionalCapacity.analysisComponents += 2;
            additionalCapacity.dataVolumeMB += 50;
            break;
          case 'predictive_modeling':
            additionalCapacity.aiInsights += 5;
            additionalCapacity.analysisComponents += 8;
            additionalCapacity.dataVolumeMB += 100;
            break;
        }
      });
    }

    return {
      dataVolumeMB: adjustedDataVolume + additionalCapacity.dataVolumeMB,
      aiInsights: baseRequirements.aiInsights + additionalCapacity.aiInsights,
      analysisComponents: baseRequirements.analysisComponents + additionalCapacity.analysisComponents,
      visualizations: baseRequirements.visualizations + additionalCapacity.visualizations,
      fileUploads: baseRequirements.fileUploads + additionalCapacity.fileUploads,
    };
  }

  /**
   * Check if user has sufficient capacity for journey
   */
  private checkCapacityAvailability(
    currentUsage: CapacityUsage,
    requirements: JourneyCapacityRequirement,
    limits: any
  ): { hasCapacity: boolean; blockingReasons: string[] } {
    const blockingReasons: string[] = [];

    // Check data volume
    const totalDataVolume = currentUsage.dataVolumeMB + requirements.dataVolumeMB;
    if (limits.totalDataVolumeMB !== -1 && totalDataVolume > limits.totalDataVolumeMB) {
      blockingReasons.push(
        `Data volume would exceed limit (${totalDataVolume}MB > ${limits.totalDataVolumeMB}MB)`
      );
    }

    // Check AI insights
    const totalAIInsights = currentUsage.aiInsights + requirements.aiInsights;
    if (limits.aiInsights !== -1 && totalAIInsights > limits.aiInsights) {
      blockingReasons.push(
        `AI insights would exceed limit (${totalAIInsights} > ${limits.aiInsights})`
      );
    }

    // Check file uploads
    const totalUploads = currentUsage.fileUploads + requirements.fileUploads;
    if (limits.maxFiles !== -1 && totalUploads > limits.maxFiles) {
      blockingReasons.push(
        `File uploads would exceed limit (${totalUploads} > ${limits.maxFiles})`
      );
    }

    return {
      hasCapacity: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  /**
   * Calculate detailed billing with capacity tracking
   */
  private async calculateDetailedBilling(
    user: User,
    requirements: JourneyCapacityRequirement,
    currentUsage: CapacityUsage,
    limits: any
  ): Promise<BillingCalculation> {
    const breakdown: BillingCalculation['breakdown'] = [];
    // We'll compute:
    // - gross usage-based cost for all required capacity (baseCost)
    // - value covered by remaining subscription capacity (subscriptionCredits)
    // - final cost after credits (finalCost) which equals overage-only cost
    let overageCost = 0;
    let creditsAppliedValue = 0;

    // Calculate cost for each capacity type, properly deducting from quotas
    const capacityUsed: CapacityUsage = { ...currentUsage };
    const capacityRemaining: CapacityUsage = {
      dataVolumeMB: Math.max(0, limits.totalDataVolumeMB - capacityUsed.dataVolumeMB),
      aiInsights: Math.max(0, limits.aiInsights - capacityUsed.aiInsights),
      analysisComponents: Math.max(0, (limits.maxAnalysisComponents || 100) - capacityUsed.analysisComponents),
      visualizations: Math.max(0, (limits.maxVisualizations || 50) - capacityUsed.visualizations),
      fileUploads: Math.max(0, limits.maxFiles - capacityUsed.fileUploads),
    };

    // Pre-compute gross usage-based cost across all capacity types
    const grossDataVolumeCost = (requirements.dataVolumeMB || 0) * this.UNIT_PRICES.dataVolumeMB;
    const grossAiInsightsCost = (requirements.aiInsights || 0) * this.UNIT_PRICES.aiInsights;
    const grossAnalysisComponentsCost = (requirements.analysisComponents || 0) * this.UNIT_PRICES.analysisComponents;
    const grossVisualizationsCost = (requirements.visualizations || 0) * this.UNIT_PRICES.visualizations;
    const grossFileUploadsCost = (requirements.fileUploads || 0) * this.UNIT_PRICES.fileUploads;
    const grossCost = grossDataVolumeCost + grossAiInsightsCost + grossAnalysisComponentsCost + grossVisualizationsCost + grossFileUploadsCost;

    // Data volume billing: compute overage cost and credit value from quota coverage
    if (requirements.dataVolumeMB > 0) {
      const quotaAvailable = capacityRemaining.dataVolumeMB;
      const chargeableDataVolume = Math.max(0, requirements.dataVolumeMB - quotaAvailable);
      const quotaUsed = Math.min(requirements.dataVolumeMB, Math.max(0, quotaAvailable));
      
      if (chargeableDataVolume > 0) {
        const dataVolumeCost = chargeableDataVolume * this.UNIT_PRICES.dataVolumeMB;
        overageCost += dataVolumeCost;
        
        breakdown.push({
          item: `Data Processing (${chargeableDataVolume} MB beyond quota)`,
          cost: dataVolumeCost,
          capacityUsed: { dataVolumeMB: chargeableDataVolume },
          capacityRemaining: { dataVolumeMB: Math.max(0, quotaAvailable - requirements.dataVolumeMB) },
        });
      }
      
      if (quotaUsed > 0) {
        // credit value equals the value of usage covered by remaining quota
        creditsAppliedValue += quotaUsed * this.UNIT_PRICES.dataVolumeMB;
        breakdown.push({
          item: `Data Processing (${quotaUsed} MB from quota)`,
          cost: 0,
          capacityUsed: { dataVolumeMB: quotaUsed },
          capacityRemaining: { dataVolumeMB: quotaAvailable - quotaUsed },
        });
      }
    }

    // AI insights billing
    if (requirements.aiInsights > 0) {
      const quotaAvailable = capacityRemaining.aiInsights;
      const chargeableAIInsights = Math.max(0, requirements.aiInsights - quotaAvailable);
      const quotaUsed = Math.min(requirements.aiInsights, Math.max(0, quotaAvailable));
      
      if (chargeableAIInsights > 0) {
        const aiInsightsCost = chargeableAIInsights * this.UNIT_PRICES.aiInsights;
        overageCost += aiInsightsCost;
        
        breakdown.push({
          item: `AI Insights (${chargeableAIInsights} queries beyond quota)`,
          cost: aiInsightsCost,
          capacityUsed: { aiInsights: chargeableAIInsights },
          capacityRemaining: { aiInsights: Math.max(0, quotaAvailable - requirements.aiInsights) },
        });
      }
      
      if (quotaUsed > 0) {
        creditsAppliedValue += quotaUsed * this.UNIT_PRICES.aiInsights;
        breakdown.push({
          item: `AI Insights (${quotaUsed} queries from quota)`,
          cost: 0,
          capacityUsed: { aiInsights: quotaUsed },
          capacityRemaining: { aiInsights: quotaAvailable - quotaUsed },
        });
      }
    }

    // Analysis components billing
    if (requirements.analysisComponents > 0) {
      const quotaAvailable = capacityRemaining.analysisComponents;
      const chargeableAnalysisComponents = Math.max(0, requirements.analysisComponents - quotaAvailable);
      const quotaUsed = Math.min(requirements.analysisComponents, Math.max(0, quotaAvailable));
      
      if (chargeableAnalysisComponents > 0) {
        const analysisCost = chargeableAnalysisComponents * this.UNIT_PRICES.analysisComponents;
        overageCost += analysisCost;
        
        breakdown.push({
          item: `Analysis Components (${chargeableAnalysisComponents} components beyond quota)`,
          cost: analysisCost,
          capacityUsed: { analysisComponents: chargeableAnalysisComponents },
          capacityRemaining: { analysisComponents: Math.max(0, quotaAvailable - requirements.analysisComponents) },
        });
      }
      
      if (quotaUsed > 0) {
        creditsAppliedValue += quotaUsed * this.UNIT_PRICES.analysisComponents;
        breakdown.push({
          item: `Analysis Components (${quotaUsed} components from quota)`,
          cost: 0,
          capacityUsed: { analysisComponents: quotaUsed },
          capacityRemaining: { analysisComponents: quotaAvailable - quotaUsed },
        });
      }
    }

    // Visualizations billing
    if (requirements.visualizations > 0) {
      const quotaAvailable = capacityRemaining.visualizations;
      const chargeableVisualizations = Math.max(0, requirements.visualizations - quotaAvailable);
      const quotaUsed = Math.min(requirements.visualizations, Math.max(0, quotaAvailable));
      
      if (chargeableVisualizations > 0) {
        const visualizationsCost = chargeableVisualizations * this.UNIT_PRICES.visualizations;
        overageCost += visualizationsCost;
        
        breakdown.push({
          item: `Visualizations (${chargeableVisualizations} charts beyond quota)`,
          cost: visualizationsCost,
          capacityUsed: { visualizations: chargeableVisualizations },
          capacityRemaining: { visualizations: Math.max(0, quotaAvailable - requirements.visualizations) },
        });
      }
      
      if (quotaUsed > 0) {
        creditsAppliedValue += quotaUsed * this.UNIT_PRICES.visualizations;
        breakdown.push({
          item: `Visualizations (${quotaUsed} charts from quota)`,
          cost: 0,
          capacityUsed: { visualizations: quotaUsed },
          capacityRemaining: { visualizations: quotaAvailable - quotaUsed },
        });
      }
    }

    // File uploads billing
    if (requirements.fileUploads > 0) {
      const quotaAvailable = capacityRemaining.fileUploads;
      const chargeableFileUploads = Math.max(0, requirements.fileUploads - quotaAvailable);
      const quotaUsed = Math.min(requirements.fileUploads, Math.max(0, quotaAvailable));
      
      if (chargeableFileUploads > 0) {
        const uploadsCost = chargeableFileUploads * this.UNIT_PRICES.fileUploads;
        overageCost += uploadsCost;
        
        breakdown.push({
          item: `File Uploads (${chargeableFileUploads} files beyond quota)`,
          cost: uploadsCost,
          capacityUsed: { fileUploads: chargeableFileUploads },
          capacityRemaining: { fileUploads: Math.max(0, quotaAvailable - requirements.fileUploads) },
        });
      }
      
      if (quotaUsed > 0) {
        creditsAppliedValue += quotaUsed * this.UNIT_PRICES.fileUploads;
        breakdown.push({
          item: `File Uploads (${quotaUsed} files from quota)`,
          cost: 0,
          capacityUsed: { fileUploads: quotaUsed },
          capacityRemaining: { fileUploads: quotaAvailable - quotaUsed },
        });
      }
    }

    // Calculate credits applied: the value of usage covered by remaining quota (not to exceed gross)
    const subscriptionCredits = Math.min(grossCost, creditsAppliedValue);
    // Final cost is gross minus credits; this equals the overage-only cost
    const finalCost = Math.max(0, grossCost - subscriptionCredits);

    // Calculate utilization percentages
    const utilizationPercentage = {
      dataVolume: limits.totalDataVolumeMB > 0 ? ((capacityUsed.dataVolumeMB + requirements.dataVolumeMB) / limits.totalDataVolumeMB) * 100 : 0,
      aiInsights: limits.aiInsights > 0 ? ((capacityUsed.aiInsights + requirements.aiInsights) / limits.aiInsights) * 100 : 0,
      analysisComponents: (limits.maxAnalysisComponents || 100) > 0 ? ((capacityUsed.analysisComponents + requirements.analysisComponents) / (limits.maxAnalysisComponents || 100)) * 100 : 0,
      visualizations: (limits.maxVisualizations || 50) > 0 ? ((capacityUsed.visualizations + requirements.visualizations) / (limits.maxVisualizations || 50)) * 100 : 0,
      fileUploads: limits.maxFiles > 0 ? ((capacityUsed.fileUploads + requirements.fileUploads) / limits.maxFiles) * 100 : 0,
    };

    return {
      // baseCost now represents the gross usage-based cost before applying credits
      baseCost: grossCost,
      capacityUsed: {
        dataVolumeMB: capacityUsed.dataVolumeMB + requirements.dataVolumeMB,
        aiInsights: capacityUsed.aiInsights + requirements.aiInsights,
        analysisComponents: capacityUsed.analysisComponents + requirements.analysisComponents,
        visualizations: capacityUsed.visualizations + requirements.visualizations,
        fileUploads: capacityUsed.fileUploads + requirements.fileUploads,
      },
      capacityRemaining: {
        dataVolumeMB: Math.max(0, capacityRemaining.dataVolumeMB - requirements.dataVolumeMB),
        aiInsights: Math.max(0, capacityRemaining.aiInsights - requirements.aiInsights),
        analysisComponents: Math.max(0, capacityRemaining.analysisComponents - requirements.analysisComponents),
        visualizations: Math.max(0, capacityRemaining.visualizations - requirements.visualizations),
        fileUploads: Math.max(0, capacityRemaining.fileUploads - requirements.fileUploads),
      },
      utilizationPercentage,
      subscriptionCredits,
      finalCost,
      breakdown,
    };
  }

  /**
   * Calculate subscription credits based on tier
   */
  private calculateSubscriptionCredits(subscriptionTier: string): number {
    const credits = {
      trial: 2500, // $25.00 - covers one basic analysis
      starter: 5000, // $50.00 - covers two analyses
      professional: 10000, // $100.00 - covers four analyses
      enterprise: 25000, // $250.00 - covers ten analyses
    };

    return credits[subscriptionTier as keyof typeof credits] || 0;
  }

  /**
   * Update user usage after journey execution
   */
  async updateUserUsage(
    userId: string,
    requirements: JourneyCapacityRequirement
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Update usage counters
      const updatedUser = {
        ...user,
        monthlyDataVolume: (user.monthlyDataVolume || 0) + requirements.dataVolumeMB,
        monthlyAIInsights: (user.monthlyAIInsights || 0) + requirements.aiInsights,
        monthlyAnalysisComponents: (user.monthlyAnalysisComponents || 0) + requirements.analysisComponents,
        monthlyVisualizations: (user.monthlyVisualizations || 0) + requirements.visualizations,
        monthlyUploads: (user.monthlyUploads || 0) + requirements.fileUploads,
        lastUsageUpdate: new Date(),
      };

      await storage.updateUser(userId, updatedUser);

      return { success: true };

    } catch (error) {
      console.error('Error updating user usage:', error);
      return { success: false, error: 'Failed to update usage' };
    }
  }

  /**
   * Get user capacity summary
   */
  async getUserCapacitySummary(userId: string): Promise<{
    success: boolean;
    summary?: {
      currentTier: string;
      capacityUsed: CapacityUsage;
      capacityRemaining: CapacityUsage;
      utilizationPercentage: Record<string, number>;
      nextResetDate?: Date;
    };
    error?: string;
  }> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const currentTier = user.subscriptionTier || 'trial';
      const limits = getTierLimits(currentTier);
      const usage = await this.getCurrentUsage(userId);

      const capacityRemaining = {
        dataVolumeMB: Math.max(0, limits.totalDataVolumeMB - usage.dataVolumeMB),
        aiInsights: Math.max(0, limits.aiInsights - usage.aiInsights),
        analysisComponents: Math.max(0, (limits.maxAnalysisComponents || 100) - usage.analysisComponents),
        visualizations: Math.max(0, (limits.maxVisualizations || 50) - usage.visualizations),
        fileUploads: Math.max(0, limits.maxFiles - usage.fileUploads),
      };

      const utilizationPercentage = {
        dataVolume: limits.totalDataVolumeMB > 0 ? (usage.dataVolumeMB / limits.totalDataVolumeMB) * 100 : 0,
        aiInsights: limits.aiInsights > 0 ? (usage.aiInsights / limits.aiInsights) * 100 : 0,
        analysisComponents: (limits.maxAnalysisComponents || 100) > 0 ? (usage.analysisComponents / (limits.maxAnalysisComponents || 100)) * 100 : 0,
        visualizations: (limits.maxVisualizations || 50) > 0 ? (usage.visualizations / (limits.maxVisualizations || 50)) * 100 : 0,
        fileUploads: limits.maxFiles > 0 ? (usage.fileUploads / limits.maxFiles) * 100 : 0,
      };

      return {
        success: true,
        summary: {
          currentTier,
          capacityUsed: usage,
          capacityRemaining,
          utilizationPercentage,
          nextResetDate: user.usageResetAt || undefined,
        },
      };

    } catch (error) {
      console.error('Error getting user capacity summary:', error);
      return { success: false, error: 'Failed to get capacity summary' };
    }
  }
}

// Export singleton instance
export const enhancedBillingService = EnhancedBillingService.getInstance();
