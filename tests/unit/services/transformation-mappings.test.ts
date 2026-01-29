/**
 * Unit Tests for Transformation Mappings
 * Tests mapping persistence, composite element display, and transformation flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Transformation Mappings', () => {
  describe('Mapping Creation from Requirements Document', () => {
    interface TransformationMapping {
      targetElement: string;
      targetType: string;
      sourceColumn: string | null;
      sourceColumns?: string[];
      aggregationFunction?: string | null;
      confidence: number;
      transformationRequired: boolean;
      suggestedTransformation: string;
      calculationDefinition?: {
        formula?: string;
        componentFields?: string[];
        aggregationMethod?: string;
      };
    }

    const createMappingFromElement = (element: any): TransformationMapping => {
      const mappedColumn = element.sourceColumn || element.sourceField || null;
      const calcDef = element.calculationDefinition;

      // Resolve source columns from backend format or componentFields
      let resolvedSourceColumns: string[] | undefined;
      if (element.sourceColumns && Array.isArray(element.sourceColumns) && element.sourceColumns.length > 0) {
        // Backend provides richer format
        resolvedSourceColumns = element.sourceColumns
          .filter((sc: any) => sc.matched && sc.matchedColumn)
          .map((sc: any) => sc.matchedColumn);
      } else if (calcDef?.formula?.componentFields) {
        resolvedSourceColumns = calcDef.formula.componentFields;
      }

      // Generate suggested transformation
      let suggestedTransformation = element.suggestedTransformation || '';
      if (!suggestedTransformation && calcDef) {
        if (calcDef.formula?.businessDescription) {
          suggestedTransformation = calcDef.formula.businessDescription;
        } else if (calcDef.formula?.aggregationMethod && calcDef.formula?.componentFields?.length) {
          suggestedTransformation = `${calcDef.formula.aggregationMethod.toUpperCase()} of ${calcDef.formula.componentFields.join(', ')}`;
        }
      }

      // Determine if transformation is required
      const calculationType = calcDef?.calculationType;
      const needsTransformFromCalcType = calculationType &&
        ['derived', 'aggregated', 'grouped', 'composite'].includes(calculationType);
      const hasMultipleSourceColumns = (calcDef?.formula?.componentFields?.length || 0) > 1;
      const transformationRequired = needsTransformFromCalcType || hasMultipleSourceColumns;

      return {
        targetElement: element.name || element.elementName || '',
        targetType: element.type || element.dataType || 'string',
        sourceColumn: mappedColumn,
        sourceColumns: resolvedSourceColumns,
        aggregationFunction: calcDef?.formula?.aggregationMethod || null,
        confidence: element.confidence ?? (mappedColumn ? 0.9 : 0),
        transformationRequired: !!transformationRequired,
        suggestedTransformation,
        calculationDefinition: calcDef ? {
          formula: calcDef.formula?.businessDescription,
          componentFields: calcDef.formula?.componentFields,
          aggregationMethod: calcDef.formula?.aggregationMethod
        } : undefined
      };
    };

    it('should create mapping for direct element', () => {
      const element = {
        elementName: 'Employee ID',
        dataType: 'text',
        sourceColumn: 'employee_id',
        confidence: 1.0,
        calculationDefinition: {
          calculationType: 'direct'
        }
      };

      const mapping = createMappingFromElement(element);

      expect(mapping.targetElement).toBe('Employee ID');
      expect(mapping.sourceColumn).toBe('employee_id');
      expect(mapping.transformationRequired).toBe(false);
      expect(mapping.sourceColumns).toBeUndefined();
    });

    it('should create mapping for derived composite element', () => {
      const element = {
        elementName: 'Engagement Score',
        dataType: 'numeric',
        sourceColumn: 'Q1_Score',
        confidence: 0.85,
        calculationDefinition: {
          calculationType: 'derived',
          formula: {
            businessDescription: 'Average of survey scores',
            componentFields: ['Q1_Score', 'Q2_Score', 'Q3_Score'],
            aggregationMethod: 'average'
          }
        }
      };

      const mapping = createMappingFromElement(element);

      expect(mapping.targetElement).toBe('Engagement Score');
      expect(mapping.transformationRequired).toBe(true);
      expect(mapping.sourceColumns).toEqual(['Q1_Score', 'Q2_Score', 'Q3_Score']);
      expect(mapping.aggregationFunction).toBe('average');
      expect(mapping.suggestedTransformation).toBe('Average of survey scores');
    });

    it('should use rich sourceColumns format from backend', () => {
      const element = {
        elementName: 'Total Score',
        dataType: 'numeric',
        sourceColumns: [
          { componentField: 'Q1', matchedColumn: 'Q1_Workload', matchConfidence: 100, matched: true },
          { componentField: 'Q2', matchedColumn: 'Q2_Growth', matchConfidence: 85, matched: true },
          { componentField: 'Q3', matchedColumn: undefined, matchConfidence: 0, matched: false }
        ],
        calculationDefinition: {
          calculationType: 'aggregated',
          formula: {
            aggregationMethod: 'sum'
          }
        }
      };

      const mapping = createMappingFromElement(element);

      // Should only include matched columns
      expect(mapping.sourceColumns).toEqual(['Q1_Workload', 'Q2_Growth']);
      expect(mapping.transformationRequired).toBe(true);
    });

    it('should generate transformation suggestion for aggregated elements', () => {
      const element = {
        elementName: 'Department Total',
        dataType: 'numeric',
        calculationDefinition: {
          calculationType: 'aggregated',
          formula: {
            componentFields: ['sales', 'bonuses', 'commissions'],
            aggregationMethod: 'sum'
          }
        }
      };

      const mapping = createMappingFromElement(element);

      expect(mapping.suggestedTransformation).toBe('SUM of sales, bonuses, commissions');
    });
  });

  describe('Mapping Persistence', () => {
    it('should serialize mapping to JSON correctly', () => {
      const mapping = {
        targetElement: 'Score',
        sourceColumn: 'raw_score',
        sourceColumns: ['q1', 'q2', 'q3'],
        aggregationFunction: 'average',
        transformationRequired: true
      };

      const serialized = JSON.stringify(mapping);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.sourceColumns).toEqual(['q1', 'q2', 'q3']);
      expect(deserialized.aggregationFunction).toBe('average');
    });

    it('should handle undefined optional fields', () => {
      const mapping = {
        targetElement: 'ID',
        sourceColumn: 'employee_id',
        transformationRequired: false
      };

      const serialized = JSON.stringify(mapping);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.sourceColumns).toBeUndefined();
      expect(deserialized.aggregationFunction).toBeUndefined();
    });
  });

  describe('Multi-Column Mapping Operations', () => {
    const updateMultiColumnMapping = (
      mappings: any[],
      targetElement: string,
      sourceColumns: string[],
      aggregationFunction: string | null
    ): any[] => {
      return mappings.map(mapping => {
        if (mapping.targetElement === targetElement) {
          return {
            ...mapping,
            sourceColumn: sourceColumns.length === 1 ? sourceColumns[0] : sourceColumns[0],
            sourceColumns: sourceColumns.length > 0 ? sourceColumns : undefined,
            aggregationFunction: sourceColumns.length > 1 ? aggregationFunction : null,
            confidence: sourceColumns.length > 0 ? 1.0 : 0,
            transformationRequired: sourceColumns.length > 1 || mapping.transformationRequired,
            suggestedTransformation: sourceColumns.length > 1
              ? `Combine columns [${sourceColumns.join(', ')}] using ${aggregationFunction || 'average'}`
              : mapping.suggestedTransformation
          };
        }
        return mapping;
      });
    };

    it('should update mapping with multiple columns', () => {
      const mappings = [
        { targetElement: 'Score', sourceColumn: null, transformationRequired: false }
      ];

      const updated = updateMultiColumnMapping(
        mappings,
        'Score',
        ['Q1', 'Q2', 'Q3'],
        'average'
      );

      expect(updated[0].sourceColumns).toEqual(['Q1', 'Q2', 'Q3']);
      expect(updated[0].aggregationFunction).toBe('average');
      expect(updated[0].transformationRequired).toBe(true);
      expect(updated[0].suggestedTransformation).toContain('average');
    });

    it('should clear mapping when empty columns provided', () => {
      const mappings = [
        { targetElement: 'Score', sourceColumn: 'Q1', sourceColumns: ['Q1', 'Q2'], transformationRequired: true }
      ];

      const updated = updateMultiColumnMapping(
        mappings,
        'Score',
        [],
        null
      );

      expect(updated[0].sourceColumns).toBeUndefined();
      expect(updated[0].confidence).toBe(0);
    });

    it('should set single column without aggregation', () => {
      const mappings = [
        { targetElement: 'ID', sourceColumn: null, transformationRequired: false }
      ];

      const updated = updateMultiColumnMapping(
        mappings,
        'ID',
        ['employee_id'],
        null
      );

      expect(updated[0].sourceColumn).toBe('employee_id');
      expect(updated[0].sourceColumns).toEqual(['employee_id']);
      expect(updated[0].aggregationFunction).toBeNull();
    });
  });

  describe('Aggregation Function Selection', () => {
    const getDefaultAggregation = (dataType: string, elementName: string): string => {
      const nameLower = elementName.toLowerCase();

      if (nameLower.includes('total') || nameLower.includes('sum')) {
        return 'sum';
      }
      if (nameLower.includes('average') || nameLower.includes('mean') || nameLower.includes('score')) {
        return 'avg';
      }
      if (nameLower.includes('count') || nameLower.includes('number of')) {
        return 'count';
      }
      if (nameLower.includes('max') || nameLower.includes('highest')) {
        return 'max';
      }
      if (nameLower.includes('min') || nameLower.includes('lowest')) {
        return 'min';
      }

      // Default based on data type
      return dataType === 'numeric' ? 'avg' : 'concat';
    };

    it('should suggest sum for total-named elements', () => {
      expect(getDefaultAggregation('numeric', 'Total Revenue')).toBe('sum');
      expect(getDefaultAggregation('numeric', 'Sum of Sales')).toBe('sum');
    });

    it('should suggest average for score elements', () => {
      expect(getDefaultAggregation('numeric', 'Engagement Score')).toBe('avg');
      expect(getDefaultAggregation('numeric', 'Average Rating')).toBe('avg');
    });

    it('should suggest count for count-named elements', () => {
      expect(getDefaultAggregation('numeric', 'Employee Count')).toBe('count');
      expect(getDefaultAggregation('numeric', 'Number of Items')).toBe('count');
    });

    it('should default to avg for numeric types', () => {
      expect(getDefaultAggregation('numeric', 'Custom Metric')).toBe('avg');
    });

    it('should default to concat for text types', () => {
      expect(getDefaultAggregation('text', 'Combined Notes')).toBe('concat');
    });
  });

  describe('Transformation Validation', () => {
    const validateTransformationMapping = (mapping: any): {
      valid: boolean;
      errors: string[];
      warnings: string[];
    } => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Required target element
      if (!mapping.targetElement) {
        errors.push('Target element name is required');
      }

      // Source column required for non-optional elements
      if (!mapping.sourceColumn && !mapping.sourceColumns?.length) {
        if (mapping.required !== false) {
          errors.push(`Required element "${mapping.targetElement}" has no source column mapped`);
        } else {
          warnings.push(`Optional element "${mapping.targetElement}" has no source column mapped`);
        }
      }

      // Multi-column requires aggregation
      if (mapping.sourceColumns?.length > 1 && !mapping.aggregationFunction) {
        warnings.push(`Multi-column mapping for "${mapping.targetElement}" has no aggregation function`);
      }

      // Type compatibility check
      if (mapping.sourceColumns?.length > 1 && mapping.targetType === 'text' && mapping.aggregationFunction !== 'concat') {
        warnings.push(`Text element "${mapping.targetElement}" has numeric aggregation function`);
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };
    };

    it('should validate complete mapping', () => {
      const mapping = {
        targetElement: 'Score',
        sourceColumn: 'raw_score',
        sourceColumns: ['q1', 'q2'],
        aggregationFunction: 'avg',
        targetType: 'numeric'
      };

      const result = validateTransformationMapping(mapping);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should error on missing target element', () => {
      const mapping = {
        targetElement: '',
        sourceColumn: 'score'
      };

      const result = validateTransformationMapping(mapping);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target element name is required');
    });

    it('should error on required element without source', () => {
      const mapping = {
        targetElement: 'Required Field',
        sourceColumn: null,
        required: true
      };

      const result = validateTransformationMapping(mapping);

      expect(result.valid).toBe(false);
    });

    it('should warn on optional element without source', () => {
      const mapping = {
        targetElement: 'Optional Field',
        sourceColumn: null,
        required: false
      };

      const result = validateTransformationMapping(mapping);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn on multi-column without aggregation', () => {
      const mapping = {
        targetElement: 'Combined',
        sourceColumns: ['a', 'b', 'c'],
        aggregationFunction: null
      };

      const result = validateTransformationMapping(mapping);

      expect(result.warnings.some(w => w.includes('aggregation'))).toBe(true);
    });
  });

  describe('Transformation Execution Config', () => {
    const buildTransformationConfig = (mappings: any[]): {
      operations: any[];
      dependencies: Record<string, string[]>;
    } => {
      const operations: any[] = [];
      const dependencies: Record<string, string[]> = {};

      for (const mapping of mappings) {
        if (!mapping.transformationRequired) continue;

        const sourceColumns = mapping.sourceColumns || (mapping.sourceColumn ? [mapping.sourceColumn] : []);

        operations.push({
          targetColumn: mapping.targetElement,
          sourceColumns,
          operation: mapping.aggregationFunction || 'direct',
          config: mapping.calculationDefinition || {}
        });

        dependencies[mapping.targetElement] = sourceColumns;
      }

      return { operations, dependencies };
    };

    it('should build config for simple transformation', () => {
      const mappings = [
        {
          targetElement: 'FormattedDate',
          sourceColumn: 'raw_date',
          transformationRequired: true,
          aggregationFunction: null
        }
      ];

      const config = buildTransformationConfig(mappings);

      expect(config.operations).toHaveLength(1);
      expect(config.operations[0].targetColumn).toBe('FormattedDate');
      expect(config.operations[0].operation).toBe('direct');
    });

    it('should build config for aggregation transformation', () => {
      const mappings = [
        {
          targetElement: 'AverageScore',
          sourceColumns: ['Q1', 'Q2', 'Q3'],
          transformationRequired: true,
          aggregationFunction: 'avg'
        }
      ];

      const config = buildTransformationConfig(mappings);

      expect(config.operations[0].sourceColumns).toEqual(['Q1', 'Q2', 'Q3']);
      expect(config.operations[0].operation).toBe('avg');
      expect(config.dependencies['AverageScore']).toEqual(['Q1', 'Q2', 'Q3']);
    });

    it('should skip non-transformation mappings', () => {
      const mappings = [
        { targetElement: 'ID', sourceColumn: 'id', transformationRequired: false },
        { targetElement: 'Score', sourceColumn: 'score', transformationRequired: true }
      ];

      const config = buildTransformationConfig(mappings);

      expect(config.operations).toHaveLength(1);
      expect(config.operations[0].targetColumn).toBe('Score');
    });
  });

  describe('Join Configuration', () => {
    const autoDetectJoinKeys = (datasets: any[]): {
      enabled: boolean;
      type: 'left' | 'inner';
      foreignKeys: Array<{
        sourceDataset: string;
        sourceColumn: string;
        targetDataset: string;
        targetColumn: string;
      }>;
    } => {
      if (datasets.length < 2) {
        return { enabled: false, type: 'left', foreignKeys: [] };
      }

      const foreignKeys: any[] = [];
      const commonPatterns = [/id$/i, /key$/i, /code$/i, /_id$/i, /employee/i, /department/i, /user/i];

      const primaryDataset = datasets[0];
      const primaryColumns = Object.keys(primaryDataset.schema || {});

      for (let i = 1; i < datasets.length; i++) {
        const secondaryDataset = datasets[i];
        const secondaryColumns = Object.keys(secondaryDataset.schema || {});

        for (const primaryCol of primaryColumns) {
          for (const secondaryCol of secondaryColumns) {
            // Exact match
            if (primaryCol.toLowerCase() === secondaryCol.toLowerCase()) {
              foreignKeys.push({
                sourceDataset: primaryDataset.name,
                sourceColumn: primaryCol,
                targetDataset: secondaryDataset.name,
                targetColumn: secondaryCol
              });
              break;
            }

            // Pattern match
            const primaryMatches = commonPatterns.some(p => p.test(primaryCol));
            const secondaryMatches = commonPatterns.some(p => p.test(secondaryCol));

            if (primaryMatches && secondaryMatches) {
              const primaryBase = primaryCol.toLowerCase().replace(/_id$|id$/i, '');
              const secondaryBase = secondaryCol.toLowerCase().replace(/_id$|id$/i, '');

              if (primaryBase === secondaryBase || primaryBase.includes(secondaryBase) || secondaryBase.includes(primaryBase)) {
                foreignKeys.push({
                  sourceDataset: primaryDataset.name,
                  sourceColumn: primaryCol,
                  targetDataset: secondaryDataset.name,
                  targetColumn: secondaryCol
                });
                break;
              }
            }
          }
        }
      }

      return {
        enabled: foreignKeys.length > 0,
        type: 'left',
        foreignKeys
      };
    };

    it('should detect exact column name matches', () => {
      const datasets = [
        { name: 'employees', schema: { employee_id: 'text', name: 'text' } },
        { name: 'salaries', schema: { employee_id: 'text', salary: 'numeric' } }
      ];

      const result = autoDetectJoinKeys(datasets);

      expect(result.enabled).toBe(true);
      expect(result.foreignKeys).toHaveLength(1);
      expect(result.foreignKeys[0].sourceColumn).toBe('employee_id');
      expect(result.foreignKeys[0].targetColumn).toBe('employee_id');
    });

    it('should detect ID pattern matches', () => {
      const datasets = [
        { name: 'employees', schema: { emp_id: 'text', name: 'text' } },
        { name: 'departments', schema: { dept_id: 'text', dept_name: 'text' } }
      ];

      const result = autoDetectJoinKeys(datasets);

      // Both have _id suffix but different bases
      expect(result.enabled).toBe(false);
    });

    it('should return disabled for single dataset', () => {
      const datasets = [
        { name: 'employees', schema: { id: 'text' } }
      ];

      const result = autoDetectJoinKeys(datasets);

      expect(result.enabled).toBe(false);
      expect(result.foreignKeys).toHaveLength(0);
    });
  });
});
