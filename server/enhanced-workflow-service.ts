import { db } from './db';
import { projects, datasets, decisionAudits, generatedArtifacts } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { EnhancedMCPService } from './enhanced-mcp-service';
import { FileProcessor } from './file-processor';
import WebSocket from 'ws';

export interface WorkflowEvent {
  type: 'step_started' | 'step_completed' | 'step_failed' | 'workflow_completed' | 'workflow_failed' | 'progress_update';
  workflowId: string;
  stepId?: string;
  data: any;
  timestamp: Date;
}

export class EnhancedWorkflowService {
  private static activeWorkflows: Map<string, any> = new Map();
  private static websocketClients: Map<string, WebSocket> = new Map();

  /**
   * Initialize a new analysis workflow
   */
  static async initializeWorkflow(
    projectId: string,
    userId: string,
    workflowType: 'full_analysis' | 'statistical_only' | 'ml_only' | 'visualization_only',
    configuration: {
      files?: any[];
      transformations?: any[];
      statisticalConfig?: any;
      mlConfig?: any;
      visualizationConfig?: any;
      businessContext?: any;
    }
  ): Promise<string> {
    // Validate project ownership
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project || project.ownerId !== userId) {
      throw new Error('Project not found or access denied');
    }

    // Update project workflow step to track progress
    await db
      .update(projects)
      .set({
        workflowStep: 'initializing',
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    // Create workflow configuration
    const workflowConfig = {
      projectId,
      userId,
      workflowType,
      ...configuration
    };

    // Initialize Enhanced MCP Service if not already done
    try {
      await EnhancedMCPService.initializeEnhancedMCPServer();
    } catch (error) {
      console.log('MCP Service already initialized');
    }

    // Notify workflow initialization
    this.broadcastWorkflowEvent({
      type: 'step_started',
      workflowId: projectId,
      stepId: 'initialization',
      data: { message: 'Workflow initialization started', config: workflowConfig },
      timestamp: new Date()
    });

    return projectId;
  }

  /**
   * Execute workflow with uploaded data
   */
  static async executeWorkflow(
    projectId: string,
    uploadedFiles: Array<{
      buffer: Buffer;
      originalname: string;
      mimetype: string;
    }>,
    configuration: any
  ): Promise<any> {
    const workflowId = `workflow_${projectId}_${Date.now()}`;

    try {
      // Process uploaded files
      let combinedData: any[] = [];

      this.broadcastWorkflowEvent({
        type: 'step_started',
        workflowId,
        stepId: 'file_processing',
        data: { message: `Processing ${uploadedFiles.length} file(s)` },
        timestamp: new Date()
      });

      for (const file of uploadedFiles) {
        const processedFile = await FileProcessor.processFile(
          file.buffer,
          file.originalname,
          file.mimetype
        );

        combinedData = [...combinedData, ...processedFile.data];

        // Store processed data in database
        await this.storeDataset(projectId, file.originalname, processedFile);
      }

      this.broadcastWorkflowEvent({
        type: 'step_completed',
        workflowId,
        stepId: 'file_processing',
        data: {
          message: `Processed ${uploadedFiles.length} files successfully`,
          recordCount: combinedData.length
        },
        timestamp: new Date()
      });

      // Execute analysis workflow using Enhanced MCP Service
      const workflowResult = await EnhancedMCPService.executeAnalysisWorkflow(
        projectId,
        configuration.workflowType || 'full_analysis',
        combinedData,
        configuration,
        configuration.userId
      );

      // Update project status
      await db
        .update(projects)
        .set({
          workflowStep: 'complete',
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

      // Generate and store artifacts
      await this.generateArtifacts(projectId, workflowResult);

      this.broadcastWorkflowEvent({
        type: 'workflow_completed',
        workflowId,
        data: {
          message: 'Workflow completed successfully',
          results: workflowResult
        },
        timestamp: new Date()
      });

      return {
        success: true,
        workflowId,
        results: workflowResult,
        recordsProcessed: combinedData.length,
        stepsCompleted: Object.keys(workflowResult.steps).length
      };

    } catch (error) {
      // Update project status to failed
      await db
        .update(projects)
        .set({
          workflowStep: 'failed',
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

      this.broadcastWorkflowEvent({
        type: 'workflow_failed',
        workflowId,
        data: {
          message: 'Workflow failed',
          error: (error as Error).message || String(error)
        },
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Execute workflow with existing data
   */
  static async executeWorkflowWithData(
    projectId: string,
    data: any[],
    configuration: any
  ): Promise<any> {
    const workflowId = `workflow_${projectId}_${Date.now()}`;

    try {
      // Validate data
      if (!data || data.length === 0) {
        throw new Error('No data provided for analysis');
      }

      this.broadcastWorkflowEvent({
        type: 'step_started',
        workflowId,
        stepId: 'data_validation',
        data: {
          message: `Validating ${data.length} records`,
          recordCount: data.length
        },
        timestamp: new Date()
      });

      // Execute analysis workflow using Enhanced MCP Service
      const workflowResult = await EnhancedMCPService.executeAnalysisWorkflow(
        projectId,
        configuration.workflowType || 'full_analysis',
        data,
        configuration,
        configuration.userId
      );

      // Update project status
      await db
        .update(projects)
        .set({
          workflowStep: 'complete',
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

      // Generate and store artifacts
      await this.generateArtifacts(projectId, workflowResult);

      this.broadcastWorkflowEvent({
        type: 'workflow_completed',
        workflowId,
        data: {
          message: 'Workflow completed successfully',
          results: workflowResult
        },
        timestamp: new Date()
      });

      return {
        success: true,
        workflowId,
        results: workflowResult,
        recordsProcessed: data.length,
        stepsCompleted: Object.keys(workflowResult.steps).length
      };

    } catch (error) {
      await db
        .update(projects)
        .set({
          workflowStep: 'failed',
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));

      this.broadcastWorkflowEvent({
        type: 'workflow_failed',
        workflowId,
        data: {
          message: 'Workflow failed',
          error: (error as Error).message || String(error)
        },
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Get workflow progress and status
   */
  static async getWorkflowStatus(projectId: string): Promise<any> {
    // Get workflow from Enhanced MCP Service
    const workflows = EnhancedMCPService.getProjectWorkflows(projectId);

    if (workflows.length === 0) {
      // Get project status from database
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      return {
        projectId,
        status: project?.workflowStep || 'not_started',
        progress: this.calculateProgress(project?.workflowStep || 'not_started'),
        steps: [],
        estimatedCompletion: null
      };
    }

    const workflow = workflows[0];
    const completedSteps = workflow.steps.filter(s => s.status === 'completed').length;
    const totalSteps = workflow.steps.length;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    // Calculate estimated completion
    const inProgressStep = workflow.steps.find(s => s.status === 'in_progress');
    let estimatedCompletion = null;

    if (inProgressStep) {
      const remainingSteps = workflow.steps.filter(s => s.status === 'pending').length + 1;
      const avgTimePerStep = 2; // minutes
      const remainingTime = remainingSteps * avgTimePerStep;
      estimatedCompletion = new Date(Date.now() + remainingTime * 60 * 1000);
    }

    return {
      workflowId: workflow.id,
      projectId,
      status: workflow.currentStep,
      progress,
      steps: workflow.steps.map(step => ({
        id: step.id,
        name: step.name,
        description: step.description,
        agent: step.agent,
        status: step.status,
        artifacts: step.artifacts.length,
        decisions: step.decisions.length
      })),
      completedSteps,
      totalSteps,
      estimatedCompletion
    };
  }

  /**
   * Store processed dataset
   */
  private static async storeDataset(
    projectId: string,
    fileName: string,
    processedData: any
  ): Promise<void> {
    const datasetId = `dataset_${projectId}_${Date.now()}`;

    await db.insert(datasets).values({
      id: datasetId,
      name: fileName,
      description: `Processed data from ${fileName}`,
      sourceType: 'file_upload',
      schemaDefinition: JSON.stringify(processedData.schema),
      recordCount: processedData.recordCount,
      sizeBytes: JSON.stringify(processedData.data).length,
      status: 'processed',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Link dataset to project (you might have a project_datasets junction table)
    // For now, we'll use the project's workflow metadata
  }

  /**
   * Generate and store artifacts from workflow results
   */
  private static async generateArtifacts(
    projectId: string,
    workflowResult: any
  ): Promise<void> {
    const artifacts = [];

    // Generate artifacts for each step
    for (const [stepId, stepResult] of Object.entries(workflowResult.steps)) {
      if ((stepResult as any).artifacts && (stepResult as any).artifacts.length > 0) {
        for (const artifactName of (stepResult as any).artifacts) {
          const artifactId = `artifact_${projectId}_${stepId}_${Date.now()}`;

          await db.insert(generatedArtifacts).values({
            id: artifactId,
            projectId,
            templateId: null,
            audienceProfileId: 'default_profile', // You might want to make this dynamic
            type: this.getArtifactType(stepId),
            title: `${stepId} - ${artifactName}`,
            content: JSON.stringify((stepResult as any).outputs),
            metadata: JSON.stringify({
              stepId,
              artifactName,
              generatedBy: (stepResult as any).agent || 'system'
            }),
            format: 'json',
            status: 'generated',
            generationTime: 0, // You might want to track this
            createdAt: new Date(),
            updatedAt: new Date()
          });

          artifacts.push(artifactId);
        }
      }
    }

    // Generate summary artifact
    const summaryId = `summary_${projectId}_${Date.now()}`;
    await db.insert(generatedArtifacts).values({
      id: summaryId,
      projectId,
      templateId: null,
      audienceProfileId: 'default_profile',
      type: 'summary',
      title: 'Workflow Summary',
      content: JSON.stringify({
        workflowId: workflowResult.workflowId,
        stepsCompleted: Object.keys(workflowResult.steps).length,
        totalDecisions: workflowResult.decisions.length,
        totalArtifacts: artifacts.length,
        completionTime: new Date()
      }),
      metadata: JSON.stringify({
        workflowType: 'enhanced_analysis',
        generatedBy: 'system'
      }),
      format: 'json',
      status: 'generated',
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  private static getArtifactType(stepId: string): string {
    const typeMap: Record<string, string> = {
      'file_upload': 'data_validation_report',
      'schema_generation': 'schema_analysis',
      'data_preparation': 'data_transformation_report',
      'statistical_analysis': 'statistical_report',
      'ml_analysis': 'ml_model_report',
      'visualization': 'data_visualization',
      'insight_generation': 'business_insights'
    };

    return typeMap[stepId] || 'analysis_output';
  }

  private static calculateProgress(workflowStep: string): number {
    const progressMap: Record<string, number> = {
      'not_started': 0,
      'initializing': 10,
      'questions': 20,
      'upload': 40,
      'scan': 50,
      'schema': 60,
      'analysis': 80,
      'complete': 100,
      'failed': 0
    };

    return progressMap[workflowStep] || 0;
  }

  /**
   * WebSocket management for real-time updates
   */
  static registerWebSocketClient(projectId: string, ws: WebSocket): void {
    this.websocketClients.set(projectId, ws);

    ws.on('close', () => {
      this.websocketClients.delete(projectId);
    });
  }

  static broadcastWorkflowEvent(event: WorkflowEvent): void {
    const ws = this.websocketClients.get(event.workflowId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }

    // Also broadcast to project-specific clients
    const clientEntries = Array.from(this.websocketClients.entries());
    for (const [projectId, client] of clientEntries) {
      if (projectId.includes(event.workflowId) && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(event));
      }
    }
  }

  /**
   * Pause workflow execution
   */
  static async pauseWorkflow(workflowId: string): Promise<void> {
    const workflow = EnhancedMCPService.getWorkflowStatus(workflowId);
    if (workflow) {
      // Mark current step as paused
      const currentStep = workflow.steps.find(s => s.status === 'in_progress');
      if (currentStep) {
        currentStep.status = 'pending';
      }

      this.broadcastWorkflowEvent({
        type: 'progress_update',
        workflowId,
        data: { message: 'Workflow paused by user' },
        timestamp: new Date()
      });
    }
  }

  /**
   * Resume workflow execution
   */
  static async resumeWorkflow(workflowId: string): Promise<void> {
    this.broadcastWorkflowEvent({
      type: 'progress_update',
      workflowId,
      data: { message: 'Workflow resumed' },
      timestamp: new Date()
    });

    // Resume workflow execution logic would go here
  }

  /**
   * Cancel workflow execution
   */
  static async cancelWorkflow(workflowId: string): Promise<void> {
    // Extract project ID from workflow ID
    const projectId = workflowId.includes('_') ? workflowId.split('_')[1] : workflowId;

    await db
      .update(projects)
      .set({
        workflowStep: 'cancelled',
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    this.broadcastWorkflowEvent({
      type: 'workflow_failed',
      workflowId,
      data: { message: 'Workflow cancelled by user' },
      timestamp: new Date()
    });
  }
}