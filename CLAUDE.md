# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Last Updated**: January 18, 2025 | **Status**: Active Development

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
npm run db:push               # Push schema changes (drizzle-kit push)
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
npm run test:backend          # Backend tests (Vitest)
npm run test:backend-watch    # Backend tests in watch mode
npm run test:client           # Client tests (Vitest)

# E2E Tool Integration Tests
npm run test:e2e-tools        # End-to-end tool integration tests
npm run test:e2e-tools-headed # With browser UI
npm run test:e2e-tools-debug  # Debug mode

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
```

### Quick Decision Tree

**Adding a new analysis type?**
→ See [docs/USER_JOURNEYS.md - Adding New Analysis Features](docs/USER_JOURNEYS.md#adding-new-analysis-features)

**Modifying agents?**
→ See [docs/AGENTIC_SYSTEM.md - Agent Development](docs/AGENTIC_SYSTEM.md#agent-development)

**Changing database schema?**
→ Edit `shared/schema.ts` then run `npm run db:push`
→ See [docs/ARCHITECTURE.md - Database Schema](docs/ARCHITECTURE.md#database-schema)

**Adding new tools for agents?**
→ See [docs/AGENTIC_SYSTEM.md - Tool Registry](docs/AGENTIC_SYSTEM.md#tool-registry)

**Production deployment?**
→ See [Environment Setup](#environment-setup) and [Production Checklist](#production-deployment-checklist)

**Mock data issues?**
→ See [Common Debugging Scenarios](#common-debugging-scenarios)

**Billing or admin features?**
→ See [docs/BILLING_ADMIN.md](docs/BILLING_ADMIN.md)

---

## 🏗️ Technology Stack Overview

- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS + Radix UI
- **Backend**: Express.js + TypeScript, WebSocket for real-time updates
- **Database**: PostgreSQL with Drizzle ORM
- **Big Data**: Apache Spark for distributed processing and ML at scale
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: Wouter (lightweight React router)
- **Authentication**: Passport.js with OAuth providers
- **AI Providers**: Google Gemini, OpenAI, Anthropic Claude

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
- **WebSocket Communication**: Real-time agent-to-user updates
- **Ownership Verification**: Admin bypass for project access

**→ Complete guide:** [docs/AGENTIC_SYSTEM.md](docs/AGENTIC_SYSTEM.md)

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

---

## 🔒 Authentication & Security

### Authentication Pattern

**Location**: `server/routes/auth.ts` (real authentication - ALWAYS use this)

⚠️ **IMPORTANT**: Mock authentication middleware (`server/middleware/auth.ts`) was **deleted** on October 28, 2024.

```typescript
import { ensureAuthenticated } from './routes/auth';

router.get('/protected-route', ensureAuthenticated, async (req, res) => {
  const userId = (req.user as any)?.id;
  const isAdmin = (req.user as any)?.isAdmin || false;
  // ... handler logic
});
```

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

**Locations**:
- `server/services/technical-ai-agent.ts:97-107` - Mock query results
- `server/services/technical-ai-agent.ts:582-636` - Simulated ML metrics
- `server/services/spark-processor.ts:194-306` - Mock fallback behavior

**Resolution**:
1. Set `ENABLE_MOCK_MODE=false` in production
2. Verify AI API keys are configured
3. Check Python scripts execute correctly
4. Test with sample data before deployment

### 2. Production Startup Validation ✅ ACTIVE

**Location**: `server/services/production-validator.ts`

Server validates on startup and **exits with code 1** if validation fails in production:
- Python bridge connectivity
- Redis connection (required in production)
- Database connectivity
- AI provider API keys
- Mock data detection (fails if found)

**→ All known issues:** See section below and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-issues)

---

## 🐛 Common Debugging Scenarios

### "Agent tools not working"
1. Check `server/index.ts` - Verify `initializeTools()` and `initializeAgents()` are called
2. Check server startup logs for initialization messages
3. Verify tool is registered in `server/services/mcp-tool-registry.ts`
4. Use `executeTool()` function - never call services directly

### "Database schema changes not applied"
1. Verify changes are in `shared/schema.ts`
2. Run `npm run db:push` (**CRITICAL** - uses `drizzle-kit push` internally)
3. Check for migration errors in console
4. Restart development server

### "Service file not found / duplicate implementations"
1. Check BOTH `server/*.ts` AND `server/services/*.ts`
2. **Prefer `server/services/` implementation** (modern location)
3. See [docs/ARCHITECTURE.md - Service File Locations](docs/ARCHITECTURE.md#service-file-locations)

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
- **[CLAUDE_IMPLEMENTATION_SUMMARY.md](CLAUDE_IMPLEMENTATION_SUMMARY.md)** - Complete implementation summary
- **[PM_AGENT_RESTORATION_SUMMARY.md](PM_AGENT_RESTORATION_SUMMARY.md)** - PM agent fixes

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
