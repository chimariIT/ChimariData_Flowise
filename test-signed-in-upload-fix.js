/**
 * Test Signed-In Upload PII Fix
 * Verifies that upload-modal.tsx properly handles PII detection responses
 */

const fs = require('fs');
const path = require('path');

class SignedInUploadFixTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
    this.testProjectName = `PII_Test_${Date.now()}`;
  }

  async runTest() {
    console.log('🧪 Testing Signed-In Upload PII Detection Fix...\n');
    
    try {
      await this.testUserLogin();
      await this.testUploadWithPII();
      await this.testUploadEndpointBehavior();
      await this.testComponentIntegration();
      
      await this.generateReport();
    } catch (error) {
      console.error('Test execution failed:', error);
      this.addResult('Test Execution', 'FAIL', `Critical error: ${error.message}`);
      await this.generateReport();
    }
  }

  async testUserLogin() {
    console.log('🔐 Testing user authentication...');
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser@example.com',
          password: 'password123'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.authToken = result.token;
        this.addResult('User Login', 'PASS', 'Authentication successful');
        console.log('✅ User authenticated successfully');
      } else {
        // Try registering first
        await this.registerTestUser();
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', `Authentication error: ${error.message}`);
      console.log('❌ Authentication failed');
    }
  }

  async registerTestUser() {
    console.log('👤 Registering test user...');
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'testuser@example.com',
          email: 'testuser@example.com',
          password: 'password123'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.authToken = result.token;
        this.addResult('User Registration', 'PASS', 'User registered successfully');
        console.log('✅ Test user registered and authenticated');
      } else {
        throw new Error(`Registration failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', `Registration error: ${error.message}`);
      throw error;
    }
  }

  async testUploadWithPII() {
    console.log('📄 Testing upload with PII data...');
    try {
      // Create test CSV with PII data
      const piiTestData = `name,email,ssn,phone,address
John Doe,john@example.com,123-45-6789,555-123-4567,123 Main St New York NY
Jane Smith,jane@example.com,987-65-4321,555-987-6543,456 Oak Ave Los Angeles CA
Bob Johnson,bob@example.com,456-78-9012,555-456-7890,789 Pine Rd Chicago IL`;

      const formData = new FormData();
      const blob = new Blob([piiTestData], { type: 'text/csv' });
      formData.append('file', blob, 'pii_test.csv');
      formData.append('name', this.testProjectName);
      formData.append('questions', JSON.stringify(['What are the customer demographics?']));

      const response = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        
        if (result.requiresPIIDecision && result.piiResult) {
          this.addResult('PII Detection Response', 'PASS', 'Upload endpoint correctly returns PII detection result');
          console.log('✅ PII detection working - backend returns requiresPIIDecision: true');
          
          // Verify PII result structure
          if (result.piiResult.detectedFields && result.tempFileId) {
            this.addResult('PII Result Structure', 'PASS', 'PII result contains required fields');
            console.log('✅ PII result structure valid');
          } else {
            this.addResult('PII Result Structure', 'FAIL', 'PII result missing required fields');
            console.log('❌ PII result structure incomplete');
          }
        } else {
          this.addResult('PII Detection Response', 'FAIL', 'Upload endpoint should detect PII in test data');
          console.log('❌ PII detection not working - no requiresPIIDecision flag');
        }
      } else {
        const errorText = await response.text();
        this.addResult('Upload Request', 'FAIL', `Upload failed: ${response.status} - ${errorText}`);
        console.log('❌ Upload request failed');
      }
    } catch (error) {
      this.addResult('Upload with PII', 'FAIL', `Upload error: ${error.message}`);
      console.log('❌ Upload with PII test failed');
    }
  }

  async testUploadEndpointBehavior() {
    console.log('🔍 Testing upload endpoint behavior...');
    try {
      // Test endpoint availability
      const testResponse = await fetch(`${this.baseUrl}/api/projects/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (testResponse.status === 400) {
        this.addResult('Upload Endpoint', 'PASS', 'Upload endpoint properly validates requests');
        console.log('✅ Upload endpoint validation working');
      } else {
        this.addResult('Upload Endpoint', 'WARN', `Unexpected response: ${testResponse.status}`);
        console.log('⚠️ Upload endpoint behavior unexpected');
      }
    } catch (error) {
      this.addResult('Upload Endpoint Behavior', 'FAIL', `Endpoint test error: ${error.message}`);
      console.log('❌ Upload endpoint test failed');
    }
  }

  async testComponentIntegration() {
    console.log('🧩 Testing component integration...');
    try {
      // Check if upload-modal.tsx has the required imports and functionality
      const uploadModalPath = path.join(process.cwd(), 'client/src/components/upload-modal.tsx');
      
      if (fs.existsSync(uploadModalPath)) {
        const content = fs.readFileSync(uploadModalPath, 'utf8');
        
        // Check for required imports
        const hasDialogImport = content.includes('PIIDetectionDialog');
        const hasStateVars = content.includes('showPIIDialog') && content.includes('tempFileInfo');
        const hasHandler = content.includes('handlePIIDecision');
        const hasResultCheck = content.includes('requiresPIIDecision');
        
        if (hasDialogImport && hasStateVars && hasHandler && hasResultCheck) {
          this.addResult('Component Integration', 'PASS', 'upload-modal.tsx has all required PII handling components');
          console.log('✅ Component integration complete');
        } else {
          this.addResult('Component Integration', 'PARTIAL', 'Some PII handling components missing');
          console.log('⚠️ Component integration incomplete');
        }
      } else {
        this.addResult('Component Integration', 'FAIL', 'upload-modal.tsx not found');
        console.log('❌ Component file not found');
      }
    } catch (error) {
      this.addResult('Component Integration', 'FAIL', `Integration test error: ${error.message}`);
      console.log('❌ Component integration test failed');
    }
  }

  addResult(testName, status, message) {
    this.results.push({
      test: testName,
      status: status,
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  async generateReport() {
    console.log('\n📊 SIGNED-IN UPLOAD PII FIX TEST RESULTS');
    console.log('=' * 50);
    
    const statusCounts = {
      PASS: this.results.filter(r => r.status === 'PASS').length,
      FAIL: this.results.filter(r => r.status === 'FAIL').length,
      WARN: this.results.filter(r => r.status === 'WARN').length,
      PARTIAL: this.results.filter(r => r.status === 'PARTIAL').length
    };

    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'FAIL' ? '❌' : 
                   result.status === 'WARN' ? '⚠️' : '🔄';
      console.log(`${icon} ${result.test}: ${result.message}`);
    });

    console.log('\n📈 SUMMARY:');
    console.log(`✅ Passed: ${statusCounts.PASS}`);
    console.log(`❌ Failed: ${statusCounts.FAIL}`);
    console.log(`⚠️ Warnings: ${statusCounts.WARN}`);
    console.log(`🔄 Partial: ${statusCounts.PARTIAL}`);

    // Overall status
    if (statusCounts.FAIL === 0 && statusCounts.PASS > 0) {
      console.log('\n🎉 OVERALL STATUS: PII FIX SUCCESSFUL');
      console.log('The signed-in upload workflow now properly handles PII detection!');
    } else if (statusCounts.FAIL > 0) {
      console.log('\n🚨 OVERALL STATUS: ISSUES DETECTED');
      console.log('Some aspects of the PII fix need attention.');
    } else {
      console.log('\n❓ OVERALL STATUS: INCONCLUSIVE');
      console.log('Unable to fully verify the PII fix.');
    }

    // Save detailed results
    const reportData = {
      testSuite: 'Signed-In Upload PII Fix Test',
      timestamp: new Date().toISOString(),
      summary: statusCounts,
      results: this.results,
      recommendations: this.generateRecommendations()
    };

    try {
      fs.writeFileSync('signed-in-upload-fix-results.json', JSON.stringify(reportData, null, 2));
      console.log('\n📝 Detailed results saved to signed-in-upload-fix-results.json');
    } catch (error) {
      console.log('⚠️ Could not save detailed results:', error.message);
    }
  }

  generateRecommendations() {
    const recommendations = [];
    
    const failedTests = this.results.filter(r => r.status === 'FAIL');
    if (failedTests.length > 0) {
      recommendations.push('Fix failed test cases to ensure complete PII handling');
    }

    const partialTests = this.results.filter(r => r.status === 'PARTIAL');
    if (partialTests.length > 0) {
      recommendations.push('Complete partial implementations for full functionality');
    }

    if (recommendations.length === 0) {
      recommendations.push('PII detection fix appears to be working correctly');
      recommendations.push('Consider testing with additional PII data types for thorough validation');
    }

    return recommendations;
  }
}

// Run the test
const tester = new SignedInUploadFixTester();
tester.runTest().catch(console.error);