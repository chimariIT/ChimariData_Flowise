/**
 * E2E Test: Agent Recommendation Workflow (With Proper Authentication)
 *
 * This test properly registers/logs in a user before testing the agent workflow
 */

import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Agent Recommendation Workflow (Authenticated)', () => {
  let authToken: string | null = null;
  let userId: string | null = null;

  test('should complete full workflow with authentication', async ({ page }) => {
    // Step 1: Register a new user
    console.log('📝 Step 1: Registering new user...');
    const timestamp = Date.now();
    const testEmail = `agent_test_${timestamp}@example.com`;
    const testPassword = 'TestPassword123!';
    const testFirstName = 'Agent';
    const testLastName = `Test${timestamp}`;

    await page.goto('http://localhost:5176/auth');
    await page.waitForLoadState('networkidle');

    // Click "Sign up" button to switch to register mode
    const signUpButton = page.locator('button:has-text("Sign up")');
    await signUpButton.click();
    await page.waitForTimeout(500); // Wait for form to update

    // Fill registration form using correct IDs
    await page.fill('#email', testEmail);
    await page.fill('#firstName', testFirstName);
    await page.fill('#lastName', testLastName);
    await page.fill('#password', testPassword);
    await page.fill('#confirmPassword', testPassword);

    // Submit registration and wait for response
    const registerPromise = page.waitForResponse(
      response => response.url().includes('/api/auth/register') && response.status() === 200
    );

    await page.click('button[type="submit"]:has-text("Create Account")');

    try {
      const registerResponse = await registerPromise;
      const registerData = await registerResponse.json();

      console.log('✅ Registration successful');

      authToken = registerData.token || registerData.auth_token;
      userId = registerData.user?.id || registerData.userId;

      if (!authToken) {
        // Check localStorage for token
        authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
      }

      console.log(`✅ Auth token obtained: ${authToken?.substring(0, 20)}...`);
      console.log(`✅ User ID: ${userId}`);

    } catch (error) {
      console.error('❌ Registration failed:', error);
      await page.screenshot({ path: 'test-screenshots/registration-failed.png', fullPage: true });
      throw error;
    }

    // Step 2: Verify we're logged in
    console.log('🔐 Step 2: Verifying authentication...');
    await page.waitForTimeout(1000);

    const isAuthenticated = await page.evaluate(() => {
      const token = localStorage.getItem('auth_token');
      const user = localStorage.getItem('user');
      return !!token && !!user;
    });

    if (!isAuthenticated) {
      console.error('❌ Not authenticated after registration');
      await page.screenshot({ path: 'test-screenshots/auth-verification-failed.png', fullPage: true });
      throw new Error('User not authenticated after registration');
    }

    console.log('✅ User authenticated successfully');

    // Step 3: Navigate to data upload step
    console.log('📤 Step 3: Navigating to data upload...');
    await page.goto('http://localhost:5176/journeys/business/data');
    await page.waitForLoadState('networkidle');

    // Store project context
    await page.evaluate(() => {
      localStorage.setItem('projectQuestions', JSON.stringify([
        'What are the engagement scores by leader?',
        'How do team scores compare to company average?',
        'What is the trend over the 3-year period?'
      ]));
      localStorage.setItem('businessContext', JSON.stringify({
        industry: 'Human Resources',
        department: 'People Analytics',
        goals: ['Analyze employee engagement', 'Identify trends']
      }));
    });

    // Step 4: Upload file
    console.log('📁 Step 4: Uploading HR data file...');
    const filePath = path.resolve('C:/Users/scmak/Documents/Work/Projects/Chimari/Consulting_BYOD/sampledata/HR/EmployeeRoster.xlsx');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    console.log('⏳ Waiting for file upload to complete...');

    // Wait for upload to complete (look for success toast or dialog)
    await page.waitForTimeout(3000);

    // Step 5: Wait for Agent Recommendation Dialog
    console.log('🤖 Step 5: Waiting for agent recommendation dialog...');

    const recommendationDialog = page.locator('[role="dialog"]:has-text("Agent Recommendations"), [role="dialog"]:has-text("recommendations")');

    try {
      await recommendationDialog.waitFor({ timeout: 20000, state: 'visible' });
      console.log('✅ Agent Recommendation Dialog appeared!');

      // Take screenshot
      await page.screenshot({
        path: 'test-screenshots/agent-recommendations-dialog.png',
        fullPage: true
      });

      // Verify dialog content
      await expect(page.locator('text=Data Analysis Summary, text=Files Analyzed')).toBeVisible();
      await expect(page.locator('text=Recommended Configuration, text=Analysis Complexity')).toBeVisible();
      await expect(page.locator('text=Estimated Cost, text=Estimated Time')).toBeVisible();

      // Check for action buttons
      const acceptButton = page.locator('button:has-text("Accept")');
      const modifyButton = page.locator('button:has-text("Modify")');

      await expect(acceptButton).toBeVisible();
      await expect(modifyButton).toBeVisible();

      console.log('✅ All dialog elements verified!');

      // Step 6: Accept recommendations
      console.log('✅ Step 6: Accepting recommendations...');
      await acceptButton.click();

      // Verify recommendations were stored
      const storedRecommendations = await page.evaluate(() => {
        return localStorage.getItem('acceptedRecommendations');
      });

      expect(storedRecommendations).toBeTruthy();
      console.log('✅ Recommendations stored successfully');

      const recommendations = JSON.parse(storedRecommendations!);
      console.log('📊 Accepted Recommendations:', {
        complexity: recommendations.analysisComplexity,
        dataSize: recommendations.expectedDataSize,
        analyses: recommendations.recommendedAnalyses?.length || 0,
        cost: recommendations.costEstimate,
        time: recommendations.timeEstimate
      });

      console.log('🎉 Test passed! Agent recommendation workflow completed successfully');

    } catch (error) {
      console.error('❌ Agent Recommendation Dialog did not appear');
      await page.screenshot({
        path: 'test-screenshots/agent-dialog-timeout.png',
        fullPage: true
      });

      // Check for errors in console
      const errors = await page.evaluate(() => {
        return (window as any).lastError || 'No errors captured';
      });
      console.log('Page errors:', errors);

      throw error;
    }
  });
});
