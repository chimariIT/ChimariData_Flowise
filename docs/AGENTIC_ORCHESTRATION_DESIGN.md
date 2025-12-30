# design: Agentic Orchestration with Dynamic Tool Discovery

## 1. Overview
This design clarifies how the **Project Manager Agent** and **Research Agent** orchestrate user journeys by dynamically discovering tools based on capabilities, rather than hardcoded references.

## 2. Dynamic Orchestration Flow
The orchestration now begins with a **Research** or **Template** selection phase to define the required steps before execution.

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
The following table maps user journey steps to sematic capabilities, including **Research**, **Templates**, and **Advanced Analytics**.

### Phase 0: Research & Planning (New)
*The Research Agent defines WHAT to do before we determine HOW to do it.*

| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) |
|:---|:---|:---|:---|
| "I want to analyze X" | `research_topic` | `research.market`, `topic.explore` | `web_search` (if ext), `knowledge_base` |
| "Use a Template" | `find_template` | `template.search`, `journey.template` | **`template_library_search`** |
| "Requirements" | `define_requirements` | `requirements.generate`, `goal.analysis` | `generate_required_elements` |

### Phase 1: Data Upload & Governance
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) |
|:---|:---|:---|:---|
| Upload CSV | `assess_data_quality` | `data.process`, `schema.generate` | `file_processor`, `schema_generator` |
| PII Check | `scan_pii_request` | `pii.detect`, `security.audit` | `scan_pii_columns` |
| "Check Quality" | `data_quality_check` | `data.quality`, `quality.report` | `file_processor`, `comprehensive_analysis` |

### Phase 2: Data Transformation
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) |
|:---|:---|:---|:---|
| "Fix format" | `data_cleaning` | `data.clean`, `data.standardize` | `intelligent_transformer` |
| "Map to Columns" | `map_dataset` | `requirements.map`, `schema.map` | `map_dataset_to_requirements` |
| "Join Datasets" | `join_datasets` | `data.join`, `dataset.merge` | `dataset_join` |

### Phase 3: Analysis Execution & ML (Expanded)
*Includes Data Science and Advanced ML capabilities.*

| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) |
|:---|:---|:---|:---|
| **"Estimate Cost"** | `estimate_job_cost` | `billing.estimate`, `cost.model` | `estimate_analysis_cost` |
| "Stats Overview" | `statistical_analysis` | `analysis.statistical` | `statistical_analyzer` / `spark_statistical_analyzer` |
| **"Train Model"** | **`train_ml_model`** | **`ml.train`, `automl.optimize`** | **`comprehensive_ml_pipeline`** (AutoML) or **`spark_ml_pipeline`** |
| "Explain Model" | `explain_model` | `ml.explain`, `model.interpret` | `comprehensive_ml_pipeline` |
| "Fine-Tune LLM" | `tune_llm` | `llm.fine_tune`, `lora` | `llm_fine_tuning` |

### Phase 4: Results & Artifacts
| User Action | Intent / Step Name | Capability Query | Selected Tool (Dynamic) |
|:---|:---|:---|:---|
| "Answer Qs" | `question_answer` | `question.answer`, `evidence.chain` | `question_answer_generator` |
| "Interactive Chart"| `visualization` | `visualization.interactive` | **`plotly_generator`**, `enhanced_visualization_engine` |
| "Generate Report" | `generate_artifact` | `artifact.generate`, `report.create` | `artifact_generator` |

## 4. Enhanced Discovery Logic
The Project Manager uses a sophisticated tiered logic:

1.  **Research First**: If the request is vague ("Analyze sales"), delegate to **Research Agent** first to define specific intents (`analysis.statistical`, `ml.train`).
2.  **Capability Matching**: Match defined intents to capabilities.
3.  **Context Filtering**:
    *   **Complexity**: `ml.train` requests triggering `comprehensive_ml_pipeline` (High Complexity) check User Tier & Credits.
    *   **Data Scale**: >100k rows forces `spark_*` tools.
    *   **Domain**: "Marketing" requests prioritize tools with `marketing_templates` capability.

## 5. Benefits
*   **Structured Freedom**: Users can start with a **Template** (defined by Research Agent) or explore freely.
*   **Advanced Ready**: The architecture seamlessly upgrades from basic stats to **AutoML** and **LLM Fine-Tuning** just by switching the selected tool based on user intent.
*   **Cost Aware**: Expensive ML operations are gated by `estimate_job_cost` and user confirmation.
