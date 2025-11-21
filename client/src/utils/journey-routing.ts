/**
 * Journey routing utilities
 * Handles navigation logic for resuming journeys at the correct step
 */

import type { JourneyStateResponse } from "@/hooks/useJourneyState";

type JourneyStateLike =
  | JourneyStateResponse
  | {
      currentStep?: string | { id?: string | null; name?: string; index?: number } | null;
      completedSteps?: string[];
      status?: string | null;
      canResume?: boolean;
    }
  | null
  | undefined;

const resolveCurrentStepId = (journeyState: JourneyStateLike): string | undefined => {
  if (!journeyState) {
    return undefined;
  }

  const currentStep = (journeyState as JourneyStateResponse | { currentStep?: unknown }).currentStep;
  if (!currentStep) {
    return undefined;
  }

  if (typeof currentStep === "string") {
    return currentStep;
  }

  if (typeof currentStep === "object" && "id" in currentStep) {
    const candidate = (currentStep as { id?: unknown }).id;
    return typeof candidate === "string" ? candidate : undefined;
  }

  return undefined;
};

/**
 * Determines if a journey can be resumed based on its state
 */
export function canResumeJourney(journeyState: JourneyStateLike): boolean {
  if (!journeyState) {
    return false;
  }

  if (typeof journeyState === "object" && journeyState !== null && "canResume" in journeyState) {
    const explicit = (journeyState as JourneyStateResponse).canResume;
    if (typeof explicit === "boolean") {
      return explicit;
    }
  }

  const status = (journeyState as { status?: string }).status;
  if (status === "completed") {
    return false;
  }

  return !!resolveCurrentStepId(journeyState);
}

/**
 * Gets the route to resume a journey based on project ID and journey state
 */
export async function getResumeRoute(
  projectId: string,
  journeyState: JourneyStateLike
): Promise<string> {
  const currentStepId = resolveCurrentStepId(journeyState);
  const baseProjectRoute = `/project/${projectId}`;
  const ensureResumeFlag = (route: string): string => {
    if (!route) {
      return `${baseProjectRoute}?resume=true`;
    }

    if (route.includes('resume=')) {
      return route;
    }

    return route.includes('?') ? `${route}&resume=true` : `${route}?resume=true`;
  };

  if (!currentStepId) {
    // No identifiable step, return project page with resume flag to trigger auto-handling
    return ensureResumeFlag(baseProjectRoute);
  }

  // Map journey steps to routes
  const stepRoutes: Record<string, string> = {
    // Legacy guided journey routes
    'project-setup': `/project-setup-step/${projectId}`,
    'data': `/data-step/${projectId}`,
    'data-verification': `/data-verification-step/${projectId}`,
    'plan': `/plan-step/${projectId}`,
    'prepare': `/prepare-step/${projectId}`,
    'execute': `/execute-step/${projectId}`,
    'results-preview': `/results-preview-step/${projectId}`,
    'results': `/results-step/${projectId}`,

    // Enhanced non-tech journey (default) step routes fall back to project experience tabs
    'intake_alignment': `${baseProjectRoute}?resume=true&tab=overview&step=intake_alignment`,
    'auto_schema_detection': `${baseProjectRoute}?resume=true&tab=schema&step=auto_schema_detection`,
    'data_preparation': `${baseProjectRoute}?resume=true&tab=datasets&step=data_preparation`,
    'guided_analysis': `${baseProjectRoute}?resume=true&tab=analysis&step=guided_analysis`,
    'insight_curation': `${baseProjectRoute}?resume=true&tab=insights&step=insight_curation`,
    'visual_storytelling': `${baseProjectRoute}?resume=true&tab=analysis&step=visual_storytelling`,
    'executive_hand_off': `${baseProjectRoute}?resume=true&tab=overview&step=executive_hand_off`,
  };

  // Return the route for the current step, or project page with resume flag as fallback
  return ensureResumeFlag(stepRoutes[currentStepId] || baseProjectRoute);
}
