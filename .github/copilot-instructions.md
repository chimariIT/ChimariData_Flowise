# Copilot Instructions for ChimariData Platform

## Project Overview
- **ChimariData** is a multi-agent, AI-driven data science platform for non-tech, business, and technical users.
- Core architecture: React frontend (`client/`), Express/TypeScript backend (`server/`), PostgreSQL (Drizzle ORM), Apache Spark for big data, and shared Zod schemas (`shared/`).
- Three main agents: Analytics Project Manager, Data Scientist, and Business Agent. See `server/services/` for agent logic and `shared/schema.ts` for shared types.

## Key Workflows
- **Development**: Use `npm run dev` (dev server), `npm run build` (production), `npm run start` (prod server).
- **Database**: Edit schemas in `shared/schema.ts` (Zod), then run `npm run db:push` to sync with PostgreSQL. Config in `drizzle.config.ts`.
- **Testing**: Playwright for E2E (`npm run test`, `npm run test:user-journeys`), Vitest for unit tests (`npm run test:unit`). User journey tests are critical for regression.
- **AI Services**: All AI routing and prompt templating is in `server/services/role-based-ai.ts`. Multi-provider support (Gemini, OpenAI, Anthropic).
- **Big Data**: Heavy processing is auto-delegated to Spark via `server/services/spark-processor.ts`.
- **Real-time**: WebSocket coordination in `server/realtime.ts`.

## Authentication & Security
- **Authentication Types**: Two methods - Email/password authentication and OAuth providers (Google primary, Microsoft/Apple ready).
- **Email Services**: Password reset and email verification managed through SendGrid integration.
- **OAuth Providers**: Google (primary), Microsoft/Apple ready. Config in `server/oauth-config.ts` and `server/oauth-providers.ts`.
- **Session Management**: Passport.js with PostgreSQL session store (`server/oauth-config.ts`).
- **Security Patterns**: JWT tokens, CSRF protection, secure cookies. PII detection in `server/unified-pii-processor.ts`.
- **User Flow**: Registration → email verification → role-based access → protected routes.

## User-Projects-Data Relationships
- **Core Schema**: Users (1) → Projects (n) → Datasets (n), with many-to-many project-dataset relationships in `shared/schema.ts`.
- **User Types**: System supports both subscription users (with tier-based quotas and discounts) and non-subscription users (pay-per-use model).
- **Data Flow**: Upload → PII scan → schema detection → transformation → analysis → artifacts.
- **Project Types**: Journey-based (non-tech, business, technical, consultation) with role-specific features.
- **Artifact Tracking**: Versioned outputs (reports, models, charts) linked to projects and source datasets.

## User Journey Artifacts & Deliverables
- **Non-Tech Journey**: AI-guided analysis producing executive summaries, plain-language insights, visual dashboards, and simplified PDF reports. Focus on actionable business recommendations without technical jargon.
- **Business Journey**: Professional business intelligence reports, industry benchmarks, regulatory compliance insights, ROI analysis, presentation-ready charts, and strategic recommendations. Templates tailored to business domains.
- **Technical Journey**: Code generation (Python/R), statistical test results, ML model artifacts, technical documentation, data pipeline specifications, and reproducible analysis scripts. Full access to raw outputs and methodologies.
- **Consultation Journey**: Expert-guided analysis with personalized consultation reports, custom methodology design, peer review insights, and strategic advisory documents. Highest level of customization and expert involvement.

## Dashboards & Project Overview
- **User Dashboard**: `client/src/pages/dashboard.tsx` - project cards, quick actions, recent activity.
- **Project Page**: `client/src/pages/project-page.tsx` - tabs for data, analysis, visualizations, artifacts.
- **Project Management**: Create, share, archive projects. Real-time collaboration via WebSocket.
- **Navigation**: Role-based UI with contextual features and permissions.

## Pricing & Billing System
- **Billing Service**: `server/services/enhanced-billing-service.ts` - capacity tracking, subscription management.
- **User Categories**: System handles both subscription users (with quotas/discounts) and non-subscription users (pay-per-use pricing).
- **Subscription Tiers**: Trial, Starter, Professional, Enterprise with usage quotas in `shared/subscription-tiers.ts`.
- **Payment Flow**: Stripe integration in `client/src/pages/checkout.tsx` and `server/routes/billing.ts`.
- **Usage Tracking**: Real-time monitoring of data volume, AI queries, analysis components, visualizations.
- **Cost Estimation**: Dynamic pricing based on journey type, data size, features in `server/services/pricing.ts`.
- **Subscription-Aware Pricing**: User journeys check subscription eligibility and current usage against quotas. Remaining quota used first (free), then overage charges apply. Dynamic pricing adjusts based on subscription tier discounts and available capacity in `server/services/enhanced-billing-service.ts`.

## AI Agents & MCP Communication
- **Project Manager Agent**: `server/services/project-manager-agent.ts` - orchestration, dependency management.
- **Data Scientist Agent**: `server/services/technical-ai-agent.ts` - ML pipeline, statistical analysis, code generation.
- **Business Agent**: `server/services/business-agent.ts` - industry knowledge, regulatory compliance, templates.
- **MCP Server**: `server/services/mcpai.ts` and `server/enhanced-mcp-service.ts` - unified AI access, tool orchestration.
- **Agent Coordination**: Shared state via database, real-time sync via WebSocket, decision audit trails.
- **Tools & Resources**: Data processing, visualization, analysis tools with role-based permissions.
- **Step-by-Step Workflow**: Agents present artifacts at each step requiring user review and feedback before proceeding. Users must approve/modify outputs like schema definitions, analysis plans, visualizations, and insights. Interactive workflow managed through `server/realtime.ts` with UI feedback components in project pages.

## Statistical Analysis Components
- **Advanced Analytics**: ANOVA, ANCOVA, MANOVA, MANCOVA, regression, time series in `server/advanced-analyzer.ts`.
- **ML Pipeline**: Classification, clustering, feature importance in `server/ml-service.ts` and `python/ml-analysis.py`.
- **Statistical UI**: `client/src/components/advanced-analysis-modal.tsx` - guided analysis configuration.
- **Python Integration**: Statistical computing via `python_scripts/data_analyzer.py` with JSON I/O.
- **Analysis Types**: Descriptive, correlation, regression, hypothesis testing with parameter configuration.

## Project-Specific Patterns
- **Service-Oriented**: All backend logic is in `server/services/` (AI, data, business, orchestration, pricing, permissions).
- **Agent Communication**: Agents share state via DB and `shared/schema.ts`. Real-time sync via WebSocket.
- **Role-Based Access**: Permissions in `server/services/role-permission.ts`. Four user roles: non-tech, business, technical, consultation.
- **Artifact Management**: Artifacts (reports, models, charts) are versioned and tracked in `shared/schema.ts`.
- **Data Ingestion**: File upload, PII detection, and schema profiling in `server/file-processor.ts` and `server/unified-pii-processor.ts`.
- **Visualization Engine**: 8 chart types with interactive configuration in `server/visualization-api-service.ts`.

## Conventions & Integration
- **Frontend**: Vite + React 18 + Tailwind. Aliases: `@`, `@shared`, `@assets` (see `vite.config.ts`).
- **Backend**: Express, TypeScript, Drizzle ORM. All DB schema/types in `shared/schema.ts`.
- **Environment**: Copy `.env.example` to `.env` and fill required vars (DB, AI keys, OAuth, Stripe, etc).
- **Testing**: E2E config in `playwright.config.ts`. Run user journey tests before major changes.
- **Adding Agents**: Define interface in `server/types.ts`, implement in `server/services/`, register in `mcpai.ts`, set permissions, update orchestration.
- **Extending Analysis**: Add statistical methods in `server/advanced-analyzer.ts`, update UI in analysis modals.

## Critical Notes
- Always run `npm run db:push` after editing `shared/schema.ts`.
- User journey tests (`npm run test:user-journeys`) are required for major changes.
- All AI/ML/analytics flows are agent-driven and coordinated via shared state and WebSocket.
- Artifacts and datasets are reusable and versioned for traceability.
- Billing calculations must consider subscription quotas and usage tracking.

## References
- `README.md` – Quick start, features, and deployment
- `CLAUDE.md` – Detailed agentic architecture, workflows, and service map
- `shared/schema.ts` – Core DB schema and types
- `server/services/` – All backend logic and agent implementations
- `server/realtime.ts` – Real-time agent coordination
- `drizzle.config.ts` – DB config
- `.env.example` – Required environment variables

---

For unclear or missing patterns, consult `CLAUDE.md` and `README.md` for architecture and workflow details. Ask for clarification if a workflow or integration is ambiguous.
