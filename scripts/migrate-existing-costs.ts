import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
dotenv.config({ path: resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found');
  process.exit(1);
}

console.log('✅ Environment loaded');

// Import db after environment is set
const { db } = await import('../server/db.js');
const { sql } = await import('drizzle-orm');

/**
 * Migrate Existing Project Costs to 3-Table Architecture
 *
 * This script:
 * 1. Finds all projects with cost data in old fields
 * 2. Creates project_cost_tracking records
 * 3. Creates cost_line_items for existing costs
 * 4. Validates migration
 */
async function migrateExistingCosts() {
  console.log('🔄 Starting migration of existing project costs...\n');

  try {
    // 1. Find all projects with cost tracking data
    const projectsWithCosts = await db.execute(sql`
      SELECT
        p.id,
        p.user_id,
        p.journey_type,
        COALESCE(p.locked_cost_estimate, '0') as locked_cost_estimate,
        p.total_cost_incurred,
        p.cost_breakdown,
        p.created_at,
        COALESCE(u.subscription_tier, 'trial') as subscription_tier
      FROM projects p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.total_cost_incurred IS NOT NULL
        AND p.total_cost_incurred::text != '0'
        AND p.total_cost_incurred::text != ''
      ORDER BY p.created_at DESC
    `);

    console.log(`📊 Found ${projectsWithCosts.rows.length} projects with existing cost data\n`);

    if (projectsWithCosts.rows.length === 0) {
      console.log('✅ No projects to migrate');
      process.exit(0);
    }

    let migratedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const row of projectsWithCosts.rows as any[]) {
      try {
        const projectId = row.id;
        const userId = row.user_id;
        const journeyType = row.journey_type;
        const totalIncurred = parseFloat(row.total_cost_incurred || '0');
        const lockedEstimate = parseFloat(row.locked_cost_estimate || '0');
        const costBreakdown = row.cost_breakdown || { breakdown: {} };
        const subscriptionTier = row.subscription_tier || 'trial';

        // Check if already migrated
        const existing = await db.execute(sql`
          SELECT id FROM project_cost_tracking
          WHERE project_id = ${projectId}
          LIMIT 1
        `);

        if (existing.rows.length > 0) {
          console.log(`   ⏭️  Skipped project ${projectId} (already migrated)`);
          skippedCount++;
          continue;
        }

        console.log(`   🔄 Migrating project ${projectId}...`);

        // Extract category costs from breakdown
        const breakdown = costBreakdown.breakdown || {};
        const dataProcessingCost = Math.round((breakdown.data_processing || 0) * 100);
        const aiQueryCost = Math.round(((breakdown.ai_insights || 0) + (breakdown.ai_query || 0)) * 100);
        const analysisExecutionCost = Math.round(((breakdown.analysis_execution || 0) + (breakdown.analysis_components || 0)) * 100);
        const visualizationCost = Math.round(((breakdown.visualizations || 0) + (breakdown.visualization || 0)) * 100);
        const exportCost = Math.round((breakdown.export || 0) * 100);
        const collaborationCost = Math.round((breakdown.collaboration || 0) * 100);
        const totalCost = Math.round(totalIncurred * 100);

        const now = new Date();
        const periodStart = row.created_at || now;
        const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        // 2. Create project_cost_tracking record
        await db.execute(sql`
          INSERT INTO project_cost_tracking (
            id, project_id, user_id,
            data_processing_cost, ai_query_cost, analysis_execution_cost,
            visualization_cost, export_cost, collaboration_cost, total_cost,
            journey_type, subscription_tier, billing_cycle,
            period_start, period_end, created_at, updated_at
          ) VALUES (
            ${nanoid()}, ${projectId}, ${userId},
            ${dataProcessingCost}, ${aiQueryCost}, ${analysisExecutionCost},
            ${visualizationCost}, ${exportCost}, ${collaborationCost}, ${totalCost},
            ${journeyType}, ${subscriptionTier}, 'monthly',
            ${periodStart}, ${periodEnd}, ${now}, ${now}
          )
        `);

        // 3. Create cost line items for each category with costs
        const lineItems: Array<{category: string; cost: number; description: string}> = [];

        if (dataProcessingCost > 0) {
          lineItems.push({
            category: 'data_processing',
            cost: dataProcessingCost,
            description: 'Migrated: Data processing costs'
          });
        }

        if (aiQueryCost > 0) {
          lineItems.push({
            category: 'ai_query',
            cost: aiQueryCost,
            description: 'Migrated: AI insights and query costs'
          });
        }

        if (analysisExecutionCost > 0) {
          lineItems.push({
            category: 'analysis_execution',
            cost: analysisExecutionCost,
            description: 'Migrated: Analysis execution costs'
          });
        }

        if (visualizationCost > 0) {
          lineItems.push({
            category: 'visualization',
            cost: visualizationCost,
            description: 'Migrated: Visualization costs'
          });
        }

        if (exportCost > 0) {
          lineItems.push({
            category: 'export',
            cost: exportCost,
            description: 'Migrated: Export costs'
          });
        }

        if (collaborationCost > 0) {
          lineItems.push({
            category: 'collaboration',
            cost: collaborationCost,
            description: 'Migrated: Collaboration costs'
          });
        }

        // Insert line items
        for (const item of lineItems) {
          await db.execute(sql`
            INSERT INTO cost_line_items (
              id, project_id, user_id, category, description,
              unit_cost, quantity, total_cost,
              pricing_tier_id, pricing_rule_id,
              metadata, incurred_at
            ) VALUES (
              ${nanoid()}, ${projectId}, ${userId}, ${item.category}, ${item.description},
              ${item.cost}, 1, ${item.cost},
              ${subscriptionTier}, ${item.category},
              ${'{"migrated": true, "migration_date": "' + now.toISOString() + '"}'}::jsonb,
              ${periodStart}
            )
          `);
        }

        console.log(`      ✅ Created tracking record with ${lineItems.length} line items`);
        migratedCount++;

      } catch (error: any) {
        console.error(`      ❌ Failed to migrate project ${row.id}:`, error.message);
        errorCount++;
      }
    }

    // 4. Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount} projects`);
    console.log(`   ⏭️  Skipped: ${skippedCount} projects (already migrated)`);
    console.log(`   ❌ Errors: ${errorCount} projects`);
    console.log('='.repeat(60) + '\n');

    // 5. Validation
    console.log('🔍 Validating migration...\n');

    const validationResult = await db.execute(sql`
      SELECT
        COUNT(DISTINCT pct.project_id) as migrated_projects,
        COUNT(cli.id) as total_line_items,
        SUM(pct.total_cost) / 100.0 as total_migrated_cost
      FROM project_cost_tracking pct
      LEFT JOIN cost_line_items cli ON cli.project_id = pct.project_id
    `);

    const validation = validationResult.rows[0] as any;
    console.log(`📊 Validation Results:`);
    console.log(`   Projects with tracking records: ${validation.migrated_projects || 0}`);
    console.log(`   Total line items created: ${validation.total_line_items || 0}`);
    console.log(`   Total migrated cost: $${parseFloat(validation.total_migrated_cost || '0').toFixed(2)}`);

    console.log('\n✅ Migration complete!');
    process.exit(0);

  } catch (error: any) {
    console.error('❌ Fatal error during migration:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrateExistingCosts();
