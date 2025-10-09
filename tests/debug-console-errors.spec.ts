import { test, expect } from '@playwright/test';

test('Debug console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  
  // Capture network errors
  page.on('response', response => {
    if (response.status() >= 400) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  
  // Go to the root page
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Wait a bit more for any async operations
  await page.waitForTimeout(2000);
  
  console.log('Console errors:', consoleErrors);
  console.log('Network errors:', networkErrors);
  
  // Check if React root is rendered
  const reactRoot = await page.locator('#root').count();
  console.log('React root found:', reactRoot > 0);
  
  // Check what's inside the root
  if (reactRoot > 0) {
    const rootContent = await page.locator('#root').innerHTML();
    console.log('React root content:', rootContent.substring(0, 500));
  }
});
