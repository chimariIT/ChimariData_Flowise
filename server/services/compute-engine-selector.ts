/**
 * Compute Engine Selector
 * 
 * Intelligently selects the optimal compute engine (Local, Polars, or Spark)
 * based on dataset characteristics and analysis requirements.
 * 
 * @module ComputeEngineSelector
 */

/** Supported compute engines */
export type ComputeEngine = 'local' | 'polars' | 'spark';

/** Result of engine selection with reasoning */
export interface ComputeSelectionResult {
    engine: ComputeEngine;
    reason: string;
    confidence: number;
}

/** Context information for engine selection */
export interface SelectionContext {
    recordCount: number;
    analysisType: string;
    complexity?: 'basic' | 'intermediate' | 'advanced';
    dataVolumeMB?: number;
    availableResources?: {
        localMemoryMB: number;
        sparkAvailable: boolean;
        polarsAvailable?: boolean;
    };
}

/**
 * Service for selecting the optimal compute engine based on workload characteristics.
 * 
 * Selection Strategy:
 * - **Local** (Pandas/Node): < 50k records, simple analysis
 * - **Polars**: 50k - 1M records, high-performance single-node processing
 * - **Spark**: > 1M records, complex analysis, or distributed requirements
 */
export class ComputeEngineSelector {
    // Thresholds
    private static readonly SPARK_RECORD_THRESHOLD_HARD = 1000000; // Always Spark above this
    private static readonly POLARS_RECORD_THRESHOLD = 50000;       // Polars above this
    private static readonly SPARK_SIZE_THRESHOLD_MB = 500;         // Spark if data > 500MB
    private static readonly POLARS_SIZE_THRESHOLD_MB = 50;         // Polars if data > 50MB

    // Complex analysis types that benefit from Spark even at lower volumes
    private static readonly COMPLEX_ANALYSIS_TYPES = [
        'machine_learning',
        'clustering',
        'anomaly_detection',
        'time_series_forecasting',
        'advanced_regression',
        'anova'
    ];

    /**
     * Selects the optimal compute engine for the given workload.
     * 
     * @param context - Workload characteristics and resource availability
     * @returns Selection result with engine choice, reasoning, and confidence score
     * 
     * @example
     * ```typescript
     * const result = ComputeEngineSelector.selectEngine({
     *   recordCount: 100000,
     *   analysisType: 'regression',
     *   availableResources: { localMemoryMB: 4096, sparkAvailable: true }
     * });
     * console.log(result.engine); // 'polars'
     * ```
     */
    static selectEngine(context: SelectionContext): ComputeSelectionResult {
        const {
            recordCount,
            analysisType,
            complexity = 'basic',
            dataVolumeMB = 0,
            availableResources = { localMemoryMB: 4096, sparkAvailable: true, polarsAvailable: true }
        } = context;

        // 1. Spark Checks (Big Data)
        if (availableResources.sparkAvailable) {
            if (recordCount >= this.SPARK_RECORD_THRESHOLD_HARD) {
                return {
                    engine: 'spark',
                    reason: `Dataset size (${recordCount.toLocaleString()} records) exceeds local processing capacity`,
                    confidence: 0.95
                };
            }

            if (dataVolumeMB >= this.SPARK_SIZE_THRESHOLD_MB) {
                return {
                    engine: 'spark',
                    reason: `Dataset volume (${dataVolumeMB} MB) exceeds local memory safety margins`,
                    confidence: 0.9
                };
            }

            // Complex analysis on moderate data -> Spark
            const isComplex = this.COMPLEX_ANALYSIS_TYPES.includes(analysisType) || complexity === 'advanced';
            if (isComplex && recordCount >= this.POLARS_RECORD_THRESHOLD) {
                return {
                    engine: 'spark',
                    reason: `Complex analysis (${analysisType}) on moderate dataset (${recordCount.toLocaleString()} records) benefits from distributed processing`,
                    confidence: 0.85
                };
            }
        }

        // 2. Polars Checks (Medium Data / High Performance Single Node)
        if (availableResources.polarsAvailable !== false) {
            if (recordCount >= this.POLARS_RECORD_THRESHOLD) {
                return {
                    engine: 'polars',
                    reason: `Dataset size (${recordCount.toLocaleString()} records) is ideal for high-performance local processing (Polars)`,
                    confidence: 0.9
                };
            }

            if (dataVolumeMB >= this.POLARS_SIZE_THRESHOLD_MB) {
                return {
                    engine: 'polars',
                    reason: `Dataset volume (${dataVolumeMB} MB) benefits from memory-efficient processing (Polars)`,
                    confidence: 0.9
                };
            }
        }

        // 3. Default to Local (Pandas/Node) for smaller/simpler tasks
        return {
            engine: 'local',
            reason: 'Standard local processing is most efficient for this dataset size',
            confidence: 0.9
        };
    }

    /**
     * Returns recommended configuration for the selected engine.
     * 
     * @param engine - The selected compute engine
     * @param context - Workload characteristics
     * @returns Engine-specific configuration object
     */
    static getEngineConfig(engine: ComputeEngine, context: SelectionContext): any {
        if (engine === 'spark') {
            const isLarge = context.recordCount > 1000000;
            return {
                executorMemory: isLarge ? '4g' : '2g',
                driverMemory: isLarge ? '2g' : '1g',
                partitions: Math.max(2, Math.ceil(context.recordCount / 100000))
            };
        }

        if (engine === 'polars') {
            return {
                streaming: context.dataVolumeMB && context.dataVolumeMB > 200,
                memoryLimit: context.availableResources?.localMemoryMB || 4096
            };
        }

        return {
            maxOldSpaceSize: 4096
        };
    }
}
