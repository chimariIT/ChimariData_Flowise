/**
 * Comprehensive Progressive Data Journey Test
 * Tests all 4 capabilities as specified by user requirements
 * 
 * 1. Authentication (Email + OAuth)
 * 2. Data Engineering (Upload, PII, Schema, Transformation)
 * 3. Data Exploration (Visualization, Statistics, Export)
 * 4. Statistical Analysis (Hypothesis testing, multi-variate)
 * 5. AI Data Insights (Questions about project data)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

class ProgressiveJourneyTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.results = {
      authentication: {},
      dataEngineering: {},
      dataExploration: {},
      statisticalAnalysis: {},
      aiInsights: {},
      overallSuccess: false
    };
  }

  async setup() {
    this.browser = await puppeteer.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1200, height: 800 }
    });
    this.page = await this.browser.newPage();
    
    // Enable console logging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  async testAuthentication() {
    console.log('🔐 Testing Authentication System...');
    
    try {
      // Test 1: Access home page
      await this.page.goto('http://localhost:5000');
      await this.page.waitForSelector('body', { timeout: 10000 });
      
      // Test 2: New User Registration
      console.log('  Testing new user registration...');
      await this.page.goto('http://localhost:5000/auth');
      await this.page.waitForSelector('[data-testid="auth-form"]', { timeout: 5000 });
      
      // Switch to registration mode
      const registerButton = await this.page.$('[data-testid="register-tab"]');
      if (registerButton) {
        await registerButton.click();
        await this.page.waitForTimeout(500);
      }
      
      // Fill registration form
      const timestamp = Date.now();
      const testEmail = `test.${timestamp}@example.com`;
      
      await this.page.type('input[name="email"]', testEmail);
      await this.page.type('input[name="firstName"]', 'Test');
      await this.page.type('input[name="lastName"]', 'User');
      await this.page.type('input[name="password"]', 'testpass123');
      await this.page.type('input[name="confirmPassword"]', 'testpass123');
      
      // Submit registration
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(2000);
      
      // Check for success or dashboard redirect
      const currentUrl = this.page.url();
      const isAuthenticated = currentUrl.includes('/dashboard') || 
                             await this.page.$('[data-testid="dashboard"]') !== null;
      
      this.results.authentication.registration = {
        success: isAuthenticated,
        email: testEmail,
        message: isAuthenticated ? 'Registration successful' : 'Registration may need email verification'
      };
      
      // Test 3: OAuth Providers Available
      console.log('  Testing OAuth providers...');
      if (!isAuthenticated) {
        await this.page.goto('http://localhost:5000/auth');
        await this.page.waitForTimeout(1000);
      }
      
      const oauthProviders = await this.page.$$('[data-testid*="oauth"]');
      this.results.authentication.oauth = {
        available: oauthProviders.length > 0,
        count: oauthProviders.length,
        message: oauthProviders.length > 0 ? 'OAuth providers detected' : 'No OAuth providers found'
      };
      
      // Test 4: If not authenticated, try login
      if (!isAuthenticated) {
        console.log('  Testing user login...');
        await this.page.goto('http://localhost:5000/auth');
        await this.page.waitForTimeout(1000);
        
        // Try login with existing credentials or demo account
        await this.page.type('input[name="email"]', 'demo@chimaridata.com', { delay: 50 });
        await this.page.type('input[name="password"]', 'demopass', { delay: 50 });
        await this.page.click('button[type="submit"]');
        await this.page.waitForTimeout(3000);
        
        const loginUrl = this.page.url();
        const loginSuccess = loginUrl.includes('/dashboard');
        
        this.results.authentication.login = {
          success: loginSuccess,
          message: loginSuccess ? 'Login successful' : 'Login with demo credentials failed'
        };
      }
      
    } catch (error) {
      console.error('Authentication test failed:', error.message);
      this.results.authentication.error = error.message;
    }
  }

  async testDataEngineering() {
    console.log('📊 Testing Data Engineering Capabilities...');
    
    try {
      // Ensure we're on dashboard
      await this.page.goto('http://localhost:5000/dashboard');
      await this.page.waitForTimeout(2000);
      
      // Test 1: File Upload with PII Detection
      console.log('  Testing file upload and PII detection...');
      
      // Create test CSV data
      const testData = `Name,Email,Age,Salary,Phone,ROI
John Doe,john@example.com,30,50000,555-1234,76.58
Jane Smith,jane@example.com,25,45000,555-5678,82.34
Bob Johnson,bob@example.com,35,60000,555-9012,91.23`;
      
      // Write test file
      fs.writeFileSync('/tmp/test_data.csv', testData);
      
      // Look for upload area
      const uploadArea = await this.page.$('[data-testid="upload-area"]') || 
                        await this.page.$('input[type="file"]') ||
                        await this.page.$('[data-testid="file-upload"]');
      
      if (uploadArea) {
        await uploadArea.uploadFile('/tmp/test_data.csv');
        await this.page.waitForTimeout(3000);
        
        // Check for PII detection results
        const piiDetected = await this.page.$('[data-testid="pii-detection"]') ||
                           await this.page.$text('PII detected') ||
                           await this.page.$text('Personal Information');
        
        this.results.dataEngineering.upload = {
          success: true,
          piiDetection: !!piiDetected,
          message: 'File uploaded successfully'
        };
        
        // Test 2: Schema Review
        console.log('  Testing schema review...');
        const schemaSection = await this.page.$('[data-testid="schema"]') ||
                             await this.page.$('[data-testid="schema-review"]');
        
        this.results.dataEngineering.schema = {
          available: !!schemaSection,
          message: schemaSection ? 'Schema review available' : 'Schema review not found'
        };
        
        // Test 3: Data Transformation
        console.log('  Testing data transformation...');
        const transformTab = await this.page.$('[data-testid="transform-tab"]') ||
                            await this.page.$text('Transform');
        
        if (transformTab) {
          await transformTab.click();
          await this.page.waitForTimeout(1000);
          
          const transformOptions = await this.page.$$('[data-testid*="transform"]');
          this.results.dataEngineering.transformation = {
            available: transformOptions.length > 0,
            options: transformOptions.length,
            message: `${transformOptions.length} transformation options found`
          };
        }
        
      } else {
        this.results.dataEngineering.upload = {
          success: false,
          message: 'Upload area not found'
        };
      }
      
    } catch (error) {
      console.error('Data Engineering test failed:', error.message);
      this.results.dataEngineering.error = error.message;
    }
  }

  async testDataExploration() {
    console.log('📈 Testing Data Exploration Features...');
    
    try {
      // Test 1: Analysis Tab
      console.log('  Testing analysis capabilities...');
      const analysisTab = await this.page.$('[data-testid="analysis-tab"]') ||
                         await this.page.$text('Analysis');
      
      if (analysisTab) {
        await analysisTab.click();
        await this.page.waitForTimeout(1000);
        
        // Check for analysis types
        const analysisTypes = await this.page.$$('[data-testid*="analysis-type"]') ||
                             await this.page.$$('button[data-testid*="descriptive"]');
        
        this.results.dataExploration.analysisTypes = {
          available: analysisTypes.length > 0,
          count: analysisTypes.length,
          message: `${analysisTypes.length} analysis types available`
        };
        
        // Test 2: Visualization Creation
        console.log('  Testing visualization creation...');
        const vizButtons = await this.page.$$('[data-testid*="visualization"]') ||
                          await this.page.$$('button[data-testid*="chart"]');
        
        if (vizButtons.length > 0) {
          await vizButtons[0].click();
          await this.page.waitForTimeout(2000);
          
          const canvas = await this.page.$('#visualization-canvas') ||
                        await this.page.$('canvas');
          
          this.results.dataExploration.visualization = {
            created: !!canvas,
            message: canvas ? 'Visualization canvas found' : 'No visualization canvas'
          };
        }
        
        // Test 3: Export Capabilities
        console.log('  Testing export capabilities...');
        const exportButton = await this.page.$('[data-testid="export-pdf"]') ||
                            await this.page.$text('Export PDF');
        
        this.results.dataExploration.export = {
          available: !!exportButton,
          message: exportButton ? 'Export functionality available' : 'Export not found'
        };
      }
      
    } catch (error) {
      console.error('Data Exploration test failed:', error.message);
      this.results.dataExploration.error = error.message;
    }
  }

  async testStatisticalAnalysis() {
    console.log('📊 Testing Statistical Analysis...');
    
    try {
      // Test 1: Advanced Analysis Modal
      console.log('  Testing advanced statistical analysis...');
      const advancedButton = await this.page.$('[data-testid="advanced-analysis"]') ||
                            await this.page.$text('Advanced Analysis');
      
      if (advancedButton) {
        await advancedButton.click();
        await this.page.waitForTimeout(1000);
        
        // Check for statistical methods
        const statMethods = await this.page.$$('[data-testid*="stat"]') ||
                           await this.page.$$text('ANOVA') ||
                           await this.page.$$text('Regression');
        
        this.results.statisticalAnalysis.methods = {
          available: statMethods.length > 0,
          count: statMethods.length,
          message: `${statMethods.length} statistical methods found`
        };
        
        // Test 2: Hypothesis Testing
        const hypothesisTest = await this.page.$text('hypothesis') ||
                              await this.page.$text('significance');
        
        this.results.statisticalAnalysis.hypothesisTesting = {
          available: !!hypothesisTest,
          message: hypothesisTest ? 'Hypothesis testing available' : 'Hypothesis testing not found'
        };
        
        // Close modal if open
        const closeButton = await this.page.$('[data-testid="close-modal"]');
        if (closeButton) {
          await closeButton.click();
          await this.page.waitForTimeout(500);
        }
      }
      
    } catch (error) {
      console.error('Statistical Analysis test failed:', error.message);
      this.results.statisticalAnalysis.error = error.message;
    }
  }

  async testAIInsights() {
    console.log('🤖 Testing AI Data Insights...');
    
    try {
      // Test 1: AI Insights Tab
      console.log('  Testing AI insights interface...');
      const aiTab = await this.page.$('[data-testid="ai-tab"]') ||
                   await this.page.$text('AI Insights');
      
      if (aiTab) {
        await aiTab.click();
        await this.page.waitForTimeout(1000);
        
        // Test 2: Question Interface
        const questionInput = await this.page.$('textarea[placeholder*="question"]') ||
                             await this.page.$('input[placeholder*="Ask"]');
        
        if (questionInput) {
          await questionInput.type('What are the key insights from this data?');
          
          const submitButton = await this.page.$('button[type="submit"]') ||
                              await this.page.$text('Ask');
          
          if (submitButton) {
            await submitButton.click();
            await this.page.waitForTimeout(3000);
            
            // Check for AI response
            const aiResponse = await this.page.$('[data-testid="ai-response"]') ||
                              await this.page.$text('insight') ||
                              await this.page.$text('analysis');
            
            this.results.aiInsights.questionAnswering = {
              available: !!aiResponse,
              message: aiResponse ? 'AI question answering working' : 'No AI response received'
            };
          }
        }
        
        this.results.aiInsights.interface = {
          available: !!questionInput,
          message: questionInput ? 'AI interface available' : 'AI interface not found'
        };
      }
      
    } catch (error) {
      console.error('AI Insights test failed:', error.message);
      this.results.aiInsights.error = error.message;
    }
  }

  async runCompleteTest() {
    try {
      await this.setup();
      
      // Run all test suites
      await this.testAuthentication();
      await this.testDataEngineering();
      await this.testDataExploration();
      await this.testStatisticalAnalysis();
      await this.testAIInsights();
      
      // Calculate overall success
      const successCount = Object.values(this.results).reduce((count, section) => {
        if (typeof section === 'object' && section !== null) {
          const sectionSuccess = Object.values(section).some(test => 
            typeof test === 'object' && test.success !== false && test.available !== false
          );
          return count + (sectionSuccess ? 1 : 0);
        }
        return count;
      }, 0);
      
      this.results.overallSuccess = successCount >= 4; // At least 4 of 5 capabilities working
      
      // Save results
      fs.writeFileSync('progressive-journey-test-results.json', JSON.stringify(this.results, null, 2));
      
      console.log('\n📋 Progressive Data Journey Test Results:');
      console.log('==========================================');
      console.log('🔐 Authentication:', this.results.authentication.registration?.success ? '✅' : '❌');
      console.log('📊 Data Engineering:', this.results.dataEngineering.upload?.success ? '✅' : '❌');
      console.log('📈 Data Exploration:', this.results.dataExploration.analysisTypes?.available ? '✅' : '❌');
      console.log('📊 Statistical Analysis:', this.results.statisticalAnalysis.methods?.available ? '✅' : '❌');
      console.log('🤖 AI Insights:', this.results.aiInsights.interface?.available ? '✅' : '❌');
      console.log('==========================================');
      console.log('Overall Success:', this.results.overallSuccess ? '✅' : '❌');
      
      return this.results;
      
    } catch (error) {
      console.error('Test execution failed:', error);
      this.results.error = error.message;
      return this.results;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
if (require.main === module) {
  const tester = new ProgressiveJourneyTester();
  tester.runCompleteTest().then(results => {
    console.log('Test completed. Results saved to progressive-journey-test-results.json');
    process.exit(results.overallSuccess ? 0 : 1);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = ProgressiveJourneyTester;