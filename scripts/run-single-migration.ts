/**
 * Run a single migration file
 */
import { db } from '../server/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const migrationFile = path.join(process.cwd(), 'migrations', '003_add_analysis_goals_to_projects.sql');

  console.log(`📋 Reading migration file: ${migrationFile}`);
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('🔄 Executing migration...');
  console.log(sql);

  try {
    await db.execute(sql);
    console.log('✅ Migration applied successfully!');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('✅ Columns already exist, skipping migration');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  // Verify columns exist
  const result = await db.execute(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'projects'
    AND column_name IN ('analysis_goals', 'business_questions')
    ORDER BY column_name
  `);

  console.log('\n📊 Verification - Projects table columns:');
  console.log(result);

  process.exit(0);
}

runMigration().catch(err => {
  console.error('Error running migration:', err);
  process.exit(1);
});
