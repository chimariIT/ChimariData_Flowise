/**
 * API Pipeline Validation Test
 *
 * This test directly validates backend fixes for the Question → Element → Transformation → Analysis chain
 * by calling API endpoints, bypassing the UI
 *
 * Tests:
 * 1. Priority 4: Element→Transformation semantic links
 * 2. Priority 5: Insight→Transformation semantic links
 * 3. Priority 6: Intent analysis connection to execution
 * 4. Business context application in transformations
 * 5. Complete evidence chain verification
 */

import { test, expect, chromium } from '@playwright/test';

// API base URL
const API_BASE = 'http://localhost:5000/api';

// Test data - we'll create a test project
const TEST_DATA = {
  projectName: 'API Pipeline Validation',
  description: 'Direct API test of Q→E→T→A chain fixes',
  goals: 'Validate all priority fixes through direct API calls',
  questions: [
    'What are the overall engagement trends over time?',
    'How does engagement vary by department?',
    'Which factors are most strongly correlated with engagement?'
  ],
  audience: 'Technical Leadership',
  industry: 'Technology'
};

// Helper to make API calls
async function apiCall(endpoint: string, method: string = 'GET', body?: any) => {
  const url = `${API_BASE}${endpoint}`;
  console.log(`API Call: ${method} ${url}`);

  const options: {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
};

// Helper to check if server is ready
async function waitForServer(maxAttempts: number = 30, intervalMs: number = 2000) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        console.log(`Server is ready (attempt ${i + 1}/${maxAttempts})`);
        return true;
      }
    } catch (err) {
      console.log(`Server check ${i + 1}/${maxAttempts}: ${err.message}`);
    }
  }

  if (i < maxAttempts - 1) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  return false;
};

describe('API Pipeline Validation', () => {
  let projectId: string | null = null;

  test.beforeAll(async () => {
    console.log('Starting API Pipeline Validation test...');
  });

  test.afterAll(async () => {
    console.log('Test cleanup...');
  });

  test('1. Priority 4: Element→Transformation semantic links', async () => {
    console.log('Test 1: Priority 4 - Element→Transformation semantic links');

    // Create a test project
    console.log('  → Step 1: Creating test project...');
    const createProject = await apiCall('/projects', 'POST', {
      name: TEST_DATA.projectName,
      description: TEST_DATA.description,
      goals: TEST_DATA.goals,
      industry: TEST_DATA.industry,
      audience: TEST_DATA.audience
    });

    expect(createProject.success).toBe(true);
    expect(createProject.project).toBeDefined();
    projectId = createProject.project.id;
    console.log(`  Project created: ${projectId}`);

    // Add questions
    console.log('  → Step 2: Adding questions...');
    const updateProject = await apiCall(`/projects/${projectId}/requirements`, 'PUT', {
      businessQuestions: TEST_DATA.questions.join('\n'),
      goals: TEST_DATA.goals,
      audience: TEST_DATA.audience
    });

    expect(updateProject.success).toBe(true);
    console.log('  Questions added');

    // Simulate transformation execution to trigger Priority 4 fix
    // In real flow, transformations create the links
    // For test, we'll just wait and check
    console.log('  → Step 3: Waiting for transformations (Priority 4)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check journeyProgress for Priority 4 fix
    console.log('  → Checking journeyProgress for Priority 4 fix...');
    const getProject = await apiCall(`/projects/${projectId}`, 'GET');
    const journeyProgress = getProject.project?.journeyProgress || {};

    const elementTransformationLinks = journeyProgress.elementTransformationLinks || 0;
    console.log(`   elementTransformationLinks: ${elementTransformationLinks}`);

    if (elementTransformationLinks > 0) {
      console.log('  Priority 4 PASS: Element→Transformation links created');
    } else {
      console.log('  Priority 4 FAIL: No Element→Transformation links found');
    }

    expect(elementTransformationLinks).toBeGreaterThan(0);
  });

  test('2. Priority 5: Insight→Transformation semantic links', async () => {
    console.log('Test 2: Priority 5 - Insight→Transformation semantic links');

    // Check journeyProgress for Priority 5 fix
    console.log('  → Checking journeyProgress for Priority 5 fix...');
    const getProject = await apiCall(`/projects/${projectId}`, 'GET');
    const journeyProgress = getProject.project?.journeyProgress || {};

    const insightTransformationLinks = journeyProgress.insightTransformationLinks || 0;
    console.log(`   insightTransformationLinks: ${insightTransformationLinks}`);

    if (insightTransformationLinks > 0) {
      console.log('  Priority 5 PASS: Insight→Transformation links created');
    } else {
      console.log('  Priority 5 FAIL: No Insight→Transformation links found');
    }

    expect(insightTransformationLinks).toBeGreaterThan(0);
  });

  test('3. Priority 6: Intent analysis connection to execution', async () => {
    console.log('Test 3: Priority 6 - Intent analysis connection to execution');

    // Add question intents (simulates Question Intent Analyzer)
    console.log('  → Step 1: Adding question intents...');

    const updateWithIntents = await apiCall(`/projects/${projectId}/requirements`, 'PUT', {
      questionIntents: [
        {
          questionText: TEST_DATA.questions[0],
          intentType: 'time_series',
          confidence: 0.9,
          recommendedAnalysisTypes: ['descriptive_stats']
        },
        {
          questionText: TEST_DATA.questions[1],
          intentType: 'comparative',
          confidence: 0.85,
          recommendedAnalysisTypes: ['comparative_analysis', 'correlation_analysis']
        },
        {
          questionText: TEST_DATA.questions[2],
          intentType: 'correlation',
          confidence: 0.95,
          recommendedAnalysisTypes: ['correlation_analysis']
        }
      ]
    });

    expect(updateWithIntents.success).toBe(true);
    console.log('  Question intents added');

    // Verify intents were saved
    const getProject = await apiCall(`/projects/${projectId}`, 'GET');
    const journeyProgress = getProject.project?.journeyProgress || {};

    const questionIntents = journeyProgress.questionIntents || [];
    console.log(`   questionIntents count: ${questionIntents.length}`);

    expect(questionIntents.length).toBe(3);
    console.log('  Priority 6 PASS: Question intents loaded and available for filtering');
  });

  test('4. Evidence Chain - Complete validation', async () => {
    console.log('Test 4: Evidence Chain - Complete validation');

    // Query semantic links to verify all link types exist
    console.log('  → Checking semantic links for all types...');

    const questionElementResponse = await apiCall('/semantic/links?linkType=question_element', 'GET');
    const elementTransformResponse = await apiCall('/semantic/links?linkType=element_to_transformation', 'GET');
    const transformInsightResponse = await apiCall('/semantic/links?linkType=transformation_insight', 'GET');

    expect(questionElementResponse.success).toBe(true);
    expect(elementTransformResponse.success).toBe(true);
    expect(transformInsightResponse.success).toBe(true);

    const questionElementLinks = questionElementResponse.links?.length || 0;
    const elementTransformLinks = elementTransformResponse.links?.length || 0;
    const transformInsightLinks = transformInsightResponse.links?.length || 0;

    console.log(`   question_element links: ${questionElementLinks}`);
    console.log(`   element_to_transformation links: ${elementTransformLinks}`);
    console.log(`   transformation_insight links: ${transformInsightLinks}`);

    const evidenceChainComplete =
      questionElementLinks > 0 &&
      elementTransformLinks > 0 &&
      transformInsightLinks > 0;

    console.log(`   Evidence chain complete: ${evidenceChainComplete ? 'YES' : 'NO'}`);

    expect(evidenceChainComplete).toBe(true);
    console.log(`   Evidence chain summary:`);
    console.log(`     Questions → Elements: ${questionElementLinks} links`);
    console.log(`     Elements → Transformations: ${elementTransformLinks} links`);
    console.log(`     Transformations → Insights: ${transformInsightLinks} links`);
    console.log(`     Evidence chain complete: ${evidenceChainComplete ? 'YES' : 'NO'}`);
  });

  test('5. Business Context - Verify definitions are applied', async () => {
    console.log('Test 5: Business Context - Verify definitions are applied');

    const getProject = await apiCall(`/projects/${projectId}`, 'GET');
    const journeyProgress = getProject.project?.journeyProgress || {};
    const reqDoc = journeyProgress.requirementsDocument || {};

    const hasBusinessDefinitions = reqDoc.requiredDataElements?.some((el: any) => {
      return el.calculationDefinition?.formula?.businessDescription ||
             el.calculationDefinition?.formula?.pseudoCode;
    });

    console.log(`   Has business definitions: ${hasBusinessDefinitions}`);

    if (hasBusinessDefinitions) {
      console.log('  Business context PASS: Definitions present in requirementsDocument');
    } else {
      console.log('  Business context FAIL: No business definitions found');
    }

    expect(hasBusinessDefinitions).toBe(true);
  });

  test('6. Cleanup - Delete test project', async () => {
    console.log('Test 6: Cleanup - Delete test project');

    if (projectId) {
      console.log(`  → Deleting test project: ${projectId}...`);
      const deleteResponse = await apiCall(`/projects/${projectId}`, 'DELETE');

      expect(deleteResponse.success).toBe(true);
      console.log('  Test project deleted');
    } else {
      console.log('  → No project to delete (or already cleaned)');
    }
  });
});
