import { db } from '../db';
import { projects } from '@shared/schema';
import {
  defaultJourneyTemplateCatalog,
  JourneyTemplate,
  JourneyTemplateJourneyType,
  JourneyTemplateStep,
} from '@shared/journey-templates';
import type { JourneyType } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface JourneyProgressState {
  templateId: string;
  currentStepId: string;
  currentStepIndex: number;
  currentStepName: string;
  totalSteps: number;
  completedSteps: string[];
  percentComplete: number;
  lastStepCompletedAt?: string;
  estimatedTimeRemaining?: string;
}

export interface JourneyState {
  projectId: string;
  projectName: string;
  journeyType: string | null;
  templateId: string;
  templateName: string;
  steps: Array<JourneyTemplateStep & { index: number }>;
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
}

const PROJECT_TO_TEMPLATE: Record<JourneyType, JourneyTemplateJourneyType> = {
  'non-tech': 'non-tech',
  'business': 'business',
  'technical': 'technical',
  'consultation': 'consultation',
  'custom': 'consultation', // Custom uses consultation template as fallback
};

function mapJourneyType(journeyType: string | null | undefined): JourneyTemplateJourneyType {
  if (journeyType && (journeyType as JourneyType) in PROJECT_TO_TEMPLATE) {
    return PROJECT_TO_TEMPLATE[journeyType as JourneyType];
  }
  return 'non-tech';
}

function flattenTemplate(template: JourneyTemplate): JourneyTemplate {
  return JSON.parse(JSON.stringify(template));
}

function findTemplateById(templateId: string): JourneyTemplate | null {
  for (const key of Object.keys(defaultJourneyTemplateCatalog) as JourneyTemplateJourneyType[]) {
    const match = defaultJourneyTemplateCatalog[key].find((tpl) => tpl.id === templateId);
    if (match) {
      return flattenTemplate(match);
    }
  }
  return null;
}

function getTemplateForProject(journeyType: string | null | undefined, templateId?: string | null): JourneyTemplate {
  if (templateId) {
    const resolved = findTemplateById(templateId);
    if (resolved) {
      return resolved;
    }
  }

  const normalized = mapJourneyType(journeyType);
  const catalogEntry = defaultJourneyTemplateCatalog[normalized]?.[0];
  if (!catalogEntry) {
    throw new Error(`No journey template configured for type ${normalized}`);
  }
  return flattenTemplate(catalogEntry);
}

function calculateTimeRemaining(template: JourneyTemplate, currentStepIndex: number): string | undefined {
  const remainingSteps = template.steps.slice(Math.max(currentStepIndex, 0));
  if (remainingSteps.length === 0) {
    return undefined;
  }

  // estimatedDuration is now in seconds (not minutes) for < 1 minute SLA
  const totalSeconds = remainingSteps.reduce((total, step) => total + (step.estimatedDuration ?? 0), 0);
  if (totalSeconds <= 0) {
    return undefined;
  }

  // Format time for display - prioritize seconds for < 1 minute SLA
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds !== 1 ? 's' : ''}`;
  }

  // If 60+ seconds, convert to minutes with seconds for precision
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  if (remainingSeconds === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  // Show both minutes and seconds for clarity
  return `${minutes}m ${remainingSeconds}s`;
}

export class JourneyStateManager {
  private ensureStepIndex(template: JourneyTemplate, stepId: string): number {
    const index = template.steps.findIndex((step) => step.id === stepId);
    if (index === -1) {
      throw new Error(`Step ${stepId} not found in template ${template.id}`);
    }
    return index;
  }

  private buildProgress(template: JourneyTemplate, completedSteps: string[], nextIndex: number): JourneyProgressState {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), template.steps.length - 1);
    const currentStep = template.steps[boundedIndex];
    const percent = Math.round((completedSteps.length / template.steps.length) * 100);

    // If all steps are completed, don't show time remaining
    const isFullyComplete = completedSteps.length >= template.steps.length;
    const timeRemaining = isFullyComplete ? undefined : calculateTimeRemaining(template, boundedIndex);

    return {
      templateId: template.id,
      currentStepId: currentStep?.id ?? template.steps[template.steps.length - 1].id,
      currentStepIndex: boundedIndex,
      currentStepName: currentStep?.name ?? 'Completed',
      totalSteps: template.steps.length,
      completedSteps,
      percentComplete: Math.min(percent, 100),
      lastStepCompletedAt: new Date().toISOString(),
      estimatedTimeRemaining: timeRemaining,
    };
  }

  async initializeJourney(projectId: string, journeyType: string | null | undefined): Promise<void> {
    if (!db) return;

    const template = getTemplateForProject(journeyType);
    const firstStep = template.steps[0];

    const progress: JourneyProgressState = {
      templateId: template.id,
      currentStepId: firstStep.id,
      currentStepIndex: 0,
      currentStepName: firstStep.name,
      totalSteps: template.steps.length,
      completedSteps: [],
      percentComplete: 0,
      estimatedTimeRemaining: calculateTimeRemaining(template, 0),
    };

    await db
      .update(projects)
      .set({
        journeyProgress: progress,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  }

  async completeStep(projectId: string, completedStepId: string): Promise<void> {
    if (!db) return;

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const template = getTemplateForProject(project.journeyType as string, (project as any).journeyProgress?.templateId);
    const stepIndex = this.ensureStepIndex(template, completedStepId);

    const progress: JourneyProgressState = (project as any).journeyProgress ?? null;
    const completedSteps = Array.isArray(progress?.completedSteps) ? [...progress!.completedSteps] : [];

    if (!completedSteps.includes(completedStepId)) {
      completedSteps.push(completedStepId);
    }

    const nextIndex = Math.min(stepIndex + 1, template.steps.length - 1);
    const updatedProgress = this.buildProgress(template, completedSteps, nextIndex);

    await db
      .update(projects)
      .set({
        journeyProgress: {
          ...updatedProgress,
          lastStepCompletedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId));
  }

  async getJourneyState(projectId: string): Promise<JourneyState> {
    if (!db) {
      throw new Error('Database connection not available');
    }

    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    let progress: JourneyProgressState | null = (project as any).journeyProgress ?? null;

    if (!progress || !progress.currentStepId) {
      await this.initializeJourney(projectId, project.journeyType as string);
      const [updated] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      progress = (updated as any).journeyProgress ?? null;
    }

    const template = getTemplateForProject(project.journeyType as string, progress?.templateId);
    const stepsWithIndex = template.steps.map((step, index) => ({ ...step, index }));

    const completedSteps = Array.isArray(progress?.completedSteps) ? progress!.completedSteps : [];
    // Recalculate percent complete to ensure it matches current template
    const calculatedPercent = Math.round((completedSteps.length / template.steps.length) * 100);
    const percentComplete = Math.min(calculatedPercent, 100);
    const currentStepIndex = progress?.currentStepIndex ?? 0;
    const currentStep = stepsWithIndex[currentStepIndex] ?? stepsWithIndex[stepsWithIndex.length - 1];

    const estimatedCost = Number((project as any).lockedCostEstimate ?? 0);
    const spentCost = Number((project as any).totalCostIncurred ?? 0);

    // Always recalculate estimatedTimeRemaining from template (don't use stored value)
    // This ensures we always use the latest template durations (now in seconds)
    const estimatedTimeRemaining = calculateTimeRemaining(template, currentStepIndex);

    return {
      projectId,
      projectName: project.name,
      journeyType: project.journeyType ?? null,
      templateId: template.id,
      templateName: template.title,
      steps: stepsWithIndex,
      currentStep: {
        id: currentStep?.id,
        name: currentStep?.name,
        index: currentStep?.index ?? 0,
      },
      totalSteps: template.steps.length,
      completedSteps,
      percentComplete,
      estimatedTimeRemaining, // Recalculated from template, not from stored value
      costs: {
        estimated: estimatedCost,
        spent: spentCost,
        remaining: Math.max(estimatedCost - spentCost, 0),
      },
      canResume: Boolean(progress?.currentStepId) && percentComplete < 100,
    };
  }
}

export const journeyStateManager = new JourneyStateManager();
