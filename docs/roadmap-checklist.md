# Roadmap Execution Checklist

| Task | Status | Notes | Last Updated |
| --- | --- | --- | --- |
| Agent orchestration cleanup (broker, state machine, prompts, fallbacks) | ✅ Complete | Journey execution state machine implemented (`journey-execution-machine.ts`); checkpoint + telemetry added to message broker; MCP tool access with agent alias resolution active; all 5 journey templates include execute step; 13 business templates added. | 2025-11-19 |
| Analysis pattern system | ⚠️ Partially Complete | Database tables created (`analysis_patterns`, `analysis_pattern_sources`, `template_patterns`); 15 analysis patterns created and ready; foreign key constraint blocks template linking (templates in code, not DB). Requires architecture decision. | 2025-11-19 |
| React UX rationalization (cards, panels, CTAs, layout) | Not Started | Pending completion of agent orchestration milestone. | 2025-11-18 |
| SLA pipeline tweaks (async staging, caching, Polars/Spark shim) | Not Started | Sequenced after UX rationalization. | 2025-11-18 |
| End-to-end timing instrumentation (API timers, client marks, dashboard) | Not Started | Execute after SLA pipeline adjustments. | 2025-11-18 |

## Detailed Checklist

- [x] Agent orchestration cleanup
  - [x] Audit `AgentMessageBroker` publish/subscribe flow
  - [x] Add supervising state machine for journey checkpoints
  - [x] Tighten per-agent prompt scaffolding and timeouts
  - [x] Implement error fallbacks and telemetry hooks
  - [x] Add execute step to all 5 journey templates
  - [x] Expand business templates to 13 total templates
  - [x] Add MCP tool agent alias resolution
- [ ] Analysis pattern system
  - [x] Create database tables for analysis patterns
  - [x] Create migration file (010_add_analysis_patterns_tables.sql)
  - [x] Apply migration and verify tables exist
  - [x] Create 15 analysis patterns (ready status)
  - [x] Create pattern registry service (analysis-pattern-registry.ts)
  - [x] Create pattern linking script (link-templates-to-patterns.ts)
  - [ ] **Decision needed**: Remove FK constraint or migrate templates to DB
  - [ ] Complete template-pattern linking
- [ ] React UX rationalization
  - [ ] Catalog redundant cards and consolidate views
  - [ ] Collapse secondary panels behind accordions
  - [ ] Standardize CTA copy and primary actions
  - [ ] Prep layout adjustments for transformation and journey pages
- [ ] SLA pipeline tweaks
  - [ ] Split upload/ingest/analysis into async stages with progress events
  - [ ] Cache dataset sample earlier in pipeline
  - [ ] Prototype Polars/Spark fallback shim and compare metrics
- [ ] End-to-end timing instrumentation
  - [ ] Add request/response timers in API middleware
  - [ ] Emit client performance marks and send batch metrics
  - [ ] Expose latency via metrics endpoint and dashboard widgets
