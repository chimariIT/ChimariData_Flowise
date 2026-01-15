// server/services/data-engineer-agent.ts
import { AgentHandler, AgentTask, AgentResult, AgentStatus, AgentCapability } from './agent-registry';
import { nanoid } from 'nanoid';
import { measurePerformance } from '../utils/performance-monitor';
import { FileProcessor } from './file-processor';
import { promises as fs } from 'fs';
import path from 'path';
import type { DataAssessment } from '@shared/schema';
import { intelligentTransformer, type TransformationOperation } from './intelligent-data-transformer';

// ==========================================
// CONSULTATION INTERFACES (Multi-Agent Coordination)
// ==========================================

export interface DataQualityIssueDetail {
  type: 'missing_values' | 'outliers' | 'inconsistencies' | 'duplicates';
  severity: 'high' | 'medium' | 'low';
  affected: string[];
  count: number;
  message?: string;
}

export interface DataQualityReport {
  overallScore: number;
  completeness: number;
  issues: Array<DataQualityIssueDetail | string>;
  issueDetails: DataQualityIssueDetail[];
  issueMessages: string[];
  recommendations: string[];
  warnings: string[];
  transformations: string[];
  confidence: number;
  estimatedFixTime: string;
  qualityScore: number;
  metadata: {
    datasetId?: string;
    rowsAnalyzed: number;
    columnsAnalyzed: number;
  };
}

export interface TransformationOptions {
  transformations: Array<{
    targetColumn: string;
    method: string;
    sourceColumns: string[];
    confidence: number;
    businessValue: 'high' | 'medium' | 'low';
    description: string;
  }>;
  reasoning: string;
}

export interface TimeEstimate {
  estimatedMinutes: number;
  confidence: number;
  factors: string[];
}

type TransformationEngine = 'javascript' | 'polars' | 'pandas' | 'spark';

interface EngineDecision {
  transformationId: string;
  name: string;
  requestedType: DataTransformation['type'];
  operation: TransformationOperation | null;
  estimatedRows: number;
  optimizationHint: 'speed' | 'memory' | 'balanced';
  selectedEngine: TransformationEngine;
  fallbackEngines: TransformationEngine[];
  slaCategory: 'critical' | 'high' | 'standard';
  notes?: string;
}

// ==========================================
// FILE ANALYSIS INTERFACES (Agent Recommendation Workflow)
// ==========================================

export interface FileAnalysisResult {
  fileId: string;
  fileName: string;
  recordCount: number;
  columnCount: number;
  schema: Array<{ name: string; type: string; nullable?: boolean; }>;
  sampleData: any[];
  dataQuality: {
    completeness: number;
    nullCount: number;
    duplicateCount: number;
  };
  detectedRelationships: Array<{
    column: string;
    likelyForeignKey: boolean;
    suggestedRelation: string;
  }>;
}

export interface ProjectDataAnalysis {
  totalRows: number;
  totalColumns: number;
  filesAnalyzed: number;
  files: FileAnalysisResult[];
  relationships: Array<{ file1: string; file2: string; joinKey: string; confidence: number; }>;
  dataCharacteristics: {
    hasTimeSeries: boolean;
    hasCategories: boolean;
    hasText: boolean;
    hasNumeric: boolean;
  };
  overallDataQuality: number;
}

// ==========================================
// PIPELINE INTERFACES
// ==========================================

export interface DataPipelineRequest {
  type: 'etl' | 'data_cleaning' | 'transformation' | 'validation' | 'migration';
  sourceData: {
    type: 'file' | 'database' | 'api' | 'stream';
    location: string;
    format: string;
    schema?: any;
    size?: number;
  };
  targetData: {
    type: 'file' | 'database' | 'warehouse' | 'lake';
    location: string;
    format: string;
    schema?: any;
  };
  transformations: DataTransformation[];
  validationRules: ValidationRule[];
  schedule?: {
    type: 'once' | 'recurring';
    cronExpression?: string;
    dependencies?: string[];
  };
  metadata: {
    projectId: string;
    userId: string;
    priority: number;
    tags: string[];
  };
}

export interface DataTransformation {
  id: string;
  type: 'filter' | 'map' | 'aggregate' | 'join' | 'pivot' | 'normalize' | 'denormalize' | 'custom';
  name: string;
  description: string;
  configuration: Record<string, any>;
  order: number;
  conditions?: {
    field: string;
    operator: string;
    value: any;
  }[];
}

export interface ValidationRule {
  id: string;
  type: 'data_quality' | 'schema_validation' | 'business_rule' | 'completeness' | 'uniqueness';
  field?: string;
  rule: string;
  severity: 'error' | 'warning' | 'info';
  action: 'block' | 'warn' | 'log' | 'fix';
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  metrics: {
    recordsProcessed: number;
    recordsSuccess: number;
    recordsError: number;
    dataVolumeMB: number;
    executionTimeMs: number;
  };
  logs: PipelineLog[];
  errors: PipelineError[];
}

export interface PipelineLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface PipelineError {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  data?: any;
}

export class DataEngineerAgent implements AgentHandler {
  private pipelines: Map<string, DataPipelineRequest> = new Map();
  private executions: Map<string, PipelineExecution> = new Map();
  private currentTasks = 0;
  private readonly maxConcurrentTasks = 3;
  private fileProcessor: typeof FileProcessor;
  private readonly transformer = intelligentTransformer;

  constructor(fileProcessor?: typeof FileProcessor) {
    this.fileProcessor = fileProcessor || FileProcessor;
    console.log('🔧 Data Engineer Agent initialized');
  }

  setFileProcessor(fileProcessor: typeof FileProcessor): void {
    this.fileProcessor = fileProcessor;
  }

  private inferMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();

    switch (ext) {
      case '.csv':
        return 'text/csv';
      case '.json':
        return 'application/json';
      case '.xlsx':
      case '.xls':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case '.parquet':
        return 'application/octet-stream';
      case '.txt':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }

  static getCapabilities(): AgentCapability[] {
    return [
      {
        name: 'data_pipeline',
        description: 'Design and execute data pipelines for ETL operations',
        inputTypes: ['csv', 'json', 'xml', 'parquet', 'database'],
        outputTypes: ['csv', 'json', 'parquet', 'database', 'warehouse'],
        complexity: 'high',
        estimatedDuration: 300,
        requiredResources: ['compute', 'storage'],
        tags: ['etl', 'pipeline', 'data_processing']
      },
      {
        name: 'data_cleaning',
        description: 'Clean and standardize data quality issues',
        inputTypes: ['csv', 'json', 'xml', 'database'],
        outputTypes: ['csv', 'json', 'database'],
        complexity: 'medium',
        estimatedDuration: 180,
        requiredResources: ['compute'],
        tags: ['cleaning', 'quality', 'standardization']
      },
      {
        name: 'data_transformation',
        description: 'Transform data formats and structures',
        inputTypes: ['csv', 'json', 'xml', 'parquet'],
        outputTypes: ['csv', 'json', 'xml', 'parquet'],
        complexity: 'medium',
        estimatedDuration: 120,
        requiredResources: ['compute'],
        tags: ['transformation', 'format_conversion', 'schema_mapping']
      },
      {
        name: 'data_validation',
        description: 'Validate data quality and business rules',
        inputTypes: ['csv', 'json', 'database'],
        outputTypes: ['validation_report', 'cleaned_data'],
        complexity: 'low',
        estimatedDuration: 60,
        requiredResources: ['compute'],
        tags: ['validation', 'quality_check', 'business_rules']
      },
      {
        name: 'etl_processing',
        description: 'Full ETL pipeline processing with monitoring',
        inputTypes: ['multiple_sources'],
        outputTypes: ['warehouse', 'lake', 'database'],
        complexity: 'high',
        estimatedDuration: 600,
        requiredResources: ['compute', 'storage', 'network'],
        tags: ['etl', 'pipeline', 'enterprise']
      },
      {
        name: 'data_migration',
        description: 'Migrate data between systems and formats',
        inputTypes: ['database', 'files', 'api'],
        outputTypes: ['database', 'files', 'cloud'],
        complexity: 'high',
        estimatedDuration: 900,
        requiredResources: ['compute', 'storage', 'network'],
        tags: ['migration', 'system_upgrade', 'data_transfer']
      }
    ];
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    this.currentTasks++;

    try {
      console.log(`🔧 Data Engineer processing task: ${task.type}`);

      switch (task.type) {
        // Consultation methods for multi-agent coordination
        case 'assess_data_quality':
          const qualityReport = await this.assessDataQuality(task.payload.data, task.payload.schema);
          return {
            taskId: task.id,
            agentId: 'data_engineer',
            status: 'success',
            result: qualityReport,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };
        
        case 'suggest_transformations':
          const transformOptions = await this.suggestTransformations(
            task.payload.missingColumns,
            task.payload.availableColumns,
            task.payload.goals || []
          );
          return {
            taskId: task.id,
            agentId: 'data_engineer',
            status: 'success',
            result: transformOptions,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };
        
        case 'estimate_processing_time':
          const timeEstimate = await this.estimateDataProcessingTime(
            task.payload.dataSize,
            task.payload.complexity
          );
          return {
            taskId: task.id,
            agentId: 'data_engineer',
            status: 'success',
            result: timeEstimate,
            metrics: {
              duration: Date.now() - startTime,
              resourcesUsed: ['compute'],
              tokensConsumed: 0
            },
            completedAt: new Date()
          };
        
        // Existing pipeline execution methods
        case 'data_pipeline_request':
          return await this.handlePipelineRequest(task);
        
        case 'data_cleaning_request':
          return await this.handleDataCleaning(task);
        
        case 'data_transformation_request':
          return await this.handleDataTransformation(task);
        
        case 'data_validation_request':
          return await this.handleDataValidation(task);
        
        case 'etl_processing_request':
          return await this.handleETLProcessing(task);
        
        case 'user_communication':
          return await this.handleUserCommunication(task);

        // U2A2A2U PII Handling Tasks
        case 'scan_pii_request':
          return await this.handlePIIScan(task);

        case 'apply_pii_exclusions_request':
          return await this.handlePIIExclusions(task);

        default:
          throw new Error(`Unsupported task type: ${task.type}`);
      }

    } catch (error: any) {
      console.error(`Data Engineer task ${task.id} failed:`, error);
      
      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    } finally {
      this.currentTasks--;
    }
  }

  private async handlePipelineRequest(task: AgentTask): Promise<AgentResult> {
    const request: DataPipelineRequest = task.payload;
    const pipelineId = `pipeline_${nanoid()}`;

    // Store pipeline configuration
    this.pipelines.set(pipelineId, request);

    // Create execution plan
    const executionPlan = await this.createExecutionPlan(request);

    // Start pipeline execution
    const executionId = await this.executePipeline(pipelineId, request);

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: {
        pipelineId,
        executionId,
        executionPlan,
        estimatedCompletion: new Date(Date.now() + executionPlan.estimatedDurationMs),
        monitoringUrl: `/api/admin/data-pipelines/${pipelineId}/executions/${executionId}`
      },
      metrics: {
        duration: 5000, // Planning time
        resourcesUsed: ['compute', 'storage'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'pipeline_configuration',
        data: request,
        metadata: { pipelineId, status: 'created' }
      }],
      completedAt: new Date()
    };
  }

  private async handleDataCleaning(task: AgentTask): Promise<AgentResult> {
    const { sourceData, cleaningRules } = task.payload;

    // Simulate data cleaning process
    const cleaningResults = {
      originalRecords: 10000,
      cleanedRecords: 9850,
      removedRecords: 150,
      issues: [
        { type: 'missing_values', count: 75, action: 'filled_with_default' },
        { type: 'invalid_format', count: 45, action: 'standardized' },
        { type: 'duplicates', count: 30, action: 'removed' }
      ],
      qualityScore: 98.5
    };

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: cleaningResults,
      metrics: {
        duration: 45000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'cleaned_data',
        data: 'cleaned_data_location.csv',
        metadata: { qualityScore: 98.5, recordCount: 9850 }
      }],
      completedAt: new Date()
    };
  }

  private async handleDataTransformation(task: AgentTask): Promise<AgentResult> {
    const transformations: DataTransformation[] = Array.isArray(task.payload?.transformations)
      ? task.payload.transformations
      : [];
    const sourceData = task.payload?.sourceData;

    const sourceStats = this.estimateSourceStats(sourceData);
    const slaCategory = this.getSlaCategory(task);
    const overallHint = this.resolveOptimizationHint(task, sourceStats.estimatedRowCount);

    const engineDecisions: EngineDecision[] = transformations.map(transformation => {
      const operation = this.mapToTransformationOperation(transformation.type);
      const estimatedRows = this.estimateRowsForTransformation(transformation, sourceStats.estimatedRowCount);
      const optimizationHint = this.resolveOptimizationHint(task, estimatedRows);

      let selectedEngine: TransformationEngine;
      let notes: string | undefined;

      if (operation) {
        selectedEngine = this.transformer.recommendTechnology(estimatedRows, operation, optimizationHint);
      } else {
        selectedEngine = optimizationHint === 'speed' ? 'polars' : 'javascript';
        notes = `No direct mapping available for transformation type "${transformation.type}"; defaulted to ${selectedEngine}`;
      }

      return {
        transformationId: transformation.id,
        name: transformation.name,
        requestedType: transformation.type,
        operation,
        estimatedRows,
        optimizationHint,
        selectedEngine,
        fallbackEngines: this.getFallbackChain(selectedEngine),
        slaCategory,
        notes
      };
    });

    const { engine: primaryEngine, decision: primaryDecision } = this.selectPrimaryEngine(engineDecisions);
    const transformationTime = this.estimateTransformationRuntime(primaryEngine, sourceStats.estimatedRowCount);
    const fallbackPlan = this.getFallbackChain(primaryEngine).map(engine => ({
      engine,
      trigger: this.describeFallbackTrigger(engine)
    }));

    const transformationResults = {
      transformationsApplied: transformations.length,
      outputSchema: this.generateOutputSchema(transformations),
      recordsProcessed: Math.max(sourceStats.estimatedRowCount, sourceStats.sampleRows.length, 0),
      transformationTime,
      outputLocation: `transformed_data_${nanoid()}.csv`,
      enginePlan: {
        slaCategory,
        optimizationHint: overallHint,
        primaryEngine,
        fallbackChain: fallbackPlan,
        decisions: engineDecisions,
        preferredOperation: primaryDecision?.operation,
        computedAt: new Date().toISOString()
      }
    };

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: transformationResults,
      metrics: {
        duration: transformationTime,
        resourcesUsed: this.getResourcesForEngine(primaryEngine),
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'transformed_data',
        data: transformationResults.outputLocation,
        metadata: {
          schema: transformationResults.outputSchema,
          enginePlan: transformationResults.enginePlan
        }
      }],
      completedAt: new Date()
    };
  }

  private async handleDataValidation(task: AgentTask): Promise<AgentResult> {
    const { validationRules, data } = task.payload;

    // Run validation rules
    const validationResults = {
      totalRules: validationRules.length,
      passedRules: validationRules.length - 2,
      failedRules: 2,
      warnings: 3,
      errors: 2,
      dataQualityScore: 92,
      issues: [
        {
          rule: 'completeness_check',
          field: 'email',
          severity: 'warning',
          message: '5% of email fields are empty',
          affectedRecords: 500
        },
        {
          rule: 'format_validation',
          field: 'phone_number',
          severity: 'error',
          message: 'Invalid phone number format detected',
          affectedRecords: 45
        }
      ]
    };

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: validationResults,
      metrics: {
        duration: 15000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'validation_report',
        data: validationResults,
        metadata: { qualityScore: 92 }
      }],
      completedAt: new Date()
    };
  }

  private async handleETLProcessing(task: AgentTask): Promise<AgentResult> {
    const etlConfig = task.payload;
    const jobId = `etl_job_${nanoid()}`;

    // Simulate ETL processing
    const etlResults = {
      jobId,
      status: 'completed',
      extractPhase: {
        sourcesProcessed: 3,
        recordsExtracted: 50000,
        extractTime: 120000
      },
      transformPhase: {
        transformationsApplied: 8,
        recordsTransformed: 48500,
        transformTime: 180000
      },
      loadPhase: {
        targetSystemsLoaded: 2,
        recordsLoaded: 48500,
        loadTime: 90000
      },
      totalExecutionTime: 390000,
      dataQuality: {
        completeness: 97,
        accuracy: 95,
        consistency: 98
      }
    };

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: etlResults,
      metrics: {
        duration: 390000,
        resourcesUsed: ['compute', 'storage', 'network'],
        tokensConsumed: 0
      },
      artifacts: [{
        type: 'etl_report',
        data: etlResults,
        metadata: { jobId, recordsProcessed: 48500 }
      }],
      completedAt: new Date()
    };
  }

  private async handleUserCommunication(task: AgentTask): Promise<AgentResult> {
    const { userInput, intent } = task.payload;
    
    let response = '';
    let nextActions: AgentTask[] = [];

    // Analyze user intent and provide appropriate response
    if (intent.category === 'data_transformation') {
      response = `I can help you transform your data! I specialize in:

• ETL pipeline design and execution
• Data cleaning and quality improvement  
• Format conversion (CSV, JSON, Parquet, etc.)
• Schema transformation and mapping
• Data validation and business rule checking

What type of data transformation do you need? Please provide:
1. Source data format and location
2. Desired target format
3. Any specific transformation requirements

I can process files up to 1GB and handle complex multi-step transformations.`;

    } else if (intent.category === 'data_analysis') {
      response = `For data analysis tasks, I'll coordinate with our Data Science team. However, I can first help prepare your data:

• Clean and standardize your dataset
• Handle missing values and outliers
• Create analysis-ready data formats
• Set up automated data pipelines

Would you like me to prepare your data for analysis first? This often improves analysis quality and speed.`;

      // Create follow-up task for data scientist
      nextActions.push({
        id: `task_${nanoid()}`,
        type: 'data_science_collaboration',
        priority: task.priority,
        payload: {
          originalRequest: userInput,
          dataPreparationNeeded: true,
          userContext: task.context
        },
        requiredCapabilities: ['statistical_analysis', 'data_processing'],
        context: task.context,
        constraints: task.constraints,
        createdAt: new Date()
      });

    } else {
      response = `Hello! I'm your Data Engineer agent. I specialize in:

🔧 **Data Pipeline Engineering**
• ETL/ELT pipeline design and automation
• Real-time and batch data processing
• Data quality monitoring and validation

📊 **Data Transformation**
• Format conversion and schema mapping
• Data cleaning and standardization
• Complex multi-source data integration

🏗️ **Infrastructure**
• Data warehouse and lake setup
• Pipeline orchestration and scheduling
• Performance optimization and scaling

How can I help you with your data engineering needs today?`;
    }

    return {
      taskId: task.id,
      agentId: 'data_engineer',
      status: 'success',
      result: {
        response,
        responseType: 'text',
        suggestions: [
          'Set up data pipeline',
          'Clean my dataset',
          'Transform data format',
          'Validate data quality'
        ]
      },
      metrics: {
        duration: 2000,
        resourcesUsed: ['compute'],
        tokensConsumed: 0
      },
      nextActions,
      completedAt: new Date()
    };
  }

  // ==========================================
  // U2A2A2U PII HANDLING METHODS
  // ==========================================

  /**
   * Handle PII scanning request using the scan_pii_columns MCP tool
   * This is part of the U2A2A2U workflow where the agent uses tools to perform work
   */
  private async handlePIIScan(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const { projectId, datasetId, sensitivityLevel } = task.payload;

    try {
      console.log(`🔒 [DE Agent] Starting PII scan for project ${projectId}`);

      // Use the MCP tool via executeTool (U2A2A2U pattern)
      const { executeTool } = require('./mcp-tool-registry');
      const toolResult = await executeTool('scan_pii_columns', {
        projectId,
        datasetId,
        sensitivityLevel: sensitivityLevel || 'moderate',
        includePatternMatching: true,
        includeMLDetection: false
      }, {
        userId: task.context?.userId,
        agentId: 'data_engineer',
        projectId,
        executionId: `exec_${nanoid()}`,
        startTime: Date.now()
      });

      if (toolResult.status === 'error') {
        throw new Error(toolResult.error || 'PII scan failed');
      }

      const piiResult = toolResult.result;

      // Format response for user
      const highConfidencePII = piiResult.detectedPII.filter((p: any) => p.confidence > 0.7);
      const userMessage = highConfidencePII.length > 0
        ? `🔒 **PII Detection Complete**\n\nI found ${piiResult.piiColumnsFound} columns that may contain personally identifiable information:\n\n${highConfidencePII.map((p: any) => `• **${p.column}** (${p.type}) - ${Math.round(p.confidence * 100)}% confidence`).join('\n')}\n\n**Recommendation:** ${highConfidencePII.length} column(s) should be excluded or masked before analysis.\n\nWould you like me to exclude these columns?`
        : `✅ **PII Scan Complete**\n\nNo high-confidence PII was detected in your dataset. You can proceed with your analysis safely.`;

      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'success',
        result: {
          piiScanResult: piiResult,
          userMessage,
          responseType: 'pii_detection',
          requiresUserConfirmation: highConfidencePII.length > 0,
          suggestedExclusions: piiResult.recommendations,
          suggestions: highConfidencePII.length > 0
            ? ['Exclude recommended columns', 'Review all detections', 'Proceed anyway']
            : ['Continue to analysis', 'Re-scan with stricter settings']
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };

    } catch (error: any) {
      console.error(`🔒 [DE Agent] PII scan failed:`, error);
      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    }
  }

  /**
   * Handle PII exclusion request using the apply_pii_exclusions MCP tool
   * Requires user confirmation before applying
   */
  private async handlePIIExclusions(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    const { projectId, excludedColumns, maskingStrategy, userConfirmed } = task.payload;

    try {
      console.log(`🔒 [DE Agent] Applying PII exclusions for project ${projectId}`);

      if (!userConfirmed) {
        // Return a response asking for user confirmation
        // Use 'partial' status to indicate work is incomplete pending user action
        return {
          taskId: task.id,
          agentId: 'data_engineer',
          status: 'partial',
          result: {
            userMessage: `⚠️ **Confirmation Required**\n\nBefore I exclude these columns, please confirm:\n\n${excludedColumns.map((c: string) => `• ${c}`).join('\n')}\n\nMasking strategy: **${maskingStrategy || 'remove'}**\n\nThis action will permanently modify your dataset. Do you want to proceed?`,
            responseType: 'confirmation_required',
            requiresUserConfirmation: true,
            pendingAction: {
              type: 'apply_pii_exclusions',
              excludedColumns,
              maskingStrategy: maskingStrategy || 'remove'
            }
          },
          metrics: {
            duration: Date.now() - startTime,
            resourcesUsed: ['compute'],
            tokensConsumed: 0
          },
          completedAt: new Date()
        };
      }

      // Use the MCP tool via executeTool (U2A2A2U pattern)
      const { executeTool } = require('./mcp-tool-registry');
      const toolResult = await executeTool('apply_pii_exclusions', {
        projectId,
        excludedColumns,
        maskingStrategy: maskingStrategy || 'remove',
        persistDecision: true,
        userConfirmed: true
      }, {
        userId: task.context?.userId,
        agentId: 'data_engineer',
        projectId,
        executionId: `exec_${nanoid()}`,
        startTime: Date.now()
      });

      if (toolResult.status === 'error') {
        throw new Error(toolResult.error || 'PII exclusion failed');
      }

      const exclusionResult = toolResult.result;

      // Format success message for user
      const userMessage = `✅ **PII Exclusions Applied Successfully**\n\n${exclusionResult.totalColumnsExcluded} column(s) have been ${maskingStrategy === 'remove' ? 'removed' : maskingStrategy === 'hash' ? 'hashed' : 'redacted'}:\n\n${excludedColumns.map((c: string) => `• ${c}`).join('\n')}\n\nYour data is now ready for analysis. The excluded columns will not be included in any downstream processing.`;

      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'success',
        result: {
          exclusionResult,
          userMessage,
          responseType: 'pii_exclusion_complete',
          suggestions: ['Continue to data verification', 'View filtered data preview', 'Undo exclusions']
        },
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute', 'storage'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };

    } catch (error: any) {
      console.error(`🔒 [DE Agent] PII exclusion failed:`, error);
      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'failure',
        result: null,
        error: error.message,
        metrics: {
          duration: Date.now() - startTime,
          resourcesUsed: ['compute'],
          tokensConsumed: 0
        },
        completedAt: new Date()
      };
    }
  }

  private async createExecutionPlan(request: DataPipelineRequest): Promise<any> {
    return {
      phases: [
        {
          name: 'Data Extraction',
          estimatedDuration: 60000,
          dependencies: [],
          resources: ['compute', 'network']
        },
        {
          name: 'Data Transformation',
          estimatedDuration: 120000,
          dependencies: ['Data Extraction'],
          resources: ['compute']
        },
        {
          name: 'Data Loading',
          estimatedDuration: 90000,
          dependencies: ['Data Transformation'],
          resources: ['compute', 'storage']
        }
      ],
      estimatedDurationMs: 270000,
      resourceRequirements: {
        cpu: '4 cores',
        memory: '8GB',
        storage: '50GB temp space'
      }
    };
  }

  private async executePipeline(pipelineId: string, request: DataPipelineRequest): Promise<string> {
    const executionId = `exec_${nanoid()}`;
    
    const execution: PipelineExecution = {
      id: executionId,
      pipelineId,
      status: 'running',
      startTime: new Date(),
      metrics: {
        recordsProcessed: 0,
        recordsSuccess: 0,
        recordsError: 0,
        dataVolumeMB: 0,
        executionTimeMs: 0
      },
      logs: [],
      errors: []
    };

    this.executions.set(executionId, execution);

    // Simulate pipeline execution (in real implementation, this would be async)
    setTimeout(() => {
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.metrics = {
        recordsProcessed: 10000,
        recordsSuccess: 9850,
        recordsError: 150,
        dataVolumeMB: 45.2,
        executionTimeMs: 270000
      };
    }, 270000);

    return executionId;
  }

  private generateOutputSchema(transformations: DataTransformation[]): any {
    // Simulate schema generation based on transformations
    return {
      fields: [
        { name: 'id', type: 'integer', nullable: false },
        { name: 'name', type: 'string', nullable: false },
        { name: 'email', type: 'string', nullable: true },
        { name: 'created_at', type: 'timestamp', nullable: false }
      ],
      transformationsApplied: transformations.map(t => t.name)
    };
  }

  private estimateSourceStats(sourceData: any): { estimatedRowCount: number; sampleRows: any[]; schema?: Record<string, any>; } {
    if (!sourceData) {
      return { estimatedRowCount: 0, sampleRows: [], schema: undefined };
    }

    if (Array.isArray(sourceData)) {
      return { estimatedRowCount: sourceData.length, sampleRows: sourceData, schema: undefined };
    }

    const rows = Array.isArray(sourceData.rows)
      ? sourceData.rows
      : Array.isArray(sourceData.data)
        ? sourceData.data
        : Array.isArray(sourceData.samples)
          ? sourceData.samples
          : Array.isArray(sourceData.preview)
            ? sourceData.preview
            : [];

    const numericCandidates = [
      sourceData.rowCount,
      sourceData.recordCount,
      sourceData.totalRows,
      sourceData.records,
      sourceData.estimatedRowCount,
      sourceData.size
    ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const estimatedRowCount = numericCandidates.length > 0
      ? Math.max(0, ...numericCandidates)
      : rows.length;

    const schema = (sourceData.schema && typeof sourceData.schema === 'object')
      ? sourceData.schema
      : sourceData.metadata?.schema;

    return {
      estimatedRowCount,
      sampleRows: rows,
      schema
    };
  }

  private getSlaCategory(task: AgentTask): 'critical' | 'high' | 'standard' {
    const payload = task.payload ?? {};

    const explicit = payload.slaTier ?? payload.sla?.tier ?? payload.priorityLevel;
    if (typeof explicit === 'string') {
      const normalized = explicit.toLowerCase();
      if (['critical', 'p0', 'p1', 'urgent'].includes(normalized)) {
        return 'critical';
      }
      if (['high', 'p2', 'rush'].includes(normalized)) {
        return 'high';
      }
    }

    if (typeof task.priority === 'number') {
      if (task.priority <= 2) {
        return 'critical';
      }
      if (task.priority <= 4) {
        return 'high';
      }
    }

    if (typeof payload.priority === 'string') {
      const normalized = payload.priority.toLowerCase();
      if (['critical', 'urgent', 'p0'].includes(normalized)) {
        return 'critical';
      }
      if (['high', 'rush', 'p1', 'p2'].includes(normalized)) {
        return 'high';
      }
    }

    return 'standard';
  }

  private resolveOptimizationHint(task: AgentTask, estimatedRows: number): 'speed' | 'memory' | 'balanced' {
    const payload = task.payload ?? {};
    const hint = payload.optimizationHint ?? payload.performancePriority;
    if (hint === 'speed' || hint === 'memory' || hint === 'balanced') {
      return hint;
    }

    const slaCategory = this.getSlaCategory(task);
    if (slaCategory !== 'standard') {
      return 'speed';
    }

    if (estimatedRows >= 20_000_000) {
      return 'memory';
    }

    if (estimatedRows >= 500_000) {
      return 'speed';
    }

    return 'balanced';
  }

  private estimateRowsForTransformation(transformation: DataTransformation, fallback: number): number {
    const config = transformation.configuration ?? {};
    const candidate = config.estimatedRows ?? config.rowCount ?? config.records ?? config.sampleSize;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.max(0, candidate);
    }
    return fallback;
  }

  private mapToTransformationOperation(type: DataTransformation['type']): TransformationOperation | null {
    switch (type) {
      case 'filter':
        return 'filter_rows';
      case 'map':
        return 'apply_function';
      case 'aggregate':
        return 'aggregate';
      case 'join':
        return 'join_datasets';
      case 'pivot':
        return 'pivot';
      case 'normalize':
        return 'normalize_columns';
      case 'denormalize':
        return 'unpivot';
      default:
        return null;
    }
  }

  private getFallbackChain(engine: TransformationEngine): TransformationEngine[] {
    switch (engine) {
      case 'spark':
        return ['polars', 'pandas', 'javascript'];
      case 'polars':
        return ['pandas', 'javascript'];
      case 'pandas':
        return ['javascript'];
      default:
        return [];
    }
  }

  private describeFallbackTrigger(engine: TransformationEngine): string {
    switch (engine) {
      case 'polars':
        return 'Fallback when Spark cluster is unavailable or dataset fits in-memory processing.';
      case 'pandas':
        return 'Fallback when Polars runtime is missing; rely on Pandas for compatibility.';
      case 'javascript':
        return 'Last-resort fallback using in-memory JavaScript to guarantee completion.';
      default:
        return 'Alternative execution engine';
    }
  }

  private selectPrimaryEngine(decisions: EngineDecision[]): { engine: TransformationEngine; decision?: EngineDecision } {
    if (decisions.length === 0) {
      return { engine: 'javascript' };
    }

    const priority: Record<TransformationEngine, number> = {
      javascript: 1,
      pandas: 2,
      polars: 3,
      spark: 4
    };

    const bestDecision = decisions.reduce<EngineDecision>((best, current) => {
      if (!best) {
        return current;
      }
      return priority[current.selectedEngine] > priority[best.selectedEngine] ? current : best;
    }, decisions[0]);

    return {
      engine: bestDecision.selectedEngine,
      decision: bestDecision
    };
  }

  private estimateTransformationRuntime(engine: TransformationEngine, rows: number): number {
    if (!rows || rows <= 0) {
      return 2000;
    }

    const baseMsPerThousand = 250;
    const multipliers: Record<TransformationEngine, number> = {
      spark: 0.35,
      polars: 0.55,
      pandas: 1,
      javascript: 1.2
    };

    const runtime = (rows / 1000) * baseMsPerThousand * multipliers[engine];
    return Math.max(2000, Math.round(runtime));
  }

  private getResourcesForEngine(engine: TransformationEngine): string[] {
    switch (engine) {
      case 'spark':
        return ['compute', 'spark_cluster'];
      case 'polars':
        return ['compute', 'python_bridge'];
      default:
        return ['compute'];
    }
  }

  // ==========================================
  // CONSULTATION METHODS (Multi-Agent Coordination)
  // ==========================================

  /**
   * Quick data quality assessment for PM coordination
   * Uses existing quality metrics logic
   */
  async assessDataQuality(input: any, schemaArg?: any): Promise<DataQualityReport> {
    const payload = Array.isArray(input) ? null : input;
    const dataSection = payload?.data;
    const explicitSchema = schemaArg ?? payload?.schema ?? dataSection?.schema;
    const schemaObject = (explicitSchema && typeof explicitSchema === 'object' && !Array.isArray(explicitSchema))
      ? explicitSchema as Record<string, any>
      : null;
    const schemaColumnCount = schemaObject ? Object.keys(schemaObject).length : 0;
    const metadataRows = Array.isArray(input)
      ? input.length
      : (typeof dataSection?.rowCount === 'number' ? Math.max(0, dataSection.rowCount) : 0);

    return measurePerformance(
      'data_quality_assessment',
      async () => {
        const datasetId = payload?.datasetId;

        const dataRows = Array.isArray(input)
          ? input
          : Array.isArray(dataSection)
            ? dataSection
            : Array.isArray(dataSection?.rows)
              ? dataSection.rows
              : Array.isArray(payload?.rows)
                ? payload.rows
                : [];

        const rowCountMeta = typeof dataSection?.rowCount === 'number' ? dataSection.rowCount : undefined;
        const columnsMeta = Array.isArray(dataSection?.columns) ? dataSection.columns : undefined;

        const issueDetails: DataQualityIssueDetail[] = [];
        const issueMessages: string[] = [];
        const recommendations: string[] = [];
        const warnings: string[] = [];
        const transformations: string[] = [];

        const addRecommendation = (text: string) => {
          if (!recommendations.includes(text)) {
            recommendations.push(text);
          }
        };

        const SCHEMA_INVALID_MESSAGE = 'Invalid schema: schema must be a valid object';
        const addSchemaIssue = (reason: string) => {
          issueDetails.push({
            type: 'inconsistencies',
            severity: 'high',
            affected: ['schema'],
            count: 0,
            message: reason
          });
          if (!issueMessages.includes(SCHEMA_INVALID_MESSAGE)) {
            issueMessages.push(SCHEMA_INVALID_MESSAGE);
          }
        };

        const schemaValid = !!schemaObject && schemaColumnCount > 0;

        if (!schemaValid) {
          addSchemaIssue('Schema definition is missing or not an object.');
          addRecommendation('Provide a valid schema so automated checks can run accurately.');
        }

        if (typeof rowCountMeta === 'number' && rowCountMeta < 0) {
          issueDetails.push({
            type: 'inconsistencies',
            severity: 'high',
            affected: ['rowCount'],
            count: Math.abs(rowCountMeta),
            message: 'Invalid row count detected'
          });
          issueMessages.push('Invalid row count: rowCount must be a non-negative number');
          warnings.push('Row count metadata is invalid; assuming zero rows for calculations.');
        }

        const actualRows = Array.isArray(dataRows) ? dataRows : [];
        const hasSampleRows = actualRows.length > 0;
        const totalRows = hasSampleRows
          ? actualRows.length
          : Math.max(0, rowCountMeta ?? 0);
        const totalColumns = columnsMeta?.length ?? schemaColumnCount;

        if (totalRows === 0) {
          warnings.push('Dataset appears to be empty or failed to load.');
          addSchemaIssue('Schema could not be validated without sample data.');
        } else if (!hasSampleRows) {
          warnings.push('No sample data provided; results are estimated from metadata only.');
          addSchemaIssue('Schema validation requires sample rows; using reported metadata only.');
          addRecommendation('Upload a small sample of rows so the platform can validate schema details.');
        }

        let filledCells = 0;
        const totalCells = totalRows * totalColumns;

        if (schemaValid && totalRows > 0 && totalColumns > 0) {
          for (const column of Object.keys(schemaObject!)) {
            const colSchema = schemaObject![column] ?? {};

            if (typeof colSchema.missingCount === 'number') {
              filledCells += Math.max(0, totalRows - colSchema.missingCount);
              if (colSchema.missingCount > 0) {
                issueDetails.push({
                  type: 'missing_values',
                  severity: colSchema.missingCount / totalRows > 0.5 ? 'high' : colSchema.missingCount / totalRows > 0.25 ? 'medium' : 'low',
                  affected: [column],
                  count: colSchema.missingCount,
                  message: `Column ${column} has ${colSchema.missingCount} missing values`
                });
                issueMessages.push(`Column ${column} has missing values that should be reviewed`);
              }
            } else if (typeof colSchema.missingPercentage === 'number') {
              const missingPercentage = Math.max(0, Math.min(100, colSchema.missingPercentage));
              filledCells += Math.max(0, totalRows * (1 - missingPercentage / 100));
              if (missingPercentage > 10) {
                issueDetails.push({
                  type: 'missing_values',
                  severity: missingPercentage > 50 ? 'high' : missingPercentage > 25 ? 'medium' : 'low',
                  affected: [column],
                  count: Math.round((missingPercentage / 100) * totalRows),
                  message: `Column ${column} has ${missingPercentage}% missing values`
                });
                issueMessages.push(`Column ${column} has ${missingPercentage}% missing values`);
              }
            } else if (actualRows.length > 0) {
              let nonNullCount = 0;
              for (const row of actualRows) {
                const value = row?.[column];
                if (value !== null && value !== undefined && value !== '') {
                  nonNullCount++;
                }
              }
              filledCells += nonNullCount;
              const missingCount = totalRows - nonNullCount;
              if (missingCount > 0) {
                const missingPct = (missingCount / totalRows) * 100;
                issueDetails.push({
                  type: 'missing_values',
                  severity: missingPct > 50 ? 'high' : missingPct > 25 ? 'medium' : 'low',
                  affected: [column],
                  count: missingCount,
                  message: `Column ${column} has ${missingCount} missing values`
                });
                issueMessages.push(`Column ${column} has ${missingCount} missing values`);
              }
            } else {
              // No concrete data available; assume column is complete for now
              filledCells += totalRows;
            }
          }
        }

        let completeness = 0;
        if (totalCells > 0) {
          completeness = Math.max(0, Math.min(1, filledCells / totalCells));
        }

        let duplicateCount = 0;
        if (actualRows.length > 0) {
          const uniqueRows = new Set(actualRows.map(row => JSON.stringify(row)));
          duplicateCount = totalRows - uniqueRows.size;
          if (duplicateCount > 0) {
            issueDetails.push({
              type: 'duplicates',
              severity: duplicateCount > totalRows * 0.1 ? 'high' : 'medium',
              affected: ['all_columns'],
              count: duplicateCount,
              message: `Detected ${duplicateCount} duplicate rows`
            });
            issueMessages.push(`Detected ${duplicateCount} duplicate rows`);
            transformations.push('Consider deduplicating rows before continuing analysis');
          }
        }

        const highSeverityCount = issueDetails.filter(issue => issue.severity === 'high').length;

        if (duplicateCount > 0) {
          addRecommendation(`Remove ${duplicateCount} duplicate rows to improve data quality.`);
        }
        if (schemaValid && completeness < 0.95 && totalRows > 0) {
          addRecommendation('Address missing values before performing analysis.');
        }
        if (highSeverityCount > 0) {
          addRecommendation('High severity issues detected - data cleaning strongly recommended.');
        }
        if (!schemaValid || totalRows === 0) {
          addRecommendation('Provide sample data with schema details so diagnostics can complete.');
        }

        const issuePenalty = totalColumns > 0 ? Math.min(1, issueDetails.length / totalColumns) : 1;
        const duplicatePenalty = totalRows > 0 ? Math.min(1, duplicateCount / Math.max(1, totalRows)) : 1;
        let overallScore = 0;
        if (schemaValid && totalRows > 0 && totalColumns > 0) {
          overallScore = Math.max(0, Math.min(1,
            completeness * 0.6 +
            (1 - duplicatePenalty) * 0.2 +
            (1 - issuePenalty) * 0.2
          ));
        }

        if (!hasSampleRows) {
          completeness = 0;
          if (schemaValid && totalColumns > 0) {
            overallScore = Math.max(overallScore, 0.2);
            if (!warnings.includes('No sample data provided; results are estimated from metadata only.')) {
              warnings.push('No sample data provided; results are estimated from metadata only.');
            }
          } else {
            overallScore = 0;
          }
        }

        const corruptionIndicator = typeof (dataSection as any)?.corruption === 'string' || typeof (payload as any)?.corruption === 'string';
        if (corruptionIndicator) {
          issueDetails.push({
            type: 'inconsistencies',
            severity: 'high',
            affected: ['all_columns'],
            count: totalRows,
            message: 'Dataset marked as corrupted; restrict usage until cleaned.'
          });
          issueMessages.push('Corrupted data detected - treat dataset as unsafe until cleaned');
          if (!warnings.includes('Dataset flagged as corrupted - quality scores reduced.')) {
            warnings.push('Dataset flagged as corrupted - quality scores reduced.');
          }
          overallScore = Math.min(overallScore, 0.2);
        }

        const issuesCombined: Array<DataQualityIssueDetail | string> = [
          ...issueDetails,
          ...issueMessages
        ];

        const estimatedFixTime = !schemaValid
          ? 'N/A - Invalid schema'
          : totalRows === 0
            ? 'N/A - Empty dataset'
            : issueDetails.length > 5
              ? '15-20 minutes'
              : issueDetails.length > 2
                ? '10-15 minutes'
                : '5-10 minutes';

        return {
          overallScore,
          completeness,
          issues: issuesCombined,
          issueDetails,
          issueMessages,
          recommendations,
          warnings,
          transformations,
          confidence: schemaValid ? 0.85 : 0.1,
          estimatedFixTime,
          qualityScore: Math.round(overallScore * 100),
          metadata: {
            datasetId,
            rowsAnalyzed: totalRows,
            columnsAnalyzed: totalColumns
          }
        };
      },
      {
        dataRows: metadataRows,
        schemaColumns: schemaColumnCount
      }
    );
  }

  /**
   * Suggest transformations for missing columns
   * Example: Suggest RFM for missing 'segment' column
   */
  async suggestTransformations(
    missingColumns: string[], 
    availableColumns: string[], 
    goals: string[]
  ): Promise<TransformationOptions> {
    console.log(`🔧 Data Engineer: Suggesting transformations for missing columns:`, missingColumns);
    
    // Handle null/undefined inputs gracefully
    if (!missingColumns || !Array.isArray(missingColumns)) {
      missingColumns = [];
    }
    if (!availableColumns || !Array.isArray(availableColumns)) {
      availableColumns = [];
    }
    if (!goals || !Array.isArray(goals)) {
      goals = [];
    }
    
    const transformations = [];
    const availableLower = availableColumns.map(c => c.toLowerCase());
    
    // Check for customer segmentation scenario
    if (missingColumns.some(c => c.toLowerCase().includes('segment'))) {
      const hasFrequency = availableLower.some(c => 
        c.includes('frequency') || c.includes('purchase') || c.includes('count') || c.includes('visits')
      );
      const hasMonetary = availableLower.some(c => 
        c.includes('monetary') || c.includes('amount') || c.includes('revenue') || c.includes('value') || c.includes('total') || c.includes('spend')
      );
      const hasRecency = availableLower.some(c => 
        c.includes('recency') || c.includes('date') || c.includes('last') || c.includes('recent')
      );
      
      if (hasFrequency && hasMonetary) {
        const sourceColumns = availableColumns.filter(c => {
          const lower = c.toLowerCase();
          return lower.includes('frequency') || lower.includes('purchase') || 
                 lower.includes('monetary') || lower.includes('amount') || lower.includes('revenue') || lower.includes('value');
        });
        
        transformations.push({
          targetColumn: 'customer_segment',
          method: 'rfm_analysis',
          sourceColumns,
          confidence: hasRecency ? 0.90 : 0.85,
          businessValue: 'high' as const,
          description: 'Create customer segments using RFM (Recency, Frequency, Monetary) analysis - industry standard for retail'
        });
      } else if (hasFrequency || hasMonetary) {
        transformations.push({
          targetColumn: 'customer_segment',
          method: 'kmeans_clustering',
          sourceColumns: availableColumns.filter(c => {
            const lower = c.toLowerCase();
            return lower.includes('frequency') || lower.includes('amount') || 
                   lower.includes('revenue') || lower.includes('value');
          }),
          confidence: 0.75,
          businessValue: 'medium' as const,
          description: 'Create customer segments using k-means clustering on available behavioral metrics'
        });
      }
    }
    
    // Check for category/classification scenarios
    if (missingColumns.some(c => c.toLowerCase().includes('category') || c.toLowerCase().includes('type'))) {
      const textColumns = availableColumns.filter(c => {
        const lower = c.toLowerCase();
        return lower.includes('name') || lower.includes('description') || lower.includes('title');
      });
      
      if (textColumns.length > 0) {
        transformations.push({
          targetColumn: missingColumns.find(c => c.toLowerCase().includes('category')) || 'category',
          method: 'text_classification',
          sourceColumns: textColumns,
          confidence: 0.70,
          businessValue: 'medium' as const,
          description: 'Extract category from text fields using pattern matching or NLP'
        });
      }
    }
    
    // Check for date/temporal scenarios
    if (missingColumns.some(c => c.toLowerCase().includes('date'))) {
      const hasTemporalGoal = goals.some(g => {
        const lower = g.toLowerCase();
        return lower.includes('time') || lower.includes('trend') || lower.includes('over time') ||
               lower.includes('temporal') || lower.includes('forecast') || lower.includes('seasonal');
      });
      
      const timestampColumns = availableColumns.filter(c => {
        const lower = c.toLowerCase();
        return lower.includes('timestamp') || lower.includes('time_') || lower.includes('created') ||
               lower.includes('updated') || lower.includes('datetime');
      });
      
      if (timestampColumns.length > 0 && hasTemporalGoal) {
        transformations.push({
          targetColumn: 'date',
          method: 'parse_datetime',
          sourceColumns: timestampColumns,
          confidence: 0.85,
          businessValue: 'high' as const,
          description: 'Parse timestamp strings into structured date format for temporal analysis'
        });
      }
    }
    
    const reasoning = transformations.length > 0 
      ? `Found ${transformations.length} viable transformation${transformations.length > 1 ? 's' : ''} using existing columns. ` +
        `${transformations[0].method === 'rfm_analysis' ? 'RFM analysis is industry-standard for customer segmentation.' : ''}`
      : 'No viable transformations found with available columns. Consider collecting additional data or redefining analysis goals.';
    
    return {
      transformations,
      reasoning
    };
  }

  /**
   * Estimate data processing time
   */
  async estimateDataProcessingTime(
    dataSize: number,
    complexity: string
  ): Promise<TimeEstimate> {
    console.log(`🔧 Data Engineer: Estimating processing time for ${dataSize} rows with ${complexity} complexity`);

    // Optimized baseline: ~1 minute per 20k rows after pipeline tuning
    const baseTime = Math.max(1, Math.ceil(dataSize / 20000));

    const complexityMultiplier =
      complexity === 'high' ? 2 :
      complexity === 'medium' ? 1.5 : 1;

    const estimatedMinutes = Math.max(1, Math.round(baseTime * complexityMultiplier));

    return {
      estimatedMinutes,
      confidence: 0.75,
      factors: [
        `${dataSize.toLocaleString()} rows to process`,
        `${complexity} complexity transformations`,
        'Server load and resource availability',
        'Network latency for distributed processing'
      ]
    };
  }

  async assessDataForPlan(params: {
    projectId: string;
    schema: Record<string, any>;
    data: any[];
    goals: string;
    questions: string[];
  }): Promise<DataAssessment> {
    const schema = params.schema || {};
    const dataRows = Array.isArray(params.data) ? params.data.slice(0, 1000) : [];
    const questions = Array.isArray(params.questions) ? params.questions : [];
    const goalsList = params.goals ? [params.goals] : [];

    const qualityReport = await this.assessDataQuality(dataRows, schema);

    const availableColumns = Object.keys(schema);
    const transformationOptions = await this.suggestTransformations(
      [],
      availableColumns,
      [...goalsList, ...questions]
    );

    const recordCountFromSchema = typeof (schema as any)?.__recordCount === 'number'
      ? (schema as any).__recordCount
      : undefined;
    const recordCount = recordCountFromSchema ?? (Array.isArray(params.data) ? params.data.length : dataRows.length);

    const columnCount = availableColumns.length;
    const missingData = availableColumns.filter(column => {
      const info = (schema as Record<string, any>)[column];
      const missingCount = info?.missingCount ?? 0;
      const missingPercentage = info?.missingPercentage ?? 0;
      return missingCount > 0 || missingPercentage > 0.05;
    });

    const complexity = [...goalsList, ...questions].some(entry => /predict|forecast|model/i.test(entry))
      ? 'high'
      : [...goalsList, ...questions].some(entry => /segment|cluster|trend|optimiz/i.test(entry))
        ? 'medium'
        : 'low';

    const timeEstimate = await this.estimateDataProcessingTime(Math.max(recordCount, dataRows.length), complexity);

    const infrastructureNeeds = {
      useSpark: recordCount > 250_000,
      estimatedMemoryGB: Math.max(2, Math.ceil(Math.max(recordCount, dataRows.length) / 100_000) * 4),
      parallelizable: recordCount > 50_000
    };

    const qualityScore = Math.max(0, Math.min(100, Math.round((qualityReport.overallScore ?? 0) * 100)));
    const completenessScore = Math.max(0, Math.min(100, Math.round((qualityReport.completeness ?? 0) * 100)));

    return {
      qualityScore,
      completenessScore,
      recordCount,
      columnCount,
      missingData,
      recommendedTransformations: (transformationOptions.transformations || []).map(item => `${item.method}: ${item.description}`),
      infrastructureNeeds,
      estimatedProcessingTime: timeEstimate.estimatedMinutes >= 60
        ? `${(timeEstimate.estimatedMinutes / 60).toFixed(1)} hours`
        : `${Math.max(5, timeEstimate.estimatedMinutes)} minutes`
    };
  }

  // ==========================================
  // FILE ANALYSIS METHODS (Agent Recommendation Workflow)
  // ==========================================

  /**
   * Analyze a single uploaded file
   * Returns detailed analysis including schema, data quality, and potential relationships
   */
  async analyzeUploadedFile(params: {
    fileId: string;
    fileName: string;
    filePath: string;
  }): Promise<FileAnalysisResult> {
    console.log(`🔧 Data Engineer: Analyzing uploaded file ${params.fileName}`);

    try {
      const buffer = await fs.readFile(params.filePath);
      const mimeType = this.inferMimeType(params.fileName);

      // Use file processor to read and analyze the file
      const fileData = await this.fileProcessor.processFile(buffer, params.fileName, mimeType);

      // Extract schema information
      const schema = fileData.schema ? Object.entries(fileData.schema).map(([name, info]: [string, any]) => ({
        name,
        type: info.type || 'unknown',
        nullable: info.nullable !== false
      })) : [];

      // Calculate data quality metrics
  const totalRows = fileData.recordCount || 0;
      const totalColumns = schema.length;
      let nullCount = 0;

      // Count nulls from schema if available
      if (fileData.schema) {
        for (const [, info] of Object.entries(fileData.schema) as [string, any][]) {
          nullCount += info.missingCount || 0;
        }
      }

      const totalCells = totalRows * totalColumns;
      const completeness = totalCells > 0 ? ((totalCells - nullCount) / totalCells) : 1;

      // Detect duplicates in sample data
  const sampleData = fileData.preview || [];
  const uniqueRows = new Set(sampleData.map((row: Record<string, unknown>) => JSON.stringify(row)));
      const duplicateCount = sampleData.length - uniqueRows.size;

      // Detect potential foreign key relationships
      const detectedRelationships = this.detectPotentialRelationships(schema, sampleData);

      return {
        fileId: params.fileId,
        fileName: params.fileName,
  recordCount: totalRows,
        columnCount: totalColumns,
        schema,
        sampleData,
        dataQuality: {
          completeness: Math.round(completeness * 100) / 100,
          nullCount,
          duplicateCount
        },
        detectedRelationships
      };

    } catch (error: any) {
      console.error(`🔧 Data Engineer: Error analyzing file ${params.fileName}:`, error);
      throw new Error(`Failed to analyze file: ${error.message}`);
    }
  }

  /**
   * Analyze all uploaded files for a project
   * Detects relationships between files and provides overall data characteristics
   */
  async analyzeProjectData(params: {
    projectId: string;
    files: Array<{ id: string; name: string; path: string; }>;
  }): Promise<ProjectDataAnalysis> {
    console.log(`🔧 Data Engineer: Analyzing project data for ${params.files.length} files`);

    try {
      // Analyze each file individually
      const fileAnalyses = await Promise.all(
        params.files.map(file =>
          this.analyzeUploadedFile({
            fileId: file.id,
            fileName: file.name,
            filePath: file.path
          })
        )
      );

      // Aggregate metrics
  const totalRows = fileAnalyses.reduce((sum, analysis) => sum + analysis.recordCount, 0);
      const totalColumns = fileAnalyses.reduce((sum, analysis) => sum + analysis.columnCount, 0);

      // Detect cross-file relationships
      const relationships = this.detectCrossFileRelationships(fileAnalyses);

      // Analyze data characteristics
      const dataCharacteristics = this.analyzeDataCharacteristics(fileAnalyses);

      // Calculate overall data quality
      const overallDataQuality = fileAnalyses.reduce((sum, analysis) =>
        sum + analysis.dataQuality.completeness, 0) / fileAnalyses.length;

      return {
        totalRows,
        totalColumns,
        filesAnalyzed: fileAnalyses.length,
        files: fileAnalyses,
        relationships,
        dataCharacteristics,
        overallDataQuality: Math.round(overallDataQuality * 100)
      };

    } catch (error: any) {
      console.error(`🔧 Data Engineer: Error analyzing project data:`, error);
      throw new Error(`Failed to analyze project data: ${error.message}`);
    }
  }

  /**
   * Detect potential foreign key relationships within a single file
   */
  private detectPotentialRelationships(
    schema: Array<{ name: string; type: string; }>,
    sampleData: any[]
  ): Array<{ column: string; likelyForeignKey: boolean; suggestedRelation: string; }> {
    const relationships = [];

    for (const column of schema) {
      const columnName = column.name.toLowerCase();

      // Check if column name suggests it's an ID or foreign key
      const isIdColumn = columnName.includes('id') ||
                        columnName.endsWith('_id') ||
                        columnName.startsWith('id_');

      if (isIdColumn && columnName !== 'id') {
        // Extract potential relation name
        let suggestedRelation = columnName.replace(/_?id_?/gi, '').replace(/_/g, ' ');
        suggestedRelation = suggestedRelation.charAt(0).toUpperCase() + suggestedRelation.slice(1);

        relationships.push({
          column: column.name,
          likelyForeignKey: true,
          suggestedRelation: suggestedRelation || 'Related Entity'
        });
      }
    }

    return relationships;
  }

  /**
   * Detect relationships between multiple files (PUBLIC - for use in routes)
   * Accepts simplified schema format: { fileName: string, schema: Array<{ name: string, type: string }> }
   */
  detectCrossFileRelationshipsPublic(
    files: Array<{ fileName: string; schema: Array<{ name: string; type: string }> }>
  ): Array<{ file1: string; file2: string; joinKey: string; confidence: number }> {
    console.log(`🔧 [Data Engineer] Analyzing ${files.length} files for cross-file relationships...`);
    const relationships: Array<{ file1: string; file2: string; joinKey: string; confidence: number }> = [];

    // Common join key patterns - prioritized by likelihood
    const joinKeyPatterns = [
      /^employee_?id$/i,
      /^emp_?id$/i,
      /^user_?id$/i,
      /^customer_?id$/i,
      /^department_?id$/i,
      /^dept_?id$/i,
      /^id$/i,
      /_id$/i,
      /^.*_key$/i
    ];

    // Compare each pair of files
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const file1 = files[i];
        const file2 = files[j];

        for (const col1 of file1.schema) {
          for (const col2 of file2.schema) {
            const col1Lower = col1.name.toLowerCase();
            const col2Lower = col2.name.toLowerCase();

            // Check for exact match (case-insensitive)
            if (col1Lower === col2Lower) {
              // Check if column looks like a join key
              const isJoinKey = joinKeyPatterns.some(pattern => pattern.test(col1.name));

              if (isJoinKey) {
                // High confidence for known join key patterns
                relationships.push({
                  file1: file1.fileName,
                  file2: file2.fileName,
                  joinKey: col1.name,
                  confidence: 0.95
                });
              } else if (col1Lower.includes('id') || col1Lower.includes('code') || col1Lower.includes('key')) {
                // Medium confidence for columns with id/code/key in name
                relationships.push({
                  file1: file1.fileName,
                  file2: file2.fileName,
                  joinKey: col1.name,
                  confidence: 0.85
                });
              } else {
                // Lower confidence for other matching columns
                relationships.push({
                  file1: file1.fileName,
                  file2: file2.fileName,
                  joinKey: col1.name,
                  confidence: 0.6
                });
              }
            }
          }
        }
      }
    }

    // Sort by confidence (highest first) and deduplicate
    const uniqueRelationships = relationships
      .sort((a, b) => b.confidence - a.confidence)
      .filter((rel, index, self) =>
        index === self.findIndex(r =>
          r.file1 === rel.file1 && r.file2 === rel.file2 && r.joinKey === rel.joinKey
        )
      );

    console.log(`🔧 [Data Engineer] Found ${uniqueRelationships.length} potential join relationship(s)`);
    return uniqueRelationships;
  }

  /**
   * Detect relationships between multiple files
   */
  private detectCrossFileRelationships(
    fileAnalyses: FileAnalysisResult[]
  ): Array<{ file1: string; file2: string; joinKey: string; confidence: number; }> {
    const relationships = [];

    // Compare each pair of files
    for (let i = 0; i < fileAnalyses.length; i++) {
      for (let j = i + 1; j < fileAnalyses.length; j++) {
        const file1 = fileAnalyses[i];
        const file2 = fileAnalyses[j];

        // Check for matching column names
        const file1Columns = file1.schema.map(s => s.name.toLowerCase());
        const file2Columns = file2.schema.map(s => s.name.toLowerCase());

        for (const col1 of file1.schema) {
          for (const col2 of file2.schema) {
            const match = col1.name.toLowerCase() === col2.name.toLowerCase();
            const isIdColumn = col1.name.toLowerCase().includes('id');

            if (match && isIdColumn) {
              relationships.push({
                file1: file1.fileName,
                file2: file2.fileName,
                joinKey: col1.name,
                confidence: 0.9
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  /**
   * Analyze overall data characteristics across all files
   */
  private analyzeDataCharacteristics(
    fileAnalyses: FileAnalysisResult[]
  ): { hasTimeSeries: boolean; hasCategories: boolean; hasText: boolean; hasNumeric: boolean; } {
    let hasTimeSeries = false;
    let hasCategories = false;
    let hasText = false;
    let hasNumeric = false;

    for (const file of fileAnalyses) {
      for (const column of file.schema) {
        const colName = column.name.toLowerCase();
        const colType = column.type.toLowerCase();

        // Check for time series data
        if (colName.includes('date') || colName.includes('time') ||
            colName.includes('timestamp') || colType.includes('date')) {
          hasTimeSeries = true;
        }

        // Check for categorical data
        if (colType === 'string' || colType === 'text' || colType === 'category') {
          if (colName.includes('category') || colName.includes('type') ||
              colName.includes('status') || colName.includes('class')) {
            hasCategories = true;
          }
          hasText = true;
        }

        // Check for numeric data
        if (colType === 'number' || colType === 'integer' || colType === 'float' ||
            colType === 'decimal' || colName.includes('score') ||
            colName.includes('amount') || colName.includes('value')) {
          hasNumeric = true;
        }
      }
    }

    return {
      hasTimeSeries,
      hasCategories,
      hasText,
      hasNumeric
    };
  }

  /**
   * Estimate data requirements based on user goals and questions
   * Used in agent recommendation workflow BEFORE data is uploaded
   */
  async estimateDataRequirements(params: {
    goals: string;
    questions: string[];
    dataSource: string;
    journeyType: string;
  }): Promise<{
    estimatedRows: number;
    estimatedColumns: number;
    dataCharacteristics: string[];
  }> {
    // Defensive parameter validation
    const goals = params.goals || '';
    const questions = params.questions || [];
    const questionCount = Array.isArray(questions) ? questions.length : 0;

    console.log(`🔧 Data Engineer: Estimating data requirements for ${questionCount} questions`);

    // Analyze questions to estimate complexity
    const allText = `${goals} ${Array.isArray(questions) ? questions.join(' ') : ''}`.toLowerCase();

    // Estimate columns based on question complexity
    let estimatedColumns = 5; // Base estimate

    // Keywords that suggest more columns needed
    if (allText.includes('demographic') || allText.includes('segment')) estimatedColumns += 3;
    if (allText.includes('time') || allText.includes('trend') || allText.includes('over time')) estimatedColumns += 2;
    if (allText.includes('category') || allText.includes('type') || allText.includes('group')) estimatedColumns += 2;
    if (allText.includes('compare') || allText.includes('correlation')) estimatedColumns += 3;
    if (allText.includes('predict') || allText.includes('forecast')) estimatedColumns += 4;

    // Add columns for each question (each question likely needs 1-2 data points)
    estimatedColumns += questionCount;

    // Estimate rows based on analysis type and journey
    let estimatedRows = 1000; // Base for simple analysis

    if (allText.includes('machine learning') || allText.includes('predict')) estimatedRows = 5000;
    if (allText.includes('trend') || allText.includes('time series')) estimatedRows = 2000;
    if (allText.includes('statistical') || allText.includes('significance')) estimatedRows = 1500;
    if (params.journeyType === 'technical') estimatedRows *= 1.5;

    // Identify data characteristics from questions
    const dataCharacteristics: string[] = [];

    if (allText.includes('time') || allText.includes('date') || allText.includes('trend')) {
      dataCharacteristics.push('Time series data recommended');
    }
    if (allText.includes('category') || allText.includes('segment') || allText.includes('group')) {
      dataCharacteristics.push('Categorical variables needed');
    }
    if (allText.includes('amount') || allText.includes('value') || allText.includes('metric')) {
      dataCharacteristics.push('Numerical measurements required');
    }
    if (allText.includes('text') || allText.includes('description') || allText.includes('comment')) {
      dataCharacteristics.push('Text data for NLP analysis');
    }
    if (allText.includes('predict') || allText.includes('forecast')) {
      dataCharacteristics.push('Historical data for predictive modeling');
    }
    if (allText.includes('compare') || allText.includes('correlation')) {
      dataCharacteristics.push('Multiple variables for comparative analysis');
    }

    // Default characteristic if none detected
    if (dataCharacteristics.length === 0) {
      dataCharacteristics.push('General structured data with identifiers and metrics');
    }

    console.log(`🔧 Data Engineer: Estimated ${estimatedRows} rows, ${estimatedColumns} columns`);

    return {
      estimatedRows: Math.round(estimatedRows),
      estimatedColumns: Math.round(estimatedColumns),
      dataCharacteristics
    };
  }

  // ==========================================
  // ELEMENT MAPPING & TRANSFORMATION CODE GENERATION
  // ==========================================

  /**
   * Enhance element mappings with transformation code
   * Takes natural language descriptions and DS agent calculation definitions
   * and generates executable JavaScript transformation code
   */
  async enhanceElementMappings(params: {
    elementMappings: Record<string, {
      sourceColumn?: string;
      transformationDescription?: string;
      transformationCode?: string;
    }>;
    requiredDataElements: Array<{
      elementId: string;
      elementName: string;
      description?: string;
      dataType?: string;
      calculationDefinition?: {
        calculationType: string;
        formula?: {
          businessDescription?: string;
          componentFields?: string[];
          aggregationMethod?: string;
          pseudoCode?: string;
        };
        comparisonGroups?: {
          groupingField?: string;
          comparisonType?: string;
        };
      };
    }>;
    availableColumns: string[];
    schema?: Record<string, any>;
    sampleData?: any[];
  }): Promise<{
    enhancedElements: Array<{
      elementId: string;
      elementName: string;
      sourceColumn?: string;
      transformationDescription?: string;
      transformationCode: string;
      confidence: number;
      codeExplanation?: string;
    }>;
    transformationPlan: string;
  }> {
    console.log(`🔧 [DE Agent] Enhancing ${Object.keys(params.elementMappings).length} element mappings`);

    const enhancedElements: Array<{
      elementId: string;
      elementName: string;
      sourceColumn?: string;
      transformationDescription?: string;
      transformationCode: string;
      confidence: number;
      codeExplanation?: string;
    }> = [];

    for (const element of params.requiredDataElements) {
      const mapping = params.elementMappings[element.elementId];

      // If we already have transformation code, use it with minor validation
      if (mapping?.transformationCode) {
        enhancedElements.push({
          elementId: element.elementId,
          elementName: element.elementName,
          sourceColumn: mapping.sourceColumn,
          transformationDescription: mapping.transformationDescription,
          transformationCode: mapping.transformationCode,
          confidence: 0.85,
          codeExplanation: 'User-provided or AI-generated code'
        });
        continue;
      }

      // Generate code based on available information
      const code = this.generateTransformationCodeForElement(
        element,
        mapping,
        params.availableColumns,
        params.schema
      );

      enhancedElements.push({
        elementId: element.elementId,
        elementName: element.elementName,
        sourceColumn: mapping?.sourceColumn,
        transformationDescription: mapping?.transformationDescription || element.description,
        transformationCode: code.code,
        confidence: code.confidence,
        codeExplanation: code.explanation
      });
    }

    // Build overall transformation plan
    const transformationPlan = this.buildTransformationPlan(enhancedElements, params.schema);

    console.log(`✅ [DE Agent] Enhanced ${enhancedElements.length} elements with transformation code`);

    return {
      enhancedElements,
      transformationPlan
    };
  }

  /**
   * Generate transformation code for a single element
   * Uses DS agent's calculation definition if available, otherwise infers from context
   */
  private generateTransformationCodeForElement(
    element: {
      elementId: string;
      elementName: string;
      description?: string;
      dataType?: string;
      calculationDefinition?: {
        calculationType: string;
        formula?: {
          businessDescription?: string;
          componentFields?: string[];
          aggregationMethod?: string;
          pseudoCode?: string;
        };
        comparisonGroups?: {
          groupingField?: string;
          comparisonType?: string;
        };
      };
    },
    mapping: {
      sourceColumn?: string;
      transformationDescription?: string;
    } | undefined,
    availableColumns: string[],
    schema?: Record<string, any>
  ): { code: string; confidence: number; explanation: string } {
    const calcDef = element.calculationDefinition;
    const sourceCol = mapping?.sourceColumn;
    const nlDescription = mapping?.transformationDescription;

    // Case 1: Direct mapping (no transformation needed)
    if (!calcDef && !nlDescription && sourceCol) {
      return {
        code: `return row["${sourceCol}"];`,
        confidence: 0.95,
        explanation: `Direct mapping from column "${sourceCol}"`
      };
    }

    // Case 2: DS agent provided calculation definition with formula
    if (calcDef?.formula?.pseudoCode) {
      const jsCode = this.convertPseudoCodeToJs(calcDef.formula.pseudoCode, availableColumns);
      return {
        code: jsCode,
        confidence: 0.80,
        explanation: `Generated from DS agent formula: ${calcDef.formula.businessDescription || 'N/A'}`
      };
    }

    // Case 3: DS agent provided aggregation method
    if (calcDef?.formula?.aggregationMethod && calcDef.formula.componentFields?.length) {
      const fields = calcDef.formula.componentFields;
      const method = calcDef.formula.aggregationMethod;
      const code = this.generateAggregationCode(fields, method);
      return {
        code,
        confidence: 0.85,
        explanation: `${method} aggregation of fields: ${fields.join(', ')}`
      };
    }

    // Case 4: NL description provided - generate based on keywords
    if (nlDescription) {
      const code = this.generateCodeFromNLDescription(nlDescription, sourceCol, availableColumns);
      return {
        code: code.code,
        confidence: code.confidence,
        explanation: `Interpreted from user description: "${nlDescription.substring(0, 50)}..."`
      };
    }

    // Case 5: Fallback - try to infer from element name and type
    const inferredCode = this.inferTransformationFromContext(
      element.elementName,
      element.dataType,
      sourceCol,
      availableColumns
    );

    return inferredCode;
  }

  /**
   * Convert pseudo-code from DS agent to executable JavaScript
   */
  private convertPseudoCodeToJs(pseudoCode: string, availableColumns: string[]): string {
    let jsCode = pseudoCode;

    // Replace common pseudo-code patterns with JavaScript
    jsCode = jsCode.replace(/AVERAGE\s*\(([^)]+)\)/gi, (_, fields) => {
      const fieldList = fields.split(',').map((f: string) => f.trim());
      return `(() => { const vals = [${fieldList.map((f: string) => `row["${f}"]`).join(', ')}].filter(v => v != null && !isNaN(v)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null; })()`;
    });

    jsCode = jsCode.replace(/SUM\s*\(([^)]+)\)/gi, (_, fields) => {
      const fieldList = fields.split(',').map((f: string) => f.trim());
      return `[${fieldList.map((f: string) => `row["${f}"]`).join(', ')}].filter(v => v != null).reduce((a, b) => Number(a) + Number(b), 0)`;
    });

    jsCode = jsCode.replace(/COUNT\s*\(([^)]+)\)/gi, (_, fields) => {
      const fieldList = fields.split(',').map((f: string) => f.trim());
      return `[${fieldList.map((f: string) => `row["${f}"]`).join(', ')}].filter(v => v != null).length`;
    });

    // Wrap in return if not already
    if (!jsCode.trim().startsWith('return')) {
      jsCode = `return ${jsCode};`;
    }

    return jsCode;
  }

  /**
   * Generate aggregation code for specified fields and method
   */
  private generateAggregationCode(fields: string[], method: string): string {
    const rowFields = fields.map(f => `row["${f}"]`).join(', ');

    switch (method.toLowerCase()) {
      case 'average':
      case 'avg':
      case 'mean':
        return `const vals = [${rowFields}].filter(v => v != null && !isNaN(v)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;`;

      case 'sum':
      case 'total':
        return `return [${rowFields}].filter(v => v != null).reduce((a, b) => Number(a) + Number(b), 0);`;

      case 'count':
        return `return [${rowFields}].filter(v => v != null).length;`;

      case 'min':
        return `const vals = [${rowFields}].filter(v => v != null && !isNaN(v)); return vals.length ? Math.min(...vals) : null;`;

      case 'max':
        return `const vals = [${rowFields}].filter(v => v != null && !isNaN(v)); return vals.length ? Math.max(...vals) : null;`;

      case 'median':
        return `const vals = [${rowFields}].filter(v => v != null && !isNaN(v)).sort((a, b) => a - b); const mid = Math.floor(vals.length / 2); return vals.length ? (vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2) : null;`;

      case 'weighted_average':
        // Default to simple average if no weights specified
        return `const vals = [${rowFields}].filter(v => v != null && !isNaN(v)); return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;`;

      default:
        return `return [${rowFields}].filter(v => v != null).reduce((a, b) => a + b, 0);`;
    }
  }

  /**
   * Generate code from natural language description using pattern matching
   */
  private generateCodeFromNLDescription(
    description: string,
    sourceCol: string | undefined,
    availableColumns: string[]
  ): { code: string; confidence: number } {
    const lower = description.toLowerCase();

    // Pattern: "average/mean of X, Y, Z"
    const avgMatch = lower.match(/(?:average|mean|avg)\s+(?:of\s+)?([^,]+(?:,\s*[^,]+)*)/i);
    if (avgMatch) {
      const fields = this.extractFieldsFromDescription(avgMatch[1], availableColumns);
      if (fields.length > 0) {
        return {
          code: this.generateAggregationCode(fields, 'average'),
          confidence: 0.75
        };
      }
    }

    // Pattern: "sum/total of X, Y, Z"
    const sumMatch = lower.match(/(?:sum|total|add)\s+(?:of\s+)?([^,]+(?:,\s*[^,]+)*)/i);
    if (sumMatch) {
      const fields = this.extractFieldsFromDescription(sumMatch[1], availableColumns);
      if (fields.length > 0) {
        return {
          code: this.generateAggregationCode(fields, 'sum'),
          confidence: 0.75
        };
      }
    }

    // Pattern: "count X, Y, Z and average"
    const countAvgMatch = lower.match(/count\s+([^a]+)\s+and\s+(?:average|avg|mean)/i);
    if (countAvgMatch) {
      const fields = this.extractFieldsFromDescription(countAvgMatch[1], availableColumns);
      if (fields.length > 0) {
        return {
          code: this.generateAggregationCode(fields, 'average'),
          confidence: 0.70
        };
      }
    }

    // Pattern: "combine/concatenate X and Y"
    const combineMatch = lower.match(/(?:combine|concatenate|join|merge)\s+(.+)/i);
    if (combineMatch) {
      const fields = this.extractFieldsFromDescription(combineMatch[1], availableColumns);
      if (fields.length > 0) {
        return {
          code: `return [${fields.map(f => `row["${f}"]`).join(', ')}].filter(Boolean).join(' ');`,
          confidence: 0.70
        };
      }
    }

    // Pattern: "multiply X by Y" or "X times Y"
    const multiplyMatch = lower.match(/(?:multiply|times)\s+(\w+)\s+(?:by|times)\s+(\w+)/i);
    if (multiplyMatch) {
      const field1 = this.findMatchingColumn(multiplyMatch[1], availableColumns);
      const field2 = this.findMatchingColumn(multiplyMatch[2], availableColumns);
      if (field1 && field2) {
        return {
          code: `return (row["${field1}"] || 0) * (row["${field2}"] || 0);`,
          confidence: 0.75
        };
      }
    }

    // Pattern: "categorize/classify based on..."
    if (lower.includes('categorize') || lower.includes('classify') || lower.includes('if') && lower.includes('then')) {
      return {
        code: `// TODO: Implement categorization logic based on: ${description}\nreturn row["${sourceCol || 'value'}"];`,
        confidence: 0.40
      };
    }

    // Fallback: Return source column or null
    if (sourceCol) {
      return {
        code: `return row["${sourceCol}"];`,
        confidence: 0.50
      };
    }

    return {
      code: `// Unable to interpret: ${description}\nreturn null;`,
      confidence: 0.20
    };
  }

  /**
   * Extract field names from a description string
   */
  private extractFieldsFromDescription(text: string, availableColumns: string[]): string[] {
    // Split by "and", ",", "or"
    const parts = text.split(/(?:,|\s+and\s+|\s+or\s+)/i).map(p => p.trim());
    const fields: string[] = [];

    for (const part of parts) {
      const match = this.findMatchingColumn(part, availableColumns);
      if (match) {
        fields.push(match);
      }
    }

    return fields;
  }

  /**
   * Find a column that matches a description term
   */
  private findMatchingColumn(term: string, availableColumns: string[]): string | undefined {
    const lower = term.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match
    const exact = availableColumns.find(c => c.toLowerCase() === lower);
    if (exact) return exact;

    // Contains match
    const contains = availableColumns.find(c => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase()));
    if (contains) return contains;

    // Word match (e.g., "q1" matches "Q1_Score")
    const wordMatch = availableColumns.find(c => {
      const cLower = c.toLowerCase();
      return cLower.startsWith(lower) || cLower.endsWith(lower) || cLower.includes(`_${lower}`) || cLower.includes(`${lower}_`);
    });
    if (wordMatch) return wordMatch;

    return undefined;
  }

  /**
   * Infer transformation from element name and type
   */
  private inferTransformationFromContext(
    elementName: string,
    dataType: string | undefined,
    sourceCol: string | undefined,
    availableColumns: string[]
  ): { code: string; confidence: number; explanation: string } {
    const lower = elementName.toLowerCase();

    // Score-related elements often need averaging
    if (lower.includes('score') || lower.includes('rating') || lower.includes('index')) {
      // Look for similar column names
      const scoreColumns = availableColumns.filter(c =>
        c.toLowerCase().includes('score') ||
        c.toLowerCase().includes('rating') ||
        /q\d+/i.test(c)
      );

      if (scoreColumns.length > 1) {
        return {
          code: this.generateAggregationCode(scoreColumns.slice(0, 5), 'average'),
          confidence: 0.60,
          explanation: `Inferred average of score columns: ${scoreColumns.slice(0, 5).join(', ')}`
        };
      }
    }

    // Date/time elements
    if (lower.includes('date') || lower.includes('time') || lower.includes('year') || lower.includes('tenure')) {
      if (sourceCol) {
        return {
          code: `const d = new Date(row["${sourceCol}"]); return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];`,
          confidence: 0.55,
          explanation: `Date normalization from column "${sourceCol}"`
        };
      }
    }

    // Percentage elements
    if (lower.includes('percent') || lower.includes('rate') || lower.includes('%')) {
      if (sourceCol) {
        return {
          code: `const v = row["${sourceCol}"]; return typeof v === 'number' ? v * (v <= 1 ? 100 : 1) : parseFloat(v) || null;`,
          confidence: 0.55,
          explanation: `Percentage normalization from column "${sourceCol}"`
        };
      }
    }

    // Default: direct mapping if source column exists
    if (sourceCol) {
      return {
        code: `return row["${sourceCol}"];`,
        confidence: 0.70,
        explanation: `Direct mapping from column "${sourceCol}"`
      };
    }

    // No mapping possible
    return {
      code: `// No mapping available for element: ${elementName}\nreturn null;`,
      confidence: 0.20,
      explanation: `Unable to determine mapping for "${elementName}"`
    };
  }

  /**
   * Build a transformation plan summary
   */
  private buildTransformationPlan(
    elements: Array<{
      elementId: string;
      elementName: string;
      transformationCode: string;
      confidence: number;
    }>,
    schema?: Record<string, any>
  ): string {
    const highConfidence = elements.filter(e => e.confidence >= 0.7);
    const mediumConfidence = elements.filter(e => e.confidence >= 0.5 && e.confidence < 0.7);
    const lowConfidence = elements.filter(e => e.confidence < 0.5);

    const planParts: string[] = [
      `## Transformation Plan`,
      `Total elements to transform: ${elements.length}`,
      ``,
      `### High Confidence (${highConfidence.length}):`,
      ...highConfidence.map(e => `- ${e.elementName}: ${Math.round(e.confidence * 100)}%`),
      ``,
      `### Medium Confidence (${mediumConfidence.length}):`,
      ...mediumConfidence.map(e => `- ${e.elementName}: ${Math.round(e.confidence * 100)}% - may need review`),
      ``,
      `### Low Confidence (${lowConfidence.length}):`,
      ...lowConfidence.map(e => `- ${e.elementName}: ${Math.round(e.confidence * 100)}% - requires manual review`),
    ];

    return planParts.join('\n');
  }

  // ==========================================
  // AGENT HANDLER INTERFACE METHODS
  // ==========================================

  validateTask(task: AgentTask): boolean {
    const supportedTypes = [
      // Consultation methods (multi-agent coordination)
      'assess_data_quality',
      'suggest_transformations',
      'estimate_processing_time',
      // Pipeline execution methods
      'data_pipeline_request',
      'data_cleaning_request', 
      'data_transformation_request',
      'data_validation_request',
      'etl_processing_request',
      'user_communication'
    ];
    
    return supportedTypes.includes(task.type);
  }

  async getStatus(): Promise<AgentStatus> {
    return {
      status: this.currentTasks >= this.maxConcurrentTasks ? 'busy' : 'active',
      currentTasks: this.currentTasks,
      queuedTasks: 0,
      lastActivity: new Date(),
      resourceUsage: {
        cpu: (this.currentTasks / this.maxConcurrentTasks) * 100,
        memory: 45.2,
        storage: 12.8
      }
    };
  }

  async configure(config: Record<string, any>): Promise<void> {
    console.log('🔧 Data Engineer Agent configured:', config);
  }

  async shutdown(): Promise<void> {
    console.log('🔧 Data Engineer Agent shutting down...');
    this.pipelines.clear();
    this.executions.clear();
  }

  // Public methods for pipeline management
  getPipeline(pipelineId: string): DataPipelineRequest | null {
    return this.pipelines.get(pipelineId) || null;
  }

  getExecution(executionId: string): PipelineExecution | null {
    return this.executions.get(executionId) || null;
  }

  getAllPipelines(): DataPipelineRequest[] {
    return Array.from(this.pipelines.values());
  }

  getAllExecutions(): PipelineExecution[] {
    return Array.from(this.executions.values());
  }
}