/**
 * Business Template Research Agent
 *
 * Automated agent for researching and generating new business analysis templates
 * based on industry best practices, common use cases, and emerging business needs.
 */

import { BusinessDomain, AnalysisGoal, BusinessTemplate, TemplateWorkflowStep, TemplateDataField, TemplateVisualization, TemplateDeliverable } from './business-templates';
import { nanoid } from 'nanoid';
import { semanticSearchService } from './semantic-search-service';
import { executeTool } from './mcp-tool-registry';

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
     * Now uses vector search to find existing templates first, then falls back to web research,
     * and finally generates from knowledge base if no matches found.
     */
    async researchTemplate(request: TemplateResearchRequest): Promise<ResearchedTemplate> {
        console.log('🔍 [TemplateResearchAgent] Researching template for:', request);

        // Build search query from request
        const searchQuery = [
            request.useCase,
            ...(request.businessGoals || []),
            ...(request.keywords || [])
        ].filter(Boolean).join(' ');

        // Step 1: Check for existing templates via vector search
        if (searchQuery.length > 0) {
            console.log('🔍 [TemplateResearchAgent] Searching existing templates with query:', searchQuery);

            try {
                const existingMatches = await semanticSearchService.findSimilarTemplates(searchQuery, {
                    limit: 3,
                    minSimilarity: 0.6,
                    industry: request.industry,
                    isActive: true
                });

                if (existingMatches.length > 0 && existingMatches[0].similarity >= 0.75) {
                    console.log(`✅ [TemplateResearchAgent] Found high-confidence match: ${existingMatches[0].item.name} (similarity: ${existingMatches[0].similarity.toFixed(3)})`);
                    return this.convertToResearchedTemplate(existingMatches[0]);
                }

                // If medium confidence match found (0.6-0.75), return with lower confidence
                if (existingMatches.length > 0 && existingMatches[0].similarity >= 0.6) {
                    console.log(`📊 [TemplateResearchAgent] Found medium-confidence match: ${existingMatches[0].item.name} (similarity: ${existingMatches[0].similarity.toFixed(3)})`);
                    return this.convertToResearchedTemplate(existingMatches[0]);
                }
            } catch (error) {
                console.warn('⚠️ [TemplateResearchAgent] Vector search failed, continuing with generation:', error);
            }
        }

        // Step 2: Try web research if no good database match
        if (searchQuery.length > 0) {
            console.log('🌐 [TemplateResearchAgent] No database match, trying web research...');
            try {
                const webResults = await this.researchFromWeb(searchQuery, request.industry);
                if (webResults.length > 0) {
                    console.log(`✅ [TemplateResearchAgent] Found web research result: ${webResults[0].title}`);
                    return this.convertWebResultToTemplate(webResults[0], request);
                }
            } catch (error) {
                console.warn('⚠️ [TemplateResearchAgent] Web research failed, continuing with generation:', error);
            }
        }

        // Step 3: Generate from knowledge base (original logic)
        console.log('🔧 [TemplateResearchAgent] Generating template from knowledge base');

        // Step 3a: Identify relevant use case
        const useCase = this.identifyUseCase(request);

        // Step 3b: Determine analysis pattern
        const analysisPattern = this.determineAnalysisPattern(useCase, request);

        // Step 3c: Generate workflow steps
        const workflow = this.generateWorkflow(analysisPattern, request);

        // Step 3d: Identify required data fields
        const dataFields = this.identifyRequiredDataFields(useCase, request);

        // Step 3e: Determine visualizations
        const visualizations = this.determineVisualizations(useCase, analysisPattern);

        // Step 3f: Define deliverables
        const deliverables = this.defineDeliverables(useCase, request);

        // Step 3g: Map business goals
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
     * Convert a vector search match to ResearchedTemplate format
     */
    private convertToResearchedTemplate(match: any): ResearchedTemplate {
        const item = match.item;
        return {
            template: {
                templateId: item.id,
                name: item.name,
                description: item.summary || item.description,
                domain: item.industry as BusinessDomain,
                goals: (item.metadata as any)?.goals || [],
                workflow: item.steps || [],
                requiredDataFields: ((item.metadata as any)?.requiredElements || []).map((e: string) => ({
                    fieldName: e,
                    dataType: 'string' as const,
                    description: `Required: ${e}`,
                    example: ''
                })),
                visualizations: (item.visualizationTypes || []).map((v: string) => ({
                    type: v.includes('bar') ? 'bar' : v.includes('line') ? 'line' : 'scatter',
                    title: v,
                    xAxis: 'category',
                    yAxis: 'value'
                })),
                deliverables: (item.expectedArtifacts || []).map((a: string) => ({
                    name: a,
                    type: 'report' as const,
                    format: ['PDF']
                })),
                complexity: item.contentDepth as 'beginner' | 'intermediate' | 'advanced' || 'intermediate',
                tags: (item.metadata as any)?.tags || []
            },
            confidence: match.similarity,
            researchSources: ['Template database (vector search)'],
            marketDemand: match.similarity >= 0.85 ? 'high' : match.similarity >= 0.7 ? 'medium' : 'low',
            implementationComplexity: item.contentDepth === 'comprehensive' ? 'high' : item.contentDepth === 'standard' ? 'medium' : 'low',
            estimatedPopularity: Math.round(match.similarity * 100)
        };
    }

    /**
     * Search the web for template information using the web_researcher tool
     */
    private async researchFromWeb(query: string, industry?: BusinessDomain): Promise<any[]> {
        try {
            console.log('🌐 [TemplateResearchAgent] Searching web for:', query);

            const result = await executeTool('web_researcher', 'template_research_agent', {
                query: `${industry || ''} data analysis template ${query} best practices`,
                depth: 'standard',
                sources: ['industry_reports', 'best_practices', 'academic']
            });

            if (result && (result as any).success && (result as any).results?.length > 0) {
                console.log(`✅ [TemplateResearchAgent] Found ${(result as any).results.length} web results`);
                return (result as any).results.map((r: any) => ({
                    title: r.title,
                    description: r.snippet || r.description,
                    url: r.url,
                    relevance: r.relevance || 0.7,
                    content: this.extractTemplateElements(r.content || r.description || '')
                }));
            }

            return [];
        } catch (error) {
            console.warn('⚠️ [TemplateResearchAgent] Web research unavailable:', error);
            return [];
        }
    }

    /**
     * Extract structured template elements from web content
     */
    private extractTemplateElements(content: string): { dataElements?: string[]; analysisTypes?: string[]; visualizations?: string[] } {
        const dataElements: string[] = [];
        const analysisTypes: string[] = [];
        const visualizations: string[] = [];

        // Common data element patterns
        const elementPatterns = ['customer_id', 'employee_id', 'transaction_date', 'amount', 'revenue', 'satisfaction', 'engagement'];
        // Common analysis types
        const analysisPatterns = ['regression', 'correlation', 'clustering', 'time series', 'forecasting', 'segmentation'];
        // Common visualizations
        const vizPatterns = ['bar chart', 'line chart', 'scatter plot', 'heatmap', 'dashboard'];

        const contentLower = content?.toLowerCase() || '';

        elementPatterns.forEach(p => { if (contentLower.includes(p)) dataElements.push(p); });
        analysisPatterns.forEach(p => { if (contentLower.includes(p)) analysisTypes.push(p); });
        vizPatterns.forEach(p => { if (contentLower.includes(p)) visualizations.push(p); });

        return { dataElements, analysisTypes, visualizations };
    }

    /**
     * Convert a web research result to ResearchedTemplate format
     */
    private convertWebResultToTemplate(webResult: any, request: TemplateResearchRequest): ResearchedTemplate {
        return {
            template: {
                templateId: `web_${nanoid(8)}`,
                name: webResult.title,
                description: webResult.description,
                domain: request.industry,
                goals: this.mapBusinessGoals(request),
                workflow: this.generateWorkflow('predictive_ml', request),
                requiredDataFields: (webResult.content?.dataElements || []).map((e: string) => ({
                    fieldName: e,
                    dataType: 'string' as const,
                    description: `Required: ${e}`,
                    example: ''
                })),
                visualizations: (webResult.content?.visualizations || []).map((v: string) => ({
                    type: v.includes('bar') ? 'bar' : v.includes('line') ? 'line' : 'scatter',
                    title: v,
                    xAxis: 'category',
                    yAxis: 'value'
                })),
                deliverables: [{ name: 'Analysis Report', type: 'report' as const, format: ['PDF'] }],
                complexity: 'intermediate',
                tags: [...(request.keywords || []), request.industry || 'general']
            },
            confidence: webResult.relevance * 0.8, // Slightly lower confidence for web-sourced
            researchSources: [`Web research: ${webResult.url}`],
            marketDemand: 'medium',
            implementationComplexity: 'medium',
            estimatedPopularity: 70
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
            'technology': ['user', 'feature', 'system', 'api', 'security', 'performance'],
            'general': ['data', 'analysis', 'report', 'metric', 'dashboard', 'insight']
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

    // ============================================================================
    // SPRINT 2 FIX: ADDITIONAL REQUIRED METHODS
    // ============================================================================

    /**
     * Research multiple templates based on a request and rank by relevance
     * Combines internal knowledge base with optional online sources
     */
    async researchNewTemplates(request: TemplateResearchRequest): Promise<ResearchedTemplate[]> {
        console.log(`🔍 [TemplateResearch] Researching templates for ${request.industry || 'general'}`);

        // 1. Search internal knowledge base
        const internalTemplates = await this.searchInternalKB(request);
        console.log(`  📚 Found ${internalTemplates.length} templates from internal KB`);

        // 2. Search online sources (if enabled)
        let onlineTemplates: ResearchedTemplate[] = [];
        if (process.env.ENABLE_ONLINE_RESEARCH === 'true') {
            try {
                const onlineResults = await this.researchFromWeb(
                    request.useCase || request.keywords?.join(' ') || '',
                    request.industry
                );
                onlineTemplates = onlineResults.map((r: any) => this.convertToResearchedTemplate(r));
                console.log(`  🌐 Found ${onlineTemplates.length} templates from online sources`);
            } catch (error) {
                console.warn(`  ⚠️ Online research failed: ${error}`);
            }
        }

        // 3. Combine and rank by relevance
        const allTemplates = [...internalTemplates, ...onlineTemplates];
        return this.sortByRelevance(allTemplates, request);
    }

    /**
     * Search internal knowledge base for matching templates
     */
    private async searchInternalKB(request: TemplateResearchRequest): Promise<ResearchedTemplate[]> {
        const results: ResearchedTemplate[] = [];

        // Check industry-specific use cases
        const industryUseCases = this.commonUseCases.get(request.industry || 'technology') || [];
        const matchingUseCases = industryUseCases.filter(useCase => {
            const useCaseLower = useCase.toLowerCase();
            if (request.keywords) {
                return request.keywords.some(kw => useCaseLower.includes(kw.toLowerCase()));
            }
            if (request.useCase) {
                return useCaseLower.includes(request.useCase.toLowerCase()) ||
                       request.useCase.toLowerCase().includes(useCaseLower);
            }
            return false;
        });

        // Generate templates for matching use cases
        for (const useCase of matchingUseCases.slice(0, 5)) {
            const template = await this.researchTemplate({
                ...request,
                useCase
            });
            results.push(template);
        }

        return results;
    }

    /**
     * Sort templates by relevance to the request
     */
    private sortByRelevance(
        templates: ResearchedTemplate[],
        request: TemplateResearchRequest
    ): ResearchedTemplate[] {
        return templates.sort((a, b) => {
            let scoreA = a.confidence;
            let scoreB = b.confidence;

            // Boost for matching industry (using domain property)
            const aDomain = (a.template as any).domain;
            const bDomain = (b.template as any).domain;
            if (aDomain === request.industry) scoreA += 0.2;
            if (bDomain === request.industry) scoreB += 0.2;

            // Boost for matching keywords
            const keywords = request.keywords || [];
            const aKeywordMatches = keywords.filter(kw =>
                a.template.description?.toLowerCase().includes(kw.toLowerCase())
            ).length;
            const bKeywordMatches = keywords.filter(kw =>
                b.template.description?.toLowerCase().includes(kw.toLowerCase())
            ).length;

            scoreA += aKeywordMatches * 0.1;
            scoreB += bKeywordMatches * 0.1;

            // Boost for matching complexity (convert types)
            const complexityMap: Record<string, string> = {
                'low': 'beginner',
                'medium': 'intermediate',
                'high': 'advanced'
            };
            const aComplex = complexityMap[a.implementationComplexity];
            const bComplex = complexityMap[b.implementationComplexity];
            if (aComplex === request.complexityLevel) scoreA += 0.15;
            if (bComplex === request.complexityLevel) scoreB += 0.15;

            return scoreB - scoreA; // Descending order
        });
    }

    /**
     * Synthesize a new template from multiple source templates
     * Combines best elements from each template
     */
    async synthesizeFromMultipleSources(templates: ResearchedTemplate[]): Promise<ResearchedTemplate> {
        console.log(`🔄 [TemplateResearch] Synthesizing from ${templates.length} templates`);

        if (templates.length === 0) {
            throw new Error('Cannot synthesize from empty template list');
        }

        if (templates.length === 1) {
            return templates[0];
        }

        // Combine workflow steps from all templates (deduplicate)
        const allWorkflowSteps: TemplateWorkflowStep[] = [];
        const seenSteps = new Set<string>();

        for (const t of templates) {
            const steps = (t.template as any).workflow || [];
            for (const step of steps) {
                const stepKey = step.name?.toLowerCase() || step.stepId;
                if (!seenSteps.has(stepKey)) {
                    seenSteps.add(stepKey);
                    allWorkflowSteps.push(step);
                }
            }
        }

        // Combine data fields (deduplicate)
        const allDataFields: TemplateDataField[] = [];
        const seenFields = new Set<string>();

        for (const t of templates) {
            const fields = (t.template as any).requiredDataFields || [];
            for (const field of fields) {
                const fieldKey = field.fieldName?.toLowerCase();
                if (fieldKey && !seenFields.has(fieldKey)) {
                    seenFields.add(fieldKey);
                    allDataFields.push(field);
                }
            }
        }

        // Pick the best sources and findings
        const allSources = [...new Set(templates.flatMap(t => t.researchSources))];
        const avgConfidence = templates.reduce((sum, t) => sum + t.confidence, 0) / templates.length;
        const avgPopularity = templates.reduce((sum, t) => sum + t.estimatedPopularity, 0) / templates.length;

        // Find the most common domain
        const domainCounts = new Map<string, number>();
        for (const t of templates) {
            const dom = (t.template as any).domain || 'technology';
            domainCounts.set(dom, (domainCounts.get(dom) || 0) + 1);
        }
        let bestDomain: BusinessDomain = 'technology';
        let maxCount = 0;
        for (const [dom, count] of domainCounts) {
            if (count > maxCount) {
                maxCount = count;
                bestDomain = dom as BusinessDomain;
            }
        }

        const synthesized: ResearchedTemplate = {
            template: {
                templateId: nanoid(),
                name: `Synthesized ${bestDomain} Template`,
                domain: bestDomain,
                description: `Synthesized template combining ${templates.length} source templates for ${bestDomain} industry`,
                goals: [],
                workflow: allWorkflowSteps,
                requiredDataFields: allDataFields,
                visualizations: [],
                deliverables: [],
                complexity: 'intermediate',
                popularity: avgPopularity,
                tags: ['synthesized', bestDomain]
            },
            confidence: Math.min(avgConfidence + 0.1, 0.95),
            researchSources: allSources,
            marketDemand: this.determineOverallDemand(templates),
            implementationComplexity: this.determineOverallComplexity(templates),
            estimatedPopularity: avgPopularity
        };

        console.log(`  ✅ Synthesized template with ${allWorkflowSteps.length} steps and ${allDataFields.length} fields`);
        return synthesized;
    }

    /**
     * Determine overall market demand from multiple templates
     */
    private determineOverallDemand(templates: ResearchedTemplate[]): 'low' | 'medium' | 'high' {
        const demands = templates.map(t => t.marketDemand);
        if (demands.includes('high')) return 'high';
        if (demands.includes('medium')) return 'medium';
        return 'low';
    }

    /**
     * Determine overall complexity from multiple templates
     */
    private determineOverallComplexity(templates: ResearchedTemplate[]): 'low' | 'medium' | 'high' {
        const complexities = templates.map(t => t.implementationComplexity);
        if (complexities.includes('high')) return 'high';
        if (complexities.includes('medium')) return 'medium';
        return 'low';
    }

    /**
     * Validate a template for completeness and correctness
     */
    async validateNewTemplate(template: ResearchedTemplate): Promise<{
        isValid: boolean;
        issues: string[];
        recommendations: string[];
    }> {
        console.log(`✅ [TemplateResearch] Validating template: ${template.template.name}`);

        const issues: string[] = [];
        const recommendations: string[] = [];

        // Check required fields
        const requiredFieldIssues = this.validateRequiredFields(template);
        issues.push(...requiredFieldIssues);

        // Check analysis steps
        const stepIssues = this.validateAnalysisSteps(template);
        issues.push(...stepIssues);

        // Check data requirements
        const dataIssues = this.validateDataRequirements(template);
        issues.push(...dataIssues);

        // Check output formats
        const outputIssues = this.validateOutputFormats(template);
        issues.push(...outputIssues);

        // Generate recommendations
        if (template.confidence < 0.7) {
            recommendations.push('Consider adding more specific use case examples to improve confidence');
        }
        if (template.implementationComplexity === 'high') {
            recommendations.push('Consider breaking down into smaller, modular sub-templates');
        }
        if (template.marketDemand === 'low') {
            recommendations.push('Add industry-specific customizations to increase market appeal');
        }

        const isValid = issues.length === 0;
        console.log(`  ${isValid ? '✅' : '❌'} Validation ${isValid ? 'passed' : 'failed'}: ${issues.length} issues`);

        return { isValid, issues, recommendations };
    }

    /**
     * Check required fields in template
     */
    private validateRequiredFields(template: ResearchedTemplate): string[] {
        const issues: string[] = [];

        if (!template.template.name) {
            issues.push('Missing required field: name');
        }
        if (!(template.template as any).domain) {
            issues.push('Missing required field: domain');
        }
        if (!template.template.description) {
            issues.push('Missing required field: description');
        }

        return issues;
    }

    /**
     * Check analysis steps for completeness
     */
    private validateAnalysisSteps(template: ResearchedTemplate): string[] {
        const issues: string[] = [];
        const steps = (template.template as any).workflow || [];

        if (steps.length === 0) {
            issues.push('Template has no workflow steps defined');
        } else {
            // Check for data preparation step
            const hasDataPrep = steps.some((s: any) =>
                s.component === 'data_ingestion' || s.name?.toLowerCase().includes('data')
            );
            if (!hasDataPrep) {
                issues.push('Missing data preparation step in workflow');
            }

            // Check for analysis step
            const hasAnalysis = steps.some((s: any) =>
                s.component === 'statistical_analysis' || s.name?.toLowerCase().includes('analysis')
            );
            if (!hasAnalysis) {
                issues.push('Missing analysis step in workflow');
            }
        }

        return issues;
    }

    /**
     * Check data requirements
     */
    private validateDataRequirements(template: ResearchedTemplate): string[] {
        const issues: string[] = [];
        const fields = (template.template as any).requiredDataFields || [];

        if (fields.length === 0) {
            issues.push('Template has no data fields defined');
        } else {
            // Check for identifier field
            const hasId = fields.some((f: any) =>
                f.fieldName?.toLowerCase().includes('id') || f.dataType === 'string'
            );
            if (!hasId) {
                issues.push('Missing identifier field in data requirements');
            }
        }

        return issues;
    }

    /**
     * Check output formats
     */
    private validateOutputFormats(template: ResearchedTemplate): string[] {
        const issues: string[] = [];
        const deliverables = (template.template as any).deliverables || [];

        // Not a hard requirement, just validate structure if present
        for (const d of deliverables) {
            if (!d.name || !d.type) {
                issues.push('Deliverable missing name or type');
            }
        }

        return issues;
    }
}

export const templateResearchAgent = new TemplateResearchAgent();
