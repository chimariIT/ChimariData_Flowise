# CLAUDE.md

Guidance for Claude Code working with this repository.

**Last Updated**: March 24, 2026 | **Python Backend**: Port 8000 | **Client Port**: 5173

> **IMPORTANT**: This repository now uses the **Python FastAPI backend** as the primary backend. The legacy Node.js Express backend (port 5000) is still available but should only be used for rollback scenarios.

---

## Quick Start - Python Backend

```bash
# Terminal 1: Start Python Backend
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimaridata-python-backend
venv\Scripts\activate  # Windows
source venv/bin/activate  # Git Bash/Linux
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start Frontend (uses Vite proxy to Python backend on port 8000)
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimariapp2\ChimariData_Flowise-chimaridataApp2
npm run dev:frontend
```

**Verify Python Backend**: `curl http://localhost:8000/health`
**Frontend URL**: http://localhost:5173
**Python API Docs**: http://localhost:8000/docs

---

## Commands

```bash
# Development (Python Backend)
npm run dev:frontend           # Frontend only (Vite on :5173, proxies API to port 8000)

# Development (Legacy Node.js Backend - use only for rollback)
npm run dev                    # Start both Node.js server & client
npm run dev:server-only        # Node.js server only (port 5000)
npm run dev:client             # Client only (vite on :5173)

# Build
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
| **Backend (Primary)** | Python FastAPI + LangGraph (port 8000) |
| **Backend (Legacy)** | Express.js + TypeScript (port 5000) - rollback only |
| **Real-time** | WebSocket (Python backend: `/ws`, Node.js: `ws` library) |
| **Database** | PostgreSQL + pgvector (embeddings) |
| **ORM** | SQLAlchemy (Python), Drizzle (Node.js legacy) |
| **State** | React Query (@tanstack/react-query) |
| **Routing** | Wouter (client), FastAPI (Python), Express (Node.js legacy) |
| **Auth** | JWT (Python), Passport.js (Node.js legacy) |
| **AI** | Google Gemini (primary), OpenAI, Anthropic Claude |
| **Agents** | LangGraph agents (Python), EventEmitter (Node.js legacy) |
| **Payments** | Stripe with webhooks |
| **Email** | SendGrid |
| **Testing** | Playwright (E2E), Vitest (unit), Pytest (Python backend) |
| **Build** | Vite (client), uvicorn (Python), esbuild (Node.js) |

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
  routes/              # API route handlers (60 files)
  services/            # Business logic (169 files, PREFERRED location)
    agents/            # Agent message broker, realtime bridge
    billing/           # Unified billing service
    project-manager/   # PM agent modular components
    tools/             # Tool implementations
  middleware/          # Express middleware

shared/                # Schemas and types (Drizzle + Zod)
migrations/            # Database migration files
python/                # Main analysis scripts (primary)
python_scripts/        # Additional Python utilities
tests/                 # 148 test files (e2e, unit, integration)
docs/                  # 17 doc files + 340+ archived session docs
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
| Shared constants & helpers | `server/constants.ts` |
| Database connection pool | `server/db.ts` |

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

### Shared Constants (`server/constants.ts`)

Cross-cutting values that multiple modules must agree on are centralized here:
- `DATASET_DATA_ROW_CAP` (10,000) — enforced in ALL 3 storage implementations to prevent CSV upload timeouts
- `MIN_STATEMENT_TIMEOUT_MS` (60,000) — validated at DB pool startup in `server/db.ts`
- `generateStableQuestionId(projectId, text)` — canonical question ID generator (SHA-256 hash-based, replaces 3 competing patterns)

**NEVER duplicate these values inline.** Always import from `server/constants.ts`.

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
# Database (Shared by both backends)
DATABASE_URL="postgresql://..."        # Required

# AI Providers
GOOGLE_AI_API_KEY="..."                # Required (primary AI)
OPENAI_API_KEY="..."                   # Optional
ANTHROPIC_API_KEY="..."                # Optional

# Python Backend (Primary)
VITE_USE_PYTHON_BACKEND=true           # Enable Python backend
PYTHON_BACKEND_URL=http://localhost:8000

# Security
SESSION_SECRET="..."                   # Required (strong in production)
JWT_SECRET="..."                       # Required (strong in production)
ENABLE_MOCK_MODE="false"              # MUST be false in production
NODE_ENV="development"                 # development | staging | production
```

Production additionally requires: `REDIS_URL`, `STRIPE_SECRET_KEY`, `VITE_STRIPE_PUBLIC_KEY`, `SENDGRID_API_KEY`

### Windows Notes
- Use `python` instead of `python3`
- Python Backend: port 8000, Frontend: port 5173
- Use Git Bash or PowerShell for npm scripts

### Python Backend Setup

The Python backend is located in a separate repository: `chimaridata-python-backend`

```bash
# Clone and setup Python backend
cd C:\Users\scmak\Documents\Work\Projects\Chimari\chimaridata-python-backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
source venv/bin/activate  # Git Bash/Linux

# Install dependencies
pip install -r requirements.txt

# Setup database
alembic upgrade head

# Start backend
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Node.js Python Scripts (Legacy)
```bash
# For Node.js backend analysis scripts only
pip install -r python/requirements.txt   # Note: python/, not python_scripts/
```

---

## Python Backend (Primary)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Vite)                         │
│                    http://localhost:5173                    │
│                                                             │
│  Vite Proxy: /api/* and /ws/* → http://localhost:8000      │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Python FastAPI Backend                         │
│              http://localhost:8000                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FastAPI Application                                │   │
│  │  - REST API (/api/v1/*)                            │   │
│  │  - WebSocket (/ws)                                 │   │
│  │  - Swagger UI (/docs)                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │   Agent    │  │  Semantic  │  │   Transformation    │  │
│  │ Orchestrator│  │  Matching  │  │      Engine        │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐  │
│  │  Analysis  │  │    RAG     │  │   Billing & RBAC    │  │
│  │ Execution  │  │ Evidence   │  │                     │  │
│  └────────────┘  └────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL + pgvector                          │
│              localhost:5432                                 │
└─────────────────────────────────────────────────────────────┘
```

### Python Backend API Endpoints

**Health Check**: `GET /health`

**Projects**: `GET /api/v1/projects`, `POST /api/v1/projects`, `GET /api/v1/projects/{id}`

**Datasets**: `POST /api/v1/projects/{id}/upload`, `GET /api/v1/datasets/{id}`

**Analysis**: `POST /api/v1/analysis/execute`, `GET /api/v1/analysis/{id}/status`

**Admin**: `GET /api/v1/admin/overview`, `GET /api/v1/admin/users`

**Knowledge**: `POST /api/v1/knowledge/search`, `GET /api/v1/knowledge/nodes/{id}/related`

**Billing**: `GET /api/v1/billing/tiers`, `GET /api/v1/billing/invoices`

**WebSocket**: `ws://localhost:8000/ws/{session_id}`

### Python Backend Features

| Feature | Status | Notes |
|---------|--------|-------|
| User Authentication | ✅ | JWT-based, compatible with frontend tokens |
| Project Management | ✅ | CRUD operations, journey progress tracking |
| Dataset Upload | ✅ | CSV, Excel, JSON with validation |
| PII Detection | ✅ | Automated PII scanning and masking |
| Data Transformation | ✅ | Column mappings, data type conversions |
| Analysis Execution | ✅ | Descriptive stats, correlation, regression, clustering |
| Agent Orchestrator | ✅ | LangGraph-based multi-agent system |
| Knowledge Graph | ✅ | RAG with vector embeddings (pgvector) |
| Billing & Subscriptions | ✅ | Stripe integration, tier management |
| RBAC | ✅ | Role-based access control for admin |
| WebSocket Updates | ✅ | Real-time progress and agent updates |

### Python Backend Configuration

Environment variables for `chimaridata-python-backend/.env`:

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/chimaridata_dev

# JWT
JWT_SECRET=your_jwt_secret_here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# AI
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AIzaSy...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=100
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
| **Python Backend** | |
| Python backend won't start | Check dependencies: `pip install -r requirements.txt` |
| Python health check fails | `curl http://localhost:8000/health` |
| Python API returns 404 | Check API prefix: `/api/v1/*` (Python) vs `/api/*` (Node.js) |
| WebSocket not connecting | Check Python backend `/ws` endpoint is running |
| Agent orchestration errors | Check LangGraph dependencies and agent configuration |
| **Frontend** | |
| API calls go to wrong port | Check `vite.config.ts` proxy (should be port 8000) |
| CORS errors | Verify `ALLOWED_ORIGINS` in Python backend `.env` |
| Auth token not sent | Check `Authorization` header in browser DevTools Network tab |
| Stale data after step transitions | `refetchOnMount: 'always'` on React Query hooks |
| **Node.js Backend (Legacy)** | |
| Server won't start | Check startup logs: validation -> Python pool -> agents -> tools -> WebSocket |
| Schema changes not applied | Run `npm run db:push`, then restart server |
| Agent tools not working | Verify `initializeTools()` runs before `initializeAgents()` |
| WebSocket messages missing | Uses `ws` library. Check `realtime-agent-bridge.ts` |
| Mock data in results | Set `ENABLE_MOCK_MODE=false`, verify AI API keys |
| Redis errors (dev) | Set `REDIS_ENABLED=false` for in-memory fallback |
| Python scripts failing | Verify `python --version`, install deps from `python/requirements.txt` |
| Duplicate service files | Check BOTH `server/*.ts` and `server/services/*.ts` |

### Frontend Proxy Verification

Check that frontend is proxying to Python backend:

1. **Browser DevTools → Network Tab**:
   - Look for requests to `http://localhost:5173/api/*`
   - These should be proxied to `http://localhost:8000`

2. **Vite Config** (`vite.config.ts`):
   ```typescript
   proxy: {
     '/api': {
       target: 'http://localhost:8000',  // Python backend
       // ...
     }
   }
   ```

3. **Environment Variable** (`.env.development`):
   ```bash
   VITE_USE_PYTHON_BACKEND=true
   PYTHON_BACKEND_URL=http://localhost:8000
   ```

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

**Python Backend (Primary)**:
- [ ] Python backend running on port 8000
- [ ] Database migrations applied: `alembic upgrade head`
- [ ] All AI provider keys set in Python backend `.env`
- [ ] JWT secret matches frontend configuration
- [ ] CORS origins include production domain
- [ ] Stripe production keys configured
- [ ] Redis configured for production (`REDIS_URL`)
- [ ] WebSocket enabled (`/ws` endpoint)
- [ ] Health check endpoint responds: `curl https://api.chimaridata.com/health`

**Frontend**:
- [ ] `VITE_USE_PYTHON_BACKEND=true` in production build
- [ ] API base URL points to production backend
- [ ] `npm run build` completes without errors
- [ ] All tests pass: `npm run test:production`

**Node.js Backend (Legacy)**:
- [ ] (Only if needed for rollback) `NODE_ENV=production`, `ENABLE_MOCK_MODE=false`
- [ ] (Only if needed) Strong `SESSION_SECRET` and `JWT_SECRET`
- [ ] (Only if needed) Rate limiting enabled
- [ ] (Only if needed) Server startup validation passes

---

## Documentation Index

| Document | Purpose |
|----------|---------|
| **Python Backend** | |
| `verify-python-backend.md` | Frontend → Python backend connection guide |
| `client/PYTHON_BACKEND_INTEGRATION_SUMMARY.md` | Python backend integration completion summary |
| `MIGRATION_PROGRESS.md` | Frontend migration progress tracking |
| `PYTHON_BACKEND_REQUIREMENTS.md` | Python backend requirements specification |
| **Frontend** | |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Tech stack, data models, API routes, deployment |
| [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md) | Journey types, workflows, analysis components |
| [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md) | Subscriptions, payments, admin features |
| [docs/ADMIN_INTERFACE.md](docs/ADMIN_INTERFACE.md) | All 11 admin UI pages, routing, architecture |
| **Node.js Backend (Legacy)** | |
| [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) | Agents, tools, MCP, coordination workflows |
| [docs/AGENTIC_ORCHESTRATION_DESIGN.md](docs/AGENTIC_ORCHESTRATION_DESIGN.md) | Dynamic tool discovery design |
| [docs/U2A2A2U_COMPLETE_DATA_FLOW.md](docs/U2A2A2U_COMPLETE_DATA_FLOW.md) | U2A2A2U pipeline data flow |
| [docs/ADMIN_API_REFERENCE.md](docs/ADMIN_API_REFERENCE.md) | 165+ admin API endpoints reference |
| [docs/MCP_TOOL_STATUS.md](docs/MCP_TOOL_STATUS.md) | 130+ MCP tool implementation status matrix |
| [docs/SYSTEM_STATUS.md](docs/SYSTEM_STATUS.md) | System health, phase completion |
| **Other** | |
| [FIX_PLANS.md](FIX_PLANS.md) | Fix specifications (P0-P3 priorities) |
| [DOCKER-SETUP.md](DOCKER-SETUP.md) | Docker and Redis setup |
| [STRIPE-INTEGRATION.md](STRIPE-INTEGRATION.md) | Payment integration details |
| [docs/archives/](docs/archives/) | 340+ historical session docs |
