import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Direct Pricing Screenshots', () => {
  test('Pricing Pages - Feature Consumption Breakdown', async ({ page }) => {
    console.log('📊 Capturing pricing pages with feature consumption breakdown...');
    
    const journeys = [
      { name: 'non-tech', url: '/journeys/non-tech/pricing' },
      { name: 'business', url: '/journeys/business/pricing' },
      { name: 'technical', url: '/journeys/technical/pricing' },
      { name: 'consultation', url: '/journeys/consultation/pricing' }
    ];

    for (const journey of journeys) {
      console.log(`📊 Testing ${journey.name} journey pricing...`);
      
      // Navigate to journey pricing page
      await page.goto(`${BASE_URL}${journey.url}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);

      // Take screenshot of the full pricing page
      await page.screenshot({ 
        path: `test-results/${journey.name}-journey-pricing-full.png`,
        fullPage: true 
      });
      console.log(`📸 Screenshot: ${journey.name} Journey Pricing (Full Page)`);

      // Look for Feature Consumption Breakdown section
      const featureBreakdownSection = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
      if (await featureBreakdownSection.isVisible()) {
        await featureBreakdownSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/${journey.name}-feature-consumption-breakdown.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: ${journey.name} Feature Consumption Breakdown`);
      } else {
        console.log(`⚠️ Feature Consumption Breakdown not found for ${journey.name}`);
      }

      // Look for subscription credits section
      const creditsSection = page.locator('div, section').filter({ hasText: /subscription credits/i });
      if (await creditsSection.isVisible()) {
        await creditsSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/${journey.name}-subscription-credits.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: ${journey.name} Subscription Credits`);
      }

      // Look for usage-based pricing breakdown
      const usageSection = page.locator('div, section').filter({ hasText: /usage-based pricing|pricing breakdown/i });
      if (await usageSection.isVisible()) {
        await usageSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/${journey.name}-usage-pricing-breakdown.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: ${journey.name} Usage-Based Pricing Breakdown`);
      }

      // Look for user balance display
      const balanceSection = page.locator('div, section').filter({ hasText: /subscription bank|balance|capacity/i });
      if (await balanceSection.isVisible()) {
        await balanceSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/${journey.name}-user-balance-display.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: ${journey.name} User Balance Display`);
      }

      // Wait a bit before next journey
      await page.waitForTimeout(2000);
    }
  });

  test('Admin Subscription Management Page', async ({ page }) => {
    console.log('📊 Capturing admin subscription management page...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Take screenshot of the full admin page
    await page.screenshot({ 
      path: 'test-results/admin-subscription-management-full.png',
      fullPage: true 
    });
    console.log('📸 Screenshot: Admin Subscription Management (Full Page)');

    // Look for subscription tiers section
    const tiersSection = page.locator('div, section').filter({ hasText: /subscription tiers|trial|starter|professional|enterprise/i });
    if (await tiersSection.isVisible()) {
      await tiersSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-subscription-tiers-section.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Subscription Tiers Section');
    }

    // Look for feature configuration section
    const featureSection = page.locator('div, section').filter({ hasText: /feature|complexity|small|medium|large/i });
    if (await featureSection.isVisible()) {
      await featureSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-feature-configuration-section.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Feature Configuration Section');
    }

    // Look for pricing configuration
    const pricingSection = page.locator('div, section').filter({ hasText: /pricing|price|\$/i });
    if (await pricingSection.isVisible()) {
      await pricingSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      
      await page.screenshot({ 
        path: 'test-results/admin-pricing-configuration-section.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Pricing Configuration Section');
    }
  });

  test('Feature Complexity Configuration Details', async ({ page }) => {
    console.log('📊 Capturing feature complexity configuration details...');
    
    // Navigate to admin subscription management
    await page.goto(`${BASE_URL}/admin/subscription-management`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for complexity levels
    const complexities = ['small', 'medium', 'large', 'extra_large'];
    
    for (const complexity of complexities) {
      const complexitySection = page.locator('div, section, tr, td').filter({ hasText: new RegExp(complexity, 'i') });
      if (await complexitySection.first().isVisible()) {
        await complexitySection.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: `test-results/admin-complexity-${complexity}-details.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Admin ${complexity} Complexity Configuration Details`);
      }
    }

    // Look for feature definitions
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
          path: `test-results/admin-feature-${feature}-details.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: Admin ${feature} Feature Configuration Details`);
        break; // Just capture the first one found
      }
    }
  });
});
