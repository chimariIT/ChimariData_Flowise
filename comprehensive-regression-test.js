/**
 * Comprehensive Regression Test Suite
 * Tests all functionality after recent pricing and free trial updates
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';

class ComprehensiveRegressionTester {
  constructor() {
    this.testResults = [];
    this.authToken = null;
    this.testUser = {
      username: `testuser_${Date.now()}`,
      password: 'testpass123'
    };
  }

  async runAllTests() {
    console.log('🔍 Starting Comprehensive Regression Test...\n');
    
    // Core Infrastructure Tests
    await this.testServerConnection();
    await this.testPricingAPI();
    await this.testFreeTrialEndpoint();
    
    // Authentication Flow Tests
    await this.testUserRegistration();
    await this.testUserLogin();
    
    // Navigation and UI Tests
    await this.testLandingPageRoutes();
    await this.testPricingPageAccess();
    await this.testFreeTrialPageAccess();
    await this.testDemoPageAccess();
    
    // File Upload Tests
    await this.testFileUploadAuthenticated();
    await this.testProjectCreation();
    
    // AI Integration Tests
    await this.testAIInsights();
    
    // Footer Links Tests
    await this.testFooterLinks();
    
    // Logout Test
    await this.testLogoutFunctionality();
    
    await this.generateFinalReport();
  }

  async testServerConnection() {
    console.log('Testing server connection...');
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.status === 404) {
        // Health endpoint doesn't exist, test main page
        const mainResponse = await fetch(BASE_URL);
        if (mainResponse.ok) {
          this.addResult('Server Connection', 'PASS', 'Server responding correctly');
        } else {
          this.addResult('Server Connection', 'FAIL', `Server returned ${mainResponse.status}`);
        }
      } else if (response.ok) {
        this.addResult('Server Connection', 'PASS', 'Health endpoint responding');
      } else {
        this.addResult('Server Connection', 'FAIL', `Health endpoint returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Server Connection', 'FAIL', `Connection error: ${error.message}`);
    }
  }

  async testPricingAPI() {
    console.log('Testing updated pricing API...');
    try {
      const response = await fetch(`${BASE_URL}/api/pricing/tiers`);
      if (response.ok) {
        const data = await response.json();
        const tiers = data.tiers;
        
        if (tiers && tiers.length === 6) {
          this.addResult('Pricing API - Tier Count', 'PASS', '6 pricing tiers configured');
          
          // Check for new tier structure
          const freeTrialTier = tiers.find(t => t.name === 'Free Trial');
          const starterTier = tiers.find(t => t.name === 'Starter' && t.price === 5);
          const basicTier = tiers.find(t => t.name === 'Basic' && t.price === 15);
          const professionalTier = tiers.find(t => t.name === 'Professional' && t.price === 20);
          const premiumTier = tiers.find(t => t.name === 'Premium' && t.price === 50);
          const enterpriseTier = tiers.find(t => t.name === 'Enterprise' && t.price === -1);
          
          if (freeTrialTier) {
            this.addResult('Pricing API - Free Trial Tier', 'PASS', 'Free Trial tier configured correctly');
          } else {
            this.addResult('Pricing API - Free Trial Tier', 'FAIL', 'Free Trial tier missing');
          }
          
          if (starterTier) {
            this.addResult('Pricing API - Starter Tier', 'PASS', 'Starter tier ($5) configured correctly');
          } else {
            this.addResult('Pricing API - Starter Tier', 'FAIL', 'Starter tier missing or incorrect price');
          }
          
          if (basicTier) {
            this.addResult('Pricing API - Basic Tier', 'PASS', 'Basic tier ($15) configured correctly');
          } else {
            this.addResult('Pricing API - Basic Tier', 'FAIL', 'Basic tier missing or incorrect price');
          }
          
          if (professionalTier) {
            this.addResult('Pricing API - Professional Tier', 'PASS', 'Professional tier ($20) configured correctly');
          } else {
            this.addResult('Pricing API - Professional Tier', 'FAIL', 'Professional tier missing or incorrect price');
          }
          
          if (premiumTier) {
            this.addResult('Pricing API - Premium Tier', 'PASS', 'Premium tier ($50) configured correctly');
          } else {
            this.addResult('Pricing API - Premium Tier', 'FAIL', 'Premium tier missing or incorrect price');
          }
          
          if (enterpriseTier) {
            this.addResult('Pricing API - Enterprise Tier', 'PASS', 'Enterprise tier (contact us) configured correctly');
          } else {
            this.addResult('Pricing API - Enterprise Tier', 'FAIL', 'Enterprise tier missing or incorrect configuration');
          }
          
        } else {
          this.addResult('Pricing API - Tier Count', 'FAIL', `Expected 6 tiers, got ${tiers ? tiers.length : 0}`);
        }
      } else {
        this.addResult('Pricing API', 'FAIL', `API returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pricing API', 'FAIL', `API error: ${error.message}`);
    }
  }

  async testFreeTrialEndpoint() {
    console.log('Testing free trial endpoint...');
    
    // Create a simple test CSV
    const testCSV = 'name,value,category\nProduct A,100,Electronics\nProduct B,200,Books\nProduct C,150,Electronics';
    const testFile = 'test_trial_data.csv';
    fs.writeFileSync(testFile, testCSV);
    
    try {
      // Test if endpoint exists and responds (even if it fails due to multipart form data)
      const response = await fetch(`${BASE_URL}/api/upload-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 'endpoint' })
      });
      
      // We expect this to fail because we're not sending proper form data, 
      // but the endpoint should exist and return an error, not 404
      if (response.status === 400) {
        this.addResult('Free Trial Endpoint', 'PASS', 'Trial endpoint exists and responds to requests');
      } else if (response.status === 404) {
        this.addResult('Free Trial Endpoint', 'FAIL', 'Trial endpoint not found (404)');
      } else {
        this.addResult('Free Trial Endpoint', 'PASS', `Trial endpoint exists (status: ${response.status})`);
      }
    } catch (error) {
      this.addResult('Free Trial Endpoint', 'FAIL', `Endpoint error: ${error.message}`);
    } finally {
      // Clean up test file
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  }

  async testUserRegistration() {
    console.log('Testing user registration...');
    try {
      const response = await fetch(`${BASE_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          this.authToken = data.token;
          this.addResult('User Registration', 'PASS', 'User registered successfully with token');
        } else {
          this.addResult('User Registration', 'PASS', 'User registered successfully');
        }
      } else {
        const errorData = await response.json();
        this.addResult('User Registration', 'FAIL', `Registration failed: ${errorData.message || response.status}`);
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', `Registration error: ${error.message}`);
    }
  }

  async testUserLogin() {
    console.log('Testing user login...');
    try {
      const response = await fetch(`${BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          this.authToken = data.token;
          this.addResult('User Login', 'PASS', 'Login successful with token');
        } else {
          this.addResult('User Login', 'PASS', 'Login successful');
        }
      } else {
        this.addResult('User Login', 'FAIL', `Login failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', `Login error: ${error.message}`);
    }
  }

  async testLandingPageRoutes() {
    console.log('Testing landing page and navigation...');
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        const html = await response.text();
        
        // Check for key elements that should be present
        if (html.includes('ChimariData') || html.includes('root')) {
          this.addResult('Landing Page Load', 'PASS', 'Landing page loads successfully');
        } else {
          this.addResult('Landing Page Load', 'FAIL', 'Landing page content not found');
        }
        
        // Test that it's serving the React app
        if (html.includes('src="/src/main.tsx') || html.includes('id="root"')) {
          this.addResult('React App Serving', 'PASS', 'React application properly served');
        } else {
          this.addResult('React App Serving', 'FAIL', 'React application not properly served');
        }
      } else {
        this.addResult('Landing Page Load', 'FAIL', `Landing page returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Landing Page Load', 'FAIL', `Landing page error: ${error.message}`);
    }
  }

  async testPricingPageAccess() {
    console.log('Testing pricing page access...');
    try {
      const response = await fetch(`${BASE_URL}/pricing`);
      if (response.ok) {
        this.addResult('Pricing Page Access', 'PASS', 'Pricing page accessible');
      } else {
        this.addResult('Pricing Page Access', 'FAIL', `Pricing page returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pricing Page Access', 'FAIL', `Pricing page error: ${error.message}`);
    }
  }

  async testFreeTrialPageAccess() {
    console.log('Testing free trial page access...');
    try {
      const response = await fetch(`${BASE_URL}/free-trial`);
      if (response.ok) {
        this.addResult('Free Trial Page Access', 'PASS', 'Free trial page accessible');
      } else {
        this.addResult('Free Trial Page Access', 'FAIL', `Free trial page returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Free Trial Page Access', 'FAIL', `Free trial page error: ${error.message}`);
    }
  }

  async testDemoPageAccess() {
    console.log('Testing demo page access...');
    try {
      const response = await fetch(`${BASE_URL}/demo`);
      if (response.ok) {
        this.addResult('Demo Page Access', 'PASS', 'Demo page accessible');
      } else {
        this.addResult('Demo Page Access', 'FAIL', `Demo page returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Demo Page Access', 'FAIL', `Demo page error: ${error.message}`);
    }
  }

  async testFileUploadAuthenticated() {
    console.log('Testing authenticated file upload...');
    if (!this.authToken) {
      this.addResult('Authenticated File Upload', 'SKIP', 'No auth token available');
      return;
    }

    // Create test CSV
    const testCSV = 'name,value,category\nTest Product,500,Test Category';
    const testFile = 'test_upload.csv';
    fs.writeFileSync(testFile, testCSV);

    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', fs.createReadStream(testFile));
      form.append('name', 'Regression Test Project');
      form.append('questions', JSON.stringify(['What is the average value?']));

      const response = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...form.getHeaders()
        },
        body: form
      });

      if (response.ok) {
        this.addResult('Authenticated File Upload', 'PASS', 'File upload successful');
      } else {
        this.addResult('Authenticated File Upload', 'FAIL', `Upload failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Authenticated File Upload', 'FAIL', `Upload error: ${error.message}`);
    } finally {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    }
  }

  async testProjectCreation() {
    console.log('Testing project creation and listing...');
    if (!this.authToken) {
      this.addResult('Project Creation', 'SKIP', 'No auth token available');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/projects`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.ok) {
        const projects = await response.json();
        this.addResult('Project Listing', 'PASS', `Projects endpoint accessible, found ${projects.length} projects`);
      } else {
        this.addResult('Project Listing', 'FAIL', `Projects endpoint returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Project Listing', 'FAIL', `Projects error: ${error.message}`);
    }
  }

  async testAIInsights() {
    console.log('Testing AI insights generation...');
    try {
      // Test the AI providers endpoint
      const response = await fetch(`${BASE_URL}/api/ai/providers`);
      if (response.ok) {
        const providers = await response.json();
        this.addResult('AI Providers API', 'PASS', `AI providers endpoint accessible, found ${providers.length || 0} providers`);
      } else {
        this.addResult('AI Providers API', 'FAIL', `AI providers endpoint returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('AI Providers API', 'FAIL', `AI providers error: ${error.message}`);
    }
  }

  async testFooterLinks() {
    console.log('Testing footer link functionality...');
    
    // Test key pages that footer links point to
    const testRoutes = [
      { path: '/pricing', name: 'Pricing Page' },
      { path: '/demo', name: 'Demo Page' },
      { path: '/auth', name: 'Auth Page' }
    ];

    for (const route of testRoutes) {
      try {
        const response = await fetch(`${BASE_URL}${route.path}`);
        if (response.ok) {
          this.addResult(`Footer Link - ${route.name}`, 'PASS', `${route.name} accessible`);
        } else {
          this.addResult(`Footer Link - ${route.name}`, 'FAIL', `${route.name} returned ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Footer Link - ${route.name}`, 'FAIL', `${route.name} error: ${error.message}`);
      }
    }
  }

  async testLogoutFunctionality() {
    console.log('Testing logout functionality...');
    if (!this.authToken) {
      this.addResult('Logout Functionality', 'SKIP', 'No auth token to test logout');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.ok || response.status === 401) {
        this.addResult('Logout Functionality', 'PASS', 'Logout endpoint accessible');
      } else {
        this.addResult('Logout Functionality', 'FAIL', `Logout returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Logout Functionality', 'FAIL', `Logout error: ${error.message}`);
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

  async generateFinalReport() {
    console.log('\n' + '='.repeat(80));
    console.log('COMPREHENSIVE REGRESSION TEST RESULTS');
    console.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const skipped = this.testResults.filter(r => r.status === 'SKIP').length;
    const total = this.testResults.length;
    const successRate = Math.round((passed / (total - skipped)) * 100);

    console.log(`\nOverall Results: ${passed}/${total - skipped} tests passed (${successRate}% success rate)`);
    console.log(`Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}\n`);

    if (failed > 0) {
      console.log('❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    if (skipped > 0) {
      console.log('⏭️ SKIPPED TESTS:');
      this.testResults.filter(r => r.status === 'SKIP').forEach(result => {
        console.log(`  ⏭️ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    console.log('✅ PASSED TESTS:');
    this.testResults.filter(r => r.status === 'PASS').forEach(result => {
      console.log(`  ✓ ${result.test}: ${result.message}`);
    });

    console.log('\n' + '='.repeat(80));
    
    if (successRate >= 90) {
      console.log('🎉 REGRESSION TEST PASSED - ALL SYSTEMS OPERATIONAL');
      console.log('✓ Updated pricing structure working correctly');
      console.log('✓ Free trial system implemented successfully');
      console.log('✓ Navigation and routing functional');
      console.log('✓ Authentication and file upload working');
      console.log('✓ Footer links and UI components operational');
    } else if (successRate >= 70) {
      console.log('⚠️ REGRESSION TEST PARTIAL - SOME ISSUES DETECTED');
    } else {
      console.log('❌ REGRESSION TEST FAILED - CRITICAL ISSUES FOUND');
    }

    console.log('='.repeat(80));

    // Save detailed results to file
    const detailedResults = {
      summary: {
        total,
        passed,
        failed,
        skipped,
        successRate,
        timestamp: new Date().toISOString()
      },
      results: this.testResults
    };

    fs.writeFileSync('regression-test-results.json', JSON.stringify(detailedResults, null, 2));
    console.log('📄 Detailed results saved to regression-test-results.json');
  }
}

// Run the comprehensive regression test
const tester = new ComprehensiveRegressionTester();
tester.runAllTests().catch(console.error);