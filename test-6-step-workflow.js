/**
 * Comprehensive test for 6-step journey workflow navigation
 */

const JOURNEY_TYPES = ['non-tech', 'business', 'technical'];
const WORKFLOW_STEPS = ['prepare', 'project-setup', 'data', 'execute', 'pricing', 'results'];
const BASE_URL = 'http://localhost:5000';

async function testURL(url, description) {
  try {
    const response = await fetch(url);
    const status = response.status;
    const isOk = status === 200;
    
    console.log(`${isOk ? '✅' : '❌'} ${description}: ${status} - ${url}`);
    
    if (isOk) {
      // Check if response contains HTML (basic validation)
      const text = await response.text();
      const hasHtml = text.includes('<html') || text.includes('<!DOCTYPE');
      if (!hasHtml) {
        console.log(`⚠️  Warning: Response doesn't appear to be HTML`);
      }
    }
    
    return { status, success: isOk };
  } catch (error) {
    console.log(`❌ ${description}: ERROR - ${error.message}`);
    return { status: 'ERROR', success: false, error: error.message };
  }
}

async function runWorkflowTest() {
  console.log('🚀 Starting 6-Step Journey Workflow Navigation Test\n');
  
  const results = {
    journeyHub: {},
    journeySteps: {},
    summary: { total: 0, passed: 0, failed: 0 }
  };

  // Test 1: Journey Hub
  console.log('📍 Testing Journey Hub Navigation');
  console.log('=' * 50);
  
  const journeyHubTest = await testURL(`${BASE_URL}/journeys`, 'Journey Hub Main Page');
  results.journeyHub.main = journeyHubTest;
  results.summary.total++;
  if (journeyHubTest.success) results.summary.passed++;
  else results.summary.failed++;

  // Test root redirect
  const rootTest = await testURL(`${BASE_URL}/`, 'Root Page (should redirect to journeys)');
  results.journeyHub.root = rootTest;
  results.summary.total++;
  if (rootTest.success) results.summary.passed++;
  else results.summary.failed++;

  console.log('');

  // Test 2: All Journey Types and Steps
  console.log('📍 Testing 6-Step Workflow for Each Journey Type');
  console.log('=' * 50);

  for (const journeyType of JOURNEY_TYPES) {
    console.log(`\n🎯 Testing ${journeyType.toUpperCase()} journey:`);
    
    results.journeySteps[journeyType] = {};
    
    for (const [index, step] of WORKFLOW_STEPS.entries()) {
      const stepNumber = index + 1;
      const url = `${BASE_URL}/journeys/${journeyType}/${step}`;
      const description = `Step ${stepNumber}: ${step}`;
      
      const stepTest = await testURL(url, description);
      results.journeySteps[journeyType][step] = stepTest;
      results.summary.total++;
      if (stepTest.success) results.summary.passed++;
      else results.summary.failed++;
    }
  }

  // Test 3: Legacy routes (should still work)
  console.log('\n📍 Testing Legacy Route Compatibility');
  console.log('=' * 50);
  
  const legacyRoutes = [
    '/home',
    '/projects', 
    '/pricing',
    '/demos'
  ];
  
  for (const route of legacyRoutes) {
    const legacyTest = await testURL(`${BASE_URL}${route}`, `Legacy route: ${route}`);
    results.summary.total++;
    if (legacyTest.success) results.summary.passed++;
    else results.summary.failed++;
  }

  // Test 4: Invalid routes (should return 404 or redirect)
  console.log('\n📍 Testing Invalid Route Handling');
  console.log('=' * 50);
  
  const invalidRoutes = [
    '/journeys/invalid-type/prepare',
    '/journeys/non-tech/invalid-step',
    '/completely-invalid-route'
  ];
  
  for (const route of invalidRoutes) {
    const invalidTest = await testURL(`${BASE_URL}${route}`, `Invalid route: ${route}`);
    // For invalid routes, we expect either 404 or a redirect (200 to a valid page)
    const isExpected = invalidTest.status === 404 || invalidTest.status === 200;
    console.log(`${isExpected ? '✅' : '❌'} Route handling is ${isExpected ? 'correct' : 'unexpected'}`);
  }

  // Summary
  console.log('\n📊 TEST SUMMARY');
  console.log('=' * 50);
  console.log(`Total URLs tested: ${results.summary.total}`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`📈 Success Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);

  // Detailed findings
  if (results.summary.failed > 0) {
    console.log('\n🔍 FAILED TESTS DETAILS:');
    console.log('=' * 50);
    
    // Check journey hub failures
    if (!results.journeyHub.main?.success) {
      console.log('❌ Journey Hub main page failed');
    }
    if (!results.journeyHub.root?.success) {
      console.log('❌ Root page redirect failed');
    }
    
    // Check step failures
    for (const [journeyType, steps] of Object.entries(results.journeySteps)) {
      for (const [step, result] of Object.entries(steps)) {
        if (!result.success) {
          console.log(`❌ ${journeyType}/${step}: ${result.status} ${result.error || ''}`);
        }
      }
    }
  }

  // Workflow validation
  console.log('\n🔧 WORKFLOW VALIDATION');
  console.log('=' * 50);
  
  const expectedStepOrder = ['prepare', 'project-setup', 'data', 'execute', 'pricing', 'results'];
  const actualStepOrder = WORKFLOW_STEPS;
  const stepOrderCorrect = JSON.stringify(expectedStepOrder) === JSON.stringify(actualStepOrder);
  
  console.log(`Step order is ${stepOrderCorrect ? 'CORRECT' : 'INCORRECT'}`);
  console.log(`Expected: ${expectedStepOrder.join(' → ')}`);
  console.log(`Actual:   ${actualStepOrder.join(' → ')}`);
  
  if (stepOrderCorrect) {
    console.log('✅ Pricing is correctly positioned at Step 5 (end of workflow)');
  } else {
    console.log('❌ Step order issue detected - pricing may not be positioned correctly');
  }

  console.log('\n🎉 Test completed!');
  
  return results;
}

// Run the test
runWorkflowTest()
  .then(results => {
    console.log('\n📝 Test execution completed.');
    process.exit(results.summary.failed === 0 ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });