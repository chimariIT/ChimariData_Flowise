import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

// Journey progress state type matching server-side JourneyProgressState
// Extended to include all properties used across the frontend
export interface JourneyProgress {
  // Core journey tracking (from JourneyProgressState)
  templateId?: string;
  currentStepId?: string;
  currentStepIndex?: number;
  currentStepName?: string;
  currentStep?: string;
  totalSteps?: number;
  completedSteps?: string[];
  percentComplete?: number;
  lastStepCompletedAt?: string;
  estimatedTimeRemaining?: string;

  // User input data - use structured format only, with fallback handling in components
  userQuestions?: Array<{ id: string; text: string }>;
  audience?: {
    primary?: string;
    secondary?: string[];
    decisionContext?: string;
  };
  analysisGoal?: string;

  // Dataset and transformation data
  uploadedDatasetIds?: string[];
  joinedData?: {
    schema?: Record<string, any>;
    preview?: any[];
    transformedSchema?: Record<string, any>;
    transformationMappings?: any[];
    [key: string]: any;
  };
  requirementsDocument?: {
    requiredDataElements?: any[];
    questionAnswerMapping?: any[];
    [key: string]: any;
  };
  transformationMappings?: any[];
  transformedSchema?: Record<string, any>;

  // Execution data
  executionConfig?: Record<string, any>;
  executionSummary?: {
    totalAnalyses?: number;
    completedAnalyses?: number;
    analysisTypes?: string[];
    [key: string]: any;
  };

  // Approval states
  dataQualityApproved?: boolean;
  transformationApprovedAt?: string;
  piiDecision?: any;
  piiDecisionsByFile?: Record<string, any>;

  // Agent recommendations
  agentRecommendations?: any[];

  // Timestamps
  stepTimestamps?: Record<string, string>;

  // Allow additional properties for flexibility
  [key: string]: any;
}

export function useProject(projectId?: string) {
    const queryClient = useQueryClient();

    // Fetch project data (including journeyProgress)
    const query = useQuery({
        queryKey: ["project", projectId],
        queryFn: async () => {
            if (!projectId) return null;
            return apiClient.getProject(projectId);
        },
        enabled: Boolean(projectId),
        staleTime: 0, // Always refetch on mount - critical for step navigation
        refetchOnMount: 'always', // Always refetch on mount to ensure fresh data after navigation
    });

    // Mutation to update journeyProgress
    // FIX: Accept projectId override to handle stale closure issues when projectId changes after hook mount
    const updateProgressMutation = useMutation({
        mutationFn: async (params: Partial<JourneyProgress> & { _projectIdOverride?: string }) => {
            // Use override if provided (for cases where projectId changed after hook mount)
            const { _projectIdOverride, ...progressUpdate } = params;
            const effectiveProjectId = _projectIdOverride || projectId;
            if (!effectiveProjectId) throw new Error("Project ID is required for updates");
            return apiClient.updateProjectProgress(effectiveProjectId, progressUpdate);
        },
        onSuccess: (data) => {
            // DEFENSE-IN-DEPTH: Merge response journeyProgress into cache instead of replacing.
            // This prevents late-arriving responses from older mutations from wiping newer keys.
            // E.g., if auto-save response arrives after requirementsDocument was saved,
            // the merge preserves requirementsDocument while adding auto-save keys.
            queryClient.setQueryData(["project", projectId], (old: any) => {
                if (!old) return old;
                const existingProgress = old.journeyProgress || {};
                const responseProgress = data.journeyProgress || {};
                return {
                    ...old,
                    journeyProgress: { ...existingProgress, ...responseProgress },
                    updatedAt: new Date().toISOString()
                };
            });
            // Invalidate to refetch authoritative state from server
            queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        },
    });

    return {
        projectId: projectId || query.data?.id || null, // Return projectId for convenience
        project: query.data,
        journeyProgress: (query.data?.journeyProgress as JourneyProgress) || null,
        isLoading: query.isLoading,
        isError: query.isError,
        error: query.error,
        updateProgress: updateProgressMutation.mutate,
        updateProgressAsync: updateProgressMutation.mutateAsync, // Async variant for awaiting
        queryClient, // Expose for manual cache control
        isUpdating: updateProgressMutation.isPending,
        updateError: updateProgressMutation.error,
    };
}
