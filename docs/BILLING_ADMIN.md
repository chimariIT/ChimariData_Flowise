# Billing & Admin Guide

**Part of ChimariData Documentation** | [← Back to Main](../CLAUDE.md) | **Last Updated**: November 30, 2025

This document covers subscription tiers, pricing models, billing integration, admin features, and payment processing.

---

## 📋 Table of Contents

- [Subscription System](#subscription-system)
- [Pricing Models](#pricing-models)
- [Billing Integration](#billing-integration)
- [Unified Billing Service](#unified-billing-service)
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

## Admin Dashboard

**Location**: `client/src/pages/admin/`

### Admin Pages (8 Total)

#### 1. Admin Dashboard (`admin-dashboard.tsx`)

**Purpose**: Overview of platform health and key metrics

**Features**:
- Total users and active subscriptions
- Revenue metrics (MRR, ARR)
- System health status
- Recent activity log
- Quick actions

---

#### 2. User Management (`index.tsx`)

**Purpose**: Manage users and permissions

**Features**:
- User list with search and filter
- View user details and subscription status
- Change user roles (`non-tech`, `business`, `technical`, `consultation`)
- Toggle admin status
- Suspend/delete users

---

#### 3. Subscription Management (`subscription-management.tsx`)

**Purpose**: Manage subscriptions and billing

**Features**:
- Active subscriptions list
- Subscription tier distribution
- Change user subscription tiers
- View subscription history
- Cancel/refund subscriptions
- Apply discounts and coupons

---

#### 4. Agent Management (`agent-management.tsx`)

**Purpose**: Monitor and configure agents

**Features**:
- Agent status and health
- Agent performance metrics
- Enable/disable agents
- Configure agent permissions
- View agent activity logs

---

#### 5. Tools Management (`tools-management.tsx`)

**Purpose**: Manage tools and integrations

**Features**:
- Tool registry overview
- Enable/disable tools
- Configure tool permissions
- View tool usage analytics
- Tool health monitoring

---

#### 6. Pricing Services (`pricing-services.tsx`)

**Purpose**: Configure service pricing

**Features**:
- Service pricing table
- Update prices for features
- Configure overage pricing
- Set tier-based discounts
- Pricing history

---

#### 7. Consultation Management (`consultations.tsx`)

**Purpose**: Manage consultation requests

**Features**:
- Consultation request queue
- Assign consultations to experts
- Track consultation status
- View consultation history
- Generate consultation reports

---

#### 8. Consultation Pricing (`consultation-pricing.tsx`)

**Purpose**: Configure consultation pricing

**Features**:
- Hourly rates for different expertise levels
- Package pricing (fixed-price consultations)
- Custom pricing for enterprise clients
- Pricing tiers for consultation types

---

## Admin Features

### Admin Routes

**Location**: `server/routes/admin*.ts`

#### Admin Billing (`admin-billing.ts`)

**Endpoints**:
- `GET /api/admin/billing/overview` - Revenue and subscription metrics
- `GET /api/admin/billing/subscriptions` - All subscriptions
- `POST /api/admin/billing/change-tier` - Change user subscription tier
- `POST /api/admin/billing/apply-discount` - Apply discount to user
- `POST /api/admin/billing/refund` - Process refund

#### Admin Service Pricing (`admin-service-pricing.ts`)

**Endpoints**:
- `GET /api/admin/pricing/services` - All service pricing
- `PUT /api/admin/pricing/services/:id` - Update service price
- `POST /api/admin/pricing/services` - Create new service pricing
- `DELETE /api/admin/pricing/services/:id` - Delete service pricing

#### Admin Consultation (`admin-consultation.ts`)

**Endpoints**:
- `GET /api/admin/consultations` - All consultation requests
- `PUT /api/admin/consultations/:id/assign` - Assign to expert
- `PUT /api/admin/consultations/:id/status` - Update status
- `GET /api/admin/consultations/:id/report` - Generate report

#### Admin Core (`admin.ts`)

**Endpoints**:
- `GET /api/admin/users` - All users with filters
- `PUT /api/admin/users/:id/role` - Change user role
- `PUT /api/admin/users/:id/admin` - Toggle admin status
- `DELETE /api/admin/users/:id` - Suspend/delete user
- `GET /api/admin/system/health` - System health check
- `GET /api/admin/analytics` - Platform analytics

#### Admin Secured (`admin-secured.ts`)

**Endpoints**: Additional secured admin-only endpoints with extra validation

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
