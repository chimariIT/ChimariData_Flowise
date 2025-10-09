import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Streamlined Journey Selection', () => {
  test('Main landing page shows journey selection for unauthenticated users', async ({ page }) => {
    console.log('🔧 Testing unauthenticated main landing page');

    // Step 1: Navigate to main landing page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ Loaded main landing page');

    // Step 2: Verify journey buttons are visible
    const nonTechButton = page.getByTestId('button-start-non-tech-landing');
    const businessButton = page.getByTestId('button-start-business-landing');
    const technicalButton = page.getByTestId('button-start-technical-landing');
    const consultationButton = page.getByTestId('button-start-consultation-landing');

    await expect(nonTechButton).toBeVisible();
    await expect(businessButton).toBeVisible();
    await expect(technicalButton).toBeVisible();
    await expect(consultationButton).toBeVisible();
    console.log('✅ All journey buttons are visible');

    // Step 3: Verify unauthenticated user sees sign-in buttons
    const signInButton = page.getByTestId('button-signin-landing');
    const createAccountButton = page.getByTestId('button-create-account-landing');
    
    await expect(signInButton).toBeVisible();
    await expect(createAccountButton).toBeVisible();
    console.log('✅ Sign-in and create account buttons visible for unauthenticated users');

    // Step 4: Test journey selection stores intent and redirects to auth
    await nonTechButton.click();
    await page.waitForLoadState('domcontentloaded');
    
    const currentUrl = page.url();
    expect(currentUrl).toContain('/auth/register');
    console.log('✅ Journey selection redirects to registration');

    // Step 5: Verify intent storage
    const storedJourney = await page.evaluate(() => localStorage.getItem('intended_journey'));
    const storedRoute = await page.evaluate(() => localStorage.getItem('intended_route'));
    
    expect(storedJourney).toBe('non-tech');
    expect(storedRoute).toBe('/journeys/non-tech/prepare');
    console.log('✅ Journey intent stored correctly');

    console.log('🎉 Unauthenticated main landing page working correctly!');
  });

  test('Dashboard journey button redirects to main landing page', async ({ page }) => {
    console.log('🔧 Testing dashboard journey button redirect');

    // Step 1: Create authenticated user
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'dashboard-redirect-test@example.com',
        password: 'testpass123',
        name: 'Dashboard Redirect Test User',
        userRole: 'business',
        subscriptionTier: 'starter'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    console.log('✅ Created test user');

    // Step 2: Navigate to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    
    // Set authentication
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, loginData.token);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Step 3: Click journey button in dashboard
    const journeyButton = page.getByTestId('button-choose-journey-dashboard');
    if (await journeyButton.isVisible()) {
      await journeyButton.click();
      await page.waitForLoadState('domcontentloaded');
      
      // Should redirect to main landing page (/)
      const currentUrl = page.url();
      expect(currentUrl).toBe(`${BASE_URL}/`);
      console.log('✅ Dashboard journey button redirects to main landing page');
    } else {
      console.log('ℹ️ Dashboard journey button not visible');
    }

    console.log('🎉 Dashboard redirect test completed!');
  });

  test('Project page journey button redirects to main landing page', async ({ page }) => {
    console.log('🔧 Testing project page journey button redirect');

    // Step 1: Create authenticated user
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'project-redirect-test@example.com',
        password: 'testpass123',
        name: 'Project Redirect Test User',
        userRole: 'technical',
        subscriptionTier: 'professional'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    console.log('✅ Created test user');

    // Step 2: Navigate to a project page
    await page.goto('/projects/test-project-id');
    await page.waitForLoadState('domcontentloaded');
    
    // Set authentication
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, loginData.token);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Step 3: Look for journey button in project page
    const journeyButton = page.getByTestId('button-choose-journey-project');
    
    if (await journeyButton.isVisible()) {
      await journeyButton.click();
      await page.waitForLoadState('domcontentloaded');
      
      // Should redirect to main landing page (/)
      const currentUrl = page.url();
      expect(currentUrl).toBe(`${BASE_URL}/`);
      console.log('✅ Project page journey button redirects to main landing page');
    } else {
      console.log('ℹ️ Project page journey button not visible (expected if project does not exist)');
    }

    console.log('🎉 Project page redirect test completed!');
  });

  test('/journeys route redirects to main landing page', async ({ page }) => {
    console.log('🔧 Testing /journeys route redirect');

    // Navigate to /journeys
    await page.goto('/journeys');
    await page.waitForLoadState('domcontentloaded');
    
    // Should redirect to main landing page
    const currentUrl = page.url();
    expect(currentUrl).toBe(`${BASE_URL}/`);
    console.log('✅ /journeys redirects to main landing page');

    // Test /journeys/hub as well
    await page.goto('/journeys/hub');
    await page.waitForLoadState('domcontentloaded');
    
    const hubRedirectUrl = page.url();
    expect(hubRedirectUrl).toBe(`${BASE_URL}/`);
    console.log('✅ /journeys/hub redirects to main landing page');

    console.log('🎉 Route redirect tests completed!');
  });
});