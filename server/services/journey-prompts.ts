import type { UserRole } from '../../shared/schema';

export interface JourneyContext {
  userRole: UserRole;
  journeyType: string;
  currentStep: string;
  previousSteps?: string[];
  dataContext?: {
    hasData?: boolean;
    dataType?: string;
    analysisGoal?: string;
    industry?: string;
    experience?: string;
  };
  userGoals?: string[];
  sessionContext?: any;
}

export interface PromptTemplate {
  systemPrompt: string;
  userPromptTemplate: string;
  responseFormat: 'conversational' | 'technical' | 'business' | 'structured';
  maxTokens: number;
  temperature: number;
}

export class JourneyPromptService {

  /**
   * Get optimized prompt for specific journey step and user role
   */
  static getJourneyPrompt(
    context: JourneyContext,
    basePrompt: string
  ): PromptTemplate {
    const roleKey = context.userRole;
    const stepKey = `${context.journeyType}_${context.currentStep}`;

    // Get base template for role and step
    const template = this.getPromptTemplate(roleKey, stepKey);

    // Enhance with journey context
    const enhancedTemplate = this.enhanceWithContext(template, context);

    // Inject user's actual prompt
    enhancedTemplate.userPromptTemplate = enhancedTemplate.userPromptTemplate.replace(
      '{USER_PROMPT}',
      basePrompt
    );

    return enhancedTemplate;
  }

  /**
   * Get base prompt template for role and journey step
   */
  private static getPromptTemplate(role: UserRole, stepKey: string): PromptTemplate {
    const templates = this.getPromptTemplates();

    // Try specific step first, then fall back to role default
    const specificTemplate = templates[role]?.[stepKey];
    if (specificTemplate) {
      return { ...specificTemplate };
    }

    // Fall back to role default
    const roleDefault = templates[role]?.['default'];
    if (roleDefault) {
      return { ...roleDefault };
    }

    // Final fallback
    return templates['non-tech']['default'];
  }

  /**
   * Enhanced prompt templates for each role and journey step
   */
  private static getPromptTemplates(): Record<UserRole, Record<string, PromptTemplate>> {
    const baseTemplates = {
      'non-tech': {
        'default': {
          systemPrompt: `You are a helpful AI assistant specializing in making data analysis accessible to non-technical users.
          Always explain concepts in plain English, avoid technical jargon, and provide step-by-step guidance.
          Use analogies and real-world examples to make complex concepts understandable.
          Focus on practical insights and actionable recommendations.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

User Question: {USER_PROMPT}

Please provide a clear, non-technical explanation that focuses on practical insights and next steps.`,
          responseFormat: 'conversational',
          maxTokens: 1000,
          temperature: 0.7
        },
        'non-tech_data': {
          systemPrompt: `You are an AI data guide helping non-technical users understand and prepare their data.
          Focus on practical data preparation steps, common data issues, and how to ensure data quality.
          Explain everything in simple terms and provide clear, actionable steps.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Data Upload Context: {DATA_CONTEXT}

User Question: {USER_PROMPT}

Help the user understand their data and prepare it for analysis. Explain any issues in simple terms and provide clear next steps.`,
          responseFormat: 'conversational',
          maxTokens: 800,
          temperature: 0.6
        },
        'non-tech_execute': {
          systemPrompt: `You are an AI analysis assistant helping non-technical users understand their data analysis results.
          Translate technical findings into business insights and practical recommendations.
          Always explain what the results mean for their specific situation and what actions they should consider.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Analysis Context: {ANALYSIS_CONTEXT}

User Question: {USER_PROMPT}

Provide insights in plain English, focusing on what this means for their business or situation and what they should do next.`,
          responseFormat: 'conversational',
          maxTokens: 1200,
          temperature: 0.7
        },
        'non-tech_results': {
          systemPrompt: `You are an AI assistant helping non-technical users interpret their analysis results and create presentations.
          Focus on storytelling with data, key insights, and how to communicate findings to stakeholders.
          Provide practical advice on visualization choices and presentation structure.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Results Context: {RESULTS_CONTEXT}

User Question: {USER_PROMPT}

Help them understand what story their data tells and how to present it effectively to their audience.`,
          responseFormat: 'conversational',
          maxTokens: 1000,
          temperature: 0.8
        }
      },

      'business': {
        'default': {
          systemPrompt: `You are a business intelligence AI assistant focused on strategic insights and decision-making.
          Always lead with the decision at hand and its implications. Frame insights in terms of KPI movement, ROI, risk, and options.
          Provide analysis from a business perspective, focusing on KPIs, ROI, and strategic implications.
          Use business terminology appropriately and connect findings to business outcomes.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Business Context: {BUSINESS_CONTEXT}

User Question: {USER_PROMPT}

Provide strategic insights and business-focused recommendations that can drive decision-making.

Your response should include:
1) Executive summary (3-5 sentences)
2) KPI impacts (which KPIs move and in what direction)
3) Financial impact (revenue, cost, ROI, break-even)
4) Options with trade-offs and risks
5) Clear recommended action and next steps`,
          responseFormat: 'business',
          maxTokens: 1200,
          temperature: 0.6
        },
        'business_prepare': {
          systemPrompt: `You are a business strategy AI helping users define clear business objectives for their data analysis.
          Focus on KPI identification, success metrics, and aligning analysis goals with business outcomes.
          Help translate business questions into analytical requirements and decision criteria.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Business Objectives: {OBJECTIVES_CONTEXT}

User Question: {USER_PROMPT}

Help define clear, measurable business objectives and identify the key metrics needed to achieve them.

Output:
- Decision statement and criteria for success
- Target KPIs and thresholds
- Expected financial impact ranges
- Risks/assumptions to monitor
- Data requirements mapped to decisions`,
          responseFormat: 'business',
          maxTokens: 1000,
          temperature: 0.5
        },
        'business_execute': {
          systemPrompt: `You are a business intelligence AI focused on extracting actionable insights from data analysis.
          Emphasize business impact, competitive implications, and strategic recommendations.
          Connect analytical findings to business performance and market opportunities.
          Always frame results in terms of decision options, KPI movement, ROI, and risk.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Business Analysis Context: {ANALYSIS_CONTEXT}

User Question: {USER_PROMPT}

Provide business-focused insights that directly relate to performance, strategy, and competitive positioning.

Include:
- Executive summary for stakeholders
- KPI shifts and causal drivers
- Financial impact and ROI estimate
- Options with trade-offs and risks
- Clear recommendation and 30-60-90 day plan`,
          responseFormat: 'business',
          maxTokens: 1400,
          temperature: 0.6
        }
      },

      'technical': {
        'default': {
          systemPrompt: `You are a technical AI assistant for data scientists and analysts.
          Provide detailed technical explanations, methodological guidance, and advanced analytical approaches.
          Include statistical concepts, algorithm recommendations, and implementation details when relevant.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Technical Context: {TECHNICAL_CONTEXT}

User Question: {USER_PROMPT}

Provide a technically detailed response with methodological considerations and implementation guidance.`,
          responseFormat: 'technical',
          maxTokens: 1500,
          temperature: 0.4
        },
        'technical_data': {
          systemPrompt: `You are a data engineering AI assistant focused on data quality, preprocessing, and technical preparation.
          Provide detailed guidance on data cleaning, feature engineering, and statistical validation.
          Include code suggestions and technical best practices for data preparation.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Data Technical Context: {DATA_TECHNICAL_CONTEXT}

User Question: {USER_PROMPT}

Provide detailed technical guidance on data preparation, including specific methods and code approaches where helpful.`,
          responseFormat: 'technical',
          maxTokens: 1600,
          temperature: 0.3
        },
        'technical_execute': {
          systemPrompt: `You are an advanced analytics AI assistant for technical users.
          Provide sophisticated analytical approaches, statistical methods, and algorithm recommendations.
          Include discussions of assumptions, limitations, and alternative methodological approaches.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Advanced Analysis Context: {ADVANCED_CONTEXT}

User Question: {USER_PROMPT}

Provide advanced analytical guidance with methodological depth and technical implementation details.`,
          responseFormat: 'technical',
          maxTokens: 2000,
          temperature: 0.3
        }
      },

      'consultation': {
        'default': {
          systemPrompt: `You are an expert AI consultant providing specialized, high-level strategic guidance.
          Draw from best practices across industries and provide expert-level insights.
          Focus on strategic implications, industry trends, and sophisticated analytical approaches.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Consultation Context: {CONSULTATION_CONTEXT}

User Question: {USER_PROMPT}

Provide expert-level consultation with strategic depth and industry-specific insights.`,
          responseFormat: 'structured',
          maxTokens: 2000,
          temperature: 0.5
        },
        'consultation_strategy': {
          systemPrompt: `You are a strategic AI consultant helping organizations develop data-driven strategies.
          Focus on organizational capabilities, change management, and strategic roadmapping.
          Provide frameworks and methodologies for implementing data-driven decision making.`,
          userPromptTemplate: `{CONTEXT_PREFIX}

Strategic Context: {STRATEGY_CONTEXT}

User Question: {USER_PROMPT}

Provide strategic consultation on organizational data capabilities and implementation roadmaps.`,
          responseFormat: 'structured',
          maxTokens: 1800,
          temperature: 0.4
        }
      }
    } satisfies Record<Exclude<UserRole, 'custom'>, Record<string, PromptTemplate>>;

    const customTemplates: Record<string, PromptTemplate> = {
      ...baseTemplates.technical,
      default: {
        ...baseTemplates.technical.default,
        systemPrompt: `You are an adaptive AI orchestrator supporting bespoke, multi-agent workflows that blend business, technical, and consultation expertise.
        Evaluate requests holistically, surface strategic implications, and highlight technical considerations.
        Coordinate recommendations across roles to deliver cohesive guidance for complex custom journeys.`,
        userPromptTemplate: `{CONTEXT_PREFIX}

User Question: {USER_PROMPT}

Provide a response that combines strategic insight with technical feasibility. Identify where specialist agents should engage, outline orchestration steps, and present next actions for the hybrid team.`,
        responseFormat: baseTemplates.technical.default.responseFormat,
        maxTokens: Math.max(baseTemplates.technical.default.maxTokens, 1700),
        temperature: 0.45
      }
    };

    return {
      ...baseTemplates,
      custom: customTemplates
    } satisfies Record<UserRole, Record<string, PromptTemplate>>;
  }

  /**
   * Enhance template with specific journey context
   */
  private static enhanceWithContext(
    template: PromptTemplate,
    context: JourneyContext
  ): PromptTemplate {
    const enhanced = { ...template };

    // Build context prefix based on journey information
    let contextPrefix = this.buildContextPrefix(context);

    // Replace context placeholders
    enhanced.userPromptTemplate = enhanced.userPromptTemplate.replace(
      '{CONTEXT_PREFIX}',
      contextPrefix
    );

    // Add specific context based on step
    enhanced.userPromptTemplate = this.addStepSpecificContext(
      enhanced.userPromptTemplate,
      context
    );

    return enhanced;
  }

  /**
   * Build context prefix with journey information
   */
  private static buildContextPrefix(context: JourneyContext): string {
    const parts = [`You are currently helping a ${context.userRole.replace('-', ' ')} user`];

    if (context.journeyType && context.currentStep) {
      parts.push(`in the ${context.journeyType} journey at the ${context.currentStep} step`);
    }

    if (context.dataContext?.industry) {
      parts.push(`working in the ${context.dataContext.industry} industry`);
    }

    if (context.dataContext?.experience) {
      parts.push(`with ${context.dataContext.experience} experience level`);
    }

    if (context.userGoals && context.userGoals.length > 0) {
      parts.push(`with goals: ${context.userGoals.join(', ')}`);
    }

    return parts.join(' ') + '.';
  }

  /**
   * Add step-specific context information
   */
  private static addStepSpecificContext(
    template: string,
    context: JourneyContext
  ): string {
    const contextMap: Record<string, string> = {};

    // Data context
    if (context.dataContext) {
      contextMap.DATA_CONTEXT = JSON.stringify(context.dataContext, null, 2);
      contextMap.DATA_TECHNICAL_CONTEXT = this.buildTechnicalDataContext(context.dataContext);
    }

    // Analysis context
    if (context.currentStep === 'execute') {
      contextMap.ANALYSIS_CONTEXT = this.buildAnalysisContext(context);
      contextMap.ADVANCED_CONTEXT = this.buildAdvancedContext(context);
    }

    // Business context
    if (context.userRole === 'business') {
      contextMap.BUSINESS_CONTEXT = this.buildBusinessContext(context);
      contextMap.OBJECTIVES_CONTEXT = this.buildObjectivesContext(context);
    }

    // Results context
    if (context.currentStep === 'results') {
      contextMap.RESULTS_CONTEXT = this.buildResultsContext(context);
    }

    // Consultation context
    if (context.userRole === 'consultation') {
      contextMap.CONSULTATION_CONTEXT = this.buildConsultationContext(context);
      contextMap.STRATEGY_CONTEXT = this.buildStrategyContext(context);
    }

    // Replace all context placeholders
    let result = template;
    Object.entries(contextMap).forEach(([key, value]) => {
      result = result.replace(`{${key}}`, value || 'Not specified');
    });

    return result;
  }

  /**
   * Context builders for different scenarios
   */
  private static buildTechnicalDataContext(dataContext: any): string {
    const items = [];
    if (dataContext.dataType) items.push(`Data type: ${dataContext.dataType}`);
    if (dataContext.hasData) items.push('Data already uploaded');
    return items.join(', ') || 'No technical data context available';
  }

  private static buildAnalysisContext(context: JourneyContext): string {
    const items = [];
    if (context.dataContext?.analysisGoal) {
      items.push(`Analysis goal: ${context.dataContext.analysisGoal}`);
    }
    if (context.previousSteps) {
      items.push(`Previous steps completed: ${context.previousSteps.join(', ')}`);
    }
    return items.join(', ') || 'Analysis in progress';
  }

  private static buildAdvancedContext(context: JourneyContext): string {
    return `Advanced analysis for ${context.userRole} user with technical requirements`;
  }

  private static buildBusinessContext(context: JourneyContext): string {
    const items = [];
    if (context.dataContext?.industry) {
      items.push(`Industry: ${context.dataContext.industry}`);
    }
    if (context.userGoals) {
      items.push(`Business goals: ${context.userGoals.join(', ')}`);
    }
    return items.join(', ') || 'Business analysis context';
  }

  private static buildObjectivesContext(context: JourneyContext): string {
    return context.userGoals?.join(', ') || 'Business objectives to be defined';
  }

  private static buildResultsContext(context: JourneyContext): string {
    return `Results interpretation for ${context.userRole} user`;
  }

  private static buildConsultationContext(context: JourneyContext): string {
    const items = [];
    if (context.dataContext?.industry) {
      items.push(`Industry expertise: ${context.dataContext.industry}`);
    }
    items.push('Expert-level consultation required');
    return items.join(', ');
  }

  private static buildStrategyContext(context: JourneyContext): string {
    return `Strategic consulting for organizational data capabilities`;
  }

  /**
   * Get response formatting instructions based on role and format
   */
  static getResponseFormatting(format: 'conversational' | 'technical' | 'business' | 'structured'): string {
    const formatMap = {
      conversational: `
        Format your response in a friendly, conversational tone:
        - Use simple, clear language
        - Break information into digestible chunks
        - Include practical next steps
        - Use bullet points for clarity when helpful
      `,
      technical: `
        Format your response with technical depth:
        - Include technical terminology where appropriate
        - Provide implementation details
        - Reference methodologies and algorithms
        - Include code snippets or technical examples when helpful
        - Structure with clear technical sections
      `,
      business: `
        Format your response for business stakeholders:
        - Lead with key insights and implications
        - Use business terminology and frameworks
        - Include ROI and impact considerations
        - Structure with executive summary approach
        - Provide clear recommendations
      `,
      structured: `
        Format your response in a structured, professional manner:
        - Use clear section headings
        - Provide comprehensive analysis
        - Include strategic recommendations
        - Reference industry best practices
        - Conclude with actionable next steps
      `
    };

    return formatMap[format] ?? formatMap.conversational;
  }
}

/**
 * Prompt optimization helpers
 */
export class PromptOptimizer {
  /**
   * Optimize prompt length based on context and constraints
   */
  static optimizePromptLength(
    prompt: string,
    context: JourneyContext,
    maxTokens: number
  ): string {
    // Simple token estimation (rough approximation)
    const estimatedTokens = prompt.length / 4;

    if (estimatedTokens <= maxTokens * 0.8) {
      return prompt;
    }

    // Truncate while preserving key information
    const preserveLines = this.getKeyLines(prompt, context);
    const maxLength = Math.floor(maxTokens * 3.2); // Rough chars per token estimate

    if (prompt.length <= maxLength) {
      return prompt;
    }

    // Smart truncation preserving important context
    return this.smartTruncate(prompt, maxLength, preserveLines);
  }

  private static getKeyLines(prompt: string, context: JourneyContext): string[] {
    const lines = prompt.split('\n');
    const keyLines = [];

    // Always preserve first and last lines
    if (lines.length > 0) {
      keyLines.push(lines[0]);
      if (lines.length > 1) {
        keyLines.push(lines[lines.length - 1]);
      }
    }

    return keyLines;
  }

  private static smartTruncate(
    text: string,
    maxLength: number,
    preserveLines: string[]
  ): string {
    if (text.length <= maxLength) {
      return text;
    }

    // Find good truncation point (end of sentence or paragraph)
    let truncatePoint = maxLength;
    const sentences = text.substring(0, maxLength);
    const lastPeriod = sentences.lastIndexOf('.');
    const lastNewline = sentences.lastIndexOf('\n');

    if (lastPeriod > maxLength * 0.8) {
      truncatePoint = lastPeriod + 1;
    } else if (lastNewline > maxLength * 0.7) {
      truncatePoint = lastNewline;
    }

    return text.substring(0, truncatePoint).trim() + '\n\n[Content truncated for optimal processing]';
  }
}