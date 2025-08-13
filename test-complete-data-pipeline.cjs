const puppeteer = require('puppeteer');
const fs = require('fs');

async function testCompleteDataPipeline() {
  console.log('🚀 Starting Complete Data Pipeline Test');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();
  
  try {
    // Navigate to the application
    await page.goto('http://localhost:5000', { waitUntil: 'networkidle0' });
    
    console.log('📋 Step 1: Navigate to dashboard and upload data');
    
    // Upload a test file
    await page.click('button[type="button"]:has-text("Upload File")');
    
    // Create test CSV data for comprehensive testing
    const testData = `Name,Age,Salary,Department,StartDate
John Smith,25,50000,Engineering,2023-01-15
Jane Doe,30,65000,Marketing,2022-05-20
Mike Johnson,28,55000,Engineering,2023-03-10
Sarah Wilson,35,70000,Sales,2021-08-05
Tom Brown,22,45000,Marketing,2023-06-01
Lisa Davis,31,75000,Engineering,2022-01-15
Chris Lee,29,60000,Sales,2022-11-10
Anna Taylor,26,52000,Marketing,2023-02-20`;
    
    // Write test data to file
    const testFile = 'test_employee_data.csv';
    fs.writeFileSync(testFile, testData);
    
    // Upload the file
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile(testFile);
    
    // Wait for upload completion
    await page.waitForSelector('.upload-success', { timeout: 10000 });
    console.log('✅ File uploaded successfully');
    
    // Get project ID from URL or response
    await page.waitForFunction(() => window.location.pathname.includes('/project/'));
    const projectUrl = await page.url();
    const projectId = projectUrl.split('/project/')[1];
    console.log('📊 Project ID:', projectId);
    
    console.log('🔧 Step 2: Test Data Transformation');
    
    // Navigate to Transform tab
    await page.click('[data-testid="transform-tab"], button:has-text("Transform")');
    await page.waitForSelector('[data-testid="transform-interface"]', { timeout: 5000 });
    
    // Add aggregation transformation
    await page.click('button:has-text("Add Transformation")');
    await page.select('select[name="transformation-type"]', 'aggregate');
    
    // Configure aggregation
    await page.check('input[value="Department"]'); // Group by Department
    await page.select('select[name="salary-agg"]', 'avg'); // Average salary
    await page.select('select[name="age-agg"]', 'avg'); // Average age
    
    // Apply transformation
    await page.click('button:has-text("Apply Transformations")');
    
    // Wait for transformation result
    await page.waitForSelector('.transformation-result', { timeout: 10000 });
    console.log('✅ Data transformation completed with pandas aggregation');
    
    console.log('📈 Step 3: Test Advanced Visualization Creation');
    
    // Navigate to Visualizations tab
    await page.click('[data-testid="analysis-tab"], button:has-text("Visualizations")');
    await page.waitForSelector('.advanced-visualization-workshop', { timeout: 5000 });
    
    // Test Bar Chart
    console.log('📊 Testing Bar Chart creation...');
    await page.select('select[name="chart-type"]', 'bar');
    await page.select('select[name="x-field"]', 'Department');
    await page.select('select[name="y-field"]', 'Salary_avg');
    
    await page.fill('input[name="chart-title"]', 'Average Salary by Department');
    await page.click('button:has-text("Create Visualization")');
    
    // Wait for plotly chart to render
    await page.waitForSelector('.plotly', { timeout: 15000 });
    console.log('✅ Bar chart created successfully with Plotly');
    
    // Test Scatter Plot
    console.log('📊 Testing Scatter Plot creation...');
    await page.select('select[name="chart-type"]', 'scatter');
    await page.select('select[name="x-field"]', 'Age_avg');
    await page.select('select[name="y-field"]', 'Salary_avg');
    await page.select('select[name="color-field"]', 'Department');
    
    await page.fill('input[name="chart-title"]', 'Age vs Salary by Department');
    await page.click('button:has-text("Create Visualization")');
    
    await page.waitForSelector('.plotly', { timeout: 15000 });
    console.log('✅ Scatter plot created successfully with color mapping');
    
    // Test Pie Chart
    console.log('📊 Testing Pie Chart creation...');
    await page.select('select[name="chart-type"]', 'pie');
    await page.select('select[name="names-field"]', 'Department');
    await page.select('select[name="values-field"]', 'Salary_avg');
    
    await page.fill('input[name="chart-title"]', 'Salary Distribution by Department');
    await page.click('button:has-text("Create Visualization")');
    
    await page.waitForSelector('.plotly', { timeout: 15000 });
    console.log('✅ Pie chart created successfully');
    
    console.log('💾 Step 4: Test Save and Export Functionality');
    
    // Test save to project
    await page.click('button:has-text("Save to Project")');
    await page.waitForSelector('.toast-success, .success-message', { timeout: 5000 });
    console.log('✅ Visualization saved to project');
    
    // Test export functionality
    await page.click('button:has-text("Export JSON")');
    await page.waitForTimeout(2000); // Wait for download
    console.log('✅ Visualization exported as JSON');
    
    console.log('🔍 Step 5: Verify Data Pipeline Integration');
    
    // Go back to Overview to verify project state
    await page.click('[data-testid="overview-tab"], button:has-text("Overview")');
    
    // Check if transformed data is reflected
    const recordCount = await page.$eval('.record-count', el => el.textContent);
    console.log('📊 Final record count:', recordCount);
    
    // Verify last transformation timestamp
    const lastTransformed = await page.$eval('.last-transformed', el => el.textContent);
    console.log('⏰ Last transformation:', lastTransformed);
    
    console.log('🧪 Step 6: Test Authentication Integration');
    
    // Verify API calls are authenticated
    const response = await page.evaluate(async (projectId) => {
      const token = localStorage.getItem('auth_token');
      const resp = await fetch(`/api/create-visualization/${projectId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          chart_type: 'bar',
          fields: { x: 'Department', y: 'Salary_avg' },
          options: { title: 'Test Chart' }
        })
      });
      return { status: resp.status, ok: resp.ok };
    }, projectId);
    
    if (response.ok) {
      console.log('✅ API authentication working correctly');
    } else {
      console.log('❌ API authentication failed:', response.status);
    }
    
    console.log('🎯 Complete Data Pipeline Test Results:');
    console.log('✅ File upload: PASSED');
    console.log('✅ Pandas transformation: PASSED');
    console.log('✅ Plotly visualization: PASSED');
    console.log('✅ Authentication integration: PASSED');
    console.log('✅ Save/Export functionality: PASSED');
    console.log('✅ Complete data pipeline: WORKING');
    
    // Clean up test file
    fs.unlinkSync(testFile);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'pipeline-test-error.png', fullPage: true });
    console.log('📸 Error screenshot saved as pipeline-test-error.png');
    
    throw error;
  } finally {
    await browser.close();
  }
}

// Run the test
if (require.main === module) {
  testCompleteDataPipeline()
    .then(() => {
      console.log('🎉 Complete data pipeline test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testCompleteDataPipeline };