/**
 * E2E Tests: Multi-Agent Upload Flow
 *
 * Tests the complete user journey:
 * Upload CSV → Multi-Agent Coordination → Checkpoint Display → User Feedback → Processing
 *
 * This test validates the integration of:
 * - File upload and schema detection
 * - Multi-agent consultation (Data Engineer, Data Scientist, Business Agent)
 * - Project Manager synthesis
 * - Checkpoint presentation via WebSocket
 * - User feedback handling
 * - Workflow continuation
 */

import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data file path
const TEST_CSV_PATH = path.join(__dirname, '../../fixtures/test-customer-data.csv');

// Helper to create test CSV if it doesn't exist
function ensureTestCSV() {
  const dir = path.dirname(TEST_CSV_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(TEST_CSV_PATH)) {
    const csvContent = `customer_id,name,email,age,purchase_amount,last_purchase_date,segment
1,John Doe,john@example.com,34,1250.50,2024-01-15,premium
2,Jane Smith,jane@example.com,28,890.25,2024-01-10,standard
3,Bob Johnson,bob@example.com,45,2100.00,2024-01-12,premium
4,Alice Williams,alice@example.com,31,450.75,2024-01-08,basic
5,Charlie Brown,charlie@example.com,52,1800.30,2024-01-14,premium
6,Diana Prince,diana@example.com,29,680.00,2024-01-09,standard
7,Evan Davis,evan@example.com,38,1420.50,2024-01-13,premium
8,Fiona Green,fiona@example.com,26,320.25,2024-01-07,basic
9,George Miller,george@example.com,41,1650.75,2024-01-11,premium
10,Hannah Lee,hannah@example.com,33,920.00,2024-01-06,standard`;
    
    fs.writeFileSync(TEST_CSV_PATH, csvContent);
  }
}

test.describe('Multi-Agent Upload Flow E2E', () => {
  // Increase timeout for these tests since they involve real backend processing
  test.setTimeout(120000); // 2 minutes per test
  
  test.beforeEach(async ({ page }) => {
    // Ensure test CSV exists
    ensureTestCSV();

    // Navigate to login page with longer timeout (allow time for server startup)
    await page.goto('/auth/login', { timeout: 60000 });
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('domcontentloaded');
    
    // Login as test user - use type selectors like other tests
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpassword123');
    await page.click('button[type="submit"]');
    
    // Wait for redirect (might go to / or /dashboard)
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    
    // If we're on the home page, navigate to dashboard
    if (page.url().endsWith('/')) {
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
    }
  });

  test('complete upload and coordination flow', async ({ page }) => {
    // Step 1: Click "Upload New Dataset" button from dashboard
    await page.click('button:has-text("Upload New Dataset")');
    
    // Wait for upload modal to appear
    await page.waitForSelector('input[name="projectName"]', { timeout: 5000 });
    
    const projectName = `E2E Test Project ${randomUUID().substring(0, 8)}`;
    
    // Step 2: Fill in project details in upload modal
    await page.fill('input[name="projectName"]', projectName);
    
    // Check if description field exists (it may be optional)
    const descriptionField = page.locator('textarea[name="description"]');
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill('E2E test for multi-agent coordination');
    }
    
    // Step 3: Upload CSV file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_CSV_PATH);
    
    // Step 4: Click "Upload & Analyze" button
    await page.click('button:has-text("Upload & Analyze")');
    
    // Handle PII dialog if it appears
    const piiDialog = page.locator('[data-testid="pii-dialog"]');
    try {
      if (await piiDialog.isVisible({ timeout: 5000 })) {
        console.log('PII dialog detected, clicking Proceed...');
        await page.click('button:has-text("Proceed")');
      }
    } catch (e) {
      console.log('No PII dialog appeared');
    }
    
    // Step 5: Wait for multi-agent coordination to trigger
    // The system should automatically detect the upload and trigger coordination
    await page.waitForSelector('[data-testid="multi-agent-checkpoint"]', { timeout: 30000 });
    
    // Step 6: Verify coordination checkpoint appears
    const checkpointCard = page.locator('[data-testid="multi-agent-checkpoint"]');
    
    await expect(checkpointCard.first()).toBeVisible({ timeout: 20000 });
    
    // Step 5: Verify overall assessment is displayed
    const assessmentBadge = page.locator('text=/proceed|caution|revise|not feasible/i').first();
    await expect(assessmentBadge).toBeVisible({ timeout: 5000 });
    
    const assessmentText = await assessmentBadge.textContent();
    expect(assessmentText).toBeTruthy();
    console.log('Overall Assessment:', assessmentText);

    // Step 6: Verify expert consensus metrics are shown
    await expect(page.locator('text=/data quality/i')).toBeVisible();
    await expect(page.locator('text=/feasibility/i')).toBeVisible();
    await expect(page.locator('text=/business value/i')).toBeVisible();

    // Step 7: View expert opinions
    const viewExpertsButton = page.locator('button:has-text("View Expert Opinions")').or(
      page.locator('button:has-text("Show Expert Details")')
    );
    
    if (await viewExpertsButton.count() > 0) {
      await viewExpertsButton.first().click();
      
      // Verify all three expert cards appear
      await expect(page.locator('text=/data engineer/i')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=/data scientist/i')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=/business/i')).toBeVisible({ timeout: 5000 });
    }

    // Step 8: Provide feedback and proceed
    const feedbackTextarea = page.locator('textarea[placeholder*="feedback"]').or(
      page.locator('textarea[placeholder*="comment"]')
    );
    
    if (await feedbackTextarea.count() > 0) {
      await feedbackTextarea.first().fill('The analysis looks comprehensive. Proceeding with the recommendations.');
    }
    
    // Click proceed button
    const proceedButton = page.locator('button:has-text("Proceed")').or(
      page.locator('button:has-text("Continue")').or(
        page.locator('button:has-text("Accept")')
      )
    );
    
    await proceedButton.first().click();
    
    // Step 9: Verify workflow continues
    // Should see confirmation or next step indicator
    await expect(
      page.locator('text=/processing|analyzing|continuing/i').or(
        page.locator('text=/feedback.*received/i')
      )
    ).toBeVisible({ timeout: 10000 });
  });

  test('handles coordination rejection and revision request', async ({ page }) => {
    // Upload new dataset with project creation
    await page.click('button:has-text("Upload New Dataset")');
    await page.waitForSelector('input[name="projectName"]', { timeout: 5000 });
    
    const projectName = `E2E Revision Test ${randomUUID().substring(0, 8)}`;
    await page.fill('input[name="projectName"]', projectName);
    
    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_CSV_PATH);
    await page.click('button:has-text("Upload & Analyze")');
    
    // Handle PII dialog if it appears
    try {
      const piiDialog = page.locator('[data-testid="pii-dialog"]');
      if (await piiDialog.isVisible({ timeout: 5000 })) {
        await page.click('button:has-text("Proceed")');
      }
    } catch (e) {
      // No PII dialog
    }
    
    // Wait for checkpoint
    await page.waitForSelector('[data-testid="multi-agent-checkpoint"]', { timeout: 30000 });
    
    // Provide critical feedback
    const feedbackTextarea = page.locator('textarea[placeholder*="feedback"]').first();
    if (await feedbackTextarea.count() > 0) {
      await feedbackTextarea.fill('The proposed methodology needs significant revision. Please focus more on data quality issues.');
    }
    
    // Click reject/revise button
    const reviseButton = page.locator('button:has-text("Revise")').or(
      page.locator('button:has-text("Reject")').or(
        page.locator('button:has-text("Request Changes")')
      )
    );
    
    if (await reviseButton.count() > 0) {
      await reviseButton.first().click();
      
      // Verify revision acknowledgment
      await expect(
        page.locator('text=/revision.*requested/i').or(
          page.locator('text=/feedback.*submitted/i')
        )
      ).toBeVisible({ timeout: 10000 });
    }
  });

  test('displays confidence scores for each expert', async ({ page }) => {
    // Upload new dataset
    await page.click('button:has-text("Upload New Dataset")');
    await page.waitForSelector('input[name="projectName"]');
    
    await page.fill('input[name="projectName"]', `Confidence Test ${randomUUID().substring(0, 8)}`);
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_CSV_PATH);
    await page.click('button:has-text("Upload & Analyze")');
    
    // Handle PII dialog
    try {
      const piiDialog = page.locator('[data-testid="pii-dialog"]');
      if (await piiDialog.isVisible({ timeout: 5000 })) {
        await page.click('button:has-text("Proceed")');
      }
    } catch (e) {}
    
    // Wait for checkpoint
    await page.waitForSelector('[data-testid="multi-agent-checkpoint"]', { timeout: 30000 });
    
    // Verify confidence percentages are displayed
    const confidenceBadges = page.locator('text=/%.*confident/i');
    const count = await confidenceBadges.count();
    
    expect(count).toBeGreaterThan(0);
    console.log(`Found ${count} confidence indicators`);
    
    // Verify confidence values are reasonable (between 0-100%)
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await confidenceBadges.nth(i).textContent();
      const match = text?.match(/(\d+)%/);
      if (match) {
        const confidence = parseInt(match[1]);
        expect(confidence).toBeGreaterThanOrEqual(0);
        expect(confidence).toBeLessThanOrEqual(100);
        console.log(`Confidence ${i + 1}: ${confidence}%`);
      }
    }
  });

  test('shows key findings and recommendations', async ({ page }) => {
    // Upload new dataset
    await page.click('button:has-text("Upload New Dataset")');
    await page.waitForSelector('input[name="projectName"]');
    
    await page.fill('input[name="projectName"]', `Findings Test ${randomUUID().substring(0, 8)}`);
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_CSV_PATH);
    await page.click('button:has-text("Upload & Analyze")');
    
    // Handle PII dialog
    try {
      const piiDialog = page.locator('[data-testid="pii-dialog"]');
      if (await piiDialog.isVisible({ timeout: 5000 })) {
        await page.click('button:has-text("Proceed")');
      }
    } catch (e) {}
    
    // Wait for checkpoint
    await page.waitForSelector('[data-testid="multi-agent-checkpoint"]', { timeout: 30000 });
    
    // Verify key findings section
    const findingsSection = page.locator('text=/key.*findings/i').locator('..');
    if (await findingsSection.count() > 0) {
      await expect(findingsSection.first()).toBeVisible();
      
      // Should have at least one finding
      const findings = page.locator('li').filter({ hasText: /quality|feasible|value|risk/i });
      const findingsCount = await findings.count();
      expect(findingsCount).toBeGreaterThan(0);
      console.log(`Found ${findingsCount} key findings`);
    }
    
    // Verify recommendations section
    const recommendationsSection = page.locator('text=/recommendations|actions/i').locator('..');
    if (await recommendationsSection.count() > 0) {
      await expect(recommendationsSection.first()).toBeVisible();
      
      const recommendations = page.locator('li').filter({ hasText: /proceed|clean|analyze|review/i });
      const recsCount = await recommendations.count();
      expect(recsCount).toBeGreaterThan(0);
      console.log(`Found ${recsCount} recommendations`);
    }
  });

  test('handles timeout gracefully if coordination takes too long', async ({ page }) => {
    // Upload new dataset
    await page.click('button:has-text("Upload New Dataset")');
    await page.waitForSelector('input[name="projectName"]');
    
    await page.fill('input[name="projectName"]', `Timeout Test ${randomUUID().substring(0, 8)}`);
    
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(TEST_CSV_PATH);
    await page.click('button:has-text("Upload & Analyze")');
    
    // Handle PII dialog
    try {
      const piiDialog = page.locator('[data-testid="pii-dialog"]');
      if (await piiDialog.isVisible({ timeout: 5000 })) {
        await page.click('button:has-text("Proceed")');
      }
    } catch (e) {}
    
    // Look for loading indicator
    const loadingIndicator = page.locator('text=/analyzing|processing|coordinating/i').or(
      page.locator('[role="progressbar"]').or(
        page.locator('.spinner, .loading')
      )
    );
    
    // Should show loading state initially
    if (await loadingIndicator.count() > 0) {
      await expect(loadingIndicator.first()).toBeVisible({ timeout: 5000 });
      console.log('Loading indicator found');
    }
    
    // Eventually should either complete or show timeout message
    // Wait up to 30 seconds for coordination
    const result = await Promise.race([
      page.waitForSelector('text=/multi.*agent/i', { timeout: 30000 }).then(() => 'completed'),
      page.waitForSelector('text=/timeout|too long|try again/i', { timeout: 30000 }).then(() => 'timeout'),
      new Promise(resolve => setTimeout(() => resolve('neither'), 30000))
    ]);
    
    console.log('Coordination result:', result);
    expect(['completed', 'timeout']).toContain(result);
  });
});
