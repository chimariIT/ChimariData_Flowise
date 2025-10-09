import { ChimaridataAI } from './chimaridata-ai';

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
}

interface AnalysisTemplate {
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
    private industryTemplates: IndustryTemplate[];
    private regulatoryFrameworks: RegulatoryFramework[];

    constructor() {
        this.chimaridataAI = new ChimaridataAI();
        this.industryTemplates = this.initializeIndustryTemplates();
        this.regulatoryFrameworks = this.initializeRegulatoryFrameworks();
    }

    private initializeIndustryTemplates(): IndustryTemplate[] {
        return [
            {
                industry: 'Healthcare',
                commonUseCases: [
                    'Patient outcome prediction',
                    'Readmission risk analysis',
                    'Drug effectiveness studies',
                    'Resource optimization',
                    'Clinical trial analysis'
                ],
                keyMetrics: [
                    'Patient satisfaction scores',
                    'Readmission rates',
                    'Length of stay',
                    'Mortality rates',
                    'Cost per patient',
                    'Treatment effectiveness'
                ],
                regulatoryConsiderations: [
                    'HIPAA compliance',
                    'FDA regulations',
                    'PHI protection',
                    'Clinical trial protocols'
                ],
                analysisTemplates: [
                    {
                        name: 'Patient Risk Stratification',
                        type: 'machine_learning',
                        description: 'Identify high-risk patients using demographic and clinical data',
                        requiredColumns: ['age', 'diagnosis', 'vitals', 'medical_history'],
                        expectedOutcomes: ['Risk scores', 'Intervention recommendations', 'Cost projections'],
                        businessValue: 'Reduce readmissions by 15-25% and improve patient outcomes'
                    },
                    {
                        name: 'Treatment Effectiveness Analysis',
                        type: 'statistical',
                        description: 'Compare treatment outcomes across patient cohorts',
                        requiredColumns: ['treatment_type', 'outcomes', 'demographics', 'comorbidities'],
                        expectedOutcomes: ['Efficacy comparisons', 'Side effect profiles', 'Cost-effectiveness'],
                        businessValue: 'Optimize treatment protocols and reduce costs'
                    }
                ]
            },
            {
                industry: 'Finance',
                commonUseCases: [
                    'Credit risk assessment',
                    'Fraud detection',
                    'Algorithmic trading',
                    'Portfolio optimization',
                    'Regulatory compliance'
                ],
                keyMetrics: [
                    'Return on investment',
                    'Risk-adjusted returns',
                    'Default rates',
                    'Sharpe ratio',
                    'Value at Risk',
                    'Fraud detection rate'
                ],
                regulatoryConsiderations: [
                    'Basel III compliance',
                    'GDPR for EU customers',
                    'Fair Credit Reporting Act',
                    'Anti-money laundering',
                    'Model risk management'
                ],
                analysisTemplates: [
                    {
                        name: 'Credit Scoring Model',
                        type: 'machine_learning',
                        description: 'Predict default probability using customer financial data',
                        requiredColumns: ['credit_history', 'income', 'debt_ratio', 'employment'],
                        expectedOutcomes: ['Credit scores', 'Default probabilities', 'Risk tiers'],
                        businessValue: 'Improve approval rates while reducing default risk by 20%'
                    },
                    {
                        name: 'Portfolio Risk Analysis',
                        type: 'statistical',
                        description: 'Analyze portfolio risk and performance metrics',
                        requiredColumns: ['asset_returns', 'volatility', 'correlations', 'exposures'],
                        expectedOutcomes: ['Risk metrics', 'Optimal allocations', 'Stress test results'],
                        businessValue: 'Optimize risk-return profile and regulatory compliance'
                    }
                ]
            },
            {
                industry: 'Retail',
                commonUseCases: [
                    'Customer segmentation',
                    'Demand forecasting',
                    'Price optimization',
                    'Inventory management',
                    'Churn prediction'
                ],
                keyMetrics: [
                    'Customer lifetime value',
                    'Conversion rates',
                    'Average order value',
                    'Inventory turnover',
                    'Gross margin',
                    'Customer acquisition cost'
                ],
                regulatoryConsiderations: [
                    'Consumer privacy laws',
                    'Price discrimination regulations',
                    'Product safety standards',
                    'Advertising standards'
                ],
                analysisTemplates: [
                    {
                        name: 'Customer Segmentation',
                        type: 'machine_learning',
                        description: 'Segment customers based on behavior and demographics',
                        requiredColumns: ['purchase_history', 'demographics', 'engagement', 'preferences'],
                        expectedOutcomes: ['Customer segments', 'Persona profiles', 'Targeting strategies'],
                        businessValue: 'Increase marketing ROI by 30% through targeted campaigns'
                    },
                    {
                        name: 'Demand Forecasting',
                        type: 'time_series',
                        description: 'Predict future product demand using historical data',
                        requiredColumns: ['sales_history', 'seasonality', 'promotions', 'external_factors'],
                        expectedOutcomes: ['Demand forecasts', 'Inventory recommendations', 'Revenue projections'],
                        businessValue: 'Reduce stockouts by 25% and optimize inventory costs'
                    }
                ]
            },
            {
                industry: 'Manufacturing',
                commonUseCases: [
                    'Predictive maintenance',
                    'Quality control',
                    'Supply chain optimization',
                    'Production planning',
                    'Energy efficiency'
                ],
                keyMetrics: [
                    'Overall equipment effectiveness',
                    'Defect rates',
                    'Throughput',
                    'Downtime',
                    'Energy consumption',
                    'Labor productivity'
                ],
                regulatoryConsiderations: [
                    'ISO quality standards',
                    'Environmental regulations',
                    'Safety compliance',
                    'Product liability'
                ],
                analysisTemplates: [
                    {
                        name: 'Predictive Maintenance',
                        type: 'machine_learning',
                        description: 'Predict equipment failures before they occur',
                        requiredColumns: ['sensor_data', 'maintenance_history', 'operating_conditions', 'failure_modes'],
                        expectedOutcomes: ['Failure predictions', 'Maintenance schedules', 'Cost savings'],
                        businessValue: 'Reduce unplanned downtime by 40% and maintenance costs by 25%'
                    },
                    {
                        name: 'Quality Control Analysis',
                        type: 'statistical',
                        description: 'Monitor and improve product quality using process data',
                        requiredColumns: ['process_parameters', 'quality_measurements', 'batch_info', 'environmental_conditions'],
                        expectedOutcomes: ['Quality trends', 'Process improvements', 'Defect reduction'],
                        businessValue: 'Improve product quality and reduce defect rates by 30%'
                    }
                ]
            }
        ];
    }

    private initializeRegulatoryFrameworks(): RegulatoryFramework[] {
        return [
            {
                name: 'GDPR',
                description: 'General Data Protection Regulation for EU data privacy',
                requirements: [
                    'Explicit consent for data processing',
                    'Right to data portability',
                    'Right to be forgotten',
                    'Data protection by design',
                    'Privacy impact assessments'
                ],
                applicableIndustries: ['All industries operating in EU']
            },
            {
                name: 'HIPAA',
                description: 'Health Insurance Portability and Accountability Act',
                requirements: [
                    'PHI protection',
                    'Access controls',
                    'Audit trails',
                    'Data encryption',
                    'Business associate agreements'
                ],
                applicableIndustries: ['Healthcare', 'Health Insurance']
            },
            {
                name: 'SOX',
                description: 'Sarbanes-Oxley Act for financial reporting',
                requirements: [
                    'Internal controls documentation',
                    'Management certification',
                    'Independent auditing',
                    'Data retention policies'
                ],
                applicableIndustries: ['Public Companies', 'Finance']
            },
            {
                name: 'Basel III',
                description: 'International regulatory framework for banks',
                requirements: [
                    'Capital adequacy ratios',
                    'Liquidity coverage ratio',
                    'Net stable funding ratio',
                    'Leverage ratio limits',
                    'Stress testing'
                ],
                applicableIndustries: ['Banking', 'Financial Services']
            }
        ];
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

        // Find relevant industry templates
        const relevantTemplates = [];

        for (const industryTemplate of this.industryTemplates) {
            // Check if business area matches industry or use cases
            if (industryTemplate.industry.toLowerCase().includes(businessArea.toLowerCase()) ||
                industryTemplate.commonUseCases.some(useCase =>
                    useCase.toLowerCase().includes(businessArea.toLowerCase()) ||
                    businessArea.toLowerCase().includes(useCase.toLowerCase())
                )) {

                relevantTemplates.push({
                    id: `${industryTemplate.industry.toLowerCase()}_template`,
                    name: `${industryTemplate.industry} Analysis Template`,
                    description: `Industry-specific template for ${industryTemplate.industry}`,
                    industry: industryTemplate.industry,
                    commonUseCases: industryTemplate.commonUseCases,
                    keyMetrics: industryTemplate.keyMetrics,
                    analysisTemplates: industryTemplate.analysisTemplates,
                    regulatoryConsiderations: industryTemplate.regulatoryConsiderations
                });
            }
        }

        // If no specific templates found, return generic template
        if (relevantTemplates.length === 0) {
            relevantTemplates.push({
                id: `${businessArea.toLowerCase().replace(/\s/g, '_')}_template`,
                name: `${businessArea} Analysis Template`,
                description: `A general template for analyzing ${businessArea}.`,
                questions: [
                    `What are the key metrics for ${businessArea}?`,
                    `How can we optimize performance in ${businessArea}?`
                ],
                analysisTypes: ['descriptive', 'optimization']
            });
        }

        return relevantTemplates;
    }

    // Industry-Specific Knowledge Methods
    getIndustryTemplate(industry: string): IndustryTemplate | undefined {
        return this.industryTemplates.find(template =>
            template.industry.toLowerCase() === industry.toLowerCase()
        );
    }

    getApplicableRegulations(industry: string): RegulatoryFramework[] {
        return this.regulatoryFrameworks.filter(framework =>
            framework.applicableIndustries.some(applicableIndustry =>
                applicableIndustry.toLowerCase().includes(industry.toLowerCase()) ||
                industry.toLowerCase().includes(applicableIndustry.toLowerCase())
            )
        );
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

        const industryTemplate = this.getIndustryTemplate(industry);
        const applicableRegulations = this.getApplicableRegulations(industry);

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
        const regulations = this.getApplicableRegulations(industry);
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
        const industryTemplate = this.getIndustryTemplate(industry);

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

            default:
                kpis.primaryKPIs = industryTemplate.keyMetrics.slice(0, 3);
                kpis.secondaryKPIs = industryTemplate.keyMetrics.slice(3, 6);
        }

        return kpis;
    }

    async suggestDataEnrichment(context: BusinessContext): Promise<any> {
        const { industry, dataSchema } = context;
        const suggestions = [];

        const industryTemplate = this.getIndustryTemplate(industry || '');

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
}
