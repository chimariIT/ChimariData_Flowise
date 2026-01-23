/**
 * ML Model Deployment and Monitoring Service
 *
 * Provides model versioning, deployment, real-time/batch prediction,
 * performance monitoring, and data drift detection for production ML models.
 */

import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

export interface MLModel {
    modelId: string;
    name: string;
    version: string;
    type: 'regression' | 'classification' | 'clustering' | 'timeseries' | 'anomaly' | 'association';
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    projectId: string;

    // Model artifacts
    artifactPath: string;
    configPath: string;
    metadataPath: string;

    // Training info
    trainingDataset: string;
    features: string[];
    targetColumn?: string;
    parameters: Record<string, any>;

    // Performance metrics
    performance: {
        accuracy?: number;
        precision?: number;
        recall?: number;
        f1Score?: number;
        rmse?: number;
        r2Score?: number;
        silhouetteScore?: number;
        [key: string]: number | undefined;
    };

    // Deployment info
    deploymentStatus: 'draft' | 'staging' | 'production' | 'archived';
    deployedAt?: Date;
    endpoint?: string;

    // Metadata
    description?: string;
    tags: string[];
}

export interface ModelVersion {
    version: string;
    modelId: string;
    createdAt: Date;
    changelog: string;
    performance: Record<string, number>;
    promotedFrom?: string; // Previous version
}

function sanitizePerformanceMetrics(performance: MLModel['performance']): Record<string, number> {
    return Object.entries(performance).reduce<Record<string, number>>((acc, [metric, value]) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
            acc[metric] = value;
        }
        return acc;
    }, {});
}

export interface PredictionRequest {
    modelId: string;
    version?: string;
    data: any[] | Record<string, any>;
    options?: {
        explainPredictions?: boolean;
        confidenceThreshold?: number;
        batchMode?: boolean;
    };
}

export interface PredictionResult {
    predictionId: string;
    modelId: string;
    version: string;
    predictions: any[];
    confidence?: number[];
    explanations?: any[];
    metadata: {
        timestamp: Date;
        processingTime: number;
        recordCount: number;
    };
}

export interface ModelPerformanceMetrics {
    modelId: string;
    version: string;
    period: { start: Date; end: Date };

    // Prediction metrics
    totalPredictions: number;
    averageConfidence: number;
    predictionLatency: {
        p50: number;
        p95: number;
        p99: number;
    };

    // Accuracy tracking (if ground truth available)
    accuracy?: number;
    drift?: {
        dataDrift: boolean;
        conceptDrift: boolean;
        driftScore: number;
    };

    // Resource usage
    cpuUsage: number;
    memoryUsage: number;

    // Error tracking
    errorRate: number;
    errors: Array<{
        timestamp: Date;
        error: string;
        stackTrace?: string;
    }>;
}

export interface DataDriftReport {
    modelId: string;
    detectedAt: Date;
    driftType: 'feature_drift' | 'prediction_drift' | 'concept_drift';
    affectedFeatures: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    driftScore: number;
    recommendations: string[];
    comparisonDetails: {
        trainingDistribution: Record<string, any>;
        currentDistribution: Record<string, any>;
        statisticalTests: Record<string, any>;
    };
}

// ==========================================
// ML MODEL REGISTRY
// ==========================================

export class MLModelRegistry {
    private models: Map<string, MLModel> = new Map();
    private versions: Map<string, ModelVersion[]> = new Map(); // modelId -> versions
    private modelsDir: string;

    constructor(baseDir?: string) {
        this.modelsDir = baseDir || path.join(process.cwd(), 'models');
        this.ensureModelsDirectory();
    }

    private ensureModelsDirectory(): void {
        if (!fs.existsSync(this.modelsDir)) {
            fs.mkdirSync(this.modelsDir, { recursive: true });
        }
    }

    /**
     * Register a new model
     */
    async registerModel(modelData: Omit<MLModel, 'modelId' | 'createdAt' | 'updatedAt'>): Promise<MLModel> {
        const modelId = nanoid();
        const model: MLModel = {
            ...modelData,
            modelId,
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        this.models.set(modelId, model);

        // Initialize version history
        this.versions.set(modelId, [{
            version: model.version,
            modelId,
            createdAt: new Date(),
            changelog: 'Initial model version',
            performance: sanitizePerformanceMetrics(model.performance)
        }]);

        // Save model metadata
        await this.saveModelMetadata(model);

        console.log(`Model ${modelId} registered with version ${model.version}`);
        return model;
    }

    /**
     * Create a new version of an existing model
     */
    async createModelVersion(
        modelId: string,
        updates: Partial<MLModel>,
        changelog: string
    ): Promise<ModelVersion> {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        // Increment version
        const currentVersion = model.version;
        const newVersion = this.incrementVersion(currentVersion);

        // Update model
        const updatedModel: MLModel = {
            ...model,
            ...updates,
            version: newVersion,
            updatedAt: new Date()
        };

        this.models.set(modelId, updatedModel);

        // Add version to history
        const version: ModelVersion = {
            version: newVersion,
            modelId,
            createdAt: new Date(),
            changelog,
            performance: sanitizePerformanceMetrics(updatedModel.performance),
            promotedFrom: currentVersion
        };

        const versionHistory = this.versions.get(modelId) || [];
        versionHistory.push(version);
        this.versions.set(modelId, versionHistory);

        await this.saveModelMetadata(updatedModel);

        console.log(`Model ${modelId} updated to version ${newVersion}`);
        return version;
    }

    /**
     * Deploy model to environment
     */
    async deployModel(
        modelId: string,
        environment: 'staging' | 'production'
    ): Promise<MLModel> {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        model.deploymentStatus = environment;
        model.deployedAt = new Date();
        model.endpoint = `/api/ml/predict/${modelId}`;
        model.updatedAt = new Date();

        this.models.set(modelId, model);
        await this.saveModelMetadata(model);

        console.log(`Model ${modelId} deployed to ${environment}`);
        return model;
    }

    /**
     * Archive a model
     */
    async archiveModel(modelId: string): Promise<void> {
        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        model.deploymentStatus = 'archived';
        model.updatedAt = new Date();

        this.models.set(modelId, model);
        await this.saveModelMetadata(model);

        console.log(`Model ${modelId} archived`);
    }

    /**
     * Get model by ID
     */
    getModel(modelId: string): MLModel | undefined {
        return this.models.get(modelId);
    }

    /**
     * Get model version history
     */
    getModelVersions(modelId: string): ModelVersion[] {
        return this.versions.get(modelId) || [];
    }

    /**
     * Get all models for a project
     */
    getProjectModels(projectId: string): MLModel[] {
        return Array.from(this.models.values())
            .filter(model => model.projectId === projectId);
    }

    /**
     * Get deployed models
     */
    getDeployedModels(environment?: 'staging' | 'production'): MLModel[] {
        const deployed = Array.from(this.models.values())
            .filter(model =>
                model.deploymentStatus === 'staging' ||
                model.deploymentStatus === 'production'
            );

        if (environment) {
            return deployed.filter(model => model.deploymentStatus === environment);
        }

        return deployed;
    }

    private incrementVersion(version: string): string {
        const parts = version.split('.');
        const patch = parseInt(parts[2] || '0') + 1;
        return `${parts[0]}.${parts[1]}.${patch}`;
    }

    private async saveModelMetadata(model: MLModel): Promise<void> {
        const metadataPath = path.join(this.modelsDir, `${model.modelId}.json`);
        fs.writeFileSync(metadataPath, JSON.stringify(model, null, 2));
    }
}

// ==========================================
// PREDICTION SERVICE
// ==========================================

export class MLPredictionService {
    private registry: MLModelRegistry;
    private predictionHistory: Map<string, PredictionResult> = new Map();

    constructor(registry: MLModelRegistry) {
        this.registry = registry;
    }

    /**
     * Real-time prediction (single or small batch)
     */
    async predictRealtime(request: PredictionRequest): Promise<PredictionResult> {
        const startTime = Date.now();

        const model = this.registry.getModel(request.modelId);
        if (!model) {
            throw new Error(`Model ${request.modelId} not found`);
        }

        if (model.deploymentStatus !== 'production' && model.deploymentStatus !== 'staging') {
            throw new Error(`Model ${request.modelId} is not deployed`);
        }

        // Convert single record to array
        const data = Array.isArray(request.data) ? request.data : [request.data];

        // Execute prediction (placeholder - would integrate with Python/Spark)
        const predictions = await this.executePrediction(model, data, request.options);

        const processingTime = Date.now() - startTime;
        const predictionId = nanoid();

        const result: PredictionResult = {
            predictionId,
            modelId: request.modelId,
            version: request.version || model.version,
            predictions: predictions.values,
            confidence: predictions.confidence,
            explanations: request.options?.explainPredictions ? predictions.explanations : undefined,
            metadata: {
                timestamp: new Date(),
                processingTime,
                recordCount: data.length
            }
        };

        this.predictionHistory.set(predictionId, result);
        return result;
    }

    /**
     * Batch prediction (large datasets)
     */
    async predictBatch(request: PredictionRequest): Promise<string> {
        const model = this.registry.getModel(request.modelId);
        if (!model) {
            throw new Error(`Model ${request.modelId} not found`);
        }

        const batchId = nanoid();

        // Queue batch prediction job (would integrate with task queue)
        console.log(`Batch prediction ${batchId} queued for model ${request.modelId}`);

        // Return batch ID for status tracking
        return batchId;
    }

    /**
     * Execute prediction (placeholder for actual ML integration)
     */
    private async executePrediction(
        model: MLModel,
        data: any[],
        options?: PredictionRequest['options']
    ): Promise<{
        values: any[];
        confidence?: number[];
        explanations?: any[];
    }> {
        // This would integrate with Python/Spark for actual predictions
        // For now, return placeholder structure

        const predictions = data.map((record, idx) => {
            // Placeholder prediction logic
            return model.type === 'classification' ? 'class_A' : 42.5;
        });

        // P0-4 FIX: Production guard for mock confidence scores
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
            throw new Error('ML prediction requires trained model integration in production. Deploy model artifacts first.');
        }

        // Development only: No real model available, return zero confidence
        console.warn('⚠️ [MLPrediction] No trained model - returning zero confidence (dev mode only)');
        const confidence = data.map(() => 0);

        return {
            values: predictions,
            confidence,
            explanations: options?.explainPredictions ?
                data.map(() => ({ featureImportance: {} })) : undefined
        };
    }

    /**
     * Get prediction by ID
     */
    getPrediction(predictionId: string): PredictionResult | undefined {
        return this.predictionHistory.get(predictionId);
    }

    /**
     * Get prediction history for a model
     */
    getModelPredictions(modelId: string, limit: number = 100): PredictionResult[] {
        return Array.from(this.predictionHistory.values())
            .filter(pred => pred.modelId === modelId)
            .slice(-limit);
    }
}

// ==========================================
// PERFORMANCE MONITORING SERVICE
// ==========================================

export class MLMonitoringService {
    private registry: MLModelRegistry;
    private predictionService: MLPredictionService;
    private metricsHistory: Map<string, ModelPerformanceMetrics[]> = new Map();
    private driftReports: Map<string, DataDriftReport[]> = new Map();

    constructor(registry: MLModelRegistry, predictionService: MLPredictionService) {
        this.registry = registry;
        this.predictionService = predictionService;
    }

    /**
     * Track model performance metrics
     */
    async trackPerformance(modelId: string, period: { start: Date; end: Date }): Promise<ModelPerformanceMetrics> {
        const model = this.registry.getModel(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        const predictions = this.predictionService.getModelPredictions(modelId)
            .filter(pred =>
                pred.metadata.timestamp >= period.start &&
                pred.metadata.timestamp <= period.end
            );

        const metrics: ModelPerformanceMetrics = {
            modelId,
            version: model.version,
            period,
            totalPredictions: predictions.length,
            averageConfidence: this.calculateAverageConfidence(predictions),
            predictionLatency: this.calculateLatencyPercentiles(predictions),
            cpuUsage: 0, // Would integrate with system monitoring
            memoryUsage: 0,
            errorRate: 0,
            errors: []
        };

        // Store metrics
        const history = this.metricsHistory.get(modelId) || [];
        history.push(metrics);
        this.metricsHistory.set(modelId, history);

        return metrics;
    }

    /**
     * Detect data drift
     */
    async detectDataDrift(
        modelId: string,
        currentData: any[]
    ): Promise<DataDriftReport | null> {
        const model = this.registry.getModel(modelId);
        if (!model) {
            throw new Error(`Model ${modelId} not found`);
        }

        // Compare current data distribution with training data
        const driftScore = this.calculateDriftScore(model, currentData);

        if (driftScore > 0.3) { // Significant drift detected
            const report: DataDriftReport = {
                modelId,
                detectedAt: new Date(),
                driftType: 'feature_drift',
                affectedFeatures: model.features,
                severity: driftScore > 0.7 ? 'critical' :
                         driftScore > 0.5 ? 'high' : 'medium',
                driftScore,
                recommendations: this.generateDriftRecommendations(driftScore),
                comparisonDetails: {
                    trainingDistribution: {},
                    currentDistribution: {},
                    statisticalTests: {}
                }
            };

            // Store drift report
            const reports = this.driftReports.get(modelId) || [];
            reports.push(report);
            this.driftReports.set(modelId, reports);

            console.warn(`Data drift detected for model ${modelId}: ${driftScore.toFixed(2)}`);
            return report;
        }

        return null;
    }

    /**
     * Get performance metrics history
     */
    getMetricsHistory(modelId: string): ModelPerformanceMetrics[] {
        return this.metricsHistory.get(modelId) || [];
    }

    /**
     * Get drift reports
     */
    getDriftReports(modelId: string): DataDriftReport[] {
        return this.driftReports.get(modelId) || [];
    }

    /**
     * Check if model needs retraining
     */
    shouldRetrain(modelId: string): {
        shouldRetrain: boolean;
        reasons: string[];
    } {
        const reasons: string[] = [];
        const metrics = this.getMetricsHistory(modelId);
        const drifts = this.getDriftReports(modelId);

        // Check for recent drift
        const recentDrift = drifts.slice(-1)[0];
        if (recentDrift && recentDrift.severity === 'critical') {
            reasons.push('Critical data drift detected');
        }

        // Check for performance degradation
        if (metrics.length >= 2) {
            const latest = metrics[metrics.length - 1];
            const previous = metrics[metrics.length - 2];

            if (latest.errorRate > previous.errorRate * 1.5) {
                reasons.push('Error rate increased by 50%');
            }
        }

        return {
            shouldRetrain: reasons.length > 0,
            reasons
        };
    }

    private calculateAverageConfidence(predictions: PredictionResult[]): number {
        if (predictions.length === 0) return 0;

        const totalConfidence = predictions.reduce((sum, pred) => {
            const avgConf = pred.confidence ?
                pred.confidence.reduce((a, b) => a + b, 0) / pred.confidence.length : 0;
            return sum + avgConf;
        }, 0);

        return totalConfidence / predictions.length;
    }

    private calculateLatencyPercentiles(predictions: PredictionResult[]): {
        p50: number;
        p95: number;
        p99: number;
    } {
        if (predictions.length === 0) {
            return { p50: 0, p95: 0, p99: 0 };
        }

        const latencies = predictions.map(p => p.metadata.processingTime).sort((a, b) => a - b);

        return {
            p50: latencies[Math.floor(latencies.length * 0.5)],
            p95: latencies[Math.floor(latencies.length * 0.95)],
            p99: latencies[Math.floor(latencies.length * 0.99)]
        };
    }

    private calculateDriftScore(model: MLModel, currentData: any[]): number {
        // Placeholder drift calculation - no trained model baseline available
        // Would implement statistical tests (KS test, Chi-square, etc.) with real model data
        return 0; // No drift measurable without trained model baseline
    }

    private generateDriftRecommendations(driftScore: number): string[] {
        const recommendations: string[] = [];

        if (driftScore > 0.7) {
            recommendations.push('Immediate model retraining recommended');
            recommendations.push('Review recent data collection processes');
        } else if (driftScore > 0.5) {
            recommendations.push('Schedule model retraining within 1 week');
            recommendations.push('Monitor feature distributions closely');
        } else {
            recommendations.push('Continue monitoring drift trends');
            recommendations.push('Consider retraining if drift persists');
        }

        return recommendations;
    }
}

// ==========================================
// SINGLETON EXPORTS
// ==========================================

export const mlModelRegistry = new MLModelRegistry();
export const mlPredictionService = new MLPredictionService(mlModelRegistry);
export const mlMonitoringService = new MLMonitoringService(mlModelRegistry, mlPredictionService);
