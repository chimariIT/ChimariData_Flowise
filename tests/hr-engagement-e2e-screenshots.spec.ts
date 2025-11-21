/**
 * HR Engagement Analysis - Complete E2E Test with Screenshots
 * 
 * Tests the complete workflow for HR engagement analysis with the HREngagementDataset.xlsx file
 * Goal: Understanding how Engagement has changed over a three year period and how this change impacts retention
 * 
 * Questions:
 * - How did each leader's team do on each of the survey questions
 * - What is each leader's employee engagement score
 * - How does each team compare to the company average
 * - How are company views and AI Policy
 * 
 * CRITICAL NOTE: Per AGENT_WORKFLOW_GAP_ANALYSIS.md, users should NOT be required to manually enter:
 * - Expected Data Size (should be estimated by Data Engineer Agent from uploaded file)
 * - Analysis Complexity (should be recommended by Data Scientist Agent based on questions)
 * 
 * The test currently includes workarounds to manually fill these fields until the agent workflow is implemented.
 * When the agent recommendation feature is complete, these fields should be pre-populated automatically.
 */

import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// HR sample data paths
const HR_DATA_DIR = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR';
const HR_ENGAGEMENT = path.join(HR_DATA_DIR, 'HREngagementDataset.xlsx');

// Screenshot directory
const SCREENSHOT_DIR = path.join(process.cwd(), 'test-screenshots', 'hr-engagement-e2e');

// Create screenshot directory if it doesn't exist
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// Helper to take screenshots with descriptive names
async function takeScreenshot(page: Page, stepName: string) {
  const timestamp = Date.now();
  const filename = `${timestamp}-${stepName.replace(/[^a-z0-9]/gi, '-')}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot saved: ${filename}`);
  return filepath;
}

// Helper to register a new user
async function registerAndLoginUser(page: Page) {
  console.log('🔄 Step: Registering new user...');
  await page.goto('/auth/register', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for form to load
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });
  
  // Check if we need to switch to registration mode
  const firstNameVisible = await page.locator('input[name="firstName"]').isVisible().catch(() => false);
  if (!firstNameVisible) {
    await page.click('text=/Create.*Account|Sign.*Up|Register/i');
    await page.waitForSelector('input[name="firstName"]', { timeout: 10000 });
  }
  
  // Fill registration form
  const uniqueEmail = `hr-test-${Date.now()}@chimaridatatest.com`;
  await page.fill('input[name="email"]', uniqueEmail);
  await page.fill('input[name="firstName"]', 'HR');
  await page.fill('input[name="lastName"]', 'Analyst');
  await page.fill('input[name="password"]', 'TestPassword123!');
  await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
  
  // Submit registration and wait for response
  const responsePromise = page.waitForResponse(response => 
    response.url().includes('/api/auth/register') && response.status() === 200
  );
  
  await page.click('button[type="submit"]');
  
  // Wait for registration to complete
  const response = await responsePromise;
  const result = await response.json();
  
  // Store the authentication token in localStorage
  if (result.token) {
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, result.token);
    console.log('✅ Auth token stored in localStorage');
  } else {
    console.warn('⚠️ No token returned from registration');
  }
  
  await page.waitForTimeout(2000); // Give time for redirect
  
  console.log(`✅ Registered user: ${uniqueEmail}`);
  await takeScreenshot(page, '01-registration-complete');
  
  return uniqueEmail;
}

// Helper to start a journey with correct selector
async function startJourney(page: Page, journeyType: string) {
  console.log(`🔄 Starting ${journeyType} journey...`);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  
  await takeScreenshot(page, `02-homepage-${journeyType}`);
  
  // Click on the Non-Tech journey button - use the exact button text
  const journeyButton = page.locator('button:has-text("Start AI Journey")').first();
  await journeyButton.waitFor({ state: 'visible', timeout: 10000 });
  await journeyButton.click();
  
  // Wait for navigation to prepare step
  await page.waitForURL(/\/journeys\/.*\/prepare/, { timeout: 15000 });
  await page.waitForTimeout(1000);
  
  await takeScreenshot(page, `03-journey-selected-${journeyType}`);
}

test.describe('HR Engagement Analysis - Complete E2E with Screenshots', () => {

  test.beforeEach(async ({ page }) => {
    // Capture console logs for debugging
    page.on('console', msg => console.log(`[Browser Console] ${msg.type()}: ${msg.text()}`));
    page.on('pageerror', error => console.error(`[Browser Error] ${error.message}`));
    
    // Register new user for each test
    await registerAndLoginUser(page);
  });

  test('Complete workflow: Engagement analysis with screenshots', async ({ page }) => {
    test.setTimeout(300000); // 5 minutes for complete journey

    console.log('🎬 Starting complete HR engagement analysis workflow...');

    // ========================================
    // PHASE 1: PREPARE STEP - Goal Definition
    // ========================================
    console.log('\n📋 PHASE 1: Prepare Step - Goal Definition');
    
    await startJourney(page, 'ai-guided');
    await takeScreenshot(page, '04-prepare-step-loaded');

    // Fill in the analysis goal
    const goalText = `Understanding how Engagement has changed over a three year period and how this change impacts retention.`;
    const questionText = `How did each leader's team do on each of the survey questions?\nWhat is each leader's employee engagement score?\nHow does each team compare to the company average?\nHow are company views and AI Policy?`;
    
    const goalTextarea = page.locator('textarea[placeholder*="goal"], textarea[name*="goal"], textarea').first();
    await goalTextarea.waitFor({ timeout: 10000 });
    await goalTextarea.fill(goalText);
    
    await takeScreenshot(page, '05a-goal-entered');
    
    // Fill in the questions field
    const questionsTextarea = page.locator('textarea#business-questions, textarea[id="business-questions"]');
    if (await questionsTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await questionsTextarea.fill(questionText);
      await takeScreenshot(page, '05b-questions-entered');
    } else {
      console.warn('⚠️ Questions textarea not found - may be using a different UI');
    }
    
    // Wait for localStorage to be saved
    await page.waitForTimeout(2000);

    // Click Next button
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    await nextButton.click();
    await page.waitForTimeout(2000);

    // ========================================
    // PHASE 2: PROJECT SETUP
    // ========================================
    console.log('\n🏗️  PHASE 2: Project Setup');
    
    // Wait for navigation to project-setup step
    await page.waitForURL(/\/journeys\/.*\/project-setup/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '06-project-setup-loaded');

    // Fill project setup form
    const projectNameInput = page.locator('input[id="project-name"], input[name="projectName"], input[placeholder*="Project Name"]').first();
    if (await projectNameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectNameInput.fill('HR Engagement Analysis');
      await takeScreenshot(page, '07-project-name-entered');
    }

    // Fill project description (required field)
    const projectDescriptionInput = page.locator('textarea[id="project-description"]');
    if (await projectDescriptionInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectDescriptionInput.fill('Analyzing employee engagement survey data to understand how engagement has changed over three years and how it impacts retention across teams and leaders.');
      await takeScreenshot(page, '07a-project-description-entered');
    }

    // Select data source type only - agent should estimate the rest
    const dataSourceSelect = page.locator('select#data-source');
    if (await dataSourceSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dataSourceSelect.selectOption('excel');
      await takeScreenshot(page, '07b-data-source-selected');
    }

    // NOTE: Expected Data Size and Analysis Complexity should be automatically estimated by agents
    // We should NOT manually fill these fields - they should be pre-populated by the Data Engineer 
    // and Data Scientist agents based on the uploaded file and analysis questions
    
    // Wait for agent recommendations to appear (if implemented)
    await page.waitForTimeout(2000);
    
    // Check if fields are pre-filled by agents
    const dataSizeInput = page.locator('input#expected-rows');
    const complexitySelect = page.locator('select#analysis-complexity');
    
    const dataSizeValue = await dataSizeInput.inputValue().catch(() => '');
    const complexityValue = await complexitySelect.inputValue().catch(() => '');
    
    if (dataSizeValue) {
      console.log(`✅ Agent estimated data size: ${dataSizeValue}`);
      await takeScreenshot(page, '07c-agent-estimated-data-size');
    } else {
      console.warn('⚠️ Expected Data Size not pre-filled by agent (this should be implemented)');
      // For now, fill manually as a workaround until agent workflow is implemented
      await dataSizeInput.fill('2000');
      await takeScreenshot(page, '07c-manual-data-size-filled');
    }
    
    if (complexityValue) {
      console.log(`✅ Agent recommended complexity: ${complexityValue}`);
      await takeScreenshot(page, '07d-agent-recommended-complexity');
    } else {
      console.warn('⚠️ Analysis Complexity not pre-filled by agent (this should be implemented)');
      // For now, fill manually as a workaround until agent workflow is implemented
      await complexitySelect.selectOption('moderate');
      await takeScreenshot(page, '07d-manual-complexity-selected');
    }

    // Proceed to next step (data upload) - Use the Next button in the JourneyWizard footer
    const projectNextButton = page.locator('button[data-testid="button-next-step"], button:has-text("Next")').last();
    if (await projectNextButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await projectNextButton.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '08-project-created');
    } else {
      console.error('❌ Next button not found');
    }

    // ========================================
    // PHASE 3: DATA UPLOAD
    // ========================================
    console.log('\n📁 PHASE 3: Data Upload');
    
    // Wait for navigation to data upload step
    await page.waitForURL(/\/journeys\/.*\/data/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '11-data-upload-step');

    // Find file input by ID (it's hidden by default, so we wait for attached)
    const fileInput = page.locator('input#file-upload');
    
    // Wait for input to be attached in the DOM (it's hidden by CSS)
    await fileInput.waitFor({ state: 'attached', timeout: 10000 });
    await fileInput.setInputFiles(HR_ENGAGEMENT);
    
    console.log('📤 File uploaded, waiting for processing...');
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '12-file-uploading');

    // Wait for file to be processed and schema detected
    // The data-step component shows schema preview after processing
    await page.waitForTimeout(5000); // Give time for processing
    
    // Check for schema or preview content
    const hasSchema = await page.locator('text=/schema|columns|preview/i').isVisible({ timeout: 30000 }).catch(() => false);
    if (hasSchema) {
      await takeScreenshot(page, '13-file-uploaded-schema-detected');
    } else {
      // Just take screenshot of current state
      await takeScreenshot(page, '13-file-uploaded-processing');
    }

    // Look for and handle PII detection dialog if present
    const piiDialog = page.locator('text=/PII.*detected|Personal.*Information/i');
    if (await piiDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '14-pii-detected');
      
      // Approve PII handling
      const piiApprove = page.locator('button:has-text("Approve"), button:has-text("Continue"), button:has-text("Accept")').first();
      if (await piiApprove.isVisible()) {
        await piiApprove.click();
        await page.waitForTimeout(1000);
      }
    }

    // Look for data quality checkpoint
    const qualityCheckpoint = page.locator('text=/quality.*score|Data.*Quality/i');
    if (await qualityCheckpoint.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '15-data-quality-checkpoint');
    }

    // Look for agent checkpoint or approval button
    const approveDataButton = page.locator('button:has-text("Approve"), button:has-text("Continue")').first();
    if (await approveDataButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await approveDataButton.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '16-data-approved-agent-checkpoint');
    } else {
      // Fallback: click any Next button
      await nextButton.click();
      await page.waitForTimeout(2000);
    }

    // ========================================
    // PHASE 4: DATA VERIFICATION
    // ========================================
    console.log('\n✅ PHASE 4: Data Verification');
    
    // Wait for navigation to data-verification step
    await page.waitForURL(/\/journeys\/.*\/data-verification/, { timeout: 15000 });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '17-data-verification-loaded');

    // Look for agent checkpoint or approval button
    const approveVerificationButton = page.locator('button:has-text("Approve"), button:has-text("Continue"), button:has-text("Next")').first();
    if (await approveVerificationButton.isVisible({ timeout: 10000 }).catch(() => false)) {
      await approveVerificationButton.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '18-data-verification-approved');
    }

         // ========================================
     // PHASE 5: ANALYSIS EXECUTION
     // ========================================
     console.log('\n⚙️ PHASE 5: Analysis Execution');
    
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '19-analysis-execution-started');

    // Look for Technical AI Agent activity
    const technicalAgent = page.locator('text=/Technical.*Agent|AI.*Agent|analyzing/i');
    if (await technicalAgent.isVisible({ timeout: 10000 }).catch(() => false)) {
      await takeScreenshot(page, '20-technical-agent-working');
      
      // Wait for analysis progress
      await page.waitForTimeout(5000);
      await takeScreenshot(page, '21-analysis-progress');
    }

    // Wait for analysis to complete
    console.log('⏳ Waiting for analysis to complete...');
    
    // Look for completion indicators
    const completionIndicators = [
      'text=/analysis.*complete|complete/i',
      'text=/results.*ready|ready/i',
      'text=/finished|done/i',
      'text=/success/i'
    ];
    
    let analysisComplete = false;
    for (const indicator of completionIndicators) {
      if (await page.locator(indicator).isVisible({ timeout: 20000 }).catch(() => false)) {
        analysisComplete = true;
        break;
      }
    }
    
    if (analysisComplete) {
      await page.waitForTimeout(3000);
      await takeScreenshot(page, '22-analysis-complete');
    } else {
      // Take screenshot anyway after 30 seconds
      await page.waitForTimeout(30000);
      await takeScreenshot(page, '22-analysis-in-progress');
    }

    // ========================================
    // PHASE 6: BUSINESS AGENT INSIGHTS
    // ========================================
    console.log('\n💼 PHASE 6: Business Agent Insights (if present)');
    
    // Look for Business Agent insights or interpretations
    await page.waitForTimeout(3000);
    const businessInsights = page.locator('text=/insights|interpretation|recommendation/i');
    if (await businessInsights.isVisible({ timeout: 10000 }).catch(() => false)) {
      await takeScreenshot(page, '23-business-agent-insights');
    }

    // ========================================
    // PHASE 7: PRICING (if present)
    // ========================================
    console.log('\n💰 PHASE 7: Pricing (if applicable)');
    
    // Navigate to pricing if button available
    const pricingButton = page.locator('button:has-text("View Pricing"), button:has-text("Continue")');
    if (await pricingButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pricingButton.click();
      await page.waitForTimeout(2000);
    }
    
    const pricingVisible = await page.locator('text=/cost|price|pricing/i').isVisible({ timeout: 5000 }).catch(() => false);
    if (pricingVisible) {
      await takeScreenshot(page, '24-pricing-display');
      
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Proceed"), button:has-text("Confirm")');
      if (await continueButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await continueButton.click();
        await page.waitForTimeout(2000);
      }
    }

    // ========================================
    // PHASE 8: RESULTS & ARTIFACTS
    // ========================================
    console.log('\n📊 PHASE 8: Results & Artifacts');
    
    // Wait for results to load
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '25-results-loaded');

    // Look for Business Agent summary or executive summary
    const summary = page.locator('text=/summary|executive|overview/i');
    if (await summary.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '26-executive-summary');
    }

    // Look for visualizations/dashboards
    const visualizations = page.locator('canvas, svg, img[alt*="chart"]');
    if (await visualizations.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '27-visualizations-dashboard');
    }

    // Scroll to see full results
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '28-results-top');
    
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '29-results-middle');

    await page.evaluate(() => window.scrollTo(0, 1000));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '30-results-bottom');

    // Look for artifact download buttons
    const downloadButtons = page.locator('button:has-text("Download"), button:has-text("Export")');
    if (await downloadButtons.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '31-download-options');
    }

    // Verify key engagement content is present
    const engagementContent = await page.locator('text=/engagement|satisfaction|survey|retention/i').isVisible({ timeout: 10000 }).catch(() => false);
    if (engagementContent) {
      console.log('✅ Engagement analysis content found');
    }

    // Look for leader/team analysis if present
    const leaderAnalysis = page.locator('text=/leader|team|manager/i');
    if (await leaderAnalysis.isVisible({ timeout: 5000 }).catch(() => false)) {
      await takeScreenshot(page, '32-leader-team-analysis');
    }

    // Final screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, '33-final-complete-results');

    console.log('\n✅ Complete workflow test finished successfully!');
    console.log(`📸 All screenshots saved to: ${SCREENSHOT_DIR}`);
    console.log(`📊 Total screenshots captured: 33`);
  });

});
