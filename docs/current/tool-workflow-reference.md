# Tool & Workflow Reference

_Last reviewed: 2025-11-07_

This document traces how user intent flows through agents, tools, and services across the ChimariData platform. It enumerates tool inputs/outputs, highlights orchestration touchpoints, and identifies gaps to close before production sign-off.

<!-- TODO: Cross-link each stage to the relevant readiness checklist once the documentation index lands. -->

---

## Executive Overview

1. **Problem definition** – users create or resume a project (`POST /api/projects`), the project manager agent resolves journey templates, and the journey state manager seeds canonical steps.
2. **Data intake** – uploads hit `POST /api/projects/upload`, invoking `FileProcessor.processFile` for schema detection, `PIIAnalyzer` for risk checks, and dataset persistence via `storage.createDataset`.
3. **Transformation** – `IntelligentDataTransformer` and companion MCP tools apply cleansing, joins, aggregations, and format conversions, writing results back to project/dataset records.
4. **Analysis** – statistical and ML tools are executed through the MCP registry (`statistical_analyzer`, `ml_pipeline`, `comprehensive_ml_pipeline`) or via the plan-gated analysis execution service and Python bridge (`python_scripts/data_analyzer.py`).
5. **Visualization & narration** – visualization engines (`visualization_engine`, `plotly_generator`, etc.) plus business narrative tools (`business_templates`, `content_synthesizer`) produce audience-ready views.
6. **Artifact delivery** – artifacts are catalogued via `storage.createArtifact`, surfaced in the UI, and shaped to the communication style declared by journey templates.

Redis-backed agent messaging, project sessions, and the decision auditor keep orchestration auditable across steps.

<!-- TODO: Embed updated system diagram here once the Unified Architecture graphic is refreshed. -->

### November 2025 Narrative Enhancements

- Journey swimlane diagrams for Project Manager, Data Engineer, and Data Scientist roles are in draft. Publish the final version alongside this doc and link it from the dashboard transparency component once approved.
- Add cross-references to the readiness checklist (`docs/current/PRODUCTION-READINESS.md`) so reviewers can jump from each workflow stage to its acceptance criteria.
- Capture the artifact lifecycle (creation → approval → delivery) as a dedicated appendix to help onboarding teams reason about approvals.

---

## MCP Tool Registry Snapshot

The MCP registry (`server/services/mcp-tool-registry.ts`) currently exposes 90 named tools. The tables below group the most critical ones by stage, including their primary inputs/outputs and real handler.

<!-- TODO: Re-audit lesser used ingestion entries (e.g., S3/SharePoint connectors) before publishing the next registry snapshot. -->

### Data Ingestion

| Tool | Handler / Service | Primary Input | Output / Side Effect |
| --- | --- | --- | --- |
| `file_processor` | `FileProcessor` | `File` buffer + upload metadata | Parsed rows, inferred schema, quality metrics, relationships |
| `csv_file_ingestion`, `excel_file_ingestion`, `json_file_ingestion` | `ComprehensiveDataIngestion` | Raw buffers (CSV/XLSX/JSON) | Normalized rows, schema, record count persisted to `datasets` |
| `pdf_file_ingestion`, `image_ocr_extraction` | `ComprehensiveDataIngestion` + OCR | Binary buffer | Extracted text tables, metadata |
| `api_data_ingestion`, `postgresql_ingestion`, `graphql_api_ingestion`, etc. | `ComprehensiveDataIngestion` | Connection config, query descriptor | Rows streamed to dataset + ingestion metadata |

### Data Transformation

| Tool | Handler | Inputs | Outputs |
| --- | --- | --- | --- |
| `data_transformer`, `intelligent_data_transform` | `IntelligentDataTransformer` | Operation descriptor (join, filter, aggregation), dataset refs | Cleaned/transformed dataset snapshot + performance metadata |
| `format_conversion` | `IntelligentDataTransformer` | Source format, data array | Target format buffer (CSV/Parquet/etc.) |
| `data_pipeline_builder`, `batch_processor` | `DataPipelineBuilder` / `BatchProcessor` | Pipeline graph, scheduling info | Persisted pipeline definition, queued execution tasks |
| `data_quality_monitor` | `DataQualityMonitor` | Dataset id, rule set | Quality metrics, anomaly log artifacts |

### Analysis & Modeling

| Tool | Handler | Inputs | Outputs |
| --- | --- | --- | --- |
| `statistical_analyzer` | `StatisticalAnalyzerHandler` → `AdvancedAnalyzer` (Python via `enhanced-python-processor`) | Array of records + analysis config | Statistical tests, ANOVA/ANCOVA results, effect sizes, library provenance |
| `ml_pipeline`, `comprehensive_ml_pipeline`, `automl_optimizer` | `ComprehensiveMLService` | Dataset refs, feature/target spec | Model metrics, feature importances, AutoML selections |
| `llm_fine_tuning`, `llm_method_recommendation` | `LLMFineTuningService` | Dataset summary, resource budget | Fine-tuning plan, GPU allocation guidance |
| `analysis_execution` (route) | `AnalysisExecutionService` + `data_analyzer.py` | Project id, approved plan, dataset ids | Insights, recommendations, visualizations saved to DB artifacts |

### Visualization & Business Narrative

| Tool | Handler | Inputs | Outputs |
| --- | --- | --- | --- |
| `visualization_engine` | `VisualizationAPIService` | Chart spec, dataset | Rendered chart payload (JSON/PNG) |
| `plotly_generator`, `matplotlib_generator`, `seaborn_generator`, `d3_generator` | `EnhancedVisualizationEngine` | Visualization requirements | Library-specific artifact (interactive config, static asset) |
| `business_templates` | `BusinessTemplates` | Industry context, findings | Executive-ready narrative templates, summaries |
| `content_synthesizer`, `trend_analyzer` | `ContentSynthesizer`, `TrendAnalyzer` | Research summaries, trend data | Synthesized text, forecasts, bullet briefs |
| `progress_reporter` | `ProgressReporter` | Project state | Stakeholder status report payload |

### Governance & Support

| Tool | Handler | Inputs | Outputs |
| --- | --- | --- | --- |
| `decision_auditor` | `DecisionAuditor` | Agent decisions, rationale | Immutable audit entries linked to project |
| `agent_communication`, `task_coordinator` | `AgentMessageBroker`, `TaskCoordinator` | Message payloads, task definitions | Published events, assigned tasks |
| `platform_knowledge_base`, `feature_explainer` | Support services | User query | Knowledge base answer, guided walkthrough |

> **Gap:** No registered MCP tool currently packages visualizations and narrative into a presentation-ready output (e.g. PowerPoint or slide deck). See [Gap Analysis](#gap-analysis--missing-tools).

---

## Tool Execution Stack

1. **Registration:** Core tools are registered at startup via `registerCoreTools()`. Additional suites (data transformation, business logic, etc.) register through `ToolInitializationService.initializeAllTools()`.
2. **Permission + routing:** Agents call `executeTool(toolName, agentId, input, context)` which validates access, retrieves tool metadata, and forwards to the associated handler (`service` field). Agent-role restrictions (e.g., only `project_manager` using `pm_coordination`) are enforced here.
3. **Handler execution:** Real handlers (e.g., `StatisticalAnalyzerHandler` in `server/services/real-tool-handlers.ts`) prepare inputs, optionally invoke Python via `PythonProcessor`, and package `ToolExecutionResult` (status, result payload, metrics, artifacts).
4. **Artifact persistence:** Long-lived outputs are cached as project artifacts through `storage.createArtifact`, enabling resume/replay and UI retrieval.

<!-- TODO: Capture retry/backoff policies for handlers once the orchestration RFC is finalized. -->

---

## End-to-End Workflow Trace

### 1. Problem Definition & Journey Setup

- **Endpoints & state:** `POST /api/projects` (new) and `GET /api/projects/:id` (resume) rely on `ensureAuthenticated`, `billingService.canAccessJourney`, and `journeyStateManager.initializeJourney`.
- **Agents & tools:** The project manager agent (`ProjectManagerAgent`) orchestrates template resolution (`JourneyTemplateService`), locks plan generation, and coordinates follow-up through the agent message broker. Tools involved include `project_coordinator`, `agent_communication`, `risk_assessor`, and `decision_auditor`.
- **Output:** Project records include `journeyProgress` (current step, completed steps, estimated remaining time) and, when applicable, an active `analysisPlan`. The UI uses `JourneyLifecycleIndicator` to expose this state.

<!-- TODO: Append a step-by-step swimlane for PM/Data Engineer/Data Scientist once the workflow transparency dashboard stabilizes. -->

### 2. Data Intake

- **Upload flow:** `POST /api/projects/upload` writes to disk, calculates checksum, runs `FileProcessor.processFile`, and checks PII via `PIIAnalyzer`. User consent is requested when PII is detected (temporary storage keyed in `tempStore`).
- **Persistence:** `storage.createProject` stores inline metadata; `storage.createDataset` persists full dataset rows, schema, preview, and file info. Datasets are linked to projects through `storage.linkProjectToDataset`.
- **Instrumentation:** Journey state is updated to the data step; billing hooks capture data volume; decision audit logs the upload event.

### 3. Data Preparation & Transformation

- **Tooling:** `schema_generator`, `data_transformer`, `intelligent_data_transform`, `data_quality_monitor`, and pipeline tools are invoked by the data engineer agent or technical agent, coordinated via MCP.
- **Storage:** Transformation outputs are written back to project fields (`transformedData`, `dataQualityReport`) or stored as new dataset versions (`storage.createDatasetVersion`). Artifacts such as `data_quality_report` are recorded using `storage.createArtifact`.
- **Resilience:** `analysisPlans` enforce that transformations completing prerequisite steps (e.g., data verification) before the plan moves forward.

### 4. Analysis Execution

- **Plan gating:** `AnalysisExecutionService.executeAnalysis` verifies an approved plan, no prior execution, and user ownership before proceeding.
- **Python bridge:** Data snapshots are written to temp files referenced by `python_scripts/data_analyzer.py`. The script returns JSON (descriptive stats, correlations, regression, ML metrics, row/column counts) parsed by `parseInsights`.
- **Outputs:** Insights, recommendations, visualization descriptors, execution metrics, and technique provenance are bundled in `AnalysisResults` and stored in the project row plus artifacts table.
- **Agent coordination:** `dataEngineerAgent.estimateDataRequirements` and `dataScientistAgent.recommendAnalysisConfig` publish `data:requirements_estimated` and `analysis:recommended` events via the message broker, keeping the PM agent and UI dashboards synchronized.

### 5. Visualization & Narrative Packaging

- **Visualization stack:** `visualization_engine` and enhanced generators produce interactive or static charts. Spark-specific tools (`spark_visualization_engine`) handle large data scenarios.
- **Narrative tools:** `business_templates`, `content_synthesizer`, and `progress_reporter` tailor messaging to the audience defined in the journey template (plain-language, executive, technical).
- **UI integration:** Workflow transparency components call `/api/agents/activities/:projectId` to reflect agent progress in real time; `JourneyLifecycleIndicator` surfaces resumable steps.

### 6. Artifact Delivery & Approval

- **Artifacts:** Journey steps specify expected artifacts (e.g., `executive_summary`, `analysis_summary`, `kpi_dashboard`). `storage.createArtifact` stores metadata, file paths (if exported), and dependencies.
- **Checkpoints:** `checkpoint_manager` and `decision_auditor` track approvals. Journey completion sets `percentComplete` to 100 and unlocks final deliverable access.
- **Audience dispatch:** FE components choose which artifacts to display based on journey type (e.g., executive summaries for non-tech users, model diagnostics for technical journeys).

---

## Audience-Specific Artifacts

Derived from `shared/journey-templates.ts` and journey mappings:

| Journey Type | Primary Audience | Communication Style | Expected Artifacts |
| --- | --- | --- | --- |
| `ai_guided` → non-tech | Non-technical stakeholders | Plain language | `executive_summary`, `insight_brief`, `visualizations`, `trend_highlights` |
| `template_based` → business | Business executives | Executive tone | `context_brief`, `data_quality_report`, `kpi_dashboard`, `recommendation_brief` |
| `self_service` → technical | Analysts / data scientists | Technical | `schema_report`, `data_quality_report`, `analysis_summary`, `model_diagnostics`, `ml_artifacts` |
| `consultation` | Mixed / advisory | Consultation | `consultation_brief`, `expert_panel_notes`, `decision_log`, custom attachments |
| `custom` | Configurable | Depends on selected capabilities | Determined by capability metadata (`getCustomJourneyToolExecutions`) |

Each template step declares its agent, required tools, and artifacts, ensuring the platform knows what to generate before marking a step complete.

<!-- TODO: Link each artifact slug to the artifact catalog once that doc lands in `/docs/current`. -->

---

## Gap Analysis & Missing Tools

1. **Presentation packaging:** No registered tool produces a slide deck or presentation-ready bundle. Consider a `presentation_generator` MCP tool that stitches visualizations, executive summaries, and recommendations into PDF/PPT artifacts per audience. <!-- TODO: Reconcile with the proposed `presentation_publisher` export service before locking scope. -->
2. **Artifact export consistency:** Some analysis outputs (e.g., ML model binaries, visualization assets) are returned inline but not persisted as downloadable files. Confirm `storage.createArtifact` usage for all tool handlers that return binary outputs.
3. **Tool metadata hygiene:** Several registry entries include example names (e.g., `"Generate schema from CSV"`) matching the extraction pattern—these should be filtered out or renamed to avoid surfacing pseudo-tools in documentation and UI catalogs.
4. **Traceability:** Ensure each tool execution writes clear provenance (input version, journey step, agent) to facilitate audit trails, especially before enforcing billing.

---

## Open Follow-Ups

- Verify Redis-backed message broker in production (fallback logs indicate in-memory mode when Redis is disabled).
- Confirm python dependencies (`scikit-learn`, etc.) are installed in deployment environments to avoid `SKLEARN_AVAILABLE` false paths.
- Document environment variables for admin setup (`ALLOW_ADMIN_SETUP`, `ADMIN_SETUP_ALLOWED_IPS`) alongside authentication hardening once implemented.

<!-- TODO: Assign owners/due dates for the follow-ups in the platform readiness tracker and reference that board here. -->

---

**Outcome:** This reference should serve as the single source of truth when adding tools, debugging workflows, or validating end-to-end readiness. Update it whenever new tools/components are onboarded.

