/**
 * useTranslation Hook
 *
 * Provides AI-powered translation capabilities for the frontend.
 * Translates technical content to audience-appropriate language.
 *
 * Features:
 * - Schema translation to business terms
 * - Analysis results translation
 * - Data quality metrics translation
 * - Error message humanization
 * - Term clarification
 * - Grammar checking
 * - Caching (server-side)
 */

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';

// Audience types
export type AudienceType = 'executive' | 'business' | 'technical' | 'general';

// Translation result types
export interface SchemaTranslation {
  originalField: string;
  businessName: string;
  description: string;
  dataType: string;
  businessContext: string;
  examples?: string[];
}

export interface ResultsTranslation {
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

export interface QualityTranslation {
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

export interface ErrorTranslation {
  message: string;
  suggestion: string;
  technical?: string;
}

export interface TermClarification {
  explanation: string;
  example?: string;
}

export interface GrammarCheck {
  corrected: string;
  changes: string[];
}

interface TranslationResponse<T> {
  success: boolean;
  data?: T;
  cached: boolean;
  provider?: string;
  error?: string;
}

// Hook options
interface UseTranslationOptions {
  projectId: string;
  industry?: string;
  defaultAudience?: AudienceType;
}

export function useTranslation(options: UseTranslationOptions) {
  const { projectId, industry, defaultAudience = 'business' } = options;
  const [audience, setAudience] = useState<AudienceType>(defaultAudience);
  const queryClient = useQueryClient();

  // Generic translation mutation
  const translateMutation = useMutation({
    mutationFn: async ({ type, content, targetAudience }: {
      type: 'schema' | 'results' | 'quality' | 'error';
      content: any;
      targetAudience?: AudienceType;
    }) => {
      const response = await apiClient.post(`/api/projects/${projectId}/translate`, {
        type,
        content,
        audience: targetAudience || audience,
        industry
      });
      return response as TranslationResponse<any>;
    }
  });

  // Term clarification mutation
  const clarifyTermMutation = useMutation({
    mutationFn: async ({ term, context, targetAudience }: {
      term: string;
      context?: string;
      targetAudience?: AudienceType;
    }) => {
      const response = await apiClient.post(`/api/projects/${projectId}/clarify-term`, {
        term,
        context,
        audience: targetAudience || audience
      });
      return response as TranslationResponse<TermClarification>;
    }
  });

  // Grammar check mutation
  const grammarCheckMutation = useMutation({
    mutationFn: async ({ text }: { text: string }) => {
      const response = await apiClient.post(`/api/projects/${projectId}/check-grammar`, {
        text
      });
      return response as TranslationResponse<GrammarCheck>;
    }
  });

  // Translate schema
  const translateSchema = useCallback(async (
    schema: Record<string, any>,
    targetAudience?: AudienceType
  ): Promise<SchemaTranslation[] | null> => {
    try {
      const result = await translateMutation.mutateAsync({
        type: 'schema',
        content: schema,
        targetAudience
      });
      return result.success ? result.data : null;
    } catch (error) {
      console.error('[useTranslation] Schema translation failed:', error);
      return null;
    }
  }, [translateMutation]);

  // Translate results
  const translateResults = useCallback(async (
    results: any,
    targetAudience?: AudienceType
  ): Promise<ResultsTranslation | null> => {
    try {
      const result = await translateMutation.mutateAsync({
        type: 'results',
        content: results,
        targetAudience
      });
      return result.success ? result.data : null;
    } catch (error) {
      console.error('[useTranslation] Results translation failed:', error);
      return null;
    }
  }, [translateMutation]);

  // Translate quality metrics
  const translateQuality = useCallback(async (
    qualityReport: any,
    targetAudience?: AudienceType
  ): Promise<QualityTranslation | null> => {
    try {
      const result = await translateMutation.mutateAsync({
        type: 'quality',
        content: qualityReport,
        targetAudience
      });
      return result.success ? result.data : null;
    } catch (error) {
      console.error('[useTranslation] Quality translation failed:', error);
      return null;
    }
  }, [translateMutation]);

  // Translate error
  const translateError = useCallback(async (
    error: string | Error,
    targetAudience?: AudienceType
  ): Promise<ErrorTranslation | null> => {
    try {
      const errorStr = error instanceof Error ? error.message : error;
      const result = await translateMutation.mutateAsync({
        type: 'error',
        content: errorStr,
        targetAudience
      });
      return result.success ? result.data : null;
    } catch (err) {
      console.error('[useTranslation] Error translation failed:', err);
      return null;
    }
  }, [translateMutation]);

  // Clarify term
  const clarifyTerm = useCallback(async (
    term: string,
    context?: string,
    targetAudience?: AudienceType
  ): Promise<TermClarification | null> => {
    try {
      const result = await clarifyTermMutation.mutateAsync({
        term,
        context,
        targetAudience
      });
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('[useTranslation] Term clarification failed:', error);
      return null;
    }
  }, [clarifyTermMutation]);

  // Check grammar
  const checkGrammar = useCallback(async (
    text: string
  ): Promise<GrammarCheck | null> => {
    try {
      const result = await grammarCheckMutation.mutateAsync({ text });
      return result.success && result.data ? result.data : null;
    } catch (error) {
      console.error('[useTranslation] Grammar check failed:', error);
      return null;
    }
  }, [grammarCheckMutation]);

  return {
    // State
    audience,
    setAudience,

    // Translation methods
    translateSchema,
    translateResults,
    translateQuality,
    translateError,
    clarifyTerm,
    checkGrammar,

    // Loading states
    isTranslating: translateMutation.isPending,
    isClarifying: clarifyTermMutation.isPending,
    isCheckingGrammar: grammarCheckMutation.isPending,

    // Error states
    translationError: translateMutation.error,
    clarificationError: clarifyTermMutation.error,
    grammarError: grammarCheckMutation.error
  };
}

/**
 * Utility hook for simple one-off translations
 */
export function useSimpleTranslation() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = useCallback(async (
    projectId: string,
    type: 'schema' | 'results' | 'quality' | 'error',
    content: any,
    audience: AudienceType = 'business',
    industry?: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post(`/api/projects/${projectId}/translate`, {
        type,
        content,
        audience,
        industry
      }) as TranslationResponse<any>;

      if (!response.success) {
        setError(response.error || 'Translation failed');
        return null;
      }

      return response.data;
    } catch (err: any) {
      setError(err.message || 'Translation request failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { translate, isLoading, error };
}

/**
 * Helper to get audience label for display
 */
export function getAudienceLabel(audience: AudienceType): string {
  const labels: Record<AudienceType, string> = {
    executive: 'Executive View',
    business: 'Business View',
    technical: 'Technical View',
    general: 'Simple View'
  };
  return labels[audience] || 'Business View';
}

/**
 * Helper to get audience description
 */
export function getAudienceDescription(audience: AudienceType): string {
  const descriptions: Record<AudienceType, string> = {
    executive: 'High-level strategic insights for leadership',
    business: 'Actionable insights for business stakeholders',
    technical: 'Detailed technical analysis and methodology',
    general: 'Clear, accessible summary for all audiences'
  };
  return descriptions[audience] || 'Actionable insights';
}
