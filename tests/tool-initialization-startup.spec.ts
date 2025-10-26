/**
 * Tool Initialization at Startup Tests
 *
 * Verifies that all tools and agents are properly initialized when server starts.
 * This is critical for the tool-based architecture to function.
 */

import { test, expect } from '@playwright/test';

test.describe('Tool Registry Initialization', () => {

  test('MCPToolRegistry has tools registered at startup', async ({ request }) => {
    const response = await request.get('/api/admin/tools');

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log('Registered Tools:', data.totalTools);

    expect(data.success).toBe(true);
    expect(data.tools).toBeDefined();
    expect(data.tools.length).toBeGreaterThan(0);

    // Verify we have at least the 9 core tools
    expect(data.totalTools).toBeGreaterThanOrEqual(9);
  });

  test('All core tools are registered', async ({ request }) => {
    const response = await request.get('/api/admin/tools');
    const data = await response.json();

    const coreTools = [
      'file_processor',
      'schema_generator',
      'data_transformer',
      'statistical_analyzer',
      'ml_pipeline',
      'visualization_engine',
      'business_templates',
      'project_coordinator',
      'decision_auditor'
    ];

    const registeredToolNames = data.tools.map((t: any) => t.name);

    for (const toolName of coreTools) {
      expect(
        registeredToolNames.includes(toolName),
        `Tool ${toolName} should be registered at startup`
      ).toBe(true);
    }
  });

  test('Tools have proper permissions configured', async ({ request }) => {
    const response = await request.get('/api/admin/tools');
    const data = await response.json();

    for (const tool of data.tools) {
      expect(tool.permissions).toBeDefined();
      expect(tool.permissions.required).toBeDefined();
      expect(Array.isArray(tool.permissions.required)).toBe(true);
    }
  });

  test('Tool-agent access matrix is configured', async ({ request }) => {
    const response = await request.get('/api/admin/tools/for-agent/technical_ai_agent');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.tools).toBeDefined();
    expect(data.tools.length).toBeGreaterThan(0);

    // Technical AI agent should have access to analysis tools
    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('statistical_analyzer');
    expect(toolNames).toContain('ml_pipeline');
    expect(toolNames).toContain('visualization_engine');
  });

  test('Business agent has correct tool access', async ({ request }) => {
    const response = await request.get('/api/admin/tools/for-agent/business_agent');
    const data = await response.json();

    const toolNames = data.tools.map((t: any) => t.name);
    expect(toolNames).toContain('business_templates');
    expect(toolNames).toContain('decision_auditor');
  });
});

test.describe('Agent Registry Initialization', () => {

  test('Agent registry has agents registered at startup', async ({ request }) => {
    const response = await request.get('/api/admin/agents');

    expect(response.status()).toBe(200);

    const data = await response.json();
    console.log('Registered Agents:', data.agents?.length);

    expect(data.success).toBe(true);
    expect(data.agents).toBeDefined();
    expect(data.agents.length).toBeGreaterThanOrEqual(3);
  });

  test('All core agents are registered', async ({ request }) => {
    const response = await request.get('/api/admin/agents');
    const data = await response.json();

    const coreAgents = [
      'project_manager',
      'technical_ai_agent',
      'business_agent'
    ];

    const registeredAgentIds = data.agents.map((a: any) => a.id);

    for (const agentId of coreAgents) {
      expect(
        registeredAgentIds.includes(agentId),
        `Agent ${agentId} should be registered at startup`
      ).toBe(true);
    }
  });

  test('Agents have capabilities defined', async ({ request }) => {
    const response = await request.get('/api/admin/agents');
    const data = await response.json();

    for (const agent of data.agents) {
      expect(agent.capabilities).toBeDefined();
      expect(Array.isArray(agent.capabilities)).toBe(true);
      expect(agent.capabilities.length).toBeGreaterThan(0);
    }
  });

  test('Agents are in active status', async ({ request }) => {
    const response = await request.get('/api/admin/agents');
    const data = await response.json();

    for (const agent of data.agents) {
      expect(agent.status).toBe('active');
    }
  });
});

test.describe('System Initialization Health Check', () => {

  test('Initialization status endpoint exists', async ({ request }) => {
    const response = await request.get('/api/admin/system/initialization-status');

    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('Initialization status shows all components initialized', async ({ request }) => {
    const response = await request.get('/api/admin/system/initialization-status');
    const data = await response.json();

    expect(data.initialization).toBeDefined();
    expect(data.initialization.toolsInitialized).toBe(true);
    expect(data.initialization.agentsInitialized).toBe(true);
    expect(data.initialization.timestamp).toBeDefined();
  });

  test('Initialization shows tool count', async ({ request }) => {
    const response = await request.get('/api/admin/system/initialization-status');
    const data = await response.json();

    expect(data.initialization.toolCount).toBeGreaterThanOrEqual(9);
    expect(data.initialization.agentCount).toBeGreaterThanOrEqual(3);
  });

  test('System status includes initialization info', async ({ request }) => {
    const response = await request.get('/api/admin/system/status');
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.system).toBeDefined();
  });
});

test.describe('Task Queue Agent Registration', () => {

  test('Agents registered with task queue', async ({ request }) => {
    const response = await request.get('/api/admin/system/status');
    const data = await response.json();

    // Task queue should show registered agents
    expect(data.system.queue).toBeDefined();
  });

  test('Technical agent has correct capabilities in queue', async ({ request }) => {
    const response = await request.get('/api/admin/agents/technical_ai_agent');
    const data = await response.json();

    const capabilities = data.agent.capabilities.map((c: any) => c.name);
    expect(capabilities).toContain('data_analysis');
    expect(capabilities).toContain('statistical_analysis');
    expect(capabilities).toContain('machine_learning');
  });

  test('Agents have concurrency limits configured', async ({ request }) => {
    const response = await request.get('/api/admin/agents');
    const data = await response.json();

    for (const agent of data.agents) {
      expect(agent.maxConcurrentTasks).toBeGreaterThan(0);
      expect(agent.maxConcurrentTasks).toBeLessThanOrEqual(10);
    }
  });
});

test.describe('Tool Initialization Service', () => {

  test('Tool initialization service was called at startup', async ({ request }) => {
    // This test verifies that server/services/tool-initialization.ts::initializeTools() was called

    const response = await request.get('/api/admin/system/initialization-status');
    const data = await response.json();

    expect(data.initialization.toolInitializationCalled).toBe(true);
    expect(data.initialization.toolInitializationTime).toBeDefined();
  });

  test('Agent initialization service was called at startup', async ({ request }) => {
    const response = await request.get('/api/admin/system/initialization-status');
    const data = await response.json();

    expect(data.initialization.agentInitializationCalled).toBe(true);
    expect(data.initialization.agentInitializationTime).toBeDefined();
  });

  test('No initialization errors logged', async ({ request }) => {
    const response = await request.get('/api/admin/system/initialization-status');
    const data = await response.json();

    expect(data.initialization.errors).toBeDefined();
    expect(data.initialization.errors.length).toBe(0);
  });
});
