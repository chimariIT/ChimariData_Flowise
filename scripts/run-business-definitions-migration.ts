/**
 * Create business_definitions table
 * Run: npx tsx scripts/run-business-definitions-migration.ts
 */
import 'dotenv/config'; // Load environment variables FIRST

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Business Definitions Table Migration                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!db) {
    console.error('❌ Database connection not available');
    process.exit(1);
  }

  try {
    // Check if table already exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = 'business_definitions'
      )
    `);

    const exists = tableExists.rows[0]?.exists;

    if (exists) {
      console.log('ℹ️  business_definitions table already exists');
      console.log('✅ Migration not needed');
      process.exit(0);
    }

    console.log('🔄 Creating business_definitions table...\n');

    // Create the table
    await db.execute(sql`
      CREATE TABLE business_definitions (
        id VARCHAR PRIMARY KEY,
        project_id VARCHAR REFERENCES projects(id) ON DELETE CASCADE,
        user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        concept_name VARCHAR(200) NOT NULL,
        display_name VARCHAR(200),
        industry VARCHAR(100) DEFAULT 'general',
        domain VARCHAR(100),
        business_description TEXT NOT NULL,
        business_context TEXT,
        calculation_type VARCHAR(50) NOT NULL,
        formula TEXT,
        pseudo_code TEXT,
        component_fields JSONB DEFAULT '[]',
        aggregation_method VARCHAR(50),
        expected_data_type VARCHAR(50) DEFAULT 'numeric',
        value_range JSONB,
        unit VARCHAR(50),
        match_patterns JSONB DEFAULT '[]',
        synonyms JSONB DEFAULT '[]',
        source_type VARCHAR(50) DEFAULT 'manual',
        source_reference TEXT,
        source_agent_id VARCHAR(50),
        confidence DOUBLE PRECISION DEFAULT 0.8,
        usage_count INTEGER DEFAULT 0,
        success_rate DOUBLE PRECISION,
        last_used_at TIMESTAMP,
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    console.log('  ✅ Table created');

    // Create indexes
    console.log('🔄 Creating indexes...');

    await db.execute(sql`CREATE INDEX bd_concept_name_idx ON business_definitions(concept_name)`);
    console.log('  ✅ Index: bd_concept_name_idx');

    await db.execute(sql`CREATE INDEX bd_industry_idx ON business_definitions(industry)`);
    console.log('  ✅ Index: bd_industry_idx');

    await db.execute(sql`CREATE INDEX bd_domain_idx ON business_definitions(domain)`);
    console.log('  ✅ Index: bd_domain_idx');

    await db.execute(sql`CREATE INDEX bd_project_id_idx ON business_definitions(project_id)`);
    console.log('  ✅ Index: bd_project_id_idx');

    await db.execute(sql`CREATE INDEX bd_calculation_type_idx ON business_definitions(calculation_type)`);
    console.log('  ✅ Index: bd_calculation_type_idx');

    await db.execute(sql`CREATE INDEX bd_status_idx ON business_definitions(status)`);
    console.log('  ✅ Index: bd_status_idx');

    await db.execute(sql`CREATE INDEX bd_industry_concept_idx ON business_definitions(industry, concept_name)`);
    console.log('  ✅ Index: bd_industry_concept_idx');

    // Verify table creation
    const verification = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'business_definitions'
      ORDER BY ordinal_position
      LIMIT 5
    `);

    console.log('\n📊 Verification - First 5 columns:');
    for (const row of verification.rows) {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Migration Completed Successfully!                       ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
