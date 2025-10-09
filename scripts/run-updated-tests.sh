#!/bin/bash

# Comprehensive Test Execution Script
# Based on documentation review and updated test requirements

echo "🚀 Running Updated Test Suite for ChimariData Platform"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test configuration
TIMEOUT=120000  # 2 minutes per test
WORKERS=1       # Sequential execution for stability
HEADLESS=true   # Set to false for debugging

# Function to run tests with error handling
run_test_suite() {
    local test_file=$1
    local test_name=$2
    local description=$3
    
    echo -e "\n${BLUE}📋 Running: $test_name${NC}"
    echo -e "${BLUE}Description: $description${NC}"
    echo "Command: npx playwright test $test_file --timeout=$TIMEOUT --workers=$WORKERS"
    
    if npx playwright test "$test_file" --timeout="$TIMEOUT" --workers="$WORKERS"; then
        echo -e "${GREEN}✅ $test_name - PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name - FAILED${NC}"
        return 1
    fi
}

# Function to run tests in headed mode for debugging
run_test_suite_headed() {
    local test_file=$1
    local test_name=$2
    
    echo -e "\n${BLUE}📋 Running (Headed): $test_name${NC}"
    
    if npx playwright test "$test_file" --timeout="$TIMEOUT" --workers=1 --headed; then
        echo -e "${GREEN}✅ $test_name - PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $test_name - FAILED${NC}"
        return 1
    fi
}

# Start server if not running
echo -e "${YELLOW}🔧 Checking if server is running...${NC}"
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${YELLOW}🚀 Starting development server...${NC}"
    npm run dev &
    SERVER_PID=$!
    
    # Wait for server to start
    echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
    for i in {1..30}; do
        if curl -s http://localhost:3000/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Server started successfully${NC}"
            break
        fi
        sleep 2
    done
    
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Server failed to start within 60 seconds${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Server is already running${NC}"
fi

# Test results tracking
PASSED=0
FAILED=0
TOTAL=0

echo -e "\n${BLUE}🎯 PHASE 1: Core System Tests${NC}"
echo "================================="

# 1. Comprehensive Agent Journey Framework Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/comprehensive-agent-journey-framework.spec.ts" \
    "Comprehensive Agent Journey Framework" \
    "Tests the complete end-to-end user journey with multi-agent orchestration, adaptive handholding, template sourcing, and integrated billing"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# 2. Enhanced Admin Management Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/enhanced-admin-management.spec.ts" \
    "Enhanced Admin Management" \
    "Tests the complete admin interface including agent/tool management, template system, and security"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# 3. Billing System Improvements Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/billing-system-improvements.spec.ts" \
    "Billing System Improvements" \
    "Tests tier consolidation, overage billing, campaign management, and usage dashboard"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}🎯 PHASE 2: Existing Test Validation${NC}"
echo "======================================"

# 4. Billing Tier Alignment Tests (Updated)
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/billing-tier-alignment.spec.ts" \
    "Billing Tier Alignment" \
    "Validates subscription tier alignment with new usage categories and admin configuration"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# 5. Authenticated Full Journeys Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/authenticated-full-journeys.spec.ts" \
    "Authenticated Full Journeys" \
    "Tests complete user journeys with different subscription tiers and authentication"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# 6. Admin Pages E2E Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/admin-pages-e2e.spec.ts" \
    "Admin Pages E2E" \
    "Comprehensive E2E testing of admin interface with modern TypeScript"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}🎯 PHASE 3: Smoke Tests${NC}"
echo "======================"

# 7. Basic Navigation Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/nav-smoke.spec.ts" \
    "Navigation Smoke Tests" \
    "Basic navigation and page loading tests"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

# 8. Dashboard Smoke Tests
TOTAL=$((TOTAL + 1))
if run_test_suite "tests/dashboard-smoke.spec.ts" \
    "Dashboard Smoke Tests" \
    "Basic dashboard functionality tests"; then
    PASSED=$((PASSED + 1))
else
    FAILED=$((FAILED + 1))
fi

echo -e "\n${BLUE}🎯 PHASE 4: Optional Debug Tests${NC}"
echo "=================================="

# Check if we should run debug tests
if [ "$1" = "--debug" ]; then
    echo -e "${YELLOW}🔍 Running debug tests in headed mode...${NC}"
    
    # Run a subset of tests in headed mode for debugging
    run_test_suite_headed "tests/comprehensive-agent-journey-framework.spec.ts" \
        "Comprehensive Agent Journey Framework (Debug)"
    
    run_test_suite_headed "tests/enhanced-admin-management.spec.ts" \
        "Enhanced Admin Management (Debug)"
fi

# Generate test report
echo -e "\n${BLUE}📊 TEST EXECUTION SUMMARY${NC}"
echo "=========================="
echo -e "Total Tests: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"

if [ $FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo -e "${GREEN}✅ The updated test suite is working correctly${NC}"
    echo -e "${GREEN}✅ All critical functionality is validated${NC}"
    exit 0
else
    echo -e "\n${RED}❌ SOME TESTS FAILED${NC}"
    echo -e "${RED}⚠️  Please review the failed tests above${NC}"
    echo -e "${YELLOW}💡 Run with --debug flag for detailed debugging${NC}"
    exit 1
fi

# Cleanup
if [ ! -z "$SERVER_PID" ]; then
    echo -e "\n${YELLOW}🧹 Cleaning up server process...${NC}"
    kill $SERVER_PID 2>/dev/null
fi
