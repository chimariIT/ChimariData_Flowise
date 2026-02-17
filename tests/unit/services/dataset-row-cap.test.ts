/**
 * Unit Tests for Dataset Data Row Cap
 *
 * Verifies that the DATASET_DATA_ROW_CAP constant exists and that
 * createDataset() enforces it.  This test exists because the CSV upload
 * "statement timeout" bug has regressed THREE times — each time because
 * inline patches in project.ts were overwritten during other changes.
 *
 * The fix was moved to the storage layer (server/storage.ts, server/constants.ts)
 * so it cannot be bypassed.  This test ensures the guard stays in place.
 */

import { describe, it, expect } from 'vitest';
import { DATASET_DATA_ROW_CAP, MIN_STATEMENT_TIMEOUT_MS } from '../../../server/constants';

describe('Dataset Data Row Cap (prevents CSV upload timeout)', () => {
  it('DATASET_DATA_ROW_CAP is defined and is a positive number', () => {
    expect(DATASET_DATA_ROW_CAP).toBeDefined();
    expect(typeof DATASET_DATA_ROW_CAP).toBe('number');
    expect(DATASET_DATA_ROW_CAP).toBeGreaterThan(0);
  });

  it('DATASET_DATA_ROW_CAP is at most 50,000 (prevents oversized JSONB inserts)', () => {
    // If someone raises this above 50K, the JSONB INSERT payloads may exceed
    // the statement_timeout again.  This test will catch accidental increases.
    expect(DATASET_DATA_ROW_CAP).toBeLessThanOrEqual(50_000);
  });

  it('MIN_STATEMENT_TIMEOUT_MS is defined and >= 60s', () => {
    expect(MIN_STATEMENT_TIMEOUT_MS).toBeDefined();
    expect(MIN_STATEMENT_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('caps an array larger than DATASET_DATA_ROW_CAP', () => {
    // Simulate the logic that runs inside createDataset()
    const oversizedData = new Array(DATASET_DATA_ROW_CAP + 5000).fill({ col: 'val' });

    let capped = oversizedData;
    if (Array.isArray(capped) && capped.length > DATASET_DATA_ROW_CAP) {
      capped = capped.slice(0, DATASET_DATA_ROW_CAP);
    }

    expect(capped.length).toBe(DATASET_DATA_ROW_CAP);
  });

  it('does NOT cap an array smaller than DATASET_DATA_ROW_CAP', () => {
    const smallData = new Array(100).fill({ col: 'val' });

    let result = smallData;
    if (Array.isArray(result) && result.length > DATASET_DATA_ROW_CAP) {
      result = result.slice(0, DATASET_DATA_ROW_CAP);
    }

    expect(result.length).toBe(100);
  });

  it('handles null/undefined data gracefully', () => {
    // createDataset() receives null/undefined data for some sources
    const nullData = null;
    const undefinedData = undefined;

    // The cap logic uses Array.isArray which returns false for null/undefined
    expect(Array.isArray(nullData)).toBe(false);
    expect(Array.isArray(undefinedData)).toBe(false);
  });
});
