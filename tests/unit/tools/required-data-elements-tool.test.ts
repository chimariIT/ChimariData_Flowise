/**
 * Unit Tests for Required Data Elements Tool
 * Tests composite element mapping, sourceColumns rebuilding, and AI mapping flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI service
vi.mock('../../../server/services/ai', () => ({
  ai: {
    generateText: vi.fn().mockResolvedValue({
      text: JSON.stringify([]),
      provider: 'mock'
    })
  }
}));

// Mock storage
vi.mock('../../../server/services/storage', () => ({
  storage: {
    getProject: vi.fn().mockResolvedValue({ id: 'test-project' }),
    getDataset: vi.fn().mockResolvedValue(null),
    updateProject: vi.fn().mockResolvedValue({}),
  }
}));

describe('Required Data Elements Tool', () => {
  describe('matchComponentFields', () => {
    // Helper to test the matching logic directly
    const matchComponentFields = async (
      componentFields: string[],
      availableFields: string[],
      schema: Record<string, any>
    ) => {
      const results: Array<{
        componentField: string;
        matchedColumn?: string;
        matchConfidence: number;
        matched: boolean;
      }> = [];

      for (const componentField of componentFields) {
        const normalizedComponent = componentField.toLowerCase().replace(/[_\s-]+/g, '');
        let bestMatch: { column: string; score: number } | null = null;

        for (const availableField of availableFields) {
          const normalizedAvailable = availableField.toLowerCase().replace(/[_\s-]+/g, '');

          // Exact match
          if (normalizedComponent === normalizedAvailable) {
            bestMatch = { column: availableField, score: 100 };
            break;
          }

          // Contains match
          if (normalizedAvailable.includes(normalizedComponent) || normalizedComponent.includes(normalizedAvailable)) {
            const score = Math.max(
              (normalizedComponent.length / normalizedAvailable.length) * 80,
              (normalizedAvailable.length / normalizedComponent.length) * 80
            );
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { column: availableField, score: Math.min(score, 90) };
            }
          }

          // Word overlap match
          const componentWords = componentField.toLowerCase().split(/[_\s-]+/);
          const availableWords = availableField.toLowerCase().split(/[_\s-]+/);
          const overlap = componentWords.filter(w => availableWords.some(aw => aw.includes(w) || w.includes(aw)));

          if (overlap.length > 0) {
            const overlapScore = (overlap.length / Math.max(componentWords.length, availableWords.length)) * 70;
            if (!bestMatch || overlapScore > bestMatch.score) {
              bestMatch = { column: availableField, score: overlapScore };
            }
          }

          // Semantic pattern matching
          const semanticPatterns: Record<string, RegExp[]> = {
            'survey_scores': [/q\d+|score|rating|response|likert|survey/i],
            'engagement_questions': [/engagement|satisfaction|q\d+.*score|motivation|commitment/i],
            'numeric_columns': [/score|rating|count|amount|total|number|value|avg|sum/i],
          };

          const normalizedComponentLower = componentField.toLowerCase().replace(/[_\s-]+/g, '_');
          const patterns = semanticPatterns[normalizedComponentLower] || semanticPatterns[componentField.toLowerCase()];

          if (patterns) {
            for (const pattern of patterns) {
              if (pattern.test(availableField)) {
                const colType = schema[availableField]?.type?.toLowerCase() || '';
                const isNumericCol = /int|float|numeric|number|decimal/i.test(colType);
                const isScorePattern = /score|rating|numeric/i.test(normalizedComponentLower);

                let semanticScore = 55;
                if (isScorePattern && isNumericCol) {
                  semanticScore = 70;
                }

                if (!bestMatch || semanticScore > bestMatch.score) {
                  bestMatch = { column: availableField, score: semanticScore };
                }
              }
            }
          }
        }

        results.push({
          componentField,
          matchedColumn: bestMatch?.column,
          matchConfidence: bestMatch?.score || 0,
          matched: bestMatch !== null && bestMatch.score >= 50
        });
      }

      return results;
    };

    it('should match exact column names', async () => {
      const componentFields = ['employee_id', 'department', 'salary'];
      const availableFields = ['employee_id', 'department', 'salary', 'hire_date'];
      const schema = {
        employee_id: { type: 'text' },
        department: { type: 'text' },
        salary: { type: 'numeric' },
        hire_date: { type: 'date' }
      };

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({
        componentField: 'employee_id',
        matchedColumn: 'employee_id',
        matchConfidence: 100,
        matched: true
      });
      expect(results[1]).toMatchObject({
        componentField: 'department',
        matchedColumn: 'department',
        matchConfidence: 100,
        matched: true
      });
      expect(results[2]).toMatchObject({
        componentField: 'salary',
        matchedColumn: 'salary',
        matchConfidence: 100,
        matched: true
      });
    });

    it('should match columns with different casing', async () => {
      const componentFields = ['EmployeeID', 'Department'];
      const availableFields = ['employeeid', 'DEPARTMENT', 'salary'];
      const schema = {};

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results[0].matched).toBe(true);
      expect(results[0].matchedColumn).toBe('employeeid');
      expect(results[1].matched).toBe(true);
      expect(results[1].matchedColumn).toBe('DEPARTMENT');
    });

    it('should match columns with word overlap', async () => {
      const componentFields = ['engagement_score', 'satisfaction_rating'];
      const availableFields = ['employee_engagement_score', 'job_satisfaction_rating', 'hire_date'];
      const schema = {};

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results[0].matched).toBe(true);
      expect(results[0].matchedColumn).toBe('employee_engagement_score');
      expect(results[1].matched).toBe(true);
      expect(results[1].matchedColumn).toBe('job_satisfaction_rating');
    });

    it('should match semantic placeholder "survey_scores" to Q columns', async () => {
      const componentFields = ['survey_scores'];
      const availableFields = ['Q1_Workload', 'Q2_Growth', 'Q3_Recognition', 'employee_id'];
      const schema = {
        Q1_Workload: { type: 'numeric' },
        Q2_Growth: { type: 'numeric' },
        Q3_Recognition: { type: 'numeric' },
        employee_id: { type: 'text' }
      };

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results[0].matched).toBe(true);
      // Should match one of the Q columns
      expect(results[0].matchedColumn).toMatch(/Q\d+/);
      expect(results[0].matchConfidence).toBeGreaterThanOrEqual(55);
    });

    it('should match semantic placeholder "engagement_questions" to engagement columns', async () => {
      const componentFields = ['engagement_questions'];
      const availableFields = ['engagement_score', 'satisfaction_level', 'hire_date'];
      const schema = {
        engagement_score: { type: 'numeric' },
        satisfaction_level: { type: 'numeric' },
        hire_date: { type: 'date' }
      };

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results[0].matched).toBe(true);
      expect(results[0].matchedColumn).toBe('engagement_score');
    });

    it('should return unmatched for fields with no match', async () => {
      const componentFields = ['xyz_nonexistent', 'abc_missing'];
      const availableFields = ['employee_id', 'department', 'salary'];
      const schema = {};

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results[0].matched).toBe(false);
      expect(results[0].matchConfidence).toBeLessThan(50);
      expect(results[1].matched).toBe(false);
    });

    it('should handle empty component fields', async () => {
      const componentFields: string[] = [];
      const availableFields = ['employee_id', 'department'];
      const schema = {};

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results).toHaveLength(0);
    });

    it('should handle empty available fields', async () => {
      const componentFields = ['employee_id'];
      const availableFields: string[] = [];
      const schema = {};

      const results = await matchComponentFields(componentFields, availableFields, schema);

      expect(results).toHaveLength(1);
      expect(results[0].matched).toBe(false);
    });
  });

  describe('Composite Element Detection', () => {
    it('should detect composite elements from calculationDefinition', () => {
      const element = {
        elementName: 'Employee Engagement Score',
        calculationDefinition: {
          calculationType: 'derived',
          formula: {
            componentFields: ['Q1_Score', 'Q2_Score', 'Q3_Score'],
            aggregationMethod: 'average'
          }
        }
      };

      const calcDef = element.calculationDefinition;
      const componentFields = calcDef?.formula?.componentFields || [];
      const isCompositeElement = componentFields.length > 0 &&
        ['derived', 'aggregated', 'composite'].includes(calcDef?.calculationType || '');

      expect(isCompositeElement).toBe(true);
      expect(componentFields).toHaveLength(3);
    });

    it('should not detect direct mapping as composite', () => {
      const element = {
        elementName: 'Employee ID',
        calculationDefinition: {
          calculationType: 'direct',
          formula: {
            businessDescription: 'Direct mapping from source'
          }
        }
      };

      const calcDef = element.calculationDefinition;
      const componentFields = calcDef?.formula?.componentFields || [];
      const isCompositeElement = componentFields.length > 0 &&
        ['derived', 'aggregated', 'composite'].includes(calcDef?.calculationType || '');

      expect(isCompositeElement).toBe(false);
    });

    it('should detect aggregated elements as composite', () => {
      const element = {
        elementName: 'Total Sales',
        calculationDefinition: {
          calculationType: 'aggregated',
          formula: {
            componentFields: ['monthly_sales', 'quarterly_bonus'],
            aggregationMethod: 'sum'
          }
        }
      };

      const calcDef = element.calculationDefinition;
      const componentFields = calcDef?.formula?.componentFields || [];
      const isCompositeElement = componentFields.length > 0 &&
        ['derived', 'aggregated', 'composite'].includes(calcDef?.calculationType || '');

      expect(isCompositeElement).toBe(true);
    });
  });

  describe('buildCompositeTransformationLogic', () => {
    const buildCompositeTransformationLogic = (
      element: any,
      sourceColumns: Array<{
        componentField: string;
        matchedColumn?: string;
        matchConfidence: number;
        matched: boolean;
      }>
    ) => {
      const calcDef = element.calculationDefinition;
      const matchedColumns = sourceColumns.filter(sc => sc.matched).map(sc => sc.matchedColumn!);
      const unmatchedFields = sourceColumns.filter(sc => !sc.matched).map(sc => sc.componentField);

      let description = calcDef?.formula?.businessDescription || `Composite calculation for ${element.elementName}`;
      if (unmatchedFields.length > 0) {
        description += `\n⚠️ UNMAPPED FIELDS: ${unmatchedFields.join(', ')} - Please map these manually`;
      }

      let code = '';
      const aggMethod = calcDef?.formula?.aggregationMethod;

      if (aggMethod && matchedColumns.length > 0) {
        switch (aggMethod) {
          case 'average':
            code = `(${matchedColumns.map(c => `df['${c}']`).join(' + ')}) / ${matchedColumns.length}`;
            break;
          case 'sum':
            code = matchedColumns.map(c => `df['${c}']`).join(' + ');
            break;
          case 'weighted_average':
            code = `# Weighted average - adjust weights as needed\n(${matchedColumns.map((c, i) => `df['${c}'] * weight_${i}`).join(' + ')}) / sum(weights)`;
            break;
          default:
            code = `# ${aggMethod}: ${matchedColumns.map(c => `df['${c}']`).join(', ')}`;
        }
      } else {
        code = `# Composite: ${element.elementName}\n# Source columns: ${matchedColumns.join(', ')}\n# TODO: Define transformation logic`;
      }

      return {
        operation: 'composite_calculation',
        description,
        code,
        dependencies: matchedColumns,
        sourceColumns,
        validationRules: unmatchedFields.length > 0
          ? [`⚠️ ${unmatchedFields.length} component field(s) not mapped: ${unmatchedFields.join(', ')}`]
          : [`All ${matchedColumns.length} component fields mapped successfully`]
      };
    };

    it('should generate average aggregation code', () => {
      const element = {
        elementName: 'Engagement Score',
        calculationDefinition: {
          calculationType: 'derived',
          formula: {
            businessDescription: 'Average of survey scores',
            aggregationMethod: 'average'
          }
        }
      };

      const sourceColumns = [
        { componentField: 'Q1', matchedColumn: 'Q1_Score', matchConfidence: 100, matched: true },
        { componentField: 'Q2', matchedColumn: 'Q2_Score', matchConfidence: 100, matched: true },
        { componentField: 'Q3', matchedColumn: 'Q3_Score', matchConfidence: 100, matched: true }
      ];

      const result = buildCompositeTransformationLogic(element, sourceColumns);

      expect(result.operation).toBe('composite_calculation');
      expect(result.code).toContain("df['Q1_Score']");
      expect(result.code).toContain("df['Q2_Score']");
      expect(result.code).toContain("df['Q3_Score']");
      expect(result.code).toContain('/ 3');
      expect(result.dependencies).toEqual(['Q1_Score', 'Q2_Score', 'Q3_Score']);
      expect(result.validationRules[0]).toContain('All 3 component fields mapped');
    });

    it('should generate sum aggregation code', () => {
      const element = {
        elementName: 'Total Revenue',
        calculationDefinition: {
          calculationType: 'aggregated',
          formula: {
            businessDescription: 'Sum of revenue streams',
            aggregationMethod: 'sum'
          }
        }
      };

      const sourceColumns = [
        { componentField: 'sales', matchedColumn: 'monthly_sales', matchConfidence: 85, matched: true },
        { componentField: 'services', matchedColumn: 'service_revenue', matchConfidence: 80, matched: true }
      ];

      const result = buildCompositeTransformationLogic(element, sourceColumns);

      expect(result.code).toBe("df['monthly_sales'] + df['service_revenue']");
      expect(result.dependencies).toHaveLength(2);
    });

    it('should include warning for unmapped fields', () => {
      const element = {
        elementName: 'Complete Score',
        calculationDefinition: {
          calculationType: 'derived',
          formula: {
            businessDescription: 'Composite score',
            aggregationMethod: 'average'
          }
        }
      };

      const sourceColumns = [
        { componentField: 'Q1', matchedColumn: 'Q1_Score', matchConfidence: 100, matched: true },
        { componentField: 'Q2', matchedColumn: undefined, matchConfidence: 0, matched: false },
        { componentField: 'Q3', matchedColumn: 'Q3_Score', matchConfidence: 100, matched: true }
      ];

      const result = buildCompositeTransformationLogic(element, sourceColumns);

      expect(result.description).toContain('UNMAPPED FIELDS');
      expect(result.description).toContain('Q2');
      expect(result.validationRules[0]).toContain('1 component field(s) not mapped');
    });
  });

  describe('sourceColumns Rebuilding After AI Mapping', () => {
    it('should rebuild sourceColumns when AI provides actual column names', async () => {
      // Simulate AI mapping result
      const aiMapping = {
        sourceField: 'Q1_Workload',
        confidence: 0.9,
        derivationType: 'derived',
        componentFields: ['Q1_Workload', 'Q2_Growth', 'Q3_Recognition'],
        aggregationMethod: 'average',
        reasoning: 'These are the survey score columns'
      };

      const availableFields = ['Q1_Workload', 'Q2_Growth', 'Q3_Recognition', 'employee_id', 'department'];
      const schema = {
        Q1_Workload: { type: 'numeric' },
        Q2_Growth: { type: 'numeric' },
        Q3_Recognition: { type: 'numeric' },
        employee_id: { type: 'text' },
        department: { type: 'text' }
      };

      // Simulate matchComponentFields with AI-provided column names
      const sourceColumns = aiMapping.componentFields.map(cf => {
        const exists = availableFields.includes(cf);
        return {
          componentField: cf,
          matchedColumn: exists ? cf : undefined,
          matchConfidence: exists ? 100 : 0,
          matched: exists
        };
      });

      expect(sourceColumns).toHaveLength(3);
      expect(sourceColumns.every(sc => sc.matched)).toBe(true);
      expect(sourceColumns.map(sc => sc.matchedColumn)).toEqual(['Q1_Workload', 'Q2_Growth', 'Q3_Recognition']);
    });

    it('should handle partial matches when some AI columns do not exist', async () => {
      const aiMapping = {
        componentFields: ['Q1_Score', 'Q2_Score', 'Q3_NonExistent'],
      };

      const availableFields = ['Q1_Score', 'Q2_Score', 'other_column'];

      const sourceColumns = aiMapping.componentFields.map(cf => {
        const exists = availableFields.includes(cf);
        return {
          componentField: cf,
          matchedColumn: exists ? cf : undefined,
          matchConfidence: exists ? 100 : 0,
          matched: exists
        };
      });

      expect(sourceColumns[0].matched).toBe(true);
      expect(sourceColumns[1].matched).toBe(true);
      expect(sourceColumns[2].matched).toBe(false);
      expect(sourceColumns[2].matchedColumn).toBeUndefined();
    });
  });

  describe('Element Status Computation', () => {
    it('should mark element as found when at least one component is matched', () => {
      const sourceColumns = [
        { componentField: 'Q1', matchedColumn: 'Q1_Score', matchConfidence: 100, matched: true },
        { componentField: 'Q2', matchedColumn: undefined, matchConfidence: 0, matched: false }
      ];

      const matchedCount = sourceColumns.filter(sc => sc.matched).length;
      const found = matchedCount > 0;

      expect(found).toBe(true);
    });

    it('should mark element as not found when no components are matched', () => {
      const sourceColumns = [
        { componentField: 'xyz', matchedColumn: undefined, matchConfidence: 0, matched: false },
        { componentField: 'abc', matchedColumn: undefined, matchConfidence: 0, matched: false }
      ];

      const matchedCount = sourceColumns.filter(sc => sc.matched).length;
      const found = matchedCount > 0;

      expect(found).toBe(false);
    });

    it('should calculate average confidence correctly', () => {
      const sourceColumns = [
        { componentField: 'Q1', matchedColumn: 'Q1_Score', matchConfidence: 100, matched: true },
        { componentField: 'Q2', matchedColumn: 'Q2_Score', matchConfidence: 80, matched: true },
        { componentField: 'Q3', matchedColumn: 'Q3_Score', matchConfidence: 60, matched: true }
      ];

      const avgConfidence = sourceColumns.reduce((sum, sc) => sum + sc.matchConfidence, 0) / sourceColumns.length;

      expect(avgConfidence).toBe(80);
    });
  });
});
