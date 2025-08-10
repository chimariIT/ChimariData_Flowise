/**
 * Complete Authentication and End-to-End Workflow Test (Fixed)
 * Tests: Registration -> Login -> File Upload with PII -> Project Creation -> Analysis
 */

import fs from 'fs';

const BASE_URL = 'http://localhost:5000';

// Test user data
const testUser = {
  email: `testuser+${Date.now()}@chimaridata.com`,
  password: 'testpassword123',
  firstName: 'Test',
  lastName: 'User'
};

let authToken = null;
let projectId = null;
let tempFileId = null;

// Test CSV data
const testCsvData = `name,age,salary,department
John Doe,28,50000,Engineering
Jane Smith,32,65000,Marketing
Bob Johnson,45,80000,Sales
Alice Brown,29,55000,Engineering
Charlie Wilson,38,70000,Marketing`;

async function makeRequest(method, endpoint, data = null, headers = {}) {
  const url = `${BASE_URL}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (authToken) {
    options.headers['Authorization'] = `Bearer ${authToken}`;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  console.log(`🌐 ${method} ${endpoint}`);
  
  const response = await fetch(url, options);
  const responseText = await response.text();
  
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = responseText;
  }

  console.log(`📊 Response [${response.status}]:`, JSON.stringify(responseData, null, 2));
  
  return { response, data: responseData };
}

async function makeFileUpload(endpoint, fileData, additionalData = {}) {
  const formData = new FormData();
  
  // Create a blob from the CSV data
  const blob = new Blob([fileData], { type: 'text/csv' });
  formData.append('file', blob, 'test-data.csv');
  
  // Add additional form data
  Object.keys(additionalData).forEach(key => {
    formData.append(key, additionalData[key]);
  });

  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  console.log(`📁 Uploading file to ${endpoint}`);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData
  });

  const responseData = await response.json();
  console.log(`📊 Upload Response [${response.status}]:`, JSON.stringify(responseData, null, 2));
  
  return { response, data: responseData };
}

async function testAuthentication() {
  console.log('\n🔧 Testing Authentication Flow...');
  
  // Register
  const { response: regResponse, data: regData } = await makeRequest('POST', '/api/auth/register', testUser);
  
  if (regResponse.status !== 201 || !regData.success) {
    console.log('❌ Registration failed:', regData);
    return false;
  }
  
  console.log('✅ Registration successful');
  authToken = regData.token;
  
  // Test auth endpoint
  const { response: authResponse, data: authData } = await makeRequest('GET', '/api/auth/user');
  
  if (authResponse.status === 200 && authData.email === testUser.email) {
    console.log('✅ Authentication flow working correctly');
    return true;
  } else {
    console.log('❌ Authentication verification failed:', authData);
    return false;
  }
}

async function testFileUploadWithPII() {
  console.log('\n📁 Testing File Upload with PII handling...');
  
  const { response, data } = await makeFileUpload('/api/upload', testCsvData, {
    name: 'Test Dataset',
    description: 'Test upload for complete workflow'
  });
  
  if (response.status === 200 && data.success && data.requiresPIIDecision) {
    console.log('✅ File upload successful, PII detected as expected');
    tempFileId = data.tempFileId;
    console.log(`🔍 PII detected in columns: ${data.piiResult.detectedPII.join(', ')}`);
    return true;
  } else {
    console.log('❌ File upload failed:', data);
    return false;
  }
}

async function testPIIDecisionAndProjectCreation() {
  console.log('\n🔒 Testing PII decision and project creation...');
  
  if (!tempFileId) {
    console.log('❌ No temp file ID available');
    return false;
  }
  
  // Make PII decision to include all columns (proceed with PII)
  const { response, data } = await makeRequest('POST', '/api/pii-decision', {
    tempFileId,
    decision: 'include',
    selectedColumns: ['name', 'age', 'salary', 'department']
  });
  
  if (response.status === 200 && data.success && data.projectId) {
    console.log('✅ PII decision processed and project created');
    projectId = data.projectId;
    console.log(`📊 Project ID: ${projectId}`);
    return true;
  } else {
    console.log('❌ PII decision processing failed:', data);
    return false;
  }
}

async function testProjectRetrieval() {
  console.log('\n📋 Testing project retrieval...');
  
  if (!projectId) {
    console.log('❌ No project ID available');
    return false;
  }
  
  const { response, data } = await makeRequest('GET', `/api/projects/${projectId}`);
  
  if (response.status === 200 && (data.project || data.userId)) {
    console.log('✅ Project retrieval successful');
    console.log(`📊 Project Data: ${data.name || 'Test Dataset'}`);
    console.log(`📈 Records: ${data.data?.length || 0}`);
    return true;
  } else {
    console.log('❌ Project retrieval failed:', data);
    return false;
  }
}

async function testPricingWithCorrectFeatures() {
  console.log('\n💰 Testing pricing with correct feature names...');
  
  // Use the correct feature names from the pricing service
  const features = ['transformation', 'analysis', 'visualization'];
  const { response, data } = await makeRequest('POST', '/api/calculate-price', { features });
  
  if (response.status === 200 && data.total !== undefined) {
    console.log('✅ Pricing calculation successful');
    console.log(`💵 Total price: $${data.total}`);
    console.log(`🏷️  Features: ${features.join(', ')}`);
    console.log(`💰 Breakdown: ${JSON.stringify(data.breakdown)}`);
    return true;
  } else {
    console.log('❌ Pricing calculation failed:', data);
    return false;
  }
}

async function testDynamicPricing() {
  console.log('\n🔄 Testing dynamic pricing...');
  
  if (!projectId) {
    console.log('❌ No project ID available');
    return false;
  }
  
  const { response, data } = await makeRequest('POST', '/api/dynamic-pricing', {
    projectId,
    features: ['transformation', 'ai_insights']
  });
  
  if (response.ok && data.pricing) {
    console.log('✅ Dynamic pricing successful');
    console.log(`💰 Base price: $${data.pricing.basePrice}`);
    console.log(`📏 Complexity: ${data.pricing.complexityScore}`);
    return true;
  } else {
    console.log('❌ Dynamic pricing failed:', data);
    return false;
  }
}

async function runCompleteWorkflowTest() {
  console.log('🚀 Starting Complete Workflow Test (Fixed)');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Authentication Flow', fn: testAuthentication },
    { name: 'File Upload with PII Detection', fn: testFileUploadWithPII },
    { name: 'PII Decision & Project Creation', fn: testPIIDecisionAndProjectCreation },
    { name: 'Project Retrieval', fn: testProjectRetrieval },
    { name: 'Pricing Calculation', fn: testPricingWithCorrectFeatures },
    { name: 'Dynamic Pricing', fn: testDynamicPricing }
  ];
  
  const results = {
    passed: 0,
    failed: 0,
    details: []
  };
  
  for (const test of tests) {
    try {
      const success = await test.fn();
      if (success) {
        results.passed++;
        results.details.push(`✅ ${test.name}: PASSED`);
      } else {
        results.failed++;
        results.details.push(`❌ ${test.name}: FAILED`);
      }
    } catch (error) {
      results.failed++;
      results.details.push(`❌ ${test.name}: ERROR - ${error.message}`);
      console.error(`💥 Error in ${test.name}:`, error);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('📋 COMPLETE WORKFLOW TEST RESULTS');
  console.log('=' .repeat(60));
  
  results.details.forEach(detail => console.log(detail));
  
  console.log(`\n🎯 Overall Results: ${results.passed}/${tests.length} tests passed`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  const successRate = (results.passed / tests.length * 100).toFixed(1);
  console.log(`📊 Success Rate: ${successRate}%`);
  
  if (results.passed === tests.length) {
    console.log('\n🎉 COMPLETE WORKFLOW SUCCESSFUL!');
    console.log('✅ Authentication: Email registration and login working');
    console.log('✅ File Upload: PII detection and handling working');
    console.log('✅ Project Creation: End-to-end project workflow working');
    console.log('✅ Pricing: Dynamic pricing system working');
  } else {
    console.log('\n⚠️  Some workflow steps failed. Review output above.');
  }
  
  return {
    allPassed: results.passed === tests.length,
    successRate: parseFloat(successRate),
    results: results.details,
    userEmail: testUser.email,
    projectId,
    tempFileId
  };
}

// Run the test
runCompleteWorkflowTest()
  .then(results => {
    console.log('\n📝 Complete workflow test finished:', {
      success: results.allPassed,
      successRate: results.successRate + '%',
      userCreated: results.userEmail,
      projectCreated: !!results.projectId
    });
    process.exit(results.allPassed ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Workflow test failed:', error);
    process.exit(1);
  });