// Template Service - Database-backed template management
// Replaces code-based journey-templates.ts for dynamic template access

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { semanticSearchService } from './semantic-search-service';

export interface TemplateStep {
  id: string;
  name: string;
  summary: string;
  agentHandoff: string;
  tools: string[];
}

export interface Template {
  id: string;
  name: string;
  title: string;
  summary: string;
  description?: string;
  journeyType: string;
  industry: string;
  persona?: string;
  primaryAgent?: string;
  defaultConfidence: number;
  expectedArtifacts: string[];
  communicationStyle: string;
  steps: TemplateStep[];
  metadata?: Record<string, any>;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  targetRole?: string;
  targetSeniority?: string;
  targetMaturity?: string;
  artifactTypes?: string[];
  visualizationTypes?: string[];
  narrativeStyle?: string;
  contentDepth?: string;
  interactivityLevel?: string;
  useCases?: string[];
  deliveryFormat?: string[];
  priority?: number;
  usageCount?: number;
}

export interface TemplateFilter {
  journeyType?: string;
  industry?: string;
  persona?: string;
  isSystem?: boolean;
  isActive?: boolean;
  searchTerm?: string;
  limit?: number;
  minSimilarity?: number;
}

export class TemplateService {
  /**
   * Get all active templates with optional filtering
   */
  static async getAllTemplates(filter?: TemplateFilter): Promise<Template[]> {
    let query = `
      SELECT *
      FROM artifact_templates
      WHERE is_active = true
    `;

    const conditions: string[] = [];

    if (filter?.journeyType) {
      conditions.push(`journey_type = '${filter.journeyType}'`);
    }

    if (filter?.industry) {
      conditions.push(`industry = '${filter.industry}'`);
    }

    if (filter?.persona) {
      conditions.push(`persona = '${filter.persona}'`);
    }

    if (filter?.isSystem !== undefined) {
      conditions.push(`is_system = ${filter.isSystem}`);
    }

    if (filter?.searchTerm) {
      const term = filter.searchTerm.replace(/'/g, "''");
      conditions.push(`(
        name ILIKE '%${term}%' OR
        title ILIKE '%${term}%' OR
        summary ILIKE '%${term}%' OR
        description ILIKE '%${term}%'
      )`);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY industry, name`;

    const result = await db.execute(sql.raw(query));
    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get template by ID
   */
  static async getTemplateById(id: string): Promise<Template | null> {
    const result = await db.execute(sql.raw(`
      SELECT *
      FROM artifact_templates
      WHERE id = '${id}'
      LIMIT 1;
    `));

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Get template by name (case-insensitive)
   */
  static async getTemplateByName(name: string): Promise<Template | null> {
    const safeName = name.replace(/'/g, "''");
    const result = await db.execute(sql.raw(`
      SELECT *
      FROM artifact_templates
      WHERE LOWER(name) = LOWER('${safeName}')
      LIMIT 1;
    `));

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Get templates by industry
   */
  static async getTemplatesByIndustry(industry: string): Promise<Template[]> {
    const result = await db.execute(sql.raw(`
      SELECT *
      FROM artifact_templates
      WHERE industry = '${industry}'
      AND is_active = true
      ORDER BY name;
    `));

    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get templates by journey type
   */
  static async getTemplatesByJourneyType(journeyType: string): Promise<Template[]> {
    const result = await db.execute(sql.raw(`
      SELECT *
      FROM artifact_templates
      WHERE journey_type = '${journeyType}'
      AND is_active = true
      ORDER BY industry, name;
    `));

    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get system templates (built-in templates)
   */
  static async getSystemTemplates(): Promise<Template[]> {
    const result = await db.execute(sql.raw(`
      SELECT *
      FROM system_templates
      ORDER BY industry, name;
    `));

    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get custom templates (user-created)
   */
  static async getCustomTemplates(userId?: string): Promise<Template[]> {
    let query = `
      SELECT *
      FROM custom_templates
    `;

    if (userId) {
      query += ` WHERE created_by = '${userId}'`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.execute(sql.raw(query));
    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Get templates with their linked analysis patterns
   */
  static async getTemplatesWithPatterns(): Promise<any[]> {
    const result = await db.execute(sql.raw(`
      SELECT
        t.*,
        ap.id as pattern_id,
        ap.name as pattern_name,
        ap.goal as pattern_goal,
        ap.confidence as pattern_confidence,
        tp.relevance_score
      FROM artifact_templates t
      LEFT JOIN template_patterns tp ON tp.template_id = t.id
      LEFT JOIN analysis_patterns ap ON ap.id = tp.pattern_id
      WHERE t.is_active = true
      ORDER BY t.industry, t.name;
    `));

    return result.rows;
  }

  /**
   * Get industry summary
   */
  static async getIndustrySummary(): Promise<Record<string, number>> {
    const result = await db.execute(sql.raw(`
      SELECT industry, COUNT(*) as count
      FROM artifact_templates
      WHERE is_active = true
      GROUP BY industry
      ORDER BY count DESC;
    `));

    const summary: Record<string, number> = {};
    for (const row of result.rows) {
      summary[row.industry] = parseInt(row.count);
    }

    return summary;
  }

  /**
   * Search templates
   */
  static async searchTemplates(searchTerm: string): Promise<Template[]> {
    return this.searchTemplatesWithFilters(searchTerm, {});
  }

  static async searchTemplatesWithFilters(searchTerm: string, filter: TemplateFilter): Promise<Template[]> {
    const vectorAvailable = await semanticSearchService.isPgVectorAvailable();
    const limit = filter.limit ?? 20;
    const minSimilarity = filter.minSimilarity ?? 0.6;

    if (vectorAvailable) {
      const results = await semanticSearchService.findSimilarTemplates(searchTerm, {
        limit,
        minSimilarity,
        journeyType: filter.journeyType,
        industry: filter.industry,
        persona: filter.persona,
        isSystem: filter.isSystem,
        isActive: filter.isActive ?? true,
      });

      if (results.length > 0) {
        return results.map((r) => this.mapRowToTemplate(r.item));
      }
    }

    return this.searchTemplatesWithIlike(searchTerm, filter);
  }

  private static async searchTemplatesWithIlike(searchTerm: string, filter: TemplateFilter): Promise<Template[]> {
    const safeTerm = searchTerm.replace(/'/g, "''");
    const conditions: string[] = ['is_active = true'];

    if (filter.journeyType) {
      conditions.push(`journey_type = '${filter.journeyType}'`);
    }
    if (filter.industry) {
      conditions.push(`industry = '${filter.industry}'`);
    }
    if (filter.persona) {
      conditions.push(`persona = '${filter.persona}'`);
    }
    if (filter.isSystem !== undefined) {
      conditions.push(`is_system = ${filter.isSystem}`);
    }

    conditions.push(`(
      name ILIKE '%${safeTerm}%' OR
      title ILIKE '%${safeTerm}%' OR
      summary ILIKE '%${safeTerm}%' OR
      description ILIKE '%${safeTerm}%' OR
      industry ILIKE '%${safeTerm}%'
    )`);

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.execute(sql.raw(`
      SELECT *
      FROM artifact_templates
      ${whereClause}
      ORDER BY
        CASE
          WHEN LOWER(name) = LOWER('${safeTerm}') THEN 1
          WHEN LOWER(name) LIKE LOWER('${safeTerm}%') THEN 2
          WHEN LOWER(title) LIKE LOWER('%${safeTerm}%') THEN 3
          ELSE 4
        END,
        name
      LIMIT ${filter.limit ?? 50};
    `));

    return result.rows.map((row: any) => this.mapRowToTemplate(row));
  }

  /**
   * Map database row to Template object
   */
  private static mapRowToTemplate(row: any): Template {
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      summary: row.summary,
      description: row.description,
      journeyType: row.journey_type,
      industry: row.industry,
      persona: row.persona,
      primaryAgent: row.primary_agent,
      defaultConfidence: parseFloat(row.default_confidence) || 0.8,
      expectedArtifacts: row.expected_artifacts || [],
      communicationStyle: row.communication_style || 'professional',
      steps: row.steps || [],
      metadata: row.metadata || {},
      isSystem: row.is_system || false,
      isActive: row.is_active !== false,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      targetRole: row.target_role,
      targetSeniority: row.target_seniority,
      targetMaturity: row.target_maturity,
      artifactTypes: row.artifact_types || [],
      visualizationTypes: row.visualization_types || [],
      narrativeStyle: row.narrative_style,
      contentDepth: row.content_depth,
      interactivityLevel: row.interactivity_level,
      useCases: row.use_cases || [],
      deliveryFormat: row.delivery_format || [],
      priority: typeof row.priority === 'number' ? row.priority : (row.priority ? parseInt(row.priority, 10) : undefined),
      usageCount: typeof row.usage_count === 'number' ? row.usage_count : (row.usage_count ? parseInt(row.usage_count, 10) : undefined),
    };
  }

  /**
   * Compatibility method for existing code using journey-templates.ts
   * Returns templates in the old catalog format
   */
  static async getTemplateCatalog(): Promise<Record<string, Template[]>> {
    const allTemplates = await this.getAllTemplates();

    const catalog: Record<string, Template[]> = {
      'non-tech': [],
      'business': [],
      'technical': [],
      'consultation': [],
      'custom': []
    };

    for (const template of allTemplates) {
      const journeyType = template.journeyType;
      if (catalog[journeyType]) {
        catalog[journeyType].push(template);
      }
    }

    return catalog;
  }
}
