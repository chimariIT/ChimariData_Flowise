// server/services/column-embedding-generator.ts
/**
 * Column Embedding Generator Service
 *
 * Generates vector embeddings for dataset columns ASYNCHRONOUSLY after:
 * 1. Data upload completes
 * 2. Multi-dataset join completes
 * 3. PII decisions are processed
 *
 * These pre-computed embeddings enable fast RAG-based column matching,
 * significantly reducing latency during transformation execution.
 *
 * Key Design Decisions:
 * - Single trigger point: After execute-transformations (post-join, post-PII)
 * - Embeddings generated for usable columns only (excludes PII)
 * - Rich context includes column name, type, and sample values
 * - Non-blocking: Uses setImmediate for async generation
 */

import { db } from '../db';
import { columnEmbeddings } from '../../shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { embeddingService } from './embedding-service';
import { storage } from '../storage';

interface ColumnInput {
  name: string;
  type: string;
  sampleValues?: any[];
}

interface ColumnEmbeddingInput {
  datasetId: string;
  projectId: string;
  columns: ColumnInput[];
}

interface SimilarColumnResult {
  columnName: string;
  similarity: number;
  datasetId: string;
  columnType?: string | null;
}

export class ColumnEmbeddingGenerator {
  private readonly MODEL = 'text-embedding-3-small';
  private readonly BATCH_SIZE = 10;

  // Use task-specific preset for column matching
  // This uses 512 dimensions and 500 char truncation for efficiency
  private readonly TASK_TYPE = 'column_matching' as const;

  /**
   * Generate embeddings for all columns in a dataset
   * Called ASYNC after upload/join/PII processing
   */
  async generateEmbeddingsForDataset(input: ColumnEmbeddingInput): Promise<void> {
    const { datasetId, projectId, columns } = input;
    console.log(`🔢 [Embedding] Starting async embedding generation for ${columns.length} columns`);

    try {
      // Clear existing embeddings for this dataset
      await db.delete(columnEmbeddings)
        .where(eq(columnEmbeddings.datasetId, datasetId));

      // Process in batches to avoid overwhelming the API
      for (let i = 0; i < columns.length; i += this.BATCH_SIZE) {
        const batch = columns.slice(i, i + this.BATCH_SIZE);

        await Promise.all(batch.map(async (col) => {
          try {
            // Build rich context for better embedding quality
            const context = this.buildColumnContext(col);

            // Generate embedding using the embedding service
            // Uses task-specific preset for column matching (512 dims, 500 char truncation)
            const embeddingResult = await embeddingService.embedText(context, {
              taskType: this.TASK_TYPE
            });

            if (!embeddingResult.embedding || embeddingResult.embedding.length === 0) {
              console.error(`  ❌ [Embedding] Failed for ${col.name}: No embedding generated`);
              return;
            }

            await db.insert(columnEmbeddings).values({
              datasetId,
              projectId,
              columnName: col.name,
              normalizedName: this.normalize(col.name),
              embedding: JSON.stringify(embeddingResult.embedding),
              embeddingModel: this.MODEL,
              columnType: col.type,
              sampleValues: col.sampleValues?.slice(0, 5),
              metadata: { context, model: embeddingResult.model }
            });

            console.log(`  ✅ [Embedding] ${col.name}`);
          } catch (error) {
            console.error(`  ❌ [Embedding] Failed for ${col.name}:`, error);
          }
        }));
      }

      // Update dataset metadata to mark embeddings complete
      try {
        const dataset = await storage.getDataset(datasetId);
        if (dataset) {
          const currentMetadata = (dataset as any).metadata || {};
          await storage.updateDataset(datasetId, {
            metadata: {
              ...currentMetadata,
              embeddingsGenerated: true,
              embeddingsGeneratedAt: new Date().toISOString(),
              embeddingCount: columns.length
            }
          } as any);
        }
      } catch (updateError) {
        console.warn(`⚠️ [Embedding] Could not update dataset metadata:`, updateError);
      }

      console.log(`✅ [Embedding] Completed for dataset ${datasetId} (${columns.length} columns)`);
    } catch (error) {
      console.error(`❌ [Embedding] Failed for dataset ${datasetId}:`, error);
      throw error;
    }
  }

  /**
   * Build rich context string for better embedding quality
   * Includes column name, type, sample values, and semantic hints
   */
  private buildColumnContext(col: ColumnInput): string {
    const parts: string[] = [
      `Column: ${col.name}`,
      `Type: ${col.type}`,
    ];

    // Add sample values for additional context
    if (col.sampleValues?.length) {
      const uniqueSamples = [...new Set(col.sampleValues.slice(0, 3).map(String))];
      if (uniqueSamples.length > 0) {
        parts.push(`Examples: ${uniqueSamples.join(', ')}`);
      }
    }

    // Add semantic hints based on name patterns
    const nameLower = col.name.toLowerCase();
    const semanticHints: string[] = [];

    if (/score|rating|grade|level/i.test(nameLower)) {
      semanticHints.push('Category: Score/Rating metric');
    }
    if (/date|time|timestamp|created|updated|at$/i.test(nameLower)) {
      semanticHints.push('Category: Temporal/Date');
    }
    if (/id|key|code|identifier|uuid/i.test(nameLower)) {
      semanticHints.push('Category: Identifier/Key');
    }
    if (/name|title|label|description|text/i.test(nameLower)) {
      semanticHints.push('Category: Label/Name');
    }
    if (/amount|price|cost|salary|pay|revenue|income|budget/i.test(nameLower)) {
      semanticHints.push('Category: Monetary/Financial');
    }
    if (/q\d+|question|survey|response/i.test(nameLower)) {
      semanticHints.push('Category: Survey/Question');
    }
    if (/percent|ratio|rate|proportion/i.test(nameLower)) {
      semanticHints.push('Category: Percentage/Ratio');
    }
    if (/count|total|number|quantity|num/i.test(nameLower)) {
      semanticHints.push('Category: Count/Quantity');
    }
    if (/email|phone|address|city|state|zip|country/i.test(nameLower)) {
      semanticHints.push('Category: Contact/Location');
    }
    if (/department|division|team|group|org/i.test(nameLower)) {
      semanticHints.push('Category: Organization');
    }
    if (/employee|staff|worker|manager|supervisor/i.test(nameLower)) {
      semanticHints.push('Category: Personnel/HR');
    }
    if (/customer|client|user|member/i.test(nameLower)) {
      semanticHints.push('Category: Customer/User');
    }
    if (/product|item|sku|inventory/i.test(nameLower)) {
      semanticHints.push('Category: Product/Inventory');
    }
    if (/status|state|flag|is_|has_/i.test(nameLower)) {
      semanticHints.push('Category: Status/Boolean');
    }

    if (semanticHints.length > 0) {
      parts.push(semanticHints.join('. '));
    }

    return parts.join('. ');
  }

  /**
   * Normalize a string for quick lookup
   */
  private normalize(s: string): string {
    return s.toLowerCase()
      .replace(/[_\-\s]+/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Find similar columns using RAG approach
   * Searches pre-computed embeddings for semantic matches
   */
  async findSimilarColumns(
    projectId: string,
    queryText: string,
    topK: number = 5
  ): Promise<SimilarColumnResult[]> {
    try {
      // Generate query embedding with same settings as stored embeddings
      const queryResult = await embeddingService.embedText(queryText, {
        taskType: this.TASK_TYPE
      });

      if (!queryResult.embedding || queryResult.embedding.length === 0) {
        console.warn('⚠️ [RAG] Could not generate query embedding');
        return [];
      }

      const queryEmbedding = queryResult.embedding;

      // Get all embeddings for this project
      const embeddings = await db.select()
        .from(columnEmbeddings)
        .where(eq(columnEmbeddings.projectId, projectId));

      if (embeddings.length === 0) {
        console.log(`ℹ️ [RAG] No pre-computed embeddings found for project ${projectId}`);
        return [];
      }

      // Calculate cosine similarity for each column
      const results: SimilarColumnResult[] = embeddings.map((row: { embedding: string; columnName: string; datasetId: string; columnType: string | null }) => {
        try {
          const storedEmbedding = JSON.parse(row.embedding);
          const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);
          return {
            columnName: row.columnName,
            similarity,
            datasetId: row.datasetId,
            columnType: row.columnType
          };
        } catch (e) {
          return {
            columnName: row.columnName,
            similarity: 0,
            datasetId: row.datasetId,
            columnType: row.columnType
          };
        }
      });

      // Sort by similarity and return top K
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
    } catch (error) {
      console.error('❌ [RAG] findSimilarColumns failed:', error);
      return [];
    }
  }

  /**
   * Check if embeddings exist for a project
   */
  async hasEmbeddings(projectId: string): Promise<boolean> {
    try {
      const result = await db.select({ count: sql`count(*)::int` })
        .from(columnEmbeddings)
        .where(eq(columnEmbeddings.projectId, projectId));

      return (result[0]?.count || 0) > 0;
    } catch (error) {
      console.error('❌ [RAG] hasEmbeddings check failed:', error);
      return false;
    }
  }

  /**
   * Get embedding count for a project
   */
  async getEmbeddingCount(projectId: string): Promise<number> {
    try {
      const result = await db.select({ count: sql`count(*)::int` })
        .from(columnEmbeddings)
        .where(eq(columnEmbeddings.projectId, projectId));

      return result[0]?.count || 0;
    } catch (error) {
      console.error('❌ [RAG] getEmbeddingCount failed:', error);
      return 0;
    }
  }

  /**
   * Get embedding status for all datasets in a project
   */
  async getEmbeddingStatus(projectId: string): Promise<{
    datasets: Array<{
      datasetId: string;
      embeddingCount: number;
    }>;
    totalEmbeddings: number;
  }> {
    try {
      const results = await db.select({
        datasetId: columnEmbeddings.datasetId,
        count: sql`count(*)::int`
      })
        .from(columnEmbeddings)
        .where(eq(columnEmbeddings.projectId, projectId))
        .groupBy(columnEmbeddings.datasetId);

      const datasets = results.map((r: { datasetId: string; count: unknown }) => ({
        datasetId: r.datasetId,
        embeddingCount: r.count as number
      }));

      const totalEmbeddings = datasets.reduce((sum: number, d: { embeddingCount: number }) => sum + d.embeddingCount, 0);

      return { datasets, totalEmbeddings };
    } catch (error) {
      console.error('❌ [RAG] getEmbeddingStatus failed:', error);
      return { datasets: [], totalEmbeddings: 0 };
    }
  }

  /**
   * Clear all embeddings for a dataset
   */
  async clearDatasetEmbeddings(datasetId: string): Promise<void> {
    try {
      await db.delete(columnEmbeddings)
        .where(eq(columnEmbeddings.datasetId, datasetId));
      console.log(`🗑️ [Embedding] Cleared embeddings for dataset ${datasetId}`);
    } catch (error) {
      console.error('❌ [RAG] clearDatasetEmbeddings failed:', error);
    }
  }

  /**
   * Clear all embeddings for a project
   */
  async clearProjectEmbeddings(projectId: string): Promise<void> {
    try {
      await db.delete(columnEmbeddings)
        .where(eq(columnEmbeddings.projectId, projectId));
      console.log(`🗑️ [Embedding] Cleared all embeddings for project ${projectId}`);
    } catch (error) {
      console.error('❌ [RAG] clearProjectEmbeddings failed:', error);
    }
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) {
      return 0;
    }

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

// Export singleton instance
export const columnEmbeddingGenerator = new ColumnEmbeddingGenerator();
