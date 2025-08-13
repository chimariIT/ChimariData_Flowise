const puppeteer = require('puppeteer');
const fs = require('fs');

async function demonstrateWorkflow() {
  console.log('🚀 Starting comprehensive transformation and visualization demo...');
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  try {
    // Step 1: Navigate to home page
    console.log('📍 Step 1: Navigating to home page...');
    await page.goto('http://localhost:5000');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'demo_step_1_homepage.png' });
    console.log('✅ Screenshot saved: demo_step_1_homepage.png');

    // Step 2: Go to login page
    console.log('📍 Step 2: Going to login page...');
    await page.click('a[href="/auth"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'demo_step_2_login.png' });
    console.log('✅ Screenshot saved: demo_step_2_login.png');

    // Step 3: Login with test credentials
    console.log('📍 Step 3: Logging in...');
    await page.fill('input[type="email"]', 'demo@test.com');
    await page.fill('input[type="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'demo_step_3_dashboard.png' });
    console.log('✅ Screenshot saved: demo_step_3_dashboard.png');

    // Step 4: Navigate to project
    console.log('📍 Step 4: Navigating to test project...');
    await page.goto('http://localhost:5000/project/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'demo_step_4_project_overview.png' });
    console.log('✅ Screenshot saved: demo_step_4_project_overview.png');

    // Step 5: Go to Transform tab
    console.log('📍 Step 5: Opening Transform tab...');
    await page.click('[data-tab="transform"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_5_transform_tab.png' });
    console.log('✅ Screenshot saved: demo_step_5_transform_tab.png');

    // Step 6: Add aggregation transformation
    console.log('📍 Step 6: Adding aggregation transformation...');
    await page.click('button:has-text("Add Transformation")');
    await page.waitForTimeout(1000);
    await page.selectOption('select', 'aggregate');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'demo_step_6_transformation_config.png' });
    console.log('✅ Screenshot saved: demo_step_6_transformation_config.png');

    // Step 7: Configure aggregation
    console.log('📍 Step 7: Configuring aggregation...');
    // Select grouping field
    await page.selectOption('[data-testid="group-by-select"]', 'Category');
    
    // Add aggregation - Sales sum
    await page.click('button:has-text("Add Aggregation")');
    await page.selectOption('[data-testid="agg-column-0"]', 'Sales');
    await page.selectOption('[data-testid="agg-operation-0"]', 'sum');
    await page.fill('[data-testid="agg-alias-0"]', 'Total_Sales');
    
    // Add another aggregation - Units average
    await page.click('button:has-text("Add Aggregation")');
    await page.selectOption('[data-testid="agg-column-1"]', 'Units');
    await page.selectOption('[data-testid="agg-operation-1"]', 'avg');
    await page.fill('[data-testid="agg-alias-1"]', 'Avg_Units');
    
    await page.screenshot({ path: 'demo_step_7_aggregation_configured.png' });
    console.log('✅ Screenshot saved: demo_step_7_aggregation_configured.png');

    // Step 8: Apply transformation
    console.log('📍 Step 8: Applying transformation...');
    await page.click('button:has-text("Apply Transformations")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_8_transformation_applied.png' });
    console.log('✅ Screenshot saved: demo_step_8_transformation_applied.png');

    // Step 9: Go to Visualization tab
    console.log('📍 Step 9: Opening Visualization workshop...');
    await page.goto('http://localhost:5000/visualization/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'demo_step_9_visualization_workshop.png' });
    console.log('✅ Screenshot saved: demo_step_9_visualization_workshop.png');

    // Step 10: Select bar chart
    console.log('📍 Step 10: Selecting bar chart visualization...');
    await page.click('[data-viz-type="bar_chart"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_10_bar_chart_selected.png' });
    console.log('✅ Screenshot saved: demo_step_10_bar_chart_selected.png');

    // Step 11: Configure bar chart fields
    console.log('📍 Step 11: Configuring chart fields...');
    
    // Select X-axis field
    await page.selectOption('[data-field="xAxis"]', 'Category');
    await page.waitForTimeout(1000);
    
    // Select Y-axis field
    await page.selectOption('[data-field="yAxis"]', 'Sales');
    await page.waitForTimeout(1000);
    
    await page.screenshot({ path: 'demo_step_11_fields_configured.png' });
    console.log('✅ Screenshot saved: demo_step_11_fields_configured.png');

    // Step 12: Create visualization
    console.log('📍 Step 12: Creating visualization...');
    await page.click('button:has-text("Create Visualization")');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'demo_step_12_visualization_created.png' });
    console.log('✅ Screenshot saved: demo_step_12_visualization_created.png');

    // Step 13: Try different chart types
    console.log('📍 Step 13: Testing different chart types...');
    
    // Test line chart
    await page.click('[data-viz-type="line_chart"]');
    await page.waitForTimeout(1000);
    await page.selectOption('[data-field="xAxis"]', 'Quarter');
    await page.selectOption('[data-field="yAxis"]', 'Sales');
    await page.click('button:has-text("Create Visualization")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_13a_line_chart.png' });
    console.log('✅ Screenshot saved: demo_step_13a_line_chart.png');
    
    // Test scatter plot
    await page.click('[data-viz-type="scatter_plot"]');
    await page.waitForTimeout(1000);
    await page.selectOption('[data-field="xAxis"]', 'Units');
    await page.selectOption('[data-field="yAxis"]', 'Sales');
    await page.click('button:has-text("Create Visualization")');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_13b_scatter_plot.png' });
    console.log('✅ Screenshot saved: demo_step_13b_scatter_plot.png');

    // Step 14: Go back to Analysis tab to test chart consistency
    console.log('📍 Step 14: Testing Analysis tab chart types consistency...');
    await page.goto('http://localhost:5000/project/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForLoadState('networkidle');
    await page.click('[data-tab="analysis"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_14_analysis_tab.png' });
    console.log('✅ Screenshot saved: demo_step_14_analysis_tab.png');

    console.log('✅ Demo completed successfully! All screenshots saved.');
    console.log('📊 Generated demo files:');
    console.log('   • demo_step_1_homepage.png - Homepage');
    console.log('   • demo_step_2_login.png - Login page');
    console.log('   • demo_step_3_dashboard.png - Dashboard after login');
    console.log('   • demo_step_4_project_overview.png - Project overview');
    console.log('   • demo_step_5_transform_tab.png - Transform tab');
    console.log('   • demo_step_6_transformation_config.png - Transformation configuration');
    console.log('   • demo_step_7_aggregation_configured.png - Aggregation settings');
    console.log('   • demo_step_8_transformation_applied.png - Applied transformation');
    console.log('   • demo_step_9_visualization_workshop.png - Visualization workshop');
    console.log('   • demo_step_10_bar_chart_selected.png - Bar chart selection');
    console.log('   • demo_step_11_fields_configured.png - Field configuration');
    console.log('   • demo_step_12_visualization_created.png - Visualization result');
    console.log('   • demo_step_13a_line_chart.png - Line chart example');
    console.log('   • demo_step_13b_scatter_plot.png - Scatter plot example');
    console.log('   • demo_step_14_analysis_tab.png - Analysis tab chart types');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    await page.screenshot({ path: 'demo_error.png' });
  } finally {
    await browser.close();
  }
}

demonstrateWorkflow();