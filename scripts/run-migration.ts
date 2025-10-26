import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

async function runMigration() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  try {
    console.log('🔄 Running performance indexes migration...');

    // Run performance indexes migration (minimal safe version)
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '../migrations/008_performance_indexes_minimal.sql'),
      'utf-8'
    );

    await sql.unsafe(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('📊 Performance indexes created for optimized query performance');

  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();
