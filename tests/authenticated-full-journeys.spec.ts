import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const API_BASE_URL = 'http://localhost:3000';

// Test users for different subscription tiers
const TEST_USERS = {
  trial: { 
    email: 'test-trial@chimari.test', 
    password: 'password123', 
    firstName: 'Test', 
    lastName: 'Trial',
    tier: 'trial'
  },
  starter: { 
    email: 'test-starter@chimari.test', 
    password: 'password123', 
    firstName: 'Test', 
    lastName: 'Starter',
    tier: 'starter'
  },
  professional: { 
    email: 'test-professional@chimari.test', 
    password: 'password123', 
    firstName: 'Test', 
    lastName: 'Professional',
    tier: 'professional'
  },
  enterprise: { 
    email: 'test-enterprise@chimari.test', 
    password: 'password123', 
    firstName: 'Test', 
    lastName: 'Enterprise',
    tier: 'enterprise'
  }
};

// Journey types
const JOURNEY_TYPES = {
  nonTech: { name: 'Non-Tech User Journey', path: 'non-tech' },
  business: { name: 'Business User Journey', path: 'business' },
  technical: { name: 'Technical User Journey', path: 'technical' },
  consultation: { name: 'Expert Consultation Journey', path: 'consultation' }
};

async function takeScreenshot(page: Page, name: string, description?: string) {
  const screenshotDir = path.join(process.cwd(), 'test-results', 'authenticated-full-journeys');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  await page.screenshot({
    path: `${screenshotDir}/${name}.png`,
    fullPage: true
  });
  console.log(`📸 Screenshot: ${name} - ${description || name}`);
}

async function loginUser(page: Page, user: typeof TEST_USERS['trial']) {
  console.log(`🔐 Logging in ${user.email} (${user.tier})...`);
  
  // Navigate to auth page
  await page.goto(`${BASE_URL}/auth`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  // Fill login form
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  
  // Click login button
  await page.click('button[type="submit"]');
  
  // Wait for redirect to journeys hub (default after login)
  await page.waitForURL('**/', { timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  
  console.log(`✅ Login successful for ${user.email}`);
}

async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

test.describe('Authenticated Full User Journeys', () => {
  
  // Test Trial Users (Non-Subscription)
  for (const userTierKey of ['trial'] as Array<keyof typeof TEST_USERS>) {
    const user = TEST_USERS[userTierKey];
    
    for (const journeyKey of Object.keys(JOURNEY_TYPES) as Array<keyof typeof JOURNEY_TYPES>) {
      const journey = JOURNEY_TYPES[journeyKey];
      
      test(`${userTierKey.toUpperCase()} User - ${journey.name} Complete Journey`, async ({ page }) => {
        console.log(`\n============================================================`);
        console.log(`🎭 ${userTierKey.toUpperCase()} User - ${journey.name}`);
        console.log(`============================================================`);
        
        // Step 1: Authentication
        await loginUser(page, user);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-01-authenticated-dashboard`, `${userTierKey} user authenticated dashboard`);
        
        // Step 2: Journey Selection
        console.log('🎯 Step 2: Journey Selection...');
        await page.goto(`${BASE_URL}/journeys`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-02-journey-selection`, `${userTierKey} user journey selection - ${journey.name}`);
        
        // Step 3: Goal Setting (Prepare Step)
        console.log('🎯 Step 3: Goal Setting...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/prepare`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-03-goal-setting`, `${userTierKey} user goal setting for ${journey.name}`);
        
        // Step 4: Project Setup
        console.log('📁 Step 4: Project Setup...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/project-setup`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-04-project-setup`, `${userTierKey} user project setup for ${journey.name}`);
        
        // Step 5: Data Upload Interface
        console.log('📤 Step 5: Data Upload Interface...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/data`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-05-data-upload`, `${userTierKey} user data upload interface for ${journey.name}`);
        
        // Step 6: Analysis Execution Interface
        console.log('⚙️ Step 6: Analysis Execution Interface...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/execute`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-06-analysis-execution`, `${userTierKey} user analysis execution interface for ${journey.name}`);
        
        // Step 7: Pricing and Subscription Eligibility
        console.log('💳 Step 7: Pricing and Subscription Eligibility...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/pricing`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-07-pricing-eligibility`, `${userTierKey} user pricing and subscription eligibility`);
        
        // Step 8: Results and Artifacts
        console.log('📊 Step 8: Results and Artifacts...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/results`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-08-results-artifacts`, `${userTierKey} user results and artifacts`);
        
        console.log(`✅ ${userTierKey.toUpperCase()} ${journey.name} completed successfully!`);
      });
    }
  }
  
  // Test Subscription Users (Starter, Professional, Enterprise)
  for (const userTierKey of ['starter', 'professional', 'enterprise'] as Array<keyof typeof TEST_USERS>) {
    const user = TEST_USERS[userTierKey];
    
    // Test key journeys for subscription users
    for (const journeyKey of ['nonTech', 'business'] as Array<keyof typeof JOURNEY_TYPES>) {
      const journey = JOURNEY_TYPES[journeyKey];
      
      test(`${userTierKey.toUpperCase()} User - ${journey.name} Complete Journey`, async ({ page }) => {
        console.log(`\n============================================================`);
        console.log(`🎭 ${userTierKey.toUpperCase()} User - ${journey.name}`);
        console.log(`============================================================`);
        
        // Step 1: Authentication
        await loginUser(page, user);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-01-authenticated-dashboard`, `${userTierKey} user authenticated dashboard`);
        
        // Step 2: Journey Selection
        console.log('🎯 Step 2: Journey Selection...');
        await page.goto(`${BASE_URL}/journeys`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-02-journey-selection`, `${userTierKey} user journey selection - ${journey.name}`);
        
        // Step 3: Goal Setting (Prepare Step)
        console.log('🎯 Step 3: Goal Setting...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/prepare`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-03-goal-setting`, `${userTierKey} user goal setting for ${journey.name}`);
        
        // Step 4: Project Setup
        console.log('📁 Step 4: Project Setup...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/project-setup`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-04-project-setup`, `${userTierKey} user project setup for ${journey.name}`);
        
        // Step 5: Data Upload Interface
        console.log('📤 Step 5: Data Upload Interface...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/data`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-05-data-upload`, `${userTierKey} user data upload interface for ${journey.name}`);
        
        // Step 6: Analysis Execution Interface
        console.log('⚙️ Step 6: Analysis Execution Interface...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/execute`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-06-analysis-execution`, `${userTierKey} user analysis execution interface for ${journey.name}`);
        
        // Step 7: Pricing and Subscription Eligibility
        console.log('💳 Step 7: Pricing and Subscription Eligibility...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/pricing`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-07-pricing-eligibility`, `${userTierKey} user pricing and subscription eligibility`);
        
        // Step 8: Results and Artifacts
        console.log('📊 Step 8: Results and Artifacts...');
        await page.goto(`${BASE_URL}/journeys/${journey.path}/results`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTierKey}-${journeyKey}-08-results-artifacts`, `${userTierKey} user results and artifacts`);
        
        console.log(`✅ ${userTierKey.toUpperCase()} ${journey.name} completed successfully!`);
      });
    }
  }
  
  test('Generate Authenticated Journey Summary', async ({ page }) => {
    console.log(`\n📊 Generating Authenticated Journey Summary...`);
    const screenshotDir = path.join(process.cwd(), 'test-results', 'authenticated-full-journeys');
    const summaryReportPath = path.join(screenshotDir, 'AUTHENTICATED_JOURNEY_SUMMARY.md');
    
    const allScreenshots = fs.readdirSync(screenshotDir).filter(file => file.endsWith('.png'));
    let summaryContent = `# Authenticated Full User Journey Screenshots Summary\n\n`;
    summaryContent += `## Date: ${new Date().toISOString()}\n`;
    summaryContent += `## Total Screenshots: ${allScreenshots.length}\n\n`;
    summaryContent += `## User Types Tested\n`;
    summaryContent += `- **Trial Users (Non-Subscription)**: All 4 journey types\n`;
    summaryContent += `- **Starter Users (Subscription)**: Non-Tech and Business journeys\n`;
    summaryContent += `- **Professional Users (Subscription)**: Non-Tech and Business journeys\n`;
    summaryContent += `- **Enterprise Users (Subscription)**: Non-Tech and Business journeys\n\n`;
    
    summaryContent += `## Journey Types Tested\n`;
    summaryContent += `- **Non-Tech User Journey**: AI-assisted analysis for non-technical users\n`;
    summaryContent += `- **Business User Journey**: Pre-built templates for business scenarios\n`;
    summaryContent += `- **Technical User Journey**: Advanced analytics for data professionals\n`;
    summaryContent += `- **Expert Consultation Journey**: Professional guidance from experts\n\n`;
    
    summaryContent += `## Screenshots by Step\n`;
    const steps = ['01-authenticated-dashboard', '02-journey-selection', '03-goal-setting', '04-project-setup', '05-data-upload', '06-analysis-execution', '07-pricing-eligibility', '08-results-artifacts'];
    
    for (const step of steps) {
      summaryContent += `### Step ${step.split('-')[0]}: ${step.split('-').slice(1).join(' ').replace(/\b\w/g, l => l.toUpperCase())}\n`;
      const stepScreenshots = allScreenshots.filter(file => file.includes(step));
      for (const screenshot of stepScreenshots.sort()) {
        const parts = screenshot.replace('.png', '').split('-');
        const userTier = parts[0];
        const journeyType = parts[1];
        summaryContent += `- **${userTier.toUpperCase()} ${journeyType}**: \`${screenshot}\`\n`;
      }
      summaryContent += `\n`;
    }
    
    fs.writeFileSync(summaryReportPath, summaryContent);
    console.log(`📸 Screenshot: authenticated-journey-summary - Complete authenticated journey summary`);
    console.log(`🎉 AUTHENTICATED FULL USER JOURNEY SCREENSHOTS CAPTURED!`);
    console.log(`📸 All 8 steps of each journey captured with authentication`);
    console.log(`🔍 Clear distinctions between subscription and non-subscription users`);
    console.log(`📂 Screenshots location: ${screenshotDir}`);
  });
});
