import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';
import { enhancedVisualizationEngine } from '../services/enhanced-visualization-engine';
import { storage } from '../storage';
import { db } from '../db';
import { datasets, projectDatasets } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = express.Router();

/**
 * Helper to get project data for visualization
 */
async function getProjectDataForVisualization(projectId: string): Promise<{
  data: any[];
  schema: Record<string, any>;
  characteristics: any;
}> {
  // Get project datasets
  const projectDatasetLinks = await db
    .select({ dataset: datasets })
    .from(projectDatasets)
    .innerJoin(datasets, eq(projectDatasets.datasetId, datasets.id))
    .where(eq(projectDatasets.projectId, projectId));

  if (projectDatasetLinks.length === 0) {
    // Try getting data from project analysisResults
    const project = await storage.getProject(projectId);
    if (project?.analysisResults && typeof project.analysisResults === 'object') {
      const results = project.analysisResults as any;
      if (results.data && Array.isArray(results.data)) {
        return {
          data: results.data,
          schema: project.schema || {},
          characteristics: {
            recordCount: results.data.length,
            columnCount: Object.keys(project.schema || {}).length,
            hasNumericFields: true,
            hasCategoricalFields: true,
            hasTimeFields: false
          }
        };
      }
    }
    throw new Error('No data available for visualization. Please upload data first.');
  }

  // Get the first dataset's data
  const dataset = projectDatasetLinks[0].dataset;
  const data = Array.isArray(dataset.data) ? dataset.data : [];
  const schema = (dataset as any).schema || {};

  // Analyze data characteristics
  const numericFields: string[] = [];
  const categoricalFields: string[] = [];
  const timeFields: string[] = [];

  if (data.length > 0) {
    const sampleRow = data[0];
    for (const [key, value] of Object.entries(sampleRow)) {
      if (typeof value === 'number') {
        numericFields.push(key);
      } else if (typeof value === 'string') {
        // Check if it looks like a date
        const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{1,2}\/\d{1,2}\/\d{2,4}/;
        if (datePattern.test(value)) {
          timeFields.push(key);
        } else {
          categoricalFields.push(key);
        }
      }
    }
  }

  return {
    data,
    schema,
    characteristics: {
      recordCount: data.length,
      columnCount: Object.keys(schema).length || Object.keys(data[0] || {}).length,
      hasNumericFields: numericFields.length > 0,
      hasCategoricalFields: categoricalFields.length > 0,
      hasTimeFields: timeFields.length > 0,
      numericFields,
      categoricalFields,
      timeFields
    }
  };
}

/**
 * Generate a chart for a project
 * POST /api/visualization/:projectId/generate-chart
 */
router.post("/:projectId/generate-chart", ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Verify access to project
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({ success: false, error: accessCheck.reason });
    }

    const {
      chartType,
      xAxis,
      yAxis,
      aggregation,
      filters,
      title,
      options,
      colorBy,
      sizeBy
    } = req.body;

    // Validate required fields
    if (!chartType) {
      return res.status(400).json({ success: false, error: 'chartType is required' });
    }

    // Get project data
    let projectData;
    try {
      projectData = await getProjectDataForVisualization(projectId);
    } catch (dataError: any) {
      return res.status(400).json({
        success: false,
        error: dataError.message || 'Failed to retrieve project data'
      });
    }

    // Apply filters if provided
    let filteredData = projectData.data;
    if (filters && typeof filters === 'object') {
      filteredData = projectData.data.filter((row: any) => {
        for (const [field, value] of Object.entries(filters)) {
          if (row[field] !== value) return false;
        }
        return true;
      });
    }

    // Determine data size category
    const getDataSizeCategory = (count: number): 'small' | 'medium' | 'large' | 'massive' => {
      if (count < 1000) return 'small';
      if (count < 100000) return 'medium';
      if (count < 1000000) return 'large';
      return 'massive';
    };

    // Build visualization request
    const visualizationRequest = {
      data: filteredData,
      chartType,
      requirements: {
        chartTypes: [chartType],
        dataSize: getDataSizeCategory(filteredData.length),
        interactivity: options?.interactive === false ? 'static' as const : 'interactive' as const,
        styling: 'professional' as const,
        exportFormats: ['png', 'svg', 'pdf'],
        performancePriority: 'balanced' as const
      },
      datasetCharacteristics: {
        size: filteredData.length,
        columns: projectData.characteristics.columnCount,
        dataTypes: {
          numeric: projectData.characteristics.numericFields?.length || 0,
          categorical: projectData.characteristics.categoricalFields?.length || 0,
          datetime: projectData.characteristics.timeFields?.length || 0,
          boolean: 0,
          text: 0
        },
        memoryFootprint: Math.ceil(filteredData.length * 100 / (1024 * 1024)), // Rough estimate in MB
        sparsity: 0, // No missing values estimation for now
        cardinality: {} // Empty for now
      },
      customizations: {
        title,
        xAxis,
        yAxis,
        colorBy,
        sizeBy,
        filters,
        styling: options?.styling,
        aggregation: aggregation ? {
          groupBy: aggregation.groupBy ? [aggregation.groupBy] : undefined,
          aggregations: aggregation.operation ? [{
            field: aggregation.field || yAxis,
            operation: aggregation.operation,
            alias: aggregation.alias
          }] : undefined
        } : undefined
      }
    };

    // Generate visualization
    const result = await enhancedVisualizationEngine.createVisualization(visualizationRequest);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to generate visualization'
      });
    }

    // Return chart result
    res.json({
      success: true,
      chart: {
        chartId: `chart_${projectId}_${Date.now()}`,
        chartType,
        library: result.library,
        config: {
          xAxis,
          yAxis,
          aggregation,
          filters,
          title,
          options
        },
        chartData: result.chartData,
        metadata: result.metadata,
        exportOptions: result.exportOptions,
        imageData: result.imageData,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Chart generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate chart'
    });
  }
});

/**
 * Generate multiple charts (dashboard)
 * POST /api/visualization/:projectId/generate-dashboard
 */
router.post("/:projectId/generate-dashboard", ensureAuthenticated, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req.user as any)?.id;
    const isAdmin = (req.user as any)?.isAdmin || false;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Verify access to project
    const accessCheck = await canAccessProject(userId, projectId, isAdmin);
    if (!accessCheck.allowed) {
      const status = accessCheck.reason === 'Project not found' ? 404 : 403;
      return res.status(status).json({ success: false, error: accessCheck.reason });
    }

    const { charts } = req.body;

    if (!Array.isArray(charts) || charts.length === 0) {
      return res.status(400).json({ success: false, error: 'charts array is required' });
    }

    // Get project data once for all charts
    let projectData;
    try {
      projectData = await getProjectDataForVisualization(projectId);
    } catch (dataError: any) {
      return res.status(400).json({
        success: false,
        error: dataError.message || 'Failed to retrieve project data'
      });
    }

    // Generate all charts
    const results = await Promise.all(
      charts.map(async (chartConfig: any, index: number) => {
        try {
          // Apply filters if provided
          let filteredData = projectData.data;
          if (chartConfig.filters && typeof chartConfig.filters === 'object') {
            filteredData = projectData.data.filter((row: any) => {
              for (const [field, value] of Object.entries(chartConfig.filters)) {
                if (row[field] !== value) return false;
              }
              return true;
            });
          }

          // Determine data size category
          const getDataSizeCategory = (count: number): 'small' | 'medium' | 'large' | 'massive' => {
            if (count < 1000) return 'small';
            if (count < 100000) return 'medium';
            if (count < 1000000) return 'large';
            return 'massive';
          };

          const visualizationRequest = {
            data: filteredData,
            chartType: chartConfig.chartType,
            requirements: {
              chartTypes: [chartConfig.chartType],
              dataSize: getDataSizeCategory(filteredData.length),
              interactivity: chartConfig.options?.interactive === false ? 'static' as const : 'interactive' as const,
              styling: 'professional' as const,
              exportFormats: ['png', 'svg', 'pdf'],
              performancePriority: 'balanced' as const
            },
            datasetCharacteristics: {
              size: filteredData.length,
              columns: projectData.characteristics.columnCount,
              dataTypes: {
                numeric: projectData.characteristics.numericFields?.length || 0,
                categorical: projectData.characteristics.categoricalFields?.length || 0,
                datetime: projectData.characteristics.timeFields?.length || 0,
                boolean: 0,
                text: 0
              },
              memoryFootprint: Math.ceil(filteredData.length * 100 / (1024 * 1024)),
              sparsity: 0,
              cardinality: {}
            },
            customizations: {
              title: chartConfig.title,
              xAxis: chartConfig.xAxis,
              yAxis: chartConfig.yAxis,
              colorBy: chartConfig.colorBy,
              sizeBy: chartConfig.sizeBy,
              filters: chartConfig.filters,
              styling: chartConfig.options?.styling
            }
          };

          const result = await enhancedVisualizationEngine.createVisualization(visualizationRequest);

          return {
            chartId: `chart_${projectId}_${Date.now()}_${index}`,
            chartType: chartConfig.chartType,
            library: result.library,
            config: chartConfig,
            chartData: result.chartData,
            metadata: result.metadata,
            exportOptions: result.exportOptions,
            imageData: result.imageData,
            generatedAt: new Date().toISOString(),
            success: result.success,
            error: result.error
          };
        } catch (err: any) {
          return {
            chartId: `chart_${projectId}_${Date.now()}_${index}`,
            error: err.message,
            config: chartConfig,
            success: false
          };
        }
      })
    );

    const successfulCharts = results.filter((r: any) => r.success !== false && !r.error);
    const failedCharts = results.filter((r: any) => r.success === false || r.error);

    res.json({
      success: failedCharts.length === 0,
      charts: successfulCharts,
      errors: failedCharts.length > 0 ? failedCharts : undefined,
      totalRequested: charts.length,
      totalGenerated: successfulCharts.length,
      totalFailed: failedCharts.length
    });
  } catch (error: any) {
    console.error('Dashboard generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate dashboard'
    });
  }
});

/**
 * Get available chart types
 * GET /api/visualization/chart-types
 */
router.get("/chart-types", ensureAuthenticated, async (req, res) => {
  res.json({
    success: true,
    chartTypes: [
      { id: 'bar', name: 'Bar Chart', description: 'Compare values across categories' },
      { id: 'line', name: 'Line Chart', description: 'Show trends over time' },
      { id: 'pie', name: 'Pie Chart', description: 'Show proportions of a whole' },
      { id: 'scatter', name: 'Scatter Plot', description: 'Show relationship between two variables' },
      { id: 'histogram', name: 'Histogram', description: 'Show distribution of values' },
      { id: 'heatmap', name: 'Heatmap', description: 'Show patterns in matrix data' },
      { id: 'box', name: 'Box Plot', description: 'Show statistical distribution' },
      { id: 'area', name: 'Area Chart', description: 'Show cumulative values over time' },
      { id: 'correlation_matrix', name: 'Correlation Matrix', description: 'Show correlations between variables' },
      { id: 'treemap', name: 'Treemap', description: 'Show hierarchical data proportions' }
    ]
  });
});

export default router;
