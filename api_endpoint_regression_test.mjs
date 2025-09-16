#!/usr/bin/env node

/**
 * Focused API Endpoint Regression Test
 * Tests critical API endpoints after routing fixes
 */

import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

class APIEndpointTester {
  constructor() {
    this.testResults = [];
    this.authToken = null;
    this.testUser = null;
    this.projectId = null;
  }

  async runTest() {
    console.log('🔍 Running API Endpoint Regression Test...\n');
    
    try {
      await this.setupAuth();
      await this.testCoreEndpoints();
      await this.testJourneyEndpoints();
      await this.testDataProcessingEndpoints();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ API test failed:', error.message);
      process.exit(1);
    }
  }

  async setupAuth() {
    console.log('🔐 Setting up authentication...');
    
    const testEmail = `api_test_${randomBytes(6).toString('hex')}@example.com`;
    const testPassword = 'APITest123!';
    
    try {
      // Register and login
      const registerResponse = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'API Test User',
          acceptedTerms: true
        })
      });

      if (!registerResponse.ok) {
        throw new Error('Registration failed');
      }
      
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword
        })
      });

      const loginData = await loginResponse.json();
      
      if (!loginResponse.ok || !loginData.success) {
        throw new Error('Login failed');
      }
      
      this.authToken = loginData.token;
      this.testUser = { email: testEmail, id: loginData.user.id };
      
      console.log('✅ Authentication setup complete\n');
      
    } catch (error) {
      throw new Error(`Auth setup failed: ${error.message}`);
    }
  }

  async testCoreEndpoints() {
    console.log('🏗️ Testing core API endpoints...');
    
    const endpoints = [
      { path: '/health', method: 'GET', auth: false, expected: 'json' },
      { path: '/user/me', method: 'GET', auth: true, expected: 'json' },
      { path: '/projects', method: 'GET', auth: true, expected: 'json' },
    ];

    for (const endpoint of endpoints) {
      await this.testEndpoint(endpoint);
    }
  }

  async testJourneyEndpoints() {
    console.log('🎯 Testing journey-related endpoints...');
    
    // Test goal extraction with correct enum values
    const goalExtractionTests = [
      { journeyType: 'guided', expected: 'success' },
      { journeyType: 'business', expected: 'success' },
      { journeyType: 'technical', expected: 'success' },
      { journeyType: 'ml-analysis', expected: 'error' } // Should fail
    ];

    for (const test of goalExtractionTests) {
      await this.testGoalExtraction(test);
    }

    // Test project creation
    await this.testProjectCreation();
  }

  async testDataProcessingEndpoints() {
    console.log('📊 Testing data processing endpoints...');
    
    if (!this.projectId) {
      console.log('⏭️ Skipping data processing tests - no project available');
      return;
    }

    const dataEndpoints = [
      { path: '/analyze-schema', method: 'POST', body: { projectId: this.projectId } },
      { path: '/analyze-pii', method: 'POST', body: { projectId: this.projectId } },
      { path: '/execute-analysis', method: 'POST', body: { projectId: this.projectId, analysisType: 'descriptive' } }
    ];

    for (const endpoint of dataEndpoints) {
      await this.testDataEndpoint(endpoint);
    }
  }

  async testEndpoint(endpoint) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (endpoint.auth && this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch(`${API_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const isHtml = contentType.includes('text/html');

      let result = {
        endpoint: `${endpoint.method} ${endpoint.path}`,
        status: response.status,
        contentType: contentType,
        responseType: isJson ? 'json' : isHtml ? 'html' : 'other',
        success: response.ok && (endpoint.expected === 'json' ? isJson : true)
      };

      if (isJson) {
        try {
          const data = await response.json();
          result.hasData = !!data;
          result.dataKeys = Object.keys(data || {});
        } catch (e) {
          result.jsonParseError = true;
        }
      }

      this.testResults.push({
        category: 'Core API',
        test: result.endpoint,
        status: result.success ? '✅ PASS' : '❌ FAIL',
        details: `${result.status} | ${result.responseType} | ${result.contentType}`
      });

    } catch (error) {
      this.testResults.push({
        category: 'Core API',
        test: `${endpoint.method} ${endpoint.path}`,
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testGoalExtraction(test) {
    try {
      const response = await fetch(`${API_URL}/analysis/extract-goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          userDescription: "Test analysis for customer behavior patterns and trends",
          journeyType: test.journeyType,
          context: {
            industry: "Technology",
            businessRole: "Analyst", 
            technicalLevel: "intermediate"
          }
        })
      });

      const data = await response.json();
      
      const success = test.expected === 'success' ? response.ok && data.success : !response.ok;
      
      this.testResults.push({
        category: 'Goal Extraction',
        test: `Journey Type: ${test.journeyType}`,
        status: success ? '✅ PASS' : '❌ FAIL',
        details: success ? 'Handled correctly' : `Expected ${test.expected}, got ${response.ok ? 'success' : 'error'}: ${data.message || data.error}`
      });

    } catch (error) {
      this.testResults.push({
        category: 'Goal Extraction',
        test: `Journey Type: ${test.journeyType}`,
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testProjectCreation() {
    try {
      const response = await fetch(`${API_URL}/projects/create-from-journey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          name: `API Test Project ${Date.now()}`,
          description: "Test project for API validation",
          journeyType: "guided",
          selectedGoals: [
            { goal: "Test goal", category: "Testing", priority: "high" }
          ],
          selectedApproaches: [
            { id: "descriptive", name: "Descriptive Analysis" }
          ]
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success && data.project) {
        this.projectId = data.project.id;
        
        this.testResults.push({
          category: 'Project Management',
          test: 'Project Creation',
          status: '✅ PASS',
          details: `Project created with ID: ${this.projectId}`
        });
      } else {
        this.testResults.push({
          category: 'Project Management',
          test: 'Project Creation',
          status: '❌ FAIL',
          details: data.message || 'Project creation failed'
        });
      }

    } catch (error) {
      this.testResults.push({
        category: 'Project Management',
        test: 'Project Creation',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testDataEndpoint(endpoint) {
    try {
      const response = await fetch(`${API_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(endpoint.body)
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      let details;
      if (isJson) {
        try {
          const data = await response.json();
          details = `${response.status} | JSON Response | ${data.success ? 'Success' : data.message || 'Failed'}`;
        } catch (e) {
          details = `${response.status} | Invalid JSON Response`;
        }
      } else {
        const text = await response.text();
        const isHtml = text.startsWith('<!DOCTYPE') || text.startsWith('<html');
        details = `${response.status} | ${isHtml ? 'HTML' : 'Text'} Response | ${isHtml ? 'Routing Issue' : 'Unexpected format'}`;
      }

      this.testResults.push({
        category: 'Data Processing',
        test: `${endpoint.method} ${endpoint.path}`,
        status: (response.ok && isJson) ? '✅ PASS' : '❌ FAIL',
        details: details
      });

    } catch (error) {
      this.testResults.push({
        category: 'Data Processing',
        test: `${endpoint.method} ${endpoint.path}`,
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  generateReport() {
    console.log('\n📊 API ENDPOINT REGRESSION TEST RESULTS');
    console.log('=' .repeat(60));
    
    const categories = {};
    
    // Group results by category
    for (const result of this.testResults) {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    }
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let errorTests = 0;
    
    // Print results by category
    for (const [category, tests] of Object.entries(categories)) {
      console.log(`\n${category.toUpperCase()} TESTS:`);
      console.log('-'.repeat(40));
      
      for (const test of tests) {
        console.log(`${test.status} ${test.test}`);
        console.log(`   ${test.details}\n`);
        
        totalTests++;
        if (test.status.includes('PASS')) passedTests++;
        else if (test.status.includes('FAIL')) failedTests++;
        else if (test.status.includes('ERROR')) errorTests++;
      }
    }
    
    // Summary
    console.log('\n📈 API TEST SUMMARY');
    console.log('=' .repeat(40));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`💥 Errors: ${errorTests}`);
    
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    // Identify critical issues
    const criticalIssues = this.testResults.filter(r => 
      r.status.includes('FAIL') && r.details.includes('HTML')
    );
    
    if (criticalIssues.length > 0) {
      console.log('\n⚠️ CRITICAL ROUTING ISSUES DETECTED:');
      for (const issue of criticalIssues) {
        console.log(`   • ${issue.test}: API returning HTML instead of JSON`);
      }
    }
    
    if (failedTests > 0 || errorTests > 0) {
      console.log('\n⚠️ API ISSUES FOUND - Review failed tests above');
    } else {
      console.log('\n✅ ALL API ENDPOINTS WORKING CORRECTLY');
    }
    
    // Save results
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { totalTests, passedTests, failedTests, errorTests, successRate },
      results: this.testResults,
      criticalIssues: criticalIssues.length
    };
    
    try {
      const fs = require('fs');
      fs.writeFileSync('api_endpoint_test_results.json', JSON.stringify(reportData, null, 2));
      console.log('\n📄 Results saved to: api_endpoint_test_results.json');
    } catch (e) {
      console.log('\n⚠️ Could not save results to file');
    }
  }
}

// Run the test
const tester = new APIEndpointTester();
await tester.runTest();