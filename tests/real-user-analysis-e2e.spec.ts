import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Longer timeout for end-to-end real user flow
test.setTimeout(180_000);

// Utility: consistently use domcontentloaded and sane timeouts
test.beforeEach(async ({ page }) => {
  const originalGoto = page.goto.bind(page);
  (page as any).goto = (url: string, options: any = {}) =>
    originalGoto(url as any, { waitUntil: 'domcontentloaded', ...options } as any);
  page.setDefaultNavigationTimeout(60_000);
  page.setDefaultTimeout(60_000);
});

function msg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function waitForPageLoad(page: Page, timeout = 10_000) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log(`⚠️ load continue: ${msg(e)}`);
  }
}

async function screenshot(page: Page, name: string, description?: string) {
  const dir = path.join(__dirname, '..', 'test-results', 'real-user-e2e');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`📸 ${name}${description ? ' - ' + description : ''}`);
}

async function registerViaUI(page: Page, user: { email: string; password: string; firstName: string; lastName: string; }) {
  await page.goto('/auth/register');
  await waitForPageLoad(page);
  await screenshot(page, '01-register-form', 'Registration form');

  // Some deployments land on login by default; try to switch to sign up
  const bodyText = await page.textContent('body').catch(() => '');
  if (bodyText?.match(/Welcome Back|Sign in/i)) {
    const signUp = page.getByText(/Sign Up|Sign up|Register/i).first();
    if (await signUp.isVisible().catch(() => false)) {
      await signUp.click();
      await waitForPageLoad(page);
    }
  }

  await page.fill('input[type="email"]', user.email);

  // Try multiple selectors for first/last name
  const firstSel = ['input[name="firstName"]','input#firstName','input[placeholder*="first" i]'];
  for (const sel of firstSel) {
    try { if (await page.locator(sel).isVisible()) { await page.fill(sel, user.firstName); break; } } catch {}
  }
  const lastSel = ['input[name="lastName"]','input#lastName','input[placeholder*="last" i]'];
  for (const sel of lastSel) {
    try { if (await page.locator(sel).isVisible()) { await page.fill(sel, user.lastName); break; } } catch {}
  }

  const pwFields = page.locator('input[type="password"]');
  const pwCount = await pwFields.count();
  if (pwCount >= 1) await pwFields.nth(0).fill(user.password);
  if (pwCount >= 2) await pwFields.nth(1).fill(user.password); // confirm

  const submit = page.locator('button[type="submit"]');
  if (await submit.isVisible().catch(() => false)) {
    await submit.click();
    await waitForPageLoad(page);
  }
  await screenshot(page, '02-register-submitted');
}

async function loginViaUI(page: Page, user: { email: string; password: string; }) {
  await page.goto('/auth/login');
  await waitForPageLoad(page);
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await waitForPageLoad(page);
  await screenshot(page, '03-login-post');
}

async function uploadDataset(page: Page) {
  await page.goto('/journeys/non-tech/data');
  await waitForPageLoad(page);
  await screenshot(page, '04-data-step');

  const csv = path.join(__dirname, '..', 'housing_regression_data.csv');
  const input = page.locator('input[type="file"]').first();
  if (await input.count() > 0) {
    await input.setInputFiles(csv);
    await page.waitForTimeout(1500);
    await screenshot(page, '05-data-uploaded');
  }
}

async function runAnalysis(page: Page) {
  await page.goto('/journeys/non-tech/execute');
  await waitForPageLoad(page);
  await screenshot(page, '06-execute-initial');

  // Click Execute Analysis. For non-tech journey, defaults are auto-selected.
  const execBtn = page.getByRole('button', { name: /Execute Analysis/i }).first();
  await execBtn.click({ trial: false }).catch(() => {});

  // If the button wasn't found via role, try text selector
  if (!(await page.getByText(/Execution Progress|Running analysis|Configuring/i).first().isVisible().catch(() => false))) {
    const alt = page.locator('button:has-text("Execute Analysis")').first();
    if (await alt.isVisible().catch(() => false)) {
      await alt.click();
    }
  }

  // Wait for progress and then completion
  await page.waitForSelector('text=Execution Progress', { timeout: 30_000 }).catch(() => {});
  await screenshot(page, '07-execution-started');

  await page.waitForSelector('text=Analysis Complete', { timeout: 60_000 });
  await screenshot(page, '08-execution-completed');

  // Verify summary badges exist (target numeric badges to avoid strict mode conflicts)
  await expect(page.getByText(/\d+\s+analyses completed/i).first()).toBeVisible();
  await expect(page.getByText(/\d+\s+results generated/i).first()).toBeVisible();
  await expect(page.getByText(/\d+%?\s*quality score/i).first()).toBeVisible();
}

test('Real user registers, logs in, uploads data, and runs analysis (non-tech)', async ({ page }) => {
  // 1) Landing
  await page.goto('/');
  await waitForPageLoad(page);
  await screenshot(page, '00-landing');

  // 2) Register user via UI (fallback to login if already exists)
  const user = {
    email: `realuser.${Date.now()}@chimari.test`,
    password: 'TestPassword123!',
    firstName: 'Real',
    lastName: 'User'
  };

  try {
    await registerViaUI(page, user);
  } catch (e) {
    console.log('Registration flow error, proceeding to login:', msg(e));
  }

  // 3) Ensure authenticated by visiting dashboard; if redirected, attempt login
  await page.goto('/dashboard');
  await waitForPageLoad(page);
  const onAuth = (await page.url()).includes('/auth');
  if (onAuth) {
    await loginViaUI(page, user);
  }
  // Validate we can reach dashboard or journeys
  await page.goto('/journeys');
  await waitForPageLoad(page);
  await screenshot(page, '03-journeys');

  // 4) Upload dataset on data step
  await uploadDataset(page);

  // 5) Run analysis in execute step and verify completion
  await runAnalysis(page);
});
