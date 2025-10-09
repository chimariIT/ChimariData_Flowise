import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  const screenshotDir = path.join(__dirname, '..', 'test-results', 'auth-flow-test');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  await page.screenshot({
    path: `${screenshotDir}/${name}.png`,
    fullPage: true
  });

  console.log(`📸 Screenshot: ${name} - ${description || 'Auth flow test step'}`);
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

test.describe('Authentication Flow Testing', () => {

  test('Complete authentication UI flow with mock user', async ({ page }) => {
    console.log('🔐 Testing Complete Authentication Flow');

    // 1. Start at landing page
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-01-landing', 'Landing page with gray theme');

    // 2. Click Get Started to check if it leads to auth
    await page.click('text="Get Started"');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-02-after-get-started', 'Page after clicking Get Started');

    // 3. Go to login page directly
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-03-login-page', 'Login page with gray theme');

    // 4. Switch to registration mode
    const signUpLink = page.locator('text="Sign up"');
    if (await signUpLink.isVisible()) {
      await signUpLink.click();
      await waitForPageLoad(page);
      await takeScreenshot(page, 'flow-04-registration-form', 'Registration form in gray theme');

      // 5. Fill out registration form (test UI responsiveness)
      await page.fill('input[type="email"]', 'test.user@example.com');
      await page.fill('input[name="firstName"]', 'Test');
      await page.fill('input[name="lastName"]', 'User');
      await page.fill('input[name="password"]', 'TestPassword123!');

      const confirmPasswordField = page.locator('input[name="confirmPassword"]');
      if (await confirmPasswordField.isVisible()) {
        await confirmPasswordField.fill('TestPassword123!');
      }

      await takeScreenshot(page, 'flow-05-registration-filled', 'Filled registration form');

      // 6. Try to submit (expect API error but capture it)
      await page.click('button[type="submit"]');
      await waitForPageLoad(page);
      await takeScreenshot(page, 'flow-06-registration-attempt', 'After registration submission attempt');
    }

    // 7. Go back to login form
    await page.goto('/auth/login');
    await waitForPageLoad(page);

    // 8. Try login form
    await page.fill('input[type="email"]', 'demo@example.com');
    await page.fill('input[name="password"]', 'password123');
    await takeScreenshot(page, 'flow-07-login-filled', 'Filled login form');

    // 9. Submit login (expect API error but capture it)
    await page.click('button[type="submit"]');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-08-login-attempt', 'After login attempt');

    // 10. Test that protected pages redirect properly
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-09-dashboard-redirect', 'Dashboard access attempt (should redirect)');

    // 11. Test project page access
    await page.goto('/project/test');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-10-project-redirect', 'Project page access attempt');

    // 12. Mock successful authentication using localStorage
    await page.evaluate(() => {
      // Simulate successful login by setting mock token and user data
      localStorage.setItem('auth_token', 'mock-test-token-12345');
      localStorage.setItem('user', JSON.stringify({
        id: 'test-user-123',
        email: 'test.user@example.com',
        firstName: 'Test',
        lastName: 'User'
      }));
    });

    // 13. Reload and see if app behaves differently (should show authenticated state)
    await page.reload();
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-11-mock-authenticated', 'Page after mock authentication');

    // 14. Try to access dashboard with mock auth
    await page.goto('/dashboard');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'flow-12-dashboard-with-mock-auth', 'Dashboard with mock authentication');

    console.log('✅ Authentication flow UI test complete');
  });

  test('Test authentication endpoints directly', async ({ page }) => {
    console.log('🌐 Testing Authentication Endpoints');

    // Test providers endpoint
    const providersResponse = await page.request.get('/api/auth/providers');
    console.log(`Providers endpoint status: ${providersResponse.status()}`);

    if (providersResponse.ok()) {
      const data = await providersResponse.json();
      console.log('Providers data:', data);
    } else {
      console.log('Providers endpoint failed');
    }

    // Test registration endpoint
    const regResponse = await page.request.post('/api/auth/register', {
      data: {
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        password: 'password123'
      }
    });
    console.log(`Registration endpoint status: ${regResponse.status()}`);

    // Test login endpoint
    const loginResponse = await page.request.post('/api/auth/login', {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    console.log(`Login endpoint status: ${loginResponse.status()}`);

    // Take screenshot of endpoint test results
    await page.goto('/');
    await takeScreenshot(page, 'api-endpoints-test', 'API endpoints test completed');
  });

});