# Mock Data Fixes - Step-by-Step Guide

**Last Updated**: January 2025
**Priority**: 🔴 **CRITICAL** - Blocking Production Deployment
**Estimated Effort**: 3-4 weeks

---

## Problem Summary

Users are seeing mock/simulated analysis results because the Technical AI Agent and Spark processor use placeholder implementations instead of real statistical/ML computation.

### User-Facing Impact

- Users receive randomized ML model performance metrics
- Analysis results contain "mock" or "simulated" in metadata but users don't see warnings
- Statistical analyses show synthetic distributions and correlations
- Platform credibility is at risk
- Potential legal liability for decisions made on fake data

### Root Cause

Development scaffolding was never replaced with production implementations:
- Python bridge exists but `processQuery()` bypasses it for non-Spark queries
- All ML model training uses simulated metrics
- Feature importance calculated with `Math.random()`
- No validation to prevent mock mode in production

---

## Quick Assessment

### How to Check if You're Serving Mock Data

Run this search to find all mock data generation:

```bash
# Windows (PowerShell)
findstr /s /i /c:"mock" /c:"Mock" /c:"simulate" /c:"Math.random()" server\services\*.ts

# Linux/Mac
grep -r "mock\|Mock\|simulate\|Math.random()" server/services/ --include="*.ts"
```

### Key Files Needing Replacement

1. **`server/services/technical-ai-agent.ts`**
   - Lines 97-107: Mock query results
   - Lines 275-678: Simulated ML methods

2. **`server/services/spark-processor.ts`**
   - Lines 194-306: Mock fallback behavior
   - Lines 397-405: Mock Spark responses

3. **Any services returning `{ mock: true }` flags**

---

## Step 1: Identify All Mock Code Locations

### Search Pattern

```bash
# Find all files with mock implementations
find server/services -name "*.ts" -exec grep -l "mock\|simulate" {} \;

# Find Math.random() usage (often indicates simulated data)
grep -rn "Math.random()" server/services/

# Find simulated metrics
grep -rn "simulate.*Metrics\|mock.*Result" server/services/
```

### Expected Results

You should find:

#### In `technical-ai-agent.ts`:
- `processQuery()` method (lines 97-107)
- `simulateClassificationMetrics()` (lines 582-589)
- `simulateRegressionMetrics()` (lines 591-598)
- `simulateClusteringMetrics()` (lines 600-606)
- `calculateFeatureImportance()` with Math.random() (line 613)
- `performCrossValidation()` with synthetic results (lines 619-634)

#### In `spark-processor.ts`:
- `shouldUseMock()` method (lines 111-132)
- `generateMockData()` method (lines 194-227)
- `mockSparkJob()` method (lines 244-282)
- `mockMLTraining()` method (lines 296-306)

---

## Step 2: Implement Real Python Bridge for Statistical Analysis

### Current (Mock) Implementation

**Location**: `server/services/technical-ai-agent.ts:97-107`

```typescript
// REMOVE THIS:
async processQuery(query: TechnicalQueryType): Promise<any> {
  // Mock processing delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return {
    success: true,
    result: `This is a mock result for a '${query.type}' analysis.`, // ❌ MOCK!
    engine: 'in-memory',
    model: "chimari-analyzer-v1",
    tokensUsed: recordCount * 2,
    cost: cost.totalCost,
  };
}
```

### Replacement Implementation

**New Code**:

```typescript
// server/services/technical-ai-agent.ts
import { PythonProcessor } from './python-processor';
import { AdvancedAnalyzer } from './advanced-analyzer';

async processQuery(query: TechnicalQueryType): Promise<any> {
  // Determine if we need Python or can use in-memory processing
  const recordCount = query.context?.data?.length ?? 0;

  try {
    let result;

    // Route based on analysis type
    switch (query.type) {
      case 'statistical_analysis':
      case 'correlation':
      case 'regression':
        // Use real Python statistical libraries
        const pythonProcessor = new PythonProcessor();
        result = await pythonProcessor.executeAnalysis({
          type: query.type,
          data: query.context?.data ?? [],
          parameters: query.parameters
        });
        break;

      case 'ml_training':
      case 'prediction':
        // Use real ML libraries
        const mlResult = await this.trainMLModel(query.context?.data, query.parameters);
        result = {
          output: mlResult,
          metrics: {
            duration: mlResult.trainingTime,
            dataPoints: recordCount
          }
        };
        break;

      default:
        // Fallback to advanced analyzer for other types
        const analyzer = new AdvancedAnalyzer();
        result = await analyzer.performStepByStepAnalysis(
          query.context?.data ?? [],
          query.parameters
        );
    }

    return {
      success: true,
      result: result.output,
      engine: 'python-statsmodels',
      model: "chimari-analyzer-v1",
      metrics: result.metrics,
      cost: this.calculateCost(query, recordCount),
      // ✅ NO MOCK FLAG
    };
  } catch (error) {
    console.error('Query processing failed:', error);

    // ✅ Fail loudly, don't fall back to mock data
    throw new Error(`Analysis failed: ${error.message}. Please ensure Python environment is configured.`);
  }
}
```

### Python Processor Implementation

**Location**: `server/services/python-processor.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';

export class PythonProcessor {
  private pythonPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
  }

  /**
   * Execute statistical analysis using Python
   */
  async executeAnalysis(params: {
    type: string;
    data: any[];
    parameters: any;
  }): Promise<{ output: any; metrics: any }> {
    const scriptPath = this.getScriptPath(params.type);

    // Prepare input for Python script
    const input = JSON.stringify({
      data: params.data,
      parameters: params.parameters
    });

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const python = spawn(this.pythonPath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        const duration = Date.now() - startTime;

        if (code !== 0) {
          return reject(new Error(`Python script failed: ${stderr}`));
        }

        try {
          const output = JSON.parse(stdout);

          // ✅ Verify output contains real data
          if (output.mock || output.simulated) {
            return reject(new Error('Python script returned mock data'));
          }

          resolve({
            output,
            metrics: {
              duration,
              dataPoints: params.data.length
            }
          });
        } catch (error) {
          reject(new Error(`Failed to parse Python output: ${error.message}`));
        }
      });

      // Send input to Python script
      python.stdin.write(input);
      python.stdin.end();
    });
  }

  /**
   * Get the appropriate Python script for analysis type
   */
  private getScriptPath(analysisType: string): string {
    const scripts: Record<string, string> = {
      'statistical_analysis': 'statistical_tests.py',
      'correlation': 'correlation_analysis.py',
      'regression': 'regression_analysis.py',
      'classification': 'classification_analysis.py',
      'clustering': 'clustering_analysis.py'
    };

    const scriptName = scripts[analysisType];
    if (!scriptName) {
      throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    return path.join(process.cwd(), 'python', scriptName);
  }

  /**
   * Health check - verify Python and required libraries
   */
  async healthCheck(): Promise<{ available: boolean; libraries: string[] }> {
    return new Promise((resolve) => {
      const python = spawn(this.pythonPath, ['-c', `
import sys
import json

libs = {}
for lib in ['pandas', 'numpy', 'scipy', 'sklearn', 'statsmodels']:
    try:
        __import__(lib)
        libs[lib] = True
    except ImportError:
        libs[lib] = False

print(json.dumps(libs))
`]);

      let output = '';
      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          resolve({ available: false, libraries: [] });
          return;
        }

        try {
          const libs = JSON.parse(output);
          const available = Object.values(libs).every(v => v === true);
          resolve({
            available,
            libraries: Object.entries(libs)
              .filter(([_, avail]) => avail)
              .map(([name, _]) => name)
          });
        } catch {
          resolve({ available: false, libraries: [] });
        }
      });
    });
  }
}
```

---

## Step 3: Replace Simulated ML Methods with Real Implementations

### Methods to Remove

Delete these methods entirely from `server/services/technical-ai-agent.ts`:

1. **`simulateClassificationMetrics()`** (lines 582-589)
2. **`simulateRegressionMetrics()`** (lines 591-598)
3. **`simulateClusteringMetrics()`** (lines 600-606)
4. **`calculateFeatureImportance()`** with `Math.random()` (line 613)
5. **`performCrossValidation()`** with synthetic results (lines 619-634)

### Replacement Implementation

```typescript
// server/services/technical-ai-agent.ts

import { PythonProcessor } from './python-processor';

/**
 * Train ML model using real scikit-learn via Python bridge
 */
async trainMLModel(data: any[], metadata: any): Promise<any> {
  const pythonProcessor = new PythonProcessor();

  // Prepare features and target
  const { features, target } = this.prepareMLData(data, metadata);

  // Use real scikit-learn model training
  const result = await pythonProcessor.trainMLModel({
    features,
    target,
    modelType: metadata.modelType || 'auto',
    crossValidation: {
      folds: 5,
      stratified: metadata.stratified ?? true
    },
    hyperparameterTuning: metadata.tuneHyperparameters ?? false
  });

  // ✅ Return REAL metrics from actual model training
  return {
    type: result.modelType,
    performance: result.performance,  // Real metrics from sklearn
    parameters: result.hyperparameters,
    predictions: result.predictions,
    featureImportance: result.featureImportance,  // From actual model
    crossValidation: result.cvResults,  // Real CV scores
    trainingTime: result.trainingTime,
    // ✅ NO simulated/mock data
  };
}

/**
 * Prepare data for ML model training
 */
private prepareMLData(data: any[], metadata: any): { features: any[][]; target: any[] } {
  const targetColumn = metadata.targetColumn || this.detectTargetColumn(data);

  const features = data.map(row => {
    const featureRow = { ...row };
    delete featureRow[targetColumn];
    return Object.values(featureRow);
  });

  const target = data.map(row => row[targetColumn]);

  return { features, target };
}

/**
 * Auto-detect target column for ML
 */
private detectTargetColumn(data: any[]): string {
  // Simple heuristic: last column, or column named 'target', 'label', 'y'
  if (data.length === 0) {
    throw new Error('Cannot detect target column from empty dataset');
  }

  const columns = Object.keys(data[0]);

  // Check for common target column names
  const commonNames = ['target', 'label', 'y', 'class', 'output'];
  for (const name of commonNames) {
    if (columns.includes(name)) {
      return name;
    }
  }

  // Default to last column
  return columns[columns.length - 1];
}
```

### Python ML Training Script

**Location**: `python/ml_training.py`

```python
import sys
import json
import numpy as np
from sklearn.model_selection import cross_val_score, GridSearchCV, StratifiedKFold
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.metrics import accuracy_score, f1_score, r2_score, mean_squared_error
from sklearn.preprocessing import StandardScaler
import pandas as pd

def train_model(config):
    """Train ML model with real scikit-learn"""
    features = np.array(config['features'])
    target = np.array(config['target'])

    # Determine problem type
    is_classification = config.get('modelType') == 'classification' or len(np.unique(target)) < 20

    # Standardize features
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features)

    # Select model
    if is_classification:
        if config.get('hyperparameterTuning'):
            model = GridSearchCV(
                RandomForestClassifier(random_state=42),
                param_grid={
                    'n_estimators': [50, 100, 200],
                    'max_depth': [5, 10, None]
                },
                cv=5
            )
        else:
            model = RandomForestClassifier(n_estimators=100, random_state=42)
    else:
        if config.get('hyperparameterTuning'):
            model = GridSearchCV(
                RandomForestRegressor(random_state=42),
                param_grid={
                    'n_estimators': [50, 100, 200],
                    'max_depth': [5, 10, None]
                },
                cv=5
            )
        else:
            model = RandomForestRegressor(n_estimators=100, random_state=42)

    # Train model
    import time
    start_time = time.time()
    model.fit(features_scaled, target)
    training_time = time.time() - start_time

    # Make predictions
    predictions = model.predict(features_scaled)

    # Calculate performance metrics
    if is_classification:
        accuracy = accuracy_score(target, predictions)
        f1 = f1_score(target, predictions, average='weighted')
        performance = {
            'accuracy': float(accuracy),
            'f1Score': float(f1),
            'confusionMatrix': confusion_matrix(target, predictions).tolist()
        }
    else:
        r2 = r2_score(target, predictions)
        mse = mean_squared_error(target, predictions)
        rmse = np.sqrt(mse)
        performance = {
            'r2': float(r2),
            'mse': float(mse),
            'rmse': float(rmse)
        }

    # Feature importance
    if hasattr(model, 'feature_importances_'):
        feature_importance = model.feature_importances_.tolist()
    elif hasattr(model, 'best_estimator_'):
        feature_importance = model.best_estimator_.feature_importances_.tolist()
    else:
        feature_importance = [0] * features.shape[1]

    # Cross-validation
    cv_folds = config.get('crossValidation', {}).get('folds', 5)
    if is_classification:
        cv_scores = cross_val_score(model, features_scaled, target, cv=cv_folds, scoring='f1_weighted')
    else:
        cv_scores = cross_val_score(model, features_scaled, target, cv=cv_folds, scoring='r2')

    # Return results
    return {
        'modelType': 'classification' if is_classification else 'regression',
        'performance': performance,
        'hyperparameters': model.get_params() if hasattr(model, 'get_params') else {},
        'predictions': predictions.tolist(),
        'featureImportance': feature_importance,
        'cvResults': {
            'scores': cv_scores.tolist(),
            'mean': float(np.mean(cv_scores)),
            'std': float(np.std(cv_scores))
        },
        'trainingTime': training_time
    }

if __name__ == '__main__':
    # Read input from stdin
    input_data = sys.stdin.read()
    config = json.loads(input_data)

    # Train model
    result = train_model(config)

    # Output results as JSON
    print(json.dumps(result))
```

---

## Step 4: Add Production Mode Validation

### Startup Validation

**Location**: `server/index.ts` (after imports, before app initialization)

```typescript
// server/index.ts
import { validateProductionReadiness } from './services/production-validator';

async function startServer() {
  // Validate critical services before starting
  if (process.env.NODE_ENV === 'production') {
    console.log('🔍 Validating production readiness...');

    const validation = await validateProductionReadiness();

    if (!validation.ready) {
      console.error('🔴 PRODUCTION VALIDATION FAILED:');
      validation.failures.forEach(f => console.error(`  ❌ ${f}`));
      console.error('\n💡 See MOCK-DATA-FIXES.md for resolution steps');
      process.exit(1);  // Fail fast - don't serve mock data
    }

    console.log('✅ Production validation passed');
    console.log(`  ✓ Python available: ${validation.pythonVersion}`);
    console.log(`  ✓ ML libraries: ${validation.libraries.join(', ')}`);
    console.log(`  ✓ Spark available: ${validation.sparkAvailable ? 'Yes' : 'No'}`);
  }

  // Rest of server initialization...
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

### Production Validator Implementation

**Location**: `server/services/production-validator.ts` (NEW FILE)

```typescript
import { PythonProcessor } from './python-processor';
import { SparkProcessor } from './spark-processor';

export interface ProductionValidation {
  ready: boolean;
  failures: string[];
  pythonVersion?: string;
  libraries: string[];
  sparkAvailable: boolean;
}

export async function validateProductionReadiness(): Promise<ProductionValidation> {
  const failures: string[] = [];
  let pythonVersion: string | undefined;
  let libraries: string[] = [];
  let sparkAvailable = false;

  // Check Python availability
  const pythonProcessor = new PythonProcessor();
  const pythonHealth = await pythonProcessor.healthCheck();

  if (!pythonHealth.available) {
    failures.push('Python bridge not available - analysis will fail');
  } else {
    libraries = pythonHealth.libraries;
    pythonVersion = pythonHealth.version || 'unknown';

    // Verify required libraries
    const requiredLibs = ['pandas', 'numpy', 'scipy', 'sklearn', 'statsmodels'];
    const missingLibs = requiredLibs.filter(lib => !libraries.includes(lib));

    if (missingLibs.length > 0) {
      failures.push(`Missing required Python libraries: ${missingLibs.join(', ')}`);
    }
  }

  // Check Spark for large dataset processing (optional but recommended)
  try {
    const sparkProcessor = new SparkProcessor();
    const sparkHealth = await sparkProcessor.healthCheck();
    sparkAvailable = sparkHealth.available;

    if (!sparkAvailable) {
      // Spark is optional, but warn
      console.warn('⚠️  Spark cluster not available - large datasets cannot be processed');
    }
  } catch (error) {
    console.warn('⚠️  Could not check Spark availability:', error.message);
  }

  // Check for mock mode environment variables
  if (process.env.FORCE_SPARK_MOCK === 'true') {
    failures.push('FORCE_SPARK_MOCK is enabled - mock data will be returned');
  }

  if (process.env.ENABLE_MOCK_ANALYSIS === 'true') {
    failures.push('ENABLE_MOCK_ANALYSIS is enabled - mock data will be returned');
  }

  return {
    ready: failures.length === 0,
    failures,
    pythonVersion,
    libraries,
    sparkAvailable
  };
}

/**
 * Check for mock implementations in codebase
 */
export async function scanForMockImplementations(): Promise<string[]> {
  const mockPatterns = [
    /simulate.*Metrics/,
    /Math\.random\(\)/,
    /mock:\s*true/,
    /This is a mock result/
  ];

  // Scan critical files
  const filesToScan = [
    'server/services/technical-ai-agent.ts',
    'server/services/spark-processor.ts',
    'server/services/ml-service.ts'
  ];

  const mockLocations: string[] = [];

  // TODO: Implement file scanning
  // This is a placeholder - actual implementation would scan files

  return mockLocations;
}
```

---

## Step 5: Add User-Visible Service Health Indicators

### Service Health Banner Component

**Location**: `client/src/components/ServiceHealthBanner.tsx` (NEW FILE)

```typescript
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ServiceHealth {
  allServicesOperational: boolean;
  pythonAvailable: boolean;
  sparkAvailable: boolean;
  mlModelsAvailable: boolean;
  usingMockData: boolean;
  degradedServices: string[];
}

export function ServiceHealthBanner() {
  const { data: health, isLoading } = useQuery<ServiceHealth>({
    queryKey: ['service-health'],
    queryFn: () => fetch('/api/system/health').then(r => r.json()),
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  if (isLoading || !health) return null;

  // Don't show banner if everything is operational
  if (health.allServicesOperational) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex">
        <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3" />
        <div className="flex-1">
          <p className="text-sm font-medium text-yellow-800">
            Some analysis features are currently degraded
          </p>
          <ul className="mt-2 text-sm text-yellow-700 space-y-1">
            {!health.pythonAvailable && (
              <li className="flex items-center">
                <XCircle className="h-4 w-4 mr-2" />
                Statistical analysis temporarily unavailable
              </li>
            )}
            {!health.mlModelsAvailable && (
              <li className="flex items-center">
                <XCircle className="h-4 w-4 mr-2" />
                Machine learning features temporarily unavailable
              </li>
            )}
            {!health.sparkAvailable && (
              <li className="flex items-center">
                <AlertTriangle className="h-4 w-4 mr-2" />
                Large dataset processing may be slower
              </li>
            )}
            {health.usingMockData && (
              <li className="flex items-center font-bold">
                <XCircle className="h-4 w-4 mr-2" />
                ⚠️ Analysis results may be simulated - do not use for production decisions
              </li>
            )}
          </ul>

          {/* Service status grid */}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <ServiceStatus
              name="Python Bridge"
              available={health.pythonAvailable}
            />
            <ServiceStatus
              name="ML Models"
              available={health.mlModelsAvailable}
            />
            <ServiceStatus
              name="Spark Cluster"
              available={health.sparkAvailable}
            />
            <ServiceStatus
              name="Real Analysis"
              available={!health.usingMockData}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceStatus({ name, available }: { name: string; available: boolean }) {
  return (
    <div className="flex items-center space-x-2">
      {available ? (
        <CheckCircle className="h-3 w-3 text-green-600" />
      ) : (
        <XCircle className="h-3 w-3 text-red-600" />
      )}
      <span className={available ? 'text-green-800' : 'text-red-800'}>
        {name}
      </span>
    </div>
  );
}
```

### Health Endpoint Implementation

**Location**: `server/routes/system.ts` (NEW FILE)

```typescript
import { Router } from 'express';
import { PythonProcessor } from '../services/python-processor';
import { SparkProcessor } from '../services/spark-processor';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    const pythonProcessor = new PythonProcessor();
    const sparkProcessor = new SparkProcessor();

    // Check Python availability
    const pythonHealth = await pythonProcessor.healthCheck();

    // Check Spark availability
    let sparkHealth;
    try {
      sparkHealth = await sparkProcessor.healthCheck();
    } catch {
      sparkHealth = { available: false };
    }

    // Check for mock mode
    const usingMockData =
      sparkProcessor.shouldUseMock() ||
      process.env.ENABLE_MOCK_ANALYSIS === 'true' ||
      !pythonHealth.available;

    const health = {
      allServicesOperational:
        pythonHealth.available &&
        pythonHealth.libraries.length >= 5 &&
        !usingMockData,
      pythonAvailable: pythonHealth.available,
      sparkAvailable: sparkHealth.available,
      mlModelsAvailable: pythonHealth.libraries.includes('sklearn'),
      usingMockData,
      degradedServices: [] as string[],
      timestamp: new Date().toISOString()
    };

    // List degraded services
    if (!pythonHealth.available) {
      health.degradedServices.push('Python Bridge');
    }
    if (!sparkHealth.available) {
      health.degradedServices.push('Spark Cluster');
    }
    if (usingMockData) {
      health.degradedServices.push('Real Analysis (using mocks)');
    }

    // Return 503 if critical services down, 200 if degraded but functional
    const statusCode = pythonHealth.available ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      allServicesOperational: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
```

### Integrate Health Banner into Main Layout

**Location**: `client/src/App.tsx`

```typescript
import { ServiceHealthBanner } from './components/ServiceHealthBanner';

function App() {
  return (
    <div className="app">
      {/* Add health banner at top of app */}
      <ServiceHealthBanner />

      {/* Rest of app */}
      <Routes>
        {/* ... */}
      </Routes>
    </div>
  );
}
```

---

## Step 6: Testing Real Data Flow

### Integration Test

**Location**: `tests/integration/real-analysis.spec.ts` (NEW FILE)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Real Analysis Data Flow', () => {
  test('Analysis returns real data not mocks', async ({ request }) => {
    // Upload test dataset
    const response = await request.post('/api/analysis/regression', {
      data: {
        type: 'regression',
        data: generateRealDataset(),
        parameters: { targetColumn: 'price' }
      }
    });

    const result = await response.json();

    // Verify no mock indicators
    expect(result.mock).toBeUndefined();
    expect(result.simulated).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('mock');
    expect(JSON.stringify(result)).not.toContain('simulated');

    // Verify real metrics (not random)
    const r2 = result.performance.r2;
    expect(r2).toBeGreaterThan(0);
    expect(r2).toBeLessThanOrEqual(1);

    // Run twice - real analysis should return consistent results
    const response2 = await request.post('/api/analysis/regression', {
      data: {
        type: 'regression',
        data: generateRealDataset(),  // Same dataset
        parameters: { targetColumn: 'price' }
      }
    });

    const result2 = await response2.json();

    // Real R² should be deterministic (same dataset, same model, same seed)
    expect(Math.abs(result.performance.r2 - result2.performance.r2)).toBeLessThan(0.01);
  });

  test('Service health endpoint reports real analysis', async ({ request }) => {
    const response = await request.get('/api/system/health');
    const health = await response.json();

    // Verify no mock data being used
    expect(health.usingMockData).toBe(false);
    expect(health.pythonAvailable).toBe(true);
    expect(health.mlModelsAvailable).toBe(true);
  });

  test('Analysis fails gracefully when Python unavailable', async ({ page }) => {
    // TODO: Mock Python being unavailable
    // Verify error message shown to user
    // Verify NO mock data is returned
  });
});

function generateRealDataset() {
  // Generate deterministic test dataset
  const data = [];
  for (let i = 0; i < 100; i++) {
    data.push({
      squareFootage: 1000 + i * 10,
      bedrooms: 2 + (i % 3),
      bathrooms: 1 + (i % 2),
      price: 200000 + (1000 + i * 10) * 150 + Math.random() * 10000
    });
  }
  return data;
}
```

---

## Step 7: Deployment Checklist

### Pre-Deployment Verification

Before deploying fixes:

- [ ] **All `simulate*` methods removed** from `technical-ai-agent.ts`
  ```bash
  grep -n "simulate.*Metrics" server/services/technical-ai-agent.ts
  # Should return no results
  ```

- [ ] **Python bridge integrated** for all analysis types
  ```bash
  grep -n "PythonProcessor" server/services/technical-ai-agent.ts
  # Should show multiple integration points
  ```

- [ ] **Production validator** added to server startup
  ```bash
  grep -n "validateProductionReadiness" server/index.ts
  # Should show startup integration
  ```

- [ ] **Service health endpoint** implemented
  ```bash
  curl http://localhost:3000/api/system/health
  # Should return health status
  ```

- [ ] **User-facing health banner** added to UI
  ```bash
  grep -n "ServiceHealthBanner" client/src/App.tsx
  # Should show component usage
  ```

- [ ] **Integration tests** verify real data flow (no mocks)
  ```bash
  npm run test:integration
  # All tests should pass
  ```

- [ ] **No Math.random()** in analysis code
  ```bash
  grep -rn "Math.random()" server/services/ | grep -v "test"
  # Should return no results in analysis services
  ```

- [ ] **Environment variables** documented
  - `PYTHON_PATH` - Path to Python executable
  - `SPARK_MASTER_URL` - Spark cluster URL (optional)
  - No `FORCE_SPARK_MOCK` or `ENABLE_MOCK_ANALYSIS`

- [ ] **Rollback plan** documented
  - Database backups taken
  - Previous version deployable
  - Monitoring alerts configured

### Python Environment Setup

Ensure production environment has Python with required libraries:

```bash
# Install Python dependencies
pip install pandas numpy scipy scikit-learn statsmodels matplotlib plotly

# Verify installation
python3 -c "import pandas, numpy, scipy, sklearn, statsmodels; print('All libraries installed')"
```

### Post-Deployment Monitoring

Monitor these metrics for 48 hours:

1. **Error rates** in analysis endpoints
   - Target: <0.1% errors

2. **Response times** for analysis requests
   - Target: <10 seconds for typical datasets

3. **User reports** of mock data
   - Target: Zero reports

4. **Service health** endpoint status
   - Target: 99.9% uptime, all services operational

---

## Rollback Procedure

If issues are discovered post-deployment:

### Immediate Rollback (< 5 minutes)

```bash
# Revert to previous version
git revert <commit-hash>
git push origin main

# Or use deployment platform rollback
# e.g., Heroku: heroku releases:rollback
```

### Temporary Mock Mode (Emergency)

If you must enable mock mode temporarily:

1. **Set environment variable**:
   ```bash
   ENABLE_MOCK_ANALYSIS=true
   ```

2. **Add clear warning to UI**:
   ```typescript
   // client/src/App.tsx
   {process.env.VITE_MOCK_MODE && (
     <div className="bg-red-600 text-white p-4 text-center font-bold">
       ⚠️ MOCK MODE ACTIVE - DO NOT USE FOR PRODUCTION DECISIONS ⚠️
     </div>
   )}
   ```

3. **Communicate to users**:
   - Email notification
   - In-app banner
   - Status page update

### Long-Term Fix

1. **Identify root cause** of failure
2. **Fix issue** in development environment
3. **Test thoroughly** with real data
4. **Re-deploy** with fixes
5. **Monitor closely**

---

## Success Criteria

You've successfully replaced mock data when:

✅ **Code Search Shows**:
- No `simulate*Metrics` methods exist
- No `Math.random()` in analysis code
- No `mock: true` flags in responses

✅ **Tests Pass**:
- Integration tests verify real analysis
- E2E tests show deterministic results
- Load tests confirm performance

✅ **Health Checks Pass**:
- `/api/system/health` reports all services operational
- No `usingMockData: true` in responses
- Python and libraries available

✅ **User Experience**:
- No user reports of fake data
- Analysis results are consistent and reproducible
- Service health banner shows all green

---

**Last Updated**: January 2025
**Owner**: Engineering Team
**Priority**: 🔴 **CRITICAL** - Blocking Production
