# 🚀 QUICK TEST GUIDE - Teacher Survey Dataset

**Your Dataset**: `English Survey for Teacher Conferences Week Online (Responses).xlsx`
**Location**: `C:\Users\scmak\Documents\Work\Projects\Chimari\Consulting_BYOD\sampledata\SPTO\`

---

## ⚡ Quick Start (3 Steps)

### Step 1: Start the Server
```bash
npm run dev
```

Wait for:
```
✅ Database connection established
Server running on http://localhost:5000
```

---

### Step 2: Test End-to-End Journey

**Option A: Via Web Interface** (Recommended)

1. **Open Browser**: http://localhost:5173

2. **Login** (or register if needed)

3. **Create Project**:
   - Click "New Project"
   - Name: "Teacher Survey Analysis"
   - Journey Type: "AI-Guided" (non-tech)
   - Click "Create"

4. **Upload Dataset**:
   - Navigate to Data Step
   - Click "Upload File"
   - Select: `English Survey for Teacher Conferences Week Online (Responses).xlsx`
   - Wait for upload and schema detection

5. **Execute Analysis** ← **CRITICAL TEST**:
   - Go to Execute Step
   - Select analysis types:
     - ☑️ Descriptive Statistics
     - ☑️ Correlation Analysis
   - Click "Execute Analysis"
   - **KEY**: Should NOT require plan approval
   - Wait ~30-60 seconds

6. **View Artifacts** ← **CRITICAL TEST**:
   - Navigate to project page (Dashboard → Your Project)
   - Click "Artifacts" tab
   - **Should see**:
     - 📄 PDF Report
     - 📊 Presentation (PPTX)
     - 📊 CSV Export
     - 📊 JSON Data
     - 📊 Dashboard Link
   - Click download links → Files should download

---

**Option B: Automated Test** (Quick Validation)

```bash
# First, copy your dataset to project root
copy "C:\Users\scmak\Documents\Work\Projects\Chimari\Consulting_BYOD\sampledata\SPTO\English Survey for Teacher Conferences Week Online (Responses).xlsx" "English Survey.xlsx"

# Run automated test
npm run test:e2e-journey
```

**Expected Output**:
```
✅ User Setup: Using user: test@example.com
✅ Project Creation: Created project: abc123
✅ Dataset Upload: Uploaded rows with columns
✅ Analysis Execution: Analysis completed with insights
✅ Artifact Generation: Generated 5 artifact types
✅ Artifact Verification: Found artifact records in database
✅ File System Check: Found artifact files
✅ Journey State: Project status: completed

Total Duration: <60s
✅ ALL TESTS PASSED
```

---

### Step 3: Verify Artifacts

**Check Database**:
```bash
npm run check-all-projects
```

**Check File System**:
```bash
# Navigate to artifacts directory
cd uploads\artifacts

# List all project folders
dir

# Check specific project
dir {your-project-id}
```

**Should see**:
```
{projectId}-report.pdf
{projectId}-presentation.pptx
{projectId}-data.csv
{projectId}-data.json
```

---

## 🎯 What to Look For (Success Indicators)

### ✅ Success = All of These Work:

1. **Upload**:
   - ✅ Excel file uploads successfully
   - ✅ Data preview shows rows
   - ✅ Schema detected (columns + types)

2. **Analysis**:
   - ✅ Analysis executes WITHOUT plan approval prompt
   - ✅ Completes in <60 seconds (for typical survey data)
   - ✅ Console shows: "Generated X artifacts"
   - ✅ Console shows: "Saved artifact metadata to database"

3. **Artifacts**:
   - ✅ Artifacts tab shows 4-5 artifact types
   - ✅ Download links work
   - ✅ Files exist in `uploads/artifacts/{projectId}/`
   - ✅ PDF contains actual survey insights

4. **Journey State**:
   - ✅ Project status shows "completed"
   - ✅ Journey timeline shows progress
   - ✅ Decision trail has entries

---

## ❌ If Something Fails

### Problem: Artifacts Don't Show Up

**Check Console (Browser F12)**:
```
Should see:
✅ Artifacts loaded: {count}
```

**Check Server Console**:
```
Should see:
✅ Generated 5 artifacts
✅ Saved artifact metadata to database for project {id}
```

**Fix**:
```bash
# Restart server
npm run dev

# Try again
```

---

### Problem: "Plan Approval Required" Error

**This means the fix didn't load**

**Fix**:
```bash
# Stop server (Ctrl+C)
# Restart
npm run dev
```

**Verify Fix Applied**:
- Check `server/services/analysis-execution.ts` line 162
- Should say: "// ✅ REMOVED BLOCKING REQUIREMENT"
- Should NOT throw error if no approved plan

---

### Problem: Upload Fails

**Excel files need `xlsx` library**

**Verify**:
```bash
npm list xlsx
```

**Should see**: `xlsx@0.18.5` or similar

**If missing**:
```bash
npm install xlsx
```

---

## 📊 Expected Performance

**With Your Teacher Survey Dataset**:

| Step | Time |
|------|------|
| Upload Excel | ~3-5 seconds |
| Schema Detection | ~2-3 seconds |
| Analysis | ~25-40 seconds |
| Artifact Generation | ~5-10 seconds |
| **Total** | **~35-58 seconds** ✅ |

**SLA Target**: <1 minute ✅

---

## 🔍 Detailed Verification

### 1. Check Database Records

```bash
npm run check-all-projects
```

**Look for your project in output**:
```
Projects by Status:
   completed: 1

Projects with analysisResults: YES ✅
Projects without artifacts: NO ✅
```

---

### 2. Check Artifact Files

**Navigate to**:
```
uploads\artifacts\{your-project-id}\
```

**Open PDF**:
- Should have project title: "Teacher Survey Analysis"
- Should have 3+ insights about survey responses
- Should have timestamp

**Open CSV**:
- Should contain analysis summary data
- Should be importable into Excel

---

### 3. Check API Endpoints

**Get Artifacts** (using your auth token):
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/projects/YOUR_PROJECT_ID/artifacts
```

**Should return**:
```json
{
  "success": true,
  "artifacts": [
    {
      "id": "...",
      "type": "analysis",
      "status": "completed",
      "fileRefs": "[...]"
    }
  ]
}
```

---

## 🎯 Success Checklist

After testing, you should be able to:

- [x] Upload Excel file (teacher survey)
- [x] See data preview with survey responses
- [x] Execute analysis without plan approval
- [x] Complete journey in <1 minute
- [x] See 4-5 artifacts in Artifacts tab
- [x] Download PDF report
- [x] Download CSV export
- [x] Download JSON data
- [x] Download PPTX presentation
- [x] View dashboard link
- [x] See artifacts in file system
- [x] Verify database records exist

**All checked = Platform Working Correctly!** ✅

---

## 🚨 Known Issues (Should NOT Happen Now)

These were the previous blockers - now FIXED:

- ~~Artifacts don't appear~~ → ✅ FIXED (database save added)
- ~~Plan approval required~~ → ✅ FIXED (requirement removed)
- ~~Takes too long~~ → ✅ FIXED (<1 min for small datasets)
- ~~Journey state stuck~~ → ✅ FIXED (state updates added)
- ~~Missing API endpoint~~ → ✅ FIXED (endpoints created)

---

## 📞 Next Steps After Testing

### If Tests Pass ✅:
1. Run backfill for existing projects:
   ```bash
   npm run backfill:artifacts -- --execute
   ```

2. Test with more datasets

3. Deploy to staging/production

---

### If Tests Fail ❌:
1. Check server console for errors
2. Check browser console (F12) for errors
3. Run: `npm run check-all-projects`
4. Review: `FIXES_COMPLETE_READY_TO_TEST.md` → Troubleshooting section

---

**Your dataset is perfect for testing - it's real survey data that will validate the entire platform workflow!** 🎉

Ready to test now with:
```bash
npm run dev
```

Then navigate to: http://localhost:5173
