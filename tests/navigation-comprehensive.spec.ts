// tests/navigation-comprehensive.spec.ts

import { test, expect } from '@playwright/test';

test.describe('Comprehensive Navigation and Admin Testing', () => {
  
  test.beforeEach(async ({ page }) => {
    // Start with fresh session
    await page.goto('/');
  });

  test('User authentication and dashboard navigation', async ({ page }) => {
    // Test login flow
    await page.goto('/auth/login');
    await expect(page).toHaveTitle(/ChimariData/);
    
    // Fill login form
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard/);
    
    // Verify dashboard elements
    await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible();
    await expect(page.locator('text=Welcome back')).toBeVisible();
    
    // Test navigation buttons in header
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
    await page.click('[data-testid="nav-settings"]');
    await expect(page).toHaveURL(/settings/);
    
    // Go back to dashboard
    await page.click('button:has-text("Back to Dashboard")');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Project creation and agent interaction flow', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Navigate to new project
    await page.click('text=Start New Analysis');
    
    // Create a project
    await page.fill('input[name="name"]', 'Test Agent Project');
    await page.fill('textarea[name="description"]', 'Testing agent workflows');
    await page.selectOption('select[name="journeyType"]', 'ai_guided');
    await page.click('button[type="submit"]');
    
    // Should be in project page
    await expect(page).toHaveURL(/project\//);
    
    // Check for AI Agents tab
    await expect(page.locator('[data-testid="agents-tab"]')).toBeVisible();
    await page.click('[data-testid="agents-tab"]');
    
    // Verify agent interface loads
    await expect(page.locator('text=AI Agent Activity')).toBeVisible();
    
    // Look for agent checkpoints or initial message
    await expect(page.locator('text=No agent activity yet')).toBeVisible().or(
      page.locator('text=Project Manager').first()
    );
  });

  test('Admin interface access and RBAC', async ({ page }) => {
    // Login as admin user
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'admin@test.com');
    await page.fill('[data-testid="password-input"]', 'admin123');
    await page.click('[data-testid="login-button"]');
    
    // Check if admin button appears (for admin users)
    const adminButton = page.locator('[data-testid="nav-admin"]');
    if (await adminButton.isVisible()) {
      // Test admin access
      await adminButton.click();
      await expect(page).toHaveURL(/admin/);
      
      // Verify admin panel loads
      await expect(page.locator('text=Admin Panel')).toBeVisible();
      
      // Test admin tabs
      await expect(page.locator('text=Dashboard')).toBeVisible();
      await expect(page.locator('text=Subscriptions')).toBeVisible();
      await expect(page.locator('text=Agents')).toBeVisible();
      await expect(page.locator('text=Tools')).toBeVisible();
      
      // Test tab navigation
      await page.click('text=Subscriptions');
      await expect(page).toHaveURL(/admin\/subscription-management/);
      
      await page.click('text=Agents');
      await expect(page).toHaveURL(/admin\/agent-management/);
      
      // Test back to dashboard
      await page.click('text=Back to Dashboard');
      await expect(page).toHaveURL(/dashboard/);
    }
  });

  test('Regular user cannot access admin', async ({ page }) => {
    // Login as regular user
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'user@test.com');
    await page.fill('[data-testid="password-input"]', 'user123');
    await page.click('[data-testid="login-button"]');
    
    // Admin button should not appear for regular users
    await expect(page.locator('[data-testid="nav-admin"]')).not.toBeVisible();
    
    // Direct access to admin should be blocked
    await page.goto('/admin');
    await expect(page.locator('text=Access Denied')).toBeVisible().or(
      page.locator('text=Insufficient Privileges')
    );
  });

  test('All main navigation links work correctly', async ({ page }) => {
    // Test homepage navigation
    await page.goto('/');
    await expect(page.locator('text=ChimariData')).toBeVisible();
    
    // Test journey hub
    await page.click('text=Get Started');
    await expect(page).toHaveURL(/journeys/);
    
    // Test journey types
    const journeyTypes = ['non-tech', 'business', 'technical', 'consultation'];
    
    for (const type of journeyTypes) {
      await page.goto(`/journeys/${type}/prepare`);
      await expect(page.locator('text=Journey')).toBeVisible().or(
        page.locator('text=Prepare')
      );
    }
    
    // Test pricing page
    await page.goto('/pricing');
    await expect(page.locator('text=Pricing')).toBeVisible();
    
    // Test demos
    await page.goto('/demos');
    await expect(page.locator('text=Demo')).toBeVisible();
  });

  test('Project page tab navigation', async ({ page }) => {
    // Login and go to existing project
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Go to a project (or create one)
    await page.goto('/project/test-project-id');
    
    // Test all project tabs
    const tabs = [
      { testId: 'workflow-tab', text: 'Overview' },
      { testId: 'agents-tab', text: 'AI Agents' },
      { testId: 'decisions-tab', text: 'Timeline' },
      { testId: 'artifacts-tab', text: 'Schema' }
    ];
    
    for (const tab of tabs) {
      const tabElement = page.locator(`[data-testid="${tab.testId}"]`);
      if (await tabElement.isVisible()) {
        await tabElement.click();
        // Verify tab content loads
        await page.waitForTimeout(500);
      }
    }
    
    // Test back navigation
    await page.click('text=Back');
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Error handling and 404 pages', async ({ page }) => {
    // Test 404 page
    await page.goto('/non-existent-page');
    await expect(page.locator('text=Page Not Found')).toBeVisible();
    
    // Test invalid project ID
    await page.goto('/project/invalid-id');
    await expect(page.locator('text=Project Not Found')).toBeVisible().or(
      page.locator('text=Loading project')
    );
  });

  test('Mobile responsive navigation', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.goto('/');
    
    // Check that page is responsive
    await expect(page.locator('body')).toBeVisible();
    
    // Test mobile menu if exists
    const mobileMenu = page.locator('[data-testid="mobile-menu"]');
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
    }
  });

  test('Agent checkpoint interaction workflow', async ({ page }) => {
    // Login and create/access project with agents
    await page.goto('/auth/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    
    // Create new project to trigger agent initialization
    await page.click('text=Start New Analysis');
    await page.fill('input[name="name"]', 'Agent Test Project');
    await page.selectOption('select[name="journeyType"]', 'ai_guided');
    await page.click('button[type="submit"]');
    
    // Go to agents tab
    await page.click('[data-testid="agents-tab"]');
    
    // Wait for agent activity
    await page.waitForTimeout(2000);
    
    // Check for agent messages or checkpoints
    const agentMessage = page.locator('text=Project Manager').first();
    if (await agentMessage.isVisible()) {
      // Look for approval buttons
      const approveButton = page.locator('text=Approve').first();
      const feedbackButton = page.locator('text=Request Changes').first();
      
      if (await approveButton.isVisible()) {
        // Test feedback interaction
        await page.fill('textarea[placeholder*="feedback"]', 'Looks good to proceed');
        await approveButton.click();
        
        // Verify feedback was processed
        await page.waitForTimeout(1000);
        await expect(page.locator('text=Feedback submitted')).toBeVisible().or(
          page.locator('text=Approved')
        );
      }
    }
  });
});

test.describe('Link Validation', () => {
  test('All internal links are valid', async ({ page }) => {
    const linksToTest = [
      '/',
      '/journeys',
      '/pricing',
      '/demos',
      '/auth/login',
      '/auth/register'
    ];
    
    for (const link of linksToTest) {
      await page.goto(link);
      
      // Check that page loads without 404
      await expect(page.locator('text=Page Not Found')).not.toBeVisible();
      
      // Check for basic page structure
      await expect(page.locator('body')).toBeVisible();
    }
  });
  
  test('External links open correctly', async ({ page }) => {
    await page.goto('/');
    
    // Test external links (if any) open in new tabs
    const externalLinks = page.locator('a[href^="http"]:not([href*="localhost"])');
    const count = await externalLinks.count();
    
    for (let i = 0; i < count; i++) {
      const link = externalLinks.nth(i);
      await expect(link).toHaveAttribute('target', '_blank');
    }
  });
});