// server/services/tool-registry.ts
import { EventEmitter } from 'events';
import { nanoid } from 'nanoid';

export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  author: string;
  tags: string[];
  inputSchema: ToolSchema;
  outputSchema: ToolSchema;
  configuration: ToolConfiguration;
  capabilities: ToolCapability[];
  dependencies: ToolDependency[];
  pricing: ToolPricing;
  permissions: ToolPermissions;
  healthCheck: ToolHealthCheck;
  metrics: ToolMetrics;
  createdAt: Date;
  updatedAt: Date;
  status: ToolStatus;
}

export interface ToolSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, any>;
  required?: string[];
  format?: string;
  validation?: ValidationRule[];
}

export interface ToolConfiguration {
  runtime: 'nodejs' | 'python' | 'docker' | 'external_api' | 'native';
  timeout: number;
  memory: number;
  cpu: number;
  storage: number;
  environment: Record<string, string>;
  secrets: string[];
  networkAccess: boolean;
  fileSystemAccess: boolean;
  databaseAccess: boolean;
}

export interface ToolCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: number;
  requiredResources: string[];
  scalability: 'single' | 'parallel' | 'distributed';
}

export interface ToolDependency {
  type: 'library' | 'service' | 'tool' | 'external_api';
  name: string;
  version: string;
  required: boolean;
  installCommand?: string;
  healthCheckUrl?: string;
}

export interface ToolPricing {
  model: 'free' | 'usage_based' | 'subscription' | 'enterprise';
  costPerExecution?: number;
  costPerMinute?: number;
  costPerMB?: number;
  monthlyFee?: number;
  freeTier?: {
    executions: number;
    dataLimitMB: number;
    timeoutMinutes: number;
  };
}

export interface ToolPermissions {
  userTypes: string[];
  subscriptionTiers: string[];
  ipWhitelist?: string[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  dataAccessLevel: 'none' | 'read' | 'write' | 'admin';
}

export interface ToolHealthCheck {
  endpoint?: string;
  interval: number;
  timeout: number;
  retryAttempts: number;
  expectedResponse?: any;
}

export interface ToolMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  averageResourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
  };
  userSatisfactionScore: number;
  lastExecuted?: Date;
  uptime: number;
  errorRate: number;
}

export type ToolCategory = 
  | 'data_transformation'
  | 'data_analysis'
  | 'visualization'
  | 'machine_learning'
  | 'data_validation'
  | 'external_integration'
  | 'file_processing'
  | 'database_operations'
  | 'api_services'
  | 'custom_business_logic';

export type ToolStatus = 'active' | 'inactive' | 'maintenance' | 'deprecated' | 'error';

export interface ValidationRule {
  field: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ToolExecution {
  id: string;
  toolId: string;
  userId: string;
  projectId: string;
  input: any;
  output?: any;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
    network: number;
  };
  logs: ExecutionLog[];
  errors: ExecutionError[];
  cost: number;
}

export interface ExecutionLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, any>;
}

export interface ExecutionError {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

export interface ToolHandler {
  execute(input: any, context: ExecutionContext): Promise<ToolExecutionResult>;
  validate(input: any): Promise<ValidationResult>;
  getStatus(): Promise<ToolHandlerStatus>;
  configure(config: Record<string, any>): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ExecutionContext {
  userId: string;
  projectId: string;
  executionId: string;
  timeout: number;
  resourceLimits: {
    cpu: number;
    memory: number;
    storage: number;
  };
  permissions: ToolPermissions;
  secrets: Record<string, string>;
}

export interface ToolExecutionResult {
  executionId: string;
  toolId: string;
  status: 'success' | 'failure' | 'partial';
  result: any;
  error?: string;
  warnings?: string[];
  metrics: {
    duration: number;
    resourcesUsed: {
      cpu: number;
      memory: number;
      storage: number;
    };
    cost: number;
  };
  artifacts?: ToolArtifact[];
  nextSuggestedTools?: string[];
}

export interface ToolArtifact {
  type: string;
  data: any;
  metadata: Record<string, any>;
  storageLocation?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface ToolHandlerStatus {
  status: 'active' | 'busy' | 'maintenance' | 'error';
  currentExecutions: number;
  queuedExecutions: number;
  lastActivity: Date;
  healthScore: number;
  resourceUsage: {
    cpu: number;
    memory: number;
    storage: number;
  };
}

export interface ToolSearchQuery {
  category?: ToolCategory;
  tags?: string[];
  capabilities?: string[];
  userType?: string;
  subscriptionTier?: string;
  keywords?: string;
  priceRange?: {
    min: number;
    max: number;
  };
  complexityLevel?: 'low' | 'medium' | 'high';
}

export interface ToolSearchResult {
  tools: ToolMetadata[];
  total: number;
  facets: {
    categories: Record<string, number>;
    tags: Record<string, number>;
    capabilities: Record<string, number>;
    priceRanges: Record<string, number>;
  };
}

export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolMetadata> = new Map();
  private handlers: Map<string, ToolHandler> = new Map();
  private executions: Map<string, ToolExecution> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor() {
    super();
    this.isRunning = true;
    console.log('🛠️ Tool Registry initialized');
  }

  /**
   * Register a new tool with the registry
   */
  async registerTool(metadata: ToolMetadata, handler: ToolHandler): Promise<void> {
    try {
      // Validate tool metadata
      this.validateToolMetadata(metadata);

      // Validate tool handler
      await this.validateToolHandler(handler);

      // Store tool and handler
      this.tools.set(metadata.id, {
        ...metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active'
      });
      this.handlers.set(metadata.id, handler);

      // Start health monitoring
      await this.startHealthMonitoring(metadata.id);

      // Initialize metrics
      this.initializeToolMetrics(metadata.id);

      this.emit('toolRegistered', { toolId: metadata.id, metadata });
      console.log(`🛠️ Tool registered: ${metadata.name} (${metadata.id})`);

    } catch (error) {
      console.error(`Failed to register tool ${metadata.name}:`, error);
      throw error;
    }
  }

  /**
   * Deregister a tool from the registry
   */
  async deregisterTool(toolId: string): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    try {
      // Stop health monitoring
      const healthInterval = this.healthCheckIntervals.get(toolId);
      if (healthInterval) {
        clearInterval(healthInterval);
        this.healthCheckIntervals.delete(toolId);
      }

      // Shutdown handler
      const handler = this.handlers.get(toolId);
      if (handler) {
        await handler.shutdown();
        this.handlers.delete(toolId);
      }

      // Remove tool
      this.tools.delete(toolId);

      this.emit('toolDeregistered', { toolId, toolName: tool.name });
      console.log(`🛠️ Tool deregistered: ${tool.name} (${toolId})`);

    } catch (error) {
      console.error(`Failed to deregister tool ${toolId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a tool with given input
   */
  async executeTool(
    toolId: string,
    input: any,
    context: ExecutionContext
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolId);
    const handler = this.handlers.get(toolId);

    if (!tool || !handler) {
      throw new Error(`Tool ${toolId} not found or not available`);
    }

    if (tool.status !== 'active') {
      throw new Error(`Tool ${toolId} is not active (status: ${tool.status})`);
    }

    const executionId = `exec_${nanoid()}`;
    const startTime = Date.now();

    // Create execution record
    const execution: ToolExecution = {
      id: executionId,
      toolId,
      userId: context.userId,
      projectId: context.projectId,
      input,
      status: 'pending',
      startTime: new Date(),
      resourceUsage: {
        cpu: 0,
        memory: 0,
        storage: 0,
        network: 0
      },
      logs: [],
      errors: [],
      cost: 0
    };

    this.executions.set(executionId, execution);

    try {
      // Validate input
      const validationResult = await handler.validate(input);
      if (!validationResult.isValid) {
        throw new Error(`Input validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }

      // Update execution status
      execution.status = 'running';
      this.emit('executionStarted', { executionId, toolId, userId: context.userId });

      // Execute tool
      const result = await handler.execute(input, {
        ...context,
        executionId
      });

      // Update execution record
      execution.status = 'completed';
      execution.endTime = new Date();
      execution.duration = Date.now() - startTime;
      execution.output = result.result;
      execution.cost = result.metrics.cost;

      // Update tool metrics
      await this.updateToolMetrics(toolId, execution, result);

      this.emit('executionCompleted', { 
        executionId, 
        toolId, 
        userId: context.userId,
        duration: execution.duration,
        cost: execution.cost
      });

      return result;

    } catch (error: any) {
      // Update execution record with error
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = Date.now() - startTime;
      execution.errors.push({
        timestamp: new Date(),
        type: error.constructor.name,
        message: error.message,
        stack: error.stack
      });

      // Update tool metrics
      await this.updateToolMetrics(toolId, execution, null, error);

      this.emit('executionFailed', { 
        executionId, 
        toolId, 
        userId: context.userId,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Search for tools based on criteria
   */
  async searchTools(query: ToolSearchQuery): Promise<ToolSearchResult> {
    const allTools = Array.from(this.tools.values());
    let filteredTools = allTools.filter(tool => tool.status === 'active');

    // Apply filters
    if (query.category) {
      filteredTools = filteredTools.filter(tool => tool.category === query.category);
    }

    if (query.tags && query.tags.length > 0) {
      filteredTools = filteredTools.filter(tool => 
        query.tags!.some(tag => tool.tags.includes(tag))
      );
    }

    if (query.capabilities && query.capabilities.length > 0) {
      filteredTools = filteredTools.filter(tool =>
        query.capabilities!.some(cap => 
          tool.capabilities.some(toolCap => toolCap.name === cap)
        )
      );
    }

    if (query.userType) {
      filteredTools = filteredTools.filter(tool =>
        tool.permissions.userTypes.includes(query.userType!)
      );
    }

    if (query.subscriptionTier) {
      filteredTools = filteredTools.filter(tool =>
        tool.permissions.subscriptionTiers.includes(query.subscriptionTier!)
      );
    }

    if (query.keywords) {
      const keywords = query.keywords.toLowerCase().split(' ');
      filteredTools = filteredTools.filter(tool =>
        keywords.some(keyword =>
          tool.name.toLowerCase().includes(keyword) ||
          tool.description.toLowerCase().includes(keyword) ||
          tool.tags.some(tag => tag.toLowerCase().includes(keyword))
        )
      );
    }

    if (query.complexityLevel) {
      filteredTools = filteredTools.filter(tool =>
        tool.capabilities.some(cap => cap.complexity === query.complexityLevel)
      );
    }

    // Generate facets
    const facets = this.generateSearchFacets(allTools);

    return {
      tools: filteredTools,
      total: filteredTools.length,
      facets
    };
  }

  /**
   * Get tool by ID
   */
  getTool(toolId: string): ToolMetadata | null {
    return this.tools.get(toolId) || null;
  }

  /**
   * Get all registered tools
   */
  getAllTools(): ToolMetadata[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: ToolCategory): ToolMetadata[] {
    return Array.from(this.tools.values()).filter(tool => tool.category === category);
  }

  /**
   * Get tool execution history
   */
  getExecutionHistory(toolId?: string, userId?: string): ToolExecution[] {
    let executions = Array.from(this.executions.values());

    if (toolId) {
      executions = executions.filter(exec => exec.toolId === toolId);
    }

    if (userId) {
      executions = executions.filter(exec => exec.userId === userId);
    }

    return executions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): ToolExecution | null {
    return this.executions.get(executionId) || null;
  }

  /**
   * Get system metrics
   */
  async getSystemMetrics(): Promise<any> {
    const tools = Array.from(this.tools.values());
    const executions = Array.from(this.executions.values());

    const totalExecutions = executions.length;
    const successfulExecutions = executions.filter(e => e.status === 'completed').length;
    const failedExecutions = executions.filter(e => e.status === 'failed').length;
    const runningExecutions = executions.filter(e => e.status === 'running').length;

    const averageExecutionTime = executions
      .filter(e => e.duration)
      .reduce((sum, e) => sum + e.duration!, 0) / Math.max(1, executions.filter(e => e.duration).length);

    const totalCost = executions.reduce((sum, e) => sum + e.cost, 0);

    const toolsByCategory = tools.reduce((acc, tool) => {
      acc[tool.category] = (acc[tool.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTools: tools.length,
      activeTools: tools.filter(t => t.status === 'active').length,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      runningExecutions,
      successRate: totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0,
      averageExecutionTime,
      totalCost,
      toolsByCategory,
      lastActivity: executions.length > 0 ? 
        Math.max(...executions.map(e => e.startTime.getTime())) : null
    };
  }

  /**
   * Update tool configuration
   */
  async updateToolConfiguration(toolId: string, config: Partial<ToolConfiguration>): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    tool.configuration = { ...tool.configuration, ...config };
    tool.updatedAt = new Date();

    const handler = this.handlers.get(toolId);
    if (handler) {
      await handler.configure(config);
    }

    this.emit('toolConfigurationUpdated', { toolId, config });
  }

  /**
   * Update tool status
   */
  async updateToolStatus(toolId: string, status: ToolStatus): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool) {
      throw new Error(`Tool ${toolId} not found`);
    }

    const oldStatus = tool.status;
    tool.status = status;
    tool.updatedAt = new Date();

    this.emit('toolStatusChanged', { toolId, oldStatus, newStatus: status });
  }

  // Private helper methods

  private validateToolMetadata(metadata: ToolMetadata): void {
    if (!metadata.id || !metadata.name || !metadata.version) {
      throw new Error('Tool metadata must include id, name, and version');
    }

    if (!metadata.configuration || !metadata.capabilities) {
      throw new Error('Tool metadata must include configuration and capabilities');
    }

    if (this.tools.has(metadata.id)) {
      throw new Error(`Tool with id ${metadata.id} already exists`);
    }
  }

  private async validateToolHandler(handler: ToolHandler): Promise<void> {
    if (!handler.execute || !handler.validate || !handler.getStatus) {
      throw new Error('Tool handler must implement execute, validate, and getStatus methods');
    }

    try {
      const status = await handler.getStatus();
      if (!status || !status.status) {
        throw new Error('Tool handler getStatus method must return valid status');
      }
    } catch (error) {
      throw new Error(`Tool handler validation failed: ${error}`);
    }
  }

  private async startHealthMonitoring(toolId: string): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.healthCheck) return;

    const interval = setInterval(async () => {
      try {
        const handler = this.handlers.get(toolId);
        if (handler) {
          const status = await handler.getStatus();
          
          // Update tool health metrics
          if (tool.metrics) {
            tool.metrics.uptime = status.healthScore || 100;
          }

          this.emit('toolHealthCheck', { toolId, status });
        }
      } catch (error) {
        console.error(`Health check failed for tool ${toolId}:`, error);
        await this.updateToolStatus(toolId, 'error');
      }
    }, tool.healthCheck.interval);

    this.healthCheckIntervals.set(toolId, interval);
  }

  private initializeToolMetrics(toolId: string): void {
    const tool = this.tools.get(toolId);
    if (tool) {
      tool.metrics = {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        averageResourceUsage: {
          cpu: 0,
          memory: 0,
          storage: 0
        },
        userSatisfactionScore: 5.0,
        uptime: 100,
        errorRate: 0
      };
    }
  }

  private async updateToolMetrics(
    toolId: string,
    execution: ToolExecution,
    result?: ToolExecutionResult | null,
    error?: Error
  ): Promise<void> {
    const tool = this.tools.get(toolId);
    if (!tool || !tool.metrics) return;

    const metrics = tool.metrics;
    
    metrics.totalExecutions += 1;
    
    if (result && execution.status === 'completed') {
      metrics.successfulExecutions += 1;
    } else if (error || execution.status === 'failed') {
      metrics.failedExecutions += 1;
    }

    if (execution.duration) {
      metrics.averageExecutionTime = 
        (metrics.averageExecutionTime * (metrics.totalExecutions - 1) + execution.duration) / 
        metrics.totalExecutions;
    }

    metrics.errorRate = (metrics.failedExecutions / metrics.totalExecutions) * 100;
    metrics.lastExecuted = execution.endTime || new Date();

    tool.updatedAt = new Date();
  }

  private generateSearchFacets(tools: ToolMetadata[]): any {
    const categories: Record<string, number> = {};
    const tags: Record<string, number> = {};
    const capabilities: Record<string, number> = {};
    const priceRanges: Record<string, number> = {
      'free': 0,
      'low': 0,
      'medium': 0,
      'high': 0
    };

    tools.forEach(tool => {
      // Categories
      categories[tool.category] = (categories[tool.category] || 0) + 1;

      // Tags
      tool.tags.forEach(tag => {
        tags[tag] = (tags[tag] || 0) + 1;
      });

      // Capabilities
      tool.capabilities.forEach(cap => {
        capabilities[cap.name] = (capabilities[cap.name] || 0) + 1;
      });

      // Price ranges
      if (tool.pricing.model === 'free') {
        priceRanges.free += 1;
      } else if (tool.pricing.costPerExecution && tool.pricing.costPerExecution <= 0.01) {
        priceRanges.low += 1;
      } else if (tool.pricing.costPerExecution && tool.pricing.costPerExecution <= 0.1) {
        priceRanges.medium += 1;
      } else {
        priceRanges.high += 1;
      }
    });

    return { categories, tags, capabilities, priceRanges };
  }

  /**
   * Shutdown the tool registry
   */
  async shutdown(): Promise<void> {
    console.log('🛠️ Shutting down Tool Registry...');
    this.isRunning = false;

    // Clear health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();

    // Shutdown all handlers
    for (const [toolId, handler] of this.handlers) {
      try {
        await handler.shutdown();
      } catch (error) {
        console.error(`Error shutting down tool ${toolId}:`, error);
      }
    }

    this.tools.clear();
    this.handlers.clear();
    this.executions.clear();

    console.log('🛠️ Tool Registry shutdown completed');
  }
}

// Export singleton instance for easy import
export const toolRegistry = new ToolRegistry();