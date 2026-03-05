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
  const coreJourneySteps = [
    'data',
    'prepare',
    'data-verification',
    'data-transformation',
    'plan',
    'execute',
    'pricing',
    'results'
  ];
  const resolveFallbackStep = (): string | undefined => {
    if (!journeyState || typeof journeyState !== 'object') {
      return undefined;
    }

    const state = journeyState as JourneyStateResponse;
    const currentIndex = state?.currentStep?.index;
    const totalSteps = Array.isArray(state?.steps) ? state.steps.length : undefined;
    if (typeof currentIndex !== 'number' || !totalSteps || totalSteps <= 1) {
      return undefined;
    }

    const scaledIndex = Math.round((currentIndex / (totalSteps - 1)) * (coreJourneySteps.length - 1));
    return coreJourneySteps[Math.max(0, Math.min(coreJourneySteps.length - 1, scaledIndex))];
  };
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

  // Get journey type from the state - default to 'non-tech' if not specified
  const journeyType = (journeyState as JourneyStateResponse)?.journeyType || 'non-tech';

  // Map journey steps to routes (8-step consolidated journey)
  // CRITICAL: Routes must match App.tsx pattern: /journeys/:type/:step
  const stepRoutes: Record<string, string> = {
    // Consolidated journey routes (8 steps) - using correct /journeys/:type/:step pattern
    'data': `/journeys/${journeyType}/data?projectId=${projectId}`,             // Step 1: Data Upload & Project Setup
    'prepare': `/journeys/${journeyType}/prepare?projectId=${projectId}`,       // Step 2: Prepare (goals, questions)
    'data-verification': `/journeys/${journeyType}/data-verification?projectId=${projectId}`, // Step 3: Verification
    'data-transformation': `/journeys/${journeyType}/data-transformation?projectId=${projectId}`, // Step 4: Transformation
    'plan': `/journeys/${journeyType}/plan?projectId=${projectId}`,             // Step 5: Analysis Plan
    'execute': `/journeys/${journeyType}/execute?projectId=${projectId}`,       // Step 6: Execution
    'pricing': `/journeys/${journeyType}/pricing?projectId=${projectId}`,       // Step 7: Billing
    'results': `/journeys/${journeyType}/results?projectId=${projectId}`,       // Step 8: Results
    'dashboard': `/journeys/${journeyType}/results?projectId=${projectId}`,     // Step 8: Dashboard (alias)

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
  const directRoute = stepRoutes[currentStepId];
  if (directRoute) {
    return ensureResumeFlag(directRoute);
  }

  const fallbackStep = resolveFallbackStep();
  if (fallbackStep && stepRoutes[fallbackStep]) {
    return ensureResumeFlag(stepRoutes[fallbackStep]);
  }

  return ensureResumeFlag(baseProjectRoute);
}
