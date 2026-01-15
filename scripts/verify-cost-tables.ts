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

async function verifyCostTables() {
  console.log('🔍 Verifying cost tracking tables...\n');

  try {
    // Check if tables exist
    const tables = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('project_cost_tracking', 'cost_line_items', 'user_monthly_billing')
      ORDER BY table_name
    `);

    console.log(`📊 Cost tracking tables found: ${tables.rows.length}/3\n`);

    for (const row of tables.rows as any[]) {
      console.log(`✅ ${row.table_name}`);

      // Count columns
      const columns = await db.execute(sql`
        SELECT COUNT(*) as count
        FROM information_schema.columns
        WHERE table_name = '${sql.raw(row.table_name)}'
      `);

      console.log(`   📋 Columns: ${columns.rows[0]?.count || 0}`);
    }

    // Check indexes
    console.log('\n🔍 Checking indexes...\n');

    const indexes = await db.execute(sql`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('project_cost_tracking', 'cost_line_items', 'user_monthly_billing')
      ORDER BY tablename, indexname
    `);

    const indexCount = new Map<string, number>();
    for (const row of indexes.rows as any[]) {
      const count = indexCount.get(row.tablename) || 0;
      indexCount.set(row.tablename, count + 1);
    }

    console.log('📊 Indexes by table:');
    indexCount.forEach((count, table) => {
      console.log(`   ${table}: ${count} indexes`);
    });

    console.log('\n✅ Cost tracking tables verification complete!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to verify tables:', error.message);
    process.exit(1);
  }
}

verifyCostTables();
