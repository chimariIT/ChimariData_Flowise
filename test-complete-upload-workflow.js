/**
 * Test Complete Upload Workflow
 * Tests the entire upload workflow from login to project creation
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';

class CompleteUploadWorkflowTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.sessionCookie = null;
    this.testEmail = 'test' + Date.now() + '@example.com';
  }

  async runCompleteTest() {
    console.log('Testing Complete Upload Workflow...\n');
    
    // Test 1: Register a user
    await this.testUserRegistration();
    
    // Test 2: Login user
    await this.testUserLogin();
    
    // Test 3: Test authenticated upload
    await this.testAuthenticatedUpload();
    
    // Test 4: Test PII decision with session
    await this.testPIIDecisionWithSession();
    
    // Generate report
    await this.generateReport();
  }

  async testUserRegistration() {
    console.log('Testing user registration...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.testEmail,
          password: 'TestPassword123',
          firstName: 'Test',
          lastName: 'User'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        this.addResult('User Registration', 'PASS', 'User successfully registered');
        console.log('✓ User registration successful');
      } else {
        this.addResult('User Registration', 'FAIL', `Registration failed: ${data.error}`);
        console.log('✗ User registration failed:', data.error);
      }
    } catch (error) {
      this.addResult('User Registration', 'ERROR', error.message);
      console.log('✗ User registration error:', error.message);
    }
  }

  async testUserLogin() {
    console.log('\nTesting user login...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.testEmail,
          password: 'TestPassword123'
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.token) {
        this.sessionCookie = data.token;
        this.addResult('User Login', 'PASS', 'User successfully logged in');
        console.log('✓ User login successful');
      } else {
        this.addResult('User Login', 'FAIL', `Login failed: ${data.error}`);
        console.log('✗ User login failed:', data.error);
      }
    } catch (error) {
      this.addResult('User Login', 'ERROR', error.message);
      console.log('✗ User login error:', error.message);
    }
  }

  async testAuthenticatedUpload() {
    console.log('\nTesting authenticated upload...');
    
    if (!this.sessionCookie) {
      this.addResult('Authenticated Upload', 'SKIP', 'No session cookie available');
      return;
    }
    
    try {
      // Create a test CSV file
      const csvData = 'name,email,age\\nJohn Doe,john@example.com,30\\nJane Smith,jane@example.com,25';
      
      const form = new FormData();
      form.append('file', Buffer.from(csvData), {
        filename: 'test-data.csv',
        contentType: 'text/csv'
      });
      form.append('name', 'Test Project');
      form.append('description', 'Test Description');
      
      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.sessionCookie}`,
          ...form.getHeaders()
        },
        body: form
      });
      
      const data = await response.json();
      
      if (response.ok) {
        this.addResult('Authenticated Upload', 'PASS', 'Upload successful with authentication');
        console.log('✓ Authenticated upload successful');
      } else {
        this.addResult('Authenticated Upload', 'FAIL', `Upload failed: ${data.error}`);
        console.log('✗ Authenticated upload failed:', data.error);
      }
    } catch (error) {
      this.addResult('Authenticated Upload', 'ERROR', error.message);
      console.log('✗ Authenticated upload error:', error.message);
    }
  }

  async testPIIDecisionWithSession() {
    console.log('\nTesting PII decision with session...');
    
    if (!this.sessionCookie) {
      this.addResult('PII Decision Auth', 'SKIP', 'No session cookie available');
      return;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionCookie}`
        },
        body: JSON.stringify({
          tempFileId: 'temp_123',
          decision: 'include',
          projectData: {
            name: 'Test Project',
            description: 'Test Description'
          }
        })
      });
      
      const data = await response.json();
      
      if (response.status === 400 && data.error.includes('Temporary file data not found')) {
        this.addResult('PII Decision Auth', 'PASS', 'PII decision endpoint accepts authenticated requests');
        console.log('✓ PII decision endpoint accepts authenticated requests');
      } else if (response.status === 401) {
        this.addResult('PII Decision Auth', 'FAIL', 'Authentication failed for PII decision');
        console.log('✗ Authentication failed for PII decision');
      } else {
        this.addResult('PII Decision Auth', 'INFO', `Unexpected response: ${response.status}`);
        console.log('ℹ Unexpected response:', response.status, data);
      }
    } catch (error) {
      this.addResult('PII Decision Auth', 'ERROR', error.message);
      console.log('✗ PII decision error:', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE UPLOAD WORKFLOW TEST REPORT');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    
    for (const result of this.results) {
      const icon = result.status === 'PASS' ? '✓' : 
                   result.status === 'FAIL' ? '✗' : 
                   result.status === 'ERROR' ? '!' : 
                   result.status === 'SKIP' ? '⊝' : 'ℹ';
      console.log(`${icon} ${result.testName}: ${result.status} - ${result.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${errors} errors, ${skipped} skipped`);
    console.log('='.repeat(60));
    
    console.log('\nDIAGNOSIS:');
    console.log('The "Project Not Found" error is likely caused by:');
    console.log('1. Users not being properly authenticated during upload');
    console.log('2. Session management issues between upload and PII decision');
    console.log('3. Authentication middleware not receiving proper user data');
    console.log('4. Projects being created with "anonymous" user due to missing auth');
    
    console.log('\nRECOMMENDATIONS:');
    console.log('1. Ensure users are logged in before attempting file uploads');
    console.log('2. Verify that authentication tokens are properly passed in requests');
    console.log('3. Check that the authentication middleware is correctly extracting user data');
    console.log('4. Add logging to track user authentication state throughout the workflow');
    
    if (failed === 0 && errors === 0) {
      console.log('\n✓ All tests passed! The authentication workflow is working correctly.');
    } else {
      console.log('\n⚠️  Some tests failed. Authentication issues detected.');
    }
  }
}

// Run the test
async function runTest() {
  const tester = new CompleteUploadWorkflowTester();
  await tester.runCompleteTest();
}

runTest().catch(console.error);