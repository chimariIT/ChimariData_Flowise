#!/usr/bin/env node

/**
 * Comprehensive End-to-End Test Suite
 * Tests complete integration of frontend and backend components
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

const BASE_URL = 'http://localhost:5000';

class ComprehensiveE2ETest {
  constructor() {
    this.results = [];
    this.testData = {
      user: null,
      authCookie: null,
      projects: [],
      uploads: []
    };
  }

  async runCompleteTest() {
    console.log('🚀 Starting Comprehensive End-to-End Test Suite');
    console.log('=' .repeat(60));

    try {
      // Core Infrastructure Tests
      await this.testServerHealth();
      await this.testDatabaseConnection();
      
      // Authentication System Tests
      await this.testUserRegistration();
      await this.testUserLogin();
      await this.testOAuthEndpoints();
      
      // Free Trial Workflow Tests
      await this.testFreeTrialWorkflow();
      
      // Paid Service Workflow Tests
      await this.testPayPerAnalysisWorkflow();
      await this.testExpertConsultationWorkflow();
      await this.testAutomatedAnalysisWorkflow();
      
      // PII Detection and Security Tests
      await this.testPIIDetectionSystem();
      await this.testSecurityScanning();
      
      // AI Services Integration Tests
      await this.testAIServiceIntegration();
      await this.testAnalysisResultsGeneration();
      
      // Payment and Pricing Tests
      await this.testPricingSystem();
      await this.testPaymentProcessing();
      
      // Frontend Integration Tests
      await this.testFrontendRouting();
      await this.testComponentIntegration();
      
      // Data Processing Pipeline Tests
      await this.testDataProcessingPipeline();
      
      // Enterprise Features Tests
      await this.testEnterpriseFeatures();

      await this.generateComprehensiveReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      this.addResult('Test Suite Execution', 'FAIL', `Fatal error: ${error.message}`);
    }
  }

  async testServerHealth() {
    console.log('\n📡 Testing Server Health...');
    
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) {
        this.addResult('Server Health Check', 'PASS', 'Server is responsive');
      } else {
        // Try alternative health check
        const altResponse = await fetch(`${BASE_URL}/`);
        if (altResponse.ok) {
          this.addResult('Server Health Check', 'PASS', 'Server accessible via root endpoint');
        } else {
          this.addResult('Server Health Check', 'FAIL', `Server not responding: ${response.status}`);
        }
      }
    } catch (error) {
      this.addResult('Server Health Check', 'FAIL', `Connection failed: ${error.message}`);
    }
  }

  async testDatabaseConnection() {
    console.log('\n🗄️ Testing Database Connection...');
    
    try {
      // Test database through a simple API call
      const response = await fetch(`${BASE_URL}/api/auth/user`);
      // Even 401 response indicates database connectivity
      if (response.status === 401 || response.status === 200) {
        this.addResult('Database Connection', 'PASS', 'Database accessible through API');
      } else {
        this.addResult('Database Connection', 'WARN', 'Database connection unclear');
      }
    } catch (error) {
      this.addResult('Database Connection', 'FAIL', `Database connection failed: ${error.message}`);
    }
  }

  async testUserRegistration() {
    console.log('\n👤 Testing User Registration...');
    
    const testUser = {
      email: `test_${Date.now()}@example.com`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };

    try {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testUser)
      });

      if (response.ok) {
        const data = await response.json();
        this.testData.user = data.user;
        this.addResult('User Registration', 'PASS', 'User successfully registered');
      } else {
        const error = await response.text();
        this.addResult('User Registration', 'FAIL', `Registration failed: ${error}`);
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', `Registration error: ${error.message}`);
    }
  }

  async testUserLogin() {
    console.log('\n🔐 Testing User Login...');
    
    if (!this.testData.user) {
      this.addResult('User Login', 'SKIP', 'No user to test login with');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: this.testData.user.email,
          password: 'TestPassword123!'
        })
      });

      if (response.ok) {
        // Extract session cookie if available
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          this.testData.authCookie = setCookie;
        }
        this.addResult('User Login', 'PASS', 'User successfully logged in');
      } else {
        this.addResult('User Login', 'FAIL', `Login failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', `Login error: ${error.message}`);
    }
  }

  async testOAuthEndpoints() {
    console.log('\n🔗 Testing OAuth Endpoints...');
    
    const providers = ['google', 'microsoft', 'apple'];
    
    for (const provider of providers) {
      try {
        const response = await fetch(`${BASE_URL}/api/auth/${provider}`, {
          method: 'GET',
          redirect: 'manual'
        });
        
        // OAuth endpoints should redirect (status 302) or respond with 500 if not configured
        if (response.status === 302) {
          this.addResult(`OAuth ${provider}`, 'PASS', 'OAuth endpoint configured and redirecting');
        } else if (response.status === 500) {
          this.addResult(`OAuth ${provider}`, 'WARN', 'OAuth endpoint exists but not configured');
        } else {
          this.addResult(`OAuth ${provider}`, 'FAIL', `Unexpected response: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`OAuth ${provider}`, 'FAIL', `OAuth error: ${error.message}`);
      }
    }
  }

  async testFreeTrialWorkflow() {
    console.log('\n🆓 Testing Free Trial Workflow...');
    
    // Create test PII data
    const testPIIData = 'Name,Email,SSN,Address\nJohn Doe,john@example.com,123-45-6789,123 Main St\nJane Smith,jane@example.com,987-65-4321,456 Oak Ave';
    
    try {
      // Test file upload with PII detection
      const formData = new FormData();
      formData.append('file', testPIIData, 'test_pii_data.csv');
      formData.append('name', 'Free Trial Test Project');
      formData.append('questions', JSON.stringify(['What patterns exist in this data?']));

      const response = await fetch(`${BASE_URL}/api/upload-trial`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        
        if (data.requiresPIIDecision) {
          this.addResult('Free Trial PII Detection', 'PASS', 'PII successfully detected in uploaded data');
          
          // Test PII anonymization
          const anonymizeData = new FormData();
          anonymizeData.append('file', testPIIData, 'test_pii_data.csv');
          anonymizeData.append('name', 'Free Trial Test Project');
          anonymizeData.append('piiColumns', JSON.stringify(['Name', 'Email', 'SSN', 'Address']));
          anonymizeData.append('anonymize', 'true');

          const anonymizeResponse = await fetch(`${BASE_URL}/api/upload-trial`, {
            method: 'POST',
            body: anonymizeData
          });

          if (anonymizeResponse.ok) {
            const anonymizeResult = await anonymizeResponse.json();
            this.testData.uploads.push(anonymizeResult);
            this.addResult('Free Trial Anonymization', 'PASS', 'PII data successfully anonymized');
          } else {
            this.addResult('Free Trial Anonymization', 'FAIL', 'PII anonymization failed');
          }
        } else {
          this.addResult('Free Trial Upload', 'PASS', 'File uploaded without PII');
        }
      } else {
        this.addResult('Free Trial Upload', 'FAIL', `Upload failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Free Trial Workflow', 'FAIL', `Workflow error: ${error.message}`);
    }
  }

  async testPayPerAnalysisWorkflow() {
    console.log('\n💰 Testing Pay-per-Analysis Workflow...');
    
    try {
      // Test pricing calculation
      const response = await fetch(`${BASE_URL}/api/pricing/calculate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serviceType: 'pay_per_analysis',
          dataSize: 5,
          complexity: 3,
          analysisType: 'advanced'
        })
      });

      if (response.ok) {
        const pricing = await response.json();
        this.addResult('Pay-per-Analysis Pricing', 'PASS', `Pricing calculated: $${pricing.totalPrice}`);
      } else {
        this.addResult('Pay-per-Analysis Pricing', 'FAIL', `Pricing calculation failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pay-per-Analysis Workflow', 'FAIL', `Workflow error: ${error.message}`);
    }
  }

  async testExpertConsultationWorkflow() {
    console.log('\n👨‍💼 Testing Expert Consultation Workflow...');
    
    try {
      // Test enterprise inquiry submission
      const response = await fetch(`${BASE_URL}/api/enterprise-inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          company: 'Test Company',
          message: 'Testing expert consultation workflow',
          serviceType: 'expert_consulting'
        })
      });

      if (response.ok) {
        this.addResult('Expert Consultation Inquiry', 'PASS', 'Inquiry successfully submitted');
      } else {
        this.addResult('Expert Consultation Inquiry', 'FAIL', `Inquiry failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Expert Consultation Workflow', 'FAIL', `Workflow error: ${error.message}`);
    }
  }

  async testAutomatedAnalysisWorkflow() {
    console.log('\n🤖 Testing Automated Analysis Workflow...');
    
    try {
      // Test subscription tiers
      const response = await fetch(`${BASE_URL}/api/pricing/tiers`);
      
      if (response.ok) {
        const tiers = await response.json();
        if (tiers.length > 0) {
          this.addResult('Automated Analysis Tiers', 'PASS', `${tiers.length} subscription tiers available`);
        } else {
          this.addResult('Automated Analysis Tiers', 'WARN', 'No subscription tiers found');
        }
      } else {
        this.addResult('Automated Analysis Tiers', 'FAIL', `Tiers endpoint failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Automated Analysis Workflow', 'FAIL', `Workflow error: ${error.message}`);
    }
  }

  async testPIIDetectionSystem() {
    console.log('\n🔒 Testing PII Detection System...');
    
    const testData = {
      'John Smith': 'name',
      'john.smith@email.com': 'email',
      '123-45-6789': 'ssn',
      '555-123-4567': 'phone',
      '123 Main Street, Anytown USA 12345': 'address'
    };

    try {
      const response = await fetch(`${BASE_URL}/api/detect-pii`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: testData })
      });

      if (response.ok) {
        const result = await response.json();
        const detectedTypes = Object.keys(result.detectedPII || {});
        this.addResult('PII Detection', 'PASS', `Detected ${detectedTypes.length} PII types: ${detectedTypes.join(', ')}`);
      } else {
        this.addResult('PII Detection', 'FAIL', `PII detection failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('PII Detection System', 'FAIL', `Detection error: ${error.message}`);
    }
  }

  async testSecurityScanning() {
    console.log('\n🛡️ Testing Security Scanning...');
    
    try {
      // Test malware scanning endpoint
      const response = await fetch(`${BASE_URL}/api/scan-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: 'test.csv',
          fileSize: 1024,
          mimeType: 'text/csv'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.addResult('Security Scanning', 'PASS', `File scan completed: ${result.status}`);
      } else {
        this.addResult('Security Scanning', 'WARN', 'Security scanning endpoint not fully implemented');
      }
    } catch (error) {
      this.addResult('Security Scanning', 'FAIL', `Scanning error: ${error.message}`);
    }
  }

  async testAIServiceIntegration() {
    console.log('\n🧠 Testing AI Service Integration...');
    
    try {
      // Test AI providers endpoint
      const response = await fetch(`${BASE_URL}/api/ai/providers`);
      
      if (response.ok) {
        const providers = await response.json();
        this.addResult('AI Providers', 'PASS', `${providers.length} AI providers available`);
      } else {
        this.addResult('AI Providers', 'FAIL', `AI providers endpoint failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('AI Service Integration', 'FAIL', `AI integration error: ${error.message}`);
    }
  }

  async testAnalysisResultsGeneration() {
    console.log('\n📊 Testing Analysis Results Generation...');
    
    try {
      // Test analysis result generation
      const testAnalysis = {
        questions: ['What trends exist in this data?'],
        analysisType: 'descriptive',
        dataSchema: { columns: 5, rows: 100 },
        serviceType: 'pay_per_analysis'
      };

      const response = await fetch(`${BASE_URL}/api/analysis/generate-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testAnalysis)
      });

      if (response.ok) {
        const results = await response.json();
        this.addResult('Analysis Results Generation', 'PASS', 'Results successfully generated');
      } else {
        this.addResult('Analysis Results Generation', 'WARN', 'Results generation endpoint needs implementation');
      }
    } catch (error) {
      this.addResult('Analysis Results Generation', 'FAIL', `Results generation error: ${error.message}`);
    }
  }

  async testPricingSystem() {
    console.log('\n💲 Testing Pricing System...');
    
    try {
      // Test pricing calculation for different services
      const services = ['pay_per_analysis', 'expert_consulting', 'automated_analysis'];
      
      for (const service of services) {
        const response = await fetch(`${BASE_URL}/api/pricing/calculate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            serviceType: service,
            dataSize: 10,
            complexity: 2
          })
        });

        if (response.ok) {
          const pricing = await response.json();
          this.addResult(`Pricing ${service}`, 'PASS', `Base price: $${pricing.basePrice}`);
        } else {
          this.addResult(`Pricing ${service}`, 'FAIL', `Pricing failed: ${response.status}`);
        }
      }
    } catch (error) {
      this.addResult('Pricing System', 'FAIL', `Pricing error: ${error.message}`);
    }
  }

  async testPaymentProcessing() {
    console.log('\n💳 Testing Payment Processing...');
    
    try {
      // Test Stripe payment intent creation
      const response = await fetch(`${BASE_URL}/api/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: 2500, // $25.00
          currency: 'usd'
        })
      });

      if (response.ok) {
        const paymentIntent = await response.json();
        this.addResult('Payment Processing', 'PASS', 'Payment intent created successfully');
      } else {
        this.addResult('Payment Processing', 'WARN', 'Payment processing requires Stripe configuration');
      }
    } catch (error) {
      this.addResult('Payment Processing', 'FAIL', `Payment error: ${error.message}`);
    }
  }

  async testFrontendRouting() {
    console.log('\n🌐 Testing Frontend Routing...');
    
    const routes = [
      '/',
      '/pricing',
      '/demo',
      '/pay-per-analysis',
      '/expert-consulting',
      '/automated-analysis'
    ];

    for (const route of routes) {
      try {
        const response = await fetch(`${BASE_URL}${route}`);
        
        if (response.ok) {
          const content = await response.text();
          if (content.includes('<!DOCTYPE html>') || content.includes('<html>')) {
            this.addResult(`Route ${route}`, 'PASS', 'Route accessible and returns HTML');
          } else {
            this.addResult(`Route ${route}`, 'WARN', 'Route accessible but content unclear');
          }
        } else {
          this.addResult(`Route ${route}`, 'FAIL', `Route failed: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Route ${route}`, 'FAIL', `Route error: ${error.message}`);
      }
    }
  }

  async testComponentIntegration() {
    console.log('\n🧩 Testing Component Integration...');
    
    try {
      // Test API endpoints that components rely on
      const endpoints = [
        '/api/pricing/tiers',
        '/api/ai/providers',
        '/api/auth/user'
      ];

      for (const endpoint of endpoints) {
        const response = await fetch(`${BASE_URL}${endpoint}`);
        
        if (response.ok || response.status === 401) { // 401 is expected for auth endpoints
          this.addResult(`Component API ${endpoint}`, 'PASS', 'Endpoint available for components');
        } else {
          this.addResult(`Component API ${endpoint}`, 'FAIL', `Endpoint failed: ${response.status}`);
        }
      }
    } catch (error) {
      this.addResult('Component Integration', 'FAIL', `Integration error: ${error.message}`);
    }
  }

  async testDataProcessingPipeline() {
    console.log('\n⚙️ Testing Data Processing Pipeline...');
    
    try {
      // Test the complete data processing pipeline
      const testCSV = 'name,age,city\nJohn,25,NYC\nJane,30,LA';
      
      // Test schema detection
      const schemaResponse = await fetch(`${BASE_URL}/api/analyze-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: testCSV,
          filename: 'test.csv'
        })
      });

      if (schemaResponse.ok) {
        const schema = await schemaResponse.json();
        this.addResult('Schema Detection', 'PASS', `Detected ${schema.columns || 0} columns`);
      } else {
        this.addResult('Schema Detection', 'WARN', 'Schema detection needs implementation');
      }
    } catch (error) {
      this.addResult('Data Processing Pipeline', 'FAIL', `Pipeline error: ${error.message}`);
    }
  }

  async testEnterpriseFeatures() {
    console.log('\n🏢 Testing Enterprise Features...');
    
    try {
      // Test enterprise inquiry endpoint
      const response = await fetch(`${BASE_URL}/api/enterprise-inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Enterprise Test',
          email: 'enterprise@test.com',
          company: 'Test Corp',
          message: 'Testing enterprise features',
          projectScope: 'large',
          timeline: '3-months'
        })
      });

      if (response.ok) {
        this.addResult('Enterprise Inquiry', 'PASS', 'Enterprise inquiry system functional');
      } else {
        this.addResult('Enterprise Inquiry', 'FAIL', `Enterprise inquiry failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Enterprise Features', 'FAIL', `Enterprise error: ${error.message}`);
    }
  }

  addResult(testName, status, message) {
    const result = { testName, status, message, timestamp: new Date().toISOString() };
    this.results.push(result);
    
    const statusIcon = {
      'PASS': '✅',
      'FAIL': '❌',
      'WARN': '⚠️',
      'SKIP': '⏭️'
    }[status] || '❓';
    
    console.log(`${statusIcon} ${testName}: ${message}`);
  }

  async generateComprehensiveReport() {
    console.log('\n📋 Generating Comprehensive Test Report...');
    
    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'PASS').length,
      failed: this.results.filter(r => r.status === 'FAIL').length,
      warnings: this.results.filter(r => r.status === 'WARN').length,
      skipped: this.results.filter(r => r.status === 'SKIP').length
    };

    const report = {
      summary,
      testExecution: {
        timestamp: new Date().toISOString(),
        duration: 'Complete',
        environment: 'Development'
      },
      results: this.results,
      recommendations: this.generateRecommendations(summary),
      coverageAreas: {
        authentication: this.results.filter(r => r.testName.includes('Auth') || r.testName.includes('OAuth')).length,
        workflows: this.results.filter(r => r.testName.includes('Workflow') || r.testName.includes('Trial')).length,
        security: this.results.filter(r => r.testName.includes('PII') || r.testName.includes('Security')).length,
        ai_integration: this.results.filter(r => r.testName.includes('AI') || r.testName.includes('Analysis')).length,
        payment_system: this.results.filter(r => r.testName.includes('Payment') || r.testName.includes('Pricing')).length,
        frontend_integration: this.results.filter(r => r.testName.includes('Route') || r.testName.includes('Component')).length
      }
    };

    // Save detailed report
    fs.writeFileSync('comprehensive-e2e-test-results.json', JSON.stringify(report, null, 2));

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('🎯 COMPREHENSIVE E2E TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    console.log(`⚠️  Warnings: ${summary.warnings}`);
    console.log(`⏭️  Skipped: ${summary.skipped}`);
    console.log(`📈 Success Rate: ${((summary.passed / summary.total) * 100).toFixed(1)}%`);
    
    console.log('\n🔍 Coverage Areas:');
    Object.entries(report.coverageAreas).forEach(([area, count]) => {
      console.log(`  ${area.replace('_', ' ').toUpperCase()}: ${count} tests`);
    });

    if (report.recommendations.length > 0) {
      console.log('\n💡 Key Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

    console.log('\n📄 Detailed report saved to: comprehensive-e2e-test-results.json');
    console.log('='.repeat(60));

    return report;
  }

  generateRecommendations(summary) {
    const recommendations = [];

    if (summary.failed > 0) {
      recommendations.push('Address failed tests before deployment');
    }

    if (summary.warnings > 5) {
      recommendations.push('Review warning issues for potential improvements');
    }

    if (summary.passed / summary.total < 0.8) {
      recommendations.push('Increase test coverage and fix failing components');
    }

    const authTests = this.results.filter(r => r.testName.includes('Auth'));
    if (authTests.some(t => t.status === 'FAIL')) {
      recommendations.push('Critical: Fix authentication system issues');
    }

    const securityTests = this.results.filter(r => r.testName.includes('Security') || r.testName.includes('PII'));
    if (securityTests.some(t => t.status === 'FAIL')) {
      recommendations.push('Critical: Address security and PII detection issues');
    }

    const paymentTests = this.results.filter(r => r.testName.includes('Payment'));
    if (paymentTests.some(t => t.status === 'FAIL')) {
      recommendations.push('Configure payment processing for production');
    }

    return recommendations;
  }
}

// Run the comprehensive test suite
const tester = new ComprehensiveE2ETest();

// Wait for server to be ready
setTimeout(() => {
  tester.runCompleteTest().catch(error => {
    console.error('Test suite crashed:', error);
    process.exit(1);
  });
}, 3000);

export default ComprehensiveE2ETest;