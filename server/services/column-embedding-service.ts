/**
 * Column Embedding Service
 *
 * Transforms non-numeric columns into numerical features for ML pipelines:
 * - Text columns → semantic embeddings (via embedding-service.ts)
 * - Categorical (high cardinality) → embeddings or target encoding
 * - Categorical (low cardinality) → one-hot encoding
 * - Date/Time → temporal features (year, month, day, etc.)
 *
 * This ensures ALL data can be used in ML models, not just numeric columns.
 */

import { embeddingService } from './embedding-service';
import * as crypto from 'crypto';

// ============================================
// TYPES
// ============================================

export interface ColumnAnalysis {
  column: string;
  originalType: 'numeric' | 'categorical' | 'text' | 'date' | 'boolean' | 'mixed' | 'unknown';
  cardinality: number;
  uniqueValues: (string | number | null)[];
  missingCount: number;
  missingPercent: number;
  sampleValues: any[];
  recommendedEncoding: EncodingStrategy;
}

export type EncodingStrategy =
  | 'passthrough'      // Already numeric
  | 'one_hot'          // Low cardinality categorical (≤10 unique)
  | 'embedding'        // High cardinality categorical or text
  | 'target_encoding'  // Categorical when target is known
  | 'temporal_features'// Date/time columns
  | 'binary'           // Boolean columns
  | 'drop';            // Columns to exclude (too sparse, PII, etc.)

export interface EncodingConfig {
  column: string;
  strategy: EncodingStrategy;
  embeddingDimension?: number;  // For embeddings, default 1536
  reducedDimension?: number;    // PCA reduction target (e.g., 32)
  targetColumn?: string;        // For target encoding
  oneHotPrefix?: string;        // Prefix for one-hot columns
}

export interface TransformedColumn {
  originalColumn: string;
  strategy: EncodingStrategy;
  newColumns: string[];          // Column names after transformation
  values: number[][];            // Numeric values [row][feature]
  metadata: {
    embeddingModel?: string;
    categories?: string[];       // For one-hot: the category names
    temporalComponents?: string[];// For dates: ['year', 'month', etc.]
    pcaExplainedVariance?: number;
  };
}

export interface ColumnEmbeddingResult {
  originalRowCount: number;
  originalColumnCount: number;
  transformedColumnCount: number;
  columns: TransformedColumn[];
  numericData: Record<string, number[]>; // Final numeric data by column
  columnMapping: Record<string, string[]>; // original → new column names
  analysisReport: ColumnAnalysis[];
}

// ============================================
// COLUMN EMBEDDING SERVICE
// ============================================

class ColumnEmbeddingService {
  private embeddingCache: Map<string, number[]> = new Map();
  private maxCacheSize = 10000;

  /**
   * Analyze all columns in a dataset to determine optimal encoding strategy
   */
  analyzeColumns(rows: any[], schema?: Record<string, any>): ColumnAnalysis[] {
    if (!rows || rows.length === 0) return [];

    const columns = Object.keys(rows[0]);
    const analyses: ColumnAnalysis[] = [];

    for (const column of columns) {
      const values = rows.map(row => row[column]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
      const uniqueValues = [...new Set(nonNullValues)];

      const analysis: ColumnAnalysis = {
        column,
        originalType: this.detectColumnType(values, schema?.[column]),
        cardinality: uniqueValues.length,
        uniqueValues: uniqueValues.slice(0, 100), // Sample for display
        missingCount: rows.length - nonNullValues.length,
        missingPercent: ((rows.length - nonNullValues.length) / rows.length) * 100,
        sampleValues: nonNullValues.slice(0, 10),
        recommendedEncoding: 'passthrough'
      };

      // Determine recommended encoding strategy
      analysis.recommendedEncoding = this.determineEncodingStrategy(analysis, rows.length);

      analyses.push(analysis);
    }

    console.log(`📊 [ColumnEmbedding] Analyzed ${columns.length} columns:`);
    const strategyCounts = analyses.reduce((acc, a) => {
      acc[a.recommendedEncoding] = (acc[a.recommendedEncoding] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(`   Strategies: ${JSON.stringify(strategyCounts)}`);

    return analyses;
  }

  /**
   * Transform all columns to numeric values based on encoding configs
   */
  async transformColumns(
    rows: any[],
    configs: EncodingConfig[],
    targetColumn?: string
  ): Promise<ColumnEmbeddingResult> {
    const startTime = Date.now();
    console.log(`🔄 [ColumnEmbedding] Transforming ${configs.length} columns for ${rows.length} rows`);

    const transformedColumns: TransformedColumn[] = [];
    const numericData: Record<string, number[]> = {};
    const columnMapping: Record<string, string[]> = {};

    for (const config of configs) {
      const columnValues = rows.map(row => row[config.column]);

      let transformed: TransformedColumn;

      switch (config.strategy) {
        case 'passthrough':
          transformed = this.passthroughNumeric(config.column, columnValues);
          break;
        case 'one_hot':
          transformed = this.oneHotEncode(config.column, columnValues, config.oneHotPrefix);
          break;
        case 'embedding':
          transformed = await this.embedColumn(config.column, columnValues, config.reducedDimension);
          break;
        case 'target_encoding':
          transformed = this.targetEncode(config.column, columnValues, rows, targetColumn || config.targetColumn);
          break;
        case 'temporal_features':
          transformed = this.extractTemporalFeatures(config.column, columnValues);
          break;
        case 'binary':
          transformed = this.binaryEncode(config.column, columnValues);
          break;
        case 'drop':
        default:
          // Skip this column
          transformed = {
            originalColumn: config.column,
            strategy: 'drop',
            newColumns: [],
            values: [],
            metadata: {}
          };
          break;
      }

      transformedColumns.push(transformed);
      columnMapping[config.column] = transformed.newColumns;

      // Add to numeric data
      for (let i = 0; i < transformed.newColumns.length; i++) {
        const colName = transformed.newColumns[i];
        numericData[colName] = transformed.values.map(row => row[i] || 0);
      }
    }

    const result: ColumnEmbeddingResult = {
      originalRowCount: rows.length,
      originalColumnCount: configs.length,
      transformedColumnCount: Object.keys(numericData).length,
      columns: transformedColumns,
      numericData,
      columnMapping,
      analysisReport: this.analyzeColumns(rows)
    };

    const elapsed = Date.now() - startTime;
    console.log(`✅ [ColumnEmbedding] Transformation complete in ${elapsed}ms: ${result.originalColumnCount} → ${result.transformedColumnCount} columns`);

    return result;
  }

  /**
   * Auto-transform: analyze columns and apply recommended strategies
   */
  async autoTransform(
    rows: any[],
    options: {
      targetColumn?: string;
      excludeColumns?: string[];
      forceStrategies?: Record<string, EncodingStrategy>;
      maxOneHotCardinality?: number;
      reducedEmbeddingDimension?: number;
    } = {}
  ): Promise<ColumnEmbeddingResult> {
    const {
      targetColumn,
      excludeColumns = [],
      forceStrategies = {},
      maxOneHotCardinality = 10,
      reducedEmbeddingDimension = 32
    } = options;

    // Analyze columns
    const analyses = this.analyzeColumns(rows);

    // Build configs based on analysis
    const configs: EncodingConfig[] = analyses
      .filter(a => !excludeColumns.includes(a.column))
      .map(a => ({
        column: a.column,
        strategy: forceStrategies[a.column] || a.recommendedEncoding,
        targetColumn,
        reducedDimension: reducedEmbeddingDimension,
        oneHotPrefix: a.column
      }));

    return this.transformColumns(rows, configs, targetColumn);
  }

  // ============================================
  // ENCODING STRATEGIES
  // ============================================

  /**
   * Passthrough for already-numeric columns
   */
  private passthroughNumeric(column: string, values: any[]): TransformedColumn {
    const numericValues = values.map(v => {
      if (v === null || v === undefined || v === '') return 0;
      const num = parseFloat(v);
      return isNaN(num) ? 0 : num;
    });

    return {
      originalColumn: column,
      strategy: 'passthrough',
      newColumns: [column],
      values: numericValues.map(v => [v]),
      metadata: {}
    };
  }

  /**
   * One-hot encoding for low-cardinality categorical columns
   */
  private oneHotEncode(column: string, values: any[], prefix?: string): TransformedColumn {
    const categories = [...new Set(values.filter(v => v !== null && v !== undefined && v !== ''))];
    const colPrefix = prefix || column;
    const newColumns = categories.map(cat => `${colPrefix}_${String(cat).replace(/\s+/g, '_')}`);

    const encodedValues = values.map(value => {
      return categories.map(cat => value === cat ? 1 : 0);
    });

    return {
      originalColumn: column,
      strategy: 'one_hot',
      newColumns,
      values: encodedValues,
      metadata: { categories: categories.map(String) }
    };
  }

  /**
   * Embedding for text or high-cardinality categorical columns
   */
  private async embedColumn(
    column: string,
    values: any[],
    reducedDimension?: number
  ): Promise<TransformedColumn> {
    // Get unique values for embedding (avoid duplicates)
    const uniqueValues = [...new Set(values.map(v => String(v || '')))];
    const embeddingMap = new Map<string, number[]>();

    console.log(`🧠 [ColumnEmbedding] Embedding ${uniqueValues.length} unique values for column "${column}"`);

    // Check cache and embed missing values
    const toEmbed: string[] = [];
    for (const val of uniqueValues) {
      const cacheKey = this.getCacheKey(val);
      if (this.embeddingCache.has(cacheKey)) {
        embeddingMap.set(val, this.embeddingCache.get(cacheKey)!);
      } else if (val.trim().length > 0) {
        toEmbed.push(val);
      } else {
        // Empty string gets zero vector
        embeddingMap.set(val, new Array(1536).fill(0));
      }
    }

    // Batch embed missing values
    if (toEmbed.length > 0) {
      try {
        // Process in batches of 100 to avoid API limits
        const batchSize = 100;
        for (let i = 0; i < toEmbed.length; i += batchSize) {
          const batch = toEmbed.slice(i, i + batchSize);
          const results = await embeddingService.embedBatch(batch);

          for (let j = 0; j < results.length; j++) {
            const embedding = results[j].embedding;
            embeddingMap.set(batch[j], embedding);

            // Cache the result
            const cacheKey = this.getCacheKey(batch[j]);
            this.embeddingCache.set(cacheKey, embedding);

            // Manage cache size
            if (this.embeddingCache.size > this.maxCacheSize) {
              const firstKey = this.embeddingCache.keys().next().value;
              if (firstKey) this.embeddingCache.delete(firstKey);
            }
          }
        }
      } catch (error) {
        console.warn(`⚠️ [ColumnEmbedding] Embedding failed for "${column}", using hash fallback:`, error);
        // Fallback: use hash-based pseudo-embeddings
        for (const val of toEmbed) {
          embeddingMap.set(val, this.hashToVector(val, 1536));
        }
      }
    }

    // Apply embeddings to all rows
    let embeddings = values.map(v => embeddingMap.get(String(v || '')) || new Array(1536).fill(0));
    let finalDimension = 1536;
    let metadata: any = { embeddingModel: 'text-embedding' };

    // Apply PCA reduction if requested
    if (reducedDimension && reducedDimension < 1536) {
      const { reduced, explainedVariance } = this.applyPCA(embeddings, reducedDimension);
      embeddings = reduced;
      finalDimension = reducedDimension;
      metadata.pcaExplainedVariance = explainedVariance;
      console.log(`📉 [ColumnEmbedding] PCA reduced ${column}: 1536 → ${reducedDimension} dims (${(explainedVariance * 100).toFixed(1)}% variance)`);
    }

    // Generate column names for embedding dimensions
    const newColumns = Array.from({ length: finalDimension }, (_, i) => `${column}_emb_${i}`);

    return {
      originalColumn: column,
      strategy: 'embedding',
      newColumns,
      values: embeddings,
      metadata
    };
  }

  /**
   * Target encoding for categorical columns when target is known
   */
  private targetEncode(
    column: string,
    values: any[],
    rows: any[],
    targetColumn?: string
  ): TransformedColumn {
    if (!targetColumn) {
      // Fall back to frequency encoding
      return this.frequencyEncode(column, values);
    }

    const targetValues = rows.map(row => parseFloat(row[targetColumn]) || 0);
    const categoryMeans = new Map<string, { sum: number; count: number }>();

    // Calculate mean target value for each category
    for (let i = 0; i < values.length; i++) {
      const cat = String(values[i] || '');
      if (!categoryMeans.has(cat)) {
        categoryMeans.set(cat, { sum: 0, count: 0 });
      }
      const stats = categoryMeans.get(cat)!;
      stats.sum += targetValues[i];
      stats.count++;
    }

    const globalMean = targetValues.reduce((a, b) => a + b, 0) / targetValues.length;

    // Encode each value with smoothed target mean
    const smoothing = 10; // Smoothing factor to avoid overfitting
    const encodedValues = values.map(v => {
      const cat = String(v || '');
      const stats = categoryMeans.get(cat);
      if (!stats) return [globalMean];

      // Smoothed mean: (category_sum + smoothing * global_mean) / (category_count + smoothing)
      const smoothedMean = (stats.sum + smoothing * globalMean) / (stats.count + smoothing);
      return [smoothedMean];
    });

    return {
      originalColumn: column,
      strategy: 'target_encoding',
      newColumns: [`${column}_target_enc`],
      values: encodedValues,
      metadata: { categories: [...categoryMeans.keys()] }
    };
  }

  /**
   * Frequency encoding as fallback for target encoding
   */
  private frequencyEncode(column: string, values: any[]): TransformedColumn {
    const frequencies = new Map<string, number>();

    for (const v of values) {
      const key = String(v || '');
      frequencies.set(key, (frequencies.get(key) || 0) + 1);
    }

    const total = values.length;
    const encodedValues = values.map(v => {
      const freq = frequencies.get(String(v || '')) || 0;
      return [freq / total]; // Normalized frequency
    });

    return {
      originalColumn: column,
      strategy: 'target_encoding', // Same output type
      newColumns: [`${column}_freq`],
      values: encodedValues,
      metadata: {}
    };
  }

  /**
   * Extract temporal features from date columns
   */
  private extractTemporalFeatures(column: string, values: any[]): TransformedColumn {
    const components = ['year', 'month', 'day', 'dayOfWeek', 'quarter', 'weekOfYear'];
    const newColumns = components.map(c => `${column}_${c}`);

    const encodedValues = values.map(v => {
      try {
        const date = new Date(v);
        if (isNaN(date.getTime())) {
          return new Array(components.length).fill(0);
        }

        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayOfWeek = date.getDay();
        const quarter = Math.ceil(month / 3);
        const weekOfYear = this.getWeekOfYear(date);

        return [year, month, day, dayOfWeek, quarter, weekOfYear];
      } catch {
        return new Array(components.length).fill(0);
      }
    });

    return {
      originalColumn: column,
      strategy: 'temporal_features',
      newColumns,
      values: encodedValues,
      metadata: { temporalComponents: components }
    };
  }

  /**
   * Binary encoding for boolean columns
   */
  private binaryEncode(column: string, values: any[]): TransformedColumn {
    const encodedValues = values.map(v => {
      if (v === true || v === 'true' || v === '1' || v === 1 || v === 'yes' || v === 'Yes' || v === 'Y') {
        return [1];
      }
      return [0];
    });

    return {
      originalColumn: column,
      strategy: 'binary',
      newColumns: [column],
      values: encodedValues,
      metadata: {}
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private detectColumnType(values: any[], schemaType?: any): ColumnAnalysis['originalType'] {
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    if (nonNull.length === 0) return 'unknown';

    // Check schema type hint first
    if (schemaType?.type) {
      const t = schemaType.type.toLowerCase();
      if (['number', 'integer', 'float', 'double'].includes(t)) return 'numeric';
      if (['date', 'datetime', 'timestamp'].includes(t)) return 'date';
      if (['boolean', 'bool'].includes(t)) return 'boolean';
    }

    // Sample-based detection
    const sample = nonNull.slice(0, 100);

    // Check if numeric
    const numericCount = sample.filter(v => !isNaN(parseFloat(v))).length;
    if (numericCount / sample.length > 0.9) return 'numeric';

    // Check if date
    const dateCount = sample.filter(v => {
      const d = new Date(v);
      return !isNaN(d.getTime()) && String(v).length > 6;
    }).length;
    if (dateCount / sample.length > 0.8) return 'date';

    // Check if boolean
    const boolValues = ['true', 'false', 'yes', 'no', '0', '1', 'y', 'n'];
    const boolCount = sample.filter(v => boolValues.includes(String(v).toLowerCase())).length;
    if (boolCount / sample.length > 0.9) return 'boolean';

    // Check if text (long strings) vs categorical (short strings)
    const avgLength = sample.reduce((sum, v) => sum + String(v).length, 0) / sample.length;
    if (avgLength > 50) return 'text';

    return 'categorical';
  }

  private determineEncodingStrategy(analysis: ColumnAnalysis, rowCount: number): EncodingStrategy {
    const { originalType, cardinality, missingPercent } = analysis;

    // Drop columns with too many missing values
    if (missingPercent > 80) return 'drop';

    // Type-based strategy
    switch (originalType) {
      case 'numeric':
        return 'passthrough';
      case 'boolean':
        return 'binary';
      case 'date':
        return 'temporal_features';
      case 'text':
        return 'embedding';
      case 'categorical':
        // Low cardinality → one-hot, high cardinality → embedding
        if (cardinality <= 10) return 'one_hot';
        if (cardinality <= rowCount * 0.5) return 'target_encoding';
        return 'embedding';
      default:
        return 'drop';
    }
  }

  private getCacheKey(text: string): string {
    return crypto.createHash('md5').update(text).digest('hex');
  }

  private hashToVector(text: string, dimension: number): number[] {
    // Deterministic hash-based pseudo-embedding (fallback when API fails)
    const hash = crypto.createHash('sha256').update(text).digest();
    const vector: number[] = [];

    for (let i = 0; i < dimension; i++) {
      const byteIndex = i % hash.length;
      const value = (hash[byteIndex] / 255) * 2 - 1; // Normalize to [-1, 1]
      vector.push(value);
    }

    return vector;
  }

  private getWeekOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - start.getTime();
    const oneWeek = 604800000;
    return Math.ceil(diff / oneWeek);
  }

  /**
   * Simple PCA implementation for dimensionality reduction
   */
  private applyPCA(
    data: number[][],
    targetDimension: number
  ): { reduced: number[][]; explainedVariance: number } {
    const n = data.length;
    const d = data[0]?.length || 0;

    if (n === 0 || d === 0 || targetDimension >= d) {
      return { reduced: data, explainedVariance: 1.0 };
    }

    // Center the data
    const means: number[] = [];
    for (let j = 0; j < d; j++) {
      const sum = data.reduce((acc, row) => acc + (row[j] || 0), 0);
      means.push(sum / n);
    }

    const centered = data.map(row => row.map((v, j) => (v || 0) - means[j]));

    // Compute covariance matrix (simplified - only diagonal for speed)
    const variances: number[] = [];
    for (let j = 0; j < d; j++) {
      const variance = centered.reduce((acc, row) => acc + row[j] * row[j], 0) / n;
      variances.push(variance);
    }

    // Select top dimensions by variance
    const indices = variances
      .map((v, i) => ({ variance: v, index: i }))
      .sort((a, b) => b.variance - a.variance)
      .slice(0, targetDimension)
      .map(x => x.index);

    // Project data onto selected dimensions
    const reduced = centered.map(row => indices.map(i => row[i]));

    // Calculate explained variance ratio
    const totalVariance = variances.reduce((a, b) => a + b, 0);
    const selectedVariance = indices.reduce((acc, i) => acc + variances[i], 0);
    const explainedVariance = totalVariance > 0 ? selectedVariance / totalVariance : 0;

    return { reduced, explainedVariance };
  }
}

// Singleton export
export const columnEmbeddingService = new ColumnEmbeddingService();
