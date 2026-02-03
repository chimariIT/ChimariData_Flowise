import { nanoid } from 'nanoid';
import { db } from './db';
import {
  artifactTemplates,
  generatedArtifacts,
  audienceProfiles,
  decisionAudits
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { multiAIService } from './multi-ai-service';
import type { AudienceProfile } from '@shared/schema';

interface AnalysisResults {
  id: string;
  projectId: string;
  insights: any[];
  visualizations: any[];
  statistics: any;
  recommendations: string[];
  rawData: any;
  metadata: {
    analysisType: string;
    complexity: string;
    executionTime: number;
    confidence: number;
  };
}

interface ArtifactComponent {
  type: 'kpi_card' | 'trend_chart' | 'comparison_table' | 'geographic_map' | 'funnel_analysis' | 'cohort_analysis' | 'executive_summary' | 'detailed_findings' | 'recommendations' | 'next_steps';
  title: string;
  content: any;
  visualConfig?: any;
  narrativeTemplate?: string;
  drillDownCapability?: {
    enabled: boolean;
    dimensions: string[];
    maxDepth: number;
  };
}

interface GeneratedArtifact {
  id: string;
  type: string;
  title: string;
  format: 'pdf_report' | 'interactive_dashboard' | 'presentation_slides' | 'data_export' | 'html_summary';
  components: ArtifactComponent[];
  metadata: {
    generatedFor: AudienceProfile;
    complexity: 'simple' | 'intermediate' | 'advanced';
    estimatedReadTime: number;
    keyFindings: string[];
    generationTime: number;
  };
  content: any;
}

interface ArtifactSet {
  primary: GeneratedArtifact;
  supporting: GeneratedArtifact[];
  metadata: {
    generatedFor: AudienceProfile;
    complexity: 'simple' | 'intermediate' | 'advanced';
    estimatedReadTime: number;
    keyFindings: string[];
  };
}

// Industry-specific templates and configurations
const INDUSTRY_TEMPLATES = {
  retail: {
    sales_performance: {
      kpis: ['revenue', 'conversion_rate', 'avg_order_value', 'customer_lifetime_value'],
      segments: ['product_category', 'sales_channel', 'geography', 'customer_segment'],
      timeframes: ['daily', 'weekly', 'monthly', 'seasonal'],
      benchmarks: 'industry_retail_benchmarks'
    },
    inventory_optimization: {
      kpis: ['turnover_rate', 'stock_out_frequency', 'carrying_cost', 'demand_forecast_accuracy'],
      segments: ['product', 'supplier', 'location', 'season'],
      predictiveModels: ['demand_forecasting', 'reorder_point_optimization']
    }
  },
  saas: {
    customer_health: {
      kpis: ['mrr', 'churn_rate', 'nps', 'product_adoption', 'support_tickets'],
      segments: ['plan_type', 'company_size', 'industry', 'cohort'],
      funnels: ['trial_to_paid', 'onboarding', 'feature_adoption']
    },
    growth_metrics: {
      kpis: ['cac', 'ltv', 'payback_period', 'expansion_revenue', 'viral_coefficient'],
      cohortAnalysis: true,
      attributionModeling: true
    }
  },
  finance: {
    risk_analysis: {
      kpis: ['var', 'sharpe_ratio', 'max_drawdown', 'beta'],
      segments: ['asset_class', 'geography', 'sector'],
      stressTests: ['market_crash', 'interest_rate_shock', 'credit_crisis']
    },
    portfolio_performance: {
      kpis: ['total_return', 'alpha', 'information_ratio', 'tracking_error'],
      benchmarks: ['index_comparison', 'peer_comparison'],
      attribution: ['sector', 'security_selection', 'market_timing']
    }
  }
};

export class AdaptiveContentEngine {
  private static instance: AdaptiveContentEngine;

  public static getInstance(): AdaptiveContentEngine {
    if (!AdaptiveContentEngine.instance) {
      AdaptiveContentEngine.instance = new AdaptiveContentEngine();
    }
    return AdaptiveContentEngine.instance;
  }

  /**
   * Generate audience-specific artifacts from analysis results
   */
  async generateArtifacts(
    analysisResults: AnalysisResults,
    audienceProfile: AudienceProfile,
    analysisContext: any = {}
  ): Promise<ArtifactSet> {
    const startTime = Date.now();

    try {
      // 1. Select appropriate template
      const template = await this.selectTemplate(audienceProfile, analysisResults);

      // 2. Extract and prioritize insights for this audience
      const prioritizedInsights = await this.prioritizeInsights(
        analysisResults,
        audienceProfile
      );

      // 3. Generate primary artifact
      const primaryArtifact = await this.generatePrimaryArtifact(
        analysisResults,
        prioritizedInsights,
        audienceProfile,
        template
      );

      // 4. Generate supporting artifacts
      const supportingArtifacts = await this.generateSupportingArtifacts(
        analysisResults,
        prioritizedInsights,
        audienceProfile,
        template
      );

      // 5. Record decision audit
      await this.recordArtifactDecision(
        analysisResults.projectId,
        audienceProfile,
        template,
        primaryArtifact
      );

      const generationTime = Date.now() - startTime;

      const artifactSet: ArtifactSet = {
        primary: primaryArtifact,
        supporting: supportingArtifacts,
        metadata: {
          generatedFor: audienceProfile,
          complexity: this.calculateComplexity(audienceProfile),
          estimatedReadTime: this.estimateReadTime([primaryArtifact, ...supportingArtifacts]),
          keyFindings: await this.extractKeyFindings(analysisResults, audienceProfile)
        }
      };

      // Store generated artifacts
      await this.storeArtifacts(analysisResults.projectId, artifactSet);

      return artifactSet;

    } catch (error) {
      console.error('Error generating adaptive content:', error);
      throw new Error(`Failed to generate artifacts for ${audienceProfile.role}: ${(error as Error).message || String(error)}`);
    }
  }

  /**
   * Select appropriate template based on audience and analysis
   */
  private async selectTemplate(
    audienceProfile: AudienceProfile,
    analysisResults: AnalysisResults
  ): Promise<any> {
    // Query database for matching templates
    const templates = await db
      .select()
      .from(artifactTemplates)
      .where(and(
        eq(artifactTemplates.isActive, true),
        // Check if role matches (using SQL JSON operations would be ideal here)
      ));

    // Filter templates based on role and industry
    const matchingTemplates = templates.filter((template: any) => {
      const targetRoles = template.targetRoles as string[];
      const targetIndustries = template.targetIndustries as string[];

      return targetRoles.includes(audienceProfile.role) &&
             targetIndustries.includes(audienceProfile.industry || '');
    });

    // Return best match or default template
    if (matchingTemplates.length > 0) {
      return matchingTemplates[0]; // Could add more sophisticated scoring here
    }

    // Return default template based on role
    return this.getDefaultTemplate(audienceProfile);
  }

  /**
   * Prioritize insights based on audience profile
   */
  private async prioritizeInsights(
    analysisResults: AnalysisResults,
    audienceProfile: AudienceProfile
  ): Promise<any[]> {
    const prompt = this.buildInsightPrioritizationPrompt(analysisResults, audienceProfile);

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, {
        insights: analysisResults.insights,
        audienceProfile
      });

      const prioritizedInsights = JSON.parse(aiResponse.result);
      return prioritizedInsights.insights || analysisResults.insights;
    } catch (error) {
      console.error('Error prioritizing insights:', error);
      return analysisResults.insights;
    }
  }

  /**
   * Generate primary artifact for the audience
   */
  private async generatePrimaryArtifact(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile,
    template: any
  ): Promise<GeneratedArtifact> {
    const artifactType = this.determineArtifactType(audienceProfile);
    const format = (audienceProfile as any).preferredFormats?.[0] || 'interactive_dashboard';

    // Generate role-specific content
    const content = await this.generateRoleSpecificContent(
      analysisResults,
      prioritizedInsights,
      audienceProfile,
      artifactType
    );

    const components = await this.generateComponents(
      prioritizedInsights,
      audienceProfile,
      template
    );

    return {
      id: this.generateArtifactId(),
      type: artifactType,
      title: await this.generateTitle(audienceProfile, analysisResults),
      format,
      components,
      content,
      metadata: {
        generatedFor: audienceProfile,
        complexity: this.calculateComplexity(audienceProfile),
        estimatedReadTime: this.estimateReadTime([{ components }] as any),
        keyFindings: await this.extractKeyFindings(analysisResults, audienceProfile),
        generationTime: 0 // Will be set by caller
      }
    };
  }

  /**
   * Generate supporting artifacts
   */
  private async generateSupportingArtifacts(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile,
    template: any
  ): Promise<GeneratedArtifact[]> {
    const supportingArtifacts: GeneratedArtifact[] = [];

    // Generate detailed analysis for senior roles
    if (['director', 'vp', 'c_suite'].includes(audienceProfile.seniority) &&
        audienceProfile.analyticalMaturity !== 'basic') {
      const detailedAnalysis = await this.generateDetailedAnalysis(
        analysisResults,
        prioritizedInsights,
        audienceProfile
      );
      supportingArtifacts.push(detailedAnalysis);
    }

    // Generate actionable insights for all roles
    const actionableInsights = await this.generateActionableInsights(
      analysisResults,
      prioritizedInsights,
      audienceProfile
    );
    supportingArtifacts.push(actionableInsights);

    // Generate data export for technical users
    if (audienceProfile.analyticalMaturity === 'advanced' ||
        audienceProfile.analyticalMaturity === 'expert') {
      const dataExport = await this.generateDataExport(
        analysisResults,
        audienceProfile
      );
      supportingArtifacts.push(dataExport);
    }

    return supportingArtifacts;
  }

  /**
   * Generate role-specific content sections
   */
  private async generateRoleSpecificContent(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile,
    artifactType: string
  ): Promise<any> {
    const prompt = this.buildContentGenerationPrompt(
      analysisResults,
      prioritizedInsights,
      audienceProfile,
      artifactType
    );

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, {
        analysisResults,
        prioritizedInsights,
        audienceProfile,
        artifactType
      });

      return JSON.parse(aiResponse.result);
    } catch (error) {
      console.error('Error generating role-specific content:', error);
      return this.generateFallbackContent(analysisResults, audienceProfile);
    }
  }

  /**
   * Generate components based on template and audience
   */
  private async generateComponents(
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile,
    template: any
  ): Promise<ArtifactComponent[]> {
    const components: ArtifactComponent[] = [];

    // Always include executive summary for senior roles
    if (['director', 'vp', 'c_suite'].includes(audienceProfile.seniority)) {
      components.push({
        type: 'executive_summary',
        title: 'Executive Summary',
        content: await this.generateExecutiveSummary(prioritizedInsights, audienceProfile)
      });
    }

    // Add role-specific KPI cards
    const kpis = this.getRoleSpecificKPIs(audienceProfile);
    if (kpis.length > 0) {
      components.push({
        type: 'kpi_card',
        title: 'Key Performance Indicators',
        content: this.generateKPICards(prioritizedInsights, kpis),
        drillDownCapability: {
          enabled: audienceProfile.analyticalMaturity !== 'basic',
          dimensions: ['time', 'geography', 'product'],
          maxDepth: audienceProfile.analyticalMaturity === 'expert' ? 3 : 2
        }
      });
    }

    // Add visualizations based on complexity preference
    const visualizationComplexity = (audienceProfile as any).communicationPreferences?.visualComplexity || 'simple';
    if (visualizationComplexity !== 'simple') {
      components.push({
        type: 'trend_chart',
        title: 'Performance Trends',
        content: this.generateTrendAnalysis(prioritizedInsights),
        visualConfig: {
          complexity: visualizationComplexity,
          interactivity: audienceProfile.analyticalMaturity !== 'basic'
        }
      });
    }

    // Add recommendations section
    components.push({
      type: 'recommendations',
      title: this.getRecommendationsTitle(audienceProfile),
      content: await this.generateRecommendations(prioritizedInsights, audienceProfile)
    });

    // Add next steps for decision makers
    if ((audienceProfile as any).decisionContext?.implementationRole === 'decision_maker') {
      components.push({
        type: 'next_steps',
        title: 'Recommended Next Steps',
        content: await this.generateNextSteps(prioritizedInsights, audienceProfile)
      });
    }

    return components;
  }

  /**
   * Generate executive summary tailored to audience
   */
  private async generateExecutiveSummary(
    insights: any[],
    audienceProfile: AudienceProfile
  ): Promise<any> {
    const prompt = `Generate an executive summary for a ${audienceProfile.role} in ${audienceProfile.industry}.

Key insights:
${insights.slice(0, 5).map(i => `- ${i.description || i.title}`).join('\n')}

Requirements:
- ${(audienceProfile as any).communicationPreferences?.detailLevel || 'standard'} detail level
- Focus on ${(audienceProfile as any).decisionContext?.timeHorizon || 'medium-term'} time horizon
- Maximum 3 paragraphs
- Include business impact and recommended actions

Return as JSON with sections: overview, keyFindings, businessImpact, recommendations`;

    try {
      const aiResponse = await multiAIService.analyzeWithFallback(prompt, { insights, audienceProfile });
      return JSON.parse(aiResponse.result);
    } catch (error) {
      console.error('Error generating executive summary:', error);
      return {
        overview: 'Analysis completed with key findings identified.',
        keyFindings: insights.slice(0, 3).map(i => i.description || i.title),
        businessImpact: 'Significant opportunities for improvement identified.',
        recommendations: ['Review detailed findings', 'Consider implementation options']
      };
    }
  }

  /**
   * Helper methods
   */
  private determineArtifactType(audienceProfile: AudienceProfile): string {
    switch (audienceProfile.role) {
      case 'sales_manager':
        return 'sales_performance_dashboard';
      case 'marketing_executive':
        return 'marketing_insights_report';
      case 'cfo':
        return 'financial_analysis_report';
      case 'operations_director':
        return 'operational_metrics_dashboard';
      case 'ceo':
        return 'executive_briefing';
      default:
        return 'comprehensive_analysis_report';
    }
  }

  private getRoleSpecificKPIs(audienceProfile: AudienceProfile): string[] {
    const industryTemplates = INDUSTRY_TEMPLATES[audienceProfile.industry as keyof typeof INDUSTRY_TEMPLATES];
    if (!industryTemplates) return [];

    switch (audienceProfile.role) {
      case 'sales_manager':
        return (industryTemplates as any).sales_performance?.kpis || [];
      case 'marketing_executive':
        return ['roi', 'cac', 'conversion_rate', 'brand_awareness'];
      case 'cfo':
        return ['revenue', 'profit_margin', 'cash_flow', 'roi'];
      case 'operations_director':
        return ['efficiency', 'cost_per_unit', 'quality_score', 'cycle_time'];
      default:
        return ['revenue', 'growth_rate', 'customer_satisfaction'];
    }
  }

  private calculateComplexity(audienceProfile: AudienceProfile): 'simple' | 'intermediate' | 'advanced' {
    if (audienceProfile.analyticalMaturity === 'expert' ||
        audienceProfile.role === 'data_analyst') {
      return 'advanced';
    }
    if (audienceProfile.analyticalMaturity === 'intermediate' ||
        ['director', 'vp'].includes(audienceProfile.seniority)) {
      return 'intermediate';
    }
    return 'simple';
  }

  private estimateReadTime(artifacts: any[]): number {
    // Estimate based on content length and complexity
    let totalWords = 0;
    artifacts.forEach(artifact => {
      if (artifact.components) {
        totalWords += artifact.components.length * 200; // Estimate words per component
      }
    });
    return Math.ceil(totalWords / 200); // Assume 200 words per minute reading speed
  }

  private async extractKeyFindings(
    analysisResults: AnalysisResults,
    audienceProfile: AudienceProfile
  ): Promise<string[]> {
    const insights = analysisResults.insights || [];
    return insights
      .slice(0, 5)
      .map(insight => insight.description || insight.title || insight.summary)
      .filter(Boolean);
  }

  private generateArtifactId(): string {
    return `artifact_${nanoid()}`;
  }

  private async generateTitle(
    audienceProfile: AudienceProfile,
    analysisResults: AnalysisResults
  ): Promise<string> {
    const roleTitle = this.getRoleTitle(audienceProfile.role);
    const analysisType = analysisResults.metadata.analysisType || 'Analysis';
    return `${roleTitle} ${analysisType} Report`;
  }

  private getRoleTitle(role: string): string {
    const titles = {
      sales_manager: 'Sales Performance',
      marketing_executive: 'Marketing Intelligence',
      cfo: 'Financial Analysis',
      operations_director: 'Operational Excellence',
      data_analyst: 'Data Analysis',
      ceo: 'Executive',
      general_manager: 'Business Intelligence'
    };
    return titles[role as keyof typeof titles] || 'Business Analysis';
  }

  // Placeholder methods - to be implemented based on specific requirements
  private getDefaultTemplate(audienceProfile: AudienceProfile): any {
    return {
      id: 'default',
      components: ['executive_summary', 'kpi_card', 'recommendations']
    };
  }

  private buildInsightPrioritizationPrompt(analysisResults: AnalysisResults, audienceProfile: AudienceProfile): string {
    return `Prioritize these insights for a ${audienceProfile.role} in ${audienceProfile.industry}:

    ${JSON.stringify(analysisResults.insights, null, 2)}

    Consider:
    - Role relevance
    - Decision-making authority
    - Time horizon: ${(audienceProfile as any).decisionContext?.timeHorizon || 'medium-term'}
    - Detail preference: ${(audienceProfile as any).communicationPreferences?.detailLevel || 'standard'}

    Return top 10 insights ordered by relevance as JSON: {"insights": [...]}`;
  }

  private buildContentGenerationPrompt(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile,
    artifactType: string
  ): string {
    return `Generate ${artifactType} content for ${audienceProfile.role} in ${audienceProfile.industry}:

Insights: ${JSON.stringify(prioritizedInsights.slice(0, 5))}

Style: ${(audienceProfile as any).communicationPreferences?.narrativeStyle || 'professional'}
Detail: ${(audienceProfile as any).communicationPreferences?.detailLevel || 'standard'}
Complexity: ${(audienceProfile as any).communicationPreferences?.visualComplexity || 'medium'}

Generate content with sections appropriate for this role and industry.
Return as structured JSON.`;
  }

  private generateFallbackContent(analysisResults: AnalysisResults, audienceProfile: AudienceProfile): any {
    return {
      summary: 'Analysis completed with key insights identified.',
      insights: analysisResults.insights.slice(0, 5),
      recommendations: ['Review findings in detail', 'Consider implementation options']
    };
  }

  private generateKPICards(insights: any[], kpis: string[]): any {
    return kpis.map(kpi => ({
      metric: kpi,
      value: this.extractKPIValue(insights, kpi),
      trend: 'positive', // Would be calculated from actual data
      comparison: 'vs_previous_period'
    }));
  }

  private extractKPIValue(insights: any[], kpi: string): string {
    // Extract KPI values from insights - simplified implementation
    const relatedInsight = insights.find(i =>
      i.title?.toLowerCase().includes(kpi.toLowerCase()) ||
      i.description?.toLowerCase().includes(kpi.toLowerCase())
    );
    return relatedInsight?.value || 'N/A';
  }

  private generateTrendAnalysis(insights: any[]): any {
    return {
      chartType: 'line',
      data: insights.filter(i => i.trend).map(i => ({
        period: i.period,
        value: i.value,
        metric: i.title
      }))
    };
  }

  private async generateRecommendations(insights: any[], audienceProfile: AudienceProfile): Promise<any> {
    // Generate role-specific recommendations based on insights
    return {
      immediate: ['Action item 1', 'Action item 2'],
      shortTerm: ['Short-term goal 1', 'Short-term goal 2'],
      longTerm: ['Strategic initiative 1', 'Strategic initiative 2']
    };
  }

  private async generateNextSteps(insights: any[], audienceProfile: AudienceProfile): Promise<any> {
    return [
      {
        action: 'Review detailed findings',
        priority: 'high',
        timeframe: '1 week',
        owner: 'team_lead'
      },
      {
        action: 'Develop implementation plan',
        priority: 'medium',
        timeframe: '2 weeks',
        owner: 'project_manager'
      }
    ];
  }

  private getRecommendationsTitle(audienceProfile: AudienceProfile): string {
    if (audienceProfile.seniority === 'c_suite') return 'Strategic Recommendations';
    if (audienceProfile.seniority === 'director') return 'Operational Recommendations';
    return 'Recommendations';
  }

  private async generateDetailedAnalysis(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile
  ): Promise<GeneratedArtifact> {
    // Placeholder for detailed analysis generation
    return {
      id: this.generateArtifactId(),
      type: 'detailed_analysis',
      title: 'Detailed Analysis Report',
      format: 'pdf_report',
      components: [],
      content: {},
      metadata: {
        generatedFor: audienceProfile,
        complexity: 'advanced',
        estimatedReadTime: 15,
        keyFindings: [],
        generationTime: 0
      }
    };
  }

  private async generateActionableInsights(
    analysisResults: AnalysisResults,
    prioritizedInsights: any[],
    audienceProfile: AudienceProfile
  ): Promise<GeneratedArtifact> {
    // Placeholder for actionable insights generation
    return {
      id: this.generateArtifactId(),
      type: 'actionable_insights',
      title: 'Actionable Insights',
      format: 'interactive_dashboard',
      components: [],
      content: {},
      metadata: {
        generatedFor: audienceProfile,
        complexity: 'intermediate',
        estimatedReadTime: 10,
        keyFindings: [],
        generationTime: 0
      }
    };
  }

  private async generateDataExport(
    analysisResults: AnalysisResults,
    audienceProfile: AudienceProfile
  ): Promise<GeneratedArtifact> {
    // Placeholder for data export generation
    return {
      id: this.generateArtifactId(),
      type: 'data_export',
      title: 'Data Export',
      format: 'data_export',
      components: [],
      content: analysisResults.rawData,
      metadata: {
        generatedFor: audienceProfile,
        complexity: 'advanced',
        estimatedReadTime: 0,
        keyFindings: [],
        generationTime: 0
      }
    };
  }

  private async recordArtifactDecision(
    projectId: string,
    audienceProfile: AudienceProfile,
    template: any,
    artifact: GeneratedArtifact
  ): Promise<void> {
    await db.insert(decisionAudits).values({
      id: `decision_${nanoid()}`,
      projectId,
      agent: 'data_scientist',
      decisionType: 'visualization_choice',
      decision: `Generated ${artifact.type} for ${audienceProfile.role}`,
      reasoning: `Selected based on role requirements and audience preferences`,
      alternatives: ['standard_report', 'basic_dashboard', 'detailed_analysis'],
      confidence: 85,
      context: { audienceProfile, template: template?.id },
      impact: 'medium',
      reversible: true,
      timestamp: new Date()
    });
  }

  private async storeArtifacts(projectId: string, artifactSet: ArtifactSet): Promise<void> {
    const artifacts = [artifactSet.primary, ...artifactSet.supporting];

    for (const artifact of artifacts) {
      await db.insert(generatedArtifacts).values({
        id: artifact.id,
        projectId,
        templateId: null, // Would link to template if available
        audienceProfileId: artifactSet.metadata.generatedFor.id,
        type: artifact.type,
        title: artifact.title,
        content: artifact.content,
        metadata: artifact.metadata,
        format: artifact.format,
        status: 'generated',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }
}

export const adaptiveContentEngine = AdaptiveContentEngine.getInstance();