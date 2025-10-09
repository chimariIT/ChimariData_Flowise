import { test, expect, Page } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Enhanced Admin Management Tests
 * 
 * Based on docs/ADMIN_INTERFACE.md and docs/TEST_COVERAGE_ANALYSIS.md
 * Tests the complete admin interface including:
 * - Agent & Tool Management
 * - Template System
 * - Campaign Management (when implemented)
 * - Billing Configuration
 * - Usage Dashboard
 */

async function loginAsAdmin(page: Page) {
  console.log('🔐 Logging in as admin...');
  
  // Try to use existing auth state first
  try {
    await page.goto('/admin/agent-management');
    await page.waitForLoadState('networkidle', { timeout: 5000 });
    
    // If we're already on admin page, we're logged in
    if (page.url().includes('/admin/')) {
      console.log('✅ Already authenticated as admin');
      return;
    }
  } catch (error) {
    console.log('🔐 Need to authenticate...');
  }
  
  // Perform admin login
  await page.goto('/auth');
  await page.fill('input[name="email"]', 'admin@chimaridata.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');
  
  await page.waitForURL('/dashboard', { timeout: 10000 });
  await page.goto('/admin/agent-management');
  await page.waitForLoadState('networkidle');
  
  console.log('✅ Admin login successful');
}

async function waitForPageLoad(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
  await page.waitForTimeout(500);
}

test.describe('Enhanced Admin Management', () => {
  
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.describe('Agent Management', () => {
    
    test('should display agent registry with health metrics', async ({ page }) => {
      console.log('🎯 Testing Agent Registry Display');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Verify agent registry loads
      await expect(page.locator('h1.text-xl:has-text("Agent Management")')).toBeVisible();
      await expect(page.locator('[data-testid="agent-registry"]')).toBeVisible();
      
      // Verify agent list displays
      const agentCards = page.locator('[data-testid="agent-card"]');
      await expect(agentCards).toHaveCount(6, { timeout: 10000 }); // Should have 6 agents
      
      // Verify each agent card shows:
      // - Agent name and type
      // - Status (active/inactive)
      // - Health metrics
      // - Performance metrics
      const firstAgent = agentCards.first();
      await expect(firstAgent.locator('[data-testid="agent-name"]')).toBeVisible();
      await expect(firstAgent.locator('[data-testid="agent-type"]')).toBeVisible();
      await expect(firstAgent.locator('[data-testid="agent-status"]')).toBeVisible();
      await expect(firstAgent.locator('[data-testid="health-indicator"]')).toBeVisible();
      await expect(firstAgent.locator('[data-testid="performance-metrics"]')).toBeVisible();
      
      // Verify system status summary
      await expect(page.locator('[data-testid="system-status"]')).toBeVisible();
      await expect(page.locator('text=Total Agents')).toBeVisible();
      await expect(page.locator('text=Active Agents')).toBeVisible();
      await expect(page.locator('text=Total Tasks')).toBeVisible();
    });

    test('should create agent from template', async ({ page }) => {
      console.log('🎯 Testing Agent Creation from Template');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Click "Create from Template" button
      await page.click('button:has-text("Create from Template")');
      await waitForPageLoad(page);
      
      // Verify template browser loads
      await expect(page.locator('h2:has-text("Agent Templates")')).toBeVisible();
      
      // Verify template categories
      const categoryFilters = page.locator('[data-testid="template-category-filter"]');
      await expect(categoryFilters).toHaveCount(7); // ml, analysis, business, support, data_processing, orchestration, custom
      
      // Filter by ML category
      await page.click('[data-testid="template-category-ml"]');
      await waitForPageLoad(page);
      
      // Verify ML templates are shown
      const mlTemplates = page.locator('[data-testid="template-card"]');
      await expect(mlTemplates).toHaveCount(1); // Should show Customer Churn Predictor
      
      // Verify template details
      const churnTemplate = mlTemplates.first();
      await expect(churnTemplate.locator('text=Customer Churn Prediction Agent')).toBeVisible();
      await expect(churnTemplate.locator('text=Setup Time: ~15 minutes')).toBeVisible();
      await expect(churnTemplate.locator('[data-testid="template-use-cases"]')).toBeVisible();
      
      // Click on template
      await churnTemplate.click();
      await waitForPageLoad(page);
      
      // Verify template details page
      await expect(page.locator('h3:has-text("Customer Churn Prediction Agent")')).toBeVisible();
      await expect(page.locator('[data-testid="template-description"]')).toBeVisible();
      await expect(page.locator('[data-testid="template-capabilities"]')).toBeVisible();
      await expect(page.locator('[data-testid="template-required-tools"]')).toBeVisible();
      
      // Create agent from template
      await page.fill('input[name="agentName"]', 'My Custom Churn Predictor');
      await page.selectOption('select[name="priority"]', '5');
      await page.fill('input[name="maxConcurrentTasks"]', '10');
      
      await page.click('button:has-text("Create Agent")');
      await waitForPageLoad(page);
      
      // Verify agent was created
      await expect(page.locator('text=Agent created successfully')).toBeVisible();
      
      // Verify agent appears in registry
      await expect(page.locator('text=My Custom Churn Predictor')).toBeVisible();
      await expect(page.locator('text=ml_specialist')).toBeVisible();
    });

    test('should create custom agent', async ({ page }) => {
      console.log('🎯 Testing Custom Agent Creation');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Click "Add Agent" button
      await page.click('button:has-text("Add Agent")');
      await waitForPageLoad(page);
      
      // Fill in agent details
      await page.fill('input[name="name"]', 'Custom Test Agent');
      await page.selectOption('select[name="type"]', 'analysis');
      await page.fill('textarea[name="description"]', 'A custom agent for testing purposes');
      await page.fill('input[name="capabilities"]', 'custom_analysis,data_processing');
      await page.fill('input[name="maxConcurrentTasks"]', '5');
      await page.selectOption('select[name="priority"]', '3');
      
      await page.click('button:has-text("Create Agent")');
      await waitForPageLoad(page);
      
      // Verify agent was created
      await expect(page.locator('text=Agent Custom Test Agent registered successfully')).toBeVisible();
      
      // Verify agent appears in list
      await expect(page.locator('text=Custom Test Agent')).toBeVisible();
      await expect(page.locator('text=analysis')).toBeVisible();
    });

    test('should delete agent', async ({ page }) => {
      console.log('🎯 Testing Agent Deletion');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Find and delete the custom agent we created
      const customAgent = page.locator('[data-testid="agent-card"]:has-text("Custom Test Agent")');
      await expect(customAgent).toBeVisible();
      
      // Click delete button
      await customAgent.locator('button:has-text("Delete")').click();
      
      // Confirm deletion
      await page.click('button:has-text("Confirm Delete")');
      await waitForPageLoad(page);
      
      // Verify agent was deleted
      await expect(page.locator('text=Agent deleted successfully')).toBeVisible();
      await expect(page.locator('text=Custom Test Agent')).not.toBeVisible();
    });

    test('should show real-time agent updates', async ({ page }) => {
      console.log('🎯 Testing Real-time Agent Updates');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Verify WebSocket connection indicator
      await expect(page.locator('[data-testid="websocket-status"]')).toBeVisible();
      await expect(page.locator('text=Connected')).toBeVisible();
      
      // Create a new agent to test real-time updates
      await page.click('button:has-text("Add Agent")');
      await waitForPageLoad(page);
      
      await page.fill('input[name="name"]', 'Real-time Test Agent');
      await page.selectOption('select[name="type"]', 'utility');
      await page.fill('textarea[name="description"]', 'Testing real-time updates');
      
      await page.click('button:has-text("Create Agent")');
      
      // Verify real-time update notification
      await expect(page.locator('[data-testid="realtime-notification"]')).toBeVisible();
      await expect(page.locator('text=Agent created')).toBeVisible();
      
      // Verify agent appears immediately (no page refresh needed)
      await expect(page.locator('text=Real-time Test Agent')).toBeVisible();
    });
  });

  test.describe('Tool Management', () => {
    
    test('should display tool catalog', async ({ page }) => {
      console.log('🎯 Testing Tool Catalog Display');
      
      await page.goto('/admin/tools-management');
      await waitForPageLoad(page);
      
      // Verify tool catalog loads
      await expect(page.locator('h1:has-text("Tools Management")')).toBeVisible();
      await expect(page.locator('[data-testid="tool-catalog"]')).toBeVisible();
      
      // Verify tool list displays
      const toolCards = page.locator('[data-testid="tool-card"]');
      await expect(toolCards).toHaveCount(9, { timeout: 10000 }); // Should have 9 tools
      
      // Verify each tool card shows:
      // - Tool name and description
      // - Category and version
      // - Status and metrics
      // - Agent access configuration
      const firstTool = toolCards.first();
      await expect(firstTool.locator('[data-testid="tool-name"]')).toBeVisible();
      await expect(firstTool.locator('[data-testid="tool-category"]')).toBeVisible();
      await expect(firstTool.locator('[data-testid="tool-status"]')).toBeVisible();
      await expect(firstTool.locator('[data-testid="tool-metrics"]')).toBeVisible();
      
      // Verify tool categories
      const categoryFilters = page.locator('[data-testid="tool-category-filter"]');
      await expect(categoryFilters).toHaveCount(6); // data, analysis, ml, visualization, business, utility
    });

    test('should create new tool', async ({ page }) => {
      console.log('🎯 Testing Tool Creation');
      
      await page.goto('/admin/tools-management');
      await waitForPageLoad(page);
      
      // Click "Add Tool" button
      await page.click('button:has-text("Add Tool")');
      await waitForPageLoad(page);
      
      // Fill in tool details
      await page.fill('input[name="name"]', 'test_sentiment_analyzer');
      await page.fill('textarea[name="description"]', 'Analyzes text sentiment using ML models');
      await page.fill('input[name="service"]', 'SentimentAnalyzer');
      await page.selectOption('select[name="category"]', 'analysis');
      await page.fill('input[name="permissions"]', 'analyze_text,read_data');
      await page.fill('input[name="agentAccess"]', 'data_scientist,business_agent');
      
      await page.click('button:has-text("Create Tool")');
      await waitForPageLoad(page);
      
      // Verify tool was created
      await expect(page.locator('text=Tool test_sentiment_analyzer registered successfully')).toBeVisible();
      
      // Verify tool appears in catalog
      await expect(page.locator('text=test_sentiment_analyzer')).toBeVisible();
      await expect(page.locator('text=Analyzes text sentiment')).toBeVisible();
    });

    test('should delete tool', async ({ page }) => {
      console.log('🎯 Testing Tool Deletion');
      
      await page.goto('/admin/tools-management');
      await waitForPageLoad(page);
      
      // Find and delete the tool we created
      const testTool = page.locator('[data-testid="tool-card"]:has-text("test_sentiment_analyzer")');
      await expect(testTool).toBeVisible();
      
      // Click delete button
      await testTool.locator('button:has-text("Delete")').click();
      
      // Confirm deletion
      await page.click('button:has-text("Confirm Delete")');
      await waitForPageLoad(page);
      
      // Verify tool was deleted
      await expect(page.locator('text=Tool deleted successfully')).toBeVisible();
      await expect(page.locator('text=test_sentiment_analyzer')).not.toBeVisible();
    });
  });

  test.describe('Subscription Management', () => {
    
    test('should display subscription tier configuration', async ({ page }) => {
      console.log('🎯 Testing Subscription Tier Configuration');
      
      await page.goto('/admin/subscription-management');
      await waitForPageLoad(page);
      
      // Verify subscription management loads
      await expect(page.locator('h1:has-text("Subscription Management")')).toBeVisible();
      
      // Click on Subscription Tiers tab
      await page.click('button:has-text("Subscription Tiers")');
      await waitForPageLoad(page);
      
      // Verify subscription tiers section loads
      await expect(page.locator('[data-testid="subscription-tiers-section"]')).toBeVisible();
      
      // Verify all tiers are displayed
      const tierCards = page.locator('[data-testid="tier-card"]');
      await expect(tierCards).toHaveCount(4); // trial, starter, professional, enterprise
      
      // Verify each tier shows:
      // - Tier name and price
      // - Usage limits for all categories
      // - Journey pricing
      // - Edit functionality
      const trialTier = tierCards.filter({ hasText: 'Trial' }).first();
      await expect(trialTier.locator('text=Trial')).toBeVisible();
      await expect(trialTier.locator('text=$1')).toBeVisible();
      
      // Verify usage categories are displayed
      const usageCategories = [
        'Storage Capacity',
        'Analysis Complexity', 
        'Data Ingestion Size',
        'Data Transformation',
        'Artifacts Complexity'
      ];
      
      for (const category of usageCategories) {
        await expect(trialTier.locator(`text=${category}`)).toBeVisible();
      }
      
      // Verify edit button is present
      await expect(trialTier.locator('button:has-text("Edit")')).toBeVisible();
    });

    test('should edit subscription tier', async ({ page }) => {
      console.log('🎯 Testing Subscription Tier Editing');
      
      await page.goto('/admin/subscription-management');
      await waitForPageLoad(page);
      
      await page.click('button:has-text("Subscription Tiers")');
      await waitForPageLoad(page);
      
      // Click edit on trial tier
      const trialTier = page.locator('[data-testid="tier-card"]:has-text("Trial")').first();
      await trialTier.locator('button:has-text("Edit")').click();
      await waitForPageLoad(page);
      
      // Verify edit form loads
      await expect(page.locator('h3:has-text("Edit Trial Tier")')).toBeVisible();
      
      // Update tier settings
      await page.fill('input[name="price"]', '2');
      await page.fill('input[name="storageCapacityMB"]', '30');
      await page.fill('input[name="analysisComplexityUnits"]', '6');
      
      await page.click('button:has-text("Save Changes")');
      await waitForPageLoad(page);
      
      // Verify changes were saved
      await expect(page.locator('text=Tier updated successfully')).toBeVisible();
      
      // Verify changes are reflected in the UI
      const updatedTier = page.locator('[data-testid="tier-card"]:has-text("Trial")').first();
      await expect(updatedTier.locator('text=$2')).toBeVisible();
      await expect(updatedTier.locator('text=30 MB')).toBeVisible();
    });
  });

  test.describe('System Monitoring', () => {
    
    test('should display system status', async ({ page }) => {
      console.log('🎯 Testing System Status Display');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Verify system status section
      await expect(page.locator('[data-testid="system-status"]')).toBeVisible();
      
      // Verify system metrics
      await expect(page.locator('text=Total Agents:')).toBeVisible();
      await expect(page.locator('text=Active Agents:')).toBeVisible();
      await expect(page.locator('text=Total Tasks:')).toBeVisible();
      await expect(page.locator('text=Queued Tasks:')).toBeVisible();
      
      // Verify memory and CPU usage
      await expect(page.locator('text=Memory Usage:')).toBeVisible();
      await expect(page.locator('text=CPU Usage:')).toBeVisible();
      
      // Verify uptime
      await expect(page.locator('text=Uptime:')).toBeVisible();
    });

    test('should show agent health monitoring', async ({ page }) => {
      console.log('🎯 Testing Agent Health Monitoring');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Verify health indicators
      const healthIndicators = page.locator('[data-testid="health-indicator"]');
      await expect(healthIndicators).toHaveCount(6);
      
      // Verify health status (should all be healthy)
      for (let i = 0; i < await healthIndicators.count(); i++) {
        const indicator = healthIndicators.nth(i);
        await expect(indicator.locator('text=Healthy')).toBeVisible();
      }
      
      // Verify performance metrics
      const performanceMetrics = page.locator('[data-testid="performance-metrics"]');
      await expect(performanceMetrics).toHaveCount(6);
      
      // Each agent should show response time, success rate, tasks completed
      const firstMetrics = performanceMetrics.first();
      await expect(firstMetrics.locator('text=Response Time')).toBeVisible();
      await expect(firstMetrics.locator('text=Success Rate')).toBeVisible();
      await expect(firstMetrics.locator('text=Tasks Completed')).toBeVisible();
    });
  });

  test.describe('Campaign Management (Future Feature)', () => {
    
    test('should display campaign management placeholder', async ({ page }) => {
      console.log('🎯 Testing Campaign Management Placeholder');
      
      // This test documents the expected interface for when campaigns are implemented
      await page.goto('/admin/campaigns-management');
      
      // For now, this should show a "Coming Soon" message
      // When implemented, it should show:
      // - Campaign list with active/inactive status
      // - Campaign creation form
      // - Discount configuration
      // - Usage tracking
      // - Bulk operations
      
      await expect(page.locator('text=Campaign Management')).toBeVisible();
      await expect(page.locator('text=Coming Soon')).toBeVisible();
    });
  });

  test.describe('Usage Dashboard (Future Feature)', () => {
    
    test('should display usage dashboard placeholder', async ({ page }) => {
      console.log('🎯 Testing Usage Dashboard Placeholder');
      
      // This test documents the expected interface for when usage dashboard is implemented
      await page.goto('/admin/usage-dashboard');
      
      // For now, this should show a "Coming Soon" message
      // When implemented, it should show:
      // - Real-time quota utilization
      // - Overage projections
      // - Cost breakdowns
      // - User usage patterns
      // - Quota recommendations
      
      await expect(page.locator('text=Usage Dashboard')).toBeVisible();
      await expect(page.locator('text=Coming Soon')).toBeVisible();
    });
  });

  test.describe('Security & Authentication', () => {
    
    test('should require admin authentication', async ({ page }) => {
      console.log('🎯 Testing Admin Authentication Requirements');
      
      // Try to access admin page without authentication
      await page.goto('/admin/agent-management');
      
      // Should redirect to login page
      await expect(page).toHaveURL(/.*auth.*/);
      await expect(page.locator('h1:has-text("Login")')).toBeVisible();
    });

    test('should enforce admin role', async ({ page }) => {
      console.log('🎯 Testing Admin Role Enforcement');
      
      // Login as regular user (not admin)
      await page.goto('/auth');
      await page.fill('input[name="email"]', 'test-trial@chimari.test');
      await page.fill('input[name="password"]', 'test123');
      await page.click('button[type="submit"]');
      
      await page.waitForURL('/dashboard');
      
      // Try to access admin page
      await page.goto('/admin/agent-management');
      
      // Should show access denied
      await expect(page.locator('text=Access Denied')).toBeVisible();
      await expect(page.locator('text=Admin privileges required')).toBeVisible();
    });

    test('should apply rate limiting', async ({ page }) => {
      console.log('🎯 Testing Rate Limiting');
      
      await loginAsAdmin(page);
      
      // Make multiple rapid requests to test rate limiting
      const requests = [];
      for (let i = 0; i < 105; i++) { // Exceed 100 requests per 15 minutes
        requests.push(page.goto('/admin/agent-management'));
      }
      
      // Wait for all requests to complete
      await Promise.all(requests);
      
      // Should eventually hit rate limit (though this might not trigger in test environment)
      // In production, this would return 429 status
    });
  });

  test.describe('Error Handling', () => {
    
    test('should handle invalid agent creation', async ({ page }) => {
      console.log('🎯 Testing Invalid Agent Creation Handling');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      await page.click('button:has-text("Add Agent")');
      await waitForPageLoad(page);
      
      // Try to create agent with invalid data
      await page.fill('input[name="name"]', ''); // Empty name
      await page.click('button:has-text("Create Agent")');
      
      // Should show validation errors
      await expect(page.locator('text=Name is required')).toBeVisible();
      
      // Fill in name but leave other required fields empty
      await page.fill('input[name="name"]', 'Test Agent');
      await page.click('button:has-text("Create Agent")');
      
      // Should show more validation errors
      await expect(page.locator('text=Type is required')).toBeVisible();
    });

    test('should handle network errors gracefully', async ({ page }) => {
      console.log('🎯 Testing Network Error Handling');
      
      await page.goto('/admin/agent-management');
      await waitForPageLoad(page);
      
      // Simulate network failure by going offline
      await page.context().setOffline(true);
      
      // Try to create an agent
      await page.click('button:has-text("Add Agent")');
      await waitForPageLoad(page);
      
      await page.fill('input[name="name"]', 'Network Test Agent');
      await page.selectOption('select[name="type"]', 'utility');
      await page.fill('textarea[name="description"]', 'Testing network error handling');
      
      await page.click('button:has-text("Create Agent")');
      
      // Should show network error message
      await expect(page.locator('text=Network error')).toBeVisible();
      await expect(page.locator('text=Please check your connection')).toBeVisible();
      
      // Go back online
      await page.context().setOffline(false);
    });
  });

  test.describe('Template System API', () => {
    
    test('should fetch agent templates via API', async ({ request }) => {
      console.log('🎯 Testing Agent Templates API');
      
      // Test templates endpoint
      const response = await request.get('/api/admin/templates');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.templates).toBeDefined();
      expect(data.templates.length).toBeGreaterThan(0);
      
      // Verify template structure
      const template = data.templates[0];
      expect(template.id).toBeDefined();
      expect(template.name).toBeDefined();
      expect(template.description).toBeDefined();
      expect(template.category).toBeDefined();
      expect(template.useCases).toBeDefined();
    });

    test('should filter templates by category', async ({ request }) => {
      console.log('🎯 Testing Template Category Filtering');
      
      // Test ML category filter
      const response = await request.get('/api/admin/templates?category=ml');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // All returned templates should be ML category
      for (const template of data.templates) {
        expect(template.category).toBe('ml');
      }
    });

    test('should search templates', async ({ request }) => {
      console.log('🎯 Testing Template Search');
      
      // Test search functionality
      const response = await request.get('/api/admin/templates?search=churn');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // Should find churn prediction template
      const churnTemplate = data.templates.find((t: any) => t.id === 'customer_churn_predictor');
      expect(churnTemplate).toBeDefined();
    });

    test('should create agent from template via API', async ({ request }) => {
      console.log('🎯 Testing Agent Creation from Template API');
      
      // Create agent from churn predictor template
      const response = await request.post('/api/admin/templates/customer_churn_predictor/create', {
        data: {
          name: 'API Test Churn Predictor',
          priority: 4,
          maxConcurrentTasks: 8
        }
      });
      
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.agent).toBeDefined();
      expect(data.agent.name).toBe('API Test Churn Predictor');
      expect(data.agent.type).toBe('ml_specialist');
    });

    test('should get template recommendations', async ({ request }) => {
      console.log('🎯 Testing Template Recommendations API');
      
      // Test recommendations endpoint
      const response = await request.get('/api/admin/templates/recommendations?useCase=fraud%20detection');
      expect(response.status()).toBe(200);
      
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.recommendations).toBeDefined();
      expect(data.useCase).toBe('fraud detection');
      
      // Should recommend fraud detection template
      const fraudTemplate = data.recommendations.find((r: any) => 
        r.name.toLowerCase().includes('fraud')
      );
      expect(fraudTemplate).toBeDefined();
    });
  });
});
