import { test, expect } from '@playwright/test';

test.describe('WebKit Journey Button Debug', () => {
  test('Debug WebKit journey button visibility', async ({ page }) => {
    console.log('🔧 Debugging WebKit journey button visibility');

    // Step 1: Navigate to main landing page
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Extra wait for slow loading
    console.log('✅ Loaded main landing page');

    // Step 2: Take screenshot for debugging
    await page.screenshot({ path: 'webkit-landing-debug.png', fullPage: true });

    // Step 3: Check if journey selection section exists
    const journeySection = page.locator('#journey-selection');
    const journeySectionExists = await journeySection.isVisible();
    console.log('📍 Journey section visible:', journeySectionExists);

    // Step 4: Check if the grid container exists - Updated for flexbox
    const gridContainer = page.locator('.flex.flex-wrap.gap-6.justify-center.webkit-grid-fix');
    const gridExists = await gridContainer.isVisible();
    console.log('📍 Grid container visible:', gridExists);

    // Step 5: Count total cards
    const cards = page.locator('div[data-testid^="card-journey"]');
    const cardCount = await cards.count();
    console.log('📍 Journey cards found:', cardCount);

    // Step 6: Check each specific journey button
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
      
      if (exists && !isVisible) {
        // Get computed styles to see what's hiding it
        const styles = await button.evaluate((el) => {
          const computed = window.getComputedStyle(el);
          return {
            display: computed.display,
            visibility: computed.visibility,
            opacity: computed.opacity,
            width: computed.width,
            height: computed.height,
            overflow: computed.overflow
          };
        });
        console.log(`📍 ${buttonId} styles:`, styles);
      }
    }

    // Step 7: Check if there are any console errors
    const logs = [];
    page.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });

    // Wait a bit more and check logs
    await page.waitForTimeout(2000);
    if (logs.length > 0) {
      console.log('📍 Console logs:', logs);
    }

    // Step 8: Check if the main grid has proper CSS - Updated for flexbox
    const gridStyles = await gridContainer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        gridTemplateColumns: computed.gridTemplateColumns,
        gap: computed.gap,
        width: computed.width
      };
    });
    console.log('📍 Grid styles:', gridStyles);

    console.log('🎉 WebKit debug test completed');
  });
});