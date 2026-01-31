/**
 * Embedding Service
 * Generates vector embeddings for semantic search using OpenAI or Gemini
 *
 * Usage:
 *   const { embedding } = await embeddingService.embedText('user question');
 *   // Store embedding in project_questions.embedding vector(1536) column
 */

import { z } from 'zod';

// Validate embedding dimensions
const EmbeddingVector = z.array(z.number()).length(1536);

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  tokensUsed: number;
}

export interface EmbeddingOptions {
  model?: 'openai' | 'gemini';
  truncateLength?: number;
  taskType?: string;
}

type ProviderName = 'openai' | 'gemini';

interface EmbeddingProvider {
  name: ProviderName;
  single: (text: string) => Promise<EmbeddingResult>;
  batch: (texts: string[], truncateLength: number) => Promise<EmbeddingResult[]>;
}

class EmbeddingService {
  private openaiModel = 'text-embedding-ada-002';
  private geminiModel = 'text-embedding-004';
  private dimension = 1536;
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
      throw new Error('No embedding provider configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.');
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
      throw new Error('No embedding provider configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.');
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
    return !!(process.env.OPENAI_API_KEY || process.env.GOOGLE_AI_API_KEY);
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    return this.dimension;
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getProviders(preferred?: ProviderName): EmbeddingProvider[] {
    const providers: EmbeddingProvider[] = [];

    const addProvider = (name: ProviderName, single: EmbeddingProvider['single'], batch: EmbeddingProvider['batch']) => {
      providers.push({ name, single, batch });
    };

    const openaiAvailable = !!process.env.OPENAI_API_KEY;
    const geminiAvailable = !!(process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY);

    const order: ProviderName[] = preferred
      ? [preferred, preferred === 'openai' ? 'gemini' : 'openai']
      : this.getDefaultProviderOrder(openaiAvailable, geminiAvailable);

    for (const name of order) {
      if (name === 'openai' && openaiAvailable) {
        addProvider('openai', (text) => this.embedWithOpenAI(text), (texts, truncate) => this.batchEmbedWithOpenAI(texts, truncate));
      } else if (name === 'gemini' && geminiAvailable) {
        addProvider('gemini', (text) => this.embedWithGemini(text), (texts, truncate) => this.batchEmbedWithGemini(texts, truncate));
      }
    }

    return providers;
  }

  private getDefaultProviderOrder(openaiAvailable: boolean, geminiAvailable: boolean): ProviderName[] {
    const order: ProviderName[] = [];
    if (openaiAvailable) order.push('openai');
    if (geminiAvailable) order.push('gemini');
    if (order.length === 0) {
      throw new Error('No embedding API key configured. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY');
    }
    return order;
  }

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
      EmbeddingVector.parse(embedding);

      return {
        text,
        embedding,
        model: this.openaiModel,
        tokensUsed: data.usage?.total_tokens ?? 0
      };
    } catch (error: any) {
      console.error('OpenAI embedding failed:', error.message);
      throw error;
    }
  }

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
          taskType: 'RETRIEVAL_DOCUMENT'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${error}`);
      }

      const data = await response.json();
      let embedding = data.embedding?.values;

      if (!embedding) {
        throw new Error('No embedding returned from Gemini');
      }

      // Gemini returns 768 dimensions, pad to 1536 for compatibility
      if (embedding.length === 768) {
        embedding = this.padTo1536(embedding);
      }

      return {
        text,
        embedding,
        model: this.geminiModel,
        tokensUsed: text.length / 4 // Approximate
      };
    } catch (error: any) {
      console.error('Gemini embedding failed:', error.message);
      throw error;
    }
  }

  private async batchEmbedWithOpenAI(texts: string[], truncateLength: number): Promise<EmbeddingResult[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // OpenAI allows up to 2048 texts per batch
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
          tokensUsed: tokensPerText
        });
      }
    }

    return results;
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

  /**
   * Pad 768-dim Gemini embedding to 1536-dim for pgvector compatibility
   * Uses simple concatenation with reversed values (maintains semantic distance)
   */
  private padTo1536(embedding: number[]): number[] {
    if (embedding.length === 1536) return embedding;
    if (embedding.length !== 768) {
      throw new Error(`Unexpected embedding dimension: ${embedding.length}`);
    }

    // Concatenate with reversed version to maintain semantic properties
    return [...embedding, ...embedding.slice().reverse()];
  }
}

// Singleton instance
export const embeddingService = new EmbeddingService();

// Log available providers on startup for diagnostics
{
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) providers.push('openai');
  if (process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY) providers.push('gemini');
  if (providers.length > 0) {
    console.log(`🔗 [Embedding] Available providers: ${providers.join(', ')}`);
  } else {
    console.warn(`⚠️ [Embedding] No embedding providers configured - semantic matching will use hash fallback only. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY.`);
  }
}
