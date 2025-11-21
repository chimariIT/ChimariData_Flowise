/**
 * Check if pricing tables exist in database
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

async function checkPricingTables() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🔍 Checking pricing tables...\n');

  try {
    // Check for pricing_config_tables.sql tables
    const tables = [
      'pricing_components',
      'pricing_subscription_tiers',
      'pricing_services',
      'pricing_rules'
    ];

    // Also check schema.ts tables
    const schemaTables = [
      'service_pricing',
      'subscription_tier_pricing'
    ];

    console.log('📊 Tables from pricing_config_tables.sql:');
    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);

      if (exists) {
        const countResult = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`     └─ Rows: ${countResult.rows[0].count}`);
      }
    }

    console.log('\n📊 Tables from shared/schema.ts:');
    for (const table of schemaTables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [table]);

      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);

      if (exists) {
        const countResult = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
        console.log(`     └─ Rows: ${countResult.rows[0].count}`);
      }
    }

    // Sample data from existing tables
    console.log('\n📋 Sample data from service_pricing:');
    const servicePricing = await pool.query('SELECT id, service_type, display_name, base_price FROM service_pricing LIMIT 3');
    servicePricing.rows.forEach(row => {
      console.log(`  • ${row.display_name} (${row.service_type}): $${(row.base_price / 100).toFixed(2)}`);
    });

    console.log('\n📋 Sample data from subscription_tier_pricing:');
    const tierPricing = await pool.query('SELECT id, display_name, monthly_price_usd, yearly_price_usd FROM subscription_tier_pricing LIMIT 4');
    tierPricing.rows.forEach(row => {
      console.log(`  • ${row.display_name} (${row.id}): $${(row.monthly_price_usd / 100).toFixed(2)}/mo`);
    });

    console.log('\n✅ Database check complete!');
  } catch (error) {
    console.error('❌ Error checking database:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the check
checkPricingTables()
  .then(() => {
    console.log('\n✅ Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  });
