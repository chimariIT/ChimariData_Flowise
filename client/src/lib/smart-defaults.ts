
export interface DatasetSchema {
    columns: {
        name: string;
        type: 'string' | 'number' | 'boolean' | 'date' | 'unknown';
        uniqueCount?: number;
        nullCount?: number;
    }[];
    rowCount?: number;
}

export interface AnalysisRecommendation {
    type: string;
    confidence: number;
    reason: string;
    suggestedParameters?: Record<string, any>;
}

export class SmartDefaultsService {
    static recommendAnalysisTypes(schema: DatasetSchema): AnalysisRecommendation[] {
        const recommendations: AnalysisRecommendation[] = [];
        const numericColumns = schema.columns.filter(c => c.type === 'number');
        const dateColumns = schema.columns.filter(c => c.type === 'date');
        const categoricalColumns = schema.columns.filter(c => c.type === 'string' && (c.uniqueCount || 0) < 20);

        // 1. Time Series Analysis
        if (dateColumns.length > 0 && numericColumns.length > 0) {
            recommendations.push({
                type: 'time_series',
                confidence: 0.9,
                reason: 'Date and numeric columns detected, suitable for trend analysis.',
                suggestedParameters: {
                    dateField: dateColumns[0].name,
                    valueField: numericColumns[0].name
                }
            });
        }

        // 2. Correlation Analysis
        if (numericColumns.length >= 2) {
            recommendations.push({
                type: 'correlation',
                confidence: 0.85,
                reason: 'Multiple numeric columns detected, good for finding relationships.',
                suggestedParameters: {
                    fields: numericColumns.map(c => c.name).slice(0, 5)
                }
            });
        }

        // 3. Distribution Analysis
        if (numericColumns.length > 0) {
            recommendations.push({
                type: 'distribution',
                confidence: 0.8,
                reason: 'Numeric columns available for distribution analysis.',
                suggestedParameters: {
                    field: numericColumns[0].name
                }
            });
        }

        // 4. Categorical Analysis
        if (categoricalColumns.length > 0) {
            recommendations.push({
                type: 'categorical',
                confidence: 0.75,
                reason: 'Low-cardinality string columns detected, suitable for categorical breakdown.',
                suggestedParameters: {
                    field: categoricalColumns[0].name
                }
            });
        }

        return recommendations.sort((a, b) => b.confidence - a.confidence);
    }

    static getSmartDefaults(schema: DatasetSchema, analysisType: string): Record<string, any> {
        const numericColumns = schema.columns.filter(c => c.type === 'number');
        const dateColumns = schema.columns.filter(c => c.type === 'date');
        const categoricalColumns = schema.columns.filter(c => c.type === 'string' && (c.uniqueCount || 0) < 20);

        switch (analysisType) {
            case 'time_series':
                return {
                    dateField: dateColumns[0]?.name,
                    valueField: numericColumns[0]?.name,
                    interval: 'monthly'
                };
            case 'correlation':
                return {
                    fields: numericColumns.map(c => c.name).slice(0, 10),
                    method: 'pearson'
                };
            case 'distribution':
                return {
                    field: numericColumns[0]?.name,
                    bins: 10
                };
            case 'categorical':
                return {
                    field: categoricalColumns[0]?.name,
                    limit: 10
                };
            default:
                return {};
        }
    }
}
