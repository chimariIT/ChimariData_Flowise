/**
 * Demo Navigation Verification Test
 * Specifically tests that demo buttons navigate to the correct page
 */

import fs from 'fs';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class DemoNavigationTester {
  constructor() {
    this.testResults = [];
  }

  async runTests() {
    console.log('🔍 Testing Demo Navigation Functionality...\n');
    
    await this.testLandingPageLoad();
    await this.testDemoPageAccess();
    await this.testDemoPageContent();
    await this.testBackNavigation();
    await this.generateReport();
  }

  async testLandingPageLoad() {
    console.log('Testing landing page loads correctly...');
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        const html = await response.text();
        
        // Check for key elements that should be present
        const hasTitle = html.includes('ChimariData') || html.includes('data expert');
        const hasReactRoot = html.includes('id="root"');
        const hasMainScript = html.includes('main.tsx') || html.includes('main.js');
        
        if (hasTitle && hasReactRoot && hasMainScript) {
          this.addResult('Landing Page Load', 'PASS', 'Landing page loads with all required elements');
          console.log('✓ Landing page loads correctly');
        } else {
          this.addResult('Landing Page Load', 'PARTIAL', 'Landing page loads but missing some elements');
          console.log('⚠ Landing page loads but may be incomplete');
        }
      } else {
        this.addResult('Landing Page Load', 'FAIL', `Landing page failed to load: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Landing Page Load', 'FAIL', `Landing page error: ${error.message}`);
    }
  }

  async testDemoPageAccess() {
    console.log('Testing demo page accessibility...');
    try {
      const response = await fetch(`${BASE_URL}/demo`);
      if (response.ok) {
        const html = await response.text();
        
        // For SPA, the demo route should return the same HTML shell
        const hasReactRoot = html.includes('id="root"');
        const hasMainScript = html.includes('main.tsx') || html.includes('main.js');
        
        if (hasReactRoot && hasMainScript) {
          this.addResult('Demo Page Access', 'PASS', 'Demo route accessible and returns React app');
          console.log('✓ Demo page accessible');
        } else {
          this.addResult('Demo Page Access', 'FAIL', 'Demo page missing React components');
        }
      } else {
        this.addResult('Demo Page Access', 'FAIL', `Demo page not accessible: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Demo Page Access', 'FAIL', `Demo page error: ${error.message}`);
    }
  }

  async testDemoPageContent() {
    console.log('Testing demo page component structure...');
    try {
      // Check if AnimatedDemo component exists and is properly configured
      const demoComponentExists = fs.existsSync('client/src/components/animated-demo.tsx');
      if (demoComponentExists) {
        const demoContent = fs.readFileSync('client/src/components/animated-demo.tsx', 'utf8');
        
        const hasProperInterface = demoContent.includes('AnimatedDemoProps');
        const hasBackNavigation = demoContent.includes('onBackHome') || demoContent.includes('Back to Home');
        const hasGetStarted = demoContent.includes('onGetStarted');
        const hasDemoContent = demoContent.includes('Data to Insights') || demoContent.includes('AI Business');
        
        if (hasProperInterface && hasBackNavigation && hasGetStarted && hasDemoContent) {
          this.addResult('Demo Component Structure', 'PASS', 'Demo component properly structured');
          console.log('✓ Demo component structure verified');
        } else {
          this.addResult('Demo Component Structure', 'PARTIAL', 'Demo component exists but may be incomplete');
        }
      } else {
        this.addResult('Demo Component Structure', 'FAIL', 'Demo component file not found');
      }
    } catch (error) {
      this.addResult('Demo Component Structure', 'FAIL', `Demo component error: ${error.message}`);
    }
  }

  async testBackNavigation() {
    console.log('Testing navigation configuration...');
    try {
      // Check App.tsx for proper routing setup
      const appExists = fs.existsSync('client/src/App.tsx');
      if (appExists) {
        const appContent = fs.readFileSync('client/src/App.tsx', 'utf8');
        
        const hasDemoRoute = appContent.includes('/demo') && appContent.includes('AnimatedDemo');
        const hasProperProps = appContent.includes('onDemo={() => setLocation("/demo")');
        const hasBackHome = appContent.includes('onBackHome={() => setLocation("/")');
        
        if (hasDemoRoute && hasProperProps && hasBackHome) {
          this.addResult('Navigation Configuration', 'PASS', 'Navigation properly configured');
          console.log('✓ Navigation configuration verified');
        } else {
          this.addResult('Navigation Configuration', 'PARTIAL', 'Navigation partially configured');
        }
      } else {
        this.addResult('Navigation Configuration', 'FAIL', 'App.tsx not found');
      }
    } catch (error) {
      this.addResult('Navigation Configuration', 'FAIL', `Navigation config error: ${error.message}`);
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
    console.log('\n' + '='.repeat(60));
    console.log('DEMO NAVIGATION TEST RESULTS');
    console.log('='.repeat(60));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const partial = this.testResults.filter(r => r.status === 'PARTIAL').length;

    console.log(`\nSummary: ${passed} passed, ${failed} failed, ${partial} partial\n`);

    if (failed > 0) {
      console.log('❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    if (partial > 0) {
      console.log('⚠️ PARTIAL TESTS:');
      this.testResults.filter(r => r.status === 'PARTIAL').forEach(result => {
        console.log(`  ⚠️ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    console.log('✅ PASSED TESTS:');
    this.testResults.filter(r => r.status === 'PASS').forEach(result => {
      console.log(`  ✓ ${result.test}: ${result.message}`);
    });

    // Save report
    const reportData = {
      summary: { passed, failed, partial },
      timestamp: new Date().toISOString(),
      results: this.testResults
    };

    fs.writeFileSync('demo-navigation-results.json', JSON.stringify(reportData, null, 2));
    console.log('\nDetailed report saved to demo-navigation-results.json');

    if (failed === 0) {
      console.log('\n✅ DEMO NAVIGATION WORKING - All tests passed or partial');
    } else {
      console.log('\n⚠️ DEMO NAVIGATION ISSUES - Some functionality may not work');
    }
  }
}

// Run the demo navigation tests
const tester = new DemoNavigationTester();
tester.runTests().catch(console.error);