/**
 * Abstract Base Embedding Provider
 *
 * Provides default batch implementation via sequential single calls.
 * Providers with native batch support should override embedBatch().
 */

import type { EmbeddingProviderName, EmbeddingResult, IEmbeddingProvider, ProviderModelInfo } from './types';

export abstract class BaseEmbeddingProvider implements IEmbeddingProvider {
  abstract readonly name: EmbeddingProviderName;

  abstract isConfigured(): boolean;
  abstract testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }>;
  abstract getAvailableModels(): ProviderModelInfo[];
  abstract getDefaultModel(): string;
  abstract embedSingle(text: string, model?: string): Promise<EmbeddingResult>;

  /**
   * Default batch implementation: sequential with configurable concurrency.
   * Override in providers that have native batch API support.
   */
  async embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const results: EmbeddingResult[] = [];
    const concurrency = this.getBatchConcurrency();

    for (let i = 0; i < texts.length; i += concurrency) {
      const batch = texts.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(text => this.embedSingle(text, model))
      );
      results.push(...batchResults);

      // Rate limiting between batches
      if (i + concurrency < texts.length) {
        const delay = this.getRateLimitDelayMs();
        if (delay > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    return results;
  }

  /** Number of concurrent embedding requests per batch. Override per provider. */
  protected getBatchConcurrency(): number {
    return 1;
  }

  /** Delay in ms between batch groups. Override per provider. */
  protected getRateLimitDelayMs(): number {
    return 100;
  }

  /**
   * Helper: Make a fetch request with timeout and error handling.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 30000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}
