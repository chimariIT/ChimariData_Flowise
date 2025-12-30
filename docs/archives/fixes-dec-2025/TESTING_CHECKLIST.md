# Manual Testing Checklist - Journey Flow Restructuring

## Pre-Testing Setup
- [ ] Ensure development server is running (`npm run dev`)
- [ ] Ensure backend server is running
- [ ] Have a test CSV file ready (with at least 10 rows and multiple columns)
- [ ] Clear browser cache/localStorage if needed

---

## Test 1: Data Upload Step (Step 1)

### Actions:
1. [ ] Navigate to http://localhost:5000
2. [ ] Log in if needed
3. [ ] Start a new business journey
4. [ ] Upload a CSV file

### Expected Results:
- [ ] ✅ File uploads successfully
- [ ] ✅ Data profiling card appears after upload
- [ ] ✅ Descriptive statistics are displayed (column types, distributions, etc.)
- [ ] ✅ Quality metrics shown
- [ ] ❌ NO transformation UI visible
- [ ] ❌ NO "Continue to Verification" button
- [ ] ✅ "Continue to Analysis Preparation" button visible

### Screenshot Location:
Take screenshot: `test_results/01_data_upload_with_profiling.png`

---

## Test 2: Analysis Preparation Step (Step 2)

### Actions:
1. [ ] Click "Continue to Analysis Preparation"
2. [ ] Enter analysis goals (e.g., "Analyze sales trends")
3. [ ] Enter business questions (e.g., "What are the top products?")
4. [ ] Click "Generate Data Requirements"

### Expected Results:
- [ ] ✅ Goals and questions accepted
- [ ] ✅ Data requirements generation starts
- [ ] ✅ Requirements document generated
- [ ] ✅ Can navigate to next step

### Screenshot Location:
Take screenshot: `test_results/02_analysis_preparation.png`

---

## Test 3: Data Verification Step (Step 3)

### Actions:
1. [ ] Navigate to Data Verification step
2. [ ] Check the data preview tab
3. [ ] Try scrolling horizontally in the data table
4. [ ] Try scrolling vertically in the data table
5. [ ] Check the Quality tab
6. [ ] Note the quality score value

### Expected Results:
- [ ] ✅ Data preview displays correctly
- [ ] ✅ Table scrolls HORIZONTALLY (for many columns)
- [ ] ✅ Table scrolls VERTICALLY (for many rows)
- [ ] ✅ Quality score shows as PERCENTAGE (e.g., "94%" not "0.94")
- [ ] ✅ Completeness metric shows as PERCENTAGE (e.g., "94%" not "0.9375")
- [ ] ✅ All metrics (consistency, accuracy, validity) show as percentages
- [ ] ❌ NO profiling tab visible (moved to upload step)

### Screenshot Locations:
- Take screenshot of data preview: `test_results/03a_data_preview_scrollable.png`
- Take screenshot of quality tab: `test_results/03b_quality_score_percentage.png`

### Critical Checks:
- **Quality Score Format**: Should be "94%" NOT "0.94" or "62%"
- **Metrics Format**: Should be "94%" NOT "0.9375"

---

## Test 4: Data Transformation Step (Step 4) - NEW!

### Actions:
1. [ ] Navigate to Data Transformation step
2. [ ] Verify source-to-target mappings table is displayed
3. [ ] Check confidence scores for each mapping
4. [ ] For elements requiring transformation, enter natural language logic
   - Example: "Convert date string to ISO format"
5. [ ] Click "Execute Transformations"
6. [ ] Verify transformation preview appears

### Expected Results:
- [ ] ✅ Source-to-target mapping table visible
- [ ] ✅ Target elements listed (from required data elements)
- [ ] ✅ Source columns mapped
- [ ] ✅ Confidence scores shown as badges (color-coded)
- [ ] ✅ Transformation logic textareas visible for required transformations
- [ ] ✅ "Execute Transformations" button works
- [ ] ✅ Preview shows transformed data
- [ ] ✅ "Continue to Project Setup" button enabled after execution

### Screenshot Locations:
- Take screenshot of mappings: `test_results/04a_transformation_mappings.png`
- Take screenshot of preview: `test_results/04b_transformation_preview.png`

---

## Test 5: Project Setup Step (Step 5)

### Actions:
1. [ ] Navigate to Project Setup step
2. [ ] Verify project details are shown
3. [ ] Confirm settings

### Expected Results:
- [ ] ✅ Project setup displays correctly
- [ ] ✅ Can proceed to next steps

### Screenshot Location:
Take screenshot: `test_results/05_project_setup.png`

---

## Test 6: Complete Flow Navigation

### Actions:
1. [ ] Navigate backwards through steps
2. [ ] Navigate forwards through steps
3. [ ] Verify data persists when navigating

### Expected Results:
- [ ] ✅ Can navigate back and forth
- [ ] ✅ Data is preserved
- [ ] ✅ No errors in browser console

---

## Test 7: Edge Cases

### Test 7a: Empty/Missing Data
1. [ ] Try uploading an empty CSV
2. [ ] Verify appropriate error handling

### Test 7b: Large Dataset
1. [ ] Upload a CSV with 100+ rows and 20+ columns
2. [ ] Verify scrolling works smoothly
3. [ ] Verify performance is acceptable

### Test 7c: Special Characters
1. [ ] Upload CSV with special characters in column names
2. [ ] Verify mapping works correctly

---

## Issues to Report

### Format:
For each issue found, note:
- **Step**: Which step (1-5)
- **Issue**: What went wrong
- **Expected**: What should happen
- **Actual**: What actually happened
- **Screenshot**: Path to screenshot showing the issue

### Example:
```
Step: 3 (Data Verification)
Issue: Quality score shows as decimal
Expected: 94%
Actual: 0.94
Screenshot: test_results/issue_quality_decimal.png
```

---

## Success Criteria

### All Must Pass:
- [ ] ✅ Data profiling appears in upload step (Step 1)
- [ ] ✅ No transformation UI in upload step
- [ ] ✅ Data preview scrolls horizontally and vertically (Step 3)
- [ ] ✅ Quality score displays as percentage, not decimal (Step 3)
- [ ] ✅ All metrics display as percentages (Step 3)
- [ ] ✅ Data transformation step exists and works (Step 4)
- [ ] ✅ Source-to-target mappings display correctly (Step 4)
- [ ] ✅ Transformation preview works (Step 4)
- [ ] ✅ Complete flow works end-to-end
- [ ] ✅ No console errors

---

## Post-Testing

### If All Tests Pass:
1. [ ] Mark all phases as complete in task.md
2. [ ] Update walkthrough.md with test results
3. [ ] Prepare for production deployment

### If Issues Found:
1. [ ] Document all issues in the "Issues to Report" section
2. [ ] Prioritize critical vs. minor issues
3. [ ] Create fix plan for each issue

---

## Notes

- **Browser**: Test in Chrome/Edge (primary) and Firefox (secondary)
- **Console**: Keep browser console open to catch any errors
- **Network**: Monitor network tab for failed API calls
- **Performance**: Note any slow operations (>3 seconds)

**Testing Date**: _____________
**Tester**: _____________
**Browser**: _____________
**Results**: PASS / FAIL (circle one)
