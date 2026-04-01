/**
 * Visualizations Service
 *
 * Domain: Chart/Data Visualization Generation
 * Responsibilities: Create visualizations, retrieve visualization history
 */

import { storage } from '../../services/storage';
import { EnhancedVisualizationEngine, VisualizationRequest } from '../../services/enhanced-visualization-engine';
import { ValidationError, NotFoundError, ForbiddenError, UnauthorizedError } from '../../shared/utils/error-handling';

export interface CreateVisualizationInput {
  chartType?: string;
  config?: Record<string, any>;
  options?: Record<string, any>;
  fields?: any[];
  groupByColumn?: string;
  colorByColumn?: string;
  sizeByColumn?: string;
  aggregate?: any;
}

export interface VisualizationResult {
  success: boolean;
  visualization?: {
    chart_type: string;
    chart_data: any;
    fields: any[];
    options: any;
    insights?: any[];
    warnings?: string[];
    metadata?: any;
    engine_chart_data?: any;
  };
  error?: string;
}

export class VisualizationsService {
  private visualizationEngine = new EnhancedVisualizationEngine();

  /**
   * Create visualization
   */
  async createVisualization(
    projectId: string,
    userId: string,
    input: CreateVisualizationInput
  ): Promise<VisualizationResult> {
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

    // Build data snapshot
    const { snapshot, dataset } = await this.buildSnapshot(projectId, project);
    if (!snapshot.records || snapshot.records.length === 0) {
      throw new ValidationError(
        'No data available for visualization. Upload data or run an analysis first.'
      );
    }

    // Collect field candidates
    const fieldCandidates = this.collectFieldCandidates(snapshot);
    if (!fieldCandidates.length) {
      throw new ValidationError('No fields found to visualize.');
    }

    // Parse configuration
    const config = input.config || {};
    const options = input.options || {};
    const chartType = this.normalizeChartType(
      input.chartType ?? config.chartType
    );

    // Determine fields to use
    const fields = this.determineFields(input, fieldCandidates, snapshot, chartType);

    // Build customizations for visualization engine
    const customizations = this.buildCustomizations(fields, config, options);

    // Calculate dataset characteristics
    const datasetCharacteristics = this.computeDatasetCharacteristics(snapshot);

    // Build requirements for visualization
    const requirements = this.buildVisualizationRequirements(chartType, snapshot.records.length);

    // Create visualization using enhanced engine
    let engineResult;
    try {
      const visualizationRequest: VisualizationRequest = {
        data: snapshot.records,
        chartType,
        requirements,
        datasetCharacteristics,
        customizations,
      };

      engineResult = await this.visualizationEngine.createVisualization(visualizationRequest);
    } catch (engineError) {
      console.error('Visualization engine error:', engineError);
      engineResult = {
        success: false,
        library: 'unknown',
        chartData: null,
        metadata: {
          renderTime: 0,
          dataPoints: snapshot.records.length,
          interactive: false,
        },
        exportOptions: { formats: [] },
        error:
          engineError instanceof Error
            ? engineError.message
            : String(engineError),
      };
    }

    // Build warnings
    const warnings: string[] = [];
    if (!engineResult.success && engineResult.error) {
      warnings.push(engineResult.error);
    }

    // Get insights from project
    const insights = (project as any).insights || (project as any).aiInsights || [];

    // Build metadata
    const metadata = {
      dataset: {
        id: dataset?.id ?? projectId,
        name: dataset?.name ?? project?.name ?? 'Project Dataset',
        recordCount: snapshot.records.length,
        schemaFields: snapshot.schemaKeys,
      },
      datasetCharacteristics,
      requirements,
      engine: {
        library: engineResult.library,
        metadata: engineResult.metadata,
        exportOptions: engineResult.exportOptions,
        success: engineResult.success,
        error: engineResult.error,
      },
    };

    return {
      success: true,
      visualization: {
        chart_type: chartType,
        chart_data: engineResult.chartData,
        fields,
        options: { ...config, ...options },
        insights,
        warnings,
        metadata,
        engine_chart_data: engineResult.chartData,
      },
    };
  }

  /**
   * Get visualizations for project
   */
  async getVisualizations(
    projectId: string,
    userId: string
  ): Promise<VisualizationResult> {
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

    // Note: Visualizations are not currently persisted in a dedicated collection
    // They are generated on-demand. Returning empty result for now.
    // Future enhancement: Store visualization configurations in project.visualizations array
    return {
      success: true,
      visualization: null,
    };
  }

  /**
   * Build data snapshot for visualization
   */
  private async buildSnapshot(
    projectId: string,
    project: any
  ): Promise<{
    snapshot: { records: any[]; schema: any; schemaKeys: string[] };
    dataset: any;
  }> {
    // Get datasets for project
    const datasets = await storage.getProjectDatasets(projectId);
    if (!datasets || datasets.length === 0) {
      return {
        snapshot: { records: [], schema: {}, schemaKeys: [] },
        dataset: null,
      };
    }

    // Get primary dataset
    const primaryAssociation =
      datasets.find(({ association }) => association?.role === 'primary') ??
      datasets[0];
    const primaryDataset = primaryAssociation?.dataset;

    // Determine data source (priority: joined > transformed > original)
    let records: any[] = [];
    const journeyProgress = (project as any)?.journeyProgress || {};

    if (
      journeyProgress.joinedData?.fullData &&
      journeyProgress.joinedData.fullData.length > 0
    ) {
      records = journeyProgress.joinedData.fullData;
    } else if (
      journeyProgress.transformedData &&
      journeyProgress.transformedData.length > 0
    ) {
      records = journeyProgress.transformedData;
    } else {
      const datasetData = Array.isArray(primaryDataset?.data)
        ? primaryDataset.data
        : Array.isArray(primaryDataset?.preview)
          ? primaryDataset.preview
          : (primaryDataset as any)?.sampleData || [];

      if (datasetData.length > 0) {
        records = datasetData;
      }
    }

    // Get schema
    const schema = primaryDataset?.schema || {};
    const schemaKeys = Object.keys(schema);

    return {
      snapshot: { records, schema, schemaKeys },
      dataset: primaryDataset,
    };
  }

  /**
   * Collect field candidates from snapshot
   */
  private collectFieldCandidates(
    snapshot: { records: any[]; schemaKeys: string[] }
  ): string[] {
    const keys = new Set<string>();

    // Add schema keys
    snapshot.schemaKeys.forEach((key) => {
      if (key) {
        keys.add(key);
      }
    });

    // Add keys from records
    snapshot.records.slice(0, 200).forEach((record) => {
      Object.keys(record).forEach((key) => {
        if (key) {
          keys.add(key);
        }
      });
    });

    return Array.from(keys);
  }

  /**
   * Normalize chart type
   */
  private normalizeChartType(chartType: any): string {
    const typeMap: Record<string, string> = {
      bar: 'bar',
      line: 'line',
      scatter: 'scatter',
      pie: 'pie',
      histogram: 'histogram',
      boxplot: 'boxplot',
      violin: 'violin',
      heatmap: 'heatmap',
      'correlation-matrix': 'correlation_matrix',
      'correlation_matrix': 'correlation_matrix',
    };

    return typeMap[chartType?.toLowerCase()] || chartType || 'bar';
  }

  /**
   * Determine fields to use based on chart type
   */
  private determineFields(
    input: CreateVisualizationInput,
    fieldCandidates: string[],
    snapshot: { records: any[]; schemaKeys: string[] },
    chartType: string
  ): any {
    const fields: any = {};

    // Use explicit fields if provided
    if (input.fields && Array.isArray(input.fields) && input.fields.length > 0) {
      if (typeof input.fields[0] === 'string') {
        // Array of field names
        fields.x = input.fields[0];
        fields.y = input.fields[1];
        fields.color = input.colorByColumn;
        fields.size = input.sizeByColumn;
        fields.group = input.groupByColumn;
      } else {
        // Object with field mapping
        Object.assign(fields, input.fields);
      }
    } else {
      // Auto-determine fields based on chart type
      const numericFields = this.getNumericFields(snapshot, fieldCandidates);
      const categoricalFields = this.getCategoricalFields(
        snapshot,
        fieldCandidates
      );

      switch (chartType) {
        case 'correlation_matrix':
          fields.columns = numericFields.slice(0, 12);
          break;
        case 'scatter':
          fields.x = numericFields[0];
          fields.y = numericFields[1] || numericFields[0];
          fields.color = input.colorByColumn || categoricalFields[0];
          fields.size = input.sizeByColumn || numericFields[2];
          break;
        case 'pie':
        case 'bar':
        case 'line':
          fields.x = categoricalFields[0] || numericFields[0];
          fields.y = numericFields[0] || categoricalFields[0];
          fields.color = input.colorByColumn || categoricalFields[1];
          break;
        case 'heatmap':
          fields.x = categoricalFields[0];
          fields.y = categoricalFields[1];
          fields.value = numericFields[0];
          break;
        default:
          fields.x = numericFields[0];
          fields.y = numericFields[1] || numericFields[0];
          fields.group = input.groupByColumn || categoricalFields[0];
      }
    }

    return fields;
  }

  /**
   * Build customizations for visualization engine
   */
  private buildCustomizations(
    fields: any,
    config: Record<string, any>,
    options: Record<string, any>
  ): any {
    return {
      title: config.title || options.title,
      xAxis: fields.x,
      yAxis: fields.y,
      colorBy: fields.color || fields.group,
      sizeBy: fields.size,
      filters: config.filters || options.filters,
      styling: {
        ...config.styling,
        ...options.styling,
      },
      aggregation: input.aggregate ? {
        groupBy: [input.groupByColumn],
        aggregations: this.parseAggregations(input.aggregate, fields),
      } : undefined,
    };
  }

  /**
   * Parse aggregation configuration
   */
  private parseAggregations(aggregate: any, fields: any): any[] {
    if (!aggregate || typeof aggregate !== 'object') {
      return [];
    }

    const aggregations: any[] = [];
    const operations = ['sum', 'avg', 'mean', 'count', 'min', 'max'];

    for (const [field, operation] of Object.entries(aggregate)) {
      if (operations.includes(operation as string)) {
        aggregations.push({
          field,
          operation,
          alias: `${operation}_${field}`,
        });
      }
    }

    return aggregations;
  }

  /**
   * Compute dataset characteristics
   */
  private computeDatasetCharacteristics(snapshot: {
    records: any[];
    schemaKeys: string[];
  }): any {
    return {
      recordCount: snapshot.records.length,
      fieldCount: snapshot.schemaKeys.length,
      hasNumericData: this.getNumericFields(snapshot, snapshot.schemaKeys).length > 0,
      hasCategoricalData:
        this.getCategoricalFields(snapshot, snapshot.schemaKeys).length > 0,
    };
  }

  /**
   * Build visualization requirements
   */
  private buildVisualizationRequirements(
    chartType: string,
    recordCount: number
  ): any {
    return {
      chartType,
      recordCount,
      interactive: recordCount < 10000,
      supportsExport: true,
    };
  }

  /**
   * Get numeric fields from schema/data
   */
  private getNumericFields(
    snapshot: { records: any[]; schema: any },
    fieldCandidates: string[]
  ): string[] {
    const numericFields: string[] = [];

    for (const field of fieldCandidates) {
      const fieldType = snapshot.schema?.[field]?.type;
      if (fieldType === 'number' || fieldType === 'integer' || fieldType === 'float') {
        numericFields.push(field);
      }
    }

    // If no schema type info, infer from data
    if (numericFields.length === 0 && snapshot.records.length > 0) {
      for (const field of fieldCandidates) {
        const sampleValue = snapshot.records.find((r) => r[field] !== undefined)?.[field];
        if (typeof sampleValue === 'number' && !isNaN(sampleValue)) {
          numericFields.push(field);
        }
      }
    }

    return numericFields;
  }

  /**
   * Get categorical fields from schema/data
   */
  private getCategoricalFields(
    snapshot: { records: any[]; schema: any },
    fieldCandidates: string[]
  ): string[] {
    const categoricalFields: string[] = [];

    for (const field of fieldCandidates) {
      const fieldType = snapshot.schema?.[field]?.type;
      if (
        fieldType === 'string' ||
        fieldType === 'text' ||
        fieldType === 'boolean'
      ) {
        categoricalFields.push(field);
      }
    }

    return categoricalFields;
  }
}

// Singleton instance
export const visualizationsService = new VisualizationsService();
