/**
 * Inspect pricing table schemas
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

async function inspectSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🔍 Inspecting pricing table schemas...\n');

  try {
    // Inspect subscription_tier_pricing
    console.log('📊 subscription_tier_pricing columns:');
    const tierColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'subscription_tier_pricing'
      ORDER BY ordinal_position;
    `);
    tierColumns.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type})`);
    });

    // Get sample row
    console.log('\n📋 Sample subscription_tier_pricing row:');
    const tierSample = await pool.query('SELECT * FROM subscription_tier_pricing WHERE id = $1', ['starter']);
    if (tierSample.rows[0]) {
      console.log(JSON.stringify(tierSample.rows[0], null, 2));
    }

    // Inspect service_pricing
    console.log('\n📊 service_pricing columns:');
    const serviceColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'service_pricing'
      ORDER BY ordinal_position;
    `);
    serviceColumns.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type})`);
    });

    console.log('\n✅ Schema inspection complete!');
  } catch (error) {
    console.error('❌ Error inspecting schema:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

inspectSchema()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
