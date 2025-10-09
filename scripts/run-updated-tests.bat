@echo off
REM Comprehensive Test Execution Script for Windows
REM Based on documentation review and updated test requirements

echo 🚀 Running Updated Test Suite for ChimariData Platform
echo ==================================================

REM Test configuration
set TIMEOUT=120000
set WORKERS=1

REM Start server if not running
echo 🔧 Checking if server is running...
curl -s http://localhost:3000/health >nul 2>&1
if %errorlevel% neq 0 (
    echo 🚀 Starting development server...
    start /B npm run dev
    timeout /t 10 /nobreak >nul
    echo ✅ Server started
) else (
    echo ✅ Server is already running
)

REM Test results tracking
set PASSED=0
set FAILED=0
set TOTAL=0

echo.
echo 🎯 PHASE 1: Core System Tests
echo =================================

REM 1. Comprehensive Agent Journey Framework Tests
set /a TOTAL+=1
echo 📋 Running: Comprehensive Agent Journey Framework
npx playwright test tests/comprehensive-agent-journey-framework.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Comprehensive Agent Journey Framework - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Comprehensive Agent Journey Framework - FAILED
    set /a FAILED+=1
)

REM 2. Enhanced Admin Management Tests
set /a TOTAL+=1
echo 📋 Running: Enhanced Admin Management
npx playwright test tests/enhanced-admin-management.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Enhanced Admin Management - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Enhanced Admin Management - FAILED
    set /a FAILED+=1
)

REM 3. Billing System Improvements Tests
set /a TOTAL+=1
echo 📋 Running: Billing System Improvements
npx playwright test tests/billing-system-improvements.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Billing System Improvements - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Billing System Improvements - FAILED
    set /a FAILED+=1
)

echo.
echo 🎯 PHASE 2: Existing Test Validation
echo ======================================

REM 4. Billing Tier Alignment Tests
set /a TOTAL+=1
echo 📋 Running: Billing Tier Alignment
npx playwright test tests/billing-tier-alignment.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Billing Tier Alignment - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Billing Tier Alignment - FAILED
    set /a FAILED+=1
)

REM 5. Authenticated Full Journeys Tests
set /a TOTAL+=1
echo 📋 Running: Authenticated Full Journeys
npx playwright test tests/authenticated-full-journeys.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Authenticated Full Journeys - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Authenticated Full Journeys - FAILED
    set /a FAILED+=1
)

REM 6. Admin Pages E2E Tests
set /a TOTAL+=1
echo 📋 Running: Admin Pages E2E
npx playwright test tests/admin-pages-e2e.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Admin Pages E2E - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Admin Pages E2E - FAILED
    set /a FAILED+=1
)

echo.
echo 🎯 PHASE 3: Smoke Tests
echo ======================

REM 7. Basic Navigation Tests
set /a TOTAL+=1
echo 📋 Running: Navigation Smoke Tests
npx playwright test tests/nav-smoke.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Navigation Smoke Tests - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Navigation Smoke Tests - FAILED
    set /a FAILED+=1
)

REM 8. Dashboard Smoke Tests
set /a TOTAL+=1
echo 📋 Running: Dashboard Smoke Tests
npx playwright test tests/dashboard-smoke.spec.ts --timeout=%TIMEOUT% --workers=%WORKERS%
if %errorlevel% equ 0 (
    echo ✅ Dashboard Smoke Tests - PASSED
    set /a PASSED+=1
) else (
    echo ❌ Dashboard Smoke Tests - FAILED
    set /a FAILED+=1
)

REM Generate test report
echo.
echo 📊 TEST EXECUTION SUMMARY
echo ==========================
echo Total Tests: %TOTAL%
echo Passed: %PASSED%
echo Failed: %FAILED%

if %FAILED% equ 0 (
    echo.
    echo 🎉 ALL TESTS PASSED!
    echo ✅ The updated test suite is working correctly
    echo ✅ All critical functionality is validated
    exit /b 0
) else (
    echo.
    echo ❌ SOME TESTS FAILED
    echo ⚠️  Please review the failed tests above
    echo 💡 Run individual tests for detailed debugging
    exit /b 1
)
