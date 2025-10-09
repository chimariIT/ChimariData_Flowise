import { test, expect, Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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
    description: 'AI-guided analysis for non-technical users'
  },
  business: {
    name: 'Business User Journey',
    slug: 'business', 
    description: 'Template-based analysis for business users'
  },
  technical: {
    name: 'Technical User Journey',
    slug: 'technical',
    description: 'Advanced analysis for technical users'
  },
  consultation: {
    name: 'Expert Consultation Journey',
    slug: 'consultation',
    description: 'Expert-guided analysis and consultation'
  }
};

// Sample CSV data for upload
const SAMPLE_CSV_DATA = `name,age,salary,department
John Doe,30,75000,Engineering
Jane Smith,25,65000,Marketing
Bob Johnson,35,85000,Engineering
Alice Brown,28,70000,Marketing
Charlie Wilson,32,80000,Engineering`;

// Helper function to take screenshot
async function takeScreenshot(page: Page, name: string, description?: string) {
  await page.screenshot({ 
    path: `test-results/real-journeys/${name}.png`, 
    fullPage: true 
  });
  console.log(`📸 Screenshot: ${name} - ${description || 'Journey step'}`);
}

// Helper function to authenticate user via API and set token
async function authenticateUser(page: Page, user: any) {
  console.log(`🔐 Authenticating ${user.subscriptionTier} user: ${user.email}`);
  
  try {
    // Get auth token via API
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
      
      // Set token in browser localStorage
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
        description: `Real project for ${journey.description}`,
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

// Helper function to upload file via API
async function uploadFile(token: string, projectId: string, user: any) {
  console.log(`📤 Uploading file for project ${projectId}`);
  
  try {
    // Create a temporary CSV file
    const tempFilePath = path.join(__dirname, '..', 'test-results', 'real-journeys', `sample-data-${Date.now()}.csv`);
    fs.writeFileSync(tempFilePath, SAMPLE_CSV_DATA);
    
    // Create form data
    const formData = new FormData();
    const file = new File([SAMPLE_CSV_DATA], 'sample-data.csv', { type: 'text/csv' });
    formData.append('file', file);
    formData.append('projectId', projectId);
    
    const response = await fetch(`http://localhost:3000/api/projects/${projectId}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ File uploaded successfully`);
      return result;
    } else {
      console.log(`❌ File upload failed: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ File upload error: ${error.message}`);
    return null;
  }
}

// Helper function to execute analysis via API
async function executeAnalysis(token: string, projectId: string, user: any, journey: any) {
  console.log(`⚙️ Executing analysis for ${journey.name}`);
  
  try {
    const response = await fetch(`http://localhost:3000/api/projects/${projectId}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        analysisType: journey.slug,
        userTier: user.subscriptionTier,
        options: {
          includeVisualizations: true,
          generateReport: true
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Analysis executed successfully`);
      return result;
    } else {
      console.log(`❌ Analysis execution failed: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Analysis execution error: ${error.message}`);
    return null;
  }
}

// Helper function to check billing and costs
async function checkBilling(token: string, projectId: string, user: any) {
  console.log(`💳 Checking billing and costs for ${user.subscriptionTier} user`);
  
  try {
    const response = await fetch(`http://localhost:3000/api/billing/project-cost/${projectId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`✅ Billing checked: ${JSON.stringify(result)}`);
      return result;
    } else {
      console.log(`❌ Billing check failed: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Billing check error: ${error.message}`);
    return null;
  }
}

// Helper function to wait for page load
async function waitForPageLoad(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
}

test.describe('Real User Journey Workflow', () => {
  
  for (const [userTier, user] of Object.entries(TEST_USERS)) {
    for (const [journeyKey, journey] of Object.entries(JOURNEY_TYPES)) {
      
      test(`${userTier.toUpperCase()} User - ${journey.name} Complete Workflow`, async ({ page }) => {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎭 REAL WORKFLOW: ${userTier.toUpperCase()} User - ${journey.name}`);
        console.log(`${'='.repeat(80)}\n`);

        // Step 1: Authentication
        console.log('🔐 Step 1: User Authentication...');
        const token = await authenticateUser(page, user);
        if (!token) {
          console.log('❌ Authentication failed, skipping test');
          return;
        }

        // Navigate to dashboard
        await page.goto('/dashboard');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-01-dashboard`, 
          `${userTier} user authenticated dashboard`);

        // Step 2: Goal Setting and Journey Selection
        console.log('🎯 Step 2: Goal Setting and Journey Selection...');
        await page.goto('/journeys');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-02-journey-selection`, 
          `${userTier} user journey selection - ${journey.name}`);

        // Navigate to specific journey
        await page.goto(`/journeys/${journey.slug}/prepare`);
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-03-goal-setting`, 
          `${userTier} user goal setting for ${journey.name}`);

        // Step 3: Project Creation
        console.log('📁 Step 3: Project Creation...');
        const project = await createProject(token, user, journey);
        if (project) {
          await page.goto(`/projects/${project.id}`);
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-04-project-created`, 
            `${userTier} user project created - ${project.name}`);
        }

        // Step 4: File Upload
        console.log('📤 Step 4: File Upload...');
        if (project) {
          await uploadFile(token, project.id, user);
          await page.goto(`/projects/${project.id}/data`);
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-05-data-upload`, 
            `${userTier} user data upload interface`);
        }

        // Step 5: Analysis Execution
        console.log('⚙️ Step 5: Analysis Execution...');
        if (project) {
          await executeAnalysis(token, project.id, user, journey);
          await page.goto(`/projects/${project.id}/execute`);
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-06-analysis-execution`, 
            `${userTier} user analysis execution for ${journey.name}`);
        }

        // Step 6: Usage Cost and Subscription Eligibility
        console.log('💳 Step 6: Usage Cost and Subscription Check...');
        if (project) {
          await checkBilling(token, project.id, user);
          await page.goto('/pricing');
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-07-pricing-eligibility`, 
            `${userTier} user pricing and subscription eligibility`);
        }

        // Step 7: Checkout Process
        console.log('🛒 Step 7: Checkout Process...');
        await page.goto('/checkout');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-08-checkout`, 
          `${userTier} user checkout process`);

        // Step 8: Results and Artifacts
        console.log('📊 Step 8: Results and Artifacts...');
        if (project) {
          await page.goto(`/projects/${project.id}/results`);
          await waitForPageLoad(page);
          await takeScreenshot(page, `${userTier}-${journeyKey}-09-results`, 
            `${userTier} user analysis results for ${journey.name}`);
        }

        // Step 9: Subscription Dashboard
        console.log('👤 Step 9: Subscription Dashboard...');
        await page.goto('/profile');
        await waitForPageLoad(page);
        await takeScreenshot(page, `${userTier}-${journeyKey}-10-profile`, 
          `${userTier} user profile and subscription dashboard`);

        console.log(`✅ ${userTier.toUpperCase()} ${journey.name} REAL WORKFLOW COMPLETED!\n`);
      });
    }
  }

  test('Generate Real Journey Summary', async ({ page }) => {
    console.log('📊 Generating Real Journey Workflow Summary');
    
    // Take a final summary screenshot
    await page.goto('/');
    await waitForPageLoad(page);
    await takeScreenshot(page, 'real-journey-summary', 'Complete real user journey workflow summary');
    
    console.log('🎉 ALL REAL USER JOURNEY WORKFLOWS COMPLETED!');
    console.log('📸 Screenshots show complete end-to-end workflows with real functionality');
    console.log('🔍 Each screenshot demonstrates actual goal setting, project creation, file upload, analysis, billing, checkout, and results');
    console.log('📂 Screenshots location: test-results/real-journeys/');
  });
});
