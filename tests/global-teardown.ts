/**
 * Global Teardown for CI/CD Security
 *
 * Cleans up authentication state and temporary files after all tests complete.
 * Ensures no sensitive data is left behind.
 *
 * Security:
 * - Clears token from memory
 * - Removes .auth directory if it exists
 * - Runs even if tests fail (via Playwright guarantee)
 */

import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Global Teardown: Starting cleanup...');

  // Clear sensitive environment variables
  if (process.env.TEST_ADMIN_TOKEN) {
    console.log('🔑 Clearing admin token from memory');
    delete process.env.TEST_ADMIN_TOKEN;
  }

  if (process.env.TEST_ADMIN_USER_ID) {
    delete process.env.TEST_ADMIN_USER_ID;
  }

  if (process.env.TEST_ADMIN_EMAIL) {
    delete process.env.TEST_ADMIN_EMAIL;
  }

  // Clean up .auth directory if in CI mode
  const isCI = !!process.env.CI;
  const useSecureMode = process.env.USE_SECURE_AUTH === 'true';

  if (isCI || useSecureMode) {
    const authDir = path.join(__dirname, '..', '.auth');

    if (fs.existsSync(authDir)) {
      try {
        console.log('🗑️  Removing .auth directory:', authDir);
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('✅ Auth directory removed');
      } catch (error) {
        console.error('⚠️  Failed to remove auth directory:', error);
      }
    }
  }

  console.log('✅ Global teardown complete');
}

export default globalTeardown;
