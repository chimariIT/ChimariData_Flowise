import { EventEmitter } from 'events';
import {
  JourneyTemplate,
  JourneyTemplateSchema,
  JourneyTemplateJourneyType,
  JourneyTemplateCatalog,
  JourneyTemplateStep,
  cloneJourneyTemplate,
  cloneCatalog,
  defaultJourneyTemplateCatalog
} from '@shared/journey-templates';
import type { JourneyRequest } from './types';

function normalizeJourneyType(journeyType: string): JourneyTemplateJourneyType {
  switch (journeyType) {
    case 'non-tech':
    case 'business':
    case 'technical':
    case 'consultation':
      return journeyType;
    default:
      throw new Error(`Unsupported journey type for templates: ${journeyType}`);
  }
}

interface TemplateIndexEntry {
  template: JourneyTemplate;
  isDefault: boolean;
}

function cloneStep(step: JourneyTemplateStep): JourneyTemplateStep {
  return JSON.parse(JSON.stringify(step));
}

export interface ResolvedTemplateResult {
  template: JourneyTemplate;
  source: 'default' | 'override';
}

class JourneyTemplateService extends EventEmitter {
  private catalog: JourneyTemplateCatalog;
  private templatesById: Map<string, TemplateIndexEntry> = new Map();
  private templatesByJourneyType: Map<JourneyTemplateJourneyType, Map<string, TemplateIndexEntry>> = new Map();
  private defaultCatalog: JourneyTemplateCatalog;

  constructor() {
    super();
    this.defaultCatalog = cloneCatalog(defaultJourneyTemplateCatalog);
    this.catalog = cloneCatalog(this.defaultCatalog);
    this.rebuildIndexes();
  }

  private rebuildIndexes() {
    this.templatesById.clear();
    this.templatesByJourneyType.clear();

    const registerTemplate = (template: JourneyTemplate, isDefault: boolean) => {
      const typeKey = normalizeJourneyType(template.journeyType);
      if (!this.templatesByJourneyType.has(typeKey)) {
        this.templatesByJourneyType.set(typeKey, new Map());
      }

      const entry: TemplateIndexEntry = {
        template: cloneJourneyTemplate(template),
        isDefault
      };

      this.templatesById.set(template.id, entry);
      this.templatesByJourneyType.get(typeKey)!.set(template.id, entry);
    };

    (this.catalog['non-tech'] || []).forEach(template => registerTemplate(template, this.isDefaultTemplate(template.id)));
    (this.catalog.business || []).forEach(template => registerTemplate(template, this.isDefaultTemplate(template.id)));
    (this.catalog.technical || []).forEach(template => registerTemplate(template, this.isDefaultTemplate(template.id)));
    (this.catalog.consultation || []).forEach(template => registerTemplate(template, this.isDefaultTemplate(template.id)));
  }

  private isDefaultTemplate(templateId: string): boolean {
    return (
      this.defaultCatalog['non-tech'].some(t => t.id === templateId) ||
      this.defaultCatalog.business.some(t => t.id === templateId) ||
      this.defaultCatalog.technical.some(t => t.id === templateId) ||
      this.defaultCatalog.consultation.some(t => t.id === templateId)
    );
  }

  private ensureJourneyTypeBucket(type: JourneyTemplateJourneyType) {
    if (!this.templatesByJourneyType.has(type)) {
      this.templatesByJourneyType.set(type, new Map());
    }
  }

  getAllTemplates(): JourneyTemplate[] {
    return Array.from(this.templatesById.values()).map(entry => cloneJourneyTemplate(entry.template));
  }

  getTemplatesByJourneyType(journeyType: JourneyTemplateJourneyType): JourneyTemplate[] {
    const bucket = this.templatesByJourneyType.get(journeyType);
    if (!bucket) return [];
    return Array.from(bucket.values()).map(entry => cloneJourneyTemplate(entry.template));
  }

  getTemplate(templateId: string): ResolvedTemplateResult | undefined {
    const entry = this.templatesById.get(templateId);
    if (!entry) return undefined;
    return {
      template: cloneJourneyTemplate(entry.template),
      source: entry.isDefault ? 'default' : 'override'
    };
  }

  resolveTemplate(request: JourneyRequest): JourneyTemplate {
    if (request.journeyType === 'custom') {
      throw new Error('Custom journey type does not use predefined templates.');
    }

    const typeKey = normalizeJourneyType(request.journeyType);

    if (request.templateId) {
      const resolved = this.getTemplate(request.templateId);
      if (!resolved) {
        throw new Error(`Template ${request.templateId} not found for journey type ${request.journeyType}`);
      }
      if (resolved.template.journeyType !== typeKey) {
        throw new Error(`Template ${request.templateId} does not match journey type ${request.journeyType}`);
      }
      return resolved.template;
    }

    const candidates = this.getTemplatesByJourneyType(typeKey);
    if (candidates.length === 0) {
      throw new Error(`No templates registered for journey type ${request.journeyType}`);
    }

    // Attempt to pick the best match based on industry or analysis goal keywords for business journeys
    if (typeKey === 'business') {
      const industryHint = request.businessContext || request.analysisGoal || '';
      if (industryHint) {
        const matched = candidates.find(template => {
          const lowerHint = industryHint.toLowerCase();
          return (
            (template.industry && lowerHint.includes(template.industry.toLowerCase())) ||
            (template.tags && template.tags.some(tag => lowerHint.includes(tag.toLowerCase())))
          );
        });
        if (matched) {
          return matched;
        }
      }
    }

    return candidates[0];
  }

  upsertTemplate(template: JourneyTemplate): JourneyTemplate {
    const parsed = JourneyTemplateSchema.parse(template);
    const normalizedType = normalizeJourneyType(parsed.journeyType);

    // Clone to avoid external mutation
    const storedTemplate = cloneJourneyTemplate({
      ...parsed,
      lastUpdated: new Date().toISOString()
    });

    this.ensureJourneyTypeBucket(normalizedType);

    // Update catalog structure
    const list = this.catalog[normalizedType];
    const existingIndex = list.findIndex(item => item.id === storedTemplate.id);
    if (existingIndex >= 0) {
      list[existingIndex] = storedTemplate;
    } else {
      list.push(storedTemplate);
    }

    this.rebuildIndexes();

    this.emit('templateUpdated', storedTemplate);
    return cloneJourneyTemplate(storedTemplate);
  }

  deleteTemplate(templateId: string): boolean {
    let removed = false;
    (['non-tech', 'business', 'technical', 'consultation'] as JourneyTemplateJourneyType[]).forEach(typeKey => {
      const list = this.catalog[typeKey];
      const idx = list.findIndex(template => template.id === templateId);
      if (idx >= 0) {
        list.splice(idx, 1);
        removed = true;
      }
    });

    if (removed) {
      this.rebuildIndexes();
      this.emit('templateDeleted', templateId);
    }

    return removed;
  }

  resetTemplateToDefault(templateId: string): JourneyTemplate | undefined {
    const defaultEntry =
      this.defaultCatalog['non-tech'].find(t => t.id === templateId) ||
      this.defaultCatalog.business.find(t => t.id === templateId) ||
      this.defaultCatalog.technical.find(t => t.id === templateId) ||
      this.defaultCatalog.consultation.find(t => t.id === templateId);

    if (!defaultEntry) {
      return undefined;
    }

    this.upsertTemplate(defaultEntry);
    return this.getTemplate(templateId)?.template;
  }

  resetAllToDefaults() {
    this.catalog = cloneCatalog(this.defaultCatalog);
    this.rebuildIndexes();
    this.emit('templatesReset');
  }

  buildBlueprintFromTemplate(template: JourneyTemplate) {
    const steps = template.steps.map(step => ({
      stepId: step.id,
      stepName: step.name,
      agent: step.agent,
      tools: [...step.tools],
      estimatedDuration: step.estimatedDuration ?? 0,
      dependencies: step.dependencies ? [...step.dependencies] : []
    }));

    const tools = new Set<string>();
    template.steps.forEach(step => step.tools.forEach(tool => tools.add(tool)));

    const totalDuration = steps.reduce((sum, step) => sum + (step.estimatedDuration ?? 0), 0);

    return {
      selectedAgent: template.primaryAgent,
      tools: Array.from(tools),
      workflowSteps: steps,
      estimatedTotalDuration: totalDuration,
      confidence: template.defaultConfidence ?? 0.85,
      metadata: {
        templateId: template.id,
        title: template.title,
        summary: template.summary,
        journeyType: template.journeyType,
        industry: template.industry,
        expectedArtifacts: template.expectedArtifacts,
        communicationStyle: template.communicationStyle,
        communicationGuidelines: template.communicationGuidelines,
        persona: template.persona,
        tags: template.tags,
        version: template.version,
        lastUpdated: template.lastUpdated,
        steps: template.steps.map(step => ({
          id: step.id,
          name: step.name,
          agent: step.agent,
          tools: [...step.tools],
          communicationStyle: step.communicationStyle
        }))
      }
    };
  }

  getCatalogSnapshot(): JourneyTemplateCatalog {
    return cloneCatalog(this.catalog);
  }
}

export const journeyTemplateService = new JourneyTemplateService();
