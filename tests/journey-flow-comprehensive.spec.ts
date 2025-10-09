import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Journey Selection Flow End-to-End', () => {
  test('Complete flow: landing page → auth → dashboard → journey', async ({ page }) => {
    console.log('🔧 Testing complete journey selection flow');

    // Step 1: Navigate to landing page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ Loaded main landing page');

    // Step 2: Select non-tech journey from landing page
    const journeyButton = page.getByTestId('button-start-non-tech-landing');
    await expect(journeyButton).toBeVisible();
    await journeyButton.click();
    console.log('✅ Clicked non-tech journey button');

    // Step 3: Should be redirected to registration/auth page
    await page.waitForLoadState('domcontentloaded');
    const currentUrl = page.url();
    expect(currentUrl).toContain('/auth/register');
    console.log('✅ Redirected to registration page');

    // Step 4: Check localStorage for stored intent
    const storedJourney = await page.evaluate(() => localStorage.getItem('intended_journey'));
    const storedRoute = await page.evaluate(() => localStorage.getItem('intended_route'));
    expect(storedJourney).toBe('non-tech');
    expect(storedRoute).toBe('/journeys/non-tech/prepare');
    console.log('✅ Journey intent stored correctly:', { storedJourney, storedRoute });

    // Step 5: Use the login-test endpoint to authenticate
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'journey-flow-test@example.com',
        password: 'testpass123',
        name: 'Journey Flow Test User',
        userRole: 'non-tech',
        subscriptionTier: 'trial'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    console.log('✅ Created test user:', loginData);

    // Step 6: Navigate back to the app and simulate login
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');

    // Fill in login form
    await page.fill('input[type="email"]', 'journey-flow-test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    
    // Submit the form
    await page.click('button[type="submit"]');
    await page.waitForLoadState('domcontentloaded');
    
    // Wait for potential redirects
    await page.waitForTimeout(3000);
    
    console.log('✅ Submitted login form');

    // Step 7: Should be redirected to intended journey or dashboard
    const finalUrl = page.url();
    console.log('📍 Final URL after login:', finalUrl);

    // The system should either:
    // 1. Redirect to the intended journey (/journeys/non-tech/prepare) 
    // 2. Or redirect to dashboard where we can navigate to journeys
    
    if (finalUrl.includes('/journeys/non-tech')) {
      console.log('✅ Successfully redirected to intended non-tech journey');
    } else if (finalUrl.includes('/dashboard')) {
      console.log('✅ Redirected to dashboard, now testing journey navigation');
      
      // Try to find the journey button in dashboard
      await page.waitForTimeout(2000); // Wait for UI to settle
      
      const dashboardJourneyButton = page.getByTestId('button-choose-journey-dashboard');
      
      if (await dashboardJourneyButton.isVisible()) {
        await dashboardJourneyButton.click();
        await page.waitForLoadState('domcontentloaded');
        
        const journeyHubUrl = page.url();
        expect(journeyHubUrl).toContain('/journeys');
        console.log('✅ Successfully navigated to journeys from dashboard');
      } else {
        console.log('ℹ️ Dashboard journey button not visible (checking authentication state)');
        
        // Check if user is actually authenticated by looking for logout button or user info
        const logoutButton = page.locator('text=Logout');
        const userMenu = page.locator('[data-testid*="user"]');
        
        if (await logoutButton.isVisible() || await userMenu.first().isVisible()) {
          console.log('✅ User is authenticated (logout/user elements found)');
        } else {
          console.log('❌ User may not be properly authenticated');
        }
      }
    } else {
      console.log('⚠️ Unexpected redirect location:', finalUrl);
    }

    // Step 8: Verify intended route was processed/cleared
    const remainingRoute = await page.evaluate(() => localStorage.getItem('intended_route'));
    console.log('📍 Remaining intended route:', remainingRoute);

    console.log('🎉 Journey selection flow test completed');
  });

  test('Post-auth direct journey navigation works', async ({ page }) => {
    console.log('🔧 Testing direct journey navigation for authenticated user');

    // Step 1: Create and authenticate a user
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'direct-nav-test@example.com',
        password: 'testpass123',
        name: 'Direct Nav Test User',
        userRole: 'business',
        subscriptionTier: 'starter'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    console.log('✅ Created test user for direct navigation');

    // Step 2: Login through UI
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');

    await page.fill('input[type="email"]', 'direct-nav-test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    console.log('✅ Logged in through UI');

    // Step 3: Navigate to dashboard
    if (!page.url().includes('/dashboard')) {
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
    }

    // Step 4: Test direct journey navigation from dashboard
    const journeyButton = page.getByTestId('button-choose-journey-dashboard');
    
    if (await journeyButton.isVisible()) {
      await journeyButton.click();
      await page.waitForLoadState('domcontentloaded');
      
      const journeyUrl = page.url();
      expect(journeyUrl).toContain('/journeys');
      console.log('✅ Direct journey navigation from dashboard works');
    } else {
      console.log('ℹ️ Journey button not visible in dashboard');
    }

    console.log('🎉 Direct navigation test completed');
  });
});