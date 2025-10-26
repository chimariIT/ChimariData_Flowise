import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * LLM Fine-Tuning Service
 *
 * TypeScript wrapper for Python LLM fine-tuning framework
 * Supports LoRA, QLoRA, and full fine-tuning
 */

export interface FineTuningConfig {
  // Model configuration
  model_name: string;
  task_type: 'causal_lm' | 'seq2seq' | 'classification' | 'qa';
  method: 'lora' | 'qlora' | 'full' | 'prefix_tuning' | 'prompt_tuning';

  // LoRA/QLoRA parameters
  lora_r?: number;
  lora_alpha?: number;
  lora_dropout?: number;
  lora_target_modules?: string[];

  // Quantization
  use_4bit?: boolean;
  use_8bit?: boolean;

  // Training parameters
  num_epochs?: number;
  batch_size?: number;
  learning_rate?: number;
  gradient_accumulation_steps?: number;
  warmup_steps?: number;
  max_seq_length?: number;

  // Data paths
  train_data_path: string;
  val_data_path?: string;

  // Output
  output_dir?: string;
  save_steps?: number;

  // Optimization
  use_gradient_checkpointing?: boolean;
  fp16?: boolean;
  bf16?: boolean;

  // Evaluation
  eval_steps?: number;
  eval_strategy?: 'steps' | 'epoch' | 'no';

  // Provider
  provider?: 'huggingface' | 'openai' | 'anthropic';
  api_key?: string;
}

export interface FineTuningResult {
  success: boolean;
  train_loss?: number;
  train_samples?: number;
  eval_metrics?: Record<string, number>;
  model_path?: string;
  method?: string;
  trainable_params?: {
    trainable: number;
    all: number;
    trainable_percent: number;
  };
  job_id?: string;  // For API-based fine-tuning
  status?: string;
  error?: string;
  execution_time_seconds?: number;
}

export interface FineTuningRecommendation {
  recommended_method: 'lora' | 'qlora' | 'full';
  reasoning: string;
  estimated_memory_gb: number;
  estimated_time_hours: number;
  use_quantization: boolean;
}

export class LLMFineTuningService {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(
      process.cwd(),
      'python',
      'llm_fine_tuning.py'
    );
  }

  /**
   * Get fine-tuning method recommendation based on available resources
   */
  getMethodRecommendation(
    modelSize: 'small' | 'medium' | 'large' | 'xlarge',
    availableMemoryGB: number,
    hasGPU: boolean
  ): FineTuningRecommendation {
    const modelSizes = {
      small: 1,    // <1B parameters (e.g., GPT-2, DistilGPT-2)
      medium: 3,   // 1-7B parameters (e.g., GPT-2 XL, LLaMA 7B)
      large: 13,   // 7-20B parameters (e.g., LLaMA 13B)
      xlarge: 70   // >20B parameters (e.g., LLaMA 70B)
    };

    const size = modelSizes[modelSize];

    // Estimate memory requirements
    // Full fine-tuning: ~4-6x model size in GB
    // LoRA: ~1.5-2x model size in GB
    // QLoRA (4-bit): ~0.5-0.7x model size in GB

    const fullMemory = size * 5;
    const loraMemory = size * 1.7;
    const qloraMemory = size * 0.6;

    // Recommend based on available memory
    if (!hasGPU) {
      return {
        recommended_method: 'qlora',
        reasoning: 'No GPU detected - QLoRA with CPU training (slow but feasible)',
        estimated_memory_gb: qloraMemory,
        estimated_time_hours: size * 24, // Very slow on CPU
        use_quantization: true
      };
    }

    if (availableMemoryGB >= fullMemory) {
      return {
        recommended_method: 'full',
        reasoning: `Sufficient memory (${availableMemoryGB}GB) for full fine-tuning - best performance`,
        estimated_memory_gb: fullMemory,
        estimated_time_hours: size * 0.5,
        use_quantization: false
      };
    }

    if (availableMemoryGB >= loraMemory) {
      return {
        recommended_method: 'lora',
        reasoning: `LoRA recommended - 90% of full fine-tuning performance with ${loraMemory}GB memory`,
        estimated_memory_gb: loraMemory,
        estimated_time_hours: size * 0.3,
        use_quantization: false
      };
    }

    return {
      recommended_method: 'qlora',
      reasoning: `QLoRA (4-bit quantization) recommended - fits in ${qloraMemory}GB, minimal performance loss`,
      estimated_memory_gb: qloraMemory,
      estimated_time_hours: size * 0.4,
      use_quantization: true
    };
  }

  /**
   * Run LLM fine-tuning
   */
  async fineTune(config: FineTuningConfig): Promise<FineTuningResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Set defaults
      const fullConfig = {
        ...config,
        lora_r: config.lora_r || 8,
        lora_alpha: config.lora_alpha || 32,
        lora_dropout: config.lora_dropout || 0.1,
        use_4bit: config.use_4bit || (config.method === 'qlora'),
        use_8bit: config.use_8bit || false,
        num_epochs: config.num_epochs || 3,
        batch_size: config.batch_size || 4,
        learning_rate: config.learning_rate || 2e-4,
        gradient_accumulation_steps: config.gradient_accumulation_steps || 4,
        warmup_steps: config.warmup_steps || 100,
        max_seq_length: config.max_seq_length || 512,
        output_dir: config.output_dir || path.join(process.cwd(), 'uploads', 'fine_tuned_models', `model_${Date.now()}`),
        save_steps: config.save_steps || 500,
        use_gradient_checkpointing: config.use_gradient_checkpointing !== false,
        fp16: config.fp16 !== false,
        bf16: config.bf16 || false,
        eval_steps: config.eval_steps || 500,
        eval_strategy: config.eval_strategy || 'steps',
        provider: config.provider || 'huggingface'
      };

      // Spawn Python process
      const pythonProcess = spawn('python', [this.pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      // Send config to Python
      const inputData = { config: fullConfig };
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();

      // Collect output
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        // Log progress
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.includes('🚀') || line.includes('✅') || line.includes('🎯')) {
            console.log(line);
          }
        });
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error('Fine-tuning:', data.toString());
      });

      pythonProcess.on('close', (code) => {
        const executionTime = (Date.now() - startTime) / 1000;

        if (code !== 0) {
          console.error('❌ Fine-tuning failed:', stderr);
          resolve({
            success: false,
            error: stderr || 'Fine-tuning process failed',
            execution_time_seconds: executionTime
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);

          resolve({
            success: true,
            ...result,
            execution_time_seconds: executionTime
          });
        } catch (error) {
          console.error('❌ Failed to parse fine-tuning result:', error);
          resolve({
            success: false,
            error: `Failed to parse result: ${error}`,
            execution_time_seconds: executionTime
          });
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start fine-tuning process: ${error.message}`));
      });
    });
  }

  /**
   * Fine-tune with LoRA (Low-Rank Adaptation)
   */
  async finetuneWithLoRA(
    modelName: string,
    trainDataPath: string,
    options: {
      taskType?: 'causal_lm' | 'seq2seq';
      loraR?: number;
      loraAlpha?: number;
      numEpochs?: number;
      valDataPath?: string;
    } = {}
  ): Promise<FineTuningResult> {
    return this.fineTune({
      model_name: modelName,
      task_type: options.taskType || 'causal_lm',
      method: 'lora',
      train_data_path: trainDataPath,
      val_data_path: options.valDataPath,
      lora_r: options.loraR,
      lora_alpha: options.loraAlpha,
      num_epochs: options.numEpochs
    });
  }

  /**
   * Fine-tune with QLoRA (Quantized LoRA) - memory efficient
   */
  async finetuneWithQLoRA(
    modelName: string,
    trainDataPath: string,
    options: {
      taskType?: 'causal_lm' | 'seq2seq';
      loraR?: number;
      loraAlpha?: number;
      numEpochs?: number;
      valDataPath?: string;
    } = {}
  ): Promise<FineTuningResult> {
    return this.fineTune({
      model_name: modelName,
      task_type: options.taskType || 'causal_lm',
      method: 'qlora',
      train_data_path: trainDataPath,
      val_data_path: options.valDataPath,
      lora_r: options.loraR,
      lora_alpha: options.loraAlpha,
      num_epochs: options.numEpochs,
      use_4bit: true
    });
  }

  /**
   * Full fine-tuning (all parameters)
   */
  async fullFineTune(
    modelName: string,
    trainDataPath: string,
    options: {
      taskType?: 'causal_lm' | 'seq2seq';
      numEpochs?: number;
      valDataPath?: string;
    } = {}
  ): Promise<FineTuningResult> {
    return this.fineTune({
      model_name: modelName,
      task_type: options.taskType || 'causal_lm',
      method: 'full',
      train_data_path: trainDataPath,
      val_data_path: options.valDataPath,
      num_epochs: options.numEpochs
    });
  }

  /**
   * Health check - verify dependencies
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    libraries: {
      transformers: boolean;
      peft: boolean;
      bitsandbytes: boolean;
      accelerate: boolean;
      trl: boolean;
      datasets: boolean;
    };
    gpu_available: boolean;
    errors: string[];
  }> {
    return new Promise((resolve) => {
      const pythonCode = `
import sys
import json

libraries = {}
errors = []

try:
    import transformers
    libraries['transformers'] = True
except Exception as e:
    libraries['transformers'] = False
    errors.append(f'transformers: {str(e)}')

try:
    import peft
    libraries['peft'] = True
except Exception as e:
    libraries['peft'] = False
    errors.append(f'peft: {str(e)}')

try:
    import bitsandbytes
    libraries['bitsandbytes'] = True
except Exception as e:
    libraries['bitsandbytes'] = False
    errors.append(f'bitsandbytes: {str(e)}')

try:
    import accelerate
    libraries['accelerate'] = True
except Exception as e:
    libraries['accelerate'] = False
    errors.append(f'accelerate: {str(e)}')

try:
    import trl
    libraries['trl'] = True
except Exception as e:
    libraries['trl'] = False
    errors.append(f'trl: {str(e)}')

try:
    import datasets
    libraries['datasets'] = True
except Exception as e:
    libraries['datasets'] = False
    errors.append(f'datasets: {str(e)}')

# Check GPU
gpu_available = False
try:
    import torch
    gpu_available = torch.cuda.is_available()
except:
    pass

print(json.dumps({'libraries': libraries, 'gpu_available': gpu_available, 'errors': errors}))
`;

      const pythonProcess = spawn('python', ['-c', pythonCode]);
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            status: 'unhealthy',
            libraries: {
              transformers: false,
              peft: false,
              bitsandbytes: false,
              accelerate: false,
              trl: false,
              datasets: false
            },
            gpu_available: false,
            errors: [stderr || 'Python process failed']
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const allHealthy = Object.values(result.libraries).every((v: any) => v === true);

          resolve({
            status: allHealthy ? 'healthy' : 'unhealthy',
            libraries: result.libraries,
            gpu_available: result.gpu_available,
            errors: result.errors
          });
        } catch (error) {
          resolve({
            status: 'unhealthy',
            libraries: {
              transformers: false,
              peft: false,
              bitsandbytes: false,
              accelerate: false,
              trl: false,
              datasets: false
            },
            gpu_available: false,
            errors: [`Failed to parse health check: ${error}`]
          });
        }
      });
    });
  }
}

// Singleton instance
export const llmFineTuningService = new LLMFineTuningService();
