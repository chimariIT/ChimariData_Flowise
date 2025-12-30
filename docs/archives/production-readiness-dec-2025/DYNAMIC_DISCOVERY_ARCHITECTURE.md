# design: Dynamic Discovery Implementation for Agent Framework

## 1. Executive Summary
This design details the technical implementation of the **[Comprehensive Agent Journey Framework](COMPREHENSIVE_AGENT_JOURNEY_FRAMEWORK.md)** using the **Dynamic Tool Discovery** system. 

Instead of hardcoding tool calls, Agents will query the `MCPToolRegistry` based on the **Capabilities** required to fulfill their high-level responsibilities. This decouples the Agent implementation from specific tools, allowing for zero-config extensibility (e.g., swapping `pandas` for `spark` transparently).

## 2. Agent-to-Capability Mapping
We map the *Responsibilities* defined in the Framework to *Semantic Capabilities* used for discovery.

### 2.1 Project Manager Agent (The Orchestrator)
*Role: Team Supervisor & User Interaction Coordinator*

| Framework Responsibility | Capability Query | Logic / Discovery Strategy |
|:---|:---|:---|
| `consolidateRequirements` | `requirements.analyze`, `scope.define` | Find tools to parse user intent into structured JSON. |
| `createAnalysisRoadmap` | `roadmap.create`, `dependency.map` | **Dynamic Selection**: If context is "Exploratory", select `interactive_roadmap_builder`. If "Strict", select `waterfall_planner`. |
| `coordinateCheckpoint` | `orchestration.checkpoint` | Tools that persist state to `checkpoints` table. |

### 2.2 Business Agent (Domain Expert)
*Role: Template Sourcing & Business Logic*

| Framework Responsibility | Capability Query | Primary Tools (Dynamic) |
|:---|:---|:---|
| **`sourceTemplates`** | `template.search`, `research.online` | **`template_library_search`**, **`web_search`** |
| `extractBusinessInsights`| `insight.extract`, `analysis.interpret`| **`business_insight_generator`**, `llm_interpreter` |
| `validateBusinessAlignment`| `validation.business`, `rules.check` | `custom_rule_engine` |

* **Research Flow**: 
    1. Agent calls `findToolsByCapability('template.search')`. 
    2. Registry returns `['system_templates', 'community_templates']`.
    3. Agent queries both and aggregates results.

### 2.3 Data Scientist Agent (Technical Analysis)
*Role: Statistical Analysis & ML*

| Framework Responsibility | Capability Query | Primary Tools (Dynamic) |
|:---|:---|:---|
| `executeAnalysis` | `analysis.statistical`, `ml.train` | **`statistical_analyzer`**, **`comprehensive_ml_pipeline`**, **`spark_ml_pipeline`** |
| `generateTechnicalArtifacts`| `artifact.generate`, `visualization.create` | `artifact_generator`, `plotly_generator` |
| `defineRequiredSchema` | `schema.define` | `schema_inference_engine` |

* **ML Pipeline Selection**:
    *   **Input**: 500k rows, Goal: "Churn Prediction"
    *   **Logic**: 
        *   Query `ml.train` -> Returns `[comprehensive_ml_pipeline, spark_ml_pipeline]`
        *   Check Metadata: `spark` has `scalability: 'high'`. `comprehensive` has `scalability: 'medium'`.
        *   **Decision**: Select `spark_ml_pipeline` due to data volume.

### 2.4 Data Engineer Agent (Data Pipeline)
*Role: Data Quality & Transformation*

| Framework Responsibility | Capability Query | Primary Tools (Dynamic) |
|:---|:---|:---|
| `detectAndHandlePII` | `pii.detect`, `pii.mask` | **`scan_pii_columns`**, **`advance_pii_shield`** (future) |
| `validateDataQuality` | `data.quality`, `validation.schema` | **`data_quality_checker`**, `schema_validator` |
| `transformData` | `data.transform`, `data.clean` | `intelligent_transformer`, `dedup_dataset` |

### 2.5 Billing Agent (Financial Gatekeeper)
*Role: Cost Estimation & Quota Management*

* **Architecture Change**: The Billing Agent does not just "have tools". It acts as a **Middleware** in the Discovery process.

* **Interception Logic**:
    1. PM Agent asks for `ml.train` tool.
    2. Registry finds `comprehensive_ml_pipeline`.
    3. **Billing Middleware**:
        *   Checks `tool.costModel` metadata.
        *   Calculates `estimated_cost = rows * cost_per_row`.
        *   Checks `user.subscription.credits`.
    4. If `credits < estimated_cost`, Registry throws `InsufficientCreditsError` OR returns `low_cost_alternative` (e.g., `linear_regression_simple`).

## 3. Advanced Implementation Flows

### 3.1 Research & Template Sourcing (Phase 0)
The framework defines a "Multi-Source Template System". Here is the dynamic implementation:

```typescript
async function sourceTemplates(intent: string) {
    // 1. Discovery
    const sources = registry.findToolsByCapability("template.source");
    // Returns: [SystemLibrary, UserUploads, WebResearch]
    
    // 2. Parallel Execution
    const results = await Promise.all(sources.map(source => 
        registry.execute(source.name, { intent })
    ));
    
    // 3. Aggregation (Business Agent Logic)
    return mergeAndRank(results);
}
```

### 3.2 Advanced ML & Analyzing (Phase 3)
The framework mentions "Advanced Pipeline".

1.  **Intent**: "Train a model to predict churn".
2.  **Discovery**:
    *   `automl.train` (Capability)
    *   `model.explain` (Capability for interpretability)
3.  **Selection**: `comprehensive_ml_pipeline` (matches both).
4.  **Execution**: Tool runs generic AutoML steps (Imputation -> Feature Selection -> Model Search -> Hyperparameter Tuning) automatically.

### 3.3 Data Quality & Governance (Phase 1)
1.  **Upload**: User uploads CSV.
2.  **Trigger**: `data.uploaded` event.
3.  **Auto-Discovery**:
    *   Find all tools with trigger `on_data_upload`.
    *   Found: `scan_pii_columns`, `assess_data_quality`.
4.  **Chain**: Execute `quality` -> If Pass -> Execute `pii` -> If Clean -> Ready.

## 4. Integration with User Journey
This design maps directly to the `USER_JOURNEY_TECHNICAL_FLOW.md` steps:

*   **Step 1 (Data)**: Uses DE Agent + `data.quality` tools.
*   **Step 2 (Prepare)**: Uses Business Agent + `template.search` tools.
*   **Step 6 (Plan)**: Uses PM Agent + `roadmap.create` tools.
*   **Step 7 (Execute)**: Uses DS Agent + `analysis.statistical`/`ml.train` tools.
*   **Step 8 (Pricing)**: Uses Billing Agent Middleware.

## 5. Conclusion
This implementation strategy respects the high-level architecture of the **Comprehensive Agent Journey Framework** while providing the low-level mechanical flexibility of **Dynamic Tool Discovery**. It allows us to add new capabilities (like "Advanced Deep Learning") simply by registering a new tool with the `ml.deep_learning` capability, without rewriting Agent logic.
