/**
 * Test Navigation Fix for Project Upload
 * Verifies that project navigation works correctly after PII decision
 */
import fs from 'fs';
import path from 'path';

class NavigationFixTester {
  constructor() {
    this.results = [];
  }

  async testUploadAndNavigation() {
    try {
      console.log('Starting navigation fix test...');
      
      // Create test file
      const testData = [
        { name: 'John Doe', email: 'john@example.com', age: 30, department: 'Engineering' },
        { name: 'Jane Smith', email: 'jane@example.com', age: 25, department: 'Marketing' },
        { name: 'Bob Johnson', email: 'bob@example.com', age: 35, department: 'Sales' }
      ];
      
      const csvContent = [
        'name,email,age,department',
        ...testData.map(row => `${row.name},${row.email},${row.age},${row.department}`)
      ].join('\n');
      
      const tempFile = path.join(__dirname, 'test_navigation_data.csv');
      fs.writeFileSync(tempFile, csvContent);
      
      // Test file upload
      const { FormData } = await import('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(tempFile));
      form.append('name', 'Navigation Test Project');
      form.append('description', 'Testing navigation after PII decision');
      form.append('questions', JSON.stringify(['Test question 1', 'Test question 2']));
      
      const uploadResponse = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: form
      });
      
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }
      
      const uploadResult = await uploadResponse.json();
      console.log('Upload result:', uploadResult);
      
      this.addResult('File Upload', 'PASS', 'File uploaded successfully');
      
      // Test PII decision processing
      if (uploadResult.requiresPIIDecision) {
        console.log('PII detected - testing decision process...');
        
        const piiDecisionResponse = await fetch('http://localhost:5000/api/pii-decision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            tempFileId: uploadResult.tempFileId,
            decision: 'include',
            projectData: {
              name: 'Navigation Test Project',
              description: 'Testing navigation after PII decision',
              questions: ['Test question 1', 'Test question 2']
            }
          })
        });
        
        if (!piiDecisionResponse.ok) {
          throw new Error(`PII decision failed: ${piiDecisionResponse.status}`);
        }
        
        const piiResult = await piiDecisionResponse.json();
        console.log('PII decision result:', piiResult);
        
        if (piiResult.success && piiResult.projectId) {
          this.addResult('PII Decision Processing', 'PASS', `Project created with ID: ${piiResult.projectId}`);
          
          // Test project retrieval
          const projectResponse = await fetch(`http://localhost:5000/api/projects/${piiResult.projectId}`);
          
          if (projectResponse.ok) {
            const project = await projectResponse.json();
            this.addResult('Project Navigation', 'PASS', `Project accessible at /project/${piiResult.projectId}`);
            console.log('Project successfully created and accessible:', project.name);
          } else {
            this.addResult('Project Navigation', 'FAIL', `Project not accessible: ${projectResponse.status}`);
          }
        } else {
          this.addResult('PII Decision Processing', 'FAIL', 'No project ID returned');
        }
      } else {
        this.addResult('PII Detection', 'FAIL', 'PII should have been detected in test data');
      }
      
      // Clean up
      fs.unlinkSync(tempFile);
      
    } catch (error) {
      console.error('Test failed:', error);
      this.addResult('Navigation Test', 'FAIL', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({
      test: testName,
      status: status,
      message: message,
      timestamp: new Date().toISOString()
    });
  }

  async generateReport() {
    const report = {
      testSuite: 'Navigation Fix Test',
      runDate: new Date().toISOString(),
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'PASS').length,
        failed: this.results.filter(r => r.status === 'FAIL').length
      }
    };
    
    console.log('\n=== NAVIGATION FIX TEST REPORT ===');
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed}`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log('\nTest Results:');
    
    this.results.forEach(result => {
      console.log(`  ${result.status === 'PASS' ? '✓' : '✗'} ${result.test}: ${result.message}`);
    });
    
    console.log('\n=== END REPORT ===\n');
    
    // Save report
    fs.writeFileSync('navigation-fix-test-results.json', JSON.stringify(report, null, 2));
    
    return report;
  }
}

// Run the test
async function runTest() {
  const tester = new NavigationFixTester();
  await tester.testUploadAndNavigation();
  await tester.generateReport();
}

// Allow running as standalone script
if (require.main === module) {
  runTest().catch(console.error);
}

module.exports = NavigationFixTester;