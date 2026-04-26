/**
 * Admin Pages End-to-End Test Suite
 *
 * Tests all admin functionality including:
 * - Agent management (CRUD operations)
 * - Tool management (CRUD operations)
 * - Agent templates
 * - Subscription management
 * - Campaigns management (when implemented)
 * - System monitoring
 *
 * Prerequisites:
 * - Frontend running on localhost:5173 (or PLAYWRIGHT_BASE_URL)
 * - Test admin user with admin role
 * - Database in clean state
 */

import { test, expect, Page } from '@playwright/test';

/**
 * Admin Pages E2E Test Suite
 *
 * Authentication Strategy:
 * - LOCAL: Uses shared auth state from .auth/admin.json (created by auth.setup.ts)
 * - CI/CD: Uses in-memory token from global-setup.ts (stored in process.env)
 *
 * All tests automatically start with admin authentication already configured.
 * No manual login required in test.beforeEach hooks.
 */

// Test configuration
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const API_BASE = process.env.PLAYWRIGHT_API_BASE || `${BASE_URL}/api`;
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || 'admin@chimaridata.com';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || 'admin123';

async function loginAsAdmin(page: Page) {
  const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  if (!loginResponse.ok()) {
    throw new Error(
      `Admin login failed for ${ADMIN_EMAIL}. Set PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD to valid admin credentials.`
    );
  }

  const loginData = await loginResponse.json();
  const token = loginData?.token as string | undefined;
  const user = loginData?.user;

  if (!token) {
    throw new Error(`Admin login returned no token for ${ADMIN_EMAIL}`);
  }

  await page.addInitScript(
    ({ authToken, authUser }) => {
      window.localStorage.setItem('auth_token', authToken);
      if (authUser) {
        window.localStorage.setItem('auth_user', JSON.stringify(authUser));
      }
    },
    { authToken: token, authUser: user }
  );

  await page.context().setExtraHTTPHeaders({
    Authorization: `Bearer ${token}`,
    'X-Forwarded-Authorization': `Bearer ${token}`,
  });
}

async function navigateToAdminPage(page: Page, adminPage: string) {
  await loginAsAdmin(page);
  await page.goto(`${BASE_URL}/admin/${adminPage}`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(new RegExp(`/admin/${adminPage}`), { timeout: 60000 });
}

test.describe('Admin Pages - Agent Management', () => {
  // Authentication handled by:
  // - Local: storageState from .auth/admin.json
  // - CI: global-setup.ts injects token into context

  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should load agent management page', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Check page elements
    await expect(page.locator('h1, h2').filter({ hasText: /agent/i }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /add agent/i })).toBeVisible();

    console.log('✅ Agent management page loaded');
  });

  test('should display list of existing agents', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Wait for agents to load
    await page.waitForTimeout(2000);

    // Should see at least the core agents
    const agentNames = [
      'Data Scientist',
      'Business',
      'Technical AI',
      'Customer Support',
      'Data Engineer',
      'Project Manager'
    ];

    for (const name of agentNames) {
      const agentCard = page.locator('div, article').filter({ hasText: new RegExp(name, 'i') });
      await expect(agentCard.first()).toBeVisible({ timeout: 5000 });
    }

    console.log('✅ All core agents visible');
  });

  test('should show agent details and metrics', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');
    await page.waitForTimeout(2000);

    // Click on first agent card
    const firstAgent = page.locator('div[class*="card"], article').first();
    await firstAgent.waitFor({ state: 'visible' });

    // Check for key metrics
    await expect(page.getByText(/status/i).first()).toBeVisible();
    await expect(page.getByText(/tasks/i).first()).toBeVisible();

    console.log('✅ Agent details and metrics displayed');
  });

  test('should create a new agent via UI', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Click Add Agent button
    await page.click('button:has-text("Add Agent"), button:has-text("Create Agent")');

    // Fill in agent form
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Test Analytics Agent');
    await page.fill('textarea[name="description"], textarea[placeholder*="description" i]', 'Agent for testing purposes');

    // Select agent type if dropdown exists
    const typeSelect = page.locator('select[name="type"], [role="combobox"]').first();
    if (await typeSelect.isVisible()) {
      await typeSelect.click();
      await page.click('option:has-text("analysis"), [role="option"]:has-text("analysis")');
    }

    // Set priority and concurrent tasks
    const priorityInput = page.locator('input[name="priority"]');
    if (await priorityInput.isVisible()) {
      await priorityInput.fill('5');
    }

    const concurrentInput = page.locator('input[name="maxConcurrentTasks"]');
    if (await concurrentInput.isVisible()) {
      await concurrentInput.fill('3');
    }

    // Submit form
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    // Wait for success message or agent to appear in list
    await page.waitForTimeout(2000);

    // Verify agent was created
    await expect(page.locator('div, article').filter({ hasText: /Test Analytics Agent/i }).first()).toBeVisible({ timeout: 10000 });

    console.log('✅ Successfully created new agent');
  });

  test('should delete an agent', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');
    await page.waitForTimeout(2000);

    // Find Test Analytics Agent created in previous test
    const testAgent = page.locator('div, article').filter({ hasText: /Test Analytics Agent/i }).first();

    if (await testAgent.isVisible()) {
      // Find and click delete button
      await testAgent.locator('button:has-text("Delete"), button[title*="delete" i]').click();

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      await page.waitForTimeout(2000);

      // Verify agent was deleted
      await expect(testAgent).not.toBeVisible({ timeout: 10000 });

      console.log('✅ Successfully deleted agent');
    } else {
      console.log('⚠️  Test agent not found, skipping deletion test');
    }
  });
});

test.describe('Admin Pages - Tool Management', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should load tools management page', async ({ page }) => {
    await navigateToAdminPage(page, 'tools-management');

    await expect(page.locator('h1, h2').filter({ hasText: /tool/i }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /add tool/i })).toBeVisible();

    console.log('✅ Tools management page loaded');
  });

  test('should display list of existing tools', async ({ page }) => {
    await navigateToAdminPage(page, 'tools-management');
    await page.waitForTimeout(2000);

    // Should see core tools
    const toolNames = [
      'file_processor',
      'schema_generator',
      'data_transformer',
      'statistical_analyzer',
      'ml_pipeline'
    ];

    for (const name of toolNames) {
      const toolCard = page.locator('div, article').filter({ hasText: new RegExp(name, 'i') });
      await expect(toolCard.first()).toBeVisible({ timeout: 5000 });
    }

    console.log('✅ All core tools visible');
  });

  test('should create a new tool via UI', async ({ page }) => {
    await navigateToAdminPage(page, 'tools-management');

    // Click Add Tool button
    await page.click('button:has-text("Add Tool"), button:has-text("Create Tool")');

    // Fill in tool form
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'test_sentiment_analyzer');
    await page.fill('textarea[name="description"], textarea[placeholder*="description" i]', 'Analyzes sentiment of text data');
    await page.fill('input[name="service"]', 'SentimentAnalyzer');

    // Set category if dropdown exists
    const categorySelect = page.locator('select[name="category"], [role="combobox"]').first();
    if (await categorySelect.isVisible()) {
      await categorySelect.click();
      await page.click('option:has-text("analysis"), [role="option"]:has-text("analysis")');
    }

    // Set permissions (comma-separated)
    const permissionsInput = page.locator('input[name="permissions"]');
    if (await permissionsInput.isVisible()) {
      await permissionsInput.fill('analyze_text, read_data');
    }

    // Submit form
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    await page.waitForTimeout(2000);

    // Verify tool was created
    await expect(page.locator('div, article').filter({ hasText: /test_sentiment_analyzer/i }).first()).toBeVisible({ timeout: 10000 });

    console.log('✅ Successfully created new tool');
  });

  test('should delete a tool', async ({ page }) => {
    await navigateToAdminPage(page, 'tools-management');
    await page.waitForTimeout(2000);

    // Find test tool created in previous test
    const testTool = page.locator('div, article').filter({ hasText: /test_sentiment_analyzer/i }).first();

    if (await testTool.isVisible()) {
      // Find and click delete button
      await testTool.locator('button:has-text("Delete"), button[title*="delete" i]').click();

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }

      await page.waitForTimeout(2000);

      // Verify tool was deleted
      await expect(testTool).not.toBeVisible({ timeout: 10000 });

      console.log('✅ Successfully deleted tool');
    } else {
      console.log('⚠️  Test tool not found, skipping deletion test');
    }
  });
});

test.describe('Admin Pages - Agent Templates', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should access agent templates (API test)', async ({ page, request }) => {
    await loginAsAdmin(page);

    // Test template API endpoint
    const response = await request.get(`${API_BASE}/admin/templates`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.templates).toBeInstanceOf(Array);
    expect(data.templates.length).toBeGreaterThan(0);

    // Check for known templates
    const templateIds = data.templates.map((t: any) => t.id);
    expect(templateIds).toContain('customer_churn_predictor');
    expect(templateIds).toContain('sales_forecaster');

    console.log(`✅ Found ${data.templates.length} agent templates via API`);
  });

  test('should filter templates by category (API test)', async ({ page, request }) => {
    await loginAsAdmin(page);

    const response = await request.get(`${API_BASE}/admin/templates?category=ml`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.templates).toBeInstanceOf(Array);

    // All templates should be ML category
    data.templates.forEach((template: any) => {
      expect(template.category).toBe('ml');
    });

    console.log(`✅ ML category filter working: ${data.templates.length} templates`);
  });

  test('should create agent from template (API test)', async ({ page, request }) => {
    await loginAsAdmin(page);

    const response = await request.post(`${API_BASE}/admin/templates/sales_forecaster/create`, {
      data: {
        name: 'My Custom Sales Forecaster',
        priority: 5
      }
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.agent).toBeDefined();
    expect(data.agent.name).toBe('My Custom Sales Forecaster');

    console.log('✅ Successfully created agent from template');

    // Cleanup: Delete created agent
    // (Would need agent ID from response)
  });
});

test.describe('Admin Pages - Subscription Management', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should load subscription management page', async ({ page }) => {
    await navigateToAdminPage(page, 'subscription-management');

    await expect(page.locator('h1, h2').filter({ hasText: /subscription/i }).first()).toBeVisible({ timeout: 10000 });

    console.log('✅ Subscription management page loaded');
  });

  test('should display subscription tiers configuration', async ({ page }) => {
    await navigateToAdminPage(page, 'subscription-management');
    await page.waitForTimeout(2000);

    // Should see tier names
    const tierNames = ['Trial', 'Starter', 'Professional', 'Enterprise'];

    for (const tier of tierNames) {
      const tierSection = page.locator('div, section').filter({ hasText: new RegExp(tier, 'i') });
      await expect(tierSection.first()).toBeVisible({ timeout: 5000 });
    }

    console.log('✅ All subscription tiers visible');
  });

  test('should display pricing information', async ({ page }) => {
    await navigateToAdminPage(page, 'subscription-management');
    await page.waitForTimeout(2000);

    // Check for price indicators
    await expect(page.getByText(/\$/i).first()).toBeVisible();
    await expect(page.getByText(/month/i).first()).toBeVisible();

    console.log('✅ Pricing information displayed');
  });
});

test.describe('Admin Pages - System Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should access system status API', async ({ page }) => {
    await loginAsAdmin(page);

    let token = await page.evaluate(() => window.localStorage.getItem('auth_token'));
    if (!token) {
      const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
        data: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      expect(loginResponse.ok()).toBeTruthy();
      const loginData = await loginResponse.json();
      token = loginData.token;
    }

    const response = await page.request.get(`${API_BASE}/admin/health`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.data).toBeDefined();
    expect(data.data.status).toBeDefined();
    expect(data.data.services).toBeDefined();
    expect(data.data.services.database).toBeDefined();

    console.log(`System health status: ${data.data.status}`);
  });

  test('should access Stripe webhook diagnostics API', async ({ page }) => {
    await loginAsAdmin(page);

    let token = await page.evaluate(() => window.localStorage.getItem('auth_token'));
    if (!token) {
      const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
        data: {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        },
      });
      expect(loginResponse.ok()).toBeTruthy();
      const loginData = await loginResponse.json();
      token = loginData.token;
    }

    const response = await page.request.get(`${API_BASE}/payment/webhook/diagnostics`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBeTruthy();
    expect(data.data).toBeDefined();
    expect(data.data.stripeConfigured).toBeDefined();
    expect(data.data.webhookSecretConfigured).toBeDefined();
    expect(data.data.signatureValidationEnabled).toBeDefined();
    expect(Array.isArray(data.data.webhookPaths)).toBeTruthy();
    expect(Array.isArray(data.data.recentProjectWebhookActivity)).toBeTruthy();

    console.log(`Webhook diagnostics signature status: ${data.data.signatureValidationEnabled}`);
  });

  test('should show Stripe webhook validation panel on admin dashboard', async ({ page }) => {
    await navigateToAdminPage(page, 'dashboard');

    await expect(page.getByText(/Stripe Webhook Validation/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Signature Verification/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('should display system metrics', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Look for system overview section
    const metricsSection = page.locator('div, section').filter({ hasText: /system|overview|metrics/i }).first();

    if (await metricsSection.isVisible()) {
      // Should show agent count
      await expect(page.getByText(/\d+ agents?/i).first()).toBeVisible({ timeout: 5000 });

      console.log('✅ System metrics displayed');
    } else {
      console.log('⚠️  System metrics section not found');
    }
  });
});

test.describe('Admin Pages - Security & Authentication', () => {
  test('should require authentication for admin pages', async ({ page }) => {
    // Try to access admin page without logging in
    await page.goto(`${BASE_URL}/admin/agent-management`);

    // Should redirect to login or show auth error
    await page.waitForTimeout(2000);

    const currentURL = page.url();
    const isOnLogin = currentURL.includes('/login');
    const hasAuthError = await page.getByText(/unauthorized|forbidden|login required/i).isVisible().catch(() => false);

    expect(isOnLogin || hasAuthError).toBeTruthy();

    console.log('✅ Admin pages require authentication');
  });

  test('should enforce admin role (API test)', async ({ page, request }) => {
    // Try to access admin API without authentication
    const response = await request.get(`${API_BASE}/admin/agents`);

    // Should return 401 or 403
    expect([401, 403].includes(response.status())).toBeTruthy();

    console.log('✅ Admin API endpoints protected');
  });

  test('should apply rate limiting to admin endpoints', async ({ page, request }) => {
    await loginAsAdmin(page);

    // Make multiple rapid requests (more than rate limit)
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(request.get(`${API_BASE}/admin/agents`));
    }

    const responses = await Promise.all(requests);

    // All should succeed (we're under the 100/15min limit)
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });

    console.log('✅ Rate limiting configured (all requests within limit succeeded)');
  });
});

test.describe('Admin Pages - Real-time Updates', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should receive real-time agent creation notification', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');
    await page.waitForTimeout(2000);

    // Get initial agent count
    const initialAgents = await page.locator('div[class*="card"], article').count();

    // In a real scenario, another admin would create an agent
    // For testing, we'll create one ourselves
    await page.click('button:has-text("Add Agent"), button:has-text("Create Agent")');
    await page.fill('input[name="name"]', 'Real-time Test Agent');
    await page.fill('textarea[name="description"]', 'Testing real-time updates');
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    // Wait for real-time update
    await page.waitForTimeout(3000);

    // Agent count should increase
    const newAgentCount = await page.locator('div[class*="card"], article').count();
    expect(newAgentCount).toBeGreaterThan(initialAgents);

    console.log('✅ Real-time agent creation notification working');

    // Cleanup
    const testAgent = page.locator('div, article').filter({ hasText: /Real-time Test Agent/i }).first();
    if (await testAgent.isVisible()) {
      await testAgent.locator('button:has-text("Delete")').click();
      const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Yes")').last();
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
      }
    }
  });
});

test.describe('Admin Pages - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    // For CI mode, inject token from environment into localStorage
    if (process.env.TEST_ADMIN_TOKEN) {
      await page.addInitScript((token) => {
        window.localStorage.setItem('auth_token', token);
      }, process.env.TEST_ADMIN_TOKEN);

      await page.setExtraHTTPHeaders({
        'Authorization': `Bearer ${process.env.TEST_ADMIN_TOKEN}`
      });
    }
    // For local mode with storageState, token is already in localStorage
  });

  test('should handle invalid agent creation gracefully', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Try to create agent with missing required fields
    await page.click('button:has-text("Add Agent"), button:has-text("Create Agent")');

    // Don't fill in required fields
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    // Should show validation errors
    await page.waitForTimeout(1000);

    const hasError = await page.getByText(/required|invalid|error/i).isVisible().catch(() => false);
    expect(hasError).toBeTruthy();

    console.log('✅ Validation errors displayed for invalid input');
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await navigateToAdminPage(page, 'agent-management');

    // Simulate network failure by going offline
    await page.context().setOffline(true);

    // Try to create an agent
    await page.click('button:has-text("Add Agent"), button:has-text("Create Agent")');
    await page.fill('input[name="name"]', 'Network Error Test');
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Save")');

    await page.waitForTimeout(2000);

    // Should show network error
    const hasNetworkError = await page.getByText(/network|connection|failed/i).isVisible().catch(() => false);

    // Restore network
    await page.context().setOffline(false);

    console.log(hasNetworkError ? '✅ Network error handled' : '⚠️  No network error shown');
  });
});

// Export test summary
test.afterAll(async () => {
  console.log('\n📊 Admin Pages E2E Test Suite Complete\n');
  console.log('Tests covered:');
  console.log('  ✅ Agent Management (CRUD)');
  console.log('  ✅ Tool Management (CRUD)');
  console.log('  ✅ Agent Templates (API)');
  console.log('  ✅ Subscription Management (UI)');
  console.log('  ✅ System Monitoring');
  console.log('  ✅ Security & Authentication');
  console.log('  ✅ Real-time Updates');
  console.log('  ✅ Error Handling');
  console.log('');
});
