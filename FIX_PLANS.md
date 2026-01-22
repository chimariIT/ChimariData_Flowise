# ChimariData Fix Plans

**Created**: January 7, 2026
**Last Updated**: January 22, 2026
**Status**: P0-P2 IMPLEMENTED ✅ | Jan 22 Comprehensive Platform Fixes ✅
**Total Issues**: 30+
**Estimated Total Effort**: 25-30 hours

---

## Implementation Status

| Priority | Issues | Status | Completed |
|----------|--------|--------|-----------|
| **P0 Critical** | 4 | ✅ COMPLETE | Jan 7, 2026 |
| **P1 High** | 3 | ✅ COMPLETE | Jan 7, 2026 |
| **P2 Medium** | 3 | ✅ COMPLETE | Jan 7, 2026 |
| **Jan 22 Platform** | 5 | ✅ COMPLETE | Jan 22, 2026 |
| **Jan 22 Hotfixes** | 2 | ✅ COMPLETE | Jan 22, 2026 |
| **P3 Low** | 2 | 📋 Planned | - |
| **Agent Overhaul** | 1 | 📋 Planned | - |

### Files Modified (Jan 7)
- `server/routes/project.ts` - Added column mappings, PII persistence, 4 new endpoints
- `server/routes/analysis-execution.ts` - Payment gates for execution and results, BA translation trigger
- `server/services/analysis-execution.ts` - Business Agent translation integration
- `server/services/project-manager-agent.ts` - Sequential agent orchestration workflow
- `client/src/lib/utils.ts` - Row count utility functions
- `client/src/components/PaymentStatusBanner.tsx` - NEW: Payment status UI banner
- `client/src/pages/project-results.tsx` - Added PaymentStatusBanner integration

### Files Modified (Jan 22 - Comprehensive Platform Fixes)
- `server/routes/analysis-payment.ts` - Pricing unification (aligned buildPricing with CostEstimationService)
- `server/routes/payment.ts` - Payment verify-session response fix (added paymentStatus field)
- `server/routes/pricing.ts` - Subscription price ID fix (yearly != monthly)
- `server/services/analysis-execution.ts` - PII decisions SSOT (read from journeyProgress first)
- `client/src/hooks/useProject.ts` - Navigation cache fix (refetchOnMount: 'always')
- `client/src/pages/data-transformation-step.tsx` - Cache invalidation on mount
- `client/src/pages/pricing-step.tsx` - Rely on backend cost estimate, pre-execution display fix

---

## Table of Contents

1. [P0 Critical Fixes](#p0-critical-fixes) - 4 issues ✅ IMPLEMENTED
2. [P1 High Priority Fixes](#p1-high-priority-fixes) - 3 issues ✅ IMPLEMENTED
3. [P2 Medium Priority Fixes](#p2-medium-priority-fixes) - 3 issues ✅ IMPLEMENTED
4. [Jan 22 Comprehensive Platform Fixes](#jan-22-comprehensive-platform-fixes) - 7 issues ✅ IMPLEMENTED
5. [P3 Low Priority Fixes](#p3-low-priority-fixes) - 2 issues, ~8 hours
6. [Agent Coordination Overhaul](#agent-coordination-overhaul) - Full architecture fix

---

## P0 Critical Fixes

These issues break the core data-to-analysis pipeline and must be fixed first.

### Fix 1.1: Save Transformation Mappings to Database

**Issue**: Column mappings (element → source column) are sent to backend but NOT persisted.

**Impact**: Evidence chain breaks - cannot trace which data was used for which analysis.

**Files to Modify**:
- `server/routes/project.ts` (lines 6341-6355)

**Current Code** (line 6343-6355):
```typescript
await storage.updateDataset(primaryDataset.id, {
  ingestionMetadata: {
    ...(primaryDataset.ingestionMetadata || {}),
    transformedData: workingData,
    transformedSchema,
    transformationApplied: true,
    transformationSteps,
    joinConfig,
    questionAnswerMapping,  // ✅ Already saved
    transformedAt: new Date().toISOString(),
    transformedRowCount: workingData.length
  }
} as any);
```

**Fix**: Add `columnMappings` to the saved metadata:

```typescript
// server/routes/project.ts - Around line 6343
// Extract mappings from request body (already received but not saved)
const { mappings } = req.body; // This is sent from frontend as elementToSourceMap

await storage.updateDataset(primaryDataset.id, {
  ingestionMetadata: {
    ...(primaryDataset.ingestionMetadata || {}),
    transformedData: workingData,
    transformedSchema,
    transformationApplied: true,
    transformationSteps,
    joinConfig,
    questionAnswerMapping,
    // ✅ FIX: Add column mappings for evidence chain
    columnMappings: mappings || {},  // ADD THIS LINE
    transformedAt: new Date().toISOString(),
    transformedRowCount: workingData.length
  }
} as any);
```

**Also Update journeyProgress** (line 6357-6366):
```typescript
await storage.updateProject(projectId, {
  journeyProgress: {
    ...(project as any)?.journeyProgress,
    transformationApplied: true,
    transformedRowCount: workingData.length,
    transformedAt: new Date().toISOString(),
    // ✅ FIX: Save mappings to journeyProgress for frontend access
    transformationMappings: mappings || {}  // ADD THIS LINE
  }
} as any);
```

**Verification**:
```bash
# After applying fix, check server logs for:
# "✅ [Transformation] Saved X column mappings to dataset"
```

**Effort**: 30 minutes

---

### Fix 1.2: Add Payment Gate to Analysis Execution ✅ IMPLEMENTED

**Status**: COMPLETE - Payment gate uses subscription tier + quota system (not trial credits).

**Implementation** (`server/routes/analysis-execution.ts` lines 166-248):
```typescript
// Subscription-first payment gate:
// 1. Check project.isPaid → Full access (bypass quotas)
// 2. Check subscription tier → canAccessJourney()
// 3. Check quota → trackFeatureUsage()
// 4. Execute analysis → Deduct from quota
```

**Effort**: Complete

---

### Fix 1.3: Gate Results Endpoint by Payment

**Issue**: `GET /api/analysis-execution/results/:projectId` returns full results regardless of payment.

**Impact**: Users can view full analysis results without paying.

**Files to Modify**:
- `server/routes/analysis-execution.ts` (results endpoint, around line 242)

**Fix**: Return limited results if not paid:

```typescript
// server/routes/analysis-execution.ts - Results endpoint

router.get('/results/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const { projectId } = req.params;

    // Access check
    const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    const project = accessCheck.project;
    const results = await AnalysisExecutionService.getResults(projectId, userId);

    // ✅ FIX 1.3: Gate results by payment status
    const isPaid = (project as any).isPaid === true;

    if (!isPaid) {
      console.log(`🔒 [Results Gate] Returning preview-only results for unpaid project ${projectId}`);

      // Return limited preview (10% of insights, no recommendations, limited visualizations)
      const limitedResults = {
        ...results,
        isPreview: true,
        insights: (results.insights || []).slice(0, Math.ceil((results.insights?.length || 0) * 0.1)),
        recommendations: [], // Hide recommendations until paid
        visualizations: (results.visualizations || []).slice(0, 2), // Only 2 charts
        questionAnswers: (results.questionAnswers || []).map((qa: any) => ({
          ...qa,
          answer: qa.answer ? qa.answer.substring(0, 100) + '... [Full answer requires payment]' : null,
          supportingInsights: [] // Hide evidence chain
        })),
        paymentRequired: true,
        paymentUrl: `/projects/${projectId}/payment`
      };

      return res.json({
        success: true,
        results: limitedResults,
        message: 'Preview results. Complete payment to unlock full analysis.'
      });
    }

    // Full results for paid projects
    return res.json({
      success: true,
      results: {
        ...results,
        isPreview: false,
        paymentRequired: false
      }
    });

  } catch (error: any) {
    console.error('Error getting results:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

**Frontend Update** (`client/src/pages/project-results.tsx`):
```tsx
// Add payment status banner
{results?.isPreview && (
  <Alert className="mb-6 bg-amber-50 border-amber-200">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Preview Mode</AlertTitle>
    <AlertDescription>
      You're viewing a limited preview. Complete payment to unlock:
      <ul className="list-disc ml-4 mt-2">
        <li>All {results.fullInsightCount || 'X'} insights (showing {results.insights?.length || 0})</li>
        <li>Personalized recommendations</li>
        <li>Full question answers with evidence</li>
        <li>Downloadable reports and data</li>
      </ul>
      <Button
        className="mt-3"
        onClick={() => navigate(`/projects/${projectId}/payment`)}
      >
        Unlock Full Results
      </Button>
    </AlertDescription>
  </Alert>
)}
```

**Effort**: 45 minutes

---

### Fix 1.4: Ensure PII Decisions Save to Both Locations

**Issue**: PII masking choices may not be saved consistently.

**Impact**: Artifacts may leak PII data.

**Files to Modify**:
- `server/routes/project.ts` (verify endpoint, around line 6189-6259)

**Current Code Check**: The PUT verify endpoint should save to both:
1. `journeyProgress.piiDecisions`
2. `dataset.piiMaskingChoices`

**Fix**: Add explicit verification logging and ensure both saves:

```typescript
// server/routes/project.ts - PUT /api/projects/:id/verify endpoint

// After extracting piiDecisions from request body
const { piiDecisions, dataQuality, schemaValidation } = req.body;

console.log(`🔒 [PII FIX] Received ${Object.keys(piiDecisions || {}).length} PII decisions`);

// 1. Save to journeyProgress (SSOT)
const updatedJourneyProgress = {
  ...(project as any)?.journeyProgress,
  piiDecisions: piiDecisions || {},
  piiDecisionTimestamp: new Date().toISOString(),
  dataQuality,
  schemaValidation,
  verificationCompleted: true
};

await storage.updateProject(projectId, {
  journeyProgress: updatedJourneyProgress
} as any);

console.log(`✅ [PII FIX] Saved PII decisions to journeyProgress`);

// 2. ALSO save to each dataset's ingestionMetadata
const datasets = await storage.getDatasetsByProject(projectId);
for (const ds of datasets) {
  const dataset = (ds as any).dataset || ds;

  // Build column-specific PII choices for this dataset
  const datasetPiiChoices: Record<string, string> = {};
  const schema = dataset.schema || dataset.ingestionMetadata?.originalSchema || {};

  for (const [field, choice] of Object.entries(piiDecisions || {})) {
    // Only include fields that exist in this dataset
    if (schema[field] || dataset.piiFields?.includes(field)) {
      datasetPiiChoices[field] = choice as string;
    }
  }

  if (Object.keys(datasetPiiChoices).length > 0) {
    await storage.updateDataset(dataset.id, {
      ingestionMetadata: {
        ...(dataset.ingestionMetadata || {}),
        piiMaskingChoices: datasetPiiChoices,
        piiDecisionTimestamp: new Date().toISOString()
      }
    } as any);

    console.log(`✅ [PII FIX] Saved ${Object.keys(datasetPiiChoices).length} PII choices to dataset ${dataset.id}`);
  }
}

// 3. Log summary for debugging
console.log(`🔒 [PII FIX] PII decision summary:`, {
  projectId,
  totalDecisions: Object.keys(piiDecisions || {}).length,
  datasetsUpdated: datasets.length,
  decisions: piiDecisions
});
```

**Effort**: 30 minutes

---

## P1 High Priority Fixes

These issues break important features.

### Fix 2.1: Add Missing API Endpoints

**Issue**: Three endpoints expected by frontend don't exist.

#### 2.1.1: Decision Trail Endpoint

**Files to Create/Modify**:
- `server/routes/project.ts` (add new endpoint)

```typescript
// server/routes/project.ts - Add after other GET endpoints

/**
 * GET /api/projects/:id/decision-trail
 * Returns the audit trail of agent decisions for a project
 */
router.get('/:id/decision-trail', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const projectId = req.params.id;

    const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    // Query decision audits from database
    const audits = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.projectId, projectId))
      .orderBy(desc(decisionAudits.createdAt));

    // Format for frontend
    const decisionTrail = audits.map(audit => ({
      id: audit.id,
      timestamp: audit.createdAt,
      agent: audit.agent,
      decisionType: audit.decisionType,
      decision: audit.decision,
      confidence: audit.confidence,
      reasoning: audit.reasoning,
      evidence: audit.evidence ? JSON.parse(audit.evidence as string) : null,
      appliedAt: audit.appliedAt
    }));

    return res.json({
      success: true,
      decisionTrail,
      count: decisionTrail.length
    });

  } catch (error: any) {
    console.error('Error fetching decision trail:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

#### 2.1.2: Upload SLA Endpoint

```typescript
// server/routes/project.ts

/**
 * GET /api/projects/:id/upload-sla
 * Returns SLA metrics for upload processing
 */
router.get('/:id/upload-sla', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const projectId = req.params.id;

    const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    const project = accessCheck.project;
    const journeyProgress = (project as any)?.journeyProgress || {};
    const stepTimestamps = journeyProgress.stepTimestamps || {};

    // Calculate SLA metrics
    const uploadStarted = stepTimestamps.uploadStarted ? new Date(stepTimestamps.uploadStarted) : null;
    const uploadCompleted = stepTimestamps.uploadCompleted ? new Date(stepTimestamps.uploadCompleted) : null;

    let uploadDurationMs = 0;
    if (uploadStarted && uploadCompleted) {
      uploadDurationMs = uploadCompleted.getTime() - uploadStarted.getTime();
    }

    // Get datasets for size info
    const datasets = await storage.getDatasetsByProject(projectId);
    const totalRecords = datasets.reduce((sum, ds) => {
      const dataset = (ds as any).dataset || ds;
      return sum + (dataset.recordCount || 0);
    }, 0);
    const totalSizeMB = datasets.reduce((sum, ds) => {
      const dataset = (ds as any).dataset || ds;
      const dataSizeBytes = JSON.stringify(dataset.data || []).length;
      return sum + (dataSizeBytes / (1024 * 1024));
    }, 0);

    // SLA thresholds (configurable)
    const SLA_THRESHOLDS = {
      small: { maxRecords: 10000, targetSeconds: 30 },
      medium: { maxRecords: 100000, targetSeconds: 120 },
      large: { maxRecords: 1000000, targetSeconds: 300 }
    };

    let slaTarget = SLA_THRESHOLDS.large.targetSeconds;
    if (totalRecords <= SLA_THRESHOLDS.small.maxRecords) {
      slaTarget = SLA_THRESHOLDS.small.targetSeconds;
    } else if (totalRecords <= SLA_THRESHOLDS.medium.maxRecords) {
      slaTarget = SLA_THRESHOLDS.medium.targetSeconds;
    }

    const uploadDurationSeconds = uploadDurationMs / 1000;
    const slaMet = uploadDurationSeconds <= slaTarget;

    return res.json({
      success: true,
      sla: {
        uploadDurationMs,
        uploadDurationSeconds,
        slaTargetSeconds: slaTarget,
        slaMet,
        totalRecords,
        totalSizeMB: Math.round(totalSizeMB * 100) / 100,
        recordsPerSecond: uploadDurationSeconds > 0 ? Math.round(totalRecords / uploadDurationSeconds) : 0,
        timestamps: {
          started: uploadStarted?.toISOString() || null,
          completed: uploadCompleted?.toISOString() || null
        }
      }
    });

  } catch (error: any) {
    console.error('Error fetching upload SLA:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

#### 2.1.3: Chart Generation Endpoint

```typescript
// server/routes/project.ts

/**
 * POST /api/projects/:id/generate-charts
 * Generates visualization charts for project data
 */
router.post('/:id/generate-charts', ensureAuthenticated, async (req, res) => {
  try {
    const userId = (req.user as any)?.id;
    const projectId = req.params.id;

    const accessCheck = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
    if (!accessCheck.allowed) {
      return res.status(403).json({ success: false, error: accessCheck.reason });
    }

    const { chartTypes, columns, options } = req.body;

    // Get project data
    const datasets = await storage.getDatasetsByProject(projectId);
    if (!datasets.length) {
      return res.status(400).json({ success: false, error: 'No datasets found' });
    }

    const primaryDataset = (datasets[0] as any).dataset || datasets[0];
    const data = primaryDataset.ingestionMetadata?.transformedData ||
                 primaryDataset.data ||
                 primaryDataset.preview || [];

    // Use enhanced visualization engine
    const { EnhancedVisualizationEngine } = await import('../services/enhanced-visualization-engine');
    const vizEngine = new EnhancedVisualizationEngine();

    const charts = [];
    const requestedTypes = chartTypes || ['bar', 'line', 'pie'];

    for (const chartType of requestedTypes) {
      try {
        const chartConfig = await vizEngine.generateChart({
          type: chartType,
          data,
          columns: columns || Object.keys(data[0] || {}),
          options: options || {}
        });

        charts.push({
          id: nanoid(),
          type: chartType,
          config: chartConfig,
          generatedAt: new Date().toISOString()
        });
      } catch (chartError) {
        console.warn(`Failed to generate ${chartType} chart:`, chartError);
      }
    }

    // Save charts to project
    const project = accessCheck.project;
    await storage.updateProject(projectId, {
      journeyProgress: {
        ...(project as any)?.journeyProgress,
        generatedCharts: charts,
        chartsGeneratedAt: new Date().toISOString()
      }
    } as any);

    return res.json({
      success: true,
      charts,
      count: charts.length
    });

  } catch (error: any) {
    console.error('Error generating charts:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

**Effort**: 3 hours total

---

### Fix 2.2: Checkpoint Approval Must Block Workflow

**Issue**: Checkpoint approvals saved to DB but don't block step progression.

**Files to Modify**:
- `server/services/journey-state-manager.ts`
- `client/src/pages/data-transformation-step.tsx` (and other step pages)

**Backend Fix** - Add checkpoint status validation:

```typescript
// server/services/journey-state-manager.ts

export class JourneyStateManager {
  /**
   * Check if step can proceed based on checkpoint approvals
   */
  async canProceedToStep(projectId: string, targetStep: string): Promise<{
    canProceed: boolean;
    blockingCheckpoint?: any;
    reason?: string;
  }> {
    // Get pending checkpoints for this project
    const checkpoints = await db
      .select()
      .from(agentCheckpoints)
      .where(
        and(
          eq(agentCheckpoints.projectId, projectId),
          eq(agentCheckpoints.requiresUserInput, true),
          eq(agentCheckpoints.status, 'pending')
        )
      );

    // Check if any checkpoint blocks the target step
    const stepOrder = ['prepare', 'upload', 'verification', 'transformation', 'plan', 'execute', 'results'];
    const targetIndex = stepOrder.indexOf(targetStep);

    for (const checkpoint of checkpoints) {
      // Determine which step the checkpoint blocks
      const checkpointStep = this.getStepForCheckpoint(checkpoint.stepName);
      const checkpointIndex = stepOrder.indexOf(checkpointStep);

      // If checkpoint is for a step before target, it blocks progression
      if (checkpointIndex < targetIndex) {
        return {
          canProceed: false,
          blockingCheckpoint: checkpoint,
          reason: `Checkpoint "${checkpoint.stepName}" requires approval before proceeding to ${targetStep}`
        };
      }
    }

    return { canProceed: true };
  }

  private getStepForCheckpoint(checkpointStepName: string): string {
    const stepMapping: Record<string, string> = {
      'data_quality_review': 'verification',
      'pii_detection': 'verification',
      'transformation_review': 'transformation',
      'analysis_plan_review': 'plan',
      'results_validation': 'execute'
    };
    return stepMapping[checkpointStepName] || 'unknown';
  }
}
```

**Frontend Fix** - Check before navigation:

```typescript
// client/src/pages/data-transformation-step.tsx - In Continue handler

const handleContinue = async () => {
  // Check for blocking checkpoints
  try {
    const checkResult = await apiClient.get(`/api/projects/${projectId}/can-proceed?targetStep=plan`);

    if (!checkResult.canProceed) {
      toast({
        title: "Approval Required",
        description: checkResult.reason || "Please approve pending checkpoints before continuing.",
        variant: "destructive"
      });
      return;
    }
  } catch (error) {
    console.warn('Could not verify checkpoint status:', error);
    // Proceed anyway if check fails (graceful degradation)
  }

  // Continue with navigation...
  onNext?.();
};
```

**Add API Endpoint**:

```typescript
// server/routes/project.ts

router.get('/:id/can-proceed', ensureAuthenticated, async (req, res) => {
  try {
    const projectId = req.params.id;
    const targetStep = req.query.targetStep as string;

    const journeyStateManager = new JourneyStateManager();
    const result = await journeyStateManager.canProceedToStep(projectId, targetStep);

    return res.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
```

**Effort**: 2 hours

---

### Fix 2.3: Use Transformed Row Count in UI

**Issue**: Frontend shows original record count, not transformed count after joins.

**Files to Modify**:
- Multiple frontend components that display row counts

**Fix**: Check `transformedRecordCount` before `recordCount`:

```typescript
// Helper function - add to client/src/lib/utils.ts

export function getDatasetRowCount(dataset: any): number {
  // Priority: transformedRecordCount > transformedRowCount > recordCount
  return dataset?.ingestionMetadata?.transformedRecordCount ||
         dataset?.ingestionMetadata?.transformedRowCount ||
         dataset?.recordCount ||
         dataset?.data?.length ||
         0;
}

export function getDatasetRowCountDisplay(dataset: any): string {
  const transformedCount = dataset?.ingestionMetadata?.transformedRecordCount ||
                          dataset?.ingestionMetadata?.transformedRowCount;
  const originalCount = dataset?.recordCount || dataset?.data?.length || 0;

  if (transformedCount && transformedCount !== originalCount) {
    return `${transformedCount.toLocaleString()} rows (from ${originalCount.toLocaleString()} original)`;
  }
  return `${originalCount.toLocaleString()} rows`;
}
```

**Update Components**:
```typescript
// client/src/pages/execute-step.tsx, project-page.tsx, etc.

// Before:
<span>{dataset.recordCount} rows</span>

// After:
import { getDatasetRowCountDisplay } from '@/lib/utils';
<span>{getDatasetRowCountDisplay(dataset)}</span>
```

**Effort**: 1 hour

---

## P2 Medium Priority Fixes

### Fix 3.1: Implement PM Agent Workflow Orchestration

**Issue**: PM Agent runs all agents in parallel without dependencies.

**Files to Modify**:
- `server/services/project-manager-agent.ts`

**Current Pattern** (problematic):
```typescript
Promise.all([
  this.queryDataEngineer(...),
  this.queryDataScientist(...),
  this.queryBusinessAgent(...)
])
```

**Fixed Pattern** (sequential with dependencies):

```typescript
// server/services/project-manager-agent.ts

/**
 * Orchestrate analysis workflow with proper agent coordination
 * Implements U2A2A2A2U pattern with sequential dependencies
 */
async orchestrateAnalysisWorkflow(projectId: string, uploadedData: any[], userGoals: string[]): Promise<any> {
  const safeGoals = userGoals || ['General analysis'];
  const industry = this.inferIndustry(uploadedData);

  console.log(`🎯 [PM Orchestration] Starting coordinated workflow for project ${projectId}`);

  // Phase 1: Data Engineer assesses data quality (no dependencies)
  console.log(`📊 [Phase 1] Data Engineer: Assessing data quality...`);
  const qualityReport = await this.queryDataEngineer(projectId, uploadedData);

  // Emit progress event
  this.emitProgress(projectId, {
    phase: 1,
    agent: 'data_engineer',
    status: 'complete',
    result: 'Data quality assessment complete'
  });

  // Phase 2: Data Scientist generates requirements (depends on quality report)
  console.log(`🔬 [Phase 2] Data Scientist: Generating analysis requirements...`);
  const requirements = await this.queryDataScientist(projectId, uploadedData, safeGoals, {
    qualityReport // Pass quality report from Phase 1
  });

  this.emitProgress(projectId, {
    phase: 2,
    agent: 'data_scientist',
    status: 'complete',
    result: `Generated ${requirements.analysisPath?.length || 0} analysis recommendations`
  });

  // Phase 3: Data Engineer prepares transformation plan (depends on requirements)
  console.log(`🔧 [Phase 3] Data Engineer: Planning transformations...`);
  const transformationPlan = await this.coordinateTransformations(projectId, uploadedData, requirements);

  this.emitProgress(projectId, {
    phase: 3,
    agent: 'data_engineer',
    status: 'complete',
    result: `Planned ${transformationPlan.steps?.length || 0} transformations`
  });

  // Phase 4: Business Agent validates alignment (depends on requirements + industry)
  console.log(`💼 [Phase 4] Business Agent: Validating business alignment...`);
  const businessValidation = await this.queryBusinessAgent(projectId, uploadedData, safeGoals, industry, {
    requirements,
    transformationPlan
  });

  this.emitProgress(projectId, {
    phase: 4,
    agent: 'business_agent',
    status: 'complete',
    result: businessValidation.approved ? 'Business alignment validated' : 'Needs review'
  });

  // Combine all results
  const orchestrationResult = {
    qualityReport,
    requirements,
    transformationPlan,
    businessValidation,
    orchestrationComplete: true,
    timestamp: new Date().toISOString()
  };

  console.log(`✅ [PM Orchestration] Workflow complete for project ${projectId}`);

  return orchestrationResult;
}

/**
 * Coordinate with Data Engineer for transformation planning
 */
private async coordinateTransformations(
  projectId: string,
  data: any[],
  requirements: any
): Promise<any> {
  // Extract required data elements from DS requirements
  const requiredElements = requirements.requiredDataElements || [];

  // Ask DE to create transformation plan
  const dataEngineerAgent = new DataEngineerAgent();

  const transformationPlan = await dataEngineerAgent.planTransformations({
    projectId,
    sourceData: data,
    requiredElements,
    targetSchema: requirements.targetSchema
  });

  return transformationPlan;
}

/**
 * Emit progress event for real-time UI updates
 */
private emitProgress(projectId: string, progress: any): void {
  try {
    const { AgentMessageBroker } = require('./agents/message-broker');
    const broker = AgentMessageBroker.getInstance();

    broker.emit('agent:progress', {
      projectId,
      ...progress,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.warn('Failed to emit progress:', error);
  }
}
```

**Effort**: 4 hours

---

### Fix 3.2: Add Business Agent Results Translation Trigger

**Issue**: BA Agent has `translateResults()` but it's never called after DS completes analysis.

**Files to Modify**:
- `server/services/analysis-execution.ts`
- `server/services/business-agent.ts`

**Fix**: Call BA translation after analysis execution:

```typescript
// server/services/analysis-execution.ts - After analysis completes (around line 900)

// After generating insights and recommendations...

// ✅ FIX 3.2: Trigger Business Agent translation for audience-appropriate results
try {
  const { BusinessAgent } = await import('./business-agent');
  const businessAgent = new BusinessAgent();

  // Get audience from project
  const audience = (project as any)?.journeyProgress?.audience?.primary || 'executive';

  console.log(`💼 [BA Translation] Translating results for ${audience} audience...`);

  const translatedResults = await businessAgent.translateResults({
    results: {
      insights: results.insights,
      recommendations: results.recommendations,
      summary: results.summary
    },
    audience,
    decisionContext: (project as any)?.journeyProgress?.audience?.decisionContext
  });

  // Merge translated results
  results.translatedInsights = translatedResults.insights;
  results.translatedRecommendations = translatedResults.recommendations;
  results.executiveSummary = translatedResults.executiveSummary;
  results.audienceFormatted = true;

  console.log(`✅ [BA Translation] Results translated for ${audience} audience`);

} catch (translationError) {
  console.warn('⚠️ Business Agent translation failed (non-blocking):', translationError);
  // Continue with untranslated results
}
```

**Effort**: 2 hours

---

### Fix 3.3: Add Payment Status UI Indicators

**Issue**: No visual distinction between preview and paid results.

**Files to Modify**:
- `client/src/pages/project-results.tsx`
- `client/src/pages/project-page.tsx`

**Fix**: Add payment status banner component:

```tsx
// client/src/components/PaymentStatusBanner.tsx

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Lock, CheckCircle, AlertCircle } from "lucide-react";
import { useNavigate } from "wouter";

interface PaymentStatusBannerProps {
  projectId: string;
  isPaid: boolean;
  isPreview?: boolean;
  previewLimits?: {
    insightsShown: number;
    totalInsights: number;
    chartsShown: number;
    totalCharts: number;
  };
}

export function PaymentStatusBanner({
  projectId,
  isPaid,
  isPreview,
  previewLimits
}: PaymentStatusBannerProps) {
  const [, navigate] = useNavigate();

  if (isPaid) {
    return (
      <Alert className="mb-4 bg-green-50 border-green-200">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertTitle className="text-green-800">Full Access</AlertTitle>
        <AlertDescription className="text-green-700">
          You have full access to all analysis results, insights, and downloadable artifacts.
        </AlertDescription>
      </Alert>
    );
  }

  if (isPreview) {
    return (
      <Alert className="mb-4 bg-amber-50 border-amber-200">
        <Lock className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800">Preview Mode</AlertTitle>
        <AlertDescription className="text-amber-700">
          <p className="mb-2">You're viewing a limited preview of your analysis results.</p>
          {previewLimits && (
            <ul className="list-disc ml-4 mb-3 text-sm">
              <li>Showing {previewLimits.insightsShown} of {previewLimits.totalInsights} insights</li>
              <li>Showing {previewLimits.chartsShown} of {previewLimits.totalCharts} visualizations</li>
              <li>Question answers truncated</li>
              <li>Evidence chains hidden</li>
              <li>Downloads disabled</li>
            </ul>
          )}
          <Button
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/payment`)}
          >
            <Lock className="h-3 w-3 mr-1" />
            Unlock Full Results
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 bg-blue-50 border-blue-200">
      <AlertCircle className="h-4 w-4 text-blue-600" />
      <AlertTitle className="text-blue-800">Payment Required</AlertTitle>
      <AlertDescription className="text-blue-700">
        Complete payment to access your analysis results.
        <Button
          variant="link"
          className="px-1"
          onClick={() => navigate(`/projects/${projectId}/payment`)}
        >
          Go to Payment →
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

**Usage in Results Page**:
```tsx
// client/src/pages/project-results.tsx

import { PaymentStatusBanner } from "@/components/PaymentStatusBanner";

// In component render:
<PaymentStatusBanner
  projectId={projectId}
  isPaid={project?.isPaid}
  isPreview={results?.isPreview}
  previewLimits={results?.isPreview ? {
    insightsShown: results.insights?.length || 0,
    totalInsights: results.fullInsightCount || results.insights?.length || 0,
    chartsShown: results.visualizations?.length || 0,
    totalCharts: results.fullVisualizationCount || results.visualizations?.length || 0
  } : undefined}
/>
```

**Effort**: 1 hour

---

## P3 Low Priority Fixes

### Fix 4.1: Integrate or Remove Plan Step

**Issue**: Plan step generates detailed analysis plan but execution ignores it.

**Options**:

#### Option A: Integrate Plan Step (4 hours)

```typescript
// client/src/pages/execute-step.tsx - Load and use approved plan

useEffect(() => {
  const loadApprovedPlan = async () => {
    const journeyProgress = project?.journeyProgress;
    const planApproved = journeyProgress?.planApproved;
    const analysisPlanId = journeyProgress?.analysisPlanId;

    if (planApproved && analysisPlanId) {
      try {
        const planResponse = await apiClient.get(`/api/analysis-plans/${analysisPlanId}`);
        const plan = planResponse.plan;

        // Convert plan.analysisSteps to analysisPath format
        const convertedPath = plan.analysisSteps.map((step: any) => ({
          analysisId: step.id,
          analysisName: step.name,
          analysisType: step.type,
          requiredDataElements: step.inputs,
          priority: step.priority || 1
        }));

        setAnalysisPath(convertedPath);

        // Auto-select analyses from plan
        setSelectedAnalyses(plan.analysisSteps.map((s: any) => s.type));

        console.log(`✅ Loaded approved plan with ${convertedPath.length} analyses`);
      } catch (error) {
        console.warn('Failed to load approved plan:', error);
      }
    }
  };

  loadApprovedPlan();
}, [project]);
```

#### Option B: Remove Plan Step (2 hours)

```typescript
// client/src/App.tsx - Remove plan step from journey flow

// Change journey steps from:
// prepare → upload → verification → transformation → plan → execute → results

// To:
// prepare → upload → verification → transformation → execute → results

// Remove plan step route and navigation
```

**Recommendation**: Option A (integrate) provides better user experience. Option B is simpler but loses planning feature.

**Effort**: 4 hours (Option A) or 2 hours (Option B)

---

### Fix 4.2: Replace Orchestrator Switch Logic with Messages

**Issue**: Project orchestrator has hardcoded switch statements instead of message-based coordination.

**Files to Modify**:
- `server/services/project-agent-orchestrator.ts`

**Current Code** (problematic):
```typescript
case 'data_scientist':
  console.log(`🔬 [DS Agent] Executing...`);
  // Direct execution
```

**Fixed Code** (message-based):

```typescript
// server/services/project-agent-orchestrator.ts

import { AgentMessageBroker } from './agents/message-broker';

async executeAgentStep(projectId: string, step: any): Promise<any> {
  const broker = AgentMessageBroker.getInstance();
  const correlationId = nanoid();

  console.log(`📤 [Orchestrator] Sending task to ${step.agent} via message broker`);

  // Send task message to agent
  const taskMessage = {
    id: nanoid(),
    from: 'project_manager',
    to: step.agent,
    type: 'task' as const,
    payload: {
      projectId,
      stepId: step.id,
      stepName: step.name,
      inputs: step.inputs,
      expectedOutputs: step.outputs
    },
    timestamp: new Date(),
    correlationId,
    priority: 'normal' as const
  };

  // Wait for agent response with timeout
  const response = await broker.sendAndWait(taskMessage, 60000); // 60s timeout

  if (response.type === 'error') {
    throw new Error(`Agent ${step.agent} failed: ${response.payload.message}`);
  }

  console.log(`📥 [Orchestrator] Received response from ${step.agent}`);

  return response.payload;
}

// In the agent classes, add message handlers:
// server/services/data-scientist-agent.ts

constructor() {
  // Register as message handler
  const broker = AgentMessageBroker.getInstance();
  broker.registerAgent('data_scientist', this.handleMessage.bind(this));
}

async handleMessage(message: AgentMessage): Promise<AgentMessage> {
  const { payload, correlationId } = message;

  try {
    let result;

    switch (payload.stepName) {
      case 'generate_requirements':
        result = await this.generateRequirements(payload);
        break;
      case 'run_analysis':
        result = await this.runAnalysis(payload);
        break;
      default:
        throw new Error(`Unknown step: ${payload.stepName}`);
    }

    return {
      id: nanoid(),
      from: 'data_scientist',
      to: message.from,
      type: 'result',
      payload: result,
      timestamp: new Date(),
      correlationId
    };
  } catch (error: any) {
    return {
      id: nanoid(),
      from: 'data_scientist',
      to: message.from,
      type: 'error',
      payload: { message: error.message },
      timestamp: new Date(),
      correlationId
    };
  }
}
```

**Effort**: 4 hours

---

## Agent Coordination Overhaul

For a complete U2A2A2A2U workflow, the following architectural changes are needed:

### High-Level Design

```
User Request
    ↓
┌─────────────────┐
│   PM Agent      │  ← Workflow orchestrator
│   (Supervisor)  │
└────────┬────────┘
         │
    ┌────┴────┬────────────┬─────────────┐
    ↓         ↓            ↓             ↓
┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
│Research│ │  Data  │ │  Data  │ │  Business  │
│ Agent  │ │Scientist│ │Engineer│ │   Agent    │
└────────┘ └────────┘ └────────┘ └────────────┘
    │         │            │             │
    └─────────┴────────────┴─────────────┘
                     │
              ┌──────┴──────┐
              │   Message   │
              │   Broker    │
              └──────┬──────┘
                     ↓
              User Response
```

### Workflow State Machine

```typescript
// server/services/workflow-state-machine.ts

type WorkflowState =
  | 'idle'
  | 'researching_templates'
  | 'generating_requirements'
  | 'assessing_quality'
  | 'planning_transformations'
  | 'awaiting_user_approval'
  | 'executing_transformations'
  | 'executing_analysis'
  | 'translating_results'
  | 'complete'
  | 'error';

interface WorkflowTransition {
  from: WorkflowState;
  to: WorkflowState;
  trigger: string;
  guard?: (context: any) => boolean;
  action?: (context: any) => Promise<void>;
}

const WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  { from: 'idle', to: 'researching_templates', trigger: 'START' },
  { from: 'researching_templates', to: 'generating_requirements', trigger: 'TEMPLATES_READY' },
  { from: 'generating_requirements', to: 'assessing_quality', trigger: 'REQUIREMENTS_GENERATED' },
  { from: 'assessing_quality', to: 'planning_transformations', trigger: 'QUALITY_ASSESSED' },
  { from: 'planning_transformations', to: 'awaiting_user_approval', trigger: 'TRANSFORMATIONS_PLANNED' },
  { from: 'awaiting_user_approval', to: 'executing_transformations', trigger: 'USER_APPROVED' },
  { from: 'awaiting_user_approval', to: 'planning_transformations', trigger: 'USER_REJECTED' },
  { from: 'executing_transformations', to: 'executing_analysis', trigger: 'TRANSFORMATIONS_COMPLETE' },
  { from: 'executing_analysis', to: 'translating_results', trigger: 'ANALYSIS_COMPLETE' },
  { from: 'translating_results', to: 'complete', trigger: 'TRANSLATION_COMPLETE' },
  // Error handling
  { from: '*', to: 'error', trigger: 'ERROR' },
  { from: 'error', to: 'idle', trigger: 'RESET' }
];
```

### Implementation Steps

1. **Week 1**: Create `WorkflowStateMachine` service
2. **Week 2**: Update all agents to use message broker
3. **Week 3**: Implement PM Agent orchestration with state machine
4. **Week 4**: Add checkpoint integration and user approval flows
5. **Week 5**: Testing and refinement

**Total Effort**: 40+ hours (5 weeks part-time)

---

## Jan 22 Comprehensive Platform Fixes

**Date**: January 22, 2026
**Status**: ✅ ALL COMPLETE
**Commits**: `8eb706b`, `b557a0f`

These fixes address 5 recurring issues identified from pattern analysis across all previous fix plans, plus 2 critical hotfixes discovered during comprehensive audit.

### Fix JP-1: Pricing Unification ✅

**Root Cause**: 3 competing pricing systems produced different costs:
- `CostEstimationService`: $0.50 base + type multipliers
- `buildPricing()` in analysis-payment.ts: $5 flat base + size/complexity
- Frontend `calculatePricing`: Journey-based prices ($29-$99)

**Fix**: Aligned `buildPricing()` with CostEstimationService constants. Frontend now relies entirely on backend estimate.

**Files Modified**:
- `server/routes/analysis-payment.ts:36-81` - buildPricing uses $0.50 base, $0.10/1K rows, type multipliers matching CostEstimationService
- `client/src/pages/pricing-step.tsx` - Removed client-side journey base prices, uses backendCostEstimate as authority

### Fix JP-2: Subscription Price ID Bug ✅

**Root Cause**: `server/routes/pricing.ts:477-487` used `tier.stripePriceId` for BOTH monthly and yearly fields.

**Fix**: Query `subscriptionTierPricing` DB table for distinct price IDs per billing period.

**Files Modified**:
- `server/routes/pricing.ts:477-487` - Yearly uses `dbTier?.stripeYearlyPriceId`, monthly uses `dbTier?.stripeMonthlyPriceId`

### Fix JP-3: Navigation Cache Staleness ✅

**Root Cause**: `useProject` hook had `staleTime: 30000` (30s). After prepare step saves data and navigates, next component reads from stale cache.

**Fix**: Added `refetchOnMount: 'always'` to useQuery config, plus cache invalidation on component mount.

**Files Modified**:
- `client/src/hooks/useProject.ts:82` - Added `refetchOnMount: 'always'`
- `client/src/pages/data-transformation-step.tsx` - Invalidates project query on mount

### Fix JP-4: PII Decisions SSOT ✅ (Hotfix)

**Root Cause**: `analysis-execution.ts` read PII decisions from `project.metadata.piiDecision` which diverged from the SSOT (`journeyProgress.piiDecision`).

**Fix**: Read from `journeyProgress` first, normalize multiple field names (`excludedColumns`, `selectedColumns`, `piiColumnsRemoved`).

**Files Modified**:
- `server/services/analysis-execution.ts:458-463` - Priority: journeyProgress > project.metadata, with field name normalization

### Fix JP-5: Payment Verify-Session Response Mismatch ✅ (Hotfix)

**Root Cause**: Frontend checked `response.paymentStatus === 'paid'` but backend only returned `status` field. Successful payments appeared FAILED.

**Fix**: Added `paymentStatus` field to verify-session response.

**Files Modified**:
- `server/routes/payment.ts:209-215` - Added `paymentStatus: verification.success ? 'paid' : verification.status`

### Recurring Pattern Analysis

The audit identified 8 recurring patterns across all fix plans:

| Pattern | Occurrences | Root Cause |
|---------|-------------|------------|
| SSOT violations | 4 | Multiple data locations, unclear priority |
| Frontend-backend contract mismatch | 3 | Response fields don't match what UI expects |
| Cache staleness | 2 | React Query staleTime too aggressive |
| Mock data leaks | 3 | No production guards on fallback paths |
| Missing production safety | 2 | Dev-only code paths reachable in production |
| Field name inconsistency | 2 | Same concept stored under different keys |
| Circular pricing | 2 | Multiple pricing systems calculating differently |
| Navigation state loss | 2 | Data not persisted before navigation |

**Key Architecture Principle**: `journeyProgress` is the SSOT for all user journey state. All backend services must read from it first, with fallback to legacy locations for backwards compatibility.

---

## Summary

| Priority | Issues | Effort | Status |
|----------|--------|--------|--------|
| P0 Critical | 4 | 3 hours | ✅ Complete |
| P1 High | 3 | 6 hours | ✅ Complete |
| P2 Medium | 3 | 7 hours | ✅ Complete |
| Jan 22 Platform | 5 | 4 hours | ✅ Complete |
| Jan 22 Hotfixes | 2 | 1 hour | ✅ Complete |
| P3 Low | 2 | 6-8 hours | 📋 Planned |
| Agent Overhaul | 1 | 40+ hours | 📋 Planned |

**Recommended Implementation Order**:
1. P0 fixes first (3 hours) - Enables basic data-to-results flow
2. P1 fixes (6 hours) - Adds missing features
3. P2 fixes (7 hours) - Improves coordination
4. P3 + Overhaul - Long-term improvements

---

## Verification Checklist

After implementing fixes, verify:

- [ ] Transformation mappings appear in `dataset.ingestionMetadata.columnMappings`
- [ ] Unpaid projects get 402 response from `/api/analysis-execution/execute`
- [ ] Results endpoint returns `isPreview: true` for unpaid projects
- [ ] PII decisions saved to both `journeyProgress` and `dataset.ingestionMetadata`
- [ ] Decision trail endpoint returns audit data
- [ ] Upload SLA endpoint returns timing metrics
- [ ] Chart generation endpoint creates visualizations
- [ ] Pending checkpoints block step progression
- [ ] Row counts show transformed totals
- [ ] Payment status banner appears on results page

---

## U2A2A2A2U (User→Agent→Agent→Agent→User) Comprehensive Audit

**Audit Date**: January 8, 2026
**Auditor**: Claude Code
**Scope**: Complete flow from user request through agent coordination to user response

---

### Section 1: User Journey Touchpoints Audit

Each journey step should have clear user touchpoints where agents provide value.

| Step | User Touchpoint | Agent(s) Involved | Status |
|------|----------------|-------------------|--------|
| **1. Data Upload** | File selection, PII detection alerts | DE Agent (PII scan) | ✅ Working |
| **2. Prepare** | Goals, questions, audience definition | PM → DS → BA | ✅ Working |
| **3. Verification** | Data quality review, element mapping | DE Agent | ⚠️ Partial (mock scores) |
| **4. Transformation** | Join config, transformation preview | DE Agent | ✅ Working |
| **5. Plan** | Analysis plan review, cost estimate | DS → PM | ✅ Working |
| **6. Execute** | Real-time progress, checkpoints | PM orchestrates all | ✅ Working |
| **7. Billing** | Payment flow, invoice | N/A (Stripe) | ✅ Working |
| **8. Dashboard** | Results, artifacts, downloads | BA (translation) | ✅ Working (Fixed Jan 12) |

---

### Section 2: Stub Implementations Requiring Real Code

**Priority P0 - Critical (Blocking User Features)**:

| Stub | Location | Impact | Fix Effort |
|------|----------|--------|------------|
| `handleWorkflowEvaluator` | `agent-tool-handlers.ts:121-158` | Returns `Math.random()` scores | 2 hours |
| `handleBillingQuery` subscriptions | `agent-tool-handlers.ts:443-496` | Hardcoded mock billing data | 3 hours |
| Progress Reporter artifacts | `agent-tool-handlers.ts:304-307` | Mock artifact list | 1 hour |

**Priority P1 - High (Degraded Experience)**:

| Stub | Location | Impact | Fix Effort |
|------|----------|--------|------------|
| `handleWebResearch` | `agent-tool-handlers.ts:777-826` | TODO: real web scraping | 4 hours |
| `handleIndustryResearch` | `agent-tool-handlers.ts:1078-1140` | TODO: real research | 4 hours |
| `DataScientistToolHandlers` class | `agent-tool-handlers.ts:1649-1761` | Only `handleRequiredDataElements` implemented | 3 hours |

**Priority P2 - Medium (Feature Placeholders)**:

| Stub | Location | Impact | Fix Effort |
|------|----------|--------|------------|
| `SparkToolHandlers` class | `agent-tool-handlers.ts:1766-1816` | All 5 methods are placeholders | 8 hours |
| `TroubleshootingToolHandlers` | `agent-tool-handlers.ts:1821-1846` | 2 placeholder methods | 2 hours |
| `GovernanceToolHandlers` | `agent-tool-handlers.ts:1851-1891` | 3 placeholder methods | 3 hours |
| `HealthCheckToolHandlers` | `agent-tool-handlers.ts:1896-1938` | 3 placeholder methods | 2 hours |

**Code Locations with `Math.random()` (Production Risk)**:

```
server/services/agent-tool-handlers.ts:128    - Workflow scores
server/services/customer-support-agent.ts:945 - Cost estimates
server/services/customer-support-agent.ts:949 - Cost estimates
server/services/data-pipeline-builder.ts:325  - Records extracted
server/services/ml-deployment-monitoring.ts:434 - Prediction confidence
server/services/ml-deployment-monitoring.ts:636 - Drift detection
server/services/enhanced-task-queue.ts:369    - Execution time simulation
server/services/enhanced-task-queue.ts:373    - 5% failure rate simulation
```

---

### Section 3: Duplications for Consolidation

**Billing Services (8 files → should be 1)**:

| File | Purpose | Action |
|------|---------|--------|
| `server/services/billing/unified-billing-service.ts` | **CANONICAL** - Keep | ✅ Keep as SSOT |
| `server/enhanced-billing-service-v2.ts` | Legacy v2 | 🗑️ Delete after migration |
| `server/enhanced-billing-service.ts` | Legacy v1 | 🗑️ Delete after migration |
| `server/enhanced-feature-billing-service.ts` | Feature billing | 🔀 Merge into unified |
| `server/adaptive-billing-service.ts` | Adaptive pricing | 🔀 Merge into unified |
| `server/services/billing-analytics-integration.ts` | Analytics | 🔀 Merge into unified |
| `server/services/mcp-billing-analytics-resource.ts` | MCP resource | Keep (different purpose) |
| `server/services/verification-billing.ts` | Verification | Keep (test utilities) |

**Pricing Services (3 files → should be 1)**:

| File | Action |
|------|--------|
| `server/services/pricing.ts` | ✅ Keep as SSOT |
| `server/services/ml-llm-pricing-service.ts` | 🔀 Merge ML pricing into main |
| `server/services/pricing-data-service.ts` | 🔀 Merge data layer into main |

**Agent Duplications**:

| Pattern | Files | Action |
|---------|-------|--------|
| `.head.ts` variants | `project-manager-agent.head.ts` | 🗑️ Delete - use main only |
| `-v2.ts` variants | `agent-coordination-service-v2.ts` | 🔀 Merge or delete |

**Storage Duplications**:

| File | Purpose | Action |
|------|---------|--------|
| `server/storage.ts` | Main storage | ✅ Keep |
| `server/hybrid-storage.ts` | Hybrid mode | 🔀 Merge into main |
| `server/enhanced-db.ts` | Enhanced queries | 🔀 Merge into main |

---

### Section 4: User Promise Gap Analysis

**What UI Promises vs What Backend Delivers**:

| UI Promise | Page | Backend Reality | Gap |
|-----------|------|----------------|-----|
| "AI analyzes your data quality" | Verification | ✅ Real PII detection, quality scores | None |
| "Smart transformation suggestions" | Transformation | ✅ DE Agent recommendations | None |
| "Cost estimates before execution" | Plan | ⚠️ Fallback estimates used | Minor |
| "Real-time agent activity" | Execute | ✅ WebSocket updates work | None |
| "Business-friendly results" | Dashboard | ✅ BA translation triggered post-analysis | Fixed |
| "Download executive reports" | Dashboard | ⚠️ PPTX is placeholder file | **Gap** |
| "Ask questions about your data" | Dashboard | ❌ Conversational AI not connected | **Gap** |
| "Workflow decision trail" | Dashboard | ⚠️ Endpoint exists, sparse data | Minor |

---

### Section 5: Priority Fix Recommendations

**Immediate Fixes (Before Production)**:

1. **Fix `handleWorkflowEvaluator` random scores** (2 hours)
   ```typescript
   // Replace Math.random() with actual workflow metrics
   const evaluation = await this.evaluateWorkflowFromDB(projectId, evaluationCriteria);
   ```

2. **Fix billing query handlers** (3 hours)
   ```typescript
   // Replace hardcoded data with actual DB queries
   const subscription = await billingService.getUserSubscription(userId);
   ```

3. **Trigger BA translation after analysis** (already in P2 fixes)

**Short-term Fixes (Week 1-2)**:

4. **Consolidate billing services** (4 hours)
   - Keep `unified-billing-service.ts` as SSOT
   - Update all imports to use it
   - Delete legacy files after migration

5. **Implement PPTX generation** (4 hours)
   - Use `pptxgenjs` library (already in package.json)
   - Replace placeholder in `artifact-generator.ts:326-327`

**Medium-term Fixes (Week 3-4)**:

6. **Implement Spark tool handlers** (8 hours)
   - Connect to actual Spark cluster or Python fallback
   - Handle large dataset processing

7. **Add conversational data chat** (8 hours)
   - Wire up "Ask about your data" to AI service
   - Store conversation history

---

### Section 6: Agent Tool Registry Status

**Tool Registration Summary**:

| Category | Registered | Implemented | Placeholder |
|----------|-----------|-------------|-------------|
| PM Tools | 6 | 6 | 0 |
| DS Tools | 4 | 2 | 2 |
| DE Tools | 5 | 4 | 1 |
| BA Tools | 5 | 5 | 0 |
| CS Tools | 5 | 5 | 0 |
| Research Tools | 6 | 4 | 2 |
| Spark Tools | 5 | 0 | 5 |
| Governance | 3 | 0 | 3 |
| Health | 3 | 0 | 3 |
| **Total** | **42** | **26** | **16** |

**Placeholder Tools (38% of total)**:
- All Spark tools need real implementation or removal
- Governance/Health tools are admin features (lower priority)
- DS statistical analysis needs real Python integration

---

### Section 7: Verification Checklist for U2A2A2A2U Completion

After implementing fixes, verify end-to-end flow:

- [ ] User uploads data → DE Agent scans PII → User sees detection results
- [ ] User defines goals → PM coordinates DS/BA → User sees requirements
- [ ] User reviews quality → DE Agent validates → User approves/rejects
- [ ] User configures transforms → DE executes → User sees preview
- [ ] User reviews plan → DS generates steps → User approves with cost
- [ ] User starts execution → PM orchestrates agents → User sees real-time progress
- [ ] User completes payment → System unlocks results → User downloads artifacts
- [ ] User views dashboard → BA translates for audience → User gets business insights

**Console Verification Indicators**:
```
✅ [DE Agent] PII scan complete
✅ [DS Agent] Requirements generated
✅ [BA Agent] Business definitions resolved
✅ [PM Agent] Orchestration workflow complete
✅ [BA Translation] Results formatted for audience
```

---

### Section 8: Recommended Implementation Order

| Week | Focus | Effort | Impact |
|------|-------|--------|--------|
| **1** | Fix random scores + billing stubs | 5 hours | Removes mock data |
| **2** | Consolidate billing services | 4 hours | Reduces confusion |
| **3** | Implement BA translation trigger | 2 hours | Delivers on promise |
| **4** | Real PPTX generation | 4 hours | Better artifacts |
| **5+** | Spark tools (if needed) | 8+ hours | Big data support |

**Total Immediate Priority**: ~15 hours to production-ready state
