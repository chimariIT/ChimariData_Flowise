import * as Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface SchemaColumn {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'integer' | 'float';
    nullable: boolean;
    unique: boolean;
    sampleValues: any[];
    missingCount: number;
    missingPercentage: number;
}

interface DataQualityMetrics {
    totalRows: number;
    totalColumns: number;
    completeness: number;
    duplicateRows: number;
    potentialPIIFields: string[];
    dataQualityScore: number;
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

        // Detect potential relationships
        const relationships = this.detectRelationships(data, schema);

        // Generate preview (first 10 rows)
        const preview = data.slice(0, 10);

        return {
            preview,
            schema,
            recordCount: data.length,
            data,
            qualityMetrics,
            relationships
        };
    }

    /**
     * Parse CSV file using PapaParse
     */
    private static async parseCSV(buffer: Buffer): Promise<any[]> {
        return new Promise((resolve, reject) => {
            const csvString = buffer.toString('utf8');

            Papa.parse(csvString, {
                header: true,
                dynamicTyping: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        console.warn('CSV parsing warnings:', results.errors);
                    }
                    resolve(results.data);
                },
                error: (error) => {
                    reject(new Error(`CSV parsing failed: ${error.message}`));
                }
            });
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
            const workbook = XLSX.read(buffer, { type: 'buffer' });

            // Get first sheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // Convert to JSON
            const data = XLSX.utils.sheet_to_json(worksheet, {
                defval: null,
                raw: false
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

        // Check for boolean
        const booleanValues = values.filter(v =>
            typeof v === 'boolean' ||
            v === 'true' ||
            v === 'false' ||
            v === 'TRUE' ||
            v === 'FALSE'
        );
        if (booleanValues.length / values.length > 0.8) return 'boolean';

        // Check for dates
        const dateValues = values.filter(v => {
            if (v instanceof Date) return true;
            if (typeof v === 'string') {
                const parsed = new Date(v);
                return !isNaN(parsed.getTime()) && v.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/);
            }
            return false;
        });
        if (dateValues.length / values.length > 0.8) return 'date';

        // Check for numbers
        const numericValues = values.filter(v => {
            const num = Number(v);
            return !isNaN(num) && isFinite(num);
        });

        if (numericValues.length / values.length > 0.8) {
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

        // Detect potential PII fields
        const potentialPIIFields = this.detectPIIFields(schema);

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
     * Detect potential PII fields based on column names and patterns
     */
    private static detectPIIFields(schema: Record<string, SchemaColumn>): string[] {
        const piiKeywords = [
            'email', 'phone', 'ssn', 'social', 'security',
            'password', 'credit', 'card', 'address', 'zipcode',
            'postal', 'name', 'firstname', 'lastname', 'dob',
            'birth', 'age', 'gender', 'passport', 'license'
        ];

        const piiFields: string[] = [];

        for (const [columnName, columnInfo] of Object.entries(schema)) {
            const lowerName = columnName.toLowerCase().replace(/[_\s]/g, '');

            for (const keyword of piiKeywords) {
                if (lowerName.includes(keyword)) {
                    piiFields.push(columnName);
                    break;
                }
            }
        }

        return piiFields;
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
        // Completeness weight: 40%
        const completenessScore = completeness * 0.4;

        // Uniqueness weight: 30%
        const uniquenessScore = ((totalRows - duplicateRows) / totalRows) * 100 * 0.3;

        // Consistency weight: 30% (based on type consistency)
        const consistencyScore = this.calculateConsistencyScore(schema) * 0.3;

        return Math.round(completenessScore + uniquenessScore + consistencyScore);
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
}
