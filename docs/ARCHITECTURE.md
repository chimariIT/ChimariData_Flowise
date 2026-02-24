# Architecture Guide

**Part of ChimariData Documentation** | [Back to Main](../CLAUDE.md) | **Last Updated**: February 20, 2026

This document covers the system architecture, data flow, compute infrastructure, admin/billing, and deployment.

---

## Table of Contents

- [System Overview](#system-overview)
- [U2A2A2U Pipeline](#u2a2a2u-pipeline)
- [Data Upload to Analysis-Specific Input](#data-upload-to-analysis-specific-input)
- [Data Elements to Transformation Logic](#data-elements-to-transformation-logic)
- [Tri-Engine Compute Architecture](#tri-engine-compute-architecture)
- [Within-Phase and Cross-Phase Parallelism](#within-phase-and-cross-phase-parallelism)
- [Multi-Agent System](#multi-agent-system)
- [Dashboard](#dashboard)
- [Admin Interface](#admin-interface)
- [Stripe and Billing Integration](#stripe-and-billing-integration)
- [Infrastructure and Deployment](#infrastructure-and-deployment)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [Security and Authentication](#security-and-authentication)
- [Testing Strategy](#testing-strategy)

---

## System Overview

ChimariData is a data analysis platform that transforms raw business data into actionable insights through a multi-agent AI system. Users upload data, ask business questions, and receive statistically grounded answers with visualizations.

```
USER                        PLATFORM                         OUTPUT
===========                 ========                         ======
Questions  ───>  Agent Orchestration Pipeline  ───>  Insights & Answers
Goals             (6 agents, 90+ tools)              Visualizations
Data Files        Tri-Engine Compute                 ML Models
                  (Pandas/Polars/Spark)              Evidence Chains
                  Parallel Execution                 Executive Summary
```

### Core Architecture Principles

| Principle | Implementation |
|-----------|---------------|
| **Single Source of Truth (SSOT)** | `journeyProgress` JSONB on `projects` table stores all journey state |
| **Tool Registry Pattern** | Agents access capabilities via MCP Tool Registry, never call services directly |
| **Tri-Engine Compute** | Pandas (default) / Polars (50k-1M rows) / Spark (>1M rows) with automatic fallback |
| **Parallel Execution** | Within-phase and cross-phase parallelism via `Promise.allSettled()` |
| **Evidence Chain** | Full traceability: Question > Data Element > Transformation > Analysis > Answer |
| **Additive Design** | Every enhancement degrades gracefully if dependencies are missing |

---

## U2A2A2U Pipeline

The **User > Agent > Agent > User** pipeline is the core data flow through the platform. Users provide input on one end, agents process collaboratively in the middle, and users receive structured output on the other end.

```
U2A2A2U COMPLETE DATA FLOW
==========================

USER INPUT                                                              USER OUTPUT
==========                                                              ===========
 Questions    ┌────────────────────────────────────────────────────┐     Insights
 Goals        │              AGENT PROCESSING PIPELINE             │     Charts & KPIs
 Audience     │                                                    │     Answers
 Data Files   │  PM Agent (Orchestrator)                           │     ML Models
              │    |                                               │     Reports
              │    ├── Template Research Agent                     │     Artifacts
              │    │     Find templates, patterns, workflows       │
              │    ├── Data Scientist Agent                        │
              │    │     Identify analysis types, required data    │
              │    ├── Data Engineer Agent                         │
              │    │     Quality, transformations, join strategy   │
              │    ├── Analysis Execution                          │
              │    │     Run Python scripts (parallel, tri-engine) │
              │    └── Business Agent                              │
              │          Translate results for audience            │
              │                                                    │
              │  INFRASTRUCTURE                                    │
              │  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐ │
              │  │ MCP Tool    │ │ Message     │ │ WebSocket    │ │
              │  │ Registry    │ │ Broker      │ │ Bridge       │ │
              │  │ (130+ tools)│ │ (Redis)     │ │ (Real-time)  │ │
              │  └─────────────┘ └─────────────┘ └──────────────┘ │
              └────────────────────────────────────────────────────┘
```

### Pipeline Steps

| Step | Frontend | Backend | Storage |
|------|----------|---------|---------|
| 1. **Project Setup** | `project-setup.tsx` | `POST /api/projects` | `projects` table |
| 2. **Data Upload** | `data-step.tsx` | `POST /api/projects/:id/upload` | `datasets` table, `uploads/originals/` |
| 3. **Verification** | `data-verification-step.tsx` | `PUT /api/projects/:id/verify` | `datasets.piiAnalysis`, `journeyProgress` |
| 4. **Transformation** | `data-transformation-step.tsx` | `POST /api/projects/:id/execute-transformations` | `datasets.ingestionMetadata.transformedData` |
| 5. **Plan** | `plan-step.tsx` | Analysis plans via agents | `analysis_plans` table, `journeyProgress` |
| 6. **Execute** | `execute-step.tsx` | `POST /api/analysis-execution/execute` | `projects.analysisResults`, `project_artifacts` |
| 7. **Results** | `dashboard-step.tsx` | `GET /api/analysis-execution/results/:id` | `projects.analysisResults`, `project_artifacts` |

### Journey State Flow

```
project-setup > data-upload > data-verification > data-transformation
                                                        |
                                                        v
                results < results-preview < execute < plan
```

State is managed by `journeyStateManager` and persisted in `projects.journeyState`. The `journeyProgress` JSONB field is the SSOT for all decisions (PII, cost, requirements, execution config, translated results).

### Real-Time Progress Updates

```
Browser Client  <----WebSocket---->  Server (ws library)
      |                                   |
      |  analysis:progress               |
      |<---------------------------------|
      |  analysis:complete               |
      |<---------------------------------|
      |  checkpoint:request              |
      |<---------------------------------|
      |  agent:message                   |
      |<---------------------------------|
```

- **Client**: `client/src/lib/realtime.ts`
- **Server**: `server/services/agents/realtime-agent-bridge.ts`
- **Broker**: `server/services/agents/agent-message-broker.ts` (EventEmitter dev, Redis prod)

---

## Data Upload to Analysis-Specific Input

### Data Source Priority

When analysis executes, data is sourced with this priority chain (`analysis-execution.ts`):

```
1. dataset.ingestionMetadata.transformedData    (user-approved transformations)
2. dataset.metadata.transformedData             (alternate location)
3. dataset.data || dataset.preview              (fallback to raw upload)
```

Three PII defense layers in `analysis-data-helpers.ts` ensure excluded columns never reach Python scripts, even on raw data fallback.

### Storage Locations by Phase

```
UPLOAD PHASE                VERIFICATION PHASE           TRANSFORMATION PHASE
============                ==================           ====================
datasets.data (JSONB)       datasets.piiAnalysis         datasets.ingestionMetadata
datasets.schema             qualityMetrics                 .transformedData
datasets.preview            projects.status='ready'        .joinConfig
uploads/originals/                                         .columnMappings

ANALYSIS PHASE              RESULTS PHASE
==============              =============
projects.analysisResults    project_artifacts table
uploads/artifacts/          uploads/artifacts/{projectId}/
```

### Multi-Dataset Joining

```
Dataset A                     Dataset B
+--------------------+       +--------------------+
| employee_id (PK)   |       | emp_id (FK)        |
| name               |------>| engagement_score   |
| department         |       | survey_date        |
+--------------------+       +--------------------+
           |                         |
           +----------+--------------+
                      v
              +---------------+
              | Joined Data   |
              | (Analysis-    |
              |  ready)       |
              +---------------+
```

Join key auto-detection matches columns with patterns: `*_id`, `*_key`, `*_code`, `employee_id`, `user_id` and compares column names across datasets with confidence scores.

### Row Cap and Storage Safety

- **Constant**: `DATASET_DATA_ROW_CAP = 10,000` in `server/constants.ts`
- **Enforced in**: All 3 `createDataset()` implementations (Database, Memory, Hybrid)
- **DB timeout**: `statement_timeout = 120,000ms` in `server/db.ts`
- Full datasets always available via uploaded file and `ingestionMetadata.transformedData`

---

## Data Elements to Transformation Logic

The platform uses a semantic pipeline to trace from user questions through data elements to transformations and analysis results.

### Semantic Data Pipeline

```
USER QUESTIONS          DATA ELEMENTS           TRANSFORMATIONS          ANALYSIS
==============          =============           ===============          ========
"What drives           +-----------+           +--------------+        +--------+
 employee               | salary   |---------->| normalize    |------->| regress|
 retention?"            | tenure   |           | encode cats  |        | cluster|
                        | dept     |---------->| derive KPIs  |        | ANOVA  |
"Which depts            | reviews  |           +--------------+        +--------+
 have highest           +-----------+
 engagement?"            ^                           ^
                         |                           |
                   cosine similarity           auto-inferred
                   (>= 0.5 threshold)          from semantics
```

**Service**: `server/services/semantic-data-pipeline.ts`

### Key Methods

| Method | Purpose |
|--------|---------|
| `extractDataElements()` | Extract semantic elements from datasets, generate embeddings |
| `linkQuestionsToElements()` | Link questions to elements via cosine similarity (threshold >= 0.5) |
| `inferTransformations()` | Auto-detect joins, aggregations, filters from question semantics |
| `buildEvidenceChain()` | Create Question > Element > Transformation traceability |
| `getTransformationPlan()` | Get complete transformation plan with related questions |

### Analysis Data Preparer

**File**: `server/services/analysis-data-preparer.ts`

Sits between data extraction and Python script invocation. Resolves column roles from `RequiredDataElement` metadata and builds enhanced Python configs:

```typescript
// Column role assignment per analysis type
ColumnRoleAssignment {
  target_column?: string        // regression, classification
  features?: string[]           // regression, classification, clustering
  group_column?: string         // comparative, group_analysis
  text_columns?: string[]       // text_analysis
  time_column?: string          // time_series
  n_clusters?: number | 'auto'  // clustering
  method?: string               // correlation, clustering
}
```

### Derived Column Specification

Business questions may require columns that don't exist in raw data. The platform supports derived columns:

```typescript
DerivedColumnSpec {
  columnName: string            // e.g., "Likely_to_Return"
  derivationType: 'average' | 'sum' | 'binary_condition' | 'categorize' | 'custom'
  componentColumns: string[]    // actual dataset columns
  config: {
    condition?: string          // pseudo-code for binary
    categories?: Array<{name, rule}>
    pseudoCode?: string
  }
}
```

### Analysis Requirements Registry

**File**: `server/services/analysis-requirements-registry.ts`

Defines per-analysis-type requirements including column types needed, quality thresholds, transformation requirements, and which Python script to execute:

| Analysis Type | Python Script | Key Requirements |
|---------------|---------------|------------------|
| `descriptive_statistics` | `descriptive_stats.py` | >= 1 numeric column |
| `correlation_analysis` | `correlation_analysis.py` | >= 2 numeric columns |
| `comparative_analysis` | `comparative_analysis.py` | 1 categorical + 1 numeric |
| `regression_analysis` | `regression_analysis.py` | target + features |
| `clustering_analysis` | `clustering_analysis.py` | >= 2 numeric columns |
| `classification_analysis` | `classification_analysis.py` | target (categorical) + features |
| `time_series_analysis` | `time_series_analysis.py` | 1 datetime + 1 numeric |
| `text_analysis` | `text_analysis.py` | >= 1 text column |
| `statistical_tests` | `statistical_tests.py` | categorical + numeric |
| `group_analysis` | `group_analysis.py` | 1 categorical + numeric |

### Evidence Chain (Question > Answer Traceability)

Each answer includes full provenance:

```
Question: "What factors drive employee retention?"
  |
  +-- dataElements: [salary, tenure, department, satisfaction_score]
  +-- transformations: [normalize_salary, encode_department, derive_retention_flag]
  +-- analyses: [regression_analysis, clustering_analysis]
  +-- insights: ["salary has 0.42 correlation with retention", "3 distinct employee segments"]
  +-- confidence: 0.87
```

Stable question IDs via `generateStableQuestionId()` in `server/constants.ts` (SHA-256 hash-based).

---

## Tri-Engine Compute Architecture

The platform uses a three-engine compute cascade for data processing:

```
COMPUTE ENGINE SELECTION
========================

Dataset Size        Engine Selected      Where It Runs
< 50,000 rows      Pandas (local)       Single Python process
50k - 1M rows      Polars               Single Python process (columnar, fast)
> 1M rows          Spark                Distributed cluster (or local[*])
> 500MB            Spark                Distributed cluster (or local[*])

Fallback cascade: Spark --> Polars --> Pandas
Each engine falls back to the next on failure (graceful degradation)
```

### Compute Engine Selector

**File**: `server/services/compute-engine-selector.ts`

Returns `{ engine, reason, confidence }` based on dataset characteristics. Complex analysis types (ML, clustering, anomaly detection) auto-escalate to higher engines.

### Engine Utils (Python)

**File**: `python/engine_utils.py`

Shared utility module imported by all 10 analysis scripts:

```python
from engine_utils import load_dataframe, to_pandas, POLARS_AVAILABLE, SPARK_AVAILABLE

# Tri-engine loading with automatic fallback
data, engine_used = load_dataframe(config)

# Convert to Pandas for scipy/sklearn operations
pd_data = to_pandas(data)
```

The `load_dataframe()` function implements the full cascade:

1. **Spark path**: Creates/reuses SparkSession, loads via `spark.read.json()`, converts to Pandas
2. **Polars path**: Loads via `pl.DataFrame(json.load())`, returns Polars DataFrame
3. **Pandas fallback**: Loads via `pd.read_json()`, always available

### Spark Session Management

```python
# Spark config injected from TypeScript orchestrator
config = {
  'spark_master': 'spark://master:7077',  # or 'local[*]' for dev
  'spark_executor_memory': '2g',
  'spark_driver_memory': '1g',
  'spark_app_name': 'ChimariData'
}
```

Features: Adaptive query execution, auto-tuning, session reuse across scripts.

### All 10 Analysis Scripts (Tri-Engine Enabled)

| Script | Engine Eligibility | Key Dependencies |
|--------|-------------------|------------------|
| `descriptive_stats.py` | 60% Polars-native | scipy (skew, kurtosis, shapiro) |
| `correlation_analysis.py` | 40% Polars-native | scipy (pearsonr, spearmanr, kendalltau) |
| `group_analysis.py` | 70% Polars-native | scipy (f_oneway, kruskal, chi2_contingency) |
| `comparative_analysis.py` | 25% Polars-native | scipy (ttest_ind, mannwhitneyu, ANOVA) |
| `clustering_analysis.py` | 35% Polars-native | sklearn (KMeans, DBSCAN, Agglomerative) |
| `regression_analysis.py` | 30% Polars-native | sklearn (LinearRegression), statsmodels (OLS) |
| `classification_analysis.py` | 35% Polars-native | sklearn (RF, DT, LR, NB, SVM) |
| `time_series_analysis.py` | 25% Polars-native | statsmodels (ARIMA, ADF, seasonal_decompose) |
| `text_analysis.py` | 50% Polars-native | sklearn (TF-IDF, LDA), regex tokenization |
| `statistical_tests.py` | 30% Polars-native | scipy (ANOVA, t-test, chi-square, Shapiro-Wilk) |

### Spark Bridge (Native Operations)

**File**: `python/spark/spark_bridge.py` (518 lines)

For scripts that benefit from Spark-native operations (vs Spark I/O + Pandas analysis):
- Regression, classification, clustering, correlation, change detection
- Uses Spark MLlib for distributed model training on very large datasets

---

## Within-Phase and Cross-Phase Parallelism

The analysis pipeline uses two levels of parallelism for maximum throughput.

### Phase Architecture

```
Phase 1: Data Quality Assessment (always first, sequential)
    |
    v
+---Phase 2: EDA --------+   Phase 3: Statistical --+   Phase 4: ML --------+
| 6 scripts in parallel   |   3 scripts in parallel  |   4 branches parallel |
| - descriptive_stats     |   - descriptive_stats    |   - clustering        |
| - correlation           |   - correlation          |   - regression        |
| - comparative           |   - statistical_tests    |   - classification    |
| - group                 |                          |   - general ML        |
| - text                  |                          |     (enhanced->basic) |
| - time_series           |                          |                       |
+-------------------------+   -----------------------+   --------------------+
    |                              |                          |
    +------------------------------+--------------------------+
    |
    v
Phase 5: Visualization Generation (needs all results)
Phase 6: Evidence Chain Building
Phase 7: Executive Summary
Phase 8: Artifact Storage
```

### Within-Phase Parallelism (Promise.allSettled)

Each phase runs its Python scripts concurrently. Scripts read from the same temp JSON file (read-only, no write conflicts):

```typescript
// EDA Phase: 6 scripts in parallel
const edaTasks: EdaTask[] = [];
edaTasks.push({ key: 'descriptive', promise: this.executePythonScript('descriptive_stats.py', config) });
edaTasks.push({ key: 'correlation', promise: this.executePythonScript('correlation_analysis.py', config) });
// ... conditionally push comparative, group, text, time_series

const settled = await Promise.allSettled(edaTasks.map(t => t.promise));
// Each result handled independently -- one failure doesn't block others
```

### Cross-Phase Parallelism

Phases 2, 3, and 4 are independent (all read from the same dataset) and run simultaneously:

```typescript
// After Phase 1 (Quality) completes:
const phasePromises = [];
if (relevantPhases.includes('eda'))        phasePromises.push({ key: 'eda',        promise: runEDA() });
if (relevantPhases.includes('statistical')) phasePromises.push({ key: 'statistical', promise: runStats() });
if (relevantPhases.includes('ml'))         phasePromises.push({ key: 'ml',          promise: runML() });

const phaseSettled = await Promise.allSettled(phasePromises.map(p => p.promise));
```

### Spark Path Parallelism

When the compute engine selector routes to Spark, analysis types also run in parallel:

```typescript
// All Spark analyses in parallel (no inter-analysis dependencies)
const sparkPromises = request.analysisTypes.map(type =>
  sparkProcessor.performAnalysis(data, type, config)
);
const sparkResults = await Promise.allSettled(sparkPromises);
```

### Performance Impact

| Scenario | Before (Sequential) | After (Parallel) | Speedup |
|----------|--------------------:|------------------:|--------:|
| EDA phase (6 scripts) | ~1.8s | ~0.3s | **6x** |
| Statistical phase (3 scripts) | ~1.2s | ~0.4s | **3x** |
| ML phase (3 scripts) | ~4.5s | ~1.5s | **3x** |
| Full pipeline (all phases) | ~8-10s | ~2-3s | **3-4x** |
| Spark + parallel (>1M rows) | ~30s+ | ~8-10s | **3x** |

---

## Multi-Agent System

Six specialized agents coordinated through a message broker.

### Agent Roster

| Agent | File | Status | Primary Role |
|-------|------|--------|--------------|
| Project Manager | `project-manager-agent.ts` | Active | End-to-end orchestration |
| Data Scientist | `data-scientist-agent.ts` | Active | Statistical analysis, ML |
| Business Agent | `business-agent.ts` | Active | Industry expertise, audience translation |
| Data Engineer | `data-engineer-agent.ts` | Active | Data quality, ETL |
| Template Research | `template-research-agent.ts` | Initialized | Industry-specific templates |
| Customer Support | `customer-support-agent.ts` | Initialized | Knowledge base, diagnostics |

### Coordination Workflow

```
PM Agent (Supervisor)
  |-- Researcher Agent: Find templates/patterns
  |-- Data Scientist Agent: Identify analysis types, required data elements
  |-- Data Engineer Agent: Prepare data, quality checks, join strategy
  |-- Analysis Execution: Run Python scripts (parallel, tri-engine)
  +-- Business Agent: Translate results for user's audience
```

### Tool Registry

**File**: `server/services/mcp-tool-registry.ts`

All agent capabilities routed through the registry:
- **130+ tools** registered across 24 categories
- **~75** routed in `executeTool()`
- **~65** fully working

Agent-tool permission matrix ensures each agent only accesses appropriate tools.

---

## Dashboard

### User Dashboard

**File**: `client/src/pages/dashboard.tsx`

The main user dashboard displays:
- Active projects with journey progress indicators
- Recent analysis results and artifacts
- Quick-start cards for new journeys (AI-guided, template-based, self-service)
- Usage metrics (analyses run, data processed)

### Project Results Dashboard

**File**: `client/src/pages/dashboard-step.tsx`
**API**: `GET /api/analysis-execution/results/:projectId`
**Routes**: `/projects/:id/results`, `/journeys/:type/results`

Analysis results rendered with:
- Executive summary with key findings
- Question-by-question answers with evidence chains
- Interactive visualizations (Recharts, D3.js)
- ML model performance metrics
- Statistical test results with significance indicators
- Downloadable artifacts (charts, reports, raw data)

### Admin Dashboard

**File**: `client/src/pages/admin/admin-dashboard.tsx`

Platform health overview:
- Revenue metrics and subscription analytics
- Active user counts and project statistics
- System health indicators (DB, Redis, Python, Spark)
- Agent performance metrics
- Error rates and response times

---

## Admin Interface

### Admin Pages (14 Components)

| # | Page | File | Purpose |
|---|------|------|---------|
| 1 | Dashboard | `admin-dashboard.tsx` | Platform health, revenue metrics |
| 2 | User Management | `user-management.tsx` | User CRUD, roles, subscriptions |
| 3 | Subscription Management | `subscription-management.tsx` | Tier CRUD, billing config |
| 4 | Service Pricing | `pricing-services.tsx` | Per-service pricing config |
| 5 | Analysis Pricing | `analysis-pricing.tsx` | Per-analysis-type pricing |
| 6 | Campaign Management | `campaign-management.tsx` | Promotional campaigns, coupons |
| 7 | Consultations | `consultations.tsx` | Consultation request queue |
| 8 | Consultation Pricing | `consultation-pricing.tsx` | Consultation tier pricing |
| 9 | Agent Management | `agent-management.tsx` | Agent monitoring, templates |
| 10 | Tools Management | `tools-management.tsx` | Tool registry, permissions |
| 11 | Project Inspector | `project-state-inspector.tsx` | Journey state debugging |
| 12 | Database Optimization | `database-optimization.tsx` | DB tuning |
| 13 | Error Tracking | `error-tracking.tsx` | Error monitoring |
| 14 | Knowledge Management | `knowledge-management.tsx` | Knowledge base CRUD |

### Admin API (165+ Endpoints)

Spread across 6 route files:

| File | Endpoints | Domain |
|------|-----------|--------|
| `admin.ts` | ~80 | Users, agents, tools, templates, system |
| `admin-billing.ts` | ~35 | Tiers, pricing, campaigns, tax, analytics |
| `admin-secured.ts` | ~20 | Secured operations |
| `admin-consultation.ts` | ~9 | Consultation management |
| `admin-consultation-pricing.ts` | ~7 | Consultation pricing |
| `admin-service-pricing.ts` | ~6 | Service pricing |

### Admin Security

- **Three-tier authorization**: `ensureAuthenticated` > `requireAdmin` > optional `requireSuperAdmin`
- **Rate limiting**: 100 requests per 15 minutes on all admin routes
- **Audit logging**: `AdminAuditLogService` for compliance
- **Real-time broadcast**: Config changes broadcast via WebSocket to all connected clients

---

## Stripe and Billing Integration

### Subscription Tiers

| Tier | Price | Quotas |
|------|-------|--------|
| Trial | Free | Limited uploads, 1 project |
| Starter | $29/mo | Standard quotas |
| Professional | $99/mo | Higher quotas, priority |
| Enterprise | Custom | Unlimited, dedicated support |

### Unified Billing Service

**File**: `server/services/billing/unified-billing-service.ts` (4,000+ lines)

Handles all billing operations:
- Stripe subscription lifecycle (create, update, cancel)
- Per-analysis pricing with complexity multipliers
- Campaign/coupon management with usage reservation
- Webhook signature verification (HMAC-SHA256)
- Transaction-safe database operations with idempotency
- Invoice generation and overage calculation

### Pricing Model

```
Final Cost = Base Price x Data Multiplier x Complexity Factor x Discounts

Base Price:     Per analysis type (admin-configurable)
Data Multiplier: Tiered by record count (1x, 1.5x, 2x, 3x)
Complexity:     Simple (1x), Standard (1.5x), Advanced (2x), Custom (3x)
Discounts:      Campaign codes, volume discounts, subscription tier benefits
```

Cost is locked in `journeyProgress.lockedCostEstimate` at plan approval and never recalculated. The frontend reads from `GET /api/projects/:id/cost-estimate` (authoritative endpoint).

### Payment Flow

```
1. User selects analysis --> cost locked in journeyProgress
2. Checkout triggered --> POST /api/payment/create-checkout-session
3. Amount verified against locked cost (1% tolerance)
4. Stripe session created with metadata (analysisType, lockedCostCents)
5. Success URL --> execute step with ?payment=success query param
6. Frontend detects param --> verifies session --> auto-triggers analysis
7. Analysis runs --> navigates to results
```

### Payment Gates

```typescript
// Subscription-first model with fallback
1. Check active subscription tier via canAccessJourney()
2. Track feature usage via trackFeatureUsage()
3. Fall back to one-off payment if no subscription
4. Preview mode available (limited execution without quota)
5. 402 Payment Required if no subscription and not paid
```

### Admin Billing CRUD

Full admin control over pricing:
- GET/POST/PUT/DELETE `/api/admin/billing/tiers` -- subscription tier management
- GET/POST `/api/admin/billing/consumption-rates` -- overage pricing
- GET/POST/PUT/DELETE `/api/admin/billing/campaigns` -- promotional campaigns
- POST `/api/admin/billing/bulk-operations/tier-pricing-update` -- bulk updates
- GET `/api/admin/billing/analytics/revenue` -- revenue analytics

Changes sync to Stripe automatically and broadcast to clients via WebSocket.

### Pricing Service Cache

- DB-backed with invalidation via `PricingService.refreshFromDatabase()`
- Pricing version tracking prevents frontend stale cache
- Admin updates trigger invalidation at `admin-billing.ts:897`

---

## Infrastructure and Deployment

### Development Environment

```bash
# Required
Node.js 18+, Python 3.8+, PostgreSQL 14+

# Optional
Redis (falls back to in-memory EventEmitter in dev)
Docker Desktop (for Redis, Spark cluster)

# Setup
npm install
pip install -r python/requirements.txt   # Polars, scipy, sklearn, statsmodels
npm run db:push                          # Push schema to database
npm run dev                              # Start client (5173) + server (5000)
```

### Environment Variables

```bash
# Required (all environments)
DATABASE_URL="postgresql://..."
GOOGLE_AI_API_KEY="..."              # Primary AI provider
SESSION_SECRET="..."
JWT_SECRET="..."

# Production (additional)
NODE_ENV="production"
ENABLE_MOCK_MODE="false"             # CRITICAL: must be false
REDIS_URL="redis://..."
STRIPE_SECRET_KEY="sk_live_..."
VITE_STRIPE_PUBLIC_KEY="pk_live_..."
SENDGRID_API_KEY="SG..."

# Compute Engine (optional)
SPARK_MASTER_URL="spark://master:7077"  # default: local[*]
SPARK_EXECUTOR_MEMORY="2g"
SPARK_DRIVER_MEMORY="1g"

# Feature Flags
ENABLE_RATE_LIMITING="true"
ENABLE_WEBHOOK_SIGNATURE_VERIFICATION="true"
```

### Docker Compose (Spark Cluster)

**File**: `docker-compose.spark.yml`

```
+------------------+     +------------------+
|  Spark Master    |     |  PostgreSQL 15   |
|  Port 8080 (UI)  |     |  Port 5432       |
|  Port 7077 (RPC) |     +------------------+
+------------------+
  |            |          +------------------+
  v            v          |  Redis 7         |
+---------+ +---------+  |  Port 6379       |
| Worker1 | | Worker2 |  +------------------+
| 2GB RAM | | 2GB RAM |
+---------+ +---------+  +------------------+
                          |  App (Node+Py)   |
                          |  Port 3000       |
                          |  Port 4040 (UI)  |
                          +------------------+
```

**Dockerfile.spark**: Multi-stage build with Java 11 + Python + Node 18 + Spark 3.5.0

### Production Deployment

```bash
npm install
npm run db:push          # Apply schema changes
npm run build            # Production build (Vite + esbuild)
npm run start            # Start production server
```

### Production Validation

**File**: `server/services/production-validator.ts`

Server validates on startup and exits with code 1 if validation fails:
- Python bridge connectivity and script accessibility
- Spark cluster availability (when engine selector would use it)
- Redis connection (required in production)
- Database connectivity and schema validation
- AI provider API key configuration
- Mock/simulated data detection

### Performance Configuration

```bash
# TypeScript compilation (large codebase)
node --max-old-space-size=8192 ./node_modules/typescript/bin/tsc

# Database connection pooling
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20

# Python worker pool
# Pre-spawns 2-3 Python processes for reduced spawn overhead
# Configured in server/services/python-worker-pool.ts
```

### Production Checklist

- [ ] `NODE_ENV=production`, `ENABLE_MOCK_MODE=false`
- [ ] Strong `SESSION_SECRET` and `JWT_SECRET`
- [ ] Redis configured (`REDIS_URL`)
- [ ] All AI provider keys set
- [ ] Stripe production keys configured
- [ ] Rate limiting enabled
- [ ] Webhook verification enabled
- [ ] `npm run db:push` applied to production DB
- [ ] `npm run test:production` passes
- [ ] Grep for "mock", "simulated" -- none in user-facing code
- [ ] Python scripts execute correctly with `pip install -r python/requirements.txt`

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool with HMR |
| Tailwind CSS + Radix UI | Styling and components |
| React Query | Server state management |
| Wouter | Client-side routing (~1.2KB) |
| Recharts / D3.js | Data visualization |
| React Hook Form | Form handling |

### Backend

| Technology | Purpose |
|------------|---------|
| Express.js + TypeScript | API server |
| WebSocket (`ws` library) | Real-time communication |
| Drizzle ORM + Zod | Database ORM with validation |
| Passport.js | Authentication (Google, GitHub, Microsoft, Apple, local) |
| Bull queue | Background jobs (Redis-backed) |

### Data and Analytics

| Technology | Purpose |
|------------|---------|
| PostgreSQL 14+ | Primary database with JSONB |
| Redis | Cache, message broker, session store |
| Apache Spark 3.5 | Distributed processing (>1M rows) |
| Polars 1.38+ | High-performance columnar processing (50k-1M rows) |
| Pandas + NumPy | Universal data processing |
| scikit-learn | ML models (RF, DT, LR, NB, SVM, KMeans, DBSCAN) |
| statsmodels | Statistical tests (ARIMA, ADF, seasonal decompose) |
| scipy | Hypothesis testing (ANOVA, t-test, chi-square, Shapiro-Wilk) |

### AI Providers

| Provider | Usage |
|----------|-------|
| Google Gemini | Primary AI (analysis planning, business translation) |
| OpenAI GPT | Fallback, embeddings |
| Anthropic Claude | Fallback |

### DevOps

| Technology | Purpose |
|------------|---------|
| Docker + docker-compose | Containerization |
| Stripe | Payments with webhooks |
| SendGrid | Transactional email |

---

## Database Schema

**File**: `shared/schema.ts` (Drizzle ORM + Zod)

### Core Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | id, email, isAdmin, userRole, subscriptionTier |
| `projects` | Analysis projects | id, userId, journeyType, journeyState, journeyProgress, analysisResults |
| `datasets` | Uploaded data | id, data (JSONB), schema, piiAnalysis, ingestionMetadata |
| `projectDatasets` | Many-to-many junction | projectId, datasetId, role (primary/secondary/joined) |
| `analysis_plans` | Plan-step outputs | planSteps, visualizations, mlModels, costBreakdown |
| `project_artifacts` | Generated outputs | projectId, type, content, file path |
| `agent_checkpoints` | User approval gates | projectId, stepName, agentType, status, message |

### Billing Tables

| Table | Purpose |
|-------|---------|
| `subscriptionTierPricing` | Tier definitions, quotas, Stripe product IDs |
| `servicePricing` | Per-analysis-type pricing, volume tiers |
| `billingCampaigns` | Promotional campaigns, discount codes |

### Schema Management

```bash
# 1. Edit shared/schema.ts
# 2. Push to database (CRITICAL)
npm run db:push
# 3. Restart dev server
```

---

## Security and Authentication

### Authentication Flow

```
User Request
  |
  v
ensureAuthenticated middleware (server/routes/auth.ts)
  |
  v
Validates JWT token from Authorization header
  |
  v
Fetches user from database
  |
  v
Attaches to req.user {id, email, isAdmin, userRole, subscriptionTier}
  |
  v
Route handler
```

### Ownership Verification

```typescript
import { canAccessProject } from '../middleware/ownership';

const access = await canAccessProject(userId, projectId, isAdmin);
if (!access.allowed) return res.status(403).json({ error: access.reason });
// Admin users bypass ownership checks
```

### Data Protection

- **PII Detection**: Automatic via `unified-pii-processor.ts`
- **PII Masking**: Happens at verify step (raw `dataset.data` contains PII)
- **Column Exclusion**: `columnsToExclude` passed to all analysis phases
- **3 Defense Layers**: Emergency filter, explicit PII filtering, post-filter assertion

---

## Testing Strategy

### Test Commands

```bash
npm run test:user-journeys    # Critical user journey tests (run first)
npm run test:production       # Full production test suite
npm run test:unit             # Vitest unit tests
npm run test:backend          # Backend tests
npm run test:client           # Client tests
npm run test                  # All Playwright E2E tests
```

### Test Organization (148 files)

| Category | Location | Framework |
|----------|----------|-----------|
| E2E tests | `tests/*.spec.ts` | Playwright |
| User journeys | `tests/*-journey*.spec.ts` | Playwright |
| Unit tests | `tests/unit/` | Vitest |
| Integration | `tests/integration/` | Vitest |
| Agent E2E | `tests/e2e/agents/` | Playwright |

### NEVER-REGRESS Guards

- **CSV row cap**: `DATASET_DATA_ROW_CAP` enforced in storage layer, tested in `dataset-row-cap.test.ts`
- **Statement timeout**: 120s in `db.ts`, startup assertion warns if below 60s
- **Execution timeout**: 15 min total, 5 min per-analysis in analysis-execution route

---

## Directory Structure

```
chimariapp2/
+-- client/src/
|   +-- components/          # Reusable UI components (150+)
|   +-- pages/               # Route-level pages (60+)
|   |   +-- admin/           # Admin dashboard pages (14)
|   +-- hooks/               # Custom React hooks
|   +-- lib/                 # API client, realtime, utils
|
+-- server/
|   +-- routes/              # API route handlers (60 files)
|   +-- services/            # Business logic (169 files)
|   |   +-- agents/          # Message broker, realtime bridge
|   |   +-- billing/         # Unified billing service
|   |   +-- project-manager/ # PM agent modules
|   +-- middleware/           # Express middleware
|   +-- config/              # Spark config, feature flags
|
+-- shared/                  # Schemas and types (Drizzle + Zod)
+-- python/                  # Analysis scripts (16 files)
|   +-- engine_utils.py      # Tri-engine dispatch (Spark/Polars/Pandas)
|   +-- spark/               # Spark bridge (native operations)
+-- migrations/              # Database migration files
+-- tests/                   # 148 test files
+-- docs/                    # Architecture docs + 340+ archived sessions
+-- uploads/                 # Runtime uploads (originals, artifacts)
```

### Critical File Locations

| What | Location |
|------|----------|
| Database schema | `shared/schema.ts` |
| Main server entry | `server/index.ts` |
| Analysis execution | `server/services/analysis-execution.ts` |
| Data science orchestrator | `server/services/data-science-orchestrator.ts` |
| Compute engine selector | `server/services/compute-engine-selector.ts` |
| Tri-engine utils | `python/engine_utils.py` |
| Tool registry | `server/services/mcp-tool-registry.ts` |
| Unified billing | `server/services/billing/unified-billing-service.ts` |
| Semantic pipeline | `server/services/semantic-data-pipeline.ts` |
| Data accessor | `server/services/data-accessor.ts` |
| Shared constants | `server/constants.ts` |
| Spark processor | `server/services/spark-processor.ts` |
| Spark bridge (Python) | `python/spark/spark_bridge.py` |
| Spark config | `server/config/spark-config.ts` |

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | This file -- system architecture |
| [AGENTIC_SYSTEM.md](AGENTIC_SYSTEM.md) | Agents, tools, MCP, coordination |
| [U2A2A2U_COMPLETE_DATA_FLOW.md](U2A2A2U_COMPLETE_DATA_FLOW.md) | Pipeline data flow, continuity breaks |
| [USER_JOURNEYS.md](USER_JOURNEYS.md) | Journey types, workflows, analysis components |
| [BILLING_ADMIN.md](BILLING_ADMIN.md) | Subscriptions, payments, admin features |
| [ADMIN_INTERFACE.md](ADMIN_INTERFACE.md) | All admin UI pages, routing |
| [ADMIN_API_REFERENCE.md](ADMIN_API_REFERENCE.md) | 165+ admin API endpoints |
| [MCP_TOOL_STATUS.md](MCP_TOOL_STATUS.md) | 130+ tool implementation status |
| [SYSTEM_STATUS.md](SYSTEM_STATUS.md) | System health, phase completion |
