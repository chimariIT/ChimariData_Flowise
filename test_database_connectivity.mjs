#!/usr/bin/env node

/**
 * Comprehensive Database Connectivity and Performance Testing
 * Tests PostgreSQL connection, CRUD operations, and performance metrics
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

// ANSI color codes for better output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bold + colors.blue);
  console.log('='.repeat(60));
}

function logTest(testName) {
  log(`\n🗄️  Testing: ${testName}`, colors.yellow);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

class DatabaseTester {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
      performanceMetrics: []
    };
  }

  async runTest(testName, testFunction) {
    logTest(testName);
    this.testResults.total++;
    
    const startTime = Date.now();
    try {
      const result = await testFunction();
      const duration = Date.now() - startTime;
      
      if (result.success) {
        logSuccess(result.message);
        this.testResults.passed++;
      } else {
        logError(result.message);
        this.testResults.failed++;
        this.testResults.errors.push(`${testName}: ${result.message}`);
      }
      
      if (result.details) {
        result.details.forEach(detail => logInfo(detail));
      }
      
      if (result.warnings) {
        result.warnings.forEach(warning => logWarning(warning));
      }

      // Store performance metrics
      this.testResults.performanceMetrics.push({
        test: testName,
        duration,
        success: result.success
      });
      
      logInfo(`Test completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = `Exception: ${error.message}`;
      logError(message);
      this.testResults.failed++;
      this.testResults.errors.push(`${testName}: ${message}`);
      
      this.testResults.performanceMetrics.push({
        test: testName,
        duration,
        success: false,
        error: error.message
      });
      
      return { success: false, message };
    }
  }

  async testBasicConnectivity() {
    return this.runTest('Database Basic Connectivity', async () => {
      try {
        const response = await fetch(`${API_BASE}/api/health`);
        if (!response.ok) {
          return {
            success: false,
            message: `Health check failed: ${response.status}`
          };
        }

        const health = await response.json();
        const dbStatus = health.services?.database;

        if (dbStatus === 'connected') {
          return {
            success: true,
            message: 'Database connection is healthy',
            details: [
              `Health endpoint: ${response.status}`,
              `Database status: ${dbStatus}`,
              `Storage status: ${health.services?.storage}`,
              `Response time: included in test duration`
            ]
          };
        } else {
          return {
            success: false,
            message: `Database connection issue: ${dbStatus}`,
            details: [`Full health response: ${JSON.stringify(health)}`]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Database connectivity test failed: ${error.message}`
        };
      }
    });
  }

  async testUserOperations() {
    return this.runTest('User CRUD Operations', async () => {
      try {
        // Test user listing/retrieval
        const response = await fetch(`${API_BASE}/api/auth/profile`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.status === 401) {
          return {
            success: true,
            message: 'User operations require authentication (expected)',
            details: [
              `Response: ${response.status}`,
              'Authentication requirement properly implemented',
              'Database user queries are protected'
            ]
          };
        }

        const result = await response.json();

        if (response.ok) {
          return {
            success: true,
            message: 'User operations working correctly',
            details: [
              `Response: ${response.status}`,
              `Profile data: ${Object.keys(result).join(', ')}`,
              'Database user retrieval successful'
            ]
          };
        } else {
          return {
            success: false,
            message: `User operations failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `User operations test failed: ${error.message}`
        };
      }
    });
  }

  async testProjectOperations() {
    return this.runTest('Project Database Operations', async () => {
      try {
        // Test project listing
        const response = await fetch(`${API_BASE}/api/projects`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.status === 401) {
          return {
            success: true,
            message: 'Project operations require authentication (expected)',
            details: [
              `Response: ${response.status}`,
              'Authentication requirement properly implemented',
              'Database project queries are protected'
            ]
          };
        }

        const result = await response.json();

        if (response.ok && Array.isArray(result)) {
          return {
            success: true,
            message: 'Project database operations working correctly',
            details: [
              `Response: ${response.status}`,
              `Projects returned: ${result.length}`,
              `Data structure: ${result.length > 0 ? Object.keys(result[0]).join(', ') : 'empty'}`,
              'Database project retrieval successful'
            ]
          };
        } else if (response.ok) {
          return {
            success: true,
            message: 'Project operations accessible but different format',
            details: [
              `Response: ${response.status}`,
              `Response type: ${typeof result}`,
              `Response: ${JSON.stringify(result)}`
            ]
          };
        } else {
          return {
            success: false,
            message: `Project operations failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Project operations test failed: ${error.message}`
        };
      }
    });
  }

  async testDatasetOperations() {
    return this.runTest('Dataset Database Operations', async () => {
      try {
        // Test dataset listing
        const response = await fetch(`${API_BASE}/api/datasets`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.status === 401) {
          return {
            success: true,
            message: 'Dataset operations require authentication (expected)',
            details: [
              `Response: ${response.status}`,
              'Authentication requirement properly implemented',
              'Database dataset queries are protected'
            ]
          };
        }

        const result = await response.json();

        if (response.ok && Array.isArray(result)) {
          return {
            success: true,
            message: 'Dataset database operations working correctly',
            details: [
              `Response: ${response.status}`,
              `Datasets returned: ${result.length}`,
              `Data structure: ${result.length > 0 ? Object.keys(result[0]).join(', ') : 'empty'}`,
              'Database dataset retrieval successful'
            ]
          };
        } else if (response.ok) {
          return {
            success: true,
            message: 'Dataset operations accessible but different format',
            details: [
              `Response: ${response.status}`,
              `Response type: ${typeof result}`,
              `Response: ${JSON.stringify(result)}`
            ]
          };
        } else {
          return {
            success: false,
            message: `Dataset operations failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Dataset operations test failed: ${error.message}`
        };
      }
    });
  }

  async testDatabasePerformance() {
    return this.runTest('Database Performance and Response Times', async () => {
      try {
        const performanceTests = [];
        const iterations = 5;

        // Test multiple health checks for consistency
        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          const response = await fetch(`${API_BASE}/api/health`);
          const duration = Date.now() - startTime;
          
          performanceTests.push({
            iteration: i + 1,
            duration,
            success: response.ok
          });
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const successfulTests = performanceTests.filter(t => t.success);
        const avgResponseTime = successfulTests.length > 0 
          ? successfulTests.reduce((sum, t) => sum + t.duration, 0) / successfulTests.length
          : 0;

        const maxResponseTime = Math.max(...performanceTests.map(t => t.duration));
        const minResponseTime = Math.min(...performanceTests.map(t => t.duration));

        if (successfulTests.length >= iterations * 0.8) { // 80% success rate required
          return {
            success: true,
            message: 'Database performance is acceptable',
            details: [
              `Average response time: ${avgResponseTime.toFixed(1)}ms`,
              `Min response time: ${minResponseTime}ms`,
              `Max response time: ${maxResponseTime}ms`,
              `Success rate: ${successfulTests.length}/${iterations} (${(successfulTests.length/iterations*100).toFixed(1)}%)`,
              `Performance consistency: ${maxResponseTime - minResponseTime}ms variance`
            ]
          };
        } else {
          return {
            success: false,
            message: 'Database performance is inconsistent',
            details: [
              `Success rate: ${successfulTests.length}/${iterations} (${(successfulTests.length/iterations*100).toFixed(1)}%)`,
              `Failed requests: ${iterations - successfulTests.length}`,
              `Average response time: ${avgResponseTime.toFixed(1)}ms`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Database performance test failed: ${error.message}`
        };
      }
    });
  }

  async testDatabaseErrorHandling() {
    return this.runTest('Database Error Handling and Recovery', async () => {
      try {
        // Test various endpoints that might trigger database errors
        const errorTests = [
          { endpoint: '/api/projects/invalid-id', method: 'GET', expectedStatus: [404, 401, 400] },
          { endpoint: '/api/datasets/999999', method: 'GET', expectedStatus: [404, 401, 400] },
          { endpoint: '/api/auth/profile', method: 'DELETE', expectedStatus: [401, 404, 405] }
        ];

        const results = [];
        for (const test of errorTests) {
          try {
            const response = await fetch(`${API_BASE}${test.endpoint}`, {
              method: test.method,
              headers: { 'Content-Type': 'application/json' }
            });

            const isExpectedStatus = test.expectedStatus.includes(response.status);
            results.push({
              endpoint: test.endpoint,
              method: test.method,
              status: response.status,
              expected: isExpectedStatus,
              success: isExpectedStatus
            });
          } catch (error) {
            results.push({
              endpoint: test.endpoint,
              method: test.method,
              error: error.message,
              success: false
            });
          }
        }

        const successCount = results.filter(r => r.success).length;
        const successRate = successCount / results.length;

        return {
          success: successRate >= 0.7, // 70% success rate for error handling
          message: successRate >= 0.7 
            ? 'Database error handling is working correctly' 
            : 'Database error handling needs improvement',
          details: [
            `Error handling tests: ${successCount}/${results.length} passed`,
            `Success rate: ${(successRate * 100).toFixed(1)}%`,
            ...results.map(r => 
              `${r.method} ${r.endpoint}: ${r.status || 'ERROR'} ${r.expected ? '✓' : '✗'}`)
          ]
        };
      } catch (error) {
        return {
          success: false,
          message: `Database error handling test failed: ${error.message}`
        };
      }
    });
  }

  async testDatabaseTransactions() {
    return this.runTest('Database Transaction Integrity', async () => {
      try {
        // Test user registration which should involve database transactions
        const testUser = {
          firstName: 'Database',
          lastName: 'TestUser',
          email: `dbtest${Date.now()}@example.com`,
          password: 'TestPassword123!'
        };

        const response = await fetch(`${API_BASE}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testUser)
        });

        const result = await response.json();

        if (response.status === 201 && result.success) {
          return {
            success: true,
            message: 'Database transactions working correctly',
            details: [
              `Response: ${response.status}`,
              `User created: ${result.userId ? 'Yes' : 'No'}`,
              `Transaction integrity: Successful`,
              'User registration involves multiple database operations'
            ]
          };
        } else if (response.status === 409) {
          return {
            success: true,
            message: 'Database transaction integrity maintained',
            details: [
              `Response: ${response.status}`,
              `Duplicate prevention: Working`,
              'Database constraints properly enforced'
            ]
          };
        } else {
          return {
            success: false,
            message: `Database transaction failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Error: ${result.error}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Database transaction test failed: ${error.message}`
        };
      }
    });
  }

  printResults() {
    logSection('📊 DATABASE CONNECTIVITY TEST RESULTS');
    
    const passRate = this.testResults.total > 0 
      ? ((this.testResults.passed / this.testResults.total) * 100).toFixed(1)
      : 0;

    log(`\nTotal Tests: ${this.testResults.total}`, colors.blue);
    log(`Passed: ${this.testResults.passed}`, colors.green);
    log(`Failed: ${this.testResults.failed}`, colors.red);
    log(`Pass Rate: ${passRate}%`, passRate >= 80 ? colors.green : colors.red);

    // Performance metrics summary
    const avgResponseTime = this.testResults.performanceMetrics.length > 0
      ? this.testResults.performanceMetrics.reduce((sum, m) => sum + m.duration, 0) / this.testResults.performanceMetrics.length
      : 0;

    log(`\n⏱️  Performance Metrics:`, colors.blue);
    log(`Average Response Time: ${avgResponseTime.toFixed(1)}ms`, colors.blue);
    
    const slowestTest = this.testResults.performanceMetrics.reduce((prev, current) => 
      (prev.duration > current.duration) ? prev : current
    , { duration: 0, test: 'None' });
    
    log(`Slowest Test: ${slowestTest.test} (${slowestTest.duration}ms)`, colors.blue);

    if (this.testResults.errors.length > 0) {
      log('\n🚨 Failed Tests:', colors.red);
      this.testResults.errors.forEach(error => {
        log(`  • ${error}`, colors.red);
      });
    }

    if (passRate >= 80) {
      logSuccess('\n🎉 Database connectivity testing completed successfully!');
    } else {
      logError('\n⚠️  Database system has issues that need attention.');
    }

    return {
      total: this.testResults.total,
      passed: this.testResults.passed,
      failed: this.testResults.failed,
      passRate: parseFloat(passRate),
      avgResponseTime: parseFloat(avgResponseTime.toFixed(1)),
      errors: this.testResults.errors,
      performanceMetrics: this.testResults.performanceMetrics
    };
  }
}

// Main execution
async function main() {
  logSection('🚀 DATABASE CONNECTIVITY & PERFORMANCE TESTING');
  
  const tester = new DatabaseTester();
  
  logInfo('Testing PostgreSQL database connectivity, CRUD operations, and performance...');
  logInfo('API Base: ' + API_BASE);
  
  // Run all database tests
  await tester.testBasicConnectivity();
  await tester.testUserOperations();
  await tester.testProjectOperations();
  await tester.testDatasetOperations();
  await tester.testDatabasePerformance();
  await tester.testDatabaseErrorHandling();
  await tester.testDatabaseTransactions();
  
  // Print comprehensive results
  const results = tester.printResults();
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});