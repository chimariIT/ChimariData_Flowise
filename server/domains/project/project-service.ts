/**
 * Project Service - Core CRUD operations
 *
 * Domain: Project Management
 * Responsibilities: Project CRUD, journey initialization, billing integration
 */

import { storage } from '../../services/storage';
import type { JourneyType } from '../../shared/schema';
import { getBillingService } from '../../services/billing/unified-billing-service';
import { journeyStateManager } from '../../services/journey-state-manager';
import { projectAgentOrchestrator } from '../../services/project-agent-orchestrator';
import { canAccessProject, isAdmin } from '../../middleware/ownership';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  ProjectData,
} from './types';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/utils/error-handling';

const VALID_PROJECT_JOURNEYS: JourneyType[] = ["non-tech", "business", "technical", "consultation", "custom"];

/**
 * Normalize project journey type
 */
const normalizeProjectJourneyType = (value: unknown): JourneyType =>
  VALID_PROJECT_JOURNEYS.includes(value as JourneyType) ? (value as JourneyType) : "non-tech";

/**
 * Map project journey to agent journey
 */
const mapProjectJourneyToAgentJourney = (
  journeyType: JourneyType
): 'non-tech' | 'business' | 'technical' | 'consultation' => {
  switch (journeyType) {
    case 'business':
      return 'business';
    case 'technical':
      return 'technical';
    case 'consultation':
      return 'consultation';
    case 'custom':
      return 'consultation';
    case 'non-tech':
    default:
      return 'non-tech';
  }
};

export class ProjectService {
  /**
   * Create new project
   */
  async createProject(
    input: CreateProjectInput & { journeyType?: JourneyType },
    userId: string
  ): Promise<ProjectData> {
    // Validate input
    if (!input.name || !input.name.trim()) {
      throw new ValidationError('Project name is required');
    }

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Normalize journey type
    const requestedJourneyType = normalizeProjectJourneyType(input.journeyType);

    // Check billing/subscription access
    const billingService = getBillingService();
    const accessCheck = await billingService.canAccessJourney(userId, requestedJourneyType);

    if (!accessCheck.allowed) {
      throw new ForbiddenError(
        accessCheck.message || 'Journey access denied'
      );
    }

    // Create project
    const project = await storage.createProject({
      userId,
      name: input.name.trim(),
      description: input.description || '',
      journeyType: requestedJourneyType,
      isPaid: false,
      isTrial: true,
      dataSource: 'upload',
      fileType: '',
      fileName: '',
      fileSize: 0,
    });

    // Initialize journey state
    try {
      await journeyStateManager.initializeJourney(project.id, requestedJourneyType);
    } catch (stateError) {
      console.error('Failed to initialize journey progress:', stateError);
    }

    // Initialize project agents
    try {
      await projectAgentOrchestrator.initializeProjectAgents({
        projectId: project.id,
        userId,
        journeyType: mapProjectJourneyToAgentJourney(requestedJourneyType),
        projectName: input.name.trim(),
        description: input.description || ''
      });
    } catch (agentError) {
      console.error('Agent initialization failed:', agentError);
    }

    return project as ProjectData;
  }

  /**
   * Get project by ID with access control
   */
  async getProjectById(
    id: string,
    userId: string,
    userIsAdmin: boolean = false
  ): Promise<ProjectData> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Check access
    const accessCheck = await canAccessProject(userId, id, userIsAdmin);
    if (!accessCheck.allowed) {
      if (accessCheck.reason === 'Project not found') {
        throw new NotFoundError('Project not found');
      }
      throw new ForbiddenError(accessCheck.reason);
    }

    // Get project
    const project = await storage.getProject(id);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Get associated datasets
    const datasets = await storage.getProjectDatasets(id);
    const primaryAssociation = datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    const schema = (project as any).schema ?? primaryDataset?.schema ?? null;
    const recordCount = (project as any).recordCount ?? primaryDataset?.recordCount ?? null;

    const datasetSummaries = datasets.map(({ dataset, association }) => {
      const datasetName =
        association?.alias ||
        (dataset as any)?.name ||
        (association as any)?.datasetName ||
        dataset.originalFileName ||
        association.datasetId;

      return {
        id: dataset.id,
        name: datasetName,
        role: association.role,
        sourceType: dataset.sourceType,
        recordCount: dataset.recordCount ?? null,
        addedAt: association.addedAt ?? null,
      };
    });

    return {
      ...project,
      schema,
      recordCount,
      datasetSummaries,
      primaryDatasetId: primaryDataset?.id ?? null,
    } as ProjectData;
  }

  /**
   * Update project with access control
   */
  async updateProject(
    id: string,
    updates: UpdateProjectInput,
    userId: string,
    userIsAdmin: boolean = false
  ): Promise<boolean> {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    // Verify ownership
    const project = await storage.getProject(id);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const accessCheck = await canAccessProject(userId, id, userIsAdmin);
    if (!accessCheck.allowed) {
      throw new ForbiddenError('Unauthorized access to project');
    }

    // Filter allowed updates to prevent overwriting critical fields
    const allowedUpdates: any = {};
    if (updates.description !== undefined) allowedUpdates.description = updates.description;
    if (updates.name !== undefined) allowedUpdates.name = updates.name;
    if (updates.status !== undefined) allowedUpdates.status = updates.status;
    if (updates.journeyProgress !== undefined) allowedUpdates.journeyProgress = updates.journeyProgress;
    if (updates.industry !== undefined) allowedUpdates.industry = updates.industry;

    // Add other allowed fields as needed

    const updatedProject = await storage.updateProject(id, allowedUpdates);
    return !!updatedProject;
  }

  /**
   * Delete project with access control
   */
  async deleteProject(
    id: string,
    userId: string,
    userIsAdmin: boolean = false
  ): Promise<boolean> {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    // Verify ownership
    const project = await storage.getProject(id);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const accessCheck = await canAccessProject(userId, id, userIsAdmin);
    if (!accessCheck.allowed) {
      throw new ForbiddenError('Unauthorized access to project');
    }

    // Delete project
    return await storage.deleteProject(id);
  }

  /**
   * Get all projects for user
   */
  async getProjectsByUser(userId: string): Promise<ProjectData[]> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    const projects = await storage.getProjectsByOwner(userId);
    return projects as ProjectData[];
  }

  /**
   * Check if user can access project
   */
  async canAccessProject(
    userId: string,
    projectId: string,
    userIsAdmin: boolean = false
  ): Promise<{ allowed: boolean; reason?: string; project?: any }> {
    return await canAccessProject(userId, projectId, userIsAdmin);
  }
}

// Singleton instance
export const projectService = new ProjectService();
