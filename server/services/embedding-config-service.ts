/**
 * Embedding Config Service
 *
 * Loads/saves embedding provider configuration from the database.
 * Handles config versioning for stale detection and bulk re-generation.
 */

import { db } from '../db';
import { embeddingProviderConfig, columnEmbeddings } from '../../shared/schema';
import { eq, lt, count } from 'drizzle-orm';
import type { EmbeddingProviderConfig } from './embedding-providers/types';
import { EmbeddingProviderRegistry } from './embedding-providers/registry';

const CONFIG_ID = 'default';

export class EmbeddingConfigService {

  /**
   * Load config from database, falling back to env-var defaults.
   */
  async loadConfig(): Promise<EmbeddingProviderConfig> {
    try {
      const rows = await db
        .select()
        .from(embeddingProviderConfig)
        .where(eq(embeddingProviderConfig.id, CONFIG_ID))
        .limit(1);

      if (rows.length > 0 && rows[0].config) {
        const config = rows[0].config as EmbeddingProviderConfig;
        // Validate required fields
        if (config.targetDimension && config.providerOrder && config.configVersion != null) {
          return config;
        }
      }
    } catch (error: any) {
      console.warn('[EmbeddingConfig] Failed to load from DB, using defaults:', error.message);
    }

    // Fallback to env-var defaults
    return EmbeddingProviderRegistry.getDefaultConfig();
  }

  /**
   * Save config to database.
   * Auto-increments configVersion if targetDimension changes.
   */
  async saveConfig(
    config: EmbeddingProviderConfig,
    updatedBy: string
  ): Promise<EmbeddingProviderConfig> {
    // Check if dimension changed — requires version bump
    let currentConfig: EmbeddingProviderConfig | null = null;
    try {
      currentConfig = await this.loadConfig();
    } catch {
      // First save
    }

    const dimensionChanged = currentConfig && currentConfig.targetDimension !== config.targetDimension;

    const updatedConfig: EmbeddingProviderConfig = {
      ...config,
      configVersion: dimensionChanged
        ? (currentConfig?.configVersion ?? 0) + 1
        : config.configVersion,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };

    try {
      // Upsert
      const existing = await db
        .select()
        .from(embeddingProviderConfig)
        .where(eq(embeddingProviderConfig.id, CONFIG_ID))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(embeddingProviderConfig)
          .set({
            config: updatedConfig as any,
            updatedAt: new Date(),
            updatedBy,
          })
          .where(eq(embeddingProviderConfig.id, CONFIG_ID));
      } else {
        await db
          .insert(embeddingProviderConfig)
          .values({
            id: CONFIG_ID,
            config: updatedConfig as any,
            updatedAt: new Date(),
            updatedBy,
          });
      }

      if (dimensionChanged) {
        console.log(
          `[EmbeddingConfig] Dimension changed from ${currentConfig?.targetDimension} to ${config.targetDimension}. ` +
          `Config version bumped to ${updatedConfig.configVersion}. Stale embeddings need regeneration.`
        );
      }

      return updatedConfig;
    } catch (error: any) {
      console.error('[EmbeddingConfig] Failed to save config:', error.message);
      throw error;
    }
  }

  /**
   * Check if an embedding was generated with a stale config version.
   */
  isStale(embeddingConfigVersion: number | null | undefined, currentConfigVersion: number): boolean {
    if (embeddingConfigVersion == null) return true; // Pre-versioning embeddings
    return embeddingConfigVersion < currentConfigVersion;
  }

  /**
   * Get statistics about stale vs. current embeddings.
   */
  async getStaleStats(currentConfigVersion: number): Promise<{
    total: number;
    current: number;
    stale: number;
  }> {
    try {
      const [totalResult] = await db
        .select({ count: count() })
        .from(columnEmbeddings);

      const [staleResult] = await db
        .select({ count: count() })
        .from(columnEmbeddings)
        .where(lt(columnEmbeddings.configVersion, currentConfigVersion));

      const total = totalResult?.count ?? 0;
      const stale = staleResult?.count ?? 0;

      return {
        total,
        current: total - stale,
        stale,
      };
    } catch (error: any) {
      console.error('[EmbeddingConfig] Failed to get stale stats:', error.message);
      return { total: 0, current: 0, stale: 0 };
    }
  }
}

/** Singleton instance */
export const embeddingConfigService = new EmbeddingConfigService();
