/**
 * Comprehensive Test Runner for Dynamic Pricing System
 * Runs all end-to-end and frontend integration tests
 */

const DynamicPricingE2ETest = require('./dynamic-pricing-e2e-test.cjs');
const FrontendIntegrationTest = require('./frontend-integration-test.cjs');
const fs = require('fs');

// Add fetch polyfill for Node.js
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

class ComprehensiveTestRunner {
  constructor() {
    this.results = {
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      overallSummary: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        successRate: '0%'
      },
      testSuites: {}
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async runTestSuite(suiteName, TestClass) {
    this.log(`\n🚀 Starting ${suiteName}...`);
    
    try {
      const tester = new TestClass();
      const report = await tester.runAllTests();
      
      this.results.testSuites[suiteName] = {
        status: 'completed',
        ...report.summary,
        errors: report.errors || [],
        timestamp: new Date().toISOString()
      };
      
      // Add to overall totals
      this.results.overallSummary.totalTests += report.summary.totalTests;
      this.results.overallSummary.passed += report.summary.passed;
      this.results.overallSummary.failed += report.summary.failed;
      
      this.log(`✅ ${suiteName} completed: ${report.summary.passed}/${report.summary.totalTests} passed`, 'success');
      return report;
      
    } catch (error) {
      this.log(`❌ ${suiteName} failed: ${error.message}`, 'error');
      this.results.testSuites[suiteName] = {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
      throw error;
    }
  }

  async checkServerHealth() {
    this.log('🏥 Checking server health...');
    
    try {
      const response = await fetch('http://localhost:5000/');
      if (response.status === 200) {
        this.log('✅ Server is running and accessible', 'success');
        return true;
      } else {
        this.log(`⚠️ Server responded with status: ${response.status}`, 'warning');
        return false;
      }
    } catch (error) {
      this.log(`❌ Server health check failed: ${error.message}`, 'error');
      return false;
    }
  }

  async waitForServer(maxWaitTime = 30000, checkInterval = 2000) {
    this.log('⏳ Waiting for server to be ready...');
    
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitTime) {
      if (await this.checkServerHealth()) {
        return true;
      }
      
      this.log(`⏳ Server not ready, waiting ${checkInterval/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    throw new Error(`Server did not become ready within ${maxWaitTime/1000} seconds`);
  }

  generateOverallReport() {
    // Calculate overall success rate
    this.results.overallSummary.successRate = 
      `${((this.results.overallSummary.passed / this.results.overallSummary.totalTests) * 100).toFixed(1)}%`;
    
    this.results.endTime = new Date().toISOString();
    this.results.duration = Date.now() - new Date(this.results.startTime).getTime();
    
    return this.results;
  }

  async saveReport() {
    const reportName = 'comprehensive-test-results.json';
    await fs.promises.writeFile(reportName, JSON.stringify(this.results, null, 2));
    this.log(`📄 Comprehensive report saved to: ${reportName}`);
    return reportName;
  }

  displaySummary() {
    this.log('\n' + '='.repeat(60));
    this.log('📊 COMPREHENSIVE TEST RESULTS SUMMARY');
    this.log('='.repeat(60));
    
    this.log(`🕐 Test Duration: ${(this.results.duration / 1000).toFixed(1)}s`);
    this.log(`📋 Total Tests: ${this.results.overallSummary.totalTests}`);
    this.log(`✅ Passed: ${this.results.overallSummary.passed}`, 'success');
    this.log(`❌ Failed: ${this.results.overallSummary.failed}`, this.results.overallSummary.failed > 0 ? 'error' : 'info');
    this.log(`📈 Success Rate: ${this.results.overallSummary.successRate}`);
    
    this.log('\n📋 Test Suite Breakdown:');
    Object.entries(this.results.testSuites).forEach(([suiteName, suiteResults]) => {
      if (suiteResults.status === 'completed') {
        this.log(`  ${suiteName}: ${suiteResults.passed}/${suiteResults.totalTests} (${suiteResults.successRate})`, 
                 suiteResults.failed === 0 ? 'success' : 'warning');
        
        if (suiteResults.errors && suiteResults.errors.length > 0) {
          suiteResults.errors.forEach(error => {
            this.log(`    ↳ ${error}`, 'error');
          });
        }
      } else {
        this.log(`  ${suiteName}: ERROR - ${suiteResults.error}`, 'error');
      }
    });
    
    // Overall assessment
    this.log('\n🎯 Overall Assessment:');
    if (this.results.overallSummary.failed === 0) {
      this.log('🎉 All tests passed! System is fully functional.', 'success');
    } else if (this.results.overallSummary.failed < this.results.overallSummary.totalTests * 0.1) {
      this.log('⚠️ Minor issues detected. System is mostly functional.', 'warning');
    } else {
      this.log('❌ Significant issues detected. System needs attention.', 'error');
    }
  }

  async runAll() {
    try {
      this.log('🚀 Starting Comprehensive Dynamic Pricing System Tests');
      this.log('='.repeat(60));
      
      // Wait for server to be ready
      await this.waitForServer();
      
      // Run Frontend Integration Tests first (faster)
      await this.runTestSuite('Frontend Integration Tests', FrontendIntegrationTest);
      
      // Run End-to-End Tests (more comprehensive)
      await this.runTestSuite('End-to-End Tests', DynamicPricingE2ETest);
      
      // Generate final report
      this.generateOverallReport();
      await this.saveReport();
      
      // Display summary
      this.displaySummary();
      
      return this.results;
      
    } catch (error) {
      this.log(`💥 Critical failure in test runner: ${error.message}`, 'error');
      this.results.criticalError = error.message;
      this.results.endTime = new Date().toISOString();
      
      await this.saveReport();
      throw error;
    }
  }
}

// Feature detection and validation
async function validateSystemRequirements() {
  console.log('🔍 Validating system requirements...');
  
  const checks = [
    {
      name: 'Node.js fetch support',
      test: () => typeof fetch !== 'undefined',
      fix: 'Make sure Node.js version supports fetch or install node-fetch'
    },
    {
      name: 'File system access',
      test: () => typeof require('fs').promises !== 'undefined',
      fix: 'File system promises not available'
    },
    {
      name: 'Network access',
      test: async () => {
        try {
          await fetch('http://localhost:5000/', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          return true;
        } catch {
          return false;
        }
      },
      fix: 'Make sure the development server is running on port 5000'
    }
  ];
  
  for (const check of checks) {
    try {
      const result = await check.test();
      if (!result) {
        throw new Error(check.fix);
      }
      console.log(`✅ ${check.name}: OK`);
    } catch (error) {
      console.log(`❌ ${check.name}: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  try {
    await validateSystemRequirements();
    
    const runner = new ComprehensiveTestRunner();
    const results = await runner.runAll();
    
    // Exit with appropriate code
    process.exit(results.overallSummary.failed === 0 ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  // Add global fetch if not available (for older Node.js versions)
  if (typeof fetch === 'undefined') {
    try {
      global.fetch = require('node-fetch');
    } catch (e) {
      console.log('⚠️  node-fetch not available, using built-in fetch');
    }
  }
  
  main();
}

module.exports = ComprehensiveTestRunner;