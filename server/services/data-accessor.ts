/**
 * Data Accessor Service - Week 4 Option B: Data Location Consolidation
 *
 * This service provides a unified interface for accessing dataset data,
 * resolving the correct source based on whether transformations have been applied.
 *
 * Data Location Priority:
 * 1. Transformed data (if transformations applied and approved)
 * 2. Original data (upload source)
 *
 * Locations checked:
 * - dataset.ingestionMetadata.transformedData (primary transformed location)
 * - dataset.metadata.transformedData (alternate transformed location)
 * - dataset.data (primary original location)
 * - dataset.preview (sample/preview data)
 * - dataset.sampleData (legacy sample data)
 * - dataset.records (legacy records format)
 */

import { db } from '../db';
import { datasets, projectDatasets, projects } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getPiiExcludedColumns } from './pii-helper';

/**
 * P2-1 FIX: Normalize element field names to canonical `sourceColumn` format.
 * The codebase uses 3 different names for the same concept:
 *   - `sourceField` (used in required-data-elements-tool.ts, project-manager-agent.ts)
 *   - `sourceColumn` (used in most server services — CANONICAL)
 *   - `mappedColumn` (used in project.ts)
 *
 * This normalizer ensures all elements use `sourceColumn` as the canonical field.
 */
export function normalizeElementFieldNames(element: any): any {
  if (!element) return element;

  // Resolve the mapped column from any of the 3 naming conventions
  const resolved = element.sourceColumn || element.sourceField || element.mappedColumn;

  return {
    ...element,
    sourceColumn: resolved || null,
    // Keep legacy fields for backward compatibility but sync them
    sourceField: resolved || element.sourceField || null,
    // Ensure sourceAvailable is consistent
    sourceAvailable: resolved ? true : (element.sourceAvailable || false),
  };
}

/**
 * P2-1: Normalize an array of elements
 */
export function normalizeAllElements(elements: any[]): any[] {
  if (!Array.isArray(elements)) return elements;
  return elements.map(normalizeElementFieldNames);
}

export interface DatasetDataResult {
  data: any[];
  source: 'transformed' | 'original';
  schema: any;
  recordCount: number;
  hasTransformations: boolean;
  transformationVersion?: number;
  datasetId: string;
  datasetName: string;
}

export interface MultiDatasetResult {
  datasets: DatasetDataResult[];
  primaryDataset: DatasetDataResult | null;
  totalRecords: number;
  hasAnyTransformations: boolean;
}

export class DataAccessorService {
  /**
   * Get the active data for a dataset (transformed if available, else original)
   */
  async getActiveData(datasetId: string): Promise<DatasetDataResult | null> {
    if (!db) return null;

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, datasetId))
      .limit(1);

    if (!dataset) {
      return null;
    }

    return this.extractDataFromDataset(dataset);
  }

  /**
   * Get all datasets for a project with their active data
   */
  async getProjectData(projectId: string): Promise<MultiDatasetResult> {
    if (!db) {
      return {
        datasets: [],
        primaryDataset: null,
        totalRecords: 0,
        hasAnyTransformations: false,
      };
    }

    const projectDatasetLinks = await db
      .select()
      .from(projectDatasets)
      .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
      .where(eq(projectDatasets.projectId, projectId));

    const results: DatasetDataResult[] = [];

    for (const link of projectDatasetLinks) {
      const extracted = this.extractDataFromDataset(link.dataset);
      if (extracted) {
        results.push(extracted);
      }
    }

    return {
      datasets: results,
      primaryDataset: results[0] || null,
      totalRecords: results.reduce((sum, r) => sum + r.recordCount, 0),
      hasAnyTransformations: results.some(r => r.hasTransformations),
    };
  }

  /**
   * Get only transformed data for a dataset (null if no transformations)
   */
  async getTransformedData(datasetId: string): Promise<any[] | null> {
    if (!db) return null;

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, datasetId))
      .limit(1);

    if (!dataset) {
      return null;
    }

    return this.extractTransformedData(dataset);
  }

  /**
   * Get only original data for a dataset (ignoring transformations)
   */
  async getOriginalData(datasetId: string): Promise<any[] | null> {
    if (!db) return null;

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, datasetId))
      .limit(1);

    if (!dataset) {
      return null;
    }

    return this.extractOriginalData(dataset);
  }

  /**
   * Check if a dataset has transformations applied
   */
  async hasTransformations(datasetId: string): Promise<boolean> {
    if (!db) return false;

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, datasetId))
      .limit(1);

    if (!dataset) {
      return false;
    }

    return this.checkHasTransformations(dataset);
  }

  /**
   * Get active data for a project with PII columns stripped.
   * This is the recommended method for any data access that may be exposed to users
   * or passed to analysis scripts, ensuring PII decisions are enforced at query time.
   */
  async getProjectDataPiiSafe(projectId: string): Promise<MultiDatasetResult> {
    const result = await this.getProjectData(projectId);
    if (!result.datasets.length) return result;

    // Load PII decisions from journeyProgress
    let piiExcludedColumns: string[] = [];
    try {
      if (db) {
        const [project] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (project) {
          const journeyProgress = (project as any).journeyProgress;
          piiExcludedColumns = getPiiExcludedColumns(journeyProgress);
        }
      }
    } catch (err) {
      console.warn('[DataAccessor] Failed to load PII decisions, returning unfiltered data:', err);
      return result;
    }

    if (piiExcludedColumns.length === 0) return result;

    // Strip PII columns from all dataset rows and schemas
    const filteredDatasets = result.datasets.map(ds => ({
      ...ds,
      data: ds.data.map(row => {
        const filtered: any = {};
        for (const key of Object.keys(row)) {
          if (!piiExcludedColumns.includes(key)) {
            filtered[key] = row[key];
          }
        }
        return filtered;
      }),
      schema: ds.schema
        ? Object.fromEntries(
            Object.entries(ds.schema).filter(([key]) => !piiExcludedColumns.includes(key))
          )
        : ds.schema,
    }));

    return {
      ...result,
      datasets: filteredDatasets,
      primaryDataset: filteredDatasets[0] || null,
    };
  }

  /**
   * Strip PII columns from a single data array given a project's PII decisions.
   * Utility method for routes that already have the data but need PII enforcement.
   */
  static stripPiiColumns(data: any[], piiExcludedColumns: string[]): any[] {
    if (!piiExcludedColumns.length || !data.length) return data;
    return data.map(row => {
      const filtered: any = {};
      for (const key of Object.keys(row)) {
        if (!piiExcludedColumns.includes(key)) {
          filtered[key] = row[key];
        }
      }
      return filtered;
    });
  }

  /**
   * Get the transformed schema for a dataset (or original if no transformations)
   */
  async getActiveSchema(datasetId: string): Promise<any | null> {
    if (!db) return null;

    const [dataset] = await db
      .select()
      .from(datasets)
      .where(eq(datasets.id, datasetId))
      .limit(1);

    if (!dataset) {
      return null;
    }

    const ingestion = (dataset as any).ingestionMetadata || {};
    const meta = (dataset as any).metadata || {};

    // Priority 1: Transformed schema
    if (ingestion.transformedSchema) {
      return ingestion.transformedSchema;
    }

    // Priority 2: Metadata transformed schema
    if (meta.transformedSchema) {
      return meta.transformedSchema;
    }

    // Priority 3: Original schema
    return (dataset as any).schema || meta.schema || null;
  }

  /**
   * DU-1 Phase 4: Get joined dataset for a project.
   *
   * This method retrieves the joined dataset from journeyProgress, which is the
   * Single Source of Truth (SSOT) for multi-dataset joins.
   *
   * Priority:
   *   1. journeyProgress.joinedData.fullData (complete joined data)
   *   2. journeyProgress.joinedData.preview (joined preview)
   *
   * Returns null if no joined data exists.
   *
   * @param projectId - The project ID to get joined data for
   * @returns Joined dataset array or null
   */
  async getJoinedData(projectId: string): Promise<any[] | null> {
    if (!db) return null;

    // Get the project to access journeyProgress
    const projectDatasetLinks = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId))
      .limit(1);

    if (!projectDatasetLinks || projectDatasetLinks.length === 0) {
      return null;
    }

    const project = (projectDatasetLinks[0] as any)?.project;
    if (!project) {
      return null;
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    const joinedData = journeyProgress.joinedData;

    if (!joinedData) {
      return null;
    }

    // Priority 1: Full joined data from journeyProgress
    if (Array.isArray(joinedData.fullData) && joinedData.fullData.length > 0) {
      console.log(`✅ [DataAccessor] Using joinedData.fullData (${joinedData.fullData.length} rows)`);
      return joinedData.fullData;
    }

    // Priority 2: Preview from joinedData
    if (Array.isArray(joinedData.preview) && joinedData.preview.length > 0) {
      console.log(`⚠️ [DataAccessor] Using joinedData.preview (${joinedData.preview.length} rows)`);
      return joinedData.preview;
    }

    return null;
  }

  // ============ Private Helpers ============

  private extractDataFromDataset(dataset: any): DatasetDataResult | null {
    const hasTransformations = this.checkHasTransformations(dataset);
    const data = hasTransformations
      ? this.extractTransformedData(dataset)
      : this.extractOriginalData(dataset);

    if (!data) {
      return null;
    }

    const ingestion = dataset.ingestionMetadata || {};
    const meta = dataset.metadata || {};
    const schema = hasTransformations
      ? (ingestion.transformedSchema || meta.transformedSchema || dataset.schema)
      : dataset.schema;

    return {
      data,
      source: hasTransformations ? 'transformed' : 'original',
      schema,
      recordCount: data.length,
      hasTransformations,
      transformationVersion: ingestion.transformationVersion,
      datasetId: dataset.id,
      datasetName: dataset.originalFileName || dataset.name || dataset.id,
    };
  }

  private extractTransformedData(dataset: any): any[] | null {
    // Priority 1: ingestionMetadata.transformedData
    const ingestion = dataset.ingestionMetadata || {};
    if (Array.isArray(ingestion.transformedData) && ingestion.transformedData.length > 0) {
      console.log(`📊 [DataAccessor] Using transformed data from ingestionMetadata (${ingestion.transformedData.length} rows)`);
      return ingestion.transformedData;
    }

    // Priority 2: metadata.transformedData
    const meta = dataset.metadata || {};
    if (Array.isArray(meta.transformedData) && meta.transformedData.length > 0) {
      console.log(`📊 [DataAccessor] Using transformed data from metadata (${meta.transformedData.length} rows)`);
      return meta.transformedData;
    }

    return null;
  }

  private extractOriginalData(dataset: any): any[] | null {
    // Check all possible original data locations
    const candidates = [
      { name: 'data', value: dataset.data },
      { name: 'preview', value: dataset.preview },
      { name: 'sampleData', value: dataset.sampleData },
      { name: 'records', value: dataset.records },
    ];

    for (const { name, value } of candidates) {
      if (!value) continue;

      if (Array.isArray(value) && value.length > 0) {
        console.log(`📊 [DataAccessor] Using original data from ${name} (${value.length} rows)`);
        return value;
      }

      // Handle nested structures
      if (Array.isArray(value?.rows) && value.rows.length > 0) {
        console.log(`📊 [DataAccessor] Using original data from ${name}.rows (${value.rows.length} rows)`);
        return value.rows;
      }
      if (Array.isArray(value?.records) && value.records.length > 0) {
        console.log(`📊 [DataAccessor] Using original data from ${name}.records (${value.records.length} rows)`);
        return value.records;
      }
      if (Array.isArray(value?.items) && value.items.length > 0) {
        console.log(`📊 [DataAccessor] Using original data from ${name}.items (${value.items.length} rows)`);
        return value.items;
      }
    }

    return null;
  }

  private checkHasTransformations(dataset: any): boolean {
    const ingestion = dataset.ingestionMetadata || {};
    const meta = dataset.metadata || {};

    return (
      (Array.isArray(ingestion.transformedData) && ingestion.transformedData.length > 0) ||
      (Array.isArray(meta.transformedData) && meta.transformedData.length > 0)
    );
  }
}

// Singleton instance
export const dataAccessor = new DataAccessorService();
