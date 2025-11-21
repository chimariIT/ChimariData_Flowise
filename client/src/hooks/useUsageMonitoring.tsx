import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { useUserRole } from "./useUserRole";
import { apiClient } from "@/lib/api";
import { useToast } from "./use-toast";

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

export interface UsageWarning {
  type: 'approaching' | 'exceeded' | 'critical';
  resource: keyof UsageMetrics;
  currentUsage: number;
  limit: number;
  percentageUsed: number;
  message: string;
  recommendedAction: string;
}

interface UsageMonitoringContextType {
  currentUsage: UsageMetrics | null;
  limits: UsageLimits | null;
  warnings: UsageWarning[];
  loading: boolean;
  error: string | null;
  refreshUsage: () => Promise<void>;
  checkCanPerformAction: (action: string, amount?: number) => Promise<boolean>;
  trackAction: (action: string, metadata?: any) => Promise<void>;
  getUsagePercentage: (resource: keyof UsageMetrics) => number;
  getRemainingUsage: (resource: keyof UsageMetrics) => number;
  shouldShowUpgradePrompt: () => boolean;
}

const UsageMonitoringContext = createContext<UsageMonitoringContextType | undefined>(undefined);

export function UsageMonitoringProvider({ children }: { children: ReactNode }) {
  const [currentUsage, setCurrentUsage] = useState<UsageMetrics | null>(null);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [warnings, setWarnings] = useState<UsageWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { userRoleData } = useUserRole();
  const { toast } = useToast();

  const fetchUsageData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // apiClient.get() returns parsed JSON directly, not a Response object
      const data = await apiClient.get("/api/usage/current");
      setCurrentUsage(data.usage);
      setLimits(data.limits);

      // Generate warnings based on usage
      const newWarnings = generateUsageWarnings(data.usage, data.limits);
      setWarnings(newWarnings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error fetching usage data:", err);
      // Don't block the app if usage monitoring fails
      setCurrentUsage(null);
      setLimits(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateUsageWarnings = (usage: UsageMetrics, limits: UsageLimits): UsageWarning[] => {
    const warnings: UsageWarning[] = [];

    // Check AI queries
    const aiPercentage = (usage.aiQueries / limits.maxAiQueries) * 100;
    if (aiPercentage >= 95) {
      warnings.push({
        type: 'critical',
        resource: 'aiQueries',
        currentUsage: usage.aiQueries,
        limit: limits.maxAiQueries,
        percentageUsed: aiPercentage,
        message: 'AI query limit nearly exhausted',
        recommendedAction: 'Upgrade your plan to continue using AI features'
      });
    } else if (aiPercentage >= 80) {
      warnings.push({
        type: 'approaching',
        resource: 'aiQueries',
        currentUsage: usage.aiQueries,
        limit: limits.maxAiQueries,
        percentageUsed: aiPercentage,
        message: 'Approaching AI query limit',
        recommendedAction: 'Consider upgrading to avoid interruption'
      });
    }

    // Check data volume
    const dataPercentage = (usage.dataVolumeMB / limits.maxDataVolumeMB) * 100;
    if (dataPercentage >= 95) {
      warnings.push({
        type: 'critical',
        resource: 'dataVolumeMB',
        currentUsage: usage.dataVolumeMB,
        limit: limits.maxDataVolumeMB,
        percentageUsed: dataPercentage,
        message: 'Data storage limit nearly exhausted',
        recommendedAction: 'Upgrade to increase storage capacity'
      });
    } else if (dataPercentage >= 80) {
      warnings.push({
        type: 'approaching',
        resource: 'dataVolumeMB',
        currentUsage: usage.dataVolumeMB,
        limit: limits.maxDataVolumeMB,
        percentageUsed: dataPercentage,
        message: 'Approaching data storage limit',
        recommendedAction: 'Consider upgrading for more storage'
      });
    }

    return warnings;
  };

  const checkCanPerformAction = async (action: string, amount: number = 1): Promise<boolean> => {
    try {
      // apiClient.post() returns parsed JSON directly
      const data = await apiClient.post("/api/usage/check", {
        action,
        amount
      });

      return data.allowed || false;
    } catch (err) {
      console.error("Error checking action permission:", err);
      return false;
    }
  };

  const trackAction = async (action: string, metadata: any = {}): Promise<void> => {
    try {
      // apiClient.post() returns parsed JSON directly
      await apiClient.post("/api/usage/track", {
        action,
        metadata
      });

      // Refresh usage data after tracking
      await fetchUsageData();

      // Check for new warnings and show notifications
      if (warnings.some(w => w.type === 'critical')) {
        toast({
          title: "Usage Limit Critical",
          description: "You're approaching your plan limits. Consider upgrading.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("Error tracking action:", err);
    }
  };

  const getUsagePercentage = (resource: keyof UsageMetrics): number => {
    if (!currentUsage || !limits) return 0;

    const usage = currentUsage[resource];
    let limit = 0;

    switch (resource) {
      case 'aiQueries':
        limit = limits.maxAiQueries;
        break;
      case 'dataUploads':
        limit = limits.maxDataUploads;
        break;
      case 'dataVolumeMB':
        limit = limits.maxDataVolumeMB;
        break;
      case 'projectsCreated':
        limit = limits.maxProjects;
        break;
      case 'visualizationsGenerated':
        limit = limits.maxVisualizations;
        break;
      case 'consultationMinutes':
        limit = limits.consultationMinutesIncluded;
        break;
      default:
        return 0;
    }

    return Math.round((usage / limit) * 100);
  };

  const getRemainingUsage = (resource: keyof UsageMetrics): number => {
    if (!currentUsage || !limits) return 0;

    const usage = currentUsage[resource];
    let limit = 0;

    switch (resource) {
      case 'aiQueries':
        limit = limits.maxAiQueries;
        break;
      case 'dataUploads':
        limit = limits.maxDataUploads;
        break;
      case 'dataVolumeMB':
        limit = limits.maxDataVolumeMB;
        break;
      case 'projectsCreated':
        limit = limits.maxProjects;
        break;
      case 'visualizationsGenerated':
        limit = limits.maxVisualizations;
        break;
      case 'consultationMinutes':
        limit = limits.consultationMinutesIncluded;
        break;
      default:
        return 0;
    }

    return Math.max(0, limit - usage);
  };

  const shouldShowUpgradePrompt = (): boolean => {
    return warnings.some(w => w.type === 'approaching' || w.type === 'critical');
  };

  // Fetch usage data when user role data changes
  useEffect(() => {
    if (userRoleData) {
      fetchUsageData();
    }
  }, [userRoleData, fetchUsageData]);

  // Set up periodic refresh (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (userRoleData) {
        fetchUsageData();
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [userRoleData, fetchUsageData]);

  const value: UsageMonitoringContextType = {
    currentUsage,
    limits,
    warnings,
    loading,
    error,
    refreshUsage: fetchUsageData,
    checkCanPerformAction,
    trackAction,
    getUsagePercentage,
    getRemainingUsage,
    shouldShowUpgradePrompt,
  };

  return (
    <UsageMonitoringContext.Provider value={value}>
      {children}
    </UsageMonitoringContext.Provider>
  );
}

export function useUsageMonitoring() {
  const context = useContext(UsageMonitoringContext);
  if (context === undefined) {
    throw new Error("useUsageMonitoring must be used within a UsageMonitoringProvider");
  }
  return context;
}

// Convenience hooks for specific usage checks
export function useCanPerformAction(action: string, amount: number = 1) {
  const { checkCanPerformAction } = useUsageMonitoring();
  const [canPerform, setCanPerform] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkAction = useCallback(async () => {
    setChecking(true);
    try {
      const allowed = await checkCanPerformAction(action, amount);
      setCanPerform(allowed);
    } catch (error) {
      setCanPerform(false);
    } finally {
      setChecking(false);
    }
  }, [checkCanPerformAction, action, amount]);

  useEffect(() => {
    checkAction();
  }, [checkAction]);

  return { canPerform, checking, recheckAction: checkAction };
}

export function useUsageTracker() {
  const { trackAction } = useUsageMonitoring();

  const trackAiQuery = useCallback(
    (queryType: 'simple' | 'advanced' | 'code_generation' = 'simple') =>
      trackAction('ai_query', { type: queryType }),
    [trackAction]
  );

  const trackDataUpload = useCallback(
    (fileSizeMB: number, fileType?: string) =>
      trackAction('data_upload', { sizeMB: fileSizeMB, type: fileType }),
    [trackAction]
  );

  const trackProjectCreation = useCallback(
    (projectType?: string) =>
      trackAction('project_creation', { type: projectType }),
    [trackAction]
  );

  const trackVisualizationGeneration = useCallback(
    (visualizationType?: string) =>
      trackAction('visualization_generation', { type: visualizationType }),
    [trackAction]
  );

  const trackCodeGeneration = useCallback(
    (language?: string) =>
      trackAction('code_generation', { language }),
    [trackAction]
  );

  return {
    trackAiQuery,
    trackDataUpload,
    trackProjectCreation,
    trackVisualizationGeneration,
    trackCodeGeneration,
  };
}

// Hook for usage statistics display
export function useUsageStats() {
  const { currentUsage, limits, getUsagePercentage, getRemainingUsage } = useUsageMonitoring();

  const getUsageStats = () => {
    if (!currentUsage || !limits) return null;

    return {
      aiQueries: {
        current: currentUsage.aiQueries,
        limit: limits.maxAiQueries,
        percentage: getUsagePercentage('aiQueries'),
        remaining: getRemainingUsage('aiQueries')
      },
      dataStorage: {
        current: currentUsage.dataVolumeMB,
        limit: limits.maxDataVolumeMB,
        percentage: getUsagePercentage('dataVolumeMB'),
        remaining: getRemainingUsage('dataVolumeMB')
      },
      projects: {
        current: currentUsage.projectsCreated,
        limit: limits.maxProjects,
        percentage: getUsagePercentage('projectsCreated'),
        remaining: getRemainingUsage('projectsCreated')
      }
    };
  };

  return getUsageStats();
}