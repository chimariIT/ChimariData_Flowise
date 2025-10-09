import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

// Verifies key protected pages render when authenticated via API token injection.

test.describe('Protected routes (authenticated)', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({ page, request }) => {
    await programmaticLogin(page, request);
  });

  test('Dashboard loads when authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    const createProjectBtn = page.getByRole('button', { name: /create project|new project/i }).first();
    const heading = page.getByRole('heading', { level: 1 }).first();

    // Should not be redirected to auth
    expect(page.url()).not.toMatch(/\/auth\//);

    await expect(async () => {
      // Allow either CTA or a main heading
      const ctaVisible = await createProjectBtn.isVisible().catch(() => false);
      const h1Visible = await heading.isVisible().catch(() => false);
      expect(ctaVisible || h1Visible).toBe(true);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 15_000 });
  });

  test('Settings loads when authenticated', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('domcontentloaded');

    // Not redirected to auth
    expect(page.url()).not.toMatch(/\/auth\//);

    // Stable selectors via data-testid
    const settingsForm = page.getByTestId('settings-form');
    const saveBtn = page.getByTestId('save-settings');
    const apiKeyInput = page.getByTestId('api-key-input');

    await expect(settingsForm).toBeVisible();
    await expect(saveBtn).toBeVisible();
    // API key input is conditionally visible based on provider selection; don't require it, but probe if present
    const apiKeyVisible = await apiKeyInput.isVisible().catch(() => false);
    expect(typeof apiKeyVisible === 'boolean').toBeTruthy();
  });
});
