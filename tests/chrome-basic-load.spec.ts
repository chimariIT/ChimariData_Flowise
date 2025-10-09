import { test, expect } from '@playwright/test';

test.describe('Basic Page Load', () => {
  test('Check if page loads in Chrome', async ({ page }) => {
    console.log('🔧 Testing basic page load in Chrome');
    
    // Navigate to the page
    await page.goto('http://localhost:3000/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    console.log('✅ Page loaded');

    // Check if content rendered
    const rootContent = await page.locator('#root').innerHTML();
    console.log(`📍 Root content length: ${rootContent.length}`);
    
    // Check for header
    try {
      const headerVisible = await page.locator('header').isVisible({ timeout: 5000 });
      console.log(`📍 Header visible: ${headerVisible}`);
    } catch (error) {
      console.log(`📍 Header not found or not visible: ${error}`);
    }

    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/chrome-basic-load.png', 
      fullPage: true 
    });
  });
});