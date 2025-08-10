/**
 * Complete Authentication and End-to-End Workflow Test
 * Tests: Registration -> Login -> Project Creation -> File Upload -> Analysis
 */

import fs from 'fs';
import path from 'path';

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

  console.log(`📊 Response [${response.status}]:`, responseData);
  
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
  console.log(`📊 Upload Response [${response.status}]:`, responseData);
  
  return { response, data: responseData };
}

async function testRegistration() {
  console.log('\n🔧 Testing User Registration...');
  
  const { response, data } = await makeRequest('POST', '/api/auth/register', testUser);
  
  if (response.status === 201 && data.success) {
    console.log('✅ Registration successful');
    authToken = data.token;
    console.log(`🔑 Auth token received: ${authToken.substring(0, 20)}...`);
    return true;
  } else {
    console.log('❌ Registration failed:', data);
    return false;
  }
}

async function testLogin() {
  console.log('\n🔑 Testing User Login...');
  
  const { response, data } = await makeRequest('POST', '/api/auth/login', {
    email: testUser.email,
    password: testUser.password
  });
  
  if (response.status === 200 && data.success) {
    console.log('✅ Login successful');
    authToken = data.token;
    console.log(`🔑 New auth token: ${authToken.substring(0, 20)}...`);
    return true;
  } else {
    console.log('❌ Login failed:', data);
    return false;
  }
}

async function testAuthenticatedUserEndpoint() {
  console.log('\n👤 Testing authenticated user endpoint...');
  
  const { response, data } = await makeRequest('GET', '/api/auth/user');
  
  if (response.status === 200 && data.email === testUser.email) {
    console.log('✅ User endpoint working correctly');
    console.log(`📧 Authenticated as: ${data.email}`);
    return true;
  } else {
    console.log('❌ User endpoint failed:', data);
    return false;
  }
}

async function testFileUpload() {
  console.log('\n📁 Testing authenticated file upload...');
  
  const { response, data } = await makeFileUpload('/api/upload', testCsvData, {
    name: 'Test Dataset',
    description: 'Test upload for authentication verification'
  });
  
  if (response.status === 201 && data.success) {
    console.log('✅ File upload successful');
    projectId = data.projectId;
    console.log(`📊 Project created with ID: ${projectId}`);
    return true;
  } else {
    console.log('❌ File upload failed:', data);
    return false;
  }
}

async function testProjectRetrieval() {
  console.log('\n📋 Testing project retrieval...');
  
  if (!projectId) {
    console.log('❌ No project ID available for testing');
    return false;
  }
  
  const { response, data } = await makeRequest('GET', `/api/projects/${projectId}`);
  
  if (response.status === 200 && data.project) {
    console.log('✅ Project retrieval successful');
    console.log(`📊 Project name: ${data.project.name}`);
    console.log(`📈 Data records: ${data.project.data?.length || 0}`);
    return true;
  } else {
    console.log('❌ Project retrieval failed:', data);
    return false;
  }
}

async function testPricingCalculation() {
  console.log('\n💰 Testing pricing calculation...');
  
  const features = ['Data Analysis', 'Data Visualization'];
  const { response, data } = await makeRequest('POST', '/api/calculate-price', { features });
  
  if (response.status === 200 && data.totalPrice !== undefined) {
    console.log('✅ Pricing calculation successful');
    console.log(`💵 Total price: $${data.totalPrice}`);
    console.log(`🏷️  Features: ${features.join(', ')}`);
    return true;
  } else {
    console.log('❌ Pricing calculation failed:', data);
    return false;
  }
}

async function testDynamicPricing() {
  console.log('\n🔄 Testing dynamic pricing service...');
  
  if (!projectId) {
    console.log('❌ No project ID available for dynamic pricing test');
    return false;
  }
  
  const { response, data } = await makeRequest('POST', '/api/dynamic-pricing', {
    projectId,
    features: ['Data Engineering', 'AI Insights']
  });
  
  if (response.ok && data.pricing) {
    console.log('✅ Dynamic pricing successful');
    console.log(`💰 Base price: $${data.pricing.basePrice}`);
    console.log(`📏 File size: ${data.pricing.fileSizeScore}`);
    console.log(`🔧 Complexity: ${data.pricing.complexityScore}`);
    return true;
  } else {
    console.log('❌ Dynamic pricing failed:', data);
    return false;
  }
}

async function runCompleteTest() {
  console.log('🚀 Starting Complete Authentication and Workflow Test');
  console.log('=' .repeat(60));
  
  const tests = [
    { name: 'Registration', fn: testRegistration },
    { name: 'Login', fn: testLogin },
    { name: 'User Authentication', fn: testAuthenticatedUserEndpoint },
    { name: 'File Upload', fn: testFileUpload },
    { name: 'Project Retrieval', fn: testProjectRetrieval },
    { name: 'Pricing Calculation', fn: testPricingCalculation },
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
  console.log('📋 TEST RESULTS SUMMARY');
  console.log('=' .repeat(60));
  
  results.details.forEach(detail => console.log(detail));
  
  console.log(`\n🎯 Overall Results: ${results.passed}/${tests.length} tests passed`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  const successRate = (results.passed / tests.length * 100).toFixed(1);
  console.log(`📊 Success Rate: ${successRate}%`);
  
  if (results.passed === tests.length) {
    console.log('\n🎉 ALL TESTS PASSED! Authentication and core workflow complete.');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.');
  }
  
  return {
    allPassed: results.passed === tests.length,
    successRate: parseFloat(successRate),
    results: results.details,
    userEmail: testUser.email,
    projectId,
    authToken: authToken ? authToken.substring(0, 20) + '...' : null
  };
}

// Run the test
runCompleteTest()
  .then(results => {
    console.log('\n📝 Test completed with results:', {
      success: results.allPassed,
      successRate: results.successRate + '%',
      userCreated: results.userEmail,
      projectCreated: !!results.projectId
    });
    process.exit(results.allPassed ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });