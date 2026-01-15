import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

// Import db after environment is set
const { db } = await import('../server/db.js');
const { sql } = await import('drizzle-orm');

async function checkArtifactTemplatesSchema() {
  console.log('🔍 Checking artifact_templates table schema...\n');

  try {
    // Get column information from database
    const columns = await db.execute(sql`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'artifact_templates'
      ORDER BY ordinal_position
    `);

    console.log(`📊 artifact_templates table columns in DATABASE:\n`);
    console.table((columns.rows as any[]).map((c: any) => ({
      column: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable,
      default: c.column_default || '-'
    })));

    // Check what shared/schema.ts defines
    console.log('\n📋 Comparing with shared/schema.ts definition...\n');

    const schemaColumns = [
      'id',
      'title',          // Note: NOT 'name'
      'summary',
      'journey_type',
      'industry',
      'persona',
      'primary_agent',
      'default_confidence',
      'expected_artifacts',
      'communication_style',
      'steps',
      'is_system',
      'created_by',
      'created_at',
      'updated_at'
    ];

    const dbColumns = new Set((columns.rows as any[]).map((c: any) => c.column_name));

    console.log('🔍 Columns in DATABASE but NOT in schema.ts:');
    const extraInDb: string[] = [];
    dbColumns.forEach(col => {
      if (!schemaColumns.includes(col)) {
        extraInDb.push(col);
      }
    });
    if (extraInDb.length > 0) {
      extraInDb.forEach(col => console.log(`   ❌ ${col}`));
    } else {
      console.log('   ✅ None');
    }

    console.log('\n🔍 Columns in schema.ts but NOT in database:');
    const missingInDb: string[] = [];
    schemaColumns.forEach(col => {
      if (!dbColumns.has(col)) {
        missingInDb.push(col);
      }
    });
    if (missingInDb.length > 0) {
      missingInDb.forEach(col => console.log(`   ❌ ${col}`));
    } else {
      console.log('   ✅ None');
    }

    // Check NOT NULL constraints
    console.log('\n🔍 NOT NULL columns in database:');
    const notNullCols = (columns.rows as any[])
      .filter((c: any) => c.is_nullable === 'NO')
      .map((c: any) => c.column_name);

    notNullCols.forEach(col => {
      const inSchema = schemaColumns.includes(col);
      console.log(`   ${inSchema ? '✅' : '❌'} ${col} ${inSchema ? '(in schema)' : '(NOT in schema)'}`);
    });

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to check schema:', error.message);
    process.exit(1);
  }
}

checkArtifactTemplatesSchema();
