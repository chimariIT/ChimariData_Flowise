# Stripe Webhook Testing & Validation Guide

Complete guide for testing and validating Stripe webhook integration in the Chimari Data Platform.

---

## Quick Start

### 1. Check Configuration

```bash
curl http://localhost:5000/api/webhooks/stripe-test/config
```

**Expected Response:**
```json
{
  "success": true,
  "config": {
    "environment": "development",
    "webhookSecretConfigured": true,
    "stripeKeyConfigured": true
  }
}
```

### 2. Run Diagnostics

```bash
curl http://localhost:5000/api/webhooks/stripe-test/diagnostics
```

**Checks:**
- ✅ Stripe SDK initialization
- ✅ Environment variables
- ✅ Billing service connectivity
- ✅ Webhook endpoint accessibility
- ✅ Stripe API connection

---

## Development Testing (Using Stripe CLI)

### Step 1: Install Stripe CLI

**macOS/Linux:**
```bash
brew install stripe/stripe-cli/stripe
```

**Windows:**
```powershell
scoop install stripe
```

Or download from: https://stripe.com/docs/stripe-cli

### Step 2: Login to Stripe

```bash
stripe login
```

This opens your browser to authorize the CLI with your Stripe account.

### Step 3: Forward Webhooks to Local Server

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

**Expected Output:**
```
Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxxxx
```

### Step 4: Set Webhook Secret

Copy the signing secret from Step 3 and add to `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxx
```

Restart your server to load the new environment variable.

### Step 5: Trigger Test Events

In a new terminal, trigger test webhook events:

```bash
# Test subscription creation
stripe trigger customer.subscription.created

# Test subscription update
stripe trigger customer.subscription.updated

# Test payment success
stripe trigger invoice.paid

# Test payment failure
stripe trigger invoice.payment_failed
```

### Step 6: Verify Events Processed

Check your server logs for webhook processing:

```
✅ Webhook event received: customer.subscription.created
✅ Signature verified successfully
✅ Processing subscription created event...
✅ User subscription updated in database
```

---

## Manual Testing (Without Stripe CLI)

### 1. Simulate Webhook Events

**Development Only** (disabled in production):

```bash
curl -X POST http://localhost:5000/api/webhooks/stripe-test/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "customer.subscription.created",
    "customerId": "cus_test_123",
    "subscriptionId": "sub_test_456"
  }'
```

**Supported Event Types:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

**Response:**
```json
{
  "success": true,
  "message": "Webhook event simulated",
  "event": {
    "id": "evt_test_1234567890",
    "type": "customer.subscription.created",
    "data": { ... }
  }
}
```

### 2. Test Signature Verification

Send a webhook with proper Stripe signature:

```bash
# This requires a real Stripe event with signature
curl -X POST http://localhost:5000/api/webhooks/stripe-test/verify-signature \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=signature_here" \
  -d @webhook_payload.json
```

**Success Response:**
```json
{
  "success": true,
  "message": "Signature verification successful",
  "event": {
    "id": "evt_xxx",
    "type": "customer.subscription.created",
    "created": 1234567890
  }
}
```

**Failure Response:**
```json
{
  "success": false,
  "error": "Signature verification failed",
  "errorType": "invalid_signature",
  "recommendation": "Verify STRIPE_WEBHOOK_SECRET matches your Stripe dashboard"
}
```

---

## Production Testing

### Step 1: Configure Webhook Endpoint

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter your production URL: `https://yourdomain.com/api/webhooks/stripe`
4. Select events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

### Step 2: Copy Signing Secret

1. After creating the endpoint, click to reveal the signing secret
2. Add to your production environment variables:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_production_secret_here
   ```

### Step 3: Send Test Events from Dashboard

1. In Stripe Dashboard > Webhooks > Your Endpoint
2. Click "Send test webhook"
3. Select event type and click "Send test webhook"
4. Verify response shows 200 OK

### Step 4: Monitor Webhook Logs

Check webhook logs in:
- **Stripe Dashboard:** Webhooks tab shows delivery status
- **Your Server:** Application logs show processing
- **Database:** Verify subscription/payment records updated

---

## Troubleshooting

### Issue: "Webhook secret not configured"

**Solution:**
```bash
# Check .env file
cat .env | grep STRIPE_WEBHOOK_SECRET

# If missing, add:
echo "STRIPE_WEBHOOK_SECRET=whsec_your_secret_here" >> .env

# Restart server
npm run dev
```

### Issue: "Signature verification failed"

**Possible Causes:**
1. **Wrong webhook secret** - Verify secret matches Stripe dashboard
2. **Body parsing issue** - Webhook route must use raw body (not JSON parsed)
3. **Clock skew** - Server time significantly different from Stripe's time

**Solution:**
```bash
# 1. Verify webhook secret
curl http://localhost:5000/api/webhooks/stripe-test/config

# 2. Check server configuration (server/index.ts)
# Ensure raw body parsing for webhook route:
# app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }))

# 3. Check system time
date  # Should be within 5 minutes of actual time
```

### Issue: "Timestamp mismatch"

**Solution:**
Stripe rejects webhooks if timestamp is > 5 minutes old.

```bash
# Sync system clock
sudo ntpdate -s time.nist.gov  # Linux/macOS

# Windows (run as admin):
w32tm /resync
```

### Issue: Webhook endpoint unreachable (Production)

**Check:**
1. **Firewall rules** - Port 443 open for HTTPS
2. **SSL certificate** - Valid and not expired
3. **DNS configuration** - Domain resolves correctly
4. **Load balancer** - Routes `/api/webhooks/stripe` to server

**Test:**
```bash
# Test from external server
curl -I https://yourdomain.com/api/webhooks/stripe

# Should return 405 Method Not Allowed (GET not supported)
# POST requests should work
```

---

## Testing Checklist

### Development Testing
- [ ] Configuration check passes
- [ ] Diagnostics show all systems healthy
- [ ] Stripe CLI forwards webhooks successfully
- [ ] Subscription created event processed
- [ ] Invoice paid event processed
- [ ] Payment failed event handled gracefully
- [ ] Database records updated correctly
- [ ] Server logs show successful processing

### Staging/Production Testing
- [ ] Webhook endpoint added to Stripe dashboard
- [ ] Signing secret configured in environment
- [ ] Test webhook sent from Stripe dashboard
- [ ] Response shows 200 OK
- [ ] Event appears in webhook logs (Stripe dashboard)
- [ ] Application logs show processing
- [ ] Database records updated
- [ ] User notifications sent (if applicable)

---

## API Endpoints Reference

### GET /api/webhooks/stripe-test/config
Check webhook configuration status

**Response:**
```json
{
  "success": true,
  "config": { ... },
  "setup_instructions": { ... }
}
```

### GET /api/webhooks/stripe-test/diagnostics
Comprehensive webhook system diagnostics

**Response:**
```json
{
  "checks": {
    "stripeSDK": { "status": "ready" },
    "environment": { ... },
    "billingService": { "status": "ready" },
    "stripeAPI": { "connected": true }
  },
  "overall": { "status": "healthy" }
}
```

### POST /api/webhooks/stripe-test/simulate
Simulate webhook events (development only)

**Request:**
```json
{
  "eventType": "customer.subscription.created",
  "customerId": "cus_test_123",
  "subscriptionId": "sub_test_456"
}
```

### POST /api/webhooks/stripe-test/verify-signature
Test signature verification without processing

**Headers:**
```
Stripe-Signature: t=xxx,v1=xxx
```

### GET /api/webhooks/stripe-test/events
List recent webhook events from Stripe

**Query:**
```
?limit=10
```

---

## Security Best Practices

### 1. Always Verify Signatures
```typescript
// ✅ GOOD - Verify signature
const event = stripe.webhooks.constructEvent(
  req.body,
  signature,
  webhookSecret
);

// ❌ BAD - Skip verification
const event = JSON.parse(req.body);
```

### 2. Use Raw Body for Webhooks
```typescript
// server/index.ts
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));
app.use(express.json()); // Other routes
```

### 3. Protect Test Endpoints
```typescript
// Disable simulation in production
if (process.env.NODE_ENV === 'production') {
  return res.status(403).json({ error: 'Disabled in production' });
}
```

### 4. Handle Idempotency
```typescript
// Track processed event IDs to prevent duplicate processing
const processedEvents = new Set();

if (processedEvents.has(event.id)) {
  return res.json({ received: true }); // Already processed
}

// Process event...
processedEvents.add(event.id);
```

### 5. Use HTTPS in Production
- Stripe requires HTTPS for webhook endpoints
- Valid SSL certificate required
- Redirect HTTP to HTTPS

---

## Monitoring & Alerts

### What to Monitor

1. **Webhook Success Rate**
   - Target: > 99% success rate
   - Alert if < 95%

2. **Processing Latency**
   - Target: < 1 second
   - Alert if > 5 seconds

3. **Failed Events**
   - Alert on any payment_failed events
   - Alert on 3+ consecutive failures

4. **Signature Verification Failures**
   - Alert on any verification failures (potential security issue)

### Stripe Dashboard Monitoring

- **Webhooks > Endpoint** - View delivery status
- **Event Log** - See all Stripe events
- **Failed Attempts** - Review and retry failed webhooks

---

## Support

### Stripe Resources
- [Webhook Documentation](https://stripe.com/docs/webhooks)
- [Webhook Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Stripe CLI Guide](https://stripe.com/docs/stripe-cli)

### Internal Resources
- **Production Issues:** Check `server/services/billing/unified-billing-service.ts`
- **Webhook Handler:** `server/routes/stripe-webhooks.ts`
- **Testing Tools:** `server/routes/stripe-webhook-test.ts`

---

**Last Updated:** January 2025
**Status:** Production Ready
**Maintainer:** Chimari Development Team
