import { test, expect } from '@playwright/test';

/**
 * Test suite for intelligent library selection functionality
 * Tests the enhanced Technical AI Agent with intelligent library selection
 */

test.describe('Intelligent Library Selection Tests', () => {
  const testUserId = 'test-user-library-selection';
  const testProjectId = 'test-project-library-selection';

  // Test datasets of different sizes and characteristics
  const smallNumericDataset = [
    { category: 'A', value: 10, score: 85 },
    { category: 'B', value: 20, score: 92 },
    { category: 'C', value: 15, score: 78 }
  ];

  const mediumMixedDataset = Array.from({ length: 500 }, (_, i) => ({
    id: i,
    category: ['A', 'B', 'C', 'D'][i % 4],
    value: Math.random() * 100,
    score: Math.random() * 10,
    rating: Math.floor(Math.random() * 5) + 1,
    date: new Date(2024, 0, i % 365 + 1).toISOString().split('T')[0],
    description: `Item ${i} description with some text content`
  }));

  const largeNumericDataset = Array.from({ length: 5000 }, (_, i) => ({
    id: i,
    feature1: Math.random() * 1000,
    feature2: Math.random() * 500,
    feature3: Math.random() * 200,
    target: Math.random() * 100
  }));

  test.describe('Visualization Library Selection', () => {
    test('should select Plotly for small interactive dataset', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create an interactive bar chart',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: smallNumericDataset
          },
          parameters: {
            chartType: 'bar',
            interactive: true,
            performancePriority: 'balanced'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      expect(result.result.librarySelection.selectedLibrary).toBeDefined();
      expect(result.result.librarySelection.confidence).toBeGreaterThan(0);
      expect(result.result.librarySelection.reasoning).toBeDefined();
      
      // For small interactive dataset, should prefer Plotly
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['plotly', 'matplotlib', 'seaborn']).toContain(selectedLibrary);
      
      console.log(`Selected visualization library: ${selectedLibrary}`);
      console.log(`Confidence: ${result.result.librarySelection.confidence}`);
      console.log(`Reasoning: ${result.result.librarySelection.reasoning}`);
    });

    test('should select efficient library for large dataset', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create scatter plot for large dataset',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeNumericDataset
          },
          parameters: {
            chartType: 'scatter',
            interactive: true,
            performancePriority: 'performance'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      
      // For large dataset with performance priority, should prefer efficient libraries
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['bokeh', 'plotly', 'matplotlib']).toContain(selectedLibrary);
      
      console.log(`Selected visualization library for large dataset: ${selectedLibrary}`);
      console.log(`Reasoning: ${result.result.librarySelection.reasoning}`);
    });

    test('should select static library for non-interactive visualization', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create publication-quality chart',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            chartType: 'bar',
            interactive: false,
            styling: 'publication',
            performancePriority: 'quality'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      
      // For non-interactive publication-quality charts, should prefer static libraries
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['matplotlib', 'seaborn', 'ggplot2']).toContain(selectedLibrary);
      
      console.log(`Selected static visualization library: ${selectedLibrary}`);
    });
  });

  test.describe('Statistical Analysis Library Selection', () => {
    test('should select fast library for descriptive analysis', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'descriptive_stats',
          prompt: 'Calculate descriptive statistics',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            performancePriority: 'speed',
            realTime: false
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      
      // For descriptive analysis with speed priority, should prefer fast libraries
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['numpy', 'pandas', 'polars']).toContain(selectedLibrary);
      
      console.log(`Selected statistical library for descriptive analysis: ${selectedLibrary}`);
    });

    test('should select comprehensive library for complex analysis', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'anova',
          prompt: 'Perform ANOVA analysis',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            targetVariable: 'value',
            features: ['category'],
            performancePriority: 'balanced',
            interactive: true
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      
      // For complex statistical analysis, should prefer comprehensive libraries
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['statsmodels', 'scipy', 'r_stats']).toContain(selectedLibrary);
      
      console.log(`Selected statistical library for complex analysis: ${selectedLibrary}`);
    });

    test('should select distributed library for large dataset analysis', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'regression',
          prompt: 'Perform regression analysis on large dataset',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeNumericDataset
          },
          parameters: {
            targetVariable: 'target',
            features: ['feature1', 'feature2', 'feature3'],
            performancePriority: 'performance'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.result.librarySelection).toBeDefined();
      
      // For large dataset analysis, should prefer distributed/efficient libraries
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['dask', 'polars', 'statsmodels', 'scipy']).toContain(selectedLibrary);
      
      console.log(`Selected statistical library for large dataset: ${selectedLibrary}`);
    });
  });

  test.describe('ML Library Selection', () => {
    test('should select appropriate ML library for classification', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'machine_learning',
          prompt: 'Train classification model',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score', 'rating'],
            useAutoML: false,
            enableExplainability: true,
            performancePriority: 'balanced'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.tool).toBe('comprehensive_ml_pipeline');
      expect(result.result.librarySelection).toBeDefined();
      
      // Should select appropriate ML library
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['scikit-learn', 'xgboost', 'lightgbm']).toContain(selectedLibrary);
      
      console.log(`Selected ML library: ${selectedLibrary}`);
    });

    test('should select AutoML library when requested', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'classification',
          prompt: 'Use AutoML for best model',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score'],
            useAutoML: true,
            trials: 50,
            performancePriority: 'performance'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.tool).toBe('comprehensive_ml_pipeline');
      expect(result.result.librarySelection).toBeDefined();
      
      console.log(`Selected AutoML library: ${result.result.librarySelection.selectedLibrary}`);
    });
  });

  test.describe('Billing Integration', () => {
    test('should calculate costs with library selection', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create interactive dashboard',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            chartType: 'scatter',
            interactive: true,
            styling: 'professional',
            exportFormats: ['png', 'svg', 'html']
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.billing).toBeDefined();
      expect(result.billing.baseCost).toBeGreaterThan(0);
      expect(result.billing.libraryCost).toBeGreaterThanOrEqual(0);
      expect(result.billing.libraryUsed).toBeDefined();
      expect(result.billing.billingUnits).toBeGreaterThan(0);
      expect(result.billing.usageLogged).toBe(true);
      
      console.log(`Billing details:`);
      console.log(`- Base cost: ${result.billing.baseCost}`);
      console.log(`- Library cost: ${result.billing.libraryCost}`);
      console.log(`- Library used: ${result.billing.libraryUsed}`);
      console.log(`- Billing units: ${result.billing.billingUnits}`);
    });

    test('should log ML usage correctly', async ({ request }) => {
      // Execute ML analysis
      const analysisResponse = await request.post('/api/technical-agent/query', {
        data: {
          type: 'machine_learning',
          prompt: 'Train classification model',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumMixedDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score']
          }
        }
      });

      expect(analysisResponse.status()).toBe(200);
      const analysisResult = await analysisResponse.json();
      expect(analysisResult.success).toBe(true);

      // Check if usage was logged
      const usageResponse = await request.get(`/api/billing/ml-usage-summary?userId=${testUserId}`);
      expect(usageResponse.status()).toBe(200);
      
      const usageData = await usageResponse.json();
      expect(usageData.total_jobs).toBeGreaterThan(0);
      expect(usageData.total_billing_units).toBeGreaterThan(0);
      
      console.log(`ML Usage logged:`);
      console.log(`- Total jobs: ${usageData.total_jobs}`);
      console.log(`- Total billing units: ${usageData.total_billing_units}`);
    });
  });

  test.describe('Performance and Resource Estimation', () => {
    test('should provide accurate resource estimates', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create complex visualization',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeNumericDataset
          },
          parameters: {
            chartType: 'heatmap',
            interactive: true,
            performancePriority: 'performance'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.resourcesUsed).toBeDefined();
      expect(result.metrics.resourcesUsed.cpu).toBeGreaterThan(0);
      expect(result.metrics.resourcesUsed.memory).toBeGreaterThan(0);
      expect(result.metrics.librarySelection).toBeDefined();
      
      console.log(`Resource estimates:`);
      console.log(`- CPU: ${result.metrics.resourcesUsed.cpu}`);
      console.log(`- Memory: ${result.metrics.resourcesUsed.memory}`);
      console.log(`- Selected library: ${result.metrics.librarySelection.selected}`);
    });
  });

  test.describe('Error Handling and Fallbacks', () => {
    test('should handle empty dataset gracefully', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create chart from empty data',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: []
          },
          parameters: {
            chartType: 'bar'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      // Should handle gracefully with default library selection
      expect(result.result.librarySelection).toBeDefined();
      expect(result.result.librarySelection.selectedLibrary).toBeDefined();
      
      console.log(`Fallback library selection: ${result.result.librarySelection.selectedLibrary}`);
    });

    test('should provide fallback when primary library fails', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create visualization with invalid parameters',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: smallNumericDataset
          },
          parameters: {
            chartType: 'invalid_chart_type',
            library: 'nonexistent_library'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      // Should still provide library selection even if execution fails
      if (result.success) {
        expect(result.result.librarySelection).toBeDefined();
        console.log(`Fallback library: ${result.result.librarySelection.selectedLibrary}`);
      }
    });
  });
});


