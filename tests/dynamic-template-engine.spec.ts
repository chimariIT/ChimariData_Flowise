import { test, expect } from '@playwright/test';

test.describe('Dynamic Template Engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Mock authentication
    await page.evaluate(() => {
      localStorage.setItem('auth_token', 'test-token');
      localStorage.setItem('user', JSON.stringify({
        id: '1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User'
      }));
    });
  });

  test.describe('Industry Research and Template Generation', () => {
    test('should research unknown industry and generate template', async ({ page }) => {
      // Navigate to project creation with unknown industry
      await page.goto('/projects/new');

      // Fill in project details with uncommon industry
      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Underwater Basket Weaving Manufacturing');

      const businessContext = page.locator('textarea[name="businessContext"]');
      await businessContext.fill('We manufacture specialized underwater baskets for aquatic enthusiasts. Need to analyze supply chain efficiency and customer satisfaction patterns.');

      // Submit project creation
      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Wait for dynamic template generation
      await page.waitForSelector('[data-testid="template-generation-status"]', { timeout: 30000 });

      // Verify template research is triggered
      const researchStatus = page.locator('[data-testid="industry-research-progress"]');
      await expect(researchStatus).toBeVisible();

      // Wait for template generation to complete
      await page.waitForSelector('[data-testid="template-generated"]', { timeout: 60000 });

      // Verify generated template has industry-specific elements
      const generatedTemplate = page.locator('[data-testid="generated-template"]');
      await expect(generatedTemplate).toBeVisible();

      // Check for industry-specific metrics
      const metrics = page.locator('[data-testid="industry-metrics"]');
      await expect(metrics).toContainText(['supply chain', 'manufacturing', 'customer satisfaction'].some(text => text));

      // Verify template validation passed
      const validationStatus = page.locator('[data-testid="template-validation-status"]');
      await expect(validationStatus).toHaveText('Valid');
    });

    test('should show research sources and confidence', async ({ page }) => {
      await page.goto('/projects/test-project-id/template-research');

      // Check research sources panel
      const researchSources = page.locator('[data-testid="research-sources"]');
      await expect(researchSources).toBeVisible();

      // Verify different source types
      const webSources = page.locator('[data-testid="web-sources"]');
      const aiKnowledge = page.locator('[data-testid="ai-knowledge"]');
      const industryAPIs = page.locator('[data-testid="industry-apis"]');

      await expect(webSources).toBeVisible();
      await expect(aiKnowledge).toBeVisible();

      // Check confidence scoring
      const confidenceScore = page.locator('[data-testid="template-confidence"]');
      await expect(confidenceScore).toBeVisible();

      // Verify confidence score is within valid range
      const scoreText = await confidenceScore.textContent();
      const score = parseInt(scoreText?.match(/\d+/)?.[0] || '0');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should handle template refinement based on user feedback', async ({ page }) => {
      await page.goto('/projects/test-project-id/template-review');

      // Find generated template
      const template = page.locator('[data-testid="generated-template"]');
      await expect(template).toBeVisible();

      // Provide feedback on template
      const feedbackButton = page.locator('button:has-text("Provide Feedback")');
      await feedbackButton.click();

      const feedbackDialog = page.locator('[data-testid="template-feedback-dialog"]');
      await expect(feedbackDialog).toBeVisible();

      // Fill feedback form
      const missingMetrics = page.locator('textarea[name="missingMetrics"]');
      await missingMetrics.fill('Need to include seasonal demand patterns and inventory turnover ratios');

      const irrelevantSections = page.locator('textarea[name="irrelevantSections"]');
      await irrelevantSections.fill('Digital marketing metrics not applicable to our B2B model');

      const industrySpecific = page.locator('textarea[name="industrySpecific"]');
      await industrySpecific.fill('Add regulatory compliance metrics for underwater safety standards');

      // Submit feedback
      const submitFeedback = page.locator('button:has-text("Submit Feedback")');
      await submitFeedback.click();

      // Wait for template refinement
      await page.waitForSelector('[data-testid="template-refining"]', { timeout: 10000 });
      await page.waitForSelector('[data-testid="template-refined"]', { timeout: 30000 });

      // Verify refined template incorporates feedback
      const refinedTemplate = page.locator('[data-testid="refined-template"]');
      await expect(refinedTemplate).toBeVisible();
      await expect(refinedTemplate).toContainText('seasonal demand');
      await expect(refinedTemplate).toContainText('regulatory compliance');
    });
  });

  test.describe('Template Caching and Learning', () => {
    test('should cache and reuse successful templates', async ({ page }) => {
      // First project with new industry
      await page.goto('/projects/new');

      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Artisanal Cheese Production');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Wait for initial template generation
      await page.waitForSelector('[data-testid="template-generated"]', { timeout: 60000 });

      // Create second project with same industry
      await page.goto('/projects/new');
      await industryInput.fill('Artisanal Cheese Production');
      await submitButton.click();

      // Should use cached template much faster
      await page.waitForSelector('[data-testid="template-cached"]', { timeout: 5000 });

      const cacheStatus = page.locator('[data-testid="template-cache-status"]');
      await expect(cacheStatus).toHaveText('Using cached template');

      // Verify template loads quickly
      const loadTime = await page.evaluate(() => {
        return window.performance.getEntriesByType('navigation')[0].loadEventEnd -
               window.performance.getEntriesByType('navigation')[0].fetchStart;
      });
      expect(loadTime).toBeLessThan(3000); // Should load in under 3 seconds
    });

    test('should learn from successful project outcomes', async ({ page }) => {
      await page.goto('/projects/successful-project-id/completion');

      // Mark project as successful
      const successButton = page.locator('button:has-text("Mark as Successful")');
      await successButton.click();

      const successDialog = page.locator('[data-testid="project-success-dialog"]');
      await expect(successDialog).toBeVisible();

      // Provide outcome feedback
      const outcomeMetrics = page.locator('textarea[name="successMetrics"]');
      await outcomeMetrics.fill('Achieved 25% cost reduction and 40% efficiency improvement');

      const keyFactors = page.locator('textarea[name="keyFactors"]');
      await keyFactors.fill('Focus on supplier relationship metrics and quality control KPIs was crucial');

      const submitSuccess = page.locator('button:has-text("Record Success")');
      await submitSuccess.click();

      // Verify learning is recorded
      await page.waitForSelector('[data-testid="learning-recorded"]', { timeout: 5000 });

      // Create new project with similar industry
      await page.goto('/projects/new');
      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Food Manufacturing');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Verify learned patterns are incorporated
      await page.waitForSelector('[data-testid="template-generated"]', { timeout: 30000 });

      const learnedElements = page.locator('[data-testid="learned-elements"]');
      await expect(learnedElements).toContainText('supplier relationship');
      await expect(learnedElements).toContainText('quality control');
    });
  });

  test.describe('Template Validation and Quality', () => {
    test('should validate template completeness', async ({ page }) => {
      await page.goto('/projects/test-project-id/template-validation');

      const validationResults = page.locator('[data-testid="template-validation"]');
      await expect(validationResults).toBeVisible();

      // Check validation criteria
      const criteria = [
        'industry_relevance',
        'metric_completeness',
        'kpi_alignment',
        'visualization_appropriateness',
        'business_context_fit'
      ];

      for (const criterion of criteria) {
        const criterionStatus = page.locator(`[data-testid="validation-${criterion}"]`);
        await expect(criterionStatus).toBeVisible();

        // Each criterion should have a status
        const status = await criterionStatus.getAttribute('data-status');
        expect(['pass', 'warning', 'fail']).toContain(status);
      }

      // Overall validation score
      const overallScore = page.locator('[data-testid="validation-score"]');
      await expect(overallScore).toBeVisible();

      const scoreValue = await overallScore.textContent();
      const score = parseInt(scoreValue?.match(/\d+/)?.[0] || '0');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    test('should handle template generation failures gracefully', async ({ page }) => {
      // Mock network error for research
      await page.route('**/api/template/research/**', route => {
        route.abort('failed');
      });

      await page.goto('/projects/new');

      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Unknown Complex Industry');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should show error handling
      await page.waitForSelector('[data-testid="template-generation-error"]', { timeout: 10000 });

      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible();
      await expect(errorMessage).toContainText('research failed');

      // Should offer fallback options
      const fallbackOptions = page.locator('[data-testid="fallback-options"]');
      await expect(fallbackOptions).toBeVisible();

      const useGenericTemplate = page.locator('button:has-text("Use Generic Template")');
      const retryResearch = page.locator('button:has-text("Retry Research")');

      await expect(useGenericTemplate).toBeVisible();
      await expect(retryResearch).toBeVisible();

      // Test fallback
      await useGenericTemplate.click();
      await page.waitForSelector('[data-testid="generic-template-applied"]', { timeout: 5000 });
    });
  });

  test.describe('Integration with Existing Systems', () => {
    test('should integrate with adaptive content engine', async ({ page }) => {
      await page.goto('/projects/test-project-id/results');

      // Verify dynamic template is used for content generation
      const contentEngine = page.locator('[data-testid="adaptive-content-engine"]');
      await expect(contentEngine).toBeVisible();

      // Check audience-specific content uses dynamic template
      const audienceSelector = page.locator('[data-testid="audience-selector"]');
      await audienceSelector.selectOption('sales_manager');

      await page.waitForTimeout(2000);

      // Verify content includes industry-specific elements from dynamic template
      const generatedContent = page.locator('[data-testid="generated-content"]');
      await expect(generatedContent).toBeVisible();

      const industrySpecificElements = page.locator('[data-testid="industry-specific-content"]');
      await expect(industrySpecificElements).toBeVisible();

      // Switch audience and verify different template application
      await audienceSelector.selectOption('cfo');
      await page.waitForTimeout(2000);

      const cfoContent = page.locator('[data-testid="cfo-specific-content"]');
      await expect(cfoContent).toBeVisible();
      await expect(cfoContent).not.toEqual(industrySpecificElements);
    });

    test('should work with workflow transparency', async ({ page }) => {
      await page.goto('/projects/test-project-id/workflow');

      // Check template generation appears in workflow
      const workflowSteps = page.locator('[data-testid="workflow-step"]');

      // Should include template generation step
      const templateStep = workflowSteps.filter({ hasText: 'Template Generation' });
      await expect(templateStep).toBeVisible();

      // Check decision trail includes template decisions
      const decisionTab = page.locator('button:has-text("Decision Trail")');
      await decisionTab.click();

      const decisions = page.locator('[data-testid="decision-entry"]');
      const templateDecisions = decisions.filter({ hasText: 'template' });

      if (await templateDecisions.count() > 0) {
        const firstTemplateDecision = templateDecisions.first();
        await expect(firstTemplateDecision).toBeVisible();

        // Should show template selection reasoning
        const reasoning = firstTemplateDecision.locator('[data-testid="decision-reasoning"]');
        await expect(reasoning).toContainText('industry research');
      }
    });

    test('should handle continuous analysis with dynamic templates', async ({ page }) => {
      await page.goto('/subscriptions/create');

      // Create continuous analysis subscription
      const nameInput = page.locator('input[name="name"]');
      await nameInput.fill('Monthly Industry Analysis');

      const frequencySelect = page.locator('select[name="frequency"]');
      await frequencySelect.selectOption('monthly');

      // Enable template adaptation
      const adaptTemplateCheckbox = page.locator('input[name="adaptTemplate"]');
      await adaptTemplateCheckbox.check();

      const createButton = page.locator('button[type="submit"]');
      await createButton.click();

      // Verify subscription created with template adaptation
      await page.waitForSelector('[data-testid="subscription-success"]');

      // Check subscription details include template adaptation
      await page.goto('/subscriptions');
      const subscriptionCard = page.locator('[data-testid="subscription-card"]').first();

      const adaptationStatus = subscriptionCard.locator('[data-testid="template-adaptation-status"]');
      await expect(adaptationStatus).toHaveText('Enabled');
    });
  });

  test.describe('Performance and Scalability', () => {
    test('should handle concurrent template requests', async ({ page }) => {
      // Simulate multiple concurrent template requests
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(page.goto(`/api/template/generate?industry=Test-Industry-${i}&projectId=concurrent-${i}`));
      }

      const responses = await Promise.all(promises);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.ok()).toBeTruthy();
      });

      // Check rate limiting doesn't block legitimate requests
      await page.goto('/projects/new');
      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Post-Concurrent Test Industry');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Should still generate template successfully
      await page.waitForSelector('[data-testid="template-generated"]', { timeout: 60000 });
    });

    test('should optimize template generation time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/projects/new');

      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Fast Template Test Industry');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      await page.waitForSelector('[data-testid="template-generated"]');

      const endTime = Date.now();
      const generationTime = endTime - startTime;

      // Template generation should complete within reasonable time
      expect(generationTime).toBeLessThan(45000); // 45 seconds max for new industry

      // Verify performance metrics are tracked
      const performanceMetrics = page.locator('[data-testid="generation-metrics"]');
      if (await performanceMetrics.isVisible()) {
        const researchTime = await performanceMetrics.locator('[data-testid="research-time"]').textContent();
        const generationTime = await performanceMetrics.locator('[data-testid="generation-time"]').textContent();

        expect(parseInt(researchTime || '0')).toBeGreaterThan(0);
        expect(parseInt(generationTime || '0')).toBeGreaterThan(0);
      }
    });
  });
});

test.describe('Template API Integration', () => {
  test('should provide RESTful API for template operations', async ({ page }) => {
    // Test template generation API
    const response = await page.request.post('/api/template/generate', {
      data: {
        industry: 'API Test Industry',
        businessContext: 'Testing API integration for template generation',
        analysisGoals: ['efficiency', 'cost_reduction'],
        projectId: 'api-test-project'
      }
    });

    expect(response.ok()).toBeTruthy();
    const templateData = await response.json();

    expect(templateData).toHaveProperty('template');
    expect(templateData).toHaveProperty('confidence');
    expect(templateData).toHaveProperty('sources');
    expect(templateData.confidence).toBeGreaterThan(0);

    // Test template retrieval
    const templateId = templateData.template.id;
    const getResponse = await page.request.get(`/api/template/${templateId}`);

    expect(getResponse.ok()).toBeTruthy();
    const retrievedTemplate = await getResponse.json();
    expect(retrievedTemplate.id).toBe(templateId);

    // Test template feedback API
    const feedbackResponse = await page.request.post(`/api/template/${templateId}/feedback`, {
      data: {
        rating: 4,
        missingMetrics: ['inventory_turnover'],
        irrelevantSections: ['social_media_metrics'],
        industryAccuracy: 8
      }
    });

    expect(feedbackResponse.ok()).toBeTruthy();
  });
});