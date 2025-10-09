/**
 * Global Setup for CI/CD Security
 *
 * This setup runs in CI/CD environments where we don't want to save
 * authentication state to files. Instead, we store the token in memory
 * (process.env) for use during the test session.
 *
 * Security Benefits:
 * - No auth files written to disk
 * - Token only exists in memory during test run
 * - Automatically cleaned up when tests finish
 * - Prevents accidental credential exposure in CI artifacts
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🔐 Global Setup: Starting secure authentication (CI/CD mode)...');

  // Only run in CI or when explicitly requested
  const isCI = !!process.env.CI;
  const useSecureMode = process.env.USE_SECURE_AUTH === 'true';

  if (!isCI && !useSecureMode) {
    console.log('ℹ️  Skipping global setup (using shared auth state instead)');
    return;
  }

  console.log('🔒 Running in secure mode (no auth files will be created)');

  // Get base URL from config or environment
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';
  console.log('🌐 Base URL:', baseURL);

  // Launch browser
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Wait for server to be ready
  console.log('⏳ Waiting for server...');
  const maxRetries = 30;
  let retries = 0;
  let serverReady = false;

  while (retries < maxRetries && !serverReady) {
    try {
      const response = await page.goto(`${baseURL}/api/health`, {
        timeout: 5000,
        waitUntil: 'domcontentloaded'
      });

      if (response && response.ok()) {
        serverReady = true;
        console.log('✅ Server is ready');
        break;
      }
    } catch (error) {
      retries++;
      console.log(`⏳ Attempt ${retries}/${maxRetries} - waiting for server...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!serverReady) {
    await browser.close();
    throw new Error('❌ Server failed to start after 30 attempts (60 seconds)');
  }

  // Setup admin account via API
  console.log('👤 Creating admin account...');

  const credentials = {
    email: process.env.TEST_ADMIN_EMAIL || 'admin@test.local',
    password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password-123',
    firstName: 'Test',
    lastName: 'Admin'
  };

  try {
    const response = await page.request.post(`${baseURL}/api/auth/setup-admin`, {
      data: credentials,
      timeout: 30000
    });

    if (!response.ok()) {
      const text = await response.text();
      throw new Error(`Admin setup failed: ${response.status()} - ${text}`);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('Admin setup returned no token');
    }

    // Store token in environment variable (memory only)
    process.env.TEST_ADMIN_TOKEN = data.token;
    process.env.TEST_ADMIN_USER_ID = data.user.id;
    process.env.TEST_ADMIN_EMAIL = data.user.email;

    console.log('✅ Admin authenticated:', data.user.email);
    console.log('📋 User ID:', data.user.id);
    console.log('🔑 Token stored in memory (not on disk)');

    // Verify admin access
    console.log('🔍 Verifying admin access...');
    const verifyResponse = await page.request.get(`${baseURL}/api/admin/agents`, {
      headers: {
        'Authorization': `Bearer ${data.token}`
      }
    });

    if (verifyResponse.ok()) {
      console.log('✅ Admin access verified');
    } else {
      console.warn('⚠️  Admin verification returned:', verifyResponse.status());
    }

  } catch (error) {
    await browser.close();
    console.error('❌ Failed to setup admin:', error);
    throw error;
  }

  await browser.close();
  console.log('🎉 Global setup complete!');
}

export default globalSetup;
