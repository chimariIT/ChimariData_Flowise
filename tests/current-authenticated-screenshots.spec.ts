import { test, expect, Page } from '@playwright/test';

// Test user configurations with different subscription tiers
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
  },
  professional: {
    email: 'professional-user@chimari.test',
    password: 'ProfessionalPass123!',
    subscriptionTier: 'professional'
  },
  enterprise: {
    email: 'enterprise-user@chimari.test',
    password: 'EnterprisePass123!',
    subscriptionTier: 'enterprise'
  }
};

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  await page.screenshot({ 
    path: `test-results/current-screenshots/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name} - ${description || 'User journey step'}`);
}

// Helper function to authenticate user via API first
async function authenticateViaAPI(user: any) {
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: user.password
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ API Authentication successful for ${user.subscriptionTier} user`);
      return result.token;
    } else {
      console.log(`⚠️ API Authentication failed for ${user.subscriptionTier} user`);
      return null;
    }
  } catch (error) {
    console.log(`❌ API Authentication error for ${user.subscriptionTier} user: ${error.message}`);
    return null;
  }
}

// Helper function to set authentication in browser
async function setBrowserAuth(page: Page, token: string) {
  await page.addInitScript((token) => {
    localStorage.setItem('authToken', token);
  }, token);
}

test.describe('Current Authenticated Screenshots', () => {
  
  for (const [userTier, user] of Object.entries(TEST_USERS)) {
    
    test(`${userTier.toUpperCase()} User Journey Screenshots`, async ({ page }) => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🎭 Testing: ${userTier.toUpperCase()} User`);
      console.log(`${'='.repeat(60)}\n`);

      // Step 1: Authenticate via API
      console.log('🔐 Step 1: API Authentication...');
      const token = await authenticateViaAPI(user);
      
      if (token) {
        // Set token in browser
        await setBrowserAuth(page, token);
        console.log(`✅ Browser authentication set for ${user.subscriptionTier} user`);
      }

      // Step 2: Navigate to dashboard
      console.log('📊 Step 2: Dashboard access...');
      await page.goto('/dashboard');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-01-dashboard`, 
        `${userTier} user dashboard with authentication`);

      // Step 3: Journey selection
      console.log('🎯 Step 3: Journey selection...');
      await page.goto('/journeys');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-02-journey-selection`, 
        `${userTier} user journey selection page`);

      // Step 4: Non-Tech Journey
      console.log('🤖 Step 4: Non-Tech Journey...');
      await page.goto('/journeys/non-tech/prepare');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-03-nontech-prepare`, 
        `${userTier} user non-tech journey preparation`);

      // Step 5: Business Journey
      console.log('💼 Step 5: Business Journey...');
      await page.goto('/journeys/business/prepare');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-04-business-prepare`, 
        `${userTier} user business journey preparation`);

      // Step 6: Technical Journey
      console.log('⚙️ Step 6: Technical Journey...');
      await page.goto('/journeys/technical/prepare');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-05-technical-prepare`, 
        `${userTier} user technical journey preparation`);

      // Step 7: Consultation Journey
      console.log('👥 Step 7: Consultation Journey...');
      await page.goto('/journeys/consultation/prepare');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-06-consultation-prepare`, 
        `${userTier} user consultation journey preparation`);

      // Step 8: Pricing page
      console.log('💳 Step 8: Pricing page...');
      await page.goto('/pricing');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-07-pricing`, 
        `${userTier} user pricing page with subscription tier`);

      // Step 9: Projects page
      console.log('📁 Step 9: Projects page...');
      await page.goto('/projects');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      await takeScreenshot(page, `${userTier}-08-projects`, 
        `${userTier} user projects page`);

      console.log(`✅ ${userTier.toUpperCase()} user screenshots completed!\n`);
    });
  }

  test('Generate Current Screenshot Summary', async ({ page }) => {
    console.log('📊 Generating Current Screenshot Summary Report');
    
    // Take a final summary screenshot
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'final-summary', 'Complete authenticated user journey testing summary');
    
    console.log('🎉 ALL CURRENT AUTHENTICATED SCREENSHOTS COMPLETE!');
    console.log('📸 Screenshots captured with real API authentication');
    console.log('📂 Screenshots location: test-results/current-screenshots/');
  });
});
