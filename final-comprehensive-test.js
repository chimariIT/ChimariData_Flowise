/**
 * Final Comprehensive Test Suite
 * Tests all functionality including services integration and core features
 */

import axios from 'axios';
import fs from 'fs';

class FinalComprehensiveTest {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.authToken = null;
    this.userId = null;
  }

  async runCompleteTest() {
    console.log('🚀 Starting Final Comprehensive Test Suite');
    console.log('Testing all core functionality and services integration\n');
    
    try {
      // Core Infrastructure Tests
      await this.testServerHealth();
      await this.testDatabaseConnection();
      await this.testAPIEndpoints();
      
      // Authentication Flow Tests
      await this.testUserAuthentication();
      
      // Services Integration Tests
      await this.testServicesIntegration();
      
      // Page Navigation Tests
      await this.testPageNavigation();
      
      // AI and Upload Features
      await this.testAIFeatures();
      
      // Enterprise Features
      await this.testEnterpriseFeatures();
      
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      this.addResult('Test Suite Execution', 'CRITICAL_FAILURE', `Fatal error: ${error.message}`);
      await this.generateFinalReport();
    }
  }

  async testServerHealth() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      if (response.status === 200) {
        this.addResult('Server Health', 'PASS', 'Server responding correctly');
      } else {
        this.addResult('Server Health', 'FAIL', `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Server Health', 'FAIL', `Server not accessible: ${error.message}`);
    }
  }

  async testDatabaseConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/pricing/tiers`);
      if (response.status === 200 && response.data.tiers) {
        this.addResult('Database Connection', 'PASS', `Found ${response.data.tiers.length} pricing tiers`);
      } else {
        this.addResult('Database Connection', 'FAIL', 'Unable to retrieve pricing data');
      }
    } catch (error) {
      this.addResult('Database Connection', 'FAIL', `Database query failed: ${error.message}`);
    }
  }

  async testAPIEndpoints() {
    const endpoints = [
      '/api/ai/providers',
      '/api/pricing/tiers',
      '/api/health'
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${this.baseUrl}${endpoint}`);
        if (response.status === 200) {
          this.addResult(`API Endpoint ${endpoint}`, 'PASS', 'Endpoint accessible');
        } else {
          this.addResult(`API Endpoint ${endpoint}`, 'FAIL', `Status: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`API Endpoint ${endpoint}`, 'FAIL', `Error: ${error.message}`);
      }
    }
  }

  async testUserAuthentication() {
    // Test user registration
    try {
      const username = `testuser_${Date.now()}`;
      const registerResponse = await axios.post(`${this.baseUrl}/api/register`, {
        username: username,
        password: 'testpass123',
        email: 'test@example.com'
      });

      if (registerResponse.status === 200) {
        this.addResult('User Registration', 'PASS', 'User registration successful');
        
        // Test user login
        const loginResponse = await axios.post(`${this.baseUrl}/api/login`, {
          username: username,
          password: 'testpass123'
        });

        if (loginResponse.status === 200 && loginResponse.data.token) {
          this.authToken = loginResponse.data.token;
          this.userId = loginResponse.data.user.id;
          this.addResult('User Login', 'PASS', 'Login successful with token');
        } else {
          this.addResult('User Login', 'FAIL', 'Login failed or no token returned');
        }
      } else {
        this.addResult('User Registration', 'FAIL', 'Registration failed');
      }
    } catch (error) {
      this.addResult('User Authentication', 'FAIL', `Auth flow failed: ${error.message}`);
    }
  }

  async testServicesIntegration() {
    // Test landing page for services content
    try {
      const response = await axios.get(`${this.baseUrl}/`);
      const content = response.data;
      
      // Check for pay-per-analysis service
      const hasPayPerAnalysis = content.includes('Pay-Per-Analysis') ||
                                content.includes('pay-per-analysis') ||
                                content.includes('$25') ||
                                content.includes('$50');
      
      // Check for expert consultation service
      const hasExpertConsultation = content.includes('Expert Consultation') ||
                                    content.includes('expert-consultation') ||
                                    content.includes('$150');
      
      // Check for services section
      const hasServicesSection = content.includes('Professional Data Services') ||
                                  content.includes('service') ||
                                  content.includes('consultation');

      if (hasPayPerAnalysis) {
        this.addResult('Services - Pay Per Analysis', 'PASS', 'Pay-per-analysis service featured on landing page');
      } else {
        this.addResult('Services - Pay Per Analysis', 'FAIL', 'Pay-per-analysis service not prominently featured');
      }

      if (hasExpertConsultation) {
        this.addResult('Services - Expert Consultation', 'PASS', 'Expert consultation service featured on landing page');
      } else {
        this.addResult('Services - Expert Consultation', 'FAIL', 'Expert consultation service not prominently featured');
      }

      if (hasServicesSection) {
        this.addResult('Services - Section Integration', 'PASS', 'Services section integrated into landing page');
      } else {
        this.addResult('Services - Section Integration', 'FAIL', 'Services section missing from landing page');
      }

    } catch (error) {
      this.addResult('Services Integration', 'FAIL', `Failed to test services: ${error.message}`);
    }
  }

  async testPageNavigation() {
    const pages = [
      { path: '/pay-per-analysis', name: 'Pay-Per-Analysis Page' },
      { path: '/expert-consultation', name: 'Expert Consultation Page' },
      { path: '/pricing', name: 'Pricing Page' },
      { path: '/free-trial', name: 'Free Trial Page' },
      { path: '/demo', name: 'Demo Page' },
      { path: '/enterprise-contact', name: 'Enterprise Contact Page' }
    ];

    for (const page of pages) {
      try {
        const response = await axios.get(`${this.baseUrl}${page.path}`);
        if (response.status === 200) {
          this.addResult(`Navigation - ${page.name}`, 'PASS', 'Page accessible');
          
          // Check for specific content on service pages
          if (page.path === '/pay-per-analysis') {
            const hasContent = response.data.includes('analysis') || 
                               response.data.includes('$25') ||
                               response.data.includes('dataset');
            if (hasContent) {
              this.addResult('Pay-Per-Analysis Content', 'PASS', 'Page contains relevant content');
            } else {
              this.addResult('Pay-Per-Analysis Content', 'PARTIAL', 'Page loads but content needs verification');
            }
          }
          
          if (page.path === '/expert-consultation') {
            const hasContent = response.data.includes('consultation') || 
                               response.data.includes('$150') ||
                               response.data.includes('expert');
            if (hasContent) {
              this.addResult('Expert Consultation Content', 'PASS', 'Page contains relevant content');
            } else {
              this.addResult('Expert Consultation Content', 'PARTIAL', 'Page loads but content needs verification');
            }
          }
        } else {
          this.addResult(`Navigation - ${page.name}`, 'FAIL', `HTTP ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Navigation - ${page.name}`, 'FAIL', `Navigation failed: ${error.message}`);
      }
    }
  }

  async testAIFeatures() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/ai/providers`);
      if (response.status === 200 && response.data.providers) {
        this.addResult('AI Providers', 'PASS', `Found ${response.data.providers.length} AI providers`);
      } else {
        this.addResult('AI Providers', 'FAIL', 'AI providers endpoint not working');
      }
    } catch (error) {
      this.addResult('AI Features', 'FAIL', `AI features test failed: ${error.message}`);
    }

    // Test free trial upload endpoint
    try {
      const response = await axios.post(`${this.baseUrl}/api/upload-trial`);
      // Expecting 400 because no file is uploaded, but endpoint should exist
      if (response.status === 400) {
        this.addResult('Free Trial Upload', 'PASS', 'Free trial upload endpoint accessible');
      }
    } catch (error) {
      if (error.response?.status === 400) {
        this.addResult('Free Trial Upload', 'PASS', 'Free trial upload endpoint accessible');
      } else {
        this.addResult('Free Trial Upload', 'FAIL', `Upload endpoint issue: ${error.message}`);
      }
    }
  }

  async testEnterpriseFeatures() {
    try {
      // Test enterprise contact form submission
      const response = await axios.post(`${this.baseUrl}/api/enterprise/contact`, {
        email: 'test@enterprise.com',
        companyName: 'Test Corp',
        contactName: 'John Doe',
        phone: '555-0123',
        projectDescription: 'Test enterprise inquiry',
        estimatedDataSize: 'Large (>10GB)',
        timeline: 'Immediate',
        budget: '$50,000+'
      });

      if (response.status === 200) {
        this.addResult('Enterprise Contact', 'PASS', 'Enterprise contact form working');
      } else {
        this.addResult('Enterprise Contact', 'FAIL', `Contact form failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Enterprise Features', 'FAIL', `Enterprise test failed: ${error.message}`);
    }
  }

  addResult(testName, status, message) {
    this.results.push({
      test: testName,
      status: status,
      message: message,
      timestamp: new Date().toISOString()
    });
    
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${testName}: ${message}`);
  }

  async generateFinalReport() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const partial = this.results.filter(r => r.status === 'PARTIAL').length;
    const critical = this.results.filter(r => r.status === 'CRITICAL_FAILURE').length;
    const total = this.results.length;
    
    const report = {
      summary: {
        total: total,
        passed: passed,
        failed: failed,
        partial: partial,
        critical: critical,
        success_rate: `${Math.round((passed / total) * 100)}%`,
        deployment_ready: failed === 0 && critical === 0
      },
      test_results: this.results,
      services_status: {
        pay_per_analysis: this.getServiceStatus('Pay Per Analysis'),
        expert_consultation: this.getServiceStatus('Expert Consultation'),
        enterprise_contact: this.getServiceStatus('Enterprise Contact')
      },
      recommendations: this.generateRecommendations(),
      timestamp: new Date().toISOString()
    };
    
    // Write detailed report
    fs.writeFileSync('final-comprehensive-test-results.json', JSON.stringify(report, null, 2));
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 FINAL COMPREHENSIVE TEST RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Partial: ${partial}`);
    console.log(`🔴 Critical: ${critical}`);
    console.log(`Success Rate: ${report.summary.success_rate}`);
    console.log(`Deployment Ready: ${report.summary.deployment_ready ? 'YES' : 'NO'}`);
    
    if (critical > 0) {
      console.log('\n🚨 CRITICAL ISSUES DETECTED - DO NOT DEPLOY');
    } else if (failed === 0 && partial <= 2) {
      console.log('\n🎉 ALL SYSTEMS OPERATIONAL - READY FOR DEPLOYMENT');
      console.log('✓ Core functionality working');
      console.log('✓ Services integration complete');
      console.log('✓ Navigation and routing functional');
      console.log('✓ AI features operational');
    } else if (failed <= 3) {
      console.log('\n⚠️ MINOR ISSUES DETECTED - REVIEW BEFORE DEPLOYMENT');
    } else {
      console.log('\n❌ SIGNIFICANT ISSUES DETECTED - FIX BEFORE DEPLOYMENT');
    }
    
    console.log('\n📝 Detailed report saved to: final-comprehensive-test-results.json');
    console.log('='.repeat(80));
  }

  getServiceStatus(serviceName) {
    const serviceTests = this.results.filter(r => r.test.includes(serviceName));
    const passed = serviceTests.filter(r => r.status === 'PASS').length;
    const total = serviceTests.length;
    return total > 0 ? `${passed}/${total} tests passed` : 'No tests found';
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.results.filter(r => r.status === 'FAIL');
    
    if (failedTests.some(test => test.test.includes('Server') || test.test.includes('Database'))) {
      recommendations.push('Check server configuration and database connectivity');
    }
    
    if (failedTests.some(test => test.test.includes('Services'))) {
      recommendations.push('Verify services integration on landing page and routing configuration');
    }
    
    if (failedTests.some(test => test.test.includes('Navigation'))) {
      recommendations.push('Review React routing setup and component imports');
    }
    
    if (failedTests.some(test => test.test.includes('AI'))) {
      recommendations.push('Ensure AI service providers are properly configured');
    }
    
    if (failedTests.length === 0) {
      recommendations.push('System is fully operational and ready for deployment');
    }
    
    return recommendations;
  }
}

// Run the comprehensive test
const tester = new FinalComprehensiveTest();
tester.runCompleteTest().catch(console.error);