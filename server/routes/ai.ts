// server/routes/ai.ts
import { Router, type Request, type Response } from 'express';
import { goalExtractionRequestSchema, GoalExtractionResponse, TechnicalQuery, TechnicalQueryType } from "../../shared/schema";
import { storage } from '../services/storage';
import { ensureAuthenticated } from './auth';
import {
    MCPAIService,
    ChimaridataAI,
    TechnicalAIAgent,
    TimeSeriesAnalyzer,
    cloudConnectorService
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

// Advanced analysis endpoints
router.post("/step-by-step-analysis",
    ensureAuthenticated,
    AIAccessControlService.validateAIFeatureAccess('advanced_analysis'),
    AIAccessControlService.trackAIFeatureUsage('advanced_analysis'),
    async (req: Request, res: Response) => {
    try {
        const { projectId, analysisType, analysisPath, config } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required" });
        }
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }
        const result = await MCPAIService.performStepByStepAnalysis(project, analysisType, analysisPath, config);
        await storage.updateProject(projectId, {
            [`analysis_${analysisType}`]: {
                question: config.question,
                targetVariable: config.targetVariable,
                multivariateVariables: config.multivariateVariables,
                analysisType: config.analysisType,
                results: result,
                analysisPath: analysisPath,
            }
        });
        res.json({ success: true, result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
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
        const { projectId, role, questions, instructions } = req.body;
        if (!projectId) {
            return res.status(400).json({ error: "Project ID is required" });
        }
        const project = await storage.getProject(projectId);
        if (!project) {
            return res.status(404).json({ error: "Project not found" });
        }
        const mockInsights = {
            role: role || 'data_analyst',
            insights: [
                `Based on the ${role || 'data analyst'} perspective, here are key insights:`,
                `The dataset contains ${project.recordCount || 0} records with ${Object.keys(project.schema || {}).length} variables.`,
                `Recommended analysis approaches: ${questions?.join(', ') || 'descriptive statistics, correlation analysis'}.`,
                `Data quality appears good with structured fields and appropriate data types.`
            ],
            recommendations: [
                'Consider performing correlation analysis to identify relationships',
                'Run descriptive statistics to understand data distribution',
                'Check for outliers that might affect analysis results'
            ],
            nextSteps: instructions ? [instructions] : [
                'Define specific research questions',
                'Select appropriate analysis methods',
                'Validate findings with domain experts'
            ]
        };
        res.json({ success: true, projectId, insights: mockInsights });
    } catch (error: any) {
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

// Technical AI Agent Routes
router.get("/technical-ai/models", ensureAuthenticated, (req: Request, res: Response) => {
    try {
        const models = technicalAIAgent.getAvailableModels();
        const capabilities = technicalAIAgent.getCapabilities();
        res.json({ success: true, models, capabilities });
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

        const extractionId = `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

export default router;
