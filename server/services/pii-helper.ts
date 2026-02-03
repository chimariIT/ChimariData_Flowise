/**
 * PII Helper — Single Source of Truth for reading PII excluded columns
 *
 * Consolidates the 3+ field names and formats used across the codebase:
 *   - journeyProgress.piiDecisions.excludedColumns (canonical)
 *   - journeyProgress.piiDecision.excludedColumns (legacy singular)
 *   - journeyProgress.piiDecisions.selectedColumns (legacy alternate name)
 *   - journeyProgress.piiDecisions.piiColumnsRemoved (legacy alternate name)
 *   - project.metadata.piiDecision (ancient legacy)
 *
 * All consumers should use this helper instead of ad-hoc fallback chains.
 */

/**
 * Extract the list of PII-excluded column names from journeyProgress.
 * Handles all legacy field name variants in a single place.
 */
export function getPiiExcludedColumns(journeyProgress: any): string[] {
  if (!journeyProgress) return [];

  // Canonical location: journeyProgress.piiDecisions (plural)
  const piiDecisions = journeyProgress.piiDecisions || journeyProgress.piiDecision;
  if (!piiDecisions) return [];

  // If it's an object with excludedColumns array (standard format)
  if (piiDecisions.excludedColumns && Array.isArray(piiDecisions.excludedColumns)) {
    // Also merge any alternate-named fields for full coverage
    const altNames: string[] = [
      ...(piiDecisions.selectedColumns || []),
      ...(piiDecisions.piiColumnsRemoved || []),
    ];
    return [...new Set([...piiDecisions.excludedColumns, ...altNames])];
  }

  // Legacy format: Record<fieldName, action> where action === 'exclude'
  if (typeof piiDecisions === 'object' && !Array.isArray(piiDecisions)) {
    const excluded = Object.entries(piiDecisions)
      .filter(([key, action]) => {
        // Skip known metadata keys
        if (['anonymizationApplied', 'piiDecisionTimestamp', 'timestamp'].includes(key)) return false;
        return action === 'exclude';
      })
      .map(([field]) => field);
    if (excluded.length > 0) return excluded;
  }

  return [];
}

/**
 * Get the full PII config object for artifact generation.
 * Returns a normalized structure regardless of the storage format.
 * Includes `piiColumnsRemoved` for backward compatibility with ArtifactGenerator interface.
 */
export function getPiiConfig(journeyProgress: any): {
  excludedColumns: string[];
  anonymizationApplied: boolean;
  piiColumnsRemoved: string[];
} {
  const excludedColumns = getPiiExcludedColumns(journeyProgress);
  const piiDecisions = journeyProgress?.piiDecisions || journeyProgress?.piiDecision;
  const anonymizationApplied = piiDecisions?.anonymizationApplied || false;

  return { excludedColumns, anonymizationApplied, piiColumnsRemoved: excludedColumns };
}
