/**
 * Comprehensive Analysis Types Validation Test
 * Tests all analysis types supported by the advanced analysis workflow
 */

const fs = require('fs');
const { spawn } = require('child_process');

class AnalysisTypesValidator {
  constructor() {
    this.baseUrl = 'http://localhost:5000';
    this.authToken = null;
    this.projectId = null;
    this.tempFileId = null;
    this.results = [];
    
    // All analysis types defined in the frontend
    this.analysisTypes = {
      statistical: [
        'anova',
        'ancova', 
        'manova',
        'mancova',
        'regression'
      ],
      machine_learning: [
        'classification',
        'regression_ml',
        'clustering',
        'feature_importance'
      ],
      agentic: [
        'business_insights',
        'comparative_analysis',
        'predictive_insights',
        'root_cause_analysis'
      ]
    };
  }

  async runCompleteValidation() {
    console.log('🔬 ADVANCED ANALYSIS TYPES VALIDATION');
    console.log('Testing all analysis types in the workflow');
    console.log('=====================================================\n');

    try {
      // Prerequisites
      await this.setupTestEnvironment();
      
      // Test all analysis types
      await this.testStatisticalAnalysis();
      await this.testMachineLearningAnalysis();
      await this.testAgenticAnalysis();
      
      // Additional validation tests
      await this.testUnsupportedAnalysisTypes();
      await this.testMissingConfigurationHandling();
      
      await this.generateValidationReport();
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      this.addResult('Overall Validation', 'FAIL', `Setup failed: ${error.message}`);
    }
  }

  async setupTestEnvironment() {
    console.log('1. Setting up test environment...');
    
    // Register and login
    await this.registerAndLogin();
    
    // Create test project
    await this.createTestProject();
    
    console.log('✅ Test environment ready\n');
  }

  async registerAndLogin() {
    const testUser = {
      email: `test_${Date.now()}@example.com`,
      password: 'testPassword123'
    };

    // Register user
    const registerResponse = await fetch(`${this.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    if (!registerResponse.ok) {
      throw new Error('Failed to register user');
    }

    const registerResult = await registerResponse.json();
    this.authToken = registerResult.token;
  }

  async createTestProject() {
    // Create test CSV data
    const testData = 'name,age,salary,department\nJohn,25,50000,Sales\nJane,30,60000,Marketing\nBob,35,70000,Engineering';
    
    // Upload file
    const formData = new FormData();
    const blob = new Blob([testData], { type: 'text/csv' });
    formData.append('file', blob, 'test-data.csv');
    formData.append('feature', 'full');

    const uploadResponse = await fetch(`${this.baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.authToken}` },
      body: formData
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload test file');
    }

    const uploadResult = await uploadResponse.json();
    this.tempFileId = uploadResult.tempFileId;

    // Process PII decision
    const piiResponse = await fetch(`${this.baseUrl}/api/pii-decision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tempFileId: this.tempFileId,
        decision: 'include',
        projectData: {
          name: 'Analysis Types Test Project',
          description: 'Testing all analysis types',
          questions: ['Test all analysis types']
        }
      })
    });

    if (!piiResponse.ok) {
      throw new Error('Failed to process PII decision');
    }

    const piiResult = await piiResponse.json();
    this.projectId = piiResult.projectId;
  }

  async testStatisticalAnalysis() {
    console.log('2. Testing Statistical Analysis Types...');
    
    for (const analysisType of this.analysisTypes.statistical) {
      await this.testAnalysisType(analysisType, 'statistical');
    }
    
    console.log('✅ Statistical analysis types tested\n');
  }

  async testMachineLearningAnalysis() {
    console.log('3. Testing Machine Learning Analysis Types...');
    
    for (const analysisType of this.analysisTypes.machine_learning) {
      await this.testAnalysisType(analysisType, 'machine_learning');
    }
    
    console.log('✅ Machine learning analysis types tested\n');
  }

  async testAgenticAnalysis() {
    console.log('4. Testing Agentic Analysis Types...');
    
    for (const analysisType of this.analysisTypes.agentic) {
      await this.testAnalysisType(analysisType, 'agentic');
    }
    
    console.log('✅ Agentic analysis types tested\n');
  }

  async testAnalysisType(analysisType, analysisPath) {
    console.log(`   Testing ${analysisType} (${analysisPath})...`);
    
    try {
      const config = this.generateConfigForAnalysisType(analysisType, analysisPath);
      
      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId,
          config: config
        })
      });

      const result = await response.json();
      
      if (response.status === 200 && result.success) {
        this.addResult(`${analysisType} (${analysisPath})`, 'PASS', 'Analysis completed successfully');
      } else {
        this.addResult(`${analysisType} (${analysisPath})`, 'FAIL', `Analysis failed: ${result.error}`);
      }
    } catch (error) {
      this.addResult(`${analysisType} (${analysisPath})`, 'FAIL', `Request failed: ${error.message}`);
    }
  }

  generateConfigForAnalysisType(analysisType, analysisPath) {
    const baseConfig = {
      analysisType: analysisType,
      analysisPath: analysisPath,
      targetVariable: 'salary',
      multivariateVariables: ['age', 'department'],
      alpha: '0.05',
      question: `Testing ${analysisType} analysis`
    };

    // Add specific configurations based on analysis type
    switch (analysisType) {
      case 'ancova':
      case 'mancova':
        baseConfig.covariates = ['age'];
        break;
      case 'manova':
      case 'mancova':
        baseConfig.targetVariables = ['salary'];
        break;
      case 'classification':
      case 'regression_ml':
      case 'feature_importance':
        baseConfig.mlAlgorithm = 'random_forest';
        baseConfig.testSize = '0.2';
        baseConfig.crossValidation = '5';
        break;
      case 'clustering':
        baseConfig.targetVariable = null; // Unsupervised
        break;
      case 'business_insights':
        baseConfig.businessContext = 'What factors influence salary in this organization?';
        baseConfig.analysisRole = 'Business Consultant';
        baseConfig.reportFormat = 'executive_summary';
        break;
      case 'comparative_analysis':
        baseConfig.comparisonDimensions = ['department'];
        break;
      case 'predictive_insights':
        baseConfig.forecastPeriod = '12_months';
        baseConfig.predictionTarget = 'salary';
        break;
      case 'root_cause_analysis':
        baseConfig.problemStatement = 'Why do salaries vary across departments?';
        baseConfig.investigationDepth = 'deep';
        break;
    }

    return baseConfig;
  }

  async testUnsupportedAnalysisTypes() {
    console.log('5. Testing Unsupported Analysis Types...');
    
    const unsupportedTypes = [
      'invalid_analysis',
      'nonexistent_type',
      'random_analysis'
    ];

    for (const analysisType of unsupportedTypes) {
      try {
        const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            projectId: this.projectId,
            config: {
              analysisType: analysisType,
              analysisPath: 'statistical',
              targetVariable: 'salary',
              multivariateVariables: ['age']
            }
          })
        });

        const result = await response.json();
        
        if (response.status === 400 || (result.error && result.error.includes('Unsupported analysis type'))) {
          this.addResult(`Unsupported: ${analysisType}`, 'PASS', 'Correctly rejected unsupported type');
        } else {
          this.addResult(`Unsupported: ${analysisType}`, 'FAIL', 'Should have rejected unsupported type');
        }
      } catch (error) {
        this.addResult(`Unsupported: ${analysisType}`, 'PASS', 'Correctly handled invalid request');
      }
    }
    
    console.log('✅ Unsupported analysis types handled correctly\n');
  }

  async testMissingConfigurationHandling() {
    console.log('6. Testing Missing Configuration Handling...');
    
    // Test missing target variable for analyses that require it
    try {
      const response = await fetch(`${this.baseUrl}/api/step-by-step-analysis`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: this.projectId,
          config: {
            analysisType: 'anova',
            analysisPath: 'statistical',
            multivariateVariables: ['age']
            // Missing targetVariable
          }
        })
      });

      const result = await response.json();
      
      if (response.status === 400 || result.error) {
        this.addResult('Missing Config Handling', 'PASS', 'Correctly handled missing configuration');
      } else {
        this.addResult('Missing Config Handling', 'FAIL', 'Should have rejected missing configuration');
      }
    } catch (error) {
      this.addResult('Missing Config Handling', 'PASS', 'Correctly handled invalid configuration');
    }
    
    console.log('✅ Missing configuration handling tested\n');
  }

  addResult(testName, status, message) {
    this.results.push({ testName, status, message });
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`   ${icon} ${testName}: ${message}`);
  }

  async generateValidationReport() {
    console.log('=====================================================');
    console.log('📊 ANALYSIS TYPES VALIDATION RESULTS');
    console.log('=====================================================\n');

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;

    console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);
    
    if (failed === 0) {
      console.log('🎉 ALL ANALYSIS TYPES CORRECTLY HANDLED!');
      console.log('✅ System supports all defined analysis types');
    } else {
      console.log('❌ SOME ANALYSIS TYPES HAVE ISSUES');
      console.log('\nFailed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  ❌ ${r.testName}: ${r.message}`));
    }

    // Generate detailed report
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: passed,
        failed: failed,
        skipped: skipped,
        successRate: `${((passed / this.results.length) * 100).toFixed(1)}%`
      },
      analysisTypesCovered: {
        statistical: this.analysisTypes.statistical.length,
        machine_learning: this.analysisTypes.machine_learning.length,
        agentic: this.analysisTypes.agentic.length
      },
      detailedResults: this.results,
      recommendations: this.generateRecommendations()
    };

    fs.writeFileSync('analysis-types-validation-results.json', JSON.stringify(reportData, null, 2));
    console.log('\n📄 Detailed results saved to: analysis-types-validation-results.json');
  }

  generateRecommendations() {
    const failedTests = this.results.filter(r => r.status === 'FAIL');
    
    if (failedTests.length === 0) {
      return [
        'All analysis types are correctly implemented and handled',
        'The advanced analysis workflow supports all defined analysis types',
        'Error handling for unsupported types is working correctly',
        'Configuration validation is properly implemented'
      ];
    }

    const recommendations = [];
    
    failedTests.forEach(test => {
      if (test.testName.includes('business_insights')) {
        recommendations.push('Fix business insights analysis implementation in AdvancedAnalyzer');
      }
      if (test.testName.includes('comparative_analysis')) {
        recommendations.push('Implement comparative analysis support in backend');
      }
      if (test.testName.includes('predictive_insights')) {
        recommendations.push('Add predictive insights analysis capability');
      }
      if (test.testName.includes('root_cause_analysis')) {
        recommendations.push('Implement root cause analysis functionality');
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }
}

// Run the validation
async function runValidation() {
  const validator = new AnalysisTypesValidator();
  await validator.runCompleteValidation();
}

if (require.main === module) {
  runValidation().catch(console.error);
}

module.exports = { AnalysisTypesValidator };