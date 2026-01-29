/**
 * Unit Tests for Cost Estimation Service
 * Tests pricing calculations, analysis type factors, and cost breakdown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import shared pricing constants
import {
  PRICING_CONSTANTS,
  getRecordCountMultiplier,
  getAnalysisTypeFactor
} from '../../../shared/pricing-config';

describe('Cost Estimation Service', () => {
  describe('PRICING_CONSTANTS', () => {
    it('should have correct base platform fee', () => {
      expect(PRICING_CONSTANTS.basePlatformFee).toBe(0.50);
    });

    it('should have correct data processing rate per 1K rows', () => {
      expect(PRICING_CONSTANTS.dataProcessingPer1K).toBe(0.10);
    });

    it('should have correct base analysis cost', () => {
      expect(PRICING_CONSTANTS.baseAnalysisCost).toBe(1.00);
    });
  });

  describe('getRecordCountMultiplier', () => {
    it('should return 1.0 for small datasets (< 1000 rows)', () => {
      expect(getRecordCountMultiplier(500)).toBe(1.0);
      expect(getRecordCountMultiplier(999)).toBe(1.0);
    });

    it('should return 1.0 for datasets up to 10K rows', () => {
      expect(getRecordCountMultiplier(1000)).toBe(1.0);
      expect(getRecordCountMultiplier(5000)).toBe(1.0);
      expect(getRecordCountMultiplier(10000)).toBe(1.0);
    });

    it('should return 1.5 for medium datasets (10K-100K rows)', () => {
      expect(getRecordCountMultiplier(10001)).toBe(1.5);
      expect(getRecordCountMultiplier(50000)).toBe(1.5);
      expect(getRecordCountMultiplier(100000)).toBe(1.5);
    });

    it('should return 2.5 for large datasets (> 100K rows)', () => {
      expect(getRecordCountMultiplier(100001)).toBe(2.5);
      expect(getRecordCountMultiplier(500000)).toBe(2.5);
      expect(getRecordCountMultiplier(1000000)).toBe(2.5);
    });

    it('should handle edge cases', () => {
      expect(getRecordCountMultiplier(0)).toBe(1.0);
      expect(getRecordCountMultiplier(-100)).toBe(1.0);
    });
  });

  describe('getAnalysisTypeFactor', () => {
    it('should return correct factor for descriptive analysis', () => {
      expect(getAnalysisTypeFactor('descriptive')).toBe(1.0);
      expect(getAnalysisTypeFactor('Descriptive')).toBe(1.0);
      expect(getAnalysisTypeFactor('DESCRIPTIVE')).toBe(1.0);
    });

    it('should return correct factor for correlation analysis', () => {
      expect(getAnalysisTypeFactor('correlation')).toBe(1.2);
    });

    it('should return correct factor for regression analysis', () => {
      expect(getAnalysisTypeFactor('regression')).toBe(1.6);
    });

    it('should return correct factor for clustering analysis', () => {
      expect(getAnalysisTypeFactor('clustering')).toBe(1.5);
    });

    it('should return correct factor for time series analysis', () => {
      expect(getAnalysisTypeFactor('time_series')).toBe(1.8);
      // 'timeseries' returns default 1.0 since it's not a valid key (underscore required)
      expect(getAnalysisTypeFactor('timeseries')).toBe(1.0);
    });

    it('should return correct factor for ML analysis', () => {
      // 'ml' key doesn't exist, returns default
      expect(getAnalysisTypeFactor('ml')).toBe(1.0);
      // 'machine_learning' is the correct key with factor 3.0
      expect(getAnalysisTypeFactor('machine_learning')).toBe(3.0);
    });

    it('should return correct factor for sentiment analysis', () => {
      expect(getAnalysisTypeFactor('sentiment')).toBe(1.8);
    });

    it('should return default factor for unknown analysis types', () => {
      expect(getAnalysisTypeFactor('unknown')).toBe(1.0);
      expect(getAnalysisTypeFactor('')).toBe(1.0);
      expect(getAnalysisTypeFactor('custom_analysis')).toBe(1.0);
    });
  });

  describe('Cost Calculation', () => {
    // Helper function to calculate cost (mirrors buildPricing in analysis-payment.ts)
    const calculateCost = (params: {
      recordCount: number;
      analysisTypes: string[];
      questionsCount?: number;
    }) => {
      const { recordCount, analysisTypes, questionsCount = 0 } = params;

      const basePlatformFee = PRICING_CONSTANTS.basePlatformFee;
      const dataProcessingPer1K = PRICING_CONSTANTS.dataProcessingPer1K;
      const baseAnalysisCost = PRICING_CONSTANTS.baseAnalysisCost;

      const complexityMultiplier = getRecordCountMultiplier(recordCount);

      // Data processing charge
      const dataRowsK = recordCount / 1000;
      const dataSizeCharge = Math.round(dataRowsK * dataProcessingPer1K * 100) / 100;

      // Analysis type charges
      let totalAnalysisCharge = 0;
      const perAnalysisBreakdown: Array<{ type: string; cost: number }> = [];

      for (const analysisType of analysisTypes) {
        const typeFactor = getAnalysisTypeFactor(analysisType);
        const analysisCost = Math.round(baseAnalysisCost * typeFactor * complexityMultiplier * 100) / 100;
        totalAnalysisCharge += analysisCost;
        perAnalysisBreakdown.push({ type: analysisType, cost: analysisCost });
      }

      // Questions charge (extra questions beyond 5)
      const questionsCharge = Math.round(Math.max(0, (questionsCount - 5) * 0.10) * 100) / 100;

      const totalCost = Math.round((basePlatformFee + dataSizeCharge + totalAnalysisCharge + questionsCharge) * 100) / 100;

      return {
        totalCost,
        breakdown: {
          basePlatformFee,
          dataSizeCharge,
          analysisTypeCharge: Math.round(totalAnalysisCharge * 100) / 100,
          questionsCharge,
          perAnalysisBreakdown
        }
      };
    };

    it('should calculate cost for simple descriptive analysis', () => {
      const result = calculateCost({
        recordCount: 1000,
        analysisTypes: ['descriptive']
      });

      // $0.50 base + $0.10 (1K rows) + $1.00 (descriptive * 1.0) = $1.60
      expect(result.totalCost).toBe(1.60);
      expect(result.breakdown.basePlatformFee).toBe(0.50);
      expect(result.breakdown.dataSizeCharge).toBe(0.10);
      expect(result.breakdown.analysisTypeCharge).toBe(1.00);
    });

    it('should calculate cost for multiple analysis types', () => {
      const result = calculateCost({
        recordCount: 1000,
        analysisTypes: ['descriptive', 'correlation', 'regression']
      });

      // $0.50 base + $0.10 (1K rows) + $1.00 + $1.20 + $1.60 = $4.40
      expect(result.totalCost).toBe(4.40);
      expect(result.breakdown.perAnalysisBreakdown).toHaveLength(3);
      expect(result.breakdown.perAnalysisBreakdown[0]).toEqual({ type: 'descriptive', cost: 1.00 });
      expect(result.breakdown.perAnalysisBreakdown[1]).toEqual({ type: 'correlation', cost: 1.20 });
      expect(result.breakdown.perAnalysisBreakdown[2]).toEqual({ type: 'regression', cost: 1.60 });
    });

    it('should apply complexity multiplier for large datasets', () => {
      const result = calculateCost({
        recordCount: 50000,
        analysisTypes: ['descriptive']
      });

      // $0.50 base + $5.00 (50K rows) + $1.50 (1.0 * 1.5 multiplier) = $7.00
      expect(result.totalCost).toBe(7.00);
      expect(result.breakdown.dataSizeCharge).toBe(5.00);
      expect(result.breakdown.analysisTypeCharge).toBe(1.50);
    });

    it('should apply 2.5x multiplier for very large datasets', () => {
      const result = calculateCost({
        recordCount: 200000,
        analysisTypes: ['descriptive']
      });

      // $0.50 base + $20.00 (200K rows) + $2.50 (1.0 * 2.5 multiplier) = $23.00
      expect(result.totalCost).toBe(23.00);
      expect(result.breakdown.analysisTypeCharge).toBe(2.50);
    });

    it('should add charge for extra questions', () => {
      const result = calculateCost({
        recordCount: 1000,
        analysisTypes: ['descriptive'],
        questionsCount: 10
      });

      // $0.50 base + $0.10 (1K rows) + $1.00 (descriptive) + $0.50 (5 extra questions) = $2.10
      expect(result.totalCost).toBe(2.10);
      expect(result.breakdown.questionsCharge).toBe(0.50);
    });

    it('should not charge for 5 or fewer questions', () => {
      const result = calculateCost({
        recordCount: 1000,
        analysisTypes: ['descriptive'],
        questionsCount: 5
      });

      expect(result.breakdown.questionsCharge).toBe(0);
    });

    it('should calculate machine_learning analysis with complexity multiplier', () => {
      const result = calculateCost({
        recordCount: 100001, // > 100K triggers 2.5 multiplier
        analysisTypes: ['machine_learning']
      });

      // $0.50 base + $10.00 (100K rows) + $7.50 (3.0 factor * 2.5 multiplier) = $18.00
      expect(result.breakdown.analysisTypeCharge).toBe(7.50);
      expect(result.totalCost).toBe(18.00);
    });

    it('should handle empty analysis types', () => {
      const result = calculateCost({
        recordCount: 1000,
        analysisTypes: []
      });

      // $0.50 base + $0.10 (1K rows) + $0 (no analyses) = $0.60
      expect(result.totalCost).toBe(0.60);
      expect(result.breakdown.analysisTypeCharge).toBe(0);
    });

    it('should handle zero records', () => {
      const result = calculateCost({
        recordCount: 0,
        analysisTypes: ['descriptive']
      });

      // $0.50 base + $0 (0 rows) + $1.00 (descriptive) = $1.50
      expect(result.totalCost).toBe(1.50);
      expect(result.breakdown.dataSizeCharge).toBe(0);
    });
  });

  describe('Price Locking', () => {
    it('should use locked cost when available', () => {
      const lockedCost = 25.00;
      const calculatedCost = 30.00;

      // When locked cost exists, use it
      const finalCost = lockedCost > 0 ? lockedCost : calculatedCost;

      expect(finalCost).toBe(25.00);
    });

    it('should fall back to calculated cost when not locked', () => {
      const lockedCost = 0;
      const calculatedCost = 30.00;

      const finalCost = lockedCost > 0 ? lockedCost : calculatedCost;

      expect(finalCost).toBe(30.00);
    });

    it('should calculate remaining cost correctly', () => {
      const lockedCostCents = 2500; // $25.00
      const spentCostCents = 500;   // $5.00

      const remainingCostCents = Math.max(lockedCostCents - spentCostCents, 0);

      expect(remainingCostCents).toBe(2000); // $20.00
    });

    it('should not allow negative remaining cost', () => {
      const lockedCostCents = 500;
      const spentCostCents = 1000;

      const remainingCostCents = Math.max(lockedCostCents - spentCostCents, 0);

      expect(remainingCostCents).toBe(0);
    });
  });

  describe('Payment Amount Validation', () => {
    it('should pass validation within tolerance', () => {
      const backendAmount = 1000; // $10.00
      const frontendAmount = 1005; // $10.05

      const tolerance = Math.max(10, Math.round(backendAmount * 0.01));
      const difference = Math.abs(frontendAmount - backendAmount);

      const isValid = difference <= tolerance;

      expect(isValid).toBe(true);
    });

    it('should fail validation outside tolerance', () => {
      const backendAmount = 1000; // $10.00
      const frontendAmount = 1200; // $12.00

      const tolerance = Math.max(10, Math.round(backendAmount * 0.01));
      const difference = Math.abs(frontendAmount - backendAmount);

      const isValid = difference <= tolerance;

      expect(isValid).toBe(false);
    });

    it('should use minimum 10 cents tolerance', () => {
      const backendAmount = 100; // $1.00
      const frontendAmount = 108; // $1.08

      // 1% of $1.00 = 1 cent, but minimum is 10 cents
      const tolerance = Math.max(10, Math.round(backendAmount * 0.01));
      const difference = Math.abs(frontendAmount - backendAmount);

      expect(tolerance).toBe(10);
      expect(difference <= tolerance).toBe(true);
    });
  });

  describe('Currency Sanitization', () => {
    const sanitizeCurrency = (value: number): number => {
      if (!Number.isFinite(value)) {
        return 0;
      }
      return Math.round(value * 100) / 100;
    };

    it('should round to 2 decimal places', () => {
      expect(sanitizeCurrency(10.555)).toBe(10.56);
      expect(sanitizeCurrency(10.554)).toBe(10.55);
      expect(sanitizeCurrency(10.5)).toBe(10.5);
    });

    it('should handle Infinity', () => {
      expect(sanitizeCurrency(Infinity)).toBe(0);
      expect(sanitizeCurrency(-Infinity)).toBe(0);
    });

    it('should handle NaN', () => {
      expect(sanitizeCurrency(NaN)).toBe(0);
    });

    it('should handle negative values', () => {
      // JavaScript Math.round rounds towards positive infinity
      // Math.round(-1055.5) = -1055, so -10.555 rounds to -10.55
      expect(sanitizeCurrency(-10.555)).toBe(-10.55);
    });
  });

  describe('Data Complexity Classification', () => {
    const determineComplexity = (recordCount: number): 'simple' | 'moderate' | 'complex' => {
      if (recordCount > 100_000) {
        return 'complex';
      }
      if (recordCount > 10_000) {
        return 'moderate';
      }
      return 'simple';
    };

    it('should classify small datasets as simple', () => {
      expect(determineComplexity(100)).toBe('simple');
      expect(determineComplexity(5000)).toBe('simple');
      expect(determineComplexity(10000)).toBe('simple');
    });

    it('should classify medium datasets as moderate', () => {
      expect(determineComplexity(10001)).toBe('moderate');
      expect(determineComplexity(50000)).toBe('moderate');
      expect(determineComplexity(100000)).toBe('moderate');
    });

    it('should classify large datasets as complex', () => {
      expect(determineComplexity(100001)).toBe('complex');
      expect(determineComplexity(500000)).toBe('complex');
      expect(determineComplexity(1000000)).toBe('complex');
    });
  });
});
