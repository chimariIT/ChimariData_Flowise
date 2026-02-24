import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../enhanced-db";
import {
  knowledgeEdges,
  knowledgeNodes,
  type InsertKnowledgeEdge,
  type InsertKnowledgeNode,
  type KnowledgeNode,
} from "@shared/schema";
import { industrySeeds, regulationSeeds } from "./knowledge-graph-seed";

export interface KnowledgeTemplate {
  id: string;
  name: string;
  type?: string;
  description?: string | null;
  requiredColumns: string[];
  expectedOutcomes: string[];
  businessValue?: string;
}

export interface IndustryKnowledge {
  nodeId: string;
  industry: string;
  summary?: string | null;
  commonUseCases: string[];
  keyMetrics: string[];
  regulatoryConsiderations: string[];
  analysisTemplates: KnowledgeTemplate[];
}

export interface RegulationKnowledge {
  nodeId: string;
  name: string;
  description?: string | null;
  requirements: string[];
  applicableIndustries: string[];
}

export interface TemplateSearchResult {
  template: KnowledgeTemplate;
  industry: IndustryKnowledge;
  regulations: RegulationKnowledge[];
}

export class KnowledgeGraphService {
  private readonly database: any;
  private readonly fallbackMode: boolean;
  private seeded = false;
  private seedingPromise: Promise<void> | null = null;
  private fallbackIndustriesByName: Map<string, IndustryKnowledge> | null = null;
  private fallbackIndustriesById: Map<string, IndustryKnowledge> | null = null;
  private fallbackIndustrySeedsByName: Map<string, (typeof industrySeeds)[number]> | null = null;
  private fallbackRegulationsByName: Map<string, RegulationKnowledge> | null = null;

  constructor(database: any = db) {
    this.database = database ?? null;
    this.fallbackMode = !this.database;

    if (this.fallbackMode) {
      this.initializeFallbackGraph();
      this.seeded = true;
    }
  }

  async getIndustryKnowledge(industry: string): Promise<IndustryKnowledge | undefined> {
    if (!industry) {
      return undefined;
    }

    if (this.fallbackMode) {
      return this.getFallbackIndustryKnowledge(industry);
    }

    await this.ensureSeeded();

    const normalized = this.normalize(industry);
    const [industryNode] = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, "industry"),
          sql`lower(${knowledgeNodes.label}) = ${normalized}`,
        ),
      )
      .limit(1);

    if (!industryNode) {
      return undefined;
    }

    const templates = await this.getTemplatesForIndustry(industryNode.id);
    const attributes = (industryNode.attributes ?? {}) as Record<string, any>;

    return {
      nodeId: industryNode.id,
      industry: industryNode.label,
      summary: industryNode.summary,
      commonUseCases: this.toStringArray(attributes.commonUseCases),
      keyMetrics: this.toStringArray(attributes.keyMetrics),
      regulatoryConsiderations: this.toStringArray(attributes.regulatoryConsiderations),
      analysisTemplates: templates,
    };
  }

  async getRegulationsForIndustry(industry: string): Promise<RegulationKnowledge[]> {
    if (!industry) {
      return [];
    }

    if (this.fallbackMode) {
      return this.getFallbackRegulationsForIndustry(industry);
    }

    await this.ensureSeeded();
    const industryKnowledge = await this.getIndustryKnowledge(industry);

    if (!industryKnowledge) {
      return [];
    }

    const edges: Array<typeof knowledgeEdges.$inferSelect> = await this.database
      .select()
      .from(knowledgeEdges)
      .where(
        and(
          eq(knowledgeEdges.sourceId, industryKnowledge.nodeId),
          eq(knowledgeEdges.relationship, "REQUIRES_COMPLIANCE"),
        ),
      );

    if (edges.length === 0) {
      return [];
    }

    const regulationIds = edges.map((edge) => edge.targetId);

    const regulations: Array<typeof knowledgeNodes.$inferSelect> = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, "regulation"),
          inArray(knowledgeNodes.id, regulationIds),
        ),
      );

    return regulations.map((node) => {
      const attributes = (node.attributes ?? {}) as Record<string, any>;
      return {
        nodeId: node.id,
        name: node.label,
        description: node.summary,
        requirements: this.toStringArray(attributes.requirements),
        applicableIndustries: this.toStringArray(attributes.applicableIndustries),
      };
    });
  }

  async searchTemplates(term: string): Promise<TemplateSearchResult[]> {
    const query = term?.trim();
    if (!query) {
      return [];
    }

    if (this.fallbackMode) {
      return this.searchTemplatesFallback(query);
    }

    await this.ensureSeeded();
    const normalizedTerm = this.normalize(query);
    const industries = await this.database
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.type, "industry"));

    const results: TemplateSearchResult[] = [];

    for (const industryNode of industries) {
      const attributes = (industryNode.attributes ?? {}) as Record<string, any>;
      const useCases = this.toStringArray(attributes.commonUseCases);
      const matchesIndustry = industryNode.label.toLowerCase().includes(normalizedTerm);
      const matchesUseCase = useCases.some((useCase) =>
        useCase.toLowerCase().includes(normalizedTerm) ||
        normalizedTerm.includes(useCase.toLowerCase()),
      );

      const templates = await this.getTemplatesForIndustry(industryNode.id);
      const industryKnowledge: IndustryKnowledge = {
        nodeId: industryNode.id,
        industry: industryNode.label,
        summary: industryNode.summary,
        commonUseCases: useCases,
        keyMetrics: this.toStringArray(attributes.keyMetrics),
        regulatoryConsiderations: this.toStringArray(attributes.regulatoryConsiderations),
        analysisTemplates: templates,
      };

      const regulations = await this.getRegulationsForIndustry(industryNode.label);

      for (const template of templates) {
        const matchesTemplate =
          template.name.toLowerCase().includes(normalizedTerm) ||
          (template.description ?? "").toLowerCase().includes(normalizedTerm) ||
          (template.type ?? "").toLowerCase().includes(normalizedTerm);

        if (matchesIndustry || matchesUseCase || matchesTemplate) {
          results.push({
            template,
            industry: industryKnowledge,
            regulations,
          });
        }
      }
    }

    return results;
  }

  async listIndustries(): Promise<IndustryKnowledge[]> {
    if (this.fallbackMode) {
      return this.listIndustriesFallback();
    }

    await this.ensureSeeded();
    const industries = await this.database
      .select()
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.type, "industry"));

    const results: IndustryKnowledge[] = [];

    for (const industryNode of industries) {
      const templates = await this.getTemplatesForIndustry(industryNode.id);
      const attributes = (industryNode.attributes ?? {}) as Record<string, any>;
      results.push({
        nodeId: industryNode.id,
        industry: industryNode.label,
        summary: industryNode.summary,
        commonUseCases: this.toStringArray(attributes.commonUseCases),
        keyMetrics: this.toStringArray(attributes.keyMetrics),
        regulatoryConsiderations: this.toStringArray(attributes.regulatoryConsiderations),
        analysisTemplates: templates,
      });
    }

    return results;
  }

  private async getTemplatesForIndustry(industryId: string): Promise<KnowledgeTemplate[]> {
    if (this.fallbackMode) {
      return this.getTemplatesForIndustryFallback(industryId);
    }

    const edges: Array<typeof knowledgeEdges.$inferSelect> = await this.database
      .select()
      .from(knowledgeEdges)
      .where(
        and(
          eq(knowledgeEdges.sourceId, industryId),
          eq(knowledgeEdges.relationship, "HAS_TEMPLATE"),
        ),
      );

    if (edges.length === 0) {
      return [];
    }

    const templateIds = edges.map((edge) => edge.targetId);

    const templateNodes: Array<typeof knowledgeNodes.$inferSelect> = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, "template"),
          inArray(knowledgeNodes.id, templateIds),
        ),
      );

    return templateNodes.map((node) => {
      const attributes = (node.attributes ?? {}) as Record<string, any>;
      return {
        id: node.id,
        name: node.label,
        type: typeof attributes.type === "string" ? attributes.type : undefined,
        description: node.summary ?? (typeof attributes.description === "string" ? attributes.description : undefined),
        requiredColumns: this.toStringArray(attributes.requiredColumns),
        expectedOutcomes: this.toStringArray(attributes.expectedOutcomes),
        businessValue: typeof attributes.businessValue === "string" ? attributes.businessValue : undefined,
      };
    });
  }

  private async ensureSeeded(): Promise<void> {
    if (this.fallbackMode) {
      return;
    }

    if (this.seeded) {
      return;
    }

    if (this.seedingPromise) {
      await this.seedingPromise;
      return;
    }

    this.seedingPromise = this.seedKnowledgeGraph();

    try {
      await this.seedingPromise;
      this.seeded = true;
    } finally {
      this.seedingPromise = null;
    }
  }

  private async seedKnowledgeGraph(): Promise<void> {
    if (this.fallbackMode || !this.database) {
      return;
    }

    const [{ count }] = await this.database
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeNodes)
      .where(eq(knowledgeNodes.type, "industry"));

    const totalIndustries = Number(count ?? 0);

    if (totalIndustries > 0) {
      return;
    }

    const regulationIdByName = new Map<string, string>();

    for (const regulation of regulationSeeds) {
      const node = await this.getOrCreateNode({
        id: regulation.id,
        type: "regulation",
        label: regulation.name,
        summary: regulation.description,
        attributes: {
          requirements: regulation.requirements,
          applicableIndustries: regulation.applicableIndustries,
        },
      });
      regulationIdByName.set(regulation.name.toLowerCase(), node.id);
    }

    for (const industry of industrySeeds) {
      const industryNode = await this.getOrCreateNode({
        id: industry.id,
        type: "industry",
        label: industry.industry,
        summary: industry.summary,
        attributes: {
          commonUseCases: industry.commonUseCases,
          keyMetrics: industry.keyMetrics,
          regulatoryConsiderations: industry.regulatoryConsiderations,
        },
      });

      for (const template of industry.templates) {
        const templateNode = await this.getOrCreateNode({
          id: template.id,
          type: "template",
          label: template.name,
          summary: template.description,
          attributes: {
            type: template.type,
            requiredColumns: template.requiredColumns,
            expectedOutcomes: template.expectedOutcomes,
            businessValue: template.businessValue,
            industry: industry.industry,
          },
        });

        await this.ensureEdge({
          sourceId: industryNode.id,
          targetId: templateNode.id,
          relationship: "HAS_TEMPLATE",
          attributes: { seeded: true, type: template.type },
        });
      }

      const regulationNames = new Set<string>();
      (industry.regulationReferences ?? []).forEach((name) => {
        regulationNames.add(name.toLowerCase());
      });

      for (const regulation of regulationSeeds) {
        const applies = regulation.applicableIndustries.some((value) => {
          const normalizedValue = value.toLowerCase();
          if (normalizedValue.includes("all industries")) {
            return true;
          }
          return normalizedValue.includes(industry.industry.toLowerCase());
        });

        if (applies) {
          regulationNames.add(regulation.name.toLowerCase());
        }
      }

      for (const name of regulationNames) {
        const regulationId = regulationIdByName.get(name);
        if (!regulationId) {
          continue;
        }

        await this.ensureEdge({
          sourceId: industryNode.id,
          targetId: regulationId,
          relationship: "REQUIRES_COMPLIANCE",
          attributes: { seeded: true },
        });
      }
    }
  }

  private async getOrCreateNode(node: InsertKnowledgeNode): Promise<KnowledgeNode> {
    // P1-7 FIX: Case-insensitive label matching to prevent duplicates like "Healthcare" vs "healthcare"
    const [existing] = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, node.type),
          sql`lower(${knowledgeNodes.label}) = ${node.label.toLowerCase()}`,
        ),
      )
      .limit(1);

    if (existing) {
      return existing;
    }

    // Normalize label to Title Case for consistency
    const normalizedLabel = node.label.charAt(0).toUpperCase() + node.label.slice(1).toLowerCase();
    const payload: InsertKnowledgeNode = {
      ...node,
      label: normalizedLabel,
      id: node.id ?? nanoid(),
    };

    await this.database.insert(knowledgeNodes).values(payload);

    const [created] = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, node.type),
          sql`lower(${knowledgeNodes.label}) = ${normalizedLabel.toLowerCase()}`,
        ),
      )
      .limit(1);

    if (!created) {
      throw new Error(`Failed to seed knowledge node for ${node.label}`);
    }

    return created;
  }

  async ensureEdge(edge: InsertKnowledgeEdge): Promise<void> {
    // P1-9 FIX: Use onConflictDoNothing with the unique constraint to handle concurrent calls
    const payload: InsertKnowledgeEdge = {
      ...edge,
      id: edge.id ?? nanoid(),
    };

    await this.database
      .insert(knowledgeEdges)
      .values(payload)
      .onConflictDoNothing({
        target: [knowledgeEdges.sourceId, knowledgeEdges.targetId, knowledgeEdges.relationship],
      });
  }

  // ============================================================================
  // ENRICHMENT METHODS — Used by KnowledgeEnrichmentService at runtime
  // ============================================================================

  /**
   * Merge new attributes into an existing node's JSONB attributes.
   * For array attributes, deduplicates by appending only new values.
   * For scalar attributes, overwrites with new value.
   */
  async mergeNodeAttributes(
    type: string,
    label: string,
    newAttributes: Record<string, any>,
  ): Promise<KnowledgeNode | undefined> {
    if (this.fallbackMode) return undefined;
    await this.ensureSeeded();

    // P1-7 FIX: Case-insensitive label matching
    const [existing] = await this.database
      .select()
      .from(knowledgeNodes)
      .where(
        and(
          eq(knowledgeNodes.type, type),
          sql`lower(${knowledgeNodes.label}) = ${label.toLowerCase()}`,
        ),
      )
      .limit(1);

    if (!existing) return undefined;

    const current = (existing.attributes ?? {}) as Record<string, any>;
    const merged = { ...current };

    for (const [key, value] of Object.entries(newAttributes)) {
      if (Array.isArray(value) && Array.isArray(merged[key])) {
        // Deduplicate array merge — case-insensitive for strings
        const existingSet = new Set(
          merged[key].map((v: any) => (typeof v === "string" ? v.toLowerCase() : JSON.stringify(v))),
        );
        const newItems = value.filter((v: any) => {
          const normalized = typeof v === "string" ? v.toLowerCase() : JSON.stringify(v);
          return !existingSet.has(normalized);
        });
        merged[key] = [...merged[key], ...newItems];
      } else {
        merged[key] = value;
      }
    }

    await this.database
      .update(knowledgeNodes)
      .set({ attributes: merged, updatedAt: new Date() })
      .where(eq(knowledgeNodes.id, existing.id));

    return { ...existing, attributes: merged };
  }

  /**
   * Increment an edge's weight (or create the edge if it doesn't exist).
   * Used for tracking how often an industry→analysisType pair succeeds.
   */
  async incrementEdgeWeight(
    sourceId: string,
    targetId: string,
    relationship: string,
    increment: number = 1,
    mergeAttributes?: Record<string, any>,
  ): Promise<void> {
    if (this.fallbackMode) return;
    await this.ensureSeeded();

    const [existing] = await this.database
      .select()
      .from(knowledgeEdges)
      .where(
        and(
          eq(knowledgeEdges.sourceId, sourceId),
          eq(knowledgeEdges.targetId, targetId),
          eq(knowledgeEdges.relationship, relationship),
        ),
      )
      .limit(1);

    if (existing) {
      const updatedAttrs = mergeAttributes
        ? { ...((existing.attributes ?? {}) as Record<string, any>), ...mergeAttributes }
        : existing.attributes;

      await this.database
        .update(knowledgeEdges)
        .set({
          weight: (existing.weight || 1) + increment,
          attributes: updatedAttrs,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeEdges.id, existing.id));
    } else {
      await this.ensureEdge({
        sourceId,
        targetId,
        relationship,
        weight: increment,
        attributes: { createdByEnrichment: true, ...mergeAttributes },
      });
    }
  }

  /**
   * Upsert a node: creates if absent, merges attributes if it already exists.
   * Preferred over getOrCreateNode() when enriching existing knowledge.
   */
  async getOrCreateNodeWithMerge(node: InsertKnowledgeNode): Promise<KnowledgeNode> {
    if (this.fallbackMode) {
      return {
        id: node.id ?? nanoid(),
        type: node.type,
        label: node.label,
        summary: node.summary ?? null,
        attributes: node.attributes ?? {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as KnowledgeNode;
    }
    await this.ensureSeeded();

    // Try merging into existing node first
    const existing = await this.mergeNodeAttributes(
      node.type,
      node.label,
      (node.attributes ?? {}) as Record<string, any>,
    );
    if (existing) return existing;

    // Node doesn't exist — create it
    return this.getOrCreateNode(node);
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }

  private toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === "string").map((item) => item.toString());
    }
    return [];
  }

  private initializeFallbackGraph(): void {
    this.fallbackIndustriesByName = new Map();
    this.fallbackIndustriesById = new Map();
    this.fallbackIndustrySeedsByName = new Map();
    this.fallbackRegulationsByName = new Map();

    for (const regulation of regulationSeeds) {
      const regulationKnowledge: RegulationKnowledge = {
        nodeId: regulation.id,
        name: regulation.name,
        description: regulation.description,
        requirements: [...regulation.requirements],
        applicableIndustries: [...regulation.applicableIndustries],
      };
      this.fallbackRegulationsByName.set(this.normalize(regulation.name), regulationKnowledge);
    }

    for (const industry of industrySeeds) {
      const templates: KnowledgeTemplate[] = industry.templates.map((template) => ({
        id: template.id!,
        name: template.name,
        type: template.type,
        description: template.description,
        requiredColumns: [...template.requiredColumns],
        expectedOutcomes: [...template.expectedOutcomes],
        businessValue: template.businessValue,
      }));

      const knowledge: IndustryKnowledge = {
        nodeId: industry.id,
        industry: industry.industry,
        summary: industry.summary,
        commonUseCases: [...industry.commonUseCases],
        keyMetrics: [...industry.keyMetrics],
        regulatoryConsiderations: [...industry.regulatoryConsiderations],
        analysisTemplates: templates,
      };

      const normalizedName = this.normalize(industry.industry);
      this.fallbackIndustriesByName.set(normalizedName, knowledge);
      this.fallbackIndustriesById.set(industry.id, knowledge);
      this.fallbackIndustrySeedsByName.set(normalizedName, industry);
    }
  }

  private getFallbackIndustryKnowledge(industry: string): IndustryKnowledge | undefined {
    const normalized = this.normalize(industry);
    const fallback = this.fallbackIndustriesByName?.get(normalized);
    if (!fallback) {
      return undefined;
    }
    return this.cloneIndustryKnowledge(fallback);
  }

  private getFallbackRegulationsForIndustry(industry: string): RegulationKnowledge[] {
    const normalized = this.normalize(industry);
    const industrySeed = this.fallbackIndustrySeedsByName?.get(normalized);
    if (!industrySeed) {
      return [];
    }

    const regulationNames = new Set<string>();
    (industrySeed.regulationReferences ?? []).forEach((name) => regulationNames.add(this.normalize(name)));

    for (const regulation of regulationSeeds) {
      const applies = regulation.applicableIndustries.some((value) => {
        const normalizedValue = value.toLowerCase();
        if (normalizedValue.includes("all industries")) {
          return true;
        }
        return normalizedValue.includes(industrySeed.industry.toLowerCase());
      });

      if (applies) {
        regulationNames.add(this.normalize(regulation.name));
      }
    }

    const regulations: RegulationKnowledge[] = [];
    for (const name of regulationNames) {
      const regulation = this.fallbackRegulationsByName?.get(name);
      if (regulation) {
        regulations.push(this.cloneRegulationKnowledge(regulation));
      }
    }

    return regulations;
  }

  private async searchTemplatesFallback(term: string): Promise<TemplateSearchResult[]> {
    const normalizedTerm = this.normalize(term);
    const results: TemplateSearchResult[] = [];
    const industries = this.fallbackIndustriesByName ? Array.from(this.fallbackIndustriesByName.values()) : [];

    for (const industry of industries) {
      const industryKnowledge = this.cloneIndustryKnowledge(industry);
      const useCases = industryKnowledge.commonUseCases;
      const matchesIndustry = industryKnowledge.industry.toLowerCase().includes(normalizedTerm);
      const matchesUseCase = useCases.some((useCase) =>
        useCase.toLowerCase().includes(normalizedTerm) || normalizedTerm.includes(useCase.toLowerCase()),
      );

      const regulations = this.getFallbackRegulationsForIndustry(industryKnowledge.industry);

      for (const template of industryKnowledge.analysisTemplates) {
        const matchesTemplate =
          template.name.toLowerCase().includes(normalizedTerm) ||
          (template.description ?? "").toLowerCase().includes(normalizedTerm) ||
          (template.type ?? "").toLowerCase().includes(normalizedTerm);

        if (matchesIndustry || matchesUseCase || matchesTemplate) {
          results.push({
            template: this.cloneTemplate(template),
            industry: this.cloneIndustryKnowledge(industryKnowledge),
            regulations: regulations.map((reg) => this.cloneRegulationKnowledge(reg)),
          });
        }
      }
    }

    return results;
  }

  private listIndustriesFallback(): IndustryKnowledge[] {
    if (!this.fallbackIndustriesByName) {
      return [];
    }

    return Array.from(this.fallbackIndustriesByName.values()).map((industry) => this.cloneIndustryKnowledge(industry));
  }

  private async getTemplatesForIndustryFallback(industryId: string): Promise<KnowledgeTemplate[]> {
    const industry = this.fallbackIndustriesById?.get(industryId);
    if (!industry) {
      return [];
    }

    return industry.analysisTemplates.map((template) => this.cloneTemplate(template));
  }

  private cloneIndustryKnowledge(industry: IndustryKnowledge): IndustryKnowledge {
    return {
      nodeId: industry.nodeId,
      industry: industry.industry,
      summary: industry.summary,
      commonUseCases: [...industry.commonUseCases],
      keyMetrics: [...industry.keyMetrics],
      regulatoryConsiderations: [...industry.regulatoryConsiderations],
      analysisTemplates: industry.analysisTemplates.map((template) => this.cloneTemplate(template)),
    };
  }

  private cloneTemplate(template: KnowledgeTemplate): KnowledgeTemplate {
    return {
      id: template.id,
      name: template.name,
      type: template.type,
      description: template.description,
      requiredColumns: [...template.requiredColumns],
      expectedOutcomes: [...template.expectedOutcomes],
      businessValue: template.businessValue,
    };
  }

  private cloneRegulationKnowledge(regulation: RegulationKnowledge): RegulationKnowledge {
    return {
      nodeId: regulation.nodeId,
      name: regulation.name,
      description: regulation.description,
      requirements: [...regulation.requirements],
      applicableIndustries: [...regulation.applicableIndustries],
    };
  }
}
