#!/usr/bin/env tsx
// Interactive tool to add new templates to the system
// Usage: npx tsx server/scripts/add-new-template.ts

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import * as readline from 'readline';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Load environment
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

// Import after environment is set
const { db } = await import('../db.ts');
const { sql } = await import('drizzle-orm');
const { AnalysisPatternRegistry } = await import('../services/analysis-pattern-registry.ts');

if (!db) {
  console.error('❌ Database connection failed');
  process.exit(1);
}

console.log('✅ Database connected\n');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Default step structure for templates
function createDefaultSteps(templateId: string, industry: string) {
  return [
    {
      id: 'industry_context',
      name: 'Industry Context Setup',
      summary: `Gather ${industry} domain context and business objectives`,
      agentHandoff: 'PM collects user requirements',
      tools: ['clarification_tool', 'context_builder']
    },
    {
      id: 'data_upload',
      name: 'Data Upload & Validation',
      summary: 'Upload and validate data files',
      agentHandoff: 'PM → Data Engineer for validation',
      tools: ['file_processor', 'schema_generator', 'data_quality_monitor']
    },
    {
      id: 'analysis_plan',
      name: 'Analysis Plan Generation',
      summary: 'Generate multi-agent analysis plan with cost estimation',
      agentHandoff: 'Data Engineer + Data Scientist collaborate',
      tools: ['analysis_planner', 'cost_estimator']
    },
    {
      id: 'data_preparation',
      name: 'Data Transformation',
      summary: 'Clean, transform, and prepare data for analysis',
      agentHandoff: 'Data Engineer executes transformations',
      tools: ['data_transformer', 'feature_engineer']
    },
    {
      id: 'execute',
      name: 'Execute Analysis',
      summary: 'Run approved analysis plan and generate artifacts',
      agentHandoff: 'Data Scientist executes analysis',
      tools: ['statistical_analyzer', 'ml_pipeline', 'visualization_engine']
    },
    {
      id: 'results_review',
      name: 'Results Review',
      summary: 'Review and approve generated insights and artifacts',
      agentHandoff: 'PM presents results for user approval',
      tools: ['artifact_presenter']
    },
    {
      id: 'delivery',
      name: 'Final Deliverables',
      summary: 'Package and deliver final artifacts',
      agentHandoff: 'PM finalizes deliverables',
      tools: ['artifact_packager', 'export_tools']
    }
  ];
}

async function collectTemplateInfo() {
  console.log('🎯 New Template Creator');
  console.log('=' .repeat(50) + '\n');

  // Template ID
  const name = await question('Template Name (e.g., "Price Optimization"): ');
  if (!name) {
    console.error('❌ Template name is required');
    process.exit(1);
  }

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  console.log(`   Generated ID: ${id}\n`);

  // Title
  const titleDefault = name;
  const title = await question(`Title [${titleDefault}]: `) || titleDefault;

  // Summary
  const summary = await question('Summary (one-line description): ');
  if (!summary) {
    console.error('❌ Summary is required');
    process.exit(1);
  }

  // Industry
  console.log('\nIndustry Options: finance, hr, marketing, sales, retail, operations, customer_service, product, general');
  const industry = await question('Industry: ');
  if (!industry) {
    console.error('❌ Industry is required');
    process.exit(1);
  }

  // Persona
  const persona = await question('Target Persona (e.g., "marketing analyst"): ');

  // Primary Agent
  console.log('\nAgent Options: business_agent, data_scientist, data_engineer, project_manager');
  const primaryAgent = await question('Primary Agent [business_agent]: ') || 'business_agent';

  // Expected Artifacts
  console.log('\nExpected Artifacts (comma-separated):');
  console.log('Examples: dashboard, pdf_report, powerpoint_deck, rest_api_export, model, forecast');
  const artifactsInput = await question('Artifacts: ');
  const expectedArtifacts = artifactsInput ? artifactsInput.split(',').map(a => a.trim()) : [];

  // Journey Type
  const journeyType = 'business'; // Most templates are business type

  return {
    id,
    name,
    title,
    summary,
    industry,
    persona,
    primaryAgent,
    expectedArtifacts,
    journeyType
  };
}

async function createTemplate() {
  try {
    const template = await collectTemplateInfo();

    console.log('\n📋 Template Summary:');
    console.log('='.repeat(50));
    console.log(`ID: ${template.id}`);
    console.log(`Name: ${template.name}`);
    console.log(`Title: ${template.title}`);
    console.log(`Summary: ${template.summary}`);
    console.log(`Industry: ${template.industry}`);
    console.log(`Persona: ${template.persona}`);
    console.log(`Primary Agent: ${template.primaryAgent}`);
    console.log(`Artifacts: ${template.expectedArtifacts.join(', ')}`);
    console.log('='.repeat(50));

    const confirm = await question('\nCreate this template? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      process.exit(0);
    }

    // Create template in database
    const steps = createDefaultSteps(template.id, template.industry);

    await db.execute(sql.raw(`
      INSERT INTO artifact_templates (
        id, name, title, summary, journey_type, industry, persona,
        primary_agent, default_confidence, expected_artifacts,
        communication_style, steps, is_system, is_active, created_at, updated_at
      ) VALUES (
        '${template.id}',
        '${template.name.replace(/'/g, "''")}',
        '${template.title.replace(/'/g, "''")}',
        '${template.summary.replace(/'/g, "''")}',
        '${template.journeyType}',
        '${template.industry}',
        '${template.persona?.replace(/'/g, "''") || 'analyst'}',
        '${template.primaryAgent}',
        0.85,
        '${JSON.stringify(template.expectedArtifacts)}'::jsonb,
        'professional',
        '${JSON.stringify(steps)}'::jsonb,
        true,
        true,
        now(),
        now()
      );
    `));

    console.log('\n✅ Template created in database');

    // Create corresponding analysis pattern
    const pattern = {
      id: template.id,
      name: template.name,
      goal: template.summary.split(' to ')[1] || template.summary.split(' and ')[0] || 'general analysis',
      industry: template.industry,
      description: template.summary,
      status: 'ready' as const,
      confidence: 85
    };

    await AnalysisPatternRegistry.recordPattern(pattern);
    console.log('✅ Analysis pattern created');

    // Link template to pattern
    await AnalysisPatternRegistry.linkPatternToTemplate({
      templateId: template.id,
      patternId: template.id,
      relevanceScore: 100
    });

    console.log('✅ Template linked to pattern');

    console.log('\n🎉 Template successfully added to the system!');
    console.log(`   Template ID: ${template.id}`);
    console.log(`   Industry: ${template.industry}`);

  } catch (error: any) {
    console.error('\n❌ Error creating template:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

createTemplate();
