import { test, expect } from '@playwright/test';

test.describe('WebKit Journey Test - Ignore SSL', () => {
  test('Test journey buttons with SSL errors ignored', async ({ page, context }) => {
    console.log('🔧 Testing WebKit journey buttons with SSL errors ignored');
    
    // Ignore SSL errors for external resources
    await context.route('https://replit.com/**', route => {
      console.log('🚫 Blocking Replit resource:', route.request().url());
      route.abort();
    });

    // Navigate to the main page
    await page.goto('http://localhost:3000/');
    console.log('✅ Loaded main landing page');
    
    // Wait for React to load and render
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Give React extra time to render
    
    // Check if React root has content now
    const rootDiv = page.locator('#root');
    const rootContent = await rootDiv.textContent();
    console.log(`📍 Root div content length: ${rootContent?.length || 0}`);
    
    // Check for journey section
    const journeySection = page.locator('section#journey-selection');
    const journeyExists = await journeySection.count() > 0;
    const journeyVisible = await journeySection.isVisible();
    console.log(`📍 Journey section exists: ${journeyExists}, visible: ${journeyVisible}`);
    
    if (journeyExists) {
      // Check for the flexbox grid container
      const gridContainer = page.locator('.flex.flex-wrap.gap-6.justify-center.webkit-grid-fix');
      const gridVisible = await gridContainer.isVisible();
      console.log(`📍 Grid container visible: ${gridVisible}`);
      
      // Count journey cards
      const cards = page.locator('div[data-testid^="button-start-"]');
      const cardCount = await cards.count();
      console.log(`📍 Journey buttons found: ${cardCount}`);
      
      // Check each specific journey button
      const journeyButtons = [
        'button-start-non-tech-landing',
        'button-start-business-landing', 
        'button-start-technical-landing',
        'button-start-consultation-landing'
      ];

      for (const buttonId of journeyButtons) {
        const button = page.getByTestId(buttonId);
        const isVisible = await button.isVisible();
        const exists = await button.count() > 0;
        console.log(`📍 ${buttonId}: exists=${exists}, visible=${isVisible}`);
      }
    }
    
    // Take a screenshot
    await page.screenshot({ 
      path: 'test-results/webkit-ssl-fixed.png', 
      fullPage: true 
    });
    console.log('📸 Screenshot saved as webkit-ssl-fixed.png');
  });
});