# Multi-Agent Coordination Implementation Plan

**Date**: October 15, 2025  
**Status**: Ready for Implementation  
**Estimated Time**: 8-12 hours

---

## Pre-Implementation Review: What Already Exists

### ✅ Existing Infrastructure (Don't Rebuild)

1. **Message Broker** (`server/services/agents/message-broker.ts`)
   - ✅ `sendAndWait()` - Request/response pattern
   - ✅ `sendCheckpoint()` - Checkpoint communication
   - ✅ `submitCheckpointResponse()` - User feedback handling

2. **Agent Registry** (`server/services/agent-registry.ts`)
   - ✅ `AgentHandler` interface with `execute()` method
   - ✅ Task routing and capability matching

3. **Existing Agent Methods**:
   - **TechnicalAIAgent**: `processTask()`, `preprocessData()`, `performStatisticalAnalysis()`, `engineerFeatures()`, `trainModel()`, `generateVisualizations()`
   - **BusinessAgent**: `processTask()`, `extractGoals()`, `suggestDataEnrichment()`, `validateRegulatoryCompliance()`
   - **DataEngineerAgent**: `execute()` with `handleUserCommunication()`, `handlePipelineRequest()`, `handleDataCleaning()`
   - **DataScientistAgent**: `execute()` with `performStatisticalAnalysis()`, `developMLModel()`, various analysis methods

4. **File Processor** (`server/services/file-processor.ts`)
   - ✅ `calculateQualityMetrics()` - Data quality assessment ALREADY EXISTS
   - ✅ `detectSchema()` - Schema detection
   - ✅ `detectRelationships()` - Relationship detection

5. **Project Agent Orchestrator** (`server/services/project-agent-orchestrator.ts`)
   - ✅ `initializeProjectAgents()` - Journey-specific setup
   - ✅ `handleCheckpointFeedback()` - User approval workflow
   - ✅ `getProjectCheckpoints()` - Checkpoint retrieval

6. **UI Components**
   - ✅ `AgentCheckpoints` component with real-time polling

---

## Implementation Strategy: Add Only What's Missing

### Sprint 1: Agent Consultation Methods (4-5 hours)

#### 1.1 Data Engineer Agent (1.5 hours)
**File**: `server/services/data-engineer-agent.ts`

**Add Methods** (use existing data quality from file-processor):
```typescript
// Quick data quality consultation (doesn't execute pipeline)
async assessDataQuality(data: any[], schema: any): Promise<DataQualityReport>

// Suggest transformations for missing columns  
async suggestTransformations(
  missingColumns: string[], 
  availableColumns: string[], 
  goals: string[]
): Promise<TransformationOptions>

// Estimate processing time
async estimateDataProcessingTime(
  dataSize: number, 
  complexity: string
): Promise<TimeEstimate>
```

**Integration Point**: Reuse `FileProcessor.calculateQualityMetrics()` in `assessDataQuality()`

#### 1.2 Data Scientist Agent (1.5 hours)
**File**: `server/services/data-scientist-agent.ts`

**Add Methods**:
```typescript
// Check if analysis is feasible with current data
async checkFeasibility(
  goals: string[], 
  dataSchema: any, 
  dataQuality: any
): Promise<FeasibilityReport>

// Validate proposed methodology
async validateMethodology(
  analysisParams: any, 
  dataCharacteristics: any
): Promise<ValidationResult>

// Estimate confidence for analysis type
async estimateConfidence(
  analysisType: string, 
  dataQuality: any
): Promise<ConfidenceScore>
```

**Integration Point**: Use existing analysis logic but return quick assessments without full execution

#### 1.3 Business Agent (1-2 hours)
**File**: `server/services/business-agent.ts`

**Add Methods**:
```typescript
// Assess business impact of proposed approach
async assessBusinessImpact(
  goals: string[], 
  proposedApproach: any, 
  industry: string
): Promise<BusinessImpactReport>

// Suggest business-relevant metrics
async suggestBusinessMetrics(
  industry: string, 
  goals: string[]
): Promise<MetricRecommendations>

// Validate alignment with business goals
async validateBusinessAlignment(
  technicalApproach: any, 
  businessGoals: string[]
): Promise<AlignmentScore>
```

**Integration Point**: Extend existing `suggestDataEnrichment()` and `extractGoals()` logic

---

### Sprint 2: PM Multi-Agent Coordination (3-4 hours)

#### 2.1 ProjectManagerAgent Methods (2 hours)
**File**: `server/services/project-manager-agent.ts`

**Add Methods**:
```typescript
// Coordinate goal analysis with all three agents
async coordinateGoalAnalysis(
  projectId: string,
  userDescription: string,
  data: any[],
  schema: any
): Promise<MultiAgentCheckpoint>

// Coordinate data validation
async coordinateDataValidation(
  projectId: string,
  data: any[],
  schema: any,
  goals: string[]
): Promise<MultiAgentCheckpoint>

// Synthesize expert opinions into unified recommendation
private synthesizeExpertOpinions(
  opinions: ExpertOpinion[]
): SynthesizedOpinion

// Build unified recommendation from multiple opinions
private buildUnifiedRecommendation(
  opinions: ExpertOpinion[]
): string
```

**Key Pattern**: Use `messageBroker.sendAndWait()` with `Promise.all()` for parallel agent queries

#### 2.2 Journey Integration (1-2 hours)
**Files**: 
- `server/routes/project.ts` (upload endpoint)
- `client/src/pages/data-step.tsx`
- `client/src/pages/execute-step.tsx`

**Changes**:
```typescript
// After file upload processing in routes/project.ts
const checkpoint = await projectManagerAgent.coordinateGoalAnalysis(
  project.id,
  project.description,
  parsedData,
  detectedSchema
);
await messageBroker.sendCheckpoint(checkpoint);
```

```tsx
// In data-step.tsx and execute-step.tsx
import AgentCheckpoints from "@/components/agent-checkpoints";

{projectId && (
  <div className="mt-8">
    <AgentCheckpoints projectId={projectId} />
  </div>
)}
```

---

### Sprint 3: Multi-Agent UI Components (1-3 hours)

#### 3.1 MultiAgentCheckpoint Component (1.5 hours)
**File**: `client/src/components/multi-agent-checkpoint.tsx` (NEW)

**Components**:
```tsx
<MultiAgentCheckpoint>
  <ExpertOpinions>
    <ExpertOpinionCard agent="Data Engineer" confidence={0.85} />
    <ExpertOpinionCard agent="Data Scientist" confidence={0.90} />
    <ExpertOpinionCard agent="Business Agent" confidence={0.95} />
  </ExpertOpinions>
  <PMRecommendation synthesizedFrom={3} consensus="high" />
  <UserActions>
    <Button>Approve All</Button>
    <Button>Customize</Button>
    <Button>Ask Questions</Button>
  </UserActions>
</MultiAgentCheckpoint>
```

#### 3.2 Update AgentCheckpoints (0.5 hours)
**File**: `client/src/components/agent-checkpoints.tsx`

**Changes**:
```tsx
// Detect multi-agent checkpoints and render accordingly
{checkpoint.data?.expertOpinions ? (
  <MultiAgentCheckpoint checkpoint={checkpoint} onResponse={handleFeedback} />
) : (
  <SingleAgentCheckpoint checkpoint={checkpoint} onResponse={handleFeedback} />
)}
```

---

## Detailed Implementation Steps

### Phase 1: Data Engineer Consultation Methods

**Step 1.1**: Add interfaces at top of `data-engineer-agent.ts`
```typescript
export interface DataQualityReport {
  overallScore: number;
  completeness: number;
  issues: Array<{
    type: 'missing_values' | 'outliers' | 'inconsistencies' | 'duplicates';
    severity: 'high' | 'medium' | 'low';
    affected: string[];
    count: number;
  }>;
  recommendations: string[];
  confidence: number;
  estimatedFixTime: string;
}

export interface TransformationOptions {
  transformations: Array<{
    targetColumn: string;
    method: string;
    sourceColumns: string[];
    confidence: number;
    businessValue: 'high' | 'medium' | 'low';
    description: string;
  }>;
  reasoning: string;
}

export interface TimeEstimate {
  estimatedMinutes: number;
  confidence: number;
  factors: string[];
}
```

**Step 1.2**: Add methods to DataEngineerAgent class
```typescript
async assessDataQuality(data: any[], schema: any): Promise<DataQualityReport> {
  // Reuse FileProcessor.calculateQualityMetrics()
  const { FileProcessor } = await import('./file-processor');
  const metrics = FileProcessor['calculateQualityMetrics'](data, schema);
  
  // Analyze issues
  const issues = [];
  for (const [col, colSchema] of Object.entries(schema)) {
    if (colSchema.missingPercentage > 10) {
      issues.push({
        type: 'missing_values',
        severity: colSchema.missingPercentage > 50 ? 'high' : 'medium',
        affected: [col],
        count: colSchema.missingCount
      });
    }
  }
  
  // Generate recommendations
  const recommendations = [];
  if (metrics.duplicateRows > 0) {
    recommendations.push(`Remove ${metrics.duplicateRows} duplicate rows`);
  }
  if (metrics.completeness < 0.95) {
    recommendations.push('Address missing values before analysis');
  }
  
  return {
    overallScore: metrics.dataQualityScore,
    completeness: metrics.completeness,
    issues,
    recommendations,
    confidence: 0.85,
    estimatedFixTime: issues.length > 5 ? '15-20 minutes' : '5-10 minutes'
  };
}

async suggestTransformations(
  missingColumns: string[], 
  availableColumns: string[], 
  goals: string[]
): Promise<TransformationOptions> {
  const transformations = [];
  
  // Example: Suggest RFM for missing 'segment' column
  if (missingColumns.includes('segment') || missingColumns.includes('customer_segment')) {
    const hasFrequency = availableColumns.some(c => c.includes('frequency') || c.includes('purchase_count'));
    const hasMonetary = availableColumns.some(c => c.includes('amount') || c.includes('revenue') || c.includes('value'));
    
    if (hasFrequency && hasMonetary) {
      transformations.push({
        targetColumn: 'segment',
        method: 'rfm_analysis',
        sourceColumns: availableColumns.filter(c => 
          c.includes('frequency') || c.includes('amount') || c.includes('revenue')
        ),
        confidence: 0.85,
        businessValue: 'high',
        description: 'Create customer segments using RFM (Recency, Frequency, Monetary) analysis'
      });
    }
  }
  
  return {
    transformations,
    reasoning: transformations.length > 0 
      ? 'RFM analysis is industry-standard for customer segmentation in retail'
      : 'No viable transformations found with available columns'
  };
}

async estimateDataProcessingTime(
  dataSize: number, 
  complexity: string
): Promise<TimeEstimate> {
  const baseTime = Math.ceil(dataSize / 10000); // 1 min per 10k rows
  const complexityMultiplier = 
    complexity === 'high' ? 3 : 
    complexity === 'medium' ? 2 : 1;
  
  return {
    estimatedMinutes: baseTime * complexityMultiplier,
    confidence: 0.75,
    factors: [
      `${dataSize.toLocaleString()} rows`,
      `${complexity} complexity transformations`,
      'Server load dependent'
    ]
  };
}
```

**Step 1.3**: Update execute() to handle new task types
```typescript
async execute(task: AgentTask): Promise<AgentResult> {
  // ... existing code ...
  
  switch (task.type) {
    // ... existing cases ...
    
    case 'assess_data_quality':
      const qualityReport = await this.assessDataQuality(task.payload.data, task.payload.schema);
      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'success',
        result: qualityReport,
        metrics: { duration: Date.now() - startTime, resourcesUsed: ['compute'], tokensConsumed: 0 },
        completedAt: new Date()
      };
    
    case 'suggest_transformations':
      const transformOptions = await this.suggestTransformations(
        task.payload.missingColumns, 
        task.payload.availableColumns, 
        task.payload.goals
      );
      return {
        taskId: task.id,
        agentId: 'data_engineer',
        status: 'success',
        result: transformOptions,
        metrics: { duration: Date.now() - startTime, resourcesUsed: ['compute'], tokensConsumed: 0 },
        completedAt: new Date()
      };
    
    // ... rest ...
  }
}
```

---

### Phase 2: Data Scientist Consultation Methods

**Similar pattern** - Add interfaces, add methods, update execute()

---

### Phase 3: Business Agent Consultation Methods

**Similar pattern** - Add interfaces, add methods, update processTask()

---

### Phase 4: PM Multi-Agent Coordination

**Key implementation in ProjectManagerAgent**:
```typescript
async coordinateGoalAnalysis(
  projectId: string,
  userDescription: string,
  data: any[],
  schema: any
): Promise<any> {
  console.log(`🤖 PM: Coordinating goal analysis for project ${projectId}`);
  
  // Get project details
  const project = await storage.getProject(projectId);
  
  // Query all three agents in parallel using message broker
  const [businessGoals, dataQuality, feasibility] = await Promise.all([
    this.messageBroker.sendAndWait({
      from: 'project_manager',
      to: 'business_agent',
      type: 'task',
      payload: { 
        type: 'extract_goals', 
        userDescription, 
        journeyType: project.journeyType,
        context: { industry: 'retail' } // TODO: extract from project
      }
    }, 30000),
    
    this.messageBroker.sendAndWait({
      from: 'project_manager',
      to: 'data_engineer',
      type: 'task',
      payload: { 
        type: 'assess_data_quality', 
        data, 
        schema 
      }
    }, 30000),
    
    this.messageBroker.sendAndWait({
      from: 'project_manager',
      to: 'data_scientist',
      type: 'task',
      payload: { 
        type: 'check_feasibility', 
        goals: [], // Will be filled after businessGoals returns
        dataSchema: schema
      }
    }, 30000)
  ]);
  
  // Synthesize opinions
  const synthesized = this.synthesizeExpertOpinions([
    { agent: 'Business Agent', opinion: businessGoals.result, confidence: 0.90 },
    { agent: 'Data Engineer', opinion: dataQuality.result, confidence: 0.85 },
    { agent: 'Data Scientist', opinion: feasibility.result, confidence: 0.88 }
  ]);
  
  // Create multi-agent checkpoint
  return {
    id: `checkpoint_${Date.now()}_multi`,
    projectId,
    agentType: 'project_manager',
    stepName: 'goal_analysis',
    status: 'waiting_approval',
    message: synthesized.pmSummary,
    data: {
      expertOpinions: synthesized.opinions,
      recommendation: synthesized.recommendation,
      consensus: synthesized.consensus
    },
    requiresUserInput: true,
    timestamp: new Date()
  };
}
```

---

## Testing Checklist

### Unit Tests
- [ ] Data Engineer: `assessDataQuality()` returns quality report
- [ ] Data Engineer: `suggestTransformations()` suggests RFM for missing segment
- [ ] Data Scientist: `checkFeasibility()` validates analysis requirements
- [ ] Business Agent: `assessBusinessImpact()` evaluates business value
- [ ] PM Agent: `coordinateGoalAnalysis()` queries all three agents
- [ ] PM Agent: `synthesizeExpertOpinions()` combines opinions correctly

### Integration Tests
- [ ] Message broker routes tasks to correct agents
- [ ] Agents respond within timeout (30s)
- [ ] Checkpoints created with multi-agent data structure
- [ ] User feedback updates checkpoint status

### E2E Tests
- [ ] Upload file → Multi-agent checkpoint appears
- [ ] Checkpoint shows three expert opinion cards
- [ ] User can approve/reject with feedback
- [ ] Approved checkpoint triggers next workflow step

---

## Files Modified Summary

### Backend (Server)
1. `server/services/data-engineer-agent.ts` - Add 3 consultation methods
2. `server/services/data-scientist-agent.ts` - Add 3 consultation methods
3. `server/services/business-agent.ts` - Add 3 consultation methods
4. `server/services/project-manager-agent.ts` - Add 2 coordination methods
5. `server/routes/project.ts` - Trigger checkpoints after upload

### Frontend (Client)
6. `client/src/components/multi-agent-checkpoint.tsx` - NEW component
7. `client/src/components/agent-checkpoints.tsx` - Detect multi-agent checkpoints
8. `client/src/pages/data-step.tsx` - Add AgentCheckpoints component
9. `client/src/pages/execute-step.tsx` - Add AgentCheckpoints component

---

## Success Criteria

✅ **Sprint 1 Complete**: All three agents have consultation methods  
✅ **Sprint 2 Complete**: PM coordinates agents, checkpoints trigger on upload  
✅ **Sprint 3 Complete**: UI displays three expert opinions + PM recommendation  
✅ **Testing Complete**: All tests pass, E2E flow works end-to-end  

---

**Implementation Start**: Ready to begin  
**Expected Completion**: 8-12 hours  
**Status**: Proceeding with careful review before each addition
