import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Debug Permission UI', () => {
  test('Debug permission states and component rendering', async ({ page }) => {
    console.log('🔧 Starting debug permission UI test');

    // Step 1: Create test user programmatically
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'debug-test@example.com',
        password: 'testpass123',
        name: 'Debug Test User',
        userRole: 'non-tech',
        subscriptionTier: 'none'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    const authToken = loginData.token;
    console.log('✅ Created test user and got auth token');

    // Step 2: Set auth token in browser context  
    await page.context().addCookies([{
      name: 'authToken',
      value: authToken,
      url: BASE_URL
    }]);

    // Step 3: Navigate to journeys page first
    await page.goto('/journeys');
    await page.waitForLoadState('domcontentloaded');
    
    // Step 4: Set the token in localStorage for APIClient (after page load)
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, authToken);

    // Step 5: Reload the page so React can pick up the auth token
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    
    // Give extra time for React and hooks to load
    await page.waitForTimeout(5000);

    // Step 6: Test API endpoint using page context (with localStorage auth)
    const apiResponse = await page.evaluate(async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/user/role-permissions', {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include'
        });
        
        return {
          status: response.status,
          ok: response.ok,
          data: response.ok ? await response.json() : await response.text()
        };
      } catch (error: any) {
        return { error: error?.message || 'Unknown error' };
      }
    });

    console.log(`📡 API call from page context: status ${apiResponse.status}`);
    if (apiResponse.ok) {
      console.log(`✅ Auth working in browser context!`);
      console.log(`👤 User role: ${apiResponse.data.userRole}`);
      console.log(`🔑 Non-tech journey permission: ${apiResponse.data.permissions?.canAccessNonTechJourney}`);
    } else {
      console.log(`❌ Auth failed in browser context: ${apiResponse.data}`);
    }

    // Step 7: Take screenshot first
    await page.screenshot({ path: 'debug-journey-buttons.png', fullPage: true });

    // Step 8: Check all elements on page
    console.log('🔍 Debugging page elements...');
    
    // Check if RequireJourney components are present
    const requireJourneyElements = await page.locator('[data-require-journey]').count();
    console.log(`🧪 RequireJourney elements found: ${requireJourneyElements}`);

    // Check for any journey cards
    const journeyCards = await page.locator('[data-testid^="card-journey-"]').count();
    console.log(`🎴 Journey card elements found: ${journeyCards}`);

    // Check for journey buttons specifically
    const journeyButtons = await page.locator('[data-testid^="button-start-"]').count();
    console.log(`🎯 Journey button elements found: ${journeyButtons}`);

    // Check if there are any error messages
    const errorElements = await page.locator('.error, [role="alert"], .alert-error').count();
    console.log(`❌ Error elements found: ${errorElements}`);

    // Check for loading states
    const loadingElements = await page.locator('.loading, .spinner, [aria-label*="loading" i]').count();
    console.log(`⏳ Loading elements found: ${loadingElements}`);

    // Debug: Check what's actually in the useUserRole context
    const roleData = await page.evaluate(() => {
      // Try to access the hook data from window if it's exposed
      return (window as any).__userRoleDebug || 'UserRole data not exposed for debugging';
    });
    console.log('🎭 UserRole hook data:', roleData);

    // Debug: Check local storage
    const localStorageData = await page.evaluate(() => {
      const data: any = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) data[key] = localStorage.getItem(key);
      }
      return data;
    });
    console.log('💾 Local storage data:', localStorageData);

    // Debug: Check if there are any Permission Gate elements or upgrade prompts
    const upgradePrompts = await page.locator('.upgrade-prompt, [data-testid*="upgrade"]').count();
    console.log(`📈 Upgrade prompt elements found: ${upgradePrompts}`);

    // Debug: Try to find any PermissionGate rendered content
    const permissionGateContent = await page.locator('[data-permission-gate]').count();
    console.log(`🚪 Permission gate elements found: ${permissionGateContent}`);

    // Debug: Check console errors
    const consoleMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleMessages.push(`❌ Console error: ${msg.text()}`);
      }
    });

    // Wait a bit more and then check console
    await page.waitForTimeout(2000);
    if (consoleMessages.length > 0) {
      console.log('🐛 Console errors detected:');
      consoleMessages.forEach(msg => console.log(msg));
    } else {
      console.log('✅ No console errors detected');
    }

    // Final status
    if (journeyButtons > 0) {
      console.log('🎉 Journey buttons are now visible!');
    } else {
      console.log('❌ Journey buttons still not visible');
      
      // Get full page content for debugging
      const bodyText = await page.locator('body').textContent();
      console.log('📄 Page contains the following text (first 500 chars):');
      console.log(bodyText?.substring(0, 500) + '...');
      
      if (bodyText?.includes('Loading') || bodyText?.includes('loading')) {
        console.log('⏳ Page appears to be in loading state');
      }
      
      if (bodyText?.includes('permission') || bodyText?.includes('access')) {
        console.log('🔒 Page contains permission-related text');
      }

      // Debug: Check if we can find specific components that should be there
      const journeyHubTitle = await page.locator('h1:has-text("Choose Your Data Analysis Journey")').count();
      console.log(`📋 Journey hub title found: ${journeyHubTitle}`);

      const nonTechCard = await page.locator('[data-testid="card-journey-non-tech"]').count();
      console.log(`🎴 Non-tech journey card found: ${nonTechCard}`);

      const businessCard = await page.locator('[data-testid="card-journey-business"]').count();
      console.log(`🎴 Business journey card found: ${businessCard}`);

      // Check if the component is failing to render entirely
      const journeysSectionElements = await page.locator('div, section').count();
      console.log(`🧱 Total div/section elements on page: ${journeysSectionElements}`);
    }
  });
});