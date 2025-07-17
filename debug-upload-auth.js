/**
 * Debug Upload Authentication Issues
 * Tests both free trial and authenticated upload workflows
 */

import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

const baseUrl = 'http://localhost:5000';

// Create test CSV content
const testCsvContent = `name,age,email,salary
John Doe,25,john@example.com,50000
Jane Smith,30,jane@example.com,65000
Bob Johnson,35,bob@example.com,70000`;

async function testFreeTrialUpload() {
  console.log('🔬 Testing free trial upload...');
  
  const formData = new FormData();
  formData.append('file', Buffer.from(testCsvContent), {
    filename: 'test-trial.csv',
    contentType: 'text/csv'
  });

  try {
    const response = await fetch(`${baseUrl}/api/trial-upload`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('✅ Trial upload result:', {
      success: result.success,
      requiresPIIDecision: result.requiresPIIDecision,
      tempFileId: result.tempFileId ? 'Present' : 'Missing',
      error: result.error
    });
    
    return result;
  } catch (error) {
    console.error('❌ Trial upload error:', error.message);
    return null;
  }
}

async function testAuthenticatedUpload() {
  console.log('🔐 Testing authenticated upload...');
  
  // First register a user
  const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'testuser@example.com',
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User'
    })
  });

  const registerResult = await registerResponse.json();
  console.log('📝 Registration result:', registerResult.success ? 'Success' : 'Failed');
  
  if (!registerResult.success) {
    console.log('ℹ️  Registration failed, trying login...');
    
    // Try login instead
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testuser@example.com',
        password: 'TestPass123!'
      })
    });

    const loginResult = await loginResponse.json();
    console.log('🔑 Login result:', loginResult.success ? 'Success' : 'Failed');
    
    if (!loginResult.success) {
      console.error('❌ Authentication failed');
      return null;
    }
    
    const authToken = loginResult.token;
    console.log('🎟️  Auth token received:', authToken ? 'Yes' : 'No');

    // Now try authenticated upload
    const formData = new FormData();
    formData.append('file', Buffer.from(testCsvContent), {
      filename: 'test-auth.csv',
      contentType: 'text/csv'
    });

    const uploadResponse = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    const uploadResult = await uploadResponse.json();
    console.log('📤 Authenticated upload result:', {
      success: uploadResult.success,
      requiresPIIDecision: uploadResult.requiresPIIDecision,
      tempFileId: uploadResult.tempFileId ? 'Present' : 'Missing',
      error: uploadResult.error
    });
    
    return uploadResult;
  }
  
  return null;
}

async function runTests() {
  console.log('🚀 Starting upload authentication tests...\n');
  
  try {
    const trialResult = await testFreeTrialUpload();
    console.log('');
    
    const authResult = await testAuthenticatedUpload();
    console.log('');
    
    console.log('📊 Test Summary:');
    console.log('  Free Trial Upload:', trialResult?.success ? '✅ Working' : '❌ Failed');
    console.log('  Authenticated Upload:', authResult?.success ? '✅ Working' : '❌ Failed');
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
  }
}

runTests().catch(console.error);