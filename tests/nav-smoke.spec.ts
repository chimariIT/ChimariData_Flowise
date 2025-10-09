import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

test.describe('Navigation smoke', () => {
  test.setTimeout(90_000);

  test('Landing page renders core content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Look for a main hero or headline text; be flexible
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test('Pricing page loads with plan cards', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('domcontentloaded');
    // Expect at least one pricing card or button that mentions a plan
    const plan = page.getByText(/trial|starter|professional|enterprise/i).first();
    await expect(plan).toBeVisible({ timeout: 30_000 });
  });

  test('Demos page loads a demos/list section', async ({ page }) => {
    await page.goto('/demos');
    await page.waitForLoadState('domcontentloaded');
    // Look for a demos heading or description
    const demosHeading = page.getByRole('heading', { name: /demo|demos/i }).first();
    await expect(demosHeading).toBeVisible({ timeout: 30_000 });
  });

  test('Dashboard reachable when authenticated', async ({ page, request }) => {
    await programmaticLogin(page, request);
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toMatch(/\/auth\//);
  });
});
