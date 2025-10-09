import { AIRouterService, type AIResponse } from './ai-router';
import { JourneyPromptService } from './journey-prompts';
import type { SubscriptionTierId as SubscriptionTier } from '../../shared/subscription-tiers';

export interface ConsultationContext {
  clientType: 'startup' | 'enterprise' | 'government' | 'nonprofit' | 'research';
  industryDomain: string;
  problemComplexity: 'strategic' | 'operational' | 'technical' | 'organizational';
  timeframe: 'immediate' | 'short_term' | 'long_term' | 'ongoing';
  stakeholders: string[];
  constraints: {
    budget?: string;
    timeline?: string;
    resources?: string;
    regulatory?: string[];
  };
  expectedOutcomes: string[];
}

export interface ExpertiseArea {
  domain: string;
  level: 'specialist' | 'expert' | 'thought_leader';
  keywords: string[];
  methodologies: string[];
  industryExperience: string[];
}

export interface ConsultationRequest {
  consultationType: 'strategic' | 'implementation' | 'assessment' | 'training' | 'research';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  scope: 'narrow' | 'broad' | 'comprehensive';
  deliverables: string[];
  sessionType: 'initial' | 'follow_up' | 'deep_dive' | 'final_review';
}

export interface ConsultationResponse extends AIResponse {
  executiveSummary: string;
  keyInsights: string[];
  recommendations: {
    priority: 'high' | 'medium' | 'low';
    action: string;
    rationale: string;
    timeline: string;
    resources: string[];
    risks: string[];
  }[];
  implementationPlan: {
    phase: string;
    description: string;
    duration: string;
    dependencies: string[];
    milestones: string[];
  }[];
  riskAssessment: {
    risk: string;
    probability: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    mitigation: string;
  }[];
  followUpActions: string[];
  nextSteps: string[];
}

export class ConsultationAIService {

  /**
   * Provide strategic consultation with expert-level insights
   */
  static async provideConsultation(
    userId: string,
    subscriptionTier: SubscriptionTier,
    context: ConsultationContext,
    request: ConsultationRequest,
    consultationPrompt: string
  ): Promise<ConsultationResponse> {
    // Build comprehensive consultation prompt
    const expertPrompt = this.buildExpertConsultationPrompt(
      context,
      request,
      consultationPrompt
    );

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'consultation',
      subscriptionTier,
      requestType: 'consultation',
      complexity: 'expert'
    }, expertPrompt);

    // Parse and structure consultation response
    const structuredResponse = this.parseConsultationResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...structuredResponse
    };
  }

  /**
   * Conduct strategic assessment with industry expertise
   */
  static async conductStrategicAssessment(
    userId: string,
    subscriptionTier: SubscriptionTier,
    context: ConsultationContext,
    currentState: any,
    targetState: any,
    userPrompt: string
  ): Promise<ConsultationResponse & {
    gapAnalysis: {
      category: string;
      currentState: string;
      targetState: string;
      gap: string;
      priority: 'high' | 'medium' | 'low';
    }[];
    strategicOptions: {
      option: string;
      pros: string[];
      cons: string[];
      feasibility: 'high' | 'medium' | 'low';
      impact: 'high' | 'medium' | 'low';
    }[];
  }> {
    const assessmentPrompt = this.buildStrategicAssessmentPrompt(
      context,
      currentState,
      targetState,
      userPrompt
    );

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'consultation',
      subscriptionTier,
      requestType: 'consultation',
      complexity: 'expert'
    }, assessmentPrompt);

    const parsedResponse = this.parseStrategicAssessment(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Provide organizational transformation guidance
   */
  static async guideOrganizationalTransformation(
    userId: string,
    subscriptionTier: SubscriptionTier,
    context: ConsultationContext,
    transformationGoals: string[],
    organizationalContext: any,
    userPrompt: string
  ): Promise<ConsultationResponse & {
    changeManagementPlan: {
      phase: string;
      activities: string[];
      stakeholders: string[];
      success_metrics: string[];
      timeline: string;
    }[];
    riskMitigation: {
      risk_category: string;
      specific_risks: string[];
      mitigation_strategies: string[];
      monitoring_approach: string;
    }[];
  }> {
    const transformationPrompt = this.buildTransformationPrompt(
      context,
      transformationGoals,
      organizationalContext,
      userPrompt
    );

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'consultation',
      subscriptionTier,
      requestType: 'consultation',
      complexity: 'expert'
    }, transformationPrompt);

    const parsedResponse = this.parseTransformationResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Generate implementation roadmap
   */
  static async generateImplementationRoadmap(
    userId: string,
    subscriptionTier: SubscriptionTier,
    context: ConsultationContext,
    objectives: string[],
    constraints: any,
    userPrompt: string
  ): Promise<ConsultationResponse & {
    roadmap: {
      quarter: string;
      initiatives: {
        name: string;
        description: string;
        owner: string;
        dependencies: string[];
        success_criteria: string[];
        resources_required: string[];
      }[];
      milestones: string[];
      risks: string[];
    }[];
    resourcePlan: {
      role: string;
      skills_required: string[];
      time_commitment: string;
      when_needed: string;
    }[];
  }> {
    const roadmapPrompt = this.buildRoadmapPrompt(
      context,
      objectives,
      constraints,
      userPrompt
    );

    const aiResponse = await AIRouterService.routeAIRequest({
      userId,
      userRole: 'consultation',
      subscriptionTier,
      requestType: 'consultation',
      complexity: 'expert'
    }, roadmapPrompt);

    const parsedResponse = this.parseRoadmapResponse(aiResponse.content);

    return {
      ...aiResponse,
      ...parsedResponse
    };
  }

  /**
   * Build expert consultation prompt
   */
  private static buildExpertConsultationPrompt(
    context: ConsultationContext,
    request: ConsultationRequest,
    userPrompt: string
  ): string {
    return `You are providing expert-level consultation for a ${context.clientType} organization in the ${context.industryDomain} industry.

CONSULTATION CONTEXT:
- Client Type: ${context.clientType}
- Industry: ${context.industryDomain}
- Problem Complexity: ${context.problemComplexity}
- Timeframe: ${context.timeframe}
- Stakeholders: ${context.stakeholders.join(', ')}

CONSTRAINTS:
- Budget: ${context.constraints.budget || 'flexible'}
- Timeline: ${context.constraints.timeline || 'standard'}
- Resources: ${context.constraints.resources || 'standard'}
- Regulatory: ${context.constraints.regulatory?.join(', ') || 'none specified'}

CONSULTATION REQUEST:
- Type: ${request.consultationType}
- Urgency: ${request.urgency}
- Scope: ${request.scope}
- Deliverables: ${request.deliverables.join(', ')}
- Session Type: ${request.sessionType}

EXPECTED OUTCOMES: ${context.expectedOutcomes.join(', ')}

USER REQUEST: ${userPrompt}

Please provide expert-level consultation structured as follows:

EXECUTIVE_SUMMARY: [Concise overview of the situation and recommendations]

KEY_INSIGHTS: [Critical insights and observations]

RECOMMENDATIONS: [Prioritized recommendations with detailed rationale]

IMPLEMENTATION_PLAN: [Phased approach with timelines and dependencies]

RISK_ASSESSMENT: [Comprehensive risk analysis with mitigation strategies]

FOLLOW_UP_ACTIONS: [Immediate next steps]

NEXT_STEPS: [Long-term strategic actions]

Provide industry-specific expertise and reference best practices, case studies, and proven methodologies relevant to the ${context.industryDomain} sector.`;
  }

  /**
   * Build strategic assessment prompt
   */
  private static buildStrategicAssessmentPrompt(
    context: ConsultationContext,
    currentState: any,
    targetState: any,
    userPrompt: string
  ): string {
    return `Conduct a comprehensive strategic assessment for a ${context.clientType} in ${context.industryDomain}.

CURRENT STATE: ${JSON.stringify(currentState, null, 2)}

TARGET STATE: ${JSON.stringify(targetState, null, 2)}

${this.buildExpertConsultationPrompt(context, {
      consultationType: 'assessment',
      urgency: 'medium',
      scope: 'comprehensive',
      deliverables: ['gap analysis', 'strategic options', 'recommendations'],
      sessionType: 'deep_dive'
    }, userPrompt)}

Additionally provide:

GAP_ANALYSIS: [Detailed analysis of gaps between current and target state]

STRATEGIC_OPTIONS: [Multiple strategic options with pros/cons analysis]

Include feasibility assessment and impact analysis for each recommendation.`;
  }

  /**
   * Build transformation prompt
   */
  private static buildTransformationPrompt(
    context: ConsultationContext,
    goals: string[],
    orgContext: any,
    userPrompt: string
  ): string {
    return `Provide organizational transformation guidance for achieving the following goals:
${goals.map(goal => `- ${goal}`).join('\n')}

ORGANIZATIONAL CONTEXT: ${JSON.stringify(orgContext, null, 2)}

${this.buildExpertConsultationPrompt(context, {
      consultationType: 'implementation',
      urgency: 'medium',
      scope: 'comprehensive',
      deliverables: ['change management plan', 'risk mitigation', 'roadmap'],
      sessionType: 'deep_dive'
    }, userPrompt)}

Additionally provide:

CHANGE_MANAGEMENT_PLAN: [Detailed change management approach with phases]

RISK_MITIGATION: [Comprehensive risk mitigation strategies]

Focus on change management best practices and organizational psychology principles.`;
  }

  /**
   * Build roadmap prompt
   */
  private static buildRoadmapPrompt(
    context: ConsultationContext,
    objectives: string[],
    constraints: any,
    userPrompt: string
  ): string {
    return `Generate a detailed implementation roadmap for achieving these objectives:
${objectives.map(obj => `- ${obj}`).join('\n')}

CONSTRAINTS: ${JSON.stringify(constraints, null, 2)}

${this.buildExpertConsultationPrompt(context, {
      consultationType: 'implementation',
      urgency: 'medium',
      scope: 'comprehensive',
      deliverables: ['roadmap', 'resource plan', 'timeline'],
      sessionType: 'deep_dive'
    }, userPrompt)}

Additionally provide:

ROADMAP: [Quarterly roadmap with initiatives and milestones]

RESOURCE_PLAN: [Detailed resource requirements and timing]

Structure the roadmap with realistic timelines and clear dependencies.`;
  }

  /**
   * Parse consultation response into structured format
   */
  private static parseConsultationResponse(response: string): Omit<ConsultationResponse, keyof AIResponse> {
    const sections = this.extractResponseSections(response, [
      'EXECUTIVE_SUMMARY', 'KEY_INSIGHTS', 'RECOMMENDATIONS',
      'IMPLEMENTATION_PLAN', 'RISK_ASSESSMENT', 'FOLLOW_UP_ACTIONS', 'NEXT_STEPS'
    ]);

    return {
      executiveSummary: sections.EXECUTIVE_SUMMARY || '',
      keyInsights: this.parseListItems(sections.KEY_INSIGHTS || ''),
      recommendations: this.parseRecommendations(sections.RECOMMENDATIONS || ''),
      implementationPlan: this.parseImplementationPlan(sections.IMPLEMENTATION_PLAN || ''),
      riskAssessment: this.parseRiskAssessment(sections.RISK_ASSESSMENT || ''),
      followUpActions: this.parseListItems(sections.FOLLOW_UP_ACTIONS || ''),
      nextSteps: this.parseListItems(sections.NEXT_STEPS || '')
    };
  }

  /**
   * Parse strategic assessment response
   */
  private static parseStrategicAssessment(response: string): any {
    const baseResponse = this.parseConsultationResponse(response);
    const sections = this.extractResponseSections(response, ['GAP_ANALYSIS', 'STRATEGIC_OPTIONS']);

    return {
      ...baseResponse,
      gapAnalysis: this.parseGapAnalysis(sections.GAP_ANALYSIS || ''),
      strategicOptions: this.parseStrategicOptions(sections.STRATEGIC_OPTIONS || '')
    };
  }

  /**
   * Parse transformation response
   */
  private static parseTransformationResponse(response: string): any {
    const baseResponse = this.parseConsultationResponse(response);
    const sections = this.extractResponseSections(response, ['CHANGE_MANAGEMENT_PLAN', 'RISK_MITIGATION']);

    return {
      ...baseResponse,
      changeManagementPlan: this.parseChangeManagementPlan(sections.CHANGE_MANAGEMENT_PLAN || ''),
      riskMitigation: this.parseRiskMitigation(sections.RISK_MITIGATION || '')
    };
  }

  /**
   * Parse roadmap response
   */
  private static parseRoadmapResponse(response: string): any {
    const baseResponse = this.parseConsultationResponse(response);
    const sections = this.extractResponseSections(response, ['ROADMAP', 'RESOURCE_PLAN']);

    return {
      ...baseResponse,
      roadmap: this.parseRoadmap(sections.ROADMAP || ''),
      resourcePlan: this.parseResourcePlan(sections.RESOURCE_PLAN || '')
    };
  }

  /**
   * Utility parsing methods
   */
  private static extractResponseSections(text: string, sectionNames: string[]): Record<string, string> {
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

  private static parseListItems(text: string): string[] {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line))
      .map(line => line.replace(/^[-•\d.\s]+/, '').trim())
      .filter(line => line.length > 0);
  }

  private static parseRecommendations(text: string): ConsultationResponse['recommendations'] {
    // Simple parsing - in production, would use more sophisticated NLP
    const items = this.parseListItems(text);
    return items.map(item => ({
      priority: 'medium' as const,
      action: item,
      rationale: 'Expert recommendation based on analysis',
      timeline: 'To be determined',
      resources: [],
      risks: []
    }));
  }

  private static parseImplementationPlan(text: string): ConsultationResponse['implementationPlan'] {
    const items = this.parseListItems(text);
    return items.map((item, index) => ({
      phase: `Phase ${index + 1}`,
      description: item,
      duration: 'To be determined',
      dependencies: [],
      milestones: []
    }));
  }

  private static parseRiskAssessment(text: string): ConsultationResponse['riskAssessment'] {
    const items = this.parseListItems(text);
    return items.map(item => ({
      risk: item,
      probability: 'medium' as const,
      impact: 'medium' as const,
      mitigation: 'Standard mitigation approach'
    }));
  }

  private static parseGapAnalysis(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map(item => ({
      category: 'General',
      currentState: 'Current state',
      targetState: 'Target state',
      gap: item,
      priority: 'medium' as const
    }));
  }

  private static parseStrategicOptions(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map(item => ({
      option: item,
      pros: [],
      cons: [],
      feasibility: 'medium' as const,
      impact: 'medium' as const
    }));
  }

  private static parseChangeManagementPlan(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map((item, index) => ({
      phase: `Phase ${index + 1}`,
      activities: [item],
      stakeholders: [],
      success_metrics: [],
      timeline: 'To be determined'
    }));
  }

  private static parseRiskMitigation(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map(item => ({
      risk_category: 'General',
      specific_risks: [item],
      mitigation_strategies: [],
      monitoring_approach: 'Regular review'
    }));
  }

  private static parseRoadmap(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map((item, index) => ({
      quarter: `Q${index + 1}`,
      initiatives: [{
        name: item,
        description: item,
        owner: 'To be assigned',
        dependencies: [],
        success_criteria: [],
        resources_required: []
      }],
      milestones: [],
      risks: []
    }));
  }

  private static parseResourcePlan(text: string): any[] {
    const items = this.parseListItems(text);
    return items.map(item => ({
      role: item,
      skills_required: [],
      time_commitment: 'To be determined',
      when_needed: 'To be determined'
    }));
  }

  /**
   * Get consultation pricing and features by tier
   */
  static getConsultationFeatures(subscriptionTier: SubscriptionTier): {
    strategicConsultation: boolean;
    implementationGuidance: boolean;
    organizationalAssessment: boolean;
    changeManagement: boolean;
    executiveReporting: boolean;
    customFrameworks: boolean;
    monthlyReviews: boolean;
  } {
    const features = {
      none: {
        strategicConsultation: false,
        implementationGuidance: false,
        organizationalAssessment: false,
        changeManagement: false,
        executiveReporting: false,
        customFrameworks: false,
        monthlyReviews: false
      },
      trial: {
        strategicConsultation: false,
        implementationGuidance: false,
        organizationalAssessment: false,
        changeManagement: false,
        executiveReporting: false,
        customFrameworks: false,
        monthlyReviews: false
      },
      starter: {
        strategicConsultation: false,
        implementationGuidance: false,
        organizationalAssessment: false,
        changeManagement: false,
        executiveReporting: false,
        customFrameworks: false,
        monthlyReviews: false
      },
      professional: {
        strategicConsultation: true,
        implementationGuidance: true,
        organizationalAssessment: true,
        changeManagement: false,
        executiveReporting: true,
        customFrameworks: false,
        monthlyReviews: false
      },
      enterprise: {
        strategicConsultation: true,
        implementationGuidance: true,
        organizationalAssessment: true,
        changeManagement: true,
        executiveReporting: true,
        customFrameworks: true,
        monthlyReviews: true
      }
    };

  const tier = subscriptionTier as import('../../shared/subscription-tiers').SubscriptionTierId;
  return features[tier as keyof typeof features];
  }
}