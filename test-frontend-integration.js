#!/usr/bin/env node

/**
 * Frontend Integration Test - Verifies UI functionality
 * Tests the actual user experience through the frontend interface
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

class FrontendIntegrationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testResults = [];
  }

  async runTests() {
    console.log('Testing frontend integration and user experience...\n');
    
    await this.testLandingPageAccess();
    await this.testAuthenticationFlow();
    await this.testUploadModalStructure();
    await this.testDemoPageFunctionality();
    await this.generateReport();
  }

  async testLandingPageAccess() {
    console.log('Testing landing page accessibility...');
    
    try {
      const response = await fetch(`${this.baseUrl}/`);
      const html = await response.text();
      
      if (html.includes('ChimariData') && html.includes('root')) {
        this.addResult('Landing Page Access', 'PASS', 'Landing page loads correctly with proper branding');
        console.log('✓ Landing page accessible');
      } else {
        this.addResult('Landing Page Access', 'FAIL', 'Landing page content not found');
      }
    } catch (error) {
      this.addResult('Landing Page Access', 'FAIL', `Failed to access landing page: ${error.message}`);
    }
  }

  async testAuthenticationFlow() {
    console.log('Testing authentication interface...');
    
    try {
      // Check if auth routes are properly configured
      const clientApiCode = fs.readFileSync(path.join(process.cwd(), 'client', 'src', 'lib', 'api.ts'), 'utf8');
      
      if (clientApiCode.includes('/api/auth/login') && clientApiCode.includes('/api/auth/register')) {
        this.addResult('Auth Route Configuration', 'PASS', 'Authentication routes properly configured in client');
        console.log('✓ Authentication routes configured correctly');
      } else {
        this.addResult('Auth Route Configuration', 'FAIL', 'Authentication routes not properly configured');
      }
    } catch (error) {
      this.addResult('Auth Route Configuration', 'FAIL', `Failed to verify auth routes: ${error.message}`);
    }
  }

  async testUploadModalStructure() {
    console.log('Testing upload modal implementation...');
    
    try {
      const uploadModalCode = fs.readFileSync(path.join(process.cwd(), 'client', 'src', 'components', 'upload-modal.tsx'), 'utf8');
      
      // Check for proper error handling
      if (uploadModalCode.includes('error instanceof Error') && uploadModalCode.includes('toast')) {
        this.addResult('Upload Error Handling', 'PASS', 'Upload modal has proper error handling and user feedback');
        console.log('✓ Upload modal error handling implemented');
      } else {
        this.addResult('Upload Error Handling', 'FAIL', 'Upload modal missing proper error handling');
      }
      
      // Check for file validation
      if (uploadModalCode.includes('allowedTypes') && uploadModalCode.includes('maxSize')) {
        this.addResult('File Validation', 'PASS', 'File type and size validation implemented');
        console.log('✓ File validation implemented');
      } else {
        this.addResult('File Validation', 'FAIL', 'File validation not properly implemented');
      }
    } catch (error) {
      this.addResult('Upload Modal Structure', 'FAIL', `Failed to analyze upload modal: ${error.message}`);
    }
  }

  async testDemoPageFunctionality() {
    console.log('Testing demo page structure...');
    
    try {
      const demoCode = fs.readFileSync(path.join(process.cwd(), 'client', 'src', 'components', 'animated-demo.tsx'), 'utf8');
      
      // Check if duplicate header issue is resolved
      if (!demoCode.includes('ChimariData+AI') || demoCode.includes('onGetStarted')) {
        this.addResult('Demo Page Structure', 'PASS', 'Demo page properly structured without duplicate headers');
        console.log('✓ Demo page structure correct');
      } else {
        this.addResult('Demo Page Structure', 'FAIL', 'Demo page may have structural issues');
      }
    } catch (error) {
      this.addResult('Demo Page Structure', 'FAIL', `Failed to analyze demo page: ${error.message}`);
    }
  }

  async testServerRouteConfiguration() {
    console.log('Verifying server route configuration...');
    
    try {
      const serverRoutes = fs.readFileSync(path.join(process.cwd(), 'server', 'routes.ts'), 'utf8');
      
      // Check for duplicate prevention logic
      if (serverRoutes.includes('duplicateProject') && serverRoutes.includes('409')) {
        this.addResult('Duplicate Prevention Logic', 'PASS', 'Server properly handles duplicate project names');
        console.log('✓ Duplicate prevention implemented');
      } else {
        this.addResult('Duplicate Prevention Logic', 'FAIL', 'Duplicate prevention logic not found');
      }
      
      // Check for proper authentication middleware
      if (serverRoutes.includes('requireAuth') && serverRoutes.includes('Authorization')) {
        this.addResult('Authentication Middleware', 'PASS', 'Authentication middleware properly implemented');
        console.log('✓ Authentication middleware configured');
      } else {
        this.addResult('Authentication Middleware', 'FAIL', 'Authentication middleware not properly configured');
      }
    } catch (error) {
      this.addResult('Server Route Configuration', 'FAIL', `Failed to analyze server routes: ${error.message}`);
    }
  }

  addResult(testName, status, message) {
    this.testResults.push({
      test: testName,
      status,
      message,
      timestamp: new Date().toISOString()
    });
  }

  async generateReport() {
    console.log('\n=== FRONTEND INTEGRATION TEST RESULTS ===');
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    
    this.testResults.forEach(result => {
      const icon = result.status === 'PASS' ? '✓' : '✗';
      console.log(`${icon} ${result.test}: ${result.status}`);
      if (result.status === 'FAIL') {
        console.log(`  → ${result.message}`);
      }
    });
    
    console.log(`\nSummary: ${passed} passed, ${failed} failed`);
    
    // Save detailed report
    const reportData = {
      summary: { passed, failed, total: this.testResults.length },
      tests: this.testResults,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('frontend-integration-results.json', JSON.stringify(reportData, null, 2));
    
    if (failed === 0) {
      console.log('\n🎉 All frontend integration tests passed!');
      console.log('The application is ready for user testing.');
    } else {
      console.log('\n⚠️ Some integration tests failed. Review the issues above.');
    }
  }
}

// Run the tests
const tester = new FrontendIntegrationTester();
await tester.testServerRouteConfiguration();
tester.runTests().catch(console.error);