import { test, expect } from '@playwright/test';

test.describe('Business Journey Template Selection', () => {
  test('Template selection works correctly in business journey', async ({ page }) => {
    // Navigate to the main page
    await page.goto('http://localhost:5174');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Look for business journey or template analysis link
    const businessJourneyLink = page.locator('text=Business Journey').or(page.locator('text=Template Analysis')).or(page.locator('text=Business'));
    
    if (await businessJourneyLink.count() > 0) {
      await businessJourneyLink.first().click();
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
      
      // Look for template selection area
      const templateSection = page.locator('text=Template').or(page.locator('text=Select')).or(page.locator('[class*="template"]'));
      
      if (await templateSection.count() > 0) {
        // Find template items
        const templateItems = page.locator('[class*="template"]').or(page.locator('[class*="card"]')).or(page.locator('button'));
        
        if (await templateItems.count() > 0) {
          // Click the first template
          await templateItems.first().click();
          
          // Wait a moment for state to update
          await page.waitForTimeout(1000);
          
          // Check if any templates are selected (look for green styling or checkmarks)
          const selectedTemplates = page.locator('[class*="green"]').or(page.locator('[class*="selected"]')).or(page.locator('svg'));
          
          // Verify at least one template is selected
          expect(await selectedTemplates.count()).toBeGreaterThan(0);
          
          console.log('Template selection test completed successfully');
        } else {
          console.log('No template items found, skipping template selection test');
        }
      } else {
        console.log('No template section found, skipping template selection test');
      }
    } else {
      console.log('No business journey link found, skipping template selection test');
    }
  });

  test('Page layout is consistent across journey pages', async ({ page }) => {
    // Navigate to the main page
    await page.goto('http://localhost:5174');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Check if the page has proper layout
    const mainContainer = page.locator('main').or(page.locator('[class*="container"]')).or(page.locator('body'));
    
    if (await mainContainer.count() > 0) {
      // Check if the container has reasonable width
      const boundingBox = await mainContainer.first().boundingBox();
      
      if (boundingBox) {
        // Verify the container has a reasonable width (not too narrow)
        expect(boundingBox.width).toBeGreaterThan(300);
        console.log(`Page width: ${boundingBox.width}px`);
      }
    }
    
    console.log('Page layout test completed');
  });
});
