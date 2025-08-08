#!/usr/bin/env node

const fs = require('fs');
const FormData = require('form-data');

const SERVER_URL = 'http://localhost:5000';

async function makeRequest(method, path, data = null, headers = {}) {
  const fetch = (await import('node-fetch')).default;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
  
  if (data && method !== 'GET') {
    if (data instanceof FormData) {
      options.body = data;
      delete options.headers['Content-Type']; // Let FormData set the boundary
    } else {
      options.body = JSON.stringify(data);
    }
  }
  
  const response = await fetch(`${SERVER_URL}${path}`, options);
  const text = await response.text();
  
  try {
    return { status: response.status, data: JSON.parse(text) };
  } catch {
    return { status: response.status, data: text };
  }
}

async function testCompleteWorkflow() {
  console.log('🚀 Starting complete workflow test...\n');
  
  const email = `test${Date.now()}@example.com`;
  const password = 'password123';
  
  try {
    // Step 1: Register
    console.log('1️⃣ Registering user...');
    const registerResult = await makeRequest('POST', '/api/auth/register', {
      email,
      password,
      firstName: 'Test',
      lastName: 'User'
    });
    
    if (registerResult.status !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(registerResult.data)}`);
    }
    console.log('✅ Registration successful');
    
    // Step 2: Login
    console.log('2️⃣ Logging in...');
    const loginResult = await makeRequest('POST', '/api/auth/login', {
      email,
      password
    });
    
    if (loginResult.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(loginResult.data)}`);
    }
    
    const token = loginResult.data.token;
    console.log('✅ Login successful, token:', token.substring(0, 10) + '...');
    
    // Step 3: Test auth endpoint
    console.log('3️⃣ Testing authentication...');
    const authResult = await makeRequest('GET', '/api/auth/user', null, {
      'Authorization': `Bearer ${token}`
    });
    
    console.log('Auth test result:', authResult);
    
    // Step 4: Create test CSV file
    console.log('4️⃣ Creating test file...');
    const csvContent = `name,age,city
John,25,New York
Jane,30,Los Angeles
Bob,22,Chicago
Alice,28,Boston`;
    
    fs.writeFileSync('test_upload.csv', csvContent);
    
    // Step 5: Test file upload
    console.log('5️⃣ Testing file upload...');
    const form = new FormData();
    form.append('file', fs.createReadStream('test_upload.csv'));
    
    const uploadResult = await makeRequest('POST', '/api/upload', form, {
      'Authorization': `Bearer ${token}`
    });
    
    console.log('Upload result:', uploadResult);
    
    // Step 6: List projects
    console.log('6️⃣ Listing projects...');
    const projectsResult = await makeRequest('GET', '/api/projects', null, {
      'Authorization': `Bearer ${token}`
    });
    
    console.log('Projects result:', projectsResult);
    
    console.log('\n🎉 Workflow test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Workflow test failed:', error.message);
  } finally {
    // Cleanup
    if (fs.existsSync('test_upload.csv')) {
      fs.unlinkSync('test_upload.csv');
    }
  }
}

testCompleteWorkflow();
