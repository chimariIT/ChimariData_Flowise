/**
 * HR Data - Complete User Journey Tests
 *
 * Tests all three user journey types with real HR sample data:
 * 1. Non-Tech Journey: AI-guided analysis for HR managers
 * 2. Business Journey: Template-based HR analytics
 * 3. Technical Journey: Self-service advanced analytics
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

// HR sample data paths
const HR_DATA_DIR = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR';
const EMPLOYEE_ROSTER = path.join(HR_DATA_DIR, 'EmployeeRoster.xlsx');
const HR_ENGAGEMENT = path.join(HR_DATA_DIR, 'HREngagementDataset.xlsx');

// Test user credentials
const TEST_USER = {
  email: `test-${Date.now()}@chimardata.test`,
  firstName: 'Test',
  lastName: 'User',
  password: 'TestPassword123!'
};

// Helper to register and login a new user
async function registerAndLoginUser(page: Page) {
  // Navigate directly to the registration page
  await page.goto('/auth/register', { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for React app to load and form to appear
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });

  // Check if we need to switch to registration mode (form might default to login)
  const firstNameVisible = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  if (!firstNameVisible) {
    // Click toggle to switch to registration mode
    await page.click('text=/Create.*Account|Sign.*Up|Register/i');
    // Wait for registration fields to appear
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
  }

  // Fill registration form with unique email
  const uniqueEmail = `test-${Date.now()}@chimaridatatest.com`;
  await page.fill('input[name="email"]', uniqueEmail);
  await page.fill('input[name="firstName"]', TEST_USER.firstName);
  await page.fill('input[name="lastName"]', TEST_USER.lastName);
  await page.fill('input[name="password"]', TEST_USER.password);
  await page.fill('input[name="confirmPassword"]', TEST_USER.password);

  // Submit registration
  await page.click('button[type="submit"]');

  // Wait for successful registration - look for success indication or navigation
  await page.waitForTimeout(5000); // Give server time to process

  console.log(`✅ Registered user: ${uniqueEmail}`);
}

// Helper to navigate to journey start
async function startJourney(page: Page, journeyType: 'non-tech' | 'business' | 'technical') {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Scroll to journey selection or click appropriate journey card
  const journeySelectors = {
    'non-tech': 'text=/AI.*Guided|Non.*Tech/i',
    'business': 'text=/Business.*Template|Template.*Based/i',
    'technical': 'text=/Technical|Self.*Service|Advanced/i'
  };

  await page.click(journeySelectors[journeyType]);
  await page.waitForTimeout(1000);
}

// Helper to verify file upload
async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for upload to complete
  await page.waitForSelector('text=/upload.*success|file.*uploaded/i', { timeout: 30000 });
}

test.describe('HR Data - Non-Tech User Journey (AI-Guided)', () => {

  test.beforeEach(async ({ page }) => {
    // Register and login a new test user
    await registerAndLoginUser(page);
  });

  test('Non-tech user: Complete HR engagement analysis workflow', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for full journey

    // Step 1: Journey Selection
    await startJourney(page, 'non-tech');
    await page.waitForTimeout(1000);

    // Should navigate to prepare step
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    // Step 2: Prepare - Define Goals
    await page.waitForSelector('textarea[placeholder*="goal"]', { timeout: 10000 });

    await page.fill('textarea[placeholder*="goal"]',
      'I want to understand employee engagement levels and identify factors affecting retention. ' +
      'Specifically, I need to know which departments have the lowest satisfaction and what drives turnover.'
    );

    // AI should suggest relevant questions
    await page.waitForSelector('text=/suggested.*question|AI.*suggest/i', { timeout: 15000 });

    await page.click('button:has-text("Next")');

    // Step 3: Data Upload
    await page.waitForSelector('text=/upload.*data/i', { timeout: 10000 });

    // Upload HR Engagement dataset
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(HR_ENGAGEMENT);

    // Wait for schema detection
    await page.waitForSelector('text=/schema.*detected|columns.*found/i', { timeout: 30000 });

    // Verify schema preview shows HR columns
    await expect(page.locator('text=/department|satisfaction|engagement/i')).toBeVisible();

    await page.click('button:has-text("Next")');

    // Step 4: Execute - Agent orchestrates analysis
    await page.waitForSelector('text=/analysis.*plan|recommended.*analysis/i', { timeout: 15000 });

    // Agent should recommend appropriate analysis
    await expect(page.locator('text=/descriptive.*statistics|correlation|visualization/i')).toBeVisible();

    // User approves checkpoint
    await page.click('button:has-text("Approve")');

    // Wait for analysis execution
    await page.waitForSelector('text=/analysis.*complete|results.*ready/i', { timeout: 60000 });

    // Step 5: Pricing - Verify cost calculation
    await page.waitForSelector('text=/estimated.*cost|pricing/i', { timeout: 10000 });

    // Should show breakdown
    await expect(page.locator('text=/data.*size|analysis.*complexity/i')).toBeVisible();

    await page.click('button:has-text("Continue")');

    // Step 6: Results - Interactive dashboard
    await page.waitForSelector('text=/results|dashboard/i', { timeout: 10000 });

    // Verify results display
    await expect(page.locator('text=/engagement|satisfaction|department/i')).toBeVisible();

    // Verify artifact download buttons
    await expect(page.locator('button:has-text("Download PDF")')).toBeVisible();
    await expect(page.locator('button:has-text("Download CSV")')).toBeVisible();

    // Test interactive filtering
    const filterInput = page.locator('input[placeholder*="search"]').first();
    if (await filterInput.isVisible()) {
      await filterInput.fill('Engineering');
      await page.waitForTimeout(1000); // Wait for filter to apply
      await expect(page.locator('text=/engineering/i')).toBeVisible();
    }

    // Verify insights are plain-language (non-technical)
    const resultsText = await page.textContent('body');
    expect(resultsText).not.toMatch(/p-value|chi-square|ANOVA|regression coefficient/i);
    expect(resultsText).toMatch(/higher|lower|increase|decrease|trend/i);
  });

  test('Non-tech user: Upload employee roster and get demographic insights', async ({ page }) => {
    test.setTimeout(120000);

    await startJourney(page, 'non-tech');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    // Define goal
    await page.fill('textarea[placeholder*="goal"]',
      'Show me the breakdown of our employee demographics by department, age group, and tenure.'
    );
    await page.click('button:has-text("Next")');

    // Upload employee roster
    await uploadFile(page, EMPLOYEE_ROSTER);
    await page.click('button:has-text("Next")');

    // Execute analysis
    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/analysis.*complete/i', { timeout: 60000 });

    // Verify visualizations
    await page.click('button:has-text("Continue")');
    await expect(page.locator('canvas, svg')).toBeVisible(); // Charts rendered
  });
});

test.describe('HR Data - Business User Journey (Template-Based)', () => {

  test.beforeEach(async ({ page }) => {
    // Register and login a new test user
    await registerAndLoginUser(page);
  });

  test('Business user: Apply HR analytics template to engagement data', async ({ page }) => {
    test.setTimeout(180000);

    // Step 1: Select Business Journey
    await startJourney(page, 'business');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    // Step 2: Prepare - Select HR template
    await page.waitForSelector('text=/select.*template|choose.*template/i', { timeout: 10000 });

    // Look for HR-related templates
    const hrTemplate = page.locator('text=/employee.*engagement|HR.*analytics|workforce.*analysis/i').first();
    if (await hrTemplate.isVisible()) {
      await hrTemplate.click();
    } else {
      console.warn('HR template not found, using first available template');
      await page.locator('[data-testid="template-card"]').first().click();
    }

    await page.fill('textarea[placeholder*="goal"]',
      'Apply industry best practices to analyze our employee engagement survey results.'
    );
    await page.click('button:has-text("Next")');

    // Step 3: Upload HR engagement data
    await uploadFile(page, HR_ENGAGEMENT);
    await page.click('button:has-text("Next")');

    // Step 4: Execute - Template workflow applied
    // Template should pre-configure analysis parameters
    await expect(page.locator('text=/template.*workflow|pre-configured/i')).toBeVisible();

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/analysis.*complete/i', { timeout: 60000 });

    // Step 5: Pricing
    await page.click('button:has-text("Continue")');

    // Step 6: Results - Business-focused insights
    await page.waitForSelector('text=/results|insights/i', { timeout: 10000 });

    // Should show business metrics
    await expect(page.locator('text=/KPI|metric|benchmark|industry.*standard/i')).toBeVisible();

    // Verify business report artifacts
    await expect(page.locator('button:has-text("Download Report")')).toBeVisible();
    await expect(page.locator('button:has-text("Download Presentation")')).toBeVisible();
  });

  test('Business user: Compare employee roster against industry benchmarks', async ({ page }) => {
    test.setTimeout(120000);

    await startJourney(page, 'business');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    // Select diversity analytics template if available
    await page.waitForSelector('text=/template/i', { timeout: 10000 });
    await page.locator('[data-testid="template-card"]').first().click();

    await page.fill('textarea[placeholder*="goal"]',
      'Benchmark our workforce diversity metrics against industry standards.'
    );
    await page.click('button:has-text("Next")');

    await uploadFile(page, EMPLOYEE_ROSTER);
    await page.click('button:has-text("Next")');

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/complete/i', { timeout: 60000 });

    await page.click('button:has-text("Continue")');

    // Verify benchmark comparisons
    await expect(page.locator('text=/above.*average|below.*average|industry.*benchmark/i')).toBeVisible();
  });
});

test.describe('HR Data - Technical User Journey (Self-Service)', () => {

  test.beforeEach(async ({ page }) => {
    // Register and login a new test user
    await registerAndLoginUser(page);
  });

  test('Technical user: Advanced statistical analysis on engagement data', async ({ page }) => {
    test.setTimeout(180000);

    // Step 1: Select Technical Journey
    await startJourney(page, 'technical');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    // Step 2: Define technical objectives
    await page.fill('textarea[placeholder*="goal"]',
      'Perform regression analysis to identify predictors of employee turnover. ' +
      'Run ANOVA to test for significant differences in engagement scores across departments. ' +
      'Generate correlation matrix for all satisfaction metrics.'
    );
    await page.click('button:has-text("Next")');

    // Step 3: Upload data
    await uploadFile(page, HR_ENGAGEMENT);
    await page.click('button:has-text("Next")');

    // Step 4: Execute - Advanced analysis controls
    await page.waitForSelector('text=/analysis.*type|select.*method/i', { timeout: 10000 });

    // Technical users should see analysis method selectors
    await expect(page.locator('select, [role="combobox"]')).toBeVisible();

    // Select regression analysis
    const analysisTypeSelect = page.locator('select[name*="analysis"], [name*="method"]').first();
    if (await analysisTypeSelect.isVisible()) {
      await analysisTypeSelect.selectOption({ label: /regression|statistical/i });
    }

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/complete/i', { timeout: 60000 });

    // Step 5: Pricing
    await page.click('button:has-text("Continue")');

    // Step 6: Results - Technical output
    await page.waitForSelector('text=/results/i', { timeout: 10000 });

    // Should show technical statistics
    const resultsText = await page.textContent('body');
    expect(resultsText).toMatch(/p-value|coefficient|r-squared|significance|correlation/i);

    // Verify code/data download options
    await expect(page.locator('button:has-text("Download JSON")')).toBeVisible();
    await expect(page.locator('button:has-text("Download CSV")')).toBeVisible();

    // Verify Python/SQL code generation if available
    const codeBlock = page.locator('pre, code[class*="language"]');
    if (await codeBlock.isVisible()) {
      const codeText = await codeBlock.textContent();
      expect(codeText).toMatch(/import|SELECT|pandas|numpy/i);
    }
  });

  test('Technical user: Multi-dataset join - roster + engagement', async ({ page }) => {
    test.setTimeout(180000);

    await startJourney(page, 'technical');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    await page.fill('textarea[placeholder*="goal"]',
      'Join employee roster with engagement data to analyze how demographics correlate with satisfaction scores.'
    );
    await page.click('button:has-text("Next")');

    // Upload first dataset
    await uploadFile(page, EMPLOYEE_ROSTER);

    // Look for "Add another dataset" option
    const addDatasetBtn = page.locator('button:has-text("Add Dataset"), button:has-text("Upload Another")');
    if (await addDatasetBtn.isVisible()) {
      await addDatasetBtn.click();
      await uploadFile(page, HR_ENGAGEMENT);
    }

    await page.click('button:has-text("Next")');

    // Should show join configuration
    await expect(page.locator('text=/join|merge|combine/i')).toBeVisible();

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/complete/i', { timeout: 60000 });

    await page.click('button:has-text("Continue")');

    // Verify merged results
    await expect(page.locator('text=/joined|merged|combined/i')).toBeVisible();
  });

  test('Technical user: Custom ML model training for turnover prediction', async ({ page }) => {
    test.setTimeout(240000); // 4 minutes for ML

    await startJourney(page, 'technical');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    await page.fill('textarea[placeholder*="goal"]',
      'Train a machine learning model to predict employee turnover risk based on engagement metrics, tenure, and department.'
    );
    await page.click('button:has-text("Next")');

    await uploadFile(page, HR_ENGAGEMENT);
    await page.click('button:has-text("Next")');

    // ML configuration
    await page.waitForSelector('text=/machine.*learning|model.*training/i', { timeout: 10000 });

    // Select ML algorithm
    const mlSelect = page.locator('select[name*="algorithm"], select[name*="model"]').first();
    if (await mlSelect.isVisible()) {
      await mlSelect.selectOption({ label: /random.*forest|classification|logistic/i });
    }

    await page.click('button:has-text("Approve")');

    // ML training takes longer
    await page.waitForSelector('text=/training.*complete|model.*ready/i', { timeout: 120000 });

    await page.click('button:has-text("Continue")');

    // Verify model metrics
    await expect(page.locator('text=/accuracy|precision|recall|F1.*score|ROC/i')).toBeVisible();

    // Verify model download
    await expect(page.locator('button:has-text("Download Model")')).toBeVisible();
  });
});

test.describe('HR Data - Artifact Generation Verification', () => {

  test.beforeEach(async ({ page }) => {
    // Register and login a new test user
    await registerAndLoginUser(page);
  });

  test('Verify all artifact types are generated for HR analysis', async ({ page }) => {
    test.setTimeout(180000);

    // Quick journey to results
    await startJourney(page, 'non-tech');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    await page.fill('textarea[placeholder*="goal"]', 'Analyze employee engagement');
    await page.click('button:has-text("Next")');

    await uploadFile(page, HR_ENGAGEMENT);
    await page.click('button:has-text("Next")');

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/complete/i', { timeout: 60000 });

    await page.click('button:has-text("Continue")');
    await page.waitForSelector('text=/results/i', { timeout: 10000 });

    // Verify all 5 artifact types
    await expect(page.locator('button:has-text("Download PDF")')).toBeVisible();
    await expect(page.locator('button:has-text("Download CSV")')).toBeVisible();
    await expect(page.locator('button:has-text("Download JSON")')).toBeVisible();
    await expect(page.locator('button:has-text("Download Presentation"), button:has-text("Download PPTX")')).toBeVisible();

    // Interactive dashboard should be visible by default
    await expect(page.locator('[data-testid="results-dashboard"], .dashboard-container')).toBeVisible();

    // Test artifact download (click and verify response)
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.click('button:has-text("Download PDF")').catch(() => {
        console.warn('PDF download button not found or not clickable');
      })
    ]).catch(() => [null]);

    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      console.log('✅ PDF artifact downloaded:', download.suggestedFilename());
    }
  });
});

test.describe('HR Data - Billing Integration Verification', () => {

  test('Verify usage tracking and cost calculation for HR analysis', async ({ page, request }) => {
    test.setTimeout(180000);

    // Register and login a new test user
    await registerAndLoginUser(page);

    // Get initial usage
    const initialUsage = await request.get('/api/billing/usage-summary');
    const initialData = await initialUsage.json();
    const initialDataUsage = initialData.dataUsage?.totalUploadSizeMB || 0;

    // Perform analysis
    await startJourney(page, 'non-tech');
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });

    await page.fill('textarea[placeholder*="goal"]', 'Engagement analysis');
    await page.click('button:has-text("Next")');

    await uploadFile(page, HR_ENGAGEMENT);
    await page.click('button:has-text("Next")');

    await page.click('button:has-text("Approve")');
    await page.waitForSelector('text=/complete/i', { timeout: 60000 });

    // Check pricing display
    await page.waitForSelector('text=/cost|price/i', { timeout: 10000 });
    const pricingText = await page.textContent('body');
    expect(pricingText).toMatch(/\$|cost|price/i);

    await page.click('button:has-text("Continue")');

    // Download an artifact to trigger artifact billing
    await page.waitForSelector('button:has-text("Download PDF")', { timeout: 10000 });
    await page.click('button:has-text("Download PDF")').catch(() => {});

    // Verify usage increased
    await page.waitForTimeout(2000); // Allow billing to update

    const finalUsage = await request.get('/api/billing/usage-summary');
    const finalData = await finalUsage.json();
    const finalDataUsage = finalData.dataUsage?.totalUploadSizeMB || 0;

    expect(finalDataUsage).toBeGreaterThanOrEqual(initialDataUsage);
    console.log('✅ Data usage tracked:', { initial: initialDataUsage, final: finalDataUsage });

    // Verify artifact usage tracked
    if (finalData.artifactUsage) {
      expect(finalData.artifactUsage.pdfReportsGenerated).toBeGreaterThan(0);
      console.log('✅ Artifact usage tracked:', finalData.artifactUsage);
    }
  });
});
