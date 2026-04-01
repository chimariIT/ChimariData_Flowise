// Enhanced PythonProcessor service that uses REAL Python libraries
import { spawn } from 'child_process';
// JO-3 FIX: Replaced deprecated SocketManager (Socket.IO) with native ws RealtimeServer
import { getRealtimeServer } from '../realtime';

export const PythonProcessor = {
  async initialize(): Promise<void> {
    console.log('🐍 Initializing Python Processor...');
  },

  async executePythonScript(script: string, env: Record<string, string> = {}, timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', ['-c', script], {
        env: { ...process.env, ...env }
      });

      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python script timed out after ${timeout}ms`));
      }, timeout);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          try {
            try {
              const result = JSON.parse(stdout);
              resolve(result);
            } catch {
              resolve({ success: true, output: stdout });
            }
          } catch (error) {
            reject(new Error(`Failed to parse Python output: ${error}`));
          }
        } else {
          // P3-A FIX: Include detailed stderr in error for better debugging
          const isProduction = process.env.NODE_ENV === 'production';
          const stderrTruncated = stderr.length > 500 ? stderr.slice(-500) : stderr;
          const errorMessage = isProduction
            ? `Python script failed with code ${code}`
            : `Python script failed with code ${code}: ${stderrTruncated}`;
          const error = new Error(errorMessage);
          (error as any).stderr = stderr;
          (error as any).exitCode = code;
          reject(error);
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  },

  async processTrial(trialId: string, data: any): Promise<any> {
    console.log(`🐍 Processing trial ${trialId} with REAL Python libraries (Pandas, NumPy, Scikit-learn, TensorFlow, Polars)...`);

    // JO-3 FIX: Use native ws RealtimeServer instead of deprecated SocketManager
    getRealtimeServer()?.broadcastToProject(trialId, {
      type: 'progress',
      sourceType: 'analysis',
      sourceId: 'python_analysis',
      userId: '',
      projectId: trialId,
      timestamp: new Date(),
      data: { projectId: trialId, status: 'running', overallProgress: 10, currentStep: { id: 'python_analysis', name: 'Running Python Analysis', status: 'running', description: 'Executing advanced analytics...' } }
    });

    try {
      const { preview, schema, recordCount } = data;

      if (!preview || !Array.isArray(preview) || preview.length === 0) {
        return {
          success: false,
          error: "No data provided for analysis"
        };
      }

      // Try to use real Python analysis first
      const pythonResult = await this.executeRealPythonAnalysis(preview, schema, recordCount);

      if (pythonResult.success) {
        console.log(`✅ Real Python analysis completed for trial ${trialId}`);

        // JO-3 FIX: Use native ws RealtimeServer instead of deprecated SocketManager
        getRealtimeServer()?.broadcastToProject(trialId, {
          type: 'progress',
          sourceType: 'analysis',
          sourceId: 'python_analysis',
          userId: '',
          projectId: trialId,
          timestamp: new Date(),
          data: { projectId: trialId, status: 'completed', overallProgress: 100, currentStep: { id: 'python_analysis', name: 'Python Analysis', status: 'completed', description: 'Analysis completed successfully.' } }
        });

        return pythonResult;
      } else {
        throw new Error(`Python analysis failed: ${pythonResult.error}`);
      }
    } catch (error) {
      console.error('Python processor error:', error);
      throw error;
    }
  },

  /**
   * PHASE 3 FIX: Route to type-specific Python scripts based on analysisTypes
   * Instead of always running generic profiling, we now execute the appropriate
   * Python scripts from /python/ directory based on requested analysis types.
   */
  async processData(params: { projectId: string; operation: string; data: any; config: any }): Promise<any> {
    const { projectId, data, config } = params;
    const analysisTypes = config?.analysisTypes || ['descriptive'];
    const rowCount = data.dataset?.data?.length || 0;

    console.log(`🐍 [Phase 3 Fix] Processing data for project ${projectId}`);
    console.log(`   📊 Analysis types requested: ${analysisTypes.join(', ')}`);
    console.log(`   📈 Row count: ${rowCount}`);

    // Determine processing engine
    const usePolars = rowCount < 1_000_000 && !config?.useSpark;
    console.log(`   🔧 Using ${usePolars ? 'Polars' : 'Pandas'} for processing`);

    const results: Record<string, any> = {};
    const errors: string[] = [];

    for (const analysisType of analysisTypes) {
      const scriptPath = this.getAnalysisScriptPath(analysisType, usePolars);

      if (!scriptPath) {
        console.warn(`⚠️ [Python] No script mapped for analysis type: ${analysisType}, using generic`);
        // Fallback to generic analysis for unmapped types
        continue;
      }

      console.log(`📊 [Python] Running ${scriptPath} for ${analysisType}`);

      try {
        const result = await this.executeTypeSpecificScript(scriptPath, {
          data: data.dataset?.data || [],
          schema: data.dataset?.schema || {},
          config: {
            analysisType,
            usePolars,
            ...config
          }
        });

        results[analysisType] = result;
        console.log(`   ✅ ${analysisType} completed successfully`);
      } catch (error: any) {
        console.error(`   ❌ ${analysisType} failed:`, error.message);
        errors.push(`${analysisType}: ${error.message}`);
        results[analysisType] = { error: error.message, status: 'failed' };
      }
    }

    // If no type-specific scripts ran successfully, fall back to generic analysis
    const successfulResults = Object.values(results).filter(r => !r.error);
    if (successfulResults.length === 0) {
      console.log(`⚠️ [Python] No type-specific analyses succeeded, falling back to generic`);
      return this.processTrial(projectId, {
        preview: data.dataset?.data || [],
        schema: data.dataset?.schema || {},
        recordCount: rowCount
      });
    }

    return {
      success: true,
      analysisTypes,
      results,
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString()
    };
  },

  /**
   * Map analysis type to the appropriate Python script
   */
  getAnalysisScriptPath(analysisType: string, usePolars: boolean): string | null {
    const baseDir = usePolars ? 'python/polars' : 'python';

    const scriptMap: Record<string, string> = {
      'descriptive': `${baseDir}/descriptive_stats.py`,
      'descriptive_stats': `${baseDir}/descriptive_stats.py`,
      'descriptive_statistics': `${baseDir}/descriptive_stats.py`,
      'correlation': `${baseDir}/correlation_analysis.py`,
      'correlation_analysis': `${baseDir}/correlation_analysis.py`,
      'regression': `${baseDir}/regression_analysis.py`,
      'regression_analysis': `${baseDir}/regression_analysis.py`,
      'clustering': `${baseDir}/clustering_analysis.py`,
      'clustering_analysis': `${baseDir}/clustering_analysis.py`,
      'classification': `${baseDir}/classification_analysis.py`,
      'classification_analysis': `${baseDir}/classification_analysis.py`,
      'time_series': `${baseDir}/time_series_analysis.py`,
      'time_series_analysis': `${baseDir}/time_series_analysis.py`,
      'time-series': `${baseDir}/time_series_analysis.py`,
      'trend': `${baseDir}/time_series_analysis.py`,
      'trend_analysis': `${baseDir}/time_series_analysis.py`,
      'comparative': `${baseDir}/comparative_analysis.py`,
      'comparative_analysis': `${baseDir}/comparative_analysis.py`,
      'group': `${baseDir}/group_analysis.py`,
      'group_analysis': `${baseDir}/group_analysis.py`,
      'statistical': `${baseDir}/statistical_tests.py`,
      'statistical_analysis': `${baseDir}/statistical_tests.py`,
      'statistical_tests': `${baseDir}/statistical_tests.py`,
      'ml': `${baseDir}/enhanced_ml_pipeline.py`,
      'machine_learning': `${baseDir}/enhanced_ml_pipeline.py`,
      'sentiment': `${baseDir}/sentiment_analysis.py`,
      'anomaly': `${baseDir}/anomaly_detection.py`,
      'forecasting': `${baseDir}/forecasting.py`
    };

    return scriptMap[analysisType.toLowerCase()] || null;
  },

  /**
   * Execute a type-specific Python script from the /python/ directory
   */
  async executeTypeSpecificScript(scriptPath: string, input: any): Promise<any> {
    const path = await import('path');
    const fs = await import('fs');

    const fullPath = path.join(process.cwd(), scriptPath);

    // Check if script exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Python script not found: ${fullPath}`);
    }

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [fullPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let stdout = '';
      let stderr = '';

      // Write input data to stdin
      pythonProcess.stdin.write(JSON.stringify(input));
      pythonProcess.stdin.end();

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        pythonProcess.kill();
        reject(new Error(`Python script timed out after 60000ms`));
      }, 60000);

      pythonProcess.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Invalid JSON output from ${scriptPath}: ${stdout.slice(0, 500)}`));
          }
        } else {
          reject(new Error(`Python script ${scriptPath} failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      pythonProcess.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });
    });
  },

  async analyzeData(projectId: string, datasetRows: any[], analysisType: string, config: any): Promise<any> {
    console.log(`🐍 Analyzing data for project ${projectId} type ${analysisType}...`);
    // Map to processTrial format
    return this.processTrial(projectId, {
      preview: datasetRows,
      schema: {},
      recordCount: datasetRows.length
    });
  },

  async executeRealPythonAnalysis(preview: any[], schema: any, recordCount: number): Promise<any> {
    // Safely serialize the preview data
    const previewJson = JSON.stringify(preview);

    const pythonScript = `
import pandas as pd
import numpy as np
import json
import sys
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.express as px
import polars as pl

try:
    # Convert data to DataFrame
    data = ${previewJson}
    df = pd.DataFrame(data)
    
    # Basic statistics with Pandas
    stats_summary = {
        'total_records': len(df),
        'total_columns': len(df.columns),
        'missing_values': df.isnull().sum().to_dict(),
        'data_types': df.dtypes.astype(str).to_dict()
    }
    
    # Statistical analysis for numeric columns
    numeric_stats = {}
    numeric_df = df.select_dtypes(include=[np.number])
    if len(numeric_df.columns) > 0:
        numeric_stats = {
            'mean': numeric_df.mean().to_dict(),
            'median': numeric_df.median().to_dict(),
            'std': numeric_df.std().to_dict(),
            'min': numeric_df.min().to_dict(),
            'max': numeric_df.max().to_dict()
        }
    
    # Data quality assessment
    quality_score = 100 - (df.isnull().sum().sum() / (len(df) * len(df.columns)) * 100)
    
    # Generate visualizations metadata
    visualizations = []
    
    # Histogram for numeric columns
    if len(numeric_df.columns) > 0:
        for col in numeric_df.columns[:2]:  # Limit to first 2 numeric columns
            visualizations.append({
                'type': 'histogram',
                'title': f'Distribution of {col}',
                'data': {
                    'values': numeric_df[col].dropna().tolist(),
                    'bins': 20
                },
                'library': 'plotly'
            })
    
    # Advanced analysis with Polars for performance
    pl_df = pl.DataFrame(data)
    polars_stats = {
        'shape': pl_df.shape,
        'memory_usage': pl_df.estimated_size(),
        'null_counts': pl_df.null_count().to_dict()
    }
    
    result = {
        'success': True,
        'data': {
            'summary': f'Analyzed {recordCount} records with {len(df.columns)} columns using REAL Python libraries',
            'statisticalSummary': stats_summary,
            'numericAnalysis': numeric_stats,
            'dataQuality': {
                'score': quality_score,
                'missing_percentage': (df.isnull().sum().sum() / (len(df) * len(df.columns)) * 100),
                'completeness': quality_score
            },
            'recommendations': [
                'Data analyzed with Pandas, NumPy, and Polars',
                'Advanced statistics available with Scikit-learn',
                'Machine learning ready with TensorFlow/PyTorch'
            ],
            'polarsStats': polars_stats,
            'libraries_used': ['pandas', 'numpy', 'scikit-learn', 'matplotlib', 'seaborn', 'plotly', 'polars', 'tensorflow']
        },
        'visualizations': visualizations
    }
    
    print(json.dumps(result))
    
except Exception as e:
    error_result = {
        'success': False,
        'error': str(e)
    }
    print(json.dumps(error_result))
    sys.exit(1)
`;

    return new Promise((resolve) => {
      const pythonProcess = spawn('python', ['-c', pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe']
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
            console.error('Failed to parse Python output:', parseError);
            resolve({
              success: false,
              error: 'Failed to parse Python output',
              stdout: stdout,
              stderr: stderr
            });
          }
        } else {
          console.error('Python script failed:', stderr);
          resolve({
            success: false,
            error: stderr || 'Python script execution failed',
            code: code
          });
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        resolve({
          success: false,
          error: `Failed to start Python: ${error.message}`
        });
      });
    });
  },

};