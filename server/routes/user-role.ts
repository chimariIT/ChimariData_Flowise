import { Router } from "express";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { RolePermissionService } from "../services/role-permission.js";
import { SubscriptionJourneyMappingService } from "../services/subscription-journey-mapping.js";
import { tokenStorage } from "../token-storage.js";
import { storage } from "../services/storage.js";
import { getAuthHeader } from "../utils/auth-headers";
import type { UserRole, TechnicalLevel } from "../../shared/schema.js";

const router = Router();

// Helper function to extract user from token (following usage.ts pattern)
async function getUserFromRequest(req: any): Promise<any> {
  const authHeader = getAuthHeader(req);
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenData = tokenStorage.validateToken(token);
    if (tokenData) {
      const user = await storage.getUser(tokenData.userId);
      return user;
    }
  }
  return null;
}

// Get user role and permissions
router.get("/role-permissions", async (req, res) => {
  try {
    const authenticatedUser = await getUserFromRequest(req);
    const userId = authenticatedUser?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user data from database
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecords.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userRecords[0];

    // Get user permissions
    const permissions = await RolePermissionService.getUserPermissions(userId);

    // Get usage limits and current usage
    const { limits, currentUsage } = await RolePermissionService.checkUsageLimits(userId);

    // Get subscription features for this role
    const subscriptionFeatures = SubscriptionJourneyMappingService.getSubscriptionFeatures(
      userData.userRole as UserRole || "non-tech",
      userData.subscriptionTier || "none"
    );

    // Check if user should be prompted to upgrade
    const upgradePrompt = SubscriptionJourneyMappingService.shouldPromptUpgrade(
      userData.userRole as UserRole || "non-tech",
      userData.subscriptionTier || "none",
      {
        monthlyAIInsights: userData.monthlyAIInsights || 0,
        monthlyUploads: userData.monthlyUploads || 0,
        monthlyDataVolume: userData.monthlyDataVolume || 0,
      }
    );

    const response = {
      userRole: userData.userRole || "non-tech",
      technicalLevel: userData.technicalLevel || "beginner",
      subscriptionTier: userData.subscriptionTier || "none",
      industry: userData.industry,
      preferredJourney: userData.preferredJourney,
      onboardingCompleted: userData.onboardingCompleted || false,
      permissions,
      currentUsage: {
        monthlyUploads: userData.monthlyUploads || 0,
        monthlyDataVolume: userData.monthlyDataVolume || 0,
        monthlyAIInsights: userData.monthlyAIInsights || 0,
      },
      limits,
      subscriptionFeatures,
      upgradePrompt,
      recommendedJourney: RolePermissionService.getRecommendedJourney(
        userData.userRole as UserRole || "non-tech",
        userData.technicalLevel as TechnicalLevel || "beginner"
      ),
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching user role data:", error);
    res.status(500).json({ error: "Failed to fetch user role data" });
  }
});

// Update user role
router.post("/update-role", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { userRole, technicalLevel, industry } = req.body;

    // Validate input
    const validRoles: UserRole[] = ["non-tech", "business", "technical", "consultation"];
    const validLevels: TechnicalLevel[] = ["beginner", "intermediate", "advanced", "expert"];

    if (!validRoles.includes(userRole)) {
      return res.status(400).json({ error: "Invalid user role" });
    }

    if (technicalLevel && !validLevels.includes(technicalLevel)) {
      return res.status(400).json({ error: "Invalid technical level" });
    }

    // Update user role using the service
    await RolePermissionService.updateUserRole(userId, userRole, technicalLevel || "beginner");

    // Update additional profile fields if provided
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (industry) {
      updateData.industry = industry;
    }

    // Set preferred journey based on role
    updateData.preferredJourney = RolePermissionService.getRecommendedJourney(userRole, technicalLevel || "beginner");

    // Mark onboarding as completed
    updateData.onboardingCompleted = true;

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: "User role updated successfully",
      userRole,
      technicalLevel: technicalLevel || "beginner",
      preferredJourney: updateData.preferredJourney
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ error: "Failed to update user role" });
  }
});

// Update user profile (industry, preferences, etc.)
router.post("/update-profile", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { industry, preferredJourney } = req.body;

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (industry) {
      updateData.industry = industry;
    }

    if (preferredJourney) {
      updateData.preferredJourney = preferredJourney;
    }

    await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: "Profile updated successfully"
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Get available journeys for user
router.get("/available-journeys", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user data
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = user[0];
    const userRole = userData.userRole as UserRole || "non-tech";
    const subscriptionTier = userData.subscriptionTier || "none";

    // Get available journeys based on role and subscription
    const availableJourneys = SubscriptionJourneyMappingService.getAvailableJourneys(userRole, subscriptionTier);

    // Get detailed journey information with permissions
    const journeyDetails = await Promise.all(
      availableJourneys.map(async (journeyType) => {
        const canAccess = await RolePermissionService.canAccessJourney(userId, journeyType);
        return {
          type: journeyType,
          canAccess,
          recommended: RolePermissionService.getRecommendedJourney(userRole, userData.technicalLevel as TechnicalLevel || "beginner") === journeyType
        };
      })
    );

    res.json({
      availableJourneys: journeyDetails,
      userRole,
      subscriptionTier,
      recommendedJourney: RolePermissionService.getRecommendedJourney(userRole, userData.technicalLevel as TechnicalLevel || "beginner")
    });
  } catch (error) {
    console.error("Error fetching available journeys:", error);
    res.status(500).json({ error: "Failed to fetch available journeys" });
  }
});

// Check specific permission
router.get("/check-permission/:permission", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { permission } = req.params;
    const hasPermission = await RolePermissionService.hasPermission(userId, permission as any);

    res.json({
      permission,
      hasPermission
    });
  } catch (error) {
    console.error("Error checking permission:", error);
    res.status(500).json({ error: "Failed to check permission" });
  }
});

// Check journey access
router.get("/check-journey/:journeyType", async (req, res) => {
  try {
    const user = await getUserFromRequest(req);
    const userId = user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { journeyType } = req.params;
    const canAccess = await RolePermissionService.canAccessJourney(userId, journeyType);

    res.json({
      journeyType,
      canAccess
    });
  } catch (error) {
    console.error("Error checking journey access:", error);
    res.status(500).json({ error: "Failed to check journey access" });
  }
});

// Get subscription pricing for user's role
router.get("/subscription-pricing", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Get user data
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = user[0];
    const userRole = userData.userRole as UserRole || "non-tech";

    // Get pricing for this role
    const pricing = SubscriptionJourneyMappingService.getSubscriptionPricing(userRole);

    // Get feature comparison
    const featureComparison = SubscriptionJourneyMappingService.getFeatureComparison(userRole);

    res.json({
      userRole,
      pricing,
      featureComparison,
      currentTier: userData.subscriptionTier || "none"
    });
  } catch (error) {
    console.error("Error fetching subscription pricing:", error);
    res.status(500).json({ error: "Failed to fetch subscription pricing" });
  }
});

// Complete onboarding
router.post("/complete-onboarding", async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    await db
      .update(users)
      .set({
        onboardingCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    res.json({
      success: true,
      message: "Onboarding completed successfully"
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

export default router;