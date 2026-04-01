/**
 * Transformation Compiler Service (Phase 2)
 *
 * Wraps the base TransformationCompiler with business context awareness.
 * Provides compileElements() method used by required-data-elements-tool.ts.
 */

import { TransformationCompiler } from './transformation-compiler';

export interface CompilationContext {
  questionAnswerMapping?: Array<{
    questionId: string;
    questionText: string;
    requiredDataElements: string[];
    recommendedAnalyses: string[];
    transformationsNeeded: string[];
    matchDetails?: {
      matchedElements: Array<{
        elementName: string;
        score: number;
        matchReasons: string[];
      }>;
      overallMatchScore?: number;
      matchMethod?: 'string_based' | 'semantic_phase1';
    };
  }>;
  businessContext?: Map<string, any>;
  projectId?: string;
  industry?: string;
}

export interface CompiledTransformation {
  elementId: string;
  elementName: string;
  targetColumn: string;
  sourceColumns: string[];
  operation: 'add_calculated_column' | 'aggregate' | 'filter' | 'join' | 'derive';
  aggregationMethod: string;
  code: {
    python: string;
    javascript?: string;
  };
  executionEngine: 'javascript' | 'polars' | 'pandas' | 'spark';
  dependencies: string[];
  businessDescription?: string;
}

/**
 * Phase 2 Transformation Compiler
 *
 * Delegates to the base TransformationCompiler while adding:
 * - Business context awareness
 * - Compilation context with question-answer mapping
 * - Enhanced logging for match traceability
 */
export class TransformationCompilerPhase2 {
  private baseCompiler: TransformationCompiler;

  constructor() {
    this.baseCompiler = new TransformationCompiler();
  }

  /**
   * Compile transformations for a set of data elements with optional context.
   * Delegates to the base compiler's compileElements method.
   */
  async compileElements(
    elements: any[],
    columnMappings: Map<string, string>,
    rowCount: number,
    context?: CompilationContext
  ): Promise<CompiledTransformation[]> {
    if (!elements || elements.length === 0) {
      return [];
    }

    console.log(`[Phase 2] Compiling ${elements.length} elements${context?.projectId ? ` for project ${context.projectId}` : ''}`);

    // Log business context if available
    if (context?.businessContext && context.businessContext.size > 0) {
      console.log(`[Phase 2] Business context available for ${context.businessContext.size} elements`);
    }

    // Delegate to base compiler, passing context if supported
    try {
      const results = await this.baseCompiler.compileElements(
        elements,
        columnMappings,
        rowCount,
        context
      );

      console.log(`[Phase 2] Compiled ${results.length} transformations`);
      return results;
    } catch (error) {
      console.error(`[Phase 2] Compilation failed:`, error);
      // Return empty array on failure to avoid blocking the pipeline
      return [];
    }
  }

  /**
   * Build an execution plan from compiled transformations.
   */
  async buildExecutionPlan(
    compiledTransformations: CompiledTransformation[],
    context?: CompilationContext
  ): Promise<any> {
    return this.baseCompiler.buildExecutionPlan(compiledTransformations, context);
  }
}
