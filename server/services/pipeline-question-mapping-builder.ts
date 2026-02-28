/**
 * Question-Element Mapping Builder
 *
 * Priority 1 Fix: Build questionAnswerMapping with properly populated requiredDataElements
 *
 * This service builds the critical mapping that links:
 *   - User questions to data elements
 *   - Data elements to analyses
 *   - Enables semantic traceability through the pipeline
 */

import { nanoid } from 'nanoid';
import { generateStableQuestionId } from '../constants';
import { semanticDataPipeline } from './semantic-data-pipeline';
import { storage } from './storage';

export interface QuestionAnalysisMapping {
    questionId: string;
    questionText: string;
    requiredDataElements: string[];  // Element IDs
    recommendedAnalyses: string[];  // Analysis IDs
    transformationsNeeded: string[];  // Element IDs needing transformation
    expectedArtifacts?: Array<{
        artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
        description: string;
    }>;
}

export class QuestionElementMappingBuilder {

    /**
     * Build questionAnswerMapping from requirementsDocument
     *
     * This creates the critical mapping that ensures:
     * 1. Questions are linked to elements via element IDs
     * 2. Elements have question IDs populated
     * 3. Semantic links are created for traceability
     */
    static async buildQuestionAnswerMapping(
        projectId: string,
        userQuestions: string[],
        requiredDataElements: any[],
        analysisPath: any[]
    ): Promise<{
        questionAnswerMapping: QuestionAnalysisMapping[];
        elementsWithQuestionLinks: number;  // Count of elements with question links
        semanticLinksCreated: number;  // Count of semantic links created (for validation)
    }> {
        console.log('📋 [Q-E Mapping Builder] Building question-answer mappings...');
        console.log(`   User questions: ${userQuestions.length}`);
        console.log(`   Required elements: ${requiredDataElements.length}`);

        const mapping: QuestionAnalysisMapping[] = [];
        let elementsWithQuestionLinks = 0;

        // Build question IDs for stable ID generation
        const questionIdMap = new Map<string, string>();
        for (let i = 0; i < userQuestions.length; i++) {
            const questionId = generateStableQuestionId(projectId, userQuestions[i]);
            questionIdMap.set(userQuestions[i], questionId);
        }

        // For each user question, find related elements
        for (const question of userQuestions) {
            const questionId = questionIdMap.get(question);
            if (!questionId) {
                console.warn(`⚠️ No question ID for: "${question}" - skipping`);
                continue;
            }

            // Find elements related to this question
            const relatedElements = requiredDataElements.filter((el: any) => {
                // Check if element is related via question IDs
                const elementQuestionIds = el.questionIds || [];
                const elementQuestionTexts = el.relatedQuestions || [];
                const questionIdMatches = elementQuestionIds.includes(questionId) ||
                                         elementQuestionTexts.some((qt: string) =>
                                             qt.toLowerCase().includes(question.toLowerCase().substring(0, 30)));

                // Also check if element.name matches question text
                const elementName = (el.elementName || el.name || '').toLowerCase();
                const questionLower = question.toLowerCase();
                const nameMatches = questionLower.includes(elementName) ||
                                    elementName.includes(questionLower.substring(0, 20));

                return questionIdMatches || nameMatches;
            });

            if (relatedElements.length === 0) {
                console.warn(`⚠️ No elements related to question: "${question}" - skipping`);
                continue;
            }

            // Extract element IDs from related elements
            const elementIds = relatedElements
                .map((el: any) => el.elementId || el.id || `elem-${nanoid()}`);

            // Find analyses that can answer this question (from analysisPath)
            const questionAnalysisPath = analysisPath || [];
            const relatedAnalyses = questionAnalysisPath
                .filter((analysis: any) => {
                    const analysisLower = (analysis.analysisName || '').toLowerCase();
                    const questionLower = question.toLowerCase();
                    return questionLower.split(' ').some(word =>
                        word.length > 3 && analysisLower.includes(word));
                })
                .map((analysis: any) => analysis.analysisId || `analysis-${nanoid()}`);

            // Find transformations needed
            const transformationsNeeded = relatedElements
                .filter((el: any) => el.transformationRequired)
                .map((el: any) => el.elementId || el.id || `elem-${nanoid()}`);

            // Infer expected artifacts
            const expectedArtifacts = this.inferExpectedArtifacts(question, relatedAnalyses);

            // Build the mapping entry
            mapping.push({
                questionId,
                questionText: question,
                requiredDataElements: elementIds,
                recommendedAnalyses: relatedAnalyses,
                transformationsNeeded,
                expectedArtifacts
            });

            elementsWithQuestionLinks += relatedElements.length;
        }

        console.log(`✅ [Q-E Mapping Builder] Built ${mapping.length} question-answer mappings`);
        console.log(`   Elements with question links: ${elementsWithQuestionLinks}`);

        // Create semantic question→element links for traceability
        let semanticLinksCreated = 0;
        try {
            for (const entry of mapping) {
                for (const elementId of entry.requiredDataElements) {
                    await semanticDataPipeline.linkQuestionToElement(
                        projectId,
                        entry.questionId,
                        elementId,
                        0.9,  // High confidence for direct mapping
                        'question-mapping-builder'
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

        return { questionAnswerMapping: mapping, elementsWithQuestionLinks, semanticLinksCreated };
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
        if (/visual|chart|graph|plot|show|display/i.test(question)) {
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
     * This ensures the questionAnswerMapping is properly persisted
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

            // Add or update questionAnswerMapping
            requirementsDocument.questionAnswerMapping = questionAnswerMapping;

            // Persist to journeyProgress
            await storage.atomicMergeJourneyProgress(projectId, {
                requirementsDocument
            });

            console.log('✅ [Q-E Mapping Builder] RequirementsDocument enhanced with questionAnswerMapping');
        } catch (error) {
            console.error('❌ Failed to enhance requirementsDocument:', error);
            throw error;
        }
    }
}
