# Production Readiness Assessment

**Last Updated**: January 2025
**Status**: ⚠️ **NOT PRODUCTION READY**

A comprehensive audit (October 2025) identified critical gaps that must be addressed before production deployment.

---

## 🔴 Critical Issues Summary

| Issue | Severity | Impact | Status |
|-------|----------|--------|--------|
| Mock Data in Production | 🔴 Critical | Users see fake analysis results | Not Fixed |
| ~~Billing System Fragmentation~~ | ~~🔴 Critical~~ | ~~Revenue leakage, security vulnerabilities~~ | ✅ **FIXED** |
| Security Vulnerabilities | 🔴 Critical | Multiple attack vectors | Partially Fixed |
| Tool Registry Not Initialized | ⚠️ High | Dynamic features non-functional | Not Fixed |
| Agent Polling Architecture | ⚠️ High | Workflows can hang | Partially Fixed |
| Database Schema Constraints | ⚠️ High | Data integrity at risk | Not Fixed |
| Journey Type Inconsistency | ⚠️ Medium | Validation failures | Not Fixed |

---

## 1. Agent Architecture Issues

### Status: ⚠️ **INCOMPLETE IMPLEMENTATION**

### Problems Identified

#### Polling-Based Coordination
**Location**: `server/services/project-manager-agent.ts:954-971`

- Uses 5-second polling for checkpoint decisions instead of real-time WebSocket communication
- Creates unnecessary load and delays
- Can cause workflows to hang waiting for poll intervals

**Impact**: User workflows experience delays, agents can't communicate reliably.

#### No Circuit Breakers
- Agent-to-agent communication lacks timeout/retry mechanisms
- No exponential backoff for failed operations
- System can get stuck in infinite retry loops

**Impact**: System instability, resource exhaustion.

#### Mock Implementations in Production
**Location**: `server/services/technical-ai-agent.ts`

- Technical AI agent delegates to Spark but returns simulated results
- See `MOCK-DATA-FIXES.md` for detailed analysis

**Impact**: Users receive fake data, platform credibility at risk.

#### Initialization Not Integrated
**Locations**:
- `server/services/agent-initialization.ts` (664 lines)
- `server/services/tool-initialization.ts` (1063 lines)

- Comprehensive initialization services exist but are never called
- `server/index.ts` shows no calls to `initializeTools()` or `initializeAgents()`
- Dynamic agent registration features completely non-functional

**Impact**: Core platform features advertised but not working.

### Required Fixes (Priority 0)

1. **Replace polling with event-driven architecture**
   - Implement WebSocket/Server-Sent Events for real-time checkpoint communication
   - Add message broker (Redis) for agent-to-agent communication
   - Remove all polling loops

2. **Add circuit breakers and resilience patterns**
   ```typescript
   // Example circuit breaker pattern needed
   class AgentCircuitBreaker {
     private failureCount = 0;
     private lastFailureTime?: Date;
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

     async execute<T>(fn: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (this.shouldAttemptReset()) {
           this.state = 'HALF_OPEN';
         } else {
           throw new Error('Circuit breaker is OPEN');
         }
       }

       try {
         const result = await fn();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }
   }
   ```

3. **Wire initialization into startup**
   ```typescript
   // In server/index.ts after line 66
   import { initializeAgents } from './services/agent-initialization';
   import { initializeTools } from './services/tool-initialization';

   async function startServer() {
     // Existing database connection code...

     // Add agent/tool initialization
     console.log('🤖 Initializing agents...');
     await initializeAgents();

     console.log('🔧 Initializing tools...');
     await initializeTools();

     // Rest of server startup...
   }
   ```

4. **Replace mock Spark integration**
   - Implement real Spark job submission via `spark-submit`
   - Add job monitoring and status polling
   - Proper error handling with fallback to Python processing (not mocks)

---

## 2. Tool Registry & MCP Integration

### Status: ⚠️ **PARTIALLY FUNCTIONAL**

### Problems Identified

#### Separate Tool Registries
- `MCPToolRegistry` in `mcp-tool-registry.ts`
- `EnhancedMCPService` in `enhanced-mcp-service.ts`
- No synchronization between them
- Potential for conflicts and inconsistent state

#### Mock Tool Implementations
**Location**: `server/services/tool-initialization.ts:533-568`

```typescript
// Example of mock tool handler (SHOULD NOT BE IN PRODUCTION)
const apiDataFetcherHandler = {
  async execute(input: any) {
    return {
      status: 'success',
      result: { mock: true, data: [] } // ❌ MOCK DATA
    };
  }
};
```

#### No Runtime Validation
- No checks that registered tools are actually callable
- Tools can be registered but fail silently when executed
- No health checks for tool availability

#### Missing Permission Enforcement
- Tool permissions defined but not enforced at execution time
- Agents can potentially access tools they shouldn't

### Required Fixes (Priority 1)

1. **Unify tool registration**
   - Merge `MCPToolRegistry` and `EnhancedMCPService` logic
   - Single source of truth for tool definitions
   - Atomic registration/unregistration operations

2. **Replace all mock implementations**
   - Audit `tool-initialization.ts` for mock handlers
   - Connect each tool to real service implementation
   - Add integration tests for each tool

3. **Add runtime validation**
   ```typescript
   async function validateToolCallable(toolName: string): Promise<boolean> {
     const tool = MCPToolRegistry.getTool(toolName);
     if (!tool) return false;

     try {
       // Attempt health check
       const handler = getToolHandler(toolName);
       const status = await handler.getStatus();
       return status.status === 'active';
     } catch (error) {
       console.error(`Tool ${toolName} validation failed:`, error);
       return false;
     }
   }
   ```

4. **Enforce permissions at execution**
   ```typescript
   async function executeTool(toolName: string, agentId: string, input: any) {
     // Permission check BEFORE execution
     if (!MCPToolRegistry.canAgentUseTool(agentId, toolName)) {
       throw new PermissionDeniedError(`Agent ${agentId} cannot use tool ${toolName}`);
     }

     // Validate tool is callable
     if (!await validateToolCallable(toolName)) {
       throw new ToolUnavailableError(`Tool ${toolName} is not available`);
     }

     // Execute with audit logging
     return await executeToolWithAudit(toolName, agentId, input);
   }
   ```

---

## 3. Billing & Subscription System

### Status: ✅ **RESOLVED** (Updated: October 23, 2025)

### Resolution Summary

All critical billing issues have been **RESOLVED** through implementation of `server/services/billing/unified-billing-service.ts` (1,363 lines).

**Key Achievements**:
- ✅ Single unified billing service consolidating all logic
- ✅ Webhook signature verification implemented
- ✅ Transaction-safe database operations
- ✅ Consistent usage tracking with JSONB fields
- ✅ Canonical subscription tier types

**Documentation**: See `BILLING_INTEGRATION_REVIEW.md` for complete audit

---

### ~~Previous Issues~~ (All Fixed)

#### ~~Three Conflicting Implementations~~ → **CONSOLIDATED**

**Resolution**: Unified billing service at `server/services/billing/unified-billing-service.ts`

**Legacy Files** (marked deprecated, not used in production):
1. ~~`server/services/enhanced-billing-service.ts`~~ - Deprecated
2. ~~`server/services/enhanced-subscription-billing.ts`~~ - Deprecated

**Current Usage**:
```typescript
// All routes now use unified service:
import { getBillingService } from '../services/billing/unified-billing-service';

const billingService = getBillingService();
await billingService.trackFeatureUsage(userId, featureId, complexity);
```

**Impact**: ✅ Single source of truth for all billing calculations

---

#### ~~Inconsistent Subscription Tier Naming~~ → **STANDARDIZED**

**Resolution**: Canonical types defined in `shared/canonical-types.ts`:
```typescript
export enum SubscriptionTier {
  TRIAL = 'trial',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise'
}
```

All code uses `SubscriptionTier` enum. Database schema uses consistent naming.

**Remaining Work**: 🟡 Add type constraint to schema (low priority):
```typescript
subscriptionTier: text('subscription_tier').$type<SubscriptionTier>()
```

---

#### ~~Missing Webhook Signature Verification~~ → **SECURED**

**Resolution**: Full signature verification implemented

**Implementation** (`unified-billing-service.ts:626-630`):
```typescript
async handleWebhook(payload: string | Buffer, signature: string) {
  // SECURITY: Verify webhook signature
  const event = this.stripe.webhooks.constructEvent(
    payload,
    signature,
    this.webhookSecret
  );
  // ... process verified event
}
```

**Route Handler** (`server/routes/stripe-webhooks.ts:34-53`):
```typescript
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    return res.status(400).json({ error: 'Missing signature' });
  }

  const result = await billingService.handleWebhook(req.body, signature);
  // ...
});
```

**Impact**: ✅ Protected against webhook spoofing attacks

---

#### ~~Dual Usage Tracking~~ → **UNIFIED**

**Resolution**: Single tracking system using JSONB `subscriptionBalances` field

**Implementation** (`unified-billing-service.ts:902-968`):
```typescript
async getUsageMetrics(userId: string): Promise<UsageMetrics> {
  const user = await this.getUser(userId);
  const subscriptionBalances = user.subscriptionBalances || {}; // Single source

  // Calculate usage from JSONB field only
  const quotaUsed = Object.values(subscriptionBalances).reduce(...);

  return { quotaUsed, quotaLimit, ... };
}
```

**Impact**: ✅ No conflicting usage reports

---

#### ~~No Transaction Management~~ → **ATOMIC OPERATIONS**

**Resolution**: All critical operations wrapped in database transactions

**Implementation**:
```typescript
// Subscription creation (line 486)
await db.transaction(async (tx) => {
  await tx.update(users).set({ subscriptionTier, ... });
  // All related updates in same transaction
});

// Webhook processing (line 635)
await db.transaction(async (tx) => {
  switch (event.type) {
    case 'invoice.paid':
      await this.handleInvoicePaid(invoice, tx);
      break;
    // ... all handlers use same transaction
  }
});

// Feature usage tracking (line 747)
await db.transaction(async (tx) => {
  // Update usage and bill in single atomic operation
});
```

**Impact**: ✅ No money deducted without service, or vice versa

---

### ~~Required Fixes~~ → **COMPLETED**

#### 1. Consolidate to Single Billing Service

**Action Plan**:
```typescript
// New unified billing service structure
// server/services/billing-service.ts

import Stripe from 'stripe';
import { db } from '../db';

export class BillingService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }

  // Consolidate all billing logic here
  async calculateUsageCost(userId: string, features: FeatureUsage): Promise<Cost> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const tier = this.getSubscriptionTier(user.subscriptionTier);

    // Single source of truth for pricing
    return tier.calculateCost(features);
  }

  async processSubscription(userId: string, tierId: string): Promise<Subscription> {
    // All subscription logic consolidated
  }

  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Webhook handling with signature verification
  }
}
```

**Migration Steps**:
1. Create new `server/services/billing-service.ts` with unified API
2. Move all pricing logic from both existing services
3. Update all calling code to use new service
4. Deprecate and remove old services
5. Add comprehensive tests

#### 2. Add Stripe Webhook Signature Verification

```typescript
// server/routes/billing.ts
app.post('/webhooks/stripe',
  express.raw({ type: 'application/json' }), // ✅ Get raw body
  async (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      return res.status(400).send('Missing signature');
    }

    try {
      // ✅ Verify signature
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      // Process verified event
      await billingService.handleWebhook(event);
      res.json({ received: true });
    } catch (err) {
      console.error('⚠️ Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);
```

#### 3. Standardize Subscription Tiers

```typescript
// shared/schema.ts
export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'trial',
  'starter',
  'professional',
  'enterprise'
]);

// Remove string field, use enum
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  subscriptionTier: subscriptionTierEnum('subscription_tier').default('trial'),
  // ...
});

// Create migration to convert existing data
// migrations/XXX_standardize_subscription_tiers.sql
```

#### 4. Implement Transaction Management

```typescript
// server/services/billing-service.ts
async function processPayment(userId: string, amount: number) {
  // ✅ Use database transactions
  return await db.transaction(async (tx) => {
    // All operations within transaction
    const balance = await tx.update(users)
      .set({ balance: sql`balance - ${amount}` })
      .where(eq(users.id, userId))
      .returning();

    if (balance[0].balance < 0) {
      throw new Error('Insufficient balance');
    }

    const invoice = await tx.insert(invoices).values({
      userId,
      amount,
      status: 'paid'
    }).returning();

    await tx.insert(auditLog).values({
      userId,
      action: 'payment_processed',
      amount,
      invoiceId: invoice[0].id
    });

    // If any operation fails, all rollback automatically
    return invoice[0];
  });
}
```

#### 5. Remove Legacy Tracking Fields

```typescript
// Migration strategy
// 1. Create migration to copy data from legacy fields to new JSONB
// migrations/XXX_migrate_usage_tracking.ts

export async function up() {
  // Copy existing data
  await db.execute(sql`
    UPDATE users
    SET feature_consumption = jsonb_build_object(
      'uploads', monthly_uploads,
      'ai_queries', monthly_ai_queries,
      'storage_gb', monthly_storage_used
    )
  `);

  // Drop old columns after verification
  await db.execute(sql`
    ALTER TABLE users
    DROP COLUMN monthly_uploads,
    DROP COLUMN monthly_ai_queries,
    DROP COLUMN monthly_storage_used
  `);
}
```

#### 6. Add Comprehensive Audit Logging

```typescript
// server/services/billing-audit.ts
export class BillingAuditService {
  async logBillingEvent(event: BillingEvent) {
    await db.insert(billingAuditLog).values({
      timestamp: new Date(),
      userId: event.userId,
      eventType: event.type,
      amount: event.amount,
      metadata: event.metadata,
      stripeEventId: event.stripeEventId
    });
  }

  async getAuditTrail(userId: string, startDate: Date, endDate: Date) {
    return await db.query.billingAuditLog.findMany({
      where: and(
        eq(billingAuditLog.userId, userId),
        gte(billingAuditLog.timestamp, startDate),
        lte(billingAuditLog.timestamp, endDate)
      ),
      orderBy: desc(billingAuditLog.timestamp)
    });
  }
}
```

---

## 4. Database Schema & Validation

### Status: ⚠️ **MISSING CONSTRAINTS**

### Problems Identified (`shared/schema.ts`)

#### No Foreign Key Constraints
```typescript
// Current schema (UNSAFE):
export const users = pgTable('users', {
  stripeCustomerId: text('stripe_customer_id'),      // ❌ Not linked to anything
  stripeSubscriptionId: text('stripe_subscription_id') // ❌ Not linked to anything
});
```

**Impact**: Orphaned Stripe references, impossible to maintain data integrity.

#### No Cascade Delete Rules
- User deletion will orphan projects, datasets, artifacts
- No cleanup of related data
- Database bloat over time

#### Missing Indexes
High-frequency queries not optimized:
- `(userId, subscriptionTier)` on users
- `(userId, uploadedAt)` on projects
- `(projectId, type)` on artifacts

**Impact**: Slow queries, poor performance at scale.

#### Optional PII Handling
```typescript
export const datasets = pgTable('datasets', {
  piiAnalysis: jsonb('pii_analysis') // ❌ Optional - GDPR/CCPA risk!
});
```

**Impact**: Platform can process personal data without PII detection, violating regulations.

#### Weak Validation
```typescript
subscriptionTier: text('subscription_tier') // ❌ Any string allowed
```

Should be:
```typescript
subscriptionTier: subscriptionTierEnum('subscription_tier').default('trial')
```

### Required Fixes (Priority 1)

#### 1. Add Foreign Key Constraints

```typescript
// shared/schema.ts
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade'  // ✅ Delete projects when user deleted
  }).notNull(),
  // ...
});

export const datasets = pgTable('datasets', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'cascade'  // ✅ Delete datasets when project deleted
  }),
  // ...
});

export const artifacts = pgTable('artifacts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'cascade'  // ✅ Delete artifacts when project deleted
  }).notNull(),
  datasetId: integer('dataset_id').references(() => datasets.id, {
    onDelete: 'set null'  // ✅ Keep artifact but remove dataset link
  }),
  // ...
});
```

#### 2. Create Composite Indexes

```typescript
// migrations/XXX_add_performance_indexes.sql
CREATE INDEX idx_users_subscription ON users(id, subscription_tier);
CREATE INDEX idx_projects_user_date ON projects(user_id, uploaded_at DESC);
CREATE INDEX idx_artifacts_project_type ON artifacts(project_id, type);
CREATE INDEX idx_datasets_project ON datasets(project_id);

-- For billing queries
CREATE INDEX idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_feature_consumption ON users USING gin(feature_consumption);
```

#### 3. Make PII Analysis Required

```typescript
export const datasets = pgTable('datasets', {
  piiAnalysis: jsonb('pii_analysis').notNull(), // ✅ Required
  piiDetected: boolean('pii_detected').notNull().default(false),
  piiAnonymized: boolean('pii_anonymized').notNull().default(false),
  // ...
});

// Add database constraint
// migrations/XXX_require_pii_analysis.sql
ALTER TABLE datasets
  ADD CONSTRAINT require_pii_analysis
  CHECK (pii_analysis IS NOT NULL);

ALTER TABLE datasets
  ADD CONSTRAINT pii_anonymized_if_detected
  CHECK (NOT pii_detected OR pii_anonymized = true);
```

#### 4. Convert to Enum Types

```typescript
// shared/schema.ts
export const journeyTypeEnum = pgEnum('journey_type', [
  'ai_guided',
  'template_based',
  'self_service',
  'consultation'
]);

export const projects = pgTable('projects', {
  journeyType: journeyTypeEnum('journey_type').notNull(),
  // ...
});
```

#### 5. Add Unique Constraints

```typescript
export const users = pgTable('users', {
  email: text('email').notNull().unique(),  // ✅ Unique emails
  stripeCustomerId: text('stripe_customer_id').unique(),  // ✅ One Stripe customer per user
  // ...
});
```

---

## 5. User Journey Consistency

### Status: ⚠️ **INCONSISTENT DEFINITIONS**

### Problems Identified

#### Three Different Journey Type Enums

1. **Database Schema** (`shared/schema.ts`):
   ```typescript
   "ai_guided" | "template_based" | "self_service" | "consultation"
   ```

2. **Business Agent** (`server/services/business-agent.ts`):
   ```typescript
   "guided" | "business" | "technical"
   ```

3. **Pricing Service** (`server/services/pricing.ts`):
   ```typescript
   "non-tech" | "business" | "technical" | "consultation"
   ```

**Impact**: Journey validation fails, agents route incorrectly, pricing calculations fail.

#### Multiple Entry Points (43 Page Components)

**Duplicates**:
- Landing pages: `landing.tsx`, `main-landing.tsx`, `home-page.tsx`
- Pricing: `pricing.tsx`, `pricing-v2.tsx`, `pricing-broken.tsx`
- Project creation: `new-project.tsx`, `project-setup-step.tsx`

**Impact**: Confusing user navigation, maintenance nightmare.

#### Journey-to-Role Mapping Unclear
- Which user roles can access which journeys?
- No explicit mapping in schema or documentation
- Agents must guess based on naming conventions

### Required Fixes (Priority 1)

#### 1. Standardize Journey Types

```typescript
// shared/schema.ts - CANONICAL DEFINITION
export const journeyTypeEnum = pgEnum('journey_type', [
  'ai_guided',      // For non-tech users
  'template_based', // For business users
  'self_service',   // For technical users
  'consultation'    // For expert-assisted
]);

// Add explicit role mapping
export const journeyRoleMapping = {
  ai_guided: ['non-tech'],
  template_based: ['business'],
  self_service: ['technical'],
  consultation: ['non-tech', 'business', 'technical'] // All can use consultation
} as const;

// Validation function
export function canUserAccessJourney(userRole: string, journeyType: string): boolean {
  const allowedRoles = journeyRoleMapping[journeyType as keyof typeof journeyRoleMapping];
  return allowedRoles?.includes(userRole) ?? false;
}
```

#### 2. Remove Duplicate Pages

**Action Plan**:
```bash
# Landing pages - keep one
✅ Keep: client/src/pages/landing.tsx
❌ Remove: client/src/pages/main-landing.tsx
❌ Remove: client/src/pages/home-page.tsx

# Pricing pages - keep one
✅ Keep: client/src/pages/pricing.tsx (if working)
❌ Remove: client/src/pages/pricing-v2.tsx
❌ Remove: client/src/pages/pricing-broken.tsx

# Project creation - consolidate
✅ Keep: client/src/pages/new-project.tsx
❌ Merge into: client/src/pages/project-setup-step.tsx
```

#### 3. Add Journey Eligibility Validation

```typescript
// server/middleware/journey-validation.ts
export function validateJourneyAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { journeyType } = req.body;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Check subscription tier allows this journey
  const tier = getSubscriptionTier(user.subscriptionTier);
  if (!tier.allowedJourneys.includes(journeyType)) {
    return res.status(403).json({
      error: 'Journey not available in your subscription tier',
      requiredTier: getMinimumTierForJourney(journeyType)
    });
  }

  // Check user role can access this journey
  if (!canUserAccessJourney(user.role, journeyType)) {
    return res.status(403).json({
      error: 'Journey not available for your role',
      userRole: user.role,
      journeyType
    });
  }

  next();
}

// Use in routes
app.post('/api/projects/create',
  authenticate,
  validateJourneyAccess,
  createProjectHandler
);
```

---

## 6. Security & Compliance

### Status: 🔴 **MULTIPLE VULNERABILITIES**

### Critical Security Issues

#### 1. Weak Admin Authorization
**Location**: `server/routes/admin.ts:22-55`

```typescript
// Current implementation (INSECURE):
function requireAdmin(req, res, next) {
  if (req.user?.email.endsWith('@admin.com')) {  // ❌ Email domain check!
    next();
  } else {
    res.status(403).json({ error: 'Admin only' });
  }
}
```

**Impact**: Anyone with an `@admin.com` email (which could be a free email provider) gets admin access.

**Fix**:
```typescript
// server/routes/admin.ts
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // ✅ Check database field
  if (req.user.isAdmin !== true) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // ✅ Log admin access for audit
  auditLog.info('Admin access', {
    userId: req.user.id,
    action: req.method + ' ' + req.path,
    ip: req.ip
  });

  next();
}

// Add migration
// migrations/XXX_add_admin_flag.sql
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_users_admin ON users(is_admin) WHERE is_admin = true;
```

#### 2. No Webhook Verification (Covered in Billing Section)

#### 3. Optional PII Handling (Covered in Database Section)

#### 4. No Rate Limiting on Auth Endpoints

```typescript
// Current state - NO RATE LIMITING
app.post('/api/auth/login', loginHandler);  // ❌ Can be brute-forced
```

**Fix**:
```typescript
// server/middleware/rate-limiter.ts
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Store in Redis for distributed rate limiting
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:auth:'
  })
});

// Apply to auth routes
app.post('/api/auth/login', authLimiter, loginHandler);
app.post('/api/auth/register', authLimiter, registerHandler);
app.post('/api/auth/reset-password', authLimiter, resetPasswordHandler);
```

#### 5. No Input Sanitization Layer

**Current state**: Direct use of user input without sanitization.

**Fix**:
```typescript
// server/middleware/input-sanitizer.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeInput(req, res, next) {
  // Sanitize all string inputs
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return DOMPurify.sanitize(obj, { ALLOWED_TAGS: [] });
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, sanitize(v)])
      );
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  next();
}

// Apply globally
app.use('/api', sanitizeInput);
```

#### 6. Missing Password Requirements

**Current state**: No visible password complexity enforcement.

**Fix**:
```typescript
// server/middleware/password-validator.ts
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check against common passwords
  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Add account lockout
export async function handleFailedLogin(userId: string) {
  const key = `failed_login:${userId}`;
  const attempts = await redis.incr(key);
  await redis.expire(key, 900); // 15 minutes

  if (attempts >= 5) {
    await lockAccount(userId, 900); // Lock for 15 minutes
    throw new Error('Account locked due to too many failed attempts');
  }
}
```

---

## Production Deployment Checklist

### Before Launch (Must Complete)

#### Critical Fixes (Blocking)
- [ ] **Consolidate billing system** to single service
- [ ] **Add Stripe webhook signature verification**
- [ ] **Replace all mock data implementations** (see `MOCK-DATA-FIXES.md`)
- [ ] **Add database constraints** (foreign keys, indexes, cascades)
- [ ] **Implement proper RBAC** for admin access
- [ ] **Standardize data models** (journey types, subscription tiers)
- [ ] **Add PII handling enforcement**
- [ ] **Remove duplicate UI pages**

#### High Priority
- [ ] **Implement real-time agent communication** (replace polling)
- [ ] **Wire agent/tool initialization** into server startup
- [ ] **Add rate limiting** to auth and payment endpoints
- [ ] **Implement input sanitization** middleware
- [ ] **Add password complexity requirements**
- [ ] **Complete Spark integration** (real job submission)

### Monitoring & Observability (Required)

- [ ] **Application Performance Monitoring (APM)** - Datadog/New Relic
  - Backend API response times
  - Database query performance
  - Agent coordination latency

- [ ] **Error Tracking** - Sentry or similar
  - Frontend JavaScript errors
  - Backend exceptions with stack traces
  - User session replay for debugging

- [ ] **Centralized Logging** - CloudWatch/ELK Stack
  - Structured JSON logs
  - Log aggregation from all servers
  - Log retention policy (30-90 days)

- [ ] **Metrics Collection** - Prometheus + Grafana
  - System metrics (CPU, memory, disk)
  - Application metrics (requests/sec, error rate)
  - Business metrics (active users, revenue)

- [ ] **Uptime Monitoring** - PingDom or similar
  - HTTP endpoint checks every 1-5 minutes
  - Multi-region checks
  - Alert on downtime >30 seconds

- [ ] **Database Monitoring**
  - Query performance tracking
  - Connection pool monitoring
  - Slow query alerts (>1 second)

- [ ] **Agent Health Monitoring**
  - Agent heartbeat tracking
  - Task queue depth monitoring
  - Agent coordination success rate

### Infrastructure (Required)

- [ ] **Environment-specific configs** (dev/staging/prod)
  - Separate databases per environment
  - Different API keys per environment
  - Environment-specific feature flags

- [ ] **Secrets Management** - AWS Secrets Manager/HashiCorp Vault
  - Rotate secrets programmatically
  - No secrets in code or config files
  - Audit log of secret access

- [ ] **Database Migration Strategy**
  - Automated migrations via Drizzle
  - Rollback procedures documented
  - Database backups before migrations

- [ ] **Zero-Downtime Deployment**
  - Blue-green deployment or rolling updates
  - Health checks before traffic routing
  - Automated rollback on failed health checks

- [ ] **Rollback Procedures**
  - Document rollback steps
  - Test rollback in staging
  - Keep last 3 versions deployable

- [ ] **Disaster Recovery Plan**
  - RTO (Recovery Time Objective): Target 4 hours
  - RPO (Recovery Point Objective): Target 1 hour
  - Documented recovery procedures
  - Quarterly disaster recovery drills

- [ ] **Backup Strategy**
  - Automated daily database backups
  - Offsite backup storage (different region)
  - Backup restoration testing monthly
  - Point-in-time recovery capability

### Testing & Quality (Required)

- [ ] **Unit Test Coverage >70%** for critical paths
  - Billing calculations
  - Permission checks
  - Data transformations
  - Agent coordination

- [ ] **Integration Tests** for payment flows
  - Successful payment processing
  - Failed payment handling
  - Webhook processing
  - Subscription upgrades/downgrades

- [ ] **E2E Tests** for all user journeys
  - Non-tech user journey end-to-end
  - Business user journey end-to-end
  - Technical user journey end-to-end
  - Consultation journey end-to-end

- [ ] **Load Testing** for agent orchestration
  - 100 concurrent users
  - 1000 requests per minute
  - Agent coordination under load
  - Database connection pool sizing

- [ ] **Security Audit** and penetration testing
  - OWASP Top 10 vulnerabilities
  - SQL injection testing
  - XSS vulnerability scanning
  - Authentication bypass attempts

- [ ] **Accessibility Audit** (WCAG 2.1 AA)
  - Screen reader compatibility
  - Keyboard navigation
  - Color contrast compliance
  - Form accessibility

---

## Architecture Improvements for Production

### Recommended Refactoring (Priority Order)

#### P0 - Critical (8-10 weeks)
1. **Consolidate billing system** (2-3 weeks)
2. **Implement real-time agent communication** with message broker (2-3 weeks)
3. **Fix database schema constraints** (1 week)
4. **Standardize data models** across codebase (1-2 weeks)
5. **Add security hardening** (webhook verification, RBAC, rate limiting) (2 weeks)

#### P1 - Required (8 weeks)
6. **Integrate agent/tool initialization** (1 week)
7. **Add monitoring and observability stack** (2-3 weeks)
8. **Complete Spark integration** (real job submission) (2 weeks)
9. **Error handling standardization** (1-2 weeks)
10. **Remove duplicate UI pages** (1 week)

#### P2 - Post-Launch
11. **UI/UX design system** implementation (4 weeks)
12. **Comprehensive test coverage** (ongoing)
13. **Performance optimization** (ongoing)
14. **Documentation** (API docs, runbooks, ADRs) (2 weeks)

### Estimated Timeline to Production

**Minimum Viable Product**: 14-16 weeks with dedicated team

**Recommended Team**:
- 1 Backend Lead (Agent Architecture)
- 1 Backend Engineer (Billing & Data Pipeline)
- 1 Full-Stack Engineer (Integration & Testing)
- 1 DevOps Engineer (Infrastructure & Monitoring)

---

## Deployment Environment Requirements

### Minimum Production Infrastructure

#### Application Servers
- **Count**: 2-3 instances (for redundancy)
- **Specs**: 4 CPU cores, 8GB RAM minimum
- **Auto-scaling**: Scale to 10 instances based on load

#### Database
- **PostgreSQL**: 13 or higher
- **Specs**: 4 CPU cores, 16GB RAM, 100GB SSD
- **Backup**: Daily automated backups, 30-day retention
- **Replication**: Read replicas for analytics queries

#### Redis Cache
- **Specs**: 2GB RAM minimum
- **Persistence**: AOF enabled
- **Replication**: Master-replica setup

#### Spark Cluster (Optional, for large datasets)
- **Master**: 1 instance, 4 CPU cores, 8GB RAM
- **Workers**: 2-5 instances (auto-scale), 8 CPU cores, 16GB RAM each

#### Storage
- **File uploads**: S3 or equivalent (encrypted at rest)
- **Logs**: Centralized logging service
- **Backups**: Offsite storage (different region)

### Environment Variables (Production)

```bash
# Required
NODE_ENV=production
DATABASE_URL=postgresql://...
GOOGLE_AI_API_KEY=...
REDIS_URL=redis://...
REDIS_ENABLED=true

# Security
SESSION_SECRET=... # 32+ character random string
JWT_SECRET=...     # 32+ character random string
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
VITE_STRIPE_PUBLIC_KEY=pk_live_...

# Email
SENDGRID_API_KEY=SG...

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Monitoring
SENTRY_DSN=...
APM_KEY=...

# Feature Flags
ENABLE_SPARK_PROCESSING=true
ENABLE_REAL_TIME_ANALYTICS=true
```

---

## Go-Live Decision Criteria

### Must-Have (Blocking)
- ✅ All P0 critical issues resolved
- ✅ Security vulnerabilities patched
- ✅ Billing system consolidated and tested
- ✅ Database integrity constraints in place
- ✅ Real-time agent communication working
- ✅ Mock data completely eliminated
- ✅ Monitoring and alerting operational
- ✅ Disaster recovery plan tested

### Nice-to-Have (Can defer)
- ⏸️ UI/UX design system
- ⏸️ Complete test coverage (can reach 70% post-launch)
- ⏸️ Spark integration (can launch with Python-only processing)
- ⏸️ Performance optimizations (can improve post-launch)

### Launch Readiness Scoring

| Category | Weight | Current Score | Target | Status |
|----------|--------|---------------|--------|--------|
| Core Functionality | 25% | 60% | 95% | ⚠️ Gap |
| Security | 25% | 40% | 95% | 🔴 Critical Gap |
| Data Integrity | 20% | 50% | 95% | 🔴 Critical Gap |
| Billing Accuracy | 15% | 30% | 100% | 🔴 Critical Gap |
| Monitoring | 10% | 20% | 90% | ⚠️ Gap |
| Testing | 5% | 50% | 80% | ⚠️ Gap |
| **Total** | **100%** | **46%** | **95%** | 🔴 **Not Ready** |

**Recommendation**: **DO NOT LAUNCH** until total score reaches minimum 90%.

---

## Post-Launch Monitoring Plan

### Week 1-2 (Intensive Monitoring)
- Monitor every 5 minutes
- On-call engineer 24/7
- Daily status meetings
- User feedback review twice daily

### Week 3-4 (Moderate Monitoring)
- Monitor every 15 minutes
- On-call engineer business hours + pager
- Status meetings twice weekly
- User feedback review daily

### Month 2+ (Standard Monitoring)
- Monitor every 30 minutes
- On-call rotation
- Weekly status meetings
- User feedback review weekly

### Key Metrics to Watch

**System Health**:
- Uptime % (target: 99.9%)
- Response time P95 (target: <500ms)
- Error rate (target: <0.1%)
- Database query time P95 (target: <100ms)

**Business Metrics**:
- New user signups
- Conversion rate (trial → paid)
- Churn rate
- Revenue per user

**User Experience**:
- Journey completion rate
- Average time to first analysis
- Support ticket volume
- User satisfaction score (NPS)

---

**Last Updated**: January 2025
**Next Review**: Before any production deployment attempt
**Owner**: Engineering Team
