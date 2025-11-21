import { describe, it, expect, beforeAll } from 'vitest';
import { registerCoreTools, MCPToolRegistry } from '../../server/services/mcp-tool-registry';

describe('MCP tool registry spark coverage', () => {
  beforeAll(() => {
    if (MCPToolRegistry.getAllTools().length === 0) {
      registerCoreTools();
    }
  });

  it('registers the spark ML pipeline tool with correct metadata', () => {
    const tool = MCPToolRegistry.getTool('spark_ml_pipeline');
    expect(tool).toBeDefined();
    expect(tool?.category).toBe('ml_spark');
    expect(tool?.agentAccess).toContain('data_scientist');
    expect(tool?.permissions).toContain('distributed_ml');
  });

  it('restricts spark ML pipeline usage to data scientists', () => {
    expect(MCPToolRegistry.canAgentUseTool('data_scientist', 'spark_ml_pipeline')).toBe(true);
    expect(MCPToolRegistry.canAgentUseTool('business_agent', 'spark_ml_pipeline')).toBe(false);
  });
});

