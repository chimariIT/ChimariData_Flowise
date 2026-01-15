/**
 * Fix migration constraint error
 * Run with: npx tsx scripts/fix-migration-constraint.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function fixMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔧 Fixing migration constraint issues...\n');

    // Drop the problematic tables that have FK issues
    const dropStatements = [
      'DROP TABLE IF EXISTS de_pii_detections CASCADE',
      'DROP TABLE IF EXISTS de_schema_issues CASCADE',
      'DROP TABLE IF EXISTS de_quality_reports CASCADE',
      'DROP TABLE IF EXISTS stripe_usage_records CASCADE',
    ];

    for (const sql of dropStatements) {
      console.log(`  Running: ${sql}`);
      await pool.query(sql);
      console.log('  ✓ Done\n');
    }

    // Verify tables are gone
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('de_pii_detections', 'de_quality_reports', 'de_schema_issues', 'stripe_usage_records')
    `);

    if (result.rows.length === 0) {
      console.log('✅ All problematic tables removed successfully');
      console.log('\n📋 Now run: npm run db:push');
    } else {
      console.log('⚠️ Some tables still exist:', result.rows.map(r => r.table_name));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

fixMigration();
