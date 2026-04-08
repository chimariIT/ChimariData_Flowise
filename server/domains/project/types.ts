/**
 * Project Domain Types
 */

import type {
  ProjectStatus,
  ProjectIndustry,
  ProjectConfig,
  JourneyProgress,
  JoinedData,
  Checkpoint,
} from '../../shared/types/project-types';

// Re-export shared types for convenience
export type {
  ProjectStatus,
  ProjectIndustry,
  ProjectConfig,
  JourneyProgress,
  JoinedData,
  Checkpoint,
};

// Domain-specific interfaces
export interface CreateProjectInput {
  name: string;
  description?: string;
  industry?: ProjectIndustry;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  industry?: ProjectIndustry;
  status?: ProjectStatus;
  journeyProgress?: Partial<JourneyProgress>;
}

export interface ProjectData extends ProjectConfig {
  datasets?: DatasetData[];
}

export interface DatasetData {
  id: string;
  name: string;
  originalFileName: string;
  status: string;
}
