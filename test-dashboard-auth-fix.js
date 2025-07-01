/**
 * Test Dashboard Authentication Fix
 * Verifies that AI insights buttons work after upload
 */

import fs from 'fs';

class DashboardAuthFixTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
    this.testProjectId = null;
  }

  async runTest() {
    console.log('🔍 Testing Dashboard Authentication Fix...\n');
    
    try {
      await this.testUserLogin();
      await this.testProjectUpload();
      await this.testAIInsightsAccess();
      await this.testAIChatAccess();
      
      await this.generateReport();
    } catch (error) {
      console.error('Test execution failed:', error);
      this.addResult('Test Execution', 'FAIL', `Critical error: ${error.message}`);
      await this.generateReport();
    }
  }

  async testUserLogin() {
    console.log('🔐 Testing user authentication...');
    try {
      // Try to register/login
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'authtest@example.com',
          email: 'authtest@example.com',
          password: 'password123'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.authToken = result.token;
        this.addResult('User Authentication', 'PASS', 'User authenticated successfully');
        console.log('✅ User authenticated');
      } else {
        throw new Error(`Authentication failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Authentication', 'FAIL', `Authentication error: ${error.message}`);
      throw error;
    }
  }

  async testProjectUpload() {
    console.log('📄 Testing project upload...');
    try {
      const testData = `name,value,category\nAlice,100,A\nBob,200,B\nCharlie,150,A`;

      const formData = new FormData();
      const blob = new Blob([testData], { type: 'text/csv' });
      formData.append('file', blob, 'auth_test.csv');
      formData.append('name', 'Dashboard Auth Test Project');
      formData.append('questions', JSON.stringify(['What are the key insights?']));

      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        this.testProjectId = result.project?.id;
        this.addResult('Project Upload', 'PASS', 'Project uploaded successfully');
        console.log('✅ Project uploaded with ID:', this.testProjectId);
      } else {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      this.addResult('Project Upload', 'FAIL', `Upload error: ${error.message}`);
      throw error;
    }
  }

  async testAIInsightsAccess() {
    console.log('🧠 Testing AI Insights access...');
    try {
      if (!this.testProjectId) {
        throw new Error('No project ID available for testing');
      }

      const response = await fetch(`${this.baseUrl}/api/ai/insights`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectId: this.testProjectId })
      });

      if (response.ok) {
        this.addResult('AI Insights Access', 'PASS', 'AI Insights endpoint accessible with auth');
        console.log('✅ AI Insights working with authentication');
      } else if (response.status === 401) {
        this.addResult('AI Insights Access', 'FAIL', 'Authentication still failing for AI insights');
        console.log('❌ AI Insights still showing 401 error');
      } else {
        this.addResult('AI Insights Access', 'WARN', `Unexpected response: ${response.status}`);
        console.log('⚠️ AI Insights returned unexpected status:', response.status);
      }
    } catch (error) {
      this.addResult('AI Insights Access', 'FAIL', `AI Insights error: ${error.message}`);
      console.log('❌ AI Insights test failed');
    }
  }

  async testAIChatAccess() {
    console.log('💬 Testing AI Chat access...');
    try {
      if (!this.testProjectId) {
        throw new Error('No project ID available for testing');
      }

      const response = await fetch(`${this.baseUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          projectId: this.testProjectId,
          message: 'What insights can you provide about this data?'
        })
      });

      if (response.ok) {
        this.addResult('AI Chat Access', 'PASS', 'AI Chat endpoint accessible with auth');
        console.log('✅ AI Chat working with authentication');
      } else if (response.status === 401) {
        this.addResult('AI Chat Access', 'FAIL', 'Authentication still failing for AI chat');
        console.log('❌ AI Chat still showing 401 error');
      } else {
        this.addResult('AI Chat Access', 'WARN', `Unexpected response: ${response.status}`);
        console.log('⚠️ AI Chat returned unexpected status:', response.status);
      }
    } catch (error) {
      this.addResult('AI Chat Access', 'FAIL', `AI Chat error: ${error.message}`);
      console.log('❌ AI Chat test failed');
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
    console.log('\n📊 DASHBOARD AUTHENTICATION FIX RESULTS');
    console.log('=' * 50);
    
    const statusCounts = {
      PASS: this.results.filter(r => r.status === 'PASS').length,
      FAIL: this.results.filter(r => r.status === 'FAIL').length,
      WARN: this.results.filter(r => r.status === 'WARN').length
    };

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });

    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${statusCounts.PASS}`);
    console.log(`❌ Failed: ${statusCounts.FAIL}`);
    console.log(`⚠️ Warnings: ${statusCounts.WARN}`);

    // Overall status
    if (statusCounts.FAIL === 0 && statusCounts.PASS >= 3) {
      console.log('\n🎉 OVERALL STATUS: AUTHENTICATION FIX SUCCESSFUL');
      console.log('Dashboard buttons should now work properly after upload!');
    } else if (statusCounts.FAIL > 0) {
      console.log('\n🚨 OVERALL STATUS: AUTHENTICATION ISSUES REMAIN');
      console.log('Some dashboard features still have authentication problems.');
    } else {
      console.log('\n❓ OVERALL STATUS: INCONCLUSIVE');
      console.log('Unable to fully verify the authentication fix.');
    }

    // Save results
    const reportData = {
      testSuite: 'Dashboard Authentication Fix Test',
      timestamp: new Date().toISOString(),
      summary: statusCounts,
      results: this.results,
      authTokenUsed: this.authToken ? 'Present' : 'Missing',
      projectId: this.testProjectId
    };

    try {
      fs.writeFileSync('dashboard-auth-fix-results.json', JSON.stringify(reportData, null, 2));
      console.log('\n📝 Detailed results saved to dashboard-auth-fix-results.json');
    } catch (error) {
      console.log('⚠️ Could not save detailed results:', error.message);
    }
  }
}

// Run the test
const tester = new DashboardAuthFixTester();
tester.runTest().catch(console.error);