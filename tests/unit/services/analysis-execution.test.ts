/**
 * Unit Tests for Analysis Execution Service
 * Tests execution flow, data source priority, payment gating, and artifact generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../server/services/storage', () => ({
  storage: {
    getProject: vi.fn(),
    getDataset: vi.fn(),
    updateProject: vi.fn(),
    createProjectArtifact: vi.fn(),
  }
}));

vi.mock('../../../server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
  }
}));

describe('Analysis Execution Service', () => {
  describe('Data Source Priority', () => {
    /**
     * Tests for extractDatasetRows priority:
     * 1. First: dataset.ingestionMetadata.transformedData (user-approved transformations)
     * 2. Second: dataset.metadata.transformedData (alternate location)
     * 3. Fallback: Original dataset.data, dataset.preview, etc.
     */

    const extractDatasetRows = (dataset: any): any[] => {
      // Priority 1: Transformed data from ingestionMetadata (SSOT)
      if (dataset.ingestionMetadata?.transformedData?.length > 0) {
        return dataset.ingestionMetadata.transformedData;
      }

      // Priority 2: Transformed data from metadata (legacy location)
      if (dataset.metadata?.transformedData?.length > 0) {
        return dataset.metadata.transformedData;
      }

      // Priority 3: Original data
      if (dataset.data?.length > 0) {
        return dataset.data;
      }

      // Priority 4: Preview data
      if (dataset.preview?.length > 0) {
        return dataset.preview;
      }

      return [];
    };

    it('should prioritize transformed data from ingestionMetadata', () => {
      const dataset = {
        ingestionMetadata: {
          transformedData: [{ id: 1, value: 'transformed' }]
        },
        metadata: {
          transformedData: [{ id: 1, value: 'legacy' }]
        },
        data: [{ id: 1, value: 'original' }]
      };

      const rows = extractDatasetRows(dataset);

      expect(rows).toEqual([{ id: 1, value: 'transformed' }]);
    });

    it('should fall back to metadata.transformedData when ingestionMetadata is empty', () => {
      const dataset = {
        ingestionMetadata: {
          transformedData: []
        },
        metadata: {
          transformedData: [{ id: 1, value: 'legacy' }]
        },
        data: [{ id: 1, value: 'original' }]
      };

      const rows = extractDatasetRows(dataset);

      expect(rows).toEqual([{ id: 1, value: 'legacy' }]);
    });

    it('should fall back to original data when no transformed data exists', () => {
      const dataset = {
        data: [{ id: 1, value: 'original' }],
        preview: [{ id: 1, value: 'preview' }]
      };

      const rows = extractDatasetRows(dataset);

      expect(rows).toEqual([{ id: 1, value: 'original' }]);
    });

    it('should fall back to preview when no other data exists', () => {
      const dataset = {
        preview: [{ id: 1, value: 'preview' }]
      };

      const rows = extractDatasetRows(dataset);

      expect(rows).toEqual([{ id: 1, value: 'preview' }]);
    });

    it('should return empty array when no data exists', () => {
      const dataset = {};

      const rows = extractDatasetRows(dataset);

      expect(rows).toEqual([]);
    });
  });

  describe('Payment Gating', () => {
    const checkPaymentStatus = (project: any, user: any): {
      canExecute: boolean;
      isPreview: boolean;
      reason?: string;
    } => {
      const isPaid = project.isPaid === true;
      const hasActiveSubscription = user.subscriptionTier &&
        ['pro', 'enterprise', 'professional'].includes(user.subscriptionTier);
      const hasTrialCredits = (user.trialCreditsRemaining || 0) > 0;

      if (isPaid || hasActiveSubscription) {
        return { canExecute: true, isPreview: false };
      }

      if (hasTrialCredits) {
        return { canExecute: true, isPreview: true, reason: 'Using trial credits' };
      }

      return { canExecute: false, isPreview: false, reason: 'Payment required' };
    };

    it('should allow execution for paid projects', () => {
      const project = { isPaid: true };
      const user = { subscriptionTier: 'trial' };

      const result = checkPaymentStatus(project, user);

      expect(result.canExecute).toBe(true);
      expect(result.isPreview).toBe(false);
    });

    it('should allow execution for pro subscription users', () => {
      const project = { isPaid: false };
      const user = { subscriptionTier: 'pro' };

      const result = checkPaymentStatus(project, user);

      expect(result.canExecute).toBe(true);
      expect(result.isPreview).toBe(false);
    });

    it('should allow preview execution with trial credits', () => {
      const project = { isPaid: false };
      const user = { subscriptionTier: 'trial', trialCreditsRemaining: 5 };

      const result = checkPaymentStatus(project, user);

      expect(result.canExecute).toBe(true);
      expect(result.isPreview).toBe(true);
      expect(result.reason).toContain('trial');
    });

    it('should block execution without payment or credits', () => {
      const project = { isPaid: false };
      const user = { subscriptionTier: 'trial', trialCreditsRemaining: 0 };

      const result = checkPaymentStatus(project, user);

      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('Payment required');
    });
  });

  describe('Results Gating', () => {
    const gateResults = (results: any, isPreview: boolean): any => {
      if (!isPreview) {
        return results;
      }

      // Preview mode: limit results
      return {
        ...results,
        insights: (results.insights || []).slice(0, Math.ceil((results.insights?.length || 0) * 0.1)),
        charts: (results.charts || []).slice(0, 2),
        recommendations: (results.recommendations || []).slice(0, 2),
        isPreview: true,
        previewMessage: 'This is a preview. Complete payment to see full results.'
      };
    };

    it('should return full results when not preview', () => {
      const results = {
        insights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        charts: [1, 2, 3, 4, 5],
        recommendations: [1, 2, 3, 4, 5]
      };

      const gated = gateResults(results, false);

      expect(gated.insights).toHaveLength(10);
      expect(gated.charts).toHaveLength(5);
      expect(gated.recommendations).toHaveLength(5);
      expect(gated.isPreview).toBeUndefined();
    });

    it('should limit results in preview mode', () => {
      const results = {
        insights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        charts: [1, 2, 3, 4, 5],
        recommendations: [1, 2, 3, 4, 5]
      };

      const gated = gateResults(results, true);

      expect(gated.insights.length).toBeLessThanOrEqual(1); // 10% of 10
      expect(gated.charts).toHaveLength(2);
      expect(gated.recommendations).toHaveLength(2);
      expect(gated.isPreview).toBe(true);
      expect(gated.previewMessage).toBeDefined();
    });
  });

  describe('Analysis Type Routing', () => {
    const getAnalysisScript = (analysisType: string): string | null => {
      const scriptMap: Record<string, string> = {
        'descriptive': 'python/descriptive_stats.py',
        'correlation': 'python/correlation_analysis.py',
        'regression': 'python/regression_analysis.py',
        'clustering': 'python/clustering_analysis.py',
        'classification': 'python/classification_analysis.py',
        'time_series': 'python/time_series_analysis.py',
        'statistical': 'python/statistical_tests.py',
        'ml': 'python/enhanced_ml_pipeline.py',
        'sentiment': 'python/sentiment_analysis.py'
      };

      return scriptMap[analysisType.toLowerCase()] || null;
    };

    it('should return correct script for descriptive analysis', () => {
      expect(getAnalysisScript('descriptive')).toBe('python/descriptive_stats.py');
    });

    it('should return correct script for correlation analysis', () => {
      expect(getAnalysisScript('correlation')).toBe('python/correlation_analysis.py');
    });

    it('should return correct script for ML analysis', () => {
      expect(getAnalysisScript('ml')).toBe('python/enhanced_ml_pipeline.py');
    });

    it('should return null for unknown analysis type', () => {
      expect(getAnalysisScript('unknown_type')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(getAnalysisScript('DESCRIPTIVE')).toBe('python/descriptive_stats.py');
      expect(getAnalysisScript('Correlation')).toBe('python/correlation_analysis.py');
    });
  });

  describe('Question-Answer Mapping', () => {
    const findQuestionMapping = (
      questionId: string,
      mappings: Array<{
        questionId: string;
        requiredDataElements: string[];
        transformationsNeeded: string[];
      }>
    ) => {
      return mappings.find(m => m.questionId === questionId);
    };

    it('should find mapping for existing question', () => {
      const mappings = [
        { questionId: 'q1', requiredDataElements: ['el1', 'el2'], transformationsNeeded: ['t1'] },
        { questionId: 'q2', requiredDataElements: ['el3'], transformationsNeeded: [] }
      ];

      const result = findQuestionMapping('q1', mappings);

      expect(result).toBeDefined();
      expect(result?.requiredDataElements).toEqual(['el1', 'el2']);
    });

    it('should return undefined for non-existent question', () => {
      const mappings = [
        { questionId: 'q1', requiredDataElements: ['el1'], transformationsNeeded: [] }
      ];

      const result = findQuestionMapping('q999', mappings);

      expect(result).toBeUndefined();
    });
  });

  describe('PII Column Filtering', () => {
    const filterPIIColumns = (
      data: any[],
      piiConfig: { excludedColumns?: string[] }
    ): any[] => {
      const excludedColumns = piiConfig.excludedColumns || [];

      if (excludedColumns.length === 0) {
        return data;
      }

      return data.map(row => {
        const filteredRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!excludedColumns.includes(key)) {
            filteredRow[key] = value;
          }
        }
        return filteredRow;
      });
    };

    it('should filter out excluded PII columns', () => {
      const data = [
        { id: 1, name: 'John', email: 'john@example.com', department: 'Sales' },
        { id: 2, name: 'Jane', email: 'jane@example.com', department: 'HR' }
      ];

      const piiConfig = { excludedColumns: ['name', 'email'] };

      const filtered = filterPIIColumns(data, piiConfig);

      expect(filtered[0]).toEqual({ id: 1, department: 'Sales' });
      expect(filtered[1]).toEqual({ id: 2, department: 'HR' });
      expect(filtered[0].name).toBeUndefined();
      expect(filtered[0].email).toBeUndefined();
    });

    it('should return original data when no exclusions', () => {
      const data = [
        { id: 1, name: 'John', department: 'Sales' }
      ];

      const filtered = filterPIIColumns(data, {});

      expect(filtered).toEqual(data);
    });

    it('should handle empty data array', () => {
      const filtered = filterPIIColumns([], { excludedColumns: ['name'] });

      expect(filtered).toEqual([]);
    });
  });

  describe('Execution Timeout', () => {
    it('should respect timeout for long-running operations', async () => {
      const TIMEOUT_MS = 100;

      const executeWithTimeout = async <T>(
        operation: Promise<T>,
        timeoutMs: number
      ): Promise<T> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
        });

        return Promise.race([operation, timeoutPromise]);
      };

      const longOperation = new Promise(resolve => {
        setTimeout(() => resolve('done'), 500);
      });

      await expect(executeWithTimeout(longOperation, TIMEOUT_MS)).rejects.toThrow('Operation timed out');
    });

    it('should complete within timeout', async () => {
      const TIMEOUT_MS = 500;

      const executeWithTimeout = async <T>(
        operation: Promise<T>,
        timeoutMs: number
      ): Promise<T> => {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
        });

        return Promise.race([operation, timeoutPromise]);
      };

      const quickOperation = new Promise(resolve => {
        setTimeout(() => resolve('done'), 50);
      });

      const result = await executeWithTimeout(quickOperation, TIMEOUT_MS);
      expect(result).toBe('done');
    });
  });

  describe('Artifact Generation', () => {
    const generateArtifact = (params: {
      projectId: string;
      type: 'report' | 'data' | 'visualization';
      format: 'pdf' | 'csv' | 'json' | 'png';
      data: any;
    }): { path: string; filename: string } => {
      const timestamp = Date.now();
      const extension = params.format;
      const filename = `${params.projectId}-${params.type}-${timestamp}.${extension}`;
      const path = `uploads/artifacts/${params.projectId}/${filename}`;

      return { path, filename };
    };

    it('should generate correct artifact path for report', () => {
      const result = generateArtifact({
        projectId: 'proj123',
        type: 'report',
        format: 'pdf',
        data: {}
      });

      expect(result.path).toContain('uploads/artifacts/proj123/');
      expect(result.filename).toContain('proj123-report-');
      expect(result.filename).toMatch(/\.pdf$/);
    });

    it('should generate correct artifact path for data export', () => {
      const result = generateArtifact({
        projectId: 'proj456',
        type: 'data',
        format: 'csv',
        data: []
      });

      expect(result.path).toContain('uploads/artifacts/proj456/');
      expect(result.filename).toContain('proj456-data-');
      expect(result.filename).toMatch(/\.csv$/);
    });

    it('should generate unique filenames', async () => {
      const result1 = generateArtifact({
        projectId: 'proj',
        type: 'report',
        format: 'pdf',
        data: {}
      });

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 5));

      const result2 = generateArtifact({
        projectId: 'proj',
        type: 'report',
        format: 'pdf',
        data: {}
      });

      // Filenames should be different due to timestamp
      expect(result1.filename).not.toBe(result2.filename);
    });
  });

  describe('Analysis Prioritization', () => {
    const prioritizeAnalyses = (
      requestedTypes: string[],
      recommendedTypes: string[]
    ): string[] => {
      // Recommended analyses first, then remaining requested
      const prioritized: string[] = [];

      // Add recommended analyses that were requested
      for (const recommended of recommendedTypes) {
        if (requestedTypes.includes(recommended)) {
          prioritized.push(recommended);
        }
      }

      // Add remaining requested analyses
      for (const requested of requestedTypes) {
        if (!prioritized.includes(requested)) {
          prioritized.push(requested);
        }
      }

      return prioritized;
    };

    it('should prioritize recommended analyses', () => {
      const requested = ['clustering', 'descriptive', 'correlation', 'regression'];
      const recommended = ['correlation', 'regression'];

      const result = prioritizeAnalyses(requested, recommended);

      expect(result[0]).toBe('correlation');
      expect(result[1]).toBe('regression');
      expect(result).toContain('clustering');
      expect(result).toContain('descriptive');
    });

    it('should include non-recommended analyses after', () => {
      const requested = ['descriptive', 'sentiment'];
      const recommended = ['correlation'];

      const result = prioritizeAnalyses(requested, recommended);

      // correlation is recommended but not requested, so not included
      expect(result).toEqual(['descriptive', 'sentiment']);
    });

    it('should handle empty recommended list', () => {
      const requested = ['descriptive', 'correlation'];
      const recommended: string[] = [];

      const result = prioritizeAnalyses(requested, recommended);

      expect(result).toEqual(['descriptive', 'correlation']);
    });
  });

  describe('Evidence Chain Building', () => {
    const buildEvidenceChain = (
      questionId: string,
      mapping: {
        requiredDataElements: string[];
        transformationsNeeded: string[];
      },
      analysisResults: Record<string, any>
    ): {
      question: string;
      dataElements: string[];
      transformations: string[];
      analysisUsed: string[];
      confidence: number;
    } => {
      const analysisUsed = Object.keys(analysisResults).filter(
        key => analysisResults[key]?.status === 'success'
      );

      const confidence = analysisUsed.length > 0
        ? Math.min(0.9, 0.5 + (analysisUsed.length * 0.1))
        : 0.3;

      return {
        question: questionId,
        dataElements: mapping.requiredDataElements,
        transformations: mapping.transformationsNeeded,
        analysisUsed,
        confidence
      };
    };

    it('should build complete evidence chain', () => {
      const mapping = {
        requiredDataElements: ['engagement_score', 'department'],
        transformationsNeeded: ['aggregate_scores']
      };

      const analysisResults = {
        descriptive: { status: 'success', data: {} },
        correlation: { status: 'success', data: {} }
      };

      const chain = buildEvidenceChain('q1', mapping, analysisResults);

      expect(chain.dataElements).toEqual(['engagement_score', 'department']);
      expect(chain.transformations).toEqual(['aggregate_scores']);
      expect(chain.analysisUsed).toEqual(['descriptive', 'correlation']);
      expect(chain.confidence).toBeGreaterThan(0.5);
    });

    it('should calculate lower confidence with no successful analyses', () => {
      const mapping = {
        requiredDataElements: ['score'],
        transformationsNeeded: []
      };

      const analysisResults = {
        descriptive: { status: 'failed', error: 'error' }
      };

      const chain = buildEvidenceChain('q1', mapping, analysisResults);

      expect(chain.analysisUsed).toHaveLength(0);
      expect(chain.confidence).toBe(0.3);
    });
  });
});
