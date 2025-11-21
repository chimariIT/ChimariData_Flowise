import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

export type JourneyStateStep = {
  id: string;
  name: string;
  description?: string;
  agent: string;
  tools?: string[];
  estimatedDuration?: number;
  index: number;
};

export type JourneyStateResponse = {
  projectId: string;
  projectName: string;
  journeyType: string | null;
  templateId: string;
  templateName: string;
  steps: JourneyStateStep[];
  currentStep: {
    id: string;
    name: string;
    index: number;
  };
  totalSteps: number;
  completedSteps: string[];
  percentComplete: number;
  estimatedTimeRemaining?: string;
  costs: {
    estimated: number;
    spent: number;
    remaining: number;
  };
  canResume: boolean;
};

type UseJourneyStateOptions = {
  enabled?: boolean;
};

export function useJourneyState(projectId?: string, options: UseJourneyStateOptions = {}) {
  return useQuery<JourneyStateResponse | null>({
    queryKey: ["journey-state", projectId],
    queryFn: async () => {
      if (!projectId) {
        return null;
      }
      const result = await apiClient.getJourneyState(projectId);
      return result;
    },
    enabled: Boolean(projectId) && (options.enabled ?? true),
    staleTime: 1000 * 30,
  });
}
