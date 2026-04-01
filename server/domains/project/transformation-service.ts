/**
 * Transformation Service
 *
 * Domain: Data Transformation
 * Responsibilities: Execute transformations, retrieve transformation history
 */

import { storage } from '../../services/storage';
import { DataTransformationService } from '../../services/data-transformation';
import type { TransformationStep, TransformationOptions, TransformationResponse } from '../../services/data-transformation';
import type { JourneyType } from '../../shared/schema';
import { ValidationError, NotFoundError, ForbiddenError } from '../../shared/utils/error-handling';

const VALID_TRANSFORMATION_TYPES = [
  'filter',
  'select',
  'rename',
  'convert',
  'clean',
  'aggregate',
  'sort',
  'join',
] as const;

export interface ExecuteTransformationsInput {
  projectId: string;
  userId: string;
  transformations: TransformationStep[];
  joinResolver?: (targetProjectId: string) => Promise<{ rows: any[]; projectName?: string }>;
}

export interface TransformationsResult {
  success: boolean;
  transformedData?: any[];
  preview?: any[];
  rowCount?: number;
  warnings?: string[];
  summary?: any;
}

export class TransformationService {
  /**
   * Execute transformations on project data
   */
  async executeTransformations(input: ExecuteTransformationsInput): Promise<TransformationsResult> {
    const { projectId, userId, transformations, joinResolver } = input;

    if (!userId) {
      throw new ValidationError('User authentication required');
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

    // Get dataset
    const dataset = await storage.getDatasetForProject(projectId);
    if (!dataset) {
      throw new NotFoundError('Dataset not found');
    }

    // Extract source rows
    const sourceRows = this.extractRowsForTransformation(dataset, project);
    if (sourceRows.length === 0) {
      throw new ValidationError('Project has no data to transform');
    }

    // Sanitize transformation steps
    const sanitizedSteps = this.sanitizeTransformations(transformations);

    // Apply transformations
    const transformationResult = await DataTransformationService.applyTransformations(
      sourceRows,
      sanitizedSteps,
      {
        originalSchema: dataset?.schema ?? (project as any)?.schema,
        warnings: [],
        joinResolver,
      }
    );

    // Update project with transformed data
    await storage.updateProject(projectId, {
      transformedData: transformationResult.rows,
      transformations: sanitizedSteps,
    });

    return {
      success: true,
      transformedData: transformationResult.rows,
      preview: transformationResult.preview,
      rowCount: transformationResult.rowCount,
      warnings: transformationResult.warnings,
      summary: transformationResult.summary,
    };
  }

  /**
   * Get transformation history for a project
   */
  async getTransformations(projectId: string, userId: string): Promise<TransformationsResult> {
    if (!userId) {
      throw new ValidationError('User authentication required');
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

    // Return current transformations from project
    const transformations = (project as any)?.transformations || [];
    const transformedData = (project as any)?.transformedData || (project as any)?.data || [];

    return {
      success: true,
      transformedData: transformedData.slice(0, 100), // Preview only
      preview: transformedData.slice(0, 100),
      rowCount: transformedData.length,
      summary: {
        stepsApplied: transformations.length,
        operations: transformations,
      },
    };
  }

  /**
   * Sanitize and validate transformation steps
   */
  private sanitizeTransformations(transformations: any[]): TransformationStep[] {
    if (!Array.isArray(transformations)) {
      return [];
    }

    const baseWarnings: string[] = [];

    return transformations
      .map((rawStep: unknown) => {
        if (!rawStep || typeof rawStep !== 'object') {
          baseWarnings.push('Skipped invalid transformation step.');
          return null;
        }

        const step = rawStep as { type?: unknown; config?: unknown };
        const typeValue = typeof step.type === 'string' ? step.type.trim() : '';

        if (!typeValue || !VALID_TRANSFORMATION_TYPES.includes(typeValue as any)) {
          baseWarnings.push(`Skipped unsupported transformation type: ${typeValue || 'unknown'}.`);
          return null;
        }

        const configCandidate = step.config;
        const config =
          configCandidate && typeof configCandidate === 'object' && !Array.isArray(configCandidate)
            ? { ...(configCandidate as Record<string, any>) }
            : {};

        return { type: typeValue, config };
      })
      .filter((step): step is TransformationStep => step !== null);
  }

  /**
   * Extract rows for transformation
   * Priority: dataset.data > transformedData > dataset.preview
   */
  private extractRowsForTransformation(dataset: any, project: any): any[] {
    // Check dataset.data first (original data)
    const datasetData = Array.isArray(dataset?.data) ? dataset.data : undefined;
    if (datasetData && datasetData.length > 0) {
      console.log(`Found ${datasetData.length} rows in dataset.data`);
      return datasetData;
    }

    // Check transformedData (already transformed)
    const transformedData = Array.isArray(project?.transformedData) ? project.transformedData : undefined;
    if (transformedData && transformedData.length > 0) {
      console.log(`Found ${transformedData.length} rows in project.transformedData`);
      return transformedData;
    }

    // Fallback to dataset.preview
    const previewData = Array.isArray(dataset?.preview) ? dataset.preview : undefined;
    if (previewData && previewData.length > 0) {
      console.log(`Found ${previewData.length} rows in dataset.preview`);
      return previewData;
    }

    // No data available
    return [];
  }
}

// Singleton instance
export const transformationService = new TransformationService();
