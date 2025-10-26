import { BusinessTemplate, BusinessTemplateLibrary, TemplateWorkflowStep } from './business-templates';
import { multiAIService } from '../multi-ai-service';

export interface TemplateSynthesisRequest {
  templateId: string;
  userGoals: string[];
  dataSchema: Record<string, any>;
  audienceContext: {
    primaryAudience: string;
    secondaryAudiences?: string[];
    decisionContext?: string;
  };
  industry?: string;
}

export interface TemplateSynthesisResult {
  template: BusinessTemplate;
  mappedAnalyses: MappedAnalysis[];
  autoConfiguration: AutoConfiguration;
  kpiRecommendations: KPIMapping[];
  confidence: number;
  warnings: string[];
  recommendations: string[];
}

export interface MappedAnalysis {
  analysisType: string;
  priority: 'high' | 'medium' | 'low';
  configuration: Record<string, any>;
  expectedInsights: string[];
  dataRequirements: string[];
  estimatedDuration: string;
}

export interface AutoConfiguration {
  dataTransformations: DataTransformation[];
  analysisPipeline: AnalysisStep[];
  visualizationSettings: VisualizationConfig[];
  reportFormatting: ReportConfig;
}

export interface DataTransformation {
  type: 'filter' | 'aggregate' | 'join' | 'calculate' | 'clean';
  description: string;
  configuration: Record<string, any>;
  priority: number;
}

export interface AnalysisStep {
  stepId: string;
  analysisType: string;
  dependencies: string[];
  configuration: Record<string, any>;
  expectedOutput: string;
}

export interface VisualizationConfig {
  type: string;
  title: string;
  audience: string;
  configuration: Record<string, any>;
}

export interface ReportConfig {
  format: 'executive' | 'technical' | 'operational' | 'mixed';
  sections: string[];
  audienceSpecific: boolean;
}

export interface KPIMapping {
  kpiName: string;
  description: string;
  calculation: string;
  targetAudience: string;
  importance: 'critical' | 'important' | 'nice-to-have';
}

export class BusinessTemplateSynthesisService {
  private static instance: BusinessTemplateSynthesisService;
  private templateLibrary: BusinessTemplateLibrary;

  public static getInstance(): BusinessTemplateSynthesisService {
    if (!BusinessTemplateSynthesisService.instance) {
      BusinessTemplateSynthesisService.instance = new BusinessTemplateSynthesisService();
    }
    return BusinessTemplateSynthesisService.instance;
  }

  constructor() {
    this.templateLibrary = new BusinessTemplateLibrary();
  }

  /**
   * Synthesize template with user goals and data to create analysis plan
   */
  async synthesizeTemplate(request: TemplateSynthesisRequest): Promise<TemplateSynthesisResult> {
    try {
      console.log(`Synthesizing template ${request.templateId} for ${request.audienceContext.primaryAudience} audience`);

      // Get the template
      const template = this.templateLibrary.getTemplate(request.templateId);
      if (!template) {
        throw new Error(`Template ${request.templateId} not found`);
      }

      // Map user goals to analyses
      const mappedAnalyses = await this.mapGoalsToAnalyses(
        request.userGoals,
        template,
        request.dataSchema,
        request.audienceContext
      );

      // Generate auto-configuration
      const autoConfiguration = await this.generateAutoConfiguration(
        template,
        mappedAnalyses,
        request.dataSchema,
        request.audienceContext
      );

      // Generate KPI recommendations
      const kpiRecommendations = await this.generateKPIRecommendations(
        template,
        request.userGoals,
        request.audienceContext
      );

      // Calculate confidence and generate warnings
      const { confidence, warnings } = this.calculateConfidenceAndWarnings(
        template,
        request.dataSchema,
        mappedAnalyses
      );

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        template,
        mappedAnalyses,
        request.audienceContext
      );

      return {
        template,
        mappedAnalyses,
        autoConfiguration,
        kpiRecommendations,
        confidence,
        warnings,
        recommendations
      };

    } catch (error) {
      console.error('Template synthesis failed:', error);
      throw error;
    }
  }

  /**
   * Map user goals to specific analyses based on template
   */
  private async mapGoalsToAnalyses(
    userGoals: string[],
    template: BusinessTemplate,
    dataSchema: Record<string, any>,
    audienceContext: any
  ): Promise<MappedAnalysis[]> {
    const prompt = `Map user goals to specific analyses for the ${template.name} template:

Template: ${template.name}
Domain: ${template.domain}
Template Goals: ${template.goals.join(', ')}

User Goals: ${userGoals.join(', ')}
Audience: ${audienceContext.primaryAudience}
Available Data Fields: ${Object.keys(dataSchema).join(', ')}

For each user goal, suggest:
1. Analysis type (descriptive, correlation, regression, clustering, etc.)
2. Priority level (high/medium/low)
3. Configuration parameters
4. Expected insights
5. Data requirements
6. Estimated duration

Format as JSON array of analysis objects.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, { template, userGoals, dataSchema });
      
      // Parse AI response and create mapped analyses
      const analyses = this.parseAnalysisMapping(result.result, template, dataSchema);
      
      return analyses;
    } catch (error) {
      console.error('Failed to map goals to analyses:', error);
      return this.generateFallbackAnalyses(template, userGoals);
    }
  }

  /**
   * Generate auto-configuration for the analysis pipeline
   */
  private async generateAutoConfiguration(
    template: BusinessTemplate,
    mappedAnalyses: MappedAnalysis[],
    dataSchema: Record<string, any>,
    audienceContext: any
  ): Promise<AutoConfiguration> {
    const prompt = `Generate auto-configuration for ${template.name} template:

Template Workflow: ${JSON.stringify(template.workflow)}
Mapped Analyses: ${JSON.stringify(mappedAnalyses)}
Data Schema: ${JSON.stringify(dataSchema)}
Audience: ${audienceContext.primaryAudience}

Generate:
1. Data transformations needed
2. Analysis pipeline steps
3. Visualization settings
4. Report formatting configuration

Format as JSON configuration object.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, { template, mappedAnalyses, dataSchema });
      
      return this.parseAutoConfiguration(result.result, template);
    } catch (error) {
      console.error('Failed to generate auto-configuration:', error);
      return this.generateFallbackConfiguration(template, mappedAnalyses);
    }
  }

  /**
   * Generate KPI recommendations based on template and goals
   */
  private async generateKPIRecommendations(
    template: BusinessTemplate,
    userGoals: string[],
    audienceContext: any
  ): Promise<KPIMapping[]> {
    const prompt = `Generate KPI recommendations for ${template.name} template:

Template Domain: ${template.domain}
Template Goals: ${template.goals.join(', ')}
User Goals: ${userGoals.join(', ')}
Audience: ${audienceContext.primaryAudience}

For each KPI, provide:
1. KPI name and description
2. Calculation method
3. Target audience
4. Importance level

Focus on KPIs relevant to the template domain and user goals.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, { template, userGoals });
      
      return this.parseKPIRecommendations(result.result, template);
    } catch (error) {
      console.error('Failed to generate KPI recommendations:', error);
      return this.generateFallbackKPIs(template);
    }
  }

  /**
   * Calculate confidence and generate warnings
   */
  private calculateConfidenceAndWarnings(
    template: BusinessTemplate,
    dataSchema: Record<string, any>,
    mappedAnalyses: MappedAnalysis[]
  ): { confidence: number; warnings: string[] } {
    let confidence = 0.8; // Base confidence
    const warnings: string[] = [];

    // Check data schema alignment
    const requiredFields = template.requiredDataFields.map(f => f.fieldName);
    const availableFields = Object.keys(dataSchema);
    const missingFields = requiredFields.filter(f => !availableFields.includes(f));

    if (missingFields.length > 0) {
      confidence -= 0.2;
      warnings.push(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Check analysis complexity vs template complexity
    const highComplexityAnalyses = mappedAnalyses.filter(a => 
      ['machine_learning', 'regression', 'clustering'].includes(a.analysisType)
    ).length;

    if (template.complexity === 'beginner' && highComplexityAnalyses > 2) {
      confidence -= 0.1;
      warnings.push('Analysis complexity may be too high for beginner template');
    }

    // Check data size adequacy
    const dataSize = Object.keys(dataSchema).length;
    if (dataSize < 3) {
      confidence -= 0.3;
      warnings.push('Limited data fields may restrict analysis depth');
    }

    return {
      confidence: Math.max(0.3, Math.min(0.95, confidence)),
      warnings
    };
  }

  /**
   * Generate recommendations for template implementation
   */
  private async generateRecommendations(
    template: BusinessTemplate,
    mappedAnalyses: MappedAnalysis[],
    audienceContext: any
  ): Promise<string[]> {
    const recommendations: string[] = [];

    // Template-specific recommendations
    recommendations.push(`Follow the ${template.name} workflow for optimal results`);
    
    // Analysis-specific recommendations
    const highPriorityAnalyses = mappedAnalyses.filter(a => a.priority === 'high');
    if (highPriorityAnalyses.length > 0) {
      recommendations.push(`Focus on high-priority analyses: ${highPriorityAnalyses.map(a => a.analysisType).join(', ')}`);
    }

    // Audience-specific recommendations
    switch (audienceContext.primaryAudience) {
      case 'executive':
        recommendations.push('Emphasize strategic insights and ROI metrics');
        recommendations.push('Prepare executive summary with key findings');
        break;
      case 'technical':
        recommendations.push('Include detailed methodology and technical validation');
        recommendations.push('Provide code examples and implementation details');
        break;
      case 'business_ops':
        recommendations.push('Focus on operational improvements and process optimization');
        recommendations.push('Include actionable next steps and implementation timeline');
        break;
    }

    return recommendations;
  }

  /**
   * Parse AI response for analysis mapping
   */
  private parseAnalysisMapping(aiResponse: string, template: BusinessTemplate, dataSchema: Record<string, any>): MappedAnalysis[] {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(aiResponse);
      if (Array.isArray(parsed)) {
        return parsed.map((analysis: any) => ({
          analysisType: analysis.analysisType || 'descriptive',
          priority: analysis.priority || 'medium',
          configuration: analysis.configuration || {},
          expectedInsights: analysis.expectedInsights || [],
          dataRequirements: analysis.dataRequirements || [],
          estimatedDuration: analysis.estimatedDuration || '30 minutes'
        }));
      }
    } catch (error) {
      console.warn('Failed to parse AI response as JSON, using fallback');
    }

    return this.generateFallbackAnalyses(template, []);
  }

  /**
   * Parse AI response for auto-configuration
   */
  private parseAutoConfiguration(aiResponse: string, template: BusinessTemplate): AutoConfiguration {
    try {
      const parsed = JSON.parse(aiResponse);
      return {
        dataTransformations: parsed.dataTransformations || [],
        analysisPipeline: parsed.analysisPipeline || [],
        visualizationSettings: parsed.visualizationSettings || [],
        reportFormatting: parsed.reportFormatting || { format: 'mixed', sections: [], audienceSpecific: true }
      };
    } catch (error) {
      console.warn('Failed to parse auto-configuration, using fallback');
      return this.generateFallbackConfiguration(template, []);
    }
  }

  /**
   * Parse AI response for KPI recommendations
   */
  private parseKPIRecommendations(aiResponse: string, template: BusinessTemplate): KPIMapping[] {
    try {
      const parsed = JSON.parse(aiResponse);
      if (Array.isArray(parsed)) {
        return parsed.map((kpi: any) => ({
          kpiName: kpi.kpiName || 'Unknown KPI',
          description: kpi.description || '',
          calculation: kpi.calculation || '',
          targetAudience: kpi.targetAudience || 'general',
          importance: kpi.importance || 'important'
        }));
      }
    } catch (error) {
      console.warn('Failed to parse KPI recommendations, using fallback');
    }

    return this.generateFallbackKPIs(template);
  }

  /**
   * Generate fallback analyses when AI fails
   */
  private generateFallbackAnalyses(template: BusinessTemplate, userGoals: string[]): MappedAnalysis[] {
    const analyses: MappedAnalysis[] = [];

    // Always include descriptive analysis
    analyses.push({
      analysisType: 'descriptive',
      priority: 'high',
      configuration: { fields: 'all' },
      expectedInsights: ['Data overview and basic statistics'],
      dataRequirements: ['All numeric fields'],
      estimatedDuration: '15 minutes'
    });

    // Add correlation analysis for templates with multiple numeric fields
    if (template.domain === 'retail' || template.domain === 'finance') {
      analyses.push({
        analysisType: 'correlation',
        priority: 'medium',
        configuration: { method: 'pearson' },
        expectedInsights: ['Relationships between key variables'],
        dataRequirements: ['Numeric fields'],
        estimatedDuration: '20 minutes'
      });
    }

    // Add clustering for customer/segmentation templates
    if (template.goals.includes('customer_retention') || template.name.includes('Segmentation')) {
      analyses.push({
        analysisType: 'clustering',
        priority: 'high',
        configuration: { algorithm: 'kmeans', clusters: 3 },
        expectedInsights: ['Customer segments and patterns'],
        dataRequirements: ['Customer behavior data'],
        estimatedDuration: '45 minutes'
      });
    }

    return analyses;
  }

  /**
   * Generate fallback configuration when AI fails
   */
  private generateFallbackConfiguration(template: BusinessTemplate, mappedAnalyses: MappedAnalysis[]): AutoConfiguration {
    return {
      dataTransformations: [
        {
          type: 'clean',
          description: 'Clean and validate data',
          configuration: { removeDuplicates: true, handleMissing: 'mean' },
          priority: 1
        }
      ],
      analysisPipeline: mappedAnalyses.map((analysis, index) => ({
        stepId: `step_${index + 1}`,
        analysisType: analysis.analysisType,
        dependencies: index > 0 ? [`step_${index}`] : [],
        configuration: analysis.configuration,
        expectedOutput: analysis.expectedInsights[0] || 'Analysis results'
      })),
      visualizationSettings: template.visualizations.map(viz => ({
        type: viz.type,
        title: viz.title,
        audience: 'general',
        configuration: { xAxis: viz.xAxis, yAxis: viz.yAxis }
      })),
      reportFormatting: {
        format: 'mixed',
        sections: ['Executive Summary', 'Key Findings', 'Recommendations'],
        audienceSpecific: true
      }
    };
  }

  /**
   * Get available templates for synthesis
   */
  getAvailableTemplates(filters?: {
    domain?: string;
    complexity?: string;
    goals?: string[];
  }): BusinessTemplate[] {
    const templates = this.templateLibrary.getAllTemplates();
    
    if (!filters) {
      return templates;
    }

    return templates.filter(template => {
      if (filters.domain && template.domain !== filters.domain) {
        return false;
      }
      
      if (filters.complexity && template.complexity !== filters.complexity) {
        return false;
      }
      
      if (filters.goals && filters.goals.length > 0) {
        const hasMatchingGoal = filters.goals.some(goal => 
          template.goals.includes(goal as any)
        );
        if (!hasMatchingGoal) {
          return false;
        }
      }
      
      return true;
    });
  }

  /**
   * Validate template synthesis configuration
   */
  async validateSynthesis(request: {
    templateId: string;
    dataSchema: Record<string, any>;
    userGoals: string[];
  }): Promise<{
    valid: boolean;
    confidence: number;
    warnings: string[];
    recommendations: string[];
  }> {
    try {
      const template = this.templateLibrary.getTemplate(request.templateId);
      if (!template) {
        return {
          valid: false,
          confidence: 0,
          warnings: [`Template ${request.templateId} not found`],
          recommendations: ['Please select a valid template']
        };
      }

      const { confidence, warnings } = this.calculateConfidenceAndWarnings(
        template,
        request.dataSchema,
        []
      );

      const recommendations = await this.generateRecommendations(
        template,
        [],
        { primaryAudience: 'mixed' }
      );

      return {
        valid: confidence > 0.5,
        confidence,
        warnings,
        recommendations
      };

    } catch (error) {
      console.error('Template validation failed:', error);
      return {
        valid: false,
        confidence: 0,
        warnings: ['Validation failed due to system error'],
        recommendations: ['Please try again or contact support']
      };
    }
  }

  /**
   * Generate template synthesis preview
   */
  async generatePreview(request: {
    templateId: string;
    userGoals: string[];
    audienceContext: any;
  }): Promise<{
    template: BusinessTemplate;
    expectedAnalyses: string[];
    estimatedDuration: string;
    keyInsights: string[];
    deliverables: string[];
  }> {
    try {
      const template = this.templateLibrary.getTemplate(request.templateId);
      if (!template) {
        throw new Error(`Template ${request.templateId} not found`);
      }

      // Generate preview based on template and user goals
      const expectedAnalyses = template.workflow.map(step => step.name);
      const estimatedDuration = this.calculateEstimatedDuration(template);
      const keyInsights = await this.generatePreviewInsights(template, request.userGoals);
      const deliverables = template.deliverables.map(d => d.name);

      return {
        template,
        expectedAnalyses,
        estimatedDuration,
        keyInsights,
        deliverables
      };

    } catch (error) {
      console.error('Template preview generation failed:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated duration for template
   */
  private calculateEstimatedDuration(template: BusinessTemplate): string {
    const baseMinutes = template.workflow.length * 15; // 15 minutes per step
    
    let multiplier = 1;
    switch (template.complexity) {
      case 'beginner':
        multiplier = 0.8;
        break;
      case 'intermediate':
        multiplier = 1.0;
        break;
      case 'advanced':
        multiplier = 1.5;
        break;
    }

    const totalMinutes = Math.round(baseMinutes * multiplier);
    
    if (totalMinutes < 60) {
      return `${totalMinutes} minutes`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hours`;
    }
  }

  /**
   * Generate preview insights for template
   */
  private async generatePreviewInsights(template: BusinessTemplate, userGoals: string[]): Promise<string[]> {
    const insights: string[] = [];

    // Template-specific insights
    switch (template.domain) {
      case 'retail':
        insights.push('Customer behavior patterns and segmentation');
        insights.push('Revenue optimization opportunities');
        insights.push('Product performance analysis');
        break;
      case 'finance':
        insights.push('Risk assessment and mitigation strategies');
        insights.push('ROI analysis and investment opportunities');
        insights.push('Financial performance trends');
        break;
      case 'hr':
        insights.push('Employee engagement and satisfaction metrics');
        insights.push('Talent retention and development insights');
        insights.push('Workforce optimization opportunities');
        break;
      case 'marketing':
        insights.push('Campaign effectiveness and ROI analysis');
        insights.push('Customer acquisition and retention insights');
        insights.push('Marketing channel performance');
        break;
      default:
        insights.push('Key performance indicators and trends');
        insights.push('Operational efficiency opportunities');
        insights.push('Strategic recommendations');
    }

    // Add goal-specific insights
    if (userGoals.some(goal => goal.toLowerCase().includes('revenue'))) {
      insights.push('Revenue growth strategies and opportunities');
    }
    
    if (userGoals.some(goal => goal.toLowerCase().includes('cost'))) {
      insights.push('Cost reduction and efficiency improvements');
    }

    return insights.slice(0, 5); // Limit to 5 insights
  }

  /**
   * Generate fallback KPIs when AI fails
   */
  private generateFallbackKPIs(template: BusinessTemplate): KPIMapping[] {
    const kpis: KPIMapping[] = [];

    switch (template.domain) {
      case 'retail':
        kpis.push(
          { kpiName: 'Revenue Growth', description: 'Period-over-period revenue increase', calculation: '(Current - Previous) / Previous * 100', targetAudience: 'executive', importance: 'critical' },
          { kpiName: 'Customer Retention Rate', description: 'Percentage of customers retained', calculation: 'Retained Customers / Total Customers * 100', targetAudience: 'business_ops', importance: 'critical' }
        );
        break;
      case 'finance':
        kpis.push(
          { kpiName: 'ROI', description: 'Return on investment', calculation: '(Gain - Cost) / Cost * 100', targetAudience: 'executive', importance: 'critical' },
          { kpiName: 'Risk Score', description: 'Overall risk assessment', calculation: 'Weighted risk factors', targetAudience: 'technical', importance: 'critical' }
        );
        break;
      case 'hr':
        kpis.push(
          { kpiName: 'Employee Engagement Score', description: 'Overall engagement level', calculation: 'Average engagement metrics', targetAudience: 'business_ops', importance: 'critical' },
          { kpiName: 'Turnover Rate', description: 'Employee turnover percentage', calculation: 'Departures / Average Headcount * 100', targetAudience: 'executive', importance: 'important' }
        );
        break;
      default:
        kpis.push(
          { kpiName: 'Performance Score', description: 'Overall performance metric', calculation: 'Weighted performance indicators', targetAudience: 'general', importance: 'important' }
        );
    }

    return kpis;
  }
}

export const businessTemplateSynthesisService = BusinessTemplateSynthesisService.getInstance();
