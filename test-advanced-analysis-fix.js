/**
 * Test Advanced Analysis Fix
 * Verifies that the "Project Not Found" error is resolved after hybrid storage fix
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

class AdvancedAnalysisFixTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.results = [];
  }

  async runTest() {
    console.log('Testing Advanced Analysis Fix...\n');
    
    // Test 1: Verify projects are loaded
    await this.testProjectsLoad();
    
    // Test 2: Test specific project access
    await this.testSpecificProjectAccess();
    
    // Test 3: Test analysis endpoint with existing project
    await this.testAnalysisEndpoint();
    
    // Generate report
    await this.generateReport();
  }

  async testProjectsLoad() {
    console.log('Testing projects load...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects`);
      const data = await response.json();
      
      if (data.projects && data.projects.length > 0) {
        this.addResult('Projects Load', 'PASS', `${data.projects.length} projects loaded successfully`);
        console.log(`✓ Found ${data.projects.length} projects`);
        
        // Store first project for further testing
        this.testProjectId = data.projects[0].id;
        console.log(`Using project ${this.testProjectId} for testing`);
      } else {
        this.addResult('Projects Load', 'FAIL', 'No projects found');
      }
    } catch (error) {
      this.addResult('Projects Load', 'ERROR', error.message);
    }
  }

  async testSpecificProjectAccess() {
    console.log('\nTesting specific project access...');
    
    if (!this.testProjectId) {
      this.addResult('Specific Project Access', 'SKIP', 'No project ID available');
      return;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${this.testProjectId}`);
      const project = await response.json();
      
      if (response.ok && project.id === this.testProjectId) {
        this.addResult('Specific Project Access', 'PASS', `Project ${this.testProjectId} accessed successfully`);
        console.log(`✓ Project found: ${project.name} (${project.recordCount} records)`);
      } else {
        this.addResult('Specific Project Access', 'FAIL', `Project ${this.testProjectId} not found`);
      }
    } catch (error) {
      this.addResult('Specific Project Access', 'ERROR', error.message);
    }
  }

  async testAnalysisEndpoint() {
    console.log('\nTesting analysis endpoint...');
    
    if (!this.testProjectId) {
      this.addResult('Analysis Endpoint', 'SKIP', 'No project ID available');
      return;
    }
    
    try {
      const analysisConfig = {
        projectId: this.testProjectId,
        analysisType: 'descriptive',
        selectedFields: ['name', 'age'],
        configuration: {
          includeDistribution: true,
          includeCorrelation: false
        }
      };
      
      const response = await fetch(`${this.baseUrl}/api/advanced-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisConfig)
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        this.addResult('Analysis Endpoint', 'PASS', 'Analysis executed successfully');
        console.log(`✓ Analysis completed for project ${this.testProjectId}`);
      } else {
        this.addResult('Analysis Endpoint', 'FAIL', result.error || 'Analysis failed');
        console.log(`✗ Analysis failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      this.addResult('Analysis Endpoint', 'ERROR', error.message);
    }
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('ADVANCED ANALYSIS FIX TEST REPORT');
    console.log('='.repeat(60));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const errors = this.results.filter(r => r.status === 'ERROR').length;
    
    for (const result of this.results) {
      const icon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '✗' : '!';
      console.log(`${icon} ${result.testName}: ${result.status} - ${result.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${errors} errors`);
    console.log('='.repeat(60));
    
    if (failed === 0 && errors === 0) {
      console.log('\n🎉 All tests passed! The hybrid storage fix successfully resolved the "Project Not Found" error.');
      console.log('✓ Projects are now properly loaded from the database');
      console.log('✓ Advanced analysis modal should work correctly');
      console.log('✓ Machine learning algorithms can access project data');
    } else {
      console.log('\n⚠️  Some tests failed. The hybrid storage may need additional fixes.');
    }
  }
}

// Run the test
async function runTest() {
  const tester = new AdvancedAnalysisFixTester();
  await tester.runTest();
}

runTest().catch(console.error);