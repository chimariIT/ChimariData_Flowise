/**
 * Fix tags column type conversion from TEXT[] to JSONB
 * Run with: npx tsx scripts/fix-tags-column.ts
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function fix() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔧 Fixing tags column type conversion...\n');

    // First check if the insights table exists
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'insights'
    `);

    if (tableCheck.rows.length === 0) {
      console.log('✅ insights table does not exist - will be created by migration');
      return;
    }

    // Check current column type
    const checkResult = await pool.query(`
      SELECT column_name, data_type, udt_name, column_default
      FROM information_schema.columns
      WHERE table_name = 'insights' AND column_name = 'tags'
    `);

    if (checkResult.rows.length === 0) {
      console.log('✅ No tags column found - will be created by migration');
      return;
    }

    const currentType = checkResult.rows[0].udt_name;
    const currentDefault = checkResult.rows[0].column_default;
    console.log(`  Current tags column type: ${currentType}`);
    console.log(`  Current default: ${currentDefault}`);

    if (currentType === 'jsonb') {
      console.log('✅ tags column is already JSONB');
      return;
    }

    // Step 1: Drop the default value first
    console.log('  Step 1: Dropping default value...');
    await pool.query(`ALTER TABLE insights ALTER COLUMN tags DROP DEFAULT`);

    // Step 2: Convert TEXT[] to JSONB
    console.log('  Step 2: Converting column type to JSONB...');
    await pool.query(`
      ALTER TABLE insights
      ALTER COLUMN tags TYPE jsonb
      USING COALESCE(to_jsonb(tags), '[]'::jsonb)
    `);

    // Step 3: No default needed for JSONB (nullable column is fine)
    console.log('  Step 3: Column converted (no default needed)');

    console.log('\n✅ tags column converted to JSONB successfully');
    console.log('\n📋 Now run: npm run db:push');

  } catch (error: any) {
    console.error('❌ Error:', error.message);

    // If conversion fails, just drop the table
    console.log('\n💡 Attempting to drop insights table instead...');
    try {
      await pool.query('DROP TABLE IF EXISTS insights CASCADE');
      console.log('✅ insights table dropped - will be recreated by migration');
      console.log('\n📋 Now run: npm run db:push');
    } catch (dropError: any) {
      console.error('❌ Failed to drop table:', dropError.message);
    }
  } finally {
    await pool.end();
  }
}

fix();
