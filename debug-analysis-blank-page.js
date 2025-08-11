// Debug script to identify why analysis tab shows blank page
const puppeteer = require('puppeteer');

async function debugAnalysisBlankPage() {
  console.log('🔍 Debugging Analysis Tab Blank Page Issue');
  
  let browser;
  try {
    browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    const page = await browser.newPage();
    
    // Set up console logging
    page.on('console', msg => {
      console.log(`[CONSOLE ${msg.type()}]:`, msg.text());
    });
    
    page.on('pageerror', error => {
      console.log(`[PAGE ERROR]:`, error.message);
    });
    
    page.on('requestfailed', request => {
      console.log(`[REQUEST FAILED]:`, request.url(), request.failure());
    });

    console.log('1. Loading homepage...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    // Check if we can get to a project page (mock authentication)
    console.log('2. Testing direct project page access...');
    await page.goto('http://localhost:5173/project/test-project', { waitUntil: 'networkidle0' });
    
    await page.waitForTimeout(3000);
    
    // Check if project page loaded
    const pageContent = await page.content();
    
    if (pageContent.includes('Project Not Found')) {
      console.log('❌ Project not found - need to upload data first');
      
      // Go back to home and try to create a project
      await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
      
      // Check if we can see upload interface
      const uploadButton = await page.$('input[type="file"]');
      if (uploadButton) {
        console.log('✅ Upload interface found');
      } else {
        console.log('❌ Upload interface not found');
      }
      
    } else if (pageContent.includes('Analysis')) {
      console.log('✅ Project page loaded with Analysis tab');
      
      // Try to click the analysis tab
      const analysisTab = await page.$('[data-value="analysis"], [value="analysis"]');
      if (analysisTab) {
        console.log('3. Clicking Analysis tab...');
        await analysisTab.click();
        await page.waitForTimeout(2000);
        
        // Check what's rendered in the analysis tab
        const analysisContent = await page.$eval('body', el => el.innerText);
        
        if (analysisContent.includes('Choose Analysis Type') || analysisContent.includes('Analysis Not Available')) {
          console.log('✅ Analysis component loaded');
          
          if (analysisContent.includes('Analysis Not Available')) {
            console.log('⚠️  Analysis shows "Not Available" - project data missing');
          } else {
            console.log('✅ Analysis component working correctly');
          }
        } else {
          console.log('❌ Analysis tab appears blank');
          console.log('Current page text (first 500 chars):', analysisContent.substring(0, 500));
        }
        
      } else {
        console.log('❌ Could not find Analysis tab');
      }
      
    } else {
      console.log('⚠️  Unknown page state');
      console.log('Page title:', await page.title());
      console.log('Page URL:', page.url());
    }

    console.log('\n📊 DIAGNOSIS COMPLETE');
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugAnalysisBlankPage().catch(console.error);