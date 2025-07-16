/**
 * Test Free Trial Upload Fix
 * Verifies that the simplified trial upload works without authentication
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TrialUploadTester {
  constructor() {
    this.baseUrl = 'http://localhost:3000';
    this.results = [];
  }

  async runTest() {
    console.log('🔍 Testing Free Trial Upload Fix...\n');
    
    try {
      await this.testTrialUploadEndpoint();
      await this.testTrialPIIDecisionEndpoint();
      await this.testTrialAnalyzerSimplified();
      await this.generateReport();
    } catch (error) {
      console.error('Test suite failed:', error);
      this.addResult('Test Suite', 'FAILED', error.message);
      await this.generateReport();
    }
  }

  async testTrialUploadEndpoint() {
    console.log('Testing trial upload endpoint...');
    
    try {
      // Create a test CSV file
      const testCsvContent = `Name,Age,Email,City
John Doe,25,john@example.com,New York
Jane Smith,30,jane@example.com,Los Angeles
Bob Johnson,35,bob@example.com,Chicago`;
      
      const testFilePath = path.join(__dirname, 'test-trial-data.csv');
      fs.writeFileSync(testFilePath, testCsvContent);
      
      // Test trial upload
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', fs.createReadStream(testFilePath));
      
      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: form
      });
      
      const result = await response.json();
      
      if (result.success || result.requiresPIIDecision) {
        this.addResult('Trial Upload', 'PASSED', 'Upload successful or PII decision required');
      } else {
        this.addResult('Trial Upload', 'FAILED', `Upload failed: ${result.error}`);
      }
      
      // Clean up
      fs.unlinkSync(testFilePath);
      
    } catch (error) {
      this.addResult('Trial Upload', 'FAILED', error.message);
    }
  }

  async testTrialPIIDecisionEndpoint() {
    console.log('Testing trial PII decision endpoint...');
    
    try {
      // Test with a simple "include" decision
      const response = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempFileId: 'test_temp_123',
          decision: 'include'
        })
      });
      
      const result = await response.json();
      
      if (response.status === 400 && result.error && result.error.includes('Temporary file data not found')) {
        this.addResult('Trial PII Decision', 'PASSED', 'Endpoint correctly handles missing temp data');
      } else {
        this.addResult('Trial PII Decision', 'FAILED', 'Unexpected response format');
      }
      
    } catch (error) {
      this.addResult('Trial PII Decision', 'FAILED', error.message);
    }
  }

  async testTrialAnalyzerSimplified() {
    console.log('Testing simplified trial analyzer...');
    
    try {
      // Test that the Python script exists and has the right structure
      const analyzerPath = path.join(__dirname, 'python_scripts', 'trial_analyzer.py');
      
      if (fs.existsSync(analyzerPath)) {
        const content = fs.readFileSync(analyzerPath, 'utf8');
        
        // Check for simplified analysis
        if (content.includes('BASIC descriptive analysis for free trial') &&
            content.includes('Only create 2 basic visualizations for free trial') &&
            content.includes("viz_types = ['distribution_overview', 'categorical_counts']")) {
          this.addResult('Trial Analyzer Simplified', 'PASSED', 'Analyzer correctly limited to basic features');
        } else {
          this.addResult('Trial Analyzer Simplified', 'FAILED', 'Analyzer not properly simplified');
        }
      } else {
        this.addResult('Trial Analyzer Simplified', 'FAILED', 'Trial analyzer script not found');
      }
      
    } catch (error) {
      this.addResult('Trial Analyzer Simplified', 'FAILED', error.message);
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
    console.log('\n📊 TEST RESULTS:');
    console.log('='.repeat(60));
    
    let passed = 0;
    let failed = 0;
    
    this.results.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      console.log(`   ${result.message}`);
      console.log('');
      
      if (result.status === 'PASSED') passed++;
      else failed++;
    });
    
    console.log('='.repeat(60));
    console.log(`📈 SUMMARY: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 All tests passed! Free trial upload is working correctly.');
    } else {
      console.log('⚠️  Some tests failed. Check the issues above.');
    }
    
    // Save results to file
    const reportData = {
      summary: {
        passed,
        failed,
        total: this.results.length
      },
      results: this.results,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('trial-upload-fix-results.json', JSON.stringify(reportData, null, 2));
  }
}

async function runTest() {
  const tester = new TrialUploadTester();
  await tester.runTest();
}

// Run the test
runTest().catch(console.error);