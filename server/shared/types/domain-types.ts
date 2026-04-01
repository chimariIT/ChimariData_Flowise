/**
 * Domain Types - Common interfaces used across all domains
 */

export interface DomainEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Identifiable {
  id: string;
}

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Owned extends Identifiable {
  userId: string;
}

export interface ProjectReference {
  projectId: string;
  projectName?: string;
}

export interface DatasetReference {
  datasetId: string;
  datasetName?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FilterOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export type ValidationResult<T = any> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };
