/**
 * Analysis result validation schemas
 * Normalized statistical fields for queryability
 */

import { z } from 'zod';
import { AnalysisTypeEnum, ImpactEnum } from './enums';

// ============================================
// STATISTICAL RESULT (normalized columns)
// ============================================

export const StatisticalResult = z.object({
  // Core statistical metrics - individual columns, NOT JSONB
  pValue: z.number().min(0).max(1).nullable(),
  coefficient: z.number().nullable(),
  rSquared: z.number().min(0).max(1).nullable(),
  confidenceIntervalLow: z.number().nullable(),
  confidenceIntervalHigh: z.number().nullable(),
  effectSize: z.number().nullable(),
  sampleSize: z.number().int().positive().nullable(),
  degreesOfFreedom: z.number().int().nullable(),
  testStatistic: z.number().nullable(),
  testName: z.string().nullable(),

  // Model metrics (if applicable)
  accuracy: z.number().min(0).max(1).nullable(),
  precisionScore: z.number().min(0).max(1).nullable(),
  recallScore: z.number().min(0).max(1).nullable(),
  f1Score: z.number().min(0).max(1).nullable(),
  aucRoc: z.number().min(0).max(1).nullable(),
  rmse: z.number().nullable(),
  mae: z.number().nullable()
});

// ============================================
// ANALYSIS RESULT RECORD
// ============================================

export const AnalysisResultRecord = z.object({
  id: z.string(),
  executionId: z.string(),
  questionId: z.string().nullable(), // Which question this answers

  // Analysis metadata
  analysisType: AnalysisTypeEnum,

  // Include all statistical metrics
  ...StatisticalResult.shape,

  // Quality
  confidence: z.number().int().min(0).max(100),

  // Python script info
  scriptUsed: z.string().nullable(),
  scriptVersion: z.string().nullable(),

  // Only truly variable data in JSONB
  additionalMetrics: z.record(z.unknown()).optional(),

  createdAt: z.date()
});

// ============================================
// INSIGHT RECORD
// ============================================

export const InsightRecord = z.object({
  id: z.string(),
  analysisResultId: z.string(),

  // The insight text
  finding: z.string().min(1).max(2000),
  embedding: z.array(z.number()).length(1536).nullable().optional(),

  // Quality
  confidence: z.number().int().min(0).max(100),
  impact: ImpactEnum.nullable(),

  // Categorization
  category: z.string().nullable(),
  tags: z.array(z.string()).optional(),

  // Business translation
  businessImplication: z.string().nullable(),
  recommendedAction: z.string().nullable(),

  createdAt: z.date()
});

// ============================================
// API INPUTS
// ============================================

export const CreateAnalysisResultInput = z.object({
  executionId: z.string().min(1),
  questionId: z.string().nullable().optional(),
  analysisType: AnalysisTypeEnum,
  confidence: z.number().int().min(0).max(100),

  // Optional statistical results
  pValue: z.number().min(0).max(1).optional(),
  coefficient: z.number().optional(),
  rSquared: z.number().min(0).max(1).optional(),
  confidenceInterval: z.tuple([z.number(), z.number()]).optional(),
  effectSize: z.number().optional(),
  sampleSize: z.number().int().positive().optional(),

  // Additional metrics
  additionalMetrics: z.record(z.unknown()).optional()
});

export const CreateInsightInput = z.object({
  analysisResultId: z.string().min(1),
  finding: z.string().min(1).max(2000),
  confidence: z.number().int().min(0).max(100),
  impact: ImpactEnum.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  businessImplication: z.string().optional(),
  recommendedAction: z.string().optional()
});

// ============================================
// API RESPONSES
// ============================================

// Omit embedding from public response
export const InsightResponse = InsightRecord.omit({ embedding: true });

export const AnalysisResultWithInsightsResponse = AnalysisResultRecord.extend({
  insights: z.array(InsightResponse)
});

export const AnalysisSummaryResponse = z.object({
  totalResults: z.number().int(),
  byType: z.record(z.number().int()),
  significantFindings: z.number().int(), // p-value < 0.05
  avgConfidence: z.number(),
  insights: z.array(InsightResponse)
});

// ============================================
// FILTER/QUERY INPUTS
// ============================================

export const AnalysisResultsFilter = z.object({
  executionId: z.string().optional(),
  questionId: z.string().optional(),
  analysisType: AnalysisTypeEnum.optional(),
  minConfidence: z.number().int().min(0).max(100).optional(),
  maxPValue: z.number().min(0).max(1).optional(), // Filter significant results
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0)
});

// ============================================
// TYPE EXPORTS
// ============================================

export type StatisticalResult = z.infer<typeof StatisticalResult>;
export type AnalysisResultRecord = z.infer<typeof AnalysisResultRecord>;
export type InsightRecord = z.infer<typeof InsightRecord>;
export type CreateAnalysisResultInput = z.infer<typeof CreateAnalysisResultInput>;
export type CreateInsightInput = z.infer<typeof CreateInsightInput>;
export type InsightResponse = z.infer<typeof InsightResponse>;
export type AnalysisResultWithInsightsResponse = z.infer<typeof AnalysisResultWithInsightsResponse>;
export type AnalysisSummaryResponse = z.infer<typeof AnalysisSummaryResponse>;
export type AnalysisResultsFilter = z.infer<typeof AnalysisResultsFilter>;
