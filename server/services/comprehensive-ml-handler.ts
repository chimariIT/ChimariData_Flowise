import { comprehensiveMLService, MLConfig, MLResult, LibraryRecommendation } from './comprehensive-ml-service';
import { ToolExecutionContext, ToolExecutionResult } from './mcp-tool-registry';

/**
 * Comprehensive ML Handler
 *
 * Handles execution of comprehensive ML tools with intelligent library selection
 */

export class ComprehensiveMLHandler {
  private buildMetrics(durationMs: number, billingUnits: number): ToolExecutionResult['metrics'] {
    return {
      duration: durationMs,
      resourcesUsed: {
        cpu: Math.max(0.1, billingUnits * 0.05),
        memory: Math.max(1, billingUnits * 0.1),
        storage: 0.1
      },
      cost: billingUnits * 0.01,
      executionTimeMs: durationMs,
      billingUnits
    };
  }

  /**
   * Execute comprehensive ML pipeline with AutoML
   */
  async executeComprehensiveMLPipeline(
    input: {
      data: any[];
      targetColumn: string;
      problemType: 'classification' | 'regression';
      featureColumns?: string[];
      useAutoML?: boolean;
      automlTrials?: number;
      enableExplainability?: boolean;
      libraryPreference?: string;
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Get library recommendation
      const recommendation = await comprehensiveMLService.getLibraryRecommendation(
        input.data.length,
        input.problemType,
        input.libraryPreference === 'tensorflow'
      );

      console.log(`🤖 Recommended library: ${recommendation.recommended_library} - ${recommendation.reasoning}`);

      // Run ML pipeline
      const result = await comprehensiveMLService.trainModel(
        input.data,
        input.targetColumn,
        input.problemType,
        {
          featureColumns: input.featureColumns,
          useAutoML: input.useAutoML,
          automlTrials: input.automlTrials,
          enableExplainability: input.enableExplainability,
          libraryPreference: input.libraryPreference
        }
      );

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          executionId: context.executionId,
          toolId: 'comprehensive_ml_pipeline',
          status: 'error',
          result: null,
          error: result.error || 'ML pipeline failed',
          metrics: this.buildMetrics(executionTime, 0)
        };
      }

      return {
        executionId: context.executionId,
        toolId: 'comprehensive_ml_pipeline',
        status: 'success',
        result: {
          library_used: result.library_used,
          library_recommendation: recommendation,
          model_path: result.model_path,
          metrics: result.metrics,
          explainability: result.explainability,
          automl_results: result.automl_results,
          training_info: {
            dataset_size: input.data.length,
            target_column: input.targetColumn,
            problem_type: input.problemType
          }
        },
        metrics: this.buildMetrics(
          executionTime,
          this.calculateBillingUnits(input.data.length, input.useAutoML || false)
        )
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'comprehensive_ml_pipeline',
        status: 'error',
        result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Execute AutoML optimization
   */
  async executeAutoML(
    input: {
      data: any[];
      targetColumn: string;
      problemType: 'classification' | 'regression';
      trials?: number;
      featureColumns?: string[];
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await comprehensiveMLService.runAutoML(
        input.data,
        input.targetColumn,
        input.problemType,
        {
          trials: input.trials,
          featureColumns: input.featureColumns
        }
      );

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          executionId: context.executionId,
          toolId: 'automl_optimizer',
          status: 'error',
          result: null,
          error: result.error || 'AutoML optimization failed',
          metrics: this.buildMetrics(executionTime, 0)
        };
      }

      return {
        executionId: context.executionId,
        toolId: 'automl_optimizer',
        status: 'success',
        result: {
          library_used: result.library_used,
          best_model_path: result.model_path,
          best_metrics: result.metrics,
          optimization_results: result.automl_results,
          trials_completed: input.trials || 50
        },
        metrics: this.buildMetrics(
          executionTime,
          this.calculateAutoMLBillingUnits(input.trials || 50)
        )
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'automl_optimizer',
        status: 'error',
        result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Get ML library recommendation
   */
  async executeLibraryRecommendation(
    input: {
      rowCount: number;
      problemType: string;
      useDeepLearning?: boolean;
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const recommendation = await comprehensiveMLService.getLibraryRecommendation(
        input.rowCount,
        input.problemType,
        input.useDeepLearning || false
      );

      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'ml_library_selector',
        status: 'success',
  result: recommendation,
  metrics: this.buildMetrics(executionTime, 0.1)
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'ml_library_selector',
        status: 'error',
  result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Execute ML health check
   */
  async executeMLHealthCheck(
    input: {},
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const healthStatus = await comprehensiveMLService.healthCheck();
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'ml_health_check',
        status: 'success',
  result: healthStatus,
  metrics: this.buildMetrics(executionTime, 0)
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'ml_health_check',
        status: 'error',
  result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Calculate billing units based on dataset size and AutoML usage
   */
  private calculateBillingUnits(datasetSize: number, useAutoML: boolean): number {
    const baseUnits = Math.ceil(datasetSize / 10000); // 1 unit per 10K rows
    const autoMLMultiplier = useAutoML ? 5 : 1; // AutoML is 5x more expensive
    return baseUnits * autoMLMultiplier;
  }

  /**
   * Calculate billing units for AutoML based on trials
   */
  private calculateAutoMLBillingUnits(trials: number): number {
    return Math.ceil(trials / 10); // 1 unit per 10 trials
  }
}

// Export singleton instance
export const comprehensiveMLHandler = new ComprehensiveMLHandler();
