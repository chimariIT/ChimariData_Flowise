#!/usr/bin/env node

/**
 * Comprehensive 6-Step Workflow Journey Test
 * Tests the new journey implementation after critical fixes
 */

import fetch from 'node-fetch';
import { randomBytes } from 'crypto';
import FormData from 'form-data';
import fs from 'fs';

const BASE_URL = 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

class WorkflowTester {
  constructor() {
    this.testResults = {
      goalExtraction: [],
      projectCreation: [],
      dataUpload: [],
      schemaAnalysis: [],
      piiDetection: [],
      analysisExecution: []
    };
    this.testUser = null;
    this.authToken = null;
    this.journeyId = null;
    this.projectId = null;
  }

  async runComprehensiveTest() {
    console.log('🚀 Starting Comprehensive 6-Step Workflow Test Suite...\n');
    
    try {
      await this.setupTestUser();
      await this.testGoalExtractionStep();
      await this.testProjectCreationStep();
      await this.testDataUploadStep();
      await this.testSchemaAnalysisStep();
      await this.testPIIDetectionStep();
      await this.testAnalysisExecutionStep();
      
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Workflow test suite failed:', error.message);
      process.exit(1);
    }
  }

  async setupTestUser() {
    console.log('👤 Setting up test user...');
    
    const testEmail = `workflow_test_${randomBytes(8).toString('hex')}@example.com`;
    const testPassword = 'WorkflowTest123!';
    
    try {
      // Register test user
      const registerResponse = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          name: 'Workflow Test User',
          acceptedTerms: true
        })
      });

      const registerData = await registerResponse.json();
      
      if (!registerResponse.ok || !registerData.success) {
        throw new Error('Failed to register test user');
      }
      
      // Login to get auth token
      const loginResponse = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword
        })
      });

      const loginData = await loginResponse.json();
      
      if (!loginResponse.ok || !loginData.success) {
        throw new Error('Failed to login test user');
      }
      
      this.testUser = { email: testEmail, password: testPassword, id: loginData.user.id };
      this.authToken = loginData.token;
      
      console.log('✅ Test user created and authenticated');
      
    } catch (error) {
      throw new Error(`Test user setup failed: ${error.message}`);
    }
  }

  async testGoalExtractionStep() {
    console.log('🎯 Testing Goal Extraction Step (Step 1)...');
    
    const goalExtractionData = {
      userDescription: "I want to analyze customer churn data to predict which customers are likely to leave our service. I need to identify patterns in customer behavior, usage metrics, and demographic information that correlate with churn. My goal is to build a predictive model that can help us proactively retain at-risk customers through targeted interventions.",
      journeyType: "ml-analysis",
      context: {
        industry: "SaaS",
        businessRole: "Data Analyst", 
        technicalLevel: "intermediate",
        dataTypes: ["customer_data", "usage_metrics", "subscription_history"]
      }
    };

    try {
      const response = await fetch(`${API_URL}/analysis/extract-goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(goalExtractionData)
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.goalExtraction.push({
          test: 'Goal Extraction API',
          status: '✅ PASS',
          details: `Extracted ${data.extractedGoals?.length || 0} goals, ${data.businessQuestions?.length || 0} questions, ${data.suggestedAnalysisPaths?.length || 0} analysis paths`
        });
        
        // Validate extracted goals structure
        if (data.extractedGoals && Array.isArray(data.extractedGoals) && data.extractedGoals.length > 0) {
          const firstGoal = data.extractedGoals[0];
          if (firstGoal.goal && firstGoal.category && firstGoal.priority) {
            this.testResults.goalExtraction.push({
              test: 'Goal Structure Validation',
              status: '✅ PASS',
              details: 'Goals have proper structure with required fields'
            });
          } else {
            this.testResults.goalExtraction.push({
              test: 'Goal Structure Validation',
              status: '❌ FAIL',
              details: 'Goals missing required fields'
            });
          }
        } else {
          this.testResults.goalExtraction.push({
            test: 'Goal Structure Validation',
            status: '❌ FAIL',
            details: 'No goals extracted from description'
          });
        }
        
        // Validate business questions
        if (data.businessQuestions && Array.isArray(data.businessQuestions) && data.businessQuestions.length > 0) {
          this.testResults.goalExtraction.push({
            test: 'Business Questions Generation',
            status: '✅ PASS',
            details: `Generated ${data.businessQuestions.length} relevant business questions`
          });
        } else {
          this.testResults.goalExtraction.push({
            test: 'Business Questions Generation',
            status: '❌ FAIL',
            details: 'No business questions generated'
          });
        }
        
        // Validate suggested analysis paths
        if (data.suggestedAnalysisPaths && Array.isArray(data.suggestedAnalysisPaths) && data.suggestedAnalysisPaths.length > 0) {
          this.testResults.goalExtraction.push({
            test: 'Analysis Path Suggestions',
            status: '✅ PASS',
            details: `Suggested ${data.suggestedAnalysisPaths.length} analysis approaches`
          });
        } else {
          this.testResults.goalExtraction.push({
            test: 'Analysis Path Suggestions',
            status: '❌ FAIL',
            details: 'No analysis paths suggested'
          });
        }
        
      } else {
        this.testResults.goalExtraction.push({
          test: 'Goal Extraction API',
          status: '❌ FAIL',
          details: data.message || 'Goal extraction failed'
        });
      }
    } catch (error) {
      this.testResults.goalExtraction.push({
        test: 'Goal Extraction API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testProjectCreationStep() {
    console.log('📁 Testing Project Creation Step (Step 2)...');
    
    const projectData = {
      name: `Test Customer Churn Analysis ${Date.now()}`,
      description: "Predictive analysis project for customer churn identification",
      journeyType: "ml-analysis",
      selectedGoals: [
        {
          goal: "Predict customer churn probability",
          category: "Predictive Modeling",
          priority: "high"
        }
      ],
      selectedApproaches: [
        {
          id: "machine-learning",
          name: "Machine Learning Model",
          description: "Classification model for churn prediction"
        }
      ],
      metadata: {
        industry: "SaaS",
        technicalLevel: "intermediate",
        expectedOutcomes: ["Churn probability scores", "Feature importance analysis"]
      }
    };

    try {
      const response = await fetch(`${API_URL}/projects/create-from-journey`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify(projectData)
      });

      const data = await response.json();
      
      if (response.ok && data.success && data.project) {
        this.projectId = data.project.id;
        
        this.testResults.projectCreation.push({
          test: 'Project Creation API',
          status: '✅ PASS',
          details: `Project created with ID: ${this.projectId}`
        });
        
        // Validate project structure
        const project = data.project;
        if (project.name && project.description && project.userId) {
          this.testResults.projectCreation.push({
            test: 'Project Structure Validation',
            status: '✅ PASS',
            details: 'Project has all required fields'
          });
        } else {
          this.testResults.projectCreation.push({
            test: 'Project Structure Validation',
            status: '❌ FAIL',
            details: 'Project missing required fields'
          });
        }
        
        // Test project retrieval
        const getResponse = await fetch(`${API_URL}/projects/${this.projectId}`, {
          headers: {
            'Authorization': `Bearer ${this.authToken}`
          }
        });
        
        if (getResponse.ok) {
          this.testResults.projectCreation.push({
            test: 'Project Retrieval',
            status: '✅ PASS',
            details: 'Project can be retrieved after creation'
          });
        } else {
          this.testResults.projectCreation.push({
            test: 'Project Retrieval',
            status: '❌ FAIL',
            details: 'Project cannot be retrieved after creation'
          });
        }
        
      } else {
        this.testResults.projectCreation.push({
          test: 'Project Creation API',
          status: '❌ FAIL',
          details: data.message || 'Project creation failed'
        });
      }
    } catch (error) {
      this.testResults.projectCreation.push({
        test: 'Project Creation API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testDataUploadStep() {
    console.log('📤 Testing Data Upload Step (Step 3)...');
    
    // Create test CSV data
    const testCSVData = `customer_id,age,tenure_months,monthly_spend,support_tickets,churn
1,25,12,89.50,2,0
2,45,36,156.20,0,0
3,35,6,45.80,5,1
4,28,24,112.30,1,0
5,52,48,203.40,0,0
6,31,3,38.90,8,1`;

    try {
      // Write test data to file
      fs.writeFileSync('test_churn_data.csv', testCSVData);
      
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', fs.createReadStream('test_churn_data.csv'));
      if (this.projectId) {
        formData.append('projectId', this.projectId);
      }

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
        this.testResults.dataUpload.push({
          test: 'File Upload API',
          status: '✅ PASS',
          details: `File uploaded successfully: ${data.fileName}`
        });
        
        // Validate upload response structure
        if (data.columns && Array.isArray(data.columns) && data.rowCount) {
          this.testResults.dataUpload.push({
            test: 'Upload Response Validation',
            status: '✅ PASS',
            details: `Detected ${data.columns.length} columns, ${data.rowCount} rows`
          });
        } else {
          this.testResults.dataUpload.push({
            test: 'Upload Response Validation',
            status: '❌ FAIL',
            details: 'Upload response missing column or row information'
          });
        }
        
        // Test file processing status
        if (this.projectId) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for processing
          
          const statusResponse = await fetch(`${API_URL}/projects/${this.projectId}`, {
            headers: {
              'Authorization': `Bearer ${this.authToken}`
            }
          });
          
          const statusData = await statusResponse.json();
          
          if (statusResponse.ok && statusData.fileName) {
            this.testResults.dataUpload.push({
              test: 'File Processing Status',
              status: '✅ PASS',
              details: 'File associated with project successfully'
            });
          } else {
            this.testResults.dataUpload.push({
              test: 'File Processing Status',
              status: '❌ FAIL',
              details: 'File not properly associated with project'
            });
          }
        }
        
      } else {
        this.testResults.dataUpload.push({
          test: 'File Upload API',
          status: '❌ FAIL',
          details: data.message || 'File upload failed'
        });
      }
      
      // Clean up test file
      try {
        fs.unlinkSync('test_churn_data.csv');
      } catch (e) {
        // Ignore cleanup errors
      }
      
    } catch (error) {
      this.testResults.dataUpload.push({
        test: 'File Upload API',
        status: '❌ ERROR',
        details: error.message
      });
      
      // Clean up test file on error
      try {
        fs.unlinkSync('test_churn_data.csv');
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  async testSchemaAnalysisStep() {
    console.log('🗂️ Testing Schema Analysis Step (Step 4)...');
    
    if (!this.projectId) {
      this.testResults.schemaAnalysis.push({
        test: 'Schema Analysis',
        status: '⏭️ SKIP',
        details: 'No project ID available from previous steps'
      });
      return;
    }

    try {
      // Test schema analysis endpoint
      const response = await fetch(`${API_URL}/analyze-schema`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.projectId
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.schemaAnalysis.push({
          test: 'Schema Analysis API',
          status: '✅ PASS',
          details: 'Schema analysis completed successfully'
        });
        
        // Validate schema structure
        if (data.schema && data.schema.columns && Array.isArray(data.schema.columns)) {
          this.testResults.schemaAnalysis.push({
            test: 'Schema Structure Validation',
            status: '✅ PASS',
            details: `Schema contains ${data.schema.columns.length} column definitions`
          });
          
          // Check if columns have proper classification
          const hasClassification = data.schema.columns.some(col => 
            col.dataType && col.classification
          );
          
          if (hasClassification) {
            this.testResults.schemaAnalysis.push({
              test: 'Column Classification',
              status: '✅ PASS',
              details: 'Columns properly classified with data types'
            });
          } else {
            this.testResults.schemaAnalysis.push({
              test: 'Column Classification',
              status: '❌ FAIL',
              details: 'Columns missing data type or classification'
            });
          }
        } else {
          this.testResults.schemaAnalysis.push({
            test: 'Schema Structure Validation',
            status: '❌ FAIL',
            details: 'Schema missing or has invalid structure'
          });
        }
        
      } else {
        this.testResults.schemaAnalysis.push({
          test: 'Schema Analysis API',
          status: '❌ FAIL',
          details: data.message || 'Schema analysis failed'
        });
      }
    } catch (error) {
      this.testResults.schemaAnalysis.push({
        test: 'Schema Analysis API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testPIIDetectionStep() {
    console.log('🔍 Testing PII Detection Step (Step 5)...');
    
    if (!this.projectId) {
      this.testResults.piiDetection.push({
        test: 'PII Detection',
        status: '⏭️ SKIP',
        details: 'No project ID available from previous steps'
      });
      return;
    }

    try {
      // Test PII detection endpoint
      const response = await fetch(`${API_URL}/analyze-pii`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.projectId
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.piiDetection.push({
          test: 'PII Detection API',
          status: '✅ PASS',
          details: 'PII detection completed successfully'
        });
        
        // Validate PII analysis structure
        if (data.piiAnalysis) {
          this.testResults.piiDetection.push({
            test: 'PII Analysis Structure',
            status: '✅ PASS',
            details: 'PII analysis data structure is valid'
          });
          
          // Check if PII fields are identified
          if (data.piiAnalysis.detectedFields && Array.isArray(data.piiAnalysis.detectedFields)) {
            this.testResults.piiDetection.push({
              test: 'PII Field Detection',
              status: '✅ PASS',
              details: `Detected ${data.piiAnalysis.detectedFields.length} potential PII fields`
            });
          } else {
            this.testResults.piiDetection.push({
              test: 'PII Field Detection',
              status: '⚠️ INFO',
              details: 'No PII fields detected (expected for test data)'
            });
          }
        } else {
          this.testResults.piiDetection.push({
            test: 'PII Analysis Structure',
            status: '❌ FAIL',
            details: 'PII analysis data missing from response'
          });
        }
        
      } else {
        this.testResults.piiDetection.push({
          test: 'PII Detection API',
          status: '❌ FAIL',
          details: data.message || 'PII detection failed'
        });
      }
    } catch (error) {
      this.testResults.piiDetection.push({
        test: 'PII Detection API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  async testAnalysisExecutionStep() {
    console.log('⚡ Testing Analysis Execution Step (Step 6)...');
    
    if (!this.projectId) {
      this.testResults.analysisExecution.push({
        test: 'Analysis Execution',
        status: '⏭️ SKIP',
        details: 'No project ID available from previous steps'
      });
      return;
    }

    try {
      // Test analysis execution endpoint
      const response = await fetch(`${API_URL}/execute-analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          projectId: this.projectId,
          analysisType: 'descriptive',
          options: {
            includeCorrelations: true,
            generateVisualizations: true
          }
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        this.testResults.analysisExecution.push({
          test: 'Analysis Execution API',
          status: '✅ PASS',
          details: 'Analysis execution initiated successfully'
        });
        
        // Check if analysis results are returned
        if (data.analysisId || data.results) {
          this.testResults.analysisExecution.push({
            test: 'Analysis Results Generation',
            status: '✅ PASS',
            details: 'Analysis results generated successfully'
          });
        } else {
          this.testResults.analysisExecution.push({
            test: 'Analysis Results Generation',
            status: '❌ FAIL',
            details: 'Analysis results not generated'
          });
        }
        
        // Test analysis status check if we have an analysis ID
        if (data.analysisId) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for processing
          
          const statusResponse = await fetch(`${API_URL}/analysis/${data.analysisId}/status`, {
            headers: {
              'Authorization': `Bearer ${this.authToken}`
            }
          });
          
          if (statusResponse.ok) {
            this.testResults.analysisExecution.push({
              test: 'Analysis Status Tracking',
              status: '✅ PASS',
              details: 'Analysis status can be tracked'
            });
          } else {
            this.testResults.analysisExecution.push({
              test: 'Analysis Status Tracking',
              status: '❌ FAIL',
              details: 'Cannot track analysis status'
            });
          }
        }
        
      } else {
        this.testResults.analysisExecution.push({
          test: 'Analysis Execution API',
          status: '❌ FAIL',
          details: data.message || 'Analysis execution failed'
        });
      }
    } catch (error) {
      this.testResults.analysisExecution.push({
        test: 'Analysis Execution API',
        status: '❌ ERROR',
        details: error.message
      });
    }
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE 6-STEP WORKFLOW TEST RESULTS');
    console.log('=' .repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    let errorTests = 0;
    let skippedTests = 0;
    
    for (const [category, tests] of Object.entries(this.testResults)) {
      console.log(`\n${category.toUpperCase()} TESTS:`);
      console.log('-'.repeat(40));
      
      if (tests.length === 0) {
        console.log('No tests in this category');
        continue;
      }
      
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
    
    console.log('\n📈 WORKFLOW TEST SUMMARY');
    console.log('=' .repeat(40));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`💥 Errors: ${errorTests}`);
    console.log(`⏭️ Skipped: ${skippedTests}`);
    
    const successRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(`\n🎯 Success Rate: ${successRate}%`);
    
    if (failedTests > 0 || errorTests > 0) {
      console.log('\n⚠️  WORKFLOW ISSUES FOUND - Review failed tests above');
    } else {
      console.log('\n✅ ALL WORKFLOW TESTS PASSED SUCCESSFULLY');
    }
    
    // Save results to file
    const fs = require('fs');
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { totalTests, passedTests, failedTests, errorTests, skippedTests, successRate },
      results: this.testResults,
      testArtifacts: {
        journeyId: this.journeyId,
        projectId: this.projectId,
        testUser: this.testUser?.email
      }
    };
    
    fs.writeFileSync('workflow_test_results.json', JSON.stringify(reportData, null, 2));
    console.log('\n📄 Detailed results saved to: workflow_test_results.json');
  }
}

// Run the test suite
const tester = new WorkflowTester();
await tester.runComprehensiveTest();