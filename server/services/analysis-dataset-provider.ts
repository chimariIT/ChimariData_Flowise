/**
 * Analysis Dataset Provider - DU-1 Phase 4
 *
 * This service provides a unified interface for retrieving the canonical dataset
 * for analysis execution. It handles the priority order for data sources:
 *
 * Priority:
 *   1. journeyProgress.joinedData.fullData (SSOT for multi-dataset joins)
 *   2. primaryDataset.ingestionMetadata.transformedData (contains joined data)
 *   3. primaryDataset.data (raw data, last resort)
 *
 * This is a modular service that replaces scattered dataset retrieval logic
 * across analysis-execution.ts and data-science-orchestrator.ts.
 */

import { storage } from '../storage';
import { datasets, projectDatasets } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Result of getAnalysisDataset() call
 */
export interface AnalysisDatasetResult {
  data: any[];
  source: 'joined_full' | 'joined_transformed' | 'joined_preview' | 'single_transformed' | 'raw';
  rowCount: number;
  columnCount: number;
  warnings?: string[];
}

/**
 * Metadata about joined dataset
 */
export interface JoinedMetadata {
  hasFullData: boolean;
  rowCount: number;
  columnCount: number;
  schema?: any;
  joinConfig?: any;
}

export class AnalysisDatasetProvider {
  /**
   * Get the canonical dataset for analysis execution.
   *
   * Priority order:
   *   1. journeyProgress.joinedData.fullData - Full joined data (SSOT for multi-dataset joins)
   *   2. journeyProgress.joinedData.preview - Joined preview (fallback)
   *   3. primaryDataset.ingestionMetadata.transformedData - Transformed single/joined data
   *   4. primaryDataset.data - Raw data (last resort)
   *
   * @param projectId - The project ID to get data for
   * @returns AnalysisDatasetResult with data, source, and metadata
   */
  async getAnalysisDataset(projectId: string): Promise<AnalysisDatasetResult> {
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const journeyProgress = (project as any)?.journeyProgress || {};
    const datasets = await storage.getProjectDatasets(projectId);
    const primaryDs = datasets[0]?.dataset;

    const warnings: string[] = [];

    // Priority 1: Full joined data from journeyProgress (SSOT for multi-dataset joins)
    if (Array.isArray(journeyProgress.joinedData?.fullData) && journeyProgress.joinedData.fullData.length > 0) {
      const data = journeyProgress.joinedData.fullData;
      console.log(`✅ [AnalysisDatasetProvider] Using joinedData.fullData (${data.length} rows)`);
      return {
        data,
        source: 'joined_full',
        rowCount: data.length,
        columnCount: this.extractColumnCount(data),
      };
    }

    // Priority 2: Joined preview from journeyProgress (fallback)
    if (Array.isArray(journeyProgress.joinedData?.preview) && journeyProgress.joinedData.preview.length > 0) {
      const data = journeyProgress.joinedData.preview;
      warnings.push('Using joined preview data instead of full joined data. Re-run transformations for complete data.');
      console.log(`⚠️ [AnalysisDatasetProvider] Using joinedData.preview (${data.length} rows) - ${warnings[0]}`);
      return {
        data,
        source: 'joined_preview',
        rowCount: data.length,
        columnCount: this.extractColumnCount(data),
        warnings,
      };
    }

    // Priority 3: Primary dataset transformedData (single-dataset or joined result)
    if (primaryDs?.ingestionMetadata?.transformedData && Array.isArray(primaryDs.ingestionMetadata.transformedData) && primaryDs.ingestionMetadata.transformedData.length > 0) {
      const data = primaryDs.ingestionMetadata.transformedData;

      // Check if this is actually joined data (multi-dataset project with join config)
      const isJoinedData = datasets.length > 1 && journeyProgress.joinConfig;

      if (isJoinedData) {
        console.log(`✅ [AnalysisDatasetProvider] Using transformed joined data from primary dataset (${data.length} rows)`);
        return {
          data,
          source: 'joined_transformed',
          rowCount: data.length,
          columnCount: this.extractColumnCount(data),
        };
      } else {
        console.log(`✅ [AnalysisDatasetProvider] Using transformed data from single dataset (${data.length} rows)`);
        return {
          data,
          source: 'single_transformed',
          rowCount: data.length,
          columnCount: this.extractColumnCount(data),
        };
      }
    }

    // Priority 4: Raw data from primary dataset (last resort)
    const rawData = this.extractOriginalData(primaryDs);
    if (rawData && rawData.length > 0) {
      warnings.push('No transformed or joined data found. Using raw data. Please run transformations first.');
      console.log(`⚠️ [AnalysisDatasetProvider] Using raw data (${rawData.length} rows) - ${warnings[0]}`);
      return {
        data: rawData,
        source: 'raw',
        rowCount: rawData.length,
        columnCount: this.extractColumnCount(rawData),
        warnings,
      };
    }

    // No data available
    throw new Error('No data available for analysis. Please upload data and run transformations first.');
  }

  /**
   * Check if a project has a joined dataset available.
   *
   * @param projectId - The project ID to check
   * @returns true if joined data exists, false otherwise
   */
  async hasJoinedDataset(projectId: string): Promise<boolean> {
    const project = await storage.getProject(projectId);
    if (!project) {
      return false;
    }

    const journeyProgress = (project as any)?.journeyProgress || {};

    // Check for full joined data or preview
    const hasFullData = Array.isArray(journeyProgress.joinedData?.fullData) && journeyProgress.joinedData.fullData.length > 0;
    const hasPreview = Array.isArray(journeyProgress.joinedData?.preview) && journeyProgress.joinedData.preview.length > 0;

    return hasFullData || hasPreview;
  }

  /**
   * Get metadata about the joined dataset for a project.
   *
   * @param projectId - The project ID to get metadata for
   * @returns JoinedMetadata or null if no joined data exists
   */
  async getJoinedMetadata(projectId: string): Promise<JoinedMetadata | null> {
    const project = await storage.getProject(projectId);
    if (!project) {
      return null;
    }

    const journeyProgress = (project as any)?.journeyProgress || {};

    const joinedData = journeyProgress.joinedData;
    if (!joinedData) {
      return null;
    }

    // Determine which data source has actual data
    let data: any[] = [];
    let hasFullData = false;

    if (Array.isArray(joinedData.fullData) && joinedData.fullData.length > 0) {
      data = joinedData.fullData;
      hasFullData = true;
    } else if (Array.isArray(joinedData.preview) && joinedData.preview.length > 0) {
      data = joinedData.preview;
    }

    return {
      hasFullData,
      rowCount: data.length,
      columnCount: this.extractColumnCount(data),
      schema: joinedData.schema,
      joinConfig: journeyProgress.joinConfig,
    };
  }

  // ============ Private Helpers ============

  /**
   * Extract original data from a dataset, checking all possible locations.
   */
  private extractOriginalData(dataset: any): any[] | null {
    if (!dataset) return null;

    const candidates = [
      { name: 'data', value: dataset.data },
      { name: 'preview', value: dataset.preview },
      { name: 'sampleData', value: dataset.sampleData },
      { name: 'records', value: dataset.records },
    ];

    for (const { name, value } of candidates) {
      if (!value) continue;

      if (Array.isArray(value) && value.length > 0) {
        return value;
      }

      // Handle nested structures
      if (Array.isArray(value?.rows) && value.rows.length > 0) {
        return value.rows;
      }
      if (Array.isArray(value?.records) && value.records.length > 0) {
        return value.records;
      }
      if (Array.isArray(value?.items) && value.items.length > 0) {
        return value.items;
      }
    }

    return null;
  }

  /**
   * Extract the number of columns from a dataset.
   * Assumes data is an array of objects with consistent keys.
   */
  private extractColumnCount(data: any[]): number {
    if (!Array.isArray(data) || data.length === 0) {
      return 0;
    }

    const firstRow = data[0];
    if (typeof firstRow !== 'object' || firstRow === null) {
      return 0;
    }

    return Object.keys(firstRow).length;
  }
}

// Singleton instance
export const analysisDatasetProvider = new AnalysisDatasetProvider();
