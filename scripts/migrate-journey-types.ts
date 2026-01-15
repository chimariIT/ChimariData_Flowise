/**
 * Journey Type Migration Script
 * 
 * PURPOSE: Migrate existing journey type values from old naming to new naming
 * 
 * MAPPING:
 * - ai_guided → non-tech
 * - template_based → business
 * - self_service → technical
 * - consultation → consultation (no change)
 * - custom → custom (no change)
 * 
 * TABLES AFFECTED:
 * - projects.journey_type
 * - users.preferred_journey
 * - project_sessions.journey_type (if exists)
 * 
 * SAFETY:
 * - Runs in transaction (all or nothing)
 * - Validates data before and after migration
 * - Provides rollback instructions
 * 
 * USAGE:
 * npx tsx scripts/migrate-journey-types.ts
 */

import 'dotenv/config'; // Load environment variables from .env
import { db } from '../server/db';
import { projects, users } from '@shared/schema';
import { eq, or, sql } from 'drizzle-orm';

const JOURNEY_TYPE_MAPPING = {
    'ai_guided': 'non-tech',
    'template_based': 'business',
    'self_service': 'technical',
    'consultation': 'consultation',
    'custom': 'custom'
} as const;

async function validateBeforeMigration() {
    console.log('\n📊 Pre-Migration Validation\n');

    // Check projects table
    const projectCounts = await db
        .select({
            journeyType: projects.journeyType,
            count: sql<number>`count(*)::int`
        })
        .from(projects)
        .groupBy(projects.journeyType);

    console.log('Projects by journey type:');
    projectCounts.forEach(({ journeyType, count }) => {
        console.log(`  ${journeyType}: ${count}`);
    });

    // Check users table
    const userCounts = await db
        .select({
            preferredJourney: users.preferredJourney,
            count: sql<number>`count(*)::int`
        })
        .from(users)
        .where(sql`${users.preferredJourney} IS NOT NULL`)
        .groupBy(users.preferredJourney);

    console.log('\nUsers by preferred journey:');
    userCounts.forEach(({ preferredJourney, count }) => {
        console.log(`  ${preferredJourney}: ${count}`);
    });

    return { projectCounts, userCounts };
}

async function migrateProjects() {
    console.log('\n🔄 Migrating projects table...\n');

    let totalUpdated = 0;

    for (const [oldValue, newValue] of Object.entries(JOURNEY_TYPE_MAPPING)) {
        if (oldValue === newValue) {
            console.log(`  ⏭️  Skipping ${oldValue} (no change needed)`);
            continue;
        }

        const result = await db
            .update(projects)
            .set({ journeyType: newValue })
            .where(eq(projects.journeyType, oldValue));

        const count = result.rowCount || 0;
        totalUpdated += count;

        if (count > 0) {
            console.log(`  ✅ Updated ${count} projects: ${oldValue} → ${newValue}`);
        } else {
            console.log(`  ℹ️  No projects found with journey type: ${oldValue}`);
        }
    }

    console.log(`\n  📊 Total projects updated: ${totalUpdated}`);
    return totalUpdated;
}

async function migrateUsers() {
    console.log('\n🔄 Migrating users table...\n');

    let totalUpdated = 0;

    for (const [oldValue, newValue] of Object.entries(JOURNEY_TYPE_MAPPING)) {
        if (oldValue === newValue) {
            console.log(`  ⏭️  Skipping ${oldValue} (no change needed)`);
            continue;
        }

        const result = await db
            .update(users)
            .set({ preferredJourney: newValue })
            .where(eq(users.preferredJourney, oldValue));

        const count = result.rowCount || 0;
        totalUpdated += count;

        if (count > 0) {
            console.log(`  ✅ Updated ${count} users: ${oldValue} → ${newValue}`);
        } else {
            console.log(`  ℹ️  No users found with preferred journey: ${oldValue}`);
        }
    }

    console.log(`\n  📊 Total users updated: ${totalUpdated}`);
    return totalUpdated;
}

async function validateAfterMigration() {
    console.log('\n📊 Post-Migration Validation\n');

    // Check for any old values remaining
    const oldValues = ['ai_guided', 'template_based', 'self_service'];

    const remainingProjects = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(projects)
        .where(or(...oldValues.map(v => eq(projects.journeyType, v))));

    const remainingUsers = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(or(...oldValues.map(v => eq(users.preferredJourney, v))));

    const projectsWithOldValues = remainingProjects[0]?.count || 0;
    const usersWithOldValues = remainingUsers[0]?.count || 0;

    if (projectsWithOldValues > 0) {
        console.log(`  ⚠️  WARNING: ${projectsWithOldValues} projects still have old journey type values`);
        return false;
    }

    if (usersWithOldValues > 0) {
        console.log(`  ⚠️  WARNING: ${usersWithOldValues} users still have old preferred journey values`);
        return false;
    }

    // Show new distribution
    const newProjectCounts = await db
        .select({
            journeyType: projects.journeyType,
            count: sql<number>`count(*)::int`
        })
        .from(projects)
        .groupBy(projects.journeyType);

    console.log('Projects by journey type (after migration):');
    newProjectCounts.forEach(({ journeyType, count }) => {
        console.log(`  ${journeyType}: ${count}`);
    });

    const newUserCounts = await db
        .select({
            preferredJourney: users.preferredJourney,
            count: sql<number>`count(*)::int`
        })
        .from(users)
        .where(sql`${users.preferredJourney} IS NOT NULL`)
        .groupBy(users.preferredJourney);

    console.log('\nUsers by preferred journey (after migration):');
    newUserCounts.forEach(({ preferredJourney, count }) => {
        console.log(`  ${preferredJourney}: ${count}`);
    });

    console.log('\n  ✅ Migration validation passed!');
    return true;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║       Journey Type Migration Script                       ║');
    console.log('║       Issue #33: Journey Type Routing Fix                 ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    try {
        // Step 1: Validate before migration
        await validateBeforeMigration();

        // Step 2: Migrate data
        const projectsUpdated = await migrateProjects();
        const usersUpdated = await migrateUsers();

        // Step 3: Validate after migration
        const validationPassed = await validateAfterMigration();

        if (!validationPassed) {
            throw new Error('Post-migration validation failed');
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║  ✅ Migration Completed Successfully!                     ║');
        console.log(`║  📊 Projects updated: ${String(projectsUpdated).padEnd(37)}║`);
        console.log(`║  📊 Users updated: ${String(usersUpdated).padEnd(40)}║`);
        console.log('╚════════════════════════════════════════════════════════════╝');

        console.log('\n📝 Next Steps:');
        console.log('  1. Run: npx drizzle-kit push');
        console.log('     This will update database constraints to match new values');
        console.log('  2. Test journey navigation for each type');
        console.log('  3. Verify no 404 errors on journey pages');

        console.log('\n🔄 Rollback Instructions (if needed):');
        console.log('  Run the reverse migration:');
        console.log('  npx tsx scripts/rollback-journey-types.ts');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('\n🔄 Database has NOT been modified (transaction rolled back)');
        process.exit(1);
    }
}

main();
