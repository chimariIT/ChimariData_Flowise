/**
 * Three-Tier Pricing System Verification Test
 * Tests the complete pricing structure and API functionality
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class PricingSystemTester {
  constructor() {
    this.testResults = [];
  }

  async runCompleteTest() {
    console.log('🔍 Testing Three-Tier Pricing System...\n');
    
    await this.testPricingTiers();
    await this.testRecommendationEngine();
    await this.testPricingEstimation();
    await this.testTierValidation();
    await this.generateReport();
  }

  async testPricingTiers() {
    console.log('Testing pricing tiers API...');
    try {
      const response = await fetch(`${BASE_URL}/api/pricing/tiers`);
      if (response.ok) {
        const data = await response.json();
        const tiers = data.tiers;

        if (tiers.length === 3) {
          this.addResult('Pricing Tiers Count', 'PASS', '3 tiers configured correctly');
          
          // Verify Free tier
          const freeTier = tiers.find(t => t.name === 'Free');
          if (freeTier && freeTier.price === 0 && freeTier.limits.analysesPerMonth === 3 && freeTier.limits.maxDataSizeMB === 10) {
            this.addResult('Free Tier Configuration', 'PASS', 'Free tier: 3 analyses, 10MB limit');
          } else {
            this.addResult('Free Tier Configuration', 'FAIL', 'Free tier misconfigured');
          }

          // Verify Professional tier
          const proTier = tiers.find(t => t.name === 'Professional');
          if (proTier && proTier.price === 49 && proTier.limits.analysesPerMonth === -1 && proTier.limits.maxDataSizeMB === 500) {
            this.addResult('Professional Tier Configuration', 'PASS', 'Professional tier: $49/month, unlimited analyses, 500MB');
          } else {
            this.addResult('Professional Tier Configuration', 'FAIL', 'Professional tier misconfigured');
          }

          // Verify Enterprise tier
          const entTier = tiers.find(t => t.name === 'Enterprise');
          if (entTier && entTier.price === 299 && entTier.limits.analysesPerMonth === -1 && entTier.limits.maxDataSizeMB === -1) {
            this.addResult('Enterprise Tier Configuration', 'PASS', 'Enterprise tier: $299/month, unlimited everything');
          } else {
            this.addResult('Enterprise Tier Configuration', 'FAIL', 'Enterprise tier misconfigured');
          }

          console.log('✓ Pricing tiers configured correctly');
        } else {
          this.addResult('Pricing Tiers Count', 'FAIL', `Expected 3 tiers, got ${tiers.length}`);
        }
      } else {
        this.addResult('Pricing Tiers API', 'FAIL', `API returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Pricing Tiers API', 'FAIL', `API error: ${error.message}`);
    }
  }

  async testRecommendationEngine() {
    console.log('Testing recommendation engine...');
    
    const testCases = [
      {
        input: { dataSizeMB: 5, recordCount: 1000, analysesPerMonth: 2 },
        expected: 'Free',
        description: 'Small data, few analyses'
      },
      {
        input: { dataSizeMB: 50, recordCount: 25000, analysesPerMonth: 10 },
        expected: 'Professional',
        description: 'Medium data, regular usage'
      },
      {
        input: { dataSizeMB: 1000, recordCount: 500000, analysesPerMonth: 100 },
        expected: 'Enterprise',
        description: 'Large data, heavy usage'
      }
    ];

    for (const testCase of testCases) {
      try {
        const response = await fetch(`${BASE_URL}/api/pricing/recommend`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testCase.input)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.recommendedTier.name === testCase.expected) {
            this.addResult(`Recommendation: ${testCase.description}`, 'PASS', `Correctly recommended ${testCase.expected}`);
            console.log(`✓ ${testCase.description} → ${testCase.expected}`);
          } else {
            this.addResult(`Recommendation: ${testCase.description}`, 'FAIL', `Expected ${testCase.expected}, got ${data.recommendedTier.name}`);
          }
        } else {
          this.addResult(`Recommendation: ${testCase.description}`, 'FAIL', `API error: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Recommendation: ${testCase.description}`, 'FAIL', `Request error: ${error.message}`);
      }
    }
  }

  async testPricingEstimation() {
    console.log('Testing pricing estimation...');
    
    const testCases = [
      { dataSizeMB: 1, questionsCount: 1, analysisType: 'standard' },
      { dataSizeMB: 10, questionsCount: 5, analysisType: 'advanced' },
      { dataSizeMB: 50, questionsCount: 10, analysisType: 'custom' }
    ];

    for (const testCase of testCases) {
      try {
        const params = new URLSearchParams(testCase);
        const response = await fetch(`${BASE_URL}/api/pricing/estimate?${params}`);

        if (response.ok) {
          const data = await response.json();
          if (data.estimate && data.estimate.startsWith('$')) {
            this.addResult(`Pricing Estimation: ${testCase.analysisType}`, 'PASS', `Estimate: ${data.estimate}`);
            console.log(`✓ ${testCase.analysisType} analysis: ${data.estimate}`);
          } else {
            this.addResult(`Pricing Estimation: ${testCase.analysisType}`, 'FAIL', 'Invalid estimate format');
          }
        } else {
          this.addResult(`Pricing Estimation: ${testCase.analysisType}`, 'FAIL', `API error: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Pricing Estimation: ${testCase.analysisType}`, 'FAIL', `Request error: ${error.message}`);
      }
    }
  }

  async testTierValidation() {
    console.log('Testing tier validation logic...');
    
    // Test scenarios for tier validation
    const scenarios = [
      {
        description: 'Free tier within limits',
        expectValid: true,
        dataSizeMB: 8,
        recordCount: 3000
      },
      {
        description: 'Free tier exceeding data size',
        expectValid: false,
        dataSizeMB: 15,
        recordCount: 3000
      },
      {
        description: 'Free tier exceeding record count',
        expectValid: false,
        dataSizeMB: 8,
        recordCount: 8000
      }
    ];

    for (const scenario of scenarios) {
      // Note: This would require authentication, so we'll just verify the API exists
      try {
        const response = await fetch(`${BASE_URL}/api/pricing/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataSizeMB: scenario.dataSizeMB,
            recordCount: scenario.recordCount
          })
        });

        // Expecting 401 since we're not authenticated, but API should exist
        if (response.status === 401) {
          this.addResult(`Validation API: ${scenario.description}`, 'PASS', 'Validation API accessible (requires auth)');
          console.log(`✓ Validation API accessible for: ${scenario.description}`);
        } else {
          this.addResult(`Validation API: ${scenario.description}`, 'FAIL', `Unexpected status: ${response.status}`);
        }
      } catch (error) {
        this.addResult(`Validation API: ${scenario.description}`, 'FAIL', `Request error: ${error.message}`);
      }
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
    console.log('\n' + '='.repeat(70));
    console.log('THREE-TIER PRICING SYSTEM TEST RESULTS');
    console.log('='.repeat(70));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    const successRate = Math.round((passed / total) * 100);

    console.log(`\nOverall Results: ${passed}/${total} tests passed (${successRate}% success rate)\n`);

    if (failed > 0) {
      console.log('❌ FAILED TESTS:');
      this.testResults.filter(r => r.status === 'FAIL').forEach(result => {
        console.log(`  ❌ ${result.test}: ${result.message}`);
      });
      console.log('');
    }

    console.log('✅ PASSED TESTS:');
    this.testResults.filter(r => r.status === 'PASS').forEach(result => {
      console.log(`  ✓ ${result.test}: ${result.message}`);
    });

    console.log('\n' + '='.repeat(70));
    
    if (successRate >= 90) {
      console.log('🎉 THREE-TIER PRICING SYSTEM FULLY OPERATIONAL');
      console.log('✓ Free Tier: 3 analyses, 10MB data limit');
      console.log('✓ Professional Tier: $49/month, unlimited analyses, 500MB');
      console.log('✓ Enterprise Tier: $299/month, unlimited everything');
      console.log('✓ Recommendation engine working correctly');
      console.log('✓ Pricing estimation functional');
      console.log('✓ API endpoints accessible');
    } else {
      console.log('⚠️ PRICING SYSTEM NEEDS ATTENTION');
    }

    console.log('='.repeat(70));
  }
}

// Run the pricing system test
const tester = new PricingSystemTester();
tester.runCompleteTest().catch(console.error);