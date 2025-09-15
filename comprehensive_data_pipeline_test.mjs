#!/usr/bin/env node

/**
 * Comprehensive Data Pipeline Test
 * Tests file processing, PII detection, schema analysis after fixes
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import { randomBytes } from 'crypto';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

class DataPipelineTester {
  constructor() {
    this.testResults = [];
    this.authToken = null;
    this.projectId = null;
    this.uploadedFiles = [];
  }

  async runTest() {
    console.log('📊 Running Comprehensive Data Pipeline Test...\n');
    
    try {
      await this.setupAuth();
      await this.testFileUpload();
      await this.testPIIDetection();
      await this.testSchemaAnalysis();
      await this.testDataTransformation();
      await this.testAnalysisExecution();
      
      this.generateReport();
      await this.cleanup();
      
    } catch (error) {
      console.error('❌ Data pipeline test failed:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async setupAuth() {
    const testEmail = `pipeline_test_${randomBytes(6).toString('hex')}@example.com`;
    
    try {
      // Register and login
      const registerResponse = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'PipelineTest123!',
          name: 'Pipeline Test User',
          acceptedTerms: true
        })
      });

      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: 'PipelineTest123!'
        })
      });

      const loginData = await loginResponse.json();
      this.authToken = loginData.token;
      
      // Create test project
      const projectResponse = await fetch(`${API_URL}/projects/create-from-journey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          name: `Data Pipeline Test Project ${Date.now()}`,
          description: "Test project for data pipeline validation",
          journeyType: "guided",
          selectedGoals: [{ goal: "Test data processing", category: "Testing", priority: "high" }]
        })
      });

      const projectData = await projectResponse.json();
      this.projectId = projectData.project?.id;
      
      console.log('✅ Test environment setup complete\n');
      
    } catch (error) {
      throw new Error(`Setup failed: ${error.message}`);
    }
  }

  async testFileUpload() {
    console.log('📤 Testing File Upload Pipeline...');
    
    const testFiles = [
      {
        name: 'customer_data.csv',
        content: 'id,name,email,age,purchase_amount\n1,John Doe,john@email.com,25,150.50\n2,Jane Smith,jane@email.com,30,200.75\n3,Bob Johnson,bob@email.com,35,175.25',
        type: 'csv',
        hasPII: true
      },
      {
        name: 'sales_data.json',
        content: JSON.stringify([
          { product: "Widget A", sales: 1000, region: "North" },
          { product: "Widget B", sales: 1500, region: "South" },
          { product: "Widget C", sales: 750, region: "East" }
        ]),
        type: 'json',
        hasPII: false
      },
      {
        name: 'empty_file.csv',
        content: 'id,value\n',
        type: 'csv',
        isEmpty: true
      }
    ];

    for (const testFile of testFiles) {
      await this.uploadAndTestFile(testFile);
    }
  }

  async uploadAndTestFile(testFile) {
    try {
      // Write test file
      fs.writeFileSync(testFile.name, testFile.content);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testFile.name));
      if (this.projectId) {
        formData.append('projectId', this.projectId);
      }

      // Upload file
      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.push({
          category: 'File Upload',
          test: `Upload ${testFile.type.toUpperCase()} File`,
          status: '✅ PASS',
          details: `File: ${testFile.name} | Size: ${testFile.content.length} bytes`
        });
        
        // Validate response structure
        const hasRequiredFields = data.fileName && data.processedRows !== undefined;
        this.testResults.push({
          category: 'File Upload',
          test: `${testFile.type.toUpperCase()} Response Validation`,
          status: hasRequiredFields ? '✅ PASS' : '❌ FAIL',
          details: hasRequiredFields ? 
            `Rows: ${data.processedRows}, Columns: ${data.columns?.length || 'unknown'}` : 
            'Missing required response fields'
        });
        
        // Test PII detection response
        if (testFile.hasPII && data.requiresPIIDecision !== undefined) {
          this.testResults.push({
            category: 'File Upload',
            test: 'PII Detection Flag',
            status: data.requiresPIIDecision ? '✅ PASS' : '⚠️ WARNING',
            details: data.requiresPIIDecision ? 
              'PII detected correctly' : 
              'PII not detected in file with email addresses'
          });
        }
        
        this.uploadedFiles.push({ name: testFile.name, data: data });
        
      } else {
        this.testResults.push({
          category: 'File Upload',
          test: `Upload ${testFile.type.toUpperCase()} File`,
          status: testFile.isEmpty ? '⚠️ EXPECTED' : '❌ FAIL',
          details: data.message || `Upload failed: ${response.status}`
        });
      }
      
    } catch (error) {
      this.testResults.push({
        category: 'File Upload',
        test: `Upload ${testFile.type.toUpperCase()} File`,
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testPIIDetection() {
    console.log('🔍 Testing PII Detection System...');
    
    if (!this.projectId) {
      this.testResults.push({
        category: 'PII Detection',
        test: 'PII Analysis',
        status: '⏭️ SKIP',
        details: 'No project available'
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/analyze-pii`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ projectId: this.projectId })
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      if (isJson) {
        const data = await response.json();
        
        if (response.ok && data.success) {
          this.testResults.push({
            category: 'PII Detection',
            test: 'PII Analysis API',
            status: '✅ PASS',
            details: 'PII analysis completed successfully'
          });
          
          // Validate PII analysis structure
          if (data.piiAnalysis) {
            const analysis = data.piiAnalysis;
            const hasStructure = analysis.detectedFields !== undefined && 
                               analysis.riskLevel !== undefined;
            
            this.testResults.push({
              category: 'PII Detection',
              test: 'PII Analysis Structure',
              status: hasStructure ? '✅ PASS' : '❌ FAIL',
              details: hasStructure ? 
                `Detected ${analysis.detectedFields?.length || 0} fields, Risk: ${analysis.riskLevel}` :
                'Missing required analysis fields'
            });
          }
          
        } else {
          this.testResults.push({
            category: 'PII Detection',
            test: 'PII Analysis API',
            status: '❌ FAIL',
            details: data.message || 'PII analysis failed'
          });
        }
      } else {
        this.testResults.push({
          category: 'PII Detection',
          test: 'PII Analysis API',
          status: '❌ FAIL',
          details: 'API returned HTML instead of JSON (routing issue)'
        });
      }
      
    } catch (error) {
      this.testResults.push({
        category: 'PII Detection',
        test: 'PII Analysis API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testSchemaAnalysis() {
    console.log('🗂️ Testing Schema Analysis System...');
    
    if (!this.projectId) {
      this.testResults.push({
        category: 'Schema Analysis',
        test: 'Schema Analysis',
        status: '⏭️ SKIP',
        details: 'No project available'
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/analyze-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ projectId: this.projectId })
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      if (isJson) {
        const data = await response.json();
        
        if (response.ok && data.success) {
          this.testResults.push({
            category: 'Schema Analysis',
            test: 'Schema Analysis API',
            status: '✅ PASS',
            details: 'Schema analysis completed successfully'
          });
          
          // Validate schema structure
          if (data.schema && data.schema.columns) {
            const columns = data.schema.columns;
            const hasDataTypes = columns.every(col => col.dataType);
            const hasClassifications = columns.some(col => col.classification);
            
            this.testResults.push({
              category: 'Schema Analysis',
              test: 'Schema Column Analysis',
              status: hasDataTypes ? '✅ PASS' : '❌ FAIL',
              details: `${columns.length} columns analyzed | Data types: ${hasDataTypes} | Classifications: ${hasClassifications}`
            });
            
            // Test specific column types
            const emailColumn = columns.find(col => 
              col.name && col.name.toLowerCase().includes('email')
            );
            
            if (emailColumn) {
              const correctlyClassified = emailColumn.classification === 'email' || 
                                        emailColumn.dataType === 'email';
              this.testResults.push({
                category: 'Schema Analysis',
                test: 'Email Column Classification',
                status: correctlyClassified ? '✅ PASS' : '⚠️ WARNING',
                details: `Email column classified as: ${emailColumn.classification || emailColumn.dataType}`
              });
            }
            
          } else {
            this.testResults.push({
              category: 'Schema Analysis',
              test: 'Schema Structure',
              status: '❌ FAIL',
              details: 'Schema missing or has invalid structure'
            });
          }
          
        } else {
          this.testResults.push({
            category: 'Schema Analysis',
            test: 'Schema Analysis API',
            status: '❌ FAIL',
            details: data.message || 'Schema analysis failed'
          });
        }
      } else {
        this.testResults.push({
          category: 'Schema Analysis',
          test: 'Schema Analysis API',
          status: '❌ FAIL',
          details: 'API returned HTML instead of JSON (routing issue)'
        });
      }
      
    } catch (error) {
      this.testResults.push({
        category: 'Schema Analysis',
        test: 'Schema Analysis API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testDataTransformation() {
    console.log('🔄 Testing Data Transformation...');
    
    if (!this.projectId) {
      this.testResults.push({
        category: 'Data Transformation',
        test: 'Data Transformation',
        status: '⏭️ SKIP',
        details: 'No project available'
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/transform-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.projectId,
          transformations: [
            { type: 'anonymize', column: 'email', method: 'hash' },
            { type: 'normalize', column: 'age', method: 'minmax' }
          ]
        })
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      if (isJson) {
        const data = await response.json();
        
        this.testResults.push({
          category: 'Data Transformation',
          test: 'Data Transformation API',
          status: response.ok ? '✅ PASS' : '❌ FAIL',
          details: response.ok ? 
            'Data transformation processed successfully' : 
            (data.message || 'Transformation failed')
        });
      } else {
        this.testResults.push({
          category: 'Data Transformation',
          test: 'Data Transformation API',
          status: '❌ FAIL',
          details: 'API returned HTML instead of JSON (routing issue)'
        });
      }
      
    } catch (error) {
      this.testResults.push({
        category: 'Data Transformation',
        test: 'Data Transformation API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testAnalysisExecution() {
    console.log('⚡ Testing Analysis Execution...');
    
    if (!this.projectId) {
      this.testResults.push({
        category: 'Analysis Execution',
        test: 'Analysis Execution',
        status: '⏭️ SKIP',
        details: 'No project available'
      });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/execute-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.projectId,
          analysisType: 'descriptive',
          options: { includeCorrelations: true }
        })
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      
      if (isJson) {
        const data = await response.json();
        
        this.testResults.push({
          category: 'Analysis Execution',
          test: 'Analysis Execution API',
          status: response.ok ? '✅ PASS' : '❌ FAIL',
          details: response.ok ? 
            'Analysis execution initiated successfully' : 
            (data.message || 'Analysis execution failed')
        });
        
        // Test analysis results structure
        if (response.ok && (data.results || data.analysisId)) {
          this.testResults.push({
            category: 'Analysis Execution',
            test: 'Analysis Results Generation',
            status: '✅ PASS',
            details: data.analysisId ? 
              `Analysis ID: ${data.analysisId}` : 
              'Results generated directly'
          });
        }
        
      } else {
        this.testResults.push({
          category: 'Analysis Execution',
          test: 'Analysis Execution API',
          status: '❌ FAIL',
          details: 'API returned HTML instead of JSON (routing issue)'
        });
      }
      
    } catch (error) {
      this.testResults.push({
        category: 'Analysis Execution',
        test: 'Analysis Execution API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE DATA PIPELINE TEST RESULTS');
    console.log('=' .repeat(60));
    
    const categories = {};
    
    // Group results by category
    for (const result of this.testResults) {
      if (!categories[result.category]) {
        categories[result.category] = [];
      }
      categories[result.category].push(result);
    }
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let errorTests = 0;
    let skippedTests = 0;
    
    // Print results by category
    for (const [category, tests] of Object.entries(categories)) {
      console.log(`\n${category.toUpperCase()} TESTS:`);
      console.log('-'.repeat(40));
      
      for (const test of tests) {
        console.log(`${test.status} ${test.test}`);
        console.log(`   ${test.details}\n`);
        
        totalTests++;
        if (test.status.includes('PASS')) passedTests++;
        else if (test.status.includes('FAIL')) failedTests++;
        else if (test.status.includes('ERROR')) errorTests++;
        else if (test.status.includes('SKIP')) skippedTests++;
      }
    }
    
    // Summary
    console.log('\n📈 DATA PIPELINE TEST SUMMARY');
    console.log('=' .repeat(40));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`💥 Errors: ${errorTests}`);
    console.log(`⏭️ Skipped: ${skippedTests}`);
    
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    // Identify routing issues
    const routingIssues = this.testResults.filter(r => 
      r.details.includes('routing issue')
    );
    
    if (routingIssues.length > 0) {
      console.log('\n⚠️ ROUTING ISSUES DETECTED:');
      for (const issue of routingIssues) {
        console.log(`   • ${issue.test}: API endpoint routing problem`);
      }
    }
    
    if (failedTests > 0 || errorTests > 0) {
      console.log('\n⚠️ DATA PIPELINE ISSUES FOUND - Review failed tests above');
    } else {
      console.log('\n✅ DATA PIPELINE WORKING CORRECTLY');
    }
    
    // Save results
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { totalTests, passedTests, failedTests, errorTests, skippedTests, successRate },
      results: this.testResults,
      routingIssues: routingIssues.length,
      uploadedFiles: this.uploadedFiles.length
    };
    
    try {
      fs.writeFileSync('data_pipeline_test_results.json', JSON.stringify(reportData, null, 2));
      console.log('\n📄 Results saved to: data_pipeline_test_results.json');
    } catch (e) {
      console.log('\n⚠️ Could not save results to file');
    }
  }

  async cleanup() {
    // Clean up test files
    const testFiles = ['customer_data.csv', 'sales_data.json', 'empty_file.csv'];
    for (const file of testFiles) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

// Run the test
const tester = new DataPipelineTester();
await tester.runTest();