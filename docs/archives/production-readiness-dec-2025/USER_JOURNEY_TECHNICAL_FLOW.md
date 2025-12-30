# User Journey Technical Flow Documentation

**Last Updated**: December 11, 2025
**Purpose**: Complete technical mapping of user journey steps, agentic activity, data flow, and tools

---

## Table of Contents

1. [Journey Overview](#1-journey-overview)
2. [Step-by-Step Technical Flow](#2-step-by-step-technical-flow)
3. [Agent Activity Matrix](#3-agent-activity-matrix)
4. [Tool Registry](#4-tool-registry)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Frontend Components](#6-frontend-components)
7. [API Endpoints](#7-api-endpoints)
8. [Database Tables](#8-database-tables)

---

## 1. Journey Overview

### 1.1 Journey Types

| Journey Type | Target Audience | Templates | Complexity |
|--------------|-----------------|-----------|------------|
| `non-tech` | Non-technical stakeholders | 1 (Guided Essentials) | Low |
| `business` | Business executives | 15 (Industry-specific) | Medium |
| `technical` | Data professionals | 1 (Advanced Pipeline) | High |
| `consultation` | Consultation engagements | 1 (Intake Flow) | Variable |

### 1.2 Standard Journey Steps (9 Steps)

| Step # | Step ID | Name | Phase |
|--------|---------|------|-------|
| 1 | `data` | Data Upload | Data |
| 2 | `prepare` | Analysis Preparation | Prepare |
| 3 | `data-verification` | Data Verification | Data |
| 4 | `data-transformation` | Data Transformation | Transform |
| 5 | `project-setup` | Project Setup | Prepare |
| 6 | `plan` | Analysis Planning | Execute |
| 7 | `execute` | Execution | Execute |
| 8 | `pricing` | Billing & Payment | Execute |
| 9 | `results` | Results & Artifacts | Results |

---

## 2. Step-by-Step Technical Flow

### Step 1: Data Upload

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/data` |
| **Frontend Page** | `client/src/pages/data-step.tsx` |
| **Primary Component** | `DataStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/projects/:id/upload` | `{ files: File[], datasetName }` | `{ uploadedFileIds, dataPreview, validation }` |
| GET | `/api/projects/:id/datasets` | - | All datasets with metadata |
| POST | `/api/projects/:id/pii-analysis` | Dataset IDs | `{ detectedPII, riskAssessment }` |
| GET | `/api/projects/:id/data-quality` | - | Quality metrics |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Technical AI Agent | Schema detection, data profiling | - |
| Data Engineer Agent | Quality assessment | Data Quality Checkpoint |
| Project Manager Agent | Orchestration | PII Review Checkpoint |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `schema_generator` | Raw file bytes | Parse CSV/Excel, detect types | `{ columns, types, nullability }` |
| `data_quality_checker` | Parsed data rows | Compute completeness, consistency | `{ qualityScore, issues[] }` |
| `pii_detector` | Column values | Regex + ML pattern matching | `{ piiColumns[], riskLevel }` |

#### Data Flow

```
User uploads file(s)
    ↓
POST /api/projects/:id/upload
    ↓
FileProcessor.processUpload()
    ↓
├── Store file → uploads/originals/{projectId}/{timestamp}_{filename}
├── Parse data → Extract rows, detect schema
├── PII scan → Identify sensitive columns
└── Quality check → Compute metrics
    ↓
INSERT datasets (originalFileName, schema, preview, ingestionMetadata)
INSERT projectDatasets (projectId, datasetId)
    ↓
WebSocket: agent:status → "Data uploaded successfully"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `DataStep` | `data-step.tsx` | Main page container |
| `FileUploader` | `ui/file-upload.tsx` | Drag-drop file upload |
| `DataPreviewTable` | `data-preview.tsx` | Show first N rows |
| `PIIDetectionDialog` | `PIIDetectionDialog.tsx` | PII review modal |
| `DataQualityDashboard` | `DataQualityDashboard.tsx` | Quality metrics display |
| `AgentCheckpoints` | `agent-checkpoints.tsx` | Checkpoint approvals |

---

### Step 2: Analysis Preparation

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/prepare` |
| **Frontend Page** | `client/src/pages/prepare-step.tsx` |
| **Primary Component** | `PrepareStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/projects/:id/questions` | `{ questions: string[] }` | `{ saved: true, count }` |
| POST | `/api/pm-clarification/request` | `{ clarificationData }` | `{ conversationId, agentResponse }` |
| GET | `/api/templates` | - | Available templates |
| POST | `/api/projects/:id/save-data-mapping` | `{ fieldMappings }` | `{ saved: true }` |
| PUT | `/api/projects/:id` | `{ analysisGoal, audience }` | Updated project |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Project Manager Agent | Goal clarification, template suggestion | PM Clarification Dialog |
| Business Agent | Audience-appropriate recommendations | - |
| Template Research Agent | Industry template matching | - |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `question_analyzer` | User questions | NLP extraction of intent | `{ intents[], dataNeeds[] }` |
| `template_matcher` | Industry + goals | Similarity matching | `{ templates[], scores[] }` |
| `audience_translator` | Technical content | Simplify for audience | `{ translatedContent }` |

#### Data Flow

```
User enters goals, questions, audience
    ↓
├── POST /api/projects/:id/questions (Week 1 fix: saves to project_questions table)
├── PUT /api/projects/:id { analysisGoal, audience }
└── POST /api/pm-clarification/request (if clarification needed)
    ↓
PM Agent analyzes requirements
    ↓
├── Template Research Agent → suggests templates
├── Business Agent → audience recommendations
└── Questions saved to project_questions table
    ↓
UPDATE projects (analysisGoal, businessQuestions, audience)
INSERT project_questions (projectId, questionText, questionOrder)
    ↓
WebSocket: agent:status → "Requirements captured"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `PrepareStep` | `prepare-step.tsx` | Main page container |
| `AudienceDefinitionSection` | `AudienceDefinitionSection.tsx` | Primary/secondary audience |
| `PMAgentClarificationDialog` | `PMAgentClarificationDialog.tsx` | AI clarification dialog |
| `RequiredDataElementsDisplay` | `RequiredDataElementsDisplay.tsx` | Show required columns |
| `TemplateSelector` | (inline) | Template selection UI |

---

### Step 3: Data Verification

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/data-verification` |
| **Frontend Page** | `client/src/pages/data-verification-step.tsx` |
| **Primary Component** | `DataVerificationStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| PUT | `/api/projects/:id/verify` | `{ piiReviewCompleted, dataQualityApproved, excludedColumns }` | Updated project |
| GET | `/api/projects/:id/data-quality` | - | Quality assessment |
| GET | `/api/projects/:id/pii-analysis` | - | PII findings |
| POST | `/api/projects/:id/checkpoints` | `{ type, approval }` | Checkpoint status |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Data Engineer Agent | Quality validation | Data Quality Checkpoint |
| Technical AI Agent | Schema validation | - |
| Project Manager Agent | Approval orchestration | Verification Checkpoint |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `data_quality_checker` | Dataset rows | Comprehensive quality analysis | `{ completeness, accuracy, consistency }` |
| `schema_validator` | Schema + data | Type conformance check | `{ valid: boolean, errors[] }` |
| `pii_verifier` | PII findings | User confirmation workflow | `{ confirmed, excluded[] }` |

#### Data Flow

```
User reviews quality + PII findings
    ↓
PUT /api/projects/:id/verify
    ↓
├── Mark PII columns for exclusion
├── Approve data quality
└── Create verification checkpoint
    ↓
UPDATE projects (piiReviewCompleted, dataQualityApproved, excludedColumns)
UPDATE projects.journeyProgress (stepCompleted: data-verification)
    ↓
WebSocket: checkpoint:completed → "Verification approved"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `DataVerificationStep` | `data-verification-step.tsx` | Main page container |
| `DataQualityCheckpoint` | `DataQualityCheckpoint.tsx` | Quality approval UI |
| `CheckpointDialog` | `CheckpointDialog.tsx` | Generic checkpoint modal |
| `PIIDetectionDialog` | `PIIDetectionDialog.tsx` | PII exclusion selection |

---

### Step 4: Data Transformation

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/data-transformation` |
| **Frontend Page** | `client/src/pages/data-transformation-step.tsx` |
| **Primary Component** | `DataTransformationStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/projects/:id/execute-transformations` | `{ joinConfig, transformations, mappings }` | `{ transformedData, transformedSchema }` |
| GET | `/api/projects/:id/transformation-recommendations` | - | AI suggestions |
| POST | `/api/projects/:id/generate-data-requirements` | `{ analysisGoal }` | `{ requirements, mappings }` |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Data Engineer Agent | Transformation design | Transformation Approval |
| Technical AI Agent | Join key detection | - |
| Project Manager Agent | Orchestration | - |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `data_transformer` | Original data + config | Apply transformations | `{ transformedData[] }` |
| `join_detector` | Multiple datasets | Find matching columns | `{ joinKeys[], confidence }` |
| `schema_generator` | Transformed data | Generate new schema | `{ transformedSchema }` |

#### Data Flow

```
User configures transformations + joins
    ↓
POST /api/projects/:id/execute-transformations
    ↓
├── Auto-detect join keys (id, key, code, employee_id, etc.)
├── Execute LEFT JOIN on configured keys
├── Apply column mappings
└── Generate transformed schema
    ↓
DataTransformationService.executeTransformations()
    ↓
UPDATE datasets.ingestionMetadata.transformedData = [...joined rows]
UPDATE datasets.ingestionMetadata.transformedSchema = {...new schema}
    ↓
WebSocket: agent:status → "Transformation complete"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `DataTransformationStep` | `data-transformation-step.tsx` | Main page |
| `DataElementsMappingUI` | `DataElementsMappingUI.tsx` | Column mapping |
| `TransformationPlanDisplay` | `TransformationPlanDisplay.tsx` | Show plan |
| `JoinConfigPanel` | (inline) | Multi-dataset join config |
| `SchemaEditor` | `schema-editor.tsx` | Edit transformed schema |

---

### Step 5: Project Setup

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/project-setup` |
| **Frontend Page** | `client/src/pages/project-setup-step.tsx` |
| **Primary Component** | `ProjectSetupStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| PUT | `/api/projects/:id` | `{ templateId, settings, approach }` | Updated project |
| GET | `/api/projects/:id` | - | Full project details |
| GET | `/api/templates/:templateId` | - | Template details |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Project Manager Agent | Approach confirmation | - |
| Business Agent | Template validation | - |

#### Data Flow

```
User confirms approach + settings
    ↓
PUT /api/projects/:id
    ↓
UPDATE projects (templateId, settings)
UPDATE projects.journeyProgress
    ↓
Ready for planning phase
```

---

### Step 6: Analysis Planning

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/plan` |
| **Frontend Page** | `client/src/pages/plan-step.tsx` |
| **Primary Component** | `PlanStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/projects/:id/plan/create` | `{ analysisGoal, templateId }` | `{ analysisPlan, estimatedCost }` |
| GET | `/api/projects/:id/plan` | - | Current plan |
| POST | `/api/ai/clarification-request` | `{ feedback }` | `{ updatedPlan }` |
| GET | `/api/projects/:id/costs` | - | Cost breakdown |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Project Manager Agent | Plan coordination | Plan Confirmation |
| Technical AI Agent | Analysis design | - |
| Business Agent | Cost estimation | - |
| Data Scientist Agent | ML experiment design | - |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `analysis_planner` | Goals + data | Design analysis steps | `{ steps[], dependencies[] }` |
| `cost_estimator` | Plan + data size | Calculate costs | `{ baseCost, additionalCosts }` |
| `ml_experiment_designer` | Data + goals | Design ML pipeline | `{ models[], features[] }` |

#### Data Flow

```
System generates analysis plan
    ↓
POST /api/projects/:id/plan/create
    ↓
├── PM Agent coordinates specialists
├── Technical AI designs statistical analysis
├── Data Scientist designs ML experiments
└── Business Agent estimates costs
    ↓
INSERT analysisPlans (projectId, steps, estimatedCost)
UPDATE projects.lockedCostEstimate
    ↓
WebSocket: agent:status → "Plan ready for review"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `PlanStep` | `plan-step.tsx` | Main page |
| `AnalysisPlanDisplay` | (inline) | Show generated plan |
| `CostBreakdownCard` | (inline) | Cost details |
| `AgentActivityOverview` | `agent-activity-overview.tsx` | Agent progress |
| `CheckpointDialog` | `CheckpointDialog.tsx` | Plan approval |

---

### Step 7: Execution

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/execute` |
| **Frontend Page** | `client/src/pages/execute-step.tsx` |
| **Primary Component** | `ExecuteStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/analysis-execution/execute` | `{ projectId, analysisTypes }` | `{ executionId, progress }` |
| GET | `/api/analysis-execution/:id/progress` | - | Real-time progress |
| POST | `/api/projects/:id/checkpoints` | `{ type, approval }` | Checkpoint status |
| GET | `/api/projects/:id/checkpoints` | - | All checkpoints |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Technical AI Agent | Statistical analysis | Analysis Checkpoint |
| Data Scientist Agent | ML execution | ML Validation |
| Project Manager Agent | Orchestration | - |
| Data Engineer Agent | Data pipeline | - |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `statistical_analyzer` | Data rows | Descriptive stats, correlations | `{ stats, correlations }` |
| `comprehensive_ml_pipeline` | Data + target | AutoML, model training | `{ model, metrics }` |
| `visualization_engine` | Results | Generate charts | `{ charts[], dashboards[] }` |
| `python_processor` | Script + data | Execute Python analysis | `{ results }` |

#### Data Flow

```
User initiates execution
    ↓
POST /api/analysis-execution/execute
    ↓
AnalysisExecutionService.executeAnalysis()
    ↓
├── Load questions from project_questions (Week 1 fix)
├── Get data via DataAccessor (Week 4 fix: transformed > original)
├── Execute Python scripts (descriptive_stats.py, correlation_analysis.py, etc.)
├── Generate visualizations
└── Compile insights
    ↓
UPDATE projects.analysisResults = { insights, recommendations, visualizations }
INSERT agentExecutions (log of agent activities)
INSERT dsAnalysisResults (detailed results)
    ↓
WebSocket: analysis:progress → real-time updates
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `ExecuteStep` | `execute-step.tsx` | Main page |
| `ExecutionProgressTracker` | `ExecutionProgressTracker.tsx` | Progress bars |
| `AgentCheckpoints` | `agent-checkpoints.tsx` | Approval UI |
| `ResultsPreview` | (inline) | Early results preview |
| `VisualizationWorkshop` | `visualization-workshop.tsx` | Interactive charts |

---

### Step 8: Billing & Payment

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/pricing` |
| **Frontend Page** | `client/src/pages/pricing-step.tsx` |
| **Primary Component** | `PricingStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| POST | `/api/billing/create-invoice` | `{ projectId, costs }` | `{ invoiceId, stripePaymentIntentId }` |
| POST | `/api/payment/confirm` | `{ paymentIntentId }` | `{ success, receiptUrl }` |
| GET | `/api/projects/:id/costs` | - | Cost breakdown |
| POST | `/api/stripe-webhooks` | Stripe event | Webhook handling |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Project Manager Agent | Cost confirmation | Cost Approval |
| Business Agent | Invoice generation | - |

#### Data Flow

```
User reviews costs
    ↓
GET /api/projects/:id/costs
    ↓
├── Display cost breakdown
├── Show lockedCostEstimate vs actual
└── Present payment options
    ↓
POST /api/billing/create-invoice
    ↓
Stripe payment flow
    ↓
POST /api/payment/confirm
    ↓
UPDATE projects (isPaid, paymentIntentId, analysisBilledAt)
UPDATE projects.totalCostIncurred
    ↓
WebSocket: cost:updated → "Payment confirmed"
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `PricingStep` | `pricing-step.tsx` | Main page |
| `BillingCapacityDisplay` | `BillingCapacityDisplay.tsx` | Cost breakdown |
| `StripePaymentForm` | (inline) | Stripe Elements |
| `InvoicePreview` | (inline) | Invoice display |

---

### Step 9: Results & Artifacts

| Aspect | Details |
|--------|---------|
| **Route** | `/journeys/:type/results` |
| **Frontend Page** | `client/src/pages/results-step.tsx` |
| **Primary Component** | `ResultsStep` |

#### API Endpoints

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| GET | `/api/projects/:id/artifacts` | - | All artifacts |
| GET | `/api/projects/:id/artifacts/:id` | - | Single artifact |
| POST | `/api/projects/:id/export/report` | `{ format }` | PDF download |
| GET | `/api/projects/:id/insights` | - | Insights array |
| GET | `/api/projects/:id/visualizations` | - | Charts array |
| GET | `/api/projects/:id/question-answers` | - | Q&A with evidence |

#### Agent Activity

| Agent | Role | Checkpoint |
|-------|------|------------|
| Project Manager Agent | Results compilation | Results Validation |
| Technical AI Agent | Visualization generation | - |
| Business Agent | Audience translation | - |

#### Tools Used

| Tool | Input | Process | Output |
|------|-------|---------|--------|
| `artifact_generator` | Results | Create PDF/PPT/CSV | `{ artifacts[] }` |
| `presentation_generator` | Insights | Build slide deck | `{ pptxBuffer }` |
| `visualization_engine` | Data + config | Final charts | `{ charts[] }` |
| `audience_translator` | Technical results | Simplify content | `{ translatedInsights }` |

#### Data Flow

```
User requests results
    ↓
GET /api/projects/:id/artifacts
GET /api/projects/:id/insights
GET /api/projects/:id/question-answers
    ↓
├── Load analysisResults from project
├── Generate artifacts (PDF, PPT, CSV, JSON)
├── Translate for audience
└── Build dashboard
    ↓
INSERT projectArtifacts (projectId, type, path)
Files stored: uploads/artifacts/{projectId}/
    ↓
Response: { insights, visualizations, artifacts, questionAnswers }
```

#### Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `ResultsStep` | `results-step.tsx` | Main page |
| `UserQuestionAnswers` | `UserQuestionAnswers.tsx` | Q&A display with evidence |
| `DashboardBuilder` | `dashboard-builder.tsx` | Interactive dashboard |
| `VisualizationWorkshop` | `visualization-workshop.tsx` | Chart customization |
| `ArtifactDownload` | (inline) | Download buttons |
| `ProjectArtifactTimeline` | `ProjectArtifactTimeline.tsx` | Artifact history |

---

## 3. Agent Activity Matrix

### Agent-to-Step Mapping

| Step | PM Agent | Tech AI | Business | Data Engineer | Data Scientist |
|------|----------|---------|----------|---------------|----------------|
| 1. Data Upload | Orchestrate | Schema detect | - | Quality check | - |
| 2. Prepare | Clarify | - | Recommend | - | - |
| 3. Verify | Approve | Validate | - | Quality | - |
| 4. Transform | - | Join detect | - | Transform | - |
| 5. Setup | Confirm | - | Template | - | - |
| 6. Plan | Coordinate | Design | Cost est. | - | ML design |
| 7. Execute | Orchestrate | Stats | - | Pipeline | ML execute |
| 8. Pricing | Cost review | - | Invoice | - | - |
| 9. Results | Compile | Visualize | Translate | - | - |

### Agent Responsibilities

| Agent | Primary Responsibilities | Tools Used |
|-------|-------------------------|------------|
| **Project Manager** | Orchestration, clarification, cost approval | `project_coordinator`, `decision_auditor` |
| **Technical AI** | Schema, stats, ML, visualization | `statistical_analyzer`, `visualization_engine`, `schema_generator` |
| **Business** | Templates, recommendations, audience translation | `business_templates`, `audience_translator` |
| **Data Engineer** | Quality, transformations, ETL | `data_transformer`, `data_quality_checker` |
| **Data Scientist** | ML experiments, model validation | `comprehensive_ml_pipeline`, `automl_optimizer` |

---

## 4. Tool Registry

### Tool Categories

| Category | Tools | Used By |
|----------|-------|---------|
| **Data** | `schema_generator`, `data_transformer`, `data_quality_checker` | Tech AI, Data Engineer |
| **Analysis** | `statistical_analyzer`, `comprehensive_ml_pipeline`, `automl_optimizer` | Tech AI, Data Scientist |
| **Visualization** | `visualization_engine`, `enhanced_visualization_engine` | Tech AI |
| **Business** | `business_templates`, `decision_auditor`, `audience_translator` | Business Agent |
| **Coordination** | `project_coordinator` | PM Agent |

### Tool Input/Output Specifications

| Tool | Input Schema | Output Schema |
|------|--------------|---------------|
| `schema_generator` | `{ data: Buffer, filename: string }` | `{ columns: Column[], types: string[] }` |
| `statistical_analyzer` | `{ data: Row[], analyses: string[] }` | `{ stats: Stats, correlations: Matrix }` |
| `data_transformer` | `{ data: Row[], config: TransformConfig }` | `{ transformedData: Row[], schema: Schema }` |
| `comprehensive_ml_pipeline` | `{ data: Row[], target: string, problemType: string }` | `{ model: Model, metrics: Metrics }` |
| `visualization_engine` | `{ data: Row[], chartType: string, config: ChartConfig }` | `{ chartData: ChartData, imageBase64: string }` |

---

## 5. Data Flow Diagrams

### Overall Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER JOURNEY DATA FLOW                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Upload]         [Transform]           [Analyze]            [Results]       │
│     │                 │                     │                    │           │
│     ▼                 ▼                     ▼                    ▼           │
│  ┌──────┐         ┌──────┐             ┌──────┐            ┌──────┐         │
│  │ Raw  │────────▶│Trans-│────────────▶│Python│───────────▶│Arti- │         │
│  │ File │         │formed│             │Scripts│            │facts │         │
│  └──────┘         └──────┘             └──────┘            └──────┘         │
│     │                 │                     │                    │           │
│     ▼                 ▼                     ▼                    ▼           │
│  datasets         datasets.              projects.          projectArtifacts │
│  table           ingestionMetadata.     analysisResults     table            │
│                  transformedData                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Priority Chain (Week 4 Fix)

```
When loading data for analysis:

1. ✓ dataset.ingestionMetadata.transformedData  (PREFERRED - user approved)
2. ✓ dataset.metadata.transformedData           (alternate location)
3. ○ dataset.data                               (original upload)
4. ○ dataset.preview                            (sample data)
5. ○ dataset.sampleData                         (legacy)
6. ○ dataset.records                            (legacy)

Use DataAccessorService for unified access.
```

---

## 6. Frontend Components

### Component Hierarchy by Step

```
App.tsx
└── JourneyWizard.tsx
    ├── Step 1: DataStep
    │   ├── FileUploader
    │   ├── DataPreviewTable
    │   ├── PIIDetectionDialog
    │   └── DataQualityDashboard
    │
    ├── Step 2: PrepareStep
    │   ├── AudienceDefinitionSection
    │   ├── PMAgentClarificationDialog
    │   └── RequiredDataElementsDisplay
    │
    ├── Step 3: DataVerificationStep
    │   ├── DataQualityCheckpoint
    │   └── CheckpointDialog
    │
    ├── Step 4: DataTransformationStep
    │   ├── DataElementsMappingUI
    │   ├── TransformationPlanDisplay
    │   └── SchemaEditor
    │
    ├── Step 5: ProjectSetupStep
    │   └── TemplateSelector
    │
    ├── Step 6: PlanStep
    │   ├── AgentActivityOverview
    │   └── CheckpointDialog
    │
    ├── Step 7: ExecuteStep
    │   ├── ExecutionProgressTracker
    │   ├── AgentCheckpoints
    │   └── VisualizationWorkshop
    │
    ├── Step 8: PricingStep
    │   └── BillingCapacityDisplay
    │
    └── Step 9: ResultsStep
        ├── UserQuestionAnswers
        ├── DashboardBuilder
        ├── VisualizationWorkshop
        └── ProjectArtifactTimeline
```

### Shared Components

| Component | Purpose | Used In Steps |
|-----------|---------|---------------|
| `AgentCheckpoints` | Display/approve checkpoints | 1, 3, 6, 7, 9 |
| `CheckpointDialog` | Modal for checkpoint approval | 3, 6, 7 |
| `AgentActivityOverview` | Show agent progress | 6, 7 |
| `VisualizationWorkshop` | Interactive charting | 7, 9 |
| `WorkflowTransparencyDashboard` | Agent coordination view | All |
| `JourneyLifecycleIndicator` | Progress indicator | All |

---

## 7. API Endpoints

### Complete Endpoint Reference

| Step | Method | Endpoint | Purpose |
|------|--------|----------|---------|
| 1 | POST | `/api/projects/:id/upload` | Upload files |
| 1 | GET | `/api/projects/:id/datasets` | List datasets |
| 1 | POST | `/api/projects/:id/pii-analysis` | Scan for PII |
| 1 | GET | `/api/projects/:id/data-quality` | Quality metrics |
| 2 | POST | `/api/projects/:id/questions` | Save questions |
| 2 | POST | `/api/pm-clarification/request` | PM clarification |
| 2 | GET | `/api/templates` | List templates |
| 3 | PUT | `/api/projects/:id/verify` | Verify data |
| 4 | POST | `/api/projects/:id/execute-transformations` | Apply transformations |
| 4 | GET | `/api/projects/:id/transformation-recommendations` | AI suggestions |
| 5 | PUT | `/api/projects/:id` | Update project |
| 6 | POST | `/api/projects/:id/plan/create` | Generate plan |
| 6 | GET | `/api/projects/:id/costs` | Cost breakdown |
| 7 | POST | `/api/analysis-execution/execute` | Execute analysis |
| 7 | GET | `/api/analysis-execution/:id/progress` | Execution progress |
| 7 | POST/GET | `/api/projects/:id/checkpoints` | Checkpoint management |
| 8 | POST | `/api/billing/create-invoice` | Create invoice |
| 8 | POST | `/api/payment/confirm` | Confirm payment |
| 9 | GET | `/api/projects/:id/artifacts` | List artifacts |
| 9 | POST | `/api/projects/:id/export/report` | Export report |
| 9 | GET | `/api/projects/:id/question-answers` | Q&A with evidence |

---

## 8. Database Tables

### Tables by Journey Phase

| Phase | Tables | Purpose |
|-------|--------|---------|
| **Upload** | `datasets`, `projectDatasets` | Store uploaded data |
| **Prepare** | `projects`, `projectQuestions`, `projectSessions` | User requirements |
| **Verify/Transform** | `datasets.ingestionMetadata` | Transformed data |
| **Plan** | `analysisPlans`, `costEstimates` | Analysis planning |
| **Execute** | `agentExecutions`, `dsAnalysisResults`, `agentCheckpoints` | Execution tracking |
| **Results** | `projectArtifacts`, `insights` | Generated outputs |
| **State** | `journeyExecutionStates`, `projects.journeyProgress` | Journey state |

### Key Table Columns

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `projects` | `journeyProgress`, `analysisResults`, `stepCompletionStatus` | Project state |
| `datasets` | `ingestionMetadata.transformedData`, `schema`, `preview` | Data storage |
| `projectQuestions` | `questionText`, `status`, `questionOrder` | User questions (Week 1) |
| `journeyExecutionStates` | `status`, `completedSteps`, `currentStepId` | Execution state (Week 2) |
| `agentCheckpoints` | `status`, `requiresUserInput`, `userFeedback` | Agent approvals |
| `projectArtifacts` | `type`, `storagePath`, `content` | Generated files |

---

## Summary

This document provides a complete technical mapping of the 9-step user journey, including:

- **Frontend routing and components** for each step
- **API endpoints** with input/output specifications
- **Agent activity** showing which agents are involved at each step
- **Tools used** by agents with their I/O specifications
- **Data flow** through the system
- **Database tables** used at each phase

Use this as a reference for understanding, debugging, or extending the user journey workflow.
