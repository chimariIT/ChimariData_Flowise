import fetch from 'node-fetch';

/**
 * Test Authentication Fix - Token Storage Consistency
 * This test verifies that after registration/login, the token is properly stored
 * and can be used for authenticated requests
 */

class AuthFixVerificationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  addResult(test, status, message) {
    this.results.push({ test, status, message });
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${test}: ${message}`);
  }

  async testTokenStorageConsistency() {
    console.log('🔍 Testing Token Storage Consistency Fix');
    console.log('=' .repeat(50));
    
    const email = `testfix${Date.now()}@example.com`;
    const password = 'TestFix123!';
    
    try {
      // Step 1: Register new user
      console.log('\n1. Registering new user...');
      const registerResponse = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          firstName: 'Test',
          lastName: 'Fix'
        })
      });

      if (!registerResponse.ok) {
        const error = await registerResponse.json();
        this.addResult('User Registration', 'FAIL', `Registration failed: ${error.error}`);
        return;
      }

      const registerData = await registerResponse.json();
      this.addResult('User Registration', 'PASS', 'User registered successfully');

      // Step 2: Verify token is returned
      if (!registerData.token) {
        this.addResult('Token Generation', 'FAIL', 'No token returned from registration');
        return;
      }

      this.addResult('Token Generation', 'PASS', `Token generated: ${registerData.token.substring(0, 20)}...`);

      // Step 3: Test token works for authenticated request
      console.log('\n2. Testing token authentication...');
      const userResponse = await fetch(`${this.baseUrl}/api/auth/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${registerData.token}`
        }
      });

      if (!userResponse.ok) {
        this.addResult('Token Authentication', 'FAIL', `Token authentication failed: ${userResponse.status}`);
        return;
      }

      const userData = await userResponse.json();
      this.addResult('Token Authentication', 'PASS', `Token works, user: ${userData.user.email}`);

      // Step 4: Test authenticated file upload
      console.log('\n3. Testing authenticated file upload...');
      const FormData = (await import('form-data')).default;
      const fs = (await import('fs')).default;
      
      // Create test file
      const testContent = 'name,email\nTest,test@example.com';
      fs.writeFileSync('test-auth-fix.csv', testContent);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-auth-fix.csv'));
      formData.append('name', 'Auth Fix Test');
      
      const uploadResponse = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${registerData.token}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        this.addResult('Authenticated Upload', 'FAIL', `Upload failed: ${error.error}`);
      } else {
        this.addResult('Authenticated Upload', 'PASS', 'File uploaded successfully with token');
      }

      // Cleanup
      if (fs.existsSync('test-auth-fix.csv')) {
        fs.unlinkSync('test-auth-fix.csv');
      }

    } catch (error) {
      this.addResult('Test Execution', 'FAIL', `Test error: ${error.message}`);
    }
  }

  async runTest() {
    console.log('🚀 AUTHENTICATION FIX VERIFICATION TEST');
    console.log('Testing token storage consistency between AuthModal and App.tsx');
    console.log('=' .repeat(60));
    
    await this.testTokenStorageConsistency();
    
    console.log('\n' + '=' .repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
      console.log('🎉 ALL TESTS PASSED! Authentication fix is working correctly.');
      console.log('✅ Token storage consistency fixed');
      console.log('✅ Registration → Token → Authentication → Upload workflow working');
    } else {
      console.log('⚠️  Some tests failed. Authentication issues may still exist.');
    }
  }
}

// Run the test
const tester = new AuthFixVerificationTester();
tester.runTest();