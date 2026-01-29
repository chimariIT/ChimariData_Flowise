/**
 * Manual E2E Test: HR Engagement Analysis
 *
 * This script tests the full user journey with HR engagement data:
 * 1. Create project with HR journey type
 * 2. Upload HR Engagement Dataset + Employee Roster
 * 3. Set business goals and questions
 * 4. Run through verification, transformation, and analysis
 * 5. Verify results contain leader engagement scores and turnover analysis
 */

import { test, expect } from '@playwright/test';
import * as path from 'path';

const HR_DATASET_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR\\HREngagementDataset.xlsx';
const EMPLOYEE_ROSTER_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR\\EmployeeRoster.xlsx';

const ANALYSIS_GOAL = "Understanding each leader's team engagement scores and how engagement scores impact employee retention and employee's satisfaction with the organization";

const QUESTIONS = [
  "How did each leader's team do on each of the survey questions?",
  "What is each leader's employee engagement score?",
  "How does each team compare to the company average engagement scores?",
  "What is the company's turnover rate?",
  "What is each leader's employee turnover rate?",
  "How are company views and AI Policy?"
];

test.describe('HR Engagement Analysis E2E', () => {
  test.setTimeout(300000); // 5 minute timeout for full journey

  test('complete HR engagement analysis journey', async ({ page }) => {
    // Login or navigate to app
    await page.goto('http://localhost:5173');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Check if we need to login
    const loginButton = page.locator('text=Sign In').first();
    if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Need to login first...');
      // For test purposes, we might need to create/login a test user
      // This depends on your auth setup
    }

    // Navigate to journeys hub
    await page.goto('http://localhost:5173/journeys');
    await page.waitForLoadState('networkidle');

    // Select HR journey type if available, or create new project
    const hrJourneyCard = page.locator('text=HR Analytics').first();
    if (await hrJourneyCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await hrJourneyCard.click();
    } else {
      // Look for a general "Start Analysis" or "New Project" button
      const startButton = page.locator('button:has-text("Start"), button:has-text("New Project"), a:has-text("Get Started")').first();
      await startButton.click();
    }

    await page.waitForLoadState('networkidle');

    // STEP 1: Prepare - Enter business context
    console.log('Step 1: Setting business context...');

    // Fill in analysis goal
    const goalInput = page.locator('textarea[name="analysisGoal"], textarea[placeholder*="goal"], textarea[placeholder*="understand"]').first();
    if (await goalInput.isVisible({ timeout: 5000 })) {
      await goalInput.fill(ANALYSIS_GOAL);
    }

    // Fill in questions
    const questionsInput = page.locator('textarea[name="businessQuestions"], textarea[placeholder*="question"]').first();
    if (await questionsInput.isVisible({ timeout: 5000 })) {
      await questionsInput.fill(QUESTIONS.join('\n'));
    }

    // Continue to next step
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await continueButton.click();
    await page.waitForLoadState('networkidle');

    // STEP 2: Data Upload
    console.log('Step 2: Uploading HR data files...');

    // Upload HR Engagement Dataset
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles([HR_DATASET_PATH, EMPLOYEE_ROSTER_PATH]);

    // Wait for upload to complete
    await page.waitForSelector('text=uploaded successfully, text=Upload complete', { timeout: 60000 });

    // Continue
    await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
    await page.waitForLoadState('networkidle');

    // STEP 3: Data Verification
    console.log('Step 3: Verifying data...');

    // Wait for verification to complete
    await page.waitForSelector('[data-testid="verification-complete"], text=Verification Complete, text=Data Quality', { timeout: 60000 });

    // Approve verification
    const verifyButton = page.locator('button:has-text("Verify"), button:has-text("Approve"), button:has-text("Continue")').first();
    await verifyButton.click();
    await page.waitForLoadState('networkidle');

    // STEP 4: Data Transformation
    console.log('Step 4: Configuring transformations...');

    // Wait for transformation suggestions
    await page.waitForSelector('[data-testid="transformation-suggestions"], text=Transformation, text=Column Mapping', { timeout: 90000 });

    // Check for join key detection (should auto-detect Employee ID)
    const joinKeyBadge = page.locator('text=Employee ID, text=join key').first();
    expect(await joinKeyBadge.isVisible({ timeout: 10000 })).toBeTruthy();

    // Execute transformations
    const executeButton = page.locator('button:has-text("Execute"), button:has-text("Apply"), button:has-text("Transform")').first();
    await executeButton.click();
    await page.waitForLoadState('networkidle');

    // STEP 5: Analysis Execution
    console.log('Step 5: Executing analysis...');

    // Wait for analysis options
    await page.waitForSelector('[data-testid="analysis-options"], text=Analysis Type, text=Select Analyses', { timeout: 30000 });

    // Select relevant analyses
    const correlationAnalysis = page.locator('text=Correlation').first();
    const descriptiveAnalysis = page.locator('text=Descriptive').first();

    if (await correlationAnalysis.isVisible({ timeout: 3000 })) {
      await correlationAnalysis.click();
    }
    if (await descriptiveAnalysis.isVisible({ timeout: 3000 })) {
      await descriptiveAnalysis.click();
    }

    // Run analysis
    const runButton = page.locator('button:has-text("Run"), button:has-text("Execute"), button:has-text("Analyze")').first();
    await runButton.click();

    // Wait for analysis to complete (this may take a while)
    await page.waitForSelector('[data-testid="analysis-complete"], text=Analysis Complete, text=Results', { timeout: 180000 });

    // STEP 6: Verify Results
    console.log('Step 6: Verifying results...');

    // Check for leader engagement scores
    const leaderScores = page.locator('text=leader, text=engagement score').first();
    const turnoverRate = page.locator('text=turnover, text=rate').first();

    // Verify key metrics are present
    expect(await leaderScores.isVisible({ timeout: 10000 })).toBeTruthy();
    expect(await turnoverRate.isVisible({ timeout: 10000 })).toBeTruthy();

    console.log('✅ E2E Test Complete - HR Engagement Analysis successful!');
  });
});
