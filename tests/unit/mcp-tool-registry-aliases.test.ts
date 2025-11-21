import { describe, expect, test, beforeAll } from 'vitest';
import { MCPToolRegistry, registerCoreTools } from '../../server/services/mcp-tool-registry';

describe('MCPToolRegistry agent alias resolution', () => {
  beforeAll(() => {
    // Ensure core tools are registered for testing alias matching.
    if (MCPToolRegistry.getAllTools().length === 0) {
      registerCoreTools();
    }
  });

  test('technical_ai_agent resolves to data_scientist role for tool execution', () => {
    const tools = MCPToolRegistry.getToolsForAgent('technical_ai_agent');
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toContain('statistical_analyzer');
    expect(toolNames).toContain('ml_pipeline');
    expect(toolNames).toContain('visualization_engine');
  });

  test('technical_ai_agent can execute statistical analyzer via alias', () => {
    expect(MCPToolRegistry.canAgentUseTool('technical_ai_agent', 'statistical_analyzer')).toBe(true);
  });

  test('technical_ai_agent cannot execute tools outside alias set', () => {
    const hasAccess = MCPToolRegistry.canAgentUseTool('technical_ai_agent', 'billing_query_handler');
    expect(hasAccess).toBe(false);
  });
});