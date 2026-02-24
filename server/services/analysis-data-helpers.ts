// server/services/analysis-data-helpers.ts
/**
 * P3-1: Extracted from analysis-execution.ts
 * Data extraction, PII filtering, dataset payload building, and basic profiling.
 * These are pure data-manipulation functions with no orchestration logic.
 */

import { dataAccessor, type DatasetDataResult } from './data-accessor';

/**
 * Build the payload object sent to Python analysis scripts for a single dataset.
 */
export function buildDatasetPayload(dataset: any, projectId: string, piiColumnsToExclude?: Set<string>) {
  const datasetName = dataset.originalFileName || dataset.name || dataset.datasetName || dataset.id;
  const rows = extractDatasetRows(dataset, piiColumnsToExclude);
  const potentialPath = dataset.storageUri || dataset.filePath || dataset.file_path || null;
  const resolvedPath = potentialPath && typeof potentialPath === 'string' && !potentialPath.startsWith('mem://')
    ? potentialPath
    : null;

  // FIX 1.2: Final PII verification before payload leaves for Python
  if (piiColumnsToExclude && piiColumnsToExclude.size > 0 && rows && rows.length > 0) {
    const payloadKeys = Object.keys(rows[0]);
    const leakedPII = payloadKeys.filter(key =>
      Array.from(piiColumnsToExclude).some(col => col.toLowerCase() === key.toLowerCase())
    );
    if (leakedPII.length > 0) {
      console.error(`🚨 [PII PAYLOAD CHECK] PII columns in payload: ${leakedPII.join(', ')} - stripping before send`);
      // Emergency strip: remove leaked columns as last defense
      for (const row of rows) {
        for (const col of leakedPII) {
          delete row[col];
        }
      }
    }
  }

  return {
    projectId,
    dataset: {
      id: dataset.id,
      datasetId: dataset.id,
      name: datasetName,
      datasetName,
      filePath: resolvedPath,
      rows,
      schema: dataset.schema || null,
      recordCount: dataset.recordCount || (Array.isArray(rows) ? rows.length : null),
      preview: dataset.preview || null,
      metadata: dataset.ingestionMetadata || dataset.metadata || null
    }
  };
}

/**
 * GAP 2 FIX: Filter PII columns from data rows.
 * This is called after extractDatasetRows to ensure PII columns are never passed to analysis.
 */
export function filterPIIColumns(
  rows: any[] | null,
  columnsToExclude: Set<string>
): any[] | null {
  if (!rows || columnsToExclude.size === 0) {
    return rows;
  }

  console.log(`🔒 [GAP 2 - PII] Filtering ${columnsToExclude.size} PII columns from ${rows.length} rows`);

  const filteredRows = rows.map(row => {
    const filteredRow: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      // Skip column if it's in the exclude list (case-insensitive check)
      const keyLower = key.toLowerCase();
      const shouldExclude = Array.from(columnsToExclude).some(
        col => col.toLowerCase() === keyLower
      );
      if (!shouldExclude) {
        filteredRow[key] = value;
      }
    }
    return filteredRow;
  });

  const removedCount = rows.length > 0 ? Object.keys(rows[0]).length - Object.keys(filteredRows[0] || {}).length : 0;
  console.log(`🔒 [GAP 2 - PII] Removed ${removedCount} PII column(s) from data`);

  return filteredRows;
}

/**
 * Extract rows from a dataset, preferring transformed data over original.
 *
 * Week 4 Option B: This method uses DataAccessorService internally for
 * consistent data resolution across the platform.
 *
 * Priority:
 * 1. Transformed data (user-approved transformations)
 * 2. Original data (upload source)
 */
export function extractDatasetRows(dataset: any, columnsToExclude?: Set<string>): any[] | null {
  let result: any[] | null = null;
  let source: string = 'none';
  let usingRawFallback = false;

  // Week 4 Option B: Delegate to unified data accessor logic
  // Priority 1: Use transformed data if available (from transformation step)
  const transformedData = dataset?.ingestionMetadata?.transformedData;
  if (Array.isArray(transformedData) && transformedData.length > 0) {
    result = transformedData;
    source = 'transformed (ingestionMetadata)';
  }

  // Priority 2: Check for transformed data in nested metadata locations
  if (!result) {
    const altTransformedData = dataset?.metadata?.transformedData;
    if (Array.isArray(altTransformedData) && altTransformedData.length > 0) {
      result = altTransformedData;
      source = 'transformed (metadata)';
    }
  }

  // Priority 3: Fall back to original data sources
  if (!result) {
    usingRawFallback = true;

    // P0-7 FIX: If transformation was completed, do NOT silently fall back to raw data
    // DT-2 FIX: Include structured diagnostics for context-aware error recovery in the frontend
    const transformationApplied = dataset?.ingestionMetadata?.transformationApplied;
    if (transformationApplied) {
      console.error(`🚨 [P0-7] Transformation was marked as applied but no transformedData found for dataset ${dataset?.id || 'unknown'}. This indicates a data persistence issue.`);
      const diagnosticError: any = new Error(
        `Data integrity error: Transformation was completed for dataset "${dataset?.originalFileName || dataset?.id}" ` +
        `but no transformed data was found. Re-run the transformation step to resolve.`
      );
      diagnosticError.isTransformationError = true;
      diagnosticError.diagnostics = {
        errorType: 'TRANSFORMATION_DATA_MISSING',
        datasetId: dataset?.id,
        datasetName: dataset?.originalFileName,
        transformedAt: dataset?.ingestionMetadata?.transformedAt || null,
        hadTransformationSteps: !!(dataset?.ingestionMetadata?.transformationSteps?.length),
        hadColumnMappings: !!(dataset?.ingestionMetadata?.columnMappings),
        transformationApplied: true,
        transformedDataPresent: false,
        recoveryAction: 'RE_RUN_TRANSFORMATION',
        recoveryStep: 'data-transformation'
      };
      throw diagnosticError;
    }

    const candidates = [
      { name: 'data', value: dataset.data },
      { name: 'preview', value: dataset.preview },
      { name: 'sampleData', value: dataset.sampleData },
      { name: 'records', value: dataset.records },
    ];

    for (const { name, value } of candidates) {
      if (!value) continue;
      if (Array.isArray(value)) {
        result = value;
        source = `original (${name})`;
        break;
      }
      if (Array.isArray(value?.rows)) {
        result = value.rows;
        source = `original (${name}.rows)`;
        break;
      }
      if (Array.isArray(value?.records)) {
        result = value.records;
        source = `original (${name}.records)`;
        break;
      }
      if (Array.isArray(value?.items)) {
        result = value.items;
        source = `original (${name}.items)`;
        break;
      }
    }
  }

  if (!result) {
    console.warn(`⚠️ [Week4] No data found for dataset ${dataset?.id || 'unknown'}`);
    return null;
  }

  // P0-2 FIX (Defense in Depth): When using raw data fallback, check for PII and block if unmasked
  if (usingRawFallback) {
    // Check if PII was detected at upload but no exclusion decision was made
    const piiAnalysis = dataset?.piiAnalysis || dataset?.ingestionMetadata?.piiAnalysis;
    const hasPII = piiAnalysis?.hasPII || (piiAnalysis?.piiColumns?.length > 0);

    if (hasPII && (!columnsToExclude || columnsToExclude.size === 0)) {
      // PII was detected but no exclusion decision recorded — block execution
      const piiColumnNames = (piiAnalysis?.piiColumns || []).map((c: any) => c.columnName || c.name || c).filter(Boolean);
      console.error(`🚨 [P0-2] PII detected (${piiColumnNames.length} columns: ${piiColumnNames.slice(0, 5).join(', ')}) but no exclusion decision recorded. Applying emergency PII filtering.`);

      // Emergency PII filter: remove all detected PII columns from raw data
      if (piiColumnNames.length > 0 && result.length > 0) {
        const piiSet = new Set(piiColumnNames.map((c: string) => c.toLowerCase()));
        result = result.map(row => {
          const clean = { ...row };
          for (const key of Object.keys(clean)) {
            if (piiSet.has(key.toLowerCase())) {
              delete clean[key];
            }
          }
          return clean;
        });
        console.warn(`⚠️ [P0-2] Emergency filtered ${piiColumnNames.length} PII columns from raw data fallback`);
      }
    } else if (columnsToExclude && columnsToExclude.size > 0) {
      console.warn(`⚠️ [PII Safety] Using raw data fallback for dataset ${dataset?.id || 'unknown'} with ${columnsToExclude.size} PII columns to exclude. Transformed data was not available.`);
    }
  }

  console.log(`📊 [Week4] Using ${source} (${result.length} rows) for analysis`);

  // GAP 2 FIX: Always apply PII filtering using explicit parameter
  if (columnsToExclude && columnsToExclude.size > 0) {
    result = filterPIIColumns(result, columnsToExclude);

    // FIX 1.2: Post-filter assertion - verify no PII columns leaked through
    if (result && result.length > 0) {
      const sampleRow = result[0];
      const sampleKeys = Object.keys(sampleRow);
      const leakedColumns = sampleKeys.filter(key =>
        Array.from(columnsToExclude).some(col => col.toLowerCase() === key.toLowerCase())
      );
      if (leakedColumns.length > 0) {
        console.error(`🚨 [PII ASSERTION FAILED] Excluded columns found in filtered data: ${leakedColumns.join(', ')}`);
        throw new Error(
          `PII enforcement failed: columns [${leakedColumns.join(', ')}] were excluded but still present in data. ` +
          `Analysis blocked to prevent PII leakage.`
        );
      }
      console.log(`✅ [PII Verified] ${columnsToExclude.size} excluded column(s) confirmed absent from ${source} data`);
    }
  }

  return result;
}

/**
 * Week 4 Option B: Get project data using the unified DataAccessor service.
 * This method provides a cleaner interface for getting all project data
 * with proper transformed/original resolution.
 */
export async function getProjectDataViaAccessor(projectId: string): Promise<{
  datasets: DatasetDataResult[];
  hasTransformations: boolean;
}> {
  const result = await dataAccessor.getProjectData(projectId);
  return {
    datasets: result.datasets,
    hasTransformations: result.hasAnyTransformations,
  };
}

/**
 * Basic data profiling fallback (without Python)
 */
export async function basicDataProfilingFromDataset(dataset: any, piiColumnsToExclude?: Set<string>): Promise<any> {
  console.warn(`⚠️ Falling back to basic profiling for dataset ${dataset.id}`);
  const rows = extractDatasetRows(dataset, piiColumnsToExclude) || [];
  const columns = rows.length > 0
    ? Object.keys(rows[0])
    : dataset.schema
      ? Object.keys(dataset.schema)
      : [];

  const numericColumns = columns.filter((column) =>
    rows.some((row: any) => typeof row?.[column] === 'number')
  );

  const rowCount = rows.length;
  const columnCount = columns.length;
  const missingValues = rows.reduce((total: number, row: any) => {
    return total + columns.reduce((acc, column) => {
      const value = row?.[column];
      return acc + (value === null || value === undefined || value === '' ? 1 : 0);
    }, 0);
  }, 0);

  return {
    success: true,
    rowCount,
    columnCount,
    descriptive: {
      rowCount,
      columnCount,
      numericColumns,
      missingValues,
      sampleColumns: columns.slice(0, 5)
    },
    correlations: [],
    regression: null,
    clustering: null,
    timeSeries: null,
    textInsights: [],
    visualizations: []
  };
}

/**
 * Infer data statistics from dataset rows for use with validateDataForAnalysis().
 * Computes row count, column types, and null percentages per column.
 */
export function inferDataStats(rows: Record<string, any>[]): {
  rowCount: number;
  nullPercents: Record<string, number>;
  columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'text'>;
} {
  if (!rows || rows.length === 0) {
    return { rowCount: 0, nullPercents: {}, columnTypes: {} };
  }

  const allKeys = Object.keys(rows[0]);
  const nullPercents: Record<string, number> = {};
  const columnTypes: Record<string, 'numeric' | 'categorical' | 'datetime' | 'text'> = {};

  for (const key of allKeys) {
    let nullCount = 0;
    let numericCount = 0;
    let dateCount = 0;
    let longTextCount = 0;

    for (const row of rows) {
      const val = row[key];
      if (val === null || val === undefined || val === '') {
        nullCount++;
      } else if (typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val)))) {
        numericCount++;
      } else if (typeof val === 'string') {
        // Check if it parses as a date (only for strings that look date-like)
        if (/^\d{4}[-/]/.test(val) && !isNaN(Date.parse(val))) {
          dateCount++;
        } else if (val.length > 50) {
          longTextCount++;
        }
      }
    }

    const nonNull = rows.length - nullCount;
    nullPercents[key] = rows.length > 0 ? (nullCount / rows.length) * 100 : 0;

    if (nonNull === 0) {
      columnTypes[key] = 'categorical';
    } else if (numericCount / nonNull > 0.8) {
      columnTypes[key] = 'numeric';
    } else if (dateCount / nonNull > 0.8) {
      columnTypes[key] = 'datetime';
    } else if (longTextCount / nonNull > 0.5) {
      columnTypes[key] = 'text';
    } else {
      columnTypes[key] = 'categorical';
    }
  }

  return { rowCount: rows.length, nullPercents, columnTypes };
}
