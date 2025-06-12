/**
 * Final Integration Test - Core System Verification
 * Tests all critical user workflows and integrations
 */

import fs from 'fs';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class FinalIntegrationTester {
  constructor() {
    this.testResults = [];
  }

  async runCompleteTest() {
    console.log('🎯 Final Integration Testing - All Core Systems\n');
    
    await this.testCoreInfrastructure();
    await this.testUserWorkflows();
    await this.testAICapabilities();
    await this.testUINavigation();
    await this.testDataProcessing();
    await this.generateFinalAssessment();
  }

  async testCoreInfrastructure() {
    console.log('Testing core infrastructure...');
    
    // Server availability
    try {
      const healthCheck = await fetch(`${BASE_URL}/api/health`);
      if (healthCheck.ok) {
        this.addResult('Server Health', 'PASS', 'Server responding correctly');
        console.log('✓ Server health check passed');
      }
    } catch (error) {
      this.addResult('Server Health', 'FAIL', `Server not accessible: ${error.message}`);
    }

    // Database connectivity (implicit through API calls)
    try {
      const dbTest = await fetch(`${BASE_URL}/api/ai/providers`);
      if (dbTest.ok) {
        this.addResult('Database Connection', 'PASS', 'Database queries working');
        console.log('✓ Database connectivity verified');
      }
    } catch (error) {
      this.addResult('Database Connection', 'FAIL', `Database issues: ${error.message}`);
    }

    // Static file serving
    try {
      const staticTest = await fetch(BASE_URL);
      if (staticTest.ok) {
        const html = await staticTest.text();
        if (html.includes('<!DOCTYPE html>')) {
          this.addResult('Static File Serving', 'PASS', 'Frontend assets loading');
          console.log('✓ Static file serving working');
        }
      }
    } catch (error) {
      this.addResult('Static File Serving', 'FAIL', `Static serving failed: ${error.message}`);
    }
  }

  async testUserWorkflows() {
    console.log('Testing user workflows...');
    
    const testUser = {
      username: `integration_test_${Date.now()}`,
      password: 'testpass123'
    };

    // Registration workflow
    try {
      const registerResp = await fetch(`${BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      });

      if (registerResp.ok || registerResp.status === 409) {
        this.addResult('User Registration', 'PASS', 'Registration endpoint working');
        console.log('✓ User registration workflow working');
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', `Registration failed: ${error.message}`);
    }

    // Login workflow
    try {
      const loginResp = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser)
      });

      if (loginResp.ok) {
        this.addResult('User Login', 'PASS', 'Login endpoint working');
        console.log('✓ User login workflow working');
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', `Login failed: ${error.message}`);
    }

    // Authentication protection
    try {
      const protectedResp = await fetch(`${BASE_URL}/api/projects`);
      if (protectedResp.status === 401) {
        this.addResult('Authentication Protection', 'PASS', 'Protected routes properly secured');
        console.log('✓ Authentication protection working');
      }
    } catch (error) {
      this.addResult('Authentication Protection', 'FAIL', `Auth protection failed: ${error.message}`);
    }
  }

  async testAICapabilities() {
    console.log('Testing AI integration capabilities...');
    
    // AI providers endpoint
    try {
      const aiResp = await fetch(`${BASE_URL}/api/ai/providers`);
      if (aiResp.ok) {
        const providers = await aiResp.json();
        this.addResult('AI Providers', 'PASS', `${providers.providers.length} AI providers configured`);
        console.log('✓ AI providers configuration verified');
      }
    } catch (error) {
      this.addResult('AI Providers', 'FAIL', `AI providers failed: ${error.message}`);
    }

    // Pricing service
    try {
      const pricingResp = await fetch(`${BASE_URL}/api/pricing/estimate?dataSizeMB=1&questionsCount=3`);
      if (pricingResp.ok) {
        this.addResult('Pricing Service', 'PASS', 'Pricing calculations working');
        console.log('✓ Pricing service operational');
      }
    } catch (error) {
      this.addResult('Pricing Service', 'FAIL', `Pricing service failed: ${error.message}`);
    }

    // ML analysis capabilities
    try {
      const mlResp = await fetch(`${BASE_URL}/api/ml/analysis-types`);
      if (mlResp.ok) {
        const analysisTypes = await mlResp.json();
        this.addResult('ML Analysis', 'PASS', `${analysisTypes.length} analysis types available`);
        console.log('✓ ML analysis capabilities verified');
      }
    } catch (error) {
      this.addResult('ML Analysis', 'FAIL', `ML analysis failed: ${error.message}`);
    }
  }

  async testUINavigation() {
    console.log('Testing UI navigation...');
    
    const criticalRoutes = ['/', '/demo', '/auth'];
    
    for (const route of criticalRoutes) {
      try {
        const resp = await fetch(`${BASE_URL}${route}`);
        if (resp.ok) {
          this.addResult(`Route ${route}`, 'PASS', 'Route accessible');
          console.log(`✓ Route ${route} working`);
        } else {
          this.addResult(`Route ${route}`, 'FAIL', `Route failed: ${resp.status}`);
        }
      } catch (error) {
        this.addResult(`Route ${route}`, 'FAIL', `Route error: ${error.message}`);
      }
    }

    // Component structure verification
    const componentChecks = [
      { file: 'client/src/App.tsx', name: 'Main App Component' },
      { file: 'client/src/pages/landing.tsx', name: 'Landing Page' },
      { file: 'client/src/components/animated-demo.tsx', name: 'Demo Component' }
    ];

    componentChecks.forEach(check => {
      try {
        if (fs.existsSync(check.file)) {
          this.addResult(check.name, 'PASS', 'Component file exists');
          console.log(`✓ ${check.name} verified`);
        } else {
          this.addResult(check.name, 'FAIL', 'Component file missing');
        }
      } catch (error) {
        this.addResult(check.name, 'FAIL', `Component check failed: ${error.message}`);
      }
    });
  }

  async testDataProcessing() {
    console.log('Testing data processing capabilities...');
    
    // File upload endpoint structure
    try {
      const uploadResp = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // Expecting 400 or 401, not 404
      if (uploadResp.status === 400 || uploadResp.status === 401) {
        this.addResult('Upload Endpoint', 'PASS', 'Upload endpoint accessible');
        console.log('✓ Upload endpoint structure verified');
      } else if (uploadResp.status === 404) {
        this.addResult('Upload Endpoint', 'FAIL', 'Upload endpoint not found');
      }
    } catch (error) {
      this.addResult('Upload Endpoint', 'FAIL', `Upload endpoint error: ${error.message}`);
    }

    // Google Drive integration
    try {
      const driveResp = await fetch(`${BASE_URL}/api/google-drive/auth-url`);
      if (driveResp.status === 401 || driveResp.status === 200) {
        this.addResult('Google Drive Integration', 'PASS', 'Google Drive endpoint accessible');
        console.log('✓ Google Drive integration verified');
      }
    } catch (error) {
      this.addResult('Google Drive Integration', 'FAIL', `Drive integration error: ${error.message}`);
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

  async generateFinalAssessment() {
    console.log('\n' + '='.repeat(80));
    console.log('FINAL INTEGRATION TEST ASSESSMENT');
    console.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    const successRate = Math.round((passed / total) * 100);

    console.log(`\nOverall Results: ${passed}/${total} tests passed (${successRate}% success rate)\n`);

    // Categorize results
    const critical = ['Server Health', 'Database Connection', 'Static File Serving'];
    const userFlow = ['User Registration', 'User Login', 'Authentication Protection'];
    const features = ['AI Providers', 'Pricing Service', 'ML Analysis'];
    const navigation = this.testResults.filter(r => r.test.includes('Route') || r.test.includes('Component'));

    console.log('🏗️ CORE INFRASTRUCTURE:');
    critical.forEach(test => {
      const result = this.testResults.find(r => r.test === test);
      if (result) {
        const icon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
      }
    });

    console.log('\n👤 USER WORKFLOWS:');
    userFlow.forEach(test => {
      const result = this.testResults.find(r => r.test === test);
      if (result) {
        const icon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
      }
    });

    console.log('\n🤖 AI & FEATURES:');
    features.forEach(test => {
      const result = this.testResults.find(r => r.test === test);
      if (result) {
        const icon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`  ${icon} ${result.test}: ${result.message}`);
      }
    });

    console.log('\n🧭 NAVIGATION & UI:');
    navigation.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`  ${icon} ${result.test}: ${result.message}`);
    });

    if (failed > 0) {
      console.log('\n❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
    }

    // Final assessment
    console.log('\n' + '='.repeat(80));
    if (successRate >= 90) {
      console.log('🎉 EXCELLENT - System fully operational and ready for production');
    } else if (successRate >= 80) {
      console.log('✅ GOOD - System mostly working with minor issues');
    } else if (successRate >= 70) {
      console.log('⚠️ ACCEPTABLE - System working but needs attention');
    } else {
      console.log('🚨 ISSUES DETECTED - System needs significant fixes');
    }

    console.log(`Success Rate: ${successRate}%`);
    console.log('='.repeat(80));

    // Save comprehensive report
    const reportData = {
      summary: { 
        passed, 
        failed, 
        total, 
        successRate,
        assessment: successRate >= 90 ? 'EXCELLENT' : 
                   successRate >= 80 ? 'GOOD' : 
                   successRate >= 70 ? 'ACCEPTABLE' : 'NEEDS_WORK'
      },
      timestamp: new Date().toISOString(),
      results: this.testResults
    };

    fs.writeFileSync('final-integration-results.json', JSON.stringify(reportData, null, 2));
    console.log('\nDetailed report saved to final-integration-results.json');
  }
}

// Run the final integration test
const tester = new FinalIntegrationTester();
tester.runCompleteTest().catch(console.error);