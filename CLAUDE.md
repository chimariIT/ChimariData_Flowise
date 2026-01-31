# CLAUDE.md

Guidance for Claude Code working with this repository.

**Last Updated**: January 29, 2026 | **Server Port**: 5000 | **Client Port**: 5173

---

## Commands

```bash
# Development
npm run dev                    # Start both client & server
npm run dev:server-only        # Server only
npm run dev:client             # Client only (vite on :5173)
npm run build                  # Production build
npm run start                  # Start production server
npm run check                  # TypeScript type checking (8GB heap)
npm run check:client           # TypeScript check client only

# Database (CRITICAL: always run db:push after schema changes)
npm run db:push               # Push schema changes to DB
npm run db:migrate            # Run migrations

# Testing
npm run test:user-journeys    # Critical user journey tests (run before changes)
npm run test:production       # Full production test suite
npm run test:unit             # Vitest unit tests
npm run test:backend          # Backend tests (Vitest)
npm run test:client           # Client tests (Vitest)
npm run test                  # All Playwright E2E tests

# Single test execution
npx playwright test tests/some-test.spec.ts       # Single Playwright file
npx vitest run tests/unit/services/some.test.ts   # Single Vitest file
npx playwright test -g "pattern"                   # Tests matching pattern
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript, Vite, Tailwind CSS + Radix UI |
| **Backend** | Express.js + TypeScript |
| **Real-time** | WebSocket via `ws` library (NOT Socket.IO) |
| **Database** | PostgreSQL + Drizzle ORM |
| **State** | React Query (@tanstack/react-query) |
| **Routing** | Wouter (client), Express (server) |
| **Auth** | Passport.js (Google, GitHub, Microsoft, Apple, local) |
| **AI** | Google Gemini (primary), OpenAI, Anthropic Claude |
| **Payments** | Stripe with webhooks |
| **Email** | SendGrid |
| **Cache** | Redis (optional dev, required production) via ioredis |
| **Testing** | Playwright (E2E), Vitest (unit/integration) |
| **Build** | Vite (client), esbuild (server) |
| **Python** | Analysis scripts in `python/` (stats, ML, forecasting) |

**Import Aliases** (client-side only via Vite):
- `@` -> `client/src`
- `@shared` -> `shared`
- `@assets` -> `attached_assets`

---

## Directory Structure

```
client/src/
  components/          # Reusable UI components
  pages/               # Route-level page components
  hooks/               # Custom React hooks
  lib/                 # API client, utils, realtime

server/
  routes/              # API route handlers (64 files)
  services/            # Business logic (150 files, PREFERRED location)
    agents/            # Agent message broker, realtime bridge
    billing/           # Unified billing service
    project-manager/   # PM agent modular components
    tools/             # Tool implementations
  middleware/          # Express middleware

shared/                # Schemas and types (Drizzle + Zod)
migrations/            # Database migration files
python/                # Main analysis scripts (primary)
python_scripts/        # Additional Python utilities
tests/                 # 114 test files (e2e, unit, integration)
docs/                  # 13 doc files + 148+ archived session docs
```

---

## Critical File Locations

| What | Location |
|------|----------|
| Database schema (Drizzle + Zod) | `shared/schema.ts` |
| Journey templates | `shared/journey-templates.ts` |
| Canonical types | `shared/canonical-types.ts` |
| Main server entry | `server/index.ts` |
| Storage layer | `server/storage.ts` |
| Client API wrapper | `client/src/lib/api.ts` |
| WebSocket client | `client/src/lib/realtime.ts` |
| Main app routes | `client/src/App.tsx` |
| Tool registry | `server/services/mcp-tool-registry.ts` |
| Semantic pipeline | `server/services/semantic-data-pipeline.ts` |
| Analysis execution | `server/services/analysis-execution.ts` |
| Cost estimation | `server/services/cost-estimation-service.ts` |
| Data accessor (SSOT) | `server/services/data-accessor.ts` |
| Auth routes | `server/routes/auth.ts` |
| Project ownership | `server/middleware/ownership.ts` |
| Payment routes | `server/routes/payment.ts` |
| Production validator | `server/services/production-validator.ts` |

---

## Architecture Principles

### Single Source of Truth (SSOT)

`journeyProgress` (JSONB on `projects` table) is the SSOT for all user journey state:
- PII decisions: read from `journeyProgress.piiDecision` first, fallback to `project.metadata`
- Cost estimates: locked in `journeyProgress`, not recalculated
- Requirements document: persisted to `journeyProgress`
- Execution config, translated results, business impact: all in `journeyProgress`

Backend services must read from `journeyProgress` first, with fallback to legacy locations.

### Analysis Data Source Priority

In `extractDatasetRows()` (`server/services/analysis-execution.ts`):
1. `dataset.ingestionMetadata.transformedData` (user-approved transformations)
2. `dataset.metadata.transformedData` (alternate location)
3. Original `dataset.data` / `dataset.preview` (fallback)

### Analysis Execution

Uses `executeComprehensiveAnalysis()` which routes to type-specific Python scripts via DataScienceOrchestrator:
- `python/correlation_analysis.py`, `regression_analysis.py`, `clustering_analysis.py`, `time_series_analysis.py`, `descriptive_stats.py`

Do NOT use `executeAnalysis()` (legacy, hardcoded basic stats only).

### Service File Locations

Some services exist in BOTH `server/*.ts` and `server/services/*.ts`. Always:
1. Check BOTH locations when modifying
2. Prefer `server/services/` for new code
3. Search across `server/` to find all instances

---

## Multi-Agent System

Six specialized agents coordinated through a message broker:

1. **Project Manager** - End-to-end orchestration
2. **Data Scientist** - Statistical analysis, ML models
3. **Business Agent** - Industry expertise, KPIs, audience translation
4. **Data Engineer** - Data quality, ETL pipelines
5. **Template Research** - Industry-specific templates
6. **Customer Support** - Knowledge base, diagnostics

Key patterns:
- Agents access capabilities via **Tool Registry** (`mcp-tool-registry.ts`), never directly
- Message broker: EventEmitter in dev, Redis in production
- Real-time updates: `ws` library through `realtime-agent-bridge.ts`
- PM coordinates: User Questions -> Researcher -> DS -> DE -> Analysis -> BA Translation

See [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) for full details.

---

## Data Flow Pipeline

```
Data Upload -> Verification -> Transformation -> Analysis Execution -> Results
  datasets      PII detection    transformedData    analysisResults     artifacts
   table        quality checks   in ingestionMeta    in projects      project_artifacts
```

| Step | Frontend | Backend | Storage |
|------|----------|---------|---------|
| Upload | `data-step.tsx` | `POST /api/projects/:id/upload` | `datasets`, `uploads/originals/` |
| Verify | `data-verification-step.tsx` | `PUT /api/projects/:id/verify` | `journeyProgress` |
| Transform | `data-transformation-step.tsx` | `POST /api/projects/:id/execute-transformations` | `datasets.ingestionMetadata.transformedData` |
| Execute | `execute-step.tsx` | `POST /api/analysis-execution/execute` | `projects.analysisResults` |
| Results | `results-step.tsx` | `GET /api/projects/:id/artifacts` | `project_artifacts` |

Payment gates: execution requires payment (402 if unpaid), results return preview-only when unpaid.

---

## Authentication & Security

```typescript
// Protected route pattern
import { ensureAuthenticated } from './routes/auth';
import { canAccessProject } from '../middleware/ownership';

router.post('/api/feature/:id/action', ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;

  const access = await canAccessProject(userId, req.params.id, isAdmin);
  if (!access.allowed) {
    return res.status(403).json({ success: false, error: access.reason });
  }
  // ... use access.project
});
```

No mock auth middleware exists. All auth uses real Passport.js.

---

## Environment Setup

Required `.env` variables (see `.env.example` for full list):

```bash
DATABASE_URL="postgresql://..."        # Required
GOOGLE_AI_API_KEY="..."                # Required (primary AI)
SESSION_SECRET="..."                   # Required (strong in production)
JWT_SECRET="..."                       # Required (strong in production)
ENABLE_MOCK_MODE="false"              # MUST be false in production
NODE_ENV="development"                 # development | staging | production
```

Production additionally requires: `REDIS_URL`, `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLIC_KEY`, `SENDGRID_API_KEY`

### Windows Notes
- Use `python` instead of `python3`
- Server: port 5000, Client: port 5173
- Use Git Bash or PowerShell for npm scripts

### Python Setup
```bash
pip install -r python/requirements.txt   # Note: python/, not python_scripts/
```

---

## Common Patterns

### Database Schema Changes
```bash
# 1. Edit shared/schema.ts
# 2. Push to database (CRITICAL - do not skip)
npm run db:push
# 3. Restart dev server
```

### Adding an Agent Tool
```typescript
// Register in server/services/mcp-tool-registry.ts
toolRegistry.register({
  name: 'my_tool',
  description: '...',
  inputSchema: { /* Zod schema */ },
  permissions: ['data_scientist', 'project_manager'],
  handler: async (input) => { /* implementation */ }
});
// Agents call via executeTool('my_tool', { ... }) - NEVER call services directly
```

### Type Safety with storage.updateProject()
```typescript
// Drizzle table has more columns than the Zod schema exposes
// Use 'as any' for fields not in the Zod schema
storage.updateProject(id, { status: 'ready' } as any);
```

---

## Debugging

| Problem | Check |
|---------|-------|
| Server won't start | Check startup logs: validation -> Python pool -> agents -> tools -> WebSocket |
| Schema changes not applied | Run `npm run db:push`, then restart server |
| Agent tools not working | Verify `initializeTools()` runs before `initializeAgents()` in `server/index.ts` |
| WebSocket messages missing | Uses `ws` (NOT Socket.IO). Check `realtime-agent-bridge.ts` and `client/src/lib/realtime.ts` |
| Mock data in results | Set `ENABLE_MOCK_MODE=false`, verify AI API keys, check Python scripts run |
| Redis errors (dev) | Set `REDIS_ENABLED=false` for in-memory fallback |
| 401/403 errors | Use `ensureAuthenticated` + `canAccessProject()`, admin bypass via `isAdmin` |
| Python scripts failing | Verify `python --version`, install deps from `python/requirements.txt` |
| Duplicate service files | Check BOTH `server/*.ts` and `server/services/*.ts` |
| Stale data after step transitions | `refetchOnMount: 'always'` on React Query hooks; invalidate cache on navigation |

---

## Decision Tree

| Task | Go to |
|------|-------|
| Add analysis type | [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md) |
| Modify agents | [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) |
| Change DB schema | Edit `shared/schema.ts` then `npm run db:push` |
| Add agent tools | [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) |
| Billing/admin | [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md) |
| Architecture details | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Deploy to production | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) + checklist below |
| Data pipeline | `server/services/semantic-data-pipeline.ts` |

---

## Production Checklist

- [ ] `NODE_ENV=production`, `ENABLE_MOCK_MODE=false`
- [ ] Strong `SESSION_SECRET` and `JWT_SECRET`
- [ ] Redis configured (`REDIS_URL`)
- [ ] All AI provider keys set
- [ ] Stripe production keys configured
- [ ] Rate limiting enabled (`ENABLE_RATE_LIMITING=true`)
- [ ] Webhook verification enabled
- [ ] `npm run db:push` applied to production DB
- [ ] `npm run test:production` passes
- [ ] Grep for "mock", "simulated" - none in user-facing code
- [ ] Python scripts execute correctly
- [ ] Server startup validation passes (exits code 1 on failure)

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, data models, API routes, deployment |
| [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) | Agents, tools, MCP, coordination workflows |
| [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md) | Journey types, workflows, analysis components |
| [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md) | Subscriptions, payments, admin features |
| [docs/SYSTEM_STATUS.md](docs/SYSTEM_STATUS.md) | System health, phase completion |
| [FIX_PLANS.md](FIX_PLANS.md) | Fix specifications (P0-P3 priorities) |
| [DOCKER-SETUP.md](DOCKER-SETUP.md) | Docker and Redis setup |
| [STRIPE-INTEGRATION.md](STRIPE-INTEGRATION.md) | Payment integration details |
| [docs/archives/](docs/archives/) | 148+ historical session docs |
