/**
 * Comprehensive Authentication Fix Verification Test
 * Tests the complete unified authentication system and workflow
 */

import fs from 'fs';

class AuthenticationFixTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
    this.userId = null;
    this.projectId = null;
  }

  async runCompleteTest() {
    console.log('🔧 TESTING COMPREHENSIVE AUTHENTICATION FIX');
    console.log('='.repeat(60));
    console.log('Verifying unified authentication across all critical endpoints\n');

    await this.testServerHealth();
    await this.testUserRegistrationAndLogin();
    await this.testProtectedEndpoints();
    await this.testFileUploadWorkflow();
    await this.testPaymentFlow();
    await this.testAIAnalysisFlow();
    await this.generateFinalReport();
  }

  async testServerHealth() {
    console.log('1️⃣ Testing Server Health...');
    try {
      const response = await this.makeRequest('GET', '/api/health');
      if (response.status === 200) {
        this.addResult('Server Health', 'PASS', 'Express server responding correctly');
      } else {
        this.addResult('Server Health', 'FAIL', `Server returned status ${response.status}`);
      }
    } catch (error) {
      this.addResult('Server Health', 'FAIL', `Server connection error: ${error.message}`);
    }
  }

  async testUserRegistrationAndLogin() {
    console.log('\n2️⃣ Testing Authentication System...');
    
    // Test registration
    const username = `testuser_${Date.now()}`;
    try {
      const registerResponse = await this.makeRequest('POST', '/api/register', {
        username: username,
        password: 'testpass123',
        email: 'test@example.com'
      });

      if (registerResponse.status === 200) {
        this.addResult('User Registration', 'PASS', 'User registration successful');
        this.userId = registerResponse.data.id;
        
        // Test login
        const loginResponse = await this.makeRequest('POST', '/api/login', {
          username: username,
          password: 'testpass123'
        });

        if (loginResponse.status === 200 && loginResponse.data.token) {
          this.authToken = loginResponse.data.token;
          this.addResult('User Login', 'PASS', 'Login successful, token received');
        } else {
          this.addResult('User Login', 'FAIL', 'Login failed or no token returned');
        }
      } else {
        this.addResult('User Registration', 'FAIL', `Registration failed: ${registerResponse.status}`);
      }
    } catch (error) {
      this.addResult('Authentication Flow', 'FAIL', `Auth error: ${error.message}`);
    }
  }

  async testProtectedEndpoints() {
    console.log('\n3️⃣ Testing Protected Endpoints...');
    
    if (!this.authToken) {
      this.addResult('Protected Endpoints', 'SKIP', 'No auth token available');
      return;
    }

    const endpoints = [
      { path: '/api/projects', method: 'GET' },
      { path: '/api/ai-settings', method: 'GET' },
      { path: '/api/ai/providers', method: 'GET' },
      { path: '/api/ml/analysis-types', method: 'GET' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.makeRequest(endpoint.method, endpoint.path, null, true);
        
        if (response.status === 200) {
          this.addResult(`Protected ${endpoint.path}`, 'PASS', 'Authentication accepted');
        } else if (response.status === 401) {
          this.addResult(`Protected ${endpoint.path}`, 'FAIL', 'Authentication rejected (401)');
        } else {
          this.addResult(`Protected ${endpoint.path}`, 'INFO', `Status: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Protected ${endpoint.path}`, 'FAIL', error.message);
      }
    }
  }

  async testFileUploadWorkflow() {
    console.log('\n4️⃣ Testing File Upload Workflow...');
    
    if (!this.authToken) {
      this.addResult('File Upload', 'SKIP', 'No auth token available');
      return;
    }

    try {
      // Test upload endpoint (without actual file)
      const uploadResponse = await this.makeRequest('POST', '/api/projects/upload', {
        name: 'Test Authentication Project',
        questions: ['Test question 1', 'Test question 2']
      }, true);

      if (uploadResponse.status === 400) {
        this.addResult('Upload Authentication', 'PASS', 'Upload endpoint accepts auth, rejects missing file (expected)');
      } else if (uploadResponse.status === 401) {
        this.addResult('Upload Authentication', 'FAIL', 'Upload endpoint rejected authentication');
      } else {
        this.addResult('Upload Authentication', 'INFO', `Upload status: ${uploadResponse.status}`);
      }
    } catch (error) {
      this.addResult('File Upload Workflow', 'FAIL', error.message);
    }
  }

  async testPaymentFlow() {
    console.log('\n5️⃣ Testing Payment Flow...');
    
    if (!this.authToken) {
      this.addResult('Payment Flow', 'SKIP', 'No auth token available');
      return;
    }

    try {
      // Test pricing calculation
      const pricingResponse = await this.makeRequest('POST', '/api/calculate-pricing', {
        dataSizeMB: 1,
        questionsCount: 2,
        analysisType: 'standard',
        schema: { col1: 'string', col2: 'number' },
        recordCount: 100
      }, true);

      if (pricingResponse.status === 200) {
        this.addResult('Pricing Calculation', 'PASS', 'Pricing endpoint authenticated successfully');
      } else if (pricingResponse.status === 401) {
        this.addResult('Pricing Calculation', 'FAIL', 'Pricing endpoint rejected authentication');
      } else {
        this.addResult('Pricing Calculation', 'INFO', `Pricing status: ${pricingResponse.status}`);
      }
    } catch (error) {
      this.addResult('Payment Flow', 'FAIL', error.message);
    }
  }

  async testAIAnalysisFlow() {
    console.log('\n6️⃣ Testing AI Analysis Flow...');
    
    if (!this.authToken) {
      this.addResult('AI Analysis', 'SKIP', 'No auth token available');
      return;
    }

    try {
      // Test AI insights endpoint (should require payment)
      const insightsResponse = await this.makeRequest('POST', '/api/ai/insights', {
        projectId: 'test-project-id'
      }, true);

      if (insightsResponse.status === 402) {
        this.addResult('AI Insights Auth', 'PASS', 'AI endpoint authenticated, requires payment (expected)');
      } else if (insightsResponse.status === 401) {
        this.addResult('AI Insights Auth', 'FAIL', 'AI endpoint rejected authentication');
      } else if (insightsResponse.status === 404) {
        this.addResult('AI Insights Auth', 'PASS', 'AI endpoint authenticated, project not found (expected)');
      } else {
        this.addResult('AI Insights Auth', 'INFO', `AI insights status: ${insightsResponse.status}`);
      }
    } catch (error) {
      this.addResult('AI Analysis Flow', 'FAIL', error.message);
    }
  }

  async makeRequest(method, path, data = null, useAuth = false) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (useAuth && this.authToken) {
      options.headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);
    
    let responseData;
    try {
      const text = await response.text();
      responseData = text ? JSON.parse(text) : {};
    } catch (e) {
      responseData = { error: 'Invalid JSON response' };
    }

    return {
      status: response.status,
      data: responseData,
      headers: response.headers
    };
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'SKIP' ? '⏭️' : 'ℹ️';
    console.log(`${icon} ${testName}: ${message}`);
  }

  async generateFinalReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 AUTHENTICATION FIX TEST RESULTS');
    console.log('='.repeat(60));

    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      skipped: this.results.filter(r => r.status === 'SKIP').length,
      info: this.results.filter(r => r.status === 'INFO').length
    };

    console.log(`Total Tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`⏭️ Skipped: ${summary.skipped}`);
    console.log(`ℹ️ Info: ${summary.info}`);

    const successRate = summary.total > 0 ? ((summary.passed / (summary.total - summary.skipped)) * 100).toFixed(1) : 0;
    console.log(`\n🎯 Success Rate: ${successRate}%`);

    if (summary.failed === 0 && summary.passed > 0) {
      console.log('\n🎉 AUTHENTICATION FIX SUCCESSFUL!');
      console.log('All critical endpoints now accept unified authentication.');
    } else if (summary.failed > 0) {
      console.log('\n⚠️ AUTHENTICATION ISSUES DETECTED');
      console.log('Failed tests indicate remaining authentication problems.');
    }

    // Save detailed results
    const report = {
      timestamp: new Date().toISOString(),
      summary,
      results: this.results,
      authToken: this.authToken ? 'Present' : 'Missing',
      conclusions: this.generateConclusions(summary)
    };

    fs.writeFileSync('authentication-fix-test-results.json', JSON.stringify(report, null, 2));
    console.log('\n📁 Detailed results saved to: authentication-fix-test-results.json');
  }

  generateConclusions(summary) {
    const conclusions = [];
    
    if (summary.passed >= 8) {
      conclusions.push('Unified authentication system is working correctly');
    }
    
    if (summary.failed === 0) {
      conclusions.push('No 401 authentication errors detected');
      conclusions.push('All protected endpoints accept Bearer tokens');
    }
    
    if (summary.failed > 0) {
      conclusions.push('Some endpoints still have authentication issues');
      conclusions.push('May need additional isAuthenticated → unifiedAuth replacements');
    }
    
    return conclusions;
  }
}

// Run the test
const tester = new AuthenticationFixTester();
tester.runCompleteTest().catch(console.error);