import { test, expect } from '@playwright/test';

test.describe('Authentication smoke', () => {
  test.setTimeout(60_000);

  test('Login page renders and shows essential fields', async ({ page, baseURL }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('domcontentloaded');
    // Be flexible on UI labels; look for common elements
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  // Button might be Login or Sign In; prefer the submit button to avoid provider buttons
  const loginButton = page.locator('button[type="submit"]').first();
  await expect(loginButton).toBeVisible();
  });

  test('Registration page renders and shows essential fields', async ({ page }) => {
    await page.goto('/auth/register');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Often has confirm password too; if absent, this will no-op quickly
    const confirm = page.locator('input[type="password"]').nth(1);
    // Don't fail if there's only one password field
    if (await confirm.count()) {
      await expect(confirm).toBeVisible();
    }
  // Prefer the submit button on registration as well
  const registerButton = page.locator('button[type="submit"]').first();
  await expect(registerButton).toBeVisible();
  });
});
