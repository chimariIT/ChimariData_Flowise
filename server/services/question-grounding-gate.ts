export type QuestionAnswerability = 'answerable' | 'partial' | 'data_gap';

export interface ContextLingoDefinition {
  term: string;
  definition?: string;
  metricHint?: string;
  dimensionHint?: string;
}

export interface LingoExpansionRule {
  label: string;
  patterns: RegExp[];
  expansions: Array<{
    text: string;
    metricHint?: string;
    dimensionHint?: string;
  }>;
}

export interface QuestionDecompositionLayer {
  id: string;
  parentId: string | null;
  depth: number;
  text: string;
  expansionType: 'root' | 'multi_part' | 'lingo' | 'context_lingo';
  rule?: string;
  metricHint?: string;
  dimensionHint?: string;
  children: string[];
}

export interface QuestionDecompositionResult {
  layers: QuestionDecompositionLayer[];
  leafNodes: QuestionDecompositionLayer[];
  layerCount: number;
  leafCount: number;
}

export interface RequiredElementLike {
  elementId?: string;
  elementName?: string;
  dataType?: string;
  sourceAvailable?: boolean;
}

export interface QuestionMappingLike {
  questionId: string;
  questionText: string;
  requiredDataElements?: string[];
  recommendedAnalyses?: string[];
  transformationsNeeded?: string[];
  decomposition?: any;
  answerability?: QuestionAnswerability;
  answerabilityBlockers?: string[];
}

export interface QuestionGroundingGateSummary {
  totalQuestions: number;
  answerableQuestions: number;
  partialQuestions: number;
  dataGapQuestions: number;
  blockedByMetric: number;
  blockedByDimension: number;
}

const DEFAULT_LINGO_RULES: LingoExpansionRule[] = [
  {
    label: 'leaky_bucket',
    patterns: [/\bleaky[\s_-]+bucket\b/i, /\bleak(age)?\b/i, /\bdrop[\s_-]?off\b/i],
    expansions: [
      {
        text: 'At which funnel stage do we lose the most conversions?',
        metricHint: 'conversion rate',
        dimensionHint: 'funnel stage',
      },
      {
        text: 'Which channel or segment has the highest drop-off rate?',
        metricHint: 'conversion rate',
        dimensionHint: 'channel',
      },
    ],
  },
  {
    label: 'empty_calories',
    patterns: [/\bempty[\s_-]+calories\b/i, /\bvanity[\s_-]+metric/i, /\blow[\s_-]+quality[\s_-]+lead/i],
    expansions: [
      {
        text: 'Which sources produce high volume but low conversion quality?',
        metricHint: 'conversion rate',
        dimensionHint: 'source',
      },
    ],
  },
  {
    label: 'north_star',
    patterns: [/\bnorth[\s_-]+star\b/i],
    expansions: [
      {
        text: 'Which metric best predicts sustained business growth?',
        metricHint: 'retention rate',
        dimensionHint: 'customer segment',
      },
    ],
  },
];

const DEDUPE_LIMIT = 30;

const normalizeText = (value: string): string => value.toLowerCase().trim().replace(/\s+/g, ' ');

const dedupeStrings = (values: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const cleaned = (value || '').trim();
    if (!cleaned) continue;
    const key = normalizeText(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
    if (out.length >= DEDUPE_LIMIT) break;
  }
  return out;
};

const groupedQuestionRegex =
  /\b(by|per|across|for each|each|segment|channel|department|team|region|stage|source|campaign)\b/i;

const numericTypeRegex = /\b(numeric|number|float|integer|decimal|double|int)\b/i;
const dimensionTypeRegex = /\b(categorical|category|string|text|datetime|date|time|timestamp|boolean|bool)\b/i;

export const splitMultiPartQuestion = (question: string): string[] => {
  const cleaned = (question || '').replace(/\s+/g, ' ').trim().replace(/[.]+$/g, '');
  if (!cleaned) return [];

  let parts = [cleaned];
  const splitPatterns = [
    /\s*;\s*/i,
    /\?\s+/i,
    /\s+\b(?:then|also|plus|as well as|followed by)\b\s+/i,
  ];

  for (const pattern of splitPatterns) {
    const nextParts: string[] = [];
    for (const part of parts) {
      nextParts.push(...part.split(pattern).map(p => p.trim()).filter(Boolean));
    }
    parts = nextParts.length > 0 ? nextParts : parts;
  }

  if (parts.length === 1 && /\s+\band\b\s+/i.test(cleaned)) {
    const andSplit = cleaned.split(/\s+\band\b\s+/i).map(p => p.trim()).filter(Boolean);
    if (andSplit.length >= 2 && andSplit.every(p => p.split(/\s+/).length >= 3)) {
      parts = andSplit;
    }
  }

  return dedupeStrings(parts.filter(p => p.split(/\s+/).length >= 3));
};

export const buildContextLingoRulesFromDefinitions = (
  definitions: ContextLingoDefinition[],
): LingoExpansionRule[] => {
  const rules: LingoExpansionRule[] = [];
  const seen = new Set<string>();

  for (const definition of definitions || []) {
    const term = (definition.term || '').trim();
    if (term.length < 3) continue;
    const key = normalizeText(term);
    if (seen.has(key)) continue;
    seen.add(key);

    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s_-]+');
    const expansions: Array<{ text: string; metricHint?: string; dimensionHint?: string }> = [];
    const contextText = definition.definition?.trim();
    if (contextText) {
      expansions.push({
        text: `Interpret "${term}" as: ${contextText}. Which available metric best represents it?`,
        metricHint: definition.metricHint,
        dimensionHint: definition.dimensionHint,
      });
      expansions.push({
        text: `How does "${term}" vary by segment?`,
        metricHint: definition.metricHint,
        dimensionHint: definition.dimensionHint,
      });
    } else {
      expansions.push({
        text: `What metric in this dataset best represents "${term}"?`,
        metricHint: definition.metricHint,
        dimensionHint: definition.dimensionHint,
      });
    }

    rules.push({
      label: `context_${term.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
      patterns: [new RegExp(`\\b${escaped}\\b`, 'i')],
      expansions,
    });
  }

  return rules;
};

const expandLingo = (
  fragment: string,
  contextRules: LingoExpansionRule[] = [],
): Array<{
  text: string;
  expansionType: 'lingo' | 'context_lingo';
  rule: string;
  metricHint?: string;
  dimensionHint?: string;
}> => {
  const source = [...DEFAULT_LINGO_RULES, ...contextRules];
  const expansions: Array<{
    text: string;
    expansionType: 'lingo' | 'context_lingo';
    rule: string;
    metricHint?: string;
    dimensionHint?: string;
  }> = [];

  for (const rule of source) {
    if (!rule.patterns.some(pattern => pattern.test(fragment))) continue;
    for (const expansion of rule.expansions) {
      const expansionType = rule.label.startsWith('context_') ? 'context_lingo' : 'lingo';
      expansions.push({
        text: expansion.text,
        expansionType,
        rule: rule.label,
        metricHint: expansion.metricHint,
        dimensionHint: expansion.dimensionHint,
      });
    }
  }

  return expansions;
};

export const buildRecursiveQuestionLayers = (
  question: string,
  params?: { maxDepth?: number; maxNodes?: number; contextRules?: LingoExpansionRule[] },
): QuestionDecompositionResult => {
  const rootText = (question || '').replace(/\s+/g, ' ').trim();
  if (!rootText) {
    return { layers: [], leafNodes: [], layerCount: 0, leafCount: 0 };
  }

  const maxDepth = Math.max(1, params?.maxDepth || 3);
  const maxNodes = Math.max(3, params?.maxNodes || 24);
  const layers: QuestionDecompositionLayer[] = [
    {
      id: 'L0',
      parentId: null,
      depth: 0,
      text: rootText,
      expansionType: 'root',
      children: [],
    },
  ];

  const queue: number[] = [0];
  while (queue.length > 0 && layers.length < maxNodes) {
    const currentIndex = queue.shift() as number;
    const current = layers[currentIndex];
    if (current.depth >= maxDepth) continue;

    const candidates: Array<{
      text: string;
      expansionType: 'multi_part' | 'lingo' | 'context_lingo';
      rule: string;
      metricHint?: string;
      dimensionHint?: string;
    }> = [];

    const multiParts = splitMultiPartQuestion(current.text);
    if (multiParts.length > 1) {
      for (const part of multiParts) {
        candidates.push({
          text: part,
          expansionType: 'multi_part',
          rule: 'split',
        });
      }
    }

    candidates.push(...expandLingo(current.text, params?.contextRules || []));

    const localSeen = new Set<string>();
    for (const candidate of candidates) {
      const candidateText = (candidate.text || '').trim();
      if (!candidateText) continue;
      const candidateNorm = normalizeText(candidateText);
      if (candidateNorm === normalizeText(current.text)) continue;
      if (localSeen.has(candidateNorm)) continue;
      localSeen.add(candidateNorm);

      const id = `L${layers.length}`;
      layers.push({
        id,
        parentId: current.id,
        depth: current.depth + 1,
        text: candidateText,
        expansionType: candidate.expansionType,
        rule: candidate.rule,
        metricHint: candidate.metricHint,
        dimensionHint: candidate.dimensionHint,
        children: [],
      });
      current.children.push(id);
      queue.push(layers.length - 1);
      if (layers.length >= maxNodes) break;
    }
  }

  const leafNodes = layers.filter(layer => layer.children.length === 0);
  return {
    layers,
    leafNodes: leafNodes.length > 0 ? leafNodes : [layers[0]],
    layerCount: layers.length,
    leafCount: leafNodes.length > 0 ? leafNodes.length : 1,
  };
};

export const evaluateQuestionAnswerability = (
  questionText: string,
  requiredElementIds: string[],
  requiredElementLookup: Map<string, RequiredElementLike>,
): {
  answerability: QuestionAnswerability;
  blockers: string[];
  groupedRequest: boolean;
  confidence: number;
} => {
  const blockers: string[] = [];
  const groupedRequest = groupedQuestionRegex.test(questionText || '');

  const linkedElements = (requiredElementIds || [])
    .map(elementId => requiredElementLookup.get(elementId))
    .filter(Boolean) as RequiredElementLike[];
  const hasLookupCoverage = linkedElements.length > 0;
  const hasRequiredIds = (requiredElementIds || []).length > 0;

  const hasNumericMetric = hasLookupCoverage
    ? linkedElements.some(element => {
      const dataType = (element.dataType || '').toLowerCase();
      return numericTypeRegex.test(dataType);
    })
    : hasRequiredIds;

  const hasDimension = hasLookupCoverage
    ? linkedElements.some(element => {
      const dataType = (element.dataType || '').toLowerCase();
      return dimensionTypeRegex.test(dataType);
    })
    : (groupedRequest ? (requiredElementIds || []).length > 1 : true);

  if (!hasNumericMetric) blockers.push('metric_not_grounded');
  if (groupedRequest && !hasDimension) blockers.push('dimension_not_grounded');

  let answerability: QuestionAnswerability = 'answerable';
  if (blockers.length > 0) {
    answerability = blockers.includes('metric_not_grounded') ? 'data_gap' : 'partial';
  }

  let confidence = 0.35;
  if (answerability === 'answerable') confidence = 0.86;
  else if (answerability === 'partial') confidence = 0.62;

  return {
    answerability,
    blockers,
    groupedRequest,
    confidence,
  };
};

export const applyQuestionGroundingGate = <T extends QuestionMappingLike>(
  mappings: T[],
  requiredElements: RequiredElementLike[],
): {
  mappings: Array<T & { answerability: QuestionAnswerability; answerabilityBlockers: string[] }>;
  summary: QuestionGroundingGateSummary;
} => {
  const lookup = new Map<string, RequiredElementLike>();
  for (const element of requiredElements || []) {
    const key = element.elementId || '';
    if (!key) continue;
    lookup.set(key, element);
  }

  const gatedMappings = (mappings || []).map(mapping => {
    const requiredIds = dedupeStrings((mapping.requiredDataElements || []).map(String));
    const existingBlockers = dedupeStrings((mapping.answerabilityBlockers || []).map(String));
    const evaluated = evaluateQuestionAnswerability(mapping.questionText, requiredIds, lookup);
    const blockers = dedupeStrings([...existingBlockers, ...evaluated.blockers]);
    const answerability: QuestionAnswerability =
      mapping.answerability === 'data_gap' || blockers.includes('metric_not_grounded')
        ? 'data_gap'
        : blockers.length > 0
          ? 'partial'
          : (mapping.answerability || evaluated.answerability || 'partial');

    return {
      ...mapping,
      answerability,
      answerabilityBlockers: blockers,
    };
  });

  const summary: QuestionGroundingGateSummary = {
    totalQuestions: gatedMappings.length,
    answerableQuestions: gatedMappings.filter(item => item.answerability === 'answerable').length,
    partialQuestions: gatedMappings.filter(item => item.answerability === 'partial').length,
    dataGapQuestions: gatedMappings.filter(item => item.answerability === 'data_gap').length,
    blockedByMetric: gatedMappings.filter(item => item.answerabilityBlockers.includes('metric_not_grounded')).length,
    blockedByDimension: gatedMappings.filter(item => item.answerabilityBlockers.includes('dimension_not_grounded')).length,
  };

  return { mappings: gatedMappings, summary };
};
