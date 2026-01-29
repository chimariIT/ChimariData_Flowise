/**
 * Embedding Service
 * Generates vector embeddings for semantic search using OpenAI or Gemini
 *
 * Usage:
 *   const { embedding } = await embeddingService.embedText('user question');
 *   // Store embedding in project_questions.embedding vector(1536) column
 */

import { z } from 'zod';

// Validate embedding dimensions (supports 256, 512, 768, or 1536)
const EmbeddingVector = z.array(z.number()).min(256).max(1536);

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokensUsed: number;
}

export interface EmbeddingOptions {
  model?: EmbeddingProvider;
  truncateLength?: number;
  // For OpenAI text-embedding-3-small: can reduce to 256 or 512 for storage savings
  // Lower dimensions = smaller storage, slightly lower quality
  dimensions?: 256 | 512 | 1536;
  // Task type for automatic optimization
  taskType?: EmbeddingTaskType;
}

/**
 * Available embedding providers
 *
 * Paid providers (best quality):
 * - 'openai': OpenAI text-embedding-3-small (1536 dims, $0.02/1M tokens)
 * - 'gemini': Google text-embedding-004 (768 dims, padded to 1536)
 *
 * Free/Local providers (good for development and cost-sensitive use):
 * - 'huggingface': HuggingFace Inference API (free tier, BAAI/bge-small-en-v1.5)
 * - 'ollama': Local Ollama server (completely free, requires local setup)
 */
export type EmbeddingProvider = 'openai' | 'gemini' | 'huggingface' | 'ollama';

/**
 * Predefined embedding task types with optimized settings
 */
export type EmbeddingTaskType =
  | 'column_matching'     // Short column names: 512 dims, 500 chars
  | 'question_answer'     // User questions: 1536 dims, 2000 chars
  | 'document_search'     // Long documents: 1536 dims, 8000 chars
  | 'data_classification' // Data rows for ML: 1536 dims, 4000 chars
  | 'semantic_search'     // General search: 1536 dims, 4000 chars
  | 'default';            // Full quality: 1536 dims, 8000 chars

/**
 * Task-specific configuration presets
 */
export const EMBEDDING_TASK_CONFIGS: Record<EmbeddingTaskType, { truncateLength: number; dimensions: 256 | 512 | 1536 }> = {
  column_matching: { truncateLength: 500, dimensions: 512 },
  question_answer: { truncateLength: 2000, dimensions: 1536 },
  document_search: { truncateLength: 8000, dimensions: 1536 },
  data_classification: { truncateLength: 4000, dimensions: 1536 },
  semantic_search: { truncateLength: 4000, dimensions: 1536 },
  default: { truncateLength: 8000, dimensions: 1536 }
};

// Internal provider implementation interface
interface ProviderImpl {
  name: EmbeddingProvider;
  single: (text: string, dimensions?: number) => Promise<EmbeddingResult>;
  batch: (texts: string[], truncateLength: number, dimensions?: number) => Promise<EmbeddingResult[]>;
}

class EmbeddingService {
  // === PAID PROVIDERS (Best Quality) ===

  // OpenAI: text-embedding-3-small is newer, cheaper, and better than ada-002
  // Supports native 1536 dimensions (or 256/512 for reduced storage)
  // Cost: ~$0.02 per 1M tokens
  private openaiModel = 'text-embedding-3-small';

  // Gemini: text-embedding-004 is the current embedding model (not gemini-pro)
  // Returns 768 dimensions (padded to 1536 for compatibility)
  // Cost: Free tier available, then ~$0.025 per 1M chars
  private geminiModel = 'text-embedding-004';

  // === FREE PROVIDERS (Good for Development/Cost-Sensitive) ===

  // HuggingFace: BAAI/bge-small-en-v1.5 - excellent for retrieval, 384 dims
  // Free tier: 1000 requests/day, commercial use allowed
  // Alternative models: sentence-transformers/all-MiniLM-L6-v2 (384 dims)
  private huggingfaceModel = 'BAAI/bge-small-en-v1.5';

  // Ollama: Local embedding model (completely free, requires local Ollama server)
  // Models: nomic-embed-text (768 dims), mxbai-embed-large (1024 dims)
  private ollamaModel = 'nomic-embed-text';
  private ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  // Standard dimension for pgvector compatibility
  private dimension = 1536;

  // Default truncate length for general use (questions, documents, classification)
  // Long enough for most texts, short enough to avoid excessive token costs
  private defaultTruncate = 8000;

  /**
   * Generate embedding for a single text
   * @param text - Text to embed
   * @param options.taskType - Predefined task type for automatic optimization
   * @param options.truncateLength - Max text length (overrides taskType default)
   * @param options.dimensions - Embedding dimensions (overrides taskType default)
   *
   * Task types:
   * - 'column_matching': Short column names (512 dims, 500 chars)
   * - 'question_answer': User questions (1536 dims, 2000 chars)
   * - 'document_search': Long documents (1536 dims, 8000 chars)
   * - 'data_classification': Data rows for ML (1536 dims, 4000 chars)
   * - 'semantic_search': General search (1536 dims, 4000 chars)
   * - 'default': Full quality (1536 dims, 8000 chars)
   */
  async embedText(text: string, options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    // Get task-specific config if taskType specified
    const taskConfig = options.taskType ? EMBEDDING_TASK_CONFIGS[options.taskType] : null;

    // Use explicit options > task config > defaults
    const truncateLength = options.truncateLength ?? taskConfig?.truncateLength ?? this.defaultTruncate;
    const dimensions = options.dimensions ?? taskConfig?.dimensions ?? this.dimension;

    const truncatedText = text.slice(0, truncateLength);
    const providers = this.getProviders(options.model);

    if (providers.length === 0) {
      throw new Error(
        'No embedding provider configured. Options: ' +
        'OPENAI_API_KEY, GOOGLE_AI_API_KEY, HUGGINGFACE_API_KEY, or OLLAMA_URL/OLLAMA_ENABLED'
      );
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        return await provider.single(truncatedText, dimensions);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Embedding provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate embedding');
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * Supports same taskType presets as embedText
   */
  async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    // Get task-specific config if taskType specified
    const taskConfig = options.taskType ? EMBEDDING_TASK_CONFIGS[options.taskType] : null;

    const truncateLength = options.truncateLength ?? taskConfig?.truncateLength ?? this.defaultTruncate;
    const dimensions = options.dimensions ?? taskConfig?.dimensions ?? this.dimension;
    const providers = this.getProviders(options.model);
    if (providers.length === 0) {
      throw new Error(
        'No embedding provider configured. Options: ' +
        'OPENAI_API_KEY, GOOGLE_AI_API_KEY, HUGGINGFACE_API_KEY, or OLLAMA_URL/OLLAMA_ENABLED'
      );
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        return await provider.batch(texts, truncateLength, dimensions);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Batch embedding provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate batch embeddings');
  }

  /**
   * Check if embedding service is available
   * Returns true if any embedding provider is configured
   */
  isAvailable(): boolean {
    return !!(
      process.env.OPENAI_API_KEY ||
      process.env.GOOGLE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.HUGGINGFACE_API_KEY ||
      process.env.OLLAMA_URL ||
      process.env.OLLAMA_ENABLED === 'true'
    );
  }

  /**
   * Get list of available providers for diagnostics
   */
  getAvailableProviders(): EmbeddingProvider[] {
    const available: EmbeddingProvider[] = [];
    if (process.env.OPENAI_API_KEY) available.push('openai');
    if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) available.push('gemini');
    if (process.env.HUGGINGFACE_API_KEY) available.push('huggingface');
    if (process.env.OLLAMA_URL || process.env.OLLAMA_ENABLED === 'true') available.push('ollama');
    return available;
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    return this.dimension;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getProviders(preferred?: EmbeddingProvider): ProviderImpl[] {
    const providers: ProviderImpl[] = [];

    const addProvider = (name: EmbeddingProvider, single: ProviderImpl['single'], batch: ProviderImpl['batch']) => {
      providers.push({ name, single, batch });
    };

    // Check provider availability
    const openaiAvailable = !!process.env.OPENAI_API_KEY;
    const geminiAvailable = !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
    const huggingfaceAvailable = !!process.env.HUGGINGFACE_API_KEY;
    const ollamaAvailable = !!(process.env.OLLAMA_URL || process.env.OLLAMA_ENABLED === 'true');

    // Build provider order: preferred first, then fallbacks
    const order = this.getProviderOrder(
      preferred,
      openaiAvailable,
      geminiAvailable,
      huggingfaceAvailable,
      ollamaAvailable
    );

    for (const name of order) {
      if (name === 'openai' && openaiAvailable) {
        addProvider(
          'openai',
          (text, dims) => this.embedWithOpenAI(text, dims),
          (texts, truncate, dims) => this.batchEmbedWithOpenAI(texts, truncate, dims)
        );
      } else if (name === 'gemini' && geminiAvailable) {
        addProvider(
          'gemini',
          (text) => this.embedWithGemini(text),
          (texts, truncate) => this.batchEmbedWithGemini(texts, truncate)
        );
      } else if (name === 'huggingface' && huggingfaceAvailable) {
        addProvider(
          'huggingface',
          (text) => this.embedWithHuggingFace(text),
          (texts, truncate) => this.batchEmbedWithHuggingFace(texts, truncate)
        );
      } else if (name === 'ollama' && ollamaAvailable) {
        addProvider(
          'ollama',
          (text) => this.embedWithOllama(text),
          (texts, truncate) => this.batchEmbedWithOllama(texts, truncate)
        );
      }
    }

    return providers;
  }

  /**
   * Get provider order based on preference and availability
   * Priority: preferred > paid (openai, gemini) > free (huggingface, ollama)
   */
  private getProviderOrder(
    preferred: EmbeddingProvider | undefined,
    openaiAvailable: boolean,
    geminiAvailable: boolean,
    huggingfaceAvailable: boolean,
    ollamaAvailable: boolean
  ): EmbeddingProvider[] {
    const order: EmbeddingProvider[] = [];

    // Add preferred provider first if specified
    if (preferred) {
      order.push(preferred);
    }

    // Add paid providers (better quality)
    if (openaiAvailable && !order.includes('openai')) order.push('openai');
    if (geminiAvailable && !order.includes('gemini')) order.push('gemini');

    // Add free providers as fallbacks
    if (huggingfaceAvailable && !order.includes('huggingface')) order.push('huggingface');
    if (ollamaAvailable && !order.includes('ollama')) order.push('ollama');

    return order;
  }

  private async embedWithOpenAI(text: string, dimensions?: number): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    try {
      // text-embedding-3-small supports dimensions parameter for storage optimization
      // Lower dimensions = smaller storage, slightly reduced quality
      const requestBody: Record<string, any> = {
        model: this.openaiModel,
        input: text
      };

      // Only add dimensions if specified and using a model that supports it
      if (dimensions && this.openaiModel.includes('text-embedding-3')) {
        requestBody.dimensions = dimensions;
      }

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      let embedding = data.data[0].embedding;

      // If reduced dimensions were requested, pad to 1536 for pgvector compatibility
      if (dimensions && dimensions < 1536) {
        embedding = this.padToStandardDimension(embedding, 1536);
      }

      // Validate embedding dimension
      EmbeddingVector.parse(embedding);

      return {
        text,
        embedding,
        model: this.openaiModel,
        tokensUsed: data.usage?.total_tokens ?? 0
      };
    } catch (error: any) {
      console.error('OpenAI embedding failed:', error.message);
      throw error;
    }
  }

  /**
   * Pad a smaller embedding to standard dimension for pgvector compatibility
   * Uses zero-padding (maintains semantic properties for cosine similarity)
   */
  private padToStandardDimension(embedding: number[], targetDim: number): number[] {
    if (embedding.length >= targetDim) return embedding.slice(0, targetDim);
    const padded = new Array(targetDim).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      padded[i] = embedding[i];
    }
    return padded;
  }

  private async embedWithGemini(text: string): Promise<EmbeddingResult> {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Set GEMINI_API_KEY or GOOGLE_AI_API_KEY to use Gemini embeddings');
    }

    try {
      const keyParam = encodeURIComponent(apiKey);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:embedContent?key=${keyParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: `models/${this.geminiModel}`,
          content: {
            parts: [{ text }]
          },
          taskType: 'RETRIEVAL_DOCUMENT'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      let embedding = data.embedding?.values;

      if (!embedding) {
        throw new Error('No embedding returned from Gemini');
      }

      // Gemini returns 768 dimensions, pad to 1536 for compatibility
      if (embedding.length === 768) {
        embedding = this.padTo1536(embedding);
      }

      return {
        text,
        embedding,
        model: this.geminiModel,
        tokensUsed: text.length / 4 // Approximate
      };
    } catch (error: any) {
      console.error('Gemini embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithOpenAI(texts: string[], truncateLength: number, dimensions?: number): Promise<EmbeddingResult[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // OpenAI allows up to 2048 texts per batch
    const batchSize = 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const truncatedBatch = batch.map(t => t.slice(0, truncateLength));

      const requestBody: Record<string, any> = {
        model: this.openaiModel,
        input: truncatedBatch
      };

      // Only add dimensions if specified and using a model that supports it
      if (dimensions && this.openaiModel.includes('text-embedding-3')) {
        requestBody.dimensions = dimensions;
      }

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const tokensPerText = Math.ceil((data.usage?.total_tokens ?? 0) / truncatedBatch.length);

      for (let j = 0; j < data.data.length; j++) {
        let embedding = data.data[j].embedding;

        // If reduced dimensions were requested, pad to 1536 for pgvector compatibility
        if (dimensions && dimensions < 1536) {
          embedding = this.padToStandardDimension(embedding, 1536);
        }

        results.push({
          text: truncatedBatch[j],
          embedding,
          model: this.openaiModel,
          tokensUsed: tokensPerText
        });
      }
    }

    return results;
  }

  private async batchEmbedWithGemini(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    // Gemini doesn't have native batch embedding, process sequentially
    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      const truncated = text.slice(0, truncateLength);
      const result = await this.embedWithGemini(truncated);
      results.push(result);

      // Rate limit: 60 requests/minute for Gemini free tier
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  // ============================================
  // FREE PROVIDERS
  // ============================================

  /**
   * Generate embedding using HuggingFace Inference API
   * Model: BAAI/bge-small-en-v1.5 (384 dims) - excellent for retrieval
   * Free tier: 1000 requests/day, commercial use allowed
   * Alternative: sentence-transformers/all-MiniLM-L6-v2 (384 dims)
   */
  private async embedWithHuggingFace(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.huggingfaceModel}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: text,
            options: { wait_for_model: true }
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HuggingFace API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      // HuggingFace returns nested array for feature extraction
      let embedding: number[] = Array.isArray(data[0]) ? data[0] : data;

      // BAAI/bge-small-en-v1.5 returns 384 dims, pad to 1536 for compatibility
      if (embedding.length < 1536) {
        embedding = this.padToStandardDimension(embedding, 1536);
      }

      return {
        text,
        embedding,
        model: this.huggingfaceModel,
        tokensUsed: Math.ceil(text.length / 4) // Approximate
      };
    } catch (error: any) {
      console.error('HuggingFace embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithHuggingFace(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    // HuggingFace supports batch requests
    const truncatedTexts = texts.map(t => t.slice(0, truncateLength));

    try {
      const response = await fetch(
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${this.huggingfaceModel}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: truncatedTexts,
            options: { wait_for_model: true }
          })
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`HuggingFace batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      return data.map((embeddingData: number[] | number[][], index: number) => {
        let embedding: number[] = Array.isArray(embeddingData[0]) ? embeddingData[0] as number[] : embeddingData as number[];

        // Pad to 1536 for compatibility
        if (embedding.length < 1536) {
          embedding = this.padToStandardDimension(embedding, 1536);
        }

        return {
          text: truncatedTexts[index],
          embedding,
          model: this.huggingfaceModel,
          tokensUsed: Math.ceil(truncatedTexts[index].length / 4)
        };
      });
    } catch (error: any) {
      console.error('HuggingFace batch embedding failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate embedding using local Ollama server
   * Model: nomic-embed-text (768 dims) - completely free, requires local setup
   * Alternatives: mxbai-embed-large (1024 dims), all-minilm (384 dims)
   *
   * Setup: ollama pull nomic-embed-text
   * Run: ollama serve (or it runs as daemon on macOS/Linux)
   */
  private async embedWithOllama(text: string): Promise<EmbeddingResult> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.ollamaModel,
          prompt: text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      let embedding = data.embedding;

      if (!embedding || embedding.length === 0) {
        throw new Error('No embedding returned from Ollama');
      }

      // Pad to 1536 for pgvector compatibility
      if (embedding.length < 1536) {
        embedding = this.padToStandardDimension(embedding, 1536);
      }

      return {
        text,
        embedding,
        model: this.ollamaModel,
        tokensUsed: Math.ceil(text.length / 4) // Approximate
      };
    } catch (error: any) {
      console.error('Ollama embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithOllama(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    // Ollama doesn't have native batch embedding, process sequentially
    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      const truncated = text.slice(0, truncateLength);
      const result = await this.embedWithOllama(truncated);
      results.push(result);

      // Small delay to avoid overwhelming local server
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return results;
  }

  // ============================================
  // PADDING UTILITIES
  // ============================================

  /**
   * Pad 768-dim Gemini embedding to 1536-dim for pgvector compatibility
   * Uses simple concatenation with reversed values (maintains semantic distance)
   */
  private padTo1536(embedding: number[]): number[] {
    if (embedding.length === 1536) return embedding;
    if (embedding.length !== 768) {
      throw new Error(`Unexpected embedding dimension: ${embedding.length}`);
    }

    // Concatenate with reversed version to maintain semantic properties
    return [...embedding, ...embedding.slice().reverse()];
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();
