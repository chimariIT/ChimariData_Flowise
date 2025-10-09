import { test, expect, Page } from '@playwright/test';
import { programmaticLogin } from './utils/auth';
import { createTestProjectWithDataset } from './utils/seed';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to take screenshot with consistent naming
async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `test-results/screenshots/${name}.png`, 
    fullPage: true 
  });
}

// Helper function to wait for page to be fully loaded
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // Additional wait for animations
}

test.describe('ChimariData UI Comprehensive Testing', () => {
  let authToken: string;
  let projectId: string;

  test.beforeAll(async ({ request, page }) => {
    // Create screenshots directory
    const screenshotDir = path.join(__dirname, '..', 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // Authenticate for tests that require login
    try {
      // Use shared login helper
      authToken = await programmaticLogin(page as any, request);
      // Seed a project with dataset
      const seeded = await createTestProjectWithDataset(request, authToken, { name: 'UI Test Project' });
      projectId = seeded.projectId;
    } catch (error) {
      console.log('Auth setup failed, some tests may be limited:', error);
    }
  });

  test('01 - Landing Page / Journeys Hub', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Verify page loads correctly
    await expect(page).toHaveTitle(/Chimari/);
    
    // Take screenshot
    await takeScreenshot(page, '01-landing-page');
    
    // Check for key elements
    await expect(page.getByText('ChimariData')).toBeVisible();
    await expect(page.getByText('Choose Your Analytics Journey')).toBeVisible();
  });

  test('02 - Authentication Page - Login', async ({ page }) => {
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '02-auth-login');
    
    // Check login form elements
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your email address')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
  });

  test('03 - Authentication Page - Register', async ({ page }) => {
    await page.goto('/auth/register');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '03-auth-register');
    
    // Check register form elements
    await expect(page.getByText('Create Account')).toBeVisible();
  });

  test('04 - Journey Selection - Non-Tech User', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Look for journey selection buttons
    const nonTechButton = page.getByText('Non-Tech User').first();
    if (await nonTechButton.isVisible()) {
      await nonTechButton.click();
      await waitForPageLoad(page);
    }
    
    await takeScreenshot(page, '04-journey-nontech');
  });

  test('05 - Journey Selection - Business User', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    const businessButton = page.getByText('Business User').first();
    if (await businessButton.isVisible()) {
      await businessButton.click();
      await waitForPageLoad(page);
    }
    
    await takeScreenshot(page, '05-journey-business');
  });

  test('06 - Journey Selection - Technical User', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    const technicalButton = page.getByText('Technical User').first();
    if (await technicalButton.isVisible()) {
      await technicalButton.click();
      await waitForPageLoad(page);
    }
    
    await takeScreenshot(page, '06-journey-technical');
  });

  test('07 - Journey Wizard - Prepare Step', async ({ page }) => {
    await page.goto('/journeys/business/prepare');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '07-journey-prepare');
    
    // Check for journey wizard elements
    await expect(page.getByText('Analysis Preparation')).toBeVisible();
  });

  test('08 - Journey Wizard - Data Step', async ({ page }) => {
    await page.goto('/journeys/business/data');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '08-journey-data');
    
    await expect(page.getByText('Data Preparation')).toBeVisible();
  });

  test('09 - Journey Wizard - Project Setup Step', async ({ page }) => {
    await page.goto('/journeys/business/project-setup');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '09-journey-project-setup');
  });

  test('10 - Journey Wizard - Execute Step', async ({ page }) => {
    await page.goto('/journeys/business/execute');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '10-journey-execute');
  });

  test('11 - Journey Wizard - Pricing Step', async ({ page }) => {
    await page.goto('/journeys/business/pricing');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '11-journey-pricing');
  });

  test('12 - Journey Wizard - Results Step', async ({ page }) => {
    await page.goto('/journeys/business/results');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '12-journey-results');
  });

  test('13 - Pricing Page', async ({ page }) => {
    await page.goto('/pricing');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '13-pricing-page');
    
    await expect(page.getByText('Pricing')).toBeVisible();
  });

  test('14 - Demos Page', async ({ page }) => {
    await page.goto('/demos');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '14-demos-page');
    
    await expect(page.getByText('Demo')).toBeVisible();
  });

  test('15 - Expert Consultation Page', async ({ page }) => {
    await page.goto('/expert-consultation');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '15-expert-consultation');
    
    await expect(page.getByText('Expert Consultation')).toBeVisible();
  });

  test('16 - Home Page (Legacy)', async ({ page }) => {
    await page.goto('/home');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '16-home-legacy');
  });

  test('17 - Projects Page', async ({ page }) => {
    await page.goto('/projects');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '17-projects-page');
  });

  // Tests that require authentication
  test('18 - Dashboard (Authenticated)', async ({ page, context }) => {
    if (!authToken) { test.skip(true, 'Skipping authenticated test - no auth token'); return; }

    // Set auth token in localStorage
    await page.addInitScript((token) => { localStorage.setItem('auth_token', token); }, authToken);

    await page.goto('/dashboard');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '18-dashboard-authenticated');
  });

  test('19 - Project Page (Authenticated)', async ({ page }) => {
    if (!authToken || !projectId) { test.skip(true, 'Skipping authenticated test - no auth token or project'); return; }

    await page.addInitScript((token) => { localStorage.setItem('auth_token', token); }, authToken);

    await page.goto(`/project/${projectId}`);
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '19-project-page-authenticated');
  });

  test('20 - AI Guided Analysis (Authenticated)', async ({ page }) => {
    if (!authToken) { test.skip(true, 'Skipping authenticated test - no auth token'); return; }

    await page.addInitScript((token) => { localStorage.setItem('auth_token', token); }, authToken);

    await page.goto('/ai-guided');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '20-ai-guided-authenticated');
  });

  test('21 - Self Service Analysis (Authenticated)', async ({ page }) => {
    if (!authToken) { test.skip(true, 'Skipping authenticated test - no auth token'); return; }

    await page.addInitScript((token) => {
      localStorage.setItem('auth_token', token);
    }, authToken);

    await page.goto('/self-service');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '21-self-service-authenticated');
  });

  test('22 - Template Based Analysis (Authenticated)', async ({ page }) => {
    if (!authToken) { test.skip(true, 'Skipping authenticated test - no auth token'); return; }

    await page.addInitScript((token) => {
      localStorage.setItem('auth_token', token);
    }, authToken);

    await page.goto('/template-based');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '22-template-based-authenticated');
  });

  test('23 - Checkout Page', async ({ page }) => {
    await page.goto('/checkout');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '23-checkout-page');
  });

  test('24 - Stripe Test Page', async ({ page }) => {
    await page.goto('/stripe-test');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '24-stripe-test');
  });

  test('25 - Visualization Page (if project exists)', async ({ page }) => {
    if (!projectId) { test.skip(true, 'Skipping visualization test - no project'); return; }

    await page.goto(`/visualization/${projectId}`);
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '25-visualization-page');
  });

  test('26 - Descriptive Stats Page (if project exists)', async ({ page }) => {
    if (!projectId) { test.skip(true, 'Skipping stats test - no project'); return; }

    await page.goto(`/stats/${projectId}`);
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '26-descriptive-stats');
  });

  test('27 - 404 Not Found Page', async ({ page }) => {
    await page.goto('/non-existent-page');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '27-404-not-found');
    
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });

  // Mobile responsive tests
  test('28 - Mobile View - Landing Page', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
    
    await page.goto('/');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '28-mobile-landing');
  });

  test('29 - Mobile View - Authentication', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '29-mobile-auth');
  });

  test('30 - Tablet View - Landing Page', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    
    await page.goto('/');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '30-tablet-landing');
  });

  // Test error states and edge cases
  test('31 - Error Handling - Invalid Project ID', async ({ page }) => {
    await page.goto('/project/invalid-id');
    await waitForPageLoad(page);
    
    await takeScreenshot(page, '31-error-invalid-project');
  });

  test('32 - Loading States', async ({ page }) => {
    // Navigate to a page that shows loading
    await page.goto('/');
    
    // Try to catch loading state (might be too fast)
    try {
      await page.waitForSelector('.animate-spin', { timeout: 1000 });
      await takeScreenshot(page, '32-loading-state');
    } catch {
      // Loading was too fast, take regular screenshot
      await takeScreenshot(page, '32-page-loaded');
    }
  });

  // Dark mode testing (if available)
  test('33 - Dark Mode Toggle (if available)', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Look for dark mode toggle
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"]');
    if (await darkModeToggle.isVisible()) {
      await darkModeToggle.click();
      await waitForPageLoad(page);
      await takeScreenshot(page, '33-dark-mode');
    } else {
      await takeScreenshot(page, '33-no-dark-mode');
    }
  });

  // Test form interactions
  test('34 - Form Interactions - File Upload', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Look for file upload areas
    const uploadArea = page.locator('[data-testid="file-upload"]');
    if (await uploadArea.isVisible()) {
      await takeScreenshot(page, '34-file-upload-form');
    } else {
      // Try to find upload button or area
      const uploadButton = page.getByText('Upload').first();
      if (await uploadButton.isVisible()) {
        await uploadButton.click();
        await waitForPageLoad(page);
        await takeScreenshot(page, '34-upload-modal');
      } else {
        await takeScreenshot(page, '34-no-upload-found');
      }
    }
  });

  test('35 - Final Summary Screenshot', async ({ page }) => {
    await page.goto('/');
    await waitForPageLoad(page);
    
    // Add a summary overlay or just take final screenshot
    await takeScreenshot(page, '35-final-summary');
    
    console.log('UI Testing Complete! Screenshots saved to test-results/screenshots/');
  });
});

