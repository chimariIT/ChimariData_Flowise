@echo off
REM Codebase Cleanup Script for Windows
REM Removes duplicate and obsolete files identified in audit
REM IMPORTANT: Run this from the project root directory
REM IMPORTANT: Create backup branch first!

echo ==================================
echo ChimariData Codebase Cleanup
echo ==================================
echo.

REM Check if we're in the right directory
if not exist package.json (
    echo Error: Must run from project root directory
    exit /b 1
)

echo Starting cleanup...
echo.

set DELETED=0

echo === Cleaning up billing files ===
if exist server\adaptive-billing-service.ts (
    del server\adaptive-billing-service.ts
    echo Deleted: server\adaptive-billing-service.ts
    set /a DELETED+=1
)
if exist server\enhanced-billing-service-v2.ts (
    del server\enhanced-billing-service-v2.ts
    echo Deleted: server\enhanced-billing-service-v2.ts
    set /a DELETED+=1
)
if exist server\enhanced-feature-billing-service.ts (
    del server\enhanced-feature-billing-service.ts
    echo Deleted: server\enhanced-feature-billing-service.ts
    set /a DELETED+=1
)
if exist server\services\enhanced-subscription-billing.ts (
    del server\services\enhanced-subscription-billing.ts
    echo Deleted: server\services\enhanced-subscription-billing.ts
    set /a DELETED+=1
)
if exist server\scripts\migrate-billing-data.ts (
    del server\scripts\migrate-billing-data.ts
    echo Deleted: server\scripts\migrate-billing-data.ts
    set /a DELETED+=1
)

echo.
echo === Removing duplicate services from root ===
if exist server\conversational-agent.ts (
    del server\conversational-agent.ts
    echo Deleted: server\conversational-agent.ts
    set /a DELETED+=1
)
if exist server\technical-ai-agent.ts (
    del server\technical-ai-agent.ts
    echo Deleted: server\technical-ai-agent.ts
    set /a DELETED+=1
)
if exist server\question-analyzer-old.ts (
    del server\question-analyzer-old.ts
    echo Deleted: server\question-analyzer-old.ts
    set /a DELETED+=1
)
if exist server\file-processor.ts (
    del server\file-processor.ts
    echo Deleted: server\file-processor.ts
    set /a DELETED+=1
)
if exist server\data-transformer.ts (
    del server\data-transformer.ts
    echo Deleted: server\data-transformer.ts
    set /a DELETED+=1
)
if exist server\pii-detector.ts (
    del server\pii-detector.ts
    echo Deleted: server\pii-detector.ts
    set /a DELETED+=1
)
if exist server\python-processor.ts (
    del server\python-processor.ts
    echo Deleted: server\python-processor.ts
    set /a DELETED+=1
)
if exist server\ml-service.ts (
    del server\ml-service.ts
    echo Deleted: server\ml-service.ts
    set /a DELETED+=1
)
if exist server\pricing-service.ts (
    del server\pricing-service.ts
    echo Deleted: server\pricing-service.ts
    set /a DELETED+=1
)
if exist server\goal-analysis-engine.ts (
    del server\goal-analysis-engine.ts
    echo Deleted: server\goal-analysis-engine.ts
    set /a DELETED+=1
)
if exist server\enhanced-workflow-service.ts (
    del server\enhanced-workflow-service.ts
    echo Deleted: server\enhanced-workflow-service.ts
    set /a DELETED+=1
)

echo.
echo === Removing duplicate landing pages ===
if exist client\src\pages\pricing-broken.tsx (
    del client\src\pages\pricing-broken.tsx
    echo Deleted: client\src\pages\pricing-broken.tsx
    set /a DELETED+=1
)
if exist client\src\pages\main-landing.tsx (
    del client\src\pages\main-landing.tsx
    echo Deleted: client\src\pages\main-landing.tsx
    set /a DELETED+=1
)
if exist client\src\pages\home-page.tsx (
    del client\src\pages\home-page.tsx
    echo Deleted: client\src\pages\home-page.tsx
    set /a DELETED+=1
)

echo.
echo === Removing debug test files ===
for %%f in (tests\debug-*.spec.ts) do (
    if exist "%%f" (
        del "%%f"
        echo Deleted: %%f
        set /a DELETED+=1
    )
)

for %%f in (tests\webkit-*.spec.ts) do (
    if exist "%%f" (
        del "%%f"
        echo Deleted: %%f
        set /a DELETED+=1
    )
)

echo.
echo === Removing duplicate auth tests ===
if exist tests\auth-smoke.spec.ts del tests\auth-smoke.spec.ts
if exist tests\auth-flow-test.spec.ts del tests\auth-flow-test.spec.ts
if exist tests\auth-verification.spec.ts del tests\auth-verification.spec.ts
if exist tests\auth-fix-verification.spec.ts del tests\auth-fix-verification.spec.ts
if exist tests\comprehensive-auth-journey.spec.ts del tests\comprehensive-auth-journey.spec.ts

echo.
echo === Removing duplicate journey tests ===
if exist tests\journey-flow-only.spec.ts del tests\journey-flow-only.spec.ts
if exist tests\journey-flow-comprehensive.spec.ts del tests\journey-flow-comprehensive.spec.ts
if exist tests\simple-user-journeys.spec.ts del tests\simple-user-journeys.spec.ts
if exist tests\authenticated-journey.spec.ts del tests\authenticated-journey.spec.ts
if exist tests\full-authenticated-journey.spec.ts del tests\full-authenticated-journey.spec.ts
if exist tests\manual-user-journey.spec.ts del tests\manual-user-journey.spec.ts
if exist tests\authenticated-user-journeys.spec.ts del tests\authenticated-user-journeys.spec.ts
if exist tests\complete-user-journeys.spec.ts del tests\complete-user-journeys.spec.ts
if exist tests\real-user-journey-workflow.spec.ts del tests\real-user-journey-workflow.spec.ts
if exist tests\final-complete-journey.spec.ts del tests\final-complete-journey.spec.ts
if exist tests\complete-user-journey-fixed.spec.ts del tests\complete-user-journey-fixed.spec.ts
if exist tests\authenticated-full-journeys.spec.ts del tests\authenticated-full-journeys.spec.ts
if exist tests\streamlined-journey-selection.spec.ts del tests\streamlined-journey-selection.spec.ts
if exist tests\pre-post-auth-journey-flow.spec.ts del tests\pre-post-auth-journey-flow.spec.ts
if exist tests\journey-button-visibility.spec.ts del tests\journey-button-visibility.spec.ts
if exist tests\generate-journey-artifacts.spec.ts del tests\generate-journey-artifacts.spec.ts

echo.
echo === Removing duplicate dashboard tests ===
if exist tests\dashboard-smoke.spec.ts del tests\dashboard-smoke.spec.ts
if exist tests\dashboard-authenticated.spec.ts del tests\dashboard-authenticated.spec.ts
if exist tests\protected-routes-authenticated.spec.ts del tests\protected-routes-authenticated.spec.ts

echo.
echo === Removing duplicate screenshot tests ===
if exist tests\simple-journey-screenshots.spec.ts del tests\simple-journey-screenshots.spec.ts
if exist tests\current-authenticated-screenshots.spec.ts del tests\current-authenticated-screenshots.spec.ts
if exist tests\complete-user-journey-screenshots.spec.ts del tests\complete-user-journey-screenshots.spec.ts
if exist tests\authenticated-screenshot-journeys.spec.ts del tests\authenticated-screenshot-journeys.spec.ts
if exist tests\user-journey-pricing-screenshots.spec.ts del tests\user-journey-pricing-screenshots.spec.ts
if exist tests\admin-feature-subscription-screenshots.spec.ts del tests\admin-feature-subscription-screenshots.spec.ts
if exist tests\direct-pricing-screenshots.spec.ts del tests\direct-pricing-screenshots.spec.ts
if exist tests\simple-pricing-screenshots.spec.ts del tests\simple-pricing-screenshots.spec.ts
if exist tests\phase2-3-feature-screenshots.spec.ts del tests\phase2-3-feature-screenshots.spec.ts

echo.
echo === Removing simple test variations ===
for %%f in (tests\simple-*.spec.ts) do (
    if exist "%%f" (
        del "%%f"
        echo Deleted: %%f
    )
)

echo.
echo === Removing redundant UI tests ===
if exist tests\ui-comprehensive.spec.ts del tests\ui-comprehensive.spec.ts
if exist tests\ui-screens-capture.spec.ts del tests\ui-screens-capture.spec.ts
if exist tests\authenticated-ui-screens.spec.ts del tests\authenticated-ui-screens.spec.ts

echo.
echo === Removing redundant navigation tests ===
if exist tests\nav-smoke.spec.ts del tests\nav-smoke.spec.ts
if exist tests\navigation-comprehensive.spec.ts del tests\navigation-comprehensive.spec.ts
if exist tests\routing-validation.spec.ts del tests\routing-validation.spec.ts

echo.
echo === Removing browser-specific debug tests ===
if exist tests\chrome-basic-load.spec.ts del tests\chrome-basic-load.spec.ts
if exist tests\webkit-http-force.spec.ts del tests\webkit-http-force.spec.ts

echo.
echo === Removing old admin tests ===
if exist tests\admin-pages-e2e.spec.ts del tests\admin-pages-e2e.spec.ts
if exist tests\enhanced-admin-management.spec.ts del tests\enhanced-admin-management.spec.ts
if exist tests\complete-admin-journey-phase2.spec.ts del tests\complete-admin-journey-phase2.spec.ts
if exist tests\enhanced-agent-admin-journeys.spec.ts del tests\enhanced-agent-admin-journeys.spec.ts

echo.
echo === Removing phase-specific tests ===
if exist tests\complete-user-journey-phase2-3.spec.ts del tests\complete-user-journey-phase2-3.spec.ts

echo.
echo ==================================
echo Cleanup Summary
echo ==================================
echo Files deleted: %DELETED%
echo.
echo Next steps:
echo 1. Run 'npm run check' to find broken imports
echo 2. Run 'npm run test' to verify tests still pass
echo 3. Run 'npm run build' to verify build works
echo 4. Commit changes if everything works
echo.
echo Cleanup complete!
pause
