import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Simple Pricing Screenshots', () => {
  test('Pricing Pages - No Auth Required', async ({ page }) => {
    console.log('📊 Capturing pricing pages without authentication...');
    
    const journeys = [
      { name: 'non-tech', url: '/journeys/non-tech/pricing' },
      { name: 'business', url: '/journeys/business/pricing' },
      { name: 'technical', url: '/journeys/technical/pricing' },
      { name: 'consultation', url: '/journeys/consultation/pricing' }
    ];

    for (const journey of journeys) {
      console.log(`📊 Testing ${journey.name} journey pricing...`);
      
      try {
        // Navigate to journey pricing page
        await page.goto(`${BASE_URL}${journey.url}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(5000);

        // Take screenshot of the full pricing page
        await page.screenshot({ 
          path: `test-results/${journey.name}-journey-pricing-no-auth.png`,
          fullPage: true 
        });
        console.log(`📸 Screenshot: ${journey.name} Journey Pricing (No Auth)`);

        // Look for Feature Consumption Breakdown section
        const featureBreakdownSection = page.locator('div, section').filter({ hasText: /feature consumption breakdown/i });
        if (await featureBreakdownSection.isVisible()) {
          await featureBreakdownSection.scrollIntoViewIfNeeded();
          await page.waitForTimeout(1000);
          
          await page.screenshot({ 
            path: `test-results/${journey.name}-feature-consumption-breakdown-no-auth.png`,
            fullPage: true 
          });
          console.log(`📸 Screenshot: ${journey.name} Feature Consumption Breakdown (No Auth)`);
        } else {
          console.log(`⚠️ Feature Consumption Breakdown not found for ${journey.name}`);
        }

        // Look for any billing or pricing sections
        const pricingSections = page.locator('div, section').filter({ hasText: /pricing|billing|cost|subscription/i });
        const count = await pricingSections.count();
        console.log(`📊 Found ${count} pricing-related sections for ${journey.name}`);
        
        if (count > 0) {
          await pricingSections.first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(1000);
          
          await page.screenshot({ 
            path: `test-results/${journey.name}-pricing-sections-no-auth.png`,
            fullPage: true 
          });
          console.log(`📸 Screenshot: ${journey.name} Pricing Sections (No Auth)`);
        }

      } catch (error) {
        console.log(`❌ Error capturing ${journey.name}: ${error}`);
      }

      // Wait a bit before next journey
      await page.waitForTimeout(2000);
    }
  });

  test('Admin Subscription Management Page - No Auth', async ({ page }) => {
    console.log('📊 Capturing admin subscription management page without auth...');
    
    try {
      // Navigate to admin subscription management
      await page.goto(`${BASE_URL}/admin/subscription-management`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);

      // Take screenshot of the full admin page
      await page.screenshot({ 
        path: 'test-results/admin-subscription-management-no-auth.png',
        fullPage: true 
      });
      console.log('📸 Screenshot: Admin Subscription Management (No Auth)');

      // Look for any content that might show feature configuration
      const contentSections = page.locator('div, section, main').filter({ hasText: /feature|subscription|tier|complexity/i });
      const count = await contentSections.count();
      console.log(`📊 Found ${count} content sections`);
      
      if (count > 0) {
        await contentSections.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        
        await page.screenshot({ 
          path: 'test-results/admin-content-sections-no-auth.png',
          fullPage: true 
        });
        console.log('📸 Screenshot: Admin Content Sections (No Auth)');
      }

    } catch (error) {
      console.log(`❌ Error capturing admin page: ${error}`);
    }
  });

  test('Check Available Routes', async ({ page }) => {
    console.log('📊 Checking available routes and pages...');
    
    const routes = [
      '/admin/subscription-management',
      '/admin/agent-management',
      '/admin/tools-management',
      '/admin',
      '/journeys/non-tech/pricing',
      '/journeys/business/pricing',
      '/journeys/technical/pricing',
      '/journeys/consultation/pricing'
    ];

    for (const route of routes) {
      try {
        console.log(`📊 Checking route: ${route}`);
        await page.goto(`${BASE_URL}${route}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        const title = await page.title();
        const url = page.url();
        
        console.log(`✅ Route ${route}: Title="${title}", URL="${url}"`);
        
        // Take screenshot if page loads successfully
        if (!title.includes('404') && !title.includes('Not Found')) {
          await page.screenshot({ 
            path: `test-results/route-${route.replace(/\//g, '-')}.png`,
            fullPage: true 
          });
          console.log(`📸 Screenshot: Route ${route}`);
        } else {
          console.log(`⚠️ Route ${route} not found or has errors`);
        }

      } catch (error) {
        console.log(`❌ Error checking route ${route}: ${error}`);
      }
    }
  });
});
