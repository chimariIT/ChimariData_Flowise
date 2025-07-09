/**
 * Test Advanced Analysis Modal Factor Variables
 * Tests the factor variable selection functionality
 */

import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

class AdvancedAnalysisModalTester {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.testFile = null;
  }

  createTestFile() {
    const testData = [
      'name,age,department,salary,performance_rating,years_experience',
      'John Doe,30,Engineering,75000,4.5,5',
      'Jane Smith,28,Marketing,68000,4.2,3',
      'Bob Johnson,35,Sales,82000,4.8,7',
      'Alice Brown,32,HR,71000,4.3,6',
      'Mike Wilson,29,Engineering,76000,4.6,4',
      'Sarah Davis,33,Marketing,69000,4.1,5',
      'Tom Miller,31,Sales,78000,4.4,6',
      'Lisa Garcia,27,HR,65000,4.0,2'
    ].join('\n');

    this.testFile = 'test_advanced_analysis.csv';
    fs.writeFileSync(this.testFile, testData);
    console.log('Created test file with mixed data types');
  }

  async testProjectCreation() {
    console.log('Testing project creation...');
    
    try {
      // First, upload the file
      const formData = new FormData();
      formData.append('file', fs.createReadStream(this.testFile));
      formData.append('name', 'Advanced Analysis Test');
      formData.append('description', 'Testing advanced analysis modal');
      formData.append('questions', JSON.stringify(['Test question for advanced analysis']));

      const response = await fetch(`${this.baseUrl}/api/upload`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success && result.requiresPIIDecision) {
        console.log('✅ File uploaded, PII decision required');
        console.log('Temp file ID:', result.tempFileId);
        
        // Now make PII decision to complete project creation
        const piiFormData = new FormData();
        piiFormData.append('file', fs.createReadStream(this.testFile));
        piiFormData.append('name', 'Advanced Analysis Test');
        piiFormData.append('description', 'Testing advanced analysis modal');
        piiFormData.append('questions', JSON.stringify(['Test question for advanced analysis']));
        piiFormData.append('tempFileId', result.tempFileId);
        piiFormData.append('decision', 'include'); // Include PII for testing
        
        const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
          method: 'POST',
          body: piiFormData
        });

        const piiResult = await piiResponse.json();
        
        if (piiResult.success) {
          console.log('✅ Project created successfully:', piiResult.projectId);
          console.log('Schema:', JSON.stringify(piiResult.schema, null, 2));
          return { projectId: piiResult.projectId, schema: piiResult.schema };
        } else {
          console.log('❌ PII decision failed:', piiResult.error);
          return null;
        }
      } else if (result.success) {
        console.log('✅ Project created successfully:', result.projectId);
        console.log('Schema:', JSON.stringify(result.schema, null, 2));
        return { projectId: result.projectId, schema: result.schema };
      } else {
        console.log('❌ Project creation failed:', result.error);
        return null;
      }
    } catch (error) {
      console.log('❌ Error during project creation:', error.message);
      return null;
    }
  }

  async testSchemaStructure(schema) {
    console.log('\nTesting schema structure...');
    
    if (!schema) {
      console.log('❌ No schema provided');
      return;
    }

    const availableVariables = Object.keys(schema);
    const numericVariables = availableVariables.filter(variable => 
      schema[variable]?.type === 'number' || schema[variable]?.type === 'integer'
    );
    const categoricalVariables = availableVariables.filter(variable => 
      schema[variable]?.type === 'text' || schema[variable]?.type === 'string' || schema[variable]?.type === 'boolean'
    );
    const factorVariables = availableVariables.filter(variable => 
      schema[variable]?.type === 'text' || 
      schema[variable]?.type === 'string' || 
      schema[variable]?.type === 'boolean' || 
      schema[variable]?.type === 'number' || 
      schema[variable]?.type === 'integer'
    );

    console.log('Available variables:', availableVariables);
    console.log('Numeric variables:', numericVariables);
    console.log('Categorical variables:', categoricalVariables);
    console.log('Factor variables:', factorVariables);

    if (factorVariables.length > 0) {
      console.log('✅ Factor variables are available for selection');
    } else {
      console.log('❌ No factor variables detected');
    }
  }

  async runTest() {
    console.log('🔬 Testing Advanced Analysis Modal Factor Variables...\n');
    
    this.createTestFile();
    const projectResult = await this.testProjectCreation();
    
    if (projectResult) {
      await this.testSchemaStructure(projectResult.schema);
    }
    
    this.cleanup();
  }

  cleanup() {
    if (this.testFile && fs.existsSync(this.testFile)) {
      fs.unlinkSync(this.testFile);
      console.log('\n🧹 Test file cleaned up');
    }
  }
}

// Run the test
const tester = new AdvancedAnalysisModalTester();
tester.runTest().catch(console.error);