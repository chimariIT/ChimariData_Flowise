# Complete u2a2a2u Data Flow Architecture

**Generated**: January 13, 2026 | **Audited**: February 13, 2026
**Purpose**: Comprehensive mapping of User → Agent → Agent → User data pipeline
**Scope**: Requirements → Data → Transformation → Analysis → Billing → Results & Artifacts → Dashboard

> **AUDIT NOTE (Feb 2026)**: This document describes the *designed* flow. See "Implementation Reality" sections below for gaps between design and actual implementation. Key findings:
> - Business Agent translation happens **client-side only**, not as part of server agent workflow
> - Template Research and Customer Support agents are initialized but **not wired into active workflows**
> - ~50% of registered MCP tools are stubs/placeholders — see [MCP_TOOL_STATUS.md](MCP_TOOL_STATUS.md)
> - 5 data continuity break points identified (see section at end)

---

## Executive Summary

The Chimaridata platform implements a **u2a2a2u (User to Agent to Agent to User)** architecture where:
- **User provides** business questions, goals, and data
- **Agents process** through specialized tools (90+ MCP tools across 24 categories)
- **Agents coordinate** sequentially and in parallel via message broker
- **User receives** actionable insights, visualizations, and artifacts

---

## 1. COMPLETE PIPELINE VISUALIZATION

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    u2a2a2u COMPLETE DATA FLOW                                           │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘

USER INPUT                                                                              USER OUTPUT
═══════════                                                                             ═══════════
┌──────────────┐     ┌──────────────────────────────────────────────────────────────┐    ┌──────────────┐
│ Questions    │────▶│                    AGENT PROCESSING PIPELINE                 │───▶│ Insights     │
│ Goals        │     │                                                              │    │ Charts       │
│ Audience     │     │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │    │ KPIs         │
│ Data Files   │     │  │Template │──▶│  DS     │──▶│  DE     │──▶│  BA     │      │    │ Answers      │
└──────────────┘     │  │Research │   │  Agent  │   │  Agent  │   │  Agent  │      │    │ Reports      │
                     │  │  Agent  │   │         │   │         │   │         │      │    │ Artifacts    │
                     │  └─────────┘   └─────────┘   └─────────┘   └─────────┘      │    └──────────────┘
                     │       │             │             │             │            │
                     │       ▼             ▼             ▼             ▼            │
                     │  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐      │
                     │  │Templates│   │Analysis │   │Transform│   │Translate│      │
                     │  │Recommend│   │Path     │   │Data     │   │Results  │      │
                     │  └─────────┘   └─────────┘   └─────────┘   └─────────┘      │
                     │                                                              │
                     │                    ┌──────────────────┐                      │
                     │                    │  PM Agent        │                      │
                     │                    │  (Orchestrator)  │                      │
                     │                    └──────────────────┘                      │
                     └──────────────────────────────────────────────────────────────┘

                     ┌──────────────────────────────────────────────────────────────┐
                     │                    INFRASTRUCTURE                             │
                     │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
                     │  │MCP Tool     │  │Message      │  │WebSocket    │           │
                     │  │Registry     │  │Broker       │  │Bridge       │           │
                     │  │(90+ tools)  │  │(Redis)      │  │(Real-time)  │           │
                     │  └─────────────┘  └─────────────┘  └─────────────┘           │
                     └──────────────────────────────────────────────────────────────┘
```

---

## 2. STEP-BY-STEP DATA FLOW

### STEP 1: PREPARE (Requirements Gathering)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: PREPARE - Requirements Generation                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  USER INPUT                        AGENT PROCESSING                   OUTPUT         │
│  ──────────                        ────────────────                   ──────         │
│  ┌────────────────┐               ┌─────────────────────────┐       ┌─────────────┐ │
│  │ analysisGoal   │──────────────▶│ Template Research Agent │──────▶│ Recommended │ │
│  │ businessQstns  │               │ ┌───────────────────┐   │       │ Templates   │ │
│  │ targetAudience │               │ │semantic_search    │   │       │ Confidence  │ │
│  │ decisionContext│               │ │vector_similarity  │   │       │ Market Fit  │ │
│  └────────────────┘               │ └───────────────────┘   │       └─────────────┘ │
│                                   └─────────────────────────┘                        │
│                                              │                                        │
│                                              ▼                                        │
│                                   ┌─────────────────────────┐       ┌─────────────┐ │
│                                   │ Data Scientist Agent    │──────▶│ Analysis    │ │
│                                   │ ┌───────────────────┐   │       │ Path[]      │ │
│                                   │ │inferAnalysisPath  │   │       │ Required    │ │
│                                   │ │inferDataElements  │   │       │ Elements[]  │ │
│                                   │ │linkQtoA          │   │       │ Q→A Mapping │ │
│                                   │ └───────────────────┘   │       └─────────────┘ │
│                                   └─────────────────────────┘                        │
│                                                                                      │
│  MCP TOOLS USED:                                                                     │
│  • template_library_manager (search, recommend)                                      │
│  • business_definition_lookup (industry definitions)                                 │
│  • researcher_definition_inference (AI gap filling)                                  │
│  • required_data_elements_validator (schema validation)                              │
│                                                                                      │
│  VALUE: Converts vague business questions into structured analysis requirements      │
│         Creates traceability from questions → analyses → expected answers            │
│                                                                                      │
│  SAVED TO: journeyProgress.requirementsDocument (SSOT)                              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Input/Output Details:**

| Field | Type | Example |
|-------|------|---------|
| **INPUT: analysisGoal** | string | "Understand employee engagement drivers" |
| **INPUT: businessQuestions** | string[] | ["What drives satisfaction?", "Why is turnover high?"] |
| **INPUT: targetAudience** | enum | `ceo`, `business_manager`, `data_analyst` |
| **OUTPUT: analysisPath** | AnalysisPath[] | `[{ analysisId, analysisType: 'correlation', techniques: [...] }]` |
| **OUTPUT: requiredDataElements** | Element[] | `[{ elementId, elementName: 'Satisfaction Score', dataType: 'numeric' }]` |
| **OUTPUT: questionAnswerMapping** | Mapping[] | `[{ questionId, requiredDataElements: [...], recommendedAnalyses: [...] }]` |

---

### STEP 2: DATA UPLOAD & VERIFICATION

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: DATA UPLOAD & VERIFICATION                                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  USER INPUT                        AGENT PROCESSING                   OUTPUT         │
│  ──────────                        ────────────────                   ──────         │
│  ┌────────────────┐               ┌─────────────────────────┐       ┌─────────────┐ │
│  │ CSV/Excel/JSON │──────────────▶│ Data Engineer Agent     │──────▶│ Schema      │ │
│  │ files (1+)     │               │ ┌───────────────────┐   │       │ Detection   │ │
│  │                │               │ │file_processor     │   │       │ Quality     │ │
│  │                │               │ │schema_generator   │   │       │ Score       │ │
│  │                │               │ │data_quality_      │   │       │ PII Columns │ │
│  │                │               │ │  monitor          │   │       │ Preview     │ │
│  │                │               │ │scan_pii_columns   │   │       └─────────────┘ │
│  │                │               │ └───────────────────┘   │                        │
│  └────────────────┘               └─────────────────────────┘                        │
│                                              │                                        │
│                                              ▼                                        │
│                                   ┌─────────────────────────┐       ┌─────────────┐ │
│                                   │ User Checkpoint         │◀─────▶│ Approve     │ │
│                                   │ "Data Quality Review"   │       │ /Reject     │ │
│                                   │ ┌───────────────────┐   │       │ PII         │ │
│                                   │ │quality metrics    │   │       │ Decisions   │ │
│                                   │ │pii warnings       │   │       └─────────────┘ │
│                                   │ │schema mismatches  │   │                        │
│                                   │ └───────────────────┘   │                        │
│                                   └─────────────────────────┘                        │
│                                                                                      │
│  MCP TOOLS USED:                                                                     │
│  • file_processor (CSV, Excel, JSON parsing)                                         │
│  • schema_generator (auto-detect types)                                              │
│  • data_quality_monitor (completeness, duplicates)                                   │
│  • scan_pii_columns (detect names, emails, SSNs)                                     │
│  • required_data_elements_validator (map to requirements)                            │
│                                                                                      │
│  VALUE: Ensures data quality before expensive analysis operations                    │
│         Protects sensitive data through PII detection                                │
│         Creates mapping between uploaded columns and required elements               │
│                                                                                      │
│  SAVED TO: datasets.ingestionMetadata, journeyProgress.piiDecision                  │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 3: DATA TRANSFORMATION

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: DATA TRANSFORMATION                                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  USER INPUT                        AGENT PROCESSING                   OUTPUT         │
│  ──────────                        ────────────────                   ──────         │
│  ┌────────────────┐               ┌─────────────────────────┐       ┌─────────────┐ │
│  │ Column Mappings│──────────────▶│ Data Engineer Agent     │──────▶│ Transformed │ │
│  │ Join Config    │               │ ┌───────────────────┐   │       │ Data[]      │ │
│  │ Filter Rules   │               │ │data_transformer   │   │       │ Transformed │ │
│  │ Aggregations   │               │ │apply_             │   │       │ Schema      │ │
│  │ Derivations    │               │ │  transformations  │   │       │ Record      │ │
│  │                │               │ │intelligent_data_  │   │       │ Count       │ │
│  │                │               │ │  transform        │   │       └─────────────┘ │
│  └────────────────┘               │ └───────────────────┘   │                        │
│                                   └─────────────────────────┘                        │
│                                                                                      │
│  TRANSFORMATION TYPES:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ filter → select → rename → derive → clean → aggregate                       │    │
│  │                                                                             │    │
│  │ MULTI-DATASET JOIN:                                                         │    │
│  │ ┌──────────┐    ┌──────────┐     JOIN      ┌───────────────────────────┐   │    │
│  │ │Dataset 1 │ + │Dataset 2 │ ──────────────▶│ Merged Dataset            │   │    │
│  │ │(Primary) │    │(Lookup)  │   LEFT/INNER  │ (prefixed columns)        │   │    │
│  │ └──────────┘    └──────────┘               └───────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  MCP TOOLS USED:                                                                     │
│  • data_transformer (clean, derive features)                                         │
│  • apply_transformations (chain multiple steps)                                      │
│  • intelligent_data_transform (format conversion)                                    │
│  • required_data_elements_validator (verify mapping completeness)                    │
│                                                                                      │
│  VALUE: Prepares data in exact format required by analysis scripts                   │
│         Handles multi-dataset scenarios with automatic joins                         │
│         Creates derived metrics (e.g., avg satisfaction from Q1-Q4)                  │
│                                                                                      │
│  SAVED TO: datasets.ingestionMetadata.transformedData (PRIORITY DATA SOURCE)        │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 4: PLAN GENERATION & APPROVAL

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: PLAN GENERATION & APPROVAL                                                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  INPUT (from Steps 1-3)            PM AGENT ORCHESTRATION             OUTPUT         │
│  ──────────────────────            ─────────────────────              ──────         │
│  ┌────────────────┐               ┌─────────────────────────┐       ┌─────────────┐ │
│  │ Requirements   │               │ Project Manager Agent   │       │ Analysis    │ │
│  │ Document       │──────────────▶│ (Orchestrator)          │──────▶│ Plan        │ │
│  │ ├ analysisPath │               │                         │       │ ├ Steps[]   │ │
│  │ ├ elements[]   │               │  Sequential Execution:  │       │ ├ Duration  │ │
│  │ └ Q→A mapping  │               │  1. DE Agent (validate) │       │ ├ Cost      │ │
│  │                │               │  2. DS Agent (blueprint)│       │ ├ Risks     │ │
│  │ Transformed    │               │  3. BA Agent (impact)   │       │ └ Recommend │ │
│  │ Data           │               │  4. PM Agent (synthesize│       └─────────────┘ │
│  └────────────────┘               └─────────────────────────┘                        │
│                                              │                                        │
│                                              ▼                                        │
│                                   ┌─────────────────────────┐       ┌─────────────┐ │
│                                   │ User Checkpoint         │◀─────▶│ Approve     │ │
│                                   │ "Plan Approval"         │       │ /Modify     │ │
│                                   │ ┌───────────────────┐   │       │ /Reject     │ │
│                                   │ │estimated cost     │   │       └─────────────┘ │
│                                   │ │risk assessment    │   │                        │
│                                   │ │expected outputs   │   │                        │
│                                   │ └───────────────────┘   │                        │
│                                   └─────────────────────────┘                        │
│                                                                                      │
│  MCP TOOLS USED:                                                                     │
│  • workflow_evaluator (assess data readiness)                                        │
│  • risk_assessor (identify potential issues)                                         │
│  • cost_calculator (estimate analysis cost)                                          │
│  • checkpoint_manager (create approval checkpoint)                                   │
│  • progress_reporter (generate summary for user)                                     │
│                                                                                      │
│  VALUE: Provides transparency into what will be analyzed and at what cost            │
│         Allows user to modify scope before expensive operations                      │
│         Creates audit trail of user approval                                         │
│                                                                                      │
│  SAVED TO: analysisPlans table, journeyProgress.planApproved                        │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 5: BILLING & PAYMENT

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: BILLING & PAYMENT                                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  PRICING CALCULATION                 PAYMENT FLOW                     ACCESS GATE    │
│  ───────────────────                 ────────────                     ───────────    │
│  ┌────────────────┐               ┌─────────────────────────┐       ┌─────────────┐ │
│  │ PricingService │               │ Stripe Checkout         │       │ Payment     │ │
│  │ ┌────────────┐ │               │                         │       │ Gate        │ │
│  │ │Base Cost   │ │──────────────▶│ createPaymentIntent()  │──────▶│             │ │
│  │ │$10 base    │ │               │                         │       │ isPaid=true │ │
│  │ ├────────────┤ │               │ Webhook:               │       │ OR          │ │
│  │ │Data Size   │ │               │ payment_intent.        │       │ active      │ │
│  │ │$0.05/1K row│ │               │   succeeded            │       │ subscription│ │
│  │ ├────────────┤ │               └─────────────────────────┘       └─────────────┘ │
│  │ │Complexity  │ │                                                                  │
│  │ │1.0-2.5x    │ │                                                                  │
│  │ ├────────────┤ │    COST FACTORS BY ANALYSIS TYPE:                               │
│  │ │Type Factor │ │    ┌──────────────────────────────────────────┐                 │
│  │ │statistical │ │    │ statistical:         1.0x               │                 │
│  │ │ML: 2.5x    │ │    │ machine_learning:    2.5x               │                 │
│  │ │TimeSeries: │ │    │ time_series:         2.0x               │                 │
│  │ │2.0x        │ │    │ business_intel:      1.5x               │                 │
│  │ └────────────┘ │    │ visualization:       0.5x               │                 │
│  └────────────────┘    └──────────────────────────────────────────┘                 │
│                                                                                      │
│  SUBSCRIPTION TIERS:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ none       → Pay-per-project                                                │    │
│  │ starter    → 5 analyses/month, basic stats                                  │    │
│  │ pro        → 20 analyses/month, ML included                                 │    │
│  │ enterprise → Unlimited, priority support, Spark enabled                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  API ENDPOINTS:                                                                      │
│  • GET /api/projects/:id/cost-estimate (AUTHORITATIVE)                              │
│  • POST /api/analysis-payment/create-checkout                                        │
│  • POST /api/stripe-webhooks (payment confirmation)                                  │
│                                                                                      │
│  VALUE: Ensures sustainable platform operation                                       │
│         Provides transparent cost breakdown before commitment                        │
│         Enables preview mode for unpaid users (limited results)                      │
│                                                                                      │
│  SAVED TO: projects.isPaid, projects.lockedCostEstimate, projects.costBreakdown     │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 6: ANALYSIS EXECUTION

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: ANALYSIS EXECUTION                                                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  EXECUTION ORCHESTRATION                                                             │
│  ═══════════════════════                                                             │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                    executeComprehensiveAnalysis()                            │   │
│  │                                                                              │   │
│  │  ┌─────────────────┐                                                        │   │
│  │  │ Load User       │  questions, goals, audience, decision context          │   │
│  │  │ Context         │                                                        │   │
│  │  └────────┬────────┘                                                        │   │
│  │           ▼                                                                  │   │
│  │  ┌─────────────────┐                                                        │   │
│  │  │ Load Datasets   │  Priority: transformedData > original                  │   │
│  │  │ Extract Rows    │  Apply PII filtering                                   │   │
│  │  └────────┬────────┘                                                        │   │
│  │           ▼                                                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐        │   │
│  │  │              PER-ANALYSIS EXECUTION LOOP                        │        │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │        │   │
│  │  │  │ For each analysis in analysisPath:                      │   │        │   │
│  │  │  │                                                         │   │        │   │
│  │  │  │   ┌──────────────┐    ┌──────────────────────────────┐ │   │        │   │
│  │  │  │   │ COMPUTE      │    │ PYTHON SCRIPTS               │ │   │        │   │
│  │  │  │   │ ENGINE       │───▶│ ┌────────────────────────┐   │ │   │        │   │
│  │  │  │   │ SELECTOR     │    │ │ descriptive_stats.py   │   │ │   │        │   │
│  │  │  │   │              │    │ │ correlation_analysis.py│   │ │   │        │   │
│  │  │  │   │ <50K: local  │    │ │ regression_analysis.py │   │ │   │        │   │
│  │  │  │   │ 50K-1M:polars│    │ │ clustering_analysis.py │   │ │   │        │   │
│  │  │  │   │ >1M: spark   │    │ │ time_series_analysis.py│   │ │   │        │   │
│  │  │  │   └──────────────┘    │ └────────────────────────┘   │ │   │        │   │
│  │  │  │                       └──────────────────────────────┘ │   │        │   │
│  │  │  │   ┌──────────────┐    ┌──────────────────────────────┐ │   │        │   │
│  │  │  │   │ RESULTS      │◀───│ insights[]                   │ │   │        │   │
│  │  │  │   │ ACCUMULATOR  │    │ visualizations[]             │ │   │        │   │
│  │  │  │   │              │    │ recommendations[]            │ │   │        │   │
│  │  │  │   │ Tag with     │    │ metadata                     │ │   │        │   │
│  │  │  │   │ sourceAnalysisId  └──────────────────────────────┘ │   │        │   │
│  │  │  │   └──────────────┘                                     │   │        │   │
│  │  │  └─────────────────────────────────────────────────────────┘   │        │   │
│  │  └────────────────────────────────────────────────────────────────┘        │   │
│  │           ▼                                                                  │   │
│  │  ┌─────────────────┐                                                        │   │
│  │  │ Business Agent  │  translateResults() → executive, technical, analyst    │   │
│  │  │ Translation     │  assessBusinessImpact() → ROI, value assessment        │   │
│  │  │                 │  generateIndustryInsights() → sector recommendations   │   │
│  │  │                 │  generateBusinessKPIs() → relevant metrics             │   │
│  │  └────────┬────────┘                                                        │   │
│  │           ▼                                                                  │   │
│  │  ┌─────────────────┐                                                        │   │
│  │  │ Q&A Service     │  Match insights to user questions                      │   │
│  │  │                 │  Generate evidence chains                              │   │
│  │  │                 │  Calculate confidence scores                           │   │
│  │  └────────┬────────┘                                                        │   │
│  │           ▼                                                                  │   │
│  │  ┌─────────────────┐                                                        │   │
│  │  │ Artifact Gen    │  PDF, PPTX, CSV, JSON (async, non-blocking)           │   │
│  │  │ (Background)    │  PII filtering applied                                 │   │
│  │  └─────────────────┘                                                        │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  MCP TOOLS USED:                                                                     │
│  • comprehensive_analysis (full workflow)                                            │
│  • statistical_analyzer (hypothesis testing)                                         │
│  • enhanced_statistical_analyzer (auto-select SciPy/Statsmodels)                     │
│  • comprehensive_ml_pipeline (AutoML)                                                │
│  • enhanced_visualization_engine (Plotly/Matplotlib/D3)                              │
│  • question_answer_generator (evidence chain)                                        │
│  • audience_formatter (executive/technical/ops)                                      │
│  • artifact_generator (PDF, CSV, PPTX)                                               │
│                                                                                      │
│  VALUE: Executes specialized analysis using type-specific algorithms                 │
│         Provides traceability from questions → analysis → answers                    │
│         Generates audience-appropriate explanations                                  │
│                                                                                      │
│  SAVED TO: projects.analysisResults, journeyProgress.translatedResults              │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 7: RESULTS & DASHBOARD

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: RESULTS & DASHBOARD                                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  RESULTS STRUCTURE                                                                   │
│  ═════════════════                                                                   │
│                                                                                      │
│  project.analysisResults = {                                                         │
│    ┌─────────────────────────────────────────────────────────────────────────────┐  │
│    │ insights: [                                                                 │  │
│    │   { id, title, summary, impact, confidence, category, sourceAnalysisId }   │  │
│    │ ]                                                                           │  │
│    │ recommendations: [                                                          │  │
│    │   { id, title, description, priority, actionItems[] }                      │  │
│    │ ]                                                                           │  │
│    │ visualizations: [                                                           │  │
│    │   { id, type, title, config, data }                                        │  │
│    │ ]                                                                           │  │
│    │ summary: {                                                                  │  │
│    │   totalAnalyses, dataRowsProcessed, columnsAnalyzed, qualityScore          │  │
│    │ }                                                                           │  │
│    │ questionAnswers: {                                                          │  │
│    │   answers: [{ question, answer, confidence, sources[], status }]           │  │
│    │ }                                                                           │  │
│    │ analysisStatuses: [         // Per-analysis execution tracking             │  │
│    │   { analysisId, analysisName, status, insightCount, executionTimeMs }      │  │
│    │ ]                                                                           │  │
│    │ perAnalysisBreakdown: {     // Detailed per-analysis results               │  │
│    │   'correlation-1': { status, insights[], visualizations[] }                │  │
│    │ }                                                                           │  │
│    └─────────────────────────────────────────────────────────────────────────────┘  │
│  }                                                                                   │
│                                                                                      │
│  journeyProgress.translatedResults = {                                               │
│    ┌─────────────────────────────────────────────────────────────────────────────┐  │
│    │ executive: { insights[], recommendations[], executiveSummary }              │  │
│    │ technical: { insights[], recommendations[], executiveSummary }              │  │
│    │ analyst:   { insights[], recommendations[], executiveSummary }              │  │
│    └─────────────────────────────────────────────────────────────────────────────┘  │
│  }                                                                                   │
│                                                                                      │
│  ARTIFACTS GENERATED:                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ uploads/artifacts/{projectId}/                                              │    │
│  │ ├── {projectId}-report.pdf         (Statistical analysis report)           │    │
│  │ ├── {projectId}-presentation.pptx  (Executive presentation)                │    │
│  │ ├── {projectId}-data.csv           (Transformed data, PII filtered)        │    │
│  │ ├── {projectId}-data.json          (JSON export)                           │    │
│  │ └── visualizations/*.png           (Charts and graphs)                     │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  DASHBOARD COMPONENTS:                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │ project-page.tsx                                                            │    │
│  │ ├── Overview Tab: Summary stats, quality score, execution time             │    │
│  │ ├── Insights Tab:                                                          │    │
│  │ │   ├── Analysis Execution Trace (analysisStatuses)                        │    │
│  │ │   ├── AudienceTranslatedResults (BA translations)                        │    │
│  │ │   └── AIInsights (Q&A exploration)                                       │    │
│  │ ├── Visualizations Tab: Interactive charts                                 │    │
│  │ ├── Data Tab: Transformed data preview                                     │    │
│  │ └── Artifacts Tab: Download links                                          │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
│  VALUE: Provides actionable business intelligence                                    │
│         Shows evidence chain from questions to answers                               │
│         Offers multiple audience-appropriate views                                   │
│         Enables data export for further analysis                                     │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. MCP TOOL USAGE BY STEP

| Step | Agent | Tools Used | Category |
|------|-------|-----------|----------|
| **Prepare** | Template Research | template_library_manager, web_researcher, content_synthesizer | ra_templates |
| **Prepare** | Data Scientist | required_data_elements_validator, business_definition_lookup | analysis |
| **Upload** | Data Engineer | file_processor, schema_generator, csv/excel_ingestion | data_ingestion |
| **Verify** | Data Engineer | data_quality_monitor, scan_pii_columns | de_quality |
| **Transform** | Data Engineer | data_transformer, apply_transformations | de_pipeline |
| **Plan** | PM Agent | workflow_evaluator, cost_calculator, checkpoint_manager | pm_coordination |
| **Execute** | Data Scientist | comprehensive_analysis, statistical_analyzer, comprehensive_ml_pipeline | analysis |
| **Execute** | Business Agent | audience_formatter, roi_calculator, industry_research | business |
| **Results** | PM Agent | artifact_generator, presentation_generator | utility |

---

## 4. FRICTION POINTS & IMPROVEMENT OPPORTUNITIES

### FRICTION 1: Sequential Analysis Execution (HIGH IMPACT)

**Current State:**
```
Analysis 1 (correlation) → wait → Analysis 2 (regression) → wait → Analysis 3 (clustering)
Total time: SUM(individual times)
```

**Problem:** Analyses execute sequentially even when independent (no data dependencies)

**Solution:** Implement parallel execution with Spark or Promise.all:

```typescript
// PROPOSED: Parallel analysis execution
const independentAnalyses = analysisPath.filter(a => a.dependencies.length === 0);
const dependentAnalyses = analysisPath.filter(a => a.dependencies.length > 0);

// Execute independent analyses in parallel
const independentResults = await Promise.all(
    independentAnalyses.map(analysis =>
        executeAnalysisWithTimeout(analysis, transformedData, 60000)
    )
);

// Execute dependent analyses sequentially (respecting dependencies)
for (const analysis of topologicalSort(dependentAnalyses)) {
    await executeAnalysis(analysis, transformedData);
}
```

**Expected Impact:** 40-60% reduction in execution time for multi-analysis workflows

---

### FRICTION 2: Compute Engine Selection Not Used

**Current State:**
```
ComputeEngineSelector exists but Python scripts always run locally
Spark tools registered but never invoked for large datasets
```

**Problem:**
- `ComputeEngineSelector.selectEngine()` returns 'spark' for >1M rows
- But `PythonProcessor.processData()` always uses local spawn
- Spark integration exists (`spark-services.ts`) but not wired to analysis

**Solution:** Wire compute engine selection into execution:

```typescript
// In analysis-execution.ts
const engine = ComputeEngineSelector.selectEngine({
    recordCount: data.length,
    analysisType: analysis.analysisType,
    complexity: analysis.complexity
});

if (engine.engine === 'spark') {
    return await SparkServices.executeAnalysis(analysis, data);
} else if (engine.engine === 'polars') {
    return await PolarsProcessor.executeAnalysis(analysis, data);
} else {
    return await PythonProcessor.processData(analysis, data);
}
```

---

### FRICTION 3: Result Consolidation Complexity

**Current State:**
```
Per-analysis results stored in Map
Merged at end with simple concatenation
No deduplication or conflict resolution
```

**Problem:**
- Same insight may be generated by multiple analyses
- Recommendations may conflict
- No weighting by source analysis quality

**Solution:** Implement intelligent result consolidation:

```typescript
const consolidatedResults = {
    insights: deduplicateByTitle(allInsights)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_INSIGHTS),

    recommendations: resolveConflicts(allRecommendations)
        .prioritizeByImpact(),

    visualizations: selectBestVisualization(perAnalysisViz)
        .byDataCoverage()
};
```

---

### FRICTION 4: Billing Calculation Inconsistency

**Current State:**
```
3 different pricing formulas:
1. PricingService.calculateAnalysisCost() - $10 base + $0.05/1K rows
2. Cost-estimate endpoint - $5 base + $2/1K rows + $10/analysis
3. Billing service - Complex tier-based calculation
```

**Problem:** User sees different prices at different stages

**Solution:** Single authoritative pricing source:

```typescript
// All pricing should flow through:
GET /api/projects/:id/cost-estimate

// Frontend reads:
backendCostEstimate.totalCost // AUTHORITATIVE

// Stripe checkout uses:
project.lockedCostEstimate // Locked at plan approval
```

---

### FRICTION 5: WebSocket Event Fragmentation

**Current State:**
```
Multiple WebSocket event types:
- execution_progress (from orchestrator)
- job_complete (from realtime bridge)
- workflow_progress (from message broker)
- agent_status (from agent bridge)
```

**Problem:** Frontend must listen to many events for unified progress

**Solution:** Unified progress event:

```typescript
interface UnifiedProgressEvent {
    projectId: string;
    phase: 'prepare' | 'upload' | 'verify' | 'transform' | 'plan' | 'execute' | 'results';
    step: string;
    progress: number; // 0-100
    status: 'pending' | 'running' | 'completed' | 'error';
    details: {
        currentAgent?: string;
        currentTool?: string;
        message?: string;
        eta?: number;
    };
}

// Single event: 'journey:progress'
```

---

## 5. VALUE PROPOSITION BY STEP

| Step | User Value | Platform Value | Business Value |
|------|-----------|----------------|----------------|
| **Prepare** | Questions → structured plan | Reduces analysis scope creep | Higher completion rate |
| **Upload** | Automatic schema detection | Data quality baseline | Fewer support tickets |
| **Verify** | PII protection & quality check | Compliance (GDPR, CCPA) | Legal risk reduction |
| **Transform** | Multi-dataset joins | Consistent data format | Reusable transformations |
| **Plan** | Cost transparency | User commitment checkpoint | Revenue predictability |
| **Execute** | Automated analysis | CPU/GPU utilization | Scalable pricing |
| **Results** | Actionable insights | Evidence chain | Decision support |

---

## 6. DATA PERSISTENCE SSOT (Single Source of Truth)

```
journeyProgress (projects.journeyProgress JSONB)
├── completedSteps[]           ← JourneyStateManager
├── currentStep                ← Current journey phase
├── requirementsDocument       ← DS Agent output (CRITICAL)
│   ├── analysisPath[]         ← What analyses to run
│   ├── requiredDataElements[] ← What data is needed
│   └── questionAnswerMapping[]← Q→A traceability
├── piiDecision                ← User PII choices
├── transformationPlan         ← DE Agent output
├── transformationApproved     ← User approval flag
├── joinedData                 ← Multi-dataset join result
├── planApproved               ← User plan approval
├── translatedResults          ← BA Agent output (by audience)
├── businessImpact             ← BA Agent ROI assessment
├── industryInsights           ← BA Agent recommendations
├── businessKPIs               ← BA Agent metrics
└── status                     ← Overall journey status

datasets[].ingestionMetadata (PRIMARY DATA SOURCE)
├── transformedData[]          ← User-approved transformed rows
├── transformedSchema          ← Inferred schema
├── columnMappings             ← Source→element mappings
└── recordCount                ← Row count

projects.analysisResults (EXECUTION OUTPUT)
├── insights[]                 ← Analysis findings
├── recommendations[]          ← Action items
├── visualizations[]           ← Charts & graphs
├── analysisStatuses[]         ← Per-analysis tracking
├── perAnalysisBreakdown       ← Detailed results
└── questionAnswers            ← Q&A with evidence
```

---

## 7. RECOMMENDED IMPROVEMENTS

### Short-term (1-2 weeks)
1. **Parallel Analysis Execution** - Use Promise.all for independent analyses
2. **Unified Progress Events** - Single WebSocket event for journey progress
3. **Cost Lock at Plan Approval** - Ensure Stripe uses locked cost

### Medium-term (2-4 weeks)
4. **Spark Integration** - Wire ComputeEngineSelector to actual execution
5. **Result Deduplication** - Intelligent consolidation of per-analysis results
6. **Checkpoint Recovery** - Resume from any checkpoint after server restart

### Long-term (1-2 months)
7. **Streaming Analysis** - Real-time results as each analysis completes
8. **Analysis Caching** - Reuse results for identical data+analysis combinations
9. **Custom Tool Registration** - Allow users to add custom analysis scripts

---

## 8. CONSOLE VERIFICATION CHECKLIST

When running a complete journey, verify these log messages appear:

```
✅ [Prepare] Saved requirementsDocument with X analyses to journeyProgress SSOT
✅ [DS Agent] Generated X required data elements linked to Y analyses
📋 [GAP 5] Received X DS-recommended analyses
❓ [GAP 5] Received X question-answer mappings for evidence chain
🔬 DataScienceOrchestrator: Running correlation_analysis.py
🔬 DataScienceOrchestrator: Running regression_analysis.py
📊 [Execution Response] Returning X analysis statuses
💼 [BA Agent] Translating results for executive audience
✅ Generated 5 artifacts (async): PDF ✅, PPTX ✅, CSV ✅, JSON ✅, Dashboard ✅
💰 [PHASE 7] Using backend cost estimate: $X.XX (LOCKED)
```

---

---

## 9. DATA CONTINUITY BREAK POINTS (Feb 2026 Audit)

Five critical points where data from one pipeline stage doesn't properly flow to the next:

### Break 1: Question-Element Linkage via Text
- **Location**: `required-data-elements-tool.ts:31,1213`
- **Problem**: Questions linked to elements via text matching, not stable IDs
- **Fix Status**: `generateStableQuestionId()` added to `server/constants.ts`, partially adopted
- **Risk**: Evidence chain breaks when question text changes

### Break 2: Element Mappings Split Across Two Sources
- **Location**: `requirementsDocument.sourceColumn` (NULL) vs `dataset.ingestionMetadata.columnMappings` (actual)
- **Problem**: Two different locations store the same mapping data, never reconciled
- **Fix Status**: P0-3 writeback implemented (Feb 2026) writes `columnLookup` back to reqDoc after resolution
- **Risk**: Element context lost when reading from requirementsDocument

### Break 3: Business Definitions Loaded But Ignored
- **Location**: `project.ts:7525-7545` (loaded), `7647-7665` (logged), transformation switch (NOT used)
- **Problem**: Business calculation formulas, component fields, and aggregation methods never injected into transformations
- **Fix Status**: Partial — pseudoCode execution added (Fix 2B), full business definition consumption pending (P1-5)
- **Risk**: Derived columns use default aggregation instead of domain-specific calculations

### Break 4: Analysis Insights Linked via Keyword Matching
- **Location**: `analysis-execution.ts` result assembly
- **Problem**: No stable ID link between user questions and analysis insights
- **Fix Status**: Open
- **Risk**: Cannot trace which insights answer which questions

### Break 5: Verification Step Doesn't Validate Element Satisfaction
- **Location**: `data-verification-step.tsx`
- **Problem**: User can proceed past verification without all required data elements being mappable
- **Fix Status**: P1-6 planned (Feb 2026)
- **Risk**: Incomplete mappings lead to failed or poor-quality analysis

---

## 10. journeyProgress FIELD REFERENCE BY STEP

| Step | Fields Written | Fields Read |
|------|---------------|-------------|
| **Prepare** | `analysisGoal`, `userQuestions`, `audience`, `selectedTemplates`, `industry` | (none — initial step) |
| **Data Upload** | `joinedData` (preview, schema, rowCount) | (none) |
| **Verification** | `piiDecision`, `verificationStatus`, `requirementsDocument`, `requirementsLocked` | `verificationStatus` (restoration) |
| **Transformation** | `transformationApplied`, `transformedRowCount`, `transformationMappings`, `joinedData` (with joinConfig), `columnMappings` | `requirementsDocument`, `joinedData` |
| **Plan** | `analysisPath`, `lockedCostEstimate` | `requirementsDocument`, `transformedRowCount` |
| **Pricing** | `paymentStatus`, `appliedCampaign`, `isPaid`, `paidAt` | `lockedCostEstimate` |
| **Execution** | `executionStatus`, `executionCompletedAt`, `analysisResults` (cached preview), `lastCreditDeductionId` | `analysisGoal`, `userQuestions`, `audience`, `piiDecision`, `analysisPath` |
| **Dashboard** | (none — display only) | `analysisResults`, `audience` |

*Last Updated: February 13, 2026*
