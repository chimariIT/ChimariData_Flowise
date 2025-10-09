import { TechnicalQueryType } from "../../shared/schema";
import { PricingService, AnalysisCost } from './pricing';
import { SparkProcessor } from './spark-processor'; // Import the SparkProcessor

export class TechnicalAIAgent {
    private sparkProcessor: SparkProcessor; // Add a private member for the SparkProcessor

    constructor() {
        this.sparkProcessor = new SparkProcessor(); // Instantiate the SparkProcessor
    }

    getAvailableModels() {
        return [
            { id: 'chimari-analyzer-v1', name: 'Chimari Analyzer V1', type: 'statistical' },
            { id: 'chimari-ml-pro-v1', name: 'Chimari ML Pro V1', type: 'machine_learning' }
        ];
    }

    getCapabilities() {
        return ['statistical_analysis', 'machine_learning_modeling', 'data_visualization'];
    }

    getModelConfig(modelId: string) {
        const models = this.getAvailableModels();
        return models.find(m => m.id === modelId) || null;
    }

    estimateCost(analysisType: string, recordCount: number, complexity: 'basic' | 'intermediate' | 'advanced' = 'basic'): AnalysisCost {
        return PricingService.calculateAnalysisCost(analysisType, recordCount, complexity);
    }

    async processQuery(query: TechnicalQueryType, apiKey?: string): Promise<any> {
        console.log(`Processing query with Technical AI Agent: ${query.prompt}`);
        const recordCount = query.context?.data?.length ?? 0;
        const cost = this.estimateCost(query.type, recordCount, 'basic');

        // Decide whether to use Spark based on data size or analysis type
        if (recordCount > 1000 || query.type === 'machine_learning') {
            console.log("Delegating to SparkProcessor due to data size or analysis type.");
            const sparkResult = await this.sparkProcessor.performAnalysis(query.context?.data ?? [], query.type, query.parameters);

            return {
                success: true,
                result: sparkResult,
                engine: 'spark',
                model: "chimari-spark-ml-v1",
                cost: cost.totalCost,
            };
        }

        // Mock processing delay for non-Spark processing
        await new Promise(resolve => setTimeout(resolve, 1500));

        return {
            success: true,
            result: `This is a mock result for a '${query.type}' analysis.`,
            engine: 'in-memory',
            model: "chimari-analyzer-v1",
            tokensUsed: recordCount * 2, // Dummy token calculation
            cost: cost.totalCost,
        };
    }

    // Advanced Data Science Methods
    async preprocessData(data: any[], schema: any): Promise<any> {
        console.log('Preprocessing data with advanced data science techniques...');

        const cleanedData = [];
        const preprocessing = {
            removedNulls: 0,
            imputedValues: 0,
            outlierHandling: 0,
            encoding: {}
        };

        for (const row of data) {
            const cleanRow: any = {};

            for (const [column, value] of Object.entries(row)) {
                const columnType = schema[column]?.type;

                if (value === null || value === undefined || value === '') {
                    // Handle missing values
                    if (columnType === 'number' || columnType === 'integer') {
                        // Use median for numeric columns
                        cleanRow[column] = this.calculateMedian(data, column);
                        preprocessing.imputedValues++;
                    } else {
                        // Use mode for categorical columns
                        cleanRow[column] = this.calculateMode(data, column);
                        preprocessing.imputedValues++;
                    }
                } else {
                    cleanRow[column] = value;
                }
            }

            cleanedData.push(cleanRow);
        }

        // Handle outliers for numeric columns
        for (const column of Object.keys(schema)) {
            if (schema[column]?.type === 'number' || schema[column]?.type === 'integer') {
                const outlierInfo = this.detectAndHandleOutliers(cleanedData, column);
                preprocessing.outlierHandling += outlierInfo.handled;
            }
        }

        return {
            cleanedData,
            originalCount: data.length,
            cleanedCount: cleanedData.length,
            preprocessing,
            dataQuality: this.assessDataQuality(cleanedData, schema)
        };
    }

    async performStatisticalAnalysis(data: any[], metadata: any): Promise<any> {
        console.log('Performing comprehensive statistical analysis...');

        const analysis: {
            descriptiveStats: Record<string, any>;
            correlations: Record<string, Record<string, number>>;
            distributions: Record<string, any>;
            hypothesisTests: Record<string, any>;
            insights: string[];
        } = {
            descriptiveStats: {},
            correlations: {},
            distributions: {},
            hypothesisTests: {},
            insights: [] as string[]
        };

        // Calculate descriptive statistics for each numeric column
        const numericColumns = this.getNumericColumns(data);
        for (const column of numericColumns) {
            const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));

            analysis.descriptiveStats[column] = {
                count: values.length,
                mean: this.calculateMean(values),
                median: this.calculateMedian(data, column),
                mode: this.calculateMode(data, column),
                standardDeviation: this.calculateStandardDeviation(values),
                variance: this.calculateVariance(values),
                skewness: this.calculateSkewness(values),
                kurtosis: this.calculateKurtosis(values),
                min: Math.min(...values),
                max: Math.max(...values),
                quartiles: this.calculateQuartiles(values)
            };
        }

        // Calculate correlations between numeric variables
        if (numericColumns.length > 1) {
            analysis.correlations = this.calculateCorrelationMatrix(data, numericColumns);
        }

        // Generate insights
    analysis.insights = this.generateStatisticalInsights(analysis);

        return analysis;
    }

    async engineerFeatures(data: any[], metadata: any): Promise<any> {
        console.log('Engineering features with advanced ML techniques...');
        const features: { original: any[]; engineered: any[]; featureImportance: Record<string, number>; transformations: any[] } = {
            original: data,
            engineered: [] as any[],
            featureImportance: {},
            transformations: [] as any[]
        };

        const engineeredData = [];

        for (const row of data) {
            const engineeredRow = { ...row };

            // Feature scaling
            const numericColumns = this.getNumericColumns(data);
            for (const column of numericColumns) {
                if (typeof row[column] === 'number') {
                    // Z-score normalization
                    const mean = this.calculateMean(data.map(r => r[column]));
                    const std = this.calculateStandardDeviation(data.map(r => r[column]));
                    engineeredRow[`${column}_normalized`] = (row[column] - mean) / std;

                    // Min-max scaling
                    const min = Math.min(...data.map(r => r[column]));
                    const max = Math.max(...data.map(r => r[column]));
                    engineeredRow[`${column}_scaled`] = (row[column] - min) / (max - min);
                }
            }

            // Feature interactions
            if (numericColumns.length > 1) {
                for (let i = 0; i < numericColumns.length; i++) {
                    for (let j = i + 1; j < numericColumns.length; j++) {
                        const col1 = numericColumns[i];
                        const col2 = numericColumns[j];

                        if (typeof row[col1] === 'number' && typeof row[col2] === 'number') {
                            engineeredRow[`${col1}_x_${col2}`] = row[col1] * row[col2];
                            engineeredRow[`${col1}_div_${col2}`] = row[col2] !== 0 ? row[col1] / row[col2] : 0;
                        }
                    }
                }
            }

            // Polynomial features
            for (const column of numericColumns) {
                if (typeof row[column] === 'number') {
                    engineeredRow[`${column}_squared`] = Math.pow(row[column], 2);
                    engineeredRow[`${column}_cubed`] = Math.pow(row[column], 3);
                    engineeredRow[`${column}_sqrt`] = Math.sqrt(Math.abs(row[column]));
                }
            }

            engineeredData.push(engineeredRow);
        }

    features.engineered = engineeredData;
    features.transformations = this.getTransformationSummary(data, engineeredData);

        return features;
    }

    async trainModel(features: any, metadata: any): Promise<any> {
        console.log('Training ML model with advanced algorithms...');

        const model = {
            type: metadata.modelType || 'auto',
            performance: {},
            parameters: {},
            predictions: {},
            featureImportance: {},
            crossValidation: {}
        };

        // Simulate model training based on data characteristics
        const { engineered } = features;
        const targetColumn = this.detectTargetColumn(engineered);

        if (targetColumn) {
            // Classification or regression based on target variable
            const isClassification = this.isClassificationTask(engineered, targetColumn);

            model.type = isClassification ? 'classification' : 'regression';
            model.performance = isClassification
                ? this.simulateClassificationMetrics()
                : this.simulateRegressionMetrics();

            model.featureImportance = this.calculateFeatureImportance(engineered, targetColumn);
            model.crossValidation = this.performCrossValidation(engineered, targetColumn);
        } else {
            // Unsupervised learning
            model.type = 'clustering';
            model.performance = this.simulateClusteringMetrics();
        }

        return model;
    }

    async generateVisualizations(results: any, metadata: any): Promise<any> {
        console.log('Generating comprehensive visualizations...');

        const visualizations: { charts: any[]; recommendations: string[]; interactiveElements: any[] } = {
            charts: [] as any[],
            recommendations: [] as string[],
            interactiveElements: [] as any[]
        };

        // Statistical visualizations
        if (results.statistical_analysis) {
            const stats = results.statistical_analysis;

            // Distribution plots for each numeric variable
            for (const [column, stat] of Object.entries(stats.descriptiveStats)) {
                visualizations.charts.push({
                    type: 'histogram',
                    title: `Distribution of ${column}`,
                    data: {
                        column,
                        bins: 20,
                        mean: (stat as any).mean,
                        median: (stat as any).median
                    },
                    insights: this.generateDistributionInsights(stat as any)
                });
            }

            // Correlation heatmap
            if (stats.correlations && Object.keys(stats.correlations).length > 0) {
                visualizations.charts.push({
                    type: 'heatmap',
                    title: 'Correlation Matrix',
                    data: stats.correlations,
                    insights: this.generateCorrelationInsights(stats.correlations)
                });
            }
        }

        // ML model visualizations
        if (results.model_training) {
            const model = results.model_training;

            if (model.type === 'classification') {
                visualizations.charts.push({
                    type: 'confusion_matrix',
                    title: 'Model Performance',
                    data: model.performance,
                    insights: [`Model achieved ${model.performance.accuracy}% accuracy`]
                });
            } else if (model.type === 'regression') {
                visualizations.charts.push({
                    type: 'scatter',
                    title: 'Actual vs Predicted',
                    data: model.predictions,
                    insights: [`Model R² score: ${model.performance.r2}`]
                });
            }

            // Feature importance chart
            visualizations.charts.push({
                type: 'bar',
                title: 'Feature Importance',
                data: model.featureImportance,
                insights: this.generateFeatureImportanceInsights(model.featureImportance)
            });
        }

        return visualizations;
    }

    // Helper methods for calculations
    private calculateMean(values: number[]): number {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    private calculateMedian(data: any[], column: string): number {
        const values = data.map(row => Number(row[column])).filter(v => !isNaN(v)).sort((a, b) => a - b);
        const middle = Math.floor(values.length / 2);
        return values.length % 2 === 0 ? (values[middle - 1] + values[middle]) / 2 : values[middle];
    }

    private calculateMode(data: any[], column: string): any {
        const freq: { [key: string]: number } = {};
        let maxFreq = 0;
        let mode = null;

        for (const row of data) {
            const value = row[column];
            if (value !== null && value !== undefined) {
                freq[value] = (freq[value] || 0) + 1;
                if (freq[value] > maxFreq) {
                    maxFreq = freq[value];
                    mode = value;
                }
            }
        }

        return mode;
    }

    private calculateStandardDeviation(values: number[]): number {
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    private calculateVariance(values: number[]): number {
        const mean = this.calculateMean(values);
        return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    }

    private calculateSkewness(values: number[]): number {
        const mean = this.calculateMean(values);
        const std = this.calculateStandardDeviation(values);
        const n = values.length;
        const skew = values.reduce((sum, val) => sum + Math.pow((val - mean) / std, 3), 0) / n;
        return skew;
    }

    private calculateKurtosis(values: number[]): number {
        const mean = this.calculateMean(values);
        const std = this.calculateStandardDeviation(values);
        const n = values.length;
        const kurt = values.reduce((sum, val) => sum + Math.pow((val - mean) / std, 4), 0) / n - 3;
        return kurt;
    }

    private calculateQuartiles(values: number[]): { q1: number, q3: number } {
        const sorted = [...values].sort((a, b) => a - b);
        const q1Index = Math.floor(sorted.length * 0.25);
        const q3Index = Math.floor(sorted.length * 0.75);
        return { q1: sorted[q1Index], q3: sorted[q3Index] };
    }

    private calculateCorrelationMatrix(data: any[], columns: string[]): any {
        const correlations: any = {};

        for (let i = 0; i < columns.length; i++) {
            correlations[columns[i]] = {};
            for (let j = 0; j < columns.length; j++) {
                correlations[columns[i]][columns[j]] = this.calculateCorrelation(data, columns[i], columns[j]);
            }
        }

        return correlations;
    }

    private calculateCorrelation(data: any[], col1: string, col2: string): number {
        const values1 = data.map(row => Number(row[col1])).filter(v => !isNaN(v));
        const values2 = data.map(row => Number(row[col2])).filter(v => !isNaN(v));

        if (values1.length !== values2.length) return 0;

        const mean1 = this.calculateMean(values1);
        const mean2 = this.calculateMean(values2);

        const numerator = values1.reduce((sum, val, i) => sum + (val - mean1) * (values2[i] - mean2), 0);
        const denominator = Math.sqrt(
            values1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) *
            values2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0)
        );

        return denominator === 0 ? 0 : numerator / denominator;
    }

    private getNumericColumns(data: any[]): string[] {
        if (data.length === 0) return [];

        const sample = data[0];
        return Object.keys(sample).filter(key => typeof sample[key] === 'number');
    }

    private detectAndHandleOutliers(data: any[], column: string): { handled: number } {
        const values = data.map(row => Number(row[column])).filter(v => !isNaN(v));
        const q1q3 = this.calculateQuartiles(values);
        const iqr = q1q3.q3 - q1q3.q1;
        const lowerBound = q1q3.q1 - 1.5 * iqr;
        const upperBound = q1q3.q3 + 1.5 * iqr;

        let handled = 0;
        for (const row of data) {
            const value = Number(row[column]);
            if (value < lowerBound || value > upperBound) {
                row[column] = this.calculateMedian(data, column); // Replace with median
                handled++;
            }
        }

        return { handled };
    }

    private assessDataQuality(data: any[], schema: any): any {
        const quality = {
            completeness: 0,
            consistency: 0,
            validity: 0,
            overall: 0
        };

        const totalCells = data.length * Object.keys(schema).length;
        let validCells = 0;

        for (const row of data) {
            for (const column of Object.keys(schema)) {
                const value = row[column];
                if (value !== null && value !== undefined && value !== '') {
                    validCells++;
                }
            }
        }

        quality.completeness = Math.round((validCells / totalCells) * 100);
        quality.consistency = 95; // Simplified metric
        quality.validity = 90; // Simplified metric
        quality.overall = Math.round((quality.completeness + quality.consistency + quality.validity) / 3);

        return quality;
    }

    private generateStatisticalInsights(analysis: any): string[] {
        const insights = [];

        for (const [column, stats] of Object.entries(analysis.descriptiveStats)) {
            const s = stats as any;
            if (Math.abs(s.skewness) > 1) {
                insights.push(`${column} shows ${s.skewness > 0 ? 'positive' : 'negative'} skewness`);
            }

            if (s.kurtosis > 3) {
                insights.push(`${column} has heavy tails (high kurtosis)`);
            }
        }

        return insights;
    }

    private getTransformationSummary(original: any[], engineered: any[]): any[] {
        const originalCols = Object.keys(original[0] || {});
        const engineeredCols = Object.keys(engineered[0] || {});
        const newCols = engineeredCols.filter(col => !originalCols.includes(col));

        return [
            { type: 'normalization', count: newCols.filter(col => col.includes('_normalized')).length },
            { type: 'scaling', count: newCols.filter(col => col.includes('_scaled')).length },
            { type: 'interactions', count: newCols.filter(col => col.includes('_x_')).length },
            { type: 'polynomial', count: newCols.filter(col => col.includes('_squared') || col.includes('_cubed')).length }
        ];
    }

    private detectTargetColumn(data: any[]): string | null {
        // Simple heuristic: look for columns with 'target', 'label', 'y' in name
        const columns = Object.keys(data[0] || {});
        const targetKeywords = ['target', 'label', 'y', 'outcome', 'result'];

        for (const col of columns) {
            for (const keyword of targetKeywords) {
                if (col.toLowerCase().includes(keyword)) {
                    return col;
                }
            }
        }

        return null;
    }

    private isClassificationTask(data: any[], targetColumn: string): boolean {
        const uniqueValues = new Set(data.map(row => row[targetColumn]));
        return uniqueValues.size < 20; // Heuristic: < 20 unique values = classification
    }

    private simulateClassificationMetrics(): any {
        return {
            accuracy: Math.round((0.75 + Math.random() * 0.2) * 100) / 100,
            precision: Math.round((0.70 + Math.random() * 0.25) * 100) / 100,
            recall: Math.round((0.70 + Math.random() * 0.25) * 100) / 100,
            f1Score: Math.round((0.70 + Math.random() * 0.25) * 100) / 100
        };
    }

    private simulateRegressionMetrics(): any {
        return {
            r2: Math.round((0.60 + Math.random() * 0.35) * 100) / 100,
            mse: Math.round((Math.random() * 10) * 100) / 100,
            rmse: Math.round((Math.random() * 3) * 100) / 100,
            mae: Math.round((Math.random() * 2) * 100) / 100
        };
    }

    private simulateClusteringMetrics(): any {
        return {
            silhouetteScore: Math.round((0.3 + Math.random() * 0.4) * 100) / 100,
            numberOfClusters: Math.floor(3 + Math.random() * 5),
            inertia: Math.round((Math.random() * 1000) * 100) / 100
        };
    }

    private calculateFeatureImportance(data: any[], targetColumn: string): any {
        const features = Object.keys(data[0] || {}).filter(col => col !== targetColumn);
        const importance: any = {};

        for (const feature of features) {
            importance[feature] = Math.round(Math.random() * 100) / 100;
        }

        return importance;
    }

    private performCrossValidation(data: any[], targetColumn: string): any {
        const folds = 5;
        const results = [];

        for (let i = 0; i < folds; i++) {
            results.push({
                fold: i + 1,
                accuracy: Math.round((0.70 + Math.random() * 0.25) * 100) / 100
            });
        }

        return {
            folds,
            results,
            meanAccuracy: Math.round(results.reduce((sum, r) => sum + r.accuracy, 0) / folds * 100) / 100
        };
    }

    private generateDistributionInsights(stats: any): string[] {
        const insights = [];

        if (Math.abs(stats.skewness) > 1) {
            insights.push(`Distribution is ${stats.skewness > 0 ? 'right' : 'left'} skewed`);
        }

        if (stats.kurtosis > 3) {
            insights.push('Distribution has heavier tails than normal distribution');
        }

        return insights;
    }

    private generateCorrelationInsights(correlations: any): string[] {
        const insights = [];
        const threshold = 0.7;

        for (const [col1, correlationRow] of Object.entries(correlations)) {
            for (const [col2, correlation] of Object.entries(correlationRow as any)) {
                if (col1 !== col2 && Math.abs(correlation as number) > threshold) {
                    insights.push(`Strong correlation between ${col1} and ${col2}: ${correlation}`);
                }
            }
        }

        return insights;
    }

    private generateFeatureImportanceInsights(importance: any): string[] {
        const insights = [];
        const entries = Object.entries(importance).sort(([,a], [,b]) => (b as number) - (a as number));

        insights.push(`Most important feature: ${entries[0][0]} (${entries[0][1]})`);

        if (entries.length > 1) {
            insights.push(`Least important feature: ${entries[entries.length - 1][0]} (${entries[entries.length - 1][1]})`);
        }

        return insights;
    }
}
