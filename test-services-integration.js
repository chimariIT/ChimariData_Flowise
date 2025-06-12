/**
 * Services Integration Test - Pay-Per-Analysis and Expert Consultation
 * Tests the complete navigation and functionality of the new service pages
 */

import axios from 'axios';
import fs from 'fs';

class ServicesIntegrationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async runCompleteTest() {
    console.log('🚀 Starting Services Integration Test');
    console.log('Testing Pay-Per-Analysis and Expert Consultation services');
    
    try {
      await this.testServerConnection();
      await this.testLandingPageServiceButtons();
      await this.testPayPerAnalysisPage();
      await this.testExpertConsultationPage();
      await this.testPricingPageIntegration();
      await this.testNavigationFlow();
      await this.generateReport();
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      this.addResult('Test Suite', 'FAILED', `Critical error: ${error.message}`);
      await this.generateReport();
    }
  }

  async testServerConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/health`);
      if (response.status === 200) {
        this.addResult('Server Connection', 'PASS', 'Server is responding correctly');
      } else {
        this.addResult('Server Connection', 'FAIL', `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Server Connection', 'FAIL', `Server not accessible: ${error.message}`);
    }
  }

  async testLandingPageServiceButtons() {
    try {
      // Test that the frontend is serving static files
      const response = await axios.get(`${this.baseUrl}/`);
      
      if (response.status === 200) {
        const content = response.data;
        
        // Check for pay-per-analysis mentions
        const hasPayPerAnalysis = content.includes('pay-per-analysis') || 
                                  content.includes('Pay Per Analysis') ||
                                  content.includes('$25') ||
                                  content.includes('$50');
        
        // Check for expert consultation mentions
        const hasExpertConsultation = content.includes('expert-consultation') ||
                                      content.includes('Expert Consultation') ||
                                      content.includes('$150');
        
        if (hasPayPerAnalysis) {
          this.addResult('Landing Page - Pay Per Analysis', 'PASS', 'Pay-per-analysis service is prominently featured');
        } else {
          this.addResult('Landing Page - Pay Per Analysis', 'FAIL', 'Pay-per-analysis service not found on landing page');
        }
        
        if (hasExpertConsultation) {
          this.addResult('Landing Page - Expert Consultation', 'PASS', 'Expert consultation service is prominently featured');
        } else {
          this.addResult('Landing Page - Expert Consultation', 'FAIL', 'Expert consultation service not found on landing page');
        }
      } else {
        this.addResult('Landing Page Access', 'FAIL', `Unexpected status: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Landing Page Access', 'FAIL', `Failed to access landing page: ${error.message}`);
    }
  }

  async testPayPerAnalysisPage() {
    try {
      // Test pay-per-analysis route accessibility
      const response = await axios.get(`${this.baseUrl}/pay-per-analysis`);
      
      if (response.status === 200) {
        const content = response.data;
        
        // Check for pay-per-analysis page content
        const hasPayPerAnalysisContent = content.includes('Pay-Per-Analysis') ||
                                         content.includes('$25') ||
                                         content.includes('$50') ||
                                         content.includes('upload') ||
                                         content.includes('analysis');
        
        if (hasPayPerAnalysisContent) {
          this.addResult('Pay-Per-Analysis Page', 'PASS', 'Pay-per-analysis page loads with correct content');
        } else {
          this.addResult('Pay-Per-Analysis Page', 'PARTIAL', 'Page loads but content may be incomplete');
        }
        
        // Check for pricing tiers
        const hasPricingTiers = content.includes('Standard Analysis') ||
                                content.includes('Advanced Analysis') ||
                                content.includes('Premium Analysis');
        
        if (hasPricingTiers) {
          this.addResult('Pay-Per-Analysis Pricing', 'PASS', 'Pricing tiers are properly displayed');
        } else {
          this.addResult('Pay-Per-Analysis Pricing', 'FAIL', 'Pricing tiers not found');
        }
      } else {
        this.addResult('Pay-Per-Analysis Page', 'FAIL', `Page not accessible: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pay-Per-Analysis Page', 'FAIL', `Failed to access page: ${error.message}`);
    }
  }

  async testExpertConsultationPage() {
    try {
      // Test expert consultation route accessibility
      const response = await axios.get(`${this.baseUrl}/expert-consultation`);
      
      if (response.status === 200) {
        const content = response.data;
        
        // Check for expert consultation page content
        const hasExpertContent = content.includes('Expert Consultation') ||
                                 content.includes('$150') ||
                                 content.includes('1-hour') ||
                                 content.includes('video') ||
                                 content.includes('data scientist');
        
        if (hasExpertContent) {
          this.addResult('Expert Consultation Page', 'PASS', 'Expert consultation page loads with correct content');
        } else {
          this.addResult('Expert Consultation Page', 'PARTIAL', 'Page loads but content may be incomplete');
        }
        
        // Check for expert profiles
        const hasExpertProfiles = content.includes('Dr.') ||
                                  content.includes('Senior') ||
                                  content.includes('experience') ||
                                  content.includes('specialties');
        
        if (hasExpertProfiles) {
          this.addResult('Expert Profiles', 'PASS', 'Expert profiles are properly displayed');
        } else {
          this.addResult('Expert Profiles', 'FAIL', 'Expert profiles not found');
        }
      } else {
        this.addResult('Expert Consultation Page', 'FAIL', `Page not accessible: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Expert Consultation Page', 'FAIL', `Failed to access page: ${error.message}`);
    }
  }

  async testPricingPageIntegration() {
    try {
      // Test pricing page with service integration
      const response = await axios.get(`${this.baseUrl}/pricing`);
      
      if (response.status === 200) {
        const content = response.data;
        
        // Check for service integration on pricing page
        const hasServiceIntegration = content.includes('Pay-Per-Analysis') &&
                                      content.includes('Expert Consultation');
        
        if (hasServiceIntegration) {
          this.addResult('Pricing Page Integration', 'PASS', 'Services are integrated into pricing page');
        } else {
          this.addResult('Pricing Page Integration', 'FAIL', 'Services not properly integrated');
        }
        
        // Check for subscription tiers
        const hasSubscriptionTiers = content.includes('Free Trial') ||
                                     content.includes('Starter') ||
                                     content.includes('Professional');
        
        if (hasSubscriptionTiers) {
          this.addResult('Subscription Tiers', 'PASS', 'Subscription tiers are displayed');
        } else {
          this.addResult('Subscription Tiers', 'FAIL', 'Subscription tiers not found');
        }
      } else {
        this.addResult('Pricing Page Integration', 'FAIL', `Pricing page not accessible: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pricing Page Integration', 'FAIL', `Failed to access pricing page: ${error.message}`);
    }
  }

  async testNavigationFlow() {
    try {
      // Test navigation between service pages
      const landingResponse = await axios.get(`${this.baseUrl}/`);
      const payPerAnalysisResponse = await axios.get(`${this.baseUrl}/pay-per-analysis`);
      const expertConsultationResponse = await axios.get(`${this.baseUrl}/expert-consultation`);
      const pricingResponse = await axios.get(`${this.baseUrl}/pricing`);
      
      const allPagesAccessible = [landingResponse, payPerAnalysisResponse, expertConsultationResponse, pricingResponse]
        .every(response => response.status === 200);
      
      if (allPagesAccessible) {
        this.addResult('Navigation Flow', 'PASS', 'All service pages are accessible via navigation');
      } else {
        this.addResult('Navigation Flow', 'FAIL', 'Some service pages are not accessible');
      }
      
      // Check for back navigation
      const hasBackNavigation = payPerAnalysisResponse.data.includes('Back') &&
                                 expertConsultationResponse.data.includes('Back');
      
      if (hasBackNavigation) {
        this.addResult('Back Navigation', 'PASS', 'Back navigation is implemented on service pages');
      } else {
        this.addResult('Back Navigation', 'FAIL', 'Back navigation missing on service pages');
      }
    } catch (error) {
      this.addResult('Navigation Flow', 'FAIL', `Navigation test failed: ${error.message}`);
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

  async generateReport() {
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const partial = this.results.filter(r => r.status === 'PARTIAL').length;
    const total = this.results.length;
    
    const report = {
      summary: {
        total: total,
        passed: passed,
        failed: failed,
        partial: partial,
        success_rate: `${Math.round((passed / total) * 100)}%`
      },
      test_results: this.results,
      recommendations: this.generateRecommendations(),
      timestamp: new Date().toISOString()
    };
    
    // Write report to file
    fs.writeFileSync('services-integration-test-results.json', JSON.stringify(report, null, 2));
    
    console.log('\n📊 SERVICES INTEGRATION TEST SUMMARY');
    console.log('=====================================');
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Partial: ${partial}`);
    console.log(`Success Rate: ${report.summary.success_rate}`);
    
    if (failed === 0 && partial === 0) {
      console.log('\n🎉 All service integration tests passed! Pay-Per-Analysis and Expert Consultation are fully functional.');
    } else if (failed === 0) {
      console.log('\n✨ Core functionality works with some minor issues.');
    } else {
      console.log('\n⚠️ Some critical issues need attention before deployment.');
    }
    
    console.log('\n📝 Report saved to: services-integration-test-results.json');
  }

  generateRecommendations() {
    const recommendations = [];
    const failedTests = this.results.filter(r => r.status === 'FAIL');
    
    if (failedTests.some(test => test.test.includes('Server'))) {
      recommendations.push('Check server startup and ensure all dependencies are installed');
    }
    
    if (failedTests.some(test => test.test.includes('Page'))) {
      recommendations.push('Verify React routing configuration and component imports');
    }
    
    if (failedTests.some(test => test.test.includes('Navigation'))) {
      recommendations.push('Check App.tsx routing setup and navigation props');
    }
    
    if (failedTests.some(test => test.test.includes('Integration'))) {
      recommendations.push('Ensure service components are properly integrated into pricing page');
    }
    
    return recommendations;
  }
}

// Run the test
const tester = new ServicesIntegrationTester();
tester.runCompleteTest().catch(console.error);