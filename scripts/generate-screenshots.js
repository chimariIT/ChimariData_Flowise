const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('📸 Starting Screenshot Generation for ChimariData');
console.log('=' .repeat(60));

// Screenshot configuration
const screenshotConfig = {
  baseUrl: 'http://localhost:5173',
  outputDir: 'screenshots',
  viewport: { width: 1920, height: 1080 },
  delay: 2000, // Wait for components to load
  quality: 95
};

// User scenarios to capture
const userScenarios = [
  {
    role: 'non-tech',
    tier: 'trial',
    name: 'Non-Tech Trial User',
    paths: [
      { route: '/', filename: 'non-tech-home.png', description: 'Home page for non-tech user' },
      { route: '/journeys', filename: 'non-tech-journeys.png', description: 'Journey selection' },
      { route: '/journeys/non-tech/prepare', filename: 'non-tech-prepare.png', description: 'Journey preparation' },
      { route: '/journeys/non-tech/data', filename: 'non-tech-data-upload.png', description: 'Data upload interface' },
      { route: '/journeys/non-tech/execute', filename: 'non-tech-execute.png', description: 'AI analysis execution' },
      { route: '/journeys/non-tech/results', filename: 'non-tech-results.png', description: 'Analysis results' }
    ]
  },
  {
    role: 'business',
    tier: 'starter',
    name: 'Business Starter User',
    paths: [
      { route: '/', filename: 'business-home.png', description: 'Business user dashboard' },
      { route: '/journeys/business/prepare', filename: 'business-prepare.png', description: 'Business journey setup' },
      { route: '/journeys/business/execute', filename: 'business-execute.png', description: 'Business intelligence analysis' },
      { route: '/pricing', filename: 'business-pricing.png', description: 'Pricing page view' }
    ]
  },
  {
    role: 'technical',
    tier: 'professional',
    name: 'Technical Professional User',
    paths: [
      { route: '/', filename: 'technical-home.png', description: 'Technical user interface' },
      { route: '/journeys/technical/prepare', filename: 'technical-prepare.png', description: 'Technical journey setup' },
      { route: '/journeys/technical/execute', filename: 'technical-execute.png', description: 'Advanced analysis interface' }
    ]
  },
  {
    role: 'consultation',
    tier: 'enterprise',
    name: 'Consultation Enterprise User',
    paths: [
      { route: '/', filename: 'consultation-home.png', description: 'Enterprise consultation dashboard' },
      { route: '/expert-consultation', filename: 'consultation-interface.png', description: 'Expert consultation interface' }
    ]
  }
];

// UI Component demos to capture
const componentDemos = [
  { route: '/auth/login', filename: 'auth-modal.png', description: 'Authentication interface' },
  { route: '/pricing', filename: 'pricing-page.png', description: 'Subscription pricing' },
  { component: 'subscription-upgrade', filename: 'upgrade-modal.png', description: 'Subscription upgrade flow' },
  { component: 'trial-workflow', filename: 'trial-workflow.png', description: 'Enhanced trial workflow' },
  { component: 'payment-dashboard', filename: 'payment-dashboard.png', description: 'Payment and usage dashboard' },
  { component: 'role-onboarding', filename: 'role-onboarding.png', description: 'User type onboarding' }
];

async function createScreenshotDirectory() {
  const dir = screenshotConfig.outputDir;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created screenshot directory: ${dir}`);
  }

  // Create subdirectories for organization
  const subdirs = ['user-journeys', 'components', 'workflows', 'ai-features'];
  subdirs.forEach(subdir => {
    const subdirPath = path.join(dir, subdir);
    if (!fs.existsSync(subdirPath)) {
      fs.mkdirSync(subdirPath, { recursive: true });
    }
  });
}

async function setupBrowser() {
  console.log('🌐 Setting up browser...');

  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport(screenshotConfig.viewport);

  // Mock authentication for different user types
  await page.evaluateOnNewDocument(() => {
    window.mockAuthUser = (userRole, subscriptionTier) => {
      localStorage.setItem('auth_token', 'mock-token-' + userRole);
      localStorage.setItem('user_data', JSON.stringify({
        id: 'mock-user-' + userRole,
        email: `test-${userRole}@example.com`,
        role: userRole,
        subscriptionTier: subscriptionTier,
        name: `Test ${userRole} User`
      }));
    };
  });

  return { browser, page };
}

async function captureUserJourneyScreenshots(page, scenario) {
  console.log(`\n👤 Capturing screenshots for: ${scenario.name}`);

  // Set up mock authentication for this user type
  await page.evaluate((role, tier) => {
    window.mockAuthUser(role, tier);
  }, scenario.role, scenario.tier);

  for (const pathInfo of scenario.paths) {
    try {
      console.log(`  📸 Capturing: ${pathInfo.description}`);

      const url = `${screenshotConfig.baseUrl}${pathInfo.route}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for components to load
      await page.waitForTimeout(screenshotConfig.delay);

      // Hide any loading states or skeleton screens
      await page.evaluate(() => {
        const loadingElements = document.querySelectorAll('[data-loading], .loading, .skeleton');
        loadingElements.forEach(el => el.style.display = 'none');
      });

      const filename = path.join(screenshotConfig.outputDir, 'user-journeys', pathInfo.filename);
      await page.screenshot({
        path: filename,
        quality: screenshotConfig.quality,
        type: 'png',
        fullPage: true
      });

      console.log(`    ✅ Saved: ${pathInfo.filename}`);

    } catch (error) {
      console.log(`    ❌ Failed to capture ${pathInfo.filename}: ${error.message}`);
    }
  }
}

async function captureComponentDemos(page) {
  console.log(`\n🧩 Capturing UI component demonstrations...`);

  for (const demo of componentDemos) {
    try {
      if (demo.route) {
        console.log(`  📸 Capturing: ${demo.description}`);

        const url = `${screenshotConfig.baseUrl}${demo.route}`;
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(screenshotConfig.delay);

        const filename = path.join(screenshotConfig.outputDir, 'components', demo.filename);
        await page.screenshot({
          path: filename,
          quality: screenshotConfig.quality,
          type: 'png',
          fullPage: true
        });

        console.log(`    ✅ Saved: ${demo.filename}`);
      }

    } catch (error) {
      console.log(`    ❌ Failed to capture ${demo.filename}: ${error.message}`);
    }
  }
}

async function captureAIFeatureScreenshots(page) {
  console.log(`\n🤖 Capturing AI feature demonstrations...`);

  const aiFeatures = [
    {
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('technical', 'professional'));
        await page.goto(`${screenshotConfig.baseUrl}/journeys/technical/execute`);
      },
      filename: 'ai-code-generation.png',
      description: 'Code generation interface'
    },
    {
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('business', 'starter'));
        await page.goto(`${screenshotConfig.baseUrl}/journeys/business/execute`);
      },
      filename: 'ai-business-intelligence.png',
      description: 'Business intelligence AI'
    },
    {
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('consultation', 'enterprise'));
        await page.goto(`${screenshotConfig.baseUrl}/expert-consultation`);
      },
      filename: 'ai-consultation.png',
      description: 'Expert consultation AI'
    }
  ];

  for (const feature of aiFeatures) {
    try {
      console.log(`  📸 Capturing: ${feature.description}`);

      await feature.setup();
      await page.waitForTimeout(screenshotConfig.delay);

      const filename = path.join(screenshotConfig.outputDir, 'ai-features', feature.filename);
      await page.screenshot({
        path: filename,
        quality: screenshotConfig.quality,
        type: 'png',
        fullPage: true
      });

      console.log(`    ✅ Saved: ${feature.filename}`);

    } catch (error) {
      console.log(`    ❌ Failed to capture ${feature.filename}: ${error.message}`);
    }
  }
}

async function captureWorkflowScreenshots(page) {
  console.log(`\n🔄 Capturing workflow demonstrations...`);

  const workflows = [
    {
      name: 'Payment Integration',
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('business', 'none'));
        await page.goto(`${screenshotConfig.baseUrl}/pricing`);
      },
      filename: 'payment-integration.png'
    },
    {
      name: 'Subscription Dashboard',
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('technical', 'professional'));
        await page.goto(`${screenshotConfig.baseUrl}/`);
        // Simulate opening subscription dashboard
        await page.evaluate(() => {
          const dashboard = document.querySelector('[data-testid="subscription-dashboard"]');
          if (dashboard) dashboard.click();
        });
      },
      filename: 'subscription-dashboard.png'
    },
    {
      name: 'Usage Monitoring',
      setup: async () => {
        await page.evaluate(() => window.mockAuthUser('business', 'starter'));
        await page.goto(`${screenshotConfig.baseUrl}/`);
      },
      filename: 'usage-monitoring.png'
    }
  ];

  for (const workflow of workflows) {
    try {
      console.log(`  📸 Capturing: ${workflow.name}`);

      await workflow.setup();
      await page.waitForTimeout(screenshotConfig.delay);

      const filename = path.join(screenshotConfig.outputDir, 'workflows', workflow.filename);
      await page.screenshot({
        path: filename,
        quality: screenshotConfig.quality,
        type: 'png',
        fullPage: true
      });

      console.log(`    ✅ Saved: ${workflow.filename}`);

    } catch (error) {
      console.log(`    ❌ Failed to capture ${workflow.filename}: ${error.message}`);
    }
  }
}

async function generateScreenshotIndex() {
  console.log(`\n📄 Generating screenshot index...`);

  const indexContent = `# ChimariData Screenshots

Generated on: ${new Date().toISOString()}

## User Journey Screenshots

### Non-Tech User Journey
![Non-Tech Home](user-journeys/non-tech-home.png)
*Home page optimized for non-technical users with simplified interface*

![Non-Tech Journeys](user-journeys/non-tech-journeys.png)
*Journey selection with guided workflows*

![Non-Tech Data Upload](user-journeys/non-tech-data-upload.png)
*Simplified data upload interface with AI assistance*

![Non-Tech Execute](user-journeys/non-tech-execute.png)
*AI analysis execution with plain-English explanations*

![Non-Tech Results](user-journeys/non-tech-results.png)
*Results presented in accessible, visual format*

### Business User Journey
![Business Home](user-journeys/business-home.png)
*Business dashboard with KPI focus*

![Business Prepare](user-journeys/business-prepare.png)
*Business objective setting and analysis planning*

![Business Execute](user-journeys/business-execute.png)
*Business intelligence AI with strategic insights*

### Technical User Journey
![Technical Home](user-journeys/technical-home.png)
*Advanced interface for technical users*

![Technical Prepare](user-journeys/technical-prepare.png)
*Technical analysis configuration*

![Technical Execute](user-journeys/technical-execute.png)
*Advanced analysis with code generation capabilities*

### Consultation User Journey
![Consultation Home](user-journeys/consultation-home.png)
*Enterprise consultation dashboard*

![Consultation Interface](user-journeys/consultation-interface.png)
*Expert consultation interface with strategic guidance*

## AI Feature Screenshots

![AI Code Generation](ai-features/ai-code-generation.png)
*Advanced code generation for technical users*

![AI Business Intelligence](ai-features/ai-business-intelligence.png)
*Business-focused AI insights and recommendations*

![AI Consultation](ai-features/ai-consultation.png)
*Expert-level strategic consultation AI*

## UI Components

![Authentication](components/auth-modal.png)
*User authentication interface*

![Pricing Page](components/pricing-page.png)
*Subscription pricing with role-based tiers*

## Workflow Screenshots

![Payment Integration](workflows/payment-integration.png)
*Hybrid payment model in action*

![Subscription Dashboard](workflows/subscription-dashboard.png)
*Comprehensive subscription management*

![Usage Monitoring](workflows/usage-monitoring.png)
*Real-time usage tracking and limits*

## Key Features Demonstrated

1. **Role-Based UI**: Each user type sees an interface optimized for their needs
2. **AI Service Differentiation**: Different AI capabilities and response styles per role
3. **Hybrid Payment Model**: Both subscription and pay-per-use options
4. **Progressive Feature Access**: Clear upgrade paths and benefit visualization
5. **Real-time Monitoring**: Usage tracking and limit enforcement
6. **Contextual Upgrade Prompts**: Smart recommendations based on usage patterns
`;

  const indexPath = path.join(screenshotConfig.outputDir, 'README.md');
  fs.writeFileSync(indexPath, indexContent);
  console.log(`    ✅ Screenshot index created: ${indexPath}`);
}

async function main() {
  try {
    console.log('🚀 Starting screenshot generation process...\n');

    // Check if development server is running
    console.log('🔍 Checking if development server is running...');
    try {
      const response = await fetch(screenshotConfig.baseUrl);
      if (!response.ok) {
        throw new Error('Server not responding');
      }
      console.log('✅ Development server is running\n');
    } catch (error) {
      console.log('❌ Development server is not running!');
      console.log('Please start the server first: npm run dev');
      console.log('Then run this script again.\n');
      return;
    }

    await createScreenshotDirectory();

    const { browser, page } = await setupBrowser();

    try {
      // Capture all screenshot categories
      for (const scenario of userScenarios) {
        await captureUserJourneyScreenshots(page, scenario);
      }

      await captureComponentDemos(page);
      await captureAIFeatureScreenshots(page);
      await captureWorkflowScreenshots(page);
      await generateScreenshotIndex();

      console.log('\n🎉 Screenshot generation complete!');
      console.log(`📁 Screenshots saved to: ${screenshotConfig.outputDir}/`);
      console.log(`📄 View the index: ${screenshotConfig.outputDir}/README.md`);

    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error('💥 Screenshot generation failed:', error.message);
    process.exit(1);
  }
}

// Add Node.js fetch polyfill for older versions
if (!global.fetch) {
  global.fetch = require('node-fetch');
}

if (require.main === module) {
  main();
}

module.exports = { main };