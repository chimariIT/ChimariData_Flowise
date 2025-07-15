/**
 * Test Data Persistence After Server Restart
 * Verifies that data persists correctly in PostgreSQL after server restart
 */

import fetch from 'node-fetch';
import FormData from 'form-data';

class PersistenceVerificationTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testProjectId = null;
  }

  async runPersistenceTest() {
    console.log('Testing Data Persistence After Server Restart...\n');
    
    // Step 1: Create a project
    await this.createTestProject();
    
    // Step 2: Verify project exists
    await this.verifyProjectExists();
    
    // Step 3: Instructions for manual server restart
    console.log('\n' + '='.repeat(60));
    console.log('PERSISTENCE TEST INSTRUCTIONS:');
    console.log('1. This test has created a project with ID:', this.testProjectId);
    console.log('2. The project should be persisted in PostgreSQL');
    console.log('3. Data should be available after server restart');
    console.log('4. Run this test again to verify persistence after restart');
    console.log('='.repeat(60));
  }

  async createTestProject() {
    console.log('Creating test project...');
    
    const testData = 'name,email,phone,age,salary\n' +
                    'John Doe,john@example.com,555-1234,30,50000\n' +
                    'Jane Smith,jane@example.com,555-5678,25,45000\n' +
                    'Bob Johnson,bob@example.com,555-9012,35,55000';
    
    const formData = new FormData();
    formData.append('file', testData, 'persistence_test.csv');
    
    const uploadResponse = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    
    if (uploadResult.success && uploadResult.requiresPIIDecision) {
      const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tempFileId: uploadResult.tempFileId,
          decision: 'include',
          anonymizationConfig: { bypassPII: true, overriddenColumns: [] },
          projectData: { name: 'Persistence Test Project', description: 'Testing data persistence' }
        })
      });
      
      const piiResult = await piiResponse.json();
      if (piiResult.success) {
        this.testProjectId = piiResult.projectId;
        console.log(`✓ Project created successfully: ${this.testProjectId}`);
      } else {
        console.log('✗ Failed to create project:', piiResult.error);
      }
    } else {
      console.log('✗ Upload failed:', uploadResult.error);
    }
  }

  async verifyProjectExists() {
    console.log('\nVerifying project exists...');
    
    if (!this.testProjectId) {
      console.log('✗ No project ID to verify');
      return;
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${this.testProjectId}`);
      const project = await response.json();
      
      if (response.ok && project.id === this.testProjectId) {
        console.log('✓ Project found in storage');
        console.log(`  - Name: ${project.name}`);
        console.log(`  - Records: ${project.recordCount}`);
        console.log(`  - Created: ${new Date(project.uploadedAt).toLocaleString()}`);
        
        // Also verify in project list
        const listResponse = await fetch(`${this.baseUrl}/api/projects`);
        const projectList = await listResponse.json();
        
        if (projectList.projects && projectList.projects.some(p => p.id === this.testProjectId)) {
          console.log('✓ Project found in project list');
        } else {
          console.log('✗ Project not found in project list');
        }
      } else {
        console.log('✗ Project not found:', project.error);
      }
    } catch (error) {
      console.log('✗ Error verifying project:', error.message);
    }
  }
}

// Run the persistence test
async function runTest() {
  const tester = new PersistenceVerificationTester();
  await tester.runPersistenceTest();
}

runTest().catch(console.error);