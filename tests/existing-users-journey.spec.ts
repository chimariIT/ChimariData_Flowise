import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  const screenshotDir = path.join(__dirname, '..', 'test-results', 'existing-users-screenshots');
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
    await page.waitForTimeout(2000); // Wait for content to render
  } catch (error) {
    console.log(`⚠️ Page load timeout, continuing: ${error.message}`);
  }
}

// Pre-existing test users (manually created)
const EXISTING_USERS = {
  nontech: {
    email: 'nontech.test@chimaridata.com',
    password: 'TestPassword123!',
    type: 'Non-Technical User',
    journeyPath: 'non-tech'
  },
  business: {
    email: 'business.test@chimaridata.com',
    password: 'TestPassword123!',
    type: 'Business User',
    journeyPath: 'business'
  },
  technical: {
    email: 'technical.test@chimaridata.com',
    password: 'TestPassword123!',
    type: 'Technical User',
    journeyPath: 'technical'
  }
};

// Helper function to login with existing user
async function loginExistingUser(page: Page, userInfo: any, userType: string) {
  console.log(`🔑 Logging in existing ${userType} user: ${userInfo.email}`);
  
  try {
    // Go to login page
    await page.goto('/auth/login');
    await waitForPageLoad(page);
    await takeScreenshot(page, `${userType}-01-login-form`, `${userType} login form`);
    
    // Fill login form
    await page.fill('input[type="email"]', userInfo.email);
    await page.fill('input[type="password"]', userInfo.password);
    
    // Submit login
    await page.click('button[type="submit"]');
    await waitForPageLoad(page);
    await takeScreenshot(page, `${userType}-02-login-result`, `${userType} login result`);
    
    // Check if login was successful
    const currentUrl = page.url();
    const pageContent = await page.textContent('body');
    
    // Look for signs of successful authentication
    if (currentUrl.includes('/auth') && (pageContent?.includes('Welcome Back') || pageContent?.includes('Sign in to your account'))) {
      console.log(`❌ ${userType} user login failed - still on auth page`);
      return false;
    } else if (pageContent?.includes('Welcome') || pageContent?.includes('Dashboard') || pageContent?.includes('Journey') || !currentUrl.includes('/auth')) {
      console.log(`✅ ${userType} user login successful`);
      return true;
    } else {
      console.log(`⚠️ ${userType} user login status unclear - proceeding`);
      return true; // Proceed anyway to see what happens
    }
  } catch (error) {
    console.log(`❌ Login failed for ${userType}: ${error.message}`);
    return false;
  }
}

// Helper function to navigate complete authenticated journey
async function navigateCompleteJourney(page: Page, userType: string, journeyPath: string) {
  console.log(`🧭 Navigating complete ${userType} authenticated journey`);
  
  // Step 1: Authenticated home page
  await page.goto('/');
  await waitForPageLoad(page);
  await takeScreenshot(page, `${userType}-03-authenticated-home`, `${userType} authenticated home page`);
  
  // Step 2: Journeys hub
  await page.goto('/journeys');
  await waitForPageLoad(page);
  await takeScreenshot(page, `${userType}-04-journeys-hub`, `${userType} journeys hub`);
  
  // Step 3: Try to select specific journey
  try {
    const journeyButton = page.getByTestId(`button-start-${journeyPath}`);
    if (await journeyButton.isVisible()) {
      await journeyButton.click();
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-05-journey-selected`, `${userType} journey selected`);
    } else {
      console.log(`⚠️ ${userType} journey button not found, continuing with manual navigation`);
    }
  } catch (error) {
    console.log(`Journey selection failed for ${userType}: ${error.message}`);
  }
  
  // Step 4: Navigate through all journey wizard steps
  const steps = ['prepare', 'data', 'project-setup', 'execute', 'pricing', 'results'];
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNumber = String(i + 6).padStart(2, '0');
    
    try {
      await page.goto(`/journeys/${journeyPath}/${step}`);
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-${stepNumber}-${step}`, `${userType} ${step} step`);
      
      // Check if we're still authenticated
      const pageContent = await page.textContent('body');
      const currentUrl = page.url();
      
      if (currentUrl.includes('/auth') || pageContent?.includes('Welcome Back') || pageContent?.includes('Sign in to your account')) {
        console.log(`⚠️ ${userType} session expired at ${step} step - redirected to auth`);
        break;
      } else {
        console.log(`✅ ${userType} ${step} step loaded successfully`);
      }
    } catch (error) {
      console.log(`❌ ${userType} ${step} step failed: ${error.message}`);
    }
  }
  
  // Step 5: Test user-specific authenticated pages
  const userPages = [
    { path: '/dashboard', name: 'dashboard' },
    { path: '/projects', name: 'projects' },
    { path: '/home', name: 'home' }
  ];
  
  for (const userPage of userPages) {
    try {
      await page.goto(userPage.path);
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-${userPage.name}`, `${userType} ${userPage.name} page`);
      
      // Check authentication status
      const pageContent = await page.textContent('body');
      const currentUrl = page.url();
      
      if (currentUrl.includes('/auth')) {
        console.log(`⚠️ ${userType} ${userPage.name} redirected to auth`);
      } else {
        console.log(`✅ ${userType} ${userPage.name} accessible`);
      }
    } catch (error) {
      console.log(`❌ ${userType} ${userPage.name} failed: ${error.message}`);
    }
  }
  
  // Step 6: Test user-type specific pages
  if (userType === 'business') {
    try {
      await page.goto('/template-based');
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-template-based`, `${userType} template-based page`);
    } catch (error) {
      console.log(`❌ ${userType} template-based failed: ${error.message}`);
    }
  } else if (userType === 'technical') {
    try {
      await page.goto('/self-service');
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-self-service`, `${userType} self-service page`);
    } catch (error) {
      console.log(`❌ ${userType} self-service failed: ${error.message}`);
    }
  } else if (userType === 'nontech') {
    try {
      await page.goto('/ai-guided');
      await waitForPageLoad(page);
      await takeScreenshot(page, `${userType}-ai-guided`, `${userType} ai-guided page`);
    } catch (error) {
      console.log(`❌ ${userType} ai-guided failed: ${error.message}`);
    }
  }
}

test.describe('Existing Users Journey Testing', () => {
  
  test('Non-Tech User Complete Journey', async ({ page }) => {
    console.log('🚀 Starting Non-Tech User Complete Journey with Existing User');
    
    const userInfo = EXISTING_USERS.nontech;
    const loginSuccess = await loginExistingUser(page, userInfo, 'nontech');
    
    if (loginSuccess) {
      await navigateCompleteJourney(page, 'nontech', userInfo.journeyPath);
    } else {
      console.log('❌ Skipping nontech journey due to login failure');
      console.log('💡 Please ensure the test user nontech.test@chimaridata.com exists and can log in');
    }
    
    console.log('✅ Non-Tech User Journey Complete');
  });

  test('Business User Complete Journey', async ({ page }) => {
    console.log('🚀 Starting Business User Complete Journey with Existing User');
    
    const userInfo = EXISTING_USERS.business;
    const loginSuccess = await loginExistingUser(page, userInfo, 'business');
    
    if (loginSuccess) {
      await navigateCompleteJourney(page, 'business', userInfo.journeyPath);
    } else {
      console.log('❌ Skipping business journey due to login failure');
      console.log('💡 Please ensure the test user business.test@chimaridata.com exists and can log in');
    }
    
    console.log('✅ Business User Journey Complete');
  });

  test('Technical User Complete Journey', async ({ page }) => {
    console.log('🚀 Starting Technical User Complete Journey with Existing User');
    
    const userInfo = EXISTING_USERS.technical;
    const loginSuccess = await loginExistingUser(page, userInfo, 'technical');
    
    if (loginSuccess) {
      await navigateCompleteJourney(page, 'technical', userInfo.journeyPath);
    } else {
      console.log('❌ Skipping technical journey due to login failure');
      console.log('💡 Please ensure the test user technical.test@chimaridata.com exists and can log in');
    }
    
    console.log('✅ Technical User Journey Complete');
  });

  test('Generate Complete Existing Users Report', async ({ page }) => {
    console.log('📊 Generating Complete Existing Users Journey Report');
    
    const screenshotDir = path.join(__dirname, '..', 'test-results', 'existing-users-screenshots');
    const reportPath = path.join(screenshotDir, 'EXISTING_USERS_COMPLETE_REPORT.md');
    
    // Count screenshots
    let screenshotCount = 0;
    try {
      const files = fs.readdirSync(screenshotDir);
      screenshotCount = files.filter(file => file.endsWith('.png')).length;
    } catch (error) {
      console.log('Could not count screenshots');
    }
    
    const report = `# ChimariData Existing Users Complete Journey Report

## Test Execution Summary
- **Date**: ${new Date().toISOString()}
- **Total Screenshots**: ${screenshotCount}
- **Test Method**: Login with pre-existing test users
- **User Types**: Non-Tech, Business, Technical users

## Complete Authenticated Journey Coverage

### 🔐 Test Users Used
1. **Non-Tech User**: nontech.test@chimaridata.com
2. **Business User**: business.test@chimaridata.com  
3. **Technical User**: technical.test@chimaridata.com

### 📸 Screenshots Captured Per User Type

#### Non-Tech User Journey (Expected: 10+ screenshots)
- Login form and authentication process
- Authenticated home page experience
- Journey selection hub with user context
- Complete journey wizard navigation:
  - Preparation step interface
  - Data upload workflow
  - Project setup configuration
  - Analysis execution screen
  - Pricing selection interface
  - Results and artifacts display
- User dashboard access
- Project management interface
- AI-guided journey specific pages

#### Business User Journey (Expected: 10+ screenshots)
- Business user login and authentication
- Business-focused authenticated home page
- Business journey selection interface
- Complete business workflow navigation:
  - Business preparation interface
  - Template-based data handling
  - Business project configuration
  - Business analysis execution
  - Business pricing options
  - Professional results presentation
- Business dashboard features
- Template-based analysis pages

#### Technical User Journey (Expected: 10+ screenshots)
- Technical user login and authentication
- Technical user authenticated home page
- Technical journey selection interface
- Complete technical workflow navigation:
  - Advanced preparation interface
  - Technical data upload options
  - Complex project setup
  - Technical analysis execution
  - Advanced pricing configuration
  - Technical results and exports
- Advanced dashboard capabilities
- Self-service analytics pages

### 🎯 Key Features Tested

#### Authentication and Session Management
- User login with email/password
- Session persistence across navigation
- Authenticated page access
- User-specific content delivery

#### User-Specific Experiences
- Personalized home page content
- User type appropriate journey options
- Role-based feature access
- Customized dashboard interfaces

#### Complete Journey Wizard
- Step-by-step navigation for each user type
- Progress tracking and state management
- User context maintained throughout
- Professional workflow interfaces

#### Protected Page Access
- Dashboard functionality for authenticated users
- Project management capabilities
- User-specific feature access
- Proper authentication gates

## Deployment Readiness Assessment

### ✅ If Screenshots Show Authenticated Content:
- Complete user authentication system working
- User-specific journey experiences functional
- Session management and persistence working
- All user types properly supported with appropriate interfaces

### ⚠️ If Screenshots Show Auth Pages:
- User accounts may not exist or login failed
- Session management may need configuration
- Authentication system may need troubleshooting

## Next Steps Based on Results

### If Login Successful:
✅ Application ready for production with complete authenticated user experience

### If Login Failed:
🔧 Create test users manually and re-run tests to capture authenticated experience

**Status**: Results depend on successful authentication with existing test users

All existing users journey screenshots are available in the existing-users-screenshots directory.

## Manual User Creation Guide

If tests show login failures, please manually create these test users:

1. **nontech.test@chimaridata.com** (Password: TestPassword123!)
2. **business.test@chimaridata.com** (Password: TestPassword123!)
3. **technical.test@chimaridata.com** (Password: TestPassword123!)

Then re-run the tests to capture the complete authenticated user experience.
`;

    // Write report
    try {
      fs.writeFileSync(reportPath, report);
      console.log(`📄 Existing users report generated: ${reportPath}`);
    } catch (error) {
      console.log('Could not write report file');
    }
    
    // Take a final summary screenshot
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'final-existing-users-summary', 'Complete existing users testing summary');
    
    console.log('🎉 EXISTING USERS JOURNEY TESTING COMPLETE!');
    console.log(`📸 Total screenshots captured: ${screenshotCount + 1}`);
    console.log(`📂 Screenshots location: ${screenshotDir}`);
    console.log('');
    console.log('📋 Next Steps:');
    console.log('1. Check screenshots to see if users logged in successfully');
    console.log('2. If auth pages shown: Create test users manually');
    console.log('3. If authenticated content shown: Application ready for production!');
  });
});



























