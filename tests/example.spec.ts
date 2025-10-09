// @ts-check
import { test, expect } from '@playwright/test';

test('homepage has title and links to intro page', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Chimari/);

  // create a locator
  const getStarted = page.getByRole('link', { name: 'Get Started' });

  // Expect an attribute "to be strictly equal" to the value.
  await expect(getStarted).toHaveAttribute('href', '/login');

  // Click the get started link.
  await getStarted.click();

  // Expects the URL to contain intro.
  await expect(page).toHaveURL(/.*login/);
});
