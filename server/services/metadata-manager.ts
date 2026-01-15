/**
 * Metadata Management Service
 * 
 * Manages metadata for datasets, columns, and projects.
 * Includes business glossary, tags, and data catalog functionality.
 * 
 * @module MetadataManagerService
 */

import { db } from '../db';
import { metadataEntries, dataTags, businessGlossary } from '@shared/schema';
import { eq, like, or, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

/** Entity types that can have metadata */
export type EntityType = 'DATASET' | 'COLUMN' | 'PROJECT' | 'ANALYSIS';

/** Metadata entry */
export interface MetadataEntry {
    id: string;
    entityType: EntityType;
    entityId: string;
    name: string;
    description?: string;
    owner?: string;
    tags: string[];
    customFields: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

/** Data tag */
export interface DataTag {
    id: string;
    name: string;
    category?: string;
    color?: string;
    description?: string;
}

/** Business glossary term */
export interface GlossaryTerm {
    id: string;
    term: string;
    definition: string;
    category?: string;
    relatedTerms: string[];
    owner?: string;
    createdAt: Date;
}

/**
 * Metadata Manager Service
 * 
 * Provides data catalog and metadata management capabilities
 */
export class MetadataManagerService {
    /**
     * Create metadata entry
     * 
     * @param entityType - Type of entity
     * @param entityId - Entity ID
     * @param metadata - Metadata details
     * @returns Created metadata entry
     */
    static async createMetadata(
        entityType: EntityType,
        entityId: string,
        metadata: Partial<MetadataEntry>
    ): Promise<MetadataEntry> {
        const [entry] = await db
            .insert(metadataEntries)
            .values({
                id: nanoid(),
                entityType,
                entityId,
                name: metadata.name || '',
                description: metadata.description,
                owner: metadata.owner,
                tags: metadata.tags || [],
                customFields: metadata.customFields || {},
                createdAt: new Date(),
                updatedAt: new Date()
            })
            .returning();

        return entry as MetadataEntry;
    }

    /**
     * Update metadata entry
     * 
     * @param metadataId - Metadata ID
     * @param updates - Updates to apply
     * @returns Updated metadata entry
     */
    static async updateMetadata(
        metadataId: string,
        updates: Partial<MetadataEntry>
    ): Promise<MetadataEntry> {
        const [updated] = await db
            .update(metadataEntries)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(metadataEntries.id, metadataId))
            .returning();

        return updated as MetadataEntry;
    }

    /**
     * Get metadata for an entity
     * 
     * @param entityType - Entity type
     * @param entityId - Entity ID
     * @returns Metadata entry or null
     */
    static async getMetadata(
        entityType: EntityType,
        entityId: string
    ): Promise<MetadataEntry | null> {
        const [entry] = await db
            .select()
            .from(metadataEntries)
            .where(
                and(
                    eq(metadataEntries.entityType, entityType),
                    eq(metadataEntries.entityId, entityId)
                )
            );

        return entry as MetadataEntry || null;
    }

    /**
     * Search metadata
     * 
     * @param query - Search query
     * @returns Matching metadata entries
     */
    static async searchMetadata(query: string): Promise<MetadataEntry[]> {
        const entries = await db
            .select()
            .from(metadataEntries)
            .where(
                or(
                    like(metadataEntries.name, `%${query}%`),
                    like(metadataEntries.description, `%${query}%`)
                )
            );

        return entries as MetadataEntry[];
    }

    /**
     * Add tag to entity
     * 
     * @param entityType - Entity type
     * @param entityId - Entity ID
     * @param tagName - Tag name
     */
    static async addTag(
        entityType: EntityType,
        entityId: string,
        tagName: string
    ): Promise<void> {
        const metadata = await this.getMetadata(entityType, entityId);

        if (!metadata) {
            throw new Error('Metadata not found');
        }

        const tags = metadata.tags || [];
        if (!tags.includes(tagName)) {
            tags.push(tagName);
            await this.updateMetadata(metadata.id, { tags });
        }
    }

    /**
     * Remove tag from entity
     * 
     * @param entityType - Entity type
     * @param entityId - Entity ID
     * @param tagName - Tag name
     */
    static async removeTag(
        entityType: EntityType,
        entityId: string,
        tagName: string
    ): Promise<void> {
        const metadata = await this.getMetadata(entityType, entityId);

        if (!metadata) {
            throw new Error('Metadata not found');
        }

        const tags = (metadata.tags || []).filter(t => t !== tagName);
        await this.updateMetadata(metadata.id, { tags });
    }

    /**
     * Create a data tag
     * 
     * @param tag - Tag details
     * @returns Created tag
     */
    static async createTag(tag: Omit<DataTag, 'id'>): Promise<DataTag> {
        const [created] = await db
            .insert(dataTags)
            .values({
                id: nanoid(),
                ...tag
            })
            .returning();

        return created as DataTag;
    }

    /**
     * Get all tags
     * 
     * @returns All tags
     */
    static async getAllTags(): Promise<DataTag[]> {
        const tags = await db.select().from(dataTags);
        return tags as DataTag[];
    }

    /**
     * Add glossary term
     * 
     * @param term - Term name
     * @param definition - Term definition
     * @param options - Additional options
     * @returns Created glossary term
     */
    static async addGlossaryTerm(
        term: string,
        definition: string,
        options: {
            category?: string;
            relatedTerms?: string[];
            owner?: string;
        } = {}
    ): Promise<GlossaryTerm> {
        const [created] = await db
            .insert(businessGlossary)
            .values({
                id: nanoid(),
                term,
                definition,
                category: options.category,
                relatedTerms: options.relatedTerms || [],
                owner: options.owner,
                createdAt: new Date()
            })
            .returning();

        return created as GlossaryTerm;
    }

    /**
     * Get business glossary
     * 
     * @returns All glossary terms
     */
    static async getBusinessGlossary(): Promise<GlossaryTerm[]> {
        const terms = await db.select().from(businessGlossary);
        return terms as GlossaryTerm[];
    }

    /**
     * Search glossary
     * 
     * @param query - Search query
     * @returns Matching glossary terms
     */
    static async searchGlossary(query: string): Promise<GlossaryTerm[]> {
        const terms = await db
            .select()
            .from(businessGlossary)
            .where(
                or(
                    like(businessGlossary.term, `%${query}%`),
                    like(businessGlossary.definition, `%${query}%`)
                )
            );

        return terms as GlossaryTerm[];
    }

    /**
     * Delete metadata entry
     * 
     * @param metadataId - Metadata ID
     */
    static async deleteMetadata(metadataId: string): Promise<void> {
        await db
            .delete(metadataEntries)
            .where(eq(metadataEntries.id, metadataId));
    }
}
