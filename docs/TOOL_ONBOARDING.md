# Tool Onboarding Guide - ChimariData MCP Platform

## Quick Start: Add a New Tool in 3 Steps

### Step 1: Import the Tool Registry
```typescript
import { MCPToolRegistry } from './services/mcp-tool-registry';
```

### Step 2: Define Your Tool
```typescript
MCPToolRegistry.registerTool({
  name: 'my_awesome_tool',
  description: 'Does something amazing with data',
  service: MyAwesomeToolService,  // Your service class or function
  permissions: ['read_data', 'process_data'],
  category: 'analysis',
  agentAccess: ['data_scientist', 'business_agent']
});
```

### Step 3: Done!
Your tool is now available to agents through MCP.

---

## Complete Tool Definition

```typescript
MCPToolRegistry.registerTool({
  // REQUIRED FIELDS
  name: 'sentiment_analyzer',              // Unique tool name
  description: 'Analyzes text sentiment',  // What it does
  service: SentimentAnalyzer,              // Service class
  permissions: ['analyze_text'],           // Required permissions

  // OPTIONAL FIELDS
  category: 'analysis',                    // data | analysis | ml | visualization | business | utility
  agentAccess: ['data_scientist'],         // Which agents can use it

  // INPUT/OUTPUT SCHEMAS (for validation)
  inputSchema: {
    text: 'string',
    language: 'string (optional)'
  },

  outputSchema: {
    sentiment: 'positive | negative | neutral',
    score: 'number (0-1)',
    confidence: 'number (0-1)'
  },

  // EXAMPLES (for documentation)
  examples: [{
    name: 'Analyze positive text',
    description: 'Example of analyzing positive sentiment',
    input: { text: 'I love this product!' },
    expectedOutput: { sentiment: 'positive', score: 0.95, confidence: 0.89 }
  }]
});
```

---

## Tool Categories

| Category | Purpose | Example Tools |
|----------|---------|---------------|
| **data** | Data processing & ETL | file_processor, schema_generator, data_transformer |
| **analysis** | Statistical analysis | statistical_analyzer, hypothesis_tester |
| **ml** | Machine learning | ml_pipeline, model_trainer, predictor |
| **visualization** | Charts & dashboards | visualization_engine, chart_generator |
| **business** | Business intelligence | business_templates, report_generator |
| **utility** | Support functions | project_coordinator, decision_auditor |

### 2025 Registry Hygiene Initiatives

- **Decommission mock handlers**: Audit `tool-initialization.ts` and replace any `mock: true` responses before the December release. Track progress in the Tool Registry Kanban board.
- **Connector verification**: Re-run validation suites for long-tail ingestion entries (S3, SharePoint, Dynamics CRM) and document pass/fail status in `/docs/current/tool-registry-status.md`.
- **Permission matrix refresh**: Compare `agentAccess` mappings with the latest role definitions in `shared/agent-roles.ts` to ensure no agent gains unvetted capabilities.
- **Health check coverage**: Implement the runtime validation helper (`validateToolCallable`) and add Playwright smoke tests that confirm high-traffic tools respond with 200-level statuses.
- **Registry diff alerts**: Set up a lightweight CI check that flags newly registered tools lacking `inputSchema`/`outputSchema` metadata so documentation stays accurate.

---

## Agent Access Control

Specify which agents can use your tool:

```typescript
// Only data scientists
agentAccess: ['data_scientist']

// Multiple specific agents
agentAccess: ['data_scientist', 'business_agent', 'data_engineer']

// All agents (default)
agentAccess: ['all']  // or omit this field
```

---

## Permission System

Common permissions:

```typescript
// Data Access
'read_data', 'write_data', 'delete_data'

// Processing
'process_data', 'transform_data', 'clean_data'

// Analysis
'statistical_analysis', 'hypothesis_testing', 'analyze_data'

// ML
'train_models', 'predict', 'evaluate_models'

// Visualization
'create_charts', 'generate_dashboards'

// Business
'business_analysis', 'create_reports', 'generate_insights'

// Custom
'your_custom_permission'
```

---

## Real-World Examples

### Example 1: Customer Segmentation Tool

```typescript
import { MCPToolRegistry } from './services/mcp-tool-registry';
import { CustomerSegmenter } from './services/customer-segmenter';

MCPToolRegistry.registerTool({
  name: 'customer_segmenter',
  description: 'Segments customers into groups based on behavior and demographics',
  service: CustomerSegmenter,
  permissions: ['read_data', 'analyze_data', 'train_models'],
  category: 'ml',
  agentAccess: ['data_scientist', 'business_agent'],

  inputSchema: {
    customerData: 'array of customer objects',
    segmentationMethod: 'kmeans | hierarchical | dbscan',
    numberOfSegments: 'number (optional, default: 5)'
  },

  outputSchema: {
    segments: 'array of segment objects',
    customerAssignments: 'map of customerId to segmentId',
    segmentCharacteristics: 'array of segment descriptions'
  },

  examples: [{
    name: 'K-means customer segmentation',
    description: 'Segment 1000 customers into 5 groups',
    input: {
      customerData: [/* array of customers */],
      segmentationMethod: 'kmeans',
      numberOfSegments: 5
    },
    expectedOutput: {
      segments: [/* 5 segment definitions */],
      customerAssignments: { /* customer to segment map */ },
      segmentCharacteristics: [/* segment descriptions */]
    }
  }]
});
```

### Example 2: Real-time Anomaly Detector

```typescript
MCPToolRegistry.registerTool({
  name: 'anomaly_detector',
  description: 'Detects anomalies in time-series data using statistical methods',
  service: AnomalyDetector,
  permissions: ['read_data', 'statistical_analysis'],
  category: 'analysis',
  agentAccess: ['data_scientist'],

  inputSchema: {
    timeSeries: 'array of {timestamp, value}',
    method: 'zscore | iqr | isolation_forest',
    sensitivity: 'number (1-10, default: 5)'
  },

  outputSchema: {
    anomalies: 'array of detected anomaly points',
    anomalyScore: 'array of anomaly scores',
    threshold: 'number'
  }
});
```

### Example 3: Business Report Generator

```typescript
MCPToolRegistry.registerTool({
  name: 'executive_report_generator',
  description: 'Generates executive-level business reports with insights',
  service: ExecutiveReportGenerator,
  permissions: ['read_data', 'create_reports', 'generate_insights'],
  category: 'business',
  agentAccess: ['business_agent', 'project_manager'],

  inputSchema: {
    analysisResults: 'object with analysis data',
    reportTemplate: 'executive | board | quarterly',
    includeVisualizations: 'boolean'
  },

  outputSchema: {
    report: 'formatted report object',
    pdfUrl: 'string (URL to PDF)',
    keyInsights: 'array of insight strings'
  }
});
```

---

## Batch Registration

Register multiple tools at once:

```typescript
import { MCPToolRegistry } from './services/mcp-tool-registry';

MCPToolRegistry.registerTools([
  {
    name: 'tool_one',
    description: 'First tool',
    service: ToolOneService,
    permissions: ['read_data'],
    category: 'data'
  },
  {
    name: 'tool_two',
    description: 'Second tool',
    service: ToolTwoService,
    permissions: ['analyze_data'],
    category: 'analysis'
  },
  {
    name: 'tool_three',
    description: 'Third tool',
    service: ToolThreeService,
    permissions: ['create_charts'],
    category: 'visualization'
  }
]);
```

---

## Tool Management

### Get Tool Information

```typescript
// Get specific tool
const tool = MCPToolRegistry.getTool('sentiment_analyzer');

// Get all tools
const allTools = MCPToolRegistry.getAllTools();

// Get tools by category
const mlTools = MCPToolRegistry.getToolsByCategory('ml');

// Get tools for specific agent
const dataScientistTools = MCPToolRegistry.getToolsForAgent('data_scientist');
```

### Check Agent Access

```typescript
const canUse = MCPToolRegistry.canAgentUseTool('data_scientist', 'ml_pipeline');
// Returns: true or false
```

### Get Tool Documentation

```typescript
const docs = MCPToolRegistry.getToolDocs('sentiment_analyzer');
// Returns formatted documentation string
```

### Generate Tool Catalog

```typescript
const catalog = MCPToolRegistry.generateCatalog();
// Returns complete catalog of all tools organized by category
```

### Remove Tool

```typescript
MCPToolRegistry.unregisterTool('old_tool_name');
```

---

## Tool Execution

Execute a tool with automatic permission validation:

```typescript
import { executeTool } from './services/mcp-tool-registry';

const result = await executeTool(
  'sentiment_analyzer',     // Tool name
  'data_scientist',         // Agent ID
  {                         // Input data
    text: 'This is great!',
    language: 'en'
  }
);
```

---

## Agent Tool Menu

Get formatted list of available tools for an agent:

```typescript
import { getAgentToolMenu } from './services/mcp-tool-registry';

const menu = getAgentToolMenu('data_scientist');
console.log(menu);

// Output:
// # Available Tools for data_scientist
//
// You have access to 12 tools:
//
// ## DATA
// - **file_processor**: Process uploaded files...
// - **schema_generator**: Analyze data and generate schema...
//
// ## ANALYSIS
// - **statistical_analyzer**: Perform comprehensive...
// ...
```

---

## Best Practices

### 1. Descriptive Names
Use clear, descriptive names:
- ✅ `customer_churn_predictor`
- ❌ `predictor1`

### 2. Detailed Descriptions
Explain what the tool does and when to use it:
- ✅ `Predicts customer churn probability using historical behavior patterns`
- ❌ `Predicts churn`

### 3. Minimal Permissions
Only request permissions you actually need:
- ✅ `['read_data', 'analyze_data']`
- ❌ `['read_data', 'write_data', 'delete_data', 'admin']`

### 4. Agent Access Control
Be specific about which agents should have access:
- ✅ `agentAccess: ['data_scientist']` for technical ML tools
- ✅ `agentAccess: ['business_agent', 'project_manager']` for reports
- ✅ `agentAccess: ['all']` for universal utilities

### 5. Provide Examples
Include at least one example showing typical usage

### 6. Define Schemas
Add input/output schemas for validation and documentation

---

## Integration with Agents

Tools are automatically available to agents through MCP. Agents can:

1. **Discover tools**: Query available tools based on their permissions
2. **Validate access**: Automatically check if they have permission
3. **Execute tools**: Call tools with input data
4. **Chain tools**: Use output from one tool as input to another

Example agent using a tool:

```typescript
class DataScientistAgent {
  async performAnalysis(data: any[]) {
    // Agent can discover available tools
    const tools = MCPToolRegistry.getToolsForAgent('data_scientist');

    // Execute statistical analysis tool
    const statsResult = await executeTool(
      'statistical_analyzer',
      'data_scientist',
      { data, analysisType: 'comprehensive' }
    );

    // Chain with visualization tool
    const vizResult = await executeTool(
      'visualization_engine',
      'data_scientist',
      { data: statsResult.summary, chartType: 'bar' }
    );

    return { analysis: statsResult, visualization: vizResult };
  }
}
```

---

## Troubleshooting

### Tool not appearing for agent
- Check `agentAccess` field - agent may not be in the list
- Verify tool was registered successfully (check console logs)

### Permission denied errors
- Ensure agent's MCP role has the required permissions
- Check tool's `permissions` array matches agent capabilities

### Tool execution fails
- Validate input schema matches expected format
- Check service class is properly imported and instantiated
- Review service implementation for errors

---

## Pre-registered Core Tools

These tools are automatically registered when MCP starts:

| Tool | Category | Agents |
|------|----------|--------|
| file_processor | data | data_engineer, data_scientist, project_manager |
| schema_generator | data | data_engineer, data_scientist |
| data_transformer | data | data_engineer, data_scientist |
| statistical_analyzer | analysis | data_scientist |
| ml_pipeline | ml | data_scientist |
| visualization_engine | visualization | data_scientist, business_agent |
| business_templates | business | business_agent, project_manager |
| project_coordinator | utility | project_manager |
| decision_auditor | utility | all |

---

## Advanced: Custom Tool Implementation

Create a complete custom tool service:

```typescript
// services/my-custom-tool.ts
export class MyCustomTool {
  async execute(input: any): Promise<any> {
    // Your tool logic here
    const result = await this.processData(input);
    return result;
  }

  private async processData(input: any): Promise<any> {
    // Implementation
    return { success: true, data: input };
  }
}

// Register in server startup or initialization file
import { MCPToolRegistry } from './services/mcp-tool-registry';
import { MyCustomTool } from './services/my-custom-tool';

MCPToolRegistry.registerTool({
  name: 'my_custom_tool',
  description: 'My custom data processing tool',
  service: MyCustomTool,
  permissions: ['process_data'],
  category: 'data',
  agentAccess: ['data_engineer']
});
```

---

## Summary

✅ **Easy Registration**: Simple API for adding tools
✅ **Automatic Discovery**: Agents find tools automatically
✅ **Permission Control**: Built-in access validation
✅ **Documentation**: Auto-generated docs and examples
✅ **Type Safety**: Schema validation for inputs/outputs
✅ **Agent Integration**: Seamless integration with agent system

**Start adding tools today - it's as simple as one function call!**
