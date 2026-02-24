/**
 * OpenAI Embedding Provider
 *
 * Supports:
 * - text-embedding-ada-002 (1536d) — legacy default
 * - text-embedding-3-small (1536d) — latest, same price, better quality
 * - text-embedding-3-large (3072d) — highest quality, supports Matryoshka
 *
 * Native batch: Yes (up to 2048 inputs, chunked to 100)
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'openai';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'text-embedding-3-small',
      name: 'OpenAI Embedding 3 Small',
      nativeDimensions: 1536,
      maxInput: 8191,
      supportsBatch: true,
      costPer1kTokens: 0.00002,
      supportsMatryoshka: true,
    },
    {
      id: 'text-embedding-3-large',
      name: 'OpenAI Embedding 3 Large',
      nativeDimensions: 3072,
      maxInput: 8191,
      supportsBatch: true,
      costPer1kTokens: 0.00013,
      supportsMatryoshka: true,
    },
    {
      id: 'text-embedding-ada-002',
      name: 'OpenAI Ada 002 (Legacy)',
      nativeDimensions: 1536,
      maxInput: 8191,
      supportsBatch: true,
      costPer1kTokens: 0.0001,
      supportsMatryoshka: false,
    },
  ];

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'OPENAI_API_KEY not set', latencyMs: 0 };
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
    return [...OpenAIEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'text-embedding-ada-002';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();

    const response = await this.fetchWithTimeout(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          input: text,
        }),
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data[0].embedding;

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: data.usage?.total_tokens ?? 0,
      provider: 'openai',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  /**
   * Override batch: OpenAI has native batch embedding (up to 2048 inputs).
   * We chunk to 100 for safety / rate-limit reasons.
   */
  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const batchSize = 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.fetchWithTimeout(
        'https://api.openai.com/v1/embeddings',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: selectedModel,
            input: batch,
          }),
        },
        60000 // longer timeout for batch
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const tokensPerText = Math.ceil((data.usage?.total_tokens ?? 0) / batch.length);

      for (let j = 0; j < data.data.length; j++) {
        const emb = data.data[j].embedding;
        results.push({
          text: batch[j],
          embedding: emb,
          model: selectedModel,
          tokensUsed: tokensPerText,
          provider: 'openai',
          dimensions: emb.length,
          rawDimensions: emb.length,
        });
      }
    }

    return results;
  }

  protected getBatchConcurrency(): number {
    return 5; // OpenAI has generous rate limits
  }

  protected getRateLimitDelayMs(): number {
    return 50;
  }
}
