/**
 * Input Validation Service
 *
 * I-1 Fix: Validates and improves user input text for grammar, spelling, and clarity
 * before processing through the analysis pipeline.
 *
 * Key features:
 * - Grammar and spelling validation
 * - Clarity assessment
 * - Context-aware suggestions
 * - Ambiguity detection
 * - Auto-correction option
 *
 * Integrates with:
 * - NaturalLanguageTranslator for grammar checking
 * - ClarificationService for ambiguity detection
 */

import { ChimaridataAI, chimaridataAI } from '../chimaridata-ai';
import { naturalLanguageTranslator } from './natural-language-translator';
import { clarificationService } from './clarification-service';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export type ValidationContext = 'goal' | 'question' | 'description' | 'feedback' | 'note';

export interface ValidationResult {
  isValid: boolean;
  correctedText?: string;
  suggestions?: string[];
  ambiguities?: string[];
  clarityScore: number;
  grammarIssues?: GrammarIssue[];
  spellingIssues?: SpellingIssue[];
}

export interface GrammarIssue {
  position: number;
  length: number;
  issue: string;
  suggestion: string;
  severity: 'error' | 'warning' | 'suggestion';
}

export interface SpellingIssue {
  word: string;
  position: number;
  suggestions: string[];
}

export interface ValidationOptions {
  autoCorrect?: boolean;
  checkGrammar?: boolean;
  checkSpelling?: boolean;
  checkClarity?: boolean;
  checkAmbiguity?: boolean;
  minLength?: number;
  maxLength?: number;
  industry?: string;
  journeyType?: string;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  autoCorrect: false,
  checkGrammar: true,
  checkSpelling: true,
  checkClarity: true,
  checkAmbiguity: true,
  minLength: 10,
  maxLength: 2000
};

// ==========================================
// INPUT VALIDATION SERVICE
// ==========================================

export class InputValidationService {
  private ai: ChimaridataAI;

  constructor(aiService?: ChimaridataAI) {
    this.ai = aiService || chimaridataAI;
  }

  /**
   * Validate and improve text for grammar, spelling, and clarity
   */
  async validateAndImproveText(
    text: string,
    context: ValidationContext,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    console.log(`🔍 [InputValidation] Validating ${context}: "${text.slice(0, 50)}..."`);

    // Basic length validation
    if (text.length < (opts.minLength || 0)) {
      return {
        isValid: false,
        clarityScore: 0,
        suggestions: [`Please provide more detail (minimum ${opts.minLength} characters)`]
      };
    }

    if (text.length > (opts.maxLength || 10000)) {
      return {
        isValid: false,
        clarityScore: 50,
        suggestions: [`Please shorten your input (maximum ${opts.maxLength} characters)`]
      };
    }

    try {
      // Run validations in parallel
      const [grammarResult, ambiguityResult] = await Promise.all([
        opts.checkGrammar ? this.checkGrammarAndSpelling(text, context) : null,
        opts.checkAmbiguity ? this.checkAmbiguity(text, context, opts) : null
      ]);

      // Combine results
      const grammarIssues = grammarResult?.grammarIssues || [];
      const spellingIssues = grammarResult?.spellingIssues || [];
      const ambiguities = ambiguityResult?.ambiguities || [];
      const correctedText = grammarResult?.correctedText;
      const clarityScore = this.calculateClarityScore(text, grammarIssues, ambiguities);

      // Compile suggestions
      const suggestions: string[] = [];

      if (grammarIssues.length > 0) {
        suggestions.push(...grammarIssues
          .filter(i => i.severity !== 'suggestion')
          .map(i => i.suggestion));
      }

      if (ambiguities.length > 0) {
        suggestions.push(...ambiguities.slice(0, 3));
      }

      if (clarityScore < 70) {
        suggestions.push(this.getClaritySuggestion(context, clarityScore));
      }

      // Determine overall validity
      const hasErrors = grammarIssues.some(i => i.severity === 'error');
      const hasHighSeverityAmbiguity = ambiguityResult?.hasHighSeverity || false;
      const isValid = !hasErrors && !hasHighSeverityAmbiguity && clarityScore >= 50;

      const result: ValidationResult = {
        isValid,
        clarityScore,
        grammarIssues: grammarIssues.length > 0 ? grammarIssues : undefined,
        spellingIssues: spellingIssues.length > 0 ? spellingIssues : undefined,
        ambiguities: ambiguities.length > 0 ? ambiguities : undefined,
        suggestions: suggestions.length > 0 ? suggestions : undefined
      };

      // Apply auto-correction if requested and valid corrections exist
      if (opts.autoCorrect && correctedText && correctedText !== text) {
        result.correctedText = correctedText;
      }

      console.log(`✅ [InputValidation] Result: valid=${isValid}, clarity=${clarityScore}%`);
      return result;

    } catch (error: any) {
      console.error('[InputValidation] Validation failed:', error.message);
      // Return permissive result on error - don't block the flow
      return {
        isValid: true,
        clarityScore: 70,
        suggestions: ['Unable to fully validate input - please review for accuracy']
      };
    }
  }

  /**
   * Quick validation without AI calls (for real-time feedback)
   */
  quickValidate(
    text: string,
    context: ValidationContext,
    options: ValidationOptions = {}
  ): ValidationResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Length check
    if (text.length < (opts.minLength || 0)) {
      return {
        isValid: false,
        clarityScore: 0,
        suggestions: [`Please provide at least ${opts.minLength} characters`]
      };
    }

    // Basic pattern checks
    const issues: string[] = [];
    const words = text.split(/\s+/);

    // Check for very short sentences
    if (words.length < 3 && context === 'goal') {
      issues.push('Analysis goals typically need more detail');
    }

    // Check for questions without question marks
    if (context === 'question' && !text.includes('?')) {
      issues.push('Consider phrasing your input as a question');
    }

    // Check for vague terms
    const vagueTerms = ['thing', 'stuff', 'something', 'somehow', 'whatever'];
    const foundVague = vagueTerms.filter(term =>
      text.toLowerCase().includes(term)
    );
    if (foundVague.length > 0) {
      issues.push(`Consider replacing vague terms: ${foundVague.join(', ')}`);
    }

    // Check capitalization
    if (text[0] !== text[0].toUpperCase()) {
      issues.push('Consider starting with a capital letter');
    }

    // Calculate basic clarity
    const clarityScore = Math.max(50, 100 - issues.length * 15);

    return {
      isValid: issues.length === 0,
      clarityScore,
      suggestions: issues.length > 0 ? issues : undefined
    };
  }

  /**
   * Check grammar and spelling using AI
   */
  private async checkGrammarAndSpelling(
    text: string,
    context: ValidationContext
  ): Promise<{
    correctedText?: string;
    grammarIssues: GrammarIssue[];
    spellingIssues: SpellingIssue[];
  }> {
    try {
      const result = await naturalLanguageTranslator.checkGrammarWithAI(text);

      if (result.success && result.data) {
        const grammarIssues: GrammarIssue[] = result.data.changes.map((change, idx) => ({
          position: 0, // AI doesn't provide exact positions
          length: 0,
          issue: change,
          suggestion: change,
          severity: 'warning' as const
        }));

        return {
          correctedText: result.data.corrected,
          grammarIssues,
          spellingIssues: []
        };
      }

      return { grammarIssues: [], spellingIssues: [] };
    } catch (error) {
      console.warn('[InputValidation] Grammar check failed:', error);
      return { grammarIssues: [], spellingIssues: [] };
    }
  }

  /**
   * Check for ambiguities using ClarificationService
   */
  private async checkAmbiguity(
    text: string,
    context: ValidationContext,
    options: ValidationOptions
  ): Promise<{
    ambiguities: string[];
    hasHighSeverity: boolean;
  }> {
    try {
      const detectionContext = {
        journeyType: options.journeyType || 'analysis',
        industry: options.industry
      };

      // Map our context to ClarificationService context
      const clarificationContext = context === 'goal' ? 'goal'
        : context === 'question' ? 'question'
        : 'description';

      const result = await clarificationService.detectAmbiguities(
        text,
        detectionContext,
        clarificationContext
      );

      if (result.hasAmbiguities) {
        const ambiguities = result.questions.map(q =>
          q.helpText || `Consider clarifying: ${q.relatedField}`
        );

        const hasHighSeverity = result.questions.some(q => q.severity === 'high');

        return { ambiguities, hasHighSeverity };
      }

      return { ambiguities: [], hasHighSeverity: false };
    } catch (error) {
      console.warn('[InputValidation] Ambiguity check failed:', error);
      return { ambiguities: [], hasHighSeverity: false };
    }
  }

  /**
   * Calculate clarity score based on issues found
   */
  private calculateClarityScore(
    text: string,
    grammarIssues: GrammarIssue[],
    ambiguities: string[]
  ): number {
    let score = 100;

    // Deduct for grammar issues
    const errorCount = grammarIssues.filter(i => i.severity === 'error').length;
    const warningCount = grammarIssues.filter(i => i.severity === 'warning').length;
    score -= errorCount * 15;
    score -= warningCount * 5;

    // Deduct for ambiguities
    score -= ambiguities.length * 10;

    // Deduct for very short text
    if (text.length < 20) {
      score -= 10;
    }

    // Deduct for lack of punctuation
    if (!text.includes('.') && !text.includes('?') && text.length > 50) {
      score -= 5;
    }

    // Bonus for well-structured text
    if (text.includes(',') && text.includes('.')) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get context-specific clarity suggestion
   */
  private getClaritySuggestion(context: ValidationContext, score: number): string {
    const suggestions: Record<ValidationContext, string[]> = {
      goal: [
        'Consider specifying what metrics or outcomes you want to measure',
        'Add more detail about the time period or scope of analysis',
        'Clarify what business question this analysis should answer'
      ],
      question: [
        'Make sure your question is specific and measurable',
        'Consider adding context about what data you have available',
        'Rephrase as a yes/no question or specify the comparison you want'
      ],
      description: [
        'Add more context about the project objectives',
        'Include information about stakeholders or audience',
        'Specify any constraints or requirements'
      ],
      feedback: [
        'Be specific about what worked or didn\'t work',
        'Provide examples if possible',
        'Suggest improvements if applicable'
      ],
      note: [
        'Add context for future reference',
        'Include any relevant dates or milestones',
        'Link to related items if applicable'
      ]
    };

    const contextSuggestions = suggestions[context];
    const index = Math.floor((100 - score) / 35) % contextSuggestions.length;
    return contextSuggestions[index];
  }

  /**
   * Validate multiple inputs at once (batch validation)
   */
  async validateBatch(
    inputs: Array<{ text: string; context: ValidationContext }>,
    options: ValidationOptions = {}
  ): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    // Process in parallel
    const validationPromises = inputs.map(async (input, index) => {
      const result = await this.validateAndImproveText(
        input.text,
        input.context,
        options
      );
      return { key: `${index}:${input.context}`, result };
    });

    const resolvedResults = await Promise.all(validationPromises);

    for (const { key, result } of resolvedResults) {
      results.set(key, result);
    }

    return results;
  }
}

// Export singleton instance
export const inputValidationService = new InputValidationService();
