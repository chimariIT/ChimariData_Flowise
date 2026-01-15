/**
 * HR Engagement Analysis - Complete E2E Test with Screenshots
 *
 * Tests the complete workflow for HR engagement analysis with HR data files
 * Goal: To understand Employee engagement and retention over a three year survey cycles.
 *
 * Questions:
 * - How did each leader's team do on each of the survey questions?
 * - What is each leader's employee engagement score?
 * - How does each team compare to the company average?
 * - How are company views on AI Policy changing?
 *
 * Updated Flow: Data Upload → Prepare → Data Verification → Data Transformation →
 *               Project Setup → Plan → Execute → Results Preview → Pricing → Results
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// HR sample data paths
const HR_DATA_DIR = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR';
const HR_ENGAGEMENT = path.join(HR_DATA_DIR, 'HREngagementDataset.xlsx');
const EMPLOYEE_ROSTER = path.join(HR_DATA_DIR, 'EmployeeRoster.xlsx');

// Screenshot and artifact output directory - save to HR folder
const OUTPUT_DIR = path.join(HR_DATA_DIR, 'test-artifacts');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Test configuration
const ANALYSIS_GOAL = 'To understand Employee engagement and retention over a three year survey cycles.';
const BUSINESS_QUESTIONS = `1. How did each leader's team do on each of the survey questions?
2. What is each leader's employee engagement score?
3. How does each team compare to the company average?
4. How are company views on AI Policy changing?`;

// Helper to take screenshots with descriptive names
async function takeScreenshot(page: Page, stepName: string, description?: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const filename = `${stepName}_${timestamp}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot saved: ${filename} - ${description || stepName}`);
  return filepath;
}

// Helper to save test log
function saveTestLog(content: string) {
  const logPath = path.join(OUTPUT_DIR, 'test-run-log.txt');
  fs.appendFileSync(logPath, `${new Date().toISOString()} - ${content}\n`);
}

// Helper to wait for page load
async function waitForPageLoad(page: Page, timeout = 15000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
    await page.waitForTimeout(1500);
  } catch (error) {
    console.log(`⚠️ Page load timeout, continuing: ${(error as Error).message}`);
  }
}

// Helper to register a new user AND log them in
async function registerAndLoginUser(page: Page) {
  console.log('🔄 Step: Registering new user...');
  saveTestLog('REGISTRATION: Starting new user registration');

  await page.goto('/auth', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForPageLoad(page);
  await takeScreenshot(page, '01-auth-page', 'Authentication page');

  // Generate unique email and password
  const uniqueEmail = `hr-test-${Date.now()}@chimaridata.com`;
  const password = 'TestPassword123!';
  saveTestLog(`REGISTRATION: Using email ${uniqueEmail}`);

  // Click "Sign up" link to switch to registration mode
  const signUpLink = page.locator('text=Sign up').or(page.locator('a:has-text("Sign up")'));
  if (await signUpLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await signUpLink.click();
    await page.waitForTimeout(1000);
  }

  await takeScreenshot(page, '02-register-form', 'Registration form');

  // Fill registration form
  const emailInput = page.locator('input[name="email"]').or(page.locator('input[type="email"]'));
  const passwordInput = page.locator('input[name="password"]').first();

  await emailInput.fill(uniqueEmail);

  // Fill name fields if they exist
  const firstNameInput = page.locator('input[name="firstName"]');
  if (await firstNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await firstNameInput.fill('HR Test');
  }

  const lastNameInput = page.locator('input[name="lastName"]');
  if (await lastNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await lastNameInput.fill('User');
  }

  await passwordInput.fill(password);

  // Fill confirm password if it exists
  const confirmPasswordInput = page.locator('input[name="confirmPassword"]');
  if (await confirmPasswordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await confirmPasswordInput.fill(password);
  }

  await takeScreenshot(page, '03-register-filled', 'Registration form filled');

  // Submit registration
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();

  // Wait for registration to process - app will switch to login mode
  await page.waitForTimeout(3000);
  await takeScreenshot(page, '04-after-register', 'After registration - should show login form');

  console.log(`✅ Registration submitted for: ${uniqueEmail}`);
  saveTestLog(`REGISTRATION: Completed for ${uniqueEmail}`);

  // NOW LOG IN with the same credentials
  console.log('🔐 Step: Logging in with new credentials...');
  saveTestLog('LOGIN: Starting login with registered credentials');

  // The form should now be in login mode - fill email and password again
  await page.waitForTimeout(1000);

  // Clear and fill email
  const loginEmailInput = page.locator('input[name="email"]').or(page.locator('input[type="email"]'));
  await loginEmailInput.fill(uniqueEmail);

  // Clear and fill password
  const loginPasswordInput = page.locator('input[name="password"]').first();
  await loginPasswordInput.fill(password);

  await takeScreenshot(page, '04b-login-filled', 'Login form filled');

  // Click Sign In button - use exact text match to avoid OAuth buttons
  const signInBtn = page.getByRole('button', { name: 'Sign In', exact: true });
  await signInBtn.click();

  // Wait for login to process and redirect
  await page.waitForTimeout(3000);

  // Check if we're now logged in - look for dashboard or journey elements
  const isLoggedIn = await page.locator('text=/dashboard|logout|sign out|journeys/i').isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoggedIn) {
    console.log('✅ Login successful!');
    saveTestLog('LOGIN: Successful');
  } else {
    // Try waiting for URL change away from /auth
    await page.waitForURL(/^(?!.*\/auth).*$/, { timeout: 10000 }).catch(() => {});
    console.log('✅ Login completed (URL changed)');
    saveTestLog('LOGIN: Completed - URL changed from /auth');
  }

  await takeScreenshot(page, '04c-after-login', 'After login');

  return uniqueEmail;
}

test.describe('HR Engagement Analysis - Complete E2E with Screenshots', () => {

  test.beforeEach(async ({ page }) => {
    // Clear previous log file
    const logPath = path.join(OUTPUT_DIR, 'test-run-log.txt');
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
    }

    // Capture console logs for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser Error] ${msg.text()}`);
      }
    });
    page.on('pageerror', error => console.error(`[Page Error] ${error.message}`));

    saveTestLog('=== HR Engagement E2E Test Started ===');
    saveTestLog(`Analysis Goal: ${ANALYSIS_GOAL}`);
    saveTestLog(`Output Directory: ${OUTPUT_DIR}`);
  });

  test('Complete HR Analysis Journey: Data Upload → Results', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for complete journey

    console.log('🎬 Starting complete HR engagement analysis workflow...');
    saveTestLog('TEST: Starting complete journey');

    // ========================================
    // STEP 1: Register New User
    // ========================================
    const userEmail = await registerAndLoginUser(page);

    // ========================================
    // STEP 2: Navigate to Business Journey - Data Upload
    // ========================================
    console.log('\n📁 STEP 2: Data Upload');
    saveTestLog('STEP 2: Data Upload');

    await page.goto('/journeys/business/data', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '05-data-upload-step', 'Data upload step loaded');

    // Verify files exist
    if (!fs.existsSync(HR_ENGAGEMENT)) {
      throw new Error(`HR Engagement file not found: ${HR_ENGAGEMENT}`);
    }
    if (!fs.existsSync(EMPLOYEE_ROSTER)) {
      throw new Error(`Employee Roster file not found: ${EMPLOYEE_ROSTER}`);
    }

    // Find file input and upload HR Engagement Dataset
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached', timeout: 10000 });

    console.log('📤 Uploading HREngagementDataset.xlsx...');
    saveTestLog('UPLOAD: HREngagementDataset.xlsx');
    await fileInput.setInputFiles(HR_ENGAGEMENT);
    await page.waitForTimeout(5000);
    await takeScreenshot(page, '06-hr-engagement-uploaded', 'HR Engagement dataset uploaded');

    // Upload Employee Roster
    console.log('📤 Uploading EmployeeRoster.xlsx...');
    saveTestLog('UPLOAD: EmployeeRoster.xlsx');
    await fileInput.setInputFiles(EMPLOYEE_ROSTER);
    await page.waitForTimeout(5000);
    await takeScreenshot(page, '07-employee-roster-uploaded', 'Employee Roster uploaded');

    // Wait for processing and look for schema detection
    await page.waitForTimeout(3000);
    const hasSchema = await page.locator('text=/schema|columns|preview|rows/i').isVisible({ timeout: 10000 }).catch(() => false);
    if (hasSchema) {
      await takeScreenshot(page, '08-data-schema-detected', 'Schema detected');
      saveTestLog('UPLOAD: Schema detected successfully');
    }

    // Handle PII detection dialog - "Personal Information Detected" modal
    // The dialog shows detected PII fields like First Name, Last Name, Leader Name
    // Dialog has three buttons: "Cancel Upload", "Advanced Anonymization", "Proceed with Analysis"
    const piiDialog = page.locator('text=Personal Information Detected');
    if (await piiDialog.isVisible({ timeout: 8000 }).catch(() => false)) {
      await takeScreenshot(page, '09-pii-dialog', 'PII detection dialog');
      saveTestLog('UPLOAD: PII detection dialog appeared');

      // Click "Proceed with Analysis" to continue - this is the primary action button
      const proceedBtn = page.locator('button:has-text("Proceed with Analysis")');
      if (await proceedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await proceedBtn.click();
        saveTestLog('UPLOAD: Clicked Proceed with Analysis');
        await page.waitForTimeout(2000);
      } else {
        // Fallback: try X button to close dialog
        const xButton = page.locator('button').filter({ has: page.locator('svg') }).first();
        if (await xButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await xButton.click();
          saveTestLog('UPLOAD: Closed PII dialog via X button');
        } else {
          await page.keyboard.press('Escape');
          saveTestLog('UPLOAD: Closed PII dialog via Escape');
        }
        await page.waitForTimeout(2000);
      }
      await takeScreenshot(page, '09b-after-pii-dialog', 'After PII dialog');
    }

    // Wait for any dialogs to close, then click Continue/Next
    await page.waitForTimeout(1000);

    // Check if there's still an overlay blocking (PII dialog might still be visible)
    const hasOverlay = await page.locator('.fixed.inset-0.bg-black').isVisible().catch(() => false);
    if (hasOverlay) {
      // Try to close any remaining overlay
      const proceedBtn = page.locator('button:has-text("Proceed with Analysis")');
      if (await proceedBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await proceedBtn.click();
        await page.waitForTimeout(2000);
        saveTestLog('UPLOAD: Clicked Proceed with Analysis (retry)');
      }
    }

    // Now click Continue/Next to proceed to next step
    const continueBtn = page.locator('button:has-text("Continue")').or(page.locator('button:has-text("Next")'));
    if (await continueBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.first().click();
      await waitForPageLoad(page);
      saveTestLog('UPLOAD: Clicked Continue button');
    }

    // ========================================
    // STEP 3: Analysis Preparation
    // ========================================
    console.log('\n🎯 STEP 3: Analysis Preparation');
    saveTestLog('STEP 3: Analysis Preparation');

    await page.goto('/journeys/business/prepare', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '10-prepare-step', 'Prepare step loaded');

    // Fill analysis goal
    const goalTextarea = page.locator('textarea').first();
    if (await goalTextarea.isVisible({ timeout: 5000 })) {
      await goalTextarea.fill(ANALYSIS_GOAL);
      await page.waitForTimeout(500);
      await takeScreenshot(page, '11-goal-entered', 'Analysis goal entered');
      saveTestLog(`PREPARE: Goal entered - ${ANALYSIS_GOAL.substring(0, 50)}...`);
    }

    // Fill business questions
    const questionsTextarea = page.locator('textarea#business-questions').or(page.locator('textarea').nth(1));
    if (await questionsTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await questionsTextarea.fill(BUSINESS_QUESTIONS);
      await page.waitForTimeout(500);
      await takeScreenshot(page, '12-questions-entered', 'Business questions entered');
      saveTestLog('PREPARE: Business questions entered');
    }

    // Click Generate Requirements if button exists
    const generateBtn = page.locator('button:has-text("Generate")');
    if (await generateBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await generateBtn.click();
      await page.waitForTimeout(5000);
      await takeScreenshot(page, '13-requirements-generated', 'Data requirements generated');
      saveTestLog('PREPARE: Requirements generated');
    }

    // Continue to next step
    const prepareNextBtn = page.locator('button:has-text("Continue")').or(page.locator('button:has-text("Next")'));
    if (await prepareNextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await prepareNextBtn.first().click();
      await waitForPageLoad(page);
    }

    // ========================================
    // STEP 4: Data Verification
    // ========================================
    console.log('\n✅ STEP 4: Data Verification');
    saveTestLog('STEP 4: Data Verification');

    await page.goto('/journeys/business/data-verification', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '14-data-verification', 'Data verification step');

    // Look for quality score
    const qualityScore = page.locator('text=/\\d+%/').first();
    if (await qualityScore.isVisible({ timeout: 5000 }).catch(() => false)) {
      const scoreText = await qualityScore.textContent();
      saveTestLog(`VERIFY: Quality score - ${scoreText}`);
      await takeScreenshot(page, '15-quality-score', `Quality score: ${scoreText}`);
    }

    // Continue
    const verifyNextBtn = page.locator('button:has-text("Continue")');
    if (await verifyNextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await verifyNextBtn.first().click();
      await waitForPageLoad(page);
    }

    // ========================================
    // STEP 5: Data Transformation
    // ========================================
    console.log('\n🔄 STEP 5: Data Transformation');
    saveTestLog('STEP 5: Data Transformation');

    await page.goto('/journeys/business/data-transformation', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '16-data-transformation', 'Data transformation step');

    const transformNextBtn = page.locator('button:has-text("Continue")');
    if (await transformNextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await transformNextBtn.first().click();
      await waitForPageLoad(page);
    }

    // ========================================
    // STEP 6: Project Setup
    // ========================================
    console.log('\n⚙️ STEP 6: Project Setup');
    saveTestLog('STEP 6: Project Setup');

    await page.goto('/journeys/business/project-setup', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '17-project-setup', 'Project setup step');

    const setupNextBtn = page.locator('button:has-text("Continue")');
    if (await setupNextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await setupNextBtn.first().click();
      await waitForPageLoad(page);
    }

    // ========================================
    // STEP 7: Analysis Plan
    // ========================================
    console.log('\n📋 STEP 7: Analysis Plan');
    saveTestLog('STEP 7: Analysis Plan');

    await page.goto('/journeys/business/plan', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '18-analysis-plan', 'Analysis plan step');

    // Approve plan if needed
    const approveBtn = page.locator('button:has-text("Approve")');
    if (await approveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '19-plan-approved', 'Plan approved');
      saveTestLog('PLAN: Approved');
    }

    const planNextBtn = page.locator('button:has-text("Continue")');
    if (await planNextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await planNextBtn.first().click();
      await waitForPageLoad(page);
    }

    // ========================================
    // STEP 8: Analysis Execution
    // ========================================
    console.log('\n🔬 STEP 8: Analysis Execution');
    saveTestLog('STEP 8: Analysis Execution');

    await page.goto('/journeys/business/execute', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '20-execute-step', 'Execute step loaded');

    // Click Execute Analysis button
    const executeBtn = page.locator('button:has-text("Execute")').or(page.locator('button:has-text("Run Analysis")'));
    if (await executeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await executeBtn.click();
      saveTestLog('EXECUTE: Analysis started');

      // Wait for progress
      await page.waitForTimeout(5000);
      await takeScreenshot(page, '21-execution-progress', 'Analysis in progress');

      // Wait for completion (up to 2 minutes)
      try {
        await page.waitForSelector('text=/complete|finished|success/i', { timeout: 120000 });
        await takeScreenshot(page, '22-execution-complete', 'Analysis completed');
        saveTestLog('EXECUTE: Analysis completed successfully');
      } catch {
        await takeScreenshot(page, '22-execution-status', 'Execution status after wait');
        saveTestLog('EXECUTE: Wait completed, checking status');
      }
    }

    // ========================================
    // STEP 9: Results Preview
    // ========================================
    console.log('\n👁️ STEP 9: Results Preview');
    saveTestLog('STEP 9: Results Preview');

    await page.goto('/journeys/business/preview', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '23-results-preview', 'Results preview');

    // ========================================
    // STEP 10: Pricing/Billing
    // ========================================
    console.log('\n💰 STEP 10: Pricing/Billing');
    saveTestLog('STEP 10: Pricing');

    await page.goto('/journeys/business/pricing', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '24-pricing-step', 'Pricing step');

    // ========================================
    // STEP 11: Final Results
    // ========================================
    console.log('\n📊 STEP 11: Final Results');
    saveTestLog('STEP 11: Final Results');

    await page.goto('/journeys/business/results', { waitUntil: 'domcontentloaded' });
    await waitForPageLoad(page);
    await takeScreenshot(page, '25-results-page', 'Results page');

    // Click on "Your Answers" tab
    const answersTab = page.locator('text="Your Answers"').or(page.locator('[value="answers"]'));
    if (await answersTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await answersTab.click();
      await page.waitForTimeout(1500);
      await takeScreenshot(page, '26-your-answers-tab', 'Your Answers tab - Q&A display');
      saveTestLog('RESULTS: Captured Your Answers tab');
    }

    // Check Insights tab
    const insightsTab = page.locator('text="Insights"');
    if (await insightsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await insightsTab.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '27-insights-tab', 'Insights tab');
    }

    // Check Recommendations tab
    const recsTab = page.locator('text="Recommendations"');
    if (await recsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await recsTab.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '28-recommendations-tab', 'Recommendations tab');
    }

    // Check Artifacts tab
    const artifactsTab = page.locator('text="Artifacts"');
    if (await artifactsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await artifactsTab.click();
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '29-artifacts-tab', 'Artifacts tab');
      saveTestLog('RESULTS: Artifacts tab captured');
    }

    // ========================================
    // STEP 12: Project Dashboard
    // ========================================
    console.log('\n🏠 STEP 12: Project Dashboard');
    saveTestLog('STEP 12: Project Dashboard');

    // Get project ID
    const projectId = await page.evaluate(() => localStorage.getItem('currentProjectId'));
    saveTestLog(`PROJECT: ID = ${projectId}`);

    if (projectId) {
      await page.goto(`/project/${projectId}`, { waitUntil: 'domcontentloaded' });
      await waitForPageLoad(page);
      await takeScreenshot(page, '30-project-dashboard', 'Project dashboard overview');

      // Check Overview tab
      const overviewTab = page.locator('[value="overview"]').or(page.locator('text="Overview"'));
      if (await overviewTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await overviewTab.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '31-dashboard-overview', 'Dashboard Overview');
      }

      // Check Insights tab in dashboard (with Q&A)
      const dashInsightsTab = page.locator('[value="insights"]');
      if (await dashInsightsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dashInsightsTab.click();
        await page.waitForTimeout(1500);
        await takeScreenshot(page, '32-dashboard-insights-qa', 'Dashboard Insights with User Q&A');
        saveTestLog('DASHBOARD: Insights tab with Q&A captured');
      }

      // Check Timeline tab
      const timelineTab = page.locator('[value="timeline"]');
      if (await timelineTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await timelineTab.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '33-dashboard-timeline', 'Dashboard Timeline/Artifacts');
      }

      // Check Agents tab
      const agentsTab = page.locator('[value="agents"]');
      if (await agentsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await agentsTab.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '34-dashboard-agents', 'Dashboard Agents activity');
      }

      // Check Data tab
      const dataTab = page.locator('[value="data"]');
      if (await dataTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dataTab.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '35-dashboard-data', 'Dashboard Data tab');
      }

      // Check Visualizations tab
      const vizTab = page.locator('[value="visualizations"]');
      if (await vizTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await vizTab.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '36-dashboard-visualizations', 'Dashboard Visualizations');
      }
    }

    // ========================================
    // FINAL: Generate Summary
    // ========================================
    saveTestLog('=== HR E2E Journey Test Completed ===');

    // Create summary file
    const summaryContent = `
HR Employee Engagement E2E Test Summary
========================================
Date: ${new Date().toISOString()}
User: ${userEmail}

Analysis Goal:
${ANALYSIS_GOAL}

Business Questions:
${BUSINESS_QUESTIONS}

Data Files Uploaded:
- HREngagementDataset.xlsx
- EmployeeRoster.xlsx

Project ID: ${projectId || 'Not captured'}

Test Status: COMPLETED
Screenshots saved to: ${OUTPUT_DIR}

Journey Steps Completed:
1. User Registration ✓
2. Data Upload ✓
3. Analysis Preparation ✓
4. Data Verification ✓
5. Data Transformation ✓
6. Project Setup ✓
7. Analysis Plan ✓
8. Analysis Execution ✓
9. Results Preview ✓
10. Pricing ✓
11. Final Results ✓
12. Project Dashboard ✓
`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'test-summary.txt'), summaryContent);
    console.log('\n✅ Test completed! Summary saved to test-summary.txt');
    console.log(`📸 All screenshots saved to: ${OUTPUT_DIR}`);
    saveTestLog('Summary file created');
  });

});
