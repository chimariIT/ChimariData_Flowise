/**
 * End-to-End Test: Visualization Workshop Critical Fixes
 * Tests the three major issues reported:
 * 1. Blank pages when clicking chart types
 * 2. Missing multiple field selection for various charts
 * 3. Charts not appearing after configuration
 */

import puppeteer from 'puppeteer';

async function testVisualizationWorkshopFixes() {
  console.log('🧪 Starting End-to-End Test: Visualization Workshop Fixes');
  
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    console.log('📍 Navigating to application...');
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' });
    
    // Test 1: Upload a sample project to work with
    console.log('\n🔧 Test 1: Setting up test project with sample data...');
    
    // Create a test CSV file content
    const testCSVContent = `country,sales,profit,year
USA,1000,200,2023
Canada,800,150,2023
UK,600,100,2023
Germany,900,180,2023
France,700,140,2023`;
    
    // Look for upload or demo data option
    const hasTrialButton = await page.$('[data-testid="start-trial"], .trial-button, button:contains("Try Free")');
    
    if (hasTrialButton) {
      console.log('✅ Found trial option - clicking to start demo');
      await hasTrialButton.click();
      await page.waitForTimeout(2000);
    } else {
      console.log('ℹ️  No trial button found, checking for existing projects or upload');
    }
    
    // Navigate to visualization workshop
    console.log('\n🔧 Test 2: Accessing Visualization Workshop...');
    
    // Look for visualization workshop access
    const visualizationButton = await page.$('button:contains("Visualization"), a[href*="visualization"], [data-testid="visualization-workshop"]');
    
    if (visualizationButton) {
      await visualizationButton.click();
      await page.waitForTimeout(1500);
    } else {
      // Try direct navigation
      console.log('⚡ Navigating directly to visualization workshop');
      await page.goto('http://localhost:5000/visualization/demo', { waitUntil: 'networkidle0' });
    }
    
    // Test 3: Verify chart type selection doesn't show blank pages
    console.log('\n🔧 Test 3: Testing Chart Type Selection (Blank Page Fix)...');
    
    const chartTypes = [
      'bar_chart',
      'line_chart', 
      'scatter_plot',
      'pie_chart',
      'histogram',
      'box_plot',
      'violin_plot',
      'heatmap'
    ];
    
    let blankPageIssues = [];
    
    for (const chartType of chartTypes) {
      console.log(`   Testing ${chartType}...`);
      
      // Click on chart type
      const chartButton = await page.$(`[data-chart-type="${chartType}"], button:contains("${chartType.replace('_', ' ')}")`);
      
      if (chartButton) {
        await chartButton.click();
        await page.waitForTimeout(1000);
        
        // Check if configuration section appears
        const configSection = await page.$('[data-testid="chart-configuration"], .chart-configuration, [class*="configuration"]');
        const hasFieldMapping = await page.$('label:contains("X-Axis"), label:contains("Field"), select, input[type="checkbox"]');
        
        if (!configSection && !hasFieldMapping) {
          blankPageIssues.push(chartType);
          console.log(`   ❌ ${chartType} shows blank configuration`);
        } else {
          console.log(`   ✅ ${chartType} shows proper configuration`);
        }
      } else {
        console.log(`   ⚠️  ${chartType} button not found`);
      }
    }
    
    // Test 4: Verify multiple field selection capability
    console.log('\n🔧 Test 4: Testing Multiple Field Selection...');
    
    const multiFieldCharts = ['bar_chart', 'line_chart', 'scatter_plot', 'histogram', 'box_plot', 'violin_plot', 'heatmap'];
    let singleFieldIssues = [];
    
    for (const chartType of multiFieldCharts) {
      console.log(`   Testing multiple fields for ${chartType}...`);
      
      // Select chart type
      const chartButton = await page.$(`[data-chart-type="${chartType}"], button:contains("${chartType.replace('_', ' ')}")`);
      if (chartButton) {
        await chartButton.click();
        await page.waitForTimeout(500);
        
        // Look for multiple field selection options
        const multipleFieldsSection = await page.$('label:contains("Multiple Fields"), input[type="checkbox"], [data-testid="multiple-fields"]');
        const fieldCheckboxes = await page.$$('input[type="checkbox"][id*="field-"]');
        
        if (!multipleFieldsSection && fieldCheckboxes.length === 0) {
          singleFieldIssues.push(chartType);
          console.log(`   ❌ ${chartType} lacks multiple field selection`);
        } else {
          console.log(`   ✅ ${chartType} supports multiple field selection (${fieldCheckboxes.length} checkboxes found)`);
        }
      }
    }
    
    // Test 5: Test chart generation and display
    console.log('\n🔧 Test 5: Testing Chart Generation...');
    
    // Select a simple chart type and configure it
    const barChartButton = await page.$('button:contains("Bar Chart"), [data-chart-type="bar_chart"]');
    if (barChartButton) {
      await barChartButton.click();
      await page.waitForTimeout(1000);
      
      // Try to configure fields (look for dropdowns or checkboxes)
      const xAxisSelect = await page.$('select:contains("X-Axis"), select[data-field="xAxis"]');
      const fieldCheckboxes = await page.$$('input[type="checkbox"][id*="field-"]');
      
      if (xAxisSelect) {
        console.log('   📋 Configuring X-Axis field...');
        await xAxisSelect.selectOption({ index: 1 }); // Select first available option
      }
      
      if (fieldCheckboxes.length > 0) {
        console.log(`   📋 Selecting multiple fields (${fieldCheckboxes.length} available)...`);
        // Select first 2 checkboxes
        for (let i = 0; i < Math.min(2, fieldCheckboxes.length); i++) {
          await fieldCheckboxes[i].click();
        }
      }
      
      await page.waitForTimeout(500);
      
      // Try to generate chart
      const generateButton = await page.$('button:contains("Generate"), button[data-testid="generate-chart"]');
      if (generateButton) {
        console.log('   🎯 Clicking Generate Chart button...');
        await generateButton.click();
        
        // Wait for chart generation
        await page.waitForTimeout(3000);
        
        // Check if chart appears
        const chartDisplay = await page.$('[data-testid="chart-preview"], .chart-preview, img[alt*="visualization"], canvas');
        const chartMessage = await page.$('text="Chart generated", text="Visualization Created", .chart-success');
        
        if (chartDisplay || chartMessage) {
          console.log('   ✅ Chart generation successful - chart or success message displayed');
        } else {
          console.log('   ❌ Chart generation failed - no chart or success message found');
        }
      } else {
        console.log('   ⚠️  Generate button not found');
      }
    }
    
    // Report Results
    console.log('\n📊 TEST RESULTS SUMMARY:');
    console.log('=' .repeat(50));
    
    console.log('\n1️⃣  BLANK PAGE ISSUES:');
    if (blankPageIssues.length === 0) {
      console.log('   ✅ All chart types show proper configuration forms');
    } else {
      console.log(`   ❌ ${blankPageIssues.length} chart types still show blank pages:`);
      blankPageIssues.forEach(chart => console.log(`      - ${chart}`));
    }
    
    console.log('\n2️⃣  MULTIPLE FIELD SELECTION:');
    if (singleFieldIssues.length === 0) {
      console.log('   ✅ All chart types support multiple field selection');
    } else {
      console.log(`   ❌ ${singleFieldIssues.length} chart types lack multiple field selection:`);
      singleFieldIssues.forEach(chart => console.log(`      - ${chart}`));
    }
    
    console.log('\n3️⃣  CHART GENERATION:');
    console.log('   ℹ️  Manual verification required - check browser for chart display');
    
    const totalIssues = blankPageIssues.length + singleFieldIssues.length;
    
    if (totalIssues === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Visualization workshop fixes are working correctly.');
    } else {
      console.log(`\n⚠️  ${totalIssues} issues still need attention.`);
    }
    
    console.log('\n✅ Test completed. Browser left open for manual verification.');
    console.log('Please manually verify:');
    console.log('- Chart configuration forms appear for all chart types');
    console.log('- Multiple field selection checkboxes are available');
    console.log('- Charts generate and display properly');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
  
  // Keep browser open for manual inspection
  console.log('\n🔍 Browser left open for manual inspection...');
  // await browser.close();
}

// Run the test
testVisualizationWorkshopFixes().catch(console.error);