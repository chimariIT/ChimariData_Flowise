import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load default env, then load Playwright-specific defaults without overriding
// explicitly provided shell env vars (for local/CI control of skipWebServer).
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.playwright') });

const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
console.log(
  '[Playwright Config] PLAYWRIGHT_SKIP_WEBSERVER:',
  process.env.PLAYWRIGHT_SKIP_WEBSERVER,
  'skipWebServer:',
  skipWebServer
);

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const baseConfig = defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  testIgnore: ['**/unit/**', '**/integration/**', '**/performance/**'],
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshots on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    /* Increase default timeouts for slower startup */
    actionTimeout: 30 * 1000,
    navigationTimeout: 45 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run the frontend dev server before starting the tests.
   *
   * Architecture:
   * - Frontend (Vite): http://localhost:5173 — proxies /api/* to Python backend
   * - Backend (Python FastAPI): http://localhost:8000 — started separately (in CI or manually)
   *
   * The webServer starts only the frontend. The Python backend must already be running.
   * In CI, the workflow starts the Python backend before Playwright runs.
   */
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'npm run dev:frontend',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 120 * 1000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});

export default baseConfig;
