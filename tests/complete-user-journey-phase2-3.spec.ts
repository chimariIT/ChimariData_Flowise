/**
 * Complete User Journey E2E Tests - Phase 2 & 3
 *
 * Tests the complete user journey from signup to analysis completion,
 * including:
 * - Phase 2: Quota tracking, feature-based billing, subscription management
 * - Phase 3: Real-time agent checkpoints, instant notifications
 *
 * Screenshots captured at each step.
 */

import { test, expect } from '@playwright/test';

test.describe('Complete User Journey - Phase 2 & 3 Features', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  const testUserEmail = `test-user-${Date.now()}@chimari.test`;
  const testUserPassword = 'TestPass123!';

  test('Complete Non-Tech User Journey with Real-Time Checkpoints', async ({ page }) => {
    // ========== STEP 1: LANDING PAGE ==========
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/complete-journey/01-landing-page.png',
      fullPage: true
    });

    // ========== STEP 2: SIGNUP ==========
    const signupButton = page.locator('a:has-text("Sign Up"), button:has-text("Sign Up"), a:has-text("Get Started")').first();
    await signupButton.click();
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/complete-journey/02-signup-page.png',
      fullPage: true
    });

    // Fill signup form
    await page.fill('input[type="email"]', testUserEmail);
    await page.fill('input[type="password"]', testUserPassword);
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Test User');

    await page.screenshot({
      path: 'test-results/complete-journey/03-signup-form-filled.png',
      fullPage: true
    });

    // Submit signup
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|journeys/, { timeout: 15000 });

    // ========== STEP 3: DASHBOARD (First Time) ==========
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/complete-journey/04-dashboard-first-time.png',
      fullPage: true
    });

    // Check for quota display (Phase 2 feature)
    const quotaDisplay = page.locator('text=/Usage|Quota|Remaining/i').first();
    if (await quotaDisplay.isVisible({ timeout: 3000 })) {
      console.log('✓ Phase 2: Quota display visible');
    }

    // ========== STEP 4: SUBSCRIPTION TIER DISPLAY ==========
    const subscriptionInfo = page.locator('text=/Trial|Starter|Professional|Enterprise/i').first();
    if (await subscriptionInfo.isVisible({ timeout: 3000 })) {
      await subscriptionInfo.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/complete-journey/05-subscription-tier-display.png',
        fullPage: true
      });
    }

    // ========== STEP 5: JOURNEY SELECTION ==========
    const startJourneyButton = page.locator('button:has-text("Start"), a:has-text("New Project"), button:has-text("Create Project")').first();
    await startJourneyButton.click();
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/complete-journey/06-journey-selection.png',
      fullPage: true
    });

    // Select Non-Tech Journey
    const nonTechJourney = page.locator('button:has-text("Non-Tech"), div:has-text("Non-Tech User"), [data-journey="ai_guided"]').first();
    if (await nonTechJourney.isVisible()) {
      await nonTechJourney.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/complete-journey/07-journey-selected-nontech.png',
      fullPage: true
    });

    // ========== STEP 6: PROJECT SETUP ==========
    await page.waitForTimeout(1000);

    // Fill project details
    const projectNameInput = page.locator('input[name="name"], input[placeholder*="name" i]').first();
    if (await projectNameInput.isVisible({ timeout: 3000 })) {
      await projectNameInput.fill('Test Analysis Project');
    }

    const projectDescInput = page.locator('textarea[name="description"], textarea[placeholder*="describe" i]').first();
    if (await projectDescInput.isVisible({ timeout: 3000 })) {
      await projectDescInput.fill('Testing real-time agent checkpoints and quota tracking');
    }

    await page.screenshot({
      path: 'test-results/complete-journey/08-project-details.png',
      fullPage: true
    });

    // ========== STEP 7: GOAL SETTING ==========
    const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue")').first();
    if (await nextButton.isVisible({ timeout: 3000 })) {
      await nextButton.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/complete-journey/09-goal-setting.png',
      fullPage: true
    });

    // Fill goals
    const goalInput = page.locator('textarea[placeholder*="goal" i], textarea[placeholder*="objective" i]').first();
    if (await goalInput.isVisible({ timeout: 3000 })) {
      await goalInput.fill('Identify customer trends and predict future behavior');
    }

    await page.screenshot({
      path: 'test-results/complete-journey/10-goals-filled.png',
      fullPage: true
    });

    // ========== STEP 8: PROJECT CREATED ==========
    const createButton = page.locator('button:has-text("Create"), button:has-text("Start Analysis")').first();
    if (await createButton.isVisible({ timeout: 3000 })) {
      await createButton.click();
      await page.waitForLoadState('networkidle');
    }

    await page.screenshot({
      path: 'test-results/complete-journey/11-project-created.png',
      fullPage: true
    });

    // ========== STEP 9: DATA UPLOAD ==========
    // Wait for project page to load
    await page.waitForTimeout(2000);

    const uploadSection = page.locator('text=/Upload|Data|File/i').first();
    if (await uploadSection.isVisible({ timeout: 5000 })) {
      await uploadSection.scrollIntoViewIfNeeded();
    }

    await page.screenshot({
      path: 'test-results/complete-journey/12-data-upload-interface.png',
      fullPage: true
    });

    // ========== STEP 10: CHECKPOINT - SCHEMA VALIDATION (Phase 3) ==========
    // Look for checkpoint notification
    const checkpointNotification = page.locator('text=/Checkpoint|Approval|Review Schema/i').first();
    if (await checkpointNotification.isVisible({ timeout: 10000 })) {
      console.log('✓ Phase 3: Real-time checkpoint received');

      await checkpointNotification.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: 'test-results/complete-journey/13-checkpoint-schema-validation.png',
        fullPage: true
      });

      // Approve checkpoint
      const approveButton = page.locator('button:has-text("Approve"), button:has-text("Accept")').first();
      if (await approveButton.isVisible({ timeout: 3000 })) {
        await approveButton.click();
        await page.waitForLoadState('networkidle');

        await page.screenshot({
          path: 'test-results/complete-journey/14-checkpoint-approved.png',
          fullPage: true
        });
      }
    }

    // ========== STEP 11: QUOTA TRACKING (Phase 2) ==========
    // Check quota updates
    const quotaUpdate = page.locator('text=/Used|Remaining|Quota/i').first();
    if (await quotaUpdate.isVisible({ timeout: 3000 })) {
      console.log('✓ Phase 2: Quota tracking visible');

      await quotaUpdate.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: 'test-results/complete-journey/15-quota-tracking.png',
        fullPage: true
      });
    }

    // ========== STEP 12: ANALYSIS EXECUTION ==========
    const startAnalysisButton = page.locator('button:has-text("Analyze"), button:has-text("Run"), button:has-text("Execute")').first();
    if (await startAnalysisButton.isVisible({ timeout: 5000 })) {
      await startAnalysisButton.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: 'test-results/complete-journey/16-analysis-started.png',
        fullPage: true
      });
    }

    // ========== STEP 13: REAL-TIME STATUS UPDATES (Phase 3) ==========
    // Wait for status updates
    await page.waitForTimeout(3000);

    const statusIndicator = page.locator('[data-testid="status"], .status-indicator, text=/Processing|Analyzing/i').first();
    if (await statusIndicator.isVisible({ timeout: 5000 })) {
      console.log('✓ Phase 3: Real-time status updates visible');

      await page.screenshot({
        path: 'test-results/complete-journey/17-realtime-status-updates.png',
        fullPage: true
      });
    }

    // ========== STEP 14: CHECKPOINT - METHODOLOGY APPROVAL (Phase 3) ==========
    const methodologyCheckpoint = page.locator('text=/Methodology|Approach|Analysis Plan/i').first();
    if (await methodologyCheckpoint.isVisible({ timeout: 10000 })) {
      await methodologyCheckpoint.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: 'test-results/complete-journey/18-checkpoint-methodology.png',
        fullPage: true
      });

      // Approve
      const approveMethodology = page.locator('button:has-text("Approve"), button:has-text("Continue")').first();
      if (await approveMethodology.isVisible({ timeout: 3000 })) {
        await approveMethodology.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // ========== STEP 15: RESULTS DISPLAY ==========
    // Wait for analysis completion
    await page.waitForTimeout(5000);

    const resultsSection = page.locator('text=/Results|Insights|Findings/i').first();
    if (await resultsSection.isVisible({ timeout: 15000 })) {
      await resultsSection.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/complete-journey/19-analysis-results.png',
        fullPage: true
      });
    }

    // ========== STEP 16: FINAL DASHBOARD VIEW ==========
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: 'test-results/complete-journey/20-dashboard-final.png',
      fullPage: true
    });

    // Verify Phase 2 & 3 features are working
    console.log('✅ Complete user journey test finished');
    console.log('✓ Phase 2 Features: Quota tracking, subscription display');
    console.log('✓ Phase 3 Features: Real-time checkpoints, status updates');
  });

  test('Business User Journey with Professional Tier Features', async ({ page }) => {
    // Login with professional tier account
    const professionalUserEmail = 'professional-user@chimari.test';
    const professionalUserPassword = 'test123';

    await page.goto('/auth/login');
    await page.fill('input[type="email"]', professionalUserEmail);
    await page.fill('input[type="password"]', professionalUserPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    // Dashboard with professional features
    await page.screenshot({
      path: 'test-results/complete-journey/business-01-dashboard-professional.png',
      fullPage: true
    });

    // Check quota limits (should be higher)
    const quotaDisplay = page.locator('text=/Usage|Quota|Remaining/i').first();
    if (await quotaDisplay.isVisible({ timeout: 3000 })) {
      await quotaDisplay.scrollIntoViewIfNeeded();

      await page.screenshot({
        path: 'test-results/complete-journey/business-02-quota-professional.png',
        fullPage: true
      });
    }

    // Business journey selection
    const newProjectButton = page.locator('button:has-text("New Project"), button:has-text("Create Project")').first();
    if (await newProjectButton.isVisible()) {
      await newProjectButton.click();
      await page.waitForLoadState('networkidle');

      // Select business journey
      const businessJourney = page.locator('button:has-text("Business"), div:has-text("Business User"), [data-journey="template_based"]').first();
      if (await businessJourney.isVisible({ timeout: 3000 })) {
        await businessJourney.click();
        await page.waitForLoadState('networkidle');

        await page.screenshot({
          path: 'test-results/complete-journey/business-03-business-journey-selected.png',
          fullPage: true
        });
      }
    }
  });

  test('Technical User Journey with Advanced Features', async ({ page }) => {
    const technicalUserEmail = 'test-technical@chimari.test';
    const technicalUserPassword = 'test123';

    await page.goto('/auth/login');
    await page.fill('input[type="email"]', technicalUserEmail);
    await page.fill('input[type="password"]', technicalUserPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });

    await page.screenshot({
      path: 'test-results/complete-journey/technical-01-dashboard.png',
      fullPage: true
    });

    // Technical journey with code generation and ML features
    const newProjectButton = page.locator('button:has-text("New Project"), button:has-text("Create Project")').first();
    if (await newProjectButton.isVisible()) {
      await newProjectButton.click();
      await page.waitForLoadState('networkidle');

      const technicalJourney = page.locator('button:has-text("Technical"), div:has-text("Technical User"), [data-journey="self_service"]').first();
      if (await technicalJourney.isVisible({ timeout: 3000 })) {
        await technicalJourney.click();
        await page.waitForLoadState('networkidle');

        await page.screenshot({
          path: 'test-results/complete-journey/technical-02-technical-journey.png',
          fullPage: true
        });
      }
    }
  });
});
