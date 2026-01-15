// server/services/question-answer-service.ts
/**
 * Question-Answer Service
 *
 * Uses Project Manager or Business Analyst agent to translate analysis results
 * into direct, contextual answers for each user question.
 *
 * Supports audience-appropriate answer formatting (CEO, Business Manager, Data Analyst, etc.)
 *
 * Now saves to normalized tables (U2A2A2U):
 * - project_questions: Stores user questions with stable IDs
 * - question_answers: Stores AI-generated answers with confidence
 * - evidence_chain: Links answers to supporting data
 */

import { storage } from '../storage';
import { db } from '../db';
// NOTE: Only projectQuestions exists in schema. Answers/evidence stored directly in this table.
// The normalized tables (questionAnswers, evidenceChain, answerInsights) were planned but never created.
import { projectQuestions } from '@shared/schema';
import { nanoid } from 'nanoid';
import { eq, and, desc } from 'drizzle-orm';
import * as crypto from 'crypto';
import { normalizeQuestions, normalizeQuestion } from '../utils/question-normalizer';

export interface QuestionAnswer {
    question: string;
    answer: string;
    confidence: number;
    sources: string[];
    relatedInsights: string[];
    status: 'answered' | 'partial' | 'pending';
    generatedAt: Date;
    // Phase 4: Enhanced evidence tracking
    evidenceInsights?: string[]; // Specific insight IDs that support the answer
    dataElementsUsed?: string[]; // Which data elements contributed
    analysisTypes?: string[]; // Which analyses provided the answer
}

export interface QuestionAnswerResult {
    projectId: string;
    answers: QuestionAnswer[];
    generatedBy: string;
    generatedAt: Date;
    totalQuestions: number;
    answeredCount: number;
}

interface AudienceContext {
    primaryAudience: string;
    technicalLevel?: string;
    industryContext?: string;
}

export class QuestionAnswerService {

    /**
     * Generate direct answers to user questions using AI
     * GAP E: Now uses questionAnswerMapping for enhanced traceability
     */
    static async generateAnswers(params: {
        projectId: string;
        userId: string;
        questions: string[];
        analysisResults: any;
        analysisGoal?: string;
        audience?: AudienceContext;
        // GAP E: Question-answer mapping from requirements for traceability
        questionAnswerMapping?: Array<{
            questionId: string;
            questionText: string;
            recommendedAnalyses?: string[];
            requiredDataElements?: string[];
            transformationsNeeded?: string[];
        }>;
    }): Promise<QuestionAnswerResult> {
        const { projectId, userId, questions, analysisResults, analysisGoal, audience } = params;

        // GAP E: Load questionAnswerMapping from project if not provided
        let questionMapping = params.questionAnswerMapping || [];
        if (questionMapping.length === 0) {
            try {
                const project = await storage.getProject(projectId);
                if (project && (project as any).questionAnswerMapping) {
                    questionMapping = (project as any).questionAnswerMapping;
                    console.log(`📊 [GAP E] Loaded ${questionMapping.length} question-answer mappings from project`);
                }
            } catch (err) {
                console.warn(`⚠️ [GAP E] Could not load questionAnswerMapping:`, err);
            }
        }

        console.log(`🤔 Generating answers for ${questions.length} user questions...`);
        if (questionMapping.length > 0) {
            console.log(`📊 [GAP E] Using ${questionMapping.length} question-answer mappings for traceability`);
        }

        const questionList = this.parseQuestions(questions);

        if (questionList.length === 0) {
            console.warn('⚠️  No questions provided, returning empty result');
            return {
                projectId,
                answers: [],
                generatedBy: 'question-answer-service',
                generatedAt: new Date(),
                totalQuestions: 0,
                answeredCount: 0
            };
        }

        const project = await storage.getProject(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        const insights = analysisResults?.insights || [];
        const recommendations = analysisResults?.recommendations || [];
        const summary = analysisResults?.summary || {};

        const analysisContext = {
            goal: analysisGoal || 'Analyze data and answer user questions',
            insights: insights.map((i: any) => ({
                title: i.title,
                description: i.description,
                impact: i.impact,
                confidence: i.confidence,
                category: i.category,
                dataSource: i.dataSource
            })),
            recommendations: recommendations.map((r: any) => ({
                title: r.title,
                description: r.description,
                priority: r.priority
            })),
            summary: {
                totalAnalyses: summary.totalAnalyses || 0,
                dataRowsProcessed: summary.dataRowsProcessed || 0,
                qualityScore: summary.qualityScore || 0,
                executionTime: summary.executionTime || 'N/A'
            }
        };

        const answers: QuestionAnswer[] = [];

        for (const question of questionList) {
            try {
                console.log(`❓ Answering: "${question.substring(0, 80)}..."`);

                // GAP E: Find the mapping for this question to enhance evidence chain
                const normalizedQ = question.toLowerCase().trim();
                const questionMappingMatch = questionMapping.find(m =>
                    m.questionText.toLowerCase().trim() === normalizedQ ||
                    m.questionText.toLowerCase().includes(normalizedQ.substring(0, 50)) ||
                    normalizedQ.includes(m.questionText.toLowerCase().substring(0, 50))
                );

                if (questionMappingMatch) {
                    console.log(`📊 [GAP E] Found mapping for question: ${questionMappingMatch.questionId}`);
                }

                const answer = await this.answerSingleQuestion({
                    question,
                    analysisContext,
                    audience,
                    analysisResults, // Phase 4: Pass full results for evidence extraction
                    questionMappingMatch // GAP E: Pass mapping for enhanced traceability
                });

                // GAP E: Enhance answer with evidence from mapping
                if (questionMappingMatch) {
                    answer.evidenceInsights = answer.evidenceInsights || [];
                    answer.dataElementsUsed = questionMappingMatch.requiredDataElements || answer.dataElementsUsed || [];
                    answer.analysisTypes = questionMappingMatch.recommendedAnalyses || answer.analysisTypes || [];

                    // Add evidence chain metadata
                    (answer as any).evidenceChain = {
                        questionId: questionMappingMatch.questionId,
                        dataElements: questionMappingMatch.requiredDataElements || [],
                        analyses: questionMappingMatch.recommendedAnalyses || [],
                        transformationsApplied: questionMappingMatch.transformationsNeeded || [],
                        insightIds: answer.evidenceInsights
                    };
                }

                answers.push(answer);
                console.log(`✅ Answer generated with ${answer.confidence}% confidence`);

            } catch (error) {
                console.error(`❌ Failed to answer question: "${question}"`, error);

                answers.push({
                    question,
                    answer: `We encountered an issue generating a specific answer to this question. However, based on the analysis, we found ${insights.length} key insights that may be relevant. Please review the detailed insights for more information.`,
                    confidence: 30,
                    sources: [],
                    relatedInsights: insights.slice(0, 2).map((i: any) => i.title),
                    status: 'partial',
                    generatedAt: new Date()
                });
            }
        }

        const answeredCount = answers.filter(a => a.status === 'answered').length;

        const result: QuestionAnswerResult = {
            projectId,
            answers,
            generatedBy: 'ai-question-answer-service',
            generatedAt: new Date(),
            totalQuestions: questionList.length,
            answeredCount
        };

        await this.storeQuestionAnswers(projectId, result);

        console.log(`✅ Generated ${answeredCount}/${questionList.length} answers successfully`);

        return result;
    }

    /**
     * Answer a single question using AI with audience-appropriate formatting
     * GAP E: Now accepts questionMappingMatch for enhanced traceability
     */
    private static async answerSingleQuestion(params: {
        question: string;
        analysisContext: any;
        audience?: AudienceContext;
        analysisResults?: any; // Phase 4: Full analysis results for evidence
        questionMappingMatch?: { // GAP E: Mapping from requirements
            questionId: string;
            questionText: string;
            recommendedAnalyses?: string[];
            requiredDataElements?: string[];
            transformationsNeeded?: string[];
        };
    }): Promise<QuestionAnswer> {
        const { question, analysisContext, audience, analysisResults, questionMappingMatch } = params;

        const prompt = this.buildAnswerPrompt(question, analysisContext, audience);
        const answer = await this.callAIForAnswer(prompt);

        const confidence = this.extractConfidence(answer, analysisContext);
        const sources = this.extractSources(answer, analysisContext);
        const relatedInsights = this.findRelatedInsights(question, analysisContext.insights);

        // Phase 4: Extract evidence (insight IDs, data elements, analysis types)
        const evidenceInsights = this.extractEvidenceInsights(question, analysisContext, params.analysisResults);
        const dataElementsUsed = this.extractDataElementsUsed(question, params.analysisResults);
        const analysisTypes = this.extractAnalysisTypes(question, analysisContext, params.analysisResults);

        return {
            question,
            answer: answer.text || answer,
            confidence,
            sources,
            relatedInsights,
            status: confidence >= 60 ? 'answered' : 'partial',
            generatedAt: new Date(),
            // Phase 4: Enhanced evidence
            evidenceInsights,
            dataElementsUsed,
            analysisTypes
        };
    }

    /**
     * Build prompt with audience-specific instructions
     */
    private static buildAnswerPrompt(
        question: string,
        context: any,
        audience?: AudienceContext
    ): string {
        const audienceInstructions = this.getAudienceInstructions(
            audience?.primaryAudience || 'general',
            audience?.technicalLevel
        );

        return `You are a Project Manager helping a user understand their data analysis results.

USER'S QUESTION:
"${question}"

ANALYSIS GOAL:
${context.goal}

ANALYSIS RESULTS:
${context.insights.length} insights found:
${context.insights.slice(0, 5).map((i: any, idx: number) =>
            `${idx + 1}. ${i.title} (${i.impact} impact, ${i.confidence}% confidence)\n   ${i.description}`
        ).join('\n')}

${context.recommendations.length > 0 ? `
RECOMMENDATIONS:
${context.recommendations.slice(0, 3).map((r: any, idx: number) =>
            `${idx + 1}. ${r.title} (${r.priority} priority)\n   ${r.description}`
        ).join('\n')}
` : ''}

SUMMARY STATISTICS:
- Rows analyzed: ${context.summary.dataRowsProcessed.toLocaleString()}
- Quality score: ${context.summary.qualityScore}%
- Execution time: ${context.summary.executionTime}

${audienceInstructions}

INSTRUCTIONS:
1. Provide a direct, clear answer to the user's question
2. Use the analysis results above to support your answer
3. Be specific and cite relevant insights
4. If the analysis doesn't fully answer the question, acknowledge this and provide what information is available
5. Keep the answer concise but comprehensive (2-4 sentences)
6. Write in a professional but friendly tone

YOUR ANSWER:`;
    }

    /**
     * Get audience-specific formatting instructions
     */
    private static getAudienceInstructions(audience: string, technicalLevel?: string): string {
        const audienceMap: Record<string, string> = {
            'ceo': `AUDIENCE: C-Suite Executive
- Focus on business impact, ROI, and strategic implications
- Use high-level summaries with key metrics
- Avoid technical jargon, use business language
- Emphasize financial outcomes and competitive advantages`,

            'business_manager': `AUDIENCE: Business Manager
- Balance business context with operational details
- Include KPIs and performance metrics
- Use clear, professional language with minimal jargon
- Focus on actionable insights and next steps`,

            'data_analyst': `AUDIENCE: Data Analyst
- Include statistical details and methodology
- Reference specific analysis techniques used
- Use technical terminology appropriately
- Mention confidence intervals and data quality`,

            'technical_team': `AUDIENCE: Technical Team
- Use technical language and precise terminology
- Include implementation details
- Reference algorithms and methodologies
- Provide technical depth and accuracy`,

            'non_tech': `AUDIENCE: Non-Technical Stakeholder
- Use simple, clear language without jargon
- Explain concepts with analogies
- Focus on "what it means" rather than "how it works"
- Keep explanations accessible`,

            'general': `AUDIENCE: General Business User
- Use clear, professional language
- Balance accessibility with accuracy
- Include key metrics and insights
- Focus on practical implications`
        };

        const baseInstruction = audienceMap[audience.toLowerCase()] || audienceMap['general'];

        if (technicalLevel) {
            const levelMap: Record<string, string> = {
                'beginner': '\n- Use extra simple language and provide more context',
                'intermediate': '\n- Assume basic familiarity with business/data concepts',
                'advanced': '\n- Use more sophisticated terminology and deeper analysis'
            };
            return baseInstruction + (levelMap[technicalLevel.toLowerCase()] || '');
        }

        return baseInstruction;
    }

    /**
     * Call AI service to generate answer
     */
    private static async callAIForAnswer(prompt: string): Promise<any> {
        const { aiService } = await import('../ai-service');

        try {
            // Use platform provider (Gemini) by default
            const response = await aiService.queryData(
                'platform',
                process.env.GOOGLE_AI_API_KEY || '',
                prompt,
                { schema: {}, sampleData: [] } // Minimal context as prompt contains everything
            );

            return {
                text: response,
                confidence: 75
            };
        } catch (error) {
            console.error('AI service error:', error);
            throw error;
        }
    }

    /**
     * Extract confidence score
     */
    private static extractConfidence(answer: any, context: any): number {
        const answerText = typeof answer === 'string' ? answer : answer.text || '';
        let confidence = answer.confidence || 60;

        const mentionsInsights = context.insights.some((i: any) =>
            answerText.toLowerCase().includes(i.title.toLowerCase().split(' ')[0])
        );

        if (mentionsInsights) {
            confidence = Math.min(confidence + 15, 95);
        }

        if (/\d+%|\d+\.\d+|\d{1,3}(,\d{3})*/.test(answerText)) {
            confidence = Math.min(confidence + 10, 95);
        }

        return Math.round(confidence);
    }

    /**
     * Extract sources from answer
     */
    private static extractSources(answer: any, context: any): string[] {
        const answerText = typeof answer === 'string' ? answer : answer.text || '';
        const sources: string[] = [];

        context.insights.forEach((insight: any) => {
            const keywords = insight.title.toLowerCase().split(' ').filter((w: string) => w.length > 4);
            const mentioned = keywords.some((keyword: string) =>
                answerText.toLowerCase().includes(keyword)
            );

            if (mentioned && insight.dataSource) {
                sources.push(insight.dataSource);
            }
        });

        return [...new Set(sources)];
    }

    /**
     * Find insights related to question
     */
    private static findRelatedInsights(question: string, insights: any[]): string[] {
        const questionLower = question.toLowerCase();
        const keywords = questionLower
            .split(/\s+/)
            .filter(word => word.length > 3 && !['what', 'when', 'where', 'which', 'how', 'why', 'are', 'the', 'this', 'that'].includes(word));

        return insights
            .filter(insight => {
                const insightText = `${insight.title} ${insight.description}`.toLowerCase();
                return keywords.some(keyword => insightText.includes(keyword));
            })
            .slice(0, 3)
            .map(i => i.title);
    }

    /**
     * Extract evidence insight IDs (Phase 4)
     */
    private static extractEvidenceInsights(question: string, context: any, analysisResults?: any): string[] {
        if (!analysisResults?.insightToQuestionMap) {
            // Fallback to keyword matching
            return this.findRelatedInsights(question, context.insights)
                .map(title => {
                    const insight = context.insights.find((i: any) => i.title === title);
                    return insight?.id?.toString() || '';
                })
                .filter(Boolean);
        }

        // Find question ID from questionAnswerMapping
        const questionMapping = analysisResults.questionAnswerMapping?.find((qam: any) =>
            qam.questionText.toLowerCase().includes(question.toLowerCase().slice(0, 30)) ||
            question.toLowerCase().includes(qam.questionText.toLowerCase().slice(0, 30))
        );

        if (questionMapping?.questionId && analysisResults.insightToQuestionMap[questionMapping.questionId]) {
            return analysisResults.insightToQuestionMap[questionMapping.questionId];
        }

        return [];
    }

    /**
     * Extract data elements used (Phase 4)
     */
    private static extractDataElementsUsed(question: string, analysisResults?: any): string[] {
        if (!analysisResults?.questionAnswerMapping) {
            return [];
        }

        const questionMapping = analysisResults.questionAnswerMapping.find((qam: any) =>
            qam.questionText.toLowerCase().includes(question.toLowerCase().slice(0, 30)) ||
            question.toLowerCase().includes(qam.questionText.toLowerCase().slice(0, 30))
        );

        return questionMapping?.requiredDataElements || [];
    }

    /**
     * Extract analysis types used (Phase 4)
     */
    private static extractAnalysisTypes(question: string, context: any, analysisResults?: any): string[] {
        if (!analysisResults?.questionAnswerMapping) {
            // Fallback: extract from insights
            const relatedInsights = this.findRelatedInsights(question, context.insights);
            const types = new Set<string>();
            relatedInsights.forEach(title => {
                const insight = context.insights.find((i: any) => i.title === title);
                if (insight?.category) {
                    types.add(insight.category);
                }
            });
            return Array.from(types);
        }

        const questionMapping = analysisResults.questionAnswerMapping.find((qam: any) =>
            qam.questionText.toLowerCase().includes(question.toLowerCase().slice(0, 30)) ||
            question.toLowerCase().includes(qam.questionText.toLowerCase().slice(0, 30))
        );

        if (questionMapping?.recommendedAnalyses) {
            // Map analysis IDs to analysis type names
            const analysisPath = analysisResults.questionAnswerMapping?.[0]?.recommendedAnalyses || [];
            return questionMapping.recommendedAnalyses.map((aId: string) => {
                // Try to find analysis name from analysisPath
                const analysis = analysisPath.find((a: any) => a.analysisId === aId);
                return analysis?.analysisName || aId;
            });
        }

        return [];
    }

    /**
     * Parse questions from various formats
     * Uses normalizeQuestions to handle object/string mix (fixes: question.toLowerCase crash)
     */
    private static parseQuestions(input: string | string[] | unknown): string[] {
        // Use the centralized normalizer to handle all edge cases
        const normalized = normalizeQuestions(input);

        // Additional parsing for string input that might contain multiple questions
        if (typeof input === 'string' && input.trim()) {
            const questions = input
                .split(/\n|;|\d+\.\s/)
                .map(q => q.trim())
                .filter(q => q.length > 0 && q !== '');
            return questions;
        }

        return normalized;
    }

    /**
     * Store Q&A results in project - saves to BOTH legacy JSONB and normalized tables
     */
    private static async storeQuestionAnswers(
        projectId: string,
        result: QuestionAnswerResult
    ): Promise<void> {
        try {
            const project = await storage.getProject(projectId);
            if (!project) return;

            // Legacy storage - still write to project.analysisResults for compatibility
            const updatedResults = {
                ...(project.analysisResults || {}),
                questionAnswers: result
            };

            await storage.updateProject(projectId, {
                analysisResults: updatedResults as any
            });

            // ============================================
            // SAVE TO project_questions TABLE
            // NOTE: Answers/evidence stored directly in projectQuestions table
            // (normalized tables questionAnswers, evidenceChain were planned but not created)
            // ============================================
            try {
                for (let i = 0; i < result.answers.length; i++) {
                    const qa = result.answers[i];

                    // Generate stable question ID based on project + question text
                    const questionHash = crypto.createHash('sha256')
                        .update(qa.question.toLowerCase().trim())
                        .digest('hex')
                        .substring(0, 8);
                    const questionId = `q_${projectId.substring(0, 8)}_${i}_${questionHash}`;

                    // Build evidence object combining all evidence sources
                    const evidenceData = {
                        sources: qa.sources,
                        relatedInsights: qa.relatedInsights,
                        evidenceInsights: qa.evidenceInsights || [],
                        dataElementsUsed: qa.dataElementsUsed || [],
                        analysisTypes: qa.analysisTypes || [],
                        generatedBy: result.generatedBy,
                    };

                    // Check if question already exists
                    const existingQuestion = await db.select()
                        .from(projectQuestions)
                        .where(eq(projectQuestions.id, questionId))
                        .limit(1);

                    if (existingQuestion.length === 0) {
                        // Insert new question with answer
                        await db.insert(projectQuestions).values({
                            id: questionId,
                            projectId: projectId,
                            questionText: qa.question,
                            questionOrder: i,
                            status: qa.status === 'answered' ? 'answered' : qa.status === 'partial' ? 'partial' : 'pending',
                            answer: qa.answer,
                            evidence: evidenceData,
                            confidenceScore: qa.confidence,
                            answeredAt: qa.status === 'answered' ? new Date() : null,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                    } else {
                        // Update existing question with answer
                        await db.update(projectQuestions)
                            .set({
                                status: qa.status === 'answered' ? 'answered' : qa.status === 'partial' ? 'partial' : 'pending',
                                answer: qa.answer,
                                evidence: evidenceData,
                                confidenceScore: qa.confidence,
                                answeredAt: qa.status === 'answered' ? new Date() : null,
                                updatedAt: new Date(),
                            })
                            .where(eq(projectQuestions.id, questionId));
                    }
                }

                console.log(`✅ Saved ${result.answers.length} Q&A pairs to project_questions table`);
            } catch (normalizedError) {
                console.error('Failed to save to project_questions table (non-blocking):', normalizedError);
                // Don't throw - legacy storage succeeded
            }

            console.log(`💾 Stored ${result.answers.length} Q&A pairs in project ${projectId}`);
        } catch (error) {
            console.error('Failed to store question answers:', error);
        }
    }

    /**
     * Retrieve stored Q&A results - reads from project_questions table first, fallback to legacy
     */
    static async getQuestionAnswers(projectId: string): Promise<QuestionAnswerResult | null> {
        try {
            // Try project_questions table first (answers stored directly in this table)
            const questions = await db.select()
                .from(projectQuestions)
                .where(eq(projectQuestions.projectId, projectId))
                .orderBy(projectQuestions.questionOrder);

            if (questions.length > 0) {
                const answers: QuestionAnswer[] = [];

                for (const q of questions) {
                    // Extract evidence data from the evidence JSONB column
                    const evidenceData = (q.evidence as any) || {};

                    answers.push({
                        question: q.questionText,
                        answer: q.answer || '',
                        confidence: q.confidenceScore || 0,
                        sources: evidenceData.sources || [],
                        relatedInsights: evidenceData.relatedInsights || [],
                        status: (q.status as 'answered' | 'partial' | 'pending') || 'pending',
                        generatedAt: q.answeredAt || q.updatedAt || new Date(),
                        evidenceInsights: evidenceData.evidenceInsights || [],
                        dataElementsUsed: evidenceData.dataElementsUsed || [],
                        analysisTypes: evidenceData.analysisTypes || [],
                    });
                }

                const answeredCount = answers.filter(a => a.status === 'answered').length;

                return {
                    projectId,
                    answers,
                    generatedBy: 'project-questions-table',
                    generatedAt: new Date(),
                    totalQuestions: questions.length,
                    answeredCount,
                };
            }

            // Fallback to legacy storage
            const project = await storage.getProject(projectId);
            if (!project || !project.analysisResults) {
                return null;
            }

            const results = project.analysisResults as any;
            return results.questionAnswers || null;
        } catch (error) {
            console.error('Failed to retrieve question answers:', error);
            return null;
        }
    }

    /**
     * Get questions for a project from normalized tables
     */
    static async getProjectQuestions(projectId: string): Promise<Array<{
        id: string;
        questionText: string;
        questionOrder: number;
        status: string;
        createdAt: Date;
    }>> {
        try {
            const questions = await db.select()
                .from(projectQuestions)
                .where(eq(projectQuestions.projectId, projectId))
                .orderBy(projectQuestions.questionOrder);

            return questions.map((q: any) => ({
                id: q.id,
                questionText: q.questionText,
                questionOrder: q.questionOrder || 0,
                status: q.status || 'pending',
                createdAt: q.createdAt || new Date(),
            }));
        } catch (error) {
            console.error('Failed to get project questions:', error);
            return [];
        }
    }

    /**
     * Create or update questions for a project
     */
    static async saveProjectQuestions(
        projectId: string,
        questions: string[]
    ): Promise<Array<{ id: string; questionText: string; questionOrder: number }>> {
        const savedQuestions: Array<{ id: string; questionText: string; questionOrder: number }> = [];

        try {
            for (let i = 0; i < questions.length; i++) {
                const questionText = questions[i].trim();
                if (!questionText) continue;

                // Generate stable question ID
                const questionHash = crypto.createHash('sha256')
                    .update(questionText.toLowerCase().trim())
                    .digest('hex')
                    .substring(0, 8);
                const questionId = `q_${projectId.substring(0, 8)}_${i}_${questionHash}`;

                // Check if question exists
                const existing = await db.select()
                    .from(projectQuestions)
                    .where(eq(projectQuestions.id, questionId))
                    .limit(1);

                if (existing.length === 0) {
                    await db.insert(projectQuestions).values({
                        id: questionId,
                        projectId: projectId,
                        questionText: questionText,
                        questionOrder: i,
                        status: 'pending',
                        createdAt: new Date(),
                    });
                } else {
                    // Update order if needed
                    await db.update(projectQuestions)
                        .set({ questionOrder: i })
                        .where(eq(projectQuestions.id, questionId));
                }

                savedQuestions.push({
                    id: questionId,
                    questionText: questionText,
                    questionOrder: i,
                });
            }

            console.log(`✅ Saved ${savedQuestions.length} questions to normalized tables for project ${projectId}`);
        } catch (error) {
            console.error('Failed to save project questions:', error);
        }

        return savedQuestions;
    }

    /**
     * Get a single answer with full evidence chain
     * NOTE: Uses projectQuestions table which stores answers directly
     */
    static async getQuestionAnswer(
        projectId: string,
        questionId: string
    ): Promise<{
        question: { id: string; text: string; status: string };
        answer: { id: string; text: string; confidence: number; generatedAt: Date } | null;
        evidence: Array<{ type: string; sourceId: string; contribution: string }>;
    } | null> {
        try {
            // Get question (which also contains answer and evidence)
            const questionRows = await db.select()
                .from(projectQuestions)
                .where(and(
                    eq(projectQuestions.id, questionId),
                    eq(projectQuestions.projectId, projectId)
                ))
                .limit(1);

            if (questionRows.length === 0) {
                return null;
            }

            const q = questionRows[0];
            const evidenceData = (q.evidence as any) || {};

            // Extract answer from projectQuestions (stored directly in table)
            let answer = null;
            if (q.answer) {
                answer = {
                    id: questionId, // Use question ID since answers aren't in separate table
                    text: q.answer,
                    confidence: q.confidenceScore || 0,
                    generatedAt: q.answeredAt || q.updatedAt || new Date(),
                };
            }

            // Build evidence from the evidence JSONB column
            const evidence: Array<{ type: string; sourceId: string; contribution: string }> = [];

            // Add insight evidence
            if (evidenceData.evidenceInsights) {
                evidenceData.evidenceInsights.forEach((insightId: string, idx: number) => {
                    evidence.push({
                        type: 'insight',
                        sourceId: insightId,
                        contribution: `Supporting insight #${idx + 1}`,
                    });
                });
            }

            // Add data element evidence
            if (evidenceData.dataElementsUsed) {
                evidenceData.dataElementsUsed.forEach((element: string, idx: number) => {
                    evidence.push({
                        type: 'data_element',
                        sourceId: element,
                        contribution: `Data element: ${element}`,
                    });
                });
            }

            return {
                question: {
                    id: q.id,
                    text: q.questionText,
                    status: q.status || 'pending',
                },
                answer,
                evidence,
            };
        } catch (error) {
            console.error('Failed to get question answer:', error);
            return null;
        }
    }
}
