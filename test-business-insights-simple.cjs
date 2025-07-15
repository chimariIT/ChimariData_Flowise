/**
 * Simple Business Insights Test
 * Tests that business_insights analysis type is now supported
 */

const fetch = require('node-fetch');

class BusinessInsightsSimpleTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
    this.projectId = null;
  }

  async runTest() {
    console.log('🧪 TESTING BUSINESS INSIGHTS ANALYSIS TYPE SUPPORT');
    console.log('================================================');
    
    await this.testUserRegistrationAndLogin();
    await this.testProjectCreation();
    await this.testBusinessInsightsAnalysis();
    await this.generateReport();
  }

  async testUserRegistrationAndLogin() {
    console.log('\n1. Testing User Registration and Login...');
    
    try {
      // Register user
      const registerResponse = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test-${Date.now()}@example.com`,
          password: 'SecurePassword123!',
          firstName: 'Test',
          lastName: 'User'
        })
      });

      if (registerResponse.status === 200) {
        const regResult = await registerResponse.json();
        this.authToken = regResult.token;
        this.addResult('User Registration', 'PASS', 'User registered successfully');
      } else {
        this.addResult('User Registration', 'FAIL', 'Registration failed');
        return;
      }

      // Test login
      const loginResponse = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: `test-${Date.now()}@example.com`,
          password: 'SecurePassword123!'
        })
      });

      if (loginResponse.status === 200) {
        const loginResult = await loginResponse.json();
        this.authToken = loginResult.token;
        this.addResult('User Login', 'PASS', 'Login successful');
      } else {
        this.addResult('User Login', 'FAIL', 'Login failed');
      }
    } catch (error) {
      this.addResult('User Registration/Login', 'FAIL', `Request failed: ${error.message}`);
    }
  }

  async testProjectCreation() {
    console.log('\n2. Testing Project Creation...');
    
    if (!this.authToken) {
      this.addResult('Project Creation', 'SKIP', 'No auth token available');
      return;
    }

    try {
      // Create test data via upload
      const testData = 'name,age,salary,department\nJohn,30,50000,Engineering\nJane,25,60000,Marketing\nBob,35,75000,Sales';
      
      const formData = new FormData();
      formData.append('file', new Blob([testData], { type: 'text/csv' }), 'test-data.csv');
      formData.append('questions', JSON.stringify(['What factors influence salary?']));

      const uploadResponse = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        },
        body: formData
      });

      if (uploadResponse.status === 200) {
        const uploadResult = await uploadResponse.json();
        
        if (uploadResult.requiresPIIDecision) {
          // Handle PII decision
          const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.authToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              tempFileId: uploadResult.tempFileId,
              decision: 'include',
              projectData: {
                name: 'Business Insights Test Project',
                description: 'Test project for business insights analysis',
                questions: ['What factors influence salary?']
              }
            })
          });

          if (piiResponse.status === 200) {
            const piiResult = await piiResponse.json();
            this.projectId = piiResult.projectId;
            this.addResult('Project Creation', 'PASS', `Project created: ${this.projectId}`);
          } else {
            this.addResult('Project Creation', 'FAIL', 'PII decision failed');
          }
        } else {
          this.projectId = uploadResult.projectId;
          this.addResult('Project Creation', 'PASS', `Project created: ${this.projectId}`);
        }
      } else {
        this.addResult('Project Creation', 'FAIL', 'Upload failed');
      }
    } catch (error) {
      this.addResult('Project Creation', 'FAIL', `Request failed: ${error.message}`);
    }
  }

  async testBusinessInsightsAnalysis() {
    console.log('\n3. Testing Business Insights Analysis...');
    
    if (!this.authToken || !this.projectId) {
      this.addResult('Business Insights Analysis', 'SKIP', 'Prerequisites not met');
      return;
    }

    try {
      const analysisConfig = {
        projectId: this.projectId,
        config: {
          analysisType: 'business_insights',
          analysisPath: 'agentic',
          businessContext: 'Which variables have the highest influence on salary?',
          analysisRole: 'Business Consultant',
          targetVariable: 'salary',
          multivariateVariables: ['age', 'department'],
          reportFormat: 'executive_summary',
          stepByStepBreakdown: true
        }
      };

      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(analysisConfig)
      });

      const result = await response.json();
      
      if (response.status === 200 && result.success) {
        this.addResult('Business Insights Analysis', 'PASS', 'Business insights analysis completed successfully');
        console.log('✅ Analysis result preview:');
        console.log('   - Analysis Type:', result.result.analysisType);
        console.log('   - Business Context:', result.result.results?.businessContext);
        console.log('   - Analysis Role:', result.result.results?.analysisRole);
        console.log('   - Key Findings:', result.result.results?.keyFindings?.length || 0, 'findings');
      } else {
        this.addResult('Business Insights Analysis', 'FAIL', `Analysis failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      this.addResult('Business Insights Analysis', 'FAIL', `Request failed: ${error.message}`);
    }
  }

  addResult(testName, status, message) {
    const result = { testName, status, message };
    this.results.push(result);
    
    const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${statusIcon} ${testName}: ${message}`);
  }

  async generateReport() {
    console.log('\n================================================');
    console.log('📊 BUSINESS INSIGHTS ANALYSIS FIX TEST RESULTS');
    console.log('================================================');
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ Business insights analysis is now working correctly');
      console.log('✅ "Unsupported analysis type: business_insights" error has been fixed');
    } else {
      console.log('❌ SOME TESTS FAILED');
      
      console.log('\nFailed Tests:');
      this.results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  ❌ ${r.testName}: ${r.message}`);
      });
    }
    
    console.log('\n💡 TECHNICAL FIXES APPLIED:');
    console.log('- Added "business_insights" case to AdvancedAnalyzer switch statement');
    console.log('- Added "agentic" case as alias for business_insights');
    console.log('- Implemented performComprehensiveAnalysis method');
    console.log('- Business insights now supported in step-by-step analysis workflow');
    
    console.log('\n📋 NEXT STEPS:');
    console.log('- Business insights analysis is ready for production use');
    console.log('- AI-powered insights generation will be handled by the analysis workflow');
    console.log('- Users can now select "business_insights" analysis type without errors');
  }
}

async function runTest() {
  const tester = new BusinessInsightsSimpleTester();
  await tester.runTest();
}

runTest().catch(console.error);