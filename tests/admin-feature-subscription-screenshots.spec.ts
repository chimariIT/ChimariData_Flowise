import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

const BASE_URL = 'http://localhost:5173';

test.describe('Admin Feature & Subscription Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await programmaticLogin(page, 'admin@chimaridata.com');
    await page.waitForLoadState('networkidle');
  });

  test('Admin Subscription Management - Feature Configuration', async ({ page }) => {
    console.log('📊 Navigating to Admin Subscription Management...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Take screenshot of main subscription management page
    await page.screenshot({ 
      path: 'test-results/admin-subscription-management.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Admin Subscription Management main page');

    // Click on Subscription Tiers tab if available
    const subscriptionTiersTab = page.locator('button, a').filter({ hasText: /subscription tiers/i });
    if (await subscriptionTiersTab.isVisible()) {
      await subscriptionTiersTab.click();
      await page.waitForTimeout(2000);
      
      await page.screenshot({ 
        path: 'test-results/admin-subscription-tiers.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Subscription Tiers configuration');
    }

    // Look for feature configuration sections
    const featureSection = page.locator('div, section').filter({ hasText: /feature/i });
    if (await featureSection.isVisible()) {
      await featureSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-feature-configuration.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Feature Configuration section');
    }

    // Look for complexity configuration
    const complexitySection = page.locator('div, section').filter({ hasText: /complexity|small|medium|large/i });
    if (await complexitySection.isVisible()) {
      await complexitySection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-complexity-configuration.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Complexity Configuration section');
    }
  });

  test('Admin Feature Management - Detailed Setup', async ({ page }) => {
    console.log('📊 Navigating to Admin Feature Management...');
    
    // Navigate to admin feature management (if exists)
    await page.goto(`${BASE_URL}/admin/feature-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check if page exists, if not try alternative routes
    const pageTitle = await page.title();
    if (pageTitle.includes('404') || pageTitle.includes('Not Found')) {
      console.log('⚠️ Feature management page not found, trying subscription management...');
      await page.goto(`${BASE_URL}/admin/subscription-management`);
      await page.waitForLoadState('networkidle');
    }

    // Take screenshot of feature management page
    await page.screenshot({ 
      path: 'test-results/admin-feature-management.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Admin Feature Management page');

    // Look for individual feature configurations
    const features = [
      'file_upload',
      'data_transformation', 
      'statistical_analysis',
      'machine_learning',
      'ai_insights',
      'visualization',
      'artifacts',
      'exports',
      'dashboards'
    ];

    for (const feature of features) {
      const featureSection = page.locator('div, section, tr, td').filter({ hasText: new RegExp(feature.replace('_', ' '), 'i') });
      if (await featureSection.first().isVisible()) {
        await featureSection.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/admin-feature-${feature}.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Admin Feature Configuration - ${feature}`);
        break; // Just capture the first one found
      }
    }
  });

  test('Admin Subscription Tiers - Detailed Breakdown', async ({ page }) => {
    console.log('📊 Capturing detailed subscription tier configurations...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for subscription tiers
    const tiers = ['trial', 'starter', 'professional', 'enterprise'];
    
    for (const tier of tiers) {
      const tierSection = page.locator('div, section, tr, td').filter({ hasText: new RegExp(tier, 'i') });
      if (await tierSection.first().isVisible()) {
        await tierSection.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/admin-tier-${tier}.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Admin ${tier.toUpperCase()} tier configuration`);
      }
    }

    // Look for pricing configuration
    const pricingSection = page.locator('div, section').filter({ hasText: /pricing|price|\$/i });
    if (await pricingSection.first().isVisible()) {
      await pricingSection.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-pricing-configuration.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Pricing Configuration');
    }

    // Look for limits configuration
    const limitsSection = page.locator('div, section').filter({ hasText: /limit|quota|capacity/i });
    if (await limitsSection.first().isVisible()) {
      await limitsSection.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-limits-configuration.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Limits Configuration');
    }
  });

  test('Admin Feature Complexity Setup', async ({ page }) => {
    console.log('📊 Capturing feature complexity configurations...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for complexity levels
    const complexities = ['small', 'medium', 'large', 'extra_large'];
    
    for (const complexity of complexities) {
      const complexitySection = page.locator('div, section, tr, td').filter({ hasText: new RegExp(complexity, 'i') });
      if (await complexitySection.first().isVisible()) {
        await complexitySection.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/admin-complexity-${complexity}.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Admin ${complexity} complexity configuration`);
      }
    }

    // Look for calculation units
    const unitsSection = page.locator('div, section').filter({ hasText: /calculation|unit|cost/i });
    if (await unitsSection.first().isVisible()) {
      await unitsSection.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-calculation-units.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Calculation Units Configuration');
    }
  });

  test('Admin Billing Configuration', async ({ page }) => {
    console.log('📊 Capturing billing configuration details...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for billing configuration
    const billingSection = page.locator('div, section').filter({ hasText: /billing|cost|price/i });
    if (await billingSection.first().isVisible()) {
      await billingSection.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-billing-configuration.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Billing Configuration');
    }

    // Look for usage tracking configuration
    const usageSection = page.locator('div, section').filter({ hasText: /usage|consumption|tracking/i });
    if (await usageSection.first().isVisible()) {
      await usageSection.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-usage-tracking.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Usage Tracking Configuration');
    }
  });
});
