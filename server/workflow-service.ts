import { db } from "./db";
import { projects, serviceWorkflows, dataUploads } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import { MalwareScanner } from "./malware-scanner";
import { nanoid } from "nanoid";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
}

export interface ServiceWorkflowConfig {
  serviceType: 'pay_per_analysis' | 'expert_consulting' | 'automated_analysis' | 'enterprise';
  steps: WorkflowStep[];
  currentStepIndex: number;
}

/**
 * Service Workflow Management
 * Handles the universal workflow for all four services
 */
export class WorkflowService {
  private static readonly WORKFLOW_STEPS = {
    questions: {
      id: 'questions',
      title: 'Analysis Questions',
      description: 'Define what you want to learn from your data',
      required: true,
    },
    upload: {
      id: 'upload',
      title: 'Data Upload',
      description: 'Upload data from computer, cloud, or REST API',
      required: true,
    },
    scan: {
      id: 'scan',
      title: 'Security Scan',
      description: 'Malware scanning and security validation',
      required: true,
    },
    schema: {
      id: 'schema',
      title: 'Schema Analysis',
      description: 'Automatic data structure detection and column analysis',
      required: true,
    },
    analysis: {
      id: 'analysis',
      title: 'Data Analysis',
      description: 'Execute analysis based on service type',
      required: true,
    },
    complete: {
      id: 'complete',
      title: 'Results & Delivery',
      description: 'Review results and download reports',
      required: false,
    },
  };

  /**
   * Initialize workflow for a project
   */
  static async initializeWorkflow(
    projectId: string,
    serviceType: string,
    userId: number
  ): Promise<ServiceWorkflowConfig> {
    // Create or update workflow record
    const [workflow] = await db
      .insert(serviceWorkflows)
      .values({
        projectId,
        serviceType,
        currentStep: 'questions',
        stepData: {},
        completedSteps: [],
        userId,
      })
      .onConflictDoUpdate({
        target: [serviceWorkflows.projectId],
        set: {
          currentStep: 'questions',
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.getWorkflowConfig(serviceType, 'questions');
  }

  /**
   * Get workflow configuration for service type
   */
  static getWorkflowConfig(
    serviceType: string,
    currentStep: string = 'questions'
  ): ServiceWorkflowConfig {
    const stepOrder = ['questions', 'upload', 'scan', 'schema', 'analysis', 'complete'];
    const currentStepIndex = stepOrder.indexOf(currentStep);

    const steps: WorkflowStep[] = stepOrder.map((stepId, index) => ({
      ...(this.WORKFLOW_STEPS as unknown as Record<string, WorkflowStep>)[stepId],
      completed: index < currentStepIndex,
    }));

    return {
      serviceType: serviceType as any,
      steps,
      currentStepIndex,
    };
  }

  /**
   * Update workflow step
   */
  static async updateWorkflowStep(
    projectId: string,
    stepId: string,
    stepData: any = {}
  ): Promise<void> {
    const stepOrder = ['questions', 'upload', 'scan', 'schema', 'analysis', 'complete'];
    const currentIndex = stepOrder.indexOf(stepId);
    const nextStep = stepOrder[currentIndex + 1] || 'complete';

    // Update workflow
    await db
      .update(serviceWorkflows)
      .set({
        currentStep: nextStep,
        stepData: stepData,
        updatedAt: new Date(),
      })
      .where(eq(serviceWorkflows.projectId, projectId));

    // Update project workflow step
    await db
      .update(projects)
      .set({
        workflowStep: nextStep,
      })
      .where(eq(projects.id, projectId));
  }

  /**
   * Process questions step
   */
  static async processQuestionsStep(
    projectId: string,
    questions: string[],
    analysisType: string = 'standard'
  ): Promise<void> {
    // Update project with questions
    await db
      .update(projects)
      .set({
        questions: questions,
        analysisType,
      })
      .where(eq(projects.id, projectId));

    // Move to next step
    await this.updateWorkflowStep(projectId, 'questions', {
      questions,
      analysisType,
      completedAt: new Date(),
    });
  }

  /**
   * Process upload step
   */
  static async processUploadStep(
    projectId: string,
    sourceType: string,
    fileInfo: {
      filename: string;
      size: number;
      mimeType: string;
      uploadPath: string;
    }
  ): Promise<{ uploadId: string; scanRequired: boolean }> {
    // Create upload record
    const [upload] = await db
      .insert(dataUploads)
      .values({
        id: nanoid(),
        projectId,
        fileName: fileInfo.filename,
        fileSize: fileInfo.size,
        uploadPath: fileInfo.uploadPath,
        processingStatus: 'pending',
      })
      .returning();

    // Update project data source
    await db
      .update(projects)
      .set({
        dataSource: sourceType,
        dataSizeMB: Math.round(fileInfo.size / (1024 * 1024)),
      })
      .where(eq(projects.id, projectId));

    // Move to scan step
    await this.updateWorkflowStep(projectId, 'upload', {
      sourceType,
      uploadId: upload.id,
      fileInfo,
      completedAt: new Date(),
    });

    return {
      uploadId: upload.id,
      scanRequired: true,
    };
  }

  /**
   * Process security scan step
   */
  static async processScanStep(
    projectId: string,
    uploadId: string
  ): Promise<{ clean: boolean; threats: string[] }> {
    // Get upload info
    const [upload] = await db
      .select()
      .from(dataUploads)
      .where(eq(dataUploads.id, uploadId));

    if (!upload) {
      throw new Error('Upload not found');
    }

    // Perform malware scan
    const scanResult = await MalwareScanner.scanFile(
      upload.uploadPath!,
      upload.mimeType
    );

    // Update upload with scan results
    await db
      .update(dataUploads)
      .set({
        malwareScanResult: scanResult,
        processingStatus: scanResult.clean ? 'complete' : 'failed',
      })
      .where(eq(dataUploads.id, uploadId));

    // Update project scan status
    await db
      .update(projects)
      .set({
        malwareScanStatus: scanResult.clean ? 'clean' : 'infected',
      })
      .where(eq(projects.id, projectId));

    if (scanResult.clean) {
      // Move to schema step
      await this.updateWorkflowStep(projectId, 'scan', {
        scanResult,
        completedAt: new Date(),
      });
    }

    return {
      clean: scanResult.clean,
      threats: scanResult.threats,
    };
  }

  /**
   * Get workflow status for project
   */
  static async getWorkflowStatus(projectId: string): Promise<ServiceWorkflowConfig | null> {
    const [workflow] = await db
      .select()
      .from(serviceWorkflows)
      .where(eq(serviceWorkflows.projectId, projectId));

    if (!workflow) {
      return null;
    }

    return this.getWorkflowConfig(workflow.serviceType, workflow.currentStep);
  }

  /**
   * Validate step completion requirements
   */
  static validateStepRequirements(
    stepId: string,
    data: any
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (stepId) {
      case 'questions':
        if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
          errors.push('At least one analysis question is required');
        }
        break;

      case 'upload':
        if (!data.sourceType) {
          errors.push('Data source type is required');
        }
        if (!data.fileInfo?.filename) {
          errors.push('File information is required');
        }
        break;

      case 'scan':
        if (!data.uploadId) {
          errors.push('Upload ID is required for scanning');
        }
        break;

      case 'schema':
        if (!data.schema || Object.keys(data.schema).length === 0) {
          errors.push('Data schema is required');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * P1-2: Validate step transition requirements for consolidated journey
   * This ensures data availability before users can proceed to the next step
   */
  static validateStepTransition(
    fromStep: string,
    toStep: string,
    projectData: {
      datasets?: any[];
      journeyProgress?: any;
      analysisResults?: any;
      requirementsDocument?: any;
    }
  ): { canProceed: boolean; missingRequirements: string[]; warnings: string[] } {
    const missingRequirements: string[] = [];
    const warnings: string[] = [];

    // Define step order for validation
    const stepOrder = ['data', 'prepare', 'data-verification', 'data-transformation', 'plan', 'execute', 'pricing', 'results'];
    const fromIndex = stepOrder.indexOf(fromStep);
    const toIndex = stepOrder.indexOf(toStep);

    // Allow going back to any previous step
    if (toIndex < fromIndex) {
      return { canProceed: true, missingRequirements: [], warnings: [] };
    }

    // Validate based on target step
    switch (toStep) {
      case 'prepare':
        // Requires datasets to be uploaded
        if (!projectData.datasets || projectData.datasets.length === 0) {
          missingRequirements.push('At least one dataset must be uploaded');
        }
        break;

      case 'data-verification':
        // Requires datasets and goals/questions from prepare step
        if (!projectData.datasets || projectData.datasets.length === 0) {
          missingRequirements.push('At least one dataset must be uploaded');
        }
        if (!projectData.journeyProgress?.userGoal && !projectData.requirementsDocument?.userGoals?.length) {
          warnings.push('Analysis goal is recommended for better results');
        }
        break;

      case 'data-transformation':
        // Requires data quality check to be completed
        if (!projectData.journeyProgress?.piiDecision && !projectData.journeyProgress?.piiDecisionsByFile) {
          warnings.push('PII decisions should be reviewed before transformation');
        }
        if (!projectData.journeyProgress?.dataQuality) {
          warnings.push('Data quality should be reviewed');
        }
        break;

      case 'plan':
        // Requires requirements document
        if (!projectData.requirementsDocument && !projectData.journeyProgress?.requirementsDocument) {
          missingRequirements.push('Requirements document must be generated');
        }
        break;

      case 'execute':
        // Requires analysis plan to be approved
        if (!projectData.journeyProgress?.analysisPlan && !projectData.journeyProgress?.analysisPath) {
          missingRequirements.push('Analysis plan must be generated');
        }
        break;

      case 'pricing':
        // Requires execution to be started/completed
        if (!projectData.analysisResults && !projectData.journeyProgress?.executionStarted) {
          missingRequirements.push('Analysis execution must be started');
        }
        break;

      case 'results':
        // Requires execution to be completed
        if (!projectData.analysisResults) {
          missingRequirements.push('Analysis must be completed');
        }
        break;
    }

    return {
      canProceed: missingRequirements.length === 0,
      missingRequirements,
      warnings
    };
  }
}