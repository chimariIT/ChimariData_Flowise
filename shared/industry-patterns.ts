/**
 * Industry detection patterns - shared between client and server.
 * Used to auto-detect the user's industry from their analysis goal and business questions.
 */

export interface IndustryPattern {
  id: string;
  label: string;
  keywords: string[];
}

export const INDUSTRY_PATTERNS: IndustryPattern[] = [
  {
    id: 'hr',
    label: 'HR / Employee Engagement',
    keywords: [
      'employee', 'engagement', 'workforce', 'hr', 'human resources',
      'turnover', 'retention', 'hiring', 'talent', 'staff', 'personnel',
      'satisfaction survey', 'performance review', 'training', 'onboarding',
      'attrition', 'workplace', 'team morale', 'employee experience'
    ]
  },
  {
    id: 'education',
    label: 'Education',
    keywords: [
      'student', 'education', 'school', 'university', 'college', 'academic',
      'graduation', 'enrollment', 'teacher', 'classroom', 'curriculum',
      'learning', 'course', 'grades', 'parent conference', 'semester'
    ]
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    keywords: [
      'patient', 'healthcare', 'hospital', 'clinical', 'medical',
      'readmission', 'treatment', 'diagnosis', 'health outcomes'
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    keywords: [
      'financial', 'investment', 'portfolio', 'risk', 'trading',
      'loan', 'credit', 'banking', 'roi', 'revenue', 'profit margin'
    ]
  },
  {
    id: 'retail',
    label: 'Retail',
    keywords: [
      'customer', 'sales', 'retail', 'ecommerce', 'conversion',
      'purchase', 'cart', 'order', 'shopping', 'lifetime value'
    ]
  },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    keywords: [
      'manufacturing', 'production', 'quality control', 'defect',
      'throughput', 'oee', 'supply chain', 'inventory'
    ]
  },
  {
    id: 'nonprofit',
    label: 'Non-Profit',
    keywords: [
      'nonprofit', 'non-profit', 'donor', 'fundraising', 'charity',
      'volunteer', 'grant', 'mission impact', 'beneficiary'
    ]
  }
];

/** Column-name keywords per industry (stronger signal than question text) */
const COLUMN_KEYWORDS: Record<string, string[]> = {
  hr: ['employee_id', 'department', 'hire_date', 'termination_date', 'job_title', 'salary', 'fte', 'headcount', 'payroll'],
  education: ['student_id', 'gpa', 'enrollment', 'semester', 'course_id', 'grade', 'faculty'],
  healthcare: ['patient_id', 'diagnosis', 'icd', 'cpt', 'readmission', 'treatment', 'ehr'],
  finance: ['account_id', 'balance', 'transaction', 'ledger', 'portfolio', 'credit_score', 'loan_amount'],
  retail: ['customer_id', 'product_id', 'order_id', 'cart', 'purchase_date', 'sku', 'price', 'quantity'],
  manufacturing: ['product_lot', 'defect', 'production_line', 'oee', 'batch', 'throughput', 'yield'],
  nonprofit: ['donor_id', 'donation', 'grant', 'volunteer', 'fundraising', 'beneficiary'],
  marketing: ['campaign', 'impression', 'click', 'ctr', 'cpc', 'ad_spend', 'conversion_rate', 'lead'],
};

export interface IndustryDetectionResult {
  industry: string;
  confidence: number;
  signals: number;
}

/**
 * Detect industry from combined text + optional column names.
 * Uses multi-signal scoring instead of first-match.
 * Column name matches are weighted 2x (stronger signal than question text).
 * Requires >= 2 total signals for non-general detection.
 *
 * Backward compatible: callers without columnNames get scored matching with 2-signal minimum.
 */
export function detectIndustryFromText(
  goal: string,
  questions: string,
  projectName?: string,
  columnNames?: string[]
): string {
  const result = detectIndustryWithConfidence(goal, questions, projectName, columnNames);
  return result.industry;
}

/**
 * Full detection with confidence score and signal count.
 */
export function detectIndustryWithConfidence(
  goal: string,
  questions: string,
  projectName?: string,
  columnNames?: string[]
): IndustryDetectionResult {
  const combined = `${goal} ${questions} ${projectName || ''}`.toLowerCase();
  const columnText = (columnNames || []).join(' ').toLowerCase();

  const scores: Array<{ id: string; textMatches: number; columnMatches: number; total: number }> = [];

  for (const pattern of INDUSTRY_PATTERNS) {
    const textMatches = pattern.keywords.filter(k => combined.includes(k)).length;
    const colKeywords = COLUMN_KEYWORDS[pattern.id] || [];
    const columnMatches = colKeywords.filter(k => columnText.includes(k)).length;
    const total = textMatches + columnMatches * 2; // Column matches weighted 2x

    if (total > 0) {
      scores.push({ id: pattern.id, textMatches, columnMatches, total });
    }
  }

  // Also check marketing (not in INDUSTRY_PATTERNS but in COLUMN_KEYWORDS)
  if (COLUMN_KEYWORDS.marketing) {
    const textMatches = ['marketing', 'campaign', 'ad spend', 'conversion', 'ctr', 'impression', 'click rate', 'seo', 'sem', 'social media']
      .filter(k => combined.includes(k)).length;
    const columnMatches = COLUMN_KEYWORDS.marketing.filter(k => columnText.includes(k)).length;
    const total = textMatches + columnMatches * 2;
    if (total > 0) {
      scores.push({ id: 'marketing', textMatches, columnMatches, total });
    }
  }

  // Sort by total score (highest first)
  scores.sort((a, b) => b.total - a.total);

  if (scores.length === 0) {
    return { industry: 'general', confidence: 0.3, signals: 0 };
  }

  const best = scores[0];

  // Require >= 2 total weighted signals for non-general detection
  if (best.total < 2) {
    return { industry: 'general', confidence: 0.4, signals: best.total };
  }

  const confidence = Math.min(0.95, 0.3 + best.total * 0.12);
  return { industry: best.id, confidence, signals: best.total };
}
