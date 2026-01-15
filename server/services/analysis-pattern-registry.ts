import { nanoid } from 'nanoid';
import { and, desc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  analysisPatternSources,
  analysisPatterns,
  insertAnalysisPatternSchema,
  insertAnalysisPatternSourceSchema,
  insertTemplatePatternSchema,
  templatePatterns,
  type AnalysisPattern,
  type AnalysisPatternSource,
  type InsertAnalysisPattern,
  type InsertAnalysisPatternSource,
  type InsertTemplatePattern,
} from '@shared/schema';

interface PatternLookupOptions {
  industry?: string;
  goal?: string;
  questionSummary?: string;
  dataSchemaSignature?: string;
  journeyId?: string;
  includePending?: boolean;
  includeRejected?: boolean;
  limit?: number;
  includeSources?: boolean;
}

interface PatternRecordPayload extends Partial<InsertAnalysisPattern> {
  id?: string;
  sources?: Array<Partial<InsertAnalysisPatternSource>>;
}

interface LinkPatternToTemplateOptions extends Partial<InsertTemplatePattern> {
  templateId: string;
  patternId: string;
}

const READY_STATUSES = ['ready', 'approved'];
const DEFAULT_LIMIT = 25;

function now(): Date {
  return new Date();
}

function buildStatusFilter(options: PatternLookupOptions) {
  if (options.includeRejected) {
    return undefined;
  }
  const statuses = options.includePending ? [...READY_STATUSES, 'pending_review'] : READY_STATUSES;
  return inArray(analysisPatterns.status, statuses);
}

export class AnalysisPatternRegistry {
  /**
   * Fetch patterns that match the current journey context. Falls back to general patterns when a specific match is not available.
   */
  static async getPatternsForContext(options: PatternLookupOptions = {}): Promise<Array<AnalysisPattern & { sources?: AnalysisPatternSource[] }>> {
    const {
      industry,
      goal,
      questionSummary,
      dataSchemaSignature,
      journeyId,
      includeSources = false,
      limit = DEFAULT_LIMIT,
    } = options;

    const filters = [] as any[];

    const statusFilter = buildStatusFilter(options);
    if (statusFilter) {
      filters.push(statusFilter);
    }

    if (industry) {
      filters.push(eq(analysisPatterns.industry, industry));
    }

    if (goal) {
      filters.push(eq(analysisPatterns.goal, goal));
    }

    if (dataSchemaSignature) {
      filters.push(eq(analysisPatterns.dataSchemaSignature, dataSchemaSignature));
    }

    if (questionSummary) {
      const normalized = `%${questionSummary.trim()}%`;
      filters.push(ilike(analysisPatterns.questionSummary, normalized));
    }

    if (journeyId) {
      filters.push(sql`${analysisPatterns.applicableJourneys} @> ${JSON.stringify([journeyId])}::jsonb`);
    }

    const query = db
      .select()
      .from(analysisPatterns)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(analysisPatterns.confidence), desc(analysisPatterns.updatedAt), desc(analysisPatterns.createdAt))
      .limit(limit);

    let patterns = (await query) as AnalysisPattern[];

    if (patterns.length === 0 && (industry || dataSchemaSignature || journeyId)) {
      const fallbackFilters = [] as any[];
      if (statusFilter) {
        fallbackFilters.push(statusFilter);
      }
      if (goal) {
        fallbackFilters.push(eq(analysisPatterns.goal, goal));
      }

      const fallbackQuery = db
        .select()
        .from(analysisPatterns)
        .where(fallbackFilters.length > 0 ? and(...fallbackFilters) : undefined)
        .orderBy(desc(analysisPatterns.confidence), desc(analysisPatterns.updatedAt), desc(analysisPatterns.createdAt))
        .limit(limit);

      patterns = (await fallbackQuery) as AnalysisPattern[];
    }

    if (!includeSources || patterns.length === 0) {
      return patterns;
    }

    const patternIds = patterns.map((pattern) => pattern.id);
    const sources = await db
      .select()
      .from(analysisPatternSources)
      .where(inArray(analysisPatternSources.patternId, patternIds))
      .orderBy(desc(analysisPatternSources.confidence), desc(analysisPatternSources.retrievedAt));

    const groupedSources = new Map<string, AnalysisPatternSource[]>();
    for (const source of sources) {
      const existing = groupedSources.get(source.patternId) ?? [];
      existing.push(source);
      groupedSources.set(source.patternId, existing);
    }

    return patterns.map((pattern) => ({
      ...pattern,
      sources: groupedSources.get(pattern.id) ?? [],
    }));
  }

  /**
   * Insert or update an analysis pattern discovered by the research agent.
   */
  static async recordPattern(payload: PatternRecordPayload): Promise<AnalysisPattern> {
    const parsed = insertAnalysisPatternSchema.partial().parse(payload);
    const patternId = payload.id ?? nanoid();
    const baseValues: InsertAnalysisPattern = {
      name: parsed.name ?? 'Untitled Pattern',
      industry: parsed.industry ?? 'general',
      goal: parsed.goal ?? 'general',
      toolSequence: parsed.toolSequence ?? [],
      requiredSignals: parsed.requiredSignals ?? [],
      fallbackNarratives: parsed.fallbackNarratives ?? [],
      applicableJourneys: parsed.applicableJourneys ?? [],
      confidence: parsed.confidence ?? 0,
      status: parsed.status ?? 'pending_review',
      version: parsed.version ?? 1,
      description: parsed.description,
      questionSummary: parsed.questionSummary,
      dataSchemaSignature: parsed.dataSchemaSignature,
      dataSchema: parsed.dataSchema,
      requestedBy: parsed.requestedBy,
    };

    const existing = await db
      .select({ id: analysisPatterns.id })
      .from(analysisPatterns)
      .where(eq(analysisPatterns.id, patternId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(analysisPatterns)
        .set({
          ...baseValues,
          updatedAt: now(),
        })
        .where(eq(analysisPatterns.id, patternId));
    } else {
      await db.insert(analysisPatterns).values({
        ...baseValues,
        id: patternId,
        createdAt: now(),
        updatedAt: now(),
      });
    }

    if (payload.sources && payload.sources.length > 0) {
      await this.replaceSources(patternId, payload.sources);
    }

    const [pattern] = await db
      .select()
      .from(analysisPatterns)
      .where(eq(analysisPatterns.id, patternId))
      .limit(1);

    return pattern;
  }

  /**
   * Associate supplemental research sources with a pattern, replacing previous entries.
   */
  private static async replaceSources(patternId: string, sources: Array<Partial<InsertAnalysisPatternSource>>): Promise<void> {
    await db.delete(analysisPatternSources).where(eq(analysisPatternSources.patternId, patternId));

    const parsedSources = sources
      .map((source) => insertAnalysisPatternSourceSchema.partial().parse(source))
      .map((source) => ({
        patternId,
        sourceType: source.sourceType ?? 'web',
        sourceUrl: source.sourceUrl,
        title: source.title,
        synopsis: source.synopsis,
        confidence: source.confidence ?? 0,
        metadata: source.metadata,
        retrievedAt: now(),
        id: nanoid(),
      }));

    if (parsedSources.length === 0) {
      return;
    }

    await db.insert(analysisPatternSources).values(parsedSources);
  }

  /**
   * Update a pattern's status (e.g., pending_review -> ready) with optional metadata changes.
   */
  static async updatePatternStatus(patternId: string, status: string, updates: Partial<InsertAnalysisPattern> = {}): Promise<void> {
    const parsed = insertAnalysisPatternSchema.partial().parse(updates);
    const payload: Record<string, unknown> = {
      ...parsed,
      status,
      updatedAt: now(),
    };

    if (status === 'ready' || status === 'approved') {
      payload.approvedAt = now();
    } else if (status === 'pending_review') {
      payload.approvedAt = null;
    }

    await db
      .update(analysisPatterns)
      .set(payload)
      .where(eq(analysisPatterns.id, patternId));
  }

  /**
   * Link a pattern to an existing business template so orchestrated journeys can reference both.
   */
  static async linkPatternToTemplate(options: LinkPatternToTemplateOptions): Promise<void> {
    if (!options.templateId) {
      throw new Error('templateId is required to link a pattern');
    }
    if (!options.patternId) {
      throw new Error('patternId is required to link a pattern');
    }

    const parsed = insertTemplatePatternSchema.partial().parse(options);
    const id = nanoid();

    await db
      .insert(templatePatterns)
      .values({
        id,
        templateId: parsed.templateId,
        patternId: parsed.patternId,
        relevanceScore: parsed.relevanceScore ?? 0,
        metadata: parsed.metadata,
        createdAt: now(),
      })
      .onConflictDoUpdate({
        target: [templatePatterns.templateId, templatePatterns.patternId],
        set: {
          relevanceScore: parsed.relevanceScore ?? 0,
          metadata: parsed.metadata,
        },
      });
  }
}
