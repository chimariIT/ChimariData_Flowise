import { chromium } from 'playwright';

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('📸 Starting screenshot capture...');

  try {
    // Navigate to home page
    console.log('1. Capturing home page...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/01-home-page.png', fullPage: true });

    // Navigate to a journey
    console.log('2. Capturing journey selector...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'screenshots/02-journey-selector.png', fullPage: true });

    // Navigate to prepare step
    console.log('3. Capturing prepare step with audience definition...');
    await page.goto('http://localhost:5173/journeys/business/prepare');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/03-prepare-step-audience.png', fullPage: true });

    // Navigate to data verification step
    console.log('4. Capturing data verification step...');
    await page.goto('http://localhost:5173/journeys/business/data-verification');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/04-data-verification.png', fullPage: true });

    // Navigate to preview step
    console.log('5. Capturing results preview step...');
    await page.goto('http://localhost:5173/journeys/business/preview');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'screenshots/05-results-preview.png', fullPage: true });

    console.log('✅ Screenshots captured successfully!');
  } catch (error) {
    console.error('❌ Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

captureScreenshots();



















