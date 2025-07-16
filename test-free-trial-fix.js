/**
 * Test Free Trial Fix and Authentication
 * Tests both the free trial upload and authenticated analysis
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

class ComprehensiveTestRunner {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testCsvContent = `name,age,email,salary
John Doe,25,john@example.com,50000
Jane Smith,30,jane@example.com,65000
Bob Johnson,35,bob@example.com,70000`;
  }

  async runAllTests() {
    console.log('🚀 Running comprehensive tests...\n');
    
    try {
      // Test 1: Free trial upload
      console.log('📋 Test 1: Free trial upload workflow');
      await this.testFreeTrialWorkflow();
      
      // Test 2: Authentication system
      console.log('\n🔐 Test 2: Authentication system');
      await this.testAuthenticationSystem();
      
      // Test 3: Advanced analysis with authentication
      console.log('\n⚙️ Test 3: Advanced analysis with authentication');
      await this.testAdvancedAnalysisAuth();
      
      console.log('\n✅ All tests completed successfully!');
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }

  async testFreeTrialWorkflow() {
    // Step 1: Trial upload
    const formData = new FormData();
    formData.append('file', Buffer.from(this.testCsvContent), {
      filename: 'test.csv',
      contentType: 'text/csv'
    });

    const uploadResponse = await fetch(`${this.baseUrl}/api/trial-upload`, {
      method: 'POST',
      body: formData
    });

    const uploadResult = await uploadResponse.json();
    console.log('  ✅ Upload result:', uploadResult.success ? 'Success' : 'Failed');

    if (uploadResult.success && uploadResult.requiresPIIDecision) {
      // Step 2: PII decision
      const piiResponse = await fetch(`${this.baseUrl}/api/trial-pii-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempFileId: uploadResult.tempFileId,
          decision: 'include'
        })
      });

      const piiResult = await piiResponse.json();
      console.log('  ✅ PII decision result:', piiResult.success ? 'Success' : 'Failed');
      
      if (piiResult.success && piiResult.trialResults) {
        console.log('  ✅ Trial results received with', Object.keys(piiResult.trialResults).length, 'sections');
        return true;
      }
    }
    
    throw new Error('Free trial workflow failed');
  }

  async testAuthenticationSystem() {
    // Test user registration
    const registerResponse = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testuser@example.com',
        password: 'testpass123',
        firstName: 'Test',
        lastName: 'User'
      })
    });

    const registerResult = await registerResponse.json();
    console.log('  ✅ Registration result:', registerResult.success ? 'Success' : 'Failed');
    
    if (registerResult.success) {
      // Test user login
      const loginResponse = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'testuser@example.com',
          password: 'testpass123'
        })
      });

      const loginResult = await loginResponse.json();
      console.log('  ✅ Login result:', loginResult.success ? 'Success' : 'Failed');
      
      if (loginResult.success && loginResult.token) {
        this.authToken = loginResult.token;
        console.log('  ✅ Auth token received');
        return true;
      }
    }
    
    throw new Error('Authentication system failed');
  }

  async testAdvancedAnalysisAuth() {
    if (!this.authToken) {
      throw new Error('No auth token available');
    }

    // First create a project by uploading a file
    const formData = new FormData();
    formData.append('file', Buffer.from(this.testCsvContent), {
      filename: 'auth-test.csv',
      contentType: 'text/csv'
    });

    const uploadResponse = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      },
      body: formData
    });

    const uploadResult = await uploadResponse.json();
    console.log('  ✅ Authenticated upload result:', uploadResult.success ? 'Success' : 'Failed');

    if (uploadResult.success) {
      let projectId = uploadResult.projectId;
      
      // Handle PII decision if required
      if (uploadResult.requiresPIIDecision) {
        const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.authToken}`
          },
          body: JSON.stringify({
            tempFileId: uploadResult.tempFileId,
            decision: 'include'
          })
        });

        const piiResult = await piiResponse.json();
        console.log('  ✅ PII decision result:', piiResult.success ? 'Success' : 'Failed');
        
        if (piiResult.success && piiResult.project) {
          projectId = piiResult.project.id;
        }
      }

      // Test step-by-step analysis
      const analysisResponse = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId,
          config: {
            analysisType: 'descriptive',
            question: 'What are the basic statistics of this dataset?',
            targetVariable: 'salary',
            multivariateVariables: ['age']
          }
        })
      });

      const analysisResult = await analysisResponse.json();
      console.log('  ✅ Advanced analysis result:', analysisResult.success ? 'Success' : 'Failed');
      
      if (analysisResult.success) {
        console.log('  ✅ Analysis completed successfully');
        return true;
      } else {
        console.log('  ❌ Analysis error:', analysisResult.error);
      }
    }
    
    throw new Error('Advanced analysis authentication failed');
  }
}

// Run tests
const testRunner = new ComprehensiveTestRunner();
testRunner.runAllTests().catch(console.error);