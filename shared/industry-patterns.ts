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

/**
 * Detect industry from combined text (goal + questions + project name).
 * Returns the first matching industry ID, or 'general' if no match.
 */
export function detectIndustryFromText(goal: string, questions: string, projectName?: string): string {
  const combined = `${goal} ${questions} ${projectName || ''}`.toLowerCase();

  for (const pattern of INDUSTRY_PATTERNS) {
    if (pattern.keywords.some(k => combined.includes(k))) {
      return pattern.id;
    }
  }

  return 'general';
}
