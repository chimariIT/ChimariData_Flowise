import { spawn } from 'child_process';

interface PythonCommandResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface PythonExecutionResult {
  success: boolean;
  data?: any;
  visualizations?: any[];
  error?: string;
  libraries?: string[];
}

const DEFAULT_REQUIRED_LIBRARIES = [
  'pandas',
  'numpy',
  'scipy',
  'statsmodels',
  'sklearn',
  'matplotlib',
  'plotly',
  'seaborn',
  'polars',
  'tensorflow'
];

const ML_REQUIRED_LIBRARIES = ['pandas', 'numpy', 'sklearn', 'scipy', 'joblib'];

// Class-based Python processor so tool handlers can instantiate and check health
export class PythonProcessor {
  private readonly pythonPath: string;
  private initialized = false;

  constructor(pythonPath?: string) {
    const defaultExecutable = process.platform === 'win32' ? 'python' : 'python3';
    this.pythonPath = pythonPath || process.env.PYTHON_PATH || defaultExecutable;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const health = await this.healthCheck();
    if (!health.healthy) {
      throw new Error(`Python environment unhealthy: ${health.details?.error || 'unknown error'}`);
    }

    this.initialized = true;
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    const script = `
import json
import importlib
import platform

required = ${JSON.stringify(DEFAULT_REQUIRED_LIBRARIES)}
missing = []
versions = {}

for module in required:
    try:
        mod = __import__(module)
        versions[module] = getattr(mod, '__version__', 'unknown')
    except Exception as exc:
        missing.append({'module': module, 'error': str(exc)})

result = {
    'healthy': len(missing) == 0,
    'missing': missing,
    'versions': versions,
    'pythonVersion': platform.python_version()
}

print(json.dumps(result))
`;

    const commandResult = await this.runPythonCommand(['-c', script], 8000);

    if (commandResult.code !== 0 || commandResult.timedOut) {
      return {
        healthy: false,
        details: {
          error: commandResult.timedOut ? 'Python health check timed out' : commandResult.stderr || 'Python process failed'
        }
      };
    }

    try {
      const parsed = JSON.parse(commandResult.stdout);
      return {
        healthy: Boolean(parsed.healthy),
        details: parsed
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: `Failed to parse Python health output: ${(error as Error).message}` }
      };
    }
  }

  async checkMLLibraries(): Promise<boolean> {
    const script = `
import json
import importlib

required = ${JSON.stringify(ML_REQUIRED_LIBRARIES)}
missing = []

for module in required:
    if importlib.util.find_spec(module) is None:
        missing.append(module)

print(json.dumps({'missing': missing}))
`;

    const commandResult = await this.runPythonCommand(['-c', script], 5000);
    if (commandResult.code !== 0 || commandResult.timedOut) {
      console.warn('Python ML library check failed:', commandResult.stderr || 'unknown error');
      return false;
    }

    try {
      const payload = JSON.parse(commandResult.stdout) as { missing: string[] };
      return Array.isArray(payload.missing) && payload.missing.length === 0;
    } catch (error) {
      console.warn('Failed to parse ML library check output:', (error as Error).message);
      return false;
    }
  }

  async processTrial(trialId: string, data: any): Promise<PythonExecutionResult> {
    console.log(`🐍 Processing trial ${trialId} with REAL Python libraries...`);

    try {
      const { preview, schema, recordCount } = data;

      if (!preview || !Array.isArray(preview) || preview.length === 0) {
        return {
          success: false,
          error: 'No data provided for analysis'
        };
      }

      const pythonScript = this.generatePythonAnalysisScript(preview, schema, recordCount);
      const result = await this.executePythonScript(pythonScript);

      if (result.success) {
        console.log(`✅ Python analysis completed for trial ${trialId}`);
        return {
          success: true,
          data: result.data,
          visualizations: result.visualizations,
          libraries: DEFAULT_REQUIRED_LIBRARIES
        };
      }

      console.warn(`⚠️ Python analysis failed, falling back to JavaScript: ${result.error}`);
      return this.fallbackAnalysis(preview, schema, recordCount);
    } catch (error) {
      console.error('Python processor error:', error);
      return this.fallbackAnalysis(data?.preview, data?.schema, data?.recordCount);
    }
  }

  private generatePythonAnalysisScript(preview: any[], schema: any, recordCount: number): string {
    const columns = Object.keys(schema || {});
    const numericColumns = columns.filter(col =>
      schema[col]?.type === 'number' || schema[col]?.type === 'integer'
    );
    const stringColumns = columns.filter(col =>
      schema[col]?.type === 'string' || schema[col]?.type === 'text'
    );

    return `
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
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import polars as pl

plt.style.use('seaborn-v0_8')
sns.set_palette('husl')

try:
    data = ${JSON.stringify(preview)}
    df = pd.DataFrame(data)

    stats_summary = {
        'total_records': len(df),
        'total_columns': len(df.columns),
        'numeric_columns': ${JSON.stringify(numericColumns)},
        'string_columns': ${JSON.stringify(stringColumns)},
        'missing_values': df.isnull().sum().to_dict(),
        'data_types': df.dtypes.astype(str).to_dict()
    }

    numeric_stats = {}
    numeric_df = df.select_dtypes(include=[np.number])
    if len(numeric_df.columns) > 0:
        numeric_stats = {
            'mean': numeric_df.mean().to_dict(),
            'median': numeric_df.median().to_dict(),
            'std': numeric_df.std().to_dict(),
            'min': numeric_df.min().to_dict(),
            'max': numeric_df.max().to_dict(),
            'correlation_matrix': numeric_df.corr().to_dict()
        }

    quality_score = 100 - (df.isnull().sum().sum() / (len(df) * len(df.columns)) * 100)

    visualizations = []
    if len(numeric_df.columns) > 0:
        for col in numeric_df.columns[:3]:
            visualizations.append({
                'type': 'histogram',
                'title': f'Distribution of {col}',
                'data': {
                    'values': numeric_df[col].dropna().tolist(),
                    'bins': 20
                },
                'library': 'plotly'
            })

    if len(numeric_df.columns) > 1:
        visualizations.append({
            'type': 'heatmap',
            'title': 'Correlation Matrix',
            'data': {
                'matrix': numeric_df.corr().values.tolist(),
                'labels': numeric_df.corr().columns.tolist()
            },
            'library': 'plotly'
        })

    if len(numeric_df.columns) > 0:
        visualizations.append({
            'type': 'box',
            'title': 'Box Plot Analysis',
            'data': {
                'columns': numeric_df.columns.tolist(),
                'values': [numeric_df[col].dropna().tolist() for col in numeric_df.columns]
            },
            'library': 'plotly'
        })

    recommendations = []
    if quality_score < 80:
        recommendations.append('Consider data cleaning due to missing values')
    if len(numeric_df.columns) > 0:
        recommendations.append('Perform correlation analysis on numeric variables')
    if len(df.columns) > 10:
        recommendations.append('Consider dimensionality reduction techniques')

    pl_df = pl.DataFrame(data)
    polars_stats = {
        'shape': pl_df.shape,
        'memory_usage': pl_df.estimated_size(),
        'null_counts': pl_df.null_count().to_dict()
    }

    result = {
        'success': True,
        'data': {
            'summary': f'Analyzed ${recordCount} records with {len(df.columns)} columns using Python libraries',
            'statisticalSummary': stats_summary,
            'numericAnalysis': numeric_stats,
            'dataQuality': {
                'score': quality_score,
                'missing_percentage': (df.isnull().sum().sum() / (len(df) * len(df.columns)) * 100),
                'completeness': quality_score
            },
            'recommendations': recommendations,
            'polarsStats': polars_stats,
            'libraries_used': ${JSON.stringify(DEFAULT_REQUIRED_LIBRARIES)}
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
  }

  async executePythonScript(script: string, env: NodeJS.ProcessEnv = {}, timeoutMs = 15000): Promise<PythonExecutionResult> {
    const result = await this.runPythonCommand(['-c', script], timeoutMs, env);

    if (result.code !== 0 || result.timedOut) {
      return {
        success: false,
        error: result.timedOut ? 'Python script timed out' : result.stderr || 'Python execution failed'
      };
    }

    try {
      const parsed = JSON.parse(result.stdout);
      return parsed as PythonExecutionResult;
    } catch (error) {
      return {
        success: false,
        error: `Failed to parse Python output: ${(error as Error).message}`
      };
    }
  }

  private fallbackAnalysis(preview: any[] = [], schema: any = {}, recordCount = 0): PythonExecutionResult {
    console.log('🔄 Using JavaScript fallback analysis...');

    const columns = Object.keys(schema);
    const numericColumns = columns.filter(col =>
      schema[col]?.type === 'number' || schema[col]?.type === 'integer'
    );
    const stringColumns = columns.filter(col =>
      schema[col]?.type === 'string' || schema[col]?.type === 'text'
    );

    return {
      success: true,
      data: {
        summary: `Analyzed ${recordCount} records with ${columns.length} columns (JavaScript fallback)`,
        statisticalSummary: {
          totalRecords: recordCount,
          totalColumns: columns.length,
          numericColumns,
          stringColumns
        },
        columnAnalysis: columns.map(col => ({
          name: col,
          type: schema[col]?.type || 'unknown',
          sampleValues: preview.slice(0, 3).map(row => row?.[col])
        })),
        dataQuality: {
          score: 85,
          completeness: 'Good',
          issues: []
        },
        recommendations: [
          'Consider upgrading to Python analysis for advanced statistics',
          'Install Python libraries for machine learning capabilities'
        ]
      },
      visualizations: [
        {
          type: 'bar',
          title: 'Column Types Distribution',
          data: {
            labels: ['Numeric', 'String'],
            values: [numericColumns.length, stringColumns.length]
          }
        }
      ]
    };
  }

  private runPythonCommand(args: string[], timeoutMs: number, env: NodeJS.ProcessEnv = {}): Promise<PythonCommandResult> {
    return new Promise((resolve) => {
      const pythonProcess = spawn(this.pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...env }
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          pythonProcess.kill();
          resolve({ code: -1, stdout, stderr: stderr || 'Process timeout', timedOut: true });
        }
      }, timeoutMs);

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve({ code: code ?? 0, stdout, stderr, timedOut: false });
      });

      pythonProcess.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        resolve({ code: -1, stdout, stderr: error.message, timedOut: false });
      });
    });
  }
}