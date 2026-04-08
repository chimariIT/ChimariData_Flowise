/**
 * Data Elements Service
 *
 * Domain: Data Element Mapping & Operations
 * Responsibilities: Retrieve required data elements, business definitions
 */

import { storage } from '../../services/storage';
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  UnauthorizedError,
} from '../../shared/utils/error-handling';

export interface DataElementsDocument {
  documentId: string;
  projectId: string;
  version: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  createdAt: string;
  updatedAt: string;
  analysisPath: string[];
  requiredDataElements: any[];
  completeness?: any;
  gaps?: any[];
  recommendations?: any[];
  questionAnswerMapping?: any[];
  userQuestions?: any[];
  transformationPlan?: any[];
  industryDomain?: string;
  requirementsLocked?: boolean;
  requirementsLockedAt?: string;
}

export interface GetElementsInput {
  projectId: string;
  userId: string;
}

export interface EnrichElementsInput {
  projectId: string;
  userId: string;
  elements: any[];
}

export interface UpdateMappingInput {
  projectId: string;
  userId: string;
  columnMappings: any[];
}

export interface ValidateMappingInput {
  projectId: string;
  userId: string;
  mapping: any;
}

export interface PMSupervisedMappingInput {
  projectId: string;
  userId: string;
  context: any;
}

export class DataElementsService {
  /**
   * Get required data elements document
   */
  async getRequiredDataElements(
    input: GetElementsInput
  ): Promise<{ success: boolean; document?: DataElementsDocument }> {
    const { projectId, userId } = input;

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Check journey progress for requirements document (SSOT from Prepare step)
    const journeyProgress = (project as any)?.journeyProgress || {};
    const doc = journeyProgress.requirementsDocument;

    if (doc) {
      console.log(`[Elements] Found document in journeyProgress for project ${projectId}:`, {
        elementsCount: doc.requiredDataElements?.length || 0,
        analysisPathCount: doc.analysisPath?.length || 0,
        firstElement: doc.requiredDataElements?.[0]?.elementName || 'none',
        documentId: doc.documentId,
      });

      return {
        success: true,
        document: {
          documentId: doc.documentId || `doc_${projectId}`,
          projectId: projectId,
          version: doc.version || '1.0',
          status: doc.status || 'complete',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || new Date().toISOString(),
          analysisPath: doc.analysisPath || [],
          requiredDataElements: doc.requiredDataElements || [],
          completeness: doc.completeness,
          gaps: doc.gaps || [],
          recommendations: doc.recommendations || [],
          questionAnswerMapping: doc.questionAnswerMapping || [],
          userQuestions: journeyProgress.userQuestions || [],
          transformationPlan: doc.transformationPlan || [],
          industryDomain: doc.industryDomain,
          requirementsLocked: doc.requirementsLocked || false,
          requirementsLockedAt: doc.requirementsLockedAt,
        },
        metadata: {
          source: 'journeyProgress',
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // Fallback: Get dataset linked to this project
    const datasets = await storage.getProjectDatasets(projectId);

    if (!datasets || datasets.length === 0) {
      // No datasets yet - return empty document instead of 404
      console.log(`[Elements] No datasets found, returning empty document for project ${projectId}`);
      return {
        success: true,
        document: {
          documentId: `doc_${projectId}`,
          projectId: projectId,
          version: '1.0',
          status: 'pending',
          requiredDataElements: [],
          analysisPath: [],
          gaps: [],
          recommendations: [],
          questionAnswerMapping: [],
          userQuestions: journeyProgress.userQuestions || [],
          transformationPlan: [],
          requirementsLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        metadata: {
          source: 'empty',
          message: 'No requirements document generated yet. Complete Prepare step first.',
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const dataset = datasets[0].dataset;
    const ingestionMetadata = (dataset as any).ingestionMetadata;

    if (!ingestionMetadata?.dataRequirementsDocument) {
      // No document in dataset - return empty document
      console.log(`[Elements] No document in dataset, returning empty for project ${projectId}`);
      return {
        success: true,
        document: {
          documentId: `doc_${projectId}`,
          projectId: projectId,
          version: '1.0',
          status: 'pending',
          requiredDataElements: [],
          analysisPath: [],
          gaps: [],
          recommendations: [],
          questionAnswerMapping: [],
          userQuestions: journeyProgress.userQuestions || [],
          transformationPlan: [],
          requirementsLocked: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        metadata: {
          source: 'empty',
          datasetId: dataset.id,
          message: 'Requirements document not yet generated. Complete Prepare step.',
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const datasetDoc = ingestionMetadata.dataRequirementsDocument;

    // Return document
    return {
      success: true,
      document: {
        documentId: datasetDoc.documentId,
        projectId: datasetDoc.projectId,
        version: datasetDoc.version,
        status: datasetDoc.status,
        createdAt: datasetDoc.createdAt,
        updatedAt: datasetDoc.updatedAt,
        analysisPath: datasetDoc.analysisPath,
        requiredDataElements: datasetDoc.requiredDataElements,
        completeness: datasetDoc.completeness,
        gaps: datasetDoc.gaps || [],
        recommendations: datasetDoc.recommendations || [],
        questionAnswerMapping: datasetDoc.questionAnswerMapping || [],
        userQuestions: datasetDoc.userQuestions || journeyProgress.userQuestions || [],
        transformationPlan: datasetDoc.transformationPlan || [],
        industryDomain: datasetDoc.industryDomain,
        requirementsLocked: datasetDoc.requirementsLocked || false,
        requirementsLockedAt: datasetDoc.requirementsLockedAt,
      },
      metadata: {
        source: 'dataset',
        datasetId: dataset.id,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error(`[Elements] Error fetching data elements for project ${projectId}:`, error);
    throw new ServiceError('Failed to fetch data elements');
  }

  /**
   * Generate data requirements document
   */
  async generateRequirements(
    projectId: string,
    userId: string,
    input: {
      userGoals: string[];
      userQuestions: string[];
      structuredQuestions?: any[];
      industry?: string;
    }
  ): Promise<any> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Import RequiredDataElementsTool (MCP tool)
    const { RequiredDataElementsTool } = await import(
      '../../services/tools/required-data-elements-tool'
    );
    const tool = new RequiredDataElementsTool();

    // Validate input
    if (!input.userGoals || !Array.isArray(input.userGoals)) {
      throw new ValidationError('User goals are required');
    }

    // Filter goals and questions
    const filteredGoals = (input.userGoals || []).filter(
      (g: any) => g && typeof g === 'string' && g.trim() !== ''
    );
    const filteredQuestions = (input.userQuestions || []).filter(
      (q: any) => q && typeof q === 'string' && q.trim() !== ''
    );

    // Fetch dataset schema
    let datasetSchema: Record<string, any> | undefined;
    try {
      const projectDatasets = await storage.getProjectDatasets(projectId);
      if (projectDatasets && projectDatasets.length > 0) {
        const ds = projectDatasets[0].dataset;
        datasetSchema =
          (ds as any).ingestionMetadata?.schema ??
          (ds as any).metadata?.schema ??
          (ds as any).schema;
      }
    } catch (schemaErr) {
      console.warn('[Elements] Could not fetch dataset schema:', schemaErr);
    }

    console.log(`[Elements] Generating requirements for project ${projectId}:`, {
      goalsCount: filteredGoals.length,
      questionsCount: filteredQuestions.length,
      hasDatasetSchema: !!datasetSchema,
    });

    // Call MCP tool to generate requirements
    const document = await tool.defineRequirements({
      projectId,
      userGoals: filteredGoals,
      userQuestions: filteredQuestions,
      structuredQuestions: input.structuredQuestions,
      datasetMetadata: datasetSchema
        ? {
            columns: Object.keys(datasetSchema),
            columnTypes: Object.fromEntries(
              Object.entries(datasetSchema).map(([col, info]) => [
                col,
                typeof info === 'object' ? (info as any).type || 'unknown' : String(info),
              ])
            ),
            schema: datasetSchema,
          }
        : undefined,
      industry: input.industry,
    });

    console.log(`[Elements] Generated requirements document:`, {
      documentId: document.documentId,
      analysisPathCount: document.analysisPath?.length || 0,
      requiredDataElementsCount: document.requiredDataElements?.length || 0,
    });

    // Persist to journey progress
    const requirementsDocument = {
      documentId: document.documentId,
      analysisPath: document.analysisPath,
      requiredDataElements: document.requiredDataElements,
      completeness: document.completeness,
      status: document.status,
      generatedAt: new Date().toISOString(),
      industryDomain: document.industryDomain,
    };

    await storage.atomicMergeJourneyProgress(projectId, {
      requirementsDocument,
      requirementsLocked: true,
      requirementsLockedAt: new Date().toISOString(),
    });

    return {
      success: true,
      document: requirementsDocument,
      requirementsLocked: true,
      requirementsLockedAt: new Date().toISOString(),
    };
  }

  /**
   * Update element mappings
   */
  async updateElementMappings(
    projectId: string,
    userId: string,
    columnMappings: any[]
  ): Promise<{ success: boolean; updatedMappings?: any[] }> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Import RequiredDataElementsTool
    const { RequiredDataElementsTool } = await import(
      '../../services/tools/required-data-elements-tool'
    );
    const tool = new RequiredDataElementsTool();

    // Validate input
    if (!columnMappings || !Array.isArray(columnMappings)) {
      throw new ValidationError('Column mappings are required');
    }

    console.log(`[Elements] Updating mappings for project ${projectId}:`, {
      mappingsCount: columnMappings.length,
    });

    // Call MCP tool to map elements
    const result = await tool.mapElementsWithAI({
      projectId,
      columnMappings,
    });

    console.log(`[Elements] Updated mappings:`, {
      success: result.success,
      updatedCount: result.updatedElements?.length || 0,
    });

    return {
      success: true,
      updatedMappings: result.updatedElements,
    };
  }

  /**
   * Enrich data elements with business definitions
   */
  async enrichDataElements(
    input: EnrichElementsInput
  ): Promise<{ success: boolean; enrichedElements?: any[] }> {
    const { projectId, userId, elements } = input;

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Import RequiredDataElementsTool
    const { RequiredDataElementsTool } = await import(
      '../../services/tools/required-data-elements-tool'
    );
    const tool = new RequiredDataElementsTool();

    // Validate input
    if (!elements || !Array.isArray(elements)) {
      throw new ValidationError('Elements are required for enrichment');
    }

    console.log(`[Elements] Enriching ${elements.length} elements for project ${projectId}`);

    // Call MCP tool to enrich elements
    const result = await tool.enrichElementsWithBA({
      projectId,
      elements,
    });

    console.log(`[Elements] Enriched elements:`, {
      success: result.success,
      enrichedCount: result.enrichedElements?.length || 0,
    });

    return {
      success: true,
      enrichedElements: result.enrichedElements,
    };
  }

  /**
   * Validate element mappings
   */
  async validateMapping(
    input: ValidateMappingInput
  ): Promise<{ success: boolean; validation?: any }> {
    const { projectId, userId, mapping } = input;

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Import RequiredDataElementsTool
    const { RequiredDataElementsTool } = await import(
      '../../services/tools/required-data-elements-tool'
    );
    const tool = new RequiredDataElementsTool();

    // Validate input
    if (!mapping) {
      throw new ValidationError('Mapping is required for validation');
    }

    console.log(`[Elements] Validating mapping for project ${projectId}`);

    // Call MCP tool to validate mapping
    const result = await tool.validateMapping({
      projectId,
      mapping,
    });

    console.log(`[Elements] Validation result:`, {
      success: result.success,
      issues: result.issues?.length || 0,
    });

    return {
      success: true,
      validation: {
        isValid: result.success,
        issues: result.issues || [],
        warnings: result.warnings || [],
      },
    };
  }

  /**
   * PM supervised mapping
   */
  async pmSupervisedMapping(
    input: PMSupervisedMappingInput
  ): Promise<{ success: boolean; result?: any }> {
    const { projectId, userId, context } = input;

    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Import RequiredDataElementsTool
    const { RequiredDataElementsTool } = await import(
      '../../services/tools/required-data-elements-tool'
    );
    const tool = new RequiredDataElementsTool();

    console.log(`[Elements] PM supervised mapping for project ${projectId}`);

    // Call MCP tool for PM supervised mapping
    const result = await tool.pmSupervisedMapping({
      projectId,
      context,
    });

    console.log(`[Elements] PM mapping result:`, {
      success: result.success,
    });

    return {
      success: true,
      result: result.mapping || result.result,
    };
  }

  /**
   * Get business definitions for a concept
   */
  async getBusinessDefinitions(
    projectId: string,
    userId: string,
    conceptName: string
  ): Promise<any> {
    if (!userId) {
      throw new UnauthorizedError('User authentication required');
    }

    // Get project
    const project = await storage.getProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Verify ownership
    const owner = (project as any)?.ownerId ?? (project as any)?.userId;
    if (owner !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Get journey progress
    const journeyProgress = (project as any)?.journeyProgress || {};
    const reqDoc = journeyProgress.requirementsDocument;

    // Find element matching concept name
    const element = reqDoc?.requiredDataElements?.find(
      (el: any) => el.elementName === conceptName || el.name === conceptName
    );

    if (!element) {
      return {
        success: false,
        error: `Business definition for concept '${conceptName}' not found`,
      };
    }

    return {
      success: true,
      element: {
        elementId: element.elementId || element.id,
        elementName: element.elementName || element.name,
        dataType: element.dataType,
        businessDescription: element.purpose || element.description,
        calculationDefinition: element.calculationDefinition,
        qualityRequirements: element.qualityRequirements,
        dsRecommendation: element.dsRecommendation,
      },
    };
  }
}

// Singleton instance
export const dataElementsService = new DataElementsService();
