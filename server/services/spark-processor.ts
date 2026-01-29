import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module compatibility for __dirname
// For tsx and ts-node, use a robust approach
const getFileDirname = (): string => {
  try {
    // Try ES module approach first
    if (typeof import.meta.url !== 'undefined') {
      const __filename = fileURLToPath(import.meta.url);
      return path.dirname(__filename);
    }
  } catch (e) {
    // Ignore and fall through
  }
  
  // Fallback: use process.cwd() with known relative path
  // This works for both CommonJS and ESM in tsx/ts-node
  return path.join(process.cwd(), 'server', 'services');
};

const __dirname = getFileDirname();

/**
 * Ensure PYTHONPATH includes Spark's python directories so that
 * `import pyspark` works even when the OS PATH isn't configured.
 */
const injectSparkPythonPath = (): string[] => {
    const sparkHome = process.env.SPARK_HOME;
    if (!sparkHome) {
        return [];
    }

    const pythonDir = path.join(sparkHome, 'python');
    const libDir = path.join(pythonDir, 'lib');
    const injectedPaths: string[] = [];

    if (fs.existsSync(pythonDir)) {
        injectedPaths.push(pythonDir);
    }

    if (fs.existsSync(libDir)) {
        const py4jZip = fs.readdirSync(libDir).find(file => /^py4j.*\.zip$/i.test(file));
        if (py4jZip) {
            injectedPaths.push(path.join(libDir, py4jZip));
        }
    }

    if (injectedPaths.length === 0) {
        return [];
    }

    const existing = process.env.PYTHONPATH
        ? process.env.PYTHONPATH.split(path.delimiter).filter(Boolean)
        : [];

    const newEntries = injectedPaths.filter(p => !existing.includes(p));
    if (newEntries.length === 0) {
        return [];
    }

    process.env.PYTHONPATH = [...newEntries, ...existing].join(path.delimiter);
    return newEntries;
};

const sparkPythonInjections = injectSparkPythonPath();
if (sparkPythonInjections.length > 0) {
    console.log('[SparkProcessor] Injected Spark python paths from SPARK_HOME:', sparkPythonInjections);
}

// Define SparkConfig interface locally to avoid circular imports
interface SparkConfig {
  master: string;
  appName: string;
  sparkHome?: string;
  executorMemory: string;
  driverMemory: string;
  maxCores?: number;
  pythonPath?: string;
  javaOptions: Record<string, string>;
  enableHiveSupport: boolean;
  warehouse: string;
  checkpointDir?: string;
  eventLogEnabled: boolean;
  eventLogDir?: string;
  serializer: string;
}

// Simple configuration getter to avoid dependency issues
function getSimpleSparkConfig(): SparkConfig {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    master: process.env.SPARK_MASTER_URL || (isDevelopment ? 'local[*]' : 'spark://cluster:7077'),
    appName: process.env.SPARK_APP_NAME || 'ChimariData-Analytics',
    sparkHome: process.env.SPARK_HOME,
    executorMemory: process.env.SPARK_EXECUTOR_MEMORY || '2g',
    driverMemory: process.env.SPARK_DRIVER_MEMORY || '1g',
    maxCores: process.env.SPARK_MAX_CORES ? parseInt(process.env.SPARK_MAX_CORES) : undefined,
    pythonPath: process.env.SPARK_PYTHON_PATH || process.env.PYTHON_PATH,
    javaOptions: {
      'spark.driver.extraJavaOptions': process.env.SPARK_DRIVER_JAVA_OPTS || '-XX:+UseG1GC',
      'spark.executor.extraJavaOptions': process.env.SPARK_EXECUTOR_JAVA_OPTS || '-XX:+UseG1GC',
      'spark.sql.adaptive.enabled': 'true',
      'spark.serializer': 'org.apache.spark.serializer.KryoSerializer'
    },
    enableHiveSupport: process.env.SPARK_ENABLE_HIVE === 'true',
    warehouse: process.env.SPARK_WAREHOUSE_DIR || './warehouse',
    checkpointDir: process.env.SPARK_CHECKPOINT_DIR,
    eventLogEnabled: process.env.SPARK_EVENT_LOG_ENABLED === 'true',
    eventLogDir: process.env.SPARK_EVENT_LOG_DIR || './spark-events',
    serializer: 'org.apache.spark.serializer.KryoSerializer'
  };
}

// Local minimal stub for SparkSession to avoid hard dependency on external module during development/tests
type SparkSession = {
    stop?: () => Promise<void> | void;
};

interface SparkConnectionPool {
    sessions: Map<string, SparkSession>;
    maxSessions: number;
    currentSessions: number;
}

/**
 * Production-ready service to interact with a Spark cluster for heavy data processing.
 * Automatically switches between real Spark implementation and mock based on environment.
 */
export class SparkProcessor {
    private spark?: SparkSession;
    private config: SparkConfig;
    private connectionPool: SparkConnectionPool;
    private isInitialized: boolean = false;
    private isProduction: boolean;
    private pythonPath: string;

    private sparkUnavailable: boolean = false;

    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.config = getSimpleSparkConfig();
        // Check PYSPARK_PYTHON first, then PYTHON_PATH, then defaults
        this.pythonPath = process.env.PYSPARK_PYTHON || process.env.PYTHON_PATH || 'python3';

        this.connectionPool = {
            sessions: new Map(),
            maxSessions: parseInt(process.env.SPARK_MAX_SESSIONS || '5'),
            currentSessions: 0
        };

        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            await this.initializeSparkCluster();
            console.log(`SparkProcessor initialized with real Spark cluster: ${this.config.master}`);
            this.isInitialized = true;
        } catch (error) {
            console.error('Failed to initialize Spark cluster:', error);
            this.sparkUnavailable = true;
            this.isInitialized = true;
        }
    }

    private async initializeSparkCluster(): Promise<void> {
        // Test connection to Spark cluster
        const testResult = await this.executeSparkOperation('test_connection', {});
        if (!testResult.success) {
            throw new Error(`Failed to connect to Spark cluster: ${testResult.error}`);
        }
    }

    private async executeSparkOperation(operation: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, '../../python/spark/spark_bridge.py');
            const configJson = JSON.stringify(this.config);
            const argsJson = JSON.stringify(args);

            // Set PySpark Python environment variables
            const env = {
                ...process.env,
                PYSPARK_PYTHON: this.pythonPath,
                PYSPARK_DRIVER_PYTHON: this.pythonPath,
                PYTHONPATH: process.env.PYTHONPATH
            };

            const pythonProcess = spawn(this.pythonPath, [scriptPath, operation, configJson, argsJson], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: env
            });

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        resolve(result);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse Spark result: ${parseError}`));
                    }
                } else {
                    reject(new Error(`Spark operation failed with code ${code}: ${stderr}`));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to execute Spark operation: ${error.message}`));
            });
        });
    }

    /**
     * Applies a series of transformations to a dataset using Spark.
     * @param data The input data or file path.
     * @param transformations The transformations to apply.
     * @returns The transformed data.
     */
    async applyTransformations(data: any[] | string, transformations: any[]): Promise<any[]> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Handle data input - if it's an array, save it temporarily
        let dataPath: string;
        if (Array.isArray(data)) {
            dataPath = await this.saveTemporaryData(data);
        } else {
            dataPath = data as string;
        }

        const result = await this.executeSparkOperation('apply_transformations', {
            data_path: dataPath,
            transformations: transformations
        });

        if (!result.success) {
            throw new Error(result.error);
        }

        // Load transformed data
        return await this.loadTransformedData(result.output_path);
    }

    /**
     * Performs a complex analysis (e.g., ML, statistical) on a dataset using Spark.
     * @param data The input data or file path.
     * @param analysisType The type of analysis to perform.
     * @param parameters The parameters for the analysis.
     * @returns The analysis result.
     */
    async performAnalysis(data: any[] | string, analysisType: string, parameters: any): Promise<any> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.sparkUnavailable) {
            console.warn(`⚠️ Spark unavailable - falling back to Python processor for ${analysisType}`);
            return await this.fallbackToPythonAnalysis(data, analysisType, parameters);
        }

        try {
            // Handle data input
            let dataPath: string;
            if (Array.isArray(data)) {
                dataPath = await this.saveTemporaryData(data);
            } else {
                dataPath = data as string;
            }

            const result = await this.executeSparkOperation('perform_analysis', {
                data_path: dataPath,
                analysis_type: analysisType,
                parameters: parameters
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            return result;

        } catch (error) {
            console.error(`Error in performAnalysis (${analysisType}):`, error);
            // Fallback to Python processor (real analysis, not mock)
            console.warn(`⚠️ Spark failed for ${analysisType}, falling back to Python processor`);
            return await this.fallbackToPythonAnalysis(data, analysisType, parameters);
        }
    }

    /**
     * Processes a raw file using Spark.
     * @param buffer The file buffer.
     * @param fileType The mime type of the file.
     * @returns Processed data, schema, and record count.
     */
    async processFile(buffer: Buffer, fileType: string): Promise<{ data: any[], schema: any, recordCount: number }> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Save buffer to temporary file
        const tempFilePath = await this.saveBufferToTempFile(buffer, fileType);

        try {
            const result = await this.executeSparkOperation('process_file', {
                file_path: tempFilePath,
                file_type: fileType,
                options: {
                    header: 'true',
                    inferSchema: 'true'
                }
            });

            // Cleanup temporary file
            await this.cleanupTempFile(tempFilePath);

            if (!result.success) {
                throw new Error(result.error);
            }

            return {
                data: result.data,
                schema: result.schema,
                recordCount: result.recordCount
            };

        } catch (error) {
            await this.cleanupTempFile(tempFilePath);
            throw error;
        }
    }

    // Utility methods
    private async saveTemporaryData(data: any[]): Promise<string> {
        const tempDir = process.env.TEMP_DIR || '/tmp';
        const fileName = `spark_data_${Date.now()}.json`;
        const filePath = path.join(tempDir, fileName);
        
        await fs.promises.writeFile(filePath, JSON.stringify(data), 'utf8');
        return filePath;
    }

    private async saveBufferToTempFile(buffer: Buffer, fileType: string): Promise<string> {
        const tempDir = process.env.TEMP_DIR || '/tmp';
        const extension = this.getFileExtension(fileType);
        const fileName = `spark_file_${Date.now()}.${extension}`;
        const filePath = path.join(tempDir, fileName);
        
        await fs.promises.writeFile(filePath, buffer);
        return filePath;
    }

    private getFileExtension(fileType: string): string {
        const mimeToExt: Record<string, string> = {
            'text/csv': 'csv',
            'application/json': 'json',
            'application/parquet': 'parquet',
            'text/plain': 'txt'
        };
        return mimeToExt[fileType] || 'dat';
    }

    private async loadTransformedData(outputPath: string): Promise<any[]> {
        try {
            const data = await fs.promises.readFile(outputPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return [{ error: 'failed_to_load_transformed_data' }];
        }
    }

    private async cleanupTempFile(filePath: string): Promise<void> {
        try {
            await fs.promises.unlink(filePath);
        } catch {
            // Ignore cleanup errors
        }
    }

    /**
     * Get Spark cluster status and metrics
     */
    async getClusterStatus(): Promise<any> {
        if (this.sparkUnavailable) {
            return {
                status: 'unavailable',
                cluster: this.config.master,
                available: false,
                sessions: 0,
                maxSessions: this.connectionPool.maxSessions
            };
        }

        try {
            return await this.executeSparkOperation('cluster_status', {});
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                status: 'error',
                error: message,
                available: false
            };
        }
    }

    /**
     * Health check for Spark processor
     */
    async healthCheck(): Promise<{ healthy: boolean; details: any }> {
        try {
            const status = await this.getClusterStatus();
            return {
                healthy: status.available !== false,
                details: {
                    ...status,
                    isInitialized: this.isInitialized,
                    sparkUnavailable: this.sparkUnavailable,
                    config: {
                        master: this.config.master,
                        appName: this.config.appName
                    }
                }
            };
        } catch (error) {
            return {
                healthy: false,
                details: {
                    error: error instanceof Error ? error.message : String(error),
                    isInitialized: this.isInitialized,
                    sparkUnavailable: this.sparkUnavailable
                }
            };
        }
    }

    /**
     * P0-7 FIX: Fallback to Python processor when Spark is not available
     * Uses pandas/numpy for analysis instead of PySpark
     */
    private async fallbackToPythonAnalysis(
        data: any,
        analysisType: string,
        parameters?: any
    ): Promise<any> {
        console.log(`🐍 [Spark Fallback] Running ${analysisType} analysis with Python (pandas/numpy)...`);

        try {
            // Import PythonProcessor dynamically to avoid circular dependencies
            const { PythonProcessor } = await import('./python-processor');

            // Prepare data for Python analysis
            let dataForAnalysis: any[];
            if (Array.isArray(data)) {
                dataForAnalysis = data;
            } else if (typeof data === 'string') {
                // If it's a file path, we need to read it
                // For now, return a warning that file-based analysis requires Spark
                console.warn('⚠️ [Spark Fallback] File-based analysis not supported in Python fallback');
                return {
                    success: false,
                    error: 'File-based analysis requires Spark cluster. Please ensure Spark is configured.',
                    fallback: true
                };
            } else if (data?.preview) {
                dataForAnalysis = data.preview;
            } else {
                dataForAnalysis = [data];
            }

            // Map Spark analysis types to Python analysis
            const analysisMapping: Record<string, string> = {
                'descriptive': 'descriptive_stats',
                'correlation': 'correlation_analysis',
                'regression': 'regression_analysis',
                'clustering': 'clustering_analysis',
                'time_series': 'time_series_analysis',
                'statistical': 'descriptive_stats'
            };

            const pythonAnalysisType = analysisMapping[analysisType] || 'descriptive_stats';

            // Execute using Python processor
            const result = await PythonProcessor.processTrial(`fallback_${Date.now()}`, {
                preview: dataForAnalysis,
                schema: data?.schema || {},
                recordCount: dataForAnalysis.length
            });

            console.log(`✅ [Spark Fallback] ${analysisType} analysis completed with Python processor`);

            return {
                success: true,
                ...result,
                analysisType,
                parameters,
                fallback: true,
                processorUsed: 'python_pandas'
            };

        } catch (error) {
            console.error(`❌ [Spark Fallback] Python analysis failed:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                analysisType,
                fallback: true,
                processorUsed: 'python_pandas'
            };
        }
    }

    /**
     * Stop Spark session and cleanup resources
     */
    async stop(): Promise<void> {
        if (this.spark) {
            await this.spark.stop?.();
        }
        
        // Cleanup connection pool
        for (const [sessionId, session] of this.connectionPool.sessions) {
            await session.stop?.();
        }
        this.connectionPool.sessions.clear();
        this.connectionPool.currentSessions = 0;
    }
}
