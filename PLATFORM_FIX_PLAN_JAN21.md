# ChimariData Platform - Comprehensive Fix Plan

**Created**: January 21, 2026
**Scope**: Complete platform audit covering User Journeys, Admin UI, Billing, MCP Tools, Agents, Data Pipeline
**Total Identified Issues**: 47
**Status**: Ready for Implementation

---

## Executive Summary

Based on a comprehensive audit of the ChimariData platform, this document outlines all identified gaps and friction points organized by priority. The platform has strong foundations with 8-step user journeys, 6 specialized agents, 151 registered tools, and Stripe billing integration. However, several critical gaps exist between what the UI promises and what the backend delivers.

### Overall Platform Status

| Component | Status | Completion |
|-----------|--------|------------|
| User Journey Steps | ✅ Production Ready | 100% |
| Agent Coordination (u2a2a2u) | ✅ Working | 95% |
| MCP Tool Registry | ⚠️ Partially Implemented | 62% (96/151 tools real) |
| Admin UI | ✅ Ready | 90% |
| Billing/Stripe | ⚠️ Critical Gaps | 70% |
| Data Pipeline | ✅ Working | 95% |
| Artifact Generation | ⚠️ Partial | 80% |

---

## Priority Classification

| Priority | Description | Issues | Total Effort |
|----------|-------------|--------|--------------|
| **P0 Critical** | Blocks revenue or core user value | 8 | ~20 hours |
| **P1 High** | Degrades user experience significantly | 12 | ~30 hours |
| **P2 Medium** | Missing features or inconsistencies | 15 | ~40 hours |
| **P3 Low** | Polish, optimization, tech debt | 12 | ~25 hours |

---

## P0 Critical Issues (Revenue & Core Value Blockers)

### P0-1: Trial Credits System Not Implemented

**Problem**: The platform has subscription tiers but NO trial credit system. Users cannot try the platform before paying.

**Current State**:
- Trial tier exists in database ($1/month)
- No `trial_credits` table or user field for credit balance
- No credit deduction logic on analysis execution
- Payment gate doesn't check credit balance

**Impact**: Cannot offer meaningful free trials, blocks user acquisition

**Files to Modify**:
- `shared/schema.ts` - Add trial credits fields to users table
- `server/routes/analysis-execution.ts` - Check credit balance before execution
- `server/services/billing/unified-billing-service.ts` - Add credit management methods
- `client/src/components/PaymentStatusBanner.tsx` - Show credit balance

**Fix Implementation**:

```typescript
// 1. Add to shared/schema.ts - users table
trialCredits: integer('trial_credits').default(100), // 100 credits for new users
trialCreditsUsed: integer('trial_credits_used').default(0),
lastCreditRefresh: timestamp('last_credit_refresh'),

// 2. Add to unified-billing-service.ts
async checkTrialCredits(userId: string, requiredCredits: number): Promise<{
  hasCredits: boolean;
  remaining: number;
  required: number;
}> {
  const user = await storage.getUser(userId);
  const remaining = (user.trialCredits || 0) - (user.trialCreditsUsed || 0);
  return {
    hasCredits: remaining >= requiredCredits,
    remaining,
    required: requiredCredits
  };
}

async deductTrialCredits(userId: string, credits: number): Promise<void> {
  const user = await storage.getUser(userId);
  await storage.updateUser(userId, {
    trialCreditsUsed: (user.trialCreditsUsed || 0) + credits
  });
}

// 3. Add credit check to analysis-execution.ts (line ~200)
const creditsRequired = calculateCreditsRequired(datasets, analysisTypes);
const creditCheck = await billingService.checkTrialCredits(userId, creditsRequired);

if (!isPaid && !creditCheck.hasCredits) {
  return res.status(402).json({
    success: false,
    error: 'Insufficient credits',
    creditsRequired: creditsRequired,
    creditsRemaining: creditCheck.remaining,
    paymentUrl: `/projects/${projectId}/payment`
  });
}

// Deduct credits if using trial
if (!isPaid && creditCheck.hasCredits) {
  await billingService.deductTrialCredits(userId, creditsRequired);
}
```

**Effort**: 4 hours

---

### P0-2: Overage Pricing Not Applied

**Problem**: Subscription tiers have `overagePricing` defined but it's never calculated or charged.

**Current State**:
- `subscription_tier_pricing.overagePricing` field exists with pricing data
- No logic to detect when user exceeds quota
- No overage charges added to invoices

**Impact**: Revenue leakage when users exceed quotas

**Files to Modify**:
- `server/services/billing/unified-billing-service.ts` - Add overage calculation
- `server/routes/usage.ts` - Track and warn on quota approach
- `server/routes/billing.ts` - Add overage billing endpoint

**Fix Implementation**:

```typescript
// Add to unified-billing-service.ts
async calculateOverageCharges(userId: string): Promise<{
  hasOverage: boolean;
  charges: Array<{metric: string; excess: number; rate: number; total: number}>;
  totalOverage: number;
}> {
  const user = await storage.getUser(userId);
  const tier = await this.getUserTier(userId);
  const usage = await this.getMonthlyUsage(userId);

  const charges: Array<{metric: string; excess: number; rate: number; total: number}> = [];

  // Check each quota metric
  const quotaMetrics = ['dataUploadsMB', 'aiQueries', 'analysisRuns', 'storageMB'];

  for (const metric of quotaMetrics) {
    const limit = tier.limits?.[metric] || Infinity;
    const used = usage[metric] || 0;

    if (used > limit) {
      const excess = used - limit;
      const rate = tier.overagePricing?.[metric] || 0;
      charges.push({
        metric,
        excess,
        rate,
        total: excess * rate
      });
    }
  }

  return {
    hasOverage: charges.length > 0,
    charges,
    totalOverage: charges.reduce((sum, c) => sum + c.total, 0)
  };
}

async applyOverageToInvoice(userId: string, stripeInvoiceId: string): Promise<void> {
  const overage = await this.calculateOverageCharges(userId);

  if (overage.hasOverage && overage.totalOverage > 0) {
    // Add overage line items to Stripe invoice
    for (const charge of overage.charges) {
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        invoice: stripeInvoiceId,
        amount: Math.round(charge.total * 100), // Convert to cents
        currency: 'usd',
        description: `Overage: ${charge.metric} (${charge.excess} units at $${charge.rate}/unit)`
      });
    }
  }
}
```

**Effort**: 3 hours

---

### P0-3: Feature Access Not Enforced by Tier

**Problem**: Subscription tiers define allowed features, but feature access is not validated.

**Current State**:
- `subscription_tier_pricing.features` defines allowed features per tier
- No middleware validates feature access before execution
- Users on lower tiers can access premium features

**Impact**: Revenue leakage, unfair to paying customers

**Files to Modify**:
- `server/middleware/feature-gate.ts` (NEW)
- `server/routes/analysis-execution.ts` - Add feature validation
- `server/routes/project.ts` - Add feature validation

**Fix Implementation**:

```typescript
// NEW FILE: server/middleware/feature-gate.ts
import { Request, Response, NextFunction } from 'express';
import { UnifiedBillingService } from '../services/billing/unified-billing-service';

const billingService = new UnifiedBillingService();

export function requireFeature(featureId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const hasAccess = await billingService.canAccessFeature(userId, featureId);

      if (!hasAccess) {
        const tier = await billingService.getUserTier(userId);
        return res.status(403).json({
          success: false,
          error: `Feature '${featureId}' requires a higher subscription tier`,
          currentTier: tier.name,
          requiredTier: await billingService.getRequiredTierForFeature(featureId),
          upgradeUrl: '/pricing'
        });
      }

      next();
    } catch (error: any) {
      console.error('Feature gate error:', error);
      next(); // Fail open to avoid blocking users on error
    }
  };
}

// Usage in routes:
router.post('/api/ml/train',
  ensureAuthenticated,
  requireFeature('ml_training'),
  async (req, res) => { ... }
);

router.post('/api/spark/process',
  ensureAuthenticated,
  requireFeature('spark_processing'),
  async (req, res) => { ... }
);
```

**Effort**: 3 hours

---

### P0-4: Business Agent Translation Not Displaying

**Problem**: BA Agent generates audience-translated results but they're not displayed in the UI.

**Current State**:
- BA Agent `translateResults()` is called and saves to `journeyProgress.translatedResults`
- `AudienceTranslatedResults.tsx` component exists
- Component not properly mounted or data path mismatch

**Impact**: Users don't see business-friendly results they were promised

**Files to Modify**:
- `client/src/pages/project-page.tsx` - Verify component mounting
- `client/src/components/AudienceTranslatedResults.tsx` - Fix data path

**Fix Implementation**:

```typescript
// In client/src/components/AudienceTranslatedResults.tsx - verify data paths
const translatedResults =
  project?.journeyProgress?.translatedResults ||
  project?.journeyProgress?.audienceTranslations ||
  project?.analysisResults?.translatedResults;

// Ensure component is in project-page.tsx Insights tab
<TabsContent value="insights">
  <AudienceTranslatedResults
    projectId={projectId}
    translatedResults={project?.journeyProgress?.translatedResults}
    currentAudience={project?.journeyProgress?.audience?.primary || 'executive'}
  />
  {/* Existing insights display */}
</TabsContent>
```

**Effort**: 2 hours

---

### P0-5: Stub Tool Handlers Return Random Data

**Problem**: Several tool handlers use `Math.random()` instead of real calculations.

**Current State**:
- `handleWorkflowEvaluator` returns random scores (lines 128-158)
- `handleBillingQuery` returns hardcoded mock data (lines 443-496)
- Customer support cost estimates use random values

**Impact**: Users see fake/inconsistent data, destroys trust

**Files to Modify**:
- `server/services/agent-tool-handlers.ts` - Replace all `Math.random()` calls

**Locations to Fix**:
```
server/services/agent-tool-handlers.ts:128    - Workflow scores
server/services/customer-support-agent.ts:945 - Cost estimates
server/services/customer-support-agent.ts:949 - Cost estimates
server/services/data-pipeline-builder.ts:325  - Records extracted
server/services/ml-deployment-monitoring.ts:434 - Prediction confidence
server/services/ml-deployment-monitoring.ts:636 - Drift detection
```

**Fix Implementation**:

```typescript
// Replace in agent-tool-handlers.ts handleWorkflowEvaluator
// Before:
const scores = {
  efficiency: Math.random() * 0.3 + 0.7,
  accuracy: Math.random() * 0.2 + 0.8,
  // ...
};

// After:
const scores = await this.calculateWorkflowMetrics(projectId, {
  analysisCount: project.analysisResults?.insights?.length || 0,
  errorCount: project.analysisResults?.errors?.length || 0,
  executionTime: project.journeyProgress?.executionMetrics?.totalTimeMs || 0,
  dataQuality: project.journeyProgress?.dataQuality?.overallScore || 0.5
});
```

**Effort**: 4 hours

---

### P0-6: Mock Payment Intent in Production

**Problem**: `server/routes/pricing.ts` has mock payment intent that could leak to production.

**Current State**:
- Mock payment exists at line 438-447
- Production check exists but may not cover all paths

**Impact**: Payment processing could fail in production

**Files to Verify**:
- `server/routes/pricing.ts` - Ensure all payment paths check production mode

**Fix**: Already partially implemented, verify coverage:

```typescript
// Ensure this check is at the top of ALL payment endpoints
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
  return res.status(503).json({
    success: false,
    error: 'Payment processing unavailable - Stripe not configured'
  });
}
```

**Effort**: 1 hour

---

### P0-7: Spark Tools Are All Placeholders

**Problem**: All 5 Spark tools registered but return "ready for implementation" placeholder.

**Current State**:
- `spark_ml_pipeline`, `spark_data_processor`, etc. registered
- Handler returns placeholder message
- Users see "Spark" option but it doesn't work

**Impact**: False advertising, user frustration

**Options**:
1. **Implement Spark integration** (8+ hours) - Connect to real Spark cluster
2. **Remove Spark tools from UI** (2 hours) - Hide until implemented
3. **Add Python fallback** (4 hours) - Use pandas for smaller datasets

**Recommended Fix** (Option 3):

```typescript
// In spark tool handler - use Python fallback for reasonable data sizes
async handleSparkDataProcessor(input: any): Promise<any> {
  const { data, operation } = input;

  // Check if data size warrants Spark
  const dataSize = JSON.stringify(data).length;
  const SPARK_THRESHOLD = 100 * 1024 * 1024; // 100MB

  if (dataSize < SPARK_THRESHOLD) {
    console.log('[Spark] Using Python fallback for small dataset');
    const pythonResult = await pythonProcessor.executeScript('data_processing.py', {
      data,
      operation,
      usePolars: true // Polars is faster than pandas
    });
    return pythonResult;
  }

  // For large data, check Spark availability
  if (!process.env.SPARK_ENABLED || process.env.SPARK_ENABLED !== 'true') {
    throw new Error('Spark processing requires SPARK_ENABLED=true. Dataset too large for Python processing.');
  }

  // Actual Spark processing
  return await sparkCluster.submitJob(operation, data);
}
```

**Effort**: 4 hours (Python fallback)

---

### P0-8: PPTX Generation is Placeholder

**Problem**: Presentation artifact generates a placeholder file, not real slides.

**Current State**:
- `artifact-generator.ts` has PPTX generation code
- But creates minimal placeholder content
- `pptxgenjs` library is installed

**Impact**: Users expect downloadable presentations, get empty file

**Files to Modify**:
- `server/services/artifact-generator.ts` - Implement real PPTX generation

**Fix Implementation**:

```typescript
// In artifact-generator.ts generatePresentation()
async generatePresentation(results: AnalysisResults, config: ArtifactConfig): Promise<Buffer> {
  const pptx = new pptxgen();

  // Title slide
  let slide = pptx.addSlide();
  slide.addText(config.projectName || 'Analysis Results', {
    x: 0.5, y: 2.0, w: '90%', h: 1,
    fontSize: 36, bold: true, align: 'center'
  });
  slide.addText(`Generated: ${new Date().toLocaleDateString()}`, {
    x: 0.5, y: 3.5, w: '90%', fontSize: 14, align: 'center'
  });

  // Executive Summary slide
  slide = pptx.addSlide();
  slide.addText('Executive Summary', { x: 0.5, y: 0.5, fontSize: 24, bold: true });

  const summaryBullets = results.executiveSummary?.keyFindings ||
    results.insights?.slice(0, 5).map(i => i.title) || [];

  slide.addText(summaryBullets.map(b => ({ text: b, options: { bullet: true } })), {
    x: 0.5, y: 1.5, w: '90%', fontSize: 16
  });

  // Key Insights slides (one per insight, max 5)
  for (const insight of (results.insights || []).slice(0, 5)) {
    slide = pptx.addSlide();
    slide.addText(insight.title, { x: 0.5, y: 0.5, fontSize: 20, bold: true });
    slide.addText(insight.description, { x: 0.5, y: 1.2, w: '90%', fontSize: 14 });

    if (insight.impact) {
      slide.addText(`Impact: ${insight.impact}`, {
        x: 0.5, y: 4.0, fontSize: 12, color: '0066CC'
      });
    }
  }

  // Recommendations slide
  if (results.recommendations?.length) {
    slide = pptx.addSlide();
    slide.addText('Recommendations', { x: 0.5, y: 0.5, fontSize: 24, bold: true });

    const recBullets = results.recommendations.map(r => ({
      text: `${r.title}: ${r.description}`,
      options: { bullet: true }
    }));

    slide.addText(recBullets, { x: 0.5, y: 1.5, w: '90%', fontSize: 14 });
  }

  // Generate buffer
  const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' });
  return pptxBuffer as Buffer;
}
```

**Effort**: 3 hours

---

## P1 High Priority Issues (User Experience Degradation)

### P1-1: No Admin Analytics Dashboard

**Problem**: Admin UI lacks visual analytics for revenue, usage trends, user acquisition.

**Files to Create**:
- `client/src/pages/admin/analytics-dashboard.tsx`
- `server/routes/admin-analytics.ts`

**Effort**: 6 hours

---

### P1-2: Campaign/Coupon Management Missing

**Problem**: `billing_campaigns` table exists but no admin UI to manage campaigns.

**Files to Create**:
- `client/src/pages/admin/campaigns.tsx`
- Add routes to `server/routes/admin-billing.ts`

**Effort**: 4 hours

---

### P1-3: Usage Alerts Not Implemented

**Problem**: No warning when users approach quota limits.

**Files to Modify**:
- `server/services/usage-alert-service.ts` (NEW)
- `server/email-service.ts` - Add quota warning email template

**Effort**: 3 hours

---

### P1-4: Subscription Cancel/Pause Not Self-Service

**Problem**: Users cannot pause or cancel subscriptions from UI.

**Files to Modify**:
- `client/src/pages/settings/subscription.tsx`
- `server/routes/billing.ts` - Add cancel/pause endpoints

**Effort**: 3 hours

---

### P1-5: Plan Step Integration Incomplete

**Problem**: Plan step generates detailed analysis plan but execution step may ignore it.

**Files to Modify**:
- `client/src/pages/execute-step.tsx` - Load approved plan
- `server/routes/analysis-execution.ts` - Respect plan order/config

**Effort**: 4 hours

---

### P1-6: Data Quality Scores Inconsistent

**Problem**: Quality scores sometimes show as 0-1, sometimes 0-100 scale.

**Files to Modify**:
- `server/routes/project.ts` - Standardize to 0-100
- `client/src/pages/data-verification-step.tsx` - Handle both scales

**Effort**: 2 hours

---

### P1-7: Conversational Data Chat Not Connected

**Problem**: "Ask about your data" UI exists but not wired to AI service.

**Files to Modify**:
- `client/src/components/DataChat.tsx`
- `server/routes/ai.ts` - Add conversational endpoint

**Effort**: 4 hours

---

### P1-8: WebSocket Reconnection Handling

**Problem**: If WebSocket disconnects, UI doesn't reconnect automatically.

**Files to Modify**:
- `client/src/lib/realtime.ts` - Add reconnection logic with exponential backoff

**Effort**: 2 hours

---

### P1-9: Multi-Dataset Join Preview Limited

**Problem**: Join preview only shows first 20 rows, no column filtering.

**Files to Modify**:
- `client/src/pages/data-transformation-step.tsx` - Add pagination and column selection

**Effort**: 2 hours

---

### P1-10: Error Messages Not User-Friendly

**Problem**: Technical error messages exposed to non-tech users.

**Files to Modify**:
- Create error message mapping service
- Update all API error responses

**Effort**: 3 hours

---

### P1-11: Consultation Journey Admin View Missing

**Problem**: Admin consultants can't see customer projects they're consulting on.

**Files to Modify**:
- `client/src/pages/admin/consultation-queue.tsx` (NEW)
- `server/routes/consultation.ts` - Add consultant project list

**Effort**: 4 hours

---

### P1-12: Decision Trail Sparse Data

**Problem**: Decision audit trail endpoint exists but agents don't consistently log decisions.

**Files to Modify**:
- All `*-agent.ts` files - Add decision logging calls
- `server/services/decision-audit-service.ts` - Standardize logging

**Effort**: 4 hours

---

## P2 Medium Priority Issues (Missing Features)

### P2-1: Research Agent Web Scraping Placeholder

**Problem**: `handleWebResearch` has TODO for real web scraping.

**Effort**: 4 hours

---

### P2-2: Industry Research Placeholder

**Problem**: `handleIndustryResearch` has TODO for real research.

**Effort**: 4 hours

---

### P2-3: Governance Tools Placeholder

**Problem**: All 3 governance tools are placeholders.

**Effort**: 3 hours

---

### P2-4: Health Check Tools Placeholder

**Problem**: All 3 health check tools are placeholders.

**Effort**: 2 hours

---

### P2-5: Troubleshooting Tools Placeholder

**Problem**: 2 troubleshooting tools are placeholders.

**Effort**: 2 hours

---

### P2-6: Bulk User Tier Management

**Problem**: No admin bulk operations for user tier changes.

**Effort**: 3 hours

---

### P2-7: Refund/Credit Management UI

**Problem**: No admin UI for issuing refunds or credits.

**Effort**: 3 hours

---

### P2-8: Billing Report Generation

**Problem**: No revenue/usage reports for admin.

**Effort**: 4 hours

---

### P2-9: Step Progress Indicators

**Problem**: Steps show wizard progress but not internal step progress.

**Effort**: 3 hours

---

### P2-10: Save Draft Between Steps

**Problem**: Closing browser loses unsaved work mid-step.

**Effort**: 4 hours

---

### P2-11: Journey Resumption UI

**Problem**: Resume journey from dashboard could be more prominent.

**Effort**: 2 hours

---

### P2-12: Google Drive Integration Stub

**Problem**: `google-drive.ts` is a stub implementation.

**Effort**: 4 hours

---

### P2-13: Trial Period Management

**Problem**: No automatic downgrade or reminder emails for trial expiration.

**Effort**: 3 hours

---

### P2-14: Agent Parallel Execution

**Problem**: Sequential execution may bottleneck independent tasks.

**Effort**: 4 hours

---

### P2-15: Consolidate Billing Services

**Problem**: 8 billing-related files should be consolidated to 1.

**Effort**: 4 hours

---

## P3 Low Priority Issues (Polish & Tech Debt)

### P3-1: Route Naming Inconsistency

**Problem**: "preview" vs "results" naming in routes.

**Effort**: 1 hour

---

### P3-2: TypeScript Errors (68 remaining)

**Problem**: Non-blocking type errors in frontend components.

**Effort**: 4 hours

---

### P3-3: Remove Legacy Billing Files

**Problem**: Legacy `enhanced-billing-service*.ts` files should be deleted.

**Effort**: 2 hours

---

### P3-4: Replace Orchestrator Switch with Messages

**Problem**: Hardcoded switch statements instead of message-based coordination.

**Effort**: 4 hours

---

### P3-5: Add Step Undo Capability

**Problem**: No rollback for non-destructive steps.

**Effort**: 4 hours

---

### P3-6: Journey Duplication Feature

**Problem**: Can't duplicate project for similar analyses.

**Effort**: 3 hours

---

### P3-7: Semantic Pipeline Orphaned

**Problem**: `semantic-data-pipeline.ts` has no DB tables.

**Effort**: 2 hours

---

### P3-8: Code Documentation

**Problem**: Some complex services lack JSDoc comments.

**Effort**: 4 hours

---

### P3-9: Test Coverage Gaps

**Problem**: Some critical paths lack unit tests.

**Effort**: 4 hours

---

### P3-10: Performance Profiling

**Problem**: No systematic performance benchmarks.

**Effort**: 3 hours

---

### P3-11: Logging Standardization

**Problem**: Inconsistent log formats across services.

**Effort**: 2 hours

---

### P3-12: Dead Code Removal

**Problem**: Some unused exports and functions.

**Effort**: 2 hours

---

## Implementation Roadmap

### Week 1: Revenue Critical (P0-1 to P0-4)
- Trial credits implementation (4 hours)
- Overage pricing (3 hours)
- Feature gating (3 hours)
- BA translation display fix (2 hours)
**Total: 12 hours**

### Week 2: Trust & Reliability (P0-5 to P0-8)
- Remove Math.random() stubs (4 hours)
- Production payment verification (1 hour)
- Spark Python fallback (4 hours)
- PPTX generation (3 hours)
**Total: 12 hours**

### Week 3: User Experience (P1-1 to P1-6)
- Admin analytics dashboard (6 hours)
- Campaign management (4 hours)
- Usage alerts (3 hours)
- Subscription self-service (3 hours)
**Total: 16 hours**

### Week 4: User Experience (P1-7 to P1-12)
- Plan step integration (4 hours)
- Quality score consistency (2 hours)
- Data chat connection (4 hours)
- WebSocket reconnection (2 hours)
**Total: 12 hours**

### Weeks 5-6: Medium Priority (P2)
- Implement remaining placeholder tools
- Bulk admin operations
- Report generation
- Draft save functionality
**Total: ~40 hours**

### Ongoing: Low Priority (P3)
- Tech debt reduction
- Documentation
- Test coverage
- Performance optimization
**Total: ~25 hours**

---

## Verification Checklist

After implementing P0 fixes, verify:

- [ ] New user gets 100 trial credits
- [ ] Trial credits deduct on analysis execution
- [ ] User blocked when credits exhausted (402 response)
- [ ] Overage charges appear on invoices
- [ ] Feature access blocked for lower tiers (403 response)
- [ ] BA translations visible in project Insights tab
- [ ] No `Math.random()` in production code paths
- [ ] Payment endpoints fail gracefully without Stripe config
- [ ] Spark tools use Python fallback for small datasets
- [ ] PPTX downloads contain real content

---

## Files Summary

### New Files to Create
1. `server/middleware/feature-gate.ts`
2. `server/services/usage-alert-service.ts`
3. `client/src/pages/admin/analytics-dashboard.tsx`
4. `client/src/pages/admin/campaigns.tsx`
5. `client/src/pages/admin/consultation-queue.tsx`

### Files with Major Changes
1. `shared/schema.ts` - Add trial credits fields
2. `server/services/billing/unified-billing-service.ts` - Credit & overage logic
3. `server/routes/analysis-execution.ts` - Payment/credit gating
4. `server/services/agent-tool-handlers.ts` - Replace stubs
5. `server/services/artifact-generator.ts` - Real PPTX generation
6. `client/src/pages/project-page.tsx` - BA translation display

### Files to Delete (After Migration)
1. `server/enhanced-billing-service-v2.ts`
2. `server/enhanced-billing-service.ts`
3. `server/services/project-manager-agent.head.ts`

---

## Conclusion

The ChimariData platform has a solid foundation but requires **~115 hours of development** to address all identified issues:

| Priority | Hours | Impact |
|----------|-------|--------|
| P0 Critical | 20 | Blocks revenue, trust |
| P1 High | 30 | Degrades experience |
| P2 Medium | 40 | Missing features |
| P3 Low | 25 | Polish, debt |

**Recommended Approach**:
1. Complete P0 in first 2 weeks (20 hours)
2. Complete P1 in weeks 3-4 (30 hours)
3. Prioritize P2 based on user feedback
4. Address P3 as capacity allows

The platform can go live after P0 completion, with P1 addressed in fast-follow releases.

---

*Report generated by Claude Code - January 21, 2026*
