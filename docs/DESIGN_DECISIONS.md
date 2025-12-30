# Architecture & Design Decisions (Shared Ledger)

This document tracks technical decisions made during the End-to-End Journey Continuity fix. It serves as a synchronization point for **Claude** and **Gemini (Antigravity)**.

## Decision Ledger

| Date | Decision ID | Topic | Description | Rationale | Owner |
|------|-------------|-------|-------------|-----------|-------|
| 2025-12-18 | DEC-001 | SSOT Strategy | Use `projects.journeyProgress` (JSONB) as the single source of truth for all journey state. | Minimizes architectural overhead while providing sufficient flexibility for multi-agent state. SQL JSONB performance is adequate for journey-length transactions. | Combined |
| 2025-12-18 | DEC-002 | Migration Pattern | Lazy Migration via `getProject` storage layer. | Ensures existing projects are upgraded upon first access without requiring a complex, all-at-once blocking migration. | Claude |
| 2025-12-18 | DEC-003 | Frontend Sync | Replace `useProjectSession` with TanStack Query (React Query). | Unified caching, automatic background refetching, and better synchronization with the persistent DB state. | Gemini |
| 2025-12-18 | DEC-004 | Atomic Updates | Implement `PATCH /api/projects/:id/progress` with JSONB deep merge. | Prevents race conditions and "last-write-wins" issues between concurrent agent updates and user UI interactions. | Claude |
| 2025-12-18 | DEC-005 | Lean State | Exclude `journeyProgress` from Dashboard list queries. | Optimize dashboard performance (avoiding 1MB+ JSON blobs in lists) while still allowing lazy-loading for active projects. | Gemini |
| 2025-12-18 | DEC-006 | Vector Integration | Semantic pipeline generates recommendations; approved results stored as references in `journeyProgress.requirementsDocument.semanticReferences`. Vector tables (`data_elements`, `question_element_links`, etc.) remain for evidence chains/audit. | Separates "intelligence" (vector) from "state" (JSONB). Semantic analysis runs once in Prepare step, never regenerated in subsequent steps. | Combined |
| 2025-12-18 | DEC-007 | Evidence Chain | Results UI queries vector tables using IDs stored in `journeyProgress.requirementsDocument.semanticReferences` for "How We Answered" display. | Provides traceability without duplicating semantic data in JSONB. Enables audit trail from question → element → transformation → result. | Gemini (UI) / Claude (API) |
| 2025-12-18 | DEC-008 | Capability Metadata | Populate `capabilities` array on all registered tools to enable dynamic discovery via `findToolsByCapability()`. | Enables agent orchestration per DYNAMIC_DISCOVERY_ARCHITECTURE.md without hardcoding tool names. | Claude |
| 2025-12-18 | DEC-009 | Implementation Order | Interface (C) → PATCH API (A) + Lazy Migration (B) in parallel → Vector wiring. | Interface defines contract; PATCH/Migration are independent but both need interface; Vector needs both to persist. | Combined |
| 2025-12-18 | DEC-010 | Admin Controls | Enable deep state instrumentation (Audit Logs) and administrative overrides (Phase Reset, Force Sync) in the Admin Dashboard. | Essential for debugging multi-agent orchestration failures and ensuring data continuity during rapid development (Phase 4-5). | Gemini |

## Implementation Dependencies

```
JourneyProgress Interface (DEC-001)
         │
         ├──────────────────┬──────────────────┐
         │                  │                  │
         ▼                  ▼                  │
   PATCH Endpoint      Lazy Migration         │
     (DEC-004)          (DEC-002)             │
         │                  │                  │
         └────────┬─────────┘                  │
                  │                            │
                  ▼                            │
         Vector Pipeline                       │
          Integration                          │
          (DEC-006)                           │
                  │                            │
                  ▼                            ▼
         Evidence Chain UI              Capability Metadata
            (DEC-007)                      (DEC-008)
```

## Implementation Status (December 18, 2025)

| Decision | Status | Implementation Notes |
|----------|--------|---------------------|
| DEC-001 | ✅ Complete | `shared/schema.ts` lines 237-410 - Added `journeyProgressSchema` with `semanticReferences` field |
| DEC-002 | ✅ Complete | `server/storage.ts` lines 1401-1596 - `migrateJourneyProgressIfNeeded()` method |
| DEC-003 | ✅ Complete | `client/src/hooks/useProject.ts` - TanStack Query integration (Gemini) |
| DEC-004 | ✅ Complete | `server/routes/project.ts` lines 6247-6339 - PATCH endpoint with deep merge |
| DEC-005 | ✅ Complete | Dashboard query optimization (Gemini) |
| DEC-006 | ✅ Complete | `server/routes/semantic-pipeline.ts` - All endpoints now store IDs in journeyProgress |
| DEC-007 | ✅ Complete | `client/src/components/EvidenceChainUI.tsx` - Gemini implemented "How We Answered" UI |
| DEC-008 | ✅ Complete | `server/services/mcp-tool-registry.ts` - 15+ tools with capability metadata |
| DEC-009 | ✅ Complete | Implementation order followed correctly |
| DEC-010 | ✅ Complete | Admin Instrumentation & Controls - Full Technical State Viewer with Audit Log, Pipeline Insights, Admin Controls (Force Sync, Reset, Merge Test), Active Agents Monitor |
| Phase 3 | ✅ Complete | `TemplateLibrarySearch` and `CheckpointManager` tools implemented (Claude) |
| Phase 4-5 | ✅ Complete | Technical State Viewer implemented (Claude took over from Gemini) - All sub-tasks completed |

### DEC-006 Implementation Details

The semantic pipeline routes now store IDs in `journeyProgress.requirementsDocument.semanticReferences`:

1. **`POST /api/semantic-pipeline/:id/extract-elements`**
   - Stores `dataElementIds` after extracting data elements from datasets

2. **`POST /api/semantic-pipeline/:id/link-questions`**
   - Stores `questionElementLinkIds` after linking questions to data elements

3. **`POST /api/semantic-pipeline/:id/infer-transformations`**
   - Stores `transformationIds` after inferring required transformations

4. **`POST /api/semantic-pipeline/:id/run-full-pipeline`**
   - Stores all three ID types in a single update
   - Handles case where no questions exist yet (stores only element IDs)

All updates are non-blocking - API responses are returned even if journeyProgress update fails.

## Coordination Protocol Notes
- **Branch Strategy:** All work on `fix/end-to-end-journey-continuity`.
- **Shared Planning:** See [SHARED_TASK.md](file:///c:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/docs/SHARED_TASK.md) and [SHARED_IMPLEMENTATION_PLAN.md](file:///c:/Users/scmak/Documents/Work/Projects/Chimari/chimariapp2/ChimariData_Flowise-chimaridataApp2/docs/SHARED_IMPLEMENTATION_PLAN.md) for detailed tasking.
- **Daily Sync:** Use `docs/SYNC.md` for daily handovers if necessary.
- **Validation:** Every backend change (Claude) must be verified by a frontend consumer (Gemini) and vice-versa.
- **Conflict Resolution:** If a design choice impacts both layers (e.g., schema changes), it must be documented here before implementation.
