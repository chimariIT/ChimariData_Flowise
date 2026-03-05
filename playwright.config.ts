import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load default env, then overlay Playwright-specific overrides if present
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env.playwright'), override: true });

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
    baseURL: 'http://localhost:5000',

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

  /* Run your local dev server before starting the tests */
  /* 
   * Architecture: The app uses TWO servers:
   * - Frontend (Vite): http://localhost:5173 (client app)
   * - Backend (Express): http://localhost:5000 (API server)
   * 
   * The webServer runs 'npm run dev' which starts both via concurrently.
   * We check the backend health endpoint to ensure both servers are ready,
   * since the backend is critical for API calls (auth, data, etc.).
   */
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5000/api/health', // Check backend health endpoint (requires both servers)
          reuseExistingServer: true,  // Always reuse to avoid conflicts
          timeout: 240 * 1000, // 4 minutes for both servers to start
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});

export default baseConfig;
