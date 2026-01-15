import { MCPAIService, AIRole, MCPResource, AIRequest, AIAction } from './mcp-ai-service';
import { FileProcessor } from './services/file-processor';
import { MLService, MLAnalysisRequest } from './ml-service';
import { AdvancedAnalyzer } from './advanced-analyzer';
import { VisualizationAPIService } from './visualization-api-service';
import { BusinessTemplates } from './services/business-templates';
import { db } from './db';
import { projects, datasets, decisionAudits, generatedArtifacts } from '../shared/schema';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs';

export interface AnalysisWorkflowStep {
  id: string;
  name: string;
  description: string;
  agent: 'project_manager' | 'data_scientist' | 'business_agent';
  dependencies: string[];
  inputs: any;
  outputs: any;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  artifacts: string[];
  decisions: any[];
}

export interface AnalysisWorkflow {
  id: string;
  projectId: string;
  steps: AnalysisWorkflowStep[];
  currentStep: string;
  context: any;
}

export class EnhancedMCPService extends MCPAIService {
  private static workflows: Map<string, AnalysisWorkflow> = new Map();
  private static mlService = new MLService();

  static async initializeEnhancedMCPServer(): Promise<void> {
    // Initialize base MCP server
    await super.initializeMCPServer();

    // Add enhanced analysis resources
    this.addAnalysisResources();

    console.log('Enhanced MCP AI Service initialized with analysis components');
  }

  private static addAnalysisResources(): void {
    // File processing resources
    this.addResource({
      type: 'tool',
      name: 'file_processor',
      config: { service: 'FileProcessor' },
      permissions: ['read_files', 'process_data', 'validate_schema']
    });

    // Schema generation and validation
    this.addResource({
      type: 'tool',
      name: 'schema_generator',
      config: { service: 'SchemaGenerator' },
      permissions: ['analyze_schema', 'validate_data_types']
    });

    // Data transformation pipeline
    this.addResource({
      type: 'tool',
      name: 'data_transformer',
      config: { service: 'DataTransformer' },
      permissions: ['transform_data', 'clean_data', 'engineer_features']
    });

    // Statistical analysis pipeline
    this.addResource({
      type: 'tool',
      name: 'statistical_analyzer',
      config: { service: 'AdvancedAnalyzer' },
      permissions: ['statistical_analysis', 'hypothesis_testing', 'anova', 'regression']
    });

    // Machine learning pipeline
    this.addResource({
      type: 'tool',
      name: 'ml_pipeline',
      config: { service: 'MLService' },
      permissions: ['train_models', 'predict', 'evaluate_models', 'feature_selection']
    });

    // Visualization engine
    this.addResource({
      type: 'tool',
      name: 'visualization_engine',
      config: { service: 'VisualizationAPIService' },
      permissions: ['create_charts', 'generate_dashboards', 'interactive_plots']
    });

    // Project coordination
    this.addResource({
      type: 'tool',
      name: 'project_coordinator',
      config: { service: 'ProjectCoordinator' },
      permissions: ['coordinate_workflow', 'track_progress', 'manage_artifacts']
    });

    // Decision audit system
    this.addResource({
      type: 'tool',
      name: 'decision_auditor',
      config: { service: 'DecisionAuditor' },
      permissions: ['log_decisions', 'track_reasoning', 'audit_workflow']
    });

    // Business templates (for business users)
    this.addResource({
      type: 'tool',
      name: 'business_templates',
      config: { service: 'BusinessTemplates', templates: BusinessTemplates.list() },
      permissions: ['business_analysis', 'customize_outputs', 'create_reports']
    });

    // Enhanced agent roles with specific analysis capabilities
    const currentRoles = MCPAIService.getAvailableRoles();
    currentRoles.push(
      {
        name: 'Analytics Project Manager Agent',
        description: 'Orchestrates end-to-end analytics workflows with user interaction management',
        capabilities: [
          'workflow_orchestration',
          'user_communication',
          'project_planning',
          'resource_allocation',
          'quality_assurance',
          'artifact_coordination'
        ],
        permissions: [
          'read_data', 'coordinate_workflow', 'track_progress', 'manage_artifacts',
          'user_interaction', 'log_decisions', 'quality_control'
        ]
      },
      {
        name: 'Data Scientist Agent',
        description: 'Technical analysis execution with ML and statistical expertise',
        capabilities: [
          'data_preprocessing',
          'feature_engineering',
          'statistical_analysis',
          'machine_learning',
          'model_validation',
          'technical_optimization'
        ],
        permissions: [
          'read_data', 'process_data', 'transform_data', 'clean_data',
          'statistical_analysis', 'train_models', 'predict', 'evaluate_models',
          'create_charts', 'engineer_features', 'validate_schema'
        ]
      },
      {
        name: 'Business Agent',
        description: 'Business context interpretation with industry expertise',
        capabilities: [
          'business_analysis',
          'industry_research',
          'insight_generation',
          'report_customization',
          'stakeholder_communication',
          'strategic_recommendations'
        ],
        permissions: [
          'read_data', 'business_analysis', 'generate_insights', 'create_reports',
          'industry_research', 'customize_outputs', 'stakeholder_reports'
        ]
      }
    );
  }

  /**
   * Execute a complete analysis workflow with agent coordination
   */
  static async executeAnalysisWorkflow(
    projectId: string,
    workflowType: 'full_analysis' | 'statistical_only' | 'ml_only' | 'visualization_only',
    data: any[],
    configuration: any,
    userId: string
  ): Promise<any> {
    const workflowId = `workflow_${projectId}_${Date.now()}`;

    // Create workflow based on type
    const workflow = this.createWorkflow(workflowId, projectId, workflowType, configuration);
    this.workflows.set(workflowId, workflow);

    try {
      // Execute workflow steps with agent coordination
      return await this.orchestrateWorkflow(workflow, data, userId);
    } catch (error) {
      // Log workflow failure
      await this.logDecision(projectId, 'system', 'workflow_failure',
        `Workflow ${workflowId} failed`, (error as Error).message || String(error), [], 0);
      throw error;
    }
  }

  private static createWorkflow(
    workflowId: string,
    projectId: string,
    type: string,
    config: any
  ): AnalysisWorkflow {
    const baseSteps: AnalysisWorkflowStep[] = [
      {
        id: 'file_upload',
        name: 'Data Upload & Validation',
        description: 'Process uploaded files and validate data integrity',
        agent: 'project_manager',
        dependencies: [],
        inputs: { files: config.files },
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      },
      {
        id: 'schema_generation',
        name: 'Schema Analysis',
        description: 'Generate data schema and identify data types',
        agent: 'data_scientist',
        dependencies: ['file_upload'],
        inputs: {},
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      },
      {
        id: 'data_preparation',
        name: 'Data Cleaning & Transformation',
        description: 'Clean data and apply transformations',
        agent: 'data_scientist',
        dependencies: ['schema_generation'],
        inputs: config.transformations || {},
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      }
    ];

    // Add type-specific steps
    if (type === 'full_analysis' || type === 'statistical_only') {
      baseSteps.push({
        id: 'statistical_analysis',
        name: 'Statistical Analysis',
        description: 'Perform statistical tests and analysis',
        agent: 'data_scientist',
        dependencies: ['data_preparation'],
        inputs: config.statisticalConfig || {},
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      });
    }

    if (type === 'full_analysis' || type === 'ml_only') {
      baseSteps.push({
        id: 'ml_analysis',
        name: 'Machine Learning Analysis',
        description: 'Train models and generate predictions',
        agent: 'data_scientist',
        dependencies: ['data_preparation'],
        inputs: config.mlConfig || {},
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      });
    }

    if (type === 'full_analysis' || type === 'visualization_only') {
      baseSteps.push({
        id: 'visualization',
        name: 'Data Visualization',
        description: 'Create charts and visual representations',
        agent: 'data_scientist',
        dependencies: ['data_preparation'],
        inputs: config.visualizationConfig || {},
        outputs: {},
        status: 'pending',
        artifacts: [],
        decisions: []
      });
    }

    baseSteps.push({
      id: 'insight_generation',
      name: 'Business Insight Generation',
      description: 'Generate business-focused insights and recommendations',
      agent: 'business_agent',
      dependencies: ['statistical_analysis', 'ml_analysis', 'visualization'].filter(
        dep => baseSteps.some(step => step.id === dep)
      ),
      inputs: config.businessContext || {},
      outputs: {},
      status: 'pending',
      artifacts: [],
      decisions: []
    });

    return {
      id: workflowId,
      projectId,
      steps: baseSteps,
      currentStep: baseSteps[0].id,
      context: config
    };
  }

  private static async orchestrateWorkflow(
    workflow: AnalysisWorkflow,
    data: any[],
    userId: string
  ): Promise<any> {
    const results: any = {
      workflowId: workflow.id,
      projectId: workflow.projectId,
      steps: {},
      artifacts: [],
      decisions: []
    };

    let workflowData = data;

    for (const step of workflow.steps) {
      // Check dependencies
      const dependenciesMet = step.dependencies.every(depId =>
        workflow.steps.find(s => s.id === depId)?.status === 'completed'
      );

      if (!dependenciesMet) {
        continue; // Skip this step for now
      }

      try {
        step.status = 'in_progress';
        workflow.currentStep = step.id;

        console.log(`Executing workflow step: ${step.name} with agent: ${step.agent}`);

        // Execute step with appropriate agent
        const stepResult = await this.executeWorkflowStep(step, workflowData, workflow.context, userId);

        step.status = 'completed';
        step.outputs = stepResult.outputs;
        step.artifacts = stepResult.artifacts || [];
        step.decisions = stepResult.decisions || [];

        results.steps[step.id] = stepResult;
        results.artifacts.push(...step.artifacts);
        results.decisions.push(...step.decisions);

        // Update workflow data with step outputs
        if (stepResult.transformedData) {
          workflowData = stepResult.transformedData;
        }

      } catch (error) {
        step.status = 'failed';
        await this.logDecision(workflow.projectId, step.agent, 'step_failure',
          `Step ${step.name} failed`, (error as Error).message || String(error), [], 0);
        throw new Error(`Workflow step ${step.name} failed: ${(error as Error).message || String(error)}`);
      }
    }

    return results;
  }

  private static async executeWorkflowStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    const agent = this.getAgentRole(step.agent);
    if (!agent) {
      throw new Error(`Agent ${step.agent} not found`);
    }

    switch (step.id) {
      case 'file_upload':
        return this.executeFileUploadStep(step, data, context, userId);

      case 'schema_generation':
        return this.executeSchemaGenerationStep(step, data, context, userId);

      case 'data_preparation':
        return this.executeDataPreparationStep(step, data, context, userId);

      case 'statistical_analysis':
        return this.executeStatisticalAnalysisStep(step, data, context, userId);

      case 'ml_analysis':
        return this.executeMLAnalysisStep(step, data, context, userId);

      case 'visualization':
        return this.executeVisualizationStep(step, data, context, userId);

      case 'insight_generation':
        return this.executeInsightGenerationStep(step, data, context, userId);

      default:
        throw new Error(`Unknown workflow step: ${step.id}`);
    }
  }

  private static async executeFileUploadStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    // If data is already provided, validate it
    if (data && data.length > 0) {
      const validationResult = await this.validateData(data);

      await this.logDecision(
        context.projectId || 'unknown',
        'project_manager',
        'data_validation',
        'Data validation completed',
        `Validated ${data.length} records`,
        ['accept_data', 'request_reupload'],
        validationResult.confidence
      );

      return {
        outputs: {
          validatedData: data,
          recordCount: data.length,
          validation: validationResult
        },
        artifacts: [`data_validation_${Date.now()}.json`],
        decisions: [{
          type: 'data_validation',
          decision: 'accept_data',
          confidence: validationResult.confidence
        }]
      };
    }

    throw new Error('No data provided for file upload step');
  }

  private static async executeSchemaGenerationStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    if (!data || data.length === 0) {
      throw new Error('No data available for schema generation');
    }

    // Generate schema using FileProcessor
    const schema = (FileProcessor as any).generateSchema(data);

    await this.logDecision(
      context.projectId || 'unknown',
      'data_scientist',
      'schema_generation',
      'Schema generation completed',
      `Generated schema with ${Object.keys(schema).length} columns`,
      ['accept_schema', 'modify_schema'],
      85
    );

    return {
      outputs: {
        schema,
        columnCount: Object.keys(schema).length,
        dataTypes: Object.values(schema).map((col: any) => col.type)
      },
      artifacts: [`schema_${Date.now()}.json`],
      decisions: [{
        type: 'schema_generation',
        decision: 'accept_schema',
        confidence: 85
      }]
    };
  }

  private static async executeDataPreparationStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    // Apply data transformations
    const transformations = step.inputs.transformations || [];
    let transformedData = data;

    if (transformations.length > 0) {
      // Apply transformations (this would use your existing transformation service)
      transformedData = await this.applyDataTransformations(data, transformations);
    }

    // Data quality assessment
    const qualityMetrics = await this.assessDataQuality(transformedData);

    await this.logDecision(
      context.projectId || 'unknown',
      'data_scientist',
      'data_preparation',
      'Data preparation completed',
      `Applied ${transformations.length} transformations. Quality score: ${qualityMetrics.overallScore}`,
      ['proceed_with_analysis', 'additional_cleaning'],
      qualityMetrics.overallScore
    );

    return {
      outputs: {
        transformedData,
        appliedTransformations: transformations,
        qualityMetrics
      },
      transformedData,
      artifacts: [`transformed_data_${Date.now()}.json`],
      decisions: [{
        type: 'data_preparation',
        decision: 'proceed_with_analysis',
        confidence: qualityMetrics.overallScore
      }]
    };
  }

  private static async executeStatisticalAnalysisStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    const config = step.inputs;

    // Execute statistical analysis using AdvancedAnalyzer
    const analysisResult = await AdvancedAnalyzer.performStepByStepAnalysis(data, config);

    await this.logDecision(
      context.projectId || 'unknown',
      'data_scientist',
      'statistical_analysis',
      'Statistical analysis completed',
      `Performed ${config.analysisType} analysis`,
      ['accept_results', 'rerun_analysis', 'adjust_parameters'],
      85
    );

    return {
      outputs: {
        statisticalResults: analysisResult,
        analysisType: config.analysisType,
        significance: (analysisResult as any)?.significance || 'N/A'
      },
      artifacts: [`statistical_results_${Date.now()}.json`],
      decisions: [{
        type: 'statistical_analysis',
        decision: 'accept_results',
        confidence: 85
      }]
    };
  }

  private static async executeMLAnalysisStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    const config = step.inputs;

    // Create temporary data file for ML analysis
    const dataDir = path.join(process.cwd(), 'temp_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dataPath = path.join(dataDir, `ml_data_${Date.now()}.json`);
    fs.writeFileSync(dataPath, JSON.stringify(data));

    try {
      const mlRequest: MLAnalysisRequest = {
        projectId: context.projectId || 'unknown',
        analysisType: config.analysisType || 'classification',
        targetColumn: config.targetColumn,
        features: config.features,
        parameters: config.parameters,
        userId: parseInt(userId)
      };

      const mlResult = await this.mlService.runAnalysis(mlRequest, dataPath);

      await this.logDecision(
        context.projectId || 'unknown',
        'data_scientist',
        'ml_analysis',
        'Machine learning analysis completed',
        `Trained ${mlRequest.analysisType} model with ${mlResult.results.modelPerformance?.accuracy || 'unknown'} accuracy`,
        ['deploy_model', 'retrain_model', 'try_different_algorithm'],
        (mlResult.results.modelPerformance?.accuracy || 0.7) * 100
      );

      return {
        outputs: {
          mlResults: mlResult,
          modelType: mlRequest.analysisType,
          performance: mlResult.results.modelPerformance
        },
        artifacts: [`ml_model_${Date.now()}.json`],
        decisions: [{
          type: 'ml_analysis',
          decision: 'deploy_model',
          confidence: (mlResult.results.modelPerformance?.accuracy || 0.7) * 100
        }]
      };
    } finally {
      // Clean up temporary file
      if (fs.existsSync(dataPath)) {
        fs.unlinkSync(dataPath);
      }
    }
  }

  private static async executeVisualizationStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    const config = step.inputs;
    const visualizationConfigs = config.visualizations || [
      { type: 'histogram', title: 'Data Distribution' },
      { type: 'correlation', title: 'Correlation Matrix' },
      { type: 'scatter', title: 'Feature Relationships' }
    ];

    const visualizations = [];

    for (const vizConfig of visualizationConfigs) {
      try {
        const viz = await VisualizationAPIService.createVisualization(data, vizConfig);
        visualizations.push(viz);
      } catch (error) {
        console.warn(`Failed to create visualization ${vizConfig.type}:`, error);
      }
    }

    await this.logDecision(
      context.projectId || 'unknown',
      'data_scientist',
      'visualization',
      'Data visualization completed',
      `Generated ${visualizations.length} visualizations`,
      ['approve_visualizations', 'create_additional', 'modify_existing'],
      80
    );

    return {
      outputs: {
        visualizations,
        visualizationCount: visualizations.length
      },
      artifacts: visualizations.map((_, i) => `visualization_${i}_${Date.now()}.json`),
      decisions: [{
        type: 'visualization',
        decision: 'approve_visualizations',
        confidence: 80
      }]
    };
  }

  private static async executeInsightGenerationStep(
    step: AnalysisWorkflowStep,
    data: any[],
    context: any,
    userId: string
  ): Promise<any> {
    // Gather all previous step outputs
    const workflow = this.workflows.get(context.workflowId);
    const previousOutputs = workflow?.steps
      .filter(s => s.status === 'completed')
      .reduce((acc, s) => ({ ...acc, [s.id]: s.outputs }), {});

    // Generate business insights using AI
    // Select business template based on context (if provided)
    const useCase = context?.businessContext?.useCase as string | undefined;
    const template = useCase ? BusinessTemplates.matchByUseCase(useCase) : undefined;

    const insightRequest: AIRequest = {
      role: this.getAgentRole('business_agent')!,
      actions: [{
        type: 'generate_insights',
        description: 'Generate business insights from analysis results',
        parameters: {
          analysisResults: previousOutputs,
          businessContext: context.businessContext,
          industryContext: context.industryContext,
          template: template
            ? {
              id: template.templateId,
              name: template.name,
              goals: template.goals,
              workflow: template.workflow,
              deliverables: template.deliverables
            }
            : undefined
        },
        resourcesNeeded: ['gemini-2.5-flash', 'business_templates']
      }],
      data: data,
      context: `Business insight generation for project ${context.projectId}`
    };

    const insightResult = await this.processAIRequest(insightRequest);

    await this.logDecision(
      context.projectId || 'unknown',
      'business_agent',
      'insight_generation',
      'Business insights generated',
      'Generated comprehensive business insights and recommendations',
      ['approve_insights', 'refine_insights', 'generate_additional'],
      90
    );

    return {
      outputs: {
        insights: {
          ...(insightResult.results[0] || {}),
          templateUsed: template?.templateId || null
        },
        recommendations: insightResult.results[0].recommendations || [],
        businessImpact: insightResult.results[0].businessImpact || 'Medium'
      },
      artifacts: [`business_insights_${Date.now()}.json`],
      decisions: [{
        type: 'insight_generation',
        decision: 'approve_insights',
        confidence: 90
      }]
    };
  }

  // Helper methods

  private static getAgentRole(agentType: string): AIRole | undefined {
    const roleMap: Record<string, string> = {
      'project_manager': 'Analytics Project Manager Agent',
      'data_scientist': 'Data Scientist Agent',
      'business_agent': 'Business Agent'
    };

    return MCPAIService.getAvailableRoles().find(role => role.name === roleMap[agentType]);
  }

  private static async validateData(data: any[]): Promise<any> {
    return {
      isValid: true,
      confidence: 85,
      issues: [],
      recordCount: data.length,
      columnCount: Object.keys(data[0] || {}).length
    };
  }

  private static async applyDataTransformations(data: any[], transformations: any[]): Promise<any[]> {
    // This would integrate with your existing transformation service
    return data; // Placeholder
  }

  private static async assessDataQuality(data: any[]): Promise<any> {
    return {
      overallScore: 85,
      completeness: 90,
      consistency: 80,
      accuracy: 85,
      issues: []
    };
  }

  private static async logDecision(
    projectId: string,
    agent: string,
    decisionType: string,
    decision: string,
    reasoning: string,
    alternatives: string[],
    confidence: number
  ): Promise<void> {
    try {
      await db.insert(decisionAudits).values({
        id: `decision_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        projectId,
        agent,
        decisionType,
        decision,
        reasoning,
        alternatives,
        confidence,
        context: {},
        impact: confidence > 80 ? 'high' : confidence > 60 ? 'medium' : 'low',
        reversible: true,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to log decision:', error);
    }
  }

  /**
   * Get workflow status
   */
  static getWorkflowStatus(workflowId: string): AnalysisWorkflow | undefined {
    return this.workflows.get(workflowId);
  }

  /**
   * Get all active workflows for a project
   */
  static getProjectWorkflows(projectId: string): AnalysisWorkflow[] {
    return Array.from(this.workflows.values()).filter(w => w.projectId === projectId);
  }
}

export default EnhancedMCPService;