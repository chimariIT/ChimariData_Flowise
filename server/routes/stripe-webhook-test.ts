/**
 * Stripe Webhook Testing & Validation
 *
 * This module provides comprehensive testing and validation for Stripe webhooks
 * including signature verification, event simulation, and diagnostics.
 *
 * IMPORTANT: Some endpoints should be disabled or protected in production!
 */

import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getBillingService } from '../services/billing/unified-billing-service';

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2025-08-27.basil';

const router = express.Router();

// Initialize Stripe (if available)
let stripe: Stripe | null = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
  });
}

/**
 * GET /api/webhooks/stripe-test/config
 * Check webhook configuration status
 */
router.get('/config', async (req: Request, res: Response) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  const config = {
    environment: process.env.NODE_ENV || 'development',
    webhookSecretConfigured: !!webhookSecret,
    webhookSecretPrefix: webhookSecret ? webhookSecret.substring(0, 10) + '...' : 'NOT_SET',
    stripeKeyConfigured: !!stripeKey,
    stripeKeyPrefix: stripeKey ? stripeKey.substring(0, 10) + '...' : 'NOT_SET',
    timestamp: new Date().toISOString(),
  };

  const recommendations: string[] = [];
  const errors: string[] = [];

  if (!webhookSecret) {
    errors.push('STRIPE_WEBHOOK_SECRET not configured');
    recommendations.push('Set STRIPE_WEBHOOK_SECRET in your .env file');
  }

  if (!stripeKey) {
    errors.push('STRIPE_SECRET_KEY not configured');
    recommendations.push('Set STRIPE_SECRET_KEY in your .env file');
  }

  res.json({
    success: errors.length === 0,
    config,
    errors,
    recommendations,
    setup_instructions: {
      development: [
        '1. Install Stripe CLI: https://stripe.com/docs/stripe-cli',
        '2. Login: stripe login',
        '3. Forward webhooks: stripe listen --forward-to localhost:5000/api/webhooks/stripe',
        '4. Copy the webhook signing secret from CLI output',
        '5. Add to .env: STRIPE_WEBHOOK_SECRET=whsec_...',
      ],
      production: [
        '1. Deploy your application',
        '2. Go to Stripe Dashboard > Developers > Webhooks',
        '3. Add endpoint: https://yourdomain.com/api/webhooks/stripe',
        '4. Select events: customer.subscription.*, invoice.*, payment_intent.*',
        '5. Copy signing secret to production environment',
      ],
    },
  });
});

/**
 * POST /api/webhooks/stripe-test/simulate
 * Simulate webhook events for testing
 *
 * WARNING: Disable in production or add admin authentication
 */
router.post('/simulate', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Webhook simulation is disabled in production',
      message: 'Use Stripe CLI or real webhooks in production',
    });
  }

  const { eventType, customerId, subscriptionId } = req.body;

  if (!eventType) {
    return res.status(400).json({
      error: 'Missing required field: eventType',
      validEventTypes: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
      ],
    });
  }

  try {
    const billingService = getBillingService();

    // Create mock event data based on event type
    let mockEvent: any;

    switch (eventType) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: subscriptionId || 'sub_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              status: 'active',
              items: {
                data: [{
                  price: {
                    id: 'price_test_professional',
                    product: 'prod_test_professional',
                  },
                }],
              },
              current_period_start: Math.floor(Date.now() / 1000),
              current_period_end: Math.floor(Date.now() / 1000) + 2592000, // 30 days
              cancel_at_period_end: false,
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      case 'customer.subscription.deleted':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: subscriptionId || 'sub_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              status: 'canceled',
              canceled_at: Math.floor(Date.now() / 1000),
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      case 'invoice.paid':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: 'in_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              subscription: subscriptionId || 'sub_test_' + Date.now(),
              amount_paid: 4900, // $49.00
              currency: 'usd',
              status: 'paid',
              paid: true,
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      case 'invoice.payment_failed':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: 'in_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              subscription: subscriptionId || 'sub_test_' + Date.now(),
              amount_due: 4900,
              currency: 'usd',
              status: 'open',
              paid: false,
              attempt_count: 1,
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      case 'payment_intent.succeeded':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: 'pi_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              amount: 4900,
              currency: 'usd',
              status: 'succeeded',
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      case 'payment_intent.payment_failed':
        mockEvent = {
          id: 'evt_test_' + Date.now(),
          type: eventType,
          data: {
            object: {
              id: 'pi_test_' + Date.now(),
              customer: customerId || 'cus_test_' + Date.now(),
              amount: 4900,
              currency: 'usd',
              status: 'requires_payment_method',
              last_payment_error: {
                message: 'Your card was declined.',
              },
            },
          },
          created: Math.floor(Date.now() / 1000),
        };
        break;

      default:
        return res.status(400).json({
          error: 'Unsupported event type',
          eventType,
        });
    }

    // Process the simulated event (bypass signature verification for test)
    console.log(`🧪 Simulating webhook event: ${eventType}`);

    // NOTE: In real implementation, you'd call the webhook handler
    // For now, just return the mock event
    res.json({
      success: true,
      message: 'Webhook event simulated',
      event: mockEvent,
      note: 'This is a simulated event for testing purposes',
      warning: 'Actual webhook processing bypassed - integrate with handleWebhook() for full test',
    });

  } catch (error: any) {
    console.error('Webhook simulation error:', error);
    res.status(500).json({
      error: 'Simulation failed',
      message: error.message,
    });
  }
});

/**
 * POST /api/webhooks/stripe-test/verify-signature
 * Test webhook signature verification without processing the event
 */
router.post('/verify-signature', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({
      success: false,
      error: 'Webhook secret not configured',
      recommendation: 'Set STRIPE_WEBHOOK_SECRET in .env',
    });
  }

  if (!signature) {
    return res.status(400).json({
      success: false,
      error: 'Missing stripe-signature header',
      recommendation: 'Include Stripe-Signature header in request',
    });
  }

  try {
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Attempt to construct and verify the event
    const event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );

    res.json({
      success: true,
      message: 'Signature verification successful',
      event: {
        id: event.id,
        type: event.type,
        created: event.created,
        livemode: event.livemode,
      },
      signature: {
        header: signature.substring(0, 20) + '...',
        verified: true,
      },
    });

  } catch (error: any) {
    console.error('Signature verification failed:', error);

    let errorType = 'unknown';
    let recommendation = 'Check your webhook secret and request payload';

    if (error.message?.includes('signature')) {
      errorType = 'invalid_signature';
      recommendation = 'Verify STRIPE_WEBHOOK_SECRET matches your Stripe dashboard';
    } else if (error.message?.includes('timestamp')) {
      errorType = 'timestamp_mismatch';
      recommendation = 'Check server clock synchronization';
    }

    res.status(400).json({
      success: false,
      error: 'Signature verification failed',
      errorType,
      errorMessage: error.message,
      recommendation,
    });
  }
});

/**
 * GET /api/webhooks/stripe-test/diagnostics
 * Comprehensive webhook diagnostics
 */
router.get('/diagnostics', async (req: Request, res: Response) => {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks: {},
  };

  // Check 1: Stripe SDK initialization
  diagnostics.checks.stripeSDK = {
    initialized: !!stripe,
  version: STRIPE_API_VERSION,
    status: stripe ? 'ready' : 'not_initialized',
  };

  // Check 2: Environment variables
  diagnostics.checks.environment = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'SET' : 'MISSING',
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'MISSING',
    STRIPE_PUBLISHABLE_KEY: process.env.VITE_STRIPE_PUBLIC_KEY ? 'SET' : 'MISSING',
  };

  // Check 3: Billing service
  try {
    const billingService = getBillingService();
    diagnostics.checks.billingService = {
      initialized: true,
      status: 'ready',
    };
  } catch (error: any) {
    diagnostics.checks.billingService = {
      initialized: false,
      status: 'error',
      error: error.message,
    };
  }

  // Check 4: Webhook endpoint accessibility
  const webhookEndpoint = process.env.WEBHOOK_URL || `${req.protocol}://${req.get('host')}/api/webhooks/stripe`;
  diagnostics.checks.webhookEndpoint = {
    url: webhookEndpoint,
    accessible: 'unknown', // Would need actual HTTP check
    note: 'Test accessibility manually or configure health check',
  };

  // Check 5: Stripe API connectivity (if key is available)
  if (stripe) {
    try {
      // Test API connection by retrieving account info
      const account = await stripe.accounts.retrieve();
      diagnostics.checks.stripeAPI = {
        connected: true,
        accountId: account.id,
        country: account.country,
        currency: account.default_currency,
      };
    } catch (error: any) {
      diagnostics.checks.stripeAPI = {
        connected: false,
        error: error.message,
        type: error.type,
      };
    }
  } else {
    diagnostics.checks.stripeAPI = {
      connected: false,
      error: 'Stripe not initialized',
    };
  }

  // Overall health assessment
  const allChecks = Object.values(diagnostics.checks);
  const failedChecks = allChecks.filter((check: any) =>
    check.status === 'error' ||
    check.initialized === false ||
    check.connected === false
  );

  diagnostics.overall = {
    status: failedChecks.length === 0 ? 'healthy' : 'issues_detected',
    passedChecks: allChecks.length - failedChecks.length,
    failedChecks: failedChecks.length,
    totalChecks: allChecks.length,
  };

  res.json(diagnostics);
});

/**
 * GET /api/webhooks/stripe-test/events
 * List recent webhook events from Stripe (requires Stripe API key)
 *
 * WARNING: Protect this endpoint in production
 */
router.get('/events', async (req: Request, res: Response) => {
  if (!stripe) {
    return res.status(500).json({
      error: 'Stripe not initialized',
      message: 'STRIPE_SECRET_KEY not configured',
    });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const events = await stripe.events.list({
      limit,
      types: [
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.paid',
        'invoice.payment_failed',
        'payment_intent.succeeded',
        'payment_intent.payment_failed',
      ],
    });

    res.json({
      success: true,
      count: events.data.length,
      hasMore: events.has_more,
      events: events.data.map(event => ({
        id: event.id,
        type: event.type,
        created: new Date(event.created * 1000).toISOString(),
        livemode: event.livemode,
        data: event.data.object,
      })),
    });

  } catch (error: any) {
    console.error('Failed to retrieve Stripe events:', error);
    res.status(500).json({
      error: 'Failed to retrieve events',
      message: error.message,
      type: error.type,
    });
  }
});

export default router;
