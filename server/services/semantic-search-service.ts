/**
 * Semantic Search Service
 *
 * Provides vector similarity search for business definitions, questions, and data elements.
 * Uses embeddings to find semantically similar content across projects.
 *
 * Architecture:
 * - Uses embedding-service.ts for generating embeddings (OpenAI/Gemini)
 * - Supports pgvector for native vector similarity (if available)
 * - Falls back to JSONB storage with in-memory cosine similarity
 * - Caches embeddings with TTL for performance
 *
 * @see CLAUDE.md - Semantic Search section
 * @see docs/VECTOR_DATA_PIPELINE_DESIGN.md
 */

import { db } from '../db';
import { eq, sql, and, isNotNull } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { embeddingService } from './embedding-service';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface SemanticSearchResult {
  id: string;
  text: string;
  similarity: number;
  type: 'question' | 'insight' | 'answer' | 'definition';
  metadata?: Record<string, any>;
}

/**
 * Result of a similarity search operation
 */
export interface SimilarityResult<T> {
  item: T;
  similarity: number;      // 0-1 cosine similarity score
  distance: number;        // 1 - similarity (for ranking)
  matchType: 'semantic' | 'exact' | 'pattern';
  matchReason?: string;    // Explanation of why this matched
}

export interface SearchOptions {
  limit?: number;
  topK?: number;           // Alias for limit
  minSimilarity?: number;
  includeMetadata?: boolean;
  industry?: string;       // Filter by industry
  domain?: string;         // Filter by domain
  projectId?: string;      // Filter by project (or exclude with 'exclude:projectId')
  includeGlobal?: boolean; // Include global definitions (default: true)
}

export interface TemplateSearchOptions {
  limit?: number;
  topK?: number;
  minSimilarity?: number;
  journeyType?: string;
  industry?: string;
  persona?: string;
  isSystem?: boolean;
  isActive?: boolean;
}

/**
 * Column-to-element matching result for DE Agent
 */
export interface ColumnElementMatch {
  columnName: string;
  columnType: string;
  sampleValues: string[];
  matchedElement?: {
    id: string;
    name: string;
    description: string;
    similarity: number;
  };
  suggestedTransformations?: string[];
  confidence: number;
}

// ============================================================================
// Embedding Cache
// ============================================================================

interface CacheEntry {
  embedding: number[];
  timestamp: number;
  text: string;
}

/**
 * TTL-based cache for embeddings to avoid redundant API calls
 */
class EmbeddingCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMinutes: number = 60, maxSize: number = 1000) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    this.maxSize = maxSize;
  }

  /**
   * Generate a cache key from text content
   */
  private generateKey(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `emb_${hash.toString(16)}`;
  }

  /**
   * Get cached embedding if valid
   */
  get(text: string): number[] | null {
    const key = this.generateKey(text);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  /**
   * Store embedding in cache
   */
  set(text: string, embedding: number[]): void {
    if (this.cache.size >= this.maxSize) {
      const oldest = [...this.cache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, Math.floor(this.maxSize * 0.2));
      oldest.forEach(([key]) => this.cache.delete(key));
    }

    const key = this.generateKey(text);
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
      text
    });
  }

  clear(): void {
    this.cache.clear();
  }

  getStats(): { size: number; maxSize: number; ttlMinutes: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMinutes: this.ttlMs / 60000
    };
  }
}

// ============================================================================
// Semantic Search Service
// ============================================================================

class SemanticSearchService {
  private defaultLimit = 10;
  private defaultMinSimilarity = 0.7;
  private cache: EmbeddingCache;
  private pgvectorAvailable: boolean | null = null;
  private initialized: boolean = false;

  constructor() {
    this.cache = new EmbeddingCache(60, 1000); // 1 hour TTL, 1000 max entries
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Check pgvector availability
      this.pgvectorAvailable = await this.isPgVectorAvailable();

      // Test embedding service
      const testEmbedding = await this.getEmbedding('test initialization');
      this.initialized = testEmbedding !== null && testEmbedding.length > 0;

      if (this.initialized) {
        console.log(`✅ SemanticSearchService initialized (pgvector: ${this.pgvectorAvailable ? 'enabled' : 'disabled, using JSONB fallback'})`);
      } else {
        console.warn('⚠️ SemanticSearchService: Embedding service not available');
      }

      return this.initialized;
    } catch (error) {
      console.error('❌ SemanticSearchService initialization failed:', error);
      return false;
    }
  }

  /**
   * Check if pgvector is available
   */
  async isPgVectorAvailable(): Promise<boolean> {
    if (this.pgvectorAvailable !== null) return this.pgvectorAvailable;

    try {
      const result = await db.execute(sql`
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      `);
      this.pgvectorAvailable = (result.rows?.length ?? 0) > 0;
      return this.pgvectorAvailable;
    } catch {
      this.pgvectorAvailable = false;
      return false;
    }
  }

  // ==========================================================================
  // Core Embedding Operations
  // ==========================================================================

  /**
   * Get embedding for text (with caching)
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    if (!text || text.trim().length === 0) return null;

    const cached = this.cache.get(text);
    if (cached) return cached;

    try {
      const result = await embeddingService.embedText(text);
      if (result?.embedding && result.embedding.length > 0) {
        this.cache.set(text, result.embedding);
        return result.embedding;
      }
      return null;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return null;
    }
  }

  /**
   * Batch generate embeddings
   */
  async getBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = [];
    const uncached: { index: number; text: string }[] = [];

    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i]);
      if (cached) {
        results[i] = cached;
      } else {
        results[i] = null;
        uncached.push({ index: i, text: texts[i] });
      }
    }

    if (uncached.length > 0) {
      try {
        const embeddings = await embeddingService.embedBatch(uncached.map(u => u.text));
        for (let i = 0; i < uncached.length; i++) {
          const embedding = embeddings[i]?.embedding;
          if (embedding) {
            results[uncached[i].index] = embedding;
            this.cache.set(uncached[i].text, embedding);
          }
        }
      } catch (error) {
        console.error('Error in batch embedding generation:', error);
      }
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
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
    if (denominator === 0) return 0;

    return dotProduct / denominator;
  }

  // Summarize long text into 3-5 bullets (~50-80 words total)
  private summarizeTextToBullets(text: string, maxBullets: number = 5, maxWords: number = 80): string[] {
    if (!text) return [];
    const words = text.trim().split(/\s+/).slice(0, maxWords);
    if (words.length === 0) return [];

    const targetBullets = Math.min(maxBullets, Math.max(3, Math.ceil(words.length / 15)));
    const chunkSize = Math.max(5, Math.ceil(words.length / targetBullets));

    const bullets: string[] = [];
    for (let i = 0; i < words.length && bullets.length < maxBullets; i += chunkSize) {
      bullets.push(words.slice(i, i + chunkSize).join(' '));
    }

    return bullets;
  }

  private summarizeArrayField(value: unknown, maxBullets: number = 5): string[] {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr
      .filter(Boolean)
      .slice(0, maxBullets)
      .map((item) => typeof item === 'string' ? item : JSON.stringify(item));
  }

  private summarizeMetadata(value: unknown, maxBullets: number = 5): string[] {
    if (!value || typeof value !== 'object') return [];
    const entries = Object.entries(value as Record<string, unknown>);
    return entries
      .slice(0, maxBullets)
      .map(([key, v]) => `${key}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }

  private summarizeSteps(value: unknown, maxBullets: number = 5): string[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter(Boolean)
      .slice(0, maxBullets)
      .map((step: any, idx: number) => step?.summary || step?.name || (typeof step === 'string' ? step : `Step ${idx + 1}`));
  }

  private formatList(value: unknown, maxItems: number = 5): string | null {
    if (!value || !Array.isArray(value)) return null;
    const items = value
      .filter(Boolean)
      .slice(0, maxItems)
      .map((item) => typeof item === 'string' ? item : JSON.stringify(item));

    return items.length ? items.join(', ') : null;
  }

  // ==========================================================================
  // Business Definition Search (BA Agent)
  // ==========================================================================

  /**
   * Find semantically similar business definitions
   * Used by BA Agent for concept lookup and cross-project learning
   */
  async findSimilarDefinitions(
    query: string,
    options: SearchOptions = {}
  ): Promise<SimilarityResult<typeof schema.businessDefinitions.$inferSelect>[]> {
    const {
      topK = 5,
      limit = topK,
      minSimilarity = 0.7,
      industry,
      domain,
      projectId,
      includeGlobal = true
    } = options;

    console.log(`🔍 [SemanticSearch] Finding similar definitions for: "${query.substring(0, 50)}..."`);

    const queryEmbedding = await this.getEmbedding(query);
    if (!queryEmbedding) {
      console.warn('⚠️ Could not generate embedding for query');
      return [];
    }

    // Build query conditions
    const conditions: any[] = [
      eq(schema.businessDefinitions.status, 'active'),
      isNotNull(schema.businessDefinitions.embedding)
    ];

    if (industry) {
      conditions.push(eq(schema.businessDefinitions.industry, industry));
    }

    if (domain) {
      conditions.push(eq(schema.businessDefinitions.domain, domain));
    }

    // Handle project filtering
    if (projectId) {
      if (projectId.startsWith('exclude:')) {
        const excludeId = projectId.replace('exclude:', '');
        if (includeGlobal) {
          conditions.push(
            sql`(${schema.businessDefinitions.projectId} IS NULL OR ${schema.businessDefinitions.projectId} != ${excludeId})`
          );
        } else {
          conditions.push(
            sql`${schema.businessDefinitions.projectId} != ${excludeId}`
          );
        }
      } else {
        if (includeGlobal) {
          conditions.push(
            sql`(${schema.businessDefinitions.projectId} IS NULL OR ${schema.businessDefinitions.projectId} = ${projectId})`
          );
        } else {
          conditions.push(eq(schema.businessDefinitions.projectId, projectId));
        }
      }
    } else if (includeGlobal) {
      conditions.push(sql`${schema.businessDefinitions.projectId} IS NULL`);
    }

    // Fetch definitions with embeddings
    const definitions = await db
      .select()
      .from(schema.businessDefinitions)
      .where(and(...conditions));

    console.log(`📊 [SemanticSearch] Found ${definitions.length} definitions with embeddings`);

    // Calculate similarities (in-memory for JSONB storage)
    const results: SimilarityResult<typeof schema.businessDefinitions.$inferSelect>[] = [];

    for (const def of definitions) {
      const embedding = def.embedding as number[] | null;
      if (!embedding || !Array.isArray(embedding)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= minSimilarity) {
        results.push({
          item: def,
          similarity,
          distance: 1 - similarity,
          matchType: 'semantic',
          matchReason: `Semantic similarity: ${(similarity * 100).toFixed(1)}%`
        });
      }
    }

    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, limit);

    console.log(`✅ [SemanticSearch] Returning ${topResults.length} similar definitions`);

    return topResults;
  }

  /**
   * Generate and store embedding for a business definition
   */
  async generateDefinitionEmbedding(definitionId: string): Promise<number[] | null> {
    const [definition] = await db
      .select()
      .from(schema.businessDefinitions)
      .where(eq(schema.businessDefinitions.id, definitionId));

    if (!definition) {
      console.warn(`Definition not found: ${definitionId}`);
      return null;
    }

    const textParts = [
      definition.conceptName,
      definition.displayName,
      definition.businessDescription,
      definition.businessContext,
      definition.industry,
      definition.domain,
      definition.formula,
      ...(Array.isArray(definition.synonyms) ? definition.synonyms : [])
    ].filter(Boolean);

    const text = textParts.join(' | ');
    const embedding = await this.getEmbedding(text);

    if (embedding) {
      await db
        .update(schema.businessDefinitions)
        .set({
          embedding: embedding as any,
          updatedAt: new Date()
        })
        .where(eq(schema.businessDefinitions.id, definitionId));

      console.log(`✅ Generated embedding for definition: ${definition.conceptName}`);
    }

    return embedding;
  }

  // ==========================================================================
  // Question Search (Cross-Project Learning)
  // ==========================================================================

  /**
   * Find questions similar to a query text
   * Supports both pgvector and JSONB fallback
   */
  async findSimilarQuestions(
    query: string,
    projectId: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const limit = options.limit ?? this.defaultLimit;
    const minSimilarity = options.minSimilarity ?? this.defaultMinSimilarity;

    const queryEmbedding = await this.getEmbedding(query);
    if (!queryEmbedding) return [];

    // Check if pgvector is available for native similarity
    if (await this.isPgVectorAvailable()) {
      return this.findSimilarQuestionsWithPgVector(queryEmbedding, projectId, limit, minSimilarity, options);
    }

    // JSONB fallback - in-memory similarity
    return this.findSimilarQuestionsWithJsonb(queryEmbedding, projectId, limit, minSimilarity, options);
  }

  private async findSimilarQuestionsWithPgVector(
    queryEmbedding: number[],
    projectId: string,
    limit: number,
    minSimilarity: number,
    options: SearchOptions
  ): Promise<SemanticSearchResult[]> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    try {
      const results = await db.execute(sql`
        SELECT
          id,
          question_text as text,
          1 - (embedding <=> ${embeddingStr}::vector) as similarity,
          complexity,
          recommended_analyses
        FROM project_questions
        WHERE project_id = ${projectId}
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${minSimilarity}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${limit}
      `);

      return (results.rows || []).map((row: any) => ({
        id: row.id as string,
        text: row.text as string,
        similarity: parseFloat(row.similarity as string),
        type: 'question' as const,
        metadata: options.includeMetadata ? {
          complexity: row.complexity,
          recommendedAnalyses: row.recommended_analyses
        } : undefined
      }));
    } catch (error: any) {
      console.error('pgvector search failed, falling back to JSONB:', error.message);
      return this.findSimilarQuestionsWithJsonb(queryEmbedding, projectId, limit, minSimilarity, options);
    }
  }

  private async findSimilarQuestionsWithJsonb(
    queryEmbedding: number[],
    projectId: string,
    limit: number,
    minSimilarity: number,
    options: SearchOptions
  ): Promise<SemanticSearchResult[]> {
    // Fetch all questions with embeddings
    const questions = await db
      .select()
      .from(schema.projectQuestions)
      .where(and(
        eq(schema.projectQuestions.projectId, projectId),
        isNotNull(schema.projectQuestions.embedding)
      ));

    // Calculate similarities in-memory
    const results: SemanticSearchResult[] = [];

    for (const q of questions) {
      const embedding = q.embedding as number[] | null;
      if (!embedding || !Array.isArray(embedding)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= minSimilarity) {
        results.push({
          id: q.id,
          text: q.questionText || '',
          similarity,
          type: 'question',
          metadata: options.includeMetadata ? {
            complexity: q.complexity,
            category: q.category
          } : undefined
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Find cross-project similar questions (for learning)
   */
  async findCrossProjectSimilarQuestions(
    questionText: string,
    excludeProjectId: string,
    options: SearchOptions = {}
  ): Promise<SimilarityResult<typeof schema.projectQuestions.$inferSelect>[]> {
    const { topK = 5, minSimilarity = 0.75 } = options;

    console.log(`🔍 [SemanticSearch] Finding cross-project similar questions`);

    const queryEmbedding = await this.getEmbedding(questionText);
    if (!queryEmbedding) return [];

    // Fetch questions from OTHER projects
    const questions = await db
      .select()
      .from(schema.projectQuestions)
      .where(and(
        sql`${schema.projectQuestions.projectId} != ${excludeProjectId}`,
        isNotNull(schema.projectQuestions.embedding)
      ));

    const results: SimilarityResult<typeof schema.projectQuestions.$inferSelect>[] = [];

    for (const q of questions) {
      const embedding = q.embedding as number[] | null;
      if (!embedding || !Array.isArray(embedding)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= minSimilarity) {
        results.push({
          item: q,
          similarity,
          distance: 1 - similarity,
          matchType: 'semantic',
          matchReason: `Similar question from project ${q.projectId}`
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  /**
   * Generate and store embedding for a project question
   */
  async generateQuestionEmbedding(questionId: string): Promise<number[] | null> {
    const [question] = await db
      .select()
      .from(schema.projectQuestions)
      .where(eq(schema.projectQuestions.id, questionId));

    if (!question) {
      console.warn(`Question not found: ${questionId}`);
      return null;
    }

    const textParts = [
      question.questionText,
      question.category,
      question.context
    ].filter(Boolean);

    const text = textParts.join(' | ');
    const embedding = await this.getEmbedding(text);

    if (embedding) {
      await db
        .update(schema.projectQuestions)
        .set({
          embedding: embedding as any,
          updatedAt: new Date()
        })
        .where(eq(schema.projectQuestions.id, questionId));

      console.log(`✅ Generated embedding for question: ${question.questionText?.substring(0, 50)}...`);
    }

    return embedding;
  }

  // ==========================================================================
  // Template Search (Artifact Templates)
  // ==========================================================================

  private buildTemplateEmbeddingText(template: typeof schema.artifactTemplates.$inferSelect): string {
    const descriptionBullets = this.summarizeTextToBullets(template.description || '');
    const stepsBullets = this.summarizeSteps(template.steps);
    const useCaseBullets = this.summarizeArrayField(template.useCases);
    const metadataBullets = this.summarizeMetadata(template.metadata);

    const parts = [
      template.name,
      template.title,
      template.summary,
      descriptionBullets.join(' | '),
      template.journeyType,
      template.industry,
      template.persona,
      template.targetRole,
      template.targetSeniority,
      template.targetMaturity,
      this.formatList(template.expectedArtifacts),
      this.formatList(template.artifactTypes),
      this.formatList(template.visualizationTypes),
      this.formatList(template.deliveryFormat),
      template.narrativeStyle,
      template.contentDepth,
      template.interactivityLevel,
      template.primaryAgent,
      stepsBullets.join(' | '),
      useCaseBullets.join(' | '),
      metadataBullets.join(' | ')
    ].filter(Boolean);

    return parts.join(' | ');
  }

  async generateTemplateEmbedding(templateId: string): Promise<number[] | null> {
    const [template] = await db
      .select()
      .from(schema.artifactTemplates)
      .where(eq(schema.artifactTemplates.id, templateId));

    if (!template) {
      console.warn(`Template not found: ${templateId}`);
      return null;
    }

    const text = this.buildTemplateEmbeddingText(template);
    const embedding = await this.getEmbedding(text);

    if (embedding) {
      await db
        .update(schema.artifactTemplates)
        .set({
          embedding: embedding as any,
          updatedAt: new Date()
        })
        .where(eq(schema.artifactTemplates.id, templateId));

      console.log(`✅ Generated embedding for template: ${template.name}`);
    }

    return embedding;
  }

  async backfillTemplateEmbeddings(
    batchSize: number = 10
  ): Promise<{ processed: number; failed: number }> {
    console.log('🔄 Starting template embedding backfill...');

    const templates = await db
      .select()
      .from(schema.artifactTemplates)
      .where(sql`${schema.artifactTemplates.embedding} IS NULL`)
      .limit(batchSize);

    let processed = 0;
    let failed = 0;

    for (const t of templates) {
      try {
        const embedding = await this.generateTemplateEmbedding(t.id);
        if (embedding) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to embed template ${t.id}:`, error);
        failed++;
      }
    }

    console.log(`✅ Template backfill: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  async findSimilarTemplates(
    query: string,
    options: TemplateSearchOptions = {}
  ): Promise<SimilarityResult<typeof schema.artifactTemplates.$inferSelect>[]> {
    const {
      topK = 5,
      limit = topK,
      minSimilarity = 0.7,
      journeyType,
      industry,
      persona,
      isSystem,
      isActive = true,
    } = options;

    const queryEmbedding = await this.getEmbedding(query);
    if (!queryEmbedding) return [];

    if (await this.isPgVectorAvailable()) {
      return this.findSimilarTemplatesWithPgVector(queryEmbedding, { limit, minSimilarity, journeyType, industry, persona, isSystem, isActive });
    }

    return this.findSimilarTemplatesWithJsonb(queryEmbedding, { limit, minSimilarity, journeyType, industry, persona, isSystem, isActive });
  }

  private async findSimilarTemplatesWithPgVector(
    queryEmbedding: number[],
    options: Required<Pick<TemplateSearchOptions, 'limit' | 'minSimilarity'>> & Omit<TemplateSearchOptions, 'limit' | 'minSimilarity'>
  ): Promise<SimilarityResult<typeof schema.artifactTemplates.$inferSelect>[]> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const whereClauses = [sql`embedding IS NOT NULL`];

    if (options.isActive !== undefined) {
      whereClauses.push(sql`is_active = ${options.isActive}`);
    }
    if (options.journeyType) {
      whereClauses.push(sql`journey_type = ${options.journeyType}`);
    }
    if (options.industry) {
      whereClauses.push(sql`industry = ${options.industry}`);
    }
    if (options.persona) {
      whereClauses.push(sql`persona = ${options.persona}`);
    }
    if (options.isSystem !== undefined) {
      whereClauses.push(sql`is_system = ${options.isSystem}`);
    }

    const whereClause = whereClauses.reduce((acc, clause, index) => {
      if (index === 0) return clause;
      return sql`${acc} AND ${clause}`;
    }, sql`TRUE` as any);

    try {
      const results = await db.execute(sql`
        SELECT *, 1 - (embedding <=> ${embeddingStr}::vector) as similarity
        FROM artifact_templates
        WHERE ${whereClause}
          AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${options.minSimilarity}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT ${options.limit}
      `);

      return (results.rows || []).map((row: any) => ({
        item: row as typeof schema.artifactTemplates.$inferSelect,
        similarity: parseFloat(row.similarity as string),
        distance: 1 - parseFloat(row.similarity as string),
        matchType: 'semantic' as const,
        matchReason: 'template semantic match'
      }));
    } catch (error: any) {
      console.error('pgvector template search failed, falling back to JSONB:', error.message);
      return this.findSimilarTemplatesWithJsonb(queryEmbedding, options);
    }
  }

  private async findSimilarTemplatesWithJsonb(
    queryEmbedding: number[],
    options: Required<Pick<TemplateSearchOptions, 'limit' | 'minSimilarity'>> & Omit<TemplateSearchOptions, 'limit' | 'minSimilarity'>
  ): Promise<SimilarityResult<typeof schema.artifactTemplates.$inferSelect>[]> {
    const whereClauses = [isNotNull(schema.artifactTemplates.embedding)];

    if (options.isActive !== undefined) {
      whereClauses.push(eq(schema.artifactTemplates.isActive, options.isActive));
    }
    if (options.journeyType) {
      whereClauses.push(eq(schema.artifactTemplates.journeyType, options.journeyType));
    }
    if (options.industry) {
      whereClauses.push(eq(schema.artifactTemplates.industry, options.industry));
    }
    if (options.persona) {
      whereClauses.push(eq(schema.artifactTemplates.persona, options.persona));
    }
    if (options.isSystem !== undefined) {
      whereClauses.push(eq(schema.artifactTemplates.isSystem, options.isSystem));
    }

    const templates = await db
      .select()
      .from(schema.artifactTemplates)
      .where(and(...whereClauses));

    const results: SimilarityResult<typeof schema.artifactTemplates.$inferSelect>[] = [];

    for (const template of templates) {
      const embedding = template.embedding as number[] | null;
      if (!embedding || !Array.isArray(embedding)) continue;

      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      if (similarity >= options.minSimilarity) {
        results.push({
          item: template,
          similarity,
          distance: 1 - similarity,
          matchType: 'semantic',
          matchReason: 'template semantic match'
        });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit);
  }

  // ==========================================================================
  // Column-to-Element Matching (DE Agent Support)
  // ==========================================================================

  /**
   * Match dataset columns to data elements using semantic similarity
   * Used by DE Agent for automatic data mapping
   */
  async matchColumnsToElements(
    columns: Array<{
      name: string;
      type: string;
      sampleValues?: any[];
    }>,
    options: SearchOptions = {}
  ): Promise<ColumnElementMatch[]> {
    const { minSimilarity = 0.6 } = options;

    console.log(`🔍 [SemanticSearch] Matching ${columns.length} columns to data elements`);

    const results: ColumnElementMatch[] = [];

    for (const column of columns) {
      const columnDescription = [
        column.name,
        column.type,
        column.sampleValues?.slice(0, 5).join(', ')
      ].filter(Boolean).join(' | ');

      const similarDefs = await this.findSimilarDefinitions(columnDescription, {
        ...options,
        topK: 1,
        minSimilarity
      });

      const match: ColumnElementMatch = {
        columnName: column.name,
        columnType: column.type,
        sampleValues: column.sampleValues?.slice(0, 5).map(String) || [],
        confidence: 0
      };

      if (similarDefs.length > 0) {
        const bestMatch = similarDefs[0];
        match.matchedElement = {
          id: bestMatch.item.id,
          name: bestMatch.item.conceptName,
          description: bestMatch.item.businessDescription,
          similarity: bestMatch.similarity
        };
        match.confidence = bestMatch.similarity;

        if (bestMatch.item.expectedDataType &&
            bestMatch.item.expectedDataType !== column.type) {
          match.suggestedTransformations = [
            `Convert ${column.type} to ${bestMatch.item.expectedDataType}`
          ];
        }
      }

      results.push(match);
    }

    const matchedCount = results.filter(r => r.matchedElement).length;
    console.log(`✅ [SemanticSearch] Matched ${matchedCount}/${columns.length} columns`);

    return results;
  }

  // ==========================================================================
  // Legacy Compatibility Methods
  // ==========================================================================

  /**
   * Find insights relevant to a question (legacy method)
   */
  async findRelevantInsights(
    question: string,
    projectId: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const limit = options.limit ?? this.defaultLimit;
    const minSimilarity = options.minSimilarity ?? this.defaultMinSimilarity;

    const queryEmbedding = await this.getEmbedding(question);
    if (!queryEmbedding) return [];

    // This is a placeholder - insights table may not exist yet
    console.log(`📊 [SemanticSearch] Insights search (projectId: ${projectId}, minSim: ${minSimilarity})`);
    return [];
  }

  /**
   * Find answers similar to a question (legacy method)
   */
  async findSimilarAnswers(
    question: string,
    projectId: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    // Placeholder for future implementation
    console.log(`📊 [SemanticSearch] Answer search (projectId: ${projectId})`);
    return [];
  }

  /**
   * Recommend analysis types based on question semantics
   */
  async recommendAnalysisTypes(
    question: string
  ): Promise<Array<{ type: string; confidence: number }>> {
    const analysisDescriptions: Record<string, string> = {
      descriptive: 'summary statistics, mean, median, distribution, frequency counts',
      correlation: 'relationship between variables, correlation coefficient, covariance',
      regression: 'predict outcomes, coefficients, linear relationship, dependent variable',
      classification: 'categorize, classify, predict category, machine learning classifier',
      clustering: 'group similar items, segments, k-means, hierarchical clustering',
      time_series: 'trends over time, forecasting, seasonality, temporal patterns',
      hypothesis_test: 'statistical significance, p-value, t-test, ANOVA, chi-square',
      anomaly_detection: 'outliers, unusual patterns, anomalies, deviations'
    };

    const questionEmbedding = await this.getEmbedding(question);
    if (!questionEmbedding) return [];

    const embeddings = await this.getBatchEmbeddings(Object.values(analysisDescriptions));

    const recommendations: Array<{ type: string; confidence: number }> = [];
    const types = Object.keys(analysisDescriptions);

    for (let i = 0; i < types.length; i++) {
      const embedding = embeddings[i];
      if (!embedding) continue;

      const similarity = this.cosineSimilarity(questionEmbedding, embedding);
      recommendations.push({
        type: types[i],
        confidence: Math.round(similarity * 100)
      });
    }

    return recommendations
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Combined search across questions, insights, and answers
   */
  async search(
    query: string,
    projectId: string,
    options: SearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const [questions, insights, answers] = await Promise.all([
      this.findSimilarQuestions(query, projectId, options),
      this.findRelevantInsights(query, projectId, options),
      this.findSimilarAnswers(query, projectId, options)
    ]);

    return [...questions, ...insights, ...answers]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit ?? this.defaultLimit);
  }

  // ==========================================================================
  // Backfill Operations
  // ==========================================================================

  /**
   * Backfill embeddings for business definitions without embeddings
   */
  async backfillDefinitionEmbeddings(
    batchSize: number = 10
  ): Promise<{ processed: number; failed: number }> {
    console.log('🔄 Starting definition embedding backfill...');

    const definitions = await db
      .select()
      .from(schema.businessDefinitions)
      .where(sql`${schema.businessDefinitions.embedding} IS NULL`)
      .limit(batchSize);

    let processed = 0;
    let failed = 0;

    for (const def of definitions) {
      try {
        const embedding = await this.generateDefinitionEmbedding(def.id);
        if (embedding) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to embed definition ${def.id}:`, error);
        failed++;
      }
    }

    console.log(`✅ Definition backfill: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  /**
   * Backfill embeddings for project questions without embeddings
   */
  async backfillQuestionEmbeddings(
    batchSize: number = 10
  ): Promise<{ processed: number; failed: number }> {
    console.log('🔄 Starting question embedding backfill...');

    const questions = await db
      .select()
      .from(schema.projectQuestions)
      .where(sql`${schema.projectQuestions.embedding} IS NULL`)
      .limit(batchSize);

    let processed = 0;
    let failed = 0;

    for (const q of questions) {
      try {
        const embedding = await this.generateQuestionEmbedding(q.id);
        if (embedding) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to embed question ${q.id}:`, error);
        failed++;
      }
    }

    console.log(`✅ Question backfill: ${processed} processed, ${failed} failed`);
    return { processed, failed };
  }

  // ==========================================================================
  // Index Management
  // ==========================================================================

  /**
   * Create vector index for a table (requires pgvector)
   */
  async createVectorIndex(
    tableName: 'project_questions' | 'business_definitions',
    lists: number = 100
  ): Promise<void> {
    if (!(await this.isPgVectorAvailable())) {
      console.warn('⚠️ Cannot create vector index: pgvector not available');
      return;
    }

    const indexName = `idx_${tableName}_embedding`;

    try {
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS ${sql.identifier(indexName)}
        ON ${sql.identifier(tableName)}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = ${lists})
      `);
      console.log(`Created vector index ${indexName}`);
    } catch (error: any) {
      console.error(`Failed to create vector index: ${error.message}`);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ Embedding cache cleared');
  }

  getCacheStats(): { size: number; maxSize: number; ttlMinutes: number } {
    return this.cache.getStats();
  }

  isAvailable(): boolean {
    return this.initialized;
  }
}

// Singleton export
export const semanticSearchService = new SemanticSearchService();
