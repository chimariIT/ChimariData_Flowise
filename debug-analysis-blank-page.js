/**
 * Debug blank page issue in Analysis tab
 */

console.log('🔍 Debugging Analysis Tab Blank Page Issue...\n');

async function debugBlankPage() {
  try {
    // First, let's create a test project to work with
    console.log('1. 📊 Creating test project...');
    
    const testProject = {
      id: 'test-debug-project',
      name: 'Debug Test Project',
      fileName: 'test-data.csv',
      fileSize: 1024,
      fileType: 'csv',
      recordCount: 100,
      uploadedAt: new Date().toISOString(),
      processed: true,
      schema: {
        'name': { type: 'text', sample: 'John Doe' },
        'age': { type: 'number', sample: 25 },
        'city': { type: 'text', sample: 'New York' },
        'salary': { type: 'number', sample: 50000 }
      },
      data: [
        { name: 'John Doe', age: 25, city: 'New York', salary: 50000 },
        { name: 'Jane Smith', age: 30, city: 'Los Angeles', salary: 60000 }
      ]
    };
    
    // Create project via API
    const createResponse = await fetch('http://localhost:5000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testProject)
    });
    
    console.log(`   ✓ Create project response: ${createResponse.status}`);
    
    if (createResponse.ok) {
      const project = await createResponse.json();
      console.log(`   ✓ Project created with ID: ${project.id}`);
      
      // Test fetching the project
      const fetchResponse = await fetch(`http://localhost:5000/api/projects/${project.id}`);
      console.log(`   ✓ Fetch project response: ${fetchResponse.status}`);
      
      if (fetchResponse.ok) {
        const fetchedProject = await fetchResponse.json();
        console.log(`   ✓ Project data available: ${Object.keys(fetchedProject.schema).length} columns`);
      }
    }
    
    console.log('\n2. 🧪 Testing DataAnalysis component directly...');
    
    // Check if DataAnalysis component has any import issues
    const fs = await import('fs');
    const dataAnalysisContent = await fs.promises.readFile('client/src/components/data-analysis.tsx', 'utf8');
    
    // Check for potential issues
    const issues = [];
    
    if (!dataAnalysisContent.includes('export default')) {
      issues.push('Missing default export');
    }
    
    if (!dataAnalysisContent.includes('interface DataAnalysisProps')) {
      issues.push('Missing props interface');
    }
    
    if (!dataAnalysisContent.includes('return (')) {
      issues.push('Missing return statement');
    }
    
    // Check for incomplete JSX
    const openTags = (dataAnalysisContent.match(/<\w+/g) || []).length;
    const closeTags = (dataAnalysisContent.match(/<\/\w+>/g) || []).length;
    const selfClosingTags = (dataAnalysisContent.match(/<\w+[^>]*\/>/g) || []).length;
    
    if (openTags !== closeTags + selfClosingTags) {
      issues.push(`JSX tag mismatch: ${openTags} open tags, ${closeTags} close tags, ${selfClosingTags} self-closing`);
    }
    
    if (issues.length > 0) {
      console.log('   ❌ Component issues found:');
      issues.forEach(issue => console.log(`      • ${issue}`));
    } else {
      console.log('   ✓ DataAnalysis component structure looks correct');
    }
    
    console.log('\n3. 🔧 Checking for common React issues...');
    
    // Check for missing imports
    const requiredImports = [
      'useState',
      'Card',
      'Button',
      'useToast'
    ];
    
    const missingImports = requiredImports.filter(imp => !dataAnalysisContent.includes(imp));
    if (missingImports.length > 0) {
      console.log(`   ❌ Missing imports: ${missingImports.join(', ')}`);
    } else {
      console.log('   ✓ All required imports present');
    }
    
    console.log('\n4. 📱 Checking project-page.tsx integration...');
    
    const projectPageContent = await fs.promises.readFile('client/src/pages/project-page.tsx', 'utf8');
    
    // Verify DataAnalysis import and usage
    if (!projectPageContent.includes('import DataAnalysis from "@/components/data-analysis"')) {
      console.log('   ❌ DataAnalysis import missing or incorrect');
    } else {
      console.log('   ✓ DataAnalysis import correct');
    }
    
    if (!projectPageContent.includes('<DataAnalysis project={project} />')) {
      console.log('   ❌ DataAnalysis component usage missing');
    } else {
      console.log('   ✓ DataAnalysis component usage correct');
    }
    
    console.log('\n💡 COMMON CAUSES OF BLANK PAGES:');
    console.log('   • JavaScript runtime errors (check browser console)');
    console.log('   • Component not receiving required props');
    console.log('   • Infinite render loops');
    console.log('   • Missing conditional rendering guards');
    console.log('   • CSS height/width issues');
    
    console.log('\n🔧 RECOMMENDATIONS:');
    console.log('   1. Open browser developer tools (F12)');
    console.log('   2. Check Console tab for JavaScript errors');
    console.log('   3. Check Network tab for failed API requests');
    console.log('   4. Try refreshing the page');
    console.log('   5. Test with a fresh browser session');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

debugBlankPage();