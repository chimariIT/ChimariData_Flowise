const fs = require('fs');
const { spawn } = require('child_process');

function runCurl(args) {
  return new Promise((resolve, reject) => {
    const curl = spawn('curl', args);
    let result = '';
    let error = '';
    
    curl.stdout.on('data', (data) => {
      result += data.toString();
    });
    
    curl.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    curl.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`curl failed with code ${code}: ${error}`));
      } else {
        resolve(result);
      }
    });
  });
}

async function testTrialWorkflow() {
  console.log('🔄 Testing Free Trial Workflow...');
  
  // Test data
  const testData = 'name,age,email,salary\nJohn Doe,30,john@example.com,75000\nJane Smith,25,jane@example.com,65000\nMike Johnson,35,mike@example.com,85000';
  
  // Create temporary file
  fs.writeFileSync('test_trial_complete.csv', testData);
  
  try {
    console.log('📤 Step 1: Upload file to trial endpoint...');
    const uploadResult = await runCurl([
      '-X', 'POST',
      '-F', 'file=@test_trial_complete.csv',
      'http://localhost:5000/api/trial-upload'
    ]);
    
    console.log('📥 Upload result length:', uploadResult.length);
    const uploadJson = JSON.parse(uploadResult);
    console.log('✅ Upload successful:', uploadJson.success);
    console.log('🔍 PII required:', uploadJson.requiresPIIDecision);
    console.log('📋 PII detected:', uploadJson.piiResult?.detectedPII?.length || 0, 'columns');
    
    if (uploadJson.requiresPIIDecision) {
      console.log('🔐 Step 2: Making PII decision...');
      
      const piiResult = await runCurl([
        '-X', 'POST',
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({
          tempFileId: uploadJson.tempFileId,
          decision: 'include'
        }),
        'http://localhost:5000/api/trial-pii-decision'
      ]);
      
      console.log('📊 PII decision result length:', piiResult.length);
      const piiJson = JSON.parse(piiResult);
      console.log('✅ PII decision successful:', piiJson.success);
      
      if (piiJson.success && piiJson.trialResults) {
        console.log('📈 Trial Results Structure:');
        console.log('  - Schema columns:', Object.keys(piiJson.trialResults.schema || {}));
        console.log('  - Analysis keys:', Object.keys(piiJson.trialResults.descriptiveAnalysis || {}));
        console.log('  - Visualizations:', (piiJson.trialResults.basicVisualizations || []).length);
        console.log('  - Record count:', piiJson.trialResults.recordCount);
        console.log('🎉 TRIAL WORKFLOW: SUCCESS');
        return true;
      } else {
        console.log('❌ TRIAL WORKFLOW: FAILED - No results in PII decision');
        return false;
      }
    } else if (uploadJson.trialResults) {
      console.log('🎉 TRIAL WORKFLOW: SUCCESS (No PII)');
      return true;
    } else {
      console.log('❌ TRIAL WORKFLOW: FAILED - No results');
      return false;
    }
  } catch (error) {
    console.error('❌ TRIAL WORKFLOW ERROR:', error.message);
    return false;
  }
}

async function testAuthenticatedWorkflow() {
  console.log('\n🔄 Testing Authenticated Full Upload Workflow...');
  
  try {
    // Step 1: Register a test user
    console.log('👤 Step 1: Register test user...');
    const registerResult = await runCurl([
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({
        email: 'testuser@example.com',
        password: 'TestPass123',
        firstName: 'Test',
        lastName: 'User'
      }),
      'http://localhost:5000/api/auth/register'
    ]);
    
    const registerJson = JSON.parse(registerResult);
    console.log('✅ Registration successful:', registerJson.success);
    
    if (!registerJson.success) {
      console.log('ℹ️  User might already exist, trying login...');
      const loginResult = await runCurl([
        '-X', 'POST',
        '-H', 'Content-Type: application/json',
        '-d', JSON.stringify({
          email: 'testuser@example.com',
          password: 'TestPass123'
        }),
        'http://localhost:5000/api/auth/login'
      ]);
      
      const loginJson = JSON.parse(loginResult);
      if (!loginJson.success) {
        console.log('❌ AUTHENTICATED WORKFLOW: FAILED - Cannot login');
        return false;
      }
      registerJson.token = loginJson.token;
    }
    
    const authToken = registerJson.token;
    console.log('🔑 Auth token obtained:', authToken ? 'YES' : 'NO');
    
    // Step 2: Upload file with authentication
    console.log('📤 Step 2: Upload file with authentication...');
    const uploadResult = await runCurl([
      '-X', 'POST',
      '-H', `Authorization: Bearer ${authToken}`,
      '-F', 'file=@test_trial_complete.csv',
      '-F', 'name=Test Project',
      '-F', 'description=Test project for workflow verification',
      'http://localhost:5000/api/projects/upload'
    ]);
    
    console.log('📥 Upload result length:', uploadResult.length);
    const uploadJson = JSON.parse(uploadResult);
    console.log('✅ Upload successful:', uploadJson.success);
    console.log('🆔 Project ID:', uploadJson.projectId);
    
    if (uploadJson.success) {
      console.log('🎉 AUTHENTICATED WORKFLOW: SUCCESS');
      return true;
    } else {
      console.log('❌ AUTHENTICATED WORKFLOW: FAILED - Upload failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ AUTHENTICATED WORKFLOW ERROR:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Complete Workflow Tests...\n');
  
  const trialSuccess = await testTrialWorkflow();
  const authSuccess = await testAuthenticatedWorkflow();
  
  console.log('\n📊 TEST RESULTS:');
  console.log('  Free Trial Workflow:', trialSuccess ? '✅ PASS' : '❌ FAIL');
  console.log('  Authenticated Workflow:', authSuccess ? '✅ PASS' : '❌ FAIL');
  
  if (trialSuccess && authSuccess) {
    console.log('\n🎉 ALL WORKFLOWS FUNCTIONING CORRECTLY!');
    console.log('✅ System is ready for user testing');
  } else {
    console.log('\n⚠️  Some workflows failed - needs investigation');
  }
  
  // Cleanup
  if (fs.existsSync('test_trial_complete.csv')) {
    fs.unlinkSync('test_trial_complete.csv');
  }
}

runAllTests().catch(console.error);