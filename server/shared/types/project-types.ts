/**
 * Project Domain Types
 */

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived';

export type ProjectIndustry =
  | 'general'
  | 'technology'
  | 'healthcare'
  | 'finance'
  | 'retail'
  | 'manufacturing'
  | 'other';

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  industry?: ProjectIndustry;
  status: ProjectStatus;
  journeyProgress?: JourneyProgress;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface JourneyProgress {
  joinedData?: JoinedData;
  transformationApplied?: boolean;
  requirementsDocument?: any;
  checkpoints?: Checkpoint[];
  hasJoinedDataset?: boolean;
}

export interface JoinedData {
  fullData?: any[];
  preview?: any[];
  schema?: any;
  rowCount?: number;
  joinConfig?: any;
}

export interface Checkpoint {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp: string;
}
