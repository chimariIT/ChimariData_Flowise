// Drop and recreate artifact_templates table
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '../../.env');

// Load environment
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

console.log('✅ Environment loaded');

// Import database after environment is set
const { db } = await import('../db.ts');
const { sql } = await import('drizzle-orm');

if (!db) {
  console.error('❌ Database connection failed');
  process.exit(1);
}

console.log('✅ Database connected');

// Drop existing table and views if they exist
console.log('🗑️  Dropping existing artifact_templates table and views...');

try {
  await db.execute(sql.raw(`
    DROP VIEW IF EXISTS system_templates CASCADE;
    DROP VIEW IF EXISTS custom_templates CASCADE;
    DROP TABLE IF EXISTS artifact_templates CASCADE;
  `));
  console.log('✅ Existing objects dropped');
} catch (error: any) {
  console.error('⚠️  Warning during drop:', error.message);
}

// Read and execute the migration
const migrationPath = resolve(__dirname, '../../migrations/011_create_artifact_templates.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📄 Running migration: 011_create_artifact_templates.sql');

try {
  await db.execute(sql.raw(migrationSQL));
  console.log('✅ Migration executed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

// Verify creation
try {
  const tableCheck = await db.execute(sql.raw(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'artifact_templates';
  `));

  if (tableCheck.rows.length > 0) {
    console.log('\n✅ Table created: artifact_templates');

    // Check columns
    const columns = await db.execute(sql.raw(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'artifact_templates'
      ORDER BY ordinal_position;
    `));

    console.log(`\n📋 Columns (${columns.rows.length}):`);
    for (const col of columns.rows) {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    }
  }

  // Verify views
  const views = await db.execute(sql.raw(`
    SELECT table_name
    FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name IN ('system_templates', 'custom_templates');
  `));

  console.log(`\n✅ Views created: ${views.rows.length}`);
  for (const row of views.rows) {
    console.log(`   - ${row.table_name}`);
  }

} catch (error) {
  console.error('❌ Verification failed:', error);
  process.exit(1);
}

console.log('\n✅ Table recreation complete!');
process.exit(0);
