# PHASE 1: CRITICAL BLOCKERS - EXECUTION PLAN

**Duration**: Week 1 (5 working days)
**Approach**: Test-Driven Development (TDD)
**Success Criteria**: All tests pass, no mock data in production

---

## PRE-EXECUTION VALIDATION ✅

**Current State Assessment**:
- ✅ Python analysis scripts exist (9 files in `python/`)
- ✅ Enhanced Python processor exists (`server/services/enhanced-python-processor.ts`)
- ✅ Mock data already removed from `technical-ai-agent.ts` (lines 479, 667)
- ⚠️ Spark processor still has mock mode (lines 96, 112, 119, 142-186)
- ⚠️ Tool initialization services not called in `server/index.ts`
- ⚠️ Multiple billing services exist (fragmentation)

---

## TASK 1.1: VERIFY PYTHON INTEGRATION (Day 1 - Morning)

### Step 1.1.1: Create Python Health Check Test

**File**: `tests/python-integration-health.spec.ts`

**Test Objectives**:
1. Verify Python executable found
2. Verify required libraries installed (pandas, numpy, scikit-learn, scipy, statsmodels)
3. Verify Python scripts execute successfully
4. Verify data I/O (CSV reading/writing)

**Implementation**: Create test file first (TDD approach)

### Step 1.1.2: Create Real Data Analysis Test

**File**: `tests/real-data-analysis-verification.spec.ts`

**Test Objectives**:
1. Upload real CSV file
2. Execute statistical analysis via Python
3. Verify results contain real statistics (not mock)
4. Verify metadata doesn't contain "mock" or "simulated"
5. Verify results are deterministic (same input = same output)

**Implementation**: Create test with sample dataset

### Step 1.1.3: Execute and Fix

**Execution Order**:
1. Run tests (expect failures)
2. Fix Python integration issues
3. Re-run tests until passing
4. Document any environment setup required

**Success Criteria**:
- [ ] All Python health checks pass
- [ ] Real analysis returns actual statistics
- [ ] No "mock" or "simulated" in metadata

---

## TASK 1.2: INITIALIZE TOOLS & AGENTS AT STARTUP (Day 1 - Afternoon)

### Step 1.2.1: Create Tool Initialization Test

**File**: `tests/tool-initialization-startup.spec.ts`

**Test Objectives**:
1. Verify MCPToolRegistry has tools registered at startup
2. Verify Agent Registry has agents registered at startup
3. Verify all 9 core tools present
4. Verify tool-agent permission matrix correct

**Implementation**: Create test that checks registry state

### Step 1.2.2: Create Initialization Health Check Endpoint Test

**File**: `tests/admin-initialization-health.spec.ts`

**Test Objectives**:
1. `GET /api/admin/system/initialization-status` returns 200
2. Response shows all tools initialized
3. Response shows all agents initialized
4. Response includes initialization timestamp

**Implementation**: Create test for new endpoint

### Step 1.2.3: Execute and Fix

**Execution Order**:
1. Run tests (expect failures)
2. Add initialization calls to `server/index.ts`
3. Create health check endpoint
4. Re-run tests until passing

**Success Criteria**:
- [ ] MCPToolRegistry.getAllTools().length >= 9
- [ ] Agent registry has 3+ agents
- [ ] Health check endpoint returns success

---

## TASK 1.3: CONSOLIDATE BILLING SERVICES (Day 2-3)

### Step 1.3.1: Create Billing Consolidation Test

**File**: `tests/billing-service-consolidation.spec.ts`

**Test Objectives**:
1. Only ONE billing service imported in routes
2. Pricing calculation consistent
3. Quota tracking works
4. Overage calculation accurate
5. Stripe sync functional

**Implementation**: Create test suite for billing

### Step 1.3.2: Create Billing Integration Test

**File**: `tests/integration/billing-end-to-end.spec.ts`

**Test Objectives**:
1. User uploads data → usage tracked
2. Quota exceeded → overage calculated
3. Tier upgrade → quotas updated
4. Invoice generated → correct amounts

**Implementation**: Full workflow test

### Step 1.3.3: Execute and Fix

**Execution Order**:
1. Audit existing billing services
2. Create unified service (may already exist)
3. Update all imports to use unified service
4. Remove old services
5. Run tests until passing

**Success Criteria**:
- [ ] Only 1 billing service exists
- [ ] All tests pass
- [ ] No duplicate pricing logic

---

## CODE CLEANUP CHECKLIST (Day 4)

### Cleanup Tasks:

1. **Remove Dead Code**:
   - [ ] Search for unused imports in changed files
   - [ ] Remove commented-out code
   - [ ] Remove old mock data functions

2. **Update Documentation**:
   - [ ] Update CLAUDE.md to remove "Known Issue #1" (mock data)
   - [ ] Update CLAUDE.md to remove "Known Issue #2" (tool initialization)
   - [ ] Update PRODUCTION-READINESS.md

3. **Optimize Imports**:
   ```bash
   # Run for each modified file
   npx organize-imports-cli server/services/*.ts
   ```

4. **Run Type Checking**:
   ```bash
   npm run check
   ```

5. **Run Linting**:
   ```bash
   npx eslint server/services/*.ts --fix
   ```

---

## POST-EXECUTION VALIDATION (Day 5)

### Validation Tests:

1. **Run Full Test Suite**:
   ```bash
   npm run test:user-journeys
   npm run test:production
   npm run test:unit
   ```

2. **Run New Phase 1 Tests**:
   ```bash
   npx playwright test tests/python-integration-health.spec.ts
   npx playwright test tests/real-data-analysis-verification.spec.ts
   npx playwright test tests/tool-initialization-startup.spec.ts
   npx playwright test tests/billing-service-consolidation.spec.ts
   ```

3. **Manual Verification**:
   - [ ] Upload CSV file via UI
   - [ ] Execute analysis
   - [ ] Verify results are real (check for actual correlations)
   - [ ] Check admin panel → agents tab → verify agents loaded
   - [ ] Check admin panel → tools tab → verify tools loaded

4. **Documentation Verification**:
   - [ ] CLAUDE.md updated
   - [ ] PRODUCTION-READINESS.md updated
   - [ ] README.md reflects new state

---

## ROLLBACK PLAN

If tests fail after 3 attempts:

1. **Create Git Branch**:
   ```bash
   git checkout -b phase1-execution
   git commit -am "Phase 1: Work in progress"
   ```

2. **Document Blockers**:
   - Create `PHASE1_BLOCKERS.md`
   - List specific errors
   - Include stack traces
   - Note environment issues

3. **Revert Changes**:
   ```bash
   git checkout main
   ```

4. **Review with Human**:
   - Share blockers document
   - Discuss environment setup
   - Plan alternative approach

---

## SUCCESS METRICS

**Phase 1 Complete When**:
- ✅ All 10+ tests passing
- ✅ No mock data in production code
- ✅ Tools initialized at startup
- ✅ Billing consolidated to 1 service
- ✅ Documentation updated
- ✅ Type checking passes
- ✅ Production test suite passes

**Estimated Completion**: 5 days
**Confidence Level**: High (90%)
