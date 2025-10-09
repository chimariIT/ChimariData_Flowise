import { test, expect } from '@playwright/test';

test.describe('WebKit Simple Debug', () => {
  test('Simple page structure check for WebKit', async ({ page }) => {
    console.log('🔧 Simple WebKit diagnostic check');
    
    // Navigate to the main page
    await page.goto('http://localhost:3000/');
    console.log('✅ Loaded main landing page');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check if the header is visible
    const header = page.locator('header');
    const headerVisible = await header.isVisible();
    console.log(`📍 Header visible: ${headerVisible}`);
    
    // Check if the hero section is visible
    const heroSection = page.locator('section').first();
    const heroVisible = await heroSection.isVisible();
    console.log(`📍 Hero section visible: ${heroVisible}`);
    
    // Check if any section with "journey" in the ID exists
    const journeySection = page.locator('section#journey-selection');
    const journeyExists = await journeySection.count() > 0;
    const journeyVisible = await journeySection.isVisible();
    console.log(`📍 Journey section exists: ${journeyExists}, visible: ${journeyVisible}`);
    
    // Check if the page contains journey-related text
    const pageContent = await page.textContent('body');
    const hasJourneyText = pageContent?.includes('Choose Your Analytics Journey') || false;
    console.log(`📍 Page contains journey text: ${hasJourneyText}`);
    
    // Take a full page screenshot for manual inspection
    await page.screenshot({ 
      path: 'test-results/webkit-simple-debug.png', 
      fullPage: true 
    });
    console.log('📸 Screenshot saved as webkit-simple-debug.png');
    
    // List all sections on the page
    const sections = page.locator('section');
    const sectionCount = await sections.count();
    console.log(`📍 Total sections found: ${sectionCount}`);
    
    for (let i = 0; i < sectionCount; i++) {
      const section = sections.nth(i);
      const id = await section.getAttribute('id') || 'no-id';
      const className = await section.getAttribute('class') || 'no-class';
      const visible = await section.isVisible();
      console.log(`📍 Section ${i}: id="${id}", visible=${visible}, class="${className.substring(0, 50)}..."`);
    }
  });
});