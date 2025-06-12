#!/usr/bin/env node

/**
 * Full Regression Test Suite
 * Comprehensive testing of demo navigation and core functionality
 */

import fs from 'fs';
import fetch from 'node-fetch';

class FullRegressionTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testResults = [];
  }

  async runFullRegression() {
    console.log('🔍 Running Full Regression Test Suite...\n');
    
    // Core functionality tests
    await this.testServerStatus();
    await this.testRouteConfiguration();
    await this.testComponentStructure();
    await this.testNavigationLogic();
    await this.testDemoPageAccessibility();
    await this.testBrowserBehavior();
    
    await this.generateComprehensiveReport();
  }

  async testServerStatus() {
    console.log('Testing server and application status...');
    
    try {
      const response = await fetch(`${this.baseUrl}/`);
      const html = await response.text();
      
      if (response.ok && html.includes('root')) {
        this.addResult('Server Status', 'PASS', 'Server responding correctly');
        console.log('✓ Server running and accessible');
      } else {
        this.addResult('Server Status', 'FAIL', 'Server not responding properly');
      }
    } catch (error) {
      this.addResult('Server Status', 'FAIL', `Server connection failed: ${error.message}`);
    }
  }

  async testRouteConfiguration() {
    console.log('Analyzing route configuration...');
    
    try {
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      
      // Check React Router setup
      if (appCode.includes('useLocation') && appCode.includes('setLocation')) {
        this.addResult('Router Setup', 'PASS', 'React routing properly configured');
        console.log('✓ React router configured');
      } else {
        this.addResult('Router Setup', 'FAIL', 'React router not properly configured');
      }

      // Check demo route
      if (appCode.includes('location === "/demo"') && appCode.includes('AnimatedDemo')) {
        this.addResult('Demo Route', 'PASS', 'Demo route exists in App.tsx');
        console.log('✓ Demo route configured');
      } else {
        this.addResult('Demo Route', 'FAIL', 'Demo route missing or misconfigured');
      }

      // Check LandingPage props
      if (appCode.includes('onDemo={() => setLocation("/demo")}')) {
        this.addResult('Demo Callback', 'PASS', 'Demo callback properly passed to LandingPage');
        console.log('✓ Demo callback configured');
      } else {
        this.addResult('Demo Callback', 'FAIL', 'Demo callback missing in App.tsx');
      }
    } catch (error) {
      this.addResult('Route Configuration', 'FAIL', `Failed to analyze routes: ${error.message}`);
    }
  }

  async testComponentStructure() {
    console.log('Examining component implementation...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check component props
      if (landingCode.includes('onDemo: () => void') && landingCode.includes('onDemo }: LandingPageProps')) {
        this.addResult('Component Props', 'PASS', 'LandingPage props properly defined and used');
        console.log('✓ Component props configured');
      } else {
        this.addResult('Component Props', 'FAIL', 'LandingPage props incorrectly configured');
      }

      // Check button implementations
      const demoButtons = (landingCode.match(/onClick={onDemo}/g) || []).length;
      if (demoButtons >= 2) {
        this.addResult('Demo Buttons', 'PASS', `Found ${demoButtons} demo buttons using onDemo callback`);
        console.log(`✓ ${demoButtons} demo buttons found`);
      } else {
        this.addResult('Demo Buttons', 'FAIL', `Only found ${demoButtons} demo buttons, expected at least 2`);
      }

      // Check for problematic code
      if (landingCode.includes('window.location.href = "/demo"')) {
        this.addResult('Navigation Method', 'FAIL', 'Still using window.location.href instead of React routing');
      } else {
        this.addResult('Navigation Method', 'PASS', 'Using proper React routing navigation');
        console.log('✓ Proper navigation method');
      }
    } catch (error) {
      this.addResult('Component Structure', 'FAIL', `Failed to analyze components: ${error.message}`);
    }
  }

  async testNavigationLogic() {
    console.log('Testing navigation logic flow...');
    
    try {
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Trace the navigation flow
      const hasUseLocation = appCode.includes('useLocation');
      const hasSetLocation = appCode.includes('setLocation');
      const landingHasOnDemo = landingCode.includes('onDemo }: LandingPageProps');
      const buttonUsesOnDemo = landingCode.includes('onClick={onDemo}');
      const appPassesCallback = appCode.includes('onDemo={() => setLocation("/demo")}');
      
      if (hasUseLocation && hasSetLocation && landingHasOnDemo && buttonUsesOnDemo && appPassesCallback) {
        this.addResult('Navigation Flow', 'PASS', 'Complete navigation flow properly implemented');
        console.log('✓ Navigation flow complete');
      } else {
        this.addResult('Navigation Flow', 'FAIL', 'Navigation flow broken or incomplete');
        console.log(`  useLocation: ${hasUseLocation}`);
        console.log(`  setLocation: ${hasSetLocation}`);
        console.log(`  Landing onDemo prop: ${landingHasOnDemo}`);
        console.log(`  Button uses onDemo: ${buttonUsesOnDemo}`);
        console.log(`  App passes callback: ${appPassesCallback}`);
      }
    } catch (error) {
      this.addResult('Navigation Logic', 'FAIL', `Failed to analyze navigation: ${error.message}`);
    }
  }

  async testDemoPageAccessibility() {
    console.log('Testing demo page component...');
    
    try {
      const demoCode = fs.readFileSync('client/src/components/animated-demo.tsx', 'utf8');
      
      // Check component structure
      if (demoCode.includes('AnimatedDemoProps') && demoCode.includes('onGetStarted')) {
        this.addResult('Demo Component', 'PASS', 'AnimatedDemo component properly structured');
        console.log('✓ Demo component exists');
      } else {
        this.addResult('Demo Component', 'FAIL', 'AnimatedDemo component missing or malformed');
      }

      // Check for demo content
      if (demoCode.includes('Data to Insights') && demoCode.includes('AI Business Recommendations')) {
        this.addResult('Demo Content', 'PASS', 'Demo page has proper content');
        console.log('✓ Demo content verified');
      } else {
        this.addResult('Demo Content', 'FAIL', 'Demo page missing expected content');
      }
    } catch (error) {
      this.addResult('Demo Page', 'FAIL', `Demo page analysis failed: ${error.message}`);
    }
  }

  async testBrowserBehavior() {
    console.log('Analyzing potential browser-side issues...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check for React imports
      if (landingCode.includes('import { useState') || landingCode.includes('import { useEffect')) {
        this.addResult('React Hooks', 'PASS', 'React hooks properly imported');
        console.log('✓ React hooks configured');
      } else {
        this.addResult('React Hooks', 'WARN', 'May have React hook issues');
      }

      // Check for event handling patterns
      if (landingCode.includes('onClick={') && !landingCode.includes('onClick={() =>')) {
        this.addResult('Event Handlers', 'PASS', 'Using direct function references for onClick');
        console.log('✓ Event handlers optimized');
      } else {
        this.addResult('Event Handlers', 'WARN', 'Using inline arrow functions for onClick (may cause re-renders)');
      }

      // Check for TypeScript issues
      if (landingCode.includes(': LandingPageProps') && landingCode.includes('interface LandingPageProps')) {
        this.addResult('TypeScript Types', 'PASS', 'TypeScript types properly defined');
        console.log('✓ TypeScript types correct');
      } else {
        this.addResult('TypeScript Types', 'FAIL', 'TypeScript type issues detected');
      }
    } catch (error) {
      this.addResult('Browser Behavior', 'FAIL', `Browser analysis failed: ${error.message}`);
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

  async generateComprehensiveReport() {
    console.log('\n' + '='.repeat(60));
    console.log('COMPREHENSIVE REGRESSION TEST RESULTS');
    console.log('='.repeat(60));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const warnings = this.testResults.filter(r => r.status === 'WARN').length;
    
    // Group results by category
    const categories = {
      'Critical Issues': this.testResults.filter(r => r.status === 'FAIL'),
      'Warnings': this.testResults.filter(r => r.status === 'WARN'),
      'Passing Tests': this.testResults.filter(r => r.status === 'PASS')
    };

    Object.entries(categories).forEach(([category, results]) => {
      if (results.length > 0) {
        console.log(`\n${category}:`);
        results.forEach(result => {
          const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '⚠';
          console.log(`  ${icon} ${result.test}: ${result.message}`);
        });
      }
    });
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Summary: ${passed} passed, ${failed} failed, ${warnings} warnings`);
    
    if (failed > 0) {
      console.log('\n🚨 CRITICAL ISSUES DETECTED:');
      categories['Critical Issues'].forEach((result, index) => {
        console.log(`${index + 1}. ${result.test}: ${result.message}`);
      });
      console.log('\nRecommended actions will be implemented to fix these issues.');
    } else if (warnings > 0) {
      console.log('\n⚠️ Minor issues detected but navigation should work.');
    } else {
      console.log('\n🎉 All tests passed! Demo navigation should be working.');
    }

    // Save detailed report
    const reportData = {
      summary: { passed, failed, warnings, total: this.testResults.length },
      categories,
      tests: this.testResults,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('full-regression-results.json', JSON.stringify(reportData, null, 2));
    console.log('\nDetailed report saved to full-regression-results.json');
    
    return { passed, failed, warnings };
  }
}

// Run the comprehensive test
const tester = new FullRegressionTester();
tester.runFullRegression().catch(console.error);