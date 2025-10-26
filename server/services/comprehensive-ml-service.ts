import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Comprehensive ML Service
 *
 * TypeScript wrapper for the comprehensive Python ML lifecycle
 * Provides intelligent library selection and end-to-end ML capabilities
 */

export interface MLConfig {
  problem_type: 'classification' | 'regression' | 'clustering' | 'timeseries';
  data_path?: string;
  data?: any[];
  target_column?: string;
  feature_columns?: string[];
  library_preference?: 'sklearn' | 'xgboost' | 'lightgbm' | 'tensorflow' | 'spark' | 'auto';
  use_automl?: boolean;
  automl_trials?: number;
  test_size?: number;
  random_state?: number;
  use_deep_learning?: boolean;
  enable_explainability?: boolean;
  model_save_path?: string;
}

export interface MLResult {
  success: boolean;
  library_used: string;
  model_path?: string;
  metrics?: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1_score?: number;
    roc_auc?: number;
    rmse?: number;
    mae?: number;
    r2?: number;
    [key: string]: number | undefined;
  };
  explainability?: {
    shap_feature_importance?: Record<string, number>;
    lime_explanations?: any[];
  };
  automl_results?: {
    best_params: Record<string, any>;
    optimization_history: any[];
  };
  execution_time_seconds?: number;
  error?: string;
}

export interface LibraryRecommendation {
  recommended_library: 'sklearn' | 'xgboost' | 'lightgbm' | 'tensorflow' | 'spark';
  reasoning: string;
  row_count: number;
  alternatives: string[];
}

export class ComprehensiveMLService {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(
      process.cwd(),
      'python',
      'comprehensive_ml_lifecycle.py'
    );
  }

  /**
   * Get library recommendation based on dataset characteristics
   */
  async getLibraryRecommendation(
    rowCount: number,
    problemType: string,
    useDeepLearning: boolean = false
  ): Promise<LibraryRecommendation> {
    const SMALL_THRESHOLD = 100_000;
    const MEDIUM_THRESHOLD = 10_000_000;

    if (useDeepLearning) {
      return {
        recommended_library: 'tensorflow',
        reasoning: 'Deep learning requested - TensorFlow provides best neural network capabilities',
        row_count: rowCount,
        alternatives: ['sklearn (for simple models)']
      };
    }

    if (rowCount > MEDIUM_THRESHOLD) {
      return {
        recommended_library: 'spark',
        reasoning: `Large dataset (${rowCount.toLocaleString()} rows) - Spark MLlib provides distributed processing`,
        row_count: rowCount,
        alternatives: ['lightgbm (if Spark unavailable)', 'xgboost']
      };
    }

    if (rowCount > SMALL_THRESHOLD) {
      return {
        recommended_library: 'lightgbm',
        reasoning: `Medium dataset (${rowCount.toLocaleString()} rows) - LightGBM is 5-10x faster than sklearn`,
        row_count: rowCount,
        alternatives: ['xgboost', 'sklearn']
      };
    }

    return {
      recommended_library: 'sklearn',
      reasoning: `Small dataset (${rowCount.toLocaleString()} rows) - scikit-learn provides flexibility and interpretability`,
      row_count: rowCount,
      alternatives: ['xgboost', 'lightgbm']
    };
  }

  /**
   * Run comprehensive ML pipeline
   */
  async runMLPipeline(config: MLConfig): Promise<MLResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      // Prepare configuration
      const pythonConfig = {
        problem_type: config.problem_type,
        data_path: config.data_path,
        target_column: config.target_column,
        feature_columns: config.feature_columns,
        library_preference: config.library_preference || 'auto',
        use_automl: config.use_automl !== false, // Default true
        automl_trials: config.automl_trials || 50,
        test_size: config.test_size || 0.2,
        random_state: config.random_state || 42,
        use_deep_learning: config.use_deep_learning || false,
        enable_explainability: config.enable_explainability !== false, // Default true
        model_save_path: config.model_save_path
      };

      // Spawn Python process
      const pythonProcess = spawn('python', [this.pythonScriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      // Send config and data to Python via stdin
      const inputData = {
        config: pythonConfig,
        data: config.data
      };
      pythonProcess.stdin.write(JSON.stringify(inputData));
      pythonProcess.stdin.end();

      // Collect output
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        const executionTime = (Date.now() - startTime) / 1000;

        if (code !== 0) {
          console.error('❌ Python ML process failed:', stderr);
          resolve({
            success: false,
            library_used: 'unknown',
            error: stderr || 'Python process failed',
            execution_time_seconds: executionTime
          });
          return;
        }

        try {
          // Parse JSON result from Python
          const result = JSON.parse(stdout);

          resolve({
            success: true,
            library_used: result.library_used,
            model_path: result.model_path,
            metrics: result.metrics,
            explainability: result.explainability,
            automl_results: result.automl_results,
            execution_time_seconds: executionTime
          });
        } catch (error) {
          console.error('❌ Failed to parse Python ML result:', error);
          console.error('Raw output:', stdout);
          resolve({
            success: false,
            library_used: 'unknown',
            error: `Failed to parse result: ${error}`,
            execution_time_seconds: executionTime
          });
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  /**
   * Train model with automatic library selection
   */
  async trainModel(
    data: any[],
    targetColumn: string,
    problemType: 'classification' | 'regression',
    options: {
      featureColumns?: string[];
      useAutoML?: boolean;
      automlTrials?: number;
      enableExplainability?: boolean;
      libraryPreference?: string;
    } = {}
  ): Promise<MLResult> {
    const config: MLConfig = {
      problem_type: problemType,
      data,
      target_column: targetColumn,
      feature_columns: options.featureColumns,
      use_automl: options.useAutoML !== false,
      automl_trials: options.automlTrials,
      enable_explainability: options.enableExplainability !== false,
      library_preference: options.libraryPreference as any,
      model_save_path: path.join(process.cwd(), 'uploads', 'models', `model_${Date.now()}.pkl`)
    };

    return this.runMLPipeline(config);
  }

  /**
   * Train classification model
   */
  async trainClassifier(
    data: any[],
    targetColumn: string,
    options: {
      featureColumns?: string[];
      useAutoML?: boolean;
      enableExplainability?: boolean;
    } = {}
  ): Promise<MLResult> {
    return this.trainModel(data, targetColumn, 'classification', options);
  }

  /**
   * Train regression model
   */
  async trainRegression(
    data: any[],
    targetColumn: string,
    options: {
      featureColumns?: string[];
      useAutoML?: boolean;
      enableExplainability?: boolean;
    } = {}
  ): Promise<MLResult> {
    return this.trainModel(data, targetColumn, 'regression', options);
  }

  /**
   * Run AutoML to find best model and hyperparameters
   */
  async runAutoML(
    data: any[],
    targetColumn: string,
    problemType: 'classification' | 'regression',
    options: {
      trials?: number;
      featureColumns?: string[];
    } = {}
  ): Promise<MLResult> {
    return this.trainModel(data, targetColumn, problemType, {
      ...options,
      useAutoML: true,
      automlTrials: options.trials || 50
    });
  }

  /**
   * Generate model explainability (SHAP + LIME)
   */
  async explainModel(
    modelPath: string,
    testData: any[]
  ): Promise<{
    shap_feature_importance: Record<string, number>;
    lime_explanations: any[];
  }> {
    // This would require loading the saved model and running explainability
    // For now, return placeholder - full implementation would call Python script
    throw new Error('Model explainability requires saved model - use trainModel with enableExplainability: true');
  }

  /**
   * Health check - verify Python dependencies
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    libraries: {
      sklearn: boolean;
      xgboost: boolean;
      lightgbm: boolean;
      tensorflow: boolean;
      shap: boolean;
      lime: boolean;
      optuna: boolean;
    };
    errors: string[];
  }> {
    return new Promise((resolve) => {
      const pythonCode = `
import sys
import json

libraries = {}
errors = []

try:
    import sklearn
    libraries['sklearn'] = True
except Exception as e:
    libraries['sklearn'] = False
    errors.append(f'sklearn: {str(e)}')

try:
    import xgboost
    libraries['xgboost'] = True
except Exception as e:
    libraries['xgboost'] = False
    errors.append(f'xgboost: {str(e)}')

try:
    import lightgbm
    libraries['lightgbm'] = True
except Exception as e:
    libraries['lightgbm'] = False
    errors.append(f'lightgbm: {str(e)}')

try:
    import tensorflow
    libraries['tensorflow'] = True
except Exception as e:
    libraries['tensorflow'] = False
    errors.append(f'tensorflow: {str(e)}')

try:
    import shap
    libraries['shap'] = True
except Exception as e:
    libraries['shap'] = False
    errors.append(f'shap: {str(e)}')

try:
    import lime
    libraries['lime'] = True
except Exception as e:
    libraries['lime'] = False
    errors.append(f'lime: {str(e)}')

try:
    import optuna
    libraries['optuna'] = True
except Exception as e:
    libraries['optuna'] = False
    errors.append(f'optuna: {str(e)}')

print(json.dumps({'libraries': libraries, 'errors': errors}))
`;

      const pythonProcess = spawn('python', ['-c', pythonCode]);
      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            status: 'unhealthy',
            libraries: {
              sklearn: false,
              xgboost: false,
              lightgbm: false,
              tensorflow: false,
              shap: false,
              lime: false,
              optuna: false
            },
            errors: [stderr || 'Python process failed']
          });
          return;
        }

        try {
          const result = JSON.parse(stdout);
          const allHealthy = Object.values(result.libraries).every((v: any) => v === true);

          resolve({
            status: allHealthy ? 'healthy' : 'unhealthy',
            libraries: result.libraries,
            errors: result.errors
          });
        } catch (error) {
          resolve({
            status: 'unhealthy',
            libraries: {
              sklearn: false,
              xgboost: false,
              lightgbm: false,
              tensorflow: false,
              shap: false,
              lime: false,
              optuna: false
            },
            errors: [`Failed to parse health check: ${error}`]
          });
        }
      });
    });
  }
}

// Singleton instance
export const comprehensiveMLService = new ComprehensiveMLService();
