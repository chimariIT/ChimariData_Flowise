/**
 * Business Template Research Agent
 *
 * Automated agent for researching and generating new business analysis templates
 * based on industry best practices, common use cases, and emerging business needs.
 */

import { BusinessDomain, AnalysisGoal, BusinessTemplate, TemplateWorkflowStep, TemplateDataField, TemplateVisualization, TemplateDeliverable } from './business-templates';
import { nanoid } from 'nanoid';

export interface TemplateResearchRequest {
    industry?: BusinessDomain;
    useCase?: string;
    businessGoals?: string[];
    keywords?: string[];
    complexityLevel?: 'beginner' | 'intermediate' | 'advanced';
}

export interface ResearchedTemplate {
    template: Partial<BusinessTemplate>;
    confidence: number;
    researchSources: string[];
    marketDemand: 'low' | 'medium' | 'high';
    implementationComplexity: 'low' | 'medium' | 'high';
    estimatedPopularity: number;
}

export interface TemplateOnboardingResult {
    templateId: string;
    status: 'draft' | 'review_needed' | 'approved' | 'rejected';
    validationErrors: string[];
    recommendations: string[];
    estimatedImpact: {
        potentialUsers: number;
        industryRelevance: number;
        uniqueness: number;
    };
}

export class TemplateResearchAgent {
    private industryKnowledge: Map<BusinessDomain, string[]> = new Map();
    private commonUseCases: Map<BusinessDomain, string[]> = new Map();
    private analysisPatterns: Map<string, TemplateWorkflowStep[]> = new Map();

    constructor() {
        this.initializeKnowledgeBase();
    }

    /**
     * Initialize industry knowledge and common patterns
     */
    private initializeKnowledgeBase(): void {
        // Industry-specific use cases
        this.commonUseCases.set('retail', [
            'Customer lifetime value prediction',
            'Inventory optimization',
            'Price elasticity analysis',
            'Store location analysis',
            'Product recommendation engine',
            'Seasonal demand forecasting',
            'Customer churn prediction',
            'Basket analysis'
        ]);

        this.commonUseCases.set('finance', [
            'Loan default prediction',
            'Algorithmic trading strategy',
            'Risk portfolio analysis',
            'Customer credit scoring',
            'Fraud pattern detection',
            'Regulatory compliance monitoring',
            'Market sentiment analysis',
            'Cash flow forecasting'
        ]);

        this.commonUseCases.set('healthcare', [
            'Patient readmission prediction',
            'Disease outbreak forecasting',
            'Treatment effectiveness analysis',
            'Resource allocation optimization',
            'Medical imaging analysis',
            'Clinical trial optimization',
            'Patient risk stratification',
            'Healthcare cost prediction'
        ]);

        this.commonUseCases.set('hr', [
            'Talent acquisition optimization',
            'Skills gap analysis',
            'Employee engagement prediction',
            'Succession planning',
            'Training effectiveness analysis',
            'Diversity and inclusion metrics',
            'Remote work productivity analysis',
            'Compensation benchmarking'
        ]);

        this.commonUseCases.set('manufacturing', [
            'Predictive maintenance',
            'Quality control optimization',
            'Supply chain optimization',
            'Production yield forecasting',
            'Equipment failure prediction',
            'Energy consumption optimization',
            'Defect detection',
            'Demand-driven production planning'
        ]);

        this.commonUseCases.set('marketing', [
            'Campaign ROI optimization',
            'Customer segmentation',
            'Lead scoring',
            'Content performance analysis',
            'Attribution modeling',
            'Social media sentiment analysis',
            'Marketing mix modeling',
            'Customer journey analysis'
        ]);

        this.commonUseCases.set('technology', [
            'User behavior analytics',
            'System performance optimization',
            'Security threat detection',
            'Feature adoption analysis',
            'API usage forecasting',
            'Code quality analysis',
            'Tech debt assessment',
            'DevOps metrics analysis'
        ]);

        // Common analysis patterns
        this.analysisPatterns.set('predictive_ml', [
            {
                stepId: 'data_preparation',
                name: 'Data Preparation',
                component: 'transformation',
                config: {
                    imputation: { strategy: 'median' },
                    outliers: { method: 'iqr', action: 'cap' },
                    normalization: { method: 'min-max' }
                },
                checkpointQuestions: ['Review data quality', 'Confirm feature selection']
            },
            {
                stepId: 'feature_engineering',
                name: 'Feature Engineering',
                component: 'transformation',
                config: { featureGeneration: true },
                checkpointQuestions: ['Review engineered features']
            },
            {
                stepId: 'model_training',
                name: 'Model Training',
                component: 'ml_training',
                config: { algorithm: 'auto', crossValidation: true },
                checkpointQuestions: ['Review model performance', 'Approve deployment']
            }
        ]);

        this.analysisPatterns.set('time_series', [
            {
                stepId: 'historical_analysis',
                name: 'Historical Trend Analysis',
                component: 'statistical_analysis',
                config: { analysisType: 'timeseries_decomposition' },
                checkpointQuestions: ['Review seasonal patterns']
            },
            {
                stepId: 'forecasting',
                name: 'Forecasting',
                component: 'ml_training',
                config: { algorithm: 'prophet' },
                checkpointQuestions: ['Approve forecast methodology']
            }
        ]);

        this.analysisPatterns.set('clustering', [
            {
                stepId: 'data_normalization',
                name: 'Data Normalization',
                component: 'transformation',
                config: { normalization: { method: 'z-score' } },
                checkpointQuestions: ['Review normalization approach']
            },
            {
                stepId: 'clustering',
                name: 'Clustering Analysis',
                component: 'ml_training',
                config: { algorithm: 'kmeans' },
                checkpointQuestions: ['Review optimal cluster count']
            }
        ]);

        console.log('Template Research Agent: Knowledge base initialized');
    }

    /**
     * Research and generate template based on request
     */
    async researchTemplate(request: TemplateResearchRequest): Promise<ResearchedTemplate> {
        console.log('Researching template for:', request);

        // Step 1: Identify relevant use case
        const useCase = this.identifyUseCase(request);

        // Step 2: Determine analysis pattern
        const analysisPattern = this.determineAnalysisPattern(useCase, request);

        // Step 3: Generate workflow steps
        const workflow = this.generateWorkflow(analysisPattern, request);

        // Step 4: Identify required data fields
        const dataFields = this.identifyRequiredDataFields(useCase, request);

        // Step 5: Determine visualizations
        const visualizations = this.determineVisualizations(useCase, analysisPattern);

        // Step 6: Define deliverables
        const deliverables = this.defineDeliverables(useCase, request);

        // Step 7: Map business goals
        const goals = this.mapBusinessGoals(request);

        // Generate template
        const template: Partial<BusinessTemplate> = {
            templateId: `${request.industry}_${this.slugify(useCase)}`,
            name: this.generateTemplateName(useCase),
            description: this.generateDescription(useCase, request),
            domain: request.industry,
            goals: goals,
            workflow: workflow,
            requiredDataFields: dataFields,
            visualizations: visualizations,
            deliverables: deliverables,
            complexity: request.complexityLevel || 'intermediate',
            tags: this.generateTags(useCase, request)
        };

        // Calculate confidence and demand
        const confidence = this.calculateConfidence(template, request);
        const marketDemand = this.assessMarketDemand(useCase, request);
        const implementationComplexity = this.assessImplementationComplexity(workflow);
        const estimatedPopularity = this.estimatePopularity(marketDemand, implementationComplexity);

        return {
            template,
            confidence,
            researchSources: this.getResearchSources(request),
            marketDemand,
            implementationComplexity,
            estimatedPopularity
        };
    }

    /**
     * Onboard a researched template with validation
     */
    async onboardTemplate(researched: ResearchedTemplate): Promise<TemplateOnboardingResult> {
        const template = researched.template;
        const validationErrors: string[] = [];
        const recommendations: string[] = [];

        // Validation checks
        if (!template.templateId) validationErrors.push('Template ID is required');
        if (!template.name) validationErrors.push('Template name is required');
        if (!template.description) validationErrors.push('Description is required');
        if (!template.domain) validationErrors.push('Domain is required');
        if (!template.goals || template.goals.length === 0) validationErrors.push('At least one goal is required');
        if (!template.workflow || template.workflow.length === 0) validationErrors.push('Workflow steps are required');
        if (!template.requiredDataFields || template.requiredDataFields.length === 0) {
            validationErrors.push('Required data fields are required');
        }

        // Quality checks
        if (template.workflow && template.workflow.length < 3) {
            recommendations.push('Consider adding more workflow steps for comprehensive analysis');
        }

        if (template.requiredDataFields && template.requiredDataFields.length < 4) {
            recommendations.push('Add more data fields to enable richer analysis');
        }

        if (!template.visualizations || template.visualizations.length < 2) {
            recommendations.push('Add more visualizations for better insights');
        }

        // Estimate impact
        const estimatedImpact = {
            potentialUsers: this.estimatePotentialUsers(template, researched.marketDemand),
            industryRelevance: this.calculateIndustryRelevance(template),
            uniqueness: this.calculateUniqueness(template)
        };

        // Determine status
        let status: TemplateOnboardingResult['status'];
        if (validationErrors.length > 0) {
            status = 'rejected';
        } else if (recommendations.length > 2 || researched.confidence < 0.7) {
            status = 'review_needed';
        } else if (researched.confidence >= 0.85 && estimatedImpact.industryRelevance >= 80) {
            status = 'approved';
        } else {
            status = 'draft';
        }

        return {
            templateId: template.templateId || 'unknown',
            status,
            validationErrors,
            recommendations,
            estimatedImpact
        };
    }

    /**
     * Generate a complete template from natural language description
     */
    async generateTemplateFromDescription(description: string, industry?: BusinessDomain): Promise<ResearchedTemplate> {
        // Extract keywords from description
        const keywords = this.extractKeywords(description);

        // Infer industry if not provided
        const inferredIndustry = industry || this.inferIndustry(description, keywords);

        // Infer goals
        const businessGoals = this.inferGoals(description, keywords);

        // Create research request
        const request: TemplateResearchRequest = {
            industry: inferredIndustry,
            useCase: description,
            businessGoals,
            keywords,
            complexityLevel: this.inferComplexity(description)
        };

        return this.researchTemplate(request);
    }

    // ============================================================================
    // HELPER METHODS
    // ============================================================================

    private identifyUseCase(request: TemplateResearchRequest): string {
        if (request.useCase) return request.useCase;

        // Find most relevant use case based on keywords and industry
        const useCases = this.commonUseCases.get(request.industry!) || [];
        if (useCases.length === 0) return 'Custom Analysis';

        // Simple matching based on keywords
        if (request.keywords && request.keywords.length > 0) {
            for (const useCase of useCases) {
                const useCaseLower = useCase.toLowerCase();
                if (request.keywords.some(kw => useCaseLower.includes(kw.toLowerCase()))) {
                    return useCase;
                }
            }
        }

        return useCases[0]; // Default to first use case
    }

    private determineAnalysisPattern(useCase: string, request: TemplateResearchRequest): string {
        const useCaseLower = useCase.toLowerCase();

        if (useCaseLower.includes('predict') || useCaseLower.includes('forecast')) {
            if (useCaseLower.includes('time') || useCaseLower.includes('trend') || useCaseLower.includes('seasonal')) {
                return 'time_series';
            }
            return 'predictive_ml';
        }

        if (useCaseLower.includes('segment') || useCaseLower.includes('cluster') || useCaseLower.includes('group')) {
            return 'clustering';
        }

        if (useCaseLower.includes('optimization') || useCaseLower.includes('optimize')) {
            return 'predictive_ml';
        }

        return 'predictive_ml'; // Default
    }

    private generateWorkflow(pattern: string, request: TemplateResearchRequest): TemplateWorkflowStep[] {
        const baseWorkflow = this.analysisPatterns.get(pattern) || [];

        // Clone and customize
        return baseWorkflow.map(step => ({
            ...step,
            stepId: `${step.stepId}_${nanoid(6)}`
        }));
    }

    private identifyRequiredDataFields(useCase: string, request: TemplateResearchRequest): TemplateDataField[] {
        const fields: TemplateDataField[] = [
            {
                fieldName: 'id',
                dataType: 'string',
                description: 'Unique identifier',
                example: 'ID_001'
            },
            {
                fieldName: 'timestamp',
                dataType: 'date',
                description: 'Record timestamp',
                example: '2024-01-01'
            }
        ];

        // Add domain-specific fields based on use case
        const useCaseLower = useCase.toLowerCase();

        if (useCaseLower.includes('customer') || useCaseLower.includes('user')) {
            fields.push({
                fieldName: 'customer_id',
                dataType: 'string',
                description: 'Customer identifier',
                example: 'CUST_12345'
            });
        }

        if (useCaseLower.includes('revenue') || useCaseLower.includes('sales') || useCaseLower.includes('financial')) {
            fields.push({
                fieldName: 'amount',
                dataType: 'number',
                description: 'Transaction amount',
                example: '1234.56'
            });
        }

        if (useCaseLower.includes('product') || useCaseLower.includes('item')) {
            fields.push({
                fieldName: 'product_id',
                dataType: 'string',
                description: 'Product identifier',
                example: 'PROD_789'
            });
        }

        return fields;
    }

    private determineVisualizations(useCase: string, pattern: string): TemplateVisualization[] {
        const visualizations: TemplateVisualization[] = [];

        // Always include distribution
        visualizations.push({
            type: 'bar',
            title: 'Distribution Analysis',
            xAxis: 'category',
            yAxis: 'count'
        });

        // Pattern-specific visualizations
        if (pattern === 'time_series') {
            visualizations.push({
                type: 'line',
                title: 'Time Series Trend',
                xAxis: 'date',
                yAxis: 'value'
            });
        }

        if (pattern === 'clustering') {
            visualizations.push({
                type: 'scatter',
                title: 'Cluster Visualization',
                xAxis: 'feature1',
                yAxis: 'feature2'
            });
        }

        if (pattern === 'predictive_ml') {
            visualizations.push({
                type: 'scatter',
                title: 'Actual vs Predicted',
                xAxis: 'actual',
                yAxis: 'predicted'
            });
        }

        // Always add correlation heatmap for complex analyses
        visualizations.push({
            type: 'heatmap',
            title: 'Feature Correlation',
            xAxis: 'feature',
            yAxis: 'correlation'
        });

        return visualizations;
    }

    private defineDeliverables(useCase: string, request: TemplateResearchRequest): TemplateDeliverable[] {
        const deliverables: TemplateDeliverable[] = [
            {
                name: 'Analysis Report',
                type: 'report',
                format: ['PDF', 'Excel']
            }
        ];

        const useCaseLower = useCase.toLowerCase();

        if (useCaseLower.includes('predict') || useCaseLower.includes('model')) {
            deliverables.push({
                name: 'Prediction Model',
                type: 'model',
                format: ['joblib', 'PMML']
            });
        }

        deliverables.push({
            name: 'Interactive Dashboard',
            type: 'dashboard',
            format: ['Web']
        });

        return deliverables;
    }

    private mapBusinessGoals(request: TemplateResearchRequest): AnalysisGoal[] {
        const goals: AnalysisGoal[] = [];

        // Map from businessGoals strings to AnalysisGoal enum
        const goalMappings: Record<string, AnalysisGoal> = {
            'revenue': 'increase_revenue',
            'cost': 'reduce_costs',
            'retention': 'customer_retention',
            'fraud': 'fraud_detection',
            'forecast': 'demand_forecasting',
            'talent': 'talent_management',
            'engagement': 'employee_engagement',
            'workforce': 'workforce_optimization',
            'risk': 'risk_management',
            'compliance': 'compliance',
            'performance': 'performance_analysis'
        };

        if (request.businessGoals) {
            for (const goal of request.businessGoals) {
                const goalLower = goal.toLowerCase();
                for (const [keyword, analysisGoal] of Object.entries(goalMappings)) {
                    if (goalLower.includes(keyword) && !goals.includes(analysisGoal)) {
                        goals.push(analysisGoal);
                    }
                }
            }
        }

        // Default to increase_revenue if no goals identified
        return goals.length > 0 ? goals : ['increase_revenue'];
    }

    private generateTemplateName(useCase: string): string {
        // Capitalize first letter of each word
        return useCase.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    private generateDescription(useCase: string, request: TemplateResearchRequest): string {
        const complexity = request.complexityLevel || 'intermediate';
        const complexityDesc = complexity === 'advanced' ? 'Advanced' : complexity === 'beginner' ? 'Beginner-friendly' : 'Comprehensive';

        return `${complexityDesc} analysis for ${useCase.toLowerCase()} using data-driven insights and machine learning.`;
    }

    private generateTags(useCase: string, request: TemplateResearchRequest): string[] {
        const tags: string[] = [];

        if (request.industry) tags.push(request.industry);

        const useCaseLower = useCase.toLowerCase();
        if (useCaseLower.includes('predict')) tags.push('prediction');
        if (useCaseLower.includes('forecast')) tags.push('forecasting');
        if (useCaseLower.includes('optimize')) tags.push('optimization');
        if (useCaseLower.includes('segment')) tags.push('segmentation');
        if (useCaseLower.includes('risk')) tags.push('risk');
        if (useCaseLower.includes('fraud')) tags.push('fraud');
        if (useCaseLower.includes('customer')) tags.push('customer');

        return tags;
    }

    private slugify(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    }

    private calculateConfidence(template: Partial<BusinessTemplate>, request: TemplateResearchRequest): number {
        let confidence = 0.5; // Base confidence

        if (template.workflow && template.workflow.length >= 3) confidence += 0.1;
        if (template.requiredDataFields && template.requiredDataFields.length >= 4) confidence += 0.1;
        if (template.visualizations && template.visualizations.length >= 3) confidence += 0.1;
        if (template.deliverables && template.deliverables.length >= 2) confidence += 0.1;
        if (request.industry) confidence += 0.1;

        return Math.min(confidence, 1.0);
    }

    private assessMarketDemand(useCase: string, request: TemplateResearchRequest): 'low' | 'medium' | 'high' {
        // High-demand use cases
        const highDemand = ['predict', 'forecast', 'optimize', 'fraud', 'risk', 'customer'];
        const useCaseLower = useCase.toLowerCase();

        if (highDemand.some(keyword => useCaseLower.includes(keyword))) {
            return 'high';
        }

        return 'medium';
    }

    private assessImplementationComplexity(workflow: TemplateWorkflowStep[]): 'low' | 'medium' | 'high' {
        if (workflow.length <= 2) return 'low';
        if (workflow.length <= 4) return 'medium';
        return 'high';
    }

    private estimatePopularity(marketDemand: string, implementationComplexity: string): number {
        const demandScore = marketDemand === 'high' ? 90 : marketDemand === 'medium' ? 70 : 50;
        const complexityPenalty = implementationComplexity === 'high' ? -10 : implementationComplexity === 'medium' ? -5 : 0;

        return Math.max(50, Math.min(100, demandScore + complexityPenalty));
    }

    private getResearchSources(request: TemplateResearchRequest): string[] {
        return [
            'Industry best practices',
            'Common business use cases',
            'Data science methodologies',
            'Template pattern library'
        ];
    }

    private estimatePotentialUsers(template: Partial<BusinessTemplate>, marketDemand: string): number {
        const baseUsers = marketDemand === 'high' ? 1000 : marketDemand === 'medium' ? 500 : 200;
        return baseUsers;
    }

    private calculateIndustryRelevance(template: Partial<BusinessTemplate>): number {
        // Based on how well template aligns with industry needs
        return 85; // Default high relevance
    }

    private calculateUniqueness(template: Partial<BusinessTemplate>): number {
        // Check if template offers unique value
        return 75; // Default moderate uniqueness
    }

    private extractKeywords(description: string): string[] {
        // Simple keyword extraction
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'with', 'to', 'from', 'in', 'on', 'at']);
        return description.toLowerCase()
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.has(word));
    }

    private inferIndustry(description: string, keywords: string[]): BusinessDomain {
        const industryKeywords: Record<BusinessDomain, string[]> = {
            'retail': ['store', 'shop', 'product', 'inventory', 'customer', 'sales'],
            'finance': ['loan', 'credit', 'investment', 'portfolio', 'fraud', 'transaction'],
            'healthcare': ['patient', 'medical', 'hospital', 'disease', 'treatment'],
            'hr': ['employee', 'talent', 'recruitment', 'workforce', 'compensation', 'performance'],
            'manufacturing': ['production', 'equipment', 'quality', 'supply', 'maintenance'],
            'marketing': ['campaign', 'lead', 'conversion', 'engagement', 'social'],
            'technology': ['user', 'feature', 'system', 'api', 'security', 'performance']
        };

        let bestMatch: BusinessDomain = 'technology';
        let maxMatches = 0;

        for (const [industry, industryKw] of Object.entries(industryKeywords)) {
            const matches = keywords.filter(kw => industryKw.some(ikw => kw.includes(ikw))).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                bestMatch = industry as BusinessDomain;
            }
        }

        return bestMatch;
    }

    private inferGoals(description: string, keywords: string[]): string[] {
        const goals: string[] = [];

        if (description.includes('revenue') || description.includes('profit')) goals.push('revenue');
        if (description.includes('cost') || description.includes('expense')) goals.push('cost');
        if (description.includes('retention') || description.includes('churn')) goals.push('retention');
        if (description.includes('fraud') || description.includes('anomaly')) goals.push('fraud');
        if (description.includes('forecast') || description.includes('predict')) goals.push('forecast');

        return goals.length > 0 ? goals : ['performance'];
    }

    private inferComplexity(description: string): 'beginner' | 'intermediate' | 'advanced' {
        const descLower = description.toLowerCase();

        if (descLower.includes('simple') || descLower.includes('basic') || descLower.includes('beginner')) {
            return 'beginner';
        }

        if (descLower.includes('advanced') || descLower.includes('complex') || descLower.includes('sophisticated')) {
            return 'advanced';
        }

        return 'intermediate';
    }
}

export const templateResearchAgent = new TemplateResearchAgent();
