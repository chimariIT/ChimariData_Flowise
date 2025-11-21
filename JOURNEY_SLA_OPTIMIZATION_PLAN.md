# Journey Workflow SLA Optimization Plan
## Target: < 1 minute full journey SLA with agent-first approach

**Date**: Current  
**Status**: Planning Phase  
**Priority**: CRITICAL

---

## Executive Summary

The current journey workflow has unrealistic timeline estimates (24 minutes total) and lacks proper resume functionality. This plan addresses:
1. Reducing journey step estimates from minutes to seconds (< 60 seconds total)
2. Implementing agent-first execution with aggressive timeouts (10-15s per step)
3. Prioritizing efficient libraries (Polars/Spark) for high-priority workloads
4. Adding programmatic fallbacks at every step
5. Completing resume journey functionality wiring

---

## Issues Identified

### 1. Timeline Estimates Too High
**Location**: `shared/journey-templates.ts`
- Current: Non-tech template totals 24 minutes (2+2+3+6+4+4+3)
- Target: < 60 seconds total for full journey
- Issue: `estimatedDuration` is in minutes but should be seconds for SLA tracking

### 2. Agent Response Timeouts Too Conservative
**Location**: `server/services/project-manager-agent.ts:272`
- Current: 30 seconds default (`AGENT_RESPONSE_TIMEOUT_MS=30000`)
- Target: 10-15 seconds with immediate fallback
- Impact: Sequential 30s steps would exceed 1 minute SLA

### 3. Tool Selection Not SLA-Aware
**Location**: `server/services/intelligent-data-transformer.ts:214-262`
- Current: Selection based on data size only
- Target: High-priority/SLA workloads should favor Polars/Spark even for smaller datasets
- Missing: SLA category not considered in technology selection

### 4. Resume Journey Not Fully Wired
**Location**: `client/src/utils/journey-routing.ts`, `client/src/components/JourneyLifecycleIndicator.tsx`
- Current: Resume routes defined but may not map to all journey step tabs
- Missing: Proper navigation to project page tabs (Overview, Schema, Datasets, Analysis, Insights, Timeline)
- Issue: Resume Journey button routes may not align with actual step locations

### 5. Missing Programmatic Fallbacks
**Location**: Agent execution paths throughout
- Current: Some fallbacks exist but not consistently applied
- Target: Every step must have deterministic fallback path when agent lags
- Missing: Fallback execution doesn't skip to next step when timeout occurs

---

## Solution Plan

### Phase 1: Reduce Timeline Estimates

#### 1.1 Update Journey Templates (shared/journey-templates.ts)
**Goal**: Convert `estimatedDuration` from minutes to seconds, targeting < 60 seconds total

**Changes**:
- Update `estimatedDuration` in all journey templates to seconds (divide current values by ~60 or set realistic sub-60-second targets)
- Non-tech default template: Reduce from 2+2+3+6+4+4+3 minutes to ~3+2+3+8+3+3+2 seconds (24 seconds total)
- Update `calculateTimeRemaining` in `journey-state-manager.ts` to handle seconds properly

**Files**:
- `shared/journey-templates.ts` - Update all template `estimatedDuration` values
- `server/services/journey-state-manager.ts:93-111` - Update `calculateTimeRemaining` to treat values as seconds

**Target Timeline Per Step**:
- Goal Alignment: 3 seconds (instant user confirmation)
- Schema Detection: 2 seconds (parallel with Polars)
- Data Preparation: 3 seconds (Polars-based cleaning)
- Statistical Analysis: 8 seconds (parallel computation)
- Insight Curation: 3 seconds (template-based)
- Visual Storytelling: 3 seconds (parallel generation)
- Executive Summary: 2 seconds (template assembly)

**Total**: ~24 seconds (well under 60 second SLA)

---

### Phase 2: Implement Agent-First Fast Execution

#### 2.1 Reduce Agent Response Timeouts
**Location**: `server/services/project-manager-agent.ts:271-272`

**Changes**:
```typescript
// Change from 30000ms (30s) to 10000ms (10s) with aggressive fallback
const parsedTimeout = Number(process.env.AGENT_RESPONSE_TIMEOUT_MS);
this.agentResponseTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 
  ? parsedTimeout 
  : 10000; // Reduced from 30000 to 10000
```

**Environment Variable**:
- Default: 10 seconds
- Allow override via `AGENT_RESPONSE_TIMEOUT_MS` for testing
- Production: Set to 10s for < 1 minute SLA

#### 2.2 Implement Parallel Agent Execution with Timeouts
**Location**: `server/services/project-manager-agent.ts:2743-2774`

**Changes**:
- Add Promise.race with timeout for each agent query
- If timeout occurs, immediately execute fallback path
- Fallback should use direct execution (skip broker) with cached/simplified results

**Pattern**:
```typescript
const [dataEngineerOpinion, dataScientistOpinion, businessAgentOpinion] = await Promise.all([
  this.queryDataEngineerWithTimeout(projectId, uploadedData, 10000), // 10s timeout
  this.queryDataScientistWithTimeout(projectId, uploadedData, safeGoals, 10000),
  this.queryBusinessAgentWithTimeout(projectId, uploadedData, safeGoals, industry, 10000)
]);
```

#### 2.3 Add Timeout-Based Fallback Methods
**Location**: `server/services/project-manager-agent.ts`

**New Methods**:
- `queryDataEngineerWithTimeout()` - Wraps queryDataEngineer with Promise.race timeout
- `queryDataScientistWithTimeout()` - Wraps queryDataScientist with Promise.race timeout
- `queryBusinessAgentWithTimeout()` - Wraps queryBusinessAgent with Promise.race timeout

**Fallback Behavior**:
- If timeout: Return simplified/cached opinion with confidence=0.7
- Continue with synthesis using available opinions (don't block on single agent)

---

### Phase 3: Optimize Tool Selection for SLA

#### 3.1 Update Technology Selection Logic
**Location**: `server/services/intelligent-data-transformer.ts:214-262`

**Changes**:
- Add `slaCategory` parameter to `selectTechnology()`
- For `slaCategory === 'critical' || 'high'`:
  - Prefer Polars/Spark even for smaller datasets (reduce thresholds)
  - Skip JavaScript fallback for speed-critical operations
  - Favor multi-threaded engines (Polars > Pandas)

**New Method Signature**:
```typescript
private selectTechnology(
  rowCount: number,
  operation: TransformationOperation,
  hint?: 'speed' | 'memory' | 'balanced',
  slaCategory?: 'critical' | 'high' | 'standard' // NEW
): 'javascript' | 'polars' | 'pandas' | 'spark'
```

**SLA-Aware Selection Logic**:
```typescript
// High-priority workloads: Aggressively favor fast engines
if (slaCategory === 'critical' || slaCategory === 'high') {
  // For critical SLA, prefer Polars/Spark even for medium datasets
  if (rowCount < MEDIUM_DATASET_THRESHOLD) {
    return sparkAvailable && sparkPreferredOps.includes(operation) 
      ? 'spark' 
      : 'polars'; // Skip JavaScript for speed
  }
  return sparkAvailable ? 'spark' : 'polars';
}
```

#### 3.2 Update Data Engineer Agent to Pass SLA Category
**Location**: `server/services/data-engineer-agent.ts:500-501`

**Changes**:
- Pass `slaCategory` to `recommendTechnology()` calls
- Ensure SLA category derived from task priority/context is propagated

---

### Phase 4: Complete Resume Journey Functionality

#### 4.1 Verify Journey Step Route Mapping
**Location**: `client/src/utils/journey-routing.ts:91-110`

**Issue**: Resume routes map to legacy routes, but project page uses tab-based navigation

**Changes**:
- Update step routes to use project page tabs: `?tab=overview&step=...`
- Verify all journey template steps have corresponding routes
- Add routes for business/technical journey templates

**Updated Step Routes**:
```typescript
const stepRoutes: Record<string, string> = {
  // Non-tech journey steps → project tabs
  'intake_alignment': `${baseProjectRoute}?resume=true&tab=overview&step=intake_alignment`,
  'auto_schema_detection': `${baseProjectRoute}?resume=true&tab=schema&step=auto_schema_detection`,
  'data_preparation': `${baseProjectRoute}?resume=true&tab=datasets&step=data_preparation`,
  'guided_analysis': `${baseProjectRoute}?resume=true&tab=analysis&step=guided_analysis`,
  'insight_curation': `${baseProjectRoute}?resume=true&tab=insights&step=insight_curation`,
  'visual_storytelling': `${baseProjectRoute}?resume=true&tab=visualizations&step=visual_storytelling`,
  'executive_hand_off': `${baseProjectRoute}?resume=true&tab=overview&step=executive_hand_off`,
  
  // Business journey steps (add missing routes)
  'industry_context': `${baseProjectRoute}?resume=true&tab=overview&step=industry_context`,
  'data_health_check': `${baseProjectRoute}?resume=true&tab=schema&step=data_health_check`,
  // ... add all business/technical journey steps
};
```

#### 4.2 Wire Resume Flag to Project Page Tabs
**Location**: `client/src/pages/project-page.tsx`

**Changes**:
- Check URL params for `resume=true` and `step=...`
- Automatically navigate to appropriate tab on page load
- Show resume banner/indicator when resuming

#### 4.3 Complete Journey Step Completion Wiring
**Location**: `server/routes/project.ts:2520-2552`

**Verify**:
- `POST /:projectId/journey/complete-step` properly updates journey progress
- Journey state updates reflect completed steps
- Resume functionality respects completed steps

---

### Phase 5: Implement Programmatic Step Fallbacks

#### 5.1 Add Step-Level Fallback Logic
**Location**: `server/services/project-manager-agent.ts` (coordinateGoalAnalysis)

**Pattern**: Each journey step should have:
1. **Primary Path**: Agent execution with timeout (10s)
2. **Fallback Path**: Simplified/cached execution if timeout
3. **Emergency Path**: Skip step if fallback fails (mark with low confidence)

**Implementation**:
```typescript
async executeStepWithFallback(
  stepId: string,
  stepConfig: JourneyStepConfig,
  projectId: string,
  data: any
): Promise<StepResult> {
  const timeout = 10000; // 10 seconds
  const startTime = Date.now();
  
  try {
    // Primary: Agent execution with timeout
    const result = await Promise.race([
      this.executeStepViaAgent(stepId, stepConfig, projectId, data),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Step timeout')), timeout)
      )
    ]);
    return result;
  } catch (error) {
    // Fallback: Simplified execution
    console.warn(`Step ${stepId} timeout, using fallback`);
    return await this.executeStepFallback(stepId, stepConfig, projectId, data);
  }
}
```

#### 5.2 Implement Simplified Step Executions
**Location**: `server/services/project-manager-agent.ts`

**For Each Step Type**:
- **Schema Detection**: Use cached/predicted schema if agent timeout
- **Data Preparation**: Apply basic cleaning only (skip complex transformations)
- **Analysis**: Return sample/computed results if agent timeout
- **Visualization**: Use template-based charts if agent timeout

---

### Phase 6: Optimize Agent Execution Patterns

#### 6.1 Parallel Agent Coordination
**Location**: `server/services/project-manager-agent.ts:2743-2774`

**Current**: Sequential agent queries
**Target**: Parallel execution with independent timeouts

**Implementation**:
- All three agents query in parallel (already done)
- Each agent has independent 10s timeout
- Synthesis proceeds with available opinions (don't wait for all)

#### 6.2 Pre-compute Common Operations
**Location**: Agent initialization and caching

**Optimizations**:
- Cache schema detection results
- Pre-compute common transformations
- Store template-based analysis results

---

## Implementation Priority

### Critical (Blocking < 1 minute SLA)
1. ✅ Reduce timeline estimates to seconds
2. ✅ Reduce agent timeouts to 10s
3. ✅ Implement step-level fallbacks
4. ✅ Prioritize Polars/Spark for high-priority workloads

### High (Required for Resume Functionality)
5. ✅ Wire resume journey routes to project tabs
6. ✅ Verify journey step completion API

### Medium (Performance Optimization)
7. ✅ Parallel agent execution optimization
8. ✅ Pre-computation caching

---

## Testing Plan

### SLA Performance Tests
1. **Full Journey Execution**: Measure end-to-end time
   - Target: < 60 seconds from start to artifacts
   - Test with various data sizes (small, medium, large)
   - Verify fallbacks trigger correctly on timeouts

2. **Resume Journey Tests**
   - Start journey, pause at step 2
   - Resume and verify navigation to correct tab
   - Verify step completion updates journey state

3. **Agent Timeout Tests**
   - Simulate slow agent responses
   - Verify fallback execution triggers
   - Verify journey continues despite agent timeout

### Tool Selection Tests
- Verify Polars selected for medium datasets when SLA=critical
- Verify Spark selected for large datasets
- Verify JavaScript selected for small datasets (non-critical)

---

## Files to Modify

### Backend
- `server/services/project-manager-agent.ts` - Timeout reduction, fallback methods
- `server/services/intelligent-data-transformer.ts` - SLA-aware technology selection
- `server/services/data-engineer-agent.ts` - Pass SLA category to transformer
- `server/services/journey-state-manager.ts` - Timeline calculation (seconds)
- `shared/journey-templates.ts` - Reduce estimatedDuration to seconds

### Frontend
- `client/src/utils/journey-routing.ts` - Complete resume route mapping
- `client/src/pages/project-page.tsx` - Wire resume flag to tabs
- `client/src/components/JourneyLifecycleIndicator.tsx` - Verify resume button

### Configuration
- `.env.example` - Document `AGENT_RESPONSE_TIMEOUT_MS=10000`

---

## Success Metrics

1. **SLA Achievement**: Full journey completes in < 60 seconds
2. **Resume Functionality**: All journey steps can be resumed from correct tabs
3. **Fallback Reliability**: 100% of timeouts trigger fallbacks (no blocking)
4. **Tool Efficiency**: > 80% of operations use Polars/Spark for high-priority workloads

---

## Notes

- Timeline estimates are for user communication only; actual execution should be faster
- Agent timeouts should be aggressive to meet SLA; fallbacks ensure completion
- Tool selection prioritizes speed (Polars/Spark) over flexibility for critical workloads
- Resume functionality should work seamlessly across all journey types and steps

