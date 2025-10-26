@echo off
REM Production User Journey Test Runner
REM Runs comprehensive tests for user journeys, admin billing, and agent/tool management
REM with screenshot capture for each workflow step

echo.
echo ================================================================================
echo  PRODUCTION USER JOURNEY TESTS
echo ================================================================================
echo.
echo This script will run comprehensive tests with screenshot capture:
echo   - User Journeys (Non-Tech, Business, Technical, Consultation)
echo   - Admin Billing & Subscription Management
echo   - Agent & Tool Management Workflows
echo.
echo Screenshots will be saved to: test-results/production-journeys/
echo.

REM Ensure both servers are running
echo Checking if servers are running...

REM Check API server (port 3000)
curl -s http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: API server is not running on port 3000!
    echo Please start the development servers with: npm run dev
    echo.
    pause
    exit /b 1
)

REM Check client (port 5173)
curl -s http://localhost:5173 >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Client app is not running on port 5173!
    echo Please start the development servers with: npm run dev
    echo.
    pause
    exit /b 1
)

echo Server is running. Starting tests...
echo.

REM Run the production journey tests
npx playwright test tests/production-user-journeys.spec.ts --reporter=list,html

echo.
echo ================================================================================
echo  TEST EXECUTION COMPLETE
echo ================================================================================
echo.
echo View the HTML report with: npx playwright show-report
echo View screenshots in: test-results/production-journeys/
echo.

pause

