/**
 * Integration Tests: Usage Tracking
 *
 * Tests the UnifiedBillingService usage tracking with real database
 *
 * REQUIRES: DATABASE_URL environment variable
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getFlexibleDatabase } from '../../../server/db-flexible';
import { users } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { getBillingService } from '../../../server/services/billing/unified-billing-service';
import { randomUUID } from 'crypto';

// Skip if no database URL configured
const DATABASE_URL = process.env.DATABASE_URL;
const skipTests = !DATABASE_URL;

describe.skipIf(skipTests)('Usage Tracking Integration', () => {
  let testUserId: string;
  let billingService: ReturnType<typeof getBillingService>;
  let db: any;

  beforeAll(async () => {
    db = await getFlexibleDatabase();
    billingService = getBillingService();
  });

  beforeEach(async () => {
    // Create test user with professional tier
    testUserId = randomUUID();
    await db.insert(users).values({
      id: testUserId,
      email: `test-billing-${testUserId}@example.com`,
      subscriptionTier: 'professional',
      subscriptionStatus: 'active',
    });
  });

  afterAll(async () => {
    // Cleanup test users
    await db.delete(users).where(eq(users.email, `test-billing-${testUserId}@example.com`));
  });

  describe('trackFeatureUsage', () => {
    test('tracks usage within quota successfully', async () => {
      const result = await billingService.trackFeatureUsage(
        testUserId,
        'data_upload',
        'small',
        10
      );

      expect(result.allowed).toBe(true);
      expect(result.cost).toBe(0); // Within quota
      expect(result.remainingQuota).toBeGreaterThan(0);
    });

    test('increments usage counter atomically', async () => {
      // First usage
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 10);

      // Second usage
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 5);

      // Check total usage
      const [user] = await db.select().from(users).where(eq(users.id, testUserId));
      const balances = user.subscriptionBalances as any;

      expect(balances.data_upload.small.used).toBe(15);
    });

    test('calculates overage cost when quota exceeded', async () => {
      // Use up most of quota (professional tier has 500 small data uploads)
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 495);

      // This should trigger overage (5 + 10 = 515, exceeding 500)
      const result = await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 20);

      expect(result.allowed).toBe(true); // Still allowed but costs money
      expect(result.cost).toBeGreaterThan(0); // Should have overage cost
      expect(result.remainingQuota).toBe(0);
      expect(result.message).toContain('Overage');
    });

    test('handles unlimited quota (-1) correctly', async () => {
      // Create enterprise user with unlimited quota
      const enterpriseUserId = randomUUID();
      await db.insert(users).values({
        id: enterpriseUserId,
        email: `test-enterprise-${enterpriseUserId}@example.com`,
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });

      // Use massive amount
      const result = await billingService.trackFeatureUsage(
        enterpriseUserId,
        'data_upload',
        'small',
        1000000
      );

      expect(result.allowed).toBe(true);
      expect(result.cost).toBe(0); // No cost for unlimited
      expect(result.remainingQuota).toBe(-1); // Still unlimited

      // Cleanup
      await db.delete(users).where(eq(users.id, enterpriseUserId));
    });

    test('rejects usage for unavailable feature', async () => {
      const result = await billingService.trackFeatureUsage(
        testUserId,
        'nonexistent_feature',
        'small',
        1
      );

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('not available');
    });

    test('handles invalid user gracefully', async () => {
      const fakeUserId = randomUUID();

      const result = await billingService.trackFeatureUsage(
        fakeUserId,
        'data_upload',
        'small',
        1
      );

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('User not found');
    });
  });

  describe('getQuotaStatus', () => {
    test('returns correct quota status', async () => {
      // Track some usage
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 100);

      const status = await billingService.getQuotaStatus(testUserId, 'data_upload', 'small');

      expect(status).not.toBeNull();
      expect(status!.used).toBe(100);
      expect(status!.remaining).toBeGreaterThan(0);
      expect(status!.percentUsed).toBeGreaterThan(0);
      expect(status!.percentUsed).toBeLessThan(100);
      expect(status!.isExceeded).toBe(false);
    });

    test('shows quota exceeded when limit reached', async () => {
      // Use entire quota
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 500);

      const status = await billingService.getQuotaStatus(testUserId, 'data_upload', 'small');

      expect(status!.remaining).toBe(0);
      expect(status!.percentUsed).toBe(100);
      expect(status!.isExceeded).toBe(true);
    });

    test('returns null for nonexistent user', async () => {
      const status = await billingService.getQuotaStatus(randomUUID(), 'data_upload', 'small');

      expect(status).toBeNull();
    });
  });

  describe('getUsageMetrics', () => {
    test('returns comprehensive usage metrics', async () => {
      // Track various features
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 10);
      await billingService.trackFeatureUsage(testUserId, 'statistical_analysis', 'medium', 5);
      await billingService.trackFeatureUsage(testUserId, 'visualization', 'small', 20);

      const metrics = await billingService.getUsageMetrics(testUserId);

      expect(metrics).not.toBeNull();
      expect(metrics!.userId).toBe(testUserId);
      expect(metrics!.featureUsage.data_upload.small).toBe(10);
      expect(metrics!.featureUsage.statistical_analysis.medium).toBe(5);
      expect(metrics!.featureUsage.visualization.small).toBe(20);
      expect(metrics!.costBreakdown.baseSubscription).toBeGreaterThan(0);
    });

    test('includes billing period information', async () => {
      const metrics = await billingService.getUsageMetrics(testUserId);

      expect(metrics!.billingPeriod.start).toBeInstanceOf(Date);
      expect(metrics!.billingPeriod.end).toBeInstanceOf(Date);
      expect(metrics!.billingPeriod.end.getTime()).toBeGreaterThan(metrics!.billingPeriod.start.getTime());
    });
  });

  describe('resetMonthlyQuotas', () => {
    test('resets all quotas to tier defaults', async () => {
      // Use some quota
      await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 100);
      await billingService.trackFeatureUsage(testUserId, 'statistical_analysis', 'medium', 20);

      // Verify usage
      let status = await billingService.getQuotaStatus(testUserId, 'data_upload', 'small');
      expect(status!.used).toBe(100);

      // Reset
      const result = await billingService.resetMonthlyQuotas(testUserId);

      expect(result.success).toBe(true);

      // Verify reset
      status = await billingService.getQuotaStatus(testUserId, 'data_upload', 'small');
      expect(status!.used).toBe(0);
      expect(status!.remaining).toBe(status!.quota);
    });

    test('resets legacy usage counters', async () => {
      // Set some legacy usage
      await db.update(users)
        .set({
          monthlyUploads: 50,
          monthlyDataVolume: 1000,
          monthlyAIInsights: 30,
        })
        .where(eq(users.id, testUserId));

      // Reset
      await billingService.resetMonthlyQuotas(testUserId);

      // Verify
      const [user] = await db.select().from(users).where(eq(users.id, testUserId));
      expect(user.monthlyUploads).toBe(0);
      expect(user.monthlyDataVolume).toBe(0);
      expect(user.monthlyAIInsights).toBe(0);
    });

    test('handles nonexistent user gracefully', async () => {
      const result = await billingService.resetMonthlyQuotas(randomUUID());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Concurrent Usage Tracking', () => {
    test('handles concurrent requests atomically', async () => {
      // Simulate 10 concurrent requests
      const requests = Array.from({ length: 10 }, () =>
        billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 1)
      );

      const results = await Promise.all(requests);

      // All should succeed
      results.forEach(result => {
        expect(result.allowed).toBe(true);
      });

      // Total usage should be exactly 10
      const [user] = await db.select().from(users).where(eq(users.id, testUserId));
      const balances = user.subscriptionBalances as any;
      expect(balances.data_upload.small.used).toBe(10);
    });
  });

  describe('Feature Complexity Integration', () => {
    test('uses correct complexity tier for pricing', async () => {
      // Small complexity (cheap)
      const result1 = await billingService.trackFeatureUsage(testUserId, 'data_upload', 'small', 600); // Over quota
      const smallOverageCost = result1.cost;

      // Reset
      await billingService.resetMonthlyQuotas(testUserId);

      // Large complexity (expensive)
      const result2 = await billingService.trackFeatureUsage(testUserId, 'data_upload', 'large', 15); // Over quota (10 limit)
      const largeOverageCost = result2.cost;

      // Large should cost more than small
      expect(largeOverageCost).toBeGreaterThan(smallOverageCost);
    });
  });
});
