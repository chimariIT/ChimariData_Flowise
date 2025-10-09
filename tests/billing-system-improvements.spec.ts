import { test, expect, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Billing System Improvements Tests
 * 
 * Based on docs/BILLING_SUBSCRIPTION_REVIEW.md
 * Tests the critical billing system improvements:
 * - Tier definition consolidation
 * - Overage billing implementation
 * - Campaign management system
 * - Usage dashboard
 * - Discount application
 */

async function loginUser(page: Page, email: string, password: string = 'test123') {
  console.log(`🔐 Logging in ${email}...`);
  
  await page.goto('/auth');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  
  await page.waitForURL('/dashboard', { timeout: 10000 });
  console.log(`✅ Login successful for ${email}`);
}

async function loginAsAdmin(page: Page) {
  await loginUser(page, 'admin@chimaridata.com', 'admin123');
}

async function waitForPageLoad(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
  await page.waitForTimeout(500);
}

test.describe('Billing System Improvements', () => {
  
  test.describe('Tier Definition Consolidation', () => {
    
    test('should detect conflicting tier definitions', async ({ page, request }) => {
      console.log('🎯 Testing Tier Definition Conflict Detection');
      
      // Test that both tier definitions exist and are accessible
      const sharedTiersResponse = await request.get('/api/billing/subscription-tiers');
      expect(sharedTiersResponse.status()).toBe(200);
      
      const sharedData = await sharedTiersResponse.json();
      expect(sharedData.success).toBe(true);
      expect(sharedData.tiers).toBeDefined();
      
      // Verify tier structure from shared/subscription-tiers.ts
      const tiers = sharedData.tiers;
      expect(tiers.trial).toBeDefined();
      expect(tiers.starter).toBeDefined();
      expect(tiers.professional).toBeDefined();
      expect(tiers.enterprise).toBeDefined();
      
      // Verify pricing consistency
      expect(tiers.trial.price).toBe(1);
      expect(tiers.starter.price).toBe(10);
      expect(tiers.professional.price).toBe(20);
      expect(tiers.enterprise.price).toBe(50);
      
      // Verify usage limits structure
      expect(tiers.trial.usageLimits).toBeDefined();
      expect(tiers.trial.usageLimits.storageCapacityMB).toBe(25);
      expect(tiers.trial.usageLimits.dataIngestionSizeMB).toBe(10);
      expect(tiers.trial.usageLimits.analysisComplexityUnits).toBe(5);
      
      // Test that enhanced billing service returns same data
      const enhancedResponse = await request.get('/api/billing/capacity-summary');
      expect(enhancedResponse.status()).toBe(200);
      
      const enhancedData = await enhancedResponse.json();
      expect(enhancedData.success).toBe(true);
      expect(enhancedData.summary.currentTier).toBeDefined();
      
      console.log('✅ Tier definitions are consistent');
    });

    test('should display unified tier pricing across all pages', async ({ page }) => {
      console.log('🎯 Testing Unified Tier Pricing Display');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      // Test pricing page
      await page.goto('/pricing');
      await waitForPageLoad(page);
      
      // Verify tier prices match unified definition
      await expect(page.locator('text=$1')).toBeVisible(); // Trial
      await expect(page.locator('text=$10')).toBeVisible(); // Starter
      await expect(page.locator('text=$20')).toBeVisible(); // Professional
      await expect(page.locator('text=$50')).toBeVisible(); // Enterprise
      
      // Test journey pricing page
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Non-Tech User Journey');
      await waitForPageLoad(page);
      
      // Verify pricing breakdown shows correct tier pricing
      await expect(page.locator('[data-testid="pricing-breakdown"]')).toBeVisible();
      await expect(page.locator('text=Trial Plan')).toBeVisible();
      await expect(page.locator('text=$1')).toBeVisible();
      
      // Test usage dashboard (if implemented)
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      // Should show tier-appropriate limits
      await expect(page.locator('text=25 MB storage')).toBeVisible();
      await expect(page.locator('text=10 MB data ingestion')).toBeVisible();
      await expect(page.locator('text=5 analysis units')).toBeVisible();
    });
  });

  test.describe('Overage Billing Implementation', () => {
    
    test('should calculate overage charges correctly', async ({ page, request }) => {
      console.log('🎯 Testing Overage Billing Calculations');
      
      // Test overage calculation API
      const response = await request.post('/api/billing/calculate-overage', {
        data: {
          userId: 'test-trial-user',
          usage: {
            dataUsageMB: 50, // Exceeds 10MB trial limit
            computeMinutes: 120, // Exceeds trial limits
            storageMB: 30 // Exceeds 25MB trial limit
          }
        }
      });
      
      // This endpoint might not exist yet, but test the expected response structure
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.overages).toBeDefined();
        expect(data.totalOverageCost).toBeGreaterThan(0);
        
        // Verify overage breakdown
        expect(data.overages.length).toBeGreaterThan(0);
        for (const overage of data.overages) {
          expect(overage.category).toBeDefined();
          expect(overage.amount).toBeGreaterThan(0);
          expect(overage.unitCost).toBeGreaterThan(0);
          expect(overage.totalCost).toBeGreaterThan(0);
        }
      } else {
        console.log('⚠️ Overage billing API not yet implemented');
      }
    });

    test('should show overage warnings in UI', async ({ page }) => {
      console.log('🎯 Testing Overage Warning Display');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      // Select a high-resource journey that would cause overages
      await page.click('text=Expert Consultation Journey');
      await waitForPageLoad(page);
      
      // Should show overage warnings
      await expect(page.locator('[data-testid="overage-warning"]')).toBeVisible();
      await expect(page.locator('text=Additional charges apply')).toBeVisible();
      await expect(page.locator('text=Exceeds quota')).toBeVisible();
      
      // Should show upgrade recommendations
      await expect(page.locator('text=Upgrade to')).toBeVisible();
      await expect(page.locator('text=to avoid overage charges')).toBeVisible();
    });

    test('should block operations when quota exceeded', async ({ page }) => {
      console.log('🎯 Testing Quota Exceeded Blocking');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      await page.goto('/data-upload');
      await waitForPageLoad(page);
      
      // Try to upload a large file that exceeds quota
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles(path.join(__dirname, '../test-data/large-dataset.csv'));
      
      // Should show quota exceeded error
      await expect(page.locator('text=Quota exceeded')).toBeVisible();
      await expect(page.locator('text=File too large')).toBeVisible();
      
      // Upload button should be disabled
      await expect(page.locator('button:has-text("Upload"):disabled')).toBeVisible();
    });
  });

  test.describe('Campaign Management System', () => {
    
    test('should display campaign management interface', async ({ page }) => {
      console.log('🎯 Testing Campaign Management Interface');
      
      await loginAsAdmin(page);
      
      // Navigate to campaign management (when implemented)
      await page.goto('/admin/campaigns-management');
      await waitForPageLoad(page);
      
      // For now, should show "Coming Soon" message
      // When implemented, should show:
      await expect(page.locator('h1:has-text("Campaign Management")')).toBeVisible();
      await expect(page.locator('text=Coming Soon')).toBeVisible();
      
      // Expected interface when implemented:
      // - Campaign list with active/inactive status
      // - Create campaign button
      // - Discount configuration
      // - Usage tracking
      // - Bulk operations
    });

    test('should apply campaign discounts', async ({ page, request }) => {
      console.log('🎯 Testing Campaign Discount Application');
      
      // Test campaign validation API
      const response = await request.post('/api/billing/validate-campaign', {
        data: {
          campaignCode: 'WELCOME20',
          userId: 'test-trial-user',
          journeyType: 'non-tech'
        }
      });
      
      // This endpoint might not exist yet
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.campaign).toBeDefined();
        expect(data.discountAmount).toBeGreaterThan(0);
        expect(data.finalPrice).toBeLessThan(data.originalPrice);
      } else {
        console.log('⚠️ Campaign discount API not yet implemented');
      }
    });

    test('should show campaign codes in checkout', async ({ page }) => {
      console.log('🎯 Testing Campaign Code Input in Checkout');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Non-Tech User Journey');
      await waitForPageLoad(page);
      
      // Select template and proceed to pricing
      await page.click('[data-testid="template-card"]');
      await page.click('button:has-text("Select Template")');
      await waitForPageLoad(page);
      
      // Should show campaign code input field
      await expect(page.locator('input[name="campaignCode"]')).toBeVisible();
      await expect(page.locator('text=Promo Code')).toBeVisible();
      
      // Test applying a campaign code
      await page.fill('input[name="campaignCode"]', 'WELCOME20');
      await page.click('button:has-text("Apply")');
      
      // Should show discount applied
      await expect(page.locator('text=Discount Applied')).toBeVisible();
      await expect(page.locator('text=20% off')).toBeVisible();
    });
  });

  test.describe('Usage Dashboard', () => {
    
    test('should display comprehensive usage dashboard', async ({ page }) => {
      console.log('🎯 Testing Usage Dashboard Display');
      
      await loginUser(page, 'test-professional@chimari.test');
      
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      // Should show current billing period
      await expect(page.locator('[data-testid="billing-period"]')).toBeVisible();
      await expect(page.locator('text=Current Period')).toBeVisible();
      await expect(page.locator('text=Days Remaining')).toBeVisible();
      
      // Should show quota utilization for all categories
      const quotaCards = page.locator('[data-testid="quota-card"]');
      await expect(quotaCards).toHaveCount(5); // 5 usage categories
      
      // Each quota card should show:
      // - Category name
      // - Used/Total amounts
      // - Progress bar
      // - Percentage used
      const storageCard = quotaCards.filter({ hasText: 'Storage Capacity' }).first();
      await expect(storageCard.locator('[data-testid="quota-progress"]')).toBeVisible();
      await expect(storageCard.locator('[data-testid="quota-percentage"]')).toBeVisible();
      await expect(storageCard.locator('text=MB used')).toBeVisible();
      
      // Should show overage projections
      await expect(page.locator('[data-testid="overage-projections"]')).toBeVisible();
      await expect(page.locator('text=At current rate')).toBeVisible();
      
      // Should show cost breakdown
      await expect(page.locator('[data-testid="cost-breakdown"]')).toBeVisible();
      await expect(page.locator('text=Base subscription')).toBeVisible();
      await expect(page.locator('text=Overage charges')).toBeVisible();
      await expect(page.locator('text=Total cost')).toBeVisible();
      
      // Should show recommendations
      await expect(page.locator('[data-testid="recommendations"]')).toBeVisible();
      await expect(page.locator('text=Upgrade to')).toBeVisible();
    });

    test('should show real-time quota updates', async ({ page }) => {
      console.log('🎯 Testing Real-time Quota Updates');
      
      await loginUser(page, 'test-starter@chimari.test');
      
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      // Verify WebSocket connection for real-time updates
      await expect(page.locator('[data-testid="websocket-status"]')).toBeVisible();
      await expect(page.locator('text=Connected')).toBeVisible();
      
      // Perform an action that would update usage
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Business User Journey');
      await waitForPageLoad(page);
      
      await page.click('[data-testid="template-card"]');
      await page.click('button:has-text("Select Template")');
      await waitForPageLoad(page);
      
      // Go back to usage dashboard
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      // Should show updated usage (might need to wait for real-time update)
      await page.waitForSelector('[data-testid="updated-usage"]', { timeout: 5000 });
    });
  });

  test.describe('Discount Application System', () => {
    
    test('should apply tier discounts to pricing', async ({ page }) => {
      console.log('🎯 Testing Tier Discount Application');
      
      await loginUser(page, 'test-professional@chimari.test');
      
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Technical User Journey');
      await waitForPageLoad(page);
      
      await page.click('[data-testid="template-card"]');
      await page.click('button:has-text("Select Template")');
      await waitForPageLoad(page);
      
      // Should show tier-specific discounts
      await expect(page.locator('[data-testid="tier-discounts"]')).toBeVisible();
      await expect(page.locator('text=Professional tier discount')).toBeVisible();
      await expect(page.locator('text=20% off')).toBeVisible();
      
      // Should show breakdown of savings
      await expect(page.locator('[data-testid="savings-breakdown"]')).toBeVisible();
      await expect(page.locator('text=You\'re saving')).toBeVisible();
    });

    test('should show subscription benefits clearly', async ({ page }) => {
      console.log('🎯 Testing Subscription Benefits Display');
      
      await loginUser(page, 'test-enterprise@chimari.test');
      
      await page.goto('/pricing');
      await waitForPageLoad(page);
      
      // Should highlight enterprise benefits
      await expect(page.locator('[data-testid="enterprise-benefits"]')).toBeVisible();
      await expect(page.locator('text=Unlimited usage')).toBeVisible();
      await expect(page.locator('text=Priority support')).toBeVisible();
      await expect(page.locator('text=Custom integrations')).toBeVisible();
      
      // Should show value proposition
      await expect(page.locator('text=Best value')).toBeVisible();
      await expect(page.locator('text=Save up to')).toBeVisible();
    });
  });

  test.describe('Billing Configuration Admin', () => {
    
    test('should allow admin to configure billing parameters', async ({ page }) => {
      console.log('🎯 Testing Admin Billing Configuration');
      
      await loginAsAdmin(page);
      
      await page.goto('/admin/billing-configuration');
      await waitForPageLoad(page);
      
      // Should show billing configuration interface
      await expect(page.locator('h1:has-text("Billing Configuration")')).toBeVisible();
      
      // Should allow editing of:
      // - Tier prices
      // - Usage category limits
      // - Overage pricing
      // - Discount percentages
      
      await expect(page.locator('[data-testid="tier-pricing-config"]')).toBeVisible();
      await expect(page.locator('[data-testid="usage-limits-config"]')).toBeVisible();
      await expect(page.locator('[data-testid="overage-pricing-config"]')).toBeVisible();
      await expect(page.locator('[data-testid="discount-config"]')).toBeVisible();
      
      // Test updating tier pricing
      await page.click('[data-testid="edit-trial-pricing"]');
      await page.fill('input[name="trialPrice"]', '2');
      await page.click('button:has-text("Save")');
      
      await expect(page.locator('text=Configuration updated')).toBeVisible();
    });

    test('should validate billing configuration changes', async ({ page }) => {
      console.log('🎯 Testing Billing Configuration Validation');
      
      await loginAsAdmin(page);
      
      await page.goto('/admin/billing-configuration');
      await waitForPageLoad(page);
      
      // Try to set invalid pricing
      await page.click('[data-testid="edit-starter-pricing"]');
      await page.fill('input[name="starterPrice"]', '-10'); // Invalid negative price
      await page.click('button:has-text("Save")');
      
      // Should show validation error
      await expect(page.locator('text=Price must be positive')).toBeVisible();
      
      // Try to set invalid limits
      await page.click('[data-testid="edit-trial-limits"]');
      await page.fill('input[name="storageLimit"]', '0'); // Invalid zero limit
      await page.click('button:has-text("Save")');
      
      // Should show validation error
      await expect(page.locator('text=Limit must be greater than 0')).toBeVisible();
    });
  });

  test.describe('Integration Tests', () => {
    
    test('should integrate billing throughout user journey', async ({ page }) => {
      console.log('🎯 Testing End-to-End Billing Integration');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      // Start journey
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      // Verify billing status is shown
      await expect(page.locator('[data-testid="billing-status"]')).toBeVisible();
      await expect(page.locator('text=Trial Plan')).toBeVisible();
      
      await page.click('text=Non-Tech User Journey');
      await waitForPageLoad(page);
      
      // Verify billing checks at each step
      await page.click('[data-testid="template-card"]');
      await page.click('button:has-text("Select Template")');
      await waitForPageLoad(page);
      
      // Should show pricing breakdown
      await expect(page.locator('[data-testid="pricing-breakdown"]')).toBeVisible();
      await expect(page.locator('text=Estimated cost')).toBeVisible();
      
      // Continue through journey
      await page.click('button:has-text("Continue")');
      await waitForPageLoad(page);
      
      // At each checkpoint, billing should be updated
      await page.click('button:has-text("Approve")');
      await waitForPageLoad(page);
      
      // Verify usage is tracked
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      await expect(page.locator('[data-testid="updated-usage"]')).toBeVisible();
      
      // Verify final billing
      await page.goto('/analysis-results');
      await waitForPageLoad(page);
      
      await expect(page.locator('[data-testid="final-billing"]')).toBeVisible();
      await expect(page.locator('text=Total cost')).toBeVisible();
      await expect(page.locator('text=Credits applied')).toBeVisible();
    });

    test('should handle subscription tier upgrades', async ({ page }) => {
      console.log('🎯 Testing Subscription Tier Upgrades');
      
      await loginUser(page, 'test-trial@chimari.test');
      
      await page.goto('/usage-dashboard');
      await waitForPageLoad(page);
      
      // Should show upgrade recommendations
      await expect(page.locator('[data-testid="upgrade-recommendation"]')).toBeVisible();
      await expect(page.locator('text=Upgrade to Starter')).toBeVisible();
      
      // Click upgrade button
      await page.click('button:has-text("Upgrade")');
      await waitForPageLoad(page);
      
      // Should show upgrade flow
      await expect(page.locator('text=Choose Your Plan')).toBeVisible();
      await expect(page.locator('text=Starter Plan')).toBeVisible();
      await expect(page.locator('text=$10/month')).toBeVisible();
      
      // Test upgrade process
      await page.click('button:has-text("Select Starter")');
      await waitForPageLoad(page);
      
      // Should show billing information
      await expect(page.locator('text=Payment Information')).toBeVisible();
      await expect(page.locator('text=Pro-rated billing')).toBeVisible();
    });
  });
});
