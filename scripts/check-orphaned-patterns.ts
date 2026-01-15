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

console.log('✅ Environment loaded');

// Import db after environment is set
const { db } = await import('../server/db.js');
const { sql } = await import('drizzle-orm');

async function checkOrphanedPatterns() {
  console.log('🔍 Checking for orphaned template_patterns entries...\n');

  try {
    // Find template_patterns entries with missing templates
    const orphanedTemplates = await db.execute(sql`
      SELECT tp.id, tp.template_id, tp.pattern_id, tp.relevance_score
      FROM template_patterns tp
      LEFT JOIN artifact_templates at ON tp.template_id = at.id
      WHERE at.id IS NULL
      ORDER BY tp.template_id
    `);

    console.log(`📊 Orphaned template_patterns (missing templates): ${orphanedTemplates.rows.length}`);
    if (orphanedTemplates.rows.length > 0) {
      console.table(orphanedTemplates.rows);
    }

    // Find template_patterns entries with missing patterns
    const orphanedPatterns = await db.execute(sql`
      SELECT tp.id, tp.template_id, tp.pattern_id, tp.relevance_score
      FROM template_patterns tp
      LEFT JOIN analysis_patterns ap ON tp.pattern_id = ap.id
      WHERE ap.id IS NULL
      ORDER BY tp.pattern_id
    `);

    console.log(`\n📊 Orphaned template_patterns (missing patterns): ${orphanedPatterns.rows.length}`);
    if (orphanedPatterns.rows.length > 0) {
      console.table(orphanedPatterns.rows);
    }

    // Count total template_patterns entries
    const totalCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM template_patterns
    `);
    console.log(`\n📊 Total template_patterns entries: ${totalCount.rows[0]?.count || 0}`);

    // Count templates
    const templatesCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM artifact_templates
    `);
    console.log(`📊 Total artifact_templates entries: ${templatesCount.rows[0]?.count || 0}`);

    // Count patterns
    const patternsCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM analysis_patterns
    `);
    console.log(`📊 Total analysis_patterns entries: ${patternsCount.rows[0]?.count || 0}`);

    // Show template IDs that are referenced but missing
    if (orphanedTemplates.rows.length > 0) {
      const missingTemplateIds = [...new Set(orphanedTemplates.rows.map((r: any) => r.template_id))];
      console.log(`\n❌ Missing template IDs (${missingTemplateIds.length}):`);
      missingTemplateIds.forEach((id: string) => console.log(`   - ${id}`));
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to check orphaned patterns:', error.message);
    process.exit(1);
  }
}

checkOrphanedPatterns();
