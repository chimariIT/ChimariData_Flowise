# Custom Journey Billing Integration

**Key Principle:** Custom journeys use the **EXACT SAME** billing flow as all other journeys (AI-guided, Template-based, Self-service, Consultation). The only difference is the UI for capability selection.

---

## ✅ How It Works

### 1. User Selects Capabilities (UI Layer)
```
User Interface:
- Browse capability catalog
- Select: "Data Cleaning" + "Classification Models" + "Advanced Visualizations"
- See estimated duration: ~25 minutes
- NO upfront pricing shown (follows subscription model)
```

### 2. Capabilities Map to Tools & Features
```typescript
// From custom-journey-capabilities.ts
const selectedCapabilities = ['data_cleaning', 'classification', 'advanced_visualizations'];

const usageSummary = getCustomJourneyUsageSummary(selectedCapabilities, {
  recordCount: 10000,
  sizeGB: 0.05
});

// Returns:
{
  journeyType: 'custom',
  toolExecutions: [
    { toolName: 'data_transformer', complexity: 'intermediate' },
    { toolName: 'comprehensive_ml_pipeline', complexity: 'advanced' },
    { toolName: 'enhanced_visualization_engine', complexity: 'intermediate' }
  ],
  featureIds: ['data_transformation', 'ml_training', 'visualization'],
  dataVolume: 0.05, // GB
  recordCount: 10000
}
```

### 3. Unified Billing Service Handles Everything
```typescript
// In project-manager-agent.ts (after execution)
import { getBillingService } from './billing/unified-billing-service';

const billingService = getBillingService();

// Track journey usage (SAME as other journeys)
await billingService.trackJourneyUsage(userId, {
  journeyType: 'custom',
  dataVolume: 0.05,
  analysisComplexity: 'advanced', // Highest complexity from selected capabilities
  featuresUsed: usageSummary.featureIds
});

// Track each tool execution (SAME as other journeys)
for (const tool of usageSummary.toolExecutions) {
  await billingService.trackFeatureUsage(userId, tool.toolName, tool.complexity);
}
```

### 4. Subscription Eligibility & Quotas Apply
```typescript
// Before execution starts
const eligibility = await billingService.checkEligibility(userId, {
  journeyType: 'custom',
  dataVolume: 0.05,
  complexity: 'advanced'
});

if (!eligibility.canProceed) {
  // User hit quota limit or lacks subscription tier
  return {
    error: eligibility.reason,
    quotaRemaining: eligibility.quotaRemaining,
    upgradeRequired: eligibility.upgradeRequired
  };
}
```

### 5. Usage Tracked, Quota Consumed
```
User: Professional Tier ($49/month)
Quota: 50 AI queries/month, 10 GB data/month

After Custom Journey:
- AI queries used: 5 (from ML model training)
- Data volume used: 50 MB
- Remaining: 45 queries, 9.95 GB

If quota exceeded:
- Overage charges apply (same rates as other journeys)
- Bill calculated at end of billing cycle
```

---

## 📊 Billing Flow Comparison

### Traditional Journey (e.g., AI-Guided)
```
1. User selects "AI-Guided" journey
2. PM Agent orchestrates predefined workflow:
   - file_processor → schema_generator → statistical_analyzer → visualization_engine
3. Each tool execution tracked by unified-billing-service
4. Quota consumed, overage calculated if needed
5. User billed based on subscription + overages
```

### Custom Journey (NEW)
```
1. User selects "Custom" journey
2. User chooses capabilities:
   - data_cleaning, classification, advanced_visualizations
3. PM Agent orchestrates custom workflow:
   - data_transformer → comprehensive_ml_pipeline → enhanced_visualization_engine
4. Each tool execution tracked by unified-billing-service (SAME)
5. Quota consumed, overage calculated if needed (SAME)
6. User billed based on subscription + overages (SAME)
```

**Difference:** Steps 1-2 are UI selection, Steps 3-6 are IDENTICAL

---

## 🔄 Integration Points

### A. Capability Catalog (`shared/custom-journey-capabilities.ts`)
- **NO hardcoded pricing** ❌
- **Maps to tools & features** ✅
- **Specifies complexity level** ✅
- **Defines dependencies** ✅

```typescript
{
  id: 'classification',
  name: 'Classification Models',
  toolNames: ['comprehensive_ml_pipeline', 'automl_optimizer'], // Tracked by billing
  featureIds: ['ml_training'],  // Feature ID for billing service
  complexity: 'advanced',       // Used for billing calculations
  requiredCapabilities: ['data_upload'], // Dependencies
  minSubscriptionTier: 'professional'    // Eligibility check
}
```

### B. Unified Billing Service (`server/services/billing/unified-billing-service.ts`)
- **No changes needed** ✅
- Existing methods handle custom journey:
  - `trackJourneyUsage()` - Already supports any journey type
  - `trackFeatureUsage()` - Already tracks tool executions
  - `checkEligibility()` - Already validates subscription tier & quotas
  - `calculateUsageCharge()` - Already calculates overages

### C. Project Manager Agent (`server/services/project-manager-agent.ts`)
**New Method:**
```typescript
async orchestrateCustomJourney(
  projectId: string,
  selectedCapabilities: string[],
  datasetInfo: any
): Promise<OrchestrationPlan> {
  // 1. Get tool executions from capabilities
  const { capabilities, estimatedDuration } = getCustomJourneyToolExecutions(selectedCapabilities);

  // 2. Build workflow steps (same as other journeys)
  const steps: WorkflowStep[] = capabilities.flatMap(cap =>
    cap.toolNames.map(toolName => ({
      stepId: `${cap.id}_${toolName}`,
      toolName,
      complexity: cap.complexity,
      checkpointRequired: true // User approval at each step
    }))
  );

  // 3. Return orchestration plan (SAME format as other journeys)
  return {
    projectId,
    journeyType: 'custom',
    steps,
    totalSteps: steps.length,
    estimatedDuration
  };
}
```

### D. PM Agent Execution (SAME as other journeys)
```typescript
// Execute workflow
for (const step of plan.steps) {
  // 1. Execute tool
  const result = await executeTool(step.toolName, agentId, input, context);

  // 2. Track usage (SAME as other journeys)
  await billingService.trackFeatureUsage(userId, step.toolName, step.complexity);

  // 3. Present checkpoint to user (SAME)
  await this.presentCheckpoint(projectId, step.stepId, result, userRole);

  // 4. Wait for user approval (SAME)
  const decision = await this.waitForCheckpointDecision(projectId);

  if (!decision.approved) {
    // User rejected - handle accordingly
    break;
  }
}
```

---

## 💰 Pricing Examples

### Example 1: User with Professional Tier
**Monthly Subscription:** $49/month
**Quota:** 50 AI queries, 10 GB data, 100 tool executions

**Selected Capabilities:**
- Data Cleaning (complexity: intermediate)
- Descriptive Statistics (complexity: basic)
- Basic Charts (complexity: basic)

**Usage:**
- 3 tool executions (within quota)
- 50 MB data (within quota)
- 2 AI queries (within quota)

**Cost:** $0 (covered by subscription)

### Example 2: User with Starter Tier (Over Quota)
**Monthly Subscription:** $19/month
**Quota:** 20 AI queries, 2 GB data, 50 tool executions

**Selected Capabilities:**
- Data Cleaning
- Classification Models
- AutoML Optimization (60 trials)

**Usage:**
- 65 tool executions (15 over quota)
- 100 MB data (within quota)
- 25 AI queries (5 over quota)

**Overage Charges:**
- Tool executions: 15 × $0.10 = $1.50
- AI queries: 5 × $0.50 = $2.50
- **Total Overage:** $4.00

**Monthly Bill:** $19 (subscription) + $4 (overage) = $23.00

### Example 3: Trial User (Pay-per-use)
**Monthly Subscription:** $0 (trial)
**Quota:** 5 AI queries, 50 MB data, 10 tool executions

**Selected Capabilities:**
- Data Upload (free)
- Data Cleaning

**Usage:**
- 2 tool executions (within quota)
- 30 MB data (within quota)

**Cost:** $0 (within trial limits)

---

## 🔍 Admin View: Subscription Management

### Quota Tracking Dashboard
```
User: john@example.com
Tier: Professional ($49/month)
Billing Period: Jan 1-31, 2025

QUOTA USAGE:
┌────────────────────────────────┐
│ AI Queries:     35 / 50  (70%) │
│ Data Volume:   7.2 / 10  (72%) │
│ Tool Executions: 78 / 100 (78%)│
└────────────────────────────────┘

RECENT JOURNEYS:
1. Custom Journey (Jan 15)
   - Capabilities: data_cleaning, classification
   - Tools Used: 15
   - AI Queries: 8
   - Cost: $0 (within quota)

2. AI-Guided Journey (Jan 10)
   - Tools Used: 12
   - AI Queries: 10
   - Cost: $0 (within quota)
```

### Feature Usage Analytics
```
FEATURE USAGE (This Month):
┌─────────────────────────┬───────┬──────────┐
│ Feature                 │ Count │ Overage  │
├─────────────────────────┼───────┼──────────┤
│ data_transformation     │ 12    │ $0       │
│ ml_training             │ 5     │ $0       │
│ visualization           │ 8     │ $0       │
│ statistical_analysis    │ 10    │ $0       │
└─────────────────────────┴───────┴──────────┘
```

---

## ✅ Summary: No Separate Billing Logic

| Aspect | Custom Journey | Other Journeys | Status |
|--------|---------------|----------------|--------|
| **Quota Check** | ✅ Same | ✅ Same | Unified |
| **Usage Tracking** | ✅ Same | ✅ Same | Unified |
| **Tool Execution** | ✅ Same | ✅ Same | Unified |
| **Overage Calculation** | ✅ Same | ✅ Same | Unified |
| **Subscription Eligibility** | ✅ Same | ✅ Same | Unified |
| **Billing Service** | ✅ unified-billing-service.ts | ✅ unified-billing-service.ts | Same File |
| **Admin Dashboard** | ✅ Same metrics | ✅ Same metrics | Unified View |

**The ONLY difference:** Custom journey has UI for capability selection instead of predefined workflow.

---

## 🚀 Next Implementation Steps

1. **Update remaining capabilities in catalog** - Add featureIds and complexity to all 20 capabilities
2. **Create API endpoint** - `POST /api/custom-journey/start` that creates project with selected capabilities
3. **Add PM agent method** - `orchestrateCustomJourney()` that builds execution plan from capabilities
4. **Build UI** - Custom journey builder with capability selection
5. **Test with billing** - Verify usage tracking works identically to other journeys

**No billing code changes needed** - Everything uses existing `unified-billing-service.ts`! 🎉
