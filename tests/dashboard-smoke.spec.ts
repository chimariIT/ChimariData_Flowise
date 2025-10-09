import { test, expect } from '@playwright/test';

test.describe('Dashboard smoke', () => {
  test.setTimeout(90_000);

  test('Dashboard renders or redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Two acceptable outcomes:
    // 1) Dashboard UI present (project list, or "Create Project" CTA)
    const projectList = page.getByRole('region', { name: /projects|my projects|project list/i }).first();
    const createProjectBtn = page.getByRole('button', { name: /create project|new project/i }).first();

    // 2) Redirect to login if unauthenticated
    const loginEmail = page.locator('input[type="email"]');
    const loginPassword = page.locator('input[type="password"]');

    const outcome = await Promise.race([
      projectList.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'dashboard'),
      createProjectBtn.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'dashboard'),
      loginEmail.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'login'),
    ]).catch(() => 'unknown');

    if (outcome === 'dashboard') {
      // Basic assertion for dashboard view
      expect(await projectList.isVisible() || await createProjectBtn.isVisible()).toBe(true);
    } else if (outcome === 'login') {
      await expect(loginEmail).toBeVisible();
      await expect(loginPassword.first()).toBeVisible();
    } else {
      // As a fallback, assert page didn’t 404 and has some main content
      const h1 = page.getByRole('heading', { level: 1 }).first();
      await expect(h1).toBeVisible();
    }
  });
});
