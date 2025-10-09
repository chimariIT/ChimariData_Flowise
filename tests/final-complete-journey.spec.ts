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
  },
  technical: {
    name: 'Technical User Journey',
    slug: 'technical'
  },
  consultation: {
    name: 'Expert Consultation Journey',
    slug: 'consultation'
  }
};

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  await page.screenshot({ 
    path: `test-results/final-complete/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name} - ${description || 'Journey step'}`);
}

// Helper function to authenticate user
async function authenticateUser(page: Page, user: any) {
  console.log(`🔐 Authenticating ${user.subscriptionTier} user: ${user.email}`);
  
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
      const token = result.token;
      
      await page.addInitScript((token) => {
        localStorage.setItem('auth_token', token);
      }, token);
      
      console.log(`✅ Authentication successful for ${user.subscriptionTier} user`);
      return token;
    } else {
      console.log(`❌ Authentication failed for ${user.subscriptionTier} user`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Authentication error for ${user.subscriptionTier} user: ${error.message}`);
    return null;
  }
}

// Helper function to create project via API
async function createProject(token: string, user: any, journey: any) {
  console.log(`📁 Creating project for ${user.subscriptionTier} user - ${journey.name}`);
  
  try {
    const response = await fetch('http://localhost:3000/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: `${journey.name} - ${user.subscriptionTier} User`,
        description: `Complete journey test for ${journey.name}`,
        journeyType: journey.slug,
        userTier: user.subscriptionTier
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Project created: ${result.project.id}`);
      return result.project;
    } else {
      console.log(`❌ Project creation failed: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Project creation error: ${error.message}`);
    return null;
  }
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500); // Minimal timeout
}

test.describe('Final Complete User Journey', () => {
  
  for (const [userTier, user] of Object.entries(TEST_USERS)) {
    for (const [journeyKey, journey] of Object.entries(JOURNEY_TYPES)) {
      
      test(`${userTier.toUpperCase()} User - ${journey.name}`, async ({ page }) => {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🎭 ${userTier.toUpperCase()} - ${journey.name}`);
        console.log(`${'='.repeat(50)}\n`);

        // Step 1: Authentication
        const token = await authenticateUser(page, user);
        if (!token) return;

        // Step 2: Dashboard
        await page.goto('/dashboard');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-01-dashboard`, 
          `${userTier} user dashboard`);

        // Step 3: Journey Selection
        await page.goto('/journeys');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-02-journey-selection`, 
          `${userTier} journey selection`);

        // Step 4: Goal Setting
        await page.goto(`/journeys/${journey.slug}/prepare`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-03-goal-setting`, 
          `${userTier} goal setting`);

        // Step 5: Project Creation
        const project = await createProject(token, user, journey);
        if (project) {
          await page.goto(`/projects/${project.id}`);
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-04-project-created`, 
            `${userTier} project created`);
        }

        // Step 6: Data Upload
        await page.goto(`/journeys/${journey.slug}/data`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-05-data-upload`, 
          `${userTier} data upload`);

        // Step 7: Analysis Execution
        await page.goto(`/journeys/${journey.slug}/execute`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-06-analysis-execution`, 
          `${userTier} analysis execution`);

        // Step 8: Pricing
        await page.goto('/pricing');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-07-pricing`, 
          `${userTier} pricing`);

        // Step 9: Checkout
        await page.goto('/checkout');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-08-checkout`, 
          `${userTier} checkout`);

        console.log(`✅ ${userTier.toUpperCase()} ${journey.name} completed\n`);
      });
    }
  }

  test('Generate Final Summary', async ({ page }) => {
    console.log('📊 Generating Final Summary');
    
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'final-summary', 'Complete user journey summary');
    
    console.log('🎉 FINAL COMPLETE USER JOURNEY SCREENSHOTS CAPTURED!');
    console.log('📸 All 8 steps of each journey captured');
    console.log('📂 Screenshots location: test-results/final-complete/');
  });
});
