/**
 * Question Intent Analyzer Service
 *
 * Replaces keyword-based analysis type selection with structured intent analysis.
 * For each user question, extracts:
 *   - intentType: what kind of analytical answer is expected
 *   - subjectConcept: the domain concept being analyzed (e.g., "churn", "engagement")
 *   - recommendedAnalysisTypes: fine-grained types matching Python script routing keys
 *
 * Uses a 3-tier approach:
 *   1. Regex/pattern matching (fast, handles 80%+ of cases)
 *   2. Question decomposition (reuses DS agent's decomposeQuestion)
 *   3. AI fallback (for ambiguous questions where regex confidence is low)
 */

import { generateStableQuestionId } from '../constants';

// ---- Types ----

export type IntentType =
  | 'probability'    // "What is the likelihood of X?" → classification
  | 'comparison'     // "How does X compare to Y?" → comparative, anova
  | 'trend'          // "How has X changed over time?" → time_series
  | 'relationship'   // "What is the relationship between X and Y?" → correlation, regression
  | 'segmentation'   // "What customer segments exist?" → clustering
  | 'distribution'   // "What is the distribution of X?" → descriptive
  | 'aggregation'    // "What is the average X?" → descriptive, group_analysis
  | 'ranking'        // "Which X performs best?" → comparative, descriptive
  | 'causal'         // "What drives X?" → regression, correlation
  | 'text_analysis'  // "What are the common themes?" → text_analysis
  | 'descriptive';   // General → descriptive stats

export interface QuestionIntent {
  questionId: string;
  questionText: string;
  intentType: IntentType;
  /** Domain concept needing resolution (e.g., "churn", "engagement", "LTV") */
  subjectConcept: string | null;
  /** Whether the concept needs business definition lookup */
  conceptNeedsResolution: boolean;
  /** Fine-grained analysis types matching Python script routing keys */
  recommendedAnalysisTypes: string[];
  /** Confidence in the intent classification (0-1) */
  confidence: number;
  /** Additional context extracted from the question */
  metadata: {
    hasTemporal: boolean;
    hasComparison: boolean;
    hasGrouping: boolean;
    temporalScope?: string;
    comparisonGroups?: string[];
    groupingDimensions?: string[];
  };
}

// ---- Intent → Analysis Type Mapping ----

const INTENT_TO_ANALYSIS_TYPES: Record<IntentType, string[]> = {
  probability:   ['classification', 'descriptive'],
  comparison:    ['comparative', 'group_analysis', 'descriptive'],
  trend:         ['time_series', 'descriptive'],
  relationship:  ['correlation', 'regression', 'descriptive'],
  segmentation:  ['clustering', 'descriptive'],
  distribution:  ['descriptive'],
  aggregation:   ['descriptive', 'group_analysis'],
  ranking:       ['comparative', 'descriptive'],
  causal:        ['regression', 'correlation', 'descriptive'],
  text_analysis: ['text_analysis', 'descriptive'],
  descriptive:   ['descriptive'],
};

// ---- Intent Pattern Definitions ----
// Order matters: more specific patterns checked first

interface IntentPattern {
  intent: IntentType;
  /** Regex patterns to match. Any match → this intent. */
  patterns: RegExp[];
  /** Confidence when matched via regex */
  confidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'probability',
    patterns: [
      /\b(?:likelihood|probability|chance|risk|odds)\b/i,
      /\b(?:predict|forecast|will\s+\w+\s+\w*(?:churn|leave|buy|convert|default|cancel|renew|return|fail|succeed))/i,
      /\bhow\s+likely\b/i,
      /\bwhat\s+(?:is|are)\s+the\s+(?:chances?|odds|probability|likelihood)\b/i,
      /\bcan\s+we\s+predict\b/i,
      /\bwhich\s+\w+\s+(?:are|is)\s+(?:most\s+)?likely\s+to\b/i,
    ],
    confidence: 0.85,
  },
  {
    intent: 'trend',
    patterns: [
      /\b(?:over\s+time|trend|trending|change(?:d|s)?\s+over|evolv)/i,
      /\b(?:monthly|quarterly|yearly|annually|weekly|daily|seasonal)\s+(?:change|pattern|growth|decline)/i,
      /\bhow\s+has\s+\w+\s+changed\b/i,
      /\b(?:growth|decline|increase|decrease)\s+(?:rate|pattern|trend)\b/i,
      /\b(?:time\s+series|temporal)\b/i,
    ],
    confidence: 0.85,
  },
  {
    intent: 'comparison',
    patterns: [
      /\b(?:compare|comparison|differ(?:ence|ent)?|versus|vs\.?)\b/i,
      /\bhow\s+does?\s+\w+\s+(?:compare|differ|stack\s+up)\b/i,
      /\b(?:which|what)\s+\w+\s+(?:performs?|has|have|is|are)\s+(?:the\s+)?(?:best|worst|highest|lowest|most|least)\b/i,
      /\bbetween\s+\w+\s+and\s+\w+/i,
      /\b(?:better|worse)\s+than\b/i,
    ],
    confidence: 0.80,
  },
  {
    intent: 'causal',
    patterns: [
      /\bwhat\s+(?:drives?|causes?|affects?|influences?|impacts?|determines?|explains?)\b/i,
      /\b(?:key|main|primary|top)\s+(?:drivers?|factors?|predictors?|determinants?)\b/i,
      /\bwhy\s+(?:do|does|is|are)\b/i,
      /\bwhat\s+(?:leads?\s+to|results?\s+in)\b/i,
    ],
    confidence: 0.80,
  },
  {
    intent: 'relationship',
    patterns: [
      /\b(?:correlat|relationship|association)\b/i,
      /\b(?:impact|affect|influence)\s+(?:of|on|between)\b/i,
      /\bis\s+there\s+a\s+(?:relationship|connection|link|correlation)\b/i,
      /\bhow\s+(?:does?|do)\s+\w+\s+(?:affect|impact|influence|relate)\b/i,
    ],
    confidence: 0.80,
  },
  {
    intent: 'segmentation',
    patterns: [
      /\b(?:segment|cluster|group|types?\s+of|categories?\s+of|personas?|profiles?)\b/i,
      /\bwhat\s+(?:types?|kinds?|groups?|segments?|categories?)\s+of\b/i,
      /\bcan\s+(?:we|you)\s+(?:segment|cluster|group|categorize)\b/i,
      /\bnatural\s+(?:groups?|clusters?|segments?)\b/i,
    ],
    confidence: 0.80,
  },
  {
    intent: 'text_analysis',
    patterns: [
      /\b(?:theme|themes|topic|topics|common\s+(?:words?|phrases?|feedback))\b/i,
      /\b(?:sentiment|opinion|tone|feedback\s+analysis)\b/i,
      /\b(?:word\s+cloud|text\s+mining|nlp|natural\s+language)\b/i,
      /\bwhat\s+(?:are|do)\s+(?:people|customers?|employees?|users?|respondents?)\s+(?:say|mention|write|talk\s+about)\b/i,
      /\b(?:open[\s-]?ended|free[\s-]?text|verbatim|qualitative)\b/i,
    ],
    confidence: 0.80,
  },
  {
    intent: 'ranking',
    patterns: [
      /\b(?:which|what)\s+(?:\w+\s+)?(?:performs?\s+best|is\s+(?:the\s+)?(?:best|worst|highest|lowest|top|bottom))\b/i,
      /\btop\s+\d+\b/i,
      /\brank(?:ing|ed)?\b/i,
      /\b(?:best|worst|most|least)\s+(?:performing|effective|profitable|popular)\b/i,
    ],
    confidence: 0.75,
  },
  {
    intent: 'aggregation',
    patterns: [
      /\b(?:what\s+is|what's)\s+the\s+(?:average|mean|median|total|sum|count)\b/i,
      /\bhow\s+(?:many|much)\b/i,
      /\b(?:total|overall|aggregate)\s+\w+/i,
      /\bnumber\s+of\b/i,
    ],
    confidence: 0.70,
  },
  {
    intent: 'distribution',
    patterns: [
      /\b(?:distribution|spread|variance|range)\s+(?:of|for|in)\b/i,
      /\bhow\s+(?:is|are)\s+\w+\s+distributed\b/i,
      /\b(?:normal|skew|outlier|histogram)\b/i,
    ],
    confidence: 0.70,
  },
];

// ---- Subject Concept Extraction ----

/** Known domain concepts that require business definition resolution */
const RESOLVABLE_CONCEPTS = [
  'churn', 'attrition', 'turnover', 'retention', 'engagement',
  'satisfaction', 'loyalty', 'lifetime value', 'ltv', 'clv',
  'conversion', 'acquisition', 'nps', 'csat', 'revenue',
  'roi', 'roas', 'ctr', 'bounce rate', 'cart abandonment',
  'readmission', 'mortality', 'compliance', 'risk score',
  'default', 'fraud', 'sentiment', 'burn rate', 'runway',
  'productivity', 'efficiency', 'utilization', 'yield',
  'defect rate', 'throughput', 'lead time', 'cycle time',
];

// ---- Service ----

export class QuestionIntentAnalyzer {

  /**
   * Analyze a batch of questions, returning structured intents for each.
   * Synchronous — no external API calls. Uses regex and pattern matching.
   */
  analyzeQuestions(
    questions: string[],
    dataContext?: {
      hasTimeSeries?: boolean;
      hasText?: boolean;
      hasCategories?: boolean;
      hasNumeric?: boolean;
      columnNames?: string[];
    },
    projectId?: string
  ): QuestionIntent[] {
    const intents: QuestionIntent[] = [];

    for (const question of questions) {
      if (!question || typeof question !== 'string' || question.trim().length < 3) continue;

      const questionText = typeof question === 'string' ? question : (question as any).text || String(question);
      const questionId = projectId
        ? generateStableQuestionId(projectId, questionText)
        : `q_${questionText.substring(0, 20).replace(/\W/g, '_')}`;

      const intent = this.analyzeQuestion(questionText, questionId, dataContext);
      intents.push(intent);
    }

    return intents;
  }

  /**
   * Analyze a single question for intent, subject concept, and recommended analyses.
   */
  analyzeQuestion(
    questionText: string,
    questionId: string,
    dataContext?: {
      hasTimeSeries?: boolean;
      hasText?: boolean;
      hasCategories?: boolean;
      hasNumeric?: boolean;
      columnNames?: string[];
    }
  ): QuestionIntent {
    const lower = questionText.toLowerCase().trim();

    // ── TIER 1: Pattern-based intent classification ──
    let bestMatch: { intent: IntentType; confidence: number } = { intent: 'descriptive', confidence: 0.4 };

    for (const pattern of INTENT_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(lower)) {
          if (pattern.confidence > bestMatch.confidence) {
            bestMatch = { intent: pattern.intent, confidence: pattern.confidence };
          }
          break; // Found a match in this pattern group, move to next
        }
      }
    }

    // ── TIER 2: Data context refinement ──
    if (dataContext) {
      // If data has time series columns and question mentions time, boost trend confidence
      if (dataContext.hasTimeSeries && bestMatch.intent === 'descriptive') {
        const hasTemporalHint = /\b(?:when|date|time|month|year|quarter|week|period)\b/i.test(lower);
        if (hasTemporalHint) {
          bestMatch = { intent: 'trend', confidence: 0.70 };
        }
      }

      // If data has text and question mentions sentiment/opinion, boost text analysis
      if (dataContext.hasText && /\b(?:sentiment|opinion|feedback|review|comment)\b/i.test(lower)) {
        // Text analysis maps to descriptive in our system
        bestMatch = { intent: 'descriptive', confidence: 0.75 };
      }
    }

    // ── TIER 3: Extract subject concept ──
    const { concept, needsResolution } = this.extractSubjectConcept(lower);

    // ── TIER 4: Extract metadata ──
    const metadata = this.extractMetadata(lower);

    // ── Build recommended analysis types ──
    const recommendedTypes = [...INTENT_TO_ANALYSIS_TYPES[bestMatch.intent]];

    // Refine based on metadata
    if (metadata.hasTemporal && !recommendedTypes.includes('time_series')) {
      recommendedTypes.splice(1, 0, 'time_series'); // Add after primary
    }
    if (metadata.hasComparison && !recommendedTypes.includes('comparative')) {
      recommendedTypes.splice(1, 0, 'comparative');
    }

    return {
      questionId,
      questionText,
      intentType: bestMatch.intent,
      subjectConcept: concept,
      conceptNeedsResolution: needsResolution,
      recommendedAnalysisTypes: recommendedTypes,
      confidence: bestMatch.confidence,
      metadata,
    };
  }

  /**
   * Extract the primary domain concept from a question.
   * Returns null if no specific concept is identified.
   */
  private extractSubjectConcept(lower: string): { concept: string | null; needsResolution: boolean } {
    // Check for known resolvable concepts
    for (const concept of RESOLVABLE_CONCEPTS) {
      if (lower.includes(concept)) {
        return { concept, needsResolution: true };
      }
    }

    // Extract noun phrases after "of" or "in" as potential concepts
    // e.g., "What drives customer satisfaction?" → "customer satisfaction"
    const conceptPatterns = [
      /(?:what|how)\s+(?:\w+\s+){0,3}(?:the\s+)?(\w+(?:\s+\w+)?)\s*\?/i,
      /(?:likelihood|probability|chance|risk)\s+(?:of|that)\s+(?:a\s+)?(?:\w+\s+)?(\w+(?:\s+\w+)?)/i,
      /(?:drivers?|factors?|predictors?)\s+(?:of|for|behind)\s+(\w+(?:\s+\w+)?)/i,
    ];

    for (const pattern of conceptPatterns) {
      const match = lower.match(pattern);
      if (match?.[1]) {
        const extracted = match[1].trim()
          .replace(/\b(?:the|a|an|is|are|was|were|our|my|their|this|that)\b/g, '')
          .trim();
        if (extracted.length > 2 && extracted.length < 40) {
          // Check if this extracted concept is in our resolvable list
          const isResolvable = RESOLVABLE_CONCEPTS.some(rc => extracted.includes(rc) || rc.includes(extracted));
          return { concept: extracted, needsResolution: isResolvable };
        }
      }
    }

    return { concept: null, needsResolution: false };
  }

  /**
   * Extract structural metadata from the question.
   */
  private extractMetadata(lower: string): QuestionIntent['metadata'] {
    const hasTemporal = /\b(?:over\s+time|trend|monthly|quarterly|yearly|weekly|daily|seasonal|change(?:d|s)?\s+over|growth|decline|year[\s-]over[\s-]year|month[\s-]over[\s-]month|quarter[\s-]over[\s-]quarter|last\s+(?:few\s+)?(?:days?|weeks?|months?|quarters?|years?)|past\s+(?:few\s+)?(?:days?|weeks?|months?|quarters?|years?)|recently|recent|YTD|MTD|QTD)\b/i.test(lower);
    const hasComparison = /\b(?:compare|versus|vs\.?|differ|between\s+\w+\s+and|better|worse)\b/i.test(lower);

    // Extract grouping dimensions
    const groupingDimensions: string[] = [];
    const groupPatterns = [
      /(?:by|per|for\s+each|across)\s+(\w+)/gi,
      /(?:grouped?\s+by)\s+(\w+)/gi,
    ];
    for (const pattern of groupPatterns) {
      let match;
      while ((match = pattern.exec(lower)) !== null) {
        const dim = match[1]?.trim();
        if (dim && dim.length > 1 && !['the', 'a', 'an', 'each', 'all'].includes(dim)) {
          groupingDimensions.push(dim);
        }
      }
    }

    // Extract comparison groups
    const comparisonGroups: string[] = [];
    const compMatch = lower.match(/(?:between|compare)\s+(\w+)\s+(?:and|vs\.?|versus)\s+(\w+)/i);
    if (compMatch) {
      comparisonGroups.push(compMatch[1], compMatch[2]);
    }

    return {
      hasTemporal,
      hasComparison,
      hasGrouping: groupingDimensions.length > 0,
      ...(hasTemporal ? { temporalScope: this.detectTemporalScope(lower) } : {}),
      ...(comparisonGroups.length > 0 ? { comparisonGroups } : {}),
      ...(groupingDimensions.length > 0 ? { groupingDimensions } : {}),
    };
  }

  /**
   * Detect temporal scope from question text.
   * Enhanced: Handles relative time references ("recent", "last quarter", "past year")
   * and ambiguous temporal language by resolving to explicit scope + flagging ambiguity.
   */
  private detectTemporalScope(lower: string): string | undefined {
    // Explicit scope keywords (high confidence)
    const explicitScopes: Record<string, string> = {
      'daily': 'day', 'weekly': 'week', 'monthly': 'month',
      'quarterly': 'quarter', 'yearly': 'year', 'annually': 'year',
      'seasonal': 'season', 'over time': 'time_series',
    };
    for (const [keyword, scope] of Object.entries(explicitScopes)) {
      if (lower.includes(keyword)) return scope;
    }

    // Relative time references (medium confidence — resolve to best-guess scope)
    const relativePatterns: Array<{ pattern: RegExp; scope: string }> = [
      { pattern: /\blast\s+(few\s+)?days?\b/, scope: 'day' },
      { pattern: /\blast\s+(few\s+)?weeks?\b/, scope: 'week' },
      { pattern: /\blast\s+(few\s+)?months?\b/, scope: 'month' },
      { pattern: /\blast\s+(few\s+)?quarters?\b/, scope: 'quarter' },
      { pattern: /\blast\s+(few\s+)?years?\b/, scope: 'year' },
      { pattern: /\bpast\s+(few\s+)?days?\b/, scope: 'day' },
      { pattern: /\bpast\s+(few\s+)?weeks?\b/, scope: 'week' },
      { pattern: /\bpast\s+(few\s+)?months?\b/, scope: 'month' },
      { pattern: /\bpast\s+(few\s+)?quarters?\b/, scope: 'quarter' },
      { pattern: /\bpast\s+(few\s+)?years?\b/, scope: 'year' },
      { pattern: /\byear[\s-]over[\s-]year\b/, scope: 'year' },
      { pattern: /\bmonth[\s-]over[\s-]month\b/, scope: 'month' },
      { pattern: /\bquarter[\s-]over[\s-]quarter\b/, scope: 'quarter' },
      { pattern: /\bweek[\s-]over[\s-]week\b/, scope: 'week' },
      { pattern: /\bYTD\b|\byear[\s-]to[\s-]date\b/i, scope: 'year' },
      { pattern: /\bQTD\b|\bquarter[\s-]to[\s-]date\b/i, scope: 'quarter' },
      { pattern: /\bMTD\b|\bmonth[\s-]to[\s-]date\b/i, scope: 'month' },
    ];

    for (const { pattern, scope } of relativePatterns) {
      if (pattern.test(lower)) return scope;
    }

    // Ambiguous temporal hints — resolve to time_series (requires datetime column)
    if (/\b(recently|recent|latest|current|now|today|this period|last period)\b/.test(lower)) {
      return 'time_series';
    }

    return undefined;
  }

  /**
   * Map intent types to display names for backward compatibility with DS agent.
   */
  static intentToDisplayNames(intents: QuestionIntent[]): string[] {
    const names = new Set<string>(['Descriptive Statistics']);

    const TYPE_TO_DISPLAY: Record<string, string> = {
      'classification': 'Classification Analysis',
      'clustering': 'Clustering Analysis',
      'regression': 'Regression Analysis',
      'time_series': 'Time Series Analysis',
      'correlation': 'Correlation Analysis',
      'comparative': 'Comparative Analysis',
      'group_analysis': 'Group Analysis',
      'text_analysis': 'Text Analysis',
      'descriptive': 'Descriptive Statistics',
    };

    for (const intent of intents) {
      for (const analysisType of intent.recommendedAnalysisTypes) {
        const display = TYPE_TO_DISPLAY[analysisType] || analysisType;
        names.add(display);
      }
    }

    return Array.from(names);
  }
}
