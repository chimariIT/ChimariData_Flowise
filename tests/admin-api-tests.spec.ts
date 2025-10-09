import { test, expect } from '@playwright/test';

test.describe('Admin API Tests', () => {
  test('should access admin agents API', async ({ page }) => {
    console.log('🎯 Testing Admin Agents API');
    
    // Navigate to a valid page first to establish document context
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get auth token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
    
    // Test API endpoint directly with auth header
    const response = await page.request.get('/api/admin/agents', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('agents');
    expect(data).toHaveProperty('systemStatus');
    
    console.log('✅ Admin agents API working');
  });

  test('should access subscription tiers API', async ({ page }) => {
    console.log('🎯 Testing Subscription Tiers API');
    
    // Test API endpoint directly
    const response = await page.request.get('/api/billing/subscription-tiers');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    
    // Check that tiers have required properties
    const tier = data[0];
    expect(tier).toHaveProperty('id');
    expect(tier).toHaveProperty('name');
    expect(tier).toHaveProperty('price');
    expect(tier).toHaveProperty('usageLimits');
    
    console.log('✅ Subscription tiers API working');
  });

  test('should access billing capacity summary API', async ({ page }) => {
    console.log('🎯 Testing Billing Capacity Summary API');
    
    // Navigate to a valid page first to establish document context
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get auth token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
    
    // Test API endpoint directly with auth header
    const response = await page.request.get('/api/billing/capacity-summary', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('summary');
    expect(data.summary).toHaveProperty('currentTier');
    expect(data.summary).toHaveProperty('usage');
    expect(data.summary).toHaveProperty('limits');
    
    console.log('✅ Billing capacity summary API working');
  });

  test('should test journey breakdown API', async ({ page }) => {
    console.log('🎯 Testing Journey Breakdown API');
    
    // Navigate to a valid page first to establish document context
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Get auth token from localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();
    
    // Test API endpoint with sample data and auth header
    const response = await page.request.post('/api/billing/journey-breakdown', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        journeyType: 'non-tech',
        datasetSizeMB: 10,
        analysisComplexity: 'basic',
        expectedArtifacts: ['pdf_report']
      }
    });
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('breakdown');
    expect(data.breakdown).toHaveProperty('baseCost');
    expect(data.breakdown).toHaveProperty('tierDiscount');
    expect(data.breakdown).toHaveProperty('finalCost');
    
    console.log('✅ Journey breakdown API working');
  });
});
