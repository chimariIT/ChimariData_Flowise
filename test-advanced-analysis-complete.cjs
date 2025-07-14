/**
 * Complete Advanced Analysis Test
 * Tests the full workflow including PII handling
 */

class CompleteAdvancedAnalysisTest {
  constructor() {
    this.results = [];
    this.baseUrl = 'http://localhost:5000';
    this.cookie = '';
  }

  async runTest() {
    console.log('🧪 Testing Complete Advanced Analysis Workflow...\n');
    
    try {
      // Test 1: Create non-PII data for testing
      await this.testProjectCreationNoPII();
      
      // Test 2: Test project retrieval
      await this.testProjectRetrieval();
      
      // Test 3: Test advanced analysis endpoint
      await this.testAdvancedAnalysisEndpoint();
      
      await this.generateReport();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.addResult('Test Execution', 'FAIL', error.message);
      await this.generateReport();
    }
  }

  async testProjectCreationNoPII() {
    try {
      // Create a simple CSV file without PII for testing
      const csvContent = 'product,price,category\niPhone,999,Electronics\nShirt,29,Clothing\nBook,15,Education';
      const formData = new FormData();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      formData.append('file', blob, 'products.csv');
      formData.append('name', 'Product Analysis Test');
      formData.append('description', 'Test project for advanced analysis without PII');

      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        if (result.requiresPIIDecision) {
          // Handle PII decision - choose to include data
          const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              tempFileId: result.tempFileId,
              decision: 'include',
              name: 'Product Analysis Test',
              description: 'Test project for advanced analysis'
            }),
            credentials: 'include'
          });

          const piiResult = await piiResponse.json();
          
          if (piiResponse.ok && piiResult.success) {
            this.testProjectId = piiResult.projectId;
            this.addResult('Project Creation with PII', 'PASS', `Project created with ID: ${this.testProjectId}`);
          } else {
            this.addResult('Project Creation with PII', 'FAIL', piiResult.error || 'PII decision failed');
          }
        } else {
          this.testProjectId = result.projectId;
          this.addResult('Project Creation', 'PASS', `Project created with ID: ${this.testProjectId}`);
        }
      } else {
        this.addResult('Project Creation', 'FAIL', result.error || 'Project creation failed');
      }
    } catch (error) {
      this.addResult('Project Creation', 'FAIL', error.message);
    }
  }

  async testProjectRetrieval() {
    if (!this.testProjectId) {
      this.addResult('Project Retrieval', 'SKIP', 'No project ID available');
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${this.testProjectId}`, {
        method: 'GET',
        credentials: 'include'
      });

      const result = await response.json();
      
      if (response.ok && result.id) {
        this.addResult('Project Retrieval', 'PASS', `Project retrieved successfully: ${result.name}`);
        this.testProject = result;
        console.log(`📊 Project data: ${result.data?.length || 0} records`);
      } else {
        this.addResult('Project Retrieval', 'FAIL', result.error || 'Project retrieval failed');
      }
    } catch (error) {
      this.addResult('Project Retrieval', 'FAIL', error.message);
    }
  }

  async testAdvancedAnalysisEndpoint() {
    if (!this.testProjectId) {
      this.addResult('Advanced Analysis', 'SKIP', 'No project ID available');
      return;
    }

    try {
      const analysisConfig = {
        question: "What are the patterns in the product data?",
        analysisType: "descriptive",
        analysisPath: "statistical",
        targetVariable: "price",
        multivariateVariables: ["category"],
        alpha: "0.05",
        assumptions: true
      };

      console.log('📊 Testing advanced analysis with config:', analysisConfig);
      console.log('🔍 Using project ID:', this.testProjectId);

      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: this.testProjectId,
          config: analysisConfig
        }),
        credentials: 'include'
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        this.addResult('Advanced Analysis', 'PASS', 'Advanced analysis completed successfully');
        console.log('✅ Analysis Result Summary:');
        console.log(`   - Analysis Type: ${result.result.analysisType}`);
        console.log(`   - Target Variable: ${result.result.targetVariable}`);
        console.log(`   - Status: ${result.result.status}`);
        if (result.result.descriptiveStats) {
          console.log(`   - Descriptive Stats: ${Object.keys(result.result.descriptiveStats).length} variables`);
        }
      } else {
        this.addResult('Advanced Analysis', 'FAIL', result.error || 'Advanced analysis failed');
        console.log('❌ Advanced analysis failed:', result.error);
      }
    } catch (error) {
      this.addResult('Advanced Analysis', 'FAIL', error.message);
    }
  }

  addResult(testName, status, message) {
    const result = {
      test: testName,
      status,
      message,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);
    
    const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${emoji} ${testName}: ${message}`);
  }

  async generateReport() {
    console.log('\n📊 TEST REPORT - Complete Advanced Analysis');
    console.log('=' .repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    
    console.log(`\n📈 Summary:`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${this.results.length}`);
    
    if (failed === 0) {
      console.log('\n🎉 All tests passed! Advanced analysis is working correctly.');
      console.log('✅ The "Project not found" error has been resolved.');
    } else {
      console.log('\n⚠️  Some tests failed. The issue may still exist.');
    }
    
    // Save detailed results
    const fs = require('fs');
    const reportData = {
      testSuite: 'Complete Advanced Analysis Test',
      timestamp: new Date().toISOString(),
      summary: { passed, failed, skipped },
      results: this.results,
      projectId: this.testProjectId || 'Not created',
      fixStatus: failed === 0 ? 'RESOLVED' : 'NEEDS_ATTENTION'
    };
    
    fs.writeFileSync(
      'complete-advanced-analysis-test-results.json',
      JSON.stringify(reportData, null, 2)
    );
    
    console.log('\n📄 Detailed results saved to: complete-advanced-analysis-test-results.json');
  }
}

// Run the test
async function runTest() {
  const tester = new CompleteAdvancedAnalysisTest();
  await tester.runTest();
}

if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { CompleteAdvancedAnalysisTest };