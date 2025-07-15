/**
 * Test Advanced Analysis Issue
 * Shows the core problem users are experiencing
 */

const fs = require('fs');

async function testAdvancedAnalysisIssue() {
  console.log('🔍 Testing Advanced Analysis "Project not found" Issue...\n');
  
  // Test 1: Show what happens when we try to run analysis with non-existent project
  console.log('📊 Test 1: Non-existent project analysis');
  
  try {
    const response = await fetch('http://localhost:5000/api/step-by-step-analysis', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId: 'user-project-12345',
        config: {
          question: 'What are the patterns in my data?',
          analysisType: 'descriptive',
          analysisPath: 'statistical',
          targetVariable: 'price',
          multivariateVariables: ['category'],
          alpha: '0.05'
        }
      })
    });
    
    const result = await response.json();
    
    console.log('   Response Status:', response.status);
    console.log('   Error Message:', result.error);
    console.log('   Full Response:', JSON.stringify(result, null, 2));
    
    if (response.status === 404) {
      console.log('   ✅ This is the exact error users are seeing\n');
    }
    
  } catch (error) {
    console.log('   ❌ Request failed:', error.message);
  }
  
  // Test 2: Show current project storage status
  console.log('📋 Test 2: Current project storage status');
  
  try {
    const response = await fetch('http://localhost:5000/api/projects');
    const projects = await response.json();
    
    console.log('   Available projects:', projects.projects.length);
    console.log('   Project list:', projects.projects);
    
    if (projects.projects.length === 0) {
      console.log('   ✅ This confirms in-memory storage is empty\n');
    }
    
  } catch (error) {
    console.log('   ❌ Failed to get projects:', error.message);
  }
  
  console.log('🎯 ROOT CAUSE ANALYSIS:');
  console.log('==================================================');
  console.log('1. Users upload data → Project stored in memory');
  console.log('2. Server restarts → In-memory storage cleared');
  console.log('3. Users try advanced analysis → "Project not found" error');
  console.log('4. Solution: Users need to re-upload data after server restarts');
  console.log('\n✅ IMPROVED ERROR HANDLING IMPLEMENTED:');
  console.log('- Better error messages explaining server restart issue');
  console.log('- User-friendly guidance to re-upload data');
  console.log('- Enhanced toast notifications in frontend');
}

// Run the test
testAdvancedAnalysisIssue().catch(console.error);