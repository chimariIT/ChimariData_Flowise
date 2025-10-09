/**
 * Billing Data Migration Script
 *
 * Migrates existing billing data from fragmented services to unified billing service
 *
 * Migration Steps:
 * 1. Backup existing billing data
 * 2. Initialize subscriptionBalances for all users
 * 3. Migrate legacy usage tracking to feature-based system
 * 4. Verify data integrity
 * 5. Generate migration report
 *
 * Usage:
 *   npx tsx server/scripts/migrate-billing-data.ts [--dry-run]
 */

import { db } from '../db';
import { users } from '../../shared/schema';
import { eq, sql, isNotNull } from 'drizzle-orm';
import { getBillingService } from '../services/billing/unified-billing-service';
import { SubscriptionTier } from '../../shared/canonical-types';

// Command line args
const isDryRun = process.argv.includes('--dry-run');

interface MigrationStats {
  totalUsers: number;
  usersProcessed: number;
  usersMigrated: number;
  usersSkipped: number;
  errors: Array<{ userId: string; error: string }>;
  backupPath?: string;
}

const stats: MigrationStats = {
  totalUsers: 0,
  usersProcessed: 0,
  usersMigrated: 0,
  usersSkipped: 0,
  errors: [],
};

/**
 * Main migration function
 */
async function migrateBillingData() {
  console.log('\n==============================================');
  console.log('BILLING DATA MIGRATION');
  console.log('==============================================\n');

  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('⚠️  PRODUCTION MODE - Database will be modified\n');
  }

  try {
    // Step 1: Backup existing data
    console.log('Step 1: Creating backup...');
    await createBackup();
    console.log('✅ Backup created\n');

    // Step 2: Get all users
    console.log('Step 2: Fetching users...');
    const allUsers = await db.select().from(users);
    stats.totalUsers = allUsers.length;
    console.log(`✅ Found ${stats.totalUsers} users\n`);

    // Step 3: Migrate each user
    console.log('Step 3: Migrating user data...');
    for (const user of allUsers) {
      await migrateUser(user);
    }
    console.log('✅ Migration complete\n');

    // Step 4: Verify data integrity
    console.log('Step 4: Verifying data integrity...');
    await verifyMigration();
    console.log('✅ Verification complete\n');

    // Step 5: Generate report
    console.log('Step 5: Generating report...');
    generateReport();

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Create backup of existing billing data
 */
async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `billing_backup_${timestamp}.json`;

  try {
    const billingData = await db.execute(sql`
      SELECT
        id,
        email,
        subscription_tier,
        subscription_status,
        stripe_customer_id,
        stripe_subscription_id,
        monthly_uploads,
        monthly_data_volume,
        monthly_ai_insights,
        monthly_analysis_components,
        monthly_visualizations,
        feature_consumption,
        subscription_balances,
        monthly_feature_usage,
        usage_reset_at
      FROM users
      WHERE subscription_tier IS NOT NULL
    `);

    if (!isDryRun) {
      const fs = await import('fs/promises');
      await fs.writeFile(
        `./backups/${backupFilename}`,
        JSON.stringify(billingData.rows, null, 2)
      );
      stats.backupPath = `./backups/${backupFilename}`;
      console.log(`   Backup saved to: ${stats.backupPath}`);
    } else {
      console.log(`   [DRY RUN] Would save backup to: ./backups/${backupFilename}`);
    }
  } catch (error: any) {
    console.error('   ⚠️  Backup creation failed:', error.message);
    // Continue migration even if backup fails (for dry run)
    if (!isDryRun) {
      throw error;
    }
  }
}

/**
 * Migrate individual user's billing data
 */
async function migrateUser(user: any) {
  stats.usersProcessed++;

  try {
    // Skip users who already have migrated data
    if (user.subscriptionBalances && Object.keys(user.subscriptionBalances).length > 0) {
      console.log(`   [${stats.usersProcessed}/${stats.totalUsers}] Skipping ${user.email} - already migrated`);
      stats.usersSkipped++;
      return;
    }

    console.log(`   [${stats.usersProcessed}/${stats.totalUsers}] Migrating ${user.email}...`);

    // Get tier configuration
    const billingService = getBillingService();
    const tier = (user.subscriptionTier || 'none') as SubscriptionTier;
    const tierConfig = billingService.getTierConfig(tier);

    if (!tierConfig) {
      console.log(`      ⚠️  Invalid tier: ${tier}, defaulting to 'none'`);
      stats.errors.push({ userId: user.id, error: `Invalid tier: ${tier}` });
      return;
    }

    // Initialize subscription balances based on tier
    const subscriptionBalances = initializeBalances(tierConfig);

    // Migrate legacy usage to feature-based system
    const featureConsumption = migrateLegacyUsage(user, tierConfig);

    // Calculate monthly feature usage
    const monthlyFeatureUsage = calculateMonthlyUsage(user);

    if (isDryRun) {
      console.log(`      [DRY RUN] Would update balances for tier: ${tier}`);
      console.log(`      [DRY RUN] Subscription balances:`, JSON.stringify(subscriptionBalances).substring(0, 100) + '...');
    } else {
      // Update user record
      await db.update(users)
        .set({
          subscriptionBalances,
          featureConsumption,
          monthlyFeatureUsage,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      console.log(`      ✅ Migrated successfully`);
    }

    stats.usersMigrated++;

  } catch (error: any) {
    console.error(`      ❌ Error migrating ${user.email}:`, error.message);
    stats.errors.push({ userId: user.id, error: error.message });
  }
}

/**
 * Initialize subscription balances based on tier configuration
 */
function initializeBalances(tierConfig: any) {
  const balances: any = {};

  // Initialize feature quotas
  Object.entries(tierConfig.quotas.featureQuotas).forEach(([featureId, quotas]: [string, any]) => {
    balances[featureId] = {};
    Object.entries(quotas).forEach(([complexity, limit]) => {
      balances[featureId][complexity] = {
        remaining: limit,
        used: 0,
        limit: limit,
      };
    });
  });

  return balances;
}

/**
 * Migrate legacy usage tracking to feature-based system
 */
function migrateLegacyUsage(user: any, tierConfig: any): any {
  const consumption: any = {};

  // Map legacy monthly uploads to data_upload feature
  if (user.monthlyUploads > 0) {
    consumption.data_upload = {
      small: {
        count: user.monthlyUploads,
        lastUsed: new Date(),
        totalCost: 0,
      },
    };
  }

  // Map legacy AI insights to ai_insights feature
  if (user.monthlyAIInsights > 0) {
    consumption.ai_insights = {
      small: {
        count: user.monthlyAIInsights,
        lastUsed: new Date(),
        totalCost: 0,
      },
    };
  }

  // Map legacy analysis components to statistical_analysis feature
  if (user.monthlyAnalysisComponents > 0) {
    consumption.statistical_analysis = {
      medium: {
        count: user.monthlyAnalysisComponents,
        lastUsed: new Date(),
        totalCost: 0,
      },
    };
  }

  // Map legacy visualizations to visualization feature
  if (user.monthlyVisualizations > 0) {
    consumption.visualization = {
      small: {
        count: user.monthlyVisualizations,
        lastUsed: new Date(),
        totalCost: 0,
      },
    };
  }

  return consumption;
}

/**
 * Calculate monthly feature usage summary
 */
function calculateMonthlyUsage(user: any): any {
  return {
    data_upload: {
      small: user.monthlyUploads || 0,
    },
    ai_insights: {
      small: user.monthlyAIInsights || 0,
    },
    statistical_analysis: {
      medium: user.monthlyAnalysisComponents || 0,
    },
    visualization: {
      small: user.monthlyVisualizations || 0,
    },
  };
}

/**
 * Verify migration data integrity
 */
async function verifyMigration() {
  const results = await db.execute(sql`
    SELECT
      subscription_tier,
      COUNT(*) as user_count,
      COUNT(CASE WHEN subscription_balances IS NOT NULL AND subscription_balances != '{}' THEN 1 END) as migrated_count
    FROM users
    WHERE subscription_tier IS NOT NULL
    GROUP BY subscription_tier
  `);

  console.log('\n   Migration Verification by Tier:');
  console.log('   ================================');

  for (const row of results.rows as any[]) {
    const tier = row.subscription_tier;
    const total = row.user_count;
    const migrated = row.migrated_count;
    const percentage = ((migrated / total) * 100).toFixed(1);

    console.log(`   ${tier.padEnd(15)} | ${migrated}/${total} (${percentage}%)`);
  }

  // Check for data anomalies
  const anomalies = await db.execute(sql`
    SELECT id, email, subscription_tier
    FROM users
    WHERE subscription_tier IS NOT NULL
      AND subscription_tier != 'none'
      AND (subscription_balances IS NULL OR subscription_balances = '{}')
  `);

  if (anomalies.rows.length > 0) {
    console.log('\n   ⚠️  Found users with missing balances:');
    for (const row of anomalies.rows as any[]) {
      console.log(`      - ${row.email} (${row.subscription_tier})`);
    }
  } else {
    console.log('\n   ✅ No data anomalies detected');
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  console.log('\n==============================================');
  console.log('MIGRATION REPORT');
  console.log('==============================================\n');

  console.log(`Total Users:       ${stats.totalUsers}`);
  console.log(`Users Processed:   ${stats.usersProcessed}`);
  console.log(`Users Migrated:    ${stats.usersMigrated}`);
  console.log(`Users Skipped:     ${stats.usersSkipped}`);
  console.log(`Errors:            ${stats.errors.length}`);

  if (stats.backupPath) {
    console.log(`\nBackup Location:   ${stats.backupPath}`);
  }

  if (stats.errors.length > 0) {
    console.log('\nErrors:');
    console.log('-------');
    stats.errors.forEach(({ userId, error }) => {
      console.log(`  User ID: ${userId}`);
      console.log(`  Error:   ${error}\n`);
    });
  }

  const successRate = ((stats.usersMigrated / stats.totalUsers) * 100).toFixed(1);
  console.log(`\nSuccess Rate:      ${successRate}%`);

  if (isDryRun) {
    console.log('\n⚠️  DRY RUN - No actual changes were made');
    console.log('   Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Migration completed successfully');
  }

  console.log('\n==============================================\n');
}

/**
 * Rollback migration (restore from backup)
 */
export async function rollbackMigration(backupPath: string) {
  console.log('\n==============================================');
  console.log('ROLLBACK MIGRATION');
  console.log('==============================================\n');

  try {
    const fs = await import('fs/promises');
    const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));

    console.log(`Restoring ${backupData.length} users from backup...`);

    let restored = 0;
    for (const userData of backupData) {
      await db.update(users)
        .set({
          subscriptionBalances: userData.subscription_balances,
          featureConsumption: userData.feature_consumption,
          monthlyFeatureUsage: userData.monthly_feature_usage,
          monthlyUploads: userData.monthly_uploads,
          monthlyDataVolume: userData.monthly_data_volume,
          monthlyAIInsights: userData.monthly_ai_insights,
          monthlyAnalysisComponents: userData.monthly_analysis_components,
          monthlyVisualizations: userData.monthly_visualizations,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id));

      restored++;
      if (restored % 10 === 0) {
        console.log(`   Restored ${restored}/${backupData.length} users...`);
      }
    }

    console.log(`\n✅ Rollback completed - ${restored} users restored`);

  } catch (error: any) {
    console.error('\n❌ Rollback failed:', error.message);
    throw error;
  }
}

// Create backups directory if it doesn't exist
async function ensureBackupDirectory() {
  try {
    const fs = await import('fs/promises');
    await fs.mkdir('./backups', { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore error
  }
}

// Run migration
if (require.main === module) {
  ensureBackupDirectory()
    .then(() => migrateBillingData())
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
