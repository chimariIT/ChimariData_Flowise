/**
 * Checkpoint Service
 *
 * Domain: Checkpoint Management
 * Responsibilities: Checkpoint CRUD operations
 */

import { storage } from '../../services/storage';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../shared/utils/error-handling';

export interface CheckpointData {
  id: string;
  projectId: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: string;
  data?: any;
}

export class CheckpointService {
  /**
   * Create checkpoint
   */
  async createCheckpoint(projectId: string, userId: string, name: string, data?: any): Promise<CheckpointData> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    if (!name || !name.trim()) {
      throw new ValidationError('Checkpoint name is required');
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

    // Create checkpoint
    const checkpointId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    const checkpoint: CheckpointData = {
      id: checkpointId,
      projectId,
      name: name.trim(),
      status: 'pending',
      timestamp: new Date().toISOString(),
      data,
    };

    // Save to journey progress
    const currentJourneyProgress = (project as any)?.journeyProgress || {};
    const checkpoints = currentJourneyProgress.checkpoints || [];
    checkpoints.push(checkpoint);

    await storage.updateProject(projectId, {
      journeyProgress: {
        ...currentJourneyProgress,
        checkpoints,
      },
    } as any);

    return checkpoint;
  }

  /**
   * Get checkpoints for project
   */
  async getCheckpoints(projectId: string, userId: string): Promise<CheckpointData[]> {
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

    // Get checkpoints from journey progress
    const journeyProgress = (project as any)?.journeyProgress || {};
    return journeyProgress.checkpoints || [];
  }

  /**
   * Update checkpoint status
   */
  async updateCheckpointStatus(checkpointId: string, projectId: string, userId: string, status: CheckpointData['status']): Promise<void> {
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

    // Update checkpoint
    const journeyProgress = (project as any)?.journeyProgress || {};
    const checkpoints = journeyProgress.checkpoints || [];
    const checkpoint = checkpoints.find((cp: any) => cp.id === checkpointId);

    if (checkpoint) {
      checkpoint.status = status;
      checkpoint.timestamp = new Date().toISOString();

      await storage.updateProject(projectId, {
        journeyProgress: {
          ...journeyProgress,
          checkpoints,
        },
      } as any);
    }
  }

  /**
   * Delete checkpoint
   */
  async deleteCheckpoint(checkpointId: string, projectId: string, userId: string): Promise<boolean> {
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

    // Remove checkpoint
    const journeyProgress = (project as any)?.journeyProgress || {};
    const checkpoints = journeyProgress.checkpoints || [];
    const filtered = checkpoints.filter((cp: any) => cp.id !== checkpointId);

    await storage.updateProject(projectId, {
      journeyProgress: {
        ...journeyProgress,
        checkpoints: filtered,
      },
    } as any);

    return true;
  }
}

// Singleton instance
export const checkpointService = new CheckpointService();
