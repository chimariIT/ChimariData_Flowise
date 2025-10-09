/**
 * Playwright Authentication Setup
 *
 * This setup script runs ONCE before all tests to create an admin account
 * and save the authentication state for reuse across all tests.
 *
 * Security:
 * - Uses test-only credentials
 * - Creates .auth/admin.json with JWT token and localStorage
 * - File is gitignored to prevent credential exposure
 * - Only runs in local development (CI uses global-setup.ts)
 */

import { test as setup, expect } from '@playwright/test';
import { setupAdminAccount } from './utils/auth';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '..', '.auth', 'admin.json');

setup('authenticate as admin and save state', async ({ request, context }) => {
  console.log('🔐 Setting up admin authentication...');

  // Ensure .auth directory exists
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Wait for server to be ready with timeout
  console.log('⏳ Waiting for server to be ready...');
  const maxWaitTime = 60000; // 60 seconds
  const startTime = Date.now();
  let serverReady = false;

  while (Date.now() - startTime < maxWaitTime && !serverReady) {
    try {
      const healthResponse = await request.get('/api/health', { timeout: 5000 });
      if (healthResponse.ok()) {
        serverReady = true;
        console.log('✅ Server is ready');
        break;
      }
    } catch (error) {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!serverReady) {
    throw new Error('Server failed to start within 60 seconds');
  }

  // Setup admin account via API
  console.log('👤 Creating admin account...');
  const credentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@chimaridata.com',
    password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
    firstName: 'Admin',
    lastName: 'User'
  };

  const { token, user } = await setupAdminAccount(request, credentials);

  console.log('✅ Admin authenticated:', user.email);
  console.log('📋 User details:', {
    id: user.id,
    email: user.email,
    isAdmin: user.isAdmin,
    subscriptionTier: user.subscriptionTier
  });

  // Create a page to set localStorage
  const page = await context.newPage();

  // Navigate to base URL to establish origin
  await page.goto('http://localhost:5173');

  // Inject auth token into localStorage
  await page.evaluate((tk) => {
    window.localStorage.setItem('auth_token', tk);
  }, token);

  console.log('💾 Token injected into localStorage');

  // Verify token was set
  const storedToken = await page.evaluate(() => {
    return window.localStorage.getItem('auth_token');
  });

  expect(storedToken).toBe(token);
  console.log('✅ Token verified in localStorage');

  // Save storage state to file
  await context.storageState({ path: authFile });

  console.log('💾 Authentication state saved to:', authFile);
  console.log('🎉 Setup complete! All tests will use this authenticated state.');

  await page.close();
});

setup('verify admin access', async ({ request }) => {
  console.log('🔍 Verifying admin access...');

  // Read the saved auth state
  const authState = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
  const token = authState.origins?.[0]?.localStorage?.find(
    (item: any) => item.name === 'auth_token'
  )?.value;

  if (!token) {
    throw new Error('No auth token found in saved state');
  }

  // Test admin API access
  const response = await request.get('/api/admin/agents', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (response.ok()) {
    console.log('✅ Admin access verified - can access /api/admin/agents');
  } else {
    const status = response.status();
    console.error('❌ Admin access failed:', status);
    throw new Error(`Admin verification failed with status ${status}`);
  }
});
