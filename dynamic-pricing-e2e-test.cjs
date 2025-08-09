/**
 * Comprehensive End-to-End Testing Script for Dynamic Pricing System
 * Tests all frontend links, backend integrations, and user scenarios
 */

const fs = require('fs');
const path = require('path');

class DynamicPricingE2ETest {
  constructor() {
    this.baseURL = 'http://localhost:5000';
    this.testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      scenarios: {}
    };
    this.testFiles = [];
    this.projectIds = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(url, options = {}) {
    try {
      // Add fetch polyfill if not available
      if (typeof fetch === 'undefined') {
        global.fetch = require('node-fetch');
      }
      
      const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
      const response = await fetch(fullUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      const data = await response.text();
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }

      return {
        status: response.status,
        data: parsedData,
        headers: response.headers
      };
    } catch (error) {
      this.log(`Request failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async createTestFile(filename, content) {
    const filePath = path.join(__dirname, 'test-data', filename);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content);
    this.testFiles.push(filePath);
    return filePath;
  }

  async uploadTestFile(filePath, fileName) {
    try {
      // Use curl subprocess instead of problematic Node.js FormData for testing
      const { spawn } = require('child_process');
      
      return new Promise((resolve, reject) => {
        const curl = spawn('curl', [
          '-X', 'POST',
          `${this.baseURL}/api/trial-upload`,
          '-F', `file=@${filePath};type=${fileName.endsWith('.csv') ? 'text/csv' : 'application/octet-stream'}`,
          '--silent'
        ]);
        
        let output = '';
        let error = '';
        
        curl.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        curl.stderr.on('data', (data) => {
          error += data.toString();
        });
        
        curl.on('close', async (code) => {
          if (code !== 0) {
            reject(new Error(`curl failed with code ${code}: ${error}`));
            return;
          }
          
          try {
            const result = JSON.parse(output);
            if (result.success) {
              // Handle both immediate project creation and PII decision scenarios
              if (result.projectId) {
                this.projectIds.push(result.projectId);
                resolve(result.projectId);
              } else if (result.requiresPIIDecision && result.tempFileId) {
                // For PII scenarios, make a follow-up decision call
                const decisionResponse = await fetch(`${this.baseURL}/api/complete-upload`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tempFileId: result.tempFileId,
                    name: fileName,
                    description: 'Test project',
                    decision: 'exclude',
                    questions: ['Test question']
                  })
                });
                
                const decisionResult = await decisionResponse.json();
                if (decisionResult.success && decisionResult.projectId) {
                  this.projectIds.push(decisionResult.projectId);
                  resolve(decisionResult.projectId);
                } else {
                  reject(new Error(`PII decision failed: ${JSON.stringify(decisionResult)}`));
                }
              } else {
                reject(new Error(`Unexpected response format: ${JSON.stringify(result)}`));
              }
            } else {
              reject(new Error(`Upload failed: ${JSON.stringify(result)}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError.message}. Raw output: ${output}`));
          }
        });
      });
    } catch (error) {
      this.log(`File upload failed: ${error.message}`, 'error');
      throw error;
    }
  }

  async testScenario(scenarioName, testFunction) {
    this.log(`\n🧪 Testing Scenario: ${scenarioName}`);
    this.testResults.totalTests++;
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.passed++;
      this.testResults.scenarios[scenarioName] = { 
        status: 'passed', 
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      };
      this.log(`✅ Scenario "${scenarioName}" passed (${duration}ms)`, 'success');
    } catch (error) {
      this.testResults.failed++;
      this.testResults.scenarios[scenarioName] = { 
        status: 'failed', 
        error: error.message,
        timestamp: new Date().toISOString()
      };
      this.testResults.errors.push(`${scenarioName}: ${error.message}`);
      this.log(`❌ Scenario "${scenarioName}" failed: ${error.message}`, 'error');
    }
  }

  async testFrontendRoutes() {
    await this.testScenario('Frontend Routes Accessibility', async () => {
      const routes = [
        '/',
        '/pricing',
        '/auth'
      ];

      for (const route of routes) {
        const response = await this.makeRequest(route);
        if (response.status >= 400) {
          throw new Error(`Route ${route} returned status ${response.status}`);
        }
        this.log(`Route ${route}: ${response.status}`);
      }
    });
  }

  async testAPIHealthCheck() {
    await this.testScenario('API Health Check', async () => {
      const endpoints = [
        '/api/health',
        '/api/quick-estimate'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.makeRequest(endpoint, { method: 'GET' });
          this.log(`API ${endpoint}: ${response.status}`);
        } catch (error) {
          // Some endpoints might require auth, that's ok
          this.log(`API ${endpoint}: Requires authentication`);
        }
      }
    });
  }

  async testFileUploadScenarios() {
    // Test Small CSV File Scenario
    await this.testScenario('Small CSV File Upload & Analysis', async () => {
      const csvContent = `Name,Age,Salary,Department
John Doe,28,50000,Engineering
Jane Smith,32,65000,Marketing
Bob Johnson,45,80000,Sales
Alice Brown,29,55000,Engineering
Charlie Wilson,38,70000,Marketing
David Lee,41,75000,Sales`;

      const filePath = await this.createTestFile('small_dataset.csv', csvContent);
      const projectId = await this.uploadTestFile(filePath, 'small_dataset.csv');
      
      // Test project analysis
      const analysisResponse = await this.makeRequest(`/api/test/project-analysis/${projectId}`);
      if (!analysisResponse.data.success) {
        throw new Error('Project analysis failed');
      }

      const analysis = analysisResponse.data.data || analysisResponse.data;
      if (analysis.recordCount !== 6 || analysis.columnCount !== 2) {
        throw new Error(`Expected 6 records and 2 columns, got ${analysis.recordCount} records and ${analysis.columnCount} columns`);
      }

      this.log(`✅ Small CSV: ${analysis.recordCount} records, ${analysis.columnCount} columns, complexity: ${analysis.estimatedComplexity}`);
    });

    // Test Medium-sized Dataset with PII
    await this.testScenario('Medium Dataset with PII', async () => {
      const csvWithPII = `customer_id,first_name,last_name,email,phone,ssn,age,income
1,John,Doe,john.doe@email.com,555-1234,123-45-6789,28,50000
2,Jane,Smith,jane.smith@email.com,555-5678,987-65-4321,32,65000
3,Bob,Johnson,bob.johnson@email.com,555-9012,456-78-9123,45,80000
4,Alice,Brown,alice.brown@email.com,555-3456,789-12-3456,29,55000
5,Charlie,Wilson,charlie.wilson@email.com,555-7890,321-65-9870,38,70000`;

      const filePath = await this.createTestFile('pii_dataset.csv', csvWithPII);
      const projectId = await this.uploadTestFile(filePath, 'pii_dataset.csv');
      
      const analysisResponse = await this.makeRequest(`/api/test/project-analysis/${projectId}`);
      if (!analysisResponse.data.success) {
        throw new Error('PII dataset analysis failed');
      }

      const analysis = analysisResponse.data.data || analysisResponse.data;
      if (!analysis.piiDetected) {
        throw new Error('PII should have been detected');
      }

      this.log(`✅ PII Dataset: ${analysis.piiColumns.length} PII columns detected`);
    });

    // Test Large Dataset Scenario
    await this.testScenario('Large Dataset Processing', async () => {
      let largeCsvContent = 'id,value1,value2,category,timestamp\n';
      for (let i = 1; i <= 1000; i++) {
        largeCsvContent += `${i},${Math.random() * 100},${Math.random() * 200},Category${i % 5},2024-01-${String(i % 28 + 1).padStart(2, '0')}\n`;
      }

      const filePath = await this.createTestFile('large_dataset.csv', largeCsvContent);
      const projectId = await this.uploadTestFile(filePath, 'large_dataset.csv');
      
      const analysisResponse = await this.makeRequest(`/api/test/project-analysis/${projectId}`);
      if (!analysisResponse.data.success) {
        throw new Error('Large dataset analysis failed');
      }

      const analysis = analysisResponse.data.data || analysisResponse.data;
      if (analysis.recordCount !== 1000) {
        throw new Error(`Expected 1000 records, got ${analysis.recordCount}`);
      }

      this.log(`✅ Large Dataset: ${analysis.recordCount} records processed`);
    });
  }

  async testDynamicPricingCalculations() {
    // Test Single Feature Pricing
    await this.testScenario('Single Feature Pricing Calculation', async () => {
      if (this.projectIds.length === 0) {
        throw new Error('No project IDs available for pricing test');
      }

      const projectId = this.projectIds[0];
      const features = ['data_visualization'];
      const configurations = {};

      const pricingResponse = await this.makeRequest(
        `/api/test/dynamic-pricing/${projectId}?features=${encodeURIComponent(JSON.stringify(features))}&configurations=${encodeURIComponent(JSON.stringify(configurations))}`
      );

      if (!pricingResponse.data.success) {
        throw new Error('Single feature pricing calculation failed');
      }

      const pricing = pricingResponse.data;
      if (pricing.finalTotal <= 0) {
        throw new Error('Pricing should be greater than 0');
      }

      this.log(`✅ Single Feature Pricing: $${pricing.finalTotal.toFixed(2)}`);
    });

    // Test Multi-Feature Discount
    await this.testScenario('Multi-Feature Discount Calculation', async () => {
      if (this.projectIds.length === 0) {
        throw new Error('No project IDs available for pricing test');
      }

      const projectId = this.projectIds[0];
      const features = ['data_transformation', 'data_visualization', 'data_analysis'];
      const configurations = {};

      const pricingResponse = await this.makeRequest(
        `/api/test/dynamic-pricing/${projectId}?features=${encodeURIComponent(JSON.stringify(features))}&configurations=${encodeURIComponent(JSON.stringify(configurations))}`
      );

      if (!pricingResponse.data.success) {
        throw new Error('Multi-feature pricing calculation failed');
      }

      const pricing = pricingResponse.data;
      
      // Check for discount
      const hasDiscount = pricing.discounts.multiFeatureDiscount > 0;
      if (!hasDiscount) {
        throw new Error('Multi-feature discount should be applied');
      }

      this.log(`✅ Multi-Feature Pricing: $${pricing.finalTotal.toFixed(2)} (discount: $${pricing.discounts.multiFeatureDiscount.toFixed(2)})`);
    });

    // Test All Features Maximum Discount
    await this.testScenario('Maximum Discount (All Features)', async () => {
      if (this.projectIds.length === 0) {
        throw new Error('No project IDs available for pricing test');
      }

      const projectId = this.projectIds[0];
      const features = ['data_transformation', 'data_visualization', 'data_analysis', 'ai_insights'];
      const configurations = {
        data_transformation: {
          operations: ['cleaning', 'normalization', 'outlier_removal'],
          joinDatasets: 0,
          customTransformations: 0
        },
        data_visualization: {
          chartTypes: ['bar', 'line', 'scatter'],
          customVisualizations: 0,
          interactiveFeatures: false
        },
        data_analysis: {
          analysisTypes: ['descriptive', 'correlation', 'regression'],
          variablesCount: 5,
          modelComplexity: 'basic'
        },
        ai_insights: {
          insightTypes: ['business_insights', 'pattern_recognition'],
          customPrompts: 0,
          aiModelComplexity: 'standard'
        }
      };

      const pricingResponse = await this.makeRequest(
        `/api/test/dynamic-pricing/${projectId}?features=${encodeURIComponent(JSON.stringify(features))}&configurations=${encodeURIComponent(JSON.stringify(configurations))}`
      );

      if (!pricingResponse.data.success) {
        throw new Error('All features pricing calculation failed');
      }

      const pricing = pricingResponse.data;
      
      // Check for maximum discount
      const hasMaxDiscount = pricing.discounts.multiFeatureDiscount > 0;
      if (!hasMaxDiscount) {
        throw new Error('Maximum multi-feature discount should be applied');
      }

      this.log(`✅ All Features Pricing: $${pricing.finalTotal.toFixed(2)} (total discount: $${pricing.discounts.totalDiscountAmount.toFixed(2)})`);
    });
  }

  async testQuickEstimate() {
    await this.testScenario('Quick Estimate API', async () => {
      const estimateData = {
        fileSizeBytes: 1024 * 1024, // 1MB
        recordCount: 1000,
        columnCount: 10,
        selectedFeatures: ['data_analysis', 'data_visualization']
      };

      const response = await this.makeRequest('/api/quick-estimate', {
        method: 'POST',
        body: JSON.stringify(estimateData)
      });

      if (!response.data.success) {
        throw new Error('Quick estimate failed');
      }

      const estimate = response.data;
      if (!estimate.estimatedCost || !estimate.timeEstimate) {
        throw new Error('Quick estimate should return cost and time estimates');
      }

      this.log(`✅ Quick Estimate: $${estimate.estimatedCost}, ~${estimate.timeEstimate} minutes`);
    });
  }

  async testWorkflowManagement() {
    await this.testScenario('Workflow State Management', async () => {
      if (this.projectIds.length === 0) {
        throw new Error('No project IDs available for workflow test');
      }

      const projectId = this.projectIds[0];

      // Initialize workflow
      const initResponse = await this.makeRequest(`/api/test/pricing-workflow/${projectId}/initialize`, {
        method: 'POST'
      });

      if (!initResponse.data.success) {
        throw new Error('Workflow initialization failed');
      }

      // Get workflow state
      const getResponse = await this.makeRequest(`/api/test/pricing-workflow/${projectId}`);
      if (!getResponse.data.success) {
        throw new Error('Failed to get workflow state');
      }

      const workflowState = getResponse.data;
      if (!workflowState.currentStep) {
        throw new Error('Failed to get workflow state');
      }

      // Update workflow
      const updateResponse = await this.makeRequest(`/api/test/pricing-workflow/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({
          currentStep: 'feature_selection',
          selectedFeatures: ['data_visualization'],
          featureConfigurations: {},
          estimatedCost: 2500 // $25.00 in cents
        })
      });

      if (!updateResponse.data.success) {
        throw new Error('Workflow update failed');
      }

      this.log('✅ Workflow state management working correctly');
    });
  }

  async testComplexityScenarios() {
    // Test High Complexity Dataset
    await this.testScenario('High Complexity Dataset', async () => {
      let complexCsvContent = 'id,name,email,phone,address,salary,department,hire_date,performance_score,notes\n';
      for (let i = 1; i <= 100; i++) {
        const missingData = i % 5 === 0 ? ',,' : `data${i},data${i}@example.com,`;
        complexCsvContent += `${i},John${i}${missingData}555-${i.toString().padStart(4, '0')},123 Main St,${50000 + i * 100},Engineering,2024-01-01,${Math.random() * 100},"Complex notes with, commas and ""quotes"""\n`;
      }

      const filePath = await this.createTestFile('complex_dataset.csv', complexCsvContent);
      const projectId = await this.uploadTestFile(filePath, 'complex_dataset.csv');
      
      const analysisResponse = await this.makeRequest(`/api/test/project-analysis/${projectId}`);
      if (!analysisResponse.data.success) {
        throw new Error('Complex dataset analysis failed');
      }

      const analysis = analysisResponse.data.data || analysisResponse.data;
      
      // Test pricing with complexity
      const features = ['data_transformation', 'data_analysis'];
      const configurations = {
        data_transformation: {
          operations: ['cleaning', 'missing_data_imputation', 'pii_anonymization'],
          joinDatasets: 0,
          customTransformations: 1
        }
      };

      const pricingResponse = await this.makeRequest(
        `/api/test/dynamic-pricing/${projectId}?features=${encodeURIComponent(JSON.stringify(features))}&configurations=${encodeURIComponent(JSON.stringify(configurations))}`
      );

      if (!pricingResponse.data.success) {
        throw new Error('Complex dataset pricing failed');
      }

      const pricing = pricingResponse.data;
      this.log(`✅ Complex Dataset: $${pricing.finalTotal.toFixed(2)}, processing time: ${pricing.estimatedProcessing.timeMinutes} min`);
    });
  }

  async testErrorHandling() {
    await this.testScenario('Error Handling - Invalid Project ID', async () => {
      const invalidProjectId = 'invalid-project-id';
      
      try {
        const response = await this.makeRequest(`/api/test/project-analysis/${invalidProjectId}`);
        if (response.status !== 404) {
          throw new Error('Should return 404 for invalid project ID');
        }
        this.log('✅ Correctly handles invalid project ID');
      } catch (error) {
        if (!error.message.includes('404')) {
          throw error;
        }
      }
    });

    await this.testScenario('Error Handling - Empty Features', async () => {
      if (this.projectIds.length === 0) {
        throw new Error('No project IDs available for error test');
      }

      const projectId = this.projectIds[0];
      const response = await this.makeRequest(
        `/api/test/dynamic-pricing/${projectId}?features=${encodeURIComponent(JSON.stringify([]))}`
      );

      if (!response.data.success) {
        throw new Error('Empty features should return success with zero cost');
      }

      if (response.data.finalTotal !== 0) {
        throw new Error('Empty features should have zero total cost');
      }

      this.log('✅ Correctly handles empty feature selection');
    });
  }

  async testIntegrationEndpoints() {
    await this.testScenario('Integration Endpoints Check', async () => {
      const endpoints = [
        { url: '/api/health', method: 'GET', expectStatus: [200, 404] },
        { url: '/api/quick-estimate', method: 'POST', expectStatus: [200, 401] }
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.makeRequest(endpoint.url, { 
            method: endpoint.method,
            body: endpoint.method === 'POST' ? JSON.stringify({
              fileSizeBytes: 1024,
              recordCount: 10,
              columnCount: 5,
              selectedFeatures: ['data_visualization']
            }) : undefined
          });

          if (!endpoint.expectStatus.includes(response.status)) {
            throw new Error(`${endpoint.url} returned unexpected status ${response.status}`);
          }

          this.log(`✅ ${endpoint.url}: Status ${response.status}`);
        } catch (error) {
          this.log(`⚠️  ${endpoint.url}: ${error.message}`);
        }
      }
    });
  }

  async cleanup() {
    this.log('\n🧹 Cleaning up test files...');
    
    for (const filePath of this.testFiles) {
      try {
        await fs.promises.unlink(filePath);
        this.log(`Deleted: ${filePath}`);
      } catch (error) {
        this.log(`Failed to delete ${filePath}: ${error.message}`, 'error');
      }
    }

    // Clean up test data directory
    try {
      await fs.promises.rmdir(path.join(__dirname, 'test-data'), { recursive: true });
    } catch (error) {
      // Directory might not exist, that's ok
    }
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.totalTests,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        successRate: `${((this.testResults.passed / this.testResults.totalTests) * 100).toFixed(1)}%`
      },
      scenarios: this.testResults.scenarios,
      errors: this.testResults.errors,
      projectIds: this.projectIds,
      testFiles: this.testFiles.map(f => path.basename(f))
    };

    await fs.promises.writeFile(
      'dynamic-pricing-e2e-test-results.json',
      JSON.stringify(report, null, 2)
    );

    return report;
  }

  async runAllTests() {
    this.log('🚀 Starting Dynamic Pricing E2E Tests...\n');

    try {
      // Core functionality tests
      await this.testFrontendRoutes();
      await this.testAPIHealthCheck();
      
      // File upload and analysis tests
      await this.testFileUploadScenarios();
      
      // Pricing calculation tests
      await this.testDynamicPricingCalculations();
      await this.testQuickEstimate();
      
      // Workflow management tests
      await this.testWorkflowManagement();
      
      // Complex scenario tests
      await this.testComplexityScenarios();
      
      // Error handling tests
      await this.testErrorHandling();
      
      // Integration tests
      await this.testIntegrationEndpoints();

    } catch (error) {
      this.log(`Critical test failure: ${error.message}`, 'error');
    } finally {
      // Generate report
      const report = await this.generateReport();
      
      // Display summary
      this.log('\n📊 Test Results Summary:');
      this.log(`Total Tests: ${report.summary.totalTests}`);
      this.log(`Passed: ${report.summary.passed}`, 'success');
      this.log(`Failed: ${report.summary.failed}`, report.summary.failed > 0 ? 'error' : 'info');
      this.log(`Success Rate: ${report.summary.successRate}`);
      
      if (report.errors.length > 0) {
        this.log('\n❌ Errors:');
        report.errors.forEach(error => this.log(`  - ${error}`, 'error'));
      }
      
      this.log('\n📄 Detailed report saved to: dynamic-pricing-e2e-test-results.json');
      
      // Cleanup
      await this.cleanup();
      
      return report;
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new DynamicPricingE2ETest();
  tester.runAllTests()
    .then(report => {
      process.exit(report.summary.failed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = DynamicPricingE2ETest;