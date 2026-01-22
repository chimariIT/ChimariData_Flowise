/**
 * Natural Language Translation Service
 *
 * Translates technical data science output to plain language for different audience types.
 * This is the core service for the u2a2a2u pattern's "back to user" phase.
 *
 * Key features:
 * - AI-powered translation using ChimaridataAI
 * - Audience-aware translation (executive, business, technical, general)
 * - Schema field translation to business terms
 * - Analysis results translation
 * - Data quality metrics to business impact
 * - Error message humanization
 * - Grammar checking and clarification
 * - Caching to reduce API calls
 */

import type { UserRole } from '../../shared/schema';
import { ChimaridataAI, chimaridataAI } from '../chimaridata-ai';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export type AudienceType = 'executive' | 'business' | 'technical' | 'general';

export interface TranslationContext {
  audience: AudienceType;
  industry?: string;
  projectName?: string;
  userRole?: string;
  technicalLevel?: 'beginner' | 'intermediate' | 'expert';
}

export interface AITranslationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  cached: boolean;
  provider?: string;
}

export interface AIResultsTranslation {
  executiveSummary: string;
  keyFindings: Array<{
    finding: string;
    impact: string;
    confidence: string;
    actionable: boolean;
  }>;
  recommendations: Array<{
    action: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
    expectedOutcome: string;
  }>;
  visualizationNarrative?: string;
  nextSteps: string[];
  caveats?: string[];
}

export interface AIQualityTranslation {
  overallAssessment: string;
  businessImpact: string;
  trustLevel: 'high' | 'medium' | 'low';
  issues: Array<{
    issue: string;
    businessRisk: string;
    recommendation: string;
  }>;
  readyForAnalysis: boolean;
  confidence: number;
}

export interface AISchemaTranslation {
  originalField: string;
  businessName: string;
  description: string;
  dataType: string;
  businessContext: string;
  examples?: string[];
}

// Legacy interfaces (backward compatibility)
export interface DataSchema {
  [fieldName: string]: {
    type: string;
    nullable?: boolean;
    description?: string;
    example?: any;
  };
}

export interface DataRelationship {
  sourceField: string;
  targetField?: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many' | 'derived';
  description?: string;
}

export interface AnalysisComponent {
  type: 'statistical_test' | 'ml_model' | 'visualization' | 'data_transformation';
  name: string;
  technicalDescription: string;
  parameters?: Record<string, any>;
}

export interface NaturalLanguageExplanation {
  title: string;
  summary: string;
  details: string[];
  examples: string[];
  whyItMatters: string;
}

export interface MethodologyExplanation {
  overview: string;
  steps: {
    stepNumber: number;
    title: string;
    description: string;
    businessPurpose: string;
  }[];
  expectedOutcome: string;
  timeEstimate: string;
}

export interface UserFriendlyInsights {
  executiveSummary: string;
  keyFindings: {
    finding: string;
    impact: string;
    priority: 'high' | 'medium' | 'low';
    actionable: boolean;
  }[];
  recommendations: string[];
  nextSteps: string[];
}

// ==========================================
// TRANSLATION CACHE
// ==========================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  audience: AudienceType | UserRole;
}

class TranslationCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutes

  private generateKey(type: string, content: any, audience: AudienceType | UserRole): string {
    const contentHash = JSON.stringify(content).slice(0, 500);
    return `${type}:${audience}:${Buffer.from(contentHash).toString('base64').slice(0, 50)}`;
  }

  get<T>(type: string, content: any, audience: AudienceType | UserRole): T | null {
    const key = this.generateKey(type, content, audience);
    const entry = this.cache.get(key);

    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(type: string, content: any, audience: AudienceType | UserRole, data: T): void {
    const key = this.generateKey(type, content, audience);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      audience
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

// ==========================================
// AUDIENCE PROMPTS FOR AI TRANSLATION
// ==========================================

const AUDIENCE_PERSONAS: Record<AudienceType, string> = {
  executive: `You are translating for C-suite executives. Use:
- Strategic, high-level language
- Focus on ROI, risk, and competitive advantage
- Bullet points and clear headlines
- Business impact over technical details
- 30-second scannable summaries
- Financial implications and timelines`,

  business: `You are translating for business analysts and managers. Use:
- Clear business terminology
- Operational impact and efficiency gains
- KPI-focused insights
- Actionable recommendations
- Moderate technical depth when relevant
- Process improvement focus`,

  technical: `You are translating for data professionals. Use:
- Accurate statistical terminology
- Methodology transparency
- Confidence intervals and p-values
- Technical caveats and limitations
- Code references when helpful
- Reproducibility considerations`,

  general: `You are translating for general audiences. Use:
- Simple, everyday language
- Relatable analogies and examples
- Avoid jargon entirely
- Step-by-step explanations
- Visual metaphors
- Encouraging, supportive tone`
};

/**
 * Natural Language Translator Service
 *
 * Translates technical outputs to business-friendly language
 * based on user role (non-tech, business, technical, consultation)
 *
 * Supports both synchronous (hardcoded) and async (AI-powered) translation:
 * - Sync methods: translateSchema, translateFindings, etc. (fast, no API calls)
 * - Async methods: translateSchemaWithAI, translateResultsWithAI, etc. (AI-powered, more nuanced)
 */
export class NaturalLanguageTranslator {
  private ai: ChimaridataAI;
  private cache: TranslationCache;

  constructor(aiService?: ChimaridataAI) {
    this.ai = aiService || chimaridataAI;
    this.cache = new TranslationCache();
  }

  // ==========================================
  // AI-POWERED TRANSLATION METHODS (Async)
  // ==========================================

  /**
   * Translate data schema to business-friendly descriptions using AI
   */
  async translateSchemaWithAI(
    schema: Record<string, any>,
    context: TranslationContext
  ): Promise<AITranslationResult<AISchemaTranslation[]>> {
    const cached = this.cache.get<AISchemaTranslation[]>('ai-schema', schema, context.audience);
    if (cached) {
      console.log('[NL Translator] Using cached schema translation');
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = this.buildAISchemaPrompt(schema, context);
      const result = await this.ai.generateText({ prompt, temperature: 0.3 });
      const translations = this.parseAISchemaResponse(result.text, schema);

      this.cache.set('ai-schema', schema, context.audience, translations);
      console.log(`[NL Translator] Schema translated for ${context.audience} audience`);

      return {
        success: true,
        data: translations,
        cached: false,
        provider: result.provider
      };
    } catch (error: any) {
      console.error('[NL Translator] AI schema translation failed:', error.message);
      return {
        success: false,
        error: error.message,
        cached: false,
        data: this.fallbackAISchemaTranslation(schema)
      };
    }
  }

  private buildAISchemaPrompt(schema: Record<string, any>, context: TranslationContext): string {
    const fields = Object.entries(schema).map(([name, info]) => {
      const type = typeof info === 'object' ? info.type || 'unknown' : info;
      return `- ${name}: ${type}`;
    }).join('\n');

    return `${AUDIENCE_PERSONAS[context.audience]}

TASK: Translate these data column names into business-friendly terms.

${context.industry ? `INDUSTRY: ${context.industry}` : ''}
${context.projectName ? `PROJECT: ${context.projectName}` : ''}

DATA COLUMNS:
${fields}

For each column, provide a JSON array with objects containing:
- originalField: the original column name
- businessName: a clear business-friendly name
- description: what this data represents in business terms
- dataType: simplified type (text, number, date, category, etc.)
- businessContext: why this matters for business decisions

Respond with ONLY a valid JSON array.`;
  }

  private parseAISchemaResponse(response: string, originalSchema: Record<string, any>): AISchemaTranslation[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.warn('[NL Translator] Failed to parse AI schema response, using fallback');
    }
    return this.fallbackAISchemaTranslation(originalSchema);
  }

  private fallbackAISchemaTranslation(schema: Record<string, any>): AISchemaTranslation[] {
    return Object.entries(schema).map(([field, info]) => ({
      originalField: field,
      businessName: this.humanizeFieldName(field),
      description: `Data field: ${field}`,
      dataType: typeof info === 'object' ? info.type || 'unknown' : String(info),
      businessContext: 'Contains data relevant to your analysis'
    }));
  }

  /**
   * Translate analysis results for the target audience using AI
   */
  async translateResultsWithAI(
    results: any,
    context: TranslationContext
  ): Promise<AITranslationResult<AIResultsTranslation>> {
    const cached = this.cache.get<AIResultsTranslation>('ai-results', results, context.audience);
    if (cached) {
      console.log('[NL Translator] Using cached results translation');
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = this.buildAIResultsPrompt(results, context);
      const result = await this.ai.generateText({ prompt, temperature: 0.4 });
      const translation = this.parseAIResultsResponse(result.text, results, context);

      this.cache.set('ai-results', results, context.audience, translation);
      console.log(`[NL Translator] Results translated for ${context.audience} audience`);

      return {
        success: true,
        data: translation,
        cached: false,
        provider: result.provider
      };
    } catch (error: any) {
      console.error('[NL Translator] AI results translation failed:', error.message);
      return {
        success: false,
        error: error.message,
        cached: false,
        data: this.fallbackAIResultsTranslation(results, context)
      };
    }
  }

  private buildAIResultsPrompt(results: any, context: TranslationContext): string {
    const resultsStr = JSON.stringify(results, null, 2).slice(0, 4000);

    return `${AUDIENCE_PERSONAS[context.audience]}

TASK: Translate these analysis results into a clear, actionable report.

${context.industry ? `INDUSTRY: ${context.industry}` : ''}
${context.projectName ? `PROJECT: ${context.projectName}` : ''}
${context.userRole ? `USER ROLE: ${context.userRole}` : ''}

ANALYSIS RESULTS:
${resultsStr}

Provide a JSON object with:
- executiveSummary: 2-3 sentence overview of key findings
- keyFindings: array of { finding, impact, confidence, actionable }
- recommendations: array of { action, rationale, priority, expectedOutcome }
- visualizationNarrative: describe what the charts show in plain language
- nextSteps: array of concrete next actions
- caveats: any limitations or considerations

Respond with ONLY a valid JSON object.`;
  }

  private parseAIResultsResponse(response: string, originalResults: any, context: TranslationContext): AIResultsTranslation {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          executiveSummary: parsed.executiveSummary || 'Analysis complete.',
          keyFindings: parsed.keyFindings || [],
          recommendations: parsed.recommendations || [],
          visualizationNarrative: parsed.visualizationNarrative,
          nextSteps: parsed.nextSteps || [],
          caveats: parsed.caveats
        };
      }
    } catch (e) {
      console.warn('[NL Translator] Failed to parse AI results response, using fallback');
    }
    return this.fallbackAIResultsTranslation(originalResults, context);
  }

  private fallbackAIResultsTranslation(results: any, context: TranslationContext): AIResultsTranslation {
    const insights = results.insights || [];
    const recommendations = results.recommendations || [];

    return {
      executiveSummary: `Analysis completed with ${insights.length} insights and ${recommendations.length} recommendations.`,
      keyFindings: insights.slice(0, 5).map((insight: any) => ({
        finding: typeof insight === 'string' ? insight : insight.title || insight.description || 'Finding',
        impact: 'Requires review',
        confidence: 'Medium',
        actionable: true
      })),
      recommendations: recommendations.slice(0, 5).map((rec: any, i: number) => ({
        action: typeof rec === 'string' ? rec : rec.title || rec.description || 'Action needed',
        rationale: 'Based on analysis findings',
        priority: i < 2 ? 'high' as const : 'medium' as const,
        expectedOutcome: 'Improved outcomes'
      })),
      nextSteps: ['Review the detailed findings', 'Discuss with stakeholders', 'Plan implementation'],
      caveats: ['Results should be validated with domain expertise']
    };
  }

  /**
   * Translate data quality metrics to business impact using AI
   */
  async translateQualityWithAI(
    qualityReport: any,
    context: TranslationContext
  ): Promise<AITranslationResult<AIQualityTranslation>> {
    const cached = this.cache.get<AIQualityTranslation>('ai-quality', qualityReport, context.audience);
    if (cached) {
      console.log('[NL Translator] Using cached quality translation');
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = this.buildAIQualityPrompt(qualityReport, context);
      const result = await this.ai.generateText({ prompt, temperature: 0.3 });
      const translation = this.parseAIQualityResponse(result.text, qualityReport);

      this.cache.set('ai-quality', qualityReport, context.audience, translation);
      console.log(`[NL Translator] Quality translated for ${context.audience} audience`);

      return {
        success: true,
        data: translation,
        cached: false,
        provider: result.provider
      };
    } catch (error: any) {
      console.error('[NL Translator] AI quality translation failed:', error.message);
      return {
        success: false,
        error: error.message,
        cached: false,
        data: this.fallbackAIQualityTranslation(qualityReport)
      };
    }
  }

  private buildAIQualityPrompt(report: any, context: TranslationContext): string {
    const reportStr = JSON.stringify(report, null, 2).slice(0, 3000);

    return `${AUDIENCE_PERSONAS[context.audience]}

TASK: Translate this data quality report into business terms.

${context.industry ? `INDUSTRY: ${context.industry}` : ''}

DATA QUALITY REPORT:
${reportStr}

Provide a JSON object with:
- overallAssessment: 1-2 sentence summary of data quality
- businessImpact: what this quality level means for business decisions
- trustLevel: "high", "medium", or "low"
- issues: array of { issue, businessRisk, recommendation }
- readyForAnalysis: boolean
- confidence: 0-100 score

Respond with ONLY a valid JSON object.`;
  }

  private parseAIQualityResponse(response: string, originalReport: any): AIQualityTranslation {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          overallAssessment: parsed.overallAssessment || 'Data quality assessment complete.',
          businessImpact: parsed.businessImpact || 'Review quality issues before proceeding.',
          trustLevel: parsed.trustLevel || 'medium',
          issues: parsed.issues || [],
          readyForAnalysis: parsed.readyForAnalysis ?? true,
          confidence: parsed.confidence ?? 70
        };
      }
    } catch (e) {
      console.warn('[NL Translator] Failed to parse AI quality response, using fallback');
    }
    return this.fallbackAIQualityTranslation(originalReport);
  }

  private fallbackAIQualityTranslation(report: any): AIQualityTranslation {
    const score = report.overallScore || report.qualityScore || report.score || 70;
    const trustLevel = score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low';

    return {
      overallAssessment: `Data quality score: ${score}%. ${trustLevel === 'high' ? 'Good quality for analysis.' : 'Some issues may affect results.'}`,
      businessImpact: trustLevel === 'high'
        ? 'High confidence in analysis results'
        : 'Results should be interpreted with some caution',
      trustLevel,
      issues: (report.issues || []).slice(0, 5).map((issue: any) => ({
        issue: typeof issue === 'string' ? issue : issue.description || 'Data issue detected',
        businessRisk: 'May affect accuracy of insights',
        recommendation: 'Review and clean data if possible'
      })),
      readyForAnalysis: score >= 50,
      confidence: score
    };
  }

  /**
   * Translate technical error messages to user-friendly text using AI
   */
  async translateErrorWithAI(
    error: string | Error,
    context: TranslationContext
  ): Promise<AITranslationResult<{ message: string; suggestion: string; technical?: string }>> {
    const errorStr = error instanceof Error ? error.message : error;

    const cached = this.cache.get<{ message: string; suggestion: string }>('ai-error', errorStr, context.audience);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `${AUDIENCE_PERSONAS[context.audience]}

TASK: Translate this technical error into a friendly, helpful message.

ERROR: ${errorStr}

Provide a JSON object with:
- message: user-friendly explanation of what happened
- suggestion: what the user can do to resolve it
- technical: (only for technical audience) the original error

Keep the tone helpful and non-alarming. Respond with ONLY a valid JSON object.`;

      const result = await this.ai.generateText({ prompt, temperature: 0.3 });
      const translation = this.parseAIErrorResponse(result.text, errorStr, context);

      this.cache.set('ai-error', errorStr, context.audience, translation);

      return {
        success: true,
        data: translation,
        cached: false,
        provider: result.provider
      };
    } catch (e: any) {
      return {
        success: false,
        error: e.message,
        cached: false,
        data: this.fallbackAIErrorTranslation(errorStr, context)
      };
    }
  }

  private parseAIErrorResponse(response: string, original: string, context: TranslationContext): { message: string; suggestion: string; technical?: string } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          message: parsed.message || 'Something went wrong',
          suggestion: parsed.suggestion || 'Please try again or contact support',
          technical: context.audience === 'technical' ? original : undefined
        };
      }
    } catch (e) {
      // Fallback
    }
    return this.fallbackAIErrorTranslation(original, context);
  }

  private fallbackAIErrorTranslation(error: string, context: TranslationContext): { message: string; suggestion: string; technical?: string } {
    return {
      message: 'We encountered an issue processing your request.',
      suggestion: 'Please try again. If the problem persists, contact our support team.',
      technical: context.audience === 'technical' ? error : undefined
    };
  }

  /**
   * Check and fix grammar in text using AI
   */
  async checkGrammarWithAI(text: string): Promise<AITranslationResult<{ corrected: string; changes: string[] }>> {
    try {
      const prompt = `TASK: Fix any grammar, spelling, or clarity issues in this text.

TEXT: "${text}"

Provide a JSON object with:
- corrected: the corrected text
- changes: array of changes made (empty if no changes needed)

Keep the original meaning and tone. Respond with ONLY a valid JSON object.`;

      const result = await this.ai.generateText({ prompt, temperature: 0.1 });

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            success: true,
            data: {
              corrected: parsed.corrected || text,
              changes: parsed.changes || []
            },
            cached: false,
            provider: result.provider
          };
        }
      } catch (e) {
        // Fallback - return original
      }

      return {
        success: true,
        data: { corrected: text, changes: [] },
        cached: false
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        cached: false,
        data: { corrected: text, changes: [] }
      };
    }
  }

  /**
   * Clarify a technical term for the target audience using AI
   */
  async clarifyTermWithAI(
    term: string,
    technicalContext: string,
    audience: AudienceType
  ): Promise<AITranslationResult<{ explanation: string; example?: string }>> {
    const cacheKey = `${term}:${technicalContext}`;
    const cached = this.cache.get<{ explanation: string; example?: string }>('ai-term', cacheKey, audience);
    if (cached) {
      return { success: true, data: cached, cached: true };
    }

    try {
      const prompt = `${AUDIENCE_PERSONAS[audience]}

TASK: Explain this technical term in accessible language.

TERM: ${term}
CONTEXT: ${technicalContext}

Provide a JSON object with:
- explanation: clear explanation appropriate for the audience
- example: a relatable real-world example (optional)

Respond with ONLY a valid JSON object.`;

      const result = await this.ai.generateText({ prompt, temperature: 0.4 });

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const data = {
            explanation: parsed.explanation || `${term}: A data analysis concept`,
            example: parsed.example
          };
          this.cache.set('ai-term', cacheKey, audience, data);
          return {
            success: true,
            data,
            cached: false,
            provider: result.provider
          };
        }
      } catch (e) {
        // Fallback
      }

      return {
        success: true,
        data: { explanation: `${term}: A technical concept used in data analysis` },
        cached: false
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        cached: false,
        data: { explanation: `${term}: A technical concept used in data analysis` }
      };
    }
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[NL Translator] Cache cleared');
  }

  /**
   * Map UserRole to AudienceType
   */
  userRoleToAudience(userRole: UserRole): AudienceType {
    switch (userRole) {
      case 'non-tech': return 'general';
      case 'business': return 'business';
      case 'technical': return 'technical';
      case 'consultation': return 'executive';
      default: return 'business';
    }
  }

  // ==========================================
  // SYNCHRONOUS TRANSLATION METHODS (Legacy)
  // ==========================================

  /**
   * Translate data schema to natural language (synchronous, no AI call)
   */
  translateSchema(schema: DataSchema, userRole: UserRole): NaturalLanguageExplanation {
    const fieldCount = Object.keys(schema).length;

    switch (userRole) {
      case 'non-tech':
        return {
          title: 'Your Data Fields',
          summary: `We identified ${fieldCount} pieces of information in your data.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `**${this.humanizeFieldName(field)}**: ${this.explainFieldForNonTech(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'non-tech'),
          whyItMatters: 'Understanding your data structure helps us create accurate analysis and insights.'
        };

      case 'business':
        return {
          title: 'Data Schema Overview',
          summary: `Dataset contains ${fieldCount} fields with business-relevant information.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `**${this.humanizeFieldName(field)}** (${meta.type}): ${this.explainFieldForBusiness(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'business'),
          whyItMatters: 'Proper schema understanding ensures KPI calculations and business logic are correctly applied.'
        };

      case 'technical':
        return {
          title: 'Data Schema Specification',
          summary: `Schema includes ${fieldCount} fields with defined types and constraints.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `\`${field}\`: ${meta.type}${meta.nullable ? ' (nullable)' : ' (required)'} - ${meta.description || 'No description'}`
          ),
          examples: this.generateSchemaExamples(schema, 'technical'),
          whyItMatters: 'Schema validation ensures data quality and supports reproducible analysis.'
        };

      case 'consultation':
        return {
          title: 'Schema Analysis & Recommendations',
          summary: `Comprehensive schema review of ${fieldCount} fields with optimization opportunities.`,
          details: Object.entries(schema).map(([field, meta]) =>
            `${field}: ${this.analyzeFieldForConsultation(field, meta)}`
          ),
          examples: this.generateSchemaExamples(schema, 'consultation'),
          whyItMatters: 'Schema optimization impacts analysis performance, accuracy, and scalability.'
        };

      default:
        return this.translateSchema(schema, 'business');
    }
  }

  /**
   * Explain data relationships in user-friendly terms
   */
  explainRelationships(
    relationships: DataRelationship[],
    userRole: UserRole
  ): NaturalLanguageExplanation {
    switch (userRole) {
      case 'non-tech':
        return {
          title: 'How Your Data Connects',
          summary: `We found ${relationships.length} important connections in your data.`,
          details: relationships.map(rel =>
            `${this.humanizeFieldName(rel.sourceField)} → ${this.explainRelationshipForNonTech(rel)}`
          ),
          examples: [
            'Example: Customer ID connects to Order History (one customer can have many orders)',
            'Example: Product Price is calculated from Base Price + Tax'
          ],
          whyItMatters: 'Understanding connections helps us analyze patterns and relationships in your business.'
        };

      case 'business':
        return {
          title: 'Data Relationship Model',
          summary: `${relationships.length} relationships identified for business logic validation.`,
          details: relationships.map(rel =>
            `${this.humanizeFieldName(rel.sourceField)} [${rel.type}] → ${this.explainRelationshipForBusiness(rel)}`
          ),
          examples: relationships.slice(0, 3).map(rel =>
            `Business Rule: ${rel.description || this.inferBusinessRule(rel)}`
          ),
          whyItMatters: 'Relationship validation ensures business rules are correctly implemented in analysis.'
        };

      case 'technical':
        return {
          title: 'Data Model & Entity Relationships',
          summary: `Entity-relationship diagram with ${relationships.length} defined relationships.`,
          details: relationships.map(rel =>
            `${rel.sourceField} [${rel.type}]${rel.targetField ? ` → ${rel.targetField}` : ' (derived)'}`
          ),
          examples: relationships.map(rel => this.generateSQLExample(rel)),
          whyItMatters: 'Proper relationship modeling is essential for JOIN operations and data integrity.'
        };

      default:
        return this.explainRelationships(relationships, 'business');
    }
  }

  /**
   * Explain analysis methodology in natural language
   */
  explainMethodology(
    analysisComponents: AnalysisComponent[],
    template: any,
    userRole: UserRole
  ): MethodologyExplanation {
    switch (userRole) {
      case 'non-tech':
        return {
          overview: `We'll analyze your data in ${analysisComponents.length} simple steps to answer your questions.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: this.simplifyComponentName(comp.name),
            description: this.explainComponentForNonTech(comp),
            businessPurpose: this.explainWhyThisMatters(comp, 'non-tech')
          })),
          expectedOutcome: 'You\'ll get clear answers to your questions with easy-to-understand charts and recommendations.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'non-tech')
        };

      case 'business':
        return {
          overview: `${analysisComponents.length}-step analytical approach aligned with ${template.name || 'business objectives'}.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: comp.name,
            description: this.explainComponentForBusiness(comp),
            businessPurpose: this.mapToKPIs(comp, template)
          })),
          expectedOutcome: 'Strategic insights with KPI impact analysis and actionable recommendations.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'business')
        };

      case 'technical':
        return {
          overview: `${analysisComponents.length} analytical components with statistical rigor and reproducibility.`,
          steps: analysisComponents.map((comp, idx) => ({
            stepNumber: idx + 1,
            title: comp.name,
            description: comp.technicalDescription,
            businessPurpose: this.explainTechnicalRationale(comp)
          })),
          expectedOutcome: 'Complete analytical artifacts including code, models, statistical reports, and technical documentation.',
          timeEstimate: this.estimateTimeForUser(analysisComponents, 'technical')
        };

      default:
        return this.explainMethodology(analysisComponents, template, 'business');
    }
  }

  /**
   * Translate technical findings to user-friendly insights
   */
  translateFindings(
    technicalResults: any,
    template: any,
    userRole: UserRole
  ): UserFriendlyInsights {
    const findings = technicalResults.findings || [];
    const insights = technicalResults.insights || [];

    switch (userRole) {
      case 'non-tech':
        return {
          executiveSummary: this.generateNonTechSummary(findings, insights),
          keyFindings: findings.slice(0, 5).map((finding: any) => ({
            finding: this.simplifyFinding(finding),
            impact: this.explainImpactForNonTech(finding),
            priority: finding.significance,
            actionable: true
          })),
          recommendations: this.generateSimpleRecommendations(findings, template),
          nextSteps: [
            'Review the key findings above',
            'Look at the charts we created',
            'Read our recommendations',
            'Let us know if you have questions'
          ]
        };

      case 'business':
        return {
          executiveSummary: this.generateBusinessSummary(findings, insights, template),
          keyFindings: findings.map((finding: any) => ({
            finding: finding.title,
            impact: this.quantifyBusinessImpact(finding, template),
            priority: finding.significance,
            actionable: this.isActionable(finding)
          })),
          recommendations: this.generateBusinessRecommendations(findings, template),
          nextSteps: [
            'Share findings with stakeholders',
            'Implement top 3 recommendations',
            'Monitor KPI changes',
            'Schedule 30-day review'
          ]
        };

      case 'technical':
        return {
          executiveSummary: this.generateTechnicalSummary(findings, insights, technicalResults),
          keyFindings: findings.map((finding: any) => ({
            finding: `${finding.title} (confidence: ${finding.confidence})`,
            impact: this.describeTechnicalImpact(finding),
            priority: finding.significance,
            actionable: finding.category !== 'exploratory'
          })),
          recommendations: this.generateTechnicalRecommendations(findings, technicalResults),
          nextSteps: [
            'Review statistical assumptions and limitations',
            'Validate model performance on holdout set',
            'Document methodology for reproducibility',
            'Consider production deployment requirements'
          ]
        };

      default:
        return this.translateFindings(technicalResults, template, 'business');
    }
  }

  /**
   * Explain data quality issues in user-friendly terms
   */
  translateDataQuality(
    qualityReport: any,
    userRole: UserRole
  ): NaturalLanguageExplanation {
    const issueCount = qualityReport.issues?.length || 0;
    const qualityScore = qualityReport.qualityScore || 0;

    switch (userRole) {
      case 'non-tech':
        return {
          title: 'Data Quality Check',
          summary: `Your data is ${qualityScore}% ready for analysis. ${issueCount > 0 ? `We found ${issueCount} things to fix.` : 'Everything looks good!'}`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `• ${this.explainQualityIssueForNonTech(issue)}`
          ),
          examples: [
            'Example: 15% of email addresses are blank (we can work with this)',
            'Example: Some phone numbers have different formats (we\'ll standardize them)'
          ],
          whyItMatters: 'Clean data gives you more accurate results and better insights.'
        };

      case 'business':
        return {
          title: 'Data Quality Assessment',
          summary: `Quality Score: ${qualityScore}/100 with ${issueCount} issues requiring attention.`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `• ${issue.type}: ${issue.description} (${issue.affectedRecords} records, ${issue.severity} severity)`
          ),
          examples: qualityReport.issues?.slice(0, 3).map((issue: any) =>
            `Impact: ${this.quantifyQualityImpact(issue)}`
          ) || [],
          whyItMatters: 'Data quality directly impacts decision confidence and ROI from analysis.'
        };

      case 'technical':
        return {
          title: 'Data Quality Metrics',
          summary: `Completeness: ${qualityReport.completeness}%, Validity: ${qualityReport.validity}%, Consistency: ${qualityReport.consistency}%`,
          details: (qualityReport.issues || []).map((issue: any) =>
            `${issue.field || 'Multiple fields'}: ${issue.rule} - ${issue.message}`
          ),
          examples: (qualityReport.issues || []).map((issue: any) =>
            `Remediation: ${this.suggestTechnicalFix(issue)}`
          ),
          whyItMatters: 'Data quality validation ensures statistical assumptions and model performance.'
        };

      default:
        return this.translateDataQuality(qualityReport, 'business');
    }
  }

  // ============ PRIVATE HELPER METHODS ============

  private humanizeFieldName(field: string): string {
    return field
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  private explainFieldForNonTech(field: string, meta: any): string {
    const typeExplanations: Record<string, string> = {
      'string': 'text information',
      'number': 'numeric value',
      'integer': 'whole number',
      'boolean': 'yes/no value',
      'date': 'date',
      'timestamp': 'date and time'
    };

    const typeDesc = typeExplanations[meta.type] || meta.type;
    const nullableDesc = meta.nullable ? ' (can be blank)' : '';

    return `${typeDesc}${nullableDesc}${meta.example ? ` (e.g., ${meta.example})` : ''}`;
  }

  private explainFieldForBusiness(field: string, meta: any): string {
    return meta.description || `${meta.type} field used for ${this.inferBusinessPurpose(field)}`;
  }

  private analyzeFieldForConsultation(field: string, meta: any): string {
    const analysis = [];
    analysis.push(`Type: ${meta.type}, Nullable: ${meta.nullable || false}`);

    if (this.isKeyField(field)) {
      analysis.push('⚠️ Identified as key field - ensure uniqueness');
    }

    if (meta.type === 'string' && !meta.example) {
      analysis.push('💡 Consider adding validation rules or enum constraints');
    }

    return analysis.join(' | ');
  }

  private isKeyField(field: string): boolean {
    return field.toLowerCase().includes('id') || field.toLowerCase().includes('key');
  }

  private inferBusinessPurpose(field: string): string {
    const lowerField = field.toLowerCase();

    if (lowerField.includes('revenue') || lowerField.includes('price')) return 'financial tracking';
    if (lowerField.includes('customer') || lowerField.includes('user')) return 'customer identification';
    if (lowerField.includes('date') || lowerField.includes('time')) return 'temporal tracking';
    if (lowerField.includes('status') || lowerField.includes('state')) return 'workflow management';

    return 'business operations';
  }

  private generateSchemaExamples(schema: DataSchema, userRole: UserRole): string[] {
    const sampleFields = Object.entries(schema).slice(0, 3);

    return sampleFields.map(([field, meta]) => {
      if (userRole === 'technical') {
        return `${field}: ${meta.example || this.generateSampleValue(meta.type)}`;
      }
      return `${this.humanizeFieldName(field)}: ${meta.example || this.generateSampleValue(meta.type)}`;
    });
  }

  private generateSampleValue(type: string): string {
    const samples: Record<string, string> = {
      'string': '"Example Text"',
      'number': '42.5',
      'integer': '100',
      'boolean': 'true',
      'date': '2025-01-06',
      'timestamp': '2025-01-06 10:30:00'
    };
    return samples[type] || 'null';
  }

  private explainRelationshipForNonTech(rel: DataRelationship): string {
    const typeExplanations = {
      'one-to-one': 'connects to exactly one',
      'one-to-many': 'can connect to many',
      'many-to-many': 'can connect to many and vice versa',
      'derived': 'is calculated from'
    };

    const target = rel.targetField ? this.humanizeFieldName(rel.targetField) : 'other information';
    return `${typeExplanations[rel.type]} ${target}`;
  }

  private explainRelationshipForBusiness(rel: DataRelationship): string {
    return rel.description || this.inferBusinessRule(rel);
  }

  private inferBusinessRule(rel: DataRelationship): string {
    if (rel.type === 'derived') {
      return `${this.humanizeFieldName(rel.sourceField)} is calculated field`;
    }
    return `${this.humanizeFieldName(rel.sourceField)} relationship validates business logic`;
  }

  private generateSQLExample(rel: DataRelationship): string {
    if (rel.type === 'derived') {
      return `-- Derived: ${rel.sourceField} calculated from base fields`;
    }
    return `-- JOIN ON ${rel.sourceField}${rel.targetField ? ` = ${rel.targetField}` : ''}`;
  }

  private simplifyComponentName(name: string): string {
    const simplifications: Record<string, string> = {
      'statistical_analysis': 'Analyze patterns in your data',
      'correlation_analysis': 'Find relationships between factors',
      'regression_analysis': 'Predict outcomes',
      'classification': 'Categorize your data',
      'clustering': 'Group similar items together'
    };

    return simplifications[name] || name.replace(/_/g, ' ');
  }

  private explainComponentForNonTech(comp: AnalysisComponent): string {
    if (comp.type === 'statistical_test') {
      return 'We\'ll check if patterns in your data are real or just random.';
    }
    if (comp.type === 'ml_model') {
      return 'We\'ll build a prediction model using your data.';
    }
    if (comp.type === 'visualization') {
      return 'We\'ll create charts to show your results visually.';
    }
    return 'We\'ll process your data to extract insights.';
  }

  private explainComponentForBusiness(comp: AnalysisComponent): string {
    return `${comp.name}: ${comp.technicalDescription} → Impact on business KPIs and decision-making`;
  }

  private explainWhyThisMatters(comp: AnalysisComponent, userRole: UserRole): string {
    if (comp.type === 'statistical_test') {
      return 'This tells you if differences you see are meaningful or just coincidence.';
    }
    if (comp.type === 'ml_model') {
      return 'This helps you predict what might happen in the future.';
    }
    return 'This helps you make better decisions based on facts, not guesses.';
  }

  private mapToKPIs(comp: AnalysisComponent, template: any): string {
    const kpis = template?.businessInsights?.kpiImpact || ['Revenue', 'Cost', 'Efficiency'];
    return `Impacts: ${kpis.slice(0, 3).join(', ')}`;
  }

  private explainTechnicalRationale(comp: AnalysisComponent): string {
    return `Statistical method: ${comp.name}. Validates hypotheses and assumptions.`;
  }

  private estimateTimeForUser(components: AnalysisComponent[], userRole: UserRole): string {
    const baseMinutes = components.length * 5;

    if (userRole === 'non-tech') {
      return `About ${Math.ceil(baseMinutes / 60)} hour${baseMinutes > 60 ? 's' : ''}`;
    }
    return `${baseMinutes}-${baseMinutes * 2} minutes`;
  }

  private generateNonTechSummary(findings: any[], insights: any[]): string {
    if (findings.length === 0) return 'Analysis complete. No significant patterns found.';

    const topFinding = findings[0];
    return `We analyzed your data and found ${findings.length} important patterns. ${this.simplifyFinding(topFinding)}`;
  }

  private generateBusinessSummary(findings: any[], insights: any[], template: any): string {
    const kpiCount = template?.businessInsights?.kpiImpact?.length || 0;
    return `Analysis identified ${findings.length} key findings impacting ${kpiCount} business KPIs. Top insight: ${findings[0]?.title || 'See detailed findings below'}.`;
  }

  private generateTechnicalSummary(findings: any[], insights: any[], results: any): string {
    const testsPerformed = results.executionMetrics?.testsPerformed?.length || 0;
    const avgConfidence = findings.reduce((sum: number, f: any) => sum + (f.confidence || 0), 0) / findings.length;
    return `Executed ${testsPerformed} statistical tests. ${findings.length} findings with average confidence ${(avgConfidence * 100).toFixed(1)}%.`;
  }

  private simplifyFinding(finding: any): string {
    return finding.description?.split('.')[0] || finding.title;
  }

  private explainImpactForNonTech(finding: any): string {
    if (finding.significance === 'high') {
      return 'This is important and should influence your decisions.';
    }
    if (finding.significance === 'medium') {
      return 'This is worth noting and may be useful.';
    }
    return 'This is interesting background information.';
  }

  private quantifyBusinessImpact(finding: any, template: any): string {
    const kpis = template?.businessInsights?.kpiImpact || [];
    if (kpis.length > 0) {
      return `Potential impact on ${kpis[0]} and ${kpis.length - 1} other KPIs`;
    }
    return 'Business impact to be quantified based on your specific metrics';
  }

  private describeTechnicalImpact(finding: any): string {
    return `${finding.category} finding with ${finding.confidence ? (finding.confidence * 100).toFixed(1) + '% confidence' : 'high confidence'}`;
  }

  private isActionable(finding: any): boolean {
    return finding.significance === 'high' || finding.category === 'prediction';
  }

  private generateSimpleRecommendations(findings: any[], template: any): string[] {
    const recs = ['Share these results with your team', 'Focus on the high-priority findings first'];

    if (findings.some(f => f.category === 'anomaly')) {
      recs.push('Investigate the unusual patterns we found');
    }

    return recs;
  }

  private generateBusinessRecommendations(findings: any[], template: any): string[] {
    const recs = template?.businessInsights?.actionableRecommendations || [];

    if (recs.length > 0) return recs;

    return [
      'Implement data-driven changes based on top findings',
      'Set up monitoring for key metrics',
      'Schedule quarterly review of analysis results'
    ];
  }

  private generateTechnicalRecommendations(findings: any[], results: any): string[] {
    const recs = [
      'Validate statistical assumptions before deployment',
      'Document methodology for reproducibility'
    ];

    if (results.model) {
      recs.push('Implement model monitoring and retraining pipeline');
    }

    return recs;
  }

  private explainQualityIssueForNonTech(issue: any): string {
    if (issue.type === 'missing_values') {
      return `${issue.affectedRecords} rows have blank ${this.humanizeFieldName(issue.field || 'fields')} (we can handle this)`;
    }
    if (issue.type === 'invalid_format') {
      return `Some ${this.humanizeFieldName(issue.field || 'fields')} have inconsistent formats (we'll fix this)`;
    }
    if (issue.type === 'duplicates') {
      return `${issue.affectedRecords} duplicate entries found (we'll remove these)`;
    }
    return issue.message;
  }

  private quantifyQualityImpact(issue: any): string {
    const pct = ((issue.affectedRecords / issue.totalRecords) * 100).toFixed(1);
    return `${pct}% of data affected - ${issue.severity} impact on analysis accuracy`;
  }

  private suggestTechnicalFix(issue: any): string {
    if (issue.type === 'missing_values') {
      return issue.action === 'filled_with_default' ? 'Imputation with median/mode' : 'Remove rows with missing values';
    }
    if (issue.type === 'invalid_format') {
      return 'Apply regex pattern validation and standardization';
    }
    if (issue.type === 'duplicates') {
      return 'Deduplicate based on primary key fields';
    }
    return issue.action || 'Manual review required';
  }
}

// Export singleton instance
export const naturalLanguageTranslator = new NaturalLanguageTranslator();
