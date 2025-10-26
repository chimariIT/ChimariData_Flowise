/**
 * Template Onboarding API Routes
 *
 * RESTful API for business template research and onboarding
 */

import { Router, Request, Response } from 'express';
import { templateResearchAgent, TemplateResearchRequest } from '../services/template-research-agent';
import { BusinessTemplates, businessTemplateLibrary } from '../services/business-templates';

const router = Router();

/**
 * POST /api/template-onboarding/research
 * Research and generate a new business template
 */
router.post('/research', async (req: Request, res: Response) => {
    try {
        const request: TemplateResearchRequest = req.body;

        console.log('Template research request:', request);

        const researched = await templateResearchAgent.researchTemplate(request);

        res.json({
            success: true,
            template: researched.template,
            metadata: {
                confidence: researched.confidence,
                marketDemand: researched.marketDemand,
                implementationComplexity: researched.implementationComplexity,
                estimatedPopularity: researched.estimatedPopularity,
                researchSources: researched.researchSources
            }
        });
    } catch (error: any) {
        console.error('Template research error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to research template'
        });
    }
});

/**
 * POST /api/template-onboarding/generate-from-description
 * Generate template from natural language description
 */
router.post('/generate-from-description', async (req: Request, res: Response) => {
    try {
        const { description, industry } = req.body;

        if (!description) {
            return res.status(400).json({
                success: false,
                error: 'Description is required'
            });
        }

        console.log('Generating template from description:', description);

        const researched = await templateResearchAgent.generateTemplateFromDescription(description, industry);

        res.json({
            success: true,
            template: researched.template,
            metadata: {
                confidence: researched.confidence,
                marketDemand: researched.marketDemand,
                implementationComplexity: researched.implementationComplexity,
                estimatedPopularity: researched.estimatedPopularity,
                researchSources: researched.researchSources
            }
        });
    } catch (error: any) {
        console.error('Template generation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to generate template'
        });
    }
});

/**
 * POST /api/template-onboarding/validate
 * Validate and onboard a template
 */
router.post('/validate', async (req: Request, res: Response) => {
    try {
        const { template, metadata } = req.body;

        if (!template) {
            return res.status(400).json({
                success: false,
                error: 'Template is required'
            });
        }

        console.log('Validating template:', template.templateId);

        const researched = {
            template,
            confidence: metadata?.confidence || 0.7,
            researchSources: metadata?.researchSources || [],
            marketDemand: metadata?.marketDemand || 'medium',
            implementationComplexity: metadata?.implementationComplexity || 'medium',
            estimatedPopularity: metadata?.estimatedPopularity || 70
        };

        const onboarding = await templateResearchAgent.onboardTemplate(researched);

        res.json({
            success: true,
            onboarding
        });
    } catch (error: any) {
        console.error('Template validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to validate template'
        });
    }
});

/**
 * POST /api/template-onboarding/approve
 * Approve and register a template
 */
router.post('/approve', async (req: Request, res: Response) => {
    try {
        const { template } = req.body;

        if (!template) {
            return res.status(400).json({
                success: false,
                error: 'Template is required'
            });
        }

        // Validate template completeness
        if (!template.templateId || !template.name || !template.domain) {
            return res.status(400).json({
                success: false,
                error: 'Template is missing required fields'
            });
        }

        console.log('Approving template:', template.templateId);

        // Add default popularity if not provided
        if (template.popularity === undefined) {
            template.popularity = 70;
        }

        // Register template
        businessTemplateLibrary.registerTemplate(template);

        res.json({
            success: true,
            templateId: template.templateId,
            message: 'Template approved and registered successfully'
        });
    } catch (error: any) {
        console.error('Template approval error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to approve template'
        });
    }
});

/**
 * GET /api/template-onboarding/suggestions
 * Get template suggestions based on industry
 */
router.get('/suggestions', async (req: Request, res: Response) => {
    try {
        const { industry } = req.query;

        const suggestions = [
            {
                useCase: 'Customer Lifetime Value Prediction',
                description: 'Predict customer lifetime value using historical purchase data',
                industry: industry || 'retail',
                complexity: 'intermediate',
                estimatedDemand: 'high'
            },
            {
                useCase: 'Sentiment Analysis Dashboard',
                description: 'Analyze customer sentiment from reviews and social media',
                industry: industry || 'marketing',
                complexity: 'beginner',
                estimatedDemand: 'high'
            },
            {
                useCase: 'Supply Chain Optimization',
                description: 'Optimize supply chain logistics and reduce costs',
                industry: industry || 'manufacturing',
                complexity: 'advanced',
                estimatedDemand: 'medium'
            },
            {
                useCase: 'Employee Wellness Analysis',
                description: 'Analyze employee wellness metrics and predict health risks',
                industry: 'hr',
                complexity: 'intermediate',
                estimatedDemand: 'medium'
            },
            {
                useCase: 'Real-time Fraud Detection',
                description: 'Detect fraudulent transactions in real-time using ML',
                industry: 'finance',
                complexity: 'advanced',
                estimatedDemand: 'high'
            }
        ];

        res.json({
            success: true,
            suggestions: industry
                ? suggestions.filter(s => s.industry === industry)
                : suggestions
        });
    } catch (error: any) {
        console.error('Template suggestions error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get suggestions'
        });
    }
});

/**
 * GET /api/template-onboarding/common-use-cases
 * Get common use cases by industry
 */
router.get('/common-use-cases/:industry', async (req: Request, res: Response) => {
    try {
        const { industry } = req.params;

        // This would ideally come from the research agent's knowledge base
        const useCasesByIndustry: Record<string, string[]> = {
            'retail': [
                'Customer lifetime value prediction',
                'Inventory optimization',
                'Price elasticity analysis',
                'Store location analysis',
                'Product recommendation engine'
            ],
            'finance': [
                'Loan default prediction',
                'Risk portfolio analysis',
                'Customer credit scoring',
                'Fraud pattern detection',
                'Market sentiment analysis'
            ],
            'healthcare': [
                'Patient readmission prediction',
                'Disease outbreak forecasting',
                'Treatment effectiveness analysis',
                'Resource allocation optimization'
            ],
            'hr': [
                'Talent acquisition optimization',
                'Skills gap analysis',
                'Employee engagement prediction',
                'Succession planning',
                'Training effectiveness analysis'
            ],
            'manufacturing': [
                'Predictive maintenance',
                'Quality control optimization',
                'Supply chain optimization',
                'Production yield forecasting'
            ],
            'marketing': [
                'Campaign ROI optimization',
                'Customer segmentation',
                'Lead scoring',
                'Content performance analysis'
            ],
            'technology': [
                'User behavior analytics',
                'System performance optimization',
                'Security threat detection',
                'Feature adoption analysis'
            ]
        };

        const useCases = useCasesByIndustry[industry] || [];

        res.json({
            success: true,
            industry,
            useCases
        });
    } catch (error: any) {
        console.error('Use cases error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get use cases'
        });
    }
});

export default router;
