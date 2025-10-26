#!/bin/bash
# Production User Journey Test Runner
# Runs comprehensive tests for user journeys, admin billing, and agent/tool management
# with screenshot capture for each workflow step

echo ""
echo "================================================================================"
echo " PRODUCTION USER JOURNEY TESTS"
echo "================================================================================"
echo ""
echo "This script will run comprehensive tests with screenshot capture:"
echo "  - User Journeys (Non-Tech, Business, Technical, Consultation)"
echo "  - Admin Billing & Subscription Management"
echo "  - Agent & Tool Management Workflows"
echo ""
echo "Screenshots will be saved to: test-results/production-journeys/"
echo ""

# Ensure both servers are running
echo "Checking if servers are running..."

# Check API server (port 3000)
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo ""
    echo "ERROR: API server is not running on port 3000!"
    echo "Please start the development servers with: npm run dev"
    echo ""
    exit 1
fi

# Check client (port 5173)
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo ""
    echo "ERROR: Client app is not running on port 5173!"
    echo "Please start the development servers with: npm run dev"
    echo ""
    exit 1
fi

echo "Server is running. Starting tests..."
echo ""

# Run the production journey tests
npx playwright test tests/production-user-journeys.spec.ts --reporter=list,html

echo ""
echo "================================================================================"
echo " TEST EXECUTION COMPLETE"
echo "================================================================================"
echo ""
echo "View the HTML report with: npx playwright show-report"
echo "View screenshots in: test-results/production-journeys/"
echo ""

