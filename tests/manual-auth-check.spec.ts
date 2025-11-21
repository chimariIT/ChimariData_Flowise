/**
 * Manual Auth Page Loading Check
 *
 * This test checks if the /auth/register page loads correctly.
 */

import { test, expect } from '@playwright/test';

test('Manual check: auth/register page loads', async ({ page }) => {
  console.log('🔍 Navigating to /auth/register...');

  // Navigate to registration page
  await page.goto('/auth/register', {
    waitUntil: 'networkidle',
    timeout: 60000
  });

  console.log('✅ Page navigation completed');

  // Take screenshot of what loaded
  await page.screenshot({
    path: 'test-results/auth-page-load.png',
    fullPage: true
  });

  console.log('✅ Screenshot saved to test-results/auth-page-load.png');

  // Check if form inputs are visible
  const emailInput = page.locator('input[name="email"]');
  const isEmailVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false);

  console.log(`📧 Email input visible: ${isEmailVisible}`);

  if (isEmailVisible) {
    console.log('✅ SUCCESS: Registration form loaded correctly');
    expect(isEmailVisible).toBe(true);
  } else {
    // Check what's actually on the page
    const bodyText = await page.locator('body').textContent();
    console.log('❌ FAILED: Registration form not visible');
    console.log('📄 Page content:', bodyText?.substring(0, 500));

    // Check browser console for errors
    page.on('console', msg => console.log('Browser console:', msg.text()));

    // This will fail the test but give us diagnostic info
    expect(isEmailVisible, 'Registration form should be visible').toBe(true);
  }
});
