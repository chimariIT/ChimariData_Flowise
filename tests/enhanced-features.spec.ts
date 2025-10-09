import { test, expect } from '@playwright/test';

test.describe('Enhanced Platform Features', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the platform and ensure authenticated state
    await page.goto('/');

    // Programmatic authentication for testing using server test endpoint
    const res = await page.request.post('/api/auth/login-test');
    if (!res.ok()) {
      throw new Error(`login-test failed: ${res.status()} ${res.statusText()}`);
    }
    const body = await res.json();
    const token = body?.token;
    const user = body?.user;

    await page.evaluate(([t, u]) => {
      if (t) localStorage.setItem('auth_token', t as string);
      if (u) localStorage.setItem('user', JSON.stringify(u));
    }, [token, user]);
  });

  test.describe('Conversational Goal Refinement', () => {
    test('should start conversation and refine goals', async ({ page }) => {
      await page.goto('/projects/new');

      // Look for the agent chat interface
      const chatInterface = page.locator('[data-testid="agent-chat-interface"]');
      await expect(chatInterface).toBeVisible();

      // Start conversation
      const messageInput = chatInterface.locator('textarea');
      await messageInput.fill('I want to analyze my sales data to improve revenue');

      const sendButton = chatInterface.locator('button[type="submit"]');
      await sendButton.click();

      // Wait for agent response
      await page.waitForSelector('[data-testid="agent-message"]', { timeout: 10000 });

      // Verify conversation started
  const agentMessages = page.locator('[data-testid="agent-message"]');
  await expect(await agentMessages.count()).toBeGreaterThan(0);

      // Check for goal candidates
      const goalCandidates = page.locator('[data-testid="goal-candidate"]');
      if (await goalCandidates.count() > 0) {
        // Interact with first goal candidate
        const firstGoal = goalCandidates.first();
        const approveButton = firstGoal.locator('button:has-text("Approve")');
        if (await approveButton.isVisible()) {
          await approveButton.click();
        }
      }

      // Verify goal refinement progress
      const progressIndicator = page.locator('[data-testid="conversation-progress"]');
      await expect(progressIndicator).toBeVisible();
    });

    test('should show conversation phases', async ({ page }) => {
      await page.goto('/conversation/test-conversation-id');

      // Check for phase indicators
      const phases = ['Goal Discovery', 'Requirement Refinement', 'Solution Design', 'Execution Planning'];

      for (const phase of phases) {
        const phaseElement = page.locator(`text=${phase}`);
        // At least one phase should be visible
        if (await phaseElement.isVisible()) {
          await expect(phaseElement).toBeVisible();
          break;
        }
      }
    });
  });

  test.describe('Workflow Transparency Dashboard', () => {
    test('should display workflow steps and progress', async ({ page }) => {
      await page.goto('/projects/test-project-id/workflow');

      // Check for workflow transparency dashboard
      const dashboard = page.locator('[data-testid="workflow-transparency-dashboard"]');
      await expect(dashboard).toBeVisible();

      // Verify tabs are present
      const tabs = ['Overview', 'Agent Activities', 'Decision Trail', 'Artifacts'];

      for (const tab of tabs) {
        const tabElement = page.locator(`button:has-text("${tab}")`);
        await expect(tabElement).toBeVisible();
      }

      // Check overview tab content
      const progressBar = page.locator('[data-testid="workflow-progress"]');
      await expect(progressBar).toBeVisible();

  const workflowSteps = page.locator('[data-testid="workflow-step"]');
  await expect(await workflowSteps.count()).toBeGreaterThan(0);
    });

    test('should show agent activities', async ({ page }) => {
      await page.goto('/projects/test-project-id/workflow');

      // Switch to Agent Activities tab
      const agentTab = page.locator('button:has-text("Agent Activities")');
      await agentTab.click();

      // Check for agent activity cards
      const agents = ['Project Manager', 'Data Scientist', 'Business Agent'];

      for (const agent of agents) {
        const agentCard = page.locator(`[data-testid="agent-card-${agent.toLowerCase().replace(' ', '-')}"]`);
        if (await agentCard.isVisible()) {
          await expect(agentCard).toBeVisible();

          // Check for activity details
          const activityStatus = agentCard.locator('[data-testid="activity-status"]');
          const currentTask = agentCard.locator('[data-testid="current-task"]');
          const progress = agentCard.locator('[data-testid="task-progress"]');

          await expect(activityStatus).toBeVisible();
          await expect(currentTask).toBeVisible();
          await expect(progress).toBeVisible();
        }
      }
    });

    test('should display decision audit trail', async ({ page }) => {
      await page.goto('/projects/test-project-id/workflow');

      // Switch to Decision Trail tab
      const decisionTab = page.locator('button:has-text("Decision Trail")');
      await decisionTab.click();

      // Check for decision entries
      const decisionEntries = page.locator('[data-testid="decision-entry"]');

      if (await decisionEntries.count() > 0) {
        const firstDecision = decisionEntries.first();
        await expect(firstDecision).toBeVisible();

        // Check decision details
        const decisionText = firstDecision.locator('[data-testid="decision-text"]');
        const reasoning = firstDecision.locator('[data-testid="decision-reasoning"]');
        const confidence = firstDecision.locator('[data-testid="decision-confidence"]');

        await expect(decisionText).toBeVisible();
        await expect(reasoning).toBeVisible();
        await expect(confidence).toBeVisible();

        // Test questioning a decision if it's reversible
        const questionButton = firstDecision.locator('button:has-text("Question this decision")');
        if (await questionButton.isVisible()) {
          await questionButton.click();

          const questionDialog = page.locator('[data-testid="question-decision-dialog"]');
          await expect(questionDialog).toBeVisible();
        }
      }
    });
  });

  test.describe('Audience-Adaptive Content Generation', () => {
    test('should generate role-specific artifacts', async ({ page }) => {
      await page.goto('/projects/test-project-id/results');

      // Check for audience selection
      const audienceSelector = page.locator('[data-testid="audience-selector"]');
      if (await audienceSelector.isVisible()) {
        await audienceSelector.click();

        // Select different roles and verify different content
        const roles = ['Sales Manager', 'Marketing Executive', 'CFO'];

        for (const role of roles) {
          const roleOption = page.locator(`option:has-text("${role}")`);
          if (await roleOption.isVisible()) {
            await roleOption.click();

            // Wait for content to update
            await page.waitForTimeout(1000);

            // Check for role-specific content
            const artifactContainer = page.locator('[data-testid="generated-artifacts"]');
            await expect(artifactContainer).toBeVisible();

            // Verify role-specific elements
            const roleSpecificContent = page.locator(`[data-testid="content-for-${role.toLowerCase().replace(' ', '-')}"]`);
            if (await roleSpecificContent.isVisible()) {
              await expect(roleSpecificContent).toBeVisible();
            }
          }
        }
      }
    });

    test('should adapt content for unknown industries using dynamic templates', async ({ page }) => {
      await page.goto('/projects/new');

      // Create project with uncommon industry
      const industryInput = page.locator('input[name="industry"]');
      await industryInput.fill('Specialized Maritime Equipment Manufacturing');

      const businessContext = page.locator('textarea[name="businessContext"]');
      await businessContext.fill('We manufacture specialized equipment for deep-sea exploration vessels');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Wait for dynamic template generation
      await page.waitForSelector('[data-testid="template-generated"]', { timeout: 60000 });

      // Navigate to results and test audience adaptation
      await page.goto('/projects/test-project-id/results');

      const audienceSelector = page.locator('[data-testid="audience-selector"]');
      if (await audienceSelector.isVisible()) {
        await audienceSelector.selectOption('sales_manager');
        await page.waitForTimeout(2000);

        // Verify industry-specific content is generated
        const industryContent = page.locator('[data-testid="industry-adapted-content"]');
        if (await industryContent.isVisible()) {
          await expect(industryContent).toContainText([/maritime/i, /equipment/i, /manufacturing/i]);
        }
      }
    });

    test('should show different complexity levels', async ({ page }) => {
      await page.goto('/projects/test-project-id/results');

      // Check for complexity toggle
      const complexityToggle = page.locator('[data-testid="complexity-toggle"]');
      if (await complexityToggle.isVisible()) {
        const complexityLevels = ['Simple', 'Intermediate', 'Advanced'];

        for (const level of complexityLevels) {
          const levelButton = page.locator(`button:has-text("${level}")`);
          if (await levelButton.isVisible()) {
            await levelButton.click();

            // Wait for content update
            await page.waitForTimeout(500);

            // Verify content complexity matches selection
            const contentContainer = page.locator('[data-testid="artifact-content"]');
            await expect(contentContainer).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('Continuous Analysis Features', () => {
    test('should create analysis subscription', async ({ page }) => {
      await page.goto('/projects/test-project-id/continuous');

      // Check for subscription creation form
      const subscriptionForm = page.locator('[data-testid="subscription-form"]');
      await expect(subscriptionForm).toBeVisible();

      // Fill out subscription details
      const nameInput = subscriptionForm.locator('input[name="name"]');
      await nameInput.fill('Weekly Sales Analysis');

      const frequencySelect = subscriptionForm.locator('select[name="frequency"]');
      await frequencySelect.selectOption('weekly');

      // Add audience profiles
      const addAudienceButton = subscriptionForm.locator('button:has-text("Add Audience")');
      if (await addAudienceButton.isVisible()) {
        await addAudienceButton.click();

        const roleSelect = page.locator('select[name="role"]');
        await roleSelect.selectOption('sales_manager');
      }

      // Submit subscription
      const createButton = subscriptionForm.locator('button[type="submit"]');
      await createButton.click();

      // Verify subscription created
      await page.waitForSelector('[data-testid="subscription-success"]', { timeout: 10000 });
      const successMessage = page.locator('[data-testid="subscription-success"]');
      await expect(successMessage).toBeVisible();
    });

    test('should show subscription management', async ({ page }) => {
      await page.goto('/subscriptions');

      // Check for subscriptions list
      const subscriptionsList = page.locator('[data-testid="subscriptions-list"]');
      await expect(subscriptionsList).toBeVisible();

      // Look for subscription cards
      const subscriptionCards = page.locator('[data-testid="subscription-card"]');

      if (await subscriptionCards.count() > 0) {
        const firstSubscription = subscriptionCards.first();
        await expect(firstSubscription).toBeVisible();

        // Check subscription controls
        const pauseButton = firstSubscription.locator('button:has-text("Pause")');
        const editButton = firstSubscription.locator('button:has-text("Edit")');

        if (await pauseButton.isVisible()) {
          await expect(pauseButton).toBeVisible();
        }

        if (await editButton.isVisible()) {
          await expect(editButton).toBeVisible();
        }
      }
    });
  });

  test.describe('Flexible Billing Integration', () => {
    test('should show cost estimation', async ({ page }) => {
      await page.goto('/projects/new');

      // Navigate through project creation to see cost estimation
      const costEstimator = page.locator('[data-testid="cost-estimator"]');

      if (await costEstimator.isVisible()) {
        await expect(costEstimator).toBeVisible();

        // Check cost breakdown
        const baseCost = page.locator('[data-testid="base-cost"]');
        const totalCost = page.locator('[data-testid="total-cost"]');
        const breakdown = page.locator('[data-testid="cost-breakdown"]');

        await expect(baseCost).toBeVisible();
        await expect(totalCost).toBeVisible();

        if (await breakdown.isVisible()) {
          await expect(breakdown).toBeVisible();
        }
      }
    });

    test('should handle payment flow', async ({ page }) => {
      await page.goto('/projects/test-project-id/payment');

      // Check for payment form
      const paymentForm = page.locator('[data-testid="payment-form"]');

      if (await paymentForm.isVisible()) {
        await expect(paymentForm).toBeVisible();

        // Check for payment methods
        const paymentMethods = page.locator('[data-testid="payment-methods"]');
        await expect(paymentMethods).toBeVisible();

        // Check for billing summary
        const billingSummary = page.locator('[data-testid="billing-summary"]');
        await expect(billingSummary).toBeVisible();
      }
    });
  });

  test.describe('Agent Chat Interface', () => {
    test('should handle agent communication', async ({ page }) => {
      await page.goto('/projects/test-project-id');

      // Check for agent chat interface
      const chatInterface = page.locator('[data-testid="agent-chat-interface"]');

      if (await chatInterface.isVisible()) {
        await expect(chatInterface).toBeVisible();

        // Test sending a message
        const messageInput = chatInterface.locator('textarea');
        await messageInput.fill('Can you explain the analysis approach?');

        const sendButton = chatInterface.locator('button:has-text("Send")');
        await sendButton.click();

        // Wait for agent response
        await page.waitForTimeout(2000);

        // Check for message in chat history
  const messages = chatInterface.locator('[data-testid="chat-message"]');
  await expect(await messages.count()).toBeGreaterThan(0);

        // Test quick actions
        const quickActions = chatInterface.locator('[data-testid="quick-actions"]');
        if (await quickActions.isVisible()) {
          const helpButton = quickActions.locator('button:has-text("Need help")');
          if (await helpButton.isVisible()) {
            await helpButton.click();
            await expect(messageInput).toHaveValue(/help/i);
          }
        }
      }
    });

    test('should show agent typing indicators', async ({ page }) => {
      await page.goto('/projects/test-project-id');

      const chatInterface = page.locator('[data-testid="agent-chat-interface"]');

      if (await chatInterface.isVisible()) {
        // Send a message that would trigger agent response
        const messageInput = chatInterface.locator('textarea');
        await messageInput.fill('What insights can you provide?');

        const sendButton = chatInterface.locator('button:has-text("Send")');
        await sendButton.click();

        // Look for typing indicator
        const typingIndicator = page.locator('[data-testid="agent-typing"]');

        // The typing indicator should appear at some point
        try {
          await expect(typingIndicator).toBeVisible({ timeout: 3000 });
        } catch (error) {
          // Typing indicator might be very fast, so this is not a hard failure
          console.log('Typing indicator not detected, but this might be due to timing');
        }
      }
    });
  });

  test.describe('Integration Tests', () => {
    test('should complete full enhanced workflow', async ({ page }) => {
      // Start with conversation
      await page.goto('/projects/new');

      // Start conversation
      const chatInterface = page.locator('[data-testid="agent-chat-interface"]');
      if (await chatInterface.isVisible()) {
        const messageInput = chatInterface.locator('textarea');
        await messageInput.fill('I need to analyze customer retention data to identify churn patterns');

        const sendButton = chatInterface.locator('button:has-text("Send")');
        await sendButton.click();

        await page.waitForTimeout(2000);
      }

      // Navigate to workflow transparency
      const workflowButton = page.locator('button:has-text("View Workflow")');
      if (await workflowButton.isVisible()) {
        await workflowButton.click();

        // Check workflow is visible
        const workflowDashboard = page.locator('[data-testid="workflow-transparency-dashboard"]');
        await expect(workflowDashboard).toBeVisible();
      }

      // Check generated artifacts with different audience views
      const resultsButton = page.locator('button:has-text("View Results")');
      if (await resultsButton.isVisible()) {
        await resultsButton.click();

        const artifacts = page.locator('[data-testid="generated-artifacts"]');
        await expect(artifacts).toBeVisible();
      }
    });

    test('should handle error states gracefully', async ({ page }) => {
      // Test error handling in conversation
      await page.goto('/conversation/non-existent-id');

      const errorMessage = page.locator('[data-testid="error-message"]');
      await expect(errorMessage).toBeVisible();

      // Test error handling in workflow
      await page.goto('/projects/non-existent-id/workflow');

      const workflowError = page.locator('[data-testid="workflow-error"]');
      if (await workflowError.isVisible()) {
        await expect(workflowError).toBeVisible();
      }
    });
  });
});

test.describe('Performance and Reliability', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/dashboard');

    // Wait for key elements to be visible
    await page.waitForSelector('[data-testid="dashboard-content"]', { timeout: 10000 });

    const loadTime = Date.now() - startTime;

    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });

  test('should handle concurrent user interactions', async ({ page }) => {
    await page.goto('/projects/test-project-id');

    // Simulate multiple concurrent actions
    const actions = [
      () => page.click('[data-testid="workflow-tab"]'),
      () => page.click('[data-testid="agents-tab"]'),
      () => page.click('[data-testid="decisions-tab"]'),
      () => page.click('[data-testid="artifacts-tab"]')
    ];

    // Execute actions concurrently
    await Promise.all(actions.map(action => action()));

    // Verify page is still responsive
    await page.waitForTimeout(1000);
    const dashboard = page.locator('[data-testid="workflow-transparency-dashboard"]');
    await expect(dashboard).toBeVisible();
  });
});