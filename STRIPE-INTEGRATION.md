# Stripe Integration Documentation

**Last Updated**: October 18, 2025
**Status**: ✅ Fully Integrated with Admin UI

---

## Overview

The ChimariData platform integrates with Stripe to manage subscription billing and pricing. All subscription tier changes made by administrators are automatically synchronized with Stripe products and prices.

---

## Architecture

### Single Source of Truth Flow

```
Admin UI Update → Backend API → Local Update + Stripe Sync → Response with Sync Status
```

1. **Admin makes changes** in `client/src/pages/admin/subscription-management.tsx`
2. **Frontend sends PUT** to `/api/pricing/tiers/:tierId`
3. **Backend processes**:
   - Updates `shared/subscription-tiers.ts` (in-memory + file)
   - Syncs with Stripe via `StripeSyncService`
   - Returns update status + Stripe sync status
4. **Frontend displays** success message with Stripe sync confirmation

---

## Key Components

### 1. Stripe Sync Service
**Location**: `server/services/stripe-sync.ts`

**Purpose**: Manages all Stripe product and price synchronization

**Key Methods**:
- `syncTierWithStripe(tierId, tierData)` - Syncs a single tier
- `syncProduct(tierId, tierData)` - Creates or updates Stripe Product
- `syncPrice(productId, priceAmount, tierName)` - Creates new Price (archives old ones)
- `syncAllTiersWithStripe()` - Bulk sync all tiers
- `isStripeConfigured()` - Check if Stripe is properly configured

**Features**:
- ✅ Automatic product creation/update
- ✅ Price versioning (archives old prices, creates new)
- ✅ Metadata tracking (tier limits, features)
- ✅ Graceful degradation if Stripe not configured
- ✅ Error handling and logging

### 2. Pricing API Routes
**Location**: `server/routes/pricing.ts`

**Endpoints**:

#### GET `/api/pricing/tiers`
Returns all subscription tiers with current pricing and features.

**Authentication**: None (public)

**Response**:
```json
{
  "success": true,
  "tiers": [
    {
      "id": "trial",
      "name": "Trial",
      "price": 1,
      "description": "Perfect for testing our platform",
      "features": [...],
      "limits": {...},
      "stripeProductId": "prod_...",
      "stripePriceId": "price_..."
    }
  ]
}
```

#### PUT `/api/pricing/tiers/:tierId`
Updates a subscription tier and syncs with Stripe (Admin only).

**Authentication**: Required + Admin permission (`subscriptions:manage`)

**Request Body**:
```json
{
  "price": 20,
  "description": "Updated description",
  "limits": {
    "maxFiles": 5,
    "maxFilesSizeMB": 100,
    "maxDataProcessingMB": 500
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Subscription tier 'professional' updated successfully",
  "tier": {...},
  "stripeSync": {
    "synced": true,
    "productId": "prod_ABC123",
    "priceId": "price_XYZ789",
    "error": null
  }
}
```

#### POST `/api/pricing/subscription`
Creates a Stripe PaymentIntent for user subscription.

**Authentication**: Required (user must be logged in)

**Request Body**:
```json
{
  "planType": "professional"
}
```

**Response**:
```json
{
  "success": true,
  "clientSecret": "pi_..._secret_...",
  "priceId": "price_XYZ789",
  "productId": "prod_ABC123",
  "paymentIntentId": "pi_..."
}
```

**Features**:
- Creates Stripe Customer if user doesn't have one
- Syncs tier with Stripe before creating payment
- Stores Stripe Customer ID in user record
- Returns real PaymentIntent client secret
- Saves payment method for future charges

#### POST `/api/pricing/subscription/cancel`
Cancels user's subscription at end of billing period.

**Authentication**: Required (user must be logged in)

**Request Body**: None

**Response**:
```json
{
  "success": true,
  "message": "Subscription will be cancelled at the end of the current billing period",
  "cancelAt": "2025-11-18T00:00:00.000Z",
  "subscriptionId": "sub_..."
}
```

**Behavior**:
- Cancels at period end (user retains access until then)
- Updates Stripe subscription (cancel_at_period_end: true)
- Webhook will handle final cancellation

#### POST `/api/pricing/subscription/reactivate`
Reactivates a cancelled subscription.

**Authentication**: Required (user must be logged in)

**Request Body**: None

**Response**:
```json
{
  "success": true,
  "message": "Subscription reactivated successfully",
  "subscriptionId": "sub_..."
}
```

**Behavior**:
- Removes cancellation flag from Stripe
- User subscription continues normally
- Only works if subscription hasn't ended yet

### 3. Admin UI Integration
**Location**: `client/src/pages/admin/subscription-management.tsx`

**Features**:
- ✅ Fetches tiers from `/api/pricing/tiers` on mount
- ✅ Edit tier pricing, limits, and features
- ✅ Saves changes with PUT request
- ✅ Displays Stripe sync status in alert
- ✅ Real-time UI updates after successful save

**Stripe Sync Status Display**:
```typescript
✅ Synced with Stripe (Product: prod_ABC, Price: price_XYZ)
⚠️ Stripe sync failed: <error message>
⚠️ Stripe not configured
```

---

## Configuration

### Environment Variables

**Required for Stripe Integration**:
```env
STRIPE_SECRET_KEY=sk_test_...
VITE_STRIPE_PUBLIC_KEY=pk_test_...
```

**Optional**:
```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Development Mode

If `STRIPE_SECRET_KEY` is not set:
- ✅ System continues to function
- ⚠️ Stripe sync is skipped
- ⚠️ Mock payment intents are returned
- ℹ️ Warnings logged to console

---

## Stripe Product Structure

### Product Metadata
Each Stripe product includes metadata about the tier:

```javascript
{
  tierId: "professional",
  maxFiles: "5",
  maxFileSizeMB: "100",
  totalDataVolumeMB: "500",
  aiInsights: "5"
}
```

### Price Structure
- **Currency**: USD
- **Billing Interval**: Monthly (recurring)
- **Amount**: Stored in cents (e.g., $20 = 2000)
- **Versioning**: Old prices archived when price changes

---

## How It Works

### Admin Updates Pricing

1. **Admin opens** `Subscription Management` page
2. **Clicks Edit** on a tier (e.g., Professional)
3. **Changes price** from $20 to $25
4. **Clicks Save**

### Backend Processing

```typescript
// 1. Validate tier exists
if (!SUBSCRIPTION_TIERS[tierId]) { return 404; }

// 2. Build updated tier object
const updatedTier = { ...SUBSCRIPTION_TIERS[tierId], price: 25 };

// 3. Sync with Stripe
const stripeSyncResult = await stripeSyncService.syncTierWithStripe(tierId, updatedTier);

// 4. Update Stripe IDs if successful
if (stripeSyncResult.success) {
  updatedTier.stripeProductId = stripeSyncResult.stripeProductId;
  updatedTier.stripePriceId = stripeSyncResult.stripePriceId;
}

// 5. Update local data
SUBSCRIPTION_TIERS[tierId] = updatedTier;

// 6. Persist to file
fs.writeFileSync('shared/subscription-tiers.ts', updatedTierCode);

// 7. Return response with Stripe sync status
```

### Stripe API Calls

```typescript
// Check if product exists and update
await stripe.products.update(productId, {
  name: "Professional",
  description: "Updated description"
});

// Archive old prices
await stripe.prices.update(oldPriceId, { active: false });

// Create new price
const newPrice = await stripe.prices.create({
  product: productId,
  unit_amount: 2500, // $25.00
  currency: 'usd',
  recurring: { interval: 'month' }
});
```

### Frontend Confirmation

```javascript
Alert: "Tier updated successfully!

✅ Synced with Stripe (Product: prod_ABC123, Price: price_XYZ789)"
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Admin UI (subscription-management.tsx)                      │
│                                                             │
│ 1. Fetch tiers: GET /api/pricing/tiers                     │
│ 2. Edit tier pricing/limits                                │
│ 3. Save: PUT /api/pricing/tiers/:tierId                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend API (server/routes/pricing.ts)                     │
│                                                             │
│ 1. Validate request                                        │
│ 2. Build updated tier object                              │
│ 3. Call StripeSyncService.syncTierWithStripe()            │
│ 4. Update SUBSCRIPTION_TIERS in memory                    │
│ 5. Write to shared/subscription-tiers.ts                  │
│ 6. Return response with Stripe sync status                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Stripe Sync Service (server/services/stripe-sync.ts)      │
│                                                             │
│ 1. Check if product exists in Stripe                      │
│ 2. Update product OR create new one                       │
│ 3. List existing active prices                            │
│ 4. Archive old prices (set active: false)                 │
│ 5. Create new price with updated amount                   │
│ 6. Return { productId, priceId, success }                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Stripe API                                                 │
│                                                             │
│ - stripe.products.update()                                 │
│ - stripe.products.create()                                 │
│ - stripe.prices.list()                                     │
│ - stripe.prices.update() // Archive old                   │
│ - stripe.prices.create() // Create new                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Testing

### Manual Testing

1. **Set Stripe Keys** in `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY
   ```

2. **Start Server**:
   ```bash
   npm run dev
   ```

3. **Open Admin UI**:
   - Navigate to `/admin/subscription-management`
   - Go to "Subscription Tiers" tab

4. **Edit Tier**:
   - Click "Edit" on any tier
   - Change price (e.g., $20 → $25)
   - Click "Save"

5. **Verify**:
   - Check alert message for Stripe sync status
   - Check server logs for Stripe API calls
   - Verify in Stripe Dashboard:
     - Products → See updated product
     - Prices → See new active price, old price archived

### Without Stripe Keys

System works in "mock mode":
- ✅ Tier updates persist locally
- ⚠️ Stripe sync skipped with warning
- ⚠️ Mock payment intents returned
- ℹ️ No Stripe API calls made

---

## Troubleshooting

### Issue: "Stripe not configured"

**Cause**: Missing `STRIPE_SECRET_KEY` environment variable

**Solution**:
1. Get Stripe test key from https://dashboard.stripe.com/test/apikeys
2. Add to `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY
   ```
3. Restart server

### Issue: "Failed to sync product: resource_missing"

**Cause**: Stripe product ID in `shared/subscription-tiers.ts` doesn't exist in Stripe

**Solution**:
1. Remove `stripeProductId` and `stripePriceId` from tier
2. Save tier again - new product will be created

### Issue: Price not updating in Stripe

**Cause**: Prices are immutable in Stripe

**Expected Behavior**:
- Old price is archived (active: false)
- New price is created with updated amount
- Subscription tier references new price ID

---

## Complete Billing Flow

### User Subscription Flow

```
1. User selects plan → POST /api/pricing/subscription
2. Backend creates Stripe customer (if new)
3. Backend syncs tier with Stripe (creates/updates product & price)
4. Backend creates PaymentIntent
5. Frontend displays Stripe Elements with clientSecret
6. User enters payment details
7. Stripe processes payment
8. Webhook received → POST /api/webhooks/stripe
9. Webhook updates user subscription status in database
10. User gains access to tier features
```

### Admin Updates Pricing Flow

```
1. Admin edits tier in UI → PUT /api/pricing/tiers/:tierId
2. Backend validates admin permissions
3. Backend syncs with Stripe:
   - Updates product metadata
   - Archives old price
   - Creates new price
4. Backend updates shared/subscription-tiers.ts file
5. Backend returns success with Stripe sync status
6. Admin sees confirmation: "✅ Synced with Stripe"
```

### Webhook Processing Flow

```
1. Stripe sends webhook → POST /api/webhooks/stripe
2. Verify signature (SECURITY)
3. Parse event type
4. Update database in transaction:
   - customer.subscription.created → Set active status
   - customer.subscription.updated → Update expiry date
   - customer.subscription.deleted → Set cancelled status
   - invoice.paid → Mark as paid
   - invoice.payment_failed → Set past_due status
5. Return 200 acknowledgement
```

### Cancellation Flow

```
1. User requests cancellation → POST /api/pricing/subscription/cancel
2. Backend updates Stripe subscription (cancel_at_period_end: true)
3. Webhook received (subscription.updated) → Update database
4. User retains access until period end
5. At period end:
   - Webhook received (subscription.deleted)
   - Database updated (status: cancelled, tier: none)
   - User loses access
```

## Implemented Features

- [x] Create actual Stripe PaymentIntents in subscription endpoint
- [x] Handle Stripe webhook events for subscription updates
- [x] Implement subscription cancellation flow
- [x] Automatic webhook signature verification
- [x] Subscription status tracking in database
- [x] Admin authentication for tier management
- [x] Real Stripe customer creation
- [x] Payment method saving for future charges

## Future Enhancements

- [ ] Add yearly pricing support
- [ ] Support for promo codes and discounts
- [ ] Email notifications for subscription changes
- [ ] Subscription upgrade/downgrade flow
- [ ] Usage-based billing integration
- [ ] Invoice generation and PDF exports

---

## Security Considerations

### Environment Variables
- ✅ Stripe secret key stored in `.env`
- ✅ Never exposed to frontend
- ✅ Not committed to git

### API Endpoints
- TODO: Add admin authentication to PUT `/api/pricing/tiers/:tierId`
- TODO: Add user authentication to POST `/api/pricing/subscription`
- TODO: Implement RBAC for tier management

### Webhook Security
- ✅ Webhook signature verification implemented in `server/routes/stripe-webhooks.ts`
- ✅ Raw body parsing for signature validation
- TODO: Enable webhook secret in production

---

## Related Files

### Backend
- `server/services/stripe-sync.ts` - Stripe synchronization service
- `server/routes/pricing.ts` - Pricing API endpoints
- `server/routes/stripe-webhooks.ts` - Webhook handler
- `shared/subscription-tiers.ts` - Tier definitions (single source of truth)

### Frontend
- `client/src/pages/admin/subscription-management.tsx` - Admin UI
- `client/src/pages/subscribe.tsx` - User subscription page
- `client/src/pages/pricing.tsx` - Public pricing display

### Configuration
- `.env` - Environment variables (Stripe keys)
- `.env.example` - Template for required variables

---

**Implementation Complete**: ✅
**Admin UI Integration**: ✅
**Stripe Sync**: ✅
**Production Ready**: ⚠️ (Requires Stripe keys and authentication)
