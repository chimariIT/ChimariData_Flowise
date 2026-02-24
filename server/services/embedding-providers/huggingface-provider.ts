/**
 * HuggingFace Inference Embedding Provider
 *
 * Supports:
 * - sentence-transformers/gte-large (1024d)
 * - BAAI/bge-large-en-v1.5 (1024d)
 * - sentence-transformers/all-MiniLM-L6-v2 (384d)
 *
 * Env: HUGGINGFACE_API_KEY
 * API: POST https://api-inference.huggingface.co/pipeline/feature-extraction/{model}
 * Native batch: Yes (via array input)
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class HuggingFaceEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'huggingface';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'sentence-transformers/gte-large',
      name: 'GTE Large',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0, // Free tier available
      supportsMatryoshka: false,
    },
    {
      id: 'BAAI/bge-large-en-v1.5',
      name: 'BGE Large EN v1.5',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
    {
      id: 'sentence-transformers/all-MiniLM-L6-v2',
      name: 'All MiniLM L6 v2',
      nativeDimensions: 384,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
  ];

  private static readonly API_BASE = 'https://api-inference.huggingface.co/pipeline/feature-extraction';

  isConfigured(): boolean {
    return !!process.env.HUGGINGFACE_API_KEY;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'HUGGINGFACE_API_KEY not set', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      const result = await this.embedSingle('test');
      return {
        ok: true,
        latencyMs: Date.now() - start,
        model: result.model,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: error.message || String(error),
        latencyMs: Date.now() - start,
      };
    }
  }

  getAvailableModels(): ProviderModelInfo[] {
    return [...HuggingFaceEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'sentence-transformers/gte-large';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();

    const response = await this.fetchWithTimeout(
      `${HuggingFaceEmbeddingProvider.API_BASE}/${selectedModel}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: { wait_for_model: true },
        }),
      },
      60000 // HF models may need cold-start time
    );

    if (!response.ok) {
      const error = await response.text();

      // HF returns 503 when model is loading
      if (response.status === 503) {
        throw new Error(`HuggingFace model loading (${selectedModel}). Retry in ~30s.`);
      }

      throw new Error(`HuggingFace API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = this.extractEmbedding(data);

    if (!embedding) {
      throw new Error(`Failed to extract embedding from HuggingFace response for ${selectedModel}`);
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: Math.ceil(text.length / 4), // Approximate
      provider: 'huggingface',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  /**
   * Override batch: HuggingFace supports array inputs.
   */
  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      throw new Error('HUGGINGFACE_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const batchSize = 32; // HF inference API batch limit
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.fetchWithTimeout(
        `${HuggingFaceEmbeddingProvider.API_BASE}/${selectedModel}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: batch,
            options: { wait_for_model: true },
          }),
        },
        90000 // Longer timeout for batch + cold start
      );

      if (!response.ok) {
        const error = await response.text();
        if (response.status === 503) {
          throw new Error(`HuggingFace model loading (${selectedModel}). Retry in ~30s.`);
        }
        throw new Error(`HuggingFace batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      // Response is an array of embeddings (each could be nested)
      if (!Array.isArray(data) || data.length !== batch.length) {
        // Fallback to sequential if batch response shape is unexpected
        for (const text of batch) {
          const single = await this.embedSingle(text, model);
          results.push(single);
        }
        continue;
      }

      for (let j = 0; j < data.length; j++) {
        const embedding = this.extractEmbedding(data[j]);
        if (!embedding) {
          throw new Error(`Failed to extract embedding at index ${j} from HuggingFace batch`);
        }
        results.push({
          text: batch[j],
          embedding,
          model: selectedModel,
          tokensUsed: Math.ceil(batch[j].length / 4),
          provider: 'huggingface',
          dimensions: embedding.length,
          rawDimensions: embedding.length,
        });
      }

      // Rate limiting between batches
      if (i + batchSize < texts.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return results;
  }

  /**
   * HuggingFace feature-extraction can return various shapes:
   * - number[] (flat embedding)
   * - number[][] (token-level embeddings — need mean pooling)
   * - { embedding: number[] }
   */
  private extractEmbedding(data: any): number[] | null {
    if (!data) return null;

    // Direct flat array
    if (Array.isArray(data) && typeof data[0] === 'number') {
      return data as number[];
    }

    // Token-level: [[...], [...], ...] — mean pool
    if (Array.isArray(data) && Array.isArray(data[0]) && typeof data[0][0] === 'number') {
      return this.meanPool(data as number[][]);
    }

    // Object with embedding field
    if (data.embedding && Array.isArray(data.embedding)) {
      return data.embedding;
    }

    return null;
  }

  /**
   * Mean pooling: average token-level embeddings into a single vector.
   */
  private meanPool(tokenEmbeddings: number[][]): number[] {
    if (tokenEmbeddings.length === 0) return [];
    const dim = tokenEmbeddings[0].length;
    const result = new Array(dim).fill(0);

    for (const token of tokenEmbeddings) {
      for (let i = 0; i < dim; i++) {
        result[i] += token[i];
      }
    }

    const count = tokenEmbeddings.length;
    for (let i = 0; i < dim; i++) {
      result[i] /= count;
    }

    return result;
  }

  protected getBatchConcurrency(): number {
    return 1;
  }

  protected getRateLimitDelayMs(): number {
    return 200; // Conservative for free tier
  }
}
