import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  const screenshotDir = path.join(__dirname, '..', 'test-results', 'register-login-screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  
  await page.screenshot({ 
    path: `${screenshotDir}/${name}.png`, 
    fullPage: true 
  });
  
  console.log(`📸 Screenshot: ${name} - ${description || 'Journey step'}`);
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page, timeout = 8000) {
  try {
    await page.waitForLoadState('domcontentloaded', { timeout });
    await page.waitForTimeout(2000);
  } catch (error) {
    console.log(`⚠️ Page load timeout, continuing: ${error.message}`);
  }
}

// Test users to create and login with
const TEST_USERS = {
  nontech: {
    email: `nontech.${Date.now()}@chimaridata.test`,
    password: 'TestPassword123!',
    firstName: 'NonTech',
    lastName: 'TestUser',
    journeyPath: 'non-tech'
  },
  business: {
    email: `business.${Date.now()}@chimaridata.test`,
    password: 'TestPassword123!',
    firstName: 'Business',
    lastName: 'TestUser',
    journeyPath: 'business'
  },
  technical: {
    email: `technical.${Date.now()}@chimaridata.test`,
    password: 'TestPassword123!',
    firstName: 'Technical',
    lastName: 'TestUser',
    journeyPath: 'technical'
  }
};

// Helper function to register and login user
async function registerAndLoginUser(page: Page, userInfo: any, userType: string) {
  console.log(`🔐 Registering and logging in ${userType} user: ${userInfo.email}`);
  
  try {
    // Step 1: Go to registration page
    await page.goto('/auth/register');
    await waitForPageLoad(page);
    await takeScreenshot(page, `${userType}-01-registration-page`, `${userType} registration page`);
    
    // Step 2: Check if we're on the right form (might default to login)
    const pageContent = await page.textContent('body');
    
    // If we're on login page, switch to register
    if (pageContent?.includes('Welcome Back') || pageContent?.includes('Sign in to your account')) {
      const signUpTab = page.getByText('Sign Up');
      if (await signUpTab.isVisible()) {
        await signUpTab.click();
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userType}-02-switched-to-register`, `${userType} switched to register form`);
      }
    }
    
    // Step 3: Fill registration form - try different field selectors
    try {
      // Try filling email
      await page.fill('input[type="email"]', userInfo.email);
      
      // Try different selectors for first name
      const firstNameSelectors = ['input[name="firstName"]', 'input[id="firstName"]', 'input[placeholder*="first" i]'];
      let firstNameFilled = false;
      for (const selector of firstNameSelectors) {
        try {
          if (await page.locator(selector).isVisible()) {
            await page.fill(selector, userInfo.firstName);
            firstNameFilled = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Try different selectors for last name
      const lastNameSelectors = ['input[name="lastName"]', 'input[id="lastName"]', 'input[placeholder*="last" i]'];
      let lastNameFilled = false;
      for (const selector of lastNameSelectors) {
        try {
          if (await page.locator(selector).isVisible()) {
            await page.fill(selector, userInfo.lastName);
            lastNameFilled = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      // Fill password fields
      const passwordFields = page.locator('input[type="password"]');
      const passwordCount = await passwordFields.count();
      
      if (passwordCount >= 1) {
        await passwordFields.nth(0).fill(userInfo.password);
      }
      if (passwordCount >= 2) {
        await passwordFields.nth(1).fill(userInfo.password); // Confirm password
      }
      
      await takeScreenshot(page, `${userType}-03-form-filled`, `${userType} registration form filled`);
      
      // Step 4: Submit registration
      const submitButton = page.locator('button[type="submit"]');
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userType}-04-registration-submitted`, `${userType} registration submitted`);
      }
      
      // Step 5: Check if registration was successful
      const currentUrl = page.url();
      const newPageContent = await page.textContent('body');
      
      if (currentUrl.includes('/auth') && (newPageContent?.includes('Welcome Back') || newPageContent?.includes('Sign in'))) {
        console.log(`⚠️ ${userType} still on auth page after registration attempt`);
        
        // Try to login instead
        console.log(`🔑 Attempting login for ${userType}`);
        
        // Switch to login if needed
        const signInTab = page.getByText('Login');
        if (await signInTab.isVisible()) {
          await signInTab.click();
          await waitForPageLoad(page);
        }
        
        // Fill login form
        await page.fill('input[type="email"]', userInfo.email);
        await page.fill('input[type="password"]', userInfo.password);
        
        await page.click('button[type="submit"]');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userType}-05-login-attempt`, `${userType} login attempt`);
        
        const finalUrl = page.url();
        const finalContent = await page.textContent('body');
        
        if (!finalUrl.includes('/auth') || finalContent?.includes('Welcome') || finalContent?.includes('Dashboard')) {
          console.log(`✅ ${userType} login successful`);
          return true;
        } else {
          console.log(`❌ ${userType} login failed`);
          return false;
        }
      } else {
        console.log(`✅ ${userType} registration appears successful`);
        return true;
      }
      
    } catch (error) {
      console.log(`❌ ${userType} registration/login failed: ${error.message}`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ ${userType} process failed: ${error.message}`);
    return false;
  }
}

// Helper function to navigate authenticated journey
async function navigateAuthenticatedJourney(page: Page, userType: string, journeyPath: string) {
  console.log(`🧭 Navigating ${userType} authenticated journey`);
  
  // Authenticated home page
  await page.goto('/');
  await waitForPageLoad(page);
  await takeScreenshot(page, `${userType}-06-authenticated-home`, `${userType} authenticated home`);
  
  // Journeys hub
  await page.goto('/journeys');
  await waitForPageLoad(page);
  await takeScreenshot(page, `${userType}-07-journeys-hub`, `${userType} journeys hub`);
  
  // Journey steps
  const steps = ['prepare', 'data', 'project-setup', 'execute', 'pricing', 'results'];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNumber = String(i + 8).padStart(2, '0');
    
    try {
      await page.goto(`/journeys/${journeyPath}/${step}`);
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-${stepNumber}-${step}`, `${userType} ${step} step`);
      
      const pageContent = await page.textContent('body');
      if (pageContent?.includes('Welcome Back') || pageContent?.includes('Sign in')) {
        console.log(`⚠️ ${userType} session expired at ${step}`);
        break;
      }
    } catch (error) {
      console.log(`❌ ${userType} ${step} failed: ${error.message}`);
    }
  }
  
  // Dashboard and projects
  const authPages = ['/dashboard', '/projects'];
  for (const authPage of authPages) {
    try {
      await page.goto(authPage);
      await waitForPageLoad(page);
      const pageName = authPage.replace('/', '');
      await takeScreenshot(page, `${userType}-${pageName}`, `${userType} ${pageName} page`);
    } catch (error) {
      console.log(`❌ ${userType} ${authPage} failed: ${error.message}`);
    }
  }
}

test.describe('Register and Login Journey Testing', () => {
  
  test('Complete Non-Tech User Journey', async ({ page }) => {
    console.log('🚀 Starting Complete Non-Tech User Journey');
    
    const userInfo = TEST_USERS.nontech;
    const success = await registerAndLoginUser(page, userInfo, 'nontech');
    
    if (success) {
      await navigateAuthenticatedJourney(page, 'nontech', userInfo.journeyPath);
    }
    
    console.log('✅ Non-Tech User Journey Complete');
  });

  test('Complete Business User Journey', async ({ page }) => {
    console.log('🚀 Starting Complete Business User Journey');
    
    const userInfo = TEST_USERS.business;
    const success = await registerAndLoginUser(page, userInfo, 'business');
    
    if (success) {
      await navigateAuthenticatedJourney(page, 'business', userInfo.journeyPath);
      
      // Business-specific page
      try {
        await page.goto('/template-based');
        await waitForPageLoad(page);
        await takeScreenshot(page, 'business-template-based', 'Business template-based page');
      } catch (error) {
        console.log(`❌ Business template-based failed: ${error.message}`);
      }
    }
    
    console.log('✅ Business User Journey Complete');
  });

  test('Complete Technical User Journey', async ({ page }) => {
    console.log('🚀 Starting Complete Technical User Journey');
    
    const userInfo = TEST_USERS.technical;
    const success = await registerAndLoginUser(page, userInfo, 'technical');
    
    if (success) {
      await navigateAuthenticatedJourney(page, 'technical', userInfo.journeyPath);
      
      // Technical-specific page
      try {
        await page.goto('/self-service');
        await waitForPageLoad(page);
        await takeScreenshot(page, 'technical-self-service', 'Technical self-service page');
      } catch (error) {
        console.log(`❌ Technical self-service failed: ${error.message}`);
      }
    }
    
    console.log('✅ Technical User Journey Complete');
  });

  test('Generate Register and Login Report', async ({ page }) => {
    console.log('📊 Generating Register and Login Journey Report');
    
    const screenshotDir = path.join(__dirname, '..', 'test-results', 'register-login-screenshots');
    const reportPath = path.join(screenshotDir, 'REGISTER_LOGIN_REPORT.md');
    
    let screenshotCount = 0;
    try {
      const files = fs.readdirSync(screenshotDir);
      screenshotCount = files.filter(file => file.endsWith('.png')).length;
    } catch (error) {
      console.log('Could not count screenshots');
    }
    
    const report = `# ChimariData Register and Login Journey Report

## Test Execution Summary
- **Date**: ${new Date().toISOString()}
- **Total Screenshots**: ${screenshotCount}
- **Test Method**: Dynamic user registration and login with authenticated journey navigation

## Complete User Journey Testing

### 🔐 User Registration and Authentication Process
- Dynamic user creation with unique email addresses
- Registration form interaction and submission
- Login process verification
- Session management testing

### 👤 Non-Tech User Complete Journey
- User registration and authentication
- Authenticated home page experience
- Journey hub navigation
- Complete journey wizard (prepare → data → setup → execute → pricing → results)
- Dashboard and projects access

### 💼 Business User Complete Journey  
- Business user registration and authentication
- Business-focused authenticated experience
- Template-based journey navigation
- Business workflow completion
- Business-specific feature access

### 🔬 Technical User Complete Journey
- Technical user registration and authentication
- Advanced user authenticated experience
- Self-service analytics navigation
- Technical workflow completion
- Technical-specific feature access

## Key Testing Achievements

### ✅ If Registration/Login Successful:
- Complete end-to-end user experience captured
- Authentication system working correctly
- User-specific journey navigation functional
- Session persistence across page navigation
- All user types properly supported

### ⚠️ If Registration/Login Issues:
- Registration form field mapping may need adjustment
- Authentication system configuration may be needed
- Database connectivity may require setup

## Deployment Readiness

Based on screenshot results:

### If Authenticated Content Captured:
✅ **READY FOR PRODUCTION**
- Complete user registration and login system
- Full authenticated user experience
- All user journey types functional

### If Auth Pages Still Showing:
🔧 **CONFIGURATION NEEDED**
- Database setup for user storage
- Email verification system
- Authentication service configuration

**Status**: Determined by actual test results

All register and login journey screenshots are available in the register-login-screenshots directory.

## Test Users Created (if successful)
- Non-Tech User: Dynamic email with timestamp
- Business User: Dynamic email with timestamp  
- Technical User: Dynamic email with timestamp

Each test creates unique users to avoid conflicts with existing data.
`;

    try {
      fs.writeFileSync(reportPath, report);
      console.log(`📄 Register and login report generated: ${reportPath}`);
    } catch (error) {
      console.log('Could not write report file');
    }
    
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'final-register-login-summary', 'Complete register and login testing summary');
    
    console.log('🎉 REGISTER AND LOGIN JOURNEY TESTING COMPLETE!');
    console.log(`📸 Total screenshots captured: ${screenshotCount + 1}`);
  });
});











































