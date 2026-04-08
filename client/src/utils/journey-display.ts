/**
 * Journey Display Configuration
 *
 * Centralizes display flags per journey type so components can adapt
 * their UI without scattering `journeyType === 'non-tech'` checks everywhere.
 */

export type JourneyType = 'non-tech' | 'business' | 'technical' | 'consultation';

export type PlanViewMode = 'summary' | 'detailed' | 'full';

export interface JourneyDisplayConfig {
  /** Show raw JS/Python code blocks */
  showCode: boolean;
  /** Show formulas (business shows in context, non-tech hides) */
  showFormulas: boolean;
  /** Show pseudo-code blocks */
  showPseudoCode: boolean;
  /** Show technical method names like "regression", "k-means" */
  showMethodNames: boolean;
  /** Show source field names in <code> tags */
  showFieldsAsCode: boolean;
  /** Show detailed schema type info */
  showSchemaDetails: boolean;
  /** Show tool name badges ("pandas", "scipy") */
  showToolNames: boolean;
  /** Auto-approve data verification when quality > 80% */
  autoApproveQuality: boolean;
  /** Auto-apply recommended transformations */
  autoApplyTransforms: boolean;
  /** Audience options available for selection */
  allowedAudiences: string[];
  /** Pre-selected audience value */
  defaultAudience: string;
  /** How much plan detail to show */
  planViewMode: PlanViewMode;
  /** Communication style label */
  communicationStyle: 'plain-language' | 'executive' | 'technical' | 'consultation';
}

const NON_TECH_CONFIG: JourneyDisplayConfig = {
  showCode: false,
  showFormulas: false,
  showPseudoCode: false,
  showMethodNames: false,
  showFieldsAsCode: false,
  showSchemaDetails: false,
  showToolNames: false,
  autoApproveQuality: true,
  autoApplyTransforms: true,
  allowedAudiences: ['executive'],
  defaultAudience: 'executive',
  planViewMode: 'summary',
  communicationStyle: 'plain-language',
};

const BUSINESS_CONFIG: JourneyDisplayConfig = {
  showCode: false,
  showFormulas: true,
  showPseudoCode: false,
  showMethodNames: false,
  showFieldsAsCode: false,
  showSchemaDetails: false,
  showToolNames: false,
  autoApproveQuality: true,
  autoApplyTransforms: true,
  allowedAudiences: ['executive', 'business_ops', 'marketing'],
  defaultAudience: 'business_ops',
  planViewMode: 'summary',
  communicationStyle: 'executive',
};

const TECHNICAL_CONFIG: JourneyDisplayConfig = {
  showCode: true,
  showFormulas: true,
  showPseudoCode: true,
  showMethodNames: true,
  showFieldsAsCode: true,
  showSchemaDetails: true,
  showToolNames: true,
  autoApproveQuality: false,
  autoApplyTransforms: false,
  allowedAudiences: ['executive', 'technical', 'business_ops', 'marketing', 'mixed'],
  defaultAudience: 'technical',
  planViewMode: 'full',
  communicationStyle: 'technical',
};

const CONSULTATION_CONFIG: JourneyDisplayConfig = {
  showCode: false,
  showFormulas: false,
  showPseudoCode: false,
  showMethodNames: false,
  showFieldsAsCode: false,
  showSchemaDetails: false,
  showToolNames: false,
  autoApproveQuality: false,
  autoApplyTransforms: false,
  allowedAudiences: ['executive', 'business_ops'],
  defaultAudience: 'executive',
  planViewMode: 'detailed',
  communicationStyle: 'consultation',
};

export function getJourneyDisplayConfig(journeyType: string): JourneyDisplayConfig {
  switch (journeyType) {
    case 'non-tech': return NON_TECH_CONFIG;
    case 'business': return BUSINESS_CONFIG;
    case 'technical': return TECHNICAL_CONFIG;
    case 'consultation': return CONSULTATION_CONFIG;
    default: return NON_TECH_CONFIG;
  }
}

/** Helper: is this a simplified (non-technical) journey? */
export function isSimplifiedJourney(journeyType: string): boolean {
  return journeyType === 'non-tech' || journeyType === 'business';
}
