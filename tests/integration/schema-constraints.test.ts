/**
 * Integration Tests: Database Schema Constraints
 *
 * Tests that database-level constraints from Phase 1 migration are enforced:
 * - Enum check constraints (canonical types)
 * - Foreign key constraints with cascade
 * - NOT NULL constraints
 * - Business logic constraints
 *
 * These tests require a real PostgreSQL database connection.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../server/db';
import { users, projects } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// Skip if no database URL configured
const DATABASE_URL = process.env.DATABASE_URL;
const skipTests = !DATABASE_URL;

describe.skipIf(skipTests)('Schema Constraints - Users Table', () => {
  let testUserId: string;

  beforeEach(async () => {
    testUserId = randomUUID();
  });

  afterAll(async () => {
    // Cleanup: Delete all test users
    await db.delete(users).where(eq(users.email, 'test@example.com'));
  });

  describe('Subscription Tier Enum Constraint', () => {
    test('accepts valid subscription tier values', async () => {
      const validTiers = ['none', 'trial', 'starter', 'professional', 'enterprise'];

      for (const tier of validTiers) {
        const userId = randomUUID();
        await expect(
          db.insert(users).values({
            id: userId,
            email: `test-${tier}@example.com`,
            subscriptionTier: tier as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(users).where(eq(users.id, userId));
      }
    });

    test('rejects invalid subscription tier values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-invalid-tier-${uniqueUserId}@example.com`,
          subscriptionTier: 'invalid_tier' as any,
        })
      ).rejects.toThrow(/subscription_tier_check|violates check constraint/);
    });
  });

  describe('Subscription Status Enum Constraint', () => {
    test('accepts valid subscription status values', async () => {
      const validStatuses = ['inactive', 'active', 'past_due', 'cancelled', 'expired'];

      for (const status of validStatuses) {
        const userId = randomUUID();
        await expect(
          db.insert(users).values({
            id: userId,
            email: `test-${status}@example.com`,
            subscriptionStatus: status as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(users).where(eq(users.id, userId));
      }
    });

    test('rejects invalid subscription status values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-invalid-status-${uniqueUserId}@example.com`,
          subscriptionStatus: 'invalid_status' as any,
        })
      ).rejects.toThrow(/subscription_status_check|violates check constraint/);
    });
  });

  describe('User Role Enum Constraint', () => {
    test('accepts valid user role values', async () => {
      const validRoles = ['non-tech', 'business', 'technical', 'consultation'];

      for (const role of validRoles) {
        const userId = randomUUID();
        await expect(
          db.insert(users).values({
            id: userId,
            email: `test-${role}@example.com`,
            userRole: role as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(users).where(eq(users.id, userId));
      }
    });

    test('rejects invalid user role values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-invalid-role-${uniqueUserId}@example.com`,
          userRole: 'invalid_role' as any,
        })
      ).rejects.toThrow(/user_role_check|violates check constraint/);
    });
  });

  describe('Technical Level Enum Constraint', () => {
    test('accepts valid technical level values', async () => {
      const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];

      for (const level of validLevels) {
        const userId = randomUUID();
        await expect(
          db.insert(users).values({
            id: userId,
            email: `test-${level}@example.com`,
            technicalLevel: level as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(users).where(eq(users.id, userId));
      }
    });

    test('rejects invalid technical level values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-invalid-level-${uniqueUserId}@example.com`,
          technicalLevel: 'invalid_level' as any,
        })
      ).rejects.toThrow(/technical_level_check|violates check constraint/);
    });
  });

  describe('Preferred Journey Enum Constraint', () => {
    test('accepts valid journey type values', async () => {
      const validJourneys = ['ai_guided', 'template_based', 'self_service', 'consultation'];

      for (const journey of validJourneys) {
        const userId = randomUUID();
        await expect(
          db.insert(users).values({
            id: userId,
            email: `test-${journey}@example.com`,
            preferredJourney: journey as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(users).where(eq(users.id, userId));
      }
    });

    test('accepts NULL preferred journey', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-null-journey-${uniqueUserId}@example.com`,
          preferredJourney: null as any,
        })
      ).resolves.not.toThrow();

      // Cleanup
      await db.delete(users).where(eq(users.id, uniqueUserId));
    });

    test('rejects invalid journey type values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-invalid-journey-${uniqueUserId}@example.com`,
          preferredJourney: 'invalid_journey' as any,
        })
      ).rejects.toThrow(/preferred_journey_check|violates check constraint/);
    });
  });

  describe('Usage Non-Negative Constraint', () => {
    test('accepts non-negative usage values', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-usage-${uniqueUserId}@example.com`,
          monthlyUploads: 10,
          monthlyDataVolume: 500,
          monthlyAIInsights: 20,
        })
      ).resolves.not.toThrow();

      // Cleanup
      await db.delete(users).where(eq(users.id, uniqueUserId));
    });

    test('rejects negative monthly uploads', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-negative-uploads-${uniqueUserId}@example.com`,
          monthlyUploads: -1,
        })
      ).rejects.toThrow(/usage_non_negative|violates check constraint/);
    });

    test('rejects negative monthly data volume', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-negative-volume-${uniqueUserId}@example.com`,
          monthlyDataVolume: -100,
        })
      ).rejects.toThrow(/usage_non_negative|violates check constraint/);
    });

    test('rejects negative monthly AI insights', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-negative-insights-${uniqueUserId}@example.com`,
          monthlyAIInsights: -5,
        })
      ).rejects.toThrow(/usage_non_negative|violates check constraint/);
    });
  });

  describe('NOT NULL Constraints', () => {
    test('subscription tier cannot be NULL', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-null-tier-${uniqueUserId}@example.com`,
          subscriptionTier: null as any,
        })
      ).rejects.toThrow(/null value|not-null constraint/);
    });

    test('user role cannot be NULL', async () => {
      const uniqueUserId = randomUUID();
      await expect(
        db.insert(users).values({
          id: uniqueUserId,
          email: `test-null-role-${uniqueUserId}@example.com`,
          userRole: null as any,
        })
      ).rejects.toThrow(/null value|not-null constraint/);
    });
  });
});

describe.skipIf(skipTests)('Schema Constraints - Projects Table', () => {
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    // Create a test user for foreign key tests
    testUserId = randomUUID();
    await db.insert(users).values({
      id: testUserId,
      email: 'project-test@example.com',
    });
  });

  afterAll(async () => {
    // Cleanup: Delete test user (cascade will delete projects)
    await db.delete(users).where(eq(users.id, testUserId));
  });

  beforeEach(() => {
    testProjectId = randomUUID();
  });

  describe('Project Status Enum Constraint', () => {
    test('accepts valid project status values', async () => {
      const validStatuses = [
        'draft', 'uploading', 'processing', 'pii_review', 'ready',
        'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled'
      ];

      for (const status of validStatuses) {
        const projectId = randomUUID();
        await expect(
          db.insert(projects).values({
            id: projectId,
            userId: testUserId,
            ownerId: testUserId,
            name: `Test Project ${status}`,
            status: status as any,
            journeyType: 'ai_guided',
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(projects).where(eq(projects.id, projectId));
      }
    });

    test('rejects invalid project status values', async () => {
      await expect(
        db.insert(projects).values({
          id: testProjectId,
          userId: testUserId,
          ownerId: testUserId,
          name: 'Test Project',
          status: 'invalid_status' as any,
          journeyType: 'ai_guided',
        })
      ).rejects.toThrow(/project_status_check|violates check constraint/);
    });
  });

  describe('Journey Type Enum Constraint', () => {
    test('accepts valid journey type values', async () => {
      const validJourneys = ['ai_guided', 'template_based', 'self_service', 'consultation'];

      for (const journey of validJourneys) {
        const projectId = randomUUID();
        await expect(
          db.insert(projects).values({
            id: projectId,
            userId: testUserId,
            ownerId: testUserId,
            name: `Test Project ${journey}`,
            journeyType: journey as any,
          })
        ).resolves.not.toThrow();

        // Cleanup
        await db.delete(projects).where(eq(projects.id, projectId));
      }
    });

    test('rejects invalid journey type values', async () => {
      await expect(
        db.insert(projects).values({
          id: testProjectId,
          userId: testUserId,
          ownerId: testUserId,
          name: 'Test Project',
          journeyType: 'invalid_journey' as any,
        })
      ).rejects.toThrow(/project_journey_type_check|violates check constraint/);
    });

    test('journey type cannot be NULL', async () => {
      await expect(
        db.insert(projects).values({
          id: testProjectId,
          userId: testUserId,
          ownerId: testUserId,
          name: 'Test Project',
          journeyType: null as any,
        })
      ).rejects.toThrow(/null value|not-null constraint/);
    });
  });

  describe('Foreign Key Constraint - Cascade Delete', () => {
    test('rejects project with non-existent owner', async () => {
      const fakeOwnerId = randomUUID();

      await expect(
        db.insert(projects).values({
          id: testProjectId,
          userId: fakeOwnerId,
          ownerId: fakeOwnerId,
          name: 'Orphaned Project',
          journeyType: 'ai_guided',
        })
      ).rejects.toThrow(/foreign key|violates/);
    });

    test('cascades delete when user is deleted', async () => {
      // Create a temporary user and project
      const tempUserId = randomUUID();
      const tempProjectId = randomUUID();

      await db.insert(users).values({
        id: tempUserId,
        email: `temp-cascade-${tempUserId}@example.com`,
      });

      await db.insert(projects).values({
        id: tempProjectId,
        userId: tempUserId,
        ownerId: tempUserId,
        name: 'Cascade Test Project',
        journeyType: 'ai_guided',
      });

      // Verify project exists
      const projectsBefore = await db.select().from(projects).where(eq(projects.id, tempProjectId));
      expect(projectsBefore).toHaveLength(1);

      // Delete user
      await db.delete(users).where(eq(users.id, tempUserId));

      // Verify project was cascaded
      const projectsAfter = await db.select().from(projects).where(eq(projects.id, tempProjectId));
      expect(projectsAfter).toHaveLength(0);
    });
  });

  describe('NOT NULL Constraints', () => {
    test('status cannot be NULL', async () => {
      await expect(
        db.insert(projects).values({
          id: testProjectId,
          ownerId: testUserId,
          name: 'Test Project',
          journeyType: 'ai_guided',
          status: null as any,
        })
      ).rejects.toThrow(/null value|not-null constraint/);
    });
  });
});

describe.skipIf(skipTests)('Performance Benchmarks - Index Usage', () => {
  test('user role and status index exists', async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'user_role_status_idx'
    `);

    expect(result.rows).toHaveLength(1);
  });

  test('subscription tier and status index exists', async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'subscription_tier_status_idx'
    `);

    expect(result.rows).toHaveLength(1);
  });

  test('project owner status index exists', async () => {
    const result = await db.execute(sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'projects' AND indexname = 'project_owner_status_idx'
    `);

    expect(result.rows).toHaveLength(1);
  });
});

describe.skipIf(skipTests)('Constraint Verification', () => {
  test('subscription tier check constraint exists', async () => {
    const result = await db.execute(sql`
      SELECT conname FROM pg_constraint
      WHERE conname = 'subscription_tier_check' AND conrelid = 'users'::regclass
    `);

    expect(result.rows).toHaveLength(1);
  });

  test('project status check constraint exists', async () => {
    const result = await db.execute(sql`
      SELECT conname FROM pg_constraint
      WHERE conname = 'project_status_check' AND conrelid = 'projects'::regclass
    `);

    expect(result.rows).toHaveLength(1);
  });

  test('foreign key constraint exists on projects.owner_id', async () => {
    const result = await db.execute(sql`
      SELECT conname FROM pg_constraint
      WHERE conname = 'projects_user_id_fk' AND conrelid = 'projects'::regclass
    `);

    expect(result.rows).toHaveLength(1);
  });
});
