# design: Agentic Orchestration with Dynamic Tool Discovery

**Last Updated**: February 13, 2026

> **Audit Note (Feb 2026):** Added `[IMPLEMENTED]`, `[PARTIAL]`, `[NOT IMPLEMENTED]` markers to each section. Key findings: tool discovery is keyword-based (not semantic), Research Agent tools are registered but not routed in `executeTool()`, and Spark tools are planned but not implemented.

## 1. Overview
This design clarifies how the **Project Manager Agent** and **Research Agent** orchestrate user journeys by dynamically discovering tools based on capabilities, rather than hardcoded references.

**Implementation Status**: `[PARTIAL]` — PM orchestration works, but tool discovery is keyword-matching via `findToolsByCapability()` (not semantic/intent-based). Research Agent is initialized but its tools are not routed.

## 2. Dynamic Orchestration Flow `[PARTIAL]`
The orchestration now begins with a **Research** or **Template** selection phase to define the required steps before execution.

> **Status**: The PM delegation flow works for DS and DE agents. Research Agent delegation is designed but **not wired** — RA tools return `TOOL_NOT_IMPLEMENTED`. Template search works via `template_library_search` tool.

```mermaid
sequenceDiagram
    participant User
    participant PM as Project Manager
    participant RA as Research Agent
    participant Registry as MCP Registry
    participant DE as Data Engineer
    participant DS as Data Scientist

    User->>PM: "Analyze user churn"
    
    rect rgb(230, 240, 255)
    note right of PM: Phase 0: Research & Planning
    PM->>RA: Delegate: Define Approach
    RA->>Registry: findToolsByCapability("template.search")
    Registry-->>RA: ["template_library", "web_search"]
    RA->>RA: Select "churn_analysis_template" OR Generate Custom Plan
    RA-->>PM: Returns Analysis Plan + Required Data Elements
    end

    PM->>DE: Delegate: Prepare Data (based on RA Plan)
    DE->>Registry: execute("scan_pii_columns")
    
    PM->>DS: Delegate: Execute Analysis
    DS->>Registry: findToolsByCapability("ml.train")
    Registry-->>DS: ["comprehensive_ml_pipeline", "spark_ml_pipeline"]
    DS->>DS: Select Tool (based on data size)
    ```

## 3. Journey Steps & Tool Mapping
The following table maps user journey steps to semantic capabilities, including **Research**, **Templates**, and **Advanced Analytics**.

### Phase 0: Research & Planning `[PARTIAL]`
*The Research Agent defines WHAT to do before we determine HOW to do it.*

| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) | Status |
|:---|:---|:---|:---|:---|
| "I want to analyze X" | `research_topic` | `research.market`, `topic.explore` | `web_search` (if ext), `knowledge_base` | `[NOT IMPLEMENTED]` — RA tools not routed |
| "Use a Template" | `find_template` | `template.search`, `journey.template` | **`template_library_search`** | `[IMPLEMENTED]` |
| "Requirements" | `define_requirements` | `requirements.generate`, `goal.analysis` | `generate_required_elements` | `[IMPLEMENTED]` |

### Phase 1: Data Upload & Governance `[IMPLEMENTED]`
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) | Status |
|:---|:---|:---|:---|:---|
| Upload CSV | `assess_data_quality` | `data.process`, `schema.generate` | `file_processor`, `schema_generator` | `[IMPLEMENTED]` |
| PII Check | `scan_pii_request` | `pii.detect`, `security.audit` | `scan_pii_columns` | `[IMPLEMENTED]` |
| "Check Quality" | `data_quality_check` | `data.quality`, `quality.report` | `file_processor`, `comprehensive_analysis` | `[IMPLEMENTED]` |

### Phase 2: Data Transformation `[IMPLEMENTED]`
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) | Status |
|:---|:---|:---|:---|:---|
| "Fix format" | `data_cleaning` | `data.clean`, `data.standardize` | `intelligent_transformer` | `[IMPLEMENTED]` |
| "Map to Columns" | `map_dataset` | `requirements.map`, `schema.map` | `map_dataset_to_requirements` | `[IMPLEMENTED]` |
| "Join Datasets" | `join_datasets` | `data.join`, `dataset.merge` | `dataset_join` | `[IMPLEMENTED]` |

### Phase 3: Analysis Execution & ML `[PARTIAL]`
*Includes Data Science and Advanced ML capabilities.*

| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) | Status |
|:---|:---|:---|:---|:---|
| **"Estimate Cost"** | `estimate_job_cost` | `billing.estimate`, `cost.model` | `estimate_analysis_cost` | `[IMPLEMENTED]` |
| "Stats Overview" | `statistical_analysis` | `analysis.statistical` | `statistical_analyzer` / `spark_statistical_analyzer` | `[IMPLEMENTED]` / `[NOT IMPLEMENTED]` (Spark) |
| **"Train Model"** | **`train_ml_model`** | **`ml.train`, `automl.optimize`** | **`comprehensive_ml_pipeline`** / **`spark_ml_pipeline`** | `[IMPLEMENTED]` / `[NOT IMPLEMENTED]` (Spark) |
| "Explain Model" | `explain_model` | `ml.explain`, `model.interpret` | `comprehensive_ml_pipeline` | `[IMPLEMENTED]` |
| "Fine-Tune LLM" | `tune_llm` | `llm.fine_tune`, `lora` | `llm_fine_tuning` | `[NOT IMPLEMENTED]` — Stub |

### Phase 4: Results & Artifacts `[IMPLEMENTED]`
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) | Status |
|:---|:---|:---|:---|:---|
| "Answer Qs" | `question_answer` | `question.answer`, `evidence.chain` | `question_answer_generator` | `[IMPLEMENTED]` |
| "Interactive Chart"| `visualization` | `visualization.interactive` | **`plotly_generator`**, `enhanced_visualization_engine` | `[IMPLEMENTED]` |
| "Generate Report" | `generate_artifact` | `artifact.generate`, `report.create` | `artifact_generator` | `[IMPLEMENTED]` |

## 4. Enhanced Discovery Logic `[PARTIAL]`
The Project Manager uses a tiered logic:

1.  **Research First**: If the request is vague ("Analyze sales"), delegate to **Research Agent** first to define specific intents (`analysis.statistical`, `ml.train`). `[NOT IMPLEMENTED]` — Research Agent tools not routed in executeTool().
2.  **Capability Matching**: Match defined intents to capabilities. `[IMPLEMENTED]` — But keyword-based, not semantic. Uses `findToolsByCapability()` which does substring matching on tool capability tags.
3.  **Context Filtering**: `[PARTIAL]`
    *   **Complexity**: `ml.train` requests triggering `comprehensive_ml_pipeline` (High Complexity) check User Tier & Credits. `[IMPLEMENTED]`
    *   **Data Scale**: >100k rows forces `spark_*` tools. `[NOT IMPLEMENTED]` — All 6 Spark tools are registered but return `TOOL_NOT_IMPLEMENTED`.
    *   **Domain**: "Marketing" requests prioritize tools with `marketing_templates` capability. `[PARTIAL]` — Basic tag matching works but no semantic understanding.

## 5. Benefits
*   **Structured Freedom**: Users can start with a **Template** (defined by Research Agent) or explore freely.
*   **Advanced Ready**: The architecture seamlessly upgrades from basic stats to **AutoML** and **LLM Fine-Tuning** just by switching the selected tool based on user intent.
*   **Cost Aware**: Expensive ML operations are gated by `estimate_job_cost` and user confirmation.

## 6. Current Limitations (Feb 2026)

### Tool Routing Gap
Of 130+ registered tools, only ~65 (50%) are fully routed in `executeTool()`. The remaining return `TOOL_NOT_IMPLEMENTED` with an error status. See [MCP_TOOL_STATUS.md](MCP_TOOL_STATUS.md) for the complete matrix.

### Discovery is Keyword-Based
`findToolsByCapability()` uses substring matching on tool tags, not semantic/intent-based discovery. A query for "predict customer churn" won't find `comprehensive_ml_pipeline` unless it has "churn" in its tags.

### Research Agent Not Wired
The Template Research Agent is initialized but its 7 tools are all stubs. Research delegation from PM to RA will silently fail.

### Customer Support Agent Not Wired
The Customer Support Agent is initialized but never invoked in any workflow. It should handle error recovery, billing queries, and FAQ responses.

### Spark Tools Not Implemented
All 6 Spark tools (`spark_statistical_analyzer`, `spark_ml_pipeline`, `spark_data_processor`, `spark_feature_engineering`, `spark_streaming_processor`, `spark_graph_analytics`) are registered as PLANNED but not implemented.

### Agent Activity Messages Hardcoded
Status messages sent via WebSocket during agent execution use static strings (e.g., "Analyzing data...") instead of dynamic messages reflecting actual agent activity. See `agents.ts:59-70` and `agent-coordination-service.ts:325-532`.

### Business Definition Gap
Business definitions are loaded during transformation (`project.ts:7525-7545`) and logged (`7647-7665`), but the transformation switch does not consume `calculationType`, `componentFields`, or `validRange` from business definitions.
