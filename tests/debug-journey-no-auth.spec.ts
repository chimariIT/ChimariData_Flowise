import { test, expect, Page } from '@playwright/test';

test.describe('Debug Journey Pages - No Auth', () => {
  
  test('Debug Project Setup Page - No Auth', async ({ page }) => {
    console.log('🔍 Debugging project setup page without auth...');
    
    // Navigate to project setup page
    await page.goto('/journeys/non-tech/project-setup');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    
    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // Check for network errors
    const networkErrors: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.url()} - ${response.status()}`);
        console.log('❌ Network Error:', response.url(), response.status());
      }
    });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-project-setup-no-auth.png', 
      fullPage: true 
    });
    
    // Check if the page content is there
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    // Check for specific elements
    const hasTitle = await page.locator('h1, h2, h3').count();
    console.log('📝 Headers found:', hasTitle);
    
    const hasCards = await page.locator('[data-testid="card-step-content"]').count();
    console.log('🎴 Step cards found:', hasCards);
    
    // Check for error messages
    const hasErrors = await page.locator('text=/error/i, text=/failed/i, text=/timeout/i').count();
    console.log('❌ Error messages found:', hasErrors);
    
    console.log('🔍 Debug complete - check debug-project-setup-no-auth.png');
    console.log('📊 Summary:');
    console.log('  - Page content length:', pageContent?.length || 0);
    console.log('  - Headers found:', hasTitle);
    console.log('  - Step cards found:', hasCards);
    console.log('  - Error messages found:', hasErrors);
    console.log('  - Console errors:', errors.length);
    console.log('  - Network errors:', networkErrors.length);
  });
  
  test('Debug Execute Page - No Auth', async ({ page }) => {
    console.log('🔍 Debugging execute page without auth...');
    
    // Navigate to execute page
    await page.goto('/journeys/non-tech/execute');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    
    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-execute-no-auth.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    const hasCards = await page.locator('[data-testid="card-step-content"]').count();
    console.log('🎴 Step cards found:', hasCards);
    
    console.log('🔍 Debug complete - check debug-execute-no-auth.png');
  });
  
  test('Debug Pricing Page - No Auth', async ({ page }) => {
    console.log('🔍 Debugging pricing page without auth...');
    
    // Navigate to pricing page
    await page.goto('/journeys/non-tech/pricing');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    
    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-pricing-no-auth.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    console.log('🔍 Debug complete - check debug-pricing-no-auth.png');
  });
  
  test('Debug Results Page - No Auth', async ({ page }) => {
    console.log('🔍 Debugging results page without auth...');
    
    // Navigate to results page
    await page.goto('/journeys/non-tech/results');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(5000);
    
    // Check for console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.log('❌ Console Error:', msg.text());
      }
    });
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/debug-results-no-auth.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    console.log('🔍 Debug complete - check debug-results-no-auth.png');
  });
});
