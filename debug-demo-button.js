#!/usr/bin/env node

/**
 * Debug Demo Button Runtime Issues
 * Checks for actual runtime problems preventing navigation
 */

import fs from 'fs';
import fetch from 'node-fetch';

class DemoButtonDebugger {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.issues = [];
  }

  async debugDemoButton() {
    console.log('🔍 Debugging demo button runtime issues...\n');
    
    await this.checkConsoleErrors();
    await this.verifyActualButtonRendering();
    await this.checkEventHandlerBinding();
    await this.testDirectNavigation();
    await this.analyzeComponentStructure();
    
    await this.generateDebugReport();
  }

  async checkConsoleErrors() {
    console.log('Checking for potential console errors...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check for undefined variables
      if (landingCode.includes('onClick={onDemo}') && !landingCode.includes('onDemo }: LandingPageProps')) {
        this.addIssue('Variable Scope', 'CRITICAL', 'onDemo used but not properly destructured');
      }
      
      // Check for missing imports
      const hasPlayImport = landingCode.includes('Play') && landingCode.includes('from "lucide-react"');
      if (landingCode.includes('<Play') && !hasPlayImport) {
        this.addIssue('Missing Import', 'ERROR', 'Play icon used but not imported');
      }
      
      // Check for TypeScript errors
      if (!landingCode.includes('onDemo: () => void')) {
        this.addIssue('TypeScript', 'ERROR', 'onDemo prop not defined in interface');
      }
      
      console.log('✓ Static code analysis complete');
    } catch (error) {
      this.addIssue('Code Analysis', 'CRITICAL', `Failed to analyze code: ${error.message}`);
    }
  }

  async verifyActualButtonRendering() {
    console.log('Verifying button rendering in HTML...');
    
    try {
      const response = await fetch(`${this.baseUrl}/`);
      const html = await response.text();
      
      if (html.includes('Watch 2-Minute Demo') || html.includes('Watch 2-min Demo')) {
        console.log('✓ Button text found in HTML');
      } else {
        this.addIssue('Button Rendering', 'CRITICAL', 'Watch 2-Minute Demo button not rendering in HTML');
      }
      
      // Check for React root
      if (html.includes('id="root"')) {
        console.log('✓ React root element present');
      } else {
        this.addIssue('React Mount', 'CRITICAL', 'React root element missing');
      }
    } catch (error) {
      this.addIssue('HTML Verification', 'CRITICAL', `Failed to fetch HTML: ${error.message}`);
    }
  }

  async checkEventHandlerBinding() {
    console.log('Checking event handler implementation...');
    
    try {
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      
      // Check if callback is properly passed
      const callbackPattern = /onDemo=\{[^}]+\}/;
      if (!appCode.match(callbackPattern)) {
        this.addIssue('Callback Binding', 'CRITICAL', 'onDemo callback not properly bound in App.tsx');
      }
      
      // Check for arrow function issues
      if (landingCode.includes('onClick={() => onDemo()}')) {
        this.addIssue('Event Handler', 'WARNING', 'Using arrow function wrapper instead of direct reference');
      }
      
      // Verify wouter routing
      if (!appCode.includes('useLocation') || !appCode.includes('setLocation')) {
        this.addIssue('Routing', 'CRITICAL', 'Wouter routing not properly configured');
      }
      
      console.log('✓ Event handler analysis complete');
    } catch (error) {
      this.addIssue('Event Handler Check', 'ERROR', `Failed to check handlers: ${error.message}`);
    }
  }

  async testDirectNavigation() {
    console.log('Testing direct demo page access...');
    
    try {
      const response = await fetch(`${this.baseUrl}/demo`);
      const demoHtml = await response.text();
      
      if (response.ok && demoHtml.includes('Interactive Demo')) {
        console.log('✓ Demo page accessible via direct URL');
      } else {
        this.addIssue('Demo Page Access', 'ERROR', 'Demo page not accessible via direct URL');
      }
    } catch (error) {
      this.addIssue('Direct Navigation', 'ERROR', `Demo page test failed: ${error.message}`);
    }
  }

  async analyzeComponentStructure() {
    console.log('Analyzing component render structure...');
    
    try {
      const appCode = fs.readFileSync('client/src/App.tsx', 'utf8');
      const landingCode = fs.readFileSync('client/src/pages/landing.tsx', 'utf8');
      
      // Check component hierarchy
      if (!appCode.includes('LandingPage') || !appCode.includes('AnimatedDemo')) {
        this.addIssue('Component Import', 'CRITICAL', 'Components not properly imported in App.tsx');
      }
      
      // Check conditional rendering
      if (!appCode.includes('location === "/"') || !appCode.includes('location === "/demo"')) {
        this.addIssue('Conditional Rendering', 'CRITICAL', 'Route conditions not properly set up');
      }
      
      // Check for prop drilling issues
      const propsPattern = /onDemo[^,}]*/g;
      const propUsages = landingCode.match(propsPattern) || [];
      if (propUsages.length < 2) {
        this.addIssue('Prop Usage', 'WARNING', 'onDemo prop may not be used in all necessary places');
      }
      
      console.log('✓ Component structure analysis complete');
    } catch (error) {
      this.addIssue('Component Analysis', 'ERROR', `Component analysis failed: ${error.message}`);
    }
  }

  addIssue(category, severity, description) {
    this.issues.push({
      category,
      severity,
      description,
      timestamp: new Date().toISOString()
    });
  }

  async generateDebugReport() {
    console.log('\n' + '='.repeat(60));
    console.log('DEMO BUTTON DEBUG REPORT');
    console.log('='.repeat(60));
    
    const critical = this.issues.filter(i => i.severity === 'CRITICAL');
    const errors = this.issues.filter(i => i.severity === 'ERROR');
    const warnings = this.issues.filter(i => i.severity === 'WARNING');
    
    if (critical.length > 0) {
      console.log('\n🚨 CRITICAL ISSUES (Will prevent button from working):');
      critical.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.category}: ${issue.description}`);
      });
    }
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS (May prevent button from working):');
      errors.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.category}: ${issue.description}`);
      });
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️ WARNINGS (May cause performance issues):');
      warnings.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue.category}: ${issue.description}`);
      });
    }
    
    if (this.issues.length === 0) {
      console.log('\n✅ No runtime issues detected.');
      console.log('The button should be working. Issue may be client-side or browser-specific.');
    }
    
    console.log(`\nTotal issues found: ${this.issues.length}`);
    console.log('(Critical: ' + critical.length + ', Errors: ' + errors.length + ', Warnings: ' + warnings.length + ')');
    
    // Save debug report
    const debugData = {
      summary: {
        critical: critical.length,
        errors: errors.length,
        warnings: warnings.length,
        total: this.issues.length
      },
      issues: this.issues,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('demo-button-debug.json', JSON.stringify(debugData, null, 2));
    console.log('\nDebug report saved to demo-button-debug.json');
    
    return this.issues;
  }
}

// Run the debug analysis
const buttonDebugger = new DemoButtonDebugger();
buttonDebugger.debugDemoButton().catch(console.error);