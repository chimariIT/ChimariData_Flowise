/**
 * Update Journey Type Constraints Directly
 * Drops and recreates CHECK constraints to allow both old and new values
 */

import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL
    });

    try {
        console.log('🔄 Updating journey type constraints...\n');

        // Drop old constraints
        console.log('1. Dropping old constraints...');
        await pool.query('ALTER TABLE projects DROP CONSTRAINT IF EXISTS project_journey_type_check');
        await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS preferred_journey_check');
        console.log('   ✅ Old constraints dropped\n');

        // Add new constraints with both old and new values
        console.log('2. Adding new constraints (allowing both old and new values)...');
        await pool.query(`
      ALTER TABLE projects ADD CONSTRAINT project_journey_type_check 
      CHECK (journey_type IN ('non-tech', 'business', 'technical', 'consultation', 'custom', 'ai_guided', 'template_based', 'self_service'))
    `);
        await pool.query(`
      ALTER TABLE users ADD CONSTRAINT preferred_journey_check 
      CHECK (preferred_journey IS NULL OR preferred_journey IN ('non-tech', 'business', 'technical', 'consultation', 'custom', 'ai_guided', 'template_based', 'self_service'))
    `);
        console.log('   ✅ New constraints added\n');

        console.log('✅ Constraints updated successfully!');
        console.log('\nNext step: Run data migration');
        console.log('  npx tsx scripts/migrate-journey-types.ts');

        process.exit(0);
    } catch (error) {
        console.error('❌ Failed to update constraints:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
