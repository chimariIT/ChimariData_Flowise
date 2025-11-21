/**
 * Production Test Helpers
 * 
 * Utility functions for production-representative testing including:
 * - Test user management with actual credentials
 * - Screenshot capture with consistent naming
 * - Authentication helpers
 * - API interaction utilities
 */

import { Page, APIRequestContext } from '@playwright/test';
import { join } from 'path';
import { mkdirSync } from 'fs';

// Configuration
export const TEST_CONFIG = {
  // Client app runs on port 5173 (Vite dev server)
  // API runs on port 3000 (Express server)
  baseUrl: process.env.BASE_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  screenshotDir: 'test-results/production-journeys',
  timeout: {
    page: 10000,
    api: 30000,
    test: 120000
  }
};

// Test User Types
export interface ProductionTestUser {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'non-tech' | 'business' | 'technical' | 'consultation' | 'admin';
  subscriptionTier: 'none' | 'trial' | 'starter' | 'professional' | 'enterprise';
  isAdmin?: boolean;
}

/**
 * Create a production test user with unique credentials
 */
export function createProductionTestUser(
  role: ProductionTestUser['role'],
  tier: ProductionTestUser['subscriptionTier'] = 'professional'
): ProductionTestUser {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const roleNames = {
    'non-tech': { firstName: 'Sarah', lastName: 'Marketing' },
    'business': { firstName: 'Michael', lastName: 'Analytics' },
    'technical': { firstName: 'Alex', lastName: 'DataScience' },
    'consultation': { firstName: 'Emma', lastName: 'Strategy' },
    'admin': { firstName: 'Admin', lastName: 'User' }
  };
  
  const names = roleNames[role];
  
  // For admin users, use @chimaridata.com domain to ensure admin access
  const emailDomain = role === 'admin' ? 'chimaridata.com' : 'test.chimaridata.com';
  
  return {
    email: `${role}.prod.${timestamp}.${randomSuffix}@${emailDomain}`,
    password: 'SecureTest123!',
    firstName: names.firstName,
    lastName: names.lastName,
    role,
    subscriptionTier: tier,
    isAdmin: role === 'admin'
  };
}

/**
 * Register a new test user via API
 */
export async function registerProductionUser(
  request: APIRequestContext,
  user: ProductionTestUser
): Promise<{ token: string; userId: string; user: ProductionTestUser }> {
  try {
    console.log(`📝 Registering production test user: ${user.email} (${user.role})`);
    
    // Use API URL for backend endpoints
    const response = await request.post(`${TEST_CONFIG.apiUrl}/api/auth/register`, {
      data: {
        email: user.email,
        password: user.password,
        firstName: user.firstName,
        lastName: user.lastName
      },
      timeout: TEST_CONFIG.timeout.api
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Registration failed: ${response.status()} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.token || !data.user?.id) {
      throw new Error('Invalid response from registration endpoint');
    }

    console.log(`✅ User registered successfully: ${user.email} (ID: ${data.user.id})`);
    
    return {
      token: data.token,
      userId: data.user.id,
      user
    };
  } catch (error) {
    console.error(`❌ User registration failed for ${user.email}:`, error);
    throw error;
  }
}

/**
 * Login existing user via API
 */
export async function loginProductionUser(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<{ token: string; userId: string }> {
  try {
    console.log(`🔐 Logging in: ${email}`);
    
    // Use API URL for backend endpoints
    const response = await request.post(`${TEST_CONFIG.apiUrl}/api/auth/login`, {
      data: { email, password },
      timeout: TEST_CONFIG.timeout.api
    });

    if (!response.ok()) {
      const errorText = await response.text();
      throw new Error(`Login failed: ${response.status()} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.token || !data.user?.id) {
      throw new Error('Invalid response from login endpoint');
    }

    console.log(`✅ User logged in successfully: ${email} (ID: ${data.user.id})`);
    
    return {
      token: data.token,
      userId: data.user.id
    };
  } catch (error) {
    console.error(`❌ Login failed for ${email}:`, error);
    throw error;
  }
}

/**
 * Authenticate user in browser context
 */
export async function authenticateUserInBrowser(page: Page, token: string, user?: any): Promise<void> {
  await page.addInitScript(({ authToken, userData }) => {
    window.localStorage.setItem('auth_token', authToken);
    // Store user data for fast-path auth
    if (userData) {
      window.localStorage.setItem('user', JSON.stringify(userData));
    }
    
    // For admin users, mock the permissions API response
    if (userData?.role === 'admin') {
      // Mock the admin permissions endpoint
      const originalFetch = window.fetch;
      window.fetch = function(input, init) {
        if (typeof input === 'string' && input.includes('/api/admin/permissions')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              success: true,
              data: {
                role: { id: 'admin', name: 'Administrator' },
                permissions: ['read', 'write', 'admin']
              }
            })
          });
        }
        return originalFetch.apply(this, arguments);
      };
    }
  }, { authToken: token, userData: user });
  
  await page.setExtraHTTPHeaders({
    'Authorization': `Bearer ${token}`
  });
  
  console.log('✅ User authenticated in browser context');
}

/**
 * Take a screenshot with consistent naming and organization
 */
export async function captureProductionScreenshot(
  page: Page,
  category: string,
  name: string,
  description?: string
): Promise<string> {
  try {
    const categoryDir = join(TEST_CONFIG.screenshotDir, category);
    mkdirSync(categoryDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const filename = `${timestamp}_${sanitizedName}.png`;
    const filepath = join(categoryDir, filename);
    
    await page.screenshot({
      path: filepath,
      fullPage: true
    });
    
    const logMessage = description 
      ? `📸 Screenshot: ${category}/${filename} - ${description}`
      : `📸 Screenshot: ${category}/${filename}`;
    console.log(logMessage);
    
    return filepath;
  } catch (error) {
    console.error(`❌ Screenshot capture failed for ${category}/${name}:`, error);
    throw error;
  }
}

/**
 * Wait for page to load with comprehensive checks
 */
export async function waitForProductionPageLoad(
  page: Page,
  options: {
    timeout?: number;
    waitForNetworkIdle?: boolean;
    additionalSelectors?: string[];
  } = {}
): Promise<void> {
  const {
    timeout = TEST_CONFIG.timeout.page,
    waitForNetworkIdle = true,  // Changed default to true
    additionalSelectors = []
  } = options;
  
  try {
    // Wait for DOM content loaded
    await page.waitForLoadState('domcontentloaded', { timeout });
    
    // Always try to wait for network idle for better screenshots
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('⚠️  Network not idle after 10s, continuing...');
    });
    
    // Wait for body to be visible (ensures page has rendered)
    await page.waitForSelector('body', { state: 'visible', timeout: 5000 }).catch(() => {
      console.log('⚠️  Body not visible, continuing...');
    });
    
    // Wait for any React/Vue app to mount (common class patterns)
    const appSelectors = ['#root', '#app', '[data-testid="app"]', 'main', 'article'];
    let foundApp = false;
    for (const selector of appSelectors) {
      if (await page.locator(selector).isVisible({ timeout: 2000 }).catch(() => false)) {
        foundApp = true;
        console.log(`✅ App container found: ${selector}`);
        break;
      }
    }
    
    if (!foundApp) {
      console.log('⚠️  No app container found, page might not be fully rendered');
    }
    
    // Wait for additional selectors if specified
    for (const selector of additionalSelectors) {
      await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {
        console.log(`⚠️  Selector not found: ${selector}, continuing...`);
      });
    }
    
    // Give extra time for JS to execute and render
    await page.waitForTimeout(2000);  // Increased from 1000ms
    
    // Check if page has meaningful content
    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText && bodyText.trim().length > 100) {
      console.log(`✅ Page has content (${bodyText.trim().length} chars)`);
    } else {
      console.log(`⚠️  Page might be blank (only ${bodyText?.trim().length || 0} chars)`);
    }
  } catch (error) {
    console.log(`⚠️  Page load timeout (${timeout}ms), continuing anyway...`);
  }
}

/**
 * Navigate to a URL with retry logic
 */
export async function navigateToUrl(
  page: Page,
  path: string,
  options: {
    retries?: number;
    waitForSelectors?: string[];
  } = {}
): Promise<void> {
  const { retries = 3, waitForSelectors = [] } = options;
  const url = path.startsWith('http') ? path : `${TEST_CONFIG.baseUrl}${path}`;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🔗 Navigating to: ${url} (attempt ${attempt}/${retries})`);
      
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: TEST_CONFIG.timeout.page
      });
      
      await waitForProductionPageLoad(page, {
        additionalSelectors: waitForSelectors
      });
      
      console.log(`✅ Navigation successful: ${url}`);
      return;
    } catch (error) {
      if (attempt === retries) {
        console.error(`❌ Navigation failed after ${retries} attempts: ${url}`);
        throw error;
      }
      console.log(`⚠️  Navigation attempt ${attempt} failed, retrying...`);
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Fill form field with error handling
 */
export async function fillFormField(
  page: Page,
  selector: string,
  value: string,
  options: { timeout?: number } = {}
): Promise<boolean> {
  try {
    const element = page.locator(selector).first();
    
    if (await element.isVisible({ timeout: options.timeout || 5000 })) {
      await element.fill(value);
      console.log(`✅ Filled field ${selector}: ${value}`);
      return true;
    } else {
      console.log(`⚠️  Field not visible: ${selector}`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️  Could not fill field ${selector}:`, error);
    return false;
  }
}

/**
 * Click element with retry logic
 */
export async function clickElement(
  page: Page,
  selector: string,
  options: { timeout?: number; retries?: number } = {}
): Promise<boolean> {
  const { timeout = 5000, retries = 3 } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const element = page.locator(selector).first();
      
      if (await element.isVisible({ timeout })) {
        await element.click();
        console.log(`✅ Clicked: ${selector}`);
        return true;
      }
    } catch (error) {
      if (attempt === retries) {
        console.log(`⚠️  Could not click ${selector} after ${retries} attempts`);
        return false;
      }
      await page.waitForTimeout(1000);
    }
  }
  
  return false;
}

/**
 * Check if element exists and is visible
 */
export async function isElementVisible(
  page: Page,
  selector: string,
  timeout: number = 5000
): Promise<boolean> {
  try {
    const element = page.locator(selector).first();
    return await element.isVisible({ timeout });
  } catch {
    return false;
  }
}

/**
 * Wait for API response
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  timeout: number = 30000
): Promise<any> {
  try {
    const response = await page.waitForResponse(urlPattern, { timeout });
    const data = await response.json();
    console.log(`✅ API response received: ${typeof urlPattern === 'string' ? urlPattern : urlPattern.toString()}`);
    return data;
  } catch (error) {
    console.log(`⚠️  API response timeout: ${typeof urlPattern === 'string' ? urlPattern : urlPattern.toString()}`);
    throw error;
  }
}

/**
 * Upload file to input element
 */
export async function uploadFile(
  page: Page,
  fileSelector: string,
  filePath: string
): Promise<boolean> {
  try {
    const fileInput = page.locator(fileSelector).first();
    
    if (await fileInput.isVisible({ timeout: 5000 })) {
      await fileInput.setInputFiles(filePath);
      console.log(`✅ File uploaded: ${filePath}`);
      return true;
    } else {
      console.log(`⚠️  File input not visible: ${fileSelector}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ File upload failed:`, error);
    return false;
  }
}

/**
 * Execute journey workflow step
 */
export interface JourneyStep {
  path: string;
  name: string;
  action?: (page: Page) => Promise<void>;
  validateElements?: string[];
  skipScreenshot?: boolean;
}

export async function executeJourneyStep(
  page: Page,
  category: string,
  step: JourneyStep,
  stepNumber: number
): Promise<void> {
  const stepNum = String(stepNumber).padStart(2, '0');
  const stepName = step.name.replace(/\s+/g, '-').toLowerCase();
  
  console.log(`\n📍 Step ${stepNum}: ${step.name}`);
  
  try {
    // Navigate to step
    await navigateToUrl(page, step.path, {
      waitForSelectors: step.validateElements
    });
    
    // Take before screenshot
    if (!step.skipScreenshot) {
      await captureProductionScreenshot(
        page,
        category,
        `step-${stepNum}-${stepName}`,
        `${step.name} (before action)`
      );
    }
    
    // Execute step action
    if (step.action) {
      await step.action(page);
      await page.waitForTimeout(1000);
      
      // Take after screenshot
      if (!step.skipScreenshot) {
        await captureProductionScreenshot(
          page,
          category,
          `step-${stepNum}-${stepName}-after`,
          `${step.name} (after action)`
        );
      }
    }
    
    console.log(`✅ Step ${stepNum} completed: ${step.name}`);
  } catch (error) {
    console.error(`❌ Step ${stepNum} failed: ${step.name}`, error);
    
    // Take error screenshot
    await captureProductionScreenshot(
      page,
      category,
      `step-${stepNum}-${stepName}-error`,
      `Error: ${step.name}`
    ).catch(() => {});
    
    throw error;
  }
}

/**
 * Execute complete journey workflow
 */
export async function executeJourneyWorkflow(
  page: Page,
  category: string,
  steps: JourneyStep[]
): Promise<void> {
  console.log(`\n${'━'.repeat(60)}`);
  console.log(`🚀 Starting ${category.toUpperCase()} Journey`);
  console.log(`${'━'.repeat(60)}`);
  
  for (let i = 0; i < steps.length; i++) {
    await executeJourneyStep(page, category, steps[i], i + 1);
  }
  
  console.log(`\n✅ ${category.toUpperCase()} Journey Complete\n`);
}

/**
 * Generate test summary report
 */
export interface TestSummary {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  testDuration: number;
  screenshotCount: number;
  userJourneys: Record<string, string>;
  adminTests: Record<string, string>;
  agentToolTests: Record<string, string>;
}

export function createTestSummary(): TestSummary {
  return {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    testDuration: 0,
    screenshotCount: 0,
    userJourneys: {},
    adminTests: {},
    agentToolTests: {}
  };
}

export function logTestSummary(summary: TestSummary): void {
  console.log('\n' + '='.repeat(80));
  console.log('📊 PRODUCTION TEST SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n⏱️  Test Duration: ${Math.round(summary.testDuration / 1000)}s`);
  console.log(`✅ Passed: ${summary.passedTests}/${summary.totalTests}`);
  console.log(`❌ Failed: ${summary.failedTests}/${summary.totalTests}`);
  console.log(`📸 Screenshots: ${summary.screenshotCount}`);
  
  if (Object.keys(summary.userJourneys).length > 0) {
    console.log('\n👤 User Journeys:');
    Object.entries(summary.userJourneys).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }
  
  if (Object.keys(summary.adminTests).length > 0) {
    console.log('\n💰 Admin Tests:');
    Object.entries(summary.adminTests).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }
  
  if (Object.keys(summary.agentToolTests).length > 0) {
    console.log('\n🤖 Agent & Tool Tests:');
    Object.entries(summary.agentToolTests).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }
  
  console.log('\n' + '='.repeat(80));
}

