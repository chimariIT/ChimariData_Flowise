import { db } from './db';
import { artifactTemplates, projects, generatedArtifacts, decisionAudits } from '@shared/schema';
import { eq, and, desc, like, or } from 'drizzle-orm';
import { multiAIService } from './multi-ai-service';

interface IndustryResearchResult {
  industryName: string;
  subIndustries: string[];
  keyMetrics: IndustryMetric[];
  businessProcesses: BusinessProcess[];
  stakeholderRoles: StakeholderRole[];
  commonAnalysisTypes: AnalysisType[];
  regulatoryContext: RegulatoryRequirement[];
  benchmarkSources: BenchmarkSource[];
  terminology: IndustryTerminology[];
}

interface IndustryMetric {
  name: string;
  description: string;
  category: 'financial' | 'operational' | 'customer' | 'strategic' | 'regulatory';
  calculationMethod: string;
  typicalRange: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  stakeholders: string[];
  benchmarkSources: string[];
}

interface BusinessProcess {
  name: string;
  description: string;
  inputs: string[];
  outputs: string[];
  keyStakeholders: string[];
  metrics: string[];
  analysisOpportunities: string[];
}

interface StakeholderRole {
  title: string;
  level: 'individual_contributor' | 'manager' | 'director' | 'vp' | 'c_suite';
  responsibilities: string[];
  decisionAuthority: string[];
  reportingNeeds: ReportingNeed[];
  preferredFormats: string[];
}

interface ReportingNeed {
  type: string;
  frequency: string;
  audience: string;
  keyMetrics: string[];
  format: string;
}

interface AnalysisType {
  name: string;
  description: string;
  businessValue: string;
  requiredData: string[];
  outputTypes: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  timeframe: string;
}

interface RegulatoryRequirement {
  regulation: string;
  scope: string;
  reportingRequirements: string[];
  metrics: string[];
  frequency: string;
}

interface BenchmarkSource {
  name: string;
  type: 'industry_report' | 'government_data' | 'trade_association' | 'research_firm';
  url?: string;
  metrics: string[];
  updateFrequency: string;
  accessMethod: 'public' | 'subscription' | 'api';
}

interface IndustryTerminology {
  term: string;
  definition: string;
  aliases: string[];
  context: string;
}

interface DynamicTemplateRequest {
  industryDescription: string;
  businessContext: string;
  specificRequirements: string[];
  stakeholderRoles: string[];
  dataContext?: {
    availableFields: string[];
    businessProcesses: string[];
    currentChallenges: string[];
  };
  previousAnalyses?: {
    successful: any[];
    unsuccessful: any[];
    feedback: any[];
  };
}

interface GeneratedTemplate {
  id: string;
  industryMatch: string;
  confidence: number;
  template: {
    name: string;
    description: string;
    targetRoles: string[];
    targetIndustries: string[];
    components: any[];
    narrativeStyle: string;
    visualComplexity: string;
    interactivity: string;
    kpis: IndustryMetric[];
    benchmarks: BenchmarkSource[];
    processes: BusinessProcess[];
  };
  sources: {
    researchSources: string[];
    templateBasis: string[];
    validationSources: string[];
  };
  metadata: {
    generatedAt: Date;
    researchTime: number;
    validationScore: number;
    usageCount: number;
    successRate: number;
    lastUpdated: Date;
  };
}

export class DynamicTemplateEngine {
  private static instance: DynamicTemplateEngine;
  private webFetch: WebFetch;
  private industryKnowledgeCache: Map<string, IndustryResearchResult> = new Map();
  private templateCache: Map<string, GeneratedTemplate> = new Map();

  public static getInstance(): DynamicTemplateEngine {
    if (!DynamicTemplateEngine.instance) {
      DynamicTemplateEngine.instance = new DynamicTemplateEngine();
    }
    return DynamicTemplateEngine.instance;
  }

  constructor() {
    this.webFetch = new WebFetch();
  }

  /**
   * Main entry point for dynamic template generation
   */
  async generateDynamicTemplate(request: DynamicTemplateRequest): Promise<GeneratedTemplate> {
    const startTime = Date.now();

    try {
      // 1. Research industry and business context
      const industryResearch = await this.researchIndustryContext(
        request.industryDescription,
        request.businessContext
      );

      // 2. Find similar templates or patterns
      const similarTemplates = await this.findSimilarTemplates(industryResearch);

      // 3. Generate template using AI with research context
      const template = await this.generateTemplateFromResearch(
        request,
        industryResearch,
        similarTemplates
      );

      // 4. Validate template against industry standards
      const validatedTemplate = await this.validateTemplate(template, industryResearch);

      // 5. Store and cache the template
      const generatedTemplate = await this.storeGeneratedTemplate(
        validatedTemplate,
        industryResearch,
        startTime
      );

      // 6. Record decision audit
      await this.recordTemplateGeneration(request, generatedTemplate);

      return generatedTemplate;

    } catch (error) {
      console.error('Dynamic template generation failed:', error);
      throw new Error(`Template generation failed: ${(error as Error).message || String(error)}`);
    }
  }

  /**
   * Research industry context using multiple sources
   */
  private async researchIndustryContext(
    industryDescription: string,
    businessContext: string
  ): Promise<IndustryResearchResult> {
    // Check cache first
    const cacheKey = `${industryDescription}_${businessContext}`;
    if (this.industryKnowledgeCache.has(cacheKey)) {
      return this.industryKnowledgeCache.get(cacheKey)!;
    }

    const researchSources = [
      await this.researchFromPublicSources(industryDescription, businessContext),
      await this.researchFromAIKnowledge(industryDescription, businessContext),
      await this.researchFromExistingProjects(industryDescription, businessContext),
      await this.researchFromIndustryAPIs(industryDescription, businessContext)
    ];

    // Synthesize research results
    const synthesizedResearch = await this.synthesizeResearch(
      researchSources,
      industryDescription,
      businessContext
    );

    // Cache the result
    this.industryKnowledgeCache.set(cacheKey, synthesizedResearch);

    return synthesizedResearch;
  }

  /**
   * Research from public web sources
   */
  private async researchFromPublicSources(
    industryDescription: string,
    businessContext: string
  ): Promise<Partial<IndustryResearchResult>> {
    const researchPrompt = `Research the ${industryDescription} industry, specifically focusing on ${businessContext}.

Find information about:
1. Key performance indicators and metrics
2. Common business processes
3. Stakeholder roles and responsibilities
4. Typical analysis types and reporting needs
5. Industry benchmarks and standards
6. Regulatory requirements

Prioritize authoritative sources like industry associations, government agencies, and research firms.`;

    try {
      // Search for industry reports and data
      const industryReportSources = [
        `${industryDescription} industry KPIs metrics benchmarks`,
        `${industryDescription} business intelligence reporting standards`,
        `${businessContext} analysis best practices ${industryDescription}`,
        `${industryDescription} industry association standards metrics`
      ];

      const researchResults = [];

      for (const searchQuery of industryReportSources) {
        try {
          const searchResult = await this.webFetch.searchAndAnalyze(
            searchQuery,
            `Extract key metrics, stakeholder roles, and business processes for ${industryDescription} industry with focus on ${businessContext}. Format as structured data.`
          );

          if (searchResult.success && searchResult.content) {
            researchResults.push(searchResult.content);
          }
        } catch (error) {
          console.warn(`Failed to research ${searchQuery}:`, error);
        }
      }

      // Parse and structure the research
      return await this.parseResearchResults(researchResults, industryDescription);

    } catch (error) {
      console.error('Public source research failed:', error);
      return { industryName: industryDescription, keyMetrics: [], businessProcesses: [], stakeholderRoles: [] } as Partial<IndustryResearchResult>;
    }
  }

  /**
   * Research using AI knowledge base
   */
  private async researchFromAIKnowledge(
    industryDescription: string,
    businessContext: string
  ): Promise<Partial<IndustryResearchResult>> {
    const aiPrompt = `As an expert in ${industryDescription} industry analysis, provide comprehensive information about:

Industry: ${industryDescription}
Business Context: ${businessContext}

Please provide:

1. TOP 10 KEY METRICS for this industry:
   - Name and description
   - How it's calculated
   - Typical benchmarks/ranges
   - Which stakeholders care about it
   - Reporting frequency

2. MAIN BUSINESS PROCESSES:
   - Process name and description
   - Key inputs and outputs
   - Stakeholders involved
   - Metrics to track

3. STAKEHOLDER ROLES:
   - Job titles and levels
   - Their responsibilities
   - What reports/metrics they need
   - How often they need updates

4. COMMON ANALYSIS TYPES:
   - Type of analysis
   - Business value
   - Required data
   - Complexity level

5. INDUSTRY TERMINOLOGY:
   - Key terms and definitions
   - Common abbreviations
   - Context-specific meanings

Format as structured JSON for easy parsing.`;

    try {
      const aiResult = await multiAIService.analyzeWithFallback(aiPrompt, {
        industryDescription,
        businessContext
      });

      const parsedResult = JSON.parse(aiResult.result);

      return {
        industryName: industryDescription,
        keyMetrics: parsedResult.keyMetrics || [],
        businessProcesses: parsedResult.businessProcesses || [],
        stakeholderRoles: parsedResult.stakeholderRoles || [],
        commonAnalysisTypes: parsedResult.analysisTypes || [],
        terminology: parsedResult.terminology || []
      };

    } catch (error) {
      console.error('AI knowledge research failed:', error);
      return { industryName: industryDescription, keyMetrics: [], businessProcesses: [], stakeholderRoles: [] } as Partial<IndustryResearchResult>;
    }
  }

  /**
   * Research from existing successful projects
   */
  private async researchFromExistingProjects(
    industryDescription: string,
    businessContext: string
  ): Promise<Partial<IndustryResearchResult>> {
    try {
      // Find similar projects in database
      const similarProjects = await db
        .select()
        .from(projects)
        .where(
          like(projects.description, `%${businessContext}%`)
        )
        .orderBy(desc(projects.createdAt))
        .limit(10);

      if (similarProjects.length === 0) {
        return { industryName: industryDescription, keyMetrics: [], businessProcesses: [], stakeholderRoles: [] } as Partial<IndustryResearchResult>;
      }

      // Analyze successful patterns from similar projects
      const successfulPatterns = await this.extractPatternsFromProjects(similarProjects);

      return {
        industryName: industryDescription,
        keyMetrics: successfulPatterns.metrics,
        businessProcesses: successfulPatterns.processes,
        stakeholderRoles: successfulPatterns.roles,
        commonAnalysisTypes: successfulPatterns.analysisTypes
      };

    } catch (error) {
      console.error('Existing projects research failed:', error);
      return { industryName: industryDescription, keyMetrics: [], businessProcesses: [], stakeholderRoles: [] } as Partial<IndustryResearchResult>;
    }
  }

  /**
   * Research from industry-specific APIs and data sources
   */
  private async researchFromIndustryAPIs(
    industryDescription: string,
    businessContext: string
  ): Promise<Partial<IndustryResearchResult>> {
    const industryAPIs = {
      finance: [
        'https://api.worldbank.org/v2/indicator',
        'https://api.fred.stlouisfed.org/fred/series'
      ],
      retail: [
        'https://api.census.gov/data/timeseries/eits/resconst',
        'https://api.bls.gov/publicAPI/v2/timeseries/data'
      ],
      healthcare: [
        'https://api.cms.gov/v1/public',
        'https://api.healthdata.gov/api/3/action'
      ],
      technology: [
        'https://api.github.com/search/repositories',
        'https://api.crunchbase.com/api/4'
      ]
    };

    // This would integrate with actual APIs - for now return placeholder
    return {
      industryName: industryDescription,
      benchmarkSources: [
        {
          name: `${industryDescription} Industry Benchmarks`,
          type: 'industry_report',
          metrics: ['revenue_growth', 'market_share', 'efficiency_ratio'],
          updateFrequency: 'quarterly',
          accessMethod: 'public'
        }
      ]
    } as Partial<IndustryResearchResult>;
  }

  /**
   * Synthesize research from multiple sources
   */
  private async synthesizeResearch(
    researchSources: Partial<IndustryResearchResult>[],
    industryDescription: string,
    businessContext: string
  ): Promise<IndustryResearchResult> {
    const synthesisPrompt = `Synthesize research from multiple sources about ${industryDescription} industry with focus on ${businessContext}.

Research Sources:
${JSON.stringify(researchSources, null, 2)}

Create a comprehensive industry research result that:
1. Combines and deduplicates information from all sources
2. Prioritizes the most reliable and relevant information
3. Fills gaps with logical inferences
4. Provides confidence scores for each element

Return a complete IndustryResearchResult JSON object with all required fields.`;

    try {
      const synthesisResult = await multiAIService.analyzeWithFallback(synthesisPrompt, {
        researchSources,
        industryDescription,
        businessContext
      });

      const synthesized = JSON.parse(synthesisResult.result);

      return {
        industryName: industryDescription,
        subIndustries: synthesized.subIndustries || [],
        keyMetrics: synthesized.keyMetrics || [],
        businessProcesses: synthesized.businessProcesses || [],
        stakeholderRoles: synthesized.stakeholderRoles || [],
        commonAnalysisTypes: synthesized.commonAnalysisTypes || [],
        regulatoryContext: synthesized.regulatoryContext || [],
        benchmarkSources: synthesized.benchmarkSources || [],
        terminology: synthesized.terminology || []
      };

    } catch (error) {
      console.error('Research synthesis failed:', error);
      // Return a basic synthesis based on available data
      return this.createBasicSynthesis(researchSources, industryDescription);
    }
  }

  /**
   * Find similar existing templates
   */
  private async findSimilarTemplates(
    industryResearch: IndustryResearchResult
  ): Promise<any[]> {
    // Search existing templates
    const existingTemplatesRaw = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.isActive, true));

    const existingTemplates = Array.isArray(existingTemplatesRaw)
      ? existingTemplatesRaw
      : [];

    // Use AI to find semantic similarities
    const similarityPrompt = `Find templates similar to this industry context:

Target Industry: ${industryResearch.industryName}
Key Metrics: ${industryResearch.keyMetrics.map(m => m.name).join(', ')}
Business Processes: ${industryResearch.businessProcesses.map(p => p.name).join(', ')}

Existing Templates:
${existingTemplates.map((t: any) => `${t.name}: ${t.description} (Industries: ${t.targetIndustries})`).join('\n')}

Return the top 3 most similar templates with similarity scores (0-1).`;

    try {
      const similarityResult = await multiAIService.analyzeWithFallback(similarityPrompt, {
        industryResearch,
        existingTemplates
      });

      return JSON.parse(similarityResult.result).similarTemplates || [];
    } catch (error) {
      console.error('Template similarity search failed:', error);
      return [];
    }
  }

  /**
   * Generate template from research and similar templates
   */
  private async generateTemplateFromResearch(
    request: DynamicTemplateRequest,
    industryResearch: IndustryResearchResult,
    similarTemplates: any[]
  ): Promise<any> {
    const generationPrompt = `Generate a comprehensive analysis template based on this research:

INDUSTRY RESEARCH:
${JSON.stringify(industryResearch, null, 2)}

USER REQUEST:
- Industry: ${request.industryDescription}
- Business Context: ${request.businessContext}
- Specific Requirements: ${request.specificRequirements.join(', ')}
- Stakeholder Roles: ${request.stakeholderRoles.join(', ')}

SIMILAR TEMPLATES FOR REFERENCE:
${JSON.stringify(similarTemplates, null, 2)}

DATA CONTEXT:
${request.dataContext ? JSON.stringify(request.dataContext, null, 2) : 'Not provided'}

Create a template that includes:
1. Template metadata (name, description, target roles/industries)
2. Component specifications for different audiences
3. KPI definitions with calculation methods
4. Visualization recommendations
5. Narrative templates for different stakeholder levels
6. Benchmark comparisons where applicable

The template should be industry-specific, actionable, and tailored to the user's requirements.
Return as a complete template JSON object.`;

    try {
      const templateResult = await multiAIService.analyzeWithFallback(generationPrompt, {
        request,
        industryResearch,
        similarTemplates
      });

      return JSON.parse(templateResult.result);
    } catch (error) {
      console.error('Template generation failed:', error);
      throw new Error('Failed to generate template from research');
    }
  }

  /**
   * Validate template against industry standards
   */
  private async validateTemplate(
    template: any,
    industryResearch: IndustryResearchResult
  ): Promise<any> {
    const validationPrompt = `Validate this template against industry standards:

TEMPLATE:
${JSON.stringify(template, null, 2)}

INDUSTRY STANDARDS:
${JSON.stringify(industryResearch, null, 2)}

Check for:
1. Accuracy of metrics and calculations
2. Completeness of stakeholder coverage
3. Industry terminology usage
4. Benchmark appropriateness
5. Compliance considerations

Return the validated template with corrections and a validation score (0-100).`;

    try {
      const validationResult = await multiAIService.analyzeWithFallback(validationPrompt, {
        template,
        industryResearch
      });

      const validated = JSON.parse(validationResult.result);
      return validated.template || template;
    } catch (error) {
      console.error('Template validation failed:', error);
      return template; // Return original if validation fails
    }
  }

  /**
   * Store generated template
   */
  private async storeGeneratedTemplate(
    template: any,
    industryResearch: IndustryResearchResult,
    startTime: number
  ): Promise<GeneratedTemplate> {
    const generatedTemplate: GeneratedTemplate = {
      id: `dyn_template_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      industryMatch: industryResearch.industryName,
      confidence: 0.85, // Would be calculated based on research quality
      template,
      sources: {
        researchSources: ['web_research', 'ai_knowledge', 'existing_projects'],
        templateBasis: [],
        validationSources: ['industry_standards', 'ai_validation']
      },
      metadata: {
        generatedAt: new Date(),
        researchTime: Date.now() - startTime,
        validationScore: 85,
        usageCount: 0,
        successRate: 0,
        lastUpdated: new Date()
      }
    };

    // Store in database
    await db.insert(artifactTemplates).values({
      id: generatedTemplate.id,
      name: template.name,
      description: template.description,
      targetRoles: template.targetRoles,
      targetIndustries: [industryResearch.industryName],
      components: template.components,
      narrativeStyle: template.narrativeStyle || 'business_analysis',
      visualComplexity: template.visualComplexity || 'intermediate',
      interactivity: template.interactivity || 'interactive',
      isActive: true,
      version: '1.0',
      createdBy: 'dynamic_template_engine',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Cache the template
    this.templateCache.set(generatedTemplate.id, generatedTemplate);

    return generatedTemplate;
  }

  /**
   * Record template generation decision
   */
  private async recordTemplateGeneration(
    request: DynamicTemplateRequest,
    generatedTemplate: GeneratedTemplate
  ): Promise<void> {
    await db.insert(decisionAudits).values({
      id: `decision_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      projectId: 'template_generation', // Special project ID for template generation
      agent: 'business_agent',
      decisionType: 'template_generation',
      decision: `Generated dynamic template for ${request.industryDescription}`,
      reasoning: `Created industry-specific template based on comprehensive research including web sources, AI knowledge, and existing project patterns. Template covers ${generatedTemplate.template.kpis?.length || 0} KPIs and ${generatedTemplate.template.components?.length || 0} components.`,
      alternatives: ['use_generic_template', 'manual_template_creation', 'template_modification'],
      confidence: Math.round(generatedTemplate.confidence * 100),
      context: {
        industryResearch: true,
        researchTime: generatedTemplate.metadata.researchTime,
        sources: generatedTemplate.sources
      },
      impact: 'high',
      reversible: true,
      timestamp: new Date()
    });
  }

  /**
   * Update template based on usage feedback
   */
  async updateTemplateFromFeedback(
    templateId: string,
    feedback: {
      effectiveness: number; // 1-5
      missingElements: string[];
      incorrectElements: string[];
      userComments: string;
      stakeholderRole: string;
    }
  ): Promise<void> {
    const template = this.templateCache.get(templateId);
    if (!template) return;

    // Update template based on feedback
    const updatePrompt = `Update this template based on user feedback:

CURRENT TEMPLATE:
${JSON.stringify(template.template, null, 2)}

USER FEEDBACK:
- Effectiveness Rating: ${feedback.effectiveness}/5
- Missing Elements: ${feedback.missingElements.join(', ')}
- Incorrect Elements: ${feedback.incorrectElements.join(', ')}
- Comments: ${feedback.userComments}
- User Role: ${feedback.stakeholderRole}

Provide an improved template that addresses the feedback while maintaining industry accuracy.`;

    try {
      const updateResult = await multiAIService.analyzeWithFallback(updatePrompt, {
        template,
        feedback
      });

      const updatedTemplate = JSON.parse(updateResult.result);

      // Update in database and cache
      await db
        .update(artifactTemplates)
        .set({
          components: updatedTemplate.components,
          updatedAt: new Date(),
          version: `${parseFloat((template.template as any).version || '1.0') + 0.1}`
        })
        .where(eq(artifactTemplates.id, templateId));

      // Update cache
      template.template = updatedTemplate;
      template.metadata.lastUpdated = new Date();
      this.templateCache.set(templateId, template);

    } catch (error) {
      console.error('Template update failed:', error);
    }
  }

  /**
   * Get or generate template for specific context
   */
  async getTemplateForContext(
    industryDescription: string,
    businessContext: string,
    stakeholderRoles: string[]
  ): Promise<GeneratedTemplate> {
    // Check if we have a suitable existing template
    const existingTemplate = await this.findExistingTemplate(
      industryDescription,
      businessContext,
      stakeholderRoles
    );

    if (existingTemplate && existingTemplate.confidence > 0.7) {
      return existingTemplate;
    }

    // Generate new template
    return this.generateDynamicTemplate({
      industryDescription,
      businessContext,
      specificRequirements: [],
      stakeholderRoles
    });
  }

  /**
   * Helper methods
   */
  private async parseResearchResults(
    results: any[],
    industryDescription: string
  ): Promise<Partial<IndustryResearchResult>> {
    // Parse and structure raw research results
    const parsePrompt = `Parse these research results for ${industryDescription} industry:

${JSON.stringify(results, null, 2)}

Extract and structure:
1. Key metrics with descriptions
2. Business processes
3. Stakeholder roles
4. Industry terminology

Return as structured JSON.`;

    try {
      const parseResult = await multiAIService.analyzeWithFallback(parsePrompt, { results, industryDescription });
      return JSON.parse(parseResult.result);
    } catch (error) {
      return { industryName: industryDescription, keyMetrics: [], businessProcesses: [], stakeholderRoles: [] };
    }
  }

  private async extractPatternsFromProjects(projects: any[]): Promise<{
    metrics: IndustryMetric[];
    processes: BusinessProcess[];
    roles: StakeholderRole[];
    analysisTypes: AnalysisType[];
  }> {
    // Extract successful patterns from existing projects
    return {
      metrics: [],
      processes: [],
      roles: [],
      analysisTypes: []
    };
  }

  private createBasicSynthesis(
    sources: Partial<IndustryResearchResult>[],
    industryName: string
  ): IndustryResearchResult {
    return {
      industryName,
      subIndustries: [],
      keyMetrics: sources.flatMap(s => s.keyMetrics || []),
      businessProcesses: sources.flatMap(s => s.businessProcesses || []),
      stakeholderRoles: sources.flatMap(s => s.stakeholderRoles || []),
      commonAnalysisTypes: sources.flatMap(s => s.commonAnalysisTypes || []),
      regulatoryContext: sources.flatMap(s => s.regulatoryContext || []),
      benchmarkSources: sources.flatMap(s => s.benchmarkSources || []),
      terminology: sources.flatMap(s => s.terminology || [])
    };
  }

  private async findExistingTemplate(
    industryDescription: string,
    businessContext: string,
    stakeholderRoles: string[]
  ): Promise<GeneratedTemplate | null> {
    // Search for existing templates that match the context
    const templates = await db
      .select()
      .from(artifactTemplates)
      .where(eq(artifactTemplates.isActive, true));

    // Use AI to find the best match
    const matchPrompt = `Find the best existing template for:
Industry: ${industryDescription}
Context: ${businessContext}
Roles: ${stakeholderRoles.join(', ')}

Templates:
${templates.map((t: any) => `${t.name}: ${t.description} (Industries: ${t.targetIndustries})`).join('\n')}

Return the best match with confidence score or null if no good match.`;

    try {
      const matchResult = await multiAIService.analyzeWithFallback(matchPrompt, {
        industryDescription,
        businessContext,
        stakeholderRoles,
        templates
      });

      const match = JSON.parse(matchResult.result);

      if (match && match.confidence > 0.7) {
        const template = templates.find((t: any) => t.id === match.templateId);
        if (template) {
          return this.convertToGeneratedTemplate(template);
        }
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  private convertToGeneratedTemplate(dbTemplate: any): GeneratedTemplate {
    return {
      id: dbTemplate.id,
      industryMatch: dbTemplate.targetIndustries[0],
      confidence: 0.8,
      template: {
        name: dbTemplate.name,
        description: dbTemplate.description,
        targetRoles: dbTemplate.targetRoles,
        targetIndustries: dbTemplate.targetIndustries,
        components: dbTemplate.components,
        narrativeStyle: dbTemplate.narrativeStyle,
        visualComplexity: dbTemplate.visualComplexity,
        interactivity: dbTemplate.interactivity,
        kpis: [],
        benchmarks: [],
        processes: []
      },
      sources: {
        researchSources: ['existing_template'],
        templateBasis: [dbTemplate.id],
        validationSources: []
      },
      metadata: {
        generatedAt: dbTemplate.createdAt,
        researchTime: 0,
        validationScore: 80,
        usageCount: 0,
        successRate: 0.8,
        lastUpdated: dbTemplate.updatedAt
      }
    };
  }
}

// Web fetch service for external research
class WebFetch {
  async searchAndAnalyze(query: string, analysisPrompt: string): Promise<{
    success: boolean;
    content?: any;
    error?: string;
  }> {
    // This would integrate with actual web search and fetch services
    // For now, return a mock successful result
    return {
      success: true,
      content: {
        searchQuery: query,
        analysisPrompt,
        mockData: `Research results for ${query}`
      }
    };
  }
}

export const dynamicTemplateEngine = DynamicTemplateEngine.getInstance();