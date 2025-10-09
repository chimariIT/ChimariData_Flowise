// server/services/mcp-tool-registry.ts
import { EnhancedMCPService } from '../enhanced-mcp-service';
import { MCPResource } from '../mcp-ai-service';

/**
 * Easy Tool Onboarding System for MCP
 *
 * This registry makes it simple to add new tools to the MCP server
 * that agents can use. Just define your tool and register it!
 */

export interface ToolDefinition {
  name: string;
  description: string;
  service: string | Function;
  permissions: string[];
  inputSchema?: any;
  outputSchema?: any;
  examples?: ToolExample[];
  category?: 'data' | 'analysis' | 'visualization' | 'ml' | 'business' | 'utility';
  agentAccess?: string[]; // Which agents can use this tool
}

export interface ToolExample {
  name: string;
  description: string;
  input: any;
  expectedOutput: any;
}

export class MCPToolRegistry {
  private static registeredTools: Map<string, ToolDefinition> = new Map();

  /**
   * EASY TOOL REGISTRATION
   *
   * Use this method to add a new tool to MCP. Example:
   *
   * MCPToolRegistry.registerTool({
   *   name: 'my_custom_analyzer',
   *   description: 'Analyzes customer sentiment from text',
   *   service: SentimentAnalyzer,
   *   permissions: ['analyze_data', 'read_text'],
   *   category: 'analysis',
   *   agentAccess: ['data_scientist', 'business_agent']
   * });
   */
  static registerTool(tool: ToolDefinition): void {
    // Validate tool definition
    if (!tool.name || !tool.service || !tool.permissions) {
      throw new Error('Tool must have name, service, and permissions');
    }

    // Store tool definition
    this.registeredTools.set(tool.name, tool);

    // Register with MCP Server
    const mcpResource: MCPResource = {
      type: 'tool',
      name: tool.name,
      config: {
        service: typeof tool.service === 'string' ? tool.service : tool.service.name,
        description: tool.description,
        category: tool.category || 'utility',
        agentAccess: tool.agentAccess || ['all'],
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
      },
      permissions: tool.permissions
    };

    EnhancedMCPService.addResource(mcpResource);

    console.log(`✅ Tool registered: ${tool.name} (${tool.category || 'utility'})`);
  }

  /**
   * BATCH REGISTER MULTIPLE TOOLS
   */
  static registerTools(tools: ToolDefinition[]): void {
    tools.forEach(tool => this.registerTool(tool));
    console.log(`✅ Registered ${tools.length} tools`);
  }

  /**
   * GET TOOL BY NAME
   */
  static getTool(name: string): ToolDefinition | undefined {
    return this.registeredTools.get(name);
  }

  /**
   * GET ALL TOOLS
   */
  static getAllTools(): ToolDefinition[] {
    return Array.from(this.registeredTools.values());
  }

  /**
   * GET TOOLS BY CATEGORY
   */
  static getToolsByCategory(category: string): ToolDefinition[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  /**
   * GET TOOLS ACCESSIBLE TO AGENT
   */
  static getToolsForAgent(agentId: string): ToolDefinition[] {
    return this.getAllTools().filter(tool =>
      !tool.agentAccess ||
      tool.agentAccess.includes('all') ||
      tool.agentAccess.includes(agentId)
    );
  }

  /**
   * REMOVE TOOL
   */
  static unregisterTool(name: string): boolean {
    const removed = this.registeredTools.delete(name);
    if (removed) {
      console.log(`🗑️ Tool unregistered: ${name}`);
    }
    return removed;
  }

  /**
   * CHECK IF AGENT CAN USE TOOL
   */
  static canAgentUseTool(agentId: string, toolName: string): boolean {
    const tool = this.getTool(toolName);
    if (!tool) return false;

    if (!tool.agentAccess || tool.agentAccess.includes('all')) {
      return true;
    }

    return tool.agentAccess.includes(agentId);
  }

  /**
   * GET TOOL DOCUMENTATION
   */
  static getToolDocs(toolName: string): string {
    const tool = this.getTool(toolName);
    if (!tool) return 'Tool not found';

    let docs = `
# ${tool.name}

**Description**: ${tool.description}

**Category**: ${tool.category || 'utility'}

**Permissions Required**: ${tool.permissions.join(', ')}

**Agent Access**: ${tool.agentAccess?.join(', ') || 'All agents'}
`;

    if (tool.inputSchema) {
      docs += `\n**Input Schema**:\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n`;
    }

    if (tool.outputSchema) {
      docs += `\n**Output Schema**:\n\`\`\`json\n${JSON.stringify(tool.outputSchema, null, 2)}\n\`\`\`\n`;
    }

    if (tool.examples && tool.examples.length > 0) {
      docs += `\n## Examples\n\n`;
      tool.examples.forEach((example, idx) => {
        docs += `### Example ${idx + 1}: ${example.name}\n`;
        docs += `${example.description}\n\n`;
        docs += `**Input**:\n\`\`\`json\n${JSON.stringify(example.input, null, 2)}\n\`\`\`\n\n`;
        docs += `**Expected Output**:\n\`\`\`json\n${JSON.stringify(example.expectedOutput, null, 2)}\n\`\`\`\n\n`;
      });
    }

    return docs;
  }

  /**
   * GENERATE TOOL CATALOG
   */
  static generateCatalog(): string {
    const tools = this.getAllTools();
    const categories = new Set(tools.map(t => t.category || 'utility'));

    let catalog = '# MCP Tool Catalog\n\n';
    catalog += `Total Tools: ${tools.length}\n\n`;

    for (const category of categories) {
      const categoryTools = tools.filter(t => (t.category || 'utility') === category);
      catalog += `## ${category.toUpperCase()} (${categoryTools.length} tools)\n\n`;

      categoryTools.forEach(tool => {
        catalog += `### ${tool.name}\n`;
        catalog += `${tool.description}\n`;
        catalog += `- **Permissions**: ${tool.permissions.join(', ')}\n`;
        catalog += `- **Agent Access**: ${tool.agentAccess?.join(', ') || 'All'}\n\n`;
      });
    }

    return catalog;
  }
}

// ==========================================
// PRE-REGISTERED CORE TOOLS
// ==========================================

/**
 * Register all core platform tools
 */
export function registerCoreTools(): void {
  MCPToolRegistry.registerTools([
    {
      name: 'file_processor',
      description: 'Process uploaded files and validate data integrity',
      service: 'FileProcessor',
      permissions: ['read_files', 'process_data', 'validate_schema'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist', 'project_manager'],
      inputSchema: {
        file: 'File object or path',
        options: { validateSchema: 'boolean', detectPII: 'boolean' }
      },
      outputSchema: {
        data: 'array',
        schema: 'object',
        metadata: 'object'
      }
    },
    {
      name: 'schema_generator',
      description: 'Analyze data and generate schema with type detection',
      service: 'SchemaGenerator',
      permissions: ['analyze_schema', 'validate_data_types'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist'],
      examples: [{
        name: 'Generate schema from CSV',
        description: 'Automatically detect column types and constraints',
        input: { data: [{ name: 'John', age: 30 }] },
        expectedOutput: { schema: { name: { type: 'string' }, age: { type: 'integer' } } }
      }]
    },
    {
      name: 'data_transformer',
      description: 'Clean, transform, and engineer features from raw data',
      service: 'DataTransformer',
      permissions: ['transform_data', 'clean_data', 'engineer_features'],
      category: 'data',
      agentAccess: ['data_engineer', 'data_scientist']
    },
    {
      name: 'statistical_analyzer',
      description: 'Perform comprehensive statistical analysis and hypothesis testing',
      service: 'AdvancedAnalyzer',
      permissions: ['statistical_analysis', 'hypothesis_testing', 'anova', 'regression'],
      category: 'analysis',
      agentAccess: ['data_scientist']
    },
    {
      name: 'ml_pipeline',
      description: 'Train, evaluate, and deploy machine learning models',
      service: 'MLService',
      permissions: ['train_models', 'predict', 'evaluate_models', 'feature_selection'],
      category: 'ml',
      agentAccess: ['data_scientist']
    },
    {
      name: 'visualization_engine',
      description: 'Create charts, dashboards, and interactive visualizations',
      service: 'VisualizationAPIService',
      permissions: ['create_charts', 'generate_dashboards', 'interactive_plots'],
      category: 'visualization',
      agentAccess: ['data_scientist', 'business_agent']
    },
    {
      name: 'business_templates',
      description: 'Apply industry-specific templates and formatting',
      service: 'BusinessTemplates',
      permissions: ['business_analysis', 'customize_outputs', 'create_reports'],
      category: 'business',
      agentAccess: ['business_agent', 'project_manager']
    },
    {
      name: 'project_coordinator',
      description: 'Coordinate workflow steps and manage project artifacts',
      service: 'ProjectCoordinator',
      permissions: ['coordinate_workflow', 'track_progress', 'manage_artifacts'],
      category: 'utility',
      agentAccess: ['project_manager']
    },
    {
      name: 'decision_auditor',
      description: 'Log and audit all agent decisions for transparency',
      service: 'DecisionAuditor',
      permissions: ['log_decisions', 'track_reasoning', 'audit_workflow'],
      category: 'utility',
      agentAccess: ['all']
    }
  ]);

  console.log('✅ Core MCP tools registered');
}

// ==========================================
// TOOL USAGE HELPERS
// ==========================================

/**
 * Execute a tool with automatic validation
 */
export async function executeTool(
  toolName: string,
  agentId: string,
  input: any
): Promise<any> {
  // Check if agent can use tool
  if (!MCPToolRegistry.canAgentUseTool(agentId, toolName)) {
    throw new Error(`Agent ${agentId} does not have access to tool ${toolName}`);
  }

  // Get tool definition
  const tool = MCPToolRegistry.getTool(toolName);
  if (!tool) {
    throw new Error(`Tool ${toolName} not found`);
  }

  // TODO: Validate input against schema
  // TODO: Execute tool through MCP
  // TODO: Validate output against schema

  console.log(`🔧 Executing tool: ${toolName} for agent: ${agentId}`);

  return {
    success: true,
    tool: toolName,
    agent: agentId,
    result: 'Tool execution placeholder - integrate with actual service'
  };
}

/**
 * Get available tools for an agent as a formatted list
 */
export function getAgentToolMenu(agentId: string): string {
  const tools = MCPToolRegistry.getToolsForAgent(agentId);

  let menu = `# Available Tools for ${agentId}\n\n`;
  menu += `You have access to ${tools.length} tools:\n\n`;

  const categories = new Set(tools.map(t => t.category || 'utility'));

  for (const category of categories) {
    const categoryTools = tools.filter(t => (t.category || 'utility') === category);
    menu += `## ${category.toUpperCase()}\n\n`;

    categoryTools.forEach(tool => {
      menu += `- **${tool.name}**: ${tool.description}\n`;
    });
    menu += '\n';
  }

  return menu;
}
