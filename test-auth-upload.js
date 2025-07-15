import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

class AuthUploadTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.authToken = null;
    this.results = [];
  }

  async register() {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: `test${Date.now()}@example.com`,
          password: 'TestPassword123!',
          firstName: 'Test',
          lastName: 'User'
        })
      });

      const data = await response.json();
      if (response.ok) {
        this.authToken = data.token;
        this.results.push(['Registration', 'PASS', 'User registered successfully']);
        return true;
      } else {
        this.results.push(['Registration', 'FAIL', data.error]);
        return false;
      }
    } catch (error) {
      this.results.push(['Registration', 'ERROR', error.message]);
      return false;
    }
  }

  async testAuthenticatedUpload() {
    try {
      // Create test file
      const csvContent = 'name,email,age\nJohn Doe,john@example.com,30\nJane Smith,jane@example.com,25';
      fs.writeFileSync('test-upload.csv', csvContent);

      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-upload.csv'));
      formData.append('name', 'Test Upload Project');
      formData.append('description', 'Test upload with authentication');

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
        this.results.push(['Authenticated Upload', 'PASS', 'File uploaded successfully']);
        return true;
      } else {
        this.results.push(['Authenticated Upload', 'FAIL', data.error || `HTTP ${response.status}`]);
        return false;
      }
    } catch (error) {
      this.results.push(['Authenticated Upload', 'ERROR', error.message]);
      return false;
    } finally {
      // Clean up test file
      if (fs.existsSync('test-upload.csv')) {
        fs.unlinkSync('test-upload.csv');
      }
    }
  }

  async testTrialUpload() {
    try {
      // Create test file
      const csvContent = 'product,price,category\nLaptop,999,Electronics\nPhone,599,Electronics';
      fs.writeFileSync('test-trial.csv', csvContent);

      const formData = new FormData();
      formData.append('file', fs.createReadStream('test-trial.csv'));

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
        this.results.push(['Trial Upload', 'PASS', 'Trial upload successful']);
        return true;
      } else {
        this.results.push(['Trial Upload', 'FAIL', data.error || `HTTP ${response.status}`]);
        return false;
      }
    } catch (error) {
      this.results.push(['Trial Upload', 'ERROR', error.message]);
      return false;
    } finally {
      // Clean up test file
      if (fs.existsSync('test-trial.csv')) {
        fs.unlinkSync('test-trial.csv');
      }
    }
  }

  async runAllTests() {
    console.log('Testing Authentication Upload Fix...\n');

    // Test registration
    const registrationSuccess = await this.register();
    if (!registrationSuccess) {
      console.log('Registration failed, cannot proceed with upload tests');
      this.printResults();
      return;
    }

    // Test authenticated upload
    await this.testAuthenticatedUpload();
    
    // Test trial upload
    await this.testTrialUpload();

    this.printResults();
  }

  printResults() {
    console.log('\n============================================================');
    console.log('AUTHENTICATION UPLOAD TEST RESULTS');
    console.log('============================================================');
    
    const passed = this.results.filter(r => r[1] === 'PASS').length;
    const failed = this.results.filter(r => r[1] === 'FAIL').length;
    const errors = this.results.filter(r => r[1] === 'ERROR').length;

    this.results.forEach(([test, status, message]) => {
      const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
      console.log(`${icon} ${test}: ${status} - ${message}`);
    });

    console.log('\n============================================================');
    console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${errors} errors`);
    console.log('============================================================');

    if (failed === 0 && errors === 0) {
      console.log('🎉 All authentication upload tests passed!');
    } else {
      console.log('⚠️  Some authentication upload tests failed.');
    }
  }
}

// Run the test
const tester = new AuthUploadTester();
tester.runAllTests();