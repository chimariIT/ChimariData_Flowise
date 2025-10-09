import { RolePermissionService } from "./role-permission.js";
import { UsageTrackingService } from "./usage-tracking.js";
import type { UserRole, TechnicalLevel } from "../../shared/schema.js";

export interface AIModelConfig {
  providerId: string;
  modelName: string;
  displayName: string;
  description: string;
  maxTokens: number;
  temperature: number;
  cost: number; // Cost multiplier for usage tracking
  capabilities: string[];
  responseStyle: 'simplified' | 'business' | 'technical' | 'expert';
}

export interface AIPromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  category: 'analysis' | 'visualization' | 'interpretation' | 'code_generation' | 'consultation';
  userRoles: UserRole[];
  technicalLevels: TechnicalLevel[];
}

export interface AIResponse {
  content: string;
  metadata: {
    model: string;
    tokens: number;
    cost: number;
    processingTime: number;
    confidence: number;
  };
  suggestions?: string[];
  nextSteps?: string[];
  codeGenerated?: {
    language: string;
    code: string;
    explanation: string;
  };
}

export class RoleBasedAIService {
  // AI Model configurations by user role and subscription tier
  private static readonly AI_MODEL_CONFIGS: Record<UserRole, Record<string, AIModelConfig[]>> = {
    "non-tech": {
      "none": [{
        providerId: "gemini",
        modelName: "gemini-1.5-flash",
        displayName: "Smart Assistant",
        description: "Fast, easy-to-understand analysis",
        maxTokens: 2048,
        temperature: 0.7,
        cost: 1,
        capabilities: ["basic_analysis", "simple_visualization", "plain_language"],
        responseStyle: "simplified"
      }],
      "starter": [{
        providerId: "gemini",
        modelName: "gemini-1.5-pro",
        displayName: "Smart Assistant Pro",
        description: "Enhanced analysis with deeper insights",
        maxTokens: 4096,
        temperature: 0.7,
        cost: 1.5,
        capabilities: ["enhanced_analysis", "multiple_visualizations", "recommendations"],
        responseStyle: "simplified"
      }],
      "professional": [{
        providerId: "openai",
        modelName: "gpt-4o-mini",
        displayName: "Advanced AI Assistant",
        description: "Sophisticated analysis with business insights",
        maxTokens: 8192,
        temperature: 0.6,
        cost: 2,
        capabilities: ["advanced_analysis", "predictive_insights", "business_recommendations"],
        responseStyle: "simplified"
      }],
      "enterprise": [{
        providerId: "openai",
        modelName: "gpt-4o",
        displayName: "Premium AI Assistant",
        description: "Top-tier analysis with comprehensive insights",
        maxTokens: 16384,
        temperature: 0.6,
        cost: 3,
        capabilities: ["premium_analysis", "comprehensive_insights", "strategic_recommendations"],
        responseStyle: "simplified"
      }]
    },
    "business": {
      "none": [{
        providerId: "gemini",
        modelName: "gemini-1.5-flash",
        displayName: "Business Analyst",
        description: "Business-focused analysis and insights",
        maxTokens: 2048,
        temperature: 0.5,
        cost: 1,
        capabilities: ["business_metrics", "trend_analysis", "kpi_insights"],
        responseStyle: "business"
      }],
      "starter": [{
        providerId: "gemini",
        modelName: "gemini-1.5-pro",
        displayName: "Business Intelligence",
        description: "Advanced business analytics and reporting",
        maxTokens: 4096,
        temperature: 0.5,
        cost: 1.5,
        capabilities: ["advanced_business_metrics", "forecasting", "roi_analysis"],
        responseStyle: "business"
      }],
      "professional": [{
        providerId: "openai",
        modelName: "gpt-4o",
        displayName: "Strategic Business AI",
        description: "Strategic insights with market intelligence",
        maxTokens: 8192,
        temperature: 0.4,
        cost: 2.5,
        capabilities: ["strategic_analysis", "market_intelligence", "competitive_insights"],
        responseStyle: "business"
      }],
      "enterprise": [{
        providerId: "anthropic",
        modelName: "claude-3-5-sonnet-20241022",
        displayName: "Executive Intelligence",
        description: "C-suite level insights and strategic guidance",
        maxTokens: 16384,
        temperature: 0.3,
        cost: 4,
        capabilities: ["executive_insights", "strategic_planning", "enterprise_analytics"],
        responseStyle: "business"
      }]
    },
    "technical": {
      "none": [{
        providerId: "gemini",
        modelName: "gemini-1.5-flash",
        displayName: "Data Science Assistant",
        description: "Technical analysis with statistical insights",
        maxTokens: 2048,
        temperature: 0.3,
        cost: 1,
        capabilities: ["statistical_analysis", "basic_modeling", "data_validation"],
        responseStyle: "technical"
      }],
      "starter": [{
        providerId: "gemini",
        modelName: "gemini-1.5-pro",
        displayName: "Advanced Analytics",
        description: "Sophisticated statistical analysis and modeling",
        maxTokens: 4096,
        temperature: 0.3,
        cost: 1.5,
        capabilities: ["advanced_statistics", "machine_learning", "model_evaluation"],
        responseStyle: "technical"
      }],
      "professional": [{
        providerId: "anthropic",
        modelName: "claude-3-5-sonnet-20241022",
        displayName: "Data Science Expert",
        description: "Expert-level analysis with code generation",
        maxTokens: 8192,
        temperature: 0.2,
        cost: 3,
        capabilities: ["expert_analysis", "code_generation", "algorithm_design", "custom_models"],
        responseStyle: "technical"
      }],
      "enterprise": [{
        providerId: "openai",
        modelName: "o1-preview",
        displayName: "Research AI",
        description: "Research-grade analysis with advanced reasoning",
        maxTokens: 16384,
        temperature: 0.1,
        cost: 5,
        capabilities: ["research_analysis", "advanced_reasoning", "novel_algorithms", "peer_review"],
        responseStyle: "technical"
      }]
    },
    "consultation": {
      "none": [{
        providerId: "gemini",
        modelName: "gemini-1.5-pro",
        displayName: "Consultation Assistant",
        description: "Expert guidance for complex projects",
        maxTokens: 4096,
        temperature: 0.4,
        cost: 2,
        capabilities: ["expert_guidance", "methodology_advice", "project_planning"],
        responseStyle: "expert"
      }],
      "starter": [{
        providerId: "anthropic",
        modelName: "claude-3-5-sonnet-20241022",
        displayName: "Expert Consultant",
        description: "Professional consultation with detailed guidance",
        maxTokens: 8192,
        temperature: 0.3,
        cost: 3,
        capabilities: ["professional_consultation", "detailed_methodology", "implementation_guidance"],
        responseStyle: "expert"
      }],
      "professional": [{
        providerId: "openai",
        modelName: "gpt-4o",
        displayName: "Senior Consultant",
        description: "Senior-level expertise with strategic insights",
        maxTokens: 12288,
        temperature: 0.2,
        cost: 4,
        capabilities: ["senior_consultation", "strategic_insights", "risk_assessment", "optimization"],
        responseStyle: "expert"
      }],
      "enterprise": [{
        providerId: "openai",
        modelName: "o1-preview",
        displayName: "Chief Data Scientist",
        description: "C-level expertise with cutting-edge methodologies",
        maxTokens: 32768,
        temperature: 0.1,
        cost: 6,
        capabilities: ["executive_consultation", "cutting_edge_methods", "research_direction", "innovation"],
        responseStyle: "expert"
      }]
    }
  };

  // Prompt templates by category and user role
  private static readonly PROMPT_TEMPLATES: AIPromptTemplate[] = [
    // Analysis prompts for non-tech users
    {
      id: "nontech_basic_analysis",
      name: "Simple Data Analysis",
      description: "Basic analysis with easy-to-understand explanations",
      template: `I have some data that I'd like to understand better. Can you help me analyze it in simple terms?

Data context: {dataContext}
My question: {userQuestion}

Please explain your findings in plain English, avoiding technical jargon. Focus on:
1. What the data shows in simple terms
2. Key patterns or trends I should know about
3. Practical insights I can act on
4. Simple next steps I could take

Keep your explanation conversational and easy to understand.`,
      variables: ["dataContext", "userQuestion"],
      category: "analysis",
      userRoles: ["non-tech"],
      technicalLevels: ["beginner", "intermediate"]
    },

    // Business analysis prompts
    {
      id: "business_kpi_analysis",
      name: "Business KPI Analysis",
      description: "Business-focused analysis with KPI insights",
      template: `Analyze this business data with a focus on key performance indicators and business impact.

Data context: {dataContext}
Business objective: {businessObjective}
Industry: {industry}
Time period: {timePeriod}

Please provide:
1. Key KPI trends and their business implications
2. Performance benchmarks and industry comparisons
3. Revenue/cost impact analysis
4. Strategic recommendations for business growth
5. Risk factors and mitigation strategies

Format your response for executive presentation.`,
      variables: ["dataContext", "businessObjective", "industry", "timePeriod"],
      category: "analysis",
      userRoles: ["business"],
      technicalLevels: ["intermediate", "advanced", "expert"]
    },

    // Technical analysis prompts
    {
      id: "technical_statistical_analysis",
      name: "Statistical Analysis",
      description: "Technical statistical analysis with methodology details",
      template: `Perform a comprehensive statistical analysis of the provided dataset.

Dataset characteristics: {datasetInfo}
Analysis goal: {analysisGoal}
Statistical tests required: {statisticalTests}
Significance level: {significanceLevel}

Please provide:
1. Exploratory data analysis with statistical summaries
2. Appropriate statistical tests with assumptions validation
3. Effect sizes and confidence intervals
4. Power analysis and sample size considerations
5. Detailed methodology and reproducible code
6. Limitations and recommendations for further analysis

Include statistical formulas and technical details where appropriate.`,
      variables: ["datasetInfo", "analysisGoal", "statisticalTests", "significanceLevel"],
      category: "analysis",
      userRoles: ["technical"],
      technicalLevels: ["advanced", "expert"]
    },

    // Code generation prompts
    {
      id: "technical_code_generation",
      name: "Data Analysis Code",
      description: "Generate production-ready analysis code",
      template: `Generate clean, well-documented code for the following data analysis task.

Programming language: {language}
Data format: {dataFormat}
Analysis requirements: {requirements}
Libraries/frameworks: {frameworks}

Please provide:
1. Complete, runnable code with proper error handling
2. Detailed comments explaining each step
3. Data validation and preprocessing steps
4. Visualization code with publication-ready plots
5. Performance optimization suggestions
6. Unit tests for critical functions

Code should follow best practices and be production-ready.`,
      variables: ["language", "dataFormat", "requirements", "frameworks"],
      category: "code_generation",
      userRoles: ["technical"],
      technicalLevels: ["advanced", "expert"]
    },

    // Consultation prompts
    {
      id: "consultation_methodology",
      name: "Methodology Consultation",
      description: "Expert methodology guidance and recommendations",
      template: `Provide expert consultation on the appropriate methodology for this analysis project.

Project scope: {projectScope}
Data characteristics: {dataCharacteristics}
Business constraints: {constraints}
Timeline: {timeline}
Resource availability: {resources}

Please provide:
1. Recommended analytical approach with justification
2. Alternative methodologies with trade-offs
3. Implementation roadmap with milestones
4. Resource requirements and team structure
5. Risk assessment and mitigation strategies
6. Quality assurance and validation approach
7. Deliverables and success metrics

Frame recommendations from a senior consultant perspective.`,
      variables: ["projectScope", "dataCharacteristics", "constraints", "timeline", "resources"],
      category: "consultation",
      userRoles: ["consultation"],
      technicalLevels: ["intermediate", "advanced", "expert"]
    }
  ];

  /**
   * Get appropriate AI model configuration for user
   */
  static async getAIModelForUser(userId: string): Promise<AIModelConfig> {
    try {
      const permissions = await RolePermissionService.getUserPermissions(userId);
      if (!permissions) {
        throw new Error("Unable to determine user permissions");
      }

      // Get user details from permissions or database query
      const userRole = await this.getUserRole(userId);
      const subscriptionTier = await this.getSubscriptionTier(userId);

      const roleConfigs = this.AI_MODEL_CONFIGS[userRole] || this.AI_MODEL_CONFIGS["non-tech"];
      const tierConfigs = roleConfigs[subscriptionTier] || roleConfigs["none"];

      // Return the first (primary) model for the user's role and tier
      return tierConfigs[0];
    } catch (error) {
      console.error("Error getting AI model for user:", error);
      // Fallback to basic model
      return this.AI_MODEL_CONFIGS["non-tech"]["none"][0];
    }
  }

  /**
   * Get available models for user's role and subscription
   */
  static async getAvailableModels(userId: string): Promise<AIModelConfig[]> {
    try {
      const userRole = await this.getUserRole(userId);
      const subscriptionTier = await this.getSubscriptionTier(userId);

      const roleConfigs = this.AI_MODEL_CONFIGS[userRole] || this.AI_MODEL_CONFIGS["non-tech"];
      const tierConfigs = roleConfigs[subscriptionTier] || roleConfigs["none"];

      return tierConfigs;
    } catch (error) {
      console.error("Error getting available models:", error);
      return this.AI_MODEL_CONFIGS["non-tech"]["none"];
    }
  }

  /**
   * Get appropriate prompt template for user and context
   */
  static getPromptTemplate(
    category: string,
    userRole: UserRole,
    technicalLevel: TechnicalLevel
  ): AIPromptTemplate | null {
    const templates = this.PROMPT_TEMPLATES.filter(template =>
      template.category === category &&
      template.userRoles.includes(userRole) &&
      template.technicalLevels.includes(technicalLevel)
    );

    // Return the most specific template
    return templates.length > 0 ? templates[0] : null;
  }

  /**
   * Get all available prompt templates for user
   */
  static getAvailablePromptTemplates(
    userRole: UserRole,
    technicalLevel: TechnicalLevel
  ): AIPromptTemplate[] {
    return this.PROMPT_TEMPLATES.filter(template =>
      template.userRoles.includes(userRole) &&
      template.technicalLevels.includes(technicalLevel)
    );
  }

  /**
   * Process AI request with role-based configuration
   */
  static async processAIRequest(
    userId: string,
    request: {
      prompt: string;
      category?: string;
      context?: Record<string, any>;
      templateId?: string;
    }
  ): Promise<AIResponse> {
    try {
      // Check usage limits first
      const usageCheck = await UsageTrackingService.checkUsageLimit(userId, 'aiQueries');
      if (!usageCheck.allowed) {
        throw new Error("AI query limit exceeded");
      }

      // Get user's AI model configuration
      const modelConfig = await this.getAIModelForUser(userId);
      const userRole = await this.getUserRole(userId);
      const technicalLevel = await this.getTechnicalLevel(userId);

      // Get and apply prompt template if specified
      let finalPrompt = request.prompt;
      if (request.templateId || request.category) {
        const template = request.templateId
          ? this.PROMPT_TEMPLATES.find(t => t.id === request.templateId)
          : this.getPromptTemplate(request.category!, userRole, technicalLevel);

        if (template && request.context) {
          finalPrompt = this.populateTemplate(template.template, request.context);
        }
      }

      // Add role-specific system prompt
      const systemPrompt = this.getSystemPrompt(userRole, technicalLevel, modelConfig.responseStyle);

      // Make AI API call (this would integrate with your existing AI service)
      const startTime = Date.now();
      const aiResponse = await this.callAIProvider(
        modelConfig.providerId,
        modelConfig.modelName,
        systemPrompt,
        finalPrompt,
        {
          maxTokens: modelConfig.maxTokens,
          temperature: modelConfig.temperature
        }
      );
      const processingTime = Date.now() - startTime;

      // Track usage
      await UsageTrackingService.trackAiQuery(userId, this.getQueryType(modelConfig));

      // Format response based on user role
      const formattedResponse = this.formatResponseForRole(aiResponse, userRole, modelConfig);

      return {
        content: formattedResponse.content,
        metadata: {
          model: modelConfig.displayName,
          tokens: aiResponse.tokens || 0,
          cost: modelConfig.cost,
          processingTime,
          confidence: aiResponse.confidence || 0.85
        },
        suggestions: formattedResponse.suggestions,
        nextSteps: formattedResponse.nextSteps,
        codeGenerated: formattedResponse.codeGenerated
      };
    } catch (error) {
      console.error("Error processing AI request:", error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  private static async getUserRole(userId: string): Promise<UserRole> {
    // This would query the database for user role
    // For now, return a default
    return "non-tech";
  }

  private static async getSubscriptionTier(userId: string): Promise<string> {
    // This would query the database for subscription tier
    // For now, return a default
    return "none";
  }

  private static async getTechnicalLevel(userId: string): Promise<TechnicalLevel> {
    // This would query the database for technical level
    // For now, return a default
    return "beginner";
  }

  private static populateTemplate(template: string, context: Record<string, any>): string {
    let populated = template;
    for (const [key, value] of Object.entries(context)) {
      populated = populated.replace(new RegExp(`{${key}}`, 'g'), String(value));
    }
    return populated;
  }

  private static getSystemPrompt(
    userRole: UserRole,
    technicalLevel: TechnicalLevel,
    responseStyle: string
  ): string {
    const basePrompts = {
      simplified: "You are a helpful data analysis assistant. Explain everything in simple, easy-to-understand language. Avoid technical jargon and focus on practical insights that anyone can understand and act upon.",
      business: "You are a business intelligence expert. Focus on business metrics, ROI, strategic insights, and actionable recommendations. Frame your responses in terms of business impact and competitive advantage.",
      technical: "You are a data science expert. Provide technically accurate analysis with proper statistical methodology. Include technical details, formulas, and code when appropriate. Assume the user has strong technical background.",
      expert: "You are a senior consultant and subject matter expert. Provide comprehensive analysis with strategic insights, methodology recommendations, and implementation guidance. Consider enterprise-level implications and best practices."
    };

    const roleSpecific = {
      "non-tech": " Remember to explain concepts as if you're talking to someone who is new to data analysis.",
      "business": " Focus on business value, KPIs, and strategic implications of your analysis.",
      "technical": " Include statistical rigor, methodology details, and code examples where helpful.",
      "consultation": " Provide expert-level guidance as if you're a senior consultant advising on best practices."
    };

    return basePrompts[responseStyle as keyof typeof basePrompts] + roleSpecific[userRole];
  }

  private static async callAIProvider(
    providerId: string,
    modelName: string,
    systemPrompt: string,
    userPrompt: string,
    options: any
  ): Promise<any> {
    // This would integrate with your existing AI service
    // For now, return a mock response
    return {
      content: "Mock AI response based on role and model configuration",
      tokens: 150,
      confidence: 0.85
    };
  }

  private static getQueryType(modelConfig: AIModelConfig): 'simple' | 'advanced' | 'code_generation' {
    if (modelConfig.capabilities.includes('code_generation')) {
      return 'code_generation';
    }
    if (modelConfig.cost >= 3) {
      return 'advanced';
    }
    return 'simple';
  }

  private static formatResponseForRole(aiResponse: any, userRole: UserRole, modelConfig: AIModelConfig): { content: string; suggestions: string[]; nextSteps: string[]; codeGenerated?: { language: string; code: string; explanation: string } } {
    // Format the response based on user role and model capabilities
    const formatted: { content: string; suggestions: string[]; nextSteps: string[]; codeGenerated?: { language: string; code: string; explanation: string } } = {
      content: String(aiResponse.content ?? ''),
      suggestions: [] as string[],
      nextSteps: [] as string[]
    };

    // Add role-specific enhancements
    switch (userRole) {
      case "non-tech":
        formatted.suggestions = this.generateSimplesuggestions(aiResponse);
        formatted.nextSteps = this.generateSimpleNextSteps(aiResponse);
        break;
      case "business":
        formatted.suggestions = this.generateBusinessSuggestions(aiResponse);
        formatted.nextSteps = this.generateBusinessNextSteps(aiResponse);
        break;
      case "technical":
        if (modelConfig.capabilities.includes('code_generation')) {
          formatted.codeGenerated = this.extractCodeFromResponse(aiResponse);
        }
  formatted.suggestions = this.generateTechnicalSuggestions(aiResponse);
        break;
      case "consultation":
        formatted.suggestions = this.generateConsultationSuggestions(aiResponse);
        formatted.nextSteps = this.generateConsultationNextSteps(aiResponse);
        break;
    }

    return formatted;
  }

  private static generateSimplesuggestions(aiResponse: any): string[] {
    return [
      "Try visualizing this data with a simple chart",
      "Look for patterns in your data over time",
      "Compare different groups in your dataset"
    ];
  }

  private static generateSimpleNextSteps(aiResponse: any): string[] {
    return [
      "Create a visualization to see the trends",
      "Share these insights with your team",
      "Collect more data to validate these findings"
    ];
  }

  private static generateBusinessSuggestions(aiResponse: any): string[] {
    return [
      "Consider the ROI implications of these findings",
      "Benchmark against industry standards",
      "Develop an action plan based on these insights"
    ];
  }

  private static generateBusinessNextSteps(aiResponse: any): string[] {
    return [
      "Present findings to stakeholders",
      "Develop KPI dashboard for monitoring",
      "Create implementation roadmap"
    ];
  }

  private static generateTechnicalSuggestions(aiResponse: any): string[] {
    return [
      "Validate assumptions with statistical tests",
      "Consider additional feature engineering",
      "Implement cross-validation for model evaluation"
    ];
  }

  private static generateConsultationSuggestions(aiResponse: any): string[] {
    return [
      "Schedule follow-up session to discuss implementation",
      "Review methodology with your team",
      "Consider pilot testing before full deployment"
    ];
  }

  private static generateConsultationNextSteps(aiResponse: any): string[] {
    return [
      "Develop detailed project timeline",
      "Identify required resources and expertise",
      "Create risk mitigation strategy"
    ];
  }

  private static extractCodeFromResponse(aiResponse: any): any {
    // Extract code blocks from the response
    // This would parse code blocks and return structured code
    return {
      language: "python",
      code: "# Generated analysis code would go here",
      explanation: "This code performs the requested analysis"
    };
  }
}