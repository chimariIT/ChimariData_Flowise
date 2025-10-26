#!/bin/bash

# Codebase Cleanup Script
# Removes duplicate and obsolete files identified in audit
# IMPORTANT: Run this from the project root directory
# IMPORTANT: Create backup branch first!

set -e  # Exit on error

echo "=================================="
echo "ChimariData Codebase Cleanup"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from project root directory"
    exit 1
fi

# Check if backup branch exists
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "codebase-cleanup" ]; then
    echo "⚠️  Warning: You are not on the 'codebase-cleanup' branch"
    echo "It's recommended to create a backup first:"
    echo ""
    echo "  git checkout -b backup-before-cleanup"
    echo "  git add . && git commit -m 'Backup before cleanup'"
    echo "  git checkout -b codebase-cleanup"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cleanup cancelled"
        exit 1
    fi
fi

echo ""
echo "Starting cleanup..."
echo ""

# Counter for deleted files
DELETED=0

# Function to safely delete file
delete_file() {
    if [ -f "$1" ]; then
        echo "🗑️  Deleting: $1"
        rm "$1"
        ((DELETED++))
    else
        echo "⚠️  File not found: $1"
    fi
}

# 1. Delete duplicate billing files
echo "=== Cleaning up billing files ==="
delete_file "server/adaptive-billing-service.ts"
delete_file "server/enhanced-billing-service-v2.ts"
delete_file "server/enhanced-feature-billing-service.ts"
delete_file "server/services/enhanced-subscription-billing.ts"
delete_file "server/scripts/migrate-billing-data.ts"

# 2. Delete duplicate service files in root
echo ""
echo "=== Removing duplicate services from root ==="
delete_file "server/conversational-agent.ts"
delete_file "server/technical-ai-agent.ts"
delete_file "server/question-analyzer-old.ts"
delete_file "server/file-processor.ts"
delete_file "server/data-transformer.ts"
delete_file "server/pii-detector.ts"
delete_file "server/python-processor.ts"
delete_file "server/ml-service.ts"
delete_file "server/pricing-service.ts"
delete_file "server/goal-analysis-engine.ts"
delete_file "server/enhanced-workflow-service.ts"

# 3. Delete duplicate landing pages
echo ""
echo "=== Removing duplicate landing pages ==="
delete_file "client/src/pages/pricing-broken.tsx"
delete_file "client/src/pages/main-landing.tsx"
delete_file "client/src/pages/home-page.tsx"

# 4. Delete debug test files
echo ""
echo "=== Removing debug test files ==="
delete_file "tests/debug-journey-pages.spec.ts"
delete_file "tests/debug-journey-no-auth.spec.ts"
delete_file "tests/debug-root-page.spec.ts"
delete_file "tests/debug-console-errors.spec.ts"
delete_file "tests/debug-admin-page.spec.ts"
delete_file "tests/debug-permission-ui.spec.ts"

# Delete webkit debug tests
for file in tests/webkit-*.spec.ts; do
    if [ -f "$file" ]; then
        delete_file "$file"
    fi
done

# 5. Delete duplicate auth tests (keep register-and-login-journey.spec.ts)
echo ""
echo "=== Removing duplicate auth tests ==="
delete_file "tests/auth-smoke.spec.ts"
delete_file "tests/auth-flow-test.spec.ts"
delete_file "tests/auth-verification.spec.ts"
delete_file "tests/auth-fix-verification.spec.ts"
delete_file "tests/comprehensive-auth-journey.spec.ts"

# 6. Delete duplicate journey tests (keep complete-user-journey-with-tools.spec.ts)
echo ""
echo "=== Removing duplicate journey tests ==="
delete_file "tests/journey-flow-only.spec.ts"
delete_file "tests/journey-flow-comprehensive.spec.ts"
delete_file "tests/simple-user-journeys.spec.ts"
delete_file "tests/authenticated-journey.spec.ts"
delete_file "tests/full-authenticated-journey.spec.ts"
delete_file "tests/manual-user-journey.spec.ts"
delete_file "tests/authenticated-user-journeys.spec.ts"
delete_file "tests/complete-user-journeys.spec.ts"
delete_file "tests/real-user-journey-workflow.spec.ts"
delete_file "tests/final-complete-journey.spec.ts"
delete_file "tests/complete-user-journey-fixed.spec.ts"
delete_file "tests/authenticated-full-journeys.spec.ts"
delete_file "tests/streamlined-journey-selection.spec.ts"
delete_file "tests/pre-post-auth-journey-flow.spec.ts"
delete_file "tests/journey-button-visibility.spec.ts"
delete_file "tests/generate-journey-artifacts.spec.ts"

# 7. Delete duplicate dashboard tests
echo ""
echo "=== Removing duplicate dashboard tests ==="
delete_file "tests/dashboard-smoke.spec.ts"
delete_file "tests/dashboard-authenticated.spec.ts"
delete_file "tests/protected-routes-authenticated.spec.ts"

# 8. Delete duplicate screenshot tests
echo ""
echo "=== Removing duplicate screenshot tests ==="
delete_file "tests/simple-journey-screenshots.spec.ts"
delete_file "tests/current-authenticated-screenshots.spec.ts"
delete_file "tests/complete-user-journey-screenshots.spec.ts"
delete_file "tests/authenticated-screenshot-journeys.spec.ts"
delete_file "tests/user-journey-pricing-screenshots.spec.ts"
delete_file "tests/admin-feature-subscription-screenshots.spec.ts"
delete_file "tests/direct-pricing-screenshots.spec.ts"
delete_file "tests/simple-pricing-screenshots.spec.ts"
delete_file "tests/phase2-3-feature-screenshots.spec.ts"

# 9. Delete simple test variations
echo ""
echo "=== Removing simple test variations ==="
for file in tests/simple-*.spec.ts; do
    if [ -f "$file" ]; then
        delete_file "$file"
    fi
done

# 10. Delete UI comprehensive tests (redundant with journey tests)
echo ""
echo "=== Removing redundant UI tests ==="
delete_file "tests/ui-comprehensive.spec.ts"
delete_file "tests/ui-screens-capture.spec.ts"
delete_file "tests/authenticated-ui-screens.spec.ts"

# 11. Delete navigation tests (covered by journey tests)
echo ""
echo "=== Removing redundant navigation tests ==="
delete_file "tests/nav-smoke.spec.ts"
delete_file "tests/navigation-comprehensive.spec.ts"
delete_file "tests/routing-validation.spec.ts"

# 12. Delete Chrome/webkit specific debug tests
echo ""
echo "=== Removing browser-specific debug tests ==="
delete_file "tests/chrome-basic-load.spec.ts"
delete_file "tests/webkit-http-force.spec.ts"

# 13. Delete old admin journey tests (keep comprehensive)
echo ""
echo "=== Removing old admin tests ==="
delete_file "tests/admin-pages-e2e.spec.ts"
delete_file "tests/enhanced-admin-management.spec.ts"
delete_file "tests/complete-admin-journey-phase2.spec.ts"
delete_file "tests/enhanced-agent-admin-journeys.spec.ts"

# 14. Delete phase-specific tests (consolidate into main tests)
echo ""
echo "=== Removing phase-specific tests ==="
delete_file "tests/complete-user-journey-phase2-3.spec.ts"

# Summary
echo ""
echo "=================================="
echo "Cleanup Summary"
echo "=================================="
echo "Files deleted: $DELETED"
echo ""
echo "Next steps:"
echo "1. Run 'npm run check' to find broken imports"
echo "2. Run 'npm run test' to verify tests still pass"
echo "3. Run 'npm run build' to verify build works"
echo "4. Commit changes if everything works"
echo ""
echo "✅ Cleanup complete!"
