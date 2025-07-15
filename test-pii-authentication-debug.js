/**
 * Test PII Authentication Debug
 * Checks if the authentication is working correctly in the PII workflow
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

class PIIAuthenticationDebugger {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async runDebugTest() {
    console.log('Testing PII Authentication Debug...\n');
    
    // Test 1: Check if authentication is working at all
    await this.testAuthenticationMiddleware();
    
    // Test 2: Check if PII decision endpoint requires auth
    await this.testPIIDecisionAuth();
    
    // Test 3: Check if the user object is being passed correctly
    await this.testUserObjectPassing();
    
    // Generate report
    await this.generateReport();
  }

  async testAuthenticationMiddleware() {
    console.log('Testing authentication middleware...');
    
    try {
      // Test without authentication
      const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tempFileId: 'test_123',
          decision: 'include'
        })
      });
      
      const data = await response.json();
      
      if (response.status === 401) {
        this.addResult('PII Decision Auth', 'PASS', 'PII decision endpoint requires authentication');
        console.log('✓ PII decision endpoint properly requires authentication');
      } else {
        this.addResult('PII Decision Auth', 'FAIL', `Expected 401, got ${response.status}`);
        console.log('✗ PII decision endpoint does not require authentication');
      }
    } catch (error) {
      this.addResult('PII Decision Auth', 'ERROR', error.message);
    }
  }

  async testPIIDecisionAuth() {
    console.log('\nTesting PII decision endpoint authentication...');
    
    try {
      // Test trial PII decision endpoint
      const response = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tempFileId: 'test_123',
          decision: 'include'
        })
      });
      
      const data = await response.json();
      
      if (response.status === 401) {
        this.addResult('Trial PII Decision Auth', 'PASS', 'Trial PII decision endpoint requires authentication');
        console.log('✓ Trial PII decision endpoint properly requires authentication');
      } else {
        this.addResult('Trial PII Decision Auth', 'FAIL', `Expected 401, got ${response.status}`);
        console.log('✗ Trial PII decision endpoint does not require authentication');
      }
    } catch (error) {
      this.addResult('Trial PII Decision Auth', 'ERROR', error.message);
    }
  }

  async testUserObjectPassing() {
    console.log('\nTesting user object passing...');
    
    try {
      // Test upload endpoint to see if it has authentication
      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {},
        body: new FormData()
      });
      
      const data = await response.json();
      
      if (response.status === 401) {
        this.addResult('Upload Auth', 'PASS', 'Upload endpoint requires authentication');
        console.log('✓ Upload endpoint properly requires authentication');
      } else {
        this.addResult('Upload Auth', 'FAIL', `Expected 401, got ${response.status}`);
        console.log('✗ Upload endpoint does not require authentication');
      }
    } catch (error) {
      this.addResult('Upload Auth', 'ERROR', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('PII AUTHENTICATION DEBUG REPORT');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    
    for (const result of this.results) {
      const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '!';
      console.log(`${icon} ${result.testName}: ${result.status} - ${result.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${errors} errors`);
    console.log('='.repeat(60));
    
    console.log('\nDEBUG ANALYSIS:');
    console.log('The "Project Not Found" error after PII decision is likely due to:');
    console.log('1. Authentication issues preventing project creation');
    console.log('2. User ID not being properly assigned to projects');
    console.log('3. User sessions not being maintained across requests');
    console.log('4. Projects being created with "anonymous" user instead of actual user');
    
    console.log('\nRECOMMENDATIONS:');
    console.log('1. Check if users are properly authenticated before uploading');
    console.log('2. Verify that req.user is populated with actual user data');
    console.log('3. Ensure user sessions are maintained during the upload workflow');
    console.log('4. Add additional logging to track user authentication state');
    
    if (passed === this.results.length) {
      console.log('\n✓ Authentication middleware is working correctly');
    } else {
      console.log('\n⚠️  Authentication middleware needs attention');
    }
  }
}

// Run the debug test
async function runTest() {
  const tester = new PIIAuthenticationDebugger();
  await tester.runDebugTest();
}

runTest().catch(console.error);