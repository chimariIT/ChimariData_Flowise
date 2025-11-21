# User Journey Implementation Roadmap

**Generated:** January 2025
**Status:** Comprehensive codebase review complete

---

## 🎯 Executive Summary

Based on thorough codebase analysis, the current implementation has:
- ✅ **Solid foundation:** Multi-journey support, agent orchestration, billing integration
- ✅ **Major implementations complete:** Data verification, template synthesis, audience formatting, PII review
- ⚠️ **Remaining gaps:** Component extraction needed, preview step missing, lineage UI incomplete

**Current State:** 65% complete
**Target State:** Best-in-class user experience with full agent interaction

---

## ✅ What's Been Completed

### Priority 1.3: Data Quality Checkpoint (100% ✅)
- DataQualityCheckpoint component with approval gates
- SchemaValidationDialog for schema review/editing
- DataVerificationStep integrated into journey workflow
- Critical issues block proceeding
- Warnings require acknowledgment

### Priority 2.1: Business Template Synthesis (100% ✅)
- Template-to-analysis mappings implemented
- Auto-configuration from templates
- KPI auto-selection
- Template workflows enforced

### Priority 2.2: Data Transformation UI (100% ✅)
- data-transformation-ui.tsx component fully implemented
- Visual join for multiple datasets
- Aggregation/grouping interface
- Transformation preview

### Priority 3.1: Audience-Specific Formatting (100% ✅)
- AudienceFormatterService implemented
- Executive, technical, business formatters
- Results formatted by audience type

### Priority 3.3: PII Review UI (100% ✅)
- PIIDetectionDialog component
- Anonymization configuration
- Consent gathering

---

## 📊 Gap Analysis Summary

### What Works Well ✅

1. **Multi-Journey Infrastructure**
   - Four journey types implemented (non-tech, business, technical, consultation)
   - Custom journey recently added (capability selection)
   - Journey-specific routing and workflow stages

2. **Agent Coordination**
   - PM Agent orchestrates Data Engineer, Data Scientist, Business Agent
   - Agent synthesis of expert opinions
   - WebSocket real-time communication

3. **Data Ingestion**
   - Multi-file upload support (CSV, Excel, JSON)
   - Automatic schema detection with type inference
   - PII detection (backend implemented)
   - Quality metrics calculation

4. **Business Templates**
   - 20+ templates across 7 domains (retail, finance, healthcare, etc.)
   - Template structure defined with workflows, deliverables, visualizations
   - Multi-select template support in UI

5. **Billing Integration**
   - Unified billing service for all journey types
   - Subscription tier management
   - Quota tracking and overage calculation

6. **Checkpoint Infrastructure**
   - Checkpoint architecture exists in PM agent
   - Checkpoint components available

### Critical Gaps 🚨

1. **Goal Definition & Audience** 🟡 PARTIAL
   - ✅ Audience definition UI implemented in prepare-step.tsx
   - ✅ Primary/secondary audience selection
   - ✅ Decision context capture
   - ⚠️ Components not extracted (inline in prepare-step.tsx)
   - ❌ PM agent clarification dialog missing
   - ❌ Clarification API endpoint missing

2. **Results Preview Before Payment** 🟡 PARTIAL
   - ✅ ResultsPreview component exists (results-preview.tsx)
   - ✅ Integrated into analysis-payment.tsx
   - ❌ Not a dedicated journey step
   - ❌ Preview API endpoint missing

3. **Business Template Synthesis** ✅ COMPLETE
   - ✅ Templates mapped to analyses
   - ✅ Auto-configuration implemented
   - ✅ Template workflows enforced
   - ✅ KPI auto-selection working

4. **Data Transformation UI** ✅ COMPLETE
   - ✅ Frontend fully implemented (data-transformation-ui.tsx)
   - ✅ Visual join multiple datasets
   - ✅ Aggregation/grouping interface
   - ✅ Transformation preview

5. **Data Quality Checkpoints** ✅ COMPLETE
   - ✅ Quality issues shown (DataQualityCheckpoint.tsx)
   - ✅ Approval gate implemented
   - ✅ Bad data blocked from analysis
   - ✅ Critical issues block proceeding

6. **Audience-Specific Formatting** ✅ COMPLETE
   - ✅ Audience selector used
   - ✅ Results formatted differently by audience
   - ✅ Executive vs technical distinction

7. **PII Review UI** ✅ COMPLETE
   - ✅ PII review interface exists (PIIDetectionDialog.tsx)
   - ✅ Anonymization configuration
   - ✅ Consent properly gathered

8. **Artifact Traceability** 🟡 PARTIAL
   - ⚠️ Lineage concept exists in PM agent
   - ❌ No LineageDialog component
   - ❌ Transformations not fully visible

---

## 🗺️ Implementation Roadmap

### Phase 1: Critical User Experience Fixes (2-3 weeks)

**Goal:** Address showstoppers that prevent best-in-class experience

#### Priority 1.1: Audience Definition & PM Agent Clarification (Week 1)

**Status:** 🟡 Partially Implemented (80%)

**Estimated Effort:** 2-4 hours remaining

**Completed Tasks:**
1. ✅ **Schema Updated** 
   - `audienceProfile` added to `projectSessions.prepareData`
   - Audience types defined: executive, technical, business_ops, marketing, mixed
   - Decision context and deliverable format fields added

2. ✅ **Audience Definition UI Built** (inline in prepare-step.tsx)
   - Radio buttons for primary audience implemented
   - Secondary audiences support added
   - Decision context textarea implemented
   - Audience saved to session

**Remaining Tasks:**
1. **Extract Audience Components** (2h)
   - Extract `AudienceDefinitionSection` from inline code in prepare-step.tsx
   - Create reusable component

2. **PM Agent Clarification** (2h)
   - Create `/api/project-manager/clarify-goal` endpoint
   - Implement `clarifyGoalWithUser()` in PM agent
   - Build `PMAgentClarificationDialog` component
   - Add interactive Q&A flow

**Files Status:**
- ✅ `client/src/pages/prepare-step.tsx` - Audience UI implemented inline
- ✅ `shared/schema.ts` - Schema updated
- ⚠️ `client/src/components/AudienceDefinitionSection.tsx` - Needs extraction
- ❌ `client/src/components/PMAgentClarificationDialog.tsx` - Needs creation
- ❌ `server/routes/pm-clarification.ts` - Needs creation

**Success Criteria:**
- [x] User can select primary audience ✅
- [ ] PM agent summarizes understood goal ⚠️ (AgentChatInterface exists but needs enhancement)
- [ ] PM agent asks 2-3 clarifying questions ❌
- [ ] User can approve/request more clarification ⚠️ (Partial)
- [x] Audience saved to session ✅

---

#### Priority 1.2: Results Preview Before Payment (Week 1)

**Status:** 🟡 Partially Implemented (70%)

**Estimated Effort:** 4-6 hours remaining

**Completed Tasks:**
1. ✅ **Preview UI Component** 
   - `client/src/components/results-preview.tsx` created
   - Preview insights display implemented
   - Integrated into `analysis-payment.tsx`

**Remaining Tasks:**
1. **Preview Generation Backend** (2h)
   - Add `generatePreview()` to technical-ai-agent.ts
   - Run analysis on sample data
   - Limit insights display

2. **Preview API Endpoint** (1h)
   - Create `/api/analysis-execution/preview/:projectId`
   - Return limited insights, sample size, upgrade prompt

3. **Dedicated Preview Step** (2h)
   - Create `client/src/pages/results-preview-step.tsx`
   - Add to JourneyWizard flow
   - Route: `/journeys/:type/preview`

**Files Status:**
- ✅ `client/src/components/results-preview.tsx` - Component exists
- ✅ `client/src/pages/analysis-payment.tsx` - Integration complete
- ⚠️ `client/src/pages/results-preview-step.tsx` - Needs creation
- ❌ `server/routes/analysis-preview.ts` - Needs creation
- ⚠️ `server/services/technical-ai-agent.ts` - Needs preview generation

**Success Criteria:**
- [x] Preview UI component exists ✅
- [ ] Preview runs on sample data ⚠️ (Component exists, needs backend)
- [ ] Limited insights shown ⚠️ (Partial)
- [ ] Visualization thumbnails displayed ⚠️ (Partial)
- [x] Upgrade prompt clear ✅
- [ ] User must see preview before payment ⚠️ (Integrated but not as separate step)
- [ ] Full analysis runs after payment ✅

---

#### Priority 1.3: Data Quality Checkpoint (Week 2)

**Status:** ✅ Fully Implemented (100%)

**Estimated Effort:** 0 hours remaining

**Completed Tasks:**
1. ✅ **Quality Issue Detection**
   - File-processor returns detailed issues
   - Categorized by severity: critical, warning, info
   - Fix suggestions implemented

2. ✅ **Quality Checkpoint UI**
   - `DataQualityCheckpoint` component created
   - Quality score display with color coding
   - Issue cards with descriptions
   - Fix suggestion buttons
   - Schema validation section
   - Approval gate implemented

3. ✅ **Integration**
   - DataVerificationStep page created
   - Dedicated verification step in journey
   - Block "Continue" on critical issues
   - Allow warnings with acknowledgment
   - Save approvals to session

**Files Status:**
- ✅ `client/src/components/DataQualityCheckpoint.tsx` - Created and integrated
- ✅ `client/src/components/SchemaValidationDialog.tsx` - Created and integrated
- ✅ `client/src/pages/data-verification-step.tsx` - Created
- ✅ `client/src/pages/data-step.tsx` - Updated to separate upload from verification
- ✅ `client/src/components/JourneyWizard.tsx` - Added verification step
- ✅ `client/src/App.tsx` - Added route

**Success Criteria:**
- [x] Critical issues block proceeding ✅
- [x] Warnings shown but allow proceed with checkbox ✅
- [x] Schema can be reviewed and edited ✅
- [x] User approval tracked ✅
- [x] Quality score visible ✅

---

### Phase 2: Template Synthesis & Data Transformation (2-3 weeks)

**Goal:** Deliver on template value proposition and enable data preparation

#### Priority 2.1: Business Template Synthesis (Week 3)

**Estimated Effort:** 14-18 hours

**Tasks:**
1. **Template-to-Analysis Mappings** (6h)
   - Create `shared/business-template-mappings.ts`
   - Map each template to analysis components
   - Define KPIs per template
   - Specify required transformations
   - Define deliverable structure

2. **Synthesis Logic** (4h)
   - Implement `synthesizeTemplateAnalysis()` in PM agent
   - Combine multiple templates intelligently
   - Detect conflicting requirements
   - Build unified workflow from templates

3. **Auto-Configuration** (4h)
   - Update execute-step.tsx to use mappings
   - Auto-select analyses from template
   - Pre-fill analysis parameters
   - Show template-driven workflow

4. **Template Recommendation** (2h)
   - Suggest templates based on goal
   - Show expected deliverables per template
   - Match data schema to template requirements

**Files to Create:**
- `shared/business-template-mappings.ts` (400+ lines)

**Files to Modify:**
- `server/services/business-templates.ts`
- `server/services/project-manager-agent.ts`
- `client/src/pages/execute-step.tsx`
- `client/src/pages/prepare-step.tsx`

**Success Criteria:**
- [ ] Templates mapped to specific analyses
- [ ] KPIs auto-selected from template
- [ ] Multiple templates synthesized correctly
- [ ] Execute step pre-configured from template
- [ ] Template recommendations work

---

#### Priority 2.2: Data Transformation UI (Week 4-5)

**Estimated Effort:** 20-24 hours

**Tasks:**
1. **Main Transformation Page** (6h)
   - Create `data-transformation-step.tsx`
   - Source datasets display
   - Transformation pipeline builder
   - Add transformation buttons
   - Preview panel

2. **Join Builder** (4h)
   - Create `JoinBuilder.tsx` component
   - Visual table selector
   - Join key selection
   - Join type (inner, left, right, outer)
   - Preview joined output

3. **Aggregation Builder** (4h)
   - Create `AggregationBuilder.tsx`
   - Group by column selector
   - Aggregation function selector (sum, avg, count, min, max)
   - Preview aggregated output

4. **Target Schema Builder** (3h)
   - Create `TargetSchemaBuilder.tsx`
   - Column mapping interface
   - Type conversion options
   - Column renaming

5. **Transformation Preview** (2h)
   - Sample data preview (100 rows)
   - Before/after comparison
   - Transformation validation

6. **Integration** (3h)
   - Add route to App.tsx
   - Add stage to JourneyWizard
   - Connect to data-transformer backend
   - Save transformations to session

**Files to Create:**
- `client/src/pages/data-transformation-step.tsx`
- `client/src/components/JoinBuilder.tsx`
- `client/src/components/AggregationBuilder.tsx`
- `client/src/components/TargetSchemaBuilder.tsx`
- `client/src/components/TransformationPreview.tsx`

**Files to Modify:**
- `client/src/App.tsx`
- `client/src/components/JourneyWizard.tsx`
- `server/services/data-transformer.ts`
- `server/routes/transformation.ts` (NEW)

**Success Criteria:**
- [ ] User can join multiple datasets visually
- [ ] Aggregation/grouping works correctly
- [ ] Target schema definable
- [ ] Preview shows sample transformed data
- [ ] Transformations applied correctly
- [ ] Transformation history tracked

---

### Phase 3: Audience-Specific Formatting & Polish (1-2 weeks)

**Goal:** Polish user experience with audience targeting

#### Priority 3.1: Audience-Specific Result Formatters (Week 6)

**Estimated Effort:** 12-16 hours

**Tasks:**
1. **Formatter Architecture** (2h)
   - Create `server/services/result-formatters/` directory
   - Define `AudienceFormatter` interface
   - Create `FormatterFactory`

2. **Executive Formatter** (3h)
   - High-level summary (3-5 bullets)
   - Key findings only (top 5)
   - Financial impact (ROI, revenue, cost)
   - Actionable recommendation
   - Simple visualizations (bar, line, pie)

3. **Technical Formatter** (3h)
   - Detailed methodology explanation
   - Statistical significance metrics
   - Model performance details
   - All visualizations including complex ones
   - Code snippets for reproducibility

4. **Business Ops Formatter** (3h)
   - Operational impact metrics
   - Process improvement suggestions
   - KPI tracking definitions
   - Implementation action plan
   - Operational dashboards

5. **Integration** (2h)
   - Apply formatters in analysis-execution routes
   - Update results-step.tsx to display formatted results
   - Add audience toggle in results view

**Files to Create:**
- `server/services/result-formatters/executive-formatter.ts`
- `server/services/result-formatters/technical-formatter.ts`
- `server/services/result-formatters/business-ops-formatter.ts`
- `server/services/result-formatters/formatter-factory.ts`

**Files to Modify:**
- `server/routes/analysis-execution.ts`
- `client/src/pages/results-step.tsx`

**Success Criteria:**
- [ ] Executive results: high-level, ROI-focused
- [ ] Technical results: detailed methodology, stats
- [ ] Business ops results: actionable, process-oriented
- [ ] Audience toggle works in results view
- [ ] Language adjusted per audience

---

#### Priority 3.2: Artifact Lineage Tracking (Week 6)

**Estimated Effort:** 8-10 hours

**Tasks:**
1. **Lineage Data Structure** (2h)
   - Define lineage schema in shared/schema.ts
   - Track source data, transformations, analysis steps
   - Timestamp each step

2. **Lineage Tracking** (3h)
   - Update PM agent to track lineage during execution
   - Record tool executions
   - Link artifacts to source data

3. **Lineage Display UI** (3h)
   - Create `LineageDialog` component
   - Source data section
   - Transformation timeline
   - Analysis steps display
   - Output metadata

**Files to Create:**
- `client/src/components/LineageDialog.tsx`

**Files to Modify:**
- `server/services/project-manager-agent.ts`
- `client/src/pages/results-step.tsx`
- `shared/schema.ts`

**Success Criteria:**
- [ ] Artifacts show source data used
- [ ] Transformation history visible
- [ ] Analysis steps traceable
- [ ] Lineage dialog accessible from artifacts

---

#### Priority 3.3: PII Review UI (Week 7)

**Estimated Effort:** 6-8 hours

**Tasks:**
1. **PII Review Dialog** (3h)
   - Create `PIIReviewDialog` component
   - Show detected PII columns
   - Anonymization options (mask, hash, remove)
   - User consent checkbox

2. **Integration** (2h)
   - Trigger after schema detection
   - Block data step until PII reviewed
   - Save decisions to session

3. **Anonymization Preview** (2h)
   - Show sample before/after anonymization
   - Allow column-by-column configuration

**Files to Create:**
- `client/src/components/PIIReviewDialog.tsx`

**Files to Modify:**
- `client/src/pages/data-step.tsx`
- `server/services/unified-pii-processor.ts`

**Success Criteria:**
- [ ] PII columns clearly identified
- [ ] User can choose anonymization method per column
- [ ] Preview shows effect of anonymization
- [ ] Consent properly recorded
- [ ] Can't proceed without PII review

---

### Phase 4: Advanced Features & Optimization (1 week)

**Goal:** Add advanced capabilities and optimize performance

#### Priority 4.1: Template Recommendations (Week 8)

**Estimated Effort:** 8-10 hours

**Tasks:**
1. **Goal-to-Template Matcher** (4h)
   - NLP analysis of user goal
   - Match keywords to template domains
   - Score templates by relevance

2. **Recommendation UI** (3h)
   - Show top 3 recommended templates
   - Explain why each is relevant
   - Show expected deliverables

3. **Schema-Template Validation** (2h)
   - Check if data schema matches template requirements
   - Show gap analysis
   - Suggest additional data needed

**Success Criteria:**
- [ ] Templates suggested based on goal
- [ ] Recommendations accurate and helpful
- [ ] Schema compatibility checked
- [ ] Gaps clearly communicated

---

#### Priority 4.2: Journey State Persistence (Week 8)

**Estimated Effort:** 6-8 hours

**Tasks:**
1. **State Checkpointing** (3h)
   - Save journey state after each step
   - Hash critical data for integrity

2. **Resume Functionality** (3h)
   - Detect incomplete journey on login
   - Offer to resume from last checkpoint
   - Restore all state correctly

**Success Criteria:**
- [ ] Journey state saved automatically
- [ ] User can resume from any step
- [ ] State restored accurately
- [ ] Works across devices

---

## 📋 Detailed Task Breakdown

### Task Template

For each task, follow this structure:

```markdown
### Task: [Task Name]

**Priority:** P1/P2/P3/P4
**Estimated Effort:** X hours
**Dependencies:** [List prerequisite tasks]

**Description:**
[What needs to be built]

**Files to Create:**
- path/to/new/file.ts - Brief description

**Files to Modify:**
- path/to/existing/file.ts - What changes
  - Line XX: Add/modify [specific change]

**Implementation Steps:**
1. Step one
2. Step two
3. Step three

**Testing Checklist:**
- [ ] Test case 1
- [ ] Test case 2

**Success Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
```

---

## 🎯 Success Metrics

### User Experience Metrics
- [ ] Average time to complete journey < 30 minutes
- [ ] Goal clarification improves clarity by 40%
- [ ] Preview reduces refund requests by 60%
- [ ] Data quality checkpoint catches 80%+ of issues
- [ ] Template usage increases by 50%
- [ ] Audience-specific results rated 4.5+/5

### Technical Metrics
- [ ] All checkpoints have approval gates
- [ ] State persists across page refreshes
- [ ] Real-time agent updates < 2s latency
- [ ] Error handling covers all edge cases
- [ ] Test coverage > 80% for new code
- [ ] API response times < 500ms p95

### Business Metrics
- [ ] Conversion rate improves 30%
- [ ] Refund rate drops 60%
- [ ] Template adoption 40%+
- [ ] User retention improves 25%
- [ ] Average revenue per user increases 20%

---

## 🚀 Deployment Strategy

### Phase 1 Deployment (Critical Fixes)
1. Deploy audience definition + PM clarification
2. Deploy results preview
3. Deploy data quality checkpoint
4. **Feature flag:** Enable for 20% of users first
5. Monitor metrics for 1 week
6. Rollout to 100% if metrics positive

### Phase 2 Deployment (Templates & Transformation)
1. Deploy template synthesis
2. Deploy data transformation UI
3. **Feature flag:** Enable for business journey users first
4. Gather feedback
5. Rollout to all journeys

### Phase 3 Deployment (Formatting & Polish)
1. Deploy audience formatters
2. Deploy artifact lineage
3. Deploy PII review UI
4. Full rollout (no feature flags needed)

### Phase 4 Deployment (Advanced Features)
1. Deploy recommendations
2. Deploy state persistence
3. Full rollout

---

## 📊 Progress Tracking

### Overall Progress

| Phase | Tasks | Estimated Hours | Status | Completion |
|-------|-------|----------------|--------|------------|
| Phase 1: Critical UX | 3 major tasks | 30-40h | 🟡 In Progress | 75% |
| Phase 2: Templates & Transform | 2 major tasks | 34-42h | 🟢 Complete | 100% |
| Phase 3: Formatting & Polish | 3 major tasks | 26-34h | 🟡 Partial | 80% |
| Phase 4: Advanced Features | 2 major tasks | 14-18h | ⚪ Not Started | 0% |
| **Total** | **10 major tasks** | **104-134h** | **🟡 In Progress** | **65%** |

### Detailed Tracking

Use GitHub issues/project board to track:
- [ ] Task status (Not Started, In Progress, In Review, Done)
- [ ] Assignee
- [ ] Estimated vs actual hours
- [ ] Blockers
- [ ] Dependencies

---

## 🔗 Related Documentation

- `CUSTOM_JOURNEY_COMPLETE.md` - Custom journey implementation (completed)
- `CUSTOM_JOURNEY_BILLING_INTEGRATION.md` - Billing integration patterns
- `CLAUDE.md` - Project instructions and architecture
- `PRIORITY_FIXES_COMPLETION_REPORT.md` - Previous fixes completed

---

## 📝 Notes & Decisions

### Key Architectural Decisions

1. **Audience Definition Location**
   - Decision: Add to prepare-step (goal definition phase)
   - Rationale: Need audience context before any analysis planning

2. **Results Preview Strategy**
   - Decision: 10% sample data, limited insights
   - Rationale: Balance between preview value and computational cost

3. **Template Synthesis Approach**
   - Decision: PM agent synthesizes, not hardcoded mappings
   - Rationale: Flexibility for complex multi-template scenarios

4. **Transformation UI Placement**
   - Decision: Separate step between data upload and execute
   - Rationale: Clear separation of concerns, can skip if not needed

5. **Audience Formatters**
   - Decision: Server-side formatting, not client-side
   - Rationale: Consistency, easier to maintain, better for AI generation

---

**Status:** Roadmap Updated - 65% Complete  
**Next Step:** Complete remaining gaps in Priority 1.1, 1.2, and 3.2
