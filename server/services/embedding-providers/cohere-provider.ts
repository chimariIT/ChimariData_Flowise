/**
 * Cohere Embedding Provider
 *
 * Supports:
 * - embed-english-v3.0 (1024d) — latest, best quality
 * - embed-multilingual-v3.0 (1024d) — 100+ languages
 * - embed-english-light-v3.0 (384d) — fastest, cheapest
 *
 * Env: COHERE_API_KEY
 * API: POST https://api.cohere.ai/v1/embed
 * Native batch: Yes (up to 96 texts per request)
 * Note: Requires `input_type` parameter ('search_document' or 'search_query')
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class CohereEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'cohere';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'embed-english-v3.0',
      name: 'Cohere Embed English v3',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0.0001,
      supportsMatryoshka: false,
    },
    {
      id: 'embed-multilingual-v3.0',
      name: 'Cohere Embed Multilingual v3',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0.0001,
      supportsMatryoshka: false,
    },
    {
      id: 'embed-english-light-v3.0',
      name: 'Cohere Embed English Light v3',
      nativeDimensions: 384,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0.00002,
      supportsMatryoshka: false,
    },
  ];

  private static readonly API_URL = 'https://api.cohere.ai/v1/embed';

  isConfigured(): boolean {
    return !!process.env.COHERE_API_KEY;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'COHERE_API_KEY not set', latencyMs: 0 };
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
    return [...CohereEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'embed-english-v3.0';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('COHERE_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();

    const response = await this.fetchWithTimeout(
      CohereEmbeddingProvider.API_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          texts: [text],
          input_type: 'search_document',
          truncate: 'END',
        }),
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cohere API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0];

    if (!embedding) {
      throw new Error('No embedding returned from Cohere');
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: data.meta?.billed_units?.input_tokens ?? Math.ceil(text.length / 4),
      provider: 'cohere',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  /**
   * Override batch: Cohere has native batch support (up to 96 texts).
   */
  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.COHERE_API_KEY;
    if (!apiKey) {
      throw new Error('COHERE_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const batchSize = 96; // Cohere limit
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.fetchWithTimeout(
        CohereEmbeddingProvider.API_URL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            texts: batch,
            input_type: 'search_document',
            truncate: 'END',
          }),
        },
        60000
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Cohere batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const embeddings = data.embeddings || [];
      const totalTokens = data.meta?.billed_units?.input_tokens ?? 0;
      const tokensPerText = batch.length > 0 ? Math.ceil(totalTokens / batch.length) : 0;

      for (let j = 0; j < embeddings.length; j++) {
        results.push({
          text: batch[j],
          embedding: embeddings[j],
          model: selectedModel,
          tokensUsed: tokensPerText,
          provider: 'cohere',
          dimensions: embeddings[j].length,
          rawDimensions: embeddings[j].length,
        });
      }

      // Rate limiting between batches
      if (i + batchSize < texts.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    return results;
  }

  protected getBatchConcurrency(): number {
    return 3;
  }

  protected getRateLimitDelayMs(): number {
    return 50;
  }
}
