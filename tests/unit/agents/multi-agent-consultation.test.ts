/**
 * Unit Tests: Multi-Agent Consultation Methods
 *
 * Tests the lightweight consultation methods added to each agent:
 * - Data Engineer: assessDataQuality, suggestTransformations, estimateDataProcessingTime
 * - Data Scientist: checkFeasibility, validateMethodology, estimateConfidence
 * - Business Agent: assessBusinessImpact, suggestBusinessMetrics, validateBusinessAlignment
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { DataEngineerAgent } from '../../../server/services/data-engineer-agent';
import { DataScientistAgent } from '../../../server/services/data-scientist-agent';
import { BusinessAgent } from '../../../server/services/business-agent';

describe('Data Engineer Agent - Consultation Methods', () => {
  let agent: DataEngineerAgent;

  beforeEach(() => {
    agent = new DataEngineerAgent();
  });

  describe('assessDataQuality', () => {
    test('calculates completeness correctly with missing values', async () => {
      const data = [
        { id: 1, name: 'John', age: 30, city: 'NYC' },
        { id: 2, name: 'Jane', age: null, city: 'LA' },
        { id: 3, name: 'Bob', age: 25, city: null },
        { id: 4, name: null, age: 28, city: 'SF' }
      ];
      const schema = {
        id: { type: 'number' },
        name: { type: 'string' },
        age: { type: 'number' },
        city: { type: 'string' }
      };

      const result = await agent.assessDataQuality(data, schema);

      // 13 out of 16 fields complete (3 nulls)
      expect(result.completeness).toBeCloseTo(0.8125, 2);
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(1);
      expect(result.issues).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('identifies duplicate rows correctly', async () => {
      const data = [
        { id: 1, name: 'John', age: 30 },
        { id: 1, name: 'John', age: 30 }, // Duplicate
        { id: 2, name: 'Jane', age: 25 }
      ];
      const schema = {
        id: { type: 'number' },
        name: { type: 'string' },
        age: { type: 'number' }
      };

      const result = await agent.assessDataQuality(data, schema);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          type: expect.stringMatching(/duplicate/i)
        })
      );
    });

    test('returns high quality score for complete data', async () => {
      const data = [
        { id: 1, name: 'John', age: 30 },
        { id: 2, name: 'Jane', age: 25 },
        { id: 3, name: 'Bob', age: 28 }
      ];
      const schema = {
        id: { type: 'number' },
        name: { type: 'string' },
        age: { type: 'number' }
      };

      const result = await agent.assessDataQuality(data, schema);

      expect(result.completeness).toBeCloseTo(1.0, 2);
      expect(result.overallScore).toBeGreaterThan(0.9);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('suggestTransformations', () => {
    test('suggests RFM when segment missing but frequency+monetary exist', async () => {
      const missingColumns = ['segment'];
      const availableColumns = ['customer_id', 'frequency', 'monetary'];
      const goals = ['Analyze customer segments'];

      const result = await agent.suggestTransformations(missingColumns, availableColumns, goals);

      expect(result.transformations).toBeDefined();
      expect(result.transformations.length).toBeGreaterThan(0);
      
      const rfmTransformation = result.transformations.find(t => 
        t.method.toLowerCase().includes('rfm') || 
        t.description.toLowerCase().includes('rfm')
      );
      expect(rfmTransformation).toBeDefined();
      expect(rfmTransformation?.confidence).toBeGreaterThan(0.8);
    });

    test('suggests date parsing when temporal analysis goals exist', async () => {
      const missingColumns = ['date'];
      const availableColumns = ['timestamp_str', 'customer_id', 'amount'];
      const goals = ['Analyze trends over time'];

      const result = await agent.suggestTransformations(missingColumns, availableColumns, goals);

      const dateTransformation = result.transformations.find(t =>
        t.method.toLowerCase().includes('date') ||
        t.description.toLowerCase().includes('date')
      );
      expect(dateTransformation).toBeDefined();
    });

    test('returns empty transformations when no suggestions possible', async () => {
      const missingColumns = ['exotic_column'];
      const availableColumns = ['id', 'name'];
      const goals = ['Generic analysis'];

      const result = await agent.suggestTransformations(missingColumns, availableColumns, goals);

      expect(result.transformations).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });
  });

  describe('estimateDataProcessingTime', () => {
    test('calculates base time correctly for different data sizes', async () => {
      // Small dataset
      const smallResult = await agent.estimateDataProcessingTime(5000, 'low');
      expect(smallResult.estimatedMinutes).toBeGreaterThan(0);
      expect(smallResult.estimatedMinutes).toBeLessThan(10);

      // Large dataset
      const largeResult = await agent.estimateDataProcessingTime(100000, 'low');
      expect(largeResult.estimatedMinutes).toBeGreaterThan(smallResult.estimatedMinutes);
    });

    test('applies complexity multipliers correctly', async () => {
      const dataSize = 50000;
      const lowResult = await agent.estimateDataProcessingTime(dataSize, 'low');
      const mediumResult = await agent.estimateDataProcessingTime(dataSize, 'medium');
      const highResult = await agent.estimateDataProcessingTime(dataSize, 'high');

      // Medium should be ~1.5x low, high should be ~2x low after pipeline tuning
      expect(mediumResult.estimatedMinutes).toBeGreaterThan(lowResult.estimatedMinutes);
      expect(highResult.estimatedMinutes).toBeGreaterThan(mediumResult.estimatedMinutes);
      expect(mediumResult.estimatedMinutes).toBeCloseTo(Math.round(lowResult.estimatedMinutes * 1.5), 0);
      expect(highResult.estimatedMinutes).toBeCloseTo(Math.round(lowResult.estimatedMinutes * 2), 0);
    });

    test('includes confidence and factors in estimate', async () => {
      const result = await agent.estimateDataProcessingTime(10000, 'medium');

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.factors).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(0);
    });
  });
});

describe('Data Scientist Agent - Consultation Methods', () => {
  let agent: DataScientistAgent;

  beforeEach(() => {
    agent = new DataScientistAgent();
  });

  describe('checkFeasibility', () => {
    test('maps customer segmentation goals to clustering analysis', async () => {
      const goals = ['Identify customer segments', 'Group similar customers'];
      const dataSchema = {
        customer_id: { type: 'string' },
        purchase_amount: { type: 'number' },
        frequency: { type: 'number' }
      };
      const dataQuality = 0.9;

      const result = await agent.checkFeasibility(goals, dataSchema, dataQuality);

      expect(result.feasible).toBe(true);
      expect(result.requiredAnalyses).toContain('clustering');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('maps prediction goals to regression analysis', async () => {
      const goals = ['Predict sales', 'Forecast revenue'];
      const dataSchema = {
        date: { type: 'string' },
        sales: { type: 'number' },
        marketing_spend: { type: 'number' }
      };
      const dataQuality = 0.85;

      const result = await agent.checkFeasibility(goals, dataSchema, dataQuality);

      expect(result.feasible).toBe(true);
      expect(result.requiredAnalyses).toContain('regression');
    });

    test('flags infeasibility when data quality too low', async () => {
      const goals = ['Analyze patterns'];
      const dataSchema = { id: { type: 'number' } };
      const dataQuality = 0.4; // Very low quality

      const result = await agent.checkFeasibility(goals, dataSchema, dataQuality);

      expect(result.feasible).toBe(false);
      expect(result.concerns).toBeDefined();
      expect(result.concerns.length).toBeGreaterThan(0);
    });

    test('includes data requirements in feasibility report', async () => {
      const goals = ['Predict churn'];
      const dataSchema = {
        customer_id: { type: 'string' },
        tenure: { type: 'number' }
      };
      const dataQuality = 0.8;

      const result = await agent.checkFeasibility(goals, dataSchema, dataQuality);

      expect(result.dataRequirements).toBeDefined();
      expect(result.estimatedDuration).toBeDefined();
    });
  });

  describe('validateMethodology', () => {
    test('warns when sample size too small (n < 30)', async () => {
      const analysisParams = {
        type: 'regression',
        features: ['age', 'income'],
        target: 'purchase'
      };
      const dataCharacteristics = {
        rowCount: 25, // Less than 30
        columnCount: 3
      };

      const result = await agent.validateMethodology(analysisParams, dataCharacteristics);

      expect(result.valid).toBe(true); // Still valid but with warnings
      expect(result.warnings).toBeDefined();
      const smallSampleWarning = result.warnings.find(w =>
        w.toLowerCase().includes('sample') || w.toLowerCase().includes('30')
      );
      expect(smallSampleWarning).toBeDefined();
    });

    test('warns about overfitting risk when features/samples > 0.1', async () => {
      const analysisParams = {
        type: 'regression',
        features: Array(15).fill('feature'), // 15 features
        target: 'outcome'
      };
      const dataCharacteristics = {
        rowCount: 100, // 15/100 = 0.15 > 0.1
        columnCount: 16
      };

      const result = await agent.validateMethodology(analysisParams, dataCharacteristics);

      const overfittingWarning = result.warnings.find(w =>
        w.toLowerCase().includes('overfit')
      );
      expect(overfittingWarning).toBeDefined();
    });

    test('suggests alternatives when methodology suboptimal', async () => {
      const analysisParams = {
        type: 'clustering',
        features: ['age', 'income']
      };
      const dataCharacteristics = {
        rowCount: 50, // Small for clustering
        columnCount: 2
      };

      const result = await agent.validateMethodology(analysisParams, dataCharacteristics);

      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    test('returns high confidence for valid methodology', async () => {
      const analysisParams = {
        type: 'regression',
        features: ['age', 'income', 'tenure'],
        target: 'churn'
      };
      const dataCharacteristics = {
        rowCount: 1000,
        columnCount: 4
      };

      const result = await agent.validateMethodology(analysisParams, dataCharacteristics);

      expect(result.valid).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.warnings.length).toBeLessThanOrEqual(1);
    });
  });

  describe('estimateConfidence', () => {
    test('increases confidence for high data quality', async () => {
      const highQualityResult = await agent.estimateConfidence('regression', 0.95);
      const lowQualityResult = await agent.estimateConfidence('regression', 0.65);

      expect(highQualityResult.score).toBeGreaterThan(lowQualityResult.score);
      expect(highQualityResult.score).toBeGreaterThan(0.85);
    });

    test('decreases confidence for poor data quality', async () => {
      const result = await agent.estimateConfidence('clustering', 0.55);

      expect(result.score).toBeLessThan(0.75);
      expect(result.factors).toBeDefined();
      const qualityFactor = result.factors.find(f =>
        f.factor.toLowerCase().includes('quality')
      );
      expect(qualityFactor).toBeDefined();
    });

    test('includes recommendation based on confidence level', async () => {
      const goodResult = await agent.estimateConfidence('regression', 0.9);
      const poorResult = await agent.estimateConfidence('regression', 0.5);

      expect(goodResult.recommendation).toBeDefined();
      expect(poorResult.recommendation).toBeDefined();
      expect(poorResult.recommendation.toLowerCase()).toContain('improve');
    });

    test('base confidence around 0.80 for medium quality', async () => {
      const result = await agent.estimateConfidence('clustering', 0.8);

      expect(result.score).toBeCloseTo(0.8, 1);
      expect(result.score).toBeGreaterThan(0.7);
      expect(result.score).toBeLessThan(0.9);
    });
  });
});

describe('Business Agent - Consultation Methods', () => {
  let agent: BusinessAgent;

  beforeEach(() => {
    agent = new BusinessAgent();
  });

  describe('assessBusinessImpact', () => {
    test('assigns high business value to customer segmentation', async () => {
      const goals = ['Identify customer segments for targeted marketing'];
      const proposedApproach = {
        analyses: ['clustering'],
        metrics: ['segment_size', 'avg_revenue']
      };
      const industry = 'retail';

      const result = await agent.assessBusinessImpact(goals, proposedApproach, industry);

      expect(result.businessValue).toBe('high');
      expect(result.alignment).toBeGreaterThan(0.8);
      expect(result.expectedROI).toBeDefined();
    });

    test('assigns high value to revenue prediction goals', async () => {
      const goals = ['Predict monthly revenue'];
      const proposedApproach = {
        analyses: ['regression', 'time_series'],
        metrics: ['revenue_forecast', 'accuracy']
      };
      const industry = 'saas';

      const result = await agent.assessBusinessImpact(goals, proposedApproach, industry);

      expect(result.businessValue).toBe('high');
      expect(result.benefits).toBeDefined();
      expect(result.benefits.length).toBeGreaterThan(0);
    });

    test('includes industry-specific considerations for finance', async () => {
      const goals = ['Risk analysis'];
      const proposedApproach = {
        analyses: ['regression'],
        metrics: ['risk_score']
      };
      const industry = 'finance';

      const result = await agent.assessBusinessImpact(goals, proposedApproach, industry);

      expect(result.recommendations).toBeDefined();
      const complianceRec = result.recommendations.find(r =>
        r.toLowerCase().includes('compliance') ||
        r.toLowerCase().includes('regulatory')
      );
      expect(complianceRec).toBeDefined();
    });

    test('includes risks and benefits in assessment', async () => {
      const goals = ['Customer churn prediction'];
      const proposedApproach = {
        analyses: ['classification'],
        metrics: ['churn_rate', 'retention']
      };
      const industry = 'telecom';

      const result = await agent.assessBusinessImpact(goals, proposedApproach, industry);

      expect(result.benefits).toBeDefined();
      expect(result.risks).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('suggestBusinessMetrics', () => {
    test('suggests CLV and CAC for customer-focused goals', async () => {
      const industry = 'ecommerce';
      const goals = ['Improve customer lifetime value', 'Reduce acquisition costs'];

      const result = await agent.suggestBusinessMetrics(industry, goals);

      expect(result.primaryMetrics).toBeDefined();
      const hasClv = result.primaryMetrics.some(m => {
        const name = (typeof m === 'string' ? m : m?.name) || '';
        const normalized = name.toLowerCase();
        return normalized.includes('lifetime value') || normalized.includes('clv');
      });
      const hasCac = result.primaryMetrics.some(m => {
        const name = (typeof m === 'string' ? m : m?.name) || '';
        const normalized = name.toLowerCase();
        return normalized.includes('acquisition cost') || normalized.includes('cac');
      });
      expect(hasClv || hasCac).toBe(true);
    });

    test('suggests MRR for SaaS industry', async () => {
      const industry = 'saas';
      const goals = ['Track recurring revenue'];

      const result = await agent.suggestBusinessMetrics(industry, goals);

      const hasMrr = result.primaryMetrics.some(m => {
        const name = (typeof m === 'string' ? m : m?.name) || '';
        const normalized = name.toLowerCase();
        return normalized.includes('mrr') || normalized.includes('recurring revenue');
      });
      expect(hasMrr).toBe(true);
    });

    test('suggests AOV and cart abandonment for retail', async () => {
      const industry = 'retail';
      const goals = ['Increase average order value'];

      const result = await agent.suggestBusinessMetrics(industry, goals);

      const hasAov = result.primaryMetrics.some(m => {
        const name = (typeof m === 'string' ? m : m?.name) || '';
        const normalized = name.toLowerCase();
        return normalized.includes('order value') || normalized.includes('aov');
      });
      expect(hasAov).toBe(true);
      expect(result.industry).toBe('retail');
    });

    test('includes secondary metrics', async () => {
      const industry = 'ecommerce';
      const goals = ['Improve overall performance'];

      const result = await agent.suggestBusinessMetrics(industry, goals);

      expect(result.primaryMetrics).toBeDefined();
      expect(result.secondaryMetrics).toBeDefined();
      expect(result.secondaryMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('validateBusinessAlignment', () => {
    test('calculates high alignment for matching approach and goals', async () => {
      const technicalApproach = {
        analyses: ['clustering'],
        metrics: ['segment_size', 'customer_value'],
        methodology: 'Unsupervised learning for customer segmentation'
      };
      const businessGoals = ['Identify high-value customer segments'];

      const result = await agent.validateBusinessAlignment(technicalApproach, businessGoals);

      expect(result.score).toBeGreaterThan(0.8);
      expect(result.alignmentFactors).toBeDefined();
      expect(result.alignmentFactors.length).toBeGreaterThan(0);
    });

    test('identifies gaps when approach misaligned with goals', async () => {
      const technicalApproach = {
        analyses: ['clustering'],
        metrics: ['cluster_count'],
        methodology: 'K-means clustering'
      };
      const businessGoals = ['Predict future revenue', 'Forecast sales'];

      const result = await agent.validateBusinessAlignment(technicalApproach, businessGoals);

      expect(result.gaps).toBeDefined();
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(0.8);
    });

    test('provides suggestions to improve alignment', async () => {
      const technicalApproach = {
        analyses: ['regression'],
        metrics: ['r_squared'],
        methodology: 'Linear regression'
      };
      const businessGoals = ['Reduce customer churn'];

      const result = await agent.validateBusinessAlignment(technicalApproach, businessGoals);

      expect(result.suggestions).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    test('base alignment score around 0.75', async () => {
      const technicalApproach = {
        analyses: ['regression'],
        metrics: ['accuracy'],
        methodology: 'Predictive modeling'
      };
      const businessGoals = ['Improve predictions'];

      const result = await agent.validateBusinessAlignment(technicalApproach, businessGoals);

      expect(result.score).toBeGreaterThanOrEqual(0.7);
      expect(result.score).toBeLessThanOrEqual(0.9);
    });
  });
});
