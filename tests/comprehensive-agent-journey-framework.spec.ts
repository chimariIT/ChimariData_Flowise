import { test, expect, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Comprehensive Agent Journey Framework Tests
 * 
 * Based on docs/COMPREHENSIVE_AGENT_JOURNEY_FRAMEWORK.md
 * Tests the complete end-to-end user journey with multi-agent orchestration,
 * adaptive handholding, template sourcing, and integrated billing.
 */

interface TestUser {
  email: string;
  password: string;
  subscriptionTier: 'trial' | 'starter' | 'professional' | 'enterprise';
  role: 'non-tech' | 'business' | 'technical' | 'consultation';
}

const testUsers: TestUser[] = [
  {
    email: 'test-trial-nontech@chimari.test',
    password: 'test123',
    subscriptionTier: 'trial',
    role: 'non-tech'
  },
  {
    email: 'test-starter-business@chimari.test', 
    password: 'test123',
    subscriptionTier: 'starter',
    role: 'business'
  },
  {
    email: 'test-professional-technical@chimari.test',
    password: 'test123', 
    subscriptionTier: 'professional',
    role: 'technical'
  },
  {
    email: 'test-enterprise-consultation@chimari.test',
    password: 'test123',
    subscriptionTier: 'enterprise', 
    role: 'consultation'
  }
];

async function loginUser(page: Page, user: TestUser) {
  console.log(`🔐 Logging in ${user.email} (${user.subscriptionTier})...`);
  
  await page.goto('/auth');
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', user.password);
  await page.click('button[type="submit"]');
  
  await page.waitForURL('/dashboard', { timeout: 10000 });
  console.log(`✅ Login successful for ${user.email}`);
}

async function waitForPageLoad(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
  await page.waitForTimeout(500);
}

test.describe('Comprehensive Agent Journey Framework', () => {
  
  for (const user of testUsers) {
    test.describe(`${user.subscriptionTier.toUpperCase()} ${user.role.toUpperCase()} User Journey`, () => {
      
      test.beforeEach(async ({ page }) => {
        await loginUser(page, user);
      });

      test('Phase 1: Requirements & Template Selection', async ({ page }) => {
        console.log('🎯 Phase 1: Requirements & Template Selection');
        
        // Step 1.1: Navigate to journey selection
        await page.goto('/journey-selection');
        await waitForPageLoad(page);
        
        // Verify role-appropriate journey options are presented
        const journeyCards = page.locator('[data-testid="journey-card"]');
        await expect(journeyCards).toHaveCount(4); // All journey types available
        
        // Select appropriate journey based on user role
        const targetJourney = user.role === 'non-tech' ? 'Non-Tech User Journey' :
                             user.role === 'business' ? 'Business User Journey' :
                             user.role === 'technical' ? 'Technical User Journey' :
                             'Expert Consultation Journey';
        
        await page.click(`text=${targetJourney}`);
        await waitForPageLoad(page);
        
        // Step 1.2: Goal Setting (role-adaptive)
        console.log('🎯 Step 1.2: Goal Setting');
        
        // Verify role-appropriate goal setting interface
        if (user.role === 'non-tech') {
          // Should see simplified wizard interface
          await expect(page.locator('text=What would you like to analyze?')).toBeVisible();
          await expect(page.locator('text=Step-by-step wizard')).toBeVisible();
        } else if (user.role === 'business') {
          // Should see business-focused options
          await expect(page.locator('text=Business Objectives')).toBeVisible();
          await expect(page.locator('text=ROI Analysis')).toBeVisible();
        } else if (user.role === 'technical') {
          // Should see technical options
          await expect(page.locator('text=Analysis Components')).toBeVisible();
          await expect(page.locator('text=Statistical Methods')).toBeVisible();
        } else {
          // Should see expert consultation options
          await expect(page.locator('text=Custom Methodology')).toBeVisible();
          await expect(page.locator('text=Peer Review')).toBeVisible();
        }
        
        // Fill in goals
        await page.fill('textarea[name="goals"]', `Test analysis goals for ${user.role} user`);
        await page.fill('input[name="industry"]', 'Technology');
        await page.fill('input[name="lineOfBusiness"]', 'SaaS');
        
        await page.click('button:has-text("Continue")');
        await waitForPageLoad(page);
        
        // Step 1.3: Template Sourcing & Presentation
        console.log('🎯 Step 1.3: Template Sourcing');
        
        // Verify template presentation with multi-source indicators
        await expect(page.locator('text=Analysis Templates')).toBeVisible();
        
        // Should see templates from different sources
        const systemTemplates = page.locator('[data-testid="template-source-system"]');
        const researchTemplates = page.locator('[data-testid="template-source-research"]');
        
        await expect(systemTemplates.first()).toBeVisible();
        
        // Each template should show:
        // - Source indicator (system/user/research)
        // - Match relevance score
        // - Why relevant explanation
        // - Expected outcomes
        // - Time estimate
        // - Cost breakdown
        const templateCard = systemTemplates.first();
        await expect(templateCard.locator('[data-testid="template-match-score"]')).toBeVisible();
        await expect(templateCard.locator('[data-testid="template-relevance"]')).toBeVisible();
        await expect(templateCard.locator('[data-testid="template-outcomes"]')).toBeVisible();
        await expect(templateCard.locator('[data-testid="template-cost"]')).toBeVisible();
        
        // Select a template
        await templateCard.click();
        await page.click('button:has-text("Select Template")');
        await waitForPageLoad(page);
        
        // CHECKPOINT 1: Template/Goals Approval
        console.log('✅ CHECKPOINT 1: Template/Goals Approval');
        
        // Verify template selection is confirmed
        await expect(page.locator('text=Template Selected')).toBeVisible();
        await expect(page.locator('text=Analysis Roadmap')).toBeVisible();
      });

      test('Phase 2: Analysis Roadmap Creation', async ({ page }) => {
        console.log('🎯 Phase 2: Analysis Roadmap Creation');
        
        // Navigate to roadmap creation (after template selection)
        await page.goto('/analysis-roadmap');
        await waitForPageLoad(page);
        
        // Step 2.1: Roadmap Artifact Mapping
        console.log('🎯 Step 2.1: Roadmap Artifact Mapping');
        
        // Verify artifact dependency graph is presented
        await expect(page.locator('[data-testid="artifact-graph"]')).toBeVisible();
        
        // Should see artifacts in dependency order:
        // - Data Preprocessing
        // - Exploratory Analysis  
        // - Statistical Tests
        // - ML Model Training
        // - Visualizations
        // - Final Report
        
        const artifacts = page.locator('[data-testid="artifact-item"]');
        await expect(artifacts).toHaveCount(6);
        
        // Each artifact should show:
        // - Artifact name and description
        // - Dependencies
        // - Business impact
        // - Cost breakdown
        const firstArtifact = artifacts.first();
        await expect(firstArtifact.locator('[data-testid="artifact-name"]')).toBeVisible();
        await expect(firstArtifact.locator('[data-testid="artifact-dependencies"]')).toBeVisible();
        await expect(firstArtifact.locator('[data-testid="artifact-cost"]')).toBeVisible();
        
        // Step 2.2: Cost Estimation & Billing Check
        console.log('🎯 Step 2.2: Cost Estimation');
        
        // Verify billing agent integration
        await expect(page.locator('[data-testid="billing-summary"]')).toBeVisible();
        
        // Should show:
        // - Total estimated cost
        // - Quota coverage
        // - Overage charges (if any)
        // - Subscription discounts applied
        const billingSummary = page.locator('[data-testid="billing-summary"]');
        await expect(billingSummary.locator('text=Estimated Cost')).toBeVisible();
        await expect(billingSummary.locator('text=Quota Coverage')).toBeVisible();
        
        // For trial users, should show upgrade prompts if overage
        if (user.subscriptionTier === 'trial') {
          const upgradePrompt = page.locator('[data-testid="upgrade-prompt"]');
          if (await upgradePrompt.isVisible()) {
            await expect(upgradePrompt.locator('text=Upgrade to')).toBeVisible();
          }
        }
        
        // CHECKPOINT 2: Roadmap Approval
        console.log('✅ CHECKPOINT 2: Roadmap Approval');
        
        // Verify roadmap approval interface
        await expect(page.locator('button:has-text("Approve Roadmap")')).toBeVisible();
        await expect(page.locator('button:has-text("Modify Scope")')).toBeVisible();
        
        await page.click('button:has-text("Approve Roadmap")');
        await waitForPageLoad(page);
      });

      test('Phase 3: Data Schema Definition & Validation', async ({ page }) => {
        console.log('🎯 Phase 3: Data Schema Definition & Validation');
        
        // Navigate to schema definition
        await page.goto('/data-schema');
        await waitForPageLoad(page);
        
        // Step 3.1: Required Schema Definition
        console.log('🎯 Step 3.1: Schema Definition');
        
        // Verify schema presentation (role-appropriate)
        if (user.role === 'non-tech') {
          // Should see business language
          await expect(page.locator('text=Customer Name or ID')).toBeVisible();
          await expect(page.locator('text=when they became a customer')).toBeVisible();
        } else if (user.role === 'technical') {
          // Should see technical schema
          await expect(page.locator('text=customer_id VARCHAR(50)')).toBeVisible();
          await expect(page.locator('text=signup_date DATE')).toBeVisible();
        } else {
          // Should see mixed presentation
          await expect(page.locator('[data-testid="schema-field"]')).toBeVisible();
        }
        
        // Should show:
        // - Required fields (must have)
        // - Optional fields (improves accuracy)
        // - Derived metrics (we calculate)
        // - Examples for each field
        await expect(page.locator('[data-testid="required-fields"]')).toBeVisible();
        await expect(page.locator('[data-testid="optional-fields"]')).toBeVisible();
        await expect(page.locator('[data-testid="derived-metrics"]')).toBeVisible();
        
        // Step 3.2: Schema Validation
        console.log('🎯 Step 3.2: Schema Validation');
        
        // Verify schema supports all roadmap artifacts
        await expect(page.locator('text=Schema Validation')).toBeVisible();
        await expect(page.locator('text=All artifacts supported')).toBeVisible();
        
        // CHECKPOINT 3: Schema Approval
        console.log('✅ CHECKPOINT 3: Schema Approval');
        
        await expect(page.locator('button:has-text("Approve Schema")')).toBeVisible();
        await page.click('button:has-text("Approve Schema")');
        await waitForPageLoad(page);
      });

      test('Phase 4: Data Upload & Transformation', async ({ page }) => {
        console.log('🎯 Phase 4: Data Upload & Transformation');
        
        // Navigate to data upload
        await page.goto('/data-upload');
        await waitForPageLoad(page);
        
        // Step 4.1: Data Source Selection
        console.log('🎯 Step 4.1: Data Source Selection');
        
        // Verify data source options
        await expect(page.locator('text=Upload CSV/Excel file')).toBeVisible();
        await expect(page.locator('text=Connect to database')).toBeVisible();
        await expect(page.locator('text=Link cloud storage')).toBeVisible();
        
        // Select file upload
        await page.click('button:has-text("Upload File")');
        
        // Step 4.2: Data Upload
        console.log('🎯 Step 4.2: Data Upload');
        
        // Upload test data file
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(path.join(__dirname, '../test-data/sample-customer-data.csv'));
        
        await page.click('button:has-text("Upload")');
        await waitForPageLoad(page);
        
        // Step 4.3: Billing Check
        console.log('🎯 Step 4.3: Billing Check');
        
        // Verify billing agent checks data volume
        await expect(page.locator('text=Data volume:')).toBeVisible();
        await expect(page.locator('text=Within quota')).toBeVisible();
        
        // Step 4.4: Data Quality Assessment
        console.log('🎯 Step 4.4: Data Quality Assessment');
        
        // Verify quality report
        await expect(page.locator('[data-testid="quality-report"]')).toBeVisible();
        await expect(page.locator('text=Completeness')).toBeVisible();
        await expect(page.locator('text=Validity')).toBeVisible();
        await expect(page.locator('text=Consistency')).toBeVisible();
        
        // Step 4.5: Transformation Plan
        console.log('🎯 Step 4.5: Transformation Plan');
        
        // Verify transformation steps (role-appropriate presentation)
        if (user.role === 'non-tech') {
          await expect(page.locator('text=Things We\'ll Fix')).toBeVisible();
          await expect(page.locator('text=We\'ll Calculate')).toBeVisible();
        } else {
          await expect(page.locator('[data-testid="transformation-steps"]')).toBeVisible();
        }
        
        // CHECKPOINT 4: Data Quality & Transformation Approval
        console.log('✅ CHECKPOINT 4: Data Quality & Transformation Approval');
        
        await expect(page.locator('button:has-text("Proceed")')).toBeVisible();
        await page.click('button:has-text("Proceed")');
        await waitForPageLoad(page);
      });

      test('Phase 5: Analysis Execution with Checkpoints', async ({ page }) => {
        console.log('🎯 Phase 5: Analysis Execution with Checkpoints');
        
        // Navigate to analysis execution
        await page.goto('/analysis-execution');
        await waitForPageLoad(page);
        
        // Step 5.1: Analysis Kickoff
        console.log('🎯 Step 5.1: Analysis Kickoff');
        
        // Verify all prerequisites met
        await expect(page.locator('text=✓ Roadmap approved')).toBeVisible();
        await expect(page.locator('text=✓ Schema validated')).toBeVisible();
        await expect(page.locator('text=✓ Data uploaded')).toBeVisible();
        
        // Step 5.2: Execute Artifacts in Dependency Order
        console.log('🎯 Step 5.2: Artifact Execution');
        
        // Verify artifact execution progress
        const progressTracker = page.locator('[data-testid="artifact-progress"]');
        await expect(progressTracker).toBeVisible();
        
        // Artifact 1: Data Preprocessing
        console.log('🎯 Artifact 1: Data Preprocessing');
        await expect(page.locator('text=Data Preprocessing')).toBeVisible();
        await expect(page.locator('text=Applying cleaning rules')).toBeVisible();
        
        // Wait for completion
        await page.waitForSelector('text=✓ Data preprocessing complete', { timeout: 30000 });
        
        // CHECKPOINT 5: Data Prep Validation
        console.log('✅ CHECKPOINT 5: Data Prep Validation');
        
        await expect(page.locator('text=Data quality metrics')).toBeVisible();
        await expect(page.locator('text=Your data is now analysis-ready')).toBeVisible();
        await page.click('button:has-text("Approve")');
        
        // Artifact 2: Exploratory Analysis
        console.log('🎯 Artifact 2: Exploratory Analysis');
        await page.waitForSelector('text=✓ Exploratory analysis complete', { timeout: 30000 });
        
        // CHECKPOINT 6: Pattern Review
        console.log('✅ CHECKPOINT 6: Pattern Review');
        
        // Verify findings presentation (role-appropriate)
        if (user.role === 'non-tech') {
          await expect(page.locator('text=Key Statistics')).toBeVisible();
          await expect(page.locator('text=We found that customers')).toBeVisible();
        } else {
          await expect(page.locator('[data-testid="statistical-results"]')).toBeVisible();
        }
        
        await page.click('button:has-text("Confirm patterns")');
        
        // Continue with remaining artifacts...
        // (Artifact 3: Statistical Analysis, Artifact 4: ML Model Training, etc.)
        
        // Artifact 5: ML Model Training (if applicable)
        if (user.subscriptionTier !== 'trial') {
          console.log('🎯 Artifact 4: ML Model Training');
          await page.waitForSelector('text=✓ Model training complete', { timeout: 60000 });
          
          // CHECKPOINT 8: Model Performance Review
          console.log('✅ CHECKPOINT 8: Model Performance Review');
          
          // Verify model metrics presentation
          await expect(page.locator('text=Model Performance')).toBeVisible();
          
          if (user.role === 'non-tech') {
            await expect(page.locator('text=How Accurate Is It?')).toBeVisible();
            await expect(page.locator('text=Why Are Customers Leaving?')).toBeVisible();
          } else {
            await expect(page.locator('[data-testid="model-metrics"]')).toBeVisible();
            await expect(page.locator('text=Classification Report')).toBeVisible();
          }
          
          await page.click('button:has-text("Approve model")');
        }
        
        // Artifact 6: Visualizations
        console.log('🎯 Artifact 6: Visualizations');
        await page.waitForSelector('text=✓ Visualizations complete', { timeout: 30000 });
        
        // Artifact 7: Insights & Recommendations
        console.log('🎯 Artifact 7: Insights & Recommendations');
        await page.waitForSelector('text=✓ Insights generated', { timeout: 30000 });
        
        // CHECKPOINT 10: Insights Validation
        console.log('✅ CHECKPOINT 10: Insights Validation');
        
        await expect(page.locator('text=Key Insights')).toBeVisible();
        await expect(page.locator('text=Recommendations')).toBeVisible();
        await page.click('button:has-text("Approve insights")');
      });

      test('Phase 6: Final Artifact Delivery', async ({ page }) => {
        console.log('🎯 Phase 6: Final Artifact Delivery');
        
        // Navigate to final delivery
        await page.goto('/analysis-results');
        await waitForPageLoad(page);
        
        // Step 6.1: Artifact Preparation (role-specific)
        console.log('🎯 Step 6.1: Artifact Preparation');
        
        // Verify role-specific deliverables
        if (user.role === 'non-tech') {
          await expect(page.locator('text=Executive Summary PDF')).toBeVisible();
          await expect(page.locator('text=PowerPoint presentation')).toBeVisible();
          await expect(page.locator('text=Interactive dashboard')).toBeVisible();
          await expect(page.locator('text=Action plan checklist')).toBeVisible();
        } else if (user.role === 'business') {
          await expect(page.locator('text=Business Intelligence Report')).toBeVisible();
          await expect(page.locator('text=Cost-benefit analysis')).toBeVisible();
        } else if (user.role === 'technical') {
          await expect(page.locator('text=Jupyter notebooks')).toBeVisible();
          await expect(page.locator('text=Python scripts')).toBeVisible();
          await expect(page.locator('text=Model artifacts')).toBeVisible();
        } else {
          await expect(page.locator('text=Comprehensive analysis report')).toBeVisible();
          await expect(page.locator('text=Peer-reviewed methodology')).toBeVisible();
        }
        
        // Step 6.2: Billing Finalization
        console.log('🎯 Step 6.2: Billing Finalization');
        
        // Verify billing summary
        await expect(page.locator('[data-testid="final-billing-summary"]')).toBeVisible();
        await expect(page.locator('text=Total Usage')).toBeVisible();
        await expect(page.locator('text=Subscription Credits')).toBeVisible();
        await expect(page.locator('text=Final Cost')).toBeVisible();
        
        // Step 6.3: Delivery Presentation
        console.log('🎯 Step 6.3: Delivery Presentation');
        
        // CHECKPOINT 11: Final Delivery
        console.log('✅ CHECKPOINT 11: Final Delivery');
        
        await expect(page.locator('text=Journey Recap')).toBeVisible();
        await expect(page.locator('text=Download Links')).toBeVisible();
        await expect(page.locator('text=Next Steps')).toBeVisible();
        
        // Verify download functionality
        const downloadButtons = page.locator('button:has-text("Download")');
        await expect(downloadButtons).toHaveCount(4); // Should have multiple deliverables
        
        // Test download (verify button is clickable)
        await downloadButtons.first().click();
        
        // Verify user actions available
        await expect(page.locator('button:has-text("Rate Experience")')).toBeVisible();
        await expect(page.locator('button:has-text("Start New Project")')).toBeVisible();
      });

      test('Agent Collaboration & Billing Integration', async ({ page }) => {
        console.log('🎯 Agent Collaboration & Billing Integration');
        
        // Test that billing agent is integrated at each step
        await page.goto('/journey-selection');
        await waitForPageLoad(page);
        
        // Verify billing eligibility checks are present
        await expect(page.locator('[data-testid="billing-status"]')).toBeVisible();
        
        // Test quota warnings for trial users
        if (user.subscriptionTier === 'trial') {
          await expect(page.locator('text=Quota Remaining')).toBeVisible();
          await expect(page.locator('text=Upgrade')).toBeVisible();
        }
        
        // Test subscription benefits display
        await expect(page.locator('text=Subscription Benefits')).toBeVisible();
        await expect(page.locator('text=Credits Applied')).toBeVisible();
        
        // Verify real-time billing updates
        const billingDisplay = page.locator('[data-testid="live-billing"]');
        await expect(billingDisplay).toBeVisible();
        
        // Test overage warnings
        if (user.subscriptionTier === 'trial') {
          // Should show warnings about potential overages
          const overageWarning = page.locator('[data-testid="overage-warning"]');
          if (await overageWarning.isVisible()) {
            await expect(overageWarning.locator('text=Additional charges')).toBeVisible();
          }
        }
      });
    });
  }

  test.describe('Template Sourcing System', () => {
    test('Multi-source template retrieval', async ({ page }) => {
      console.log('🎯 Testing Multi-source Template Retrieval');
      
      await loginUser(page, testUsers[0]); // Use trial user
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Non-Tech User Journey');
      await waitForPageLoad(page);
      
      // Test template sourcing from multiple sources
      await expect(page.locator('[data-testid="template-source-system"]')).toBeVisible();
      await expect(page.locator('[data-testid="template-source-research"]')).toBeVisible();
      
      // Verify template ranking and deduplication
      const templateCards = page.locator('[data-testid="template-card"]');
      await expect(templateCards).toHaveCount(3, { timeout: 10000 }); // Should have multiple templates
      
      // Verify each template shows:
      // - Source indicator
      // - Match score
      // - Relevance explanation
      // - Expected outcomes
      // - Cost estimate
      const firstTemplate = templateCards.first();
      await expect(firstTemplate.locator('[data-testid="source-indicator"]')).toBeVisible();
      await expect(firstTemplate.locator('[data-testid="match-score"]')).toBeVisible();
      await expect(firstTemplate.locator('[data-testid="relevance-explanation"]')).toBeVisible();
    });
  });

  test.describe('Billing System Integration', () => {
    test('Subscription tier enforcement', async ({ page }) => {
      console.log('🎯 Testing Subscription Tier Enforcement');
      
      // Test each subscription tier
      for (const user of testUsers) {
        await loginUser(page, user);
        await page.goto('/journey-selection');
        await waitForPageLoad(page);
        
        // Verify tier-specific features are available/restricted
        if (user.subscriptionTier === 'trial') {
          // Trial users should see upgrade prompts
          await expect(page.locator('text=Upgrade to unlock')).toBeVisible();
          
          // Some advanced features should be disabled
          const advancedFeatures = page.locator('[data-testid="advanced-feature"]');
          if (await advancedFeatures.count() > 0) {
            await expect(advancedFeatures.first().locator('[disabled]')).toBeVisible();
          }
        } else if (user.subscriptionTier === 'enterprise') {
          // Enterprise users should see all features
          await expect(page.locator('[data-testid="advanced-feature"]')).toBeVisible();
          await expect(page.locator('text=Enterprise Features')).toBeVisible();
        }
        
        // Verify billing display shows correct tier
        await expect(page.locator(`text=${user.subscriptionTier.toUpperCase()} Plan`)).toBeVisible();
        
        // Verify usage limits are displayed correctly
        const usageDisplay = page.locator('[data-testid="usage-limits"]');
        await expect(usageDisplay).toBeVisible();
        
        // Verify quota utilization
        const quotaBars = page.locator('[data-testid="quota-bar"]');
        await expect(quotaBars).toHaveCount(5); // 5 usage categories
      }
    });

    test('Overage billing calculations', async ({ page }) => {
      console.log('🎯 Testing Overage Billing Calculations');
      
      // Use trial user (most likely to hit overages)
      const user = testUsers[0];
      await loginUser(page, user);
      
      await page.goto('/journey-selection');
      await waitForPageLoad(page);
      
      await page.click('text=Non-Tech User Journey');
      await waitForPageLoad(page);
      
      // Select a high-resource template
      const highResourceTemplate = page.locator('[data-testid="template-card"]').last();
      await highResourceTemplate.click();
      await page.click('button:has-text("Select Template")');
      await waitForPageLoad(page);
      
      // Verify overage warnings are shown
      await expect(page.locator('[data-testid="overage-warning"]')).toBeVisible();
      await expect(page.locator('text=Additional charges apply')).toBeVisible();
      
      // Verify overage cost calculation
      const overageCost = page.locator('[data-testid="overage-cost"]');
      await expect(overageCost).toBeVisible();
      
      // Verify upgrade recommendations
      await expect(page.locator('text=Upgrade to')).toBeVisible();
      await expect(page.locator('text=to avoid overage charges')).toBeVisible();
    });
  });
});
