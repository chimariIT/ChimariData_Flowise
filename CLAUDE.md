# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Last Updated**: January 22, 2026 | **Status**: Active Development | **Server Port**: 5000 | **Client Port**: 5173

---

## 📚 Documentation Structure

This documentation is split into focused guides for easier navigation:

- **[CLAUDE.md](CLAUDE.md)** ← You are here - Quick reference and essential commands
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - High-level architecture, tech stack, data models
- **[docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md)** - Agents, tools, MCP integration, coordination
- **[docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md)** - Journey types, workflows, analysis components
- **[docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md)** - Billing, subscriptions, admin features

---

## 🚀 Quick Reference

### Essential Commands

```bash
# Development
npm run dev                    # Start dev server (both client & server)
npm run dev:server-only        # Server only (when client not needed)
npm run dev:client             # Client only (vite on :5173)
npm run build                  # Production build (vite + esbuild for server)
npm run start                  # Start production server
npm run check                  # TypeScript type checking (all files, 8GB heap)
npm run check:client           # TypeScript check for client only

# Database
npm run db:push               # Push schema changes (drizzle-kit up:pg)
npm run db:migrate            # Run database migrations
npm run db:migrate:project-states  # Apply project state migrations

# Testing - Critical Before Changes
npm run test:user-journeys    # Run critical user journey tests
npm run test:production       # Full production test suite
npm run test:unit             # Vitest unit tests
npm run test:unit-watch       # Vitest in watch mode
npm run test                  # All Playwright E2E tests

# Testing Specific Areas
npm run test:unit:agents      # Agent-specific unit tests
npm run test:integration      # Integration tests
npm run test:integration:agents # Agent integration tests
npm run test:backend          # Backend tests (Vitest)
npm run test:backend-watch    # Backend tests in watch mode
npm run test:client           # Client tests (Vitest)

# E2E Tests
npm run test:e2e-tools        # End-to-end tool integration tests
npm run test:e2e-tools-headed # With browser UI
npm run test:e2e-tools-debug  # Debug mode
npm run test:e2e-agents       # Multi-agent upload flow E2E tests
npm run test:e2e-agents-headed # With browser UI
npm run test:e2e-agents-debug # Debug mode

# Granular Feature Tests
npm run test:auth             # Authentication smoke tests
npm run test:auth-serial      # Auth tests single-worker (debugging)
npm run test:nav              # Navigation smoke tests
npm run test:nav-serial       # Nav tests single-worker (debugging)
npm run test:dashboard        # Dashboard tests
npm run test:dashboard-auth   # Dashboard authenticated tests
npm run test:routes-auth      # Protected routes tests
npm run test:enhanced-features # Enhanced feature tests
npm run test:dynamic-templates # Template engine tests

# Production Tests
npm run test:production-users # Production user journey tests
npm run test:production-admin # Admin billing tests
npm run test:production-agents # Agent & tool management tests

# Running Single Tests
npx playwright test tests/user-journey-screenshots.spec.ts  # Single Playwright file
npx vitest run tests/unit/services/question-answer.test.ts  # Single Vitest file
npx playwright test -g "data upload"                        # Tests matching pattern
npx vitest run --testNamePattern="should generate"          # Vitest pattern match
```

### Critical File Locations (Quick Lookup)

| What | Location |
|------|----------|
| **Database schema (Drizzle + Zod)** | `shared/schema.ts` |
| **Journey templates** | `shared/journey-templates.ts` |
| **Canonical types** | `shared/canonical-types.ts` |
| **Main server entry** | `server/index.ts` |
| **API routes** | `server/routes/*.ts` (57 files) |
| **Business services** | `server/services/*.ts` (PREFERRED location) |
| **Agent implementations** | `server/services/*-agent.ts` |
| **Tool registry** | `server/services/mcp-tool-registry.ts` |
| **Semantic pipeline** | `server/services/semantic-data-pipeline.ts` |
| **Embedding service** | `server/services/embedding-service.ts` |
| **Storage layer** | `server/storage.ts` |
| **Client API wrapper** | `client/src/lib/api.ts` |
| **React Query client** | `client/src/lib/queryClient.ts` |
| **WebSocket client** | `client/src/lib/realtime.ts` |
| **Main app routes** | `client/src/App.tsx` |
| **Payment status banner** | `client/src/components/PaymentStatusBanner.tsx` |
| **Payment routes** | `server/routes/payment.ts` |
| **Analysis payment** | `server/routes/analysis-payment.ts` |
| **Cost estimation service** | `server/services/cost-estimation-service.ts` |
| **Feature gate middleware** | `server/middleware/feature-gate.ts` |
| **Clarification service** | `server/services/clarification-service.ts` |
| **Fix plans documentation** | `FIX_PLANS.md` |
| **Platform fix plans (Jan 21-22)** | `PLATFORM_FIX_PLAN_JAN21.md`, `COMPREHENSIVE_PLATFORM_FIX_PLAN.md` |
| **Production readiness report** | `PRODUCTION_READINESS_REPORT.md` |

### Quick Decision Tree

**Adding a new analysis type?**
→ See [docs/USER_JOURNEYS.md - Adding New Analysis Features](docs/USER_JOURNEYS.md#adding-new-analysis-features)

**Modifying agents?**
→ See [docs/AGENTIC_SYSTEM.md - Agent Development](docs/AGENTIC_SYSTEM.md#agent-development)

**Changing database schema?**
→ Edit `shared/schema.ts` then run `npm run db:push` (**CRITICAL** - do not skip this step)
→ For complex migrations, create SQL files in `migrations/` directory
→ Baseline migration is idempotent (safe to run multiple times)
→ See [docs/ARCHITECTURE.md - Database Schema](docs/ARCHITECTURE.md#database-schema)

**Adding new tools for agents?**
→ See [docs/AGENTIC_SYSTEM.md - Tool Registry](docs/AGENTIC_SYSTEM.md#tool-registry)

**Production deployment?**
→ See [Environment Setup](#environment-setup) and [Production Checklist](#production-deployment-checklist)

**Mock data issues?**
→ See [Common Debugging Scenarios](#common-debugging-scenarios)

**Billing or admin features?**
→ See [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md)

**Working with data-to-transformation pipeline?**
→ Use semantic pipeline: `server/services/semantic-data-pipeline.ts`
→ API: `POST /api/semantic-pipeline/:id/run-full-pipeline`
→ See [docs/VECTOR_DATA_PIPELINE_DESIGN.md](docs/VECTOR_DATA_PIPELINE_DESIGN.md)

---

## 🏗️ Technology Stack Overview

- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS + Radix UI
- **Backend**: Express.js + TypeScript, WebSocket (`ws` library, NOT Socket.IO) for real-time updates
- **Database**: PostgreSQL with Drizzle ORM (pgvector extension planned for semantic search)
- **Big Data**: Apache Spark for distributed processing and ML at scale
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: Wouter (lightweight React router ~1.2KB)
- **Authentication**: Passport.js with OAuth providers (Google, GitHub, Microsoft, Apple) + local auth
- **AI Providers**: Google Gemini (primary), OpenAI, Anthropic Claude
- **Payment Processing**: Stripe with webhook support
- **Email**: SendGrid for transactional emails
- **Session Storage**: PostgreSQL-backed sessions (connect-pg-simple)
- **Caching**: Redis (optional in dev, required in production) with ioredis client
- **Testing**: Playwright (E2E), Vitest (unit/integration)
- **Build**: Vite (client), esbuild (server)

**Key Config Files**: `playwright.config.ts`, `vitest.config.ts`, `vitest.backend.config.ts`, `vite.config.ts`, `tsconfig.json`, `drizzle.config.ts`

**Import Aliases** (Vite only, client-side):
- `@` → `client/src`
- `@shared` → `shared`
- `@assets` → `attached_assets`

**→ Full details:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 📂 Directory Structure Snapshot

```
client/                 # React frontend application
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/          # Route-level page components
│   ├── hooks/          # Custom React hooks
│   └── lib/            # Utility functions and API client

server/                 # Express.js backend with TypeScript
├── routes/             # API route handlers (57 route files)
├── services/           # Business logic and integrations (PREFERRED)
│   ├── agents/         # Agent message broker, realtime bridge
│   ├── billing/        # Unified billing service
│   └── project-manager/ # PM agent modular components
└── middleware/         # Express middleware functions

shared/                 # Shared TypeScript schemas and types (Zod)
migrations/             # Database migration files
python/                 # Python analysis scripts (12 scripts)
python_scripts/         # Additional Python utilities (7 scripts)
tests/                  # E2E and integration tests (99 test files)
├── unit/               # Vitest unit tests
├── integration/        # Integration tests
└── e2e/agents/         # Multi-agent E2E tests
```

**→ Full architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🤖 Agentic System Quick Reference

The platform uses a **multi-agent architecture** with specialized agents coordinated through a message broker:

### Available Agents

1. **Project Manager Agent** - End-to-end orchestration
2. **Data Scientist Agent** - Statistical analysis, ML models
3. **Business Agent** - Industry expertise, compliance
4. **Data Engineer Agent** - Data quality, ETL pipelines
5. **Template Research Agent** - Industry-specific templates
6. **Customer Support Agent** - Knowledge base, diagnostics

### Critical Architecture Patterns

- **Tool-Based Architecture**: Agents access capabilities through Tool Registry, never directly
- **Message Broker**: EventEmitter-based coordination (Redis in production)
- **WebSocket Communication**: Real-time agent-to-user updates using `ws` library (NOT Socket.IO)
  - Server: `server/services/agents/realtime-agent-bridge.ts` (note: uses 'realtime-agent-bridge', not 'realtime-bridge')
  - Message Broker: `server/services/agents/agent-message-broker.ts` coordinates events
  - WebSocket Server: `server/index.ts` manages WebSocket connections via `ws` library
  - Client: `client/src/lib/realtime.ts` subscribes to events and updates UI
- **Ownership Verification**: Admin bypass for project access
- **IPv6-Safe Rate Limiting**: Rate limiting supports both IPv4 and IPv6 addresses

**→ Complete guide:** [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md)

---

## 📊 Data Flow Architecture

### User Journey Data Pipeline

```
┌─────────────┐    ┌──────────────────┐    ┌────────────────────┐    ┌───────────────────┐    ┌─────────┐
│ Data Upload │───▶│ Data Verification│───▶│ Data Transformation│───▶│ Analysis Execution│───▶│ Results │
└─────────────┘    └──────────────────┘    └────────────────────┘    └───────────────────┘    └─────────┘
      │                    │                        │                         │                    │
      ▼                    ▼                        ▼                         ▼                    ▼
   datasets         Quality checks          transformedData            analysisResults       artifacts
    table           PII detection         in ingestionMetadata          in projects        project_artifacts
```

### Key Integration Points

| Step | Frontend | Backend | Storage |
|------|----------|---------|---------|
| **Data Upload** | `data-step.tsx` | `POST /api/projects/:id/upload` | `datasets` table, `uploads/originals/` |
| **Verification** | `data-verification-step.tsx` | `PUT /api/projects/:id/verify` | `projects.journeyProgress` |
| **Transformation** | `data-transformation-step.tsx` | `POST /api/projects/:id/execute-transformations` | `datasets.ingestionMetadata.transformedData` |
| **Analysis** | `execute-step.tsx` | `POST /api/analysis-execution/execute` | `projects.analysisResults` |
| **Results** | `results-step.tsx`, `project-page.tsx` | `GET /api/projects/:id/artifacts` | `project_artifacts` table |

### Critical Data Locations

```typescript
// Transformed data (after user approves transformations)
dataset.ingestionMetadata.transformedData  // Array of transformed rows

// Analysis results (after execution)
project.analysisResults = {
  insights: [...],
  recommendations: [...],
  visualizations: [...],
  questionAnswers: [...]  // AI-generated answers to user questions
}

// Generated artifacts
uploads/artifacts/{projectId}/
├── {projectId}-report.pdf
├── {projectId}-presentation.pptx
├── {projectId}-data.csv
└── {projectId}-data.json
```

### Multi-Dataset Joining

When multiple datasets are uploaded:
1. **Auto-detection**: `autoDetectJoinKeys()` in `data-transformation-step.tsx` finds matching columns
2. **Join patterns**: Looks for `id`, `key`, `code`, `employee_id`, `user_id`, `department` columns
3. **Configuration**: `joinConfig` sent to `POST /api/projects/:id/execute-transformations`
4. **Execution**: Backend performs LEFT JOIN using foreign key mappings

### Analysis Data Source Priority

In `server/services/analysis-execution.ts`, `extractDatasetRows()` uses this priority:
1. **First**: `dataset.ingestionMetadata.transformedData` (user-approved transformations)
2. **Second**: `dataset.metadata.transformedData` (alternate location)
3. **Fallback**: Original `dataset.data`, `dataset.preview`, etc.

**→ Full architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 🌍 Environment Setup

### Required Environment Variables

Create `.env` file from `.env.example`:

```bash
# Environment
NODE_ENV=development                           # development | staging | production

# Required - Database
DATABASE_URL="postgresql://user:pass@host:port/db"

# Required - AI Provider Keys (at least one)
GOOGLE_AI_API_KEY="..."                       # Primary AI provider
OPENAI_API_KEY="..."                          # Optional fallback
ANTHROPIC_API_KEY="..."                       # Optional fallback

# Security Settings (CRITICAL - use strong secrets in production)
SESSION_SECRET="your_session_secret_change_in_production"
JWT_SECRET="your_jwt_secret_change_in_production"

# Optional in Development, Required in Production
REDIS_ENABLED="false"                         # Enable Redis (auto-true in production)
REDIS_URL="redis://localhost:6379"

# Payment Processing (Required in production)
STRIPE_SECRET_KEY="sk_test_..."
VITE_STRIPE_PUBLIC_KEY="pk_test_..."

# Email Services (Required in production)
SENDGRID_API_KEY="SG..."
FROM_EMAIL="noreply@chimaridata.com"

# Feature Flags
ENABLE_MOCK_MODE="true"                       # MUST be false in production
ENABLE_DEBUG_LOGGING="true"
ENABLE_RATE_LIMITING="false"                  # Enable in production
```

**→ Full environment guide:** See `.env.example` for all variables

### Redis Setup

**Development**: Redis is optional with automatic fallback to in-memory EventEmitter

```bash
docker-compose -f docker-compose.dev.yml up -d
# Set REDIS_ENABLED=true in .env
npm run dev
```

**Production**: Redis is **required** for distributed caching and agent coordination

**→ Detailed setup:** [DOCKER-SETUP.md](DOCKER-SETUP.md)

### Python Environment

**Required for**: Statistical analysis, ML models, time series forecasting (Prophet), data processing

```bash
# Install Python 3.8+
# Check installation
python --version  # or python3 --version

# Install Python dependencies
pip install -r python/requirements.txt

# Key dependencies include:
# - pandas, numpy, scipy (data processing)
# - scikit-learn (ML models)
# - statsmodels (statistical models)
# - prophet (time series forecasting)
# - matplotlib, seaborn (visualizations)
```

**Python Script Locations**:
- `python/` - Main analysis scripts (12 scripts) - **primary location**
- `python_scripts/` - Additional utility scripts (7 scripts)

**Windows Note**: May need to use `python` instead of `python3` and ensure Python is in PATH

### Windows-Specific Development Notes

This codebase runs on Windows. Key considerations:

- **Python Command**: Use `python` instead of `python3` in most cases
- **Path Separators**: Node.js scripts use forward slashes internally, but Git Bash or PowerShell work fine
- **Directory Listing**: Use `dir` in CMD or `ls` in PowerShell/Git Bash
- **Environment Variables**: Ensure `.env` file uses proper line endings (LF preferred, CRLF acceptable)
- **Port Conflicts**: Check Task Manager for processes using ports 5000 (server) or 5173 (Vite client)
  - Server runs on PORT=5000 (not 3000)
  - Client (Vite) runs on port 5173
- **Shell Commands**: Use Git Bash or PowerShell for running npm scripts with Unix-style commands

---

## 🔒 Authentication & Security

### Authentication Pattern

**Location**: `server/routes/auth.ts` (real authentication - ALWAYS use this)

⚠️ **IMPORTANT**: Mock authentication middleware was deleted. All authentication must use real Passport.js-based auth.

```typescript
import { ensureAuthenticated } from './routes/auth';

router.get('/protected-route', ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;
  // ... handler logic
});
```

**Supported OAuth Providers**:
- Google OAuth 2.0
- GitHub OAuth
- Microsoft OAuth
- Apple OAuth
- Local username/password (with bcrypt hashing)

### Ownership Verification

**Location**: `server/middleware/ownership.ts`

```typescript
import { canAccessProject } from '../middleware/ownership';

const accessCheck = await canAccessProject(userId, projectId, isAdmin);
if (!accessCheck.allowed) {
  return res.status(403).json({ success: false, error: accessCheck.reason });
}
const project = accessCheck.project; // Project data if allowed
```

**→ Full security guide:** [docs/ARCHITECTURE.md - Security](docs/ARCHITECTURE.md#security)

---

## 🚨 Known Critical Issues

### 1. Mock Data Visible to Users 🔴 CRITICAL

**Issue**: Technical AI agent may return simulated/random results when real analysis fails

**Locations** (Search for "mock", "simulated", "fake" in codebase):
- `server/services/technical-ai-agent.ts` - Mock query results and simulated ML metrics
- `server/services/spark-processor.ts` - Mock fallback behavior
- Various services may have fallback data when APIs fail

**Resolution**:
1. Set `ENABLE_MOCK_MODE=false` in production (CRITICAL)
2. Verify AI API keys are configured (GOOGLE_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY)
3. Check Python scripts execute correctly
4. Test with sample data before deployment
5. Grep the codebase for "mock" or "simulated" before production releases

### 2. Production Startup Validation ✅ ACTIVE

**Location**: `server/services/production-validator.ts`

Server validates on startup and **exits with code 1** if validation fails in production:
- Python bridge connectivity
- Redis connection (required in production)
- Database connectivity
- AI provider API keys
- Mock data detection (fails if found)

**→ All known issues:** See section below and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-issues)

### 3. Recent Improvements ✅ COMPLETED

**Recent commits have addressed**:
- **IPv6-Safe Rate Limiting**: Rate limiting now properly handles both IPv4 and IPv6 addresses
- **Idempotent Migrations**: Baseline migration can be safely run multiple times
- **Admin Stripe Tier Sync**: Automated synchronization between admin settings and Stripe tiers
- **Billing Consolidation**: Unified billing service consolidates multiple billing implementations
- **Production-Ready Components**: Enhanced platform capabilities with production hardening

**Git Commits** (Most Recent):
- `b557a0f` - Comprehensive platform fixes: pricing, payments, data flow, navigation
- `8eb706b` - Fix PII decisions SSOT and payment verification response mismatch
- `8713afd` - Clean up archived documentation and update config files
- `054048f` - Add ML pipeline, synthetic data generator, and test scripts
- `2ab324c` - Fix user journey flow, context-aware KPIs, payment redirects, analysis gating

### 4. Recent Bug Fixes (Dec 8, 2025) ✅ FIXED

| Issue | Fix | Location |
|-------|-----|----------|
| Data Verification "Continue" button not working | Created `PUT /api/projects/:id/verify` endpoint | `server/routes/project.ts` |
| Export Report 404 error | Created `GET /api/projects/:id/export/report` endpoint | `server/routes/project.ts` |
| Step-by-step analysis 404 | Fixed URL to `/api/ai/step-by-step-analysis` | `client/src/lib/api.ts` |
| Checkpoint feedback 500 errors | Proper 404 handling for missing checkpoints | `server/routes/project.ts` |
| Multi-dataset joining not working | Auto-detection of join keys + joinConfig | `client/src/pages/data-transformation-step.tsx` |
| Analysis using raw data instead of transformed | Priority for transformed data in `extractDatasetRows()` | `server/services/analysis-execution.ts` |

### 5. Recent Bug Fixes (Dec 10, 2025) ✅ FIXED

| Issue | Fix | Location |
|-------|-----|----------|
| Transformed schema not exposed to frontend | Datasets endpoint now returns `transformedSchema`, `originalSchema`, `transformedPreview`, `hasTransformations` | `server/routes/project.ts:3627-3654` |
| Duplicate checkpoint endpoints with inconsistent error handling | Both endpoints now use `canAccessProject()` and return proper 404 for missing checkpoints | `server/routes/project.ts:5162-5201` |
| Visualization workshop using original schema only | Component now checks multiple schema sources: `transformedSchema`, `datasets[].transformedSchema`, `originalSchema` | `client/src/components/visualization-workshop.tsx:75-133` |

### 6. Data Flow Connection Fixes (Dec 12, 2025) ✅ COMPLETE

**Gap Analysis Implementation**: 7 critical gaps (A-G) identified and fixed to connect the full data flow pipeline.

| Gap | Description | Fix | Location |
|-----|-------------|-----|----------|
| A | analysisPath[] not exposed to frontend | Show "Planned Analyses" section in transformation step | `client/src/pages/data-transformation-step.tsx` |
| B | readyForExecution not validated | Added completeness validation before execute button | `client/src/pages/data-transformation-step.tsx` |
| C | Transformations not linked to analyses | Cross-reference affectedElements with requiredDataElements | `client/src/pages/data-transformation-step.tsx` |
| D | recommendedAnalyses not passed to execution | Pass analysisPath[] to analysis execution API | `client/src/pages/execute-step.tsx`, `server/routes/analysis-execution.ts` |
| E | questionAnswerMapping not used for results | Added evidence chain showing "How We Answered This" | `server/services/question-answer-service.ts`, `client/src/components/UserQuestionAnswers.tsx` |
| F | Researcher Agent not integrated | Added `/recommend-templates` endpoint, calls researcher before requirements | `server/routes/project.ts`, `client/src/pages/prepare-step.tsx` |
| G | Data Scientist Agent not coordinated via PM | Added DS case handler in orchestrator for analysis planning | `server/services/project-agent-orchestrator.ts` |

**Key Architecture Changes**:
- Extended `shared/journey-templates.ts` agent enum with `template_research_agent` and `data_scientist`
- Added `TemplateResearchAgent` and `DataScientistAgent` instances in orchestrator
- PM Agent now coordinates: User Questions → Researcher → DS → DE → Analysis
- Full evidence chain traceability from question → requirements → transformation → analysis → answer

**Documentation**: See [docs/AGENTIC_SYSTEM.md - PM Agent Coordination Workflow](docs/AGENTIC_SYSTEM.md#pm-agent-coordination-workflow-dec-12-2025)

### Outstanding Issues (from FIX_PLANS.md)

**Status Summary** (Jan 8, 2026): P0, P1, P2 COMPLETE - 2 remaining items planned

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| P0-1 | Transformation mappings not saved | 🔴 CRITICAL | ✅ FIXED (Jan 7) |
| P0-2 | No payment gate on execution | 🔴 CRITICAL | ✅ FIXED (Jan 7) |
| P0-3 | Results not gated by payment | 🔴 CRITICAL | ✅ FIXED (Jan 7) |
| P0-4 | PII decisions not saved consistently | 🔴 CRITICAL | ✅ FIXED (Jan 7) |
| P1-1 | Missing decision trail endpoint | 🔴 HIGH | ✅ FIXED (Jan 7) |
| P1-2 | Missing upload SLA endpoint | 🔴 HIGH | ✅ FIXED (Jan 7) |
| P1-3 | Missing chart generation endpoint | 🔴 HIGH | ✅ FIXED (Jan 7) |
| P2-1 | PM Agent parallel execution | 🟡 MEDIUM | ✅ FIXED (Jan 7) |
| P2-2 | BA translation never triggered | 🟡 MEDIUM | ✅ FIXED (Jan 7) |
| P2-3 | No payment status UI | 🟡 MEDIUM | ✅ FIXED (Jan 7) |
| P3-1 | Integrate or remove Plan Step | 🟢 LOW | 📋 Planned |
| P3-2 | Replace orchestrator switch with messages | 🟢 LOW | 📋 Planned |

**Recent Fixes (Jan 7, 2026)**:
- ✅ Payment gates added to execution and results endpoints
- ✅ Column mappings now persist to dataset.ingestionMetadata
- ✅ PII decisions save to both journeyProgress AND dataset
- ✅ Three new API endpoints: decision-trail, upload-sla, generate-charts
- ✅ PM Agent now runs agents sequentially with proper dependencies
- ✅ Business Agent translation triggered after analysis completes
- ✅ PaymentStatusBanner component shows preview/paid status

### Related Documentation
- **[FIX_PLANS.md](FIX_PLANS.md)** - Detailed fix specifications with code examples
- **[PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md)** - Production audit report
- **[docs/SYSTEM_STATUS.md](docs/SYSTEM_STATUS.md)** - System health and phase completion status

### 7. Connection Fixes (Dec 12, 2025) ✅ COMPLETE

Five critical gaps were identified and fixed to enable full traceability from questions → requirements → transformation → analysis → answers:

| Gap | Problem | Fix | Files Modified |
|-----|---------|-----|----------------|
| **A** | `analysisPath[]` generated but hidden from frontend | Added "Planned Analyses" display to transformation step | `data-transformation-step.tsx` |
| **B** | `readyForExecution` flag never validated | Added completeness validation with progress bar and gaps display | `data-transformation-step.tsx` |
| **C** | Transformations didn't show which analyses they enable | Added "Enables Analyses" column to transformation table | `data-transformation-step.tsx` |
| **D** | Analysis execution didn't receive DS recommendations | Pass `analysisPath[]` and `questionAnswerMapping[]` to backend; prioritize recommended analyses | `execute-step.tsx`, `analysis-execution.ts` |
| **E** | Results didn't trace back to questions with evidence | `QuestionAnswerService` uses mapping for evidence chains; UI shows "How We Answered This" | `question-answer-service.ts`, `UserQuestionAnswers.tsx` |

**Console Indicators** (verify in browser/server console):
- `[GAP D] Received X DS-recommended analyses` - Frontend passes recommendations
- `[GAP D] Prioritized analysis order` - Backend reorders analyses
- `[GAP E] Storing X question-answer mappings` - Evidence chain setup
- `[GAP E] Found mapping for question` - Question-to-answer linkage active

### 8. Architectural Technical Debt ✅ COMPLETE (Option B)

**Root Cause Analysis** (from [ARCHITECTURE_REFACTORING_ANALYSIS.md](ARCHITECTURE_REFACTORING_ANALYSIS.md)):

All 4 structural problems have been addressed:

| Problem | Root Cause | Impact | Status |
|---------|-----------|--------|--------|
| "Journey retains old data" | Checkpoints in DB + state in memory - not synced | Server restart loses state | ✅ FIXED (Week 2) |
| "Questions not answered" | Questions stored in 3 places, analysis checks only 1 | Q&A generation skipped | ✅ FIXED (Week 1) |
| "Transformations not applied" | 8 different data locations, unclear priority | Wrong data source used | ✅ FIXED (Week 4) |
| "Agent approvals don't work" | In-memory checkpoints vs DB checkpoints race | Approval state lost | ✅ FIXED (Week 2) |

**Option B Targeted Refactoring Complete** (Dec 11, 2025):
1. ✅ **Week 1: Question-to-Answer Pipeline** - Questions saved to `project_questions` table, analysis loads from DB
2. ✅ **Week 2: Agent Checkpoint DB-First** - Added `journey_execution_states` table, `persistState`/`restoreState` hooks
3. ✅ **Week 3: Journey State Consolidation** - `journeyProgress.status` is now single source of truth
4. ✅ **Week 4: Data Location Consolidation** - New `DataAccessorService` with clear transformed/original priority

**New Components**:
- `journey_execution_states` table - Persists JourneyExecutionMachine state
- `JourneyProgressState.status` - Unified journey status in JSONB
- `JourneyProgressState.phaseCompletionStatus` - Quick phase lookup
- `DataAccessorService` - Single interface for data access (`server/services/data-accessor.ts`)
- New methods: `pauseJourney()`, `resumeJourney()`, `cancelJourney()`, `getJourneyStatus()`

**Design Documents**:
- [ARCHITECTURE_DESIGN_AND_IMPLEMENTATION.md](ARCHITECTURE_DESIGN_AND_IMPLEMENTATION.md) - Detailed implementation plan
- [PGVECTOR_VALIDATION_ARCHITECTURE.md](PGVECTOR_VALIDATION_ARCHITECTURE.md) - pgvector + strict Zod validation

### 9. User Journey UI/UX Fixes (Dec 12, 2025 - Part 2) ✅ COMPLETE

Additional fixes to resolve user-reported issues during testing:

| Issue | Fix | Location |
|-------|-----|----------|
| View Projects button showed alert instead of navigating | Changed to navigate to `/dashboard` | `client/src/pages/journeys-hub.tsx` |
| PII decisions not being saved | Enhanced logging + fixed metadata merge in PUT endpoint | `client/src/pages/data-verification-step.tsx`, `server/routes/project.ts:6189-6259` |
| Dataset auto-join not detecting join keys | Enhanced `autoDetectJoinKeys()` with regex patterns + detailed logging | `client/src/pages/data-transformation-step.tsx:255-337` |
| Transformation mappings missing questionAnswerMapping | Added `questionAnswerMapping`, `userQuestions`, `transformationPlan` to required-data-elements endpoint | `server/routes/project.ts:5637-5672` |
| Data quality score showing wrong values | Fixed `clampScore()` to handle both 0-1 and 0-100 ranges; removed duplicate *100 multiplication | `server/routes/project.ts:595-605, 5036-5118` |
| Analysis plan stuck showing "pending" on errors | Frontend now recognizes `rejected`/`cancelled` as failure statuses; progress endpoint returns `rejectionReason` | `client/src/pages/plan-step.tsx:259-274`, `server/routes/analysis-plans.ts:637-657` |

**Console Debugging Indicators** (check browser/server logs):
- `🔒 [PII Frontend]` / `🔒 [PII Backend]` - PII decision save flow
- `🔗 [Auto-Join Frontend]` - Dataset join key detection
- `📊 [Required Elements]` - Required data elements document content
- `📊 [Data Quality]` - Quality metrics calculation
- `📋 [Plan Progress]` - Analysis plan progress status

### 10. Artifact Passing Fixes (Jan 4, 2026) ✅ COMPLETE

Critical fixes for artifact data flow between user journey steps:

| Gap | Problem | Severity | Fix | Location |
|-----|---------|----------|-----|----------|
| **Gap 5** | `questionAnswerMapping` not passed to analysis execution | P0/CRITICAL | Extended Zod schema to accept mapping; added priority logic | `server/routes/analysis-execution.ts:57-89`, `server/services/analysis-execution.ts:596-606` |
| **Gap 6** | Transformation not guaranteed before execution | P0/CRITICAL | Already implemented with `isJoinRequiredButNotExecuted()` | `client/src/pages/data-transformation-step.tsx` |
| **Gap 7** | PII decisions not passed to artifact generation | P0/CRITICAL | Added `piiConfig` to ArtifactConfig; CSV export filters excluded columns | `server/services/artifact-generator.ts:18-23,346-361`, `server/routes/analysis-execution.ts:131-142` |
| **Gap 8** | Checkpoint approvals not persisted to DB | P0/CRITICAL | Added `storage.updateAgentCheckpoint()` call; removed duplicate endpoint | `server/services/project-agent-orchestrator.ts:274-305`, `server/routes/project.ts` |
| **Gap 9** | Data elements not showing in prepare step | P0/CRITICAL | Persist `requirementsDocument` to `journeyProgress` (SSOT) | `server/routes/project.ts:4520-4550` |
| **Gap 10** | Joined dataset row count inaccurate | P2/MEDIUM | Use `recordCount` instead of `preview.length` for accurate totals | `server/routes/project.ts:3405` |

**Key Changes**:
- `journeyProgress` is now SSOT for requirements document persistence
- PII column filtering applied to CSV artifact exports based on user decisions
- Agent checkpoint approvals persisted to database (survives server restart)
- Evidence chain: questions → requirements → analysis → answers fully traceable

**Console Indicators** (verify in server logs):
- `📋 [GAP 5 FIX] Using X question mappings from request` - Evidence chain active
- `🔒 [GAP 7 FIX] PII config loaded for artifacts` - PII filtering active
- `✅ [GAP 8 FIX] Checkpoint persisted to database` - DB persistence working
- `✅ Requirements document persisted to journeyProgress` - Gap 9 fix active

**Unit Test Results**: 227/230 passed (3 pre-existing failures in `question-answer-service.test.ts`)

### 11. P0-P2 Critical Fixes (Jan 7, 2026) ✅ COMPLETE

Comprehensive fix plan executed to address data pipeline and payment flow issues.

| Priority | Issue | Fix | Location |
|----------|-------|-----|----------|
| **P0** | Transformation mappings not saved | Added `columnMappings` to dataset ingestionMetadata | `server/routes/project.ts` |
| **P0** | No payment gate on execution | Added 402 response for unpaid projects with trial credit check | `server/routes/analysis-execution.ts` |
| **P0** | Results not gated by payment | Returns `isPreview: true` with limited insights for unpaid | `server/routes/analysis-execution.ts` |
| **P0** | PII decisions not saved consistently | Save to both `journeyProgress` and `dataset.ingestionMetadata` | `server/routes/project.ts` |
| **P1** | Missing decision trail endpoint | Created `/api/projects/:id/decision-trail` | `server/routes/project.ts` |
| **P1** | Missing upload SLA endpoint | Created `/api/projects/:id/upload-sla` | `server/routes/project.ts` |
| **P1** | Missing chart generation endpoint | Created `/api/projects/:id/generate-charts` | `server/routes/project.ts` |
| **P2** | PM Agent parallel execution | Implemented sequential workflow with dependencies | `server/services/project-manager-agent.ts` |
| **P2** | BA translation never triggered | Added translation after DS analysis completes | `server/services/analysis-execution.ts` |
| **P2** | No payment status UI | Created `PaymentStatusBanner` component | `client/src/components/PaymentStatusBanner.tsx` |

**Row Count Utilities Added** (`client/src/lib/utils.ts`):
```typescript
getDatasetRowCount(dataset)        // Returns transformed or original count
getDatasetRowCountDisplay(dataset) // Returns formatted string with both counts
```

**Console Indicators** (verify in server logs):
- `✅ [Transformation] Saved X column mappings to dataset` - Mappings persisted
- `⚠️ [Payment Gate] Execution blocked for project X` - Payment enforcement active
- `🔒 [Results Gate] Returning preview-only results` - Results gating working
- `💼 [BA Translation] Translating results for X audience` - Business translation active

**Related Documentation**: See [FIX_PLANS.md](FIX_PLANS.md) for detailed implementation specs.

### 12. Phase 3 Production Polish (Jan 6, 2026) ✅ COMPLETE

Final production readiness improvements:

| Area | Improvement | Details |
|------|-------------|---------|
| **Error Recovery** | Retry buttons on all error states | Execute step, plan step, dashboard |
| **Checkpoint Enforcement** | Plan approval + data quality checks | Must approve before proceeding |
| **Execution Timeouts** | 5-minute timeout with AbortController | Prevents hung analysis jobs |
| **Artifact Polling** | Exponential backoff (3s, 6s, 12s, 24s, 48s) | Reduces server load |
| **Hardcoded Delays** | Replaced setTimeout with async/await | Better UX, no arbitrary waits |
| **Atomic Transactions** | Database saves wrapped in transactions | Data integrity guaranteed |

**Related Documentation**: See [docs/SYSTEM_STATUS.md](docs/SYSTEM_STATUS.md) for full audit report.

### 13. Analysis Execution Method Fix (Jan 8, 2026) ✅ COMPLETE

**ROOT CAUSE DISCOVERED**: The analysis execution route was calling the wrong method, causing all analysis to use hardcoded basic statistics instead of type-specific Python scripts.

| Issue | Root Cause | Fix | Location |
|-------|-----------|-----|----------|
| **Analysis using basic stats only** | Route called `executeAnalysis()` which uses hardcoded inline Python | Changed to `executeComprehensiveAnalysis()` which uses DataScienceOrchestrator | `server/routes/analysis-execution.ts:153` |
| **Type-specific scripts never executed** | `executeAnalysis()` bypasses correlation_analysis.py, regression_analysis.py, etc. | `executeComprehensiveAnalysis()` properly routes to Python scripts in `/python/` | `server/services/analysis-execution.ts` |
| **Business Agent placeholder** | Orchestrator had `setTimeout(10)` placeholder instead of real BA calls | Implemented full BA integration: translateResults, assessBusinessImpact, generateIndustryInsights | `server/services/project-agent-orchestrator.ts:807-931` |

**Two Analysis Methods Explained**:
```typescript
// ❌ OLD (hardcoded, bypasses proper scripts):
executeAnalysis() → PythonProcessor → inline basic stats only

// ✅ NEW (proper routing to type-specific scripts):
executeComprehensiveAnalysis() → DataScienceOrchestrator → {
  correlation_analysis.py,
  regression_analysis.py,
  clustering_analysis.py,
  time_series_analysis.py,
  descriptive_stats.py
}
```

**Business Agent Now Fully Integrated**:
- `translateResults()` - Translates analysis for target audience (executive, technical, etc.)
- `assessBusinessImpact()` - Evaluates business value and ROI
- `generateIndustryInsights()` - Generates industry-specific recommendations
- `generateBusinessKPIs()` - Creates relevant KPI metrics

**Console Indicators** (verify in server logs):
- `🔬 DataScienceOrchestrator: Running correlation_analysis.py` - Type-specific scripts active
- `💼 [BA Agent] Translating results for X audience` - Business translation working
- `✅ [BA Agent] Business impact assessment completed` - Impact analysis running

### 14. End-to-End U2A2A2U Flow Audit (Jan 12, 2026) ✅ COMPLETE

Comprehensive audit of the entire user-to-agent-to-agent-to-user (u2a2a2u) data flow with mock data removal and dashboard improvements.

**Mock Data Audit Results**:

| Location | Type | Status |
|----------|------|--------|
| `server/services/spark-processor.ts` | Production-safe mock | ✅ Already has production block - throws errors in production |
| `server/services/google-drive.ts` | Stub implementation | ⚠️ Optional feature - not in critical path |
| `server/routes/pricing.ts` | Mock payment intent | ✅ **FIXED** - Now blocks mock in production with 503 error |
| `server/services/agent-tool-handlers.ts` | Stub handlers | ⚠️ Optional features (Spark, diagnostics) - not in critical path |

**Key Fix**: Production mock payment blocking added to `server/routes/pricing.ts:438-447`

**Dashboard Display Fixes**:

| Issue | Fix | Location |
|-------|-----|----------|
| BA translations generated but not displayed | Fixed component to read from `journeyProgress.translatedResults` | `client/src/components/AudienceTranslatedResults.tsx` |
| Component not mounted on project page | Added to Insights tab with audience selector | `client/src/pages/project-page.tsx` |
| Data path mismatch (audienceTranslations vs translatedResults) | Component now checks both locations with fallback | `AudienceTranslatedResults.tsx:107-168` |

**Payment Flow Verification**:

1. **Execution Gate**: Analysis execution checks `isPaid` and subscription status
2. **Results Gate**: Preview limiting (10% insights, 2 charts) when unpaid
3. **Banner Display**: PaymentStatusBanner shows preview/paid status correctly
4. **Stripe Integration**: Webhooks mark projects as paid on checkout completion

**Business Agent Output Now Displayed**:
- Executive/Technical/Analyst audience tabs in Insights view
- `journeyProgress.translatedResults` correctly displayed
- `journeyProgress.businessImpact` and `journeyProgress.industryInsights` accessible

**Console Indicators** (verify in logs):
- `✅ [AudienceResults] Found BA translation for executive` - BA translations displayed
- `⚠️ [AudienceResults] Using fallback translation` - Fallback mode active
- `🔴 CRITICAL: Stripe not configured in production!` - Production payment block working

### 15. User Journey Flow & Context-Aware Analysis (Jan 14, 2026) ✅ COMPLETE

Three critical issues fixed to ensure proper user journey flow, context-aware analysis, and payment integration.

**Issue 1: Context-Aware KPIs and Recommendations**

| Problem | Fix | Location |
|---------|-----|----------|
| Generic KPIs shown for HR projects (Customer satisfaction, Revenue growth) | Added HR/Education goal patterns to `suggestBusinessMetrics()` | `server/services/business-agent.ts:1252-1320` |
| Industry not auto-detected from project context | Added `autoDetectIndustryFromContext()` method | `server/services/project-manager-agent.ts:784-852` |

**New Industry Cases Added to `generateBusinessKPIs()`:**
- HR/Employee Engagement: Engagement Score, Turnover Rate, Retention Rate, Time to Hire
- Education: Student Retention, Graduation Rate, Course Completion Rate
- Nonprofit: Donor Retention, Program Effectiveness, Mission Impact

**Issue 2: Payment Flow Fixes**

| Problem | Fix | Location |
|---------|-----|----------|
| Stripe redirect to wrong URL after payment | Changed redirect to `/journeys/{journeyType}/pricing?projectId={id}&payment=success` | `server/services/billing/unified-billing-service.ts` |
| Payment success not handled on project page | Added fallback payment success/cancel handler | `client/src/pages/project-page.tsx:150-208` |

**Issue 3: Analysis Type Links Gated**

| Problem | Fix | Location |
|---------|-----|----------|
| Quick action cards allowed bypassing journey | Replaced with single "Choose Journey" button | `client/src/pages/project-page.tsx:385-449` |
| Analysis tabs accessible without journey completion | Added disabled state with lock icon on Visualizations/Insights tabs | `client/src/pages/project-page.tsx:471-494` |
| Tab content accessible even when disabled | Added fallback guards with "Complete Your Journey" message | `client/src/pages/project-page.tsx:679-817` |
| GuidedAnalysisWizard modal exposed direct analysis | Removed modal entirely - analysis gated through journey | `client/src/pages/project-page.tsx` |

**Key Changes to Project Dashboard:**
- Simplified tab structure from 8 tabs to 6 tabs (removed Transform/Schema)
- Journey-incomplete state shows amber warning card with progress bar and "Resume Journey" button
- No-journey state shows blue info card with "Choose Your Journey" button
- Visualizations and Insights tabs show lock icon and are disabled when journey incomplete

### 16. Comprehensive Platform Fixes (Jan 22, 2026) ✅ COMPLETE

Full audit and fix of 5 recurring issues across pricing, payments, data flow, and navigation. Two critical hotfixes also applied.

**Issue 1: Pricing Unification**

| Problem | Fix | Location |
|---------|-----|----------|
| 3 competing pricing systems produced different costs | Aligned `buildPricing()` with CostEstimationService constants ($0.50 base, $0.10/1K rows, type multipliers) | `server/routes/analysis-payment.ts:36-81` |
| Frontend `calculatePricing` used journey-based base prices ($29-$99) | Client now relies entirely on `backendCostEstimate` from `/api/projects/:id/cost-estimate` | `client/src/pages/pricing-step.tsx` |

**Issue 2: Subscription Price ID Bug**

| Problem | Fix | Location |
|---------|-----|----------|
| `stripeYearlyPriceId` used same value as `stripeMonthlyPriceId` | Query `subscriptionTierPricing` DB table for distinct monthly/yearly IDs | `server/routes/pricing.ts:477-487` |

**Issue 3: Navigation Cache Staleness**

| Problem | Fix | Location |
|---------|-----|----------|
| Data elements not refreshing after prepare step saves | Added `refetchOnMount: 'always'` to useProject hook | `client/src/hooks/useProject.ts:82` |
| Transformation step loads stale cached data | Added cache invalidation on mount before loading transformation inputs | `client/src/pages/data-transformation-step.tsx` |

**Issue 4: PII Decisions SSOT**

| Problem | Fix | Location |
|---------|-----|----------|
| Analysis execution read PII from `project.metadata` (not SSOT) | Now reads from `journeyProgress.piiDecision` first, falls back to metadata | `server/services/analysis-execution.ts:458-463` |
| Multiple field names for excluded columns | Normalized: `excludedColumns`, `selectedColumns`, `piiColumnsRemoved` all checked | `server/services/analysis-execution.ts` |

**Issue 5: Payment Verification Response Mismatch**

| Problem | Fix | Location |
|---------|-----|----------|
| Frontend checks `response.paymentStatus === 'paid'` but backend only returned `status` | Added `paymentStatus` field to verify-session response | `server/routes/payment.ts:209-215` |
| Successful payments shown as FAILED to users | Response now includes both `status` and `paymentStatus` for compatibility | `server/routes/payment.ts` |

**Key Architecture Principle Reinforced**:
- `journeyProgress` is the SSOT for all user journey state (PII decisions, cost estimates, requirements, execution config)
- Backend services must read from `journeyProgress` first, with fallback to legacy locations
- Frontend-backend contract: always include expected response fields even if redundant

**Console Indicators** (verify in server logs):
- `💰 [Payment] Locked cost sources: journeyProgress=X, project=Y, using=Z` - Cost SSOT active
- `✅ [Payment] Using locked cost` - Locked pricing enforced
- `🔴 CRITICAL: Stripe not configured in production!` - Production safety check working

---

## 🐛 Common Debugging Scenarios

### "Server startup failures"
**Critical startup sequence** (see `server/index.ts`):
1. Production validation checks (exits with code 1 if fails in production)
2. Python worker pool initialization
3. Agent initialization (`initializeAgents()`)
4. Tool initialization (`initializeTools()` and `registerCoreTools()`)
5. WebSocket server setup

**Check server logs** for any failures in this sequence before debugging specific features.

### "Agent tools not working"
1. Check `server/index.ts` - Verify `initializeTools()` and `initializeAgents()` are called in correct order
2. Check server startup logs for initialization messages (should show agent and tool counts)
3. Verify tool is registered in `server/services/mcp-tool-registry.ts`
4. Use `executeTool()` function - never call services directly

### "Database schema changes not applied"
1. Verify changes are in `shared/schema.ts`
2. Run `npm run db:push` (**CRITICAL** - uses `drizzle-kit up:pg` internally)
3. Check for migration errors in console
4. Restart development server

### "Service file not found / duplicate implementations"

⚠️ **IMPORTANT**: Some services exist in BOTH locations:
- `server/*.ts` - Legacy/older implementations
- `server/services/*.ts` - **Preferred modern location**

**Resolution Strategy**:
1. Check BOTH locations when modifying services
2. Use Grep to find all instances: Search for the service name across `server/`
3. Prefer `server/services/` for new code and modifications
4. See [docs/KNOWN_DUPLICATES.md](docs/KNOWN_DUPLICATES.md) for tracked duplicates
5. See [docs/ARCHITECTURE.md - Service File Locations](docs/ARCHITECTURE.md#service-file-locations)

### "Redis connection errors"
1. **Development**: Set `REDIS_ENABLED=false` in `.env` (fallback to in-memory)
2. **Production**: Verify `REDIS_URL` environment variable
3. Check `docker-compose.dev.yml` if using Docker

### "Mock/simulated data appearing in results"
1. Check `ENABLE_MOCK_MODE` environment variable (must be `false` in production)
2. Verify Python scripts are being called via `server/services/python-processor.ts`
3. Ensure AI API keys are configured correctly

### "Journey template not loading correctly"
1. Check `shared/journey-templates.ts` for template definition
2. Verify journey type matches user role mapping in `canonical-types.ts`
3. Review journey template service: `server/services/project-manager/journey-template-service.ts`

### "WebSocket agent messages not appearing"
1. Check WebSocket connection in browser DevTools (Network tab → WS filter)
2. Verify `server/services/agents/realtime-agent-bridge.ts` is emitting events (note: 'realtime-agent-bridge')
3. Check `client/src/lib/realtime.ts` listeners are properly registered
4. Confirm message broker is publishing: `AgentMessageBroker.getInstance().publish()`
5. **IMPORTANT**: We use `ws` library, NOT Socket.IO
   - Socket.IO is installed as a dependency but NOT actively used for real-time communication
   - WebSocket connection uses native WebSocket protocol (ws:// or wss://)
   - Server-side: `ws` library in `server/index.ts`
   - Client-side: Native browser WebSocket API in `client/src/lib/realtime.ts`
6. Connection URL should be `ws://localhost:5000` (dev) or `wss://domain.com` (production)

### "Python analysis scripts failing"
1. Ensure Python 3.8+ is installed and in PATH
2. Install Python dependencies: `pip install -r python/requirements.txt`
   - **Note**: The correct path is `python/requirements.txt` (not `python_scripts/`)
3. Check Python script paths in `server/services/python-processor.ts`
4. Review Python script output in server logs (stdout/stderr)
5. Verify `python` command works (may need `python3` on some systems)
6. Common Python scripts locations:
   - `python/` - Main analysis scripts directory (12 scripts)
   - `python_scripts/` - Additional utility scripts (7 scripts)

### "Playwright tests hanging or timing out"
1. Check `playwright.config.ts` - Modified to handle authentication state
2. For auth tests, ensure test user exists in database
3. Use `--workers=1` flag for serial execution when debugging
4. Check for port conflicts (Vite on 5173, server on 5000)

### "Type errors when updating projects"
The `storage.updateProject()` function has a strict TypeScript interface that doesn't include all database columns.

```typescript
// Problem: TypeScript complains about unknown properties
storage.updateProject(id, { status: 'ready' }); // Error!

// Solution: Use 'as any' cast for fields not in Zod schema
storage.updateProject(id, { status: 'ready' } as any);
```

**Why this happens**:
- `DataProject` Zod schema (`shared/schema.ts` line 227) defines the API contract
- Drizzle `projects` table (`shared/schema.ts` line 635) has additional DB columns
- `storage.ts` uses the Zod schema for type safety, but DB has more fields
- Fields like `journeyProgress`, `stepCompletionStatus`, `lockedCostEstimate` exist in DB but not Zod schema

### "Journey state not updating"
1. Use singleton instance: `const { journeyStateManager } = await import('../services/journey-state-manager')`
2. Method is `completeStep()` not `markStepComplete()`
3. Check DB: `projects.stepCompletionStatus` should update

### "Cannot find module / import errors"
1. Check file extension - use `.ts` not `.js` for TypeScript imports
2. Verify Vite aliases in `vite.config.ts`: `@` → `client/src`, `@shared` → `shared`, `@assets` → `attached_assets`
3. For server imports, ensure relative paths are correct (no alias support)
4. Run `npm run check` to verify TypeScript can resolve all imports

### "API requests returning 401/403"
1. Verify user is logged in - check `req.user` in route handler
2. Use `ensureAuthenticated` middleware from `server/routes/auth.ts`
3. For project access, use `canAccessProject()` from `server/middleware/ownership.ts`
4. Admin bypass: `isAdmin` flag on user allows access to all projects

**→ More scenarios:** See each specific guide for domain-specific debugging

---

## 📝 Development Checklist

### Before Making Changes
- [ ] Read relevant documentation sections
- [ ] Check if similar functionality exists (use Grep/Glob tools)
- [ ] Review `shared/schema.ts` for data model
- [ ] Check both `server/*.ts` AND `server/services/*.ts` for duplicates

### After Making Changes
- [ ] Run `npm run db:push` if schema changed (**CRITICAL**)
- [ ] Run `npm run check` for TypeScript errors
- [ ] Run `npm run test:user-journeys` for regression testing
- [ ] Update relevant documentation
- [ ] Verify no mock data in user-facing responses

### Production Deployment Checklist

**Environment Configuration**:
- [ ] Set `NODE_ENV=production`
- [ ] Set `ENABLE_MOCK_MODE=false`
- [ ] Configure strong `SESSION_SECRET` and `JWT_SECRET`
- [ ] Set `REDIS_ENABLED=true` (or omit, auto-enabled in production)
- [ ] Configure `CORS_ORIGIN` to production domain

**Security & Services**:
- [ ] Enable rate limiting (`ENABLE_RATE_LIMITING=true`)
- [ ] Enable webhook verification (`ENABLE_WEBHOOK_SIGNATURE_VERIFICATION=true`)
- [ ] Verify all AI provider API keys are set
- [ ] Confirm Redis connection available
- [ ] Verify Stripe keys for production

**Testing & Validation**:
- [ ] Run full test suite: `npm run test:production`
- [ ] Search codebase for "mock", "simulated" endpoints
- [ ] Test agent coordination with Redis enabled
- [ ] Verify Python scripts execute correctly with production data
- [ ] Test with sample data to confirm real analysis results
- [ ] Check server startup logs for successful initialization
- [ ] **Verify production validation passes** (server exits code 1 if fails)

**Database & Performance**:
- [ ] Confirm database migrations applied (`npm run db:push` on production schema)
- [ ] Verify Spark configuration if using big data (`SPARK_ENABLED=true`)
- [ ] Check database connection pool settings

**→ Full deployment guide:** [docs/ARCHITECTURE.md - Production Deployment](docs/ARCHITECTURE.md#production-deployment)

---

## 🔧 Key Patterns & Conventions

### Adding a New API Endpoint

```typescript
// 1. Add route in server/routes/{feature}.ts
import { ensureAuthenticated } from './auth';
import { canAccessProject } from '../middleware/ownership';

router.post('/api/feature/:id/action', ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  const projectId = req.params.id;

  // Check access
  const access = await canAccessProject(userId, projectId, (req.user as any)?.isAdmin);
  if (!access.allowed) {
    return res.status(403).json({ success: false, error: access.reason });
  }

  // Business logic via service (prefer server/services/)
  const result = await featureService.doAction(access.project, req.body);
  res.json({ success: true, data: result });
});

// 2. Register route in server/routes/index.ts
```

### Adding a New Agent Tool

```typescript
// 1. Register tool in server/services/mcp-tool-registry.ts
toolRegistry.register({
  name: 'my_new_tool',
  description: 'What this tool does',
  inputSchema: { /* Zod schema */ },
  permissions: ['data_scientist', 'project_manager'],
  handler: async (input) => { /* implementation */ }
});

// 2. Agents call via executeTool() - NEVER call services directly
await executeTool('my_new_tool', { param: value });
```

### Database Schema Changes

```bash
# 1. Edit shared/schema.ts (both Drizzle table AND Zod schema if API-facing)
# 2. CRITICAL: Push changes to database
npm run db:push

# 3. Restart server to pick up changes
npm run dev
```

---

## 📚 Additional Documentation

### Core Documentation
- **[README.md](README.md)** - Quick start, features, deployment options
- **[DOCKER-SETUP.md](DOCKER-SETUP.md)** - Docker and Redis setup
- **[.env.example](.env.example)** - All environment variables with descriptions
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - Copilot-specific patterns

### Specialized Guides
- **[SPARK_FULL_SETUP_GUIDE.md](SPARK_FULL_SETUP_GUIDE.md)** - Apache Spark setup
- **[STRIPE-INTEGRATION.md](STRIPE-INTEGRATION.md)** - Stripe payment integration
- **[docs/KNOWN_DUPLICATES.md](docs/KNOWN_DUPLICATES.md)** - Service file duplicate tracking

### Implementation Summaries
- **[FIX_PLANS.md](FIX_PLANS.md)** - Comprehensive fix plan with P0-P3 priorities and code examples
- **[COMPREHENSIVE_PLATFORM_FIX_PLAN.md](COMPREHENSIVE_PLATFORM_FIX_PLAN.md)** - Jan 22 platform-wide fix plan (pricing, payments, navigation)
- **[PLATFORM_FIX_PLAN_JAN21.md](PLATFORM_FIX_PLAN_JAN21.md)** - Jan 21 fix plan (pricing conflicts, subscriptions)
- **[USER_JOURNEY_GAP_ANALYSIS_JAN19.md](USER_JOURNEY_GAP_ANALYSIS_JAN19.md)** - Jan 19 user journey gap analysis
- **[PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md)** - Production audit report (Jan 2, 2026)
- **[docs/SYSTEM_STATUS.md](docs/SYSTEM_STATUS.md)** - System health status and phase completion

### Documentation Archive
**[docs/archives/sessions/](docs/archives/sessions/)** - 148+ historical session docs with implementation details

---

## 🔗 Quick Links by Task

| Task | Documentation |
|------|---------------|
| **Understanding architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Working with agents** | [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md) |
| **Building user journeys** | [docs/USER_JOURNEYS.md](docs/USER_JOURNEYS.md) |
| **Billing & subscriptions** | [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md) |
| **Database schema** | [docs/ARCHITECTURE.md#database-schema](docs/ARCHITECTURE.md#database-schema) |
| **API routes** | [docs/ARCHITECTURE.md#api-routes](docs/ARCHITECTURE.md#api-routes) |
| **Authentication** | [docs/ARCHITECTURE.md#authentication](docs/ARCHITECTURE.md#authentication) |
| **Testing** | [docs/ARCHITECTURE.md#testing](docs/ARCHITECTURE.md#testing) |
| **Environment setup** | [.env.example](.env.example) |
| **Production deployment** | [docs/ARCHITECTURE.md#production](docs/ARCHITECTURE.md#production) |

---

**For detailed information on any topic, navigate to the appropriate documentation file above.**
