import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export interface TechnicalQuery {
  type: 'code_generation' | 'debugging' | 'optimization' | 'analysis_design' | 'documentation' | 'custom';
  prompt: string;
  context: {
    data?: any;
    schema?: any;
    code?: string;
    error?: string;
    requirements?: string[];
  };
  parameters: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    technicalLevel?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
  metadata?: {
    language?: string;
    framework?: string;
    domain?: string;
  };
}

export interface TechnicalCapability {
  category: 'analysis' | 'code' | 'optimization' | 'debugging' | 'automation';
  name: string;
  description: string;
  complexity: 'basic' | 'intermediate' | 'advanced' | 'expert';
  requirements: string[];
  outputTypes: string[];
}

export interface AIModelConfig {
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  defaultParams: {
    temperature: number;
    maxTokens: number;
    topP?: number;
    topK?: number;
  };
  capabilities: string[];
  costPerToken?: number;
}

export class TechnicalAIAgent {
  private models: Map<string, AIModelConfig> = new Map();
  private capabilities: TechnicalCapability[] = [];

  constructor() {
    this.initializeModels();
    this.initializeCapabilities();
  }

  private initializeModels() {
    // Gemini Models
    this.models.set('gemini-1.5-pro', {
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      defaultParams: { temperature: 0.7, maxTokens: 8192 },
      capabilities: ['code_generation', 'debugging', 'analysis', 'optimization'],
      costPerToken: 0.0000015
    });

    this.models.set('gemini-2.0-flash', {
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      defaultParams: { temperature: 0.5, maxTokens: 8192 },
      capabilities: ['code_generation', 'debugging', 'fast_analysis'],
      costPerToken: 0.000001
    });

    // OpenAI Models
    this.models.set('gpt-4o', {
      provider: 'openai',
      model: 'gpt-4o',
      defaultParams: { temperature: 0.7, maxTokens: 4096 },
      capabilities: ['code_generation', 'debugging', 'complex_reasoning', 'optimization'],
      costPerToken: 0.00003
    });

    this.models.set('gpt-4o-mini', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      defaultParams: { temperature: 0.5, maxTokens: 16384 },
      capabilities: ['code_generation', 'debugging', 'documentation'],
      costPerToken: 0.000001
    });

    this.models.set('o1-preview', {
      provider: 'openai',
      model: 'o1-preview',
      defaultParams: { temperature: 1, maxTokens: 32768 },
      capabilities: ['complex_reasoning', 'optimization', 'research'],
      costPerToken: 0.000015
    });

    // Anthropic Models
    this.models.set('claude-3.5-sonnet', {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      defaultParams: { temperature: 0.7, maxTokens: 8192 },
      capabilities: ['code_generation', 'debugging', 'analysis', 'documentation'],
      costPerToken: 0.000003
    });

    this.models.set('claude-3-haiku', {
      provider: 'anthropic',
      model: 'claude-3-haiku-20240307',
      defaultParams: { temperature: 0.5, maxTokens: 4096 },
      capabilities: ['fast_coding', 'simple_debugging', 'documentation'],
      costPerToken: 0.00000025
    });
  }

  private initializeCapabilities() {
    this.capabilities = [
      {
        category: 'code',
        name: 'Python Data Analysis Scripts',
        description: 'Generate custom Python scripts for data analysis using pandas, numpy, scipy',
        complexity: 'intermediate',
        requirements: ['data_schema', 'analysis_requirements'],
        outputTypes: ['python_code', 'documentation', 'usage_examples']
      },
      {
        category: 'code',
        name: 'SQL Query Generation',
        description: 'Create optimized SQL queries for complex data analysis and reporting',
        complexity: 'intermediate',
        requirements: ['database_schema', 'query_requirements'],
        outputTypes: ['sql_code', 'execution_plan', 'performance_notes']
      },
      {
        category: 'code',
        name: 'Machine Learning Pipeline',
        description: 'Design and implement ML pipelines using scikit-learn, tensorflow, or pytorch',
        complexity: 'advanced',
        requirements: ['data_schema', 'ml_objective', 'performance_requirements'],
        outputTypes: ['python_code', 'model_evaluation', 'deployment_guide']
      },
      {
        category: 'debugging',
        name: 'Error Analysis & Resolution',
        description: 'Analyze and provide solutions for code errors and performance issues',
        complexity: 'intermediate',
        requirements: ['error_message', 'code_context', 'environment_info'],
        outputTypes: ['diagnosis', 'solution_steps', 'prevention_tips']
      },
      {
        category: 'optimization',
        name: 'Performance Optimization',
        description: 'Optimize code performance, memory usage, and execution speed',
        complexity: 'advanced',
        requirements: ['current_code', 'performance_metrics', 'constraints'],
        outputTypes: ['optimized_code', 'performance_comparison', 'benchmarks']
      },
      {
        category: 'analysis',
        name: 'Statistical Analysis Design',
        description: 'Design appropriate statistical tests and analysis methodologies',
        complexity: 'expert',
        requirements: ['research_question', 'data_characteristics', 'assumptions'],
        outputTypes: ['analysis_plan', 'code_implementation', 'interpretation_guide']
      },
      {
        category: 'automation',
        name: 'Workflow Automation',
        description: 'Create automated data processing and analysis workflows',
        complexity: 'advanced',
        requirements: ['workflow_description', 'data_sources', 'output_requirements'],
        outputTypes: ['automation_script', 'scheduling_config', 'monitoring_setup']
      }
    ];
  }

  async processQuery(query: TechnicalQuery, apiKey?: string): Promise<{
    success: boolean;
    result?: any;
    model?: string;
    tokensUsed?: number;
    cost?: number;
    error?: string;
  }> {
    try {
      // Select appropriate model based on query type and parameters
      const selectedModel = this.selectOptimalModel(query);
      const modelConfig = this.models.get(selectedModel);
      
      if (!modelConfig) {
        throw new Error(`Model ${selectedModel} not found`);
      }

      // Build technical prompt based on query type
      const prompt = await this.buildTechnicalPrompt(query);
      
      // Execute query with selected model
      const result = await this.executeQuery(
        modelConfig,
        prompt,
        query.parameters,
        apiKey
      );

      return {
        success: true,
        result: result.content,
        model: selectedModel,
        tokensUsed: result.tokensUsed,
        cost: this.calculateCost(result.tokensUsed, modelConfig.costPerToken || 0)
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  private selectOptimalModel(query: TechnicalQuery): string {
    const { type, parameters } = query;
    const requestedModel = parameters.model;
    
    // If user specified a model, use it if available
    if (requestedModel && this.models.has(requestedModel)) {
      return requestedModel;
    }

    // Auto-select based on query type and technical level
    switch (type) {
      case 'code_generation':
        return parameters.technicalLevel === 'expert' ? 'claude-3.5-sonnet' : 'gpt-4o';
      
      case 'debugging':
        return 'gpt-4o'; // Best for code analysis
      
      case 'optimization':
        return parameters.technicalLevel === 'expert' ? 'o1-preview' : 'claude-3.5-sonnet';
      
      case 'analysis_design':
        return 'o1-preview'; // Best for complex reasoning
      
      case 'documentation':
        return 'claude-3.5-sonnet'; // Excellent at documentation
      
      default:
        return 'gemini-1.5-pro'; // Good general-purpose model
    }
  }

  private async buildTechnicalPrompt(query: TechnicalQuery): Promise<string> {
    const { type, prompt, context, parameters } = query;
    
    let systemPrompt = parameters.systemPrompt || this.getDefaultSystemPrompt(type);
    
    // Add technical level context
    const levelContext = this.getTechnicalLevelContext(parameters.technicalLevel || 'intermediate');
    
    // Build comprehensive prompt
    let fullPrompt = `${systemPrompt}\n\n${levelContext}\n\n`;
    
    // Add context-specific information
    if (context.data && context.schema) {
      fullPrompt += `Data Context:\n`;
      fullPrompt += `Schema: ${JSON.stringify(context.schema, null, 2)}\n`;
      fullPrompt += `Sample Data: ${JSON.stringify(context.data.slice(0, 3), null, 2)}\n\n`;
    }
    
    if (context.code) {
      fullPrompt += `Current Code:\n\`\`\`\n${context.code}\n\`\`\`\n\n`;
    }
    
    if (context.error) {
      fullPrompt += `Error Message:\n${context.error}\n\n`;
    }
    
    if (context.requirements && context.requirements.length > 0) {
      fullPrompt += `Requirements:\n${context.requirements.map(req => `- ${req}`).join('\n')}\n\n`;
    }
    
    // Add the main query
    fullPrompt += `Query: ${prompt}\n\n`;
    
    // Add output format instructions
    fullPrompt += this.getOutputFormatInstructions(type);
    
    return fullPrompt;
  }

  private getDefaultSystemPrompt(type: string): string {
    const prompts: Record<string, string> = {
      code_generation: "You are an expert software engineer specializing in data science and analytics. Generate clean, efficient, well-documented code with error handling and best practices.",
      
      debugging: "You are a senior debugging specialist. Analyze code errors systematically, provide clear diagnoses, and offer step-by-step solutions with explanations.",
      
      optimization: "You are a performance optimization expert. Analyze code for bottlenecks, suggest improvements, and provide optimized implementations with performance comparisons.",
      
      analysis_design: "You are a senior data scientist and statistician. Design appropriate analytical approaches, recommend statistical methods, and provide comprehensive analysis strategies.",
      
      documentation: "You are a technical documentation specialist. Create clear, comprehensive documentation with examples, best practices, and usage guidelines.",
      
      custom: "You are an expert technical consultant. Provide detailed, accurate, and actionable technical guidance based on the specific requirements."
    };
    
    return prompts[type] || prompts.custom;
  }

  private getTechnicalLevelContext(level: string): string {
    const contexts: Record<string, string> = {
      beginner: "Provide detailed explanations, include basic concepts, and use simple examples. Explain each step clearly.",
      
      intermediate: "Assume familiarity with basic concepts. Provide clear explanations for advanced concepts and include practical examples.",
      
      advanced: "Focus on sophisticated techniques and optimizations. Assume strong technical background. Include performance considerations.",
      
      expert: "Provide cutting-edge solutions and optimizations. Assume deep expertise. Focus on efficiency, scalability, and advanced patterns."
    };
    
    return `Technical Level: ${level}\n${contexts[level] || contexts.intermediate}`;
  }

  private getOutputFormatInstructions(type: string): string {
    const formats: Record<string, string> = {
      code_generation: "Provide complete, runnable code with comments, error handling, and usage examples. Include installation requirements if needed.",
      
      debugging: "Structure your response as: 1) Problem Analysis, 2) Root Cause, 3) Solution Steps, 4) Prevention Tips, 5) Code Fix (if applicable).",
      
      optimization: "Include: 1) Performance Analysis, 2) Identified Bottlenecks, 3) Optimized Solution, 4) Performance Comparison, 5) Best Practices.",
      
      analysis_design: "Provide: 1) Analytical Approach, 2) Statistical Methods, 3) Implementation Plan, 4) Code Examples, 5) Interpretation Guidelines.",
      
      documentation: "Create comprehensive documentation with: 1) Overview, 2) Usage Examples, 3) API Reference, 4) Best Practices, 5) Troubleshooting.",
      
      custom: "Provide structured, actionable guidance appropriate to the specific request."
    };
    
    return formats[type] || formats.custom;
  }

  private async executeQuery(
    modelConfig: AIModelConfig,
    prompt: string,
    parameters: any,
    apiKey?: string
  ): Promise<{ content: string; tokensUsed: number }> {
    const { provider, model, defaultParams } = modelConfig;
    
    // Merge parameters with defaults
    const finalParams = {
      ...defaultParams,
      ...parameters
    };

    switch (provider) {
      case 'gemini':
        return this.executeGeminiQuery(model, prompt, finalParams, apiKey);
      
      case 'openai':
        return this.executeOpenAIQuery(model, prompt, finalParams, apiKey);
      
      case 'anthropic':
        return this.executeAnthropicQuery(model, prompt, finalParams, apiKey);
      
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async executeGeminiQuery(
    model: string,
    prompt: string,
    params: any,
    apiKey?: string
  ): Promise<{ content: string; tokensUsed: number }> {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('Gemini API key not available');
    }

    const genAI = new GoogleGenerativeAI(key);
    const generativeModel = genAI.getGenerativeModel({ 
      model,
      generationConfig: {
        temperature: params.temperature,
        maxOutputTokens: params.maxTokens,
        topP: params.topP,
        topK: params.topK
      }
    });

    const result = await generativeModel.generateContent(prompt);
    const response = result.response;
    
    return {
      content: response.text(),
      tokensUsed: response.usageMetadata?.totalTokenCount || 0
    };
  }

  private async executeOpenAIQuery(
    model: string,
    prompt: string,
    params: any,
    apiKey?: string
  ): Promise<{ content: string; tokensUsed: number }> {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OpenAI API key not available');
    }

    const openai = new OpenAI({ apiKey: key });
    
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP
    });

    return {
      content: response.choices[0].message.content || '',
      tokensUsed: response.usage?.total_tokens || 0
    };
  }

  private async executeAnthropicQuery(
    model: string,
    prompt: string,
    params: any,
    apiKey?: string
  ): Promise<{ content: string; tokensUsed: number }> {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error('Anthropic API key not available');
    }

    const anthropic = new Anthropic({ apiKey: key });
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: params.maxTokens,
      temperature: params.temperature,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.content[0];
    return {
      content: content.type === 'text' ? content.text : '',
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens
    };
  }

  private calculateCost(tokens: number, costPerToken: number): number {
    return parseFloat((tokens * costPerToken).toFixed(6));
  }

  // Public methods for frontend integration
  getAvailableModels(): Array<{ id: string; name: string; provider: string; capabilities: string[] }> {
    return Array.from(this.models.entries()).map(([id, config]) => ({
      id,
      name: config.model,
      provider: config.provider,
      capabilities: config.capabilities
    }));
  }

  getCapabilities(): TechnicalCapability[] {
    return this.capabilities;
  }

  getModelConfig(modelId: string): AIModelConfig | undefined {
    return this.models.get(modelId);
  }

  estimateCost(modelId: string, estimatedTokens: number): number {
    const config = this.models.get(modelId);
    if (!config || !config.costPerToken) return 0;
    return this.calculateCost(estimatedTokens, config.costPerToken);
  }
}

// Singleton instance
export const technicalAIAgent = new TechnicalAIAgent();