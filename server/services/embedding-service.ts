/**
 * Embedding Service
 * Generates vector embeddings for semantic search using OpenAI, Gemini, or Together AI
 *
 * Provider priority: OpenAI (primary) → Together AI → Gemini (fallback)
 * All providers store native dimensions with metadata for cross-provider compatibility.
 *
 * Usage:
 *   const { embedding } = await embeddingService.embedText('user question');
 *   // Store embedding in project_questions.embedding vector(1536) column
 */

import { z } from 'zod';

// Validate embedding dimensions (flexible - supports 768, 1024, or 1536)
const EmbeddingVector1536 = z.array(z.number()).length(1536);
const EmbeddingVector1024 = z.array(z.number()).length(1024);
const EmbeddingVector768 = z.array(z.number()).length(768);

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokensUsed: number;
  provider: EmbeddingProviderName;
  dimensions: number;
}

export interface EmbeddingOptions {
  model?: EmbeddingProviderName;
  truncateLength?: number;
  taskType?: string;
}

export type EmbeddingProviderName = 'openai' | 'gemini' | 'together';

interface EmbeddingProvider {
  name: EmbeddingProviderName;
  nativeDimensions: number;
  single: (text: string) => Promise<EmbeddingResult>;
  batch: (texts: string[], truncateLength: number) => Promise<EmbeddingResult[]>;
}

class EmbeddingService {
  // Standardized on text-embedding-3-small (replaces legacy text-embedding-ada-002)
  private openaiModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
  // ✅ FIX 11A: text-embedding-004 deprecated → gemini-embedding-001 (env-configurable)
  private geminiModel = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
  private togetherModel = 'BAAI/bge-large-en-v1.5';
  private defaultDimension = 1536;
  private defaultTruncate = 30000;

  /**
   * Generate embedding for a single text
   */
  async embedText(text: string, options: EmbeddingOptions = {}): Promise<EmbeddingResult> {
    if (!text || text.trim().length === 0) {
      throw new Error('Text cannot be empty');
    }

    const truncateLength = options.truncateLength ?? this.defaultTruncate;
    const truncatedText = text.slice(0, truncateLength);
    const providers = this.getProviders(options.model);
    if (providers.length === 0) {
      throw new Error('No embedding provider configured. Set OPENAI_API_KEY, TOGETHER_API_KEY, or GOOGLE_AI_API_KEY.');
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        return await provider.single(truncatedText);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Embedding provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate embedding');
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const truncateLength = options.truncateLength ?? this.defaultTruncate;
    const providers = this.getProviders(options.model);
    if (providers.length === 0) {
      throw new Error('No embedding provider configured. Set OPENAI_API_KEY, TOGETHER_API_KEY, or GOOGLE_AI_API_KEY.');
    }

    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        return await provider.batch(texts, truncateLength);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`Batch embedding provider ${provider.name} failed: ${lastError.message}`);
      }
    }

    throw lastError ?? new Error('Unable to generate batch embeddings');
  }

  /**
   * Check if embedding service is available
   */
  isAvailable(): boolean {
    return !!(process.env.OPENAI_API_KEY || process.env.TOGETHER_API_KEY || process.env.GOOGLE_AI_API_KEY);
  }

  /**
   * Get default embedding dimension
   */
  getDimension(): number {
    return this.defaultDimension;
  }

  /**
   * Get dimensions for a specific provider
   */
  getProviderDimensions(provider: EmbeddingProviderName): number {
    switch (provider) {
      case 'openai': return 1536;
      case 'together': return 1024;
      case 'gemini': return 768;
      default: return this.defaultDimension;
    }
  }

  /**
   * Compute cosine similarity between two embeddings, handling dimension mismatches.
   * If dimensions differ, truncates the longer one to match the shorter.
   * This allows cross-provider comparison at the cost of slight accuracy loss.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length === 0 || b.length === 0) return 0;

    // If dimensions match, compute directly
    if (a.length === b.length) {
      return this.rawCosineSimilarity(a, b);
    }

    // Dimension mismatch — truncate longer to shorter
    const minLen = Math.min(a.length, b.length);
    const truncA = a.slice(0, minLen);
    const truncB = b.slice(0, minLen);
    return this.rawCosineSimilarity(truncA, truncB);
  }

  private rawCosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getProviders(preferred?: EmbeddingProviderName): EmbeddingProvider[] {
    const providers: EmbeddingProvider[] = [];

    const openaiAvailable = !!process.env.OPENAI_API_KEY;
    const togetherAvailable = !!process.env.TOGETHER_API_KEY;
    const geminiAvailable = !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);

    const order: EmbeddingProviderName[] = preferred
      ? [preferred, ...this.getDefaultProviderOrder(openaiAvailable, togetherAvailable, geminiAvailable).filter(p => p !== preferred)]
      : this.getDefaultProviderOrder(openaiAvailable, togetherAvailable, geminiAvailable);

    for (const name of order) {
      if (name === 'openai' && openaiAvailable) {
        providers.push({
          name: 'openai',
          nativeDimensions: 1536,
          single: (text) => this.embedWithOpenAI(text),
          batch: (texts, truncate) => this.batchEmbedWithOpenAI(texts, truncate)
        });
      } else if (name === 'together' && togetherAvailable) {
        providers.push({
          name: 'together',
          nativeDimensions: 1024,
          single: (text) => this.embedWithTogether(text),
          batch: (texts, truncate) => this.batchEmbedWithTogether(texts, truncate)
        });
      } else if (name === 'gemini' && geminiAvailable) {
        providers.push({
          name: 'gemini',
          nativeDimensions: 768,
          single: (text) => this.embedWithGemini(text),
          batch: (texts, truncate) => this.batchEmbedWithGemini(texts, truncate)
        });
      }
    }

    return providers;
  }

  private getDefaultProviderOrder(
    openaiAvailable: boolean,
    togetherAvailable: boolean,
    geminiAvailable: boolean
  ): EmbeddingProviderName[] {
    const order: EmbeddingProviderName[] = [];
    // Priority: OpenAI (best quality 1536d) → Together AI (Llama/BGE 1024d) → Gemini (768d)
    if (openaiAvailable) order.push('openai');
    if (togetherAvailable) order.push('together');
    if (geminiAvailable) order.push('gemini');
    if (order.length === 0) {
      throw new Error('No embedding API key configured. Set OPENAI_API_KEY, TOGETHER_API_KEY, or GOOGLE_AI_API_KEY');
    }
    return order;
  }

  // ============================================
  // OpenAI: text-embedding-3-small (1536 dimensions)
  // ============================================

  private async embedWithOpenAI(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.openaiModel,
          input: text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;

      // Validate embedding dimension
      EmbeddingVector1536.parse(embedding);

      return {
        text,
        embedding,
        model: this.openaiModel,
        tokensUsed: data.usage?.total_tokens ?? 0,
        provider: 'openai',
        dimensions: 1536
      };
    } catch (error: any) {
      console.error('OpenAI embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithOpenAI(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const batchSize = 100;
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const truncatedBatch = batch.map(t => t.slice(0, truncateLength));

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.openaiModel,
          input: truncatedBatch
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const tokensPerText = Math.ceil((data.usage?.total_tokens ?? 0) / truncatedBatch.length);

      for (let j = 0; j < data.data.length; j++) {
        results.push({
          text: truncatedBatch[j],
          embedding: data.data[j].embedding,
          model: this.openaiModel,
          tokensUsed: tokensPerText,
          provider: 'openai',
          dimensions: 1536
        });
      }
    }

    return results;
  }

  // ============================================
  // Gemini: text-embedding-004 (768 dimensions, stored natively)
  // ============================================

  private async embedWithGemini(text: string): Promise<EmbeddingResult> {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '').trim();
    if (!apiKey) {
      throw new Error('Set GEMINI_API_KEY or GOOGLE_AI_API_KEY to use Gemini embeddings');
    }

    try {
      const keyParam = encodeURIComponent(apiKey);
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:embedContent?key=${keyParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: `models/${this.geminiModel}`,
          content: {
            parts: [{ text }]
          },
          taskType: 'RETRIEVAL_DOCUMENT',
          // ✅ FIX 11B: gemini-embedding-001 defaults to 3072d; request 768d for compatibility
          outputDimensionality: 768
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const embedding = data.embedding?.values;

      if (!embedding) {
        throw new Error('No embedding returned from Gemini');
      }

      // Store at native 768 dimensions — NO MORE lossy padding to 1536
      // Cross-provider comparison uses truncation-based cosine similarity
      EmbeddingVector768.parse(embedding);

      return {
        text,
        embedding,
        model: this.geminiModel,
        tokensUsed: Math.ceil(text.length / 4), // Approximate
        provider: 'gemini',
        dimensions: 768
      };
    } catch (error: any) {
      console.error('Gemini embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithGemini(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    // Gemini doesn't have native batch embedding, process sequentially
    const results: EmbeddingResult[] = [];

    for (const text of texts) {
      const truncated = text.slice(0, truncateLength);
      const result = await this.embedWithGemini(truncated);
      results.push(result);

      // Rate limit: 60 requests/minute for Gemini free tier
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  // ============================================
  // Together AI: BAAI/bge-large-en-v1.5 (1024 dimensions)
  // Uses OpenAI-compatible API
  // ============================================

  private async embedWithTogether(text: string): Promise<EmbeddingResult> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not configured');
    }

    try {
      const response = await fetch('https://api.together.xyz/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.togetherModel,
          input: text
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Together AI API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;

      EmbeddingVector1024.parse(embedding);

      return {
        text,
        embedding,
        model: this.togetherModel,
        tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4),
        provider: 'together',
        dimensions: 1024
      };
    } catch (error: any) {
      console.error('Together AI embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithTogether(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    const apiKey = process.env.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error('TOGETHER_API_KEY not configured');
    }

    const batchSize = 50; // Together AI batch limit
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const truncatedBatch = batch.map(t => t.slice(0, truncateLength));

      const response = await fetch('https://api.together.xyz/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.togetherModel,
          input: truncatedBatch
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Together AI batch API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      const tokensPerText = Math.ceil((data.usage?.total_tokens ?? 0) / truncatedBatch.length);

      for (let j = 0; j < data.data.length; j++) {
        results.push({
          text: truncatedBatch[j],
          embedding: data.data[j].embedding,
          model: this.togetherModel,
          tokensUsed: tokensPerText,
          provider: 'together',
          dimensions: 1024
        });
      }
    }

    return results;
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();

// Log available providers on startup for diagnostics
{
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) providers.push('openai (text-embedding-3-small, 1536d)');
  if (process.env.TOGETHER_API_KEY) providers.push('together (bge-large-en-v1.5, 1024d)');
  if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) providers.push('gemini (text-embedding-004, 768d)');
  if (providers.length > 0) {
    console.log(`🔗 [Embedding] Available providers: ${providers.join(', ')}`);
  } else {
    console.warn(`⚠️ [Embedding] No embedding providers configured - semantic matching will use hash fallback only. Set OPENAI_API_KEY, TOGETHER_API_KEY, or GOOGLE_AI_API_KEY.`);
  }
}
