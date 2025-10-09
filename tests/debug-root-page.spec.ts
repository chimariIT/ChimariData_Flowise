import { test, expect } from '@playwright/test';

test('Debug root page rendering', async ({ page }) => {
  // Go to the root page
  await page.goto('/');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Take a screenshot
  await page.screenshot({ path: 'debug-root-page.png', fullPage: true });
  
  // Log the page content
  const content = await page.content();
  console.log('Page content:', content.substring(0, 1000));
  
  // Check if we can see any heading
  const headings = await page.locator('h1, h2, h3').all();
  console.log('Found headings:', await Promise.all(headings.map(h => h.textContent())));
  
  // Check if the page title is correct
  const title = await page.title();
  console.log('Page title:', title);
  
  // Check if React app is loaded
  const reactRoot = await page.locator('#root').count();
  console.log('React root found:', reactRoot > 0);
});
