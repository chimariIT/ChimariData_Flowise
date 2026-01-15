/**
 * Question-Answer validation schemas
 * Includes evidence chain for traceability
 */

import { z } from 'zod';
import { EvidenceSourceTypeEnum, GenerationSourceEnum } from './enums';

// ============================================
// EVIDENCE CHAIN ENTRY
// ============================================

export const EvidenceChainEntry = z.object({
  id: z.string(),
  answerId: z.string(),
  stepOrder: z.number().int().min(1),

  // Source reference
  sourceType: EvidenceSourceTypeEnum,
  sourceId: z.string(),

  // What happened at this step
  transformationDescription: z.string().nullable(),
  outputSummary: z.string().min(1).max(1000),

  // Confidence at this step
  stepConfidence: z.number().int().min(0).max(100).nullable()
});

// ============================================
// QUESTION ANSWER RECORD
// ============================================

export const QuestionAnswerRecord = z.object({
  id: z.string(),
  questionId: z.string(),

  // Answer content
  answerText: z.string().min(1).max(5000),
  embedding: z.array(z.number()).length(1536).nullable().optional(),

  // Quality
  confidence: z.number().int().min(0).max(100),

  // Formatted versions for different audiences
  executiveSummary: z.string().nullable(),
  technicalDetails: z.string().nullable(),
  supportingData: z.string().nullable(),

  // Generation metadata
  generatedBy: GenerationSourceEnum,
  modelUsed: z.string().nullable(),
  tokensUsed: z.number().int().nullable(),

  // Timestamps
  createdAt: z.date(),
  updatedAt: z.date()
});

// ============================================
// ANSWER-INSIGHT LINK
// ============================================

export const AnswerInsightLink = z.object({
  answerId: z.string(),
  insightId: z.string(),
  relevanceScore: z.number().min(0).max(1).nullable()
});

// ============================================
// API INPUTS
// ============================================

export const CreateAnswerInput = z.object({
  questionId: z.string().min(1),
  answerText: z.string().min(1).max(5000),
  confidence: z.number().int().min(0).max(100),
  generatedBy: GenerationSourceEnum.default('ai'),
  modelUsed: z.string().optional(),

  // Optional formatted versions
  executiveSummary: z.string().optional(),
  technicalDetails: z.string().optional(),
  supportingData: z.string().optional(),

  // Insight references
  insightIds: z.array(z.string()).optional()
});

export const CreateEvidenceChainInput = z.object({
  answerId: z.string().min(1),
  steps: z.array(z.object({
    sourceType: EvidenceSourceTypeEnum,
    sourceId: z.string().min(1),
    transformationDescription: z.string().optional(),
    outputSummary: z.string().min(1).max(1000),
    stepConfidence: z.number().int().min(0).max(100).optional()
  })).min(1)
});

export const UpdateAnswerInput = z.object({
  answerText: z.string().min(1).max(5000).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  executiveSummary: z.string().optional(),
  technicalDetails: z.string().optional(),
  supportingData: z.string().optional()
});

// ============================================
// API RESPONSES
// ============================================

// Omit embedding from public response
export const QuestionAnswerResponse = QuestionAnswerRecord.omit({ embedding: true });

export const AnswerWithEvidenceResponse = QuestionAnswerResponse.extend({
  evidenceChain: z.array(EvidenceChainEntry),
  supportingInsights: z.array(z.object({
    id: z.string(),
    finding: z.string(),
    confidence: z.number(),
    relevanceScore: z.number().nullable()
  }))
});

export const QuestionWithAnswerResponse = z.object({
  questionId: z.string(),
  questionText: z.string(),
  answer: AnswerWithEvidenceResponse.nullable(),
  hasAnswer: z.boolean(),
  confidence: z.number().nullable()
});

export const QABatchResponse = z.object({
  questions: z.array(QuestionWithAnswerResponse),
  totalQuestions: z.number().int(),
  answeredCount: z.number().int(),
  avgConfidence: z.number().nullable()
});

// ============================================
// SEMANTIC SEARCH INPUTS
// ============================================

export const SemanticSearchInput = z.object({
  query: z.string().min(1).max(1000),
  projectId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
  minSimilarity: z.number().min(0).max(1).default(0.7)
});

export const SemanticSearchResult = z.object({
  id: z.string(),
  text: z.string(),
  similarity: z.number().min(0).max(1),
  type: z.enum(['question', 'insight', 'answer']),
  metadata: z.record(z.unknown()).optional()
});

export const SemanticSearchResponse = z.object({
  results: z.array(SemanticSearchResult),
  query: z.string(),
  totalFound: z.number().int()
});

// ============================================
// TYPE EXPORTS
// ============================================

export type EvidenceChainEntry = z.infer<typeof EvidenceChainEntry>;
export type QuestionAnswerRecord = z.infer<typeof QuestionAnswerRecord>;
export type AnswerInsightLink = z.infer<typeof AnswerInsightLink>;
export type CreateAnswerInput = z.infer<typeof CreateAnswerInput>;
export type CreateEvidenceChainInput = z.infer<typeof CreateEvidenceChainInput>;
export type UpdateAnswerInput = z.infer<typeof UpdateAnswerInput>;
export type QuestionAnswerResponse = z.infer<typeof QuestionAnswerResponse>;
export type AnswerWithEvidenceResponse = z.infer<typeof AnswerWithEvidenceResponse>;
export type QuestionWithAnswerResponse = z.infer<typeof QuestionWithAnswerResponse>;
export type QABatchResponse = z.infer<typeof QABatchResponse>;
export type SemanticSearchInput = z.infer<typeof SemanticSearchInput>;
export type SemanticSearchResult = z.infer<typeof SemanticSearchResult>;
export type SemanticSearchResponse = z.infer<typeof SemanticSearchResponse>;
