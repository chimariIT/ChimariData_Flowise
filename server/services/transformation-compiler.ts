// server/services/transformation-compiler.ts
/**
 * Transformation Compiler Service
 *
 * Converts DS Agent's calculationDefinition (natural language + pseudocode)
 * into executable Python/JavaScript code with actual column names.
 *
 * Features:
 * - Code generation from aggregation methods
 * - Pseudocode parsing and substitution
 * - Engine selection based on row count
 * - Dependency ordering for multi-step transformations
 */

export interface CompiledTransformation {
  elementId: string;
  elementName: string;
  targetColumn: string;
  sourceColumns: string[];          // Actual mapped column names
  operation: 'add_calculated_column' | 'aggregate' | 'filter' | 'join' | 'derive';
  aggregationMethod: string;
  code: {
    python: string;
    javascript?: string;
  };
  executionEngine: 'javascript' | 'polars' | 'pandas' | 'spark';
  dependencies: string[];           // Element IDs that must be computed first
  businessDescription?: string;

  // Phase 3A: Multi-step KPI support
  stepType?: 'row_level' | 'cross_row_aggregate' | 'formula_apply';
  groupByColumns?: string[];        // Columns to GROUP BY for cross-row aggregation
  filterCondition?: {               // Optional row-level filter before aggregation
    column: string;
    operator: 'is_not_null' | 'is_null' | 'eq' | 'neq' | 'gt' | 'lt' | 'in';
    value: any;
  } | null;
  intermediateColumnName?: string;  // Column name for intermediate results
  isFinalStep?: boolean;            // True if this step produces the final KPI value
  aggregateFunction?: 'count' | 'count_distinct' | 'sum' | 'avg' | 'min' | 'max'; // For cross-row aggregation
}

/**
 * Date context for date-aware KPI calculations (Phase 4)
 */
export interface DateContext {
  periodColumn: string | null;
  periodGranularity: 'day' | 'month' | 'quarter' | 'year' | null;
  dateColumns: Array<{
    columnName: string;
    semanticRole: 'period_indicator' | 'event_date' | 'start_date' | 'end_date';
    nullMeaning: string;       // "employee is still active"
    presenceMeaning: string;   // "employee has separated"
  }>;
}

/**
 * P0-5: Analysis-type-specific data preparation hints
 * Tells the execution step what prep each analysis needs
 */
export interface AnalysisDataPrep {
  analysisType: string;
  missingValueStrategy: 'drop' | 'mean_impute' | 'median_impute' | 'mode_impute' | 'forward_fill' | 'none';
  encodeCategorical: boolean;
  normalizeFeatures: boolean;
  trainTestSplit: boolean;
  splitRatio?: number;            // e.g., 0.8 for 80/20 train/test
  checkAssumptions?: string[];    // e.g., ['linearity', 'multicollinearity', 'normality']
  outlierHandling: 'keep' | 'winsorize' | 'remove' | 'flag';
  minSampleSize?: number;
  notes?: string;
}

export interface ExecutionPlan {
  orderedSteps: CompiledTransformation[];
  totalSteps: number;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  primaryEngine: 'javascript' | 'polars' | 'pandas' | 'spark';
  /** P0-5: Per-analysis-type data preparation hints */
  analysisDataPrep?: AnalysisDataPrep[];
}

export interface ElementForCompilation {
  elementId: string;
  elementName: string;
  calculationDefinition?: {
    calculationType?: string;
    formula?: {
      componentFields?: string[];
      aggregationMethod?: string;
      pseudoCode?: string;
      code?: string;
      businessDescription?: string;
    };
  };
  dataType?: string;
}

/**
 * Question-to-element mapping from pipeline-question-mapping-builder
 */
export interface QuestionAnswerMapping {
  questionId: string;
  questionText: string;
  elementIds: string[];
  answerId?: string;
  answerText?: string;
  confidence?: number;
}

/**
 * Business context from project metadata
 */
export interface BusinessContext {
  industry?: string;
  companySize?: string;
  region?: string;
  businessGoals?: string[];
  constraints?: string[];
  kpiDefinitions?: Record<string, {
    conceptName: string;
    displayName?: string;
    formula: string;
    componentFields: string[];
    componentFieldDescriptors?: any[];
    aggregationMethod?: string;
  }>;
}

/**
 * Project metadata for compilation
 */
export interface ProjectMetadata {
  projectId: string;
  projectName?: string;
  userId?: string;
  createdAt?: Date;
}

/**
 * P0-5: CompilationContext - Pass question/business context through compilation pipeline
 *
 * This context enables the compiler to:
 * - Resolve business definitions using businessContext.kpiDefinitions
 * - Apply date-aware calculations using dateContext
 * - Generate analysis-appropriate transformations using analysisTypes
 * - Trace elements back to source questions using questionAnswerMapping
 */
export interface CompilationContext {
  questionAnswerMapping?: Map<string, QuestionAnswerMapping>;
  businessContext?: BusinessContext;
  dateContext?: DateContext;
  analysisTypes?: string[];
  projectMetadata?: ProjectMetadata;
}

const SMALL_DATASET_THRESHOLD = 100_000;
const MEDIUM_DATASET_THRESHOLD = 10_000_000;

export class TransformationCompiler {
  /**
   * P0-5: Compile a single element's transformation with context
   *
   * @param element - Element to compile
   * @param columnMappings - Abstract column name to actual column name mapping
   * @param rowCount - Number of rows in dataset (for engine selection)
   * @param context - Compilation context with question/business information
   */
  compileElement(
    element: ElementForCompilation,
    columnMappings: Map<string, string>,  // abstract -> actual
    rowCount: number,
    context?: CompilationContext
  ): CompiledTransformation {
    const calcDef = element.calculationDefinition;
    const kpiDef = context?.businessContext?.kpiDefinitions?.[element.elementName];
    const formula = { ...(calcDef?.formula || {}) } as NonNullable<ElementForCompilation['calculationDefinition']>['formula'];

    if (kpiDef) {
      if (!formula?.componentFields?.length && Array.isArray(kpiDef.componentFields) && kpiDef.componentFields.length > 0) {
        formula.componentFields = kpiDef.componentFields;
      }
      if (!formula?.aggregationMethod && kpiDef.aggregationMethod) {
        formula.aggregationMethod = kpiDef.aggregationMethod;
      }
      if (!formula?.pseudoCode && kpiDef.formula) {
        formula.pseudoCode = kpiDef.formula;
      }
      if (!formula?.businessDescription && kpiDef.displayName) {
        formula.businessDescription = kpiDef.displayName;
      }
    }

    // P0-5: Log compilation with context for debugging
    if (context?.questionAnswerMapping) {
      const relatedQuestions = Array.from(context.questionAnswerMapping.values())
        .filter(mapping => mapping.elementIds.includes(element.elementId));
      if (relatedQuestions.length > 0) {
        console.log(`📋 [Compiler] Compiling element "${element.elementName}" for questions: ${relatedQuestions.map(q => q.questionText.substring(0, 50) + '...').join(', ')}`);
      }
    }

    // P0-5: Resolve business definition if available in context
    let businessDefinition = formula?.businessDescription;
    if (kpiDef) {
      businessDefinition = kpiDef.businessDescription || businessDefinition;
      console.log(`📊 [Compiler] Using business definition from context for "${element.elementName}"`);
    }

    // Determine execution engine based on row count
    const engine = this.selectEngine(rowCount);

    // Get actual source columns from mappings
    const abstractFields = formula?.componentFields || [];
    const sourceColumns = abstractFields
      .map(f => columnMappings.get(f) || f)
      .filter(Boolean);

    // Get aggregation method
    const aggregationMethod = formula?.aggregationMethod || 'mean';

    // Generate Python code
    const pythonCode = this.generatePythonCode(
      element.elementName,
      sourceColumns,
      aggregationMethod,
      formula?.pseudoCode,
      engine,
      context
    );

    // Generate JavaScript code for small datasets
    const jsCode = engine === 'javascript'
      ? this.generateJavaScriptCode(element.elementName, sourceColumns, aggregationMethod, context)
      : undefined;

    return {
      elementId: element.elementId,
      elementName: element.elementName,
      targetColumn: this.sanitizeColumnName(element.elementName),
      sourceColumns,
      operation: 'add_calculated_column',
      aggregationMethod,
      code: {
        python: pythonCode,
        javascript: jsCode
      },
      executionEngine: engine,
      // Phase 3C FIX: Resolve dependencies from formula references
      // P0-3 FIX: Pass empty array here; dependencies are properly resolved
      // in compileElements() post-processing with the full allElements array.
      // If called standalone, caller must resolve dependencies separately.
      dependencies: [],
      businessDescription: businessDescription
    };
  }

  /**
   * Phase 3C: Resolve dependencies by checking if sourceColumns reference
   * any other element's targetColumn
   */
  private resolveDependencies(
    element: ElementForCompilation,
    sourceColumns: string[],
    allElements: ElementForCompilation[]
  ): string[] {
    const deps: string[] = [];
    for (const col of sourceColumns) {
      // Check if this source column is the output of another element
      for (const other of allElements) {
        if (other.elementId === element.elementId) continue;
        const otherTarget = this.sanitizeColumnName(other.elementName);
        if (col === otherTarget || col === other.elementName) {
          deps.push(other.elementId);
        }
      }
    }
    return deps;
  }

  /**
   * Phase 3B: Compile a multi-step KPI from a business definition with descriptors.
   * P0-5: Accepts and passes compilation context
   *
   * For turnover rate, this generates ordered steps:
   * 1. (row_level) _is_separated = 1 IF termination_date IS NOT NULL ELSE 0
   * 2. (cross_row_aggregate) _separation_count = GROUP BY groupByColumns, SUM(_is_separated)
   * 3. (cross_row_aggregate) _employee_count = GROUP BY groupByColumns, COUNT(*)
   * 4. (formula_apply) Turnover_Rate = (_separation_count / _employee_count) * 100
   *
   * @param definition - Business definition of the KPI
   * @param columnMappings - Abstract column name to actual column name mapping
   * @param groupByColumns - Columns to group by (from question decomposition dimensions)
   * @param rowCount - Number of rows in dataset (for engine selection)
   * @param context - Compilation context with question/business information
   */
  compileMultiStepKPI(
    definition: {
      conceptName: string;
      displayName?: string;
      formula: string;
      componentFields: string[];
      componentFieldDescriptors?: any[];
      aggregationMethod?: string;
    },
    columnMappings: Map<string, string>,  // abstract → actual column name
    groupByColumns: string[],             // From question decomposition dimensions
    rowCount: number,
    context?: CompilationContext
  ): CompiledTransformation[] {
    const engine = this.selectEngine(rowCount);
    const steps: CompiledTransformation[] = [];
    const kpiName = this.sanitizeColumnName(definition.displayName || definition.conceptName);
    const descriptors = definition.componentFieldDescriptors || [];

    console.log(`🔧 [Compiler] Compiling multi-step KPI: "${definition.displayName || definition.conceptName}" with ${descriptors.length} descriptors`);
    console.log(`   Group-by columns: [${groupByColumns.join(', ')}]`);

    let stepIndex = 0;

    // Step 1: Generate row-level intermediate columns from descriptors
    for (const descriptor of descriptors) {
      if (!descriptor.isIntermediate) continue;

      const actualColumn = columnMappings.get(descriptor.abstractName) || descriptor.abstractName;
      const intermediateCol = `_${descriptor.abstractName}`;
      stepIndex++;
      const stepId = `${kpiName}_step_${stepIndex}`;

      if (descriptor.columnMatchType === 'date_presence_indicator') {
        // Row-level: Create binary column from date null check
        const pythonCode = engine === 'polars'
          ? `df = df.with_columns(pl.when(pl.col('${this.escapeColumn(actualColumn)}').is_not_null()).then(1).otherwise(0).alias('${intermediateCol}'))`
          : `df['${intermediateCol}'] = df['${this.escapeColumn(actualColumn)}'].notna().astype(int)`;

        const jsCode = `row['${intermediateCol}'] = (row['${this.escapeColumn(actualColumn)}'] !== null && row['${this.escapeColumn(actualColumn)}'] !== undefined && row['${this.escapeColumn(actualColumn)}'] !== '') ? 1 : 0;`;

        steps.push({
          elementId: stepId,
          elementName: `${descriptor.abstractName} (indicator)`,
          targetColumn: intermediateCol,
          sourceColumns: [actualColumn],
          operation: 'derive',
          aggregationMethod: 'indicator',
          stepType: 'row_level',
          code: { python: pythonCode, javascript: jsCode },
          executionEngine: engine,
          dependencies: [],
          isFinalStep: false,
          intermediateColumnName: intermediateCol,
          filterCondition: {
            column: actualColumn,
            operator: 'is_not_null',
            value: null
          },
          businessDescription: descriptor.semanticMeaning
        });
      } else if (descriptor.columnMatchType === 'count_distinct') {
        // This will be handled in cross-row aggregation step below
        // No row-level step needed for count_distinct
      }
    }

    // Step 2-3: Generate cross-row aggregation steps for each component
    for (const descriptor of descriptors) {
      if (!descriptor.isIntermediate) continue;

      const actualColumn = columnMappings.get(descriptor.abstractName) || descriptor.abstractName;
      stepIndex++;
      const stepId = `${kpiName}_step_${stepIndex}`;

      if (descriptor.columnMatchType === 'date_presence_indicator') {
        // Cross-row: SUM the indicator column, grouped by groupByColumns
        const intermediateCol = `_${descriptor.abstractName}`;
        const aggCol = `_${descriptor.abstractName}_count`;
        const groupCols = groupByColumns.map(c => `'${this.escapeColumn(c)}'`).join(', ');

        const pythonCode = groupByColumns.length > 0
          ? engine === 'polars'
            ? `df = df.join(df.group_by([${groupCols}]).agg(pl.col('${intermediateCol}').sum().alias('${aggCol}')), on=[${groupCols}], how='left')`
            : `df = df.merge(df.groupby([${groupCols}])['${intermediateCol}'].sum().reset_index(name='${aggCol}'), on=[${groupCols.replace(/'/g, '')}], how='left')`
          : engine === 'polars'
            ? `df = df.with_columns(pl.col('${intermediateCol}').sum().alias('${aggCol}'))`
            : `df['${aggCol}'] = df['${intermediateCol}'].sum()`;

        const jsCode = groupByColumns.length > 0
          ? `// Cross-row aggregation: must be computed across all rows, not per-row
row['${aggCol}'] = row['${aggCol}'] || null; // Populated by cross-row step`
          : `row['${aggCol}'] = row['__total_${descriptor.abstractName}'] || null;`;

        steps.push({
          elementId: stepId,
          elementName: `${descriptor.abstractName} count`,
          targetColumn: aggCol,
          sourceColumns: [intermediateCol],
          operation: 'aggregate',
          aggregationMethod: 'sum',
          stepType: 'cross_row_aggregate',
          groupByColumns,
          aggregateFunction: 'sum',
          code: { python: pythonCode, javascript: jsCode },
          executionEngine: engine,
          dependencies: steps.filter(s => s.targetColumn === intermediateCol).map(s => s.elementId),
          isFinalStep: false,
          intermediateColumnName: aggCol,
          businessDescription: `Aggregate: SUM of ${descriptor.abstractName} grouped by [${groupByColumns.join(', ')}]`
        });
      } else if (descriptor.columnMatchType === 'count_distinct') {
        // Cross-row: COUNT DISTINCT, grouped by groupByColumns
        const aggCol = `_${descriptor.abstractName}_count`;
        const groupCols = groupByColumns.map(c => `'${this.escapeColumn(c)}'`).join(', ');

        const pythonCode = groupByColumns.length > 0
          ? engine === 'polars'
            ? `df = df.join(df.group_by([${groupCols}]).agg(pl.col('${this.escapeColumn(actualColumn)}').n_unique().alias('${aggCol}')), on=[${groupCols}], how='left')`
            : `df = df.merge(df.groupby([${groupCols.replace(/'/g, '')}])['${this.escapeColumn(actualColumn)}'].nunique().reset_index(name='${aggCol}'), on=[${groupCols.replace(/'/g, '')}], how='left')`
          : engine === 'polars'
            ? `df = df.with_columns(pl.col('${this.escapeColumn(actualColumn)}').n_unique().alias('${aggCol}'))`
            : `df['${aggCol}'] = df['${this.escapeColumn(actualColumn)}'].nunique()`;

        steps.push({
          elementId: stepId,
          elementName: `${descriptor.abstractName} count`,
          targetColumn: aggCol,
          sourceColumns: [actualColumn],
          operation: 'aggregate',
          aggregationMethod: 'count_distinct',
          stepType: 'cross_row_aggregate',
          groupByColumns,
          aggregateFunction: 'count_distinct',
          code: { python: pythonCode },
          executionEngine: engine,
          dependencies: [],
          isFinalStep: false,
          intermediateColumnName: aggCol,
          businessDescription: `Aggregate: COUNT DISTINCT ${descriptor.abstractName} grouped by [${groupByColumns.join(', ')}]`
        });
      }
    }

    // Final Step: Apply the formula
    // Parse formula like "(employees_left / total_employees) * 100"
    stepIndex++;
    const finalStepId = `${kpiName}_step_${stepIndex}`;

    // Build column references for the formula
    let formulaCode = definition.formula;
    const formulaSourceCols: string[] = [];

    for (const field of definition.componentFields) {
      const aggCol = `_${field}_count`;
      const hasAggStep = steps.some(s => s.targetColumn === aggCol);
      const colRef = hasAggStep ? aggCol : (columnMappings.get(field) || field);
      formulaCode = formulaCode.replace(new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), colRef);
      formulaSourceCols.push(colRef);
    }

    const pythonFormulaCode = engine === 'polars'
      ? `df = df.with_columns((${formulaCode.replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, (match) => {
          return formulaSourceCols.includes(match) ? `pl.col('${match}')` : match;
        })}).alias('${kpiName}'))`
      : `df['${kpiName}'] = ${formulaCode.replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, (match) => {
          return formulaSourceCols.includes(match) ? `df['${match}']` : match;
        })}`;

    const jsFormulaCode = `
row['${kpiName}'] = (function() {
  ${formulaSourceCols.map(c => `const ${c.replace(/[^a-zA-Z0-9_]/g, '_')} = parseFloat(row['${c}']) || 0;`).join('\n  ')}
  const result = ${formulaCode};
  return isFinite(result) ? Math.round(result * 100) / 100 : null;
})();`.trim();

    steps.push({
      elementId: finalStepId,
      elementName: definition.displayName || definition.conceptName,
      targetColumn: kpiName,
      sourceColumns: formulaSourceCols,
      operation: 'derive',
      aggregationMethod: 'formula',
      stepType: 'formula_apply',
      code: { python: pythonFormulaCode, javascript: jsFormulaCode },
      executionEngine: engine,
      dependencies: steps.filter(s => formulaSourceCols.includes(s.targetColumn)).map(s => s.elementId),
      isFinalStep: true,
      businessDescription: `Final formula: ${definition.formula} → ${definition.displayName || definition.conceptName}`
    });

    console.log(`✅ [Compiler] Generated ${steps.length} steps for KPI "${definition.displayName || definition.conceptName}":`);
    steps.forEach((s, i) => {
      console.log(`   Step ${i + 1}: [${s.stepType}] ${s.targetColumn} = ${s.businessDescription?.substring(0, 60)}...`);
    });

    return steps;
  }

  /**
   * Phase 5: Generate hierarchical comparison steps.
   * P0-5: Accepts and passes compilation context
   *
   * When comparing group-level KPI to a baseline (e.g., per-leader turnover vs company turnover):
   * 1. Compute the KPI at detail level (already done by compileMultiStepKPI with groupByColumns)
   * 2. Compute the KPI at baseline level (no grouping, or different grouping)
   * 3. Add a comparison column: difference = detail_rate - baseline_rate
   *
   * @param kpiSteps - The steps from compileMultiStepKPI() for the detail level
   * @param definition - Business definition of the KPI
   * @param columnMappings - Abstract column name to actual column name mapping
   * @param baselineGroupByColumns - Grouping columns for baseline ([] for overall)
   * @param rowCount - Number of rows in dataset (for engine selection)
   * @param comparisonLabel - Label for the comparison (e.g., "vs Company Average")
   * @param context - Compilation context with question/business information
   */
  compileHierarchicalComparison(
    kpiSteps: CompiledTransformation[],
    definition: {
      conceptName: string;
      displayName?: string;
      formula: string;
      componentFields: string[];
      componentFieldDescriptors?: any[];
    },
    columnMappings: Map<string, string>,
    baselineGroupByColumns: string[],
    rowCount: number,
    comparisonLabel: string = 'Baseline',
    context?: CompilationContext
  ): CompiledTransformation[] {
    const engine = this.selectEngine(rowCount);
    const kpiName = this.sanitizeColumnName(definition.displayName || definition.conceptName);
    const baselineKpiName = `_${kpiName}_baseline`;
    const diffColName = `${kpiName}_vs_${comparisonLabel.replace(/\s+/g, '_')}`;

    // P0-5: Generate the baseline-level KPI steps with context (same formula, different/no grouping)
    const baselineSteps = this.compileMultiStepKPI(
      definition,
      columnMappings,
      baselineGroupByColumns,
      rowCount,
      context
    );

    // Rename targets to avoid collision with detail-level columns
    for (const step of baselineSteps) {
      const originalTarget = step.targetColumn;
      step.targetColumn = `_baseline_${originalTarget}`;
      step.elementId = `baseline_${step.elementId}`;
      step.elementName = `${step.elementName} (${comparisonLabel})`;

      // Update dependencies to reference baseline IDs
      step.dependencies = step.dependencies.map(d => `baseline_${d}`);

      // Update source column references in code
      if (step.code.python) {
        step.code.python = step.code.python.replace(
          new RegExp(originalTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          step.targetColumn
        );
      }
      if (step.code.javascript) {
        step.code.javascript = step.code.javascript.replace(
          new RegExp(originalTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          step.targetColumn
        );
      }
    }

    // Update the last baseline step to be the final formula
    const lastBaselineStep = baselineSteps[baselineSteps.length - 1];
    if (lastBaselineStep) {
      lastBaselineStep.targetColumn = baselineKpiName;
      lastBaselineStep.isFinalStep = false;
    }

    // Generate comparison step: difference = detail - baseline
    const comparisonStepId = `${kpiName}_comparison`;
    const detailStep = kpiSteps[kpiSteps.length - 1]; // Last step = final KPI value

    const pythonCompCode = engine === 'polars'
      ? `df = df.with_columns((pl.col('${kpiName}') - pl.col('${baselineKpiName}')).alias('${diffColName}'))`
      : `df['${diffColName}'] = df['${kpiName}'] - df['${baselineKpiName}']`;

    const jsCompCode = `row['${diffColName}'] = (parseFloat(row['${kpiName}']) || 0) - (parseFloat(row['${baselineKpiName}']) || 0);`;

    const comparisonStep: CompiledTransformation = {
      elementId: comparisonStepId,
      elementName: `${definition.displayName || definition.conceptName} vs ${comparisonLabel}`,
      targetColumn: diffColName,
      sourceColumns: [kpiName, baselineKpiName],
      operation: 'derive',
      aggregationMethod: 'formula',
      stepType: 'formula_apply',
      code: { python: pythonCompCode, javascript: jsCompCode },
      executionEngine: engine,
      dependencies: [detailStep?.elementId || '', lastBaselineStep?.elementId || ''].filter(Boolean),
      isFinalStep: true,
      businessDescription: `Comparison: ${definition.displayName || definition.conceptName} (per group) - ${comparisonLabel}`
    };

    console.log(`✅ [Compiler] Generated ${baselineSteps.length + 1} hierarchical comparison steps for "${comparisonLabel}"`);

    return [...baselineSteps, comparisonStep];
  }

  /**
   * Compile multiple elements into an execution plan
   * Phase 3C: Now resolves inter-element dependencies
   * P0-5: Accepts and passes compilation context
   */
  compileElements(
    elements: ElementForCompilation[],
    columnMappings: Map<string, string>,
    rowCount: number,
    context?: CompilationContext
  ): CompiledTransformation[] {
    const compilable = elements.filter(el => el.calculationDefinition?.formula?.componentFields);
    const compiled = compilable.map(el => this.compileElement(el, columnMappings, rowCount, context));

    // P0-5: Log context summary
    if (context) {
      console.log(`📋 [Compiler] Compiling ${compilable.length} elements with context:`);
      if (context.questionAnswerMapping?.size) {
        console.log(`   - Question-answer mappings: ${context.questionAnswerMapping.size}`);
      }
      if (context.businessContext?.kpiDefinitions) {
        console.log(`   - Business definitions: ${Object.keys(context.businessContext.kpiDefinitions).length}`);
      }
      if (context.analysisTypes) {
        console.log(`   - Analysis types: ${context.analysisTypes.join(', ')}`);
      }
    }

    // Phase 3C: Post-process to resolve cross-element dependencies
    for (const t of compiled) {
      t.dependencies = this.resolveDependencies(
        compilable.find(e => e.elementId === t.elementId)!,
        t.sourceColumns,
        compilable
      );
    }

    return compiled;
  }

  /**
   * P0-5: Build execution plan with dependency ordering and context
   *
   * @param transformations - Compiled transformations to order
   * @param context - Optional compilation context for analysis data prep
   */
  buildExecutionPlan(
    transformations: CompiledTransformation[],
    context?: CompilationContext
  ): ExecutionPlan {
    // Topological sort based on dependencies
    const sorted = this.topologicalSort(transformations);

    const complexity = sorted.length <= 3 ? 'simple'
                     : sorted.length <= 10 ? 'moderate'
                     : 'complex';

    // Determine primary engine (use most common)
    const engineCounts = new Map<string, number>();
    for (const t of sorted) {
      engineCounts.set(t.executionEngine, (engineCounts.get(t.executionEngine) || 0) + 1);
    }
    let primaryEngine: 'javascript' | 'polars' | 'pandas' | 'spark' = 'javascript';
    let maxCount = 0;
    Array.from(engineCounts.entries()).forEach(([engine, count]) => {
      if (count > maxCount) {
        maxCount = count;
        primaryEngine = engine as any;
      }
    });

    // P0-5: Generate analysis data preparation hints from context
    let analysisDataPrep: AnalysisDataPrep[] | undefined;
    if (context?.analysisTypes && context.analysisTypes.length > 0) {
      analysisDataPrep = TransformationCompiler.getAnalysisDataPrep(context.analysisTypes);
      console.log(`📊 [Compiler] Generated ${analysisDataPrep.length} analysis data prep hints`);
    }

    return {
      orderedSteps: sorted,
      totalSteps: sorted.length,
      estimatedComplexity: complexity,
      primaryEngine,
      analysisDataPrep
    };
  }

  /**
   * Validate compiled transformations without executing them.
   * Checks for:
   *   - Empty or missing source columns
   *   - Missing Python code
   *   - Unresolved dependencies (referencing non-existent elements)
   *   - Circular dependencies (via topological sort)
   *   - Dangerous code patterns (import os, exec, eval, subprocess)
   *
   * Returns a list of validation issues. Empty array = valid.
   */
  validateTransformations(
    transformations: CompiledTransformation[],
    availableColumns?: string[]
  ): Array<{ elementId: string; elementName: string; severity: 'error' | 'warning'; message: string }> {
    const issues: Array<{ elementId: string; elementName: string; severity: 'error' | 'warning'; message: string }> = [];
    const elementIds = new Set(transformations.map(t => t.elementId));

    for (const t of transformations) {
      // Check for empty source columns
      if (!t.sourceColumns || t.sourceColumns.length === 0) {
        issues.push({
          elementId: t.elementId,
          elementName: t.elementName,
          severity: 'warning',
          message: `No source columns mapped for "${t.elementName}". Transformation may produce empty results.`
        });
      }

      // Check source columns exist in available data
      if (availableColumns && t.sourceColumns) {
        for (const col of t.sourceColumns) {
          if (!availableColumns.includes(col) && !elementIds.has(col)) {
            issues.push({
              elementId: t.elementId,
              elementName: t.elementName,
              severity: 'error',
              message: `Source column "${col}" not found in dataset for "${t.elementName}".`
            });
          }
        }
      }

      // Check for missing Python code
      if (!t.code?.python || t.code.python.trim().length === 0) {
        issues.push({
          elementId: t.elementId,
          elementName: t.elementName,
          severity: 'error',
          message: `No Python code generated for "${t.elementName}". Cannot execute transformation.`
        });
      }

      // Check for dangerous code patterns
      if (t.code?.python) {
        const dangerousPatterns = [
          /\bimport\s+os\b/,
          /\bimport\s+subprocess\b/,
          /\bimport\s+sys\b/,
          /\b__import__\b/,
          /\beval\s*\(/,
          /\bexec\s*\(/,
          /\bos\.\w+/,
          /\bsubprocess\.\w+/,
          /\bopen\s*\(/,
        ];
        for (const pattern of dangerousPatterns) {
          if (pattern.test(t.code.python)) {
            issues.push({
              elementId: t.elementId,
              elementName: t.elementName,
              severity: 'error',
              message: `Potentially unsafe code pattern detected in "${t.elementName}": ${pattern.source}`
            });
          }
        }
      }

      // Check for unresolved dependencies
      for (const dep of t.dependencies) {
        if (!elementIds.has(dep)) {
          issues.push({
            elementId: t.elementId,
            elementName: t.elementName,
            severity: 'error',
            message: `Unresolved dependency "${dep}" for "${t.elementName}". Required element not in compilation set.`
          });
        }
      }
    }

    // Check for circular dependencies
    try {
      this.topologicalSort(transformations);
    } catch (circularError: any) {
      issues.push({
        elementId: 'circular',
        elementName: 'Dependency Graph',
        severity: 'error',
        message: circularError.message || 'Circular dependency detected among transformations.'
      });
    }

    return issues;
  }

  /**
   * P0-5: Generate analysis-type-specific data preparation hints
   * These hints tell the Python execution scripts what prep is needed
   */
  static getAnalysisDataPrep(analysisTypes: string[]): AnalysisDataPrep[] {
    const prepMap: Record<string, AnalysisDataPrep> = {
      'descriptive_stats': {
        analysisType: 'descriptive_stats',
        missingValueStrategy: 'none', // Show actual missing counts
        encodeCategorical: false,
        normalizeFeatures: false,
        trainTestSplit: false,
        outlierHandling: 'flag',
        minSampleSize: 5,
        notes: 'Report distributions, central tendency, and missing patterns'
      },
      'correlation': {
        analysisType: 'correlation',
        missingValueStrategy: 'drop', // Pairwise or listwise deletion
        encodeCategorical: false, // Numeric pairs only
        normalizeFeatures: false,
        trainTestSplit: false,
        outlierHandling: 'winsorize',
        minSampleSize: 10,
        notes: 'Check for linearity; Kendall for ordinal data, Spearman for non-normal'
      },
      'regression': {
        analysisType: 'regression',
        missingValueStrategy: 'mean_impute',
        encodeCategorical: true,     // One-hot or label encode predictors
        normalizeFeatures: false,    // Not required for OLS but helps interpretation
        trainTestSplit: true,
        splitRatio: 0.8,
        checkAssumptions: ['linearity', 'multicollinearity', 'normality', 'homoscedasticity'],
        outlierHandling: 'winsorize',
        minSampleSize: 30,
        notes: 'Check VIF for multicollinearity; encode categoricals before fitting'
      },
      'clustering': {
        analysisType: 'clustering',
        missingValueStrategy: 'median_impute',
        encodeCategorical: true,     // Numeric features required for distance
        normalizeFeatures: true,     // Critical: scale features for distance-based algorithms
        trainTestSplit: false,
        outlierHandling: 'winsorize',
        minSampleSize: 20,
        notes: 'Normalize/standardize features; check silhouette scores for k selection'
      },
      'time_series': {
        analysisType: 'time_series',
        missingValueStrategy: 'forward_fill', // Temporal interpolation
        encodeCategorical: false,
        normalizeFeatures: false,
        trainTestSplit: true,
        splitRatio: 0.8,
        checkAssumptions: ['stationarity'],
        outlierHandling: 'flag',
        minSampleSize: 24,
        notes: 'Sort by date; check stationarity (ADF test); use time-based split'
      },
      'predictive': {
        analysisType: 'predictive',
        missingValueStrategy: 'median_impute',
        encodeCategorical: true,
        normalizeFeatures: true,
        trainTestSplit: true,
        splitRatio: 0.8,
        checkAssumptions: [],
        outlierHandling: 'winsorize',
        minSampleSize: 50,
        notes: 'Feature engineering recommended; cross-validation preferred over simple split'
      }
    };

    // Map analysis types to prep hints, with intelligent defaults
    return analysisTypes.map(type => {
      const normalized = type.toLowerCase().replace(/[\s-]+/g, '_');
      // Try exact match, then prefix match
      const prep = prepMap[normalized]
        || prepMap[Object.keys(prepMap).find(k => normalized.includes(k) || k.includes(normalized)) || '']
        || {
          analysisType: type,
          missingValueStrategy: 'drop' as const,
          encodeCategorical: false,
          normalizeFeatures: false,
          trainTestSplit: false,
          outlierHandling: 'keep' as const,
          notes: 'Generic analysis - no specific preparation required'
        };
      return { ...prep, analysisType: type };
    });
  }

  /**
   * Select execution engine based on row count
   */
  private selectEngine(rowCount: number): 'javascript' | 'polars' | 'pandas' | 'spark' {
    const sparkAvailable = process.env.SPARK_ENABLED === 'true';

    if (rowCount < SMALL_DATASET_THRESHOLD) {
      return 'javascript';
    } else if (rowCount < MEDIUM_DATASET_THRESHOLD) {
      return 'polars';
    } else if (sparkAvailable) {
      return 'spark';
    } else {
      console.warn('⚠️ Large dataset without Spark - using Polars');
      return 'polars';
    }
  }

  /**
   * P0-5: Generate Python code from aggregation method with context
   *
   * @param targetColumn - Name of the target column to create
   * @param sourceColumns - Source column names to use in calculation
   * @param aggregationMethod - Aggregation method to apply (mean, sum, etc.)
   * @param pseudoCode - Optional pseudo-code template to use
   * @param engine - Python engine to use (pandas, polars)
   * @param context - Compilation context for enhanced code generation
   */
  private generatePythonCode(
    targetColumn: string,
    sourceColumns: string[],
    aggregationMethod: string,
    pseudoCode?: string,
    engine: string = 'pandas',
    context?: CompilationContext
  ): string {
    const targetCol = this.sanitizeColumnName(targetColumn);
    const colList = sourceColumns.map(c => `'${this.escapeColumn(c)}'`).join(', ');

    // If pseudoCode provided, substitute actual column names
    if (pseudoCode) {
      let code = pseudoCode;
      // Replace abstract placeholders with actual column names
      for (let i = 0; i < sourceColumns.length; i++) {
        // Handle various placeholder patterns
        code = code.replace(new RegExp(`\\$\\{${i}\\}`, 'g'), `'${sourceColumns[i]}'`);
        code = code.replace(new RegExp(`\\$col${i + 1}`, 'gi'), `'${sourceColumns[i]}'`);
      }
      return code;
    }

    // Generate based on aggregation method
    if (engine === 'polars') {
      return this.generatePolarsCode(targetCol, colList, aggregationMethod);
    } else {
      return this.generatePandasCode(targetCol, colList, aggregationMethod);
    }
  }

  /**
   * Generate Polars code (5-10x faster than Pandas)
   */
  private generatePolarsCode(targetCol: string, colList: string, aggregationMethod: string): string {
    switch (aggregationMethod.toLowerCase()) {
      case 'mean':
      case 'average':
      case 'avg':
        return `df = df.with_columns(pl.mean_horizontal([${colList}]).alias('${targetCol}'))`;
      case 'sum':
        return `df = df.with_columns(pl.sum_horizontal([${colList}]).alias('${targetCol}'))`;
      case 'min':
        return `df = df.with_columns(pl.min_horizontal([${colList}]).alias('${targetCol}'))`;
      case 'max':
        return `df = df.with_columns(pl.max_horizontal([${colList}]).alias('${targetCol}'))`;
      case 'count':
        return `df = df.with_columns(pl.concat_list([${colList}]).list.len().alias('${targetCol}'))`;
      case 'std':
        // Polars doesn't have std_horizontal, calculate manually
        return `
# Calculate standard deviation across columns
_cols = [${colList}]
_mean = pl.mean_horizontal(_cols)
_squared_diff_sum = pl.sum_horizontal([(pl.col(c) - _mean)**2 for c in _cols])
df = df.with_columns((_squared_diff_sum / len(_cols)).sqrt().alias('${targetCol}'))
`.trim();
      case 'concat':
        return `df = df.with_columns(pl.concat_str([${colList}], separator=' ').alias('${targetCol}'))`;
      case 'first':
        return `df = df.with_columns(pl.coalesce([${colList}]).alias('${targetCol}'))`;
      default:
        return `df = df.with_columns(pl.mean_horizontal([${colList}]).alias('${targetCol}'))`;
    }
  }

  /**
   * Generate Pandas code
   */
  private generatePandasCode(targetCol: string, colList: string, aggregationMethod: string): string {
    switch (aggregationMethod.toLowerCase()) {
      case 'mean':
      case 'average':
      case 'avg':
        return `df['${targetCol}'] = df[[${colList}]].mean(axis=1)`;
      case 'sum':
        return `df['${targetCol}'] = df[[${colList}]].sum(axis=1)`;
      case 'min':
        return `df['${targetCol}'] = df[[${colList}]].min(axis=1)`;
      case 'max':
        return `df['${targetCol}'] = df[[${colList}]].max(axis=1)`;
      case 'count':
        return `df['${targetCol}'] = df[[${colList}]].notna().sum(axis=1)`;
      case 'std':
        return `df['${targetCol}'] = df[[${colList}]].std(axis=1)`;
      case 'var':
        return `df['${targetCol}'] = df[[${colList}]].var(axis=1)`;
      case 'concat':
        return `df['${targetCol}'] = df[[${colList}]].astype(str).agg(' '.join, axis=1)`;
      case 'first':
        return `df['${targetCol}'] = df[[${colList}]].bfill(axis=1).iloc[:, 0]`;
      case 'weighted_avg':
        // Assumes columns alternate between values and weights
        return `
# Weighted average calculation
_cols = [${colList}]
_weighted_sum = sum(df[_cols[i]] * df[_cols[i+1]] for i in range(0, len(_cols)-1, 2))
_weight_sum = sum(df[_cols[i+1]] for i in range(0, len(_cols)-1, 2))
df['${targetCol}'] = _weighted_sum / _weight_sum
`.trim();
      default:
        return `df['${targetCol}'] = df[[${colList}]].mean(axis=1)`;
    }
  }

  /**
   * P0-5: Generate JavaScript code for small datasets with context
   *
   * @param targetColumn - Name of the target column to create
   * @param sourceColumns - Source column names to use in calculation
   * @param aggregationMethod - Aggregation method to apply (mean, sum, etc.)
   * @param context - Compilation context for enhanced code generation
   */
  private generateJavaScriptCode(
    targetColumn: string,
    sourceColumns: string[],
    aggregationMethod: string,
    context?: CompilationContext
  ): string {
    const targetCol = this.sanitizeColumnName(targetColumn);
    const colArray = JSON.stringify(sourceColumns);

    switch (aggregationMethod.toLowerCase()) {
      case 'mean':
      case 'average':
      case 'avg':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  const values = cols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
})();
`.trim();
      case 'sum':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  const values = cols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
  return values.reduce((a, b) => a + b, 0);
})();
`.trim();
      case 'min':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  const values = cols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
  return values.length > 0 ? Math.min(...values) : null;
})();
`.trim();
      case 'max':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  const values = cols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
  return values.length > 0 ? Math.max(...values) : null;
})();
`.trim();
      case 'count':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  return cols.filter(c => row[c] !== null && row[c] !== undefined && row[c] !== '').length;
})();
`.trim();
      case 'concat':
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  return cols.map(c => row[c] ?? '').join(' ').trim();
})();
`.trim();
      default:
        return `
row['${targetCol}'] = (function() {
  const cols = ${colArray};
  const values = cols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
})();
`.trim();
    }
  }

  /**
   * Sanitize column name for use in code
   */
  private sanitizeColumnName(name: string): string {
    return name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .replace(/^(\d)/, '_$1'); // Prefix with underscore if starts with number
  }

  /**
   * Escape column name for use in Python string
   */
  private escapeColumn(col: string): string {
    return col.replace(/'/g, "\\'");
  }

  /**
   * Topological sort based on dependencies
   */
  private topologicalSort(transformations: CompiledTransformation[]): CompiledTransformation[] {
    // Build dependency graph
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    const elementsById = new Map<string, CompiledTransformation>();

    for (const t of transformations) {
      elementsById.set(t.elementId, t);
      graph.set(t.elementId, new Set());
      inDegree.set(t.elementId, 0);
    }

    // Build edges from dependencies
    for (const t of transformations) {
      for (const dep of t.dependencies) {
        if (graph.has(dep)) {
          graph.get(dep)!.add(t.elementId);
          inDegree.set(t.elementId, (inDegree.get(t.elementId) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const sorted: CompiledTransformation[] = [];

    // Start with nodes that have no dependencies
    Array.from(inDegree.entries()).forEach(([id, degree]) => {
      if (degree === 0) {
        queue.push(id);
      }
    });

    while (queue.length > 0) {
      const id = queue.shift()!;
      const element = elementsById.get(id);
      if (element) {
        sorted.push(element);
      }

      const neighbors = graph.get(id);
      if (neighbors) {
        Array.from(neighbors).forEach(neighbor => {
          inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
          if (inDegree.get(neighbor) === 0) {
            queue.push(neighbor);
          }
        });
      }
    }

    // If sorted doesn't contain all elements, there's a cycle
    if (sorted.length !== transformations.length) {
      const unsorted = transformations
        .filter(t => !sorted.includes(t))
        .map(t => t.elementName);
      console.error(`❌ [Compiler] Circular dependency detected among elements: ${unsorted.join(', ')}`);
      throw new Error(
        `Circular dependency detected among transformation elements: ${unsorted.join(', ')}. ` +
        `Please check that element formulas don't reference each other in a loop.`
      );
    }

    return sorted;
  }

  /**
   * Generate a complete Python script for batch execution
   */
  generateBatchScript(
    transformations: CompiledTransformation[],
    engine: 'polars' | 'pandas' = 'polars'
  ): string {
    const imports = engine === 'polars'
      ? `import polars as pl`
      : `import pandas as pd`;

    const transformCode = transformations
      .map(t => t.code.python)
      .join('\n\n');

    return `#!/usr/bin/env python3
"""Generated transformation script"""

import sys
import json
${imports}

def execute_transformations(data: list) -> dict:
    """Execute all compiled transformations"""
    try:
        df = ${engine === 'polars' ? 'pl.DataFrame(data)' : 'pd.DataFrame(data)'}

        # Execute transformations
${transformCode.split('\n').map(line => '        ' + line).join('\n')}

        # Return result
        return {
            'success': True,
            'data': ${engine === 'polars' ? 'df.to_dicts()' : "df.to_dict('records')"},
            'columns': ${engine === 'polars' ? 'df.columns' : 'list(df.columns)'},
            'row_count': len(df)
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'data': data
        }

if __name__ == '__main__':
    input_data = json.loads(sys.stdin.read())
    result = execute_transformations(input_data.get('data', input_data))
    print(json.dumps(result))
`;
  }
}

// Singleton instance
export const transformationCompiler = new TransformationCompiler();
