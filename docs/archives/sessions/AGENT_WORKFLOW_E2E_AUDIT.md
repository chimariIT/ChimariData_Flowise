# Agent Recommendation Workflow - End-to-End Audit

**Date**: October 27, 2025
**Test Scenario**: SPTO Survey Analysis
**Goal**: Understand how survey participants feel about different programs offered
**Audience**: Mixed (non-technical + business users)
**Data Source**: `C:\Users\scmak\Documents\Work\Projects\Chimari\Consulting_BYOD\sampledata\SPTO\English Survey for Teacher Conferences Week Online (Responses).xlsx`

---

## 🎯 Test Objectives

Validate that the agent recommendation workflow meets all requirements from `AGENT_RECOMMENDATION_WORKFLOW_IMPLEMENTATION_COMPLETE.md`:

1. ✅ **Data Engineer Agent** analyzes uploaded files
2. ✅ **Data Scientist Agent** recommends analysis configuration
3. ✅ **PM Agent** synthesizes recommendations
4. ✅ **System** auto-configures Execute step
5. ✅ **Multi-sheet** handling for Excel files
6. ✅ **Data transformation** suggestions
7. ✅ **Audience-appropriate** recommendations (mixed audience = business journey)

---

## 📋 Manual Test Plan

### Prerequisites

- [ ] Server running: `npm run dev`
- [ ] User authenticated in browser
- [ ] SPTO survey file accessible at specified path

### Test Execution Steps

#### **STEP 1: Create New Project** ⏱️ 2 minutes

1. Navigate to `http://localhost:5000/dashboard`
2. Click **"New Project"** button
3. Fill in project details:
   - **Name**: "SPTO Survey Analysis E2E Test"
   - **Description**: "Understanding participant feelings about programs"
   - **Analysis Goal**: "Analyze survey responses to understand how participants feel about different programs offered"
4. Add business questions:
   - "Which programs are most positively received?"
   - "What are the main concerns or negative feedback?"
   - "How do different participant groups compare in their feedback?"
5. Select **Journey Type**: "Business" (appropriate for mixed audience)
6. Click **"Create Project"**

**Expected Result**:
- ✅ Project created successfully
- ✅ Redirected to Data Step (`/journeys/business/data`)

**Validation Checklist**:
- [ ] Project ID in URL
- [ ] Journey type = business
- [ ] Upload interface visible

---

#### **STEP 2: Upload SPTO Survey File** ⏱️ 1-2 minutes

1. Click **"Upload File"** or drag-and-drop
2. Select: `English Survey for Teacher Conferences Week Online (Responses).xlsx`
3. Wait for upload progress bar
4. Observe upload completion

**Expected Result**:
- ✅ File uploaded successfully
- ✅ File appears in uploaded files list
- ✅ File size and name displayed correctly

**Validation Checklist**:
- [ ] Upload success message shown
- [ ] File name visible: "English Survey for Teacher Conferences..."
- [ ] File size: ~36 KB
- [ ] No upload errors

---

#### **STEP 3: Trigger Agent Recommendation Workflow** ⏱️ 30-60 seconds

1. Click **"Get Agent Recommendations"** button
2. Observe loading indicator
3. Wait for agent analysis to complete

**Expected Result**:
- ✅ Loading indicator appears
- ✅ Agent Recommendation Dialog opens
- ✅ Recommendations displayed within 60 seconds

**Validation Checklist**:
- [ ] Button triggers workflow
- [ ] Loading state visible
- [ ] Dialog opens after analysis

---

#### **STEP 4: Validate Data Engineer Analysis** ⏱️ 2 minutes

Review the **Data Analysis Summary** section in the dialog:

**Check for**:
1. **Row Count**: Number > 0 (expected: ~100-200 rows for survey data)
2. **Column Count**: Number > 0 (expected: ~20-50 columns for survey questions)
3. **Data Quality Score**: Percentage 0-100% (expected: >80%)
4. **Files Analyzed**: Should show "1" (one Excel file)

**Expected Data Characteristics**:
- [ ] Has Categories: YES (survey responses have categorical data)
- [ ] Has Text: YES (open-ended survey responses)
- [ ] Has Numeric: YES (rating scores)
- [ ] Has Time Series: MAYBE (depends on timestamp column)

**Validation Checklist**:
- [ ] Row count displayed and reasonable
- [ ] Column count displayed and reasonable
- [ ] Data quality >80%
- [ ] Data characteristics match survey data type

**Capture**:
```
Row Count: _______
Column Count: _______
Data Quality: _______%
Has Categories: ___
Has Text: ___
Has Numeric: ___
Has Time Series: ___
```

---

#### **STEP 5: Validate Data Scientist Recommendations** ⏱️ 3 minutes

Review the **Recommended Configuration** section:

**Check for**:
1. **Analysis Complexity**: Should be "medium" or "high"
   - Rationale: Multiple business questions + survey text analysis
2. **Recommended Analyses**: Should include 3-5 analysis types
   - Expected: Descriptive statistics, Text analysis, Comparative analysis
3. **Cost Estimate**: Dollar amount (e.g., "$12-18")
4. **Time Estimate**: Time range (e.g., "3-5 minutes")
5. **Rationale**: Text explanation of recommendations

**Expected Analyses for Survey Data**:
- [ ] Descriptive Statistics (summary of responses)
- [ ] Text Analysis OR Sentiment Analysis (for open-ended questions)
- [ ] Comparative Analysis (comparing groups/programs)
- [ ] Trend Analysis (if time series data exists)

**Validation Checklist**:
- [ ] Complexity is medium or high (not "low")
- [ ] At least 3 recommended analyses
- [ ] Includes text/sentiment analysis for survey
- [ ] Includes comparative analysis for groups
- [ ] Cost estimate present
- [ ] Time estimate present
- [ ] Rationale is clear and specific

**Capture**:
```
Analysis Complexity: _______
Recommended Analyses: _______________________
Cost Estimate: _______
Time Estimate: _______
Rationale (first 100 chars): _______________________
```

---

#### **STEP 6: Check Multi-Sheet Handling** ⏱️ 1 minute

**If Excel file has multiple sheets**:

Check if the dialog shows:
- [ ] Number of sheets detected
- [ ] Guidance on which sheet to use
- [ ] Option to select specific sheet

**Expected for SPTO File**:
- May have multiple sheets (form responses + metadata)
- Should provide clear guidance on main data sheet

**Validation Checklist**:
- [ ] Multi-sheet detection working (if applicable)
- [ ] Clear instructions provided
- [ ] Sheet selection available

**Capture**:
```
Sheets Detected: _______
Multi-Sheet Guidance: _______________________
```

---

#### **STEP 7: Check Data Transformation Suggestions** ⏱️ 1 minute

Look for transformation recommendations:

**Expected for Survey Data**:
- [ ] Text normalization for open-ended responses
- [ ] Category encoding for multiple choice questions
- [ ] Handling missing values
- [ ] Date parsing (if timestamp exists)

**Validation Checklist**:
- [ ] Transformation suggestions present
- [ ] Suggestions are relevant to survey data
- [ ] Each suggestion has clear explanation

**Capture**:
```
Transformation Suggestions:
1. _______________________
2. _______________________
3. _______________________
```

---

#### **STEP 8: Review and Accept Recommendations** ⏱️ 1 minute

1. Review all recommendations in dialog
2. Click **"Accept & Proceed"** button
3. Observe navigation to Execute Step

**Expected Result**:
- ✅ Dialog closes
- ✅ Navigate to Execute Step (`/journeys/business/execute`)
- ✅ Configuration automatically applied

**Validation Checklist**:
- [ ] Accept button clickable
- [ ] Navigation successful
- [ ] No errors on navigation

---

#### **STEP 9: Validate Auto-Configuration in Execute Step** ⏱️ 2 minutes

On the Execute Step page, verify:

1. **Data Source**: Pre-selected to "uploaded_files"
2. **Expected Data Size**: Pre-filled with row count from analysis
3. **Analysis Complexity**: Pre-selected to recommended level
4. **Selected Analyses**: Pre-checked boxes for recommended analyses

**Validation Checklist**:
- [ ] Data source = "uploaded_files"
- [ ] Data size matches row count (Step 4)
- [ ] Complexity matches recommendation (Step 5)
- [ ] Analyses checkboxes pre-selected
- [ ] All fields are editable (not locked)

**Capture**:
```
Data Source: _______
Data Size: _______
Complexity: _______
Pre-selected Analyses: _______________________
```

---

#### **STEP 10: Verify User Can Execute Analysis** ⏱️ 30 seconds

1. Confirm **"Run Analysis"** button is enabled
2. **Optional**: Click button to start analysis
3. Observe analysis progress (if clicked)

**Expected Result**:
- ✅ Button is enabled (not grayed out)
- ✅ Clicking starts analysis
- ✅ Progress indicator shown

**Validation Checklist**:
- [ ] Run Analysis button enabled
- [ ] Button text clear
- [ ] No validation errors

---

## 📊 Test Results Summary

### Overall Status

| Category | Status | Notes |
|----------|--------|-------|
| **File Upload** | ⬜ Pass / ⬜ Fail | _________________ |
| **Data Engineer Analysis** | ⬜ Pass / ⬜ Fail | _________________ |
| **Data Scientist Recommendations** | ⬜ Pass / ⬜ Fail | _________________ |
| **Multi-Sheet Handling** | ⬜ Pass / ⬜ Fail / ⬜ N/A | _________________ |
| **Data Transformations** | ⬜ Pass / ⬜ Fail | _________________ |
| **Auto-Configuration** | ⬜ Pass / ⬜ Fail | _________________ |
| **User Experience** | ⬜ Pass / ⬜ Fail | _________________ |

### Requirements Coverage

Based on `AGENT_RECOMMENDATION_WORKFLOW_IMPLEMENTATION_COMPLETE.md`:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| ✅ Data Engineer analyzes files | ⬜ Pass / ⬜ Fail | Row/column count, quality score |
| ✅ Data Scientist recommends config | ⬜ Pass / ⬜ Fail | Complexity, analyses, cost/time |
| ✅ PM Agent synthesizes | ⬜ Pass / ⬜ Fail | Unified rationale in dialog |
| ✅ Auto-configure Execute step | ⬜ Pass / ⬜ Fail | Pre-filled fields |
| ✅ Multi-sheet handling | ⬜ Pass / ⬜ Fail / ⬜ N/A | Sheet detection & guidance |
| ✅ Transformation suggestions | ⬜ Pass / ⬜ Fail | Relevant suggestions shown |
| ✅ Audience-appropriate | ⬜ Pass / ⬜ Fail | Business journey for mixed |

---

## 🐛 Issues Found

### Critical Issues (Blocking)
_(Issues that prevent workflow completion)_

| # | Issue | Impact | Steps to Reproduce |
|---|-------|--------|-------------------|
| | | | |

### Major Issues (Workarounds Exist)
_(Issues affecting UX but not blocking)_

| # | Issue | Impact | Workaround |
|---|-------|--------|-----------|
| | | | |

### Minor Issues (Polish)
_(Cosmetic or minor UX improvements)_

| # | Issue | Impact | Priority |
|---|-------|--------|----------|
| | | | |

---

## ✅ Success Criteria

The agent recommendation workflow is considered **COMPLETE** if:

1. [ ] **All 10 test steps pass** without critical errors
2. [ ] **Data Engineer analysis** provides accurate file metrics
3. [ ] **Data Scientist recommendations** are appropriate for survey data
4. [ ] **Complexity calculation** matches data characteristics (medium/high for survey)
5. [ ] **Recommended analyses** include text/comparative for survey use case
6. [ ] **Auto-configuration** correctly pre-fills Execute step
7. [ ] **User can proceed** to run analysis without manual re-entry
8. [ ] **No authentication errors** during workflow
9. [ ] **Performance**: Analysis completes within 60 seconds
10. [ ] **Error handling**: Clear messages if analysis fails

---

## 📝 Recommendations

### For Survey Data Specifically:

The agent system should:
- ✅ Detect survey structure (questions as columns)
- ✅ Recommend text analysis for open-ended responses
- ✅ Suggest sentiment analysis for feedback questions
- ✅ Recommend comparative analysis for demographics
- ✅ Identify rating scale patterns (Likert scales)
- ✅ Suggest filtering/grouping by participant attributes

### For Mixed Audience:

The agent system should:
- ✅ Use plain language (no technical jargon)
- ✅ Provide visual previews where possible
- ✅ Explain "why" for each recommendation
- ✅ Allow modification without breaking configuration
- ✅ Provide business-focused insights (not code)

---

## 🔄 Next Steps After Testing

### If Tests Pass:
1. Document successful test run
2. Add test to CI/CD pipeline
3. Consider additional edge cases
4. Validate with different survey data

### If Tests Fail:
1. Document specific failure points
2. Create bug tickets with reproduction steps
3. Fix critical blockers first
4. Re-run audit after fixes

---

## 📎 Appendix: Quick Reference

### File Location
```
C:\Users\scmak\Documents\Work\Projects\Chimari\Consulting_BYOD\sampledata\SPTO\
  English Survey for Teacher Conferences Week Online (Responses).xlsx
```

### Expected Data Profile
- **Type**: Survey responses (Google Forms or similar)
- **Structure**: One row per respondent, columns for each question
- **Size**: ~100-200 responses, ~20-50 questions
- **Content**: Mix of multiple choice, ratings, and open-ended text
- **Use Case**: Program sentiment analysis

### Key Files to Review
- `AGENT_RECOMMENDATION_WORKFLOW_IMPLEMENTATION_COMPLETE.md` - Full requirements
- `server/services/data-engineer-agent.ts:1026-1142` - File analysis logic
- `server/services/data-scientist-agent.ts:1198-1256` - Recommendation logic
- `server/routes/project.ts:111-200` - API endpoint
- `client/src/components/AgentRecommendationDialog.tsx` - UI component

### API Endpoints
- `POST /api/projects` - Create project
- `POST /api/projects/upload` - Upload file
- `POST /api/projects/:id/agent-recommendations` - Get recommendations

---

**Test Conducted By**: _________________
**Date**: _________________
**Overall Result**: ⬜ PASS / ⬜ FAIL
**Notes**: _________________________________________________
