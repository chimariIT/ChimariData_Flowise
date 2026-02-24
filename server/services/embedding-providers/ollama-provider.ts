/**
 * Ollama Embedding Provider (Local / Self-Hosted)
 *
 * Supports any Ollama-hosted embedding model. Common ones:
 * - nomic-embed-text (768d) — fast, good quality
 * - mxbai-embed-large (1024d) — higher quality
 * - all-minilm (384d) — smallest, fastest
 * - snowflake-arctic-embed (1024d)
 *
 * Env: OLLAMA_BASE_URL (default: http://localhost:11434)
 * API: POST /api/embeddings
 * Native batch: No
 */

import { BaseEmbeddingProvider } from './base-provider';
import type { EmbeddingProviderName, EmbeddingResult, ProviderModelInfo } from './types';

export class OllamaEmbeddingProvider extends BaseEmbeddingProvider {
  readonly name: EmbeddingProviderName = 'ollama';

  private static readonly DEFAULT_MODELS: ProviderModelInfo[] = [
    {
      id: 'nomic-embed-text',
      name: 'Nomic Embed Text',
      nativeDimensions: 768,
      maxInput: 8192,
      supportsBatch: false,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
    {
      id: 'mxbai-embed-large',
      name: 'MixedBread Embed Large',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: false,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
    {
      id: 'all-minilm',
      name: 'All MiniLM L6 v2',
      nativeDimensions: 384,
      maxInput: 512,
      supportsBatch: false,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
    {
      id: 'snowflake-arctic-embed',
      name: 'Snowflake Arctic Embed',
      nativeDimensions: 1024,
      maxInput: 512,
      supportsBatch: false,
      costPer1kTokens: 0,
      supportsMatryoshka: false,
    },
  ];

  /** Cached list of models pulled from the Ollama server */
  private dynamicModels: ProviderModelInfo[] | null = null;

  private getBaseUrl(): string {
    return (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
  }

  isConfigured(): boolean {
    // Ollama is configured if OLLAMA_BASE_URL is explicitly set
    return !!process.env.OLLAMA_BASE_URL;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; latencyMs: number; model?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'OLLAMA_BASE_URL not set', latencyMs: 0 };
    }

    const start = Date.now();
    try {
      // First verify server is reachable
      const tagsResponse = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/tags`,
        { method: 'GET' },
        5000
      );

      if (!tagsResponse.ok) {
        return {
          ok: false,
          error: `Ollama server returned ${tagsResponse.status}`,
          latencyMs: Date.now() - start,
        };
      }

      // Try a test embedding
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
    // Return cached dynamic models if available, otherwise static defaults
    return this.dynamicModels ?? [...OllamaEmbeddingProvider.DEFAULT_MODELS];
  }

  /**
   * Refresh the model list from the Ollama server.
   * Optionally called on admin UI load, not on every embed call.
   */
  async refreshModels(): Promise<ProviderModelInfo[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.getBaseUrl()}/api/tags`,
        { method: 'GET' },
        5000
      );

      if (!response.ok) return this.getAvailableModels();

      const data = await response.json();
      const models: ProviderModelInfo[] = [];

      for (const m of data.models || []) {
        // Only include models that look like embedding models
        const name: string = m.name || '';
        const isEmbedding = name.includes('embed') ||
          name.includes('minilm') ||
          name.includes('bge') ||
          name.includes('gte') ||
          name.includes('nomic') ||
          name.includes('arctic');

        if (isEmbedding) {
          // Try to find matching default model for dimensions
          const defaultMatch = OllamaEmbeddingProvider.DEFAULT_MODELS.find(
            dm => name.startsWith(dm.id)
          );
          models.push({
            id: name,
            name: name,
            nativeDimensions: defaultMatch?.nativeDimensions ?? 768,
            maxInput: defaultMatch?.maxInput ?? 512,
            supportsBatch: false,
            costPer1kTokens: 0,
            supportsMatryoshka: false,
          });
        }
      }

      if (models.length > 0) {
        this.dynamicModels = models;
      }

      return this.getAvailableModels();
    } catch {
      return this.getAvailableModels();
    }
  }

  getDefaultModel(): string {
    return 'nomic-embed-text';
  }

  async embedSingle(text: string, model?: string): Promise<EmbeddingResult> {
    const selectedModel = model || this.getDefaultModel();
    const baseUrl = this.getBaseUrl();

    const response = await this.fetchWithTimeout(
      `${baseUrl}/api/embeddings`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: text,
        }),
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    const embedding = data.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error(`No embedding returned from Ollama for model ${selectedModel}`);
    }

    return {
      text,
      embedding,
      model: selectedModel,
      tokensUsed: Math.ceil(text.length / 4), // Approximate
      provider: 'ollama',
      dimensions: embedding.length,
      rawDimensions: embedding.length,
    };
  }

  // Uses base class sequential batch implementation

  protected getBatchConcurrency(): number {
    return 1; // Local — sequential to avoid OOM
  }

  protected getRateLimitDelayMs(): number {
    return 10; // Local, minimal delay needed
  }
}
