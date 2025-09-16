import { db } from "./db";
import { projects, serviceWorkflows, dataUploads } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { MalwareScanner } from "./malware-scanner";

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
      ...this.WORKFLOW_STEPS[stepId],
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
  ): Promise<{ uploadId: number; scanRequired: boolean }> {
    // Create upload record
    const [upload] = await db
      .insert(dataUploads)
      .values({
        projectId,
        sourceType,
        originalFilename: fileInfo.filename,
        fileSize: fileInfo.size,
        mimeType: fileInfo.mimeType,
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
    uploadId: number
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
}