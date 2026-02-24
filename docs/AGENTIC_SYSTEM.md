# Agentic System Guide

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md) | **Last Updated**: February 23, 2026

This document covers the multi-agent architecture, tool-based system, MCP integration, agent coordination, and development patterns.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Agent Architecture](#agent-architecture)
- [Available Agents](#available-agents)
- [Tool-Based Architecture](#tool-based-architecture)
- [Agent Coordination](#agent-coordination)
- [Agent Checkpoints](#agent-checkpoints) ← **NEW**
- [WebSocket Communication](#websocket-communication)
- [Message Broker](#message-broker)
- [Agent Development](#agent-development)
- [Tool Development](#tool-development)
- [Planned Improvements](#planned-improvements) ← **NEW**
- [Debugging Agents](#debugging-agents)

---

## Overview

The platform implements a **sophisticated multi-agent system** where specialized agents collaborate to complete data analysis projects. All agent capabilities are accessed through a **tool-based architecture** for permission enforcement, usage tracking, and centralized error handling.

### Core Principles

1. **Agents NEVER call services directly** - All operations route through Tool Registry
2. **Event-driven coordination** - Agents communicate via Message Broker
3. **Real-time user interaction** - WebSocket for agent-to-user communication
4. **Role-based permissions** - Each agent has specific tool access
5. **Audit trails** - All agent decisions tracked for transparency

### Architecture Flow
```
User Journey → Agent (via MCP) → Tool Registry → Tool Handler → Real Service Implementation
```

---

## Agent Architecture

### Agent Types

The platform has **7 specialized agents**:

| Agent | File | Primary Responsibility | Status |
|-------|------|----------------------|--------|
| **Project Manager** | `project-manager-agent.ts` | End-to-end orchestration | ✅ Active |
| **Data Scientist** | `data-scientist-agent.ts` | Statistical analysis, ML | ✅ Active |
| **Technical AI** | `technical-ai-agent.ts` | Lower-level technical AI (used BY Data Scientist) | ✅ Active |
| **Business Agent** | `business-agent.ts` | Industry expertise, compliance | ✅ Active |
| **Data Engineer** | `data-engineer-agent.ts` | Data quality, ETL pipelines | ✅ Active |
| **Template Research** | `template-research-agent.ts` | Industry-specific templates | ⚠️ Initialized, tools not routed |
| **Customer Support** | `customer-support-agent.ts` | Knowledge base, diagnostics | ⚠️ Initialized, not wired to workflows |

⚠️ **Important**: `TechnicalAIAgent` and `DataScientistAgent` are **separate agents**. DataScientistAgent uses TechnicalAIAgent as a lower-level service.

### Tool Implementation Status (Feb 2026 Audit)

| Category | Registered | Routed in executeTool | Fully Working |
|----------|-----------|----------------------|---------------|
| Core Analysis | 5 | 5 | 5 |
| ML Pipeline | 5 | 5 | 5 |
| Visualization | 6 | 4 | 4 |
| Spark Distributed | 6 | 0 | 0 (PLANNED) |
| PM Coordination | 6 | 2 | 1 |
| Research Agent | 7 | 7 | 7 |
| Data Ingestion | 17+ | 15 | 15 |
| Data Engineer | 6 | 4 | 3 |
| Business Agent | 9 | 9 | 9 |
| Customer Support | 6 | 5 | 4 |
| Business Definitions | 3 | 3 | 3 |
| Output Formatting | 4 | 3 | 3 |
| **Total** | **130+** | **~75** | **~65** |

See [MCP_TOOL_STATUS.md](MCP_TOOL_STATUS.md) for the full tool-by-tool matrix.

### Known Gaps (Feb 2026)
- **Socket.IO removed**: Dual-emission to both ws and Socket.IO was causing message duplication. Now uses native `ws` only (per CLAUDE.md).
- **Tool input validation**: `executeTool()` does not validate input against registered `inputSchema` before routing.
- **Intent-based discovery**: `findToolsByIntent()` uses keyword matching only, not semantic similarity.

### Resolved Gaps
- ~~**Agent Activity Messages**~~: Dynamic context-aware messages and tool-level events now replace hardcoded static strings.
- ~~**Business Agent translation**~~: BA now has 3 registered MCP tools (`ba_translate_results`, `ba_assess_business_impact`, `ba_generate_industry_insights`) for server-side post-execution translation, business impact assessment, and industry insight generation.

---

## Available Agents

### 1. Analytics Project Manager Agent

**Location**: `server/services/project-manager-agent.ts`

**Modular Architecture**:
```
server/services/project-manager/
├── journey-planner.ts               # Journey planning logic
├── journey-template-service.ts      # Template management
├── agent-catalog.ts                 # Agent registry & queue integration
├── types.ts                         # Type definitions
└── audit-log.ts                     # Decision audit logging
```

**Responsibilities**:
- End-to-end project orchestration
- User interaction management across journey types
- Project artifact dependency tracking
- Resource allocation and timeline management
- Journey template selection and execution

**Key Methods**:
```typescript
class AnalyticsProjectManagerAgent {
  async planJourney(projectContext): Promise<JourneyPlan>
  async coordinateAgents(projectId, agentTasks): Promise<AgentCoordination>
  async requestClarification(userId, question): Promise<ClarificationResponse>
  async trackArtifacts(projectId): Promise<ArtifactStatus>
}
```

---

### 2. Data Scientist Agent

**Location**: `server/services/data-scientist-agent.ts` (1,903 lines)

⚠️ **Not** `technical-ai-agent.ts` - these are separate!

**Responsibilities**:
- Technical analysis planning and execution
- Dataset validation and statistical analysis
- ML model development and evaluation
- Technical artifact generation (code, models, reports)
- Data pipeline optimization using Spark

**Uses Internally**:
- `TechnicalAIAgent` for lower-level AI operations
- `SparkProcessor` for distributed processing

**Key Methods**:
```typescript
class DataScientistAgent {
  async analyzeDataset(data, config): Promise<AnalysisResult>
  async recommendAnalysis(projectContext): Promise<AnalysisRecommendation>
  async trainMLModel(data, modelConfig): Promise<MLModelResult>
  async validateStatistics(data, hypothesis): Promise<StatisticalValidation>
}
```

---

### 3. Technical AI Agent

**Location**: `server/services/technical-ai-agent.ts` (1,257 lines)

**Role**: Lower-level technical AI service used BY Data Scientist Agent

**Responsibilities**:
- AI provider integration (Gemini, OpenAI, Claude)
- Technical query processing
- ML metric simulation (⚠️ mock mode)
- Role-based prompt templating

**Critical Mock Data Locations**:
- Lines 97-107: Mock query results
- Lines 582-636: Simulated ML metrics

**Key Methods**:
```typescript
class TechnicalAIAgent {
  async processQuery(query, userRole): Promise<AIResponse>
  async generateInsights(data, context): Promise<Insights>
  async simulateMLMetrics(): Promise<MLMetrics>  // ⚠️ Mock mode
}
```

---

### 4. Business Agent

**Location**: `server/services/business-agent.ts`

**Responsibilities**:
- Line of business knowledge research
- Industry-specific template identification
- Business context interpretation and domain expertise
- Regulatory compliance insights

**Key Methods**:
```typescript
class BusinessAgent {
  async researchIndustry(industry, domain): Promise<IndustryInsights>
  async identifyTemplates(businessContext): Promise<TemplateRecommendations>
  async validateCompliance(data, regulations): Promise<ComplianceReport>
}
```

---

### 5. Data Engineer Agent

**Location**: `server/services/data-engineer-agent.ts`

**Responsibilities**:
- Data quality assessment and monitoring
- Data transformation pipeline design
- Schema validation and data profiling
- ETL process optimization

**Key Methods**:
```typescript
class DataEngineerAgent {
  async assessDataQuality(dataset): Promise<QualityReport>
  async estimateDataRequirements(projectContext): Promise<DataEstimate>
  async designPipeline(data, transformations): Promise<PipelineSpec>
  async profileData(dataset): Promise<DataProfile>
}
```

---

### 6. Template Research Agent

**Location**: `server/services/template-research-agent.ts`

**Responsibilities**:
- Industry-specific template identification
- Template synthesis and research
- Best practice recommendations

**Key Methods**:
```typescript
class TemplateResearchAgent {
  async findTemplates(industry, useCase): Promise<Templates>
  async synthesizeTemplate(requirements): Promise<CustomTemplate>
  async recommendBestPractices(domain): Promise<BestPractices>
}
```

---

### 7. Customer Support Agent

**Location**: `server/services/customer-support-agent.ts`

**Status**: ⚠️ Implemented but **may not be wired up** in initialization

**Responsibilities**:
- Knowledge base integration
- Diagnostics and troubleshooting
- Billing and subscription support
- User query resolution

**Verification Needed**: Check if initialized in `server/services/agent-initialization.ts`

---

## Tool-Based Architecture

### Why Tool-Based Architecture?

**⚠️ CRITICAL PATTERN**: Agents must **NEVER** directly call service implementations.

**Benefits**:
- ✅ Permission enforcement per agent
- ✅ Usage tracking for billing
- ✅ Centralized error handling
- ✅ Service health monitoring
- ✅ Cost attribution and audit trails

### Core Components

#### 1. Tool Registry

**Location**: `server/services/mcp-tool-registry.ts`

Central registry for all available tools with metadata and permissions.

**Key Functions**:
```typescript
class MCPToolRegistry {
  static registerTool(toolDef: ToolDefinition): void
  static getTool(name: string): ToolDefinition | undefined
  static canAgentUseTool(agentId: string, toolName: string): boolean
  static executeTool(toolName, agentId, input, context): Promise<ToolResult>
}
```

#### 2. Real Tool Handlers

**Location**: `server/services/real-tool-handlers.ts`

Connects registered tools to actual service implementations.

**Implemented Handlers**:
- `StatisticalAnalyzerHandler` → Python statsmodels integration
- `MLPipelineHandler` → scikit-learn via Python bridge
- `VisualizationEngineHandler` → matplotlib/plotly chart generation

**Pattern**:
```typescript
export const StatisticalAnalyzerHandler = {
  async execute(input: any, context: any): Promise<ToolResult> {
    const pythonProcessor = require('./python-processor');
    const result = await pythonProcessor.executePythonScript(
      'statistical_tests.py',
      { data: input.data, testType: input.testType }
    );
    return { status: 'success', result, metrics: {...} };
  }
};
```

### Registered Tools

**Core Analysis Tools** (from `mcp-tool-registry.ts:216-304`):

1. **file_processor** - File upload, validation, schema detection
2. **schema_generator** - Auto-detect column types, constraints, relationships
3. **data_transformer** - Clean, transform, feature engineering
4. **statistical_analyzer** ✅ - Real ANOVA, regression, correlation (Python statsmodels)
5. **ml_pipeline** ✅ - Real model training, prediction, evaluation (scikit-learn)
6. **visualization_engine** ✅ - Real charts, dashboards (matplotlib/plotly)
7. **business_templates** - Industry-specific formatting, reports
8. **project_coordinator** - Workflow coordination, artifact tracking
9. **decision_auditor** - Decision logging, audit trails

**Tool Categories**:
- `pm_communication`, `pm_evaluation`, `pm_coordination` - Project Manager tools
- `de_pipeline`, `de_quality`, `de_governance` - Data Engineer tools
- `cs_knowledge`, `cs_diagnostics` - Customer Support tools
- `data`, `analysis`, `visualization`, `ml`, `business`, `utility` - General categories

### Agent-Tool Permission Matrix

| Agent Type | Accessible Tools |
|-----------|------------------|
| **Project Manager** | file_processor, project_coordinator, decision_auditor |
| **Data Scientist** | file_processor, schema_generator, data_transformer, statistical_analyzer, ml_pipeline, visualization_engine, decision_auditor |
| **Business Agent** | business_templates, visualization_engine, decision_auditor |
| **Data Engineer** | file_processor, schema_generator, data_transformer, data_quality_monitor |
| **Template Research** | business_templates, knowledge_graph, decision_auditor |
| **Customer Support** | knowledge_graph, billing_service, diagnostics_tools |

### Implementation Pattern

#### ❌ WRONG - Direct Service Calls
```typescript
// DO NOT DO THIS - Bypasses tool registry
async processQuery(query: TechnicalQueryType): Promise<any> {
  const analyzer = new AdvancedAnalyzer();
  const result = await analyzer.performStepByStepAnalysis(data, config);
  return result;
}
```

#### ✅ CORRECT - Tool Registry Pattern
```typescript
// DO THIS - Routes through tool registry
async processQuery(query: TechnicalQueryType): Promise<any> {
  const { executeTool } = require('./mcp-tool-registry');

  const toolName = this.mapQueryTypeToTool(query.type);

  const toolResult = await executeTool(
    toolName,
    'data_scientist_agent',  // Agent ID
    { data: query.data, config: query.parameters },
    { userId: query.context.userId, projectId: query.context.projectId }
  );

  return {
    success: toolResult.status === 'success',
    result: toolResult.result,
    engine: 'tool-registry',
    tool: toolName,
    metrics: toolResult.metrics
  };
}
```

---

## Agent Coordination

### Coordination Mechanisms

1. **Shared State** - Database project state in `shared/schema.ts`
2. **Message Broker** - EventEmitter-based agent-to-agent messaging
3. **WebSocket** - Real-time agent-to-user communication
4. **Realtime Agent Bridge** - Event-driven communication

**Architecture**:
```
shared/schema.ts (Database State)
         ↕
   Message Broker (Agent-to-Agent)
         ↕
   Realtime Agent Bridge
         ↕
   WebSocket Server (Agent-to-User)
```

### Interactive Workflow

- **User Approval Process**: Agents present artifacts at each step requiring review
- **Checkpoints**: Users approve/modify schema definitions, analysis plans, visualizations
- **Decision Audit Trails**: All agent decisions tracked for transparency
- **Real-time Feedback**: Managed through `server/realtime.ts`

---

## Agent Checkpoints

### Overview

Agent checkpoints are approval points where agents pause execution to collect user feedback before proceeding. They enable human-in-the-loop control over the analysis pipeline.

### Current Implementation (Updated January 2026)

**Status**: ✅ DB-First Implementation Complete

**Location**: `server/storage.ts` (storage methods), `server/routes/project.ts` (API endpoints)

```typescript
// All checkpoints use storage.createAgentCheckpoint() - DB is source of truth
await storage.createAgentCheckpoint({
  projectId,
  stepName: 'quality_validation',  // Workflow step identifier
  agentType: 'data_engineer',      // project_manager, data_engineer, data_scientist, business
  status: 'pending',               // pending, approved, rejected, completed
  message: 'Agent message to user',
  data: { /* structured JSONB data */ },
  requiresUserInput: true
});

// Read checkpoints from DB
const checkpoints = await storage.getProjectCheckpoints(projectId);

// Update checkpoint with user feedback
await storage.updateAgentCheckpoint(checkpointId, {
  status: 'approved',
  userFeedback: 'User feedback text'
});
```

### Architecture Notes

- **DB-First**: All checkpoints stored in `agent_checkpoints` table (no in-memory Map)
- **Field Names**: Use `stepName` (not `stage`), `agentType` (not `agentId`), `data` (not `metadata`)
- **Data Field**: JSONB type - pass objects directly, not JSON.stringify()

### Checkpoint Lifecycle

```
1. Agent creates checkpoint
   → Stored in-memory Map
   → Stored in database (agent_checkpoints table)
   → Emitted via WebSocket to frontend

2. User reviews checkpoint in UI
   → Component: client/src/components/agent-checkpoints.tsx
   → Tab: "Agents" tab in project dashboard

3. User approves/rejects
   → PUT /api/projects/:id/checkpoints/:checkpointId/feedback
   → Updates status in database
   → Triggers workflow continuation

4. Next step execution
   → Agent reads checkpoint status
   → Continues or re-executes based on feedback
```

### Checkpoint Types

| Type | Purpose | Requires User Action |
|------|---------|---------------------|
| `data_quality` | Data validation results | Yes - approve schema |
| `analysis_plan` | Proposed analysis approach | Yes - approve or modify |
| `transformation` | Data transformation preview | Yes - approve mappings |
| `results_preview` | Preliminary results | Yes - validate before final |
| `info` | Progress update | No - informational only |

### API Endpoints

```typescript
// Get checkpoints for project
GET /api/projects/:projectId/checkpoints

// Submit feedback on checkpoint
PUT /api/projects/:projectId/checkpoints/:checkpointId/feedback
Body: { approved: boolean, feedback?: string }

// Approve all pending checkpoints
POST /api/projects/:projectId/approve-all-checkpoints
```

### Database Schema

```sql
-- agent_checkpoints table (shared/schema.ts:1041)
CREATE TABLE agent_checkpoints (
  id VARCHAR PRIMARY KEY,
  project_id VARCHAR NOT NULL,         -- FK to projects
  agent_type VARCHAR NOT NULL,         -- project_manager, data_engineer, data_scientist, business
  step_name VARCHAR NOT NULL,          -- Workflow step identifier
  status VARCHAR DEFAULT 'pending',    -- pending, in_progress, waiting_approval, approved, completed, rejected
  message TEXT NOT NULL,               -- Agent message to user
  data JSONB,                          -- Additional structured data (not stringified)
  user_feedback TEXT,                  -- User's feedback/response
  requires_user_input BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
-- Indexes: project_id, status, agent_type
```

### Dec 10, 2025 Fixes Applied

✅ **Issue #12 & #13 Fixed**: Journey restart now clears database checkpoints

**File**: `server/services/project-agent-orchestrator.ts` (lines 1128-1150, 1266-1268)

```typescript
// cleanupProjectAgents() now deletes from DB
async cleanupProjectAgents(projectId: string, deleteFromDatabase = true): Promise<void> {
  // Clear in-memory
  this.checkpoints.delete(projectId);
  this.executionMachines.delete(projectId);

  // Clear database checkpoints
  if (deleteFromDatabase) {
    await storage.deleteProjectCheckpoints(projectId);
  }
}
```

---

## PM Agent Coordination Workflow (Dec 12, 2025)

### Overview

The Project Manager (PM) Agent acts as the **supervisor and primary coordinator** for all agent activity. This pattern ensures consistent orchestration where PM delegates work to specialized agents and synthesizes their outputs.

### PM as Coordinator Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      PROJECT MANAGER AGENT                               │
│              (Supervisor - Orchestrates All Agent Activity)              │
└──────────────────────────────────────────────────────────────────────────┘
                   │
       ┌──────────┼──────────┬──────────┬──────────┐
       ▼          ▼          ▼          ▼          ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │RESEARCHER│ │   DS    │ │   DE    │ │   BA    │ │Technical│
  │  Agent  │ │  Agent  │ │  Agent  │ │  Agent  │ │   AI    │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

### Coordinated Workflow Steps

| Step | PM Action | Target Agent | Output |
|------|-----------|--------------|--------|
| 1 | User enters questions and goals | - | `businessQuestions[]`, `analysisGoal` |
| 2 | "Find matching templates" | Researcher | `templates[]`, `analysisPatterns[]`, `workflows[]` |
| 3 | "Identify analysis types based on researcher patterns" | Data Scientist | `analysisPath[]`, `requiredDataElements[]` |
| 4 | "Prepare data for DS's analysis requirements" | Data Engineer | `transformationPlan`, `qualityReport`, `joinStrategy` |
| 5 | "Review and approve transformation plan" | User | Approved/modified plan |
| 6 | "Execute approved transformations" | Data Engineer | Transformed datasets |
| 7 | "Execute analysis on prepared data" | Data Scientist | `insights[]`, `recommendations[]`, `visualizations[]` |
| 8 | "Package results for user's audience" | BA + DS | `translatedResults[]`, `artifacts[]`, `deliverables[]` |

### Agent Types in Journey Templates

**Location**: `shared/journey-templates.ts`

```typescript
// Extended agent enum for PM coordination
agent: z.enum([
  'technical_ai_agent',
  'business_agent',
  'project_manager',
  'data_engineer',
  'template_research_agent',  // GAP F: Template/pattern recommendations
  'data_scientist'            // GAP G: Analysis planning
])
```

### Orchestrator Implementation

**Location**: `server/services/project-agent-orchestrator.ts`

```typescript
// Agent instances for PM coordination
private templateResearchAgent: TemplateResearchAgent;
private dataScientistAgent: DataScientistAgent;

// Extended AgentCheckpoint type
agentType: 'project_manager' | 'technical_ai' | 'business' |
           'data_engineer' | 'template_researcher' | 'data_scientist';

// Case handlers in executeStepByAgent()
case 'template_research_agent':
  // Researcher finds templates/patterns matching user questions
  const researchResult = await this.templateResearchAgent.researchTemplate({
    industry, businessGoals, keywords, complexityLevel
  });
  return { template, confidence, marketDemand, implementationComplexity };

case 'data_scientist':
  // DS identifies analysis types based on researcher patterns
  const dsRecommendation = await this.dataScientistAgent.recommendAnalysisConfig({
    userQuestions, analysisGoal, datasetMetadata, data, recordCount
  });
  return { recommendedAnalyses, complexity, requiredColumns, rationale };
```

### Frontend Integration

**Location**: `client/src/pages/prepare-step.tsx`

The frontend calls the Researcher Agent BEFORE generating requirements:

```typescript
// GAP F: Call Researcher Agent to find templates before requirements generation
const researcherResponse = await apiClient.post(
  `/api/projects/${projectId}/recommend-templates`,
  { businessGoals, userQuestions, journeyType }
);

// Use researcher recommendations to guide requirements generation
if (researcherResponse.success && researcherResponse.recommendations) {
  setResearcherRecommendations(researcherResponse.recommendations);
}
```

### API Endpoints for Agent Coordination

| Endpoint | Purpose | Agent |
|----------|---------|-------|
| `POST /api/projects/:id/recommend-templates` | Get template recommendations | Researcher |
| `GET /api/projects/:id/required-data-elements` | Get requirements with analysisPath | DS + BA + PM |
| `POST /api/projects/:id/execute-transformations` | Execute approved transformations | DE |
| `POST /api/analysis-execution/execute` | Run analysis with analysisPath | DS |

### Data Flow Through Coordination

```
User Questions
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESEARCHER AGENT: Find relevant templates/patterns              │
│ Output: { template, confidence, marketDemand }                  │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATA SCIENTIST AGENT: Identify analysis types                   │
│ Input: User questions + researcher patterns                     │
│ Output: { analysisPath[], requiredDataElements[] }              │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ DATA ENGINEER AGENT: Prepare data                               │
│ Input: DS requirements + uploaded datasets                      │
│ Output: { transformationPlan, joinStrategy, qualityReport }     │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ KNOWLEDGE ENRICHMENT (optional): After data verification,       │
│ knowledge graph enrichment can be triggered to add industry     │
│ context, business definitions, and domain metadata.             │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ ANALYSIS EXECUTION: Run prioritized analyses                    │
│ Input: Transformed data + analysisPath                          │
│ Output: { insights[], recommendations[], visualizations[] }     │
└─────────────────────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────────────────────────────────────┐
│ RESULTS: Use questionAnswerMapping for evidence chain           │
│ Output: Answers linked to questions with full traceability      │
└─────────────────────────────────────────────────────────────────┘
```

### Evidence Chain (Question → Answer Traceability)

**Location**: `server/services/question-answer-service.ts`, `client/src/components/UserQuestionAnswers.tsx`

Each answer includes an evidence chain showing:
- **Data Used**: Which data elements contributed
- **Analyses Run**: Which analysis types were executed
- **Transformations Applied**: What data preparation was done
- **Supporting Insights**: Linked insight IDs

```typescript
// Evidence chain structure
{
  questionId: string,
  questionText: string,
  answer: string,
  evidenceChain: {
    dataElements: string[],
    analyses: string[],
    insights: string[],
    transformationsApplied: string[]
  }
}
```

---

## WebSocket Communication

**Location**: `server/realtime.ts`, `client/src/lib/realtime.ts`, `client/src/lib/api.ts`

### Architecture Flow

The real-time system follows this flow for agent-to-user communication:

```
Agent Execution (server/services/agents/)
  ↓
Realtime Bridge publishes event (server/services/agents/realtime-bridge.ts)
  ↓
Message Broker coordinates (server/services/agents/agent-message-broker.ts)
  ↓
WebSocket Server broadcasts (server/index.ts via ws library)
  ↓
Client receives event (client/src/lib/realtime.ts)
  ↓
UI updates in real-time (client/src/pages/*.tsx)
```

### Server-Side API

**Location**: `server/realtime.ts`

```typescript
class RealtimeServer {
  sendProjectUpdate(projectId: string, update: any): void
  sendAgentMessage(userId: string, agentType: string, message: any): void
  broadcastToProject(projectId: string, event: string, data: any): void
}
```

### Client-Side Connection

**Location**: `client/src/lib/realtime.ts`

- WebSocket connection established on user authentication
- Automatic reconnection handling
- Real-time updates for: agent messages, project state, analysis progress
- Event listeners for specific message types

### Message Types

| Type | Purpose | Example |
|------|---------|---------|
| `agent:message` | Agent communication to user | PM asking for clarification |
| `project:update` | Project state changes | Journey step completed |
| `analysis:progress` | Long-running analysis status | ML training at 45% |
| `checkpoint:request` | Agent requesting user approval | Schema validation needed |
| `error:notification` | Real-time error alerts | Python script failed |

**Critical Pattern**: Always use WebSocket for agent-user interaction, never HTTP polling.

### Debugging WebSocket Issues

See [CLAUDE.md - Common Debugging Scenarios](../CLAUDE.md#common-debugging-scenarios) for troubleshooting WebSocket agent messages not appearing.

---

## Message Broker

**Location**: `server/services/agents/message-broker.ts`, `server/routes/project.ts`

### Architecture Pattern

```
Agent Method Execution
  ↓
Route Handler Receives Result
  ↓
Route Handler Publishes Event (messageBroker.publish())
  ↓
Message Broker Broadcasts to All Subscribers
  ↓
Subscribed Route Handlers React (logging, coordination)
```

**⚠️ IMPORTANT**: Agents do NOT publish events internally. Event publishing happens in route handlers after agent methods complete.

### Message Broker Setup

**Location**: `server/routes/project.ts:28-77`

```typescript
const messageBroker = new AgentMessageBroker();

// Subscribe to agent events
messageBroker.subscribe('data:quality_assessed', async (message) => {
    console.log('📨 PM ← DE: Data quality assessed', message.data?.projectId);
});

messageBroker.subscribe('data:requirements_estimated', async (message) => {
    console.log('📨 PM ← DE: Requirements estimated', message.data?.projectId);
});

messageBroker.subscribe('analysis:recommended', async (message) => {
    console.log('📨 PM ← DS: Analysis recommended', message.data?.projectId);
});
```

### Event Publishing Pattern

**Location**: `server/routes/project.ts:216-241`

```typescript
// After agent method completes
const dataEstimate = await dataEngineerAgent.estimateDataRequirements({...});

// Publish event to broadcast result
await messageBroker.publish('data:requirements_estimated', {
    projectId,
    userId,
    dataEstimate,
    timestamp: new Date().toISOString()
});
console.log('📤 Data Engineer → Broadcast: Requirements estimated');
```

### Event Naming Convention

```
<source_agent>:<action>

Examples:
- data:quality_assessed        (Data Engineer completed quality check)
- data:requirements_estimated  (Data Engineer estimated data needs)
- analysis:recommended         (Data Scientist recommended configuration)
- pm:clarification_needed      (Project Manager needs user input)
- schema:approved              (User approved schema definition)
```

### Current Event Subscribers

**Location**: `server/routes/project.ts`

1. `data:quality_assessed` - Project Manager receives quality assessment
2. `data:analyzed` - Data Scientist receives analyzed data
3. `data:requirements_estimated` - Project Manager receives requirements
4. `analysis:recommended` - Project Manager receives recommendations
5. `pm:clarification_needed` - Data Engineer receives clarification request
6. `schema:approved` - Agents proceed with approved schema

### Why This Architecture?

- **Separation of Concerns**: Agents focus on analysis, routes manage coordination
- **Flexibility**: Easy to add new subscribers without modifying agents
- **Observability**: Console logs show complete coordination flow
- **Testability**: Agents can be tested without message broker dependency
- **Future Extensibility**: Can add persistent event logging, metrics, auditing

### Console Output Example

```
🤖 Starting agent recommendation workflow for project abc123
📊 Data Engineer estimating data requirements...
📤 Data Engineer → Broadcast: Requirements estimated
📨 PM ← DE: Requirements estimated abc123
🔬 Data Scientist analyzing complexity...
📤 Data Scientist → Broadcast: Analysis recommended
📨 PM ← DS: Analysis recommended abc123
✅ Agent recommendations generated
```

---

## Agent Development

### Adding New Agent Capabilities

1. **Define agent interface** in `server/types.ts`
2. **Implement agent logic** in `server/services/` following existing patterns
3. **Register agent** with MCP server in `server/services/mcpai.ts`
4. **Add agent permissions** via `server/services/role-permission.ts`
5. **Update coordination logic** in `server/services/project-manager-agent.ts`
6. **Add to initialization** in `server/services/agent-initialization.ts`
7. **Test agent interactions** via WebSocket (`server/realtime.ts`)

### Agent Communication Patterns

- Agents communicate through shared project state in database
- Real-time coordination via WebSocket connections
- Use `shared/schema.ts` types for consistency
- Follow role-based permission model for resource access
- Publish events via route handlers, not within agents

### Agent Testing

**Unit Tests**: `tests/unit/agents/`
```bash
npm run test:unit:agents
```

**E2E Tests**: `tests/e2e/agents/`
```bash
npm run test:e2e-tools
```

**Key Test Files**:
- `tests/unit/agents/multi-agent-consultation.test.ts`
- `tests/unit/agents/agent-context-builder.test.ts`
- `tests/e2e/agents/multi-agent-upload-flow.test.ts`
- `tests/e2e/agents/checkpoint-flow.test.ts`

---

## Tool Development

### Step-by-Step Process

1. **Create Python Script** in `python/` directory for real computation
   ```python
   # python/new_analysis.py
   import json
   import sys

   def perform_analysis(data, config):
       # Real implementation
       return {"result": "..."}

   if __name__ == "__main__":
       input_json = sys.argv[1]
       input_data = json.loads(input_json)
       result = perform_analysis(input_data['data'], input_data['config'])
       print(json.dumps(result))  # Output to stdout
   ```

2. **Add Tool Handler** in `server/services/real-tool-handlers.ts`
   ```typescript
   export const NewAnalysisHandler = {
     async execute(input: any, context: any): Promise<ToolResult> {
       const pythonProcessor = require('./python-processor');
       const result = await pythonProcessor.executePythonScript(
         'new_analysis.py',
         { data: input.data, config: input.config }
       );
       return {
         status: 'success',
         result,
         metrics: { executionTime: Date.now() }
       };
     }
   };
   ```

3. **Register Tool** in `server/services/mcp-tool-registry.ts`
   ```typescript
   MCPToolRegistry.registerTool({
     name: 'new_analysis',
     category: 'analysis',
     description: 'Performs new type of analysis',
     inputSchema: { /* Zod schema */ },
     outputSchema: { /* Zod schema */ },
     permissions: ['data_scientist', 'technical'],
     handler: NewAnalysisHandler
   });
   ```

4. **Update Agent Logic** to use the tool
   ```typescript
   async performNewAnalysis(data: any, config: any) {
     const result = await executeTool(
       'new_analysis',
       this.agentId,
       { data, config },
       { userId: this.userId, projectId: this.projectId }
     );
     return result;
   }
   ```

5. **Add UI Component** in `client/src/components/`
6. **Test Integration** with unit and E2E tests

---

## Planned Improvements

**Status**: Design Complete | **Target**: 4-6 weeks

The agent system is undergoing refactoring to address coordination issues. See [ARCHITECTURE_REFACTORING_ANALYSIS.md](../ARCHITECTURE_REFACTORING_ANALYSIS.md) for full analysis.

### 1. Database-First Checkpoint Architecture

**Problem**: Checkpoints stored in both in-memory Map AND database leads to state inconsistency.

**Target Architecture**:
```typescript
// ALL state goes to database first
class CheckpointManager {
  // Create - DB write first
  async createCheckpoint(checkpoint: AgentCheckpoint): Promise<string> {
    const id = await db.insert(agentCheckpoints).values(checkpoint);
    // In-memory cache invalidated
    this.cache.delete(checkpoint.projectId);
    return id;
  }

  // Read - DB read with caching
  async getCheckpoints(projectId: string): Promise<AgentCheckpoint[]> {
    if (!this.cache.has(projectId)) {
      const checkpoints = await db.select().from(agentCheckpoints).where(...);
      this.cache.set(projectId, checkpoints);
    }
    return this.cache.get(projectId);
  }

  // Update - Atomic DB operation
  async approveCheckpoint(id: string, feedback: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(agentCheckpoints).set({ status: 'approved', feedback });
      // Trigger next step in same transaction
    });
    this.cache.delete(/* projectId */);
  }
}
```

### 2. True Multi-Agent Coordination

**Problem**: Agents don't see each other's results - no shared context.

**Target Architecture**:
```typescript
// Agent results stored in database
interface AgentResult {
  id: string;
  projectId: string;
  agentType: 'data_engineer' | 'data_scientist' | 'business' | 'pm';
  input: any;
  output: any;
  createdAt: Date;
}

// Agents read previous results before executing
class AgentCoordinator {
  async getAgentContext(projectId: string, agentType: string): Promise<AgentContext> {
    // Get all previous agent results
    const previousResults = await db.select()
      .from(agentResults)
      .where(eq(agentResults.projectId, projectId));

    return {
      dataEngineerAssessment: previousResults.find(r => r.agentType === 'data_engineer')?.output,
      dataScientistRecommendations: previousResults.find(r => r.agentType === 'data_scientist')?.output,
      // ... other agent results
    };
  }
}
```

### 3. Approval Gating for Workflow Steps

**Problem**: Journey continues even without user approval on required checkpoints (Issue #17).

**Target Behavior**:
```typescript
// Steps with requiresApproval: true block until approved
async executeJourneyStep(projectId: string, stepId: string): Promise<void> {
  const step = getStepDefinition(stepId);

  // Execute agent work
  const checkpoint = await agent.execute(context);

  if (step.requiresApproval) {
    // Create blocking checkpoint
    await checkpointManager.createBlockingCheckpoint({
      ...checkpoint,
      blocking: true,
      timeoutMinutes: 60
    });

    // DO NOT continue to next step
    // User must explicitly approve via API
    return;
  }

  // Non-blocking steps continue automatically
  await this.advanceToNextStep(projectId);
}
```

### 4. Evidence Chain for Question Answers

**Problem**: Answers can't trace back to source data/analysis (Issue #13).

**Target Architecture**:
```typescript
interface QuestionAnswer {
  questionId: string;           // Stable ID: q_{projectId}_{index}
  answerText: string;
  confidence: number;           // 0-100

  // Full evidence chain
  evidenceChain: {
    dataElementIds: string[];   // Which columns were used
    transformationIds: string[];// Which transformations applied
    insightIds: string[];       // Which insights support the answer
  };

  // Semantic matching (with pgvector)
  embedding: number[];          // Vector for semantic search
}
```

### Migration Priority

| Priority | Component | Effort | Impact |
|----------|-----------|--------|--------|
| 1 | DB-first checkpoints | 5-7 days | Fixes approval workflow |
| 2 | Agent result storage | 3-4 days | Enables multi-agent context |
| 3 | Approval gating | 2-3 days | Fixes Issue #17 |
| 4 | Evidence chain | 3-4 days | Fixes Issue #13 |

**Total Estimated Effort**: 13-18 days

---

## Debugging Agents

### "Agent tools not working"

1. Check `server/index.ts` - Verify initialization functions are called:
   ```typescript
   import { initializeAgents } from './services/agent-initialization';
   import { initializeTools } from './services/tool-initialization';
   import { registerCoreTools } from './services/mcp-tool-registry';
   ```

2. Check server startup logs for:
   - "🔍 Running production validation checks..." (production)
   - "🔍 Running development environment checks..." (development)
   - Tool and agent initialization confirmation messages

3. Verify tool is registered in `server/services/mcp-tool-registry.ts`

4. Check agent permissions in `server/services/role-permission.ts`

5. Use `executeTool()` function - never call services directly

### "Agent coordination failing"

1. Check message broker events in console logs:
   - Look for `📤 Agent → Broadcast:` messages
   - Look for `📨 PM ← Agent:` messages

2. Verify WebSocket connection:
   - Check `server/realtime.ts` is running
   - Verify client connection in `client/src/lib/api.ts`

3. Check Redis connection (if enabled):
   - Development: Can fallback to in-memory EventEmitter
   - Production: Redis is required

4. Review agent method return values - ensure they match expected schema

### "Mock/simulated data appearing"

**Critical**: This indicates production readiness issue!

1. Check `ENABLE_MOCK_MODE` environment variable (must be `false` in production)
2. Verify `server/services/technical-ai-agent.ts:97-107, 582-636` is NOT being called
3. Check `server/services/spark-processor.ts:194-306` for mock fallback
4. Verify Python scripts execute correctly via `server/services/python-processor.ts`
5. Ensure AI API keys are configured (GOOGLE_AI_API_KEY, OPENAI_API_KEY, etc.)

### "Customer Support Agent not working"

⚠️ **Status Unknown**: Check if agent is initialized in `server/services/agent-initialization.ts`

The file exists but may not be wired up in the initialization sequence.

---

**Related Documentation**:
- [← Back to Main](../CLAUDE.md)
- [Architecture Guide](ARCHITECTURE.md)
- [User Journeys Guide](USER_JOURNEYS.md)
- [Billing & Admin Guide](BILLING_ADMIN.md)
