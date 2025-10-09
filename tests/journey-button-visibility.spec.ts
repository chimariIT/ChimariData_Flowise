import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Journey Button Visibility Test', () => {
  test('Test if journey buttons show without permission gates', async ({ page }) => {
    console.log('🔧 Testing journey button visibility without permission gates');

    // Step 1: Create test user
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login-test`, {
      data: {
        email: 'simple-test@example.com',
        password: 'testpass123',
        name: 'Simple Test User',
        userRole: 'non-tech',
        subscriptionTier: 'none'
      }
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    const authToken = loginData.token;
    console.log('✅ Created test user and got auth token');

    // Step 2: Navigate and set auth
    await page.goto('/journeys');
    await page.waitForLoadState('domcontentloaded');
    
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
    }, authToken);

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Step 3: Check journey cards WITHOUT permission gates
    const journeyCards = await page.locator('[data-testid^="card-journey-"]').count();
    console.log(`🎴 Journey card elements found: ${journeyCards}`);

    const journeyButtons = await page.locator('[data-testid^="button-start-"]').count();
    console.log(`🎯 Journey button elements found: ${journeyButtons}`);

    // Step 4: List all journey cards that exist
    const cardIds = await page.locator('[data-testid^="card-journey-"]').all();
    for (let i = 0; i < cardIds.length; i++) {
      const testId = await cardIds[i].getAttribute('data-testid');
      console.log(`🃏 Found journey card: ${testId}`);
    }

    // Step 5: List all journey buttons that exist  
    const buttonIds = await page.locator('[data-testid^="button-start-"]').all();
    for (let i = 0; i < buttonIds.length; i++) {
      const testId = await buttonIds[i].getAttribute('data-testid');
      console.log(`🔘 Found journey button: ${testId}`);
    }

    // Step 6: Check if journeys hub is rendering at all
    const journeyHubTitle = await page.locator('h1:has-text("Choose Your Data Analysis Journey")').count();
    console.log(`📋 Journey hub title found: ${journeyHubTitle}`);

    // Step 7: Take screenshot for debugging
    await page.screenshot({ path: 'journey-visibility-test.png', fullPage: true });

    // Step 8: Get page HTML for debugging
    const htmlContent = await page.locator('body').innerHTML();
    console.log('📄 First 1000 chars of page HTML:');
    console.log(htmlContent.substring(0, 1000));

    if (journeyButtons > 0) {
      console.log('🎉 Journey buttons are visible! Permission gates might be the issue.');
    } else if (journeyCards > 0) {
      console.log('🎴 Journey cards are visible but buttons are missing - check button rendering.');
    } else if (journeyHubTitle > 0) {
      console.log('📋 Journey hub title is visible but cards are missing - check card rendering.');
    } else {
      console.log('❌ Journey hub is not rendering at all - check routing or component loading.');
    }
  });
});