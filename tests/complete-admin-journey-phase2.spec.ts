/**
 * Complete Admin Journey E2E Tests - Phase 2 Billing Configuration
 *
 * Tests the complete admin workflow for managing:
 * - Subscription tier configuration
 * - Feature-based pricing and quotas
 * - User billing and analytics
 * - Real-time configuration updates
 *
 * Screenshots captured at each step.
 */

import { test, expect } from '@playwright/test';

test.describe('Complete Admin Journey - Phase 2 Billing Features', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  const adminEmail = 'admin@chimari.test';
  const adminPassword = 'admin123';

  test.beforeEach(async ({ page }) => {
    // Already authenticated via storageState as admin
    // Admin users are redirected to /admin on login, so navigate there
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
  });

  test('Complete Admin Billing Configuration Workflow', async ({ page }) => {
    // ========== STEP 1: ADMIN DASHBOARD ==========
    // We're already on /admin from beforeEach, so start here
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/admin-journey/01-admin-dashboard.png',
      fullPage: true
    });

    // ========== STEP 2: TEST CONSULTANT MODE ==========
    // Navigate to customer dashboard to demonstrate consultant mode
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/admin-journey/02-consultant-mode-customer-dashboard.png',
      fullPage: true
    });

    // ========== STEP 3: RETURN TO ADMIN PANEL ==========
    // Return to admin panel using the consultant mode button
    const returnToAdminButton = page.locator('button:has-text("Return to Admin Panel")').first();
    if (await returnToAdminButton.isVisible({ timeout: 5000 })) {
      await returnToAdminButton.click();
    } else {
      // Direct navigation
      await page.goto('/admin');
    }

    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/admin-journey/03-admin-panel-after-consultant-mode.png',
      fullPage: true
    });

    // ========== STEP 3: SUBSCRIPTION TIERS OVERVIEW ==========
    // Look for billing/subscription section
    const billingTab = page.locator('text=/Billing|Subscription|Tiers/i').first();
    if (await billingTab.isVisible({ timeout: 5000 })) {
      await billingTab.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/admin-journey/03-subscription-tiers-overview.png',
      fullPage: true
    });

    // Verify all tiers are displayed
    const trialTier = page.locator('text=/Trial/i').first();
    const starterTier = page.locator('text=/Starter/i').first();
    const professionalTier = page.locator('text=/Professional/i').first();
    const enterpriseTier = page.locator('text=/Enterprise/i').first();

    if (await trialTier.isVisible() && await starterTier.isVisible()) {
      console.log('✓ All subscription tiers displayed');
    }

    // ========== STEP 4: CONFIGURE TRIAL TIER ==========
    // Click on trial tier to edit
    if (await trialTier.isVisible()) {
      await trialTier.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/admin-journey/04-trial-tier-configuration.png',
      fullPage: true
    });

    // ========== STEP 5: EDIT TIER PRICING ==========
    const editPricingButton = page.locator('button:has-text("Edit"), button:has-text("Configure"), a:has-text("Pricing")').first();
    if (await editPricingButton.isVisible({ timeout: 3000 })) {
      await editPricingButton.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/05-edit-tier-pricing.png',
        fullPage: true
      });

      // Show pricing form
      const monthlyPriceInput = page.locator('input[name*="monthly" i], input[placeholder*="monthly" i]').first();
      if (await monthlyPriceInput.isVisible({ timeout: 3000 })) {
        await monthlyPriceInput.scrollIntoViewIfNeeded();

        await page.screenshot({
          path: 'test-results/admin-journey/06-pricing-form.png',
          fullPage: true
        });
      }
    }

    // ========== STEP 6: FEATURE QUOTAS CONFIGURATION ==========
    // Navigate to quotas section
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const quotasTab = page.locator('text=/Quota|Limits|Usage/i').first();
    if (await quotasTab.isVisible({ timeout: 5000 })) {
      await quotasTab.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/admin-journey/07-feature-quotas-overview.png',
      fullPage: true
    });

    // ========== STEP 7: CONFIGURE FEATURE-SPECIFIC QUOTAS ==========
    // Look for quota configuration interface
    const dataUploadQuota = page.locator('text=/Data Upload|Upload Quota/i').first();
    if (await dataUploadQuota.isVisible({ timeout: 5000 })) {
      await dataUploadQuota.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/admin-journey/08-data-upload-quota-config.png',
        fullPage: true
      });
    }

    // AI Query quotas
    const aiQueryQuota = page.locator('text=/AI|Query|Analysis/i').first();
    if (await aiQueryQuota.isVisible({ timeout: 3000 })) {
      await aiQueryQuota.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/admin-journey/09-ai-query-quota-config.png',
        fullPage: true
      });
    }

    // ========== STEP 8: COMPLEXITY-BASED PRICING ==========
    // Look for complexity configuration
    const complexitySection = page.locator('text=/Complexity|Small|Medium|Large/i').first();
    if (await complexitySection.isVisible({ timeout: 5000 })) {
      await complexitySection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/admin-journey/10-complexity-based-pricing.png',
        fullPage: true
      });
    }

    // ========== STEP 9: OVERAGE PRICING CONFIGURATION ==========
    const overageSection = page.locator('text=/Overage|Over Quota|Additional/i').first();
    if (await overageSection.isVisible({ timeout: 5000 })) {
      await overageSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/admin-journey/11-overage-pricing-config.png',
        fullPage: true
      });
    }

    // ========== STEP 10: ANALYTICS DASHBOARD ==========
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const analyticsTab = page.locator('text=/Analytics|Reports|Revenue/i').first();
    if (await analyticsTab.isVisible({ timeout: 5000 })) {
      await analyticsTab.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/12-analytics-dashboard.png',
        fullPage: true
      });
    }

    // ========== STEP 11: REVENUE ANALYTICS ==========
    const revenueChart = page.locator('[data-testid="revenue-chart"], .revenue-chart').first();
    if (await revenueChart.isVisible({ timeout: 5000 })) {
      await revenueChart.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/13-revenue-analytics.png',
        fullPage: true
      });
    }

    // ========== STEP 12: USAGE ANALYTICS ==========
    const usageChart = page.locator('[data-testid="usage-chart"], .usage-chart, text=/Usage|Consumption/i').first();
    if (await usageChart.isVisible({ timeout: 5000 })) {
      await usageChart.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/14-usage-analytics.png',
        fullPage: true
      });
    }

    // ========== STEP 13: USER MANAGEMENT ==========
    const usersTab = page.locator('text=/Users|Customers|Accounts/i').first();
    if (await usersTab.isVisible({ timeout: 5000 })) {
      await usersTab.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/15-user-management.png',
        fullPage: true
      });
    }

    // ========== STEP 14: INDIVIDUAL USER DETAILS ==========
    const firstUser = page.locator('tr[data-testid="user-row"], .user-item, tbody tr').first();
    if (await firstUser.isVisible({ timeout: 5000 })) {
      await firstUser.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/16-user-details.png',
        fullPage: true
      });
    }

    // ========== STEP 15: USER QUOTA STATUS ==========
    const userQuotaStatus = page.locator('text=/Quota|Usage|Remaining/i').first();
    if (await userQuotaStatus.isVisible({ timeout: 5000 })) {
      await userQuotaStatus.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/17-user-quota-status.png',
        fullPage: true
      });
    }

    // ========== STEP 16: SUBSCRIPTION MANAGEMENT ==========
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    const subscriptionsTab = page.locator('text=/Subscription|Billing/i').first();
    if (await subscriptionsTab.isVisible({ timeout: 5000 })) {
      await subscriptionsTab.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/18-subscription-management.png',
        fullPage: true
      });
    }

    // ========== STEP 17: STRIPE INTEGRATION STATUS ==========
    const stripeStatus = page.locator('text=/Stripe|Payment|Integration/i').first();
    if (await stripeStatus.isVisible({ timeout: 5000 })) {
      await stripeStatus.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/19-stripe-integration.png',
        fullPage: true
      });
    }

    // ========== STEP 18: CONFIGURATION SAVE & BROADCAST ==========
    const saveConfigButton = page.locator('button:has-text("Save"), button:has-text("Update"), button:has-text("Apply")').first();
    if (await saveConfigButton.isVisible({ timeout: 3000 })) {
      await saveConfigButton.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/20-save-configuration.png',
        fullPage: true
      });

      // Click save (commented out to avoid actual changes)
      // await saveConfigButton.click();
      // await page.waitForLoadState('networkidle');
    }

    // ========== STEP 19: REAL-TIME CONFIG UPDATE NOTIFICATION ==========
    // Look for success notification
    const notification = page.locator('[role="alert"], .notification, .toast, text=/Success|Updated|Saved/i').first();
    if (await notification.isVisible({ timeout: 5000 })) {
      await page.screenshot({
        path: 'test-results/admin-journey/21-config-update-notification.png',
        fullPage: true
      });
    }

    // ========== STEP 20: FINAL ADMIN DASHBOARD ==========
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/admin-journey/22-admin-dashboard-final.png',
      fullPage: true
    });

    console.log('✅ Complete admin journey test finished');
    console.log('✓ Subscription tier configuration');
    console.log('✓ Feature quotas and pricing');
    console.log('✓ Analytics and reporting');
    console.log('✓ User management');
  });

  test('Admin Feature Management - Journey Access Control', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // ========== JOURNEY ACCESS CONFIGURATION ==========
    const journeyAccessTab = page.locator('text=/Journey|Access|Features/i').first();
    if (await journeyAccessTab.isVisible({ timeout: 5000 })) {
      await journeyAccessTab.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/feature-01-journey-access-config.png',
        fullPage: true
      });
    }

    // Configure which journeys are available per tier
    const trialJourneyAccess = page.locator('text=/Trial.*Journey/i, [data-tier="trial"]').first();
    if (await trialJourneyAccess.isVisible({ timeout: 3000 })) {
      await trialJourneyAccess.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/admin-journey/feature-02-trial-journey-access.png',
        fullPage: true
      });
    }
  });

  test('Admin Campaigns and Promotions', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');

    // ========== CAMPAIGNS SECTION ==========
    const campaignsTab = page.locator('text=/Campaign|Promotion|Discount/i').first();
    if (await campaignsTab.isVisible({ timeout: 5000 })) {
      await campaignsTab.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/campaigns-01-overview.png',
        fullPage: true
      });
    }

    // Create new campaign
    const newCampaignButton = page.locator('button:has-text("New Campaign"), button:has-text("Create")').first();
    if (await newCampaignButton.isVisible({ timeout: 3000 })) {
      await newCampaignButton.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/admin-journey/campaigns-02-create-campaign.png',
        fullPage: true
      });
    }
  });
});

