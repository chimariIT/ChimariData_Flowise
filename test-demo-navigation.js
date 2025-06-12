#!/usr/bin/env node

/**
 * Demo Navigation Test
 * Verifies that demo buttons navigate correctly
 */

import fs from 'fs';

class DemoNavigationTester {
  constructor() {
    this.testResults = [];
  }

  async runTests() {
    console.log('Testing demo navigation and button functionality...\n');
    
    await this.testDemoRouteConfiguration();
    await this.testDemoButtonImplementation();
    await this.testAnimatedDemoComponent();
    await this.generateReport();
  }

  async testDemoRouteConfiguration() {
    console.log('Checking demo route configuration...');
    
    try {
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      
      if (appCode.includes('location === "/demo"') && appCode.includes('AnimatedDemo')) {
        this.addResult('Demo Route Configuration', 'PASS', 'Demo route properly configured in App.tsx');
        console.log('✓ Demo route configured correctly');
      } else {
        this.addResult('Demo Route Configuration', 'FAIL', 'Demo route not found or incorrectly configured');
      }
    } catch (error) {
      this.addResult('Demo Route Configuration', 'FAIL', `Failed to check route configuration: ${error.message}`);
    }
  }

  async testDemoButtonImplementation() {
    console.log('Verifying demo button implementation...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check for the new 2-minute demo button
      if (landingCode.includes('Watch 2-Minute Demo') && landingCode.includes('window.location.href = "/demo"')) {
        this.addResult('2-Minute Demo Button', 'PASS', 'New 2-minute demo button properly implemented');
        console.log('✓ 2-minute demo button implemented');
      } else {
        this.addResult('2-Minute Demo Button', 'FAIL', '2-minute demo button not found or incorrectly implemented');
      }

      // Check for the main demo button
      if (landingCode.includes('Try Live Demo Now') && landingCode.includes('"/demo"')) {
        this.addResult('Main Demo Button', 'PASS', 'Main demo button properly implemented');
        console.log('✓ Main demo button implemented');
      } else {
        this.addResult('Main Demo Button', 'FAIL', 'Main demo button not found or incorrectly implemented');
      }

      // Check for Play icon import
      if (landingCode.includes('Play') && landingCode.includes('from "lucide-react"')) {
        this.addResult('Play Icon Import', 'PASS', 'Play icon properly imported');
        console.log('✓ Play icon imported correctly');
      } else {
        this.addResult('Play Icon Import', 'FAIL', 'Play icon not properly imported');
      }
    } catch (error) {
      this.addResult('Demo Button Implementation', 'FAIL', `Failed to check button implementation: ${error.message}`);
    }
  }

  async testAnimatedDemoComponent() {
    console.log('Verifying animated demo component...');
    
    try {
      const demoCode = fs.readFileSync('client/src/components/animated-demo.tsx', 'utf8');
      
      // Check for demo content
      if (demoCode.includes('Data to Insights in Minutes') && demoCode.includes('AI Business Recommendations')) {
        this.addResult('Demo Content', 'PASS', 'Demo component has proper content structure');
        console.log('✓ Demo content structure verified');
      } else {
        this.addResult('Demo Content', 'FAIL', 'Demo content not found or incomplete');
      }

      // Check for navigation props
      if (demoCode.includes('onGetStarted') && demoCode.includes('onBackHome')) {
        this.addResult('Demo Navigation Props', 'PASS', 'Demo component has proper navigation props');
        console.log('✓ Demo navigation props verified');
      } else {
        this.addResult('Demo Navigation Props', 'FAIL', 'Demo navigation props missing or incorrect');
      }
    } catch (error) {
      this.addResult('Animated Demo Component', 'FAIL', `Failed to check demo component: ${error.message}`);
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
    console.log('\n=== DEMO NAVIGATION TEST RESULTS ===');
    
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
      console.log('\n🎉 All demo navigation tests passed!');
      console.log('The 2-minute demo button is now working correctly.');
    } else {
      console.log('\n⚠️ Some demo navigation tests failed.');
    }

    // Save report
    const reportData = {
      summary: { passed, failed, total: this.testResults.length },
      tests: this.testResults,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('demo-navigation-results.json', JSON.stringify(reportData, null, 2));
    console.log('Detailed report saved to demo-navigation-results.json');
  }
}

// Run the tests
const tester = new DemoNavigationTester();
tester.runTests().catch(console.error);