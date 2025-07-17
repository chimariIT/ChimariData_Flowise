const fs = require('fs');

async function testTrialWorkflow() {
  console.log('🚀 Testing complete trial workflow...');
  
  // Test data
  const testData = 'name,age,email\nJohn Doe,30,john@example.com\nJane Smith,25,jane@example.com';
  
  // Create temporary file
  fs.writeFileSync('test_trial.csv', testData);
  
  try {
    // Step 1: Upload file
    console.log('📤 Step 1: Uploading file...');
    const { spawn } = require('child_process');
    
    const curlUpload = spawn('curl', [
      '-X', 'POST',
      '-F', 'file=@test_trial.csv',
      'http://localhost:5000/api/trial-upload'
    ]);
    
    let uploadResult = '';
    curlUpload.stdout.on('data', (data) => {
      uploadResult += data.toString();
    });
    
    curlUpload.on('close', async (code) => {
      if (code !== 0) {
        console.error('❌ Upload failed');
        return;
      }
      
      console.log('📥 Upload result:', uploadResult);
      
      const uploadJson = JSON.parse(uploadResult);
      
      if (uploadJson.requiresPIIDecision) {
        console.log('🔍 Step 2: Making PII decision...');
        
        const curlPII = spawn('curl', [
          '-X', 'POST',
          '-H', 'Content-Type: application/json',
          '-d', JSON.stringify({
            tempFileId: uploadJson.tempFileId,
            decision: 'include'
          }),
          'http://localhost:5000/api/trial-pii-decision'
        ]);
        
        let piiResult = '';
        curlPII.stdout.on('data', (data) => {
          piiResult += data.toString();
        });
        
        curlPII.on('close', (code) => {
          if (code !== 0) {
            console.error('❌ PII decision failed');
            return;
          }
          
          console.log('📊 PII decision result:', piiResult);
          
          try {
            const piiJson = JSON.parse(piiResult);
            if (piiJson.success && piiJson.trialResults) {
              console.log('✅ SUCCESS: Trial workflow completed!');
              console.log('📈 Results structure:', {
                schema: Object.keys(piiJson.trialResults.schema || {}),
                analysis: Object.keys(piiJson.trialResults.descriptiveAnalysis || {}),
                visualizations: (piiJson.trialResults.basicVisualizations || []).length
              });
            } else {
              console.log('❌ No trial results in PII decision response');
            }
          } catch (parseError) {
            console.error('❌ Failed to parse PII decision response:', parseError);
          }
        });
      } else {
        console.log('✅ No PII detected, results should be in upload response');
      }
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Clean up
    setTimeout(() => {
      if (fs.existsSync('test_trial.csv')) {
        fs.unlinkSync('test_trial.csv');
      }
    }, 5000);
  }
}

testTrialWorkflow();