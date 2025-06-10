import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface MLAnalysisRequest {
  projectId: string;
  analysisType: 'regression' | 'classification' | 'clustering' | 'timeseries' | 'anomaly' | 'association';
  targetColumn?: string;
  features?: string[];
  parameters?: Record<string, any>;
  userId: number;
}

export interface MLAnalysisResult {
  analysisType: string;
  results: {
    summary: string;
    metrics?: Record<string, number>;
    visualizations?: Array<{
      type: string;
      title: string;
      data: any;
      config: any;
    }>;
    insights: string[];
    recommendations: string[];
    modelPerformance?: {
      accuracy?: number;
      precision?: number;
      recall?: number;
      f1Score?: number;
      rmse?: number;
      r2Score?: number;
      silhouetteScore?: number;
    };
  };
  processingTime: number;
  dataQuality: {
    completeness: number;
    consistency: number;
    accuracy: number;
    issues: string[];
  };
}

export class MLService {
  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    this.pythonPath = 'python';
    this.scriptPath = path.join(process.cwd(), 'server', 'ml-analysis.py');
  }

  async runAnalysis(request: MLAnalysisRequest, dataPath: string): Promise<MLAnalysisResult> {
    const startTime = Date.now();

    try {
      const result = await this.executePythonScript(request, dataPath);
      const processingTime = Date.now() - startTime;

      return {
        ...result,
        processingTime
      };
    } catch (error) {
      throw new Error(`ML Analysis failed: ${error.message}`);
    }
  }

  private async executePythonScript(request: MLAnalysisRequest, dataPath: string): Promise<MLAnalysisResult> {
    return new Promise((resolve, reject) => {
      const args = [
        this.scriptPath,
        '--analysis-type', request.analysisType,
        '--data-path', dataPath,
        '--project-id', request.projectId,
      ];

      if (request.targetColumn) {
        args.push('--target-column', request.targetColumn);
      }

      if (request.features && request.features.length > 0) {
        args.push('--features', request.features.join(','));
      }

      if (request.parameters) {
        args.push('--parameters', JSON.stringify(request.parameters));
      }

      const pythonProcess = spawn(this.pythonPath, args);
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse ML analysis results: ${parseError.message}`));
          }
        } else {
          reject(new Error(`Python script failed with code ${code}: ${errorOutput}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  }

  getAnalysisTypes() {
    return {
      regression: {
        name: 'Regression Analysis',
        description: 'Predict continuous numerical values',
        algorithms: ['Linear Regression', 'Random Forest', 'Gradient Boosting', 'SVR'],
        useCase: 'Predicting house prices, sales forecasting, risk assessment',
        requirements: 'Numerical target variable',
        outputMetrics: ['R² Score', 'RMSE', 'MAE', 'Feature Importance']
      },
      classification: {
        name: 'Classification',
        description: 'Predict categories or classes',
        algorithms: ['Logistic Regression', 'Random Forest', 'SVM', 'Neural Networks'],
        useCase: 'Customer segmentation, fraud detection, sentiment analysis',
        requirements: 'Categorical target variable',
        outputMetrics: ['Accuracy', 'Precision', 'Recall', 'F1-Score', 'Confusion Matrix']
      },
      clustering: {
        name: 'Clustering',
        description: 'Group similar data points together',
        algorithms: ['K-Means', 'DBSCAN', 'Hierarchical Clustering', 'Gaussian Mixture'],
        useCase: 'Customer segmentation, market research, anomaly detection',
        requirements: 'No target variable needed',
        outputMetrics: ['Silhouette Score', 'Inertia', 'Cluster Visualization']
      },
      timeseries: {
        name: 'Time Series Analysis',
        description: 'Analyze temporal patterns and forecast future values',
        algorithms: ['ARIMA', 'Prophet', 'LSTM', 'Seasonal Decomposition'],
        useCase: 'Sales forecasting, demand planning, trend analysis',
        requirements: 'Date/time column and numerical values',
        outputMetrics: ['Forecast Accuracy', 'Trend Analysis', 'Seasonality']
      },
      anomaly: {
        name: 'Anomaly Detection',
        description: 'Identify unusual patterns or outliers',
        algorithms: ['Isolation Forest', 'One-Class SVM', 'Local Outlier Factor'],
        useCase: 'Fraud detection, quality control, system monitoring',
        requirements: 'Numerical features',
        outputMetrics: ['Anomaly Score', 'Detection Rate', 'Outlier Visualization']
      },
      association: {
        name: 'Association Rules',
        description: 'Find relationships between different items',
        algorithms: ['Apriori', 'FP-Growth', 'Eclat'],
        useCase: 'Market basket analysis, recommendation systems',
        requirements: 'Transactional or categorical data',
        outputMetrics: ['Support', 'Confidence', 'Lift', 'Rule Strength']
      }
    };
  }

  getRecommendedAnalysis(schema: Record<string, string>, recordCount: number): string[] {
    const recommendations: string[] = [];
    const columns = Object.keys(schema);
    const hasNumerical = columns.some(col => this.isNumericalColumn(schema[col]));
    const hasCategorical = columns.some(col => this.isCategoricalColumn(schema[col]));
    const hasDate = columns.some(col => this.isDateColumn(schema[col]));

    // Regression recommendations
    if (hasNumerical && recordCount > 50) {
      recommendations.push('regression');
    }

    // Classification recommendations
    if (hasCategorical && hasNumerical && recordCount > 100) {
      recommendations.push('classification');
    }

    // Clustering recommendations
    if (hasNumerical && recordCount > 100) {
      recommendations.push('clustering');
    }

    // Time series recommendations
    if (hasDate && hasNumerical && recordCount > 200) {
      recommendations.push('timeseries');
    }

    // Anomaly detection recommendations
    if (hasNumerical && recordCount > 200) {
      recommendations.push('anomaly');
    }

    // Association rules recommendations
    if (hasCategorical && recordCount > 500) {
      recommendations.push('association');
    }

    return recommendations;
  }

  private isNumericalColumn(type: string): boolean {
    return ['number', 'float', 'int', 'numeric'].includes(type.toLowerCase());
  }

  private isCategoricalColumn(type: string): boolean {
    return ['text', 'string', 'category', 'categorical'].includes(type.toLowerCase());
  }

  private isDateColumn(type: string): boolean {
    return ['date', 'datetime', 'timestamp'].includes(type.toLowerCase());
  }

  async validateAnalysisRequest(request: MLAnalysisRequest, schema: Record<string, string>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const columns = Object.keys(schema);

    // Validate target column for supervised learning
    if (['regression', 'classification'].includes(request.analysisType)) {
      if (!request.targetColumn) {
        errors.push('Target column is required for supervised learning');
      } else if (!columns.includes(request.targetColumn)) {
        errors.push(`Target column '${request.targetColumn}' not found in dataset`);
      }
    }

    // Validate features
    if (request.features && request.features.length > 0) {
      const invalidFeatures = request.features.filter(feature => !columns.includes(feature));
      if (invalidFeatures.length > 0) {
        errors.push(`Invalid features: ${invalidFeatures.join(', ')}`);
      }
    }

    // Analysis-specific validations
    switch (request.analysisType) {
      case 'regression':
        if (request.targetColumn && !this.isNumericalColumn(schema[request.targetColumn])) {
          errors.push('Regression requires a numerical target column');
        }
        break;
      case 'timeseries':
        const hasDateColumn = columns.some(col => this.isDateColumn(schema[col]));
        if (!hasDateColumn) {
          errors.push('Time series analysis requires a date/time column');
        }
        break;
      case 'clustering':
        const numericalColumns = columns.filter(col => this.isNumericalColumn(schema[col]));
        if (numericalColumns.length < 2) {
          errors.push('Clustering requires at least 2 numerical columns');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const mlService = new MLService();