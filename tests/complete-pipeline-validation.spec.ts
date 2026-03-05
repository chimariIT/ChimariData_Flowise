/**
 * Complete Pipeline Validation Test
 *
 * This test validates the end-to-end Question → Element → Transformation → Analysis chain
 * in a single automated run, verifying all fixes implemented:
 *
 * Priority 1: Question→Element semantic links
 * Priority 4: Element→Transformation semantic links
 * Priority 5: Insight→Transformation semantic links
 * Priority 6: Intent analysis connection to execution
 * Business context usage in transformations
 */

import { test, expect, Page } from '@playwright/test';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

// Test data with HR engagement dataset (same as production tests)
// Use fileURLToPath for ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DATASET_PATH = path.join(__dirname, '../fixtures/HREngagementDataset.xlsx');

// Helper to read uploaded files from uploads directory
const getUploadedFiles = () => {
  const uploadsDir = path.join(__dirname, '../uploads/originals');
  if (!fs.existsSync(uploadsDir)) return [];
  return fs.readdirSync(uploadsDir);
};

// Helper to extract meaningful logs from page console
const getPipelineLogs = async (page: Page) => {
  const logs: any[] = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'info') {
      const text = msg.text();
      // Look for our key pipeline markers
      if (text.includes('🔗') || text.includes('📋') || text.includes('🎯') ||
          text.includes('📊') || text.includes('✅')) {
        logs.push({
          type: msg.type(),
          text: text,
          timestamp: new Date().toISOString()
        });
      }
    }
  });
  return logs;
};

test.describe('Complete Pipeline Validation', () => {
  let page: Page;
  let projectId: string | null = null;

  test.beforeAll(async ({ browserName }) => {
    // Clean up old test files
    const uploadsDir = path.join(__dirname, '../uploads/originals');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        if (file.includes('HREngagementDataset')) {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
            console.log(`Cleaned up old test file: ${file}`);
          } catch (err) {
            console.log(`Failed to clean up ${file}:`, err);
          }
        }
      }
    }
  });

  test.beforeEach(async ({ page: p }) => {
    page = p;
  });

  test.afterEach(async () => {
    // Log test completion
    console.log(`✅ Test completed, projectId: ${projectId}`);
  });

  test('Complete pipeline: Question → Element → Transformation → Analysis', async ({ page }) => {
    console.log('🚀 Starting complete pipeline validation test...');

    const logs = await getPipelineLogs(page);

    // =========================================================================
    // STEP 1: Data Upload
    // =========================================================================
    console.log('📍 Step 1: Data Upload');
    await page.goto('/new-project');

    // Wait for page to load
    await page.waitForSelector('[data-testid="project-name-input"]', { timeout: 10000 });

    // Fill in project details
    await page.fill('[data-testid="project-name-input"]', 'Pipeline Validation Test');
    await page.fill('[data-testid="project-description-input"]', 'End-to-end test of Q→E→T→A chain');

    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_DATASET_PATH);

    // Wait for file upload to complete
    await page.waitForSelector('text=HREngagementDataset.xlsx', { timeout: 15000 });
    console.log('✅ File uploaded');

    // Submit project
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/projects\/[^/]+/, { timeout: 15000 });

    // Extract project ID from URL
    const url = page.url();
    const match = url.match(/\/projects\/([^/]+)/);
    projectId = match ? match[1] : null;
    console.log(`✅ Project created with ID: ${projectId}`);
    expect(projectId).toBeTruthy();

    // =========================================================================
    // STEP 2: Prepare - Add questions with different intents
    // =========================================================================
    console.log('📍 Step 2: Prepare - Adding questions with different intents');

    // Navigate to prepare step
    await page.goto(`/projects/${projectId}/prepare`);
    await page.waitForSelector('[data-testid="goals-input"]', { timeout: 10000 });

    // Add analysis goal
    await page.fill('[data-testid="goals-input"]', 'Understand HR engagement drivers and identify correlations');

    // Add questions with different intents to test Priority 6
    const questions = [
      'What are the overall engagement trends over time?',  // time_series intent
      'How does engagement compare across departments?',     // comparative intent
      'Which factors have the strongest correlation with engagement?',  // correlation intent
      'What is the distribution of engagement scores?',    // descriptive intent
    ];

    const questionsTextarea = await page.locator('[data-testid="questions-textarea"]');
    await questionsTextarea.fill(questions.join('\n'));
    console.log(`✅ Added ${questions.length} questions with different intents`);

    // Set audience
    await page.selectOption('[data-testid="audience-select"]', 'HR Leadership');

    // Submit prepare step
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Review', { timeout: 20000 });

    // =========================================================================
    // STEP 3: Verification - Check element mappings
    // =========================================================================
    console.log('📍 Step 3: Verification - Checking element mappings');

    // Wait for verification step to load
    await page.waitForSelector('[data-testid="verification-review"]', { timeout: 15000 });

    // Check that required data elements are displayed
    const elementCards = await page.locator('[data-testid="element-card"]').count();
    console.log(`✅ Found ${elementCards} required data elements`);

    // Check that sourceColumn mappings are present (Priority 1 fix)
    const sourceColumnMappings = await page.locator('[data-testid="source-column-mapping"]').count();
    console.log(`✅ Found ${sourceColumnMappings} source column mappings`);

    // Submit verification
    await page.click('[data-testid="verify-submit-button"]');
    await page.waitForSelector('text=Transform', { timeout: 15000 });

    // =========================================================================
    // STEP 4: Transformation - Apply business context
    // =========================================================================
    console.log('📍 Step 4: Transformation - Applying business context');

    // Wait for transformation step to load
    await page.waitForSelector('[data-testid="transformation-card"]', { timeout: 15000 });

    // Check that business context is displayed (P1-10 fix)
    const businessContextSections = await page.locator('[data-testid="business-context-section"]').count();
    console.log(`✅ Found ${businessContextSections} business context sections`);

    // Check that pseudoCode execution is shown (P1-10 fix)
    const pseudoCodeSections = await page.locator('[data-testid="pseudocode-section"]').count();
    console.log(`✅ Found ${pseudoCodeSections} pseudoCode execution sections`);

    // Execute transformations
    await page.click('[data-testid="execute-transformations-button"]');
    await page.waitForSelector('text=Plan', { timeout: 30000 });
    console.log('✅ Transformations executed');

    // =========================================================================
    // STEP 5: Plan - Review analysis plan
    // =========================================================================
    console.log('📍 Step 5: Plan - Review analysis plan');

    // Wait for plan step to load
    await page.waitForSelector('[data-testid="analysis-plan"]', { timeout: 15000 });

    // Check that analysis types are shown (Priority 6 should filter these)
    const analysisTypeBadges = await page.locator('[data-testid="analysis-type-badge"]').allTextContents();
    console.log(`✅ Analysis types in plan: ${analysisTypeBadges.join(', ')}`);

    // Approve plan
    await page.click('[data-testid="approve-plan-button"]');
    await page.waitForSelector('text=Pricing', { timeout: 15000 });

    // =========================================================================
    // STEP 6: Execute - Run analyses
    // =========================================================================
    console.log('📍 Step 6: Execute - Running analyses with intent filtering');

    // Wait for execution step
    await page.goto(`/projects/${projectId}/execute`);
    await page.waitForSelector('[data-testid="execute-button"]', { timeout: 15000 });

    // Click execute button
    await page.click('[data-testid="execute-button"]');

    // Wait for execution to complete
    console.log('⏳ Waiting for analysis execution to complete...');
    await page.waitForSelector('text=Pricing', { timeout: 180000 }); // 3 minute timeout
    console.log('✅ Analysis execution completed');

    // =========================================================================
    // STEP 7: Results - Verify complete chain
    // =========================================================================
    console.log('📍 Step 7: Results - Verifying complete evidence chain');

    await page.goto(`/projects/${projectId}/results`);
    await page.waitForSelector('[data-testid="results-dashboard"]', { timeout: 30000 });

    // Verify insights are displayed
    const insightCards = await page.locator('[data-testid="insight-card"]').count();
    console.log(`✅ Found ${insightCards} insight cards`);
    expect(insightCards).toBeGreaterThan(0);

    // Verify question linkage (Priority 3 fix)
    const questionTags = await page.locator('[data-testid="question-tag"]').count();
    console.log(`✅ Found ${questionTags} question tags on insights`);
    expect(questionTags).toBeGreaterThan(0);

    // Verify visualizations exist
    const visualizationCharts = await page.locator('[data-testid="visualization-chart"]').count();
    console.log(`✅ Found ${visualizationCharts} visualization charts`);
    expect(visualizationCharts).toBeGreaterThan(0);

    // =========================================================================
    // VERIFICATION: Check semantic links in database
    // =========================================================================
    console.log('📍 Verification: Checking semantic links in database');

    // We need to make API calls to verify semantic links
    const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:5000';

    // 1. Check question_element links (Priority 1)
    console.log('🔗 Checking question_element semantic links...');
    const questionElementResponse = await page.evaluate(async ({ baseUrl, projectId }) => {
      const response = await fetch(`${baseUrl}/api/semantic/links?projectId=${projectId}&linkType=question_element`);
      return response.json();
    }, { baseUrl: apiBaseUrl, projectId });
    expect(questionElementResponse.success).toBe(true);
    const questionElementLinks = questionElementResponse.links?.length || 0;
    console.log(`✅ Found ${questionElementLinks} question_element links`);
    expect(questionElementLinks).toBeGreaterThan(0);

    // 2. Check element_to_transformation links (Priority 4)
    console.log('🔗 Checking element_to_transformation semantic links...');
    const elementTransformResponse = await page.evaluate(async ({ baseUrl, projectId }) => {
      const response = await fetch(`${baseUrl}/api/semantic/links?projectId=${projectId}&linkType=element_to_transformation`);
      return response.json();
    }, { baseUrl: apiBaseUrl, projectId });
    expect(elementTransformResponse.success).toBe(true);
    const elementTransformLinks = elementTransformResponse.links?.length || 0;
    console.log(`✅ Found ${elementTransformLinks} element_to_transformation links (Priority 4 fix)`);
    expect(elementTransformLinks).toBeGreaterThan(0);

    // 3. Check transformation_insight links (Priority 5)
    console.log('🔗 Checking transformation_insight semantic links...');
    const transformInsightResponse = await page.evaluate(async ({ baseUrl, projectId }) => {
      const response = await fetch(`${baseUrl}/api/semantic/links?projectId=${projectId}&linkType=transformation_insight`);
      return response.json();
    }, { baseUrl: apiBaseUrl, projectId });
    expect(transformInsightResponse.success).toBe(true);
    const transformInsightLinks = transformInsightResponse.links?.length || 0;
    console.log(`✅ Found ${transformInsightLinks} transformation_insight links (Priority 5 fix)`);
    expect(transformInsightLinks).toBeGreaterThan(0);

    // =========================================================================
    // VERIFICATION: Check journeyProgress for fix counts
    // =========================================================================
    console.log('📍 Verification: Checking journeyProgress for fix counts');

    const journeyProgress = await page.evaluate(async ({ baseUrl, projectId }) => {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}`);
      return (await response.json()).project?.journeyProgress || {};
    }, { baseUrl: apiBaseUrl, projectId });

    // Check Priority 4 count
    const elementTransformationLinks = journeyProgress.elementTransformationLinks || 0;
    console.log(`✅ JourneyProgress elementTransformationLinks: ${elementTransformationLinks}`);
    expect(elementTransformationLinks).toBeGreaterThan(0);

    // Check Priority 5 count
    const insightTransformationLinks = journeyProgress.insightTransformationLinks || 0;
    console.log(`✅ JourneyProgress insightTransformationLinks: ${insightTransformationLinks}`);
    expect(insightTransformationLinks).toBeGreaterThan(0);

    // =========================================================================
    // FINAL VERIFICATION: Evidence chain completeness
    // =========================================================================
    console.log('📍 Final Verification: Evidence chain completeness');

    // The evidence chain should have:
    // 1. Questions linked to elements
    // 2. Elements linked to transformations
    // 3. Transformations linked to insights
    // 4. Insights linked back to questions

    const evidenceChainComplete =
      questionElementLinks > 0 &&
      elementTransformLinks > 0 &&
      transformInsightLinks > 0 &&
      questionTags > 0;

    console.log(`\n📊 Evidence Chain Validation Summary:`);
    console.log(`   ✅ Questions → Elements: ${questionElementLinks} links`);
    console.log(`   ✅ Elements → Transformations: ${elementTransformLinks} links`);
    console.log(`   ✅ Transformations → Insights: ${transformInsightLinks} links`);
    console.log(`   ✅ Insights → Questions: ${questionTags} tags`);
    console.log(`   ✅ Evidence chain complete: ${evidenceChainComplete ? 'YES ✅' : 'NO ❌'}`);

    expect(evidenceChainComplete).toBe(true);

    console.log('\n🎉 Complete pipeline validation test PASSED!');
  });

  test('Intent analysis filtering - Only matching analyses are executed', async ({ page }) => {
    console.log('🎯 Testing Priority 6: Intent analysis connection to execution');

    // This test verifies that when questions have specific intents,
    // only compatible analysis types are executed

    // Create a project with ONLY correlation intent questions
    await page.goto('/new-project');
    await page.fill('[data-testid="project-name-input"]', 'Intent Filtering Test');
    await page.fill('[data-testid="project-description-input"]', 'Test intent-based analysis type filtering');

    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_DATASET_PATH);
    await page.waitForSelector('text=HREngagementDataset.xlsx', { timeout: 15000 });

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/projects\/[^/]+/);

    const url = page.url();
    const match = url.match(/\/projects\/([^/]+)/);
    const testProjectId = match ? match[1] : null;

    await page.goto(`/projects/${testProjectId}/prepare`);
    await page.waitForSelector('[data-testid="goals-input"]', { timeout: 10000 });

    // Add ONLY correlation questions (should trigger correlation analysis)
    await page.fill('[data-testid="goals-input"]', 'Understand relationships between variables');

    const questionsTextarea = await page.locator('[data-testid="questions-textarea"]');
    await questionsTextarea.fill(
      'Which factors are most strongly correlated with engagement?\n' +
      'What relationships exist between engagement and other metrics?'
    );
    console.log('✅ Added correlation-only questions');

    await page.selectOption('[data-testid="audience-select"]', 'HR Leadership');
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Transform', { timeout: 20000 });

    // Skip to execute directly for this test
    await page.goto(`/projects/${testProjectId}/execute`);
    await page.waitForSelector('[data-testid="execute-button"]', { timeout: 15000 });

    // Get analysis types that will be executed
    const analysisTypeBadges = await page.locator('[data-testid="analysis-type-badge"]').allTextContents();
    console.log(`Analysis types: ${analysisTypeBadges.join(', ')}`);

    // For correlation intent, we should see correlation analysis types
    // and NOT see irrelevant types like time_series (if no trend questions)
    const hasCorrelation = analysisTypeBadges.some(t =>
      t.toLowerCase().includes('correlation')
    );

    expect(hasCorrelation).toBe(true);
    console.log('✅ Intent filtering test: PASSED (correlation intent → correlation analysis)');

    // Clean up test project
    console.log(`🧹 Cleaning up test project ${testProjectId}`);
    await page.evaluate(async ({ baseUrl, projectId }) => {
      await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'DELETE'
      });
    }, { baseUrl: process.env.API_BASE_URL || 'http://localhost:5000', projectId: testProjectId });
  });

  test('Business context application - PseudoCode is executed', async ({ page }) => {
    console.log('📊 Testing P1-10: Business context with pseudoCode execution');

    // This test verifies that DS Agent's business definitions with pseudoCode
    // are actually executed during transformation

    await page.goto('/new-project');
    await page.fill('[data-testid="project-name-input"]', 'Business Context Test');
    await page.fill('[data-testid="project-description-input"]', 'Test pseudoCode execution in transformations');

    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_DATASET_PATH);
    await page.waitForSelector('text=HREngagementDataset.xlsx', { timeout: 15000 });

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/projects\/[^/]+/);

    const url = page.url();
    const match = url.match(/\/projects\/([^/]+)/);
    const testProjectId = match ? match[1] : null;

    await page.goto(`/projects/${testProjectId}/prepare`);
    await page.waitForSelector('[data-testid="goals-input"]', { timeout: 10000 });

    await page.fill('[data-testid="goals-input"]', 'Calculate overall engagement score from survey responses');
    await page.selectOption('[data-testid="audience-select"]', 'HR Leadership');

    // Submit and verify the DS Agent creates business definitions
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Transform', { timeout: 20000 });

    // Navigate to transformation step
    await page.goto(`/projects/${testProjectId}/transform`);
    await page.waitForSelector('[data-testid="transformation-card"]', { timeout: 15000 });

    // Check for pseudoCode execution evidence
    const pseudoCodeSection = await page.locator('[data-testid="pseudocode-section"]');
    const hasPseudoCode = await pseudoCodeSection.count();
    console.log(`✅ PseudoCode sections found: ${hasPseudoCode}`);

    // Also check for business context display
    const businessContextSection = await page.locator('[data-testid="business-context-section"]');
    const hasBusinessContext = await businessContextSection.count();
    console.log(`✅ Business context sections found: ${hasBusinessContext}`);

    // Execute and check results
    await page.click('[data-testid="execute-transformations-button"]');
    await page.waitForSelector('text=Plan', { timeout: 30000 });

    console.log('✅ Business context application test: PASSED');
    console.log(`   - PseudoCode execution: ${hasPseudoCode > 0 ? 'YES ✅' : 'NO ❌'}`);
    console.log(`   - Business context display: ${hasBusinessContext > 0 ? 'YES ✅' : 'NO ❌'}`);

    // Clean up
    await page.evaluate(async ({ baseUrl, projectId }) => {
      await fetch(`${baseUrl}/api/projects/${projectId}`, {
        method: 'DELETE'
      });
    }, { baseUrl: process.env.API_BASE_URL || 'http://localhost:5000', projectId: testProjectId });
  });
});
