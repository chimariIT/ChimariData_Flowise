import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { UnifiedPIIProcessor } from './unified-pii-processor';

interface SchemaColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'integer' | 'float';
    nullable: boolean;
    unique: boolean;
    sampleValues: any[];
    missingCount: number;
    missingPercentage: number;
    descriptiveStats?: ColumnDescriptiveStats;
}

type ColumnCategory = 'numeric' | 'categorical' | 'boolean' | 'date' | 'unknown';

interface ValueFrequency {
    value: string;
    count: number;
    percentage: number;
}

interface ColumnDescriptiveStats {
    columnType: ColumnCategory;
    nonNullCount: number;
    missingCount: number;
    missingPercentage: number;
    uniqueCount: number;
    topValues?: ValueFrequency[];
    mean?: number;
    median?: number;
    stdDev?: number;
    min?: number;
    max?: number;
    q1?: number;
    q3?: number;
    sum?: number;
    trueCount?: number;
    falseCount?: number;
    minDate?: string;
    maxDate?: string;
}

interface DatasetSummary {
    overview: string;
    totalRows: number;
    totalColumns: number;
    missingCellPercentage: number;
    columnTypeBreakdown: Record<ColumnCategory, string[]>;
}

interface DataQualityMetrics {
    totalRows: number;
    totalColumns: number;
    completeness: number;
    duplicateRows: number;
    potentialPIIFields: string[];
    dataQualityScore: number;
}

interface ValidationWarning {
    column: string;
    inferredType: string;
    mismatchCount: number;
    mismatchPercentage: number;
    sampleMismatches: string[];
}

interface ProcessedFileResult {
    preview: any[];
    schema: Record<string, SchemaColumn>;
    recordCount: number;
    data: any[];
    qualityMetrics: DataQualityMetrics;
    relationships: Array<{
        sourceColumn: string;
        targetColumn: string;
        type: 'potential_foreign_key' | 'correlation';
        confidence: number;
    }>;
    descriptiveStats: Record<string, ColumnDescriptiveStats>;
    datasetSummary: DatasetSummary;
    columnTypes: Record<string, string[]>;
    validationResults?: {
        isValid: boolean;
        warnings: ValidationWarning[];
        checkedAt: string;
    };
}

export class FileProcessor {
    /**
     * Process uploaded file with comprehensive validation and schema detection
     */
    static async processFile(
        buffer: Buffer,
        originalname: string,
        mimetype: string
    ): Promise<ProcessedFileResult> {
        console.log(`Processing file: ${originalname} (${mimetype})`);

        let data: any[] = [];

        // Parse file based on type
        if (mimetype === 'text/csv' || originalname.endsWith('.csv')) {
            data = await this.parseCSV(buffer);
        } else if (mimetype === 'application/json' || originalname.endsWith('.json')) {
            data = this.parseJSON(buffer);
        } else if (
            mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
            mimetype === 'application/vnd.ms-excel' ||
            originalname.endsWith('.xlsx') ||
            originalname.endsWith('.xls')
        ) {
            data = this.parseExcel(buffer);
        } else {
            throw new Error(`Unsupported file type: ${mimetype}`);
        }

        if (!data || data.length === 0) {
            throw new Error('File contains no data');
        }

        // Detect schema with type inference
        const schema = this.detectSchema(data);

        // Calculate quality metrics
        const qualityMetrics = this.calculateQualityMetrics(data, schema);

        // Generate preview (first 10 rows)
        const preview = data.slice(0, 10);

        const { descriptiveStats, datasetSummary, relationships } = this.createDataProfile(data, schema);

        // Build columnTypes summary for quick access (type -> column names)
        const columnTypes: Record<string, string[]> = {};
        for (const [colName, colSchema] of Object.entries(schema)) {
            const type = colSchema.type || 'string';
            if (!columnTypes[type]) columnTypes[type] = [];
            columnTypes[type].push(colName);
        }

        // Runtime schema validation: sample rows and check for type mismatches
        const validationWarnings: ValidationWarning[] = [];
        const sampleSize = Math.min(100, data.length);
        const sampleRows = data.slice(0, sampleSize);
        for (const [colName, colSchema] of Object.entries(schema)) {
            if (colSchema.type === 'string') continue; // string is always valid
            let mismatchCount = 0;
            const sampleMismatches: string[] = [];
            for (const row of sampleRows) {
                const val = row[colName];
                if (val == null || val === '') continue;
                let matches = true;
                if (colSchema.type === 'number' || colSchema.type === 'integer' || colSchema.type === 'float') {
                    matches = typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)));
                } else if (colSchema.type === 'boolean') {
                    matches = typeof val === 'boolean' || (typeof val === 'string' && ['true','false','yes','no','y','n'].includes(val.toLowerCase()));
                } else if (colSchema.type === 'date') {
                    matches = val instanceof Date || (typeof val === 'string' && !isNaN(new Date(val).getTime()));
                }
                if (!matches) {
                    mismatchCount++;
                    if (sampleMismatches.length < 3) sampleMismatches.push(String(val).substring(0, 50));
                }
            }
            const mismatchPct = sampleSize > 0 ? (mismatchCount / sampleSize) * 100 : 0;
            if (mismatchPct > 10) {
                validationWarnings.push({
                    column: colName,
                    inferredType: colSchema.type,
                    mismatchCount,
                    mismatchPercentage: parseFloat(mismatchPct.toFixed(1)),
                    sampleMismatches
                });
            }
        }

        const validationResults = {
            isValid: validationWarnings.length === 0,
            warnings: validationWarnings,
            checkedAt: new Date().toISOString()
        };

        if (validationWarnings.length > 0) {
            console.warn(`⚠️ [Validation] ${validationWarnings.length} columns have type mismatches:`, validationWarnings.map(w => `${w.column} (${w.inferredType}: ${w.mismatchPercentage}% mismatch)`).join(', '));
        }

        return {
            preview,
            schema,
            recordCount: data.length,
            data,
            qualityMetrics,
            relationships,
            descriptiveStats,
            datasetSummary,
            columnTypes,
            validationResults
        };
    }

    /**
     * Parse CSV file using PapaParse
     */
    private static async parseCSV(buffer: Buffer): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const csvString = buffer.toString('utf8');

            try {
                const result = Papa.parse<Record<string, unknown>>(csvString, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    delimiter: "", // Auto-detect delimiter
                    comments: "#"
                });

                if (result.errors.length > 0) {
                    console.warn('CSV parsing warnings:', result.errors);
                }

                resolve(result.data as Record<string, unknown>[]);
            } catch (error) {
                reject(new Error(`CSV parsing failed: ${(error as Error).message}`));
            }
        });
    }

    /**
     * Parse JSON file
     */
    private static parseJSON(buffer: Buffer): any[] {
        try {
            const jsonString = buffer.toString('utf8');
            const parsed = JSON.parse(jsonString);

            // Handle both array and single object
            if (Array.isArray(parsed)) {
                return parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
                return [parsed];
            } else {
                throw new Error('JSON must be an array or object');
            }
        } catch (error) {
            throw new Error(`JSON parsing failed: ${(error as Error).message}`);
        }
    }

    /**
     * Parse Excel file using xlsx library
     */
    private static parseExcel(buffer: Buffer): any[] {
        try {
            const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

            // Get first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON - raw: true preserves native types (numbers, booleans, dates)
            // so type inference in detectSchema() works correctly
            const data = XLSX.utils.sheet_to_json(worksheet, {
                defval: null,
                raw: true
            });

            return data;
        } catch (error) {
            throw new Error(`Excel parsing failed: ${(error as Error).message}`);
        }
    }

    /**
     * Detect schema with intelligent type inference
     */
    private static detectSchema(data: any[]): Record<string, SchemaColumn> {
        const schema: Record<string, SchemaColumn> = {};

        if (data.length === 0) return schema;

        const columns = Object.keys(data[0]);

        for (const column of columns) {
            const values = data.map(row => row[column]);
            const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');

            schema[column] = {
                name: column,
                type: this.inferColumnType(nonNullValues),
                nullable: nonNullValues.length < values.length,
                unique: this.checkUniqueness(nonNullValues),
                sampleValues: nonNullValues.slice(0, 5),
                missingCount: values.length - nonNullValues.length,
                missingPercentage: ((values.length - nonNullValues.length) / values.length) * 100
            };
        }

        return schema;
    }

    /**
     * Infer column type from sample values
     */
    private static inferColumnType(values: any[]): SchemaColumn['type'] {
        if (values.length === 0) return 'string';

        // Sample up to 200 values for performance on large datasets
        const sample = values.length > 200 ? values.slice(0, 200) : values;
        const sampleSize = sample.length;

        // Check for boolean (native booleans + common string representations)
        const booleanValues = sample.filter(v => {
            if (typeof v === 'boolean') return true;
            if (typeof v === 'string') {
                const lower = v.trim().toLowerCase();
                return lower === 'true' || lower === 'false' ||
                       lower === 'yes' || lower === 'no' ||
                       lower === 'y' || lower === 'n';
            }
            // Numeric 0/1 only if ALL non-null values are 0 or 1 (checked below)
            return false;
        });
        if (booleanValues.length / sampleSize > 0.8) return 'boolean';

        // Check for dates (native Date objects + common string formats)
        const dateValues = sample.filter(v => {
            if (v instanceof Date) return true;
            if (typeof v === 'string') {
                const trimmed = v.trim();
                // Match common date patterns before attempting parse
                if (trimmed.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/) ||            // YYYY-MM-DD, YYYY/MM/DD
                    trimmed.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/) ||          // MM/DD/YYYY, DD-MM-YY
                    trimmed.match(/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i) || // 01 Jan 2024
                    trimmed.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}/i)) { // Jan 01, 2024
                    const parsed = new Date(trimmed);
                    return !isNaN(parsed.getTime());
                }
            }
            return false;
        });
        if (dateValues.length / sampleSize > 0.8) return 'date';

        // Check for numbers
        const numericValues = sample.filter(v => {
            if (typeof v === 'number') return !isNaN(v) && isFinite(v);
            if (typeof v === 'string') {
                const trimmed = v.trim();
                if (trimmed === '') return false;
                const num = Number(trimmed);
                return !isNaN(num) && isFinite(num);
            }
            return false;
        });

        if (numericValues.length / sampleSize > 0.8) {
            // Check if integers
            const integerValues = numericValues.filter(v => {
                const num = Number(v);
                return Number.isInteger(num);
            });

            if (integerValues.length === numericValues.length) {
                return 'integer';
            } else {
                return 'float';
            }
        }

        // Default to string
        return 'string';
    }

    /**
     * Check if column values are unique
     */
    private static checkUniqueness(values: any[]): boolean {
        const uniqueValues = new Set(values.map(v => JSON.stringify(v)));
        return uniqueValues.size === values.length;
    }



    /**
     * Calculate comprehensive data quality metrics
     */
    private static calculateQualityMetrics(
        data: any[],
        schema: Record<string, SchemaColumn>
    ): DataQualityMetrics {
        const totalRows = data.length;
        const totalColumns = Object.keys(schema).length;

        // Calculate completeness
        let totalCells = totalRows * totalColumns;
        let filledCells = 0;

        for (const column of Object.keys(schema)) {
            filledCells += totalRows - schema[column].missingCount;
        }

        const completeness = (filledCells / totalCells) * 100;

        // Detect duplicate rows
        const uniqueRows = new Set(data.map(row => JSON.stringify(row)));
        const duplicateRows = totalRows - uniqueRows.size;

        // Detect potential PII fields using UnifiedPIIProcessor
        const piiResult = UnifiedPIIProcessor.processPIIData(data, schema);
        const potentialPIIFields = piiResult.piiFields;

        // Calculate overall data quality score
        const qualityScore = this.calculateQualityScore(
            completeness,
            duplicateRows,
            totalRows,
            schema
        );

        return {
            totalRows,
            totalColumns,
            completeness,
            duplicateRows,
            potentialPIIFields,
            dataQualityScore: qualityScore
        };
    }

    /**
     * Calculate overall data quality score (0-100)
     */
    private static calculateQualityScore(
        completeness: number,
        duplicateRows: number,
        totalRows: number,
        schema: Record<string, SchemaColumn>
    ): number {
        // Completeness is already 0-100 percentage, convert to 0-1 ratio
        const completenessRatio = completeness / 100;

        // Uniqueness ratio (0-1)
        const uniquenessRatio = (totalRows - duplicateRows) / totalRows;

        // Consistency score (0-100), convert to 0-1 ratio
        const consistencyRatio = this.calculateConsistencyScore(schema) / 100;

        // Weighted average: 40% completeness, 30% uniqueness, 30% consistency
        const weightedScore = (completenessRatio * 0.4) + (uniquenessRatio * 0.3) + (consistencyRatio * 0.3);

        // Convert back to 0-100 percentage
        return Math.round(weightedScore * 100);
    }

    /**
     * Calculate consistency score based on type inference confidence
     */
    private static calculateConsistencyScore(schema: Record<string, SchemaColumn>): number {
        // Columns with non-string types indicate good type consistency
        const typedColumns = Object.values(schema).filter(
            col => col.type !== 'string'
        ).length;

        const totalColumns = Object.keys(schema).length;

        if (totalColumns === 0) return 100;

        return (typedColumns / totalColumns) * 100;
    }

    /**
     * Detect potential relationships between columns
     */
    private static detectRelationships(
        data: any[],
        schema: Record<string, SchemaColumn>
    ): Array<{
        sourceColumn: string;
        targetColumn: string;
        type: 'potential_foreign_key' | 'correlation';
        confidence: number;
    }> {
        const relationships: Array<{
            sourceColumn: string;
            targetColumn: string;
            type: 'potential_foreign_key' | 'correlation';
            confidence: number;
        }> = [];

        const columns = Object.keys(schema);

        // Check for potential foreign keys (columns ending with _id or id)
        for (const column of columns) {
            if (column.toLowerCase().endsWith('_id') || column.toLowerCase().endsWith('id')) {
                // Find potential parent table
                const baseName = column.toLowerCase()
                    .replace(/_id$/, '')
                    .replace(/id$/, '');

                for (const targetColumn of columns) {
                    if (targetColumn !== column &&
                        targetColumn.toLowerCase().includes(baseName)) {
                        relationships.push({
                            sourceColumn: column,
                            targetColumn: targetColumn,
                            type: 'potential_foreign_key',
                            confidence: 0.7
                        });
                    }
                }
            }
        }

        // Check for numeric correlations
        const numericColumns = columns.filter(col =>
            schema[col].type === 'number' ||
            schema[col].type === 'integer' ||
            schema[col].type === 'float'
        );

        for (let i = 0; i < numericColumns.length; i++) {
            for (let j = i + 1; j < numericColumns.length; j++) {
                const col1 = numericColumns[i];
                const col2 = numericColumns[j];

                const correlation = this.calculateCorrelation(data, col1, col2);

                if (Math.abs(correlation) > 0.7) {
                    relationships.push({
                        sourceColumn: col1,
                        targetColumn: col2,
                        type: 'correlation',
                        confidence: Math.abs(correlation)
                    });
                }
            }
        }

        return relationships;
    }

    /**
     * Calculate Pearson correlation coefficient
     */
    private static calculateCorrelation(
        data: any[],
        col1: string,
        col2: string
    ): number {
        const values1 = data.map(row => Number(row[col1])).filter(v => !isNaN(v));
        const values2 = data.map(row => Number(row[col2])).filter(v => !isNaN(v));

        if (values1.length !== values2.length || values1.length === 0) {
            return 0;
        }

        const mean1 = values1.reduce((sum, v) => sum + v, 0) / values1.length;
        const mean2 = values2.reduce((sum, v) => sum + v, 0) / values2.length;

        let numerator = 0;
        let sum1Sq = 0;
        let sum2Sq = 0;

        for (let i = 0; i < values1.length; i++) {
            const diff1 = values1[i] - mean1;
            const diff2 = values2[i] - mean2;
            numerator += diff1 * diff2;
            sum1Sq += diff1 * diff1;
            sum2Sq += diff2 * diff2;
        }

        const denominator = Math.sqrt(sum1Sq * sum2Sq);

        if (denominator === 0) return 0;

        return numerator / denominator;
    }

    static createDataProfile(
        data: any[],
        schema: Record<string, SchemaColumn>
    ): {
        descriptiveStats: Record<string, ColumnDescriptiveStats>;
        datasetSummary: DatasetSummary;
        relationships: ProcessedFileResult['relationships'];
    } {
        const descriptiveStats: Record<string, ColumnDescriptiveStats> = {};
        const columnTypeBreakdown: Record<ColumnCategory, string[]> = {
            numeric: [],
            categorical: [],
            boolean: [],
            date: [],
            unknown: []
        };

        const totalRows = data.length;
        const totalColumns = Object.keys(schema).length;

        let totalMissingCells = 0;

        for (const [column, columnSchema] of Object.entries(schema)) {
            const values = data.map(row => (row ? row[column] : undefined));
            const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
            const missingCount = totalRows - nonNullValues.length;
            const missingPercentage = totalRows === 0 ? 0 : (missingCount / totalRows) * 100;
            const uniqueCount = new Set(nonNullValues.map(value => JSON.stringify(value))).size;

            totalMissingCells += missingCount;

            const columnCategory = this.normalizeColumnCategory(columnSchema.type);
            columnTypeBreakdown[columnCategory].push(column);

            schema[column].missingCount = missingCount;
            schema[column].missingPercentage = missingPercentage;

            const baseStats: ColumnDescriptiveStats = {
                columnType: columnCategory,
                nonNullCount: nonNullValues.length,
                missingCount,
                missingPercentage,
                uniqueCount,
                topValues: this.calculateTopValues(nonNullValues, nonNullValues.length)
            };

            let enrichedStats: ColumnDescriptiveStats = baseStats;

            if (columnCategory === 'numeric') {
                enrichedStats = {
                    ...baseStats,
                    ...this.calculateNumericStats(nonNullValues as Array<number | string>)
                } as ColumnDescriptiveStats;
            } else if (columnCategory === 'boolean') {
                enrichedStats = {
                    ...baseStats,
                    ...this.calculateBooleanStats(nonNullValues as Array<boolean | string | number>)
                } as ColumnDescriptiveStats;
            } else if (columnCategory === 'date') {
                enrichedStats = {
                    ...baseStats,
                    ...this.calculateDateStats(nonNullValues as Array<string | Date>)
                } as ColumnDescriptiveStats;
            }

            descriptiveStats[column] = enrichedStats;
            schema[column].descriptiveStats = enrichedStats;
        }

        const totalCells = totalRows * totalColumns;
        const missingCellPercentage = totalCells === 0 ? 0 : (totalMissingCells / totalCells) * 100;

        const overviewParts: string[] = [];
        overviewParts.push(`Dataset contains ${totalRows} row${totalRows === 1 ? '' : 's'} and ${totalColumns} column${totalColumns === 1 ? '' : 's'}.`);

        const numericColumns = columnTypeBreakdown.numeric;
        if (numericColumns.length > 0) {
            overviewParts.push(`Numeric columns (${numericColumns.length}): ${this.formatColumnList(numericColumns)}.`);
        }

        const categoricalColumns = columnTypeBreakdown.categorical;
        if (categoricalColumns.length > 0) {
            overviewParts.push(`Categorical columns (${categoricalColumns.length}): ${this.formatColumnList(categoricalColumns)}.`);
        }

        const booleanColumns = columnTypeBreakdown.boolean;
        if (booleanColumns.length > 0) {
            overviewParts.push(`Boolean columns (${booleanColumns.length}): ${this.formatColumnList(booleanColumns)}.`);
        }

        const dateColumns = columnTypeBreakdown.date;
        if (dateColumns.length > 0) {
            overviewParts.push(`Date columns (${dateColumns.length}): ${this.formatColumnList(dateColumns)}.`);
        }

        const unknownColumns = columnTypeBreakdown.unknown;
        if (unknownColumns.length > 0) {
            overviewParts.push(`Columns requiring review (${unknownColumns.length}): ${this.formatColumnList(unknownColumns)}.`);
        }

        overviewParts.push(`Overall missing data: ${missingCellPercentage.toFixed(1)}%.`);

        const datasetSummary: DatasetSummary = {
            overview: overviewParts.join(' '),
            totalRows,
            totalColumns,
            missingCellPercentage,
            columnTypeBreakdown
        };

        const relationships = this.detectRelationships(data, schema);

        return { descriptiveStats, datasetSummary, relationships };
    }

    private static normalizeColumnCategory(type: SchemaColumn['type']): ColumnCategory {
        switch (type) {
            case 'number':
            case 'integer':
            case 'float':
                return 'numeric';
            case 'boolean':
                return 'boolean';
            case 'date':
                return 'date';
            case 'string':
                return 'categorical';
            default:
                return 'unknown';
        }
    }

    private static calculateTopValues(values: any[], nonNullCount: number): ValueFrequency[] | undefined {
        if (!values.length || nonNullCount === 0) {
            return undefined;
        }

        const counts = new Map<string, { count: number; original: any }>();
        for (const value of values) {
            const key = typeof value === 'string' ? value : JSON.stringify(value);
            const existing = counts.get(key);
            if (existing) {
                existing.count += 1;
            } else {
                counts.set(key, { count: 1, original: value });
            }
        }

        return Array.from(counts.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 5)
            .map(([key, info]) => ({
                value: this.formatValueForDisplay(info.original, key),
                count: info.count,
                percentage: Number(((info.count / values.length) * 100).toFixed(2))
            }));
    }

    private static calculateNumericStats(values: Array<number | string>): Partial<ColumnDescriptiveStats> {
        const numericValues = values
            .map(value => (typeof value === 'number' ? value : Number(value)))
            .filter(value => Number.isFinite(value));

        if (!numericValues.length) {
            return {};
        }

        const sorted = [...numericValues].sort((a, b) => a - b);
        const sum = sorted.reduce((acc, val) => acc + val, 0);
        const mean = sum / sorted.length;
        const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;

        return {
            mean,
            median: this.calculateQuantile(sorted, 0.5),
            stdDev: Math.sqrt(variance),
            min: sorted[0],
            max: sorted[sorted.length - 1],
            q1: this.calculateQuantile(sorted, 0.25),
            q3: this.calculateQuantile(sorted, 0.75),
            sum
        };
    }

    private static calculateBooleanStats(values: Array<boolean | string | number>): Partial<ColumnDescriptiveStats> {
        let trueCount = 0;
        let falseCount = 0;

        for (const value of values) {
            const normalized = typeof value === 'boolean'
                ? value
                : typeof value === 'string'
                    ? value.toLowerCase() === 'true'
                    : Boolean(value);

            if (normalized) {
                trueCount += 1;
            } else {
                falseCount += 1;
            }
        }

        return {
            trueCount,
            falseCount
        };
    }

    private static calculateDateStats(values: Array<string | Date>): Partial<ColumnDescriptiveStats> {
        const validDates = values
            .map(value => (value instanceof Date ? value : new Date(value)))
            .filter(date => !Number.isNaN(date.getTime()))
            .sort((a, b) => a.getTime() - b.getTime());

        if (!validDates.length) {
            return {};
        }

        return {
            minDate: validDates[0].toISOString(),
            maxDate: validDates[validDates.length - 1].toISOString()
        };
    }

    private static calculateQuantile(sortedValues: number[], quantile: number): number {
        if (!sortedValues.length) {
            return NaN;
        }
        if (sortedValues.length === 1) {
            return sortedValues[0];
        }

        const position = (sortedValues.length - 1) * quantile;
        const lowerIndex = Math.floor(position);
        const upperIndex = Math.ceil(position);
        const weight = position - lowerIndex;

        if (upperIndex >= sortedValues.length) {
            return sortedValues[lowerIndex];
        }

        return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
    }

    private static formatColumnList(columns: string[]): string {
        if (columns.length <= 5) {
            return columns.join(', ');
        }
        const displayed = columns.slice(0, 5).join(', ');
        return `${displayed}, ...`;
    }

    private static formatValueForDisplay(value: any, fallback: string): string {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        return fallback;
    }
}
