/**
 * Question validation schemas
 * Used for user questions that drive the analysis
 */

import { z } from 'zod';
import { ComplexityEnum, AnalysisTypeEnum } from './enums';

// ============================================
// INPUT VALIDATION (what API receives)
// ============================================

export const CreateQuestionInput = z.object({
  projectId: z.string().min(1, 'Project ID required').max(50),
  text: z.string()
    .min(5, 'Question must be at least 5 characters')
    .max(1000, 'Question must be at most 1000 characters'),
  context: z.string().max(2000).optional()
});

export const UpdateQuestionInput = z.object({
  text: z.string()
    .min(5, 'Question must be at least 5 characters')
    .max(1000, 'Question must be at most 1000 characters')
    .optional(),
  complexity: ComplexityEnum.optional()
});

export const BulkCreateQuestionsInput = z.object({
  projectId: z.string().min(1).max(50),
  questions: z.array(z.string().min(5).max(1000))
    .min(1, 'At least one question required')
    .max(20, 'Maximum 20 questions allowed')
});

// ============================================
// DATABASE RECORD (what gets stored)
// ============================================

export const QuestionRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  text: z.string(),
  embedding: z.array(z.number()).length(1536).nullable().optional(),
  complexity: ComplexityEnum.nullable().optional(),
  recommendedAnalyses: z.array(AnalysisTypeEnum).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// ============================================
// API RESPONSES (what gets returned)
// ============================================

// Omit embedding from public response (large vector)
export const QuestionResponse = QuestionRecord.omit({ embedding: true });

export const QuestionWithAnalysisResponse = QuestionResponse.extend({
  hasAnswer: z.boolean(),
  answerConfidence: z.number().min(0).max(100).nullable(),
  supportingInsightCount: z.number().int().min(0)
});

export const QuestionsListResponse = z.object({
  questions: z.array(QuestionResponse),
  total: z.number().int().min(0),
  answered: z.number().int().min(0),
  pending: z.number().int().min(0)
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateQuestionInput = z.infer<typeof CreateQuestionInput>;
export type UpdateQuestionInput = z.infer<typeof UpdateQuestionInput>;
export type BulkCreateQuestionsInput = z.infer<typeof BulkCreateQuestionsInput>;
export type QuestionRecord = z.infer<typeof QuestionRecord>;
export type QuestionResponse = z.infer<typeof QuestionResponse>;
export type QuestionWithAnalysisResponse = z.infer<typeof QuestionWithAnalysisResponse>;
export type QuestionsListResponse = z.infer<typeof QuestionsListResponse>;
