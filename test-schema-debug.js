/**
 * Schema Debug Test
 * Test to verify schema is properly passed to advanced analysis modal
 */

import fetch from 'node-fetch';
import fs from 'fs';
import FormData from 'form-data';

class SchemaDebugTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testFile = 'test_schema_debug.csv';
  }

  createTestFile() {
    const testData = `name,age,department,salary,performance_rating,years_experience
John Doe,30,Engineering,75000,4.5,5
Jane Smith,28,Marketing,68000,4.2,3
Bob Johnson,35,Sales,82000,4.8,7
Alice Brown,32,HR,71000,4.3,6
Mike Wilson,29,Engineering,76000,4.6,4`;
    
    fs.writeFileSync(this.testFile, testData);
    console.log('✅ Created test CSV file');
  }

  async runTest() {
    try {
      this.createTestFile();
      
      // Test 1: Create project with PII workflow
      const projectData = await this.createProject();
      if (!projectData) {
        console.log('❌ Failed to create project');
        return;
      }
      
      // Test 2: Fetch projects list and check schema
      await this.testProjectsList();
      
      // Test 3: Fetch specific project and check schema
      await this.testSpecificProject(projectData.projectId);
      
      // Cleanup
      this.cleanup();
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      this.cleanup();
    }
  }

  async createProject() {
    console.log('\n🔄 Creating project...');
    
    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(this.testFile));
      formData.append('name', 'Schema Debug Test');
      formData.append('description', 'Testing schema debug');
      formData.append('questions', JSON.stringify(['Test schema question']));

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success && result.requiresPIIDecision) {
        console.log('✅ File uploaded, making PII decision...');
        
        // Make PII decision
        const piiFormData = new FormData();
        piiFormData.append('file', fs.createReadStream(this.testFile));
        piiFormData.append('name', 'Schema Debug Test');
        piiFormData.append('description', 'Testing schema debug');
        piiFormData.append('questions', JSON.stringify(['Test schema question']));
        piiFormData.append('tempFileId', result.tempFileId);
        piiFormData.append('decision', 'include');
        
        const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
          method: 'POST',
          body: piiFormData
        });

        const piiResult = await piiResponse.json();
        
        if (piiResult.success) {
          console.log('✅ Project created:', piiResult.projectId);
          console.log('📄 Schema from PII decision:', piiResult.schema ? 'Present' : 'Missing');
          if (piiResult.schema) {
            console.log('📊 Schema keys:', Object.keys(piiResult.schema));
          }
          return { projectId: piiResult.projectId, schema: piiResult.schema };
        } else {
          console.log('❌ PII decision failed:', piiResult.error);
          return null;
        }
      } else {
        console.log('❌ Upload failed:', result.error);
        return null;
      }
    } catch (error) {
      console.log('❌ Error creating project:', error.message);
      return null;
    }
  }

  async testProjectsList() {
    console.log('\n🔄 Testing projects list...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects`);
      const result = await response.json();
      
      if (result.projects && result.projects.length > 0) {
        const project = result.projects[0];
        console.log('✅ Projects fetched successfully');
        console.log('📄 Schema in projects list:', project.schema ? 'Present' : 'Missing');
        if (project.schema) {
          console.log('📊 Schema keys:', Object.keys(project.schema));
          console.log('🔍 Sample schema field:', JSON.stringify(project.schema.name || project.schema[Object.keys(project.schema)[0]], null, 2));
        } else {
          console.log('❌ No schema found in projects list');
        }
      } else {
        console.log('❌ No projects found');
      }
    } catch (error) {
      console.log('❌ Error fetching projects:', error.message);
    }
  }

  async testSpecificProject(projectId) {
    console.log('\n🔄 Testing specific project...');
    
    try {
      const response = await fetch(`${this.baseUrl}/api/projects/${projectId}`);
      const project = await response.json();
      
      console.log('✅ Specific project fetched');
      console.log('📄 Schema in specific project:', project.schema ? 'Present' : 'Missing');
      if (project.schema) {
        console.log('📊 Schema keys:', Object.keys(project.schema));
        console.log('🔍 Full schema structure:');
        Object.entries(project.schema).forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        });
      } else {
        console.log('❌ No schema found in specific project');
      }
    } catch (error) {
      console.log('❌ Error fetching specific project:', error.message);
    }
  }

  cleanup() {
    try {
      if (fs.existsSync(this.testFile)) {
        fs.unlinkSync(this.testFile);
        console.log('\n🧹 Test file cleaned up');
      }
    } catch (error) {
      console.log('⚠️  Cleanup error:', error.message);
    }
  }
}

// Run the test
const tester = new SchemaDebugTester();
tester.runTest();