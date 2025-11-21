# ML & LLM Billing Integration Plan

**Date**: October 22, 2025
**Status**: 📋 **IMPLEMENTATION GUIDE**
**Purpose**: Complete integration of ML and LLM capabilities with billing, subscriptions, and user journeys

---

## 🎯 Overview

This document provides a complete implementation plan for integrating the new ML and LLM fine-tuning capabilities into the platform's billing, subscription, usage tracking, and user journey systems.

---

## Part 1: MCP Tool Registry Integration

### 1.1 New Tools to Register

Add the following tools to `server/services/mcp-tool-registry.ts` in the tools array (after existing ML tools):

```typescript
// ========================================
// COMPREHENSIVE ML TOOLS
// ========================================
{
  name: 'comprehensive_ml_pipeline',
  description: 'Train ML models with intelligent library selection, AutoML, and explainability',
  service: 'ComprehensiveMLService',
  permissions: ['train_models', 'automl', 'model_explainability', 'library_selection'],
  category: 'ml_advanced',
  agentAccess: ['data_scientist'],
  billingMultiplier: 1.5,  // 50% premium for advanced features
  requiresSubscription: 'professional'  // Minimum tier
},
{
  name: 'automl_optimizer',
  description: 'Automated ML with Bayesian hyperparameter optimization using Optuna',
  service: 'ComprehensiveMLService',
  permissions: ['automl', 'hyperparameter_optimization'],
  category: 'ml_advanced',
  agentAccess: ['data_scientist'],
  billingMultiplier: 5.0,  // AutoML is resource-intensive
  requiresSubscription: 'professional'
},
{
  name: 'ml_library_selector',
  description: 'Get ML library recommendation based on dataset characteristics',
  service: 'ComprehensiveMLService',
  permissions: ['performance_optimization'],
  category: 'ml_utility',
  agentAccess: ['data_scientist', 'data_engineer'],
  billingMultiplier: 0.1,  // Minimal cost for recommendation
  requiresSubscription: 'starter'
},
{
  name: 'ml_health_check',
  description: 'Check ML system health and library availability',
  service: 'ComprehensiveMLService',
  permissions: ['system_monitoring'],
  category: 'utility',
  agentAccess: ['data_scientist', 'project_manager'],
  billingMultiplier: 0,  // Free
  requiresSubscription: null
},

// ========================================
// LLM FINE-TUNING TOOLS
// ========================================
{
  name: 'llm_fine_tuning',
  description: 'Fine-tune LLMs with automatic method selection (LoRA, QLoRA, Full)',
  service: 'LLMFineTuningService',
  permissions: ['llm_training', 'parameter_efficient_fine_tuning', 'model_adaptation'],
  category: 'llm',
  agentAccess: ['data_scientist'],
  billingMultiplier: 10.0,  // LLM training is expensive
  requiresSubscription: 'enterprise',  // Enterprise only
  gpuRequired: true
},
{
  name: 'lora_fine_tuning',
  description: 'Parameter-efficient LLM fine-tuning with LoRA',
  service: 'LLMFineTuningService',
  permissions: ['llm_training', 'lora'],
  category: 'llm',
  agentAccess: ['data_scientist'],
  billingMultiplier: 3.0,  // Cheaper than full fine-tuning
  requiresSubscription: 'professional',
  gpuRequired: true
},
{
  name: 'llm_method_recommendation',
  description: 'Recommend LLM fine-tuning method based on available resources',
  service: 'LLMFineTuningService',
  permissions: ['resource_optimization'],
  category: 'llm_utility',
  agentAccess: ['data_scientist'],
  billingMultiplier: 0.1,
  requiresSubscription: 'professional'
},
{
  name: 'llm_health_check',
  description: 'Check LLM fine-tuning system health and GPU availability',
  service: 'LLMFineTuningService',
  permissions: ['system_monitoring'],
  category: 'utility',
  agentAccess: ['data_scientist', 'project_manager'],
  billingMultiplier: 0,  // Free
  requiresSubscription: null
}
```

### 1.2 Tool Handler Integration

Add handlers in `server/services/mcp-tool-registry.ts` in the `executeTool` function:

```typescript
import { comprehensiveMLHandler } from './comprehensive-ml-handler';
import { llmFineTuningHandler } from './llm-fine-tuning-handler';

// In executeTool() switch statement:
case 'comprehensive_ml_pipeline':
  result = await comprehensiveMLHandler.executeComprehensiveMLPipeline(input, executionContext);
  break;

case 'automl_optimizer':
  result = await comprehensiveMLHandler.executeAutoML(input, executionContext);
  break;

case 'ml_library_selector':
  result = await comprehensiveMLHandler.executeLibraryRecommendation(input, executionContext);
  break;

case 'ml_health_check':
  result = await comprehensiveMLHandler.executeMLHealthCheck(input, executionContext);
  break;

case 'llm_fine_tuning':
  result = await llmFineTuningHandler.executeFineTuning(input, executionContext);
  break;

case 'lora_fine_tuning':
  result = await llmFineTuningHandler.executeLoRAFineTuning(input, executionContext);
  break;

case 'llm_method_recommendation':
  result = await llmFineTuningHandler.executeMethodRecommendation(input, executionContext);
  break;

case 'llm_health_check':
  result = await llmFineTuningHandler.executeHealthCheck(input, executionContext);
  break;
```

---

## Part 2: Subscription Tier Updates

### 2.1 Update Subscription Tiers (`shared/subscription-tiers.ts`)

Add ML/LLM features to each tier:

```typescript
export const SUBSCRIPTION_TIERS = {
  trial: {
    id: 'trial',
    name: 'Trial',
    features: {
      // ... existing features
      ml_basic: true,              // Basic scikit-learn ML
      ml_advanced: false,          // NO AutoML, XGBoost, LightGBM
      llm_fine_tuning: false,      // NO LLM fine-tuning
      model_explainability: false  // NO SHAP/LIME
    },
    quotas: {
      // ... existing quotas
      ml_training_jobs: 5,
      ml_automl_trials: 0,         // NO AutoML in trial
      llm_fine_tuning_jobs: 0      // NO LLM in trial
    }
  },

  starter: {
    id: 'starter',
    name: 'Starter',
    features: {
      ml_basic: true,
      ml_advanced: false,          // NO advanced ML
      llm_fine_tuning: false,      // NO LLM
      model_explainability: true   // YES SHAP/LIME
    },
    quotas: {
      ml_training_jobs: 50,
      ml_automl_trials: 0,
      llm_fine_tuning_jobs: 0
    }
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    features: {
      ml_basic: true,
      ml_advanced: true,           // YES AutoML, XGBoost, LightGBM
      llm_fine_tuning: true,       // YES LoRA fine-tuning
      llm_qlora: true,             // YES QLoRA
      llm_full_fine_tuning: false, // NO full fine-tuning
      model_explainability: true
    },
    quotas: {
      ml_training_jobs: 500,
      ml_automl_trials: 1000,
      llm_fine_tuning_jobs: 10     // Limited LLM jobs
    }
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    features: {
      ml_basic: true,
      ml_advanced: true,
      llm_fine_tuning: true,
      llm_qlora: true,
      llm_full_fine_tuning: true,  // YES full LLM fine-tuning
      llm_distributed: true,       // YES multi-GPU training
      model_explainability: true,
      custom_ml_models: true       // YES bring your own models
    },
    quotas: {
      ml_training_jobs: 'unlimited',
      ml_automl_trials: 'unlimited',
      llm_fine_tuning_jobs: 100    // Higher limit
    }
  }
};
```

### 2.2 Feature Flags

Add feature flags in `server/services/role-permission.ts`:

```typescript
export const ML_LLM_FEATURES = {
  // Traditional ML
  'ml_basic': ['trial', 'starter', 'professional', 'enterprise'],
  'ml_advanced': ['professional', 'enterprise'],
  'ml_automl': ['professional', 'enterprise'],
  'model_explainability': ['starter', 'professional', 'enterprise'],

  // LLM Fine-Tuning
  'llm_lora': ['professional', 'enterprise'],
  'llm_qlora': ['professional', 'enterprise'],
  'llm_full_fine_tuning': ['enterprise'],
  'llm_distributed': ['enterprise'],

  // Advanced Features
  'spark_ml': ['enterprise'],
  'custom_models': ['enterprise']
};

export function hasMLFeature(userTier: string, feature: string): boolean {
  const allowedTiers = ML_LLM_FEATURES[feature];
  return allowedTiers && allowedTiers.includes(userTier);
}
```

---

## Part 3: Usage Tracking Integration

### 3.1 Create Usage Tracking Service

**File**: `server/services/ml-llm-usage-tracker.ts`

```typescript
import { db } from '../db';
import { mlUsageLog } from '../../shared/schema';

export interface MLUsageEvent {
  userId: number;
  projectId: number;
  toolName: string;
  modelType?: string;  // 'traditional_ml' | 'llm'
  libraryUsed?: string;  // 'sklearn', 'lightgbm', 'lora', 'qlora', etc.
  datasetSize: number;  // Number of rows/samples
  executionTimeMs: number;
  billingUnits: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export class MLLLMUsageTracker {
  /**
   * Log ML/LLM usage event
   */
  async logUsage(event: MLUsageEvent): Promise<void> {
    await db.insert(mlUsageLog).values({
      userId: event.userId,
      projectId: event.projectId,
      toolName: event.toolName,
      modelType: event.modelType,
      libraryUsed: event.libraryUsed,
      datasetSize: event.datasetSize,
      executionTimeMs: event.executionTimeMs,
      billingUnits: event.billingUnits,
      success: event.success,
      error: event.error,
      metadata: event.metadata,
      timestamp: new Date()
    });
  }

  /**
   * Get user's ML/LLM usage for billing period
   */
  async getUserUsage(userId: number, startDate: Date, endDate: Date) {
    const usage = await db.select()
      .from(mlUsageLog)
      .where(
        and(
          eq(mlUsageLog.userId, userId),
          gte(mlUsageLog.timestamp, startDate),
          lte(mlUsageLog.timestamp, endDate)
        )
      );

    return {
      total_billing_units: usage.reduce((sum, u) => sum + u.billingUnits, 0),
      total_jobs: usage.length,
      successful_jobs: usage.filter(u => u.success).length,
      failed_jobs: usage.filter(u => !u.success).length,
      by_tool: this.groupByTool(usage),
      by_library: this.groupByLibrary(usage)
    };
  }

  private groupByTool(usage: any[]) {
    const grouped: Record<string, any> = {};
    usage.forEach(u => {
      if (!grouped[u.toolName]) {
        grouped[u.toolName] = { count: 0, billing_units: 0 };
      }
      grouped[u.toolName].count++;
      grouped[u.toolName].billing_units += u.billingUnits;
    });
    return grouped;
  }

  private groupByLibrary(usage: any[]) {
    const grouped: Record<string, any> = {};
    usage.forEach(u => {
      const lib = u.libraryUsed || 'unknown';
      if (!grouped[lib]) {
        grouped[lib] = { count: 0, billing_units: 0 };
      }
      grouped[lib].count++;
      grouped[lib].billing_units += u.billingUnits;
    });
    return grouped;
  }
}

export const mlLLMUsageTracker = new MLLLMUsageTracker();
```

### 3.2 Add Usage Logging to Handlers

Update `comprehensive-ml-handler.ts` and `llm-fine-tuning-handler.ts`:

```typescript
import { mlLLMUsageTracker } from './ml-llm-usage-tracker';

// In executeComprehensiveMLPipeline():
// After getting result, log usage
await mlLLMUsageTracker.logUsage({
  userId: context.userId,
  projectId: context.projectId,
  toolName: 'comprehensive_ml_pipeline',
  modelType: 'traditional_ml',
  libraryUsed: result.library_used,
  datasetSize: input.data.length,
  executionTimeMs: executionTime,
  billingUnits: billingUnits,
  success: result.success,
  error: result.error,
  metadata: {
    method: result.method,
    automl_used: input.useAutoML,
    explainability_enabled: input.enableExplainability
  }
});
```

---

## Part 4: Billing System Integration

### 4.1 Add ML/LLM Pricing Tiers

**File**: `server/services/pricing.ts` (add to calculateCost function)

```typescript
export function calculateMLCost(params: {
  toolName: string;
  datasetSize: number;
  useAutoML?: boolean;
  method?: 'full' | 'lora' | 'qlora';
  numEpochs?: number;
  userTier: string;
}): number {
  let billingUnits = 0;

  // Traditional ML
  if (params.toolName === 'comprehensive_ml_pipeline') {
    const baseUnits = Math.ceil(params.datasetSize / 10000);
    const autoMLMultiplier = params.useAutoML ? 5 : 1;
    billingUnits = baseUnits * autoMLMultiplier;
  }

  if (params.toolName === 'automl_optimizer') {
    const trials = params.numEpochs || 50;
    billingUnits = Math.ceil(trials / 10);
  }

  // LLM Fine-Tuning
  if (params.toolName.includes('llm')) {
    const baseCostPer1K = {
      full: 10,
      lora: 3,
      qlora: 2
    };
    const samplesInK = params.datasetSize / 1000;
    const epochs = params.numEpochs || 3;
    const methodCost = baseCostPer1K[params.method || 'qlora'];
    billingUnits = Math.ceil(methodCost * samplesInK * epochs);
  }

  // Apply subscription tier discount
  const tierDiscounts = {
    trial: 0,          // No discount
    starter: 0.1,      // 10% discount
    professional: 0.2, // 20% discount
    enterprise: 0.3    // 30% discount
  };

  const discount = tierDiscounts[params.userTier] || 0;
  const unitCost = 0.10;  // $0.10 per billing unit

  return billingUnits * unitCost * (1 - discount);
}
```

### 4.2 Update Enhanced Billing Service

**File**: `server/services/enhanced-subscription-billing.ts`

Add ML/LLM usage to billing calculations:

```typescript
async function calculateMonthlyBill(userId: number): Promise<BillingDetails> {
  const user = await getUser(userId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get ML/LLM usage
  const mlUsage = await mlLLMUsageTracker.getUserUsage(userId, startOfMonth, now);

  // Calculate costs
  const subscriptionFee = getSubscriptionFee(user.subscription_tier);
  const mlCost = mlUsage.total_billing_units * 0.10;  // $0.10 per unit
  const overageCost = calculateOverages(user, mlUsage);

  return {
    subscription_fee: subscriptionFee,
    ml_usage_cost: mlCost,
    overage_cost: overageCost,
    total: subscriptionFee + mlCost + overageCost,
    billing_period: {
      start: startOfMonth,
      end: now
    },
    usage_details: {
      ml_jobs: mlUsage.total_jobs,
      ml_billing_units: mlUsage.total_billing_units,
      by_tool: mlUsage.by_tool
    }
  };
}
```

---

## Part 5: User Journey Integration

### 5.1 Add ML/LLM Steps to AI-Guided Journey

**File**: `server/services/project-manager-agent.ts`

```typescript
async function orchestrateAIGuidedJourney(project: Project): Promise<void> {
  // ... existing steps

  // Step 4: ML Model Selection (if data suitable for ML)
  if (await isMLApplicable(project)) {
    const mlRecommendation = await executeTool(
      'ml_library_selector',
      'project_manager',
      {
        rowCount: project.dataset_row_count,
        problemType: project.analysis_type
      },
      context
    );

    await requestUserApproval({
      step: 'ml_model_selection',
      recommendation: mlRecommendation,
      options: ['Use recommended library', 'Try AutoML', 'Skip ML training']
    });
  }

  // Step 5: LLM Fine-Tuning (if applicable)
  if (project.requires_llm_fine_tuning) {
    const llmMethod = await executeTool(
      'llm_method_recommendation',
      'data_scientist',
      {
        model_name: project.base_model,
        available_memory_gb: getAvailableGPUMemory()
      },
      context
    );

    await requestUserApproval({
      step: 'llm_fine_tuning',
      recommendation: llmMethod,
      estimated_cost: calculateLLMCost(llmMethod)
    });
  }
}
```

### 5.2 Add ML/LLM to Technical Journey

**File**: `client/src/pages/execute-step.tsx`

```typescript
// Add ML/LLM execution options
<MLExecutionPanel
  onExecute={async (config) => {
    const result = await api.post('/api/ml/train', {
      tool: config.useAutoML ? 'automl_optimizer' : 'comprehensive_ml_pipeline',
      data: projectData,
      config: config
    });

    // Show cost estimate
    showCostEstimate({
      billing_units: result.billingUnits,
      estimated_cost: result.estimatedCost,
      user_tier: user.subscription_tier
    });
  }}
/>

<LLMFineTuningPanel
  onExecute={async (config) => {
    // Check subscription tier
    if (!hasMLFeature(user.subscription_tier, 'llm_lora')) {
      showUpgradePrompt('LLM fine-tuning requires Professional tier or higher');
      return;
    }

    const result = await api.post('/api/llm/fine-tune', config);
    showCostEstimate(result);
  }}
/>
```

---

## Part 6: Admin Billing Dashboard

### 6.1 Add ML/LLM Usage to Admin Dashboard

**File**: `client/src/pages/admin/subscription-management.tsx`

```typescript
// Add ML/LLM usage section
<UsageBreakdown
  data={{
    traditional_ml: mlUsage.by_tool.comprehensive_ml_pipeline,
    automl: mlUsage.by_tool.automl_optimizer,
    llm_fine_tuning: mlUsage.by_tool.llm_fine_tuning,
    total_billing_units: mlUsage.total_billing_units,
    total_cost: mlUsage.total_billing_units * 0.10
  }}
/>

<LibraryUsageChart
  data={mlUsage.by_library}
  // Shows: sklearn (45%), lightgbm (30%), lora (20%), qlora (5%)
/>
```

---

## Part 7: Database Schema Updates

### 7.1 Add ML/LLM Usage Table

**File**: `shared/schema.ts`

```typescript
export const mlUsageLog = pgTable('ml_usage_log', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  projectId: integer('project_id').references(() => projects.id),
  toolName: text('tool_name').notNull(),
  modelType: text('model_type'),  // 'traditional_ml' | 'llm'
  libraryUsed: text('library_used'),
  datasetSize: integer('dataset_size'),
  executionTimeMs: integer('execution_time_ms'),
  billingUnits: doublePrecision('billing_units').notNull(),
  success: boolean('success').notNull(),
  error: text('error'),
  metadata: jsonb('metadata'),
  timestamp: timestamp('timestamp').notNull().defaultNow()
});
```

**Migration**: `migrations/009_add_ml_llm_usage_tracking.sql`

```sql
CREATE TABLE ml_usage_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  project_id INTEGER REFERENCES projects(id),
  tool_name TEXT NOT NULL,
  model_type TEXT,
  library_used TEXT,
  dataset_size INTEGER,
  execution_time_ms INTEGER,
  billing_units DOUBLE PRECISION NOT NULL,
  success BOOLEAN NOT NULL,
  error TEXT,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ml_usage_user ON ml_usage_log(user_id);
CREATE INDEX idx_ml_usage_project ON ml_usage_log(project_id);
CREATE INDEX idx_ml_usage_timestamp ON ml_usage_log(timestamp);
CREATE INDEX idx_ml_usage_tool ON ml_usage_log(tool_name);
```

---

## Part 8: Implementation Checklist

### Phase 1: Core Integration (2-3 hours)
- [ ] Add ML/LLM tools to MCP registry
- [ ] Add tool handlers to executeTool switch
- [ ] Import comprehensive-ml-handler and llm-fine-tuning-handler
- [ ] Test tool registration with health checks

### Phase 2: Subscription Integration (1-2 hours)
- [ ] Update subscription tiers with ML/LLM features
- [ ] Add feature flags to role-permission.ts
- [ ] Update subscription comparison UI
- [ ] Test tier restrictions

### Phase 3: Usage Tracking (2-3 hours)
- [ ] Create ml-llm-usage-tracker.ts
- [ ] Add database schema and migration
- [ ] Run migration: `npm run db:push`
- [ ] Add usage logging to all handlers
- [ ] Test usage tracking

### Phase 4: Billing Integration (2-3 hours)
- [ ] Add ML/LLM pricing to pricing.ts
- [ ] Update enhanced-subscription-billing.ts
- [ ] Add tier discounts
- [ ] Create cost estimation API endpoint
- [ ] Test billing calculations

### Phase 5: User Journey Integration (3-4 hours)
- [ ] Add ML steps to AI-guided journey
- [ ] Add ML/LLM panels to execute-step.tsx
- [ ] Add cost estimates to UI
- [ ] Add upgrade prompts for restricted features
- [ ] Test user flows end-to-end

### Phase 6: Admin Dashboard (2-3 hours)
- [ ] Add ML/LLM usage to admin dashboard
- [ ] Create usage breakdown component
- [ ] Add library usage charts
- [ ] Test admin billing views

### Phase 7: Testing (3-4 hours)
- [ ] Test ML training with billing
- [ ] Test LLM fine-tuning with billing
- [ ] Test subscription tier restrictions
- [ ] Test usage tracking accuracy
- [ ] Test cost calculations
- [ ] Test admin dashboard

### Phase 8: Documentation (1-2 hours)
- [ ] Update user documentation
- [ ] Update admin documentation
- [ ] Create pricing documentation
- [ ] Update API documentation

---

## 💰 Pricing Summary

### ML Training Costs
| Dataset Size | No AutoML | With AutoML |
|-------------|----------|-------------|
| 10K rows | $0.10 | $0.50 |
| 100K rows | $1.00 | $5.00 |
| 1M rows | $10.00 | $50.00 |

### LLM Fine-Tuning Costs
| Model Size | Method | 1K samples, 3 epochs |
|-----------|--------|---------------------|
| 7B params | QLoRA | $0.60 |
| 7B params | LoRA | $0.90 |
| 7B params | Full | $3.00 |

### Subscription Tier Discounts
- **Trial**: 0% discount
- **Starter**: 10% discount
- **Professional**: 20% discount + AutoML access
- **Enterprise**: 30% discount + LLM access

---

## 🎯 Success Metrics

After implementation, verify:
- [ ] All ML/LLM tools registered and accessible
- [ ] Subscription tiers correctly restrict features
- [ ] Usage tracking logs every execution
- [ ] Billing calculations match expected costs
- [ ] User journeys include ML/LLM steps
- [ ] Admin dashboard shows ML/LLM usage
- [ ] Cost estimates shown to users
- [ ] Upgrade prompts work correctly

---

**Estimated Total Implementation Time**: 16-24 hours

**Status**: Ready for implementation - Follow checklist sequentially
