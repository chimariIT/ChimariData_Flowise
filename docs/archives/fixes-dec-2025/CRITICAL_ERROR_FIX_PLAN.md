# 🚨 CRITICAL ERROR FIX PLAN - Production Blocker Resolution

**Date**: January 17, 2025
**Status**: 🔴 **9 CRITICAL ISSUES IDENTIFIED**
**Impact**: Platform currently unable to complete user journeys
**SLA Target**: <1 minute from goals to artifacts

---

## 📊 Executive Summary

After analyzing error logs, screenshots, and terminal output, I've identified **9 critical architectural issues** preventing successful user journey completion:

| Priority | Issue | Impact | Fix Time |
|----------|-------|--------|----------|
| **P0** | Database schema missing `can_use_ai` column | Blocks ALL features | 5 min |
| **P0** | Null safety - `estimatedCost` crash | Analysis execution fails | 10 min |
| **P0** | Infinite loading on plan-step | Users stuck, can't proceed | 15 min |
| **P0** | Mock data (85% quality score) | Production violation | 5 min |
| **P1** | Session expiry (HTTP 410) | Users logged out mid-workflow | 20 min |
| **P1** | AI Insights 403 Forbidden | No AI features work | 5 min (cascades from P0) |
| **P1** | Missing API endpoints (2x) | Business journeys broken | 30 min |
| **P2** | Empty data preview | Poor UX, data validation fails | 10 min |
| **P2** | SLA duration mismatch | Shows 15-24 min instead of <1 min | 10 min |

**Total Fix Time**: ~2 hours for all P0-P2 issues

---

## 🎯 Issues Breakdown

### ISSUE #1: Database Column Missing - `can_use_ai` 🔴 P0

**Error Message**:
```
[0] Error getting user permissions: error: column "can_use_ai" does not exist
```

**Root Cause**:
- Database table `user_permissions` doesn't match schema definition
- Schema migration not applied or failed
- Column defined as `can_use_ai` (snake_case) in DB but code uses `canUseAI` (camelCase)

**Location**:
- Schema: `shared/schema.ts:413`
- Query: `server/services/role-permission.ts:151-208`
- Error Source: `server/services/usage-tracking.ts:167-171`

**Impact**:
- ❌ All permission checks fail
- ❌ AI Insights returns 403 Forbidden
- ❌ Users can't execute analysis
- ❌ Cascades to Issue #4

**Fix**:

```bash
# Step 1: Run database migration
npm run db:push

# Step 2: Verify schema applied
# Connect to database and check:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_permissions';
```

**Expected Columns**:
```sql
column_name              | data_type
-------------------------|----------
id                       | text
user_id                  | text
can_use_ai               | boolean  ✅
can_access_advanced_...  | boolean
max_projects             | integer
...
```

**Validation**:
```bash
# Test permission check
curl -X GET http://localhost:5000/api/user-role \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return 200 with permissions object, not 500
```

---

### ISSUE #2: Null Safety - Cannot Read `estimatedCost` 🔴 P0

**Error Message**:
```
❌ Analysis execution error: Error: Cannot read properties of null (reading 'estimatedCost')
at handleExecuteAnalysis execute-step.tsx:409
```

**Root Cause**:
- Backend returns analysis results without `estimatedCost` field populated
- Frontend accesses `data.results.estimatedCost.total` without null checks
- Analysis plan creation can fail silently, leaving `estimatedCost` as null

**Location**:
- Frontend: `client/src/pages/execute-step.tsx:409`
- Backend: `server/routes/analysis-plans.ts:276`

**Impact**:
- ❌ Analysis execution crashes with HTTP 500
- ❌ 64-second timeout before failure (64426ms in log)
- ❌ Journey cannot complete

**Fix**:

```typescript
// File: client/src/pages/execute-step.tsx
// Around line 425-430

// BEFORE (CRASHES):
const results = {
  totalAnalyses: data.results.summary.totalAnalyses,
  executionTime: data.results.summary.executionTime,
  estimatedCost: data.results.estimatedCost.total  // ❌ Crashes if null
};

// AFTER (SAFE):
const results = {
  totalAnalyses: data.results?.summary?.totalAnalyses || 0,
  executionTime: data.results?.summary?.executionTime || 0,
  estimatedCost: data.results?.estimatedCost?.total || 0  // ✅ Safe
};

// Also add validation after parsing response:
if (!data.results) {
  throw new Error('Analysis results missing from response');
}

if (!data.results.estimatedCost) {
  console.warn('⚠️ Estimated cost not calculated, using default');
  data.results.estimatedCost = { total: 0, breakdown: {} };
}
```

**Server-Side Fix**:

```typescript
// File: server/services/analysis-execution.ts
// Add validation before returning results

if (!analysisResults.estimatedCost) {
  analysisResults.estimatedCost = {
    total: 0,
    breakdown: {
      aiUsage: 0,
      dataProcessing: 0,
      storage: 0
    }
  };
}

return {
  success: true,
  results: analysisResults,
  estimatedCost: analysisResults.estimatedCost  // ✅ Always defined
};
```

**Validation**:
```bash
# Execute analysis and check response
curl -X POST http://localhost:5000/api/analysis-execution/execute \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_ID","config":{}}'

# Response should include:
{
  "success": true,
  "results": {
    "estimatedCost": { "total": 0, ... }  ✅ Always present
  }
}
```

---

### ISSUE #3: Infinite Loading - Plan Step Never Completes 🔴 P0

**Symptom**:
- Page shows "Loading analysis plan..." indefinitely
- Browser screenshot shows spinner never stops

**Root Cause**:
- Error handling in `loadPlan()` doesn't reset `isLoading` state
- When plan creation fails, `setIsLoading(false)` never called
- User stuck on loading screen forever

**Location**:
- `client/src/pages/plan-step.tsx:117-189`

**Impact**:
- ❌ Users cannot proceed past plan step
- ❌ No error message shown to user
- ❌ Journey completely blocked

**Fix**:

```typescript
// File: client/src/pages/plan-step.tsx

// BEFORE (BROKEN):
const loadPlan = async () => {
  try {
    setIsLoading(true);
    const response = await apiClient.get(`/api/projects/${projectId}/plan`);
    // ... logic
  } catch (error: any) {
    if (is404) {
      await createPlan();  // ❌ If this fails, isLoading never reset
    } else {
      setIsLoading(false);  // ❌ Only reset on non-404 errors
    }
  }
};

// AFTER (FIXED):
const loadPlan = async () => {
  try {
    setIsLoading(true);
    const response = await apiClient.get(`/api/projects/${projectId}/plan`);

    const planData = response?.plan || response?.data?.plan || response?.data;

    if (planData && (planData.id || planData.projectId)) {
      setPlan(planData);
      console.log('✅ Plan loaded successfully');
    } else {
      console.log('📋 No plan found, creating new plan...');
      await createPlan();
    }
  } catch (error: any) {
    const is404 = error?.response?.status === 404 || error?.message?.includes('404');

    if (is404) {
      console.log('📋 Plan not found (404), creating new plan...');
      await createPlan();
    } else {
      console.error('❌ Error loading plan:', error);
      toast({
        title: "Failed to load plan",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    }
  } finally {
    setIsLoading(false);  // ✅ ALWAYS reset loading state
  }
};

const createPlan = async () => {
  try {
    setIsCreatingPlan(true);

    const response = await apiClient.post(`/api/projects/${projectId}/plan`, {
      analysisTypes: [],
      configuration: {}
    });

    if (response.success && response.plan) {
      setPlan(response.plan);
      toast({
        title: "Analysis plan created",
        description: "Review and approve the plan to continue"
      });
    } else {
      throw new Error('Plan creation returned no data');
    }
  } catch (error: any) {
    console.error('❌ Plan creation failed:', error);
    toast({
      title: "Plan Creation Failed",
      description: error.message || "Unable to create analysis plan",
      variant: "destructive"
    });
  } finally {
    setIsCreatingPlan(false);  // ✅ Always reset creating state
    setIsLoading(false);  // ✅ Also reset parent loading state
  }
};
```

**Validation**:
1. Navigate to plan step: `http://localhost:5173/journeys/business/plan`
2. Should show loading spinner initially
3. Within 3-5 seconds, should either:
   - ✅ Show plan review UI
   - ✅ Show error message
   - ❌ NOT stay on "Loading..." forever

---

### ISSUE #4: AI Insights 403 Forbidden 🔴 P0

**Error Message**:
```
POST http://localhost:5000/api/ai/ai-insights
[HTTP/1.1 403 Forbidden 589ms]
```

**Screenshot Error**:
```
Insight generation failed
Unable to verify permissions
```

**Root Cause**:
- Cascades from Issue #1 (database schema)
- `getUserPermissions()` returns null due to column error
- AI access control middleware interprets null as "no permissions"
- Returns 403 Forbidden

**Location**:
- `server/middleware/ai-access-control.ts:340-358`
- Cascades from `server/services/role-permission.ts:151-208`

**Impact**:
- ❌ "Generate Auto-Insights" button fails
- ❌ "Ask AI About Your Data" fails
- ❌ All AI-powered features broken

**Fix**:
Same as Issue #1 - run `npm run db:push` to fix schema.

Additionally, improve error messages:

```typescript
// File: server/middleware/ai-access-control.ts
// Around line 350-358

if (!hasPermission) {
  if (permission === 'canUseAI') {
    console.log(`✅ [AI-ACCESS] Allowing canUseAI as fallback for user ${userId}`);
    continue;
  }

  console.error(`❌ [AI-ACCESS] Permission denied: userId=${userId}, permission=${permission}`);
  console.error(`❌ [AI-ACCESS] HINT: If you see "column does not exist" errors, run: npm run db:push`);

  return {
    allowed: false,
    reason: `Permission check failed: ${permission}. Check server logs for database errors.`,
    code: 'INSUFFICIENT_PERMISSIONS',
    upgradeRecommendation: {
      missingPermission: permission,
      featureName: feature.name,
      hint: 'Database schema may need migration' // ✅ Better error message
    }
  };
}
```

**Validation**:
```bash
# Test AI insights endpoint
curl -X POST http://localhost:5000/api/ai/ai-insights \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId":"PROJECT_ID","query":"What patterns exist?"}'

# Should return 200 with insights, not 403
```

---

### ISSUE #5A: Missing Endpoint - Template Config (404) 🟡 P1

**Error Message**:
```
GET http://localhost:5173/api/templates/Survey Response Analysis/config
[HTTP/1.1 404 Not Found 22ms]
```

**Root Cause**:
- Frontend tries to fetch template configuration
- Endpoint `/api/templates/:name/config` doesn't exist
- No route defined for this path

**Location**:
- Called from: `client/src/pages/execute-step.tsx:125`
- Missing route in: `server/routes/` (no template config endpoint)

**Impact**:
- ❌ Business journeys can't auto-populate recommended analyses
- ⚠️ Silently fails (user doesn't see error)
- ⚠️ User must manually select analyses

**Fix**:

Create new endpoint:

```typescript
// File: server/routes/business-template-synthesis.ts
// Add after existing routes

/**
 * GET /api/templates/:name/config
 * Get configuration for a specific template
 */
router.get('/templates/:name/config', ensureAuthenticated, async (req, res) => {
  try {
    const { name } = req.params;

    // Template configurations
    const templateConfigs: Record<string, any> = {
      'Survey Response Analysis': {
        recommendedAnalyses: ['descriptive', 'correlation', 'clustering'],
        requiredColumns: ['response_id', 'question', 'answer'],
        visualizations: ['bar', 'pie', 'heatmap'],
        estimatedDuration: 15 // seconds
      },
      'Employee Engagement': {
        recommendedAnalyses: ['descriptive', 'sentiment', 'correlation'],
        requiredColumns: ['employee_id', 'engagement_score'],
        visualizations: ['line', 'bar', 'scatter'],
        estimatedDuration: 20
      },
      'Customer Satisfaction': {
        recommendedAnalyses: ['descriptive', 'trend', 'clustering'],
        requiredColumns: ['customer_id', 'satisfaction_score', 'date'],
        visualizations: ['line', 'bar', 'heatmap'],
        estimatedDuration: 18
      }
    };

    const config = templateConfigs[name];

    if (!config) {
      return res.status(404).json({
        success: false,
        error: `Template '${name}' not found`
      });
    }

    res.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('❌ Error fetching template config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template configuration'
    });
  }
});
```

**Validation**:
```bash
# Test template config endpoint
curl -X GET "http://localhost:5000/api/templates/Survey%20Response%20Analysis/config" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
{
  "success": true,
  "config": {
    "recommendedAnalyses": ["descriptive", "correlation", "clustering"],
    ...
  }
}
```

---

### ISSUE #5B: Missing Endpoint - PM Transformation Analysis (404) 🟡 P1

**Error Message**:
```
POST http://localhost:5173/api/project-manager/analyze-transformation-needs
[HTTP/1.1 404 Not Found 440ms]
```

**Root Cause**:
- Frontend calls PM agent for transformation recommendations
- Endpoint doesn't exist in project-manager routes

**Location**:
- Called from: `client/src/components/data-transformation-ui.tsx:175`
- Missing route in: `server/routes/project-manager.ts`

**Impact**:
- ❌ Transformation suggestions don't work
- ❌ Users don't get AI-guided transformation recommendations

**Fix**:

Create endpoint in `server/routes/project-manager.ts`:

```typescript
/**
 * POST /api/project-manager/analyze-transformation-needs
 * Get PM agent recommendations for data transformations
 */
router.post('/analyze-transformation-needs', ensureAuthenticated, async (req, res) => {
  try {
    const { projectId, currentData, goals } = req.body;
    const userId = (req.user as any)?.id;

    if (!projectId || !currentData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, currentData'
      });
    }

    // Import PM agent
    const { ProjectManagerAgent } = await import('../services/project-manager-agent');
    const pmAgent = new ProjectManagerAgent();

    // Analyze transformation needs
    const analysis = await pmAgent.analyzeTransformationNeeds({
      projectId,
      userId,
      currentData,
      goals: goals || [],
      context: {
        dataSize: currentData.length,
        columnCount: Object.keys(currentData[0] || {}).length
      }
    });

    res.json({
      success: true,
      recommendations: analysis.recommendations || [],
      suggestedSteps: analysis.suggestedSteps || [],
      estimatedDuration: analysis.estimatedDuration || 5
    });
  } catch (error: any) {
    console.error('❌ Error analyzing transformation needs:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to analyze transformation needs'
    });
  }
});
```

**Also update PM agent** if method doesn't exist:

```typescript
// File: server/services/project-manager-agent.ts
// Add method if missing

async analyzeTransformationNeeds(context: {
  projectId: string;
  userId: string;
  currentData: any[];
  goals: string[];
  context: { dataSize: number; columnCount: number };
}): Promise<{
  recommendations: string[];
  suggestedSteps: any[];
  estimatedDuration: number;
}> {
  console.log(`🔍 PM Agent analyzing transformation needs for project ${context.projectId}`);

  // Analyze data structure and goals to recommend transformations
  const recommendations: string[] = [];
  const suggestedSteps: any[] = [];

  // Check for common transformation needs
  if (context.context.columnCount > 20) {
    recommendations.push('Consider feature selection to reduce dimensionality');
    suggestedSteps.push({
      type: 'feature_selection',
      description: 'Select most relevant columns',
      priority: 'high'
    });
  }

  if (context.context.dataSize > 10000) {
    recommendations.push('Large dataset detected - consider sampling or aggregation');
    suggestedSteps.push({
      type: 'aggregation',
      description: 'Aggregate data by key dimensions',
      priority: 'medium'
    });
  }

  // Estimate duration based on data size
  const estimatedDuration = Math.ceil(context.context.dataSize / 1000) + 2; // 2-5 seconds typically

  return {
    recommendations,
    suggestedSteps,
    estimatedDuration
  };
}
```

**Validation**:
```bash
# Test transformation analysis endpoint
curl -X POST http://localhost:5000/api/project-manager/analyze-transformation-needs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "PROJECT_ID",
    "currentData": [{"col1": "val1", "col2": "val2"}],
    "goals": ["Improve data quality"]
  }'

# Should return 200 with recommendations
```

---

### ISSUE #6: Empty Data Preview 🟡 P2

**Symptom**:
- Data Preview tab is completely blank
- No table or data shown even after successful upload

**Root Cause**:
- Component looks for `projectData.preview` or `projectData.sampleData`
- According to CLAUDE.md, data is stored in `projectData.data` (inline storage)
- Wrong field reference

**Location**:
- `client/src/pages/data-verification-step.tsx:504-522`

**Impact**:
- ⚠️ Users can't verify data uploaded correctly
- ⚠️ Can't visually confirm column structure
- ⚠️ Poor UX - appears broken

**Fix**:

```typescript
// File: client/src/pages/data-verification-step.tsx
// Around line 504-522

{(() => {
  // ✅ Check projectData.data first (inline storage per CLAUDE.md)
  const previewData = Array.isArray(projectData.data) ? projectData.data :
                   Array.isArray(projectData.preview) ? projectData.preview :
                   Array.isArray(projectData.sampleData) ? projectData.sampleData : [];

  if (previewData.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          No data available for preview. Please upload data first.
        </AlertDescription>
      </Alert>
    );
  }

  const firstRow = previewData[0];
  const headers = Object.keys(firstRow || {});

  if (headers.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Data structure is invalid. Please re-upload your dataset.
        </AlertDescription>
      </Alert>
    );
  }

  // Render table with actual data
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            {headers.map(header => (
              <th key={header} className="px-3 py-2 text-left text-xs font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewData.slice(0, 10).map((row, idx) => (
            <tr key={idx}>
              {headers.map(header => (
                <td key={header} className="px-3 py-2 text-sm">
                  {String(row[header] || '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Showing {Math.min(10, previewData.length)} of {previewData.length} rows
      </p>
    </div>
  );
})()}
```

**Validation**:
1. Upload dataset
2. Navigate to Data Preview tab
3. Should show table with actual data rows
4. Should show column headers
5. Should show "Showing X of Y rows" message

---

### ISSUE #7: Mock Quality Score (85%) 🔴 P0

**Symptom**:
- Data Quality Checkpoint shows "85%" score
- Same value appears for all datasets
- Labeled as "Good" without real analysis

**Root Cause**:
- Hardcoded fallback value when `dataQuality?.score` is undefined
- Violates CLAUDE.md production requirement: "Mock Data Visible to Users" is CRITICAL issue

**Location**:
- `client/src/pages/data-verification-step.tsx:575`

**Impact**:
- 🔴 **PRODUCTION VIOLATION** - Mock data shown to users
- ❌ Users can't distinguish real vs. fake analysis
- ❌ Violates transparency requirements

**Fix**:

```typescript
// File: client/src/pages/data-verification-step.tsx
// Around line 575

// BEFORE (SHOWS MOCK):
<DataQualityCheckpoint
  qualityScore={dataQuality?.score || 85}  // ❌ Hardcoded 85% mock
  issues={dataQuality?.issues?.map(...) || []}
  onApprove={handleQualityApprove}
  onFixIssue={handleFixIssue}
  isLoading={isProcessing}
/>

// AFTER (NO MOCK):
<DataQualityCheckpoint
  qualityScore={dataQuality?.score}  // ✅ Undefined if not calculated
  issues={dataQuality?.issues?.map(...) || []}
  onApprove={handleQualityApprove}
  onFixIssue={handleFixIssue}
  isLoading={isProcessing}
/>

// And update DataQualityCheckpoint component to handle undefined:
// File: client/src/components/DataQualityCheckpoint.tsx

interface DataQualityCheckpointProps {
  qualityScore?: number;  // ✅ Optional
  issues: Array<{ severity: string; message: string; fix: string }>;
  onApprove: () => void;
  onFixIssue: (issue: any) => void;
  isLoading: boolean;
}

export function DataQualityCheckpoint({ qualityScore, issues, onApprove, onFixIssue, isLoading }: DataQualityCheckpointProps) {
  // ✅ Show pending state if score not calculated
  if (qualityScore === undefined || qualityScore === null) {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Data Quality Analysis Pending</AlertTitle>
        <AlertDescription>
          Analyzing your dataset quality... This usually takes 3-5 seconds.
        </AlertDescription>
      </Alert>
    );
  }

  // ✅ Show actual score
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-green-900">
            Data Quality Checkpoint
          </h3>
          <p className="text-sm text-green-700">
            Data quality approved. Ready to proceed.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-1">Overall Quality Score</p>
            <p className="text-xs text-gray-500">
              Based on completeness, consistency, and validity
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-orange-500">{qualityScore}%</p>
            <p className="text-sm text-gray-600">
              {qualityScore >= 90 ? 'Excellent' :
               qualityScore >= 80 ? 'Good' :
               qualityScore >= 70 ? 'Fair' : 'Needs Improvement'}
            </p>
          </div>
        </div>
      </div>

      {/* ... rest of component */}
    </div>
  );
}
```

**Validation**:
1. Upload dataset
2. Navigate to Quality tab
3. Should initially show "Data Quality Analysis Pending"
4. After 3-5 seconds, should show real quality score
5. Score should vary based on actual data quality
6. Should NEVER show hardcoded 85%

---

### ISSUE #8: Session Expiry Too Aggressive 🟡 P1

**Error Message**:
```
POST http://localhost:5000/api/project-session/ps_1762321980425_fmee3r/update-step
[HTTP/1.1 410 Gone 12ms]

Error: Session expired
```

**Root Cause**:
- Sessions expire exactly at `expiresAt` timestamp
- No grace period for active users
- Transformation steps take time, session expires mid-workflow

**Location**:
- `server/routes/project-session.ts:175-181`

**Impact**:
- ❌ Users kicked out mid-transformation
- ❌ Lose progress on multi-step workflows
- ❌ Poor UX - forced to restart journey

**Fix**:

```typescript
// File: server/routes/project-session.ts
// Around line 175-191

// BEFORE (TOO STRICT):
if (session.expiresAt) {
  const expiresAt = new Date(session.expiresAt);
  if (expiresAt < now) {
    console.warn(`⚠️ Session ${sessionId} expired`);
    return res.status(410).json({ error: 'Session expired' });  // ❌ Immediate rejection
  }
}

// AFTER (WITH GRACE PERIOD):
if (session.expiresAt) {
  const expiresAt = new Date(session.expiresAt);
  const hoursSinceExpiry = (now.getTime() - expiresAt.getTime()) / (1000 * 60 * 60);

  // ✅ Allow 1-hour grace period for recently expired sessions
  if (hoursSinceExpiry > 1) {
    console.warn(`⚠️ Session ${sessionId} expired ${hoursSinceExpiry.toFixed(1)} hours ago`);
    return res.status(410).json({
      error: 'Session expired',
      expiredAt: expiresAt,
      hint: 'Please create a new project to continue'
    });
  }

  // ✅ Auto-renew if within grace period
  if (expiresAt < now && hoursSinceExpiry <= 1) {
    console.log(`🔄 Auto-renewing session ${sessionId} (expired ${hoursSinceExpiry.toFixed(1)} hours ago)`);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_DAYS);
    updateData.expiresAt = newExpiresAt;
  }
}

// Also extend session if within 1 day of expiry (existing logic)
if (session.expiresAt) {
  const expiresAt = new Date(session.expiresAt);
  const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry < 1) {
    console.log(`🔄 Extending session ${sessionId} (expires in ${daysUntilExpiry.toFixed(1)} days)`);
    const newExpiresAt = new Date();
    newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_EXPIRY_DAYS);
    updateData.expiresAt = newExpiresAt;
  }
}
```

**Validation**:
1. Create project session
2. Wait for session to expire (or manually set `expiresAt` to past date in DB)
3. Try to update session step
4. Should auto-renew if expired <1 hour ago
5. Should reject with helpful message if expired >1 hour ago

---

### ISSUE #9: Duration SLA Violation - Shows 15-24 Minutes 🟡 P2

**Symptom**:
- Analysis Plan Review shows "Estimated Duration: 15-24 minutes"
- Violates documented <1 minute SLA
- User expectations completely wrong

**Root Cause**:
- Frontend calculation uses 5-8 minutes per analysis type
- Journey templates define durations in SECONDS (not minutes)
- Mismatch between frontend display and backend reality

**Location**:
- Frontend: `client/src/pages/execute-step.tsx:587`
- Journey Templates: `shared/journey-templates.ts:87-149`

**Impact**:
- ⚠️ Users expect 15-24 minute wait
- ⚠️ Actually completes in <1 minute
- ⚠️ Confusing UX - estimation wildly inaccurate

**Fix**:

```typescript
// File: client/src/pages/execute-step.tsx
// Around line 587

// BEFORE (SHOWS MINUTES):
estimatedDuration={
  selectedAnalyses.length > 0
    ? `${selectedAnalyses.length * 5}-${selectedAnalyses.length * 8} minutes`  // ❌ 5-8 min per analysis
    : undefined
}

// AFTER (SHOWS SECONDS):
estimatedDuration={
  selectedAnalyses.length > 0
    ? `${selectedAnalyses.length * 3}-${selectedAnalyses.length * 6} seconds`  // ✅ 3-6 sec per analysis
    : undefined
}

// OR BETTER: Pull from journey templates
import { journeyTemplates } from '@shared/journey-templates';

const calculateEstimatedDuration = () => {
  if (selectedAnalyses.length === 0) return undefined;

  // Get journey template
  const template = journeyTemplates[journeyType];
  if (!template) return `${selectedAnalyses.length * 4} seconds`;  // Fallback

  // Sum durations for selected analysis steps
  const totalSeconds = template.steps
    .filter(step => selectedAnalyses.includes(step.id))
    .reduce((sum, step) => sum + (step.estimatedDuration || 4), 0);

  return totalSeconds < 60
    ? `${totalSeconds} seconds`
    : `${Math.floor(totalSeconds / 60)} min ${totalSeconds % 60} sec`;
};

estimatedDuration={calculateEstimatedDuration()}
```

**Also verify journey templates** have correct values:

```typescript
// File: shared/journey-templates.ts
// Ensure all durations are in SECONDS

const nonTechTemplate: JourneyTemplate = {
  id: 'non-tech',
  name: 'AI-Guided Journey',
  steps: [
    {
      id: 'project_setup',
      name: 'Project Setup',
      estimatedDuration: 3  // ✅ 3 seconds (not 3 minutes)
    },
    {
      id: 'data_upload',
      name: 'Data Upload',
      estimatedDuration: 8  // ✅ 8 seconds
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      estimatedDuration: 25  // ✅ 25 seconds (main analysis)
    },
    // ... rest of steps
  ],
  totalEstimatedDuration: 50  // ✅ 50 seconds total
};
```

**Validation**:
1. Navigate to Execute Step
2. Select 3 analysis types
3. Check "Estimated Duration" display
4. Should show ~9-18 seconds (NOT 15-24 minutes)
5. Actual execution should match estimate within 20%

---

## 🔧 Technology Recommendations for <1 Minute SLA

### Current Architecture Issues

**Problem**: 64-second HTTP timeout on analysis execution (from logs)
- Python scripts run synchronously
- No progress updates during execution
- Blocks entire HTTP request thread

**Recommended Changes**:

### 1. **Asynchronous Analysis Execution** (HIGH PRIORITY)

Replace synchronous Python execution with background job queue:

```typescript
// Current (BLOCKING):
POST /api/analysis-execution/execute
→ Spawns Python process
→ Waits 64 seconds ⏱️
→ Returns results
→ User sees no progress

// Recommended (NON-BLOCKING):
POST /api/analysis-execution/execute
→ Creates background job
→ Returns job ID immediately (200ms)
→ WebSocket sends progress updates
→ User sees real-time progress

// Implementation using Bull Queue + Redis:
import Queue from 'bull';
const analysisQueue = new Queue('analysis', process.env.REDIS_URL);

// Route handler:
router.post('/execute', ensureAuthenticated, async (req, res) => {
  const { projectId, config } = req.body;

  // ✅ Create background job (instant response)
  const job = await analysisQueue.add('execute-analysis', {
    projectId,
    userId: req.user.id,
    config
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });

  // ✅ Return immediately with job ID
  res.json({
    success: true,
    jobId: job.id,
    status: 'queued',
    estimatedDuration: 25
  });
});

// Worker process:
analysisQueue.process('execute-analysis', async (job) => {
  const { projectId, userId, config } = job.data;

  // Update progress via WebSocket
  job.progress(10);
  wss.sendProjectUpdate(projectId, { status: 'analyzing', progress: 10 });

  // Execute Python script
  const results = await executePythonAnalysis(config);

  job.progress(80);
  wss.sendProjectUpdate(projectId, { status: 'generating_artifacts', progress: 80 });

  // Generate artifacts
  const artifacts = await artifactGenerator.generateArtifacts({...});

  job.progress(100);
  wss.sendProjectUpdate(projectId, { status: 'completed', progress: 100, artifacts });

  return { results, artifacts };
});
```

**Benefits**:
- ✅ Instant HTTP response (<200ms)
- ✅ No timeout issues
- ✅ Real-time progress updates
- ✅ Retry logic on failures
- ✅ Queue priority management

---

### 2. **Parallel Python Execution** (MEDIUM PRIORITY)

Run multiple analysis types concurrently instead of sequentially:

```typescript
// Current (SEQUENTIAL - SLOW):
const results = [];
for (const analysisType of ['descriptive', 'correlation', 'clustering']) {
  const result = await executePythonScript(`${analysisType}_analysis.py`, data);
  results.push(result);  // ❌ Each takes 8-12 seconds sequentially = 24-36 seconds
}

// Recommended (PARALLEL - FAST):
const analysisPromises = ['descriptive', 'correlation', 'clustering'].map(type =>
  executePythonScript(`${type}_analysis.py`, data)
);
const results = await Promise.all(analysisPromises);  // ✅ All run in parallel = 8-12 seconds total
```

**Expected Improvement**: 3x faster for 3 analysis types

---

### 3. **Python Script Optimization** (HIGH PRIORITY)

Optimize Python scripts for speed:

```python
# Current (SLOW):
import pandas as pd
import numpy as np

def analyze(data):
    df = pd.DataFrame(data)

    # Slow operations:
    - df.iterrows()  # ❌ Slow row iteration
    - for loop over dataframe  # ❌ Slow
    - Multiple data copies  # ❌ Memory inefficient

# Recommended (FAST):
import polars as pl  # ✅ 5-10x faster than pandas
import numpy as np

def analyze(data):
    df = pl.DataFrame(data)  # ✅ Lazy evaluation

    # Fast operations:
    - df.select([...])  # ✅ Vectorized operations
    - df.group_by().agg([...])  # ✅ Parallel aggregation
    - df.with_columns([...])  # ✅ Column operations

# Additional optimizations:
- Use numba for numerical computations  # ✅ JIT compilation
- Cache intermediate results  # ✅ Avoid recomputation
- Limit data to necessary columns only  # ✅ Reduce memory
```

**Expected Improvement**: 5-10x faster on large datasets

---

### 4. **Smart Sampling for Large Datasets** (MEDIUM PRIORITY)

For datasets >10,000 rows, use sampling:

```typescript
// Automatic sampling for large datasets
const sampleSize = data.length > 10000 ? 10000 : data.length;

if (data.length > sampleSize) {
  console.log(`📊 Dataset has ${data.length} rows, sampling ${sampleSize} for analysis`);

  // Stratified sampling to preserve distribution
  const sampledData = stratifiedSample(data, sampleSize);
  analysisData = sampledData;

  // Note in results that sampling was used
  results.metadata.sampled = true;
  results.metadata.sampleSize = sampleSize;
  results.metadata.totalSize = data.length;
} else {
  analysisData = data;
}
```

**Expected Improvement**: Consistent <1 min even for 100k+ row datasets

---

### 5. **Artifact Generation Optimization** (LOW PRIORITY)

Defer non-critical artifacts:

```typescript
// Current (ALL UPFRONT):
- Generate PDF (5-8 seconds)
- Generate PPTX (3-5 seconds)
- Generate CSV (1-2 seconds)
- Generate JSON (1 second)
- Generate Dashboard (2-3 seconds)
= Total: 12-19 seconds

// Recommended (LAZY GENERATION):
- Generate metadata records immediately (100ms)
- Generate files on-demand when user clicks download
- Or generate in background after analysis completes

// Implementation:
const artifacts = {
  pdf: { status: 'pending', url: null },
  pptx: { status: 'pending', url: null },
  csv: { status: 'pending', url: null },
  json: { status: 'pending', url: null }
};

// Save to DB immediately
await db.insert(projectArtifacts).values({
  ...artifacts,
  status: 'pending_generation'
});

// Generate in background
generateArtifactsAsync(projectId);  // ✅ Doesn't block analysis completion
```

**Expected Improvement**: 10-15 seconds saved on initial completion

---

## 📋 Implementation Plan

### Phase 1: Critical Fixes (2-3 hours)

**Priority**: Fix P0 issues to unblock platform

1. ✅ **Database Schema Migration** (30 min)
   - Run `npm run db:push`
   - Verify `user_permissions` table structure
   - Test permission checks
   - Validates: Issues #1, #4

2. ✅ **Null Safety Fixes** (45 min)
   - Add `?.` operators in execute-step.tsx
   - Add server-side validation for estimatedCost
   - Test analysis execution
   - Validates: Issue #2

3. ✅ **Infinite Loading Fix** (30 min)
   - Add `finally` blocks to reset loading states
   - Improve error messages
   - Test plan-step loading
   - Validates: Issue #3

4. ✅ **Remove Mock Quality Score** (30 min)
   - Remove hardcoded 85% fallback
   - Update DataQualityCheckpoint component
   - Show pending state instead of mock
   - Test quality checkpoint
   - Validates: Issue #7

**Validation Checkpoint**:
```bash
# Run automated test
npm run test:e2e-journey

# Manual test
1. Create project
2. Upload data
3. Execute analysis
4. Verify completes in <1 minute
5. Check artifacts appear
6. Verify NO mock data (85%) shown
```

---

### Phase 2: High Priority Fixes (2-3 hours)

**Priority**: Improve stability and UX

5. ✅ **Create Missing Endpoints** (1.5 hours)
   - Add `/api/templates/:name/config` endpoint
   - Add `/api/project-manager/analyze-transformation-needs` endpoint
   - Add PM agent method if missing
   - Test business journey template config
   - Test transformation recommendations
   - Validates: Issues #5A, #5B

6. ✅ **Fix Session Expiry** (1 hour)
   - Add 1-hour grace period
   - Improve auto-renewal logic
   - Better error messages
   - Test session behavior
   - Validates: Issue #8

**Validation Checkpoint**:
```bash
# Test business journey
1. Create project with journey type "business"
2. Select "Survey Response Analysis" template
3. Verify recommended analyses auto-populate
4. Execute transformations
5. Session should not expire during workflow
```

---

### Phase 3: Medium Priority Fixes (1-2 hours)

**Priority**: Polish and accuracy

7. ✅ **Fix Data Preview** (30 min)
   - Update to use `projectData.data` field
   - Add better empty state handling
   - Test with various datasets
   - Validates: Issue #6

8. ✅ **Fix Duration SLA Display** (30 min)
   - Change from minutes to seconds
   - Pull from journey templates
   - Update calculation logic
   - Test accuracy of estimates
   - Validates: Issue #9

**Validation Checkpoint**:
```bash
# Test complete journey
1. Create project
2. Upload data
3. Verify data preview shows actual rows
4. Check estimated duration shows seconds (not minutes)
5. Execute analysis
6. Verify actual duration matches estimate (±20%)
```

---

### Phase 4: Performance Optimizations (4-6 hours)

**Priority**: Achieve consistent <1 minute SLA

9. ✅ **Implement Background Job Queue** (3 hours)
   - Install Bull + Redis: `npm install bull redis`
   - Create analysis queue
   - Update execute endpoint to create jobs
   - Add worker process
   - Implement WebSocket progress updates
   - Test with real datasets

10. ✅ **Parallel Python Execution** (1 hour)
    - Update analysis execution to use `Promise.all()`
    - Test concurrent script execution
    - Verify results accuracy

11. ✅ **Python Script Optimization** (2 hours)
    - Install Polars: `pip install polars`
    - Rewrite key analysis scripts
    - Benchmark before/after
    - Test accuracy of optimized scripts

**Validation Checkpoint**:
```bash
# Performance test with large dataset (10k+ rows)
1. Upload 10,000 row dataset
2. Select 3 analysis types
3. Execute analysis
4. Should complete in <60 seconds ✅
5. Verify results accuracy
6. Check artifacts generated correctly
```

---

## 🧪 Comprehensive Validation Methodology

### Test Suite 1: Database & Schema Validation

```bash
# 1. Check database schema
npm run db:push

# 2. Verify user_permissions table
psql -U postgres -d chimaridata_db -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'user_permissions';
"

# Expected columns:
# - can_use_ai (boolean) ✅
# - can_access_advanced_features (boolean)
# - max_projects (integer)

# 3. Test permission query
curl -X GET http://localhost:5000/api/user-role \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return 200 with permissions object
```

---

### Test Suite 2: End-to-End Journey Test

```bash
# Automated test
npm run test:e2e-journey

# Expected output:
# ✅ User Setup: Using user: test@example.com
# ✅ Project Creation: Created project: abc123
# ✅ Dataset Upload: Uploaded 119 rows with 21 columns
# ✅ Analysis Execution: Analysis completed with 3 insights
# ✅ Artifact Generation: Generated 5 artifact types
# ✅ Artifact Verification: Found 1 artifact record(s) in database
# ✅ File System Check: Found 4 artifact file(s)
# ✅ Journey State: Project status: completed
#
# Total Duration: <60 seconds ✅
```

---

### Test Suite 3: Manual UI Validation

**Test Case 1: New Project Journey**

```
Steps:
1. Navigate to http://localhost:5173
2. Login with test account
3. Click "Create Project"
4. Fill in:
   - Name: "Teacher Survey Analysis"
   - Journey Type: "AI-Guided"
5. Upload: English Survey for Teacher Conferences Week Online (Responses).xlsx
6. Navigate to Data Preview tab
7. Navigate to Quality tab
8. Navigate to Schema tab
9. Navigate to Execute step
10. Select: Descriptive Statistics, Correlation Analysis
11. Click "Execute Analysis"
12. Wait for completion
13. Navigate to Artifacts tab

Expected Results:
- ✅ Data Preview shows actual data rows (NOT empty)
- ✅ Quality tab shows real score (NOT hardcoded 85%)
- ✅ Quality tab initially shows "Analysis Pending" if not done
- ✅ Schema shows 21 columns detected
- ✅ Execute step shows estimated duration in SECONDS (NOT minutes)
- ✅ Analysis completes in <60 seconds
- ✅ NO session expired errors
- ✅ Artifacts tab shows 5 artifact types
- ✅ Download links work for PDF, PPTX, CSV, JSON
- ✅ Journey shows "Completed" status

Expected Failures (Before Fixes):
- ❌ Data Preview is blank
- ❌ Quality shows 85% (mock)
- ❌ Estimated duration shows "10-16 minutes"
- ❌ Session expires during execution
- ❌ Analysis crashes with estimatedCost error
- ❌ Artifacts don't appear
```

**Test Case 2: Business Journey with Template**

```
Steps:
1. Create new project
2. Journey Type: "Business"
3. Primary Business Template: "Survey Response Analysis"
4. Upload survey dataset
5. Navigate to Execute step

Expected Results:
- ✅ Recommended analyses auto-populated from template
- ✅ Template config endpoint returns 200 (NOT 404)
- ✅ Analyses include: Descriptive, Correlation, Clustering

Expected Failures (Before Fixes):
- ❌ 404 error for /api/templates/.../config
- ❌ No recommended analyses
- ❌ User must manually select all analyses
```

**Test Case 3: Data Transformation**

```
Steps:
1. Create project
2. Upload data
3. Navigate to transformation UI
4. Click "Get AI Recommendations"

Expected Results:
- ✅ PM agent analyzes data structure
- ✅ Returns transformation recommendations
- ✅ Endpoint returns 200 (NOT 404)

Expected Failures (Before Fixes):
- ❌ 404 error for /api/project-manager/analyze-transformation-needs
- ❌ No recommendations shown
```

**Test Case 4: AI Insights**

```
Steps:
1. Navigate to Insights tab on project page
2. Click "Generate Auto-Insights"
3. Try "Ask AI About Your Data"

Expected Results:
- ✅ Insights generated successfully
- ✅ Endpoint returns 200 (NOT 403)
- ✅ No "Unable to verify permissions" error

Expected Failures (Before Fixes):
- ❌ 403 Forbidden
- ❌ "Unable to verify permissions" error
- ❌ Cascades from database schema issue
```

---

### Test Suite 4: Performance Benchmarks

**SLA Target**: <1 minute from goals to artifacts

**Benchmark Tests**:

```typescript
// Test with different dataset sizes
const benchmarks = [
  { name: 'Small (100 rows)', rows: 100, expectedTime: '15-25 seconds' },
  { name: 'Medium (1,000 rows)', rows: 1000, expectedTime: '25-40 seconds' },
  { name: 'Large (10,000 rows)', rows: 10000, expectedTime: '40-60 seconds' },
  { name: 'XL (50,000 rows)', rows: 50000, expectedTime: '<2 minutes (after optimization)' }
];

// For each benchmark:
1. Create project
2. Upload dataset of specified size
3. Start timer
4. Execute analysis (3 analysis types)
5. Wait for artifacts
6. Stop timer
7. Record duration

// Pass/Fail Criteria:
- Small: PASS if <30 seconds ✅
- Medium: PASS if <45 seconds ✅
- Large: PASS if <65 seconds ✅
- XL: PASS if <120 seconds (with optimizations) ✅
```

**Performance Validation Script**:

```bash
# Create performance test script
# File: scripts/performance-benchmark.ts

import { performance } from 'perf_hooks';

async function runBenchmark(datasetSize: number) {
  console.log(`\n🏁 Starting benchmark: ${datasetSize} rows`);
  const start = performance.now();

  // 1. Create project
  const createStart = performance.now();
  const project = await createProject({ name: `Benchmark ${datasetSize}` });
  console.log(`  ✅ Project created: ${(performance.now() - createStart).toFixed(0)}ms`);

  // 2. Upload dataset
  const uploadStart = performance.now();
  await uploadDataset(project.id, generateDataset(datasetSize));
  console.log(`  ✅ Data uploaded: ${(performance.now() - uploadStart).toFixed(0)}ms`);

  // 3. Execute analysis
  const analysisStart = performance.now();
  await executeAnalysis(project.id, ['descriptive', 'correlation', 'clustering']);
  console.log(`  ✅ Analysis completed: ${(performance.now() - analysisStart).toFixed(0)}ms`);

  // 4. Verify artifacts
  const artifactsStart = performance.now();
  const artifacts = await getArtifacts(project.id);
  console.log(`  ✅ Artifacts verified: ${(performance.now() - artifactsStart).toFixed(0)}ms`);

  const totalTime = (performance.now() - start) / 1000;
  console.log(`\n📊 Total time: ${totalTime.toFixed(2)} seconds`);

  // Pass/Fail
  const slaTarget = datasetSize <= 1000 ? 45 : datasetSize <= 10000 ? 65 : 120;
  const passed = totalTime < slaTarget;
  console.log(passed ? `✅ PASS (target: <${slaTarget}s)` : `❌ FAIL (target: <${slaTarget}s)`);

  return { datasetSize, totalTime, passed, slaTarget };
}

// Run benchmarks
async function main() {
  const results = [];

  for (const size of [100, 1000, 10000]) {
    const result = await runBenchmark(size);
    results.push(result);
  }

  console.log('\n📊 BENCHMARK SUMMARY\n');
  console.table(results);
}

main();
```

---

### Test Suite 5: Error Handling Validation

**Test Case 1: Graceful Session Expiry**

```
Steps:
1. Create project
2. Manually set session expiresAt to 30 minutes ago
3. Try to update transformation step

Expected Results:
- ✅ Auto-renews session (within 1-hour grace period)
- ✅ Update succeeds
- ✅ NO 410 Gone error

Alternative:
1. Set expiresAt to 2 hours ago
2. Try to update

Expected Results:
- ✅ Returns 410 with helpful error message
- ✅ Message includes: "Session expired 2 hours ago"
- ✅ Message includes: "Please create a new project to continue"
```

**Test Case 2: Missing Data Handling**

```
Steps:
1. Create project without uploading data
2. Try to navigate to Execute step

Expected Results:
- ✅ Shows "No data uploaded" message
- ✅ Disables Execute button
- ✅ Shows helpful guidance
- ❌ NOT blank/broken UI
```

**Test Case 3: Plan Loading Error Handling**

```
Steps:
1. Navigate to plan-step
2. Simulate backend plan creation failure

Expected Results:
- ✅ Loading spinner appears initially
- ✅ After failure, shows error toast
- ✅ Loading state resets (no infinite loading)
- ✅ User can retry or go back
```

---

## 📊 Success Metrics

After implementing all fixes, platform should achieve:

### Functional Metrics
- ✅ 100% user journey completion rate (no crashes)
- ✅ 0% mock data shown to users
- ✅ 0% session expiry errors during active sessions
- ✅ 100% API endpoint success rate (no 404s)

### Performance Metrics
- ✅ <60 seconds for 100-1,000 row datasets (P0)
- ✅ <65 seconds for 10,000 row datasets (P1)
- ✅ <2 minutes for 50,000+ row datasets (P2)
- ✅ <5% variance in estimated vs actual duration

### Quality Metrics
- ✅ Real quality scores (not hardcoded)
- ✅ Accurate data previews (actual data shown)
- ✅ Proper error messages (no generic "500" errors)
- ✅ Transparent progress tracking (real-time updates)

---

## 🚀 Deployment Checklist

Before deploying fixes to production:

### Pre-Deployment
- [ ] All P0 issues fixed and tested
- [ ] All P1 issues fixed and tested
- [ ] Database migration script ready
- [ ] Backup current database
- [ ] Performance benchmarks passing
- [ ] E2E tests passing
- [ ] Manual QA completed

### Deployment Steps
1. [ ] Run database migration: `npm run db:push`
2. [ ] Verify schema changes applied
3. [ ] Deploy backend code
4. [ ] Deploy frontend code
5. [ ] Restart server processes
6. [ ] Clear Redis cache (if using)
7. [ ] Monitor error logs for 1 hour

### Post-Deployment Validation
- [ ] Run automated E2E test
- [ ] Create 3 test projects manually
- [ ] Verify no 404 errors in logs
- [ ] Verify no 403 errors in logs
- [ ] Verify no 410 errors in logs
- [ ] Check performance metrics
- [ ] Verify artifacts generated correctly

### Rollback Plan
If critical issues found:
1. [ ] Revert frontend deployment
2. [ ] Revert backend deployment
3. [ ] Restore database from backup (if schema issues)
4. [ ] Document rollback reason
5. [ ] Fix issues in development
6. [ ] Re-test before redeploying

---

## 📞 Next Steps

**Immediate Actions** (Today):

1. **Run Database Migration**
   ```bash
   npm run db:push
   ```

2. **Apply P0 Fixes** (Issues #1-4, #7)
   - Estimated time: 2-3 hours
   - Critical for platform functionality

3. **Test End-to-End**
   ```bash
   npm run test:e2e-journey
   ```

4. **Manual Validation**
   - Create test project
   - Upload teacher survey dataset
   - Complete full journey
   - Verify <1 minute completion
   - Verify no mock data shown

**Short-Term** (This Week):

5. **Apply P1 Fixes** (Issues #5A, #5B, #8)
   - Estimated time: 2-3 hours
   - Improves stability and UX

6. **Performance Optimization** (Phase 4)
   - Implement background job queue
   - Parallelize Python execution
   - Optimize Python scripts
   - Estimated time: 4-6 hours

**Medium-Term** (Next Week):

7. **Comprehensive Testing**
   - Performance benchmarks
   - Load testing with large datasets
   - User acceptance testing

8. **Production Deployment**
   - Deploy to staging first
   - Validate all fixes
   - Deploy to production
   - Monitor metrics

---

**All file locations, code snippets, and validation commands have been provided. You now have a complete roadmap to fix all critical issues and achieve the <1 minute SLA target.**
