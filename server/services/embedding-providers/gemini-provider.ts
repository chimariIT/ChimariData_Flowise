/**
 * Gemini Embedding Provider
 *
 * Supports:
 * - text-embedding-004 (768d) — current default, best quality
 * - embedding-001 (768d) — legacy
 *
 * Native batch: No (sequential with rate limiting)
 * Gemini free tier: 60 requests/minute
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class GeminiEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'gemini';

  private static readonly MODELS: ProviderModelInfo[] = [
    {
      id: 'text-embedding-004',
      name: 'Gemini Text Embedding 004',
      nativeDimensions: 768,
      maxInput: 2048,
      supportsBatch: false,
      costPer1kTokens: 0, // Free tier available
      supportsMatryoshka: false,
    },
    {
      id: 'embedding-001',
      name: 'Gemini Embedding 001 (Legacy)',
      nativeDimensions: 768,
      maxInput: 2048,
      supportsBatch: false,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
  ];

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'GOOGLE_AI_API_KEY or GEMINI_API_KEY not set', latencyMs: 0 };
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
    return [...GeminiEmbeddingProvider.MODELS];
  }

  getDefaultModel(): string {
    return 'text-embedding-004';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const apiKey = this.getApiKey();
    const selectedModel = model || this.getDefaultModel();

    const keyParam = encodeURIComponent(apiKey);
    const response = await this.fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:embedContent?key=${keyParam}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model: `models/${selectedModel}`,
          content: {
            parts: [{ text }],
          },
          taskType: 'RETRIEVAL_DOCUMENT',
        }),
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data.embedding?.values;

    if (!embedding) {
      throw new Error('No embedding returned from Gemini');
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: Math.ceil(text.length / 4), // Approximate
      provider: 'gemini',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  // Gemini has no native batch — uses base class sequential implementation

  protected getBatchConcurrency(): number {
    return 1; // Sequential — Gemini free tier is 60 rpm
  }

  protected getRateLimitDelayMs(): number {
    return 100; // ~600 embeddings per minute max
  }

  private getApiKey(): string {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Set GEMINI_API_KEY or GOOGLE_AI_API_KEY to use Gemini embeddings');
    }
    return apiKey;
  }
}
