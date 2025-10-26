// server/services/real-tool-handlers.ts
import { AdvancedAnalyzer } from '../advanced-analyzer';
import { MLService } from '../ml-service';
import { VisualizationAPIService } from '../visualization-api-service';
import { PythonProcessor } from './enhanced-python-processor';
import { intelligentLibrarySelector, DatasetCharacteristics, VisualizationRequirements, AnalysisRequirements } from './intelligent-library-selector';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Real Tool Handlers - Connect MCP Tool Registry to actual service implementations
 *
 * This file replaces mock/simulated tool responses with real computational analysis
 * using Python, statistical libraries, and ML frameworks.
 */

export interface ToolExecutionContext {
  executionId: string;
  agentId: string;
  userId?: number;
  projectId?: string;
  timestamp: Date;
}

export interface ToolExecutionResult {
  executionId: string;
  toolId: string;
  status: 'success' | 'error' | 'partial';
  result: any;
  metrics: {
    duration: number;
    resourcesUsed: { cpu: number; memory: number; storage: number };
    cost: number;
  };
  artifacts?: Array<{
    type: string;
    data: any;
    metadata?: any;
  }>;
  error?: string;
}

/**
 * Enhanced Statistical Analyzer Tool Handler with Intelligent Library Selection
 * Connects to AdvancedAnalyzer service for real statistical computations with smart library selection
 */
export class StatisticalAnalyzerHandler {
  private pythonProcessor: PythonProcessor;

  constructor() {
    this.pythonProcessor = new PythonProcessor();
  }

  async execute(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Initialize Python processor
      await this.pythonProcessor.initialize();

      // Validate input
      const validation = await this.validate(input);
      if (!validation.isValid) {
        return {
          executionId: context.executionId,
          toolId: 'statistical_analyzer',
          status: 'error',
          result: null,
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
            cost: 0
          },
          error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      const { data, config } = input;

      // Analyze dataset characteristics for intelligent library selection
      const datasetCharacteristics = this.analyzeDatasetCharacteristics(data);
      const analysisRequirements = this.extractAnalysisRequirements(config);

      // Get intelligent library recommendations
      const libraryRecommendations = intelligentLibrarySelector.selectStatisticalLibrary(
        datasetCharacteristics,
        analysisRequirements
      );

      const selectedLibrary = libraryRecommendations[0];
      console.log(`📊 Selected statistical library: ${selectedLibrary.library} (confidence: ${selectedLibrary.confidence})`);
      console.log(`🔬 Reasoning: ${selectedLibrary.reasoning}`);

      // Enhance config with library-specific optimizations
      const enhancedConfig = this.enhanceConfigForLibrary(config, selectedLibrary);

      // Execute real statistical analysis using AdvancedAnalyzer with library selection
      const analysisResult = await AdvancedAnalyzer.performStepByStepAnalysis(data, enhancedConfig);

      const duration = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'statistical_analyzer',
        status: 'success',
        result: {
          ...analysisResult,
          librarySelection: {
            selectedLibrary: selectedLibrary.library,
            confidence: selectedLibrary.confidence,
            reasoning: selectedLibrary.reasoning,
            alternatives: libraryRecommendations.slice(1).map(rec => ({
              library: rec.library,
              confidence: rec.confidence,
              reasoning: rec.reasoning
            }))
          }
        },
        metrics: {
          duration,
          resourcesUsed: {
            cpu: this.estimateCPUForLibrary(data.length, selectedLibrary.library, config.analysisType),
            memory: this.estimateMemoryForLibrary(data.length, selectedLibrary.library),
            storage: 0
          },
          cost: this.calculateCostForLibrary(data.length, selectedLibrary.library, config.analysisType)
        },
        artifacts: [{
          type: 'statistical_analysis',
          data: analysisResult,
          metadata: {
            analysisType: config.analysisType,
            recordCount: data.length,
            selectedLibrary: selectedLibrary.library,
            libraryConfidence: selectedLibrary.confidence,
            timestamp: new Date().toISOString()
          }
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        executionId: context.executionId,
        toolId: 'statistical_analyzer',
        status: 'error',
        result: null,
        metrics: {
          duration,
          resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
          cost: 0
        },
        error: `Statistical analysis failed: ${(error as Error).message || String(error)}`
      };
    }
  }

  /**
   * Analyze dataset characteristics for intelligent library selection
   */
  private analyzeDatasetCharacteristics(data: any[]): DatasetCharacteristics {
    if (!data || data.length === 0) {
      return {
        size: 0,
        columns: 0,
        dataTypes: { numeric: 0, categorical: 0, datetime: 0, text: 0, boolean: 0 },
        memoryFootprint: 0,
        sparsity: 0,
        cardinality: {}
      };
    }

    const sample = data.slice(0, Math.min(1000, data.length));
    const columns = Object.keys(sample[0]);
    
    let numeric = 0, categorical = 0, datetime = 0, text = 0, boolean = 0;
    const cardinality: Record<string, number> = {};

    columns.forEach(col => {
      const values = sample.map(row => row[col]).filter(val => val !== null && val !== undefined);
      const uniqueValues = new Set(values).size;
      cardinality[col] = uniqueValues;

      // Determine data type
      const firstValue = values[0];
      if (typeof firstValue === 'number') {
        numeric++;
      } else if (typeof firstValue === 'boolean') {
        boolean++;
      } else if (typeof firstValue === 'string') {
        if (uniqueValues < 20) {
          categorical++;
        } else {
          text++;
        }
      } else if (firstValue instanceof Date || (typeof firstValue === 'string' && !isNaN(Date.parse(firstValue)))) {
        datetime++;
      }
    });

    const totalCells = data.length * columns.length;
    const nullCells = data.reduce((count, row) => 
      count + columns.reduce((colCount, col) => 
        colCount + (row[col] === null || row[col] === undefined ? 1 : 0), 0), 0);
    const sparsity = totalCells > 0 ? (nullCells / totalCells) * 100 : 0;

    return {
      size: data.length,
      columns: columns.length,
      dataTypes: { numeric, categorical, datetime, text, boolean },
      memoryFootprint: JSON.stringify(data).length / 1024 / 1024, // MB estimate
      sparsity,
      cardinality
    };
  }

  /**
   * Extract analysis requirements from config
   */
  private extractAnalysisRequirements(config: any): AnalysisRequirements {
    const analysisType = config.analysisType || 'descriptive';
    
    return {
      type: this.mapAnalysisTypeToRequirement(analysisType),
      complexity: this.determineComplexity(config),
      realTime: config.realTime || false,
      interactive: config.interactive || false,
      exportFormats: config.exportFormats || ['json', 'csv'],
      performancePriority: config.performancePriority || 'balanced'
    };
  }

  /**
   * Map analysis type to requirement type
   */
  private mapAnalysisTypeToRequirement(analysisType: string): 'descriptive' | 'inferential' | 'predictive' | 'exploratory' {
    if (['anova', 'ancova', 'manova', 'mancova', 'regression'].includes(analysisType)) {
      return 'inferential';
    } else if (['machine_learning', 'classification', 'regression_ml', 'clustering'].includes(analysisType)) {
      return 'predictive';
    } else if (['descriptive', 'comparative_analysis'].includes(analysisType)) {
      return 'descriptive';
    } else {
      return 'exploratory';
    }
  }

  /**
   * Determine analysis complexity
   */
  private determineComplexity(config: any): 'simple' | 'moderate' | 'complex' {
    const analysisType = config.analysisType || 'descriptive';
    
    if (['descriptive', 'comparative_analysis'].includes(analysisType)) {
      return 'simple';
    } else if (['anova', 'ancova', 'regression'].includes(analysisType)) {
      return 'moderate';
    } else if (['manova', 'mancova', 'machine_learning', 'classification', 'clustering'].includes(analysisType)) {
      return 'complex';
    } else {
      return 'moderate';
    }
  }

  /**
   * Enhance config with library-specific optimizations
   */
  private enhanceConfigForLibrary(config: any, selectedLibrary: any): any {
    const enhancedConfig = { ...config };

    switch (selectedLibrary.library) {
      case 'scipy':
        enhancedConfig.library = 'scipy';
        enhancedConfig.useStatsmodels = false;
        enhancedConfig.usePandas = false;
        enhancedConfig.optimizeForSpeed = true;
        break;
      case 'statsmodels':
        enhancedConfig.library = 'statsmodels';
        enhancedConfig.useStatsmodels = true;
        enhancedConfig.usePandas = true;
        enhancedConfig.detailedOutput = true;
        break;
      case 'pandas':
        enhancedConfig.library = 'pandas';
        enhancedConfig.usePandas = true;
        enhancedConfig.useStatsmodels = false;
        enhancedConfig.exploratoryMode = true;
        break;
      case 'numpy':
        enhancedConfig.library = 'numpy';
        enhancedConfig.useNumpy = true;
        enhancedConfig.usePandas = false;
        enhancedConfig.vectorizedOperations = true;
        break;
      case 'dask':
        enhancedConfig.library = 'dask';
        enhancedConfig.useDask = true;
        enhancedConfig.parallelProcessing = true;
        enhancedConfig.chunkSize = 10000;
        break;
      case 'polars':
        enhancedConfig.library = 'polars';
        enhancedConfig.usePolars = true;
        enhancedConfig.usePandas = false;
        enhancedConfig.lazyEvaluation = true;
        break;
    }

    return enhancedConfig;
  }

  /**
   * Estimate CPU usage based on library and analysis type
   */
  private estimateCPUForLibrary(recordCount: number, library: string, analysisType: string): number {
    const baseLoad = 5;
    const recordMultiplier = recordCount / 10000;
    
    const libraryMultipliers: Record<string, number> = {
      'scipy': 1.0,
      'statsmodels': 1.5,
      'pandas': 1.2,
      'numpy': 0.8,
      'dask': 2.0,
      'polars': 0.9
    };

    const complexityMultiplier = analysisType.includes('machine_learning') ? 3 :
                                 analysisType.includes('manova') ? 2 : 1;

    return baseLoad + (recordMultiplier * (libraryMultipliers[library] || 1.2) * complexityMultiplier);
  }

  /**
   * Estimate memory usage based on library and data size
   */
  private estimateMemoryForLibrary(recordCount: number, library: string): number {
    const baseMemory = recordCount * 0.1;
    
    const libraryMultipliers: Record<string, number> = {
      'scipy': 1.0,
      'statsmodels': 1.8,
      'pandas': 1.5,
      'numpy': 0.7,
      'dask': 0.5, // Dask is memory efficient
      'polars': 0.6
    };

    return baseMemory * (libraryMultipliers[library] || 1.2);
  }

  /**
   * Calculate cost based on library and analysis complexity
   */
  private calculateCostForLibrary(recordCount: number, library: string, analysisType: string): number {
    const baseCost = 0.01;
    const recordCost = (recordCount / 1000) * 0.005;
    
    const libraryCosts: Record<string, number> = {
      'scipy': 0.005,
      'statsmodels': 0.01,
      'pandas': 0.007,
      'numpy': 0.003,
      'dask': 0.015,
      'polars': 0.008
    };

    const complexityCost = analysisType.includes('machine_learning') ? 0.05 : 0.01;
    
    return baseCost + recordCost + (libraryCosts[library] || 0.01) + complexityCost;
  }

  async validate(input: any): Promise<{ isValid: boolean; errors: any[]; warnings: any[] }> {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!input.data || !Array.isArray(input.data) || input.data.length === 0) {
      errors.push({ field: 'data', message: 'Data must be a non-empty array', code: 'INVALID_DATA' });
    }

    if (!input.config || typeof input.config !== 'object') {
      errors.push({ field: 'config', message: 'Config must be an object', code: 'INVALID_CONFIG' });
    }

    if (input.config && !input.config.analysisType) {
      errors.push({ field: 'analysisType', message: 'Analysis type is required', code: 'MISSING_ANALYSIS_TYPE' });
    }

    const validAnalysisTypes = [
      'descriptive', 'anova', 'ancova', 'manova', 'mancova',
      'regression', 'machine_learning', 'classification',
      'regression_ml', 'clustering', 'business_insights',
      'comparative_analysis', 'predictive_insights', 'root_cause_analysis'
    ];

    if (input.config && input.config.analysisType && !validAnalysisTypes.includes(input.config.analysisType)) {
      errors.push({
        field: 'analysisType',
        message: `Analysis type must be one of: ${validAnalysisTypes.join(', ')}`,
        code: 'INVALID_ANALYSIS_TYPE'
      });
    }

    // Warn if dataset is very large
    if (input.data && input.data.length > 100000) {
      warnings.push({
        field: 'data',
        message: 'Large dataset detected - consider using Spark for better performance',
        code: 'LARGE_DATASET'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async getStatus() {
    const pythonHealth = await this.pythonProcessor.healthCheck();

    return {
      status: pythonHealth.healthy ? 'active' : 'degraded',
      currentExecutions: 0,
      queuedExecutions: 0,
      lastActivity: new Date(),
      healthScore: pythonHealth.healthy ? 100 : 50,
      resourceUsage: { cpu: 2.5, memory: 128, storage: 10 },
      pythonDetails: pythonHealth.details
    };
  }

  private estimateCPU(recordCount: number, analysisType: string): number {
    const baseLoad = 5;
    const recordMultiplier = recordCount / 10000;
    const complexityMultiplier = analysisType.includes('machine_learning') ? 3 :
                                   analysisType.includes('manova') ? 2 : 1;
    return baseLoad + (recordMultiplier * complexityMultiplier);
  }

  private calculateCost(recordCount: number, analysisType: string): number {
    const baseCost = 0.01;
    const recordCost = (recordCount / 1000) * 0.005;
    const complexityCost = analysisType.includes('machine_learning') ? 0.05 : 0.01;
    return baseCost + recordCost + complexityCost;
  }
}

/**
 * ML Pipeline Tool Handler
 * Connects to MLService for real machine learning model training and prediction
 */
export class MLPipelineHandler {
  private mlService: MLService;
  private pythonProcessor: PythonProcessor;

  constructor() {
    this.mlService = new MLService();
    this.pythonProcessor = new PythonProcessor();
  }

  async execute(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Initialize Python processor for ML operations
      await this.pythonProcessor.initialize();

      // Check if ML libraries are available
      const mlAvailable = await this.pythonProcessor.checkMLLibraries();
      if (!mlAvailable) {
        return {
          executionId: context.executionId,
          toolId: 'ml_pipeline',
          status: 'error',
          result: null,
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
            cost: 0
          },
          error: 'ML libraries (scikit-learn, pandas) not available - cannot perform ML analysis'
        };
      }

      // Validate input
      const validation = await this.validate(input);
      if (!validation.isValid) {
        return {
          executionId: context.executionId,
          toolId: 'ml_pipeline',
          status: 'error',
          result: null,
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
            cost: 0
          },
          error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      const { data, config } = input;
      const { analysisType, targetColumn, features, parameters = {} } = config;

      // Save data to temporary file for Python processing
      const tempDir = path.join(process.cwd(), 'temp', 'ml_data');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const dataPath = path.join(tempDir, `ml_data_${context.executionId}.csv`);
      this.saveDataToCSV(data, dataPath);

      // Execute ML analysis using real MLService
      const mlResult = await this.mlService.runAnalysis({
        projectId: context.projectId || 'unknown',
        analysisType: analysisType || 'classification',
        targetColumn,
        features,
        parameters,
        userId: context.userId || 0
      }, dataPath);

      // Cleanup temp file
      try {
        fs.unlinkSync(dataPath);
      } catch {}

      const duration = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'ml_pipeline',
        status: 'success',
        result: mlResult,
        metrics: {
          duration,
          resourcesUsed: {
            cpu: this.estimateCPU(data.length, analysisType),
            memory: data.length * 0.5, // ML requires more memory
            storage: 0
          },
          cost: this.calculateCost(data.length, analysisType)
        },
        artifacts: [{
          type: 'ml_model',
          data: mlResult,
          metadata: {
            analysisType,
            targetColumn,
            features,
            recordCount: data.length,
            timestamp: new Date().toISOString()
          }
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        executionId: context.executionId,
        toolId: 'ml_pipeline',
        status: 'error',
        result: null,
        metrics: {
          duration,
          resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
          cost: 0
        },
        error: `ML analysis failed: ${(error as Error).message || String(error)}`
      };
    }
  }

  async validate(input: any): Promise<{ isValid: boolean; errors: any[]; warnings: any[] }> {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!input.data || !Array.isArray(input.data) || input.data.length === 0) {
      errors.push({ field: 'data', message: 'Data must be a non-empty array', code: 'INVALID_DATA' });
    }

    if (!input.config || typeof input.config !== 'object') {
      errors.push({ field: 'config', message: 'Config must be an object', code: 'INVALID_CONFIG' });
    }

    const validAnalysisTypes = ['regression', 'classification', 'clustering', 'timeseries', 'anomaly', 'association'];

    if (input.config && input.config.analysisType && !validAnalysisTypes.includes(input.config.analysisType)) {
      errors.push({
        field: 'analysisType',
        message: `Analysis type must be one of: ${validAnalysisTypes.join(', ')}`,
        code: 'INVALID_ANALYSIS_TYPE'
      });
    }

    // Check for supervised learning requirements
    if (input.config && ['regression', 'classification'].includes(input.config.analysisType)) {
      if (!input.config.targetColumn) {
        errors.push({
          field: 'targetColumn',
          message: 'Target column is required for supervised learning',
          code: 'MISSING_TARGET_COLUMN'
        });
      }
    }

    // Minimum dataset size for ML
    if (input.data && input.data.length < 30) {
      warnings.push({
        field: 'data',
        message: 'Dataset is very small - ML models may not be reliable',
        code: 'SMALL_DATASET'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async getStatus() {
    const pythonHealth = await this.pythonProcessor.healthCheck();
    const mlAvailable = await this.pythonProcessor.checkMLLibraries();

    return {
      status: pythonHealth.healthy && mlAvailable ? 'active' : 'degraded',
      currentExecutions: 0,
      queuedExecutions: 0,
      lastActivity: new Date(),
      healthScore: pythonHealth.healthy && mlAvailable ? 100 : 30,
      resourceUsage: { cpu: 5.0, memory: 512, storage: 50 },
      pythonDetails: pythonHealth.details,
      mlLibrariesAvailable: mlAvailable
    };
  }

  private saveDataToCSV(data: any[], filePath: string): void {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.includes(',')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return String(value);
      });
      csvRows.push(values.join(','));
    });

    fs.writeFileSync(filePath, csvRows.join('\n'), 'utf8');
  }

  private estimateCPU(recordCount: number, analysisType: string): number {
    const baseLoad = 10;
    const recordMultiplier = recordCount / 1000;
    const complexityMultiplier = analysisType === 'timeseries' ? 3 :
                                   analysisType === 'clustering' ? 2 : 1.5;
    return baseLoad + (recordMultiplier * complexityMultiplier);
  }

  private calculateCost(recordCount: number, analysisType: string): number {
    const baseCost = 0.05; // ML is more expensive
    const recordCost = (recordCount / 500) * 0.01;
    const complexityCost = analysisType === 'timeseries' ? 0.15 : 0.08;
    return baseCost + recordCost + complexityCost;
  }
}

/**
 * Enhanced Visualization Engine Tool Handler with Intelligent Library Selection
 * Connects to VisualizationAPIService for real chart generation with smart library selection
 */
export class VisualizationEngineHandler {
  async execute(input: any, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Validate input
      const validation = await this.validate(input);
      if (!validation.isValid) {
        return {
          executionId: context.executionId,
          toolId: 'visualization_engine',
          status: 'error',
          result: null,
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
            cost: 0
          },
          error: `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`
        };
      }

      const { data, config } = input;

      // Analyze dataset characteristics for intelligent library selection
      const datasetCharacteristics = this.analyzeDatasetCharacteristics(data);
      const visualizationRequirements = this.extractVisualizationRequirements(config);

      // Get intelligent library recommendations
      const libraryRecommendations = intelligentLibrarySelector.selectVisualizationLibrary(
        datasetCharacteristics,
        visualizationRequirements
      );

      const selectedLibrary = libraryRecommendations[0];
      console.log(`🎨 Selected visualization library: ${selectedLibrary.library} (confidence: ${selectedLibrary.confidence})`);
      console.log(`📊 Reasoning: ${selectedLibrary.reasoning}`);

      // Enhance config with library-specific optimizations
      const enhancedConfig = this.enhanceConfigForLibrary(config, selectedLibrary);

      // Execute real visualization using VisualizationAPIService with library selection
      const visualizationResult = await VisualizationAPIService.createVisualization(data, enhancedConfig);

      const duration = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'visualization_engine',
        status: 'success',
        result: {
          ...visualizationResult,
          librarySelection: {
            selectedLibrary: selectedLibrary.library,
            confidence: selectedLibrary.confidence,
            reasoning: selectedLibrary.reasoning,
            alternatives: libraryRecommendations.slice(1).map(rec => ({
              library: rec.library,
              confidence: rec.confidence,
              reasoning: rec.reasoning
            }))
          }
        },
        metrics: {
          duration,
          resourcesUsed: {
            cpu: this.estimateCPUForLibrary(data.length, selectedLibrary.library),
            memory: this.estimateMemoryForLibrary(data.length, selectedLibrary.library),
            storage: 0
          },
          cost: this.calculateCostForLibrary(data.length, selectedLibrary.library, config.type)
        },
        artifacts: [{
          type: 'visualization',
          data: visualizationResult,
          metadata: {
            chartType: config.type,
            recordCount: data.length,
            selectedLibrary: selectedLibrary.library,
            libraryConfidence: selectedLibrary.confidence,
            timestamp: new Date().toISOString()
          }
        }]
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        executionId: context.executionId,
        toolId: 'visualization_engine',
        status: 'error',
        result: null,
        metrics: {
          duration,
          resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
          cost: 0
        },
        error: `Visualization creation failed: ${(error as Error).message || String(error)}`
      };
    }
  }

  /**
   * Analyze dataset characteristics for intelligent library selection
   */
  private analyzeDatasetCharacteristics(data: any[]): DatasetCharacteristics {
    if (!data || data.length === 0) {
      return {
        size: 0,
        columns: 0,
        dataTypes: { numeric: 0, categorical: 0, datetime: 0, text: 0, boolean: 0 },
        memoryFootprint: 0,
        sparsity: 0,
        cardinality: {}
      };
    }

    const sample = data.slice(0, Math.min(1000, data.length));
    const columns = Object.keys(sample[0]);
    
    let numeric = 0, categorical = 0, datetime = 0, text = 0, boolean = 0;
    const cardinality: Record<string, number> = {};

    columns.forEach(col => {
      const values = sample.map(row => row[col]).filter(val => val !== null && val !== undefined);
      const uniqueValues = new Set(values).size;
      cardinality[col] = uniqueValues;

      // Determine data type
      const firstValue = values[0];
      if (typeof firstValue === 'number') {
        numeric++;
      } else if (typeof firstValue === 'boolean') {
        boolean++;
      } else if (typeof firstValue === 'string') {
        if (uniqueValues < 20) {
          categorical++;
        } else {
          text++;
        }
      } else if (firstValue instanceof Date || (typeof firstValue === 'string' && !isNaN(Date.parse(firstValue)))) {
        datetime++;
      }
    });

    const totalCells = data.length * columns.length;
    const nullCells = data.reduce((count, row) => 
      count + columns.reduce((colCount, col) => 
        colCount + (row[col] === null || row[col] === undefined ? 1 : 0), 0), 0);
    const sparsity = totalCells > 0 ? (nullCells / totalCells) * 100 : 0;

    return {
      size: data.length,
      columns: columns.length,
      dataTypes: { numeric, categorical, datetime, text, boolean },
      memoryFootprint: JSON.stringify(data).length / 1024 / 1024, // MB estimate
      sparsity,
      cardinality
    };
  }

  /**
   * Extract visualization requirements from config
   */
  private extractVisualizationRequirements(config: any): VisualizationRequirements {
    const chartType = config.type || 'bar';
    const dataSize = config.dataSize || 'medium';
    
    return {
      chartTypes: [chartType],
      interactivity: config.interactive ? 'interactive' : 'static',
      dataSize: dataSize as 'small' | 'medium' | 'large' | 'massive',
      styling: config.styling || 'professional',
      exportFormats: config.exportFormats || ['png', 'svg'],
      performancePriority: config.performancePriority || 'balanced'
    };
  }

  /**
   * Enhance config with library-specific optimizations
   */
  private enhanceConfigForLibrary(config: any, selectedLibrary: any): any {
    const enhancedConfig = { ...config };

    switch (selectedLibrary.library) {
      case 'plotly':
        enhancedConfig.library = 'plotly';
        enhancedConfig.interactive = true;
        enhancedConfig.exportFormats = ['html', 'png', 'svg', 'pdf'];
        break;
      case 'matplotlib':
        enhancedConfig.library = 'matplotlib';
        enhancedConfig.interactive = false;
        enhancedConfig.exportFormats = ['png', 'svg', 'pdf', 'eps'];
        enhancedConfig.dpi = 300;
        break;
      case 'seaborn':
        enhancedConfig.library = 'seaborn';
        enhancedConfig.interactive = false;
        enhancedConfig.style = 'whitegrid';
        enhancedConfig.palette = 'deep';
        break;
      case 'bokeh':
        enhancedConfig.library = 'bokeh';
        enhancedConfig.interactive = true;
        enhancedConfig.output_backend = 'webgl';
        enhancedConfig.tools = ['pan', 'wheel_zoom', 'box_zoom', 'reset', 'save'];
        break;
      case 'altair':
        enhancedConfig.library = 'altair';
        enhancedConfig.interactive = false;
        enhancedConfig.theme = 'default';
        enhancedConfig.renderer = 'svg';
        break;
      case 'd3':
        enhancedConfig.library = 'd3';
        enhancedConfig.interactive = true;
        enhancedConfig.animations = true;
        enhancedConfig.custom_styling = true;
        break;
    }

    return enhancedConfig;
  }

  /**
   * Estimate CPU usage based on library and data size
   */
  private estimateCPUForLibrary(recordCount: number, library: string): number {
    const baseLoad = 3;
    const recordMultiplier = recordCount / 10000;
    
    const libraryMultipliers: Record<string, number> = {
      'matplotlib': 1.0,
      'seaborn': 1.2,
      'plotly': 1.5,
      'bokeh': 2.0,
      'altair': 1.3,
      'd3': 2.5
    };

    return baseLoad + (recordMultiplier * (libraryMultipliers[library] || 1.5));
  }

  /**
   * Estimate memory usage based on library and data size
   */
  private estimateMemoryForLibrary(recordCount: number, library: string): number {
    const baseMemory = recordCount * 0.05;
    
    const libraryMultipliers: Record<string, number> = {
      'matplotlib': 1.0,
      'seaborn': 1.1,
      'plotly': 1.3,
      'bokeh': 1.8,
      'altair': 1.2,
      'd3': 2.0
    };

    return baseMemory * (libraryMultipliers[library] || 1.3);
  }

  /**
   * Calculate cost based on library and complexity
   */
  private calculateCostForLibrary(recordCount: number, library: string, chartType: string): number {
    const baseCost = 0.01;
    const recordCost = (recordCount / 1000) * 0.002;
    
    const libraryCosts: Record<string, number> = {
      'matplotlib': 0.005,
      'seaborn': 0.007,
      'plotly': 0.01,
      'bokeh': 0.015,
      'altair': 0.008,
      'd3': 0.02
    };

    const complexityCost = chartType === 'heatmap' ? 0.01 : 0.005;
    
    return baseCost + recordCost + (libraryCosts[library] || 0.01) + complexityCost;
  }

  async validate(input: any): Promise<{ isValid: boolean; errors: any[]; warnings: any[] }> {
    const errors: any[] = [];
    const warnings: any[] = [];

    if (!input.data || !Array.isArray(input.data) || input.data.length === 0) {
      errors.push({ field: 'data', message: 'Data must be a non-empty array', code: 'INVALID_DATA' });
    }

    if (!input.config || typeof input.config !== 'object') {
      errors.push({ field: 'config', message: 'Config must be an object', code: 'INVALID_CONFIG' });
    }

    if (input.config && !input.config.type) {
      errors.push({ field: 'type', message: 'Visualization type is required', code: 'MISSING_TYPE' });
    }

    const validTypes = ['bar', 'line', 'scatter', 'pie', 'heatmap', 'box', 'histogram', 'area'];

    if (input.config && input.config.type && !validTypes.includes(input.config.type)) {
      errors.push({
        field: 'type',
        message: `Visualization type must be one of: ${validTypes.join(', ')}`,
        code: 'INVALID_TYPE'
      });
    }

    // Warn about large datasets for certain chart types
    if (input.data && input.data.length > 10000 && input.config?.type === 'scatter') {
      warnings.push({
        field: 'data',
        message: 'Large dataset for scatter plot - consider sampling or aggregation',
        code: 'LARGE_SCATTER_DATASET'
      });
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  async getStatus() {
    // Check if Python is available for visualization
    try {
      const pythonProcessor = new PythonProcessor();
      const pythonHealth = await pythonProcessor.healthCheck();

      return {
        status: pythonHealth.healthy ? 'active' : 'degraded',
        currentExecutions: 0,
        queuedExecutions: 0,
        lastActivity: new Date(),
        healthScore: pythonHealth.healthy ? 100 : 50,
        resourceUsage: { cpu: 2.0, memory: 256, storage: 20 },
        pythonDetails: pythonHealth.details
      };
    } catch (error) {
      return {
        status: 'degraded' as any,
        currentExecutions: 0,
        queuedExecutions: 0,
        lastActivity: new Date(),
        healthScore: 30,
        resourceUsage: { cpu: 0, memory: 0, storage: 0 },
        error: 'Failed to check Python availability'
      };
    }
  }

  private calculateCost(recordCount: number, chartType: string): number {
    const baseCost = 0.005;
    const recordCost = (recordCount / 5000) * 0.002;
    const complexityCost = chartType === 'heatmap' ? 0.01 : 0.005;
    return baseCost + recordCost + complexityCost;
  }
}

/**
 * Export singleton instances for use in tool registry
 */
export const statisticalAnalyzerHandler = new StatisticalAnalyzerHandler();
export const mlPipelineHandler = new MLPipelineHandler();
export const visualizationEngineHandler = new VisualizationEngineHandler();
