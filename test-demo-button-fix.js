#!/usr/bin/env node

/**
 * Demo Button Fix Verification
 * Tests that demo buttons now properly navigate using React routing
 */

import fs from 'fs';

class DemoButtonTester {
  constructor() {
    this.testResults = [];
  }

  async runTests() {
    console.log('Verifying demo button navigation fixes...\n');
    
    await this.testLandingPageProps();
    await this.testButtonImplementation();
    await this.testAppRouting();
    await this.generateReport();
  }

  async testLandingPageProps() {
    console.log('Checking LandingPage component props...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check for onDemo prop in interface
      if (landingCode.includes('onDemo: () => void')) {
        this.addResult('OnDemo Prop Interface', 'PASS', 'onDemo prop properly defined in interface');
        console.log('✓ onDemo prop interface defined');
      } else {
        this.addResult('OnDemo Prop Interface', 'FAIL', 'onDemo prop not found in interface');
      }

      // Check for onDemo in component parameters
      if (landingCode.includes('onDemo }: LandingPageProps')) {
        this.addResult('OnDemo Component Param', 'PASS', 'onDemo prop properly destructured in component');
        console.log('✓ onDemo prop destructured correctly');
      } else {
        this.addResult('OnDemo Component Param', 'FAIL', 'onDemo prop not destructured in component');
      }
    } catch (error) {
      this.addResult('Landing Page Props', 'FAIL', `Failed to check props: ${error.message}`);
    }
  }

  async testButtonImplementation() {
    console.log('Verifying button onClick implementations...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check for proper button onClick handlers
      const watchDemoButtonCorrect = landingCode.includes('onClick={onDemo}') && 
                                   landingCode.includes('Watch 2-Minute Demo');
      
      if (watchDemoButtonCorrect) {
        this.addResult('Watch Demo Button', 'PASS', 'Watch 2-Minute Demo button uses proper onClick handler');
        console.log('✓ Watch 2-Minute Demo button fixed');
      } else {
        this.addResult('Watch Demo Button', 'FAIL', 'Watch 2-Minute Demo button not properly implemented');
      }

      const liveDemoButtonCorrect = landingCode.includes('onClick={onDemo}') && 
                                  landingCode.includes('Try Live Demo Now');
      
      if (liveDemoButtonCorrect) {
        this.addResult('Live Demo Button', 'PASS', 'Try Live Demo Now button uses proper onClick handler');
        console.log('✓ Try Live Demo Now button fixed');
      } else {
        this.addResult('Live Demo Button', 'FAIL', 'Try Live Demo Now button not properly implemented');
      }

      // Check that window.location.href is removed
      if (!landingCode.includes('window.location.href = "/demo"')) {
        this.addResult('Window Location Removed', 'PASS', 'Removed problematic window.location.href usage');
        console.log('✓ Direct window navigation removed');
      } else {
        this.addResult('Window Location Removed', 'FAIL', 'Still using window.location.href instead of React routing');
      }
    } catch (error) {
      this.addResult('Button Implementation', 'FAIL', `Failed to check button implementation: ${error.message}`);
    }
  }

  async testAppRouting() {
    console.log('Verifying App.tsx routing configuration...');
    
    try {
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      
      // Check for onDemo callback in LandingPage component
      if (appCode.includes('onDemo={() => setLocation("/demo")}')) {
        this.addResult('App Demo Callback', 'PASS', 'App.tsx properly passes onDemo callback to LandingPage');
        console.log('✓ App demo callback configured');
      } else {
        this.addResult('App Demo Callback', 'FAIL', 'App.tsx missing onDemo callback');
      }

      // Check that demo route still exists
      if (appCode.includes('location === "/demo"') && appCode.includes('AnimatedDemo')) {
        this.addResult('Demo Route Exists', 'PASS', 'Demo route properly configured in App.tsx');
        console.log('✓ Demo route configuration verified');
      } else {
        this.addResult('Demo Route Exists', 'FAIL', 'Demo route not found in App.tsx');
      }
    } catch (error) {
      this.addResult('App Routing', 'FAIL', `Failed to check App routing: ${error.message}`);
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
    console.log('\n=== DEMO BUTTON FIX VERIFICATION ===');
    
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
    
    if (failed === 0) {
      console.log('\n🎉 All demo button fixes verified successfully!');
      console.log('The Watch 2-Minute Demo button should now navigate properly to the demo page.');
    } else {
      console.log('\n⚠️ Some demo button fixes may have issues.');
    }
  }
}

// Run the tests
const tester = new DemoButtonTester();
tester.runTests().catch(console.error);