import { test, expect } from '@playwright/test';

test.describe('WebKit JS Debug', () => {
  test('Debug JavaScript execution in WebKit', async ({ page, context }) => {
    console.log('🔧 Debugging JavaScript execution in WebKit');
    
    // Capture all network requests
    const requests: string[] = [];
    page.on('request', request => {
      requests.push(request.url());
      console.log(`🌐 Request: ${request.method()} ${request.url()}`);
    });

    // Capture responses
    page.on('response', response => {
      if (!response.ok()) {
        console.log(`❌ Failed Response: ${response.status()} ${response.url()}`);
      }
    });

    // Block external resources that might cause issues
    await context.route('https://replit.com/**', route => route.abort());
    
    // Navigate to the main page
    await page.goto('http://localhost:3000/');
    console.log('✅ Navigated to page');
    
    // Wait for load
    await page.waitForLoadState('domcontentloaded');
    console.log('✅ DOM content loaded');
    
    // Check if main script is present
    const mainScript = page.locator('script[src*="main"]');
    const mainScriptCount = await mainScript.count();
    console.log(`📍 Main script tags found: ${mainScriptCount}`);
    
    if (mainScriptCount > 0) {
      const scriptSrc = await mainScript.first().getAttribute('src');
      console.log(`📍 Main script src: ${scriptSrc}`);
    }
    
    // Try to evaluate some JavaScript to see if it's working
    try {
      const jsWorking = await page.evaluate(() => {
        return typeof window !== 'undefined' && typeof document !== 'undefined';
      });
      console.log(`📍 Basic JavaScript working: ${jsWorking}`);
    } catch (error) {
      console.log(`❌ JavaScript evaluation error: ${error}`);
    }
    
    // Check if React is defined in global scope
    try {
      const reactGlobal = await page.evaluate(() => {
        return typeof window.React !== 'undefined';
      });
      console.log(`📍 React in global scope: ${reactGlobal}`);
    } catch (error) {
      console.log(`❌ React check error: ${error}`);
    }
    
    // Check if the root element gets populated
    await page.waitForTimeout(5000); // Wait 5 seconds
    
    const rootElement = page.locator('#root');
    const rootHtml = await rootElement.innerHTML();
    console.log(`📍 Root innerHTML length: ${rootHtml.length}`);
    
    if (rootHtml.length > 0) {
      console.log(`📍 Root HTML preview: ${rootHtml.substring(0, 200)}...`);
    }
    
    // Check page title
    const title = await page.title();
    console.log(`📍 Page title: "${title}"`);
    
    // Summary of requests
    console.log(`📍 Total requests made: ${requests.length}`);
    const jsRequests = requests.filter(url => url.endsWith('.js') || url.includes('/src/'));
    console.log(`📍 JavaScript requests: ${jsRequests.length}`);
    jsRequests.forEach(url => console.log(`   - ${url}`));
  });
});