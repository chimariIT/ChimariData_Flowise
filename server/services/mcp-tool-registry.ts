// server/services/mcp-tool-registry.ts
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { MCPResource } from '../mcp-ai-service';
import { comprehensiveMLHandler } from './comprehensive-ml-handler';
import { llmFineTuningHandler } from './llm-fine-tuning-handler';
import { EnhancedVisualizationEngine } from './enhanced-visualization-engine';
import { intelligentLibrarySelector } from './intelligent-library-selector';
import { sparkVisualizationHandler, sparkStatisticalHandler } from './spark-services';

/**
 * Easy Tool Onboarding System for MCP
 *
 * This registry makes it simple to add new tools to the MCP server
 * that agents can use. Just define your tool and register it!
 */

export interface ToolDefinition {
  name: string;
  description: string;
  service: string | Function;
  permissions: string[];
  inputSchema?: any;
  outputSchema?: any;
  examples?: ToolExample[];
  category?: 'data' | 'analysis' | 'visualization' | 'ml' | 'business' | 'utility';
  agentAccess?: string[]; // Which agents can use this tool
}

export interface ToolExample {
  name: string;
  description: string;
  input: any;
  expectedOutput: any;
}

export class MCPToolRegistry {
  private static registeredTools: Map<string, ToolDefinition> = new Map();

  /**
   * EASY TOOL REGISTRATION
   *
   * Use this method to add a new tool to MCP. Example:
   *
   * MCPToolRegistry.registerTool({
   *   name: 'my_custom_analyzer',
   *   description: 'Analyzes customer sentiment from text',
   *   service: SentimentAnalyzer,
   *   permissions: ['analyze_data', 'read_text'],
   *   category: 'analysis',
   *   agentAccess: ['data_scientist', 'business_agent']
   * });
   */
  static registerTool(tool: ToolDefinition): void {
    // Validate tool definition
    if (!tool.name || !tool.service || !tool.permissions) {
      throw new Error('Tool must have name, service, and permissions');
    }

    // Store tool definition
    this.registeredTools.set(tool.name, tool);

    // Register with MCP Server
    const mcpResource: MCPResource = {
      type: 'tool',
      name: tool.name,
      config: {
        service: typeof tool.service === 'string' ? tool.service : tool.service.name,
        description: tool.description,
        category: tool.category || 'utility',
        agentAccess: tool.agentAccess || ['all'],
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
      },
      permissions: tool.permissions
    };

    EnhancedMCPService.addResource(mcpResource);

    console.log(`✅ Tool registered: ${tool.name} (${tool.category || 'utility'})`);
  }

  /**
   * BATCH REGISTER MULTIPLE TOOLS
   */
  static registerTools(tools: ToolDefinition[]): void {
    tools.forEach(tool => this.registerTool(tool));
    console.log(`✅ Registered ${tools.length} tools`);
  }

  /**
   * GET TOOL BY NAME
   */
  static getTool(name: string): ToolDefinition | undefined {
    return this.registeredTools.get(name);
  }

  /**
   * GET ALL TOOLS
   */
  static getAllTools(): ToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * GET TOOLS BY CATEGORY
   */
  static getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * GET TOOLS ACCESSIBLE TO AGENT
   */
  static getToolsForAgent(agentId: string): ToolDefinition[] {
    return this.getAllTools().filter(tool =>
      !tool.agentAccess ||
      tool.agentAccess.includes('all') ||
      tool.agentAccess.includes(agentId)
    );
  }

  /**
   * REMOVE TOOL
   */
  static unregisterTool(name: string): boolean {
    const removed = this.registeredTools.delete(name);
    if (removed) {
      console.log(`🗑️ Tool unregistered: ${name}`);
    }
    return removed;
  }

  /**
   * CHECK IF AGENT CAN USE TOOL
   */
  static canAgentUseTool(agentId: string, toolName: string): boolean {
    const tool = this.getTool(toolName);
    if (!tool) return false;

    if (!tool.agentAccess || tool.agentAccess.includes('all')) {
      return true;
    }

    return tool.agentAccess.includes(agentId);
  }

  /**
   * GET TOOL DOCUMENTATION
   */
  static getToolDocs(toolName: string): string {
    const tool = this.getTool(toolName);
    if (!tool) return 'Tool not found';

    let docs = `
# ${tool.name}

**Description**: ${tool.description}

**Category**: ${tool.category || 'utility'}

**Permissions Required**: ${tool.permissions.join(', ')}

**Agent Access**: ${tool.agentAccess?.join(', ') || 'All agents'}
`;

    if (tool.inputSchema) {
      docs += `\n**Input Schema**:\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n`;
    }

    if (tool.outputSchema) {
      docs += `\n**Output Schema**:\n\`\`\`json\n${JSON.stringify(tool.outputSchema, null, 2)}\n\`\`\`\n`;
    }

    if (tool.examples && tool.examples.length > 0) {
      docs += `\n## Examples\n\n`;
      tool.examples.forEach((example, idx) => {
        docs += `### Example ${idx + 1}: ${example.name}\n`;
        docs += `${example.description}\n\n`;
        docs += `**Input**:\n\`\`\`json\n${JSON.stringify(example.input, null, 2)}\n\`\`\`\n\n`;
        docs += `**Expected Output**:\n\`\`\`json\n${JSON.stringify(example.expectedOutput, null, 2)}\n\`\`\`\n\n`;
      });
    }

    return docs;
  }

  /**
   * GENERATE TOOL CATALOG
   */
  static generateCatalog(): string {
    const tools = this.getAllTools();
    const categories = new Set(tools.map(t => t.category || 'utility'));

    let catalog = '# MCP Tool Catalog\n\n';
    catalog += `Total Tools: ${tools.length}\n\n`;

    for (const category of categories) {
      const categoryTools = tools.filter(t => (t.category || 'utility') === category);
      catalog += `## ${category.toUpperCase()} (${categoryTools.length} tools)\n\n`;

      categoryTools.forEach(tool => {
        catalog += `### ${tool.name}\n`;
        catalog += `${tool.description}\n`;
        catalog += `- **Permissions**: ${tool.permissions.join(', ')}\n`;
        catalog += `- **Agent Access**: ${tool.agentAccess?.join(', ') || 'All'}\n\n`;
      });
    }

    return catalog;
  }
}

// ==========================================
// PRE-REGISTERED CORE TOOLS
// ==========================================

/**
 * Register all core platform tools
 */
export function registerCoreTools(): void {
  MCPToolRegistry.registerTools([
    {
      name: 'file_processor',
      description: 'Process uploaded files and validate data integrity',
      service: 'FileProcessor',
      permissions: ['read_files', 'process_data', 'validate_schema'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      inputSchema: {
        file: 'File object or path',
        options: { validateSchema: 'boolean', detectPII: 'boolean' }
      },
      outputSchema: {
        data: 'array',
        schema: 'object',
        metadata: 'object'
      }
    },
    {
      name: 'schema_generator',
      description: 'Analyze data and generate schema with type detection',
      service: 'SchemaGenerator',
      permissions: ['analyze_schema', 'validate_data_types'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist'],
      examples: [{
        name: 'Generate schema from CSV',
        description: 'Automatically detect column types and constraints',
        input: { data: [{ name: 'John', age: 30 }] },
        expectedOutput: { schema: { name: { type: 'string' }, age: { type: 'integer' } } }
      }]
    },
    {
      name: 'data_transformer',
      description: 'Clean, transform, and engineer features from raw data',
      service: 'DataTransformer',
      permissions: ['transform_data', 'clean_data', 'engineer_features'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist']
    },
    {
      name: 'statistical_analyzer',
      description: 'Perform comprehensive statistical analysis and hypothesis testing',
      service: 'AdvancedAnalyzer',
      permissions: ['statistical_analysis', 'hypothesis_testing', 'anova', 'regression'],
      category: 'analysis',
      agentAccess: ['data_scientist']
    },
    {
      name: 'ml_pipeline',
      description: 'Train, evaluate, and deploy machine learning models (legacy)',
      service: 'MLService',
      permissions: ['train_models', 'predict', 'evaluate_models', 'feature_selection'],
      category: 'ml',
      agentAccess: ['data_scientist']
    },
    // ========================================
    // COMPREHENSIVE ML TOOLS
    // ========================================
    {
      name: 'comprehensive_ml_pipeline',
      description: 'Train ML models with intelligent library selection, AutoML, and explainability',
      service: 'ComprehensiveMLService',
      permissions: ['train_models', 'automl', 'model_explainability', 'library_selection'],
      category: 'ml_advanced',
      agentAccess: ['data_scientist']
    },
    {
      name: 'automl_optimizer',
      description: 'Automated ML with Bayesian hyperparameter optimization using Optuna',
      service: 'ComprehensiveMLService',
      permissions: ['automl', 'hyperparameter_optimization'],
      category: 'ml_advanced',
      agentAccess: ['data_scientist']
    },
    {
      name: 'ml_library_selector',
      description: 'Get ML library recommendation based on dataset characteristics',
      service: 'ComprehensiveMLService',
      permissions: ['performance_optimization'],
      category: 'ml_utility',
      agentAccess: ['data_scientist', 'data_engineer']
    },
    {
      name: 'ml_health_check',
      description: 'Check ML system health and library availability',
      service: 'ComprehensiveMLService',
      permissions: ['system_monitoring'],
      category: 'utility',
      agentAccess: ['data_scientist', 'project_manager']
    },
    // ========================================
    // LLM FINE-TUNING TOOLS
    // ========================================
    {
      name: 'llm_fine_tuning',
      description: 'Fine-tune LLMs with automatic method selection (LoRA, QLoRA, Full)',
      service: 'LLMFineTuningService',
      permissions: ['llm_training', 'parameter_efficient_fine_tuning', 'model_adaptation'],
      category: 'llm',
      agentAccess: ['data_scientist']
    },
    {
      name: 'lora_fine_tuning',
      description: 'Parameter-efficient LLM fine-tuning with LoRA',
      service: 'LLMFineTuningService',
      permissions: ['llm_training', 'lora'],
      category: 'llm',
      agentAccess: ['data_scientist']
    },
    {
      name: 'llm_method_recommendation',
      description: 'Recommend LLM fine-tuning method based on available resources',
      service: 'LLMFineTuningService',
      permissions: ['resource_optimization'],
      category: 'llm_utility',
      agentAccess: ['data_scientist']
    },
    {
      name: 'llm_health_check',
      description: 'Check LLM fine-tuning system health and GPU availability',
      service: 'LLMFineTuningService',
      permissions: ['system_monitoring'],
      category: 'utility',
      agentAccess: ['data_scientist', 'project_manager']
    },
    {
      name: 'visualization_engine',
      description: 'Create charts, dashboards, and interactive visualizations',
      service: 'VisualizationAPIService',
      permissions: ['create_charts', 'generate_dashboards', 'interactive_plots'],
      category: 'visualization',
      agentAccess: ['data_scientist', 'business_agent']
    },
    // ========================================
    // ENHANCED VISUALIZATION TOOLS
    // ========================================
    {
      name: 'enhanced_visualization_engine',
      description: 'Advanced visualization with intelligent library selection (Plotly, Matplotlib, Seaborn, Bokeh, D3.js)',
      service: 'EnhancedVisualizationEngine',
      permissions: ['intelligent_library_selection', 'advanced_visualizations', 'performance_optimization'],
      category: 'visualization_enhanced',
      agentAccess: ['data_scientist']
    },
    {
      name: 'plotly_generator',
      description: 'Generate interactive Plotly charts with advanced features',
      service: 'EnhancedVisualizationEngine',
      permissions: ['interactive_charts', 'web_dashboards', '3d_visualizations'],
      category: 'visualization_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'matplotlib_generator',
      description: 'Generate publication-quality static charts with Matplotlib',
      service: 'EnhancedVisualizationEngine',
      permissions: ['static_charts', 'publication_quality', 'customizable'],
      category: 'visualization_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'seaborn_generator',
      description: 'Generate beautiful statistical plots with Seaborn',
      service: 'EnhancedVisualizationEngine',
      permissions: ['statistical_plots', 'beautiful_defaults', 'pandas_integration'],
      category: 'visualization_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'bokeh_generator',
      description: 'Generate interactive dashboards and streaming visualizations with Bokeh',
      service: 'EnhancedVisualizationEngine',
      permissions: ['interactive_dashboards', 'streaming_data', 'large_datasets'],
      category: 'visualization_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'd3_generator',
      description: 'Generate highly customizable D3.js visualizations',
      service: 'EnhancedVisualizationEngine',
      permissions: ['custom_visualizations', 'interactive_web', 'complex_data_structures'],
      category: 'visualization_library',
      agentAccess: ['data_scientist']
    },
    // ========================================
    // ENHANCED STATISTICAL ANALYSIS TOOLS
    // ========================================
    {
      name: 'enhanced_statistical_analyzer',
      description: 'Advanced statistical analysis with intelligent library selection (SciPy, Statsmodels, Pandas, NumPy, Dask, Polars)',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['intelligent_library_selection', 'advanced_statistics', 'performance_optimization'],
      category: 'analysis_enhanced',
      agentAccess: ['data_scientist']
    },
    {
      name: 'scipy_analyzer',
      description: 'Statistical analysis using SciPy for optimization and signal processing',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['optimization', 'signal_processing', 'statistical_functions'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'statsmodels_analyzer',
      description: 'Comprehensive statistical modeling with Statsmodels',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['regression_models', 'time_series_analysis', 'statistical_tests'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'pandas_analyzer',
      description: 'Data analysis and manipulation with Pandas',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['data_manipulation', 'data_cleaning', 'data_exploration'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'numpy_analyzer',
      description: 'High-performance numerical computing with NumPy',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['array_operations', 'linear_algebra', 'fourier_transforms'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'dask_analyzer',
      description: 'Distributed computing for large-scale data analysis with Dask',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['distributed_computing', 'large_datasets', 'parallel_processing'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    {
      name: 'polars_analyzer',
      description: 'High-performance data analysis with Polars',
      service: 'EnhancedStatisticalAnalyzer',
      permissions: ['high_performance', 'lazy_evaluation', 'memory_efficient'],
      category: 'analysis_library',
      agentAccess: ['data_scientist']
    },
    // ========================================
    // SPARK-BASED DISTRIBUTED TOOLS
    // ========================================
    {
      name: 'spark_visualization_engine',
      description: 'Distributed visualization engine using Spark for large-scale datasets',
      service: 'SparkVisualizationEngine',
      permissions: ['distributed_visualization', 'large_datasets', 'cluster_computing'],
      category: 'visualization_spark',
      agentAccess: ['data_scientist']
    },
    {
      name: 'spark_statistical_analyzer',
      description: 'Distributed statistical analysis using Spark MLlib and Spark SQL',
      service: 'SparkStatisticalAnalyzer',
      permissions: ['distributed_statistics', 'large_datasets', 'cluster_computing'],
      category: 'analysis_spark',
      agentAccess: ['data_scientist']
    },
    {
      name: 'spark_ml_pipeline',
      description: 'Distributed machine learning pipeline using Spark MLlib',
      service: 'SparkMLPipeline',
      permissions: ['distributed_ml', 'large_datasets', 'cluster_computing', 'ml_algorithms'],
      category: 'ml_spark',
      agentAccess: ['data_scientist']
    },
    {
      name: 'spark_data_processor',
      description: 'Large-scale data processing and transformation using Spark',
      service: 'SparkDataProcessor',
      permissions: ['distributed_processing', 'large_datasets', 'data_transformation'],
      category: 'data_spark',
      agentAccess: ['data_scientist', 'data_engineer']
    },
    {
      name: 'spark_streaming_analyzer',
      description: 'Real-time streaming data analysis using Spark Streaming',
      service: 'SparkStreamingAnalyzer',
      permissions: ['streaming_analysis', 'real_time_processing', 'cluster_computing'],
      category: 'analysis_spark_streaming',
      agentAccess: ['data_scientist']
    },
    {
      name: 'spark_graph_analyzer',
      description: 'Graph analysis and processing using Spark GraphX',
      service: 'SparkGraphAnalyzer',
      permissions: ['graph_analysis', 'network_analysis', 'distributed_graphs'],
      category: 'analysis_spark_graph',
      agentAccess: ['data_scientist']
    },
    {
      name: 'business_templates',
      description: 'Apply industry-specific templates and formatting',
      service: 'BusinessTemplates',
      permissions: ['business_analysis', 'customize_outputs', 'create_reports'],
      category: 'business',
      agentAccess: ['business_agent', 'project_manager']
    },
    {
      name: 'project_coordinator',
      description: 'Coordinate workflow steps and manage project artifacts',
      service: 'ProjectCoordinator',
      permissions: ['coordinate_workflow', 'track_progress', 'manage_artifacts'],
      category: 'utility',
      agentAccess: ['project_manager']
    },
    {
      name: 'decision_auditor',
      description: 'Log and audit all agent decisions for transparency',
      service: 'DecisionAuditor',
      permissions: ['log_decisions', 'track_reasoning', 'audit_workflow'],
      category: 'utility',
      agentAccess: ['all']
    },
    // ========================================
    // PROJECT MANAGER TOOLS (Communication, Evaluation, Coordination)
    // ========================================
    {
      name: 'agent_communication',
      description: 'Send messages and coordinate with other agents in the system',
      service: 'AgentMessageBroker',
      permissions: ['agent_messaging', 'inter_agent_communication', 'task_delegation'],
      category: 'pm_communication',
      agentAccess: ['project_manager'],
      inputSchema: {
        targetAgentId: 'string',
        messageType: 'string',
        payload: 'object',
        priority: 'string (low|medium|high|urgent)'
      }
    },
    {
      name: 'workflow_evaluator',
      description: 'Evaluate workflow progress, identify bottlenecks, and assess quality',
      service: 'WorkflowEvaluator',
      permissions: ['evaluate_progress', 'quality_assessment', 'performance_metrics'],
      category: 'pm_evaluation',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        evaluationCriteria: 'array',
        includeMetrics: 'boolean'
      }
    },
    {
      name: 'task_coordinator',
      description: 'Create, assign, and track tasks across multiple agents',
      service: 'TaskCoordinator',
      permissions: ['create_tasks', 'assign_agents', 'track_completion', 'dependency_management'],
      category: 'pm_coordination',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        tasks: 'array',
        assignees: 'object',
        dependencies: 'array'
      }
    },
    {
      name: 'checkpoint_manager',
      description: 'Create approval checkpoints and manage user review workflows',
      service: 'CheckpointIntegration',
      permissions: ['create_checkpoints', 'manage_approvals', 'workflow_gates'],
      category: 'pm_coordination',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        checkpointType: 'string',
        artifacts: 'array',
        requiredApprovals: 'array'
      }
    },
    {
      name: 'progress_reporter',
      description: 'Generate progress reports and status updates for stakeholders',
      service: 'ProgressReporter',
      permissions: ['generate_reports', 'status_tracking', 'stakeholder_communication'],
      category: 'pm_communication',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        reportType: 'string (summary|detailed|executive)',
        includeMetrics: 'boolean',
        timeRange: 'object'
      }
    },
    {
      name: 'resource_allocator',
      description: 'Allocate and manage computational resources across agents and tasks',
      service: 'ResourceAllocator',
      permissions: ['allocate_resources', 'monitor_usage', 'optimize_distribution'],
      category: 'pm_coordination',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        resourceRequirements: 'object',
        priority: 'string'
      }
    },
    {
      name: 'risk_assessor',
      description: 'Identify and assess project risks, blockers, and mitigation strategies',
      service: 'RiskAssessor',
      permissions: ['risk_identification', 'impact_analysis', 'mitigation_planning'],
      category: 'pm_evaluation',
      agentAccess: ['project_manager'],
      inputSchema: {
        projectId: 'string',
        riskCategories: 'array',
        includeRecommendations: 'boolean'
      }
    },
    // ========================================
    // DATA ENGINEER TOOLS (Pipeline Management)
    // ========================================
    {
      name: 'data_pipeline_builder',
      description: 'Design and build ETL/ELT data pipelines with transformations',
      service: 'DataPipelineBuilder',
      permissions: ['build_pipelines', 'configure_etl', 'schedule_jobs'],
      category: 'de_pipeline',
      agentAccess: ['data_engineer'],
      inputSchema: {
        pipelineName: 'string',
        sourceConfig: 'object',
        transformations: 'array',
        destinationConfig: 'object',
        schedule: 'string (cron expression)'
      }
    },
    {
      name: 'data_quality_monitor',
      description: 'Monitor data quality metrics, detect anomalies, and validate schemas',
      service: 'DataQualityMonitor',
      permissions: ['quality_metrics', 'anomaly_detection', 'schema_validation'],
      category: 'de_quality',
      agentAccess: ['data_engineer'],
      inputSchema: {
        datasetId: 'string',
        qualityRules: 'array',
        alertThresholds: 'object'
      }
    },
    {
      name: 'data_lineage_tracker',
      description: 'Track data lineage and transformation history across pipelines',
      service: 'DataLineageTracker',
      permissions: ['track_lineage', 'audit_transformations', 'impact_analysis'],
      category: 'de_governance',
      agentAccess: ['data_engineer'],
      inputSchema: {
        datasetId: 'string',
        includeUpstream: 'boolean',
        includeDownstream: 'boolean'
      }
    },
    {
      name: 'schema_evolution_manager',
      description: 'Manage schema changes and ensure backward compatibility',
      service: 'SchemaEvolutionManager',
      permissions: ['manage_schemas', 'version_control', 'compatibility_check'],
      category: 'de_governance',
      agentAccess: ['data_engineer'],
      inputSchema: {
        datasetId: 'string',
        schemaChanges: 'object',
        migrationStrategy: 'string'
      }
    },
    {
      name: 'batch_processor',
      description: 'Execute batch processing jobs with monitoring and retry logic',
      service: 'BatchProcessor',
      permissions: ['batch_execution', 'job_monitoring', 'error_recovery'],
      category: 'de_pipeline',
      agentAccess: ['data_engineer'],
      inputSchema: {
        jobType: 'string',
        dataConfig: 'object',
        processingConfig: 'object',
        retryPolicy: 'object'
      }
    },
    // ========================================
    // CUSTOMER SUPPORT TOOLS (Platform Knowledge, Service, Billing)
    // ========================================
    {
      name: 'platform_knowledge_base',
      description: 'Search platform documentation, FAQs, and troubleshooting guides',
      service: 'PlatformKnowledgeBase',
      permissions: ['search_docs', 'access_faq', 'retrieve_guides'],
      category: 'cs_knowledge',
      agentAccess: ['customer_support'],
      inputSchema: {
        query: 'string',
        category: 'string (optional)',
        searchDepth: 'string (basic|comprehensive)'
      }
    },
    {
      name: 'service_health_checker',
      description: 'Check system health, service status, and performance metrics',
      service: 'ServiceHealthChecker',
      permissions: ['check_health', 'monitor_services', 'diagnostics'],
      category: 'cs_diagnostics',
      agentAccess: ['customer_support', 'project_manager'],
      inputSchema: {
        services: 'array (optional - defaults to all)',
        includeMetrics: 'boolean',
        detailed: 'boolean'
      }
    },
    {
      name: 'billing_query_handler',
      description: 'Query user billing information, subscription status, and usage details',
      service: 'BillingQueryHandler',
      permissions: ['query_billing', 'access_subscriptions', 'view_usage'],
      category: 'cs_billing',
      agentAccess: ['customer_support'],
      inputSchema: {
        userId: 'string',
        queryType: 'string (subscription|usage|invoices|quotas)',
        timeRange: 'object (optional)'
      }
    },
    {
      name: 'user_issue_tracker',
      description: 'Track and manage customer issues, tickets, and resolution status',
      service: 'UserIssueTracker',
      permissions: ['create_tickets', 'track_issues', 'update_status', 'escalate'],
      category: 'cs_support',
      agentAccess: ['customer_support'],
      inputSchema: {
        userId: 'string',
        issueType: 'string',
        priority: 'string',
        description: 'string',
        attachments: 'array (optional)'
      }
    },
    {
      name: 'feature_explainer',
      description: 'Explain platform features, capabilities, and best practices to users',
      service: 'FeatureExplainer',
      permissions: ['explain_features', 'provide_examples', 'guide_users'],
      category: 'cs_knowledge',
      agentAccess: ['customer_support'],
      inputSchema: {
        featureName: 'string',
        userLevel: 'string (beginner|intermediate|advanced)',
        includeExamples: 'boolean'
      }
    },
    {
      name: 'troubleshoot_assistant',
      description: 'Diagnose user issues and provide step-by-step troubleshooting guidance',
      service: 'TroubleshootAssistant',
      permissions: ['diagnose_issues', 'provide_solutions', 'access_logs'],
      category: 'cs_diagnostics',
      agentAccess: ['customer_support'],
      inputSchema: {
        userId: 'string',
        problemDescription: 'string',
        errorLogs: 'array (optional)',
        userJourneyType: 'string (optional)'
      }
    },
    // ========================================
    // BUSINESS AGENT TOOLS (Subject Matter Research)
    // ========================================
    {
      name: 'industry_research',
      description: 'Research industry-specific trends, regulations, and best practices',
      service: 'IndustryResearch',
      permissions: ['research_industries', 'analyze_trends', 'compliance_check'],
      category: 'ba_research',
      agentAccess: ['business_agent'],
      inputSchema: {
        industry: 'string',
        topics: 'array',
        depth: 'string (overview|detailed|comprehensive)',
        includeRegulations: 'boolean'
      }
    },
    {
      name: 'business_metric_analyzer',
      description: 'Analyze business metrics, KPIs, and performance indicators',
      service: 'BusinessMetricAnalyzer',
      permissions: ['analyze_metrics', 'calculate_kpis', 'benchmark_performance'],
      category: 'ba_analysis',
      agentAccess: ['business_agent'],
      inputSchema: {
        metricType: 'string',
        data: 'array',
        benchmarks: 'object (optional)',
        industry: 'string'
      }
    },
    {
      name: 'roi_calculator',
      description: 'Calculate ROI, cost-benefit analysis, and financial projections',
      service: 'ROICalculator',
      permissions: ['calculate_roi', 'financial_analysis', 'projection_modeling'],
      category: 'ba_analysis',
      agentAccess: ['business_agent'],
      inputSchema: {
        investment: 'number',
        returns: 'array',
        timeframe: 'string',
        includeProjections: 'boolean'
      }
    },
    {
      name: 'competitive_analyzer',
      description: 'Analyze competitive landscape and market positioning',
      service: 'CompetitiveAnalyzer',
      permissions: ['competitive_analysis', 'market_research', 'positioning'],
      category: 'ba_research',
      agentAccess: ['business_agent'],
      inputSchema: {
        industry: 'string',
        competitors: 'array (optional)',
        analysisType: 'string (swot|porter|benchmarking)'
      }
    },
    {
      name: 'compliance_checker',
      description: 'Check regulatory compliance requirements (GDPR, CCPA, SOX, etc.)',
      service: 'ComplianceChecker',
      permissions: ['check_compliance', 'regulatory_analysis', 'risk_assessment'],
      category: 'ba_governance',
      agentAccess: ['business_agent'],
      inputSchema: {
        industry: 'string',
        regulations: 'array',
        dataTypes: 'array',
        region: 'string'
      }
    },
    // ========================================
    // RESEARCH AGENT TOOLS (Internet Research, Template Creation)
    // ========================================
    {
      name: 'web_researcher',
      description: 'Search the internet for information, articles, and research papers',
      service: 'WebResearcher',
      permissions: ['web_search', 'content_extraction', 'source_validation'],
      category: 'ra_research',
      agentAccess: ['research_agent', 'business_agent'],
      inputSchema: {
        query: 'string',
        sources: 'array (optional)',
        depth: 'string (quick|standard|comprehensive)',
        timeRange: 'string (optional)',
        includeAcademic: 'boolean'
      }
    },
    {
      name: 'document_scraper',
      description: 'Extract structured data from websites and documents',
      service: 'DocumentScraper',
      permissions: ['scrape_web', 'extract_data', 'parse_documents'],
      category: 'ra_ingestion',
      agentAccess: ['research_agent'],
      inputSchema: {
        url: 'string',
        selectors: 'object (optional)',
        followLinks: 'boolean',
        maxDepth: 'number'
      }
    },
    {
      name: 'template_creator',
      description: 'Create and save reusable templates for analysis workflows',
      service: 'TemplateCreator',
      permissions: ['create_templates', 'save_templates', 'version_control'],
      category: 'ra_templates',
      agentAccess: ['research_agent', 'business_agent'],
      inputSchema: {
        templateName: 'string',
        industry: 'string',
        analysisType: 'string',
        components: 'array',
        metadata: 'object'
      }
    },
    {
      name: 'template_library_manager',
      description: 'Manage, search, and retrieve templates from the library',
      service: 'TemplateLibraryManager',
      permissions: ['search_templates', 'retrieve_templates', 'update_templates', 'delete_templates'],
      category: 'ra_templates',
      agentAccess: ['research_agent', 'business_agent', 'project_manager'],
      inputSchema: {
        action: 'string (search|retrieve|update|delete)',
        templateId: 'string (optional)',
        searchCriteria: 'object (optional)'
      }
    },
    {
      name: 'academic_paper_finder',
      description: 'Search and retrieve academic papers and research publications',
      service: 'AcademicPaperFinder',
      permissions: ['search_academic', 'access_publications', 'citation_extraction'],
      category: 'ra_research',
      agentAccess: ['research_agent'],
      inputSchema: {
        query: 'string',
        databases: 'array (arxiv|pubmed|scholar)',
        yearRange: 'object',
        maxResults: 'number'
      }
    },
    {
      name: 'trend_analyzer',
      description: 'Analyze trends and patterns from research data',
      service: 'TrendAnalyzer',
      permissions: ['analyze_trends', 'pattern_detection', 'forecasting'],
      category: 'ra_analysis',
      agentAccess: ['research_agent', 'business_agent'],
      inputSchema: {
        topic: 'string',
        timeRange: 'object',
        sources: 'array',
        includeForecasts: 'boolean'
      }
    },
    {
      name: 'content_synthesizer',
      description: 'Synthesize information from multiple sources into coherent summaries',
      service: 'ContentSynthesizer',
      permissions: ['synthesize_content', 'generate_summaries', 'extract_insights'],
      category: 'ra_analysis',
      agentAccess: ['research_agent', 'business_agent'],
      inputSchema: {
        sources: 'array',
        outputFormat: 'string (summary|report|bullets)',
        focusAreas: 'array (optional)'
      }
    },
    // ========================================
    // DATA INGESTION TOOLS
    // ========================================
    {
      name: 'csv_file_ingestion',
      description: 'Ingest and process CSV files with schema detection',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_csv', 'detect_schema'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      inputSchema: {
        buffer: 'Buffer',
        filename: 'string',
        mimetype: 'string'
      },
      outputSchema: {
        success: 'boolean',
        data: 'array',
        schema: 'object',
        recordCount: 'number'
      }
    },
    {
      name: 'excel_file_ingestion',
      description: 'Ingest and process Excel files (.xlsx, .xls) with multiple sheet support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_excel', 'detect_schema'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager']
    },
    {
      name: 'json_file_ingestion',
      description: 'Ingest and process JSON files and APIs',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_json', 'detect_schema'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager']
    },
    {
      name: 'pdf_file_ingestion',
      description: 'Extract text and tables from PDF documents',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'parse_pdf', 'extract_text', 'extract_tables'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent']
    },
    {
      name: 'image_file_ingestion',
      description: 'Process images with metadata extraction and OCR support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_images', 'extract_metadata', 'ocr'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist']
    },
    {
      name: 'web_scraping',
      description: 'Scrape data from websites using Cheerio (static) or Puppeteer (JavaScript)',
      service: 'ComprehensiveDataIngestion',
      permissions: ['web_scraping', 'http_requests', 'parse_html'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'business_agent'],
      inputSchema: {
        url: 'string',
        selector: 'string (optional)',
        javascript: 'boolean (default: false)',
        waitFor: 'string (optional)',
        pagination: 'object (optional)'
      },
      examples: [{
        name: 'Scrape product listings',
        description: 'Extract product data from e-commerce site',
        input: {
          url: 'https://example.com/products',
          selector: '.product-card',
          javascript: false
        },
        expectedOutput: {
          success: true,
          data: [{ text: 'Product 1', price: '$10' }],
          recordCount: 10
        }
      }]
    },
    {
      name: 'api_data_ingestion',
      description: 'Fetch data from REST APIs with authentication and pagination support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['api_access', 'http_requests', 'authentication'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        url: 'string',
        method: 'GET | POST (optional)',
        headers: 'object (optional)',
        auth: 'object (optional)',
        body: 'any (optional)'
      },
      examples: [{
        name: 'Fetch from public API',
        description: 'Get data from a REST API endpoint',
        input: {
          url: 'https://api.example.com/data',
          method: 'GET',
          auth: { type: 'bearer', token: '...' }
        },
        expectedOutput: {
          success: true,
          data: [{ id: 1, value: 'data' }],
          recordCount: 100
        }
      }]
    },
    {
      name: 'postgresql_ingestion',
      description: 'Ingest data from PostgreSQL databases',
      service: 'ComprehensiveDataIngestion',
      permissions: ['database_access', 'postgresql', 'execute_queries'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        host: 'string',
        port: 'number',
        database: 'string',
        username: 'string',
        password: 'string',
        query: 'string (SQL)',
        ssl: 'boolean (optional)'
      },
      examples: [{
        name: 'Query PostgreSQL table',
        description: 'Extract data from PostgreSQL database',
        input: {
          host: 'localhost',
          port: 5432,
          database: 'mydb',
          username: 'user',
          password: 'pass',
          query: 'SELECT * FROM customers LIMIT 1000'
        },
        expectedOutput: {
          success: true,
          data: [{ id: 1, name: 'Customer 1' }],
          recordCount: 1000
        }
      }]
    },
    {
      name: 'mysql_ingestion',
      description: 'Ingest data from MySQL/MariaDB databases',
      service: 'ComprehensiveDataIngestion',
      permissions: ['database_access', 'mysql', 'execute_queries'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        host: 'string',
        port: 'number',
        database: 'string',
        username: 'string',
        password: 'string',
        query: 'string (SQL)',
        ssl: 'boolean (optional)'
      }
    },
    {
      name: 'aws_s3_ingestion',
      description: 'Ingest files from AWS S3 buckets',
      service: 'ComprehensiveDataIngestion',
      permissions: ['cloud_access', 'aws_s3', 'read_files'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        provider: 'aws',
        credentials: 'object (accessKeyId, secretAccessKey, region)',
        bucket: 'string',
        filePath: 'string'
      },
      examples: [{
        name: 'Download CSV from S3',
        description: 'Fetch and process file from S3 bucket',
        input: {
          provider: 'aws',
          credentials: {
            accessKeyId: 'YOUR_ACCESS_KEY',
            secretAccessKey: 'YOUR_SECRET_KEY',
            region: 'us-east-1'
          },
          bucket: 'my-data-bucket',
          filePath: 'data/customers.csv'
        },
        expectedOutput: {
          success: true,
          data: [{ id: 1, name: 'Customer 1' }],
          recordCount: 5000
        }
      }]
    },
    {
      name: 'azure_blob_ingestion',
      description: 'Ingest files from Azure Blob Storage',
      service: 'ComprehensiveDataIngestion',
      permissions: ['cloud_access', 'azure_blob', 'read_files'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        provider: 'azure',
        credentials: 'object (connectionString)',
        container: 'string',
        filePath: 'string'
      }
    },
    {
      name: 'gcp_storage_ingestion',
      description: 'Ingest files from Google Cloud Storage',
      service: 'ComprehensiveDataIngestion',
      permissions: ['cloud_access', 'gcp_storage', 'read_files'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        provider: 'gcp',
        credentials: 'object (projectId, credentials)',
        bucket: 'string',
        filePath: 'string'
      },
      examples: [{
        name: 'Download from GCS',
        description: 'Fetch and process file from Google Cloud Storage',
        input: {
          provider: 'gcp',
          credentials: {
            projectId: 'my-project',
            keyFilename: '/path/to/credentials.json'
          },
          bucket: 'my-data-bucket',
          filePath: 'data/customers.csv'
        },
        expectedOutput: {
          success: true,
          data: [{id: 1, name: 'Customer 1'}],
          recordCount: 5000
        }
      }]
    },
    {
      name: 'mongodb_ingestion',
      description: 'Ingest data from MongoDB collections with query support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['database_access', 'mongodb', 'query_documents'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        connectionString: 'string',
        database: 'string',
        collection: 'string',
        query: 'object (optional MongoDB query)',
        projection: 'object (optional fields to include)',
        limit: 'number (optional, default: 1000)'
      },
      examples: [{
        name: 'Query MongoDB collection',
        description: 'Extract documents from MongoDB with filters',
        input: {
          connectionString: 'mongodb://localhost:27017',
          database: 'ecommerce',
          collection: 'orders',
          query: {status: 'completed', created_at: {$gte: new Date('2024-01-01')}},
          limit: 5000
        },
        expectedOutput: {
          success: true,
          data: [{_id: '507f1f77bcf86cd799439011', status: 'completed', userId: 123}],
          recordCount: 5000
        }
      }]
    },
    {
      name: 'graphql_api_ingestion',
      description: 'Fetch data from GraphQL APIs with authentication support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['api_access', 'graphql', 'http_requests'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        endpoint: 'string',
        query: 'string (GraphQL query)',
        variables: 'object (optional)',
        headers: 'object (optional)',
        auth: 'object (optional)'
      },
      examples: [{
        name: 'Query GraphQL API',
        description: 'Fetch data using GraphQL query',
        input: {
          endpoint: 'https://api.example.com/graphql',
          query: `
            query GetUsers($limit: Int!) {
              users(limit: $limit) {
                id
                name
                email
              }
            }
          `,
          variables: {limit: 100},
          auth: {type: 'bearer', token: '...'}
        },
        expectedOutput: {
          success: true,
          data: [{id: 1, name: 'John', email: 'john@example.com'}],
          recordCount: 100
        }
      }]
    },
    {
      name: 'websocket_streaming_ingestion',
      description: 'Ingest real-time streaming data from WebSocket connections',
      service: 'ComprehensiveDataIngestion',
      permissions: ['streaming_access', 'websocket', 'real_time_data'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        type: 'websocket',
        url: 'string',
        auth: 'object (optional)',
        reconnect: 'boolean (default: true)',
        maxMessages: 'number (default: 100)',
        timeout: 'number (milliseconds, default: 30000)'
      },
      examples: [{
        name: 'Stream real-time events',
        description: 'Connect to WebSocket and collect streaming events',
        input: {
          type: 'websocket',
          url: 'wss://stream.example.com/events',
          maxMessages: 500,
          timeout: 60000
        },
        expectedOutput: {
          success: true,
          data: [{timestamp: '2025-10-22T10:30:00Z', event: 'user_action', userId: 123}],
          recordCount: 500
        }
      }]
    },
    {
      name: 'image_ocr_extraction',
      description: 'Extract text from images using OCR (Optical Character Recognition)',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'ocr', 'image_processing'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        buffer: 'Buffer',
        filename: 'string',
        mimetype: 'string',
        enableOCR: 'boolean (true)',
        ocrConfig: 'object (optional)'
      },
      examples: [{
        name: 'Extract text from invoice',
        description: 'Process scanned invoice image and extract text',
        input: {
          buffer: '...',
          filename: 'invoice_001.jpg',
          mimetype: 'image/jpeg',
          enableOCR: true
        },
        expectedOutput: {
          success: true,
          data: [{
            filename: 'invoice_001.jpg',
            width: 2480,
            height: 3508,
            ocrText: 'Invoice #12345\nTotal: $1,234.56...'
          }],
          recordCount: 1
        }
      }]
    },
    // ========================================
    // DATA TRANSFORMATION TOOLS
    // ========================================
    {
      name: 'intelligent_data_transform',
      description: 'Intelligently transform data using JavaScript, Python, or Spark based on dataset size',
      service: 'IntelligentDataTransformer',
      permissions: ['transform_data', 'select_technology', 'optimize_performance'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        operation: 'string (transformation type)',
        inputData: 'array or multiple datasets',
        parameters: 'object (operation-specific)',
        outputFormat: 'string (optional: json, csv, parquet)',
        optimizationHint: 'string (optional: speed, memory, balanced)'
      },
      examples: [{
        name: 'Join two datasets',
        description: 'Intelligently join datasets using hash join',
        input: {
          operation: 'join_datasets',
          inputData: [
            {data: [{id: 1, name: 'A'}], alias: 'left'},
            {data: [{id: 1, value: 100}], alias: 'right'}
          ],
          parameters: {
            leftKey: 'id',
            rightKey: 'id',
            joinType: 'inner'
          }
        },
        expectedOutput: {
          success: true,
          data: [{id: 1, name: 'A', value: 100}],
          metadata: {technology: 'javascript', inputRows: 2, outputRows: 1}
        }
      }]
    },
    {
      name: 'format_conversion',
      description: 'Convert data between formats (CSV, JSON, Excel, Parquet, Avro)',
      service: 'IntelligentDataTransformer',
      permissions: ['convert_format', 'optimize_storage'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        sourceFormat: 'string',
        targetFormat: 'string',
        data: 'array',
        compressionLevel: 'number (optional)'
      },
      examples: [{
        name: 'CSV to Parquet conversion',
        description: 'Convert CSV data to efficient Parquet format',
        input: {
          sourceFormat: 'csv',
          targetFormat: 'parquet',
          data: [{id: 1, name: 'test'}]
        },
        expectedOutput: {
          success: true,
          data: 'parquet_buffer',
          metadata: {
            technology: 'javascript',
            inputRows: 1,
            outputRows: 1,
            optimizationApplied: ['format-conversion', 'columnar-storage']
          }
        }
      }]
    },
    {
      name: 'dataset_join',
      description: 'Join multiple datasets with intelligent strategy selection (hash, sort-merge, broadcast)',
      service: 'IntelligentDataTransformer',
      permissions: ['join_data', 'merge_datasets'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        leftData: 'array',
        rightData: 'array',
        leftKey: 'string or array of strings',
        rightKey: 'string or array of strings',
        joinType: 'inner | left | right | outer | cross',
        suffixes: 'array (optional, default: ["_left", "_right"])'
      },
      examples: [{
        name: 'Left join customers with orders',
        description: 'Join customer and order data',
        input: {
          leftData: [{id: 1, name: 'John'}, {id: 2, name: 'Jane'}],
          rightData: [{customer_id: 1, order: 'A'}, {customer_id: 1, order: 'B'}],
          leftKey: 'id',
          rightKey: 'customer_id',
          joinType: 'left'
        },
        expectedOutput: {
          success: true,
          data: [
            {id: 1, name: 'John', order: 'A'},
            {id: 1, name: 'John', order: 'B'},
            {id: 2, name: 'Jane', order: null}
          ]
        }
      }]
    },
    {
      name: 'data_aggregation',
      description: 'Group and aggregate data with multiple aggregation functions',
      service: 'IntelligentDataTransformer',
      permissions: ['aggregate_data', 'group_by'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        data: 'array',
        groupBy: 'string or array of strings',
        aggregations: 'array of {column, functions}'
      },
      examples: [{
        name: 'Sales by region',
        description: 'Aggregate sales data by region',
        input: {
          data: [
            {region: 'North', sales: 100},
            {region: 'North', sales: 150},
            {region: 'South', sales: 200}
          ],
          groupBy: 'region',
          aggregations: [{column: 'sales', functions: ['sum', 'avg', 'count']}]
        },
        expectedOutput: {
          success: true,
          data: [
            {region: 'North', sales_sum: 250, sales_avg: 125, sales_count: 2},
            {region: 'South', sales_sum: 200, sales_avg: 200, sales_count: 1}
          ]
        }
      }]
    },
    {
      name: 'pivot_table',
      description: 'Create pivot tables from tabular data',
      service: 'IntelligentDataTransformer',
      permissions: ['pivot_data', 'reshape_data'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      inputSchema: {
        data: 'array',
        index: 'string or array (row labels)',
        columns: 'string (column labels)',
        values: 'string or array (values to aggregate)',
        aggFunc: 'sum | mean | count | min | max'
      },
      examples: [{
        name: 'Pivot sales by product and month',
        description: 'Create pivot table for sales analysis',
        input: {
          data: [
            {product: 'A', month: 'Jan', sales: 100},
            {product: 'A', month: 'Feb', sales: 150},
            {product: 'B', month: 'Jan', sales: 200}
          ],
          index: 'product',
          columns: 'month',
          values: 'sales',
          aggFunc: 'sum'
        },
        expectedOutput: {
          success: true,
          data: [
            {product: 'A', Jan_sales: 100, Feb_sales: 150},
            {product: 'B', Jan_sales: 200, Feb_sales: null}
          ]
        }
      }]
    },
    {
      name: 'dedup_dataset',
      description: 'Remove duplicate rows with hash-based or key-based strategies',
      service: 'IntelligentDataTransformer',
      permissions: ['deduplicate', 'clean_data'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist'],
      inputSchema: {
        data: 'array',
        columns: 'array of strings (optional, dedup key columns)',
        keepFirst: 'boolean (default: true)'
      }
    },
    {
      name: 'add_calculated_column',
      description: 'Add computed columns using expressions or functions',
      service: 'IntelligentDataTransformer',
      permissions: ['calculate_fields', 'feature_engineering'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist']
    },
    {
      name: 'filter_transform',
      description: 'Filter rows based on conditions with optimized evaluation',
      service: 'IntelligentDataTransformer',
      permissions: ['filter_data', 'query_data'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent']
    }
  ]);

  console.log('✅ Core MCP tools registered (including advanced data ingestion & transformation tools)');
}

// ==========================================
// TOOL USAGE HELPERS
// ==========================================

/**
 * Create placeholder result for tools not yet implemented
 */
function createPlaceholderResult(executionContext: any, toolName: string): any {
  return {
    executionId: executionContext.executionId,
    toolId: toolName,
    status: 'success',
    result: {
      message: `Tool ${toolName} executed (placeholder implementation)`,
      note: 'This tool needs a real implementation',
      timestamp: new Date()
    },
    metrics: {
      duration: 100,
      resourcesUsed: { cpu: 1, memory: 10, storage: 0 },
      cost: 0.001
    }
  };
}

/**
 * Execute a tool with automatic validation and analytics tracking
 */
export async function executeTool(
  toolName: string,
  agentId: string,
  input: any,
  context?: { userId?: number; projectId?: string }
): Promise<any> {
  // Check if agent can use tool
  if (!MCPToolRegistry.canAgentUseTool(agentId, toolName)) {
    throw new Error(`Agent ${agentId} does not have access to tool ${toolName}`);
  }

  // Get tool definition
  const tool = MCPToolRegistry.getTool(toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  console.log(`🔧 Executing tool: ${toolName} for agent: ${agentId}`);

  // Import tool analytics service
  const { toolAnalyticsService } = require('./tool-analytics');

  // Start tracking execution
  const tracking = toolAnalyticsService.startExecution({
    toolId: toolName,
    agentId,
    userId: context?.userId,
    projectId: context?.projectId
  });

  // Import real tool handlers
  const {
    statisticalAnalyzerHandler,
    mlPipelineHandler,
    visualizationEngineHandler
  } = require('./real-tool-handlers');

  // Create execution context
  const executionContext = {
    executionId: tracking.executionId,
    agentId,
    userId: context?.userId,
    projectId: context?.projectId,
    timestamp: new Date()
  };

  // Route to appropriate real handler based on tool name
  try {
    let result;

    switch (toolName) {
      case 'statistical_analyzer':
        result = await statisticalAnalyzerHandler.execute(input, executionContext);
        break;

      case 'ml_pipeline':
        result = await mlPipelineHandler.execute(input, executionContext);
        break;

      // Comprehensive ML Tools
      case 'comprehensive_ml_pipeline':
        result = await comprehensiveMLHandler.executeComprehensiveMLPipeline(input, executionContext);
        break;

      case 'automl_optimizer':
        result = await comprehensiveMLHandler.executeAutoML(input, executionContext);
        break;

      case 'ml_library_selector':
        result = await comprehensiveMLHandler.executeLibraryRecommendation(input, executionContext);
        break;

      case 'ml_health_check':
        result = await comprehensiveMLHandler.executeMLHealthCheck(input, executionContext);
        break;

      // LLM Fine-Tuning Tools
      case 'llm_fine_tuning':
        result = await llmFineTuningHandler.executeFineTuning(input, executionContext);
        break;

      case 'lora_fine_tuning':
        result = await llmFineTuningHandler.executeLoRAFineTuning(input, executionContext);
        break;

      case 'llm_method_recommendation':
        result = await llmFineTuningHandler.executeMethodRecommendation(input, executionContext);
        break;

      case 'llm_health_check':
        result = await llmFineTuningHandler.executeHealthCheck(input, executionContext);
        break;

      case 'visualization_engine':
        result = await visualizationEngineHandler.execute(input, executionContext);
        break;

      // Enhanced Visualization Tools
      case 'enhanced_visualization_engine':
      case 'plotly_generator':
      case 'matplotlib_generator':
      case 'seaborn_generator':
      case 'bokeh_generator':
      case 'd3_generator':
        result = await visualizationEngineHandler.execute(input, executionContext);
        break;

      // Enhanced Statistical Analysis Tools
      case 'enhanced_statistical_analyzer':
      case 'scipy_analyzer':
      case 'statsmodels_analyzer':
      case 'pandas_analyzer':
      case 'numpy_analyzer':
      case 'dask_analyzer':
      case 'polars_analyzer':
        result = await statisticalAnalyzerHandler.execute(input, executionContext);
        break;

      // Spark-Based Distributed Tools
      case 'spark_visualization_engine':
        result = await sparkVisualizationHandler.createDistributedVisualization(input.data, input.config);
        break;

      case 'spark_statistical_analyzer':
        result = await sparkStatisticalHandler.performDistributedAnalysis(input.data, input.config);
        break;

      case 'spark_ml_pipeline':
      case 'spark_data_processor':
      case 'spark_streaming_analyzer':
      case 'spark_graph_analyzer':
        // These will be implemented in future iterations
        result = {
          executionId: executionContext.executionId,
          toolId: toolName,
          status: 'success',
          result: {
            message: `Spark tool ${toolName} is ready for implementation`,
            note: 'This Spark tool will be implemented in the next iteration',
            sparkReady: true
          },
          metrics: {
            duration: 0,
            resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
            cost: 0
          }
        };
        break;

      // ========================================
      // PROJECT MANAGER TOOLS
      // ========================================
      case 'agent_communication':
      case 'workflow_evaluator':
      case 'task_coordinator':
      case 'checkpoint_manager':
      case 'progress_reporter':
      case 'resource_allocator':
      case 'risk_assessor':
        const { pmToolHandlers } = require('./agent-tool-handlers');
        switch (toolName) {
          case 'agent_communication':
            result = await pmToolHandlers.handleAgentCommunication(input, executionContext);
            break;
          case 'workflow_evaluator':
            result = await pmToolHandlers.handleWorkflowEvaluator(input, executionContext);
            break;
          case 'task_coordinator':
            result = await pmToolHandlers.handleTaskCoordinator(input, executionContext);
            break;
          case 'checkpoint_manager':
            result = await pmToolHandlers.handleCheckpointManager(input, executionContext);
            break;
          case 'progress_reporter':
            result = await pmToolHandlers.handleProgressReporter(input, executionContext);
            break;
          case 'resource_allocator':
            result = await pmToolHandlers.handleResourceAllocator(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // CUSTOMER SUPPORT TOOLS
      // ========================================
      case 'platform_knowledge_base':
      case 'service_health_checker':
      case 'billing_query_handler':
      case 'user_issue_tracker':
      case 'feature_explainer':
      case 'troubleshoot_assistant':
        const { customerSupportToolHandlers } = require('./agent-tool-handlers');
        switch (toolName) {
          case 'platform_knowledge_base':
            result = await customerSupportToolHandlers.handleKnowledgeBaseSearch(input, executionContext);
            break;
          case 'service_health_checker':
            result = await customerSupportToolHandlers.handleServiceHealthCheck(input, executionContext);
            break;
          case 'billing_query_handler':
            result = await customerSupportToolHandlers.handleBillingQuery(input, executionContext);
            break;
          case 'user_issue_tracker':
            result = await customerSupportToolHandlers.handleUserIssueTracker(input, executionContext);
            break;
          case 'feature_explainer':
            result = await customerSupportToolHandlers.handleFeatureExplainer(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // BUSINESS AGENT TOOLS
      // ========================================
      case 'industry_research':
      case 'business_metric_analyzer':
      case 'roi_calculator':
      case 'competitive_analyzer':
      case 'compliance_checker':
        const { businessAgentToolHandlers } = require('./agent-tool-handlers');
        switch (toolName) {
          case 'industry_research':
            result = await businessAgentToolHandlers.handleIndustryResearch(input, executionContext);
            break;
          case 'roi_calculator':
            result = await businessAgentToolHandlers.handleROICalculator(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // RESEARCH AGENT TOOLS
      // ========================================
      case 'web_researcher':
      case 'document_scraper':
      case 'template_creator':
      case 'template_library_manager':
      case 'academic_paper_finder':
      case 'trend_analyzer':
      case 'content_synthesizer':
        const { researchAgentToolHandlers } = require('./agent-tool-handlers');
        switch (toolName) {
          case 'web_researcher':
            result = await researchAgentToolHandlers.handleWebResearch(input, executionContext);
            break;
          case 'template_creator':
            result = await researchAgentToolHandlers.handleTemplateCreator(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // DATA ENGINEER TOOLS
      // ========================================
      case 'data_pipeline_builder':
      case 'data_quality_monitor':
      case 'data_lineage_tracker':
      case 'schema_evolution_manager':
      case 'batch_processor':
        const { dataEngineerToolHandlers } = require('./agent-tool-handlers');
        switch (toolName) {
          case 'data_pipeline_builder':
            result = await dataEngineerToolHandlers.handleDataPipelineBuilder(input, executionContext);
            break;
          case 'data_quality_monitor':
            result = await dataEngineerToolHandlers.handleDataQualityMonitor(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      default:
        // For other tools that don't have real implementations yet
        console.warn(`⚠️ Tool ${toolName} does not have a real implementation - using placeholder`);
        result = createPlaceholderResult(executionContext, toolName);
    }

    // Track successful execution
    await tracking.complete(result);

    // Record usage with billing system (if user context provided)
    if (context?.userId) {
      try {
        const { billingAnalyticsIntegration } = require('./billing-analytics-integration');

        // Extract complexity from input (fallback to 'medium' if not specified)
        const complexity = input.complexity || input.analysisType || input.modelType || 'medium';
        const executionCost = result.metrics?.cost || 0;

        const billingResult = await billingAnalyticsIntegration.recordToolUsageAndBill({
          userId: context.userId.toString(),
          toolId: toolName,
          complexity,
          executionCost
        });

        // Add billing info to result for transparency
        result.billing = {
          quotaExceeded: billingResult.quotaExceeded,
          cost: billingResult.cost,
          remainingQuota: billingResult.remainingQuota,
          message: billingResult.message
        };

        if (billingResult.quotaExceeded) {
          console.log(`💰 User ${context.userId} exceeded quota for ${toolName} - charged $${billingResult.cost.toFixed(2)}`);
        } else {
          console.log(`✅ Tool usage recorded for user ${context.userId} - remaining quota: ${billingResult.remainingQuota}`);
        }
      } catch (billingError) {
        console.error('⚠️ Billing integration error (non-blocking):', billingError);
        // Don't fail the tool execution if billing fails
        result.billing = {
          error: 'Billing tracking failed',
          message: (billingError as Error).message
        };
      }
    }

    console.log(`✅ Tool ${toolName} executed successfully`);
    return result;

  } catch (error) {
    console.error(`❌ Tool ${toolName} execution failed:`, error);

    const errorResult = {
      executionId: executionContext.executionId,
      toolId: toolName,
      status: 'error',
      result: null,
      metrics: {
        duration: 0,
        resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
        cost: 0
      },
      error: (error as Error).message || String(error)
    };

    // Track failed execution
    await tracking.complete(errorResult);

    return errorResult;
  }
}

/**
 * Get available tools for an agent as a formatted list
 */
export function getAgentToolMenu(agentId: string): string {
  const tools = MCPToolRegistry.getToolsForAgent(agentId);

  let menu = `# Available Tools for ${agentId}\n\n`;
  menu += `You have access to ${tools.length} tools:\n\n`;

  const categories = new Set(tools.map(t => t.category || 'utility'));

  for (const category of categories) {
    const categoryTools = tools.filter(t => (t.category || 'utility') === category);
    menu += `## ${category.toUpperCase()}\n\n`;

    categoryTools.forEach(tool => {
      menu += `- **${tool.name}**: ${tool.description}\n`;
    });
    menu += '\n';
  }

  return menu;
}
