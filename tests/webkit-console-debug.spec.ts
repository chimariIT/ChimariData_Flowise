import { test, expect } from '@playwright/test';

test.describe('WebKit Console Debug', () => {
  test('Check console errors in WebKit', async ({ page }) => {
    console.log('🔧 Checking console errors in WebKit');
    
    // Capture all console messages
    const consoleMessages: string[] = [];
    const errors: string[] = [];
    
    page.on('console', message => {
      const text = `${message.type()}: ${message.text()}`;
      consoleMessages.push(text);
      console.log(`📋 Console: ${text}`);
      
      if (message.type() === 'error') {
        errors.push(text);
      }
    });

    // Capture page errors
    page.on('pageerror', error => {
      const errorText = `PageError: ${error.message}`;
      errors.push(errorText);
      console.log(`❌ Page Error: ${error.message}`);
      console.log(`📍 Stack: ${error.stack}`);
    });

    // Navigate to the main page
    try {
      await page.goto('http://localhost:3000/', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      console.log('✅ Page loaded');
    } catch (error) {
      console.log(`❌ Navigation error: ${error}`);
    }

    // Wait a bit more for any delayed JavaScript execution
    await page.waitForTimeout(5000);

    // Check the actual HTML content
    const html = await page.content();
    console.log(`📍 Page HTML length: ${html.length}`);
    console.log(`📍 Page contains React root: ${html.includes('id="root"')}`);
    console.log(`📍 Page contains script tags: ${html.includes('<script')}`);

    // Check the root element content
    const rootContent = await page.locator('#root').innerHTML();
    console.log(`📍 Root element content length: ${rootContent.length}`);
    console.log(`📍 Root content preview: ${rootContent.substring(0, 200)}`);

    // Check if there's any content in body
    const bodyContent = await page.locator('body').innerHTML();
    console.log(`📍 Body content length: ${bodyContent.length}`);

    // Try to evaluate React
    try {
      const reactInfo = await page.evaluate(() => {
        return {
          React: typeof (window as any).React,
          ReactDOM: typeof (window as any).ReactDOM,
          hasRoot: document.getElementById('root') !== null,
          rootChildren: document.getElementById('root')?.children.length || 0
        };
      });
      console.log(`📍 React evaluation: ${JSON.stringify(reactInfo)}`);
    } catch (error) {
      console.log(`❌ React evaluation error: ${error}`);
    }

    console.log(`📍 Total console messages: ${consoleMessages.length}`);
    console.log(`📍 Total errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('❌ Errors found:');
      errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
  });
});