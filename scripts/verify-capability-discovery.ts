/**
 * Verify the capability-based tool discovery system
 * Tests that findToolsByCapability() correctly discovers tools by their capabilities
 */

import { MCPToolRegistry, registerCoreTools } from '../server/services/mcp-tool-registry';

async function verifyCapabilityDiscovery() {
  console.log('🔍 Verifying U2A2A2U Capability Discovery System\n');
  console.log('=' .repeat(60));

  // Initialize tools
  registerCoreTools();

  const allTools = MCPToolRegistry.getAllTools();
  console.log(`\n📊 Total tools registered: ${allTools.length}`);

  // Count tools with capabilities
  const toolsWithCapabilities = allTools.filter(t => t.capabilities && t.capabilities.length > 0);
  console.log(`📊 Tools with capability metadata: ${toolsWithCapabilities.length}`);
  console.log(`📊 Tools missing capability metadata: ${allTools.length - toolsWithCapabilities.length}\n`);

  // Test various capability queries
  const testCapabilities = [
    // Template/Research capabilities
    'template.search',
    'template.retrieve',
    'template.recommend',

    // PII/Privacy capabilities
    'pii.detect',
    'pii.exclude',

    // Customer support capabilities
    'health.check',
    'issue.diagnose',
    'feature.explain',

    // Research capabilities
    'trend.analyze',
    'academic.search',
    'content.synthesize',

    // Data ingestion capabilities
    'file.ingest',
    'csv.parse',
    'database.connect',
    'api.consume',
    'cloud.connect',

    // Business capabilities
    'roi.calculate',
    'compliance.check',
    'competitive.analyze',

    // Analysis capabilities
    'analysis.statistical',
    'ml.train',
    'quality.assess',
    'plan.generate'
  ];

  console.log('🔍 Testing capability-based discovery:\n');

  for (const capability of testCapabilities) {
    const tools = MCPToolRegistry.findToolsByCapability(capability);
    const toolNames = tools.map(t => t.name).join(', ') || '(none found)';
    const status = tools.length > 0 ? '✅' : '⚠️ ';
    console.log(`${status} ${capability.padEnd(25)} → ${tools.length} tool(s): ${toolNames}`);
  }

  // List tools missing capabilities
  console.log('\n\n📋 Tools missing capability metadata:');
  console.log('-'.repeat(60));
  const toolsWithoutCapabilities = allTools.filter(t => !t.capabilities || t.capabilities.length === 0);
  if (toolsWithoutCapabilities.length === 0) {
    console.log('✅ All tools have capability metadata!');
  } else {
    toolsWithoutCapabilities.forEach(t => {
      console.log(`  ⚠️  ${t.name} (${t.category})`);
    });
  }

  // Summary of all capabilities
  console.log('\n\n📋 All unique capabilities in the registry:');
  console.log('-'.repeat(60));
  const allCapabilities = new Set<string>();
  toolsWithCapabilities.forEach(tool => {
    tool.capabilities?.forEach(cap => {
      if (typeof cap === 'string') {
        allCapabilities.add(cap);
      } else if (cap.name) {
        allCapabilities.add(cap.name);
      }
    });
  });

  const sortedCapabilities = Array.from(allCapabilities).sort();
  sortedCapabilities.forEach(cap => console.log(`  • ${cap}`));
  console.log(`\nTotal unique capabilities: ${sortedCapabilities.length}`);

  // Capability categories summary
  console.log('\n\n📊 Capability categories:');
  console.log('-'.repeat(60));
  const capabilityCategories = new Map<string, string[]>();
  sortedCapabilities.forEach(cap => {
    const [category] = cap.split('.');
    if (!capabilityCategories.has(category)) {
      capabilityCategories.set(category, []);
    }
    capabilityCategories.get(category)!.push(cap);
  });

  for (const [category, caps] of Array.from(capabilityCategories.entries()).sort()) {
    console.log(`  ${category.padEnd(15)}: ${caps.length} capabilities`);
  }

  console.log('\n✅ Capability discovery verification complete!');
}

verifyCapabilityDiscovery().catch(console.error);
