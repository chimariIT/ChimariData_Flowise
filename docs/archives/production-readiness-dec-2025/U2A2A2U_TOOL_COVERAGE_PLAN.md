# U2A2A2U Tool Coverage Implementation Plan

**Created:** December 16, 2025
**Status:** PLANNING
**Purpose:** Ensure every user journey step has complete tool coverage for agent and fallback modes

---

## 1. Executive Summary

### Documents Reviewed
1. **DYNAMIC_DISCOVERY_ARCHITECTURE.md** - Gemini's dynamic tool discovery design
2. **AGENTIC_ORCHESTRATION_DESIGN.md** - Agent orchestration flow with capability queries
3. **COMPREHENSIVE_AGENT_JOURNEY_FRAMEWORK.md** - End-to-end framework with checkpoints
4. **USER_JOURNEY_TECHNICAL_FLOW.md** - 9-step technical mapping
5. **VECTOR_DATA_PIPELINE_DESIGN.md** - Semantic pipeline for question→transformation linkage
6. **TOOL_ONBOARDING.md** - Tool registration guidelines

### Key Design Principles from Gemini

1. **Dynamic Discovery**: Agents query `MCPToolRegistry.findToolsByCapability()` instead of hardcoding tool names
2. **Capability-Based**: Tools are tagged with semantic capabilities (e.g., `analysis.statistical`, `pii.detect`)
3. **Billing Middleware**: Cost checking integrated into tool selection
4. **Research-First**: Research Agent defines WHAT before execution determines HOW
5. **Context-Aware Selection**: Tool selection based on data size, complexity, user tier

---

## 2. Current Implementation Status

### 2.1 Tools with REAL Implementations (13 tools)

| Tool | File Location | Handler |
|------|---------------|---------|
| `statistical_analyzer` | mcp-tool-registry.ts:2146 | ✅ Delegates to data-scientist-agent |
| `ml_pipeline` | mcp-tool-registry.ts:2150 | ✅ Basic ML |
| `comprehensive_ml_pipeline` | mcp-tool-registry.ts:2155 | ✅ AutoML |
| `visualization_engine` | mcp-tool-registry.ts:2188 | ✅ Chart generation |
| `scan_pii_columns` | mcp-tool-registry.ts:2390 | ✅ PII detection |
| `apply_pii_exclusions` | mcp-tool-registry.ts:2409 | ✅ PII filtering |
| `comprehensive_analysis` | mcp-tool-registry.ts:2419 | ✅ Full analysis pipeline |
| `audience_formatter` | mcp-tool-registry.ts:2454 | ✅ Translates for audience |
| `question_answer_generator` | mcp-tool-registry.ts:2487 | ✅ Q&A generation |
| `artifact_generator` | mcp-tool-registry.ts:2523 | ✅ PDF/PPT/CSV export |
| `assess_data_quality` | mcp-tool-registry.ts:2565 | ✅ Quality scoring (Day 1 fix) |
| `generate_plan_blueprint` | mcp-tool-registry.ts:2652 | ✅ Plan generation (Day 1 fix) |

### 2.2 Tools with PLACEHOLDER Implementations (Need Real Implementation)

#### Agent Coordination Tools (6 tools)
```
agent_communication      → Placeholder (line 2258)
workflow_evaluator       → Placeholder (line 2261)
task_coordinator         → Placeholder (line 2264)
checkpoint_manager       → Placeholder (line 2267)
progress_reporter        → Placeholder (line 2270)
resource_allocator       → Placeholder (line 2273)
```

#### Customer Support Tools (6 tools)
```
platform_knowledge_base  → Placeholder (line 2302)
service_health_checker   → Placeholder (line 2305)
billing_query_handler    → Placeholder (line 2308)
user_issue_tracker       → Placeholder (line 2311)
feature_explainer        → Placeholder (line 2314)
troubleshoot_assistant   → Placeholder
```

#### Business Agent Tools (5 tools)
```
industry_research        → Placeholder (line 2332)
business_metric_analyzer → Placeholder
roi_calculator           → Placeholder (line 2335)
competitive_analyzer     → Placeholder
compliance_checker       → Placeholder
```

#### Research Agent Tools (7 tools)
```
web_researcher           → Placeholder (line 2355)
document_scraper         → Placeholder
template_creator         → Placeholder (line 2358)
template_library_manager → Placeholder
academic_paper_finder    → Placeholder
trend_analyzer           → Placeholder
content_synthesizer      → Placeholder
```

#### Data Engineer Tools (5 tools)
```
data_pipeline_builder    → Placeholder (line 2376)
data_quality_monitor     → Placeholder (line 2379)
data_lineage_tracker     → Placeholder
schema_evolution_manager → Placeholder
batch_processor          → Placeholder
```

---

## 3. Gap Analysis: Journey Step → Tool Coverage

### Step 1: Data Upload ✅ COVERED (Partial gaps)

| Required Capability | Tool | Status |
|---------------------|------|--------|
| File parsing | `file_processor` | ✅ Implemented (file-processor.ts) |
| Schema detection | `schema_generator` | ✅ Implemented |
| Data quality check | `assess_data_quality` | ✅ Implemented (Day 1) |
| PII detection | `scan_pii_columns` | ✅ Implemented |

**Gap**: `data_quality_monitor` for continuous monitoring - Placeholder

### Step 2: Analysis Preparation ⚠️ PARTIAL

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Template search | `template_library_manager` | ❌ Placeholder |
| Requirements generation | `generate_required_elements` | ✅ Implemented |
| PM clarification | `pm_clarification` | ✅ Implemented (route) |
| Online research | `web_researcher` | ❌ Placeholder |

**Gaps**: Research Agent tools not implemented

### Step 3: Data Verification ✅ COVERED

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Quality assessment | `assess_data_quality` | ✅ Implemented |
| PII verification | `scan_pii_columns` | ✅ Implemented |
| Schema validation | `schema_validator` | ✅ Exists in routes |

### Step 4: Data Transformation ✅ COVERED (Partial gaps)

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Data transformation | `intelligent_transformer` | ✅ Implemented |
| Dataset joining | `dataset_joiner` | ✅ Implemented |
| PII exclusion | `apply_pii_exclusions` | ✅ Implemented |

**Gap**: `data_lineage_tracker` for audit trail - Placeholder

### Step 5: Project Setup ✅ COVERED

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Template matching | Via Business Agent | ✅ Route-based |
| Project config | Storage layer | ✅ Direct DB |

### Step 6: Analysis Planning ✅ COVERED

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Plan generation | `generate_plan_blueprint` | ✅ Implemented (Day 1) |
| Cost estimation | `estimate_analysis_cost` | ✅ Via billing service |
| Roadmap creation | PM Agent | ✅ Orchestrator |

### Step 7: Analysis Execution ✅ COVERED

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Statistical analysis | `statistical_analyzer` | ✅ Implemented |
| ML training | `comprehensive_ml_pipeline` | ✅ Implemented |
| Visualization | `visualization_engine` | ✅ Implemented |
| Question answering | `question_answer_generator` | ✅ Implemented |

### Step 8: Billing/Pricing ⚠️ PARTIAL

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Cost calculation | `billing_service` | ✅ Implemented (Day 1 fix) |
| Usage tracking | `usage_tracking` | ✅ Implemented |
| Payment processing | Stripe integration | ✅ Implemented |

**Gap**: `billing_query_handler` for natural language billing queries - Placeholder

### Step 9: Results & Artifacts ✅ COVERED

| Required Capability | Tool | Status |
|---------------------|------|--------|
| Artifact generation | `artifact_generator` | ✅ Implemented |
| Audience formatting | `audience_formatter` | ✅ Implemented |
| Report export | `presentation_generator` | ✅ Implemented |

---

## 4. Dynamic Discovery Implementation Status

### 4.1 Capability Registry (From AGENTIC_ORCHESTRATION_DESIGN.md)

| Phase | Capability Query | Implementation Status |
|-------|------------------|----------------------|
| Phase 0: Research | `template.search`, `research.online` | ❌ Not implemented |
| Phase 1: Data | `data.process`, `pii.detect` | ✅ Implemented |
| Phase 2: Transform | `data.clean`, `data.join` | ✅ Implemented |
| Phase 3: Analysis | `analysis.statistical`, `ml.train` | ✅ Implemented |
| Phase 4: Results | `artifact.generate`, `visualization.create` | ✅ Implemented |

### 4.2 findToolsByCapability() Implementation

**Current Status**: Method exists but capability metadata not fully populated

```typescript
// In mcp-tool-registry.ts
findToolsByCapability(capability: string): RegisteredTool[] {
  return this.tools.filter(tool =>
    tool.capabilities?.includes(capability)
  );
}
```

**Gap**: Most tools don't have `capabilities` array populated

---

## 5. Implementation Roadmap

### Phase 1: Complete Core Journey Coverage (Priority: HIGH)

**Estimated Effort**: 4-6 hours

| Task | Tools | Impact |
|------|-------|--------|
| 1.1 Add capability metadata | All 13 implemented tools | Enables dynamic discovery |
| 1.2 Implement `template_library_search` | Research Agent | Enables template-based journeys |
| 1.3 Implement `data_lineage_tracker` | Data Engineer | Enables audit trail |

### Phase 2: Agent Coordination Tools (Priority: MEDIUM)

**Estimated Effort**: 6-8 hours

| Task | Tools | Impact |
|------|-------|--------|
| 2.1 `checkpoint_manager` | Store/retrieve checkpoints | Enables multi-step flows |
| 2.2 `progress_reporter` | Real-time progress | Improves UX |
| 2.3 `task_coordinator` | Agent task delegation | Enables complex workflows |

### Phase 3: Business Intelligence Tools (Priority: MEDIUM)

**Estimated Effort**: 8-10 hours

| Task | Tools | Impact |
|------|-------|--------|
| 3.1 `industry_research` | Web scraping + summarization | Industry-specific insights |
| 3.2 `roi_calculator` | Financial modeling | Business value quantification |
| 3.3 `compliance_checker` | Regulation validation | Enterprise readiness |

### Phase 4: Advanced Research Tools (Priority: LOW)

**Estimated Effort**: 10-12 hours

| Task | Tools | Impact |
|------|-------|--------|
| 4.1 `web_researcher` | External data gathering | Enhanced recommendations |
| 4.2 `template_creator` | Custom template generation | User flexibility |
| 4.3 `trend_analyzer` | Time-series patterns | Predictive capabilities |

---

## 6. Critical Path Recommendations

### Immediate Actions (Before Next User Test)

1. **Add capability metadata to implemented tools**
   - Update tool registration to include `capabilities: ['analysis.statistical', ...]`
   - This enables Gemini's dynamic discovery architecture

2. **Implement `template_library_search`**
   - Critical for Phase 0: Research & Planning
   - Returns templates from `journey-templates.ts` based on query

3. **Test fallback mode for each journey step**
   - Ensure every step works without agent involvement
   - Verify route-based endpoints function correctly

### Architecture Decision: Placeholder vs Real Implementation

For tools that remain placeholders:
- **Option A**: Remove from registry (clean up)
- **Option B**: Keep placeholders with clear error messages
- **Option C**: Implement basic version that delegates to existing services

**Recommendation**: Option C - Basic implementations that wrap existing functionality

---

## 7. Tool Capability Mapping (Reference)

Based on DYNAMIC_DISCOVERY_ARCHITECTURE.md:

```typescript
// Recommended capability tags for each tool
const toolCapabilities = {
  // Analysis Tools
  'statistical_analyzer': ['analysis.statistical', 'stats.compute'],
  'comprehensive_ml_pipeline': ['ml.train', 'automl.optimize', 'ml.explain'],
  'visualization_engine': ['visualization.create', 'chart.generate'],

  // Data Tools
  'scan_pii_columns': ['pii.detect', 'security.audit'],
  'apply_pii_exclusions': ['pii.mask', 'data.clean'],
  'assess_data_quality': ['data.quality', 'validation.schema'],

  // Planning Tools
  'generate_plan_blueprint': ['roadmap.create', 'plan.generate'],

  // Output Tools
  'artifact_generator': ['artifact.generate', 'report.create'],
  'audience_formatter': ['audience.translate', 'content.simplify'],
  'question_answer_generator': ['question.answer', 'evidence.chain']
};
```

---

## 8. Next Steps

1. [ ] Add capability metadata to 13 implemented tools
2. [ ] Implement `template_library_search` (wraps journey-templates.ts)
3. [ ] Test dynamic discovery with PM Agent
4. [ ] Implement `checkpoint_manager` (wraps project-agent-orchestrator)
5. [ ] Document all implemented tools in TOOL_ONBOARDING.md

---

## Appendix A: File Locations

| Component | File |
|-----------|------|
| Tool Registry | `server/services/mcp-tool-registry.ts` |
| Agent Tool Handlers | `server/services/agent-tool-handlers.ts` |
| PM Agent | `server/services/project-manager-agent.ts` |
| Orchestrator | `server/services/project-agent-orchestrator.ts` |
| Journey Templates | `shared/journey-templates.ts` |
| Semantic Pipeline | `server/services/semantic-data-pipeline.ts` |

---

**Document Version:** 1.0
**Author:** Claude Code Analysis
**Based on:** Gemini's architecture documents (Dec 16, 2025)
