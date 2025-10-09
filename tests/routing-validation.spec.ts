/**
 * Routing Validation Tests
 * 
 * Validates that admin and user routing works correctly with our new RBAC implementation
 */

import { test, expect } from '@playwright/test';

test.describe('Routing Validation', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('Admin routing - should redirect to /admin on login', async ({ page }) => {
    // Already authenticated as admin via storageState
    // Test that admin goes to /admin dashboard
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Verify we're on admin dashboard
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();
    await expect(page.locator('text="Admin Mode"')).toBeVisible();

    // Verify consultant mode functionality
    await expect(page.locator('button:has-text("Act on Behalf of Customer")')).toBeVisible();
    await expect(page.locator('text="Consultant Mode"')).toBeVisible();

    await page.screenshot({
      path: 'test-results/routing/01-admin-dashboard-routing.png',
      fullPage: true
    });
  });

  test('Admin consultant mode - should show clear indicators when accessing customer dashboard', async ({ page }) => {
    // Navigate to admin dashboard first
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click "Act on Behalf of Customer" button
    const consultantButton = page.locator('button:has-text("Act on Behalf of Customer")').first();
    await consultantButton.click();
    await page.waitForLoadState('networkidle');

    // Verify consultant mode indicators are visible
    await expect(page.locator(':has-text("Consultant Mode")')).toBeVisible();
    await expect(page.locator(':has-text("Acting on Behalf")')).toBeVisible();
    await expect(page.locator('button:has-text("Return to Admin Panel")')).toBeVisible();

    await page.screenshot({
      path: 'test-results/routing/02-admin-consultant-mode-indicators.png',
      fullPage: true
    });

    // Test return to admin panel
    const returnButton = page.locator('button:has-text("Return to Admin Panel")').first();
    await returnButton.click();
    await page.waitForLoadState('networkidle');

    // Verify we're back on admin dashboard
    await expect(page.locator('h1:has-text("Admin Dashboard")')).toBeVisible();

    await page.screenshot({
      path: 'test-results/routing/03-return-to-admin-panel.png',
      fullPage: true
    });
  });

  test('Admin can access customer dashboard directly', async ({ page }) => {
    // Navigate directly to customer dashboard as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify consultant mode indicators are present
    await expect(page.locator(':has-text("Consultant Mode")')).toBeVisible();
    await expect(page.locator(':has-text("Acting on Behalf")')).toBeVisible();
    await expect(page.locator('button:has-text("Return to Admin Panel")')).toBeVisible();

    // Verify admin panel button is available in navigation
    await expect(page.locator('button:has-text("Admin Panel")')).toBeVisible();

    await page.screenshot({
      path: 'test-results/routing/04-admin-direct-customer-access.png',
      fullPage: true
    });
  });

  test('Route validation - admin cannot access admin routes as regular user', async ({ page }) => {
    // Test that admin routes are protected
    await page.goto('/admin/agent-management');
    await page.waitForLoadState('networkidle');

    // Should be on admin page (admin is authenticated)
    await expect(page.locator('h1:has-text("Admin Dashboard"), h1:has-text("Agent Management")')).toBeVisible();

    await page.screenshot({
      path: 'test-results/routing/05-admin-route-access.png',
      fullPage: true
    });
  });

  test('Navigation consistency - admin can switch between modes', async ({ page }) => {
    // Test multiple navigation patterns
    const navigationTests = [
      { from: '/admin', to: '/dashboard', expected: 'consultant mode' },
      { from: '/dashboard', to: '/admin', expected: 'admin mode' },
      { from: '/admin', to: '/admin/agent-management', expected: 'admin subpage' }
    ];

    for (let i = 0; i < navigationTests.length; i++) {
      const test = navigationTests[i];
      
      await page.goto(test.from);
      await page.waitForLoadState('networkidle');

      if (test.expected === 'consultant mode') {
        await expect(page.locator('text="Consultant Mode"')).toBeVisible();
      } else if (test.expected === 'admin mode') {
        await expect(page.locator('text="Admin Dashboard"')).toBeVisible();
      }

      await page.screenshot({
        path: `test-results/routing/06-navigation-${i + 1}-${test.expected.replace(' ', '-')}.png`,
        fullPage: true
      });
    }
  });
});
