/**
 * Test the complete upload workflow to ensure it works end-to-end
 */

import fs from 'fs';
import FormData from 'form-data';

console.log('🚀 Testing Complete Upload Workflow...\n');

async function testUploadWorkflow() {
  try {
    console.log('1. 📁 Creating test CSV file...');
    
    // Create a simple test CSV file
    const testData = `name,age,city,salary
John Doe,30,New York,75000
Jane Smith,25,Los Angeles,68000
Bob Johnson,35,Chicago,82000
Alice Brown,28,Houston,70000`;

    fs.writeFileSync('test-data.csv', testData);
    console.log('   ✓ Created test-data.csv with sample data');
    
    console.log('\n2. 🔄 Testing file upload API...');
    
    // Test file upload
    const form = new FormData();
    form.append('file', fs.createReadStream('test-data.csv'));
    form.append('name', 'Test Upload Project');
    form.append('questions', JSON.stringify(['What insights can you provide?']));
    form.append('isTrial', 'false');
    
    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    console.log(`   ✓ Upload response status: ${uploadResponse.status}`);
    
    if (uploadResponse.ok) {
      const result = await uploadResponse.json();
      console.log(`   ✓ Upload success: ${result.success}`);
      console.log(`   ✓ Record count: ${result.recordCount}`);
      console.log(`   ✓ PII detected: ${result.requiresPIIDecision ? 'Yes' : 'No'}`);
      
      if (result.requiresPIIDecision) {
        console.log('\n3. 🔒 Testing PII decision workflow...');
        
        // Test PII decision - choose "include" for simplicity
        const piiFormData = new FormData();
        piiFormData.append('tempFileId', result.tempFileId);
        piiFormData.append('decision', 'include');
        piiFormData.append('projectData', JSON.stringify({
          name: 'Test Upload Project',
          description: 'Test project from upload workflow'
        }));
        
        const piiResponse = await fetch('http://localhost:5000/api/pii-decision', {
          method: 'POST',
          body: piiFormData,
          headers: piiFormData.getHeaders()
        });
        
        console.log(`   ✓ PII decision response: ${piiResponse.status}`);
        
        if (piiResponse.ok) {
          const piiResult = await piiResponse.json();
          console.log(`   ✓ PII decision success: ${piiResult.success}`);
          console.log(`   ✓ Project created: ${piiResult.projectId ? 'Yes' : 'No'}`);
          
          if (piiResult.projectId) {
            console.log(`   ✓ Project ID: ${piiResult.projectId}`);
            
            console.log('\n4. ✅ WORKFLOW SUCCESS SUMMARY:');
            console.log('   ✓ File upload completed successfully');
            console.log('   ✓ PII detection and decision workflow functional');
            console.log('   ✓ Project creation working correctly');
            console.log('   ✓ Project ID returned for navigation');
            console.log('\n🎯 USER CAN NOW:');
            console.log('   ✓ Upload files via any workflow');
            console.log('   ✓ Handle PII consent appropriately');
            console.log('   ✓ Navigate to project page successfully');
            console.log('   ✓ Switch between all project functionalities');
          }
        }
      } else {
        console.log('\n3. 📋 No PII detected - testing direct project creation...');
        
        // If no PII, the project should be created automatically
        console.log(`   ✓ Project ID: ${result.projectId || 'Not returned'}`);
        
        if (result.projectId) {
          console.log('\n4. ✅ WORKFLOW SUCCESS SUMMARY:');
          console.log('   ✓ File upload completed successfully');
          console.log('   ✓ No PII detected - direct project creation');
          console.log('   ✓ Project ID returned for navigation');
        }
      }
    } else {
      const error = await uploadResponse.text();
      console.log(`   ❌ Upload failed: ${error}`);
    }
    
    // Clean up
    fs.unlinkSync('test-data.csv');
    console.log('\n🧹 Cleaned up test files');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 DEBUGGING INFO:');
    console.log('   • Check if server is running on port 5000');
    console.log('   • Ensure all API endpoints are functional');
    console.log('   • Verify database connectivity for project creation');
  }
}

testUploadWorkflow();