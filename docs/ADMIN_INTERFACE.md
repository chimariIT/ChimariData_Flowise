# Admin Interface - Complete Admin Panel

**Last Updated**: February 24, 2026

## Overview

Complete UI-based admin interface for managing all aspects of the ChimariData platform. The admin panel provides 16 UI files across 15 tabs, backed by 170+ API endpoints across 7 route files. Features include agent/tool management, billing configuration, campaign management, consultation workflow, error tracking, database management, knowledge graph management, embedding provider configuration, project debugging, and system monitoring — all with real-time WebSocket updates.

> **Audit Note (Feb 2026):** This document previously covered only agent and tool management (2 pages). Updated to document all 16 admin UI files, 15 tab values, and the full admin routing system.

## Admin Pages Overview

**Location**: `client/src/pages/admin/`
**Entry point**: `index.tsx` (admin layout with tab routing)
**Routing**: `/admin/:tab` — URL path segment maps to tab value

### All Admin Pages (16 files, 15 tabs)

| # | Tab Value | Component File | Description |
|---|-----------|---------------|-------------|
| 1 | `dashboard` | `admin-dashboard.tsx` | Platform health, revenue metrics, system status |
| 2 | `user-management` | `user-management.tsx` | User account management and administration |
| 3 | `subscription-management` | `subscription-management.tsx` | User subscription CRUD, tier management |
| 4 | `service-pricing` | `pricing-services.tsx` | Service pricing configuration |
| 5 | `analysis-pricing` | `analysis-pricing.tsx` | Per-analysis-type pricing, multipliers, complexity |
| 6 | `campaigns` | `campaign-management.tsx` | Campaign/coupon CRUD, usage tracking |
| 7 | `consultations` | `consultations.tsx` | Consultation request queue and assignment |
| 8 | `consultation-pricing` | `consultation-pricing.tsx` | Consultation pricing tiers |
| 9 | `agent-management` | `agent-management.tsx` | Agent monitoring, creation, templates |
| 10 | `tools-management` | `tools-management.tsx` | MCP tool registry, permissions, agent access, metrics |
| 11 | `error-tracking` | `error-tracking.tsx` | Circuit breakers, error statistics, failure monitoring |
| 12 | `database` | `database-optimization.tsx` | Database health, optimization, and maintenance |
| 13 | `state-inspector` | `project-state-inspector.tsx` | Project state debugging tool |
| 14 | `knowledge` | `knowledge-management.tsx` | Knowledge graph nodes, edges, patterns, enrichment review |
| 15 | `embeddings` | `embedding-management.tsx` | Embedding provider ordering, model selection, connectivity testing, stale monitoring |

**Note**: `index.tsx` is the layout shell (16th file), not a tab itself.

### Backend Route Files (7 files, 170+ endpoints)

| Route File | Mount Prefix | Endpoints | Purpose |
|-----------|-------------|-----------|---------|
| `admin.ts` | `/api/admin` | ~80 | Core: agents, tools, users, projects, monitoring |
| `admin-billing.ts` | `/api/admin/billing` | ~25 | Tiers, campaigns, rates, analysis pricing |
| `admin-secured.ts` | `/api/admin/secured` | ~20 | Extra-secured endpoints with RBAC |
| `admin-consultation.ts` | `/api/admin/consultations` | ~9 | Consultation lifecycle |
| `admin-consultation-pricing.ts` | `/api/admin/consultation-pricing` | ~7 | Consultation pricing CRUD |
| `admin-service-pricing.ts` | `/api/admin/service-pricing` | ~6 | Service pricing CRUD |
| `admin-embedding.ts` | `/api/admin/embedding` | ~6 | Provider config, testing, stats, regeneration |

---

## Architecture

### Backend Components

1. **Admin API Routes** (`server/routes/admin.ts`)
   - Agent management: CRUD operations for agents
   - Tool management: CRUD operations for tools
   - Agent template management: Pre-configured agent templates
   - System status monitoring
   - Real-time event broadcasting via WebSocket
   - Authentication and admin authorization
   - Rate limiting for admin operations

2. **Agent Registry** (`server/services/agent-registry.ts`)
   - Central registry for all agents
   - Dynamic agent registration/unregistration
   - Health monitoring and metrics tracking
   - Task queue management

3. **Agent Templates** (`server/services/agent-templates.ts`)
   - 8 pre-configured agent templates for common use cases
   - Template discovery and recommendation system
   - One-click agent creation from templates
   - Template categories: ML, Analysis, Business, Support, Data Processing

4. **MCP Tool Registry** (`server/services/mcp-tool-registry.ts`)
   - Tool registration and discovery
   - Permission-based access control
   - Agent-tool access mapping
   - Tool catalog generation

5. **Realtime Server** (`server/realtime.ts`)
   - WebSocket-based event broadcasting
   - Subscription management
   - Authentication and security

### Frontend Components

1. **Agent Management** (`client/src/pages/admin/agent-management.tsx`)
   - Live agent monitoring dashboard
   - Agent creation/deletion UI
   - Health status visualization
   - Performance metrics display
   - Real-time updates via WebSocket

2. **Tools Management** (`client/src/pages/admin/tools-management.tsx`)
   - Tool catalog browsing
   - Tool creation/deletion UI
   - Usage metrics and analytics
   - Agent access configuration
   - Real-time updates via WebSocket

## API Endpoints

### Agent Management

#### GET `/api/admin/agents`
Get all registered agents with their status, capabilities, and metrics.

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "id": "agent_data_scientist_123",
      "name": "Data Scientist Agent",
      "type": "analysis",
      "description": "Performs advanced statistical analysis...",
      "status": "active",
      "version": "3.0.2",
      "capabilities": [
        {
          "name": "statistical_analysis",
          "description": "Perform statistical tests",
          "complexity": "high",
          "tags": ["analysis", "statistics"]
        }
      ],
      "priority": 4,
      "maxConcurrentTasks": 5,
      "currentTasks": 2,
      "metrics": {
        "totalTasks": 2341,
        "successfulTasks": 2250,
        "failedTasks": 91,
        "successRate": 96.2,
        "lastActivity": "2025-10-05T22:05:00Z"
      },
      "health": {
        "status": "healthy",
        "lastCheck": "2025-10-05T22:05:30Z",
        "responseTime": 890,
        "errorRate": 3.8,
        "resourceUsage": {
          "cpu": 45,
          "memory": 78,
          "storage": 23
        }
      }
    }
  ],
  "systemStatus": {
    "totalAgents": 6,
    "activeAgents": 5,
    "totalTasks": 145,
    "queuedTasks": 12
  }
}
```

#### POST `/api/admin/agents`
Register a new agent dynamically.

**Request:**
```json
{
  "id": "agent_custom_123",
  "name": "Custom Analysis Agent",
  "type": "analysis",
  "description": "Performs custom data analysis",
  "capabilities": [
    {
      "name": "custom_analysis",
      "description": "Custom analytical functions",
      "complexity": "medium",
      "tags": ["custom", "analysis"]
    }
  ],
  "maxConcurrentTasks": 5,
  "priority": 3,
  "version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Agent Custom Analysis Agent registered successfully",
  "agentId": "agent_custom_123"
}
```

**Real-time Event:**
Broadcasts `agent_created` event to all WebSocket subscribers.

#### DELETE `/api/admin/agents/:agentId`
Unregister an agent.

**Response:**
```json
{
  "success": true,
  "message": "Agent agent_custom_123 unregistered successfully"
}
```

**Real-time Event:**
Broadcasts `agent_deleted` event to all WebSocket subscribers.

#### POST `/api/admin/agents/:agentId/restart`
Restart an agent (puts in maintenance mode then reactivates).

**Response:**
```json
{
  "success": true,
  "message": "Agent agent_data_scientist_123 is restarting..."
}
```

### Agent Template Management

#### GET `/api/admin/templates`
Get all available agent templates with optional filtering.

**Query Parameters:**
- `category` (optional) - Filter by category: 'ml', 'analysis', 'business', 'support', 'data_processing', 'orchestration', 'custom'
- `search` (optional) - Search templates by name, description, or use cases

**Response:**
```json
{
  "success": true,
  "templates": [
    {
      "id": "customer_churn_predictor",
      "name": "Customer Churn Prediction Agent",
      "description": "Specialized agent for predicting customer churn using ML models and historical data",
      "category": "ml",
      "definition": {
        "type": "ml_specialist",
        "capabilities": [
          {
            "name": "churn_prediction",
            "description": "Predict customer churn probability using historical behavior patterns",
            "inputTypes": ["customer_data", "transaction_history", "engagement_metrics"],
            "outputTypes": ["churn_probability", "risk_factors", "retention_recommendations"],
            "complexity": "high",
            "estimatedDuration": 900,
            "requiredResources": ["ml_pipeline", "statistical_analyzer"],
            "tags": ["churn", "retention", "ml", "prediction"]
          }
        ],
        "priority": 4,
        "maxConcurrentTasks": 3
      },
      "useCases": [
        "Predict customer churn for subscription services",
        "Identify at-risk customers for targeted retention",
        "Analyze factors contributing to customer attrition",
        "Generate automated retention campaigns"
      ],
      "requiredTools": ["ml_pipeline", "statistical_analyzer", "data_transformer"],
      "estimatedSetupTime": 15
    }
  ],
  "count": 8
}
```

#### GET `/api/admin/templates/:templateId`
Get a specific agent template by ID.

**Response:**
```json
{
  "success": true,
  "template": {
    "id": "sales_forecaster",
    "name": "Sales Forecasting Agent",
    "description": "Predict future sales trends and generate revenue forecasts using time series analysis",
    "category": "business",
    "useCases": [...],
    "requiredTools": [...],
    "estimatedSetupTime": 10
  }
}
```

#### POST `/api/admin/templates/:templateId/create`
Create a new agent from a template with optional customizations.

**Request Body (optional customizations):**
```json
{
  "name": "My Custom Churn Predictor",
  "priority": 5,
  "maxConcurrentTasks": 10,
  "config": {
    "customSetting": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Agent created from template: customer_churn_predictor",
  "agent": {
    "id": "agent_customer_churn_predictor_1696523400000",
    "name": "My Custom Churn Predictor",
    "type": "ml_specialist",
    "status": "inactive",
    "version": "1.0.0",
    "capabilities": [...],
    "priority": 5,
    "maxConcurrentTasks": 10
  }
}
```

**Real-time Event:**
Broadcasts `agent_created_from_template` event to all WebSocket subscribers.

#### GET `/api/admin/templates/recommendations`
Get template recommendations based on a use case.

**Query Parameters:**
- `useCase` (required) - The use case to find templates for (e.g., "fraud detection", "sales forecasting")

**Response:**
```json
{
  "success": true,
  "useCase": "fraud detection",
  "recommendations": [
    {
      "id": "financial_fraud_detector",
      "name": "Financial Fraud Detection Agent",
      "description": "Real-time fraud detection and anomaly identification for financial transactions",
      "category": "analysis",
      "estimatedSetupTime": 20
    }
  ],
  "count": 1
}
```

### Tool Management

#### GET `/api/admin/tools`
Get all registered tools with their metadata and metrics.

**Response:**
```json
{
  "success": true,
  "tools": [
    {
      "id": "statistical_analyzer",
      "name": "statistical_analyzer",
      "description": "Perform comprehensive statistical analysis",
      "category": "analysis",
      "version": "1.0.0",
      "author": "System",
      "status": "active",
      "tags": [],
      "permissions": ["statistical_analysis", "hypothesis_testing"],
      "agentAccess": ["data_scientist"],
      "inputSchema": {...},
      "outputSchema": {...},
      "metrics": {
        "totalExecutions": 0,
        "successfulExecutions": 0,
        "failedExecutions": 0,
        "averageExecutionTime": 0,
        "uptime": 100,
        "errorRate": 0,
        "userSatisfactionScore": 4.8
      }
    }
  ],
  "totalTools": 9,
  "mcpResources": 25
}
```

#### POST `/api/admin/tools`
Register a new tool.

**Request:**
```json
{
  "name": "sentiment_analyzer",
  "description": "Analyzes text sentiment using ML models",
  "service": "SentimentAnalyzer",
  "permissions": ["analyze_text", "read_data"],
  "category": "analysis",
  "agentAccess": ["data_scientist", "business_agent"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Tool sentiment_analyzer registered successfully",
  "tool": {
    "name": "sentiment_analyzer",
    "description": "Analyzes text sentiment using ML models",
    "category": "analysis",
    "permissions": ["analyze_text", "read_data"]
  }
}
```

**Real-time Event:**
Broadcasts `tool_created` event to all WebSocket subscribers.

#### DELETE `/api/admin/tools/:toolName`
Unregister a tool.

**Response:**
```json
{
  "success": true,
  "message": "Tool sentiment_analyzer unregistered successfully"
}
```

**Real-time Event:**
Broadcasts `tool_deleted` event to all WebSocket subscribers.

#### GET `/api/admin/tools/for-agent/:agentId`
Get tools accessible to a specific agent.

**Response:**
```json
{
  "success": true,
  "agentId": "data_scientist",
  "tools": [...],
  "count": 6
}
```

#### GET `/api/admin/system/status`
Get overall system status.

**Response:**
```json
{
  "success": true,
  "system": {
    "totalAgents": 6,
    "activeAgents": 5,
    "totalTools": 9,
    "queue": {
      "pending": 12,
      "processing": 5,
      "failed": 2
    },
    "uptime": 86400,
    "memory": {
      "rss": 234567890,
      "heapTotal": 123456789,
      "heapUsed": 98765432
    },
    "platform": "win32"
  }
}
```

## Real-time Updates

### WebSocket Events

The admin interface subscribes to the `admin` channel for real-time updates:

```javascript
const realtimeClient = new RealtimeClient({ debug: true });

realtimeClient.subscribe('admin', (event) => {
  const { eventType, agentId, toolName } = event.data;

  switch (eventType) {
    case 'agent_created':
      // Refresh agents list
      break;
    case 'agent_deleted':
      // Refresh agents list
      break;
    case 'tool_created':
      // Refresh tools list
      break;
    case 'tool_deleted':
      // Refresh tools list
      break;
  }
});
```

### Event Types

- `agent_created` - New agent registered
- `agent_created_from_template` - Agent created from template
- `agent_deleted` - Agent unregistered
- `agent_updated` - Agent configuration changed
- `tool_created` - New tool registered
- `tool_deleted` - Tool unregistered
- `tool_updated` - Tool configuration changed

## Agent Template Library

### Available Templates

The platform includes 8 pre-configured agent templates for common business use cases:

#### 1. Customer Churn Predictor (ML)
- **Category**: Machine Learning
- **Setup Time**: ~15 minutes
- **Use Cases**:
  - Predict customer churn for subscription services
  - Identify at-risk customers for targeted retention
  - Analyze factors contributing to customer attrition
  - Generate automated retention campaigns
- **Required Tools**: ml_pipeline, statistical_analyzer, data_transformer
- **Capabilities**: Churn prediction, customer segmentation

#### 2. Financial Fraud Detector (Analysis)
- **Category**: Security & Analysis
- **Setup Time**: ~20 minutes
- **Use Cases**:
  - Real-time credit card fraud detection
  - Identify suspicious account activity
  - Monitor unusual transaction patterns
  - Automated risk assessment for transactions
- **Required Tools**: statistical_analyzer, ml_pipeline, decision_auditor
- **Capabilities**: Fraud detection, risk scoring

#### 3. Sales Forecaster (Business)
- **Category**: Business Intelligence
- **Setup Time**: ~10 minutes
- **Use Cases**:
  - Monthly and quarterly sales forecasting
  - Demand planning and inventory optimization
  - Revenue projection for business planning
  - Seasonal trend identification
- **Required Tools**: statistical_analyzer, visualization_engine, business_templates
- **Capabilities**: Sales forecasting, trend analysis

#### 4. Customer Support Bot (Support)
- **Category**: Customer Support
- **Setup Time**: ~5 minutes
- **Use Cases**:
  - Automated customer inquiry handling
  - Intelligent ticket routing to specialists
  - Generate draft responses for support agents
  - 24/7 initial customer support coverage
- **Required Tools**: decision_auditor
- **Capabilities**: Ticket classification, response generation

#### 5. Inventory Optimizer (Business)
- **Category**: Business Operations
- **Setup Time**: ~15 minutes
- **Use Cases**:
  - Optimize warehouse inventory levels
  - Reduce carrying costs and stockouts
  - Automated reorder point calculation
  - Supply chain efficiency improvement
- **Required Tools**: statistical_analyzer, ml_pipeline, business_templates
- **Capabilities**: Demand forecasting, stock optimization

#### 6. Sentiment Analyzer (Analysis)
- **Category**: Text Analysis
- **Setup Time**: ~10 minutes
- **Use Cases**:
  - Monitor brand sentiment on social media
  - Analyze product review sentiment
  - Track customer satisfaction trends
  - Early warning for PR issues
- **Required Tools**: statistical_analyzer, visualization_engine
- **Capabilities**: Sentiment analysis, trend detection

#### 7. Data Quality Monitor (Data Processing)
- **Category**: Data Quality
- **Setup Time**: ~12 minutes
- **Use Cases**:
  - Automated data pipeline quality checks
  - Real-time data validation
  - Anomaly detection in data feeds
  - Data health monitoring and alerting
- **Required Tools**: schema_generator, data_transformer, statistical_analyzer
- **Capabilities**: Quality validation, anomaly detection

#### 8. A/B Test Analyzer (Analysis)
- **Category**: Experimentation
- **Setup Time**: ~8 minutes
- **Use Cases**:
  - Analyze website A/B test results
  - Marketing campaign effectiveness testing
  - Product feature experimentation
  - Conversion optimization analysis
- **Required Tools**: statistical_analyzer, visualization_engine, business_templates
- **Capabilities**: A/B test analysis, sample size calculation

## Current Agent Ecosystem

### Registered Agents (7 Total)

| # | Agent | Type | Status | Notes |
|---|-------|------|--------|-------|
| 1 | **Project Manager Agent** | `orchestration` | Active | Coordinates all workflows |
| 2 | **Data Scientist Agent** | `analysis` | Active | Stats, ML, feature engineering |
| 3 | **Technical AI Agent** | `ai_specialist` | Active | AI model integration |
| 4 | **Business Intelligence Agent** | `business` | Active | Industry expertise, KPIs |
| 5 | **Data Engineer Agent** | `data_processing` | Active | ETL, data quality, pipelines |
| 6 | **Template Research Agent** | `research` | Initialized-Not-Wired | Tools registered but not routed |
| 7 | **Customer Support Agent** | `support` | Initialized-Not-Wired | Initialized but not called in workflows |

### Core Tools

1. **file_processor** - File upload and validation
2. **schema_generator** - Schema detection
3. **data_transformer** - Data transformation
4. **statistical_analyzer** - Statistical analysis
5. **ml_pipeline** - Machine learning workflows
6. **visualization_engine** - Chart generation
7. **business_templates** - Business reporting
8. **project_coordinator** - Project management
9. **decision_auditor** - Decision logging

## Usage Guide

### Creating an Agent from Template (Recommended)

**Via API:**
```bash
# 1. Browse available templates
curl http://localhost:5000/api/admin/templates

# 2. Get recommendations for your use case
curl http://localhost:5000/api/admin/templates/recommendations?useCase=fraud%20detection

# 3. Create agent from template
curl -X POST http://localhost:5000/api/admin/templates/customer_churn_predictor/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Churn Predictor",
    "priority": 5,
    "maxConcurrentTasks": 10
  }'
```

**Via UI (Future):**
1. Navigate to `/admin/agent-management`
2. Click "Create from Template" button
3. Browse template catalog or search by use case
4. Select template (e.g., "Customer Churn Predictor")
5. Customize agent settings:
   - Override agent name (optional)
   - Adjust priority (optional)
   - Set concurrent task limit (optional)
6. Click "Create Agent"
7. Agent is registered and appears immediately

### Creating a Custom Agent via UI

1. Navigate to `/admin/agent-management`
2. Click "Add Agent" button
3. Fill in agent details:
   - Name (e.g., "Custom Analyzer")
   - Type (orchestration, analysis, business, etc.)
   - Description
   - Capabilities (comma-separated)
   - Max Concurrent Tasks
   - Priority (1-5)
4. Click "Create Agent"
5. Agent appears in the list immediately (real-time update)

### Creating a New Tool via UI

1. Navigate to `/admin/tools-management`
2. Click "Add Tool" button
3. Fill in tool details:
   - Name (e.g., "sentiment_analyzer")
   - Description
   - Service Name (class name)
   - Category (data, analysis, ml, etc.)
   - Permissions (comma-separated)
   - Agent Access (comma-separated, or leave empty for all)
4. Click "Create Tool"
5. Tool appears in the catalog immediately (real-time update)

### Monitoring Agent Health

The agent management dashboard shows:
- **Health Status**: Healthy/Unhealthy with visual indicators
- **Response Time**: Average response in milliseconds
- **Success Rate**: Percentage of successful task completions
- **Tasks Completed**: Total number of tasks
- **Resource Usage**: CPU and memory utilization
- **Uptime**: Percentage uptime

### Tool Management Features

- **Search & Filter**: Find tools by name, description, or tags
- **Category Filtering**: Filter by data, analysis, ml, etc.
- **Status Management**: Activate, deactivate, or set to maintenance
- **Metrics Dashboard**: View executions, success rate, uptime
- **Export Configuration**: Download tool config as JSON

## Security Considerations

1. **Authentication**: ✅ Implemented - Admin routes protected with `ensureAuthenticated` middleware
2. **Authorization**: ✅ Implemented - Role-based access with `requireAdmin` middleware
   - Checks user role === 'admin'
   - Checks email domain (e.g., @admin.com)
   - Checks isAdmin flag on user object
3. **Input Validation**: ✅ All inputs validated before registration
4. **WebSocket Security**: ✅ JWT-based WebSocket authentication
5. **Rate Limiting**: ✅ Implemented - Admin endpoints limited to 100 requests per 15 minutes
   - Logs violations with user email and IP
   - Returns 429 status with retry-after information
6. **Template Security**: Template-based agents follow same security model as custom agents

## Future Enhancements

1. ~~**Agent Templates**: Pre-configured agent templates for common use cases~~ ✅ **COMPLETED**
   - 8 templates implemented
   - Template API endpoints added
   - Search and recommendation system
2. **Template UI**: Frontend interface for browsing and creating agents from templates
3. **Bulk Operations**: Batch register/unregister agents/tools
4. **Configuration Import/Export**: Import/export agent/tool configs
5. **Advanced Metrics**: Detailed performance analytics and charts
6. **Agent Communication Logs**: View inter-agent messages
7. **Tool Execution Logs**: Track tool usage across agents
8. **Health Alerts**: Notifications for failing agents/tools
9. **Rollback Capability**: Revert to previous configurations
10. **Template Marketplace**: Community-contributed agent templates

## Testing

### Manual Testing Workflow

1. **Start Server**: `npm run dev`
2. **Open Admin Pages**:
   - Agent Management: `http://localhost:5000/admin/agent-management`
   - Tools Management: `http://localhost:5000/admin/tools-management`
3. **Test Agent Creation**:
   - Create new agent via UI
   - Verify it appears in the list
   - Check WebSocket real-time update
4. **Test Tool Creation**:
   - Create new tool via UI
   - Verify it appears in catalog
   - Check WebSocket real-time update
5. **Test Deletion**:
   - Delete an agent/tool
   - Verify removal from list
   - Check WebSocket real-time update

### API Testing

```bash
# Get all agents
curl http://localhost:5000/api/admin/agents

# Create new agent
curl -X POST http://localhost:5000/api/admin/agents \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test_agent",
    "name": "Test Agent",
    "type": "utility",
    "description": "Test agent",
    "capabilities": [],
    "version": "1.0.0"
  }'

# Delete agent
curl -X DELETE http://localhost:5000/api/admin/agents/test_agent

# Get all tools
curl http://localhost:5000/api/admin/tools

# Create new tool
curl -X POST http://localhost:5000/api/admin/tools \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test_tool",
    "description": "Test tool",
    "service": "TestService",
    "permissions": ["test"],
    "category": "utility"
  }'

# Delete tool
curl -X DELETE http://localhost:5000/api/admin/tools/test_tool

# Get all agent templates
curl http://localhost:5000/api/admin/templates

# Filter templates by category
curl http://localhost:5000/api/admin/templates?category=ml

# Search templates
curl http://localhost:5000/api/admin/templates?search=fraud

# Get specific template
curl http://localhost:5000/api/admin/templates/customer_churn_predictor

# Get template recommendations
curl http://localhost:5000/api/admin/templates/recommendations?useCase=churn

# Create agent from template
curl -X POST http://localhost:5000/api/admin/templates/sales_forecaster/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Sales Forecaster",
    "priority": 5
  }'
```

## Troubleshooting

### WebSocket Not Connecting

1. Check if server is running on correct port
2. Verify WebSocket URL in client (ws://localhost:5000/ws)
3. Check browser console for connection errors
4. Ensure RealtimeServer is initialized in server/index.ts

### Real-time Updates Not Working

1. Verify WebSocket connection is established
2. Check subscription to 'admin' channel
3. Review server logs for broadcast errors
4. Ensure events are being emitted from admin routes

### Agent/Tool Not Appearing

1. Check API response for errors
2. Verify data transformation in frontend
3. Review browser console for JavaScript errors
4. Check agent/tool registration in backend logs

## Documentation References

- [Agent Registry](../server/services/agent-registry.ts) - Core agent management system
- [Agent Templates](../server/services/agent-templates.ts) - Pre-configured agent templates
- [MCP Tool Registry](../server/services/mcp-tool-registry.ts) - Tool registration system
- [Tool Onboarding Guide](./TOOL_ONBOARDING.md) - Tool development guide
- [Agent Initialization](../server/services/agent-initialization.ts) - Agent lifecycle management
- [Admin Routes](../server/routes/admin.ts) - Admin API endpoints
- [Security Headers](../server/middleware/security-headers.ts) - Security middleware including rate limiting
- [Realtime Server](../server/realtime.ts) - WebSocket event broadcasting
- [System Status](./SYSTEM_STATUS.md) - Current system state and architecture
