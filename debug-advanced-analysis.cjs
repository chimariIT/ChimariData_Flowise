/**
 * Debug Advanced Analysis Project ID Issue
 * Tests what happens when we make the API call from the frontend
 */

const fs = require('fs');
const fetch = require('node-fetch');

class AdvancedAnalysisDebugger {
  constructor() {
    this.results = [];
    this.baseUrl = 'http://localhost:5000';
  }

  async runTests() {
    console.log('🔍 Debugging Advanced Analysis Project ID Issue...\n');
    
    // Step 1: Create a project first
    await this.createTestProject();
    
    // Step 2: Test the advanced analysis endpoint
    await this.testAdvancedAnalysis();
    
    // Step 3: Generate debug report
    await this.generateDebugReport();
  }

  async createTestProject() {
    try {
      const formData = new (require('form-data'))();
      formData.append('name', 'Debug Test Project');
      formData.append('file', fs.createReadStream('./test_data.csv'));
      
      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.projectId = result.projectId;
        console.log(`✅ Project created with ID: ${this.projectId}`);
        this.addResult('Project Creation', 'PASS', `Project ID: ${this.projectId}`);
      } else {
        console.log(`❌ Project creation failed: ${result.error}`);
        this.addResult('Project Creation', 'FAIL', result.error);
      }
    } catch (error) {
      console.log(`❌ Project creation error: ${error.message}`);
      this.addResult('Project Creation', 'FAIL', error.message);
    }
  }

  async testAdvancedAnalysis() {
    if (!this.projectId) {
      console.log('❌ No project ID available for testing');
      return;
    }

    try {
      console.log(`🧪 Testing advanced analysis with project ID: ${this.projectId}`);
      
      const config = {
        question: 'Test analysis question',
        analysisType: 'descriptive',
        analysisPath: 'statistical',
        targetVariable: 'price',
        multivariateVariables: ['category'],
        alpha: '0.05'
      };
      
      console.log('📊 Request payload:', JSON.stringify({ projectId: this.projectId, config }, null, 2));
      
      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId,
          config: config
        })
      });
      
      const result = await response.json();
      
      console.log('📈 Response status:', response.status);
      console.log('📈 Response body:', JSON.stringify(result, null, 2));
      
      if (response.ok && result.success) {
        console.log('✅ Advanced analysis succeeded');
        this.addResult('Advanced Analysis', 'PASS', 'Analysis completed successfully');
      } else {
        console.log(`❌ Advanced analysis failed: ${result.error}`);
        this.addResult('Advanced Analysis', 'FAIL', result.error);
      }
    } catch (error) {
      console.log(`❌ Advanced analysis error: ${error.message}`);
      this.addResult('Advanced Analysis', 'FAIL', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({
      test: testName,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  }

  async generateDebugReport() {
    const report = {
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'PASS').length,
        failed: this.results.filter(r => r.status === 'FAIL').length
      },
      results: this.results,
      projectId: this.projectId,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('advanced-analysis-debug-results.json', JSON.stringify(report, null, 2));
    
    console.log('\n🔍 DEBUG REPORT');
    console.log('==================================================');
    console.log(`📊 Total Tests: ${report.summary.total}`);
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`🆔 Project ID: ${this.projectId || 'None'}`);
    
    if (report.summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`   - ${result.test}: ${result.message}`);
      });
    }
    
    console.log('\n📄 Detailed results saved to: advanced-analysis-debug-results.json');
  }
}

// Create test data file
const testData = `name,price,category
Product A,10.99,electronics
Product B,25.50,clothing
Product C,15.75,books`;

fs.writeFileSync('test_data.csv', testData);

// Run the debug test
const debugTester = new AdvancedAnalysisDebugger();
debugTester.runTests().catch(console.error);