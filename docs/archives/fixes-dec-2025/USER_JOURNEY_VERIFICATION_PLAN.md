# User Journey Verification Plan

**Date**: December 7, 2025 (Updated: December 12, 2025)
**Purpose**: Manual testing checklist to verify complete user journey from data upload to viewing results
**Status**: Ready for Testing


---

## 🔧 **Dec 13, 2025 Fixes Applied (Part 3)**

Compilation & Logic Repairs:
- ✅ **Analysis Execution Service** - Restored valid syntax and "Auto-Translation Integration" block in `analysis-execution.ts`
- ✅ **Project Route Safety** - Fixed potential undefined project crash in `project.ts`
- ✅ **Stripe API Version** - Aligned backend (`2025-08-27.basil`) with installed library
- ✅ **Researcher Context Types** - Fixed type casting in `required-data-elements-routes.ts`
- ✅ **Frontend Type Safety** - Fixed `AudienceTranslatedResults.tsx` to safely handle `questionAnswers` array/object

---

## 🔧 **Dec 12, 2025 Fixes Applied (Part 2)**

User-reported issues resolved:
- ✅ **View Projects Button** - Now navigates to `/dashboard` instead of showing alert
- ✅ **PII Metadata Saving** - Enhanced logging + fixed PUT endpoint metadata merge
- ✅ **Dataset Auto-Join Detection** - Enhanced with regex patterns for `employee_id`, `user_id`, `_id` suffix, etc.
- ✅ **Transformation Mappings** - `questionAnswerMapping` now included in required-data-elements endpoint
- ✅ **Data Quality Score** - Fixed 0-1 vs 0-100 range handling; scores now display correctly
- ✅ **Analysis Plan Generation** - Frontend recognizes `rejected`/`cancelled` as failure states

**Console Debugging**: Check browser console for `🔒 [PII]`, `🔗 [Auto-Join]`, `📊 [Data Quality]`, `📋 [Plan Progress]` indicators

---

## 🔧 **Dec 12, 2025 Fixes Applied (Part 1)**

Gap analysis implementation:
- ✅ **Gap A-E** - Data flow connection from questions → requirements → transformation → analysis → answers
- ✅ **Gap F** - Researcher Agent integrated into journey workflow
- ✅ **Gap G** - Data Scientist Agent coordination via PM
- ✅ **Evidence Chain** - "How We Answered This" section in results

---

## 🔧 **Dec 8, 2025 Fixes Applied**

The following issues have been addressed:
- ✅ **Data Verification Continue Button** - `PUT /api/projects/:id/verify` endpoint created
- ✅ **Export Report** - `GET /api/projects/:id/export/report` endpoint created
- ✅ **Step-by-Step Analysis** - Fixed URL from `/api/step-by-step-analysis` to `/api/ai/step-by-step-analysis`
- ✅ **Checkpoint Feedback** - Better error handling (404 vs 500 for missing checkpoints)
- ✅ **Multi-Dataset Joining** - Auto-detection of join keys between datasets
- ✅ **Transformed Data in Analysis** - Analysis now uses transformed data, not raw uploads
- ✅ **TypeScript Errors** - All resolved (`npm run check` passes)

---

## 🎯 **Testing Objective**

Verify that users can complete the full journey: **Data Upload → Prepare → Data Validation → Data Transformation → Analysis → Results & Artifacts → Billing → Project Dashboard** and see answers to their questions.

---

## 🔄 **Dec 14, 2025 Verification Status**

| Step | Status | Notes |
|------|--------|-------|
| 1. Data Upload | ⚠️ Partial | Multiple files upload, but `client/src/pages/data-step.tsx` + `refreshProjectPreview` keep previews per file and never emit a joined dataset, so the user cannot confirm combined rows. |
| 2. Analysis Preparation | ⚠️ Partial | Goals/questions persist, yet downstream steps still re-fetch only the first dataset, so generated requirements cannot be validated across joined tables. |
| 3. Data Verification | ❌ Blocked | `data-verification-step.tsx` explicitly selects `datasets[0]`, meaning additional uploads are ignored and PII exclusions made earlier immediately resurface. |
| 4. Data Transformation | ❌ Blocked | The UI posts to `/api/projects/{id}/execute-transformations`, but no such server route exists; joins/transforms never run. |
| 5-9. Execute → Dashboard | ⏸️ Not Re-tested | Execution/billing/dashboard rely on transformed data, so verification paused until the upstream blockers above are resolved. |

These findings align with issues #18-#20 in `PROJECT_DASHBOARD_ISSUES_AND_FIXES.md`.

---

## ✅ **Manual Testing Checklist**

### **Step 1: Data Upload**
- [ ] Navigate to journey start (e.g., `/journeys/business/data-upload`)
- [ ] Upload CSV file
- [ ] **Verify**: Project auto-created (check URL for `projectId`)
- [ ] **Verify**: Descriptive statistics displayed
- [ ] **Verify**: "Continue to Analysis Preparation" button appears
- [ ] Click "Continue to Analysis Preparation"

**Expected Result**: Navigate to `/journeys/business/prepare?projectId={id}`

---

### **Step 2: Analysis Preparation**
- [ ] **Verify**: Project ID visible in URL
- [ ] Enter analysis goal (e.g., "Understand teacher conference preferences")
- [ ] Enter business questions (e.g., "What time slots are most popular?")
- [ ] Click "Generate Data Requirements"
- [ ] **Verify**: Requirements generated (not generic recommendations)
- [ ] **Verify**: Transformation plan appears (not empty)
- [ ] **Verify**: Data mappings shown with confidence scores

**Expected Result**: Navigate to data verification step

---

### **Step 3: Data Verification**
- [ ] **Verify**: Data Mapping tab shows source-to-target mappings
- [ ] **Verify**: Transformation tab shows transformation plan
- [ ] **Verify**: Quality score calculated (not hardcoded 62%)
- [ ] **Verify**: Data preview is scrollable (horizontal + vertical)
- [ ] Click "Continue to Transformation"

**Expected Result**: Navigate to transformation step

---

### **Step 4: Data Transformation**
- [ ] **Verify**: Source-to-target mappings displayed
- [ ] **Verify**: Can edit transformation logic
- [ ] Execute transformations
- [ ] **Verify**: Preview shows transformed data
- [ ] Click "Continue to Project Setup"

**Expected Result**: Navigate to project setup step

---

### **Step 5: Project Setup**
- [ ] **Verify**: Analysis approach summary displayed
- [ ] **Verify**: Cost estimate shown (not $0)
- [ ] **Verify**: Complexity estimate shown
- [ ] Click "Continue to Analysis"

**Expected Result**: Navigate to analysis execution step

---

### **Step 6: Analysis Execution**
- [ ] Click "Execute Analysis"
- [ ] **Verify**: Analysis executes WITHOUT requiring plan approval
- [ ] **Verify**: Progress updates visible
- [ ] **Verify**: Completes within SLA (<1 min for small dataset)
- [ ] **Verify**: Navigation to results

**Expected Result**: Navigate to results step

---

### **Step 7: Results & Artifacts**
- [ ] **Verify**: Analysis insights displayed
- [ ] **Verify**: Answers to user questions visible (CRITICAL)
- [ ] **Verify**: Artifacts tab shows generated files
- [ ] **Verify**: Download links work
- [ ] **Verify**: Charts/visualizations displayed
- [ ] Click "Continue to Billing"

**Expected Result**: Navigate to billing step

---

### **Step 8: Billing & Payment**
- [ ] **Verify**: Cost breakdown displayed
- [ ] **Verify**: Estimated vs. actual costs shown
- [ ] **Verify**: Payment options available (if applicable)
- [ ] Complete billing (or skip if in test mode)

**Expected Result**: Navigate to project dashboard

---

### **Step 9: Project Dashboard** (CRITICAL VERIFICATION)
- [ ] Navigate to `/project/{projectId}`
- [ ] **Verify**: Overview tab shows journey progress
- [ ] **Verify**: "Resume Journey" button works (if incomplete)
- [ ] Click "Insights" tab
  - [ ] **Verify**: Analysis results visible
  - [ ] **Verify**: Answers to user questions displayed
  - [ ] **Verify**: Recommendations shown
- [ ] Click "Timeline" tab
  - [ ] **Verify**: Artifacts listed
  - [ ] **Verify**: Decision trail visible (or empty if not implemented)
  - [ ] **Verify**: Download links work
- [ ] Click "Agents" tab
  - [ ] **Verify**: Agent activity shown
  - [ ] **Verify**: Checkpoints visible
- [ ] Click "Data" tab
  - [ ] **Verify**: Dataset recognized and displayed
  - [ ] **Verify**: Schema information shown
- [ ] Click "Visualizations" tab
  - [ ] **Verify**: Dashboard builder loads
  - [ ] **Verify**: Can create charts (or shows error if endpoint missing)

---

## 🔴 **Critical Success Criteria**

The user journey is considered **COMPLETE** if:

1. ✅ User can upload data and create project
2. ✅ User can enter goals and generate requirements
3. ✅ User can execute analysis without blockers
4. ✅ **User can see answers to their questions in the dashboard** (MOST IMPORTANT)
5. ✅ User can download artifacts
6. ✅ User can resume journey from dashboard

---

## 📝 **Testing Notes Template**

Use this template to record your testing results:

```
### Test Run: [Date/Time]
**Dataset**: [File name]
**Journey Type**: [business/technical/etc.]

#### Step 1: Data Upload
- Status: [✅ Pass / ❌ Fail]
- Notes: [Any issues or observations]

#### Step 2: Analysis Preparation
- Status: [✅ Pass / ❌ Fail]
- Notes: [Any issues or observations]

[Continue for all steps...]

#### Critical Issues Found:
1. [Issue description]
2. [Issue description]

#### Questions/Answers Visibility:
- User Question: "[Example question]"
- Answer Displayed: [Yes/No]
- Location: [Insights tab / Results page / etc.]
```

---

## 🚨 **Known Gaps to Watch For**

Based on code review, these are likely failure points:

1. **Data Requirements Generation**: May fail if project ID not available
2. **Results Display**: Insights tab may not show answers to user questions
3. **Decision Trail**: Timeline tab may show empty or hardcoded data
4. **Charts**: Visualization tab may fail (endpoint missing)
5. **Upload Metrics**: Overview tab may show "No recent records"

### ✅ **Dec 8, 2025 - Gaps Addressed**
- ~~Data Validation → Transformation flow blocked~~ ✅ FIXED (verify endpoint created)
- ~~Checkpoint feedback returning 500 errors~~ ✅ FIXED (proper 404 handling)
- ~~Multi-dataset joining not working~~ ✅ FIXED (auto-detect + join config)
- ~~Analysis using raw data instead of transformed~~ ✅ FIXED (transformed data priority)
- ~~Export report endpoint missing (404)~~ ✅ FIXED (endpoint created)
- ~~Step-by-step analysis wrong URL~~ ✅ FIXED (corrected to /api/ai/)

---

## 📞 **Reporting Results**

After testing, update this document with:
- [ ] Which steps passed
- [ ] Which steps failed
- [ ] Screenshots of critical failures
- [ ] Specific error messages from console

This will help prioritize fixes for the remaining gaps.

---

## 🔗 **Question-to-Answer Pipeline Implementation Plan**

**Date**: December 8, 2025  
**Status**: Implementation In Progress  
**Priority**: HIGH - Critical for user value realization

### Problem Summary

The current pipeline has broken traceability between user questions and analysis results:

1. **Data requirements not pulling through to transformation** - Requirements generated but not linked to questions
2. **No clear mappings** - Transformations not tied to specific questions  
3. **Analysis not answering specific questions** - Generic insights instead of question-specific answers

### Root Cause Analysis

**Current Flow (Broken)**:
```
Questions → Generic Requirements → Generic Transformations → Generic Analysis → Generic Answers
```

**Desired Flow**:
```
Questions → Question-Mapped Requirements → Question-Aware Transformations → 
Question-Specific Analyses → Direct Answers with Evidence
```

### Implementation Phases

#### Phase 1: Enhance Question-to-Data-Element Mapping

**Files**: `server/services/tools/required-data-elements-tool.ts`, `client/src/pages/prepare-step.tsx`

**Changes**:
- ✅ Update `inferRequiredDataElementsFromAnalyses()` to explicitly map each element to specific questions
- ✅ Add `questionAnswerMapping` array to requirements document
- ✅ Persist `businessQuestions` to project before calling generate-data-requirements endpoint

**Status**: ✅ COMPLETE

---

#### Phase 2: Flow Requirements Through to Transformation

**Files**: `client/src/pages/data-transformation-step.tsx`, `server/routes/required-data-elements-routes.ts`

**Changes**:
- ✅ Add UI showing "Questions this transformation helps answer" for each mapping
- ✅ Group transformations by the questions they support
- ✅ Store transformation mappings with question linkage in `datasets.ingestionMetadata`

**Status**: ✅ COMPLETE

---

#### Phase 3: Question-Specific Analysis Execution

**Files**: `server/services/analysis-execution.ts`, `server/services/data-scientist-agent.ts`

**Changes**:
- ✅ Create `QuestionAnalysisMap` tracking: `{ questionId, questionText, analyses[], dataElements[] }`
- ✅ Execute analyses in context of questions they answer
- ✅ Tag each insight/recommendation with `answersQuestions: string[]`

**Status**: ✅ COMPLETE

---

#### Phase 4: Enhanced Answer Generation with Evidence

**Files**: `server/services/question-answer-service.ts`, `client/src/components/UserQuestionAnswers.tsx`

**Changes**:
- ✅ Enhance `QuestionAnswer` to include `evidenceInsights[]`, `dataElementsUsed[]`, `analysisTypes[]`
- ✅ Update answer generation to cite supporting evidence
- ✅ Add expandable "View Evidence" section in UI

**Status**: ✅ COMPLETE

---

#### Phase 5: Results Display with Question-Answer Mapping

**Files**: `client/src/pages/results-step.tsx`, `client/src/pages/project-page.tsx`

**Changes**:
- ✅ Restructure results: Questions → Answers → Supporting Analysis → Visualizations
- ✅ Add "Analysis Trail" showing question-to-answer chain
- ✅ Link visualizations to questions they answer

**Status**: ✅ COMPLETE

---

### Key Data Structure

```typescript
interface QuestionAnalysisMapping {
  questionId: string;
  questionText: string;
  requiredDataElements: string[];
  recommendedAnalyses: string[];
  transformationsNeeded: string[];
  answerGenerated?: {
    text: string;
    confidence: number;
    supportingInsightIds: string[];
  };
}
```

### Testing Checklist (Updated Dec 9, 2025)

When testing the question-to-answer pipeline, verify:

#### Data Pipeline Traceability
- [ ] **Prepare Step**: Questions are saved to project before requirements generation
- [ ] **Requirements**: Each data element shows which questions it helps answer
- [ ] **Transformation**: Transformation mappings display question linkage
- [ ] **Analysis**: Insights are tagged with `answersQuestions` array
- [ ] **Results**: Answers display with evidence trail (insights, data elements, analyses)
- [ ] **Dashboard**: Insights tab shows question-first view with supporting evidence

#### Question IDs Consistency (NEW)
- [ ] **Session**: Question IDs assigned in format `q_${projectId}_${index}`
- [ ] **Requirements**: `relatedQuestions` array contains valid question IDs
- [ ] **Transformations**: `questionAnswerMapping` saved to dataset metadata
- [ ] **Analysis**: `insightToQuestionMap` populated correctly
- [ ] **Answers**: `evidenceInsights` array matches actual insight IDs

#### Agent Activity Visibility (NEW)
- [ ] **Upload**: Agent checkpoints created and visible in Agents tab
- [ ] **Server Restart**: Checkpoints persist (DB not just in-memory)
- [ ] **Approvals**: Pending checkpoints block workflow for business/consultation
- [ ] **Approve All**: Triggers auto-advance to next journey step

#### AI Answer Generation (NEW)
- [ ] **After Analysis**: `analysisResults.questionAnswers` is populated (not undefined)
- [ ] **Fallback Check**: Console should NOT show "No AI-generated answers found"
- [ ] **Evidence**: Each answer has `evidenceInsights`, `dataElementsUsed`, `analysisTypes`
- [ ] **Confidence**: Confidence scores reflect actual evidence strength

### Critical Issues to Fix First

1. **Issue #14**: AI answers not generated - `questionAnswers` often undefined
2. **Issue #12**: Checkpoints lost on restart - stored in-memory only
3. **Issue #13**: Evidence chain breaks - inconsistent question IDs
4. **Issue #17**: Approvals don't gate workflow - no blocking behavior

### Estimated Effort: 11-16 hours for original plan, +6 hours for new issues

---

## 🔧 **Dec 10, 2025 Session Fixes**

The following data flow issues have been addressed:

### ✅ **Transformed Schema Exposure - FIXED**
- **Issue**: Visualizations couldn't see transformed columns after data transformation
- **Fix**: `GET /api/projects/:projectId/datasets` now returns:
  - `transformedSchema` - schema after transformations
  - `originalSchema` - original uploaded schema
  - `transformedPreview` - preview of transformed data rows
  - `hasTransformations` - boolean flag indicating transformations applied
- **Location**: `server/routes/project.ts:3627-3654`

### ✅ **Checkpoint Feedback Error Handling - FIXED**
- **Issue**: Duplicate checkpoint endpoints with inconsistent error handling
- **Fix**: Both endpoints now use proper access control and return 404 for missing checkpoints
- **Location**: `server/routes/project.ts:5162-5201`

### ✅ **Visualization Schema Access - FIXED**
- **Issue**: Dashboard builder only accessed original schema, not transformed
- **Fix**: Component now checks multiple schema sources in priority order:
  1. `project.transformedSchema`
  2. `datasets[0].transformedSchema`
  3. `project.schema` (original)
- **Location**: `client/src/components/visualization-workshop.tsx:75-133`

### Verification After Fixes

To verify these fixes work:
1. Upload data → Transform columns → Go to visualizations → Should see transformed column names
2. Submit checkpoint feedback → Should get proper success/404 response
3. Server restart → Try to resume journey → Checkpoints should load from database

---

## 🔗 **Dec 12, 2025 - Connection Fixes Applied**

The following connection gaps have been fixed to enable full traceability from questions → requirements → transformation → analysis → answers:

### ✅ **Gap A: Analysis Path Visibility - FIXED**
- **Issue**: DS agent generated `analysisPath[]` but frontend never displayed it
- **Fix**: Transformation step shows "Analysis Plan Overview" section (was already in UI, verified complete)
- **Location**: `client/src/pages/data-transformation-step.tsx:573-613`

### ✅ **Gap B: Completeness Validation - FIXED**
- **Issue**: `readyForExecution` flag existed but was never checked before execution
- **Fix**: Added `canExecuteTransformations()` validation function with:
  - Progress bar showing elements mapped vs total
  - Gaps list with severity indicators
  - Execute button disabled with tooltip when not ready
- **Location**: `client/src/pages/data-transformation-step.tsx`

### ✅ **Gap C: Transformation-Analysis Linkage - FIXED**
- **Issue**: Each transformation had `affectedElements[]` but didn't show which analyses it enabled
- **Fix**: Added "Enables Analyses" column to transformation table showing badges for related analyses
- **Location**: `client/src/pages/data-transformation-step.tsx`

### ✅ **Gap D: Pass analysisPath to Execution - FIXED**
- **Issue**: Analysis execution endpoint didn't receive DS-recommended analyses
- **Fix**:
  - Frontend loads requirements document before execution
  - Passes `analysisPath[]` and `questionAnswerMapping[]` to backend
  - Backend prioritizes DS-recommended analyses
  - Backend stores `questionAnswerMapping` on project for traceability
- **Locations**:
  - `client/src/pages/execute-step.tsx`
  - `server/routes/analysis-execution.ts`
  - `server/services/analysis-execution.ts`

### ✅ **Gap E: Evidence Chain for Results - FIXED**
- **Issue**: Results didn't trace answers back to questions with evidence
- **Fix**:
  - `QuestionAnswerService` uses `questionAnswerMapping` to link answers to data elements, analyses, and transformations
  - `UserQuestionAnswers.tsx` shows "How We Answered This" expandable section with evidence
- **Locations**:
  - `server/services/question-answer-service.ts`
  - `client/src/components/UserQuestionAnswers.tsx`

---

## 📋 **Connection Testing Checklist**

### Gap A: Planned Analyses Display
- [ ] Generate requirements on Prepare step
- [ ] Navigate to Transformation step
- [ ] **VERIFY: "Analysis Plan Overview" section shows identified analyses**
- [ ] **VERIFY: Each analysis shows name, type, techniques, required data elements**

### Gap B: Completeness Validation
- [ ] On Transformation step, check completeness status
- [ ] **VERIFY: "Data Readiness Status" card shows progress bar**
- [ ] **VERIFY: Progress bar shows "{mapped}/{total} elements mapped"**
- [ ] **VERIFY: If gaps exist, they are listed with severity indicators**
- [ ] **VERIFY: Execute button disabled with tooltip when not ready**

### Gap C: Transformation-Analysis Linkage
- [ ] View transformation mappings table
- [ ] **VERIFY: "Enables Analyses" column shows badges for each row**
- [ ] **VERIFY: Hovering badge shows analysis description**
- [ ] **VERIFY: "Related Questions" column shows linked questions**

### Gap D: Recommended Analyses Prioritization
- [ ] Execute analysis
- [ ] **VERIFY: Console shows "[GAP D] Received X DS-recommended analyses"**
- [ ] **VERIFY: Console shows "[GAP D] Prioritized analysis order"**
- [ ] **VERIFY: DS-recommended analyses run first (check network/console)**

### Gap E: Evidence Chain Display
- [ ] View results/answers on Results step or Project Dashboard
- [ ] **VERIFY: Each answer has "How We Answered This" expandable section**
- [ ] **VERIFY: Evidence shows: Data Used, Transformations Applied, Analyses Run, Supporting Insights**
- [ ] **VERIFY: If AI answers fail, clear message appears (not silent console.log)**

### Gap F: Researcher Agent Integration (Dec 12, 2025)
- [ ] Navigate to Prepare step and enter analysis goals and questions
- [ ] Click "Generate Data Requirements"
- [ ] **VERIFY: Console shows "[GAP F] Calling Researcher Agent to find relevant templates..."**
- [ ] **VERIFY: Console shows "[GAP F] Researcher found recommendations with X% confidence"**
- [ ] **VERIFY: Template recommendations include: template, confidence, marketDemand, implementationComplexity**
- [ ] **VERIFY: If researcher unavailable, requirements generation continues gracefully**

### Gap G: Data Scientist Agent Integration (Dec 12, 2025)
- [ ] After requirements generated, view the transformation step
- [ ] Execute transformations
- [ ] **VERIFY: Agents tab shows data_scientist agent activity**
- [ ] **VERIFY: DS recommends analysis types based on questions and data characteristics**
- [ ] **VERIFY: DS recommendations flow through to analysis execution**

### PM Agent Coordination Workflow (Dec 12, 2025)
The PM Agent now coordinates the following agents in sequence:
1. **Researcher Agent** → Finds relevant templates/patterns based on user questions
2. **Data Scientist Agent** → Identifies analysis types and requirements based on researcher patterns
3. **Data Engineer Agent** → Prepares data based on DS requirements
4. **Technical AI Agent** → Executes analysis on DE-prepared data

Test the full workflow:
- [ ] Enter questions → Researcher finds templates
- [ ] Requirements generated → DS identifies analyses
- [ ] Transformation step → DE prepares data
- [ ] Execute step → DS runs analysis on transformed data
- [ ] Results step → Answers link back to original questions