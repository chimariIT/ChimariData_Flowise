/**
 * Embedding Provider Types
 *
 * Shared interfaces for the extensible embedding provider registry.
 * All providers implement IEmbeddingProvider; the registry handles
 * dimension normalization and fallback chains.
 */

// ==========================================
// PROVIDER NAMES
// ==========================================

export type EmbeddingProviderName =
  | 'openai'
  | 'gemini'
  | 'ollama'
  | 'together'
  | 'huggingface'
  | 'cohere';

// ==========================================
// MODEL INFO
// ==========================================

export interface ProviderModelInfo {
  /** Model identifier (e.g., 'text-embedding-3-small') */
  id: string;
  /** Human-readable name */
  name: string;
  /** Native embedding dimensions (e.g., 1536, 768, 1024) */
  nativeDimensions: number;
  /** Maximum input tokens or characters */
  maxInput: number;
  /** Whether the model supports native batch embedding */
  supportsBatch: boolean;
  /** Approximate cost per 1k tokens (USD) */
  costPer1kTokens?: number;
  /** Whether model supports Matryoshka (truncatable) embeddings */
  supportsMatryoshka?: boolean;
}

// ==========================================
// EMBEDDING RESULT
// ==========================================

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokensUsed: number;
  /** Which provider generated this embedding */
  provider?: EmbeddingProviderName;
  /** Dimensions of the returned embedding (after normalization) */
  dimensions?: number;
  /** Native dimensions before normalization */
  rawDimensions?: number;
}

// ==========================================
// PROVIDER INTERFACE
// ==========================================

export interface IEmbeddingProvider {
  /** Unique provider identifier */
  readonly name: EmbeddingProviderName;

  /** Check if the provider has required configuration (API keys, server URL) */
  isConfigured(): boolean;

  /** Test provider connectivity and return latency */
  testConnection(): Promise<{
    ok: boolean;
    error?: string;
    latencyMs: number;
    model?: string;
  }>;

  /** Get list of available models for this provider */
  getAvailableModels(): ProviderModelInfo[];

  /** Get the default model ID */
  getDefaultModel(): string;

  /** Generate embedding for a single text (returns raw native-dimension embedding) */
  embedSingle(text: string, model?: string): Promise<EmbeddingResult>;

  /** Generate embeddings for multiple texts (returns raw native-dimension embeddings) */
  embedBatch(texts: string[], model?: string): Promise<EmbeddingResult[]>;
}

// ==========================================
// CONFIGURATION
// ==========================================

export interface EmbeddingProviderConfig {
  /** Target embedding dimension — all embeddings normalized to this */
  targetDimension: number;
  /** Ordered list of providers for fallback chain */
  providerOrder: EmbeddingProviderName[];
  /** Selected model per provider */
  providerModels: Partial<Record<EmbeddingProviderName, string>>;
  /** Incremented when dimension changes — used for stale detection */
  configVersion: number;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** User ID of who last updated */
  updatedBy: string;
}

// ==========================================
// EMBEDDING OPTIONS (backward compat)
// ==========================================

export interface EmbeddingOptions {
  /** Preferred provider (falls back to next in chain if unavailable) */
  model?: EmbeddingProviderName;
  /** Max text length before truncation */
  truncateLength?: number;
  /** Task type hint (used by Gemini, Cohere) */
  taskType?: string;
}
