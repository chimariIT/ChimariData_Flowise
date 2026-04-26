# Stripe Webhook Cloud Validation

This runbook validates that Stripe webhooks are verified with real signatures in a production-like cloud environment.

## Goal

Confirm all of the following in your target environment:

1. `stripe-signature` verification is active.
2. Signed events update project payment state correctly.
3. Event traces are visible for audit/debugging.

## Required Environment Variables

Set these in your cloud runtime before testing:

- `STRIPE_SECRET_KEY` (`sk_test_...` or `sk_live_...`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`)
- `BASE_URL` or `PUBLIC_APP_URL` (for redirect URLs)

## Canonical Webhook Endpoint

Use this endpoint as primary:

- `POST /api/payment/webhook`

Compatibility alias is still available:

- `POST /api/v1/billing/stripe/webhook`

## Step 1: Check Runtime Readiness

Use an admin token and call:

```bash
curl -H "Authorization: Bearer <ADMIN_JWT>" \
  https://<your-api-domain>/api/payment/webhook/diagnostics
```

Expected:

- `stripeConfigured: true`
- `webhookSecretConfigured: true`
- `signatureValidationEnabled: true`

## Step 2: Stripe CLI Signed Replay (Staging or Production-like)

Start forwarding with Stripe CLI:

```bash
stripe listen --forward-to https://<your-api-domain>/api/payment/webhook
```

The CLI prints a signing secret (`whsec_...`). For local test environments, use this as `STRIPE_WEBHOOK_SECRET`.

Trigger signed test events:

```bash
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

## Step 3: Live Signed Event Validation

In Stripe Dashboard for your target mode (test/live):

1. Create/update webhook endpoint to `https://<your-api-domain>/api/payment/webhook`.
2. Subscribe to:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
3. Copy endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.

Then generate real activity (checkout/payment) and verify delivery succeeded in Stripe Dashboard.

## Step 4: Validate Event Trace + Payment State

Call diagnostics again:

```bash
curl -H "Authorization: Bearer <ADMIN_JWT>" \
  https://<your-api-domain>/api/payment/webhook/diagnostics
```

Check:

- `recentProjectWebhookActivity[].lastWebhookEventType`
- `recentProjectWebhookActivity[].lastWebhookEventId`
- `recentProjectWebhookActivity[].tracePreview`
- `recentProjectWebhookActivity[].paymentStatus`

## Pass Criteria

Validation is complete when:

1. Signed events are accepted (2xx) and invalid signatures are rejected (400).
2. Project payment state reflects event outcomes.
3. Diagnostics endpoint shows recent webhook trace activity.
