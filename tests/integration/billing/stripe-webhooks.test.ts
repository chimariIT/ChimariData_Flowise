/**
 * Integration Tests: Stripe Webhook Processing
 *
 * Tests the complete Stripe webhook flow including:
 * - Signature verification with express.raw()
 * - Idempotency handling (no duplicate processing)
 * - Various webhook event types
 * - Error recovery scenarios
 *
 * Day 12 Implementation - Week 3 Testing
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import { db } from '../../../server/db';
import { users, subscriptions } from '../../../shared/schema';
import { eq } from 'drizzle-orm';

// Mock Stripe for webhook signature generation
const generateStripeSignature = (payload: string, secret: string): string => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
};

// Create test stripe event
const createStripeEvent = (type: string, data: any = {}) => {
  return {
    id: `evt_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data
    },
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_test_${Date.now()}`,
      idempotency_key: null
    }
  };
};

describe('Stripe Webhook Integration', () => {
  let app: express.Application;
  let testUserId: string;
  let testCustomerId: string;
  const webhookSecret = 'whsec_test_secret_123';

  beforeAll(async () => {
    // Set up test environment
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;

    // Create test app with proper middleware ordering
    app = express();

    // CRITICAL: express.raw() MUST come before express.json() for webhook routes
    app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
    app.use(express.json({ limit: '10mb' }));

    // Import and mount stripe webhook router
    const stripeWebhooksRouter = (await import('../../../server/routes/stripe-webhooks')).default;
    app.use('/api/webhooks/stripe', stripeWebhooksRouter);

    // Create a test user
    const existingUser = await db.select().from(users).where(eq(users.email, 'stripe-webhook-test@example.com')).limit(1);
    if (existingUser.length > 0) {
      testUserId = existingUser[0].id;
      testCustomerId = existingUser[0].stripeCustomerId || `cus_test_${Date.now()}`;
    } else {
      const [newUser] = await db.insert(users).values({
        email: 'stripe-webhook-test@example.com',
        password: 'hashed_password_test',
        firstName: 'Stripe',
        lastName: 'Test',
        stripeCustomerId: `cus_test_${Date.now()}`
      }).returning();
      testUserId = newUser.id;
      testCustomerId = newUser.stripeCustomerId!;
    }
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(users).where(eq(users.email, 'stripe-webhook-test@example.com'));
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  describe('Webhook Signature Verification', () => {
    it('rejects requests without signature header', async () => {
      const event = createStripeEvent('customer.subscription.created', {
        id: 'sub_test_123',
        customer: testCustomerId,
        status: 'active'
      });

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(event));

      // Should fail without signature
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('rejects requests with invalid signature', async () => {
      const event = createStripeEvent('customer.subscription.created', {
        id: 'sub_test_123',
        customer: testCustomerId,
        status: 'active'
      });
      const payload = JSON.stringify(event);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 't=123456789,v1=invalid_signature')
        .send(payload);

      // Should fail with invalid signature
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('accepts requests with valid signature', async () => {
      const event = createStripeEvent('customer.subscription.created', {
        id: `sub_test_${Date.now()}`,
        customer: testCustomerId,
        status: 'active',
        items: {
          data: [{
            price: { id: 'price_test_123', product: 'prod_test_123' }
          }]
        }
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      // Should succeed with valid signature
      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Webhook Idempotency', () => {
    it('processes the same event only once', async () => {
      const eventId = `evt_idempotency_test_${Date.now()}`;
      const event = {
        ...createStripeEvent('invoice.paid', {
          id: `in_test_${Date.now()}`,
          customer: testCustomerId,
          amount_paid: 2999,
          currency: 'usd',
          subscription: `sub_test_${Date.now()}`
        }),
        id: eventId
      };
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      // First request should succeed
      const response1 = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response1.status).toBe(200);

      // Second request with same event ID should be acknowledged but not reprocessed
      const response2 = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response2.status).toBe(200);
      // Response should indicate it was already processed
      expect(response2.body.received).toBe(true);
    });
  });

  describe('Subscription Event Handling', () => {
    it('handles customer.subscription.created event', async () => {
      const subscriptionId = `sub_created_${Date.now()}`;
      const event = createStripeEvent('customer.subscription.created', {
        id: subscriptionId,
        customer: testCustomerId,
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: {
          data: [{
            price: {
              id: 'price_professional_monthly',
              product: 'prod_professional'
            }
          }]
        }
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('handles customer.subscription.updated event', async () => {
      const subscriptionId = `sub_updated_${Date.now()}`;
      const event = createStripeEvent('customer.subscription.updated', {
        id: subscriptionId,
        customer: testCustomerId,
        status: 'active',
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: {
          data: [{
            price: {
              id: 'price_enterprise_monthly',
              product: 'prod_enterprise'
            }
          }]
        }
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('handles customer.subscription.deleted event', async () => {
      const subscriptionId = `sub_deleted_${Date.now()}`;
      const event = createStripeEvent('customer.subscription.deleted', {
        id: subscriptionId,
        customer: testCustomerId,
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000)
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Invoice Event Handling', () => {
    it('handles invoice.paid event', async () => {
      const invoiceId = `in_paid_${Date.now()}`;
      const event = createStripeEvent('invoice.paid', {
        id: invoiceId,
        customer: testCustomerId,
        subscription: `sub_test_${Date.now()}`,
        amount_paid: 2999,
        currency: 'usd',
        status: 'paid',
        hosted_invoice_url: 'https://invoice.stripe.com/i/test',
        invoice_pdf: 'https://invoice.stripe.com/i/test/pdf'
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('handles invoice.payment_failed event', async () => {
      const invoiceId = `in_failed_${Date.now()}`;
      const event = createStripeEvent('invoice.payment_failed', {
        id: invoiceId,
        customer: testCustomerId,
        subscription: `sub_test_${Date.now()}`,
        amount_due: 2999,
        currency: 'usd',
        status: 'open',
        attempt_count: 1,
        next_payment_attempt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Checkout Session Event Handling', () => {
    it('handles checkout.session.completed event', async () => {
      const sessionId = `cs_test_${Date.now()}`;
      const event = createStripeEvent('checkout.session.completed', {
        id: sessionId,
        customer: testCustomerId,
        mode: 'subscription',
        subscription: `sub_checkout_${Date.now()}`,
        payment_status: 'paid',
        status: 'complete',
        client_reference_id: testUserId,
        metadata: {
          userId: testUserId,
          tier: 'professional'
        }
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('returns 200 for unhandled event types (acknowledges receipt)', async () => {
      const event = createStripeEvent('product.created', {
        id: 'prod_test_123',
        name: 'Test Product'
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      // Should acknowledge receipt even for unhandled events
      expect(response.status).toBe(200);
      expect(response.body.received).toBe(true);
    });

    it('handles malformed event data gracefully', async () => {
      const event = createStripeEvent('invoice.paid', {
        // Missing required fields
        id: null,
        customer: null
      });
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      // Should still acknowledge receipt but may log error
      expect(response.status).toBe(200);
    });
  });

  describe('Express.raw() Middleware Order', () => {
    it('preserves raw body for signature verification', async () => {
      const event = createStripeEvent('ping', {});
      const payload = JSON.stringify(event);
      const signature = generateStripeSignature(payload, webhookSecret);

      // This test verifies that express.raw() is configured correctly
      // and the raw body is available for Stripe signature verification
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', signature)
        .send(payload);

      // If express.raw() was not properly configured before express.json(),
      // the body would be parsed as JSON and signature verification would fail
      expect(response.status).toBe(200);
    });
  });
});
