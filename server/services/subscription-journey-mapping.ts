import type { UserRole, TechnicalLevel } from "../../shared/schema.js";
import { RolePermissionService } from "./role-permission.js";

export interface SubscriptionTierFeatures {
  maxProjects: number;
  maxDataSizeMB: number;
  aiQueries: number;
  visualizations: number;
  canUseAdvancedAI: boolean;
  canExportData: boolean;
  canUseCustomAI: boolean;
  prioritySupport: boolean;
  collaborationFeatures: boolean;
}

export interface JourneySubscriptionMapping {
  free: SubscriptionTierFeatures;
  starter: SubscriptionTierFeatures;
  professional: SubscriptionTierFeatures;
  enterprise: SubscriptionTierFeatures;
}

export class SubscriptionJourneyMappingService {
  // Journey-specific subscription mappings
  private static readonly JOURNEY_SUBSCRIPTION_MAPPING = {
    "non-tech": {
      free: {
        maxProjects: 1,
        maxDataSizeMB: 5,
        aiQueries: 10,
        visualizations: 3,
        canUseAdvancedAI: false,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: false,
        collaborationFeatures: false,
      },
      starter: {
        maxProjects: 3,
        maxDataSizeMB: 25,
        aiQueries: 50,
        visualizations: 10,
        canUseAdvancedAI: false,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: false,
        collaborationFeatures: false,
      },
      professional: {
        maxProjects: 10,
        maxDataSizeMB: 100,
        aiQueries: 500,
        visualizations: 50,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      enterprise: {
        // Exactly 2× the Professional tier
        maxProjects: 20,
        maxDataSizeMB: 200,
        aiQueries: 1000,
        visualizations: 100,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
    },
    "business": {
      free: {
        maxProjects: 1,
        maxDataSizeMB: 10,
        aiQueries: 15,
        visualizations: 5,
        canUseAdvancedAI: false,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: false,
        collaborationFeatures: false,
      },
      starter: {
        maxProjects: 5,
        maxDataSizeMB: 50,
        aiQueries: 100,
        visualizations: 20,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: false,
        collaborationFeatures: true,
      },
      professional: {
        maxProjects: 20,
        maxDataSizeMB: 250,
        aiQueries: 1000,
        visualizations: 100,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      enterprise: {
        // Exactly 2× the Professional tier
        maxProjects: 40,
        maxDataSizeMB: 500,
        aiQueries: 2000,
        visualizations: 200,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
    },
    "technical": {
      free: {
        maxProjects: 2,
        maxDataSizeMB: 25,
        aiQueries: 20,
        visualizations: 10,
        canUseAdvancedAI: false,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: false,
        collaborationFeatures: false,
      },
      starter: {
        maxProjects: 10,
        maxDataSizeMB: 100,
        aiQueries: 200,
        visualizations: 50,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: false,
        collaborationFeatures: true,
      },
      professional: {
        maxProjects: 50,
        maxDataSizeMB: 500,
        aiQueries: 2000,
        visualizations: 250,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      enterprise: {
        // Exactly 2× the Professional tier
        maxProjects: 100,
        maxDataSizeMB: 1000,
        aiQueries: 4000,
        visualizations: 500,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
    },
    "consultation": {
      free: {
        maxProjects: 1,
        maxDataSizeMB: 50,
        aiQueries: 30,
        visualizations: 15,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      starter: {
        maxProjects: 5,
        maxDataSizeMB: 200,
        aiQueries: 150,
        visualizations: 75,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      professional: {
        maxProjects: 25,
        maxDataSizeMB: 1000,
        aiQueries: 1500,
        visualizations: 300,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      enterprise: {
        // Exactly 2× the Professional tier
        maxProjects: 50,
        maxDataSizeMB: 2000,
        aiQueries: 3000,
        visualizations: 600,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
    },
    "custom": {
      free: {
        maxProjects: 2,
        maxDataSizeMB: 50,
        aiQueries: 40,
        visualizations: 20,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: false,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      starter: {
        maxProjects: 8,
        maxDataSizeMB: 250,
        aiQueries: 400,
        visualizations: 120,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      professional: {
        maxProjects: 40,
        maxDataSizeMB: 1000,
        aiQueries: 2500,
        visualizations: 400,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
      enterprise: {
        maxProjects: 80,
        maxDataSizeMB: 3000,
        aiQueries: 6000,
        visualizations: 800,
        canUseAdvancedAI: true,
        canExportData: true,
        canUseCustomAI: true,
        prioritySupport: true,
        collaborationFeatures: true,
      },
    },
  } satisfies Record<UserRole, JourneySubscriptionMapping>;

  // Subscription tier pricing by journey type
  private static readonly JOURNEY_PRICING = {
    "non-tech": {
      starter: 19,    // Simplified AI-guided journey
      professional: 49,
      enterprise: 199,
    },
    "business": {
      starter: 29,    // Business templates and insights
      professional: 79,
      enterprise: 299,
    },
    "technical": {
      starter: 39,    // Advanced tools and code generation
      professional: 99,
      enterprise: 399,
    },
    "consultation": {
      starter: 149,   // Expert consultation included
      professional: 299,
      enterprise: 999,
    },
    "custom": {
      starter: 189,   // Hybrid bespoke orchestration
      professional: 399,
      enterprise: 1299,
    },
  } satisfies Record<UserRole, {
    starter: number;
    professional: number;
    enterprise: number;
  }>;

  /**
   * Get subscription features for a specific user role and tier
   */
  static getSubscriptionFeatures(userRole: UserRole, subscriptionTier: string): SubscriptionTierFeatures {
    const mapping = this.JOURNEY_SUBSCRIPTION_MAPPING[userRole];

    switch (subscriptionTier) {
      case "none":
      case "trial":
        return mapping.free;
      case "starter":
        return mapping.starter;
      case "professional":
        return mapping.professional;
      case "enterprise":
        return mapping.enterprise;
      default:
        return mapping.free;
    }
  }

  /**
   * Get pricing for a specific user role and subscription tier
   */
  static getSubscriptionPricing(userRole: UserRole): {
    starter: number;
    professional: number;
    enterprise: number;
  } {
    return this.JOURNEY_PRICING[userRole];
  }

  /**
   * Check if user should be prompted to upgrade based on their usage
   */
  static shouldPromptUpgrade(
    userRole: UserRole,
    currentTier: string,
    currentUsage: {
      monthlyAIInsights: number;
      monthlyUploads: number;
      monthlyDataVolume: number;
    }
  ): {
    shouldUpgrade: boolean;
    reason: string;
    recommendedTier: string;
    savings?: number;
  } {
    const currentFeatures = this.getSubscriptionFeatures(userRole, currentTier);

    // Check if approaching limits (80% threshold)
    const aiUsagePercent = currentUsage.monthlyAIInsights / currentFeatures.aiQueries;
    const dataUsagePercent = currentUsage.monthlyDataVolume / currentFeatures.maxDataSizeMB;

    if (aiUsagePercent >= 0.8) {
      const nextTier = this.getNextTier(currentTier);
      return {
        shouldUpgrade: true,
        reason: `You've used ${Math.round(aiUsagePercent * 100)}% of your AI query limit`,
        recommendedTier: nextTier,
      };
    }

    if (dataUsagePercent >= 0.8) {
      const nextTier = this.getNextTier(currentTier);
      return {
        shouldUpgrade: true,
        reason: `You've used ${Math.round(dataUsagePercent * 100)}% of your data storage limit`,
        recommendedTier: nextTier,
      };
    }

    return {
      shouldUpgrade: false,
      reason: "Usage within limits",
      recommendedTier: currentTier,
    };
  }

  /**
   * Get the next subscription tier
   */
  private static getNextTier(currentTier: string): string {
    switch (currentTier) {
      case "none":
      case "trial":
        return "starter";
      case "starter":
        return "professional";
      case "professional":
        return "enterprise";
      default:
        return "starter";
    }
  }

  /**
   * Get available journey types for a user based on their subscription
   */
  static getAvailableJourneys(userRole: UserRole, subscriptionTier: string): string[] {
    const baseJourneys = ["non-tech"]; // Everyone can access basic journey

    if (subscriptionTier === "none") {
      return baseJourneys;
    }

    switch (userRole) {
      case "business":
        return [...baseJourneys, "business"];
      case "technical":
        if (subscriptionTier === "starter") {
          return [...baseJourneys, "business"];
        }
        return [...baseJourneys, "business", "technical"];
      case "consultation":
        return [...baseJourneys, "business", "technical", "consultation"];
      default:
        return baseJourneys;
    }
  }

  /**
   * Calculate upgrade cost between tiers
   */
  static calculateUpgradeCost(
    userRole: UserRole,
    fromTier: string,
    toTier: string,
    billingCycle: "monthly" | "annual" = "monthly"
  ): {
    cost: number;
    savings?: number;
    annualDiscount?: number;
  } {
    const pricing = this.getSubscriptionPricing(userRole);

    let fromCost = 0;
    let toCost = 0;

    // Get current tier cost
    switch (fromTier) {
      case "starter":
        fromCost = pricing.starter;
        break;
      case "professional":
        fromCost = pricing.professional;
        break;
      case "enterprise":
        fromCost = pricing.enterprise;
        break;
    }

    // Get target tier cost
    switch (toTier) {
      case "starter":
        toCost = pricing.starter;
        break;
      case "professional":
        toCost = pricing.professional;
        break;
      case "enterprise":
        toCost = pricing.enterprise;
        break;
    }

    const monthlyCost = toCost - fromCost;

    if (billingCycle === "annual") {
      const annualCost = monthlyCost * 12;
      const annualDiscount = annualCost * 0.2; // 20% annual discount
      return {
        cost: annualCost - annualDiscount,
        savings: annualDiscount,
        annualDiscount: 20,
      };
    }

    return {
      cost: monthlyCost,
    };
  }

  /**
   * Get feature comparison between tiers for a specific journey
   */
  static getFeatureComparison(userRole: UserRole): {
    tiers: string[];
    features: Record<string, Record<string, boolean | number | string>>;
  } {
    const tiers = ["free", "starter", "professional", "enterprise"];
    const mapping = this.JOURNEY_SUBSCRIPTION_MAPPING[userRole];

    const features: Record<string, Record<string, boolean | number | string>> = {};

    // Extract features for comparison
    Object.keys(mapping.free).forEach(feature => {
      features[feature] = {};
      tiers.forEach(tier => {
        const tierFeatures = mapping[tier as keyof JourneySubscriptionMapping];
        features[feature][tier] = tierFeatures[feature as keyof SubscriptionTierFeatures];
      });
    });

    return {
      tiers,
      features,
    };
  }

  /**
   * Update user permissions when subscription changes
   */
  static async updateSubscriptionPermissions(
    userId: string,
    userRole: UserRole,
    newSubscriptionTier: string
  ): Promise<void> {
    // Use the role permission service to update permissions
    await RolePermissionService.updatePermissionsForSubscription(userId, newSubscriptionTier);
  }
}