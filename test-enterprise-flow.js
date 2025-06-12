/**
 * Enterprise Contact Flow Test
 * Tests the complete enterprise inquiry system including form submission and database storage
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

class EnterpriseFlowTester {
  constructor() {
    this.testResults = [];
  }

  async runCompleteTest() {
    console.log('🏢 Testing Enterprise Contact Flow...\n');
    
    await this.testEnterprisePageAccess();
    await this.testEnterpriseInquirySubmission();
    await this.testInquiryRetrieval();
    await this.testPricingPageEnterpriseButton();
    
    await this.generateReport();
  }

  async testEnterprisePageAccess() {
    console.log('Testing enterprise contact page access...');
    try {
      const response = await fetch(`${BASE_URL}/enterprise-contact`);
      if (response.ok) {
        this.addResult('Enterprise Contact Page Access', 'PASS', 'Page accessible');
      } else {
        this.addResult('Enterprise Contact Page Access', 'FAIL', `Page returned ${response.status}`);
      }
    } catch (error) {
      this.addResult('Enterprise Contact Page Access', 'FAIL', `Access error: ${error.message}`);
    }
  }

  async testEnterpriseInquirySubmission() {
    console.log('Testing enterprise inquiry submission...');
    
    const testInquiry = {
      companyName: "Test Corp",
      contactName: "John Doe",
      email: "john.doe@testcorp.com",
      phone: "+1-555-123-4567",
      projectDescription: "We need a comprehensive data analytics solution for our enterprise operations including real-time dashboards and predictive analytics.",
      estimatedDataSize: "large",
      timeline: "medium",
      budget: "medium",
      specificRequirements: "Must integrate with our existing Salesforce and SAP systems. SOC2 compliance required."
    };

    try {
      const response = await fetch(`${BASE_URL}/api/enterprise/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testInquiry)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.inquiry && data.inquiry.id) {
          this.addResult('Enterprise Inquiry Submission', 'PASS', `Inquiry created with ID: ${data.inquiry.id}`);
          this.testInquiryId = data.inquiry.id;
        } else {
          this.addResult('Enterprise Inquiry Submission', 'FAIL', 'Inquiry created but missing expected data structure');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        this.addResult('Enterprise Inquiry Submission', 'FAIL', `Submission failed: ${response.status} - ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.addResult('Enterprise Inquiry Submission', 'FAIL', `Submission error: ${error.message}`);
    }
  }

  async testInquiryRetrieval() {
    console.log('Testing inquiry retrieval...');
    try {
      const response = await fetch(`${BASE_URL}/api/enterprise/inquiries`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.inquiries && Array.isArray(data.inquiries)) {
          const foundInquiry = data.inquiries.find(inq => inq.id === this.testInquiryId);
          if (foundInquiry) {
            this.addResult('Inquiry Retrieval', 'PASS', `Found submitted inquiry: ${foundInquiry.companyName}`);
            
            // Test inquiry details
            if (foundInquiry.companyName === "Test Corp" && 
                foundInquiry.contactName === "John Doe" &&
                foundInquiry.email === "john.doe@testcorp.com") {
              this.addResult('Inquiry Data Integrity', 'PASS', 'All inquiry data properly stored');
            } else {
              this.addResult('Inquiry Data Integrity', 'FAIL', 'Inquiry data does not match submitted data');
            }
          } else {
            this.addResult('Inquiry Retrieval', 'FAIL', 'Submitted inquiry not found in retrieval');
          }
        } else {
          this.addResult('Inquiry Retrieval', 'FAIL', 'Invalid response structure from inquiries endpoint');
        }
      } else {
        this.addResult('Inquiry Retrieval', 'FAIL', `Retrieval failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Inquiry Retrieval', 'FAIL', `Retrieval error: ${error.message}`);
    }
  }

  async testPricingPageEnterpriseButton() {
    console.log('Testing pricing page enterprise integration...');
    try {
      // Test that pricing API includes Enterprise tier with correct structure
      const response = await fetch(`${BASE_URL}/api/pricing/tiers`);
      if (response.ok) {
        const data = await response.json();
        const enterpriseTier = data.tiers.find(tier => tier.name === 'Enterprise');
        
        if (enterpriseTier) {
          if (enterpriseTier.price === -1) {
            this.addResult('Enterprise Tier Configuration', 'PASS', 'Enterprise tier configured with quote pricing (-1)');
          } else {
            this.addResult('Enterprise Tier Configuration', 'FAIL', `Enterprise tier has wrong price: ${enterpriseTier.price}, expected -1`);
          }
        } else {
          this.addResult('Enterprise Tier Configuration', 'FAIL', 'Enterprise tier not found in pricing structure');
        }
      } else {
        this.addResult('Enterprise Tier Configuration', 'FAIL', `Pricing API failed: ${response.status}`);
      }
    } catch (error) {
      this.addResult('Enterprise Tier Configuration', 'FAIL', `Pricing test error: ${error.message}`);
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
    console.log('\n' + '='.repeat(80));
    console.log('ENTERPRISE CONTACT FLOW TEST RESULTS');
    console.log('='.repeat(80));

    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    const successRate = Math.round((passed / total) * 100);

    console.log(`\nOverall Results: ${passed}/${total} tests passed (${successRate}% success rate)`);
    console.log(`Passed: ${passed} | Failed: ${failed}\n`);

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

    console.log('\n' + '='.repeat(80));
    
    if (successRate >= 90) {
      console.log('🎉 ENTERPRISE CONTACT FLOW TEST PASSED');
      console.log('✓ Enterprise contact form accessible');
      console.log('✓ Inquiry submission working correctly');
      console.log('✓ Database storage and retrieval functional');
      console.log('✓ Pricing page integration complete');
      console.log('✓ Complete enterprise workflow operational');
    } else {
      console.log('❌ ENTERPRISE CONTACT FLOW TEST FAILED');
      console.log('Some components of the enterprise contact system are not working properly.');
    }

    console.log('='.repeat(80));

    // Save detailed results
    const detailedResults = {
      summary: {
        total,
        passed,
        failed,
        successRate,
        timestamp: new Date().toISOString()
      },
      results: this.testResults
    };

    const fs = await import('fs');
    fs.writeFileSync('enterprise-flow-test-results.json', JSON.stringify(detailedResults, null, 2));
    console.log('📄 Detailed results saved to enterprise-flow-test-results.json');
  }
}

// Run the test
const tester = new EnterpriseFlowTester();
tester.runCompleteTest().catch(console.error);