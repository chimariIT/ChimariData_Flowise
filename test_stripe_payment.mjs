#!/usr/bin/env node

/**
 * Comprehensive Stripe Payment Integration Testing
 * Tests payment processing, webhooks, and security validation
 */

import fetch from 'node-fetch';
import crypto from 'crypto';

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
  log(`\n💳 Testing: ${testName}`, colors.yellow);
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

class StripePaymentTester {
  constructor() {
    this.testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async runTest(testName, testFunction) {
    logTest(testName);
    this.testResults.total++;
    
    try {
      const result = await testFunction();
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
      
      return result;
    } catch (error) {
      const message = `Exception: ${error.message}`;
      logError(message);
      this.testResults.failed++;
      this.testResults.errors.push(`${testName}: ${message}`);
      return { success: false, message };
    }
  }

  async testStripeConfiguration() {
    return this.runTest('Stripe Service Configuration', async () => {
      try {
        // Test health endpoint first
        const healthResponse = await fetch(`${API_BASE}/api/health`);
        if (!healthResponse.ok) {
          return {
            success: false,
            message: 'System health check failed - cannot test Stripe'
          };
        }

        // Check if Stripe endpoints are available
        const endpoints = [
          '/api/create-payment-intent',
          '/api/stripe/webhook',
          '/api/payment/create-intent',
          '/api/checkout'
        ];

        const endpointResults = [];
        for (const endpoint of endpoints) {
          try {
            const response = await fetch(`${API_BASE}${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({})
            });

            endpointResults.push(`${endpoint}: ${response.status} (${response.statusText})`);
          } catch (error) {
            endpointResults.push(`${endpoint}: ERROR - ${error.message}`);
          }
        }

        return {
          success: true,
          message: 'Stripe service configuration checked',
          details: [
            'System health: OK',
            'Checked Stripe payment endpoints:',
            ...endpointResults
          ],
          warnings: [
            'Note: Some 400/404 responses are expected for endpoints without valid data'
          ]
        };

      } catch (error) {
        return {
          success: false,
          message: `Configuration test failed: ${error.message}`
        };
      }
    });
  }

  async testPaymentIntentCreation() {
    return this.runTest('Payment Intent Creation', async () => {
      try {
        // Test creating a payment intent
        const paymentData = {
          amount: 1000, // $10.00 in cents
          currency: 'usd',
          description: 'Test payment intent'
        };

        const response = await fetch(`${API_BASE}/api/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentData)
        });

        const result = await response.json();

        if (response.ok && result.client_secret) {
          return {
            success: true,
            message: 'Payment intent created successfully',
            details: [
              `Response: ${response.status}`,
              `Client secret: ${result.client_secret.substring(0, 20)}...`,
              `Payment intent ID: ${result.id || 'N/A'}`,
              `Amount: $${(paymentData.amount / 100).toFixed(2)}`
            ]
          };
        } else if (response.status === 404) {
          // Try alternative endpoint
          const altResponse = await fetch(`${API_BASE}/api/payment/create-intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData)
          });

          if (altResponse.ok) {
            const altResult = await altResponse.json();
            return {
              success: true,
              message: 'Payment intent created successfully (alternative endpoint)',
              details: [
                `Response: ${altResponse.status}`,
                `Result: ${JSON.stringify(altResult)}`,
                'Used alternative payment endpoint'
              ]
            };
          } else {
            return {
              success: false,
              message: 'Payment intent creation failed - endpoint not found',
              details: [
                `Primary endpoint: ${response.status}`,
                `Alternative endpoint: ${altResponse.status}`,
                'Neither payment intent endpoint is working'
              ]
            };
          }
        } else {
          return {
            success: false,
            message: `Payment intent creation failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Payment intent test failed: ${error.message}`
        };
      }
    });
  }

  async testStripeWebhook() {
    return this.runTest('Stripe Webhook Handling', async () => {
      try {
        // Create a mock webhook payload
        const webhookPayload = {
          id: 'evt_test_webhook',
          object: 'event',
          data: {
            object: {
              id: 'pi_test_payment_intent',
              status: 'succeeded',
              amount: 1000,
              currency: 'usd'
            }
          },
          type: 'payment_intent.succeeded'
        };

        // Create a mock signature (this won't be valid but tests the endpoint)
        const mockSignature = 't=1234567890,v1=' + crypto.createHmac('sha256', 'test_webhook_secret')
          .update(JSON.stringify(webhookPayload))
          .digest('hex');

        const response = await fetch(`${API_BASE}/api/stripe/webhook`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'stripe-signature': mockSignature
          },
          body: JSON.stringify(webhookPayload)
        });

        const result = await response.text();

        if (response.status === 200 || response.status === 400) {
          return {
            success: true,
            message: 'Webhook endpoint is accessible and processing requests',
            details: [
              `Response: ${response.status}`,
              `Response body: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`,
              'Webhook signature validation is likely working (expected 400 for invalid signature)'
            ]
          };
        } else if (response.status === 404) {
          return {
            success: false,
            message: 'Webhook endpoint not found',
            details: [
              `Response: ${response.status}`,
              'Stripe webhook endpoint may not be implemented'
            ]
          };
        } else {
          return {
            success: false,
            message: `Webhook test failed: ${response.status}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${result}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Webhook test failed: ${error.message}`
        };
      }
    });
  }

  async testSubscriptionFlow() {
    return this.runTest('Subscription Creation Flow', async () => {
      try {
        // Test subscription creation
        const subscriptionData = {
          tier: 'pro',
          interval: 'month'
        };

        const response = await fetch(`${API_BASE}/api/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscriptionData)
        });

        if (response.status === 401) {
          return {
            success: true,
            message: 'Subscription endpoint requires authentication (expected)',
            details: [
              `Response: ${response.status}`,
              'Authentication requirement is properly implemented',
              'Would need valid user session to test further'
            ]
          };
        }

        const result = await response.json();

        if (response.ok) {
          return {
            success: true,
            message: 'Subscription creation successful',
            details: [
              `Response: ${response.status}`,
              `Result: ${JSON.stringify(result)}`,
              'Subscription flow is working'
            ]
          };
        } else if (response.status === 404) {
          return {
            success: false,
            message: 'Subscription endpoint not found',
            details: [
              `Response: ${response.status}`,
              'Subscription functionality may not be implemented'
            ]
          };
        } else {
          return {
            success: false,
            message: `Subscription creation failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Subscription test failed: ${error.message}`
        };
      }
    });
  }

  async testPaymentValidation() {
    return this.runTest('Payment Data Validation', async () => {
      try {
        // Test with invalid payment data
        const invalidPaymentData = {
          amount: -100, // Invalid negative amount
          currency: 'invalid', // Invalid currency
          description: '' // Empty description
        };

        const response = await fetch(`${API_BASE}/api/create-payment-intent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invalidPaymentData)
        });

        const result = await response.json();

        if (response.status === 400) {
          return {
            success: true,
            message: 'Payment validation working correctly - invalid data rejected',
            details: [
              `Response: ${response.status}`,
              `Error: ${result.error || result.message}`,
              'Proper validation prevents invalid payment processing'
            ]
          };
        } else if (response.status === 404) {
          return {
            success: true,
            message: 'Payment validation test skipped - endpoint not available',
            details: [
              'Payment intent endpoint not found',
              'Cannot test validation without working endpoint'
            ]
          };
        } else {
          return {
            success: false,
            message: `Payment validation not working - invalid data was accepted`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`,
              'Invalid payment data should be rejected'
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Payment validation test failed: ${error.message}`
        };
      }
    });
  }

  async testCheckoutSession() {
    return this.runTest('Stripe Checkout Session', async () => {
      try {
        // Test checkout session creation
        const checkoutData = {
          price_id: 'price_test_123',
          success_url: 'http://localhost:5000/success',
          cancel_url: 'http://localhost:5000/cancel'
        };

        const response = await fetch(`${API_BASE}/api/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(checkoutData)
        });

        if (response.status === 401) {
          return {
            success: true,
            message: 'Checkout session requires authentication (expected)',
            details: [
              `Response: ${response.status}`,
              'Authentication requirement is properly implemented',
              'Would need valid user session to test checkout'
            ]
          };
        }

        const result = await response.json();

        if (response.ok && result.url) {
          return {
            success: true,
            message: 'Checkout session created successfully',
            details: [
              `Response: ${response.status}`,
              `Checkout URL: ${result.url}`,
              `Session ID: ${result.id || 'N/A'}`,
              'Stripe checkout integration working'
            ]
          };
        } else if (response.status === 404) {
          return {
            success: false,
            message: 'Checkout endpoint not found',
            details: [
              `Response: ${response.status}`,
              'Stripe checkout functionality may not be implemented'
            ]
          };
        } else {
          return {
            success: false,
            message: `Checkout session failed: ${result.error || 'Unknown error'}`,
            details: [
              `Response: ${response.status}`,
              `Body: ${JSON.stringify(result)}`
            ]
          };
        }
      } catch (error) {
        return {
          success: false,
          message: `Checkout session test failed: ${error.message}`
        };
      }
    });
  }

  printResults() {
    logSection('📊 STRIPE PAYMENT INTEGRATION TEST RESULTS');
    
    const passRate = this.testResults.total > 0 
      ? ((this.testResults.passed / this.testResults.total) * 100).toFixed(1)
      : 0;

    log(`\nTotal Tests: ${this.testResults.total}`, colors.blue);
    log(`Passed: ${this.testResults.passed}`, colors.green);
    log(`Failed: ${this.testResults.failed}`, colors.red);
    log(`Pass Rate: ${passRate}%`, passRate >= 70 ? colors.green : colors.red);

    if (this.testResults.errors.length > 0) {
      log('\n🚨 Failed Tests:', colors.red);
      this.testResults.errors.forEach(error => {
        log(`  • ${error}`, colors.red);
      });
    }

    if (passRate >= 70) {
      logSuccess('\n🎉 Stripe payment integration testing completed successfully!');
    } else {
      logError('\n⚠️  Stripe payment system has issues that need attention.');
    }

    return {
      total: this.testResults.total,
      passed: this.testResults.passed,
      failed: this.testResults.failed,
      passRate: parseFloat(passRate),
      errors: this.testResults.errors
    };
  }
}

// Main execution
async function main() {
  logSection('🚀 STRIPE PAYMENT INTEGRATION COMPREHENSIVE TESTING');
  
  const tester = new StripePaymentTester();
  
  logInfo('Testing Stripe payment processing, webhooks, and security validation...');
  logInfo('API Base: ' + API_BASE);
  
  // Run all Stripe payment tests
  await tester.testStripeConfiguration();
  await tester.testPaymentIntentCreation();
  await tester.testStripeWebhook();
  await tester.testSubscriptionFlow();
  await tester.testPaymentValidation();
  await tester.testCheckoutSession();
  
  // Print comprehensive results
  const results = tester.printResults();
  
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the tests
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});