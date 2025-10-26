/**
 * E2E Test: Agent Recommendation Workflow with Real HR Data
 *
 * This test verifies that after uploading HR engagement files:
 * 1. Data Engineer Agent analyzes the files
 * 2. Data Scientist Agent recommends complexity
 * 3. Agent Recommendation Dialog appears with correct information
 * 4. User can accept or modify recommendations
 */

import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Agent Recommendation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:5176');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should show agent recommendations after uploading HR files', async ({ page }) => {
    // Step 1: Register/Login
    console.log('Step 1: User authentication');

    // Check if already logged in
    const isLoggedIn = await page.locator('text=Dashboard').isVisible().catch(() => false);

    if (!isLoggedIn) {
      // Try to navigate to register page
      const registerLink = page.locator('a[href*="register"]').first();
      if (await registerLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await registerLink.click();
      } else {
        await page.goto('http://localhost:5176/register');
      }

      await page.waitForLoadState('networkidle');

      // Fill registration form
      const timestamp = Date.now();
      await page.fill('input[name="email"], input[type="email"]', `test_agent_${timestamp}@example.com`);
      await page.fill('input[name="password"], input[type="password"]', 'TestPassword123!');
      await page.fill('input[name="name"], input[placeholder*="name"]', `Agent Test User ${timestamp}`);

      // Submit registration
      await page.click('button[type="submit"]');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    // Step 2: Navigate to Business Journey (Template-Based)
    console.log('Step 2: Starting business journey');

    // Look for journey selection or directly navigate
    const businessJourneyLink = page.locator('text=/.*Business.*Journey.*/i, a[href*="business"]').first();
    if (await businessJourneyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await businessJourneyLink.click();
    } else {
      await page.goto('http://localhost:5176/journeys/business/prepare');
    }

    await page.waitForLoadState('networkidle');

    // Step 3: Prepare Step - Set project goals and questions
    console.log('Step 3: Setting up project goals and questions');

    // Store project questions for agent recommendations
    const projectQuestions = [
      'What are the engagement scores by leader?',
      'How do team scores compare to company average?',
      'What is the trend over the 3-year period?',
      'What are employee sentiments about AI policies?'
    ];

    const businessContext = {
      industry: 'Human Resources',
      department: 'People Analytics',
      goals: ['Analyze employee engagement', 'Identify trends', 'Compare team performance']
    };

    // Inject into localStorage for the agent to use
    await page.evaluate(([questions, context]) => {
      localStorage.setItem('projectQuestions', JSON.stringify(questions));
      localStorage.setItem('businessContext', JSON.stringify(context));
    }, [projectQuestions, businessContext]);

    // Navigate to data upload step
    await page.goto('http://localhost:5176/journeys/business/data');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Step 4: Upload HR files
    console.log('Step 4: Uploading HR engagement files');

    const file1Path = path.resolve('C:/Users/scmak/Documents/Work/Projects/Chimari/Consulting_BYOD/sampledata/HR/EmployeeRoster.xlsx');
    const file2Path = path.resolve('C:/Users/scmak/Documents/Work/Projects/Chimari/Consulting_BYOD/sampledata/HR/HREngagementDataset.xlsx');

    // Find file input
    const fileInput = page.locator('input[type="file"]');

    // Upload first file
    console.log('Uploading EmployeeRoster.xlsx...');
    await fileInput.setInputFiles(file1Path);
    await page.waitForTimeout(3000); // Wait for upload to complete

    // Wait for agent recommendation dialog to appear
    console.log('Step 5: Waiting for agent recommendation dialog...');

    const recommendationDialog = page.locator('[role="dialog"]:has-text("Agent Recommendations")');

    try {
      await recommendationDialog.waitFor({ timeout: 15000 });
      console.log('✅ Agent Recommendation Dialog appeared!');

      // Step 6: Verify dialog content
      console.log('Step 6: Verifying recommendation content...');

      // Check for Data Analysis Summary section
      await expect(page.locator('text=Data Analysis Summary')).toBeVisible();
      await expect(page.locator('text=Files Analyzed')).toBeVisible();
      await expect(page.locator('text=Total Records')).toBeVisible();
      await expect(page.locator('text=Data Quality')).toBeVisible();

      // Check for Recommended Configuration section
      await expect(page.locator('text=Recommended Configuration')).toBeVisible();
      await expect(page.locator('text=Data Source')).toBeVisible();
      await expect(page.locator('text=Expected Size')).toBeVisible();
      await expect(page.locator('text=Analysis Complexity')).toBeVisible();

      // Check for complexity badge (should be one of: low, medium, high, very_high)
      const complexityBadge = page.locator('[class*="bg-"][class*="text-"]:has-text(/LOW|MEDIUM|HIGH|VERY/)');
      await expect(complexityBadge).toBeVisible();

      // Check for Proposed Analyses section
      await expect(page.locator('text=Proposed Analyses')).toBeVisible();

      // Check for Cost & Time Estimates
      await expect(page.locator('text=Estimated Cost')).toBeVisible();
      await expect(page.locator('text=Estimated Time')).toBeVisible();

      // Check for Rationale
      await expect(page.locator('text=Why these recommendations?')).toBeVisible();

      // Check for action buttons
      const acceptButton = page.locator('button:has-text("Accept")');
      const modifyButton = page.locator('button:has-text("Modify")');

      await expect(acceptButton).toBeVisible();
      await expect(modifyButton).toBeVisible();

      console.log('✅ All dialog sections verified!');

      // Step 7: Test Accept functionality
      console.log('Step 7: Testing Accept & Proceed...');

      await acceptButton.click();

      // Verify dialog closed
      await expect(recommendationDialog).not.toBeVisible({ timeout: 5000 });

      // Verify toast notification appeared
      await expect(page.locator('text=/Recommendations Accepted|accepted/i')).toBeVisible({ timeout: 5000 });

      // Verify recommendations were stored in localStorage
      const storedRecommendations = await page.evaluate(() => {
        return localStorage.getItem('acceptedRecommendations');
      });

      expect(storedRecommendations).toBeTruthy();
      console.log('✅ Recommendations stored in localStorage');

      const recommendations = JSON.parse(storedRecommendations);
      console.log('Accepted Recommendations:', {
        dataSize: recommendations.expectedDataSize,
        complexity: recommendations.analysisComplexity,
        analyses: recommendations.recommendedAnalyses?.length || 0,
        cost: recommendations.costEstimate,
        time: recommendations.timeEstimate
      });

    } catch (error) {
      console.error('❌ Agent Recommendation Dialog did not appear within timeout');
      console.error('Error:', error);

      // Take screenshot for debugging
      await page.screenshot({ path: 'test-screenshots/agent-recommendation-timeout.png', fullPage: true });

      // Check if there were any errors
      const errors = await page.evaluate(() => {
        return (window as any).lastError || 'No errors captured';
      });
      console.log('Page errors:', errors);

      throw error;
    }
  });

  test('should allow user to modify recommendations', async ({ page }) => {
    // Similar setup as above test
    console.log('Testing modify recommendations workflow...');

    // Authenticate and navigate (abbreviated for this test)
    await page.goto('http://localhost:5176/journeys/business/data');
    await page.waitForLoadState('networkidle');

    // Store test questions
    await page.evaluate(() => {
      localStorage.setItem('projectQuestions', JSON.stringify(['Test question']));
      localStorage.setItem('businessContext', JSON.stringify({ industry: 'Test' }));
    });

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    const filePath = path.resolve('C:/Users/scmak/Documents/Work/Projects/Chimari/Consulting_BYOD/sampledata/HR/EmployeeRoster.xlsx');
    await fileInput.setInputFiles(filePath);

    // Wait for recommendation dialog
    const recommendationDialog = page.locator('[role="dialog"]:has-text("Agent Recommendations")');

    try {
      await recommendationDialog.waitFor({ timeout: 15000 });

      // Click Modify Configuration button
      const modifyButton = page.locator('button:has-text("Modify")');
      await modifyButton.click();

      // Verify dialog closed
      await expect(recommendationDialog).not.toBeVisible({ timeout: 5000 });

      // Verify toast notification
      await expect(page.locator('text=/Customization|customize/i')).toBeVisible({ timeout: 5000 });

      // Verify draft recommendations stored
      const draftRecommendations = await page.evaluate(() => {
        return localStorage.getItem('draftRecommendations');
      });

      expect(draftRecommendations).toBeTruthy();
      console.log('✅ Draft recommendations stored for customization');

    } catch (error) {
      console.error('❌ Modify workflow test failed');
      await page.screenshot({ path: 'test-screenshots/modify-workflow-failed.png', fullPage: true });
      throw error;
    }
  });
});
