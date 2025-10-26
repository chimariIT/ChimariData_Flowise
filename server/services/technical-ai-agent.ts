import { TechnicalQueryType } from "../../shared/schema";
import { PricingService, AnalysisCost } from './pricing';
import { SparkProcessor } from './spark-processor';
import { intelligentLibrarySelector, DatasetCharacteristics, VisualizationRequirements, AnalysisRequirements } from './intelligent-library-selector';
import { mlLLMUsageTracker } from './ml-llm-usage-tracker';

export class TechnicalAIAgent {
    private sparkProcessor: SparkProcessor; // Add a private member for the SparkProcessor

    constructor() {
        this.sparkProcessor = new SparkProcessor(); // Instantiate the SparkProcessor
    }

    /**
     * Process task from message broker for real-time agent coordination
     */
    async processTask(task: any, projectId: string): Promise<any> {
        const { stepName, dependency, project, previousResults } = task;
        
        console.log(`Technical Agent processing task: ${stepName} for project ${projectId}`);
        
        try {
            switch (stepName) {
                case 'data_preprocessing':
                    return await this.preprocessData(project.data, project.schema);

                case 'statistical_analysis':
                    return await this.performStatisticalAnalysis(
                        previousResults.data_preprocessing?.cleanedData || project.data,
                        dependency.metadata
                    );

                case 'feature_engineering':
                    return await this.engineerFeatures(
                        previousResults.data_preprocessing?.cleanedData || project.data,
                        dependency.metadata
                    );

                case 'model_training':
                    return await this.trainModel(
                        previousResults.feature_engineering?.features,
                        dependency.metadata
                    );

                case 'visualization_generation':
                    return await this.generateVisualizations(
                        previousResults,
                        dependency.metadata
                    );

                default:
                    throw new Error(`Technical Agent cannot handle step: ${stepName}`);
            }
        } catch (error) {
            console.error(`Technical Agent task ${stepName} failed:`, error);
            throw error;
        }
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

            // CRITICAL: Validate no mock data in production
            if (process.env.NODE_ENV === 'production' && sparkResult.mock === true) {
                console.error('🔴 CRITICAL: Mock data detected in production environment!');
                throw new Error('PRODUCTION_ERROR: Mock data detected. Real analysis unavailable. Please check Spark cluster configuration.');
            }

            return {
                success: true,
                result: sparkResult,
                engine: 'spark',
                model: "chimari-spark-ml-v1",
                cost: cost.totalCost,
            };
        }

        // REAL IMPLEMENTATION: Use Tool Registry for analysis
        console.log(`Routing ${query.type} analysis to Tool Registry...`);

        try {
            // Import tool execution function
            const { executeTool } = require('./mcp-tool-registry');

            const data = query.context?.data || [];
            const parameters = query.parameters || {};

            let toolName: string;
            let toolInput: any;

            // Map query type to appropriate tool with intelligent library selection
            if (query.type === 'statistical_analysis' || query.type === 'descriptive_stats' ||
                query.type === 'hypothesis_testing' || query.type === 'anova' ||
                query.type === 'regression' || query.type === 'correlation') {
                // Use statistical analyzer tool with intelligent library selection
                toolName = 'statistical_analyzer';
                
                // Analyze dataset characteristics for intelligent library selection
                const datasetCharacteristics = this.analyzeDatasetCharacteristics(data);
                const analysisRequirements = this.extractAnalysisRequirements(query, parameters);
                
                // Get intelligent library recommendations
                const libraryRecommendations = intelligentLibrarySelector.selectStatisticalLibrary(
                    datasetCharacteristics,
                    analysisRequirements
                );
                
                const selectedLibrary = libraryRecommendations[0];
                console.log(`🔬 Technical Agent selected statistical library: ${selectedLibrary.library} (confidence: ${selectedLibrary.confidence})`);
                
                toolInput = {
                    data,
                    config: {
                        analysisType: this.mapQueryTypeToAnalysisType(query.type),
                        targetVariable: parameters.targetVariable,
                        multivariateVariables: parameters.features || parameters.variables,
                        covariates: parameters.covariates,
                        // Enhanced config with intelligent library selection
                        library: selectedLibrary.library,
                        libraryConfidence: selectedLibrary.confidence,
                        libraryReasoning: selectedLibrary.reasoning,
                        alternatives: libraryRecommendations.slice(1).map(rec => ({
                            library: rec.library,
                            confidence: rec.confidence,
                            reasoning: rec.reasoning
                        })),
                        // Performance optimizations based on library
                        performancePriority: parameters.performancePriority || 'balanced',
                        realTime: parameters.realTime || false,
                        interactive: parameters.interactive || false,
                        ...parameters
                    }
                };
            } else if (query.type === 'machine_learning' || query.type === 'classification' ||
                       query.type === 'clustering' || query.type === 'time_series' ||
                       query.type === 'anomaly_detection') {
                // Use comprehensive ML pipeline tool with intelligent library selection
                toolName = 'comprehensive_ml_pipeline';
                
                // Analyze dataset characteristics for ML library selection
                const datasetCharacteristics = this.analyzeDatasetCharacteristics(data);
                
                toolInput = {
                    data,
                    config: {
                        analysisType: this.mapQueryTypeToMLType(query.type),
                        targetColumn: parameters.targetVariable || parameters.targetColumn,
                        features: parameters.features,
                        parameters: parameters.mlParams || {},
                        // Enhanced config with intelligent ML library selection
                        datasetCharacteristics,
                        useAutoML: parameters.useAutoML || false,
                        enableExplainability: parameters.enableExplainability || false,
                        performancePriority: parameters.performancePriority || 'balanced',
                        ...parameters
                    }
                };
            } else if (query.type === 'visualization' || query.type === 'dashboard') {
                // Use visualization engine tool with intelligent library selection
                toolName = 'visualization_engine';
                
                // Analyze dataset characteristics for visualization library selection
                const datasetCharacteristics = this.analyzeDatasetCharacteristics(data);
                const visualizationRequirements = this.extractVisualizationRequirements(query, parameters);
                
                // Get intelligent library recommendations
                const libraryRecommendations = intelligentLibrarySelector.selectVisualizationLibrary(
                    datasetCharacteristics,
                    visualizationRequirements
                );
                
                const selectedLibrary = libraryRecommendations[0];
                console.log(`🎨 Technical Agent selected visualization library: ${selectedLibrary.library} (confidence: ${selectedLibrary.confidence})`);
                
                toolInput = {
                    data,
                    config: {
                        type: parameters.chartType || 'bar',
                        title: parameters.title,
                        xAxis: parameters.xAxis,
                        yAxis: parameters.yAxis,
                        // Enhanced config with intelligent library selection
                        library: selectedLibrary.library,
                        libraryConfidence: selectedLibrary.confidence,
                        libraryReasoning: selectedLibrary.reasoning,
                        alternatives: libraryRecommendations.slice(1).map(rec => ({
                            library: rec.library,
                            confidence: rec.confidence,
                            reasoning: rec.reasoning
                        })),
                        // Visualization-specific optimizations
                        interactive: parameters.interactive !== false, // Default to true
                        styling: parameters.styling || 'professional',
                        exportFormats: parameters.exportFormats || ['png', 'svg'],
                        performancePriority: parameters.performancePriority || 'balanced',
                        ...parameters
                    }
                };
            } else {
                // Default to statistical analyzer for unknown types
                toolName = 'statistical_analyzer';
                toolInput = {
                    data,
                    config: {
                        analysisType: 'descriptive',
                        library: 'pandas', // Default library for exploratory analysis
                        performancePriority: 'balanced',
                        ...parameters
                    }
                };
            }

            // Execute tool via Tool Registry
            const toolResult = await executeTool(
                toolName,
                'technical_ai_agent',
                toolInput,
                {
                    userId: query.context?.userId,
                    projectId: query.context?.projectId
                }
            );

            // CRITICAL: Validate no mock data in production
            if (process.env.NODE_ENV === 'production') {
                if (toolResult.result?.mock === true || toolResult.result?.simulated === true) {
                    console.error('🔴 CRITICAL: Mock data detected in tool result in production!');
                    throw new Error('PRODUCTION_ERROR: Mock data detected in analysis. Real analysis unavailable. Please check Python/tool configuration.');
                }
            }

            // Enhanced billing integration with ML/LLM usage tracking
            const finalCost = toolResult.metrics?.cost || cost.totalCost;
            const libraryUsed = toolResult.result?.librarySelection?.selectedLibrary || toolInput.config?.library || 'unknown';
            
            // Log usage for billing and analytics
            if (query.context?.userId && toolResult.status === 'success') {
                try {
                    if (toolName === 'comprehensive_ml_pipeline' || toolName === 'automl_optimizer') {
                        // Log ML usage
                        await mlLLMUsageTracker.logUsage({
                            userId: query.context.userId,
                            projectId: query.context.projectId,
                            toolName,
                            modelType: 'traditional_ml',
                            libraryUsed,
                            datasetSize: recordCount,
                            executionTimeMs: toolResult.metrics?.duration || 0,
                            billingUnits: mlLLMUsageTracker.calculateMLBillingUnits(
                                toolName,
                                recordCount,
                                toolInput.config?.useAutoML,
                                toolInput.config?.trials
                            ),
                            success: true,
                            metadata: {
                                analysisType: toolInput.config?.analysisType,
                                libraryConfidence: toolResult.result?.librarySelection?.confidence,
                                performancePriority: toolInput.config?.performancePriority
                            }
                        });
                    }
                } catch (billingError) {
                    console.warn('Failed to log usage for billing:', billingError);
                }
            }

            // Return enhanced result with library selection and billing info
            return {
                success: toolResult.status === 'success',
                result: {
                    ...toolResult.result,
                    // Include library selection information
                    librarySelection: toolResult.result?.librarySelection || {
                        selectedLibrary: libraryUsed,
                        confidence: toolInput.config?.libraryConfidence || 0.8,
                        reasoning: toolInput.config?.libraryReasoning || 'Default selection',
                        alternatives: toolInput.config?.alternatives || []
                    }
                },
                engine: 'tool-registry',
                tool: toolName,
                model: "chimari-analyzer-v1",
                tokensUsed: recordCount * 2,
                cost: finalCost,
                billing: {
                    baseCost: cost.totalCost,
                    libraryCost: finalCost - cost.totalCost,
                    libraryUsed,
                    billingUnits: toolResult.metrics?.billingUnits || Math.ceil(finalCost * 100),
                    usageLogged: query.context?.userId ? true : false
                },
                metrics: {
                    ...toolResult.metrics,
                    librarySelection: {
                        selected: libraryUsed,
                        confidence: toolResult.result?.librarySelection?.confidence || 0.8,
                        reasoning: toolResult.result?.librarySelection?.reasoning || 'Default selection'
                    }
                },
                error: toolResult.error
            };

        } catch (error) {
            console.error('Tool execution failed:', error);
            return {
                success: false,
                result: null,
                engine: 'tool-registry',
                model: "chimari-analyzer-v1",
                cost: cost.totalCost,
                error: `Analysis failed: ${(error as Error).message || String(error)}`
            };
        }
    }

    private mapQueryTypeToAnalysisType(queryType: string): string {
        const mapping: Record<string, string> = {
            'statistical_analysis': 'descriptive',
            'descriptive_stats': 'descriptive',
            'hypothesis_testing': 'anova',
            'anova': 'anova',
            'regression': 'regression',
            'correlation': 'descriptive'
        };
        return mapping[queryType] || 'descriptive';
    }

    private mapQueryTypeToMLType(queryType: string): string {
        const mapping: Record<string, string> = {
            'machine_learning': 'classification',
            'classification': 'classification',
            'clustering': 'clustering',
            'time_series': 'timeseries',
            'anomaly_detection': 'anomaly'
        };
        return mapping[queryType] || 'classification';
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

        try {
            // Import tool execution function
            const { executeTool } = require('./mcp-tool-registry');

            const { engineered } = features;
            const targetColumn = this.detectTargetColumn(engineered) || metadata.targetColumn;

            if (!targetColumn) {
                // Unsupervised learning - use clustering
                const toolInput = {
                    data: engineered,
                    config: {
                        analysisType: 'clustering',
                        features: Object.keys(engineered[0] || {}),
                        parameters: {
                            nClusters: metadata.nClusters || 3,
                            method: metadata.clusteringMethod || 'kmeans'
                        }
                    }
                };

                const toolResult = await executeTool(
                    'ml_pipeline',
                    'technical_ai_agent',
                    toolInput,
                    {
                        userId: metadata.userId,
                        projectId: metadata.projectId
                    }
                );

                return {
                    type: 'clustering',
                    performance: toolResult.result?.results?.modelPerformance || {},
                    parameters: metadata,
                    predictions: {},
                    featureImportance: {},
                    crossValidation: {},
                    realAnalysis: true
                };
            }

            // Supervised learning - classification or regression
            const isClassification = this.isClassificationTask(engineered, targetColumn);
            const analysisType = isClassification ? 'classification' : 'regression';

            const toolInput = {
                data: engineered,
                config: {
                    analysisType,
                    targetColumn,
                    features: Object.keys(engineered[0] || {}).filter(col => col !== targetColumn),
                    parameters: {
                        modelType: metadata.modelType || 'auto',
                        testSize: metadata.testSize || 0.2,
                        crossValidation: metadata.crossValidation || 5
                    }
                }
            };

            const toolResult = await executeTool(
                'ml_pipeline',
                'technical_ai_agent',
                toolInput,
                {
                    userId: metadata.userId,
                    projectId: metadata.projectId
                }
            );

            // Extract results from real ML analysis
            const mlResult = toolResult.result?.results || {};

            return {
                type: analysisType,
                performance: mlResult.modelPerformance || {},
                parameters: metadata,
                predictions: mlResult.predictions || {},
                featureImportance: mlResult.featureImportance || {},
                crossValidation: mlResult.crossValidation || {},
                realAnalysis: true
            };

        } catch (error) {
            console.error('ML model training via tools failed:', error);

            // Fallback: return error info instead of mock data
            return {
                type: 'error',
                performance: {},
                parameters: metadata,
                predictions: {},
                featureImportance: {},
                crossValidation: {},
                error: `Model training failed: ${(error as Error).message || String(error)}`,
                realAnalysis: false
            };
        }
    }

    async generateVisualizations(results: any, metadata: any): Promise<any> {
        console.log('Generating comprehensive visualizations...');

        try {
            // Import tool execution function
            const { executeTool } = require('./mcp-tool-registry');

            const visualizations: { charts: any[]; recommendations: string[]; interactiveElements: any[]; realVisualizations: boolean } = {
                charts: [] as any[],
                recommendations: [] as string[],
                interactiveElements: [] as any[],
                realVisualizations: true
            };

            // Statistical visualizations
            if (results.statistical_analysis) {
                const stats = results.statistical_analysis;

                // Distribution plots for each numeric variable using real viz tool
                for (const [column, stat] of Object.entries(stats.descriptiveStats)) {
                    try {
                        const vizInput = {
                            data: results.data_preprocessing?.cleanedData || [],
                            config: {
                                type: 'histogram',
                                title: `Distribution of ${column}`,
                                xAxis: column,
                                bins: 20
                            }
                        };

                        const vizResult = await executeTool(
                            'visualization_engine',
                            'technical_ai_agent',
                            vizInput,
                            {
                                userId: metadata.userId,
                                projectId: metadata.projectId
                            }
                        );

                        visualizations.charts.push({
                            type: 'histogram',
                            title: `Distribution of ${column}`,
                            data: vizResult.result,
                            insights: this.generateDistributionInsights(stat as any),
                            fromTool: true
                        });
                    } catch (error) {
                        console.error(`Visualization generation failed for ${column}:`, error);
                    }
                }

                // Correlation heatmap
                if (stats.correlations && Object.keys(stats.correlations).length > 0) {
                    try {
                        const vizInput = {
                            data: this.formatCorrelationForHeatmap(stats.correlations),
                            config: {
                                type: 'heatmap',
                                title: 'Correlation Matrix'
                            }
                        };

                        const vizResult = await executeTool(
                            'visualization_engine',
                            'technical_ai_agent',
                            vizInput,
                            {
                                userId: metadata.userId,
                                projectId: metadata.projectId
                            }
                        );

                        visualizations.charts.push({
                            type: 'heatmap',
                            title: 'Correlation Matrix',
                            data: vizResult.result,
                            insights: this.generateCorrelationInsights(stats.correlations),
                            fromTool: true
                        });
                    } catch (error) {
                        console.error('Correlation heatmap generation failed:', error);
                    }
                }
            }

            // ML model visualizations
            if (results.model_training) {
                const model = results.model_training;

                if (model.type === 'classification' && model.performance) {
                    visualizations.charts.push({
                        type: 'confusion_matrix',
                        title: 'Model Performance',
                        data: model.performance,
                        insights: [`Model achieved ${model.performance.accuracy || 'N/A'}% accuracy`],
                        fromTool: false // Confusion matrix may need custom rendering
                    });
                } else if (model.type === 'regression' && model.predictions) {
                    try {
                        const vizInput = {
                            data: this.formatPredictionsForScatter(model.predictions),
                            config: {
                                type: 'scatter',
                                title: 'Actual vs Predicted',
                                xAxis: 'actual',
                                yAxis: 'predicted'
                            }
                        };

                        const vizResult = await executeTool(
                            'visualization_engine',
                            'technical_ai_agent',
                            vizInput,
                            {
                                userId: metadata.userId,
                                projectId: metadata.projectId
                            }
                        );

                        visualizations.charts.push({
                            type: 'scatter',
                            title: 'Actual vs Predicted',
                            data: vizResult.result,
                            insights: [`Model R² score: ${model.performance.r2 || 'N/A'}`],
                            fromTool: true
                        });
                    } catch (error) {
                        console.error('Scatter plot generation failed:', error);
                    }
                }

                // Feature importance chart
                if (model.featureImportance && Object.keys(model.featureImportance).length > 0) {
                    try {
                        const vizInput = {
                            data: this.formatFeatureImportanceForBar(model.featureImportance),
                            config: {
                                type: 'bar',
                                title: 'Feature Importance',
                                xAxis: 'feature',
                                yAxis: 'importance'
                            }
                        };

                        const vizResult = await executeTool(
                            'visualization_engine',
                            'technical_ai_agent',
                            vizInput,
                            {
                                userId: metadata.userId,
                                projectId: metadata.projectId
                            }
                        );

                        visualizations.charts.push({
                            type: 'bar',
                            title: 'Feature Importance',
                            data: vizResult.result,
                            insights: this.generateFeatureImportanceInsights(model.featureImportance),
                            fromTool: true
                        });
                    } catch (error) {
                        console.error('Feature importance bar chart generation failed:', error);
                    }
                }
            }

            return visualizations;

        } catch (error) {
            console.error('Visualization generation via tools failed:', error);

            // Return error instead of mock visualizations
            return {
                charts: [],
                recommendations: [],
                interactiveElements: [],
                realVisualizations: false,
                error: `Visualization generation failed: ${(error as Error).message || String(error)}`
            };
        }
    }

    // Helper methods for data formatting
    private formatCorrelationForHeatmap(correlations: any): any[] {
        const data: any[] = [];
        for (const [col1, row] of Object.entries(correlations)) {
            for (const [col2, value] of Object.entries(row as any)) {
                data.push({
                    x: col1,
                    y: col2,
                    value: value
                });
            }
        }
        return data;
    }

    private formatPredictionsForScatter(predictions: any): any[] {
        if (Array.isArray(predictions)) {
            return predictions;
        }
        // Convert object format to array if needed
        return Object.entries(predictions).map(([key, value]) => ({
            actual: key,
            predicted: value
        }));
    }

    private formatFeatureImportanceForBar(featureImportance: any): any[] {
        return Object.entries(featureImportance).map(([feature, importance]) => ({
            feature,
            importance
        }));
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

    // REMOVED: Dead simulation code (lines 911-964)
    // These methods were never called after refactoring to use Tool Registry.
    // All ML metrics now come from real scikit-learn via MLPipelineHandler.

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

    /**
     * Analyze dataset characteristics for intelligent library selection
     * Dedicated method for comprehensive dataset analysis
     */
    private analyzeDatasetCharacteristics(data: any[]): DatasetCharacteristics {
        if (!data || data.length === 0) {
            return {
                size: 0,
                columns: 0,
                dataTypes: { numeric: 0, categorical: 0, datetime: 0, text: 0, boolean: 0 },
                memoryFootprint: 0,
                sparsity: 0,
                cardinality: {}
            };
        }

        const sample = data.slice(0, Math.min(1000, data.length));
        const columns = Object.keys(sample[0]);
        
        let numeric = 0, categorical = 0, datetime = 0, text = 0, boolean = 0;
        const cardinality: Record<string, number> = {};

        columns.forEach(col => {
            const values = sample.map(row => row[col]).filter(val => val !== null && val !== undefined);
            const uniqueValues = new Set(values).size;
            cardinality[col] = uniqueValues;

            // Comprehensive data type detection for library selection
            const firstValue = values[0];
            if (typeof firstValue === 'number' && !isNaN(firstValue)) {
                numeric++;
            } else if (typeof firstValue === 'boolean') {
                boolean++;
            } else if (typeof firstValue === 'string') {
                // Enhanced string type detection
                if (uniqueValues < 20) {
                    categorical++;
                } else if (this.isDateString(firstValue)) {
                    datetime++;
                } else {
                    text++;
                }
            } else if (firstValue instanceof Date) {
                datetime++;
            } else {
                // Fallback classification
                categorical++;
            }
        });

        // Calculate sparsity
        const totalCells = data.length * columns.length;
        const nullCells = data.reduce((count, row) => 
            count + columns.reduce((colCount, col) => 
                colCount + (row[col] === null || row[col] === undefined ? 1 : 0), 0), 0);
        const sparsity = totalCells > 0 ? (nullCells / totalCells) * 100 : 0;

        return {
            size: data.length,
            columns: columns.length,
            dataTypes: { numeric, categorical, datetime, text, boolean },
            memoryFootprint: JSON.stringify(data).length / 1024 / 1024, // MB estimate
            sparsity,
            cardinality
        };
    }

    /**
     * Helper method to detect if a string is a date
     */
    private isDateString(str: string): boolean {
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
            /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, // ISO datetime
        ];
        return datePatterns.some(pattern => pattern.test(str)) || !isNaN(Date.parse(str));
    }

    /**
     * Extract analysis requirements from query and parameters
     */
    private extractAnalysisRequirements(query: TechnicalQueryType, parameters: any): AnalysisRequirements {
        const analysisType = query.type;
        
        return {
            type: this.mapAnalysisTypeToRequirement(analysisType),
            complexity: this.determineComplexity(query, parameters),
            realTime: parameters.realTime || false,
            interactive: parameters.interactive || false,
            exportFormats: parameters.exportFormats || ['json', 'csv'],
            performancePriority: parameters.performancePriority || 'balanced'
        };
    }

    /**
     * Extract visualization requirements from query and parameters
     */
    private extractVisualizationRequirements(query: TechnicalQueryType, parameters: any): VisualizationRequirements {
        const chartType = parameters.chartType || 'bar';
        const dataSize = this.getDataSizeCategory(parameters.dataSize);
        
        return {
            chartTypes: [chartType],
            interactivity: parameters.interactive ? 'interactive' : 'static',
            dataSize: dataSize as 'small' | 'medium' | 'large' | 'massive',
            styling: parameters.styling || 'professional',
            exportFormats: parameters.exportFormats || ['png', 'svg'],
            performancePriority: parameters.performancePriority || 'balanced'
        };
    }

    /**
     * Map analysis type to requirement type for intelligent library selection
     * Dedicated method for library selection requirements
     */
    private mapAnalysisTypeToRequirement(analysisType: string): 'descriptive' | 'inferential' | 'predictive' | 'exploratory' {
        // Comprehensive mapping for library selection
        if (['anova', 'ancova', 'manova', 'mancova', 'regression', 'hypothesis_testing', 't_test', 'chi_square'].includes(analysisType)) {
            return 'inferential';
        } else if (['machine_learning', 'classification', 'clustering', 'time_series', 'anomaly_detection', 'neural_networks'].includes(analysisType)) {
            return 'predictive';
        } else if (['descriptive_stats', 'correlation', 'summary_statistics'].includes(analysisType)) {
            return 'descriptive';
        } else {
            return 'exploratory';
        }
    }

    /**
     * Determine analysis complexity
     */
    private determineComplexity(query: TechnicalQueryType, parameters: any): 'simple' | 'moderate' | 'complex' {
        const analysisType = query.type;
        
        if (['descriptive_stats', 'correlation'].includes(analysisType)) {
            return 'simple';
        } else if (['anova', 'ancova', 'regression', 'hypothesis_testing'].includes(analysisType)) {
            return 'moderate';
        } else if (['manova', 'mancova', 'machine_learning', 'classification', 'clustering', 'time_series'].includes(analysisType)) {
            return 'complex';
        } else {
            return 'moderate';
        }
    }

    /**
     * Get data size category
     */
    private getDataSizeCategory(dataSize?: string | number): string {
        if (typeof dataSize === 'number') {
            if (dataSize < 1000) return 'small';
            if (dataSize < 10000) return 'medium';
            if (dataSize < 100000) return 'large';
            return 'massive';
        }
        return dataSize || 'medium';
    }
}
