# Comprehensive Pipeline Audit — February 23, 2026

Scope: End-to-end journey flow from goals/questions to analysis execution, results, and artifacts. Includes prior FIX_PLAN items and additional gaps found in code + architecture review. Grouped by subsystem. Each item includes issue, solution, architectural context, and testing criteria. Related FIX_PLAN items are explicitly called out.

---

## 1) Journey Orchestration and Checkpoints

### JO-1: Execution state not persisted across restarts
- Issue: Journey execution state (current step, awaiting checkpoint, in-progress) is tracked in-memory only. `JourneyExecutionMachine` supports persistence but is constructed without `persistState/restoreState`, so any server restart drops in-flight step status and checkpoint tracking. This can strand journeys between approvals.
- Architectural context: Orchestration relies on `journeyProgress` and checkpoint workflows for U2A2A2U. In-memory state contradicts the SSOT requirement in [server/services/journey-state-manager.ts](server/services/journey-state-manager.ts).
- Solution: Inject persistence callbacks into `JourneyExecutionMachine` from `ProjectAgentOrchestrator`. Persist machine state to `projects.journeyProgress` (or a dedicated table) and restore on startup. Also reconcile pending checkpoints from DB on restore.
- Testing criteria:
  - Start an execution, reach a checkpoint, restart server, verify state resumes as `awaiting_feedback` with the same checkpoint.
  - Complete the checkpoint post-restart and ensure execution proceeds without re-running prior steps.

### JO-2: Analysis progress events never reach the WebSocket client
- Issue: `analysis-execution.ts` emits `analysis:progress` events on the agent message broker, but `RealtimeAgentBridge` does not subscribe to or forward those events to the WebSocket server. The UI subscribes to `analysis:progress` via `realtimeClient`, so per-analysis progress is likely silent.
- Architectural context: Execution UI in [client/src/pages/execute-step.tsx](client/src/pages/execute-step.tsx) expects `analysis:progress` from the realtime WS, while the broker events are handled only for checkpoints and generic agent messages in [server/services/agents/realtime-agent-bridge.ts](server/services/agents/realtime-agent-bridge.ts).
- Solution: Add a broker listener for `analysis:progress` in `RealtimeAgentBridge` and forward it as a WS event. Alternatively, emit `analysis:progress` via `RealtimeServer` directly from analysis execution.
- Testing criteria:
  - Trigger analysis execution and verify per-analysis progress updates in the UI within the first 10 seconds.
  - Validate that progress events include `projectId`, `analysisId`, and `status` and are filtered client-side correctly.

### JO-3: Execution progress channel mismatch (SocketManager vs WS)
- Issue: Several services emit `execution_progress` via `SocketManager` (Socket.IO), but the client now relies on the native WS `RealtimeClient`. The WS server does not appear to forward Socket.IO events, so progress events may not reach the UI consistently.
- Architectural context: `RealtimeAgentBridge` explicitly removed Socket.IO emission. The UI subscribes via WS in [client/src/lib/realtime.ts](client/src/lib/realtime.ts), while server-side emitters call [server/socket-manager.ts](server/socket-manager.ts).
- Solution: Standardize all execution progress events to flow through `RealtimeServer` (native WS). Deprecate Socket.IO emitters or add a bridging layer.
- Testing criteria:
  - Trigger any execution flow that emits `execution_progress` and verify that UI receives `type:execution` and project-scoped events.
  - Confirm Socket.IO is not required for progress updates.

### JO-4: Tool input schemas not validated at runtime
- Issue: Tools are registered with `inputSchema`, but `executeTool()` does not validate inputs before executing handlers. This allows malformed payloads to progress into analysis and produce broken outputs or runtime errors.
- Architectural context: Tool registry design in [server/services/mcp-tool-registry.ts](server/services/mcp-tool-registry.ts) includes schema metadata, but enforcement is absent. This undermines dynamic discovery and cross-agent coordination.
- Solution: Add schema validation in `executeTool()` before handler invocation; return a structured error response with validation details. Consider strict mode for P0/P1 tools.
- Testing criteria:
  - Call a tool with a malformed payload and verify a 400-like ToolExecutionResult with validation errors.
  - Ensure valid payloads still execute unchanged.

---

## 2) Prepare (Goals and Questions)

### PR-1: Journey prep depends on localStorage without a hard server SSOT check
- Issue: The prepare step restores `currentProjectId` from localStorage and URL query params. If localStorage is missing or stale, the step may operate without a project and silently fail to persist goals/questions.
- Architectural context: SSOT is `journeyProgress`. Client-side is resilient but not authoritative. Prepare step is in [client/src/pages/prepare-step.tsx](client/src/pages/prepare-step.tsx).
- Solution: Require a project ID server-side in prepare endpoints and return a clear error when missing. On the client, block the form with a recoverable error state and a direct path to data upload.
- Testing criteria:
  - Open prepare step in a fresh session without localStorage; verify UI prompts to create/upload a project.
  - Confirm goals/questions are persisted to `journeyProgress` after entry.

---

## 3) Data Upload and PII

### DU-1: Consolidated data upload step depends on joined preview being set before verification
- Issue: The upload step drives PII decisions, join preview, and schema previews. If join preview or schema fails to persist, downstream verification can show empty schema even after successful upload.
- Architectural context: Data upload merges responsibilities from project setup and data step in [client/src/pages/data-upload-step.tsx](client/src/pages/data-upload-step.tsx). This is the gateway to DS/DE requirements and transformations.
- Solution: Ensure join preview and schema are persisted in `journeyProgress.joinedData` and rehydrated in later steps; add fallback to dataset schema if joined schema is missing.
- Testing criteria:
  - Upload multi-dataset project, refresh page, and verify joined schema remains available in data verification.
  - Verify PII exclusions are applied to joined preview columns.

### DU-2: MultiSourceUpload mock fallback creates phantom projects (FIX_PLAN P0-1)
- Issue: Upload error path fabricates a demo project and calls `onComplete`, causing downstream steps to operate on non-existent IDs.
- Architectural context: Upload flows feed the SSOT project record used in planning and execution. See [client/src/components/MultiSourceUpload.tsx](client/src/components/MultiSourceUpload.tsx).
- Solution: Remove mock fallback and surface errors. Provide a retry path.
- Testing criteria: See FIX_PLAN P0-1.
- Related FIX_PLAN: P0-1.

---

## 4) Data Verification and Mapping

### DV-1: SchemaAnalysis still returns mock data (FIX_PLAN P2-9)
- Issue: Schema analysis simulates a 3-second delay and returns empty columns, which undermines validation and mapping.
- Architectural context: Verification step relies on schema analysis to drive data element mapping in [client/src/components/SchemaAnalysis.tsx](client/src/components/SchemaAnalysis.tsx).
- Solution: Replace with real API response or accept schema as prop from upload step.
- Testing criteria: See FIX_PLAN P2-9.
- Related FIX_PLAN: P2-9.

---

## 5) Data Transformation and Preparation

### DT-1: Derived columns are computed in memory but not persisted to dataset schema
- Issue: `AnalysisDataPreparer.applyDerivedColumns` mutates rows in memory but does not update transformed schema or ingestion metadata for downstream consumers. This can produce mismatches between actual data sent to Python and stored schema/metadata.
- Architectural context: Derived columns are required for analysis correctness and evidence chain integrity. See [server/services/analysis-data-preparer.ts](server/services/analysis-data-preparer.ts).
- Solution: When derived columns are applied, update `ingestionMetadata.transformedSchema` and/or `journeyProgress` with derived column definitions, and persist updated schema into dataset metadata.
- Testing criteria:
  - Configure derived columns and run transformation; verify transformed schema includes derived fields.
  - Confirm analysis execution sees the derived column in both data and schema payload.

### DT-2: TransformationApplied flag can block raw fallback without clear remediation
- Issue: `extractDatasetRows()` throws if `transformationApplied` is true but transformed data is missing. If the transformation endpoint fails to set or persist `transformationApplied` consistently, this creates a hard failure without a recovery path.
- Architectural context: Transformations are a gate before analysis execution. See [server/services/analysis-data-helpers.ts](server/services/analysis-data-helpers.ts).
- Solution: Ensure transformation endpoint sets `transformationApplied` only after data persistence succeeds, and provide a user-facing error that links to re-run the transformation step.
- Testing criteria:
  - Simulate partial transform save: flag set without data. Verify error message points user to re-run transformations.
  - Confirm normal transformation persists data and does not throw.

---

## 6) Analysis Planning

### PL-1: Plan polling can auto-regenerate on timeouts without an explicit checkpoint
- Issue: `plan-step` auto-regenerates after a timeout, which can replace prior plan artifacts without a clear user decision or checkpoint.
- Architectural context: The plan is a critical checkpoint for U2A2A2U approval. See [client/src/pages/plan-step.tsx](client/src/pages/plan-step.tsx).
- Solution: Add a user-facing checkpoint on plan regeneration; preserve the previous plan version for comparison and rollback.
- Testing criteria:
  - Force plan polling timeout and verify user is prompted before regeneration.
  - Validate both plan versions remain accessible.

---

## 7) Execution, Results, and Artifacts

### EX-1: Per-analysis progress UI depends on broker events not bridged to WS (JO-2)
- Issue: UI subscribes to `analysis:progress`, but broker events are not forwarded. See JO-2.
- Solution: Bridge broker events to WS.
- Testing criteria: See JO-2.

### EX-2: Artifact generation status has long polling but no server-side status endpoint alignment
- Issue: Client uses polling with backoff, but server-side artifact status endpoints and their state machine are not verified in the execution path. If artifact jobs run async without consistent status updates, the UI can show “generating” indefinitely.
- Architectural context: Artifacts are generated asynchronously in analysis execution and fetched later in results step.
- Solution: Ensure artifact generation writes to a persisted status field (e.g., project_artifacts status or journeyProgress.artifacts) and expose an endpoint that the polling uses.
- Testing criteria:
  - Trigger analysis with artifact generation; verify polling transitions from generating to ready within expected time.
  - If artifact generation fails, verify error state is reported and can be retried.

---

## 8) Admin and Operational Gaps Impacting Pipeline

### AO-1: Admin tools/errors/database endpoints broken (FIX_PLAN P1-1)
- Issue: Admin pages call `/api/admin/*` but those endpoints are still in `admin.ts` (mounted at `/admin-legacy`). This blocks operational visibility into failures that affect analysis execution.
- Architectural context: Ops visibility is critical for pipeline stability. See [server/routes/index.ts](server/routes/index.ts), [server/routes/admin.ts](server/routes/admin.ts), [server/routes/admin-secured.ts](server/routes/admin-secured.ts).
- Solution: Migrate the endpoints to `admin-secured.ts` as in FIX_PLAN P1-1.
- Testing criteria: See FIX_PLAN P1-1.
- Related FIX_PLAN: P1-1.

---

## 9) Documentation Drift That Can Mask Pipeline Gaps

### DOC-1: User journey docs do not match current consolidated flow
- Issue: Documentation still references older journey type names and separate project-setup/data-step, which no longer exist. This causes implementation drift and misaligned QA.
- Architectural context: Current flow is defined in [client/src/components/JourneyWizard.tsx](client/src/components/JourneyWizard.tsx) and [client/src/pages/data-upload-step.tsx](client/src/pages/data-upload-step.tsx).
- Solution: Update docs to reflect consolidated data upload + prepare step order and new journey types.
- Testing criteria:
  - Validate docs match actual routes in [client/src/App.tsx](client/src/App.tsx).
  - Ensure QA test cases mirror the new step order.

---

## Appendix: FIX_PLAN Issues That Directly Affect the Pipeline

The following FIX_PLAN items have direct impact on end-to-end execution. They should remain in scope for the pipeline to function correctly:
- P0-1 MultiSourceUpload mock fallback (DU-2)
- P0-2 ai-access-control rate limit stub (security and abuse risk)
- P0-3 enhanced-analysis capabilities disclosure (security)
- P0-4 data.ts unauthenticated endpoints (security)
- P0-5 export.ts unauthenticated endpoints (security)
- P0-6 analytics admin auth and record endpoint
- P1-3 ai.ts hardcoded usage quotas
- P1-4 PII scan stub in agent tools
- P1-5 ai-payment integration usage count stub
- P1-7/1-9 Knowledge graph integrity (evidence chain and enrichment)
- P2-1 columnNames empty in enrichment (weak evidence chain)
- P2-9 SchemaAnalysis mock (verification gap)

---

## Suggested Next Steps

1) Implement JO-2 and JO-3 first to restore real-time execution transparency in the Execute step.
2) Add JourneyExecutionMachine persistence (JO-1) to prevent workflow loss across restarts.
3) Confirm transformation persistence (DT-2) and derived column schema updates (DT-1).
4) Update docs to align with the consolidated data upload step and current journey routing.
