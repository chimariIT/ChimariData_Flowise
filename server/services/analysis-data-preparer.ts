/**
 * Analysis Data Preparer Service
 *
 * Sits between data extraction and Python script invocation.
 * For each analysis in the analysisPath, it:
 *   1. Resolves column roles (target, features, grouping, text, time) from RequiredDataElement metadata
 *   2. Identifies derived columns to create from calculationDefinitions
 *   3. Builds enhanced Python script configs with explicit column roles
 *   4. Attaches question IDs for evidence chain traceability
 *
 * All changes are ADDITIVE — when no preparation is available, Python scripts
 * fall back to their existing auto-detection behavior.
 */

// ---- Type Definitions ----

export interface ColumnRoleAssignment {
  target_column?: string;        // regression, classification, time_series
  features?: string[];           // regression, classification, clustering
  group_column?: string;         // comparative, group_analysis
  comparison_columns?: string[]; // comparative
  text_columns?: string[];       // text_analysis
  time_column?: string;          // time_series
  forecast_periods?: number;     // time_series
  n_clusters?: number | 'auto';  // clustering
  method?: string;               // correlation, clustering
  model_type?: string;           // classification
  columns?: string[];            // descriptive (explicit column list)
}

export interface DerivedColumnSpec {
  columnName: string;              // e.g., "Likely_to_Return"
  sourceElementId: string;
  derivationType: 'average' | 'sum' | 'binary_condition' | 'categorize' | 'custom';
  componentColumns: string[];      // actual dataset column names
  businessDescription: string;
  config: {
    aggregationMethod?: string;
    condition?: string;            // for binary: pseudo-code or business description
    categories?: Array<{ name: string; rule: string }>;
    pseudoCode?: string;
  };
}

export interface AnalysisPreparation {
  analysisId: string;
  analysisType: string;
  columnRoles: ColumnRoleAssignment;
  derivedColumns: DerivedColumnSpec[];
  businessContext: {
    questionIds: string[];
    questionTexts: string[];
    expectedOutcome: string;
  };
}

interface PrepareParams {
  analysisPath: Array<{
    analysisId: string;
    analysisName: string;
    analysisType?: string;
    requiredDataElements?: string[];
    techniques?: string[];
    description?: string;
  }>;
  requiredDataElements: Array<{
    elementId?: string;
    elementName: string;
    dataType?: string;
    purpose?: string;
    sourceColumn?: string;
    sourceField?: string;
    analysisUsage?: string[];
    relatedQuestions?: string[];
    questionIds?: string[];
    calculationDefinition?: {
      calculationType?: string;
      comparisonGroups?: {
        groupingField?: string;
        groupValues?: string[];
        comparisonType?: string;
      };
      formula?: {
        businessDescription?: string;
        componentFields?: string[];
        aggregationMethod?: string;
        pseudoCode?: string;
      };
      categorization?: {
        categoryDescription?: string;
        categories?: Array<{ name: string; rule: string }>;
      };
      notes?: string;
    };
    transformationRequired?: boolean;
  }>;
  questionAnswerMapping: Array<{
    questionId: string;
    questionText: string;
    recommendedAnalyses?: string[];
    requiredDataElements?: string[];
  }>;
  availableColumns: string[];
}

// ---- Service ----

export class AnalysisDataPreparer {

  /**
   * For each analysis in the analysisPath, resolve column roles,
   * identify derived columns, and build the complete preparation config.
   */
  prepareAnalyses(params: PrepareParams): AnalysisPreparation[] {
    const { analysisPath, requiredDataElements, questionAnswerMapping, availableColumns } = params;
    const preparations: AnalysisPreparation[] = [];

    // Build element lookup by ID and name for quick access
    const elementById = new Map<string, typeof requiredDataElements[0]>();
    const elementByName = new Map<string, typeof requiredDataElements[0]>();
    for (const el of requiredDataElements) {
      if (el.elementId) elementById.set(el.elementId, el);
      if (el.elementName) elementByName.set(el.elementName.toLowerCase(), el);
    }

    for (const analysis of analysisPath) {
      const analysisId = analysis.analysisId || `analysis_${Date.now()}`;
      const analysisType = this.normalizeAnalysisType(analysis.analysisType, analysis.techniques);

      // Step 1: Resolve elements for this analysis
      const linkedElements = this.resolveLinkedElements(
        analysis.requiredDataElements || [],
        elementById,
        elementByName,
        requiredDataElements
      );

      // Step 2: Resolve column roles based on analysis type and element metadata
      const columnRoles = this.resolveColumnRoles(analysisType, linkedElements, availableColumns);

      // Step 3: Identify derived columns
      const derivedColumns = this.buildDerivedColumns(linkedElements, availableColumns);

      // Step 4: Attach question context
      const businessContext = this.buildBusinessContext(
        analysisId,
        analysisType,
        analysis.analysisName || analysisType,
        analysis.description || '',
        linkedElements,
        questionAnswerMapping
      );

      preparations.push({
        analysisId,
        analysisType,
        columnRoles,
        derivedColumns,
        businessContext,
      });

      console.log(`📋 [DataPreparer] ${analysis.analysisName || analysisType}:`);
      console.log(`   Column roles: ${JSON.stringify(columnRoles)}`);
      if (derivedColumns.length > 0) {
        console.log(`   Derived columns: ${derivedColumns.map(d => d.columnName).join(', ')}`);
      }
      console.log(`   Questions: ${businessContext.questionIds.length} linked`);
    }

    return preparations;
  }

  /**
   * Apply derived columns to dataset rows (in-memory mutation).
   * Uses safe pattern-matching for common derivation types — no exec().
   */
  applyDerivedColumns(rows: any[], derivedColumns: DerivedColumnSpec[]): any[] {
    if (!rows || rows.length === 0 || !derivedColumns || derivedColumns.length === 0) {
      return rows;
    }

    for (const derived of derivedColumns) {
      const { columnName, derivationType, componentColumns, config } = derived;

      // Verify component columns exist in at least first row
      const existingCols = componentColumns.filter(c => rows[0]?.hasOwnProperty(c));
      if (existingCols.length === 0) {
        console.warn(`⚠️ [DataPreparer] Cannot derive "${columnName}": none of [${componentColumns.join(', ')}] found in dataset`);
        continue;
      }

      console.log(`🔧 [DataPreparer] Deriving column "${columnName}" (${derivationType}) from [${existingCols.join(', ')}]`);

      switch (derivationType) {
        case 'average': {
          for (const row of rows) {
            const values = existingCols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
            row[columnName] = values.length > 0
              ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000
              : null;
          }
          break;
        }

        case 'sum': {
          for (const row of rows) {
            const values = existingCols.map(c => parseFloat(row[c])).filter(v => !isNaN(v));
            row[columnName] = values.length > 0
              ? Math.round(values.reduce((a, b) => a + b, 0) * 1000) / 1000
              : null;
          }
          break;
        }

        case 'binary_condition': {
          // Parse simple conditions from pseudoCode or config.condition
          const conditionStr = config.condition || config.pseudoCode || '';
          const binaryFn = this.parseBinaryCondition(conditionStr, existingCols);
          if (binaryFn) {
            for (const row of rows) {
              row[columnName] = binaryFn(row);
            }
          } else {
            // Fallback: cannot parse condition safely — mark as null, let Python handle
            console.warn(`⚠️ [DataPreparer] Cannot parse binary condition for "${columnName}": "${conditionStr}"`);
            for (const row of rows) {
              row[columnName] = null;
            }
          }
          break;
        }

        case 'categorize': {
          const categories = config.categories || [];
          if (categories.length > 0 && existingCols.length > 0) {
            const sourceCol = existingCols[0];
            for (const row of rows) {
              const val = parseFloat(row[sourceCol]);
              if (isNaN(val)) {
                row[columnName] = null;
                continue;
              }
              // Try to match categories by parsing numeric rules
              let matched = false;
              for (const cat of categories) {
                if (this.evaluateCategoryRule(val, cat.rule)) {
                  row[columnName] = cat.name;
                  matched = true;
                  break;
                }
              }
              if (!matched) {
                row[columnName] = 'Other';
              }
            }
          }
          break;
        }

        case 'custom':
        default: {
          // Cannot safely execute custom code — leave column as null
          // The Python script will receive derivation_formula in config to handle it
          console.warn(`⚠️ [DataPreparer] Custom derivation for "${columnName}" — delegating to Python`);
          for (const row of rows) {
            row[columnName] = null;
          }
          break;
        }
      }

      console.log(`   ✅ Derived "${columnName}" for ${rows.length} rows`);
    }

    return rows;
  }

  /**
   * Build the enhanced Python script config from AnalysisPreparation.
   * Replaces the bare { data_path } config with explicit column roles.
   */
  buildPythonConfig(
    preparation: AnalysisPreparation,
    dataPath: string,
    outputDir?: string
  ): Record<string, any> {
    const config: Record<string, any> = {
      data_path: dataPath,
    };

    if (outputDir) {
      config.output_dir = outputDir;
    }

    // Spread column roles — only include non-undefined values
    const roles = preparation.columnRoles;
    if (roles.target_column) config.target_column = roles.target_column;
    if (roles.features && roles.features.length > 0) config.features = roles.features;
    if (roles.group_column) config.group_column = roles.group_column;
    if (roles.comparison_columns && roles.comparison_columns.length > 0) config.comparison_columns = roles.comparison_columns;
    if (roles.text_columns && roles.text_columns.length > 0) config.text_columns = roles.text_columns;
    if (roles.time_column) config.time_column = roles.time_column;
    if (roles.forecast_periods) config.forecast_periods = roles.forecast_periods;
    if (roles.n_clusters !== undefined) config.n_clusters = roles.n_clusters;
    if (roles.method) config.method = roles.method;
    if (roles.model_type) config.model_type = roles.model_type;
    if (roles.columns && roles.columns.length > 0) config.columns = roles.columns;

    // Attach business context for evidence chain
    if (preparation.businessContext.questionIds.length > 0) {
      config.business_context = {
        question_ids: preparation.businessContext.questionIds,
        question_texts: preparation.businessContext.questionTexts,
        expected_outcome: preparation.businessContext.expectedOutcome,
      };
    }

    // If there are custom derivations that couldn't be done in TypeScript, pass formulas to Python
    const customDerivations = preparation.derivedColumns.filter(d => d.derivationType === 'custom');
    if (customDerivations.length > 0) {
      config.derivation_formulas = customDerivations.map(d => ({
        column_name: d.columnName,
        component_columns: d.componentColumns,
        business_description: d.businessDescription,
        pseudo_code: d.config.pseudoCode,
      }));
    }

    return config;
  }

  // ---- Private Methods ----

  /**
   * Normalize analysis type string to match Python script names.
   * Uses techniques array as fallback for more specific type detection.
   */
  private normalizeAnalysisType(
    analysisType?: string,
    techniques?: string[]
  ): string {
    const type = (analysisType || 'descriptive').toLowerCase().trim();

    // Map broad categories to specific types using techniques
    if (techniques && techniques.length > 0) {
      const techniqueStr = techniques.join(' ').toLowerCase();

      if (type === 'predictive' || type === 'prescriptive') {
        if (techniqueStr.includes('classif') || techniqueStr.includes('logistic')) return 'classification';
        if (techniqueStr.includes('regress') || techniqueStr.includes('forecast')) return 'regression';
        if (techniqueStr.includes('cluster') || techniqueStr.includes('segment')) return 'clustering';
        if (techniqueStr.includes('time') || techniqueStr.includes('series') || techniqueStr.includes('trend')) return 'time_series';
        return 'regression'; // default predictive
      }

      if (type === 'diagnostic') {
        if (techniqueStr.includes('compar') || techniqueStr.includes('group')) return 'comparative';
        if (techniqueStr.includes('correlat')) return 'correlation';
        if (techniqueStr.includes('text') || techniqueStr.includes('nlp') || techniqueStr.includes('sentiment')) return 'text_analysis';
        return 'comparative'; // default diagnostic
      }
    }

    // Direct type mapping
    const typeMap: Record<string, string> = {
      'descriptive': 'descriptive',
      'descriptive_stats': 'descriptive',
      'descriptive_statistics': 'descriptive',
      'diagnostic': 'comparative',
      'comparative': 'comparative',
      'comparative_analysis': 'comparative',
      'group': 'group_analysis',
      'group_analysis': 'group_analysis',
      'predictive': 'regression',
      'predictive_modeling': 'regression',
      'regression': 'regression',
      'regression_analysis': 'regression',
      'classification': 'classification',
      'clustering': 'clustering',
      'segmentation': 'clustering',
      'correlation': 'correlation',
      'correlation_analysis': 'correlation',
      'time_series': 'time_series',
      'time-series': 'time_series',
      'trend': 'time_series',
      'trend_analysis': 'time_series',
      'text': 'text_analysis',
      'text_analysis': 'text_analysis',
      'statistical_tests': 'statistical_tests',
    };

    return typeMap[type] || type;
  }

  /**
   * Find the RequiredDataElements linked to this analysis via elementIds.
   */
  private resolveLinkedElements(
    elementRefs: string[],
    elementById: Map<string, PrepareParams['requiredDataElements'][0]>,
    elementByName: Map<string, PrepareParams['requiredDataElements'][0]>,
    allElements: PrepareParams['requiredDataElements']
  ): PrepareParams['requiredDataElements'] {
    if (elementRefs.length === 0) {
      // No specific elements linked — return all elements
      return allElements;
    }

    const linked: PrepareParams['requiredDataElements'] = [];
    for (const ref of elementRefs) {
      // Try by ID first, then by name
      const byId = elementById.get(ref);
      if (byId) {
        linked.push(byId);
        continue;
      }
      const byName = elementByName.get(ref.toLowerCase());
      if (byName) {
        linked.push(byName);
      }
    }

    return linked.length > 0 ? linked : allElements;
  }

  /**
   * Resolve column roles based on analysis type and element metadata.
   */
  private resolveColumnRoles(
    analysisType: string,
    elements: PrepareParams['requiredDataElements'],
    availableColumns: string[]
  ): ColumnRoleAssignment {
    const roles: ColumnRoleAssignment = {};

    // Get actual columns for each element
    const elementsWithColumns = elements
      .filter(el => el.sourceColumn || el.sourceField)
      .map(el => ({
        ...el,
        actualColumn: (el.sourceColumn || el.sourceField)!,
      }));

    // Filter to only elements whose columns exist in the dataset
    const availableSet = new Set(availableColumns.map(c => c.toLowerCase()));
    const validElements = elementsWithColumns.filter(el =>
      availableSet.has(el.actualColumn.toLowerCase())
    );

    if (validElements.length === 0) {
      // No resolved columns — Python will auto-detect
      return roles;
    }

    switch (analysisType) {
      case 'regression':
      case 'predictive': {
        // Target: element with purpose containing target/outcome/predict, or derived element
        const target = this.findTargetElement(validElements, 'numeric');
        if (target) {
          roles.target_column = target.actualColumn;
          // Features: all other numeric elements
          roles.features = validElements
            .filter(el => el.actualColumn !== target.actualColumn && (el.dataType === 'numeric' || el.dataType === 'categorical'))
            .map(el => el.actualColumn);
        }
        break;
      }

      case 'classification': {
        // Target: categorical/boolean element with purpose containing target/class/label
        const target = this.findTargetElement(validElements, 'categorical');
        if (target) {
          roles.target_column = target.actualColumn;
          roles.features = validElements
            .filter(el => el.actualColumn !== target.actualColumn)
            .map(el => el.actualColumn);
        }
        // Infer model type from data characteristics
        const numCategories = new Set(validElements.filter(el => el.dataType === 'categorical').map(el => el.actualColumn)).size;
        if (numCategories <= 2) {
          roles.model_type = 'logistic_regression';
        } else {
          roles.model_type = 'random_forest';
        }
        break;
      }

      case 'comparative':
      case 'comparative_analysis': {
        // Group column: from comparisonGroups or categorical element
        const groupEl = this.findGroupingElement(validElements);
        if (groupEl) {
          roles.group_column = groupEl.actualColumn;
          roles.comparison_columns = validElements
            .filter(el => el.actualColumn !== groupEl.actualColumn && el.dataType === 'numeric')
            .map(el => el.actualColumn);
        }
        break;
      }

      case 'group_analysis': {
        const groupEl = this.findGroupingElement(validElements);
        if (groupEl) {
          roles.group_column = groupEl.actualColumn;
          roles.columns = validElements
            .filter(el => el.actualColumn !== groupEl.actualColumn)
            .map(el => el.actualColumn);
        }
        break;
      }

      case 'time_series':
      case 'trend': {
        // Time column: element with dataType=datetime
        const timeEl = validElements.find(el => el.dataType === 'datetime');
        if (timeEl) {
          roles.time_column = timeEl.actualColumn;
        }
        // Target: first numeric element (or purpose containing target/metric)
        const targetEl = validElements.find(el =>
          el.dataType === 'numeric' &&
          el.actualColumn !== (timeEl?.actualColumn || '')
        );
        if (targetEl) {
          roles.target_column = targetEl.actualColumn;
        }
        roles.forecast_periods = 6; // default
        break;
      }

      case 'text_analysis':
      case 'text': {
        roles.text_columns = validElements
          .filter(el => el.dataType === 'text')
          .map(el => el.actualColumn);
        // If no explicit text elements, look for long-text columns
        if (roles.text_columns.length === 0) {
          roles.text_columns = validElements
            .filter(el => el.dataType === 'categorical') // might be miscategorized
            .map(el => el.actualColumn);
        }
        break;
      }

      case 'correlation':
      case 'correlation_analysis': {
        roles.columns = validElements
          .filter(el => el.dataType === 'numeric')
          .map(el => el.actualColumn);
        roles.method = 'pearson'; // default
        break;
      }

      case 'clustering':
      case 'segmentation': {
        roles.features = validElements
          .filter(el => el.dataType === 'numeric')
          .map(el => el.actualColumn);
        roles.n_clusters = 'auto';
        break;
      }

      case 'descriptive':
      case 'descriptive_stats': {
        roles.columns = validElements.map(el => el.actualColumn);
        break;
      }

      default: {
        // For unknown types, pass all columns
        roles.columns = validElements.map(el => el.actualColumn);
        break;
      }
    }

    return roles;
  }

  /**
   * Find the target variable element for predictive/classification analyses.
   */
  private findTargetElement(
    elements: Array<PrepareParams['requiredDataElements'][0] & { actualColumn: string }>,
    preferredType: 'numeric' | 'categorical'
  ): (PrepareParams['requiredDataElements'][0] & { actualColumn: string }) | undefined {
    // Priority 1: Element with purpose explicitly mentioning "target"
    const purposeKeywords = ['target', 'outcome', 'predict', 'dependent', 'response variable', 'label', 'class'];
    const byPurpose = elements.find(el => {
      const purpose = (el.purpose || '').toLowerCase();
      return purposeKeywords.some(kw => purpose.includes(kw));
    });
    if (byPurpose) return byPurpose;

    // Priority 2: Derived element (calculationType === 'derived')
    const derived = elements.find(el =>
      el.calculationDefinition?.calculationType === 'derived'
    );
    if (derived) return derived;

    // Priority 3: Element matching preferred data type
    if (preferredType === 'categorical') {
      const categorical = elements.find(el =>
        el.dataType === 'categorical' || el.dataType === 'boolean'
      );
      if (categorical) return categorical;
    }

    // Priority 4: Last element of the preferred type (matches Python auto-detect fallback)
    const ofType = elements.filter(el => el.dataType === preferredType);
    return ofType.length > 0 ? ofType[ofType.length - 1] : undefined;
  }

  /**
   * Find the grouping element for comparative/group analyses.
   */
  private findGroupingElement(
    elements: Array<PrepareParams['requiredDataElements'][0] & { actualColumn: string }>
  ): (PrepareParams['requiredDataElements'][0] & { actualColumn: string }) | undefined {
    // Priority 1: Element with comparisonGroups.groupingField defined
    const withGroups = elements.find(el =>
      el.calculationDefinition?.comparisonGroups?.groupingField
    );
    if (withGroups) {
      // The groupingField might be an abstract name; check if the element itself is the group column
      return withGroups;
    }

    // Priority 2: Categorical element with purpose containing "group/segment/category"
    const groupKeywords = ['group', 'segment', 'category', 'cohort', 'class', 'type', 'department', 'region'];
    const byPurpose = elements.find(el => {
      const purpose = (el.purpose || '').toLowerCase();
      return el.dataType === 'categorical' && groupKeywords.some(kw => purpose.includes(kw));
    });
    if (byPurpose) return byPurpose;

    // Priority 3: First categorical element
    return elements.find(el => el.dataType === 'categorical');
  }

  /**
   * Identify derived columns from calculationDefinitions.
   */
  private buildDerivedColumns(
    elements: PrepareParams['requiredDataElements'],
    availableColumns: string[]
  ): DerivedColumnSpec[] {
    const derived: DerivedColumnSpec[] = [];
    const availableSet = new Set(availableColumns.map(c => c.toLowerCase()));

    for (const el of elements) {
      if (el.calculationDefinition?.calculationType !== 'derived') continue;
      if (!el.calculationDefinition.formula) continue;

      const formula = el.calculationDefinition.formula;
      const componentFields = formula.componentFields || [];

      // Resolve abstract component fields to actual columns
      // (sourceColumn on elements maps abstract → actual, but componentFields
      //  are abstract field names that need resolution)
      const componentColumns = componentFields
        .map(field => {
          // Check if the field name directly matches an available column
          if (availableSet.has(field.toLowerCase())) return field;
          // Try to find by matching against available columns case-insensitively
          const match = availableColumns.find(c => c.toLowerCase() === field.toLowerCase());
          if (match) return match;
          // Could not resolve
          return null;
        })
        .filter((c): c is string => c !== null);

      if (componentColumns.length === 0) {
        console.warn(`⚠️ [DataPreparer] Cannot build derived column "${el.elementName}": no component columns resolved`);
        continue;
      }

      const aggMethod = formula.aggregationMethod || 'average';
      let derivationType: DerivedColumnSpec['derivationType'] = 'custom';

      if (aggMethod === 'average') derivationType = 'average';
      else if (aggMethod === 'sum' || aggMethod === 'count') derivationType = 'sum';
      else if (el.calculationDefinition.categorization) derivationType = 'categorize';
      else if (formula.pseudoCode?.toLowerCase().includes('if ')) derivationType = 'binary_condition';

      const columnName = this.sanitizeColumnName(el.elementName);

      derived.push({
        columnName,
        sourceElementId: el.elementId || el.elementName,
        derivationType,
        componentColumns,
        businessDescription: formula.businessDescription || el.purpose || '',
        config: {
          aggregationMethod: aggMethod,
          condition: formula.pseudoCode,
          categories: el.calculationDefinition.categorization?.categories,
          pseudoCode: formula.pseudoCode,
        },
      });
    }

    return derived;
  }

  /**
   * Build business context for evidence chain traceability.
   */
  private buildBusinessContext(
    analysisId: string,
    analysisType: string,
    analysisName: string,
    description: string,
    elements: PrepareParams['requiredDataElements'],
    questionAnswerMapping: PrepareParams['questionAnswerMapping']
  ): AnalysisPreparation['businessContext'] {
    const questionIds: string[] = [];
    const questionTexts: string[] = [];

    // Collect questions from element.relatedQuestions and element.questionIds
    for (const el of elements) {
      if (el.questionIds) {
        for (const qId of el.questionIds) {
          if (!questionIds.includes(qId)) questionIds.push(qId);
        }
      }
    }

    // Collect questions from questionAnswerMapping that reference this analysis type
    for (const qa of questionAnswerMapping) {
      const recommended = (qa.recommendedAnalyses || []).map(a => a.toLowerCase());
      const typeAliases = this.getTypeAliases(analysisType);
      const matches = recommended.some(r => typeAliases.includes(r));

      if (matches) {
        if (!questionIds.includes(qa.questionId)) {
          questionIds.push(qa.questionId);
        }
        if (!questionTexts.includes(qa.questionText)) {
          questionTexts.push(qa.questionText);
        }
      }
    }

    // Also check element relatedQuestions as text
    for (const el of elements) {
      if (el.relatedQuestions) {
        for (const q of el.relatedQuestions) {
          if (!questionTexts.includes(q)) questionTexts.push(q);
        }
      }
    }

    return {
      questionIds,
      questionTexts: questionTexts.slice(0, 10), // Limit to avoid huge payloads
      expectedOutcome: description || `${analysisName} results`,
    };
  }

  /**
   * Parse a binary condition string into an evaluator function.
   * Handles patterns like: "value > 365", "score >= 80", "days_since > 365"
   * Returns null if the condition cannot be safely parsed.
   */
  private parseBinaryCondition(
    conditionStr: string,
    componentColumns: string[]
  ): ((row: any) => number) | null {
    if (!conditionStr || componentColumns.length === 0) return null;

    // Pattern: "column > number" or "column >= number"
    const comparisonMatch = conditionStr.match(
      /(\w+)\s*(>=|<=|>|<|==|!=)\s*(\d+(?:\.\d+)?)/i
    );

    if (comparisonMatch) {
      const [, , operator, thresholdStr] = comparisonMatch;
      const threshold = parseFloat(thresholdStr);
      const sourceCol = componentColumns[0]; // Use first component column

      return (row: any) => {
        const val = parseFloat(row[sourceCol]);
        if (isNaN(val)) return 0;
        switch (operator) {
          case '>': return val > threshold ? 1 : 0;
          case '>=': return val >= threshold ? 1 : 0;
          case '<': return val < threshold ? 1 : 0;
          case '<=': return val <= threshold ? 1 : 0;
          case '==': return val === threshold ? 1 : 0;
          case '!=': return val !== threshold ? 1 : 0;
          default: return 0;
        }
      };
    }

    return null;
  }

  /**
   * Evaluate a categorization rule against a numeric value.
   * Handles patterns like: "score >= 80", "value < 30", "between 30 and 80"
   */
  private evaluateCategoryRule(value: number, rule: string): boolean {
    // Pattern: "X >= N" or "X > N"
    const geMatch = rule.match(/(>=?)\s*(\d+(?:\.\d+)?)/);
    const leMatch = rule.match(/(<=?)\s*(\d+(?:\.\d+)?)/);
    const betweenMatch = rule.match(/between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)/i);

    if (betweenMatch) {
      const [, low, high] = betweenMatch;
      return value >= parseFloat(low) && value <= parseFloat(high);
    }

    if (geMatch && !leMatch) {
      const threshold = parseFloat(geMatch[2]);
      return geMatch[1] === '>=' ? value >= threshold : value > threshold;
    }

    if (leMatch && !geMatch) {
      const threshold = parseFloat(leMatch[2]);
      return leMatch[1] === '<=' ? value <= threshold : value < threshold;
    }

    // Combined: ">= N and < M"
    if (geMatch && leMatch) {
      const lo = parseFloat(geMatch[2]);
      const hi = parseFloat(leMatch[2]);
      return value >= lo && value < hi;
    }

    return false;
  }

  /**
   * Get all type aliases for an analysis type (for question matching).
   */
  private getTypeAliases(analysisType: string): string[] {
    const aliasMap: Record<string, string[]> = {
      'descriptive': ['descriptive', 'descriptive_stats', 'descriptive_statistics', 'summary'],
      'correlation': ['correlation', 'correlation_analysis', 'correlations'],
      'regression': ['regression', 'regression_analysis', 'predictive', 'predictive_modeling', 'prediction'],
      'classification': ['classification', 'classification_analysis', 'predictive', 'ml'],
      'clustering': ['clustering', 'clustering_analysis', 'segmentation', 'segment'],
      'comparative': ['comparative', 'comparative_analysis', 'comparison', 'diagnostic'],
      'group_analysis': ['group_analysis', 'group', 'segment_analysis', 'cohort'],
      'text_analysis': ['text_analysis', 'text', 'nlp', 'sentiment', 'topic_modeling'],
      'time_series': ['time_series', 'time-series', 'time_series_analysis', 'trend', 'trend_analysis', 'forecasting'],
      'statistical_tests': ['statistical_tests', 'hypothesis_testing', 'statistical'],
    };

    return aliasMap[analysisType] || [analysisType];
  }

  /**
   * Sanitize a name into a valid column name.
   */
  private sanitizeColumnName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\s]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50);
  }
}
