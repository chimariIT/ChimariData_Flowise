/**
 * Shared server-side constants.
 *
 * Values here are referenced by multiple modules (storage implementations,
 * route handlers, tests) and MUST stay in sync.  Centralising them in one
 * file prevents the duplication-then-drift pattern that causes regressions.
 */

/**
 * Maximum number of rows stored in the datasets.data JSONB column.
 *
 * Large CSV uploads can produce INSERT payloads that exceed PostgreSQL's
 * statement_timeout.  We cap what goes into the `data` column; the full
 * dataset is always available via the original uploaded file and via
 * `ingestionMetadata.transformedData` after the transformation step.
 *
 * This cap is enforced inside every storage implementation's createDataset()
 * method so it cannot be bypassed by any upload endpoint.
 *
 * If you raise this, also verify the statement_timeout in server/db.ts
 * can handle the resulting INSERT payload size.
 *
 * History: This has been a recurring production bug (CSV uploads returning
 * "canceling statement due to statement timeout").  The fix was applied
 * inline in project.ts three times and kept regressing.  Moved here and
 * into the storage layer to prevent future regressions.
 */
export const DATASET_DATA_ROW_CAP = 10_000;

/**
 * Minimum acceptable statement_timeout (ms) for the DB connection pool.
 * Validated at startup in server/index.ts — if the pool config drops
 * below this value the server will log a prominent warning.
 */
export const MIN_STATEMENT_TIMEOUT_MS = 60_000;

/**
 * Generate a stable, deterministic question ID from project ID and question text.
 *
 * Bug #9 fix: The codebase had THREE different question ID patterns:
 *   1. `q_{idx + 1}` — index-based, breaks on reorder
 *   2. `q_${projectId}_${hash}` — stable, used by question-answer-service
 *   3. Fuzzy text matching fallback — fragile
 *
 * This function is the SINGLE canonical way to generate a question ID.
 * All services MUST use this instead of rolling their own.
 *
 * Format: `q_{first8OfProjectId}_{first8OfSha256(lowercaseTrimmedText)}`
 */
import crypto from 'crypto';

export function generateStableQuestionId(projectId: string, questionText: string): string {
  const hash = crypto.createHash('sha256')
    .update(questionText.toLowerCase().trim())
    .digest('hex')
    .substring(0, 8);
  return `q_${projectId.substring(0, 8)}_${hash}`;
}
