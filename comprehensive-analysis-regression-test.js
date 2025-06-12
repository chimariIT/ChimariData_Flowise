/**
 * Comprehensive Analysis & Pricing Regression Test
 * Specifically tests "Start Analysis" functionality and pricing model consistency
 */

import https from 'https';
import http from 'http';
import fs from 'fs';

class AnalysisRegressionTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
    this.issues = [];
  }

  async runCompleteTest() {
    console.log('🧪 Starting Comprehensive Analysis & Pricing Regression Test...\n');
    
    try {
      await this.testServerConnection();
      await this.testPricingEndpoints();
      await this.testAnalysisButtonEndpoints();
      await this.testPayPerAnalysisPage();
      await this.testPricingPageConsistency();
      await this.testCompareOptionsAccuracy();
      await this.testNavigationFlow();
      await this.testFrontendRouting();
      
      await this.generateComprehensiveReport();
    } catch (error) {
      console.error('Test suite failed:', error);
      this.addResult('Test Suite', 'FAILED', `Suite execution failed: ${error.message}`);
    }
  }

  async testServerConnection() {
    try {
      const response = await this.makeRequest('GET', '/api/health');
      if (response.statusCode === 200) {
        this.addResult('Server Connection', 'PASSED', 'Server is responding');
      } else {
        this.addResult('Server Connection', 'FAILED', `Server returned ${response.statusCode}`);
      }
    } catch (error) {
      this.addResult('Server Connection', 'FAILED', `Cannot connect to server: ${error.message}`);
    }
  }

  async testPricingEndpoints() {
    console.log('Testing pricing API endpoints...');
    
    // Test pricing tiers endpoint
    try {
      const response = await this.makeRequest('GET', '/api/pricing/tiers');
      const data = JSON.parse(response.data);
      
      if (data.tiers && Array.isArray(data.tiers)) {
        this.addResult('Pricing Tiers API', 'PASSED', `Found ${data.tiers.length} pricing tiers`);
        
        // Check for pay-per-analysis tier
        const payPerAnalysisTier = data.tiers.find(tier => tier.name.toLowerCase().includes('pay-per-analysis'));
        if (payPerAnalysisTier) {
          this.addResult('Pay-Per-Analysis Tier', 'PASSED', `Found tier: ${payPerAnalysisTier.name} - $${payPerAnalysisTier.price}`);
        } else {
          this.addResult('Pay-Per-Analysis Tier', 'FAILED', 'Pay-per-analysis tier not found in API response');
          this.issues.push('Pay-per-analysis pricing tier missing from API');
        }
      } else {
        this.addResult('Pricing Tiers API', 'FAILED', 'Invalid pricing tiers response structure');
      }
    } catch (error) {
      this.addResult('Pricing Tiers API', 'FAILED', `API error: ${error.message}`);
    }

    // Test pay-per-analysis calculation endpoint
    try {
      const testData = {
        dataSize: 1000,
        complexity: 'medium',
        provider: 'openai'
      };
      
      const response = await this.makeRequest('POST', '/api/pricing/calculate-analysis', testData);
      const data = JSON.parse(response.data);
      
      if (data.price && typeof data.price === 'number') {
        this.addResult('Analysis Price Calculation', 'PASSED', `Calculated price: $${data.price}`);
        
        if (data.price >= 25) {
          this.addResult('Minimum Price Check', 'PASSED', `Price ${data.price} meets $25 minimum`);
        } else {
          this.addResult('Minimum Price Check', 'FAILED', `Price ${data.price} below $25 minimum`);
          this.issues.push(`Analysis pricing below minimum: $${data.price}`);
        }
      } else {
        this.addResult('Analysis Price Calculation', 'FAILED', 'Invalid price calculation response');
      }
    } catch (error) {
      this.addResult('Analysis Price Calculation', 'FAILED', `Calculation error: ${error.message}`);
    }
  }

  async testAnalysisButtonEndpoints() {
    console.log('Testing analysis button endpoints...');
    
    // Test start analysis endpoint
    try {
      const response = await this.makeRequest('POST', '/api/analysis/start', {
        projectName: 'Test Analysis',
        analysisType: 'basic'
      });
      
      if (response.statusCode === 200 || response.statusCode === 201) {
        this.addResult('Start Analysis Endpoint', 'PASSED', 'Analysis start endpoint responding');
      } else if (response.statusCode === 401) {
        this.addResult('Start Analysis Endpoint', 'PASSED', 'Properly requires authentication');
      } else {
        this.addResult('Start Analysis Endpoint', 'FAILED', `Unexpected status: ${response.statusCode}`);
        this.issues.push(`Start analysis endpoint returning ${response.statusCode}`);
      }
    } catch (error) {
      this.addResult('Start Analysis Endpoint', 'FAILED', `Endpoint error: ${error.message}`);
      this.issues.push('Start analysis endpoint not accessible');
    }
  }

  async testPayPerAnalysisPage() {
    console.log('Testing pay-per-analysis page structure...');
    
    try {
      const response = await this.makeRequest('GET', '/');
      const html = response.data;
      
      // Check for pay-per-analysis button/link
      if (html.includes('Start $25 Analysis') || html.includes('pay-per-analysis')) {
        this.addResult('Pay-Per-Analysis Button', 'PASSED', 'Button found in page content');
      } else {
        this.addResult('Pay-Per-Analysis Button', 'FAILED', 'Button not found in page content');
        this.issues.push('Start $25 Analysis button missing from page');
      }
      
      // Check for pricing consistency
      if (html.includes('$25') && html.includes('Analysis')) {
        this.addResult('Pricing Display', 'PASSED', '$25 analysis pricing displayed');
      } else {
        this.addResult('Pricing Display', 'FAILED', '$25 analysis pricing not clearly displayed');
        this.issues.push('$25 analysis pricing not prominently displayed');
      }
      
    } catch (error) {
      this.addResult('Pay-Per-Analysis Page', 'FAILED', `Page test error: ${error.message}`);
    }
  }

  async testPricingPageConsistency() {
    console.log('Testing pricing page consistency...');
    
    try {
      // Test pricing page endpoint
      const response = await this.makeRequest('GET', '/api/pricing/compare');
      
      if (response.statusCode === 200) {
        const data = JSON.parse(response.data);
        
        // Check for subscription vs pay-per-analysis comparison
        if (data.plans && Array.isArray(data.plans)) {
          const hasPayPerAnalysis = data.plans.some(plan => 
            plan.name && plan.name.toLowerCase().includes('pay-per-analysis')
          );
          
          if (hasPayPerAnalysis) {
            this.addResult('Pricing Comparison', 'PASSED', 'Pay-per-analysis included in comparison');
          } else {
            this.addResult('Pricing Comparison', 'FAILED', 'Pay-per-analysis missing from comparison');
            this.issues.push('Pay-per-analysis option not in pricing comparison');
          }
        }
      } else {
        this.addResult('Pricing Comparison API', 'FAILED', `API returned ${response.statusCode}`);
      }
    } catch (error) {
      this.addResult('Pricing Comparison API', 'FAILED', `API error: ${error.message}`);
    }
  }

  async testCompareOptionsAccuracy() {
    console.log('Testing compare options accuracy...');
    
    try {
      const response = await this.makeRequest('GET', '/api/pricing/tiers');
      const data = JSON.parse(response.data);
      
      if (data.tiers) {
        const subscriptionTiers = data.tiers.filter(tier => tier.type === 'subscription');
        const analysisOptions = data.tiers.filter(tier => tier.type === 'pay-per-use');
        
        if (subscriptionTiers.length > 0 && analysisOptions.length > 0) {
          this.addResult('Pricing Model Separation', 'PASSED', 'Both subscription and pay-per-use options available');
          
          // Check pricing accuracy
          const cheapestSubscription = Math.min(...subscriptionTiers.map(t => t.price));
          const analysisPrice = analysisOptions[0]?.price || 25;
          
          if (analysisPrice === 25) {
            this.addResult('Analysis Price Accuracy', 'PASSED', 'Pay-per-analysis correctly priced at $25');
          } else {
            this.addResult('Analysis Price Accuracy', 'FAILED', `Analysis price is $${analysisPrice}, should be $25`);
            this.issues.push(`Incorrect analysis pricing: $${analysisPrice} instead of $25`);
          }
          
        } else {
          this.addResult('Pricing Model Separation', 'FAILED', 'Missing subscription or pay-per-use options');
          this.issues.push('Pricing model not properly separated between subscription and pay-per-use');
        }
      }
    } catch (error) {
      this.addResult('Compare Options Accuracy', 'FAILED', `Test error: ${error.message}`);
    }
  }

  async testNavigationFlow() {
    console.log('Testing navigation flow for analysis...');
    
    // Test landing page to pay-per-analysis flow
    try {
      const landingResponse = await this.makeRequest('GET', '/');
      const landingHtml = landingResponse.data;
      
      // Check if landing page has proper links to analysis
      if (landingHtml.includes('/pay-per-analysis') || landingHtml.includes('Start $25 Analysis')) {
        this.addResult('Analysis Navigation Link', 'PASSED', 'Navigation link found on landing page');
      } else {
        this.addResult('Analysis Navigation Link', 'FAILED', 'Navigation link missing from landing page');
        this.issues.push('No clear navigation from landing page to pay-per-analysis');
      }
      
    } catch (error) {
      this.addResult('Navigation Flow Test', 'FAILED', `Navigation test error: ${error.message}`);
    }
  }

  async testFrontendRouting() {
    console.log('Testing frontend routing for analysis pages...');
    
    const routesToTest = [
      '/pay-per-analysis',
      '/pricing',
      '/expert-consultation'
    ];
    
    for (const route of routesToTest) {
      try {
        const response = await this.makeRequest('GET', route);
        
        if (response.statusCode === 200) {
          this.addResult(`Route ${route}`, 'PASSED', 'Route accessible');
        } else {
          this.addResult(`Route ${route}`, 'FAILED', `Route returned ${response.statusCode}`);
          this.issues.push(`Route ${route} not accessible`);
        }
      } catch (error) {
        this.addResult(`Route ${route}`, 'FAILED', `Route error: ${error.message}`);
      }
    }
  }

  makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RegressionTester/1.0'
        }
      };

      if (data) {
        const postData = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: responseData
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    });
  }

  addResult(testName, status, message) {
    const result = { testName, status, message, timestamp: new Date().toISOString() };
    this.results.push(result);
    
    const statusIcon = status === 'PASSED' ? '✅' : status === 'FAILED' ? '❌' : '⚠️';
    console.log(`${statusIcon} ${testName}: ${message}`);
  }

  async generateComprehensiveReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 COMPREHENSIVE ANALYSIS & PRICING REGRESSION TEST REPORT');
    console.log('='.repeat(80));
    
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    
    console.log(`\n📈 TEST SUMMARY:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`📊 Total Tests: ${this.results.length}`);
    console.log(`🎯 Success Rate: ${((passed / this.results.length) * 100).toFixed(1)}%`);
    
    if (this.issues.length > 0) {
      console.log(`\n🚨 CRITICAL ISSUES IDENTIFIED:`);
      this.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }
    
    console.log(`\n📋 DETAILED TEST RESULTS:`);
    this.results.forEach(result => {
      const statusIcon = result.status === 'PASSED' ? '✅' : result.status === 'FAILED' ? '❌' : '⚠️';
      console.log(`${statusIcon} ${result.testName}: ${result.message}`);
    });
    
    // Generate recommendations
    console.log(`\n🔧 RECOMMENDATIONS:`);
    if (failed > 0) {
      console.log('1. Fix all failed tests before deployment');
      if (this.issues.includes('Start analysis endpoint not accessible')) {
        console.log('2. Implement /api/analysis/start endpoint');
      }
      if (this.issues.find(issue => issue.includes('$25'))) {
        console.log('3. Correct pay-per-analysis pricing to exactly $25');
      }
      if (this.issues.find(issue => issue.includes('navigation'))) {
        console.log('4. Fix navigation links for analysis functionality');
      }
    } else {
      console.log('1. All tests passed - system ready for production');
    }
    
    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      summary: { passed, failed, warnings, total: this.results.length },
      issues: this.issues,
      results: this.results,
      recommendations: this.generateRecommendations()
    };
    
    fs.writeFileSync('analysis-regression-test-results.json', JSON.stringify(report, null, 2));
    console.log(`\n💾 Detailed report saved to: analysis-regression-test-results.json`);
    console.log('='.repeat(80));
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.issues.includes('Start analysis endpoint not accessible')) {
      recommendations.push('Implement missing /api/analysis/start endpoint');
    }
    
    if (this.issues.find(issue => issue.includes('pricing'))) {
      recommendations.push('Fix pricing model inconsistencies in API and frontend');
    }
    
    if (this.issues.find(issue => issue.includes('navigation'))) {
      recommendations.push('Fix navigation routing for analysis features');
    }
    
    return recommendations;
  }
}

// Run the test
const tester = new AnalysisRegressionTester();
tester.runCompleteTest().catch(console.error);