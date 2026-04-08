/**
 * Embedding Providers — Barrel Export
 *
 * Re-exports all provider implementations and the registry.
 */

// Core
export { EmbeddingProviderRegistry } from './registry';
export { BaseEmbeddingProvider } from './base-provider';

// Types
export type {
  EmbeddingProviderName,
  EmbeddingProviderConfig,
  EmbeddingResult,
  EmbeddingOptions,
  IEmbeddingProvider,
  ProviderModelInfo,
} from './types';

// Providers
export { OpenAIEmbeddingProvider } from './openai-provider';
export { OpenRouterEmbeddingProvider } from './openrouter-provider';
export { GeminiEmbeddingProvider } from './gemini-provider';
export { OllamaEmbeddingProvider } from './ollama-provider';
export { TogetherEmbeddingProvider } from './together-provider';
export { HuggingFaceEmbeddingProvider } from './huggingface-provider';
export { CohereEmbeddingProvider } from './cohere-provider';
