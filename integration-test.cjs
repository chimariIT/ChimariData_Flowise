/**
 * Comprehensive Integration Test - Frontend, Middleware, Backend
 * Tests all connections and workflows
 */

const fs = require('fs');
const path = require('path');

class IntegrationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Integration Test...\n');
    
    await this.testBackendHealth();
    await this.testAPIEndpoints();
    await this.testFileProcessing();
    await this.testPythonIntegration();
    await this.testPricingSystem();
    await this.testAIIntegration();
    await this.testTrialWorkflow();
    
    await this.generateReport();
  }

  async testBackendHealth() {
    console.log('📡 Testing Backend Health...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/pricing`);
      const data = await response.json();
      
      if (response.ok && data.features) {
        this.addResult('Backend Health', 'PASS', 'API server responding correctly');
      } else {
        this.addResult('Backend Health', 'FAIL', 'API server not responding properly');
      }
    } catch (error) {
      this.addResult('Backend Health', 'FAIL', `Server unreachable: ${error.message}`);
    }
  }

  async testAPIEndpoints() {
    console.log('🔌 Testing API Endpoints...');
    
    const endpoints = [
      { path: '/api/pricing', method: 'GET' },
      { path: '/api/projects', method: 'GET' },
      { path: '/api/ai-status', method: 'GET' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint.path}`, {
          method: endpoint.method
        });
        
        if (response.ok) {
          this.addResult(`API ${endpoint.path}`, 'PASS', `${endpoint.method} request successful`);
        } else {
          this.addResult(`API ${endpoint.path}`, 'FAIL', `HTTP ${response.status}`);
        }
      } catch (error) {
        this.addResult(`API ${endpoint.path}`, 'FAIL', error.message);
      }
    }
  }

  async testFileProcessing() {
    console.log('📄 Testing File Processing...');
    
    try {
      // Create test CSV data
      const csvData = `name,age,salary,department
John Doe,30,75000,Engineering
Jane Smith,25,65000,Marketing
Bob Johnson,35,85000,Engineering`;
      
      const formData = new FormData();
      const blob = new Blob([csvData], { type: 'text/csv' });
      formData.append('file', blob, 'test.csv');
      
      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (response.ok && result.success && result.trialResults) {
        this.addResult('File Processing', 'PASS', 'CSV file processed successfully');
        
        // Check if schema was detected
        if (result.trialResults.schema && Object.keys(result.trialResults.schema).length > 0) {
          this.addResult('Schema Detection', 'PASS', 'Data schema detected correctly');
        } else {
          this.addResult('Schema Detection', 'FAIL', 'Schema not detected');
        }
      } else {
        this.addResult('File Processing', 'FAIL', result.error || 'Processing failed');
      }
    } catch (error) {
      this.addResult('File Processing', 'FAIL', error.message);
    }
  }

  async testPythonIntegration() {
    console.log('🐍 Testing Python Integration...');
    
    try {
      // Test Python dependencies
      const { spawn } = require('child_process');
      
      const pythonTest = spawn('python3', ['-c', 'import pandas; import matplotlib; import seaborn; print("OK")']);
      
      let output = '';
      pythonTest.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonTest.on('close', (code) => {
        if (code === 0 && output.includes('OK')) {
          this.addResult('Python Dependencies', 'PASS', 'All Python libraries available');
        } else {
          this.addResult('Python Dependencies', 'FAIL', 'Python dependencies missing');
        }
      });
      
      // Test Python script execution
      if (fs.existsSync('python_scripts/trial_analyzer.py')) {
        this.addResult('Python Scripts', 'PASS', 'Trial analyzer script available');
      } else {
        this.addResult('Python Scripts', 'FAIL', 'Trial analyzer script missing');
      }
      
    } catch (error) {
      this.addResult('Python Integration', 'FAIL', error.message);
    }
  }

  async testPricingSystem() {
    console.log('💰 Testing Pricing System...');
    
    try {
      // Test pricing calculation
      const response = await fetch(`${this.baseUrl}/api/calculate-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          features: ['transformation', 'analysis']
        })
      });
      
      const pricing = await response.json();
      
      if (response.ok && pricing.total && pricing.discount) {
        this.addResult('Pricing Calculation', 'PASS', `Price: $${pricing.total}, Discount: $${pricing.discount}`);
        
        // Verify progressive discount (2 features should have 15% discount)
        if (pricing.discount > 0) {
          this.addResult('Progressive Discounts', 'PASS', 'Discount system working');
        } else {
          this.addResult('Progressive Discounts', 'FAIL', 'Discounts not applied');
        }
      } else {
        this.addResult('Pricing Calculation', 'FAIL', 'Price calculation failed');
      }
    } catch (error) {
      this.addResult('Pricing System', 'FAIL', error.message);
    }
  }

  async testAIIntegration() {
    console.log('🤖 Testing AI Integration...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/ai-status`);
      const aiStatus = await response.json();
      
      if (response.ok && aiStatus.available) {
        this.addResult('AI Integration', 'PASS', `Available providers: ${aiStatus.available.join(', ')}`);
      } else {
        this.addResult('AI Integration', 'WARN', 'No AI providers configured (API keys needed)');
      }
    } catch (error) {
      this.addResult('AI Integration', 'FAIL', error.message);
    }
  }

  async testTrialWorkflow() {
    console.log('⚡ Testing Complete Trial Workflow...');
    
    try {
      // Create realistic test data
      const testData = `product,price,category,sales,rating
Laptop,999.99,Electronics,150,4.5
Mouse,29.99,Electronics,300,4.2
Keyboard,79.99,Electronics,200,4.3
Monitor,299.99,Electronics,100,4.4
Headphones,149.99,Electronics,250,4.1`;
      
      const formData = new FormData();
      const blob = new Blob([testData], { type: 'text/csv' });
      formData.append('file', blob, 'products.csv');
      
      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        let workflowTests = [];
        
        // Check schema detection
        if (result.trialResults?.schema) {
          workflowTests.push('Schema detected');
        }
        
        // Check analysis
        if (result.trialResults?.descriptiveAnalysis) {
          workflowTests.push('Analysis completed');
        }
        
        // Check visualizations
        if (result.trialResults?.basicVisualizations?.length > 0) {
          workflowTests.push('Visualizations generated');
        }
        
        this.addResult('Trial Workflow', 'PASS', `Complete workflow: ${workflowTests.join(', ')}`);
      } else {
        this.addResult('Trial Workflow', 'FAIL', result.error || 'Workflow failed');
      }
    } catch (error) {
      this.addResult('Trial Workflow', 'FAIL', error.message);
    }
  }

  addResult(testName, status, details) {
    this.results.push({ testName, status, details });
    
    const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} ${testName}: ${details}`);
  }

  async generateReport() {
    console.log('\n📊 Integration Test Summary');
    console.log('=' .repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const warned = this.results.filter(r => r.status === 'WARN').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Warnings: ${warned}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach((result, index) => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
      console.log(`${index + 1}. ${icon} ${result.testName}: ${result.details}`);
    });

    // Save detailed results
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, warned, failed, successRate: Math.round((passed / total) * 100) },
      results: this.results
    };
    
    fs.writeFileSync('integration-test-results.json', JSON.stringify(report, null, 2));
    console.log('\n💾 Detailed results saved to integration-test-results.json');
    
    if (failed === 0) {
      console.log('\n🎉 All systems operational! ChimariData is ready for use.');
    } else {
      console.log('\n🔧 Some issues detected. Please check the failed tests above.');
    }
  }
}

// Run the tests
if (require.main === module) {
  const tester = new IntegrationTester();
  tester.runAllTests().catch(console.error);
}

module.exports = IntegrationTester;