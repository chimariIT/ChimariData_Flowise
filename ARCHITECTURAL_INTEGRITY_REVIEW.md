# ChimariData Platform - Architectural Integrity Review

**Generated**: January 28, 2026
**Purpose**: Comprehensive verification of all platform flows and architectural integrity
**Status**: Active Review Document

---

## Table of Contents

1. [A2U2A2A2U Agentic Flow](#1-a2u2a2a2u-agentic-flow)
2. [Tool Registry & MCP Integration](#2-tool-registry--mcp-integration)
3. [Requirements Flow](#3-requirements-flow)
4. [Data Flow Pipeline](#4-data-flow-pipeline)
5. [Analysis Execution & Artifact Flow](#5-analysis-execution--artifact-flow)
6. [Admin UI Implementations](#6-admin-ui-implementations)
7. [Cost Estimation & Payment Flow](#7-cost-estimation--payment-flow)
8. [Identified Issues & Recommendations](#8-identified-issues--recommendations)

---

## 1. A2U2A2A2U Agentic Flow

### 1.1 Flow Pattern Definition

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    A2U2A2A2U (Agent-User-Agent-Agent-User)                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Agent] ──▶ [User] ──▶ [Agent] ──▶ [Agent] ──▶ [User]                     │
│     │          │          │          │          │                           │
│     ▼          ▼          ▼          ▼          ▼                           │
│  PM Agent   Approve    DS Agent   DE Agent   Final                         │
│  analyzes   plan &     plans      prepares   results                        │
│  goals      questions  analysis   transforms review                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Agent Architecture

| Agent | Role | Key Tools | Triggers |
|-------|------|-----------|----------|
| **Project Manager Agent** | Orchestration, coordination | `coordinate_agents`, `synthesize_results` | Journey start, user questions |
| **Data Scientist Agent** | Analysis planning, ML | `analyze_data`, `recommend_analysis` | DS case dispatch |
| **Data Engineer Agent** | Data quality, transforms | `validate_schema`, `generate_transformations` | DE case dispatch |
| **Business Agent** | Domain expertise, translation | `translate_results`, `assess_impact` | After analysis complete |
| **Template Research Agent** | Industry templates | `search_templates`, `recommend_templates` | Journey preparation |
| **Customer Support Agent** | User assistance | `search_knowledge`, `run_diagnostics` | User support requests |

### 1.3 Message Broker Architecture

**Location**: `server/services/agents/agent-message-broker.ts`

```typescript
// Event-based coordination pattern
AgentMessageBroker.getInstance().publish({
  type: 'agent_message',
  agentType: 'data_scientist',
  projectId: string,
  payload: { action: string, data: any }
});

// Subscription pattern
broker.subscribe('agent_message', (message) => {
  if (message.agentType === 'data_scientist') {
    // Handle DS agent messages
  }
});
```

**Verification Points**:
- [ ] Message broker singleton properly initialized at startup
- [ ] Redis enabled in production for distributed coordination
- [ ] Fallback to in-memory EventEmitter in development
- [ ] WebSocket bridge emitting events to frontend

### 1.4 Checkpoint Lifecycle

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   PENDING    │───▶│ IN_PROGRESS  │───▶│   WAITING    │───▶│  APPROVED/   │
│              │    │              │    │   APPROVAL   │    │  REJECTED    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                              │                    │
                                              ▼                    ▼
                                         User Decision       ┌──────────────┐
                                                             │  COMPLETED   │
                                                             └──────────────┘
```

**Storage Pattern**:
- In-memory: `ProjectAgentOrchestrator.checkpoints` Map
- Database: `agent_checkpoints` table (persistent)
- Recovery: Load from DB when in-memory is empty (handles server restart)

**Key Fix Applied**: `server/services/project-agent-orchestrator.ts:2695-2720`
- Checkpoints now load from database when in-memory cache is empty
- Synthetic expert opinions generated from journeyProgress data

---

## 2. Tool Registry & MCP Integration

### 2.1 Tool Registry Structure

**Location**: `server/services/mcp-tool-registry.ts`

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  permissions: AgentType[];  // Which agents can use this tool
  handler: (input: any) => Promise<ToolResult>;
}
```

### 2.2 Registered Tools (40+ tools)

| Category | Tools | Agents |
|----------|-------|--------|
| **Data Analysis** | `analyze_data`, `calculate_statistics`, `detect_patterns` | DS, PM |
| **Data Engineering** | `validate_schema`, `detect_pii`, `generate_transformations` | DE, PM |
| **Business** | `translate_results`, `assess_impact`, `generate_kpis` | BA, PM |
| **Orchestration** | `coordinate_agents`, `synthesize_results`, `manage_checkpoints` | PM only |
| **Templates** | `search_templates`, `recommend_templates` | TR, PM |
| **Support** | `search_knowledge`, `run_diagnostics` | CS, PM |

### 2.3 Tool Execution Pattern

```typescript
// Correct pattern - via executeTool()
const result = await executeTool('analyze_data', { projectId, analysisType });

// NEVER call services directly from agents
// ❌ const result = await analysisService.analyze(data);
```

**Verification Points**:
- [ ] All tools registered in `initializeTools()`
- [ ] Tool permissions enforced before execution
- [ ] Tool errors properly caught and reported
- [ ] No direct service calls from agent implementations

---

## 3. Requirements Flow

### 3.1 Requirements Pipeline

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Requirements Flow                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Goals ──▶ Analysis Planning ──▶ Required Elements ──▶ Transformations │
│      │               │                      │                    │           │
│      ▼               ▼                      ▼                    ▼           │
│  questions[]    analysisPath[]      requiredDataElements[]   mappings[]     │
│  (user input)   (DS Agent)          (DS + DE Agents)         (verified)     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Storage Locations

| Data | SSOT Location | Fallback Locations |
|------|---------------|-------------------|
| User Questions | `project_questions` table | `journeyProgress.userQuestions` |
| Analysis Path | `journeyProgress.requirementsDocument.analysisPath` | `plan.metadata.analysisPath` |
| Required Elements | `journeyProgress.requirementsDocument.requiredDataElements` | `plan.metadata.requiredDataElements` |
| Q&A Mapping | `journeyProgress.requirementsDocument.questionAnswerMapping` | `plan.metadata.questionAnswerMapping` |

### 3.3 Requirements Document Structure

```typescript
interface RequirementsDocument {
  analysisPath: AnalysisType[];           // Planned analyses (correlation, regression, etc.)
  requiredDataElements: DataElement[];     // What data is needed
  questionAnswerMapping: QAMapping[];      // Links questions to analyses
  completeness: CompletenessCheck;         // Validation status
}
```

### 3.4 Fallback Chain (Fixed)

**Locations Fixed**:
- `data-verification-step.tsx`: Preserves `analysisPath` from multiple sources
- `data-transformation-step.tsx`: 4-level fallback for analysisPath
- `plan-step.tsx`: Uses `plan.metadata` when journeyProgress is incomplete

**Verification Points**:
- [ ] analysisPath survives through verification → transformation → plan
- [ ] requiredDataElements propagate to plan step
- [ ] questionAnswerMapping available for evidence chains
- [ ] Fallbacks log which source was used (check console)

---

## 4. Data Flow Pipeline

### 4.1 Data Journey

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Data Flow Pipeline                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [Upload] ──▶ [Schema Detection] ──▶ [Verification] ──▶ [Transformation]       │
│     │              │                     │                    │                 │
│     ▼              ▼                     ▼                    ▼                 │
│  datasets      metadata.schema      piiDecision        transformedData         │
│  table         (inferred types)     journeyProgress    ingestionMetadata        │
│                                                                                 │
│                              ▼                                                  │
│                      [Analysis Execution]                                       │
│                              │                                                  │
│                              ▼                                                  │
│                      [Artifact Generation]                                      │
│                              │                                                  │
│                              ▼                                                  │
│                      project_artifacts table                                    │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Storage Locations

| Step | Primary Storage | Format |
|------|-----------------|--------|
| Upload | `datasets` table | `data`, `preview`, `metadata.schema` |
| Schema | `ingestionMetadata.schema` | Column definitions with types |
| PII | `journeyProgress.piiDecision` | `{ excludedColumns: [], action: 'exclude' }` |
| Transformed | `ingestionMetadata.transformedData` | Array of row objects |
| Joined | `ingestionMetadata.joinedPreview` | Combined multi-dataset rows |
| Results | `projects.analysisResults` | Insights, visualizations, recommendations |
| Artifacts | `project_artifacts` table | Files + metadata |

### 4.3 Multi-Dataset Join Flow

```typescript
// Auto-detection of join keys
autoDetectJoinKeys(datasets) {
  // Looks for: id, key, code, employee_id, user_id, department
  // Returns: { leftColumn, rightColumn, confidence }
}

// Join execution
POST /api/projects/:id/execute-transformations
{
  joinConfig: {
    type: 'left',
    leftDataset: 'dataset_1',
    rightDataset: 'dataset_2',
    leftKey: 'employee_id',
    rightKey: 'id'
  }
}
```

### 4.4 Embedding Generation (Fixed)

**Fix Applied**: `server/routes/project.ts` (upload endpoint)
- Embeddings now generated during upload (not just transformation)
- Non-blocking via `setImmediate()`
- Enables semantic search in verification step

**Verification Points**:
- [ ] `column_embeddings` table populated after upload
- [ ] Semantic search works for element mapping
- [ ] transformedData flows to analysis execution
- [ ] PII exclusions applied to artifacts

---

## 5. Analysis Execution & Artifact Flow

### 5.1 Execution Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Analysis Execution Flow                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [Trigger] ──▶ [Data Extraction] ──▶ [Python Scripts] ──▶ [Result Storage]     │
│     │               │                      │                    │               │
│     ▼               ▼                      ▼                    ▼               │
│  POST /execute   extractDatasetRows()  DataScience        analysisResults      │
│                  (priority order)      Orchestrator       + artifacts           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Data Extraction Priority

```typescript
// server/services/analysis-execution.ts - extractDatasetRows()
// Priority order:
1. dataset.ingestionMetadata.transformedData  // User-approved transforms
2. dataset.metadata.transformedData           // Alternate location
3. dataset.data                               // Original data
4. dataset.preview                            // Fallback
```

### 5.3 Python Scripts Integration

**Location**: `python/` directory

| Analysis Type | Script | Purpose |
|---------------|--------|---------|
| Correlation | `correlation_analysis.py` | Pearson, Spearman correlations |
| Regression | `regression_analysis.py` | Linear, multiple regression |
| Clustering | `clustering_analysis.py` | K-means, hierarchical |
| Time Series | `time_series_analysis.py` | Prophet forecasting |
| Descriptive | `descriptive_stats.py` | Summary statistics |

**Correct Method**:
```typescript
// ✅ Uses DataScienceOrchestrator → type-specific scripts
executeComprehensiveAnalysis()

// ❌ Uses inline basic stats only
executeAnalysis()
```

### 5.4 Artifact Generation

```typescript
// Artifacts stored in project_artifacts table
interface ProjectArtifact {
  id: string;
  projectId: string;
  type: 'report' | 'presentation' | 'data_export' | 'visualization';
  fileName: string;
  filePath: string;
  mimeType: string;
  metadata: object;
  createdAt: Date;
}
```

**PII Filtering Applied**:
- CSV exports filter columns based on `piiDecision.excludedColumns`
- PDF reports redact PII-marked fields

**Verification Points**:
- [ ] Analysis uses `executeComprehensiveAnalysis()` not `executeAnalysis()`
- [ ] Python scripts execute successfully (check server logs)
- [ ] Artifacts generated and accessible via download
- [ ] BA translation triggers after analysis completes

---

## 6. Admin UI Implementations

### 6.1 Admin API Routes

**Location**: `server/routes/admin-secured.ts`

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /admin/users` | List all users | Admin only |
| `PUT /admin/users/:id` | Update user (ban, promote) | Admin only |
| `GET /admin/projects` | List all projects | Admin only |
| `GET /admin/analytics` | Platform statistics | Admin only |
| `PUT /admin/tiers/:id` | Update subscription tier | Admin only |
| `POST /admin/sync-stripe` | Sync tiers with Stripe | Admin only |

### 6.2 Subscription Tier Management

```typescript
// subscription_tier_pricing table
interface SubscriptionTier {
  id: string;
  name: string;                    // free_tier, starter, professional, enterprise
  displayName: string;
  monthlyPrice: number;
  yearlyPrice: number;
  stripeMonthlyPriceId: string;    // Stripe price ID
  stripeYearlyPriceId: string;     // Stripe price ID
  features: object;
  limits: object;
}
```

### 6.3 Admin Dashboard Components

**Location**: `client/src/pages/admin/`

| Component | Purpose |
|-----------|---------|
| `AdminDashboard.tsx` | Overview statistics |
| `UserManagement.tsx` | User CRUD operations |
| `SubscriptionManagement.tsx` | Tier configuration |
| `AnalyticsView.tsx` | Usage analytics |

**Verification Points**:
- [ ] Admin routes properly gated by `isAdmin` check
- [ ] Stripe tier sync works correctly
- [ ] User management (ban, promote) functional
- [ ] Analytics display real data (not mock)

---

## 7. Cost Estimation & Payment Flow

### 7.1 Cost Estimation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Cost Estimation Flow                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [Data Size] ──▶ [Complexity] ──▶ [Type Multiplier] ──▶ [Final Cost]           │
│       │              │                  │                    │                  │
│       ▼              ▼                  ▼                    ▼                  │
│   Row count      ML models         Analysis type       Saved to                │
│   * $0.10/1K     * 1.2-1.5x        * 1.0-1.5x         journeyProgress          │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Pricing Constants

**Location**: `server/services/cost-estimation-service.ts`

```typescript
const PRICING = {
  BASE_COST: 0.50,           // Base cost per analysis
  ROW_COST: 0.10,            // Per 1,000 rows
  COMPLEXITY_MULTIPLIERS: {
    simple: 1.0,
    moderate: 1.2,
    complex: 1.5
  },
  TYPE_MULTIPLIERS: {
    descriptive: 1.0,
    correlation: 1.1,
    regression: 1.2,
    clustering: 1.3,
    time_series: 1.4,
    predictive: 1.5
  }
};
```

### 7.3 Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Payment Flow                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  [Cost Lock] ──▶ [Stripe Checkout] ──▶ [Webhook] ──▶ [Unlock Results]          │
│       │               │                   │                │                    │
│       ▼               ▼                   ▼                ▼                    │
│  lockedCostEstimate  Session created   checkout.session   project.isPaid       │
│  in journeyProgress  redirect to       .completed         = true               │
│                      Stripe                                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Payment Gates

**Execution Gate** (`server/routes/analysis-execution.ts`):
```typescript
// Returns 402 if not paid and no trial credits
if (!project.isPaid && !hasTrialCredits(user)) {
  return res.status(402).json({
    error: 'Payment required',
    estimatedCost: costEstimate
  });
}
```

**Results Gate** (`server/routes/analysis-execution.ts`):
```typescript
// Returns preview (10% insights, 2 charts) if not paid
if (!project.isPaid) {
  return res.json({
    isPreview: true,
    insights: insights.slice(0, Math.ceil(insights.length * 0.1)),
    visualizations: visualizations.slice(0, 2)
  });
}
```

### 7.5 Stripe Webhook Handling

**Location**: `server/routes/payment.ts`

```typescript
// checkout.session.completed webhook
app.post('/api/webhooks/stripe', async (req, res) => {
  const event = stripe.webhooks.constructEvent(...);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const projectId = session.metadata.projectId;

    // Mark project as paid
    await storage.updateProject(projectId, { isPaid: true } as any);
  }
});
```

**Verification Points**:
- [ ] Cost estimation uses CostEstimationService constants
- [ ] lockedCostEstimate saved before checkout
- [ ] Stripe webhooks verified with signature
- [ ] Payment gates block execution when unpaid
- [ ] Results properly limited in preview mode
- [ ] PaymentStatusBanner displays correct state

---

## 8. Identified Issues & Recommendations

### 8.1 Issues Found

| # | Severity | Issue | Status |
|---|----------|-------|--------|
| 1 | ✅ Fixed | Checkpoints not loading from DB after restart | Fixed in orchestrator |
| 2 | ✅ Fixed | analysisPath lost during verification step | Added fallback chain |
| 3 | ✅ Fixed | Embeddings generated too late for mapping | Now during upload |
| 4 | ✅ Fixed | Business definitions not enriched | Fallback to AI generation |
| 5 | ⚠️ Warning | Some Python scripts may not exist | Verify all scripts present |
| 6 | ⚠️ Warning | Redis required in production | Document clearly |
| 7 | ⚠️ Warning | Mock data in some services | Grep and verify |

### 8.2 Recommended Verification Tests

```bash
# 1. Agent coordination test
npm run test:integration:agents

# 2. Data flow test
npm run test:user-journeys

# 3. Payment flow test
npm run test:production

# 4. Mock data audit
grep -r "mock\|simulated\|fake" server/services/
```

### 8.3 Console Indicators to Check

During a full user journey, verify these logs appear:

| Step | Expected Log |
|------|--------------|
| Upload | `🔢 [TASK 1 FIX] Generating column embeddings` |
| Verification | `🔄 [TASK 2 FIX] Preserving analysisPath` |
| Transformation | `📋 [analysisPath] Using source: ...` |
| Plan | `📋 [Plan] Loaded X required elements, Y analyses` |
| Execution | `🔬 DataScienceOrchestrator: Running X.py` |
| BA Translation | `💼 [BA Agent] Translating results` |
| Artifacts | `📄 Generated artifact: ...` |

### 8.4 Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         ChimariData Platform Architecture                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐   │
│  │     Frontend        │     │      Backend        │     │     External        │   │
│  │  (React + Vite)     │◀───▶│  (Express + WS)     │◀───▶│     Services        │   │
│  └─────────────────────┘     └─────────────────────┘     └─────────────────────┘   │
│           │                           │                           │                 │
│           ▼                           ▼                           ▼                 │
│  ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐   │
│  │   Journey Steps     │     │   Agent System      │     │     Stripe          │   │
│  │   - prepare         │     │   - PM Agent        │     │     SendGrid        │   │
│  │   - verify          │     │   - DS Agent        │     │     Google AI       │   │
│  │   - transform       │     │   - DE Agent        │     │     OpenAI          │   │
│  │   - plan            │     │   - BA Agent        │     │     Anthropic       │   │
│  │   - execute         │     │   Message Broker    │     │                     │   │
│  │   - results         │     │   Tool Registry     │     │                     │   │
│  └─────────────────────┘     └─────────────────────┘     └─────────────────────┘   │
│           │                           │                                             │
│           └───────────────────────────┼─────────────────────────────────────────────│
│                                       ▼                                             │
│                          ┌─────────────────────────────┐                           │
│                          │        PostgreSQL           │                           │
│                          │   - projects                │                           │
│                          │   - datasets                │                           │
│                          │   - agent_checkpoints       │                           │
│                          │   - project_artifacts       │                           │
│                          │   - column_embeddings       │                           │
│                          │   - subscription_tiers      │                           │
│                          └─────────────────────────────┘                           │
│                                       │                                             │
│                          ┌─────────────────────────────┐                           │
│                          │         Redis               │                           │
│                          │   (Production Only)         │                           │
│                          │   - Message Broker          │                           │
│                          │   - Session Store           │                           │
│                          │   - Rate Limiting           │                           │
│                          └─────────────────────────────┘                           │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Key File References

| Component | Primary File | Purpose |
|-----------|--------------|---------|
| Agent Orchestrator | `server/services/project-agent-orchestrator.ts` | Coordination |
| Message Broker | `server/services/agents/agent-message-broker.ts` | Event distribution |
| Tool Registry | `server/services/mcp-tool-registry.ts` | Tool management |
| Analysis Execution | `server/services/analysis-execution.ts` | Run analyses |
| DS Orchestrator | `server/services/data-science-orchestrator.ts` | Python routing |
| Cost Estimation | `server/services/cost-estimation-service.ts` | Pricing |
| Payment Routes | `server/routes/payment.ts` | Stripe integration |
| Journey Progress | `journeyProgress` in projects table | State SSOT |

---

**Document Version**: 1.0
**Last Updated**: January 28, 2026
**Next Review**: After user journey test completion
