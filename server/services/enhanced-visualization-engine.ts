/**
 * Enhanced Visualization Tools with Intelligent Library Selection
 * 
 * Provides comprehensive visualization capabilities with automatic
 * library selection based on dataset characteristics and requirements.
 */

import { intelligentLibrarySelector, DatasetCharacteristics, VisualizationRequirements } from './intelligent-library-selector';
import { DataTransformationService } from './data-transformation';

export interface VisualizationRequest {
  data: any[];
  chartType: string;
  requirements: VisualizationRequirements;
  datasetCharacteristics: DatasetCharacteristics;
  customizations?: {
    title?: string;
    xAxis?: string;
    yAxis?: string;
    colorBy?: string;
    sizeBy?: string;
    filters?: Record<string, any>;
    styling?: Record<string, any>;
    aggregation?: {
      groupBy?: string[];
      aggregations?: Array<{ field: string; operation: string; alias?: string }>;
    };
  };
}

export interface VisualizationResult {
  success: boolean;
  library: string;
  chartData: any;
  metadata: {
    renderTime: number;
    dataPoints: number;
    fileSize?: number;
    interactive: boolean;
  };
  exportOptions: {
    formats: string[];
    urls?: Record<string, string>;
  };
  imageData?: string; // Base64 encoded image
  error?: string;
}

export class EnhancedVisualizationEngine {
  private librarySelector = intelligentLibrarySelector;

  /**
   * Create visualization with intelligent library selection
   */
  async createVisualization(request: VisualizationRequest): Promise<VisualizationResult> {
    const startTime = Date.now();

    try {
      // Get library recommendations
      const recommendations = this.librarySelector.selectVisualizationLibrary(
        request.datasetCharacteristics,
        request.requirements
      );

      // Apply aggregation if requested
      let visualizationData = request.data;
      if (request.customizations?.aggregation) {
        const { groupBy, aggregations } = request.customizations.aggregation;
        if (groupBy && groupBy.length > 0 && aggregations && aggregations.length > 0) {
          console.log(`Applying aggregation: Group by ${groupBy.join(', ')}`);
          const aggResult = await DataTransformationService.applyTransformations(request.data, [{
            type: 'aggregate',
            config: { groupBy, aggregations }
          }]);
          visualizationData = aggResult.rows;
          // Update request data with aggregated data for visualization
          request.data = visualizationData;
        }
      }

      if (recommendations.length === 0) {
        throw new Error('No suitable visualization library found for the given requirements');
      }

      const selectedLibrary = recommendations[0];
      console.log(`Selected visualization library: ${selectedLibrary.library} (confidence: ${selectedLibrary.confidence})`);

      // Create visualization based on selected library
      const result = await this.createWithLibrary(selectedLibrary.library, request);

      // Ensure imageData is present for frontend preview
      if (!result.imageData) {
        const svg = this.generateSimpleSvg(request.chartType, request.data, request.customizations);
        result.imageData = Buffer.from(svg).toString('base64');
      }

      return {
        success: true,
        library: selectedLibrary.library,
        chartData: result.chartData,
        metadata: {
          renderTime: Date.now() - startTime,
          dataPoints: request.data.length,
          fileSize: result.fileSize,
          interactive: request.requirements.interactivity !== 'static'
        },
        exportOptions: result.exportOptions,
        imageData: result.imageData,
        ...result
      };

    } catch (error) {
      console.error('Visualization creation failed:', error);
      return {
        success: false,
        library: 'unknown',
        chartData: null,
        metadata: {
          renderTime: Date.now() - startTime,
          dataPoints: request.data.length,
          interactive: false
        },
        exportOptions: { formats: [] },
        error: String(error)
      };
    }
  }

  /**
   * Create visualization with specific library
   */
  private async createWithLibrary(library: string, request: VisualizationRequest): Promise<any> {
    switch (library) {
      case 'matplotlib':
        return await this.createMatplotlibVisualization(request);
      case 'plotly':
        return await this.createPlotlyVisualization(request);
      case 'seaborn':
        return await this.createSeabornVisualization(request);
      case 'bokeh':
        return await this.createBokehVisualization(request);
      case 'altair':
        return await this.createAltairVisualization(request);
      case 'd3':
        return await this.createD3Visualization(request);
      default:
        throw new Error(`Unsupported visualization library: ${library}`);
    }
  }

  /**
   * Create matplotlib visualization
   */
  private async createMatplotlibVisualization(request: VisualizationRequest): Promise<any> {
    // Simulate matplotlib visualization creation
    const chartData = {
      type: 'matplotlib',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        dpi: 300,
        format: 'png',
        style: 'seaborn-v0_8',
        figureSize: [10, 6]
      }
    };

    const svg = this.generateSimpleSvg(request.chartType, request.data, request.customizations);
    const base64Image = Buffer.from(svg).toString('base64');

    return {
      chartData,
      fileSize: request.data.length * 0.1, // Estimate
      imageData: base64Image,
      exportOptions: {
        formats: ['png', 'svg', 'pdf', 'eps'],
        urls: {
          png: `/api/visualizations/export/${Date.now()}.png`,
          svg: `/api/visualizations/export/${Date.now()}.svg`,
          pdf: `/api/visualizations/export/${Date.now()}.pdf`
        }
      }
    };
  }

  /**
   * Create plotly visualization
   */
  private async createPlotlyVisualization(request: VisualizationRequest): Promise<any> {
    const chartData = {
      type: 'plotly',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        displayModeBar: true,
        responsive: true,
        staticPlot: request.requirements.interactivity === 'static',
        toImageButtonOptions: {
          format: 'png',
          filename: 'chart',
          height: 500,
          width: 700,
          scale: 1
        }
      },
      layout: {
        title: request.customizations?.title || 'Chart',
        xaxis: { title: request.customizations?.xAxis },
        yaxis: { title: request.customizations?.yAxis },
        hovermode: 'closest'
      }
    };

    return {
      chartData,
      fileSize: request.data.length * 0.2, // Estimate
      exportOptions: {
        formats: ['png', 'svg', 'pdf', 'html', 'json'],
        urls: {
          html: `/api/visualizations/export/${Date.now()}.html`,
          png: `/api/visualizations/export/${Date.now()}.png`,
          svg: `/api/visualizations/export/${Date.now()}.svg`
        }
      }
    };
  }

  /**
   * Create seaborn visualization
   */
  private async createSeabornVisualization(request: VisualizationRequest): Promise<any> {
    const chartData = {
      type: 'seaborn',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        style: 'whitegrid',
        palette: 'deep',
        context: 'notebook',
        font_scale: 1.2
      }
    };

    return {
      chartData,
      fileSize: request.data.length * 0.15,
      exportOptions: {
        formats: ['png', 'svg', 'pdf'],
        urls: {
          png: `/api/visualizations/export/${Date.now()}.png`,
          svg: `/api/visualizations/export/${Date.now()}.svg`
        }
      }
    };
  }

  /**
   * Create bokeh visualization
   */
  private async createBokehVisualization(request: VisualizationRequest): Promise<any> {
    const chartData = {
      type: 'bokeh',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        output_backend: 'webgl',
        tools: ['pan', 'wheel_zoom', 'box_zoom', 'reset', 'save'],
        toolbar_location: 'above',
        responsive: true
      }
    };

    return {
      chartData,
      fileSize: request.data.length * 0.3,
      exportOptions: {
        formats: ['html', 'png', 'svg'],
        urls: {
          html: `/api/visualizations/export/${Date.now()}.html`,
          png: `/api/visualizations/export/${Date.now()}.png`
        }
      }
    };
  }

  /**
   * Create altair visualization
   */
  private async createAltairVisualization(request: VisualizationRequest): Promise<any> {
    const chartData = {
      type: 'altair',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        theme: 'default',
        renderer: 'svg',
        actions: {
          export: true,
          source: false,
          compiled: false
        }
      }
    };

    return {
      chartData,
      fileSize: request.data.length * 0.12,
      exportOptions: {
        formats: ['svg', 'png', 'pdf', 'html'],
        urls: {
          svg: `/api/visualizations/export/${Date.now()}.svg`,
          html: `/api/visualizations/export/${Date.now()}.html`
        }
      }
    };
  }

  /**
   * Create D3.js visualization
   */
  private async createD3Visualization(request: VisualizationRequest): Promise<any> {
    const chartData = {
      type: 'd3',
      chartType: request.chartType,
      data: request.data,
      customizations: request.customizations,
      config: {
        width: 800,
        height: 600,
        margin: { top: 20, right: 20, bottom: 40, left: 40 },
        animations: true,
        interactions: true
      }
    };

    return {
      chartData,
      fileSize: request.data.length * 0.25,
      exportOptions: {
        formats: ['html', 'svg', 'png'],
        urls: {
          html: `/api/visualizations/export/${Date.now()}.html`,
          svg: `/api/visualizations/export/${Date.now()}.svg`
        }
      }
    };
  }

  /**
   * Get available chart types for a library
   */
  getAvailableChartTypes(library: string): string[] {
    const chartTypes: Record<string, string[]> = {
      matplotlib: [
        'line', 'scatter', 'bar', 'histogram', 'box', 'violin', 'heatmap',
        'contour', 'surface', 'pie', 'polar', 'quiver', 'streamplot'
      ],
      plotly: [
        'line', 'scatter', 'bar', 'histogram', 'box', 'violin', 'heatmap',
        'contour', 'surface', 'pie', 'polar', 'scatter3d', 'surface3d',
        'choropleth', 'sunburst', 'treemap', 'sankey', 'candlestick'
      ],
      seaborn: [
        'lineplot', 'scatterplot', 'barplot', 'histplot', 'boxplot', 'violinplot',
        'heatmap', 'clustermap', 'pairplot', 'jointplot', 'regplot', 'residplot',
        'distplot', 'kdeplot', 'rugplot', 'stripplot', 'swarmplot'
      ],
      bokeh: [
        'line', 'scatter', 'bar', 'histogram', 'box', 'heatmap', 'contour',
        'surface', 'pie', 'polar', 'area', 'step', 'vbar', 'hbar'
      ],
      altair: [
        'line', 'point', 'bar', 'rect', 'rule', 'circle', 'square', 'tick',
        'area', 'trail', 'text', 'mark_arc', 'mark_image'
      ],
      d3: [
        'line', 'scatter', 'bar', 'histogram', 'box', 'heatmap', 'contour',
        'surface', 'pie', 'polar', 'area', 'step', 'treemap', 'sankey',
        'chord', 'force', 'pack', 'partition', 'cluster', 'bundle'
      ]
    };

    return chartTypes[library] || [];
  }

  /**
   * Get library recommendations for given requirements
   */
  getLibraryRecommendations(
    datasetCharacteristics: DatasetCharacteristics,
    requirements: VisualizationRequirements
  ) {
    return this.librarySelector.selectVisualizationLibrary(datasetCharacteristics, requirements);
  }


  /**
   * Generate a simple SVG for preview purposes
   */
  private generateSimpleSvg(chartType: string, data: any[], config: any): string {
    const width = 800;
    const height = 400;
    const padding = 40;

    // Simple mock SVG generation
    let content = '';

    if (chartType === 'bar_chart' || chartType === 'bar') {
      const barWidth = (width - 2 * padding) / Math.min(data.length, 20);
      content = data.slice(0, 20).map((d, i) => {
        const rawVal = Object.values(d)[0];
        const val = typeof rawVal === 'number' ? rawVal : (typeof rawVal === 'string' ? parseFloat(rawVal) || 0 : 0);
        const h = (val / 100) * (height - 2 * padding);
        return `<rect x="${padding + i * barWidth}" y="${height - padding - h}" width="${barWidth - 5}" height="${h}" fill="#4f46e5" />`;
      }).join('');
    } else if (chartType === 'line_chart' || chartType === 'line') {
      const points = data.slice(0, 20).map((d, i) => {
        const rawVal = Object.values(d)[0];
        const val = typeof rawVal === 'number' ? rawVal : (typeof rawVal === 'string' ? parseFloat(rawVal) || 0 : 0);
        const x = padding + i * ((width - 2 * padding) / 20);
        const y = height - padding - ((val / 100) * (height - 2 * padding));
        return `${x},${y}`;
      }).join(' ');
      content = `<polyline points="${points}" fill="none" stroke="#4f46e5" stroke-width="2" />`;
    } else {
      // Default placeholder
      content = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#666">Preview for ${chartType}</text>`;
    }

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f8fafc" />
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#cbd5e1" stroke-width="2" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#cbd5e1" stroke-width="2" />
      ${content}
    </svg>`;
  }
}

export const enhancedVisualizationEngine = new EnhancedVisualizationEngine();


