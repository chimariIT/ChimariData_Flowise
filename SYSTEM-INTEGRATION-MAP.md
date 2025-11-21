# System Integration Map - Complete User Journey & Workflows

**Date**: January 2025
**Purpose**: Document how all system components are wired together
**Status**: PRE-CLEANUP VALIDATION

---

## 🎯 Overview

This document maps the complete integration of:
1. **Authentication Flow** - User registration, login, JWT tokens
2. **User Journey Workflows** - 4 journey types from start to finish
3. **Agentic Architecture** - Multi-agent orchestration and coordination
4. **Tool Execution** - MCP integration and real tool handlers
5. **Billing & Subscription** - Payment processing and usage tracking
6. **Analytics & Monitoring** - Tool analytics and performance tracking

---

## 🔐 1. Authentication & Authorization Flow

### Entry Point: `server/index.ts`
```
Lines 177-178: setupOAuth(app) - OAuth configuration
Lines 181-184: Rate limiting middleware applied
Line 192: app.use('/api', apiRouter) - Main API router
```

### Authentication Routes: `server/routes/auth.ts`

**Registration Flow** (`POST /api/auth/register`):
```
1. Client → POST /api/auth/register { email, firstName, lastName, password }
2. Server → Check existing user (line 155)
3. Server → Hash password with bcrypt (line 161, 10 rounds)
4. Server → storage.createUser() (line 163)
5. Server → tokenStorage.generateToken() (line 173)
6. Server → Response: { token, user } (line 175)
7. Client → Store token in localStorage
```

**Login Flow** (`POST /api/auth/login`):
```
1. Client → POST /api/auth/login { email, password }
2. Server → storage.getUserByEmail() (line 83)
3. Server → bcrypt.compare(password, hashedPassword) (line 89)
4. Server → tokenStorage.generateToken() (line 95)
5. Server → Response: { token, user } (line 122)
6. Client → Store token in localStorage
```

**Authentication Middleware** (`ensureAuthenticated`):
```typescript
// Location: server/routes/auth.ts lines 259-303
export const ensureAuthenticated = async (req, res, next) => {
  // 1. Check session-based auth (OAuth)
  if (req.isAuthenticated()) return next();

  // 2. Check Bearer token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const tokenData = tokenStorage.validateToken(token);

    if (tokenData) {
      const user = await storage.getUser(tokenData.userId);
      if (user) {
        req.user = user;
        req.userId = user.id;
        return next();
      }
    }
  }

  res.status(401).json({ error: "Authentication required" });
};
```

**Token Storage**:
- Location: `server/token-storage.ts`
- Generates JWT tokens with user ID and email
- Validates tokens on each authenticated request
- Tokens stored in-memory (should be Redis in production)

**Protected Routes Application**:
```typescript
// server/routes/index.ts
Line 37: router.use('/user', ensureAuthenticated, userRoleRouter)
Line 38: router.use('/usage', usageRouter) // No auth required for usage tracking
Line 47: router.use('/admin', adminSecuredRouter) // Admin-only routes
```

---

## 👥 2. Complete User Journey Flows

### 2.1 User Journey Types

Defined in database schema (`shared/schema.ts`):
```typescript
journeyType: "ai_guided" | "template_based" | "self_service" | "consultation"
```

Mapped to roles:
- `ai_guided` → "non-tech" users
- `template_based` → "business" users
- `self_service` → "technical" users
- `consultation` → "consultation" users

### 2.2 Journey Workflow: NON-TECH USER

**Frontend Entry**: `client/src/pages/new-project.tsx` or journey wizard

**Backend Flow**:

**Step 1: Project Creation**
```
Client → POST /api/projects/create
Route → server/routes/project.ts
Handler → storage.createProject({
  userId,
  name,
  description,
  journeyType: 'ai_guided',
  ...
})
Response → { projectId, project }
```

**Step 2: File Upload**
```
Client → POST /api/projects/:projectId/upload (with FormData)
Route → server/routes/project.ts
Middleware → uploadLimiter (rate limiting)
Handler → FileProcessor.processFile(buffer, filename, mimetype)
  → Detects schema, columns, data types
  → PIIAnalyzer.analyzePII(data, schema)
  → Returns: { processedData, piiAnalysis, fileInfo }
Storage → Creates temp file with tempStore.set(tempFileId, data)
Response → { tempFileId, piiAnalysis, schema, preview }
```

**Step 3: PII Decision**
```
Client → POST /api/auth/pii-decision
Route → server/routes/auth.ts line 471
Middleware → unifiedAuth (authentication required)
Handler → UnifiedPIIProcessor.processPIIData({
  decision,
  anonymizationConfig,
  piiAnalysis,
  originalData,
  originalSchema
})
  → Applies anonymization if requested
  → Creates final dataset
Storage → storage.createProject() with finalData
  → storage.createDataset() to store data separately
  → storage.linkProjectToDataset(projectId, datasetId)
Response → { projectId, project }
```

**Step 4: Analysis Request (Guided by AI)**
```
Client → POST /api/enhanced-analysis/request
Route → server/routes/enhanced-analysis.ts
Middleware → ensureAuthenticated
Handler → projectAgentOrchestrator.startAnalysis({
  projectId,
  userId,
  analysisType: 'descriptive', // AI suggests this
  ...
})
```

### Agent Orchestration Triggered:

**Location**: `server/services/project-agent-orchestrator.ts`

```typescript
// Line ~50: Start analysis
async startAnalysis(request) {
  // 1. Initialize workflow
  const workflow = {
    projectId,
    userId,
    status: 'in_progress',
    currentPhase: 'planning',
    agents: {
      projectManager: { status: 'active' },
      dataScientist: { status: 'pending' },
      businessAgent: { status: 'pending' }
    }
  };

  // 2. Start Project Manager Agent
  const pmAgent = await agentRegistry.getAgent('project_manager');
  const plan = await pmAgent.createAnalysisPlan(projectData);

  // 3. Coordinate other agents based on plan
  if (plan.requiresStatistics) {
    await executeTool('statistical_analyzer', 'data_scientist', {
      data: projectData.dataset,
      analysisType: 'descriptive'
    }, { userId, projectId });
  }

  if (plan.requiresVisualization) {
    await executeTool('visualization_engine', 'data_scientist', {
      data: projectData.dataset,
      chartType: 'auto'
    }, { userId, projectId });
  }

  // 4. Return results
  return workflow;
}
```

**Step 5: View Results**
```
Client → GET /api/projects/:projectId/results
Route → server/routes/project.ts
Handler → storage.getProject(projectId)
  → storage.getArtifacts(projectId)
  → Returns analysis results, charts, insights
Response → { results, artifacts, visualizations }
```

---

### 2.3 Journey Workflow: BUSINESS USER

Similar to Non-Tech but with:
- Template-based approach
- Business-specific analysis types
- Industry benchmarks
- ROI calculations

**Unique Step: Business Template Selection**
```
Client → GET /api/template/industries
Route → server/routes/template.ts
Handler → Returns list of business templates
Response → [{ id, name, industry, metrics }]

Client → POST /api/template/apply
Handler → Applies business template to project
  → Configures default analysis types
  → Sets up industry-specific visualizations
```

---

### 2.4 Journey Workflow: TECHNICAL USER

**Direct Tool Access**:

```
Client → POST /api/analysis/advanced
Route → server/routes/analysis.ts
Handler → Direct tool execution
  → executeTool('statistical_analyzer', 'technical_user', {
      analysisType: 'regression',
      hypothesis: userProvided,
      confidenceLevel: 0.95
    })
```

**ML Pipeline**:
```
Client → POST /api/analysis/ml/train
Route → server/routes/analysis.ts
Handler → executeTool('ml_pipeline', 'technical_user', {
  algorithm: 'random_forest',
  features: selectedFeatures,
  target: targetVariable,
  trainTestSplit: 0.8
})
```

---

### 2.5 Journey Workflow: CONSULTATION USER

**Expert Assignment**:
```
Client → POST /api/agents/consultation/request
Route → server/routes/agents.ts
Handler → Creates consultation request
  → Assigns expert based on domain
  → Sets up dedicated agent for user
```

---

## 🤖 3. Agentic Architecture Integration

### 3.1 Agent Initialization

**Entry Point**: `server/index.ts` lines 108-147

```typescript
// Initialize agents first
const agentResults = await initializeAgents();
// ✅ Initialized 5 agents:
//   - project_manager (coordination, planning, delivery)
//   - data_scientist (analysis, ML, statistics)
//   - data_engineer (data processing, transformation)
//   - business_agent (insights, templates, reporting)
//   - customer_support (help, guidance)

// Initialize tools
const toolResults = await initializeTools();
// ✅ Initialized 12 tools in 5 categories
```

### 3.2 Agent Registry

**Location**: `server/services/agent-registry.ts`

```typescript
class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();

  registerAgent(agent: AgentDefinition) {
    this.agents.set(agent.id, agent);
  }

  getAgent(agentId: string) {
    return this.agents.get(agentId);
  }

  getAgentsWithCapability(capability: string) {
    return Array.from(this.agents.values())
      .filter(a => a.capabilities.includes(capability));
  }
}
```

### 3.3 Agent Initialization Details

**Location**: `server/services/agent-initialization.ts`

Registered Agents:
1. **Project Manager Agent** (`project_manager`)
   - Capabilities: coordination, planning, delivery
   - Tools: project_coordinator, decision_auditor
   - Implementation: `server/services/project-manager-agent.ts`

2. **Data Scientist Agent** (`data_scientist`)
   - Capabilities: statistical_analysis, ml_training, visualization
   - Tools: statistical_analyzer, ml_pipeline, visualization_engine
   - Implementation: `server/services/data-scientist-agent.ts`

3. **Data Engineer Agent** (`data_engineer`)
   - Capabilities: data_processing, transformation, quality
   - Tools: file_processor, data_transformer, schema_generator
   - Implementation: `server/services/data-engineer-agent.ts`

4. **Business Agent** (`business_agent`)
   - Capabilities: insights, reporting, templates
   - Tools: business_templates, visualization_engine
   - Implementation: `server/services/business-agent.ts`

5. **Customer Support Agent** (`customer_support`)
   - Capabilities: help, guidance, troubleshooting
   - Tools: decision_auditor
   - Implementation: `server/services/customer-support-agent.ts`

### 3.4 Agent Coordination Flow

**Project Manager Agent Orchestration**:

Location: `server/services/project-manager-agent.ts`

```typescript
class ProjectManagerAgent {
  async coordinateAnalysis(projectId: string) {
    // 1. Create analysis plan
    const plan = await this.createPlan(projectId);

    // 2. Identify required agents
    const requiredAgents = this.identifyAgents(plan);
    // Example: ['data_engineer', 'data_scientist', 'business_agent']

    // 3. Execute in order
    for (const step of plan.steps) {
      if (step.requiresAgent === 'data_engineer') {
        await this.delegateToAgent('data_engineer', step.task);
      }

      if (step.requiresAgent === 'data_scientist') {
        await this.delegateToAgent('data_scientist', step.task);
      }

      // Wait for user approval at checkpoints
      if (step.requiresUserApproval) {
        await this.waitForUserApproval(step.checkpoint);
      }
    }

    // 4. Coordinate final delivery
    const artifacts = await this.collectArtifacts(projectId);
    return this.packageResults(artifacts);
  }
}
```

**Issue Identified** (CRITICAL):
- Line 954-971: Uses polling instead of real-time coordination
- Should use WebSocket for instant checkpoint notifications
- **TODO**: Replace with event-driven architecture

---

## 🛠️ 4. Tool Execution & MCP Integration

### 4.1 Tool Registry

**Location**: `server/services/mcp-tool-registry.ts`

**Core Tools Registered** (lines 215-307):

1. **file_processor** - Process uploaded files
   - Category: data
   - Agents: data_engineer, data_scientist, project_manager

2. **schema_generator** - Analyze and generate schema
   - Category: data
   - Agents: data_engineer, data_scientist

3. **data_transformer** - Clean and transform data
   - Category: data
   - Agents: data_engineer, data_scientist

4. **statistical_analyzer** ✅ REAL IMPLEMENTATION
   - Category: analysis
   - Agents: data_scientist
   - Handler: `server/services/real-tool-handlers.ts`

5. **ml_pipeline** ✅ REAL IMPLEMENTATION
   - Category: ml
   - Agents: data_scientist
   - Handler: `server/services/real-tool-handlers.ts`

6. **visualization_engine** ✅ REAL IMPLEMENTATION
   - Category: visualization
   - Agents: data_scientist, business_agent
   - Handler: `server/services/real-tool-handlers.ts`

7. **business_templates** - Apply industry templates
   - Category: business
   - Agents: business_agent, project_manager

8. **project_coordinator** - Coordinate workflow
   - Category: utility
   - Agents: project_manager

9. **decision_auditor** - Audit decisions
   - Category: utility
   - Agents: all

10. **api_data_fetcher** ✅ REAL IMPLEMENTATION
    - Category: utility
    - Agents: technical, consultation
    - Handler: `server/services/api-data-fetcher.ts`

### 4.2 Tool Execution Flow

**Entry Point**: `executeTool()` function

Location: `server/services/mcp-tool-registry.ts` lines 316-425

```typescript
export async function executeTool(
  toolName: string,
  agentId: string,
  input: any,
  context?: { userId?: number; projectId?: string }
): Promise<any> {
  // 1. Permission check
  if (!MCPToolRegistry.canAgentUseTool(agentId, toolName)) {
    throw new Error(`Agent ${agentId} does not have access to tool ${toolName}`);
  }

  // 2. Start analytics tracking ✅ NEW
  const tracking = toolAnalyticsService.startExecution({
    toolId: toolName,
    agentId,
    userId: context?.userId,
    projectId: context?.projectId
  });

  // 3. Route to real handler
  let result;
  switch (toolName) {
    case 'statistical_analyzer':
      result = await statisticalAnalyzerHandler.execute(input, executionContext);
      break;

    case 'ml_pipeline':
      result = await mlPipelineHandler.execute(input, executionContext);
      break;

    case 'visualization_engine':
      result = await visualizationEngineHandler.execute(input, executionContext);
      break;

    default:
      // Placeholder for tools not yet implemented
      result = { status: 'success', note: 'Placeholder' };
  }

  // 4. Complete analytics tracking ✅ NEW
  await tracking.complete(result);

  return result;
}
```

### 4.3 Real Tool Handlers

**Location**: `server/services/real-tool-handlers.ts`

**Statistical Analyzer Handler**:
```typescript
export const statisticalAnalyzerHandler = {
  async execute(input: any, context: any) {
    const { data, analysisType, options } = input;

    // 1. Use Python processor for analysis
    const pythonResult = await PythonProcessor.runAnalysis({
      data,
      analysisType: ['descriptive', 'inferential', 'hypothesis_testing'],
      options
    });

    // 2. Format results
    return {
      executionId: context.executionId,
      toolId: 'statistical_analyzer',
      status: 'success',
      result: {
        descriptiveStats: pythonResult.descriptive,
        inferentialStats: pythonResult.inferential,
        hypothesisTests: pythonResult.hypothesisTests
      },
      metrics: {
        duration: pythonResult.duration,
        resourcesUsed: { cpu: 5, memory: 100, storage: 0 },
        cost: 0.05
      },
      artifacts: [{
        type: 'statistical_report',
        data: pythonResult.report
      }]
    };
  }
};
```

**ML Pipeline Handler**:
```typescript
export const mlPipelineHandler = {
  async execute(input: any, context: any) {
    const { data, algorithm, features, target, options } = input;

    // 1. Use ML service for training
    const mlResult = await MLService.trainModel({
      data,
      algorithm,
      features,
      target,
      options
    });

    // 2. Format results
    return {
      executionId: context.executionId,
      toolId: 'ml_pipeline',
      status: 'success',
      result: {
        model: mlResult.model,
        metrics: mlResult.performance,
        featureImportance: mlResult.featureImportance
      },
      metrics: {
        duration: mlResult.trainingTime,
        resourcesUsed: { cpu: 10, memory: 500, storage: 50 },
        cost: 0.25
      },
      artifacts: [{
        type: 'trained_model',
        data: mlResult.serializedModel
      }]
    };
  }
};
```

### 4.4 MCP Service Integration

**Enhanced MCP Service**: `server/enhanced-mcp-service.ts`

Provides unified access to:
- Tools (via MCPToolRegistry)
- AI Models (Gemini, OpenAI, Anthropic)
- Database Resources
- API Resources

**Integration Point**:
```typescript
// server/services/agent-initialization.ts
import { EnhancedMCPService } from '../enhanced-mcp-service';

// Register agent with MCP
EnhancedMCPService.addResource({
  type: 'agent',
  name: agentId,
  config: agentConfig,
  permissions: agentPermissions
});
```

---

## 💰 5. Billing & Subscription Integration

### 5.1 Current State (CRITICAL ISSUE)

**Problem**: THREE conflicting billing implementations exist!

**Files**:
1. `server/enhanced-billing-service.ts` (675 lines)
2. `server/enhanced-billing-service-v2.ts` (EMPTY FILE - 1 line!)
3. `server/services/enhanced-billing-service.ts` (duplicate?)
4. `server/services/enhanced-subscription-billing.ts` (200+ lines)
5. `server/services/billing/unified-billing-service.ts` (newer)

### 5.2 Intended Billing Flow (Based on Analysis)

**Subscription Tiers** (from `shared/schema.ts`):
```typescript
subscriptionTier: string; // No enum enforcement - ISSUE!
// Should be: 'trial' | 'starter' | 'professional' | 'enterprise'
```

**Usage Tracking Locations**:
1. `server/services/usage-tracking.ts` - Real-time usage monitoring
2. `server/routes/usage.ts` - Usage API endpoints
3. `server/services/pricing.ts` - Cost calculation

**Billing Integration Points**:

**1. On User Registration**:
```typescript
// server/routes/auth.ts line 169
const user = await storage.createUser({
  ...
  subscriptionTier: 'trial' // Default tier
});
```

**2. On Tool Execution** (SHOULD track usage):
```typescript
// server/services/mcp-tool-registry.ts
// ✅ Analytics tracking added (lines 336-344)
// ❌ Billing/usage tracking NOT connected yet
```

**3. On Project Creation**:
```typescript
// server/routes/project.ts
// Should check user quota
// Should track usage
// Should calculate cost
```

**4. Stripe Webhook** (Payment Processing):
```typescript
// server/routes/stripe-webhooks.ts
// ⚠️ CRITICAL: No webhook signature verification!
router.post('/webhook', async (req, res) => {
  const event = req.body; // UNSAFE - should verify signature

  switch (event.type) {
    case 'checkout.session.completed':
      // Update user subscription
      await updateUserSubscription(event.data);
      break;

    case 'customer.subscription.updated':
      // Update subscription tier
      break;

    case 'customer.subscription.deleted':
      // Cancel subscription
      break;
  }
});
```

**Issues**:
- ❌ No Stripe webhook signature verification (SECURITY VULNERABILITY)
- ❌ Multiple billing services not consolidated
- ❌ Usage tracking not connected to billing
- ❌ No transaction management (operations not atomic)

### 5.3 Billing Route Integration

**Location**: `server/routes/billing.ts`

**Key Endpoints**:
```
POST /api/billing/checkout          - Create Stripe checkout session
POST /api/billing/subscribe         - Subscribe to plan
GET  /api/billing/usage             - Get usage breakdown
POST /api/billing/webhook           - Stripe webhook (INSECURE)
GET  /api/billing/capacity          - Check remaining capacity
```

---

## 📊 6. Analytics & Monitoring Integration

### 6.1 Tool Analytics Service ✅ NEW

**Location**: `server/services/tool-analytics.ts`

**Integrated With**:
- Tool execution (automatically tracks all executions)
- Agent operations (tracks which agents use which tools)
- User activity (tracks per-user costs)

**Metrics Collected**:
- Execution duration
- Resource usage (CPU, memory, storage)
- Cost per execution
- Success/failure rates
- Error patterns
- Performance trends

### 6.2 Analytics API Endpoints ✅ NEW

**Location**: `server/routes/analytics.ts`

**Wired Into Router**:
```typescript
// ❌ NOT YET ADDED TO routes/index.ts!
// TODO: Add line to server/routes/index.ts:
// router.use('/analytics', analyticsRouter);
```

**Available Endpoints**:
```
GET  /api/analytics/tools/:toolId          - Tool-specific analytics
GET  /api/analytics/system                 - System-wide metrics
GET  /api/analytics/agents/:agentId        - Agent usage breakdown
GET  /api/analytics/users/:userId/costs    - User cost breakdown
GET  /api/analytics/alerts                 - Performance alerts
GET  /api/analytics/export                 - Export to monitoring systems
GET  /api/analytics/dashboard              - Comprehensive dashboard
POST /api/analytics/record                 - Record execution metrics
```

### 6.3 Performance Monitoring

**Location**: `server/routes/performance-webhooks.ts`

**Registered**: `server/index.ts` line 195

**Tracks**:
- API response times
- Auth operation timing
- Database query performance
- WebSocket connection stability

---

## 🔌 7. Complete Routing Map

### Main Router: `server/routes/index.ts`

```typescript
Line 28: router.use('/auth', authRouter);
Line 29: router.use('/system', systemRouter);
Line 30: router.use('/projects', projectRouter);
Line 31: router.use('/data', dataRouter);
Line 32: router.use('/ai', aiRouter);
Line 33: router.use('/export', exportRouter);
Line 34: router.use('/payment', paymentRouter);
Line 35: router.use('/interactive', interactiveRouter);
Line 36: router.use('/analysis', analysisRouter);
Line 37: router.use('/user', ensureAuthenticated, userRoleRouter);
Line 38: router.use('/usage', usageRouter);
Line 39: router.use('/ai/payment', aiPaymentRouter);
Line 40: router.use('/conversation', conversationRouter);
Line 41: router.use('/workflow', workflowRouter);
Line 42: router.use('/agents', agentsRouter);
Line 43: router.use('/template', templateRouter);
Line 44: router.use('/enhanced-analysis', enhancedAnalysisRouter);
Line 45: router.use('/billing', billingRouter);
Line 46: router.use('/pricing', pricingRouter);
Line 47: router.use('/admin', adminSecuredRouter);
Line 48: router.use('/admin-legacy', adminRouter);
```

### Missing Routes (Need to Add):
```
❌ router.use('/analytics', analyticsRouter); // NEW - Need to add!
```

---

## 🚨 8. Critical Integration Issues

### Issue 1: Analytics Route Not Wired
**Location**: `server/routes/index.ts`
**Problem**: Analytics router created but not added to main router
**Fix**: Add `import analyticsRouter from './analytics';` and `router.use('/analytics', analyticsRouter);`

### Issue 2: Billing System Fragmented
**Locations**: Multiple conflicting files
**Problem**: 3-5 different billing implementations
**Fix**: Consolidate into `server/services/billing/unified-billing-service.ts`

### Issue 3: Stripe Webhook Insecure
**Location**: `server/routes/stripe-webhooks.ts` or `billing.ts`
**Problem**: No signature verification (SECURITY VULNERABILITY)
**Fix**: Add `stripe.webhooks.constructEvent()` verification

### Issue 4: Agent Coordination Uses Polling
**Location**: `server/services/project-manager-agent.ts` lines 954-971
**Problem**: 5-second polling instead of real-time WebSocket
**Fix**: Use WebSocket events for instant coordination

### Issue 5: Tool Initialization Not Guaranteed
**Location**: `server/index.ts` lines 139-147
**Problem**: Errors caught but server continues without tools in dev mode
**Fix**: Ensure critical tools are loaded or fail fast

### Issue 6: Subscription Tier Not Enforced
**Location**: `shared/schema.ts` - subscriptionTier field
**Problem**: Stored as unrestricted string instead of enum
**Fix**: Change to enum type and add database constraint

### Issue 7: Usage Tracking Not Connected to Billing
**Location**: Tool execution and billing service
**Problem**: Analytics tracks usage but billing doesn't consume it
**Fix**: Connect tool analytics to billing service

---

## ✅ 9. What IS Working

### ✅ Authentication
- JWT token generation and validation
- User registration and login
- Password hashing with bcrypt
- Token storage and retrieval
- Authentication middleware
- OAuth setup (Google ready)

### ✅ Agent Architecture
- Agents initialized on server startup
- Agent registry operational
- Agent permissions defined
- Agent-to-tool mapping working

### ✅ Tool Execution
- Real handlers for 3 core tools (stats, ML, viz)
- Tool registry functional
- Permission checking works
- Analytics tracking integrated
- API data fetcher operational

### ✅ Project Management
- Project creation working
- File upload functional
- PII detection operational
- Data processing pipeline working
- Schema detection accurate

### ✅ Monitoring
- Performance webhooks tracking
- Tool analytics collecting metrics
- System health endpoints available
- Production validator checking services

---

## 📋 10. Pre-Cleanup Checklist

Before cleaning up any files, we must:

- [ ] **Wire analytics router** into main routes
- [ ] **Consolidate billing services** into single implementation
- [ ] **Add Stripe webhook verification**
- [ ] **Connect usage tracking to billing**
- [ ] **Replace agent polling with WebSocket**
- [ ] **Add subscription tier enum enforcement**
- [ ] **Test all critical paths**
- [ ] **Verify no broken imports**
- [ ] **Document all integration points**
- [ ] **Create rollback plan**

---

## 🎯 11. Next Steps

1. **Fix Critical Integration Issues** (This Week)
   - Wire analytics router
   - Add Stripe webhook verification
   - Connect usage tracking to billing

2. **Consolidate Billing** (Next Week)
   - Merge all billing logic
   - Test payment flows
   - Verify subscription management

3. **Test All Flows** (Following Week)
   - Run E2E tests for all 4 journey types
   - Verify agent coordination
   - Test tool execution paths
   - Validate billing calculations

4. **Then Clean Up** (After Verification)
   - Remove duplicate files
   - Consolidate services
   - Clean up tests

---

**Status**: READY FOR INTEGRATION FIXES BEFORE CLEANUP
**Next Action**: Fix critical integration issues listed above
