
import { agentRegistry } from './agent-registry';
import { MCPToolRegistry } from './mcp-tool-registry';

async function verifyAdminServices() {
    console.log('Verifying Admin Services...');

    // Verify Agents
    const agents = agentRegistry.getAgents();
    console.log(`Found ${agents.length} registered agents.`);
    agents.forEach(agent => {
        console.log(`- Agent: ${agent.name} (${agent.id}) - Status: ${agent.status}`);
    });

    // Verify Tools
    const tools = MCPToolRegistry.getAllTools();
    console.log(`Found ${tools.length} registered tools.`);
    tools.forEach(tool => {
        console.log(`- Tool: ${tool.name} - Category: ${tool.category}`);
    });
}

verifyAdminServices().catch(console.error);
