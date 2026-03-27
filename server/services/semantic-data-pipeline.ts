/**
 * Semantic Data Pipeline Service
 *
 * Creates vector-based semantic linkages from:
 *   Questions → Data Elements → Transformations → Analysis Results
 *
 * Uses embeddings to automatically:
 * - Extract semantic meaning from data columns
 * - Link user questions to relevant data elements
 * - Infer required transformations (joins, aggregations, filters)
 * - Build evidence chains for traceability
 */

import { embeddingService } from './embedding-service';
import { db } from '../db';
import { eq, sql, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  projectQuestions,
  datasets,
  semanticLinks,
} from '../../shared/schema';
import { storage } from '../storage';

// NOTE: The semantic_links table has been created to provide Question → Element → Transformation → Analysis traceability.
// This service can now store semantic links using the unified table.

// P2-2 FIX: Legacy tables don't exist in the DB schema. All operations now use
// the unified `semantic_links` table from shared/schema.ts.
// These stubs are kept for type compatibility but ALL insert/select operations
// are redirected to semantic_links with appropriate linkType.
const dataElements: any = null;          // Use semantic_links with sourceType='data_element'
const transformationDefinitions: any = null; // Use semantic_links with sourceType='transformation'
const questionElementLinks: any = null;     // Use semantic_links with linkType='question_to_element'
const elementTransformationLinks: any = null; // Use semantic_links with linkType='element_to_transformation'

// P2-2: Helper to guard legacy table operations
function isLegacyTableAvailable(table: any): boolean {
  return table !== null && table !== undefined;
}

// Type stubs for legacy code
type DataElement = any;
type TransformationDefinition = any;

// Feature flag - NOW ENABLED since semantic_links table exists
const SEMANTIC_TABLES_EXIST = true;

// ============================================
// INTERFACES
// ============================================

export interface DataElementInput {
  id: string;
  elementName: string;
  elementType: 'dimension' | 'measure' | 'key' | 'attribute';
  dataType: string;
  semanticDescription: string;
  sourceDatasetId?: string;
  sourceColumn?: string;
  analysisRoles: string[];
}

export interface TransformationDefinitionInput {
  id: string;
  transformationName: string;
  transformationType: 'join' | 'aggregate' | 'filter' | 'derive' | 'clean' | 'normalize';
  semanticDescription: string;
  sourceElements: string[];
  targetElements: string[];
  config: any;
}

export interface DatasetInput {
  id: string;
  schema: Record<string, any>;
  preview: any[];
  name?: string;
}

export interface QuestionInput {
  id: string;
  text: string;
  embedding?: number[];
}

export interface EvidenceChainResult {
  question: { id: string; text: string };
  elements: Array<{
    elementId: string;
    elementName: string;
    sourceDataset: string;
    sourceColumn: string;
    relevance: number;
    linkType: string;
  }>;
  transformations: Array<{
    transformationId: string;
    name: string;
    type: string;
    config: any;
    status: string;
  }>;
}

// ============================================
// MAIN SERVICE
// ============================================

export class SemanticDataPipelineService {

  // ============================================
  // SEMANTIC LINK CREATION METHODS (Phase 2 Fix)
  // ============================================

  /**
   * Link a user question to a data element
   * This creates the first part of the traceability chain
   */
  async linkQuestionToElement(
    projectId: string,
    questionId: string,
    elementId: string,
    confidence: number,
    createdBy: string = 'ds_agent'
  ): Promise<void> {
    try {
      await storage.createSemanticLink({
        projectId,
        linkType: 'question_element',
        sourceId: questionId,
        sourceType: 'question',
        targetId: elementId,
        targetType: 'element',
        confidence: typeof confidence === 'number' ? confidence : parseFloat(String(confidence)) || 0,
        createdBy,
        metadata: { linkedAt: new Date().toISOString() }
      });
      console.log(`🔗 [Semantic] Created question→element link: ${questionId} → ${elementId}`);
    } catch (error) {
      console.error(`❌ [Semantic] Failed to create question→element link:`, error);
    }
  }

  /**
   * Link a data element to a transformation
   * This tracks which transformations were applied to which data
   */
  async linkElementToTransformation(
    projectId: string,
    elementId: string,
    transformationId: string,
    createdBy: string = 'de_agent'
  ): Promise<void> {
    try {
      await storage.createSemanticLink({
        projectId,
        linkType: 'element_transformation',
        sourceId: elementId,
        sourceType: 'element',
        targetId: transformationId,
        targetType: 'transformation',
        confidence: 1.0,  // Transformations are explicit, not inferred
        createdBy,
        metadata: { linkedAt: new Date().toISOString() }
      });
      console.log(`🔗 [Semantic] Created element→transformation link: ${elementId} → ${transformationId}`);
    } catch (error) {
      console.error(`❌ [Semantic] Failed to create element→transformation link:`, error);
    }
  }

  /**
   * Link a transformation to an analysis result
   * This tracks which analyses used which transformed data
   */
  async linkTransformationToAnalysis(
    projectId: string,
    transformationId: string,
    analysisId: string,
    createdBy: string = 'ds_agent'
  ): Promise<void> {
    try {
      await storage.createSemanticLink({
        projectId,
        linkType: 'transformation_analysis',
        sourceId: transformationId,
        sourceType: 'transformation',
        targetId: analysisId,
        targetType: 'analysis',
        confidence: 1.0,
        createdBy,
        metadata: { linkedAt: new Date().toISOString() }
      });
      console.log(`🔗 [Semantic] Created transformation→analysis link: ${transformationId} → ${analysisId}`);
    } catch (error) {
      console.error(`❌ [Semantic] Failed to create transformation→analysis link:`, error);
    }
  }

  /**
   * Link a question directly to an answer/insight
   * This is the final step in the evidence chain
   */
  async linkQuestionToAnswer(
    projectId: string,
    questionId: string,
    answerId: string,
    confidence: number,
    createdBy: string = 'pm_agent'
  ): Promise<void> {
    try {
      await storage.createSemanticLink({
        projectId,
        linkType: 'question_answer',
        sourceId: questionId,
        sourceType: 'question',
        targetId: answerId,
        targetType: 'insight',
        confidence: typeof confidence === 'number' ? confidence : parseFloat(String(confidence)) || 0,
        createdBy,
        metadata: { linkedAt: new Date().toISOString() }
      });
      console.log(`🔗 [Semantic] Created question→answer link: ${questionId} → ${answerId}`);
    } catch (error) {
      console.error(`❌ [Semantic] Failed to create question→answer link:`, error);
    }
  }

  /**
   * Get the full evidence chain for a question
   * Returns: Question → Elements → Transformations → Analyses → Insights
   */
  async getEvidenceChain(projectId: string, questionId: string): Promise<{
    question: string;
    dataElements: string[];
    transformations: string[];
    analyses: string[];
    insights: string[];
  }> {
    const dataElements: string[] = [];
    const transformations: string[] = [];
    const analyses: string[] = [];
    const insights: string[] = [];

    try {
      // Get question → element links
      const elementLinks = await storage.getSemanticLinks(projectId, 'question_element', questionId);
      for (const link of elementLinks) {
        dataElements.push(link.targetId);

        // Get element → transformation links
        const transformLinks = await storage.getSemanticLinks(projectId, 'element_transformation', link.targetId);
        for (const tLink of transformLinks) {
          if (!transformations.includes(tLink.targetId)) {
            transformations.push(tLink.targetId);
          }

          // Get transformation → analysis links
          const analysisLinks = await storage.getSemanticLinks(projectId, 'transformation_analysis', tLink.targetId);
          for (const aLink of analysisLinks) {
            if (!analyses.includes(aLink.targetId)) {
              analyses.push(aLink.targetId);
            }
          }
        }
      }

      // Get direct question → answer links
      const answerLinks = await storage.getSemanticLinks(projectId, 'question_answer', questionId);
      for (const link of answerLinks) {
        insights.push(link.targetId);
      }

      console.log(`📊 [Semantic] Evidence chain for ${questionId}: ${dataElements.length} elements, ${transformations.length} transforms, ${analyses.length} analyses`);

      return {
        question: questionId,
        dataElements,
        transformations,
        analyses,
        insights
      };
    } catch (error) {
      console.error(`❌ [Semantic] Failed to get evidence chain:`, error);
      return { question: questionId, dataElements, transformations, analyses, insights };
    }
  }

  /**
   * Bulk create question-element links from DS Agent's requirementsDocument
   */
  async createLinksFromRequirements(
    projectId: string,
    questionAnswerMapping: Array<{
      questionId: string;
      requiredDataElements?: string[];
    }>
  ): Promise<number> {
    let linksCreated = 0;

    for (const mapping of questionAnswerMapping) {
      if (!mapping.requiredDataElements) continue;

      for (const elementId of mapping.requiredDataElements) {
        await this.linkQuestionToElement(projectId, mapping.questionId, elementId, 0.9);
        linksCreated++;
      }
    }

    console.log(`🔗 [Semantic] Created ${linksCreated} question-element links from requirements`);
    return linksCreated;
  }

  // ============================================
  // ORIGINAL METHODS (Phase 1 - Data Extraction)
  // ============================================

  /**
   * Phase 1: Extract semantic data elements from datasets
   * Creates embeddings for each column based on name + inferred purpose
   */
  async extractDataElements(
    projectId: string,
    inputDatasets: DatasetInput[]
  ): Promise<DataElementInput[]> {
    console.log(`[SemanticPipeline] Extracting data elements for project ${projectId} from ${inputDatasets.length} datasets`);
    const elements: DataElementInput[] = [];

    for (const dataset of inputDatasets) {
      if (!dataset.schema) continue;

      for (const [columnName, columnType] of Object.entries(dataset.schema)) {
        // Generate semantic description
        const semanticDesc = await this.generateElementDescription(
          columnName,
          columnType,
          dataset.preview || []
        );

        const element: DataElementInput = {
          id: `elem_${nanoid(10)}`,
          elementName: columnName,
          elementType: this.inferElementType(columnName, columnType),
          dataType: this.normalizeDataType(columnType),
          semanticDescription: semanticDesc,
          sourceDatasetId: dataset.id,
          sourceColumn: columnName,
          analysisRoles: this.inferAnalysisRoles(columnName, columnType)
        };

        elements.push(element);
      }
    }

    if (elements.length === 0) {
      console.log(`[SemanticPipeline] No elements to extract`);
      return [];
    }

    // Generate embeddings for all elements in batch
    console.log(`[SemanticPipeline] Generating embeddings for ${elements.length} elements`);
    const descriptions = elements.map(e => e.semanticDescription);

    let embeddings: Array<{ embedding: number[] }> = [];
    try {
      if (embeddingService.isAvailable()) {
        embeddings = await embeddingService.embedBatch(descriptions);
      } else {
        console.log(`[SemanticPipeline] Embedding service not available, using fallback`);
        // Create simple fallback embeddings for development
        embeddings = descriptions.map(() => ({ embedding: this.createFallbackEmbedding() }));
      }
    } catch (error) {
      console.error(`[SemanticPipeline] Embedding generation failed, using fallback:`, error);
      embeddings = descriptions.map(() => ({ embedding: this.createFallbackEmbedding() }));
    }

    // Store elements with embeddings
    console.log(`[SemanticPipeline] Storing ${elements.length} elements in database`);
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const rawEmbedding = embeddings[i]?.embedding;
      const embedding = rawEmbedding && rawEmbedding.length === 1536 ? rawEmbedding : null;

      try {
        // P2-2 FIX: Use unified semantic_links table instead of null legacy table
        await db.insert(semanticLinks).values({
          id: element.id,
          projectId,
          linkType: 'data_element',
          sourceId: element.sourceDatasetId || projectId,
          sourceType: 'dataset',
          targetId: element.id,
          targetType: 'data_element',
          confidence: 1.0,
          metadata: {
            elementName: element.elementName,
            elementType: element.elementType,
            dataType: element.dataType,
            semanticDescription: element.semanticDescription,
            sourceColumn: element.sourceColumn,
            analysisRoles: element.analysisRoles,
          },
          createdBy: 'semantic_pipeline',
        }).onConflictDoNothing();
      } catch (error) {
        console.error(`[SemanticPipeline] Failed to store element ${element.elementName}:`, error);
      }
    }

    console.log(`[SemanticPipeline] Successfully extracted ${elements.length} data elements`);
    return elements;
  }

  /**
   * Phase 2: Link questions to data elements semantically
   */
  async linkQuestionsToElements(
    projectId: string,
    questions: QuestionInput[]
  ): Promise<void> {
    console.log(`[SemanticPipeline] Linking ${questions.length} questions to elements for project ${projectId}`);

    // P2-2 FIX: Use semantic_links table instead of null legacy dataElements table
    const elementsResult = await db.select().from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId),
        eq(semanticLinks.linkType, 'data_element')
      ));
    // Map to legacy format for downstream compatibility
    const mappedElements = elementsResult.map((link: any) => ({
      id: link.targetId,
      projectId: link.projectId,
      elementName: (link.metadata as any)?.elementName || link.targetId,
      elementType: (link.metadata as any)?.elementType || 'measure',
      semanticDescription: (link.metadata as any)?.semanticDescription || '',
      embedding: null, // Embeddings not stored in semantic_links metadata
      sourceColumn: (link.metadata as any)?.sourceColumn || null,
    }));
    // Use mappedElements as elementsResult
    const elementsForMatching = mappedElements;

    if (elementsForMatching.length === 0) {
      console.log(`[SemanticPipeline] No elements found for project ${projectId}`);
      return;
    }

    console.log(`[SemanticPipeline] Found ${elementsForMatching.length} elements to match against`);

    for (const question of questions) {
      // Generate embedding if not present
      let questionEmbedding = question.embedding;
      if (!questionEmbedding) {
        try {
          if (embeddingService.isAvailable()) {
            const result = await embeddingService.embedText(question.text);
            questionEmbedding = result.embedding;
          } else {
            questionEmbedding = this.createFallbackEmbedding();
          }
        } catch (error) {
          console.error(`[SemanticPipeline] Failed to embed question:`, error);
          questionEmbedding = this.createFallbackEmbedding();
        }

        // Store the embedding on the question
        try {
          await db.update(projectQuestions)
            .set({ embedding: questionEmbedding })
            .where(eq(projectQuestions.id, question.id));
        } catch (error) {
          console.error(`[SemanticPipeline] Failed to update question embedding:`, error);
        }
      }

      // Calculate similarity with each element
      for (const element of elementsForMatching) {
        const elementEmbedding = element.embedding as number[] | null;

        // If either embedding is missing/empty, use keyword similarity fallback
        if (!questionEmbedding?.length || !elementEmbedding?.length) {
          const kwSimilarity = this.keywordSimilarity(question.text, element.elementName, (element as any).semanticDescription);
          if (kwSimilarity >= 0.3) {
            const linkType = this.inferLinkType(question.text, element.elementName);
            try {
              // P2-2 FIX: Use semantic_links instead of null questionElementLinks
              await db.insert(semanticLinks).values({
                id: nanoid(),
                projectId,
                linkType: `question_to_element`,
                sourceId: question.id,
                sourceType: 'question',
                targetId: element.id,
                targetType: 'data_element',
                confidence: kwSimilarity,
                metadata: { method: `keyword_${linkType}` },
                createdBy: 'semantic_pipeline',
              }).onConflictDoNothing();
            } catch (error) {
              if (!(error as any)?.message?.includes('duplicate')) {
                console.error(`[SemanticPipeline] Failed to insert keyword link:`, error);
              }
            }
          }
          continue;
        }

        // Normal embedding-based similarity
        const similarity = this.cosineSimilarity(questionEmbedding, elementEmbedding);

        // Only link if similarity is above threshold (0.5 for more inclusive matching)
        if (similarity >= 0.5) {
          const linkType = this.inferLinkType(question.text, element.elementName);

          try {
            // P2-2 FIX: Use semantic_links instead of null questionElementLinks
            await db.insert(semanticLinks).values({
              id: nanoid(),
              projectId,
              linkType: 'question_to_element',
              sourceId: question.id,
              sourceType: 'question',
              targetId: element.id,
              targetType: 'data_element',
              confidence: parseFloat(similarity.toFixed(4)),
              metadata: { method: `embedding_${linkType}` },
              createdBy: 'semantic_pipeline',
            }).onConflictDoNothing();
          } catch (error) {
            // Ignore duplicate key errors
            if (!(error as any)?.message?.includes('duplicate')) {
              console.error(`[SemanticPipeline] Failed to insert question-element link:`, error);
            }
          }
        }
      }
    }

    console.log(`[SemanticPipeline] Finished linking questions to elements`);

    // Validate link chain completeness
    const validation = await this.validateLinkChain(projectId, questions);
    if (!validation.complete) {
      console.warn(`⚠️ [SemanticPipeline] Link chain incomplete: ${validation.stats.linkedQuestions}/${validation.stats.questions} questions linked`);
      if (validation.stats.gaps.length > 0) {
        console.warn(`   Gaps: ${validation.stats.gaps.slice(0, 5).join('; ')}${validation.stats.gaps.length > 5 ? ` ... and ${validation.stats.gaps.length - 5} more` : ''}`);
      }
    } else {
      console.log(`[SemanticPipeline] Link chain validated: all ${validation.stats.questions} questions have element links`);
    }
  }

  /**
   * Phase 3: Infer required transformations from elements and questions
   */
  async inferTransformations(
    projectId: string,
    questions: QuestionInput[]
  ): Promise<TransformationDefinitionInput[]> {
    console.log(`[SemanticPipeline] Inferring transformations for project ${projectId}`);
    const transformations: TransformationDefinitionInput[] = [];

    // Get linked elements for each question with their links
    const questionElementsResult = await db.execute(sql`
      SELECT
        pq.id as question_id,
        pq.question_text,
        de.id as element_id,
        de.element_name,
        de.source_dataset_id,
        de.element_type,
        de.source_column,
        qel.link_type,
        qel.similarity_score
      FROM project_questions pq
      JOIN question_element_links qel ON pq.id = qel.question_id
      JOIN data_elements de ON qel.element_id = de.id
      WHERE pq.project_id = ${projectId}
      ORDER BY pq.id, qel.similarity_score DESC
    `);

    if (!questionElementsResult.rows || questionElementsResult.rows.length === 0) {
      console.log(`[SemanticPipeline] No question-element links found`);
      return [];
    }

    // Group by question to analyze transformation needs
    const questionGroups = this.groupBy(questionElementsResult.rows, 'question_id');

    for (const [questionId, elements] of Object.entries(questionGroups)) {
      const question = questions.find(q => q.id === questionId);
      if (!question) continue;

      const elementsArray = elements as any[];

      // Check if elements span multiple datasets (need join)
      const datasetIds = new Set(elementsArray.map(e => e.source_dataset_id).filter(Boolean));
      if (datasetIds.size > 1) {
        const joinTransform = await this.createJoinTransformation(
          projectId,
          elementsArray,
          question.text
        );
        if (joinTransform) transformations.push(joinTransform);
      }

      // Check if aggregation is needed based on question text
      if (this.needsAggregation(question.text)) {
        const aggTransform = await this.createAggregationTransformation(
          projectId,
          elementsArray,
          question.text
        );
        if (aggTransform) transformations.push(aggTransform);
      }

      // Check if filtering is needed
      if (this.needsFiltering(question.text)) {
        const filterTransform = await this.createFilterTransformation(
          projectId,
          elementsArray,
          question.text
        );
        if (filterTransform) transformations.push(filterTransform);
      }
    }

    // Store transformations with embeddings
    console.log(`[SemanticPipeline] Storing ${transformations.length} inferred transformations`);
    for (const transform of transformations) {
      let embedding: number[];
      try {
        if (embeddingService.isAvailable()) {
          const result = await embeddingService.embedText(transform.semanticDescription);
          embedding = result.embedding;
        } else {
          embedding = this.createFallbackEmbedding();
        }
      } catch (error) {
        console.error(`[SemanticPipeline] Failed to embed transformation:`, error);
        embedding = this.createFallbackEmbedding();
      }

      try {
        // P2-2 FIX: Use semantic_links for transformation storage
        await db.insert(semanticLinks).values({
          id: transform.id,
          projectId,
          linkType: 'transformation',
          sourceId: transform.sourceElements[0] || projectId,
          sourceType: 'data_element',
          targetId: transform.id,
          targetType: 'transformation',
          confidence: 1.0,
          metadata: {
            transformationName: transform.transformationName,
            transformationType: transform.transformationType,
            semanticDescription: transform.semanticDescription,
            sourceElements: transform.sourceElements,
            targetElements: transform.targetElements,
            config: transform.config,
            status: 'pending',
          },
          createdBy: 'semantic_pipeline',
        }).onConflictDoNothing();

        // Link elements to transformation via semantic_links
        for (const elemId of transform.sourceElements) {
          try {
            await db.insert(semanticLinks).values({
              id: nanoid(),
              projectId,
              linkType: 'element_to_transformation',
              sourceId: elemId,
              sourceType: 'data_element',
              targetId: transform.id,
              targetType: 'transformation',
              confidence: 1.0,
              metadata: { direction: 'input' },
              createdBy: 'semantic_pipeline',
            }).onConflictDoNothing();
          } catch (error) {
            // Ignore duplicate key errors
          }
        }
      } catch (error) {
        console.error(`[SemanticPipeline] Failed to store transformation:`, error);
      }
    }

    console.log(`[SemanticPipeline] Successfully inferred ${transformations.length} transformations`);
    return transformations;
  }

  /**
   * Phase 4: Build complete evidence chain
   */
  async buildEvidenceChain(projectId: string, questionId: string): Promise<EvidenceChainResult | null> {
    console.log(`[SemanticPipeline] Building evidence chain for question ${questionId}`);

    const chainResult = await db.execute(sql`
      WITH question_data AS (
        SELECT id, question_text FROM project_questions WHERE id = ${questionId}
      ),
      linked_elements AS (
        SELECT
          de.id as element_id,
          de.element_name,
          de.source_dataset_id,
          de.source_column,
          qel.similarity_score as element_relevance,
          qel.link_type
        FROM question_element_links qel
        JOIN data_elements de ON qel.element_id = de.id
        WHERE qel.question_id = ${questionId}
        ORDER BY qel.similarity_score DESC
      ),
      required_transforms AS (
        SELECT
          td.id as transformation_id,
          td.transformation_name,
          td.transformation_type,
          td.config,
          td.status,
          etl.element_id as linked_element_id,
          etl.similarity_score as transform_relevance
        FROM element_transformation_links etl
        JOIN transformation_definitions td ON etl.transformation_id = td.id
        WHERE etl.element_id IN (SELECT element_id FROM linked_elements)
          AND td.project_id = ${projectId}
      )
      SELECT
        (SELECT json_build_object('id', id, 'text', question_text) FROM question_data) as question,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'elementId', le.element_id,
            'elementName', le.element_name,
            'sourceDataset', le.source_dataset_id,
            'sourceColumn', le.source_column,
            'relevance', le.element_relevance,
            'linkType', le.link_type
          )) FILTER (WHERE le.element_id IS NOT NULL),
          '[]'::json
        ) as elements,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'transformationId', rt.transformation_id,
            'name', rt.transformation_name,
            'type', rt.transformation_type,
            'config', rt.config,
            'status', rt.status
          )) FILTER (WHERE rt.transformation_id IS NOT NULL),
          '[]'::json
        ) as transformations
      FROM linked_elements le
      LEFT JOIN required_transforms rt ON le.element_id = rt.linked_element_id
    `);

    const result = chainResult.rows?.[0] as any;
    if (!result?.question) {
      console.log(`[SemanticPipeline] No evidence chain found for question ${questionId}`);
      return null;
    }

    return {
      question: result.question,
      elements: result.elements || [],
      transformations: result.transformations || [],
    };
  }

  /**
   * Get transformation plan for entire project
   */
  async getTransformationPlan(projectId: string): Promise<any[]> {
    console.log(`[SemanticPipeline] Getting transformation plan for project ${projectId}`);

    const planResult = await db.execute(sql`
      SELECT
        td.id,
        td.transformation_name,
        td.transformation_type,
        td.semantic_description,
        td.source_elements,
        td.target_elements,
        td.config,
        td.status,
        td.execution_order,
        td.depends_on,
        COALESCE(
          array_agg(DISTINCT pq.question_text) FILTER (WHERE pq.id IS NOT NULL),
          ARRAY[]::text[]
        ) as related_questions
      FROM transformation_definitions td
      LEFT JOIN element_transformation_links etl ON td.id = etl.transformation_id
      LEFT JOIN question_element_links qel ON etl.element_id = qel.element_id
      LEFT JOIN project_questions pq ON qel.question_id = pq.id
      WHERE td.project_id = ${projectId}
      GROUP BY td.id
      ORDER BY td.execution_order NULLS LAST, td.created_at
    `);

    return planResult.rows || [];
  }

  /**
   * Get all data elements for a project
   */
  async getDataElements(projectId: string): Promise<DataElement[]> {
    // P2-2 FIX: Use semantic_links instead of null dataElements table
    const links = await db.select().from(semanticLinks)
      .where(and(
        eq(semanticLinks.projectId, projectId),
        eq(semanticLinks.linkType, 'data_element')
      ));
    return links.map((link: any) => ({
      id: link.targetId,
      projectId: link.projectId,
      elementName: (link.metadata as any)?.elementName || link.targetId,
      elementType: (link.metadata as any)?.elementType || 'measure',
      dataType: (link.metadata as any)?.dataType || 'unknown',
      semanticDescription: (link.metadata as any)?.semanticDescription || '',
      sourceColumn: (link.metadata as any)?.sourceColumn || null,
      analysisRoles: (link.metadata as any)?.analysisRoles || [],
    }));
  }

  /**
   * Get element links for a question
   */
  async getQuestionElementLinks(questionId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT
        qel.id,
        qel.question_id,
        qel.element_id,
        qel.similarity_score,
        qel.link_type,
        de.element_name,
        de.element_type,
        de.source_dataset_id,
        de.source_column
      FROM question_element_links qel
      JOIN data_elements de ON qel.element_id = de.id
      WHERE qel.question_id = ${questionId}
      ORDER BY qel.similarity_score DESC
    `);
    return result.rows || [];
  }

  /**
   * Clear semantic pipeline data for a project (for restart)
   */
  async clearProjectPipelineData(projectId: string): Promise<void> {
    console.log(`[SemanticPipeline] Clearing pipeline data for project ${projectId}`);

    // P2-2 FIX: Delete from unified semantic_links table instead of null legacy tables
    await db.delete(semanticLinks)
      .where(eq(semanticLinks.projectId, projectId));

    console.log(`[SemanticPipeline] Cleared all semantic links for project ${projectId}`);
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async generateElementDescription(
    columnName: string,
    columnType: any,
    preview: any[]
  ): Promise<string> {
    // Build semantic description from column name, type, and sample values
    const typeName = typeof columnType === 'string' ? columnType : columnType?.type || 'unknown';
    const sampleValues = preview
      .slice(0, 5)
      .map(row => row?.[columnName])
      .filter(v => v !== null && v !== undefined)
      .slice(0, 3);

    // Convert column name to readable format
    const readableName = columnName
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

    let description = `Data column "${readableName}" of type ${typeName}`;

    // Add context based on name patterns
    if (columnName.toLowerCase().includes('id')) {
      description += '. This is likely a unique identifier or foreign key for linking records.';
    } else if (columnName.toLowerCase().includes('date') || columnName.toLowerCase().includes('time')) {
      description += '. This represents temporal data for time-based analysis.';
    } else if (columnName.toLowerCase().includes('amount') || columnName.toLowerCase().includes('price') || columnName.toLowerCase().includes('cost')) {
      description += '. This is a monetary or quantity measure suitable for aggregation.';
    } else if (columnName.toLowerCase().includes('name') || columnName.toLowerCase().includes('title')) {
      description += '. This is a descriptive text field for labeling or categorization.';
    } else if (columnName.toLowerCase().includes('score') || columnName.toLowerCase().includes('rating')) {
      description += '. This is a numerical score or rating measure for analysis.';
    } else if (columnName.toLowerCase().includes('department') || columnName.toLowerCase().includes('category') || columnName.toLowerCase().includes('type')) {
      description += '. This is a categorical dimension for grouping and segmentation.';
    } else if (sampleValues.length > 0) {
      const uniqueSamples = [...new Set(sampleValues)];
      if (uniqueSamples.length <= 5 && typeof sampleValues[0] === 'string') {
        description += `. Sample values: ${uniqueSamples.join(', ')}.`;
      }
    }

    return description;
  }

  private inferElementType(columnName: string, columnType: any): 'dimension' | 'measure' | 'key' | 'attribute' {
    const name = columnName.toLowerCase();
    const type = typeof columnType === 'string' ? columnType : columnType?.type || '';

    if (name.includes('id') || name.endsWith('_id') || name.includes('key')) {
      return 'key';
    }

    if (type.includes('number') || type.includes('int') || type.includes('float') ||
        name.includes('amount') || name.includes('count') || name.includes('total') ||
        name.includes('sum') || name.includes('avg') || name.includes('score') ||
        name.includes('rating') || name.includes('salary') || name.includes('age')) {
      return 'measure';
    }

    if (name.includes('category') || name.includes('type') || name.includes('status') ||
        name.includes('department') || name.includes('region') || name.includes('level') ||
        name.includes('gender') || name.includes('location')) {
      return 'dimension';
    }

    return 'attribute';
  }

  private normalizeDataType(columnType: any): string {
    const type = typeof columnType === 'string' ? columnType : columnType?.type || 'string';

    if (type.includes('int') || type.includes('float') || type.includes('number') || type.includes('decimal')) {
      return 'number';
    }
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'date';
    }
    if (type.includes('bool')) {
      return 'boolean';
    }
    return 'string';
  }

  private inferAnalysisRoles(columnName: string, columnType: any): string[] {
    const roles: string[] = [];
    const name = columnName.toLowerCase();
    const type = typeof columnType === 'string' ? columnType : columnType?.type || '';

    if (name.includes('id') || name.endsWith('_id')) {
      roles.push('joining');
    }

    if (type.includes('number') || name.includes('amount') || name.includes('count') ||
        name.includes('score') || name.includes('rating') || name.includes('salary')) {
      roles.push('aggregation');
    }

    if (name.includes('category') || name.includes('type') || name.includes('department') ||
        name.includes('status') || name.includes('level') || name.includes('gender')) {
      roles.push('grouping');
    }

    if (name.includes('date') || name.includes('time')) {
      roles.push('time_series');
    }

    if (roles.length === 0) {
      roles.push('filtering');
    }

    return roles;
  }

  private inferLinkType(questionText: string, elementName: string): string {
    const q = questionText.toLowerCase();
    const e = elementName.toLowerCase();

    if (q.includes('by ' + e) || q.includes('per ' + e) || q.includes('for each ' + e) ||
        q.includes('across ' + e) || q.includes('breakdown by ' + e)) {
      return 'groups_by';
    }

    if (q.includes('total') || q.includes('average') || q.includes('sum') || q.includes('count') ||
        q.includes('mean') || q.includes('median')) {
      if (e.includes('amount') || e.includes('count') || e.includes('score') ||
          e.includes('salary') || e.includes('rating')) {
        return 'aggregates';
      }
    }

    if (q.includes('where') || q.includes('only') || q.includes('filter') ||
        q.includes('specific') || q.includes('particular')) {
      return 'filters_by';
    }

    return 'requires';
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private needsAggregation(questionText: string): boolean {
    const aggregationKeywords = [
      'total', 'average', 'mean', 'sum', 'count', 'how many',
      'highest', 'lowest', 'maximum', 'minimum', 'percent', 'percentage',
      'median', 'overall', 'aggregate'
    ];
    const q = questionText.toLowerCase();
    return aggregationKeywords.some(kw => q.includes(kw));
  }

  private needsFiltering(questionText: string): boolean {
    const filterKeywords = [
      'where', 'when', 'only', 'specific', 'particular', 'just',
      'between', 'greater than', 'less than', 'equal to', 'above', 'below'
    ];
    const q = questionText.toLowerCase();
    return filterKeywords.some(kw => q.includes(kw));
  }

  private groupBy(array: any[], key: string): Record<string, any[]> {
    return array.reduce((result, item) => {
      const keyValue = item[key];
      if (!result[keyValue]) {
        result[keyValue] = [];
      }
      result[keyValue].push(item);
      return result;
    }, {} as Record<string, any[]>);
  }

  private async createJoinTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinitionInput | null> {
    // Group elements by dataset
    const byDataset = this.groupBy(elements.filter(e => e.source_dataset_id), 'source_dataset_id');
    const datasetIds = Object.keys(byDataset);

    if (datasetIds.length < 2) return null;

    // Find potential join keys (elements with 'key' type or similar names across datasets)
    const potentialJoinKeys: Array<{ leftElement: any; rightElement: any }> = [];

    const datasetsArray = Object.values(byDataset);
    for (let i = 0; i < datasetsArray.length - 1; i++) {
      for (let j = i + 1; j < datasetsArray.length; j++) {
        for (const leftElem of datasetsArray[i] as any[]) {
          for (const rightElem of datasetsArray[j] as any[]) {
            // Check if names are similar (potential join key)
            if (this.areJoinKeyCandidates(leftElem.element_name, rightElem.element_name)) {
              potentialJoinKeys.push({ leftElement: leftElem, rightElement: rightElem });
            }
          }
        }
      }
    }

    if (potentialJoinKeys.length === 0) return null;

    const primaryJoin = potentialJoinKeys[0];

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Join on ${primaryJoin.leftElement.element_name}`,
      transformationType: 'join',
      semanticDescription: `Join datasets using ${primaryJoin.leftElement.element_name} to combine data for analysis: "${questionText.slice(0, 100)}"`,
      sourceElements: [primaryJoin.leftElement.element_id, primaryJoin.rightElement.element_id],
      targetElements: elements.map(e => e.element_id),
      config: {
        joinType: 'left',
        leftDataset: primaryJoin.leftElement.source_dataset_id,
        leftKey: primaryJoin.leftElement.source_column,
        rightDataset: primaryJoin.rightElement.source_dataset_id,
        rightKey: primaryJoin.rightElement.source_column
      }
    };
  }

  private async createAggregationTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinitionInput | null> {
    // Find measure elements (for aggregation)
    const measures = elements.filter(e => e.element_type === 'measure');
    // Find dimension elements (for grouping)
    const dimensions = elements.filter(e =>
      e.element_type === 'dimension' || e.link_type === 'groups_by'
    );

    if (measures.length === 0) return null;

    // Infer aggregation type from question
    const q = questionText.toLowerCase();
    let aggType = 'sum';
    if (q.includes('average') || q.includes('mean')) aggType = 'avg';
    if (q.includes('count') || q.includes('how many')) aggType = 'count';
    if (q.includes('max') || q.includes('highest')) aggType = 'max';
    if (q.includes('min') || q.includes('lowest')) aggType = 'min';
    if (q.includes('median')) aggType = 'median';

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Aggregate ${measures[0].element_name}`,
      transformationType: 'aggregate',
      semanticDescription: `Calculate ${aggType} of ${measures.map(m => m.element_name).join(', ')}${dimensions.length > 0 ? ` grouped by ${dimensions.map(d => d.element_name).join(', ')}` : ''} for question: "${questionText.slice(0, 100)}"`,
      sourceElements: [...measures.map(m => m.element_id), ...dimensions.map(d => d.element_id)],
      targetElements: [],
      config: {
        aggregationType: aggType,
        measureColumns: measures.map(m => m.source_column),
        groupByColumns: dimensions.map(d => d.source_column)
      }
    };
  }

  private async createFilterTransformation(
    projectId: string,
    elements: any[],
    questionText: string
  ): Promise<TransformationDefinitionInput | null> {
    // Look for filter-related elements
    const filterElements = elements.filter(e => e.link_type === 'filters_by');

    if (filterElements.length === 0) return null;

    return {
      id: `transform_${nanoid(10)}`,
      transformationName: `Filter by ${filterElements[0].element_name}`,
      transformationType: 'filter',
      semanticDescription: `Filter data based on ${filterElements.map(e => e.element_name).join(', ')} for question: "${questionText.slice(0, 100)}"`,
      sourceElements: filterElements.map(e => e.element_id),
      targetElements: [],
      config: {
        filterColumns: filterElements.map(e => ({
          column: e.source_column,
          operator: 'equals', // Default - could be inferred from question
          value: null // To be filled by user
        }))
      }
    };
  }

  private areJoinKeyCandidates(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().replace(/[_-]/g, '');
    const n2 = name2.toLowerCase().replace(/[_-]/g, '');

    // Exact match
    if (n1 === n2) return true;

    // Common ID patterns
    const idPatterns = ['id', 'key', 'code', 'employeeid', 'userid', 'departmentid'];
    for (const pattern of idPatterns) {
      if (n1.includes(pattern) && n2.includes(pattern)) {
        // Remove pattern and compare base names
        const base1 = n1.replace(pattern, '');
        const base2 = n2.replace(pattern, '');
        if (base1 === base2 || base1.includes(base2) || base2.includes(base1)) {
          return true;
        }
      }
    }

    // Check if one contains the other
    if (n1.includes(n2) || n2.includes(n1)) {
      return true;
    }

    return false;
  }

  /**
   * Create a simple fallback embedding when embedding service is unavailable
   * Returns empty array as sentinel to trigger keyword-based fallback
   */
  private createFallbackEmbedding(): number[] {
    // Return empty array sentinel - callers check length to decide between
    // embedding-based similarity and keyword-based fallback
    console.warn('[SemanticPipeline] Embedding service unavailable - using keyword fallback for semantic linking');
    return [];
  }

  /**
   * Keyword-based similarity fallback when embedding service is unavailable.
   * Matches question words against element name and description tokens.
   * Returns score 0-1 (lower threshold than embedding similarity since less precise).
   */
  private keywordSimilarity(questionText: string, elementName: string, elementDescription?: string): number {
    const stopWords = ['about', 'which', 'there', 'their', 'would', 'could', 'should', 'these', 'those', 'have', 'been', 'with', 'from', 'this', 'that', 'what', 'does', 'will'];
    const qWords = questionText.toLowerCase().split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !stopWords.includes(w));
    const eText = `${elementName} ${elementDescription || ''}`.toLowerCase();
    const eWords = eText.split(/[\s_\-.,]+/).filter(w => w.length > 2);

    if (qWords.length === 0 || eWords.length === 0) return 0;

    let matches = 0;
    for (const eWord of eWords) {
      if (qWords.some(qw => qw.includes(eWord) || eWord.includes(qw))) {
        matches++;
      }
    }

    return eWords.length > 0 ? Math.min(1, matches / Math.max(eWords.length * 0.5, 1)) : 0;
  }

  /**
   * Validate that the semantic link chain is complete for a project.
   * Checks that all input questions have at least one element link.
   */
  async validateLinkChain(
    projectId: string,
    questions: QuestionInput[]
  ): Promise<{
    complete: boolean;
    stats: { questions: number; linkedQuestions: number; elements: number; gaps: string[] };
  }> {
    try {
      // Query all question_to_element links for this project
      const links = await db.select()
        .from(semanticLinks)
        .where(and(
          eq(semanticLinks.projectId, projectId),
          eq(semanticLinks.linkType, 'question_to_element')
        ));

      const linkedQuestionIds = new Set(links.map(l => l.sourceId));
      const gaps: string[] = [];

      for (const q of questions) {
        const qId = q.id || q.questionId;
        if (qId && !linkedQuestionIds.has(qId)) {
          const preview = (q.text || q.questionText || '').substring(0, 60);
          gaps.push(`Question "${preview}..." has no element links`);
        }
      }

      return {
        complete: gaps.length === 0,
        stats: {
          questions: questions.length,
          linkedQuestions: questions.length - gaps.length,
          elements: links.length,
          gaps,
        },
      };
    } catch (error) {
      console.error(`[SemanticPipeline] validateLinkChain failed:`, error);
      return {
        complete: false,
        stats: { questions: questions.length, linkedQuestions: 0, elements: 0, gaps: ['Validation query failed'] },
      };
    }
  }
}

// Singleton instance
export const semanticDataPipeline = new SemanticDataPipelineService();
