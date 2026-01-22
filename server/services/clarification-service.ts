/**
 * Clarification Service
 *
 * Detects ambiguities in user input and generates clarifying questions.
 * This is a critical component for the u2a2a2u pattern - ensuring agents
 * have complete information before proceeding with analysis.
 *
 * Key features:
 * - Ambiguity detection in goals, questions, and descriptions
 * - Context-aware question generation
 * - Multiple question types (multiple choice, free text, yes/no)
 * - Integration with PM Agent workflow
 * - Persistent storage of pending clarifications
 */

import { nanoid } from 'nanoid';
import { ChimaridataAI, chimaridataAI } from '../chimaridata-ai';
import { storage } from '../storage';

// ==========================================
// TYPES AND INTERFACES
// ==========================================

export type QuestionType = 'multiple_choice' | 'free_text' | 'yes_no' | 'numeric' | 'date_range';
export type ClarificationContext = 'goal' | 'question' | 'description' | 'data_element' | 'analysis_type';
export type AmbiguitySeverity = 'high' | 'medium' | 'low';

export interface ClarificationQuestion {
  id: string;
  question: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  context: ClarificationContext;
  severity: AmbiguitySeverity;
  relatedField?: string;
  defaultValue?: string;
  helpText?: string;
  validationRules?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface ClarificationAnswer {
  questionId: string;
  answer: string | string[] | number | boolean;
  answeredAt: string;
  modifiedOriginal?: boolean;
}

export interface ClarificationRequest {
  projectId: string;
  questions: ClarificationQuestion[];
  originalInput: string;
  inputType: ClarificationContext;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'answered' | 'expired' | 'skipped';
}

export interface ClarificationResult {
  hasAmbiguities: boolean;
  questions: ClarificationQuestion[];
  confidenceScore: number;
  originalInput: string;
  suggestedRevision?: string;
}

export interface DetectionContext {
  industry?: string;
  journeyType: string;
  existingColumns?: string[];
  userRole?: string;
  previousAnswers?: ClarificationAnswer[];
  projectGoals?: string[];
}

export interface AmbiguityAnalysis {
  term: string;
  issue: string;
  severity: AmbiguitySeverity;
  suggestedQuestion: string;
  questionType: QuestionType;
  options?: string[];
}

// ==========================================
// CLARIFICATION SERVICE
// ==========================================

export class ClarificationService {
  private ai: ChimaridataAI;

  constructor(aiService?: ChimaridataAI) {
    this.ai = aiService || chimaridataAI;
  }

  // ==========================================
  // AMBIGUITY DETECTION
  // ==========================================

  /**
   * Detect ambiguities in user input and generate clarifying questions
   */
  async detectAmbiguities(
    userInput: string,
    context: DetectionContext,
    inputType: ClarificationContext = 'goal'
  ): Promise<ClarificationResult> {
    console.log(`🔍 [Clarification] Analyzing ${inputType}: "${userInput.slice(0, 100)}..."`);

    try {
      const prompt = this.buildDetectionPrompt(userInput, context, inputType);
      const result = await this.ai.generateText({ prompt, temperature: 0.3 });
      const analysis = this.parseDetectionResponse(result.text, userInput, inputType);

      console.log(`✅ [Clarification] Found ${analysis.questions.length} potential ambiguities`);

      return analysis;
    } catch (error: any) {
      console.error('[Clarification] Detection failed:', error.message);
      // Return no ambiguities on error - don't block the flow
      return {
        hasAmbiguities: false,
        questions: [],
        confidenceScore: 0.5,
        originalInput: userInput
      };
    }
  }

  private buildDetectionPrompt(
    userInput: string,
    context: DetectionContext,
    inputType: ClarificationContext
  ): string {
    const contextInfo = [
      context.industry ? `Industry: ${context.industry}` : null,
      context.journeyType ? `Journey Type: ${context.journeyType}` : null,
      context.userRole ? `User Role: ${context.userRole}` : null,
      context.existingColumns?.length ? `Available Data Columns: ${context.existingColumns.slice(0, 20).join(', ')}` : null,
      context.projectGoals?.length ? `Stated Goals: ${context.projectGoals.join('; ')}` : null
    ].filter(Boolean).join('\n');

    const inputTypePrompts: Record<ClarificationContext, string> = {
      goal: 'This is an analysis goal. Check for unclear objectives, missing success metrics, undefined terms, or ambiguous scope.',
      question: 'This is a business question. Check for undefined metrics, unclear time periods, missing comparison points, or vague terms.',
      description: 'This is a project description. Check for unclear scope, missing stakeholders, undefined deliverables, or ambiguous requirements.',
      data_element: 'This is a data element definition. Check for unclear data types, missing units, undefined relationships, or ambiguous meanings.',
      analysis_type: 'This is an analysis type selection. Check for unclear methodology, missing parameters, undefined outputs, or scope ambiguity.'
    };

    return `You are a data analysis requirements analyst. Your job is to identify what information is missing or unclear in user input BEFORE proceeding with analysis.

CONTEXT:
${contextInfo}

INPUT TYPE: ${inputType}
${inputTypePrompts[inputType]}

USER INPUT:
"${userInput}"

TASK: Analyze this input for ambiguities, missing information, or unclear terms that could lead to incorrect analysis.

For each ambiguity found, determine:
1. What is unclear or missing
2. How severe is this (high = blocks analysis, medium = may affect accuracy, low = nice to clarify)
3. A clear question to ask the user
4. Whether this should be multiple choice, free text, yes/no, numeric, or date range
5. If multiple choice, provide 2-5 sensible options

Return a JSON object:
{
  "hasAmbiguities": boolean,
  "confidenceScore": 0-1 (how confident you are the input is complete),
  "ambiguities": [
    {
      "term": "the unclear term or concept",
      "issue": "what's unclear about it",
      "severity": "high" | "medium" | "low",
      "suggestedQuestion": "question to ask user",
      "questionType": "multiple_choice" | "free_text" | "yes_no" | "numeric" | "date_range",
      "options": ["option1", "option2"] // only for multiple_choice
    }
  ],
  "suggestedRevision": "optional - a clearer version of the input if obvious improvements exist"
}

IMPORTANT RULES:
- Only flag GENUINE ambiguities that would affect analysis quality
- Don't ask questions if the answer is obvious from context
- Limit to 3 most important questions maximum
- For non-technical users, use simple language in questions
- If the input is clear enough to proceed, set hasAmbiguities: false

Respond with ONLY the JSON object.`;
  }

  private parseDetectionResponse(
    response: string,
    originalInput: string,
    inputType: ClarificationContext
  ): ClarificationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createEmptyResult(originalInput);
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const questions: ClarificationQuestion[] = (parsed.ambiguities || []).map((amb: AmbiguityAnalysis) => ({
        id: nanoid(),
        question: amb.suggestedQuestion,
        type: amb.questionType || 'free_text',
        options: amb.options,
        required: amb.severity === 'high',
        context: inputType,
        severity: amb.severity || 'medium',
        relatedField: amb.term,
        helpText: amb.issue
      }));

      return {
        hasAmbiguities: parsed.hasAmbiguities || questions.length > 0,
        questions,
        confidenceScore: parsed.confidenceScore || (questions.length > 0 ? 0.6 : 0.9),
        originalInput,
        suggestedRevision: parsed.suggestedRevision
      };
    } catch (e) {
      console.warn('[Clarification] Failed to parse response, assuming no ambiguities');
      return this.createEmptyResult(originalInput);
    }
  }

  private createEmptyResult(originalInput: string): ClarificationResult {
    return {
      hasAmbiguities: false,
      questions: [],
      confidenceScore: 0.8,
      originalInput
    };
  }

  // ==========================================
  // CLARIFICATION REQUEST MANAGEMENT
  // ==========================================

  /**
   * Create and store a clarification request for a project
   */
  async createClarificationRequest(
    projectId: string,
    questions: ClarificationQuestion[],
    originalInput: string,
    inputType: ClarificationContext
  ): Promise<ClarificationRequest> {
    const request: ClarificationRequest = {
      projectId,
      questions,
      originalInput,
      inputType,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h expiry
      status: 'pending'
    };

    // Store in project's journeyProgress
    const project = await storage.getProject(projectId);
    if (project) {
      const journeyProgress = (project as any).journeyProgress || {};
      await storage.updateProject(projectId, {
        journeyProgress: {
          ...journeyProgress,
          pendingClarifications: request,
          awaitingUserInput: true
        }
      } as any);

      console.log(`📋 [Clarification] Created request with ${questions.length} questions for project ${projectId}`);
    }

    return request;
  }

  /**
   * Get pending clarification request for a project
   */
  async getPendingClarifications(projectId: string): Promise<ClarificationRequest | null> {
    const project = await storage.getProject(projectId);
    if (!project) return null;

    const pending = (project as any).journeyProgress?.pendingClarifications;
    if (!pending || pending.status !== 'pending') return null;

    // Check if expired
    if (new Date(pending.expiresAt) < new Date()) {
      await this.markClarificationExpired(projectId);
      return null;
    }

    return pending;
  }

  /**
   * Submit answers to clarification questions
   */
  async submitClarificationAnswers(
    projectId: string,
    answers: ClarificationAnswer[]
  ): Promise<{
    success: boolean;
    revisedInput?: string;
    remainingQuestions?: ClarificationQuestion[];
  }> {
    const project = await storage.getProject(projectId);
    if (!project) {
      return { success: false };
    }

    const pending = (project as any).journeyProgress?.pendingClarifications;
    if (!pending) {
      return { success: false };
    }

    // Check if all required questions are answered
    const requiredQuestions = pending.questions.filter((q: ClarificationQuestion) => q.required);
    const answeredIds = new Set(answers.map(a => a.questionId));
    const unansweredRequired = requiredQuestions.filter((q: ClarificationQuestion) => !answeredIds.has(q.id));

    if (unansweredRequired.length > 0) {
      return {
        success: false,
        remainingQuestions: unansweredRequired
      };
    }

    // Generate revised input incorporating answers
    const revisedInput = await this.generateRevisedInput(
      pending.originalInput,
      pending.questions,
      answers
    );

    // Update project
    const journeyProgress = (project as any).journeyProgress || {};
    await storage.updateProject(projectId, {
      journeyProgress: {
        ...journeyProgress,
        pendingClarifications: {
          ...pending,
          status: 'answered',
          answers,
          answeredAt: new Date().toISOString()
        },
        clarificationHistory: [
          ...(journeyProgress.clarificationHistory || []),
          {
            originalInput: pending.originalInput,
            questions: pending.questions,
            answers,
            revisedInput,
            completedAt: new Date().toISOString()
          }
        ],
        awaitingUserInput: false
      }
    } as any);

    console.log(`✅ [Clarification] Answers submitted for project ${projectId}`);

    return {
      success: true,
      revisedInput
    };
  }

  /**
   * Skip clarification (user chooses to proceed anyway)
   */
  async skipClarification(projectId: string): Promise<boolean> {
    const project = await storage.getProject(projectId);
    if (!project) return false;

    const journeyProgress = (project as any).journeyProgress || {};
    const pending = journeyProgress.pendingClarifications;

    if (!pending) return false;

    await storage.updateProject(projectId, {
      journeyProgress: {
        ...journeyProgress,
        pendingClarifications: {
          ...pending,
          status: 'skipped',
          skippedAt: new Date().toISOString()
        },
        awaitingUserInput: false
      }
    } as any);

    console.log(`⏭️ [Clarification] Skipped for project ${projectId}`);
    return true;
  }

  private async markClarificationExpired(projectId: string): Promise<void> {
    const project = await storage.getProject(projectId);
    if (!project) return;

    const journeyProgress = (project as any).journeyProgress || {};
    await storage.updateProject(projectId, {
      journeyProgress: {
        ...journeyProgress,
        pendingClarifications: {
          ...journeyProgress.pendingClarifications,
          status: 'expired'
        },
        awaitingUserInput: false
      }
    } as any);
  }

  // ==========================================
  // INPUT REVISION
  // ==========================================

  /**
   * Generate a revised input incorporating clarification answers
   */
  private async generateRevisedInput(
    originalInput: string,
    questions: ClarificationQuestion[],
    answers: ClarificationAnswer[]
  ): Promise<string> {
    const answerMap = new Map(answers.map(a => [a.questionId, a.answer]));

    const clarifications = questions
      .map(q => {
        const answer = answerMap.get(q.id);
        if (!answer) return null;
        return `- ${q.relatedField || 'Clarification'}: ${answer}`;
      })
      .filter(Boolean)
      .join('\n');

    if (!clarifications) {
      return originalInput;
    }

    try {
      const prompt = `Revise this analysis goal/question to incorporate the clarifications provided.

ORIGINAL INPUT:
"${originalInput}"

CLARIFICATIONS PROVIDED:
${clarifications}

Create a revised, more specific version that incorporates these clarifications naturally.
Keep the same intent but make it more precise.

Return ONLY the revised text, no explanation.`;

      const result = await this.ai.generateText({ prompt, temperature: 0.3 });
      return result.text.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
    } catch (e) {
      // Fallback: append clarifications
      return `${originalInput}\n\nClarifications:\n${clarifications}`;
    }
  }

  // ==========================================
  // VALIDATION HELPERS
  // ==========================================

  /**
   * Validate a single user input without creating a request
   */
  async validateInput(
    input: string,
    context: DetectionContext,
    inputType: ClarificationContext = 'goal'
  ): Promise<{
    isValid: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const result = await this.detectAmbiguities(input, context, inputType);

    return {
      isValid: !result.hasAmbiguities || result.questions.every(q => !q.required),
      issues: result.questions.filter(q => q.required).map(q => q.helpText || q.question),
      suggestions: result.questions.filter(q => !q.required).map(q => q.question)
    };
  }

  /**
   * Check if project has pending clarifications
   */
  async hasPendingClarifications(projectId: string): Promise<boolean> {
    const pending = await this.getPendingClarifications(projectId);
    return pending !== null && pending.status === 'pending';
  }

  /**
   * Get clarification history for a project
   */
  async getClarificationHistory(projectId: string): Promise<any[]> {
    const project = await storage.getProject(projectId);
    if (!project) return [];

    return (project as any).journeyProgress?.clarificationHistory || [];
  }
}

// Export singleton instance
export const clarificationService = new ClarificationService();
