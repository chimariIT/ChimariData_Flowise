/**
 * Comprehensive Regression Test Suite
 * Tests all core functionality including authentication, uploads, AI features, and navigation
 */

import fs from 'fs';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class ComprehensiveRegressionTester {
  constructor() {
    this.testResults = [];
    this.authToken = null;
    this.testUser = {
      username: `test_user_${Date.now()}`,
      password: 'testpassword123'
    };
  }

  async runAllTests() {
    console.log('🧪 Starting Comprehensive Regression Testing...\n');
    
    try {
      await this.testServerConnection();
      await this.testUserRegistration();
      await this.testUserLogin();
      await this.testDemoPageAccess();
      await this.testAuthenticatedRoutes();
      await this.testFileUploadEndpoint();
      await this.testProjectManagement();
      await this.testAIIntegrations();
      await this.testLogoutFunctionality();
      await this.testFrontendRouting();
      
      await this.generateFinalReport();
    } catch (error) {
      console.error('Critical test failure:', error.message);
      this.addResult('Test Suite Execution', 'CRITICAL_FAILURE', error.message);
    }
  }

  async testServerConnection() {
    console.log('Testing server connectivity...');
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.status === 404) {
        // Health endpoint doesn't exist, try root
        const rootResponse = await fetch(BASE_URL);
        if (rootResponse.ok) {
          this.addResult('Server Connection', 'PASS', 'Server accessible via root endpoint');
          console.log('✓ Server accessible');
        } else {
          this.addResult('Server Connection', 'FAIL', `Root endpoint returned ${rootResponse.status}`);
        }
      } else if (response.ok) {
        this.addResult('Server Connection', 'PASS', 'Health endpoint accessible');
        console.log('✓ Health endpoint working');
      }
    } catch (error) {
      this.addResult('Server Connection', 'FAIL', `Connection error: ${error.message}`);
    }
  }

  async testUserRegistration() {
    console.log('Testing user registration...');
    try {
      const response = await fetch(`${BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        this.addResult('User Registration', 'PASS', 'User registered successfully');
        console.log('✓ User registration working');
      } else if (response.status === 409) {
        this.addResult('User Registration', 'PASS', 'Duplicate user handling working');
        console.log('✓ Duplicate user properly handled');
      } else {
        const errorText = await response.text();
        this.addResult('User Registration', 'FAIL', `Registration failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', `Registration error: ${error.message}`);
    }
  }

  async testUserLogin() {
    console.log('Testing user login...');
    try {
      const response = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        this.authToken = data.token;
        this.addResult('User Login', 'PASS', 'Login successful with token');
        console.log('✓ User login working');
      } else {
        const errorText = await response.text();
        this.addResult('User Login', 'FAIL', `Login failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', `Login error: ${error.message}`);
    }
  }

  async testDemoPageAccess() {
    console.log('Testing demo page accessibility...');
    try {
      const response = await fetch(`${BASE_URL}/demo`);
      if (response.ok) {
        const html = await response.text();
        if (html.includes('ChimariData') || html.includes('demo')) {
          this.addResult('Demo Page Access', 'PASS', 'Demo page accessible');
          console.log('✓ Demo page accessible');
        } else {
          this.addResult('Demo Page Access', 'PARTIAL', 'Demo page returns content but may need verification');
        }
      } else {
        this.addResult('Demo Page Access', 'FAIL', `Demo page not accessible: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Demo Page Access', 'FAIL', `Demo access error: ${error.message}`);
    }
  }

  async testAuthenticatedRoutes() {
    console.log('Testing authenticated routes...');
    const protectedRoutes = ['/api/projects', '/api/user'];
    
    for (const route of protectedRoutes) {
      try {
        // Test without auth
        const unauthResponse = await fetch(`${BASE_URL}${route}`);
        
        // Test with auth
        const authHeaders = this.authToken ? 
          { 'Authorization': `Bearer ${this.authToken}` } : {};
        
        const authResponse = await fetch(`${BASE_URL}${route}`, {
          headers: authHeaders
        });

        if (unauthResponse.status === 401 || unauthResponse.status === 403) {
          this.addResult(`Auth Protection ${route}`, 'PASS', 'Route properly protected');
          console.log(`✓ ${route} properly protected`);
        } else {
          this.addResult(`Auth Protection ${route}`, 'WARN', 'Route may not be properly protected');
        }
      } catch (error) {
        this.addResult(`Auth Protection ${route}`, 'FAIL', `Route test error: ${error.message}`);
      }
    }
  }

  async testFileUploadEndpoint() {
    console.log('Testing file upload functionality...');
    if (!this.authToken) {
      this.addResult('File Upload', 'SKIP', 'No auth token available');
      return;
    }

    try {
      // Create test CSV data
      const testCsv = 'name,value,category\nTest1,100,A\nTest2,200,B\nTest3,150,A';
      const formData = new FormData();
      formData.append('file', new Blob([testCsv], { type: 'text/csv' }), 'test.csv');
      formData.append('name', `test_project_${Date.now()}`);

      const response = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        body: formData
      });

      if (response.ok) {
        this.addResult('File Upload', 'PASS', 'File upload working');
        console.log('✓ File upload working');
      } else {
        const errorText = await response.text();
        this.addResult('File Upload', 'FAIL', `Upload failed: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      this.addResult('File Upload', 'FAIL', `Upload error: ${error.message}`);
    }
  }

  async testProjectManagement() {
    console.log('Testing project management...');
    if (!this.authToken) {
      this.addResult('Project Management', 'SKIP', 'No auth token available');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/projects`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.ok) {
        const projects = await response.json();
        this.addResult('Project Listing', 'PASS', `Retrieved ${projects.length || 0} projects`);
        console.log('✓ Project listing working');
      } else {
        this.addResult('Project Listing', 'FAIL', `Project listing failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Project Management', 'FAIL', `Project management error: ${error.message}`);
    }
  }

  async testAIIntegrations() {
    console.log('Testing AI service integrations...');
    try {
      // Test AI providers endpoint
      const response = await fetch(`${BASE_URL}/api/ai/providers`);
      if (response.ok) {
        const providers = await response.json();
        this.addResult('AI Providers', 'PASS', `${providers.length || 0} AI providers available`);
        console.log('✓ AI providers endpoint working');
      } else {
        this.addResult('AI Providers', 'FAIL', `AI providers failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('AI Integrations', 'FAIL', `AI integration error: ${error.message}`);
    }
  }

  async testLogoutFunctionality() {
    console.log('Testing logout functionality...');
    try {
      const response = await fetch(`${BASE_URL}/logout`, {
        method: 'POST',
        headers: this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {}
      });

      if (response.ok || response.status === 302) {
        this.addResult('Logout', 'PASS', 'Logout endpoint accessible');
        console.log('✓ Logout working');
      } else {
        this.addResult('Logout', 'FAIL', `Logout failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Logout', 'FAIL', `Logout error: ${error.message}`);
    }
  }

  async testFrontendRouting() {
    console.log('Testing frontend routing...');
    const routes = ['/', '/demo', '/auth'];
    
    for (const route of routes) {
      try {
        const response = await fetch(`${BASE_URL}${route}`);
        if (response.ok) {
          const html = await response.text();
          if (html.includes('<!DOCTYPE html>')) {
            this.addResult(`Frontend Route ${route}`, 'PASS', 'Route returns HTML');
            console.log(`✓ Route ${route} accessible`);
          } else {
            this.addResult(`Frontend Route ${route}`, 'WARN', 'Route accessible but content unclear');
          }
        } else {
          this.addResult(`Frontend Route ${route}`, 'FAIL', `Route failed: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Frontend Route ${route}`, 'FAIL', `Route error: ${error.message}`);
      }
    }
  }

  addResult(testName, status, message) {
    this.testResults.push({
      test: testName,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  }

  async generateFinalReport() {
    console.log('\n' + '='.repeat(70));
    console.log('COMPREHENSIVE REGRESSION TEST RESULTS');
    console.log('='.repeat(70));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const warnings = this.testResults.filter(r => r.status === 'WARN').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
    const critical = this.testResults.filter(r => r.status === 'CRITICAL_FAILURE').length;

    console.log(`\nSummary: ${passed} passed, ${failed} failed, ${warnings} warnings, ${skipped} skipped, ${critical} critical\n`);

    if (critical > 0) {
      console.log('🚨 CRITICAL FAILURES:');
      this.testResults.filter(r => r.status === 'CRITICAL_FAILURE').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    if (failed > 0) {
      console.log('❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    if (warnings > 0) {
      console.log('⚠️ WARNINGS:');
      this.testResults.filter(r => r.status === 'WARN').forEach(result => {
        console.log(`  ⚠️ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    console.log('✅ PASSED TESTS:');
    this.testResults.filter(r => r.status === 'PASS').forEach(result => {
      console.log(`  ✓ ${result.test}: ${result.message}`);
    });

    // Save detailed report
    const reportData = {
      summary: { passed, failed, warnings, skipped, critical },
      timestamp: new Date().toISOString(),
      results: this.testResults
    };

    fs.writeFileSync('comprehensive-test-results.json', JSON.stringify(reportData, null, 2));
    console.log('\nDetailed report saved to comprehensive-test-results.json');

    // Overall assessment
    if (critical > 0) {
      console.log('\n🚨 CRITICAL ISSUES DETECTED - Immediate attention required');
    } else if (failed > 0) {
      console.log('\n⚠️ ISSUES DETECTED - Some functionality may not work properly');
    } else if (warnings > 0) {
      console.log('\n✅ MOSTLY WORKING - Minor issues detected');
    } else {
      console.log('\n🎉 ALL TESTS PASSED - System functioning properly');
    }
  }
}

// Run the tests
const tester = new ComprehensiveRegressionTester();
tester.runAllTests().catch(console.error);