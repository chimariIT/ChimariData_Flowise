import { llmFineTuningService, FineTuningConfig, FineTuningResult } from './llm-fine-tuning-service';
import { ToolExecutionContext, ToolExecutionResult } from './mcp-tool-registry';

/**
 * LLM Fine-Tuning Handler
 *
 * Handles execution of LLM fine-tuning tools
 */

export class LLMFineTuningHandler {
  private buildMetrics(durationMs: number, billingUnits: number): ToolExecutionResult['metrics'] {
    return {
      duration: durationMs,
      resourcesUsed: {
        cpu: Math.max(0.2, billingUnits * 0.1),
        memory: Math.max(2, billingUnits * 0.5),
        storage: Math.max(0.1, billingUnits * 0.05)
      },
      cost: billingUnits * 0.02,
      executionTimeMs: durationMs,
      billingUnits
    };
  }

  /**
   * Execute LLM fine-tuning with automatic method selection
   */
  async executeFineTuning(
    input: {
      model_name: string;
      train_data_path: string;
      task_type?: 'causal_lm' | 'seq2seq' | 'classification' | 'qa';
      method?: 'lora' | 'qlora' | 'full' | 'auto';
      val_data_path?: string;
      num_epochs?: number;
      batch_size?: number;
      learning_rate?: number;
      lora_r?: number;
      lora_alpha?: number;
      use_4bit?: boolean;
      use_8bit?: boolean;
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      // Auto-select method if requested
      let method = input.method || 'auto';

      if (method === 'auto') {
        // Determine model size based on model name
        const modelSize = this.estimateModelSize(input.model_name);

        // Get recommendation (assume 16GB GPU for now, can be made dynamic)
        const recommendation = llmFineTuningService.getMethodRecommendation(
          modelSize,
          16,  // 16GB GPU
          true // Assume GPU available
        );

        method = recommendation.recommended_method;

        console.log(`🤖 Auto-selected method: ${method} - ${recommendation.reasoning}`);
      }

      // Build config
      const config: FineTuningConfig = {
        model_name: input.model_name,
        task_type: input.task_type || 'causal_lm',
        method: method as any,
        train_data_path: input.train_data_path,
        val_data_path: input.val_data_path,
        num_epochs: input.num_epochs,
        batch_size: input.batch_size,
        learning_rate: input.learning_rate,
        lora_r: input.lora_r,
        lora_alpha: input.lora_alpha,
        use_4bit: input.use_4bit || (method === 'qlora'),
        use_8bit: input.use_8bit
      };

      // Execute fine-tuning
      const result = await llmFineTuningService.fineTune(config);

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          executionId: context.executionId,
          toolId: 'llm_fine_tuning',
          status: 'error',
          result: null,
          error: result.error || 'Fine-tuning failed',
          metrics: this.buildMetrics(executionTime, 0)
        };
      }

      return {
        executionId: context.executionId,
        toolId: 'llm_fine_tuning',
        status: 'success',
        result: {
          model_path: result.model_path,
          method: result.method,
          train_loss: result.train_loss,
          eval_metrics: result.eval_metrics,
          trainable_params: result.trainable_params,
          job_id: result.job_id
        },
        metrics: this.buildMetrics(
          executionTime,
          this.calculateBillingUnits(
            method as any,
            input.num_epochs || 3,
            result.train_samples || 1000
          )
        )
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'llm_fine_tuning',
        status: 'error',
  result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Execute LoRA fine-tuning specifically
   */
  async executeLoRAFineTuning(
    input: {
      model_name: string;
      train_data_path: string;
      task_type?: 'causal_lm' | 'seq2seq';
      val_data_path?: string;
      lora_r?: number;
      lora_alpha?: number;
      num_epochs?: number;
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await llmFineTuningService.finetuneWithLoRA(
        input.model_name,
        input.train_data_path,
        {
          taskType: input.task_type,
          loraR: input.lora_r,
          loraAlpha: input.lora_alpha,
          numEpochs: input.num_epochs,
          valDataPath: input.val_data_path
        }
      );

      const executionTime = Date.now() - startTime;

      if (!result.success) {
        return {
          executionId: context.executionId,
          toolId: 'lora_fine_tuning',
          status: 'error',
          result: null,
          error: result.error || 'LoRA fine-tuning failed',
          metrics: this.buildMetrics(executionTime, 0)
        };
      }

      return {
        executionId: context.executionId,
        toolId: 'lora_fine_tuning',
        status: 'success',
        result: {
          model_path: result.model_path,
          train_loss: result.train_loss,
          eval_metrics: result.eval_metrics,
          trainable_params: result.trainable_params
        },
        metrics: this.buildMetrics(
          executionTime,
          this.calculateBillingUnits('lora', input.num_epochs || 3, result.train_samples || 1000)
        )
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'lora_fine_tuning',
        status: 'error',
        result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Get fine-tuning method recommendation
   */
  async executeMethodRecommendation(
    input: {
      model_name: string;
      available_memory_gb?: number;
      has_gpu?: boolean;
    },
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const modelSize = this.estimateModelSize(input.model_name);

      const recommendation = llmFineTuningService.getMethodRecommendation(
        modelSize,
        input.available_memory_gb || 16,
        input.has_gpu !== false
      );

      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'llm_method_recommendation',
        status: 'success',
  result: recommendation,
  metrics: this.buildMetrics(executionTime, 0.1)
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'llm_method_recommendation',
        status: 'error',
  result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Execute LLM health check
   */
  async executeHealthCheck(
    input: {},
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const healthStatus = await llmFineTuningService.healthCheck();
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'llm_health_check',
        status: 'success',
  result: healthStatus,
  metrics: this.buildMetrics(executionTime, 0)
      };

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      return {
        executionId: context.executionId,
        toolId: 'llm_health_check',
        status: 'error',
  result: null,
  error: error.message || 'Unknown error',
  metrics: this.buildMetrics(executionTime, 0)
      };
    }
  }

  /**
   * Estimate model size based on model name
   */
  private estimateModelSize(modelName: string): 'small' | 'medium' | 'large' | 'xlarge' {
    const name = modelName.toLowerCase();

    // XLarge models (>20B parameters)
    if (name.includes('70b') || name.includes('65b') || name.includes('175b')) {
      return 'xlarge';
    }

    // Large models (7-20B parameters)
    if (name.includes('13b') || name.includes('20b') || name.includes('xl')) {
      return 'large';
    }

    // Medium models (1-7B parameters)
    if (name.includes('7b') || name.includes('3b') || name.includes('2.7b')) {
      return 'medium';
    }

    // Small models (<1B parameters)
    return 'small';
  }

  /**
   * Calculate billing units based on method, epochs, and dataset size
   */
  private calculateBillingUnits(
    method: 'lora' | 'qlora' | 'full',
    numEpochs: number,
    trainSamples: number
  ): number {
    // Base cost per 1000 samples per epoch
    const baseCostPer1K = {
      full: 10,    // Full fine-tuning is most expensive
      lora: 3,     // LoRA is cheaper
      qlora: 2     // QLoRA is cheapest
    };

    const samplesInK = trainSamples / 1000;
    const baseCost = baseCostPer1K[method] || 5;

    return Math.ceil(baseCost * samplesInK * numEpochs);
  }
}

// Export singleton instance
export const llmFineTuningHandler = new LLMFineTuningHandler();
