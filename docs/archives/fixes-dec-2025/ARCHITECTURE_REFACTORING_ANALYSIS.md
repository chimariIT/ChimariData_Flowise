# Architecture Refactoring Analysis: Path to Stability

**Date**: December 10, 2025
**Status**: Critical Analysis Complete
**Purpose**: Comprehensive assessment of current architecture issues and refactoring options

---

## Executive Summary

After 6 months of incremental fixes, the ChimariData platform has accumulated significant technical debt that causes recurring issues. This document provides:

1. **Root cause analysis** of why issues keep recurring
2. **Component-by-component comparison** of current vs. ideal state
3. **Three refactoring options** with effort estimates
4. **Recommendation** based on time-to-stability vs. effort

**Key Finding**: The platform doesn't have a single source of truth for user questions, transformations, analysis results, or journey state. Data exists in 3-8 different locations depending on the entity type, with no synchronization guarantees.

> **Dec 14, 2025 review:** Multi-dataset previews still bypass the unified pipeline, PII filtering is performed only in the React state tree, and the transformation step targets a nonexistent API. These regressions confirm that the refactor recommendations below remain required.

---

## Part 1: Root Cause Analysis

### Why Issues Keep Recurring

| Symptom | Root Cause | How It Manifests |
|---------|-----------|------------------|
| "Journey retains old data" | Checkpoints in DB, state in memory - not synced | Server restart = lost state |
| "Questions not answered" | Questions stored in 3 places, analysis checks only 1 | Missing context = no Q&A |
| "Transformations not applied" | 8 different data locations, unclear priority | Wrong data source used |
| "Can't see artifacts" | Results in 4 different tables | Component reads wrong location |
| "Agent approvals don't work" | In-memory checkpoints vs DB checkpoints race | Approval state lost |

### The Core Problem: No Single Source of Truth

```
CURRENT STATE (Problematic):

User Question → localStorage (client)
             → projectSessions.prepareData (server)
             → projects.businessQuestions (maybe)
             → never guaranteed to reach analysis

Transformed Data → dataset.ingestionMetadata.transformedData
                → dataset.metadata.transformedData
                → project.transformedData
                → dataset.data (fallback)
                → 8 TOTAL LOCATIONS CHECKED

Analysis Results → projects.analysisResults
                → projectSessions.executeData
                → projectArtifacts.output
                → projectStates.state (catch-all)

Journey State → projects.journeyProgress (template-based)
             → projects.journeyStatus (lifecycle)
             → projectSessions.currentStep (phase-based)
             → THREE DIFFERENT MODELS
```

---

## Part 2: Component-by-Component Analysis

### 2.1 Data Flow: Questions → Answers

#### Current Implementation

| Step | Location | Issues |
|------|----------|--------|
| User enters questions | `client/src/pages/prepare-step.tsx` | Saved to session, localStorage, AND project (race condition) |
| Questions stored | `projectSessions.prepareData.businessQuestions` | No guaranteed sync to project |
| Analysis retrieves questions | `server/services/analysis-execution.ts:116-249` | Checks 3 locations with fallback chain |
| Q&A generated | `server/services/question-answer-service.ts` | Questions are strings, no IDs |
| Answers stored | `projects.analysisResults.questionAnswers` | No link back to original question |
| Answers displayed | `client/src/components/UserQuestionAnswers.tsx` | Keyword matching fallback if Q&A missing |

**Problems**:
- No `questionId` to trace question through pipeline
- Questions can be lost between prepare step and analysis
- No validation that questions made it to analysis context
- Answers have no evidence chain back to questions

#### Ideal Implementation

```typescript
// Single source of truth: QuestionContext
interface QuestionContext {
  id: string;                    // Stable ID: `q_${projectId}_${index}`
  text: string;                  // Original question text
  createdAt: Date;

  // Populated during requirements generation
  requiredDataElements: string[];
  recommendedAnalyses: string[];

  // Populated during transformation
  transformationsApplied: string[];
  dataColumnsUsed: string[];

  // Populated during analysis
  insightsGenerated: string[];   // References to insight IDs

  // Final answer
  answer?: {
    text: string;
    confidence: number;
    evidenceChain: string[];     // [insightId, transformationId, dataElementId]
  };
}

// Stored in ONE location
projects.questionContexts: QuestionContext[]
```

**Effort to Refactor**: 3-4 days
- Create QuestionContext schema
- Update prepare-step to generate IDs
- Update analysis-execution to use IDs
- Update question-answer-service to build evidence chain
- Update display components

---

### 2.2 State Management: Journey Progress

#### Current Implementation

| Table | Fields | Purpose |
|-------|--------|---------|
| `projects` | `journeyProgress` (JSONB) | Template-based steps |
| `projects` | `journeyStatus` (VARCHAR) | Lifecycle state |
| `projects` | `stepCompletionStatus` (JSONB) | Boolean completion flags |
| `projectSessions` | `currentStep` (VARCHAR) | Phase-based navigation |
| `agentCheckpoints` | `status`, `stepName` | Approval workflow |

**Problems**:
- 5 different representations of "where is the user in the journey"
- No synchronization between them
- Template steps vs phase steps vs checkpoint steps = confusion
- Server restart loses in-memory execution state

#### Ideal Implementation

```typescript
// Single journey state model
interface JourneyState {
  projectId: string;

  // Current position (ONE source of truth)
  currentPhase: 'prepare' | 'data' | 'transform' | 'analyze' | 'results' | 'complete';
  currentStepIndex: number;

  // Completion tracking
  completedPhases: string[];
  phaseCompletedAt: Record<string, Date>;

  // Blocking state
  blockedBy?: {
    type: 'approval' | 'error' | 'user_input';
    checkpointId?: string;
    message: string;
  };

  // Lifecycle
  status: 'active' | 'paused' | 'cancelled' | 'completed';
  startedAt: Date;
  completedAt?: Date;
}

// Stored in ONE location: projects.journeyState
// Checkpoints reference this state, don't duplicate it
```

**Effort to Refactor**: 4-5 days
- Consolidate 5 state sources into 1
- Migrate existing data
- Update journey-state-manager
- Update all components reading journey state
- Update checkpoint logic to reference (not duplicate) state

---

### 2.3 Agent Coordination

#### Current Implementation

| Component | State Storage | Issues |
|-----------|--------------|--------|
| `ProjectAgentOrchestrator` | In-memory Map | Lost on restart |
| `JourneyExecutionMachine` | In-memory Map | No DB sync |
| `AgentCheckpoints` | DB + in-memory (dual) | Can diverge |
| `AgentMessageBroker` | In-memory EventEmitter | No delivery confirmation |

**Problems**:
- Dual state (memory + DB) with no consistency guarantee
- Race conditions in concurrent step execution
- Approval flow has timing bugs (500ms setTimeout)
- No true multi-agent coordination (agents don't see each other's results)

#### Ideal Implementation

```typescript
// Database-first checkpoint management
interface CheckpointManager {
  // All checkpoints go to DB first
  async createCheckpoint(checkpoint: AgentCheckpoint): Promise<string>;

  // In-memory cache is read-only, invalidated on DB change
  async getCheckpoints(projectId: string): Promise<AgentCheckpoint[]>;

  // Approval is atomic DB operation
  async approveCheckpoint(id: string, feedback: string): Promise<void>;

  // Rejection creates new checkpoint in same transaction
  async rejectCheckpoint(id: string, feedback: string): Promise<string>;
}

// Agent coordination via database, not memory
interface AgentCoordinator {
  // Agents read previous agent results from DB
  async getAgentContext(projectId: string, agentType: string): Promise<AgentContext>;

  // Results stored immediately to DB
  async storeAgentResult(result: AgentResult): Promise<void>;

  // Synthesis reads all agent results and builds final output
  async synthesizeResults(projectId: string): Promise<SynthesizedResult>;
}
```

**Effort to Refactor**: 5-7 days
- Make checkpoints DB-first
- Remove in-memory checkpoint storage
- Add agent result storage table
- Implement true multi-agent context passing
- Add synthesis step

---

### 2.4 Data Storage: Datasets & Transformations

#### Current Implementation

| Location | What's Stored | Priority |
|----------|--------------|----------|
| `datasets.data` | Original uploaded data | Fallback 4 |
| `datasets.preview` | Sample rows | Fallback 3 |
| `datasets.ingestionMetadata.transformedData` | Transformed rows | Priority 1 |
| `datasets.metadata.transformedData` | Alternative location | Priority 2 |
| `projects.transformedData` | Duplicate copy | Not used consistently |

**Problems**:
- 8 different locations checked for data
- No clear ownership
- Transformations can be lost if wrong location updated
- Multi-dataset joins use inconsistent sources

#### Ideal Implementation

```typescript
// Clear data lifecycle
interface DatasetState {
  id: string;
  projectId: string;

  // Original data (immutable after upload)
  original: {
    data: any[];
    schema: ColumnSchema[];
    uploadedAt: Date;
  };

  // Transformed data (versioned)
  transformed?: {
    data: any[];
    schema: ColumnSchema[];
    transformations: TransformationConfig[];
    transformedAt: Date;
    version: number;
  };

  // Which version to use for analysis
  activeVersion: 'original' | 'transformed';
}

// ONE location: datasets table with clear structure
// No fallback chain - either transformed exists or it doesn't
```

**Effort to Refactor**: 3-4 days
- Consolidate 8 locations to 1
- Add versioning to transformations
- Update all data access to use single location
- Migrate existing data

---

## Part 3: Refactoring Options

### Option A: Incremental Fixes (Current Approach)

**Approach**: Continue fixing issues as they arise

**Pros**:
- No upfront investment
- Can address urgent issues immediately

**Cons**:
- Issues keep recurring (proven over 6 months)
- Each fix adds complexity
- Technical debt compounds

**Time to Stability**: Never (issues will continue)

---

### Option B: Targeted Refactoring (Recommended)

**Approach**: Fix the 4 core problems without full rewrite

| Component | Effort | Impact |
|-----------|--------|--------|
| Question-to-Answer Pipeline | 3-4 days | Fixes answer generation |
| Journey State Consolidation | 4-5 days | Fixes progress tracking |
| Agent Checkpoint DB-First | 5-7 days | Fixes approval workflow |
| Data Location Consolidation | 3-4 days | Fixes transformation issues |

**Total Effort**: 15-20 days (3-4 weeks with testing)

**Pros**:
- Addresses root causes
- Maintains existing UI/UX
- Can be done incrementally

**Cons**:
- Still some legacy code
- Not a clean architecture

**Time to Stability**: 4-6 weeks

---

### Option C: Architecture Rewrite with Pydantic + Vector Store

**Approach**: Rebuild core pipeline with modern patterns

#### New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Pydantic Data Models                        │
│  (Type-safe, validated, serializable)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ProjectContext          QuestionContext        AnalysisContext  │
│  ├─ goals[]              ├─ id                  ├─ questionId     │
│  ├─ questions[]          ├─ text                ├─ dataElements[] │
│  ├─ audience             ├─ requirements[]      ├─ transformations│
│  └─ journeyType          └─ answer?             └─ results[]     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Vector Store (Embeddings)                   │
│  (Semantic search for matching questions to insights)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  question_embeddings[]   insight_embeddings[]   data_embeddings[]│
│  ├─ questionId           ├─ insightId           ├─ columnId      │
│  ├─ vector[1536]         ├─ vector[1536]        ├─ vector[1536]  │
│  └─ metadata             └─ metadata            └─ metadata      │
│                                                                  │
│  Enables: "Find insights that answer this question" via cosine  │
│           similarity instead of keyword matching                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Orchestration                         │
│  (Stateless agents, state in database)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AgentTask Queue (Redis/DB)                                      │
│  ├─ task: { agentType, projectId, context }                     │
│  ├─ status: pending | running | completed | failed               │
│  └─ result: AgentResult (stored in DB, not memory)              │
│                                                                  │
│  Each agent:                                                     │
│  1. Reads context from DB (including previous agent results)    │
│  2. Executes analysis                                            │
│  3. Stores result to DB                                          │
│  4. Triggers next agent or user checkpoint                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Single Source of Truth                      │
│  (PostgreSQL with clear schema)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  projects                                                        │
│  ├─ id, name, userId, journeyType                               │
│  ├─ journeyState: JourneyState (ONE location)                   │
│  └─ createdAt, updatedAt                                        │
│                                                                  │
│  project_questions                                               │
│  ├─ id, projectId, text                                         │
│  ├─ requirements: RequirementDoc                                │
│  ├─ answer: AnswerDoc                                           │
│  └─ evidenceChain: string[]                                     │
│                                                                  │
│  datasets                                                        │
│  ├─ id, projectId, originalData, transformedData                │
│  └─ activeVersion: 'original' | 'transformed'                   │
│                                                                  │
│  agent_results                                                   │
│  ├─ id, projectId, agentType                                    │
│  ├─ input: AgentInput                                           │
│  ├─ output: AgentOutput                                         │
│  └─ createdAt                                                   │
│                                                                  │
│  checkpoints                                                     │
│  ├─ id, projectId, agentResultId                                │
│  ├─ status, userFeedback                                        │
│  └─ createdAt, resolvedAt                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### Benefits of Pydantic + Vector Store

| Feature | Benefit |
|---------|---------|
| **Pydantic Models** | Type-safe data flow, automatic validation, clear contracts |
| **Vector Embeddings** | Semantic matching of questions to insights (not keyword) |
| **Single Source of Truth** | No more 8 locations for data |
| **Stateless Agents** | No in-memory state to lose on restart |
| **Evidence Chain** | Every answer traces back to data |

#### Implementation Phases

**Phase 1: Core Models (1 week)**
- Define Pydantic models for all entities
- Create database schema with clear relationships
- Build data migration scripts

**Phase 2: Vector Store Integration (1 week)**
- Set up vector store (Pinecone/Weaviate/pgvector)
- Create embeddings for questions, insights, data columns
- Build semantic search API

**Phase 3: Agent Refactoring (2 weeks)**
- Convert agents to stateless
- Implement agent result storage
- Build true multi-agent coordination

**Phase 4: Frontend Updates (1 week)**
- Update components to use new API
- Remove localStorage fallbacks
- Add evidence chain display

**Phase 5: Migration & Testing (1 week)**
- Migrate existing projects
- End-to-end testing
- Performance optimization

**Total Effort**: 6-8 weeks

**Pros**:
- Clean architecture
- Semantic search (better answer matching)
- True multi-agent coordination
- No more data location issues

**Cons**:
- Significant upfront investment
- Risk of new bugs during migration
- Team needs to learn new patterns

**Time to Stability**: 8-10 weeks

---

## Part 4: Recommendation

### For Immediate Stability: Option B (Targeted Refactoring)

**Why**:
- Addresses root causes without full rewrite
- 4-6 weeks to stability
- Lower risk than full rewrite
- Can transition to Option C later if needed

### Implementation Priority

| Priority | Component | Effort | Impact |
|----------|-----------|--------|--------|
| 1 | Question-to-Answer Pipeline | 3-4 days | Users see answers to their questions |
| 2 | Agent Checkpoint DB-First | 5-7 days | Approvals work reliably |
| 3 | Journey State Consolidation | 4-5 days | Progress tracking works |
| 4 | Data Location Consolidation | 3-4 days | Transformations apply correctly |

### Week-by-Week Plan

**Week 1**: Question-to-Answer Pipeline
- Day 1-2: Create QuestionContext schema, update prepare-step
- Day 3-4: Update analysis-execution to use question IDs
- Day 5: Update display components, test

**Week 2**: Agent Checkpoints
- Day 1-2: Make checkpoints DB-first, remove in-memory
- Day 3-4: Fix approval flow, add transaction support
- Day 5: Test approval workflows end-to-end

**Week 3**: Journey State
- Day 1-2: Consolidate 5 state sources to 1
- Day 3: Migrate existing data
- Day 4-5: Update all components, test

**Week 4**: Data Locations
- Day 1-2: Consolidate 8 data locations to 1
- Day 3: Update all data access paths
- Day 4-5: End-to-end testing, bug fixes

---

## Part 5: Decision Matrix

| Criterion | Option A (Patches) | Option B (Targeted) | Option C (Rewrite) |
|-----------|-------------------|--------------------|--------------------|
| Time to stability | Never | 4-6 weeks | 8-10 weeks |
| Effort | Ongoing | 15-20 days | 30-40 days |
| Risk | High (recurring) | Medium | High (migration) |
| Long-term maintenance | Poor | Good | Excellent |
| User experience during | Unstable | Minor disruption | Some disruption |
| Recommended for | Emergency fixes only | **Best balance** | New project start |

---

## Conclusion

The platform's issues stem from architectural inconsistency, not missing features. **Option B (Targeted Refactoring)** provides the best balance of effort vs. stability:

1. **4-6 weeks** to eliminate recurring issues
2. **15-20 days** of focused development
3. **No major UI changes** required
4. **Preserves existing functionality** while fixing root causes

The key insight is that adding more features or fixes on top of the current architecture will not solve the problem. The issues are structural:

- **No single source of truth** → Data gets lost
- **Multiple state representations** → State gets out of sync
- **In-memory checkpoints** → Approvals fail on restart
- **No question IDs** → Answers can't trace back to questions

Fixing these 4 structural issues will eliminate the class of bugs you've been experiencing for 6 months.

---

## Next Steps

1. **Review this analysis** with stakeholders
2. **Decide on approach** (recommend Option B)
3. **Start Week 1** of implementation plan
4. **Daily progress tracking** to ensure completion

Would you like me to begin implementing Option B, starting with the Question-to-Answer Pipeline refactoring?
