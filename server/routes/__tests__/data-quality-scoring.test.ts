import { describe, it, expect } from 'vitest';

/**
 * Data Quality Scoring Tests
 * 
 * These tests verify the quality scoring algorithms used in the data quality analysis.
 * The functions are extracted from server/routes/data-quality.ts for testing.
 */

// Helper functions (extracted from data-quality.ts for testing)
function calculateCompleteness(data: any): number {
    const totalCells = (data.total_rows || 0) * (data.total_columns || 0);
    if (totalCells === 0) return 100;
    const missingCells = data.missing_values || 0;
    return Math.round(((totalCells - missingCells) / totalCells) * 100);
}

function calculateConsistency(data: any): number {
    let score = 100;
    if (data.type_inconsistencies) score -= Math.min(data.type_inconsistencies * 5, 30);
    if (data.format_inconsistencies) score -= Math.min(data.format_inconsistencies * 3, 20);
    return Math.max(score, 0);
}

function calculateAccuracy(data: any): number {
    let score = 100;
    if (data.outliers) {
        const outlierPercent = (data.outliers / data.total_rows) * 100;
        score -= Math.min(outlierPercent * 2, 30);
    }
    if (data.invalid_values) {
        const invalidPercent = (data.invalid_values / (data.total_rows * data.total_columns)) * 100;
        score -= Math.min(invalidPercent * 5, 40);
    }
    return Math.max(Math.round(score), 0);
}

function generateQualityIssues(data: any): any[] {
    const issues = [];

    if (data.missing_values > 0) {
        const missingPercent = (data.missing_values / (data.total_rows * data.total_columns)) * 100;
        issues.push({
            id: 'missing_values',
            severity: missingPercent > 10 ? 'high' : missingPercent > 5 ? 'medium' : 'low',
            description: `${data.missing_values.toLocaleString()} missing values found (${missingPercent.toFixed(1)}%)`,
            suggestion: 'Consider imputing with mean/median for numerical columns or mode for categorical columns',
            autoFixable: true
        });
    }

    if (data.duplicate_rows > 0) {
        issues.push({
            id: 'duplicate_rows',
            severity: data.duplicate_rows > 100 ? 'high' : 'medium',
            description: `${data.duplicate_rows.toLocaleString()} duplicate rows detected`,
            suggestion: 'Remove duplicate rows to improve data quality',
            autoFixable: true
        });
    }

    if (data.outliers > 0) {
        issues.push({
            id: 'outliers',
            severity: 'medium',
            description: `${data.outliers} potential outliers detected`,
            suggestion: 'Review outliers - they may be errors or valid extreme values',
            autoFixable: false
        });
    }

    if (data.type_inconsistencies > 0) {
        issues.push({
            id: 'type_inconsistencies',
            severity: 'high',
            description: `${data.type_inconsistencies} columns have inconsistent data types`,
            suggestion: 'Standardize data types for consistent processing',
            autoFixable: true
        });
    }

    return issues;
}

function getFixOperation(issueId: string): string {
    const operations: Record<string, string> = {
        missing_values: 'impute_missing',
        duplicate_rows: 'remove_duplicates',
        type_inconsistencies: 'standardize_types'
    };
    return operations[issueId] || 'unknown';
}

describe('Data Quality Scoring', () => {
    describe('calculateCompleteness', () => {
        it('should return 100 for perfect data with no missing values', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 0
            };
            expect(calculateCompleteness(data)).toBe(100);
        });

        it('should calculate correct percentage for data with missing values', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 100 // 10% missing
            };
            expect(calculateCompleteness(data)).toBe(90);
        });

        it('should return 100 for empty dataset', () => {
            const data = {
                total_rows: 0,
                total_columns: 0,
                missing_values: 0
            };
            expect(calculateCompleteness(data)).toBe(100);
        });

        it('should handle 50% missing values', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 500
            };
            expect(calculateCompleteness(data)).toBe(50);
        });

        it('should round to nearest integer', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 333 // 33.3%
            };
            expect(calculateCompleteness(data)).toBe(67);
        });
    });

    describe('calculateConsistency', () => {
        it('should return 100 for perfectly consistent data', () => {
            const data = {
                type_inconsistencies: 0,
                format_inconsistencies: 0
            };
            expect(calculateConsistency(data)).toBe(100);
        });

        it('should deduct points for type inconsistencies', () => {
            const data = {
                type_inconsistencies: 5,
                format_inconsistencies: 0
            };
            expect(calculateConsistency(data)).toBe(75); // 100 - (5 * 5)
        });

        it('should deduct points for format inconsistencies', () => {
            const data = {
                type_inconsistencies: 0,
                format_inconsistencies: 10
            };
            expect(calculateConsistency(data)).toBe(80); // 100 - (10 * 3) = 70, but capped at 20 max deduction = 80
        });

        it('should cap type inconsistency deduction at 30', () => {
            const data = {
                type_inconsistencies: 10,
                format_inconsistencies: 0
            };
            expect(calculateConsistency(data)).toBe(70); // 100 - 30 (capped)
        });

        it('should cap format inconsistency deduction at 20', () => {
            const data = {
                type_inconsistencies: 0,
                format_inconsistencies: 20
            };
            expect(calculateConsistency(data)).toBe(80); // 100 - 20 (capped)
        });

        it('should not go below 0', () => {
            const data = {
                type_inconsistencies: 100,
                format_inconsistencies: 100
            };
            expect(calculateConsistency(data)).toBe(50); // 100 - 30 - 20
        });
    });

    describe('calculateAccuracy', () => {
        it('should return 100 for perfectly accurate data', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 0,
                invalid_values: 0
            };
            expect(calculateAccuracy(data)).toBe(100);
        });

        it('should deduct points for outliers', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 10, // 10% outliers
                invalid_values: 0
            };
            expect(calculateAccuracy(data)).toBe(80); // 100 - (10% * 2)
        });

        it('should deduct points for invalid values', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 0,
                invalid_values: 100 // 10% invalid
            };
            expect(calculateAccuracy(data)).toBe(60); // 100 - (10% * 5) = 50, but capped at 40 max deduction = 60
        });

        it('should cap outlier deduction at 30', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 50, // 50% outliers
                invalid_values: 0
            };
            expect(calculateAccuracy(data)).toBe(70); // 100 - 30 (capped)
        });

        it('should cap invalid value deduction at 40', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 0,
                invalid_values: 1000 // 100% invalid
            };
            expect(calculateAccuracy(data)).toBe(60); // 100 - 40 (capped)
        });

        it('should not go below 0', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 100,
                invalid_values: 1000
            };
            expect(calculateAccuracy(data)).toBe(30); // 100 - 30 - 40
        });
    });

    describe('generateQualityIssues', () => {
        it('should detect missing values issue', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 50
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('missing_values');
            expect(issues[0].severity).toBe('low'); // 5% missing
            expect(issues[0].autoFixable).toBe(true);
        });

        it('should detect high severity missing values', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 150 // 15% missing
            };
            const issues = generateQualityIssues(data);

            expect(issues[0].severity).toBe('high');
        });

        it('should detect duplicate rows issue', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                duplicate_rows: 50
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('duplicate_rows');
            expect(issues[0].severity).toBe('medium');
            expect(issues[0].autoFixable).toBe(true);
        });

        it('should detect high severity duplicate rows', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                duplicate_rows: 150
            };
            const issues = generateQualityIssues(data);

            expect(issues[0].severity).toBe('high');
        });

        it('should detect outliers issue', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                outliers: 10
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('outliers');
            expect(issues[0].severity).toBe('medium');
            expect(issues[0].autoFixable).toBe(false);
        });

        it('should detect type inconsistencies issue', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                type_inconsistencies: 3
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(1);
            expect(issues[0].id).toBe('type_inconsistencies');
            expect(issues[0].severity).toBe('high');
            expect(issues[0].autoFixable).toBe(true);
        });

        it('should detect multiple issues', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 50,
                duplicate_rows: 20,
                outliers: 5,
                type_inconsistencies: 2
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(4);
            expect(issues.map(i => i.id)).toContain('missing_values');
            expect(issues.map(i => i.id)).toContain('duplicate_rows');
            expect(issues.map(i => i.id)).toContain('outliers');
            expect(issues.map(i => i.id)).toContain('type_inconsistencies');
        });

        it('should return empty array for perfect data', () => {
            const data = {
                total_rows: 100,
                total_columns: 10,
                missing_values: 0,
                duplicate_rows: 0,
                outliers: 0,
                type_inconsistencies: 0
            };
            const issues = generateQualityIssues(data);

            expect(issues).toHaveLength(0);
        });
    });

    describe('getFixOperation', () => {
        it('should map missing_values to impute_missing', () => {
            expect(getFixOperation('missing_values')).toBe('impute_missing');
        });

        it('should map duplicate_rows to remove_duplicates', () => {
            expect(getFixOperation('duplicate_rows')).toBe('remove_duplicates');
        });

        it('should map type_inconsistencies to standardize_types', () => {
            expect(getFixOperation('type_inconsistencies')).toBe('standardize_types');
        });

        it('should return unknown for unrecognized issue', () => {
            expect(getFixOperation('invalid_issue')).toBe('unknown');
        });

        it('should return unknown for empty string', () => {
            expect(getFixOperation('')).toBe('unknown');
        });
    });
});
