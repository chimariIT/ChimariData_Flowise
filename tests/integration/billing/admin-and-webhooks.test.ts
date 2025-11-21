import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRouter from '../../../server/routes/auth';
import adminBillingRouter from '../../../server/routes/admin-billing';
import stripeWebhookTestRouter from '../../../server/routes/stripe-webhook-test';
import { db } from '../../../server/db';
import { subscriptionTierPricing, users } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/auth', authRouter);
app.use('/api/admin/billing', adminBillingRouter);
app.use('/api/webhooks/stripe-test', stripeWebhookTestRouter);

describe('Billing Admin APIs & Stripe Webhook Diagnostics', () => {
  const nonAdminUser = {
    email: `billing-user-${Date.now()}@example.com`,
    password: 'BillingUser123!',
    firstName: 'Billing',
    lastName: 'User'
  };

  const adminUser = {
    email: `billing-admin-${Date.now()}@example.com`,
    password: 'BillingAdmin123!',
    firstName: 'Billing',
    lastName: 'Admin'
  };

  let adminToken: string;
  let userToken: string;
  let createdTierId: string | null = null;

  const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    // Register regular user
    const userRegister = await request(app)
      .post('/api/auth/register')
      .send(nonAdminUser);
    expect(userRegister.status).toBe(200);

    const userLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: nonAdminUser.email, password: nonAdminUser.password });
    expect(userLogin.status).toBe(200);
    userToken = userLogin.body.token;

    // Register admin user
    const adminRegister = await request(app)
      .post('/api/auth/register')
      .send(adminUser);
    expect(adminRegister.status).toBe(200);

    // Elevate to admin
    await db
      .update(users)
      .set({ role: 'admin', isAdmin: true })
      .where(eq(users.email, adminUser.email));

    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminUser.password });
    expect(adminLogin.status).toBe(200);
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    if (createdTierId) {
      await db
        .delete(subscriptionTierPricing)
        .where(eq(subscriptionTierPricing.id, createdTierId));
    }
  });

  it('exposes webhook config details when Stripe secrets are missing', async () => {
    const response = await request(app).get('/api/webhooks/stripe-test/config');

    expect(response.status).toBe(200);

    const { success, errors, config } = response.body;
    expect(Array.isArray(errors)).toBe(true);
    expect(config.environment).toBe(process.env.NODE_ENV || 'development');

    if (!process.env.STRIPE_SECRET_KEY) {
      expect(errors).toContain('STRIPE_SECRET_KEY not configured');
    } else {
      expect(config.stripeKeyConfigured).toBe(true);
    }

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      expect(errors).toContain('STRIPE_WEBHOOK_SECRET not configured');
    } else {
      expect(config.webhookSecretConfigured).toBe(true);
    }

    const expectedSuccess = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
    expect(success).toBe(expectedSuccess);
  });

  it('validates webhook simulation inputs and returns mock event payloads', async () => {
    const missingEvent = await request(app)
      .post('/api/webhooks/stripe-test/simulate')
      .send({});

    expect(missingEvent.status).toBe(400);
    expect(missingEvent.body.error).toBe('Missing required field: eventType');

    const simulated = await request(app)
      .post('/api/webhooks/stripe-test/simulate')
      .send({ eventType: 'invoice.paid' });

    expect(simulated.status).toBe(200);
    expect(simulated.body.success).toBe(true);
    expect(simulated.body.event.type).toBe('invoice.paid');
  });

  it('prevents non-admin users from accessing billing tiers', async () => {
    const response = await request(app)
      .get('/api/admin/billing/tiers')
      .set(authHeader(userToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toContain('Admin access required');
  });

  it('allows admin users to view tier definitions from the database', async () => {
    const response = await request(app)
      .get('/api/admin/billing/tiers')
      .set(authHeader(adminToken));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.tiers)).toBe(true);
  });

  it('enables admins to create and deactivate subscription tiers', async () => {
    createdTierId = `integration-tier-${Date.now()}`;

    const createResponse = await request(app)
      .post('/api/admin/billing/tiers')
      .set(authHeader(adminToken))
      .send({
        tier: {
          id: createdTierId,
          displayName: 'Integration Tier',
          monthlyPriceUsd: 25,
          yearlyPriceUsd: 250,
          description: 'Automated integration test tier',
          features: { support: 'email' },
          limits: { uploadsPerMonth: 25 }
        }
      });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.success).toBe(true);
    expect(createResponse.body.tier.id).toBe(createdTierId);

    const deleteResponse = await request(app)
      .delete(`/api/admin/billing/tiers/${createdTierId}`)
      .set(authHeader(adminToken));

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.tier.id).toBe(createdTierId);
    expect(deleteResponse.body.tier.isActive).toBe(false);
  });
});

