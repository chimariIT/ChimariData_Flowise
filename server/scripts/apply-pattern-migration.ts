// Apply analysis patterns migration manually
import * as dotenvModule from 'dotenv';
const dotenv = (dotenvModule as any).default || dotenvModule;
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

// Now import database after environment is set
const { db } = await import('../db.ts');
const { sql } = await import('drizzle-orm');

if (!db) {
  console.error('❌ Database connection failed');
  process.exit(1);
}

console.log('✅ Database connected');

// Read the SQL migration file
const migrationPath = resolve(__dirname, '../../migrations/010_add_analysis_patterns_tables.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('📄 Running migration: 010_add_analysis_patterns_tables.sql');

try {
  await db.execute(sql.raw(migrationSQL));
  console.log('✅ Migration executed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
}

// Verify tables exist
try {
  const result = await db.execute(sql.raw(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('analysis_patterns', 'analysis_pattern_sources', 'template_patterns')
    ORDER BY table_name;
  `));

  console.log('\n✅ Tables created:');
  for (const row of result.rows) {
    console.log(`   - ${row.table_name}`);
  }

  if (result.rows.length < 3) {
    console.warn('\n⚠️  Warning: Not all expected tables were created');
    console.log('   Expected: analysis_patterns, analysis_pattern_sources, template_patterns');
    console.log(`   Found: ${result.rows.map((r: any) => r.table_name).join(', ')}`);
  }
} catch (error) {
  console.error('❌ Table verification failed:', error);
  process.exit(1);
}

console.log('\n✅ Migration complete!');
process.exit(0);
