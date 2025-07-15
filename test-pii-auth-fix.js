import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

/**
 * Test PII Decision Authentication Fix
 * Verifies that PII decision endpoints work with authentication headers
 */

class PIIAuthFixTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
  }

  addResult(test, status, message) {
    this.results.push({ test, status, message });
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${test}: ${message}`);
  }

  async registerUser() {
    console.log('1. Registering user...');
    const email = `piitest${Date.now()}@example.com`;
    const password = 'PIITest123!';
    
    const response = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName: 'PII',
        lastName: 'Test'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      this.addResult('User Registration', 'FAIL', error.error);
      return false;
    }

    const data = await response.json();
    this.authToken = data.token;
    this.addResult('User Registration', 'PASS', 'User registered with token');
    return true;
  }

  async testRegularUpload() {
    console.log('\n2. Testing regular upload...');
    
    // Create test file with PII
    const testContent = `name,email,age,department
John Doe,john@example.com,30,Engineering
Jane Smith,jane@example.com,25,Marketing`;
    
    fs.writeFileSync('test-pii-upload.csv', testContent);
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-pii-upload.csv'));
    formData.append('name', 'PII Test Upload');
    formData.append('description', 'Testing PII upload');
    
    const response = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      this.addResult('Regular Upload', 'FAIL', error.error);
      return null;
    }

    const data = await response.json();
    this.addResult('Regular Upload', 'PASS', `Upload successful, tempFileId: ${data.tempFileId}`);
    return data;
  }

  async testPIIDecisionWithAuth(tempFileId) {
    console.log('\n3. Testing PII decision with authentication...');
    
    const requestData = {
      tempFileId: tempFileId,
      decision: 'include',
      projectData: {
        name: 'PII Test Project',
        description: 'Testing PII decision authentication',
        questions: ['Test question?']
      }
    };

    const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const error = await response.json();
      this.addResult('PII Decision with Auth', 'FAIL', `HTTP ${response.status}: ${error.error}`);
      return null;
    }

    const data = await response.json();
    this.addResult('PII Decision with Auth', 'PASS', `Project created: ${data.projectId}`);
    return data;
  }

  async testPIIDecisionWithoutAuth(tempFileId) {
    console.log('\n4. Testing PII decision without authentication (should fail)...');
    
    const requestData = {
      tempFileId: tempFileId,
      decision: 'include',
      projectData: {
        name: 'PII Test Project',
        description: 'Testing PII decision authentication',
        questions: ['Test question?']
      }
    };

    const response = await fetch(`${this.baseUrl}/api/pii-decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (response.status === 401) {
      this.addResult('PII Decision without Auth', 'PASS', 'Correctly rejected with 401');
      return true;
    } else {
      this.addResult('PII Decision without Auth', 'FAIL', `Should have returned 401, got ${response.status}`);
      return false;
    }
  }

  async testTrialUpload() {
    console.log('\n5. Testing trial upload...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-pii-upload.csv'));
    
    const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      this.addResult('Trial Upload', 'FAIL', error.error);
      return null;
    }

    const data = await response.json();
    this.addResult('Trial Upload', 'PASS', `Trial upload successful, tempFileId: ${data.tempFileId}`);
    return data;
  }

  async testTrialPIIDecisionWithAuth(tempFileId) {
    console.log('\n6. Testing trial PII decision with authentication...');
    
    const requestData = {
      tempFileId: tempFileId,
      decision: 'include'
    };

    const response = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const error = await response.json();
      this.addResult('Trial PII Decision with Auth', 'FAIL', `HTTP ${response.status}: ${error.error}`);
      return null;
    }

    const data = await response.json();
    this.addResult('Trial PII Decision with Auth', 'PASS', 'Trial analysis completed');
    return data;
  }

  cleanup() {
    if (fs.existsSync('test-pii-upload.csv')) {
      fs.unlinkSync('test-pii-upload.csv');
    }
  }

  async runCompleteTest() {
    console.log('🚀 PII DECISION AUTHENTICATION FIX TEST');
    console.log('Testing that PII decision endpoints work with authentication headers');
    console.log('=' .repeat(70));
    
    try {
      // Step 1: Register user
      const registerSuccess = await this.registerUser();
      if (!registerSuccess) return this.printResults();

      // Step 2: Test regular upload
      const uploadResult = await this.testRegularUpload();
      if (!uploadResult) return this.printResults();

      // Step 3: Test PII decision with auth
      const piiResult = await this.testPIIDecisionWithAuth(uploadResult.tempFileId);
      
      // Step 4: Test PII decision without auth (should fail)
      await this.testPIIDecisionWithoutAuth(uploadResult.tempFileId);

      // Step 5: Test trial upload
      const trialUploadResult = await this.testTrialUpload();
      if (trialUploadResult) {
        // Step 6: Test trial PII decision with auth
        await this.testTrialPIIDecisionWithAuth(trialUploadResult.tempFileId);
      }

      this.printResults();
      
    } catch (error) {
      this.addResult('Test Execution', 'FAIL', `Test error: ${error.message}`);
      this.printResults();
    } finally {
      this.cleanup();
    }
  }

  printResults() {
    console.log('\n' + '=' .repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('=' .repeat(70));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED!');
      console.log('✅ PII decision authentication fix working correctly');
      console.log('✅ Both regular and trial PII workflows functioning');
      console.log('✅ Authentication properly required for PII endpoints');
    } else {
      console.log('⚠️  Some tests failed. Check authentication headers in frontend.');
    }
  }
}

// Run the test
const tester = new PIIAuthFixTester();
tester.runCompleteTest();