/**
 * Comprehensive PM Agent Clarification Test Suite
 * Tests all scenarios and edge cases
 */

const API_URL = 'http://localhost:5000/api/project-manager/clarify-goal';

async function testPMClarification(testName, requestData, expectedSuccess = true) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test: ${testName}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Request:', JSON.stringify(requestData, null, 2));

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });

    console.log(`\nStatus: ${response.status} ${response.statusText}`);

    const data = await response.json();

    if (expectedSuccess) {
      if (response.ok && data.success) {
        console.log('✅ TEST PASSED');
        console.log('\nResponse Summary:');
        console.log('  - Type:', data.type);
        if (data.clarification) {
          console.log('  - Summary:', data.clarification.summary?.substring(0, 80) + '...');
          console.log('  - Data Requirements:', data.clarification.dataRequirements?.length || 0);
          console.log('  - Complexity:', data.clarification.estimatedComplexity);
        }
        return { passed: true, data };
      } else {
        console.log('❌ TEST FAILED');
        console.log('Error:', data.error || 'Unknown error');
        console.log('Full Response:', JSON.stringify(data, null, 2));
        return { passed: false, error: data.error };
      }
    } else {
      // Expecting failure
      if (!response.ok || !data.success) {
        console.log('✅ TEST PASSED (Expected failure)');
        console.log('Error:', data.error);
        return { passed: true, data };
      } else {
        console.log('❌ TEST FAILED (Should have failed but succeeded)');
        return { passed: false, error: 'Should have failed' };
      }
    }
  } catch (error) {
    console.log('❌ TEST FAILED WITH EXCEPTION');
    console.error('Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause.message);
    return { passed: false, error: error.message };
  }
}

async function runAllTests() {
  console.log('🚀 Starting PM Agent Clarification Test Suite\n');
  console.log('Testing endpoint:', API_URL);
  console.log('Time:', new Date().toISOString());

  const results = [];

  // Test 1: Basic valid request with array of questions
  results.push(await testPMClarification(
    'Valid Request - Array of Questions',
    {
      analysisGoal: 'Understand customer purchasing behavior',
      businessQuestions: [
        'Who are our most valuable customers?',
        'What factors drive repeat purchases?'
      ],
      journeyType: 'business',
      sessionId: 'test-session-001'
    },
    true
  ));

  // Test 2: Valid request with empty questions array
  results.push(await testPMClarification(
    'Valid Request - Empty Questions Array',
    {
      analysisGoal: 'Predict sales trends',
      businessQuestions: [],
      journeyType: 'technical'
    },
    true
  ));

  // Test 3: Valid request with no questions field
  results.push(await testPMClarification(
    'Valid Request - No Questions Field',
    {
      analysisGoal: 'Analyze employee retention',
      journeyType: 'ai_guided'
    },
    true
  ));

  // Test 4: Valid request with single string question (edge case)
  results.push(await testPMClarification(
    'Valid Request - Single Question String',
    {
      analysisGoal: 'Customer churn analysis',
      businessQuestions: 'Why do customers leave?',
      journeyType: 'business'
    },
    true
  ));

  // Test 5: Valid request with minimal data
  results.push(await testPMClarification(
    'Valid Request - Minimal Data',
    {
      analysisGoal: 'Simple analysis'
    },
    true
  ));

  // Test 6: Valid request with complex goal (machine learning)
  results.push(await testPMClarification(
    'Complex Goal - Machine Learning',
    {
      analysisGoal: 'Build predictive model to forecast customer lifetime value using machine learning',
      businessQuestions: [
        'What features predict high value customers?',
        'Can we segment customers by behavior?',
        'How accurate can our predictions be?',
        'What data do we need for time series analysis?'
      ],
      journeyType: 'technical'
    },
    true
  ));

  // Test 7: Invalid request - no goal
  results.push(await testPMClarification(
    'Invalid Request - Missing Goal',
    {
      businessQuestions: ['Some question'],
      journeyType: 'business'
    },
    false
  ));

  // Test 8: Using legacy 'goal' field name
  results.push(await testPMClarification(
    'Legacy Field Name - goal instead of analysisGoal',
    {
      goal: 'Test with legacy field name',
      businessQuestions: ['Does it work?'],
      journeyType: 'business'
    },
    true
  ));

  // Print Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n⚠️  Failed Tests:');
    results.forEach((result, index) => {
      if (!result.passed) {
        console.log(`  ${index + 1}. ${result.error}`);
      }
    });
  }

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
    console.log('\n✅ PM Agent Clarification is working correctly!');
    console.log('✅ All fixes validated successfully!');
    process.exit(0);
  } else {
    console.log('⚠️  SOME TESTS FAILED');
    console.log('\n💡 Check server logs for more details');
    console.log('💡 Ensure server is running: npm run dev');
    process.exit(1);
  }
}

// Check if server is accessible first
async function checkServer() {
  console.log('🔍 Checking if server is running...\n');

  try {
    const response = await fetch('http://localhost:5000/api/system/health', {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      console.log('✅ Server is running on port 5000\n');
      return true;
    } else {
      console.log('⚠️  Server responded but may have issues\n');
      return true;
    }
  } catch (error) {
    console.log('❌ Cannot connect to server on port 5000');
    console.log('   Error:', error.message);
    console.log('\n💡 Start the server with: npm run dev\n');
    return false;
  }
}

// Main execution
(async () => {
  const serverRunning = await checkServer();

  if (!serverRunning) {
    console.log('🛑 Cannot run tests - server is not accessible');
    process.exit(1);
  }

  await runAllTests();
})();
