/**
 * Embedding Provider Registry
 *
 * Central registry for all embedding providers. Handles:
 * - Provider registration and discovery
 * - Configuration-driven provider ordering
 * - Embedding dimension normalization (pad/truncate to target)
 */

import type {
  EmbeddingProviderName,
  EmbeddingProviderConfig,
  IEmbeddingProvider,
  EmbeddingResult,
} from './types';

const DEFAULT_TARGET_DIMENSION = 1536;

export class EmbeddingProviderRegistry {
  private providers = new Map<EmbeddingProviderName, IEmbeddingProvider>();
  private config: EmbeddingProviderConfig = EmbeddingProviderRegistry.getDefaultConfig();

  // ==========================================
  // PROVIDER MANAGEMENT
  // ==========================================

  /** Register a provider. Replaces any existing provider with the same name. */
  register(provider: IEmbeddingProvider): void {
    this.providers.set(provider.name, provider);
  }

  /** Get a specific provider by name */
  getProvider(name: EmbeddingProviderName): IEmbeddingProvider | undefined {
    return this.providers.get(name);
  }

  /** Get all registered providers */
  getAllProviders(): IEmbeddingProvider[] {
    return Array.from(this.providers.values());
  }

  /** Get providers that have valid configuration (API keys, etc.) */
  getConfiguredProviders(): IEmbeddingProvider[] {
    return this.getAllProviders().filter(p => p.isConfigured());
  }

  /**
   * Get providers in the configured fallback order, filtered to only configured ones.
   * If no order is configured, returns all configured providers.
   */
  getOrderedProviders(preferredProvider?: EmbeddingProviderName): IEmbeddingProvider[] {
    const configured = new Set(
      this.getConfiguredProviders().map(p => p.name)
    );

    // Build ordered list: preferred first, then config order, then any remaining configured
    const order: EmbeddingProviderName[] = [];

    if (preferredProvider && configured.has(preferredProvider)) {
      order.push(preferredProvider);
    }

    for (const name of this.config.providerOrder) {
      if (configured.has(name) && !order.includes(name)) {
        order.push(name);
      }
    }

    // Add any configured providers not in the explicit order
    for (const name of configured) {
      if (!order.includes(name)) {
        order.push(name);
      }
    }

    return order
      .map(name => this.providers.get(name))
      .filter((p): p is IEmbeddingProvider => !!p);
  }

  /** Check if any provider is available */
  isAvailable(): boolean {
    return this.getConfiguredProviders().length > 0;
  }

  // ==========================================
  // CONFIGURATION
  // ==========================================

  /** Get current config */
  getConfig(): EmbeddingProviderConfig {
    return { ...this.config };
  }

  /** Update config */
  setConfig(config: EmbeddingProviderConfig): void {
    this.config = { ...config };
  }

  /** Get target embedding dimension */
  getTargetDimension(): number {
    return this.config.targetDimension;
  }

  /** Get config version (for stale detection) */
  getConfigVersion(): number {
    return this.config.configVersion;
  }

  /** Get selected model for a provider, or its default */
  getModelForProvider(name: EmbeddingProviderName): string | undefined {
    return this.config.providerModels[name] || this.providers.get(name)?.getDefaultModel();
  }

  // ==========================================
  // DIMENSION NORMALIZATION
  // ==========================================

  /**
   * Normalize an embedding vector to the target dimension.
   *
   * - If native === target: passthrough
   * - If native < target: pad by concatenating reversed copy (preserves semantic distance)
   * - If native > target: truncate to first N dims (valid for Matryoshka embeddings)
   */
  normalizeEmbedding(embedding: number[], nativeDim?: number): number[] {
    const target = this.config.targetDimension;
    const actual = nativeDim ?? embedding.length;

    if (actual === target) {
      return embedding;
    }

    if (actual < target) {
      return this.padEmbedding(embedding, target);
    }

    // actual > target: truncate
    return embedding.slice(0, target);
  }

  /**
   * Pad embedding to target dimension by concatenating reversed copies.
   * Same approach as the original padTo1536() but generalized.
   */
  private padEmbedding(embedding: number[], target: number): number[] {
    if (embedding.length >= target) return embedding.slice(0, target);

    const result = [...embedding];
    const reversed = [...embedding].reverse();

    // Keep appending reversed copies until we reach target
    let idx = 0;
    while (result.length < target) {
      result.push(reversed[idx % reversed.length]);
      idx++;
    }

    return result.slice(0, target);
  }

  // ==========================================
  // COSINE SIMILARITY
  // ==========================================

  /**
   * Compute cosine similarity between two embedding vectors.
   * Handles dimension mismatches by using the shorter length.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;

    const len = Math.min(a.length, b.length);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < len; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  // ==========================================
  // DEFAULTS
  // ==========================================

  static getDefaultConfig(): EmbeddingProviderConfig {
    // Build provider order from available env vars
    const order: EmbeddingProviderName[] = [];
    if (process.env.OPENAI_API_KEY) order.push('openai');
    if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) order.push('gemini');
    if (process.env.TOGETHER_API_KEY) order.push('together');
    if (process.env.COHERE_API_KEY) order.push('cohere');
    if (process.env.HUGGINGFACE_API_KEY) order.push('huggingface');
    if (process.env.OLLAMA_BASE_URL) order.push('ollama');

    // Default: at least list the known providers
    if (order.length === 0) {
      order.push('openai', 'gemini');
    }

    return {
      targetDimension: DEFAULT_TARGET_DIMENSION,
      providerOrder: order,
      providerModels: {},
      configVersion: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
    };
  }
}
