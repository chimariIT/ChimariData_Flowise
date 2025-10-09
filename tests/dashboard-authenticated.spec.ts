import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

// This spec authenticates via the test-only endpoint and ensures dashboard loads for an authenticated user.
test.describe('Dashboard (authenticated)', () => {
  test.setTimeout(120_000);

  test('logs in via API and renders dashboard UI', async ({ page, request }) => {
    // Get a token and configure context
    await programmaticLogin(page, request);

    // Go to dashboard; app should treat us as authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

  // Verify dashboard elements (project list region or Create Project CTA)
    const projectList = page.getByRole('region', { name: /projects|my projects|project list/i }).first();
    const createProjectBtn = page.getByRole('button', { name: /create project|new project/i }).first();

    const outcome = await Promise.race([
      projectList.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'dashboard'),
      createProjectBtn.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'dashboard'),
    ]).catch(() => 'unknown');

    if (outcome !== 'dashboard') {
      // Fallback: heading visible and not on auth page
      const h1 = page.getByRole('heading', { level: 1 }).first();
      await expect(h1).toBeVisible();
      expect(page.url()).not.toMatch(/\/auth\//);
    } else {
      expect(await projectList.isVisible() || await createProjectBtn.isVisible()).toBe(true);
    }
  });
});
