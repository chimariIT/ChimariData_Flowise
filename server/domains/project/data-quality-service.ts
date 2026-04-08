/**
 * Data Quality Service
 *
 * Domain: Data Quality Checks & Schema Inference
 * Responsibilities: Analyze data quality, infer schema, validate data
 */

import { storage } from '../../services/storage';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/utils/error-handling';

export interface DataQualityResult {
  success: boolean;
  qualityScore?: number;
  qualityMetrics?: {
    completeness: number;
    consistency: number;
    accuracy: number;
    validity: number;
  };
  schema?: Record<string, any>;
  columnMetrics?: Record<string, any>;
  issues?: string[];
  recommendations?: string[];
  recordCount?: number;
}

export class DataQualityService {
  /**
   * Analyze data quality for project
   */
  async analyzeQuality(
    projectId: string,
    userId: string
  ): Promise<DataQualityResult> {
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
      throw new ValidationError('No datasets found for quality analysis');
    }

    const primaryAssociation =
      datasets.find(({ association }) => association?.role === 'primary') ?? datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    if (!primaryDataset) {
      throw new ValidationError('No primary dataset found');
    }

    // Get data (priority: joined > transformed > original)
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

    if (data.length === 0) {
      throw new ValidationError('No data available for quality analysis');
    }

    // Get schema
    const schema = primaryDataset?.schema || {};
    const columns = Object.keys(schema);

    console.log(`[Quality] Analyzing ${data.length} rows across ${columns.length} columns`);

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(data, schema);

    // Generate issues and recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (qualityMetrics.completeness < 80) {
      issues.push('Low completeness detected in dataset');
      recommendations.push('Review missing values and consider data imputation strategies');
    }

    if (qualityMetrics.uniqueness < 80) {
      issues.push('Low uniqueness detected - potential duplicate records');
      recommendations.push('Identify and remove or merge duplicate records');
    }

    if (qualityMetrics.validity < 80) {
      issues.push('Data validation issues detected');
      recommendations.push('Review data types and format inconsistencies');
    }

    // Calculate overall quality score
    const overallScore =
      (qualityMetrics.completeness +
        qualityMetrics.consistency +
        qualityMetrics.accuracy +
        qualityMetrics.validity) /
      4;

    console.log(`[Quality] Analysis complete:`, {
      overallScore: Math.round(overallScore),
      completeness: Math.round(qualityMetrics.completeness),
      uniqueness: Math.round(qualityMetrics.uniqueness),
      validity: Math.round(qualityMetrics.validity),
    });

    return {
      success: true,
      qualityScore: Math.round(overallScore),
      qualityMetrics: {
        completeness: Math.round(qualityMetrics.completeness),
        consistency: Math.round(qualityMetrics.consistency),
        accuracy: Math.round(qualityMetrics.accuracy),
        validity: Math.round(qualityMetrics.validity),
      },
      schema: this.analyzeSchema(data),
      columnMetrics: this.analyzeColumns(data, schema),
      issues,
      recommendations,
      recordCount: data.length,
    };
  }

  /**
   * Infer schema from data
   */
  async analyzeSchema(projectId: string, userId: string): Promise<Record<string, any>> {
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
      const datasets = await storage.getProjectDatasets(projectId);
      if (datasets && datasets.length > 0) {
        const primaryDataset = datasets[0].dataset;
        data = Array.isArray(primaryDataset?.data)
          ? primaryDataset.data
          : Array.isArray(primaryDataset?.preview)
            ? primaryDataset.preview
            : [];
      }
    }

    if (data.length === 0) {
      throw new ValidationError('No data available for schema analysis');
    }

    console.log(`[Quality] Inferring schema from ${data.length} rows`);

    // Infer schema from data
    const schema = this.analyzeSchema(data);

    return schema;
  }

  /**
   * Calculate quality metrics
   */
  private calculateQualityMetrics(
    data: any[],
    schema: Record<string, any>
  ): {
    completeness: number;
    consistency: number;
    accuracy: number;
    validity: number;
    uniqueness: number;
  } {
    const columns = Object.keys(schema);
    const totalCells = data.length * columns.length;
    let totalNonEmpty = 0;
    let totalValid = 0;
    let totalConsistent = 0;

    // Analyze each column
    const columnStats: Record<string, any> = {};

    for (const column of columns) {
      const nullCount = data.filter((row) => row[column] == null).length;
      const nonNullCount = data.length - nullCount;
      totalNonEmpty += nonNullCount;

      // Check data type consistency
      const types = new Set();
      const values: any[] = [];

      for (const row of data) {
        const value = row[column];
        if (value != null) {
          const type = typeof value;
          types.add(type);
          values.push(value);
          totalValid++;
        }
      }

      // Check format consistency for strings
      const expectedFormat = this.detectFormat(values[0]);
      let consistentCount = 0;
      for (const v of values) {
        if (expectedFormat && this.matchesFormat(v, expectedFormat)) {
          consistentCount++;
        } else if (!expectedFormat) {
          consistentCount++;
        }
      }
      totalConsistent += consistentCount;

      // Calculate column stats
      columnStats[column] = {
        type: Array.from(types).join(','),
        nullRate: nullCount / data.length,
        uniqueCount: new Set(values).length,
        uniquenessRate: (new Set(values).length / values.length) * 100,
      };
    }

    // Calculate overall metrics
    const completeness = (totalNonEmpty / totalCells) * 100;
    const validity = (totalValid / totalNonEmpty) * 100;
    const consistency = (totalConsistent / totalValid) * 100;

    // Calculate uniqueness
    const totalUniqueRecords = new Set(data.map((row) => JSON.stringify(row))).length;
    const uniqueness = (totalUniqueRecords / data.length) * 100;

    // Calculate accuracy (basic check)
    const accuracy = 100; // Default to 100 - can be enhanced with validation rules

    return {
      completeness,
      consistency,
      accuracy,
      validity,
      uniqueness,
    };
  }

  /**
   * Analyze schema from data
   */
  private analyzeSchema(data: any[]): Record<string, any> {
    if (data.length === 0) {
      return {};
    }

    const schema: Record<string, any> = {};
    const columns = Object.keys(data[0]);

    for (const column of columns) {
      const sampleSize = Math.min(100, data.length);
      const sample = data.slice(0, sampleSize).map((r) => r[column]);

      // Determine type from sample
      const nonNullSample = sample.filter((v) => v != null && v !== undefined);

      if (nonNullSample.length === 0) {
        schema[column] = {
          type: 'unknown',
          nullable: true,
        };
        continue;
      }

      const types = new Set(nonNullSample.map((v) => typeof v));
      const uniqueTypes = Array.from(types);

      if (uniqueTypes.length === 1) {
        const type = uniqueTypes[0];
        schema[column] = {
          type: type,
          nullable: nonNullSample.length < sampleSize,
        };

        // Add subtype info for numeric
        if (type === 'number') {
          const isInteger = nonNullSample.every((v) => Number.isInteger(v));
          schema[column].subtype = isInteger ? 'integer' : 'float';
        }
      } else {
        schema[column] = {
          type: 'mixed',
          nullable: true,
          subtypes: uniqueTypes,
        };
      }
    }

    return schema;
  }

  /**
   * Analyze column statistics
   */
  private analyzeColumns(
    data: any[],
    schema: Record<string, any>
  ): Record<string, any> {
    const columnMetrics: Record<string, any> = {};
    const columns = Object.keys(schema);

    for (const column of columns) {
      const values = data
        .map((row) => row[column])
        .filter((v) => v != null);

      columnMetrics[column] = {
        nullCount: data.length - values.length,
        nullRate: (data.length - values.length) / data.length,
        uniqueCount: new Set(values).length,
        uniquenessRate: (new Set(values).length / values.length) * 100,
        sampleValues: values.slice(0, 5).map((v) =>
          typeof v === 'object' ? JSON.stringify(v) : String(v)
        ),
      };
    }

    return columnMetrics;
  }

  /**
   * Detect format pattern from first value
   */
  private detectFormat(value: any): string | null {
    if (value == null || value === undefined) {
      return null;
    }

    const str = String(value).trim();

    // Check for email format
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
      return 'email';
    }

    // Check for phone format
    if (/^\+?[\d\s-()]{10,}$/.test(str)) {
      return 'phone';
    }

    // Check for date format
    if (
      /^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(str) ||
      /^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(str)
    ) {
      return 'date';
    }

    return null; // No specific format detected
  }

  /**
   * Check if value matches expected format
   */
  private matchesFormat(value: any, format: string | null): boolean {
    if (!format) {
      return true; // No format constraint
    }

    const str = String(value).trim();

    switch (format) {
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
      case 'phone':
        return /^\+?[\d\s-()]{10,}$/.test(str);
      case 'date':
        return (
          /^\d{4}[-\/]\d{2}[-\/]\d{2}$/.test(str) ||
          /^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(str)
        );
      default:
        return true;
    }
  }
}

// Singleton instance
export const dataQualityService = new DataQualityService();
