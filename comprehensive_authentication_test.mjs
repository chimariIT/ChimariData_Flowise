#!/usr/bin/env node

/**
 * Comprehensive Authentication System Test
 * Tests all authentication flows after critical fixes
 */

import fetch from 'node-fetch';
import { randomBytes } from 'crypto';

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

class AuthenticationTester {
  constructor() {
    this.testResults = {
      registration: [],
      login: [],
      passwordReset: [],
      sessionManagement: [],
      socialAuth: [],
      security: []
    };
    this.testUser = null;
    this.authToken = null;
  }

  async runComprehensiveTest() {
    console.log('🔍 Starting Comprehensive Authentication Test Suite...\n');
    
    try {
      await this.testUserRegistration();
      await this.testUserLogin(); 
      await this.testSessionManagement();
      await this.testPasswordReset();
      await this.testSocialAuthEndpoints();
      await this.testSecurityMeasures();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async testUserRegistration() {
    console.log('📝 Testing User Registration...');
    
    const testEmail = `test_${randomBytes(8).toString('hex')}@example.com`;
    const testPassword = 'SecurePass123!';
    
    // Test successful registration
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Test User',
          acceptedTerms: true
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.registration.push({
          test: 'Valid Registration',
          status: '✅ PASS',
          details: 'User registered successfully'
        });
        this.testUser = { email: testEmail, password: testPassword, id: data.user?.id };
      } else {
        this.testResults.registration.push({
          test: 'Valid Registration',
          status: '❌ FAIL',
          details: data.message || 'Registration failed unexpectedly'
        });
      }
    } catch (error) {
      this.testResults.registration.push({
        test: 'Valid Registration',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test duplicate email registration
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Duplicate User',
          acceptedTerms: true
        })
      });

      const data = await response.json();
      
      if (!response.ok && data.message?.includes('already exists')) {
        this.testResults.registration.push({
          test: 'Duplicate Email Prevention',
          status: '✅ PASS',
          details: 'Correctly prevented duplicate registration'
        });
      } else {
        this.testResults.registration.push({
          test: 'Duplicate Email Prevention',
          status: '❌ FAIL',
          details: 'Should have rejected duplicate email'
        });
      }
    } catch (error) {
      this.testResults.registration.push({
        test: 'Duplicate Email Prevention',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test invalid email format
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: testPassword,
          name: 'Invalid User',
          acceptedTerms: true
        })
      });

      if (!response.ok) {
        this.testResults.registration.push({
          test: 'Invalid Email Validation',
          status: '✅ PASS',
          details: 'Correctly rejected invalid email format'
        });
      } else {
        this.testResults.registration.push({
          test: 'Invalid Email Validation',
          status: '❌ FAIL',
          details: 'Should have rejected invalid email format'
        });
      }
    } catch (error) {
      this.testResults.registration.push({
        test: 'Invalid Email Validation',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testUserLogin() {
    console.log('🔑 Testing User Login...');
    
    if (!this.testUser) {
      this.testResults.login.push({
        test: 'Login Test',
        status: '⏭️ SKIP',
        details: 'No test user available from registration'
      });
      return;
    }

    // Test valid login
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.testUser.email,
          password: this.testUser.password
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success && data.user) {
        this.testResults.login.push({
          test: 'Valid Login',
          status: '✅ PASS',
          details: 'User logged in successfully with token'
        });
        this.authToken = data.token;
      } else {
        this.testResults.login.push({
          test: 'Valid Login',
          status: '❌ FAIL',
          details: data.message || 'Login failed unexpectedly'
        });
      }
    } catch (error) {
      this.testResults.login.push({
        test: 'Valid Login',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test invalid password
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.testUser.email,
          password: 'wrongpassword'
        })
      });

      const data = await response.json();
      
      if (!response.ok && data.message?.includes('Invalid')) {
        this.testResults.login.push({
          test: 'Invalid Password Rejection',
          status: '✅ PASS',
          details: 'Correctly rejected invalid password'
        });
      } else {
        this.testResults.login.push({
          test: 'Invalid Password Rejection',
          status: '❌ FAIL',
          details: 'Should have rejected invalid password'
        });
      }
    } catch (error) {
      this.testResults.login.push({
        test: 'Invalid Password Rejection',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test non-existent user
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'anypassword'
        })
      });

      if (!response.ok) {
        this.testResults.login.push({
          test: 'Non-existent User Rejection',
          status: '✅ PASS',
          details: 'Correctly rejected non-existent user'
        });
      } else {
        this.testResults.login.push({
          test: 'Non-existent User Rejection',
          status: '❌ FAIL',
          details: 'Should have rejected non-existent user'
        });
      }
    } catch (error) {
      this.testResults.login.push({
        test: 'Non-existent User Rejection',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testSessionManagement() {
    console.log('🔐 Testing Session Management...');
    
    // Test authenticated request
    if (this.authToken) {
      try {
        const response = await fetch(`${API_URL}/user/me`, {
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          }
        });

        const data = await response.json();
        
        if (response.ok && data.user) {
          this.testResults.sessionManagement.push({
            test: 'Authenticated Request',
            status: '✅ PASS',
            details: 'Successfully retrieved user data with valid token'
          });
        } else {
          this.testResults.sessionManagement.push({
            test: 'Authenticated Request',
            status: '❌ FAIL',
            details: 'Failed to retrieve user data with valid token'
          });
        }
      } catch (error) {
        this.testResults.sessionManagement.push({
          test: 'Authenticated Request',
          status: '❌ ERROR',
          details: error.message
        });
      }
    }

    // Test unauthenticated request
    try {
      const response = await fetch(`${API_URL}/user/me`, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.status === 401) {
        this.testResults.sessionManagement.push({
          test: 'Unauthenticated Request Rejection',
          status: '✅ PASS',
          details: 'Correctly rejected request without token'
        });
      } else {
        this.testResults.sessionManagement.push({
          test: 'Unauthenticated Request Rejection',
          status: '❌ FAIL',
          details: 'Should have rejected request without token'
        });
      }
    } catch (error) {
      this.testResults.sessionManagement.push({
        test: 'Unauthenticated Request Rejection',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test invalid token
    try {
      const response = await fetch(`${API_URL}/user/me`, {
        headers: {
          'Authorization': 'Bearer invalid_token_here',
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 401) {
        this.testResults.sessionManagement.push({
          test: 'Invalid Token Rejection',
          status: '✅ PASS',
          details: 'Correctly rejected invalid token'
        });
      } else {
        this.testResults.sessionManagement.push({
          test: 'Invalid Token Rejection',
          status: '❌ FAIL',
          details: 'Should have rejected invalid token'
        });
      }
    } catch (error) {
      this.testResults.sessionManagement.push({
        test: 'Invalid Token Rejection',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testPasswordReset() {
    console.log('🔄 Testing Password Reset...');
    
    if (!this.testUser) {
      this.testResults.passwordReset.push({
        test: 'Password Reset',
        status: '⏭️ SKIP',
        details: 'No test user available'
      });
      return;
    }

    // Test password reset request
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: this.testUser.email
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        this.testResults.passwordReset.push({
          test: 'Password Reset Request',
          status: '✅ PASS',
          details: 'Password reset request processed successfully'
        });
      } else {
        this.testResults.passwordReset.push({
          test: 'Password Reset Request',
          status: '❌ FAIL',
          details: data.message || 'Password reset request failed'
        });
      }
    } catch (error) {
      this.testResults.passwordReset.push({
        test: 'Password Reset Request',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test invalid email for password reset
    try {
      const response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com'
        })
      });

      // Should still return success for security (don't reveal if email exists)
      if (response.ok) {
        this.testResults.passwordReset.push({
          test: 'Password Reset Security',
          status: '✅ PASS',
          details: 'Does not reveal if email exists (security best practice)'
        });
      } else {
        this.testResults.passwordReset.push({
          test: 'Password Reset Security',
          status: '❌ FAIL',
          details: 'Should not reveal if email exists or not'
        });
      }
    } catch (error) {
      this.testResults.passwordReset.push({
        test: 'Password Reset Security',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testSocialAuthEndpoints() {
    console.log('📱 Testing Social Authentication Endpoints...');
    
    // Test Google OAuth endpoint
    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response.status === 302 || response.status === 301) {
        this.testResults.socialAuth.push({
          test: 'Google OAuth Endpoint',
          status: '✅ PASS',
          details: 'Google OAuth endpoint redirects properly'
        });
      } else if (response.status === 404) {
        this.testResults.socialAuth.push({
          test: 'Google OAuth Endpoint',
          status: '⚠️ NOT_CONFIGURED',
          details: 'Google OAuth endpoint not configured'
        });
      } else {
        this.testResults.socialAuth.push({
          test: 'Google OAuth Endpoint',
          status: '❌ FAIL',
          details: `Unexpected response status: ${response.status}`
        });
      }
    } catch (error) {
      this.testResults.socialAuth.push({
        test: 'Google OAuth Endpoint',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test Apple OAuth endpoint
    try {
      const response = await fetch(`${API_URL}/auth/apple`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response.status === 302 || response.status === 301) {
        this.testResults.socialAuth.push({
          test: 'Apple OAuth Endpoint',
          status: '✅ PASS',
          details: 'Apple OAuth endpoint redirects properly'
        });
      } else if (response.status === 404) {
        this.testResults.socialAuth.push({
          test: 'Apple OAuth Endpoint',
          status: '⚠️ NOT_CONFIGURED',
          details: 'Apple OAuth endpoint not configured'
        });
      } else {
        this.testResults.socialAuth.push({
          test: 'Apple OAuth Endpoint',
          status: '❌ FAIL',
          details: `Unexpected response status: ${response.status}`
        });
      }
    } catch (error) {
      this.testResults.socialAuth.push({
        test: 'Apple OAuth Endpoint',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test Microsoft OAuth endpoint
    try {
      const response = await fetch(`${API_URL}/auth/microsoft`, {
        method: 'GET',
        redirect: 'manual'
      });

      if (response.status === 302 || response.status === 301) {
        this.testResults.socialAuth.push({
          test: 'Microsoft OAuth Endpoint',
          status: '✅ PASS',
          details: 'Microsoft OAuth endpoint redirects properly'
        });
      } else if (response.status === 404) {
        this.testResults.socialAuth.push({
          test: 'Microsoft OAuth Endpoint',
          status: '⚠️ NOT_CONFIGURED',
          details: 'Microsoft OAuth endpoint not configured'
        });
      } else {
        this.testResults.socialAuth.push({
          test: 'Microsoft OAuth Endpoint',
          status: '❌ FAIL',
          details: `Unexpected response status: ${response.status}`
        });
      }
    } catch (error) {
      this.testResults.socialAuth.push({
        test: 'Microsoft OAuth Endpoint',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testSecurityMeasures() {
    console.log('🛡️ Testing Security Measures...');
    
    // Test SQL injection attempt
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: "admin'; DROP TABLE users; --",
          password: 'anything'
        })
      });

      if (!response.ok) {
        this.testResults.security.push({
          test: 'SQL Injection Protection',
          status: '✅ PASS',
          details: 'SQL injection attempt was blocked'
        });
      } else {
        this.testResults.security.push({
          test: 'SQL Injection Protection',
          status: '❌ FAIL',
          details: 'SQL injection attempt was not properly blocked'
        });
      }
    } catch (error) {
      this.testResults.security.push({
        test: 'SQL Injection Protection',
        status: '❌ ERROR',
        details: error.message
      });
    }

    // Test XSS prevention
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'xss@test.com',
          password: 'Password123!',
          name: '<script>alert("XSS")</script>',
          acceptedTerms: true
        })
      });

      // Check if response contains raw script tags
      const text = await response.text();
      if (!text.includes('<script>') && !text.includes('alert("XSS")')) {
        this.testResults.security.push({
          test: 'XSS Prevention',
          status: '✅ PASS',
          details: 'XSS attempt was properly sanitized'
        });
      } else {
        this.testResults.security.push({
          test: 'XSS Prevention',
          status: '❌ FAIL',
          details: 'XSS attempt was not properly sanitized'
        });
      }
    } catch (error) {
      this.testResults.security.push({
        test: 'XSS Prevention',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async generateReport() {
    console.log('\n📊 COMPREHENSIVE AUTHENTICATION TEST RESULTS');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let errorTests = 0;
    let skippedTests = 0;
    let notConfiguredTests = 0;
    
    for (const [category, tests] of Object.entries(this.testResults)) {
      console.log(`\n${category.toUpperCase()} TESTS:`);
      console.log('-'.repeat(40));
      
      if (tests.length === 0) {
        console.log('No tests in this category');
        continue;
      }
      
      for (const test of tests) {
        console.log(`${test.status} ${test.test}`);
        console.log(`   ${test.details}\n`);
        
        totalTests++;
        if (test.status.includes('PASS')) passedTests++;
        else if (test.status.includes('FAIL')) failedTests++;
        else if (test.status.includes('ERROR')) errorTests++;
        else if (test.status.includes('SKIP')) skippedTests++;
        else if (test.status.includes('NOT_CONFIGURED')) notConfiguredTests++;
      }
    }
    
    console.log('\n📈 TEST SUMMARY');
    console.log('=' .repeat(40));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`💥 Errors: ${errorTests}`);
    console.log(`⏭️ Skipped: ${skippedTests}`);
    console.log(`⚠️ Not Configured: ${notConfiguredTests}`);
    
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (failedTests > 0 || errorTests > 0) {
      console.log('\n⚠️  CRITICAL ISSUES FOUND - Review failed tests above');
    } else {
      console.log('\n✅ ALL AUTHENTICATION TESTS PASSED SUCCESSFULLY');
    }
    
    // Save results to file for later analysis
    try {
      const fs = await import('fs/promises');
      const reportData = {
        timestamp: new Date().toISOString(),
        summary: { totalTests, passedTests, failedTests, errorTests, skippedTests, notConfiguredTests, successRate },
        results: this.testResults
      };
      
      await fs.writeFile('authentication_test_results.json', JSON.stringify(reportData, null, 2));
      console.log('\n📄 Detailed results saved to: authentication_test_results.json');
    } catch (e) {
      console.log('\n⚠️ Could not save results to file');
    }
  }
}

// Run the test suite
const tester = new AuthenticationTester();
await tester.runComprehensiveTest();