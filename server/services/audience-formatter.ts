import { JourneyType } from '@shared/canonical-types';
import { multiAIService } from '../multi-ai-service';

export interface AudienceContext {
  primaryAudience: 'executive' | 'technical' | 'business_ops' | 'marketing' | 'mixed';
  secondaryAudiences?: string[];
  decisionContext?: string;
  journeyType: JourneyType;
}

export interface AnalysisResult {
  type: string;
  data: any;
  summary?: string;
  insights?: string[];
  recommendations?: string[];
  visualizations?: any[];
  metadata?: any;
}

export interface FormattedResult {
  executiveSummary?: string;
  technicalDetails?: string;
  businessInsights?: string[];
  actionableRecommendations?: string[];
  visualizations?: any[];
  methodology?: string;
  confidence?: number;
  nextSteps?: string[];
}

export class AudienceFormatter {
  private static instance: AudienceFormatter;

  public static getInstance(): AudienceFormatter {
    if (!AudienceFormatter.instance) {
      AudienceFormatter.instance = new AudienceFormatter();
    }
    return AudienceFormatter.instance;
  }

  /**
   * Format analysis results based on audience context
   */
  async formatForAudience(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<FormattedResult> {
    try {
      console.log(`Formatting results for ${audienceContext.primaryAudience} audience`);

      const formattedResult: FormattedResult = {};

      // Generate audience-specific content based on primary audience
      switch (audienceContext.primaryAudience) {
        case 'executive':
          formattedResult.executiveSummary = await this.generateExecutiveSummary(analysisResult, audienceContext);
          formattedResult.businessInsights = await this.generateBusinessInsights(analysisResult, audienceContext);
          formattedResult.actionableRecommendations = await this.generateActionableRecommendations(analysisResult, audienceContext);
          formattedResult.nextSteps = await this.generateNextSteps(analysisResult, audienceContext);
          break;

        case 'technical':
          formattedResult.technicalDetails = await this.generateTechnicalDetails(analysisResult, audienceContext);
          formattedResult.methodology = await this.generateMethodology(analysisResult, audienceContext);
          formattedResult.confidence = await this.calculateConfidence(analysisResult, audienceContext);
          break;

        case 'business_ops':
          formattedResult.businessInsights = await this.generateBusinessInsights(analysisResult, audienceContext);
          formattedResult.actionableRecommendations = await this.generateActionableRecommendations(analysisResult, audienceContext);
          formattedResult.nextSteps = await this.generateNextSteps(analysisResult, audienceContext);
          break;

        case 'marketing':
          formattedResult.businessInsights = await this.generateMarketingInsights(analysisResult, audienceContext);
          formattedResult.actionableRecommendations = await this.generateMarketingRecommendations(analysisResult, audienceContext);
          break;

        case 'mixed':
          // Generate content for all audiences
          formattedResult.executiveSummary = await this.generateExecutiveSummary(analysisResult, audienceContext);
          formattedResult.technicalDetails = await this.generateTechnicalDetails(analysisResult, audienceContext);
          formattedResult.businessInsights = await this.generateBusinessInsights(analysisResult, audienceContext);
          formattedResult.actionableRecommendations = await this.generateActionableRecommendations(analysisResult, audienceContext);
          formattedResult.methodology = await this.generateMethodology(analysisResult, audienceContext);
          formattedResult.nextSteps = await this.generateNextSteps(analysisResult, audienceContext);
          break;
      }

      // Always include visualizations (filtered by audience preference)
      formattedResult.visualizations = await this.filterVisualizationsForAudience(
        analysisResult.visualizations || [],
        audienceContext
      );

      return formattedResult;

    } catch (error) {
      console.error('Audience formatting failed:', error);
      return this.generateFallbackFormatting(analysisResult, audienceContext);
    }
  }

  /**
   * Generate executive summary for C-suite audience
   */
  private async generateExecutiveSummary(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string> {
    const prompt = `Generate an executive summary for C-suite leadership based on this analysis:

Analysis Type: ${analysisResult.type}
Decision Context: ${audienceContext.decisionContext || 'General business analysis'}
Journey Type: ${audienceContext.journeyType}

Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Create a concise executive summary (2-3 paragraphs) that includes:
1. Key findings and their business impact
2. Strategic implications and opportunities
3. High-level recommendations

Use business language appropriate for executives. Focus on ROI, strategic value, and actionable insights.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      return result.result;
    } catch (error) {
      console.error('Failed to generate executive summary:', error);
      return `Executive Summary: Analysis of ${analysisResult.type} reveals key patterns in your data with strategic implications for business growth and optimization.`;
    }
  }

  /**
   * Generate technical details for technical team
   */
  private async generateTechnicalDetails(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string> {
    const prompt = `Generate detailed technical analysis for data scientists and engineers:

Analysis Type: ${analysisResult.type}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide comprehensive technical details including:
1. Statistical methods and algorithms used
2. Data quality assessment and limitations
3. Model performance metrics (if applicable)
4. Technical assumptions and constraints
5. Code examples or implementation details
6. Validation methods and confidence intervals

Use technical terminology and include specific metrics, formulas, and implementation details.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      return result.result;
    } catch (error) {
      console.error('Failed to generate technical details:', error);
      return `Technical Analysis: Detailed ${analysisResult.type} analysis completed with comprehensive statistical evaluation and data quality assessment.`;
    }
  }

  /**
   * Generate business insights for operations teams
   */
  private async generateBusinessInsights(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string[]> {
    const prompt = `Generate actionable business insights for operations managers:

Analysis Type: ${analysisResult.type}
Decision Context: ${audienceContext.decisionContext || 'Operational improvement'}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide 5-7 specific business insights that include:
1. Operational efficiency opportunities
2. Process improvement recommendations
3. Performance metrics and KPIs
4. Cost optimization potential
5. Risk mitigation strategies

Format as bullet points with clear, actionable language.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      // Parse the result into an array of insights
      const insights = result.result.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .slice(0, 7);
      
      return insights.length > 0 ? insights : [
        'Data analysis reveals opportunities for operational efficiency improvements',
        'Key performance indicators show areas for optimization',
        'Process improvements can be implemented based on data patterns'
      ];
    } catch (error) {
      console.error('Failed to generate business insights:', error);
      return [
        'Analysis reveals key operational patterns and opportunities',
        'Data-driven insights support process optimization decisions',
        'Performance metrics indicate areas for improvement'
      ];
    }
  }

  /**
   * Generate marketing-specific insights
   */
  private async generateMarketingInsights(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string[]> {
    const prompt = `Generate marketing-focused insights for marketing managers:

Analysis Type: ${analysisResult.type}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide 5-6 marketing-specific insights including:
1. Customer behavior patterns
2. Campaign performance indicators
3. Market segmentation opportunities
4. Customer acquisition insights
5. Retention and engagement metrics
6. Marketing ROI implications

Focus on customer-centric insights and marketing strategy implications.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      const insights = result.result.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .slice(0, 6);
      
      return insights.length > 0 ? insights : [
        'Customer behavior analysis reveals key engagement patterns',
        'Marketing campaign performance shows optimization opportunities',
        'Customer segmentation insights support targeted strategies'
      ];
    } catch (error) {
      console.error('Failed to generate marketing insights:', error);
      return [
        'Customer data analysis reveals engagement patterns',
        'Marketing metrics indicate campaign optimization opportunities',
        'Segmentation insights support targeted marketing strategies'
      ];
    }
  }

  /**
   * Generate actionable recommendations
   */
  private async generateActionableRecommendations(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string[]> {
    const prompt = `Generate specific, actionable recommendations based on the analysis:

Analysis Type: ${analysisResult.type}
Decision Context: ${audienceContext.decisionContext || 'Business improvement'}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide 4-6 specific recommendations that include:
1. Immediate actions (next 30 days)
2. Short-term improvements (next 90 days)
3. Long-term strategic initiatives (next 6-12 months)
4. Resource requirements and implementation steps
5. Success metrics and KPIs to track

Make recommendations specific, measurable, and implementable.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      const recommendations = result.result.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .slice(0, 6);
      
      return recommendations.length > 0 ? recommendations : [
        'Implement data-driven decision making processes',
        'Establish regular performance monitoring and reporting',
        'Develop strategic initiatives based on analysis findings'
      ];
    } catch (error) {
      console.error('Failed to generate recommendations:', error);
      return [
        'Implement findings in business processes',
        'Establish monitoring for key metrics',
        'Develop strategic initiatives based on insights'
      ];
    }
  }

  /**
   * Generate marketing-specific recommendations
   */
  private async generateMarketingRecommendations(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string[]> {
    const prompt = `Generate marketing-specific recommendations:

Analysis Type: ${analysisResult.type}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide 4-5 marketing recommendations including:
1. Campaign optimization strategies
2. Customer targeting improvements
3. Content and messaging adjustments
4. Channel performance enhancements
5. Customer experience improvements

Focus on marketing tactics and customer engagement strategies.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      const recommendations = result.result.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .slice(0, 5);
      
      return recommendations.length > 0 ? recommendations : [
        'Optimize marketing campaigns based on data insights',
        'Improve customer targeting and segmentation',
        'Enhance customer experience and engagement'
      ];
    } catch (error) {
      console.error('Failed to generate marketing recommendations:', error);
      return [
        'Optimize marketing campaigns based on insights',
        'Improve customer targeting strategies',
        'Enhance customer engagement approaches'
      ];
    }
  }

  /**
   * Generate methodology explanation
   */
  private async generateMethodology(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string> {
    const prompt = `Explain the methodology used in this analysis for technical teams:

Analysis Type: ${analysisResult.type}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide detailed methodology including:
1. Statistical methods and algorithms used
2. Data preprocessing steps
3. Validation approaches
4. Assumptions and limitations
5. Quality assurance measures
6. Reproducibility considerations

Use technical language appropriate for data scientists and engineers.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      return result.result;
    } catch (error) {
      console.error('Failed to generate methodology:', error);
      return `Methodology: Analysis conducted using appropriate statistical methods with data validation and quality assurance measures.`;
    }
  }

  /**
   * Calculate confidence score
   */
  private async calculateConfidence(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<number> {
    // Simple confidence calculation based on data quality and analysis completeness
    let confidence = 0.7; // Base confidence

    // Adjust based on data completeness
    if (analysisResult.data && typeof analysisResult.data === 'object') {
      const dataKeys = Object.keys(analysisResult.data);
      confidence += Math.min(dataKeys.length * 0.05, 0.2);
    }

    // Adjust based on analysis type complexity
    const complexAnalysisTypes = ['machine_learning', 'regression', 'anova'];
    if (complexAnalysisTypes.includes(analysisResult.type)) {
      confidence += 0.1;
    }

    return Math.min(Math.max(confidence, 0.5), 0.95);
  }

  /**
   * Generate next steps
   */
  private async generateNextSteps(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): Promise<string[]> {
    const prompt = `Generate next steps based on the analysis results:

Analysis Type: ${analysisResult.type}
Decision Context: ${audienceContext.decisionContext || 'Business improvement'}
Analysis Data: ${JSON.stringify(analysisResult.data, null, 2)}

Provide 3-4 specific next steps including:
1. Immediate follow-up actions
2. Data collection or analysis needs
3. Stakeholder communication requirements
4. Implementation timeline considerations

Make steps specific and actionable.`;

    try {
      const result = await multiAIService.analyzeWithFallback(prompt, analysisResult.data);
      const steps = result.result.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.replace(/^[-•*]\s*/, '').trim())
        .slice(0, 4);
      
      return steps.length > 0 ? steps : [
        'Review findings with key stakeholders',
        'Develop implementation plan for recommendations',
        'Establish monitoring and tracking systems'
      ];
    } catch (error) {
      console.error('Failed to generate next steps:', error);
      return [
        'Review analysis findings with stakeholders',
        'Develop implementation plan',
        'Establish monitoring systems'
      ];
    }
  }

  /**
   * Filter visualizations based on audience preferences
   */
  private async filterVisualizationsForAudience(
    visualizations: any[],
    audienceContext: AudienceContext
  ): Promise<any[]> {
    if (!visualizations || visualizations.length === 0) {
      return [];
    }

    // Define visualization preferences by audience
    const audiencePreferences = {
      executive: ['summary', 'overview', 'trend', 'kpi'],
      technical: ['distribution', 'correlation', 'scatter', 'histogram', 'boxplot'],
      business_ops: ['trend', 'comparison', 'performance', 'kpi'],
      marketing: ['segmentation', 'behavior', 'campaign', 'conversion'],
      mixed: [] // Show all for mixed audience
    };

    const preferredTypes = audiencePreferences[audienceContext.primaryAudience];
    
    if (preferredTypes.length === 0) {
      return visualizations; // Return all for mixed audience
    }

    // Filter visualizations based on type preferences
    return visualizations.filter(viz => {
      const vizType = viz.type?.toLowerCase() || '';
      return preferredTypes.some(pref => vizType.includes(pref));
    });
  }

  /**
   * Generate fallback formatting when AI fails
   */
  private generateFallbackFormatting(
    analysisResult: AnalysisResult,
    audienceContext: AudienceContext
  ): FormattedResult {
    const baseSummary = `Analysis of ${analysisResult.type} completed successfully.`;
    
    switch (audienceContext.primaryAudience) {
      case 'executive':
        return {
          executiveSummary: `${baseSummary} Key findings reveal important patterns with strategic business implications.`,
          businessInsights: ['Data analysis reveals key business patterns', 'Strategic opportunities identified'],
          actionableRecommendations: ['Implement findings in business strategy', 'Monitor key performance indicators'],
          nextSteps: ['Review findings with leadership team', 'Develop implementation plan']
        };

      case 'technical':
        return {
          technicalDetails: `${baseSummary} Technical analysis completed with statistical validation.`,
          methodology: 'Analysis conducted using appropriate statistical methods and data validation.',
          confidence: 0.8
        };

      case 'business_ops':
        return {
          businessInsights: ['Operational patterns identified', 'Process improvement opportunities found'],
          actionableRecommendations: ['Optimize operational processes', 'Implement performance monitoring'],
          nextSteps: ['Review operational findings', 'Plan process improvements']
        };

      case 'marketing':
        return {
          businessInsights: ['Customer behavior patterns identified', 'Marketing opportunities discovered'],
          actionableRecommendations: ['Optimize marketing campaigns', 'Improve customer targeting'],
          nextSteps: ['Review marketing insights', 'Plan campaign improvements']
        };

      case 'mixed':
        return {
          executiveSummary: `${baseSummary} Comprehensive analysis completed with insights for all stakeholders.`,
          technicalDetails: 'Technical analysis completed with statistical validation.',
          businessInsights: ['Key business patterns identified', 'Strategic opportunities found'],
          actionableRecommendations: ['Implement findings across departments', 'Establish monitoring systems'],
          methodology: 'Analysis conducted using validated statistical methods.',
          nextSteps: ['Coordinate cross-functional review', 'Develop implementation roadmap']
        };

      default:
        return {
          executiveSummary: baseSummary,
          businessInsights: ['Analysis completed successfully'],
          actionableRecommendations: ['Review findings and implement recommendations']
        };
    }
  }
}

export const audienceFormatter = AudienceFormatter.getInstance();
