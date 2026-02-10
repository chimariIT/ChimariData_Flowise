// Link all database templates to analysis patterns
// Creates patterns automatically if they don't exist
import * as dotenvModule from 'dotenv';
const dotenv = (dotenvModule as any).default || dotenvModule;
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Load environment BEFORE any database imports
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.error('❌ Failed to load .env file:', result.error);
  process.exit(1);
}

// Verify DATABASE_URL is loaded
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables.');
  console.error('   .env path:', envPath);
  process.exit(1);
}

console.log('✅ Environment loaded successfully');

// Import after environment is set
const { AnalysisPatternRegistry } = await import('../services/analysis-pattern-registry.ts');
const { db } = await import('../db.ts');
const { sql } = await import('drizzle-orm');

// Verify database connection
if (!db) {
  console.error('❌ Database connection not available.');
  process.exit(1);
}

console.log('✅ Database connection established');

// Derive pattern ID and metadata from template
function derivePatternFromTemplate(template: any) {
  // Pattern ID is same as template ID
  const patternId = template.id;

  // Extract goal from summary (simplified version)
  let goal = 'general';
  const summaryLower = template.summary.toLowerCase();

  if (summaryLower.includes('segment')) goal = 'Segment customers';
  else if (summaryLower.includes('fraud')) goal = 'Detect fraud';
  else if (summaryLower.includes('credit')) goal = 'Assess credit risk';
  else if (summaryLower.includes('portfolio') || summaryLower.includes('optimize')) goal = 'Optimize portfolio';
  else if (summaryLower.includes('forecast') || summaryLower.includes('predict')) goal = 'Forecast outcomes';
  else if (summaryLower.includes('laundering') || summaryLower.includes('aml')) goal = 'Detect money laundering';
  else if (summaryLower.includes('attrition') || summaryLower.includes('turnover')) goal = 'Predict attrition';
  else if (summaryLower.includes('compensation') || summaryLower.includes('equity')) goal = 'Analyze compensation equity';
  else if (summaryLower.includes('survey')) goal = 'Analyze survey responses';
  else if (summaryLower.includes('engagement') || summaryLower.includes('satisfaction')) goal = 'Analyze engagement';
  else if (summaryLower.includes('workforce') || summaryLower.includes('staffing')) goal = 'Optimize workforce planning';
  else if (summaryLower.includes('recruitment') || summaryLower.includes('hiring')) goal = 'Analyze recruitment effectiveness';
  else if (summaryLower.includes('performance')) goal = 'Analyze performance management';
  else if (summaryLower.includes('lifetime value') || summaryLower.includes('clv')) goal = 'Predict customer lifetime value';
  else if (summaryLower.includes('campaign')) goal = 'Optimize campaign performance';
  else if (summaryLower.includes('churn')) goal = 'Predict churn';
  else if (summaryLower.includes('basket') || summaryLower.includes('affinity')) goal = 'Discover product affinities';
  else if (summaryLower.includes('marketing mix') || summaryLower.includes('mmm')) goal = 'Optimize marketing mix';
  else if (summaryLower.includes('content')) goal = 'Analyze content performance';
  else if (summaryLower.includes('sentiment') || summaryLower.includes('social')) goal = 'Analyze sentiment';
  else if (summaryLower.includes('sales') && summaryLower.includes('forecast')) goal = 'Forecast sales';
  else if (summaryLower.includes('lead') || summaryLower.includes('scoring')) goal = 'Score leads';
  else if (summaryLower.includes('territory')) goal = 'Optimize territory';
  else if (summaryLower.includes('pipeline')) goal = 'Analyze pipeline health';
  else if (summaryLower.includes('win') || summaryLower.includes('loss')) goal = 'Analyze win/loss';
  else if (summaryLower.includes('quota')) goal = 'Optimize quota planning';
  else if (summaryLower.includes('retail') || summaryLower.includes('growth')) goal = 'Drive retail growth';
  else if (summaryLower.includes('risk')) goal = 'Monitor risk';

  return {
    id: patternId,
    name: template.name,
    goal,
    industry: template.industry,
    description: template.summary
  };
}

async function ensurePatternExists(template: any) {
  const pattern = derivePatternFromTemplate(template);

  // Check if pattern exists
  const existingPatterns = await AnalysisPatternRegistry.getPatternsForContext({
    limit: 200,
    includePending: true
  });
  const exists = existingPatterns.some(p => p.id === pattern.id);

  if (!exists) {
    await AnalysisPatternRegistry.recordPattern({
      id: pattern.id,
      name: pattern.name,
      goal: pattern.goal,
      industry: pattern.industry,
      description: pattern.description,
      status: 'ready',
      confidence: 85
    });
    console.log(`   ✅ Created pattern: ${pattern.name}`);
    return true;
  } else {
    console.log(`   ℹ️  Pattern exists: ${pattern.name}`);
    return false;
  }
}

async function linkAllTemplates() {
  console.log('\n🔗 Starting comprehensive template-pattern linking...\n');

  // Fetch all templates from database
  const templatesResult = await db.execute(sql.raw(`
    SELECT id, name, title, summary, industry, is_system
    FROM artifact_templates
    WHERE is_active = true
    ORDER BY industry, name;
  `));

  const templates = templatesResult.rows;
  console.log(`📋 Found ${templates.length} active templates in database\n`);

  let patternsCreated = 0;
  let patternsExisted = 0;
  let linksCreated = 0;
  let linksSkipped = 0;
  let linksFailed = 0;

  for (const template of templates) {
    console.log(`\n📄 Processing: ${template.name} (${template.industry})`);

    try {
      // Ensure pattern exists
      const created = await ensurePatternExists(template);
      if (created) {
        patternsCreated++;
      } else {
        patternsExisted++;
      }

      // Link template to pattern
      const patternId = template.id; // Pattern ID matches template ID

      try {
        await AnalysisPatternRegistry.linkPatternToTemplate({
          templateId: template.id,
          patternId,
          relevanceScore: 100
        });
        console.log(`   ✅ Linked to pattern`);
        linksCreated++;
      } catch (linkError: any) {
        // Check if it's a duplicate key error (already linked)
        if (linkError.code === '23505') {
          console.log(`   ⏭️  Already linked to pattern`);
          linksSkipped++;
        } else {
          console.error(`   ❌ Failed to link:`, linkError.message);
          linksFailed++;
        }
      }

    } catch (error: any) {
      console.error(`   ❌ Error processing template:`, error.message);
      linksFailed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Final Summary:');
  console.log('='.repeat(70));
  console.log('\n📈 Analysis Patterns:');
  console.log(`   ✅ Created: ${patternsCreated}`);
  console.log(`   ℹ️  Already Existed: ${patternsExisted}`);
  console.log(`   📊 Total: ${patternsCreated + patternsExisted}`);

  console.log('\n🔗 Template-Pattern Links:');
  console.log(`   ✅ Created: ${linksCreated}`);
  console.log(`   ⏭️  Already Existed: ${linksSkipped}`);
  console.log(`   ❌ Failed: ${linksFailed}`);
  console.log(`   📊 Total: ${linksCreated + linksSkipped}`);

  // Show patterns by industry
  const patternsByIndustry = await db.execute(sql.raw(`
    SELECT industry, COUNT(*) as count
    FROM analysis_patterns
    WHERE status = 'ready'
    GROUP BY industry
    ORDER BY industry;
  `));

  console.log('\n📊 Patterns by Industry:');
  for (const row of patternsByIndustry.rows) {
    console.log(`   ${row.industry}: ${row.count}`);
  }

  // Show links summary
  const linksSummary = await db.execute(sql.raw(`
    SELECT COUNT(*) as total_links
    FROM template_patterns;
  `));

  console.log('\n🔗 Template-Pattern Relationships:');
  console.log(`   Total Links: ${linksSummary.rows[0].total_links}`);

  console.log('\n' + '='.repeat(70));
}

async function main() {
  try {
    await linkAllTemplates();
    console.log('\n✅ Template-pattern linking complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
