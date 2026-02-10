/**
 * Stripe Webhook Handler
 *
 * SECURITY FEATURES:
 * - Webhook signature verification (prevents replay attacks)
 * - Raw body parsing (Stripe requires raw buffer for signature verification)
 * - Transaction-safe database operations
 * - Idempotency handling (prevents duplicate processing)
 *
 * Stripe Webhook Events Handled:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.paid
 * - invoice.payment_failed
 * - payment_intent.succeeded
 * - payment_intent.payment_failed
 */

import * as expressModule from 'express';
import type _express from 'express';
const express: typeof _express = (expressModule as any).default || expressModule;
import type { Request, Response } from 'express';
import { getBillingService } from '../services/billing/unified-billing-service';

const router = express.Router();

/**
 * POST /api/webhooks/stripe
 *
 * IMPORTANT: This route requires raw body parsing
 * Configure in server/index.ts:
 *
 * app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
 * app.use(express.json()); // Other routes use JSON parsing
 */
router.post('/stripe', async (req: Request, res: Response) => {
  const signature = req.headers['stripe-signature'] as string;

  if (!signature) {
    console.error('Webhook Error: Missing stripe-signature header');
    return res.status(400).json({
      error: 'Missing signature',
      message: 'Stripe-Signature header is required for webhook verification',
    });
  }

  try {
    const billingService = getBillingService();

    // Verify and process webhook
    // SECURITY: This verifies the webhook came from Stripe using cryptographic signature
    const result = await billingService.handleWebhook(
      req.body, // Raw buffer (not parsed JSON)
      signature
    );

    if (!result.success) {
      console.error('Webhook processing failed:', result.error);
      return res.status(400).json({
        error: 'Webhook processing failed',
        message: result.error,
      });
    }

    // Return 200 to acknowledge receipt
    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);

    // Return 400 for signature verification failures
    if (error.message?.includes('signature')) {
      return res.status(400).json({
        error: 'Invalid signature',
        message: 'Webhook signature verification failed',
      });
    }

    // Return 500 for other errors
    res.status(500).json({
      error: 'Webhook processing error',
      message: error.message,
    });
  }
});

/**
 * GET /api/webhooks/stripe/test
 * Test endpoint to verify webhook configuration
 *
 * SECURITY: Protected with admin authentication
 */
router.get('/stripe/test', async (req: Request, res: Response) => {
  // Check if user is authenticated and is admin
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this endpoint',
    });
  }

  // Check admin role
  if (!(req.user as any).role || (req.user as any).role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'This endpoint is restricted to administrators',
    });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(500).json({
      error: 'Webhook secret not configured',
      message: 'STRIPE_WEBHOOK_SECRET environment variable is missing',
      instructions: [
        '1. Go to Stripe Dashboard > Developers > Webhooks',
        '2. Create a new webhook endpoint',
        '3. Copy the signing secret',
        '4. Add to .env: STRIPE_WEBHOOK_SECRET=whsec_...',
      ]
    });
  }

  res.json({
    configured: true,
    webhookSecretPrefix: webhookSecret.substring(0, 10) + '...',
    stripeKeyConfigured: !!process.env.STRIPE_SECRET_KEY,
    environment: process.env.NODE_ENV || 'development',
    instructions: {
      localTesting: [
        '1. Install Stripe CLI: https://stripe.com/docs/stripe-cli',
        '2. Login: stripe login',
        '3. Forward webhooks: stripe listen --forward-to localhost:5000/api/webhooks/stripe',
        '4. Use the webhook signing secret from CLI output',
      ],
      production: [
        '1. Deploy your application',
        '2. Go to Stripe Dashboard > Developers > Webhooks',
        '3. Add endpoint: https://yourdomain.com/api/webhooks/stripe',
        '4. Select events to listen for',
        '5. Copy signing secret to production environment',
      ],
    },
  });
});

export default router;
