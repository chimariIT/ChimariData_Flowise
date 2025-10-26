/**
 * Real Data Analysis Verification Tests
 *
 * Verifies that analysis returns REAL results, not mock or simulated data.
 * This is a CRITICAL test for production readiness.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Real Data Analysis Verification', () => {

  // Sample test dataset
  const testCSVData = `
sales,region,date
100,North,2024-01-01
150,South,2024-01-02
200,North,2024-01-03
120,South,2024-01-04
180,North,2024-01-05
  `.trim();

  test.beforeAll(async () => {
    // Create test fixtures directory if needed
    const fixturesDir = path.join(__dirname, 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Write test CSV
    fs.writeFileSync(
      path.join(fixturesDir, 'test-sales.csv'),
      testCSVData
    );
  });

  test('Statistical analysis returns real statistics, not mock data', async ({ request }) => {
    // Upload dataset
    const uploadResponse = await request.post('/api/datasets/upload', {
      multipart: {
        file: {
          name: 'test-sales.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(testCSVData)
        }
      }
    });

    expect(uploadResponse.status()).toBe(200);
    const uploadData = await uploadResponse.json();
    const datasetId = uploadData.datasetId;

    // Execute descriptive statistics
    const analysisResponse = await request.post('/api/analysis/descriptive-stats', {
      data: {
        datasetId,
        columns: ['sales']
      }
    });

    expect(analysisResponse.status()).toBe(200);
    const analysisData = await analysisResponse.json();

    // CRITICAL: Verify no mock data markers
    const responseString = JSON.stringify(analysisData);
    expect(responseString.toLowerCase()).not.toContain('mock');
    expect(responseString.toLowerCase()).not.toContain('simulated');
    expect(responseString.toLowerCase()).not.toContain('placeholder');

    // Verify real statistics
    expect(analysisData.results).toBeDefined();
    expect(analysisData.results.mean).toBeDefined();
    expect(analysisData.results.mean).toBeCloseTo(150, 1); // Actual mean of sales data

    // Verify metadata indicates real analysis
    expect(analysisData.metadata).toBeDefined();
    expect(analysisData.metadata.engine).toBe('python');
    expect(analysisData.metadata.mock).toBe(false);
  });

  test('Correlation analysis returns deterministic results', async ({ request }) => {
    // Same input should always produce same output (deterministic)

    const correlationData = `
x,y
1,2
2,4
3,6
4,8
5,10
    `.trim();

    const uploadResponse = await request.post('/api/datasets/upload', {
      multipart: {
        file: {
          name: 'correlation-test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(correlationData)
        }
      }
    });

    const uploadData = await uploadResponse.json();
    const datasetId = uploadData.datasetId;

    // Run correlation analysis twice
    const analysis1 = await request.post('/api/analysis/correlation', {
      data: {
        datasetId,
        columns: ['x', 'y']
      }
    });

    const analysis2 = await request.post('/api/analysis/correlation', {
      data: {
        datasetId,
        columns: ['x', 'y']
      }
    });

    const result1 = await analysis1.json();
    const result2 = await analysis2.json();

    // Perfect correlation: r = 1.0
    expect(result1.results.correlation).toBeCloseTo(1.0, 2);
    expect(result2.results.correlation).toBeCloseTo(1.0, 2);

    // Results should be identical (deterministic)
    expect(result1.results.correlation).toBe(result2.results.correlation);
  });

  test('ML model training returns real performance metrics', async ({ request }) => {
    const trainingData = `
feature1,feature2,target
1,2,0
2,3,0
3,4,1
4,5,1
5,6,1
6,7,1
7,8,1
8,9,1
    `.trim();

    const uploadResponse = await request.post('/api/datasets/upload', {
      multipart: {
        file: {
          name: 'ml-training.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(trainingData)
        }
      }
    });

    const uploadData = await uploadResponse.json();
    const datasetId = uploadData.datasetId;

    // Train classification model
    const mlResponse = await request.post('/api/analysis/ml-train', {
      data: {
        datasetId,
        features: ['feature1', 'feature2'],
        target: 'target',
        modelType: 'classification',
        algorithm: 'logistic_regression'
      }
    });

    expect(mlResponse.status()).toBe(200);
    const mlData = await mlResponse.json();

    // Verify no mock indicators
    const responseString = JSON.stringify(mlData);
    expect(responseString.toLowerCase()).not.toContain('mock');
    expect(responseString.toLowerCase()).not.toContain('simulated');

    // Verify real metrics exist
    expect(mlData.results.accuracy).toBeDefined();
    expect(mlData.results.accuracy).toBeGreaterThan(0);
    expect(mlData.results.accuracy).toBeLessThanOrEqual(1);

    // Verify model artifact created
    expect(mlData.results.modelId).toBeDefined();
    expect(mlData.metadata.engine).toBe('python');
  });

  test('Technical AI agent uses tool registry, not mock data', async ({ request }) => {
    // Test that Technical AI agent routes through tool registry

    const queryResponse = await request.post('/api/ai/query', {
      data: {
        queryType: 'statistical_analysis',
        question: 'What is the average sales?',
        datasetId: 'test-dataset-id'
      }
    });

    const queryData = await queryResponse.json();

    // Verify tool registry was used
    expect(queryData.metadata).toBeDefined();
    expect(queryData.metadata.engine).toBe('tool-registry');
    expect(queryData.metadata.tool).toBe('statistical_analyzer');

    // Verify agent ID
    expect(queryData.metadata.agentId).toBe('technical_ai_agent');

    // Verify no mock data
    const responseString = JSON.stringify(queryData);
    expect(responseString.toLowerCase()).not.toContain('mock');
    expect(responseString.toLowerCase()).not.toContain('simulated');
  });

  test('Spark processor uses real mode in production', async ({ request }) => {
    const healthResponse = await request.get('/api/admin/system/status');
    const healthData = await healthResponse.json();

    // In production, Spark should NOT be in mock mode
    if (process.env.NODE_ENV === 'production') {
      expect(healthData.system.sparkMode).not.toBe('mock');
      expect(healthData.system.sparkMode).toBe('real');
    }
  });
});

test.describe('Analysis Result Quality Checks', () => {

  test('Results include proper statistical metadata', async ({ request }) => {
    const testData = 'value\n10\n20\n30\n40\n50';

    const uploadResponse = await request.post('/api/datasets/upload', {
      multipart: {
        file: {
          name: 'quality-check.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(testData)
        }
      }
    });

    const uploadData = await uploadResponse.json();
    const analysisResponse = await request.post('/api/analysis/descriptive-stats', {
      data: {
        datasetId: uploadData.datasetId,
        columns: ['value']
      }
    });

    const analysisData = await analysisResponse.json();

    // Verify complete statistical output
    expect(analysisData.results.mean).toBeCloseTo(30, 1);
    expect(analysisData.results.median).toBeCloseTo(30, 1);
    expect(analysisData.results.std).toBeDefined();
    expect(analysisData.results.min).toBe(10);
    expect(analysisData.results.max).toBe(50);
    expect(analysisData.results.count).toBe(5);

    // Verify proper metadata
    expect(analysisData.metadata.timestamp).toBeDefined();
    expect(analysisData.metadata.executionTime).toBeDefined();
    expect(analysisData.metadata.version).toBeDefined();
  });
});
