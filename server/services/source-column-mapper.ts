// server/services/source-column-mapper.ts
/**
 * Source Column Mapper Service
 *
 * Bridges the gap between abstract column names from DS Agent definitions
 * (e.g., "Q1_Score") and actual dataset column names (e.g., "Q1 - Score").
 *
 * Uses multi-level matching with fallback chain:
 * 1. Exact match (100% confidence)
 * 2. Normalized match (95% confidence) - strip underscores, hyphens, spaces
 * 3. Fuzzy match (80-90% confidence) - word overlap, contains
 * 4. Semantic pattern match (70-85% confidence) - regex patterns for common types
 * 5. Embedding similarity (60-80% confidence) - for complex cases
 */

import { embeddingService } from './embedding-service';
import { columnEmbeddingGenerator } from './column-embedding-generator';

export interface ColumnMapping {
  abstractField: string;      // "Q1_Score" from DS definition
  actualColumn: string | null; // "Q1 - Score" from dataset
  confidence: number;          // 0-100
  matchMethod: 'exact' | 'normalized' | 'fuzzy' | 'semantic' | 'embedding' | 'user_provided';
  alternatives: Array<{ column: string; confidence: number }>;
}

export interface ElementMappingResult {
  elementId: string;
  elementName: string;
  mappings: ColumnMapping[];
  allMapped: boolean;
  missingFields: string[];
  overallConfidence: number;
}

export interface DataElementDefinition {
  elementId: string;
  elementName: string;
  calculationDefinition?: {
    calculationType?: string;
    formula?: {
      componentFields?: string[];
      aggregationMethod?: string;
      pseudoCode?: string;
      code?: string;
      businessDescription?: string;
    };
  };
  dataType?: string;
  // Context fields for smarter matching
  purpose?: string;           // e.g., "unique identifier", "engagement score"
  context?: string;           // e.g., "employee survey", "HR data"
  description?: string;       // Full description for better matching
  dsRecommendation?: string;  // DS Agent's recommendation for what column to use
}

/**
 * Context hints for smarter column matching
 */
export interface MappingContext {
  dataContext?: string;       // e.g., "employee", "customer", "survey"
  industry?: string;          // e.g., "HR", "education", "retail"
  analysisType?: string;      // e.g., "engagement", "satisfaction", "performance"
}

export interface SchemaDefinition {
  [columnName: string]: {
    type: string;
    sampleValues?: any[];
    nullable?: boolean;
  };
}

export interface UserProvidedMapping {
  abstractField: string;
  actualColumn: string;
}

export class SourceColumnMapper {
  private embeddingCache: Map<string, number[]> = new Map();
  private readonly CONFIDENCE_THRESHOLD = 50; // Minimum confidence to accept auto-match

  /**
   * Auto-map abstract column names to actual dataset columns
   * @param projectId - Optional project ID for RAG-based matching using pre-computed embeddings
   */
  async mapElementToColumns(
    element: DataElementDefinition,
    availableColumns: string[],
    datasetSchema: SchemaDefinition,
    userProvidedMappings?: UserProvidedMapping[],
    projectId?: string
  ): Promise<ElementMappingResult> {
    const componentFields = element.calculationDefinition?.formula?.componentFields || [];
    const mappings: ColumnMapping[] = [];

    // Build user-provided mapping lookup
    const userMappingLookup = new Map<string, string>();
    if (userProvidedMappings) {
      for (const m of userProvidedMappings) {
        userMappingLookup.set(m.abstractField.toLowerCase(), m.actualColumn);
      }
    }

    for (const abstractField of componentFields) {
      // Check for user-provided mapping first
      const userMapping = userMappingLookup.get(abstractField.toLowerCase());
      if (userMapping && availableColumns.includes(userMapping)) {
        mappings.push({
          abstractField,
          actualColumn: userMapping,
          confidence: 100,
          matchMethod: 'user_provided',
          alternatives: []
        });
        continue;
      }

      // Auto-match (uses RAG if projectId provided and embeddings exist)
      const mapping = await this.findBestMatch(abstractField, availableColumns, datasetSchema, projectId);
      mappings.push(mapping);
    }

    const missingFields = mappings.filter(m => !m.actualColumn).map(m => m.abstractField);

    return {
      elementId: element.elementId,
      elementName: element.elementName,
      mappings,
      allMapped: missingFields.length === 0,
      missingFields,
      overallConfidence: mappings.length > 0
        ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
        : 0
    };
  }

  /**
   * Batch map multiple elements at once
   * @param projectId - Optional project ID for RAG-based matching using pre-computed embeddings
   * @param context - Optional context for smarter matching (industry, data context)
   */
  async mapMultipleElements(
    elements: DataElementDefinition[],
    availableColumns: string[],
    datasetSchema: SchemaDefinition,
    userProvidedMappings?: UserProvidedMapping[],
    projectId?: string,
    context?: MappingContext,
    preview?: any[]       // NEW - sample rows for cardinality-based identifier ranking
  ): Promise<ElementMappingResult[]> {
    const results: ElementMappingResult[] = [];

    // Check if RAG is available for this project
    if (projectId) {
      const hasEmbeddings = await columnEmbeddingGenerator.hasEmbeddings(projectId);
      if (hasEmbeddings) {
        console.log(`🎯 [Mapper] RAG mode enabled for project ${projectId}`);
      } else {
        console.log(`ℹ️ [Mapper] No pre-computed embeddings found, using standard matching`);
      }
    }

    // Build user-provided mapping lookup
    const userMappingLookup = new Map<string, string>();
    if (userProvidedMappings) {
      for (const m of userProvidedMappings) {
        userMappingLookup.set(m.abstractField.toLowerCase(), m.actualColumn);
      }
    }

    // Log context if available
    if (context) {
      console.log(`🏭 [Mapper] Using context: industry=${context.industry || 'unknown'}, dataContext=${context.dataContext || 'unknown'}`);
    }

    // Phase 1B: Semantic column discovery for derived/composite/aggregated elements
    // This expands componentFields by finding semantically related columns in the dataset
    if (projectId) {
      for (const element of elements) {
        const calcType = element.calculationDefinition?.calculationType;
        if (calcType && ['derived', 'composite', 'aggregated'].includes(calcType)) {
          try {
            const discovery = await this.discoverSemanticColumns(
              element, availableColumns, datasetSchema, projectId,
              {
                minSimilarity: 0.65,
                maxAdditional: 10,
                filterByDataType: element.dataType === 'numeric' ? 'numeric' : undefined
              }
            );
            if (discovery.discoveredFields.length > 0 && element.calculationDefinition?.formula) {
              element.calculationDefinition.formula.componentFields = discovery.expandedFields;
            }
          } catch (err) {
            // Non-blocking — continue with original componentFields
            console.warn(`⚠️ [Mapper] Semantic discovery failed for "${element.elementName}":`, (err as Error).message);
          }
        }
      }
    }

    for (const element of elements) {
      // Handle elements with componentFields
      if (element.calculationDefinition?.formula?.componentFields) {
        // Use DS-aware mapping if element has DS recommendation or context is provided
        if (element.dsRecommendation || element.purpose || context) {
          const mapping = await this.mapElementWithDsRecommendation(
            element,
            availableColumns,
            datasetSchema,
            context,
            projectId,
            preview
          );

          // Apply user-provided mappings on top (highest priority)
          for (const m of mapping.mappings) {
            const userMapping = userMappingLookup.get(m.abstractField.toLowerCase());
            if (userMapping && availableColumns.includes(userMapping)) {
              m.actualColumn = userMapping;
              m.confidence = 100;
              m.matchMethod = 'user_provided';
              console.log(`✅ [Mapper] User override: ${m.abstractField} → ${userMapping}`);
            }
          }

          results.push(mapping);
        } else {
          // Standard mapping
          const mapping = await this.mapElementToColumns(
            element,
            availableColumns,
            datasetSchema,
            userProvidedMappings,
            projectId
          );
          results.push(mapping);
        }
      }
      // Handle elements without componentFields but with description/purpose
      else if (element.description || element.purpose) {
        // Try to extract component fields from description or DS recommendation
        const formula = element.calculationDefinition?.formula?.businessDescription ||
                       element.dsRecommendation ||
                       element.description || '';

        const parsedFields = this.parseFormulaComponents(formula);

        if (parsedFields.length > 0) {
          // Create a temporary element with parsed fields
          const enhancedElement: DataElementDefinition = {
            ...element,
            calculationDefinition: {
              ...element.calculationDefinition,
              formula: {
                ...element.calculationDefinition?.formula,
                componentFields: parsedFields
              }
            }
          };

          const mapping = await this.mapElementWithDsRecommendation(
            enhancedElement,
            availableColumns,
            datasetSchema,
            context,
            projectId,
            preview
          );
          results.push(mapping);
        }
      }
    }

    return results;
  }

  /**
   * Map a single abstract field name to the best matching actual dataset column.
   * This is the primary entry point for Phase 3 unification — required-data-elements-tool
   * delegates its column matching here instead of reimplementing it.
   *
   * Returns a result compatible with required-data-elements-tool's findBestMatch() signature.
   */
  async mapSingleField(
    abstractField: string,
    options: {
      projectId?: string;
      availableColumns: string[];
      schema: SchemaDefinition;
    }
  ): Promise<{
    found: boolean;
    sourceField?: string;
    confidence: number;
    matchMethod: string;
    alternatives: string[];
  }> {
    const mapping = await this.findBestMatch(
      abstractField,
      options.availableColumns,
      options.schema,
      options.projectId
    );

    return {
      found: mapping.actualColumn !== null,
      sourceField: mapping.actualColumn ?? undefined,
      confidence: mapping.confidence,
      matchMethod: mapping.matchMethod,
      alternatives: mapping.alternatives.map(a => a.column)
    };
  }

  /**
   * Map a single data element to dataset columns, using the full RAG-first cascade.
   * This wraps mapElementToColumns / mapElementWithDsRecommendation for use by
   * required-data-elements-tool as a unified entry point.
   *
   * Returns a result compatible with required-data-elements-tool's findBestMatch() signature.
   */
  async mapSingleElement(
    element: {
      elementName: string;
      description?: string;
      purpose?: string;
      dataType?: string;
      calculationDefinition?: any;
      dsRecommendation?: string;
      relatedQuestions?: string[];
    },
    options: {
      projectId?: string;
      availableColumns: string[];
      schema: SchemaDefinition;
      preview?: any[];
      questionContext?: string[];
      industry?: string;
    }
  ): Promise<{
    found: boolean;
    sourceField?: string;
    sourceDataType?: string;
    confidence: number;
    matchMethod: string;
    alternatives: string[];
    transformationNeeded: boolean;
  }> {
    const context: MappingContext = {
      industry: options.industry,
      dataContext: options.industry
    };

    // Convert to DataElementDefinition
    const elementDef: DataElementDefinition = {
      elementId: (element as any).elementId || element.elementName,
      elementName: element.elementName,
      calculationDefinition: element.calculationDefinition,
      dataType: element.dataType,
      purpose: element.purpose,
      description: element.description,
      dsRecommendation: element.dsRecommendation
    };

    // Use DS-recommendation-aware mapping if context is available
    const result = await this.mapElementWithDsRecommendation(
      elementDef,
      options.availableColumns,
      options.schema,
      context,
      options.projectId,
      options.preview
    );

    if (result.mappings.length > 0 && result.mappings[0].actualColumn) {
      const best = result.mappings[0];
      const actualCol = best.actualColumn!; // Narrowed by the if-check above
      const fieldType = options.schema[actualCol]?.type;
      const calcType = element.calculationDefinition?.calculationType;
      const needsTransform = calcType != null && calcType !== 'direct';

      return {
        found: true,
        sourceField: actualCol,
        sourceDataType: fieldType,
        confidence: best.confidence,
        matchMethod: best.matchMethod,
        alternatives: best.alternatives.map(a => a.column),
        transformationNeeded: needsTransform
      };
    }

    // Fall back to direct field matching using element name
    const directMatch = await this.findBestMatch(
      element.elementName,
      options.availableColumns,
      options.schema,
      options.projectId
    );

    if (directMatch.actualColumn) {
      const fieldType = options.schema[directMatch.actualColumn]?.type;
      return {
        found: true,
        sourceField: directMatch.actualColumn,
        sourceDataType: fieldType,
        confidence: directMatch.confidence,
        matchMethod: directMatch.matchMethod,
        alternatives: directMatch.alternatives.map(a => a.column),
        transformationNeeded: false
      };
    }

    return {
      found: false,
      confidence: 0,
      matchMethod: 'exact',
      alternatives: directMatch.alternatives.map(a => a.column),
      transformationNeeded: false
    };
  }

  /**
   * Find candidate columns for an abstract field, returning all matches ranked by confidence.
   * This replaces findCandidateFieldsEnhanced in required-data-elements-tool.
   */
  async findCandidates(
    abstractField: string,
    options: {
      projectId?: string;
      availableColumns: string[];
      schema: SchemaDefinition;
      maxResults?: number;
    }
  ): Promise<Array<{ field: string; score: number; method: string }>> {
    const candidates: Array<{ field: string; score: number; method: string }> = [];
    const maxResults = options.maxResults ?? 5;

    // RAG candidates
    if (options.projectId) {
      try {
        const ragMatches = await columnEmbeddingGenerator.findSimilarColumns(
          options.projectId,
          this.expandFieldName(abstractField),
          maxResults
        );
        for (const match of ragMatches) {
          if (options.availableColumns.includes(match.columnName) && match.similarity >= 0.3) {
            candidates.push({
              field: match.columnName,
              score: Math.round(match.similarity * 100),
              method: 'embedding'
            });
          }
        }
      } catch (e) {
        // Non-blocking
      }
    }

    // Fuzzy candidates
    for (const col of options.availableColumns) {
      const score = this.fuzzyScore(abstractField, col);
      if (score >= 40 && !candidates.find(c => c.field === col)) {
        candidates.push({ field: col, score, method: 'fuzzy' });
      }
    }

    // Semantic pattern candidates
    const semanticMatches = this.semanticPatternMatch(abstractField, options.availableColumns, options.schema);
    for (const match of semanticMatches) {
      if (!candidates.find(c => c.field === match.column)) {
        candidates.push({ field: match.column, score: match.confidence, method: 'semantic' });
      }
    }

    // Sort by score and return top N
    return candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }

  /**
   * Build a lookup map from abstract fields to actual columns
   */
  buildColumnLookup(mappingResults: ElementMappingResult[]): Map<string, string> {
    const lookup = new Map<string, string>();

    for (const result of mappingResults) {
      for (const mapping of result.mappings) {
        if (mapping.actualColumn) {
          lookup.set(mapping.abstractField, mapping.actualColumn);
        }
      }
    }

    return lookup;
  }

  /**
   * Semantic column discovery: expands componentFields by finding additional
   * dataset columns that are semantically related to the element definition.
   *
   * For example, an "Engagement Score" element with componentFields: ["survey_scores"]
   * will discover Q1_Score, Q2_Score, Q3_Score etc. via embedding similarity.
   *
   * Uses existing columnEmbeddingGenerator.findSimilarColumns() infrastructure.
   */
  async discoverSemanticColumns(
    element: DataElementDefinition,
    availableColumns: string[],
    datasetSchema: SchemaDefinition,
    projectId?: string,
    options?: {
      minSimilarity?: number;      // default 0.65
      maxAdditional?: number;      // default 10
      filterByDataType?: string;   // e.g., 'numeric' to only discover numeric columns
    }
  ): Promise<{
    discoveredFields: string[];
    originalFields: string[];
    expandedFields: string[];
    discoveryDetails: Array<{ column: string; similarity: number; reason: string }>;
  }> {
    const minSim = options?.minSimilarity ?? 0.65;
    const maxAdd = options?.maxAdditional ?? 10;
    const originalFields = element.calculationDefinition?.formula?.componentFields || [];

    // Normalize original fields for dedup
    const originalNormalized = new Set(originalFields.map(f => this.normalize(f)));

    // Build rich query from element context
    const queryParts = [
      element.elementName,
      element.description || '',
      element.purpose || '',
      element.calculationDefinition?.formula?.businessDescription || ''
    ].filter(Boolean);
    const query = queryParts.join(' ');

    if (!query.trim() || !projectId) {
      return { discoveredFields: [], originalFields, expandedFields: [...originalFields], discoveryDetails: [] };
    }

    try {
      // Check if embeddings exist
      const hasEmbeddings = await columnEmbeddingGenerator.hasEmbeddings(projectId);
      if (!hasEmbeddings) {
        console.log(`ℹ️ [Discovery] No embeddings for project ${projectId}, skipping semantic discovery`);
        return { discoveredFields: [], originalFields, expandedFields: [...originalFields], discoveryDetails: [] };
      }

      // Find similar columns via embedding search
      const similar = await columnEmbeddingGenerator.findSimilarColumns(
        projectId,
        query,
        maxAdd + originalFields.length + 5 // Request extra to account for filtering
      );

      const discoveredFields: string[] = [];
      const discoveryDetails: Array<{ column: string; similarity: number; reason: string }> = [];

      for (const result of similar) {
        // Skip if below similarity threshold
        if (result.similarity < minSim) continue;

        // Skip if already in original fields
        const normalizedName = this.normalize(result.columnName);
        if (originalNormalized.has(normalizedName)) continue;

        // Skip if not in available columns (may come from different dataset)
        const matchedAvailable = availableColumns.find(
          col => this.normalize(col) === normalizedName || col === result.columnName
        );
        if (!matchedAvailable) continue;

        // Filter by data type if requested
        if (options?.filterByDataType) {
          const colSchema = datasetSchema[matchedAvailable] || datasetSchema[result.columnName];
          const colType = typeof colSchema === 'string' ? colSchema : (colSchema as any)?.type || '';
          const isNumeric = /number|integer|float|numeric|decimal/i.test(colType);
          const isCategorical = /string|text|categorical/i.test(colType);
          const isDate = /date|datetime|timestamp/i.test(colType);

          if (options.filterByDataType === 'numeric' && !isNumeric) continue;
          if (options.filterByDataType === 'categorical' && !isCategorical) continue;
          if (options.filterByDataType === 'date' && !isDate) continue;
        }

        // Limit discovered fields
        if (discoveredFields.length >= maxAdd) break;

        discoveredFields.push(matchedAvailable);
        discoveryDetails.push({
          column: matchedAvailable,
          similarity: result.similarity,
          reason: `Semantically similar to "${element.elementName}" (${(result.similarity * 100).toFixed(0)}%)`
        });
      }

      const expandedFields = [...originalFields, ...discoveredFields];
      if (discoveredFields.length > 0) {
        console.log(`🔍 [Discovery] "${element.elementName}": expanded ${originalFields.length} → ${expandedFields.length} fields (+${discoveredFields.length} discovered: ${discoveredFields.join(', ')})`);
      }

      return { discoveredFields, originalFields, expandedFields, discoveryDetails };
    } catch (error) {
      console.warn(`⚠️ [Discovery] Semantic discovery failed for "${element.elementName}":`, (error as Error).message);
      return { discoveredFields: [], originalFields, expandedFields: [...originalFields], discoveryDetails: [] };
    }
  }

  /**
   * Multi-level matching with fallback chain
   * Uses RAG (pre-computed embeddings) as primary method when available
   */
  private async findBestMatch(
    abstractField: string,
    availableColumns: string[],
    schema: SchemaDefinition,
    projectId?: string
  ): Promise<ColumnMapping> {
    const alternatives: Array<{ column: string; confidence: number; method: string }> = [];

    // Level 1: Exact match (100%)
    const exactMatch = availableColumns.find(col =>
      col.toLowerCase() === abstractField.toLowerCase()
    );
    if (exactMatch) {
      console.log(`🔗 [Mapper] Exact match: "${abstractField}" → "${exactMatch}"`);
      return {
        abstractField,
        actualColumn: exactMatch,
        confidence: 100,
        matchMethod: 'exact',
        alternatives: []
      };
    }

    // Level 2: Normalized match (95%) - strip underscores, hyphens, spaces
    const normalized = this.normalize(abstractField);
    for (const col of availableColumns) {
      if (this.normalize(col) === normalized) {
        console.log(`🔗 [Mapper] Normalized match: "${abstractField}" → "${col}" (95%)`);
        return {
          abstractField,
          actualColumn: col,
          confidence: 95,
          matchMethod: 'normalized',
          alternatives: []
        };
      }
    }

    // Level 3: RAG Match (PRIMARY - 40-95%) - Uses pre-computed embeddings
    // RAG is the primary semantic matching method — higher quality than regex/fuzzy
    if (projectId) {
      try {
        const ragMatch = await this.ragMatch(abstractField, projectId, availableColumns);
        if (ragMatch && ragMatch.confidence >= 50) {
          console.log(`🎯 [RAG] "${abstractField}" → "${ragMatch.column}" (${ragMatch.confidence}%)`);
          return {
            abstractField,
            actualColumn: ragMatch.column,
            confidence: ragMatch.confidence,
            matchMethod: 'embedding',
            alternatives: []
          };
        }
        if (ragMatch && ragMatch.confidence >= 35) {
          alternatives.push({ ...ragMatch, method: 'embedding' });
        }
      } catch (e: any) {
        console.warn(`🔗 [Mapper] RAG match failed: ${e.message}`);
      }
    }

    // Level 4: Fuzzy contains match (70-90%)
    for (const col of availableColumns) {
      const score = this.fuzzyScore(abstractField, col);
      if (score >= 70) {
        alternatives.push({ column: col, confidence: score, method: 'fuzzy' });
      }
    }

    // Level 5: Semantic pattern match (60-80%)
    const semanticMatches = this.semanticPatternMatch(abstractField, availableColumns, schema);
    for (const match of semanticMatches) {
      if (!alternatives.find(a => a.column === match.column)) {
        alternatives.push({ ...match, method: 'semantic' });
      }
    }

    // Level 6: On-demand embedding similarity (50-75%) - for complex cases without RAG
    // Only use if RAG wasn't available and other methods didn't find a good match
    if ((alternatives.length === 0 || (alternatives[0]?.confidence || 0) < 70) && !projectId) {
      try {
        const embeddingMatch = await this.embeddingMatch(abstractField, availableColumns);
        if (embeddingMatch && !alternatives.find(a => a.column === embeddingMatch.column)) {
          alternatives.push({ ...embeddingMatch, method: 'embedding' });
        }
      } catch (e: any) {
        console.warn(`🔗 [Mapper] Embedding match failed: ${e.message}`);
      }
    }

    // Sort by confidence and return best match
    alternatives.sort((a, b) => b.confidence - a.confidence);

    if (alternatives.length > 0 && alternatives[0].confidence >= this.CONFIDENCE_THRESHOLD) {
      const best = alternatives[0];
      console.log(`🔗 [Mapper] Auto-matched: "${abstractField}" → "${best.column}" (${best.confidence}%, ${best.method})`);
      return {
        abstractField,
        actualColumn: best.column,
        confidence: best.confidence,
        matchMethod: best.method as any,
        alternatives: alternatives.slice(1, 4).map(a => ({ column: a.column, confidence: a.confidence }))
      };
    }

    console.log(`⚠️ [Mapper] No match found for "${abstractField}" (best: ${alternatives[0]?.column} at ${alternatives[0]?.confidence || 0}%)`);
    return {
      abstractField,
      actualColumn: null,
      confidence: 0,
      matchMethod: 'exact',
      alternatives: alternatives.slice(0, 4).map(a => ({ column: a.column, confidence: a.confidence }))
    };
  }

  /**
   * RAG-based matching using pre-computed embeddings
   * Much faster than on-demand embedding generation
   */
  private async ragMatch(
    abstractField: string,
    projectId: string,
    availableColumns: string[]
  ): Promise<{ column: string; confidence: number } | null> {
    try {
      // Use pre-computed embeddings via RAG
      const matches = await columnEmbeddingGenerator.findSimilarColumns(
        projectId,
        this.expandFieldName(abstractField),
        5  // top 5 candidates
      );

      if (matches.length === 0) {
        return null;
      }

      // Filter to only available columns
      const validMatches = matches.filter(m => availableColumns.includes(m.columnName));

      // Lower threshold to 0.4 to catch more semantic matches
      // Downstream validation rejects poor matches via CONFIDENCE_THRESHOLD
      if (validMatches.length > 0 && validMatches[0].similarity >= 0.4) {
        return {
          column: validMatches[0].columnName,
          confidence: Math.round(validMatches[0].similarity * 100)
        };
      }
    } catch (error) {
      console.warn('⚠️ [RAG Match] Failed, falling back to other methods:', error);
    }

    return null;
  }

  /**
   * Normalize a string by removing separators and converting to lowercase
   */
  private normalize(s: string): string {
    return s.toLowerCase()
      .replace(/[_\-\s]+/g, '')  // Remove underscores, hyphens, spaces
      .replace(/[^a-z0-9]/g, ''); // Remove non-alphanumeric
  }

  /**
   * Calculate fuzzy similarity score between two strings
   */
  private fuzzyScore(a: string, b: string): number {
    const na = this.normalize(a);
    const nb = this.normalize(b);

    // Exact normalized match
    if (na === nb) return 95;

    // Contains check
    if (nb.includes(na) || na.includes(nb)) {
      const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
      return Math.round(75 + (ratio * 20));
    }

    // Word overlap
    const wordsA = this.splitWords(a);
    const wordsB = this.splitWords(b);
    const overlap = wordsA.filter(w =>
      wordsB.some(wb => wb.includes(w) || w.includes(wb))
    );

    if (overlap.length > 0) {
      const overlapRatio = overlap.length / Math.max(wordsA.length, wordsB.length);
      return Math.round(60 + (overlapRatio * 30));
    }

    // Levenshtein distance for short strings
    if (na.length <= 20 && nb.length <= 20) {
      const distance = this.levenshteinDistance(na, nb);
      const maxLen = Math.max(na.length, nb.length);
      const similarity = 1 - (distance / maxLen);
      if (similarity >= 0.6) {
        return Math.round(similarity * 80);
      }
    }

    return 0;
  }

  /**
   * Split a string into words (handles camelCase, snake_case, kebab-case)
   */
  private splitWords(s: string): string[] {
    return s.toLowerCase()
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
      .replace(/[_\-]/g, ' ')               // snake_case, kebab-case
      .split(/\s+/)
      .filter(w => w.length > 1);
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Match based on semantic patterns (common field types)
   */
  private semanticPatternMatch(
    abstractField: string,
    availableColumns: string[],
    schema: SchemaDefinition
  ): Array<{ column: string; confidence: number }> {
    const results: Array<{ column: string; confidence: number }> = [];
    const abstractLower = abstractField.toLowerCase();

    // Common semantic patterns
    const patterns: Record<string, { regex: RegExp; priority: number }> = {
      // Survey questions
      'q\\d+': { regex: /q\d+|question.*\d+|survey.*\d+|item.*\d+/i, priority: 80 },
      'score': { regex: /score|rating|value|grade|point|level/i, priority: 75 },

      // Identifiers
      'id': { regex: /\bid\b|key|code|identifier|number/i, priority: 70 },
      'employee': { regex: /employee|emp|staff|worker|person/i, priority: 75 },
      'department': { regex: /department|dept|division|unit|team/i, priority: 75 },

      // Dates/Times
      'date': { regex: /date|time|timestamp|created|updated|hired|joined/i, priority: 70 },

      // Names/Labels
      'name': { regex: /name|title|label|description/i, priority: 65 },

      // Numeric measures
      'count': { regex: /count|total|number|quantity|amount/i, priority: 70 },
      'amount': { regex: /amount|price|cost|value|salary|pay|wage|revenue/i, priority: 70 },
      'rate': { regex: /rate|ratio|percentage|percent|pct/i, priority: 70 },

      // Status/Categories
      'status': { regex: /status|state|condition|stage/i, priority: 65 },
      'type': { regex: /type|category|class|group/i, priority: 65 },

      // Satisfaction/Engagement
      'satisfaction': { regex: /satisfaction|satisfied|happy|sentiment/i, priority: 80 },
      'engagement': { regex: /engagement|engaged|involvement|participation/i, priority: 80 }
    };

    // Find which pattern(s) the abstract field matches
    const matchingPatterns: string[] = [];
    for (const [patternName, { regex }] of Object.entries(patterns)) {
      const patternRegex = new RegExp(patternName.replace('\\d+', '\\d+'), 'i');
      if (patternRegex.test(abstractLower) || regex.test(abstractLower)) {
        matchingPatterns.push(patternName);
      }
    }

    // Find columns matching the same patterns
    for (const col of availableColumns) {
      for (const patternName of matchingPatterns) {
        const { regex, priority } = patterns[patternName];
        if (regex.test(col)) {
          // Boost score if numbers match (e.g., Q1_Score matches Q1 - Score)
          let score = priority;
          const abstractNum = abstractLower.match(/\d+/)?.[0];
          const colNum = col.toLowerCase().match(/\d+/)?.[0];
          if (abstractNum && colNum && abstractNum === colNum) {
            score += 10;
          }

          if (!results.find(r => r.column === col) || results.find(r => r.column === col && r.confidence < score)) {
            results.push({ column: col, confidence: Math.min(score, 90) });
          }
        }
      }
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    return results.slice(0, 5);
  }

  /**
   * Use embedding similarity for complex matching
   */
  private async embeddingMatch(
    abstractField: string,
    availableColumns: string[]
  ): Promise<{ column: string; confidence: number } | null> {
    // Check if embedding service is available
    if (!embeddingService.isAvailable()) {
      return null;
    }

    try {
      // Get embedding for abstract field
      let fieldEmbedding = this.embeddingCache.get(abstractField);
      if (!fieldEmbedding) {
        const result = await embeddingService.embedText(
          this.expandFieldName(abstractField),
          { truncateLength: 500 }
        );
        fieldEmbedding = result.embedding;
        this.embeddingCache.set(abstractField, fieldEmbedding);
      }

      let bestMatch: { column: string; similarity: number } | null = null;

      for (const col of availableColumns) {
        let colEmbedding = this.embeddingCache.get(col);
        if (!colEmbedding) {
          const result = await embeddingService.embedText(
            this.expandFieldName(col),
            { truncateLength: 500 }
          );
          colEmbedding = result.embedding;
          this.embeddingCache.set(col, colEmbedding);
        }

        const similarity = this.cosineSimilarity(fieldEmbedding, colEmbedding);

        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { column: col, similarity };
        }
      }

      if (bestMatch && bestMatch.similarity >= 0.5) {
        return {
          column: bestMatch.column,
          confidence: Math.round(bestMatch.similarity * 75) // Scale to 0-75 range
        };
      }
    } catch (e: any) {
      console.warn(`🔗 [Mapper] Embedding match error: ${e.message}`);
    }

    return null;
  }

  /**
   * Expand abbreviated field names for better embedding
   */
  private expandFieldName(name: string): string {
    const expansions: Record<string, string> = {
      'q1': 'question 1',
      'q2': 'question 2',
      'q3': 'question 3',
      'q4': 'question 4',
      'q5': 'question 5',
      'q6': 'question 6',
      'q7': 'question 7',
      'q8': 'question 8',
      'q9': 'question 9',
      'q10': 'question 10',
      'emp': 'employee',
      'dept': 'department',
      'mgr': 'manager',
      'avg': 'average',
      'cnt': 'count',
      'pct': 'percent',
      'id': 'identifier',
      'num': 'number'
    };

    let expanded = name.toLowerCase();
    for (const [abbr, full] of Object.entries(expansions)) {
      expanded = expanded.replace(new RegExp(`\\b${abbr}\\b`, 'gi'), full);
    }

    // Also split camelCase and underscores
    expanded = expanded
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-]/g, ' ');

    return expanded;
  }

  /**
   * Calculate cosine similarity between two vectors
   * Delegates to embeddingService which handles cross-provider dimension mismatches
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    return embeddingService.cosineSimilarity(a, b);
  }

  /**
   * Clear embedding cache (call periodically to free memory)
   */
  clearCache(): void {
    this.embeddingCache.clear();
  }

  /**
   * Find the best unique identifier column based on context
   * For employee data, Employee_ID is preferred over Leader_ID
   * For customer data, Customer_ID is preferred over Account_ID
   */
  /**
   * Estimate how unique a column is based on sample preview data.
   * Returns ratio 0-1 where 1.0 = every row has a unique value (likely row-level ID).
   */
  private estimateColumnCardinality(columnName: string, preview: any[]): number {
    if (!preview || preview.length === 0) return 0;
    const values = preview.map(row => row[columnName]).filter(v => v !== null && v !== undefined);
    if (values.length === 0) return 0;
    const unique = new Set(values);
    return unique.size / values.length;
  }

  findBestIdentifierColumn(
    availableColumns: string[],
    context: MappingContext,
    purpose?: string,
    preview?: any[]       // NEW - sample rows for cardinality-based ranking
  ): { column: string; confidence: number; granularity?: string } | null {
    const purposeLower = (purpose || '').toLowerCase();
    const contextLower = (context.dataContext || '').toLowerCase();
    const industryLower = (context.industry || '').toLowerCase();

    // Define priority rankings based on context
    const identifierPriorities: Record<string, string[]> = {
      // Employee/HR context: Employee ID takes priority
      'employee': ['employee_id', 'emp_id', 'employeeid', 'staff_id', 'worker_id', 'person_id', 'id'],
      'hr': ['employee_id', 'emp_id', 'employeeid', 'staff_id', 'worker_id', 'person_id', 'id'],

      // Customer context: Customer ID takes priority
      'customer': ['customer_id', 'cust_id', 'customerid', 'client_id', 'account_id', 'user_id', 'id'],
      'retail': ['customer_id', 'cust_id', 'shopper_id', 'buyer_id', 'account_id', 'id'],

      // Survey context: Respondent ID takes priority
      'survey': ['respondent_id', 'response_id', 'participant_id', 'survey_id', 'submission_id', 'id'],

      // Education context: Student ID takes priority
      'education': ['student_id', 'learner_id', 'pupil_id', 'enrollee_id', 'id'],

      // Default: Generic ID columns
      'default': ['id', 'record_id', 'row_id', 'unique_id', 'identifier', 'key']
    };

    // Determine which priority list to use
    let priorityList: string[] = identifierPriorities['default'];

    // Check if context matches any specific priority
    for (const [contextKey, priorities] of Object.entries(identifierPriorities)) {
      if (contextLower.includes(contextKey) ||
          industryLower.includes(contextKey) ||
          purposeLower.includes(contextKey)) {
        priorityList = priorities;
        break;
      }
    }

    // Collect ALL matching candidates with priority scores (not just first match)
    const candidates: Array<{ column: string; confidence: number; priorityIndex: number; matchType: 'exact' | 'partial' }> = [];

    for (let i = 0; i < priorityList.length; i++) {
      const priority = priorityList[i];
      const normalizedPriority = this.normalize(priority);

      for (const col of availableColumns) {
        const normalizedCol = this.normalize(col);
        // Skip if already collected
        if (candidates.some(c => c.column === col)) continue;

        // Exact normalized match
        if (normalizedCol === normalizedPriority) {
          const confidence = 100 - (i * 5);
          candidates.push({ column: col, confidence: Math.max(confidence, 70), priorityIndex: i, matchType: 'exact' });
        }
        // Contains match
        else if (normalizedCol.includes(normalizedPriority) || normalizedPriority.includes(normalizedCol)) {
          const confidence = 90 - (i * 5);
          candidates.push({ column: col, confidence: Math.max(confidence, 60), priorityIndex: i, matchType: 'partial' });
        }
      }
    }

    // Also check for any column ending in "_id" or "_ID" not already matched (catch-all for IDs)
    for (const col of availableColumns) {
      if (candidates.some(c => c.column === col)) continue;
      const normalizedCol = this.normalize(col);
      if (normalizedCol.endsWith('id') && normalizedCol.length > 2) {
        candidates.push({ column: col, confidence: 55, priorityIndex: priorityList.length, matchType: 'partial' });
      }
    }

    if (candidates.length === 0) return null;

    // Disqualify columns that are clearly NOT identifiers (negative signals)
    if (preview && preview.length > 0) {
      const beforeCount = candidates.length;
      const disqualified: string[] = [];
      const filteredCandidates = candidates.filter(c => {
        const values = preview.slice(0, 20).map(row => String(row[c.column] || ''));
        const avgLength = values.reduce((sum, v) => sum + v.length, 0) / values.length;
        // Reject: avg value length > 50 chars (likely free text or question text, not an ID)
        if (avgLength > 50) {
          disqualified.push(`${c.column} (avg value length ${avgLength.toFixed(0)} chars)`);
          return false;
        }
        // Reject: column name starts with a number or looks like a survey question
        if (/^\d+[\.\)]|^(how|what|which|rate|rank|do you|are you|to what|please)/i.test(c.column)) {
          disqualified.push(`${c.column} (question-like column name)`);
          return false;
        }
        // Reject: values look like Likert scale responses (1-5 or 1-7 with low cardinality)
        const numericValues = values.map(v => Number(v)).filter(n => !isNaN(n));
        if (numericValues.length > values.length * 0.8) {
          const uniqueVals = new Set(numericValues);
          if (uniqueVals.size <= 7 && Math.min(...numericValues) >= 1 && Math.max(...numericValues) <= 10) {
            disqualified.push(`${c.column} (Likert-scale values: ${uniqueVals.size} unique in 1-10 range)`);
            return false;
          }
        }
        return true;
      });
      if (disqualified.length > 0) {
        console.log(`🚫 [Identifier] Disqualified ${disqualified.length} columns: ${disqualified.join(', ')}`);
      }
      // Only replace if we haven't eliminated ALL candidates
      if (filteredCandidates.length > 0) {
        candidates.length = 0;
        candidates.push(...filteredCandidates);
      } else if (beforeCount > 0) {
        console.log(`⚠️ [Identifier] All ${beforeCount} candidates disqualified — returning null (no valid ID column)`);
        return null;
      }
    }

    // If we have preview data, use cardinality to rank candidates
    // A true row-level identifier should have near-100% unique values
    if (preview && preview.length >= 10 && candidates.length > 1) {
      const candidatesWithCardinality = candidates.map(c => ({
        ...c,
        cardinality: this.estimateColumnCardinality(c.column, preview)
      }));

      // Sort by: (1) cardinality descending (most unique first), (2) priority index ascending
      candidatesWithCardinality.sort((a, b) => {
        // Strongly prefer high-cardinality columns (>0.5 uniqueness)
        const aIsHighCard = a.cardinality >= 0.5 ? 1 : 0;
        const bIsHighCard = b.cardinality >= 0.5 ? 1 : 0;
        if (aIsHighCard !== bIsHighCard) return bIsHighCard - aIsHighCard;
        // Among high-cardinality, prefer higher cardinality
        if (aIsHighCard && bIsHighCard) {
          const cardDiff = b.cardinality - a.cardinality;
          if (Math.abs(cardDiff) > 0.1) return cardDiff;
        }
        // Then by priority index
        return a.priorityIndex - b.priorityIndex;
      });

      const best = candidatesWithCardinality[0];
      const granularity = best.cardinality >= 0.95 ? 'row-level' : best.cardinality >= 0.5 ? 'moderate' : 'low';
      console.log(`🎯 [Identifier] Selected "${best.column}" (cardinality: ${(best.cardinality * 100).toFixed(0)}%, granularity: ${granularity}) from ${candidatesWithCardinality.length} candidates`);
      if (candidatesWithCardinality.length > 1) {
        const rejected = candidatesWithCardinality.slice(1).map(c => `${c.column}(${(c.cardinality * 100).toFixed(0)}%)`).join(', ');
        console.log(`   📊 Other candidates: ${rejected}`);
      }
      return { column: best.column, confidence: best.confidence, granularity };
    }

    // No preview data — fall back to priority-based selection (first match wins)
    const best = candidates.sort((a, b) => a.priorityIndex - b.priorityIndex)[0];
    console.log(`🎯 [Identifier] Context-aware match: "${best.column}" for ${contextLower || 'default'} context (${best.confidence}%, no cardinality data)`);
    return { column: best.column, confidence: best.confidence };
  }

  /**
   * Parse formula string to extract component field names
   * e.g., "average(Q1, Q2, Q3)" -> ["Q1", "Q2", "Q3"]
   * e.g., "SUM(Score1 + Score2)" -> ["Score1", "Score2"]
   */
  parseFormulaComponents(formulaString: string): string[] {
    if (!formulaString) return [];

    const components: string[] = [];

    // Pattern 1: Function with comma-separated args: avg(Q1, Q2, Q3)
    const funcMatch = formulaString.match(/\w+\s*\(\s*([^)]+)\s*\)/i);
    if (funcMatch) {
      const args = funcMatch[1];
      // Split by comma, plus, minus, etc.
      const parts = args.split(/[,+\-*/\s]+/).filter(Boolean);
      for (const part of parts) {
        const cleanPart = part.trim().replace(/['"]/g, '');
        if (cleanPart && !/^\d+$/.test(cleanPart)) { // Skip pure numbers
          components.push(cleanPart);
        }
      }
    }

    // Pattern 2: Direct references: df['Q1'], df["Q2"], row.Q3
    const refRegex = /(?:df\[['"]?|row\.)([a-zA-Z_][a-zA-Z0-9_\-\s]*?)['"]?\]/g;
    let refMatch;
    while ((refMatch = refRegex.exec(formulaString)) !== null) {
      if (refMatch[1] && !components.includes(refMatch[1])) {
        components.push(refMatch[1].trim());
      }
    }

    // Pattern 3: Column references in quotes: "Q1 - Score", 'Q2_Score'
    const quoteRegex = /['"]([a-zA-Z][a-zA-Z0-9_\-\s]+?)['"]/g;
    let quoteMatch;
    while ((quoteMatch = quoteRegex.exec(formulaString)) !== null) {
      if (quoteMatch[1] && !components.includes(quoteMatch[1])) {
        components.push(quoteMatch[1].trim());
      }
    }

    console.log(`📐 [Formula Parser] "${formulaString}" → [${components.join(', ')}]`);
    return components;
  }

  /**
   * Map element with DS recommendation awareness
   * Prioritizes DS agent's recommended columns when available
   */
  async mapElementWithDsRecommendation(
    element: DataElementDefinition,
    availableColumns: string[],
    datasetSchema: SchemaDefinition,
    context?: MappingContext,
    projectId?: string,
    preview?: any[]      // NEW - sample rows for cardinality-based identifier ranking
  ): Promise<ElementMappingResult> {
    // If element has DS recommendation, use it as primary source
    if (element.dsRecommendation) {
      console.log(`🔬 [DS Recommendation] Using DS hint: "${element.dsRecommendation}" for ${element.elementName}`);

      // Parse recommendation for column hints
      const recommendedColumns = this.parseFormulaComponents(element.dsRecommendation);

      // If DS recommended specific columns, try to find them first
      if (recommendedColumns.length > 0) {
        const mappings: ColumnMapping[] = [];

        for (const recCol of recommendedColumns) {
          const match = await this.findBestMatch(recCol, availableColumns, datasetSchema, projectId);
          if (match.actualColumn) {
            match.confidence = Math.min(match.confidence + 10, 100); // Boost confidence for DS recommendations
            mappings.push(match);
          }
        }

        if (mappings.length > 0) {
          return {
            elementId: element.elementId,
            elementName: element.elementName,
            mappings,
            allMapped: mappings.every(m => m.actualColumn !== null),
            missingFields: mappings.filter(m => !m.actualColumn).map(m => m.abstractField),
            overallConfidence: mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length
          };
        }
      }
    }

    // Check if this is an identifier request with context
    if (element.purpose?.toLowerCase().includes('identifier') ||
        element.purpose?.toLowerCase().includes('unique') ||
        element.elementName.toLowerCase().includes('id')) {

      const identifierMatch = this.findBestIdentifierColumn(
        availableColumns,
        context || {},
        element.purpose,
        preview
      );

      if (identifierMatch) {
        return {
          elementId: element.elementId,
          elementName: element.elementName,
          mappings: [{
            abstractField: element.elementName,
            actualColumn: identifierMatch.column,
            confidence: identifierMatch.confidence,
            matchMethod: 'semantic',
            alternatives: []
          }],
          allMapped: true,
          missingFields: [],
          overallConfidence: identifierMatch.confidence
        };
      }
    }

    // Fall back to standard mapping
    return this.mapElementToColumns(element, availableColumns, datasetSchema, undefined, projectId);
  }

  /**
   * Extract mapping context from project metadata
   * Detects industry, data context, and analysis type from project information
   */
  extractContextFromProject(project: {
    journeyProgress?: {
      industry?: string;
      questionnaire?: {
        responses?: Record<string, any>;
      };
      userQuestions?: string[];
      analysisPath?: any[];
    };
    metadata?: {
      industry?: string;
      dataContext?: string;
    };
    name?: string;
    description?: string;
  }): MappingContext {
    const context: MappingContext = {};

    // Extract industry from multiple sources
    context.industry =
      project.journeyProgress?.industry ||
      project.metadata?.industry ||
      this.detectIndustryFromText(project.name + ' ' + (project.description || ''));

    // Extract data context from questions and analysis path
    const questions = project.journeyProgress?.userQuestions || [];
    const analysisPath = project.journeyProgress?.analysisPath || [];

    // Detect data context from questions
    const questionText = questions.join(' ').toLowerCase();
    if (questionText.includes('employee') || questionText.includes('staff') || questionText.includes('engagement')) {
      context.dataContext = 'employee';
    } else if (questionText.includes('customer') || questionText.includes('client')) {
      context.dataContext = 'customer';
    } else if (questionText.includes('survey') || questionText.includes('respondent')) {
      context.dataContext = 'survey';
    } else if (questionText.includes('student') || questionText.includes('learner')) {
      context.dataContext = 'education';
    }

    // Extract analysis type from analysis path
    if (analysisPath.length > 0) {
      const analysisTypes = analysisPath.map((a: any) => a.type || a.name || '').join(' ').toLowerCase();
      if (analysisTypes.includes('engagement')) {
        context.analysisType = 'engagement';
      } else if (analysisTypes.includes('satisfaction')) {
        context.analysisType = 'satisfaction';
      } else if (analysisTypes.includes('performance')) {
        context.analysisType = 'performance';
      } else if (analysisTypes.includes('churn') || analysisTypes.includes('retention')) {
        context.analysisType = 'retention';
      }
    }

    console.log(`🏭 [Context Extraction] industry=${context.industry || 'unknown'}, dataContext=${context.dataContext || 'unknown'}, analysisType=${context.analysisType || 'unknown'}`);
    return context;
  }

  /**
   * Detect industry from text content
   */
  private detectIndustryFromText(text: string): string | undefined {
    const textLower = text.toLowerCase();

    const industryPatterns: Record<string, string[]> = {
      'HR': ['employee', 'hr', 'human resource', 'workforce', 'talent', 'hiring', 'recruitment', 'engagement'],
      'education': ['student', 'school', 'university', 'learning', 'course', 'teacher', 'education'],
      'retail': ['customer', 'sales', 'product', 'store', 'shop', 'retail', 'commerce'],
      'healthcare': ['patient', 'health', 'medical', 'hospital', 'doctor', 'clinic'],
      'finance': ['financial', 'bank', 'investment', 'trading', 'loan', 'credit'],
      'manufacturing': ['production', 'factory', 'manufacturing', 'supply chain', 'inventory']
    };

    for (const [industry, patterns] of Object.entries(industryPatterns)) {
      for (const pattern of patterns) {
        if (textLower.includes(pattern)) {
          return industry;
        }
      }
    }

    return undefined;
  }
}

// Singleton instance
export const sourceColumnMapper = new SourceColumnMapper();
