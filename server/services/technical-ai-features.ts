import { AIRouterService, type AIResponse } from './ai-router';
import { JourneyPromptService } from './journey-prompts';
import type { UserRole } from '../../shared/schema';
import type { SubscriptionTierId as SubscriptionTier } from '../../shared/subscription-tiers';

export interface CodeGenerationRequest {
  language: 'python' | 'r' | 'sql' | 'javascript' | 'julia';
  purpose: 'analysis' | 'visualization' | 'modeling' | 'preprocessing' | 'testing';
  complexity: 'simple' | 'intermediate' | 'advanced';
  requirements: {
    libraries?: string[];
    dataFormat?: string;
    outputType?: string;
    constraints?: string[];
  };
  context?: {
    dataDescription?: string;
    previousCode?: string;
    errorToFix?: string;
  };
}

export interface AdvancedAnalysisRequest {
  analysisType: 'statistical' | 'machine_learning' | 'time_series' | 'experimental_design';
  methodologies: string[];
  assumptions: string[];
  validationRequirements: string[];
  computationalConstraints?: {
    maxRuntime?: number;
    memoryLimit?: number;
    distributedComputing?: boolean;
  };
}

export interface ResearchRequest {
  domain: string;
  researchQuestion: string;
  methodology: 'exploratory' | 'confirmatory' | 'mixed_methods';
  existingLiterature?: string[];
  hypotheses?: string[];
  expectedOutcomes?: string[];
}

export class TechnicalAIFeatures {

  /**
   * Generate code for technical users with advanced capabilities
   */
  static async generateCode(
    userId: string,
    subscriptionTier: SubscriptionTier,
    request: CodeGenerationRequest,
    userPrompt: string
  ): Promise<AIResponse & {
    code: string;
    explanation: string;
    testing: string;
    documentation: string;
  }> {
    // Build comprehensive prompt for code generation
    const codePrompt = this.buildCodeGenerationPrompt(request, userPrompt);

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'technical',
      subscriptionTier,
      requestType: 'code',
      complexity: request.complexity === 'simple' ? 'advanced' : 'expert',
      dataContext: {
        dataType: request.requirements.dataFormat,
        analysisType: request.purpose
      }
    }, codePrompt);

    // Parse and structure the code response
    const parsedResponse = this.parseCodeResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Perform advanced statistical and ML analysis
   */
  static async performAdvancedAnalysis(
    userId: string,
    subscriptionTier: SubscriptionTier,
    request: AdvancedAnalysisRequest,
    dataContext: any,
    userPrompt: string
  ): Promise<AIResponse & {
    methodology: string;
    assumptions: string[];
    implementation: string;
    validation: string;
    interpretation: string;
    limitations: string;
  }> {
    const analysisPrompt = this.buildAdvancedAnalysisPrompt(request, dataContext, userPrompt);

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'technical',
      subscriptionTier,
      requestType: 'analysis',
      complexity: 'expert',
      dataContext: {
        analysisType: request.analysisType,
        dataType: dataContext.type,
        dataSize: dataContext.size
      }
    }, analysisPrompt);

    const parsedResponse = this.parseAnalysisResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Provide research-grade AI assistance
   */
  static async conductResearch(
    userId: string,
    subscriptionTier: SubscriptionTier,
    request: ResearchRequest,
    userPrompt: string
  ): Promise<AIResponse & {
    literatureReview: string;
    methodology: string;
    analysisPlans: string[];
    expectedChallenges: string[];
    nextSteps: string[];
  }> {
    const researchPrompt = this.buildResearchPrompt(request, userPrompt);

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'technical',
      subscriptionTier,
      requestType: 'analysis',
      complexity: 'expert'
    }, researchPrompt);

    const parsedResponse = this.parseResearchResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Generate comprehensive code with best practices
   */
  static async generateAdvancedCode(
    userId: string,
    subscriptionTier: SubscriptionTier,
    request: CodeGenerationRequest & {
      includeTesting: boolean;
      includeDocumentation: boolean;
      includeOptimization: boolean;
    },
    userPrompt: string
  ): Promise<AIResponse & {
    mainCode: string;
    testCode?: string;
    documentation?: string;
    optimizationSuggestions?: string;
    performanceBenchmarks?: string;
  }> {
    const comprehensivePrompt = this.buildComprehensiveCodePrompt(request, userPrompt);

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'technical',
      subscriptionTier,
      requestType: 'generation',
      complexity: 'expert'
    }, comprehensivePrompt);

    return {
      ...aiResponse,
      ...this.parseComprehensiveCodeResponse(aiResponse.content)
    };
  }

  /**
   * Build specialized prompts for code generation
   */
  private static buildCodeGenerationPrompt(
    request: CodeGenerationRequest,
    userPrompt: string
  ): string {
    return `Generate ${request.language} code for ${request.purpose} with the following specifications:

REQUIREMENTS:
- Language: ${request.language}
- Purpose: ${request.purpose}
- Complexity Level: ${request.complexity}
- Libraries: ${request.requirements.libraries?.join(', ') || 'standard libraries'}
- Data Format: ${request.requirements.dataFormat || 'flexible'}
- Output Type: ${request.requirements.outputType || 'standard output'}
- Constraints: ${request.requirements.constraints?.join(', ') || 'none specified'}

${request.context?.dataDescription ? `DATA CONTEXT: ${request.context.dataDescription}` : ''}
${request.context?.previousCode ? `PREVIOUS CODE: ${request.context.previousCode}` : ''}
${request.context?.errorToFix ? `ERROR TO FIX: ${request.context.errorToFix}` : ''}

USER REQUEST: ${userPrompt}

Please provide:
1. Complete, working code with proper error handling
2. Clear explanations of the approach and algorithms used
3. Testing code to validate functionality
4. Documentation including docstrings and comments
5. Performance considerations and optimization suggestions

Format the response with clear sections for CODE, EXPLANATION, TESTING, and DOCUMENTATION.`;
  }

  /**
   * Build prompts for advanced analysis
   */
  private static buildAdvancedAnalysisPrompt(
    request: AdvancedAnalysisRequest,
    dataContext: any,
    userPrompt: string
  ): string {
    return `Perform advanced ${request.analysisType} analysis with the following specifications:

ANALYSIS REQUIREMENTS:
- Type: ${request.analysisType}
- Methodologies: ${request.methodologies.join(', ')}
- Assumptions: ${request.assumptions.join(', ')}
- Validation: ${request.validationRequirements.join(', ')}

${request.computationalConstraints ? `
COMPUTATIONAL CONSTRAINTS:
- Max Runtime: ${request.computationalConstraints.maxRuntime || 'flexible'}
- Memory Limit: ${request.computationalConstraints.memoryLimit || 'standard'}
- Distributed: ${request.computationalConstraints.distributedComputing ? 'yes' : 'no'}
` : ''}

DATA CONTEXT: ${JSON.stringify(dataContext, null, 2)}

USER REQUEST: ${userPrompt}

Please provide a comprehensive analysis including:
1. Detailed methodology selection and justification
2. Complete list of assumptions and their implications
3. Step-by-step implementation approach
4. Validation strategy and testing procedures
5. Result interpretation guidelines
6. Known limitations and potential issues

Structure your response with clear sections for METHODOLOGY, ASSUMPTIONS, IMPLEMENTATION, VALIDATION, INTERPRETATION, and LIMITATIONS.`;
  }

  /**
   * Build prompts for research assistance
   */
  private static buildResearchPrompt(request: ResearchRequest, userPrompt: string): string {
    return `Provide research-grade assistance for the following research project:

RESEARCH CONTEXT:
- Domain: ${request.domain}
- Research Question: ${request.researchQuestion}
- Methodology: ${request.methodology}
- Existing Literature: ${request.existingLiterature?.join(', ') || 'to be identified'}
- Hypotheses: ${request.hypotheses?.join(', ') || 'to be developed'}
- Expected Outcomes: ${request.expectedOutcomes?.join(', ') || 'to be determined'}

USER REQUEST: ${userPrompt}

Please provide:
1. Literature review strategy and key papers/concepts to investigate
2. Detailed research methodology recommendations
3. Analysis plans with statistical/computational approaches
4. Expected challenges and mitigation strategies
5. Next steps and timeline considerations

Structure your response as a comprehensive research plan with sections for LITERATURE_REVIEW, METHODOLOGY, ANALYSIS_PLANS, CHALLENGES, and NEXT_STEPS.`;
  }

  /**
   * Build comprehensive code generation prompts
   */
  private static buildComprehensiveCodePrompt(
    request: CodeGenerationRequest & {
      includeTesting: boolean;
      includeDocumentation: boolean;
      includeOptimization: boolean;
    },
    userPrompt: string
  ): string {
    return `Generate comprehensive ${request.language} solution with the following requirements:

CODE REQUIREMENTS:
- Language: ${request.language}
- Purpose: ${request.purpose}
- Complexity: ${request.complexity}
- Include Testing: ${request.includeTesting}
- Include Documentation: ${request.includeDocumentation}
- Include Optimization: ${request.includeOptimization}

${this.buildCodeGenerationPrompt(request, userPrompt)}

ADDITIONAL REQUIREMENTS:
${request.includeTesting ? '- Comprehensive test suite with unit tests and integration tests' : ''}
${request.includeDocumentation ? '- Complete API documentation and usage examples' : ''}
${request.includeOptimization ? '- Performance optimization analysis and recommendations' : ''}

Provide a complete solution with production-ready code, thorough testing, and comprehensive documentation.`;
  }

  /**
   * Parse code generation responses
   */
  private static parseCodeResponse(response: string): {
    code: string;
    explanation: string;
    testing: string;
    documentation: string;
  } {
    const sections = this.extractSections(response, ['CODE', 'EXPLANATION', 'TESTING', 'DOCUMENTATION']);

    return {
      code: sections.CODE || this.extractCodeBlocks(response)[0] || response,
      explanation: sections.EXPLANATION || '',
      testing: sections.TESTING || '',
      documentation: sections.DOCUMENTATION || ''
    };
  }

  /**
   * Parse advanced analysis responses
   */
  private static parseAnalysisResponse(response: string): {
    methodology: string;
    assumptions: string[];
    implementation: string;
    validation: string;
    interpretation: string;
    limitations: string;
  } {
    const sections = this.extractSections(response, [
      'METHODOLOGY', 'ASSUMPTIONS', 'IMPLEMENTATION',
      'VALIDATION', 'INTERPRETATION', 'LIMITATIONS'
    ]);

    return {
      methodology: sections.METHODOLOGY || '',
      assumptions: this.extractListItems(sections.ASSUMPTIONS || ''),
      implementation: sections.IMPLEMENTATION || '',
      validation: sections.VALIDATION || '',
      interpretation: sections.INTERPRETATION || '',
      limitations: sections.LIMITATIONS || ''
    };
  }

  /**
   * Parse research responses
   */
  private static parseResearchResponse(response: string): {
    literatureReview: string;
    methodology: string;
    analysisPlans: string[];
    expectedChallenges: string[];
    nextSteps: string[];
  } {
    const sections = this.extractSections(response, [
      'LITERATURE_REVIEW', 'METHODOLOGY', 'ANALYSIS_PLANS',
      'CHALLENGES', 'NEXT_STEPS'
    ]);

    return {
      literatureReview: sections.LITERATURE_REVIEW || '',
      methodology: sections.METHODOLOGY || '',
      analysisPlans: this.extractListItems(sections.ANALYSIS_PLANS || ''),
      expectedChallenges: this.extractListItems(sections.CHALLENGES || ''),
      nextSteps: this.extractListItems(sections.NEXT_STEPS || '')
    };
  }

  /**
   * Parse comprehensive code responses
   */
  private static parseComprehensiveCodeResponse(response: string): {
    mainCode: string;
    testCode?: string;
    documentation?: string;
    optimizationSuggestions?: string;
    performanceBenchmarks?: string;
  } {
    const codeBlocks = this.extractCodeBlocks(response);
    const sections = this.extractSections(response, [
      'CODE', 'TESTING', 'DOCUMENTATION', 'OPTIMIZATION', 'PERFORMANCE'
    ]);

    return {
      mainCode: sections.CODE || codeBlocks[0] || '',
      testCode: sections.TESTING || codeBlocks[1],
      documentation: sections.DOCUMENTATION,
      optimizationSuggestions: sections.OPTIMIZATION,
      performanceBenchmarks: sections.PERFORMANCE
    };
  }

  /**
   * Utility functions for parsing responses
   */
  private static extractSections(
    text: string,
    sectionNames: string[]
  ): Record<string, string> {
    const sections: Record<string, string> = {};

    sectionNames.forEach(name => {
      const regex = new RegExp(`${name}:?\\s*\\n([\\s\\S]*?)(?=\\n\\n[A-Z_]+:|$)`, 'i');
      const match = text.match(regex);
      if (match) {
        sections[name] = match[1].trim();
      }
    });

    return sections;
  }

  private static extractCodeBlocks(text: string): string[] {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      blocks.push(match[1]);
    }

    return blocks;
  }

  private static extractListItems(text: string): string[] {
    const lines = text.split('\n');
    const items = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || /^\d+\./.test(trimmed)) {
        items.push(trimmed.replace(/^[-•\d.\s]+/, '').trim());
      }
    }

    return items;
  }

  /**
   * Get available technical features by subscription tier
   */
  static getAvailableFeatures(subscriptionTier: SubscriptionTier): {
    codeGeneration: boolean;
    advancedAnalysis: boolean;
    researchAssistance: boolean;
    customModels: boolean;
    distributedComputing: boolean;
    optimizationAnalysis: boolean;
  } {
    const featureMatrix = {
      none: {
        codeGeneration: false,
        advancedAnalysis: false,
        researchAssistance: false,
        customModels: false,
        distributedComputing: false,
        optimizationAnalysis: false
      },
      trial: {
        codeGeneration: true,
        advancedAnalysis: false,
        researchAssistance: false,
        customModels: false,
        distributedComputing: false,
        optimizationAnalysis: false
      },
      starter: {
        codeGeneration: true,
        advancedAnalysis: true,
        researchAssistance: false,
        customModels: false,
        distributedComputing: false,
        optimizationAnalysis: true
      },
      professional: {
        codeGeneration: true,
        advancedAnalysis: true,
        researchAssistance: true,
        customModels: true,
        distributedComputing: false,
        optimizationAnalysis: true
      },
      enterprise: {
        codeGeneration: true,
        advancedAnalysis: true,
        researchAssistance: true,
        customModels: true,
        distributedComputing: true,
        optimizationAnalysis: true
      }
    };

  const tier = subscriptionTier as import('../../shared/subscription-tiers').SubscriptionTierId;
  return featureMatrix[tier as keyof typeof featureMatrix];
  }

  /**
   * Validate technical feature access
   */
  static validateFeatureAccess(
    feature: keyof ReturnType<typeof TechnicalAIFeatures.getAvailableFeatures>,
    subscriptionTier: SubscriptionTier
  ): { allowed: boolean; reason?: string } {
    const availableFeatures = this.getAvailableFeatures(subscriptionTier);

    if (!availableFeatures[feature]) {
      const reasons = {
        codeGeneration: 'Code generation requires a subscription plan',
        advancedAnalysis: 'Advanced analysis features require Starter plan or higher',
        researchAssistance: 'Research assistance requires Professional plan or higher',
        customModels: 'Custom AI models require Professional plan or higher',
        distributedComputing: 'Distributed computing requires Enterprise plan',
        optimizationAnalysis: 'Optimization analysis requires Starter plan or higher'
      };

      return {
        allowed: false,
        reason: reasons[feature]
      };
    }

    return { allowed: true };
  }
}