/**
 * Phase 2 & 3 Feature Screenshots
 *
 * Captures screenshots demonstrating:
 * - Phase 2: Admin-configurable billing, quotas, subscription management
 * - Phase 3: Real-time agent checkpoints and communication
 */

import { test, expect } from '@playwright/test';

test.describe('Phase 2 & 3 Feature Screenshots', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  // Admin credentials (adjust as needed)
  const adminEmail = 'admin@chimari.test';
  const adminPassword = 'admin123';

  // Test user credentials
  const testUserEmail = 'test-user@chimari.test';
  const testUserPassword = 'test123';

  test.beforeEach(async ({ page }) => {
    // Navigate to home page
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  // ============================================================
  // PHASE 2: ADMIN BILLING CONFIGURATION
  // ============================================================

  test('Phase 2.1 - Admin Billing Dashboard', async ({ page }) => {
    // Already authenticated via storageState as admin
    // Admin users are redirected to /admin on login, so navigate there
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-01-admin-dashboard.png',
      fullPage: true
    });
  });

  test('Phase 2.2 - Admin Billing Configuration - Tiers', async ({ page }) => {
    // Already authenticated via storageState
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Click on billing/subscription tiers tab (adjust selector as needed)
    const billingTab = page.locator('text=/Billing|Subscription|Tiers/i').first();
    if (await billingTab.isVisible()) {
      await billingTab.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-02-admin-billing-tiers.png',
      fullPage: true
    });
  });

  test('Phase 2.3 - Admin Billing Configuration - Pricing', async ({ page }) => {
    // Already authenticated via storageState
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Look for pricing configuration section
    const pricingSection = page.locator('text=/Pricing|Features|Quotas/i').first();
    if (await pricingSection.isVisible()) {
      await pricingSection.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-03-admin-pricing-config.png',
      fullPage: true
    });
  });

  test('Phase 2.4 - Admin Feature Quotas Configuration', async ({ page }) => {
    // Already authenticated via storageState
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Look for quota management
    const quotaSection = page.locator('text=/Quota|Limits|Usage/i').first();
    if (await quotaSection.isVisible()) {
      await quotaSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-04-admin-quota-config.png',
      fullPage: true
    });
  });

  test('Phase 2.5 - Admin Analytics - Revenue', async ({ page }) => {
    // Already authenticated via storageState
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // Look for analytics section
    const analyticsSection = page.locator('text=/Analytics|Revenue|Usage/i').first();
    if (await analyticsSection.isVisible()) {
      await analyticsSection.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-05-admin-analytics-revenue.png',
      fullPage: true
    });
  });

  // ============================================================
  // PHASE 2: USER-FACING SUBSCRIPTION & QUOTA
  // ============================================================

  test('Phase 2.6 - User Dashboard with Quota Display', async ({ page }) => {
    // Already authenticated as admin (admin can see user dashboard too)
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-06-user-dashboard-quotas.png',
      fullPage: true
    });
  });

  test('Phase 2.7 - User Subscription Details', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to subscription/account settings
    const settingsLink = page.locator('text=/Settings|Account|Subscription/i').first();
    if (await settingsLink.isVisible()) {
      await settingsLink.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Try direct navigation
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-07-user-subscription-details.png',
      fullPage: true
    });
  });

  test('Phase 2.8 - User Quota Status Display', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for quota status widget/section
    const quotaWidget = page.locator('text=/Usage|Quota|Remaining/i').first();
    if (await quotaWidget.isVisible()) {
      await quotaWidget.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase2-08-user-quota-status.png',
      fullPage: true
    });
  });

  // ============================================================
  // PHASE 3: REAL-TIME AGENT CHECKPOINTS
  // ============================================================

  test('Phase 3.1 - Project Creation with Real-Time Setup', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Create new project
    const newProjectButton = page.locator('button:has-text("New Project"), button:has-text("Create Project")').first();
    if (await newProjectButton.isVisible()) {
      await newProjectButton.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase3-01-project-creation-start.png',
      fullPage: true
    });
  });

  test('Phase 3.2 - Agent Checkpoint - Schema Validation', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to an existing project or create one
    // This assumes there's a test project already created
    await page.goto('/dashboard');

    // Click on first project (if exists)
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for checkpoint UI elements
    const checkpointSection = page.locator('text=/Checkpoint|Approval|Review/i').first();
    if (await checkpointSection.isVisible()) {
      await checkpointSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase3-02-checkpoint-schema-validation.png',
      fullPage: true
    });
  });

  test('Phase 3.3 - Agent Checkpoint - User Approval Interface', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to project with active checkpoint
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for approval buttons/interface
    const approvalButtons = page.locator('button:has-text("Approve"), button:has-text("Reject")');
    if (await approvalButtons.first().isVisible()) {
      await approvalButtons.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase3-03-checkpoint-approval-interface.png',
      fullPage: true
    });
  });

  test('Phase 3.4 - Real-Time Status Updates', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to project
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for real-time status indicators
    const statusIndicator = page.locator('[data-testid="status"], .status').first();
    if (await statusIndicator.isVisible()) {
      await statusIndicator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase3-04-realtime-status-updates.png',
      fullPage: true
    });
  });

  test('Phase 3.5 - Agent Communication Log', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to project
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for activity/communication log
    const activityLog = page.locator('text=/Activity|History|Log|Timeline/i').first();
    if (await activityLog.isVisible()) {
      await activityLog.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/phase2-3/phase3-05-agent-communication-log.png',
      fullPage: true
    });
  });

  // ============================================================
  // COMBINED FEATURES: QUOTAS + CHECKPOINTS
  // ============================================================

  test('Phase 2+3 - Quota Enforcement During Analysis', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate to project and start analysis
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');
    }

    // Look for quota warning/enforcement UI
    const quotaWarning = page.locator('text=/Quota|Limit|Upgrade/i').first();
    if (await quotaWarning.isVisible()) {
      await quotaWarning.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }

    await page.screenshot({
      path: 'test-results/phase2-3/combined-01-quota-enforcement.png',
      fullPage: true
    });
  });

  test('Phase 2+3 - Complete User Journey with Real-Time Features', async ({ page }) => {
    // Already authenticated as admin
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dashboard
    await page.screenshot({
      path: 'test-results/phase2-3/journey-01-dashboard.png',
      fullPage: true
    });

    // Create project
    const newProjectButton = page.locator('button:has-text("New Project"), button:has-text("Create Project")').first();
    if (await newProjectButton.isVisible()) {
      await newProjectButton.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/phase2-3/journey-02-project-setup.png',
        fullPage: true
      });
    }

    // Navigate back to dashboard
    await page.goto('/dashboard');

    // Open first project
    const firstProject = page.locator('[data-testid="project-card"], .project-card').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/phase2-3/journey-03-project-view.png',
        fullPage: true
      });
    }
  });

  // ============================================================
  // SUMMARY SCREENSHOT
  // ============================================================

  test('Summary - Phase 2 & 3 Features Overview', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Create a summary page showing all features
    await page.screenshot({
      path: 'test-results/phase2-3/phase2-3-summary.png',
      fullPage: true
    });
  });
});
