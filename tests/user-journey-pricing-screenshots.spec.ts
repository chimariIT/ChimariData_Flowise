import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

const BASE_URL = 'http://localhost:5173';

test.describe('User Journey Pricing Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}`);
    await page.waitForLoadState('networkidle');
  });

  test('Trial User - Feature Consumption Breakdown', async ({ page }) => {
    console.log('📊 Testing Trial User Pricing with Feature Consumption...');
    
    // Login as trial user
    await programmaticLogin(page, 'test-trial@chimari.test');
    await page.waitForLoadState('networkidle');

    // Navigate to business journey pricing
    await page.goto(`${BASE_URL}/journeys/business/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot of the full pricing page
    await page.screenshot({ 
      path: 'test-results/trial-user-business-pricing.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Trial User Business Journey Pricing');

    // Look for Feature Consumption Breakdown section
    const featureBreakdownSection = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
    if (await featureBreakdownSection.isVisible()) {
      await featureBreakdownSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/trial-feature-consumption-breakdown.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Trial User Feature Consumption Breakdown');
    }

    // Look for subscription credits section
    const creditsSection = page.locator('div, section').filter({ hasText: /subscription credits/i });
    if (await creditsSection.isVisible()) {
      await creditsSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/trial-subscription-credits.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Trial User Subscription Credits');
    }

    // Look for user balance display
    const balanceSection = page.locator('div, section').filter({ hasText: /subscription bank|balance/i });
    if (await balanceSection.isVisible()) {
      await balanceSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/trial-user-balance-display.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Trial User Balance Display');
    }
  });

  test('Professional User - Feature Consumption Breakdown', async ({ page }) => {
    console.log('📊 Testing Professional User Pricing with Feature Consumption...');
    
    // Login as professional user
    await programmaticLogin(page, 'test-professional@chimari.test');
    await page.waitForLoadState('networkidle');

    // Navigate to technical journey pricing
    await page.goto(`${BASE_URL}/journeys/technical/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot of the full pricing page
    await page.screenshot({ 
      path: 'test-results/professional-user-technical-pricing.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Professional User Technical Journey Pricing');

    // Look for Feature Consumption Breakdown section
    const featureBreakdownSection = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
    if (await featureBreakdownSection.isVisible()) {
      await featureBreakdownSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/professional-feature-consumption-breakdown.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Professional User Feature Consumption Breakdown');
    }

    // Look for subscription credits section
    const creditsSection = page.locator('div, section').filter({ hasText: /subscription credits/i });
    if (await creditsSection.isVisible()) {
      await creditsSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/professional-subscription-credits.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Professional User Subscription Credits');
    }
  });

  test('Enterprise User - Feature Consumption Breakdown', async ({ page }) => {
    console.log('📊 Testing Enterprise User Pricing with Feature Consumption...');
    
    // Login as enterprise user
    await programmaticLogin(page, 'test-enterprise@chimari.test');
    await page.waitForLoadState('networkidle');

    // Navigate to consultation journey pricing
    await page.goto(`${BASE_URL}/journeys/consultation/pricing`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot of the full pricing page
    await page.screenshot({ 
      path: 'test-results/enterprise-user-consultation-pricing.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Enterprise User Consultation Journey Pricing');

    // Look for Feature Consumption Breakdown section
    const featureBreakdownSection = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
    if (await featureBreakdownSection.isVisible()) {
      await featureBreakdownSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/enterprise-feature-consumption-breakdown.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Enterprise User Feature Consumption Breakdown');
    }

    // Look for subscription credits section
    const creditsSection = page.locator('div, section').filter({ hasText: /subscription credits/i });
    if (await creditsSection.isVisible()) {
      await creditsSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/enterprise-subscription-credits.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Enterprise User Subscription Credits');
    }
  });

  test('Compare All Subscription Tiers - Pricing Differences', async ({ page }) => {
    console.log('📊 Capturing pricing differences across subscription tiers...');
    
    const users = [
      { email: 'test-trial@chimari.test', tier: 'trial', journey: 'business' },
      { email: 'test-starter@chimari.test', tier: 'starter', journey: 'business' },
      { email: 'test-professional@chimari.test', tier: 'professional', journey: 'technical' },
      { email: 'test-enterprise@chimari.test', tier: 'enterprise', journey: 'consultation' }
    ];

    for (const user of users) {
      console.log(`📊 Testing ${user.tier.toUpperCase()} user...`);
      
      // Login as user
      await programmaticLogin(page, user.email);
      await page.waitForLoadState('networkidle');

      // Navigate to journey pricing
      await page.goto(`${BASE_URL}/journeys/${user.journey}/pricing`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Take screenshot of pricing page
      await page.screenshot({ 
        path: `test-results/${user.tier}-user-${user.journey}-pricing-comparison.png`,
        fullPage: true 
      });
      console.log(`📸 Screenshot: ${user.tier.toUpperCase()} User ${user.journey.toUpperCase()} Journey Pricing`);

      // Logout for next user
      await page.goto(`${BASE_URL}/logout`);
      await page.waitForTimeout(1000);
    }
  });

  test('Feature Consumption Details - All Journey Types', async ({ page }) => {
    console.log('📊 Capturing feature consumption for all journey types...');
    
    // Login as professional user (good middle tier for testing)
    await programmaticLogin(page, 'test-professional@chimari.test');
    await page.waitForLoadState('networkidle');

    const journeys = ['non-tech', 'business', 'technical', 'consultation'];

    for (const journey of journeys) {
      console.log(`📊 Testing ${journey} journey pricing...`);
      
      // Navigate to journey pricing
      await page.goto(`${BASE_URL}/journeys/${journey}/pricing`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Take screenshot of pricing page
      await page.screenshot({ 
        path: `test-results/professional-${journey}-journey-pricing.png`,
        fullPage: true 
      });
      console.log(`📸 Screenshot: Professional User ${journey} Journey Pricing`);

      // Look specifically for feature breakdown
      const featureBreakdown = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
      if (await featureBreakdown.isVisible()) {
        await featureBreakdown.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/professional-${journey}-feature-breakdown.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Professional User ${journey} Feature Breakdown`);
      }
    }
  });
});
