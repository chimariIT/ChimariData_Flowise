/**
 * OpenRouter Embedding Provider
 *
 * Uses OpenAI-compatible embeddings endpoint:
 *   POST https://openrouter.ai/api/v1/embeddings
 *
 * Env:
 * - OPENROUTER_API_KEY (required)
 * - OPENROUTER_BASE_URL (optional, default: https://openrouter.ai/api/v1)
 *
 * Notes:
 * - Model availability depends on OpenRouter account routing.
 * - Defaults to OpenAI-compatible embedding model via OpenRouter namespace.
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class OpenRouterEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'openrouter';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'openai/text-embedding-3-small',
      name: 'OpenRouter - OpenAI Embedding 3 Small',
      nativeDimensions: 1536,
      maxInput: 8191,
      supportsBatch: true,
      costPer1kTokens: 0.00002,
      supportsMatryoshka: true,
    },
    {
      id: 'openai/text-embedding-3-large',
      name: 'OpenRouter - OpenAI Embedding 3 Large',
      nativeDimensions: 3072,
      maxInput: 8191,
      supportsBatch: true,
      costPer1kTokens: 0.00013,
      supportsMatryoshka: true,
    },
    {
      id: 'sentence-transformers/all-MiniLM-L6-v2',
      name: 'OpenRouter - MiniLM (cost-friendly)',
      nativeDimensions: 384,
      maxInput: 512,
      supportsBatch: true,
      supportsMatryoshka: false,
    },
  ];

  private getBaseUrl(): string {
    return (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'OPENROUTER_API_KEY not set', latencyMs: 0 };
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
    return [...OpenRouterEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'openai/text-embedding-3-small';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const response = await this.fetchWithTimeout(
      `${this.getBaseUrl()}/embeddings`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://chimaridata.local',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'ChimariData',
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
      throw new Error(`OpenRouter API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data?.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenRouter');
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: data?.usage?.total_tokens ?? Math.ceil(text.length / 4),
      provider: 'openrouter',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY not configured');
    }

    const selectedModel = model || this.getDefaultModel();
    const batchSize = 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://chimaridata.local',
            'X-Title': process.env.OPENROUTER_APP_NAME || 'ChimariData',
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
        throw new Error(`OpenRouter batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const embeddings = data?.data || [];
      const tokensPerText = Math.ceil((data?.usage?.total_tokens ?? 0) / Math.max(batch.length, 1));

      for (let j = 0; j < embeddings.length; j++) {
        const emb = embeddings[j]?.embedding;
        if (!emb) continue;
        results.push({
          text: batch[j],
          embedding: emb,
          model: selectedModel,
          tokensUsed: tokensPerText,
          provider: 'openrouter',
          dimensions: emb.length,
          rawDimensions: emb.length,
        });
      }
    }

    return results;
  }
}
