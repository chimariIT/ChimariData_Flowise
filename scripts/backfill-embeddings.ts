/**
 * Backfill Embeddings Script
 *
 * Generates embeddings for existing business definitions, project questions,
 * and artifact templates that don't have embeddings yet.
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts [--definitions] [--questions] [--templates] [--batch=N]
 *
 * Options:
 *   --definitions   Only backfill business definitions (default: all types)
 *   --questions     Only backfill project questions (default: all types)
 *   --templates     Only backfill artifact templates (default: all types)
 *   --batch=N       Batch size for processing (default: 10)
 *   --dry-run       Count items without generating embeddings
 *   --all           Process all items (run multiple batches until complete)
 *
 * Examples:
 *   npx tsx scripts/backfill-embeddings.ts                    # Backfill all, batch of 10
 *   npx tsx scripts/backfill-embeddings.ts --definitions      # Only definitions
 *   npx tsx scripts/backfill-embeddings.ts --templates        # Only templates
 *   npx tsx scripts/backfill-embeddings.ts --batch=50 --all   # All items, batch of 50
 */

import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';
import { semanticSearchService } from '../server/services/semantic-search-service';

interface BackfillStats {
  definitions: { total: number; processed: number; failed: number };
  questions: { total: number; processed: number; failed: number };
  templates: { total: number; processed: number; failed: number };
}

async function countMissingEmbeddings(): Promise<{ definitions: number; questions: number; templates: number }> {
  const defCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM business_definitions WHERE embedding IS NULL
  `);

  const qCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM project_questions WHERE embedding IS NULL
  `);

  const templateCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM artifact_templates WHERE embedding IS NULL
  `);

  return {
    definitions: parseInt(defCount.rows[0]?.count as string || '0', 10),
    questions: parseInt(qCount.rows[0]?.count as string || '0', 10),
    templates: parseInt(templateCount.rows[0]?.count as string || '0', 10)
  };
}

async function backfillDefinitions(batchSize: number): Promise<{ processed: number; failed: number }> {
  return semanticSearchService.backfillDefinitionEmbeddings(batchSize);
}

async function backfillQuestions(batchSize: number): Promise<{ processed: number; failed: number }> {
  return semanticSearchService.backfillQuestionEmbeddings(batchSize);
}

async function backfillTemplates(batchSize: number): Promise<{ processed: number; failed: number }> {
  return semanticSearchService.backfillTemplateEmbeddings(batchSize);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Embedding Backfill Script                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Parse arguments
  const args = process.argv.slice(2);
  const doDefinitions = args.includes('--definitions') || (!args.includes('--questions') && !args.includes('--definitions') && !args.includes('--templates'));
  const doQuestions = args.includes('--questions') || (!args.includes('--questions') && !args.includes('--definitions') && !args.includes('--templates'));
  const doTemplates = args.includes('--templates') || (!args.includes('--questions') && !args.includes('--definitions') && !args.includes('--templates'));
  const processAll = args.includes('--all');
  const dryRun = args.includes('--dry-run');

  let batchSize = 10;
  const batchArg = args.find(a => a.startsWith('--batch='));
  if (batchArg) {
    batchSize = parseInt(batchArg.split('=')[1], 10) || 10;
  }

  // Initialize semantic search service
  console.log('🔄 Initializing semantic search service...');
  const initialized = await semanticSearchService.initialize();

  if (!initialized && !dryRun) {
    console.error('❌ Failed to initialize semantic search service. Check embedding service configuration.');
    process.exit(1);
  }

  // Count missing embeddings
  console.log('\n📊 Counting items without embeddings...');
  const counts = await countMissingEmbeddings();

  console.log(`\n📈 Missing Embeddings:`);
  console.log(`   Business Definitions: ${counts.definitions}`);
  console.log(`   Project Questions: ${counts.questions}`);
  console.log(`   Artifact Templates: ${counts.templates}`);
  console.log(`   Total: ${counts.definitions + counts.questions + counts.templates}`);

  if (dryRun) {
    console.log('\n✅ Dry run complete. No embeddings generated.');
    process.exit(0);
  }

  if (counts.definitions === 0 && counts.questions === 0 && counts.templates === 0) {
    console.log('\n✅ All items already have embeddings!');
    process.exit(0);
  }

  const stats: BackfillStats = {
    definitions: { total: counts.definitions, processed: 0, failed: 0 },
    questions: { total: counts.questions, processed: 0, failed: 0 },
    templates: { total: counts.templates, processed: 0, failed: 0 }
  };

  // Process definitions
  if (doDefinitions && counts.definitions > 0) {
    console.log(`\n🔄 Processing business definitions (batch size: ${batchSize})...`);

    let remaining = counts.definitions;

    do {
      const result = await backfillDefinitions(batchSize);
      stats.definitions.processed += result.processed;
      stats.definitions.failed += result.failed;
      remaining -= (result.processed + result.failed);

      console.log(`   Progress: ${stats.definitions.processed}/${stats.definitions.total} processed, ${stats.definitions.failed} failed`);

      // Add delay to avoid rate limiting
      if (processAll && remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (processAll && remaining > 0);
  }

  // Process questions
  if (doQuestions && counts.questions > 0) {
    console.log(`\n🔄 Processing project questions (batch size: ${batchSize})...`);

    let remaining = counts.questions;

    do {
      const result = await backfillQuestions(batchSize);
      stats.questions.processed += result.processed;
      stats.questions.failed += result.failed;
      remaining -= (result.processed + result.failed);

      console.log(`   Progress: ${stats.questions.processed}/${stats.questions.total} processed, ${stats.questions.failed} failed`);

      // Add delay to avoid rate limiting
      if (processAll && remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (processAll && remaining > 0);
  }

  // Process templates
  if (doTemplates && counts.templates > 0) {
    console.log(`\n🔄 Processing artifact templates (batch size: ${batchSize})...`);

    let remaining = counts.templates;

    do {
      const result = await backfillTemplates(batchSize);
      stats.templates.processed += result.processed;
      stats.templates.failed += result.failed;
      remaining -= (result.processed + result.failed);

      console.log(`   Progress: ${stats.templates.processed}/${stats.templates.total} processed, ${stats.templates.failed} failed`);

      if (processAll && remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } while (processAll && remaining > 0);
  }

  // Final summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                    Backfill Summary                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n📊 Business Definitions:`);
  console.log(`   Total: ${stats.definitions.total}`);
  console.log(`   Processed: ${stats.definitions.processed}`);
  console.log(`   Failed: ${stats.definitions.failed}`);
  console.log(`   Remaining: ${stats.definitions.total - stats.definitions.processed - stats.definitions.failed}`);

  console.log(`\n📊 Project Questions:`);
  console.log(`   Total: ${stats.questions.total}`);
  console.log(`   Processed: ${stats.questions.processed}`);
  console.log(`   Failed: ${stats.questions.failed}`);
  console.log(`   Remaining: ${stats.questions.total - stats.questions.processed - stats.questions.failed}`);

  console.log(`\n📊 Artifact Templates:`);
  console.log(`   Total: ${stats.templates.total}`);
  console.log(`   Processed: ${stats.templates.processed}`);
  console.log(`   Failed: ${stats.templates.failed}`);
  console.log(`   Remaining: ${stats.templates.total - stats.templates.processed - stats.templates.failed}`);

  // Cache stats
  const cacheStats = semanticSearchService.getCacheStats();
  console.log(`\n📦 Embedding Cache:`);
  console.log(`   Size: ${cacheStats.size}/${cacheStats.maxSize}`);
  console.log(`   TTL: ${cacheStats.ttlMinutes} minutes`);

  console.log('\n✅ Backfill complete!');

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
