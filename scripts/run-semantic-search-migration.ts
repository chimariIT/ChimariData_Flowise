/**
 * Run semantic search migration
 * Enables pgvector and adds embedding columns
 *
 * Run: npx tsx scripts/run-semantic-search-migration.ts
 */
import 'dotenv/config';

import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

interface ColumnInfo {
  data_type?: string;
  udt_name?: string;
}

async function getColumnInfo(tableName: string, columnName: string): Promise<ColumnInfo | null> {
  const result = await db.execute(sql`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = ${tableName}
      AND column_name = ${columnName}
  `);

  return result.rows?.[0] ?? null;
}

async function addEmbeddingColumn(tableName: string, vectorEnabled: boolean): Promise<boolean> {
  if (vectorEnabled) {
    await db.execute(sql.raw(`
      ALTER TABLE ${tableName}
      ADD COLUMN embedding vector(1536)
    `));
    console.log(`  ✅ Added embedding column to ${tableName} (vector)`);
    return true;
  }

  await db.execute(sql.raw(`
    ALTER TABLE ${tableName}
    ADD COLUMN embedding jsonb DEFAULT NULL
  `));
  console.log(`  ✅ Added embedding column to ${tableName} (JSONB fallback)`);
  return false;
}

async function convertEmbeddingToVector(tableName: string, columnName: string): Promise<boolean> {
  try {
    await db.execute(sql.raw(`
      ALTER TABLE ${tableName}
      ALTER COLUMN ${columnName} TYPE vector(1536)
      USING (
        CASE
          WHEN ${columnName} IS NULL THEN NULL
          ELSE (${columnName}::text)::vector
        END
      )
    `));
    console.log(`  ✅ Converted ${tableName}.${columnName} to vector(1536)`);
    return true;
  } catch (error: any) {
    console.error(`  ❌ Failed to convert ${tableName}.${columnName} to vector:`, error.message);
    console.error('  📋 Clean up invalid embeddings or drop the column before rerunning.');
    return false;
  }
}

async function ensureEmbeddingColumn(
  tableName: string,
  vectorEnabled: boolean
): Promise<boolean> {
  const columnInfo = await getColumnInfo(tableName, 'embedding');

  if (!columnInfo) {
    return addEmbeddingColumn(tableName, vectorEnabled);
  }

  if (!vectorEnabled) {
    return columnInfo.udt_name === 'vector';
  }

  if (columnInfo.udt_name === 'vector') {
    return true;
  }

  // Column exists but is not vector, attempt to convert
  return convertEmbeddingToVector(tableName, 'embedding');
}

async function ensureHnswIndex(tableName: string, indexName: string) {
  const indexExists = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = ${indexName}
    ) as exists
  `);

  if (indexExists.rows[0]?.exists) {
    console.log(`  ✅ ${indexName} already exists`);
    return;
  }

  await db.execute(sql.raw(`
    CREATE INDEX ${indexName}
    ON ${tableName}
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128)
  `));
  console.log(`  ✅ Created ${indexName}`);
}

async function runMigration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   Semantic Search Migration (pgvector + embeddings)        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (!db) {
    console.error('❌ Database connection not available');
    process.exit(1);
  }

  try {
    // Step 1: Check/enable pgvector extension
    console.log('🔄 Step 1: Enabling pgvector extension...');

    const extensionCheck = await db.execute(sql`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') as has_vector
    `);

    const hasVector = extensionCheck.rows[0]?.has_vector;

    if (!hasVector) {
      try {
        await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
        console.log('  ✅ Created pgvector extension');
      } catch (e: any) {
        if (e.message?.includes('permission denied') || e.message?.includes('insufficient privilege')) {
          console.log('  ⚠️  Cannot create pgvector extension - need superuser privileges');
          console.log('  📋 Ask database admin to run: CREATE EXTENSION vector;');
        } else if (e.message?.includes('not available') || e.message?.includes('control file')) {
          console.log('  ⚠️  pgvector extension not installed on PostgreSQL server');
          console.log('  📋 Install pgvector: https://github.com/pgvector/pgvector#installation');
        } else {
          console.log(`  ⚠️  pgvector error: ${e.message}`);
        }
        console.log('  📋 Continuing with JSONB fallback (in-memory similarity)...\n');
      }
    } else {
      console.log('  ✅ pgvector extension already exists');
    }

    // Re-check after potential creation
    const finalCheck = await db.execute(sql`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') as has_vector
    `);
    const vectorEnabled = finalCheck.rows[0]?.has_vector;

    if (!vectorEnabled) {
      console.log('\n⚠️  pgvector not available - embedding columns will be JSONB instead');
      console.log('   Semantic search will use in-memory cosine similarity (slower)\n');
    }

    // Step 2: Add embedding to business_definitions
    console.log('🔄 Step 2: Adding embedding column to business_definitions...');

    const bdEmbeddingExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'business_definitions' AND column_name = 'embedding'
      ) as exists
    `);

    const bdVectorReady = await ensureEmbeddingColumn('business_definitions', vectorEnabled);

    if (vectorEnabled && bdVectorReady) {
      await ensureHnswIndex('business_definitions', 'bd_embedding_hnsw_idx');
    }

    // Step 3: Check project_questions embedding
    console.log('🔄 Step 3: Checking project_questions embedding column...');

    const pqEmbeddingExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'project_questions' AND column_name = 'embedding'
      ) as exists
    `);

    let pqVectorReady = false;
    if (!pqEmbeddingExists.rows[0]?.exists) {
      console.log('  ⚠️  embedding column missing on project_questions - creating it now');
      pqVectorReady = await ensureEmbeddingColumn('project_questions', vectorEnabled);
    } else {
      pqVectorReady = await ensureEmbeddingColumn('project_questions', vectorEnabled);
    }

    // Count embeddings for visibility
    if (pqEmbeddingExists.rows[0]?.exists || pqVectorReady) {
      const embeddingCount = await db.execute(sql`
        SELECT COUNT(*) as count FROM project_questions WHERE embedding IS NOT NULL
      `);
      console.log(`  📊 project_questions rows with embeddings: ${embeddingCount.rows[0]?.count || 0}`);
    }

    if (vectorEnabled && pqVectorReady) {
      await ensureHnswIndex('project_questions', 'pq_embedding_hnsw_idx');
    }

    // Step 4: Check analysis_patterns
    console.log('🔄 Step 4: Checking analysis_patterns table...');

    const apTableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM pg_tables WHERE tablename = 'analysis_patterns'
      ) as exists
    `);

    if (apTableExists.rows[0]?.exists) {
      const apEmbeddingExists = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'analysis_patterns' AND column_name = 'embedding'
        ) as exists
      `);

      const apVectorReady = await ensureEmbeddingColumn('analysis_patterns', vectorEnabled);

      if (vectorEnabled && apVectorReady) {
        await ensureHnswIndex('analysis_patterns', 'ap_embedding_hnsw_idx');
      }
    } else {
      console.log('  ℹ️  analysis_patterns table does not exist (skipped)');
    }

    // Step 5: Ensure artifact_templates embedding
    console.log('🔄 Step 5: Checking artifact_templates embedding column...');

    const atVectorReady = await ensureEmbeddingColumn('artifact_templates', vectorEnabled);

    if (vectorEnabled && atVectorReady) {
      await ensureHnswIndex('artifact_templates', 'at_embedding_hnsw_idx');
    }

    // Final verification
    console.log('\n📊 Verification:');

    const verification = await db.execute(sql`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE column_name = 'embedding'
      ORDER BY table_name
    `);

    for (const row of verification.rows) {
      console.log(`  ✅ ${row.table_name}.${row.column_name}: ${row.data_type}`);
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Semantic Search Migration Completed Successfully!      ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
