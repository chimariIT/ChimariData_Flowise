import { db } from "../db.js";
import { users, projects, generatedArtifacts } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { RolePermissionService } from "./role-permission.js";
import { SubscriptionJourneyMappingService } from "./subscription-journey-mapping.js";
import type { UserRole } from "../../shared/schema.js";

export interface UsageMetrics {
  aiQueries: number;
  dataUploads: number;
  dataVolumeMB: number;
  projectsCreated: number;
  visualizationsGenerated: number;
  codeGenerations: number;
  consultationMinutes: number;
}

export interface UsageLimits {
  maxAiQueries: number;
  maxDataUploads: number;
  maxDataVolumeMB: number;
  maxProjects: number;
  maxVisualizations: number;
  canGenerateCode: boolean;
  consultationMinutesIncluded: number;
}

export interface UsageCheckResult {
  allowed: boolean;
  reason?: string;
  currentUsage: number;
  limit: number;
  remainingUsage: number;
  percentageUsed: number;
  shouldPromptUpgrade: boolean;
  recommendedTier?: string;
}

export class UsageTrackingService {
  /**
   * Track AI query usage
   */
  static async trackAiQuery(userId: string, queryType: 'simple' | 'advanced' | 'code_generation' = 'simple'): Promise<UsageCheckResult> {
    const result = await this.checkUsageLimit(userId, 'aiQueries');

    if (!result.allowed) {
      return result;
    }

    // Calculate query cost based on type
    const queryCost = this.getQueryCost(queryType);

    // Increment usage
    await db
      .update(users)
      .set({
        monthlyAIInsights: (result.currentUsage + queryCost),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return {
      ...result,
      currentUsage: result.currentUsage + queryCost,
      remainingUsage: result.limit - (result.currentUsage + queryCost),
      percentageUsed: ((result.currentUsage + queryCost) / result.limit) * 100
    };
  }

  /**
   * Return a simple usage history for the past N days. This is a lightweight stub
   * to satisfy analytics/optimization components without altering runtime behavior.
   */
  static async getUsageHistory(userId: string, days: number, _startOffsetDays?: number): Promise<Array<{
    date: string;
    aiQueries: number;
    dataUploads: number;
    dataVolumeMB: number;
    cost?: number;
  }>> {
    try {
      const current = await this.getCurrentUsage(userId);
      const history: Array<{ date: string; aiQueries: number; dataUploads: number; dataVolumeMB: number; cost?: number; }> = [];
      const today = new Date();
      const dailyAvgQueries = Math.floor((current.aiQueries || 0) / Math.max(1, days));
      const dailyAvgUploads = Math.floor((current.dataUploads || 0) / Math.max(1, days));
      const dailyAvgVolume = Math.floor((current.dataVolumeMB || 0) / Math.max(1, days));

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        history.push({
          date: d.toISOString().slice(0, 10),
          aiQueries: dailyAvgQueries,
          dataUploads: dailyAvgUploads,
          dataVolumeMB: dailyAvgVolume,
          cost: 0
        });
      }

      return history;
    } catch (e) {
      // On error, return empty history of given length
      const today = new Date();
      return Array.from({ length: Math.max(0, days) }).map((_, idx) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (days - 1 - idx));
        return {
          date: d.toISOString().slice(0, 10),
          aiQueries: 0,
          dataUploads: 0,
          dataVolumeMB: 0,
          cost: 0
        };
      });
    }
  }

  /**
   * Track data upload usage
   */
  static async trackDataUpload(userId: string, fileSizeMB: number): Promise<UsageCheckResult> {
    // Check if upload would exceed limits
    const sizeCheck = await this.checkUsageLimit(userId, 'dataVolume', fileSizeMB);
    if (!sizeCheck.allowed) {
      return sizeCheck;
    }

    const uploadCheck = await this.checkUsageLimit(userId, 'dataUploads');
    if (!uploadCheck.allowed) {
      return uploadCheck;
    }

    // Update both upload count and volume
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length > 0) {
      await db
        .update(users)
        .set({
          monthlyUploads: (user[0].monthlyUploads || 0) + 1,
          monthlyDataVolume: (user[0].monthlyDataVolume || 0) + fileSizeMB,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    }

    return {
      allowed: true,
      currentUsage: (user[0]?.monthlyDataVolume || 0) + fileSizeMB,
      limit: sizeCheck.limit,
      remainingUsage: sizeCheck.limit - ((user[0]?.monthlyDataVolume || 0) + fileSizeMB),
      percentageUsed: (((user[0]?.monthlyDataVolume || 0) + fileSizeMB) / sizeCheck.limit) * 100,
      shouldPromptUpgrade: false
    };
  }

  /**
   * Track project creation
   */
  static async trackProjectCreation(userId: string): Promise<UsageCheckResult> {
    // For project creation, we check concurrent project limits rather than monthly limits
    const permissions = await RolePermissionService.getUserPermissions(userId);
    if (!permissions) {
      return {
        allowed: false,
        reason: "Unable to verify permissions",
        currentUsage: 0,
        limit: 0,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: true
      };
    }

    // Count active projects for user
    const activeProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));

    const currentUsage = activeProjects.length;
    const limit = permissions.maxConcurrentProjects || 1;

    if (currentUsage >= limit) {
      return {
        allowed: false,
        reason: `Project limit reached (${limit} active projects). Upgrade to create more.`,
        currentUsage,
        limit,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: true,
        recommendedTier: "professional"
      };
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      remainingUsage: limit - currentUsage,
      percentageUsed: (currentUsage / limit) * 100,
      shouldPromptUpgrade: (currentUsage / limit) >= 0.8
    };
  }

  /**
   * Track visualization generation
   */
  static async trackVisualizationGeneration(userId: string, projectId: string): Promise<UsageCheckResult> {
    const permissions = await RolePermissionService.getUserPermissions(userId);
    if (!permissions) {
      return { allowed: false, reason: "Permissions error", currentUsage: 0, limit: 0, remainingUsage: 0, percentageUsed: 100, shouldPromptUpgrade: false };
    }

    // Count visualizations for this project
    const projectVisualizations = await db
      .select()
      .from(generatedArtifacts)
      .where(and(eq(generatedArtifacts.projectId, projectId), eq(generatedArtifacts.type, 'visualization')));

    const currentUsage = projectVisualizations.length;
    const limit = permissions.maxVisualizationsPerProject || 3;

    if (currentUsage >= limit) {
      return {
        allowed: false,
        reason: `Visualization limit reached for this project (${limit}). Upgrade for more.`,
        currentUsage,
        limit,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: true,
        recommendedTier: "professional"
      };
    }

    return {
      allowed: true,
      currentUsage,
      limit,
      remainingUsage: limit - currentUsage,
      percentageUsed: (currentUsage / limit) * 100,
      shouldPromptUpgrade: (currentUsage / limit) >= 0.8
    };
  }

  /**
   * Track code generation usage
   */
  static async trackCodeGeneration(userId: string): Promise<UsageCheckResult> {
    // Check if user has code generation permission
    const hasPermission = await RolePermissionService.hasPermission(userId, 'canGenerateCode');
    if (!hasPermission) {
      return {
        allowed: false,
        reason: "Code generation not available with your current plan",
        currentUsage: 0,
        limit: 0,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: true,
        recommendedTier: "professional"
      };
    }

    // Code generation counts as advanced AI query
    return await this.trackAiQuery(userId, 'code_generation');
  }

  /**
   * Track consultation usage
   */
  static async trackConsultationUsage(userId: string, minutes: number): Promise<UsageCheckResult> {
    // Check if user can request consultation
    const canRequest = await RolePermissionService.canAccessJourney(userId, 'consultation');
    if (!canRequest) {
      return {
        allowed: false,
        reason: "Consultation not available with your current plan",
        currentUsage: 0,
        limit: 0,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: true,
        recommendedTier: "consultation"
      };
    }

    // Track consultation minutes
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const currentUsage = user[0]?.consultationMinutes || 0;
    // P2-7 FIX: Fetch tier-based consultation limit instead of hardcoded 60
    const userLimits = await this.getUserLimits(userId);
    const limit = userLimits.consultationMinutesIncluded || 60;

    if (currentUsage + minutes > limit) {
      return {
        allowed: false,
        reason: "Consultation minutes limit exceeded",
        currentUsage,
        limit,
        remainingUsage: limit - currentUsage,
        percentageUsed: 100,
        shouldPromptUpgrade: true
      };
    }

    // Update usage
    await db.update(users).set({ consultationMinutes: currentUsage + minutes }).where(eq(users.id, userId));

    return {
      allowed: true,
      currentUsage: currentUsage + minutes,
      limit,
      remainingUsage: limit - (currentUsage + minutes),
      percentageUsed: ((currentUsage + minutes) / limit) * 100,
      shouldPromptUpgrade: false
    };
  }

  /**
   * Check if a specific usage type is within limits
   */
  static async checkUsageLimit(
    userId: string,
    usageType: 'aiQueries' | 'dataUploads' | 'dataVolume' | 'projects',
    additionalUsage: number = 1
  ): Promise<UsageCheckResult> {
    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return {
          allowed: false,
          reason: "User not found",
          currentUsage: 0,
          limit: 0,
          remainingUsage: 0,
          percentageUsed: 100,
          shouldPromptUpgrade: false
        };
      }

      const userData = user[0];
      const permissions = await RolePermissionService.getUserPermissions(userId);

      if (!permissions) {
        return {
          allowed: false,
          reason: "Unable to verify permissions",
          currentUsage: 0,
          limit: 0,
          remainingUsage: 0,
          percentageUsed: 100,
          shouldPromptUpgrade: false
        };
      }

      let currentUsage = 0;
      let limit = 0;

      switch (usageType) {
        case 'aiQueries':
          currentUsage = userData.monthlyAIInsights || 0;
          // Increase default limit for development (was 10, now 1000)
          // In production, this should be controlled by subscription tier
          limit = permissions.maxAiQueriesPerMonth || (process.env.NODE_ENV === 'production' ? 50 : 1000);
          break;
        case 'dataUploads':
          currentUsage = userData.monthlyUploads || 0;
          limit = 10; // Default upload limit per month
          break;
        case 'dataVolume':
          currentUsage = userData.monthlyDataVolume || 0;
          limit = permissions.maxDatasetSizeMB || 5;
          break;
        case 'projects':
          // Count active projects
          const activeProjects = await db
            .select()
            .from(projects)
            .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));
          currentUsage = activeProjects.length;
          limit = permissions.maxConcurrentProjects || 1;
          break;
      }

      const wouldExceedLimit = (currentUsage + additionalUsage) > limit;
      const percentageUsed = (currentUsage / limit) * 100;
      const shouldPromptUpgrade = percentageUsed >= 80; // Prompt at 80% usage

      let recommendedTier = undefined;
      if (wouldExceedLimit || shouldPromptUpgrade) {
        const upgradePrompt = SubscriptionJourneyMappingService.shouldPromptUpgrade(
          userData.userRole as UserRole || "non-tech",
          userData.subscriptionTier || "none",
          {
            monthlyAIInsights: userData.monthlyAIInsights || 0,
            monthlyUploads: userData.monthlyUploads || 0,
            monthlyDataVolume: userData.monthlyDataVolume || 0,
          }
        );
        recommendedTier = upgradePrompt.recommendedTier;
      }

      return {
        allowed: !wouldExceedLimit,
        reason: wouldExceedLimit ? `${usageType} limit exceeded` : undefined,
        currentUsage,
        limit,
        remainingUsage: Math.max(0, limit - currentUsage),
        percentageUsed,
        shouldPromptUpgrade,
        recommendedTier
      };
    } catch (error) {
      console.error("Error checking usage limit:", error);
      return {
        allowed: false,
        reason: "Error checking usage limits",
        currentUsage: 0,
        limit: 0,
        remainingUsage: 0,
        percentageUsed: 100,
        shouldPromptUpgrade: false
      };
    }
  }

  /**
   * Track compute minutes usage
   */
  static async trackComputeMinutes(userId: string, minutes: number): Promise<UsageCheckResult> {
    // Get user and permissions
    const permissions = await RolePermissionService.getUserPermissions(userId);
    if (!permissions) {
      return { allowed: false, reason: "Permissions error", currentUsage: 0, limit: 0, remainingUsage: 0, percentageUsed: 100, shouldPromptUpgrade: false };
    }

    // Get current usage
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const currentUsage = user[0]?.monthlyComputeMinutes || 0;
    const limit = permissions.maxComputeMinutesPerMonth || 60; // Default 60 mins

    if (currentUsage + minutes > limit) {
      return {
        allowed: false,
        reason: "Monthly compute minutes limit exceeded",
        currentUsage,
        limit,
        remainingUsage: Math.max(0, limit - currentUsage),
        percentageUsed: 100,
        shouldPromptUpgrade: true
      };
    }

    // Update usage
    await db.update(users)
      .set({
        monthlyComputeMinutes: currentUsage + minutes,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));

    return {
      allowed: true,
      currentUsage: currentUsage + minutes,
      limit,
      remainingUsage: limit - (currentUsage + minutes),
      percentageUsed: ((currentUsage + minutes) / limit) * 100,
      shouldPromptUpgrade: false
    };
  }

  /**
   * Get current usage for a user
   */
  static async getCurrentUsage(userId: string): Promise<UsageMetrics> {
    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return this.getEmptyUsageMetrics();
      }

      const userData = user[0];

      // Count active projects
      const activeProjects = await db
        .select()
        .from(projects)
        .where(and(eq(projects.userId, userId), eq(projects.status, 'active')));

      // Count visualizations (approximate from artifacts)
      // This is expensive to count every time, ideally should be cached or stored in user table
      // For now we return 0 or implement a separate counter

      return {
        aiQueries: userData.monthlyAIInsights || 0,
        dataUploads: userData.monthlyUploads || 0,
        dataVolumeMB: userData.monthlyDataVolume || 0,
        projectsCreated: activeProjects.length,
        visualizationsGenerated: 0, // Still TODO: Add column to users table for perf
        codeGenerations: 0,
        consultationMinutes: userData.consultationMinutes || 0,
      };
    } catch (error) {
      console.error("Error getting current usage:", error);
      return this.getEmptyUsageMetrics();
    }
  }

  /**
   * Reset monthly usage counters (should be called monthly via cron job)
   */
  static async resetMonthlyUsage(userId?: string): Promise<void> {
    try {
      const resetData = {
        monthlyUploads: 0,
        monthlyDataVolume: 0,
        monthlyAIInsights: 0,
        usageResetAt: new Date(),
        updatedAt: new Date(),
      };

      if (userId) {
        // Reset for specific user
        await db
          .update(users)
          .set(resetData)
          .where(eq(users.id, userId));
      } else {
        // Reset for all users (monthly cron job)
        await db
          .update(users)
          .set(resetData);
      }
    } catch (error) {
      console.error("Error resetting monthly usage:", error);
    }
  }

  /**
   * Get usage limits for a user
   */
  static async getUserLimits(userId: string): Promise<UsageLimits> {
    try {
      const permissions = await RolePermissionService.getUserPermissions(userId);

      if (!permissions) {
        return {
          maxAiQueries: 0,
          maxDataUploads: 0,
          maxDataVolumeMB: 0,
          maxProjects: 0,
          maxVisualizations: 0,
          canGenerateCode: false,
          consultationMinutesIncluded: 0,
        };
      }

      return {
        maxAiQueries: permissions.maxAiQueriesPerMonth || 10,
        maxDataUploads: 10, // Default value
        maxDataVolumeMB: permissions.maxDatasetSizeMB || 5,
        maxProjects: permissions.maxConcurrentProjects || 1,
        maxVisualizations: permissions.maxVisualizationsPerProject || 3,
        canGenerateCode: permissions.canGenerateCode || false,
        consultationMinutesIncluded: 0, // TODO: Add to permissions
      };
    } catch (error) {
      console.error("Error getting user limits:", error);
      return {
        maxAiQueries: 0,
        maxDataUploads: 0,
        maxDataVolumeMB: 0,
        maxProjects: 0,
        maxVisualizations: 0,
        canGenerateCode: false,
        consultationMinutesIncluded: 0,
      };
    }
  }

  /**
   * Calculate query cost based on type
   */
  private static getQueryCost(queryType: 'simple' | 'advanced' | 'code_generation'): number {
    switch (queryType) {
      case 'simple':
        return 1;
      case 'advanced':
        return 2;
      case 'code_generation':
        return 3;
      default:
        return 1;
    }
  }

  /**
   * Get empty usage metrics
   */
  private static getEmptyUsageMetrics(): UsageMetrics {
    return {
      aiQueries: 0,
      dataUploads: 0,
      dataVolumeMB: 0,
      projectsCreated: 0,
      visualizationsGenerated: 0,
      codeGenerations: 0,
      consultationMinutes: 0,
    };
  }

  /**
   * Check if user should be prompted to upgrade based on usage patterns
   */
  static async shouldPromptUpgrade(userId: string): Promise<{
    shouldPrompt: boolean;
    reason: string;
    recommendedTier: string;
    urgency: 'low' | 'medium' | 'high';
  }> {
    try {
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return {
          shouldPrompt: false,
          reason: "",
          recommendedTier: "starter",
          urgency: 'low'
        };
      }

      const userData = user[0];
      const upgradeCheck = SubscriptionJourneyMappingService.shouldPromptUpgrade(
        userData.userRole as UserRole || "non-tech",
        userData.subscriptionTier || "none",
        {
          monthlyAIInsights: userData.monthlyAIInsights || 0,
          monthlyUploads: userData.monthlyUploads || 0,
          monthlyDataVolume: userData.monthlyDataVolume || 0,
        }
      );

      // Determine urgency based on usage percentage
      let urgency: 'low' | 'medium' | 'high' = 'low';
      const permissions = await RolePermissionService.getUserPermissions(userId);
      if (permissions) {
        const aiUsagePercent = (userData.monthlyAIInsights || 0) / permissions.maxAiQueriesPerMonth;
        if (aiUsagePercent >= 0.95) urgency = 'high';
        else if (aiUsagePercent >= 0.8) urgency = 'medium';
      }

      return {
        shouldPrompt: upgradeCheck.shouldUpgrade,
        reason: upgradeCheck.reason,
        recommendedTier: upgradeCheck.recommendedTier,
        urgency
      };
    } catch (error) {
      console.error("Error checking upgrade prompt:", error);
      return {
        shouldPrompt: false,
        reason: "Error checking usage",
        recommendedTier: "starter",
        urgency: 'low'
      };
    }
  }
}