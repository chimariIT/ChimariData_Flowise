const fs = require('fs');
const fetch = require('node-fetch');
const FormData = require('form-data');

async function testFreeTrialUpload() {
  console.log('🚀 Starting free trial upload test...');
  
  // Test data
  const testData = 'name,age,email\nJohn Doe,30,john@example.com\nJane Smith,25,jane@example.com';
  
  // Create temporary file
  fs.writeFileSync('test_trial.csv', testData);
  
  try {
    // Step 1: Upload file
    console.log('📤 Uploading file...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test_trial.csv'));
    
    const uploadResponse = await fetch('http://localhost:5000/api/trial-upload', {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    console.log('📥 Upload result:', JSON.stringify(uploadResult, null, 2));
    
    if (uploadResult.requiresPIIDecision) {
      console.log('🔍 PII decision required, proceeding...');
      
      // Step 2: PII Decision
      const piiDecisionResponse = await fetch('http://localhost:5000/api/trial-pii-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempFileId: uploadResult.tempFileId,
          decision: 'include'
        })
      });
      
      const piiDecisionResult = await piiDecisionResponse.json();
      console.log('📊 PII decision result:', JSON.stringify(piiDecisionResult, null, 2));
      
      // Check if trial results are properly structured
      if (piiDecisionResult.trialResults) {
        console.log('✅ Trial results received successfully!');
        console.log('Schema keys:', Object.keys(piiDecisionResult.trialResults.schema || {}));
        console.log('Analysis keys:', Object.keys(piiDecisionResult.trialResults.descriptiveAnalysis || {}));
        console.log('Visualization count:', (piiDecisionResult.trialResults.basicVisualizations || []).length);
      } else {
        console.log('❌ No trial results in response');
      }
    } else {
      console.log('✅ No PII detected, direct results received');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up
    if (fs.existsSync('test_trial.csv')) {
      fs.unlinkSync('test_trial.csv');
    }
  }
}

testFreeTrialUpload();