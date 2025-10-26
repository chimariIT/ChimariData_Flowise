# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Last Updated**: January 2025 | **Status**: Active Development

> **Recent Updates**: Enhanced command reference, added debugging scenarios section, documented Python-TypeScript bridge patterns, expanded WebSocket architecture details, and clarified frontend routing/state management.

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
npm run check                  # TypeScript type checking (all files)
npm run check:client           # TypeScript check for client only

# Database
npm run db:push               # Push schema changes (after editing shared/schema.ts)

# Testing - Critical Before Changes
npm run test:user-journeys    # Run critical user journey tests
npm run test:production       # Full production test suite
npm run test:unit             # Vitest unit tests
npm run test:unit-watch       # Vitest in watch mode
npm run test                  # All Playwright E2E tests

# Testing Specific Areas
npm run test:unit:agents      # Agent-specific unit tests
npm run test:integration      # Integration tests
npm run test:e2e-tools        # End-to-end tool integration tests
```

### Quick Decision Tree

**Adding a new analysis type?**
→ See [Adding New Analysis Features](#adding-new-analysis-features)

**Modifying agents?**
→ See [Working with the Agentic System](#working-with-the-agentic-system)

**Changing database schema?**
→ Edit `shared/schema.ts` then run `npm run db:push`

**Adding new tools for agents?**
→ See [Tool-Based Architecture & MCP Integration](#tool-based-architecture--mcp-integration)

**Production deployment?**
→ See `PRODUCTION-READINESS.md` for complete checklist

**Mock data issues?**
→ See `MOCK-DATA-FIXES.md` for step-by-step resolution

---

## 🏗️ Architecture Overview

### Technology Stack
- **Frontend**: React 18 + TypeScript, Vite, Tailwind CSS + Radix UI
- **Backend**: Express.js + TypeScript, WebSocket for real-time updates
- **Database**: PostgreSQL with Drizzle ORM
- **Big Data**: Apache Spark for distributed processing and ML at scale
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: Wouter (lightweight React router)
- **Authentication**: Passport.js with OAuth providers

### Core Directory Structure
- `client/` - React frontend application
  - `src/components/` - Reusable UI components
  - `src/pages/` - Route-level page components
  - `src/hooks/` - Custom React hooks
  - `src/lib/` - Utility functions and API client
- `server/` - Express.js backend with TypeScript
  - `routes/` - API route handlers
  - `services/` - Business logic and integrations (preferred location)
  - `middleware/` - Express middleware functions
- `shared/` - Shared TypeScript schemas and types (Zod schemas)
- `migrations/` - Database migration files
- `python/` - Python analysis scripts for data processing
- `uploads/` - File upload directory (runtime-generated)
- `tests/` - E2E and integration tests
  - `unit/` - Vitest unit tests
  - `integration/` - Integration tests
  - `e2e/agents/` - Multi-agent E2E tests

### Key Configuration Files
- `vite.config.ts` - Frontend build with aliases (`@`, `@shared`, `@assets`)
- `drizzle.config.ts` - Database ORM configuration
- `playwright.config.ts` - E2E testing configuration (Chromium, Firefox, WebKit)
- `vitest.backend.config.ts` - Backend unit testing configuration
- `tailwind.config.ts` - CSS framework configuration
- `.env` - Environment variables (copy from `.env.example`)
- `tsconfig.json` - TypeScript compiler configuration

### Frontend Routing & State Management
**Routing**: Wouter (lightweight, ~1.2KB)
- Route definitions in `client/src/App.tsx`
- Protected routes via `useOptimizedAuth()` hook
- Journey-specific routes: `/data-step`, `/prepare-step`, `/execute-step`, `/results-step`

**State Management**:
- **React Query** (`@tanstack/react-query`): Server state, caching, mutations
- **Local State**: React hooks (useState, useReducer)
- **WebSocket State**: Real-time updates from agents

**Critical Hooks**:
- `useOptimizedAuth()` - Authentication state and user data
- `useProjectSession()` - Current project and journey state
- React Query hooks for API data fetching

**API Client Pattern** (`client/src/lib/api.ts`):
```typescript
// All API calls go through centralized client
import { apiClient } from '@/lib/api';
const result = await apiClient.post('/api/projects', projectData);
```

---

## 🤖 Agentic Workflow Architecture

The platform implements a sophisticated multi-agent system with three specialized agents:

### 1. Analytics Project Manager Agent
**Location**: `server/services/project-manager-agent.ts`

**Responsibilities**:
- End-to-end project orchestration and workflow coordination
- User interaction management across journey types
- Project artifact dependency tracking
- Resource allocation and timeline management

### 2. Data Scientist Agent
**Location**: `server/services/technical-ai-agent.ts`

**Responsibilities**:
- Technical analysis planning and execution
- Dataset validation and statistical analysis
- ML model development and evaluation
- Technical artifact generation (code, models, reports)
- Data pipeline optimization using Spark

### 3. Business Agent
**Location**: `server/services/business-agent.ts`

**Responsibilities**:
- Line of business knowledge research
- Industry-specific template identification
- Business context interpretation and domain expertise
- Regulatory compliance insights

### Agent Coordination
- **Shared State**: Agents communicate through shared project state in `shared/schema.ts`
- **Real-time Sync**: WebSocket coordination in `server/realtime.ts`
- **MCP Server**: Unified resource access via `server/services/mcpai.ts` and `server/enhanced-mcp-service.ts`
- **Message Broker**: Redis-based agent-to-agent messaging (optional in dev, required in prod)

### Interactive Workflow
- **User Approval Process**: Agents present artifacts at each step requiring review before proceeding
- **Checkpoints**: Users approve/modify schema definitions, analysis plans, visualizations, insights
- **Decision Audit Trails**: All agent decisions and approvals tracked for transparency
- **Real-time Feedback**: Managed through `server/realtime.ts` with UI components in project pages

### WebSocket Communication Architecture
**Location**: `server/realtime.ts`, `client/src/lib/api.ts`

The platform uses WebSockets for real-time agent-to-user communication:

**Server-Side** (`server/realtime.ts`):
```typescript
class RealtimeServer {
  sendProjectUpdate(projectId: string, update: any)
  sendAgentMessage(userId: string, agentType: string, message: any)
  broadcastToProject(projectId: string, event: string, data: any)
}
```

**Client-Side** (`client/src/lib/api.ts`):
- WebSocket connection established on user authentication
- Real-time updates for: agent messages, project state changes, analysis progress
- Automatic reconnection handling

**Message Types**:
- `agent:message` - Agent communication to user
- `project:update` - Project state changes
- `analysis:progress` - Long-running analysis status
- `checkpoint:request` - Agent requesting user approval
- `error:notification` - Real-time error alerts

**Critical Pattern**: Always use WebSocket for agent-user interaction, never HTTP polling.

---

## 🔧 Tool-Based Architecture & MCP Integration

### Overview
**⚠️ CRITICAL PATTERN**: The platform uses a **tool-based architecture** where all analysis capabilities are exposed as modular tools that agents access through the MCP Tool Registry.

**Key Principle**: Agents should **NEVER** directly call service implementations. All operations must route through the Tool Registry.

### Architecture Flow
```
User Journey → Agent (via MCP) → Tool Registry → Tool Handler → Real Service Implementation
```

### Why This Matters
- ✅ Permission enforcement
- ✅ Usage tracking for billing
- ✅ Centralized error handling
- ✅ Service health monitoring
- ✅ Cost attribution

### Core Components

#### 1. Tool Registry (`server/services/mcp-tool-registry.ts`)
Central registry for all available tools with metadata and permissions.

**Key Functions**:
- `MCPToolRegistry.registerTool(toolDef)` - Register new tool
- `MCPToolRegistry.getTool(name)` - Get tool definition
- `MCPToolRegistry.canAgentUseTool(agentId, toolName)` - Check permissions
- `executeTool(toolName, agentId, input, context)` - Execute tool with validation

#### 2. Real Tool Handlers (`server/services/real-tool-handlers.ts`)
Connects registered tools to actual service implementations.

**Implemented Handlers**:
- `StatisticalAnalyzerHandler` → Real Python statsmodels integration
- `MLPipelineHandler` → Real scikit-learn via Python bridge
- `VisualizationEngineHandler` → Real matplotlib/plotly chart generation

#### 3. Registered Tools

**Core Analysis Tools** (`server/services/mcp-tool-registry.ts:216-304`):

1. **file_processor** - File upload, validation, schema detection
2. **schema_generator** - Auto-detect column types, constraints, relationships
3. **data_transformer** - Clean, transform, feature engineering
4. **statistical_analyzer** ✅ - Real ANOVA, regression, correlation (Python statsmodels)
5. **ml_pipeline** ✅ - Real model training, prediction, evaluation (scikit-learn)
6. **visualization_engine** ✅ - Real charts, dashboards (matplotlib/plotly)
7. **business_templates** - Industry-specific formatting, reports
8. **project_coordinator** - Workflow coordination, artifact tracking
9. **decision_auditor** - Decision logging, audit trails

### Agent-Tool Permission Matrix

| Agent Type | Accessible Tools |
|-----------|------------------|
| **Data Scientist** | file_processor, schema_generator, data_transformer, statistical_analyzer, ml_pipeline, visualization_engine, decision_auditor |
| **Business Agent** | business_templates, visualization_engine, decision_auditor |
| **Project Manager** | file_processor, project_coordinator, decision_auditor |
| **Data Engineer** | file_processor, schema_generator, data_transformer |

### Agent Implementation Pattern

#### ❌ WRONG - Direct Service Calls
```typescript
// DO NOT DO THIS - Bypasses tool registry
async processQuery(query: TechnicalQueryType): Promise<any> {
  const analyzer = new AdvancedAnalyzer();
  const result = await analyzer.performStepByStepAnalysis(data, config);
  return result;
}
```

#### ✅ CORRECT - Tool Registry Pattern
```typescript
// DO THIS - Routes through tool registry
async processQuery(query: TechnicalQueryType): Promise<any> {
  const { executeTool } = require('./mcp-tool-registry');

  const toolName = this.mapQueryTypeToTool(query.type);

  const toolResult = await executeTool(
    toolName,
    'technical_ai_agent',
    { data: query.data, config: query.parameters },
    { userId: query.context.userId, projectId: query.context.projectId }
  );

  return {
    success: toolResult.status === 'success',
    result: toolResult.result,
    engine: 'tool-registry',
    tool: toolName,
    metrics: toolResult.metrics
  };
}
```

---

## 📊 Data Model & Relationships

### Core Entity Model
```
User (1) ---> (0..n) Project
Project (1) ---> (0..n) Dataset
Dataset (0..n) <---> (0..n) Project (many-to-many)
```

### Database Schema (`shared/schema.ts`)
1. **Users**: Authentication, roles, permissions, subscription tiers
2. **Projects**: Lightweight containers for analysis workflows with journey types
3. **Datasets**: Reusable data artifacts with schema, transformations, lineage
4. **Artifacts**: Generated outputs (visualizations, models, reports) linked to projects
5. **Streaming Sources**: Real-time data ingestion configurations

### Key Relationships
- Users own multiple projects across different journey types
- Projects can reference multiple datasets for complex analyses
- Datasets are shareable across projects for reusability
- Artifacts maintain lineage to both projects and source datasets

---

## 🚦 User Journey Framework

### Journey Types
- **AI-Guided** (`ai_guided`): Full agent orchestration for non-technical users
- **Template-Based** (`template_based`): Structured workflows for business users
- **Self-Service** (`self_service`): Full control for technical users
- **Consultation** (`consultation`): Expert-assisted analysis

### Journey Initiation
Every user journey begins with:
1. **Project Objectives Definition**: Clear goal articulation
2. **Business Context Definition**: Domain and industry context
3. **Analysis Questions**: Specific questions to be answered
4. **Goal Definition**: Success criteria and deliverables

### Journey Artifacts by Type

#### Non-Tech Journey
- Executive summaries (plain-language insights)
- Visual dashboards (interactive charts)
- PDF reports (no technical jargon)
- Business recommendations (actionable outcomes)

#### Business Journey
- Business intelligence reports (industry benchmarks)
- Regulatory compliance insights
- ROI analysis
- Presentation-ready charts
- Strategic recommendations

#### Technical Journey
- Code generation (Python/R scripts)
- Statistical test results (detailed methodologies)
- ML model artifacts (trained models, feature importance)
- Technical documentation (pipeline specs)
- Raw data access

#### Consultation Journey
- Personalized consultation reports
- Custom methodology design
- Peer review insights
- Strategic advisory documents
- Expert involvement (highest customization)

---

## 🔬 Analysis Components

### Data Ingestion
**Location**: `server/services/file-processor.ts`, `server/services/unified-pii-processor.ts`

- File upload with validation and malware scanning
- Automatic PII detection and anonymization
- Schema detection and data profiling
- Cloud storage integration (AWS, Azure, Google Cloud)

### Data Transformation
**Location**: `server/services/data-transformer.ts`, `server/services/spark-processor.ts`

- **Spark Integration**: Heavy transformations, distributed processing
- Data cleaning, filtering, aggregation
- Multi-dataset joining and merging
- Real-time streaming data processing
- Schema evolution management

### Statistical Analysis
**Location**: `server/services/advanced-analyzer.ts`, `python/statistical_tests.py`

- Descriptive and inferential statistics
- Hypothesis testing (ANOVA, ANCOVA, MANOVA, MANCOVA)
- Regression analysis and time series forecasting
- Anomaly detection and pattern recognition
- **UI**: `client/src/components/advanced-analysis-modal.tsx`

### Machine Learning Pipeline
**Location**: `server/services/ml-service.ts`, `python/ml-analysis.py`

- Feature engineering and selection
- Model training (supervised/unsupervised with Spark MLlib)
- Model deployment and real-time scoring
- End-to-end ML workflows with Spark

### Visualization Engine
**Location**: `server/services/visualization-api-service.ts`, `python/visualization_generator.py`

- 8 chart types with interactive configuration
- Real-time dashboard updates
- Custom visualization development
- Export capabilities (PNG, SVG, PDF)

### Python-TypeScript Bridge
**Location**: `server/services/python-processor.ts`

The platform uses child process spawning to execute Python analysis scripts:

**Pattern**:
```typescript
// TypeScript calls Python script
const result = await executePythonScript('statistical_tests.py', {
  data: dataset,
  testType: 'anova',
  config: analysisConfig
});
```

**Available Python Scripts** (`python/`):
- `statistical_tests.py` - ANOVA, regression, correlation, t-tests
- `ml_training.py` - ML model training and evaluation
- `visualization_generator.py` - Chart generation with matplotlib/plotly
- `descriptive_stats.py` - Summary statistics and distributions
- `classification_analysis.py` - Classification models
- `clustering_analysis.py` - K-means, hierarchical clustering
- `regression_analysis.py` - Linear, polynomial, ridge regression
- `correlation_analysis.py` - Pearson, Spearman correlations
- `llm_fine_tuning.py` - LLM fine-tuning workflows
- `comprehensive_ml_lifecycle.py` - End-to-end ML pipeline

**Critical Requirements**:
- Python scripts must output JSON to stdout for TypeScript parsing
- Use `server/services/enhanced-python-processor.ts` for advanced error handling
- All Python dependencies must be in requirements.txt
- Scripts receive input via command-line JSON argument

---

## ⚡ Spark Integration

### Heavy Data Processing
**Location**: `server/services/spark-processor.ts`

- **Distributed Computing**: Large dataset processing using Spark clusters
- **Streaming Analytics**: Real-time data processing with Spark Streaming
- **ML at Scale**: Distributed machine learning with Spark MLlib
- **Data Lake Integration**: Direct access to data lakes and warehouses

### Spark Use Cases
- Data transformations exceeding memory limits
- Complex multi-table joins and aggregations
- Real-time streaming data analysis
- Large-scale machine learning model training
- Time series analysis on historical datasets

### Performance Optimization
- Automatic Spark cluster scaling based on workload
- Intelligent data partitioning and caching
- Query optimization and execution planning
- Resource management and cost optimization

---

## 💳 Subscription and Pricing System

### Subscription Tiers
**Location**: `shared/subscription-tiers.ts`

- **Trial**: Limited usage for evaluation
- **Starter**: Basic features with usage quotas
- **Professional**: Advanced features with higher quotas
- **Enterprise**: Unlimited usage with custom integrations

### Pricing Models
**Location**: `server/services/pricing.ts`, `server/services/enhanced-billing-service.ts`

- **User Categories**: Subscription users (tier-based quotas/discounts) and non-subscription users (pay-per-use)
- **Subscription-Aware Pricing**: User journeys check eligibility and current usage against quotas
- **Quota Management**: Remaining quota used first (free), then overage charges apply
- **Dynamic Pricing**: Adjusts based on subscription tier discounts and capacity
- **Usage Tracking**: Real-time monitoring of data volume, AI queries, analysis components, visualizations

### Billing Integration
**Location**: `client/src/pages/checkout.tsx`, `server/routes/billing.ts`

- Stripe integration for payment processing
- Capacity tracking and subscription management
- Cost estimation based on journey type, data size, features

---

## 🔒 Security and Compliance

### Authentication & Security
- **Email/Password Auth**: Password hashing (10 rounds), email verification via SendGrid
- **OAuth Providers**: Google (primary), Microsoft/Apple ready
- **Configuration**: `server/oauth-config.ts`, `server/oauth-providers.ts`
- **Session Management**: Passport.js with PostgreSQL session store
- **Security Patterns**: JWT tokens, CSRF protection, secure cookies

### Data Protection
- Automatic PII detection and anonymization (`server/services/unified-pii-processor.ts`)
- GDPR and CCPA compliance features
- Data encryption at rest and in transit
- Audit trails for all data access

### Access Control
- Role-based permissions: `non-tech`, `business`, `technical`, `consultation`
- **Permission Service**: `server/services/role-permission.ts`
- Project-level access controls
- API authentication and rate limiting
- Secure multi-tenant architecture

---

## 🧪 Testing Strategy

### Critical Tests (Run Before Major Changes)
```bash
npm run test:user-journeys    # Critical user journey regression tests
npm run test:production       # Production-ready end-to-end flow tests
```

### Test Categories

#### End-to-End Tests (Playwright)
```bash
npm run test                  # All Playwright tests
npm run test:ui              # Playwright UI mode
npm run test:debug           # Debug mode
```

#### User Journey Tests
```bash
npm run test:user-journeys         # Critical path tests
npm run test:user-journeys-headed  # With browser UI
```

#### Production Tests
```bash
npm run test:production           # Full production suite
npm run test:production-users     # User workflow tests
npm run test:production-admin     # Admin billing/subscription tests
npm run test:production-agents    # Agent & tool management tests
```

#### Unit Tests (Vitest)
```bash
npm run test:unit            # Run all unit tests
npm run test:unit-watch      # Watch mode
npm run test:unit:agents     # Agent-specific tests
```

---

## 🛠️ Development Guidelines

### Working with the Agentic System

#### Adding New Agent Capabilities
1. Define agent interface in `server/types.ts`
2. Implement agent logic in `server/services/` (follow patterns in existing agents)
3. Register agent with MCP server in `server/services/mcpai.ts`
4. Add agent permissions via `server/services/role-permission.ts`
5. Update coordination logic in `server/services/project-manager-agent.ts`
6. Test agent interactions via WebSocket (`server/realtime.ts`)

#### Agent Communication Patterns
- Agents communicate through shared project state in database
- Real-time coordination via WebSocket connections
- Use `shared/schema.ts` types for consistency
- Follow role-based permission model for resource access

### Adding New Analysis Features

#### Step-by-Step Process
1. **Define Analysis Type** in `shared/schema.ts`
2. **Create Python Script** in `python/` directory for real computation
3. **Add Tool Handler** in `server/services/real-tool-handlers.ts`
4. **Register Tool** in `server/services/mcp-tool-registry.ts`
5. **Update Agent Logic** to route analysis through tool registry
6. **Add UI Component** in `client/src/components/`
7. **Test Integration** with unit and E2E tests

### Database Schema Evolution
1. Modify schemas in `shared/schema.ts` using Zod
2. **CRITICAL**: Run `npm run db:push` to apply changes
3. Test migration with sample data
4. Update API endpoints and frontend components
5. Document breaking changes

### Extending Spark Integration
1. Add new processing functions in `server/services/spark-processor.ts`
2. Define Spark job configurations in service layer
3. Implement distributed algorithms for heavy data processing
4. Add monitoring and error handling
5. Update resource estimation in `server/services/pricing.ts`
6. Integrate with `server/services/technical-ai-agent.ts` for automatic delegation

---

## 🌍 Environment Setup

### Required Environment Variables
Create `.env` file from `.env.example`:

```bash
# Required
DATABASE_URL="postgresql://..."              # PostgreSQL connection
GOOGLE_AI_API_KEY="..."                      # AI provider key

# Optional in Development, Required in Production
REDIS_URL="redis://..."                      # Redis for agent coordination
REDIS_ENABLED="true"                         # Enable Redis (default: false in dev)

# Payment Processing (Optional)
STRIPE_SECRET_KEY="sk_..."
VITE_STRIPE_PUBLIC_KEY="pk_..."

# Email Services (Optional)
SENDGRID_API_KEY="SG..."

# Big Data Processing (Optional)
SPARK_MASTER_URL="spark://..."

# OAuth Providers (Optional)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GITHUB_CLIENT_ID="..."
GITHUB_CLIENT_SECRET="..."
MICROSOFT_CLIENT_ID="..."
MICROSOFT_CLIENT_SECRET="..."
```

### Redis Setup

#### Development
Redis is **optional** in development with automatic fallback:
- **AgentMessageBroker**: Falls back to in-memory EventEmitter
- **EnhancedCacheService**: Uses L1 cache only (in-memory LRU)

To enable Redis:
```bash
docker-compose -f docker-compose.dev.yml up -d
# Set REDIS_ENABLED=true in .env
npm run dev
```

See `DOCKER-SETUP.md` for detailed Redis configuration.

#### Production
Redis is **required** in production for:
- Real-time agent-to-agent communication
- Distributed caching across server instances
- WebSocket session management

Set `NODE_ENV=production` to auto-enable Redis (fallback disabled).

---

## 📁 Service File Locations

**⚠️ IMPORTANT**: The codebase has service files in two locations due to ongoing refactoring:

- **Legacy location**: `server/*.ts` (e.g., `server/file-processor.ts`)
- **Modern location**: `server/services/*.ts` (e.g., `server/services/file-processor.ts`)

### Current State
- Some services exist in BOTH locations with different implementations
- `server/services/` is the target architecture
- Migration is incomplete

### For New Development
- **Always use `server/services/`** for new services
- Check if service exists in both locations before modifying
- Prefer newer `server/services/` implementation when conflicts exist

### Known Duplicates
- File processor: `server/file-processor.ts` vs `server/services/file-processor.ts`
- PII handling: `server/unified-pii-processor.ts` vs `server/services/unified-pii-processor.ts`
- Billing: Multiple versions across both directories (see `PRODUCTION-READINESS.md`)

---

## 🚨 Known Critical Issues

### 1. Mock Data Visible to Users
**Status**: 🔴 **CRITICAL** - Impacts production readiness

**Issue**: Technical AI agent and Spark processor return simulated/random results to users.

**Locations**:
- `server/services/technical-ai-agent.ts:97-107` - Mock query results
- `server/services/technical-ai-agent.ts:582-636` - Simulated ML metrics
- `server/services/spark-processor.ts:194-306` - Mock fallback behavior

**User Impact**:
- Users receive randomized ML model performance metrics
- Analysis results contain "mock" or "simulated" in metadata but users don't see warnings
- Statistical analyses show synthetic distributions and correlations

**Resolution**: See `MOCK-DATA-FIXES.md` for complete step-by-step guide.

### 2. Tool Registry Initialization Pattern
**Status**: ⚠️ **PARTIALLY INTEGRATED** - Requires manual verification

**Architecture**: The application uses a three-tier initialization pattern at startup (`server/index.ts:14-17`):

```typescript
import { initializeAgents } from './services/agent-initialization';
import { initializeTools } from './services/tool-initialization';
import { registerCoreTools } from './services/mcp-tool-registry';
```

**Critical Initialization Order**:
1. **Core Tools Registration** (`registerCoreTools()`) - Static tool definitions
2. **Tool Initialization** (`initializeTools()`) - Dynamic tool setup
3. **Agent Initialization** (`initializeAgents()`) - Agent-to-tool bindings

**Important Notes**:
- Initialization functions are imported but check `server/index.ts` startup sequence to verify they're called
- `server/services/tool-initialization.ts` (1063 lines) contains comprehensive tool setup logic
- `server/services/agent-initialization.ts` (664 lines) handles agent configuration
- If tools aren't working dynamically, verify the startup call chain in `server/index.ts`

**Verification**: After modifying initialization logic, always check server startup logs for initialization confirmation messages.

### 3. ~~Billing System Fragmentation~~ (RESOLVED)
**Status**: ✅ **CONSOLIDATED** - Production ready

**Resolution**: Unified billing service implemented at `server/services/billing/unified-billing-service.ts` (1,363 lines)

**Features**:
- ✅ Stripe integration with webhook signature verification
- ✅ Transaction-safe database operations
- ✅ Journey and feature-based billing
- ✅ Quota management with overage calculation
- ✅ ML/LLM cost tracking integration

**Legacy Files** (deprecated, not used):
- ~~`server/services/enhanced-billing-service.ts`~~ - Marked deprecated
- ~~`server/services/enhanced-subscription-billing.ts`~~ - Marked deprecated

**Usage**:
```typescript
import { getBillingService } from './services/billing/unified-billing-service';

const billingService = getBillingService();
await billingService.trackFeatureUsage(userId, featureId, complexity);
```

**Documentation**: See `BILLING_INTEGRATION_REVIEW.md` for complete audit.

---

## 🔗 Related Documentation

- **`README.md`** - Quick start, features, deployment options
- **`PRODUCTION-READINESS.md`** - Complete production deployment checklist and critical issues
- **`MOCK-DATA-FIXES.md`** - Step-by-step guide to replace mock data with real analysis
- **`DOCKER-SETUP.md`** - Comprehensive Docker and Redis setup
- **`.env.example`** - Required environment variables with descriptions

---

## 🐛 Common Debugging Scenarios

### "Agent tools not working"
1. Check `server/index.ts` - Verify `initializeTools()` and `initializeAgents()` are called
2. Check server startup logs for initialization messages
3. Verify tool is registered in `server/services/mcp-tool-registry.ts`
4. Check agent permissions in `server/services/role-permission.ts`
5. Use `executeTool()` function - never call services directly

### "Database schema changes not applied"
1. Verify changes are in `shared/schema.ts`
2. Run `npm run db:push` (critical step)
3. Check for migration errors in console
4. Restart development server
5. Verify changes with database client

### "Service file not found / duplicate implementations"
1. Check BOTH `server/*.ts` AND `server/services/*.ts`
2. Prefer newer `server/services/` implementation
3. See [Service File Locations](#service-file-locations) section
4. Use Grep/Glob tools to find all instances

### "Redis connection errors"
1. Development: Set `REDIS_ENABLED=false` in `.env` (fallback to in-memory)
2. Production: Verify `REDIS_URL` environment variable
3. Check `docker-compose.dev.yml` if using Docker
4. Verify `NODE_ENV` setting (auto-enables Redis in production)

### "Mock/simulated data appearing in results"
1. See `MOCK-DATA-FIXES.md` for comprehensive resolution
2. Check `server/services/technical-ai-agent.ts:97-107, 582-636`
3. Check `server/services/spark-processor.ts:194-306`
4. Verify Python scripts are being called correctly

---

## 📝 Development Checklist

### Before Making Changes
- [ ] Read relevant sections of this document
- [ ] Check if similar functionality exists elsewhere (use Grep/Glob tools)
- [ ] Review `shared/schema.ts` for data model understanding
- [ ] Check both `server/*.ts` AND `server/services/*.ts` for service duplicates

### After Making Changes
- [ ] Run `npm run db:push` if schema changed (CRITICAL - don't skip)
- [ ] Run `npm run check` for TypeScript errors
- [ ] Run `npm run test:user-journeys` for regression testing
- [ ] Update relevant documentation
- [ ] Test with both Redis enabled and disabled (if agent/caching changes)
- [ ] Verify no mock data in user-facing responses

### Before Production Deployment
- [ ] Review `PRODUCTION-READINESS.md` complete checklist
- [ ] Run full test suite: `npm run test:production`
- [ ] Verify no mock data endpoints active (search codebase for "mock", "simulated")
- [ ] Confirm all environment variables set
- [ ] Test agent coordination with Redis enabled
- [ ] Validate Stripe webhook signatures
- [ ] Review security configurations
- [ ] Verify production validation passes (`server/services/production-validator.ts`)

---

**For detailed architecture patterns, service organization, and production considerations, see the related documentation files listed above.**
