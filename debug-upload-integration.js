/**
 * Debug Upload Integration - Test real API endpoints
 */

import http from 'http';
import fs from 'fs';
import FormData from 'form-data';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class UploadIntegrationDebugger {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.authToken = null;
  }

  async testCompleteFlow() {
    console.log('🔧 Testing Complete Upload Integration');
    console.log('=' .repeat(50));

    try {
      // Step 1: Register user
      await this.registerUser();
      
      // Step 2: Test authenticated upload with PII
      await this.testAuthenticatedUpload();
      
      // Step 3: Test trial upload with PII
      await this.testTrialUpload();
      
      console.log('\n✅ All tests completed');
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }

  async registerUser() {
    console.log('\n👤 Registering test user...');
    
    const userData = {
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };

    const response = await this.makeJSONRequest('POST', '/api/auth/register', userData);
    
    if (response.data.token) {
      this.authToken = response.data.token;
      console.log('✅ User registered successfully');
    } else {
      throw new Error('No token received');
    }
  }

  async testAuthenticatedUpload() {
    console.log('\n📤 Testing authenticated upload with PII...');
    
    // Create test file with PII
    const testData = `Name,Email,SSN,Phone,Address
John Smith,john@example.com,123-45-6789,555-123-4567,123 Main St
Jane Doe,jane@example.com,987-65-4321,555-987-6543,456 Oak Ave`;
    
    const testFilePath = path.join(__dirname, 'test-pii.csv');
    fs.writeFileSync(testFilePath, testData);

    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(testFilePath));
      form.append('name', 'PII Test Project');
      form.append('questions', JSON.stringify(['What patterns exist?']));

      const response = await this.makeFormRequest('POST', '/api/projects/upload', form, true);
      
      console.log('Response status:', response.status);
      console.log('Response data:', JSON.stringify(response.data, null, 2));

      if (response.data.requiresPIIDecision) {
        console.log('✅ PII detection working - dialog should be triggered');
        console.log('Detected PII types:', response.data.piiResult.detectedTypes?.map(t => t.type).join(', '));
        
        // Test second upload with PII handling
        await this.testPIIHandling(testFilePath);
      } else {
        console.log('⚠️  No PII decision required - unexpected');
      }
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  }

  async testPIIHandling(testFilePath) {
    console.log('\n🔒 Testing PII handling workflow...');
    
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));
    form.append('name', 'PII Test Project Handled');
    form.append('questions', JSON.stringify([]));
    form.append('piiHandled', 'true');
    form.append('anonymizationApplied', 'true');
    form.append('selectedColumns', JSON.stringify(['Name', 'SSN', 'Email']));

    const response = await this.makeFormRequest('POST', '/api/projects/upload', form, true);
    
    console.log('PII handling response:', response.status);
    
    if (response.data.success || response.data.project) {
      console.log('✅ PII handling successful');
    } else {
      console.log('⚠️  PII handling issue:', response.data);
    }
  }

  async testTrialUpload() {
    console.log('\n🆓 Testing trial upload...');
    
    const testData = `ID,Value,Category,Email
1,100,A,test1@example.com
2,200,B,test2@example.com`;
    
    const testFilePath = path.join(__dirname, 'test-trial.csv');
    fs.writeFileSync(testFilePath, testData);

    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(testFilePath));
      form.append('name', 'Trial Test');
      form.append('questions', JSON.stringify([]));

      const response = await this.makeFormRequest('POST', '/api/upload-trial', form, false);
      
      console.log('Trial response status:', response.status);
      console.log('Trial response data:', JSON.stringify(response.data, null, 2));

      if (response.data.requiresPIIDecision) {
        console.log('✅ Trial PII detection working');
      } else if (response.data.id) {
        console.log('✅ Trial upload completed (no PII detected)');
      } else {
        console.log('⚠️  Unexpected trial response');
      }
    } finally {
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  }

  async makeJSONRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : {};
            resolve({
              status: res.statusCode,
              data: parsed,
              headers: res.headers
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: responseData,
              headers: res.headers
            });
          }
        });
      });

      req.on('error', reject);

      if (data && method !== 'GET') {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async makeFormRequest(method, path, form, useAuth = false) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'localhost',
        port: 5000,
        path: path,
        method: method,
        headers: {
          ...form.getHeaders(),
          ...(useAuth && this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
        }
      };

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = responseData ? JSON.parse(responseData) : {};
            resolve({
              status: res.statusCode,
              data: parsed,
              headers: res.headers
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              data: responseData,
              headers: res.headers
            });
          }
        });
      });

      req.on('error', reject);
      form.pipe(req);
    });
  }
}

// Run the test
const debugger = new UploadIntegrationDebugger();
debugger.testCompleteFlow().catch(console.error);