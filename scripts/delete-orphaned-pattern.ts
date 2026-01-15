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

async function deleteOrphanedPattern() {
  console.log('🗑️  Deleting orphaned template_patterns entry...');

  try {
    const result = await db.execute(sql`
      DELETE FROM template_patterns
      WHERE template_id = 'anti_money_laundering_detection'
    `);

    console.log(`✅ Deleted orphaned pattern`);
    console.log(`   Rows affected: ${result.rowCount || 0}`);

    // Verify it's gone
    const check = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM template_patterns
      WHERE template_id = 'anti_money_laundering_detection'
    `);

    console.log(`✅ Verification: ${check.rows[0]?.count || 0} orphaned patterns remaining`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to delete orphaned pattern:', error.message);
    process.exit(1);
  }
}

deleteOrphanedPattern();
