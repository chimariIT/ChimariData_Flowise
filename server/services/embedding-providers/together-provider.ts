/**
 * Together AI Embedding Provider
 *
 * Supports:
 * - BAAI/bge-large-en-v1.5 (1024d)
 * - WhereIsAI/UAE-Large-V1 (1024d)
 * - togethercomputer/m2-bert-80M-8k-retrieval (768d)
 *
 * Env: TOGETHER_API_KEY
 * API: OpenAI-compatible POST https://api.together.xyz/v1/embeddings
 * Native batch: Yes
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class TogetherEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'together';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'BAAI/bge-large-en-v1.5',
      name: 'BGE Large EN v1.5',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0.00001,
      supportsMatryoshka: false,
    },
    {
      id: 'WhereIsAI/UAE-Large-V1',
      name: 'UAE Large V1',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: true,
      costPer1kTokens: 0.00001,
      supportsMatryoshka: false,
    },
    {
      id: 'togethercomputer/m2-bert-80M-8k-retrieval',
      name: 'M2 BERT 80M Retrieval',
      nativeDimensions: 768,
      maxInput: 8192,
      supportsBatch: true,
      costPer1kTokens: 0.00001,
      supportsMatryoshka: false,
    },
  ];

  private static readonly API_URL = 'https://api.together.xyz/v1/embeddings';

  isConfigured(): boolean {
    return !!process.env.TOGETHER_API_KEY;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'TOGETHER_API_KEY not set', latencyMs: 0 };
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
    return [...TogetherEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'BAAI/bge-large-en-v1.5';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();

    // Together AI uses OpenAI-compatible format
    const response = await this.fetchWithTimeout(
      TogetherEmbeddingProvider.API_URL,
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
      throw new Error(`Together API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data.data?.[0]?.embedding;

    if (!embedding) {
      throw new Error('No embedding returned from Together AI');
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
      provider: 'together',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  /**
   * Override batch: Together AI supports native batch via OpenAI-compatible API.
   */
  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const batchSize = 50; // Together AI batch limit
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.fetchWithTimeout(
        TogetherEmbeddingProvider.API_URL,
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
        60000
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Together batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const tokensPerText = Math.ceil((data.usage?.total_tokens ?? 0) / batch.length);

      for (let j = 0; j < (data.data || []).length; j++) {
        const emb = data.data[j].embedding;
        results.push({
          text: batch[j],
          embedding: emb,
          model: selectedModel,
          tokensUsed: tokensPerText,
          provider: 'together',
          dimensions: emb.length,
          rawDimensions: emb.length,
        });
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
