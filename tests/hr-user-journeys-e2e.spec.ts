/**
 * HR Data - Complete User Journey Tests
 *
 * Tests all three user journey types with real HR sample data:
 * 1. Non-Tech Journey: AI-guided analysis for HR managers
 * 2. Business Journey: Template-based HR analytics
 * 3. Technical Journey: Self-service advanced analytics
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
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

async function waitForBackendReady(request: APIRequestContext, timeoutMs = 120000) {
  const start = Date.now();
  let lastStatus: number | undefined;
  let attempts = 0;

  while (Date.now() - start < timeoutMs) {
    attempts += 1;
    const targets = ['/api/health', 'http://localhost:5000/api/health'];
    for (const target of targets) {
      try {
        const response = await request.get(target);
        lastStatus = response.status();
        if (response.ok()) {
          return;
        }
        if (attempts % 5 === 0) {
          const snippet = await response.text().catch(() => '');
          console.warn(`⚠️  Health check attempt ${attempts} for ${target} returned ${response.status()} ${response.statusText()}`);
          if (snippet) {
            console.warn(`⚠️  Health check response snippet: ${snippet.slice(0, 200)}${snippet.length > 200 ? '...' : ''}`);
          }
        }
      } catch (error) {
        lastStatus = undefined;
        if (attempts % 5 === 0) {
          console.warn(`⚠️  Health check attempt ${attempts} for ${target} threw ${error instanceof Error ? error.message : error}`);
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Backend health check timed out${lastStatus ? ` (last status ${lastStatus})` : ''}`);
}

// Helper to keep the auth form in registration mode before filling inputs
async function ensureRegistrationMode(page: Page) {
  const firstNameVisible = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  if (!firstNameVisible) {
    await page.click('text=/Create.*Account|Sign.*Up|Register/i');
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
  }
}

// Helper to register and login a new user with retry handling for cold starts
async function registerAndLoginUser(page: Page) {
  await page.goto('/auth/register', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });

  const emailSeed = `test-${Date.now()}`;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const attemptEmail = `${emailSeed}-${attempt}@chimaridatatest.com`;

    await ensureRegistrationMode(page);

    await page.fill('input[name="email"]', attemptEmail);
    await page.fill('input[name="firstName"]', TEST_USER.firstName);
    await page.fill('input[name="lastName"]', TEST_USER.lastName);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.fill('input[name="confirmPassword"]', TEST_USER.password);

    const registerResponsePromise = page.waitForResponse(
      (response) => response.url().includes('/api/auth/register'),
      { timeout: 20000 }
    );

    await page.click('button[type="submit"]');

    try {
      const registerResponse = await registerResponsePromise;
      if (!registerResponse.ok()) {
        const errorText = await registerResponse.text();
        lastError = new Error(`Registration failed: ${registerResponse.status()} ${registerResponse.statusText()} :: ${errorText}`);
        console.warn(`⚠️  Registration attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < 3) {
          await page.waitForTimeout(1500);
          await page.reload({ waitUntil: 'networkidle' });
          await page.waitForSelector('input[name="email"]', { timeout: 30000 });
        }
        continue;
      }

      // Wait for the form to switch back to login mode (submit button should say "Sign In")
      await page.waitForSelector('button[type="submit"]:has-text("Sign In")', { timeout: 20000 });

      await page.fill('input[name="email"]', attemptEmail);
      await page.fill('input[name="password"]', TEST_USER.password);
      
      const loginResponsePromise = page.waitForResponse(
        (response) => response.url().includes('/api/auth/login'),
        { timeout: 20000 }
      );
      
      await page.click('button[type="submit"]');
      
      const loginResponse = await loginResponsePromise;
      if (!loginResponse.ok()) {
        throw new Error(`Login failed: ${loginResponse.status()} ${loginResponse.statusText()}`);
      }
      
      const loginResult = await loginResponse.json();
      
      // Ensure auth token and user are stored in localStorage for App.tsx to pick up
      await page.evaluate(({ token, user }) => {
        if (token) {
          localStorage.setItem('auth_token', token);
        }
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
        }
      }, { 
        token: loginResult.token || loginResult.data?.token,
        user: loginResult.user || loginResult.data?.user
      });

      // Wait for navigation away from auth page - use locator for text matching
      try {
        await page.waitForSelector('[data-testid="button-start-non-tech-landing"]', { timeout: 10000 });
      } catch {
        // Try text locator as fallback
        const dashboardButton = page.locator('text=/Dashboard|Start|Journey/i').first();
        await dashboardButton.waitFor({ timeout: 10000 });
      }
      
      // Additional wait to ensure React has updated user state
      await page.waitForTimeout(2000);
      
      console.log(`✅ Registered and logged in user: ${attemptEmail}`);
      return;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`⚠️  Registration attempt ${attempt} encountered an error: ${lastError.message}`);
      if (attempt < 3) {
        await page.waitForTimeout(1500);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForSelector('input[name="email"]', { timeout: 30000 });
      }
    }
  }

  throw lastError ?? new Error('Registration failed after retries');
}

// Helper to navigate to journey start
async function startJourney(page: Page, journeyType: 'non-tech' | 'business' | 'technical') {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  // Map journey types to route names
  const routeMap: Record<string, string> = {
    'non-tech': 'non-tech',
    'business': 'business',
    'technical': 'technical'
  };
  
  const routeType = routeMap[journeyType];
  
  // Try to find and click the journey button
  const journeySelectors = {
    'non-tech': '[data-testid="button-start-non-tech-landing"], button:has-text("Start AI Journey"), text=/AI.*Guided|Non.*Tech/i',
    'business': 'button:has-text("Start Business Journey"), text=/Business.*Template|Template.*Based/i',
    'technical': 'button:has-text("Start Technical Journey"), text=/Technical|Self.*Service|Advanced/i'
  };
  
  const selector = journeySelectors[journeyType];
  
  try {
    // Try clicking the journey card/button
    const button = page.locator(selector).first();
    await button.waitFor({ timeout: 10000 });
    await button.click();
    await page.waitForTimeout(2000);
  } catch (error) {
    console.warn(`Could not find journey button, navigating directly to /journeys/${routeType}/prepare`);
  }
  
  // Navigate directly to the prepare step to ensure we're on the right page
  await page.goto(`/journeys/${routeType}/prepare`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
}

// Helper to verify file upload
async function uploadFile(page: Page, filePath: string) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  // Wait for upload to complete
  await page.waitForSelector('text=/upload.*success|file.*uploaded/i', { timeout: 30000 });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(150000);
  await waitForBackendReady(request);
});

test.describe('HR Data - Non-Tech User Journey (AI-Guided)', () => {

  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ page }) => {
    // Register and login a new test user
    await registerAndLoginUser(page);
  });

  test('Non-tech user: Complete HR engagement analysis workflow', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for full journey

    // Enable console logging to debug issues
    page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.error(`[Page Error] ${error.message}`));

    // Step 1: Journey Selection
    await startJourney(page, 'non-tech');
    await page.waitForTimeout(1000);

    // Should navigate to prepare step
    await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 10000 });
    console.log('✅ Navigated to prepare step URL:', page.url());

    // Step 2: Prepare - Define Goals
    // Wait for page to fully load and auth to complete
    await page.waitForLoadState('networkidle');
    
    // Wait for auth to complete - ensure user state is loaded in React
    // The App.tsx checks user state, so we need to wait for it to be set
    await page.waitForFunction(() => {
      // Check if we're still on auth page
      const authInput = document.querySelector('input[name="email"]');
      if (authInput) return false; // Still on auth page
      
      // Check if JourneyWizard has rendered (look for prepare step content)
      const hasStepContent = document.querySelector('[data-testid="card-step-content"], .step-content, textarea[id="analysis-goal"]');
      return !!hasStepContent;
    }, { timeout: 30000 }).catch(async () => {
      // If still failing, check what's actually on the page
      const bodyText = await page.textContent('body');
      const hasAuthInput = await page.locator('input[name="email"]').isVisible().catch(() => false);
      console.log('⚠️  Auth check failed - Auth input visible:', hasAuthInput);
      console.log('⚠️  Body text:', bodyText?.substring(0, 200));
      
      // If we're on auth page, the user state didn't load
      if (hasAuthInput) {
        throw new Error('User authentication state not loading - still on auth page after login');
      }
    });
    
    await page.waitForTimeout(2000);
    
    // Debug: Check current page content
    const pageContent = await page.content();
    console.log('📄 Page title:', await page.title());
    console.log('📄 Page URL:', page.url());
    console.log('📄 Body text preview:', (await page.textContent('body'))?.substring(0, 200));
    
    // Check if user is authenticated
    const authCheck = await page.evaluate(() => {
      return {
        hasLocalStorage: typeof localStorage !== 'undefined',
        hasToken: localStorage.getItem('auth_token') || localStorage.getItem('token') || 'none',
        hasUser: sessionStorage.getItem('user') || 'none'
      };
    });
    console.log('🔐 Auth state:', authCheck);
    
    // Wait for the prepare step content to be visible (try multiple selectors)
    try {
      await page.waitForSelector('[data-testid="card-step-content"]', { timeout: 10000 });
      console.log('✅ Found card-step-content');
    } catch {
      try {
        await page.waitForSelector('.step-content', { timeout: 10000 });
        console.log('✅ Found .step-content');
      } catch {
        // Use locator for text matching
        const contentLocator = page.locator('text=/Analysis Preparation|Define goals/i');
        await contentLocator.waitFor({ timeout: 10000 });
        console.log('✅ Found text content');
      }
    }
    
    // Additional wait to ensure everything is loaded
    await page.waitForTimeout(2000);
    
    // Debug: Check what textareas exist on the page
    const textareas = await page.locator('textarea').count();
    console.log(`📝 Found ${textareas} textarea elements on page`);
    
    if (textareas === 0) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'test-results/debug-prepare-step.png', fullPage: true });
      throw new Error('No textarea elements found on prepare step page');
    }
    
    // Now wait for the textarea specifically - try multiple approaches
    let goalTextarea = page.locator('#analysis-goal').first();
    let textareaFound = false;
    
    try {
      await goalTextarea.waitFor({ timeout: 5000, state: 'visible' });
      console.log('✅ Found #analysis-goal');
      textareaFound = true;
    } catch {
      // Try alternative selectors
      goalTextarea = page.locator('textarea[placeholder*="goal"]').first();
      try {
        await goalTextarea.waitFor({ timeout: 5000, state: 'visible' });
        console.log('✅ Found textarea with goal placeholder');
        textareaFound = true;
      } catch {
        goalTextarea = page.locator('textarea[placeholder*="understand"]').first();
        try {
          await goalTextarea.waitFor({ timeout: 5000, state: 'visible' });
          console.log('✅ Found textarea with understand placeholder');
          textareaFound = true;
        } catch {
          // Last resort: any textarea
          goalTextarea = page.locator('textarea').first();
          await goalTextarea.waitFor({ timeout: 10000, state: 'visible' });
          console.log('✅ Found first textarea on page');
          textareaFound = true;
        }
      }
    }
    
    if (!textareaFound) {
      // Take screenshot for debugging
      await page.screenshot({ path: 'test-results/debug-no-textarea.png', fullPage: true });
      throw new Error('Could not find goal textarea on prepare step');
    }
    
    await goalTextarea.fill(
      'I want to understand employee engagement levels and identify factors affecting retention. ' +
      'Specifically, I need to know which departments have the lowest satisfaction and what drives turnover.'
    );

    // Wait a moment for AI suggestions to load
    await page.waitForTimeout(3000);

    // AI should suggest relevant questions (optional check)
    const hasSuggestions = await page.locator('text=/suggested.*question|AI.*suggest/i').isVisible().catch(() => false);
    if (hasSuggestions) {
      console.log('✅ AI suggestions appeared');
    }

    // Click Next to proceed - try multiple selectors
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), button[type="submit"]').first();
    await nextButton.waitFor({ timeout: 10000 });
    await nextButton.click();

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
      const firstOption = analysisTypeSelect.locator('option').first();
      const optionValue = await firstOption.getAttribute('value');
      if (optionValue) {
        await analysisTypeSelect.selectOption(optionValue);
      }
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
      const firstOption = mlSelect.locator('option').first();
      const optionValue = await firstOption.getAttribute('value');
      if (optionValue) {
        await mlSelect.selectOption(optionValue);
      }
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
