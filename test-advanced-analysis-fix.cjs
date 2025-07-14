/**
 * Test Advanced Analysis Fix
 * Verifies that the "Project not found" error has been resolved
 */

class AdvancedAnalysisFixTester {
  constructor() {
    this.results = [];
    this.baseUrl = 'http://localhost:5000';
  }

  async runTest() {
    console.log('🧪 Testing Advanced Analysis Fix...\n');
    
    try {
      // Test 1: Register a test user
      await this.testUserRegistration();
      
      // Test 2: Login to get authentication
      await this.testUserLogin();
      
      // Test 3: Create a test project
      await this.testProjectCreation();
      
      // Test 4: Test project retrieval
      await this.testProjectRetrieval();
      
      // Test 5: Test advanced analysis endpoint
      await this.testAdvancedAnalysisEndpoint();
      
      await this.generateReport();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.addResult('Test Execution', 'FAIL', error.message);
      await this.generateReport();
    }
  }

  async testUserRegistration() {
    try {
      const response = await fetch(`${this.baseUrl}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User'
        })
      });

      const result = await response.json();
      
      if (response.ok || result.error?.includes('already exists')) {
        this.addResult('User Registration', 'PASS', 'User registration successful or user already exists');
      } else {
        this.addResult('User Registration', 'FAIL', result.error || 'Registration failed');
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', error.message);
    }
  }

  async testUserLogin() {
    try {
      const response = await fetch(`${this.baseUrl}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123'
        }),
        credentials: 'include'
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        this.addResult('User Login', 'PASS', 'Login successful');
        this.sessionCookie = response.headers.get('set-cookie');
      } else {
        this.addResult('User Login', 'FAIL', result.error || 'Login failed');
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', error.message);
    }
  }

  async testProjectCreation() {
    try {
      // Create a simple CSV file for testing
      const csvContent = 'name,age,department\nJohn,30,Engineering\nJane,25,Marketing\nBob,35,Sales';
      const formData = new FormData();
      const blob = new Blob([csvContent], { type: 'text/csv' });
      formData.append('file', blob, 'test-data.csv');
      formData.append('name', 'Test Project');
      formData.append('description', 'Test project for advanced analysis');

      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        this.testProjectId = result.projectId;
        this.addResult('Project Creation', 'PASS', `Project created with ID: ${this.testProjectId}`);
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
        question: "What are the patterns in the employee data?",
        analysisType: "descriptive",
        analysisPath: "statistical",
        targetVariable: "age",
        multivariateVariables: ["department"],
        alpha: "0.05",
        assumptions: true
      };

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
        console.log('✅ Analysis Result:', JSON.stringify(result.result, null, 2));
      } else {
        this.addResult('Advanced Analysis', 'FAIL', result.error || 'Advanced analysis failed');
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
    console.log('\n📊 TEST REPORT - Advanced Analysis Fix');
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
      console.log('\n🎉 All tests passed! Advanced analysis fix is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Please check the issues above.');
    }
    
    // Save detailed results
    const fs = require('fs');
    const reportData = {
      testSuite: 'Advanced Analysis Fix',
      timestamp: new Date().toISOString(),
      summary: { passed, failed, skipped },
      results: this.results,
      projectId: this.testProjectId || 'Not created'
    };
    
    fs.writeFileSync(
      'advanced-analysis-fix-test-results.json',
      JSON.stringify(reportData, null, 2)
    );
    
    console.log('\n📄 Detailed results saved to: advanced-analysis-fix-test-results.json');
  }
}

// Run the test
async function runTest() {
  const tester = new AdvancedAnalysisFixTester();
  await tester.runTest();
}

if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = { AdvancedAnalysisFixTester };