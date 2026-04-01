/**
 * Journey Service
 *
 * Domain: Journey Progress Management
 * Responsibilities: Initialize journey, update progress, get status
 */

import { storage } from '../../services/storage';
import { journeyStateManager } from '../../services/journey-state-manager';
import type { JourneyType } from '../../shared/schema';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../shared/utils/error-handling';

export interface JourneyStatus {
  projectId: string;
  journeyType: JourneyType;
  currentStep?: string;
  completedSteps: string[];
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
}

export interface UpdateJourneyProgressInput {
  projectId: string;
  userId: string;
  step?: string;
  completed?: boolean;
  data?: any;
}

export class JourneyService {
  /**
   * Initialize journey for project
   */
  async initializeJourney(projectId: string, userId: string, journeyType: JourneyType): Promise<void> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Initialize journey state
    await journeyStateManager.initializeJourney(projectId, journeyType);
  }

  /**
   * Update journey progress
   */
  async updateProgress(input: UpdateJourneyProgressInput): Promise<void> {
    const { projectId, userId, step, completed, data } = input;

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get current journey progress
    const currentJourneyProgress = (project as any)?.journeyProgress || {};
    const completedSteps = currentJourneyProgress.completedSteps || [];
    const currentStep = currentJourneyProgress.currentStep;

    // Update based on input
    const updates: any = { journeyProgress: { ...currentJourneyProgress } };

    if (step && completed) {
      if (!completedSteps.includes(step)) {
        completedSteps.push(step);
      }
      updates.journeyProgress.completedSteps = completedSteps;
      updates.journeyProgress.currentStep = this.getNextStep(completedSteps);
    } else if (step) {
      updates.journeyProgress.currentStep = step;
    }

    if (data) {
      updates.journeyProgress = { ...updates.journeyProgress, ...data };
    }

    // Update project
    await storage.updateProject(projectId, updates);
  }

  /**
   * Get journey status
   */
  async getJourneyStatus(projectId: string, userId: string): Promise<JourneyStatus> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get journey progress
    const journeyProgress = (project as any)?.journeyProgress || {};
    const completedSteps = journeyProgress.completedSteps || [];
    const currentStep = journeyProgress.currentStep;
    const journeyType = (project as any)?.journeyType || 'non-tech';

    // Determine status
    let status: 'not_started' | 'in_progress' | 'completed' | 'failed' = 'not_started';
    if (completedSteps.length > 0) {
      status = 'in_progress';
    }
    if (journeyProgress.isCompleted || currentStep === 'completed') {
      status = 'completed';
    }
    if (journeyProgress.isFailed || journeyProgress.hasError) {
      status = 'failed';
    }

    return {
      projectId,
      journeyType,
      currentStep,
      completedSteps,
      status,
    };
  }

  /**
   * Get next step in journey
   */
  private getNextStep(completedSteps: string[]): string {
    const stepOrder = ['upload', 'verify', 'goals', 'plan', 'transform', 'execute', 'pricing', 'results'];

    for (const step of stepOrder) {
      if (!completedSteps.includes(step)) {
        return step;
      }
    }

    return 'completed';
  }
}

// Singleton instance
export const journeyService = new JourneyService();
