/**
 * Data Transformation Service
 *
 * Provides comprehensive data cleaning, transformation, and feature engineering
 * capabilities for the ChimariData analysis pipeline.
 */

interface TransformationResult {
    transformedData: any[];
    transformations: TransformationRecord[];
    metadata: TransformationMetadata;
}

interface TransformationRecord {
    column: string;
    operation: string;
    parameters: Record<string, any>;
    affectedRows: number;
    timestamp: Date;
}

interface TransformationMetadata {
    totalRows: number;
    totalColumns: number;
    transformationsApplied: number;
    executionTime: number;
    warnings: string[];
}

interface ImputationConfig {
    columns?: string[];
    strategy: 'mean' | 'median' | 'mode' | 'constant' | 'forward_fill' | 'backward_fill';
    constantValue?: any;
}

interface OutlierConfig {
    columns?: string[];
    method: 'iqr' | 'zscore' | 'isolation_forest';
    threshold?: number;
    action: 'remove' | 'cap' | 'flag';
}

interface NormalizationConfig {
    columns?: string[];
    method: 'min-max' | 'z-score' | 'robust' | 'log';
    range?: [number, number];
}

interface EncodingConfig {
    columns: string[];
    method: 'one-hot' | 'label' | 'ordinal' | 'target';
    categories?: Record<string, string[]>;
    ordinalMapping?: Record<string, Record<string, number>>;
}

interface FeatureEngineeringConfig {
    polynomial?: {
        columns: string[];
        degree: number;
    };
    interactions?: {
        columns: string[][];
    };
    binning?: {
        column: string;
        bins: number | number[];
        labels?: string[];
    }[];
}

export class DataTransformer {
    private transformations: TransformationRecord[] = [];
    private warnings: string[] = [];

    /**
     * Main transformation pipeline
     */
    async transform(
        data: any[],
        config: {
            imputation?: ImputationConfig;
            outliers?: OutlierConfig;
            normalization?: NormalizationConfig;
            encoding?: EncodingConfig;
            featureEngineering?: FeatureEngineeringConfig;
        }
    ): Promise<TransformationResult> {
        const startTime = Date.now();
        let transformedData = [...data];

        // 1. Missing value imputation
        if (config.imputation) {
            transformedData = this.imputeMissingValues(transformedData, config.imputation);
        }

        // 2. Outlier handling
        if (config.outliers) {
            transformedData = this.handleOutliers(transformedData, config.outliers);
        }

        // 3. Normalization/Scaling
        if (config.normalization) {
            transformedData = this.normalizeData(transformedData, config.normalization);
        }

        // 4. Categorical encoding
        if (config.encoding) {
            transformedData = this.encodeCategories(transformedData, config.encoding);
        }

        // 5. Feature engineering
        if (config.featureEngineering) {
            transformedData = this.engineerFeatures(transformedData, config.featureEngineering);
        }

        const executionTime = Date.now() - startTime;

        return {
            transformedData,
            transformations: this.transformations,
            metadata: {
                totalRows: transformedData.length,
                totalColumns: transformedData.length > 0 ? Object.keys(transformedData[0]).length : 0,
                transformationsApplied: this.transformations.length,
                executionTime,
                warnings: this.warnings
            }
        };
    }

    /**
     * MISSING VALUE IMPUTATION
     */
    private imputeMissingValues(data: any[], config: ImputationConfig): any[] {
        const columns = config.columns || Object.keys(data[0] || {});
        let affectedRows = 0;

        const transformedData = data.map(row => {
            const newRow = { ...row };
            let rowModified = false;

            for (const column of columns) {
                if (this.isMissing(row[column])) {
                    newRow[column] = this.getImputationValue(data, column, config.strategy, config.constantValue);
                    rowModified = true;
                }
            }

            if (rowModified) affectedRows++;
            return newRow;
        });

        this.transformations.push({
            column: columns.join(', '),
            operation: `imputation_${config.strategy}`,
            parameters: { strategy: config.strategy, constantValue: config.constantValue },
            affectedRows,
            timestamp: new Date()
        });

        return transformedData;
    }

    private isMissing(value: any): boolean {
        return value === null || value === undefined || value === '' ||
               (typeof value === 'number' && isNaN(value));
    }

    private getImputationValue(data: any[], column: string, strategy: string, constantValue?: any): any {
        const values = data.map(row => row[column]).filter(v => !this.isMissing(v));

        switch (strategy) {
            case 'mean':
                return values.reduce((sum, v) => sum + Number(v), 0) / values.length;

            case 'median':
                const sorted = values.map(v => Number(v)).sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 === 0
                    ? (sorted[mid - 1] + sorted[mid]) / 2
                    : sorted[mid];

            case 'mode':
                const frequency: Record<string, number> = {};
                values.forEach(v => {
                    const key = String(v);
                    frequency[key] = (frequency[key] || 0) + 1;
                });
                const mode = Object.entries(frequency).reduce((a, b) => b[1] > a[1] ? b : a)[0];
                return values.find(v => String(v) === mode);

            case 'constant':
                return constantValue;

            case 'forward_fill':
                // Return the last non-missing value (handled in main loop)
                return null;

            case 'backward_fill':
                // Return the next non-missing value (handled in main loop)
                return null;

            default:
                return null;
        }
    }

    /**
     * OUTLIER DETECTION AND HANDLING
     */
    private handleOutliers(data: any[], config: OutlierConfig): any[] {
        const columns = config.columns || this.getNumericColumns(data);
        let affectedRows = 0;

        let result = data.map(row => ({ ...row }));

        for (const column of columns) {
            const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));

            if (values.length === 0) continue;

            const outlierIndices = this.detectOutliers(values, config.method, config.threshold);

            if (config.action === 'remove') {
                result = result.filter((_, idx) => !outlierIndices.has(idx));
                affectedRows += outlierIndices.size;
            } else if (config.action === 'cap') {
                const { min, max } = this.getOutlierCaps(values, config.method, config.threshold);
                result.forEach((row, idx) => {
                    if (outlierIndices.has(idx)) {
                        const value = Number(row[column]);
                        row[column] = value < min ? min : (value > max ? max : value);
                        affectedRows++;
                    }
                });
            } else if (config.action === 'flag') {
                result.forEach((row, idx) => {
                    if (outlierIndices.has(idx)) {
                        row[`${column}_is_outlier`] = true;
                        affectedRows++;
                    }
                });
            }
        }

        this.transformations.push({
            column: columns.join(', '),
            operation: `outlier_${config.method}_${config.action}`,
            parameters: { method: config.method, threshold: config.threshold, action: config.action },
            affectedRows,
            timestamp: new Date()
        });

        return result;
    }

    private detectOutliers(values: number[], method: string, threshold?: number): Set<number> {
        const outliers = new Set<number>();

        if (method === 'iqr') {
            const sorted = [...values].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            const multiplier = threshold || 1.5;
            const lowerBound = q1 - multiplier * iqr;
            const upperBound = q3 + multiplier * iqr;

            values.forEach((v, idx) => {
                if (v < lowerBound || v > upperBound) {
                    outliers.add(idx);
                }
            });
        } else if (method === 'zscore') {
            const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
            const stdDev = Math.sqrt(
                values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
            );
            const zThreshold = threshold || 3;

            values.forEach((v, idx) => {
                const zScore = Math.abs((v - mean) / stdDev);
                if (zScore > zThreshold) {
                    outliers.add(idx);
                }
            });
        }

        return outliers;
    }

    private getOutlierCaps(values: number[], method: string, threshold?: number): { min: number; max: number } {
        if (method === 'iqr') {
            const sorted = [...values].sort((a, b) => a - b);
            const q1 = sorted[Math.floor(sorted.length * 0.25)];
            const q3 = sorted[Math.floor(sorted.length * 0.75)];
            const iqr = q3 - q1;
            const multiplier = threshold || 1.5;
            return {
                min: q1 - multiplier * iqr,
                max: q3 + multiplier * iqr
            };
        } else if (method === 'zscore') {
            const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
            const stdDev = Math.sqrt(
                values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
            );
            const zThreshold = threshold || 3;
            return {
                min: mean - zThreshold * stdDev,
                max: mean + zThreshold * stdDev
            };
        }

        return { min: Math.min(...values), max: Math.max(...values) };
    }

    /**
     * NORMALIZATION AND SCALING
     */
    private normalizeData(data: any[], config: NormalizationConfig): any[] {
        const columns = config.columns || this.getNumericColumns(data);
        const transformedData = data.map(row => ({ ...row }));

        for (const column of columns) {
            const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));

            if (values.length === 0) continue;

            const scalingParams = this.getScalingParameters(values, config.method, config.range);

            transformedData.forEach(row => {
                if (!this.isMissing(row[column])) {
                    row[column] = this.scaleValue(Number(row[column]), scalingParams, config.method);
                }
            });
        }

        this.transformations.push({
            column: columns.join(', '),
            operation: `normalization_${config.method}`,
            parameters: { method: config.method, range: config.range },
            affectedRows: data.length,
            timestamp: new Date()
        });

        return transformedData;
    }

    private getScalingParameters(values: number[], method: string, range?: [number, number]): any {
        switch (method) {
            case 'min-max':
                return {
                    min: Math.min(...values),
                    max: Math.max(...values),
                    targetMin: range?.[0] || 0,
                    targetMax: range?.[1] || 1
                };

            case 'z-score':
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const stdDev = Math.sqrt(
                    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
                );
                return { mean, stdDev };

            case 'robust':
                const sorted = [...values].sort((a, b) => a - b);
                const median = sorted[Math.floor(sorted.length / 2)];
                const q1 = sorted[Math.floor(sorted.length * 0.25)];
                const q3 = sorted[Math.floor(sorted.length * 0.75)];
                const iqr = q3 - q1;
                return { median, iqr };

            case 'log':
                return { base: Math.E };

            default:
                return {};
        }
    }

    private scaleValue(value: number, params: any, method: string): number {
        switch (method) {
            case 'min-max':
                if (params.max === params.min) return params.targetMin;
                return ((value - params.min) / (params.max - params.min)) *
                       (params.targetMax - params.targetMin) + params.targetMin;

            case 'z-score':
                if (params.stdDev === 0) return 0;
                return (value - params.mean) / params.stdDev;

            case 'robust':
                if (params.iqr === 0) return 0;
                return (value - params.median) / params.iqr;

            case 'log':
                return value > 0 ? Math.log(value) : 0;

            default:
                return value;
        }
    }

    /**
     * CATEGORICAL ENCODING
     */
    private encodeCategories(data: any[], config: EncodingConfig): any[] {
        let transformedData = data.map(row => ({ ...row }));

        for (const column of config.columns) {
            if (config.method === 'one-hot') {
                transformedData = this.oneHotEncode(transformedData, column);
            } else if (config.method === 'label') {
                transformedData = this.labelEncode(transformedData, column);
            } else if (config.method === 'ordinal') {
                transformedData = this.ordinalEncode(transformedData, column, config.ordinalMapping?.[column]);
            }
        }

        this.transformations.push({
            column: config.columns.join(', '),
            operation: `encoding_${config.method}`,
            parameters: { method: config.method },
            affectedRows: data.length,
            timestamp: new Date()
        });

        return transformedData;
    }

    private oneHotEncode(data: any[], column: string): any[] {
        const uniqueValues = [...new Set(data.map(row => row[column]).filter(v => !this.isMissing(v)))];

        return data.map(row => {
            const newRow = { ...row };
            uniqueValues.forEach(value => {
                newRow[`${column}_${value}`] = row[column] === value ? 1 : 0;
            });
            delete newRow[column];
            return newRow;
        });
    }

    private labelEncode(data: any[], column: string): any[] {
        const uniqueValues = [...new Set(data.map(row => row[column]).filter(v => !this.isMissing(v)))];
        const labelMap: Record<string, number> = {};
        uniqueValues.forEach((value, idx) => {
            labelMap[String(value)] = idx;
        });

        return data.map(row => ({
            ...row,
            [column]: this.isMissing(row[column]) ? null : labelMap[String(row[column])]
        }));
    }

    private ordinalEncode(data: any[], column: string, mapping?: Record<string, number>): any[] {
        if (!mapping) {
            this.warnings.push(`No ordinal mapping provided for ${column}, falling back to label encoding`);
            return this.labelEncode(data, column);
        }

        return data.map(row => ({
            ...row,
            [column]: this.isMissing(row[column]) ? null : mapping[String(row[column])]
        }));
    }

    /**
     * FEATURE ENGINEERING
     */
    private engineerFeatures(data: any[], config: FeatureEngineeringConfig): any[] {
        let transformedData = data.map(row => ({ ...row }));

        // Polynomial features
        if (config.polynomial) {
            transformedData = this.createPolynomialFeatures(
                transformedData,
                config.polynomial.columns,
                config.polynomial.degree
            );
        }

        // Interaction features
        if (config.interactions) {
            transformedData = this.createInteractionFeatures(
                transformedData,
                config.interactions.columns
            );
        }

        // Binning
        if (config.binning) {
            for (const binConfig of config.binning) {
                transformedData = this.binFeature(
                    transformedData,
                    binConfig.column,
                    binConfig.bins,
                    binConfig.labels
                );
            }
        }

        this.transformations.push({
            column: 'multiple',
            operation: 'feature_engineering',
            parameters: config,
            affectedRows: data.length,
            timestamp: new Date()
        });

        return transformedData;
    }

    private createPolynomialFeatures(data: any[], columns: string[], degree: number): any[] {
        return data.map(row => {
            const newRow = { ...row };

            for (const column of columns) {
                const value = Number(row[column]);
                if (!isNaN(value)) {
                    for (let d = 2; d <= degree; d++) {
                        newRow[`${column}_pow_${d}`] = Math.pow(value, d);
                    }
                }
            }

            return newRow;
        });
    }

    private createInteractionFeatures(data: any[], columnPairs: string[][]): any[] {
        return data.map(row => {
            const newRow = { ...row };

            for (const [col1, col2] of columnPairs) {
                const val1 = Number(row[col1]);
                const val2 = Number(row[col2]);
                if (!isNaN(val1) && !isNaN(val2)) {
                    newRow[`${col1}_x_${col2}`] = val1 * val2;
                }
            }

            return newRow;
        });
    }

    private binFeature(data: any[], column: string, bins: number | number[], labels?: string[]): any[] {
        const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));
        const binEdges = Array.isArray(bins) ? bins : this.createBinEdges(values, bins);

        return data.map(row => {
            const newRow = { ...row };
            const value = Number(row[column]);

            if (!isNaN(value)) {
                const binIndex = this.getBinIndex(value, binEdges);
                newRow[`${column}_bin`] = labels?.[binIndex] || `bin_${binIndex}`;
            }

            return newRow;
        });
    }

    private createBinEdges(values: number[], numBins: number): number[] {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binWidth = (max - min) / numBins;

        return Array.from({ length: numBins + 1 }, (_, i) => min + i * binWidth);
    }

    private getBinIndex(value: number, binEdges: number[]): number {
        for (let i = 0; i < binEdges.length - 1; i++) {
            if (value >= binEdges[i] && value < binEdges[i + 1]) {
                return i;
            }
        }
        return binEdges.length - 2; // Last bin
    }

    /**
     * UTILITY METHODS
     */
    private getNumericColumns(data: any[]): string[] {
        if (data.length === 0) return [];

        const firstRow = data[0];
        return Object.keys(firstRow).filter(key => {
            const value = firstRow[key];
            return typeof value === 'number' || !isNaN(Number(value));
        });
    }

    /**
     * LEGACY METHODS (for backward compatibility)
     */
    detectOutliersLegacy(data: any[], config: any): any {
        const outlierConfig: OutlierConfig = {
            method: config.method || 'iqr',
            action: 'flag',
            threshold: config.threshold
        };

        const result = this.handleOutliers(data, outlierConfig);

        return {
            outliers: result.filter(row =>
                Object.keys(row).some(key => key.endsWith('_is_outlier'))
            )
        };
    }

    analyzeMissingDataLegacy(data: any[], config: any): any {
        const missingData: Record<string, any> = {};

        const columns = Object.keys(data[0] || {});
        for (const column of columns) {
            const values = data.map(row => row[column]);
            const missingCount = values.filter(v => this.isMissing(v)).length;

            if (missingCount > 0) {
                missingData[column] = {
                    count: missingCount,
                    percentage: (missingCount / data.length) * 100
                };
            }
        }

        return { missingData };
    }

    testNormalityLegacy(data: any[], config: any): any {
        // Simplified normality test using skewness and kurtosis
        const columns = config.columns || this.getNumericColumns(data);
        const normalityTest: Record<string, any> = {};

        for (const column of columns) {
            const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));

            if (values.length > 0) {
                const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);

                // Calculate skewness
                const skewness = values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 3), 0) / values.length;

                // Calculate kurtosis
                const kurtosis = values.reduce((sum, v) => sum + Math.pow((v - mean) / stdDev, 4), 0) / values.length - 3;

                normalityTest[column] = {
                    skewness,
                    kurtosis,
                    isNormal: Math.abs(skewness) < 1 && Math.abs(kurtosis) < 3
                };
            }
        }

        return { normalityTest };
    }
}

// Export singleton instance for backward compatibility
export const dataTransformer = new DataTransformer();

// Export legacy interface
export const DataTransformerLegacy = {
    detectOutliers: (data: any[], config: any) => dataTransformer.detectOutliersLegacy(data, config),
    analyzeMissingData: (data: any[], config: any) => dataTransformer.analyzeMissingDataLegacy(data, config),
    testNormality: (data: any[], config: any) => dataTransformer.testNormalityLegacy(data, config),
};
