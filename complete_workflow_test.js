#!/usr/bin/env node

const API_BASE = 'http://localhost:5000';

async function request(method, path, data = null, headers = {}) {
  const { default: fetch } = await import('node-fetch');
  const options = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers }
  };
  
  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${API_BASE}${path}`, options);
  const text = await response.text();
  
  try {
    return { status: response.status, data: JSON.parse(text) };
  } catch {
    return { status: response.status, data: text };
  }
}

async function uploadFile(token, filePath) {
  const { default: fetch } = await import('node-fetch');
  const FormData = (await import('form-data')).default;
  const fs = require('fs');
  
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: form
  });
  
  return { status: response.status, data: await response.json() };
}

async function runWorkflow() {
  console.log('🚀 Starting Complete Workflow Test\n');
  
  const email = `workflow${Date.now()}@test.com`;
  const password = 'password123';
  
  try {
    // 1. Register
    console.log('1️⃣  Creating user account...');
    const registerResult = await request('POST', '/api/auth/register', {
      email, password, firstName: 'Workflow', lastName: 'Test'
    });
    
    if (registerResult.status !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(registerResult.data)}`);
    }
    console.log('✅ Registration successful');
    
    // 2. Login
    console.log('2️⃣  Logging in...');
    const loginResult = await request('POST', '/api/auth/login', { email, password });
    
    if (loginResult.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(loginResult.data)}`);
    }
    
    const token = loginResult.data.token;
    console.log('✅ Login successful');
    
    // 3. Test authentication
    console.log('3️⃣  Testing authentication...');
    const authTest = await request('GET', '/api/auth/user', null, {
      'Authorization': `Bearer ${token}`
    });
    
    if (authTest.status === 200) {
      console.log('✅ Authentication working');
    } else {
      console.log(`⚠️  Auth test status: ${authTest.status}`);
    }
    
    // 4. Create test data
    console.log('4️⃣  Creating test dataset...');
    const fs = require('fs');
    const csvData = `name,age,salary,department,city
John Smith,28,75000,Engineering,San Francisco
Jane Doe,32,85000,Marketing,New York
Bob Johnson,45,95000,Sales,Chicago
Alice Brown,29,70000,Engineering,Austin
Charlie Wilson,38,90000,Marketing,Seattle
Diana Davis,26,65000,Support,Boston
Eve Miller,41,100000,Management,Denver
Frank Garcia,33,80000,Engineering,Portland`;
    
    fs.writeFileSync('employee_data.csv', csvData);
    console.log('✅ Test dataset created');
    
    // 5. Upload file
    console.log('5️⃣  Uploading data file...');
    const uploadResult = await uploadFile(token, 'employee_data.csv');
    
    if (uploadResult.status === 200) {
      console.log('✅ File upload successful');
      console.log('📊 PII Detection Results:');
      console.log(`   - Detected PII: ${uploadResult.data.piiResult?.detectedPII?.join(', ') || 'none'}`);
      console.log(`   - Requires decision: ${uploadResult.data.requiresPIIDecision ? 'Yes' : 'No'}`);
      
      // 6. Handle PII decision
      if (uploadResult.data.requiresPIIDecision) {
        console.log('6️⃣  Making PII handling decision...');
        const decisionResult = await request('POST', '/api/upload/decision', {
          tempFileId: uploadResult.data.tempFileId,
          decision: 'include',
          projectName: 'Employee Analytics'
        }, { 'Authorization': `Bearer ${token}` });
        
        if (decisionResult.status === 200) {
          console.log('✅ PII decision processed');
          console.log(`📈 Project created: ${decisionResult.data.project?.name || 'Employee Analytics'}`);
        }
      }
      
      // 7. List projects
      console.log('7️⃣  Fetching user projects...');
      const projectsResult = await request('GET', '/api/projects', null, {
        'Authorization': `Bearer ${token}`
      });
      
      if (projectsResult.status === 200) {
        console.log(`✅ Found ${projectsResult.data.length} project(s)`);
        if (projectsResult.data.length > 0) {
          const project = projectsResult.data[0];
          console.log(`📁 Latest project: "${project.name}" (${project.processed ? 'processed' : 'processing'})`);
        }
      }
      
    } else {
      console.log(`❌ Upload failed: ${uploadResult.status} - ${JSON.stringify(uploadResult.data)}`);
    }
    
    console.log('\n🎉 Complete workflow test finished!');
    
  } catch (error) {
    console.error('\n❌ Workflow failed:', error.message);
  } finally {
    // Cleanup
    const fs = require('fs');
    if (fs.existsSync('employee_data.csv')) {
      fs.unlinkSync('employee_data.csv');
    }
  }
}

runWorkflow();
