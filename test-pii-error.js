import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

// Create a test CSV file with PII data
const testData = `name,email,phone,age,salary
John Doe,john@example.com,555-1234,30,50000
Jane Smith,jane@example.com,555-5678,25,45000
Bob Johnson,bob@example.com,555-9012,35,55000`;

fs.writeFileSync('test_pii_data.csv', testData);

// Test the PII upload workflow
async function testPIIUpload() {

  console.log('Testing PII upload workflow...');

  try {
    // Step 1: Upload file
    const form = new FormData();
    form.append('file', fs.createReadStream('test_pii_data.csv'));
    form.append('projectName', 'PII Test Project');
    form.append('description', 'Testing PII handling');

    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form
    });

    const uploadResult = await uploadResponse.json();
    console.log('Upload result:', uploadResult);

    if (uploadResult.success && uploadResult.tempFileId) {
      console.log('File uploaded successfully, tempFileId:', uploadResult.tempFileId);
      
      // Step 2: Make PII decision
      const piiDecisionResponse = await fetch('http://localhost:5000/api/pii-decision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tempFileId: uploadResult.tempFileId,
          decision: 'include',
          anonymizationConfig: {
            bypassPII: true,
            overriddenColumns: ['name', 'email', 'phone'] // Mark all as "not PII"
          },
          projectData: {
            name: 'PII Test Project',
            description: 'Testing PII handling'
          }
        })
      });

      const piiResult = await piiDecisionResponse.json();
      console.log('PII decision result:', piiResult);
      
      if (!piiDecisionResponse.ok) {
        console.error('PII decision failed with status:', piiDecisionResponse.status);
        console.error('Error:', piiResult);
      }
    } else {
      console.error('Upload failed:', uploadResult);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testPIIUpload();