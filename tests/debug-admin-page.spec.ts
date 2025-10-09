import { test, expect } from '@playwright/test';

test('Debug admin page rendering', async ({ page }) => {
  // Go to the admin page
  await page.goto('/admin/agent-management');
  
  // Wait for the page to load
  await page.waitForLoadState('networkidle');
  
  // Take a screenshot
  await page.screenshot({ path: 'debug-admin-page.png', fullPage: true });
  
  // Log the page content
  const content = await page.content();
  console.log('Page content:', content.substring(0, 1000));
  
  // Check if we can see any heading
  const headings = await page.locator('h1, h2, h3').all();
  console.log('Found headings:', await Promise.all(headings.map(h => h.textContent())));
  
  // Check if there are any error messages
  const errorMessages = await page.locator('[class*="error"], [class*="Error"]').all();
  console.log('Found error elements:', await Promise.all(errorMessages.map(e => e.textContent())));
  
  // Check if the page title is correct
  const title = await page.title();
  console.log('Page title:', title);
});
