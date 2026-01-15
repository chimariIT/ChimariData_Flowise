/**
 * Requirements Cache
 * 
 * Caches Data Requirements Mapping Documents to reduce database queries
 * and improve performance for frequently accessed projects.
 */

import type { DataRequirementsMappingDocument } from './tools/required-data-elements-tool';

interface CacheEntry {
    doc: DataRequirementsMappingDocument;
    timestamp: number;
}

export class RequirementsCache {
    private cache = new Map<string, CacheEntry>();
    private readonly TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get cached requirements document
     */
    async get(projectId: string): Promise<DataRequirementsMappingDocument | null> {
        const cached = this.cache.get(projectId);
        if (!cached) {
            return null;
        }

        const age = Date.now() - cached.timestamp;
        if (age > this.TTL) {
            this.cache.delete(projectId);
            return null;
        }

        console.log(`📦 [Cache] Hit for project ${projectId} (age: ${Math.round(age / 1000)}s)`);
        return cached.doc;
    }

    /**
     * Set cached requirements document
     */
    set(projectId: string, doc: DataRequirementsMappingDocument): void {
        this.cache.set(projectId, {
            doc,
            timestamp: Date.now()
        });
        console.log(`📦 [Cache] Stored for project ${projectId}`);
    }

    /**
     * Invalidate cache for a project
     */
    invalidate(projectId: string): void {
        const deleted = this.cache.delete(projectId);
        if (deleted) {
            console.log(`📦 [Cache] Invalidated for project ${projectId}`);
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        const size = this.cache.size;
        this.cache.clear();
        console.log(`📦 [Cache] Cleared ${size} entries`);
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; entries: Array<{ projectId: string; age: number }> } {
        const now = Date.now();
        const entries = Array.from(this.cache.entries()).map(([projectId, entry]) => ({
            projectId,
            age: Math.round((now - entry.timestamp) / 1000)
        }));

        return { size: this.cache.size, entries };
    }
}

// Singleton instance
export const requirementsCache = new RequirementsCache();
