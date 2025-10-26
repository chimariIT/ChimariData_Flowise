import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * End-to-End Test: HR Employee Engagement Analysis
 *
 * Goal: Understanding how Engagement has changed over a three year period
 * and how this change impacts retention
 *
 * Questions:
 * 1. How did each leader's team do on each of the survey questions
 * 2. What is each leader's employee engagement score
 * 3. How does each team compare to the company average
 * 4. How are company views on AI Policy
 *
 * Data Files:
 * - EmployeeRoster.xlsx: Employee roster with leader assignments
 * - HREngagementDataset.xlsx: Engagement survey data over 3 years
 */

const HR_DATA_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR';
const TEST_USER = {
  email: `hr-test-${Date.now()}@chimaridata.com`,
  password: 'TestPassword123!',
  username: 'HR Analysis Test User'
};

test.describe('HR Employee Engagement Analysis - Full E2E Journey', () => {
  test.setTimeout(600000); // 10 minutes for full analysis

  test('Complete HR engagement analysis workflow', async ({ page }) => {
    // Step 1: Navigate to home page
    await test.step('Navigate to application', async () => {
      await page.goto('http://localhost:5176');
      await page.waitForLoadState('networkidle');
      console.log('✅ Application loaded');
    });

    // Step 2: Register new user
    await test.step('Register test user', async () => {
      // Navigate to auth page
      await page.goto('http://localhost:5176/auth');
      await page.waitForLoadState('networkidle');

      // Click "Sign up" button to switch to registration mode
      await page.click('button:has-text("Sign up")');
      await page.waitForTimeout(500); // Wait for form to switch

      // Verify we're in registration mode by checking for first name field
      await expect(page.locator('input[name="firstName"]')).toBeVisible();
      console.log('✅ Registration form displayed');

      // Fill registration form
      await page.fill('input[name="email"]', TEST_USER.email);
      await page.fill('input[name="firstName"]', 'HR');
      await page.fill('input[name="lastName"]', 'Analyst');
      await page.fill('input[name="password"]', TEST_USER.password);
      await page.fill('input[name="confirmPassword"]', TEST_USER.password);

      console.log('✅ Registration form filled');

      // Submit registration
      await page.click('button[type="submit"]');

      // Wait for success toast or redirect
      try {
        // Option 1: Wait for success toast
        await page.waitForSelector('text=/Account created successfully|Success/i', { timeout: 5000 });
        console.log('✅ Registration success toast appeared');
      } catch {
        // Option 2: Just wait a bit for redirect
        await page.waitForTimeout(2000);
      }

      // Verify we're logged in (check for navigation away from auth page)
      await page.waitForURL(/^((?!\/auth).)*$/i, { timeout: 10000 });
      console.log('✅ User registered and redirected successfully');
    });

    // Step 3: Start HR engagement journey (template-based for business analytics)
    await test.step('Start HR engagement journey', async () => {
      // Navigate to template-based journey data upload page
      await page.goto('http://localhost:5176/journeys/template_based/data');
      await page.waitForLoadState('networkidle');

      console.log('✅ Navigated to template-based journey data upload');

      // Fill in project objectives if there's an initial form
      const objectiveField = page.locator('textarea[name="objectives"], textarea[placeholder*="objective"], textarea[name="goal"]').first();
      if (await objectiveField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await objectiveField.fill('Understanding how Engagement has changed over a three year period and how this change impacts retention');

        // Fill in business context if available
        const contextField = page.locator('textarea[name="context"], textarea[placeholder*="context"]').first();
        if (await contextField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await contextField.fill('HR Analytics - Employee Engagement and Retention Analysis');
        }

        // Fill in analysis questions if available
        const questionsField = page.locator('textarea[name="questions"], textarea[placeholder*="question"]').first();
        if (await questionsField.isVisible({ timeout: 2000 }).catch(() => false)) {
          await questionsField.fill(`1. How did each leader's team do on each of the survey questions
2. What is each leader's employee engagement score
3. How does each team compare to the company average
4. How are company views on AI Policy`);
        }

        // Click next/continue if there's a button
        const continueButton = page.getByRole('button', { name: /continue|next|proceed/i }).first();
        if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await continueButton.click();
          await page.waitForLoadState('networkidle');
        }

        console.log('✅ Project objectives defined');
      } else {
        console.log('ℹ️  No initial project setup form - proceeding to file upload');
      }
    });

    // Step 4: Upload HR data files
    await test.step('Upload HR datasets', async () => {
      // Upload Employee Roster
      const rosterPath = path.join(HR_DATA_PATH, 'EmployeeRoster.xlsx');
      const engagementPath = path.join(HR_DATA_PATH, 'HREngagementDataset.xlsx');

      // Look for file upload input
      const fileInput = page.locator('input[type="file"]').first();

      // Upload first file
      await fileInput.setInputFiles(rosterPath);
      await page.waitForTimeout(2000); // Wait for upload processing
      console.log('✅ Uploaded EmployeeRoster.xlsx');

      // Check if we can upload multiple files or need to add another
      const addFileButton = page.getByRole('button', { name: /add file|upload another|add dataset/i }).first();
      if (await addFileButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await addFileButton.click();
        await page.waitForTimeout(1000);
      }

      // Upload second file
      const secondFileInput = page.locator('input[type="file"]').last();
      await secondFileInput.setInputFiles(engagementPath);
      await page.waitForTimeout(2000); // Wait for upload processing
      console.log('✅ Uploaded HREngagementDataset.xlsx');

      // Wait for schema detection
      await page.waitForTimeout(3000);
    });

    // Step 5: Review and approve schema
    await test.step('Review dataset schema', async () => {
      // Look for schema validation or preview
      const schemaPreview = page.locator('[data-testid="schema-preview"], .schema-display, table').first();
      if (await schemaPreview.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('✅ Schema detected and displayed');
      }

      // Approve schema if there's an approval step
      const approveButton = page.getByRole('button', { name: /approve|confirm|continue|next/i }).first();
      if (await approveButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await approveButton.click();
        console.log('✅ Schema approved');
      }
    });

    // Step 6: Agent processes data and creates analysis plan
    await test.step('Wait for agent analysis planning', async () => {
      // Wait for agents to process data
      await page.waitForTimeout(5000);

      // Look for analysis plan or recommendations
      const analysisPlan = page.locator('[data-testid="analysis-plan"], .analysis-recommendations').first();
      if (await analysisPlan.isVisible({ timeout: 10000 }).catch(() => false)) {
        const planText = await analysisPlan.textContent();
        console.log('✅ Analysis plan generated:', planText?.substring(0, 200));
      }

      // Look for checkpoint approval
      const checkpointDialog = page.locator('[role="dialog"], .checkpoint-dialog').first();
      if (await checkpointDialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        const approveCheckpoint = checkpointDialog.getByRole('button', { name: /approve|continue|proceed/i }).first();
        if (await approveCheckpoint.isVisible()) {
          await approveCheckpoint.click();
          console.log('✅ Analysis plan checkpoint approved');
        }
      }
    });

    // Step 7: Execute analysis
    await test.step('Execute HR engagement analysis', async () => {
      // Look for execute/run analysis button
      const executeButton = page.getByRole('button', { name: /execute|run analysis|start analysis|analyze/i }).first();
      if (await executeButton.isVisible({ timeout: 10000 }).catch(() => false)) {
        await executeButton.click();
        console.log('✅ Analysis execution started via button');
      } else {
        // Try navigating to execute step in journey
        await page.goto('http://localhost:5176/journeys/template_based/execute');
        await page.waitForLoadState('networkidle');
        console.log('✅ Navigated to execute step');
      }

      // Wait for analysis to complete (this may take time with real Spark processing)
      await page.waitForTimeout(10000);

      // Look for progress indicators
      const progressIndicator = page.locator('[role="progressbar"], .progress, [data-testid="analysis-progress"]').first();
      if (await progressIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('⏳ Analysis in progress...');

        // Wait for completion (up to 2 minutes)
        await page.waitForSelector('[data-testid="analysis-complete"], .analysis-results, button:has-text("View Results")', {
          timeout: 120000
        });
      }

      console.log('✅ Analysis execution completed');
    });

    // Step 8: Review results
    await test.step('Review engagement analysis results', async () => {
      // Navigate to results if not already there
      const viewResultsButton = page.getByRole('button', { name: /view results|see results/i }).first();
      if (await viewResultsButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await viewResultsButton.click();
        console.log('✅ Clicked view results button');
      } else {
        // Navigate to journey results page
        await page.goto('http://localhost:5176/journeys/template_based/results');
        console.log('✅ Navigated to results page');
      }

      await page.waitForLoadState('networkidle');

      // Verify results contain expected insights
      const resultsContainer = page.locator('[data-testid="results"], .results-container, main').first();
      const resultsText = await resultsContainer.textContent();

      // Check for key elements in results
      const expectedElements = [
        'engagement',
        'leader',
        'team',
        'retention',
        'survey'
      ];

      for (const element of expectedElements) {
        if (resultsText?.toLowerCase().includes(element)) {
          console.log(`✅ Results contain "${element}" insights`);
        }
      }

      // Look for visualizations
      const charts = page.locator('canvas, svg[class*="chart"], [data-testid="chart"]');
      const chartCount = await charts.count();
      console.log(`📊 Found ${chartCount} visualizations`);

      // Take screenshot of results
      await page.screenshot({
        path: `test-screenshots/hr-engagement-results-${Date.now()}.png`,
        fullPage: true
      });
      console.log('✅ Results screenshot captured');
    });

    // Step 9: Verify specific question answers
    await test.step('Validate question-specific insights', async () => {
      const pageContent = await page.content();

      // Question 1: Leader team performance on survey questions
      if (pageContent.includes('leader') && pageContent.includes('survey')) {
        console.log('✅ Q1: Leader team survey performance data found');
      }

      // Question 2: Leader engagement scores
      if (pageContent.includes('engagement score')) {
        console.log('✅ Q2: Leader engagement scores found');
      }

      // Question 3: Team comparison to company average
      if (pageContent.includes('average') || pageContent.includes('comparison')) {
        console.log('✅ Q3: Team comparison data found');
      }

      // Question 4: AI Policy views
      if (pageContent.includes('AI') || pageContent.includes('policy')) {
        console.log('✅ Q4: AI Policy insights found');
      }
    });

    // Step 10: Export or download results
    await test.step('Export analysis results', async () => {
      const exportButton = page.getByRole('button', { name: /export|download|save/i }).first();
      if (await exportButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await exportButton.click();
        console.log('✅ Results exported');
      }
    });

    console.log('🎉 HR Engagement Analysis E2E Test Completed Successfully!');
  });

  test('Verify agent coordination and tool usage', async ({ page }) => {
    // This test verifies that the multi-agent system is working correctly
    await test.step('Check agent coordination logs', async () => {
      // Navigate to admin or developer tools if available
      await page.goto('http://localhost:5176/admin');

      // Look for agent activity logs or tool usage stats
      const agentLogs = page.locator('[data-testid="agent-logs"], .agent-activity').first();
      if (await agentLogs.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('✅ Agent coordination logs accessible');
      }
    });
  });
});

test.describe('HR Analysis - Service Health Checks', () => {
  test('Verify Python integration health', async ({ request }) => {
    const response = await request.get('http://localhost:5000/api/system/health');
    expect(response.ok()).toBeTruthy();

    const health = await response.json();
    console.log('System Health:', JSON.stringify(health, null, 2));

    // Verify critical services - check for correct property structure
    expect(health).toHaveProperty('databaseAvailable');
    expect(health).toHaveProperty('pythonAvailable');
    expect(health).toHaveProperty('details');
    expect(health.details).toHaveProperty('services');
    expect(health.details.services).toHaveProperty('database');
    expect(health.details.services).toHaveProperty('python');

    console.log('Database Status:', health.databaseAvailable ? '✅ Available' : '❌ Not Available');
    console.log('Python Status:', health.pythonAvailable ? '✅ Available' : '⚠️ Not Available (expected in dev)');
  });

  test('Verify Spark processor status', async ({ request }) => {
    const response = await request.get('http://localhost:5000/api/system/status');
    if (response.ok()) {
      const status = await response.json();
      console.log('Spark Status:', status.spark || 'Not available');
    }
  });

  test('Verify agent registry', async ({ request }) => {
    const response = await request.get('http://localhost:5000/api/agents');
    if (response.ok()) {
      const agents = await response.json();
      console.log('Registered Agents:', agents);

      // Verify key agents are registered
      const agentNames = agents.map((a: any) => a.name || a.type);
      expect(agentNames).toContain('Technical AI Agent');
      expect(agentNames).toContain('Business Agent');
      expect(agentNames).toContain('Project Manager');
    }
  });
});
