/**
 * Pipeline Context Resolver
 *
 * Provides canonical functions for resolving context across all pipeline steps.
 * Every step should use these functions instead of deriving context independently.
 *
 * Context flow: PM Clarification → DS Elements → Verification → Transformation → Execution → BA Translation
 * Each step enriches the context; no step should re-derive what a previous step already established.
 */

/**
 * Resolved industry stored in journeyProgress.resolvedIndustry
 * Set by PM clarification, validated/enriched by DS agent
 */
export interface ResolvedIndustry {
  value: string;             // e.g., "hr", "sales", "finance", "marketing"
  confidence: number;        // 0-1 confidence score
  source: string;            // "pm_clarification" | "pm_clarification_basic" | "data_signals" | "fallback"
  dataSignalAlignment?: string | null;  // "confirmed" | "divergent" | "no_signal" — set by DS agent
  dataSignalIndustry?: string;          // What data signals detected (for traceability)
  dataSignalScore?: number;             // Data signal confidence score
  resolvedAt: string;        // ISO timestamp when first resolved
  enrichedAt?: string;       // ISO timestamp when DS agent enriched/validated
}

/**
 * Resolve industry from pipeline context with clear priority chain.
 * Every pipeline step should call this instead of deriving industry independently.
 *
 * Priority:
 *  1. journeyProgress.resolvedIndustry (set by PM clarification + validated by DS)
 *  2. journeyProgress.industry / .industryDomain (legacy, from prepare step)
 *  3. fallbackIndustry parameter (from req.body, user profile, etc.)
 *  4. 'general'
 */
export function resolvePipelineIndustry(
  journeyProgress: any,
  fallbackIndustry?: string
): { industry: string; source: string } {
  // Priority 1: PM-clarified and DS-validated industry
  const resolved = journeyProgress?.resolvedIndustry as ResolvedIndustry | undefined;
  if (resolved?.value && resolved.value !== 'general') {
    return {
      industry: resolved.value,
      source: `resolved (${resolved.source}, confidence: ${resolved.confidence})`
    };
  }

  // Priority 2: Legacy journeyProgress fields
  const jpIndustry = journeyProgress?.industry || journeyProgress?.industryDomain;
  if (jpIndustry && jpIndustry !== 'general' && jpIndustry !== 'other') {
    return { industry: jpIndustry.toLowerCase(), source: 'journey_progress' };
  }

  // Priority 3: Fallback parameter (from req.body, user profile, etc.)
  if (fallbackIndustry && fallbackIndustry !== 'general' && fallbackIndustry !== 'other') {
    return { industry: fallbackIndustry.toLowerCase(), source: 'fallback_param' };
  }

  return { industry: 'general', source: 'default' };
}
