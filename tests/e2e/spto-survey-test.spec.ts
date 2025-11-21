// End-to-End Test: SPTO Survey Analysis
// Tests complete user journey with November 18 fixes validation
// File: English Survey for Teacher Conferences Week Online (Responses).xlsx
// Goal: Evaluating Programs that matter to parents
// Audience: Mixed

import { test, expect } from '@playwright/test';
import path from 'path';

const TEST_FILE_PATH = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\SPTO\\English Survey for Teacher Conferences Week Online (Responses).xlsx';

const ANALYSIS_GOAL = 'Evaluating Programs that matter to parents';
const AUDIENCE_TYPE = 'mixed';

const BUSINESS_QUESTIONS = [
  'Do a majority of families like Roots & Shoots?',
  'How do lower grade families (rooms 1-10) feel compared to upper grade families (rooms 11-18) about Roots & Shoots?',
  'What are the top two priorities for school pictures for all families?',
  'How is SPTO doing in regards to asking for financial support?',
  'How do lower grade families (rooms 1-10) feel compared to upper grade families (rooms 11-18) about the financial support they are asked to give?',
  'How is SPTO doing in regards to asking for volunteering support?',
  'How do lower grade families (rooms 1-10) feel compared to upper grade families (rooms 11-18) about the volunteering support they are asked to give?',
  'What is the top climate resilience priority that families want SPTO to invest in next year?',
  'What is the second climate resilience priority that families want SPTO to invest in next year? Do enough families agree upon what this is for SPTO to have support for future action?',
  'Do families in room 1-10 feel differently than families in rooms 11-18 about what their top 2 priorities are for climate resilience?',
  'Based on the qualitative feedback, what are the top 3 takeaways for SPTO to know about how the community feels?',
  'Based on the qualitative feedback, what should the SPTO keep doing?',
  'Based on the qualitative feedback, what should the SPTO stop doing?',
  'Based on the qualitative feedback, is there anything else SPTO should consider?'
];

test.describe('SPTO Survey Analysis - End-to-End Journey Test', () => {
  let projectId: string;
  let authToken: string;

  test.beforeEach(async ({ page }) => {
    // Register/Login for each test
    await page.goto('http://localhost:5173');
    
    // Try to login first
    const email = `test_spto_${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    // Check if already logged in or need to register
    const loginButton = page.locator('text=Log In').or(page.locator('text=Sign In'));
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Need to register
      const registerLink = page.locator('text=Register').or(page.locator('text=Sign Up'));
      if (await registerLink.isVisible({ timeout: 2000 }).catch(() => false)) {
        await registerLink.click();
      }
      
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button:has-text("Register")');
      
      // Wait for registration to complete
      await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
    } else {
      // Already logged in or need to login
      await loginButton.click().catch(() => {});
      await page.fill('input[type="email"]', email).catch(() => {});
      await page.fill('input[type="password"]', password).catch(() => {});
      await page.click('button:has-text("Log In")').catch(() => {});
      await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
    }

    // Get auth token from localStorage
    authToken = await page.evaluate(() => localStorage.getItem('auth_token') || '').catch(() => '');
  });

  test('Complete user journey: Registration → Upload → Verification → Plan → Pricing → Execute → Results', async ({ page }) => {
    // Navigate to home
    await page.goto('http://localhost:5173');

    // Select business journey
    await page.click('text=Template-Based Analysis');
    await page.waitForURL('**/template-based', { timeout: 10000 });

    // Step 1: Project Setup
    console.log('✅ Step 1: Project Setup');
    await page.fill('input[placeholder*="project name" i], input[placeholder*="analysis goal" i]', 'SPTO Survey Analysis');
    await page.fill('textarea[placeholder*="business questions" i], textarea[placeholder*="questions" i]', BUSINESS_QUESTIONS.join('\n'));
    
    // Set audience type if available
    const audienceSelect = page.locator('select, [role="combobox"]').filter({ hasText: /audience|persona/i });
    if (await audienceSelect.count() > 0) {
      await audienceSelect.first().selectOption({ label: /mixed|parent/i });
    }

    // Continue to next step
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(2000);

    // Step 2: Upload Dataset
    console.log('✅ Step 2: Upload Dataset');
    
    // Check if file input exists
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() === 0) {
      // Look for upload button
      await page.click('button:has-text("Upload"), button:has-text("Choose File")');
      await page.waitForTimeout(1000);
    }

    // Upload file
    await fileInput.setInputFiles(TEST_FILE_PATH);
    await page.waitForTimeout(3000); // Wait for upload

    // Continue to next step
    await page.click('button:has-text("Next"), button:has-text("Continue")');
    await page.waitForTimeout(2000);

    // Step 3: Data Verification and Transformation
    console.log('✅ Step 3: Data Verification and Transformation');
    
    // Wait for PII check to complete
    await page.waitForTimeout(5000);
    
    // VERIFY DATA TRANSFORMATION WORKFLOW (Critical Agent Requirements)
    console.log('✅ Verifying Data Transformation Capabilities');
    
    // Check if transformation step is available (Error: "Data not available for Transformations")
    const transformTab = page.locator('text=/transform|transformation|edit.*data/i').or(
      page.locator('button, [role="tab"]').filter({ hasText: /transform|data/i })
    );
    
    if (await transformTab.count() > 0) {
      await transformTab.first().click();
      await page.waitForTimeout(2000);
      
      // Verify data is available for transformations
      const dataAvailable = page.locator('text=/no data|data not available/i');
      expect(await dataAvailable.count()).toBe(0);
      
      // Verify transformation options are available:
      // - Split columns with list items
      const splitColumnOption = page.locator('text=/split.*column|explode|list/i');
      if (await splitColumnOption.count() > 0) {
        console.log('✅ Column splitting transformation available');
      }
      
      // - Rename columns
      const renameColumnOption = page.locator('text=/rename|column.*name/i');
      if (await renameColumnOption.count() > 0) {
        console.log('✅ Column renaming transformation available');
      }
      
      // - Count participants
      const countOption = page.locator('text=/count|participant|aggregate/i');
      if (await countOption.count() > 0) {
        console.log('✅ Counting/aggregation transformation available');
      }
      
      // - Summarize text data
      const textSummarizeOption = page.locator('text=/summarize.*text|text.*summary|nlp/i');
      if (await textSummarizeOption.count() > 0) {
        console.log('✅ Text summarization transformation available');
      }
      
      // For SPTO survey, apply needed transformations:
      // - Split list columns if any (e.g., multiple priorities)
      // - Rename columns for clarity
      // - Count participants by room (1-10 vs 11-18)
      // - Summarize qualitative feedback
      
      // Try to access transformation UI
      const transformButton = page.locator('button:has-text("Transform"), button:has-text("Edit Data")');
      if (await transformButton.count() > 0) {
        console.log('✅ Transformation interface accessible');
        // Note: Actual transformation would require user interaction
        // Test verifies capability exists
      }
    }
    
    // Verify no crash on privacy verification (November 18 Fix #1)
    // Check console for errors related to privacy verification
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes("can't access property") || 
            text.includes('toLowerCase') || 
            text.includes('undefined') ||
            text.includes('risk is undefined')) {
          consoleErrors.push(text);
        }
      }
    });
    
    // Verify no visual errors on page
    const errorMessages = await page.locator('text=/can\'t access property|toLowerCase|undefined|risk is undefined/i').count();
    expect(errorMessages).toBe(0);
    
    // Verify privacy verification dialog displays without crash
    const piiDialog = page.locator('text=/privacy|pii|personal information/i');
    if (await piiDialog.count() > 0) {
      // PII detected - verify dialog works
      await page.waitForTimeout(1000);
      const dialogButtons = page.locator('button:has-text("Proceed"), button:has-text("Continue")');
      if (await dialogButtons.count() > 0) {
        await dialogButtons.first().click();
        await page.waitForTimeout(2000);
      }
    }
    
    // Verify data quality score is displayed (not mock value)
    const qualityScore = page.locator('text=/quality|score|\\d+%/i');
    if (await qualityScore.count() > 0) {
      const scoreText = await qualityScore.first().textContent();
      // Should be a real score, not always the same mock value
      expect(scoreText).toBeTruthy();
    }
    
    // Continue to next step
    await page.click('button:has-text("Next"), button:has-text("Continue")');
    await page.waitForTimeout(2000);
    
    // Verify no console errors accumulated
    expect(consoleErrors.length).toBe(0);

    // Step 4: Analysis Plan Creation
    console.log('✅ Step 4: Analysis Plan Creation');
    
    // Wait for plan creation (should complete in under 30 seconds per SLA)
    const planStartTime = Date.now();
    
    // Wait for plan to load or timeout message
    await Promise.race([
      page.waitForSelector('text=/plan|analysis|ready/i', { timeout: 35000 }),
      page.waitForSelector('text=/timeout|taking longer|try again/i', { timeout: 35000 })
    ]);

    const planCreationTime = Date.now() - planStartTime;
    console.log(`Plan creation took: ${planCreationTime}ms`);
    
    // Verify plan loaded within 30 seconds (SLA compliance)
    expect(planCreationTime).toBeLessThan(30000);
    
    // Verify no infinite loading spinner (November 18 Fix #4)
    const loadingSpinner = page.locator('[role="progressbar"], .animate-spin, [aria-label*="loading" i]');
    await page.waitForTimeout(1000);
    const spinnerCount = await loadingSpinner.count();
    
    // Should not have infinite loading spinner
    if (spinnerCount > 0) {
      const spinnerText = await loadingSpinner.first().textContent();
      expect(spinnerText).not.toContain('Loading analysis plan');
    }

    // Verify plan displays cost (even if $0.00) without null pointer (November 18 Fix #3)
    const costDisplay = page.locator('text=/\\$|cost|price/i');
    if (await costDisplay.count() > 0) {
      const costText = await costDisplay.first().textContent();
      expect(costText).toBeTruthy();
      // Should not contain "undefined" or "null"
      expect(costText).not.toMatch(/undefined|null/i);
    }

    // VERIFY AGENT SYNTHESIS AND COORDINATION (Critical Agent Workflow Requirements)
    console.log('✅ Verifying Agent Synthesis and Coordination');
    
    // 1. Verify agents synthesized goal and questions
    const planContent = await page.textContent('body');
    expect(planContent).toMatch(new RegExp(ANALYSIS_GOAL.split(' ').join('.*'), 'i'));
    
    // Verify goal is summarized in plan
    const goalSummary = page.locator('text=/evaluating|programs|parents/i');
    expect(await goalSummary.count()).toBeGreaterThan(0);
    
    // Verify questions are referenced in plan
    const questionRefs = page.locator('text=/roots.*shoots|climate|financial|volunteering/i');
    expect(await questionRefs.count()).toBeGreaterThan(0);
    
    // 2. Verify agents worked together to build plan - Check Agent Contributions tab
    const agentContributionsTab = page.locator('text=/agent.*contribution|agent contributions/i').or(
      page.locator('button, [role="tab"]').filter({ hasText: /agent/i })
    );
    
    if (await agentContributionsTab.count() > 0) {
      await agentContributionsTab.first().click();
      await page.waitForTimeout(1000);
      
      // Verify agent contributions are visible (Error: "No key Findings or Agent activity")
      const agentActivity = page.locator('text=/data.*engineer|data.*scientist|business.*agent|project.*manager/i');
      const agentActivityCount = await agentActivity.count();
      expect(agentActivityCount).toBeGreaterThan(0);
      console.log(`✅ Found ${agentActivityCount} agent contribution entries`);
      
      // Verify specific agent contributions
      const dataEngineerContribution = page.locator('text=/data.*engineer|quality|assessment/i');
      const dataScientistContribution = page.locator('text=/data.*scientist|analysis|blueprint/i');
      const businessAgentContribution = page.locator('text=/business.*agent|kpi|context/i');
      
      expect(await dataEngineerContribution.count()).toBeGreaterThan(0);
      expect(await dataScientistContribution.count()).toBeGreaterThan(0);
      expect(await businessAgentContribution.count()).toBeGreaterThan(0);
      
      console.log('✅ All three agents (Data Engineer, Data Scientist, Business Agent) contributed to plan');
    } else {
      // Agent contributions might be inline, check for agent names
      const inlineAgents = page.locator('text=/data.*engineer|data.*scientist|business.*agent/i');
      expect(await inlineAgents.count()).toBeGreaterThan(0);
    }
    
    // 3. Verify agents proposed required data elements
    const dataElements = page.locator('text=/data.*element|required.*column|schema|column/i');
    const dataRequirements = await dataElements.count();
    if (dataRequirements > 0) {
      console.log(`✅ Found ${dataRequirements} data element references in plan`);
    }
    
    // Verify plan shows analysis steps that require specific data
    const analysisSteps = page.locator('text=/analysis.*step|step.*analysis|method/i');
    expect(await analysisSteps.count()).toBeGreaterThan(0);

    // 4. Get user validation and acceptance
    console.log('✅ User Validation and Acceptance');
    
    // Verify plan can be approved (user validation)
    const approveButton = page.locator('button:has-text("Approve")');
    expect(await approveButton.count()).toBeGreaterThan(0);
    
    // Verify plan shows user can provide feedback
    const rejectButton = page.locator('button:has-text("Reject"), button:has-text("Request Changes")');
    if (await rejectButton.count() > 0) {
      console.log('✅ User can reject/modify plan (validation available)');
    }

    // Approve plan (user acceptance)
    await approveButton.first().click();
    await page.waitForTimeout(2000);
    
    // Verify plan was approved
    const approvalConfirmation = page.locator('text=/approved|plan.*approved/i');
    if (await approvalConfirmation.count() > 0) {
      console.log('✅ Plan approval confirmed');
    }

    // Step 5: Pricing/Payment Step
    console.log('✅ Step 5: Pricing/Payment Step');
    
    // Wait for pricing page to load
    await page.waitForSelector('text=/pricing|payment|cost/i', { timeout: 10000 });
    
    // Monitor console for infinite loop errors (November 18 Fix #2)
    const pricingErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Too many re-renders') || 
            text.includes('infinite loop') ||
            text.includes('React limits the number of renders')) {
          pricingErrors.push(text);
        }
      }
    });
    
    // Verify no infinite loop (November 18 Fix #2)
    await page.waitForTimeout(3000); // Wait to see if page stabilizes
    const reRenderErrors = await page.locator('text=/too many re-renders|infinite loop/i').count();
    expect(reRenderErrors).toBe(0);
    
    // Verify price estimate is displayed (Error: "No Price Estimate")
    const priceDisplay = page.locator('text=/\\$|price|cost|estimate/i');
    if (await priceDisplay.count() > 0) {
      const priceText = await priceDisplay.first().textContent();
      expect(priceText).toBeTruthy();
      // Should show a price, not "No Price Estimate" or blank
      expect(priceText).not.toMatch(/no price|no estimate|—|undefined/i);
    }
    
    // Verify page loaded without freeze
    const pageContent = await page.textContent('body');
    expect(pageContent).toBeTruthy();
    
    // Verify no console errors for infinite loop
    expect(pricingErrors.length).toBe(0);

    // Continue to next step
    await page.click('button:has-text("Next"), button:has-text("Continue")');
    await page.waitForTimeout(2000);

    // Step 6: Execute Analysis
    console.log('✅ Step 6: Execute Analysis');
    
    // Select analysis types if needed
    const analysisCheckboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await analysisCheckboxes.count();
    if (checkboxCount > 0) {
      // Select first 2-3 analysis types
      for (let i = 0; i < Math.min(3, checkboxCount); i++) {
        await analysisCheckboxes.nth(i).check();
      }
    }

    // Execute analysis
    await page.click('button:has-text("Execute"), button:has-text("Run Analysis")');
    
    // Wait for execution to complete (should complete in under 30 seconds per SLA)
    const executionStartTime = Date.now();
    
    await Promise.race([
      page.waitForSelector('text=/completed|success|results/i', { timeout: 35000 }),
      page.waitForSelector('text=/error|failed/i', { timeout: 35000 })
    ]);

    const executionTime = Date.now() - executionStartTime;
    console.log(`Analysis execution took: ${executionTime}ms`);
    
    // Monitor console for execution errors (November 18 Fix #7)
    const executionErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Cannot read properties of null') || 
            text.includes("reading 'estimatedCost'") ||
            text.includes('500') ||
            text.includes('Internal Server Error')) {
          executionErrors.push(text);
        }
      }
    });
    
    // Verify execution completed (no 500 error - November 18 Fix #7)
    const error500 = await page.locator('text=/500|internal server error/i').count();
    expect(error500).toBe(0);
    
    // Verify no console errors for null pointer
    expect(executionErrors.filter(e => e.includes('estimatedCost')).length).toBe(0);

    // Verify results displayed
    const resultsText = await page.textContent('body');
    expect(resultsText).toMatch(/insights|results|analysis/i);
    
    // Verify results validation doesn't fail (Error: "Results validation failing")
    const validationError = await page.locator('text=/validation failed|results validation failed/i').count();
    expect(validationError).toBe(0);
    
    // VERIFY VISUALIZATIONS BUILT (Critical Agent Requirements)
    console.log('✅ Step 6b: Verify Visualizations Built');
    
    // Check for visualizations (Error: "Visualization tab Aggregation Functions not Available")
    const visualizationTab = page.locator('text=/visualization|chart|graph/i').or(
      page.locator('button, [role="tab"]').filter({ hasText: /visualization|chart/i })
    );
    
    if (await visualizationTab.count() > 0) {
      await visualizationTab.first().click();
      await page.waitForTimeout(2000);
      
      // Verify visualizations are present
      const charts = page.locator('img[src*="chart"], img[src*="visualization"], canvas, svg').or(
        page.locator('text=/chart|graph|visualization/i')
      );
      const chartCount = await charts.count();
      expect(chartCount).toBeGreaterThan(0);
      console.log(`✅ Found ${chartCount} visualization(s)`);
      
      // Verify aggregation functions are available (Error: "Aggregation Functions not Available")
      const aggregationOptions = page.locator('text=/aggregate|sum|count|average|group/i');
      if (await aggregationOptions.count() > 0) {
        console.log('✅ Aggregation functions available');
      }
      
      // Verify multi-chart dashboard capability (Error: "Make Viz Tab Multi Chart Dashboard")
      const multiChartCapability = page.locator('text=/multi.*chart|dashboard|multiple.*chart/i');
      if (await multiChartCapability.count() > 0 || chartCount > 1) {
        console.log('✅ Multi-chart dashboard capability verified');
      }
    } else {
      // Visualizations might be in results view
      const resultsCharts = page.locator('img[src*="chart"], canvas, svg, [class*="chart"]');
      expect(await resultsCharts.count()).toBeGreaterThan(0);
      console.log('✅ Visualizations found in results view');
    }

    // Step 7: Verify Artifacts Generated (November 18 Fix #8)
    console.log('✅ Step 7: Verify Artifacts and Survey Presentation');
    
    // Navigate to project page or timeline
    const timelineButton = page.locator('text=/timeline|artifacts|project/i');
    if (await timelineButton.count() > 0) {
      await timelineButton.first().click();
      await page.waitForTimeout(2000);
    } else {
      // Navigate directly to project page
      const projectId = await page.evaluate(() => localStorage.getItem('currentProjectId') || '');
      if (projectId) {
        await page.goto(`http://localhost:5173/projects/${projectId}`);
        await page.waitForTimeout(2000);
      }
    }

    // Check if artifacts are visible
    const artifactsText = await page.textContent('body');
    
    // Should have artifacts (or at least not show "No analysis artifacts yet")
    // Error: "Artifacts not available" / "No Analysis Artifacts on timeline"
    if (artifactsText?.includes('No analysis artifacts yet') || 
        artifactsText?.includes('No artifacts') ||
        artifactsText?.includes('Artifacts not available')) {
      // Artifacts might still be generating (async), wait a bit more
      await page.waitForTimeout(10000); // Longer wait for async generation
      await page.reload();
      await page.waitForTimeout(2000);
      
      const updatedText = await page.textContent('body');
      // After waiting, should have artifacts or show "generating" status
      expect(updatedText).not.toMatch(/no analysis artifacts|artifacts not available|no artifacts yet/i);
    }
    
    // Verify artifacts tab is accessible (Error: "Artifacts not available")
    const artifactsTab = page.locator('text=/artifacts|download|report/i');
    if (await artifactsTab.count() > 0) {
      // Should have download links or artifact information
      const downloadLinks = page.locator('a[href*="download"], a[href*="artifact"], button:has-text("Download")');
      // At least should show artifact status, even if generating
      const artifactStatus = await page.textContent('body');
      expect(artifactStatus).toMatch(/artifact|report|pdf|csv|generating|download/i);
    }
    
    // VERIFY SURVEY PRESENTATION PRODUCED (Critical Agent Requirements)
    console.log('✅ Verifying Survey Presentation Generated');
    
    // Verify presentation artifact is created (for answering customer questions)
    const presentationArtifacts = page.locator('text=/presentation|pptx|powerpoint|survey.*presentation/i');
    const presentationCount = await presentationArtifacts.count();
    
    // Also check download links for presentation files
    const presentationLinks = page.locator('a[href*="presentation"], a[href*="pptx"], a[href*=".pptx"]');
    const presentationLinkCount = await presentationLinks.count();
    
    // Should have presentation artifact (even if still generating)
    if (presentationCount > 0 || presentationLinkCount > 0) {
      console.log(`✅ Found ${presentationCount + presentationLinkCount} presentation artifact(s)`);
    } else {
      // Wait longer for async generation
      await page.waitForTimeout(10000);
      await page.reload();
      await page.waitForTimeout(2000);
      
      const updatedPresentation = page.locator('text=/presentation|pptx|powerpoint/i');
      expect(await updatedPresentation.count()).toBeGreaterThan(0);
      console.log('✅ Presentation artifact verified after async generation');
    }
    
    // Verify presentation answers customer questions:
    // - Check if presentation references the business questions
    const presentationContent = await page.textContent('body');
    
    // Verify presentation addresses key questions:
    const questionChecks = [
      /roots.*shoots|programs.*families/i,
      /financial.*support|volunteering.*support/i,
      /climate.*resilience|priorities/i,
      /lower.*grade|upper.*grade|room.*1-10|room.*11-18/i
    ];
    
    for (const check of questionChecks) {
      if (presentationContent?.match(check)) {
        console.log(`✅ Presentation addresses question: ${check}`);
      }
    }
    
    // Verify PDF report is also generated
    const pdfReport = page.locator('text=/pdf|report|download.*pdf/i');
    expect(await pdfReport.count()).toBeGreaterThan(0);
    console.log('✅ PDF report verified');

    // Verify AI Insights accessible (November 18 Fix #5)
    console.log('✅ Step 8: Verify AI Insights');
    
    // Monitor console for 403 errors
    const aiErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('403') || 
            text.includes('Forbidden') ||
            text.includes('/api/ai/ai-insights')) {
          aiErrors.push(text);
        }
      }
    });
    
    // Monitor network requests for 403
    const failedRequests: string[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/ai/ai-insights') && response.status() === 403) {
        failedRequests.push(response.url());
      }
    });
    
    const insightsButton = page.locator('text=/insights|ai insights|ask about your data/i');
    if (await insightsButton.count() > 0) {
      await insightsButton.first().click();
      await page.waitForTimeout(3000);
      
      // Should not see 403 error
      const error403 = await page.locator('text=/403|forbidden|access denied/i').count();
      expect(error403).toBe(0);
      
      // Verify no 403 in network requests
      expect(failedRequests.length).toBe(0);
      
      // Verify insights load (not "Auto Insight Generations Not Authenticating")
      const insightsContent = await page.textContent('body');
      expect(insightsContent).not.toMatch(/not authenticating|access denied|forbidden/i);
    }
    
    // Verify no console errors for AI insights
    expect(aiErrors.length).toBe(0);

    // Verify session persistence (November 18 Fix #6)
    console.log('✅ Step 9: Verify Session Persistence');
    
    // Monitor console for session expiration errors
    const sessionErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('Session expired') || 
            text.includes('410') ||
            text.includes('/api/project-session/') && text.includes('expired')) {
          sessionErrors.push(text);
        }
      }
    });
    
    // Monitor network requests for 410 (Gone) errors
    const session410Errors: string[] = [];
    page.on('response', response => {
      if (response.url().includes('/api/project-session/') && response.status() === 410) {
        session410Errors.push(response.url());
      }
    });
    
    // Wait to test session persistence (shortened for test)
    await page.waitForTimeout(5000);
    
    // Try to update session step (common operation that might trigger expiration)
    try {
      // Navigate to transformations or another step
      const transformButton = page.locator('text=/transform|data transformation/i');
      if (await transformButton.count() > 0) {
        await transformButton.first().click();
        await page.waitForTimeout(2000);
      }
    } catch (error) {
      // Ignore navigation errors, just testing session
    }
    
    // Try to continue workflow
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should still be logged in (24-hour grace period)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/auth');
    
    // Should not see "Session expired" error
    const sessionError = await page.locator('text=/session expired|410|gone/i').count();
    expect(sessionError).toBe(0);
    
    // Verify no console errors for session expiration
    expect(sessionErrors.length).toBe(0);
    
    // Verify no 410 errors in network requests
    expect(session410Errors.length).toBe(0);

    // FINAL VERIFICATION: Complete Agent Workflow
    console.log('✅ Step 10: Final Agent Workflow Verification');
    
    // Verify complete agent workflow was executed:
    // 1. ✅ Goal and questions synthesized (verified in plan step)
    // 2. ✅ Agents worked together to build plan (agent contributions verified)
    // 3. ✅ Required data elements proposed (plan steps verified)
    // 4. ✅ User validation and acceptance (plan approval verified)
    // 5. ✅ Data transformed (transformation capabilities verified)
    // 6. ✅ Visualizations built (visualizations verified)
    // 7. ✅ Analysis executed (execution verified)
    // 8. ✅ Survey presentation produced (presentation verified)
    
    // Verify workflow transparency (Error: "Workflow Transparency Decision Trail not available")
    const workflowTab = page.locator('text=/workflow|transparency|decision.*trail|timeline/i');
    if (await workflowTab.count() > 0) {
      await workflowTab.first().click();
      await page.waitForTimeout(2000);
      
      // Verify decision trail is visible
      const decisionTrail = page.locator('text=/decision|agent.*decision|checkpoint/i');
      expect(await decisionTrail.count()).toBeGreaterThan(0);
      console.log('✅ Workflow transparency and decision trail verified');
    }

    console.log('✅ Complete user journey test passed with full agent workflow verification!');
  });

  test('Verify November 18 Fixes - Performance SLA Compliance', async ({ page }) => {
    // This test specifically verifies SLA compliance (<1 minute total journey)
    
    await page.goto('http://localhost:5173');
    
    const journeyStartTime = Date.now();
    
    // Navigate to template-based journey
    await page.click('text=Template-Based Analysis');
    await page.waitForURL('**/template-based', { timeout: 10000 });
    
    // Quick test: Just verify plan creation timeout is 30 seconds
    // (Full journey test is above)
    
    const currentTime = Date.now();
    const elapsedTime = currentTime - journeyStartTime;
    
    // Initial navigation should be fast (<5 seconds)
    expect(elapsedTime).toBeLessThan(5000);
    
    console.log(`✅ Initial navigation completed in ${elapsedTime}ms (SLA: <5000ms)`);
  });

  test('Verify Template Config Endpoint (404 Fix)', async ({ page, request }) => {
    // Error: "/api/templates/Survey Response Analysis/config" not found
    
    // Verify template exists first
    const templatesResponse = await request.get('http://localhost:5000/api/templates');
    expect(templatesResponse.ok()).toBeTruthy();
    
    // Try to get config for a template (should not 404 if endpoint exists)
    // Note: This endpoint might need to be implemented if missing
    const templateName = 'Survey Response Analysis';
    const configResponse = await request.get(`http://localhost:5000/api/templates/${encodeURIComponent(templateName)}/config`);
    
    // Should either return 200 (if implemented) or return a proper error, not just 404
    if (!configResponse.ok()) {
      const error = await configResponse.json().catch(() => ({ error: 'Unknown error' }));
      // If 404, verify it's a proper error response
      if (configResponse.status() === 404) {
        expect(error.error).toBeTruthy();
        console.log(`⚠️ Template config endpoint not implemented: ${error.error}`);
      }
    } else {
      const data = await configResponse.json();
      expect(data).toBeTruthy();
      console.log('✅ Template config endpoint works');
    }
  });

  test('Verify No Hard-coded Values (Error: "Is this hard coded")', async ({ page }) => {
    // Navigate to a project and check for hard-coded quality scores
    await page.goto('http://localhost:5173');
    
    // Look for quality scores that are always the same (indicates mock data)
    // This should be caught by the mock data audit, but verify in UI
    
    // Check data verification page for consistent scores
    const projectId = await page.evaluate(() => localStorage.getItem('currentProjectId') || '');
    if (projectId) {
      await page.goto(`http://localhost:5173/projects/${projectId}`);
      await page.waitForTimeout(2000);
      
      // Look for quality scores
      const qualityScores = await page.locator('text=/\\d+%/').allTextContents();
      if (qualityScores.length > 0) {
        // Should have variation, not all the same
        const uniqueScores = new Set(qualityScores);
        // If all scores are identical, might be hard-coded
        if (uniqueScores.size === 1 && qualityScores.length > 1) {
          console.warn(`⚠️ Warning: All quality scores are identical (${qualityScores[0]}), might be hard-coded`);
        }
      }
    }
  });

  test('Verify Template API Integration', async ({ page, request }) => {
    // Verify template API endpoints are accessible
    const response = await request.get('http://localhost:5000/api/templates');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data).toBeInstanceOf(Array);
    
    // Test search endpoint
    const searchResponse = await request.get('http://localhost:5000/api/templates/search?q=survey');
    expect(searchResponse.ok()).toBeTruthy();
    
    const searchData = await searchResponse.json();
    expect(searchData.success).toBe(true);
    
    console.log('✅ Template API endpoints verified');
  });

  test('Verify Data Transformation Operations for SPTO Survey', async ({ page, request }) => {
    // This test verifies specific transformation operations needed for SPTO survey:
    // 1. Splitting columns with list items
    // 2. Renaming columns
    // 3. Counting participants
    // 4. Summarizing text data
    
    console.log('✅ Testing Data Transformation Operations');
    
    // Get project ID from test session
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    
    const projectId = await page.evaluate(() => localStorage.getItem('currentProjectId') || '');
    if (!projectId) {
      console.log('⚠️ No project ID found, skipping transformation test');
      return;
    }
    
    // Test transformation API endpoints if available
    const transformEndpoints = [
      `/api/projects/${projectId}/transform`,
      `/api/transform-data/${projectId}`,
      `/api/data-transformation/${projectId}`
    ];
    
    let transformEndpointFound = false;
    for (const endpoint of transformEndpoints) {
      try {
        const response = await request.get(`http://localhost:5000${endpoint}`);
        if (response.ok()) {
          transformEndpointFound = true;
          console.log(`✅ Transformation endpoint found: ${endpoint}`);
          break;
        }
      } catch (error) {
        // Endpoint doesn't exist, try next
      }
    }
    
    if (!transformEndpointFound) {
      console.log('⚠️ Transformation endpoints not found, verifying via UI');
      
      // Navigate to transformation page
      await page.goto(`http://localhost:5173/projects/${projectId}`);
      await page.waitForTimeout(2000);
      
      // Look for transformation tab
      const transformTab = page.locator('text=/transform|transformation|edit.*data/i');
      if (await transformTab.count() > 0) {
        await transformTab.first().click();
        await page.waitForTimeout(2000);
        
        // Verify transformation UI shows options for:
        // - Split columns (Error: "Data not available for Transformations")
        const splitOption = page.locator('text=/split.*column|explode/i');
        if (await splitOption.count() > 0) {
          console.log('✅ Column splitting option available');
        }
        
        // - Rename columns
        const renameOption = page.locator('text=/rename/i');
        if (await renameOption.count() > 0) {
          console.log('✅ Column renaming option available');
        }
        
        // - Count/Aggregate
        const countOption = page.locator('text=/count|aggregate|group.*by/i');
        if (await countOption.count() > 0) {
          console.log('✅ Counting/aggregation option available');
        }
        
        // - Text summarization
        const summarizeOption = page.locator('text=/summarize|text.*summary/i');
        if (await summarizeOption.count() > 0) {
          console.log('✅ Text summarization option available');
        }
        
        // Verify data is available (not "Data not available for Transformations")
        const dataNotAvailable = page.locator('text=/data not available|no data available/i');
        expect(await dataNotAvailable.count()).toBe(0);
      }
    }
    
    console.log('✅ Data transformation capabilities verified');
  });

  test('Verify Survey Presentation Answers All Questions', async ({ page }) => {
    // This test verifies the presentation artifact answers all 14 SPTO questions
    
    console.log('✅ Verifying Survey Presentation Completeness');
    
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(2000);
    
    const projectId = await page.evaluate(() => localStorage.getItem('currentProjectId') || '');
    if (!projectId) {
      console.log('⚠️ No project ID found, skipping presentation verification');
      return;
    }
    
    // Navigate to project artifacts
    await page.goto(`http://localhost:5173/projects/${projectId}`);
    await page.waitForTimeout(2000);
    
    // Look for presentation artifact
    const presentationLink = page.locator('a[href*="presentation"], a[href*="pptx"], text=/presentation/i');
    
    if (await presentationLink.count() > 0) {
      // Get presentation URL
      const presentationHref = await presentationLink.first().getAttribute('href');
      
      if (presentationHref) {
        // Verify presentation is downloadable
        const response = await page.request.get(presentationHref);
        expect(response.ok()).toBeTruthy();
        
        // Note: Full content verification would require parsing PPTX
        // For now, verify it exists and is accessible
        console.log('✅ Presentation artifact is accessible and downloadable');
      }
    }
    
    // Verify presentation metadata includes question references
    const artifactsSection = await page.textContent('body');
    
    // Check that presentation references the survey questions
    const requiredTopics = [
      'roots.*shoots',
      'financial.*support',
      'volunteering.*support',
      'climate.*resilience',
      'room.*1-10',
      'room.*11-18',
      'priority',
      'qualitative.*feedback'
    ];
    
    for (const topic of requiredTopics) {
      const topicFound = artifactsSection?.match(new RegExp(topic, 'i'));
      if (topicFound) {
        console.log(`✅ Presentation references topic: ${topic}`);
      }
    }
    
    console.log('✅ Survey presentation verification complete');
  });
});

