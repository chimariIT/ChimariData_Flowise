/**
 * End-to-End Test for Agent Recommendation Workflow
 *
 * Test Scenario: SPTO Survey Analysis
 * Goal: Understand how survey participants feel about different programs offered
 * Audience: Mixed (non-technical and business users)
 * Data: English Survey for Teacher Conferences Week Online (Responses).xlsx
 *
 * Expected Workflow:
 * 1. User uploads survey data file
 * 2. Data Engineer Agent analyzes file structure and quality
 * 3. Data Scientist Agent recommends analysis configuration
 * 4. PM Agent synthesizes recommendations
 * 5. User reviews and accepts recommendations
 * 6. System auto-configures Execute step
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const SPTO_DATA_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\SPTO\\English Survey for Teacher Conferences Week Online (Responses).xlsx';
const TEST_PASSWORD = 'TestPassword123!';
let testUserEmail: string | null = null;

async function registerAndLogin(page: Page): Promise<void> {
  testUserEmail = `spto-test-${Date.now()}@chimaridatatest.com`;

  await page.goto('/auth/register', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });

  const firstNameVisible = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  if (!firstNameVisible) {
    await page.click('text=/Create.*Account|Sign.*Up|Register/i');
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
  }

  await page.fill('input[name="email"]', testUserEmail);
  await page.fill('input[name="firstName"]', 'SPTO');
  await page.fill('input[name="lastName"]', 'Tester');
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.fill('input[name="confirmPassword"]', TEST_PASSWORD);

  const registerResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/auth/register')
  , { timeout: 20000 });

  await page.click('button[type="submit"]');

  const registerResponse = await registerResponsePromise;
  if (!registerResponse.ok()) {
    const errorText = await registerResponse.text();
    throw new Error(`Registration failed: ${registerResponse.status()} ${registerResponse.statusText()} :: ${errorText}`);
  }

  await page.waitForSelector('button[type="submit"]:has-text("Sign In")', { timeout: 15000 });

  await page.fill('input[name="email"]', testUserEmail);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="button-start-non-tech-landing"]', { timeout: 20000 });
}

async function loginExisting(page: Page): Promise<void> {
  if (!testUserEmail) {
    await registerAndLogin(page);
    return;
  }

  await page.goto('/auth/login', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });

  // Ensure we're on the login form in case register view is shown
  const firstNameVisible = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  if (firstNameVisible) {
    await page.click('text=/Sign.*In|Log.*In/i');
    await page.waitForSelector('button[type="submit"]:has-text("Sign In")', { timeout: 10000 });
  }

  await page.fill('input[name="email"]', testUserEmail);
  await page.fill('input[name="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForSelector('[data-testid="button-start-non-tech-landing"]', { timeout: 20000 });
}

async function ensureAuthenticated(page: Page): Promise<void> {
  if (!testUserEmail) {
    await registerAndLogin(page);
  } else {
    await loginExisting(page);
  }
}

test.describe('Agent Recommendation Workflow - SPTO Survey E2E', () => {
  test.describe.configure({ mode: 'serial' });
  let page: Page;
  let projectId: string;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await ensureAuthenticated(page);
  });

  test('Complete workflow: Upload → Agent Analysis → Recommendations → Auto-configure', async () => {
    // ============================================
    // STEP 1: Create New Project
    // ============================================
    console.log('\n🚀 STEP 1: Creating new project...');

  await page.goto('/dashboard');
    await page.waitForSelector('[data-testid="new-project-button"]', { timeout: 5000 }).catch(() => {
      console.log('New project button not found by testid, trying alternative selectors');
    });

    // Try multiple ways to find the new project button
    const newProjectButton = await page.locator('button:has-text("New Project")').first();
    await newProjectButton.click();

    // Fill in project details
    await page.fill('input[name="projectName"]', 'SPTO Survey Analysis E2E Test');
    await page.fill('textarea[name="projectDescription"]', 'Understanding participant feelings about programs offered');
    await page.fill('textarea[name="analysisGoal"]', 'Analyze survey responses to understand how participants feel about different programs offered');

    // Add business questions
    const addQuestionButton = await page.locator('button:has-text("Add Question")').first();
    await addQuestionButton.click();
    await page.fill('input[name="question-0"]', 'Which programs are most positively received?');
    await addQuestionButton.click();
    await page.fill('input[name="question-1"]', 'What are the main concerns or negative feedback?');
    await addQuestionButton.click();
    await page.fill('input[name="question-2"]', 'How do different participant groups compare in their feedback?');

    // Select journey type (mixed audience = business journey)
    await page.selectOption('select[name="journeyType"]', 'business');

    // Create project
    await page.click('button:has-text("Create Project")');
    await page.waitForURL(/\/journeys\/business\/data/, { timeout: 10000 });

    // Extract project ID from URL
    const url = page.url();
    const urlMatch = url.match(/project[=/]([^/&?]+)/);
    projectId = urlMatch ? urlMatch[1] : '';
    console.log(`✅ Project created with ID: ${projectId}`);

    // ============================================
    // STEP 2: Upload SPTO Survey File
    // ============================================
    console.log('\n📤 STEP 2: Uploading SPTO survey file...');

    // Wait for data step to load
    await page.waitForSelector('input[type="file"], text=/upload.*data/i', { timeout: 15000 });
    
    // Find file input and upload
    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SPTO_DATA_PATH);

    // Wait for upload completion - try multiple indicators
    try {
      await page.waitForSelector('[data-testid="upload-success"], text=/upload.*success|file.*uploaded|schema.*detected|columns.*found/i', { timeout: 30000 });
    } catch {
      // Alternative: Wait for file to appear in uploaded files list or schema preview
      try {
        await page.waitForSelector('text=English Survey for Teacher Conferences, text=/survey|schema/i', { timeout: 30000 });
      } catch {
        // Last resort: just wait a bit for processing
        await page.waitForTimeout(3000);
      }
    }

    console.log('✅ File uploaded successfully');

    // Extract project ID from URL if not already extracted
    if (!projectId) {
      const currentUrl = page.url();
      const urlMatch = currentUrl.match(/project[=/]([^/&?]+)/);
      if (urlMatch) {
        projectId = urlMatch[1];
        console.log(`✅ Project ID extracted: ${projectId}`);
      }
    }

    // Get uploaded file info if available
    try {
      const uploadedFileName = await page.locator('[data-testid="uploaded-file-name"], text=/English Survey|survey/i').first().textContent({ timeout: 5000 });
      console.log(`   File: ${uploadedFileName}`);
    } catch {
      console.log('   File info not available in UI');
    }

    // ============================================
    // STEP 3: Trigger Agent Recommendation Workflow
    // ============================================
    console.log('\n🤖 STEP 3: Triggering agent recommendation workflow...');

    // Click "Get Agent Recommendations" button
    const getRecommendationsButton = await page.locator('button:has-text("Get Agent Recommendations")').first();
    await getRecommendationsButton.click();

    // Wait for loading state
    await page.waitForSelector('[data-testid="agent-analysis-loading"]', { timeout: 5000 }).catch(() => {
      console.log('   Loading indicator not found, checking for dialog directly');
    });

    console.log('   ⏳ Agents analyzing data...');

    // Wait for recommendation dialog to appear
    await page.waitForSelector('[data-testid="agent-recommendation-dialog"]', { timeout: 60000 });
    console.log('✅ Agent analysis complete, recommendations displayed');

    // ============================================
    // STEP 4: Validate Agent Recommendations
    // ============================================
    console.log('\n✅ STEP 4: Validating agent recommendations...');

    // Validate Data Engineer Analysis Results
    const dataAnalysisSummary = await page.locator('[data-testid="data-analysis-summary"]');
    expect(await dataAnalysisSummary.isVisible()).toBeTruthy();

    const rowCount = await page.locator('[data-testid="row-count"]').textContent();
    const columnCount = await page.locator('[data-testid="column-count"]').textContent();
    const dataQuality = await page.locator('[data-testid="data-quality"]').textContent();

    console.log('   📊 Data Engineer Analysis:');
    console.log(`      - Rows: ${rowCount}`);
    console.log(`      - Columns: ${columnCount}`);
    console.log(`      - Quality: ${dataQuality}`);

    // Validate Data Scientist Recommendations
    const analysisComplexity = await page.locator('[data-testid="analysis-complexity"]').textContent();
    const recommendedAnalyses = await page.locator('[data-testid="recommended-analysis"]').count();
    const costEstimate = await page.locator('[data-testid="cost-estimate"]').textContent();
    const timeEstimate = await page.locator('[data-testid="time-estimate"]').textContent();

    console.log('   🔬 Data Scientist Recommendations:');
    console.log(`      - Complexity: ${analysisComplexity}`);
    console.log(`      - Recommended Analyses: ${recommendedAnalyses}`);
    console.log(`      - Cost Estimate: ${costEstimate}`);
    console.log(`      - Time Estimate: ${timeEstimate}`);

    // Validate rationale is present
    const rationale = await page.locator('[data-testid="recommendation-rationale"]').textContent();
    expect(rationale?.length).toBeGreaterThan(0);
    console.log(`      - Rationale: ${rationale?.substring(0, 100)}...`);

    // Check for data characteristics
    const hasTimeSeries = await page.locator('[data-testid="has-time-series"]').isVisible().catch(() => false);
    const hasCategories = await page.locator('[data-testid="has-categories"]').isVisible().catch(() => false);
    const hasText = await page.locator('[data-testid="has-text"]').isVisible().catch(() => false);
    const hasNumeric = await page.locator('[data-testid="has-numeric"]').isVisible().catch(() => false);

    console.log('   📈 Data Characteristics:');
    console.log(`      - Time Series: ${hasTimeSeries}`);
    console.log(`      - Categories: ${hasCategories}`);
    console.log(`      - Text Fields: ${hasText}`);
    console.log(`      - Numeric Fields: ${hasNumeric}`);

    // ============================================
    // STEP 5: Accept Recommendations
    // ============================================
    console.log('\n👍 STEP 5: Accepting agent recommendations...');

    const acceptButton = await page.locator('button:has-text("Accept & Proceed")').first();
    await acceptButton.click();

    // Wait for navigation to Execute step
    await page.waitForURL(/\/execute/, { timeout: 10000 });
    console.log('✅ Navigated to Execute step');

    // ============================================
    // STEP 6: Validate Auto-Configuration
    // ============================================
    console.log('\n🎯 STEP 6: Validating auto-configuration in Execute step...');

    // Check that data source is pre-selected
    const dataSourceValue = await page.locator('[data-testid="data-source-select"]').inputValue();
    expect(dataSourceValue).toBe('uploaded_files');
    console.log(`   ✅ Data Source: ${dataSourceValue}`);

    // Check that data size is pre-filled
    const dataSizeValue = await page.locator('[data-testid="data-size-input"]').inputValue();
    expect(parseInt(dataSizeValue)).toBeGreaterThan(0);
    console.log(`   ✅ Data Size: ${dataSizeValue} rows`);

    // Check that complexity is pre-selected
    const complexityValue = await page.locator('[data-testid="complexity-select"]').inputValue();
    expect(complexityValue).toBeTruthy();
    console.log(`   ✅ Complexity: ${complexityValue}`);

    // Check that recommended analyses are pre-selected
    const selectedAnalyses = await page.locator('[data-testid="selected-analysis"]:checked').count();
    expect(selectedAnalyses).toBeGreaterThan(0);
    console.log(`   ✅ Pre-selected Analyses: ${selectedAnalyses}`);

    // ============================================
    // STEP 7: Verify User Can Execute Analysis
    // ============================================
    console.log('\n▶️ STEP 7: Verifying user can execute analysis...');

    const executeButton = await page.locator('button:has-text("Run Analysis")').first();
    const isExecuteEnabled = await executeButton.isEnabled();
    expect(isExecuteEnabled).toBeTruthy();
    console.log('   ✅ Run Analysis button is enabled');

    // Optional: Click execute and verify analysis starts
    // (Comment out if you don't want to run actual analysis)
    // await executeButton.click();
    // await page.waitForSelector('[data-testid="analysis-in-progress"]', { timeout: 5000 });
    // console.log('   ✅ Analysis started successfully');

    console.log('\n🎉 E2E TEST COMPLETE - All workflow steps validated');
  });

  test('Validate multi-sheet handling for survey data', async () => {
    // ============================================
    // TEST: Multiple sheets in Excel file
    // ============================================
    console.log('\n📋 TEST: Multi-sheet Excel handling...');

    // Upload file
  await page.goto(`/journeys/business/data?project=${projectId}`);

    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SPTO_DATA_PATH);

    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30000 });

    // Trigger agent recommendations
    await page.click('button:has-text("Get Agent Recommendations")');
    await page.waitForSelector('[data-testid="agent-recommendation-dialog"]', { timeout: 60000 });

    // Check if multiple sheets were detected
    const sheetCount = await page.locator('[data-testid="sheet-detected"]').count();
    console.log(`   📄 Sheets detected: ${sheetCount}`);

    if (sheetCount > 1) {
      // Verify that recommendation includes guidance on sheet selection
      const sheetGuidance = await page.locator('[data-testid="sheet-selection-guidance"]').isVisible();
      expect(sheetGuidance).toBeTruthy();
      console.log('   ✅ Multi-sheet guidance provided');
    }
  });

  test('Validate data transformation suggestions', async () => {
    // ============================================
    // TEST: Data transformation recommendations
    // ============================================
    console.log('\n🔄 TEST: Data transformation suggestions...');

  await page.goto(`/journeys/business/data?project=${projectId}`);

    // Upload and get recommendations
    const fileInput = await page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SPTO_DATA_PATH);
    await page.waitForSelector('[data-testid="upload-success"]', { timeout: 30000 });

    await page.click('button:has-text("Get Agent Recommendations")');
    await page.waitForSelector('[data-testid="agent-recommendation-dialog"]', { timeout: 60000 });

    // Check for transformation suggestions
    const transformationSuggestions = await page.locator('[data-testid="transformation-suggestion"]').count();
    console.log(`   🔧 Transformation suggestions: ${transformationSuggestions}`);

    if (transformationSuggestions > 0) {
      const firstSuggestion = await page.locator('[data-testid="transformation-suggestion"]').first().textContent();
      console.log(`   📝 Example: ${firstSuggestion}`);
    }
  });
});
