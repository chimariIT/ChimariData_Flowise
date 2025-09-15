#!/usr/bin/env node

import fs from 'fs/promises';
import fetch from 'node-fetch';
import FormData from 'form-data';

console.log('🔌 Testing Data Processing API Endpoints');
console.log('==========================================\n');

const BASE_URL = 'http://localhost:5000';
const testResults = {
  apiTests: {},
  errors: []
};

// Test authentication token - using dev user for testing
const AUTH_TOKEN = 'dev-test-token';

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    ...options.headers
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type');
    let data;
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
      headers: response.headers
    };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      error: error.message
    };
  }
}

async function testTrialUpload() {
  console.log('📤 Testing Trial Upload Endpoint');
  console.log('---------------------------------');

  const testFile = 'test_files/test_dataset_basic.csv';
  
  try {
    const fileBuffer = await fs.readFile(testFile);
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'test_dataset_basic.csv',
      contentType: 'text/csv'
    });

    console.log(`🔍 Testing: POST /api/trial-upload`);
    console.log(`   File: ${testFile} (${fileBuffer.length} bytes)`);

    const response = await makeRequest('/api/trial-upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      console.log(`   ✅ Upload successful`);
      console.log(`   📊 Response keys: ${Object.keys(response.data).join(', ')}`);
      
      testResults.apiTests['trial-upload'] = {
        success: true,
        status: response.status,
        responseKeys: Object.keys(response.data)
      };
    } else {
      console.log(`   ❌ Upload failed: ${response.data.error || response.data}`);
      testResults.errors.push({
        test: 'trial-upload',
        error: response.data.error || 'Upload failed'
      });
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'trial-upload',
      error: error.message
    });
  }
}

async function testMainUpload() {
  console.log('\n📤 Testing Main Upload Endpoint');
  console.log('--------------------------------');

  const testFile = 'test_files/test_dataset_pii.csv';
  
  try {
    const fileBuffer = await fs.readFile(testFile);
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'test_dataset_pii.csv',
      contentType: 'text/csv'
    });
    form.append('name', 'PII Test Dataset');
    form.append('questions', JSON.stringify(['What are the main demographic patterns?']));

    console.log(`🔍 Testing: POST /api/upload`);
    console.log(`   File: ${testFile} (${fileBuffer.length} bytes)`);

    const response = await makeRequest('/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      console.log(`   ✅ Upload successful`);
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2).substring(0, 200)}...`);
      
      // Check if PII was detected
      if (response.data.requiresPIIDecision) {
        console.log(`   🔒 PII detected - decision required`);
      }
      
      testResults.apiTests['main-upload'] = {
        success: true,
        status: response.status,
        piiDetected: response.data.requiresPIIDecision || false,
        tempFileId: response.data.tempFileId
      };

      return response.data; // Return for further testing
    } else {
      console.log(`   ❌ Upload failed: ${response.data.error || response.data}`);
      testResults.errors.push({
        test: 'main-upload',
        error: response.data.error || 'Upload failed'
      });
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'main-upload',
      error: error.message
    });
  }

  return null;
}

async function testPIIDecision(uploadResult) {
  if (!uploadResult || !uploadResult.requiresPIIDecision || !uploadResult.tempFileId) {
    console.log('\n🔒 Skipping PII Decision Test (no PII detected or missing tempFileId)');
    return null;
  }

  console.log('\n🔒 Testing PII Decision Endpoint');
  console.log('--------------------------------');

  try {
    console.log(`🔍 Testing: POST /api/pii-decision`);
    console.log(`   Temp File ID: ${uploadResult.tempFileId}`);

    const requestBody = {
      tempFileId: uploadResult.tempFileId,
      piiHandled: true,
      anonymizationApplied: false,
      selectedColumns: [], // Accept PII without anonymization
      projectName: 'PII Test Project'
    };

    const response = await makeRequest('/api/pii-decision', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      console.log(`   ✅ PII decision processed`);
      console.log(`   📋 Project ID: ${response.data.projectId || 'Not provided'}`);
      
      testResults.apiTests['pii-decision'] = {
        success: true,
        status: response.status,
        projectId: response.data.projectId
      };

      return response.data;
    } else {
      console.log(`   ❌ PII decision failed: ${response.data.error || response.data}`);
      testResults.errors.push({
        test: 'pii-decision',
        error: response.data.error || 'PII decision failed'
      });
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'pii-decision',
      error: error.message
    });
  }

  return null;
}

async function testGetProjects() {
  console.log('\n📋 Testing Get Projects Endpoint');
  console.log('----------------------------------');

  try {
    console.log(`🔍 Testing: GET /api/projects`);

    const response = await makeRequest('/api/projects', {
      method: 'GET'
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      const projects = Array.isArray(response.data) ? response.data : [];
      console.log(`   ✅ Retrieved ${projects.length} projects`);
      
      if (projects.length > 0) {
        console.log(`   📋 Sample project: ${projects[0].name || 'Unnamed'} (ID: ${projects[0].id})`);
      }
      
      testResults.apiTests['get-projects'] = {
        success: true,
        status: response.status,
        projectCount: projects.length
      };

      return projects;
    } else {
      console.log(`   ❌ Get projects failed: ${response.data.error || response.data}`);
      testResults.errors.push({
        test: 'get-projects',
        error: response.data.error || 'Get projects failed'
      });
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'get-projects',
      error: error.message
    });
  }

  return [];
}

async function testProjectUpload() {
  console.log('\n📤 Testing Project Upload Endpoint');
  console.log('-----------------------------------');

  const testFile = 'test_files/test_dataset.json';
  
  try {
    const fileBuffer = await fs.readFile(testFile);
    const form = new FormData();
    form.append('file', fileBuffer, {
      filename: 'test_dataset.json',
      contentType: 'application/json'
    });
    form.append('name', 'JSON Test Dataset');

    console.log(`🔍 Testing: POST /api/projects/upload`);
    console.log(`   File: ${testFile} (${fileBuffer.length} bytes)`);

    const response = await makeRequest('/api/projects/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      console.log(`   ✅ Project upload successful`);
      console.log(`   📋 Project ID: ${response.data.projectId || response.data.id || 'Not provided'}`);
      
      testResults.apiTests['project-upload'] = {
        success: true,
        status: response.status,
        projectId: response.data.projectId || response.data.id
      };

      return response.data;
    } else {
      console.log(`   ❌ Project upload failed: ${response.data.error || response.data}`);
      testResults.errors.push({
        test: 'project-upload',
        error: response.data.error || 'Project upload failed'
      });
    }

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'project-upload',
      error: error.message
    });
  }

  return null;
}

async function testHealthCheck() {
  console.log('\n🏥 Testing API Health');
  console.log('---------------------');

  try {
    console.log(`🔍 Testing: GET /api/pricing (health check)`);

    const response = await makeRequest('/api/pricing', {
      method: 'GET'
    });

    console.log(`   Status: ${response.status} ${response.ok ? '✅' : '❌'}`);
    
    if (response.ok) {
      console.log(`   ✅ API is responding`);
      testResults.apiTests['health-check'] = {
        success: true,
        status: response.status
      };
    } else {
      console.log(`   ⚠️  API responded with error: ${response.status}`);
      testResults.apiTests['health-check'] = {
        success: false,
        status: response.status
      };
    }

  } catch (error) {
    console.error(`   ❌ API not responding: ${error.message}`);
    testResults.errors.push({
      test: 'health-check',
      error: error.message
    });
  }
}

function printApiSummary() {
  console.log('\n\n📊 API TEST SUMMARY');
  console.log('===================');

  const totalTests = Object.keys(testResults.apiTests).length;
  const successfulTests = Object.values(testResults.apiTests).filter(test => test.success).length;

  console.log(`\n✅ Tests Completed: ${totalTests}`);
  console.log(`📈 Success Rate: ${totalTests > 0 ? Math.round((successfulTests / totalTests) * 100) : 0}% (${successfulTests}/${totalTests})`);

  console.log('\n📋 Test Results:');
  Object.entries(testResults.apiTests).forEach(([testName, result]) => {
    const status = result.success ? '✅' : '❌';
    console.log(`   ${status} ${testName}: HTTP ${result.status}`);
  });

  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(error => {
      console.log(`   ${error.test}: ${error.error}`);
    });
  }

  console.log(`\n📈 Overall Status: ${testResults.errors.length === 0 ? '✅ All API tests passed' : '⚠️  Some API tests failed'}`);
}

// Run all API tests
async function runApiTests() {
  try {
    // Test basic connectivity first
    await testHealthCheck();

    // Test file uploads
    await testTrialUpload();
    
    // Test main upload with PII detection
    const uploadResult = await testMainUpload();
    
    // Test PII decision if PII was detected
    await testPIIDecision(uploadResult);
    
    // Test project operations
    await testGetProjects();
    await testProjectUpload();

    printApiSummary();

    // Save results to file
    await fs.writeFile('api_test_results.json', JSON.stringify(testResults, null, 2));
    console.log('\n💾 API test results saved to api_test_results.json');

  } catch (error) {
    console.error('🚨 API test suite failed:', error);
    process.exit(1);
  }
}

runApiTests();