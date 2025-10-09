import { test, expect, Page } from '@playwright/test';

// Test user configurations
const TEST_USERS = {
  trial: {
    email: 'trial-user@chimari.test',
    password: 'TrialPass123!',
    subscriptionTier: 'trial'
  },
  starter: {
    email: 'starter-user@chimari.test', 
    password: 'StarterPass123!',
    subscriptionTier: 'starter'
  }
};

const JOURNEY_TYPES = {
  nonTech: {
    name: 'Non-Tech User Journey',
    slug: 'non-tech'
  },
  business: {
    name: 'Business User Journey', 
    slug: 'business'
  }
};

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  await page.screenshot({ 
    path: `test-results/simple-journeys/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name} - ${description || 'Journey step'}`);
}

// Helper function to login user
async function loginUser(page: Page, user: any) {
  console.log(`🔐 Logging in ${user.subscriptionTier} user: ${user.email}`);
  
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Fill login form with correct field names
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait for login to complete
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  
  console.log(`✅ Login attempt completed for ${user.subscriptionTier} user`);
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

test.describe('Simple Journey Screenshots', () => {
  
  for (const [userTier, user] of Object.entries(TEST_USERS)) {
    for (const [journeyKey, journey] of Object.entries(JOURNEY_TYPES)) {
      
      test(`${userTier.toUpperCase()} User - ${journey.name}`, async ({ page }) => {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🎭 Testing: ${userTier.toUpperCase()} User - ${journey.name}`);
        console.log(`${'='.repeat(60)}\n`);

        // Step 1: Login
        await loginUser(page, user);
        await takeScreenshot(page, `${userTier}-${journeyKey}-01-login`, 
          `${userTier} user login page`);

        // Step 2: Dashboard/Home
        await page.goto('/');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-02-home`, 
          `${userTier} user home page`);

        // Step 3: Journey selection
        await page.goto('/journeys');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-03-journey-selection`, 
          `${userTier} user journey selection page`);

        // Step 4: Journey prepare
        await page.goto(`/journeys/${journey.slug}/prepare`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-04-prepare`, 
          `${userTier} user ${journey.name} preparation`);

        // Step 5: Project setup
        await page.goto(`/journeys/${journey.slug}/project-setup`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-05-project-setup`, 
          `${userTier} user ${journey.name} project setup`);

        // Step 6: Data upload
        await page.goto(`/journeys/${journey.slug}/data`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-06-data`, 
          `${userTier} user ${journey.name} data upload`);

        // Step 7: Execute analysis
        await page.goto(`/journeys/${journey.slug}/execute`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-07-execute`, 
          `${userTier} user ${journey.name} execution`);

        // Step 8: Pricing
        await page.goto('/pricing');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-08-pricing`, 
          `${userTier} user pricing page`);

        // Step 9: Results
        await page.goto(`/journeys/${journey.slug}/results`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-09-results`, 
          `${userTier} user ${journey.name} results`);

        console.log(`✅ ${userTier.toUpperCase()} ${journey.name} completed!\n`);
      });
    }
  }

  test('Generate Simple Journey Summary', async ({ page }) => {
    console.log('📊 Generating Simple Journey Screenshot Summary');
    
    // Take a final summary screenshot
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'simple-journey-summary', 'Simple journey testing summary');
    
    console.log('🎉 SIMPLE JOURNEY SCREENSHOTS COMPLETE!');
    console.log('📸 Screenshots show complete user journeys with proper authentication');
    console.log('📂 Screenshots location: test-results/simple-journeys/');
  });
});
