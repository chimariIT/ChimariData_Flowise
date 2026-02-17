/**
 * Business Definition Registry Service
 *
 * Manages business metric definitions for data element mapping.
 * Used by BA Agent to translate abstract requirements (e.g., "engagement_score")
 * into concrete transformation logic (e.g., "average of Q1-Q5 survey scores").
 *
 * Flow:
 * 1. DS Agent identifies required element: "Engagement Score"
 * 2. BA Agent looks up definition: "engagement_score" -> formula, componentFields
 * 3. Researcher Agent fills gaps for missing definitions (external lookup)
 * 4. DE Agent uses definition to generate transformation code
 */

import { db } from '../db';
import { businessDefinitions, type BusinessDefinition, type InsertBusinessDefinition } from '@shared/schema';
import { eq, and, ilike, or, sql, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { chimaridataAI } from '../chimaridata-ai';
import { semanticSearchService } from './semantic-search-service';

export interface DefinitionLookupResult {
  found: boolean;
  definition?: BusinessDefinition;
  alternatives?: BusinessDefinition[];
  confidence: number;
  source: 'exact' | 'pattern' | 'synonym' | 'semantic' | 'ai_inferred' | 'web_search' | 'not_found';
}

export interface DefinitionSearchParams {
  conceptName?: string;
  industry?: string;
  domain?: string;
  projectId?: string;
  includeGlobal?: boolean; // Include definitions without projectId
  datasetSchema?: Record<string, any>; // Available columns for AI context
}

export interface InferDefinitionParams {
  conceptName: string;
  context: string; // Business context (user questions, goals)
  industry?: string;
  domain?: string;
  datasetSchema?: Record<string, any>; // Available columns
  existingDefinitions?: BusinessDefinition[]; // For learning patterns
}

class BusinessDefinitionRegistryService {
  // ========================================
  // LOOKUP METHODS (for BA Agent)
  // ========================================

  /**
   * Look up a business definition by concept name
   * Returns exact match, pattern match, or synonym match
   */
  async lookupDefinition(
    conceptName: string,
    params: DefinitionSearchParams = {}
  ): Promise<DefinitionLookupResult> {
    console.log(`📚 [BA Registry] Looking up definition for: "${conceptName}"`);

    const normalizedConcept = this.normalizeConceptName(conceptName);

    // 1. Try exact match first
    const exactMatch = await this.findExactMatch(normalizedConcept, params);
    if (exactMatch) {
      console.log(`✅ [BA Registry] Exact match found: ${exactMatch.conceptName}`);
      await this.incrementUsageCount(exactMatch.id);
      return {
        found: true,
        definition: exactMatch,
        confidence: 1.0,
        source: 'exact'
      };
    }

    // 2. Try pattern matching
    const patternMatch = await this.findPatternMatch(normalizedConcept, params);
    if (patternMatch) {
      console.log(`🔍 [BA Registry] Pattern match found: ${patternMatch.conceptName}`);
      await this.incrementUsageCount(patternMatch.id);
      return {
        found: true,
        definition: patternMatch,
        confidence: 0.85,
        source: 'pattern'
      };
    }

    // 3. Try synonym matching
    const synonymMatch = await this.findSynonymMatch(normalizedConcept, params);
    if (synonymMatch) {
      console.log(`🔄 [BA Registry] Synonym match found: ${synonymMatch.conceptName}`);
      await this.incrementUsageCount(synonymMatch.id);
      return {
        found: true,
        definition: synonymMatch,
        confidence: 0.75,
        source: 'synonym'
      };
    }

    // 4. Try semantic similarity search (vector embeddings)
    const semanticMatch = await this.findSemanticMatch(conceptName, params);
    if (semanticMatch) {
      console.log(`🧠 [BA Registry] Semantic match found: ${semanticMatch.definition.conceptName} (similarity: ${(semanticMatch.similarity * 100).toFixed(1)}%)`);
      await this.incrementUsageCount(semanticMatch.definition.id);
      return {
        found: true,
        definition: semanticMatch.definition,
        confidence: semanticMatch.similarity,
        source: 'semantic'
      };
    }

    // 5. Find alternatives (partial matches)
    const alternatives = await this.findAlternatives(normalizedConcept, params);

    // 6. Try to infer definition dynamically instead of returning not_found
    try {
      const inferred = await this.inferDefinition({
        conceptName: normalizedConcept,
        industry: params?.industry,
        context: conceptName, // Use concept name as context for inference
        datasetSchema: params?.datasetSchema,
      });
      if (inferred) {
        console.log(`🔍 [BA Registry] Inferred definition for: "${conceptName}"`);
        return {
          found: true,
          definition: inferred,
          confidence: 0.6,
          source: 'ai_inferred'
        };
      }
    } catch (inferErr: any) {
      console.warn(`[BA Registry] Could not infer definition for "${conceptName}":`, inferErr?.message);
    }

    // 7. Try web search via Firecrawl as final fallback
    try {
      const { webSearchService } = await import('./web-search-service');
      if (webSearchService.isAvailable()) {
        console.log(`🌐 [BA Registry] Trying web search for: "${conceptName}"`);
        const webResult = await webSearchService.searchAndExtract(
          conceptName,
          params?.industry || 'general'
        );
        if (webResult.found && webResult.definition) {
          // Create a definition from web search results and save for future
          const webDefinition = await this.createDefinition({
            key: normalizedConcept,
            name: conceptName,
            description: webResult.definition,
            formula: webResult.formula || undefined,
            alternativeNames: webResult.alternativeNames,
            industry: webResult.industry || params?.industry,
            sourceType: 'web_search' as any,
            sourceAgentId: 'firecrawl',
            confidence: webResult.confidence,
            metadata: { sourceUrl: webResult.sourceUrl, sourceName: webResult.source }
          } as any);

          if (webDefinition) {
            console.log(`🌐 [BA Registry] Web-sourced definition saved for: "${conceptName}" from ${webResult.sourceUrl}`);
            return {
              found: true,
              definition: webDefinition,
              confidence: webResult.confidence,
              source: 'web_search'
            };
          }
        }
      }
    } catch (webErr: any) {
      console.warn(`[BA Registry] Web search failed for "${conceptName}":`, webErr?.message);
    }

    console.log(`❌ [BA Registry] No definition found for: "${conceptName}"`);
    return {
      found: false,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
      confidence: 0,
      source: 'not_found'
    };
  }

  /**
   * Search definitions by multiple criteria
   */
  async searchDefinitions(params: DefinitionSearchParams): Promise<BusinessDefinition[]> {
    const conditions: any[] = [eq(businessDefinitions.status, 'active')];

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    if (params.domain) {
      conditions.push(eq(businessDefinitions.domain, params.domain));
    }

    if (params.projectId) {
      if (params.includeGlobal !== false) {
        conditions.push(
          or(
            eq(businessDefinitions.projectId, params.projectId),
            sql`${businessDefinitions.projectId} IS NULL`
          )
        );
      } else {
        conditions.push(eq(businessDefinitions.projectId, params.projectId));
      }
    }

    if (params.conceptName) {
      conditions.push(
        ilike(businessDefinitions.conceptName, `%${params.conceptName}%`)
      );
    }

    const results = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.usageCount));

    return results;
  }

  // ========================================
  // PATTERN-BASED LOOKUP (for Question Decomposition)
  // ========================================

  /**
   * Find all definitions whose matchPatterns, synonyms, or conceptName contain
   * any of the given keywords. Used by DS Agent's decomposeQuestion() for fast
   * KPI identification without AI calls.
   *
   * @param keywords - Array of lowercased keyword strings to search for
   * @param params - Optional search params (industry, projectId)
   * @returns Array of matching BusinessDefinitions with match confidence
   */
  async findByMatchPatterns(
    keywords: string[],
    params: DefinitionSearchParams = {}
  ): Promise<Array<{ definition: BusinessDefinition; matchedKeyword: string; confidence: number }>> {
    if (!keywords.length) return [];

    console.log(`🔍 [BA Registry] Pattern lookup for keywords: [${keywords.join(', ')}]`);

    const conditions: any[] = [eq(businessDefinitions.status, 'active')];

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    if (params.projectId) {
      conditions.push(
        or(
          eq(businessDefinitions.projectId, params.projectId),
          sql`${businessDefinitions.projectId} IS NULL`
        )
      );
    }

    // Fetch all active definitions (filtered by industry/project)
    const allDefs = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.confidence));

    const results: Array<{ definition: BusinessDefinition; matchedKeyword: string; confidence: number }> = [];
    const seenIds = new Set<string>();

    for (const def of allDefs) {
      if (seenIds.has(def.id)) continue;

      const matchPatterns = (def.matchPatterns as string[]) || [];
      const synonyms = (def.synonyms as string[]) || [];
      const conceptNameParts = (def.conceptName || '').toLowerCase().split('_');
      const allPatterns = [
        ...matchPatterns.map(p => p.toLowerCase()),
        ...synonyms.map(s => s.toLowerCase()),
        ...conceptNameParts
      ];

      for (const keyword of keywords) {
        const kw = keyword.toLowerCase().replace(/\s+/g, '_');
        const kwParts = keyword.toLowerCase().split(/[\s_]+/);

        // Check if any pattern contains the keyword or vice versa
        const patternMatch = allPatterns.some(p =>
          p.includes(kw) || kw.includes(p) ||
          kwParts.some(part => part.length > 3 && p.includes(part))
        );

        if (patternMatch) {
          // Score confidence based on match quality
          const exactMatch = allPatterns.includes(kw);
          const conceptMatch = def.conceptName === kw;
          const confidence = conceptMatch ? 1.0
            : exactMatch ? 0.95
            : 0.75;

          results.push({
            definition: def,
            matchedKeyword: keyword,
            confidence: Math.min(confidence, def.confidence || 0.8)
          });
          seenIds.add(def.id);
          break; // Only match each definition once
        }
      }
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);

    console.log(`✅ [BA Registry] Found ${results.length} definitions matching keywords`);
    return results;
  }

  // ========================================
  // INFERENCE METHODS (for Researcher Agent)
  // ========================================

  /**
   * Infer a business definition using AI when not found in registry
   * Used by Researcher Agent to fill gaps
   */
  async inferDefinition(params: InferDefinitionParams): Promise<BusinessDefinition | null> {
    console.log(`🔬 [Researcher Registry] Inferring definition for: "${params.conceptName}"`);

    try {
      const prompt = this.buildInferencePrompt(params);

      const response = await chimaridataAI.generateText({
        prompt,
        maxTokens: 1000,
        temperature: 0.3
      });

      // Extract text from response object (generateText returns { text, provider })
      const responseText = typeof response === 'string' ? response : response.text;
      const inferredDefinition = this.parseInferredDefinition(responseText, params);

      if (inferredDefinition) {
        // Store the inferred definition for future use
        const saved = await this.createDefinition({
          ...inferredDefinition,
          sourceType: 'ai_inferred',
          sourceAgentId: 'researcher_agent',
          confidence: 0.7 // Lower confidence for AI-inferred
        });

        console.log(`✅ [Researcher Registry] Inferred and saved: ${saved.conceptName}`);
        return saved;
      }

      return null;
    } catch (error) {
      console.error('❌ [Researcher Registry] Inference error:', error);
      return null;
    }
  }

  /**
   * Learn from successful mappings to improve definitions
   */
  async learnFromMapping(params: {
    conceptName: string;
    mappedFields: string[];
    formula: string;
    projectId: string;
    industry?: string;
    success: boolean;
  }): Promise<void> {
    console.log(`📖 [Registry Learning] Learning from mapping: ${params.conceptName}`);

    // Check if definition exists
    const existing = await this.findExactMatch(
      this.normalizeConceptName(params.conceptName),
      { projectId: params.projectId }
    );

    if (existing) {
      // Update success rate
      const currentUsage = existing.usageCount || 0;
      const currentSuccess = existing.successRate || 0.5;
      const newSuccessRate = (currentSuccess * currentUsage + (params.success ? 1 : 0)) / (currentUsage + 1);

      await db
        .update(businessDefinitions)
        .set({
          successRate: newSuccessRate,
          updatedAt: new Date()
        })
        .where(eq(businessDefinitions.id, existing.id));

      console.log(`📈 [Registry Learning] Updated success rate for ${params.conceptName}: ${newSuccessRate.toFixed(2)}`);
    } else if (params.success && params.formula) {
      // Create new definition from successful mapping
      await this.createDefinition({
        conceptName: this.normalizeConceptName(params.conceptName),
        displayName: params.conceptName,
        industry: params.industry || 'general',
        businessDescription: `Derived metric computed as: ${params.formula}`,
        calculationType: 'derived',
        formula: params.formula,
        componentFields: params.mappedFields,
        projectId: params.projectId,
        sourceType: 'ai_inferred',
        sourceAgentId: 'learning_system',
        confidence: 0.6
      });

      console.log(`📚 [Registry Learning] Created new definition from successful mapping: ${params.conceptName}`);
    }
  }

  // ========================================
  // CRUD METHODS
  // ========================================

  async createDefinition(data: Omit<InsertBusinessDefinition, 'id'>): Promise<BusinessDefinition> {
    const id = nanoid();
    const [definition] = await db
      .insert(businessDefinitions)
      .values({
        id,
        ...data
      })
      .returning();

    console.log(`✅ [BA Registry] Created definition: ${definition.conceptName}`);

    // Generate embedding asynchronously (non-blocking)
    this.generateEmbeddingAsync(id, definition);

    return definition;
  }

  async updateDefinition(id: string, data: Partial<InsertBusinessDefinition>): Promise<BusinessDefinition | null> {
    const [updated] = await db
      .update(businessDefinitions)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(businessDefinitions.id, id))
      .returning();

    if (updated) {
      // Re-generate embedding if content changed
      const contentChanged = data.conceptName || data.businessDescription ||
        data.businessContext || data.formula || data.synonyms;
      if (contentChanged) {
        this.generateEmbeddingAsync(id, updated);
      }
    }

    return updated || null;
  }

  /**
   * Generate embedding for a definition asynchronously
   * Fire-and-forget to avoid blocking CRUD operations
   */
  private async generateEmbeddingAsync(id: string, definition: BusinessDefinition): Promise<void> {
    // Don't await - let it run in background
    semanticSearchService.generateDefinitionEmbedding(id)
      .then(() => {
        console.log(`🧠 [BA Registry] Embedding generated for: ${definition.conceptName}`);
      })
      .catch((error) => {
        console.warn(`⚠️ [BA Registry] Failed to generate embedding for ${definition.conceptName}:`, error.message);
      });
  }

  async getDefinitionById(id: string): Promise<BusinessDefinition | null> {
    const [definition] = await db
      .select()
      .from(businessDefinitions)
      .where(eq(businessDefinitions.id, id));

    return definition || null;
  }

  async deleteDefinition(id: string): Promise<boolean> {
    const result = await db
      .delete(businessDefinitions)
      .where(eq(businessDefinitions.id, id))
      .returning();

    return result.length > 0;
  }

  // ========================================
  // SEED METHODS (for initial data)
  // ========================================

  /**
   * Seed common business definitions for an industry
   */
  async seedIndustryDefinitions(industry: string): Promise<number> {
    const definitions = this.getIndustryDefinitions(industry);
    let count = 0;

    for (const def of definitions) {
      // Check if already exists
      const existing = await this.findExactMatch(def.conceptName, { industry });
      if (!existing) {
        await this.createDefinition({
          ...def,
          industry,
          sourceType: 'template',
          sourceAgentId: 'system'
        });
        count++;
      }
    }

    console.log(`🌱 [BA Registry] Seeded ${count} definitions for industry: ${industry}`);
    return count;
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  private normalizeConceptName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private async findExactMatch(
    normalizedConcept: string,
    params: DefinitionSearchParams
  ): Promise<BusinessDefinition | null> {
    const conditions: any[] = [
      eq(businessDefinitions.conceptName, normalizedConcept),
      eq(businessDefinitions.status, 'active')
    ];

    if (params.projectId) {
      conditions.push(
        or(
          eq(businessDefinitions.projectId, params.projectId),
          sql`${businessDefinitions.projectId} IS NULL`
        )
      );
    }

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    const [result] = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.confidence))
      .limit(1);

    return result || null;
  }

  private async findPatternMatch(
    normalizedConcept: string,
    params: DefinitionSearchParams
  ): Promise<BusinessDefinition | null> {
    // Search for definitions where matchPatterns contains the concept
    const conditions: any[] = [
      eq(businessDefinitions.status, 'active'),
      sql`${businessDefinitions.matchPatterns}::jsonb @> ${JSON.stringify([normalizedConcept])}::jsonb`
    ];

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    const [result] = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.confidence))
      .limit(1);

    return result || null;
  }

  private async findSynonymMatch(
    normalizedConcept: string,
    params: DefinitionSearchParams
  ): Promise<BusinessDefinition | null> {
    const conditions: any[] = [
      eq(businessDefinitions.status, 'active'),
      sql`${businessDefinitions.synonyms}::jsonb @> ${JSON.stringify([normalizedConcept])}::jsonb`
    ];

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    const [result] = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.confidence))
      .limit(1);

    return result || null;
  }

  /**
   * Find semantically similar definitions using vector embeddings
   * Uses SemanticSearchService for cosine similarity search
   */
  private async findSemanticMatch(
    conceptName: string,
    params: DefinitionSearchParams
  ): Promise<{ definition: BusinessDefinition; similarity: number } | null> {
    try {
      // Use semantic search service
      const results = await semanticSearchService.findSimilarDefinitions(conceptName, {
        topK: 1,
        minSimilarity: 0.7, // 70% similarity threshold for semantic match
        industry: params.industry,
        domain: params.domain,
        projectId: params.projectId,
        includeGlobal: params.includeGlobal !== false
      });

      if (results.length > 0) {
        return {
          definition: results[0].item,
          similarity: results[0].similarity
        };
      }

      return null;
    } catch (error) {
      console.error('❌ [BA Registry] Semantic search error:', error);
      return null;
    }
  }

  private async findAlternatives(
    normalizedConcept: string,
    params: DefinitionSearchParams
  ): Promise<BusinessDefinition[]> {
    // Fuzzy search for similar concepts
    const conditions: any[] = [
      eq(businessDefinitions.status, 'active'),
      or(
        ilike(businessDefinitions.conceptName, `%${normalizedConcept}%`),
        ilike(businessDefinitions.displayName, `%${normalizedConcept}%`),
        ilike(businessDefinitions.businessDescription, `%${normalizedConcept}%`)
      )
    ];

    if (params.industry) {
      conditions.push(
        or(
          eq(businessDefinitions.industry, params.industry),
          eq(businessDefinitions.industry, 'general')
        )
      );
    }

    const results = await db
      .select()
      .from(businessDefinitions)
      .where(and(...conditions))
      .orderBy(desc(businessDefinitions.confidence))
      .limit(5);

    return results;
  }

  private async incrementUsageCount(id: string): Promise<void> {
    await db
      .update(businessDefinitions)
      .set({
        usageCount: sql`${businessDefinitions.usageCount} + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(businessDefinitions.id, id));
  }

  private buildInferencePrompt(params: InferDefinitionParams): string {
    // CRITICAL: When industry is 'general' or unknown, the AI must infer from context
    // Do NOT bias the AI toward any specific industry unless we are confident
    const industryLine = params.industry && params.industry !== 'general'
        ? `INDUSTRY: ${params.industry}`
        : `INDUSTRY: Determine the most likely industry from the concept name, context, and available columns below. Do NOT default to HR unless the data is clearly HR-related.`;

    return `You are a business analyst expert. Infer the definition for a business concept.

CONCEPT NAME: ${params.conceptName}
BUSINESS CONTEXT: ${params.context}
${industryLine}
DOMAIN: ${params.domain || 'not specified'}

${params.datasetSchema ? `AVAILABLE DATA COLUMNS: ${Object.keys(params.datasetSchema).join(', ')}\n\nIMPORTANT: Use the column names above to determine the correct business domain. For example, columns like "Campaign_ID", "Impressions", "Click_Rate" indicate marketing — NOT HR.` : ''}

Provide a JSON response with:
{
  "businessDescription": "Clear business definition of this concept IN THE CORRECT INDUSTRY CONTEXT",
  "calculationType": "direct|derived|aggregated|composite",
  "formula": "Mathematical formula if applicable",
  "componentFields": ["list", "of", "likely", "component", "fields"],
  "aggregationMethod": "average|sum|count|min|max|median|weighted_average|null",
  "expectedDataType": "numeric|categorical|boolean|datetime",
  "valueRange": { "min": 0, "max": 100 } or null,
  "matchPatterns": ["alternative", "names", "patterns"],
  "confidence": 0.0-1.0
}

Respond ONLY with the JSON, no other text.`;
  }

  private parseInferredDefinition(
    response: string,
    params: InferDefinitionParams
  ): Omit<InsertBusinessDefinition, 'id'> | null {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        conceptName: this.normalizeConceptName(params.conceptName),
        displayName: params.conceptName,
        industry: params.industry || 'general',
        domain: params.domain,
        businessDescription: parsed.businessDescription || `Business metric: ${params.conceptName}`,
        calculationType: parsed.calculationType || 'derived',
        formula: parsed.formula,
        componentFields: parsed.componentFields || [],
        aggregationMethod: parsed.aggregationMethod,
        expectedDataType: parsed.expectedDataType || 'numeric',
        valueRange: parsed.valueRange,
        matchPatterns: parsed.matchPatterns || [],
        confidence: parsed.confidence || 0.6
      };
    } catch (error) {
      console.error('Failed to parse inferred definition:', error);
      return null;
    }
  }

  private getIndustryDefinitions(industry: string): Array<Omit<InsertBusinessDefinition, 'id'>> {
    // Common definitions applicable to all industries
    const generalDefinitions: Array<Omit<InsertBusinessDefinition, 'id'>> = [
      {
        conceptName: 'overall_satisfaction_score',
        displayName: 'Overall Satisfaction Score',
        businessDescription: 'Composite satisfaction score calculated from multiple Likert scale questions',
        calculationType: 'aggregated',
        formula: 'AVG(all_likert_questions)',
        componentFields: ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10'],
        aggregationMethod: 'average',
        expectedDataType: 'numeric',
        valueRange: { min: 1, max: 5 },
        matchPatterns: ['overall_score', 'satisfaction', 'likert_average', 'composite_score', 'total_score'],
        synonyms: ['satisfaction_index', 'happiness_score', 'approval_rating'],
        confidence: 0.95
      },
      {
        conceptName: 'net_promoter_score',
        displayName: 'Net Promoter Score (NPS)',
        businessDescription: 'Measures customer loyalty: % Promoters (9-10) minus % Detractors (0-6)',
        calculationType: 'composite',
        formula: '((promoters / total) - (detractors / total)) * 100',
        componentFields: ['likelihood_to_recommend'],
        aggregationMethod: 'custom',
        expectedDataType: 'numeric',
        valueRange: { min: -100, max: 100 },
        matchPatterns: ['nps', 'net_promoter', 'recommend_score', 'loyalty_score'],
        synonyms: ['recommendation_score', 'loyalty_index'],
        unit: 'score',
        confidence: 0.95
      },
      {
        conceptName: 'response_rate',
        displayName: 'Response Rate',
        businessDescription: 'Percentage of respondents who completed the survey',
        calculationType: 'derived',
        formula: '(completed_responses / total_sent) * 100',
        componentFields: ['completed_responses', 'total_sent'],
        aggregationMethod: 'sum',
        expectedDataType: 'numeric',
        valueRange: { min: 0, max: 100 },
        matchPatterns: ['response', 'completion_rate', 'participation'],
        synonyms: ['participation_rate', 'completion_rate'],
        unit: 'percent',
        confidence: 0.95
      },
      {
        conceptName: 'agreement_index',
        displayName: 'Agreement Index',
        businessDescription: 'Percentage of respondents who agree or strongly agree (4-5 on 5-point scale)',
        calculationType: 'derived',
        formula: '((agree_count + strongly_agree_count) / total_responses) * 100',
        componentFields: ['response_value'],
        aggregationMethod: 'custom',
        expectedDataType: 'numeric',
        valueRange: { min: 0, max: 100 },
        matchPatterns: ['agreement', 'positive_response', 'favorable'],
        synonyms: ['favorability_score', 'positive_percentage'],
        unit: 'percent',
        confidence: 0.90
      },
      {
        conceptName: 'weighted_average_score',
        displayName: 'Weighted Average Score',
        businessDescription: 'Average score weighted by importance or frequency',
        calculationType: 'aggregated',
        formula: 'SUM(value * weight) / SUM(weight)',
        componentFields: ['score_value', 'weight'],
        aggregationMethod: 'weighted_average',
        expectedDataType: 'numeric',
        matchPatterns: ['weighted_score', 'weighted_avg', 'importance_weighted'],
        synonyms: ['priority_score', 'importance_score'],
        confidence: 0.90
      },
      {
        conceptName: 'variance_score',
        displayName: 'Score Variance',
        businessDescription: 'Measures how spread out responses are from the average',
        calculationType: 'aggregated',
        formula: 'VARIANCE(responses)',
        componentFields: ['response_values'],
        aggregationMethod: 'custom',
        expectedDataType: 'numeric',
        matchPatterns: ['variance', 'spread', 'dispersion'],
        synonyms: ['score_spread', 'response_variance'],
        confidence: 0.85
      }
    ];

    const definitions: Record<string, Array<Omit<InsertBusinessDefinition, 'id'>>> = {
      hr: [
        {
          conceptName: 'engagement_score',
          displayName: 'Employee Engagement Score',
          businessDescription: 'Composite metric measuring employee engagement based on survey responses',
          calculationType: 'aggregated',
          formula: 'AVG(survey_q1, survey_q2, survey_q3, survey_q4, survey_q5)',
          componentFields: ['survey_q1', 'survey_q2', 'survey_q3', 'survey_q4', 'survey_q5'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['engagement', 'eng_score', 'employee_engagement', 'satisfaction'],
          synonyms: ['satisfaction_score', 'morale_score'],
          confidence: 0.95
        },
        {
          conceptName: 'turnover_rate',
          displayName: 'Employee Turnover Rate',
          businessDescription: 'Percentage of employees who left during a period',
          calculationType: 'derived',
          formula: '(employees_left / total_employees) * 100',
          componentFields: ['employees_left', 'total_employees'],
          aggregationMethod: 'sum',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['turnover', 'attrition', 'churn'],
          synonyms: ['attrition_rate', 'churn_rate'],
          unit: 'percent',
          confidence: 0.95,
          componentFieldDescriptors: [
            {
              abstractName: 'employees_left',
              semanticMeaning: 'Count of employees who separated/left during the period',
              derivationLogic: 'COUNT rows WHERE termination_date IS NOT NULL AND within period',
              columnMatchPatterns: ['termination', 'separation', 'exit', 'term_date', 'end_date', 'status', 'termination_date', 'leave_date', 'departure'],
              columnMatchType: 'date_presence_indicator',
              dataTypeExpected: 'date',
              isIntermediate: true,
              statusValues: ['Terminated', 'Left', 'Separated', 'Resigned', 'Involuntary', 'Voluntary'],
              nullMeaning: 'Employee is still active / has not separated',
              presenceMeaning: 'Employee has separated from the organization'
            },
            {
              abstractName: 'total_employees',
              semanticMeaning: 'Average headcount during the period (total employees on roster)',
              derivationLogic: 'COUNT DISTINCT employees on roster during the period',
              columnMatchPatterns: ['employee_id', 'emp_id', 'roster', 'headcount', 'staff_id', 'worker_id', 'personnel_id', 'ee_id'],
              columnMatchType: 'count_distinct',
              dataTypeExpected: 'identifier',
              isIntermediate: true
            },
            {
              abstractName: 'period_date',
              semanticMeaning: 'The date establishing the analysis period (roster date, report date)',
              derivationLogic: 'Use as period filter for turnover calculation',
              columnMatchPatterns: ['roster_date', 'report_date', 'period_date', 'effective_date', 'snapshot_date', 'as_of_date'],
              columnMatchType: 'date_range_filter',
              dataTypeExpected: 'date',
              isIntermediate: false
            },
            {
              abstractName: 'hire_date',
              semanticMeaning: 'Employee hire date - used to exclude employees hired outside the period',
              derivationLogic: 'Filter employees WHERE hire_date <= period_end to exclude new hires after period',
              columnMatchPatterns: ['hire_date', 'start_date', 'date_hired', 'employment_start', 'join_date', 'onboard_date'],
              columnMatchType: 'date_range_filter',
              dataTypeExpected: 'date',
              isIntermediate: false
            }
          ]
        },
        {
          conceptName: 'tenure',
          displayName: 'Employee Tenure',
          businessDescription: 'Length of time an employee has been with the company',
          calculationType: 'derived',
          formula: 'DATEDIFF(current_date, hire_date)',
          componentFields: ['hire_date'],
          expectedDataType: 'numeric',
          matchPatterns: ['tenure', 'years_of_service', 'employment_length'],
          synonyms: ['service_years', 'time_employed'],
          unit: 'days',
          confidence: 0.95,
          componentFieldDescriptors: [
            {
              abstractName: 'hire_date',
              semanticMeaning: 'The date the employee was hired / started employment',
              derivationLogic: 'DATEDIFF(current_date OR termination_date, hire_date) to compute tenure in days',
              columnMatchPatterns: ['hire_date', 'start_date', 'date_hired', 'employment_start', 'join_date', 'onboard_date'],
              columnMatchType: 'direct_value',
              dataTypeExpected: 'date',
              isIntermediate: false
            },
            {
              abstractName: 'reference_date',
              semanticMeaning: 'End date for tenure calculation (current date or termination date)',
              derivationLogic: 'Use termination_date if employee left, otherwise use current_date',
              columnMatchPatterns: ['termination_date', 'end_date', 'leave_date', 'roster_date', 'report_date'],
              columnMatchType: 'direct_value',
              dataTypeExpected: 'date',
              isIntermediate: false,
              nullMeaning: 'Employee is still active - use current date as reference'
            }
          ]
        },
        {
          conceptName: 'employee_satisfaction_index',
          displayName: 'Employee Satisfaction Index',
          businessDescription: 'Overall employee satisfaction calculated from multiple survey dimensions',
          calculationType: 'aggregated',
          formula: 'AVG(work_satisfaction, manager_satisfaction, compensation_satisfaction, growth_satisfaction)',
          componentFields: ['work_satisfaction', 'manager_satisfaction', 'compensation_satisfaction', 'growth_satisfaction'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['employee_satisfaction', 'staff_satisfaction', 'esi', 'esat'],
          synonyms: ['staff_satisfaction_index', 'workplace_satisfaction'],
          confidence: 0.95
        },
        {
          conceptName: 'training_effectiveness_score',
          displayName: 'Training Effectiveness Score',
          businessDescription: 'Measures impact of training programs on employee performance',
          calculationType: 'aggregated',
          formula: 'AVG(knowledge_gain, skill_improvement, job_application, satisfaction)',
          componentFields: ['knowledge_gain', 'skill_improvement', 'job_application', 'training_satisfaction'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['training_score', 'learning_effectiveness', 'training_impact'],
          synonyms: ['learning_score', 'development_effectiveness'],
          confidence: 0.90
        },
        {
          conceptName: 'performance_rating',
          displayName: 'Performance Rating',
          businessDescription: 'Overall employee performance score from evaluations',
          calculationType: 'aggregated',
          formula: 'AVG(goal_achievement, competency_score, manager_rating)',
          componentFields: ['goal_achievement', 'competency_score', 'manager_rating'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['performance', 'rating', 'evaluation_score', 'appraisal'],
          synonyms: ['evaluation_score', 'appraisal_rating'],
          confidence: 0.95
        },
        {
          conceptName: 'absenteeism_rate',
          displayName: 'Absenteeism Rate',
          businessDescription: 'Percentage of workdays lost to unplanned absences',
          calculationType: 'derived',
          formula: '(absent_days / total_workdays) * 100',
          componentFields: ['absent_days', 'total_workdays'],
          aggregationMethod: 'sum',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['absenteeism', 'absence_rate', 'sick_days'],
          synonyms: ['absence_percentage', 'attendance_gap'],
          unit: 'percent',
          confidence: 0.95,
          componentFieldDescriptors: [
            {
              abstractName: 'absent_days',
              semanticMeaning: 'Number of unplanned absence days per employee',
              derivationLogic: 'SUM or COUNT of absence records per employee',
              columnMatchPatterns: ['absent', 'absence', 'sick_days', 'days_off', 'unplanned_leave', 'absences_count'],
              columnMatchType: 'direct_value',
              dataTypeExpected: 'numeric',
              isIntermediate: false
            },
            {
              abstractName: 'total_workdays',
              semanticMeaning: 'Total available workdays in the period',
              derivationLogic: 'Count of scheduled workdays in the analysis period',
              columnMatchPatterns: ['workdays', 'total_days', 'scheduled_days', 'working_days', 'available_days'],
              columnMatchType: 'direct_value',
              dataTypeExpected: 'numeric',
              isIntermediate: false
            }
          ]
        }
      ],
      sales: [
        {
          conceptName: 'customer_lifetime_value',
          displayName: 'Customer Lifetime Value (CLV)',
          businessDescription: 'Predicted total revenue from a customer over their relationship',
          calculationType: 'composite',
          formula: 'average_purchase_value * purchase_frequency * customer_lifespan',
          componentFields: ['average_purchase_value', 'purchase_frequency', 'customer_lifespan'],
          expectedDataType: 'numeric',
          matchPatterns: ['ltv', 'clv', 'lifetime_value', 'customer_value'],
          synonyms: ['ltv', 'customer_worth'],
          unit: 'currency',
          confidence: 0.95
        },
        {
          conceptName: 'conversion_rate',
          displayName: 'Sales Conversion Rate',
          businessDescription: 'Percentage of leads that become customers',
          calculationType: 'derived',
          formula: '(conversions / total_leads) * 100',
          componentFields: ['conversions', 'total_leads'],
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['conversion', 'close_rate', 'win_rate'],
          synonyms: ['close_rate', 'win_rate'],
          unit: 'percent',
          confidence: 0.95
        }
      ],
      finance: [
        {
          conceptName: 'roi',
          displayName: 'Return on Investment',
          businessDescription: 'Measure of profitability relative to investment',
          calculationType: 'derived',
          formula: '((gain - cost) / cost) * 100',
          componentFields: ['gain', 'cost', 'investment'],
          expectedDataType: 'numeric',
          matchPatterns: ['roi', 'return_on_investment', 'investment_return'],
          synonyms: ['return_on_capital', 'investment_yield'],
          unit: 'percent',
          confidence: 0.95
        }
      ],
      education: [
        {
          conceptName: 'graduation_rate',
          displayName: 'Graduation Rate',
          businessDescription: 'Percentage of students who complete their program',
          calculationType: 'derived',
          formula: '(graduates / enrolled_students) * 100',
          componentFields: ['graduates', 'enrolled_students'],
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['graduation', 'completion_rate', 'pass_rate'],
          synonyms: ['completion_rate', 'success_rate'],
          unit: 'percent',
          confidence: 0.95
        },
        {
          conceptName: 'student_satisfaction_score',
          displayName: 'Student Satisfaction Score',
          businessDescription: 'Overall student satisfaction from course evaluations',
          calculationType: 'aggregated',
          formula: 'AVG(teaching_quality, course_content, support_services, facilities)',
          componentFields: ['teaching_quality', 'course_content', 'support_services', 'facilities'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['student_satisfaction', 'course_eval', 'student_feedback'],
          synonyms: ['course_rating', 'student_experience_score'],
          confidence: 0.95
        },
        {
          conceptName: 'parent_engagement_score',
          displayName: 'Parent Engagement Score',
          businessDescription: 'Measures parent involvement in educational activities',
          calculationType: 'aggregated',
          formula: 'AVG(event_attendance, communication_response, volunteer_hours, conference_attendance)',
          componentFields: ['event_attendance', 'communication_response', 'volunteer_hours', 'conference_attendance'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['parent_engagement', 'parent_involvement', 'family_engagement'],
          synonyms: ['family_involvement_score', 'parent_participation'],
          confidence: 0.90
        }
      ],
      marketing: [
        {
          conceptName: 'customer_satisfaction_score',
          displayName: 'Customer Satisfaction Score (CSAT)',
          businessDescription: 'Percentage of customers who rate their experience as satisfied or very satisfied',
          calculationType: 'derived',
          formula: '(satisfied_responses / total_responses) * 100',
          componentFields: ['satisfaction_rating'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['csat', 'customer_satisfaction', 'satisfaction_score'],
          synonyms: ['satisfaction_percentage', 'customer_happiness'],
          unit: 'percent',
          confidence: 0.95
        },
        {
          conceptName: 'engagement_rate',
          displayName: 'Engagement Rate',
          businessDescription: 'Percentage of audience that interacts with content',
          calculationType: 'derived',
          formula: '((likes + comments + shares) / impressions) * 100',
          componentFields: ['likes', 'comments', 'shares', 'impressions'],
          aggregationMethod: 'sum',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['engagement', 'interaction_rate', 'response_rate'],
          synonyms: ['interaction_rate', 'audience_engagement'],
          unit: 'percent',
          confidence: 0.95
        },
        {
          conceptName: 'brand_awareness_score',
          displayName: 'Brand Awareness Score',
          businessDescription: 'Composite measure of brand recognition and recall',
          calculationType: 'aggregated',
          formula: 'AVG(aided_recall, unaided_recall, recognition)',
          componentFields: ['aided_recall', 'unaided_recall', 'recognition'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['brand_awareness', 'brand_recognition', 'brand_recall'],
          synonyms: ['awareness_index', 'brand_familiarity'],
          unit: 'percent',
          confidence: 0.90
        }
      ],
      healthcare: [
        {
          conceptName: 'patient_satisfaction_score',
          displayName: 'Patient Satisfaction Score',
          businessDescription: 'Overall patient satisfaction with healthcare services',
          calculationType: 'aggregated',
          formula: 'AVG(care_quality, communication, wait_time_satisfaction, facility_cleanliness)',
          componentFields: ['care_quality', 'communication', 'wait_time_satisfaction', 'facility_cleanliness'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['patient_satisfaction', 'patient_experience', 'hcahps'],
          synonyms: ['patient_experience_score', 'care_satisfaction'],
          confidence: 0.95
        },
        {
          conceptName: 'readmission_rate',
          displayName: 'Readmission Rate',
          businessDescription: 'Percentage of patients readmitted within 30 days',
          calculationType: 'derived',
          formula: '(readmissions / total_discharges) * 100',
          componentFields: ['readmissions', 'total_discharges'],
          aggregationMethod: 'sum',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['readmission', '30_day_readmission', 'return_rate'],
          synonyms: ['return_rate', 'bounce_back_rate'],
          unit: 'percent',
          confidence: 0.95
        }
      ],
      survey: [
        {
          conceptName: 'likert_scale_average',
          displayName: 'Likert Scale Average',
          businessDescription: 'Average response on a Likert scale (typically 1-5 or 1-7)',
          calculationType: 'aggregated',
          formula: 'AVG(q1, q2, q3, q4, q5, ...)',
          componentFields: ['q1', 'q2', 'q3', 'q4', 'q5'],
          aggregationMethod: 'average',
          expectedDataType: 'numeric',
          valueRange: { min: 1, max: 5 },
          matchPatterns: ['likert', 'scale_average', 'survey_score', 'question_average'],
          synonyms: ['survey_average', 'rating_average', 'mean_score'],
          confidence: 0.95
        },
        {
          conceptName: 'survey_composite_index',
          displayName: 'Survey Composite Index',
          businessDescription: 'Combined index from multiple survey dimensions',
          calculationType: 'composite',
          formula: 'weighted_avg(dimension_scores)',
          componentFields: ['dimension_1', 'dimension_2', 'dimension_3'],
          aggregationMethod: 'weighted_average',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['composite_index', 'overall_index', 'combined_score'],
          synonyms: ['aggregate_score', 'combined_index'],
          confidence: 0.90
        },
        {
          conceptName: 'top_box_score',
          displayName: 'Top Box Score',
          businessDescription: 'Percentage selecting highest rating option (5 on 5-point scale)',
          calculationType: 'derived',
          formula: '(top_rating_count / total_responses) * 100',
          componentFields: ['response_value'],
          aggregationMethod: 'custom',
          expectedDataType: 'numeric',
          valueRange: { min: 0, max: 100 },
          matchPatterns: ['top_box', 'top_2_box', 'highest_rating'],
          synonyms: ['excellent_percentage', 'top_rating_percentage'],
          unit: 'percent',
          confidence: 0.90
        }
      ]
    };

    // Always include general definitions + industry-specific ones
    const industrySpecific = definitions[industry.toLowerCase()] || [];
    return [...generalDefinitions, ...industrySpecific];
  }

  // ========================================
  // DATASET-AWARE ENRICHMENT
  // ========================================

  /**
   * Enrich a business definition with actual dataset context.
   * Resolves abstract component fields (e.g., "employees_left", "total_employees")
   * to actual dataset columns (e.g., "Termination_Date", "Employee_ID").
   *
   * Assigns semantic roles to each resolved field:
   * - period_indicator: date columns defining the analysis time period
   * - separation_indicator: columns indicating an event (e.g., NULL = active, non-NULL = separated)
   * - metric_source: numeric columns used in calculations
   * - grouping_dimension: categorical columns for aggregation (department, region, etc.)
   * - identifier: ID columns for entity tracking
   */
  async enrichDefinitionWithDatasetContext(
    definition: BusinessDefinition,
    datasetSchema: Record<string, any>,
    preview: any[],
    context?: { industry?: string; dataContext?: string }
  ): Promise<{
    resolvedComponentFields: Array<{
      abstractName: string;
      resolvedColumn: string | null;
      role: 'period_indicator' | 'separation_indicator' | 'metric_source' | 'grouping_dimension' | 'identifier';
      resolution: string;
    }>;
    dateContext?: {
      periodColumn: string | null;
      periodGranularity: string | null;
      dateColumns: Array<{ column: string; role: string; nullMeaning: string }>;
    };
  }> {
    const componentFields = (definition.componentFields as string[]) || [];
    const schemaColumns = Object.keys(datasetSchema);
    const resolvedFields: Array<{
      abstractName: string;
      resolvedColumn: string | null;
      role: 'period_indicator' | 'separation_indicator' | 'metric_source' | 'grouping_dimension' | 'identifier';
      resolution: string;
    }> = [];

    // Classify columns by type
    const dateColumns: string[] = [];
    const numericColumns: string[] = [];
    const categoricalColumns: string[] = [];

    for (const col of schemaColumns) {
      const colInfo = datasetSchema[col];
      const colType = (typeof colInfo === 'string' ? colInfo : (colInfo as any)?.type || '').toLowerCase();
      if (/date|datetime|timestamp/i.test(colType)) dateColumns.push(col);
      else if (/number|integer|float|numeric|decimal/i.test(colType)) numericColumns.push(col);
      else if (/string|text|categorical|varchar/i.test(colType)) categoricalColumns.push(col);
    }

    // Analyze date columns for null patterns (for separation indicators)
    const dateColumnNullRatios: Record<string, number> = {};
    if (preview.length > 0) {
      for (const col of dateColumns) {
        const values = preview.map(row => row[col]);
        const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
        dateColumnNullRatios[col] = nullCount / values.length;
      }
    }

    // Find date columns that look like separation/termination indicators
    // (high null rate = many active employees, non-null = separated)
    const dateContextResult: {
      periodColumn: string | null;
      periodGranularity: string | null;
      dateColumns: Array<{ column: string; role: string; nullMeaning: string }>;
    } = { periodColumn: null, periodGranularity: null, dateColumns: [] };

    // Separation indicator patterns
    const separationPatterns = /terminat|separat|end_date|exit_date|last_day|resign|depart/i;
    // Period/start date patterns
    const periodPatterns = /hire_date|start_date|join_date|created|date|period|year|month/i;
    // Grouping dimension patterns
    const groupingPatterns = /department|dept|region|location|team|division|unit|office|branch|manager|supervisor|leader/i;
    // Identifier patterns
    const identifierPatterns = /employee_id|emp_id|staff_id|worker_id|person_id|customer_id|student_id|id/i;

    for (const abstractField of componentFields) {
      const normalizedAbstract = abstractField.toLowerCase().replace(/[_\s-]+/g, '');

      // Classify the abstract field's semantic role
      let role: 'period_indicator' | 'separation_indicator' | 'metric_source' | 'grouping_dimension' | 'identifier' = 'metric_source';

      if (/separat|terminat|left|leave|exit|attrition|turnover_indicator|departed/i.test(abstractField)) {
        role = 'separation_indicator';
      } else if (/period|date|time|year|month|quarter/i.test(abstractField)) {
        role = 'period_indicator';
      } else if (/group|department|region|division|team|segment|category/i.test(abstractField)) {
        role = 'grouping_dimension';
      } else if (/total|count|headcount|employee|number_of|size/i.test(abstractField)) {
        role = 'metric_source';
      } else if (/identifier|id$/i.test(abstractField)) {
        role = 'identifier';
      }

      let resolvedColumn: string | null = null;
      let resolution = '';

      switch (role) {
        case 'separation_indicator': {
          // Find date columns with high null rate and separation-like names
          const separationDateCols = dateColumns
            .filter(col => separationPatterns.test(col))
            .sort((a, b) => (dateColumnNullRatios[b] || 0) - (dateColumnNullRatios[a] || 0));

          if (separationDateCols.length > 0) {
            resolvedColumn = separationDateCols[0];
            const nullPct = ((dateColumnNullRatios[resolvedColumn] || 0) * 100).toFixed(0);
            resolution = `Date column "${resolvedColumn}" (${nullPct}% null → likely indicates active records)`;
            dateContextResult.dateColumns.push({
              column: resolvedColumn,
              role: 'separation_indicator',
              nullMeaning: 'employee is still active'
            });
          } else {
            // Fallback: any date column with >20% nulls
            const highNullDateCols = dateColumns
              .filter(col => (dateColumnNullRatios[col] || 0) > 0.2)
              .sort((a, b) => (dateColumnNullRatios[b] || 0) - (dateColumnNullRatios[a] || 0));
            if (highNullDateCols.length > 0) {
              resolvedColumn = highNullDateCols[0];
              resolution = `Date column "${resolvedColumn}" has ${((dateColumnNullRatios[resolvedColumn] || 0) * 100).toFixed(0)}% nulls (potential separation indicator)`;
              dateContextResult.dateColumns.push({
                column: resolvedColumn,
                role: 'potential_separation_indicator',
                nullMeaning: 'record may still be active'
              });
            } else {
              resolution = 'No date column with separation pattern found';
            }
          }
          break;
        }

        case 'period_indicator': {
          // Find best period column
          const periodCols = dateColumns
            .filter(col => periodPatterns.test(col))
            .sort((a, b) => {
              // Prefer columns with fewer nulls (more complete)
              return (dateColumnNullRatios[a] || 0) - (dateColumnNullRatios[b] || 0);
            });

          if (periodCols.length > 0) {
            resolvedColumn = periodCols[0];
            // Estimate granularity from preview
            let granularity = 'unknown';
            if (preview.length > 0) {
              const uniqueValues = new Set(preview.map(r => r[resolvedColumn!]).filter(Boolean));
              if (uniqueValues.size <= 4) granularity = 'quarter';
              else if (uniqueValues.size <= 12) granularity = 'month';
              else if (uniqueValues.size <= 52) granularity = 'week';
              else granularity = 'day';
            }
            dateContextResult.periodColumn = resolvedColumn;
            dateContextResult.periodGranularity = granularity;
            resolution = `Period column "${resolvedColumn}" (granularity: ~${granularity})`;
          } else if (dateColumns.length > 0) {
            resolvedColumn = dateColumns[0];
            dateContextResult.periodColumn = resolvedColumn;
            resolution = `Fallback date column "${resolvedColumn}"`;
          } else {
            resolution = 'No date columns found in dataset';
          }
          break;
        }

        case 'grouping_dimension': {
          // Find categorical columns matching grouping patterns
          const matchingCols = categoricalColumns
            .filter(col => groupingPatterns.test(col))
            .sort((a, b) => {
              // Prefer exact-ish match to the abstract field name
              const aNorm = a.toLowerCase().replace(/[_\s-]+/g, '');
              const bNorm = b.toLowerCase().replace(/[_\s-]+/g, '');
              const aMatch = aNorm.includes(normalizedAbstract) || normalizedAbstract.includes(aNorm) ? 1 : 0;
              const bMatch = bNorm.includes(normalizedAbstract) || normalizedAbstract.includes(bNorm) ? 1 : 0;
              return bMatch - aMatch;
            });

          if (matchingCols.length > 0) {
            resolvedColumn = matchingCols[0];
            resolution = `Categorical column "${resolvedColumn}" matches grouping pattern`;
          } else if (categoricalColumns.length > 0) {
            // Try fuzzy match
            const fuzzy = categoricalColumns.find(col =>
              col.toLowerCase().replace(/[_\s-]+/g, '').includes(normalizedAbstract) ||
              normalizedAbstract.includes(col.toLowerCase().replace(/[_\s-]+/g, ''))
            );
            if (fuzzy) {
              resolvedColumn = fuzzy;
              resolution = `Fuzzy match to categorical column "${fuzzy}"`;
            } else {
              resolution = `No categorical column matches "${abstractField}"`;
            }
          }
          break;
        }

        case 'identifier': {
          const idCols = schemaColumns.filter(col => identifierPatterns.test(col));
          if (idCols.length > 0) {
            resolvedColumn = idCols[0];
            resolution = `Identifier column "${resolvedColumn}"`;
          }
          break;
        }

        case 'metric_source':
        default: {
          // Match numeric columns by name similarity
          const matchingNumerics = numericColumns.filter(col => {
            const colNorm = col.toLowerCase().replace(/[_\s-]+/g, '');
            return colNorm.includes(normalizedAbstract) || normalizedAbstract.includes(colNorm);
          });
          if (matchingNumerics.length > 0) {
            resolvedColumn = matchingNumerics[0];
            resolution = `Numeric column "${resolvedColumn}" matches "${abstractField}"`;
          } else {
            resolution = `No numeric column matches "${abstractField}"`;
          }
          break;
        }
      }

      resolvedFields.push({ abstractName: abstractField, resolvedColumn, role, resolution });
    }

    const resolvedCount = resolvedFields.filter(f => f.resolvedColumn).length;
    console.log(`🔧 [BA Registry] Enriched "${definition.conceptName}": ${resolvedCount}/${componentFields.length} fields resolved`);
    for (const f of resolvedFields) {
      console.log(`   ${f.resolvedColumn ? '✅' : '⚠️'} ${f.abstractName} → ${f.resolvedColumn || 'UNRESOLVED'} (${f.role}: ${f.resolution})`);
    }

    return {
      resolvedComponentFields: resolvedFields,
      dateContext: dateContextResult
    };
  }
}

// Export singleton instance
export const businessDefinitionRegistry = new BusinessDefinitionRegistryService();
