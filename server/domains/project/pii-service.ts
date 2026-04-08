/**
 * PII Service
 *
 * Domain: PII Analysis & Filtering
 * Responsibilities: Analyze PII in data, filter PII columns
 */

import { storage } from '../../services/storage';
import { PIIAnalyzer } from '../../services/pii';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/utils/error-handling';

export interface PIIAnalysisResult {
  success: boolean;
  detectedPII?: any[];
  excludedColumns?: string[];
  filteredData?: any[];
  riskLevel?: string;
  columnAnalysis?: Record<string, any>;
  recommendations?: string[];
}

export class PIIService {
  /**
   * Analyze PII in project data
   */
  async analyzePII(projectId: string, userId: string): Promise<PIIAnalysisResult> {
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

    // Get datasets
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length === 0) {
      throw new ValidationError('No datasets found for PII analysis');
    }

    const primaryAssociation =
      datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    if (!primaryDataset) {
      throw new ValidationError('No primary dataset found');
    }

    // Get data for analysis (priority: joined > transformed > original)
    let data: any[] = [];
    const journeyProgress = (project as any)?.journeyProgress || {};

    if (
      journeyProgress.joinedData?.fullData &&
      journeyProgress.joinedData.fullData.length > 0
    ) {
      data = journeyProgress.joinedData.fullData;
    } else if (
      journeyProgress.transformedData &&
      journeyProgress.transformedData.length > 0
    ) {
      data = journeyProgress.transformedData;
    } else {
      data = Array.isArray(primaryDataset?.data)
        ? primaryDataset.data
        : Array.isArray(primaryDataset?.preview)
          ? primaryDataset.preview
          : (primaryDataset as any)?.sampleData || [];
    }

    // Get schema
    const schema = primaryDataset?.schema || {};

    console.log(`[PII] Analyzing ${data.length} rows for PII`, {
      columnsCount: Object.keys(schema).length,
      datasetId: primaryDataset.id,
    });

    // Use PIIAnalyzer to detect PII
    const analysisResult = await PIIAnalyzer.analyzePII(data, schema);

    console.log(`[PII] Analysis complete:`, {
      detectedPIICount: analysisResult.detectedPII.length,
      riskLevel: analysisResult.riskLevel,
      highRiskColumns: analysisResult.detectedPII.filter(
        (p: any) => p.confidence === 'high'
      ).length,
    });

    return {
      success: true,
      detectedPII: analysisResult.detectedPII,
      excludedColumns: [], // Will be set when user applies exclusions
      riskLevel: analysisResult.riskLevel,
      columnAnalysis: analysisResult.columnAnalysis,
      recommendations: analysisResult.recommendations,
    };
  }

  /**
   * Get excluded columns from PII decision
   */
  async getExcludedColumns(projectId: string, userId: string): Promise<string[]> {
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
    const excludedColumns = journeyProgress.piiDecision?.excludedColumns || [];

    console.log(`[PII] Returning ${excludedColumns.length} excluded columns for project ${projectId}`);

    return excludedColumns;
  }

  /**
   * Update PII decision
   */
  async updatePIIDecision(
    projectId: string,
    userId: string,
    decision: any
  ): Promise<void> {
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

    // Validate decision structure
    if (!decision || typeof decision !== 'object') {
      throw new ValidationError('PII decision must be an object');
    }

    console.log(`[PII] Updating PII decision for project ${projectId}:`, {
      excludeAll: decision.excludeAllPII || false,
      excludedColumnsCount: decision.excludedColumns?.length || 0,
      keepColumnsCount: decision.keepColumns?.length || 0,
    });

    // Update journey progress with PII decision
    const journeyProgress = (project as any)?.journeyProgress || {};
    await storage.atomicMergeJourneyProgress(projectId, {
      piiDecision: {
        excludeAllPII: decision.excludeAllPII || false,
        excludedColumns: decision.excludedColumns || [],
        keepColumns: decision.keepColumns || [],
        appliedAt: new Date().toISOString(),
      },
      piiDecisionMade: true,
    });

    console.log(`[PII] Decision updated and persisted to journeyProgress`);
  }

  /**
   * Apply PII exclusions to data
   */
  async applyPIIExclusions(
    projectId: string,
    userId: string,
    excludedColumns: string[]
  ): Promise<{ success: boolean; excludedColumnsCount: number }> {
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

    // Validate excluded columns
    if (!excludedColumns || !Array.isArray(excludedColumns)) {
      throw new ValidationError('Excluded columns must be an array');
    }

    console.log(`[PII] Applying ${excludedColumns.length} exclusions to project ${projectId}`);

    // Filter data by removing excluded columns
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length === 0) {
      throw new ValidationError('No datasets found');
    }

    const primaryAssociation =
      datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    if (!primaryDataset) {
      throw new ValidationError('No primary dataset found');
    }

    // Get data
    let data: any[] = [];
    const journeyProgress = (project as any)?.journeyProgress || {};

    if (
      journeyProgress.joinedData?.fullData &&
      journeyProgress.joinedData.fullData.length > 0
    ) {
      data = journeyProgress.joinedData.fullData;
    } else if (
      journeyProgress.transformedData &&
      journeyProgress.transformedData.length > 0
    ) {
      data = journeyProgress.transformedData;
    } else {
      data = Array.isArray(primaryDataset?.data)
        ? primaryDataset.data
        : Array.isArray(primaryDataset?.preview)
          ? primaryDataset.preview
          : [];
    }

    // Filter out excluded columns
    const filteredData = data.map((row) => {
      const filteredRow: any = {};
      for (const key of Object.keys(row)) {
        if (!excludedColumns.includes(key)) {
          filteredRow[key] = row[key];
        }
      }
      return filteredRow;
    });

    console.log(`[PII] Filtered data:`, {
      originalRows: data.length,
      filteredRows: filteredData.length,
      excludedColumnsCount: excludedColumns.length,
    });

    // Update journey progress with filtered data
    await storage.atomicMergeJourneyProgress(projectId, {
      piiDecision: {
        excludeAllPII: false,
        excludedColumns,
        keepColumns: Object.keys(filteredData[0] || {}),
        appliedAt: new Date().toISOString(),
      },
      piiDecisionMade: true,
    });

    return {
      success: true,
      excludedColumnsCount: excludedColumns.length,
    };
  }
}

// Singleton instance
export const piiService = new PIIService();
