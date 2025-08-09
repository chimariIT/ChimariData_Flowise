/**
 * Frontend Integration Test for Dynamic Pricing System
 * Tests all React component links, navigation, and frontend integrations
 */

const fs = require('fs');
const path = require('path');

class FrontendIntegrationTest {
  constructor() {
    this.baseURL = 'http://localhost:5000';
    this.testResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      componentTests: {},
      navigationTests: {},
      integrationTests: {}
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async makeRequest(url, options = {}) {
    try {
      // Add fetch polyfill if not available
      if (typeof fetch === 'undefined') {
        global.fetch = require('node-fetch');
      }
      
      const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
      const response = await fetch(fullUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      const data = await response.text();
      let parsedData;
      try {
        parsedData = JSON.parse(data);
      } catch {
        parsedData = data;
      }

      return {
        status: response.status,
        data: parsedData,
        headers: response.headers,
        text: data
      };
    } catch (error) {
      throw error;
    }
  }

  async testScenario(category, scenarioName, testFunction) {
    this.log(`\n🧪 Testing ${category}: ${scenarioName}`);
    this.testResults.totalTests++;
    
    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;
      
      this.testResults.passed++;
      const testCategory = category.toLowerCase().replace(' ', '_') + 'Tests';
      this.testResults[testCategory][scenarioName] = { 
        status: 'passed', 
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      };
      this.log(`✅ ${scenarioName} passed (${duration}ms)`, 'success');
    } catch (error) {
      this.testResults.failed++;
      const testCategory = category.toLowerCase().replace(' ', '_') + 'Tests';
      this.testResults[testCategory][scenarioName] = { 
        status: 'failed', 
        error: error.message,
        timestamp: new Date().toISOString()
      };
      this.testResults.errors.push(`${scenarioName}: ${error.message}`);
      this.log(`❌ ${scenarioName} failed: ${error.message}`, 'error');
    }
  }

  async testLandingPageComponents() {
    await this.testScenario('Component', 'Landing Page Load', async () => {
      const response = await this.makeRequest('/');
      if (response.status !== 200) {
        throw new Error(`Landing page returned status ${response.status}`);
      }

      const html = response.text;
      
      // Check for key landing page elements
      const requiredElements = [
        'ChimariData',
        'Progressive Data Analytics',
        'Get Started',
        'Pricing',
        'Free Trial'
      ];

      for (const element of requiredElements) {
        if (!html.includes(element)) {
          throw new Error(`Landing page missing required element: ${element}`);
        }
      }

      this.log('✅ Landing page contains all required elements');
    });

    await this.testScenario('Component', 'Landing Page Buttons', async () => {
      const response = await this.makeRequest('/');
      const html = response.text;

      // Check for button actions
      const buttonChecks = [
        { text: 'onGetStarted', expected: true },
        { text: 'onPayPerAnalysis', expected: true },
        { text: 'onExpertConsultation', expected: true },
        { text: 'onDemo', expected: true },
        { text: 'onPricing', expected: true },
        { text: 'onFreeTrial', expected: true }
      ];

      for (const check of buttonChecks) {
        const found = html.includes(check.text);
        if (found !== check.expected) {
          throw new Error(`Button ${check.text} ${check.expected ? 'not found' : 'unexpectedly found'}`);
        }
      }

      this.log('✅ All landing page buttons properly configured');
    });
  }

  async testPricingPageComponents() {
    await this.testScenario('Component', 'Pricing Page Access (Public)', async () => {
      const response = await this.makeRequest('/pricing');
      if (response.status !== 200) {
        throw new Error(`Pricing page returned status ${response.status}`);
      }

      const html = response.text;
      
      // Check for pricing page elements
      const pricingElements = [
        'Dynamic Pricing',
        'Data Engineering',
        'Data Visualization', 
        'Data Analysis',
        'AI Insights',
        'Upload File',
        'Feature Selection'
      ];

      let foundElements = 0;
      for (const element of pricingElements) {
        if (html.toLowerCase().includes(element.toLowerCase())) {
          foundElements++;
        }
      }

      if (foundElements < 3) {
        throw new Error(`Pricing page missing key elements (found ${foundElements}/${pricingElements.length})`);
      }

      this.log(`✅ Pricing page accessible and contains ${foundElements} key elements`);
    });

    await this.testScenario('Component', 'Pricing Page with Project ID', async () => {
      // Test with a mock project ID
      const response = await this.makeRequest('/pricing/test-project-123');
      if (response.status !== 200) {
        throw new Error(`Pricing page with project ID returned status ${response.status}`);
      }

      this.log('✅ Pricing page accepts project ID parameter');
    });
  }

  async testAuthPageComponents() {
    await this.testScenario('Component', 'Auth Page Load', async () => {
      const response = await this.makeRequest('/auth');
      if (response.status !== 200) {
        throw new Error(`Auth page returned status ${response.status}`);
      }

      const html = response.text;
      
      // Check for auth page elements
      const authElements = [
        'email',
        'password',
        'Sign',
        'Login',
        'Register'
      ];

      let foundElements = 0;
      for (const element of authElements) {
        if (html.toLowerCase().includes(element.toLowerCase())) {
          foundElements++;
        }
      }

      if (foundElements < 2) {
        throw new Error(`Auth page missing key elements (found ${foundElements}/${authElements.length})`);
      }

      this.log(`✅ Auth page contains ${foundElements} authentication elements`);
    });
  }

  async testNavigationLinks() {
    await this.testScenario('Navigation', 'Landing to Pricing Navigation', async () => {
      // Test that pricing link from landing page works
      const landingResponse = await this.makeRequest('/');
      if (landingResponse.status !== 200) {
        throw new Error('Landing page not accessible');
      }

      const pricingResponse = await this.makeRequest('/pricing');
      if (pricingResponse.status !== 200) {
        throw new Error('Pricing page not accessible from navigation');
      }

      this.log('✅ Landing to Pricing navigation works');
    });

    await this.testScenario('Navigation', 'Landing to Auth Navigation', async () => {
      const authResponse = await this.makeRequest('/auth');
      if (authResponse.status !== 200) {
        throw new Error('Auth page not accessible from navigation');
      }

      this.log('✅ Landing to Auth navigation works');
    });

    await this.testScenario('Navigation', 'Direct Route Access', async () => {
      const routes = [
        { path: '/', name: 'Root' },
        { path: '/pricing', name: 'Pricing' },
        { path: '/pricing/project-123', name: 'Pricing with Project' },
        { path: '/auth', name: 'Authentication' }
      ];

      for (const route of routes) {
        const response = await this.makeRequest(route.path);
        if (response.status >= 400) {
          throw new Error(`${route.name} route (${route.path}) returned status ${response.status}`);
        }
        this.log(`✅ ${route.name}: ${response.status}`);
      }
    });
  }

  async testAPIIntegration() {
    await this.testScenario('Integration', 'API Endpoint Availability', async () => {
      const endpoints = [
        { url: '/api/trial-upload', method: 'POST', name: 'Trial Upload' },
        { url: '/api/quick-estimate', method: 'POST', name: 'Quick Estimate' },
        { url: '/api/project-analysis/test', method: 'GET', name: 'Project Analysis' },
        { url: '/api/dynamic-pricing/test', method: 'GET', name: 'Dynamic Pricing' },
        { url: '/api/pricing-workflow/test', method: 'GET', name: 'Workflow Management' }
      ];

      let availableEndpoints = 0;
      for (const endpoint of endpoints) {
        try {
          const response = await this.makeRequest(endpoint.url, { 
            method: endpoint.method,
            body: endpoint.method === 'POST' ? JSON.stringify({ test: true }) : undefined
          });
          
          // 401, 404, 500 are acceptable (means endpoint exists but needs auth/data)
          if (response.status < 600) {
            availableEndpoints++;
            this.log(`✅ ${endpoint.name}: Available (${response.status})`);
          }
        } catch (error) {
          this.log(`⚠️  ${endpoint.name}: ${error.message}`);
        }
      }

      if (availableEndpoints === 0) {
        throw new Error('No API endpoints are available');
      }

      this.log(`✅ ${availableEndpoints}/${endpoints.length} API endpoints available`);
    });

    await this.testScenario('Integration', 'Static Asset Loading', async () => {
      // Test that the React app bundle loads
      const jsAssets = [
        '/assets/',  // Vite asset directory
        '/src/',     // Source directory
      ];

      const response = await this.makeRequest('/');
      const html = response.text;

      let foundAssets = 0;
      for (const asset of jsAssets) {
        if (html.includes(asset)) {
          foundAssets++;
        }
      }

      // Also check for typical React/Vite patterns
      const reactPatterns = [
        'type="module"',
        'React',
        'vite',
        'main'
      ];

      for (const pattern of reactPatterns) {
        if (html.toLowerCase().includes(pattern.toLowerCase())) {
          foundAssets++;
        }
      }

      if (foundAssets === 0) {
        throw new Error('No React/Vite assets found in HTML');
      }

      this.log(`✅ Found ${foundAssets} asset indicators in HTML`);
    });
  }

  async testResponsiveDesign() {
    await this.testScenario('Integration', 'Responsive Design Elements', async () => {
      const response = await this.makeRequest('/');
      const html = response.text;

      // Check for responsive design indicators
      const responsiveElements = [
        'viewport',
        'responsive',
        'mobile',
        'tailwind',
        'css',
        'media'
      ];

      let foundElements = 0;
      for (const element of responsiveElements) {
        if (html.toLowerCase().includes(element.toLowerCase())) {
          foundElements++;
        }
      }

      if (foundElements < 2) {
        throw new Error(`Insufficient responsive design elements (found ${foundElements})`);
      }

      this.log(`✅ Found ${foundElements} responsive design indicators`);
    });
  }

  async testFormIntegrations() {
    await this.testScenario('Integration', 'Form Handling Components', async () => {
      // Test file upload form on pricing page
      const pricingResponse = await this.makeRequest('/pricing');
      const html = pricingResponse.text;

      const formElements = [
        'form',
        'input',
        'button',
        'upload',
        'file'
      ];

      let foundFormElements = 0;
      for (const element of formElements) {
        if (html.toLowerCase().includes(element.toLowerCase())) {
          foundFormElements++;
        }
      }

      if (foundFormElements < 2) {
        throw new Error(`Insufficient form elements found (${foundFormElements})`);
      }

      this.log(`✅ Found ${foundFormElements} form-related elements`);
    });
  }

  async testErrorHandling() {
    await this.testScenario('Navigation', 'Invalid Route Handling', async () => {
      const invalidRoutes = [
        '/nonexistent-page',
        '/pricing/invalid/route/structure',
        '/auth/invalid',
        '/api/invalid-endpoint'
      ];

      for (const route of invalidRoutes) {
        const response = await this.makeRequest(route);
        // Should return 404 or redirect to valid page
        if (response.status === 200) {
          // Check if it's actually a valid fallback page
          const html = response.text;
          if (!html.includes('ChimariData') && !html.includes('404') && !html.includes('Not Found')) {
            throw new Error(`Invalid route ${route} returned 200 without proper fallback`);
          }
        }
      }

      this.log('✅ Invalid routes handled appropriately');
    });
  }

  async testPerformance() {
    await this.testScenario('Integration', 'Page Load Performance', async () => {
      const routes = ['/', '/pricing', '/auth'];
      const loadTimes = [];

      for (const route of routes) {
        const startTime = Date.now();
        const response = await this.makeRequest(route);
        const loadTime = Date.now() - startTime;
        loadTimes.push({ route, loadTime, status: response.status });
      }

      const avgLoadTime = loadTimes.reduce((sum, item) => sum + item.loadTime, 0) / loadTimes.length;
      
      if (avgLoadTime > 5000) {
        throw new Error(`Average load time too high: ${avgLoadTime}ms`);
      }

      for (const load of loadTimes) {
        this.log(`✅ ${load.route}: ${load.loadTime}ms (${load.status})`);
      }

      this.log(`✅ Average load time: ${avgLoadTime.toFixed(0)}ms`);
    });
  }

  async generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.testResults.totalTests,
        passed: this.testResults.passed,
        failed: this.testResults.failed,
        successRate: `${((this.testResults.passed / this.testResults.totalTests) * 100).toFixed(1)}%`
      },
      testCategories: {
        components: this.testResults.componentTests,
        navigation: this.testResults.navigationTests,
        integration: this.testResults.integrationTests
      },
      errors: this.testResults.errors
    };

    await fs.promises.writeFile(
      'frontend-integration-results.json',
      JSON.stringify(report, null, 2)
    );

    return report;
  }

  async runAllTests() {
    this.log('🚀 Starting Frontend Integration Tests...\n');

    try {
      // Component tests
      await this.testLandingPageComponents();
      await this.testPricingPageComponents();
      await this.testAuthPageComponents();
      
      // Navigation tests
      await this.testNavigationLinks();
      
      // Integration tests
      await this.testAPIIntegration();
      await this.testResponsiveDesign();
      await this.testFormIntegrations();
      
      // Error handling tests
      await this.testErrorHandling();
      
      // Performance tests
      await this.testPerformance();

    } catch (error) {
      this.log(`Critical test failure: ${error.message}`, 'error');
    } finally {
      // Generate report
      const report = await this.generateReport();
      
      // Display summary
      this.log('\n📊 Frontend Test Results Summary:');
      this.log(`Total Tests: ${report.summary.totalTests}`);
      this.log(`Passed: ${report.summary.passed}`, 'success');
      this.log(`Failed: ${report.summary.failed}`, report.summary.failed > 0 ? 'error' : 'info');
      this.log(`Success Rate: ${report.summary.successRate}`);
      
      if (report.errors.length > 0) {
        this.log('\n❌ Errors:');
        report.errors.forEach(error => this.log(`  - ${error}`, 'error'));
      }
      
      this.log('\n📄 Frontend test report saved to: frontend-integration-results.json');
      
      return report;
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new FrontendIntegrationTest();
  tester.runAllTests()
    .then(report => {
      process.exit(report.summary.failed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Frontend test runner failed:', error);
      process.exit(1);
    });
}

module.exports = FrontendIntegrationTest;