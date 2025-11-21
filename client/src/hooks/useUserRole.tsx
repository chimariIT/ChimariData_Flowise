import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { apiClient } from "@/lib/api";

export type UserRole = "non-tech" | "business" | "technical" | "consultation";
export type TechnicalLevel = "beginner" | "intermediate" | "advanced" | "expert";
export type SubscriptionTier = "none" | "trial" | "starter" | "professional" | "enterprise";

export interface UserPermissions {
  id: string;
  userId: string;
  canAccessNonTechJourney: boolean;
  canAccessBusinessJourney: boolean;
  canAccessTechnicalJourney: boolean;
  canRequestConsultation: boolean;
  canAccessAdvancedAnalytics: boolean;
  canUseCustomAiKeys: boolean;
  canGenerateCode: boolean;
  canAccessRawData: boolean;
  canExportResults: boolean;
  maxConcurrentProjects: number;
  maxDatasetSizeMB: number;
  maxAiQueriesPerMonth: number;
  maxVisualizationsPerProject: number;
  allowedAiProviders: string[];
  canUseAdvancedModels: boolean;
}

export interface UserRoleData {
  userRole: UserRole;
  technicalLevel: TechnicalLevel;
  subscriptionTier: SubscriptionTier;
  industry?: string;
  preferredJourney?: string;
  onboardingCompleted: boolean;
  permissions: UserPermissions | null;
  currentUsage: {
    monthlyUploads: number;
    monthlyDataVolume: number;
    monthlyAIInsights: number;
  };
}

interface UserRoleContextType {
  userRoleData: UserRoleData | null;
  loading: boolean;
  error: string | null;
  refreshUserRole: () => Promise<void>;
  updateUserRole: (role: UserRole, technicalLevel?: TechnicalLevel) => Promise<void>;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  canAccessJourney: (journeyType: string) => boolean;
  isWithinLimits: () => boolean;
  getRecommendedJourney: () => string;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

export function UserRoleProvider({ children }: { children: ReactNode }) {
  const [userRoleData, setUserRoleData] = useState<UserRoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUserRole = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if user has auth token before making request
      const token = localStorage.getItem('auth_token');
      if (!token) {
        // No token - user not authenticated, silently skip
        setUserRoleData(null);
        setLoading(false);
        return;
      }

      // apiClient.get() returns parsed JSON directly, not a Response object
      const data = await apiClient.get("/api/user/role-permissions");
      setUserRoleData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";

      // Only log error if it's not an authentication issue
      if (!errorMessage.includes("Authentication required")) {
        setError(errorMessage);
        console.error("Error fetching user role:", err);
      }
      // For auth errors, silently set user data to null (user not logged in)
      setUserRoleData(null);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (role: UserRole, technicalLevel: TechnicalLevel = "beginner") => {
    try {
      setError(null);

      const response = await apiClient.post("/api/user/update-role", {
        userRole: role,
        technicalLevel,
      });

      if (response.ok) {
        await fetchUserRole(); // Refresh data after update
      } else {
        throw new Error("Failed to update user role");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
      throw err;
    }
  };

  const hasPermission = (permission: keyof UserPermissions): boolean => {
    if (!userRoleData?.permissions) return false;
    return Boolean(userRoleData.permissions[permission]);
  };

  const canAccessJourney = (journeyType: string): boolean => {
    if (!userRoleData?.permissions) return false;

    // All users can access all journey types - restrictions are based on subscription/billing
    switch (journeyType) {
      case "non-tech":
      case "ai_guided":
      case "business":
      case "template_based":
      case "technical":
      case "self_service":
      case "consultation":
        return true; // All users can access all journey types
      default:
        return false; // Invalid journey type
    }
  };

  const isWithinLimits = (): boolean => {
    if (!userRoleData?.permissions || !userRoleData?.currentUsage) return false;

    const { permissions, currentUsage } = userRoleData;
    return currentUsage.monthlyAIInsights < permissions.maxAiQueriesPerMonth;
  };

  const getRecommendedJourney = (): string => {
    if (!userRoleData) return "non-tech";

    const { userRole, technicalLevel } = userRoleData;

    if (userRole === "consultation") return "consultation";

    switch (userRole) {
      case "non-tech":
        return "ai_guided";
      case "business":
        return "template_based";
      case "technical":
        return technicalLevel === "expert" ? "self_service" : "template_based";
      default:
        return "ai_guided";
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, []);

  const value: UserRoleContextType = {
    userRoleData,
    loading,
    error,
    refreshUserRole: fetchUserRole,
    updateUserRole,
    hasPermission,
    canAccessJourney,
    isWithinLimits,
    getRecommendedJourney,
  };

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const context = useContext(UserRoleContext);
  if (context === undefined) {
    throw new Error("useUserRole must be used within a UserRoleProvider");
  }
  return context;
}

// Convenience hooks for specific checks
export function useHasPermission(permission: keyof UserPermissions) {
  const { hasPermission } = useUserRole();
  return hasPermission(permission);
}

export function useCanAccessJourney(journeyType: string) {
  const { canAccessJourney } = useUserRole();
  return canAccessJourney(journeyType);
}

export function useIsWithinLimits() {
  const { isWithinLimits } = useUserRole();
  return isWithinLimits();
}

export function useUserRoleData() {
  const { userRoleData } = useUserRole();
  return userRoleData;
}