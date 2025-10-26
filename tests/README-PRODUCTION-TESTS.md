# Production User Journey Tests

## Overview

This test suite provides comprehensive end-to-end testing for all user journeys, admin billing management, and agent/tool management workflows. Tests use actual test user credentials to simulate production scenarios and capture detailed screenshots for each workflow step.

## Test Coverage

### 1. User Journey Tests
- **Non-Tech User Journey** - Complete workflow from registration to insights
- **Business User Journey** - Business analytics and reporting flow
- **Technical User Journey** - Advanced ML/data science workflow
- **Consultation User Journey** - Expert consultation and strategic planning

### 2. Admin Billing & Subscription Tests
- **Billing Dashboard** - Overview of revenue, customers, and subscriptions
- **Subscription Tier Configuration** - Manage tier settings and pricing
- **User Billing Management** - Individual user billing and invoices
- **Usage Tracking** - Monitor usage across all tiers
- **Quota Management** - Configure and enforce quota limits

### 3. Agent & Tool Management Tests
- **Agent Dashboard** - View and monitor all registered agents
- **Agent Creation & Configuration** - Register new agents with custom settings
- **Tool Management** - Manage tool registry and performance
- **Tool Registration** - Add new tools to the system
- **Agent Communication** - Test agent checkpoint and collaboration flows

## File Structure

```
tests/
├── production-user-journeys.spec.ts    # Main test suite
├── utils/
│   ├── auth.ts                         # Basic auth utilities
│   └── production-test-helpers.ts      # Production test helpers
└── README-PRODUCTION-TESTS.md          # This file

scripts/
├── run-production-journey-tests.bat    # Windows test runner
└── run-production-journey-tests.sh     # Unix test runner

test-results/
└── production-journeys/                # Screenshot output directory
    ├── nontech/                        # Non-tech user screenshots
    ├── business/                       # Business user screenshots
    ├── technical/                      # Technical user screenshots
    ├── consultation/                   # Consultation user screenshots
    ├── admin-billing/                  # Admin billing screenshots
    ├── agent-dashboard/                # Agent management screenshots
    └── tool-dashboard/                 # Tool management screenshots
```

## Test User Credentials

Tests automatically create unique test users for each run. User types:

| Role | Email Pattern | Default Tier | Description |
|------|---------------|--------------|-------------|
| Non-Tech | `nontech.prod.{timestamp}@test.chimaridata.com` | Starter | Marketing/non-technical users |
| Business | `business.prod.{timestamp}@test.chimaridata.com` | Professional | Business analysts |
| Technical | `technical.prod.{timestamp}@test.chimaridata.com` | Professional | Data scientists/engineers |
| Consultation | `consultation.prod.{timestamp}@test.chimaridata.com` | Enterprise | Strategic consultants |
| Admin | `admin.prod.{timestamp}@test.chimaridata.com` | Enterprise | System administrators |

**Password for all test users:** `SecureTest123!`

## Running Tests

### Prerequisites

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Ensure the database is running:**
   ```bash
   # The server should connect to your configured DATABASE_URL
   ```

### Run All Tests

#### Windows:
```bash
scripts\run-production-journey-tests.bat
```

#### Mac/Linux:
```bash
chmod +x scripts/run-production-journey-tests.sh
./scripts/run-production-journey-tests.sh
```

### Run Specific Test Suites

```bash
# Run only user journey tests
npx playwright test tests/production-user-journeys.spec.ts --grep "Production User Journeys"

# Run only admin billing tests
npx playwright test tests/production-user-journeys.spec.ts --grep "Admin Billing"

# Run only agent/tool management tests
npx playwright test tests/production-user-journeys.spec.ts --grep "Agent & Tool Management"

# Run specific user journey
npx playwright test tests/production-user-journeys.spec.ts --grep "Non-Tech User"
```

### Run with UI (Headed Mode)

```bash
npx playwright test tests/production-user-journeys.spec.ts --headed
```

### Run with Debug Mode

```bash
npx playwright test tests/production-user-journeys.spec.ts --debug
```

## Screenshot Capture

Screenshots are automatically captured at each workflow step:

### Naming Convention
```
{timestamp}_{step-name}.png
{timestamp}_{step-name}-after.png
{timestamp}_{step-name}-error.png
```

### Example Screenshots
```
test-results/production-journeys/
├── nontech/
│   ├── 2024-10-13T15-30-00_step-01-dashboard-landing.png
│   ├── 2024-10-13T15-30-05_step-02-journey-selection.png
│   ├── 2024-10-13T15-30-10_step-03-prepare-step.png
│   └── ...
├── admin-billing/
│   ├── 2024-10-13T15-35-00_step-01-admin-dashboard.png
│   ├── 2024-10-13T15-35-05_step-02-subscription-management.png
│   └── ...
```

## Test Utilities

### Production Test Helpers

Located in `tests/utils/production-test-helpers.ts`:

#### User Management
- `createProductionTestUser()` - Create test user with unique credentials
- `registerProductionUser()` - Register user via API
- `loginProductionUser()` - Login existing user
- `authenticateUserInBrowser()` - Inject auth token into browser

#### Navigation & Interaction
- `navigateToUrl()` - Navigate with retry logic
- `waitForProductionPageLoad()` - Comprehensive page load wait
- `clickElement()` - Click with retry
- `fillFormField()` - Fill form with error handling
- `uploadFile()` - Handle file uploads

#### Screenshot Management
- `captureProductionScreenshot()` - Take organized screenshots
- `executeJourneyStep()` - Execute single workflow step
- `executeJourneyWorkflow()` - Execute complete journey

#### API Utilities
- `waitForApiResponse()` - Wait for specific API calls
- `isElementVisible()` - Check element visibility

### Usage Example

```typescript
import { 
  createProductionTestUser,
  registerProductionUser,
  authenticateUserInBrowser,
  executeJourneyWorkflow
} from './utils/production-test-helpers';

test('Custom User Journey', async ({ page, request }) => {
  // Create test user
  const user = createProductionTestUser('technical', 'professional');
  
  // Register and authenticate
  const { token } = await registerProductionUser(request, user);
  await authenticateUserInBrowser(page, token);
  
  // Execute journey
  await executeJourneyWorkflow(page, 'custom-journey', [
    {
      path: '/dashboard',
      name: 'Dashboard',
      action: async (page) => {
        await page.click('button:has-text("Start Analysis")');
      }
    },
    // ... more steps
  ]);
});
```

## Test Configuration

### Environment Variables

```bash
# Base URL for tests (default: http://localhost:3000)
BASE_URL=http://localhost:3000

# Increase timeouts for slower environments
PLAYWRIGHT_TIMEOUT=120000
```

### Playwright Configuration

Tests use these timeout settings:
- **Page load timeout:** 10 seconds
- **API timeout:** 30 seconds  
- **Test timeout:** 120 seconds (2 minutes)

## Viewing Results

### HTML Report

After test execution:
```bash
npx playwright show-report
```

### Screenshots

Navigate to `test-results/production-journeys/` to view all captured screenshots.

### Test Summary

A JSON summary is automatically generated at:
```
test-results/production-journeys/test-summary.json
```

Example summary:
```json
{
  "timestamp": "2024-10-13T15:30:00.000Z",
  "testSuite": "Production User Journeys - Complete Coverage",
  "userJourneys": {
    "nonTech": "✅ Complete with screenshots",
    "business": "✅ Complete with screenshots",
    "technical": "✅ Complete with screenshots",
    "consultation": "✅ Complete with screenshots"
  },
  "adminBilling": {
    "dashboard": "✅ Complete with screenshots",
    "tierConfig": "✅ Complete with screenshots",
    "userManagement": "✅ Complete with screenshots"
  },
  "agentToolManagement": {
    "agentDashboard": "✅ Complete with screenshots",
    "agentCreation": "✅ Complete with screenshots",
    "toolManagement": "✅ Complete with screenshots"
  },
  "screenshotDirectory": "test-results/production-journeys"
}
```

## Troubleshooting

### Server Not Running

**Error:** `ERROR: Server is not running!`

**Solution:** Start the development server:
```bash
npm run dev
```

### Authentication Failures

**Error:** `Registration failed: 409 - User already exists`

**Solution:** Tests create unique users with timestamps, so this should not occur. If it does, wait a moment and re-run.

### Page Load Timeouts

**Error:** `Page load timeout, continuing anyway...`

**Solution:** This is a warning, not an error. Tests continue despite timeout. If tests fail, increase timeout in `production-test-helpers.ts`.

### Screenshot Failures

**Error:** `Screenshot capture failed`

**Solution:** Ensure write permissions for `test-results/` directory.

### Database Connection Issues

**Error:** `Database connection failed`

**Solution:** Check `DATABASE_URL` environment variable and ensure PostgreSQL is running.

## Best Practices

### 1. Test User Management
- Tests automatically create unique users with timestamps
- No need to clean up test users between runs
- Each test run uses fresh credentials

### 2. Screenshot Organization
- Screenshots are organized by category (user type, admin, agent)
- Timestamps in filenames prevent conflicts
- Both "before" and "after" screenshots captured for actions

### 3. Error Handling
- Tests continue even if individual steps fail
- Error screenshots captured automatically
- Detailed console logging for debugging

### 4. Production Representation
- Use actual API endpoints (no mocks)
- Simulate real user workflows
- Test with realistic data and scenarios

## Continuous Integration

### GitHub Actions Example

```yaml
name: Production Journey Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Start server
        run: npm run dev &
        
      - name: Wait for server
        run: npx wait-on http://localhost:3000/api/health
      
      - name: Run production journey tests
        run: npx playwright test tests/production-user-journeys.spec.ts
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          
      - name: Upload screenshots
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-screenshots
          path: test-results/production-journeys/
```

## Maintenance

### Adding New Tests

1. Add new test case to `production-user-journeys.spec.ts`
2. Use `executeJourneyWorkflow()` for consistent structure
3. Follow naming convention: `{Category} Journey {Number}: {Description}`

### Updating Test Users

Modify `TEST_USERS` object in `production-user-journeys.spec.ts`:

```typescript
const TEST_USERS: Record<string, TestUser> = {
  newUserType: {
    email: `newtype.prod.${Date.now()}@test.chimaridata.com`,
    password: 'SecureTest123!',
    firstName: 'New',
    lastName: 'User',
    role: 'newtype',
    subscriptionTier: 'professional'
  }
};
```

### Updating Journey Steps

Use the journey step interface:

```typescript
interface JourneyStep {
  path: string;              // URL path to navigate
  name: string;              // Step description
  action?: (page: Page) => Promise<void>;  // Optional action
  validateElements?: string[];  // Elements to wait for
  skipScreenshot?: boolean;  // Skip screenshot if needed
}
```

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review Playwright documentation: https://playwright.dev
3. Check test logs in console output
4. Review error screenshots in `test-results/production-journeys/`

## Related Documentation

- [Playwright Documentation](https://playwright.dev)
- [Test Coverage Analysis](../docs/TEST_COVERAGE_ANALYSIS.md)
- [Admin Setup Guide](../docs/ADMIN_SETUP_GUIDE.md)
- [Implementation Complete](../docs/IMPLEMENTATION_COMPLETE.md)





