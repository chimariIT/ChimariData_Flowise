/**
 * Python Integration Health Check Tests
 *
 * Verifies that Python environment is properly configured for real analysis.
 * This test MUST pass before any data analysis can be performed.
 */

import { test, expect } from '@playwright/test';

test.describe('Python Integration Health Checks', () => {

  test('Python health check endpoint returns success', async ({ request }) => {
    const response = await request.get('/api/system/python-health', {
      timeout: 15000 // Python cold start can take 8+ seconds
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log('Python Health Check:', data);

    expect(data.healthy).toBe(true);
    expect(data.details).toBeDefined();
    expect(data.details.pythonVersion).toBeDefined();
    expect(data.details.isInitialized).toBe(true);
  });

  test('Python has required libraries installed', async ({ request }) => {
    const response = await request.get('/api/system/python-health', {
      timeout: 15000
    });
    const data = await response.json();

    const requiredLibraries = ['pandas', 'numpy', 'scikit-learn', 'scipy', 'statsmodels'];
    const availableLibraries = data.details.availableLibraries || [];

    for (const lib of requiredLibraries) {
      expect(
        availableLibraries.includes(lib),
        `Python library ${lib} should be available`
      ).toBe(true);
    }

    expect(data.details.missingLibraries.length).toBe(0);
  });

  test('Python can execute basic data analysis script', async ({ request }) => {
    // Simple test: calculate mean of array
    const response = await request.post('/api/system/python-execute', {
      timeout: 15000,
      data: {
        script: 'descriptive_stats',
        data: [1, 2, 3, 4, 5],
        operation: 'mean'
      }
    });

    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.result).toBeCloseTo(3.0, 1); // Mean of [1,2,3,4,5] is 3
  });

  test('Python can read and process CSV data', async ({ request }) => {
    // Test CSV processing capability
    const csvData = 'column1,column2\n1,2\n3,4\n5,6';

    const response = await request.post('/api/system/python-execute', {
      timeout: 15000,
      data: {
        script: 'descriptive_stats',
        csvData: csvData,
        operation: 'summary'
      }
    });

    expect(response.status()).toBe(200);

    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result.rowCount).toBe(3);
  });

  test('Python scripts directory exists and has required files', async ({ request }) => {
    const response = await request.get('/api/system/python-scripts', {
      timeout: 15000
    });

    expect(response.status()).toBe(200);

    const data = await response.json();
    const requiredScripts = [
      'descriptive_stats.py',
      'statistical_tests.py',
      'correlation_analysis.py',
      'regression_analysis.py',
      'classification_analysis.py',
      'clustering_analysis.py',
      'ml_training.py'
    ];

    for (const script of requiredScripts) {
      expect(
        data.scripts.includes(script),
        `Python script ${script} should exist`
      ).toBe(true);
    }
  });
});

test.describe('Python Error Handling', () => {

  test('Python execution handles errors gracefully', async ({ request }) => {
    const response = await request.post('/api/system/python-execute', {
      timeout: 15000,
      data: {
        script: 'invalid_script',
        data: []
      }
    });

    // Should return error response or success with error message, but not crash
    expect([200, 400, 500]).toContain(response.status());

    const result = await response.json();
    // Either success=false OR success=true with error/message field
    if (result.success === false) {
      expect(result.error).toBeDefined();
    } else {
      // Graceful fallback - may return success with message
      expect(result.result).toBeDefined();
    }
  });

  test('Python handles missing dependencies gracefully', async ({ request }) => {
    const response = await request.get('/api/system/python-health', {
      timeout: 15000
    });
    const data = await response.json();

    // Even if some libraries missing, should not crash
    expect(response.status()).toBe(200);
    expect(data.details).toBeDefined();

    // If libraries missing, healthy should be false
    if (data.details.missingLibraries && data.details.missingLibraries.length > 0) {
      console.warn('Missing Python libraries:', data.details.missingLibraries);
      expect(data.healthy).toBe(false);
    }
  });
});
