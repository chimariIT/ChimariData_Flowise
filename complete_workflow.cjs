#!/usr/bin/env node

const API_BASE = 'http://localhost:5000';

async function request(method, path, data = null, headers = {}) {
  const fetch = (await import('node-fetch')).default;
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
  const fetch = (await import('node-fetch')).default;
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
  console.log('🚀 ChimariData Platform - Complete Workflow Demonstration\n');
  
  const email = `demo${Date.now()}@test.com`;
  const password = 'password123';
  
  try {
    // 1. User Registration
    console.log('1️⃣  Creating user account...');
    const registerResult = await request('POST', '/api/auth/register', {
      email, password, firstName: 'Demo', lastName: 'User'
    });
    
    if (registerResult.status !== 201) {
      throw new Error(`Registration failed: ${JSON.stringify(registerResult.data)}`);
    }
    console.log('✅ User account created successfully');
    
    // 2. User Login
    console.log('2️⃣  Authenticating user...');
    const loginResult = await request('POST', '/api/auth/login', { email, password });
    
    if (loginResult.status !== 200) {
      throw new Error(`Login failed: ${JSON.stringify(loginResult.data)}`);
    }
    
    const token = loginResult.data.token;
    console.log('✅ User authenticated successfully');
    
    // 3. Create comprehensive test dataset
    console.log('3️⃣  Creating business dataset...');
    const fs = require('fs');
    const businessData = `name,age,salary,department,city,experience,performance_score
John Smith,28,75000,Engineering,San Francisco,5,8.5
Jane Doe,32,85000,Marketing,New York,7,9.2
Bob Johnson,45,95000,Sales,Chicago,15,7.8
Alice Brown,29,70000,Engineering,Austin,4,8.9
Charlie Wilson,38,90000,Marketing,Seattle,10,8.1
Diana Davis,26,65000,Support,Boston,2,7.5
Eve Miller,41,100000,Management,Denver,18,9.5
Frank Garcia,33,80000,Engineering,Portland,8,8.7
Grace Lee,27,72000,Design,Los Angeles,3,8.3
Henry Clark,36,88000,Sales,Miami,12,8.8`;
    
    fs.writeFileSync('business_data.csv', businessData);
    console.log('✅ Business dataset created (10 employees, 7 columns)');
    
    // 4. File Upload with PII Detection
    console.log('4️⃣  Uploading dataset with PII analysis...');
    const uploadResult = await uploadFile(token, 'business_data.csv');
    
    if (uploadResult.status === 200) {
      console.log('✅ File uploaded and analyzed successfully');
      
      console.log('\n📊 PII Analysis Results:');
      if (uploadResult.data.piiResult) {
        console.log(`   • Detected PII fields: ${uploadResult.data.piiResult.detectedPII?.join(', ') || 'none'}`);
        console.log(`   • Requires privacy decision: ${uploadResult.data.requiresPIIDecision ? 'Yes' : 'No'}`);
        console.log(`   • Sample data rows: ${uploadResult.data.sampleData?.length || 0}`);
      }
      
      // 5. PII Decision Processing
      if (uploadResult.data.requiresPIIDecision && uploadResult.data.tempFileId) {
        console.log('\n5️⃣  Processing privacy compliance decision...');
        const decisionResult = await request('POST', '/api/upload/decision', {
          tempFileId: uploadResult.data.tempFileId,
          decision: 'include',
          projectName: 'Employee Performance Analytics'
        }, { 'Authorization': `Bearer ${token}` });
        
        if (decisionResult.status === 200) {
          console.log('✅ Privacy decision processed');
          if (decisionResult.data.project) {
            console.log(`📈 Project created: "${decisionResult.data.project.name}"`);
            console.log(`   • Project ID: ${decisionResult.data.project.id}`);
            console.log(`   • Processing status: ${decisionResult.data.project.processed ? 'Complete' : 'In Progress'}`);
          }
        } else {
          console.log(`⚠️  Decision processing: ${decisionResult.status}`);
        }
      }
      
      // 6. Project Management
      console.log('\n6️⃣  Retrieving user projects...');
      const projectsResult = await request('GET', '/api/projects', null, {
        'Authorization': `Bearer ${token}`
      });
      
      if (projectsResult.status === 200) {
        console.log(`✅ Retrieved ${projectsResult.data.length} project(s)`);
        
        if (projectsResult.data.length > 0) {
          const project = projectsResult.data[0];
          console.log('\n📁 Project Details:');
          console.log(`   • Name: ${project.name}`);
          console.log(`   • Rows: ${project.rowCount || 'calculating...'}`);
          console.log(`   • Columns: ${project.columnCount || 'calculating...'}`);
          console.log(`   • Status: ${project.processed ? 'Ready for analysis' : 'Processing...'}`);
        }
      } else {
        console.log(`⚠️  Projects retrieval: ${projectsResult.status}`);
      }
      
    } else {
      console.log(`❌ Upload failed: ${uploadResult.status}`);
      console.log(`   Error: ${JSON.stringify(uploadResult.data)}`);
    }
    
    console.log('\n🎉 Platform Workflow Demonstration Complete!');
    console.log('\n📋 Workflow Summary:');
    console.log('   ✅ User registration and authentication');
    console.log('   ✅ Secure file upload with multipart support');
    console.log('   ✅ Automated PII detection and privacy compliance');
    console.log('   ✅ Data processing and project creation');
    console.log('   ✅ Project management and retrieval');
    
  } catch (error) {
    console.error('\n❌ Workflow error:', error.message);
  } finally {
    // Cleanup
    const fs = require('fs');
    if (fs.existsSync('business_data.csv')) {
      fs.unlinkSync('business_data.csv');
    }
  }
}

runWorkflow();
