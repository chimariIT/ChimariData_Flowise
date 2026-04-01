/**
 * Dataset Domain Types
 */

export type DatasetStatus = 'uploading' | 'verifying' | 'ready' | 'error';

export interface DatasetConfig {
  id: string;
  projectId: string;
  name: string;
  originalFileName: string;
  mimeType: string;
  size: number;
  status: DatasetStatus;
  data?: any[];
  preview?: any[];
  schema?: any;
  ingestionMetadata?: IngestionMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionMetadata {
  transformedData?: any[];
  transformedSchema?: any;
  columnMappings?: Record<string, any>;
  qualityScore?: number;
  piiDetected?: string[];
}
