/**
 * Test PII Upload Workflow
 * Tests the complete PII detection and interim dialog workflow
 */

const path = require('path');
const fs = require('fs');

class PIIWorkflowTester {
  constructor() {
    this.results = [];
  }

  async runTest() {
    console.log('=== Testing PII Upload Workflow ===');
    
    try {
      // 1. Test server status
      await this.testServerConnection();
      
      // 2. Test PII detection endpoint
      await this.testPIIDetection();
      
      // 3. Test upload modal integration
      await this.testUploadModalIntegration();
      
      // 4. Test PII decision endpoint
      await this.testPIIDecisionEndpoint();
      
      await this.generateReport();
      
    } catch (error) {
      console.error('Test failed:', error);
      this.addResult('Overall Test', 'FAILED', error.message);
    }
  }

  async testServerConnection() {
    try {
      const response = await fetch('http://localhost:5000/api/projects');
      if (response.ok) {
        this.addResult('Server Connection', 'PASSED', 'Server is running');
      } else {
        this.addResult('Server Connection', 'FAILED', `Server returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Server Connection', 'FAILED', error.message);
    }
  }

  async testPIIDetection() {
    try {
      // Create test file with PII
      const testData = 'name,email,phone,ssn,age\nJohn Doe,john@example.com,555-123-4567,123-45-6789,30\nJane Smith,jane@example.com,555-987-6543,987-65-4321,25';
      fs.writeFileSync('test_pii_data.csv', testData);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test_pii_data.csv'));
      formData.append('name', 'PII Test Project');
      formData.append('description', 'Testing PII detection');
      formData.append('questions', JSON.stringify(['What patterns exist?']));
      
      const response = await fetch('http://localhost:5000/api/projects/upload', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.requiresPIIDecision && result.piiResult) {
          this.addResult('PII Detection', 'PASSED', `Detected ${result.piiResult.detectedPII.length} PII columns`);
        } else {
          this.addResult('PII Detection', 'FAILED', 'PII not detected properly');
        }
      } else {
        this.addResult('PII Detection', 'FAILED', `HTTP ${response.status}`);
      }
      
      // Cleanup
      fs.unlinkSync('test_pii_data.csv');
      
    } catch (error) {
      this.addResult('PII Detection', 'FAILED', error.message);
    }
  }

  async testUploadModalIntegration() {
    try {
      // Check if upload modal files exist
      const uploadModalPath = path.join(__dirname, 'client', 'src', 'components', 'upload-modal.tsx');
      const piiDialogPath = path.join(__dirname, 'client', 'src', 'components', 'PIIInterimDialog.tsx');
      
      if (fs.existsSync(uploadModalPath) && fs.existsSync(piiDialogPath)) {
        this.addResult('Upload Modal Integration', 'PASSED', 'Components exist');
      } else {
        this.addResult('Upload Modal Integration', 'FAILED', 'Components missing');
      }
    } catch (error) {
      this.addResult('Upload Modal Integration', 'FAILED', error.message);
    }
  }

  async testPIIDecisionEndpoint() {
    try {
      // Test with missing file (should fail gracefully)
      const response = await fetch('http://localhost:5000/api/pii-decision', {
        method: 'POST',
        body: new FormData()
      });
      
      if (response.status === 400) {
        this.addResult('PII Decision Endpoint', 'PASSED', 'Endpoint handles missing file correctly');
      } else {
        this.addResult('PII Decision Endpoint', 'FAILED', `Unexpected response: ${response.status}`);
      }
    } catch (error) {
      this.addResult('PII Decision Endpoint', 'FAILED', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
    console.log(`[${status}] ${testName}: ${message}`);
  }

  async generateReport() {
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    
    console.log('\n=== PII Workflow Test Report ===');
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results.filter(r => r.status === 'FAILED').forEach(r => {
        console.log(`- ${r.testName}: ${r.message}`);
      });
    }
    
    // Save results
    fs.writeFileSync('pii-workflow-test-results.json', JSON.stringify(this.results, null, 2));
  }
}

// Run the test
const tester = new PIIWorkflowTester();
tester.runTest().catch(console.error);