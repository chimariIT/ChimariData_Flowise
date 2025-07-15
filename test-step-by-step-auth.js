import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

class StepByStepAuthTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.authToken = null;
    this.user = null;
    this.steps = [];
  }

  log(step, status, details) {
    this.steps.push({ step, status, details, timestamp: new Date().toISOString() });
    console.log(`\n${status === 'SUCCESS' ? '✅' : status === 'FAIL' ? '❌' : '🔄'} STEP: ${step}`);
    console.log(`   Details: ${details}`);
  }

  async step1_Register() {
    console.log('\n=== STEP 1: USER REGISTRATION ===');
    
    const email = `testuser${Date.now()}@example.com`;
    const password = 'TestPassword123!';
    
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName: 'Test',
          lastName: 'User'
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        this.authToken = data.token;
        this.user = data.user;
        this.log('User Registration', 'SUCCESS', `Token: ${this.authToken.substring(0, 20)}...`);
        return true;
      } else {
        this.log('User Registration', 'FAIL', `Error: ${data.error}`);
        return false;
      }
    } catch (error) {
      this.log('User Registration', 'FAIL', `Network error: ${error.message}`);
      return false;
    }
  }

  async step2_VerifyToken() {
    console.log('\n=== STEP 2: TOKEN VERIFICATION ===');
    
    if (!this.authToken) {
      this.log('Token Verification', 'FAIL', 'No token available');
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/auth/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.authToken}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        this.log('Token Verification', 'SUCCESS', `User ID: ${userData.id}, Email: ${userData.email}`);
        return true;
      } else {
        const error = await response.json();
        this.log('Token Verification', 'FAIL', `HTTP ${response.status}: ${error.error}`);
        return false;
      }
    } catch (error) {
      this.log('Token Verification', 'FAIL', `Network error: ${error.message}`);
      return false;
    }
  }

  async step3_CreateTestFile() {
    console.log('\n=== STEP 3: CREATE TEST FILE ===');
    
    const csvContent = `name,email,age,department
John Doe,john@example.com,30,Engineering
Jane Smith,jane@example.com,25,Marketing
Bob Wilson,bob@example.com,35,Sales`;

    try {
      fs.writeFileSync('test-upload-auth.csv', csvContent);
      const stats = fs.statSync('test-upload-auth.csv');
      this.log('Test File Creation', 'SUCCESS', `File size: ${stats.size} bytes`);
      return true;
    } catch (error) {
      this.log('Test File Creation', 'FAIL', `Error: ${error.message}`);
      return false;
    }
  }

  async step4_TestUploadWithoutAuth() {
    console.log('\n=== STEP 4: TEST UPLOAD WITHOUT AUTHENTICATION ===');
    
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-upload-auth.csv'));
      formData.append('name', 'Test Upload - No Auth');
      formData.append('description', 'Testing upload without authentication');

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          ...formData.getHeaders()
        }
      });

      const data = await response.json();
      
      if (response.status === 401) {
        this.log('Upload Without Auth', 'SUCCESS', 'Correctly rejected - Authentication required');
        return true;
      } else {
        this.log('Upload Without Auth', 'FAIL', `Should have been rejected but got: ${response.status}`);
        return false;
      }
    } catch (error) {
      this.log('Upload Without Auth', 'FAIL', `Network error: ${error.message}`);
      return false;
    }
  }

  async step5_TestUploadWithAuth() {
    console.log('\n=== STEP 5: TEST UPLOAD WITH AUTHENTICATION ===');
    
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-upload-auth.csv'));
      formData.append('name', 'Test Upload - With Auth');
      formData.append('description', 'Testing upload with authentication');

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...formData.getHeaders()
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        this.log('Upload With Auth', 'SUCCESS', `Upload successful: ${data.success ? 'Yes' : 'No'}, RequiresPII: ${data.requiresPIIDecision}`);
        return { success: true, data };
      } else {
        this.log('Upload With Auth', 'FAIL', `HTTP ${response.status}: ${data.error}`);
        return { success: false, error: data.error };
      }
    } catch (error) {
      this.log('Upload With Auth', 'FAIL', `Network error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async step6_TestFrontendAPIClient() {
    console.log('\n=== STEP 6: TEST FRONTEND API CLIENT SIMULATION ===');
    
    try {
      // Simulate how frontend stores token
      const token = this.authToken;
      
      // Simulate frontend API client uploadFile method
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-upload-auth.csv'));
      formData.append('name', 'Frontend API Test');
      formData.append('description', 'Testing frontend API client pattern');

      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          ...headers,
          ...formData.getHeaders()
        },
        body: formData,
      });

      const data = await response.json();
      
      if (response.ok) {
        this.log('Frontend API Client', 'SUCCESS', `Upload via frontend pattern successful`);
        return true;
      } else {
        this.log('Frontend API Client', 'FAIL', `HTTP ${response.status}: ${data.error}`);
        return false;
      }
    } catch (error) {
      this.log('Frontend API Client', 'FAIL', `Network error: ${error.message}`);
      return false;
    }
  }

  async step7_TestTrialUpload() {
    console.log('\n=== STEP 7: TEST TRIAL UPLOAD ===');
    
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-upload-auth.csv'));

      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...formData.getHeaders()
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        this.log('Trial Upload', 'SUCCESS', `Trial upload successful`);
        return true;
      } else {
        this.log('Trial Upload', 'FAIL', `HTTP ${response.status}: ${data.error}`);
        return false;
      }
    } catch (error) {
      this.log('Trial Upload', 'FAIL', `Network error: ${error.message}`);
      return false;
    }
  }

  cleanup() {
    if (fs.existsSync('test-upload-auth.csv')) {
      fs.unlinkSync('test-upload-auth.csv');
    }
  }

  async runCompleteTest() {
    console.log('🚀 COMPREHENSIVE FILE UPLOAD AUTHENTICATION TEST');
    console.log('=' .repeat(60));
    
    try {
      // Step 1: Register user
      const registerSuccess = await this.step1_Register();
      if (!registerSuccess) return this.printSummary();

      // Step 2: Verify token works
      const tokenSuccess = await this.step2_VerifyToken();
      if (!tokenSuccess) return this.printSummary();

      // Step 3: Create test file
      const fileSuccess = await this.step3_CreateTestFile();
      if (!fileSuccess) return this.printSummary();

      // Step 4: Test upload without auth (should fail)
      await this.step4_TestUploadWithoutAuth();

      // Step 5: Test upload with auth (should succeed)
      const uploadResult = await this.step5_TestUploadWithAuth();
      
      // Step 6: Test frontend API client pattern
      await this.step6_TestFrontendAPIClient();

      // Step 7: Test trial upload
      await this.step7_TestTrialUpload();

      this.printSummary();
      
    } finally {
      this.cleanup();
    }
  }

  printSummary() {
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    
    const successful = this.steps.filter(s => s.status === 'SUCCESS').length;
    const failed = this.steps.filter(s => s.status === 'FAIL').length;
    
    this.steps.forEach(step => {
      const icon = step.status === 'SUCCESS' ? '✅' : '❌';
      console.log(`${icon} ${step.step}: ${step.details}`);
    });
    
    console.log('\n' + '=' .repeat(60));
    console.log(`RESULTS: ${successful} successful, ${failed} failed`);
    console.log('=' .repeat(60));
    
    if (failed === 0) {
      console.log('🎉 ALL AUTHENTICATION TESTS PASSED!');
      console.log('File upload authentication is working correctly.');
    } else {
      console.log('⚠️  SOME TESTS FAILED - Authentication issues detected.');
    }
  }
}

// Run the comprehensive test
const tester = new StepByStepAuthTester();
tester.runCompleteTest();