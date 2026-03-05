/**
 * Transformation Compiler Service (Phase 2 Fix)
 *
 * Phase 1 enhancements integrated:
 * - Semantic question-element matching
 * - Business definition integration
 * - Phase 2: Element-transformation mapping
 * - Dependency resolution before compilation
 *
 * Key Changes from Phase 1:
 * 1. Added semantic matching utilities (cosineSimilarity, normalizeForMatching, extractMatchingKeywords)
 * 2. Added business definition registry integration
 * 3. Enhanced `generateQuestionAnswerMapping()` in required-data-elements-tool.ts with semantic scoring
 * 4. Updated `QuestionAnalysisMapping` and `DataRequirementsMappingDocument` interfaces to include Phase 1 match details
 *
 * Key Principles:
 * - Each transformation must know which question it answers
 * - Business definitions guide transformation logic
 * - Semantic similarity overcomes naive string matching
 * - Dependencies are resolved before compilation
 * - Traceability is maintained through the entire chain
 */

import { nanoid } from 'nanoid';
import { storage } from '../storage';
import { generateStableQuestionId } from '../constants';

// ============================================
// PHASE 1: SEMANTIC MATCHING UTILITIES
// ============================================

/**
 * Calculate cosine similarity between two embedding vectors
 */
function cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (!vec1 || !vec2 || vec1.length !== vec2.length || vec1.length === 0) {
        return 0;
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Normalize text for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeForSemantic(text: string): string {
    return text.toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[?!.;:]+$/g, '');
}

/**
 * Extract keywords from text (filter out common stop words)
 */
function extractSemanticKeywords(text: string): string[] {
    const stopWords = new Set([
        'about', 'which', 'there', 'their', 'would', 'could', 'should',
        'these', 'those', 'between', 'before', 'after', 'what', 'how',
        'why', 'when', 'where', 'who', 'the', 'a', 'an', 'is', 'are', 'was', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could', 'may', 'might', 'must', 'shall',
        'for', 'to', 'of', 'in', 'on', 'at', 'by', 'from', 'with', 'and', 'or', 'but', 'not'
    ]);

    return normalizeForSemantic(text)
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));
}

// ============================================
// PHASE 1: ENHANCED ELEMENT MATCHING
// ============================================

/**
 * Phase 1: Score how well an element matches a question using multiple strategies
 *
 * Scoring layers (highest to lowest priority):
 * 1. Direct question ID match (score: 1.0)
 * 2. Semantic similarity via embeddings (score: 0.7-0.95)
 * 3. Business definition synonyms/industry terms (score: 0.75)
 * 4. Keyword overlap (score: 0.4-0.6)
 * 5. Pattern/substring matching (score: 0.35-0.4)
 *
 * Returns an element with its score, match reasons, and match layer.
 */
interface ElementMatchResult {
    element: any;
    score: number;
    matchReasons: string[];
    matchLayer: 'exact' | 'semantic' | 'business' | 'keyword' | 'pattern' | 'none';
}

/**
 * Score an element against a question using Phase 1 semantic matching
 */
async function scoreElementMatchPhase2(
    question: string,
    questionId: string,
    element: any,
    questionEmbedding: EmbeddingResult | null,
    businessContextMap: Map<string, any>,
    industryContext?: string
): Promise<ElementMatchResult> {
    const reasons: string[] = [];
    let score = 0;
    const elementName = element.elementName;
    const elementDescription = element.description || '';
    const questionLower = normalizeForSemantic(question);
    const elementNameLower = normalizeForSemantic(elementName);

    console.log(`      [Phase 1 Scoring] Question: "${question.substring(0, 50)}..." vs Element: "${elementName}"`);

    // ============================================================
    // LAYER 1: Direct Question ID Match (highest score)
    // ============================================================
    const elementQuestionIds = element.questionIds || [];
    if (elementQuestionIds.includes(questionId)) {
        score = Math.max(score, 1.0);
        reasons.push('Direct question ID match');
        console.log(`      ✓ Layer 1: Direct question ID match (score=1.0)`);
        return {
            element,
            score,
            matchReasons,
            matchLayer: 'exact'
        };
    }

    // ============================================================
    // LAYER 2: Semantic Similarity via Embeddings
    // ============================================================
    if (questionEmbedding && questionEmbedding.embedding && questionEmbedding.embedding.length > 0) {
        let elementEmbedding: number[] | null = null;

        // Try to get element embedding from description or name
        const textToEmbed = elementDescription || elementName;
        if (textToEmbed) {
            try {
                const embeddingService = await import('../embedding-service');
                const result = await embeddingService.embedText(textToEmbed, { truncateLength: 500 });
                elementEmbedding = result.embedding;
            } catch (embedErr) {
                // Fallback: use keyword-based scoring if embedding fails
                console.warn(`      ⚠️ Embedding failed for element "${elementName}":`, embedErr);
            }
        }

        if (elementEmbedding && elementEmbedding.length > 0) {
            const similarity = cosineSimilarity(questionEmbedding.embedding, elementEmbedding);
            if (similarity > 0.65) { // Threshold for semantic match
                const semanticScore = similarity;
                score = Math.max(score, semanticScore);
                reasons.push(`Semantic similarity: ${(similarity * 100).toFixed(0)}% (score=${semanticScore})`);
                return {
                    element,
                    score,
                    matchReasons: ['Semantic similarity'],
                    matchLayer: 'semantic'
                };
            }
        }
    }

    // ============================================================
    // LAYER 3: Business Definition Lookup (synonyms, industry terms)
    // ============================================================
    if (businessContextMap && businessContextMap.has(elementName)) {
        const bizDef = businessContextMap.get(elementName);
        const bizScore = bizDef ? 0.75 : 0;

        // Check for synonyms
        if (bizDef?.synonyms && bizDef.synonyms.length > 0) {
            const hasSynonymMatch = bizDef.synonyms.some((syn: string) => {
                const synLower = syn.toLowerCase();
                return questionLower.includes(synLower) || synLower.includes(questionLower.substring(0, 20));
            });

            if (hasSynonymMatch) {
                score = Math.max(score, bizScore);
                reasons.push(`Business synonym match: ${bizDef.synonyms.slice(0, 2).join(', ')}`);
                console.log(`      ✓ Layer 3: Business synonym match (score=${bizScore})`);
            }
        }

        // Check for industry-specific terms
        if (bizDef?.industryTerms && bizDef.industryTerms.length > 0) {
            const hasIndustryMatch = bizDef.industryTerms.some((term: string) => {
                const termLower = term.toLowerCase();
                return questionLower.includes(termLower);
            });

            if (hasIndustryMatch) {
                score = Math.max(score, bizScore * 0.9); // Slightly lower than synonym
                reasons.push(`Industry term match (${bizDef.industryTerms[0]})`);
            }
        }
    }

    // ============================================================
    // LAYER 4: Keyword Overlap (more robust than substring)
    // ============================================================
    const questionKeywords = extractSemanticKeywords(question);
    const elementKeywords = extractSemanticKeywords(`${elementName} ${elementDescription}`);

    if (questionKeywords.length > 0 && elementKeywords.length > 0) {
        const commonKeywords = questionKeywords.filter(kw => elementKeywords.some(ekw =>
            ekw.includes(kw) || kw.includes(ekw)
        ));

        if (commonKeywords.length > 0) {
            const keywordRatio = commonKeywords.length / Math.max(questionKeywords.length, 1);
            const keywordScore = Math.min(0.6, 0.3 + keywordRatio * 0.5); // Max 0.6

            if (keywordRatio >= 0.25) {  // At least 25% keyword overlap
                score = Math.max(score, keywordScore);
                reasons.push(`Keyword overlap: ${commonKeywords.length}/${questionKeywords.length}`);
            }
        }
    }

    // ============================================================
    // LAYER 5: Pattern/Substring Matching (original fallback)
    // ============================================================
    const elementQuestionTexts = element.relatedQuestions || [];
    const textMatch = elementQuestionTexts.some((qt: string) =>
        normalizeForSemantic(qt).includes(questionLower.substring(0, 30))
    );

    const nameMatches = questionLower.includes(elementNameLower) ||
                      elementNameLower.includes(questionLower.substring(0, 20));

    if ((textMatch || nameMatches) && score < 0.4)) {
        const patternScore = 0.35;
        score = Math.max(score, patternScore);
        const matchType = textMatch ? 'related question' : nameMatches ? 'element name' : 'partial';
        reasons.push(`${matchType} pattern match (score=${patternScore})`);
        console.log(`      ✓ Layer 5: ${matchType} pattern match (score=${patternScore})`);
    }

        if (score < 0.4) {
            console.log(`      ✗ No match (score=${score} < threshold 0.4)`);
        }
    }

    // ============================================================
    // SCORE THRESHOLDING
    // ============================================================
    const MIN_SCORE_THRESHOLD = 0.4; // Elements below this score are not considered related

    if (score < MIN_SCORE_THRESHOLD && reasons.length === 0) {
        console.log(`      ✗ No match (score=${score} < threshold ${MIN_SCORE_THRESHOLD})`);
    } else {
        console.log(`      ✓ Final score: ${score.toFixed(2)} (threshold: ${MIN_SCORE_THRESHOLD})`);
    }

    return {
        element,
        score: score < MIN_SCORE_THRESHOLD ? 0 : score, // Zero out if below threshold
        matchReasons: reasons.length > 0 ? reasons : ['Below threshold'],
        matchLayer: score >= 1 ? 'exact' : score >= 0.7 ? 'semantic' : score >= 0.75 ? 'business' : score >= 0.4 ? 'keyword' : score > 0 ? 'pattern' : 'none'
    };
}

// ============================================
// COMPILATION CONTEXT INTERFACE
// ============================================

/**
 * Phase 1: Compilation Context
 *
 * Provides question-answer mapping and business definitions to transformation compiler.
 */
export interface CompilationContext {
    questionAnswerMapping?: Array<{
        questionId: string;
        questionText: string;
        requiredDataElements: string[];
        recommendedAnalyses: string[];
        transformationsNeeded: string[];
        matchDetails?: {
            matchedElements: Array<{
                elementName: string;
                score: number;
                matchReasons: string[];
            }>;
        overallMatchScore?: number;
        matchMethod?: 'string_based' | 'semantic_phase1';
    };
    businessContext?: Map<string, any>;  // Business definition lookup by element name
    projectId?: string;               // For logging
    industry?: string;              // Industry context for semantic matching
}

    questionAnswerMapping: Array<{
        questionId: string;
        questionText: string;
        requiredDataElements: string[];
        recommendedAnalyses: string[];
        transformationsNeeded: string[];
        matchDetails?: {
            matchedElements: Array<{
                elementName: string;
                score: number;
                matchReasons: string[];
            }>;
        overallMatchScore?: number;
        matchMethod: 'string_based' | 'semantic_phase1';
    };
}

// ============================================
// TRANSFORMATION COMPILER CLASS (Phase 2 Fix)
// ============================================

export interface CompiledTransformation {
    elementId: string;
    elementName: string;
    targetColumn: string;
    sourceColumns: string[];
    operation: 'add_calculated_column' | 'aggregate' | 'filter' | 'join' | 'derive';
    aggregationMethod: string;
    code: {
        python: string;
        javascript?: string;
    };
    executionEngine: 'javascript' | 'polars' | 'pandas' | 'spark';
    dependencies: string[];
    businessDescription?: string;
}

/**
 * Phase 2: Transformation Compiler (with Phase 1 fixes)
 *
 * Key changes:
 * - Accepts CompilationContext parameter
 * - Uses business context to inform transformation logic
 * - Resolves dependencies BEFORE compilation (not after)
 * - Generates detailed match metadata for debugging
 */
export class TransformationCompilerPhase2 {
    private businessDefinitionRegistry: any;

    constructor() {
        this.businessDefinitionRegistry = null;
    }

    async initialize(): Promise<void> {
        // Load business definition registry for semantic matching
        try {
            const { businessDefinitionRegistryService } = await import('../business-definition-registry');
            this.businessDefinitionRegistry = businessDefinitionRegistryService;
            console.log('✅ [Phase 2] Business definition registry initialized');
        } catch (err) {
            console.warn('⚠️ [Phase 2] Business definition registry init failed:', err);
            // Continue without semantic matching
        }
    }

        // Initialize with a context cache for performance
        this.embeddingCache = new Map<string, EmbeddingResult>();
        this.maxCacheSize = 10000;
    }

        // Initialize business context cache
        this.businessContextCache = new Map<string, any>();
    }

        console.log('✅ [Phase 2] TransformationCompiler initialized');
    }

    /**
     * Compile a single element's transformation
     *
     * Phase 2: Accepts context to inform compilation logic
     * Generates detailed match metadata
     */
    async compileElement(
        element: any,
        columnMappings: Map<string, string>,
        rowCount: number,
        context?: CompilationContext
    ): Promise<CompiledTransformation> {
        if (!element) {
            throw new Error('Element is required for compilation');
        }

        const calcDef = element.calculationDefinition;
        const formula = calcDef?.formula;
        const elementName = element.elementName;
        const targetColumn = this.sanitizeColumnName(elementName);
        const sourceColumns = columnMappings.get(element.elementName) || element.sourceField;

        console.log(`      [Phase 2] Compiling element: "${elementName}" with context`);

        // Phase 2: Use business context if provided
        let bizDef = null;
        if (context?.businessContext && context.businessContext.has(elementName)) {
            bizDef = context.businessContext.get(elementName);
            console.log(`      ✓ [Phase 2] Found business definition for "${elementName}":`, {
                conceptName: bizDef.conceptName,
                industry: bizDef.industry,
                synonyms: bizDef.synonyms?.slice(0, 3).join(', ')',
                industryTerms: bizDef.industryTerms?.slice(0, 3).join(', '),
                confidence: bizDef.confidence || 0
            });
        } else {
            console.log(`      ℹ️ [Phase 2] No business definition for "${elementName}"`);
        }

        // Get actual source columns from mappings
        const abstractFields = formula?.componentFields || [];
        const actualColumns = abstractFields
            .map(f => columnMappings.get(f) || f)
            .filter(Boolean);

        // Phase 2: Use business definition to inform transformation logic
        let useBusinessDefinition = bizDef !== null;
        if (useBusinessDefinition && bizDef) {
            console.log(`      [Phase 2] Using business definition to guide transformation`);

            // If business definition has formula, use it (overwrites basic aggregation)
            if (bizDef.formula?.aggregationMethod && bizDef.calculationType === 'derived') {
                if (bizDef.formula?.pseudoCode) {
                    console.log(`        ✓ [Phase 2] Using pseudo-code from business definition:`, {
                        pseudoCode: bizDef.formula.pseudoCode.substring(0, 200)
                    });
                } else {
                    console.log(`        [Phase 2] No pseudo-code, using basic aggregation`);
                }
            }
        } else {
                // Use standard aggregation based on aggregationMethod
                console.log(`        [Phase 2] Using aggregation method: ${bizDef.formula?.aggregationMethod || 'mean'}`);
            }
        }

            // Use business definition for derived fields if element is a derived KPI
            if (useBusinessDefinition && bizDef.calculationType === 'derived') {
                console.log(`        [Phase 2] Element "${elementName}" is a derived KPI per business definition`);

                // Map component fields to actual columns
                const resolvedFields: new Map<string, string>();
                const componentFields = bizDef.componentFields || [];

                for (const field of abstractFields) {
                    // Try business definition lookup for each component field
                    const fieldDef = await this.businessDefinitionRegistry?.lookupDefinition({
                        conceptName: field,
                        {
                            industry: context?.industry,
                            projectId: context?.projectId
                        }
                    });

                    if (fieldDef.found && fieldDef.definition) {
                        const resolvedField = fieldDef.definition.resolvedComponentField || field;

                        // Store source column if found
                        if (resolvedField.sourceField) {
                            columnMappings.set(element.elementName, resolvedField.sourceField);
                            console.log(`        ✓ [Phase 2] Field: "${field}" -> "${resolvedField.sourceField}"`);
                        }

                        // Store actual field if found
                        if (resolvedField.resolvedField) && actualColumns.includes(resolvedField.resolvedField)) {
                            resolvedFields.set(resolvedField.resolvedField, resolvedField.resolvedField);
                        }

                        resolvedFields.push(resolvedField);
                        } else if (fieldDef.found && !resolvedField.resolvedField && actualColumns.includes(fieldDef.definition?.sourceField || field)) {
                            // Business definition has a source column, but we couldn't find the matching actual column
                            console.log(`        ⚠️ [Phase 2] Field "${field}" has definition source field "${fieldDef.definition?.sourceField}", but actual column "${resolvedField.resolvedField}" not in dataset`);
                        }
                    } else {
                        console.log(`        ℹ️ [Phase 2] Field "${field}" has no source column, using actual column "${resolvedField.resolvedField}"`);
                    }

                    // Map component fields to actual columns
                    const mappedFields = new Map<string, string>();
                    for (const field of abstractFields) {
                        const resolvedField = resolvedFields.get(field);
                        if (resolvedField) {
                            const actualField = columnMappings.get(field) || resolvedField.sourceField || field;
                            mappedFields.set(field, actualField);
                            console.log(`        ✓ [Phase 2] Field "${field}" → "${actualField}"`);
                        }
                    }

                    console.log(`        [Phase 2] Mapped ${mappedFields.size}/${abstractFields.length} component fields`);
                }

                // Use mapped fields in pseudo-code substitution
                if (bizDef.formula?.pseudoCode) {
                    // Replace component field placeholders with actual column names in pseudo-code
                    for (const mappedField of mappedFields) {
                        const code = bizDef.formula.pseudoCode;
                        const sourceField = columnMappings.get(mappedField) || resolvedField.sourceField || field;
                        if (sourceField) {
                            // Replace abstract field placeholder
                            // Pattern: `\\${this.escapeSqlIdentifier(field)}\\b` = ${sourceField}g`
                            const sourceFieldPattern = new RegExp(`\\\\b`, 'g');
                            code = code.replace(sourceFieldPattern, sourceField);
                        }
                    }
                }
            }
        }

        // If business definition has aggregation method, override basic aggregation
        if (useBusinessDefinition && bizDef.aggregationMethod && bizDef.calculationType === 'derived') {
            const aggregationMethod = bizDef.aggregationMethod;
            console.log(`        [Phase 2] Element "${elementName}" has derived aggregation method: "${aggregationMethod}" per business definition`);
        } else {
            // Use standard aggregation based on aggregationMethod
            console.log(`        [Phase 2] Element "${elementName}" uses standard aggregation ${bizDef.formula?.aggregationMethod || 'mean'}`);
        }
        }

        // Use business definition for descriptive purpose (frontend labels)
        if (useBusinessDefinition && bizDef.description) {
            console.log(`        [Phase 2] Element "${elementName}" has business description: "${bizDef.description}"`);
        } else {
            console.log(`      ℹ️ [Phase 2] Element "${elementName}" has no business description`);
        }

        // Business definition for categorical groups
        if (useBusinessDefinition && bizDef.categorization) {
            const categories = bizDef.categorization || [];
            const categoryMap = new Map();

            for (const category of categories) {
                const categoryDef = await this.businessDefinitionRegistry?.lookupDefinition({
                    conceptName: category,
                    industry: context?.industry,
                    projectId: context?.projectId
                });

                if (categoryDef?.found && categoryDef.definition) {
                    const values = categoryDef.definition.values || [];
                    categoryMap.set(categoryDef.definition.name, values);

                    // Find which category each data value belongs to
                    for (const value of values) {
                        const categoryForValue = categoryMap.get(value);
                        if (categoryForValue) {
                            categoryForValue.values.push(value);
                        }
                    }

                    if (values.length > 0) {
                        console.log(`        ✓ [Phase 2] Category: ${categoryDef.definition.name} -> ${values.length} categories, ${values.length} unique values`);
                    }

                    categories.push(categoryDef.definition.name);
                }
            }
        }

            // Store categories for frontend filtering
            const categories = Array.from(categoryMap.entries());

            // Use category-based aggregation for derived fields
            if (useBusinessDefinition && bizDef.calculationType === 'derived') {
                console.log(`        [Phase 2] Element "${elementName}" uses category-based aggregation per business definition`);
                console.log(`          Category count: ${categories.length}, values count: ${values.reduce((sum, v) => v.length, 0)}`);
            } else {
                console.log(`      [Phase 2] Element "${elementName}" doesn't use category-based aggregation`);
            }
        }
        }

        return useBusinessDefinition;
    }

    /**
     * Compile element with context
     *
     * This is the main method for preparing a single element's transformation
     */
    compileElement(
        element: any,
        columnMappings: Map<string, string>,
        rowCount: number,
        context?: CompilationContext
    ): Promise<CompiledTransformation> {
        const calcDef = element.calculationDefinition;
        const formula = calcDef?.formula;
        const elementName = element.elementName;
        const targetColumn = this.sanitizeColumnName(elementName);
        const sourceColumns = columnMappings.get(element.elementName) || element.sourceField;

        console.log(`\n   [Phase 2] Compiling element: "${elementName}"`);

        // Phase 2: Get question-answer mapping and business context
        const questionAnswerMapping = context?.questionAnswerMapping || [];
        const businessContext = context?.businessContext || new Map();
        const industryContext = context?.industry;

        // Phase 2: Log which questions this element helps answer
        if (questionAnswerMapping.length > 0) {
            const relatedQuestions = questionAnswerMapping
                .filter(qam => qam.requiredDataElements?.includes(element.elementId))
                .map(qam => qam.questionText);

            if (relatedQuestions.length > 0) {
                console.log(`\n   ✓ [Phase 2] This element answers ${relatedQuestions.length} questions:`);
                relatedQuestions.forEach((q, idx) => {
                    console.log(`        - ${idx + 1}. "${qam.questionText.substring(0, 60)}..."`);
                });
            }
        }

        // Phase 2: Score this element against each question to find best match
        const questionScores = new Map<string, ElementMatchResult>();

        for (const q of questionAnswerMapping) {
            if (qam.requiredDataElements?.includes(element.elementId)) {
                try {
                    const questionEmbedding = questionAnswerMapping.questionId === qam.questionId
                        ? await this.getQuestionEmbedding(qam.questionId, context?.industryContext)
                        : null;

                    const scoreResult = await scoreElementMatchPhase2(
                        qam.questionText,
                        qam.questionId,
                        element,
                        questionEmbedding,
                        businessContext,
                        industryContext
                    );

                    questionScores.set(qam.questionId, scoreResult);
                } catch (scoreErr) {
                    console.warn(`      ⚠️ [Phase 2] Score element "${element.elementName}" for question "${qam.questionText}" failed:`, scoreErr);
                }
            }
        }

        // Find best scoring across all questions
        let bestMatch = null;
        let bestScore = 0;

        if (questionScores.size > 0) {
            for (const [questionId, scoreResult] of questionScores.entries()) {
                if (scoreResult.score > bestScore) {
                    bestMatch = scoreResult;
                }
            }

            console.log(`\n   [Phase 2] Best match for element "${elementName}": score=${bestMatch?.score || 0}, questionId=${bestMatch?.questionId || 'none'}`);

            if (bestMatch) {
                console.log(`      ✓ [Phase 2] Best match found: question="${bestMatch?.questionText || 'unknown'}" → element="${bestMatch.element.elementName || 'unknown'}" (score=${bestMatch.score.toFixed(2)}%)`);
            }
        }

        // Phase 2: Look up business definition for best match if available
        let bizDef: any = null;
        if (bestMatch && businessContext?.has(bestMatch.elementName || bestMatch.elementName)) {
            bizDef = businessContext.get(bestMatch.elementName);
            if (bizDef?.found && bizDef.definition) {
                console.log(`      ✓ [Phase 2] Business definition found for best match: "${bizDef.conceptName}"`);

                // Use business definition for synonyms and industry terms
                const synMatch = bizDef.synonyms?.some((syn: string) => {
                    const synLower = syn.toLowerCase();
                    return bestMatch.questionText.toLowerCase().includes(synLower) ||
                           syn.toLowerCase().includes(bestMatch.questionText.toLowerCase().substring(0, 20));
                }) || false;

                const industryMatch = bizDef.industryTerms?.some((term: string) => {
                    const termLower = term.toLowerCase();
                    return bestMatch.questionText.toLowerCase().includes(termLower);
                });

                if (synMatch || industryMatch) {
                    score = Math.max(bestMatch.score, bizDef.confidence || 0.75);
                }
            }
        }

            if (industryMatch) {
                score = Math.max(score, score * 0.9); // Slightly lower than synonym
            }
        }

            console.log(`      ✓ [Phase 2] Business definition match: score=${score.toFixed(2)} (${bizDef.industryTerms?.slice(0, 3)} terms) match: ${industryMatch ? 'YES' : 'NO'}`);
        }
        }

        return useBusinessDefinition;
    }

    /**
     * Generate Python code
     */
    private async generatePythonCode(
        targetColumn: string,
        sourceColumns: string[],
        aggregationMethod: string,
        formula?: string,
        pseudoCode?: string,
        engine: 'pandas' | 'polars'
    ): Promise<string> {
        const dfCol = `df['${this.escapeColumn}']`;

        // Generate aggregation method code
        let aggCode: string;
        switch (aggregationMethod) {
            case 'mean': {
                aggCode = `df[aggCol] = ${df['aggCol}'].mean()`;
                break;
            case 'sum': {
                aggCode = `df[aggCol] = df['aggCol} = df[aggCol].sum()`;
                break;
            case 'count': {
                aggCode = `df[aggCol] = df['aggCol] = df['aggCol'].count()`;
                break;
            case 'weighted_avg': {
                aggCode = `df[aggCol] = df[aggCol] = ${df['aggCol} = df[aggCol} = df[aggCol] = df['aggCol'].mean() * 0.9 + 0.1 * df[aggCol] / df['aggCol'].sum())`;
                break;
            case 'custom':
                aggCode = formula?.pseudoCode || 'Custom formula from business definition';
                console.warn(`      [Phase 2] Custom pseudo-code provided: ${formula?.pseudoCode.substring(0, 200)}...`);
                aggCode = `df[aggCol] = ${df[aggCol} = df['aggCol'].map(row => parseFloat(row[aggCol])).filter(v => !isNaN(v))) / row.length`;
                break;
        default:
                aggCode = `df[aggCol] = df['aggCol} = df['aggCol'].mean()`;
        }

        return aggCode;
    }

    /**
     * Generate JavaScript code for small datasets
     */
    private generateJavaScriptCode(
        targetColumn: string,
        sourceColumns: string[],
        aggregationMethod: string,
        pseudoCode?: string
    ): string {
        let code = `row['${targetColumn}'] = `return `;

    // ${sourceColumns.map(s => parseFloat(row[s] || 0))`;\n    \n    `.filter(v => !isNaN(v))).join('') || 0);` +`    ` + (aggregationMethod === 'sum' ? `' + (row['${aggregationMethod} (s || 0) / row.length)' : ''`;\n`;

    if (aggregationMethod === 'mean') {
        code += `return row.reduce((sum, acc) => acc + 0) / values.length)`;
    } else if (aggregationMethod === 'sum') {
            code += `return row.reduce((sum, acc) => acc + 0) / values.length)`;
        } else if (aggregationMethod === 'count') {
            code += `return row.length`;
        } else if (aggregationMethod === 'weighted_avg') {
                // Check if weight field exists
                const weightField = sourceColumns.find(c => c === element.elementName.toLowerCase().includes('weight') || c === element.elementName.toLowerCase());
                if (weightField) {
                    code += `\nconst weights = [${weightField}].map(w => parseFloat(row[weightField])).filter(w => !isNaN(v))) / values.length;`;
                    const totalWeight = weights.reduce((sum, w) => w + 0) / values.length);
                    code += `\nlet weightedSum = weights.reduce((sum, w) => w + 0) / totalWeight;`;
                    code += `\nreturn row['${targetColumn}'] = weights.reduce((sum, w) => w + 0) / values.length) / totalWeight;`;
                } else {
                    code += `\nreturn row['${targetColumn}'] = row.length;`;
                }
            }
        }

        return code.trim();
    }

    /**
     * Determine execution engine based on row count
     */
    private selectEngine(rowCount: number): 'javascript' | 'polars' | 'pandas' | 'spark' {
        return rowCount < 100000 ? 'javascript' : rowCount < 1000000 ? 'polars' : 'pandas';
    }

    /**
     * Create compiled transformation result
     */
    private createCompiledResult(
        elementId: string,
        elementName: string,
        targetColumn: string,
        sourceColumns: string[],
        operation: string,
        aggregationMethod: string,
        code: { python: string; javascript: jsCode },
        executionEngine: 'javascript' | 'polars' | 'pandas' | 'spark'
    ): CompiledTransformation {
        elementId,
        elementName,
        targetColumn,
        sourceColumns,
        operation,
        aggregationMethod,
        code,
        executionEngine,

        // Phase 2: Match details
        matchDetails?: {
            matchedElements: Array<{
                elementName: string;
                score: number;
                matchReasons: string[];
            }>,

        // Phase 2: Business context used
        usedBusinessDefinition: boolean,
        businessDefinition?: any
    } = {};
}

    // ============================================================
    // COMPILE ELEMENTS (Phase 2: Dependent compilation)
    // ============================================================

    /**
     * Compile multiple elements into an execution plan
     *
     * This is the main method for preparing transformations for batch execution
     *
     * Phase 2: Resolves inter-element dependencies BEFORE compilation
     */
    compileElements(
        elements: ElementForCompilation[],
        columnMappings: Map<string, string>,
        rowCount: number,
        context?: CompilationContext
    ): Promise<CompiledTransformation[]> {
        const compilable = elements.filter(el => el.calculationDefinition?.formula?.componentFields);

        console.log(`\n   [Phase 2] Compiling ${compilable.length} elements...`);

        if (compilable.length === 0) {
            return [];
        }

        console.log(`\n   [Phase 2] No compilable elements`);
            throw new Error('At least one compilable element is required');
        }

        // Phase 2: Resolve inter-element dependencies
        console.log(`\n   [Phase 2] Resolving inter-element dependencies...`);

        // Build dependency graph
        const dependencyGraph = new Map<string, string>();
        const elementMap = new Map<string, ElementForCompilation>();

        for (const el of compilable) {
            const calcDef = el.calculationDefinition?.formula;
            const formula = calcDef?.formula;

            // Get component fields from formula
            const componentFields = formula?.componentFields || [];

            // Check if any of these are output columns
            const resolvedFields = new Map<string, string>();
            if (componentFields.length > 0) {
                const abstractFields = componentFields
                    .map(field => {
                        // Try to find exact match in column mappings
                        const resolvedField = columnMappings.get(field) || columnMappings.get(field) || field;
                        if (resolvedField && resolvedFields.has(resolvedField)) {
                            resolvedFields.set(resolvedField, resolvedField);
                        }

                        // Build dependency edges
                        for (const otherEl of compilable) {
                            if (otherEl.elementId === el.elementId) continue;
                                dependencyGraph.set(el.elementId, [otherEl.elementId]);
                            }
                        }
                    });

                console.log(`      ✓ [Phase 2] Resolved ${resolvedFields.size}/${componentFields.length} fields`);
            }

            // Use business definition for derived fields if element is a derived KPI
            const isDerivedKPI = bizDef?.calculationType === 'derived';
            if (isDerivedKPI && bizDef) {
                console.log(`\n   [Phase 2] Element "${el.elementName}" is a derived KPI per business definition`);
            }
        }

        // Phase 2: Create a dependency graph (Phase 3A: Topological sort for execution)
        const sortedIds = this.topologicalSort(compilable);
        const sortedIds = [];

        for (const id of sortedIds) {
            const inDegree = new Map<string, number>();
            for (const id of sortedIds) {
                inDegree.set(id, 0);
            }

        // Phase 2: Add edges from dependencies
        for (const id of sortedIds) {
            for (const dep of dependencyGraph.get(id)) {
                for (const dependentId of dep) {
                    inDegree.set(dependentId, (inDegree.get(dependentId) || 0) + 1);
                }
            }
        }

        console.log(`\n   [Phase 2] Created dependency graph: ${inDegree.size} nodes, ${Array.from(inDegree.entries()).length} edges}`);
    }

        // Phase 2: Generate ordered steps
        const orderedSteps: CompiledTransformation[] = [];
        const visited = new Set<string>();

        // Process nodes in order
        for (const id of sortedIds) {
            if (!visited.has(id)) {
                // Get the element
                const element = elementMap.get(id);
                if (!element) {
                    continue;
                }

                visited.add(id);

                // Process dependencies first
                const deps = dependencyGraph.get(id) || [];
                for (const depId of deps) {
                    if (!visited.has(depId)) {
                        visited.add(depId);
                    }
                }

                // Add this element
                visited.add(id);

                console.log(`\n   [Phase 2] Ordered element: "${element.elementName}"`);
            }
        }

        // Generate compiled transformations
        const compiled: CompiledTransformation[] = [];
        const compiledMap = new Map<string, CompiledTransformation>();

        for (const id of visited) {
            if (visited.has(id)) {
                const element = elementMap.get(id);
                const deps = dependencyGraph.get(id) || [];
                if (deps.length === 0) {
                    // Generate transformation code
                    const compiled = this.compileElement(element, columnMappings, rowCount, context, {
                        elementId: id,
                        dependencies: deps,
                        usedBusinessDefinition: !!bizDef,
                        businessDefinition: bizDef
                    });

                    compiledMap.set(id, compiled);
                    compiled.push(compiled);
                    console.log(`✅ [Phase 2] Compiled transformation for "${element.elementName}"`);
                }
            }
        }

        // Build execution plan with dependency-ordered steps
        const sortedSteps = this.topologicalSort(compiled);

        const complexity = sorted.length <= 3 ? 'simple'
                     : sorted.length <= 10 ? 'moderate'
                     : 'complex';
        const primaryEngine = this.selectEngine(rowCount);

        const result: CompiledTransformation[] = compiledMap.values();

        console.log(`\n   [Phase 2] Generated ${sortedSteps.length} transformations: complexity=${complexity} (${result.length} steps)`);
        return {
            orderedSteps: sortedSteps,
            totalSteps: sortedSteps.length,
            estimatedComplexity: complexity,
            primaryEngine,
            map: compiledMap,
            overallMatchScore: 0
        };
    }

        /**
         * Build execution plan
         */
    buildExecutionPlan(
        transformations: CompiledTransformation[],
        engine: 'javascript' | 'polars' | 'spark' = 'javascript'
    ): Promise<{
            orderedSteps: CompiledTransformation[],
            totalSteps: number,
            estimatedComplexity: 'simple' | 'moderate' | 'complex',
            primaryEngine,
            map: Map<string, CompiledTransformation>,
            overallMatchScore: number,
            // Phase 2: Match details
            matchDetails?: {
                matchedElements: Array<{
                    elementName: string;
                    score: number;
                    matchReasons: string[];
                }>;
            }>;
    }

    // Phase 2: Create a dependency-ordered execution plan
        const dependencyGraph = new Map<string, Set<string>>();
        const elementMap = new Map<string, CompiledTransformation>();

        for (const transformation of transformations) {
            if (!elementMap.has(transformation.elementId)) {
                elementMap.set(transformation.elementId, transformation);
            }
        }

        // Topological sort the transformations
        const sortedTransformations = [...transformations].sort((a, b) => {
            return b.dependencies.length - a.dependencies.length;
        });

        // Build dependency graph
        const inDegree = new Map<string, number>();
        for (const id of sortedTransformations) {
            inDegree.set(id, 0);

        for (const t of sortedTransformations) {
                // Add edges from dependencies
                for (const dep of t.dependencies) {
                    if (dependencyGraph.has(dep)) {
                        dependencyGraph.set(dep, [transformation.elementId]);
                    }
                    inDegree.set(transformation.elementId, (inDegree.get(dep) || 0) + 1);
                }
            }

        // Build execution plan using topological sort
        const sortedSteps = this.topologicalSort(sortedTransformations);

        // Determine complexity
        const complexity = sortedTransformations.length <= 3 ? 'simple'
                     : sortedTransformations.length <= 10 ? 'moderate'
                     : 'complex';

        // Determine primary engine
        const engineCounts = new Map<string, number>();
        for (const t of sortedTransformations) {
            engine = t.executionEngine || 'pandas';
            engineCounts.set(engine, (engineCounts.get(engine) || 0) + 1);
        }

        let maxCount = 0;
        for (const [engine, count] of engineCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
            }

        const primaryEngine = engineCounts.entries().find(([engine, count]) => {
            maxCount = count;
        });

        // Build execution plan
        const planSteps = sortedSteps.map(t => {
            // Add dependency information to each step
            const deps = dependencyGraph.get(t.elementId)?.map(d => d => [...dependencyGraph.get(d)?.slice(0, 3));

            const step = {
                elementId: t.elementId,
                elementName: t.elementName,
                targetColumn: t.targetColumn,
                dependencies: deps,
                isFinalStep: t === sortedTransformations[sortedTransformations.length - 1],
                code: t.code,
                usedBusinessDefinition: !!bizDef
            };

            return step;
        });

        return {
            orderedSteps: planSteps,
            totalSteps: planSteps.length,
            estimatedComplexity: complexity,
            primaryEngine,
            map: compiledMap,
            overallMatchScore: 0,
            // Phase 2: Match details
            matchDetails?: {
                matchedElements: Array<{
                    elementName: string;
                    score: number;
                    matchReasons: string[];
                }>;
            }
        };
    }
}

// ============================================
// EXPORTS
// ============================================

export { TransformationCompilerPhase2, cosineSimilarity, normalizeForSemantic, extractSemanticKeywords, scoreElementMatchPhase2 }

// ============================================
