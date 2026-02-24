/**
 * Embedding Service — Thin Facade over Provider Registry
 *
 * Backward-compatible singleton that delegates to the extensible provider registry.
 * All 7 consumer files continue using `embeddingService.embedText()` unchanged.
 *
 * Usage:
 *   const { embedding } = await embeddingService.embedText('user question');
 *   // Store embedding in project_questions.embedding vector(1536) column
 */

import {
  EmbeddingProviderRegistry,
  OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider,
  OllamaEmbeddingProvider,
  TogetherEmbeddingProvider,
  HuggingFaceEmbeddingProvider,
  CohereEmbeddingProvider,
} from './embedding-providers';

import type {
  EmbeddingProviderName,
  EmbeddingResult,
  EmbeddingOptions,
} from './embedding-providers';

// Re-export types for backward compatibility (consumers import from here)
export type { EmbeddingProviderName, EmbeddingResult, EmbeddingOptions };

class EmbeddingService {
  private registry: EmbeddingProviderRegistry;
  private defaultTruncate = 30000;

  constructor() {
    this.registry = new EmbeddingProviderRegistry();

    // Register all providers
    this.registry.register(new OpenAIEmbeddingProvider());
    this.registry.register(new GeminiEmbeddingProvider());
    this.registry.register(new OllamaEmbeddingProvider());
    this.registry.register(new TogetherEmbeddingProvider());
    this.registry.register(new HuggingFaceEmbeddingProvider());
    this.registry.register(new CohereEmbeddingProvider());
  }

  // ==========================================
  // PUBLIC API (backward compatible)
  // ==========================================

  /**
   * Generate embedding for a single text.
   * Tries providers in fallback order (preferred → config order → any available).
   * Normalizes result to target dimension.
   */
  async embedText(text: string, options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    const truncateLength = options.truncateLength ?? this.defaultTruncate;
    const truncatedText = text.slice(0, truncateLength);
    const providers = this.registry.getOrderedProviders(options.model);

    if (providers.length === 0) {
      throw new Error(
        'No embedding provider configured. Set OPENAI_API_KEY, GOOGLE_AI_API_KEY, OLLAMA_BASE_URL, TOGETHER_API_KEY, HUGGINGFACE_API_KEY, or COHERE_API_KEY.'
      );
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const model = this.registry.getModelForProvider(provider.name);
        const result = await provider.embedSingle(truncatedText, model);

        // Normalize to target dimension
        const normalized = this.registry.normalizeEmbedding(result.embedding);

        return {
          ...result,
          embedding: normalized,
          dimensions: normalized.length,
          rawDimensions: result.rawDimensions ?? result.embedding.length,
        };
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[Embedding] Provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate embedding');
  }

  /**
   * Generate embeddings for multiple texts (batch).
   * Tries providers in fallback order. Normalizes all results.
   */
  async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const truncateLength = options.truncateLength ?? this.defaultTruncate;
    const truncatedTexts = texts.map(t => t.slice(0, truncateLength));
    const providers = this.registry.getOrderedProviders(options.model);

    if (providers.length === 0) {
      throw new Error(
        'No embedding provider configured. Set OPENAI_API_KEY, GOOGLE_AI_API_KEY, OLLAMA_BASE_URL, TOGETHER_API_KEY, HUGGINGFACE_API_KEY, or COHERE_API_KEY.'
      );
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const model = this.registry.getModelForProvider(provider.name);
        const results = await provider.embedBatch(truncatedTexts, model);

        // Normalize all embeddings to target dimension
        return results.map(result => {
          const normalized = this.registry.normalizeEmbedding(result.embedding);
          return {
            ...result,
            embedding: normalized,
            dimensions: normalized.length,
            rawDimensions: result.rawDimensions ?? result.embedding.length,
          };
        });
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[Embedding] Batch provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate batch embeddings');
  }

  /**
   * Check if any embedding provider is available
   */
  isAvailable(): boolean {
    return this.registry.isAvailable();
  }

  /**
   * Get target embedding dimension
   */
  getDimension(): number {
    return this.registry.getTargetDimension();
  }

  /**
   * Compute cosine similarity between two embedding vectors.
   * Delegates to registry for consistency.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    return this.registry.cosineSimilarity(a, b);
  }

  // ==========================================
  // REGISTRY ACCESS (for admin/config APIs)
  // ==========================================

  /** Get the underlying registry for admin operations */
  getRegistry(): EmbeddingProviderRegistry {
    return this.registry;
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();

// Log available providers on startup for diagnostics
{
  const registry = embeddingService.getRegistry();
  const configured = registry.getConfiguredProviders();
  if (configured.length > 0) {
    const names = configured.map(p => p.name).join(', ');
    console.log(`🔗 [Embedding] Available providers: ${names} (target: ${registry.getTargetDimension()}d)`);
  } else {
    console.warn(
      `⚠️ [Embedding] No embedding providers configured — semantic matching will use hash fallback only. ` +
      `Set OPENAI_API_KEY, GOOGLE_AI_API_KEY, OLLAMA_BASE_URL, TOGETHER_API_KEY, HUGGINGFACE_API_KEY, or COHERE_API_KEY.`
    );
  }
}
