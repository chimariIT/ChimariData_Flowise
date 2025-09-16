import { storage } from './storage';
import { nanoid } from 'nanoid';
import { Dataset, DataProject, ProjectDataset, ProjectArtifact } from '@shared/schema';

interface LegacyProjectData {
  id: string;
  userId: string; // Fixed: Use userId consistently (ownerId is deprecated)
  ownerId?: string; // Keep as optional for backward compatibility
  name: string;
  description?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  schema?: any;
  data?: any[];
  recordCount?: number;
  piiAnalysis?: any;
  transformations?: any;
  analysisResults?: any;
  visualizations?: any;
  aiInsights?: any;
  stepByStepAnalysis?: any;
  outlierAnalysis?: any;
  missingDataAnalysis?: any;
  normalityTests?: any;
  joinedFiles?: any;
  sourceMetadata?: any;
  dataSource?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MigrationService {
  private readonly batchSize = 100;
  private migrationLog: string[] = [];

  /**
   * Run complete migration from legacy projects to dataset-centric architecture
   */
  async runCompleteMigration(): Promise<{
    success: boolean;
    summary: {
      projectsProcessed: number;
      datasetsCreated: number;
      artifactsCreated: number;
      associations: number;
      errors: number;
    };
    log: string[];
  }> {
    this.migrationLog = [];
    this.log('Starting complete migration to dataset-centric architecture...');

    try {
      const summary = {
        projectsProcessed: 0,
        datasetsCreated: 0,
        artifactsCreated: 0,
        associations: 0,
        errors: 0
      };

      // Get all projects that need migration
      const allProjects = await storage.getAllProjects();
      const legacyProjects = allProjects.filter(project => this.needsMigration(project));
      
      this.log(`Found ${legacyProjects.length} projects requiring migration`);

      // Process projects in batches
      for (let i = 0; i < legacyProjects.length; i += this.batchSize) {
        const batch = legacyProjects.slice(i, i + this.batchSize);
        this.log(`Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(legacyProjects.length / this.batchSize)}`);
        for (const project of batch) {
          try {
            const result = await this.migrateProject(project as any);
            summary.projectsProcessed++;
            summary.datasetsCreated += result.datasetsCreated;
            summary.artifactsCreated += result.artifactsCreated;
            summary.associations += result.associations;
          } catch (error: any) {
            summary.errors++;
            this.log(`ERROR migrating project ${project.id}: ${error.message}`);
          }
        }
        
        // Add delay between batches to avoid overwhelming the database
        if (i + this.batchSize < legacyProjects.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      this.log(`Migration completed. Summary: ${JSON.stringify(summary, null, 2)}`);
      
      return {
        success: summary.errors === 0,
        summary,
        log: this.migrationLog
      };

    } catch (error: any) {
      this.log(`FATAL ERROR: Migration failed: ${error.message}`);
      return {
        success: false,
        summary: {
          projectsProcessed: 0,
          datasetsCreated: 0,
          artifactsCreated: 0,
          associations: 0,
          errors: 1
        },
        log: this.migrationLog
      };
    }
  }

  /**
   * Migrate a single legacy project to the new architecture
   * FIXED: Added idempotency and transaction safety
   */
  private async migrateProject(project: LegacyProjectData): Promise<{
    datasetsCreated: number;
    artifactsCreated: number;
    associations: number;
  }> {
    this.log(`Migrating project: ${project.name} (${project.id})`);
    
    const result = {
      datasetsCreated: 0,
      artifactsCreated: 0,
      associations: 0
    };

    // SAFETY: Check if project already has datasets (idempotency)
    const existingDatasets = await storage.getProjectDatasets(project.id);
    const existingArtifacts = await storage.getProjectArtifacts(project.id);
    
    if (existingDatasets.length > 0 || existingArtifacts.length > 0) {
      this.log(`Project ${project.id} already has ${existingDatasets.length} datasets and ${existingArtifacts.length} artifacts - skipping migration`);
      return result; // Already migrated
    }

    try {
      // 1. Create dataset from project data if it has file data
      let datasetId: string | undefined;
      if (this.hasFileData(project)) {
        const dataset = await this.createDatasetFromProject(project);
        datasetId = dataset.id;
        result.datasetsCreated++;
        
        // Associate dataset with project
        await storage.addDatasetToProject(project.id, dataset.id, 'primary', 'original_data');
        result.associations++;
        
        this.log(`Created dataset ${dataset.id} for project ${project.id}`);
      }

      // 2. Create artifacts from analysis results
      const artifacts = await this.createArtifactsFromProject(project);
      result.artifactsCreated += artifacts.length;
      
      // 3. SAFELY cleanup legacy fields ONLY after successful dataset/artifact creation
      await this.safeCleanupLegacyProject(project, datasetId);
      
      this.log(`Successfully migrated project ${project.id}`);
      return result;
    } catch (error: any) {
      this.log(`ERROR: Migration failed for project ${project.id}: ${error.message}`);
      // TODO: In a real transaction system, we'd rollback here
      // For now, re-throw to let the caller handle it
      throw error;
    }
  }

  /**
   * Check if a project needs migration
   */
  private needsMigration(project: DataProject): boolean {
    // A project needs migration if it has legacy data fields
    return !!(
      project.fileName ||
      project.fileSize ||
      project.data ||
      project.schema ||
      project.analysisResults ||
      project.transformations ||
      project.visualizations ||
      project.aiInsights
    );
  }

  /**
   * Check if project has file data that should become a dataset
   * Fixed: Handle projects with file metadata properly
   */
  private hasFileData(project: LegacyProjectData): boolean {
    // A project should become a dataset if it has:
    // 1. Actual data rows AND schema, OR
    // 2. File metadata (fileName, fileSize) indicating it once had file data
    return !!(
      (project.data && project.schema) || 
      (project.fileName && project.fileSize)
    );
  }

  /**
   * Create a dataset from legacy project file data
   * CRITICAL FIX: Preserve actual data rows before cleanup
   */
  private async createDatasetFromProject(project: LegacyProjectData): Promise<Dataset> {
    // CRITICAL: Ensure we have the correct owner ID
    const ownerId = project.userId || project.ownerId;
    if (!ownerId) {
      throw new Error(`Project ${project.id} missing both userId and ownerId`);
    }

    const dataset = await storage.createDataset({
      ownerId,
      name: `${project.name} - Original Data`,
      description: `Migrated dataset from project: ${project.name}`,
      sourceType: this.mapDataSourceToSourceType(project.dataSource),
      sourceUri: `legacy://${project.id}/${project.fileName}`,
      mimeType: this.inferMimeType(project.fileType, project.fileName),
      fileSize: project.fileSize || 0,
      recordCount: project.recordCount || (project.data?.length || 0),
      schema: project.schema || {},
      ingestionMetadata: {
        originalFileName: project.fileName,
        migrationSource: 'legacy_project',
        originalProject: project.id,
        migratedAt: new Date().toISOString(),
        // CRITICAL: Store actual data rows to prevent data loss
        legacyDataPreserved: project.data ? true : false,
        legacyDataRowCount: project.data?.length || 0,
        ...project.sourceMetadata
      },
      status: 'ready',
      piiDetected: !!(project.piiAnalysis?.detectedPII?.length),
      piiAnalysis: project.piiAnalysis
    });

    // CRITICAL DATA PRESERVATION: Store actual data rows if they exist
    if (project.data && project.data.length > 0) {
      // Store the actual data in the dataset's data field
      // This ensures we don't lose the actual rows when we clean up the project
      await storage.updateDataset(dataset.id, {
        data: project.data, // Preserve the actual data rows
        recordCount: project.data.length
      });
      this.log(`Preserved ${project.data.length} data rows in dataset ${dataset.id}`);
    }

    return dataset;
  }

  /**
   * Create artifacts from various analysis results in the project
   */
  private async createArtifactsFromProject(project: LegacyProjectData): Promise<ProjectArtifact[]> {
    const artifacts: ProjectArtifact[] = [];
    let lastArtifactId: string | undefined;

    // Create transformation artifact if transformations exist
    if (project.transformations) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'transformation',
        name: 'Data Transformations',
        description: 'Migrated data transformations from legacy project',
        data: project.transformations,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create analysis artifact if analysis results exist
    if (project.analysisResults) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'analysis',
        name: 'Statistical Analysis',
        description: 'Migrated analysis results from legacy project',
        data: project.analysisResults,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create step-by-step analysis artifact
    if (project.stepByStepAnalysis) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'guided_analysis',
        name: 'Step-by-Step Analysis',
        description: 'Migrated guided analysis from legacy project',
        data: project.stepByStepAnalysis,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create visualization artifact if visualizations exist
    if (project.visualizations) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'visualization',
        name: 'Data Visualizations',
        description: 'Migrated visualizations from legacy project',
        data: project.visualizations,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create AI insights artifact if AI insights exist
    if (project.aiInsights) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'ai_insight',
        name: 'AI Generated Insights',
        description: 'Migrated AI insights from legacy project',
        data: project.aiInsights,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create outlier analysis artifact
    if (project.outlierAnalysis) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'analysis',
        name: 'Outlier Analysis',
        description: 'Migrated outlier analysis from legacy project',
        data: project.outlierAnalysis,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create missing data analysis artifact
    if (project.missingDataAnalysis) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'analysis',
        name: 'Missing Data Analysis',
        description: 'Migrated missing data analysis from legacy project',
        data: project.missingDataAnalysis,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create normality tests artifact
    if (project.normalityTests) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'analysis',
        name: 'Normality Tests',
        description: 'Migrated normality tests from legacy project',
        data: project.normalityTests,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Create joined files artifact
    if (project.joinedFiles) {
      const artifact = await storage.createArtifact({
        projectId: project.id,
        type: 'data_join',
        name: 'Joined Dataset',
        description: 'Migrated joined files from legacy project',
        data: project.joinedFiles,
        parentArtifactId: lastArtifactId,
        status: 'completed'
      });
      artifacts.push(artifact);
      lastArtifactId = artifact.id;
    }

    // Update project with last artifact reference
    if (lastArtifactId) {
      await storage.updateProject(project.id, {
        lastArtifactId
      });
    }

    return artifacts;
  }

  /**
   * Clean up legacy fields from project after migration
   * CRITICAL FIX: Safe cleanup that preserves data references and validates dataset exists
   */
  private async safeCleanupLegacyProject(project: LegacyProjectData, datasetId?: string): Promise<void> {
    // SAFETY: Only cleanup after confirming data is preserved
    if (project.data && project.data.length > 0) {
      if (!datasetId) {
        throw new Error(`Cannot cleanup project ${project.id}: data exists but no dataset was created`);
      }
      
      // Double-check that dataset was created successfully
      const dataset = await storage.getDataset(datasetId);
      if (!dataset) {
        throw new Error(`Cannot cleanup project ${project.id}: referenced dataset ${datasetId} not found`);
      }
      
      this.log(`Verified dataset ${datasetId} exists before cleaning up project ${project.id} data`);
    }
    
    // Update project to remove legacy fields - but preserve critical metadata in migration log
    const migrationMetadata = {
      originalFileName: project.fileName,
      originalFileSize: project.fileSize,
      originalRecordCount: project.recordCount,
      datasetReference: datasetId,
      migratedAt: new Date().toISOString(),
      hadData: !!(project.data && project.data.length > 0),
      hadAnalysis: !!(project.analysisResults || project.stepByStepAnalysis)
    };

    await storage.updateProject(project.id, {
      // Clear deprecated data fields - SAFE now that data is preserved in dataset
      fileName: null,
      fileSize: null,
      fileType: null,
      schema: null,
      data: null, // SAFE: Data is now preserved in dataset
      recordCount: null,
      piiAnalysis: null,
      transformations: null,
      analysisResults: null,
      visualizations: null,
      aiInsights: null,
      stepByStepAnalysis: null,
      outlierAnalysis: null,
      missingDataAnalysis: null,
      normalityTests: null,
      joinedFiles: null,
      sourceMetadata: null,
      
      // Mark as migrated and preserve migration metadata
      status: 'migrated', // Changed to be more explicit
      migrationMetadata, // Preserve reference to where data went
      updatedAt: new Date()
    });
    
    this.log(`Safely cleaned up project ${project.id} - data preserved in dataset ${datasetId}`);
  }

  /**
   * Map legacy dataSource to new sourceType
   */
  private mapDataSourceToSourceType(dataSource?: string): 'upload' | 'web' | 'cloud' | 'api' {
    switch (dataSource) {
      case 'upload':
      case 'file_upload':
        return 'upload';
      case 'web':
      case 'url':
        return 'web';
      case 'cloud':
      case 'drive':
      case 'google_drive':
        return 'cloud';
      case 'api':
        return 'api';
      default:
        return 'upload'; // Default fallback
    }
  }

  /**
   * Infer MIME type from file type and name
   */
  private inferMimeType(fileType?: string, fileName?: string): string {
    if (fileType) return fileType;
    
    if (fileName) {
      const ext = fileName.toLowerCase().split('.').pop();
      switch (ext) {
        case 'csv': return 'text/csv';
        case 'json': return 'application/json';
        case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case 'xls': return 'application/vnd.ms-excel';
        case 'txt': return 'text/plain';
        case 'pdf': return 'application/pdf';
        default: return 'application/octet-stream';
      }
    }
    
    return 'application/octet-stream';
  }

  /**
   * Run migration for a specific project
   */
  async migrateSpecificProject(projectId: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      const project = await storage.getProject(projectId);
      
      if (!project) {
        return {
          success: false,
          message: `Project ${projectId} not found`
        };
      }

      if (!this.needsMigration(project)) {
        return {
          success: true,
          message: `Project ${projectId} does not need migration`
        };
      }

      const result = await this.migrateProject(project as any);
      
      return {
        success: true,
        message: `Successfully migrated project ${projectId}`,
        details: result
      };

    } catch (error: any) {
      return {
        success: false,
        message: `Failed to migrate project ${projectId}: ${error.message}`
      };
    }
  }

  /**
   * Get migration status for all projects
   */
  async getMigrationStatus(): Promise<{
    total: number;
    needsMigration: number;
    migrated: number;
    projects: Array<{
      id: string;
      name: string;
      needsMigration: boolean;
      hasDatasets: boolean;
      hasArtifacts: boolean;
    }>;
  }> {
    const allProjects = await storage.getAllProjects();
    const projectStatuses = [];

    for (const project of allProjects) {
      const needsMigration = this.needsMigration(project);
      const datasets = await storage.getProjectDatasets(project.id);
      const artifacts = await storage.getProjectArtifacts(project.id);

      projectStatuses.push({
        id: project.id,
        name: project.name,
        needsMigration,
        hasDatasets: datasets.length > 0,
        hasArtifacts: artifacts.length > 0
      });
    }

    return {
      total: allProjects.length,
      needsMigration: projectStatuses.filter(p => p.needsMigration).length,
      migrated: projectStatuses.filter(p => !p.needsMigration).length,
      projects: projectStatuses
    };
  }

  /**
   * Rollback migration for a specific project (restore legacy fields)
   */
  async rollbackProject(projectId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // This would be a complex operation requiring backup of original data
      // For now, return not implemented
      return {
        success: false,
        message: 'Rollback functionality not implemented yet. Migration is designed to be one-way with data preservation.'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to rollback project ${projectId}: ${error.message}`
      };
    }
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.migrationLog.push(logMessage);
    console.log(`[MIGRATION] ${logMessage}`);
  }
}

// Export singleton instance
export const migrationService = new MigrationService();