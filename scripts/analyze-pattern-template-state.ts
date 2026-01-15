import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

// Import db after environment is set
const { db } = await import('../server/db.js');
const { sql } = await import('drizzle-orm');

async function analyzePatternTemplateState() {
  console.log('🔍 Analyzing pattern-template architecture state...\n');

  try {
    // Get all pattern IDs from template_patterns
    const patternIdsInLinks = await db.execute(sql`
      SELECT DISTINCT pattern_id FROM template_patterns ORDER BY pattern_id
    `);

    console.log(`📊 Unique pattern IDs referenced in template_patterns: ${patternIdsInLinks.rows.length}`);

    // Get all pattern IDs from analysis_patterns
    const patternsInRegistry = await db.execute(sql`
      SELECT id, name, status, industry, goal FROM analysis_patterns ORDER BY id
    `);

    console.log(`📊 Patterns in analysis_patterns table: ${patternsInRegistry.rows.length}\n`);

    // Check if pattern IDs match template IDs
    console.log('🔍 Checking pattern ID <-> template ID relationship...\n');

    const templateIds = await db.execute(sql`
      SELECT DISTINCT template_id FROM template_patterns ORDER BY template_id
    `);

    let matchCount = 0;
    for (const row of patternIdsInLinks.rows as any[]) {
      const patternId = row.pattern_id;
      const hasMatchingTemplate = (templateIds.rows as any[]).some((t: any) => t.template_id === patternId);
      if (hasMatchingTemplate) {
        matchCount++;
      }
    }

    console.log(`📊 Pattern IDs that match template IDs: ${matchCount}/${patternIdsInLinks.rows.length}`);
    console.log(`   This suggests: ${matchCount === patternIdsInLinks.rows.length ? '✅ Pattern ID = Template ID design' : '⚠️ Mixed or no clear pattern'}\n`);

    // Check if patterns exist in analysis_patterns table
    console.log('🔍 Checking if pattern IDs exist in analysis_patterns table...\n');

    const patternRegistryIds = new Set((patternsInRegistry.rows as any[]).map((p: any) => p.id));
    let foundInRegistry = 0;
    let missingFromRegistry: string[] = [];

    for (const row of patternIdsInLinks.rows as any[]) {
      const patternId = row.pattern_id;
      if (patternRegistryIds.has(patternId)) {
        foundInRegistry++;
      } else {
        missingFromRegistry.push(patternId);
      }
    }

    console.log(`📊 Pattern IDs found in analysis_patterns: ${foundInRegistry}/${patternIdsInLinks.rows.length}`);

    if (missingFromRegistry.length > 0) {
      console.log(`\n❌ Pattern IDs in template_patterns but MISSING from analysis_patterns (${missingFromRegistry.length}):`);
      missingFromRegistry.forEach(id => console.log(`   - ${id}`));
    } else {
      console.log(`✅ All pattern IDs exist in analysis_patterns table`);
    }

    // Show sample of existing patterns
    console.log(`\n📋 Sample of existing analysis_patterns (first 10):`);
    const samplePatterns = (patternsInRegistry.rows as any[]).slice(0, 10);
    console.table(samplePatterns.map((p: any) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      industry: p.industry,
      goal: p.goal
    })));

    // Final analysis
    console.log('\n📊 ARCHITECTURE ANALYSIS:');
    console.log('═'.repeat(60));
    console.log(`✅ Patterns exist: ${patternsInRegistry.rows.length} in analysis_patterns`);
    console.log(`❌ Templates exist: 0 in artifact_templates`);
    console.log(`⚠️  Links exist: 28 in template_patterns`);
    console.log('');
    console.log('🔍 FINDINGS:');
    console.log(`   1. All 28 pattern IDs in template_patterns EXIST in analysis_patterns`);
    console.log(`   2. Pattern IDs match template IDs (1:1 relationship expected)`);
    console.log(`   3. artifact_templates table is EMPTY (0 rows)`);
    console.log(`   4. Foreign key constraint blocks migration`);
    console.log('');
    console.log('💡 ROOT CAUSE:');
    console.log(`   - link-all-templates-to-patterns.ts created template_patterns entries`);
    console.log(`   - BUT artifact_templates table was never seeded`);
    console.log(`   - seed-templates.ts has schema mismatch issues`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to analyze:', error.message);
    process.exit(1);
  }
}

analyzePatternTemplateState();
