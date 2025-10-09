import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  const screenshotDir = path.join(__dirname, '..', 'test-results', 'auth-verification');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  await page.screenshot({
    path: `${screenshotDir}/${name}.png`,
    fullPage: true
  });

  console.log(`📸 Screenshot: ${name} - ${description || 'Auth verification step'}`);
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page, timeout = 10000) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
    await page.waitForTimeout(2000);
  } catch (error) {
    console.log(`⚠️ Page load timeout, continuing: ${error.message}`);
  }
}

test.describe('Authentication Verification', () => {

  test('Verify authentication flow and capture screens', async ({ page }) => {
    console.log('🔐 Testing Authentication Flow');

    // 1. Go to login page
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'auth-01-login-initial', 'Initial login page');

    // 2. Check if we can toggle to registration
    try {
      const signUpLink = page.locator('text="Sign up"');
      if (await signUpLink.isVisible()) {
        await signUpLink.click();
        await waitForPageLoad(page);
        await takeScreenshot(page, 'auth-02-registration-form', 'Registration form after clicking Sign up');

        // Check if registration fields are present
        const firstNameField = page.locator('input[name="firstName"]');
        const lastNameField = page.locator('input[name="lastName"]');
        const confirmPasswordField = page.locator('input[name="confirmPassword"]');

        console.log(`First Name field visible: ${await firstNameField.isVisible()}`);
        console.log(`Last Name field visible: ${await lastNameField.isVisible()}`);
        console.log(`Confirm Password field visible: ${await confirmPasswordField.isVisible()}`);

        // Try to register a test user if form fields are available
        if (await firstNameField.isVisible()) {
          await page.fill('input[type="email"]', 'test.user@example.com');
          await page.fill('input[name="firstName"]', 'Test');
          await page.fill('input[name="lastName"]', 'User');
          await page.fill('input[name="password"]', 'TestPassword123!');
          if (await confirmPasswordField.isVisible()) {
            await page.fill('input[name="confirmPassword"]', 'TestPassword123!');
          }
          await takeScreenshot(page, 'auth-03-registration-filled', 'Registration form filled out');

          // Submit registration
          await page.click('button[type="submit"]');
          await waitForPageLoad(page);
          await takeScreenshot(page, 'auth-04-post-registration', 'After registration submission');
        }
      }
    } catch (error) {
      console.log(`⚠️ Registration flow error: ${error.message}`);
    }

    // 3. Try to access a protected page to see authentication behavior
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'auth-05-dashboard-attempt', 'Attempting to access dashboard without auth');

    // 4. Try to access project page
    await page.goto('/project/test');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'auth-06-project-attempt', 'Attempting to access project page without auth');

    // 5. Go back to main page
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'auth-07-main-page', 'Main page - final state');

    console.log('✅ Authentication verification complete');
  });

  test('Check API endpoints are working', async ({ page }) => {
    console.log('🌐 Testing API Endpoints');

    // Test API endpoint directly
    const response = await page.request.get('/api/auth/providers');
    console.log(`API /auth/providers status: ${response.status()}`);

    if (response.ok()) {
      const data = await response.json();
      console.log('API response:', data);
    }

    // Check if server is properly handling API vs page routes
    await page.goto('/api/auth/providers');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'api-01-providers-endpoint', 'API providers endpoint response');
  });

});