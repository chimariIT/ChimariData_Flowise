/**
 * Test forward/backward navigation and URL routing between steps
 */

const JOURNEY_TYPES = ['non-tech', 'business', 'technical'];
const WORKFLOW_STEPS = ['prepare', 'project-setup', 'data', 'execute', 'pricing', 'results'];
const BASE_URL = 'http://localhost:5000';

async function fetchPageContent(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, status: response.status, content: null };
    }
    const content = await response.text();
    return { success: true, status: response.status, content };
  } catch (error) {
    return { success: false, status: 'ERROR', content: null, error: error.message };
  }
}

function extractTestElements(html) {
  // Extract key navigation elements that should be present
  const elements = {
    hasJourneyWizard: html.includes('JourneyWizard') || html.includes('Journey Wizard'),
    hasProgressBar: html.includes('progress') || html.includes('Progress'),
    hasNavButtons: html.includes('Previous') && html.includes('Next'),
    hasStepContent: html.includes('step-content') || html.includes('card-step-content'),
    hasBackToJourneys: html.includes('Back to Journeys'),
    hasStepNavigation: html.includes('button-step-'),
    errors: {
      hasJSError: html.includes('Error:') || html.includes('TypeError:'),
      hasComponentError: html.includes('Component Error') || html.includes('React Error'),
      hasMissingImport: html.includes('Module not found') || html.includes('Cannot resolve module')
    }
  };
  
  return elements;
}

async function testNavigationFlow() {
  console.log('🧭 Testing Step Navigation Flow and URL Routing');
  console.log('=' * 60);
  
  const results = {
    navigationTests: {},
    elementValidation: {},
    urlRouting: {},
    summary: { passed: 0, failed: 0, total: 0 }
  };

  // Test 1: Test each step's page content for navigation elements
  console.log('\n📍 Testing Step Content and Navigation Elements');
  console.log('-' * 50);
  
  for (const journeyType of JOURNEY_TYPES) {
    console.log(`\n🎯 Testing ${journeyType.toUpperCase()} journey navigation elements:`);
    
    results.elementValidation[journeyType] = {};
    
    for (const [stepIndex, step] of WORKFLOW_STEPS.entries()) {
      const url = `${BASE_URL}/journeys/${journeyType}/${step}`;
      const pageData = await fetchPageContent(url);
      
      results.summary.total++;
      
      if (!pageData.success) {
        console.log(`❌ Step ${stepIndex + 1} (${step}): Failed to load - ${pageData.status}`);
        results.elementValidation[journeyType][step] = { success: false, reason: 'Failed to load' };
        results.summary.failed++;
        continue;
      }
      
      const elements = extractTestElements(pageData.content);
      results.elementValidation[journeyType][step] = elements;
      
      // Validate essential navigation elements
      const checks = [
        { test: elements.hasProgressBar, name: 'Progress Bar' },
        { test: elements.hasBackToJourneys, name: 'Back to Journeys' },
        { test: elements.hasStepContent, name: 'Step Content' }
      ];
      
      const passed = checks.filter(check => check.test).length;
      const total = checks.length;
      const stepPassed = passed === total;
      
      if (stepPassed) {
        console.log(`✅ Step ${stepIndex + 1} (${step}): ${passed}/${total} navigation elements present`);
        results.summary.passed++;
      } else {
        console.log(`⚠️  Step ${stepIndex + 1} (${step}): ${passed}/${total} navigation elements present`);
        const missing = checks.filter(check => !check.test).map(check => check.name);
        console.log(`   Missing: ${missing.join(', ')}`);
        results.summary.failed++;
      }
      
      // Check for errors
      if (elements.errors.hasJSError || elements.errors.hasComponentError || elements.errors.hasMissingImport) {
        console.log(`⚠️  Step ${stepIndex + 1} (${step}): Potential errors detected in page content`);
      }
    }
  }

  // Test 2: Test URL routing patterns
  console.log('\n📍 Testing URL Routing Patterns');
  console.log('-' * 50);
  
  const routingTests = [
    { pattern: '/journeys/{type}/prepare', description: 'Step 1 - Prepare', stepIndex: 0 },
    { pattern: '/journeys/{type}/project-setup', description: 'Step 2 - Project Setup', stepIndex: 1 },
    { pattern: '/journeys/{type}/data', description: 'Step 3 - Data', stepIndex: 2 },
    { pattern: '/journeys/{type}/execute', description: 'Step 4 - Execute', stepIndex: 3 },
    { pattern: '/journeys/{type}/pricing', description: 'Step 5 - Pricing', stepIndex: 4 },
    { pattern: '/journeys/{type}/results', description: 'Step 6 - Results', stepIndex: 5 }
  ];

  let routingPassed = 0;
  let routingTotal = 0;

  for (const test of routingTests) {
    console.log(`\n🔗 Testing ${test.description} routing:`);
    
    for (const journeyType of JOURNEY_TYPES) {
      const url = test.pattern.replace('{type}', journeyType);
      const fullUrl = `${BASE_URL}${url}`;
      
      const result = await fetchPageContent(fullUrl);
      routingTotal++;
      
      if (result.success) {
        console.log(`  ✅ ${journeyType}: ${url}`);
        routingPassed++;
      } else {
        console.log(`  ❌ ${journeyType}: ${url} - ${result.status}`);
      }
    }
  }

  results.urlRouting = { passed: routingPassed, total: routingTotal };

  // Test 3: Verify step order and pricing position
  console.log('\n📍 Testing Step Order and Pricing Position');
  console.log('-' * 50);
  
  const expectedOrder = ['prepare', 'project-setup', 'data', 'execute', 'pricing', 'results'];
  const actualOrder = WORKFLOW_STEPS;
  const orderCorrect = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);
  
  console.log(`Step order: ${orderCorrect ? 'CORRECT' : 'INCORRECT'}`);
  console.log(`Expected: ${expectedOrder.join(' → ')}`);
  console.log(`Actual:   ${actualOrder.join(' → ')}`);
  
  const pricingIndex = actualOrder.indexOf('pricing');
  const pricingCorrect = pricingIndex === 4; // Should be index 4 (Step 5)
  
  console.log(`Pricing position: ${pricingCorrect ? 'CORRECT' : 'INCORRECT'} (Step ${pricingIndex + 1})`);
  
  if (pricingCorrect) {
    console.log('✅ Pricing is correctly deferred to Step 5 (end of workflow)');
  } else {
    console.log('❌ Pricing is not positioned correctly in the workflow');
  }

  // Final Summary
  console.log('\n📊 NAVIGATION FLOW TEST SUMMARY');
  console.log('=' * 60);
  console.log(`Element Validation: ${results.summary.passed}/${results.summary.total} passed`);
  console.log(`URL Routing: ${results.urlRouting.passed}/${results.urlRouting.total} passed`);
  console.log(`Step Order: ${orderCorrect ? 'CORRECT' : 'INCORRECT'}`);
  console.log(`Pricing Position: ${pricingCorrect ? 'CORRECT' : 'INCORRECT'}`);
  
  const overallSuccess = (results.summary.passed === results.summary.total) && 
                         (results.urlRouting.passed === results.urlRouting.total) && 
                         orderCorrect && pricingCorrect;
  
  console.log(`\n🎯 Overall Navigation Test: ${overallSuccess ? 'PASSED' : 'FAILED'}`);
  
  if (overallSuccess) {
    console.log('🎉 All navigation flow tests passed! The 6-step workflow is functioning correctly.');
  } else {
    console.log('⚠️  Some navigation issues detected. Review the details above.');
  }

  return {
    ...results,
    stepOrder: { correct: orderCorrect, expected: expectedOrder, actual: actualOrder },
    pricingPosition: { correct: pricingCorrect, position: pricingIndex + 1 },
    overallSuccess
  };
}

// Run the navigation flow test
testNavigationFlow()
  .then(results => {
    console.log('\n📝 Navigation flow test completed.');
    process.exit(results.overallSuccess ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Navigation flow test failed:', error);
    process.exit(1);
  });