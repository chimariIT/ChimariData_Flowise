# ChimariData Architecture Overview (Feb 2025)

## Platform Snapshot
- Multi-agent analytics platform spanning a React 18 front-end (`client/`), Express/TypeScript API (`server/`), shared Zod schemas (`shared/`), and Python/Spark analysis workers (`python_scripts/`, `server/services/spark-processor.ts`).
- PostgreSQL via Drizzle ORM (`shared/schema.ts`, `drizzle.config.ts`) with Redis-backed caches/message brokers activated automatically when available.
- MCP tool registry pattern (`server/services/mcp-tool-registry.ts`) mediates every long-running analytic, ML, and visualization action to ensure permission and billing enforcement.
- Development workflow: `npm run dev` boots combined client/server with hot reload and Playwright web server automation; Playwright suites in `tests/` exercise complete user journeys.

## Frontend Composition (`client/`)
- Vite + React 18 + TypeScript with Tailwind/Radix component library; aliases configured in `vite.config.ts` (`@`, `@shared`, `@assets`).
- React Query orchestrates data fetching and cache hydration across dashboards (`client/src/pages/dashboard.tsx`, `client/src/pages/project-page.tsx`).
- The resilient API client (`client/src/lib/api.ts`) centralises fetch behaviour: automatic bearer injection, retry/backoff for 429/5xx, token refresh orchestration, and file-upload helpers (`uploadFile`, `uploadTrialFile`).
- Authentication-aware hooks (`client/src/hooks/useOptimizedAuth.ts`, `client/src/hooks/useProjectSession.ts`) subscribe to `window` events emitted by the API client to keep UI session state in sync.
- Route-driven journeys (non-tech, business, technical, consultation) use modular step components under `client/src/pages/journeys/`, coordinating with Playwright fixtures for end-to-end automation.

## Backend Service Fabric (`server/index.ts`)
- Entry point wires middleware, OAuth, routing, websocket infrastructure, and long-running agent/tool initialization.
  - Runs environment validation via `server/services/production-validator.ts` before accepting traffic.
  - Sequentially initializes agents (`server/services/agent-initialization.ts`) and registers MCP tools (`registerCoreTools`, `initializeTools`).
  - Spins up Express HTTP server plus WebSocket bridge (`server/realtime.ts`) and injects the realtime instance into the project agent orchestrator (`server/services/project-agent-orchestrator.ts`).
  - Applies security middleware first (`server/middleware/security.ts`, `server/middleware/security-headers.ts`), then rate limiting, then domain routers (`server/routes/`).

## Security & Rate Limiting
- Helmet-based policy (`securityHeaders`) enforces CSP, HSTS, referrer, and permissions headers.
- Adaptive rate limiting (`server/middleware/security-headers.ts`, `server/middleware/rate-limiter.ts`):
  - Internal traffic bypass via signed header, user-agent markers, or health-check paths.
  - Per-user/client identity keys with IPv6-safe fallbacks using `ipKeyGenerator`, preventing the `ERR_ERL_KEY_GEN_IPV6` warning seen during the latest Playwright run.
  - Dedicated limiters for authentication, uploads, AI workloads, and admin surfaces with structured JSON responses/logging.
- Security logging middleware records slow or failing API calls, augmenting request logs emitted in `server/index.ts` for `/api/**` traffic.

## Authentication & Session Durability
- Passport sessions plus JWT bearer support; refresh endpoint added in `server/routes/auth.ts` to issue short-lived tokens backed by `tokenStorage`.
- The API client transparently refreshes tokens (`APIClient.refreshAuthToken`) and broadcasts `auth-token-*` events to keep hooks synchronised.
- Rate-limiter skip hooks allow trusted internal automation, while the default paths remain protected by auth checks (`ensureAuthenticated`).

## Multi-Agent System & MCP Tool Registry
- `ProjectAgentOrchestrator` coordinates Project Manager, Technical AI, and Business agents, persisting checkpoints per project and broadcasting realtime updates.
- Agent initialisation ensures each agent registers capabilities, communication routes, and tool permissions; orchestration logic stored in `server/services/project-manager-agent.ts`, `server/services/technical-ai-agent.ts`, `server/services/business-agent.ts`.
- Tool initialisation (`server/services/tool-initialization.ts`) and registry (`server/services/mcp-tool-registry.ts`) attach metadata (categories, permissions, billing hooks) to handlers in `server/services/real-tool-handlers.ts`.
- Every analysis, ML training, visualization, or business reporting path routes through the registry, enabling shared audit/billing instrumentation (`server/services/enhanced-billing-service.ts`).

## Data Ingestion & Analytics Pipeline
- Upload endpoints (`server/routes/projects.ts`) stream through `server/services/file-processor.ts` for validation, schema detection, and PII checks (`server/services/unified-pii-processor.ts`).
- Transformations and joins delegated to Spark when available (`server/services/spark-processor.ts`), otherwise run in Node/Python fallback with detailed logging for mock vs real execution.
- Statistical analysis, ML, and visualization orchestrated by tool handlers bridging to Python scripts (`python_scripts/data_analyzer.py`, `python/ml-analysis.py`, `python/visualization_generator.py`).
- Shared schema definitions and Drizzle models live in `shared/schema.ts`, keeping agents, API handlers, and UI forms aligned.

## Real-time Collaboration & Observability
- WebSocket server (`server/realtime.ts`) provides project-level channels for checkpoint updates, agent chatter, and user approvals.
- Redis-backed message broker/caches (`server/services/agent-message-broker.ts`, `server/services/enhanced-cache-service.ts`) activate automatically when `REDIS_ENABLED` or production mode is detected.
- Production readiness guard (`server/services/production-validator.ts`) runs at startup in every environment, warning about missing Python bridge, Spark cluster, or Redis connectivity.
- Structured logging across middleware and services highlights initialization milestones and security anomalies.

## Pricing, Billing, & Usage Tracking
- Subscription tiers defined in `shared/subscription-tiers.ts`; enhanced billing logic in `server/services/enhanced-billing-service.ts` reconciles quotas, overages, and cost estimation.
- Billing MCP resources (`server/services/mcp-billing-analytics-resource.ts`) expose usage metrics to agents and dashboards, while Playwright journeys validate UI flows (`tests/production-user-journeys.spec.ts`).

## Testing & Dataset Coverage
- Playwright config (`playwright.config.ts`) spins up `npm run dev`, using Chromium by default and reusing the dev server between tests.
- HR dataset journeys covered in `tests/hr-user-journeys-e2e.spec.ts` (EmployeeRoster.xlsx, HREngagementDataset.xlsx).
- SPTO survey workflow validated via `tests/e2e/agent-recommendation-e2e.spec.ts`, uploading `English Survey for Teacher Conferences Week Online (Responses).xlsx` and checking agent recommendations.
- Marketing campaign dataset is referenced in agent configuration (`server/services/project-manager-agent.ts`, `server/routes/template.ts`) but lacks a dedicated Playwright spec; current gap to address when extending dataset coverage.
- Vitest suites (`tests/unit/**`, `tests/integration/**`) coexist with legacy Jest-style API tests under `tests/e2e/user-journeys.test.ts`; running mixed contexts requires explicit Playwright file targeting to avoid `describe` reference errors.

## Recent Enhancements & Outstanding Risks
- Added IPv6-safe rate limiting keys and internal bypass logic, preventing Playwright startup failures caused by `ERR_ERL_KEY_GEN_IPV6`.
- Implemented resilient client/server token refresh loop (API client + `/api/auth/refresh`) and made rate-limit behaviour opt-out via `ENABLE_RATE_LIMITING`.
- Latest `npm run check` surfaced 484 TypeScript errors (duplicate exports in token storage, mismatched enum literals, missing props) that must be triaged before shipping.
- Targeted Playwright run (`tests/hr-user-journeys-e2e.spec.ts`) currently fails: registration forms time out on the confirm password field and `/journeys/.../prepare` navigation does not resolve within 10s. Investigate recent UI changes (journey selection flow or auth forms) before re-running HR datasets. SPTO workflow not executed in this session due to HR suite blocking earlier.
- Marketing campaign dataset lacks automated coverage; consider authoring a Playwright spec mirroring the HR suite once the navigation regressions are resolved.

## Next Steps
1. Resolve outstanding TypeScript compilation errors to unblock CI and ensure shared types match runtime data.
2. Debug the registration/journey routing regressions breaking the HR Playwright suite; re-run HR and SPTO datasets once fixed.
3. Author or revive an automated marketing campaign dataset journey to complete the requested dataset triad.
4. Backfill documentation with test remediation notes once journeys execute successfully.
