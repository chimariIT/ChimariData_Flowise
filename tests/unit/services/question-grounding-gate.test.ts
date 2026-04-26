import { describe, expect, it } from 'vitest';

import {
  applyQuestionGroundingGate,
  buildContextLingoRulesFromDefinitions,
  buildRecursiveQuestionLayers,
  splitMultiPartQuestion,
} from '../../../server/services/question-grounding-gate';

describe('question-grounding-gate', () => {
  it('splits multi-part questions into granular parts', () => {
    const parts = splitMultiPartQuestion(
      'Which channels have the highest ROI and how has conversion rate trended over time?',
    );
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('expands context lingo recursively for business terms', () => {
    const contextRules = buildContextLingoRulesFromDefinitions([
      {
        term: 'whale curve',
        definition: 'profit contribution concentration by customer segment',
        metricHint: 'profit',
        dimensionHint: 'customer segment',
      },
    ]);

    const decomposition = buildRecursiveQuestionLayers(
      'Where is our whale curve strongest?',
      { contextRules, maxDepth: 3, maxNodes: 24 },
    );

    expect(decomposition.layerCount).toBeGreaterThanOrEqual(2);
    expect(decomposition.leafCount).toBeGreaterThanOrEqual(1);
    expect(
      decomposition.layers.some(
        layer =>
          layer.expansionType === 'context_lingo'
          || layer.text.toLowerCase().includes('whale curve'),
      ),
    ).toBe(true);
  });

  it('flags grouped questions without a grounded dimension as partial', () => {
    const result = applyQuestionGroundingGate(
      [
        {
          questionId: 'q1',
          questionText: 'Which channel has the highest conversion rate?',
          requiredDataElements: ['el_conversion_rate'],
          recommendedAnalyses: ['group_analysis'],
          transformationsNeeded: [],
        },
      ],
      [
        { elementId: 'el_conversion_rate', elementName: 'Conversion Rate', dataType: 'numeric' },
      ],
    );

    expect(result.summary.partialQuestions).toBe(1);
    expect(result.summary.blockedByDimension).toBe(1);
    expect(result.mappings[0].answerability).toBe('partial');
    expect(result.mappings[0].answerabilityBlockers).toContain('dimension_not_grounded');
  });

  it('flags missing metric grounding as data gap', () => {
    const result = applyQuestionGroundingGate(
      [
        {
          questionId: 'q2',
          questionText: 'What is the leaky bucket?',
          requiredDataElements: [],
          recommendedAnalyses: ['descriptive_stats'],
          transformationsNeeded: [],
        },
      ],
      [],
    );

    expect(result.summary.dataGapQuestions).toBe(1);
    expect(result.summary.blockedByMetric).toBe(1);
    expect(result.mappings[0].answerability).toBe('data_gap');
    expect(result.mappings[0].answerabilityBlockers).toContain('metric_not_grounded');
  });

  it('marks question answerable when metric and dimension are grounded', () => {
    const result = applyQuestionGroundingGate(
      [
        {
          questionId: 'q3',
          questionText: 'Which channel has the highest conversion rate?',
          requiredDataElements: ['el_conversion_rate', 'el_channel'],
          recommendedAnalyses: ['group_analysis'],
          transformationsNeeded: [],
        },
      ],
      [
        { elementId: 'el_conversion_rate', dataType: 'numeric' },
        { elementId: 'el_channel', dataType: 'categorical' },
      ],
    );

    expect(result.summary.answerableQuestions).toBe(1);
    expect(result.mappings[0].answerability).toBe('answerable');
    expect(result.mappings[0].answerabilityBlockers).toHaveLength(0);
  });
});
