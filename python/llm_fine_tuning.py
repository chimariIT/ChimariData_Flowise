"""
LLM Fine-Tuning Framework

Comprehensive LLM fine-tuning with support for:
- LoRA (Low-Rank Adaptation)
- QLoRA (Quantized LoRA)
- Full fine-tuning
- Parameter-Efficient Fine-Tuning (PEFT)
- Multiple providers (Hugging Face, OpenAI fine-tuning API)
"""

import os
import json
import sys
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import torch
from datetime import datetime

@dataclass
class FineTuningConfig:
    """Configuration for LLM fine-tuning"""
    model_name: str
    task_type: str  # 'causal_lm', 'seq2seq', 'classification', 'qa'
    method: str  # 'lora', 'qlora', 'full', 'prefix_tuning', 'prompt_tuning'

    # LoRA/QLoRA parameters
    lora_r: int = 8
    lora_alpha: int = 32
    lora_dropout: float = 0.1
    lora_target_modules: Optional[List[str]] = None

    # Quantization (for QLoRA)
    use_4bit: bool = False
    use_8bit: bool = False

    # Training parameters
    num_epochs: int = 3
    batch_size: int = 4
    learning_rate: float = 2e-4
    gradient_accumulation_steps: int = 4
    warmup_steps: int = 100
    max_seq_length: int = 512

    # Data
    train_data_path: Optional[str] = None
    val_data_path: Optional[str] = None

    # Output
    output_dir: str = './fine_tuned_models'
    save_steps: int = 500

    # Optimization
    use_gradient_checkpointing: bool = True
    fp16: bool = True
    bf16: bool = False

    # Evaluation
    eval_steps: int = 500
    eval_strategy: str = 'steps'

    # Provider-specific
    provider: str = 'huggingface'  # 'huggingface', 'openai', 'anthropic'
    api_key: Optional[str] = None


class LLMFineTuner:
    """
    Comprehensive LLM fine-tuning system

    Supports multiple fine-tuning methods and providers
    """

    def __init__(self, config: FineTuningConfig):
        self.config = config
        self.model = None
        self.tokenizer = None
        self.trainer = None

    def setup(self):
        """Initialize model and tokenizer"""
        print(f"🚀 Setting up {self.config.method} fine-tuning for {self.config.model_name}")

        if self.config.provider == 'huggingface':
            self._setup_huggingface()
        elif self.config.provider == 'openai':
            self._setup_openai()
        else:
            raise ValueError(f"Unsupported provider: {self.config.provider}")

    def _setup_huggingface(self):
        """Setup Hugging Face model and tokenizer"""
        from transformers import AutoTokenizer, AutoModelForCausalLM, AutoModelForSeq2SeqLM
        import torch

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(self.config.model_name)

        # Add pad token if missing
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        # Load model based on task type
        model_kwargs = {
            'trust_remote_code': True
        }

        # Quantization config
        if self.config.use_4bit or self.config.use_8bit:
            from transformers import BitsAndBytesConfig

            bnb_config = BitsAndBytesConfig(
                load_in_4bit=self.config.use_4bit,
                load_in_8bit=self.config.use_8bit,
                bnb_4bit_quant_type="nf4" if self.config.use_4bit else None,
                bnb_4bit_compute_dtype=torch.float16 if self.config.use_4bit else None,
                bnb_4bit_use_double_quant=True if self.config.use_4bit else False
            )
            model_kwargs['quantization_config'] = bnb_config
            model_kwargs['device_map'] = 'auto'

        # Load model
        if self.config.task_type == 'causal_lm':
            self.model = AutoModelForCausalLM.from_pretrained(
                self.config.model_name,
                **model_kwargs
            )
        elif self.config.task_type == 'seq2seq':
            self.model = AutoModelForSeq2SeqLM.from_pretrained(
                self.config.model_name,
                **model_kwargs
            )
        else:
            raise ValueError(f"Unsupported task type: {self.config.task_type}")

        # Enable gradient checkpointing
        if self.config.use_gradient_checkpointing:
            self.model.gradient_checkpointing_enable()

        # Prepare model for training
        if self.config.use_4bit or self.config.use_8bit:
            from peft import prepare_model_for_kbit_training
            self.model = prepare_model_for_kbit_training(self.model)

        # Apply PEFT (LoRA, QLoRA, etc.)
        if self.config.method in ['lora', 'qlora']:
            self._apply_lora()
        elif self.config.method == 'prefix_tuning':
            self._apply_prefix_tuning()
        elif self.config.method == 'prompt_tuning':
            self._apply_prompt_tuning()

        print(f"✅ Model loaded: {self.config.model_name}")
        print(f"📊 Trainable parameters: {self._count_trainable_parameters()}")

    def _apply_lora(self):
        """Apply LoRA/QLoRA to the model"""
        from peft import LoraConfig, get_peft_model, TaskType

        # Determine task type for PEFT
        task_type_map = {
            'causal_lm': TaskType.CAUSAL_LM,
            'seq2seq': TaskType.SEQ_2_SEQ_LM
        }

        # Default target modules for common models
        if self.config.lora_target_modules is None:
            # Auto-detect based on model architecture
            if 'llama' in self.config.model_name.lower():
                target_modules = ['q_proj', 'k_proj', 'v_proj', 'o_proj']
            elif 'gpt' in self.config.model_name.lower():
                target_modules = ['c_attn', 'c_proj']
            elif 'opt' in self.config.model_name.lower():
                target_modules = ['q_proj', 'k_proj', 'v_proj', 'out_proj']
            else:
                target_modules = ['q', 'v']  # Generic fallback
        else:
            target_modules = self.config.lora_target_modules

        lora_config = LoraConfig(
            r=self.config.lora_r,
            lora_alpha=self.config.lora_alpha,
            target_modules=target_modules,
            lora_dropout=self.config.lora_dropout,
            bias="none",
            task_type=task_type_map.get(self.config.task_type, TaskType.CAUSAL_LM)
        )

        self.model = get_peft_model(self.model, lora_config)
        print(f"✅ LoRA applied with r={self.config.lora_r}, alpha={self.config.lora_alpha}")

    def _apply_prefix_tuning(self):
        """Apply Prefix Tuning"""
        from peft import PrefixTuningConfig, get_peft_model, TaskType

        task_type_map = {
            'causal_lm': TaskType.CAUSAL_LM,
            'seq2seq': TaskType.SEQ_2_SEQ_LM
        }

        prefix_config = PrefixTuningConfig(
            task_type=task_type_map.get(self.config.task_type, TaskType.CAUSAL_LM),
            num_virtual_tokens=20,
            encoder_hidden_size=self.model.config.hidden_size
        )

        self.model = get_peft_model(self.model, prefix_config)
        print("✅ Prefix Tuning applied")

    def _apply_prompt_tuning(self):
        """Apply Prompt Tuning"""
        from peft import PromptTuningConfig, get_peft_model, TaskType

        task_type_map = {
            'causal_lm': TaskType.CAUSAL_LM,
            'seq2seq': TaskType.SEQ_2_SEQ_LM
        }

        prompt_config = PromptTuningConfig(
            task_type=task_type_map.get(self.config.task_type, TaskType.CAUSAL_LM),
            num_virtual_tokens=20
        )

        self.model = get_peft_model(self.model, prompt_config)
        print("✅ Prompt Tuning applied")

    def _setup_openai(self):
        """Setup OpenAI fine-tuning"""
        import openai

        if not self.config.api_key:
            raise ValueError("OpenAI API key required for OpenAI fine-tuning")

        openai.api_key = self.config.api_key
        print("✅ OpenAI client initialized")

    def prepare_data(self) -> Tuple:
        """Load and prepare training data"""
        from datasets import load_dataset

        if self.config.train_data_path:
            # Load from local file
            if self.config.train_data_path.endswith('.json'):
                dataset = load_dataset('json', data_files=self.config.train_data_path)
            elif self.config.train_data_path.endswith('.csv'):
                dataset = load_dataset('csv', data_files=self.config.train_data_path)
            else:
                raise ValueError(f"Unsupported file format: {self.config.train_data_path}")

            train_dataset = dataset['train']
        else:
            raise ValueError("No training data provided")

        # Validation data
        val_dataset = None
        if self.config.val_data_path:
            if self.config.val_data_path.endswith('.json'):
                val_dataset = load_dataset('json', data_files=self.config.val_data_path)['train']
            elif self.config.val_data_path.endswith('.csv'):
                val_dataset = load_dataset('csv', data_files=self.config.val_data_path)['train']

        # Tokenize datasets
        def tokenize_function(examples):
            # Handle different data formats
            if 'text' in examples:
                inputs = examples['text']
            elif 'prompt' in examples and 'completion' in examples:
                inputs = [f"{p}\n{c}" for p, c in zip(examples['prompt'], examples['completion'])]
            elif 'instruction' in examples and 'output' in examples:
                inputs = [f"### Instruction:\n{i}\n\n### Response:\n{o}"
                         for i, o in zip(examples['instruction'], examples['output'])]
            else:
                raise ValueError("Unknown data format. Expected 'text', 'prompt/completion', or 'instruction/output'")

            return self.tokenizer(
                inputs,
                truncation=True,
                max_length=self.config.max_seq_length,
                padding='max_length'
            )

        train_dataset = train_dataset.map(
            tokenize_function,
            batched=True,
            remove_columns=train_dataset.column_names
        )

        if val_dataset:
            val_dataset = val_dataset.map(
                tokenize_function,
                batched=True,
                remove_columns=val_dataset.column_names
            )

        return train_dataset, val_dataset

    def train(self) -> Dict[str, Any]:
        """Execute fine-tuning"""
        print("🎯 Starting fine-tuning...")

        if self.config.provider == 'huggingface':
            return self._train_huggingface()
        elif self.config.provider == 'openai':
            return self._train_openai()
        else:
            raise ValueError(f"Unsupported provider: {self.config.provider}")

    def _train_huggingface(self) -> Dict[str, Any]:
        """Train using Hugging Face Transformers"""
        from transformers import Trainer, TrainingArguments, DataCollatorForLanguageModeling

        # Prepare data
        train_dataset, val_dataset = self.prepare_data()

        # Training arguments
        training_args = TrainingArguments(
            output_dir=self.config.output_dir,
            num_train_epochs=self.config.num_epochs,
            per_device_train_batch_size=self.config.batch_size,
            per_device_eval_batch_size=self.config.batch_size,
            gradient_accumulation_steps=self.config.gradient_accumulation_steps,
            learning_rate=self.config.learning_rate,
            warmup_steps=self.config.warmup_steps,
            logging_steps=100,
            save_steps=self.config.save_steps,
            eval_steps=self.config.eval_steps if val_dataset else None,
            evaluation_strategy=self.config.eval_strategy if val_dataset else 'no',
            fp16=self.config.fp16,
            bf16=self.config.bf16,
            gradient_checkpointing=self.config.use_gradient_checkpointing,
            optim="paged_adamw_8bit" if self.config.use_4bit else "adamw_torch",
            save_total_limit=3,
            load_best_model_at_end=True if val_dataset else False,
            report_to="none"  # Disable wandb/tensorboard for now
        )

        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=self.tokenizer,
            mlm=False  # Causal LM (not masked LM)
        )

        # Create trainer
        self.trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
            data_collator=data_collator
        )

        # Train
        train_result = self.trainer.train()

        # Save model
        self.trainer.save_model()

        # Evaluate
        eval_metrics = {}
        if val_dataset:
            eval_metrics = self.trainer.evaluate()

        return {
            'success': True,
            'train_loss': train_result.training_loss,
            'train_samples': len(train_dataset),
            'eval_metrics': eval_metrics,
            'model_path': self.config.output_dir,
            'method': self.config.method,
            'trainable_params': self._count_trainable_parameters()
        }

    def _train_openai(self) -> Dict[str, Any]:
        """Train using OpenAI fine-tuning API"""
        import openai

        # Upload training file
        with open(self.config.train_data_path, 'rb') as f:
            training_file = openai.File.create(
                file=f,
                purpose='fine-tune'
            )

        # Create fine-tuning job
        fine_tune = openai.FineTuningJob.create(
            training_file=training_file.id,
            model=self.config.model_name
        )

        print(f"✅ OpenAI fine-tuning job created: {fine_tune.id}")

        return {
            'success': True,
            'job_id': fine_tune.id,
            'status': fine_tune.status,
            'model_path': None,  # Will be available after job completes
            'method': 'openai_api',
            'provider': 'openai'
        }

    def _count_trainable_parameters(self) -> Dict[str, int]:
        """Count trainable parameters"""
        trainable_params = 0
        all_params = 0

        for _, param in self.model.named_parameters():
            all_params += param.numel()
            if param.requires_grad:
                trainable_params += param.numel()

        return {
            'trainable': trainable_params,
            'all': all_params,
            'trainable_percent': 100 * trainable_params / all_params
        }


# ============================================================================
# Main Execution (stdin/stdout communication with Node.js)
# ============================================================================

if __name__ == "__main__":
    import sys
    import json
    import traceback

    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        config_dict = input_data.get('config', {})

        # Create config
        config = FineTuningConfig(**config_dict)

        # Initialize fine-tuner
        fine_tuner = LLMFineTuner(config)

        # Setup model
        fine_tuner.setup()

        # Train
        result = fine_tuner.train()

        # Output result
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        error_output = {
            'error': str(e),
            'traceback': traceback.format_exc()
        }
        print(json.dumps(error_output), file=sys.stderr)
        sys.exit(1)
