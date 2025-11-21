/**
 * API-Level Test for Agent Recommendation Workflow
 * Tests the backend agent collaboration without UI dependencies
 *
 * Test Scenario: SPTO Survey Analysis
 * Goal: Understanding participant feelings about programs
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_BASE = 'http://localhost:5000/api';
const SPTO_FILE_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\SPTO\\English Survey for Teacher Conferences Week Online (Responses).xlsx';

// Test configuration
const TEST_SCENARIO = {
  projectName: 'SPTO Survey Analysis - API Test',
  analysisGoal: 'Understand how survey participants feel about different programs offered',
  businessQuestions: [
    'Which programs are most positively received?',
    'What are the main concerns or negative feedback?',
    'How do different participant groups compare in their feedback?'
  ],
  journeyType: 'business',
  audience: 'mixed' // Non-technical + business users
};

let testResults = {
  passed: 0,
  failed: 0,
  steps: []
};

// Helper function to log test steps
function logStep(step, status, details = {}) {
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏳';
  console.log(`\n${emoji} ${step}`);
  if (Object.keys(details).length > 0) {
    Object.entries(details).forEach(([key, value]) => {
      console.log(`   ${key}: ${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`);
    });
  }
  testResults.steps.push({ step, status, details });
  if (status === 'PASS') testResults.passed++;
  if (status === 'FAIL') testResults.failed++;
}

// Main test execution
async function runTest() {
  console.log('🚀 Starting Agent Recommendation Workflow API Test');
  console.log('='.repeat(60));
  console.log(`Test Scenario: ${TEST_SCENARIO.projectName}`);
  console.log(`Goal: ${TEST_SCENARIO.analysisGoal}`);
  console.log(`Audience: ${TEST_SCENARIO.audience}`);
  console.log('='.repeat(60));

  try {
    // ============================================
    // STEP 1: Verify File Exists
    // ============================================
    logStep('Step 1: Verify SPTO survey file exists', 'RUNNING');

    if (!fs.existsSync(SPTO_FILE_PATH)) {
      logStep('Step 1: Verify SPTO survey file exists', 'FAIL', {
        error: 'File not found',
        path: SPTO_FILE_PATH
      });
      return;
    }

    const fileStats = fs.statSync(SPTO_FILE_PATH);
    logStep('Step 1: Verify SPTO survey file exists', 'PASS', {
      'File size': `${(fileStats.size / 1024).toFixed(2)} KB`,
      'Path': SPTO_FILE_PATH
    });

    // ============================================
    // STEP 2: Create Project
    // ============================================
    logStep('Step 2: Create project via API', 'RUNNING');

    const createProjectResponse = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: TEST_SCENARIO.projectName,
        description: 'E2E API test for agent recommendation workflow',
        analysisGoal: TEST_SCENARIO.analysisGoal,
        businessQuestions: TEST_SCENARIO.businessQuestions,
        journeyType: TEST_SCENARIO.journeyType
      })
    });

    if (!createProjectResponse.ok) {
      const error = await createProjectResponse.text();
      logStep('Step 2: Create project via API', 'FAIL', { error });
      return;
    }

    const projectData = await createProjectResponse.json();
    const projectId = projectData.project?.id || projectData.id;

    if (!projectId) {
      logStep('Step 2: Create project via API', 'FAIL', {
        error: 'No project ID in response',
        response: projectData
      });
      return;
    }

    logStep('Step 2: Create project via API', 'PASS', {
      'Project ID': projectId,
      'Journey Type': TEST_SCENARIO.journeyType
    });

    // ============================================
    // STEP 3: Upload File
    // ============================================
    logStep('Step 3: Upload SPTO survey file', 'RUNNING');

    const form = new FormData();
    form.append('file', fs.createReadStream(SPTO_FILE_PATH));
    form.append('projectId', projectId);
    form.append('name', TEST_SCENARIO.projectName);
    form.append('description', TEST_SCENARIO.analysisGoal);
    form.append('questions', JSON.stringify(TEST_SCENARIO.businessQuestions));

    const uploadResponse = await fetch(`${API_BASE}/projects/upload`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      logStep('Step 3: Upload SPTO survey file', 'FAIL', { error });
      return;
    }

    const uploadData = await uploadResponse.json();
    const fileId = uploadData.fileId || uploadData.id;

    if (!fileId) {
      logStep('Step 3: Upload SPTO survey file', 'FAIL', {
        error: 'No file ID in response',
        response: uploadData
      });
      return;
    }

    logStep('Step 3: Upload SPTO survey file', 'PASS', {
      'File ID': fileId,
      'Rows detected': uploadData.processedData?.rowCount || 'Unknown',
      'Columns detected': uploadData.processedData?.columnCount || 'Unknown'
    });

    // ============================================
    // STEP 4: Trigger Agent Recommendations
    // ============================================
    logStep('Step 4: Request agent recommendations', 'RUNNING');
    console.log('   ⏳ Agents analyzing data (Data Engineer + Data Scientist)...');

    const recommendationResponse = await fetch(`${API_BASE}/projects/${projectId}/agent-recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadedFileIds: [fileId],
        userQuestions: TEST_SCENARIO.businessQuestions,
        businessContext: {
          industry: 'Education',
          goals: [TEST_SCENARIO.analysisGoal],
          audience: TEST_SCENARIO.audience
        }
      })
    });

    if (!recommendationResponse.ok) {
      const error = await recommendationResponse.text();
      logStep('Step 4: Request agent recommendations', 'FAIL', { error });
      return;
    }

    const recommendation = await recommendationResponse.json();

    if (!recommendation.success || !recommendation.recommendation) {
      logStep('Step 4: Request agent recommendations', 'FAIL', {
        error: 'Invalid response structure',
        response: recommendation
      });
      return;
    }

    const rec = recommendation.recommendation;

    logStep('Step 4: Request agent recommendations', 'PASS', {
      'Files analyzed': rec.filesAnalyzed,
      'Total rows': rec.expectedDataSize,
      'Data quality': `${rec.dataQuality}%`
    });

    // ============================================
    // STEP 5: Validate Data Engineer Analysis
    // ============================================
    logStep('Step 5: Validate Data Engineer analysis', 'RUNNING');

    const dataEngineerChecks = {
      hasRowCount: rec.expectedDataSize > 0,
      hasQualityScore: rec.dataQuality >= 0 && rec.dataQuality <= 100,
      hasDataCharacteristics: rec.dataCharacteristics !== undefined,
      analyzedFiles: rec.filesAnalyzed > 0
    };

    const dataEngineerPassed = Object.values(dataEngineerChecks).every(v => v);

    if (!dataEngineerPassed) {
      logStep('Step 5: Validate Data Engineer analysis', 'FAIL', {
        checks: dataEngineerChecks,
        'Missing fields': Object.entries(dataEngineerChecks)
          .filter(([k, v]) => !v)
          .map(([k]) => k)
      });
    } else {
      logStep('Step 5: Validate Data Engineer analysis', 'PASS', {
        'Row count': rec.expectedDataSize,
        'Data quality': `${rec.dataQuality}%`,
        'Has time series': rec.dataCharacteristics?.hasTimeSeries || false,
        'Has categories': rec.dataCharacteristics?.hasCategories || false,
        'Has text': rec.dataCharacteristics?.hasText || false,
        'Has numeric': rec.dataCharacteristics?.hasNumeric || false
      });
    }

    // ============================================
    // STEP 6: Validate Data Scientist Recommendations
    // ============================================
    logStep('Step 6: Validate Data Scientist recommendations', 'RUNNING');

    const dataScientistChecks = {
      hasComplexity: rec.analysisComplexity !== undefined,
      hasRecommendedAnalyses: Array.isArray(rec.recommendedAnalyses) && rec.recommendedAnalyses.length > 0,
      hasCostEstimate: rec.costEstimate !== undefined,
      hasTimeEstimate: rec.timeEstimate !== undefined,
      hasRationale: rec.rationale && rec.rationale.length > 0
    };

    const dataScientistPassed = Object.values(dataScientistChecks).every(v => v);

    if (!dataScientistPassed) {
      logStep('Step 6: Validate Data Scientist recommendations', 'FAIL', {
        checks: dataScientistChecks,
        'Missing fields': Object.entries(dataScientistChecks)
          .filter(([k, v]) => !v)
          .map(([k]) => k)
      });
    } else {
      logStep('Step 6: Validate Data Scientist recommendations', 'PASS', {
        'Complexity': rec.analysisComplexity,
        'Recommended analyses': rec.recommendedAnalyses.length,
        'Analyses': rec.recommendedAnalyses.join(', '),
        'Cost estimate': rec.costEstimate,
        'Time estimate': rec.timeEstimate,
        'Rationale length': `${rec.rationale.length} chars`
      });
    }

    // ============================================
    // STEP 7: Validate Complexity is Appropriate
    // ============================================
    logStep('Step 7: Validate complexity calculation', 'RUNNING');

    // For survey data with 3 business questions, expect at least "medium" complexity
    const expectedComplexities = ['medium', 'high', 'very_high'];
    const complexityAppropriate = expectedComplexities.includes(rec.analysisComplexity);

    if (!complexityAppropriate) {
      logStep('Step 7: Validate complexity calculation', 'FAIL', {
        'Actual complexity': rec.analysisComplexity,
        'Expected': expectedComplexities.join(' or '),
        'Reason': 'Survey data with multiple questions should have at least medium complexity'
      });
    } else {
      logStep('Step 7: Validate complexity calculation', 'PASS', {
        'Complexity': rec.analysisComplexity,
        'Appropriate': 'Yes - matches data characteristics and questions'
      });
    }

    // ============================================
    // STEP 8: Validate Recommended Analyses Match Use Case
    // ============================================
    logStep('Step 8: Validate analyses match survey use case', 'RUNNING');

    // For survey sentiment analysis, expect certain analysis types
    const expectedAnalysisTypes = [
      'descriptive', // Basic stats
      'text', // For open-ended responses
      'comparative', // Comparing groups
      'trend' // If time series data exists
    ];

    const recommendedTypes = rec.recommendedAnalyses.map(a =>
      a.toLowerCase().includes('descriptive') ? 'descriptive' :
        a.toLowerCase().includes('text') || a.toLowerCase().includes('sentiment') ? 'text' :
          a.toLowerCase().includes('comparative') || a.toLowerCase().includes('compar') ? 'comparative' :
            a.toLowerCase().includes('trend') || a.toLowerCase().includes('time') ? 'trend' : null
    ).filter(Boolean);

    const hasDescriptive = recommendedTypes.includes('descriptive');
    const hasTextOrComparative = recommendedTypes.includes('text') || recommendedTypes.includes('comparative');

    if (!hasDescriptive || !hasTextOrComparative) {
      logStep('Step 8: Validate analyses match survey use case', 'FAIL', {
        'Recommended': rec.recommendedAnalyses,
        'Missing': !hasDescriptive ? 'Descriptive analysis' : 'Text/Comparative analysis',
        'Note': 'Survey data typically requires descriptive stats and text/comparative analysis'
      });
    } else {
      logStep('Step 8: Validate analyses match survey use case', 'PASS', {
        'Recommended analyses': rec.recommendedAnalyses,
        'Match use case': 'Yes - includes descriptive and text/comparative'
      });
    }

    // ============================================
    // STEP 9: Validate Multi-Sheet Handling
    // ============================================
    logStep('Step 9: Check multi-sheet handling', 'RUNNING');

    if (rec.dataCharacteristics?.multipleSheets) {
      logStep('Step 9: Check multi-sheet handling', 'PASS', {
        'Sheets detected': rec.dataCharacteristics.sheetCount || 'Multiple',
        'Guidance provided': rec.rationale.toLowerCase().includes('sheet') ? 'Yes' : 'Check manually'
      });
    } else {
      logStep('Step 9: Check multi-sheet handling', 'INFO', {
        note: 'Single sheet or sheets not explicitly mentioned in response'
      });
    }

    // ============================================
    // TEST SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Steps: ${testResults.steps.length}`);
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.steps.length) * 100).toFixed(1)}%`);

    if (testResults.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED!');
      console.log('✅ Agent recommendation workflow is working as expected');
      process.exit(0);
    } else {
      console.log('\n⚠️  SOME TESTS FAILED');
      console.log('Review the failures above for details');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ TEST EXECUTION FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
