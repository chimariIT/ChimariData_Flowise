/**
 * Quick test to upload a file and check if Analysis tab works
 */

import fs from 'fs';
import FormData from 'form-data';

console.log('🧪 Testing Analysis Tab with Real Upload...\n');

async function testAnalysisWithUpload() {
  try {
    console.log('1. 📁 Creating test CSV file...');
    
    const csvContent = `name,age,city,salary
John Doe,25,New York,50000
Jane Smith,30,Los Angeles,60000
Bob Johnson,35,Chicago,55000
Alice Brown,28,Houston,52000
Mike Wilson,32,Phoenix,58000`;
    
    await fs.promises.writeFile('test-data.csv', csvContent);
    console.log('   ✓ Created test-data.csv');
    
    console.log('\n2. 🔄 Testing file upload...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test-data.csv'));
    
    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: formData
    });
    
    console.log(`   ✓ Upload response: ${uploadResponse.status}`);
    
    if (uploadResponse.ok) {
      const uploadResult = await uploadResponse.json();
      console.log(`   ✓ Upload successful, project ID: ${uploadResult.projectId || 'unknown'}`);
      
      if (uploadResult.projectId) {
        console.log('\n3. 📊 Testing project data...');
        
        const projectResponse = await fetch(`http://localhost:5000/api/projects/${uploadResult.projectId}`);
        console.log(`   ✓ Project fetch: ${projectResponse.status}`);
        
        if (projectResponse.ok) {
          const project = await projectResponse.json();
          console.log(`   ✓ Project data: ${Object.keys(project.schema || {}).length} columns`);
          console.log(`   ✓ Schema types: ${Object.values(project.schema || {}).map(s => s.type).join(', ')}`);
          
          console.log('\n✅ ANALYSIS TAB SHOULD WORK WITH THIS DATA');
          console.log('📝 Navigate to project page and click Analysis tab');
          console.log(`🔗 URL: /project/${uploadResult.projectId}`);
        }
      }
    } else {
      const error = await uploadResponse.text();
      console.log(`   ❌ Upload failed: ${error}`);
    }
    
    // Cleanup
    await fs.promises.unlink('test-data.csv');
    console.log('\n🧹 Cleaned up test file');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAnalysisWithUpload();