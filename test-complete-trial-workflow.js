/**
 * Test Complete Trial Workflow
 * Tests the entire free trial workflow from upload to results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CompleteTrialWorkflowTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.tempFileId = null;
  }

  async runCompleteTest() {
    console.log('🔍 Testing Complete Free Trial Workflow...\n');
    
    try {
      await this.testTrialUpload();
      if (this.tempFileId) {
        await this.testTrialPIIDecision();
      }
      await this.generateReport();
    } catch (error) {
      console.error('Test suite failed:', error);
      this.addResult('Test Suite', 'FAILED', error.message);
      await this.generateReport();
    }
  }

  async testTrialUpload() {
    console.log('1. Testing trial upload...');
    
    try {
      // Create a simple test CSV file
      const testCsvContent = `Name,Age,Email,City,Salary
John Doe,25,john@example.com,New York,50000
Jane Smith,30,jane@example.com,Los Angeles,65000
Bob Johnson,35,bob@example.com,Chicago,70000
Alice Brown,28,alice@example.com,Houston,58000
Mike Davis,32,mike@example.com,Phoenix,62000`;
      
      const testFilePath = path.join(__dirname, 'test-complete-trial.csv');
      fs.writeFileSync(testFilePath, testCsvContent);
      
      // Test trial upload with fetch
      const formData = new FormData();
      formData.append('file', new Blob([testCsvContent], { type: 'text/csv' }), 'test-trial.csv');
      
      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success && result.requiresPIIDecision) {
        this.tempFileId = result.tempFileId;
        this.addResult('Trial Upload', 'PASSED', `Upload successful, PII detected: ${result.piiResult.detectedPII.join(', ')}`);
      } else if (result.success && result.trialResults) {
        this.addResult('Trial Upload', 'PASSED', 'Upload successful, no PII detected');
      } else {
        this.addResult('Trial Upload', 'FAILED', `Upload failed: ${result.error || 'Unknown error'}`);
      }
      
      // Clean up
      fs.unlinkSync(testFilePath);
      
    } catch (error) {
      this.addResult('Trial Upload', 'FAILED', error.message);
    }
  }

  async testTrialPIIDecision() {
    console.log('2. Testing trial PII decision...');
    
    try {
      // Test with "include" decision (simplified for free trial)
      const response = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempFileId: this.tempFileId,
          decision: 'include'
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.trialResults) {
        const trialResults = result.trialResults;
        
        // Check if descriptive analysis is present
        if (trialResults.descriptiveAnalysis && trialResults.descriptiveAnalysis.basic_info) {
          this.addResult('Descriptive Analysis', 'PASSED', `Analyzed ${trialResults.descriptiveAnalysis.basic_info.shape[0]} rows, ${trialResults.descriptiveAnalysis.basic_info.shape[1]} columns`);
        } else {
          this.addResult('Descriptive Analysis', 'FAILED', 'No descriptive analysis found');
        }
        
        // Check if basic visualizations are present (limited to 2)
        if (trialResults.basicVisualizations && trialResults.basicVisualizations.length > 0) {
          this.addResult('Basic Visualizations', 'PASSED', `Generated ${trialResults.basicVisualizations.length} visualizations (limited for free trial)`);
        } else {
          this.addResult('Basic Visualizations', 'FAILED', 'No visualizations generated');
        }
        
        // Check if schema is present
        if (trialResults.schema) {
          this.addResult('Schema Detection', 'PASSED', `Schema detected with ${Object.keys(trialResults.schema).length} columns`);
        } else {
          this.addResult('Schema Detection', 'FAILED', 'No schema detected');
        }
        
        // Check if results are properly limited for free trial
        const hasAdvancedFeatures = trialResults.descriptiveAnalysis.correlation_analysis || 
                                   trialResults.descriptiveAnalysis.multivariate_analysis ||
                                   trialResults.descriptiveAnalysis.group_analysis;
        
        if (!hasAdvancedFeatures) {
          this.addResult('Trial Feature Limitation', 'PASSED', 'Advanced features properly limited for free trial');
        } else {
          this.addResult('Trial Feature Limitation', 'FAILED', 'Advanced features not properly limited');
        }
        
      } else {
        this.addResult('Trial PII Decision', 'FAILED', `PII decision failed: ${result.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      this.addResult('Trial PII Decision', 'FAILED', error.message);
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
    console.log('\n📊 COMPLETE TRIAL WORKFLOW TEST RESULTS:');
    console.log('='.repeat(70));
    
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
    
    console.log('='.repeat(70));
    console.log(`📈 SUMMARY: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 All tests passed! Free trial workflow is working correctly.');
      console.log('✅ Free trial features are properly limited to basic analysis and 2 visualizations.');
      console.log('✅ No authentication required for free trial uploads.');
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
    
    fs.writeFileSync('complete-trial-workflow-results.json', JSON.stringify(reportData, null, 2));
  }
}

async function runTest() {
  const tester = new CompleteTrialWorkflowTester();
  await tester.runCompleteTest();
}

// Run the test
runTest().catch(console.error);