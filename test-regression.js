#!/usr/bin/env node

/**
 * ChimariData+AI End-to-End Regression Testing Script
 * Run this script after every change to ensure core functionality works
 */

import fs from 'fs';
import path from 'path';

class RegressionTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testResults = [];
    this.authToken = null;
    this.testUser = {
      username: `test_user_${Date.now()}`,
      password: 'test123456'
    };
  }

  async runAllTests() {
    console.log('🚀 Starting ChimariData+AI Regression Tests...\n');
    
    try {
      // Core Authentication Tests
      await this.testUserRegistration();
      await this.testUserLogin();
      await this.testAuthenticatedRoutes();
      
      // Project Management Tests
      await this.testProjectCreation();
      await this.testProjectRetrieval();
      await this.testDuplicateProjectHandling();
      
      // File Upload Tests
      await this.testFileUpload();
      await this.testFileUploadAuthentication();
      
      // AI Analysis Tests
      await this.testAIInsights();
      await this.testAIChat();
      
      // Navigation Tests
      await this.testLogout();
      await this.testDemoPageLinks();
      await this.testFooterContacts();
      
      // UI Consistency Tests
      await this.testDuplicateHeaders();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      process.exit(1);
    }
  }

  async testUserRegistration() {
    console.log('Testing user registration...');
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        this.authToken = data.token;
        this.addResult('User Registration', 'PASS', 'User registered successfully');
      } else {
        this.addResult('User Registration', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Registration', 'FAIL', error.message);
    }
  }

  async testUserLogin() {
    console.log('Testing user login...');
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.testUser)
      });

      if (response.ok) {
        const data = await response.json();
        this.authToken = data.token;
        this.addResult('User Login', 'PASS', 'Login successful');
      } else {
        this.addResult('User Login', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('User Login', 'FAIL', error.message);
    }
  }

  async testAuthenticatedRoutes() {
    console.log('Testing authenticated routes...');
    try {
      const routes = ['/api/projects', '/api/user/settings'];
      
      for (const route of routes) {
        const response = await fetch(`${this.baseUrl}${route}`, {
          headers: { 'Authorization': `Bearer ${this.authToken}` }
        });
        
        if (response.status === 401) {
          this.addResult(`Auth Route ${route}`, 'FAIL', 'Authentication required but token rejected');
        } else if (response.ok) {
          this.addResult(`Auth Route ${route}`, 'PASS', 'Route accessible with valid token');
        } else {
          this.addResult(`Auth Route ${route}`, 'WARN', `HTTP ${response.status}`);
        }
      }
    } catch (error) {
      this.addResult('Authenticated Routes', 'FAIL', error.message);
    }
  }

  async testProjectCreation() {
    console.log('Testing project creation...');
    try {
      const projectData = {
        name: `Test Project ${Date.now()}`,
        questions: ['What are the main trends?', 'What insights can we derive?']
      };

      const response = await fetch(`${this.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(projectData)
      });

      if (response.ok) {
        const project = await response.json();
        this.testProjectId = project.id;
        this.addResult('Project Creation', 'PASS', 'Project created successfully');
      } else {
        this.addResult('Project Creation', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Project Creation', 'FAIL', error.message);
    }
  }

  async testDuplicateProjectHandling() {
    console.log('Testing duplicate project handling...');
    try {
      const projectData = {
        name: 'Duplicate Test Project',
        questions: ['Test question']
      };

      // Create first project
      const response1 = await fetch(`${this.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(projectData)
      });

      // Try to create duplicate
      const response2 = await fetch(`${this.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(projectData)
      });

      if (response1.ok && response2.status === 409) {
        this.addResult('Duplicate Project Handling', 'PASS', 'Duplicate properly rejected');
      } else if (response1.ok && response2.ok) {
        this.addResult('Duplicate Project Handling', 'FAIL', 'Duplicate project allowed');
      } else {
        this.addResult('Duplicate Project Handling', 'WARN', 'Unexpected response');
      }
    } catch (error) {
      this.addResult('Duplicate Project Handling', 'FAIL', error.message);
    }
  }

  async testProjectRetrieval() {
    console.log('Testing project retrieval...');
    try {
      if (!this.testProjectId) {
        this.addResult('Project Retrieval', 'SKIP', 'No project ID available');
        return;
      }

      const response = await fetch(`${this.baseUrl}/api/projects/${this.testProjectId}`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.ok) {
        this.addResult('Project Retrieval', 'PASS', 'Project retrieved successfully');
      } else if (response.status === 404) {
        this.addResult('Project Retrieval', 'FAIL', 'Project not found error');
      } else {
        this.addResult('Project Retrieval', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Project Retrieval', 'FAIL', error.message);
    }
  }

  async testFileUpload() {
    console.log('Testing file upload...');
    try {
      // Create a test CSV file
      const testCsv = 'name,value,category\nTest1,100,A\nTest2,200,B\nTest3,150,A';
      const formData = new FormData();
      const blob = new Blob([testCsv], { type: 'text/csv' });
      formData.append('file', blob, 'test.csv');
      formData.append('name', 'Test Upload Project');

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` },
        body: formData
      });

      if (response.ok) {
        this.addResult('File Upload', 'PASS', 'File uploaded successfully');
      } else if (response.status === 401) {
        this.addResult('File Upload', 'FAIL', 'Authentication required for upload');
      } else {
        this.addResult('File Upload', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('File Upload', 'FAIL', error.message);
    }
  }

  async testFileUploadAuthentication() {
    console.log('Testing file upload without authentication...');
    try {
      const testCsv = 'name,value\nTest,100';
      const formData = new FormData();
      const blob = new Blob([testCsv], { type: 'text/csv' });
      formData.append('file', blob, 'test.csv');

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (response.status === 401) {
        this.addResult('Upload Auth Check', 'PASS', 'Unauthenticated upload properly rejected');
      } else {
        this.addResult('Upload Auth Check', 'FAIL', 'Unauthenticated upload allowed');
      }
    } catch (error) {
      this.addResult('Upload Auth Check', 'FAIL', error.message);
    }
  }

  async testAIInsights() {
    console.log('Testing AI insights...');
    try {
      if (!this.testProjectId) {
        this.addResult('AI Insights', 'SKIP', 'No project ID available');
        return;
      }

      const response = await fetch(`${this.baseUrl}/api/ai/insights`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ projectId: this.testProjectId })
      });

      if (response.ok) {
        this.addResult('AI Insights', 'PASS', 'AI insights generated');
      } else {
        this.addResult('AI Insights', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('AI Insights', 'FAIL', error.message);
    }
  }

  async testAIChat() {
    console.log('Testing AI chat...');
    try {
      if (!this.testProjectId) {
        this.addResult('AI Chat', 'SKIP', 'No project ID available');
        return;
      }

      const response = await fetch(`${this.baseUrl}/api/ai/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.testProjectId,
          prompt: 'What insights can you provide about this data?',
          provider: 'platform'
        })
      });

      if (response.ok) {
        this.addResult('AI Chat', 'PASS', 'AI chat responding');
      } else {
        this.addResult('AI Chat', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('AI Chat', 'FAIL', error.message);
    }
  }

  async testLogout() {
    console.log('Testing logout...');
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });

      if (response.ok) {
        this.addResult('Logout', 'PASS', 'Logout successful');
      } else {
        this.addResult('Logout', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Logout', 'FAIL', error.message);
    }
  }

  async testDemoPageLinks() {
    console.log('Testing demo page links...');
    try {
      const response = await fetch(`${this.baseUrl}/demo`);
      if (response.ok) {
        this.addResult('Demo Page', 'PASS', 'Demo page accessible');
      } else {
        this.addResult('Demo Page', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Demo Page', 'FAIL', error.message);
    }
  }

  async testFooterContacts() {
    console.log('Testing footer contact information...');
    try {
      const response = await fetch(`${this.baseUrl}/`);
      if (response.ok) {
        const html = await response.text();
        if (html.includes('sales@chimaridata.com')) {
          this.addResult('Footer Contacts', 'PASS', 'Contact email found');
        } else {
          this.addResult('Footer Contacts', 'FAIL', 'Contact email not found');
        }
      } else {
        this.addResult('Footer Contacts', 'FAIL', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.addResult('Footer Contacts', 'FAIL', error.message);
    }
  }

  async testDuplicateHeaders() {
    console.log('Testing for duplicate headers...');
    try {
      const response = await fetch(`${this.baseUrl}/demo`);
      if (response.ok) {
        const html = await response.text();
        const chimariMatches = html.match(/ChimariData/g);
        if (chimariMatches && chimariMatches.length > 2) {
          this.addResult('Duplicate Headers', 'FAIL', `Found ${chimariMatches.length} ChimariData references`);
        } else {
          this.addResult('Duplicate Headers', 'PASS', 'No duplicate headers detected');
        }
      }
    } catch (error) {
      this.addResult('Duplicate Headers', 'FAIL', error.message);
    }
  }

  addResult(testName, status, message) {
    this.testResults.push({ testName, status, message, timestamp: new Date().toISOString() });
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : '⏭️';
    console.log(`${icon} ${testName}: ${message}`);
  }

  generateReport() {
    console.log('\n📊 Test Results Summary:');
    console.log('========================');
    
    const counts = this.testResults.reduce((acc, result) => {
      acc[result.status] = (acc[result.status] || 0) + 1;
      return acc;
    }, {});

    console.log(`✅ Passed: ${counts.PASS || 0}`);
    console.log(`❌ Failed: ${counts.FAIL || 0}`);
    console.log(`⚠️ Warnings: ${counts.WARN || 0}`);
    console.log(`⏭️ Skipped: ${counts.SKIP || 0}`);
    console.log(`📊 Total: ${this.testResults.length}`);

    // Write detailed report
    const reportPath = path.join(__dirname, 'test-results.json');
    fs.writeFileSync(reportPath, JSON.stringify({
      summary: counts,
      timestamp: new Date().toISOString(),
      results: this.testResults
    }, null, 2));

    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    if (counts.FAIL > 0) {
      console.log('\n❌ CRITICAL ISSUES FOUND - Please fix before deployment!');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed! Ready for deployment.');
    }
  }
}

// Add fetch polyfill for Node.js environments
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
  global.FormData = require('form-data');
  global.Blob = require('blob-polyfill').Blob;
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new RegressionTester();
  tester.runAllTests().catch(console.error);
}

module.exports = RegressionTester;