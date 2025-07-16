import FormData from 'form-data';
import fs from 'fs';
import fetch from 'node-fetch';

async function testTrialUpload() {
  console.log('Testing trial upload flow...');
  
  // Create test file
  const testData = 'name,age,salary\nJohn,25,50000\nJane,30,60000\nBob,35,70000';
  fs.writeFileSync('test-trial.csv', testData);
  
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test-trial.csv'));
    
    const response = await fetch('http://localhost:5000/api/trial-upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    console.log('Upload result:', JSON.stringify(result, null, 2));
    
    if (result.success && result.requiresPIIDecision) {
      console.log('PII detected, testing decision endpoint...');
      
      const piiResponse = await fetch('http://localhost:5000/api/trial-pii-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempFileId: result.tempFileId,
          decision: 'include'
        })
      });
      
      const piiResult = await piiResponse.json();
      console.log('PII decision result:', JSON.stringify(piiResult, null, 2));
      
      if (piiResult.success) {
        console.log('✅ Trial upload workflow working correctly');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error:', error);
    return false;
  } finally {
    // Cleanup
    if (fs.existsSync('test-trial.csv')) {
      fs.unlinkSync('test-trial.csv');
    }
  }
}

testTrialUpload();