import { describe, it, expect, vi } from 'vitest';
import { resolveTierForStripeSync } from '../../server/services/stripe-tier-sync-helper';

describe('resolveTierForStripeSync', () => {
  it('returns existing database tier without seeding', async () => {
    const existingRecord = {
      id: 'starter',
      name: 'Starter',
      displayName: 'Starter',
      description: 'desc',
      monthlyPriceUsd: 2500,
      yearlyPriceUsd: 25000,
      stripeProductId: 'prod_123',
      stripeMonthlyPriceId: 'price_month_123',
      stripeYearlyPriceId: 'price_year_123',
      limits: { maxFiles: 10 },
      features: { dataTransformation: true },
      journeyPricing: {},
      overagePricing: {},
      discounts: {},
      compliance: {},
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const mockDb = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([existingRecord])
          })
        })
      })),
      insert: vi.fn(() => ({
        values: () => Promise.resolve()
      }))
    } as any;

    const result = await resolveTierForStripeSync('starter', mockDb);

    expect(result.source).toBe('database');
    expect(result.record).toEqual(existingRecord);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('seeds fallback tier when database record is missing', async () => {
    const insertValues = vi.fn(() => Promise.resolve());
    const mockDb = {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([])
          })
        })
      })),
      insert: vi.fn(() => ({
        values: insertValues
      }))
    } as any;

    const result = await resolveTierForStripeSync('trial', mockDb);

    expect(result.source).toBe('seeded_from_default');
    expect(result.record.id).toBe('trial');
    expect(result.record.monthlyPriceUsd).toBe(100); // 1 dollar -> 100 cents
    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});

