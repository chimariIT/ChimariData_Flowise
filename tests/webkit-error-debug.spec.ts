import { test, expect } from '@playwright/test';

test.describe('WebKit Error Detection', () => {
  test('Capture WebKit console errors and page content', async ({ page }) => {
    console.log('🔧 Capturing WebKit errors and page structure');
    
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('❌ Console Error:', msg.text());
      }
    });

    // Listen for page errors
    const pageErrors: string[] = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
      console.log('💥 Page Error:', error.message);
    });

    // Navigate to the main page
    await page.goto('http://localhost:3000/');
    console.log('✅ Loaded main landing page');
    
    // Wait for network to be idle
    await page.waitForLoadState('networkidle');
    console.log('✅ Network idle');
    
    // Check if any JavaScript loaded
    const scripts = page.locator('script');
    const scriptCount = await scripts.count();
    console.log(`📍 Script tags found: ${scriptCount}`);
    
    // Check if React is loaded
    const reactLoaded = await page.evaluate(() => {
      return typeof window.React !== 'undefined' || document.querySelector('[data-reactroot]') !== null;
    });
    console.log(`📍 React appears loaded: ${reactLoaded}`);
    
    // Check what's actually in the body
    const bodyText = await page.textContent('body');
    const hasText = bodyText && bodyText.trim().length > 0;
    console.log(`📍 Body has text content: ${hasText}`);
    if (hasText) {
      console.log(`📍 First 200 chars: "${bodyText?.substring(0, 200)}..."`);
    }
    
    // Check if there's a root div
    const rootDiv = page.locator('#root, [data-reactroot]');
    const rootExists = await rootDiv.count() > 0;
    const rootVisible = await rootDiv.isVisible();
    console.log(`📍 React root div exists: ${rootExists}, visible: ${rootVisible}`);
    
    if (rootExists) {
      const rootContent = await rootDiv.textContent();
      console.log(`📍 Root div content length: ${rootContent?.length || 0}`);
    }
    
    // Take screenshot for manual inspection
    await page.screenshot({ 
      path: 'test-results/webkit-error-debug.png', 
      fullPage: true 
    });
    
    // Summary
    console.log(`📍 Console errors: ${consoleErrors.length}`);
    console.log(`📍 Page errors: ${pageErrors.length}`);
    
    if (consoleErrors.length > 0) {
      console.log('🚨 Console Errors:');
      consoleErrors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`));
    }
    
    if (pageErrors.length > 0) {
      console.log('🚨 Page Errors:');
      pageErrors.forEach((error, i) => console.log(`   ${i + 1}. ${error}`));
    }
  });
});