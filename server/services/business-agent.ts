import { ChimaridataAI } from './chimaridata-ai';
import { KnowledgeGraphService, type KnowledgeTemplate, type RegulationKnowledge } from './knowledge-graph-service';
import type { BusinessContext as PlanBusinessContext, DataAssessment } from '@shared/schema';
import {
  NaturalLanguageTranslator,
  naturalLanguageTranslator,
  type AudienceType,
  type TranslationContext,
  type AIResultsTranslation,
  type AIQualityTranslation,
  type AISchemaTranslation
} from './natural-language-translator';

// ==========================================
// CONSULTATION INTERFACES (Multi-Agent Coordination)
// ==========================================

export interface BusinessImpactReport {
    businessValue: 'high' | 'medium' | 'low';
    confidence?: number;
    alignment: number | {
        goals: number;
        industry: number;
        bestPractices: number;
    };
    alignmentFactors?: {
        goals: number;
        industry: number;
        bestPractices: number;
    };
    benefits: string[];
    risks: string[];
    recommendations: string[];
    expectedROI: string;
    industryInsights?: string[];
    complianceConsiderations?: string[];
}

export interface MetricDefinition {
    name: string;
    description: string;
    calculation: string;
    businessImpact?: string;
}

export interface MetricRecommendations {
    primaryMetrics: Array<MetricDefinition | string>;
    secondaryMetrics: Array<MetricDefinition | string>;
    industrySpecific?: string[];
    warnings?: string[];
    recommendations?: string[];
    industry?: string;
    metrics?: {
        primary: Array<MetricDefinition | string>;
        secondary: Array<MetricDefinition | string>;
    };
}

export interface AlignmentScore {
    score: number;
    alignmentFactors: Array<{
        factor: string;
        aligned: boolean;
        impact: string;
    }>;
    gaps: string[];
    suggestions: string[];
}

// ==========================================
// BUSINESS CONTEXT INTERFACES
// ==========================================

export interface BusinessContext {
    projectName?: string;
    projectDescription?: string;
    industry?: string;
    businessRole?: string;
    technicalLevel?: 'beginner' | 'intermediate' | 'expert';
    dataSchema?: Record<string, any>;
    recordCount?: number;
    userGoals?: string[];
}

interface IndustryTemplate {
    industry: string;
    commonUseCases: string[];
    keyMetrics: string[];
    regulatoryConsiderations: string[];
    analysisTemplates: AnalysisTemplate[];
    nodeId?: string;
    summary?: string | null;
}

interface AnalysisTemplate {
    id?: string;
    name: string;
    type: string;
    description: string;
    requiredColumns: string[];
    expectedOutcomes: string[];
    businessValue: string;
}

interface RegulatoryFramework {
    name: string;
    description: string;
    requirements: string[];
    applicableIndustries: string[];
    nodeId?: string;
}

function buildGoalExtractionPrompt(userDescription: string, journeyType: string, context: BusinessContext): string {
    const journeyPersona = {
        guided: "You are a helpful data analysis assistant for non-technical users. Your goal is to provide clear, step-by-step guidance.",
        business: "You are a strategic business consultant. You help users leverage data to solve common business problems using established templates and frameworks.",
        technical: "You are an expert data scientist. You provide advanced analytical options and technical guidance to data professionals."
    }[journeyType] || "You are a general data analysis assistant.";

    let prompt = `${journeyPersona}\n\n`;
    prompt += `TASK: Analyze the user's request and the provided context to generate a structured, decision-focused analysis plan in JSON format.\n\n`;
    prompt += `USER'S PRIMARY REQUEST: "${userDescription}"\n\n`;
    prompt += `CONTEXTUAL INFORMATION:\n`;
    if (context.projectName) prompt += `- Project Name: ${context.projectName}\n`;
    if (context.projectDescription) prompt += `- Project Description: ${context.projectDescription}\n`;
    if (context.industry) prompt += `- Industry: ${context.industry}\n`;
    if (context.businessRole) prompt += `- User's Role: ${context.businessRole}\n`;
    if (context.recordCount) prompt += `- Dataset Size: Approximately ${context.recordCount} records\n`;
    if (context.dataSchema) {
        const columns = Object.keys(context.dataSchema).slice(0, 15); // Limit to first 15 columns for brevity
        prompt += `- Data Columns: ${columns.join(', ')}\n`;
    }
    if (context.userGoals && context.userGoals.length > 0) {
        prompt += `- Pre-stated Goals: ${context.userGoals.join(', ')}\n`;
    }
    prompt += `\nINSTRUCTIONS: Based on all the information above, respond with a valid JSON object containing the following fields. When the journey type is business or the user's role is business, emphasize decision framing, KPI impact, ROI, risks, and clear next actions.\n\n`;
    prompt += `
1.  "goals": An array of specific, actionable goals. Each goal should have:
    - "goal" (string): A concise statement of the objective.
    - "description" (string): A detailed explanation of what the goal entails.
    - "priority" (enum: "high", "medium", "low"): The importance of the goal.
    - "category" (enum: "business_insight", "prediction", "optimization", "exploration", "validation"): The type of goal.

2.  "questions": An array of key business questions to be answered. Each question should have:
    - "question" (string): The specific question.
    - "type" (enum: "descriptive", "diagnostic", "predictive", "prescriptive"): The nature of the question.
    - "complexity" (enum: "basic", "intermediate", "advanced"): The difficulty of answering it.

3.  "analysisPaths": An array of suggested analysis paths. Each path should have:
    - "name" (string): The name of the analysis (e.g., "Customer Segmentation").
    - "type" (enum: "statistical", "machine_learning", "visualization", "business_intelligence", "time_series"): The analysis category.
    - "description" (string): A summary of what this analysis will do.
    - "complexity" (enum: "basic", "intermediate", "advanced"): The technical complexity.
    - "confidence" (number): Your confidence (0-100) that this path meets the user's needs.

4.  "dataRequirements": A summary of data needs.
    - "requiredDataTypes" (array of strings): e.g., ["Numerical", "Categorical", "Date/Time"].
    - "qualityRequirements" (array of strings): e.g., ["No missing values in key columns", "Consistent formatting"].

5.  "decisionFramework": Decision-focused output to support business users. Include:
    - "executiveSummary" (string): A 3-5 sentence summary in business language.
    - "kpis" (array of strings): The primary KPIs impacted.
    - "financialImpact" (object): { revenueImpact: string, costImpact: string, roiEstimate: string, breakEven: string }
    - "options" (array): Each with { option: string, expectedImpact: string, kpiMovement: string[], risks: string[], requiredActions: string[] }
    - "recommendedAction" (object): { action: string, rationale: string, expectedOutcome: string, timeline: string }

Focus on providing practical, actionable recommendations that align with the user's journey type and business context. Ensure the output is a single, valid JSON object with no extra text or explanations.`;

    return prompt;
}

function parseGoalExtractionResponse(aiResponse: string, journeyType: string): any {
    try {
        // First try to parse as JSON directly
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(aiResponse);
        } catch {
            // If direct JSON parsing fails, try to extract JSON from the response
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedResponse = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No valid JSON found in AI response");
            }
        }

        // Validate and provide defaults for required fields
        const result = {
            goals: parsedResponse.goals || [
                {
                    goal: "Understand key insights from the data",
                    description: "Analyze the dataset to identify important patterns and trends",
                    priority: "high" as const,
                    category: "business_insight" as const
                }
            ],
            questions: parsedResponse.questions || [
                {
                    question: "What are the main patterns in this dataset?",
                    type: "descriptive" as const,
                    complexity: "basic" as const,
                    dataRequirements: ["Quantitative data", "Clean dataset"]
                }
            ],
            analysisPaths: parsedResponse.analysisPaths || [
                {
                    name: "Exploratory Data Analysis",
                    type: "statistical" as const,
                    description: "Comprehensive overview of data patterns, distributions, and relationships",
                    complexity: "basic" as const,
                    estimatedDuration: "2-4 hours",
                    expectedOutcomes: ["Data overview", "Key statistics", "Initial insights"],
                    requiredFeatures: ["preparation", "analysis", "visualization"],
                    confidence: 85
                }
            ],
            dataRequirements: {
                estimatedColumns: parsedResponse.dataRequirements?.estimatedColumns || 10,
                estimatedRows: parsedResponse.dataRequirements?.estimatedRows || 1000,
                requiredDataTypes: parsedResponse.dataRequirements?.requiredDataTypes || ["Numerical", "Categorical"],
                qualityRequirements: parsedResponse.dataRequirements?.qualityRequirements || ["Clean data", "Consistent formatting"]
            },
            recommendedFeatures: parsedResponse.recommendedFeatures || ["preparation", "analysis", "visualization"],
            decisionFramework: parsedResponse.decisionFramework || (journeyType === 'business' ? {
                executiveSummary: "This analysis supports a clear business decision with quantified KPI and financial impacts.",
                kpis: ["Revenue", "Gross Margin", "Conversion Rate"],
                financialImpact: {
                    revenueImpact: "Potential +5-10% revenue uplift",
                    costImpact: "Operational cost reduction of 2-4%",
                    roiEstimate: "Estimated 150-200% ROI over 6 months",
                    breakEven: "Break-even in ~8-12 weeks"
                },
                options: [
                    {
                        option: "Option A: Optimize pricing tiers",
                        expectedImpact: "Increase ARPU with minimal churn impact",
                        kpiMovement: ["ARPU ↑", "Churn ↔/↑ slightly"],
                        risks: ["Customer sensitivity to price changes"],
                        requiredActions: ["Price experiment", "Monitor cohort churn"]
                    },
                    {
                        option: "Option B: Target high-LTV segments",
                        expectedImpact: "Better marketing efficiency and conversion",
                        kpiMovement: ["CAC ↓", "LTV ↑"],
                        risks: ["Narrower audience reach"],
                        requiredActions: ["Refine targeting", "Adjust creatives"]
                    }
                ],
                recommendedAction: {
                    action: "Run a 4-week pricing experiment in top segments",
                    rationale: "Highest ROI with manageable risk based on historical elasticity",
                    expectedOutcome: "+6% revenue with stable churn",
                    timeline: "8-12 weeks to full rollout"
                }
            } : undefined)
        };

        return result;

    } catch (error) {
        console.error('Failed to parse AI response:', error);
        console.error('AI Response was:', aiResponse);

        // Return fallback response based on journey type
        return getFallbackGoalExtraction(journeyType);
    }
}

function getFallbackGoalExtraction(journeyType: string): any {
    const fallbacks: { [key: string]: any } = {
        'non-tech': {
            goals: [
                {
                    goal: "Understand your data patterns",
                    description: "Get clear insights about what your data shows using guided analysis",
                    priority: "high" as const,
                    category: "business_insight" as const
                }
            ],
            questions: [
                {
                    question: "What are the key trends in my data?",
                    type: "descriptive" as const,
                    complexity: "basic" as const,
                    dataRequirements: ["Historical data", "Key metrics"]
                }
            ],
            analysisPaths: [
                {
                    name: "Guided Data Exploration",
                    type: "business_intelligence" as const,
                    description: "Step-by-step analysis with AI guidance perfect for business users",
                    complexity: "basic" as const,
                    estimatedDuration: "1-2 hours",
                    expectedOutcomes: ["Business insights", "Key trends", "Actionable recommendations"],
                    requiredFeatures: ["preparation", "analysis", "ai_insights"],
                    confidence: 90
                }
            ],
            dataRequirements: {
                estimatedColumns: 5,
                estimatedRows: 500,
                requiredDataTypes: ["Business metrics", "Time data"],
                qualityRequirements: ["Complete records", "Business-relevant data"]
            },
            recommendedFeatures: ["preparation", "analysis", "ai_insights"]
        },
        business: {
            goals: [
                {
                    goal: "Apply proven business analysis templates",
                    description: "Use pre-built analysis frameworks for common business scenarios",
                    priority: "high" as const,
                    category: "business_insight" as const
                }
            ],
            questions: [
                {
                    question: "How does my business performance compare to benchmarks?",
                    type: "diagnostic" as const,
                    complexity: "intermediate" as const,
                    dataRequirements: ["Performance metrics", "Historical data"]
                }
            ],
            analysisPaths: [
                {
                    name: "Business Performance Dashboard",
                    type: "business_intelligence" as const,
                    description: "Pre-built templates for sales, marketing, and operational analysis",
                    complexity: "intermediate" as const,
                    estimatedDuration: "2-3 hours",
                    expectedOutcomes: ["Performance metrics", "Trend analysis", "Business recommendations"],
                    requiredFeatures: ["preparation", "analysis", "visualization"],
                    confidence: 85
                }
            ],
            dataRequirements: {
                estimatedColumns: 15,
                estimatedRows: 2000,
                requiredDataTypes: ["Business metrics", "Time series", "Categorical data"],
                qualityRequirements: ["Consistent metrics", "Regular time intervals"]
            },
            recommendedFeatures: ["preparation", "analysis", "visualization"]
        },
        technical: {
            goals: [
                {
                    goal: "Perform advanced statistical analysis",
                    description: "Apply sophisticated analytical techniques with full customization",
                    priority: "high" as const,
                    category: "exploration" as const
                }
            ],
            questions: [
                {
                    question: "What complex relationships exist in my data?",
                    type: "predictive" as const,
                    complexity: "advanced" as const,
                    dataRequirements: ["Large dataset", "Multiple variables", "Clean data"]
                }
            ],
            analysisPaths: [
                {
                    name: "Advanced Statistical Modeling",
                    type: "machine_learning" as const,
                    description: "Custom statistical models with full parameter control",
                    complexity: "advanced" as const,
                    estimatedDuration: "4-8 hours",
                    expectedOutcomes: ["Statistical models", "Predictive insights", "Technical documentation"],
                    requiredFeatures: ["preparation", "data_processing", "analysis", "ai_insights"],
                    confidence: 80
                }
            ],
            dataRequirements: {
                estimatedColumns: 25,
                estimatedRows: 10000,
                requiredDataTypes: ["Numerical data", "Multiple variables", "Time series"],
                qualityRequirements: ["High data quality", "Complete cases", "Validated measurements"]
            },
            recommendedFeatures: ["preparation", "data_processing", "analysis", "ai_insights"]
        }
    };

    return fallbacks[journeyType] || fallbacks['non-tech'];
}
export class BusinessAgent {
    private chimaridataAI: ChimaridataAI;
    private knowledgeGraph: KnowledgeGraphService;
    private translator: NaturalLanguageTranslator;

    constructor() {
        this.chimaridataAI = new ChimaridataAI();
        this.knowledgeGraph = new KnowledgeGraphService();
        this.translator = naturalLanguageTranslator;
    }

    /**
     * Process task from message broker for real-time agent coordination
     */
    async processTask(task: any, projectId: string): Promise<any> {
        const { stepName, dependency, project, previousResults } = task;

        console.log(`Business Agent processing task: ${stepName} for project ${projectId}`);

        try {
            switch (stepName) {
                // Consultation methods for multi-agent coordination
                case 'assess_business_impact':
                    return await this.assessBusinessImpact(
                        task.payload?.goals || [],
                        task.payload?.proposedApproach || {},
                        task.payload?.industry || 'general'
                    );

                case 'suggest_business_metrics':
                    return await this.suggestBusinessMetrics(
                        task.payload?.industry || 'general',
                        task.payload?.goals || []
                    );

                case 'validate_business_alignment':
                    return await this.validateBusinessAlignment(
                        task.payload?.technicalApproach || {},
                        task.payload?.businessGoals || []
                    );

                // Existing workflow methods
                case 'report_generation':
                    return await this.generateBusinessReport(project, previousResults, dependency.metadata);

                case 'business_analysis':
                    return await this.performBusinessAnalysis(project, previousResults, dependency.metadata);

                case 'recommendations':
                    return await this.generateRecommendations(project, previousResults, dependency.metadata);

                case 'compliance_check':
                    return await this.performComplianceCheck(project, dependency.metadata);

                default:
                    throw new Error(`Business Agent cannot handle step: ${stepName}`);
            }
        } catch (error) {
            console.error(`Business Agent task ${stepName} failed:`, error);
            throw error;
        }
    }

    private async generateBusinessReport(project: any, previousResults: any, metadata: any): Promise<any> {
        console.log('💼 [BA] Generating dynamic business report from project context...');

        // Extract project context
        const journeyProgress = project?.journeyProgress || {};
        const userGoals = journeyProgress?.goals || journeyProgress?.userQuestions || [];
        const analysisResults = project?.analysisResults || previousResults?.analysisResults || {};
        const industry = journeyProgress?.industry || project?.metadata?.industry || 'general';
        const projectName = project?.name || 'Data Analysis Project';

        // Build AI prompt for dynamic key findings
        const prompt = `You are a business analyst generating a report for "${projectName}".

Context:
- Industry: ${industry}
- User Goals: ${JSON.stringify(userGoals).slice(0, 500)}
- Analysis Results Summary: ${JSON.stringify(analysisResults).slice(0, 1000)}

Generate a JSON response with:
1. "summary": A 2-3 sentence executive summary of the analysis
2. "keyFindings": Array of 3-5 specific, actionable findings based on the actual data and goals
3. "recommendations": Array of 3-5 prioritized business recommendations

Return ONLY valid JSON.`;

        try {
            const aiResult = await this.chimaridataAI.generateInsights({}, "business_report", prompt);
            if (aiResult.success && aiResult.insights) {
                const parsed = this.parseJSONFromAI(aiResult.insights);
                if (parsed) {
                    console.log('✅ [BA] Generated dynamic business report with', parsed.keyFindings?.length || 0, 'findings');
                    return {
                        reportType: 'business_summary',
                        summary: parsed.summary || `Analysis completed for ${projectName} in the ${industry} sector.`,
                        keyFindings: parsed.keyFindings || [],
                        recommendations: parsed.recommendations || [],
                        metadata: metadata
                    };
                }
            }
        } catch (error) {
            console.warn('⚠️ [BA] AI generation failed, using context-derived report:', error);
        }

        // Fallback: Generate context-aware report from available data
        const keyFindings = this.deriveKeyFindings(project, analysisResults, userGoals);
        const recommendations = this.deriveRecommendations(project, analysisResults, industry);

        return {
            reportType: 'business_summary',
            summary: `Analysis of ${projectName} identified ${keyFindings.length} key findings aligned with your ${industry} business objectives.`,
            keyFindings,
            recommendations,
            metadata: metadata
        };
    }

    private async performBusinessAnalysis(project: any, previousResults: any, metadata: any): Promise<any> {
        console.log('💼 [BA] Performing dynamic business analysis...');

        const journeyProgress = project?.journeyProgress || {};
        const userGoals = journeyProgress?.goals || journeyProgress?.userQuestions || [];
        const industry = journeyProgress?.industry || project?.metadata?.industry || 'general';
        const analysisResults = project?.analysisResults || previousResults?.analysisResults || {};
        const dataSchema = journeyProgress?.dataSchema || project?.metadata?.schema || {};

        // Build AI prompt for business insights
        const prompt = `You are a business intelligence expert analyzing data for a ${industry} organization.

User Goals: ${JSON.stringify(userGoals).slice(0, 500)}
Analysis Results: ${JSON.stringify(analysisResults).slice(0, 800)}
Data Columns: ${Object.keys(dataSchema).join(', ').slice(0, 300)}

Generate JSON with:
1. "insights": Array of 3-5 specific business insights derived from the data
2. "businessImpact": "High", "Medium", or "Low" based on potential value
3. "impactReason": Brief explanation of the business impact assessment
4. "opportunityAreas": Array of 2-3 areas for business improvement

Return ONLY valid JSON.`;

        try {
            const aiResult = await this.chimaridataAI.generateInsights({}, "business_analysis", prompt);
            if (aiResult.success && aiResult.insights) {
                const parsed = this.parseJSONFromAI(aiResult.insights);
                if (parsed) {
                    console.log('✅ [BA] Generated', parsed.insights?.length || 0, 'dynamic business insights');
                    return {
                        analysisType: 'business_insights',
                        insights: parsed.insights || [],
                        businessImpact: parsed.businessImpact || 'Medium',
                        impactReason: parsed.impactReason,
                        opportunityAreas: parsed.opportunityAreas || [],
                        metadata: metadata
                    };
                }
            }
        } catch (error) {
            console.warn('⚠️ [BA] AI analysis failed, using derived insights:', error);
        }

        // Fallback: Derive insights from context
        const insights = this.deriveBusinessInsights(project, analysisResults, userGoals, industry);
        const impactLevel = this.assessBusinessImpactLevel(analysisResults, userGoals);

        return {
            analysisType: 'business_insights',
            insights,
            businessImpact: impactLevel,
            impactReason: `Based on alignment with ${userGoals.length || 0} stated goals and ${industry} industry benchmarks.`,
            metadata: metadata
        };
    }

    private async generateRecommendations(project: any, previousResults: any, metadata: any): Promise<any> {
        console.log('💼 [BA] Generating dynamic business recommendations...');

        const journeyProgress = project?.journeyProgress || {};
        const userGoals = journeyProgress?.goals || journeyProgress?.userQuestions || [];
        const industry = journeyProgress?.industry || project?.metadata?.industry || 'general';
        const analysisResults = project?.analysisResults || previousResults?.analysisResults || {};
        const analysisTypes = journeyProgress?.analysisPath?.map((a: any) => a.analysisType || a.type) || [];

        // Build AI prompt
        const prompt = `You are a strategic business consultant providing recommendations for a ${industry} organization.

User Goals: ${JSON.stringify(userGoals).slice(0, 400)}
Analysis Types Performed: ${analysisTypes.join(', ')}
Key Results: ${JSON.stringify(analysisResults).slice(0, 600)}

Generate JSON with "recommendations" array. Each recommendation should have:
- "title": Actionable recommendation title
- "priority": "high", "medium", or "low"
- "impact": Primary impact area (e.g., "revenue", "efficiency", "risk", "engagement", "retention")
- "rationale": 1-2 sentence explanation linked to the analysis findings
- "nextSteps": Array of 2-3 specific action items

Return ONLY valid JSON with 3-5 recommendations.`;

        try {
            const aiResult = await this.chimaridataAI.generateInsights({}, "recommendations", prompt);
            if (aiResult.success && aiResult.insights) {
                const parsed = this.parseJSONFromAI(aiResult.insights);
                if (parsed?.recommendations) {
                    console.log('✅ [BA] Generated', parsed.recommendations.length, 'dynamic recommendations');
                    return {
                        recommendations: parsed.recommendations,
                        metadata: metadata
                    };
                }
            }
        } catch (error) {
            console.warn('⚠️ [BA] AI recommendations failed, using derived recommendations:', error);
        }

        // Fallback: Generate context-aware recommendations
        const recommendations = this.deriveContextRecommendations(userGoals, analysisTypes, industry);

        return {
            recommendations,
            metadata: metadata
        };
    }

    private async performComplianceCheck(project: any, metadata: any): Promise<any> {
        console.log('💼 [BA] Performing dynamic compliance check...');

        const journeyProgress = project?.journeyProgress || {};
        const industry = journeyProgress?.industry || project?.metadata?.industry || 'general';
        const piiDecision = journeyProgress?.piiDecision || {};
        const dataSchema = journeyProgress?.dataSchema || project?.metadata?.schema || {};

        // Get applicable regulations from knowledge graph
        const regulations = await this.getApplicableRegulations(industry);
        const checkedFrameworks = regulations.map(r => r.name);

        // Derive compliance issues based on context
        const issues: string[] = [];

        // Check PII handling
        if (piiDecision?.hasPII && (!piiDecision?.excludedColumns || piiDecision.excludedColumns.length === 0)) {
            issues.push('PII detected but no columns excluded - review data handling compliance');
        }

        // Check for sensitive data patterns in schema
        const schemaColumns = Object.keys(dataSchema).map(c => c.toLowerCase());
        const sensitivePatterns = ['ssn', 'social_security', 'credit_card', 'password', 'salary', 'health', 'medical'];
        const sensitiveFound = schemaColumns.filter(col =>
            sensitivePatterns.some(pattern => col.includes(pattern))
        );
        if (sensitiveFound.length > 0) {
            issues.push(`Potentially sensitive columns detected: ${sensitiveFound.join(', ')} - verify handling requirements`);
        }

        // Industry-specific checks
        if (industry.toLowerCase().includes('health') || industry.toLowerCase().includes('medical')) {
            if (!checkedFrameworks.includes('HIPAA')) {
                checkedFrameworks.push('HIPAA');
            }
            issues.push('Healthcare data requires HIPAA compliance verification');
        }

        if (industry.toLowerCase().includes('financ') || industry.toLowerCase().includes('bank')) {
            if (!checkedFrameworks.includes('SOX')) {
                checkedFrameworks.push('SOX');
            }
        }

        const complianceStatus = issues.length === 0 ? 'compliant' :
                                  issues.length <= 2 ? 'review_recommended' : 'action_required';

        console.log(`✅ [BA] Compliance check: ${complianceStatus}, ${checkedFrameworks.length} frameworks, ${issues.length} issues`);

        return {
            complianceStatus,
            checkedFrameworks: checkedFrameworks.length > 0 ? checkedFrameworks : ['General Data Protection'],
            issues,
            recommendations: issues.length > 0 ? [
                'Review identified compliance issues with your data governance team',
                'Document data handling procedures for audit purposes'
            ] : ['Continue monitoring for regulatory changes'],
            metadata: metadata
        };
    }

    // Helper: Parse JSON from AI response
    private parseJSONFromAI(response: string): any {
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (e) {
            console.warn('Failed to parse AI JSON response');
        }
        return null;
    }

    // Helper: Derive key findings from project context
    private deriveKeyFindings(project: any, analysisResults: any, userGoals: any[]): string[] {
        const findings: string[] = [];
        const goals = Array.isArray(userGoals) ? userGoals : [];

        // Add goal-based findings
        for (const goal of goals.slice(0, 3)) {
            const goalText = typeof goal === 'string' ? goal : goal?.question || goal?.goal || '';
            if (goalText) {
                findings.push(`Analysis addressed: ${goalText.slice(0, 100)}`);
            }
        }

        // Add analysis-based findings
        if (analysisResults?.insights?.length > 0) {
            findings.push(`Identified ${analysisResults.insights.length} actionable insights from your data`);
        }

        if (analysisResults?.visualizations?.length > 0) {
            findings.push(`Generated ${analysisResults.visualizations.length} visualizations to support decision-making`);
        }

        // Ensure at least one finding
        if (findings.length === 0) {
            findings.push('Data analysis completed successfully with results ready for review');
        }

        return findings;
    }

    // Helper: Derive recommendations from context
    private deriveRecommendations(project: any, analysisResults: any, industry: string): string[] {
        const recommendations: string[] = [];

        if (analysisResults?.recommendations) {
            recommendations.push(...analysisResults.recommendations.slice(0, 3));
        }

        // Industry-specific recommendations
        const industryLower = industry.toLowerCase();
        if (industryLower.includes('hr') || industryLower.includes('human resource')) {
            recommendations.push('Track employee engagement trends quarterly to measure improvement');
        } else if (industryLower.includes('retail') || industryLower.includes('sales')) {
            recommendations.push('Segment customers based on analysis findings for targeted campaigns');
        } else if (industryLower.includes('health')) {
            recommendations.push('Ensure all findings are reviewed for HIPAA compliance before distribution');
        }

        if (recommendations.length === 0) {
            recommendations.push('Review analysis outputs with stakeholders to prioritize action items');
        }

        return recommendations;
    }

    // Helper: Derive business insights from context
    private deriveBusinessInsights(project: any, analysisResults: any, userGoals: any[], industry: string): string[] {
        const insights: string[] = [];

        // From analysis results
        if (analysisResults?.insights) {
            insights.push(...analysisResults.insights.slice(0, 2).map((i: any) =>
                typeof i === 'string' ? i : i.text || i.description || JSON.stringify(i)
            ));
        }

        // From goals
        const goals = Array.isArray(userGoals) ? userGoals : [];
        if (goals.length > 0) {
            insights.push(`Analysis aligned with ${goals.length} stated business objectives`);
        }

        // Industry context
        if (industry && industry !== 'general') {
            insights.push(`Findings contextualized for ${industry} industry best practices`);
        }

        if (insights.length === 0) {
            insights.push('Business analysis completed - review detailed results for actionable insights');
        }

        return insights;
    }

    // Helper: Assess business impact level
    private assessBusinessImpactLevel(analysisResults: any, userGoals: any[]): string {
        const goals = Array.isArray(userGoals) ? userGoals : [];
        const insightCount = analysisResults?.insights?.length || 0;
        const vizCount = analysisResults?.visualizations?.length || 0;

        if (goals.length >= 3 && insightCount >= 5) return 'High';
        if (goals.length >= 1 && insightCount >= 2) return 'Medium';
        return 'Low';
    }

    // Helper: Generate context-aware recommendations
    private deriveContextRecommendations(userGoals: any[], analysisTypes: string[], industry: string): any[] {
        const recommendations: any[] = [];
        const goals = Array.isArray(userGoals) ? userGoals : [];

        // Goal-based recommendations
        for (const goal of goals.slice(0, 2)) {
            const goalText = typeof goal === 'string' ? goal : goal?.question || goal?.goal || '';
            if (goalText) {
                recommendations.push({
                    title: `Address: ${goalText.slice(0, 50)}...`,
                    priority: 'high',
                    impact: 'business_alignment',
                    rationale: 'Directly addresses stated business objective',
                    nextSteps: ['Review relevant analysis outputs', 'Identify key metrics to track']
                });
            }
        }

        // Analysis type recommendations
        if (analysisTypes.includes('correlation') || analysisTypes.includes('regression')) {
            recommendations.push({
                title: 'Validate statistical relationships with domain experts',
                priority: 'medium',
                impact: 'accuracy',
                rationale: 'Statistical correlations require business context validation',
                nextSteps: ['Share findings with subject matter experts', 'Document validation results']
            });
        }

        // Default recommendation
        if (recommendations.length === 0) {
            recommendations.push({
                title: 'Review analysis findings with stakeholders',
                priority: 'high',
                impact: 'decision_making',
                rationale: 'Stakeholder alignment ensures actionable outcomes',
                nextSteps: ['Schedule review meeting', 'Prepare summary presentation']
            });
        }

        return recommendations;
    }


    async extractGoals(userDescription: string, journeyType: string, context: BusinessContext) {
        const prompt = buildGoalExtractionPrompt(userDescription, journeyType, context);
        const aiResult = await this.chimaridataAI.generateInsights({}, "goal_extraction", prompt);

        if (!aiResult.success) {
            throw new Error("Failed to extract goals using AI.");
        }

        return parseGoalExtractionResponse(aiResult.insights, journeyType);
    }

    async decideOnProject(userDescription: string, existingProjects: any[]): Promise<{ shouldCreateNew: boolean, recommendedProjectId?: string }> {
        const prompt = this.buildProjectDecisionPrompt(userDescription, existingProjects);
        const aiResult = await this.chimaridataAI.generateInsights({}, "project_decision", prompt);

        if (!aiResult.success) {
            // Fallback to creating a new project if AI fails
            return { shouldCreateNew: true };
        }

        return this.parseProjectDecisionResponse(aiResult.insights);
    }

    private buildProjectDecisionPrompt(userDescription: string, projects: any[]): string {
        let prompt = `You are an intelligent project manager. Your task is to decide whether to create a new project or use an existing one based on the user's goal.\n\n`;
        prompt += `User's Goal: "${userDescription}"\n\n`;
        prompt += `Existing Projects:\n`;
        projects.forEach(p => {
            prompt += `- ID: ${p.id}, Name: ${p.name}, Description: ${p.description || 'N/A'}\n`;
        });
        prompt += `\nBased on the user's goal, analyze the existing projects. Respond in JSON format with:\n`;
        prompt += `1. "shouldCreateNew" (boolean): true if a new project is more appropriate, false otherwise.\n`;
        prompt += `2. "recommendedProjectId" (string, optional): The ID of the most relevant existing project if shouldCreateNew is false.\n`;
        prompt += `3. "reasoning" (string): A brief explanation for your decision.\n`;
        prompt += `\nReturn only the JSON object.`;
        return prompt;
    }

    private parseProjectDecisionResponse(aiResponse: string): { shouldCreateNew: boolean, recommendedProjectId?: string } {
        try {
            const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return { shouldCreateNew: true }; // Default to new project
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                shouldCreateNew: parsed.shouldCreateNew,
                recommendedProjectId: parsed.recommendedProjectId,
            };
        } catch (error) {
            console.error("Failed to parse project decision response:", error);
            return { shouldCreateNew: true }; // Default to new project on error
        }
    }

    async findTemplates(businessArea: string): Promise<any[]> {
        console.log(`Searching for templates related to: ${businessArea}`);

        const searchResults = await this.knowledgeGraph.searchTemplates(businessArea);
        const groupedResults = new Map<string, any>();

        for (const result of searchResults) {
            const industryName = result.industry.industry;

            if (!groupedResults.has(industryName)) {
                groupedResults.set(industryName, {
                    id: result.industry.nodeId ?? `${industryName.toLowerCase().replace(/\s+/g, '_')}_template`,
                    name: `${industryName} Analysis Template`,
                    description: result.industry.summary ?? `Industry-specific template for ${industryName}`,
                    industry: industryName,
                    commonUseCases: result.industry.commonUseCases,
                    keyMetrics: result.industry.keyMetrics,
                    analysisTemplates: result.industry.analysisTemplates.map((template) => this.mapKnowledgeTemplate(template)),
                    regulatoryConsiderations: result.industry.regulatoryConsiderations,
                    regulations: result.regulations.map((regulation) => regulation.name),
                });
            }
        }

        if (groupedResults.size === 0) {
            const fallbackLabel = (businessArea && businessArea.trim().length > 0) ? businessArea.trim() : 'General Business';
            return [
                {
                    id: `${fallbackLabel.toLowerCase().replace(/\s+/g, '_')}_template`,
                    name: `${fallbackLabel} Analysis Template`,
                    description: `A general template for analyzing ${fallbackLabel}.`,
                    questions: [
                        `What are the key metrics for ${fallbackLabel}?`,
                        `How can we optimize performance in ${fallbackLabel}?`
                    ],
                    analysisTypes: ['descriptive', 'optimization']
                }
            ];
        }

        return Array.from(groupedResults.values());
    }

    // Industry-Specific Knowledge Methods
    async getIndustryTemplate(industry: string): Promise<IndustryTemplate | undefined> {
        if (!industry) {
            return undefined;
        }

        const knowledge = await this.knowledgeGraph.getIndustryKnowledge(industry);
        if (!knowledge) {
            return undefined;
        }

        return {
            industry: knowledge.industry,
            commonUseCases: knowledge.commonUseCases,
            keyMetrics: knowledge.keyMetrics,
            regulatoryConsiderations: knowledge.regulatoryConsiderations,
            analysisTemplates: knowledge.analysisTemplates.map((template) => this.mapKnowledgeTemplate(template)),
            nodeId: knowledge.nodeId,
            summary: knowledge.summary ?? null,
        };
    }

    async getApplicableRegulations(industry: string): Promise<RegulatoryFramework[]> {
        if (!industry) {
            return [];
        }

        const regulations = await this.knowledgeGraph.getRegulationsForIndustry(industry);
        return regulations.map((regulation) => this.mapRegulation(regulation));
    }

    async provideBusinessContext(params: {
        journeyType: string;
        industry?: string;
        goals?: string[];
        analysisTypes?: string[];
        dataAssessment?: DataAssessment;
    }): Promise<PlanBusinessContext> {
        const {
            journeyType,
            industry,
            goals = [],
            analysisTypes = [],
            dataAssessment
        } = params;

        const sanitizedGoals = goals.filter(goal => typeof goal === 'string' && goal.trim().length > 0);
        const sanitizedAnalysisTypes = analysisTypes.filter(type => typeof type === 'string' && type.trim().length > 0);

        const industryTemplate = industry ? await this.getIndustryTemplate(industry) : undefined;
        const regulatoryFrameworks = industry ? await this.getApplicableRegulations(industry) : [];

        const metricSuggestions = await this.suggestBusinessMetrics(
            industry || 'general',
            sanitizedGoals.length > 0 ? sanitizedGoals : ['Overall performance']
        );

        const benchmarkCandidates = industryTemplate?.keyMetrics?.map(metric => `${metric} benchmark`) || [];

        // Generate goal-aware benchmarks that reference actual user objectives
        const fallbackBenchmarks: string[] = [];
        if (sanitizedGoals.length > 0) {
            for (const goal of sanitizedGoals.slice(0, 3)) {
                fallbackBenchmarks.push(`Benchmark: ${goal}`);
            }
        }
        if (fallbackBenchmarks.length === 0) {
            fallbackBenchmarks.push('Benchmark critical KPIs against industry peers');
            fallbackBenchmarks.push('Track period-over-period performance trends');
        }

        // Add metric-based benchmarks from the suggestions we just computed
        const metricBenchmarks = metricSuggestions.primaryMetrics.slice(0, 3).map((m: any) => {
            const name = typeof m === 'string' ? m : m.name;
            return `Industry benchmark: ${name}`;
        });

        const industryBenchmarks = Array.from(new Set([
            ...benchmarkCandidates.slice(0, 3),
            ...metricBenchmarks,
            ...fallbackBenchmarks
        ])).slice(0, 5);

        const relevantKPISet = new Set<string>();
        for (const metric of metricSuggestions.primaryMetrics) {
            relevantKPISet.add(typeof metric === 'string' ? metric : metric.name);
        }
        for (const metric of metricSuggestions.secondaryMetrics) {
            if (relevantKPISet.size >= 6) break;
            relevantKPISet.add(typeof metric === 'string' ? metric : metric.name);
        }
        if (relevantKPISet.size === 0) {
            relevantKPISet.add('Revenue growth');
            relevantKPISet.add('Customer retention');
        }

        const complianceRequirements = regulatoryFrameworks.flatMap(framework =>
            framework.requirements.slice(0, 3).map(requirement => `${framework.name}: ${requirement}`)
        );

        if (complianceRequirements.length === 0) {
            complianceRequirements.push(
                'Review data privacy and retention obligations for collected datasets',
                'Document approval workflow for analysis assets'
            );
        }

        const reportingStandards = regulatoryFrameworks.length > 0
            ? regulatoryFrameworks.map(framework => `${framework.name} reporting standard`)
            : ['Executive business review packet', 'Operational dashboard cadence'];

        const recommendations = new Set<string>();

        if (dataAssessment) {
            if (dataAssessment.qualityScore < 70) {
                recommendations.add('Address identified data quality gaps before presenting findings to stakeholders.');
            }

            if (dataAssessment.missingData?.length) {
                const columns = dataAssessment.missingData.slice(0, 3).join(', ');
                recommendations.add(`Prioritize remediation for missing values across ${columns} to stabilize insights.`);
            }

            if (dataAssessment.infrastructureNeeds.useSpark) {
                recommendations.add('Coordinate Spark-enabled processing windows with data engineering when scheduling workloads.');
            }

            recommendations.add(`Plan stakeholder communication around the ${dataAssessment.estimatedProcessingTime} processing window to manage expectations.`);
        }

        if (journeyType === 'business') {
            recommendations.add('Frame insights in terms of financial impact, KPI movement, and operational actions.');
        } else if (journeyType === 'non-tech') {
            recommendations.add('Translate analytical findings into plain-language narratives with supporting visuals.');
        }

        if (sanitizedAnalysisTypes.some(type => /forecast|predict/i.test(type))) {
            recommendations.add('Align forecasting deliverables with planning and budgeting cycles.');
        }

        if (sanitizedAnalysisTypes.some(type => /correlation|regression/i.test(type))) {
            recommendations.add('Validate identified relationships with domain experts before making operational changes.');
        }

        if (sanitizedAnalysisTypes.some(type => /cluster|segment/i.test(type))) {
            recommendations.add('Review segment definitions with business stakeholders to ensure actionability.');
        }

        // Add goal-specific recommendations
        for (const goal of sanitizedGoals.slice(0, 2)) {
            const goalLower = goal.toLowerCase();
            if (goalLower.includes('engag') || goalLower.includes('satisf')) {
                recommendations.add(`Track engagement/satisfaction trends over time to measure intervention effectiveness.`);
            } else if (goalLower.includes('perform') || goalLower.includes('productiv')) {
                recommendations.add(`Establish performance baselines before implementing changes from analysis findings.`);
            } else if (goalLower.includes('cost') || goalLower.includes('efficienc')) {
                recommendations.add(`Quantify potential savings from recommended optimizations to build business case.`);
            }
        }

        if (recommendations.size === 0) {
            recommendations.add('Review draft analysis outputs with business stakeholders before final approval.');
        }

        return {
            industryBenchmarks,
            relevantKPIs: Array.from(relevantKPISet),
            complianceRequirements,
            reportingStandards,
            recommendations: Array.from(recommendations)
        };
    }

    async generateIndustryInsights(context: BusinessContext): Promise<any> {
        const { industry, dataSchema } = context;

        if (!industry) {
            return {
                insights: ['General data analysis recommendations'],
                templates: [],
                regulations: []
            };
        }

        const industryTemplate = await this.getIndustryTemplate(industry);
        const applicableRegulations = await this.getApplicableRegulations(industry);

        const insights: string[] = [];
        const recommendedTemplates: any[] = [];

        if (industryTemplate) {
            // Generate industry-specific insights
            insights.push(`This ${industry} dataset can benefit from industry-specific analysis approaches`);

            // Check data schema against industry templates
            if (dataSchema) {
                const dataColumns = Object.keys(dataSchema).map(col => col.toLowerCase());

                for (const template of industryTemplate.analysisTemplates) {
                    const matchingColumns = template.requiredColumns.filter(required =>
                        dataColumns.some(col => col.includes(required.toLowerCase()))
                    );

                    if (matchingColumns.length >= template.requiredColumns.length * 0.6) {
                        recommendedTemplates.push({
                            ...template,
                            matchScore: matchingColumns.length / template.requiredColumns.length,
                            availableColumns: matchingColumns
                        });

                        insights.push(`Your data appears suitable for ${template.name}: ${template.businessValue}`);
                    }
                }
            }

            // Add regulatory considerations
            if (applicableRegulations.length > 0) {
                insights.push(`Consider compliance with: ${applicableRegulations.map(reg => reg.name).join(', ')}`);
            }

            // Add key metrics recommendations
            insights.push(`Key ${industry} metrics to track: ${industryTemplate.keyMetrics.slice(0, 3).join(', ')}`);
        }

        return {
            insights,
            recommendedTemplates: recommendedTemplates.sort((a, b) => b.matchScore - a.matchScore),
            applicableRegulations,
            industryMetrics: industryTemplate?.keyMetrics || [],
            commonUseCases: industryTemplate?.commonUseCases || []
        };
    }

    async validateRegulatoryCompliance(analysis: any, industry: string): Promise<any> {
        const regulations = await this.getApplicableRegulations(industry);
        const complianceReport: {
            overallCompliance: 'compliant' | 'attention_required';
            warnings: string[];
            requirements: string[];
            recommendations: string[];
        } = {
            overallCompliance: 'compliant',
            warnings: [],
            requirements: [],
            recommendations: []
        };

        for (const regulation of regulations) {
            switch (regulation.name) {
                case 'GDPR':
                    if (analysis.personalData) {
                        complianceReport.warnings.push('Personal data detected - ensure GDPR compliance');
                        complianceReport.requirements.push('Obtain explicit consent for data processing');
                        complianceReport.requirements.push('Implement data anonymization where possible');
                    }
                    break;

                case 'HIPAA':
                    if (analysis.healthData) {
                        complianceReport.warnings.push('Health data detected - HIPAA compliance required');
                        complianceReport.requirements.push('Implement access controls and audit trails');
                        complianceReport.requirements.push('Ensure PHI encryption and secure storage');
                    }
                    break;

                case 'SOX':
                    if (analysis.financialData) {
                        complianceReport.warnings.push('Financial data analysis - SOX compliance considerations');
                        complianceReport.requirements.push('Document internal controls and processes');
                        complianceReport.requirements.push('Maintain audit trails for data changes');
                    }
                    break;

                case 'Basel III':
                    if (analysis.riskModeling) {
                        complianceReport.warnings.push('Risk modeling detected - Basel III validation required');
                        complianceReport.requirements.push('Implement model risk management framework');
                        complianceReport.requirements.push('Conduct regular model validation and backtesting');
                    }
                    break;
            }
        }

        // General recommendations
        complianceReport.recommendations = [
            'Implement data governance policies',
            'Regular compliance audits',
            'Staff training on regulatory requirements',
            'Documentation of all analysis procedures'
        ];

        if (complianceReport.warnings.length > 0) {
            complianceReport.overallCompliance = 'attention_required';
        }

        return complianceReport;
    }

    async generateBusinessKPIs(industry: string, analysisType: string): Promise<any> {
        const industryTemplate = await this.getIndustryTemplate(industry);

        if (!industryTemplate) {
            return {
                primaryKPIs: ['Revenue growth', 'Cost reduction', 'Efficiency improvement'],
                secondaryKPIs: ['Customer satisfaction', 'Process optimization'],
                benchmarks: []
            };
        }

        const kpis: {
            primaryKPIs: string[];
            secondaryKPIs: string[];
            benchmarks: { metric: string; target: string; industry_average: string }[];
            calculationMethods: Record<string, any>;
        } = {
            primaryKPIs: [] as string[],
            secondaryKPIs: [] as string[],
            benchmarks: [] as { metric: string; target: string; industry_average: string }[],
            calculationMethods: {} as Record<string, any>
        };

        // Industry-specific KPI mapping
        switch (industry.toLowerCase()) {
            case 'healthcare':
                kpis.primaryKPIs = ['Patient satisfaction', 'Readmission rate', 'Length of stay'];
                kpis.secondaryKPIs = ['Cost per patient', 'Staff productivity', 'Quality scores'];
                kpis.benchmarks = [
                    { metric: 'Readmission rate', target: '<15%', industry_average: '18%' },
                    { metric: 'Patient satisfaction', target: '>90%', industry_average: '85%' }
                ];
                break;

            case 'finance':
                kpis.primaryKPIs = ['ROI', 'Risk-adjusted returns', 'Default rate'];
                kpis.secondaryKPIs = ['Processing time', 'Compliance score', 'Customer acquisition cost'];
                kpis.benchmarks = [
                    { metric: 'Default rate', target: '<3%', industry_average: '4.2%' },
                    { metric: 'ROI', target: '>12%', industry_average: '10.5%' }
                ];
                break;

            case 'retail':
                kpis.primaryKPIs = ['Customer lifetime value', 'Conversion rate', 'Average order value'];
                kpis.secondaryKPIs = ['Inventory turnover', 'Customer acquisition cost', 'Return rate'];
                kpis.benchmarks = [
                    { metric: 'Conversion rate', target: '>3%', industry_average: '2.5%' },
                    { metric: 'Customer lifetime value', target: '>$500', industry_average: '$400' }
                ];
                break;

            case 'manufacturing':
                kpis.primaryKPIs = ['OEE', 'Defect rate', 'Throughput'];
                kpis.secondaryKPIs = ['Energy efficiency', 'Labor productivity', 'Safety incidents'];
                kpis.benchmarks = [
                    { metric: 'OEE', target: '>85%', industry_average: '78%' },
                    { metric: 'Defect rate', target: '<1%', industry_average: '2.3%' }
                ];
                break;

            case 'hr':
            case 'human_resources':
            case 'employee_engagement':
            case 'workforce':
            case 'talent':
            case 'people':
                kpis.primaryKPIs = ['Employee retention rate', 'Employee engagement score', 'Turnover rate', 'Employee satisfaction index'];
                kpis.secondaryKPIs = ['Time to hire', 'Training completion rate', 'Absenteeism rate', 'Internal promotion rate', 'Performance review completion'];
                kpis.benchmarks = [
                    { metric: 'Turnover rate', target: '<15%', industry_average: '18%' },
                    { metric: 'Engagement score', target: '>75%', industry_average: '68%' },
                    { metric: 'Time to hire', target: '<30 days', industry_average: '42 days' },
                    { metric: 'Employee satisfaction', target: '>80%', industry_average: '72%' }
                ];
                break;

            case 'education':
            case 'academic':
            case 'school':
            case 'university':
            case 'learning':
                kpis.primaryKPIs = ['Student retention rate', 'Graduation rate', 'Student satisfaction score', 'Academic achievement'];
                kpis.secondaryKPIs = ['Course completion rate', 'Teacher effectiveness score', 'Employment placement rate', 'Parent satisfaction'];
                kpis.benchmarks = [
                    { metric: 'Graduation rate', target: '>85%', industry_average: '78%' },
                    { metric: 'Student satisfaction', target: '>80%', industry_average: '72%' },
                    { metric: 'Retention rate', target: '>90%', industry_average: '85%' }
                ];
                break;

            case 'nonprofit':
            case 'non_profit':
            case 'ngo':
            case 'charity':
                kpis.primaryKPIs = ['Donor retention rate', 'Program effectiveness', 'Mission impact score', 'Volunteer engagement'];
                kpis.secondaryKPIs = ['Cost per beneficiary', 'Fundraising efficiency', 'Overhead ratio', 'Community reach'];
                kpis.benchmarks = [
                    { metric: 'Donor retention', target: '>45%', industry_average: '40%' },
                    { metric: 'Overhead ratio', target: '<25%', industry_average: '28%' },
                    { metric: 'Program efficiency', target: '>75%', industry_average: '70%' }
                ];
                break;

            default:
                kpis.primaryKPIs = industryTemplate.keyMetrics.slice(0, 3);
                kpis.secondaryKPIs = industryTemplate.keyMetrics.slice(3, 6);
        }

        return kpis;
    }

    async suggestDataEnrichment(context: BusinessContext): Promise<any> {
        const { industry, dataSchema } = context;
        const suggestions = [];

        const industryTemplate = industry ? await this.getIndustryTemplate(industry) : undefined;

        if (industryTemplate && dataSchema) {
            const currentColumns = Object.keys(dataSchema).map(col => col.toLowerCase());

            // Check for missing important columns
            for (const template of industryTemplate.analysisTemplates) {
                const missingColumns = template.requiredColumns.filter(required =>
                    !currentColumns.some(col => col.includes(required.toLowerCase()))
                );

                if (missingColumns.length > 0) {
                    suggestions.push({
                        type: 'missing_data',
                        analysisType: template.name,
                        missingColumns,
                        impact: `Required for ${template.businessValue}`,
                        priority: 'high'
                    });
                }
            }

            // Suggest external data sources
            if (industry) {
                const externalSources = this.getExternalDataSources(industry);
                suggestions.push(...externalSources);
            }
        }

        return {
            suggestions,
            estimatedValue: this.calculateEnrichmentValue(suggestions),
            implementationComplexity: this.assessImplementationComplexity(suggestions)
        };
    }

    private mapKnowledgeTemplate(template: KnowledgeTemplate): AnalysisTemplate {
        return {
            id: template.id,
            name: template.name,
            type: template.type ?? 'general',
            description: template.description ?? '',
            requiredColumns: Array.isArray(template.requiredColumns) ? template.requiredColumns : [],
            expectedOutcomes: Array.isArray(template.expectedOutcomes) ? template.expectedOutcomes : [],
            businessValue: template.businessValue ?? ''
        };
    }

    private mapRegulation(regulation: RegulationKnowledge): RegulatoryFramework {
        return {
            name: regulation.name,
            description: regulation.description ?? '',
            requirements: regulation.requirements,
            applicableIndustries: regulation.applicableIndustries,
            nodeId: regulation.nodeId
        };
    }

    private getExternalDataSources(industry: string): any[] {
        const sources = [];

        switch (industry.toLowerCase()) {
            case 'retail':
                sources.push(
                    { source: 'Weather data', benefit: 'Improve demand forecasting', complexity: 'low' },
                    { source: 'Economic indicators', benefit: 'Better trend prediction', complexity: 'medium' },
                    { source: 'Social media sentiment', benefit: 'Brand perception analysis', complexity: 'high' }
                );
                break;

            case 'finance':
                sources.push(
                    { source: 'Credit bureau data', benefit: 'Enhanced risk assessment', complexity: 'medium' },
                    { source: 'Market data feeds', benefit: 'Real-time pricing models', complexity: 'high' },
                    { source: 'Regulatory filings', benefit: 'Compliance monitoring', complexity: 'medium' }
                );
                break;

            case 'healthcare':
                sources.push(
                    { source: 'Population health data', benefit: 'Better outcome prediction', complexity: 'high' },
                    { source: 'Drug interaction databases', benefit: 'Safety improvements', complexity: 'medium' },
                    { source: 'Clinical guidelines', benefit: 'Treatment optimization', complexity: 'low' }
                );
                break;
        }

        return sources.map(source => ({ type: 'external_data', ...source, priority: 'medium' }));
    }

    private calculateEnrichmentValue(suggestions: any[]): string {
        const highValue = suggestions.filter(s => s.priority === 'high').length;
        const mediumValue = suggestions.filter(s => s.priority === 'medium').length;

        const score = highValue * 3 + mediumValue * 2;

        if (score >= 8) return 'high';
        if (score >= 4) return 'medium';
        return 'low';
    }

    private assessImplementationComplexity(suggestions: any[]): string {
        const complexities = suggestions.map(s => s.complexity || 'medium');
        const avgComplexity = complexities.reduce((sum, c) => {
            return sum + (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
        }, 0) / complexities.length;

        if (avgComplexity >= 2.5) return 'high';
        if (avgComplexity >= 1.5) return 'medium';
        return 'low';
    }

    // ==========================================
    // CONSULTATION METHODS (Multi-Agent Coordination)
    // ==========================================

    /**
     * Assess business impact of proposed technical approach
     */
    async assessBusinessImpact(
        goals: string[],
        proposedApproach: any,
        industry: string
    ): Promise<BusinessImpactReport> {
        console.log(`💼 Business Agent: Assessing business impact for ${industry || 'general'} industry`);

        // Handle null/undefined inputs gracefully
        if (!goals || !Array.isArray(goals)) {
            return {
                businessValue: 'low',
                alignment: 0,
                expectedROI: 'Unable to calculate - no goals provided',
                benefits: ['Please provide clear business goals for analysis'],
                risks: ['Unclear project objectives'],
                recommendations: ['Define specific business goals and retry analysis'],
                industryInsights: ['Industry context needed for proper assessment'],
                complianceConsiderations: ['Compliance requirements depend on project scope']
            };
        }

        if (!industry || typeof industry !== 'string') {
            return {
                businessValue: 'medium',
                alignment: 0.4,
                expectedROI: 'Moderate - industry context missing',
                benefits: ['Analysis can proceed with general business principles'],
                risks: ['Industry-specific risks may not be identified'],
                recommendations: ['Provide industry context for more accurate assessment'],
                industryInsights: ['General business insights available'],
                complianceConsiderations: ['Standard compliance considerations apply']
            };
        }

        const benefits: string[] = [];
        const risks: string[] = [];
        const recommendations: string[] = [];
        let businessValue: 'high' | 'medium' | 'low' = 'medium';

        // Analyze goals for business value
        const goalsLower = goals.map(g => g.toLowerCase()).join(' ');

        if (goalsLower.includes('segment') || goalsLower.includes('customer')) {
            benefits.push('Customer segmentation enables targeted marketing campaigns');
            benefits.push('Improved customer retention through personalized experiences');
            businessValue = 'high';
            recommendations.push('Schedule monthly segmentation updates to track changes');
        }

        if (goalsLower.includes('revenue') || goalsLower.includes('sales') || goalsLower.includes('profit')) {
            benefits.push('Direct revenue impact through optimized pricing and sales strategies');
            businessValue = 'high';
            recommendations.push('Track ROI metrics for implemented recommendations');
        }

        if (goalsLower.includes('churn') || goalsLower.includes('retention')) {
            benefits.push('Reduced customer acquisition costs through improved retention');
            risks.push('Churn prediction requires continuous model updates');
            businessValue = 'high';
        }

        // Industry-specific considerations
        if (industry) {
            const industryLower = industry.toLowerCase();

            if (industryLower.includes('retail')) {
                if (proposedApproach.method === 'rfm_analysis') {
                    benefits.push('RFM analysis is proven standard in retail industry');
                    benefits.push('Easy to explain to stakeholders and implement in CRM');
                    businessValue = 'high';
                }
                recommendations.push('Integrate with existing CRM and marketing automation tools');
            }

            if (industryLower.includes('finance') || industryLower.includes('banking')) {
                risks.push('Financial data requires strict regulatory compliance (GDPR, SOX)');
                recommendations.push('Ensure all analysis meets regulatory requirements');
            }

            if (industryLower.includes('healthcare')) {
                risks.push('Healthcare data subject to HIPAA regulations');
                recommendations.push('Implement proper data anonymization and access controls');
            }
        }

        // Calculate alignment scores
        const goalsAlignment = benefits.length / Math.max(goals.length, 1);
        const industryAlignment = industry ? 0.90 : 0.70;
        const bestPracticesAlignment = proposedApproach.method?.includes('standard') ||
            proposedApproach.method?.includes('proven') ? 0.90 : 0.75;

        // Overall alignment score (return as number for API compatibility)
        const overallAlignment = (goalsAlignment + industryAlignment + bestPracticesAlignment) / 3;

        // Determine expected ROI
        const expectedROI = overallAlignment > 0.85 ? 'High' :
            overallAlignment > 0.70 ? 'Medium to High' :
                overallAlignment > 0.55 ? 'Medium' : 'Low to Medium';

        return {
            businessValue,
            confidence: 0.88,
            alignment: overallAlignment, // Return as number
            alignmentFactors: { // Keep detailed breakdown as separate property
                goals: goalsAlignment,
                industry: industryAlignment,
                bestPractices: bestPracticesAlignment
            },
            benefits,
            risks,
            recommendations,
            expectedROI
        };
    }

    /**
     * Auto-detect industry from project context (file names, columns, questions)
     * P1 FIX: Enhanced industry detection for context-aware KPIs
     */
    async autoDetectIndustryFromContext(context: {
        fileNames?: string[];
        columnNames?: string[];
        userQuestions?: string[];
        projectDescription?: string;
    }): Promise<{ industry: string; confidence: number; signals: string[] }> {
        const signals: string[] = [];
        const industryScores: Record<string, number> = {};

        // File name patterns for industry detection
        const filePatterns: Record<string, string[]> = {
            'hr': ['employee', 'roster', 'hr', 'engagement', 'turnover', 'retention', 'payroll', 'staff', 'workforce', 'talent'],
            'education': ['student', 'grade', 'course', 'enrollment', 'academic', 'teacher', 'school', 'class', 'curriculum'],
            'healthcare': ['patient', 'medical', 'diagnosis', 'treatment', 'clinical', 'health', 'hospital', 'doctor'],
            'retail': ['sales', 'inventory', 'customer', 'order', 'product', 'store', 'retail', 'purchase'],
            'finance': ['transaction', 'account', 'balance', 'payment', 'invoice', 'bank', 'loan', 'credit']
        };

        // Check file names
        context.fileNames?.forEach(fileName => {
            const lowerName = fileName.toLowerCase();
            for (const [industry, patterns] of Object.entries(filePatterns)) {
                if (patterns.some(p => lowerName.includes(p))) {
                    industryScores[industry] = (industryScores[industry] || 0) + 2;
                    signals.push(`File "${fileName}" suggests ${industry}`);
                }
            }
        });

        // Column name patterns for industry detection
        const columnPatterns: Record<string, string[]> = {
            'hr': ['employee_id', 'department', 'manager', 'hire_date', 'engagement', 'satisfaction', 'tenure', 'salary', 'performance', 'job_title'],
            'education': ['student_id', 'grade_level', 'gpa', 'enrollment', 'credits', 'course_id', 'teacher_id', 'semester'],
            'healthcare': ['patient_id', 'diagnosis', 'treatment', 'prescription', 'visit_date', 'doctor_id', 'symptoms'],
            'retail': ['product_id', 'quantity', 'price', 'discount', 'customer_id', 'order_id', 'sku', 'category'],
            'finance': ['account_id', 'transaction_id', 'amount', 'balance', 'interest_rate', 'due_date', 'credit_score']
        };

        // Check column names
        context.columnNames?.forEach(colName => {
            const lowerCol = colName.toLowerCase().replace(/[\s-]/g, '_');
            for (const [industry, patterns] of Object.entries(columnPatterns)) {
                if (patterns.some(p => lowerCol.includes(p.replace(/[\s-]/g, '_')))) {
                    industryScores[industry] = (industryScores[industry] || 0) + 1;
                    signals.push(`Column "${colName}" suggests ${industry}`);
                }
            }
        });

        // User question patterns
        const questionPatterns: Record<string, string[]> = {
            'hr': ['employee', 'team', 'manager', 'leader', 'engagement', 'turnover', 'department', 'hire', 'staff', 'workforce'],
            'education': ['student', 'teacher', 'grade', 'class', 'course', 'school', 'academic', 'learning', 'graduation'],
            'healthcare': ['patient', 'treatment', 'diagnosis', 'medical', 'health', 'hospital', 'doctor', 'clinical'],
            'retail': ['customer', 'sales', 'product', 'order', 'purchase', 'store', 'inventory', 'revenue'],
            'finance': ['transaction', 'account', 'payment', 'loan', 'credit', 'balance', 'financial', 'bank']
        };

        // Check user questions
        context.userQuestions?.forEach(question => {
            const lowerQuestion = question.toLowerCase();
            for (const [industry, patterns] of Object.entries(questionPatterns)) {
                const matches = patterns.filter(p => lowerQuestion.includes(p));
                if (matches.length > 0) {
                    industryScores[industry] = (industryScores[industry] || 0) + matches.length;
                    signals.push(`Question mentions ${matches.join(', ')} (${industry})`);
                }
            }
        });

        // Check project description
        if (context.projectDescription) {
            const lowerDesc = context.projectDescription.toLowerCase();
            for (const [industry, patterns] of Object.entries(questionPatterns)) {
                const matches = patterns.filter(p => lowerDesc.includes(p));
                if (matches.length > 0) {
                    industryScores[industry] = (industryScores[industry] || 0) + matches.length;
                    signals.push(`Description mentions ${matches.join(', ')} (${industry})`);
                }
            }
        }

        // Find highest scoring industry
        const sortedIndustries = Object.entries(industryScores)
            .sort((a, b) => b[1] - a[1]);

        const topIndustry = sortedIndustries[0];

        if (topIndustry && topIndustry[1] >= 2) {
            const confidence = Math.min(topIndustry[1] / 10, 0.95);
            console.log(`🏭 [Industry Detection] Detected: ${topIndustry[0]} (score: ${topIndustry[1]}, confidence: ${confidence.toFixed(2)})`);
            console.log(`🏭 [Industry Detection] Signals: ${signals.slice(0, 5).join('; ')}`);
            return {
                industry: topIndustry[0],
                confidence,
                signals
            };
        }

        console.log(`🏭 [Industry Detection] No strong industry signals detected, defaulting to general`);
        return { industry: 'general', confidence: 0.5, signals: ['No strong industry signals detected'] };
    }

    /**
     * Suggest industry-specific business metrics
     */
    async suggestBusinessMetrics(
        industryOrRequest: string | { industry?: string; goals?: string[] } | undefined,
        goalsArg?: string[]
    ): Promise<MetricRecommendations> {
        let industry = '';
        let goals: string[] | undefined = goalsArg;

        if (typeof industryOrRequest === 'string') {
            industry = industryOrRequest;
        } else if (industryOrRequest && typeof industryOrRequest === 'object' && !Array.isArray(industryOrRequest)) {
            industry = industryOrRequest.industry ?? '';
            goals = industryOrRequest.goals ?? goalsArg;
        }

        console.log(`💼 Business Agent: Suggesting metrics for industry="${industry || 'general'}", goals=[${Array.isArray(goals) ? goals.slice(0, 3).join(', ') : 'none'}]`);

        const hasGoalsArray = Array.isArray(goals);
        const sanitizedGoals = hasGoalsArray
            ? (goals as string[]).filter((goal) => typeof goal === 'string' && goal.trim().length > 0)
            : [];
        const normalizedIndustry = typeof industry === 'string' ? industry.trim() : '';
        const knowledgeTemplate = normalizedIndustry ? await this.getIndustryTemplate(normalizedIndustry) : undefined;

        const primaryMetrics: MetricRecommendations['primaryMetrics'] = [];
        const secondaryMetrics: MetricRecommendations['secondaryMetrics'] = [];
        const seenMetrics = new Set<string>();
        const warnings: string[] = [];
        const recommendations: string[] = [];

        const pushMetric = (
            collection: MetricRecommendations['primaryMetrics'],
            metric: MetricRecommendations['primaryMetrics'][number]
        ) => {
            const identifier = typeof metric === 'string' ? metric.toLowerCase() : metric.name.toLowerCase();
            if (seenMetrics.has(identifier)) {
                return;
            }
            collection.push(metric);
            seenMetrics.add(identifier);
        };

        const genericGoalsProvided = sanitizedGoals.length > 0 && sanitizedGoals.every(goal => /test|sample|demo|placeholder/i.test(goal));

        if (!hasGoalsArray || sanitizedGoals.length === 0 || genericGoalsProvided) {
            warnings.push('No specific goals provided - using general metrics');
            recommendations.push('Define clear business goals for more targeted metrics');
        }

        if (!normalizedIndustry) {
            warnings.push('Industry context missing - using general metrics');
            recommendations.push('Provide industry context for industry-specific metrics');
        }

        if (knowledgeTemplate) {
            knowledgeTemplate.keyMetrics.forEach((metric, index) => {
                const targetCollection = index < 3 ? primaryMetrics : secondaryMetrics;
                pushMetric(targetCollection, metric);
            });
        }

        const goalsLower = sanitizedGoals.map((goal) => goal.toLowerCase()).join(' ');
        const industryLower = normalizedIndustry.toLowerCase();

        if (goalsLower.includes('customer') || goalsLower.includes('segment')) {
            pushMetric(primaryMetrics, {
                name: 'Customer Lifetime Value (CLV)',
                description: 'Predicted revenue from a customer over their entire relationship',
                calculation: 'Average Purchase Value × Purchase Frequency × Customer Lifespan',
                businessImpact: 'Identifies the most valuable customer segments for focused investment'
            });

            pushMetric(secondaryMetrics, {
                name: 'Customer Acquisition Cost (CAC)',
                description: 'Cost to acquire a new customer',
                calculation: 'Total Marketing and Sales Costs / Number of New Customers'
            });
        }

        if (goalsLower.includes('revenue') || goalsLower.includes('sales')) {
            pushMetric(primaryMetrics, {
                name: 'Revenue Growth Rate',
                description: 'Rate of revenue increase period-over-period',
                calculation: '(Current Period Revenue - Previous Period Revenue) / Previous Period Revenue',
                businessImpact: 'Measures growth trajectory and market expansion effectiveness'
            });
        }

        if (goalsLower.includes('churn') || goalsLower.includes('retention')) {
            pushMetric(primaryMetrics, {
                name: 'Customer Retention Rate',
                description: 'Percentage of customers retained over a period',
                calculation: '((End Customers - New Customers) / Start Customers) × 100',
                businessImpact: 'Higher retention increases profitability and lifetime value'
            });
        }

        // HR/Employee engagement - check BOTH goals AND industry for HR keywords
        // ✅ P1-3 FIX: Also check industryLower to ensure HR KPIs show for detected HR projects
        const isHRIndustry = industryLower.includes('hr') || industryLower.includes('human resource') ||
            industryLower.includes('employee') || industryLower === 'employee engagement' ||
            industryLower.includes('workforce') || industryLower.includes('talent');
        const hasHRGoals = goalsLower.includes('employee') || goalsLower.includes('engagement') ||
            goalsLower.includes('workforce') || goalsLower.includes('hr') ||
            goalsLower.includes('staff') || goalsLower.includes('turnover') ||
            goalsLower.includes('retention rate') || goalsLower.includes('satisfaction');

        if (isHRIndustry || hasHRGoals) {
            console.log(`✅ [P1-3 FIX] Adding HR KPIs - isHRIndustry=${isHRIndustry}, hasHRGoals=${hasHRGoals}, industryLower="${industryLower}"`);
            pushMetric(primaryMetrics, {
                name: 'Employee Engagement Score',
                description: 'Composite measure of employee commitment and satisfaction',
                calculation: 'Weighted average of survey responses across engagement dimensions',
                businessImpact: 'Higher engagement correlates with productivity, retention, and business performance'
            });

            pushMetric(primaryMetrics, {
                name: 'Employee Turnover Rate',
                description: 'Percentage of employees who leave within a period',
                calculation: '(Employees who left / Average total employees) × 100',
                businessImpact: 'Lower turnover reduces hiring costs and preserves institutional knowledge'
            });

            pushMetric(primaryMetrics, {
                name: 'Employee Satisfaction Index',
                description: 'Overall satisfaction score from employee surveys',
                calculation: 'Average satisfaction rating across all survey dimensions',
                businessImpact: 'Satisfied employees are more productive and less likely to leave'
            });

            pushMetric(secondaryMetrics, {
                name: 'Time to Hire',
                description: 'Average days from job posting to offer acceptance',
                calculation: 'Sum of days to fill positions / Number of positions filled'
            });

            pushMetric(secondaryMetrics, {
                name: 'Absenteeism Rate',
                description: 'Percentage of scheduled work time missed',
                calculation: '(Absent days / Total scheduled days) × 100'
            });

            pushMetric(secondaryMetrics, {
                name: 'Internal Promotion Rate',
                description: 'Percentage of open positions filled internally',
                calculation: '(Internal hires / Total hires) × 100'
            });
        }

        // Education - check BOTH goals AND industry for education keywords
        // ✅ P1-3 FIX: Also check industryLower to ensure Education KPIs show for detected education projects
        const isEducationIndustry = industryLower.includes('education') || industryLower.includes('school') ||
            industryLower.includes('university') || industryLower.includes('academic') ||
            industryLower.includes('learning') || industryLower.includes('training');
        const hasEducationGoals = goalsLower.includes('student') || goalsLower.includes('graduation') ||
            goalsLower.includes('academic') || goalsLower.includes('learning') ||
            goalsLower.includes('teacher') || goalsLower.includes('school');

        if (isEducationIndustry || hasEducationGoals) {
            pushMetric(primaryMetrics, {
                name: 'Student Retention Rate',
                description: 'Percentage of students who continue enrollment',
                calculation: '(Returning students / Previous enrollment) × 100',
                businessImpact: 'Higher retention indicates program value and student satisfaction'
            });

            pushMetric(primaryMetrics, {
                name: 'Graduation Rate',
                description: 'Percentage of students completing their program',
                calculation: '(Graduates / Initial cohort) × 100',
                businessImpact: 'Key indicator of program effectiveness and student success'
            });

            pushMetric(secondaryMetrics, {
                name: 'Course Completion Rate',
                description: 'Percentage of enrolled students completing courses',
                calculation: '(Completed enrollments / Total enrollments) × 100'
            });
        }

        if (industryLower.includes('retail') || industryLower.includes('ecommerce')) {
            pushMetric(primaryMetrics, {
                name: 'Average Order Value (AOV)',
                description: 'Average amount spent per transaction',
                calculation: 'Total Revenue / Number of Orders',
                businessImpact: 'Guides merchandising strategy and upsell opportunities'
            });

            pushMetric(secondaryMetrics, {
                name: 'Cart Abandonment Rate',
                description: 'Percentage of shopping carts abandoned before purchase',
                calculation: '(1 - (Completed Purchases / Shopping Carts Created)) × 100'
            });
        }

        if (industryLower.includes('saas') || industryLower.includes('software')) {
            pushMetric(primaryMetrics, {
                name: 'Monthly Recurring Revenue (MRR)',
                description: 'Predictable monthly subscription revenue',
                calculation: 'Number of Subscribers × Average Revenue Per User',
                businessImpact: 'Core metric for SaaS business health and valuation'
            });

            pushMetric(secondaryMetrics, {
                name: 'Net Revenue Retention (NRR)',
                description: 'Growth rate after accounting for upgrades, downgrades, and churn',
                calculation: '((MRR Start + Expansion - Contraction - Churn) / MRR Start) × 100'
            });
        }

        if (primaryMetrics.length === 0) {
            pushMetric(primaryMetrics, 'Customer satisfaction');
            pushMetric(primaryMetrics, 'Revenue growth');
        }

        if (secondaryMetrics.length === 0) {
            pushMetric(secondaryMetrics, 'Market share');
            pushMetric(secondaryMetrics, 'Customer retention');
        }

        const response: MetricRecommendations = {
            primaryMetrics,
            secondaryMetrics,
            industry: normalizedIndustry || 'General'
        };

        response.industrySpecific = knowledgeTemplate ? knowledgeTemplate.keyMetrics : ['General business metrics'];

        if (warnings.length > 0) {
            response.warnings = warnings;
        }

        if (recommendations.length > 0) {
            response.recommendations = recommendations;
        }

        response.metrics = {
            primary: [...primaryMetrics],
            secondary: [...secondaryMetrics]
        };

        return response;
    }

    /**
     * Validate alignment between technical approach and business goals
     */
    async validateBusinessAlignment(
        technicalApproach: any,
        businessGoals: string[]
    ): Promise<AlignmentScore> {
        console.log(`💼 Business Agent: Validating alignment with ${businessGoals.length} business goals`);

        const alignmentFactors: AlignmentScore['alignmentFactors'] = [];
        const gaps: string[] = [];
        const suggestions: string[] = [];
        let score = 0.73; // Start with base alignment score (adjusted to account for typical deductions)

        const goalsLower = businessGoals.map(g => g.toLowerCase()).join(' ');

        // Check if technical approach addresses business goals
        if (technicalApproach.type === 'segmentation' || technicalApproach.method?.includes('segment')) {
            if (goalsLower.includes('segment') || goalsLower.includes('customer') || goalsLower.includes('target')) {
                alignmentFactors.push({
                    factor: 'Segmentation addresses customer understanding goals',
                    aligned: true,
                    impact: 'Enables targeted marketing and personalization'
                });
                score += 0.15; // Increase for good match
            } else {
                gaps.push('Segmentation proposed but business goals do not explicitly mention customer targeting');
                suggestions.push('Clarify how customer segments will be used in business strategy');
                score -= 0.10; // Decrease for mismatch
            }
        }

        // Check for clustering analysis alignment
        if (technicalApproach.analyses?.includes('clustering')) {
            if (goalsLower.includes('segment') || goalsLower.includes('group') || goalsLower.includes('cluster')) {
                alignmentFactors.push({
                    factor: 'Clustering analysis matches segmentation goals',
                    aligned: true,
                    impact: 'Enables data-driven customer grouping'
                });
                score += 0.15; // Strong match
            } else {
                gaps.push('Clustering analysis without explicit segmentation goals');
                suggestions.push('Define how identified clusters will be used in business strategy');
                score -= 0.05; // Minor mismatch
            }
        }

        if (technicalApproach.type === 'prediction' || technicalApproach.type === 'forecasting') {
            if (goalsLower.includes('forecast') || goalsLower.includes('predict') || goalsLower.includes('future')) {
                alignmentFactors.push({
                    factor: 'Predictive modeling aligns with forecasting goals',
                    aligned: true,
                    impact: 'Enables proactive business planning and resource allocation'
                });
                score += 0.10;
            } else {
                gaps.push('Predictive modeling without forecasting goals');
                suggestions.push('Specify business outcomes to predict (revenue, churn, demand)');
                score -= 0.05;
            }
        }

        // Check for ROI considerations
        if (goalsLower.includes('revenue') || goalsLower.includes('profit') || goalsLower.includes('cost')) {
            alignmentFactors.push({
                factor: 'Financial impact clearly stated in goals',
                aligned: true,
                impact: 'Facilitates ROI measurement and stakeholder buy-in'
            });
            score += 0.08;
        } else {
            gaps.push('Business goals do not specify expected financial impact');
            suggestions.push('Define success metrics in terms of revenue, cost savings, or efficiency gains');
            score -= 0.03;
        }

        // Check for actionability
        if (technicalApproach.outputs?.includes('recommendations') || technicalApproach.outputs?.includes('actions')) {
            alignmentFactors.push({
                factor: 'Analysis produces actionable recommendations',
                aligned: true,
                impact: 'Ensures insights translate to business actions'
            });
            score += 0.05;
        } else if (businessGoals.some(g => g.toLowerCase().includes('action') || g.toLowerCase().includes('implement'))) {
            gaps.push('Goals require actionable outputs but technical approach lacks recommendation generation');
            suggestions.push('Add recommendation generation to technical approach');
            score -= 0.05;
        }

        return {
            score: Math.max(0.0, Math.min(0.95, score)), // Ensure score is between 0 and 0.95
            alignmentFactors,
            gaps,
            suggestions
        };
    }

    // ==========================================
    // WEEK 2: AUDIENCE TRANSLATION METHODS
    // ==========================================

    /**
     * Translate analysis results to audience-specific language
     * Auto-triggered after DS agent completes analysis
     */
    async translateResults(params: {
        results: any;
        audience: string; // 'executive' | 'technical' | 'mixed'
        decisionContext?: string;
    }): Promise<any> {
        const { results, audience, decisionContext } = params;

        console.log(`📊 [BA Agent] Translating results for ${audience} audience`);

        try {
            // Translate insights to audience language
            const translatedInsights = await this.translateInsights(
                results.insights || [],
                audience,
                decisionContext
            );

            // Generate executive summary
            const executiveSummary = await this.generateExecutiveSummary(
                results,
                audience
            );

            // Tailor recommendations to audience
            const audienceRecommendations = await this.tailorRecommendations(
                results.recommendations || [],
                audience
            );

            console.log(`✅ [BA Agent] Translation complete: ${translatedInsights.length} insights, ${audienceRecommendations.length} recommendations`);

            return {
                ...results,
                insights: translatedInsights,
                recommendations: audienceRecommendations,
                executiveSummary,
                translatedFor: audience,
                translatedAt: new Date().toISOString()
            };
        } catch (error) {
            console.error(`❌ [BA Agent] Translation failed:`, error);
            // Return original results on error
            return {
                ...results,
                translationError: 'Failed to translate results',
                translatedFor: audience,
                translatedAt: new Date().toISOString()
            };
        }
    }

    /**
     * Translate insights to audience-specific language
     */
    private async translateInsights(
        insights: any[],
        audience: string,
        decisionContext?: string
    ): Promise<any[]> {
        if (!insights || insights.length === 0) {
            return [];
        }

        const audiencePrompts = {
            executive: 'Translate to executive language: focus on business impact, ROI, strategic implications. Avoid technical jargon. Use terms like "revenue opportunity", "market positioning", "competitive advantage".',
            technical: 'Translate to technical language: include statistical details, methodology, technical accuracy. Use precise terminology like "correlation coefficient", "confidence interval", "p-value".',
            mixed: 'Translate to balanced language: accessible to both business and technical readers. Explain key terms in parentheses. Balance business impact with technical rigor.'
        };

        const prompt = audiencePrompts[audience as keyof typeof audiencePrompts] || audiencePrompts.mixed;

        console.log(`🔄 [BA Agent] Translating ${insights.length} insights for ${audience} audience`);

        // Translate each insight
        const translatedInsights = await Promise.all(
            insights.map(async (insight, index) => {
                try {
                    // Build translation prompt
                    const translationPrompt = `${prompt}

CRITICAL RULES:
1. You MUST preserve ALL numeric values, percentages, correlation coefficients, and specific measurements from the original
2. You MUST NOT invent or modify any statistical figures
3. You MUST keep the same data relationships (e.g., if A correlates with B, don't say A correlates with C)
4. Translate the FRAMING and LANGUAGE for ${audience} audience, not the DATA itself

Original insight:
Title: ${insight.title || `Insight ${index + 1}`}
Description: ${insight.description || insight.summary || 'No description'}
${insight.value ? `Value: ${insight.value}` : ''}
${insight.impact ? `Impact: ${insight.impact}` : ''}
${insight.details ? `Supporting data: ${JSON.stringify(insight.details).substring(0, 200)}` : ''}

Translate this insight while preserving ALL numeric values and data points. Return JSON with: { title, description }`;

                    const response = await this.chimaridataAI.generateText({
                        prompt: translationPrompt,
                        maxTokens: 500,
                        temperature: 0.3 // Lower temperature for more consistent translations
                    });

                    // Try to parse JSON response
                    let translation;
                    try {
                        // Handle potential markdown code fences in response
                        const cleanedText = response.text.replace(/```json\s*|\s*```/g, '').trim();
                        translation = JSON.parse(cleanedText);
                    } catch {
                        // Fallback: use original if parsing fails
                        translation = {
                            title: insight.title || `Insight ${index + 1}`,
                            description: response.text || insight.description
                        };
                    }

                    // Post-translation validation: Ensure key numeric values are preserved
                    const originalNumbers = (insight.description || '').match(/[\d]+\.?\d*%?/g) || [];
                    if (originalNumbers.length > 0 && translation.description) {
                        const translatedText = `${translation.title} ${translation.description}`;
                        const missingNumbers = originalNumbers.filter((num: string) => !translatedText.includes(num));
                        if (missingNumbers.length > 0) {
                            console.warn(`⚠️ [BA Agent] Translation dropped ${missingNumbers.length} numeric values for insight "${insight.title}", falling back to original description`);
                            translation.description = insight.description;
                        }
                    }

                    return {
                        ...insight,
                        title: translation.title || insight.title,
                        description: translation.description || insight.description,
                        originalTitle: insight.title,
                        originalDescription: insight.description,
                        translatedFor: audience
                    };
                } catch (error) {
                    console.warn(`⚠️ [BA Agent] Failed to translate insight ${index + 1}, using original`);
                    return {
                        ...insight,
                        translatedFor: audience,
                        translationFailed: true
                    };
                }
            })
        );

        return translatedInsights;
    }

    /**
     * Generate executive summary of analysis results
     */
    private async generateExecutiveSummary(
        results: any,
        audience: string
    ): Promise<string> {
        const summaryPrompts = {
            executive: 'Create a concise executive summary (3-5 sentences) highlighting key business impacts, ROI potential, and actionable recommendations. Focus on strategic value.',
            technical: 'Create a comprehensive technical summary including key findings, methodology overview, statistical significance, and technical recommendations.',
            mixed: 'Create a balanced summary accessible to both business and technical readers, highlighting key findings and their business implications.'
        };

        const prompt = summaryPrompts[audience as keyof typeof summaryPrompts] || summaryPrompts.mixed;

        try {
            const insightCount = results.insights?.length || 0;
            const recommendationCount = results.recommendations?.length || 0;

            const summaryPrompt = `${prompt}

Analysis results:
- ${insightCount} insights discovered
- ${recommendationCount} recommendations generated
${results.insights?.slice(0, 5).map((i: any, idx: number) => `\n${idx + 1}. ${i.title || 'Insight'}: ${i.description || i.summary || ''}`).join('') || ''}

Generate a ${audience} summary of these results.`;

            const response = await this.chimaridataAI.generateText({
                prompt: summaryPrompt,
                maxTokens: 300,
                temperature: 0.4
            });

            return response.text;
        } catch (error) {
            console.warn(`⚠️ [BA Agent] Failed to generate executive summary, using fallback`);
            return `Analysis complete with ${results.insights?.length || 0} insights and ${results.recommendations?.length || 0} recommendations.`;
        }
    }

    /**
     * Tailor recommendations to audience
     */
    private async tailorRecommendations(
        recommendations: any[],
        audience: string
    ): Promise<any[]> {
        if (!recommendations || recommendations.length === 0) {
            return [];
        }

        const tailoringPrompts = {
            executive: 'Reframe as strategic business recommendations with clear ROI and implementation timeline. Use action-oriented language.',
            technical: 'Provide detailed technical implementation steps, including tools, methodologies, and technical considerations.',
            mixed: 'Balance business value with technical feasibility. Include both strategic rationale and implementation approach.'
        };

        const prompt = tailoringPrompts[audience as keyof typeof tailoringPrompts] || tailoringPrompts.mixed;

        console.log(`🎯 [BA Agent] Tailoring ${recommendations.length} recommendations for ${audience} audience`);

        const tailoredRecommendations = await Promise.all(
            recommendations.map(async (rec, index) => {
                try {
                    const tailoringPrompt = `${prompt}

Original recommendation:
${typeof rec === 'string' ? rec : rec.recommendation || rec.title || rec.description || `Recommendation ${index + 1}`}

Tailor this recommendation for ${audience} audience. Keep it concise (1-2 sentences).`;

                    const response = await this.chimaridataAI.generateText({
                        prompt: tailoringPrompt,
                        maxTokens: 200,
                        temperature: 0.3
                    });

                    if (typeof rec === 'string') {
                        return {
                            recommendation: response.text,
                            original: rec,
                            translatedFor: audience
                        };
                    }

                    return {
                        ...rec,
                        recommendation: response.text,
                        original: rec.recommendation || rec.title || rec.description,
                        translatedFor: audience
                    };
                } catch (error) {
                    console.warn(`⚠️ [BA Agent] Failed to tailor recommendation ${index + 1}, using original`);
                    return typeof rec === 'string'
                        ? { recommendation: rec, translatedFor: audience, translationFailed: true }
                        : { ...rec, translatedFor: audience, translationFailed: true };
                }
            })
        );

        return tailoredRecommendations;
    }

    // ==========================================
    // ENHANCED TRANSLATION METHODS (Using NL Translator)
    // ==========================================

    /**
     * Translate analysis results using enhanced NL Translator with caching
     * This provides more structured output than the basic translateResults method
     */
    async translateResultsEnhanced(params: {
        results: any;
        audience: AudienceType;
        industry?: string;
        projectName?: string;
    }): Promise<AIResultsTranslation> {
        const { results, audience, industry, projectName } = params;

        console.log(`📊 [BA Agent] Enhanced translation for ${audience} audience`);

        const context: TranslationContext = {
            audience,
            industry,
            projectName
        };

        const translation = await this.translator.translateResultsWithAI(results, context);

        if (translation.success && translation.data) {
            console.log(`✅ [BA Agent] Enhanced translation complete (cached: ${translation.cached})`);
            return translation.data;
        }

        // Fallback to basic translation structure
        console.warn(`⚠️ [BA Agent] Enhanced translation failed, using fallback`);
        return {
            executiveSummary: 'Analysis complete.',
            keyFindings: [],
            recommendations: [],
            nextSteps: ['Review results', 'Plan next steps'],
            caveats: ['Results should be validated with domain expertise']
        };
    }

    /**
     * Translate data quality report to business impact
     */
    async translateDataQuality(params: {
        qualityReport: any;
        audience: AudienceType;
        industry?: string;
    }): Promise<AIQualityTranslation> {
        const { qualityReport, audience, industry } = params;

        console.log(`📊 [BA Agent] Translating data quality for ${audience} audience`);

        const context: TranslationContext = {
            audience,
            industry
        };

        const translation = await this.translator.translateQualityWithAI(qualityReport, context);

        if (translation.success && translation.data) {
            console.log(`✅ [BA Agent] Quality translation complete (cached: ${translation.cached})`);
            return translation.data;
        }

        // Fallback
        return {
            overallAssessment: 'Data quality assessment complete.',
            businessImpact: 'Review quality metrics before proceeding.',
            trustLevel: 'medium',
            issues: [],
            readyForAnalysis: true,
            confidence: 70
        };
    }

    /**
     * Translate data schema to business-friendly descriptions
     */
    async translateSchemaForAudience(params: {
        schema: Record<string, any>;
        audience: AudienceType;
        industry?: string;
        projectName?: string;
    }): Promise<AISchemaTranslation[]> {
        const { schema, audience, industry, projectName } = params;

        console.log(`📊 [BA Agent] Translating schema for ${audience} audience`);

        const context: TranslationContext = {
            audience,
            industry,
            projectName
        };

        const translation = await this.translator.translateSchemaWithAI(schema, context);

        if (translation.success && translation.data) {
            console.log(`✅ [BA Agent] Schema translation complete: ${translation.data.length} fields`);
            return translation.data;
        }

        // Fallback - basic field humanization
        return Object.entries(schema).map(([field, info]) => ({
            originalField: field,
            businessName: field.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim(),
            description: `Data field: ${field}`,
            dataType: typeof info === 'object' ? (info as any).type || 'unknown' : String(info),
            businessContext: 'Contains data relevant to analysis'
        }));
    }

    /**
     * Translate technical error to user-friendly message
     */
    async translateError(params: {
        error: string | Error;
        audience: AudienceType;
    }): Promise<{ message: string; suggestion: string; technical?: string }> {
        const { error, audience } = params;

        const translation = await this.translator.translateErrorWithAI(error, { audience });

        if (translation.success && translation.data) {
            return translation.data;
        }

        return {
            message: 'We encountered an issue processing your request.',
            suggestion: 'Please try again. If the problem persists, contact our support team.',
            technical: audience === 'technical' ? (error instanceof Error ? error.message : error) : undefined
        };
    }

    /**
     * Clarify a technical term for the user
     */
    async clarifyTerm(params: {
        term: string;
        context: string;
        audience: AudienceType;
    }): Promise<{ explanation: string; example?: string }> {
        const { term, context, audience } = params;

        const result = await this.translator.clarifyTermWithAI(term, context, audience);

        if (result.success && result.data) {
            return result.data;
        }

        return {
            explanation: `${term}: A technical concept used in data analysis`
        };
    }

    /**
     * Clear translation cache
     */
    clearTranslationCache(): void {
        this.translator.clearCache();
        console.log('[BA Agent] Translation cache cleared');
    }

    /**
     * Map audience string to AudienceType
     */
    mapAudienceType(audience: string): AudienceType {
        switch (audience.toLowerCase()) {
            case 'executive':
            case 'c-suite':
            case 'leadership':
                return 'executive';
            case 'business':
            case 'manager':
            case 'analyst':
                return 'business';
            case 'technical':
            case 'data':
            case 'engineer':
                return 'technical';
            default:
                return 'general';
        }
    }
}

