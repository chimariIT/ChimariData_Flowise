# Architecture Guide

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md) | **Last Updated**: December 10, 2025

This document covers the high-level architecture, technology stack, data models, API structure, and deployment considerations.

---

## 📋 Table of Contents

- [Data Flow Architecture](#data-flow-architecture)
- [Technology Stack](#technology-stack)
- [Directory Structure](#directory-structure)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Database Schema](#database-schema)
- [Planned Architecture Improvements](#planned-architecture-improvements) ← **NEW**
- [Data Storage Architecture](#data-storage-architecture)
- [API Routes](#api-routes)
- [Security & Authentication](#security--authentication)
- [Service File Locations](#service-file-locations)
- [Testing Strategy](#testing-strategy)
- [Production Deployment](#production-deployment)
- [Platform-Specific Notes](#platform-specific-notes)
- [Known Issues](#known-issues)

---

## Data Flow Architecture

### Complete Pipeline Overview

The platform follows a structured data pipeline from upload to analysis results:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CHIMARIDATA DATA PIPELINE                                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UPLOAD    │───▶│   PREPARE    │───▶│   TRANSFORM     │───▶│    ANALYZE      │
│   (Data)    │    │ (Verification)│   │ (Data Elements) │    │  (Execution)    │
└─────────────┘    └──────────────┘    └─────────────────┘    └─────────────────┘
      │                  │                     │                      │
      ▼                  ▼                     ▼                      ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ datasets    │    │ PII Analysis │    │ Transformed     │    │ Analysis        │
│ table       │    │ Schema       │    │ Data Storage    │    │ Results         │
│             │    │ Validation   │    │                 │    │ Artifacts       │
└─────────────┘    └──────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Storage Locations

**Upload Phase**:
- Raw data → `datasets.data` (JSONB column)
- Schema → `datasets.schema` (auto-detected)
- Preview → `datasets.preview` (first N rows)
- File ref → `uploads/originals/{projectId}_{timestamp}_{filename}`

**Verification Phase**:
- PII analysis → `datasets.piiAnalysis`
- Quality metrics → `datasets.ingestionMetadata.qualityMetrics`
- Validation status → `projects.status` = 'ready'

**Transformation Phase**:
- Transformed data → `datasets.ingestionMetadata.transformedData`
- Join configuration → `datasets.ingestionMetadata.joinConfig`
- Mapping rules → `datasets.ingestionMetadata.mappings`

**Analysis Phase**:
- Results → `projects.analysisResults`
- Artifacts → `project_artifacts` table + `uploads/artifacts/{projectId}/`
- Q&A pairs → `projects.analysisResults.questionAnswers`

### Multi-Dataset Joining

```
Dataset A                     Dataset B
┌────────────────────┐       ┌────────────────────┐
│ employee_id (PK)   │       │ emp_id (FK)        │
│ name               │──────▶│ engagement_score   │
│ department         │       │ survey_date        │
└────────────────────┘       └────────────────────┘
            │                         │
            └─────────┬───────────────┘
                      ▼
              ┌───────────────┐
              │ Joined Data   │
              │ (Analysis-    │
              │  ready)       │
              └───────────────┘
```

**Join Key Auto-Detection** (`data-transformation-step.tsx`):
- Matches columns with patterns: `*_id`, `*_key`, `*_code`, `employee_id`, `user_id`
- Compares column names across datasets
- Suggests join configuration with confidence scores

**Join Configuration Structure**:
```typescript
interface JoinConfig {
  enabled: boolean;
  type: 'left' | 'inner' | 'outer' | 'right';
  foreignKeys: Array<{
    sourceDataset: string;
    sourceColumn: string;
    targetDataset: string;
    targetColumn: string;
  }>;
}
```

### Analysis Data Source Priority

**Location**: `server/services/analysis-execution.ts`

The analysis execution service uses transformed data with the following priority:

```typescript
// Priority 1: Transformed data from transformation step
dataset.ingestionMetadata.transformedData

// Priority 2: Transformed data in nested metadata
dataset.metadata.transformedData

// Priority 3: Fall back to original upload data
dataset.data || dataset.preview || []
```

### Real-Time Progress Updates

```
┌──────────────┐     WebSocket      ┌──────────────┐
│   Browser    │◄──────────────────▶│   Server     │
│   Client     │                    │   (ws lib)   │
└──────────────┘                    └──────────────┘
       │                                   │
       │  analysis:progress                │
       │◄──────────────────────────────────│
       │  analysis:complete                │
       │◄──────────────────────────────────│
       │  checkpoint:request               │
       │◄──────────────────────────────────│
       │  agent:message                    │
       │◄──────────────────────────────────│
```

**Client**: `client/src/lib/realtime.ts`
**Server**: `server/services/agents/realtime-agent-bridge.ts`
**Broker**: `server/services/agents/agent-message-broker.ts`

### Journey State Flow

```
project-setup → data-upload → data-verification → data-transformation
                                                         │
                                                         ▼
                results ← results-preview ← execute ← plan
```

**Journey State Manager** (`server/services/journey-state-manager.ts`):
```typescript
// Complete a step
await journeyStateManager.completeStep(projectId, 'data-verification');

// Get current state
const state = await journeyStateManager.getState(projectId);
// { currentStep: 'data-transformation', completedSteps: [...], progress: 0.5 }
```

---

## Technology Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite with HMR
- **Styling**: Tailwind CSS + Radix UI components
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: Wouter (lightweight, ~1.2KB)
- **Form Handling**: React Hook Form
- **Data Visualization**: Recharts, D3.js integration

### Backend
- **Runtime**: Node.js with Express.js + TypeScript
- **Real-time**: WebSocket (ws library)
- **Database ORM**: Drizzle ORM with Zod schemas
- **Authentication**: Passport.js with JWT tokens
- **Session Store**: PostgreSQL-backed sessions
- **Background Jobs**: Bull queue (Redis-backed)

### Data & Analytics
- **Database**: PostgreSQL 14+ with JSONB support
- **Caching**: Redis (optional in dev, required in production)
- **Big Data**: Apache Spark for distributed processing
- **ML Pipeline**: Python bridge with scikit-learn, statsmodels
- **AI Providers**: Google Gemini, OpenAI GPT, Anthropic Claude

### DevOps & Infrastructure
- **Container**: Docker with docker-compose
- **CI/CD**: GitHub Actions ready
- **Monitoring**: Sentry (error tracking), DataDog (metrics)
- **Payment**: Stripe with webhook support
- **Email**: SendGrid for transactional emails

---

## Directory Structure

```
chimariapp2/
├── client/                          # React frontend application
│   ├── src/
│   │   ├── components/              # Reusable UI components (100+ files)
│   │   │   ├── ui/                  # Radix UI primitives
│   │   │   ├── admin/               # Admin-specific components
│   │   │   ├── agent-*.tsx          # Agent-related UI components
│   │   │   └── *-modal.tsx          # Modal dialog components
│   │   ├── pages/                   # Route-level pages (40+ files)
│   │   │   ├── admin/               # Admin dashboard pages (8 files)
│   │   │   ├── auth*.tsx            # Authentication pages
│   │   │   ├── *-step.tsx           # Journey step pages
│   │   │   └── *.tsx                # Other route pages
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── useOptimizedAuth.ts  # Authentication hook
│   │   │   ├── useProjectSession.ts # Project state hook
│   │   │   └── use*.ts              # Domain-specific hooks
│   │   ├── lib/                     # Utility functions
│   │   │   ├── api.ts               # API client (centralized)
│   │   │   ├── realtime.ts          # WebSocket client
│   │   │   └── utils.ts             # Helper functions
│   │   └── contexts/                # React contexts
│   │       └── ConsultantContext.tsx
│   └── public/                      # Static assets
│
├── server/                          # Express.js backend
│   ├── routes/                      # API route handlers (57 files)
│   │   ├── auth.ts                  # Authentication (REAL AUTH - use this)
│   │   ├── project*.ts              # Project management (5 files)
│   │   ├── data*.ts                 # Data management (6 files)
│   │   ├── analysis*.ts             # Analysis execution (3 files)
│   │   ├── admin*.ts                # Admin endpoints (5 files)
│   │   ├── billing.ts               # Billing & subscriptions
│   │   ├── pricing.ts               # Pricing calculations
│   │   └── *.ts                     # Other domain routes
│   ├── services/                    # Business logic (PREFERRED)
│   │   ├── agents/                  # Agent coordination
│   │   │   ├── message-broker.ts    # EventEmitter-based broker
│   │   │   └── realtime-agent-bridge.ts
│   │   ├── billing/                 # Billing services
│   │   │   └── unified-billing-service.ts  # Consolidated billing
│   │   ├── project-manager/         # PM agent modules
│   │   │   ├── journey-planner.ts
│   │   │   ├── journey-template-service.ts
│   │   │   ├── agent-catalog.ts
│   │   │   ├── types.ts
│   │   │   └── audit-log.ts
│   │   ├── *-agent.ts               # Agent implementations (6 agents)
│   │   ├── mcp-tool-registry.ts     # Tool registry
│   │   ├── real-tool-handlers.ts    # Tool → service mappings
│   │   ├── python-processor.ts      # Python bridge
│   │   ├── spark-processor.ts       # Spark integration
│   │   └── *.ts                     # Other services
│   ├── middleware/                  # Express middleware
│   │   ├── ownership.ts             # Project access control
│   │   ├── rbac.ts                  # Role-based access
│   │   ├── security-headers.ts      # Security headers
│   │   └── ai-access-control.ts     # AI usage limits
│   ├── index.ts                     # Server entry point
│   ├── realtime.ts                  # WebSocket server
│   └── db.ts                        # Database connection
│
├── shared/                          # Shared TypeScript code
│   ├── schema.ts                    # Drizzle schemas (Zod)
│   ├── canonical-types.ts           # Type definitions
│   ├── unified-subscription-tiers.ts
│   ├── feature-definitions.ts
│   └── journey-templates.ts
│
├── python/                          # Python analysis scripts (12 files)
│   ├── statistical_tests.py
│   ├── ml_training.py
│   ├── visualization_generator.py
│   ├── comprehensive_ml_lifecycle.py
│   ├── spark/
│   │   └── spark_bridge.py
│   └── *.py
│
├── python_scripts/                  # Additional Python utilities (7 files)
│   ├── data_analyzer.py
│   ├── advanced_anova.py
│   └── *.py
│
├── migrations/                      # SQL migration files
│   ├── 009_create_project_states.sql
│   ├── add_analysis_plans_table.sql
│   ├── add_journey_state_to_projects.sql
│   └── *.sql
│
├── tests/                           # Testing suite (99 spec files)
│   ├── unit/                        # Vitest unit tests
│   ├── integration/                 # Integration tests
│   ├── e2e/agents/                  # Multi-agent E2E
│   └── *.spec.ts                    # Playwright tests
│
├── docs/                            # Documentation
│   ├── ARCHITECTURE.md              # This file
│   ├── AGENTIC_SYSTEM.md
│   ├── USER_JOURNEYS.md
│   ├── BILLING_ADMIN.md
│   ├── KNOWN_DUPLICATES.md
│   └── archives/sessions/           # 148+ historical docs
│
├── uploads/                         # Runtime file uploads
│   ├── originals/
│   ├── artifacts/
│   └── templates/
│
└── Configuration Files
    ├── vite.config.ts               # Frontend build config
    ├── drizzle.config.ts            # Database ORM config
    ├── playwright.config.ts         # E2E testing config
    ├── vitest.backend.config.ts     # Backend unit testing
    ├── tsconfig.json                # TypeScript compiler
    ├── tailwind.config.ts           # CSS framework
    ├── package.json                 # Dependencies & scripts
    └── .env                         # Environment variables
```

---

## Frontend Architecture

### Routing (Wouter)

**Location**: `client/src/App.tsx`

The platform uses Wouter for lightweight client-side routing:

```typescript
// Static routes
<Route path="/" component={MainLanding} />
<Route path="/login" component={AuthLogin} />
<Route path="/dashboard" component={Dashboard} />
<Route path="/pricing" component={Pricing} />

// Dynamic journey routes (NEW PATTERN)
<Route path="/journeys/:type/data" component={DataStep} />
<Route path="/journeys/:type/data-verification" component={DataVerificationStep} />
<Route path="/journeys/:type/plan" component={PlanStep} />
<Route path="/journeys/:type/prepare" component={PrepareStep} />
<Route path="/journeys/:type/execute" component={ExecuteStep} />
<Route path="/journeys/:type/preview" component={ResultsPreviewStep} />
<Route path="/journeys/:type/results" component={ResultsStep} />

// Legacy journey routes (maintained for compatibility)
<Route path="/data-step/:projectId" component={DataStep} />
<Route path="/plan-step/:projectId" component={PlanStep} />
// ... other legacy routes

// Admin routes
<Route path="/admin" component={AdminDashboard} />
<Route path="/admin/pricing-services" component={PricingServices} />
```

**Protected Routes**: Use `useOptimizedAuth()` hook to guard authenticated routes.

### State Management

#### React Query
**Location**: `client/src/lib/api.ts`

All server state managed through React Query:
- Query invalidation on mutations
- Automatic background refetching
- Optimistic updates for better UX
- Error handling and retry logic

#### Local State
- Component state: `useState`, `useReducer`
- Global state: React Context (e.g., `ConsultantContext`)
- Form state: React Hook Form

#### WebSocket State
**Location**: `client/src/lib/realtime.ts`

Real-time updates for:
- Agent messages
- Project state changes
- Analysis progress
- Checkpoint requests

### Critical Hooks

#### `useOptimizedAuth()`
**Location**: `client/src/hooks/useOptimizedAuth.ts`

Provides authentication state and user data:
```typescript
const { user, isAuthenticated, loading, login, logout } = useOptimizedAuth();
```

#### `useProjectSession()`
**Location**: `client/src/hooks/useProjectSession.ts`

Manages current project and journey state:
```typescript
const { project, journeyState, updateJourneyState } = useProjectSession(projectId);
```

### API Client Pattern

**Location**: `client/src/lib/api.ts`

All API calls go through centralized client:
```typescript
import { apiClient } from '@/lib/api';

const result = await apiClient.post('/api/projects', projectData);
const project = await apiClient.get(`/api/projects/${projectId}`);
```

**Benefits**:
- Centralized error handling
- Automatic authentication header injection
- Request/response interceptors
- TypeScript type safety

---

## Backend Architecture

### Server Initialization

**Location**: `server/index.ts`

Critical initialization order:
```typescript
// Line 15-17: Three-tier initialization pattern
import { initializeAgents } from './services/agent-initialization';
import { initializeTools } from './services/tool-initialization';
import { registerCoreTools } from './services/mcp-tool-registry';

// Startup sequence:
1. registerCoreTools()      // Static tool definitions
2. initializeTools()        // Dynamic tool setup
3. initializeAgents()       // Agent-to-tool bindings

// Line 66-104: Production validation
if (process.env.NODE_ENV === 'production') {
  const validation = await validateProductionReadiness();
  if (!validation.ready) {
    process.exit(1); // Prevents startup with critical issues
  }
}
```

### Database Connection

**Multiple configurations exist** (see [Service File Locations](#service-file-locations)):
- `server/db.ts` - Primary database connection
- `server/db-flexible.ts` - Flexible connection options
- `server/enhanced-db.ts` - Enhanced features
- `server/db-sqlite-setup.ts` - SQLite fallback (development)

**Recommendation**: Use `server/db.ts` for standard database operations.

### WebSocket Server

**Location**: `server/realtime.ts`

Real-time agent-to-user communication:
```typescript
class RealtimeServer {
  sendProjectUpdate(projectId: string, update: any)
  sendAgentMessage(userId: string, agentType: string, message: any)
  broadcastToProject(projectId: string, event: string, data: any)
}
```

**Message Types**:
- `agent:message` - Agent communication
- `project:update` - Project state changes
- `analysis:progress` - Long-running analysis status
- `checkpoint:request` - User approval needed
- `error:notification` - Real-time error alerts

---

## Database Schema

**Location**: `shared/schema.ts`

### Core Tables

#### 1. Users Table
```typescript
{
  id: string (UUID)
  email: string (unique)
  passwordHash: string
  isAdmin: boolean
  userRole: 'non-tech' | 'business' | 'technical' | 'consultation'
  subscriptionTier: 'trial' | 'starter' | 'professional' | 'enterprise'
  createdAt: timestamp
  // ... other fields
}
```

#### 2. Projects Table
```typescript
{
  id: string (UUID)
  userId: string (foreign key → users)
  name: string
  description: string
  data: JSONB                    // Inline data storage (array of rows)
  schema: JSONB                  // Column metadata and types
  journeyType: 'ai_guided' | 'template_based' | 'self_service' | 'consultation' | 'custom'
  journeyState: JSONB            // Current step and progress
  createdAt: timestamp
  // ... other fields
}
```

**CRITICAL**: Projects table supports **BOTH** inline data storage (`data` column) AND relationships to separate datasets table.

#### 3. Datasets Table (EXISTS)
```typescript
{
  id: string (UUID)
  userId: string (foreign key → users)
  sourceType: 'upload' | 'live' | 'stream'
  originalFileName: string
  schema: JSONB
  recordCount: number
  preview: JSONB
  data: JSONB                    // Full dataset
  mode: 'static' | 'stream' | 'refreshable'
  status: 'processing' | 'ready' | 'error'
  piiAnalysis: JSONB
  ingestionMetadata: JSONB
  // ... other fields
}
```

#### 4. Project-Datasets Junction Table (Many-to-Many)
```typescript
{
  projectId: string (foreign key → projects)
  datasetId: string (foreign key → datasets)
  role: 'primary' | 'secondary' | 'joined'
  createdAt: timestamp
}
```

**Architecture Note**: The system supports:
- **Inline storage**: Small-to-medium datasets in `projects.data`
- **Separate datasets**: Large/streaming datasets in `datasets` table
- **Hybrid**: Projects can use both approaches

#### 5. Analysis Plans Table
```typescript
{
  id: string (UUID)
  projectId: string (foreign key → projects)
  planSteps: JSONB               // Array of plan steps
  visualizations: JSONB          // Planned visualizations
  mlModels: JSONB                // Planned ML models
  costBreakdown: JSONB           // Resource estimation
  agentContributions: JSONB      // PM, Data Engineer, Data Scientist inputs
  approvalStatus: 'pending' | 'approved' | 'modified' | 'rejected'
  // ... other fields
}
```

#### 6. Additional Tables
- **Service Pricing**: Service pricing configuration and rates
- **Pricing Config**: Feature pricing and subscription tier configs
- **Knowledge Graph**: Agent knowledge base and relationships
- **Artifacts**: Generated outputs (visualizations, models, reports)
- **Streaming Sources**: Real-time data ingestion configs

### Schema Management

**Editing Schema**:
1. Modify `shared/schema.ts` using Zod
2. **CRITICAL**: Run `npm run db:push` (uses `drizzle-kit up:pg`)
3. Test migration with sample data
4. Update API endpoints and frontend

**Migrations**:
- SQL migration files in `migrations/` directory
- Run with `npm run db:migrate`
- Project-specific: `npm run db:migrate:project-states`

---

## Planned Architecture Improvements

**Status**: Design Complete | **Target**: 4-6 weeks to stability

The platform is undergoing architectural refactoring to address technical debt. See [ARCHITECTURE_REFACTORING_ANALYSIS.md](../ARCHITECTURE_REFACTORING_ANALYSIS.md) for full analysis.

### 1. pgvector + Strict Validation Architecture

**Design Document**: [PGVECTOR_VALIDATION_ARCHITECTURE.md](../PGVECTOR_VALIDATION_ARCHITECTURE.md)

**Key Changes**:
- **pgvector extension** - Enable semantic search for questions, insights, and answers
- **Strict Zod validation** - Fail-fast validation at API boundaries
- **Normalized tables** - Replace JSONB agent results with proper relational tables
- **Embedding service** - Generate and store vector embeddings for semantic matching

**New Tables (Planned)**:
```sql
-- Questions with embeddings for semantic search
project_questions (id, project_id, text, embedding vector(1536), requirements JSONB, answer JSONB)

-- Normalized agent execution tracking
agent_executions (id, project_id, agent_type, status, started_at, completed_at, tokens_used)

-- Data engineer outputs (not JSONB)
de_quality_reports (id, execution_id, dataset_id, quality_score, row_count, column_count)

-- Analysis results with proper columns
ds_analysis_results (id, execution_id, analysis_type, p_value, coefficient, r_squared, confidence)

-- Insights with embeddings
insights (id, analysis_result_id, finding, embedding vector(1536), confidence)

-- Question answers with evidence chain
question_answers (id, question_id, answer_text, embedding vector(1536), confidence, generated_by)
```

### 2. Single Source of Truth Consolidation

**Current Problem**: Data exists in 3-8 locations depending on entity type.

| Entity | Current Locations | Target Location |
|--------|-------------------|-----------------|
| Questions | session, project, localStorage | `project_questions` table |
| Transformations | 8 different JSONB locations | `datasets.transformed_data` + `datasets.active_version` |
| Journey State | 5 different fields | `projects.journey_state` (single JSONB) |
| Checkpoints | In-memory Map + DB | Database only (no memory) |

### 3. Question-to-Answer Pipeline

**Design Document**: [ARCHITECTURE_DESIGN_AND_IMPLEMENTATION.md](../ARCHITECTURE_DESIGN_AND_IMPLEMENTATION.md)

**Question Lifecycle**:
```
1. User enters question (prepare-step)
   → Creates ProjectQuestion with stable ID: q_{projectId}_{index}

2. Requirements generation
   → Updates question.requirements with dataElements, recommendedAnalyses

3. Transformation mapping
   → Updates question.transformation with mappings, columnsUsed

4. Analysis execution
   → Updates question.analysis with insightIds, techniquesUsed

5. Answer generation
   → Updates question.answer with text, confidence, evidenceChain
```

### 4. Agent Checkpoint DB-First Architecture

**Current Problem**: Checkpoints stored in-memory Map, lost on server restart.

**Target Architecture**:
```typescript
// All checkpoints go to DB first
class CheckpointManager {
  async createCheckpoint(checkpoint): Promise<string>;     // DB write
  async getCheckpoints(projectId): Promise<Checkpoint[]>;  // DB read (cached)
  async approveCheckpoint(id, feedback): Promise<void>;    // Atomic DB update
}

// No in-memory state - DB is source of truth
```

### 5. Semantic Data Pipeline (IMPLEMENTED - Dec 2025)

**Status**: ✅ Implemented | **Design Document**: [VECTOR_DATA_PIPELINE_DESIGN.md](VECTOR_DATA_PIPELINE_DESIGN.md)

The semantic data pipeline uses vector embeddings to create semantic linkages from questions → data elements → transformations → analysis. This replaces brittle keyword-based matching with meaning-based similarity.

**New Database Tables**:
```sql
-- Data elements with semantic descriptions and embeddings
data_elements (id, project_id, element_name, element_type, data_type,
               semantic_description, embedding JSONB, source_dataset_id,
               source_column, is_available, analysis_roles[])

-- Transformation definitions with semantic descriptions
transformation_definitions (id, project_id, transformation_name, transformation_type,
                           semantic_description, embedding JSONB, source_elements[],
                           target_elements[], config JSONB, execution_order, depends_on[],
                           status)

-- Question-to-element semantic links
question_element_links (id, question_id, element_id, similarity_score, link_type, reasoning)

-- Element-to-transformation links
element_transformation_links (id, element_id, transformation_id, similarity_score, link_type)
```

**Service**: `server/services/semantic-data-pipeline.ts`
**API Endpoints**: `server/routes/semantic-pipeline.ts`

**Key Methods**:
| Method | Purpose |
|--------|---------|
| `extractDataElements()` | Extract semantic elements from datasets, generate embeddings |
| `linkQuestionsToElements()` | Link questions to elements via cosine similarity (≥0.5 threshold) |
| `inferTransformations()` | Auto-detect joins, aggregations, filters from question semantics |
| `buildEvidenceChain()` | Create Q→E→T traceability for answers |
| `getTransformationPlan()` | Get complete transformation plan with related questions |

**API Endpoints**:
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/semantic-pipeline/:id/run-full-pipeline` | POST | Run complete semantic pipeline |
| `/api/semantic-pipeline/:id/extract-elements` | POST | Extract data elements from datasets |
| `/api/semantic-pipeline/:id/link-questions` | POST | Link questions to elements |
| `/api/semantic-pipeline/:id/infer-transformations` | POST | Infer required transformations |
| `/api/semantic-pipeline/:id/transformation-plan` | GET | Get transformation plan |
| `/api/semantic-pipeline/:id/evidence-chain/:qId` | GET | Get evidence chain for question |

### 6. Migration Plan

| Phase | Component | Effort | Status |
|-------|-----------|--------|--------|
| 1 | Enable pgvector extension | 1 day | Planned |
| 2 | Create normalized tables | 1-2 days | ✅ Done |
| 3 | Add Zod validation middleware | 2-3 days | Planned |
| 4 | Migrate existing data | 1-2 days | Planned |
| 5 | Generate embeddings | 1-2 days | ✅ Done (via semantic pipeline) |
| 6 | Switch services to V2 | 1-2 days | Planned |

**Total Estimated Effort**: 15-20 days

---

## Data Storage Architecture

### Inline Data Storage (Primary Pattern)

```typescript
// Data stored directly in projects table
const project = await db.select().from(projects)
  .where(eq(projects.id, projectId))
  .limit(1);

const dataArray = project[0].data || [];       // Actual data rows
const schema = project[0].schema || {};        // Column metadata
```

**Advantages**:
- Simpler data model
- Faster queries (no joins)
- Easier ownership verification
- Suitable for datasets up to moderate size

### Separate Datasets Table (For Large Data)

```typescript
// Fetch project with linked datasets
const projectDatasets = await db.select()
  .from(projectDatasets)
  .where(eq(projectDatasets.projectId, projectId));

const datasets = await db.select()
  .from(datasets)
  .where(inArray(datasets.id, datasetIds));
```

**Use Cases**:
- Datasets >100MB
- Streaming data sources
- Shared datasets across projects
- Live data connections

### Spark Integration (For Very Large Data)

**Location**: `server/services/spark-processor.ts`

- Distributed computing for datasets >1GB
- Real-time streaming analytics
- Large-scale ML model training
- Complex multi-table joins

**→ See**: [SPARK_FULL_SETUP_GUIDE.md](../SPARK_FULL_SETUP_GUIDE.md)

### Journey Session Data Normalization

```
prepare-step.tsx → project-session routes           →   journey-state-manager  → dashboards/agents
                     (project_sessions table)           (`projects.journeyProgress` JSON)
```

- **`project_sessions`** (`shared/schema.ts`) is the server-authoritative record for every multi-step journey. Each phase writes into the JSON buckets (`prepareData`, `dataUploadData`, `executeData`, `workflowState`) so we no longer depend on `localStorage` or scattered columns.
- **`project_questions`** stores each business question with ordering, status, and embeddings. Services such as `analysis-execution.ts` and `server/routes/semantic-pipeline.ts` already query this table, so it is the single source of truth for question text.
- **`projects.journeyProgress`** captures the durable journey summary (`status`, `currentPhase`, `phaseCompletionStatus`, `goals[]`). Dashboards, billing, and support tooling should hydrate from this JSON rather than bespoke columns like `journeyStatus`.
- **`JourneyExecutionMachine`** persists transient orchestration state through `project_sessions.workflowState`, then emits normalized snapshots via `journey-state-manager`. When a session links to a project, `journeyProgress` keeps only the summarized view needed for resumes, analytics, and approvals.

**Field responsibilities**:

| Concern | Runtime store | Durable store | Consumers |
|---------|---------------|---------------|-----------|
| Analysis goal text | `project_sessions.prepareData.analysisGoal` | `projects.journeyProgress.goals[]` | Template selection, recommendation agents, billing guardrails |
| Business questions | `project_sessions.prepareData.businessQuestions` | `project_questions` rows | Project Manager agent, DS agent, dashboards |
| Journey step/phase | `project_sessions.currentStep` + `workflowState` | `projects.journeyProgress.status` + `stepCompletionStatus` | Journey UI, checkpoint system, billing |
| Agent execution state | `project_sessions.workflowState` | `agent_executions` + `projects.journeyProgress.phaseCompletionStatus` | Agent orchestrator, realtime fan-out |

### Legacy Field Decommission Plan

| Legacy field/table | Successor | Migration notes |
|--------------------|-----------|-----------------|
| `projects.analysis_goals` | `project_sessions.prepareData.analysisGoal` → `projects.journeyProgress.goals[]` | Backfill the JSONB goals array for existing projects, update `analysis-execution.ts` & `template.ts` to read from `project_sessions` when present, then drop the column after one release. |
| `projects.business_questions` | `project_questions` rows + `project_sessions.prepareData.businessQuestions` | Split newline or comma-delimited strings into ordered rows, persist edits in the session, and treat the table as the only query source for agents/tests. |
| `projects."journeyStatus"` | `project_sessions.currentStep` + `projects.journeyProgress.status` | Dashboards should compute status from the JSON block; add a fallback getter that derives it from `journeyStatus` during the cutover to avoid regressions. |
| `journey_execution_states` table | `project_sessions.workflowState` + summarized `journeyProgress` | Wire `JourneyExecutionMachine.persistState/restoreState` to the session table so restarts never consult the deprecated table; once the hooks land, archive the standalone table. |

**Rollout guardrails**
- Run `npm run db:push` after updating `shared/schema.ts` to ensure the JSON columns stay in sync.
- Add dual-write shims inside `project-session` routes so QA can flip `DISABLE_LEGACY_JOURNEY_FIELDS=true` in `.env` and run `npm run test:user-journeys` before the final drop.
- Monitor `PROJECT_DASHBOARD_ISSUES_AND_FIXES.md` KPIs (resume rate, paused journeys) to confirm the normalized data feeds every widget before removing the legacy schema.

---

## API Routes

**Location**: `server/routes/`

### Route Categories

#### Project & Journey Management (5 files)
- `project.ts` - Project CRUD, agent coordination, message broker
- `project-optimized.ts` - Optimized queries and performance
- `project-session.ts` - Session management
- `project-manager.ts` - PM agent interactions
- `custom-journey.ts` - Custom journey builder

#### Data Management (9 files)
- `data.ts` - Data upload and management
- `data-workflow.ts` - Resilient data workflow with clarifications
- `data-transformation.ts` - Transformation operations
- `data-verification.ts` - Verification and validation
- `analyze-data.ts` - Data analysis execution
- `datasets.ts` - Dataset CRUD operations
- `live-sources.ts` - Live data source connections
- `streaming-sources.ts` - Streaming data management
- `scraping-jobs.ts` - Web scraping jobs

#### Analysis & Execution (5 files)
- `analysis-execution.ts` - Execution and results
- `analysis-plans.ts` - Analysis plan management (plan-step)
- `enhanced-analysis.ts` - Enhanced analysis features
- `pm-clarification.ts` - PM clarification requests
- `artifacts.ts` - Generated artifact management

#### Authentication & Users (2 files)
- `auth.ts` - Authentication, registration, OAuth (**REAL AUTH - use this**)
- `user-role.ts` - User role management

#### Billing & Pricing (5 files)
- `billing.ts` - Billing and subscription management
- `pricing.ts` - Pricing calculation and estimation
- `admin-billing.ts` - Admin billing management
- `admin-service-pricing.ts` - Service pricing configuration
- `analysis-payment.ts` - Analysis-specific payments

#### Administration (6 files)
- `admin.ts` - Admin dashboard and user management
- `admin-secured.ts` - Secured admin endpoints
- `admin-consultation.ts` - Consultation management
- `admin-consultation-pricing.ts` - Consultation pricing config
- `system.ts` - System configuration
- `system-status.ts` - System health checks

#### Monitoring & Integration (8 files)
- `performance.ts` - Performance metrics
- `performance-webhooks.ts` - Performance monitoring webhooks
- `stripe-webhook-test.ts` - Stripe webhook testing
- `stripe-webhooks.ts` - Stripe webhook handlers
- `payment.ts` - Payment processing
- `analytics.ts` - Analytics and insights
- `usage.ts` - Usage tracking
- `export.ts` - Data export functionality

#### Other Services (17 files)
- `consultation.ts` - Consultation requests
- `audience-formatting.ts` - Audience data formatting
- `business-template-synthesis.ts` - Business template generation
- `template.ts` - Template management
- `template-onboarding.ts` - Template onboarding flow
- `ai.ts` - AI service endpoints
- `agents.ts` - Agent management
- `workflow.ts` - Workflow orchestration
- `health.ts` - Health check endpoint
- `conversation.ts` - Conversation management
- `interactive.ts` - Interactive features
- `ai-payment.ts` - AI payment integration
- `index.ts` - Route registration

### Route Registration Pattern

**Location**: `server/routes/index.ts`

```typescript
router.use('/projects', dataVerificationRouter, projectRouter);
router.use('/', dataTransformationRouter);
router.use('/data-workflow', dataWorkflowRouter);
router.use('/admin', ensureAuthenticated, adminRouter);
```

**Middleware Chaining**: Data verification runs before project routes to ensure quality checks.

---

## Security & Authentication

### Authentication Architecture

**Location**: `server/routes/auth.ts`

⚠️ **CRITICAL**: Mock authentication middleware (`server/middleware/auth.ts`) was **deleted** October 28, 2024. All routes use real authentication only.

#### Authentication Flow
```
User Request
  ↓
ensureAuthenticated middleware (server/routes/auth.ts)
  ↓
Validates JWT token from Authorization header
  ↓
Fetches full user object from database
  ↓
Attaches to req.user {id, email, isAdmin, userRole, subscriptionTier}
  ↓
Route handler
```

#### Implementation Pattern
```typescript
import { ensureAuthenticated } from './routes/auth';

router.get('/protected-route', ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;
  const userRole = (req.user as any)?.userRole || 'non-tech';
  // ... handler logic
});
```

#### Authentication Methods
- **Email/Password**: Bcrypt hashing (10 rounds), email verification via SendGrid
- **OAuth Providers**: Google (primary), Microsoft/Apple ready
- **Configuration**: `server/oauth-config.ts`, `server/oauth-providers.ts`
- **Session Management**: Passport.js with PostgreSQL session store
- **Security**: JWT tokens, CSRF protection, secure cookies

### Ownership Verification

**Location**: `server/middleware/ownership.ts`

#### Ownership Flow
```
Route Handler
  ↓
Extract userId from req.user
  ↓
Extract isAdmin from req.user
  ↓
Call canAccessProject(userId, projectId, isAdmin)
  ↓
If admin: ✅ Allow access to ANY project
If not admin: Check if project.userId === userId
  ↓
If access denied: 403 Forbidden
If allowed: Continue with project data
```

#### Helper Functions
```typescript
import { canAccessProject, isAdmin, getUserRole } from '../middleware/ownership';

// Check project access with admin bypass
const accessCheck = await canAccessProject(userId, projectId, isAdmin);
if (!accessCheck.allowed) {
  return res.status(403).json({ success: false, error: accessCheck.reason });
}
const project = accessCheck.project; // Project data if allowed

// Check if user is admin
if (isAdmin(req)) {
  // Admin-only logic
}

// Get user role
const userRole = getUserRole(req); // Returns 'non-tech', 'business', 'technical', etc.
```

### Access Control

- **Authentication**: JWT token validation via `ensureAuthenticated` middleware
- **Ownership**: Project access controlled via `canAccessProject()` helper
- **Admin Bypass**: Users with `isAdmin=true` can access all projects
- **Role-Based Permissions**: `non-tech`, `business`, `technical`, `consultation`
- **Permission Service**: `server/services/role-permission.ts`
- **API Rate Limiting**: IPv6-safe rate limiting for public endpoints
- **Security Headers**: `server/middleware/security-headers.ts`

### Data Protection

- **PII Detection**: Automatic via `server/services/unified-pii-processor.ts`
- **Compliance**: GDPR and CCPA compliance features
- **Encryption**: Data at rest and in transit
- **Audit Trails**: All data access logged

---

## Service File Locations

⚠️ **IMPORTANT**: The codebase has service files in **TWO locations** due to ongoing refactoring:

- **Legacy location**: `server/*.ts` (e.g., `server/file-processor.ts`)
- **Modern location**: `server/services/*.ts` (e.g., `server/services/file-processor.ts`)

### Current State
- Some services exist in BOTH locations with different implementations
- `server/services/` is the **target architecture**
- Migration is incomplete

### For New Development
- **Always use `server/services/`** for new services
- Check if service exists in both locations before modifying
- **Prefer newer `server/services/` implementation** when conflicts exist

### Known Duplicates
- File processor: `server/file-processor.ts` vs `server/services/file-processor.ts`
- PII handling: `server/unified-pii-processor.ts` vs `server/services/unified-pii-processor.ts`
- Billing: **Consolidated** to `server/services/billing/unified-billing-service.ts`

**→ See**: [docs/KNOWN_DUPLICATES.md](KNOWN_DUPLICATES.md) for complete tracking

---

## Testing Strategy

### Critical Tests (Run Before Major Changes)
```bash
npm run test:user-journeys    # Critical user journey regression tests
npm run test:production       # Production-ready end-to-end flow tests
```

### Test Categories

#### End-to-End Tests (Playwright)
**Total**: 99 test spec files

```bash
npm run test                  # All Playwright tests
npm run test:ui              # Playwright UI mode
npm run test:debug           # Debug mode
```

**Key Tests**:
- `tests/user-journey-screenshots.spec.ts` - Visual regression
- `tests/hr-user-journeys-e2e.spec.ts` - HR journey flows
- `tests/existing-users-journey.spec.ts` - Returning user flows
- `tests/register-and-login-journey.spec.ts` - Auth flows

#### User Journey Tests
```bash
npm run test:user-journeys         # Critical path tests
npm run test:user-journeys-headed  # With browser UI
```

#### Production Tests
```bash
npm run test:production           # Full production suite
npm run test:production-users     # User workflow tests
npm run test:production-admin     # Admin billing/subscription tests
npm run test:production-agents    # Agent & tool management tests
```

#### Unit Tests (Vitest)
```bash
npm run test:unit            # Run all unit tests
npm run test:unit-watch      # Watch mode
npm run test:unit:agents     # Agent-specific tests
npm run test:backend         # Backend tests
npm run test:client          # Client tests
```

**Key Unit Tests**:
- `tests/unit/agents/` - Agent behavior tests
- `tests/unit/validation/` - Schema validation tests
- `tests/integration/` - Service integration tests

#### Granular Feature Tests
```bash
npm run test:auth             # Authentication smoke tests
npm run test:nav              # Navigation smoke tests
npm run test:dashboard        # Dashboard tests
npm run test:routes-auth      # Protected routes tests
```

### Test Organization

With 99 test files, organization is critical:
- `tests/unit/` - Vitest unit tests
- `tests/integration/` - Integration tests
- `tests/e2e/agents/` - Multi-agent E2E tests
- `tests/*.spec.ts` - Playwright E2E tests (root level)

---

## Production Deployment

### Environment Configuration

**Required Variables**:
```bash
NODE_ENV=production
DATABASE_URL="postgresql://..."
GOOGLE_AI_API_KEY="..."              # or OPENAI_API_KEY or ANTHROPIC_API_KEY
SESSION_SECRET="strong-random-value"
JWT_SECRET="strong-random-value"
REDIS_ENABLED="true"                 # Auto-enabled in production
REDIS_URL="redis://..."
STRIPE_SECRET_KEY="sk_live_..."
VITE_STRIPE_PUBLIC_KEY="pk_live_..."
SENDGRID_API_KEY="SG..."
CORS_ORIGIN="https://yourdomain.com"
```

**Feature Flags**:
```bash
ENABLE_MOCK_MODE="false"            # CRITICAL - must be false
ENABLE_RATE_LIMITING="true"
ENABLE_WEBHOOK_SIGNATURE_VERIFICATION="true"
```

### Production Validation

**Location**: `server/services/production-validator.ts`

Server validates on startup and **exits with code 1** if validation fails:

**Validation Checks**:
- Python bridge connectivity and script accessibility
- Spark cluster availability (if `SPARK_ENABLED=true`)
- Redis connection (required in production)
- Database connectivity and schema validation
- AI provider API key configuration
- Mock/simulated data detection (fails if found)

**Server Startup Flow** (`server/index.ts:66-102`):
```typescript
if (process.env.NODE_ENV === 'production') {
  const validation = await validateProductionReadiness();
  if (!validation.ready) {
    console.error('Critical failures preventing startup');
    process.exit(1); // Prevents deployment with config issues
  }
}
```

### Build and Deploy

```bash
# Install dependencies
npm install

# Run database migrations
npm run db:push

# Build for production
npm run build

# Start production server
npm run start
```

### Performance Considerations

**TypeScript Compilation**:
```json
"check": "node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc"
```
Large codebase requires 8GB heap for type checking.

**Database Connection Pooling**:
```bash
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_TIMEOUT=10000
```

**Spark Configuration** (if enabled):
```bash
SPARK_ENABLED="true"
SPARK_MASTER_URL="spark://master:7077"
SPARK_APP_NAME="ChimariData-Analytics"
```

---

## Platform-Specific Notes

### Windows Development

This codebase is developed and tested on Windows.

**Path Handling**:
- All paths use forward slashes (`/`) for cross-platform compatibility
- PowerShell scripts available (`.ps1` files)
- Git bash recommended for Unix-like commands

**Running Services**:
```powershell
# PostgreSQL
.\start-postgresql.ps1

# Redis (Docker)
docker-compose -f docker-compose.dev.yml up -d

# Development server
npm run dev
```

**Python Environment Setup**:
```bash
# Install Python 3.8+ and verify
python --version  # or python3 --version

# Install required dependencies
pip install -r python/requirements.txt
```

**Common Windows Issues**:
- Bash tool errors: Ensure Git Bash or WSL is in PATH
- Python scripts: Require Python 3.8+ in PATH, may need to use `python` instead of `python3`
- Long paths: Enable long path support in Windows
- Port conflicts: Check ports 5000 (server) and 5173 (client)
- TypeScript compilation: Large codebase requires 8GB heap

**Performance Considerations**:
- TypeScript type checking may be slower on Windows
- Consider WSL2 for better Node.js/Python integration
- Docker Desktop requires WSL2 backend for optimal performance

---

## Known Issues

### Recent Bug Fixes (Dec 8, 2025) ✅

| Issue | Fix Applied | File(s) Modified |
|-------|-------------|------------------|
| Data Verification Continue button not working | Created `PUT /api/projects/:id/verify` endpoint | `server/routes/project.ts` |
| Export Report returning 404 | Created `GET /api/projects/:id/export/report` endpoint | `server/routes/project.ts` |
| Step-by-Step Analysis 404 | Fixed URL from `/api/step-by-step-analysis` to `/api/ai/step-by-step-analysis` | `client/src/lib/api.ts` |
| Checkpoint Feedback 500 errors | Improved error handling (404 for missing checkpoints) | `server/routes/project.ts` |
| Multi-Dataset Join failing | Added auto-detection of join keys and JoinConfig | `client/src/pages/data-transformation-step.tsx` |
| Analysis using raw data | Analysis now prioritizes transformed data | `server/services/analysis-execution.ts` |

### 1. Mock Data Visible to Users 🔴 CRITICAL

**Status**: Impacts production readiness

**Issue**: Technical AI agent and Spark processor may return simulated/random results when real analysis fails or is disabled.

**Locations**:
- `server/services/technical-ai-agent.ts:97-107` - Mock query results
- `server/services/technical-ai-agent.ts:582-636` - Simulated ML metrics
- `server/services/spark-processor.ts:194-306` - Mock fallback behavior

**User Impact**:
- Users receive randomized ML model performance metrics
- Analysis results contain "mock" or "simulated" in metadata but users don't see warnings
- Statistical analyses show synthetic distributions

**Resolution**:
1. Set `ENABLE_MOCK_MODE=false` in production
2. Ensure all AI API keys are configured
3. Verify Python scripts are accessible and executing
4. Check real tool handlers route to actual Python scripts
5. Test with sample data before deployment

### 2. Data Scientist Agent vs Technical AI Agent ⚠️

**Documentation Clarification**:
- `server/services/technical-ai-agent.ts` - Lower-level technical AI service
- `server/services/data-scientist-agent.ts` - Higher-level Data Scientist agent

These are **TWO SEPARATE agents**. DataScientistAgent uses TechnicalAIAgent internally.

### 3. Datasets Table Exists ⚠️

**Clarification**: Despite some documentation suggesting "no separate datasets table", the `datasets` table **DOES exist** in `shared/schema.ts`.

**Architecture**: The system supports **BOTH**:
- Inline data storage in `projects.data` column
- Separate datasets table with many-to-many relationships via `project_datasets` junction table

### 4. ~~Billing System Fragmentation~~ ✅ RESOLVED

**Resolution**: Unified billing service at `server/services/billing/unified-billing-service.ts`

**Features**:
- Stripe integration with webhook verification
- Transaction-safe database operations
- Journey and feature-based billing
- Quota management with overage calculation

---

**Related Documentation**:
- [← Back to Main](../CLAUDE.md)
- [Agentic System Guide](AGENTIC_SYSTEM.md)
- [User Journeys Guide](USER_JOURNEYS.md)
- [Billing & Admin Guide](BILLING_ADMIN.md)
