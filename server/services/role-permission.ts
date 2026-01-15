import { db } from "../db.js";
import { users, userPermissions } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import type { UserRole, TechnicalLevel, UserPermissions } from "../../shared/schema.js";

export interface RoleBasedLimits {
  maxConcurrentProjects: number;
  maxDatasetSizeMB: number;
  maxAiQueriesPerMonth: number;
  maxVisualizationsPerProject: number;
  maxComputeMinutesPerMonth: number;
  allowedAiProviders: string[];
  canUseAdvancedModels: boolean;
}

export interface JourneyAccess {
  canAccessNonTechJourney: boolean;
  canAccessBusinessJourney: boolean;
  canAccessTechnicalJourney: boolean;
  canRequestConsultation: boolean;
}

export interface FeaturePermissions {
  canUseAI: boolean; // Basic AI feature access (required for all AI features)
  canAccessAdvancedAnalytics: boolean;
  canAccessAdvancedFeatures: boolean; // Advanced feature access (used by middleware)
  canUseCustomAiKeys: boolean;
  canGenerateCode: boolean;
  canAccessRawData: boolean;
  canExportResults: boolean;
}

type BasePermissionSet = RoleBasedLimits & JourneyAccess & FeaturePermissions;

type ExtendedUserPermissions = UserPermissions & Partial<FeaturePermissions>;

export class RolePermissionService {
  // Define base role permissions (journey access should be universal)
  private static readonly DEFAULT_PERMISSIONS: Record<UserRole, BasePermissionSet> = {
    "non-tech": {
      canAccessNonTechJourney: true,
      canAccessBusinessJourney: true,
      canAccessTechnicalJourney: true,
      canRequestConsultation: true,
      canUseAI: true, // All users can use basic AI features
      canAccessAdvancedAnalytics: false,
      canAccessAdvancedFeatures: false,
      canUseCustomAiKeys: false,
      canGenerateCode: false,
      canAccessRawData: false,
      canExportResults: true,
      maxConcurrentProjects: 1,
      maxDatasetSizeMB: 5,
      maxAiQueriesPerMonth: 10,
      maxVisualizationsPerProject: 3,
      maxComputeMinutesPerMonth: 60,
      allowedAiProviders: ["gemini"],
      canUseAdvancedModels: false,
    },
    "business": {
      canAccessNonTechJourney: true,
      canAccessBusinessJourney: true,
      canAccessTechnicalJourney: true,
      canRequestConsultation: true,
      canUseAI: true,
      canAccessAdvancedAnalytics: true,
      canAccessAdvancedFeatures: true,
      canUseCustomAiKeys: false,
      canGenerateCode: false,
      canAccessRawData: true,
      canExportResults: true,
      maxConcurrentProjects: 3,
      maxDatasetSizeMB: 25,
      maxAiQueriesPerMonth: 50,
      maxVisualizationsPerProject: 10,
      maxComputeMinutesPerMonth: 300,
      allowedAiProviders: ["gemini", "openai"],
      canUseAdvancedModels: false,
    },
    "technical": {
      canAccessNonTechJourney: true,
      canAccessBusinessJourney: true,
      canAccessTechnicalJourney: true,
      canRequestConsultation: true,
      canUseAI: true,
      canAccessAdvancedAnalytics: true,
      canAccessAdvancedFeatures: true,
      canUseCustomAiKeys: true,
      canGenerateCode: true,
      canAccessRawData: true,
      canExportResults: true,
      maxConcurrentProjects: 10,
      maxDatasetSizeMB: 100,
      maxAiQueriesPerMonth: 200,
      maxVisualizationsPerProject: 25,
      maxComputeMinutesPerMonth: 1000,
      allowedAiProviders: ["gemini", "openai", "anthropic"],
      canUseAdvancedModels: true,
    },
    "consultation": {
      canAccessNonTechJourney: true,
      canAccessBusinessJourney: true,
      canAccessTechnicalJourney: true,
      canRequestConsultation: true,
      canUseAI: true,
      canAccessAdvancedAnalytics: true,
      canAccessAdvancedFeatures: true,
      canUseCustomAiKeys: true,
      canGenerateCode: true,
      canAccessRawData: true,
      canExportResults: true,
      maxConcurrentProjects: 5,
      maxDatasetSizeMB: 50,
      maxAiQueriesPerMonth: 100,
      maxVisualizationsPerProject: 15,
      maxComputeMinutesPerMonth: 500,
      allowedAiProviders: ["gemini", "openai", "anthropic"],
      canUseAdvancedModels: true,
    },
    "custom": {
      canAccessNonTechJourney: true,
      canAccessBusinessJourney: true,
      canAccessTechnicalJourney: true,
      canRequestConsultation: true,
      canUseAI: true,
      canAccessAdvancedAnalytics: true,
      canAccessAdvancedFeatures: true,
      canUseCustomAiKeys: true,
      canGenerateCode: true,
      canAccessRawData: true,
      canExportResults: true,
      maxConcurrentProjects: 10,
      maxDatasetSizeMB: 100,
      maxAiQueriesPerMonth: 200,
      maxVisualizationsPerProject: 25,
      maxComputeMinutesPerMonth: 1000,
      allowedAiProviders: ["gemini", "openai", "anthropic"],
      canUseAdvancedModels: true,
    },
  };


  // Subscription tier multipliers
  private static readonly SUBSCRIPTION_MULTIPLIERS: Record<string, {
    projects: number;
    dataSize: number;
    aiQueries: number;
    visualizations: number;
  }> = {
      "none": { projects: 1, dataSize: 1, aiQueries: 1, visualizations: 1 },
      "trial": { projects: 1, dataSize: 1, aiQueries: 2, visualizations: 1.5 },
      "starter": { projects: 2, dataSize: 2, aiQueries: 5, visualizations: 2 },
      "professional": { projects: 5, dataSize: 10, aiQueries: 25, visualizations: 5 },
      "enterprise": { projects: 20, dataSize: 50, aiQueries: 100, visualizations: 20 },
    };

  /**
   * Get user permissions by userId, creating default permissions if they don't exist
   */
  static async getUserPermissions(userId: string): Promise<ExtendedUserPermissions | null> {
    try {
      // Try to get existing permissions
      const existingPermissions = await db
        .select()
        .from(userPermissions)
        .where(eq(userPermissions.userId, userId))
        .limit(1);

      if (existingPermissions.length > 0) {
        return existingPermissions[0] as ExtendedUserPermissions;
      }

      // Get user role to create default permissions
      const user = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (user.length === 0) {
        return null;
      }

      const userRole = (user[0].userRole as UserRole) || "non-tech";
      const subscriptionTier = user[0].subscriptionTier || "none";

      // Create default permissions for this user
      const defaultPermissions = await this.createDefaultPermissions(userId, userRole, subscriptionTier);
      return defaultPermissions;
    } catch (error) {
      console.error("Error getting user permissions:", error);
      return null;
    }
  }

  /**
   * Create default permissions for a user based on their role and subscription
   */
  static async createDefaultPermissions(
    userId: string,
    userRole: UserRole,
    subscriptionTier: string = "none"
  ): Promise<ExtendedUserPermissions> {
    const basePermissions = this.DEFAULT_PERMISSIONS[userRole];
    const multipliers = this.SUBSCRIPTION_MULTIPLIERS[subscriptionTier] || this.SUBSCRIPTION_MULTIPLIERS["none"];

    const permissionsData = {
      id: `perm_${userId}_${Date.now()}`,
      userId,
      ...basePermissions,
      // Apply subscription multipliers
      maxConcurrentProjects: Math.floor((basePermissions.maxConcurrentProjects || 1) * multipliers.projects),
      maxDatasetSizeMB: Math.floor((basePermissions.maxDatasetSizeMB || 5) * multipliers.dataSize),
      maxAiQueriesPerMonth: Math.floor((basePermissions.maxAiQueriesPerMonth || 10) * multipliers.aiQueries),
      maxVisualizationsPerProject: Math.floor((basePermissions.maxVisualizationsPerProject || 3) * multipliers.visualizations),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [createdPermissions] = await db
      .insert(userPermissions)
      .values(permissionsData as any)
      .returning();

    return createdPermissions as ExtendedUserPermissions;
  }

  /**
   * Update user permissions when subscription changes
   */
  static async updatePermissionsForSubscription(userId: string, newSubscriptionTier: string): Promise<void> {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) return;

    const userRole = (user[0].userRole as UserRole) || "non-tech";
    const basePermissions = this.DEFAULT_PERMISSIONS[userRole];
    const multipliers = this.SUBSCRIPTION_MULTIPLIERS[newSubscriptionTier] || this.SUBSCRIPTION_MULTIPLIERS["none"];

    const updatedLimits = {
      maxConcurrentProjects: Math.floor((basePermissions.maxConcurrentProjects || 1) * multipliers.projects),
      maxDatasetSizeMB: Math.floor((basePermissions.maxDatasetSizeMB || 5) * multipliers.dataSize),
      maxAiQueriesPerMonth: Math.floor((basePermissions.maxAiQueriesPerMonth || 10) * multipliers.aiQueries),
      maxVisualizationsPerProject: Math.floor((basePermissions.maxVisualizationsPerProject || 3) * multipliers.visualizations),
      updatedAt: new Date(),
    };

    await db
      .update(userPermissions)
      .set(updatedLimits)
      .where(eq(userPermissions.userId, userId));
  }

  /**
   * Check if user has permission for a specific feature
   */
  static async hasPermission(userId: string, permission: keyof FeaturePermissions | string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);

      // Always allow canUseAI - it's a basic feature available to all authenticated users
      if (permission === 'canUseAI') {
        if (!permissions) {
          console.log(`✅ [PERMISSIONS] Allowing canUseAI for user ${userId} (no permissions record)`);
          return true;
        }
        const hasPermission = permissions.canUseAI ?? true;
        if (hasPermission) {
          console.log(`✅ [PERMISSIONS] User ${userId} has canUseAI permission`);
        }
        return hasPermission;
      }

      if (!permissions) {
        console.warn(`⚠️  [PERMISSIONS] No permissions record for user ${userId}, denying ${permission}`);
        return false;
      }

      // Handle canAccessAdvancedFeatures - map to canAccessAdvancedAnalytics if not set
      if (permission === 'canAccessAdvancedFeatures') {
        return permissions.canAccessAdvancedFeatures ?? permissions.canAccessAdvancedAnalytics ?? false;
      }

      // Standard permission check
      if (permission in permissions) {
        return (permissions[permission as keyof typeof permissions] as boolean) ?? false;
      }

      console.warn(`⚠️  [PERMISSIONS] Permission ${permission} not found in permissions record for user ${userId}`);
      return false;
    } catch (error) {
      console.error(`❌ [PERMISSIONS] Error checking permission ${permission} for user ${userId}:`, error);
      // Always allow canUseAI even on error (fail open for basic features)
      if (permission === 'canUseAI') {
        console.log(`✅ [PERMISSIONS] Error occurred, but allowing canUseAI as fallback for user ${userId}`);
        return true;
      }
      return false;
    }
  }

  /**
   * Check if user can access a specific journey type
   * All users can access all journey types - restrictions are based on subscription/billing
   */
  static async canAccessJourney(userId: string, journeyType: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    if (!permissions) return false;

    // All journey types are available to all users
    // Restrictions should be based on subscription/billing, not journey type
    switch (journeyType) {
      case "non-tech":
      case "business":
      case "technical":
      case "consultation":
      case "custom":
        return true; // All users can access all journey types
      // Legacy journey types (deprecated, but still supported for backward compatibility)
      case "ai_guided":      // Maps to non-tech
      case "template_based": // Maps to business
      case "self_service":   // Maps to technical
        return true;
      default:
        return false; // Invalid journey type
    }
  }

  /**
   * Check if user is within their usage limits
   */
  static async checkUsageLimits(userId: string): Promise<{
    withinLimits: boolean;
    limits: RoleBasedLimits;
    currentUsage: any;
  }> {
    const permissions = await this.getUserPermissions(userId);
    if (!permissions) {
      return {
        withinLimits: false,
        limits: this.DEFAULT_PERMISSIONS["non-tech"] as RoleBasedLimits,
        currentUsage: {},
      };
    }

    // Get current usage from user record
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const currentUsage = user.length > 0 ? {
      monthlyUploads: user[0].monthlyUploads || 0,
      monthlyDataVolume: user[0].monthlyDataVolume || 0,
      monthlyAIInsights: user[0].monthlyAIInsights || 0,
    } : {};

    const limits: RoleBasedLimits = {
      maxConcurrentProjects: permissions.maxConcurrentProjects || 1,
      maxDatasetSizeMB: permissions.maxDatasetSizeMB || 5,
      maxAiQueriesPerMonth: permissions.maxAiQueriesPerMonth || 10,
      maxVisualizationsPerProject: permissions.maxVisualizationsPerProject || 3,
      maxComputeMinutesPerMonth: permissions.maxComputeMinutesPerMonth || 60,
      allowedAiProviders: (permissions.allowedAiProviders as string[]) || ["gemini"],
      canUseAdvancedModels: permissions.canUseAdvancedModels || false,
    };

    const withinLimits = (currentUsage.monthlyAIInsights || 0) < limits.maxAiQueriesPerMonth;

    return {
      withinLimits,
      limits,
      currentUsage,
    };
  }

  /**
   * Get recommended journey for user based on their role and technical level
   */
  static getRecommendedJourney(userRole: UserRole, technicalLevel: TechnicalLevel): string {
    if (userRole === "consultation") return "consultation";

    switch (userRole) {
      case "non-tech":
        return "non-tech";
      case "business":
        return "business";
      case "technical":
        return technicalLevel === "expert" ? "technical" : "business";
      default:
        return "non-tech";
    }
  }

  /**
   * Update user role and recalculate permissions
   */
  static async updateUserRole(userId: string, newRole: UserRole, technicalLevel?: TechnicalLevel): Promise<void> {
    // Update user role
    await db
      .update(users)
      .set({
        userRole: newRole,
        technicalLevel: technicalLevel || "beginner",
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Get current subscription to recalculate permissions
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length > 0) {
      const subscriptionTier = user[0].subscriptionTier || "none";

      // Delete existing permissions
      await db
        .delete(userPermissions)
        .where(eq(userPermissions.userId, userId));

      // Create new permissions with updated role
      await this.createDefaultPermissions(userId, newRole, subscriptionTier);
    }
  }
}

// Express middleware for role-based access control
export const requirePermission = (permission: keyof FeaturePermissions) => {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const hasPermission = await RolePermissionService.hasPermission(userId, permission);
      if (!hasPermission) {
        return res.status(403).json({
          error: `Insufficient permissions: ${permission} required`,
          requiredPermission: permission
        });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      res.status(500).json({ error: "Permission check failed" });
    }
  };
};

// Express middleware for journey access control
export const requireJourneyAccess = (journeyType: string) => {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const canAccess = await RolePermissionService.canAccessJourney(userId, journeyType);
      if (!canAccess) {
        return res.status(403).json({
          error: `Access denied to ${journeyType} journey`,
          requiredJourney: journeyType
        });
      }

      next();
    } catch (error) {
      console.error("Journey access check error:", error);
      res.status(500).json({ error: "Journey access check failed" });
    }
  };
};

// Express middleware for usage limits
export const checkUsageLimits = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { withinLimits, limits, currentUsage } = await RolePermissionService.checkUsageLimits(userId);

    // Add limits info to request for downstream use
    req.userLimits = limits;
    req.currentUsage = currentUsage;

    if (!withinLimits) {
      return res.status(429).json({
        error: "Usage limits exceeded",
        limits,
        currentUsage
      });
    }

    next();
  } catch (error) {
    console.error("Usage limits check error:", error);
    res.status(500).json({ error: "Usage limits check failed" });
  }
};