import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Technical AI Agent for Advanced User Capabilities
 * Provides sophisticated technical analysis, code generation, and expert-level insights
 */

export interface TechnicalCapability {
  id: string;
  name: string;
  description: string;
  category: 'analysis' | 'code' | 'optimization' | 'debugging' | 'automation';
  complexity: 'basic' | 'intermediate' | 'advanced' | 'expert';
  requirements: string[];
  examples: string[];
}

export interface TechnicalQuery {
  id: string;
  type: 'analysis' | 'code_generation' | 'optimization' | 'debugging' | 'automation';
  prompt: string;
  context: {
    data?: any;
    code?: string;
    requirements?: string[];
    constraints?: string[];
    environment?: string;
  };
  metadata: {
    userId: string;
    projectId?: string;
    timestamp: Date;
    priority: 'low' | 'normal' | 'high' | 'critical';
    technicalLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  };
}

export interface TechnicalResponse {
  id: string;
  type: string;
  content: {
    explanation: string;
    code?: string;
    recommendations: string[];
    warnings: string[];
    nextSteps: string[];
  };
  metadata: {
    confidence: number;
    complexity: string;
    estimatedTime: string;
    resources: string[];
  };
  alternatives?: TechnicalResponse[];
}

export class TechnicalAIAgent {
  private capabilities: Map<string, TechnicalCapability> = new Map();
  private queryHistory: Map<string, TechnicalQuery> = new Map();
  private responseCache: Map<string, TechnicalResponse> = new Map();

  constructor() {
    this.initializeCapabilities();
  }

  private initializeCapabilities(): void {
    const capabilities: TechnicalCapability[] = [
      {
        id: 'advanced_statistical_analysis',
        name: 'Advanced Statistical Analysis',
        description: 'Perform complex statistical tests, hypothesis testing, and advanced modeling',
        category: 'analysis',
        complexity: 'advanced',
        requirements: ['Statistical knowledge', 'Data understanding', 'Hypothesis formulation'],
        examples: [
          'Perform ANOVA analysis on multiple groups',
          'Conduct time series forecasting',
          'Build regression models with interaction terms'
        ]
      },
      {
        id: 'machine_learning_pipeline',
        name: 'Machine Learning Pipeline',
        description: 'Design and implement complete ML pipelines with preprocessing, training, and evaluation',
        category: 'code',
        complexity: 'expert',
        requirements: ['ML algorithms knowledge', 'Python/Scikit-learn', 'Data preprocessing'],
        examples: [
          'Build classification pipeline with cross-validation',
          'Implement feature engineering pipeline',
          'Create ensemble learning models'
        ]
      },
      {
        id: 'data_optimization',
        name: 'Data Processing Optimization',
        description: 'Optimize data processing workflows for performance and efficiency',
        category: 'optimization',
        complexity: 'advanced',
        requirements: ['Performance analysis', 'Algorithm optimization', 'System architecture'],
        examples: [
          'Optimize pandas operations for large datasets',
          'Implement parallel processing',
          'Memory usage optimization'
        ]
      },
      {
        id: 'code_debugging',
        name: 'Advanced Code Debugging',
        description: 'Identify and fix complex bugs in data analysis code',
        category: 'debugging',
        complexity: 'intermediate',
        requirements: ['Programming knowledge', 'Error analysis', 'Testing methodologies'],
        examples: [
          'Debug pandas data type issues',
          'Fix memory leaks in data processing',
          'Resolve visualization rendering problems'
        ]
      },
      {
        id: 'automation_workflows',
        name: 'Automation Workflows',
        description: 'Create automated data processing and analysis workflows',
        category: 'automation',
        complexity: 'advanced',
        requirements: ['Workflow design', 'Scheduling knowledge', 'Error handling'],
        examples: [
          'Automated daily data processing',
          'Scheduled report generation',
          'Data quality monitoring workflows'
        ]
      },
      {
        id: 'custom_visualizations',
        name: 'Custom Visualization Development',
        description: 'Create advanced, custom visualizations for complex data',
        category: 'code',
        complexity: 'advanced',
        requirements: ['Visualization libraries', 'Design principles', 'Data understanding'],
        examples: [
          'Interactive dashboard creation',
          'Custom chart types',
          'Advanced statistical plots'
        ]
      },
      {
        id: 'data_architecture',
        name: 'Data Architecture Design',
        description: 'Design scalable data architectures and storage solutions',
        category: 'analysis',
        complexity: 'expert',
        requirements: ['System design', 'Database knowledge', 'Scalability principles'],
        examples: [
          'Design data warehouse schema',
          'Implement data lake architecture',
          'Create ETL pipeline design'
        ]
      },
      {
        id: 'performance_profiling',
        name: 'Performance Profiling',
        description: 'Analyze and optimize application and data processing performance',
        category: 'optimization',
        complexity: 'advanced',
        requirements: ['Performance monitoring', 'Profiling tools', 'Optimization techniques'],
        examples: [
          'Profile data processing bottlenecks',
          'Optimize database queries',
          'Memory usage analysis'
        ]
      }
    ];

    capabilities.forEach(cap => {
      this.capabilities.set(cap.id, cap);
    });

    console.log(`Initialized ${this.capabilities.size} technical capabilities`);
  }

  async executeTechnicalQuery(query: TechnicalQuery): Promise<TechnicalResponse> {
    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    const cachedResponse = this.responseCache.get(cacheKey);
    if (cachedResponse) {
      console.log(`Cache hit for technical query ${query.id}`);
      return cachedResponse;
    }

    // Store query
    this.queryHistory.set(query.id, query);

    try {
      // Select appropriate capability
      const capability = this.selectCapability(query);
      if (!capability) {
        throw new Error('No suitable technical capability found');
      }

      // Execute with appropriate provider
      const response = await this.executeWithCapability(query, capability);
      
      // Cache response
      this.responseCache.set(cacheKey, response);
      
      return response;
    } catch (error) {
      console.error(`Error executing technical query:`, error);
      throw error;
    }
  }

  private selectCapability(query: TechnicalQuery): TechnicalCapability | null {
    // Find capabilities that match the query type and complexity
    const matchingCapabilities = Array.from(this.capabilities.values())
      .filter(cap => {
        // Match category/type
        const typeMatch = this.mapQueryTypeToCategory(query.type) === cap.category;
        
        // Match complexity level
        const complexityMatch = this.isComplexityMatch(cap.complexity, query.metadata.technicalLevel);
        
        return typeMatch && complexityMatch;
      })
      .sort((a, b) => this.getComplexityScore(b.complexity) - this.getComplexityScore(a.complexity));

    return matchingCapabilities[0] || null;
  }

  private mapQueryTypeToCategory(queryType: string): string {
    const mapping: Record<string, string> = {
      'analysis': 'analysis',
      'code_generation': 'code',
      'optimization': 'optimization',
      'debugging': 'debugging',
      'automation': 'automation'
    };
    return mapping[queryType] || 'analysis';
  }

  private isComplexityMatch(capabilityComplexity: string, userLevel: string): boolean {
    const complexityLevels = ['basic', 'intermediate', 'advanced', 'expert'];
    const userLevelIndex = complexityLevels.indexOf(userLevel);
    const capabilityIndex = complexityLevels.indexOf(capabilityComplexity);
    
    // User can handle capabilities at their level or below
    return capabilityIndex <= userLevelIndex;
  }

  private getComplexityScore(complexity: string): number {
    const scores: Record<string, number> = {
      'basic': 1,
      'intermediate': 2,
      'advanced': 3,
      'expert': 4
    };
    return scores[complexity] || 0;
  }

  private async executeWithCapability(query: TechnicalQuery, capability: TechnicalCapability): Promise<TechnicalResponse> {
    const startTime = Date.now();
    
    try {
      // Create enhanced prompt based on capability
      const enhancedPrompt = this.createTechnicalPrompt(query, capability);
      
      // Execute with AI provider (using Gemini for technical queries)
      const aiResponse = await this.executeWithGemini(enhancedPrompt, query);
      
      // Parse and structure the response
      const response = this.parseTechnicalResponse(aiResponse, query, capability);
      
      return response;
    } catch (error) {
      console.error(`Error executing capability ${capability.id}:`, error);
      throw error;
    }
  }

  private createTechnicalPrompt(query: TechnicalQuery, capability: TechnicalCapability): string {
    let prompt = `You are an expert technical AI assistant specializing in ${capability.name}.\n\n`;
    
    prompt += `Capability: ${capability.description}\n`;
    prompt += `Complexity Level: ${capability.complexity}\n`;
    prompt += `Requirements: ${capability.requirements.join(', ')}\n\n`;
    
    prompt += `User Query: ${query.prompt}\n\n`;
    
    if (query.context.data) {
      prompt += `Data Context:\n${JSON.stringify(query.context.data, null, 2)}\n\n`;
    }
    
    if (query.context.code) {
      prompt += `Code Context:\n${query.context.code}\n\n`;
    }
    
    if (query.context.requirements) {
      prompt += `Requirements:\n${query.context.requirements.join('\n')}\n\n`;
    }
    
    if (query.context.constraints) {
      prompt += `Constraints:\n${query.context.constraints.join('\n')}\n\n`;
    }
    
    prompt += `Please provide a comprehensive technical response including:\n`;
    prompt += `1. Detailed explanation of the approach\n`;
    prompt += `2. Code implementation (if applicable)\n`;
    prompt += `3. Specific recommendations\n`;
    prompt += `4. Potential warnings or considerations\n`;
    prompt += `5. Next steps for implementation\n\n`;
    
    prompt += `Format your response as JSON with the following structure:\n`;
    prompt += `{\n`;
    prompt += `  "explanation": "Detailed technical explanation",\n`;
    prompt += `  "code": "Code implementation (if applicable)",\n`;
    prompt += `  "recommendations": ["recommendation1", "recommendation2"],\n`;
    prompt += `  "warnings": ["warning1", "warning2"],\n`;
    prompt += `  "nextSteps": ["step1", "step2"]\n`;
    prompt += `}`;
    
    return prompt;
  }

  private async executeWithGemini(prompt: string, query: TechnicalQuery): Promise<string> {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('Google AI API key not configured');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.3, // Lower temperature for more consistent technical responses
        responseMimeType: 'application/json'
      }
    });

    return result.response.text();
  }

  private parseTechnicalResponse(aiResponse: string, query: TechnicalQuery, capability: TechnicalCapability): TechnicalResponse {
    try {
      const parsed = JSON.parse(aiResponse);
      
      return {
        id: `tech_response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: query.type,
        content: {
          explanation: parsed.explanation || 'No explanation provided',
          code: parsed.code,
          recommendations: parsed.recommendations || [],
          warnings: parsed.warnings || [],
          nextSteps: parsed.nextSteps || []
        },
        metadata: {
          confidence: this.calculateTechnicalConfidence(parsed, query),
          complexity: capability.complexity,
          estimatedTime: this.estimateImplementationTime(capability.complexity),
          resources: this.getRequiredResources(capability)
        }
      };
    } catch (error) {
      console.error('Error parsing technical response:', error);
      
      // Fallback response
      return {
        id: `tech_response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: query.type,
        content: {
          explanation: aiResponse,
          recommendations: ['Review the response and implement step by step'],
          warnings: ['Response parsing failed, please review manually'],
          nextSteps: ['Implement the suggested approach', 'Test thoroughly', 'Iterate as needed']
        },
        metadata: {
          confidence: 0.5,
          complexity: capability.complexity,
          estimatedTime: 'Unknown',
          resources: this.getRequiredResources(capability)
        }
      };
    }
  }

  private calculateTechnicalConfidence(parsed: any, query: TechnicalQuery): number {
    let confidence = 0.7; // Base confidence for technical responses
    
    // Check for code presence
    if (parsed.code && parsed.code.length > 50) confidence += 0.1;
    
    // Check for comprehensive recommendations
    if (parsed.recommendations && parsed.recommendations.length >= 3) confidence += 0.1;
    
    // Check for warnings (shows awareness of potential issues)
    if (parsed.warnings && parsed.warnings.length > 0) confidence += 0.05;
    
    // Check for next steps
    if (parsed.nextSteps && parsed.nextSteps.length >= 2) confidence += 0.05;
    
    return Math.min(confidence, 1.0);
  }

  private estimateImplementationTime(complexity: string): string {
    const timeEstimates: Record<string, string> = {
      'basic': '15-30 minutes',
      'intermediate': '1-2 hours',
      'advanced': '2-4 hours',
      'expert': '4-8 hours'
    };
    return timeEstimates[complexity] || 'Unknown';
  }

  private getRequiredResources(capability: TechnicalCapability): string[] {
    const baseResources = ['Computer with internet access', 'Text editor or IDE'];
    
    const additionalResources: Record<string, string[]> = {
      'analysis': ['Statistical software (Python/R)', 'Data visualization tools'],
      'code': ['Programming environment', 'Relevant libraries and frameworks'],
      'optimization': ['Performance monitoring tools', 'Profiling software'],
      'debugging': ['Debugging tools', 'Testing framework'],
      'automation': ['Scheduling system', 'Monitoring tools']
    };
    
    return [...baseResources, ...(additionalResources[capability.category] || [])];
  }

  private generateCacheKey(query: TechnicalQuery): string {
    const keyData = {
      type: query.type,
      prompt: query.prompt,
      context: query.context,
      technicalLevel: query.metadata.technicalLevel
    };
    return require('crypto').createHash('md5').update(JSON.stringify(keyData)).digest('hex');
  }

  // Public API methods
  async analyzeData(data: any, analysisType: string, userLevel: string = 'intermediate'): Promise<TechnicalResponse> {
    const query: TechnicalQuery = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'analysis',
      prompt: `Perform ${analysisType} analysis on the provided data`,
      context: { data },
      metadata: {
        userId: 'system',
        timestamp: new Date(),
        priority: 'normal',
        technicalLevel: userLevel as any
      }
    };

    return await this.executeTechnicalQuery(query);
  }

  async generateCode(requirements: string[], context: any, userLevel: string = 'intermediate'): Promise<TechnicalResponse> {
    const query: TechnicalQuery = {
      id: `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'code_generation',
      prompt: `Generate code that meets the following requirements: ${requirements.join(', ')}`,
      context: { requirements, ...context },
      metadata: {
        userId: 'system',
        timestamp: new Date(),
        priority: 'normal',
        technicalLevel: userLevel as any
      }
    };

    return await this.executeTechnicalQuery(query);
  }

  async optimizePerformance(code: string, performanceIssues: string[], userLevel: string = 'advanced'): Promise<TechnicalResponse> {
    const query: TechnicalQuery = {
      id: `optimization_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'optimization',
      prompt: `Optimize the following code for better performance, addressing these issues: ${performanceIssues.join(', ')}`,
      context: { code, constraints: performanceIssues },
      metadata: {
        userId: 'system',
        timestamp: new Date(),
        priority: 'normal',
        technicalLevel: userLevel as any
      }
    };

    return await this.executeTechnicalQuery(query);
  }

  async debugCode(code: string, errorDescription: string, userLevel: string = 'intermediate'): Promise<TechnicalResponse> {
    const query: TechnicalQuery = {
      id: `debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'debugging',
      prompt: `Debug the following code. Error description: ${errorDescription}`,
      context: { code, requirements: [errorDescription] },
      metadata: {
        userId: 'system',
        timestamp: new Date(),
        priority: 'high',
        technicalLevel: userLevel as any
      }
    };

    return await this.executeTechnicalQuery(query);
  }

  getAvailableCapabilities(userLevel: string = 'intermediate'): TechnicalCapability[] {
    return Array.from(this.capabilities.values())
      .filter(cap => this.isComplexityMatch(cap.complexity, userLevel));
  }

  getCapabilityById(id: string): TechnicalCapability | undefined {
    return this.capabilities.get(id);
  }

  getQueryHistory(userId: string): TechnicalQuery[] {
    return Array.from(this.queryHistory.values()).filter(q => q.metadata.userId === userId);
  }

  clearCache(): void {
    this.responseCache.clear();
  }

  getStats(): {
    totalCapabilities: number;
    totalQueries: number;
    cachedResponses: number;
  } {
    return {
      totalCapabilities: this.capabilities.size,
      totalQueries: this.queryHistory.size,
      cachedResponses: this.responseCache.size
    };
  }
}

// Export singleton instance
export const technicalAIAgent = new TechnicalAIAgent();









