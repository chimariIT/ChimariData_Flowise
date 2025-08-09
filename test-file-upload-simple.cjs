const fs = require('fs');
const FormData = require('form-data');

async function testFileUpload() {
  try {
    console.log('🧪 Testing file upload endpoint directly...');
    
    // Create test CSV content
    const csvContent = 'id,name,age\n1,John,25\n2,Jane,30\n3,Bob,35';
    
    // Create FormData properly
    const form = new FormData();
    form.append('file', Buffer.from(csvContent), {
      filename: 'test.csv',
      contentType: 'text/csv'
    });
    
    console.log('📤 Sending request...');
    const response = await fetch('http://localhost:5000/api/trial-upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    console.log(`📊 Response status: ${response.status}`);
    const result = await response.json();
    console.log('📄 Response body:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ File upload successful!');
      if (result.projectId) {
        console.log(`📁 Project ID: ${result.projectId}`);
      } else if (result.requiresPIIDecision) {
        console.log('🔒 PII decision required');
      }
    } else {
      console.log('❌ File upload failed:', result.error);
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run the test
testFileUpload();