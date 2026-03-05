/**
 * Question-Element Mapping Builder
 *
 * Phase 1 Fix: Build questionAnswerMapping with semantic similarity,
 * business definition integration, and robust element matching.
 *
 * This service builds the critical mapping that links:
 *   - User questions to data elements (semantic matching)
 *   - Data elements to analyses
 *   - Enables semantic traceability through the entire pipeline
 *
 * Key improvements in Phase 1:
 * 1. Semantic similarity matching via embeddings (not just substring)
 * 2. Business definition integration for synonyms/industry terms
 * 3. Multi-layer scoring (exact, semantic, business, pattern)
 * 4. Detailed logging of match reasons for debugging
 */

import { nanoid } from 'nanoid';
import { generateStableQuestionId } from '../constants';
import { semanticDataPipeline } from './semantic-data-pipeline';
import { storage } from './storage';
import { embeddingService, type EmbeddingResult } from './embedding-service';
import { businessDefinitionRegistryService } from './business-definition-registry';

// ============================================
// TYPES
// ============================================

export interface QuestionAnalysisMapping {
    questionId: string;
    questionText: string;
    requiredDataElements: string[];  // Element IDs
    recommendedAnalyses: string[];  // Analysis IDs
    transformationsNeeded: string[];  // Element IDs needing transformation
    matchDetails?: {
        matchedElements: ElementMatchScore[];
        primaryMatchReason: string;
        overallScore: number;
    };  // Phase 1: Detailed match information for debugging
    expectedArtifacts?: Array<{
        artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
        description: string;
    }>;
}

export interface ElementMatchScore {
    element: any;
    score: number;
    matchReasons: string[];
    elementId: string;
}

// ============================================
// UTILITY FUNCTIONS
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
function normalizeText(text: string): string {
    return text.toLowerCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[?!.;:]+$/g, '');
}

/**
 * Extract keywords from text (filter out common stop words)
 */
function extractKeywords(text: string): string[] {
    const stopWords = new Set([
        'about', 'which', 'there', 'their', 'would', 'could', 'should',
        'these', 'those', 'between', 'before', 'after', 'what', 'how',
        'why', 'when', 'where', 'who', 'the', 'a', 'an', 'is', 'are',
        'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
        'do', 'does', 'did', 'will', 'would', 'should', 'can', 'could',
        'may', 'might', 'must', 'shall', 'for', 'to', 'of', 'in', 'on',
        'at', 'by', 'from', 'with', 'and', 'or', 'but', 'not'
    ]);

    return normalizeText(text)
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));
}

// ============================================
// PHASE 1: ENHANCED QUESTION-ELEMENT MATCHING
// ============================================

/**
 * Score how well an element matches a question using multiple strategies
 *
 * Scoring layers (highest to lowest priority):
 * 1. Direct question ID match (score: 1.0)
 * 2. Semantic similarity via embeddings (score: 0.7-0.95)
 * 3. Business definition synonyms/industry terms (score: 0.75)
 * 4. Keyword overlap (score: 0.4-0.6)
 * 5. Pattern/substring matching (score: 0.3-0.4)
 */
async function scoreElementMatch(
    question: string,
    questionId: string,
    element: any,
    questionEmbedding: EmbeddingResult | null,
    projectContext?: string
): Promise<ElementMatchScore> {
    const reasons: string[] = [];
    let score = 0;
    const elementId = element.elementId || element.id || `elem-${nanoid()}`;
    const elementName = element.elementName || element.name || '';
    const elementDescription = element.description || '';
    const questionLower = normalizeText(question);
    const elementNameLower = normalizeText(elementName);

    console.log(`   [Scoring] Question: "${question.substring(0, 50)}..." vs Element: "${elementName}"`);

    // ============================================================
    // LAYER 1: Direct Question ID Match (highest score)
    // ============================================================
    const elementQuestionIds = element.questionIds || [];
    if (elementQuestionIds.includes(questionId)) {
        score = Math.max(score, 1.0);
        reasons.push('Direct question ID match');
        console.log(`      ✓ Layer 1: Direct question ID match (score=1.0)`);
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
                const result = await embeddingService.embedText(textToEmbed, { truncateLength: 500 });
                elementEmbedding = result.embedding;
            } catch (embedErr) {
                // Fallback: use keyword-based scoring if embedding fails
                console.warn(`      ⚠️ Embedding failed for element "${elementName}":`, embedErr);
            }
        }

        if (elementEmbedding && elementEmbedding.length > 0) {
            const similarity = cosineSimilarity(questionEmbedding.embedding, elementEmbedding);
            if (similarity > 0.7) {  // Threshold for semantic match
                const semanticScore = Math.round(similarity * 100) / 100;
                score = Math.max(score, semanticScore);
                reasons.push(`Semantic similarity: ${(similarity * 100).toFixed(0)}%`);
                console.log(`      ✓ Layer 2: Semantic similarity ${(similarity * 100).toFixed(0)}% (score=${semanticScore})`);
            }
        }
    }

    // ============================================================
    // LAYER 3: Business Definition Lookup (synonyms, industry terms)
    // ============================================================
    try {
        const bizLookup = await businessDefinitionRegistryService.lookupDefinition(
            elementName,
            { conceptName: elementName, context: projectContext }
        );

        if (bizLookup.found && bizLookup.definition) {
            const bizDef = bizLookup.definition;
            const bizScore = bizLookup.confidence || 0.75;

            // Check for synonyms
            if (bizDef.synonyms && bizDef.synonyms.length > 0) {
                const hasSynonymMatch = bizDef.synonyms.some((syn: string) => {
                    const synLower = syn.toLowerCase();
                    return questionLower.includes(synLower) || synLower.includes(questionLower.substring(0, 20));
                });

                if (hasSynonymMatch) {
                    score = Math.max(score, bizScore);
                    reasons.push(`Business synonym match (${bizDef.synonyms.slice(0, 2).join(', ')})`);
                    console.log(`      ✓ Layer 3: Business synonym match (score=${bizScore})`);
                }
            }

            // Check for industry-specific terms
            if (bizDef.industryTerms && bizDef.industryTerms.length > 0) {
                const hasIndustryMatch = bizDef.industryTerms.some((term: string) => {
                    const termLower = term.toLowerCase();
                    return questionLower.includes(termLower);
                });

                if (hasIndustryMatch) {
                    score = Math.max(score, bizScore * 0.9); // Slightly lower than synonym
                    reasons.push(`Industry term match (${bizDef.industryTerms[0]})`);
                    console.log(`      ✓ Layer 3: Industry term match (score=${bizScore * 0.9})`);
                }
            }
        }
    } catch (bizErr) {
        // Non-fatal: business definition lookup can fail
        console.warn(`      ⚠️ Business definition lookup failed:`, bizErr);
    }

    // ============================================================
    // LAYER 4: Keyword Overlap (more robust than substring)
    // ============================================================
    const questionKeywords = extractKeywords(question);
    const elementKeywords = extractKeywords(`${elementName} ${elementDescription}`);

    if (questionKeywords.length > 0 && elementKeywords.length > 0) {
        const commonKeywords = questionKeywords.filter(kw => elementKeywords.some(ekw =>
            ekw.includes(kw) || kw.includes(ekw)
        ));

        if (commonKeywords.length > 0) {
            const keywordRatio = commonKeywords.length / Math.max(questionKeywords.length, 1);
            const keywordScore = Math.min(0.6, 0.3 + keywordRatio * 0.5); // Max 0.6

            if (keywordRatio >= 0.3) { // At least 30% keyword overlap
                score = Math.max(score, keywordScore);
                reasons.push(`Keyword overlap: ${commonKeywords.length}/${questionKeywords.length}`);
                console.log(`      ✓ Layer 4: Keyword overlap ${commonKeywords.length}/${questionKeywords.length} (score=${keywordScore})`);
            }
        }
    }

    // ============================================================
    // LAYER 5: Pattern/Substring Matching (original fallback)
    // ============================================================
    const questionIdMatches = elementQuestionIds.includes(questionId);
    const elementQuestionTexts = element.relatedQuestions || [];
    const textMatch = elementQuestionTexts.some((qt: string) =>
        qt.toLowerCase().includes(questionLower.substring(0, 30))
    );

    const nameMatches = questionLower.includes(elementNameLower) ||
                      elementNameLower.includes(questionLower.substring(0, 20));

    if ((questionIdMatches || textMatch || nameMatches) && score === 0) {
        const patternScore = 0.35;
        score = Math.max(score, patternScore);
        const matchType = questionIdMatches ? 'question ID' : nameMatches ? 'element name' : 'related question';
        reasons.push(`${matchType} pattern match`);
        console.log(`      ✓ Layer 5: ${matchType} pattern match (score=${patternScore})`);
    }

    // ============================================================
    // SCORE THRESHOLDING
    // ============================================================
    const MIN_SCORE_THRESHOLD = 0.4; // Elements below this score are not considered related

    if (score < MIN_SCORE_THRESHOLD && reasons.length === 0) {
        console.log(`      ✗ No match (score=${score} < threshold ${MIN_SCORE_THRESHOLD})`);
    } else {
        console.log(`      ✓ Final score: ${score.toFixed(2)} (reasons: ${reasons.join(', ')})`);
    }

    return {
        element,
        score: score < MIN_SCORE_THRESHOLD ? 0 : score, // Zero out if below threshold
        matchReasons: reasons.length > 0 ? reasons : ['Below threshold'],
        elementId
    };
}

// ============================================
// MAIN BUILDER CLASS
// ============================================

export class QuestionElementMappingBuilder {

    /**
     * Build questionAnswerMapping from requirementsDocument
     *
     * Phase 1 enhancements:
     * - Uses semantic similarity via embeddings
     * - Integrates business definitions for synonyms
     * - Multi-layer scoring for robust matching
     * - Detailed match logging for debugging
     */
    static async buildQuestionAnswerMapping(
        projectId: string,
        userQuestions: string[],
        requiredDataElements: any[],
        analysisPath: any[],
        projectContext?: string  // Phase 1: Business context for better matching
    ): Promise<{
        questionAnswerMapping: QuestionAnalysisMapping[];
        elementsWithQuestionLinks: number;
        semanticLinksCreated: number;
        embeddingCacheHits: number;  // Phase 1: Track cache efficiency
    }> {
        console.log('📋 [Q-E Mapping Builder - Phase 1] Building semantic question-answer mappings...');
        console.log(`   Project ID: ${projectId}`);
        console.log(`   User questions: ${userQuestions.length}`);
        console.log(`   Required elements: ${requiredDataElements.length}`);
        if (projectContext) {
            console.log(`   Project context: "${projectContext.substring(0, 100)}..."`);
        }

        const mapping: QuestionAnalysisMapping[] = [];
        let elementsWithQuestionLinks = 0;
        let embeddingCacheHits = 0;

        // Build question IDs for stable ID generation
        const questionIdMap = new Map<string, string>();
        for (const question of userQuestions) {
            const questionId = generateStableQuestionId(projectId, question);
            questionIdMap.set(question, questionId);
        }

        // Phase 1: Generate question embeddings in batch for efficiency
        console.log(`🔗 [Phase 1] Generating embeddings for ${userQuestions.length} questions...`);
        const questionEmbeddings = new Map<string, EmbeddingResult>();

        try {
            // Batch embed questions (limit to 10 at a time to avoid rate limits)
            const batchSize = 10;
            for (let i = 0; i < userQuestions.length; i += batchSize) {
                const batch = userQuestions.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(q =>
                    embeddingService.embedText(q, { truncateLength: 500 }).catch(err => {
                        console.warn(`   ⚠️ Failed to embed question: ${q.substring(0, 30)}...`, err);
                        return null;
                    })
                ));

                for (let j = 0; j < batch.length; j++) {
                    if (results[j]) {
                        questionEmbeddings.set(batch[j], results[j]!);
                        embeddingCacheHits++;
                    }
                }
            }

            console.log(`✅ [Phase 1] Generated ${questionEmbeddings.size} question embeddings`);
        } catch (embedErr) {
            console.warn(`⚠️ [Phase 1] Question embedding generation failed:`, embedErr);
            // Continue without embeddings - will use fallback scoring
        }

        // For each user question, find related elements with semantic matching
        console.log(`\n🔍 [Phase 1] Finding elements for each question...\n`);

        for (const question of userQuestions) {
            const questionId = questionIdMap.get(question);
            if (!questionId) {
                console.warn(`⚠️ No question ID for: "${question}" - skipping`);
                continue;
            }

            const questionEmbedding = questionEmbeddings.get(question) || null;
            console.log(`\n   [Question] "${question.substring(0, 60)}..."`);
            console.log(`   [Question ID] ${questionId}`);
            console.log(`   [Embedding] ${questionEmbedding ? 'Available' : 'Not available (will use fallback)'}`);

            // Score all elements against this question
            const elementScores: ElementMatchScore[] = [];

            for (const element of requiredDataElements) {
                const scored = await scoreElementMatch(
                    question,
                    questionId,
                    element,
                    questionEmbedding,
                    projectContext
                );
                if (scored.score > 0) {
                    elementScores.push(scored);
                }
            }

            if (elementScores.length === 0) {
                console.warn(`⚠️ No elements related to question: "${question}" - skipping`);
                continue;
            }

            // Sort by score (highest first)
            elementScores.sort((a, b) => b.score - a.score);

            // Take top elements with score > threshold
            const MIN_ELEMENT_SCORE = 0.4;
            const relatedElements = elementScores
                .filter(s => s.score >= MIN_ELEMENT_SCORE)
                .slice(0, 10); // Max 10 elements per question

            if (relatedElements.length === 0) {
                console.warn(`⚠️ No elements above threshold for question: "${question}"`);
                continue;
            }

            // Log top match details
            const topMatch = relatedElements[0];
            console.log(`   ✓ Found ${relatedElements.length} related elements`);
            console.log(`   ✓ Top match: "${topMatch.element.elementName || topMatch.element.name}" (score=${topMatch.score.toFixed(2)})`);
            console.log(`   ✓ Match reasons: ${topMatch.matchReasons.join(', ')}`);

            // Extract element IDs from related elements
            const elementIds = relatedElements.map(r => r.elementId);

            // Find analyses that can answer this question (from analysisPath)
            const questionAnalysisPath = analysisPath || [];
            const relatedAnalyses = questionAnalysisPath
                .filter((analysis: any) => {
                    const analysisLower = (analysis.analysisName || '').toLowerCase();
                    const questionLower = question.toLowerCase();
                    // Phase 1: Also check if element names appear in analysis name
                    const elementNamesInAnalysis = relatedElements.map(e =>
                        (e.element.elementName || e.element.name || '').toLowerCase()
                    );
                    const hasElementRelevance = elementNamesInAnalysis.some(elName =>
                        analysisLower.includes(elName)
                    );

                    return questionLower.split(' ').some(word =>
                        word.length > 3 && analysisLower.includes(word)
                    ) || hasElementRelevance;
                })
                .map((analysis: any) => analysis.analysisId || `analysis-${nanoid()}`);

            // Find transformations needed
            const transformationsNeeded = relatedElements
                .filter((r: ElementMatchScore) => r.element.transformationRequired)
                .map((r: ElementMatchScore) => r.elementId);

            // Infer expected artifacts
            const expectedArtifacts = this.inferExpectedArtifacts(question, relatedAnalyses);

            // Build mapping entry with Phase 1 match details
            mapping.push({
                questionId,
                questionText: question,
                requiredDataElements: elementIds,
                recommendedAnalyses: relatedAnalyses,
                transformationsNeeded,
                expectedArtifacts,
                // Phase 1: Include detailed match information
                matchDetails: {
                    matchedElements: relatedElements.map(es => ({
                        element: es.element.elementName || es.element.name,
                        score: es.score,
                        reasons: es.matchReasons
                    })),
                    primaryMatchReason: topMatch.matchReasons[0] || 'semantic_match',
                    overallScore: topMatch.score
                }
            });

            elementsWithQuestionLinks += relatedElements.length;
        }

        console.log(`\n✅ [Q-E Mapping Builder - Phase 1] Built ${mapping.length} question-answer mappings`);
        console.log(`   Elements with question links: ${elementsWithQuestionLinks}`);
        console.log(`   Embedding cache hits: ${embeddingCacheHits}/${userQuestions.length}`);
        console.log(`   Avg elements per question: ${(elementsWithQuestionLinks / mapping.length || 0).toFixed(1)}`);

        // Create semantic question→element links for traceability
        let semanticLinksCreated = 0;
        try {
            for (const entry of mapping) {
                for (const elementId of entry.requiredDataElements) {
                    // Phase 1: Use match score as link confidence
                    const confidence = entry.matchDetails?.overallScore || 0.9;

                    await semanticDataPipeline.linkQuestionToElement(
                        projectId,
                        entry.questionId,
                        elementId,
                        confidence,  // Use actual match score as confidence
                        'question-mapping-builder-phase1'
                    );
                    semanticLinksCreated++;
                }
            }
            console.log(`🔗 [Q-E Mapping Builder] Created ${semanticLinksCreated} question→element semantic links`);
        } catch (linkError) {
            // PIPELINE CRITICAL: Semantic links are REQUIRED for traceability
            // Don't silently fail - throw error so caller knows links weren't created
            console.error(`❌ [Q-E Mapping Builder] Semantic link creation FAILED:`, linkError);
            console.error(`   This breaks the Question → Element → Transformation → Analysis chain`);
            throw new Error(`Failed to create semantic question→element links: ${linkError.message}`);
        }

        return {
            questionAnswerMapping: mapping,
            elementsWithQuestionLinks,
            semanticLinksCreated,
            embeddingCacheHits
        };
    }

    /**
     * Infer expected artifacts based on question and analysis types
     */
    private static inferExpectedArtifacts(
        question: string,
        analyses: any[]
    ): Array<{ artifactType: string; description: string }> {
        const artifacts: Array<any> = [];
        const questionLower = question.toLowerCase();

        // Default artifact type based on question keywords
        if (/visual|chart|graph|plot|show|display|see/i.test(question)) {
            artifacts.push({
                artifactType: 'visualization',
                description: 'Visual charts and graphs to present findings'
            });
        }

        // Add artifacts from analyses
        for (const analysis of analyses) {
            const analysisType = (analysis.analysisType || '').toLowerCase();
            if (analysisType === 'descriptive' || analysisType === 'correlation') {
                artifacts.push({
                    artifactType: 'visualization',
                    description: 'Statistical charts and correlation matrix'
                });
            } else if (analysisType === 'regression' || analysisType === 'classification') {
                artifacts.push({
                    artifactType: 'model',
                    description: 'Trained predictive model'
                });
            } else if (analysisType === 'clustering') {
                artifacts.push({
                    artifactType: 'dashboard',
                    description: 'Segment comparison dashboard'
                });
            }
        }

        return artifacts.length > 0 ? artifacts : [
            { artifactType: 'report', description: 'Analysis report' }
        ];
    }

    /**
     * Enhance requirementsDocument with questionAnswerMapping
     *
     * This ensures that questionAnswerMapping is properly persisted
     * to journeyProgress for use by analysis execution
     */
    static async enhanceRequirementsWithQuestionMapping(
        projectId: string,
        requirementsDocument: any,
        questionAnswerMapping: QuestionAnalysisMapping[]
    ): Promise<void> {
        try {
            console.log('📋 [Q-E Mapping Builder] Enhancing requirementsDocument with questionAnswerMapping...');

            // Ensure requirementsDocument exists
            if (!requirementsDocument) {
                requirementsDocument = { requiredDataElements: [], analysisPath: [] };
            }

            // Phase 1: Add or update questionAnswerMapping with match details
            requirementsDocument.questionAnswerMapping = questionAnswerMapping;

            // Phase 1: Add metadata about the mapping for downstream use
            requirementsDocument.mappingMetadata = {
                builtAt: new Date().toISOString(),
                buildMethod: 'semantic_phase1',
                mappingCount: questionAnswerMapping.length,
                avgMatchScore: questionAnswerMapping.reduce((sum, m) =>
                    sum + (m.matchDetails?.overallScore || 0), 0
                ) / questionAnswerMapping.length
            };

            // Persist to journeyProgress
            await storage.atomicMergeJourneyProgress(projectId, {
                requirementsDocument
            });

            console.log('✅ [Q-E Mapping Builder] RequirementsDocument enhanced with questionAnswerMapping');
            console.log(`   Mapping method: semantic_phase1`);
            console.log(`   Average match score: ${requirementsDocument.mappingMetadata?.avgMatchScore?.toFixed(2) || 'N/A'}`);
        } catch (error) {
            console.error('❌ Failed to enhance requirementsDocument:', error);
            throw error;
        }
    }

    /**
     * Phase 1: Validate the quality of question-element mappings
     *
     * Returns statistics about the mapping quality to help identify issues
     */
    static validateMappingQuality(
        mapping: QuestionAnalysisMapping[]
    ): {
        totalQuestions: number;
        questionsWithMatches: number;
        questionsWithoutMatches: number;
        avgElementsPerQuestion: number;
        avgMatchScore: number;
        lowScoreQuestions: string[];  // Questions with score < 0.6
    } {
        const totalQuestions = mapping.length;
        const questionsWithMatches = mapping.filter(m => m.requiredDataElements.length > 0);
        const questionsWithoutMatches = mapping.filter(m => m.requiredDataElements.length === 0);

        const totalElements = mapping.reduce((sum, m) => sum + m.requiredDataElements.length, 0);
        const avgElementsPerQuestion = totalQuestions > 0 ? totalElements / totalQuestions : 0;

        const matchScores = mapping
            .map(m => m.matchDetails?.overallScore || 0)
            .filter(s => s > 0);
        const avgMatchScore = matchScores.length > 0
            ? matchScores.reduce((sum, s) => sum + s, 0) / matchScores.length
            : 0;

        const lowScoreQuestions = mapping
            .filter(m => (m.matchDetails?.overallScore || 0) < 0.6)
            .map(m => m.questionText.substring(0, 50));

        return {
            totalQuestions,
            questionsWithMatches: questionsWithMatches.length,
            questionsWithoutMatches: questionsWithoutMatches.length,
            avgElementsPerQuestion,
            avgMatchScore,
            lowScoreQuestions
        };
    }
}
