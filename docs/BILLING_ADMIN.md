# Billing & Admin Guide

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md) | **Last Updated**: February 13, 2026

This document covers subscription tiers, pricing models, billing integration, admin features, and payment processing.

> **Audit Note (Feb 2026):** Updated to reflect 11 admin UI pages (was 8), 165+ admin API endpoints across 6 route files, campaign/coupon management, analysis pricing tiered model, and runtime config broadcast behavior.

---

## 📋 Table of Contents

- [Subscription System](#subscription-system)
- [Pricing Models](#pricing-models)
- [Analysis Pricing Model](#analysis-pricing-model)
- [Campaign & Coupon Management](#campaign--coupon-management)
- [Billing Integration](#billing-integration)
- [Unified Billing Service](#unified-billing-service)
- [Runtime Config Broadcast](#runtime-config-broadcast)
- [Admin Dashboard](#admin-dashboard)
- [Admin Features](#admin-features)
- [Payment Processing](#payment-processing)
- [Usage Tracking](#usage-tracking)

---

## Subscription System

### Subscription Tiers

**Location**: `shared/unified-subscription-tiers.ts`

The platform offers 4 subscription tiers with progressive feature access:

#### 1. Trial Tier
**Purpose**: Limited usage for evaluation

**Features**:
- 100 MB data upload limit
- 5 AI queries per month
- 2 analysis components
- 3 visualizations
- Basic templates only
- Email support (48hr response)

**Pricing**: Free

---

#### 2. Starter Tier
**Purpose**: Basic features with usage quotas

**Features**:
- 500 MB data upload limit
- 50 AI queries per month
- 10 analysis components
- 20 visualizations
- Standard templates
- Email support (24hr response)
- Journey types: AI-Guided, Template-Based

**Pricing**: $29/month (or custom based on `pricing_config` table)

---

#### 3. Professional Tier
**Purpose**: Advanced features with higher quotas

**Features**:
- 5 GB data upload limit
- 200 AI queries per month
- 50 analysis components
- 100 visualizations
- All templates including industry-specific
- Priority email + chat support (12hr response)
- Journey types: All (AI-Guided, Template-Based, Self-Service, Consultation)
- Spark processing for large datasets
- ML model export
- API access

**Pricing**: $99/month

---

#### 4. Enterprise Tier
**Purpose**: Unlimited usage with custom integrations

**Features**:
- Unlimited data upload
- Unlimited AI queries
- Unlimited analysis components
- Unlimited visualizations
- Custom templates
- Dedicated support (2hr response)
- All journey types + Custom journeys
- Spark cluster access
- On-premise deployment option
- SSO integration
- White-label branding
- Custom integrations

**Pricing**: Custom (contact sales)

---

### Feature Definitions

**Location**: `shared/feature-definitions.ts`

Features are categorized and tracked for billing:

**Categories**:
- `data_upload` - File upload and ingestion
- `ai_query` - AI-powered insights and recommendations
- `analysis_component` - Statistical tests, ML models
- `visualization` - Chart generation
- `template_access` - Industry-specific templates
- `journey_type` - Available journey workflows
- `support_level` - Support response time
- `spark_processing` - Big data processing
- `api_access` - API endpoint access

---

## Pricing Models

**Location**: `server/services/pricing.ts`

### User Categories

1. **Subscription Users**: Tier-based quotas and discounts
2. **Non-Subscription Users**: Pay-per-use pricing

### Subscription-Aware Pricing

User journeys check eligibility and current usage against quotas:

```typescript
async function checkJourneyEligibility(userId: string, journeyType: string) {
  const user = await getUser(userId);
  const subscriptionTier = user.subscriptionTier;

  // Check if journey type is available in tier
  const tierConfig = subscriptionTiers[subscriptionTier];
  if (!tierConfig.journeyTypes.includes(journeyType)) {
    throw new Error(`Journey type ${journeyType} not available in ${subscriptionTier} tier`);
  }

  // Check quota usage
  const usage = await getUsage(userId);
  if (usage.aiQueries >= tierConfig.quotas.aiQueries) {
    throw new Error('AI query quota exceeded. Overage charges will apply.');
  }
}
```

### Quota Management

**How It Works**:
1. User initiates action (e.g., run AI query)
2. System checks remaining quota for user's tier
3. If quota available: Use quota (free)
4. If quota exhausted: Apply overage charges

**Overage Pricing** (configurable in `pricing_config` table):
- AI queries: $0.50 per query
- Data upload: $0.10 per GB
- Analysis components: $5.00 per component
- Visualizations: $2.00 per visualization

### Dynamic Pricing

Adjusts based on:
- **Subscription Tier Discounts**: Enterprise gets 50% off overages
- **Journey Complexity**: Simple analysis vs. advanced ML
- **Data Size**: Spark processing adds cost
- **Resource Intensity**: GPU-accelerated models

---

## Analysis Pricing Model

**Location**: `server/routes/admin-billing.ts` (analysis pricing endpoints), `client/src/pages/admin/analysis-pricing.tsx`

### Overview

Analysis pricing is a **tiered model** that calculates cost based on analysis type, data size, and complexity. Admin can configure base prices per analysis type and adjust tier multipliers.

### Pricing Components

| Component | Description | Admin-Configurable |
|-----------|-------------|-------------------|
| **Base Price** | Per-analysis-type base cost (e.g., correlation $5, regression $10) | Yes |
| **Data Size Multiplier** | Scales with row count (1x for <1K, 1.5x for 1K-10K, 2x for 10K+) | Yes |
| **Complexity Factor** | ML/advanced models cost more than basic stats | Yes |
| **Subscription Discount** | Tier-based discount (Pro 20%, Enterprise 50%) | Yes |
| **Campaign Discount** | Active campaign/coupon applied at checkout | Yes |

### Admin Endpoints

- `GET /api/admin/billing/analysis-pricing` - Get current analysis pricing config
- `PUT /api/admin/billing/analysis-pricing` - Update analysis pricing
- `POST /api/admin/billing/analysis-pricing/reset` - Reset to defaults
- `POST /api/admin/billing/analysis-pricing/preview` - Preview cost calculation

### Cost Estimation Flow

```
User selects analysis type → CostEstimationService calculates base cost
  → Apply data size multiplier
  → Apply complexity factor
  → Apply subscription discount
  → Apply campaign/coupon discount
  → Lock cost in journeyProgress.lockedCostCents
  → Display to user at pricing step
```

**SSOT**: Locked cost stored in `journeyProgress.lockedCostCents` — never recalculated after lock.

---

## Campaign & Coupon Management

**Location**: `server/routes/admin-billing.ts` (campaign endpoints), `client/src/pages/admin/campaign-management.tsx`

### Overview

Admins can create, manage, and track promotional campaigns and discount coupons.

### Campaign Model

| Field | Type | Description |
|-------|------|-------------|
| `campaignId` | string | Unique identifier |
| `name` | string | Display name |
| `code` | string | Coupon code users enter |
| `discountType` | `'percentage' \| 'fixed'` | Discount calculation method |
| `discountValue` | number | Percentage (0-100) or fixed amount in cents |
| `maxUses` | number | Maximum total redemptions |
| `currentUses` | number | Current redemption count |
| `startDate` | Date | Campaign start |
| `endDate` | Date | Campaign expiry |
| `isActive` | boolean | Toggle on/off |
| `applicableTiers` | string[] | Which subscription tiers can use |
| `applicableAnalysisTypes` | string[] | Which analysis types apply |

### Admin Endpoints

- `GET /api/admin/billing/campaigns` - List all campaigns
- `POST /api/admin/billing/campaigns` - Create campaign
- `PUT /api/admin/billing/campaigns/:campaignId` - Update campaign
- `PUT /api/admin/billing/campaigns/:campaignId/toggle` - Toggle active status
- `DELETE /api/admin/billing/campaigns/:campaignId` - Delete campaign
- `GET /api/admin/billing/analytics/campaigns` - Campaign usage analytics

### Usage Flow

```
User enters coupon code at pricing step
  → POST /api/projects/:id/apply-campaign validates code
  → Reserves campaign (does NOT increment usage yet)
  → Usage incremented only on successful payment webhook
  → Campaign discount shown in cost breakdown
```

**Important**: `applyCampaign()` reserves but does not consume. Usage count incremented atomically inside the Stripe webhook transaction.

---

## Billing Integration

### Stripe Integration

**Location**: `server/routes/billing.ts`, `client/src/pages/checkout.tsx`

The platform uses Stripe for payment processing:

**Features**:
- Credit card and ACH payments
- Subscription management (create, update, cancel)
- Invoice generation
- Payment history
- Refund processing
- Webhook handling for events

### Checkout Flow

**Client-Side** (`client/src/pages/checkout.tsx`):
```typescript
import { loadStripe } from '@stripe/stripe-js';

const stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Create checkout session
const session = await apiClient.post('/api/billing/create-checkout-session', {
  tier: 'professional',
  priceId: 'price_xxx'
});

// Redirect to Stripe Checkout
await stripe.redirectToCheckout({ sessionId: session.id });
```

**Server-Side** (`server/routes/billing.ts`):
```typescript
router.post('/create-checkout-session', ensureAuthenticated, async (req, res) => {
  const { tier, priceId } = req.body;
  const userId = (req.user as any).id;

  const session = await stripe.checkout.sessions.create({
    customer: user.stripeCustomerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${process.env.CLIENT_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.CLIENT_URL}/pricing`,
  });

  res.json({ sessionId: session.id });
});
```

### Webhook Handling

**Location**: `server/routes/stripe-webhooks.ts`

Stripe webhooks notify the platform of subscription events:

**Events Handled**:
- `checkout.session.completed` - New subscription created
- `customer.subscription.updated` - Subscription tier changed
- `customer.subscription.deleted` - Subscription cancelled
- `invoice.payment_succeeded` - Payment processed
- `invoice.payment_failed` - Payment failed

**Webhook Endpoint**:
```typescript
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle event
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    // ... other events
  }

  res.json({ received: true });
});
```

**Security**:
- Webhook signature verification (required in production)
- Set `ENABLE_WEBHOOK_SIGNATURE_VERIFICATION=true` in production

---

## Unified Billing Service

**Location**: `server/services/billing/unified-billing-service.ts` (1,363 lines)

### Overview

The **Unified Billing Service** consolidates all billing functionality into a single, production-ready service.

**Status**: ✅ **CONSOLIDATED** - Production ready

### Features

#### 1. Stripe Integration
- Payment processing with webhook verification
- Subscription lifecycle management
- Invoice generation and retrieval
- Customer management

#### 2. Transaction-Safe Operations
- Database transactions for critical operations
- Rollback on failure
- Audit trail for all billing events

#### 3. Journey and Feature-Based Billing
- Track usage by journey type
- Feature-level billing granularity
- Custom pricing per feature

#### 4. Quota Management
- Real-time quota tracking
- Overage calculation and billing
- Tier-based quota enforcement

#### 5. ML/LLM Cost Tracking
- Token usage tracking for AI queries
- Model-specific cost attribution
- Training cost estimation

### Usage Pattern

```typescript
import { getBillingService } from './services/billing/unified-billing-service';

const billingService = getBillingService();

// Track feature usage
await billingService.trackFeatureUsage(userId, 'ai_query', 'high');

// Check quota
const quotaStatus = await billingService.checkQuota(userId, 'ai_query');

// Create subscription
await billingService.createSubscription(userId, 'professional', 'price_xxx');

// Calculate overage
const overage = await billingService.calculateOverage(userId, billingPeriod);
```

### Legacy Files (Deprecated)

**DO NOT USE**:
- ~~`server/services/enhanced-billing-service.ts`~~ - Marked deprecated
- ~~`server/services/enhanced-subscription-billing.ts`~~ - Marked deprecated

**Always use**: `server/services/billing/unified-billing-service.ts`

**→ See**: [BILLING_INTEGRATION_REVIEW.md](../BILLING_INTEGRATION_REVIEW.md) for complete audit

---

## Runtime Config Broadcast

**Location**: `server/routes/admin-billing.ts`, `client/src/lib/realtime.ts`

### Problem Solved

Previously, admin pricing/campaign changes only took effect after a page refresh. Active user sessions showed stale pricing.

### How It Works (Feb 2026)

When admin updates pricing config, the backend broadcasts via WebSocket:

```
Admin updates pricing → PricingService.refreshFromDatabase()
  → realtimeServer.broadcast({ type: 'status_change', sourceId: 'admin', data: { eventType: 'analysis_pricing_updated' } })
  → All connected clients receive event
  → Frontend invalidates React Query caches for cost/pricing queries
  → User sees updated pricing without refresh
```

### Broadcast Event Types

| Admin Action | Event Type | Cache Keys Invalidated |
|-------------|------------|----------------------|
| Update analysis pricing | `analysis_pricing_updated` | `cost-estimate`, `pricing`, `analysis-pricing` |
| Update tier pricing | `tier_pricing_updated` | `cost-estimate`, `pricing` |
| Toggle campaign | `campaign_updated` | `cost-estimate`, `pricing` |
| Update consumption rates | `consumption_rates_updated` | `cost-estimate`, `pricing` |
| Update tax config | `tax_config_updated` | `cost-estimate`, `pricing` |

### Frontend Listener

In `client/src/lib/realtime.ts`, the `updateReactQueryCache()` function detects admin events by checking `event.sourceId === 'admin'` and invalidates all pricing-related React Query caches.

---

## Admin Dashboard

**Location**: `client/src/pages/admin/`

### Admin Pages (11 Total)

The admin panel is accessed at `/admin/:tab` with 10 tab values. All pages are in `client/src/pages/admin/`.

| # | Tab Value | Component File | Purpose |
|---|-----------|---------------|---------|
| 1 | `dashboard` | `admin-dashboard.tsx` | Platform health & metrics overview |
| 2 | `subscription-management` | `subscription-management.tsx` | Subscription CRUD & billing |
| 3 | `service-pricing` | `pricing-services.tsx` | Configure service pricing |
| 4 | `analysis-pricing` | `analysis-pricing.tsx` | Analysis type pricing config |
| 5 | `campaigns` | `campaign-management.tsx` | Campaign/coupon management |
| 6 | `consultations` | `consultations.tsx` | Consultation request queue |
| 7 | `consultation-pricing` | `consultation-pricing.tsx` | Consultation pricing config |
| 8 | `agent-management` | `agent-management.tsx` | Agent monitoring & config |
| 9 | `tools-management` | `tools-management.tsx` | Tool registry management |
| 10 | `state-inspector` | `project-state-inspector.tsx` | Project state debugging |

**Layout**: `index.tsx` provides the admin shell with tab navigation, auth checks, and permission guards.

#### 1. Admin Dashboard (`admin-dashboard.tsx`)

**Tab**: `dashboard`
**Purpose**: Overview of platform health and key metrics

**Features**:
- Total users and active subscriptions
- Revenue metrics (MRR, ARR)
- System health status
- Recent activity log
- Quick actions

---

#### 2. Subscription Management (`subscription-management.tsx`)

**Tab**: `subscription-management`
**Purpose**: Manage subscriptions and billing

**Features**:
- Active subscriptions list
- Subscription tier distribution
- Change user subscription tiers
- View subscription history
- Cancel/refund subscriptions
- Apply discounts and coupons

---

#### 3. Service Pricing (`pricing-services.tsx`)

**Tab**: `service-pricing`
**Purpose**: Configure service pricing

**Features**:
- Service pricing table
- Update prices for features
- Configure overage pricing
- Set tier-based discounts
- Pricing history

---

#### 4. Analysis Pricing (`analysis-pricing.tsx`)

**Tab**: `analysis-pricing`
**Purpose**: Configure per-analysis-type pricing

**Features**:
- Base price configuration per analysis type
- Data size multiplier settings
- Complexity factor configuration
- Preview cost calculations
- Reset to defaults

---

#### 5. Campaign Management (`campaign-management.tsx`)

**Tab**: `campaigns`
**Purpose**: Create and manage promotional campaigns and coupons

**Features**:
- Campaign list with status indicators
- Create/edit/delete campaigns
- Toggle campaign active status
- Configure discount type (percentage or fixed)
- Set usage limits, date ranges, applicable tiers
- Campaign analytics and redemption tracking

---

#### 6. Consultation Management (`consultations.tsx`)

**Tab**: `consultations`
**Purpose**: Manage consultation requests

**Features**:
- Consultation request queue
- Assign consultations to experts
- Track consultation status
- View consultation history
- Generate consultation reports

---

#### 7. Consultation Pricing (`consultation-pricing.tsx`)

**Tab**: `consultation-pricing`
**Purpose**: Configure consultation pricing

**Features**:
- Hourly rates for different expertise levels
- Package pricing (fixed-price consultations)
- Custom pricing for enterprise clients
- Pricing tiers for consultation types

---

#### 8. Agent Management (`agent-management.tsx`)

**Tab**: `agent-management`
**Purpose**: Monitor and configure agents

**Features**:
- Agent status and health dashboard
- Agent performance metrics
- Enable/disable agents
- Configure agent permissions
- View agent activity logs
- Create agents from templates

---

#### 9. Tools Management (`tools-management.tsx`)

**Tab**: `tools-management`
**Purpose**: Manage tools and integrations

**Features**:
- Tool registry overview (130+ registered tools)
- Enable/disable tools
- Configure tool permissions and agent access
- View tool usage analytics
- Tool health monitoring

---

#### 10. Project State Inspector (`project-state-inspector.tsx`)

**Tab**: `state-inspector`
**Purpose**: Debug and inspect project journey state

**Features**:
- Select any project by ID
- View full `journeyProgress` JSONB tree
- Inspect step completion status
- View dataset metadata and ingestion state
- Examine analysis results and artifacts

---

## Admin Features

### Admin Routes Overview

**Location**: `server/routes/admin*.ts` (6 files, 165+ endpoints total)

| Route File | Prefix | Endpoint Count | Purpose |
|-----------|--------|---------------|---------|
| `admin.ts` | `/api/admin` | ~80 | Core admin (agents, tools, users, projects, monitoring, billing) |
| `admin-billing.ts` | `/api/admin/billing` | ~25 | Tiers, campaigns, consumption rates, analysis pricing |
| `admin-secured.ts` | `/api/admin/secured` | ~20 | Additional secured endpoints with extra RBAC |
| `admin-consultation.ts` | `/api/admin/consultations` | ~9 | Consultation lifecycle management |
| `admin-consultation-pricing.ts` | `/api/admin/consultation-pricing` | ~7 | Consultation pricing CRUD |
| `admin-service-pricing.ts` | `/api/admin/service-pricing` | ~6 | Service pricing CRUD |

**Full endpoint reference**: See [ADMIN_API_REFERENCE.md](ADMIN_API_REFERENCE.md)

#### Admin Core (`admin.ts`) - Key Endpoints

**User Management**:
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:userId` - Update user
- `PUT /api/admin/users/:userId/subscription` - Change subscription
- `POST /api/admin/users/:userId/credits` - Award/revoke credits
- `POST /api/admin/users/:userId/refund` - Process refund
- `PUT /api/admin/users/:userId/trial-extension` - Extend trial

**Agent Management**:
- `GET /api/admin/agents` - List agents with status
- `POST /api/admin/agents` - Register agent
- `PUT /api/admin/agents/:agentId` - Update agent
- `DELETE /api/admin/agents/:agentId` - Unregister agent
- `POST /api/admin/agents/:agentId/restart` - Restart agent

**Tool Management**:
- `GET /api/admin/tools` - List all tools
- `POST /api/admin/tools` - Register tool
- `DELETE /api/admin/tools/:toolName` - Unregister tool
- `GET /api/admin/tools/for-agent/:agentId` - Tools per agent

**System Monitoring**:
- `GET /api/admin/system/status` - System status
- `GET /api/admin/circuit-breakers/status` - Circuit breaker status
- `POST /api/admin/circuit-breakers/reset` - Reset circuit breaker
- `GET /api/admin/database/optimization/health` - DB health
- `GET /api/admin/database/optimization/slow-queries` - Slow queries
- `GET /api/admin/errors/statistics` - Error statistics
- `GET /api/admin/monitoring/dashboard` - Monitoring dashboard
- `GET /api/admin/monitoring/alerts` - Active alerts

**Project Management**:
- `GET /api/admin/projects` - List all projects
- `GET /api/admin/projects/:projectId` - Project details
- `GET /api/admin/projects/stuck` - Stuck projects
- `POST /api/admin/projects/:projectId/retry` - Retry stuck project

#### Admin Billing (`admin-billing.ts`) - Key Endpoints

**Tier Pricing**:
- `GET /api/admin/billing/tiers` - List tier configurations
- `POST /api/admin/billing/tiers` - Create tier
- `DELETE /api/admin/billing/tiers/:tierId` - Delete tier

**Campaigns**:
- `GET /api/admin/billing/campaigns` - List campaigns
- `POST /api/admin/billing/campaigns` - Create campaign
- `PUT /api/admin/billing/campaigns/:campaignId` - Update campaign
- `PUT /api/admin/billing/campaigns/:campaignId/toggle` - Toggle active
- `DELETE /api/admin/billing/campaigns/:campaignId` - Delete campaign

**Analysis Pricing**:
- `GET /api/admin/billing/analysis-pricing` - Get config
- `PUT /api/admin/billing/analysis-pricing` - Update config
- `POST /api/admin/billing/analysis-pricing/reset` - Reset to defaults
- `POST /api/admin/billing/analysis-pricing/preview` - Preview cost

**Analytics**:
- `GET /api/admin/billing/analytics/revenue` - Revenue analytics
- `GET /api/admin/billing/analytics/campaigns` - Campaign analytics

#### Admin Consultation (`admin-consultation.ts`)

- `GET /api/admin/consultations/pending-quotes` - Pending quotes
- `POST /api/admin/consultations/:id/quote` - Send quote
- `GET /api/admin/consultations/ready-queue` - Ready queue
- `POST /api/admin/consultations/:id/assign` - Assign expert
- `POST /api/admin/consultations/:id/schedule` - Schedule session
- `POST /api/admin/consultations/:id/complete` - Mark complete
- `GET /api/admin/consultations/all` - All consultations
- `GET /api/admin/consultations/stats` - Statistics

### Admin Security

**Access Control**: All admin routes require:
1. User is authenticated (`ensureAuthenticated` middleware)
2. User has `isAdmin=true` in database
3. Some routes have additional RBAC checks

**Pattern**:
```typescript
router.get('/admin/users', ensureAuthenticated, async (req, res) => {
  const isAdmin = (req.user as any)?.isAdmin || false;

  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // Admin logic
});
```

---

## Payment Processing

### Stripe Configuration

**Environment Variables**:
```bash
# Stripe API Keys
STRIPE_SECRET_KEY="sk_live_..."               # Production
STRIPE_SECRET_KEY="sk_test_..."               # Testing
VITE_STRIPE_PUBLIC_KEY="pk_live_..."          # Frontend (production)
VITE_STRIPE_PUBLIC_KEY="pk_test_..."          # Frontend (testing)

# Webhook
STRIPE_WEBHOOK_SECRET="whsec_..."             # Webhook signing secret
ENABLE_WEBHOOK_SIGNATURE_VERIFICATION="true"  # Required in production
```

### Payment Methods

**Supported**:
- Credit/Debit cards (Visa, Mastercard, Amex)
- ACH bank transfers (US only)
- SEPA Direct Debit (Europe)

**Not Yet Implemented**:
- PayPal
- Google Pay / Apple Pay
- Cryptocurrency

### Invoice Generation

**Automatic Invoices**:
- Generated monthly for subscriptions
- Sent via email to customer
- Stored in Stripe dashboard

**Manual Invoices**:
- Admin can generate custom invoices
- Useful for enterprise custom pricing
- Downloadable as PDF

---

## Usage Tracking

**Location**: `server/routes/usage.ts`, `server/services/tool-analytics.ts`

### What Is Tracked

1. **Feature Usage**:
   - AI queries (count, tokens used, model)
   - Data uploads (file size, format)
   - Analysis components (type, complexity)
   - Visualizations (chart type, data size)

2. **Journey Metrics**:
   - Journey type and completion rate
   - Time spent per journey step
   - Agent interactions
   - Checkpoint approvals/rejections

3. **Tool Usage**:
   - Tool invocations by agent
   - Tool execution time
   - Tool success/failure rate
   - Tool cost attribution

4. **ML/LLM Tracking**:
   - Token usage per AI query
   - Model selection (Gemini, GPT, Claude)
   - Fine-tuning costs
   - Inference costs

### Usage Analytics Endpoints

**Location**: `server/routes/usage.ts`

**Endpoints**:
- `GET /api/usage/summary` - User's usage summary for current billing period
- `GET /api/usage/history` - Historical usage data
- `GET /api/usage/quota-status` - Current quota status and remaining usage
- `GET /api/admin/usage/all` - All users' usage (admin only)

### Billing Period

**Default**: Monthly billing cycle starting from subscription creation date

**Example**:
- User subscribes on Jan 15
- Billing period: Jan 15 - Feb 14
- Next billing: Feb 15

---

**Related Documentation**:
- [← Back to Main](../CLAUDE.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Agentic System Guide](AGENTIC_SYSTEM.md)
- [User Journeys Guide](USER_JOURNEYS.md)
- [Stripe Integration Guide](../STRIPE-INTEGRATION.md)
- [Billing Review](../BILLING_INTEGRATION_REVIEW.md)
