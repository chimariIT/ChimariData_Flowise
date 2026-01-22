/**
 * Data Pipeline Builder
 *
 * Tool for Data Engineer agents to design, build, and manage data pipelines.
 * Supports ETL/ELT workflows, scheduling, monitoring, and orchestration.
 *
 * Features:
 * - Pipeline definition and configuration
 * - Data source and destination management
 * - Transformation step orchestration
 * - Schedule management (cron, interval)
 * - Pipeline monitoring and logging
 * - Error handling and retry logic
 * - Data quality validation integration
 */

export interface DataSource {
  sourceId: string;
  type: 'database' | 'file' | 'api' | 'stream' | 'cloud_storage';
  connection: {
    host?: string;
    port?: number;
    database?: string;
    credentials?: string; // Reference to secure credential store
    url?: string;
    path?: string;
  };
  schema?: {
    tableName?: string;
    columns?: Array<{
      name: string;
      type: string;
      nullable: boolean;
    }>;
  };
  config?: Record<string, any>;
}

export interface DataDestination {
  destinationId: string;
  type: 'database' | 'file' | 'api' | 'stream' | 'cloud_storage' | 'data_warehouse';
  connection: {
    host?: string;
    port?: number;
    database?: string;
    credentials?: string;
    url?: string;
    path?: string;
  };
  schema?: {
    tableName?: string;
    createIfNotExists?: boolean;
  };
  config?: Record<string, any>;
}

export interface PipelineTransformation {
  transformationId: string;
  type: 'filter' | 'map' | 'aggregate' | 'join' | 'custom' | 'ml_inference';
  name: string;
  description?: string;
  config: {
    function?: string; // SQL, Python, or JS function
    parameters?: Record<string, any>;
    validations?: Array<{
      rule: string;
      errorMessage: string;
    }>;
  };
  order: number;
}

export interface PipelineSchedule {
  type: 'cron' | 'interval' | 'manual' | 'event_triggered';
  cronExpression?: string; // e.g., "0 0 * * *" (daily at midnight)
  intervalMs?: number; // e.g., 3600000 (1 hour)
  timezone?: string;
  enabled: boolean;
}

export interface DataPipeline {
  pipelineId: string;
  name: string;
  description?: string;
  source: DataSource;
  destination: DataDestination;
  transformations: PipelineTransformation[];
  schedule: PipelineSchedule;
  status: 'draft' | 'active' | 'paused' | 'error' | 'archived';
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastRunAt?: Date;
  nextRunAt?: Date;
  metadata?: {
    tags?: string[];
    version?: string;
    dependencies?: string[]; // Other pipeline IDs this depends on
  };
}

export interface PipelineExecution {
  executionId: string;
  pipelineId: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  recordsProcessed?: number;
  recordsFailed?: number;
  duration?: number;
  logs: Array<{
    timestamp: Date;
    level: 'info' | 'warning' | 'error';
    message: string;
    details?: any;
  }>;
  error?: {
    message: string;
    stack?: string;
    step?: string;
  };
}

export interface CreatePipelineRequest {
  name: string;
  description?: string;
  source: DataSource;
  destination: DataDestination;
  transformations: PipelineTransformation[];
  schedule: PipelineSchedule;
  createdBy: string;
  metadata?: DataPipeline['metadata'];
}

export interface UpdatePipelineRequest {
  pipelineId: string;
  name?: string;
  description?: string;
  source?: DataSource;
  destination?: DataDestination;
  transformations?: PipelineTransformation[];
  schedule?: PipelineSchedule;
  status?: DataPipeline['status'];
  metadata?: DataPipeline['metadata'];
}

export interface PipelineSearchQuery {
  status?: DataPipeline['status'] | DataPipeline['status'][];
  createdBy?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export class DataPipelineBuilder {
  private pipelines: Map<string, DataPipeline> = new Map();
  private executions: Map<string, PipelineExecution> = new Map();
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    console.log('[DataPipelineBuilder] Pipeline management system initialized');
  }

  /**
   * Create a new data pipeline
   */
  async createPipeline(request: CreatePipelineRequest): Promise<DataPipeline> {
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // Validate transformations are ordered
    const sortedTransformations = [...request.transformations].sort((a, b) => a.order - b.order);

    const pipeline: DataPipeline = {
      pipelineId,
      name: request.name,
      description: request.description,
      source: request.source,
      destination: request.destination,
      transformations: sortedTransformations,
      schedule: request.schedule,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: request.createdBy,
      metadata: request.metadata
    };

    // Store pipeline
    this.pipelines.set(pipelineId, pipeline);

    console.log(`[PipelineBuilder] Created pipeline ${pipelineId}: ${request.name}`);

    return pipeline;
  }

  /**
   * Update an existing pipeline
   */
  async updatePipeline(request: UpdatePipelineRequest): Promise<DataPipeline> {
    const pipeline = this.pipelines.get(request.pipelineId);

    if (!pipeline) {
      throw new Error(`Pipeline ${request.pipelineId} not found`);
    }

    // Update fields
    if (request.name) pipeline.name = request.name;
    if (request.description !== undefined) pipeline.description = request.description;
    if (request.source) pipeline.source = request.source;
    if (request.destination) pipeline.destination = request.destination;
    if (request.transformations) {
      pipeline.transformations = [...request.transformations].sort((a, b) => a.order - b.order);
    }
    if (request.schedule) pipeline.schedule = request.schedule;
    if (request.status) pipeline.status = request.status;
    if (request.metadata) pipeline.metadata = { ...pipeline.metadata, ...request.metadata };

    pipeline.updatedAt = new Date();

    console.log(`[PipelineBuilder] Updated pipeline ${request.pipelineId}`);

    return pipeline;
  }

  /**
   * Get pipeline by ID
   */
  async getPipeline(pipelineId: string): Promise<DataPipeline | null> {
    return this.pipelines.get(pipelineId) || null;
  }

  /**
   * Search pipelines
   */
  async searchPipelines(query: PipelineSearchQuery): Promise<{
    pipelines: DataPipeline[];
    total: number;
  }> {
    let results = Array.from(this.pipelines.values());

    // Filter by status
    if (query.status) {
      const statuses = Array.isArray(query.status) ? query.status : [query.status];
      results = results.filter(pipeline => statuses.includes(pipeline.status));
    }

    // Filter by creator
    if (query.createdBy) {
      results = results.filter(pipeline => pipeline.createdBy === query.createdBy);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(pipeline =>
        pipeline.metadata?.tags && query.tags!.some(tag => pipeline.metadata!.tags!.includes(tag))
      );
    }

    // Sort by creation date (newest first)
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = results.length;

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    results = results.slice(offset, offset + limit);

    return { pipelines: results, total };
  }

  /**
   * Execute a pipeline
   */
  async executePipeline(pipelineId: string, triggeredBy: 'manual' | 'schedule' | 'event'): Promise<PipelineExecution> {
    const pipeline = this.pipelines.get(pipelineId);

    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status !== 'active' && triggeredBy !== 'manual') {
      throw new Error(`Pipeline ${pipelineId} is not active (status: ${pipeline.status})`);
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    const execution: PipelineExecution = {
      executionId,
      pipelineId,
      startTime,
      status: 'running',
      recordsProcessed: 0,
      recordsFailed: 0,
      logs: [
        {
          timestamp: startTime,
          level: 'info',
          message: `Pipeline execution started (triggered by: ${triggeredBy})`
        }
      ]
    };

    this.executions.set(executionId, execution);

    // Simulate pipeline execution (in production, this would be real ETL logic)
    try {
      // 1. Connect to source
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Connected to source: ${pipeline.source.type}`
      });

      // 2. Extract data
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: 'Extracting data from source...'
      });

      // P0-4 FIX: Production guard for simulated data extraction
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        // In production, this should integrate with actual data source
        throw new Error('Pipeline execution requires actual data source integration in production. Configure source connection.');
      }

      // Development/staging only: Simulate data extraction
      console.warn('⚠️ [Pipeline] Using simulated data extraction (dev mode only)');
      const recordsExtracted = Math.floor(Math.random() * 1000) + 100;
      execution.recordsProcessed = recordsExtracted;

      // 3. Apply transformations
      for (const transformation of pipeline.transformations) {
        execution.logs.push({
          timestamp: new Date(),
          level: 'info',
          message: `Applying transformation: ${transformation.name} (${transformation.type})`
        });

        // Simulate transformation processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 4. Load to destination
      execution.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Loading data to destination: ${pipeline.destination.type}`
      });

      // 5. Complete
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - startTime.getTime();

      execution.logs.push({
        timestamp: execution.endTime,
        level: 'info',
        message: `Pipeline execution completed. Processed ${execution.recordsProcessed} records in ${execution.duration}ms`
      });

      // Update pipeline last run
      pipeline.lastRunAt = execution.endTime;

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - startTime.getTime();
      execution.error = {
        message: (error as Error).message,
        stack: (error as Error).stack
      };

      execution.logs.push({
        timestamp: execution.endTime,
        level: 'error',
        message: `Pipeline execution failed: ${(error as Error).message}`,
        details: error
      });
    }

    console.log(`[PipelineBuilder] Execution ${executionId} ${execution.status}`);

    return execution;
  }

  /**
   * Get pipeline execution history
   */
  async getExecutionHistory(pipelineId: string, limit: number = 10): Promise<PipelineExecution[]> {
    const executions = Array.from(this.executions.values())
      .filter(exec => exec.pipelineId === pipelineId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);

    return executions;
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<PipelineExecution | null> {
    return this.executions.get(executionId) || null;
  }

  /**
   * Activate a pipeline (enable scheduling)
   */
  async activatePipeline(pipelineId: string): Promise<DataPipeline> {
    const pipeline = await this.updatePipeline({ pipelineId, status: 'active' });

    // Set up scheduling if applicable
    if (pipeline.schedule.enabled && pipeline.schedule.type !== 'manual') {
      this.scheduleExecution(pipeline);
    }

    console.log(`[PipelineBuilder] Activated pipeline ${pipelineId}`);

    return pipeline;
  }

  /**
   * Pause a pipeline
   */
  async pausePipeline(pipelineId: string): Promise<DataPipeline> {
    const pipeline = await this.updatePipeline({ pipelineId, status: 'paused' });

    // Cancel scheduled execution
    const job = this.scheduledJobs.get(pipelineId);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(pipelineId);
    }

    console.log(`[PipelineBuilder] Paused pipeline ${pipelineId}`);

    return pipeline;
  }

  /**
   * Delete a pipeline
   */
  async deletePipeline(pipelineId: string): Promise<boolean> {
    const pipeline = this.pipelines.get(pipelineId);

    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    // Cancel any scheduled jobs
    const job = this.scheduledJobs.get(pipelineId);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(pipelineId);
    }

    // Delete pipeline
    this.pipelines.delete(pipelineId);

    console.log(`[PipelineBuilder] Deleted pipeline ${pipelineId}`);

    return true;
  }

  /**
   * Validate pipeline configuration
   */
  async validatePipeline(pipeline: DataPipeline): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check source configuration
    if (!pipeline.source.type) {
      errors.push('Source type is required');
    }

    // Check destination configuration
    if (!pipeline.destination.type) {
      errors.push('Destination type is required');
    }

    // Check transformations
    if (pipeline.transformations.length === 0) {
      warnings.push('No transformations defined');
    }

    // Check for transformation order gaps
    const orders = pipeline.transformations.map(t => t.order).sort((a, b) => a - b);
    for (let i = 1; i < orders.length; i++) {
      if (orders[i] - orders[i - 1] > 1) {
        warnings.push(`Transformation order gap detected between ${orders[i - 1]} and ${orders[i]}`);
      }
    }

    // Check schedule
    if (pipeline.schedule.enabled && pipeline.schedule.type === 'cron' && !pipeline.schedule.cronExpression) {
      errors.push('Cron expression is required for cron schedule type');
    }

    if (pipeline.schedule.enabled && pipeline.schedule.type === 'interval' && !pipeline.schedule.intervalMs) {
      errors.push('Interval is required for interval schedule type');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  // ==========================================
  // PRIVATE METHODS
  // ==========================================

  private scheduleExecution(pipeline: DataPipeline): void {
    // Cancel existing schedule
    const existingJob = this.scheduledJobs.get(pipeline.pipelineId);
    if (existingJob) {
      clearInterval(existingJob);
    }

    // Schedule based on type
    if (pipeline.schedule.type === 'interval' && pipeline.schedule.intervalMs) {
      const job = setInterval(() => {
        this.executePipeline(pipeline.pipelineId, 'schedule').catch(error => {
          console.error(`[PipelineBuilder] Scheduled execution failed for ${pipeline.pipelineId}:`, error);
        });
      }, pipeline.schedule.intervalMs);

      this.scheduledJobs.set(pipeline.pipelineId, job);

      // Calculate next run time
      pipeline.nextRunAt = new Date(Date.now() + pipeline.schedule.intervalMs);
    }

    // TODO: Implement cron-based scheduling with node-cron or similar library
  }
}

// Singleton instance
export const dataPipelineBuilder = new DataPipelineBuilder();
