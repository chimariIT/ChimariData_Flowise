/**
 * Test Enhanced Features - Smart Header Detection, Multivariate Analysis, Payment Integration
 * Tests all three critical improvements to the ChimariData platform
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

class EnhancedFeaturesTest {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async runTests() {
    console.log("🚀 Testing Enhanced ChimariData Features");
    console.log("=" * 50);

    await this.testSmartHeaderDetection();
    await this.testMultivariateAnalysis();
    await this.testPaymentIntegration();
    await this.testPricingCalculation();

    this.generateReport();
  }

  async testSmartHeaderDetection() {
    console.log("\n📊 Testing Smart Header Detection");
    
    try {
      // Create test CSV with title rows
      const csvWithTitles = `Marketing Campaign Analysis
Dataset Overview: Q4 2024 Campaign Performance
Generated on: 2024-12-01

Campaign Name,Impressions,Clicks,Conversions,Spend
Summer Sale,15000,750,45,1200
Fall Promo,12000,600,30,950
Holiday Special,20000,1200,80,1800
Black Friday,25000,1500,120,2200`;

      const formData = new FormData();
      formData.append('file', Buffer.from(csvWithTitles), {
        filename: 'campaign_data_with_titles.csv',
        contentType: 'text/csv'
      });

      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success && result.trialResults) {
        const schema = result.trialResults.schema;
        const expectedColumns = ['Campaign Name', 'Impressions', 'Clicks', 'Conversions', 'Spend'];
        const actualColumns = Object.keys(schema || {});
        
        const hasCorrectColumns = expectedColumns.every(col => actualColumns.includes(col));
        
        this.addResult("Smart Header Detection", 
          hasCorrectColumns ? "PASS" : "FAIL",
          hasCorrectColumns 
            ? "Successfully detected headers despite title rows"
            : `Expected columns: ${expectedColumns.join(', ')}, Got: ${actualColumns.join(', ')}`
        );

        // Test if multivariate analysis fields are present
        const analysis = result.trialResults.descriptiveAnalysis;
        const hasMultivariateFields = analysis?.correlation_analysis || analysis?.group_analysis;
        
        this.addResult("Multivariate Analysis Fields",
          hasMultivariateFields ? "PASS" : "FAIL",
          hasMultivariateFields 
            ? "Multivariate analysis fields present in results"
            : "Missing correlation_analysis or group_analysis fields"
        );

      } else {
        this.addResult("Smart Header Detection", "FAIL", 
          `Upload failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      this.addResult("Smart Header Detection", "ERROR", error.message);
    }
  }

  async testMultivariateAnalysis() {
    console.log("\n🔗 Testing Enhanced Multivariate Analysis");
    
    try {
      // Create test data with clear correlations and groups
      const multivariateData = `Product Category,Price,Sales Volume,Customer Rating,Marketing Spend
Electronics,299.99,150,4.2,5000
Electronics,399.99,120,4.5,6000
Electronics,199.99,200,3.8,4000
Clothing,49.99,300,4.1,2000
Clothing,79.99,250,4.3,2500
Clothing,29.99,400,3.9,1500
Home,149.99,180,4.0,3000
Home,199.99,150,4.4,3500
Home,99.99,220,3.7,2200`;

      const formData = new FormData();
      formData.append('file', Buffer.from(multivariateData), {
        filename: 'multivariate_test.csv',
        contentType: 'text/csv'
      });

      const response = await fetch(`${this.baseUrl}/api/trial-upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success && result.trialResults) {
        const analysis = result.trialResults.descriptiveAnalysis;
        
        // Check for correlation analysis
        const hasCorrelationMatrix = analysis?.correlation_analysis?.correlation_matrix;
        this.addResult("Correlation Analysis",
          hasCorrelationMatrix ? "PASS" : "FAIL",
          hasCorrelationMatrix 
            ? "Correlation matrix generated successfully"
            : "Missing correlation matrix in analysis"
        );

        // Check for group analysis
        const hasGroupAnalysis = analysis?.group_analysis && 
          Object.keys(analysis.group_analysis).length > 0;
        this.addResult("Group Analysis",
          hasGroupAnalysis ? "PASS" : "FAIL",
          hasGroupAnalysis 
            ? "Group analysis by categorical variables completed"
            : "Missing group analysis results"
        );

        // Check for variable recommendations
        const hasRecommendations = analysis?.multivariate_analysis?.recommended_pairs;
        this.addResult("Variable Recommendations",
          hasRecommendations ? "PASS" : "FAIL",
          hasRecommendations 
            ? "Variable pair recommendations generated"
            : "Missing variable pair recommendations"
        );

        // Check for outlier detection
        const hasOutlierDetection = analysis?.multivariate_analysis?.outlier_detection;
        this.addResult("Outlier Detection",
          hasOutlierDetection ? "PASS" : "FAIL",
          hasOutlierDetection 
            ? "Outlier detection completed"
            : "Missing outlier detection results"
        );

      } else {
        this.addResult("Multivariate Analysis", "FAIL", 
          `Analysis failed: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      this.addResult("Multivariate Analysis", "ERROR", error.message);
    }
  }

  async testPaymentIntegration() {
    console.log("\n💳 Testing Payment Integration");
    
    try {
      // Test pricing calculation endpoint
      const pricingResponse = await fetch(`${this.baseUrl}/api/calculate-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: ['analysis', 'visualization']
        })
      });

      const pricingResult = await pricingResponse.json();

      if (pricingResult.total && pricingResult.discount) {
        this.addResult("Pricing Calculation",
          "PASS",
          `Calculated price: $${pricingResult.total} with ${Math.round(pricingResult.discount * 100)}% discount`
        );
      } else {
        this.addResult("Pricing Calculation", "FAIL", 
          "Missing total or discount in pricing response");
      }

      // Test payment intent creation (will fail without Stripe key, but should handle gracefully)
      const paymentResponse = await fetch(`${this.baseUrl}/api/create-payment-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          features: ['analysis'],
          amount: 25
        })
      });

      const paymentResult = await paymentResponse.json();

      if (paymentResponse.status === 500 && paymentResult.error.includes('secret key')) {
        this.addResult("Payment Intent Endpoint",
          "PASS",
          "Endpoint correctly requires Stripe secret key"
        );
      } else if (paymentResult.clientSecret) {
        this.addResult("Payment Intent Endpoint",
          "PASS",
          "Payment intent created successfully"
        );
      } else {
        this.addResult("Payment Intent Endpoint", "FAIL", 
          `Unexpected response: ${JSON.stringify(paymentResult)}`);
      }

    } catch (error) {
      this.addResult("Payment Integration", "ERROR", error.message);
    }
  }

  async testPricingCalculation() {
    console.log("\n💰 Testing Progressive Pricing Model");
    
    try {
      const testCases = [
        { features: ['transformation'], expectedDiscount: 0 },
        { features: ['analysis', 'visualization'], expectedDiscount: 0.15 },
        { features: ['transformation', 'analysis', 'visualization'], expectedDiscount: 0.25 },
        { features: ['transformation', 'analysis', 'visualization', 'ai_insights'], expectedDiscount: 0.35 }
      ];

      for (const testCase of testCases) {
        const response = await fetch(`${this.baseUrl}/api/calculate-price`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features: testCase.features })
        });

        const result = await response.json();

        if (result.discount === testCase.expectedDiscount) {
          this.addResult(`Progressive Pricing (${testCase.features.length} features)`,
            "PASS",
            `Correct discount: ${Math.round(testCase.expectedDiscount * 100)}%`
          );
        } else {
          this.addResult(`Progressive Pricing (${testCase.features.length} features)`,
            "FAIL",
            `Expected ${testCase.expectedDiscount}, got ${result.discount}`
          );
        }
      }

    } catch (error) {
      this.addResult("Progressive Pricing", "ERROR", error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
    const statusIcon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
    console.log(`${statusIcon} ${testName}: ${message}`);
  }

  generateReport() {
    console.log("\n" + "=" * 50);
    console.log("📋 ENHANCED FEATURES TEST REPORT");
    console.log("=" * 50);

    const passed = this.results.filter(r => r.status === "PASS").length;
    const failed = this.results.filter(r => r.status === "FAIL").length;
    const errors = this.results.filter(r => r.status === "ERROR").length;

    console.log(`\n📊 Summary:`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Errors: ${errors}`);
    console.log(`📝 Total Tests: ${this.results.length}`);

    const successRate = (passed / this.results.length * 100).toFixed(1);
    console.log(`🎯 Success Rate: ${successRate}%`);

    // Key improvements verification
    console.log(`\n🔑 Key Improvements Status:`);
    const headerDetection = this.results.find(r => r.testName === "Smart Header Detection");
    const multivariateAnalysis = this.results.find(r => r.testName.includes("Multivariate"));
    const paymentIntegration = this.results.find(r => r.testName.includes("Payment"));

    console.log(`📊 Smart Header Detection: ${headerDetection?.status || "NOT TESTED"}`);
    console.log(`🔗 Multivariate Analysis: ${multivariateAnalysis?.status || "NOT TESTED"}`);
    console.log(`💳 Payment Integration: ${paymentIntegration?.status || "NOT TESTED"}`);

    if (failed > 0 || errors > 0) {
      console.log(`\n⚠️ Issues Found:`);
      this.results.filter(r => r.status !== "PASS").forEach(result => {
        console.log(`   ${result.testName}: ${result.message}`);
      });
    }

    // Save detailed results
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { passed, failed, errors, total: this.results.length, successRate },
      tests: this.results,
      keyImprovements: {
        smartHeaderDetection: headerDetection?.status === "PASS",
        multivariateAnalysis: this.results.filter(r => 
          r.testName.includes("Correlation") || 
          r.testName.includes("Group") || 
          r.testName.includes("Recommendation")
        ).every(r => r.status === "PASS"),
        paymentIntegration: paymentIntegration?.status === "PASS"
      }
    };

    fs.writeFileSync('enhanced-features-test-results.json', JSON.stringify(reportData, null, 2));
    console.log(`\n💾 Detailed results saved to: enhanced-features-test-results.json`);
  }
}

// Run the tests
(async () => {
  const tester = new EnhancedFeaturesTest();
  await tester.runTests();
})().catch(console.error);