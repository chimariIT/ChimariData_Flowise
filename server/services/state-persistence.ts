/**
 * State Persistence Service - Single Source of Truth for Journey Data
 *
 * CRITICAL FIX A-1: Unifies all journey-related data persistence
 *
 * Problem: Multiple persistence locations (journeyProgress, dataset.metadata, project.transformedData)
 *          cause state drift and inconsistency between pipeline steps
 *
 * Solution: Single source of truth with priority-based read/write strategy
 *
 * Created: March 18, 2026
 */

import { db } from '../db';
import { eq } from 'drizzle-orm';
import { projects, datasets, projectDatasets } from '@shared/schema';

/**
 * Journey state data types
 */
export interface TransformedData {
  data: any[];
  timestamp: string;
  rowCount: number;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetElement: string;
  confidence?: number;
}

export interface QuestionAnswerMapping {
  questionId: string;
  questionText: string;
  requiredDataElements: string[];
  recommendedAnalyses: string[];
  relatedDataElements: string[];
  confidence?: number;
}

export interface PIIExclusions {
  excludedColumns: string[];
  anonymizedColumns: string[];
  decision: 'exclude' | 'anonymize' | 'retain';
  confidence?: number;
  timestamp: string;
}

/**
 * Priority levels for data reads
 * Ensures the most authoritative source is used
 */
type DataPriority = 'journey_progress' | 'dataset_ingestion' | 'dataset_metadata' | 'project_level';

/**
 * State Persistence Service
 * Centralizes all journey data reads/writes with fallback strategy
 */
class StatePersistenceService {
  private static instance: StatePersistenceService;

  private constructor() {
    // Singleton pattern
  }

  public static getInstance(): StatePersistenceService {
    if (!StatePersistenceService.instance) {
      StatePersistenceService.instance = new StatePersistenceService();
    }
    return StatePersistenceService.instance;
  }

  /**
   * TRANSFORMED DATA
   * Priority: journey_progress > dataset_ingestion > dataset_metadata
   */

  /**
   * Get transformed data for a project
   * Reads from highest priority location that has data
   */
  async getTransformedData(projectId: string): Promise<TransformedData | null> {
    console.log(`[StatePersistence] Getting transformed data for project ${projectId}`);

    // Priority 1: journeyProgress.transformedData
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const journeyProgress = (project[0] as any)?.journeyProgress;
      if (journeyProgress?.transformedData) {
        console.log(`[StatePersistence] Found transformed data in journeyProgress`);
        return {
          data: journeyProgress.transformedData,
          timestamp: journeyProgress.transformedTimestamp || new Date().toISOString(),
          rowCount: journeyProgress.transformedData.length || 0
        };
      }
    }

    // Priority 2: dataset.ingestionMetadata.transformedData
    const projectDatasets = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId))
      .limit(10);

    if (projectDatasets.length > 0) {
      for (const pd of projectDatasets) {
        const dataset = await db
          .select()
          .from(datasets)
          .where(eq(datasets.id, pd.datasetId))
          .limit(1);

        if (dataset && dataset.length > 0) {
          const ingestionMetadata = (dataset[0] as any)?.ingestionMetadata;
          if (ingestionMetadata?.transformedData) {
            console.log(`[StatePersistence] Found transformed data in ingestionMetadata for dataset ${pd.datasetId}`);
            return {
              data: ingestionMetadata.transformedData,
              timestamp: ingestionMetadata.transformedTimestamp || new Date().toISOString(),
              rowCount: ingestionMetadata.transformedData.length || 0
            };
          }
        }
      }
    }

    // Priority 3: dataset.metadata.transformedData (legacy)
    if (project && project.length > 0) {
      const allDatasets = await db
        .select()
        .from(datasets)
        .where(eq(datasets.projectId, projectId));

      for (const dataset of allDatasets) {
        const metadata = (dataset as any)?.metadata;
        if (metadata?.transformedData) {
          console.log(`[StatePersistence] Found transformed data in dataset.metadata for dataset ${dataset.id}`);
          return {
            data: metadata.transformedData,
            timestamp: metadata.transformedTimestamp || new Date().toISOString(),
            rowCount: metadata.transformedData.length || 0
          };
        }
      }
    }

    console.warn(`[StatePersistence] No transformed data found for project ${projectId}`);
    return null;
  }

  /**
   * Set transformed data
   * Always writes to journeyProgress (highest priority)
   * Optionally updates dataset.ingestionMetadata for consistency
   */
  async setTransformedData(
    projectId: string,
    data: any[]
  ): Promise<void> {
    console.log(`[StatePersistence] Setting transformed data for project ${projectId}, rows: ${data.length}`);

    const timestamp = new Date().toISOString();

    // Primary write: journeyProgress
    await db
      .update(projects)
      .set({
        journeyProgress: sql`${projects.journeyProgress} || jsonb_build_object('transformedData', ${JSON.stringify(data)})::jsonb`,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    // Secondary writes for consistency (update ingestionMetadata of all project datasets)
    const projectDatasets = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId));

    for (const pd of projectDatasets) {
      await db
        .update(datasets)
        .set({
          ingestionMetadata: sql`${datasets.ingestionMetadata} || jsonb_build_object('transformedData', ${JSON.stringify(data)})::jsonb`,
          updatedAt: new Date()
        })
        .where(eq(datasets.id, pd.datasetId));
    }

    console.log(`[StatePersistence] Transformed data saved successfully`);
  }

  /**
   * COLUMN MAPPINGS
   * Priority: dataset.ingestionMetadata.columnMappings > requirementsDocument.sourceColumn
   */

  /**
   * Get column mappings for a project
   */
  async getColumnMappings(projectId: string): Promise<Record<string, ColumnMapping>> {
    console.log(`[StatePersistence] Getting column mappings for project ${projectId}`);

    // Priority 1: dataset.ingestionMetadata.columnMappings
    const projectDatasets = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId));

    const result: Record<string, ColumnMapping> = {};

    for (const pd of projectDatasets) {
      const dataset = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, pd.datasetId))
        .limit(1);

      if (dataset && dataset.length > 0) {
        const ingestionMetadata = (dataset[0] as any)?.ingestionMetadata;
        if (ingestionMetadata?.columnMappings) {
          Object.assign(result, ingestionMetadata.columnMappings);
        }
      }
    }

    if (Object.keys(result).length > 0) {
      console.log(`[StatePersistence] Found ${Object.keys(result).length} column mappings in ingestionMetadata`);
    } else {
      // Fallback: journeyProgress.columnMappings
      const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (project && project.length > 0) {
        const journeyProgress = (project[0] as any)?.journeyProgress;
        if (journeyProgress?.columnMappings) {
          console.log(`[StatePersistence] Found column mappings in journeyProgress (fallback)`);
          Object.assign(result, journeyProgress.columnMappings);
        }
      }
    }

    return result;
  }

  /**
   * Set column mappings
   * Writes to both journeyProgress and dataset.ingestionMetadata for consistency
   */
  async setColumnMappings(
    projectId: string,
    mappings: Record<string, ColumnMapping>
  ): Promise<void> {
    console.log(`[StatePersistence] Setting column mappings for project ${projectId}`);

    // Primary write: journeyProgress
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      await db
        .update(projects)
        .set({
          journeyProgress: sql`${projects.journeyProgress} || jsonb_set((projects.journeyProgress)::jsonb, 'columnMappings', ${JSON.stringify(mappings)})`,
          updatedAt: new Date()
        })
        .where(eq(projects.id, projectId));
    }

    // Secondary writes to ingestionMetadata of all project datasets
    const projectDatasets = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId));

    for (const pd of projectDatasets) {
      await db
        .update(datasets)
        .set({
          ingestionMetadata: sql`${datasets.ingestionMetadata} || jsonb_set((datasets.ingestionMetadata)::jsonb, 'columnMappings', ${JSON.stringify(mappings)})`,
          updatedAt: new Date()
        })
        .where(eq(datasets.id, pd.datasetId));
    }

    console.log(`[StatePersistence] Column mappings saved successfully`);
  }

  /**
   * QUESTION MAPPINGS
   * Priority: journeyProgress.questionAnswerMapping (single source)
   */

  /**
   * Get question-answer mappings
   */
  async getQuestionAnswerMapping(projectId: string): Promise<QuestionAnswerMapping[]> {
    console.log(`[StatePersistence] Getting question-answer mappings for project ${projectId}`);

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const journeyProgress = (project[0] as any)?.journeyProgress;
      if (journeyProgress?.questionAnswerMapping) {
        console.log(`[StatePersistence] Found ${journeyProgress.questionAnswerMapping.length} question-answer mappings`);
        return journeyProgress.questionAnswerMapping;
      }
    }

    console.warn(`[StatePersistence] No question-answer mappings found for project ${projectId}`);
    return [];
  }

  /**
   * Set question-answer mappings
   */
  async setQuestionAnswerMapping(
    projectId: string,
    mappings: QuestionAnswerMapping[]
  ): Promise<void> {
    console.log(`[StatePersistence] Setting question-answer mappings for project ${projectId}, count: ${mappings.length}`);

    await db
      .update(projects)
      .set({
        journeyProgress: sql`${projects.journeyProgress} || jsonb_set((projects.journeyProgress)::jsonb, 'questionAnswerMapping', ${JSON.stringify(mappings)})`,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    console.log(`[StatePersistence] Question-answer mappings saved successfully`);
  }

  /**
   * PII EXCLUSIONS
   * Priority: journeyProgress.piiDecision (single source)
   */

  /**
   * Get PII exclusions
   */
  async getPIIExclusions(projectId: string): Promise<PIIExclusions | null> {
    console.log(`[StatePersistence] Getting PII exclusions for project ${projectId}`);

    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const journeyProgress = (project[0] as any)?.journeyProgress;
      if (journeyProgress?.piiDecision) {
        console.log(`[StatePersistence] Found PII decision:`, journeyProgress.piiDecision);
        return journeyProgress.piiDecision;
      }
    }

    console.warn(`[StatePersistence] No PII exclusions found for project ${projectId}`);
    return null;
  }

  /**
   * Set PII exclusions
   */
  async setPIIExclusions(
    projectId: string,
    exclusions: PIIExclusions
  ): Promise<void> {
    console.log(`[StatePersistence] Setting PII exclusions for project ${projectId}`);

    const exclusionsWithTimestamp = {
      ...exclusions,
      timestamp: new Date().toISOString()
    };

    await db
      .update(projects)
      .set({
        journeyProgress: sql`${projects.journeyProgress} || jsonb_set((projects.journeyProgress)::jsonb, 'piiDecision', ${JSON.stringify(exclusionsWithTimestamp)})`,
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    console.log(`[StatePersistence] PII exclusions saved successfully`);
  }

  /**
   * MIGRATION HELPERS
   * Methods to help migrate from old persistence patterns
   */

  /**
   * Migrate existing project data to new structure
   * Call this once per project when upgrading
   */
  async migrateProjectData(projectId: string): Promise<void> {
    console.log(`[StatePersistence] Migrating project ${projectId} data to unified structure`);

    // Collect data from all old locations
    const oldTransformedData = await this.getTransformedDataFromOldLocations(projectId);
    const oldColumnMappings = await this.getColumnMappingsFromOldLocations(projectId);
    const oldQuestionMappings = await this.getQuestionAnswerMappingFromOldLocations(projectId);
    const oldPIIExclusions = await this.getPIIExclusionsFromOldLocations(projectId);

    // Write to new unified structure
    const migrationPromises: Promise<void>[] = [];

    if (oldTransformedData) {
      migrationPromises.push(this.setTransformedData(projectId, oldTransformedData.data));
    }

    if (Object.keys(oldColumnMappings).length > 0) {
      migrationPromises.push(this.setColumnMappings(projectId, oldColumnMappings));
    }

    if (oldQuestionMappings.length > 0) {
      migrationPromises.push(this.setQuestionAnswerMapping(projectId, oldQuestionMappings));
    }

    if (oldPIIExclusions) {
      migrationPromises.push(this.setPIIExclusions(projectId, oldPIIExclusions));
    }

    await Promise.all(migrationPromises);
    console.log(`[StatePersistence] Migration complete for project ${projectId}`);
  }

  /**
   * Helper to read transformed data from old locations
   */
  private async getTransformedDataFromOldLocations(projectId: string): Promise<TransformedData | null> {
    // Try journeyProgress.transformedData first
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const journeyProgress = (project[0] as any)?.journeyProgress;
      if (journeyProgress?.transformedData) {
        return {
          data: journeyProgress.transformedData,
          timestamp: journeyProgress.transformedTimestamp || new Date().toISOString(),
          rowCount: journeyProgress.transformedData.length || 0
        };
      }
    }

    // Try dataset.ingestionMetadata.transformedData
    const projectDatasets = await db
      .select()
      .from(projectDatasets)
      .where(eq(projectDatasets.projectId, projectId));

    for (const pd of projectDatasets) {
      const dataset = await db
        .select()
        .from(datasets)
        .where(eq(datasets.id, pd.datasetId))
        .limit(1);

      if (dataset && dataset.length > 0) {
        const ingestionMetadata = (dataset[0] as any)?.ingestionMetadata;
        if (ingestionMetadata?.transformedData) {
          return {
            data: ingestionMetadata.transformedData,
            timestamp: ingestionMetadata.transformedTimestamp || new Date().toISOString(),
            rowCount: ingestionMetadata.transformedData.length || 0
          };
        }
      }
    }

    // Try dataset.metadata.transformedData (legacy)
    const allDatasets = await db
      .select()
      .from(datasets)
      .where(eq(datasets.projectId, projectId));

    for (const dataset of allDatasets) {
      const metadata = (dataset as any)?.metadata;
      if (metadata?.transformedData) {
        return {
          data: metadata.transformedData,
          timestamp: metadata.transformedTimestamp || new Date().toISOString(),
          rowCount: metadata.transformedData.length || 0
        };
      }
    }

    return null;
  }

  /**
   * Helper to read column mappings from old locations
   */
  private async getColumnMappingsFromOldLocations(projectId: string): Promise<Record<string, ColumnMapping>> {
    // Try requirementsDocument.sourceColumn
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const requirementsDocument = (project[0] as any)?.journeyProgress?.requirementsDocument;
      if (requirementsDocument?.sourceColumn) {
        return requirementsDocument.sourceColumn as Record<string, ColumnMapping>;
      }
    }

    // Fallback to journeyProgress.columnMappings
    return await this.getColumnMappings(projectId);
  }

  /**
   * Helper to read question-answer mappings from old locations
   */
  private async getQuestionAnswerMappingFromOldLocations(projectId: string): Promise<QuestionAnswerMapping[]> {
    // Try requirementsDocument.questionAnswerMapping
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const requirementsDocument = (project[0] as any)?.journeyProgress?.requirementsDocument;
      if (requirementsDocument?.questionAnswerMapping) {
        console.log(`[StatePersistence] Found question mappings in requirementsDocument`);
        return requirementsDocument.questionAnswerMapping;
      }
    }

    // Fallback to journeyProgress.questionAnswerMapping
    return await this.getQuestionAnswerMapping(projectId);
  }

  /**
   * Helper to read PII exclusions from old locations
   */
  private async getPIIExclusionsFromOldLocations(projectId: string): Promise<PIIExclusions | null> {
    // Try journeyProgress.piiDecision
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project && project.length > 0) {
      const journeyProgress = (project[0] as any)?.journeyProgress;
      if (journeyProgress?.piiDecision) {
        return journeyProgress.piiDecision;
      }
    }

    return null;
  }
}

// Export singleton instance
export const statePersistence = StatePersistenceService.getInstance();
