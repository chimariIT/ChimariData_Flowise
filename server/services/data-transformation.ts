type TransformationStep = {
  type: string;
  config?: Record<string, any>;
};

interface StepExecutionResult {
  rows: any[];
  warning?: string;
  warnings?: string[];
  description?: string;
  details?: Record<string, unknown>;
}

interface TransformationSummaryStep {
  index: number;
  type: string;
  rowCount: number;
  description?: string;
  details?: Record<string, unknown>;
}

export interface TransformationResponse {
  rows: any[];
  preview: any[];
  rowCount: number;
  originalRowCount: number;
  columns: string[];
  warnings: string[];
  summary: {
    stepsApplied: number;
    operations: TransformationSummaryStep[];
  };
}

interface BuildResponseContext {
  originalRowCount?: number;
  originalSchema?: unknown;
  warnings?: string[];
  operations?: TransformationSummaryStep[];
}

interface TransformationOptions {
  originalSchema?: unknown;
  warnings?: string[];
  joinResolver?: (projectId: string) => Promise<{ rows: any[]; projectName?: string }>;
}

interface StepContext {
  joinResolver?: (projectId: string) => Promise<{ rows: any[]; projectName?: string }>;
}

export class DataTransformationService {
  static async applyTransformations(
    data: any[],
    transformations: TransformationStep[],
    options: TransformationOptions = {}
  ): Promise<TransformationResponse> {
    const clonedRows = this.cloneRows(data);
    const warnings: string[] = [...(options.warnings ?? [])];
    const operations: TransformationSummaryStep[] = [];
    let currentRows = clonedRows;
    const context: StepContext = {
      joinResolver: options.joinResolver,
    };

    console.log(`Applying transformations: ${transformations.length} steps on ${data.length} rows`);


    const steps = Array.isArray(transformations) ? transformations : [];
    for (const [index, step] of steps.entries()) {
      if (!step || typeof step !== 'object' || typeof step.type !== 'string') {
        warnings.push(`Skipped step ${index + 1}: missing transformation type.`);
        continue;
      }

      const normalized: TransformationStep = {
        type: step.type,
        config: step.config && typeof step.config === 'object' ? step.config : {},
      };

      try {
        const result = await this.runStep(currentRows, normalized, context);
        currentRows = result.rows;

        if (result.warning) {
          warnings.push(result.warning);
        }
        if (result.warnings && result.warnings.length > 0) {
          warnings.push(...result.warnings);
        }

        operations.push({
          index,
          type: normalized.type,
          rowCount: currentRows.length,
          description: result.description,
          details: result.details,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(`Step ${normalized.type} failed: ${message}`);
      }
    }

    return this.buildResponse(currentRows, {
      originalRowCount: data.length,
      originalSchema: options.originalSchema,
      warnings,
      operations,
    });
  }

  static buildResponse(rows: any[], context: BuildResponseContext = {}): TransformationResponse {
    const preview = rows.slice(0, 100);
    const columns = this.deriveColumns(rows, context.originalSchema);

    return {
      rows,
      preview,
      rowCount: rows.length,
      originalRowCount: context.originalRowCount ?? rows.length,
      columns,
      warnings: [...(context.warnings ?? [])],
      summary: {
        stepsApplied: context.operations?.length ?? 0,
        operations: context.operations ?? [],
      },
    };
  }

  private static async runStep(rows: any[], step: TransformationStep, context: StepContext): Promise<StepExecutionResult> {
    switch (step.type) {
      case 'filter':
        return this.applyFilter(rows, step.config ?? {});
      case 'select':
        return this.applySelect(rows, step.config ?? {});
      case 'rename':
        return this.applyRename(rows, step.config ?? {});
      case 'convert':
        return this.applyConvert(rows, step.config ?? {});
      case 'clean':
        return this.applyClean(rows, step.config ?? {});
      case 'aggregate':
        return this.applyAggregate(rows, step.config ?? {});
      case 'sort':
        return this.applySort(rows, step.config ?? {});
      case 'join':
        return this.applyJoin(rows, step.config ?? {}, context);
      default:
        return {
          rows,
          warning: `Skipped unsupported transformation type "${step.type}".`,
        };
    }
  }

  private static applyFilter(rows: any[], config: Record<string, any>): StepExecutionResult {
    const field = config.field ?? config.column;
    const operator = config.operator ?? 'equals';
    const value = config.value;
    const valueTo = config.valueTo ?? config.secondaryValue;

    if (!field || operator === undefined) {
      return {
        rows,
        warning: 'Filter step skipped: missing field or operator.',
      };
    }

    const filtered = rows.filter((row) => {
      const fieldValue = row?.[field];
      return this.evaluateCondition(fieldValue, operator, value, valueTo);
    });

    return {
      rows: filtered,
      description: `Filtered rows on ${field} (${operator}).`,
      details: {
        field,
        operator,
        removed: rows.length - filtered.length,
      },
    };
  }

  private static applySelect(rows: any[], config: Record<string, any>): StepExecutionResult {
    const columns = this.normalizeStringArray(config.columns ?? config.fields);
    if (columns.length === 0) {
      return {
        rows,
        warning: 'Select step skipped: no columns selected.',
      };
    }

    const selected = rows.map((row) => {
      const next: Record<string, any> = {};
      for (const column of columns) {
        if (row && Object.prototype.hasOwnProperty.call(row, column)) {
          next[column] = row[column];
        } else {
          next[column] = undefined;
        }
      }
      return next;
    });

    return {
      rows: selected,
      description: `Selected ${columns.length} column(s).`,
      details: { columns },
    };
  }

  private static applyRename(rows: any[], config: Record<string, any>): StepExecutionResult {
    const mapping = this.normalizeMappings(config.mappings ?? config.mapping ?? config.columns);
    const mappingKeys = Object.keys(mapping);
    if (mappingKeys.length === 0) {
      return {
        rows,
        warning: 'Rename step skipped: no column mappings provided.',
      };
    }

    const renamed = rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        const nextKey = mapping[key] ?? key;
        result[nextKey] = value;
      }
      return result;
    });

    return {
      rows: renamed,
      description: `Renamed ${mappingKeys.length} column(s).`,
      details: { mappings: mapping },
    };
  }

  private static applyConvert(rows: any[], config: Record<string, any>): StepExecutionResult {
    const conversionsRaw = Array.isArray(config.conversions)
      ? config.conversions
      : Array.isArray(config.fields)
        ? config.fields
        : config.field
          ? [{ field: config.field, toType: config.toType ?? config.type }]
          : [];

    const conversions = conversionsRaw
      .map((entry) => ({
        field: entry?.field,
        toType: entry?.toType ?? entry?.type,
        format: entry?.format,
      }))
      .filter((entry) => typeof entry.field === 'string' && typeof entry.toType === 'string');

    if (conversions.length === 0) {
      return {
        rows,
        warning: 'Convert step skipped: no conversion rules provided.',
      };
    }

    const conversionWarnings: string[] = [];
    const converted = rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const next = { ...row };
      for (const conversion of conversions) {
        const { field, toType, format } = conversion;
        const currentValue = next[field];
        if (currentValue === undefined) continue;

        try {
          switch (toType) {
            case 'number':
              next[field] = typeof currentValue === 'number' ? currentValue : Number(currentValue);
              if (Number.isNaN(next[field])) {
                conversionWarnings.push(`Conversion to number produced NaN for column ${field}.`);
              }
              break;
            case 'string':
            case 'text':
              next[field] = currentValue == null ? '' : String(currentValue);
              break;
            case 'date':
              {
                const dateValue = new Date(currentValue);
                if (Number.isNaN(dateValue.getTime())) {
                  conversionWarnings.push(`Invalid date value for column ${field}.`);
                } else if (format === 'timestamp') {
                  next[field] = dateValue.getTime();
                } else {
                  next[field] = dateValue.toISOString();
                }
              }
              break;
            case 'boolean':
              next[field] = this.toBoolean(currentValue);
              break;
            default:
              conversionWarnings.push(`Unsupported conversion target "${toType}" for column ${field}.`);
              break;
          }
        } catch {
          conversionWarnings.push(`Failed to convert column ${field} to ${toType}.`);
        }
      }
      return next;
    });

    return {
      rows: converted,
      warnings: conversionWarnings,
      description: `Converted ${conversions.length} column(s).`,
      details: { conversions },
    };
  }

  private static applyClean(rows: any[], config: Record<string, any>): StepExecutionResult {
    const removeNulls = Boolean(config.removeNulls);
    const trimWhitespace = Boolean(config.trimWhitespace);
    const removeDuplicates = Boolean(config.removeDuplicates);
    const fillDefaults = config.fillDefaults && typeof config.fillDefaults === 'object' ? config.fillDefaults : undefined;

    if (!removeNulls && !trimWhitespace && !removeDuplicates && !fillDefaults) {
      return { rows, warning: 'Clean step skipped: no cleaning actions provided.' };
    }

    const cleaned = rows.map((row) => {
      if (!row || typeof row !== 'object') return row;
      const next: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        let current = value;

        if (trimWhitespace && typeof current === 'string') {
          current = current.trim();
        }

        if (removeNulls && (current === null || current === undefined || current === '')) {
          continue;
        }

        if (fillDefaults && (current === null || current === undefined || current === '')) {
          const defaultValue = fillDefaults[key];
          if (defaultValue !== undefined) {
            current = defaultValue;
          }
        }

        next[key] = current;
      }
      return next;
    });

    const deduped = removeDuplicates ? this.removeDuplicates(cleaned) : cleaned;

    return {
      rows: deduped,
      description: 'Cleaned dataset rows.',
      details: {
        removeNulls,
        trimWhitespace,
        removeDuplicates,
        fillDefaults: fillDefaults ? Object.keys(fillDefaults) : [],
      },
    };
  }

  private static applyAggregate(rows: any[], config: Record<string, any>): StepExecutionResult {
    const groupByRaw = config.groupBy;
    const aggregationsRaw = config.aggregations;

    const groupBy = Array.isArray(groupByRaw)
      ? groupByRaw.filter((value) => typeof value === 'string')
      : typeof groupByRaw === 'string' && groupByRaw.length > 0
        ? [groupByRaw]
        : [];

    const aggregations = Array.isArray(aggregationsRaw)
      ? aggregationsRaw
        .map((agg: any) => ({
          field: agg?.field,
          operation: agg?.operation,
          alias: agg?.alias,
        }))
        .filter((agg) => typeof agg.field === 'string' && typeof agg.operation === 'string')
      : [];

    if (groupBy.length === 0 || aggregations.length === 0) {
      return {
        rows,
        warning: 'Aggregate step skipped: missing group-by fields or aggregations.',
      };
    }

    const groups = new Map<string, any[]>();
    for (const row of rows) {
      const keyParts = groupBy.map((field) => this.safeKey(row?.[field]));
      const key = keyParts.join('|');
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    }

    const aggregatedRows: any[] = [];
    for (const [key, groupRows] of groups.entries()) {
      const groupRow: Record<string, any> = {};
      const keyParts = key.split('|');
      groupBy.forEach((field, index) => {
        groupRow[field] = this.restoreKey(keyParts[index]);
      });

      for (const agg of aggregations) {
        const { field, operation, alias } = agg;
        const values = groupRows
          .map((row) => Number(row?.[field]))
          .filter((value) => Number.isFinite(value));

        const targetField = alias || `${field}_${operation}`;
        switch (operation) {
          case 'sum':
            groupRow[targetField] = values.reduce((total, current) => total + current, 0);
            break;
          case 'avg':
          case 'average':
            groupRow[targetField] =
              values.length > 0 ? values.reduce((total, current) => total + current, 0) / values.length : 0;
            break;
          case 'count':
            groupRow[targetField] = groupRows.length;
            break;
          case 'min':
            groupRow[targetField] = values.length > 0 ? Math.min(...values) : null;
            break;
          case 'max':
            groupRow[targetField] = values.length > 0 ? Math.max(...values) : null;
            break;
          default:
            groupRow[targetField] = values.length > 0 ? values[0] : null;
            break;
        }
      }

      aggregatedRows.push(groupRow);
    }

    return {
      rows: aggregatedRows,
      description: `Aggregated rows by ${groupBy.join(', ')}.`,
      details: {
        groupBy,
        aggregations: aggregations.map((agg) => ({ field: agg.field, operation: agg.operation })),
      },
    };
  }

  private static applySort(rows: any[], config: Record<string, any>): StepExecutionResult {
    const columnsRaw = Array.isArray(config.columns) ? config.columns : undefined;
    const fallbackField = config.field;

    const sortColumns = columnsRaw && columnsRaw.length > 0
      ? columnsRaw
        .map((entry: any) => ({
          field: entry?.field,
          direction: (entry?.direction ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
        }))
        .filter((entry) => typeof entry.field === 'string')
      : typeof fallbackField === 'string'
        ? [{ field: fallbackField, direction: (config.direction ?? 'asc') === 'desc' ? 'desc' : 'asc' }]
        : [];

    if (sortColumns.length === 0) {
      return {
        rows,
        warning: 'Sort step skipped: no sort columns provided.',
      };
    }

    const sorted = [...rows].sort((a, b) => {
      for (const { field, direction } of sortColumns) {
        const aValue = a?.[field];
        const bValue = b?.[field];

        if (aValue === bValue) {
          continue;
        }

        if (aValue == null) {
          return direction === 'desc' ? -1 : 1;
        }

        if (bValue == null) {
          return direction === 'desc' ? 1 : -1;
        }

        if (aValue < bValue) {
          return direction === 'desc' ? 1 : -1;
        }

        if (aValue > bValue) {
          return direction === 'desc' ? -1 : 1;
        }
      }
      return 0;
    });

    return {
      rows: sorted,
      description: `Sorted rows by ${sortColumns.map(({ field }) => field).join(', ')}.`,
      details: { columns: sortColumns },
    };
  }

  private static async applyJoin(rows: any[], config: Record<string, any>, context: StepContext): Promise<StepExecutionResult> {
    const joinType = typeof config.joinType === 'string' ? config.joinType.toLowerCase() : 'inner';
    const leftKey = config.leftKey ?? config.leftColumn;
    const rightKey = config.rightKey ?? config.rightColumn;
    const rightPrefix = typeof config.rightPrefix === 'string' && config.rightPrefix.length > 0 ? config.rightPrefix : 'right_';

    let rightDataset = Array.isArray(config.rightDataset) ? config.rightDataset : [];
    let rightProjectName = typeof config.rightProjectName === 'string' ? config.rightProjectName : undefined;

    if (!leftKey || !rightKey) {
      return {
        rows,
        warning: 'Join step skipped: missing join keys.',
      };
    }

    if (rightDataset.length === 0 && typeof config.rightProjectId === 'string' && context.joinResolver) {
      try {
        const resolved = await context.joinResolver(config.rightProjectId);
        rightDataset = Array.isArray(resolved?.rows) ? resolved.rows : [];
        if (!rightProjectName && resolved?.projectName) {
          rightProjectName = resolved.projectName;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to load join dataset.';
        return {
          rows,
          warning: `Join step skipped: ${message}`,
        };
      }
    }

    if (rightDataset.length === 0) {
      return {
        rows,
        warning: 'Join step skipped: missing join dataset.',
      };
    }

    const rightIndex = new Map<string, any[]>();
    for (const record of rightDataset) {
      const key = this.safeKey(record?.[rightKey]);
      const bucket = rightIndex.get(key) ?? [];
      bucket.push(record);
      rightIndex.set(key, bucket);
    }

    const matchedRightKeys = new Set<string>();
    const mergedRows: any[] = [];

    for (const leftRow of rows) {
      const key = this.safeKey(leftRow?.[leftKey]);
      const matches = rightIndex.get(key);

      if (matches && matches.length > 0) {
        matchedRightKeys.add(key);
        for (const match of matches) {
          mergedRows.push(this.mergeRows(leftRow, match, rightPrefix));
        }
      } else if (joinType === 'left' || joinType === 'outer') {
        mergedRows.push(this.mergeRows(leftRow, undefined, rightPrefix));
      }
    }

    if (joinType === 'right' || joinType === 'outer') {
      for (const [key, records] of rightIndex.entries()) {
        if (matchedRightKeys.has(key)) {
          continue;
        }
        for (const record of records) {
          mergedRows.push(this.mergeRows(undefined, record, rightPrefix));
        }
      }
    }

    const descriptionParts = [`Join type: ${joinType}`];
    if (rightProjectName) {
      descriptionParts.push(`Right dataset: ${rightProjectName}`);
    }

    return {
      rows: mergedRows,
      description: descriptionParts.join(' | '),
      details: {
        joinType,
        leftKey,
        rightKey,
        matchedRows: mergedRows.length,
      },
    };
  }

  private static cloneRows(rows: any[]): any[] {
    if (!Array.isArray(rows)) return [];
    return rows.map((row) => {
      if (Array.isArray(row)) {
        return [...row];
      }
      if (row && typeof row === 'object') {
        return { ...row };
      }
      return row;
    });
  }

  private static deriveColumns(rows: any[], originalSchema: unknown): string[] {
    const fromSchema = this.normalizeSchema(originalSchema);
    console.log(`Derived columns from schema: ${fromSchema.length} fields`);
    const discovered = new Set<string>();
    const columns: string[] = [];

    for (const column of fromSchema) {
      if (!discovered.has(column)) {
        discovered.add(column);
        columns.push(column);
      }
    }

    const sample = Array.isArray(rows) ? rows.slice(0, 50) : [];
    for (const row of sample) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      for (const key of Object.keys(row)) {
        if (!discovered.has(key)) {
          discovered.add(key);
          columns.push(key);
        }
      }
    }

    console.log(`Total derived columns: ${columns.length} fields`);
    return columns;
  }

  private static normalizeSchema(schema: unknown): string[] {
    if (!schema) return [];

    if (Array.isArray(schema)) {
      const result: string[] = [];
      for (const item of schema) {
        if (typeof item === 'string') {
          result.push(item);
        } else if (item && typeof item === 'object' && typeof (item as any).name === 'string') {
          result.push((item as any).name);
        }
      }
      return result;
    }

    if (typeof schema === 'object') {
      return Object.keys(schema as Record<string, unknown>);
    }

    return [];
  }

  private static normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => (typeof entry === 'string' ? entry : undefined)).filter(Boolean) as string[];
  }

  private static normalizeMappings(value: unknown): Record<string, string> {
    if (!value) return {};

    if (Array.isArray(value)) {
      const mapping: Record<string, string> = {};
      for (const entry of value) {
        const from = entry?.from ?? entry?.source ?? entry?.field;
        const to = entry?.to ?? entry?.target ?? entry?.name;
        if (typeof from === 'string' && typeof to === 'string' && from.length > 0 && to.length > 0) {
          mapping[from] = to;
        }
      }
      return mapping;
    }

    if (typeof value === 'object') {
      const mapping: Record<string, string> = {};
      for (const [from, to] of Object.entries(value as Record<string, unknown>)) {
        if (typeof to === 'string' && from.length > 0 && to.length > 0) {
          mapping[from] = to;
        }
      }
      return mapping;
    }

    return {};
  }

  private static evaluateCondition(fieldValue: any, operator: string, value: any, valueTo: any): boolean {
    const op = operator.toLowerCase();

    switch (op) {
      case 'equals':
      case 'eq':
        return fieldValue == value;
      case 'not_equals':
      case 'neq':
        return fieldValue != value;
      case 'contains':
        return String(fieldValue ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
      case 'starts_with':
        return String(fieldValue ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
      case 'ends_with':
        return String(fieldValue ?? '').toLowerCase().endsWith(String(value ?? '').toLowerCase());
      case 'greater_than':
      case 'gt':
        return Number(fieldValue) > Number(value);
      case 'greater_than_or_equal':
      case 'gte':
        return Number(fieldValue) >= Number(value);
      case 'less_than':
      case 'lt':
        return Number(fieldValue) < Number(value);
      case 'less_than_or_equal':
      case 'lte':
        return Number(fieldValue) <= Number(value);
      case 'between':
        if (value === undefined || valueTo === undefined) {
          return true;
        }
        return Number(fieldValue) >= Number(value) && Number(fieldValue) <= Number(valueTo);
      case 'in':
        if (!Array.isArray(value)) {
          return fieldValue == value;
        }
        return value.some((candidate) => candidate == fieldValue);
      case 'not_in':
        if (!Array.isArray(value)) {
          return fieldValue != value;
        }
        return !value.some((candidate) => candidate == fieldValue);
      case 'is_null':
        return fieldValue === null || fieldValue === undefined;
      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined;
      default:
        return true;
    }
  }

  private static removeDuplicates(rows: any[]): any[] {
    const seen = new Set<string>();
    const result: any[] = [];

    for (const row of rows) {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(row);
      }
    }

    return result;
  }

  private static safeKey(value: any): string {
    if (value === null || value === undefined) return '__NULL__';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  private static restoreKey(value: string): any {
    if (value === '__NULL__') return null;
    return value;
  }

  private static mergeRows(left: any, right: any, rightPrefix: string): any {
    const result: Record<string, any> = {};

    if (left && typeof left === 'object') {
      Object.assign(result, left);
    }

    if (right && typeof right === 'object') {
      for (const [key, value] of Object.entries(right)) {
        if (result.hasOwnProperty(key)) {
          result[`${rightPrefix}${key}`] = value;
        } else {
          result[key] = value;
        }
      }
    }

    if (!left || typeof left !== 'object') {
      for (const key of Object.keys(result)) {
        if (!result.hasOwnProperty(key)) {
          result[key] = null;
        }
      }
    }

    return result;
  }

  private static toBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', '1', 'yes', 'y'].includes(normalized);
    }
    return Boolean(value);
  }
}
