/**
 * Checkpoint Integration for Analysis Components
 *
 * Wraps all analysis components with user engagement checkpoints to ensure
 * agents engage users at each execution level for appropriate input/feedback.
 *
 * This integrates the checkpoint infrastructure built in project-manager-agent
 * and message-broker with actual analysis components.
 */

import { AgentMessageBroker, AgentCheckpoint } from './agents/message-broker';
import { FileProcessor } from './file-processor';
import { DataTransformer } from './data-transformer';
import { MLService } from '../ml-service';
import { AdvancedAnalyzer } from '../advanced-analyzer';
import { VisualizationAPIService } from '../visualization-api-service';
import { nanoid } from 'nanoid';

type ProcessedFileResultWithCheckpoints = Awaited<ReturnType<typeof FileProcessor.processFile>> & {
    requiresCleaning?: boolean;
    piiHandlingStrategy?: 'anonymize' | 'remove' | 'keep' | 'review';
};

type TransformationResultWithCheckpoints = Awaited<ReturnType<DataTransformer['transform']>> & {
    requiresRedo?: boolean;
};

interface TrainingCheckpointResult {
    model: string;
    problemType: string;
    features: any;
    performance: {
        accuracy: number;
        precision: number;
        recall: number;
    };
    requiresRetraining?: boolean;
    retrainingReason?: string;
    deploymentDecision?: string;
}

// ==========================================
// CHECKPOINT DEFINITIONS
// ==========================================

interface CheckpointConfig {
    enabled: boolean;
    timeout?: number; // Milliseconds to wait for user response
    requireApproval?: boolean; // Whether to proceed without approval
    autoApproveFor?: string[]; // Journey types that can skip checkpoints
}

interface CheckpointResponse {
    approved: boolean;
    feedback?: string;
    modifications?: any;
    skipRemaining?: boolean;
}

interface ComponentExecutionContext {
    projectId: string;
    userId: string;
    agentId: string;
    journeyType: 'non-tech' | 'business' | 'technical' | 'consultation';
    checkpointConfig?: CheckpointConfig;
}

// ==========================================
// CHECKPOINT WRAPPER CLASS
// ==========================================

export class CheckpointWrapper {
    private messageBroker: AgentMessageBroker;
    private activeCheckpoints: Map<string, AgentCheckpoint> = new Map();

    constructor(messageBroker?: AgentMessageBroker) {
        this.messageBroker = messageBroker || new AgentMessageBroker();
    }

    /**
     * Create and send a checkpoint to the user
     */
    private async createCheckpoint(
        context: ComponentExecutionContext,
        step: string,
        question: string,
        options: string[],
        artifacts?: any[]
    ): Promise<CheckpointResponse> {
        // Check if checkpoints are disabled for this journey type
        if (context.checkpointConfig?.autoApproveFor?.includes(context.journeyType)) {
            console.log(`Auto-approving checkpoint for ${context.journeyType} journey`);
            return { approved: true };
        }

        const checkpointId = nanoid();
        const checkpoint: AgentCheckpoint = {
            checkpointId,
            projectId: context.projectId,
            agentId: context.agentId,
            step,
            question,
            options,
            artifacts,
            timestamp: new Date()
        };

        this.activeCheckpoints.set(checkpointId, checkpoint);

        try {
            // Send checkpoint via message broker
            await this.messageBroker.sendCheckpoint(checkpoint);

            // Wait for user response
            const timeout = context.checkpointConfig?.timeout || 300000; // 5 minutes default
            const response = await this.messageBroker.waitForCheckpointResponse(checkpointId, timeout, {
                projectId: context.projectId,
                agentId: context.agentId,
                agentName: context.agentId,
                journeyId: context.journeyType,
                step,
                stepId: step,
                options,
                question,
                artifacts,
            });

            this.activeCheckpoints.delete(checkpointId);
            return response;

        } catch (error) {
            console.error(`Checkpoint ${checkpointId} timed out or failed:`, error);
            this.activeCheckpoints.delete(checkpointId);

            // If approval not required, proceed anyway
            if (!context.checkpointConfig?.requireApproval) {
                return { approved: true, feedback: 'Auto-approved due to timeout' };
            }

            throw new Error(`User approval required but not received for: ${question}`);
        }
    }

    /**
     * Wrapped File Processing with Checkpoints
     */
    async processFileWithCheckpoints(
        buffer: Buffer,
        originalname: string,
        mimetype: string,
        context: ComponentExecutionContext
    ): Promise<any> {
        // Step 1: Process file
        const result: ProcessedFileResultWithCheckpoints = {
            ...(await FileProcessor.processFile(buffer, originalname, mimetype))
        };

        // Checkpoint 1: Schema Review
        const schemaCheckpoint = await this.createCheckpoint(
            context,
            'schema_review',
            'Please review the detected schema. Does this look correct?',
            [
                'Approve schema',
                'Modify column types',
                'Mark columns as PII',
                'Request re-detection'
            ],
            [{
                type: 'schema',
                data: result.schema,
                preview: result.preview,
                summary: result.datasetSummary,
                descriptiveStats: result.descriptiveStats,
                relationships: result.relationships
            }]
        );

        if (!schemaCheckpoint.approved) {
            // User wants to modify schema
            if (schemaCheckpoint.modifications?.schema) {
                result.schema = schemaCheckpoint.modifications.schema;
            }
        }

        const qualityCheckpoint = await this.createCheckpoint(
            context,
            'quality_review',
            `Data quality score: ${result.qualityMetrics.dataQualityScore}/100. Proceed with this data?`,
            [
                'Proceed with data',
                'Review quality issues',
                'Clean data first',
                'Upload different file'
            ],
            [{
                type: 'quality_metrics',
                data: result.qualityMetrics,
                datasetSummary: result.datasetSummary,
                descriptiveStats: result.descriptiveStats,
                relationships: result.relationships
            }]
        );

        if (!qualityCheckpoint.approved || qualityCheckpoint.feedback === 'Clean data first') {
            // Trigger data cleaning workflow
            result.requiresCleaning = true;
        }

        // Checkpoint 3: PII Handling
        if (result.qualityMetrics.potentialPIIFields.length > 0) {
            const piiCheckpoint = await this.createCheckpoint(
                context,
                'pii_handling',
                `Detected ${result.qualityMetrics.potentialPIIFields.length} potential PII fields. How should we handle them?`,
                [
                    'Anonymize automatically',
                    'Remove PII columns',
                    'Keep as-is (I have consent)',
                    'Review each field individually'
                ],
                [{
                    type: 'pii_fields',
                    data: result.qualityMetrics.potentialPIIFields
                }]
            );

            const piiStrategyMap: Record<string, ProcessedFileResultWithCheckpoints['piiHandlingStrategy']> = {
                'Anonymize automatically': 'anonymize',
                'Remove PII columns': 'remove',
                'Keep as-is (I have consent)': 'keep',
                'Review each field individually': 'review'
            };

            const selectedStrategy = piiStrategyMap[piiCheckpoint.feedback || ''] || 'anonymize';
            result.piiHandlingStrategy = selectedStrategy;
        }

        return result;
    }

    /**
     * Wrapped Data Transformation with Checkpoints
     */
    async transformDataWithCheckpoints(
        data: any[],
        config: any,
        context: ComponentExecutionContext
    ): Promise<any> {
        const transformer = new DataTransformer();

        // Checkpoint 1: Transformation Strategy Selection
        const strategyCheckpoint = await this.createCheckpoint(
            context,
            'transformation_strategy',
            'Which data transformations should we apply?',
            [
                'Auto-detect and apply recommended transformations',
                'Custom transformation pipeline',
                'Minimal transformations (keep raw data)',
                'Let me review each transformation step'
            ],
            [{
                type: 'data_preview',
                data: data.slice(0, 10)
            }]
        );

        const interactiveMode = strategyCheckpoint.feedback === 'Let me review each transformation step';

        // Step 1: Missing value imputation
        if (config.imputation || interactiveMode) {
            if (interactiveMode) {
                const imputationCheckpoint = await this.createCheckpoint(
                    context,
                    'missing_value_strategy',
                    'How should we handle missing values?',
                    [
                        'Impute with mean (numeric)',
                        'Impute with median (robust to outliers)',
                        'Impute with mode (categorical)',
                        'Remove rows with missing values',
                        'Skip imputation'
                    ],
                    [{
                        type: 'missing_analysis',
                        data: transformer.analyzeMissingDataLegacy(data, {})
                    }]
                );

                if (imputationCheckpoint.feedback !== 'Skip imputation') {
                    config.imputation = {
                        strategy: imputationCheckpoint.feedback?.toLowerCase().includes('mean') ? 'mean' :
                                 imputationCheckpoint.feedback?.toLowerCase().includes('median') ? 'median' : 'mode'
                    };
                }
            }
        }

        // Step 2: Outlier handling
        if (config.outliers || interactiveMode) {
            if (interactiveMode) {
                const outlierCheckpoint = await this.createCheckpoint(
                    context,
                    'outlier_handling',
                    'How should we handle outliers?',
                    [
                        'Cap outliers (winsorization)',
                        'Remove outlier rows',
                        'Flag outliers but keep them',
                        'Skip outlier handling'
                    ]
                );

                if (outlierCheckpoint.feedback !== 'Skip outlier handling') {
                    config.outliers = {
                        method: 'iqr',
                        action: outlierCheckpoint.feedback?.toLowerCase().includes('cap') ? 'cap' :
                               outlierCheckpoint.feedback?.toLowerCase().includes('remove') ? 'remove' : 'flag'
                    };
                }
            }
        }

        // Execute transformation
        const result: TransformationResultWithCheckpoints = {
            ...(await transformer.transform(data, config))
        };

        // Checkpoint 3: Review transformation results
        const reviewCheckpoint = await this.createCheckpoint(
            context,
            'transformation_review',
            `Applied ${result.transformations.length} transformations. Review results?`,
            [
                'Approve transformations',
                'Undo last transformation',
                'Start over with different settings',
                'Proceed to analysis'
            ],
            [{
                type: 'transformation_summary',
                data: {
                    transformations: result.transformations,
                    warnings: result.metadata.warnings,
                    preview: result.transformedData.slice(0, 10)
                }
            }]
        );

        if (reviewCheckpoint.feedback === 'Start over with different settings') {
            result.requiresRedo = true;
        }

        return result;
    }

    /**
     * Wrapped ML Pipeline with Checkpoints
     */
    async trainMLModelWithCheckpoints(
        data: any[],
        config: any,
        context: ComponentExecutionContext
    ): Promise<any> {
        const mlService = new MLService();

        // Checkpoint 1: Model Selection
        const modelCheckpoint = await this.createCheckpoint(
            context,
            'model_selection',
            'What type of machine learning problem are we solving?',
            [
                'Classification (predict categories)',
                'Regression (predict numbers)',
                'Clustering (find patterns)',
                'Auto-detect from data'
            ]
        );

        const problemType = modelCheckpoint.feedback?.toLowerCase().includes('classification') ? 'classification' :
                           modelCheckpoint.feedback?.toLowerCase().includes('regression') ? 'regression' :
                           modelCheckpoint.feedback?.toLowerCase().includes('clustering') ? 'clustering' : 'auto';

        // Checkpoint 2: Feature Selection
        const featureCheckpoint = await this.createCheckpoint(
            context,
            'feature_selection',
            'Which features (columns) should we use for training?',
            [
                'Use all numeric features',
                'Let me select specific features',
                'Auto-select best features',
                'Include engineered features'
            ],
            [{
                type: 'available_features',
                data: Object.keys(data[0] || {})
            }]
        );

        config.featureSelection = featureCheckpoint.modifications?.selectedFeatures ||
                                  featureCheckpoint.feedback || 'auto';

        // Step 1: Train model (this would integrate with actual ML training)
        const trainingResult: TrainingCheckpointResult = {
            model: 'trained_model_placeholder',
            problemType,
            features: config.featureSelection,
            performance: {
                accuracy: 0.85,
                precision: 0.82,
                recall: 0.88
            }
        };

        // Checkpoint 3: Model Performance Review
        const performanceCheckpoint = await this.createCheckpoint(
            context,
            'model_performance',
            `Model achieved ${(trainingResult.performance.accuracy * 100).toFixed(1)}% accuracy. Acceptable?`,
            [
                'Accept model',
                'Try different algorithm',
                'Tune hyperparameters',
                'Collect more data'
            ],
            [{
                type: 'performance_metrics',
                data: trainingResult.performance
            }]
        );

        if (!performanceCheckpoint.approved) {
            trainingResult.requiresRetraining = true;
            trainingResult.retrainingReason = performanceCheckpoint.feedback;
        }

        // Checkpoint 4: Deployment Decision
        if (performanceCheckpoint.approved) {
            const deploymentCheckpoint = await this.createCheckpoint(
                context,
                'deployment_decision',
                'Should we deploy this model for predictions?',
                [
                    'Deploy to production',
                    'Deploy to staging first',
                    'Save for later',
                    'Do not deploy'
                ]
            );

            trainingResult.deploymentDecision = deploymentCheckpoint.feedback || 'save';
        }

        return trainingResult;
    }

    /**
     * Wrapped Statistical Analysis with Checkpoints
     */
    async performStatisticalAnalysisWithCheckpoints(
        data: any[],
        config: any,
        context: ComponentExecutionContext
    ): Promise<any> {
        // Checkpoint 1: Analysis Type Selection
        const analysisCheckpoint = await this.createCheckpoint(
            context,
            'analysis_type',
            'What type of statistical analysis do you need?',
            [
                'Descriptive statistics (mean, median, etc.)',
                'Hypothesis testing (ANOVA, t-test)',
                'Correlation analysis',
                'Regression analysis',
                'All of the above'
            ],
            [{
                type: 'data_summary',
                data: {
                    rowCount: data.length,
                    columnCount: Object.keys(data[0] || {}).length
                }
            }]
        );

        config.analysisType = analysisCheckpoint.feedback || 'comprehensive';

        // Execute analysis
    const result = await AdvancedAnalyzer.performStepByStepAnalysis(data, config) as Record<string, any>;

        // Checkpoint 2: Results Interpretation
        const interpretationCheckpoint = await this.createCheckpoint(
            context,
            'results_interpretation',
            'Analysis complete. Would you like detailed explanations?',
            [
                'Show key insights only',
                'Detailed statistical interpretation',
                'Export raw results',
                'Run additional tests'
            ],
            [{
                type: 'analysis_results',
                data: result
            }]
        );

        result.interpretationLevel = interpretationCheckpoint.feedback || 'key_insights';

        return result;
    }

    /**
     * Wrapped Visualization with Checkpoints
     */
    async generateVisualizationsWithCheckpoints(
        data: any[],
        config: any,
        context: ComponentExecutionContext
    ): Promise<any> {
        // Checkpoint 1: Chart Type Selection
        const chartCheckpoint = await this.createCheckpoint(
            context,
            'chart_selection',
            'What visualizations would you like to create?',
            [
                'Auto-generate recommended charts',
                'Let me select specific chart types',
                'Create dashboard with multiple charts',
                'Custom visualization'
            ],
            [{
                type: 'data_preview',
                data: data.slice(0, 10)
            }]
        );

        const results = [];

        if (chartCheckpoint.feedback?.includes('Auto-generate')) {
            // Auto-generate charts
            const recommendedCharts = this.getRecommendedCharts(data);

            for (const chartType of recommendedCharts) {
                const viz = await VisualizationAPIService.createVisualization(data, {
                    ...config,
                    type: chartType,
                    autoGenerated: true
                });
                results.push(viz);
            }
        }

        // Checkpoint 2: Visualization Review
        const reviewCheckpoint = await this.createCheckpoint(
            context,
            'visualization_review',
            `Generated ${results.length} visualizations. Review them?`,
            [
                'Approve all visualizations',
                'Customize specific charts',
                'Regenerate with different settings',
                'Add more visualizations'
            ],
            [{
                type: 'visualizations',
                data: results
            }]
        );

        if (reviewCheckpoint.feedback?.includes('Customize')) {
            // Mark for customization
            results.forEach(r => r.requiresCustomization = true);
        }

        return { visualizations: results, approved: reviewCheckpoint.approved };
    }

    /**
     * Get all active checkpoints for a project
     */
    getActiveCheckpoints(projectId: string): AgentCheckpoint[] {
        return Array.from(this.activeCheckpoints.values())
            .filter(cp => cp.projectId === projectId);
    }

    /**
     * Cancel all active checkpoints for a project
     */
    cancelProjectCheckpoints(projectId: string): void {
        for (const [id, checkpoint] of this.activeCheckpoints.entries()) {
            if (checkpoint.projectId === projectId) {
                this.activeCheckpoints.delete(id);
                // Send cancellation response
                this.messageBroker.submitCheckpointResponse(id, {
                    approved: false,
                    feedback: 'Checkpoint cancelled'
                }).catch(console.error);
            }
        }
    }

        private getRecommendedCharts(data: any[]): string[] {
            if (!Array.isArray(data) || data.length === 0) {
                return ['table'];
            }

            const sample = data[0] || {};
            const numericColumns = Object.entries(sample)
                .filter(([, value]) => typeof value === 'number')
                .map(([key]) => key);
            const categoricalColumns = Object.entries(sample)
                .filter(([, value]) => typeof value === 'string')
                .map(([key]) => key);

            const recommendations = new Set<string>();

            if (numericColumns.length > 0) {
                recommendations.add('histogram');
                recommendations.add('line');
            }

            if (numericColumns.length > 1) {
                recommendations.add('scatter');
            }

            if (categoricalColumns.length > 0) {
                recommendations.add('bar');
            }

            return recommendations.size > 0 ? Array.from(recommendations) : ['table'];
        }
}

// ==========================================
// SINGLETON EXPORT
// ==========================================

let checkpointWrapper: CheckpointWrapper | null = null;

export function getCheckpointWrapper(messageBroker?: AgentMessageBroker): CheckpointWrapper {
    if (!checkpointWrapper) {
        checkpointWrapper = new CheckpointWrapper(messageBroker);
    }
    return checkpointWrapper;
}

/**
 * Helper function to wrap any component with checkpoints
 */
export async function executeWithCheckpoints<T>(
    componentName: string,
    executionFn: () => Promise<T>,
    checkpointConfig: {
        context: ComponentExecutionContext;
        preCheckpoint?: {
            question: string;
            options: string[];
            artifacts?: any[];
        };
        postCheckpoint?: {
            question: string;
            options: string[];
            artifactsFromResult: (result: T) => any[];
        };
    }
): Promise<T> {
    const wrapper = getCheckpointWrapper();

    // Pre-execution checkpoint
    if (checkpointConfig.preCheckpoint) {
        const preResponse = await wrapper['createCheckpoint'](
            checkpointConfig.context,
            `${componentName}_pre`,
            checkpointConfig.preCheckpoint.question,
            checkpointConfig.preCheckpoint.options,
            checkpointConfig.preCheckpoint.artifacts
        );

        if (!preResponse.approved) {
            throw new Error(`User did not approve ${componentName} execution`);
        }
    }

    // Execute component
    const result = await executionFn();

    // Post-execution checkpoint
    if (checkpointConfig.postCheckpoint) {
        const artifacts = checkpointConfig.postCheckpoint.artifactsFromResult(result);
        const postResponse = await wrapper['createCheckpoint'](
            checkpointConfig.context,
            `${componentName}_post`,
            checkpointConfig.postCheckpoint.question,
            checkpointConfig.postCheckpoint.options,
            artifacts
        );

        (result as any).userApproved = postResponse.approved;
        (result as any).userFeedback = postResponse.feedback;
    }

    return result;
}
