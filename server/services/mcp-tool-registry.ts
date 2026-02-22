// server/services/mcp-tool-registry.ts
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { MCPResource } from '../mcp-ai-service';
import { comprehensiveMLHandler } from './comprehensive-ml-handler';
import { llmFineTuningHandler } from './llm-fine-tuning-handler';
import { EnhancedVisualizationEngine } from './enhanced-visualization-engine';
import { intelligentLibrarySelector } from './intelligent-library-selector';
import { sparkVisualizationHandler, sparkStatisticalHandler } from './spark-services';
import type { ToolExecutionContext, ToolExecutionResult } from './agent-tool-handlers';
import { artifactService } from './artifact-persistence-service';

export type { ToolExecutionContext, ToolExecutionResult } from './agent-tool-handlers';

/**
 * Easy Tool Onboarding System for MCP
 *
 * This registry makes it simple to add new tools to the MCP server
 * that agents can use. Just define your tool and register it!
 */

export type ToolCategory =
  | 'data'
  | 'analysis'
  | 'visualization'
  | 'ml'
  | 'business'
  | 'utility'
  | 'ml_advanced'
  | 'ml_utility'
  | 'llm'
  | 'llm_utility'
  | 'visualization_enhanced'
  | 'visualization_library'
  | 'analysis_enhanced'
  | 'analysis_library'
  | 'visualization_spark'
  | 'analysis_spark'
  | 'ml_spark'
  | 'data_spark'
  | 'analysis_spark_streaming'
  | 'analysis_spark_graph'
  | 'pm_communication'
  | 'pm_evaluation'
  | 'pm_coordination'
  | 'de_pipeline'
  | 'de_quality'
  | 'de_governance'
  | 'cs_knowledge'
  | 'cs_diagnostics'
  | 'cs_billing'
  | 'cs_support'
  | 'ba_research'
  | 'ba_analysis'
  | 'ba_governance'
  | 'ra_research'
  | 'ra_ingestion'
  | 'ra_templates'
  | 'ra_analysis'
  | 'data_ingestion'
  | 'data_transformation'
  | 'data_utility'
  | 'planning'
  | 'ba_data_mapping'
  | 'ra_data_mapping';

export interface ToolCapability {
  name: string;
  description: string;
  inputTypes?: string[];
  outputTypes?: string[];
  complexity?: 'low' | 'medium' | 'high';
  estimatedDuration?: number;
  requiredResources?: string[];
  scalability?: 'single' | 'parallel' | 'distributed';
}

export interface ToolDefinition {
  name: string;
  description: string;
  service: string | Function;
  permissions: string[];
  inputSchema?: any;
  outputSchema?: any;
  examples?: ToolExample[];
  category?: ToolCategory;
  agentAccess?: string[]; // Which agents can use this tool

  // Dynamic Discovery Metadata
  capabilities?: string[] | ToolCapability[]; // specialized capabilities
  inputTypes?: string[];      // Supported input mime-types or data structures
  outputTypes?: string[];     // Output types
  complexity?: 'low' | 'medium' | 'high'; // For agent decision making
  costModel?: {
    type: 'token' | 'compute' | 'fixed';
    price?: number;
    unit?: string;
  };
}

export interface ToolExample {
  name: string;
  description: string;
  input: any;
  expectedOutput: any;
}

const AGENT_ROLE_ALIASES: Record<string, string[]> = {
  technical_ai_agent: ['technical_ai_agent', 'data_scientist', 'analysis_agent'],
  data_scientist: ['data_scientist'],
  data_engineer: ['data_engineer'],
  project_manager: ['project_manager'],
  business_agent: ['business_agent', 'business_analyst'],
  customer_support_agent: ['customer_support_agent', 'customer_support', 'support_agent'],
  support_agent: ['support_agent', 'customer_support'],
  research_agent: ['research_agent'],
  template_research_agent: ['template_research_agent', 'research_agent'],
  // Allow API fallback routes to use data_engineer and project_manager tools
  api_fallback: ['data_engineer', 'project_manager'],
};

function resolveAgentRoles(agentId: string): string[] {
  const normalized = agentId?.trim() || '';
  const aliases = AGENT_ROLE_ALIASES[normalized];
  if (aliases) {
    return aliases;
  }
  return normalized ? [normalized] : [];
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
   *   agentAccess: ['data_scientist', 'business_agent'],
   *   capabilities: ['analyze.sentiment', 'process.text'],
   *   complexity: 'medium'
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
        outputSchema: tool.outputSchema,
        capabilities: tool.capabilities, // Pass capabilities to MCP
        inputTypes: tool.inputTypes,
        complexity: tool.complexity
      },
      permissions: tool.permissions
    };

    EnhancedMCPService.addResource(mcpResource);

    console.log(`✅ Tool registered: ${tool.name} (${tool.category || 'utility'}) [Caps: ${Array.isArray(tool.capabilities) ? tool.capabilities.length : 0}]`);
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
    const allowedRoles = resolveAgentRoles(agentId);
    return this.getAllTools().filter(tool => {
      if (!tool.agentAccess || tool.agentAccess.includes('all')) {
        return true;
      }
      return tool.agentAccess.some(role => allowedRoles.includes(role));
    });
  }

  // ============================================================================
  // DYNAMIC DISCOVERY API (PHASE 2)
  // ============================================================================

  /**
   * Find tools by specific capability
   * @param capability e.g., 'analysis.statistical', 'data.clean'
   */
  static findToolsByCapability(capability: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => {
      if (!tool.capabilities) return false;
      // Handle both string[] and ToolCapability[]
      return tool.capabilities.some(cap => {
        if (typeof cap === 'string') return cap === capability;
        return cap.name === capability;
      });
    });
  }

  /**
   * Find tools by supported input type
   * @param inputType e.g., 'dataset/tabular', 'file/csv'
   */
  static findToolsByInputType(inputType: string): ToolDefinition[] {
    return this.getAllTools().filter(tool =>
      tool.inputTypes && tool.inputTypes.includes(inputType)
    );
  }

  /**
   * Find tools matching a semantic intent (basic implementation)
   * @param intentDescription Description of what needs to be done
   */
  static findToolsByIntent(intentDescription: string): ToolDefinition[] {
    const keywords = intentDescription.toLowerCase().split(/\s+/).filter(k => k.length > 3);
    return this.getAllTools().filter(tool => {
      const toolText = `${tool.name} ${tool.description} ${tool.category}`.toLowerCase();
      // Simple scoring: count matching keywords
      const matchCount = keywords.reduce((count, keyword) => {
        return count + (toolText.includes(keyword) ? 1 : 0);
      }, 0);
      return matchCount > 0;
    }).sort((a, b) => {
      // Sort by rudimentary relevance (would use embeddings in future)
      return 0; // Stable sort for now, rely on filter
    });
  }

  /**
   * Validate tool access dynamically (e.g. quotas, tier)
   */
  static validateToolAccess(toolName: string, context: { userId: string; tier?: string }): boolean {
    const tool = this.getTool(toolName);
    if (!tool) return false;

    // Future: Check user tier quotas
    // if (tool.complexity === 'high' && context.tier === 'free') return false;

    return true;
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

    const allowedRoles = resolveAgentRoles(agentId);
    return tool.agentAccess.some(role => allowedRoles.includes(role));
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
      },
      capabilities: ['data.process', 'data.validate'],
      inputTypes: ['file/csv', 'file/check', 'file/json', 'file/parquet'],
      complexity: 'low'
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
      }],
      capabilities: ['schema.generate', 'schema.detect'],
      inputTypes: ['dataset/tabular', 'json/array'],
      complexity: 'medium'
    },
    {
      name: 'data_transformer',
      description: 'Clean, transform, and engineer features from raw data',
      service: 'DataTransformer',
      permissions: ['transform_data', 'clean_data', 'engineer_features'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist'],
      capabilities: ['data.transform', 'data.clean', 'feature.engineer'],
      complexity: 'medium'
    },
    {
      name: 'apply_transformations',
      description: 'Apply transformation steps to a dataset (filter, join, calculate, aggregate, etc.)',
      service: 'DataTransformationService',
      permissions: ['transform_data', 'apply_transformations'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist'],
      capabilities: ['data.transform', 'transform.apply', 'transform.chain'],
      inputSchema: {
        projectId: 'string',
        transformationSteps: 'array (TransformationStep[])',
        sourceRows: 'array',
        originalSchema: 'object (optional)'
      },
      // Note: joinResolver is created internally by the handler, not passed as parameter
      outputSchema: {
        rows: 'array',
        preview: 'array',
        rowCount: 'number',
        warnings: 'array',
        summary: 'string',
        schema: 'object'
      },
      complexity: 'high'
    },
    {
      name: 'statistical_analyzer',
      description: 'Perform comprehensive statistical analysis and hypothesis testing',
      service: 'AdvancedAnalyzer',
      permissions: ['statistical_analysis', 'hypothesis_testing', 'anova', 'regression'],
      category: 'analysis',
      agentAccess: ['data_scientist'],
      capabilities: ['analysis.statistical', 'hypothesis.test', 'regression.analysis'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
    },
    // ========================================
    // COMPREHENSIVE DATA SCIENCE TOOL
    // ========================================
    {
      name: 'comprehensive_analysis',
      description: 'Execute full data science workflow: data quality, statistical analysis, ML models, visualizations, and question-answer evidence chain',
      service: 'DataScienceOrchestrator',
      permissions: ['statistical_analysis', 'ml_training', 'visualization', 'data_quality', 'hypothesis_testing'],
      category: 'analysis',
      agentAccess: ['data_scientist', 'project_manager'],
      capabilities: ['analysis.comprehensive', 'ml.train', 'visualization.create'],
      inputTypes: ['dataset/tabular'],
      complexity: 'high',
      inputSchema: {
        projectId: 'string',
        userId: 'string',
        analysisTypes: 'array of strings',
        userGoals: 'array of strings',
        userQuestions: 'array of strings',
        datasetIds: 'optional array of strings'
      },
      outputSchema: {
        dataQualityReport: 'object with overallScore, missingValues, outliers, distributions, pii',
        statisticalAnalysisReport: 'object with descriptiveStats, correlationMatrix, hypothesisTests',
        mlModels: 'array of model artifacts with metrics and feature importance',
        visualizations: 'array of visualization configs',
        questionAnalysisLinks: 'array mapping questions to analysis findings',
        executiveSummary: 'object with keyFindings, answersToQuestions, recommendations'
      }
    },
    // ========================================
    // ANALYSIS EXECUTION TOOL (used by execute-step)
    // ========================================
    {
      name: 'analysis_execution',
      description: 'Execute analysis on project datasets with progress tracking and artifact generation',
      service: 'AnalysisExecutionService',
      permissions: ['execute_analysis', 'read_data', 'generate_artifacts'],
      category: 'analysis',
      agentAccess: ['data_scientist', 'project_manager'],
      // Note: technical_ai_agent removed - Technical AI Agent is internal service used by Data Scientist
      capabilities: ['analysis.execute', 'artifact.generate', 'progress.track'],
      inputTypes: ['dataset/tabular'],
      complexity: 'high',
      inputSchema: {
        projectId: 'string',
        userId: 'string',
        analysisTypes: 'array of strings',
        datasetIds: 'optional array of strings'
      },
      outputSchema: {
        projectId: 'string',
        summary: 'object with analysisCount, dataPoints, findings',
        insights: 'array of insight objects',
        recommendations: 'array of recommendation objects',
        visualizations: 'array of visualization objects',
        analysisTypes: 'array of executed analysis types',
        metadata: 'object with timing and quality metrics'
      }
    },
    // ========================================
    // OUTPUT FORMATTING TOOLS (backed by real services)
    // ========================================
    {
      name: 'audience_formatter',
      description: 'Format analysis results for specific audience (executive, technical, business_ops, marketing)',
      service: 'AudienceFormatter',
      permissions: ['format_results', 'audience_adaptation'],
      category: 'business',
      agentAccess: ['data_scientist', 'project_manager', 'business_agent'],
      capabilities: ['format.audience', 'report.customize'],
      inputTypes: ['analysis/result'],
      complexity: 'medium',
      inputSchema: {
        analysisResult: 'object with type, data, summary, insights, recommendations',
        audienceContext: 'object with primaryAudience, journeyType'
      },
      outputSchema: {
        executiveSummary: 'string',
        technicalDetails: 'string',
        businessInsights: 'array of strings',
        actionableRecommendations: 'array of strings',
        visualizations: 'array',
        methodology: 'string',
        confidence: 'number',
        nextSteps: 'array of strings'
      }
    },
    {
      name: 'question_answer_generator',
      description: 'Generate direct answers to user questions from analysis results with evidence',
      service: 'QuestionAnswerService',
      permissions: ['analyze_data', 'comprehensive_report', 'multi_dataset'],
      category: 'analysis',
      agentAccess: ['data_scientist', 'project_manager', 'business_agent'],
      capabilities: ['analysis.comprehensive', 'report.generate', 'insight.discovery', 'question.answer', 'evidence.chain'],
      inputTypes: ['dataset/tabular', 'text/question'],
      complexity: 'high',
      inputSchema: {
        projectId: 'string',
        userId: 'string',
        questions: 'array of question strings',
        analysisResults: 'object with insights, recommendations',
        audience: 'object with primaryAudience, technicalLevel'
      },
      outputSchema: {
        answers: 'array of {question, answer, confidence, sources, relatedInsights, status}',
        totalQuestions: 'number',
        answeredCount: 'number'
      },
    },

    {
      name: 'artifact_generator',
      description: 'Generate downloadable artifacts (PDF reports, CSV exports, presentations)',
      service: 'ArtifactGenerator',
      permissions: ['generate_artifacts', 'create_reports', 'export_data'],
      category: 'business',
      agentAccess: ['project_manager', 'business_agent', 'data_scientist'],
      inputSchema: {
        projectId: 'string',
        artifactType: 'string (pdf|csv|xlsx|pptx|json)',
        analysisResults: 'object',
        options: 'object with format preferences'
      },
      outputSchema: {
        artifactId: 'string',
        filePath: 'string',
        fileType: 'string',
        metadata: 'object'
      },
      capabilities: ['artifact.generate', 'report.create', 'file.export'],
      inputTypes: ['analysis/result'],
      complexity: 'medium'
    },
    {
      name: 'ml_pipeline',
      description: 'Train, evaluate, and deploy machine learning models (legacy)',
      service: 'MLService',
      permissions: ['train_model', 'predict', 'evaluate_model'],
      category: 'ml',
      agentAccess: ['data_scientist'],
      capabilities: ['ml.train', 'ml.predict', 'model.evaluate'],
      inputTypes: ['dataset/labeled'],
      complexity: 'high'
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
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['ml.train', 'automl.optimize', 'ml.explain', 'model.select', 'hyperparameter.tune'],
      inputTypes: ['dataset/tabular', 'dataset/labeled'],
      outputTypes: ['model/trained', 'metrics/performance', 'explanation/shap'],
      complexity: 'high',
      costModel: {
        type: 'compute',
        price: 0.05,
        unit: 'per_model'
      }
    },
    {
      name: 'automl_optimizer',
      description: 'Automated ML with Bayesian hyperparameter optimization using Optuna',
      service: 'ComprehensiveMLService',
      permissions: ['automl', 'hyperparameter_optimization'],
      category: 'ml_advanced',
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['automl.optimize', 'hyperparameter.tune', 'bayesian.search'],
      inputTypes: ['model/config', 'dataset/tabular'],
      complexity: 'high'
    },
    {
      name: 'ml_library_selector',
      description: 'Get ML library recommendation based on dataset characteristics',
      service: 'ComprehensiveMLService',
      permissions: ['performance_optimization'],
      category: 'ml_utility',
      agentAccess: ['data_scientist', 'data_engineer'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['library.recommend', 'performance.optimize', 'resource.estimate'],
      inputTypes: ['dataset/characteristics'],
      complexity: 'low'
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
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['llm.fine_tune', 'lora.train', 'model.adapt'],
      inputTypes: ['dataset/text', 'model/pretrained'],
      outputTypes: ['model/fine_tuned', 'adapter/lora'],
      complexity: 'high',
      costModel: {
        type: 'compute',
        price: 0.10,
        unit: 'per_epoch'
      }
    },
    {
      name: 'lora_fine_tuning',
      description: 'Parameter-efficient LLM fine-tuning with LoRA',
      service: 'LLMFineTuningService',
      permissions: ['llm_training', 'lora'],
      category: 'llm',
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['lora.train', 'peft.apply', 'llm.adapt'],
      inputTypes: ['dataset/text', 'model/pretrained'],
      complexity: 'high'
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
      permissions: ['create_visualization', 'data_viz', 'plotting'],
      category: 'visualization',
      agentAccess: ['data_scientist', 'business_agent'],
      capabilities: ['visualization.create', 'chart.generate', 'data.plot'],
      inputTypes: ['dataset/tabular', 'json/array'],
      complexity: 'low'
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
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['visualization.create', 'visualization.interactive', 'chart.advanced', 'library.select'],
      inputTypes: ['dataset/tabular', 'pandas/dataframe'],
      outputTypes: ['chart/plotly', 'chart/matplotlib', 'chart/d3'],
      complexity: 'medium'
    },
    {
      name: 'plotly_generator',
      description: 'Generate interactive Plotly charts with advanced features',
      service: 'EnhancedVisualizationEngine',
      permissions: ['interactive_charts', 'web_dashboards', '3d_visualizations'],
      category: 'visualization_library',
      agentAccess: ['data_scientist'],
      // DEC-008: Capability metadata for dynamic discovery
      capabilities: ['visualization.interactive', 'chart.plotly', 'dashboard.web', 'visualization.3d'],
      inputTypes: ['dataset/tabular', 'json/array'],
      outputTypes: ['chart/plotly', 'html/interactive'],
      complexity: 'medium'
    },
    {
      name: 'matplotlib_generator',
      description: 'Generate publication-quality static charts with Matplotlib',
      service: 'EnhancedVisualizationEngine',
      permissions: ['static_charts', 'publication_quality', 'customizable'],
      category: 'visualization_library',
      agentAccess: ['data_scientist'],
      capabilities: ['visualization.create', 'chart.static', 'publication.plot'],
      inputTypes: ['dataset/tabular', 'pandas/dataframe'],
      complexity: 'medium'
    },
    {
      name: 'seaborn_generator',
      description: 'Generate beautiful statistical plots with Seaborn',
      service: 'EnhancedVisualizationEngine',
      permissions: ['statistical_plots', 'beautiful_defaults', 'pandas_integration'],
      category: 'visualization_library',
      agentAccess: ['data_scientist'],
      capabilities: ['visualization.create', 'chart.statistical', 'seaborn.plot'],
      inputTypes: ['dataset/tabular', 'pandas/dataframe'],
      complexity: 'medium'
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
      agentAccess: ['data_scientist'],
      capabilities: ['math.compute', 'linear.algebra', 'array.process'],
      inputTypes: ['numpy/array', 'list/float'],
      complexity: 'medium'
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
      agentAccess: ['data_scientist'],
      capabilities: ['spark.analysis', 'distributed.stats', 'bigdata.process'],
      inputTypes: ['spark/rdd', 'spark/dataframe'],
      complexity: 'high'
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
      name: 'presentation_generator',
      description: 'Generate audience-specific PowerPoint/Google Slides presentations from analysis results with user templates',
      service: 'PresentationGenerator',
      permissions: ['generate_presentations', 'use_custom_templates', 'audience_targeting', 'create_artifacts'],
      category: 'business',
      agentAccess: ['business_agent', 'project_manager', 'data_scientist'],
      inputSchema: {
        type: 'object',
        required: ['projectId', 'userId', 'audience'],
        properties: {
          projectId: { type: 'string', description: 'Project ID for analysis results' },
          userId: { type: 'string', description: 'User ID for template selection' },
          audience: {
            type: 'string',
            enum: ['non-tech', 'business', 'technical', 'consultation'],
            description: 'Target audience for presentation'
          },
          userTemplateId: { type: 'string', description: 'Optional: User-uploaded template ID' },
          includeMethodology: { type: 'boolean', description: 'Include technical methodology slides' },
          includeTechnicalDetails: { type: 'boolean', description: 'Include detailed technical information' },
          includeModelDiagnostics: { type: 'boolean', description: 'Include ML model performance metrics' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          artifactId: { type: 'string', description: 'Database artifact ID' },
          filePath: { type: 'string', description: 'Path to generated presentation' },
          slideCount: { type: 'number', description: 'Number of slides in presentation' },
          metadata: {
            type: 'object',
            properties: {
              audience: { type: 'string' },
              template: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    },
    {
      name: 'intelligent_data_transform',
      description: 'Intelligently transform and convert data formats for optimal storage and processing',
      service: 'IntelligentDataTransformer',
      permissions: ['data_transformation', 'format_conversion', 'data_optimization'],
      category: 'data_utility',
      agentAccess: ['data_engineer', 'data_scientist'],
      capabilities: ['data.convert', 'format.change', 'storage.optimize'],
      inputTypes: ['file/any'],
      complexity: 'medium'
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
      capabilities: ['agent.communicate', 'message.send', 'task.delegate'],
      inputTypes: ['message/text', 'task/delegation'],
      complexity: 'low',
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
      capabilities: ['workflow.evaluate', 'bottleneck.identify', 'quality.assess', 'progress.track'],
      inputTypes: ['project/id', 'criteria/evaluation'],
      outputTypes: ['evaluation/report', 'metrics/performance'],
      complexity: 'medium',
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
      capabilities: ['task.manage', 'workflow.coordinate', 'agent.assign', 'dependency.resolve'],
      inputTypes: ['project/plan', 'task/list'],
      outputTypes: ['task/created', 'assignment/status'],
      complexity: 'medium',
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
      capabilities: ['checkpoint.create', 'approval.manage', 'gate.control', 'user.notify'],
      inputTypes: ['project/id', 'checkpoint/config', 'artifacts/list'],
      outputTypes: ['checkpoint/created', 'approval/status'],
      complexity: 'medium',
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
      capabilities: ['progress.report', 'status.track', 'stakeholder.update', 'report.generate'],
      inputTypes: ['project/id', 'report/config'],
      outputTypes: ['report/progress', 'status/update'],
      complexity: 'low',
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
      capabilities: ['resource.allocate', 'usage.monitor', 'distribution.optimize', 'agent.coordinate'],
      inputTypes: ['project/id', 'resource/requirements'],
      outputTypes: ['allocation/plan', 'resource/status'],
      complexity: 'medium',
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
      capabilities: ['risk.identify', 'impact.analyze', 'mitigation.plan', 'blocker.detect'],
      inputTypes: ['project/id', 'risk/categories'],
      outputTypes: ['risk/assessment', 'mitigation/plan'],
      complexity: 'medium',
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
      capabilities: ['pipeline.build', 'etl.configure', 'transform.chain', 'job.schedule'],
      inputTypes: ['pipeline/config', 'transform/steps'],
      outputTypes: ['pipeline/created', 'job/scheduled'],
      complexity: 'high',
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
      capabilities: ['quality.monitor', 'anomaly.detect', 'schema.validate', 'metrics.track'],
      inputTypes: ['dataset/id', 'rules/quality'],
      outputTypes: ['quality/report', 'anomalies/list'],
      complexity: 'medium',
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
      capabilities: ['lineage.track', 'transform.audit', 'impact.analyze', 'data.trace'],
      inputTypes: ['dataset/id'],
      outputTypes: ['lineage/graph', 'transform/history'],
      complexity: 'medium',
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
      capabilities: ['schema.evolve', 'version.control', 'compatibility.check', 'migration.plan'],
      inputTypes: ['dataset/id', 'schema/changes'],
      outputTypes: ['schema/migrated', 'compatibility/report'],
      complexity: 'medium',
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
      capabilities: ['batch.execute', 'job.monitor', 'error.recover', 'process.large'],
      inputTypes: ['job/config', 'data/batch'],
      outputTypes: ['job/result', 'process/status'],
      complexity: 'high',
      inputSchema: {
        jobType: 'string',
        dataConfig: 'object',
        processingConfig: 'object',
        retryPolicy: 'object'
      }
    },
    // ========================================
    // DATA ENGINEER PII TOOLS (U2A2A2U Pattern)
    // ========================================
    {
      name: 'scan_pii_columns',
      description: 'Scan dataset columns to detect PII (Personally Identifiable Information) such as names, emails, phone numbers, SSNs, addresses, and other sensitive data',
      service: 'PIIScanner',
      permissions: ['scan_data', 'detect_pii', 'classify_sensitivity'],
      category: 'de_governance',
      agentAccess: ['data_engineer', 'project_manager'],
      capabilities: ['pii.detect', 'privacy.scan', 'data.classify', 'sensitivity.check'],
      inputTypes: ['project/id', 'dataset/id'],
      outputTypes: ['pii/report', 'columns/sensitive'],
      complexity: 'medium',
      inputSchema: {
        projectId: 'string',
        datasetId: 'string (optional - scans all datasets if not provided)',
        sensitivityLevel: 'string (strict|moderate|permissive) - default: moderate',
        includePatternMatching: 'boolean - use regex patterns for detection',
        includeMLDetection: 'boolean - use ML-based entity recognition'
      }
    },
    {
      name: 'apply_pii_exclusions',
      description: 'Apply PII exclusions to dataset by removing or masking specified columns. This persists the decision and filters data for downstream analysis.',
      service: 'PIIExclusionApplier',
      permissions: ['modify_data', 'apply_exclusions', 'persist_decisions'],
      category: 'de_governance',
      agentAccess: ['data_engineer', 'project_manager'],
      capabilities: ['pii.exclude', 'data.mask', 'privacy.apply', 'data.filter'],
      inputTypes: ['project/id', 'columns/list', 'strategy/mask'],
      outputTypes: ['data/filtered', 'exclusion/confirmed'],
      complexity: 'medium',
      inputSchema: {
        projectId: 'string',
        datasetId: 'string (optional)',
        excludedColumns: 'array of column names to exclude',
        maskingStrategy: 'string (remove|hash|redact) - default: remove',
        persistDecision: 'boolean - save to project metadata',
        userConfirmed: 'boolean - user has confirmed the exclusions'
      }
    },
    // ========================================
    // DATA ENGINEER DATA ELEMENTS VALIDATION TOOL (Phase 3 Fix)
    // ========================================
    {
      name: 'required_data_elements_validator',
      description: 'Validates that dataset columns map to required data elements from the requirementsDocument. Reports which elements are available, missing, or need transformation.',
      service: 'RequiredDataElementsValidator',
      permissions: ['validate_data', 'map_columns', 'report_gaps'],
      category: 'de_quality',
      agentAccess: ['data_engineer', 'project_manager'],
      capabilities: ['elements.validate', 'columns.map', 'gaps.identify', 'readiness.assess'],
      inputTypes: ['project/id', 'dataset/id'],
      outputTypes: ['validation/report', 'mapping/result', 'gaps/list'],
      complexity: 'medium',
      inputSchema: {
        projectId: 'string - Project ID to validate',
        datasetId: 'string (optional) - Specific dataset to validate, or all if omitted'
      },
      outputSchema: {
        valid: 'boolean - Overall validation status',
        totalElements: 'number - Total required data elements',
        mappedElements: 'number - Elements successfully mapped to columns',
        gaps: 'array - Elements with no matching column',
        recommendations: 'array - Suggestions for addressing gaps',
        elementMappings: 'array - Detailed mapping for each element',
        readinessScore: 'number (0-100) - Overall readiness for analysis'
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
      capabilities: ['knowledge.search', 'faq.retrieve', 'docs.query'],
      inputTypes: ['query/text'],
      complexity: 'low',
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
      capabilities: ['health.check', 'service.monitor', 'metrics.view', 'diagnostics.run'],
      inputTypes: ['service/list'],
      outputTypes: ['health/status', 'metrics/report'],
      complexity: 'low',
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
      capabilities: ['billing.query', 'subscription.view', 'usage.track'],
      inputTypes: ['user/id'],
      complexity: 'low',
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
      capabilities: ['issue.create', 'ticket.track', 'support.escalate', 'status.update'],
      inputTypes: ['user/id', 'issue/description'],
      outputTypes: ['ticket/created', 'issue/status'],
      complexity: 'low',
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
      capabilities: ['feature.explain', 'tutorial.provide', 'guide.user', 'example.show'],
      inputTypes: ['feature/name', 'user/level'],
      outputTypes: ['explanation/text', 'example/list'],
      complexity: 'low',
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
      capabilities: ['issue.diagnose', 'solution.provide', 'troubleshoot.guide', 'log.analyze'],
      inputTypes: ['user/id', 'problem/description', 'log/entries'],
      outputTypes: ['diagnosis/report', 'solution/steps'],
      complexity: 'medium',
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
      capabilities: ['research.industry', 'trends.analyze', 'regulations.check', 'business.context'],
      inputTypes: ['industry/name', 'topic/list'],
      outputTypes: ['research/report', 'trends/analysis'],
      complexity: 'medium',
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
      capabilities: ['metrics.analyze', 'kpi.calculate', 'benchmark.compare', 'business.intelligence'],
      inputTypes: ['metrics/data', 'kpi/definition'],
      outputTypes: ['analysis/metrics', 'benchmark/report'],
      complexity: 'medium',
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
      capabilities: ['roi.calculate', 'financial.analyze', 'projection.model', 'business.value'],
      inputTypes: ['financial/data', 'investment/amount'],
      outputTypes: ['roi/analysis', 'projection/forecast'],
      complexity: 'medium',
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
      capabilities: ['competitive.analyze', 'market.research', 'swot.analyze', 'positioning.assess'],
      inputTypes: ['industry/name', 'competitor/list'],
      outputTypes: ['competitive/analysis', 'market/report'],
      complexity: 'medium',
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
      capabilities: ['compliance.check', 'regulatory.analyze', 'gdpr.verify', 'risk.assess'],
      inputTypes: ['industry/name', 'data/types', 'region/code'],
      outputTypes: ['compliance/report', 'risk/assessment'],
      complexity: 'medium',
      inputSchema: {
        industry: 'string',
        regulations: 'array',
        dataTypes: 'array',
        region: 'string'
      }
    },
    // ========================================
    // BUSINESS AGENT CORE TOOLS (U2A2A2U Compliance)
    // These wrap BusinessAgent methods so analysis-execution routes through the tool registry
    // ========================================
    {
      name: 'ba_translate_results',
      description: 'Translate analysis results for a target audience (executive, technical, analyst) using Business Agent AI',
      service: 'BusinessAgent',
      permissions: ['translate_content', 'read_analysis'],
      category: 'ba_analysis',
      agentAccess: ['business_agent', 'project_manager', 'data_scientist'],
      capabilities: ['translate.results', 'audience.adapt', 'business.contextualize'],
      inputTypes: ['analysis/results'],
      outputTypes: ['translation/audience'],
      complexity: 'medium',
      inputSchema: {
        results: 'object { insights, recommendations, summary }',
        audience: 'string (executive | technical | analyst)',
        decisionContext: 'string (optional)'
      },
      outputSchema: {
        insights: 'array (translated)',
        recommendations: 'array (translated)',
        executiveSummary: 'string',
        translatedAt: 'string (ISO date)'
      }
    },
    {
      name: 'ba_assess_business_impact',
      description: 'Assess business impact of analysis findings against project goals using Business Agent AI',
      service: 'BusinessAgent',
      permissions: ['assess_impact', 'read_analysis'],
      category: 'ba_analysis',
      agentAccess: ['business_agent', 'project_manager'],
      capabilities: ['impact.assess', 'business.evaluate', 'goal.alignment'],
      inputTypes: ['analysis/results', 'goals/list'],
      outputTypes: ['impact/assessment'],
      complexity: 'medium',
      inputSchema: {
        goals: 'array of strings',
        analysisResults: 'object { insights, recommendations }',
        industry: 'string',
        analysisMethod: 'string (optional) — e.g. "rfm_analysis", "descriptive, correlation" for industry-specific impact branches'
      },
      outputSchema: {
        impactLevel: 'string (high | medium | low)',
        goalAlignment: 'array of { goal, alignment, findings }',
        actionItems: 'array of strings'
      }
    },
    {
      name: 'ba_generate_industry_insights',
      description: 'Generate industry-specific insights and recommendations using Business Agent domain knowledge',
      service: 'BusinessAgent',
      permissions: ['generate_insights', 'industry_analysis'],
      category: 'ba_research',
      agentAccess: ['business_agent', 'project_manager'],
      capabilities: ['insights.generate', 'industry.contextualize', 'business.recommend'],
      inputTypes: ['industry/context'],
      outputTypes: ['insights/industry'],
      complexity: 'medium',
      inputSchema: {
        industry: 'string',
        userGoals: 'array of strings',
        dataSchema: 'Record<string, any> (optional) — column names/types for industry template matching'
      },
      outputSchema: {
        industryInsights: 'array of { insight, relevance, recommendation }',
        benchmarks: 'object (optional)'
      }
    },
    // ========================================
    // BUSINESS DEFINITION REGISTRY TOOLS (Data Element Mapping)
    // ========================================
    {
      name: 'business_definition_lookup',
      description: 'Look up business metric definitions from the registry. Used to translate abstract data requirements (e.g., "engagement_score") into concrete transformation logic.',
      service: 'BusinessDefinitionRegistry',
      permissions: ['lookup_definitions', 'search_registry', 'get_transformations'],
      category: 'ba_data_mapping',
      agentAccess: ['business_agent', 'data_scientist', 'data_engineer', 'project_manager'],
      capabilities: ['definition.lookup', 'formula.retrieve', 'transformation.suggest', 'mapping.assist'],
      inputTypes: ['concept/name', 'industry/context'],
      outputTypes: ['definition/full', 'transformation/spec'],
      complexity: 'low',
      inputSchema: {
        operation: 'string (lookup|search|getByIndustry)',
        conceptName: 'string (for lookup)',
        industry: 'string (optional)',
        domain: 'string (optional)',
        projectId: 'string (optional)',
        includeGlobal: 'boolean (default: true)'
      },
      outputSchema: {
        found: 'boolean',
        definition: 'object (businessDescription, formula, componentFields, aggregationMethod)',
        confidence: 'number (0-1)',
        source: 'string (exact|pattern|synonym|ai_inferred|not_found)',
        alternatives: 'array (if not found)'
      }
    },
    {
      name: 'business_definition_create',
      description: 'Create or update business metric definitions in the registry. Used when new definitions are discovered or inferred.',
      service: 'BusinessDefinitionRegistry',
      permissions: ['create_definitions', 'update_definitions', 'learn_mappings'],
      category: 'ba_data_mapping',
      agentAccess: ['business_agent', 'research_agent', 'project_manager'],
      capabilities: ['definition.create', 'definition.update', 'mapping.learn'],
      inputTypes: ['definition/spec'],
      outputTypes: ['definition/created'],
      complexity: 'low',
      inputSchema: {
        operation: 'string (create|update|learnFromMapping)',
        conceptName: 'string',
        businessDescription: 'string',
        calculationType: 'string (direct|derived|aggregated|composite)',
        formula: 'string (optional)',
        componentFields: 'array (optional)',
        aggregationMethod: 'string (optional)',
        industry: 'string (optional)',
        domain: 'string (optional)',
        projectId: 'string (optional)'
      }
    },
    {
      name: 'researcher_definition_inference',
      description: 'Infer business definitions using AI when not found in registry. Used by Researcher Agent to fill gaps with external knowledge.',
      service: 'BusinessDefinitionRegistry',
      permissions: ['infer_definitions', 'external_research', 'ai_reasoning'],
      category: 'ra_data_mapping',
      agentAccess: ['research_agent', 'business_agent', 'data_scientist'],
      capabilities: ['definition.infer', 'ai.reason', 'external.research', 'gap.fill'],
      inputTypes: ['concept/name', 'context/business'],
      outputTypes: ['definition/inferred'],
      complexity: 'medium',
      inputSchema: {
        conceptName: 'string',
        context: 'string (business context from goals/questions)',
        industry: 'string (optional)',
        domain: 'string (optional)',
        datasetSchema: 'object (available columns, optional)',
        existingDefinitions: 'array (for pattern learning, optional)'
      },
      outputSchema: {
        success: 'boolean',
        definition: 'object (inferred definition)',
        confidence: 'number (0-1)',
        reasoning: 'string (how AI arrived at definition)'
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
      agentAccess: ['research_agent', 'business_agent', 'template_research_agent'],
      capabilities: ['web.search', 'content.extract', 'research.find', 'source.validate'],
      inputTypes: ['query/text', 'search/config'],
      outputTypes: ['research/results', 'content/summary'],
      complexity: 'medium',
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
      capabilities: ['document.scrape', 'data.extract', 'web.parse', 'content.structure'],
      inputTypes: ['url/web', 'selector/config'],
      outputTypes: ['data/structured', 'content/extracted'],
      complexity: 'medium',
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
      capabilities: ['template.create', 'workflow.design', 'template.save'],
      inputTypes: ['template/config', 'workflow/steps'],
      outputTypes: ['template/created'],
      complexity: 'medium',
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
      description: 'Manage, search, and retrieve templates from the library. Actions: search, retrieve, getByIndustry, getByJourneyType, recommend',
      service: 'TemplateLibraryManager',
      permissions: ['search_templates', 'retrieve_templates', 'update_templates', 'delete_templates'],
      category: 'ra_templates',
      agentAccess: ['research_agent', 'business_agent', 'project_manager'],
      capabilities: ['template.search', 'template.retrieve', 'template.recommend', 'template.manage'],
      inputTypes: ['search/criteria', 'template/id'],
      outputTypes: ['template/list', 'template/detail'],
      complexity: 'low',
      inputSchema: {
        action: 'string (search|retrieve|getByIndustry|getByJourneyType|recommend)',
        templateId: 'string (optional - required for retrieve)',
        searchCriteria: 'object (optional) - { industry, journeyType, persona, searchTerm, goals }',
        industry: 'string (optional)',
        goals: 'array (optional) - for recommend action'
      },
      outputSchema: {
        action: 'string',
        templates: 'array (for search actions)',
        template: 'object (for retrieve action)',
        recommendations: 'array (for recommend action)',
        totalCount: 'number'
      }
    },
    {
      name: 'academic_paper_finder',
      description: 'Search and retrieve academic papers and research publications',
      service: 'AcademicPaperFinder',
      permissions: ['search_academic', 'access_publications', 'citation_extraction'],
      category: 'ra_research',
      agentAccess: ['research_agent'],
      capabilities: ['academic.search', 'paper.retrieve', 'citation.extract', 'research.find'],
      inputTypes: ['query/text', 'database/list'],
      outputTypes: ['paper/list', 'citation/data'],
      complexity: 'medium',
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
      capabilities: ['trend.analyze', 'pattern.detect', 'forecast.generate', 'insight.extract'],
      inputTypes: ['topic/text', 'data/timeseries'],
      outputTypes: ['trend/analysis', 'forecast/prediction'],
      complexity: 'medium',
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
      capabilities: ['content.synthesize', 'summary.generate', 'insight.extract', 'report.create'],
      inputTypes: ['source/list', 'format/type'],
      outputTypes: ['summary/text', 'report/document'],
      complexity: 'medium',
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
      capabilities: ['file.ingest', 'csv.parse', 'schema.detect', 'data.extract'],
      inputTypes: ['file/csv'],
      outputTypes: ['data/rows', 'schema/definition'],
      complexity: 'low',
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
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      capabilities: ['file.ingest', 'excel.parse', 'schema.detect', 'sheet.extract'],
      inputTypes: ['file/excel'],
      outputTypes: ['data/rows', 'schema/definition'],
      complexity: 'low'
    },
    {
      name: 'json_file_ingestion',
      description: 'Ingest and process JSON files and APIs',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_json', 'detect_schema'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      capabilities: ['file.ingest', 'json.parse', 'schema.detect', 'api.consume'],
      inputTypes: ['file/json', 'api/response'],
      outputTypes: ['data/rows', 'schema/definition'],
      complexity: 'low'
    },
    {
      name: 'pdf_file_ingestion',
      description: 'Extract text and tables from PDF documents',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'parse_pdf', 'extract_text', 'extract_tables'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      capabilities: ['file.ingest', 'pdf.parse', 'text.extract', 'table.extract'],
      inputTypes: ['file/pdf'],
      outputTypes: ['text/extracted', 'table/data'],
      complexity: 'medium'
    },
    {
      name: 'image_file_ingestion',
      description: 'Process images with metadata extraction and OCR support',
      service: 'ComprehensiveDataIngestion',
      permissions: ['read_files', 'process_images', 'extract_metadata', 'ocr'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist'],
      capabilities: ['file.ingest', 'image.process', 'ocr.extract', 'metadata.read'],
      inputTypes: ['file/image'],
      outputTypes: ['text/ocr', 'metadata/exif'],
      complexity: 'medium'
    },
    {
      name: 'web_scraping',
      description: 'Scrape data from websites using Cheerio (static) or Puppeteer (JavaScript)',
      service: 'ComprehensiveDataIngestion',
      permissions: ['web_scraping', 'http_requests', 'parse_html'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'business_agent'],
      capabilities: ['web.scrape', 'html.parse', 'data.extract', 'page.navigate'],
      inputTypes: ['url/web', 'selector/css'],
      outputTypes: ['data/scraped', 'content/structured'],
      complexity: 'medium',
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
      capabilities: ['api.consume', 'http.request', 'auth.handle', 'pagination.follow'],
      inputTypes: ['url/api', 'auth/config'],
      outputTypes: ['data/json', 'response/api'],
      complexity: 'medium',
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
      capabilities: ['database.connect', 'sql.execute', 'postgresql.query', 'data.extract'],
      inputTypes: ['connection/postgresql', 'query/sql'],
      outputTypes: ['data/rows', 'result/query'],
      complexity: 'medium',
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
      capabilities: ['database.connect', 'sql.execute', 'mysql.query', 'data.extract'],
      inputTypes: ['connection/mysql', 'query/sql'],
      outputTypes: ['data/rows', 'result/query'],
      complexity: 'medium',
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
      capabilities: ['cloud.connect', 's3.read', 'file.download', 'data.extract'],
      inputTypes: ['connection/aws', 'bucket/path'],
      outputTypes: ['data/file', 'content/parsed'],
      complexity: 'medium',
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
      capabilities: ['cloud.connect', 'azure.read', 'blob.download', 'data.extract'],
      inputTypes: ['connection/azure', 'container/path'],
      outputTypes: ['data/file', 'content/parsed'],
      complexity: 'medium',
      inputSchema: {
        provider: 'azure',
        credentials: 'object (connectionString)',
        container: 'string',
        filePath: 'string'
      }
    },
    // ========================================
    // NEW PM AGENT TOOLS (FIX 4.1A)
    // ========================================
    {
      name: 'assess_data_quality',
      description: 'Assess data quality including completeness, consistency, and PII detection',
      service: 'DataQualityAssessor',
      permissions: ['assess_quality', 'scan_data'],
      category: 'data',
      agentAccess: ['project_manager', 'data_scientist', 'data_engineer'],
      capabilities: ['quality.assess', 'data.scan', 'pii.detect'],
      inputTypes: ['dataset/id'],
      complexity: 'medium'
    },
    {
      name: 'generate_plan_blueprint',
      description: 'Generate a step-by-step analysis plan based on user goals and data profile',
      service: 'PlanGenerator',
      permissions: ['generate_plan', 'analyze_requirements'],
      category: 'planning',
      agentAccess: ['project_manager'],
      capabilities: ['plan.generate', 'workflow.design'],
      inputTypes: ['user/goals', 'dataset/profile'],
      complexity: 'medium'
    },
    {
      name: 'cost_calculator',
      description: 'Calculate costs for analysis plans, consumption/overage costs, and provide cost breakdowns. Supports three operations: calculateAnalysisCost, calculateConsumptionCost, and calculatePlanCost',
      service: 'CostCalculator',
      permissions: ['calculate_costs', 'view_pricing'],
      category: 'business',
      agentAccess: ['business_agent', 'project_manager'],
      capabilities: ['cost.calculate', 'pricing.view', 'plan.cost', 'consumption.cost'],
      inputTypes: ['analysis/plan', 'consumption/data'],
      complexity: 'low',
      inputSchema: {
        operation: 'string (optional: "calculateAnalysisCost" | "calculateConsumptionCost" | "calculatePlanCost")',
        // For calculateAnalysisCost
        analysisType: 'string (optional)',
        recordCount: 'number (optional)',
        complexity: 'string (optional: "basic" | "intermediate" | "advanced")',
        // For calculateConsumptionCost
        consumptionType: 'string (optional)',
        volume: 'number (optional)',
        // For calculatePlanCost
        analysisTypes: 'array of strings (optional)'
      },
      outputSchema: {
        operation: 'string',
        cost: 'number (for single cost)',
        totalCost: 'number (for plan cost)',
        breakdown: 'object (for plan cost)',
        currency: 'string'
      },
      examples: [{
        name: 'Calculate analysis cost',
        description: 'Calculate cost for a single analysis type',
        input: {
          operation: 'calculateAnalysisCost',
          analysisType: 'statistical',
          recordCount: 10000,
          complexity: 'basic'
        },
        expectedOutput: {
          operation: 'calculateAnalysisCost',
          cost: { baseCost: 10, dataSizeCost: 0.5, complexityCost: 0, totalCost: 10.5, currency: 'USD' }
        }
      }]
    },
    {
      name: 'required_data_elements_tool',
      description: 'Define analysis requirements and map data elements to source datasets. Supports two operations: defineRequirements (Phase 1) and mapDatasetToRequirements (Phase 2)',
      service: 'RequiredDataElementsTool',
      permissions: ['define_requirements', 'map_data_elements', 'analyze_requirements'],
      category: 'planning',
      agentAccess: ['data_scientist', 'data_engineer', 'project_manager'],
      capabilities: ['requirements.define', 'elements.map', 'analysis.plan', 'transformation.suggest'],
      inputTypes: ['user/goals', 'user/questions', 'dataset/metadata'],
      complexity: 'medium',
      inputSchema: {
        operation: 'string (optional: "defineRequirements" | "mapDatasetToRequirements")',
        projectId: 'string',
        userGoals: 'array of strings (for defineRequirements)',
        userQuestions: 'array of strings (for defineRequirements)',
        datasetMetadata: 'object (optional, for defineRequirements)',
        document: 'DataRequirementsMappingDocument (optional, for mapDatasetToRequirements)',
        dataset: 'object with { fileName, rowCount, schema, preview, piiFields? } (optional, for mapDatasetToRequirements)'
      },
      outputSchema: {
        document: 'DataRequirementsMappingDocument with analysisPath, requiredDataElements, questionAnswerMapping, transformationPlan'
      },
      examples: [{
        name: 'Define requirements from goals',
        description: 'Generate analysis requirements from user goals and questions',
        input: {
          operation: 'defineRequirements',
          projectId: 'proj_123',
          userGoals: ['Analyze customer engagement'],
          userQuestions: ['What factors influence customer retention?']
        },
        expectedOutput: {
          documentId: 'req-doc-abc123',
          analysisPath: [{ analysisId: 'analysis_1', analysisName: 'Customer Engagement Analysis' }],
          requiredDataElements: [{ elementId: 'elem_1', elementName: 'Engagement Score' }],
          questionAnswerMapping: [{ questionId: 'q1', questionText: 'What factors influence customer retention?' }]
        }
      }]
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
          data: [{ id: 1, name: 'Customer 1' }],
          recordCount: 5000
        }
      }],
      capabilities: ['data.ingest', 'cloud.gcp', 'storage.read'],
      inputTypes: ['cloud/gcp', 'file/path'],
      complexity: 'medium'
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
          query: { status: 'completed', created_at: { $gte: new Date('2024-01-01') } },
          limit: 5000
        },
        expectedOutput: {
          data: [{ _id: '507f1f77bcf86cd799439011', status: 'completed', userId: 123 }],
          recordCount: 5000
        }
      }],
      capabilities: ['data.ingest', 'database.mongo', 'query.nosql'],
      inputTypes: ['database/mongodb', 'json/query'],
      complexity: 'medium'
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
          variables: { limit: 100 },
          auth: { type: 'bearer', token: '...' }
        },
        expectedOutput: {
          success: true,
          data: [{ id: 1, name: 'John', email: 'john@example.com' }],
          recordCount: 100
        }
      }],
      capabilities: ['data.ingest', 'api.graphql', 'query.graph'],
      inputTypes: ['api/graphql', 'text/query'],
      complexity: 'medium'
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
          data: [{ timestamp: '2025-10-22T10:30:00Z', event: 'user_action', userId: 123 }],
          recordCount: 500
        }
      }],
      capabilities: ['data.stream', 'protocol.websocket', 'realtime.ingest'],
      inputTypes: ['stream/websocket', 'json/message'],
      complexity: 'high'
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
      }],
      capabilities: ['data.extract', 'image.ocr', 'text.recognize'],
      inputTypes: ['file/image', 'image/buffer'],
      complexity: 'medium'
    },
    {
      name: 'web_scraping_advanced',
      description: 'Advanced web scraping with dynamic rendering and anti-bot handling',
      service: 'WebScraperService',
      permissions: ['internet_access', 'scrape_web', 'read_dom'],
      category: 'data_ingestion',
      agentAccess: ['data_engineer', 'data_scientist', 'research_agent'],
      capabilities: ['data.scrape', 'web.crawl', 'html.parse'],
      inputTypes: ['web/url'],
      complexity: 'high'
    },
    // NOTE: api_data_ingestion already registered earlier with full capability metadata
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
            { data: [{ id: 1, name: 'A' }], alias: 'left' },
            { data: [{ id: 1, value: 100 }], alias: 'right' }
          ],
          parameters: {
            leftKey: 'id',
            rightKey: 'id',
            joinType: 'inner'
          }
        },
        expectedOutput: {
          success: true,
          data: [{ id: 1, name: 'A', value: 100 }],
          metadata: { technology: 'javascript', inputRows: 2, outputRows: 1 }
        }
      }],
      capabilities: ['data.transform', 'intelligent.process', 'dynamic.execution', 'data.convert', 'format.change', 'transform.chain'],
      inputTypes: ['dataset/any', 'file/any'],
      outputTypes: ['dataset/transformed', 'file/converted'],
      complexity: 'high'
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
          data: [{ id: 1, name: 'test' }]
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
      }],
      capabilities: ['data.convert', 'format.change', 'storage.optimize'],
      inputTypes: ['file/csv', 'file/json', 'file/excel', 'file/parquet', 'file/avro'],
      complexity: 'low'
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
          leftData: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }],
          rightData: [{ customer_id: 1, order: 'A' }, { customer_id: 1, order: 'B' }],
          leftKey: 'id',
          rightKey: 'customer_id',
          joinType: 'left'
        },
        expectedOutput: {
          success: true,
          data: [
            { id: 1, name: 'John', order: 'A' },
            { id: 1, name: 'John', order: 'B' },
            { id: 2, name: 'Jane', order: null }
          ]
        }
      }],
      capabilities: ['data.join', 'merge.datasets', 'relational.combine'],
      inputTypes: ['dataset/tabular'],
      complexity: 'high'
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
            { region: 'North', sales: 100 },
            { region: 'North', sales: 150 },
            { region: 'South', sales: 200 }
          ],
          groupBy: 'region',
          aggregations: [{ column: 'sales', functions: ['sum', 'avg', 'count'] }]
        },
        expectedOutput: {
          success: true,
          data: [
            { region: 'North', sales_sum: 250, sales_avg: 125, sales_count: 2 },
            { region: 'South', sales_sum: 200, sales_avg: 200, sales_count: 1 }
          ]
        }
      }],
      capabilities: ['data.aggregate', 'group.by', 'summary.stats'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
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
            { product: 'A', month: 'Jan', sales: 100 },
            { product: 'A', month: 'Feb', sales: 150 },
            { product: 'B', month: 'Jan', sales: 200 }
          ],
          index: 'product',
          columns: 'month',
          values: 'sales',
          aggFunc: 'sum'
        },
        expectedOutput: {
          success: true,
          data: [
            { product: 'A', Jan_sales: 100, Feb_sales: 150 },
            { product: 'B', Jan_sales: 200, Feb_sales: null }
          ]
        }
      }],
      capabilities: ['data.pivot', 'table.reshape', 'cross.tabulate'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
    },
    {
      name: 'preprocess_survey',
      description: 'Detect and preprocess survey-type datasets. Identifies question columns, extracts topic labels, encodes Likert-scale responses, and separates metadata from question columns.',
      service: 'SurveyPreprocessor',
      permissions: ['preprocess_data', 'reshape_data'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      inputSchema: {
        mode: '"detect" (analyze structure) or "transform" (apply preprocessing)',
        datasetId: 'string (dataset ID to analyze)',
        transformations: 'array of { type: "rename_to_topics" | "encode_likert" | "create_topic_groups" } (required for transform mode)'
      },
      examples: [{
        name: 'Detect survey structure',
        description: 'Analyze if a dataset has survey-like structure with question columns',
        input: { mode: 'detect', datasetId: 'abc123' },
        expectedOutput: {
          success: true,
          is_survey: true,
          confidence: 0.85,
          question_columns: [{ original_name: 'How comfortable do you feel...', topic_label: 'Comfort Level' }],
          recommended_transformations: [{ type: 'rename_to_topics', description: 'Rename question columns to short topic labels' }]
        }
      }],
      capabilities: ['survey.detect', 'survey.preprocess', 'likert.encode', 'topic.extract'],
      inputTypes: ['dataset/survey'],
      complexity: 'medium'
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
      },
      capabilities: ['data.dedup', 'clean.duplicates', 'rows.unique'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
    },
    {
      name: 'add_calculated_column',
      description: 'Add computed columns using expressions or functions',
      service: 'IntelligentDataTransformer',
      permissions: ['calculate_fields', 'feature_engineering'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist'],
      capabilities: ['data.calculate', 'feature.create', 'column.add'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
    },
    {
      name: 'filter_transform',
      description: 'Filter rows based on conditions with optimized evaluation',
      service: 'IntelligentDataTransformer',
      permissions: ['filter_data', 'query_data'],
      category: 'data_transformation',
      agentAccess: ['data_engineer', 'data_scientist', 'business_agent'],
      capabilities: ['data.filter', 'rows.select', 'condition.apply'],
      inputTypes: ['dataset/tabular'],
      complexity: 'medium'
    },
    // NOTE: scan_pii_columns and apply_pii_exclusions already registered earlier with full capability metadata

    // ========================================
    // NATURAL LANGUAGE TRANSLATION TOOLS
    // ========================================
    {
      name: 'translate_schema',
      description: 'Translate data schema fields to business-friendly descriptions for target audience',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content', 'read_schema'],
      category: 'ba_analysis',
      agentAccess: ['business_agent', 'project_manager', 'customer_support'],
      capabilities: ['translate.schema', 'nlp.explain', 'audience.adapt'],
      inputSchema: {
        schema: 'object (field definitions)',
        audience: 'string (executive | business | technical | general)',
        industry: 'string (optional)',
        projectName: 'string (optional)'
      },
      outputSchema: {
        translations: 'array of { originalField, businessName, description, dataType, businessContext }'
      },
      complexity: 'medium'
    },
    {
      name: 'translate_results',
      description: 'Translate analysis results to audience-appropriate language with actionable insights',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content', 'read_analysis'],
      category: 'ba_analysis',
      agentAccess: ['business_agent', 'project_manager', 'data_scientist'],
      capabilities: ['translate.results', 'nlp.summarize', 'audience.adapt'],
      inputSchema: {
        results: 'object (analysis results)',
        audience: 'string (executive | business | technical | general)',
        industry: 'string (optional)',
        projectName: 'string (optional)'
      },
      outputSchema: {
        executiveSummary: 'string',
        keyFindings: 'array of { finding, impact, confidence, actionable }',
        recommendations: 'array of { action, rationale, priority, expectedOutcome }',
        nextSteps: 'array of strings',
        caveats: 'array of strings (optional)'
      },
      complexity: 'medium'
    },
    {
      name: 'translate_quality',
      description: 'Translate data quality metrics to business impact assessment',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content', 'read_quality'],
      category: 'ba_analysis',
      agentAccess: ['business_agent', 'project_manager', 'data_engineer'],
      capabilities: ['translate.quality', 'nlp.assess', 'audience.adapt'],
      inputSchema: {
        qualityReport: 'object (quality metrics)',
        audience: 'string (executive | business | technical | general)',
        industry: 'string (optional)'
      },
      outputSchema: {
        overallAssessment: 'string',
        businessImpact: 'string',
        trustLevel: 'string (high | medium | low)',
        issues: 'array of { issue, businessRisk, recommendation }',
        readyForAnalysis: 'boolean',
        confidence: 'number (0-100)'
      },
      complexity: 'low'
    },
    {
      name: 'translate_error',
      description: 'Translate technical error messages to user-friendly explanations',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content'],
      category: 'cs_support',
      agentAccess: ['customer_support', 'project_manager', 'business_agent'],
      capabilities: ['translate.error', 'nlp.simplify', 'user.help'],
      inputSchema: {
        error: 'string (error message)',
        audience: 'string (executive | business | technical | general)'
      },
      outputSchema: {
        message: 'string (user-friendly explanation)',
        suggestion: 'string (what user can do)',
        technical: 'string (original error for technical audience)'
      },
      complexity: 'low'
    },
    {
      name: 'clarify_term',
      description: 'Explain a technical term in accessible language for the target audience',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content'],
      category: 'cs_knowledge',
      agentAccess: ['customer_support', 'business_agent', 'project_manager'],
      capabilities: ['nlp.clarify', 'term.explain', 'audience.adapt'],
      inputSchema: {
        term: 'string (technical term)',
        context: 'string (usage context)',
        audience: 'string (executive | business | technical | general)'
      },
      outputSchema: {
        explanation: 'string',
        example: 'string (optional real-world example)'
      },
      complexity: 'low'
    },
    {
      name: 'check_grammar',
      description: 'Check and correct grammar in generated text',
      service: 'NaturalLanguageTranslator',
      permissions: ['translate_content'],
      category: 'utility',
      agentAccess: ['business_agent', 'project_manager', 'customer_support'],
      capabilities: ['nlp.grammar', 'text.correct', 'quality.improve'],
      inputSchema: {
        text: 'string (text to check)'
      },
      outputSchema: {
        corrected: 'string',
        changes: 'array of strings (list of corrections made)'
      },
      complexity: 'low'
    },

    // ========================================
    // CLARIFICATION TOOLS
    // ========================================
    {
      name: 'detect_ambiguities',
      description: 'Analyze user input for ambiguities and generate clarifying questions',
      service: 'ClarificationService',
      permissions: ['analyze_input', 'generate_questions'],
      category: 'pm_communication',
      agentAccess: ['project_manager', 'business_agent', 'data_scientist'],
      capabilities: ['input.analyze', 'ambiguity.detect', 'question.generate'],
      inputSchema: {
        userInput: 'string (user goal, question, or description)',
        context: 'object { industry?, journeyType, existingColumns?, userRole?, projectGoals? }',
        inputType: 'string (goal | question | description | data_element | analysis_type)'
      },
      outputSchema: {
        hasAmbiguities: 'boolean',
        questions: 'array of ClarificationQuestion objects',
        confidenceScore: 'number (0-1)',
        suggestedRevision: 'string (optional clearer version)'
      },
      complexity: 'medium'
    },
    {
      name: 'create_clarification_request',
      description: 'Create and store a clarification request for user response',
      service: 'ClarificationService',
      permissions: ['create_checkpoint', 'update_project'],
      category: 'pm_coordination',
      agentAccess: ['project_manager'],
      capabilities: ['clarification.create', 'checkpoint.store', 'user.notify'],
      inputSchema: {
        projectId: 'string',
        questions: 'array of ClarificationQuestion objects',
        originalInput: 'string',
        inputType: 'string (goal | question | description | data_element | analysis_type)'
      },
      outputSchema: {
        projectId: 'string',
        questions: 'array',
        status: 'string (pending)',
        expiresAt: 'string (ISO date)'
      },
      complexity: 'low'
    },
    {
      name: 'get_pending_clarifications',
      description: 'Get pending clarification questions for a project',
      service: 'ClarificationService',
      permissions: ['read_project'],
      category: 'pm_coordination',
      agentAccess: ['project_manager', 'business_agent'],
      capabilities: ['clarification.read', 'status.check'],
      inputSchema: {
        projectId: 'string'
      },
      outputSchema: {
        hasPending: 'boolean',
        request: 'ClarificationRequest object or null'
      },
      complexity: 'low'
    },
    {
      name: 'submit_clarification_answers',
      description: 'Submit user answers to clarification questions and get revised input',
      service: 'ClarificationService',
      permissions: ['update_project'],
      category: 'pm_coordination',
      agentAccess: ['project_manager'],
      capabilities: ['clarification.submit', 'input.revise'],
      inputSchema: {
        projectId: 'string',
        answers: 'array of { questionId, answer }'
      },
      outputSchema: {
        success: 'boolean',
        revisedInput: 'string (optional)',
        remainingQuestions: 'array (if required questions unanswered)'
      },
      complexity: 'low'
    },
    {
      name: 'validate_user_input',
      description: 'Quick validation of user input without creating a formal request',
      service: 'ClarificationService',
      permissions: ['analyze_input'],
      category: 'utility',
      agentAccess: ['project_manager', 'business_agent', 'data_scientist', 'customer_support'],
      capabilities: ['input.validate', 'quality.check'],
      inputSchema: {
        input: 'string',
        context: 'object { industry?, journeyType, existingColumns?, userRole? }',
        inputType: 'string (goal | question | description)'
      },
      outputSchema: {
        isValid: 'boolean',
        issues: 'array of strings (blocking issues)',
        suggestions: 'array of strings (optional improvements)'
      },
      complexity: 'low'
    },
  ]);

  console.log('✅ Core MCP tools registered (including advanced data ingestion, transformation, translation & clarification tools)');
}

// ==========================================
// TOOL USAGE HELPERS
// ==========================================

/**
 * Create error result for tools not yet implemented
 * FIX: Production Readiness - Return error instead of success for unimplemented tools
 * This ensures agents know the tool didn't work and can handle the failure appropriately
 */
function createPlaceholderResult(executionContext: ToolExecutionContext, toolName: string): ToolExecutionResult {
  console.warn(`[MCP-REGISTRY] Tool "${toolName}" called but not implemented - returning error`);
  return {
    executionId: executionContext.executionId,
    toolId: toolName,
    status: 'error',
    error: `Tool "${toolName}" is not yet implemented. Please use an alternative tool or contact support.`,
    result: {
      message: `Tool ${toolName} is not implemented`,
      error: 'TOOL_NOT_IMPLEMENTED',
      note: 'This tool needs a real implementation before it can be used',
      timestamp: new Date()
    },
    metrics: {
      duration: 1,
      resourcesUsed: { cpu: 0, memory: 0, storage: 0 },
      cost: 0
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
  context?: { userId?: string; projectId?: string }
): Promise<ToolExecutionResult> {
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

  // P2-4 FIX: Emit dynamic tool execution event for real-time UI updates
  try {
    const brokerModule = await import('./agents/message-broker');
    const broker = brokerModule.getMessageBroker();
    broker.emit('message:status', {
      type: 'status',
      from: agentId,
      to: 'system',
      payload: {
        status: 'tool_executing',
        currentTask: `Using ${tool.name}${tool.description ? `: ${tool.description.substring(0, 60)}` : ''}`,
        toolName,
        projectId: context?.projectId,
        userId: context?.userId,
      },
      timestamp: new Date(),
    });
  } catch { /* non-blocking */ }

  // Import tool analytics service
  const analyticsModule = await import('./tool-analytics');
  const toolAnalyticsService = analyticsModule.toolAnalyticsService;

  // Start tracking execution
  const tracking = toolAnalyticsService.startExecution({
    toolId: toolName,
    agentId,
    userId: context?.userId,
    projectId: context?.projectId
  });

  // Import real tool handlers
  const handlersModule = await import('./real-tool-handlers');
  const {
    statisticalAnalyzerHandler,
    mlPipelineHandler,
    visualizationEngineHandler
  } = handlersModule;

  // Create execution context
  const executionContext: ToolExecutionContext = {
    executionId: tracking.executionId,
    agentId,
    userId: context?.userId,
    projectId: context?.projectId,
    timestamp: new Date()
  };

  // Route to appropriate real handler based on tool name
  try {
    // Initialize with placeholder to satisfy TypeScript - will be overwritten by actual handler
    let result: ToolExecutionResult = createPlaceholderResult(executionContext, toolName);

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
      case 'scan_pii_columns':
      case 'apply_pii_exclusions':
        const agentToolHandlers = await import('./agent-tool-handlers');
        const pmHandlers = agentToolHandlers.pmToolHandlers;
        const deHandlers = agentToolHandlers.dataEngineerToolHandlers;
        switch (toolName) {
          case 'agent_communication':
            result = await pmHandlers.handleAgentCommunication(input, executionContext);
            break;
          case 'workflow_evaluator':
            result = await pmHandlers.handleWorkflowEvaluator(input, executionContext);
            break;
          case 'task_coordinator':
            result = await pmHandlers.handleTaskCoordinator(input, executionContext);
            break;
          case 'checkpoint_manager':
            result = await pmHandlers.handleCheckpointManager(input, executionContext);
            break;
          case 'progress_reporter':
            result = await pmHandlers.handleProgressReporter(input, executionContext);
            break;
          case 'resource_allocator':
            result = await pmHandlers.handleResourceAllocator(input, executionContext);
            break;
          case 'scan_pii_columns':
          case 'apply_pii_exclusions':
            // These are handled by Data Scientist / Data Engineer logic mostly, but if called by PM context:
            if (toolName === 'scan_pii_columns') {
              result = await deHandlers.handleScanPIIColumns(input, executionContext);
            } else {
              result = await deHandlers.handleApplyPIIExclusions(input, executionContext);
            }
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
        const csAgentHandlers = await import('./agent-tool-handlers');
        const csHandlers = csAgentHandlers.customerSupportToolHandlers;
        switch (toolName) {
          case 'platform_knowledge_base':
            result = await csHandlers.handleKnowledgeBaseSearch(input, executionContext);
            break;
          case 'service_health_checker':
            result = await csHandlers.handleServiceHealthCheck(input, executionContext);
            break;
          case 'billing_query_handler':
            result = await csHandlers.handleBillingQuery(input, executionContext);
            break;
          case 'user_issue_tracker':
            result = await csHandlers.handleUserIssueTracker(input, executionContext);
            break;
          case 'feature_explainer':
            result = await csHandlers.handleFeatureExplainer(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // BUSINESS AGENT CORE TOOLS (U2A2A2U Compliance)
      // ========================================
      case 'ba_translate_results': {
        try {
          const { BusinessAgent } = await import('./business-agent');
          const ba = new BusinessAgent();
          const baTranslation = await ba.translateResults({
            results: input.results,
            audience: input.audience,
            decisionContext: input.decisionContext
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: baTranslation,
            metrics: { duration: 200, resourcesUsed: { cpu: 20, memory: 100, storage: 0 }, cost: 0.02 }
          };
        } catch (baErr: any) {
          console.error('ba_translate_results failed:', baErr);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: baErr.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;
      }

      case 'ba_assess_business_impact': {
        try {
          const { BusinessAgent } = await import('./business-agent');
          const ba = new BusinessAgent();
          // Method expects (goals, proposedApproach, industry) where proposedApproach.method
          // is checked for industry-specific branches (e.g., 'rfm_analysis' for retail).
          // Merge analysisResults with method field so both code paths work.
          const proposedApproach = {
            ...input.analysisResults,
            method: input.analysisMethod || input.analysisResults?.method
          };
          const baImpact = await ba.assessBusinessImpact(
            input.goals,
            proposedApproach,
            input.industry
          );
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: baImpact,
            metrics: { duration: 200, resourcesUsed: { cpu: 20, memory: 100, storage: 0 }, cost: 0.02 }
          };
        } catch (baErr: any) {
          console.error('ba_assess_business_impact failed:', baErr);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: baErr.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;
      }

      case 'ba_generate_industry_insights': {
        try {
          const { BusinessAgent } = await import('./business-agent');
          const ba = new BusinessAgent();
          // Pass full BusinessContext: method expects { industry, dataSchema, userGoals, ... }
          const baInsights = await ba.generateIndustryInsights({
            industry: input.industry,
            userGoals: input.userGoals,
            dataSchema: input.dataSchema
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: baInsights,
            metrics: { duration: 150, resourcesUsed: { cpu: 15, memory: 80, storage: 0 }, cost: 0.015 }
          };
        } catch (baErr: any) {
          console.error('ba_generate_industry_insights failed:', baErr);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: baErr.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;
      }

      // ========================================
      // BUSINESS AGENT TOOLS
      // ========================================
      case 'cost_calculator':
      case 'industry_research':
      case 'business_metric_analyzer':
      case 'roi_calculator':
      case 'competitive_analyzer':
      case 'compliance_checker':
        const bizAgentHandlers = await import('./agent-tool-handlers');
        const bizHandlers = bizAgentHandlers.businessAgentToolHandlers;
        switch (toolName) {
          case 'cost_calculator':
            result = await bizHandlers.handleCostCalculator(input, executionContext);
            break;
          case 'industry_research':
            result = await bizHandlers.handleIndustryResearch(input, executionContext);
            break;
          case 'roi_calculator':
            result = await bizHandlers.handleROICalculator(input, executionContext);
            break;
          case 'competitive_analyzer':
            result = await bizHandlers.handleCompetitiveAnalyzer(input, executionContext);
            break;
          case 'business_metric_analyzer':
            result = await bizHandlers.handleBusinessMetricAnalyzer(input, executionContext);
            break;
          case 'compliance_checker':
            result = await bizHandlers.handleComplianceChecker(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // BUSINESS DEFINITION REGISTRY TOOLS (Data Element Mapping)
      // ========================================
      case 'business_definition_lookup':
      case 'business_definition_create':
      case 'researcher_definition_inference':
        const { businessDefinitionRegistry } = await import('./business-definition-registry');
        const defStartTime = Date.now();

        try {
          if (toolName === 'business_definition_lookup') {
            const operation = input.operation || 'lookup';

            if (operation === 'lookup') {
              const lookupResult = await businessDefinitionRegistry.lookupDefinition(
                input.conceptName,
                {
                  industry: input.industry,
                  domain: input.domain,
                  projectId: input.projectId,
                  includeGlobal: input.includeGlobal !== false
                }
              );

              result = {
                executionId: executionContext.executionId,
                toolId: toolName,
                status: 'success',
                result: lookupResult,
                metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 1, memory: 20, storage: 0 }, cost: 0.01 }
              };
            } else if (operation === 'search') {
              const searchResults = await businessDefinitionRegistry.searchDefinitions({
                conceptName: input.conceptName,
                industry: input.industry,
                domain: input.domain,
                projectId: input.projectId,
                includeGlobal: input.includeGlobal !== false
              });

              result = {
                executionId: executionContext.executionId,
                toolId: toolName,
                status: 'success',
                result: { definitions: searchResults, count: searchResults.length },
                metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 1, memory: 25, storage: 0 }, cost: 0.01 }
              };
            } else if (operation === 'getByIndustry') {
              await businessDefinitionRegistry.seedIndustryDefinitions(input.industry || 'general');
              const searchResults = await businessDefinitionRegistry.searchDefinitions({
                industry: input.industry || 'general'
              });

              result = {
                executionId: executionContext.executionId,
                toolId: toolName,
                status: 'success',
                result: { definitions: searchResults, count: searchResults.length, seeded: true },
                metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 2, memory: 30, storage: 5 }, cost: 0.02 }
              };
            } else {
              throw new Error(`Unknown operation: ${operation}`);
            }
          } else if (toolName === 'business_definition_create') {
            const operation = input.operation || 'create';

            if (operation === 'create') {
              const created = await businessDefinitionRegistry.createDefinition({
                conceptName: input.conceptName,
                displayName: input.displayName || input.conceptName,
                businessDescription: input.businessDescription,
                calculationType: input.calculationType || 'derived',
                formula: input.formula,
                componentFields: input.componentFields,
                aggregationMethod: input.aggregationMethod,
                industry: input.industry,
                domain: input.domain,
                projectId: input.projectId,
                sourceType: 'manual',
                sourceAgentId: executionContext.agentId || 'unknown'
              });

              result = {
                executionId: executionContext.executionId,
                toolId: toolName,
                status: 'success',
                result: { created: true, definition: created },
                metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 1, memory: 20, storage: 5 }, cost: 0.02 }
              };
            } else if (operation === 'learnFromMapping') {
              await businessDefinitionRegistry.learnFromMapping({
                conceptName: input.conceptName,
                mappedFields: input.mappedFields || [],
                formula: input.formula || '',
                projectId: input.projectId || '',
                industry: input.industry,
                success: input.success !== false
              });

              result = {
                executionId: executionContext.executionId,
                toolId: toolName,
                status: 'success',
                result: { learned: true, conceptName: input.conceptName },
                metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 1, memory: 15, storage: 2 }, cost: 0.01 }
              };
            } else {
              throw new Error(`Unknown operation: ${operation}`);
            }
          } else if (toolName === 'researcher_definition_inference') {
            const inferred = await businessDefinitionRegistry.inferDefinition({
              conceptName: input.conceptName,
              context: input.context,
              industry: input.industry,
              domain: input.domain,
              datasetSchema: input.datasetSchema,
              existingDefinitions: input.existingDefinitions
            });

            result = {
              executionId: executionContext.executionId,
              toolId: toolName,
              status: 'success',
              result: {
                success: !!inferred,
                definition: inferred,
                confidence: inferred?.confidence || 0,
                reasoning: inferred ? 'Definition inferred from AI analysis and saved to registry' : 'Could not infer definition'
              },
              metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 3, memory: 50, storage: 5 }, cost: 0.05 }
            };
          }
        } catch (defError: any) {
          console.error(`❌ [Definition Registry] Error in ${toolName}:`, defError.message);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            result: { error: defError.message },
            metrics: { duration: Date.now() - defStartTime, resourcesUsed: { cpu: 1, memory: 10, storage: 0 }, cost: 0.01 }
          };
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
        const resAgentHandlers = await import('./agent-tool-handlers');
        const resHandlers = resAgentHandlers.researchAgentToolHandlers;
        switch (toolName) {
          case 'web_researcher':
            result = await resHandlers.handleWebResearch(input, executionContext);
            break;
          case 'template_creator':
            result = await resHandlers.handleTemplateCreator(input, executionContext);
            break;
          case 'template_library_manager':
            result = await resHandlers.handleTemplateLibraryManager(input, executionContext);
            break;
          case 'document_scraper':
            result = await resHandlers.handleDocumentScraper(input, executionContext);
            break;
          case 'academic_paper_finder':
            result = await resHandlers.handleAcademicPaperFinder(input, executionContext);
            break;
          case 'trend_analyzer':
            result = await resHandlers.handleTrendAnalyzer(input, executionContext);
            break;
          case 'content_synthesizer':
            result = await resHandlers.handleContentSynthesizer(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // DATA SCIENTIST TOOLS
      // ========================================
      case 'required_data_elements_tool':
        const dsAgentHandlers = await import('./agent-tool-handlers');
        const dsHandlers = dsAgentHandlers.dataScientistToolHandlers;
        result = await dsHandlers.handleRequiredDataElements(input, executionContext);
        break;

      // ========================================
      // DATA ENGINEER TOOLS
      // ========================================
      case 'data_pipeline_builder':
      case 'data_quality_monitor':
      case 'apply_transformations':
      case 'data_lineage_tracker':
      case 'schema_evolution_manager':
      case 'batch_processor':
        const deAgentHandlers = await import('./agent-tool-handlers');
        const deToolHandlers = deAgentHandlers.dataEngineerToolHandlers;
        switch (toolName) {
          case 'data_pipeline_builder':
            result = await deToolHandlers.handleDataPipelineBuilder(input, executionContext);
            break;
          case 'data_quality_monitor':
            result = await deToolHandlers.handleDataQualityMonitor(input, executionContext);
            break;
          case 'apply_transformations':
            result = await deToolHandlers.handleApplyTransformations(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // NOTE: scan_pii_columns and apply_pii_exclusions are handled in the
      // PM Tools fall-through case above (lines 2378-2379). The handlers
      // are in agent-tool-handlers.ts dataEngineerToolHandlers.



      // ========================================
      // COMPREHENSIVE ANALYSIS & FORMATTING TOOLS
      // ========================================
      case 'comprehensive_analysis':
        // Use the DataScienceOrchestrator for full analysis pipeline
        // U2A2A2U: Pass through ALL input fields to support per-analysis execution path
        try {
          const dsModule = await import('./data-science-orchestrator');
          const dsResult = await dsModule.dataScienceOrchestrator.executeWorkflow({
            projectId: input.projectId,
            userId: input.userId || executionContext.userId,
            analysisTypes: input.analysisTypes || ['descriptive', 'correlation'],
            userGoals: input.userGoals || [],
            userQuestions: input.userQuestions || [],
            datasetIds: input.datasetIds,
            columnsToExclude: input.columnsToExclude,
            requiredColumns: input.requiredColumns,
            requiredColumnTypes: input.requiredColumnTypes,
            analysisPreparation: input.analysisPreparation,
            computeEngine: input.computeEngine,
            computeEngineConfig: input.computeEngineConfig,
            // FIX: Pass question-answer mapping for evidence chain building
            questionAnswerMapping: input.questionAnswerMapping
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: dsResult,
            metrics: {
              duration: (dsResult as any).executionTimeMs || 0,
              resourcesUsed: { cpu: 50, memory: 200, storage: 10 },
              cost: 0.05
            }
          };
        } catch (dsError: any) {
          console.error('Comprehensive analysis failed:', dsError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: dsError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      case 'audience_formatter':
        // Use AudienceFormatter service
        try {
          const afModule = await import('./audience-formatter');
          const formatter = afModule.AudienceFormatter.getInstance();
          const formattedResult = await formatter.formatForAudience(
            input.analysisResult,
            input.audienceContext
          );
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: formattedResult,
            metrics: {
              duration: 50,
              resourcesUsed: { cpu: 10, memory: 50, storage: 0 },
              cost: 0.01
            }
          };
        } catch (formatError: any) {
          console.error('Audience formatting failed:', formatError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: formatError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      case 'question_answer_generator':
        // Use QuestionAnswerService
        try {
          const qaModule = await import('./question-answer-service');
          const qaResult = await qaModule.QuestionAnswerService.generateAnswers({
            projectId: input.projectId,
            userId: input.userId || executionContext.userId,
            questions: input.questions,
            analysisResults: input.analysisResults,
            analysisGoal: input.analysisGoal,
            audience: input.audience
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: qaResult,
            metrics: {
              duration: 200,
              resourcesUsed: { cpu: 30, memory: 100, storage: 5 },
              cost: 0.02
            }
          };
        } catch (qaError: any) {
          console.error('Question answer generation failed:', qaError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: qaError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      case 'artifact_generator':
        // Use ArtifactGenerator service — U2A2A2U: pass through ALL input fields
        try {
          const agModule = await import('./artifact-generator');
          const artifactGen = new agModule.ArtifactGenerator();
          const artifactResult = await artifactGen.generateArtifacts({
            projectId: input.projectId,
            projectName: input.projectName,
            userId: input.userId || executionContext.userId,
            journeyType: input.journeyType || 'business',
            analysisResults: input.analysisResults || [],
            visualizations: input.visualizations || [],
            insights: input.insights || [],
            datasetSizeMB: input.datasetSizeMB || 1,
            comprehensiveResults: input.comprehensiveResults
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: artifactResult,
            metrics: {
              duration: 500,
              resourcesUsed: { cpu: 40, memory: 150, storage: 50 },
              cost: 0.03
            }
          };
        } catch (artifactError: any) {
          console.error('Artifact generation failed:', artifactError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: artifactError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      // ========================================
      // FIX 4.1A: PM AGENT ANALYSIS TOOLS
      // These tools are critical for analysis plan generation
      // ========================================
      case 'assess_data_quality':
        try {
          console.log('📊 [assess_data_quality] Starting data quality assessment...');
          const storageModule = await import('../storage');
          const storage = storageModule.storage;

          const projectId = input.projectId;
          const datasets = await storage.getProjectDatasets(projectId);
          const dataset = datasets?.[0]?.dataset;

          if (!dataset) {
            throw new Error('No dataset found for quality assessment');
          }

          const schema = dataset.schema || {};
          const preview = (dataset.preview || dataset.data || []) as any[];
          const columnCount = Object.keys(schema).length;
          const rowCount = preview.length;

          // Calculate quality metrics
          let completenessScore = 100;
          let consistencyScore = 100;
          const missingColumns: string[] = [];
          const typeIssues: string[] = [];

          for (const [colName, colType] of Object.entries(schema)) {
            const values = preview.map((row: any) => row[colName]);
            const nullCount = values.filter((v: any) => v === null || v === undefined || v === '').length;
            const nullPercentage = (nullCount / rowCount) * 100;

            if (nullPercentage > 20) {
              missingColumns.push(colName);
              completenessScore -= (nullPercentage / columnCount);
            }

            // Check type consistency
            const nonNullValues = values.filter((v: any) => v !== null && v !== undefined && v !== '');
            const typeSet = new Set(nonNullValues.map((v: any) => typeof v));
            if (typeSet.size > 1) {
              typeIssues.push(`${colName} has mixed types`);
              consistencyScore -= (10 / columnCount);
            }
          }

          const qualityScore = Math.max(0, Math.min(100, (completenessScore * 0.5 + consistencyScore * 0.5)));

          const qualityResult = {
            qualityScore: Math.round(qualityScore),
            completenessScore: Math.round(Math.max(0, completenessScore)),
            consistencyScore: Math.round(Math.max(0, consistencyScore)),
            columnCount,
            rowCount,
            issues: [
              ...missingColumns.map(col => `Column "${col}" has significant missing values`),
              ...typeIssues
            ],
            recommendations: qualityScore < 80
              ? ['Consider data cleaning before analysis', 'Handle missing values appropriately']
              : ['Data quality is good for analysis'],
            readyForAnalysis: qualityScore >= 60
          };

          console.log(`✅ [assess_data_quality] Quality score: ${qualityResult.qualityScore}%`);

          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: qualityResult,
            metrics: {
              duration: 100,
              resourcesUsed: { cpu: 10, memory: 50, storage: 0 },
              cost: 0.01
            }
          };
        } catch (qualityError: any) {
          console.error('❌ [assess_data_quality] Error:', qualityError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: qualityError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      case 'generate_plan_blueprint':
        try {
          console.log('📋 [generate_plan_blueprint] Generating analysis plan blueprint...');
          const storagePlanModule = await import('../storage');
          const storageForPlan = storagePlanModule.storage;

          const projectIdForPlan = input.projectId;
          const userGoals = input.userGoals || [];
          const userQuestions = input.userQuestions || [];
          const analysisTypes = input.analysisTypes || ['descriptive_stats'];

          const project = await storageForPlan.getProject(projectIdForPlan);
          const datasets = await storageForPlan.getProjectDatasets(projectIdForPlan);
          const dataset = datasets?.[0]?.dataset;

          const schema = dataset?.schema || {};
          const columnCount = Object.keys(schema).length;
          const numericColumns = Object.entries(schema)
            .filter(([_, type]) => type === 'number' || type === 'integer' || type === 'float')
            .map(([name]) => name);
          const categoricalColumns = Object.entries(schema)
            .filter(([_, type]) => type === 'string' || type === 'text')
            .map(([name]) => name);

          // ========================================================================
          // PHASE 2 FIX: Use DS-recommended analysisPath from requirementsDocument
          // This ensures the plan is driven by Data Scientist recommendations,
          // not just schema heuristics
          // ========================================================================
          const journeyProgress = (project as any)?.journeyProgress || {};
          const requirementsDoc = journeyProgress.requirementsDocument;
          const dsRecommendedAnalyses = requirementsDoc?.analysisPath || [];

          console.log(`📋 [generate_plan_blueprint] Found ${dsRecommendedAnalyses.length} DS-recommended analyses in requirementsDocument`);

          // Generate analysis steps prioritizing DS recommendations
          const steps: any[] = [];
          let stepOrder = 1;
          const addedAnalysisNames = new Set<string>();

          // PRIORITY 1: Add DS-recommended analyses from analysisPath (SSOT)
          if (dsRecommendedAnalyses.length > 0) {
            console.log(`📋 [generate_plan_blueprint] Using ${dsRecommendedAnalyses.length} DS-recommended analyses as PRIMARY source`);
            for (const analysis of dsRecommendedAnalyses) {
              const analysisName = analysis.analysisName || analysis.name || 'Analysis';
              if (!addedAnalysisNames.has(analysisName.toLowerCase())) {
                steps.push({
                  stepId: `step_${stepOrder++}`,
                  name: analysisName,
                  description: analysis.description || `Execute ${analysisName}`,
                  analysisType: analysis.techniques?.[0] || analysis.analysisType || 'statistical',
                  estimatedDuration: analysis.estimatedDuration || '60 seconds',
                  requiredColumns: analysis.requiredDataElements || [],
                  priority: 'high',
                  source: 'ds_recommendation'
                });
                addedAnalysisNames.add(analysisName.toLowerCase());
                console.log(`   ✅ Added DS analysis: ${analysisName}`);
              }
            }
          }

          // PRIORITY 2: Query AnalysisPatternRegistry for matching patterns
          try {
            const { AnalysisPatternRegistry } = await import('./analysis-pattern-registry');
            const patterns = await AnalysisPatternRegistry.getPatternsForContext({
              industry: (project as any)?.industry || journeyProgress.industry,
              goal: userGoals.join('; '),
              journeyId: (project as any)?.journeyType
            });

            if (patterns && patterns.length > 0) {
              console.log(`📋 [generate_plan_blueprint] Found ${patterns.length} matching analysis patterns`);
              for (const pattern of patterns.slice(0, 3)) {
                const patternName = pattern.name || 'Pattern Analysis';
                if (!addedAnalysisNames.has(patternName.toLowerCase())) {
                  const toolSeq = Array.isArray(pattern.toolSequence) ? pattern.toolSequence : [];
                  const reqSignals = Array.isArray(pattern.requiredSignals) ? pattern.requiredSignals : [];
                  steps.push({
                    stepId: `step_${stepOrder++}`,
                    name: patternName,
                    description: pattern.description || `Execute ${patternName}`,
                    analysisType: toolSeq[0] || 'statistical',
                    estimatedDuration: '60 seconds',
                    requiredColumns: reqSignals,
                    priority: 'medium',
                    source: 'pattern_registry'
                  });
                  addedAnalysisNames.add(patternName.toLowerCase());
                  console.log(`   ✅ Added pattern: ${patternName}`);
                }
              }
            }
          } catch (patternError) {
            console.warn('⚠️ [generate_plan_blueprint] Pattern registry query failed (non-blocking):', patternError);
          }

          // PRIORITY 3: Fallback heuristics (only if no recommendations)
          if (steps.length === 0) {
            console.log('📋 [generate_plan_blueprint] No DS recommendations or patterns found, using schema heuristics');

            // Always include data overview
            steps.push({
              stepId: `step_${stepOrder++}`,
              name: 'Data Overview',
              description: 'Generate summary statistics and data profile',
              analysisType: 'descriptive_stats',
              estimatedDuration: '30 seconds',
              requiredColumns: Object.keys(schema).slice(0, 10),
              priority: 'high',
              source: 'heuristic'
            });

            // Add numeric analysis if numeric columns exist
            if (numericColumns.length > 0) {
              steps.push({
                stepId: `step_${stepOrder++}`,
                name: 'Numeric Analysis',
                description: 'Statistical analysis of numeric variables',
                analysisType: 'statistical',
                estimatedDuration: '45 seconds',
                requiredColumns: numericColumns.slice(0, 5),
                priority: 'high',
                source: 'heuristic'
              });
            }

            // Add correlation if multiple numeric columns
            if (numericColumns.length >= 2) {
              steps.push({
                stepId: `step_${stepOrder++}`,
                name: 'Correlation Analysis',
                description: 'Identify relationships between numeric variables',
                analysisType: 'correlation',
                estimatedDuration: '60 seconds',
                requiredColumns: numericColumns,
                priority: 'medium',
                source: 'heuristic'
              });
            }

            // Add category analysis
            if (categoricalColumns.length > 0) {
              steps.push({
                stepId: `step_${stepOrder++}`,
                name: 'Category Distribution',
                description: 'Analyze distribution of categorical variables',
                analysisType: 'categorical',
                estimatedDuration: '30 seconds',
                requiredColumns: categoricalColumns.slice(0, 5),
                priority: 'medium',
                source: 'heuristic'
              });
            }
          }

          // ALWAYS add question-specific steps (regardless of source)
          for (let i = 0; i < Math.min(userQuestions.length, 3); i++) {
            const questionStepName = `Answer Question ${i + 1}`;
            if (!addedAnalysisNames.has(questionStepName.toLowerCase())) {
              steps.push({
                stepId: `step_${stepOrder++}`,
                name: questionStepName,
                description: `Analyze data to answer: ${userQuestions[i]?.substring(0, 50)}...`,
                analysisType: 'question_answering',
                estimatedDuration: '90 seconds',
                question: userQuestions[i],
                priority: 'high',
                source: 'user_question'
              });
            }
          }

          console.log(`📋 [generate_plan_blueprint] Generated ${steps.length} analysis steps (DS: ${steps.filter(s => s.source === 'ds_recommendation').length}, Patterns: ${steps.filter(s => s.source === 'pattern_registry').length}, Heuristics: ${steps.filter(s => s.source === 'heuristic').length})`);

          // FIX: Generate context-aware visualizations based on analysis steps and data characteristics
          const visualizations: Array<{ type: string; title: string; description: string; dataColumns?: string[]; analysisStep?: string }> = [];
          const addedVizTypes = new Set<string>();

          // Map analysis types to appropriate visualizations
          for (const step of steps) {
            const analysisType = (step.analysisType || step.name || '').toLowerCase();

            if (/correlation/i.test(analysisType) && !addedVizTypes.has('heatmap')) {
              visualizations.push({
                type: 'heatmap',
                title: 'Correlation Heatmap',
                description: 'Visualize relationships between numeric variables',
                dataColumns: numericColumns.slice(0, 8),
                analysisStep: step.name
              });
              addedVizTypes.add('heatmap');
            }

            if (/regression|predict/i.test(analysisType) && !addedVizTypes.has('scatter')) {
              visualizations.push({
                type: 'scatter',
                title: 'Regression Analysis Plot',
                description: 'Scatter plot with trend line showing predicted vs actual values',
                dataColumns: numericColumns.slice(0, 2),
                analysisStep: step.name
              });
              addedVizTypes.add('scatter');
            }

            if (/cluster/i.test(analysisType) && !addedVizTypes.has('cluster_scatter')) {
              visualizations.push({
                type: 'scatter',
                title: 'Cluster Visualization',
                description: 'Data points colored by cluster assignment',
                dataColumns: numericColumns.slice(0, 3),
                analysisStep: step.name
              });
              addedVizTypes.add('cluster_scatter');
            }

            if (/time.?series|trend|forecast/i.test(analysisType) && !addedVizTypes.has('line')) {
              visualizations.push({
                type: 'line',
                title: 'Time Series Trend',
                description: 'Track values over time with trend indicators',
                analysisStep: step.name
              });
              addedVizTypes.add('line');
            }

            if (/categor|distribution|frequency/i.test(analysisType) && !addedVizTypes.has('bar_category')) {
              visualizations.push({
                type: 'bar',
                title: 'Category Distribution',
                description: 'Distribution of records across categories',
                dataColumns: categoricalColumns.slice(0, 3),
                analysisStep: step.name
              });
              addedVizTypes.add('bar_category');
            }

            if (/descriptive|statistic|overview/i.test(analysisType) && !addedVizTypes.has('histogram')) {
              visualizations.push({
                type: 'histogram',
                title: 'Data Distribution',
                description: 'Histogram showing value distribution for key numeric columns',
                dataColumns: numericColumns.slice(0, 3),
                analysisStep: step.name
              });
              addedVizTypes.add('histogram');
            }
          }

          // Add default visualizations if none were generated (use available column info)
          if (visualizations.length === 0) {
            if (numericColumns.length >= 2) {
              visualizations.push({
                type: 'bar',
                title: 'Key Metrics Overview',
                description: `Compare ${numericColumns.slice(0, 3).join(', ')} across segments`,
                dataColumns: numericColumns.slice(0, 3)
              });
            }
            if (categoricalColumns.length > 0) {
              visualizations.push({
                type: 'pie',
                title: 'Category Breakdown',
                description: `Distribution by ${categoricalColumns[0]}`,
                dataColumns: categoricalColumns.slice(0, 1)
              });
            }
            // Last resort: if no columns detected at all
            if (visualizations.length === 0) {
              visualizations.push({
                type: 'bar',
                title: 'Data Summary',
                description: 'Overview of key data metrics'
              });
            }
          }

          console.log(`📊 [generate_plan_blueprint] Generated ${visualizations.length} visualizations for analysis`);

          const blueprint = {
            planId: `plan_${Date.now()}`,
            projectId: projectIdForPlan,
            steps,
            // FIX: Map steps to analysisSteps format expected by PM Agent
            analysisSteps: steps.map((s: any) => ({
              method: s.analysisType || 'statistical',
              name: s.name,
              description: s.description,
              confidence: s.confidence || 0.8,
              stepNumber: steps.indexOf(s) + 1,
              inputs: s.requiredColumns || [],
              expectedOutputs: s.expectedOutputs || ['analysis_results'],
              tools: s.tools || [],
              estimatedDuration: s.estimatedDuration || '30 seconds'
            })),
            // FIX: Include generated visualizations
            visualizations,
            totalSteps: steps.length,
            estimatedTotalDuration: `${steps.length * 45} seconds`,
            dataCharacteristics: {
              columnCount,
              numericColumns: numericColumns.length,
              categoricalColumns: categoricalColumns.length
            },
            userGoals,
            userQuestions,
            generatedAt: new Date().toISOString()
          };

          console.log(`✅ [generate_plan_blueprint] Generated ${steps.length} analysis steps`);

          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: blueprint,
            metrics: {
              duration: 200,
              resourcesUsed: { cpu: 20, memory: 100, storage: 0 },
              cost: 0.02
            }
          };
        } catch (blueprintError: any) {
          console.error('❌ [generate_plan_blueprint] Error:', blueprintError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: blueprintError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      // ========================================
      // ANALYSIS EXECUTION TOOL
      // ========================================
      case 'analysis_execution':
        // Use AnalysisExecutionService for executing project analysis
        try {
          const analysisExecModule = await import('./analysis-execution');
          const AnalysisExecutionService = analysisExecModule.AnalysisExecutionService;
          const analysisResult = await AnalysisExecutionService.executeComprehensiveAnalysis({
            projectId: input.projectId,
            userId: input.userId || executionContext.userId,
            analysisTypes: input.analysisTypes || ['descriptive'],
            datasetIds: input.datasetIds
          });
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'success',
            result: analysisResult,
            metrics: {
              duration: (analysisResult.metadata as any)?.executionTimeSeconds ? (analysisResult.metadata as any).executionTimeSeconds * 1000 : 0,
              resourcesUsed: { cpu: 50, memory: 200, storage: 10 },
              cost: (analysisResult.metadata as any)?.cost || 0.05
            }
          };
        } catch (analysisError: any) {
          console.error('Analysis execution failed:', analysisError);
          result = {
            executionId: executionContext.executionId,
            toolId: toolName,
            status: 'error',
            error: analysisError.message,
            result: null,
            metrics: { duration: 0, resourcesUsed: { cpu: 0, memory: 0, storage: 0 }, cost: 0 }
          };
        }
        break;

      // ========================================
      // SPARK & DISTRIBUTED COMPUTING TOOLS
      // ========================================
      case 'spark_visualization_engine':
      case 'spark_statistical_analyzer':
      case 'spark_ml_pipeline':
      case 'spark_data_processor':
        const sparkHandlersModule = await import('./agent-tool-handlers');
        const sparkHandlers = sparkHandlersModule.sparkToolHandlers;
        switch (toolName) {
          case 'spark_visualization_engine':
            result = await sparkHandlers.handleSparkVisualization(input, executionContext);
            break;
          case 'spark_statistical_analyzer':
            result = await sparkHandlers.handleSparkStatisticalAnalyzer(input, executionContext);
            break;
          case 'spark_ml_pipeline':
            result = await sparkHandlers.handleSparkMLPipeline(input, executionContext);
            break;
          case 'spark_data_processor':
            result = await sparkHandlers.handleSparkDataProcessor(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // TROUBLESHOOTING TOOLS
      // ========================================
      case 'troubleshoot_assistant_v2':
        const troubleshootModule = await import('./agent-tool-handlers');
        const troubleshootHandlers = troubleshootModule.troubleshootingToolHandlers;
        result = await troubleshootHandlers.handleTroubleshootAssistant(input, executionContext);
        break;

      // ========================================
      // GOVERNANCE & AUDIT TOOLS
      // ========================================
      case 'data_lineage_tracker':
      case 'decision_auditor':
        const govHandlersModule = await import('./agent-tool-handlers');
        const govHandlers = govHandlersModule.governanceToolHandlers;
        switch (toolName) {
          case 'data_lineage_tracker':
            result = await govHandlers.handleDataLineageTracker(input, executionContext);
            break;
          case 'decision_auditor':
            result = await govHandlers.handleDecisionAuditor(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // HEALTH CHECK TOOLS
      // ========================================
      case 'ml_health_check':
      case 'llm_health_check':
        const healthHandlersModule = await import('./agent-tool-handlers');
        const healthHandlers = healthHandlersModule.healthCheckToolHandlers;
        switch (toolName) {
          case 'ml_health_check':
            result = await healthHandlers.handleMLHealthCheck(input, executionContext);
            break;
          case 'llm_health_check':
            result = await healthHandlers.handleLLMHealthCheck(input, executionContext);
            break;
          default:
            result = createPlaceholderResult(executionContext, toolName);
        }
        break;

      // ========================================
      // NATURAL LANGUAGE TRANSLATION TOOLS
      // ========================================
      case 'translate_schema':
      case 'translate_results':
      case 'translate_quality':
      case 'translate_error':
      case 'clarify_term':
      case 'check_grammar': {
        const { naturalLanguageTranslator } = await import('./natural-language-translator');
        const audience = input.audience || 'business';
        const context = {
          audience,
          industry: input.industry,
          projectName: input.projectName
        };

        let translationResult;
        switch (toolName) {
          case 'translate_schema':
            translationResult = await naturalLanguageTranslator.translateSchemaWithAI(input.schema, context);
            break;
          case 'translate_results':
            translationResult = await naturalLanguageTranslator.translateResultsWithAI(input.results, context);
            break;
          case 'translate_quality':
            translationResult = await naturalLanguageTranslator.translateQualityWithAI(input.qualityReport, context);
            break;
          case 'translate_error':
            translationResult = await naturalLanguageTranslator.translateErrorWithAI(input.error, context);
            break;
          case 'clarify_term':
            translationResult = await naturalLanguageTranslator.clarifyTermWithAI(input.term, input.context, audience);
            break;
          case 'check_grammar':
            translationResult = await naturalLanguageTranslator.checkGrammarWithAI(input.text);
            break;
        }

        result = {
          executionId: executionContext.executionId,
          toolId: toolName,
          status: translationResult?.success ? 'success' : 'error',
          result: translationResult?.data || translationResult,
          metrics: {
            duration: 0,
            resourcesUsed: { cpu: 0.1, memory: 50, storage: 0 },
            cost: 0.001 // Minimal cost for LLM translation
          }
        };
        break;
      }

      // ========================================
      // CLARIFICATION TOOLS
      // ========================================
      case 'detect_ambiguities':
      case 'create_clarification_request':
      case 'get_pending_clarifications':
      case 'submit_clarification_answers':
      case 'validate_user_input': {
        const { clarificationService } = await import('./clarification-service');

        let clarificationResult;
        switch (toolName) {
          case 'detect_ambiguities':
            clarificationResult = await clarificationService.detectAmbiguities(
              input.userInput,
              input.context || { journeyType: 'business' },
              input.inputType || 'goal'
            );
            break;

          case 'create_clarification_request':
            clarificationResult = await clarificationService.createClarificationRequest(
              input.projectId,
              input.questions,
              input.originalInput,
              input.inputType || 'goal'
            );
            break;

          case 'get_pending_clarifications':
            const pending = await clarificationService.getPendingClarifications(input.projectId);
            clarificationResult = {
              hasPending: pending !== null,
              request: pending
            };
            break;

          case 'submit_clarification_answers':
            clarificationResult = await clarificationService.submitClarificationAnswers(
              input.projectId,
              input.answers
            );
            break;

          case 'validate_user_input':
            clarificationResult = await clarificationService.validateInput(
              input.input,
              input.context || { journeyType: 'business' },
              input.inputType || 'goal'
            );
            break;
        }

        result = {
          executionId: executionContext.executionId,
          toolId: toolName,
          status: 'success',
          result: clarificationResult,
          metrics: {
            duration: 0,
            resourcesUsed: { cpu: 0.1, memory: 50, storage: 0 },
            cost: 0.001
          }
        };
        break;
      }

      // ========================================
      // SURVEY PREPROCESSING TOOLS
      // ========================================
      case 'preprocess_survey': {
        const { getSurveyPreprocessor } = await import('./survey-preprocessor');
        const surveyPreprocessor = getSurveyPreprocessor();

        let surveyResult;
        const mode = input.mode || 'detect';

        if (mode === 'transform') {
          // Need dataset rows for transformation
          const rows = input.rows || input.data || [];
          surveyResult = await surveyPreprocessor.applySurveyTransformations(rows, input.transformations || []);
        } else {
          // Detection mode — need dataset rows
          const rows = input.rows || input.data || [];
          surveyResult = await surveyPreprocessor.detectSurveyStructure(rows);
        }

        result = {
          executionId: executionContext.executionId,
          toolId: toolName,
          status: surveyResult.success ? 'success' : 'error',
          result: surveyResult,
          metrics: {
            duration: 0,
            resourcesUsed: { cpu: 0.2, memory: 100, storage: 0 },
            cost: 0.002
          }
        };
        break;
      }

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
        const billingModule = await import('./billing-analytics-integration');
        const billingAnalyticsIntegration = billingModule.billingAnalyticsIntegration;

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

    // PHASE 1 FIX: Persist artifacts to database before returning
    // This fixes the broken artifact chain where tools generate artifacts but they're lost in memory
    if (context?.projectId && result.artifacts?.length) {
      try {
        const persistedIds = await artifactService.persistToolArtifacts(
          context.projectId,
          agentId,
          result
        );
        // Attach persisted artifact IDs to result for traceability
        (result as any).persistedArtifactIds = persistedIds;
        console.log(`📦 [Artifact] Persisted ${persistedIds.length} artifacts from ${toolName}`);
      } catch (persistError) {
        console.error(`⚠️ [Artifact] Failed to persist artifacts (non-blocking):`, persistError);
        // Non-blocking - tool execution succeeded, just persistence failed
      }
    }

    // P2-4 FIX: Emit tool completion event for real-time UI updates
    try {
      const brokerModule2 = await import('./agents/message-broker');
      const broker2 = brokerModule2.getMessageBroker();
      broker2.emit('message:status', {
        type: 'status',
        from: agentId,
        to: 'system',
        payload: {
          status: 'tool_completed',
          currentTask: `Completed ${tool.name}${result.status === 'success' ? '' : ` (${result.status})`}`,
          toolName,
          toolStatus: result.status,
          projectId: context?.projectId,
          userId: context?.userId,
          durationMs: result.metrics?.duration,
        },
        timestamp: new Date(),
      });
    } catch { /* non-blocking */ }

    console.log(`✅ Tool ${toolName} executed successfully`);
    return result;

  } catch (error) {
    console.error(`❌ Tool ${toolName} execution failed:`, error);

    const errorResult: ToolExecutionResult = {
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
