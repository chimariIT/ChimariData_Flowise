# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Running
- `npm run dev` - Start development server (runs tsx server/index.ts)
- `npm run build` - Build for production (vite build + esbuild bundle)
- `npm run start` - Start production server
- `npm run check` - TypeScript type checking

### Database Operations
- `npm run db:push` - Push schema changes to database using Drizzle Kit
- Database configuration is in `drizzle.config.ts` using PostgreSQL

### Testing
- `npm run test` - Run Playwright tests
- `npm run test:ui` - Run tests with Playwright UI
- `npm run test:debug` - Run tests in debug mode
- `npm run test:user-journeys` - Run specific user journey tests (critical path)
- `npm run test:user-journeys-headed` - Run user journey tests with browser UI
- `npm run test:ui-comprehensive` - Run comprehensive UI tests
- `npm run test:ui-comprehensive-headed` - Run comprehensive tests with browser UI
- `npm run test:screenshots` - Generate UI screenshots for validation
- `npm run test:journey-screenshots` - Capture user journey screenshots
- `npm run test:ui-screens` - Run UI screen capture tests
- `npm run test:ui-screens-headed` - Run UI screen capture tests with browser UI
- `npm run test:enhanced-features` - Run enhanced features tests
- `npm run test:enhanced-features-headed` - Run enhanced features tests with browser UI
- `npm run test:dynamic-templates` - Run dynamic template engine tests
- `npm run test:dynamic-templates-headed` - Run dynamic template engine tests with browser UI
- `npm run test:unit` - Run Vitest unit tests
- `npm run test:unit-watch` - Run Vitest unit tests in watch mode

**IMPORTANT**: Always run `npm run test:user-journeys` before major changes as these are critical regression tests.

## Architecture Overview

### Technology Stack
- **Frontend**: React 18 + TypeScript, Vite for bundling, Tailwind CSS + Radix UI
- **Backend**: Express.js + TypeScript, WebSocket support for real-time updates
- **Database**: PostgreSQL with Drizzle ORM, migrations in `/migrations`
- **Big Data Processing**: Apache Spark for heavy transformations, ML, and streaming
- **State Management**: React Query (@tanstack/react-query)
- **Routing**: Wouter (lightweight React router)
- **Authentication**: Passport.js with multiple OAuth providers

### Core Directory Structure
- `client/` - React frontend application
- `server/` - Express.js backend with TypeScript
- `shared/` - Shared TypeScript schemas and types (Zod schemas)
- `migrations/` - Database migration files
- `python/` - Python analysis scripts for data processing
- `uploads/` - File upload directory

## Agentic Workflow Architecture

The platform implements a sophisticated multi-agent system with three specialized agents:

### 1. Analytics Project Manager Agent
**Location**: `server/workflow-service.ts`
**Responsibilities**:
- End-to-end project management and orchestration
- User interaction management and journey coordination
- Project artifact dependency tracking
- Delivery timeline management
- Resource allocation and optimization

### 2. Data Scientist Agent
**Location**: `server/technical-ai-agent.ts`
**Responsibilities**:
- Technical analysis planning and execution
- Dataset selection and validation
- Statistical analysis and ML model development
- Technical artifact generation (code, models, reports)
- Data pipeline optimization using Spark

### 3. Business Agent
**Location**: `server/goal-analysis-engine.ts`
**Responsibilities**:
- Line of business knowledge research
- Industry-specific template identification
- Business context interpretation
- Domain expertise integration
- Business insight generation

### Agent Coordination
- Agents communicate through shared project state in `shared/schema.ts`
- MCP server provides unified resource access for all agents
- Real-time coordination via WebSocket in `server/realtime.ts`

#### Interactive Step-by-Step Workflow
- **User Approval Process**: Agents present artifacts at each step requiring user review and feedback before proceeding
- **Interactive Components**: Users must approve/modify outputs like schema definitions, analysis plans, visualizations, and insights
- **Real-time Feedback**: Interactive workflow managed through `server/realtime.ts` with UI feedback components in project pages
- **Decision Audit Trails**: All agent decisions and user approvals are tracked for workflow transparency

### Service Organization (`server/services/`)
The codebase follows a clean service-oriented architecture with specialized services in the `server/services/` directory:

#### Core Agent Services
- `technical-ai-agent.ts` - Advanced data science agent with ML capabilities and Spark integration
- `business-agent.ts` - Industry-specific business intelligence with regulatory compliance
- `project-manager-agent.ts` - Workflow orchestration with dependency management and artifact tracking

#### AI & Intelligence Services
- `role-based-ai.ts` - Role-specific AI model selection and prompt templating
- `mcpai.ts` - Model Context Protocol integration for unified AI access
- `ai-router.ts` - Multi-provider AI routing with fallback support
- `ai-optimization.ts` - AI performance optimization and resource management
- `ai-payment-integration.ts` - AI usage billing and cost tracking
- `technical-ai-features.ts` - Advanced technical AI capabilities
- `consultation-ai.ts` - Expert consultation AI features
- `journey-prompts.ts` - Journey-specific prompt templates
- `subscription-journey-mapping.ts` - Subscription tier to journey mapping

#### Data Processing Services
- `spark-processor.ts` - Apache Spark integration for distributed data processing
- `data-transformer.ts` - Data transformation and cleaning pipelines
- `unified-pii-processor.ts` - Advanced PII detection and anonymization
- `data-transformation.ts` - Core data transformation utilities
- `file-processor.ts` - File upload and processing pipeline
- `pii.ts` - PII detection and anonymization utilities

#### Business Intelligence Services
- `pricing.ts` - Usage-based pricing and cost estimation
- `usage-tracking.ts` - Real-time usage monitoring and limits
- `role-permission.ts` - Role-based access control system

#### Enhanced Services
- `enhanced-billing-service.ts` and `enhanced-billing-service-v2.ts` - Advanced billing with subscription-aware pricing
- `chimaridata-ai.ts` - Core AI service integration
- `time-series-analyzer.ts` - Time series analysis and forecasting
- `python-processor.ts` - Python script execution for data analysis
- `cloud-connector.ts` - Multi-cloud storage integration (AWS, Azure, Google Cloud)
- `google-drive.ts` - Google Drive integration service
- `storage.ts` - Unified storage abstraction layer
- `security.ts` - Security validation and protection
- `email.ts` - Email service integration (SendGrid)
- `export-service.ts` - Data and report export functionality
- `temp-store.ts` - Temporary data storage management
- `cache.ts` - Intelligent caching system

## MCP Server Integration

### Architecture
**Location**: `server/mcp-ai-service.ts`

The MCP (Model Context Protocol) server provides agents with application and internet tools through API access points:

### Available Resources
- **Tool Resources**: Data processing, visualization, analysis tools
- **Model Resources**: Multi-provider AI models (Gemini, OpenAI, Anthropic)
- **Database Resources**: Direct database access for agents
- **API Resources**: External service integrations

### Agent Permissions
Each agent has specific resource permissions defined in the MCP configuration:
- Data Scientist Agent: Full data processing, ML tools, Spark cluster access
- Business Agent: Research tools, industry databases, template libraries
- Project Manager Agent: Orchestration tools, user interaction, progress tracking

## Object Relationships

### Core Entity Model
```
User (1) ---> (0..n) Project
Project (1) ---> (0..n) Dataset
Dataset (0..n) <---> (0..n) Project (many-to-many)
```

### Database Schema (shared/schema.ts)
1. **Users**: Authentication, roles, permissions, subscription tiers
2. **Projects**: Lightweight containers for analysis workflows with journey types
3. **Datasets**: Reusable data artifacts with schema, transformations, and lineage
4. **Artifacts**: Generated outputs (visualizations, models, reports) linked to projects
5. **Streaming Sources**: Real-time data ingestion configurations

### Key Relationships
- Users own multiple projects across different journey types
- Projects can reference multiple datasets for complex analyses
- Datasets are shareable across projects for reusability
- Artifacts maintain lineage to both projects and source datasets

## User Journey Framework

### Journey Initiation
Every user journey begins with:
1. **Project Objectives Definition**: Clear goal articulation
2. **Business Context Definition**: Domain and industry context
3. **Analysis Questions**: Specific questions to be answered
4. **Goal Definition**: Success criteria and deliverables

### Project Workspace
Projects serve as workspaces containing:
- Data ingestion and PII analysis pipeline
- Schema definition and validation
- Transformation and analysis components
- Generated artifacts and exports

### Journey Types
- **AI-Guided**: Full agent orchestration for non-technical users
- **Template-Based**: Structured workflows for business users
- **Self-Service**: Full control for technical users
- **Consultation**: Expert-assisted analysis

### User Journey Artifacts & Deliverables

#### Non-Tech Journey
- **Executive Summaries**: Plain-language insights and actionable business recommendations
- **Visual Dashboards**: Interactive charts and simplified visualizations
- **PDF Reports**: Comprehensive analysis reports without technical jargon
- **Business Recommendations**: Focus on strategic decisions and outcomes

#### Business Journey
- **Business Intelligence Reports**: Professional reports with industry benchmarks
- **Regulatory Compliance Insights**: Industry-specific compliance analysis
- **ROI Analysis**: Cost-benefit analysis and return on investment calculations
- **Presentation-Ready Charts**: Publication-quality visualizations for stakeholder presentations
- **Strategic Recommendations**: Templates tailored to business domains

#### Technical Journey
- **Code Generation**: Python/R scripts for reproducible analysis
- **Statistical Test Results**: Detailed statistical analysis with methodologies
- **ML Model Artifacts**: Trained models, feature importance, and performance metrics
- **Technical Documentation**: Data pipeline specifications and analysis methodologies
- **Raw Data Access**: Full access to transformed datasets and intermediate results

#### Consultation Journey
- **Personalized Consultation Reports**: Expert-guided analysis with custom methodologies
- **Custom Methodology Design**: Tailored analytical approaches for specific business problems
- **Peer Review Insights**: Expert validation and recommendations
- **Strategic Advisory Documents**: High-level strategic guidance and implementation roadmaps
- **Expert Involvement**: Highest level of customization with expert oversight

## Analysis Components

### Data Ingestion
**Location**: `server/file-processor.ts`, `server/unified-pii-processor.ts`
- File upload with validation and malware scanning
- Automatic PII detection and anonymization
- Schema detection and data profiling
- Cloud storage integration (AWS, Azure, Google Cloud)

### Data Transformation
**Location**: `server/data-transformer.ts`, `server/services/spark-processor.ts`
- **Spark Integration**: Heavy transformations, distributed processing
- Data cleaning, filtering, aggregation
- Multi-dataset joining and merging
- Real-time streaming data processing
- Schema evolution management

### Statistical Analysis
**Location**: `server/ml-service.ts`, `server/advanced-analyzer.ts`
- Descriptive and inferential statistics
- Hypothesis testing (ANOVA, ANCOVA, MANOVA, MANCOVA)
- Regression analysis and time series forecasting
- Anomaly detection and pattern recognition
- **Statistical UI**: `client/src/components/advanced-analysis-modal.tsx` - guided analysis configuration
- **Python Integration**: Statistical computing via `python_scripts/data_analyzer.py` with JSON I/O

### Machine Learning Pipeline
**Location**: `server/ml-service.ts`, `python/ml-analysis.py`
- **Feature Engineering**: Automated feature selection and transformation
- **Model Training**: Supervised and unsupervised learning with Spark MLlib
- **Model Deployment**: Real-time scoring and batch prediction
- **Data Pipeline Integration**: End-to-end ML workflows with Spark

### Visualization Engine
**Location**: `server/visualization-api-service.ts`, `python/visualization_generator.py`
- 8 chart types with interactive configuration
- Real-time dashboard updates
- Custom visualization development
- Export capabilities (PNG, SVG, PDF)

## Spark Integration

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

## Subscription and Pricing System

### Subscription Tiers
**Location**: `shared/subscription-tiers.ts`
- **Trial**: Limited usage for evaluation
- **Starter**: Basic features with usage quotas
- **Professional**: Advanced features with higher quotas
- **Enterprise**: Unlimited usage with custom integrations

### Pricing Models
**Location**: `server/services/pricing.ts` and `server/services/enhanced-billing-service.ts`
- **User Categories**: System supports both subscription users (with tier-based quotas and discounts) and non-subscription users (pay-per-use model)
- **Subscription-Aware Pricing**: User journeys check subscription eligibility and current usage against quotas
- **Quota Management**: Remaining quota used first (free), then overage charges apply
- **Dynamic Pricing**: Pricing adjusts based on subscription tier discounts and available capacity
- **Usage Tracking**: Real-time monitoring of data volume, AI queries, analysis components, and visualizations

### Billing Integration
**Location**: `client/src/pages/checkout.tsx` and `server/routes/billing.ts`
- Stripe integration for payment processing
- Capacity tracking and subscription management
- Cost estimation based on journey type, data size, and features

## Export and Artifact Management

### Export Formats
- **PDF Reports**: Comprehensive analysis reports with visualizations
- **CSV Downloads**: Processed and transformed datasets
- **Presentation Mode**: Interactive dashboards for stakeholder presentations
- **Dashboard Access**: Persistent access to analysis results

### Artifact Lifecycle
**Location**: `shared/schema.ts` - artifacts table
- Version control for analysis artifacts
- Dependency tracking between artifacts
- Automated artifact generation pipelines
- Sharing and collaboration capabilities

## Security and Compliance

### Authentication & Security
- **Authentication Types**: Two methods - Email/password authentication and OAuth providers
- **Email Services**: Password reset and email verification managed through SendGrid integration (`server/email-auth.ts`)
- **OAuth Providers**: Google (primary), Microsoft/Apple ready. Configuration in `server/oauth-config.ts` and `server/oauth-providers.ts`
- **Session Management**: Passport.js with PostgreSQL session store (`server/oauth-config.ts`)
- **Security Patterns**: JWT tokens, CSRF protection, secure cookies
- **User Flow**: Registration → email verification → role-based access → protected routes

### Data Protection
- Automatic PII detection and anonymization (`server/unified-pii-processor.ts`)
- GDPR and CCPA compliance features
- Data encryption at rest and in transit
- Audit trails for all data access

### Access Control
- Role-based permissions (non-tech, business, technical, consultation) in `server/services/role-permission.ts`
- Project-level access controls
- API authentication and rate limiting
- Secure multi-tenant architecture

## Development Guidelines

### Project Structure & Key Files
- **User Dashboard**: `client/src/pages/dashboard.tsx` - project cards, quick actions, recent activity
- **Project Page**: `client/src/pages/project-page.tsx` - tabs for data, analysis, visualizations, artifacts
- **Core Schema**: `shared/schema.ts` - all database schemas and types
- **Environment Config**: Copy `.env.example` to `.env` and configure required variables
- **Database Config**: `drizzle.config.ts` - database ORM configuration
- **Frontend Config**: `vite.config.ts` - build configuration with aliases (`@`, `@shared`, `@assets`)
- **Testing Config**: `playwright.config.ts` - E2E testing configuration

### Working with the Agentic System
When modifying or extending the multi-agent architecture:

#### Adding New Agent Capabilities
1. Define agent interface in `server/types.ts`
2. Implement agent logic in `server/services/` (follow patterns in `technical-ai-agent.ts`, `business-agent.ts`)
3. Register agent with MCP server in `server/services/mcpai.ts`
4. Add agent permissions via `server/services/role-permission.ts`
5. Update coordination logic in `server/services/project-manager-agent.ts`
6. Test agent interactions via WebSocket (`server/realtime.ts`)

#### Agent Communication Patterns
- Agents communicate through shared project state in database
- Real-time coordination via WebSocket connections
- Use `shared/schema.ts` types for consistency across agents
- Follow role-based permission model for resource access

### Extending Spark Integration
1. Add new processing functions in `server/services/spark-processor.ts`
2. Define Spark job configurations in service layer
3. Implement distributed algorithms for heavy data processing
4. Add monitoring and error handling
5. Update resource estimation in `server/services/pricing.ts` for cost optimization
6. Integrate with `server/services/technical-ai-agent.ts` for automatic delegation based on data size

### Database Schema Evolution
1. Modify schemas in `shared/schema.ts` using Zod
2. Run `npm run db:push` to apply changes
3. Test migration with sample data
4. Update API endpoints and frontend components
5. Document breaking changes and migration path

### Key Configuration Files
- `vite.config.ts` - Frontend build configuration with aliases (`@`, `@shared`, `@assets`)
- `drizzle.config.ts` - Database ORM configuration pointing to `shared/schema.ts`
- `playwright.config.ts` - E2E testing configuration with extended timeouts
- `tailwind.config.ts` - CSS framework configuration

### Environment Setup
Required environment variables in `.env`:
- `DATABASE_URL` - PostgreSQL connection string (required)
- `GOOGLE_AI_API_KEY` - AI provider key (required)
- `STRIPE_SECRET_KEY` - Payment processing (optional)
- `VITE_STRIPE_PUBLIC_KEY` - Stripe public key for frontend (optional)
- `SENDGRID_API_KEY` - Email service (optional)
- `SPARK_MASTER_URL` - Spark cluster endpoint (optional)
- OAuth provider keys for authentication (optional):
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

### Critical Development Notes
- Always run `npm run db:push` after modifying `shared/schema.ts`
- User journey tests in `tests/` are critical - run `npm run test:user-journeys` before major changes
- The platform supports 4 user roles: `non-tech`, `business`, `technical`, `consultation`
- All AI services route through `server/services/role-based-ai.ts` with model selection and prompt templating
- Real-time features depend on WebSocket connections managed in `server/realtime.ts`
- Service layer in `server/services/` provides clean separation of concerns and reusable components
- Agent orchestration is handled by `server/services/project-manager-agent.ts` with dependency management
- Heavy data processing automatically delegates to `server/services/spark-processor.ts` based on data size thresholds

## Production Readiness Status

**⚠️ CURRENT STATUS: NOT PRODUCTION READY**

A comprehensive audit (October 2025) identified critical gaps that must be addressed before production deployment.

### Admin Functionality

#### Admin Routes (`server/routes/admin.ts`)
- **Agent Management**: CRUD operations for dynamic agent registration
- **Tool Registry**: Manage tools available to agents via MCP
- **System Monitoring**: Agent health, queue status, system metrics
- **Agent Templates**: Pre-built agent configurations for common use cases

#### Admin Access Control
**Location**: `server/routes/admin.ts:22-55`
- Middleware: `requireAdmin` checks user role
- **⚠️ SECURITY ISSUE**: Current implementation uses email domain check (`@admin.com`) - **NOT PRODUCTION SAFE**
- **Required Fix**: Add proper `isAdmin` boolean column to users table and role-based access control

#### Admin API Endpoints
**Agent Operations**:
- `GET /api/admin/agents` - List all agents with metrics
- `GET /api/admin/agents/:agentId` - Agent details and performance
- `POST /api/admin/agents` - Register new agent dynamically
- `PUT /api/admin/agents/:agentId` - Update agent configuration
- `DELETE /api/admin/agents/:agentId` - Unregister agent
- `POST /api/admin/agents/:agentId/restart` - Restart agent

**Tool Operations**:
- `GET /api/admin/tools` - List all registered tools
- `GET /api/admin/tools/:toolName` - Tool details and documentation
- `POST /api/admin/tools` - Register new tool
- `DELETE /api/admin/tools/:toolName` - Unregister tool
- `GET /api/admin/tools/catalog` - Formatted tool catalog
- `GET /api/admin/tools/by-category/:category` - Tools by category
- `GET /api/admin/tools/for-agent/:agentId` - Tools available to specific agent

**System Operations**:
- `GET /api/admin/system/status` - Overall system health

**Template Operations**:
- `GET /api/admin/templates` - Agent templates with filtering
- `GET /api/admin/templates/:templateId` - Template details
- `POST /api/admin/templates/:templateId/create` - Create agent from template
- `GET /api/admin/templates/recommendations` - Get template recommendations by use case

### Critical Issues Identified

#### 1. Agent Architecture
**Status**: ⚠️ **INCOMPLETE IMPLEMENTATION**

**Issues**:
- **Polling-based coordination**: `project-manager-agent.ts:954-971` uses 5-second polling for checkpoint decisions instead of real-time WebSocket communication
- **No circuit breakers**: Agent-to-agent communication lacks timeout/retry mechanisms
- **Mock implementations**: Technical AI agent delegates to Spark but returns simulated results
- **Initialization not integrated**: `server/services/agent-initialization.ts` (664 lines) and `server/services/tool-initialization.ts` (1063 lines) exist but are never called during server startup

**Impact**: User workflows can hang, agents can't reliably communicate, dynamic agent features non-functional

**Required Fixes**:
1. Replace polling with WebSocket/Server-Sent Events for real-time checkpoint communication
2. Add message broker (Redis) for agent-to-agent communication
3. Implement circuit breakers with exponential backoff
4. Wire agent/tool initialization into `server/index.ts` startup sequence
5. Replace mock Spark integration with real job submission and monitoring

#### 2. Tool Registry & MCP Integration
**Status**: ⚠️ **PARTIALLY FUNCTIONAL**

**Issues**:
- Tool registry (`mcp-tool-registry.ts`) separate from MCP service - potential conflicts
- Tools registered but agent handlers contain mock implementations (`tool-initialization.ts:533-568`)
- No runtime validation that registered tools are actually callable
- Missing tool permission enforcement at execution time

**Required Fixes**:
1. Unify tool registration between `MCPToolRegistry` and `EnhancedMCPService`
2. Replace all mock tool implementations with real integrations
3. Add tool execution validation and permission checks
4. Implement tool health monitoring and automatic failover

#### 3. Billing & Subscription System
**Status**: 🔴 **FRAGMENTED - CRITICAL**

**Issues**:
- **Three conflicting implementations**:
  - `server/services/enhanced-billing-service.ts` (675 lines)
  - `server/services/enhanced-billing-service-v2.ts` (EMPTY FILE - abandoned migration)
  - `server/services/enhanced-subscription-billing.ts` (200+ lines)
- **Inconsistent subscription tier naming**:
  - Enhanced-billing uses: `'starter-nontech'`, `'professional-business'`, etc.
  - Subscription-billing uses: `'trial'`, `'starter'`, `'professional'`, `'enterprise'`
  - Schema allows any string value (no enum enforcement)
- **Missing webhook signature verification**: Stripe webhooks processed without verifying authenticity (SECURITY VULNERABILITY)
- **Dual usage tracking**: Legacy fields (`monthlyUploads`, etc.) coexist with new JSONB fields (`featureConsumption`) - causes conflicting reports
- **No transaction management**: Payment operations not atomic

**Impact**: Revenue leakage, billing calculation errors, security vulnerability to webhook spoofing

**Required Fixes** (PRIORITY 0):
1. **Consolidate to single billing service** - merge logic from all three files
2. **Add Stripe webhook signature verification** using `stripe.webhooks.constructEvent()`
3. **Standardize subscription tiers** - create canonical enum in `shared/schema.ts`
4. **Remove legacy tracking fields** - migrate fully to feature-based billing
5. **Implement transaction management** - wrap payment operations in DB transactions with rollback
6. **Add comprehensive audit logging** for all billing events

#### 4. Database Schema & Validation
**Status**: ⚠️ **MISSING CONSTRAINTS**

**Issues** (`shared/schema.ts`):
- **No foreign key constraints**: `stripeCustomerId`, `stripeSubscriptionId` not linked to Stripe tables
- **No cascade delete rules**: User deletion will orphan projects, datasets, artifacts
- **Missing indexes**: High-frequency queries (e.g., `userId + subscriptionTier`) not optimized
- **Optional PII handling**: `piiAnalysis` object entirely optional - GDPR/CCPA compliance at risk
- **Weak validation**: Subscription tier stored as unrestricted varchar instead of enum

**Required Fixes**:
1. Add foreign key constraints with appropriate cascade rules
2. Create composite indexes for common query patterns:
   - `(userId, subscriptionTier)` on users
   - `(userId, uploadedAt)` on projects
   - `(projectId, type)` on artifacts
3. Make PII analysis required for datasets containing personal data
4. Convert subscription tier to proper enum type
5. Add unique constraints on business-critical fields

#### 5. User Journey Consistency
**Status**: ⚠️ **INCONSISTENT DEFINITIONS**

**Issues**:
- **Three different journey type enums**:
  - Schema: `"ai_guided" | "template_based" | "self_service" | "consultation"`
  - Business agent: `"guided" | "business" | "technical"`
  - Pricing: `"non-tech" | "business" | "technical" | "consultation"`
- **Multiple entry points**: 43 page components in `client/src/pages/` including duplicates:
  - Landing pages: `landing.tsx`, `main-landing.tsx`, `home-page.tsx`
  - Pricing: `pricing.tsx`, `pricing-v2.tsx`, `pricing-broken.tsx`
  - Project creation: `new-project.tsx`, `project-setup-step.tsx`
- **Journey-to-role mapping unclear**: Which user roles can access which journeys?

**Impact**: Journey validation failures, incorrect agent routing, confusing user navigation

**Required Fixes**:
1. **Standardize journey types** - use single enum from `shared/schema.ts` everywhere
2. **Remove duplicate pages** - consolidate to single landing, pricing, project creation flow
3. **Document journey-to-role mapping** explicitly in schema
4. **Add journey eligibility validation** based on subscription tier

#### 6. Security & Compliance
**Status**: 🔴 **MULTIPLE VULNERABILITIES**

**Critical Issues**:
- **Weak admin authorization**: Email domain check instead of role-based access
- **No webhook verification**: Stripe webhooks can be spoofed
- **Optional PII handling**: No enforcement of GDPR/CCPA consent requirements
- **No rate limiting**: Auth endpoints vulnerable to brute force
- **No input sanitization layer**: SQL injection risk
- **Missing password requirements**: No complexity enforcement visible

**Required Fixes** (PRIORITY 0):
1. Implement proper RBAC with `isAdmin` boolean in users table
2. Add Stripe webhook signature verification
3. Make PII consent flow required before data processing
4. Add rate limiting middleware to all auth and payment endpoints
5. Implement input validation/sanitization middleware
6. Add password complexity requirements and account lockout

### Production Deployment Checklist

#### Before Launch (Must Complete):
- [ ] **Consolidate billing system** to single service
- [ ] **Add webhook signature verification** for Stripe
- [ ] **Add database constraints** (foreign keys, indexes, cascades)
- [ ] **Implement real-time agent communication** (replace polling)
- [ ] **Wire agent/tool initialization** into server startup
- [ ] **Standardize data models** (journey types, subscription tiers)
- [ ] **Implement RBAC** for admin access
- [ ] **Add PII handling enforcement**
- [ ] **Remove duplicate UI pages**
- [ ] **Add comprehensive error handling** throughout

#### Monitoring & Observability (Required):
- [ ] **Application Performance Monitoring** (APM) - Datadog/New Relic
- [ ] **Error tracking** - Sentry or similar
- [ ] **Centralized logging** - CloudWatch/ELK Stack
- [ ] **Metrics collection** - Prometheus + Grafana
- [ ] **Uptime monitoring** - PingDOM or similar
- [ ] **Database monitoring** - query performance, connection pool
- [ ] **Agent health monitoring** - heartbeat, task queue depth

#### Infrastructure (Required):
- [ ] **Environment-specific configs** (dev/staging/prod)
- [ ] **Secrets management** (AWS Secrets Manager/Vault)
- [ ] **Database migration strategy** (Drizzle migrations)
- [ ] **Zero-downtime deployment** plan
- [ ] **Rollback procedures** documented
- [ ] **Disaster recovery** plan
- [ ] **Backup strategy** (automated DB backups)

#### Testing & Quality (Required):
- [ ] **Unit test coverage** >70% for critical paths
- [ ] **Integration tests** for payment flows
- [ ] **E2E tests** for all user journeys
- [ ] **Load testing** for agent orchestration
- [ ] **Security audit** and penetration testing
- [ ] **Accessibility audit** (WCAG 2.1 AA)

### Architecture Improvements for Production

#### Recommended Refactoring (Priority Order):

**P0 - Critical (8-10 weeks)**:
1. Consolidate billing system
2. Implement real-time agent communication with message broker
3. Fix database schema constraints
4. Standardize data models across codebase
5. Add security hardening (webhook verification, RBAC, rate limiting)

**P1 - Required (8 weeks)**:
6. Integrate agent/tool initialization
7. Add monitoring and observability stack
8. Complete Spark integration (real job submission)
9. Error handling standardization
10. Remove duplicate UI pages

**P2 - Post-Launch**:
11. UI/UX design system implementation
12. Comprehensive test coverage
13. Performance optimization
14. Documentation (API docs, runbooks, ADRs)

#### Estimated Timeline to Production:
- **Minimum Viable Product**: 14-16 weeks with dedicated team
- **Recommended Team**:
  - 1 Backend Lead (Agent Architecture)
  - 1 Backend Engineer (Billing & Data Pipeline)
  - 1 Full-Stack Engineer (Integration & Testing)
  - 1 DevOps Engineer (Infrastructure & Monitoring)

### Service File Locations

**IMPORTANT**: The codebase has service files in two locations due to ongoing refactoring:

- **Legacy location**: `server/*.ts` (e.g., `server/file-processor.ts`, `server/mcp-ai-service.ts`)
- **Modern location**: `server/services/*.ts` (e.g., `server/services/file-processor.ts`)

**Current State**:
- Some services exist in BOTH locations with different implementations
- `server/services/` is the target architecture
- Migration is incomplete

**For New Development**:
- **Always use `server/services/`** for new services
- Check if service exists in both locations before modifying
- Prefer newer `server/services/` implementation when conflicts exist

**Known Duplicates**:
- File processor: `server/file-processor.ts` vs `server/services/file-processor.ts`
- PII handling: `server/unified-pii-processor.ts` vs `server/services/unified-pii-processor.ts`
- Billing: Multiple versions across both directories

### Known Issues & Workarounds

#### Agent Orchestration Polling
**Issue**: Project manager agent uses polling instead of real-time communication
**Location**: `server/services/project-manager-agent.ts:954-971`
**Workaround**: Reduce polling interval for better responsiveness (still not ideal)
**Permanent Fix Required**: Implement WebSocket-based checkpoint notifications

#### Empty Billing Service V2
**Issue**: `server/services/enhanced-billing-service-v2.ts` is empty (1 line)
**Root Cause**: Abandoned migration attempt
**Workaround**: Use `enhanced-billing-service.ts` for now
**Permanent Fix Required**: Complete migration or remove v2 file

#### Mock Spark Integration
**Issue**: Spark processor returns simulated results instead of executing real jobs
**Location**: `server/services/technical-ai-agent.ts:51-62`
**Impact**: Large dataset processing not actually distributed
**Permanent Fix Required**: Implement real Spark job submission with monitoring

#### Tool Registry Not Initialized
**Issue**: Tool initialization service exists but never called
**Location**: `server/services/tool-initialization.ts`
**Impact**: Dynamic tool registration features non-functional
**Workaround**: Tools must be manually registered in startup code
**Permanent Fix Required**: Call `initializeTools()` in `server/index.ts`