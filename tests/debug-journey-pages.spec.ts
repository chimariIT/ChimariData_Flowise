import { test, expect, Page } from '@playwright/test';

test.describe('Debug Journey Pages', () => {
  
  test('Debug Project Setup Page', async ({ page }) => {
    console.log('🔍 Debugging project setup page...');
    
    // Navigate to project setup page
    await page.goto('/journeys/non-tech/project-setup');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
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
      path: 'test-results/debug-project-setup.png', 
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
    
    console.log('🔍 Debug complete - check debug-project-setup.png');
  });
  
  test('Debug Execute Page', async ({ page }) => {
    console.log('🔍 Debugging execute page...');
    
    // Navigate to execute page
    await page.goto('/journeys/non-tech/execute');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
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
      path: 'test-results/debug-execute.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    console.log('🔍 Debug complete - check debug-execute.png');
  });
  
  test('Debug Pricing Page', async ({ page }) => {
    console.log('🔍 Debugging pricing page...');
    
    // Navigate to pricing page
    await page.goto('/journeys/non-tech/pricing');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
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
      path: 'test-results/debug-pricing.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    console.log('🔍 Debug complete - check debug-pricing.png');
  });
  
  test('Debug Results Page', async ({ page }) => {
    console.log('🔍 Debugging results page...');
    
    // Navigate to results page
    await page.goto('/journeys/non-tech/results');
    
    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    
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
      path: 'test-results/debug-results.png', 
      fullPage: true 
    });
    
    // Check page content
    const pageContent = await page.textContent('body');
    console.log('📄 Page content length:', pageContent?.length || 0);
    
    console.log('🔍 Debug complete - check debug-results.png');
  });
});
