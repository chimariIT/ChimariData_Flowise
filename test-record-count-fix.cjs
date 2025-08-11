#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function testRecordCountFix() {
  console.log("🧪 Testing record count display fix...");
  
  const browser = await puppeteer.launch({ 
    headless: false,
    slowMo: 500,
    defaultViewport: { width: 1280, height: 800 }
  });
  
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:5000');
    
    console.log("✅ Navigated to application");
    
    // Wait for the page to load
    await page.waitForSelector('[data-testid="demo-button"], .btn, button', { timeout: 10000 });
    
    // Look for demo or get started button
    const demoButton = await page.$('[data-testid="demo-button"]') || 
                       await page.$('button:has-text("Try Live Demo")') ||
                       await page.$('button:has-text("Get Started")') ||
                       await page.$('button:has-text("Analyze Your Data")');
    
    if (demoButton) {
      console.log("🎯 Found demo/get started button");
      await demoButton.click();
      await page.waitForTimeout(2000);
    }
    
    // Check if there's a file upload area
    const uploadArea = await page.$('[data-testid="upload-area"], .dropzone, input[type="file"]');
    
    if (uploadArea) {
      console.log("📁 Found upload area");
      
      // Create test CSV with known record count
      const testData = [
        "name,age,city,salary",
        "John Doe,30,New York,50000",
        "Jane Smith,25,Los Angeles,55000", 
        "Bob Johnson,35,Chicago,60000",
        "Alice Brown,28,Houston,52000",
        "Charlie Wilson,32,Phoenix,58000"
      ].join('\n');
      
      const testFile = path.join(__dirname, 'test_record_count.csv');
      fs.writeFileSync(testFile, testData);
      
      console.log("📄 Created test CSV with 5 data records");
      
      // Upload the file
      const fileInput = await page.$('input[type="file"]');
      if (fileInput) {
        await fileInput.uploadFiles(testFile);
        console.log("⬆️ Uploaded test file");
        
        // Wait for upload completion and look for record count display
        const maxWait = 30000; // 30 seconds
        const startTime = Date.now();
        
        let recordCountFound = false;
        
        while (Date.now() - startTime < maxWait && !recordCountFound) {
          try {
            // Look for success messages or record count displays
            const successElements = await page.$$eval('*', elements => {
              return elements
                .filter(el => el.textContent && (
                  el.textContent.includes('record') ||
                  el.textContent.includes('data') ||
                  el.textContent.includes('success') ||
                  el.textContent.includes('complete')
                ))
                .map(el => el.textContent.trim())
                .filter(text => text.length > 0);
            });
            
            console.log("🔍 Current page text containing 'record':", successElements);
            
            // Check if record count is displayed correctly
            const recordCountText = successElements.find(text => 
              /\b5\b/.test(text) && text.includes('record')
            );
            
            if (recordCountText) {
              console.log("✅ FOUND RECORD COUNT: " + recordCountText);
              recordCountFound = true;
              break;
            }
            
            await page.waitForTimeout(1000);
          } catch (error) {
            console.log("Waiting for upload completion...");
            await page.waitForTimeout(1000);
          }
        }
        
        if (!recordCountFound) {
          console.log("❌ Record count not found in upload success message");
          
          // Check console logs for any record count information
          const logs = await page.evaluate(() => {
            return window.console._logs || [];
          });
          
          console.log("📋 Browser console logs:", logs);
        }
        
        // Clean up test file
        fs.unlinkSync(testFile);
        
      } else {
        console.log("❌ No file input found");
      }
    } else {
      console.log("❌ No upload area found");
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'record-count-test-result.png', fullPage: true });
    console.log("📸 Screenshot saved as record-count-test-result.png");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await browser.close();
  }
}

testRecordCountFix().then(() => {
  console.log("🏁 Record count test completed");
}).catch(error => {
  console.error("💥 Test execution failed:", error);
  process.exit(1);
});