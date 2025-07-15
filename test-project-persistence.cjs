/**
 * Test Project Persistence Issue
 * Demonstrates the in-memory storage issue and improved error handling
 */

const fs = require('fs');

class ProjectPersistenceTest {
  constructor() {
    this.results = [];
    this.baseUrl = 'http://localhost:5000';
  }

  async runTest() {
    console.log('🔍 Testing Project Persistence Issue and Error Handling...\n');
    
    // Step 1: Create a project
    await this.createProject();
    
    // Step 2: Test advanced analysis with existing project
    if (this.projectId) {
      await this.testAdvancedAnalysis();
    }
    
    // Step 3: Test with non-existent project ID
    await this.testNonExistentProject();
    
    // Step 4: Generate report
    await this.generateReport();
  }

  async createProject() {
    try {
      // Create test CSV file
      const csvContent = `name,price,category,quantity
Product A,10.99,electronics,100
Product B,25.50,clothing,50
Product C,15.75,books,75
Test Item,99.99,other,25`;
      
      fs.writeFileSync('test_project.csv', csvContent);
      
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('name', 'Project Persistence Test');
      formData.append('file', fs.createReadStream('test_project.csv'));
      
      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success && result.requiresPIIDecision) {
        console.log('✅ Project upload initiated, PII decision required');
        this.tempFileId = result.tempFileId;
        
        // Handle PII decision
        await this.handlePIIDecision();
      } else {
        console.log('❌ Project upload failed:', result.error);
        this.addResult('Project Creation', 'FAIL', result.error);
      }
    } catch (error) {
      console.log('❌ Project creation error:', error.message);
      this.addResult('Project Creation', 'FAIL', error.message);
    }
  }

  async handlePIIDecision() {
    try {
      const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempFileId: this.tempFileId,
          decision: 'include',
          piiColumns: ['name'],
          piiDecisions: { name: 'include' }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.projectId = result.projectId;
        console.log(`✅ Project created with ID: ${this.projectId}`);
        this.addResult('Project Creation', 'PASS', `Project ID: ${this.projectId}`);
      } else {
        console.log('❌ PII decision failed:', result.error);
        this.addResult('Project Creation', 'FAIL', result.error);
      }
    } catch (error) {
      console.log('❌ PII decision error:', error.message);
      this.addResult('Project Creation', 'FAIL', error.message);
    }
  }

  async testAdvancedAnalysis() {
    try {
      console.log(`🧪 Testing advanced analysis with project ID: ${this.projectId}`);
      
      const config = {
        question: 'What are the pricing patterns in this data?',
        analysisType: 'descriptive',
        analysisPath: 'statistical',
        targetVariable: 'price',
        multivariateVariables: ['category'],
        alpha: '0.05'
      };
      
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
      
      if (response.ok && result.success) {
        console.log('✅ Advanced analysis with valid project succeeded');
        this.addResult('Valid Project Analysis', 'PASS', 'Analysis completed successfully');
      } else {
        console.log(`❌ Advanced analysis failed: ${result.error}`);
        this.addResult('Valid Project Analysis', 'FAIL', result.error);
      }
    } catch (error) {
      console.log(`❌ Advanced analysis error: ${error.message}`);
      this.addResult('Valid Project Analysis', 'FAIL', error.message);
    }
  }

  async testNonExistentProject() {
    try {
      console.log('🧪 Testing advanced analysis with non-existent project ID');
      
      const config = {
        question: 'Test question',
        analysisType: 'descriptive',
        analysisPath: 'statistical',
        targetVariable: 'price',
        multivariateVariables: ['category'],
        alpha: '0.05'
      };
      
      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: 'non-existent-project-12345',
          config: config
        })
      });
      
      const result = await response.json();
      
      if (response.status === 404) {
        console.log('✅ Non-existent project correctly returned 404');
        console.log('📋 Error details:', result);
        this.addResult('Non-existent Project Handling', 'PASS', 'Correct 404 response with detailed error');
      } else {
        console.log(`❌ Unexpected response for non-existent project: ${response.status}`);
        this.addResult('Non-existent Project Handling', 'FAIL', `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Non-existent project test error: ${error.message}`);
      this.addResult('Non-existent Project Handling', 'FAIL', error.message);
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

  async generateReport() {
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
    
    fs.writeFileSync('project-persistence-test-results.json', JSON.stringify(report, null, 2));
    
    console.log('\n📊 PROJECT PERSISTENCE TEST REPORT');
    console.log('==================================================');
    console.log(`📈 Total Tests: ${report.summary.total}`);
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`🆔 Project ID: ${this.projectId || 'None'}`);
    
    console.log('\n📋 Test Results:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`   ${icon} ${result.test}: ${result.message}`);
    });
    
    console.log('\n📄 Detailed results saved to: project-persistence-test-results.json');
    
    // Cleanup
    if (fs.existsSync('test_project.csv')) {
      fs.unlinkSync('test_project.csv');
    }
  }
}

// Run the test
const tester = new ProjectPersistenceTest();
tester.runTest().catch(console.error);