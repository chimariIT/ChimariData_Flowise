# ChimariData Platform - Targeted Refactoring Implementation Plan

**Approach**: Option B - Targeted Refactoring  
**Timeline**: 4-6 weeks  
**Goal**: Production-ready platform meeting 1-5 minute SLA with full traceability

---

## Executive Summary

This plan addresses **8 critical issues from manual testing** plus **6 architectural gaps** through targeted refactoring of 4 core subsystems:

1. **Question-to-Answer Pipeline** - Stable question IDs, full traceability
2. **Data Flow Consolidation** - Single source of truth for transformed data
3. **Agent Coordination** - Database-first checkpoints, reliable state management
4. **Performance Optimization** - Meet 1-5 minute SLA

**Success Metrics**:
- ✅ End-to-end journey completes in <5 minutes (90th percentile)
- ✅ Zero API polling storms (currently 100+ requests/min)
- ✅ Questions load from database 100% of time
- ✅ PII removed from all previews and analysis
- ✅ Payment processing works end-to-end
- ✅ AI-generated answers display (no keyword fallback)

---

## Phase 1: Critical Fixes (Week 1)

**Goal**: Unblock user journey testing by fixing P0 issues

### Day 1: API Polling Storm + Session Cleanup

#### Issue #1: API Polling Storm (100+ requests/min)

**Files to Change**:

##### [MODIFY] [prepare-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/prepare-step.tsx)

**Problem**: Infinite re-render loop causing 100+ API calls/minute

**Fix**:
```typescript
// Add dependency tracking to prevent infinite loops
useEffect(() => {
  // Only fetch when projectId changes, not on every render
  if (projectId && !isLoadingRef.current) {
    isLoadingRef.current = true;
    loadProjectData(projectId).finally(() => {
      isLoadingRef.current = false;
    });
  }
}, [projectId]); // Only depend on projectId, not derived state
```

**Verification**:
- [ ] Console shows <10 API calls during prepare step
- [ ] Network tab shows no repeated identical requests

---

#### Issue #6: Session Data Not Cleared

**Files to Change**:

##### [MODIFY] [prepare-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/prepare-step.tsx)

**Problem**: Old questions auto-populate when starting new journey

**Fix**:
```typescript
// Clear session data when starting new journey
useEffect(() => {
  if (!projectId) {
    // New journey - clear all session data
    localStorage.removeItem('analysisGoal');
    localStorage.removeItem('businessQuestions');
    sessionStorage.clear();
    console.log('🧹 Cleared ALL session data for new journey');
  }
}, [projectId]);
```

**Verification**:
- [ ] New journey shows empty goals/questions fields
- [ ] No data from previous projects appears

---

### Day 2: Questions Not Loading From Database

#### Issue #2: Questions Not Loading (Logic Error)

**Files to Change**:

##### [MODIFY] [execute-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/execute-step.tsx)

**Problem**: Console shows "Loaded 4 questions" then "No questions in DB, falling back to localStorage"

**Root Cause** (likely):
```typescript
// BEFORE (broken logic)
const dbQuestions = await api.get(`/api/projects/${projectId}/questions`);
console.log(`✅ [Execute] Loaded ${dbQuestions.length} questions from database`);
if (!dbQuestions || dbQuestions.length === 0) {  // ❌ Wrong check!
  console.log(`⚠️ [Execute] No questions in DB, falling back to localStorage`);
}
```

**Fix**:
```typescript
// AFTER (correct logic)
const response = await api.get(`/api/projects/${projectId}/questions`);
const dbQuestions = response.questions || []; // Extract array from response
console.log(`✅ [Execute] Loaded ${dbQuestions.length} questions from database`);

if (dbQuestions.length === 0) {
  console.log(`⚠️ [Execute] No questions in DB, falling back to localStorage`);
  // Fallback logic
} else {
  console.log(`✅ [Execute] Using ${dbQuestions.length} questions from database`);
  setQuestions(dbQuestions);
}
```

**Verification**:
- [ ] Console shows "Using X questions from database"
- [ ] No fallback to localStorage when questions exist
- [ ] Questions from prepare step appear in execute step

---

### Day 3: PII Not Removed From Previews

#### Issue #4: PII Not Removed From Previews

**Files to Change**:

##### [MODIFY] [data-verification-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/data-verification-step.tsx)

**Problem**: PII decision saved but preview still shows excluded columns

**Fix**:
```typescript
// After saving PII decision, filter preview data immediately
const handlePIIDecisionSave = async (decision) => {
  // Save to backend (already working)
  await api.put(`/api/projects/${projectId}`, { metadata: { piiDecision, excludedColumns } });
  
  // NEW: Filter preview data immediately
  const filteredPreview = datasets.map(dataset => ({
    ...dataset,
    preview: dataset.preview.map(row => {
      const filtered = { ...row };
      excludedColumns.forEach(col => delete filtered[col]);
      return filtered;
    }),
    schema: dataset.schema.filter(col => !excludedColumns.includes(col.name))
  }));
  
  setDatasets(filteredPreview);
  console.log(`🔒 [PII] Filtered ${excludedColumns.length} columns from preview`);
};
```

**Verification**:
- [ ] Excluded PII columns disappear from preview table immediately
- [ ] Schema updates to reflect excluded columns
- [ ] Data quality metrics recalculate without PII columns

---

##### [MODIFY] [analysis-execution.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/analysis-execution.ts)

**Problem**: Analysis uses original data with PII when no transformed data exists

**Fix**:
```typescript
// BEFORE (broken)
const candidates = [
  { name: 'data', value: dataset.data },        // ❌ Has PII
  { name: 'preview', value: dataset.preview },  // ❌ Has PII
];

// AFTER (correct)
function filterPIIColumns(data: any[], excludedColumns: string[]): any[] {
  if (!excludedColumns || excludedColumns.length === 0) return data;
  return data.map(row => {
    const filtered = { ...row };
    excludedColumns.forEach(col => delete filtered[col]);
    return filtered;
  });
}

const excludedColumns = project.metadata?.excludedColumns || [];
const candidates = [
  { name: 'transformedData', value: dataset.ingestionMetadata?.transformedData },
  { name: 'data', value: filterPIIColumns(dataset.data, excludedColumns) },
  { name: 'preview', value: filterPIIColumns(dataset.preview, excludedColumns) },
];
```

**Verification**:
- [ ] Analysis results never contain excluded PII columns
- [ ] Audit log shows PII filtering applied
- [ ] Works for both transformed and original data

---

### Day 4-5: Payment Processing

#### Issue #5: Payment Processing Failing

**Files to Change**:

##### [MODIFY] [pricing-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/pricing-step.tsx)

**Investigation Required**: Need to check Stripe integration

**Fix** (depends on findings):
```typescript
// Add error handling and logging
const handlePayment = async () => {
  try {
    console.log('💳 [Payment] Starting payment process...');
    const response = await api.post(`/api/payment/create-intent`, {
      projectId,
      amount: estimatedCost,
    });
    console.log('💳 [Payment] Intent created:', response.clientSecret);
    
    // Stripe payment UI
    const { error } = await stripe.confirmPayment({
      clientSecret: response.clientSecret,
      confirmParams: { return_url: `${window.location.origin}/projects/${projectId}/results` }
    });
    
    if (error) {
      console.error('❌ [Payment] Failed:', error);
      setPaymentError(error.message);
    } else {
      console.log('✅ [Payment] Success!');
    }
  } catch (err) {
    console.error('❌ [Payment] Exception:', err);
    setPaymentError(err.message);
  }
};
```

**Verification**:
- [ ] Payment intent creates successfully
- [ ] Stripe UI displays
- [ ] Payment completes and redirects to results
- [ ] Error messages display when payment fails

---

## Phase 2: Data Flow Consolidation (Week 2)

**Goal**: Single source of truth for all data entities

### Week 2, Day 1-2: Transformed Data Consolidation

**Problem**: 8 different locations for transformed data

**Solution**: Use `dataset.ingestionMetadata.transformedData` as single source

#### Database Migration

##### [NEW] [0025_consolidate_transformed_data.sql](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/db/migrations/0025_consolidate_transformed_data.sql)

```sql
-- Add version tracking for transformed data
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS transformed_data_version INTEGER DEFAULT 0;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS active_data_source VARCHAR(20) DEFAULT 'original';

-- Migrate existing transformed data to ingestionMetadata
UPDATE datasets
SET ingestion_metadata = jsonb_set(
  COALESCE(ingestion_metadata, '{}'::jsonb),
  '{transformedData}',
  COALESCE(metadata->'transformedData', '[]'::jsonb)
)
WHERE metadata ? 'transformedData';

-- Clear old locations
UPDATE datasets
SET metadata = metadata - 'transformedData'
WHERE metadata ? 'transformedData';
```

---

#### Service Layer

##### [NEW] [data-accessor-service.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/data-accessor-service.ts)

```typescript
/**
 * Single source of truth for accessing dataset data
 */
export class DataAccessorService {
  /**
   * Get data for analysis - respects PII exclusions and transformation state
   */
  static getAnalysisData(dataset: Dataset, project: Project): any[] {
    const excludedColumns = project.metadata?.excludedColumns || [];
    
    // Priority 1: Transformed data (user-approved)
    if (dataset.ingestionMetadata?.transformedData) {
      return this.filterPII(dataset.ingestionMetadata.transformedData, excludedColumns);
    }
    
    // Priority 2: Original data (with PII filtering)
    return this.filterPII(dataset.data, excludedColumns);
  }
  
  /**
   * Get schema for UI display
   */
  static getSchema(dataset: Dataset, project: Project): ColumnSchema[] {
    const excludedColumns = project.metadata?.excludedColumns || [];
    
    const schema = dataset.ingestionMetadata?.transformedData
      ? dataset.ingestionMetadata.transformedSchema
      : dataset.schema;
    
    return schema.filter(col => !excludedColumns.includes(col.name));
  }
  
  private static filterPII(data: any[], excludedColumns: string[]): any[] {
    if (!excludedColumns.length) return data;
    return data.map(row => {
      const filtered = { ...row };
      excludedColumns.forEach(col => delete filtered[col]);
      return filtered;
    });
  }
}
```

---

### Week 2, Day 3-4: Question-to-Answer Pipeline

**Problem**: Questions don't have stable IDs, can't trace answers back

**Solution**: Implement stable question IDs and evidence chain

#### Database Migration

##### [NEW] [0026_question_ids_and_evidence.sql](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/db/migrations/0026_question_ids_and_evidence.sql)

```sql
-- Add stable IDs to existing questions
ALTER TABLE project_questions ADD COLUMN IF NOT EXISTS stable_id VARCHAR(100);

-- Generate stable IDs for existing questions
UPDATE project_questions
SET stable_id = 'q_' || project_id || '_' || ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at)
WHERE stable_id IS NULL;

-- Make stable_id required going forward
ALTER TABLE project_questions ALTER COLUMN stable_id SET NOT NULL;
CREATE UNIQUE INDEX idx_project_questions_stable_id ON project_questions(stable_id);

-- Evidence chain table
CREATE TABLE IF NOT EXISTS evidence_chain (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  question_id VARCHAR(100) NOT NULL,
  step_type VARCHAR(50) NOT NULL, -- 'requirement', 'transformation', 'analysis', 'insight'
  step_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_evidence_chain_question ON evidence_chain(question_id);
CREATE INDEX idx_evidence_chain_project ON evidence_chain(project_id);
```

---

#### Service Layer

##### [MODIFY] [question-service.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/question-service.ts)

```typescript
export class QuestionService {
  /**
   * Save questions with stable IDs
   */
  static async saveQuestions(projectId: string, questions: string[]): Promise<Question[]> {
    const saved = [];
    
    for (let i = 0; i < questions.length; i++) {
      const stableId = `q_${projectId}_${i + 1}`;
      
      const question = await db.insert(projectQuestions).values({
        projectId,
        stableId,
        questionText: questions[i],
        questionType: 'user_defined',
        createdAt: new Date(),
      }).returning();
      
      saved.push(question[0]);
      
      // Record in evidence chain
      await this.addEvidence(projectId, stableId, 'question_created', {
        questionText: questions[i],
        index: i + 1,
      });
    }
    
    return saved;
  }
  
  /**
   * Add evidence to chain
   */
  static async addEvidence(
    projectId: string,
    questionId: string,
    stepType: string,
    stepData: any
  ): Promise<void> {
    await db.insert(evidenceChain).values({
      projectId,
      questionId,
      stepType,
      stepData,
      createdAt: new Date(),
    });
  }
}
```

---

### Week 2, Day 5: Link Transformations to Questions

##### [MODIFY] [data-transformation-step.tsx](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/data-transformation-step.tsx)

```typescript
// When generating transformation mappings, link to questions
const generateMappings = (requirements: RequiredDataElementsDocument) => {
  const mappings: TransformationMapping[] = [];
  
  requirements.analysisPath.forEach(path => {
    path.requiredDataElements.forEach(element => {
      mappings.push({
        sourceColumn: element.sourceColumn,
        targetElement: element.name,
        transformation: element.transformation,
        relatedQuestions: element.relatedQuestions || [], // NEW: Link to question IDs
        enablesAnalyses: path.analysisType,
      });
      
      // Record in evidence chain
      element.relatedQuestions?.forEach(questionId => {
        api.post(`/api/evidence/${projectId}`, {
          questionId,
          stepType: 'transformation_mapped',
          stepData: {
            sourceColumn: element.sourceColumn,
            targetElement: element.name,
            transformation: element.transformation,
          },
        });
      });
    });
  });
  
  return mappings;
};
```

---

## Phase 3: Agent Coordination (Week 3)

**Goal**: Reliable agent state management with database-first checkpoints

### Week 3, Day 1-2: Database-First Checkpoints

##### [MODIFY] [journey-execution-machine.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/journey-execution-machine.ts)

```typescript
export class JourneyExecutionMachine {
  /**
   * Persist state to database FIRST, then update memory
   */
  async persistState(projectId: string, state: JourneyState): Promise<void> {
    // 1. Save to database (source of truth)
    await db.update(journeyExecutionStates)
      .set({
        currentPhase: state.currentPhase,
        currentStepIndex: state.currentStepIndex,
        completedPhases: state.completedPhases,
        status: state.status,
        updatedAt: new Date(),
      })
      .where(eq(journeyExecutionStates.projectId, projectId));
    
    // 2. Update memory cache
    this.stateCache.set(projectId, state);
    
    console.log(`💾 [Journey] State persisted: ${state.currentPhase} (step ${state.currentStepIndex})`);
  }
  
  /**
   * Restore state from database on server restart
   */
  async restoreState(projectId: string): Promise<JourneyState | null> {
    const dbState = await db.query.journeyExecutionStates.findFirst({
      where: eq(journeyExecutionStates.projectId, projectId),
    });
    
    if (!dbState) return null;
    
    const state: JourneyState = {
      projectId,
      currentPhase: dbState.currentPhase,
      currentStepIndex: dbState.currentStepIndex,
      completedPhases: dbState.completedPhases,
      status: dbState.status,
    };
    
    // Update memory cache
    this.stateCache.set(projectId, state);
    
    console.log(`📂 [Journey] State restored from DB: ${state.currentPhase}`);
    return state;
  }
}
```

---

### Week 3, Day 3-4: Agent Message Broker with Redis

##### [MODIFY] [agent-message-broker.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/agent-message-broker.ts)

```typescript
import { EventEmitter } from 'events';
import Redis from 'ioredis';

export class AgentMessageBroker {
  private localEmitter: EventEmitter;
  private redis?: Redis;
  
  constructor() {
    this.localEmitter = new EventEmitter();
    
    // Use Redis in production for multi-instance coordination
    if (process.env.REDIS_ENABLED === 'true') {
      this.redis = new Redis(process.env.REDIS_URL);
      this.setupRedisSubscriptions();
    }
  }
  
  /**
   * Publish message to all agents
   */
  async publish(channel: string, message: any): Promise<void> {
    const payload = JSON.stringify(message);
    
    // Local delivery (same process)
    this.localEmitter.emit(channel, message);
    
    // Redis delivery (cross-process)
    if (this.redis) {
      await this.redis.publish(channel, payload);
      console.log(`📡 [Broker] Published to Redis: ${channel}`);
    }
  }
  
  /**
   * Subscribe to messages
   */
  subscribe(channel: string, handler: (message: any) => void): void {
    // Local subscription
    this.localEmitter.on(channel, handler);
    
    // Redis subscription handled by setupRedisSubscriptions
  }
  
  private setupRedisSubscriptions(): void {
    if (!this.redis) return;
    
    const subscriber = this.redis.duplicate();
    
    subscriber.on('message', (channel, message) => {
      try {
        const parsed = JSON.parse(message);
        this.localEmitter.emit(channel, parsed);
      } catch (err) {
        console.error(`❌ [Broker] Failed to parse message:`, err);
      }
    });
    
    // Subscribe to all agent channels
    subscriber.psubscribe('agent:*', 'plan:*', 'analysis:*');
  }
}
```

---

### Week 3, Day 5: WebSocket Progress Updates

#### Issue #7: WebSocket Connection Failures

##### [MODIFY] [websocket.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/websocket.ts)

**Problem**: Client tries to connect to Socket.IO but server uses `ws` library

**Fix**: Use Socket.IO on server to match client

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });
  
  io.on('connection', (socket) => {
    console.log(`🔌 [WebSocket] Client connected: ${socket.id}`);
    
    socket.on('subscribe:project', (projectId: string) => {
      socket.join(`project:${projectId}`);
      console.log(`📡 [WebSocket] Subscribed to project: ${projectId}`);
    });
    
    socket.on('disconnect', () => {
      console.log(`🔌 [WebSocket] Client disconnected: ${socket.id}`);
    });
  });
  
  return io;
}

// Emit progress updates
export function emitProgress(io: SocketIOServer, projectId: string, update: any) {
  io.to(`project:${projectId}`).emit('progress', update);
}
```

---

## Phase 4: Performance Optimization (Week 4)

**Goal**: Meet 1-5 minute SLA

### Week 4, Day 1-2: Parallel Agent Execution

##### [MODIFY] [project-manager-agent.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/project-manager-agent.ts)

```typescript
/**
 * Generate analysis plan with parallel execution and progress streaming
 */
async generateAnalysisPlan(projectId: string): Promise<AnalysisPlan> {
  const startTime = Date.now();
  
  // Emit initial progress
  this.emitProgress(projectId, { step: 'starting', progress: 0 });
  
  // Group 1: Independent operations (parallel)
  this.emitProgress(projectId, { step: 'requirements', progress: 10 });
  const [requirementsDoc, dataAssessment] = await Promise.all([
    this.generateRequirements(projectId),
    this.assessDataQuality(projectId),
  ]);
  this.emitProgress(projectId, { step: 'requirements_complete', progress: 40 });
  
  // Group 2: Depends on Group 1 (parallel within group)
  this.emitProgress(projectId, { step: 'blueprint', progress: 50 });
  const [blueprint, businessContext] = await Promise.all([
    this.generateBlueprint(requirementsDoc, dataAssessment),
    this.getBusinessContext(projectId),
  ]);
  this.emitProgress(projectId, { step: 'blueprint_complete', progress: 80 });
  
  // Final assembly
  const plan = this.assemblePlan(requirementsDoc, dataAssessment, blueprint, businessContext);
  this.emitProgress(projectId, { step: 'complete', progress: 100 });
  
  const duration = Date.now() - startTime;
  console.log(`⏱️ [PM] Plan generated in ${duration}ms`);
  
  return plan;
}

private emitProgress(projectId: string, update: any): void {
  this.messageBroker.publish(`plan:progress:${projectId}`, update);
}
```

---

### Week 4, Day 3: Template Caching

##### [NEW] [template-cache-service.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/template-cache-service.ts)

```typescript
import NodeCache from 'node-cache';

export class TemplateCacheService {
  private cache: NodeCache;
  
  constructor() {
    // Cache for 1 hour
    this.cache = new NodeCache({ stdTTL: 3600 });
  }
  
  /**
   * Get cached template recommendations
   */
  async getRecommendations(cacheKey: string): Promise<any | null> {
    return this.cache.get(cacheKey);
  }
  
  /**
   * Cache template recommendations
   */
  async setRecommendations(cacheKey: string, recommendations: any): Promise<void> {
    this.cache.set(cacheKey, recommendations);
    console.log(`💾 [Cache] Stored recommendations: ${cacheKey}`);
  }
  
  /**
   * Generate cache key from project characteristics
   */
  static getCacheKey(project: Project): string {
    const { datasetCount, rowCount, columnCount, analysisType } = project.metadata;
    return `template:${datasetCount}:${rowCount}:${columnCount}:${analysisType}`;
  }
}
```

---

### Week 4, Day 4-5: Analysis Execution Optimization

##### [MODIFY] [analysis-execution.ts](file:///C:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/server/services/analysis-execution.ts)

```typescript
/**
 * Execute analyses with timeout handling and progress updates
 */
async executeAnalyses(projectId: string, analysisTypes: string[]): Promise<AnalysisResults> {
  const ANALYSIS_TIMEOUT = 180000; // 3 minutes max
  
  try {
    // Execute with timeout
    const results = await Promise.race([
      this.runAnalyses(projectId, analysisTypes),
      this.timeout(ANALYSIS_TIMEOUT, 'Analysis execution timed out'),
    ]);
    
    // Auto-generate audience translations
    const translations = await this.generateAudienceTranslations(results, projectId);
    
    // Save results
    await this.saveResults(projectId, results, translations);
    
    return results;
  } catch (err) {
    console.error(`❌ [Analysis] Execution failed:`, err);
    throw err;
  }
}

private async runAnalyses(projectId: string, analysisTypes: string[]): Promise<any> {
  const results = [];
  
  for (let i = 0; i < analysisTypes.length; i++) {
    this.emitProgress(projectId, {
      step: `analysis_${i + 1}`,
      progress: (i / analysisTypes.length) * 100,
      analysisType: analysisTypes[i],
    });
    
    const result = await this.runSingleAnalysis(projectId, analysisTypes[i]);
    results.push(result);
  }
  
  return results;
}

private timeout(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}
```

---

## Phase 5: Testing & Validation (Week 5-6)

### Week 5: Integration Testing

**Test Scenarios**:

1. **End-to-End Happy Path**
   - [ ] Upload 2 datasets
   - [ ] Confirm PII removal
   - [ ] Enter 3 questions
   - [ ] Generate plan (<30s)
   - [ ] Execute analysis (<3min)
   - [ ] View AI-generated answers
   - [ ] Total time <5 minutes

2. **Error Handling**
   - [ ] Invalid file upload
   - [ ] Payment failure
   - [ ] Analysis timeout
   - [ ] Server restart mid-journey

3. **Performance**
   - [ ] No API polling storms
   - [ ] WebSocket progress updates work
   - [ ] Plan generation <30s
   - [ ] Analysis execution <3min

---

### Week 6: User Acceptance Testing

**Validation Checklist**:

- [ ] **Multi-Dataset Joining**: 2+ datasets join correctly
- [ ] **PII Removal**: Excluded columns never appear
- [ ] **Question Traceability**: Can trace answer back to question
- [ ] **Analysis Plan**: Generates in <30s with progress updates
- [ ] **Results Display**: AI-generated answers show immediately
- [ ] **Payment**: Completes successfully
- [ ] **Session Management**: New journey starts fresh
- [ ] **Performance**: 90th percentile <5 minutes

---

## Success Criteria

### Technical Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| API requests during prepare step | <10 | 100+ | 🔴 |
| Questions loading from DB | 100% | 0% | 🔴 |
| PII removed from previews | 100% | 0% | 🔴 |
| Payment success rate | >95% | Unknown | 🔴 |
| Plan generation time | <30s | 40-120s | 🔴 |
| Analysis execution time | <180s | 90-180s | 🟡 |
| End-to-end journey time | <300s | 225-450s | 🔴 |
| AI-generated answers | 100% | 0% | 🔴 |

### User Experience Metrics

- [ ] Users can join multiple datasets
- [ ] Users can remove PII before analysis
- [ ] Users can trace answers to questions
- [ ] Users receive results within SLA
- [ ] Users can resume journey after server restart
- [ ] Users see real-time progress updates

---

## Risk Mitigation

### High-Risk Changes

1. **Database Migrations** - Could lose existing data
   - Mitigation: Backup database before each migration
   - Rollback plan: Keep migration rollback scripts

2. **Agent Coordination Changes** - Could break existing workflows
   - Mitigation: Feature flag for new coordination logic
   - Rollback plan: Keep old EventEmitter path as fallback

3. **Data Accessor Service** - Could break existing analysis
   - Mitigation: Extensive testing with real datasets
   - Rollback plan: Keep old data access logic as fallback

### Testing Strategy

- **Unit Tests**: Each service method
- **Integration Tests**: Full user journey
- **Performance Tests**: SLA compliance
- **Regression Tests**: Ensure old features still work

---

## Deployment Plan

### Pre-Deployment

1. [ ] Database backup
2. [ ] Run all migrations in staging
3. [ ] Performance testing in staging
4. [ ] User acceptance testing

### Deployment

1. [ ] Deploy database migrations
2. [ ] Deploy backend changes
3. [ ] Deploy frontend changes
4. [ ] Verify WebSocket connections
5. [ ] Monitor error rates

### Post-Deployment

1. [ ] Monitor API request rates
2. [ ] Monitor analysis execution times
3. [ ] Monitor payment success rates
4. [ ] Collect user feedback

---

## Next Steps

1. **Review this plan** - Confirm approach and timeline
2. **Prioritize phases** - Adjust if needed
3. **Begin Phase 1** - Fix critical issues (Week 1)
4. **Daily standups** - Track progress
5. **Weekly demos** - Show working features

**Estimated Total Effort**: 4-6 weeks (1 developer full-time)

**Ready to begin?** Let me know if you'd like to adjust priorities or start with Phase 1 implementation.
