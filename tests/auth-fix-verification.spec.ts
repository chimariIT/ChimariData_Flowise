import { test, expect } from '@playwright/test';
import { programmaticLogin } from './utils/auth';

test.describe('Authentication Fix Verification', () => {
  test('User role permissions endpoint should work with authentication', async ({ page, request }) => {
    console.log('🔧 Testing authentication fix for user role permissions');
    
    // Step 1: Get auth token using programmatic login
    const token = await programmaticLogin(page, request);
    console.log('✅ Got auth token');
    
    // Step 2: Test /api/user/role-permissions endpoint directly
    const response = await request.get('/api/user/role-permissions', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log(`📡 /api/user/role-permissions status: ${response.status()}`);
    
    if (response.ok()) {
      const data = await response.json();
      console.log('✅ User role permissions endpoint working!');
      console.log('📊 Response data keys:', Object.keys(data));
      
      // Verify essential fields are present
      expect(data.userRole).toBeDefined();
      expect(data.permissions).toBeDefined();
      expect(data.subscriptionTier).toBeDefined();
      
      console.log(`👤 User role: ${data.userRole}`);
      console.log(`🎯 Subscription tier: ${data.subscriptionTier}`);
      console.log(`🔑 Permissions keys: ${Object.keys(data.permissions)}`);
      
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.log('❌ User role permissions endpoint failed');
      console.log(`Error: ${errorData.error || 'Unknown error'}`);
      throw new Error(`Role permissions endpoint failed: ${response.status()}`);
    }
    
    // Step 3: Test journey access in the browser
    await page.goto('/journeys');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Give time for role data to load
    
    // Check if journey buttons are now visible
    const journeyButtons = await page.locator('[data-testid^="button-start-"]').count();
    console.log(`🎯 Found ${journeyButtons} journey buttons`);
    
    if (journeyButtons > 0) {
      console.log('✅ Journey buttons are now visible - authentication fix successful!');
      
      // Take screenshot of successful state
      await page.screenshot({ 
        path: 'test-results/auth-fix-success.png',
        fullPage: false
      });
      
      // Log button details
      const buttons = await page.locator('[data-testid^="button-start-"]').all();
      for (const button of buttons) {
        const testId = await button.getAttribute('data-testid');
        const isVisible = await button.isVisible();
        console.log(`  📌 ${testId}: ${isVisible ? 'visible' : 'hidden'}`);
      }
      
    } else {
      console.log('❌ Journey buttons still not visible');
      
      // Take screenshot of failed state for debugging
      await page.screenshot({ 
        path: 'test-results/auth-fix-failed.png',
        fullPage: false
      });
      
      // Debug: Check for any error messages
      const errorElements = await page.locator('.error, [data-testid*="error"], .alert-error').count();
      console.log(`🔍 Found ${errorElements} error elements on page`);
      
      throw new Error('Journey buttons still not visible after auth fix');
    }
    
    console.log('🎉 Authentication fix verification completed successfully!');
  });
});