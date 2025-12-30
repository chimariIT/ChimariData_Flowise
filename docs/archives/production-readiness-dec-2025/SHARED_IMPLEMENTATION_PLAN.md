# Shared Journey Continuity Implementation Plan

This plan outlines the collaborative effort to fix data continuity and implement a robust agentic orchestration system, as agreed in `docs/DESIGN_DECISIONS.md`.

## User Review Required

> [!IMPORTANT]
> **Implementation Order (DEC-009)**: Interface Definitions (DEC-001) must stay ahead of execution. Frontend TanStack Query (DEC-003) is dependent on the `PATCH /api/projects/:id/progress` API (DEC-004) being implemented by Claude.

## Proposed Changes

### 1. Backend Infrastructure (Lead: Claude)

#### [MODIFY] Storage & API
- **DEC-004**: Implement `PATCH /api/projects/:id/progress` with JSONB deep merge.
- **DEC-002**: Implement Lazy Migration in `storage.getProject`. When a project is loaded, it should consolidate data from:
  - `localStorage` fallbacks (passed from frontend if available)
  - `project_sessions` table
- **Migration Targets (localStorage keys)**:
  - `chimari_prepare_data`, `chimari_data_data`, `chimari_execute_data`, `chimari_pricing_data`, `chimari_results_data`
  - `chimari_business_templates`, `projectQuestions`
  - `agentRecommendations`, `acceptedRecommendations`
- **DEC-008**: Populate `capabilities` metadata in `MCPToolRegistry`.

---

### 2. Frontend State Management (Lead: Gemini)

#### [DONE] [useProject.ts](file:///c:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/hooks/useProject.ts)
Centralized project data fetching and updates using TanStack Query (DEC-003).
- `useProject(projectId)`: Returns `Project` object with typed `journeyProgress`.
- **Enhanced**: Now returns `projectId` explicitly for convenience.
- `useUpdateProjectProgress(projectId)`: Mutation for `PATCH /api/projects/:id/progress`.
- **Interface**: Implements `JourneyProgress` from `shared/schema.ts`.

#### [DONE] Journey Steps
- **[DONE] DataStep**: Migrated to `useProject`; removed `useProjectSession`.
- **[DONE] Verification/Transformation Steps**: Refactored to use `journeyProgress` and `useProject`.
- **[DONE] PrepareStep**: Migrated goals, questions, and templates to `journeyProgress`.
- **[DONE] Execute/Results Steps**: Refactored to prioritize `journeyProgress` for recommendations and audience state.

---

### 3. Vector & Evidence Chain (Shared)

#### Semantic Linkage (Lead: Claude)
- **DEC-006**: Generate and store `semanticReferences` in `journeyProgress.requirementsDocument`.

#### [DONE] [EvidenceChainUI.tsx](file:///c:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/components/EvidenceChainUI.tsx) (DEC-007)
Built the "How We Answered" component to show the audit trail from Question → Vector ID → Result.
- **Data Source**: `GET /api/semantic-pipeline/:projectId/evidence-chain/:questionId`
- **Integrated**: Added to `ResultsStep.tsx` Q&A view.

---

### 4. Admin Dashboard & Technical State Viewer (Claude - took over from Gemini)

#### [DONE] [project-state-inspector.tsx](file:///c:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/client/src/pages/admin/project-state-inspector.tsx)
Enhanced the existing State Viewer to provide deep instrumentation and administrative controls.
- **Audit Logging**: Added view for `decision_audits` with agent, decision type, reasoning, confidence, impact.
  - API: `GET /api/admin/projects/:projectId/decision-trail`
- **Pipeline Insights**: Displays semantic ID mappings (`dataElementIds`, `transformationIds`, `questionElementLinkIds`) from `journeyProgress.requirementsDocument.semanticReferences`.
- **Admin Controls**: Implemented all actions:
  - Force Sync (DEC-002): `POST /api/admin/projects/:projectId/force-sync`
  - Phase Reset: `POST /api/admin/projects/:projectId/reset-phase`
  - Atomic Merge Test (DEC-004): `POST /api/admin/projects/:projectId/atomic-merge-test`
- **Active Agents Monitor**: Real-time view of active agents with auto-refresh.
  - API: `GET /api/admin/agents/active`

## Verification Plan

### Automated Tests
- **Data Integrity**: Verify `journeyProgress` JSONB structure against Zod schema (DEC-001).
- **Hooks**: Unit test `useProject` with MSW to mock the progress API.
- **Admin API**: Verify new `/api/projects/:id/admin-*` endpoints (to be implemented).

### Manual Verification
1. **Zero-Loss Migration**: Refresh a page in the middle of a journey; verify data persists from DB, not `localStorage`.
2. **Atomic Updates**: Verify that updating "Analysis Goal" doesn't overwrite "Uploaded Datasets".
3. **Admin Inspection**: Use the State Inspector to verify a project's `journeyProgress` after a complex agent task.
