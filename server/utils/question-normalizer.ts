/**
 * Question Normalizer Utility
 *
 * Ensures questions are always string arrays, handling cases where
 * questions may be stored as objects (e.g., {text: "...", id: "..."})
 * instead of plain strings.
 *
 * ENHANCED: Includes spell/grammar correction for goals and questions
 *
 * Created: December 11, 2025
 * Updated: January 7, 2026 - Added spell/grammar correction
 * Issue: question.toLowerCase is not a function (backend crash)
 */

// ============================================================
// COMMON TEXT CORRECTIONS
// ============================================================

/**
 * Common typos and grammatical errors to auto-correct
 */
const COMMON_CORRECTIONS: Record<string, string> = {
  // Common word fusions (typos from missing spaces)
  'ofthe': 'of the',
  'inthe': 'in the',
  'tothe': 'to the',
  'forthe': 'for the',
  'onthe': 'on the',
  'atthe': 'at the',
  'bythe': 'by the',
  'fromthe': 'from the',
  'withthe': 'with the',
  'andthe': 'and the',
  'isthe': 'is the',
  'arethe': 'are the',
  'wasthe': 'was the',
  'werethe': 'were the',
  'hasthe': 'has the',
  'havethe': 'have the',
  'thatthe': 'that the',
  'whichthe': 'which the',

  // Business/analytics common typos
  'employe': 'employee',
  'employess': 'employees',
  'employes': 'employees',
  'engagment': 'engagement',
  'engagements': 'engagement',
  'performace': 'performance',
  'performence': 'performance',
  'satifaction': 'satisfaction',
  'satisfation': 'satisfaction',
  'anaylsis': 'analysis',
  'anaylses': 'analyses',
  'anlysis': 'analysis',
  'deparment': 'department',
  'departement': 'department',
  'managment': 'management',
  'managament': 'management',
  'organziation': 'organization',
  'organiztion': 'organization',
  'retension': 'retention',
  'retenion': 'retention',
  'turnever': 'turnover',
  'turnove': 'turnover',
  'effeciency': 'efficiency',
  'efficency': 'efficiency',
  'productivty': 'productivity',
  'productvity': 'productivity',
  'compnay': 'company',
  'comapny': 'company',
  'averge': 'average',
  'avarage': 'average',
  'occurence': 'occurrence',
  'occurrance': 'occurrence',
  'recieve': 'receive',
  'recieved': 'received',
  'acheive': 'achieve',
  'achive': 'achieve',
  'seperately': 'separately',
  'seperate': 'separate',
  'definitly': 'definitely',
  'definately': 'definitely',
  'accomodate': 'accommodate',
  'acomodate': 'accommodate',
  'comparision': 'comparison',
  'comparasion': 'comparison',
  'calender': 'calendar',
  'calander': 'calendar',
  'recommand': 'recommend',
  'recomend': 'recommend',
  'occured': 'occurred',
  'occure': 'occur',
  'postion': 'position',
  'positon': 'position'
};

/**
 * Patterns for grammatical fixes
 */
const GRAMMAR_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Fix double spaces
  { pattern: /\s{2,}/g, replacement: ' ' },

  // Fix space before punctuation
  { pattern: /\s+([.,!?;:])/g, replacement: '$1' },

  // Fix missing space after punctuation
  { pattern: /([.,!?;:])([A-Za-z])/g, replacement: '$1 $2' },

  // Fix common grammatical issues
  { pattern: /\bi\b/g, replacement: 'I' }, // Capitalize standalone 'i'
  { pattern: /\bim\b/gi, replacement: "I'm" },
  { pattern: /\bdont\b/gi, replacement: "don't" },
  { pattern: /\bdoesnt\b/gi, replacement: "doesn't" },
  { pattern: /\bcant\b/gi, replacement: "can't" },
  { pattern: /\bwont\b/gi, replacement: "won't" },
  { pattern: /\bisnt\b/gi, replacement: "isn't" },
  { pattern: /\barent\b/gi, replacement: "aren't" },
  { pattern: /\bwasnt\b/gi, replacement: "wasn't" },
  { pattern: /\bwerent\b/gi, replacement: "weren't" },
  { pattern: /\bhasnt\b/gi, replacement: "hasn't" },
  { pattern: /\bhavent\b/gi, replacement: "haven't" },

  // Ensure questions end with question mark if they look like questions
  { pattern: /^(what|who|where|when|why|how|which|whose|whom|is|are|was|were|do|does|did|can|could|will|would|should|shall|have|has|had)\b.*[^?]$/i, replacement: '$&?' }
];

/**
 * Apply text corrections to input text
 * CRITICAL: This runs BEFORE data element extraction to ensure accuracy
 */
export function correctText(text: string, logCorrections: boolean = false): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let corrected = text.trim();
  const corrections: string[] = [];

  // Apply word corrections (case-insensitive word boundary match)
  for (const [typo, correction] of Object.entries(COMMON_CORRECTIONS)) {
    const pattern = new RegExp(`\\b${typo}\\b`, 'gi');
    if (pattern.test(corrected)) {
      corrections.push(`"${typo}" → "${correction}"`);
      corrected = corrected.replace(pattern, correction);
    }
  }

  // Apply grammar patterns
  for (const { pattern, replacement } of GRAMMAR_PATTERNS) {
    const before = corrected;
    corrected = corrected.replace(pattern, replacement);
    if (before !== corrected && logCorrections) {
      corrections.push(`Grammar fix applied`);
    }
  }

  // Ensure first letter is capitalized
  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }

  // Log corrections if enabled
  if (logCorrections && corrections.length > 0) {
    console.log(`✏️ [Spell Check] Corrected: ${corrections.join(', ')}`);
  }

  return corrected;
}

/**
 * Clean and standardize element names
 * Fixes issues like "Ofthe Survey Questions" → "Of The Survey Questions"
 */
export function standardizeElementName(name: string): string {
  if (!name || typeof name !== 'string') {
    return name;
  }

  let cleaned = name.trim();

  // Fix common word fusions in element names
  for (const [typo, correction] of Object.entries(COMMON_CORRECTIONS)) {
    const pattern = new RegExp(`\\b${typo}\\b`, 'gi');
    cleaned = cleaned.replace(pattern, correction);
  }

  // Fix double spaces
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  // Capitalize first letter of each word (Title Case)
  cleaned = cleaned
    .split(' ')
    .map(word => {
      // Keep common articles/prepositions lowercase (except at start)
      const lowerWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'with'];
      if (lowerWords.includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Always capitalize first word
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Normalize a single question to a string
 * @param logCorrections - If true, log any spell/grammar corrections made
 */
export function normalizeQuestion(question: unknown, logCorrections: boolean = false): string {
  if (typeof question === 'string') {
    return correctText(question.trim(), logCorrections);
  }
  if (question && typeof question === 'object') {
    const q = question as Record<string, unknown>;
    // Try common object shapes: {text: ...}, {question: ...}, {content: ...}, {value: ...}
    const text = q.text || q.question || q.content || q.value || q.label;
    if (typeof text === 'string') {
      return correctText(text.trim(), logCorrections);
    }
    // If no recognized property, try to stringify
    return correctText(String(text ?? '').trim(), logCorrections);
  }
  return correctText(String(question ?? '').trim(), logCorrections);
}

/**
 * Normalize an array of questions to string array
 * Handles: null, undefined, single string, array of strings, array of objects
 * @param logCorrections - If true, log any spell/grammar corrections made
 */
export function normalizeQuestions(questions: unknown, logCorrections: boolean = false): string[] {
  if (!questions) {
    return [];
  }

  // Single string passed
  if (typeof questions === 'string') {
    const trimmed = correctText(questions.trim(), logCorrections);
    return trimmed ? [trimmed] : [];
  }

  // Not an array - try to normalize single item
  if (!Array.isArray(questions)) {
    const normalized = normalizeQuestion(questions, logCorrections);
    return normalized ? [normalized] : [];
  }

  // Array - normalize each element and filter empty
  return questions
    .map(q => normalizeQuestion(q, logCorrections))
    .filter((q): q is string => q.length > 0);
}

/**
 * Safe toLowerCase for questions (won't crash on objects)
 */
export function safeQuestionLowerCase(question: unknown): string {
  return normalizeQuestion(question).toLowerCase();
}
