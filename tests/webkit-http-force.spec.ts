import { test, expect } from '@playwright/test';

test.describe('WebKit HTTP Force Debug', () => {
  test('Force HTTP and disable security for WebKit', async ({ browser }) => {
    console.log('🔧 Testing WebKit with forced HTTP settings');
    
    // Create a context with specific settings to force HTTP
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      bypassCSP: true,
      acceptDownloads: false,
    });

    const page = await context.newPage();

    // Intercept and redirect HTTPS requests to HTTP
    await page.route('https://localhost:3000/**', async route => {
      const url = route.request().url();
      const httpUrl = url.replace('https://localhost:3000', 'http://localhost:3000');
      console.log(`🔄 Redirecting: ${url} -> ${httpUrl}`);
      
      await route.continue({
        url: httpUrl
      });
    });

    // Capture console messages
    page.on('console', message => {
      console.log(`📋 Console: ${message.type()}: ${message.text()}`);
    });

    page.on('pageerror', error => {
      console.log(`❌ Page Error: ${error.message}`);
    });

    // Navigate to the page
    await page.goto('http://localhost:3000/', {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    console.log('✅ Page loaded with HTTP forcing');

    // Wait for React to potentially render
    await page.waitForTimeout(10000);

    // Check if content rendered
    const rootContent = await page.locator('#root').innerHTML();
    console.log(`📍 Root content length: ${rootContent.length}`);
    
    if (rootContent.length > 0) {
      console.log(`📍 Root content preview: ${rootContent.substring(0, 300)}`);
    }

    // Check for header
    const headerVisible = await page.locator('header').isVisible();
    console.log(`📍 Header visible: ${headerVisible}`);

    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/webkit-http-force.png', 
      fullPage: true 
    });

    await context.close();
  });
});