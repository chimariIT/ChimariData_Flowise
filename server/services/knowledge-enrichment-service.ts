/**
 * Knowledge Enrichment Service
 *
 * Extracts learning signals from every completed project and enriches:
 *   Level 1 — User Profile: industry, journey completions, analysis preferences, column patterns
 *   Level 2 — Generic Knowledge Graph: industry use cases, analysis effectiveness, question patterns, column schemas
 *
 * Triggered asynchronously after analysis execution (non-blocking).
 * All operations are deterministic — no AI calls.
 * Idempotent: checks journeyProgress.knowledgeEnrichment.processedAt before running.
 */

import { KnowledgeGraphService } from './knowledge-graph-service';
import { storage } from '../storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrichmentInput {
  projectId: string;
  userId: string;
  industry: string;
  analysisTypes: string[];
  userGoals: string[];
  userQuestions: string[];
  insightCount: number;
  qualityScore: number;
  columnNames: string[];
  executionTimeSeconds: number;
  questionAnswerMapping?: Array<{
    questionId: string;
    questionText: string;
    recommendedAnalyses?: string[];
  }>;
}

export interface EnrichmentResult {
  userProfileUpdates: string[];
  knowledgeGraphUpdates: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Question keyword extraction patterns (deterministic, no AI)
// ---------------------------------------------------------------------------

const QUESTION_KEYWORD_PATTERNS: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /\b(turnover|attrition|churn|retention)\b/i, keyword: 'employee_attrition' },
  { pattern: /\b(satisfaction|engagement|nps|survey)\b/i, keyword: 'satisfaction_analysis' },
  { pattern: /\b(revenue|sales|income|profit)\b/i, keyword: 'revenue_analysis' },
  { pattern: /\b(forecast|predict|projection|trend)\b/i, keyword: 'forecasting' },
  { pattern: /\b(segment|cluster|group|cohort)\b/i, keyword: 'segmentation' },
  { pattern: /\b(correlat|relationship|associat|impact)\b/i, keyword: 'correlation_analysis' },
  { pattern: /\b(performance|kpi|metric|benchmark)\b/i, keyword: 'performance_analysis' },
  { pattern: /\b(risk|compliance|anomal|outlier)\b/i, keyword: 'risk_analysis' },
  { pattern: /\b(cost|expense|budget|spend)\b/i, keyword: 'cost_analysis' },
  { pattern: /\b(time.?series|seasonal|cyclical|temporal)\b/i, keyword: 'time_series' },
  { pattern: /\b(classif|categoriz|label|type)\b/i, keyword: 'classification' },
  { pattern: /\b(regression|predict.*value|estimat)\b/i, keyword: 'regression' },
];

// Column name patterns associated with industries
const COLUMN_INDUSTRY_SIGNALS: Array<{ pattern: RegExp; industry: string }> = [
  { pattern: /\b(employee|hire_date|department|salary|job_title|manager)\b/i, industry: 'hr' },
  { pattern: /\b(revenue|sales|deal|pipeline|quota|opportunity)\b/i, industry: 'sales' },
  { pattern: /\b(patient|diagnosis|treatment|medication|icd|cpt)\b/i, industry: 'healthcare' },
  { pattern: /\b(transaction|balance|account|interest|credit|debit)\b/i, industry: 'finance' },
  { pattern: /\b(campaign|impression|click|conversion|ctr|cpc)\b/i, industry: 'marketing' },
  { pattern: /\b(sku|inventory|supplier|warehouse|shipment)\b/i, industry: 'supply_chain' },
  { pattern: /\b(student|grade|course|enrollment|gpa)\b/i, industry: 'education' },
  { pattern: /\b(product|cart|order|customer|purchase)\b/i, industry: 'retail' },
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KnowledgeEnrichmentService {
  private kgService: KnowledgeGraphService;

  constructor(kgService?: KnowledgeGraphService) {
    this.kgService = kgService ?? new KnowledgeGraphService();
  }

  /**
   * Main entry point. Enriches both user profile and knowledge graph.
   * Idempotent — skips if already processed for this project.
   */
  async enrich(input: EnrichmentInput): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      userProfileUpdates: [],
      knowledgeGraphUpdates: [],
      errors: [],
    };

    // Idempotency check
    try {
      const project = await storage.getProject(input.projectId);
      const jp = (project as any)?.journeyProgress;
      if (jp?.knowledgeEnrichment?.processedAt) {
        console.log(`📚 [Knowledge Enrichment] Already processed for project ${input.projectId}, skipping`);
        return result;
      }
    } catch {
      // If we can't check, proceed anyway — worst case is duplicate enrichment (harmless)
    }

    // Level 1: User Profile
    try {
      const profileUpdates = await this.enrichUserProfile(input);
      result.userProfileUpdates.push(...profileUpdates);
    } catch (err: any) {
      const msg = `User profile enrichment failed: ${err.message}`;
      console.error(`❌ [Knowledge Enrichment] ${msg}`);
      result.errors.push(msg);
    }

    // Level 2: Knowledge Graph
    try {
      const kgUpdates = await this.enrichKnowledgeGraph(input);
      result.knowledgeGraphUpdates.push(...kgUpdates);
    } catch (err: any) {
      const msg = `Knowledge graph enrichment failed: ${err.message}`;
      console.error(`❌ [Knowledge Enrichment] ${msg}`);
      result.errors.push(msg);
    }

    // Mark as processed (idempotency stamp)
    try {
      await storage.atomicMergeJourneyProgress(input.projectId, {
        knowledgeEnrichment: {
          processedAt: new Date().toISOString(),
          userProfileUpdates: result.userProfileUpdates.length,
          knowledgeGraphUpdates: result.knowledgeGraphUpdates.length,
          errors: result.errors.length,
        },
      });
    } catch {
      // Non-critical — next run will just re-enrich (idempotent)
    }

    return result;
  }

  // =========================================================================
  // Level 1: User Profile Enrichment
  // =========================================================================

  private async enrichUserProfile(input: EnrichmentInput): Promise<string[]> {
    const updates: string[] = [];

    try {
      const user = await storage.getUser(input.userId);
      if (!user) return updates;

      const userUpdates: Record<string, any> = {};

      // 1a. Set industry if user hasn't specified one
      if (!user.industry && input.industry && input.industry !== 'general') {
        userUpdates.industry = input.industry;
        updates.push(`Set industry=${input.industry}`);
      }

      // 1b. Increment journey completions counter
      const existingCompletions = (user.journeyCompletions ?? {}) as Record<string, any>;
      const completionCount = (existingCompletions.totalCompleted || 0) + 1;
      const journeyCompletions: Record<string, any> = {
        ...existingCompletions,
        totalCompleted: completionCount,
        lastCompletedAt: new Date().toISOString(),
      };

      // 1c. Track analysis type preferences (how many times each type was used)
      const analysisPreferences = { ...(existingCompletions.analysisPreferences || {}) } as Record<string, number>;
      for (const aType of input.analysisTypes) {
        analysisPreferences[aType] = (analysisPreferences[aType] || 0) + 1;
      }
      journeyCompletions.analysisPreferences = analysisPreferences;
      updates.push(`Incremented journey completions to ${completionCount}`);

      // 1d. Track column naming patterns (top 20 most-used column names)
      const columnPatterns = { ...(existingCompletions.columnPatterns || {}) } as Record<string, number>;
      for (const col of input.columnNames) {
        const normalized = col.toLowerCase().trim();
        if (normalized.length > 0 && normalized.length <= 100) {
          columnPatterns[normalized] = (columnPatterns[normalized] || 0) + 1;
        }
      }
      // Keep only top 20 by frequency
      const sortedColumns = Object.entries(columnPatterns)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      journeyCompletions.columnPatterns = Object.fromEntries(sortedColumns);

      userUpdates.journeyCompletions = journeyCompletions;

      // Apply user profile updates
      if (Object.keys(userUpdates).length > 0) {
        await storage.updateUser(input.userId, userUpdates as any);
        console.log(`📚 [User Profile] Updated: ${updates.join(', ')}`);
      }
    } catch (err: any) {
      updates.push(`Error: ${err.message}`);
    }

    return updates;
  }

  // =========================================================================
  // Level 2: Generic Knowledge Graph Enrichment
  // =========================================================================

  private async enrichKnowledgeGraph(input: EnrichmentInput): Promise<string[]> {
    const updates: string[] = [];

    if (input.industry === 'general' || !input.industry) {
      // Cannot enrich without a meaningful industry context
      return updates;
    }

    // 2a. Enrich industry node with new use cases from user questions
    try {
      const newUseCases = this.extractUseCasesFromQuestions(input.userQuestions, input.userGoals);
      if (newUseCases.length > 0) {
        const updated = await this.kgService.mergeNodeAttributes('industry', input.industry, {
          commonUseCases: newUseCases,
        });
        if (updated) {
          updates.push(`Enriched industry "${input.industry}" with ${newUseCases.length} new use cases`);
        }
      }
    } catch (err: any) {
      updates.push(`Industry enrichment error: ${err.message}`);
    }

    // 2b. Track analysis effectiveness per industry
    try {
      const effectivenessUpdates = await this.trackAnalysisEffectiveness(input);
      updates.push(...effectivenessUpdates);
    } catch (err: any) {
      updates.push(`Analysis effectiveness error: ${err.message}`);
    }

    // 2c. Create question → analysis type pattern nodes
    try {
      const patternUpdates = await this.trackQuestionPatterns(input);
      updates.push(...patternUpdates);
    } catch (err: any) {
      updates.push(`Question pattern error: ${err.message}`);
    }

    // 2d. Track column → industry associations
    try {
      const columnUpdates = await this.trackColumnIndustryAssociations(input);
      updates.push(...columnUpdates);
    } catch (err: any) {
      updates.push(`Column association error: ${err.message}`);
    }

    if (updates.length > 0) {
      console.log(`📚 [Knowledge Graph] ${updates.length} enrichments for industry="${input.industry}"`);
    }

    return updates;
  }

  /**
   * Extract use case phrases from user questions and goals.
   * Keeps them short (max 80 chars) and deduplicates.
   */
  private extractUseCasesFromQuestions(questions: string[], goals: string[]): string[] {
    const useCases: string[] = [];
    const allTexts = [...questions, ...goals];

    for (const text of allTexts) {
      if (!text || typeof text !== 'string') continue;

      // Extract meaningful use-case phrases (trim to reasonable length)
      const cleaned = text.trim();
      if (cleaned.length >= 10 && cleaned.length <= 80) {
        useCases.push(cleaned);
      } else if (cleaned.length > 80) {
        // Truncate at word boundary
        const truncated = cleaned.slice(0, 80).replace(/\s+\S*$/, '').trim();
        if (truncated.length >= 10) {
          useCases.push(truncated);
        }
      }
    }

    // Limit to 5 new use cases per enrichment to avoid noise
    return useCases.slice(0, 5);
  }

  /**
   * Track which analysis types are effective for which industries.
   * Creates/strengthens EFFECTIVE_ANALYSIS edges between industry and analysis_type nodes.
   */
  private async trackAnalysisEffectiveness(input: EnrichmentInput): Promise<string[]> {
    const updates: string[] = [];

    if (input.analysisTypes.length === 0) return updates;

    // Get or create the industry node
    const industryNode = await this.kgService.getOrCreateNodeWithMerge({
      type: 'industry',
      label: input.industry,
      summary: `${input.industry} industry knowledge`,
      attributes: {},
    });

    for (const analysisType of input.analysisTypes) {
      // Get or create the analysis_type node
      const analysisNode = await this.kgService.getOrCreateNodeWithMerge({
        type: 'analysis_type',
        label: analysisType,
        summary: `${analysisType} analysis method`,
        attributes: {
          totalRuns: 1,
          lastUsedAt: new Date().toISOString(),
        },
      });

      // Strengthen the industry → analysis_type edge
      // Weight represents cumulative normalized quality (quality/10 so weight stays manageable)
      const qualityIncrement = Math.max(0, Math.min(1, (input.qualityScore || 0) / 100));
      await this.kgService.incrementEdgeWeight(
        industryNode.id,
        analysisNode.id,
        'EFFECTIVE_ANALYSIS',
        qualityIncrement,
        {
          lastQualityScore: input.qualityScore,
          lastInsightCount: input.insightCount,
          lastUsedAt: new Date().toISOString(),
        },
      );

      updates.push(`Strengthened ${input.industry}→${analysisType} edge (quality: ${input.qualityScore})`);
    }

    return updates;
  }

  /**
   * Track question → analysis type patterns.
   * When a question about "attrition" leads to successful "correlation_analysis",
   * future users asking similar questions get better recommendations.
   */
  private async trackQuestionPatterns(input: EnrichmentInput): Promise<string[]> {
    const updates: string[] = [];

    // Use questionAnswerMapping if available — more precise
    if (input.questionAnswerMapping && input.questionAnswerMapping.length > 0) {
      for (const qam of input.questionAnswerMapping) {
        const keywords = this.extractQuestionKeywords(qam.questionText);
        const analyses = qam.recommendedAnalyses || input.analysisTypes;

        for (const keyword of keywords) {
          const patternNode = await this.kgService.getOrCreateNodeWithMerge({
            type: 'question_pattern',
            label: keyword,
            summary: `Questions about ${keyword}`,
            attributes: {
              sampleQuestions: [qam.questionText.slice(0, 100)],
              industry: input.industry,
              occurrenceCount: 1,
            },
          });

          for (const analysis of analyses) {
            const analysisNode = await this.kgService.getOrCreateNodeWithMerge({
              type: 'analysis_type',
              label: analysis,
              attributes: {},
            });

            await this.kgService.incrementEdgeWeight(
              patternNode.id,
              analysisNode.id,
              'ANSWERED_BY',
              1,
              {
                industry: input.industry,
                lastQualityScore: input.qualityScore,
                lastUsedAt: new Date().toISOString(),
              },
            );
          }

          updates.push(`Created question_pattern "${keyword}" → ${analyses.join(', ')}`);
        }
      }
    } else {
      // Fallback: extract keywords from all questions and link to all analysis types
      const allKeywords = new Set<string>();
      for (const q of input.userQuestions) {
        for (const kw of this.extractQuestionKeywords(q)) {
          allKeywords.add(kw);
        }
      }

      for (const keyword of allKeywords) {
        const patternNode = await this.kgService.getOrCreateNodeWithMerge({
          type: 'question_pattern',
          label: keyword,
          summary: `Questions about ${keyword}`,
          attributes: {
            industry: input.industry,
            occurrenceCount: 1,
          },
        });

        for (const analysis of input.analysisTypes) {
          const analysisNode = await this.kgService.getOrCreateNodeWithMerge({
            type: 'analysis_type',
            label: analysis,
            attributes: {},
          });

          await this.kgService.incrementEdgeWeight(
            patternNode.id,
            analysisNode.id,
            'ANSWERED_BY',
            1,
            { industry: input.industry },
          );
        }

        updates.push(`Linked question_pattern "${keyword}" → ${input.analysisTypes.join(', ')}`);
      }
    }

    return updates;
  }

  /**
   * Track which column name patterns appear with which industries.
   * Helps future projects auto-detect industry from column names.
   */
  private async trackColumnIndustryAssociations(input: EnrichmentInput): Promise<string[]> {
    const updates: string[] = [];

    if (input.columnNames.length === 0) return updates;

    // Detect industry-signaling columns
    const signalColumns: string[] = [];
    for (const col of input.columnNames) {
      for (const signal of COLUMN_INDUSTRY_SIGNALS) {
        if (signal.pattern.test(col) && signal.industry === input.industry) {
          signalColumns.push(col.toLowerCase());
          break;
        }
      }
    }

    if (signalColumns.length === 0) return updates;

    // Create/update a column_pattern node for this industry's column signature
    const patternLabel = `${input.industry}_columns`;
    await this.kgService.getOrCreateNodeWithMerge({
      type: 'column_pattern',
      label: patternLabel,
      summary: `Common column names for ${input.industry} data`,
      attributes: {
        columns: signalColumns,
        sampleCount: 1,
      },
    });

    // Link to industry node
    const industryNode = await this.kgService.getOrCreateNodeWithMerge({
      type: 'industry',
      label: input.industry,
      attributes: {},
    });

    const columnNode = await this.kgService.getOrCreateNodeWithMerge({
      type: 'column_pattern',
      label: patternLabel,
      attributes: {},
    });

    await this.kgService.incrementEdgeWeight(
      industryNode.id,
      columnNode.id,
      'HAS_COLUMN_PATTERN',
      1,
      { lastSeenColumns: signalColumns.slice(0, 10) },
    );

    updates.push(`Tracked ${signalColumns.length} industry-signaling columns for "${input.industry}"`);

    return updates;
  }

  /**
   * Extract structured keywords from a question text using deterministic patterns.
   */
  private extractQuestionKeywords(questionText: string): string[] {
    if (!questionText || typeof questionText !== 'string') return [];

    const keywords: string[] = [];
    for (const { pattern, keyword } of QUESTION_KEYWORD_PATTERNS) {
      if (pattern.test(questionText)) {
        keywords.push(keyword);
      }
    }
    return keywords;
  }
}
