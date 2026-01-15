/**
 * Database Cleanup Script
 *
 * This script cleans out old projects from the database to prepare for
 * the new 8-step consolidated journey flow.
 *
 * WARNING: This will DELETE ALL existing projects, datasets, and journey data.
 * Run with caution in development only.
 *
 * Usage:
 *   npx tsx scripts/cleanup-database.ts
 *   npx tsx scripts/cleanup-database.ts --dry-run  (preview only)
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../shared/schema';
import { sql } from 'drizzle-orm';

const isDryRun = process.argv.includes('--dry-run');

async function cleanupDatabase() {
  console.log('='.repeat(60));
  console.log('Database Cleanup Script');
  console.log('='.repeat(60));

  if (isDryRun) {
    console.log('\n*** DRY RUN MODE - No changes will be made ***\n');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  try {
    const client = neon(databaseUrl);
    const db = drizzle(client, { schema });

    console.log('Connected to database.\n');

    // Get counts before cleanup
    console.log('Current table counts:');

    const projectCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.projects);
    console.log(`  - projects: ${projectCount[0]?.count || 0}`);

    const datasetCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.datasets);
    console.log(`  - datasets: ${datasetCount[0]?.count || 0}`);

    const artifactCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.artifacts);
    console.log(`  - artifacts: ${artifactCount[0]?.count || 0}`);

    const analysisResultCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.analysisResults);
    console.log(`  - analysis_results: ${analysisResultCount[0]?.count || 0}`);

    if (isDryRun) {
      console.log('\n*** DRY RUN - Skipping actual deletion ***');
      console.log('\nTo perform cleanup, run without --dry-run flag.');
      return;
    }

    console.log('\nCleaning up tables...');

    // Delete in order respecting foreign key constraints
    console.log('  Deleting artifacts...');
    await db.delete(schema.artifacts);

    console.log('  Deleting analysis_results...');
    await db.delete(schema.analysisResults);

    console.log('  Deleting datasets...');
    await db.delete(schema.datasets);

    console.log('  Deleting projects...');
    await db.delete(schema.projects);

    console.log('\n✅ Cleanup complete!');

    // Verify cleanup
    console.log('\nVerifying cleanup:');
    const newProjectCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.projects);
    console.log(`  - projects: ${newProjectCount[0]?.count || 0}`);

    const newDatasetCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.datasets);
    console.log(`  - datasets: ${newDatasetCount[0]?.count || 0}`);

    const newArtifactCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.artifacts);
    console.log(`  - artifacts: ${newArtifactCount[0]?.count || 0}`);

    const newAnalysisResultCount = await db.select({ count: sql<number>`count(*)` })
      .from(schema.analysisResults);
    console.log(`  - analysis_results: ${newAnalysisResultCount[0]?.count || 0}`);

    console.log('\n' + '='.repeat(60));
    console.log('Database is now ready for the consolidated 8-step journey.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('ERROR during cleanup:', error);
    process.exit(1);
  }
}

cleanupDatabase().catch(console.error);
