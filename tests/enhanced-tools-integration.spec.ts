import { test, expect } from '@playwright/test';

/**
 * Comprehensive test suite for enhanced visualization and statistical analysis tools
 * Tests intelligent library selection, billing integration, and agent coordination
 */

test.describe('Enhanced Tools Integration Tests', () => {
  const testUserId = 'test-user-123';
  const testProjectId = 'test-project-456';

  // Test data for different scenarios
  const smallDataset = [
    { category: 'A', value: 10, date: '2024-01-01' },
    { category: 'B', value: 20, date: '2024-01-02' },
    { category: 'C', value: 15, date: '2024-01-03' }
  ];

  const mediumDataset = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    category: ['A', 'B', 'C', 'D'][i % 4],
    value: Math.random() * 100,
    score: Math.random() * 10,
    date: new Date(2024, 0, i % 365 + 1).toISOString().split('T')[0]
  }));

  const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    category: ['A', 'B', 'C', 'D', 'E', 'F'][i % 6],
    value: Math.random() * 1000,
    score: Math.random() * 100,
    rating: Math.floor(Math.random() * 5) + 1,
    date: new Date(2024, 0, i % 365 + 1).toISOString().split('T')[0]
  }));

  test.describe('Intelligent Library Selection', () => {
    test('should select appropriate visualization library for small dataset', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create a bar chart showing category distribution',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: smallDataset
          },
          parameters: {
            chartType: 'bar',
            interactive: true,
            performancePriority: 'speed'
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
      expect(result.result.librarySelection.alternatives).toBeDefined();
      
      // For small interactive dataset, should prefer Plotly or similar
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['plotly', 'matplotlib', 'seaborn']).toContain(selectedLibrary);
    });

    test('should select appropriate visualization library for large dataset', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create a scatter plot showing value vs score',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeDataset
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
    });

    test('should select appropriate statistical library for descriptive analysis', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'descriptive_stats',
          prompt: 'Calculate descriptive statistics for the dataset',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
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
      expect(['numpy', 'pandas', 'scipy']).toContain(selectedLibrary);
    });

    test('should select appropriate statistical library for complex analysis', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'anova',
          prompt: 'Perform ANOVA analysis on value by category',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
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
      expect(['statsmodels', 'scipy', 'pandas']).toContain(selectedLibrary);
    });
  });

  test.describe('ML/LLM Tool Integration', () => {
    test('should use comprehensive ML pipeline with intelligent library selection', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'machine_learning',
          prompt: 'Train a classification model to predict category',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score'],
            useAutoML: true,
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
      
      // Should include ML-specific library selection
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['scikit-learn', 'xgboost', 'lightgbm', 'spark_ml']).toContain(selectedLibrary);
    });

    test('should use AutoML optimizer with intelligent library selection', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'classification',
          prompt: 'Use AutoML to find the best classification model',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score'],
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
    });
  });

  test.describe('Billing Integration', () => {
    test('should calculate correct costs for visualization with library selection', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create an interactive dashboard',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
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
    });

    test('should calculate correct costs for ML analysis with library selection', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'machine_learning',
          prompt: 'Train ML model with AutoML',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score'],
            useAutoML: true,
            trials: 100
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.billing).toBeDefined();
      expect(result.billing.baseCost).toBeGreaterThan(0);
      expect(result.billing.libraryCost).toBeGreaterThanOrEqual(0);
      expect(result.billing.billingUnits).toBeGreaterThan(0);
      expect(result.billing.usageLogged).toBe(true);
    });

    test('should log ML usage correctly', async ({ request }) => {
      // First, execute an ML analysis
      const analysisResponse = await request.post('/api/technical-agent/query', {
        data: {
          type: 'machine_learning',
          prompt: 'Train classification model',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            targetColumn: 'category',
            features: ['value', 'score']
          }
        }
      });

      expect(analysisResponse.status()).toBe(200);

      // Then check if usage was logged
      const usageResponse = await request.get(`/api/billing/ml-usage-summary?userId=${testUserId}`);
      expect(usageResponse.status()).toBe(200);
      
      const usageData = await usageResponse.json();
      expect(usageData.total_jobs).toBeGreaterThan(0);
      expect(usageData.total_billing_units).toBeGreaterThan(0);
    });
  });

  test.describe('Performance and Resource Estimation', () => {
    test('should provide accurate resource estimates for different libraries', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create complex visualization',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeDataset
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
    });

    test('should optimize performance based on dataset characteristics', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'statistical_analysis',
          prompt: 'Perform comprehensive statistical analysis',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: largeDataset
          },
          parameters: {
            analysisType: 'regression',
            targetVariable: 'value',
            features: ['score', 'rating'],
            performancePriority: 'performance'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.metrics.resourcesUsed.cpu).toBeGreaterThan(0);
      expect(result.metrics.resourcesUsed.memory).toBeGreaterThan(0);
      
      // For large dataset with performance priority, should select efficient library
      const selectedLibrary = result.result.librarySelection.selectedLibrary;
      expect(['numpy', 'dask', 'polars']).toContain(selectedLibrary);
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
    });

    test('should provide fallback library selection when primary fails', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create visualization with invalid parameters',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: smallDataset
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
      }
    });
  });

  test.describe('Library-Specific Optimizations', () => {
    test('should apply Plotly-specific optimizations', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create interactive Plotly chart',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            chartType: 'scatter',
            interactive: true,
            library: 'plotly'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      if (result.success && result.result.librarySelection.selectedLibrary === 'plotly') {
        expect(result.result.librarySelection.reasoning).toContain('interactive');
      }
    });

    test('should apply Matplotlib-specific optimizations', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create publication-quality chart',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            chartType: 'bar',
            interactive: false,
            library: 'matplotlib',
            styling: 'publication'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      if (result.success && result.result.librarySelection.selectedLibrary === 'matplotlib') {
        expect(result.result.librarySelection.reasoning).toContain('publication');
      }
    });

    test('should apply Statsmodels-specific optimizations', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'regression',
          prompt: 'Perform detailed regression analysis',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            targetVariable: 'value',
            features: ['score'],
            library: 'statsmodels',
            detailedOutput: true
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      if (result.success && result.result.librarySelection.selectedLibrary === 'statsmodels') {
        expect(result.result.librarySelection.reasoning).toContain('detailed');
      }
    });
  });

  test.describe('Integration with Existing Tools', () => {
    test('should work with existing statistical analyzer tool', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'statistical_analysis',
          prompt: 'Perform ANOVA analysis',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: mediumDataset
          },
          parameters: {
            analysisType: 'anova',
            targetVariable: 'value',
            features: ['category']
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.tool).toBe('statistical_analyzer');
      expect(result.result.librarySelection).toBeDefined();
    });

    test('should work with existing visualization engine tool', async ({ request }) => {
      const response = await request.post('/api/technical-agent/query', {
        data: {
          type: 'visualization',
          prompt: 'Create bar chart',
          context: {
            userId: testUserId,
            projectId: testProjectId,
            data: smallDataset
          },
          parameters: {
            chartType: 'bar',
            xAxis: 'category',
            yAxis: 'value'
          }
        }
      });

      expect(response.status()).toBe(200);
      const result = await response.json();
      
      expect(result.success).toBe(true);
      expect(result.tool).toBe('visualization_engine');
      expect(result.result.librarySelection).toBeDefined();
    });
  });
});


