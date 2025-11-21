# Testing Guide - November 18, 2025 Fixes

## Quick Start Testing

### Prerequisites
```bash
# Ensure server is running
npm run dev

# Or run server and client separately
npm run dev:server-only
npm run dev:client
```

---

## ✅ **Test 1: Privacy Verification Crash Fix**

### Steps:
1. Navigate to new project creation
2. Upload a dataset (any CSV/Excel file)
3. Proceed to Data Verification step
4. Wait for PII detection to complete

### Expected Behavior:
- ✅ Page loads without crashing
- ✅ If PII detected, dialog displays with risk level
- ✅ If risk level is undefined/null, displays gray badge instead of crashing
- ✅ User can proceed to next step

### What Was Fixed:
- `PIIDetectionDialog.tsx` now handles null/undefined risk levels
- Added null check before calling `.toLowerCase()`

### How to Verify Fix:
- Check browser console for errors
- Verify no error like "can't access property 'toLowerCase', risk is undefined"
- Dialog should display normally even if risk is missing

---

## ✅ **Test 2: Pricing Step Infinite Loop Fix**

### Steps:
1. Complete data upload and verification
2. Complete analysis execution
3. Navigate to Pricing/Payment step

### Expected Behavior:
- ✅ Page loads immediately (within 1-2 seconds)
- ✅ No browser freeze or hanging
- ✅ Pricing breakdown displays correctly
- ✅ No infinite loading spinner

### What Was Fixed:
- `pricing-step.tsx` now memoizes `analysisResults` and `datasetSizeMB`
- Prevents infinite re-render loop in useEffect

### How to Verify Fix:
- Check browser console for "Too many re-renders" error
- Monitor CPU usage (should not spike to 100%)
- Page should render once and stay stable

### Debugging Tips:
If still experiencing issues:
```javascript
// Open browser console and run:
console.log('Session:', useProjectSession());
console.log('Journey State:', useJourneyState());
```

---

## ✅ **Test 3: Plan Step Null Pointer Fix**

### Steps:
1. Create a new project
2. Upload dataset
3. Navigate to Plan step (or it may auto-load)

### Expected Behavior:
- ✅ Page displays plan information
- ✅ If `estimatedCost` is null, displays "$0.00" instead of crashing
- ✅ Cost breakdown section handles missing data gracefully
- ✅ User can approve/reject plan

### What Was Fixed:
- `plan-step.tsx` now uses optional chaining (`?.`) for `estimatedCost`
- Falls back to '0.00' if cost is null/undefined

### How to Verify Fix:
- Check browser console for "Cannot read properties of null (reading 'estimatedCost')"
- Plan should display even if backend returns null for cost
- Cost should show $0.00 if missing, not crash

---

## 🔍 **Test 4: Analysis Execution (Needs Verification)**

### Steps:
1. Complete all previous steps
2. Navigate to Execute step
3. Select analysis types
4. Click "Execute Analysis"
5. Wait for completion (may take 30-60 seconds)

### Expected Behavior:
- ✅ Analysis starts and shows progress
- ✅ Request completes with 200 status (not 500)
- ✅ Results display on completion
- ✅ No error about "Cannot read properties of null (reading 'estimatedCost')"

### What to Check:
```bash
# Server console should show:
🔬 Starting analysis for project {projectId}
📊 Analysis types: ...
✅ Analysis completed in X seconds

# Browser network tab should show:
POST /api/analysis-execution/execute → 200 OK (not 500)
```

### If Still Failing:
1. Check server console for exact error
2. Look for "Cannot read properties of null" errors
3. Verify project has an approved analysis plan
4. Check database for `analysis_plans` table entry

---

## 🔍 **Test 5: Artifact Generation (Linked to Test 4)**

### Steps:
1. Complete analysis execution (Test 4)
2. Navigate to project page
3. Click "Timeline" tab

### Expected Behavior:
- ✅ Timeline shows "Connected Datasets"
- ✅ Artifacts section shows generated files (PDF, CSV, etc.)
- ✅ User can download artifacts
- ✅ Files exist in `uploads/artifacts/{projectId}/`

### What to Check:
```bash
# Check if artifact directory was created
ls uploads/artifacts/

# Look for your project ID directory
ls uploads/artifacts/{projectId}/

# Should see files like:
# - {projectId}-report.pdf
# - {projectId}-data.csv
# - {projectId}-presentation.pptx
# - {projectId}-data.json
```

### If No Artifacts:
1. Verify analysis execution completed successfully
2. Check server logs for "❌ Failed to generate artifacts"
3. Verify uploads directory has write permissions
4. Check database `project_artifacts` table for entries

---

## 🔍 **Test 6: Analysis Plan Loading (Needs Backend Fix)**

### Steps:
1. Create new project
2. Navigate to `/journeys/business/plan`
3. Watch for plan creation

### Expected Behavior (CURRENTLY MAY FAIL):
- ✅ Plan loads within 30 seconds
- ✅ "Loading analysis plan..." spinner disappears
- ✅ Plan details display

### Current Issue:
- May get stuck on "Loading analysis plan..." indefinitely
- **This is a backend issue** with PM agent coordination

### If Plan Loading Stuck:
1. Check server console for PM agent logs
2. Look for timeout errors or agent failures
3. Verify Redis is running (if enabled)
4. Check `/api/projects/{projectId}/plan/create` endpoint
5. Check `/api/projects/{projectId}/plan/progress` endpoint

### Temporary Workaround:
```bash
# If stuck, can manually check if plan was created:
# Open browser console and run:
fetch(`/api/projects/${projectId}/plan`)
  .then(r => r.json())
  .then(console.log);
```

---

## 📊 **Comprehensive End-to-End Test**

### Full User Journey:
1. ✅ Register/Login
2. ✅ Create new project
3. ✅ Upload dataset
4. ✅ Data verification (PII check) - **FIXED**
5. ✅ Plan creation/loading - **MAY HANG**
6. ✅ Pricing/payment - **FIXED**
7. ✅ Analysis execution - **NEEDS TEST**
8. ✅ Artifact generation - **NEEDS TEST**
9. ✅ View results/insights

### Success Criteria:
- No browser console errors
- No 500 server errors
- No infinite loops or freezes
- User can complete workflow end-to-end

---

## 🐛 **Common Issues & Solutions**

### Issue: "Session expired" errors
**Solution**:
- Restart the server
- Clear browser localStorage
- Login again

### Issue: Analysis execution returns 404
**Solution**:
- Verify server is running on port 5000
- Check `/api/analysis-execution/execute` endpoint exists
- Verify CORS settings

### Issue: Artifacts not showing
**Solution**:
- Check if analysis execution completed (200 status)
- Verify `uploads/artifacts/` directory exists
- Check file system permissions
- Look for database entries in `project_artifacts` table

### Issue: Plan loading infinitely
**Solution** (Backend Investigation):
- This is a known issue with PM agent
- Check server logs for agent errors
- Verify Redis is running (if enabled)
- May need to increase timeout in `plan-step.tsx`

---

## 📝 **Testing Checklist**

Copy this checklist and check off as you test:

### Critical Fixes:
- [ ] Privacy verification loads without crash
- [ ] Pricing step loads without infinite loop
- [ ] Plan step displays without null pointer error

### Functionality Tests:
- [ ] Analysis execution completes successfully (200 status)
- [ ] Artifacts are generated and downloadable
- [ ] Timeline shows artifacts
- [ ] AI insights display (if not 403)

### Performance Tests:
- [ ] No infinite loops or freezes
- [ ] Pages load within 3 seconds
- [ ] Analysis completes within 2 minutes
- [ ] No memory leaks

### Browser Console:
- [ ] No React errors
- [ ] No null pointer exceptions
- [ ] No infinite re-render warnings
- [ ] No authentication errors (except known AI insights 403)

---

## 🚀 **Quick Commands**

```bash
# Start development server
npm run dev

# Run only server (backend)
npm run dev:server-only

# Run only client (frontend)
npm run dev:client

# Check TypeScript errors
npm run check

# Run E2E tests
npm run test:user-journeys

# Check server logs
# (View terminal where server is running)

# Check database
# psql -d chimaridata
# SELECT * FROM projects ORDER BY created_at DESC LIMIT 5;
# SELECT * FROM analysis_plans ORDER BY created_at DESC LIMIT 5;
# SELECT * FROM project_artifacts ORDER BY created_at DESC LIMIT 5;
```

---

## 📧 **Reporting Results**

After testing, please report:

1. **Which tests passed** (✅)
2. **Which tests failed** (❌)
3. **Error messages** (copy from console)
4. **Screenshots** of any errors
5. **Server logs** if analysis execution fails

### Example Report:
```
✅ Test 1 (Privacy): PASSED - No crash, dialog displays correctly
✅ Test 2 (Pricing): PASSED - No infinite loop, loads instantly
✅ Test 3 (Plan): PASSED - Displays $0.00 when cost is null
❌ Test 4 (Execution): FAILED - Still getting 500 error
   Error: "Cannot connect to Python processor"
   Server Log: [paste relevant log lines]
```

---

**Last Updated**: November 18, 2025, 8:50 PM
**Status**: Ready for testing
**Priority**: Run Tests 1-3 first (critical fixes), then Tests 4-6
