// server/routes/ai.ts
import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { goalExtractionRequestSchema, GoalExtractionResponse, TechnicalQuery, TechnicalQueryType } from "../../shared/schema";
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import {
    MCPAIService,
    ChimaridataAI,
    TechnicalAIAgent,
    TimeSeriesAnalyzer,
    cloudConnectorService,
    chimaridataAI
} from '../services';
import { canUserRequestAIInsight } from '@shared/subscription-tiers';
import { BusinessAgent, type BusinessContext } from '../services/business-agent';
import { AIAccessControlService } from '../middleware/ai-access-control';
import { AIRouterService } from '../services/ai-router';
import { TechnicalAIFeatures } from '../services/technical-ai-features';
import { ConsultationAIService } from '../services/consultation-ai';

const router = Router();

const technicalAIAgent = new TechnicalAIAgent();
const businessAgent = new BusinessAgent();
const aiProvider = chimaridataAI || new ChimaridataAI();

const MAX_SAMPLE_ROWS = 12;
const MAX_SCHEMA_FIELDS = 24;
const MAX_CELL_LENGTH = 160;

type InsightHighlight = {
    title: string;
    description: string;
    type?: string;
    confidence?: number;
};

type StructuredInsights = {
    summary: string;
    answer?: string;
    highlights: InsightHighlight[];
    recommendations: string[];
    nextSteps: string[];
    followUps: string[];
    warnings: string[];
};

type InsightRecord = {
    mode: 'auto' | 'question';
    question?: string | null;
    provider: string;
    generatedAt: string;
    latencyMs: number;
    rawText: string;
    insights: StructuredInsights;
};

const isObject = (value: unknown): value is Record<string, any> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const ensureArray = <T>(value: unknown): T[] => {
    if (Array.isArray(value)) {
        return value as T[];
    }
    if (value === undefined || value === null || value === '') {
        return [];
    }
    return [value as T];
};

const clampConfidence = (value: unknown): number | undefined => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return undefined;
    }
    const clamped = Math.min(Math.max(value, 0), 1);
    return Math.round(clamped * 100) / 100;
};

const trimCellValue = (value: unknown): unknown => {
    if (typeof value === 'string' && value.length > MAX_CELL_LENGTH) {
        return `${value.slice(0, MAX_CELL_LENGTH)}…`;
    }
    return value;
};

const normalizeRow = (row: unknown): Record<string, unknown> | undefined => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        result[key] = trimCellValue(value);
    }
    return result;
};

const coerceJson = (value: unknown): unknown => {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    return value;
};

const buildSampleRows = (project: any, dataset: any): Record<string, unknown>[] => {
    const sources: unknown[] = [];
    if (dataset?.preview) {
        sources.push(dataset.preview);
    }
    if (dataset?.sampleRows) {
        sources.push(dataset.sampleRows);
    }
    if (project?.preview) {
        sources.push(project.preview);
    }
    if (project?.sampleData) {
        sources.push(project.sampleData);
    }
    if (project?.data) {
        sources.push(project.data);
    }

    for (const candidate of sources) {
        const parsed = coerceJson(candidate);
        if (Array.isArray(parsed) && parsed.length) {
            const normalized = parsed
                .map(normalizeRow)
                .filter((row): row is Record<string, unknown> => !!row)
                .slice(0, MAX_SAMPLE_ROWS);
            if (normalized.length) {
                return normalized;
            }
        }
    }

    return [];
};

const limitSchema = (schema: any) => {
    if (!isObject(schema)) {
        return undefined;
    }
    const entries = Object.entries(schema).slice(0, MAX_SCHEMA_FIELDS);
    return Object.fromEntries(entries);
};

const extractJsonSnippet = (text: string): any => {
    const trimmed = text.trim();
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const maybeJson = fencedMatch ? fencedMatch[1] : trimmed;
    try {
        return JSON.parse(maybeJson);
    } catch {
        const firstBrace = maybeJson.indexOf('{');
        const lastBrace = maybeJson.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const slice = maybeJson.slice(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(slice);
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
};

const normalizeStructuredInsights = (payload: any, fallbackSummary: string): StructuredInsights => {
    const summary = typeof payload?.summary === 'string' && payload.summary.trim().length
        ? payload.summary.trim()
        : fallbackSummary;
    const answer = typeof payload?.answer === 'string' && payload.answer.trim().length
        ? payload.answer.trim()
        : undefined;

    const highlightsSource = ensureArray<any>(payload?.highlights || payload?.insights || payload?.cards);
    const highlights: InsightHighlight[] = highlightsSource
        .map((item: any) => {
            if (!isObject(item)) {
                if (typeof item === 'string') {
                    return {
                        title: item.slice(0, 96),
                        description: item,
                    };
                }
                return undefined;
            }
            const title = typeof item.title === 'string' ? item.title.trim() : undefined;
            const description = typeof item.description === 'string'
                ? item.description.trim()
                : typeof item.detail === 'string'
                    ? item.detail.trim()
                    : typeof item.summary === 'string'
                        ? item.summary.trim()
                        : undefined;
            if (!title && !description) {
                return undefined;
            }
            return {
                title: title || (description ? description.slice(0, 96) : 'Insight'),
                description: description || title || 'Insight highlight',
                type: typeof item.type === 'string' ? item.type.toLowerCase() : undefined,
                confidence: clampConfidence(item.confidence ?? item.score ?? item.weight),
            };
        })
        .filter((value): value is InsightHighlight => !!value);

    const recommendations = ensureArray<string>(payload?.recommendations)
        .map(rec => (typeof rec === 'string' ? rec.trim() : ''))
        .filter(Boolean);
    const nextSteps = ensureArray<string>(payload?.nextSteps || payload?.actions)
        .map(step => (typeof step === 'string' ? step.trim() : ''))
        .filter(Boolean);
    const followUps = ensureArray<string>(payload?.followUps || payload?.followups || payload?.followupQuestions)
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);
    const warnings = ensureArray<string>(payload?.warnings || payload?.risks)
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean);

    return {
        summary,
        answer,
        highlights,
        recommendations,
        nextSteps,
        followUps,
        warnings,
    };
};

const buildInsightPrompt = (options: {
    role: string;
    question?: string;
    instructions?: string;
    recordCount?: number;
    schema: any;
    sampleRows: Record<string, unknown>[];
    summaryStats?: any;
    focusAreas: string[];
}): string => {
    const { role, question, instructions, recordCount, schema, sampleRows, summaryStats, focusAreas } = options;
    const schemaPreview = limitSchema(schema);
    const schemaNote = schemaPreview ? JSON.stringify(schemaPreview, null, 2) : 'Schema unavailable';
    const sampleNote = sampleRows.length ? JSON.stringify(sampleRows, null, 2) : 'No sample rows available';
    const statsNote = summaryStats ? JSON.stringify(summaryStats, null, 2) : 'No summary statistics available';
    const focusNote = focusAreas.length ? focusAreas.join(', ') : 'General overview';

    const requirement = `Respond with a single JSON object only (no markdown code fences) using this shape:
{
  "summary": string,
  "answer": string | null,
  "highlights": [
    {
      "title": string,
      "description": string,
      "type": "pattern" | "anomaly" | "quality" | "recommendation" | "risk" | "trend" | "other",
      "confidence": number // 0-1 with two decimal precision
    }
  ],
  "recommendations": string[],
  "nextSteps": string[],
  "followUps": string[],
  "warnings": string[]
}`;

    return [
        `Act as a ${role} providing concise, decision-ready insights.`,
        question ? `Address this question directly: ${question}` : 'No direct question provided; surface the three most impactful insights.',
        instructions ? `Additional instructions: ${instructions}` : undefined,
        `Dataset size: ${recordCount ?? 'Unknown'} records. Focus areas: ${focusNote}.`,
        `Schema preview:
${schemaNote}`,
        `Sample rows (${sampleRows.length}):
${sampleNote}`,
        `Summary statistics:
${statsNote}`,
        requirement,
        'If data is insufficient, explain the limitation under warnings and propose what is needed.',
    ]
        .filter(Boolean)
        .join('\n\n');
};

// Advanced analysis endpoints
// @deprecated — Use POST /api/analysis-execution/execute instead (comprehensive pipeline with Python scripts)
// This endpoint uses the legacy MCPAIService which does basic AI-only analysis without proper data pipeline.
router.post("/step-by-step-analysis",
    ensureAuthenticated,
    async (req: Request, res: Response) => {
        console.warn('[DEPRECATED] POST /api/ai/step-by-step-analysis called — use POST /api/analysis-execution/execute instead');
        res.status(410).json({
            error: 'This endpoint is deprecated. Use POST /api/analysis-execution/execute for comprehensive analysis.',
            deprecated: true,
            migration: 'POST /api/analysis-execution/execute with body: { projectId, analysisName, analysisType, config }'
        });
    });

// Time series analysis endpoint
router.post("/projects/:projectId/time-series", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
        const { projectId } = req.params;
        const config = req.body;
        const project = await storage.getProject(projectId);
        if (!project || !project.data) {
            return res.status(404).json({ error: "Project or data not found" });
        }
        const analyzer = new TimeSeriesAnalyzer();
        const result = await analyzer.analyzeTimeSeries(projectId, project.data, config);
        res.json({ success: true, projectId, result });
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to perform time series analysis' });
    }
});

// Cloud connector endpoints
router.post("/cloud/test-connection", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
        const config = req.body;
        const result = await cloudConnectorService.testConnection(config);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI insights endpoint
router.post("/ai-insights",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('basic_analysis'),
    AIAccessControlService.trackAIFeatureUsage('basic_analysis'),
    async (req: Request, res: Response) => {
        try {
            const { projectId } = req.body;
            if (!projectId) {
                return res.status(400).json({ error: "Project ID is required" });
            }
            const project = await storage.getProject(projectId);
            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }
            const dataset = await storage.getDatasetForProject(projectId);

            const role = typeof req.body.role === 'string' && req.body.role.trim().length
                ? req.body.role.trim()
                : 'data analyst';
            const question = typeof req.body.question === 'string' && req.body.question.trim().length
                ? req.body.question.trim()
                : undefined;
            const instructions = typeof req.body.instructions === 'string' && req.body.instructions.trim().length
                ? req.body.instructions.trim()
                : undefined;
            const focusInput = req.body.focusAreas ?? req.body.questions ?? [];
            const focusAreas = ensureArray<any>(focusInput)
                .map(item => {
                    if (typeof item === 'string') {
                        return item.trim();
                    }
                    if (item === undefined || item === null) {
                        return '';
                    }
                    if (typeof item === 'object') {
                        return JSON.stringify(item);
                    }
                    return String(item);
                })
                .filter(Boolean);

            const sampleRows = buildSampleRows(project, dataset);
            const schema = coerceJson(project.schema ?? dataset?.schema);
            const analysisResults = coerceJson((project as any).analysisResults ?? (dataset as any)?.analysisResults);
            const summaryStats = isObject(analysisResults) && analysisResults.summary ? analysisResults.summary : analysisResults;
            const recordCount = typeof project.recordCount === 'number'
                ? project.recordCount
                : typeof dataset?.recordCount === 'number'
                    ? dataset.recordCount
                    : sampleRows.length || undefined;

            const prompt = buildInsightPrompt({
                role,
                question,
                instructions,
                recordCount,
                schema,
                sampleRows,
                summaryStats,
                focusAreas,
            });

            const aiStart = Date.now();
            const aiResult = await aiProvider.generateInsights(
                {
                    recordCount,
                    schema,
                    sampleRows,
                    summaryStats,
                    focusAreas,
                    projectName: project.name,
                    journeyType: (project as any).journeyType,
                },
                question ? 'guided_question' : 'auto_overview',
                prompt
            );

            if (!aiResult.success) {
                return res.status(502).json({
                    success: false,
                    projectId,
                    provider: aiResult.provider,
                    error: aiResult.error || 'Unable to generate insights with available providers',
                });
            }

            const parsed = extractJsonSnippet(aiResult.insights);
            const structured = normalizeStructuredInsights(parsed, aiResult.insights.trim());
            if (question && !structured.answer) {
                structured.answer = structured.summary;
            }
            structured.highlights = structured.highlights.slice(0, 6);
            structured.recommendations = structured.recommendations.slice(0, 6);
            structured.nextSteps = structured.nextSteps.slice(0, 5);
            structured.followUps = structured.followUps.slice(0, 5);
            structured.warnings = structured.warnings.slice(0, 5);

            const latencyMs = Date.now() - aiStart;
            const generatedAt = new Date().toISOString();
            const mode: 'auto' | 'question' = question ? 'question' : 'auto';

            const record: InsightRecord = {
                mode,
                question: question ?? null,
                provider: aiResult.provider,
                generatedAt,
                latencyMs,
                rawText: aiResult.insights,
                insights: structured,
            };

            const existingState = isObject((project as any).aiInsights) ? ((project as any).aiInsights as Record<string, any>) : {};
            const existingHistory = Array.isArray(existingState.history)
                ? existingState.history.filter((entry: unknown) => isObject(entry)) as InsightRecord[]
                : [];
            const nextHistory = mode === 'question'
                ? [record, ...existingHistory].slice(0, 15)
                : existingHistory;
            const nextState: Record<string, unknown> = {
                ...existingState,
                lastUpdated: generatedAt,
                provider: aiResult.provider,
                history: nextHistory,
            };
            if (mode === 'auto') {
                nextState.auto = record;
            } else if (existingState.auto) {
                nextState.auto = existingState.auto;
            }

            await storage.updateProject(projectId, { aiInsights: nextState });

            res.json({
                success: true,
                projectId,
                mode,
                provider: aiResult.provider,
                question: question ?? null,
                insights: structured,
                rawText: aiResult.insights,
                latencyMs,
                generatedAt,
            });
        } catch (error: any) {
            console.error('Failed to generate AI insights', error);
            res.status(500).json({ error: 'Failed to generate AI insights' });
        }
    });

// AI role and actions endpoints
router.get("/ai-roles", (req: Request, res: Response) => {
    try {
        const roles = MCPAIService.getAvailableRoles();
        res.json({ roles });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// DEPRECATED: Technical AI Agent Routes
// Technical AI Agent is now only used internally by Data Scientist Agent
// These routes are kept for backward compatibility but should use Data Scientist Agent tools instead
router.get("/technical-ai/models", ensureAuthenticated, (req: Request, res: Response) => {
    try {
        // Note: Technical AI Agent is internal service, not exposed directly
        // Consider using Data Scientist Agent tools via MCP tool registry instead
        const models = technicalAIAgent.getAvailableModels();
        const capabilities = technicalAIAgent.getCapabilities();
        res.json({ 
            success: true, 
            models, 
            capabilities,
            deprecated: true,
            note: 'Technical AI Agent is an internal service. Use Data Scientist Agent tools instead.'
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Goal extraction endpoint
router.post("/analysis/extract-goals",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('basic_analysis'),
    AIAccessControlService.trackAIFeatureUsage('basic_analysis'),
    async (req: Request, res: Response) => {
        try {
            const requestData = goalExtractionRequestSchema.parse(req.body);
            const { userDescription, journeyType, context } = requestData;
            const userId = (req.user as any)?.id;
            const user = await storage.getUser(userId);
            // canUserRequestAIInsight expects (userTier, currentInsights)
            if (!canUserRequestAIInsight(user?.subscriptionTier || 'none', 0)) {
                return res.status(403).json({ success: false, error: "AI goal extraction requires a paid plan. Please upgrade your subscription." });
            }

            const startTime = Date.now();
            const extractedData = await businessAgent.extractGoals(userDescription, journeyType, (context || {}) as BusinessContext);

            const extractionId = `goal_${nanoid()}`;
            const response: GoalExtractionResponse = {
                success: true,
                extractionId,
                extractedGoals: extractedData.goals,
                businessQuestions: extractedData.questions,
                suggestedAnalysisPaths: extractedData.analysisPaths,
                dataRequirements: extractedData.dataRequirements,
                recommendedFeatures: extractedData.recommendedFeatures,
                aiProvider: 'chimaridata-ai',
                processingTimeMs: Date.now() - startTime
            };
            res.json(response);
        } catch (error: any) {
            if ((error as any).name === 'ZodError') {
                return res.status(400).json({ success: false, error: "Invalid request data", details: (error as any).errors });
            }
            res.status(500).json({ success: false, error: "Failed to extract goals.", details: error.message });
        }
    });

// New AI feature endpoints

// Code generation endpoint
router.post("/code/generate",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('code_generation'),
    AIAccessControlService.trackAIFeatureUsage('code_generation'),
    async (req: Request, res: Response) => {
        try {
            const { language, purpose, requirements, prompt } = req.body;
            const userId = (req.user as any)?.id;
            const subscriptionTier = (req.user as any)?.subscriptionTier;

            const codeRequest = {
                language,
                purpose,
                complexity: 'intermediate' as const,
                requirements: requirements || {},
                context: {}
            };

            const result = await TechnicalAIFeatures.generateCode(
                userId,
                subscriptionTier,
                codeRequest,
                prompt
            );

            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// Advanced analysis endpoint
router.post("/analysis/advanced",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('advanced_analysis'),
    AIAccessControlService.trackAIFeatureUsage('advanced_analysis'),
    async (req: Request, res: Response) => {
        try {
            const { analysisType, methodologies, dataContext, prompt } = req.body;
            const userId = (req.user as any)?.id;
            const subscriptionTier = (req.user as any)?.subscriptionTier;

            const analysisRequest = {
                analysisType,
                methodologies: methodologies || [],
                assumptions: [],
                validationRequirements: []
            };

            const result = await TechnicalAIFeatures.performAdvancedAnalysis(
                userId,
                subscriptionTier,
                analysisRequest,
                dataContext,
                prompt
            );

            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// Research assistance endpoint
router.post("/research/assist",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('research_assistance'),
    AIAccessControlService.trackAIFeatureUsage('research_assistance'),
    async (req: Request, res: Response) => {
        try {
            const { domain, researchQuestion, methodology, prompt } = req.body;
            const userId = (req.user as any)?.id;
            const subscriptionTier = (req.user as any)?.subscriptionTier;

            const researchRequest = {
                domain,
                researchQuestion,
                methodology: methodology || 'exploratory',
                existingLiterature: [],
                hypotheses: [],
                expectedOutcomes: []
            };

            const result = await TechnicalAIFeatures.conductResearch(
                userId,
                subscriptionTier,
                researchRequest,
                prompt
            );

            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// Consultation endpoint
router.post("/consultation/request",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('consultation_ai'),
    AIAccessControlService.trackAIFeatureUsage('consultation_ai'),
    async (req: Request, res: Response) => {
        try {
            const { context, request, prompt } = req.body;
            const userId = (req.user as any)?.id;
            const subscriptionTier = (req.user as any)?.subscriptionTier;

            const result = await ConsultationAIService.provideConsultation(
                userId,
                subscriptionTier,
                context,
                request,
                prompt
            );

            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// Strategic assessment endpoint
router.post("/consultation/assessment",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('consultation_ai'),
    AIAccessControlService.trackAIFeatureUsage('consultation_ai'),
    async (req: Request, res: Response) => {
        try {
            const { context, currentState, targetState, prompt } = req.body;
            const userId = (req.user as any)?.id;
            const subscriptionTier = (req.user as any)?.subscriptionTier;

            const result = await ConsultationAIService.conductStrategicAssessment(
                userId,
                subscriptionTier,
                context,
                currentState,
                targetState,
                prompt
            );

            res.json({ success: true, result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// AI features availability endpoint
router.get("/features/available", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        const userRole = (req.user as any)?.role || 'non-tech';
        const subscriptionTier = (req.user as any)?.subscriptionTier || 'none';

        const features = await AIAccessControlService.getAvailableFeatures(
            userId,
            userRole,
            subscriptionTier
        );

        res.json({ success: true, features });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// AI usage analytics endpoint
router.get("/analytics/usage", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
        const userId = (req.user as any)?.id;
        const period = req.query.period as 'day' | 'week' | 'month' || 'month';

        const analytics = await AIAccessControlService.getFeatureUsageAnalytics(
            userId,
            period
        );

        res.json({ success: true, analytics });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Chat query endpoint
router.post("/query",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('basic_analysis'),
    AIAccessControlService.trackAIFeatureUsage('basic_analysis'),
    async (req: Request, res: Response) => {
        try {
            const { projectId, query } = req.body;
            if (!projectId) {
                return res.status(400).json({ error: "Project ID is required" });
            }
            if (!query) {
                return res.status(400).json({ error: "Query is required" });
            }

            const project = await storage.getProject(projectId);
            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }
            const dataset = await storage.getDatasetForProject(projectId);

            // Reuse the logic from ai-insights but adapted for chat
            const role = 'data analyst';
            const question = query;
            const focusAreas: string[] = [];

            const sampleRows = buildSampleRows(project, dataset);
            const schema = coerceJson(project.schema ?? dataset?.schema);
            const analysisResults = coerceJson((project as any).analysisResults ?? (dataset as any)?.analysisResults);
            const summaryStats = isObject(analysisResults) && analysisResults.summary ? analysisResults.summary : analysisResults;
            const recordCount = typeof project.recordCount === 'number'
                ? project.recordCount
                : typeof dataset?.recordCount === 'number'
                    ? dataset.recordCount
                    : sampleRows.length || undefined;

            const prompt = buildInsightPrompt({
                role,
                question,
                recordCount,
                schema,
                sampleRows,
                summaryStats,
                focusAreas,
            });

            const aiResult = await aiProvider.generateInsights(
                {
                    recordCount,
                    schema,
                    sampleRows,
                    summaryStats,
                    focusAreas,
                    projectName: project.name,
                    journeyType: (project as any).journeyType,
                },
                'guided_question',
                prompt
            );

            if (!aiResult.success) {
                return res.status(502).json({
                    success: false,
                    projectId,
                    provider: aiResult.provider,
                    error: aiResult.error || 'Unable to generate response',
                });
            }

            // Parse the result to get the answer or summary
            const parsed = extractJsonSnippet(aiResult.insights);
            const structured = normalizeStructuredInsights(parsed, aiResult.insights.trim());
            const responseText = structured.answer || structured.summary || aiResult.insights;

            res.json({
                success: true,
                response: responseText,
                provider: aiResult.provider,
                usage: await (async () => {
                    // P1-3 FIX: Fetch real usage from UsageTrackingService
                    try {
                      const { UsageTrackingService } = await import('../services/usage-tracking');
                      const reqUserId = (req.user as any)?.id;
                      if (!reqUserId) return { remaining: 100, quota: 100, current: 0 };
                      const currentUsage = await UsageTrackingService.getCurrentUsage(reqUserId);
                      const limits = await UsageTrackingService.getUserLimits(reqUserId);
                      return {
                        remaining: Math.max(0, (limits.maxAiQueries || 100) - (currentUsage.aiQueries || 0)),
                        quota: limits.maxAiQueries || 100,
                        current: currentUsage.aiQueries || 0
                      };
                    } catch {
                      return { remaining: 100, quota: 100, current: 0 };
                    }
                  })()
            });
        } catch (error: any) {
            console.error('Failed to process AI query', error);
            res.status(500).json({ error: 'Failed to process AI query' });
        }
    });

/**
 * Interpret Natural Language Transformation
 * Converts user's natural language description into transformation code
 *
 * POST /api/ai/interpret-transformation
 * Body: {
 *   description: string,           // Natural language like "Average Q1, Q2, Q3 scores"
 *   elementName: string,           // Target element name (e.g., "engagement_score")
 *   sourceColumns: string[],       // Available columns in dataset
 *   schema: object,                // Dataset schema
 *   calculationDefinition?: object // DS agent's recommendation (optional)
 * }
 */
router.post("/interpret-transformation",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('basic_analysis'),
    AIAccessControlService.trackAIFeatureUsage('basic_analysis'),
    async (req: Request, res: Response) => {
        try {
            const {
                description,
                elementName,
                sourceColumns,
                schema,
                calculationDefinition,
                sampleData
            } = req.body;

            if (!description || typeof description !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Natural language description is required'
                });
            }

            if (!elementName) {
                return res.status(400).json({
                    success: false,
                    error: 'Element name is required'
                });
            }

            console.log(`🤖 [NL Transform] Interpreting: "${description}" for element: ${elementName}`);

            // Build context for the AI
            const contextParts: string[] = [
                `Target Data Element: ${elementName}`,
                `User's Description: "${description}"`,
            ];

            if (sourceColumns?.length) {
                contextParts.push(`Available Columns: ${sourceColumns.join(', ')}`);
            }

            if (schema) {
                const schemaStr = typeof schema === 'object'
                    ? JSON.stringify(limitSchema(schema), null, 2)
                    : String(schema);
                contextParts.push(`Dataset Schema:\n${schemaStr}`);
            }

            if (calculationDefinition) {
                contextParts.push(`Data Scientist Recommendation:\n${JSON.stringify(calculationDefinition, null, 2)}`);
            }

            if (sampleData?.length) {
                const sample = sampleData.slice(0, 3);
                contextParts.push(`Sample Data (first 3 rows):\n${JSON.stringify(sample, null, 2)}`);
            }

            const prompt = `You are a data transformation expert. Convert the following natural language description into executable transformation code.

${contextParts.join('\n\n')}

IMPORTANT REQUIREMENTS:
1. Generate JavaScript/TypeScript code that can be executed on each row of data
2. The code should be a function body that receives a 'row' object and returns the transformed value
3. Handle null/undefined values gracefully
4. If the description mentions averaging, counting, or aggregating multiple fields, generate appropriate code
5. If the Data Scientist recommendation is provided, use it as guidance for the calculation logic

EXAMPLES:
- "Average Q1, Q2, Q3 scores" → "const scores = [row.Q1, row.Q2, row.Q3].filter(v => v != null && !isNaN(v)); return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;"
- "Combine first and last name" → "return [row.first_name, row.last_name].filter(Boolean).join(' ');"
- "Calculate tenure in years" → "const hire = new Date(row.hire_date); const now = new Date(); return Math.floor((now - hire) / (365.25 * 24 * 60 * 60 * 1000));"
- "Flag as high engagement if score > 80" → "return row.engagement_score > 80 ? 'High' : 'Normal';"

Respond with ONLY a JSON object in this exact format:
{
  "transformationCode": "the JavaScript code as a string",
  "explanation": "brief explanation of what the code does",
  "sourceFieldsUsed": ["field1", "field2"],
  "outputType": "number" | "string" | "boolean" | "date",
  "confidence": 0.0 to 1.0
}`;

            const aiResult = await aiProvider.generateInsights(
                {
                    recordCount: sampleData?.length || 0,
                    schema: schema,
                    sampleRows: sampleData?.slice(0, 5) || [],
                    summaryStats: {},
                    focusAreas: ['transformation', 'data engineering'],
                    projectName: 'Transformation Interpreter',
                    journeyType: 'data_transformation',
                },
                'guided_question',
                prompt
            );

            if (!aiResult.success) {
                console.error(`❌ [NL Transform] AI failed:`, aiResult.error);
                return res.status(502).json({
                    success: false,
                    error: aiResult.error || 'Failed to interpret transformation',
                    provider: aiResult.provider
                });
            }

            // Parse the AI response
            const parsed = extractJsonSnippet(aiResult.insights);

            if (!parsed || !parsed.transformationCode) {
                console.error(`❌ [NL Transform] Failed to parse AI response:`, aiResult.insights);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to parse transformation code from AI response',
                    rawResponse: aiResult.insights
                });
            }

            console.log(`✅ [NL Transform] Generated code for ${elementName}:`, parsed.transformationCode.substring(0, 100) + '...');

            res.json({
                success: true,
                elementName,
                originalDescription: description,
                transformationCode: parsed.transformationCode,
                explanation: parsed.explanation || 'Transformation code generated from natural language',
                sourceFieldsUsed: parsed.sourceFieldsUsed || [],
                outputType: parsed.outputType || 'string',
                confidence: clampConfidence(parsed.confidence) || 0.7,
                provider: aiResult.provider
            });

        } catch (error: any) {
            console.error('❌ [NL Transform] Error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to interpret transformation'
            });
        }
    }
);

/**
 * Validate Transformation Code
 * Tests transformation code against sample data
 *
 * POST /api/ai/validate-transformation
 */
router.post("/validate-transformation",
    ensureAuthenticated,
    async (req: Request, res: Response) => {
        try {
            const { transformationCode, sampleData, elementName } = req.body;

            if (!transformationCode) {
                return res.status(400).json({
                    success: false,
                    error: 'Transformation code is required'
                });
            }

            if (!sampleData?.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Sample data is required for validation'
                });
            }

            console.log(`🧪 [Validate Transform] Testing code for ${elementName || 'element'}`);

            // Create a safe execution context
            const results: Array<{ input: any; output: any; error?: string }> = [];

            for (const row of sampleData.slice(0, 5)) {
                try {
                    // Create a function from the code
                    const transformFn = new Function('row', transformationCode);
                    const output = transformFn(row);
                    results.push({ input: row, output });
                } catch (execError: any) {
                    results.push({
                        input: row,
                        output: null,
                        error: execError.message
                    });
                }
            }

            const successCount = results.filter(r => !r.error).length;
            const isValid = successCount === results.length;

            console.log(`${isValid ? '✅' : '⚠️'} [Validate Transform] ${successCount}/${results.length} rows processed successfully`);

            res.json({
                success: true,
                isValid,
                results,
                summary: {
                    totalRows: results.length,
                    successCount,
                    errorCount: results.length - successCount,
                    sampleOutputs: results.slice(0, 3).map(r => r.output)
                }
            });

        } catch (error: any) {
            console.error('❌ [Validate Transform] Error:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to validate transformation'
            });
        }
    }
);

export default router;
