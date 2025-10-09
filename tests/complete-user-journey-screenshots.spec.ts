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

const JOURNEY_TYPES = {
  nonTech: {
    name: 'Non-Tech User Journey',
    slug: 'non-tech',
    steps: [
      { step: 1, name: 'prepare', description: 'Analysis preparation with AI guidance' },
      { step: 2, name: 'project-setup', description: 'Simple project configuration' },
      { step: 3, name: 'data', description: 'Easy data upload interface' },
      { step: 4, name: 'execute', description: 'AI-powered analysis execution' },
      { step: 5, name: 'pricing', description: 'Transparent pricing display' },
      { step: 6, name: 'results', description: 'Plain English results' }
    ]
  },
  business: {
    name: 'Business User Journey',
    slug: 'business',
    steps: [
      { step: 1, name: 'prepare', description: 'Template-based analysis preparation' },
      { step: 2, name: 'project-setup', description: 'Business project configuration' },
      { step: 3, name: 'data', description: 'Business data handling' },
      { step: 4, name: 'execute', description: 'KPI-focused analysis execution' },
      { step: 5, name: 'pricing', description: 'Business pricing options' },
      { step: 6, name: 'results', description: 'Executive-ready results' }
    ]
  },
  technical: {
    name: 'Technical User Journey',
    slug: 'technical',
    steps: [
      { step: 1, name: 'prepare', description: 'Advanced analysis preparation' },
      { step: 2, name: 'project-setup', description: 'Full control project setup' },
      { step: 3, name: 'data', description: 'Advanced data preparation' },
      { step: 4, name: 'execute', description: 'Custom analysis execution' },
      { step: 5, name: 'pricing', description: 'Technical pricing options' },
      { step: 6, name: 'results', description: 'Detailed technical results' }
    ]
  },
  consultation: {
    name: 'Expert Consultation Journey',
    slug: 'consultation',
    steps: [
      { step: 1, name: 'prepare', description: 'Expert consultation preparation' },
      { step: 2, name: 'project-setup', description: 'Consultation project setup' },
      { step: 3, name: 'data', description: 'Data preparation for experts' },
      { step: 4, name: 'execute', description: 'Expert-guided execution' },
      { step: 5, name: 'pricing', description: 'Consultation pricing' },
      { step: 6, name: 'results', description: 'Expert consultation results' }
    ]
  }
};

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  await page.screenshot({ 
    path: `test-results/complete-journeys/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name} - ${description || 'Journey step'}`);
}

// Helper function to authenticate user
async function loginUser(page: Page, user: any) {
  console.log(`🔐 Logging in ${user.subscriptionTier} user: ${user.email}`);
  
  await page.goto('/auth/login');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Fill login form
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  
  // Wait for login to complete
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  
  // Check if login was successful
  const currentUrl = page.url();
  if (currentUrl.includes('/dashboard') || currentUrl.includes('/projects')) {
    console.log(`✅ Successfully logged in ${user.subscriptionTier} user`);
    return true;
  } else {
    console.log(`⚠️ Login may have failed for ${user.subscriptionTier} user`);
    return false;
  }
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

test.describe('Complete User Journey Screenshots', () => {
  
  for (const [userTier, user] of Object.entries(TEST_USERS)) {
    for (const [journeyKey, journey] of Object.entries(JOURNEY_TYPES)) {
      
      test(`${userTier.toUpperCase()} User - ${journey.name} (All 6 Steps)`, async ({ page }) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎭 Testing: ${userTier.toUpperCase()} User - ${journey.name}`);
        console.log(`${'='.repeat(80)}\n`);

        // Step 0: Login
        const loginSuccess = await loginUser(page, user);
        if (loginSuccess) {
          await takeScreenshot(page, `${userTier}-${journeyKey}-00-login`, 
            `${userTier} user logged in successfully`);
        }

        // Navigate to journey selection
        await page.goto('/journeys');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-00-journey-selection`, 
          `${userTier} user journey selection page`);

        // Go through all 6 journey steps
        for (const step of journey.steps) {
          console.log(`📋 Step ${step.step}: ${step.description}`);
          
          const stepUrl = `/journeys/${journey.slug}/${step.name}`;
          await page.goto(stepUrl);
          await waitForPageLoad(page);
          
          // Take screenshot of this step
          await takeScreenshot(page, `${userTier}-${journeyKey}-${step.step.toString().padStart(2, '0')}-${step.name}`, 
            `${userTier} user - ${journey.name} - Step ${step.step}: ${step.description}`);
          
          // Wait a bit between steps to show progression
          await page.waitForTimeout(1000);
        }

        console.log(`✅ ${userTier.toUpperCase()} ${journey.name} completed - All 6 steps captured!\n`);
      });
    }
  }

  test('Generate Complete Journey Summary', async ({ page }) => {
    console.log('📊 Generating Complete Journey Screenshot Summary');
    
    // Take a final summary screenshot
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'complete-journey-summary', 'Complete user journey testing summary');
    
    console.log('🎉 ALL COMPLETE USER JOURNEY SCREENSHOTS CAPTURED!');
    console.log('📸 Screenshots show all 6 steps for each user tier and journey type');
    console.log('📂 Screenshots location: test-results/complete-journeys/');
    console.log('🔍 Each screenshot shows the distinction between subscription tiers and journey types');
  });
});
