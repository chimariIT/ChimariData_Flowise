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
}

export interface ExecutionPlan {
  orderedSteps: CompiledTransformation[];
  totalSteps: number;
  estimatedComplexity: 'simple' | 'moderate' | 'complex';
  primaryEngine: 'javascript' | 'polars' | 'pandas' | 'spark';
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

const SMALL_DATASET_THRESHOLD = 100_000;
const MEDIUM_DATASET_THRESHOLD = 10_000_000;

export class TransformationCompiler {
  /**
   * Compile a single element's transformation
   */
  compileElement(
    element: ElementForCompilation,
    columnMappings: Map<string, string>,  // abstract -> actual
    rowCount: number
  ): CompiledTransformation {
    const calcDef = element.calculationDefinition;
    const formula = calcDef?.formula;

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
      engine
    );

    // Generate JavaScript code for small datasets
    const jsCode = engine === 'javascript'
      ? this.generateJavaScriptCode(element.elementName, sourceColumns, aggregationMethod)
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
      dependencies: [],  // TODO: Resolve dependencies from formula references
      businessDescription: formula?.businessDescription
    };
  }

  /**
   * Compile multiple elements into an execution plan
   */
  compileElements(
    elements: ElementForCompilation[],
    columnMappings: Map<string, string>,
    rowCount: number
  ): CompiledTransformation[] {
    return elements
      .filter(el => el.calculationDefinition?.formula?.componentFields)
      .map(el => this.compileElement(el, columnMappings, rowCount));
  }

  /**
   * Build execution plan with dependency ordering
   */
  buildExecutionPlan(transformations: CompiledTransformation[]): ExecutionPlan {
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

    return {
      orderedSteps: sorted,
      totalSteps: sorted.length,
      estimatedComplexity: complexity,
      primaryEngine
    };
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
   * Generate Python code from aggregation method
   */
  private generatePythonCode(
    targetColumn: string,
    sourceColumns: string[],
    aggregationMethod: string,
    pseudoCode?: string,
    engine: string = 'pandas'
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
   * Generate JavaScript code for small datasets
   */
  private generateJavaScriptCode(
    targetColumn: string,
    sourceColumns: string[],
    aggregationMethod: string
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
      console.warn('⚠️ [Compiler] Circular dependency detected, using original order');
      return transformations;
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
