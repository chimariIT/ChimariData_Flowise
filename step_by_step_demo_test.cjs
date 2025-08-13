const puppeteer = require('puppeteer');

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
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_1_homepage.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_1_homepage.png');

    // Step 2: Go to login page
    console.log('📍 Step 2: Going to login page...');
    try {
      await page.click('a[href="/auth"]', { timeout: 5000 });
    } catch {
      // Alternative: click login button or navigate directly
      await page.goto('http://localhost:5000/auth');
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_2_login.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_2_login.png');

    // Step 3: Login with test credentials
    console.log('📍 Step 3: Logging in...');
    await page.waitForSelector('input[type="email"]', { timeout: 5000 });
    await page.type('input[type="email"]', 'demo@test.com');
    await page.type('input[type="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_3_dashboard.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_3_dashboard.png');

    // Step 4: Navigate to project
    console.log('📍 Step 4: Navigating to test project...');
    await page.goto('http://localhost:5000/project/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_4_project_overview.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_4_project_overview.png');

    // Step 5: Go to Transform tab
    console.log('📍 Step 5: Opening Transform tab...');
    try {
      await page.click('button:has-text("Transform")', { timeout: 5000 });
    } catch {
      await page.click('button:contains("Transform")');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_5_transform_tab.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_5_transform_tab.png');

    // Step 6: Go to Visualization tab
    console.log('📍 Step 6: Opening Visualization workshop...');
    await page.goto('http://localhost:5000/visualization/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_6_visualization_workshop.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_6_visualization_workshop.png');

    // Step 7: Show available chart types
    console.log('📍 Step 7: Showing available chart types...');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_7_chart_types.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_7_chart_types.png');

    // Step 8: Select bar chart and configure
    console.log('📍 Step 8: Selecting and configuring bar chart...');
    const barChartSelector = '.cursor-pointer:has-text("Bar Chart")';
    try {
      await page.click(barChartSelector, { timeout: 3000 });
    } catch {
      console.log('Trying alternative bar chart selector...');
      await page.click('text=Bar Chart');
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'demo_step_8_bar_chart_selected.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_8_bar_chart_selected.png');

    // Step 9: Go back to Analysis tab for consistency check
    console.log('📍 Step 9: Testing Analysis tab for chart consistency...');
    await page.goto('http://localhost:5000/project/6sj8LM72bvqz0fcLiFsPL');
    await page.waitForTimeout(2000);
    
    // Click Analysis tab
    try {
      await page.click('button:has-text("Analysis")', { timeout: 5000 });
    } catch {
      await page.click('text=Analysis');
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'demo_step_9_analysis_tab.png', fullPage: true });
    console.log('✅ Screenshot saved: demo_step_9_analysis_tab.png');

    console.log('✅ Demo completed successfully! All screenshots saved.');
    console.log('📊 Generated demo files:');
    console.log('   • demo_step_1_homepage.png - Homepage');
    console.log('   • demo_step_2_login.png - Login page');
    console.log('   • demo_step_3_dashboard.png - Dashboard after login');
    console.log('   • demo_step_4_project_overview.png - Project overview');
    console.log('   • demo_step_5_transform_tab.png - Transform tab');
    console.log('   • demo_step_6_visualization_workshop.png - Visualization workshop');
    console.log('   • demo_step_7_chart_types.png - Available chart types');
    console.log('   • demo_step_8_bar_chart_selected.png - Bar chart selection');
    console.log('   • demo_step_9_analysis_tab.png - Analysis tab consistency check');

  } catch (error) {
    console.error('❌ Demo failed:', error);
    await page.screenshot({ path: 'demo_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

demonstrateWorkflow();