/**
 * Test PII Interim Dialog Integration
 * Verifies the complete PII detection and interim decision workflow
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class PIIInterimDialogTester {
  constructor() {
    this.results = [];
    this.testFilePath = 'test_pii_data.csv';
    this.createTestFile();
  }

  createTestFile() {
    // Create test CSV with PII data
    const testData = [
      'name,email,phone,address,ssn,age,city',
      'John Doe,john@example.com,555-123-4567,123 Main St,123-45-6789,30,New York',
      'Jane Smith,jane@example.com,555-987-6543,456 Oak Ave,987-65-4321,25,Los Angeles',
      'Bob Johnson,bob@example.com,555-555-5555,789 Pine Rd,555-55-5555,35,Chicago'
    ].join('\n');
    
    fs.writeFileSync(this.testFilePath, testData);
    console.log('✓ Created test file with PII data');
  }

  async runTests() {
    console.log('🧪 Testing PII Interim Dialog Integration');
    console.log('=' .repeat(50));

    try {
      await this.testPIIDetectionTrigger();
      await this.testPIIInterimResponse();
      await this.testPIIDecisionEndpoint();
      await this.testWorkflowIntegration();
      await this.generateReport();
    } catch (error) {
      console.error('❌ Test execution failed:', error);
      this.addResult('Test Execution', 'FAIL', error.message);
    } finally {
      this.cleanup();
    }
  }

  async testPIIDetectionTrigger() {
    console.log('🔍 Testing PII detection trigger...');
    
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(this.testFilePath));
      formData.append('name', 'PII Test Project');
      formData.append('description', 'Testing PII detection workflow');
      formData.append('questions', JSON.stringify(['What patterns do you see?']));

      const response = await fetch(`${BASE_URL}/api/projects/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.requiresPIIDecision && result.piiResult) {
        this.addResult('PII Detection Trigger', 'PASS', 'PII detection triggered successfully');
        console.log('✓ PII detection triggered correctly');
        
        // Verify PII result structure
        if (result.piiResult.detectedPII && result.piiResult.columnAnalysis) {
          this.addResult('PII Result Structure', 'PASS', 'PII result has correct structure');
          console.log('✓ PII result structure is correct');
        } else {
          this.addResult('PII Result Structure', 'FAIL', 'PII result missing required fields');
          console.log('❌ PII result structure is incorrect');
        }
        
        return result;
      } else {
        this.addResult('PII Detection Trigger', 'FAIL', 'PII detection did not trigger');
        console.log('❌ PII detection did not trigger');
        return null;
      }
    } catch (error) {
      this.addResult('PII Detection Trigger', 'FAIL', `Error: ${error.message}`);
      console.log('❌ PII detection trigger failed');
      return null;
    }
  }

  async testPIIInterimResponse() {
    console.log('🔍 Testing PII interim response format...');
    
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(this.testFilePath));
      formData.append('name', 'PII Response Test');
      formData.append('description', 'Testing interim response');

      const response = await fetch(`${BASE_URL}/api/projects/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.requiresPIIDecision) {
        // Check required fields for interim dialog
        const requiredFields = ['piiResult', 'tempFileId', 'name', 'sampleData'];
        const missingFields = requiredFields.filter(field => !result[field]);
        
        if (missingFields.length === 0) {
          this.addResult('PII Interim Response', 'PASS', 'All required fields present');
          console.log('✓ PII interim response format is correct');
        } else {
          this.addResult('PII Interim Response', 'FAIL', `Missing fields: ${missingFields.join(', ')}`);
          console.log('❌ PII interim response missing fields:', missingFields);
        }
      } else {
        this.addResult('PII Interim Response', 'FAIL', 'PII decision not required');
        console.log('❌ PII interim response not triggered');
      }
    } catch (error) {
      this.addResult('PII Interim Response', 'FAIL', `Error: ${error.message}`);
      console.log('❌ PII interim response test failed');
    }
  }

  async testPIIDecisionEndpoint() {
    console.log('🔍 Testing PII decision endpoint...');
    
    const decisions = ['include', 'exclude', 'anonymize'];
    
    for (const decision of decisions) {
      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(this.testFilePath));
        formData.append('name', `PII Decision Test - ${decision}`);
        formData.append('description', 'Testing PII decision handling');
        formData.append('questions', JSON.stringify(['Test question']));
        formData.append('tempFileId', 'temp_123456');
        formData.append('decision', decision);

        const response = await fetch(`${BASE_URL}/api/pii-decision`, {
          method: 'POST',
          body: formData
        });

        const result = await response.json();
        
        if (result.success && result.projectId) {
          this.addResult(`PII Decision ${decision}`, 'PASS', 'Decision processed successfully');
          console.log(`✓ PII decision '${decision}' processed correctly`);
        } else {
          this.addResult(`PII Decision ${decision}`, 'FAIL', result.error || 'Unknown error');
          console.log(`❌ PII decision '${decision}' failed`);
        }
      } catch (error) {
        this.addResult(`PII Decision ${decision}`, 'FAIL', `Error: ${error.message}`);
        console.log(`❌ PII decision '${decision}' test failed`);
      }
    }
  }

  async testWorkflowIntegration() {
    console.log('🔍 Testing complete workflow integration...');
    
    try {
      // Step 1: Upload file and get PII detection
      const formData1 = new FormData();
      formData1.append('file', fs.createReadStream(this.testFilePath));
      formData1.append('name', 'Workflow Integration Test');
      formData1.append('description', 'Testing complete workflow');
      formData1.append('questions', JSON.stringify(['What insights can you provide?']));

      const response1 = await fetch(`${BASE_URL}/api/projects/upload`, {
        method: 'POST',
        body: formData1
      });

      const result1 = await response1.json();
      
      if (result1.requiresPIIDecision) {
        // Step 2: Make PII decision
        const formData2 = new FormData();
        formData2.append('file', fs.createReadStream(this.testFilePath));
        formData2.append('name', result1.name);
        formData2.append('description', 'Workflow test');
        formData2.append('questions', JSON.stringify(['Test question']));
        formData2.append('tempFileId', result1.tempFileId);
        formData2.append('decision', 'anonymize');

        const response2 = await fetch(`${BASE_URL}/api/pii-decision`, {
          method: 'POST',
          body: formData2
        });

        const result2 = await response2.json();
        
        if (result2.success && result2.projectId) {
          this.addResult('Workflow Integration', 'PASS', 'Complete workflow successful');
          console.log('✓ Complete workflow integration successful');
        } else {
          this.addResult('Workflow Integration', 'FAIL', 'Final project creation failed');
          console.log('❌ Complete workflow integration failed at final step');
        }
      } else {
        this.addResult('Workflow Integration', 'FAIL', 'PII detection not triggered');
        console.log('❌ Complete workflow integration failed - no PII detection');
      }
    } catch (error) {
      this.addResult('Workflow Integration', 'FAIL', `Error: ${error.message}`);
      console.log('❌ Workflow integration test failed');
    }
  }

  addResult(testName, status, message) {
    this.results.push({
      test: testName,
      status: status,
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  async generateReport() {
    console.log('\n📊 PII Interim Dialog Test Results');
    console.log('=' .repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARN').length;
    
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Warnings: ${warnings}`);
    console.log(`Success Rate: ${Math.round(passed / this.results.length * 100)}%`);
    
    console.log('\nDetailed Results:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });
    
    // Save report
    const report = {
      summary: {
        total: this.results.length,
        passed: passed,
        failed: failed,
        warnings: warnings,
        successRate: Math.round(passed / this.results.length * 100)
      },
      results: this.results,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('pii-interim-dialog-test-results.json', JSON.stringify(report, null, 2));
    console.log('\n📝 Report saved to pii-interim-dialog-test-results.json');
  }

  cleanup() {
    try {
      if (fs.existsSync(this.testFilePath)) {
        fs.unlinkSync(this.testFilePath);
        console.log('✓ Test file cleaned up');
      }
    } catch (error) {
      console.log('⚠️ Failed to cleanup test file:', error.message);
    }
  }
}

// Run tests
const tester = new PIIInterimDialogTester();
tester.runTests();