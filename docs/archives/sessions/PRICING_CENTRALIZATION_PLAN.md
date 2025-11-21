# Pricing Centralization Implementation Plan

## Overview
All pricing data will be stored in the database and managed through admin pages. No hardcoded pricing values.

## Database Schema

### Tables Created
1. `pricing_components` - Base component pricing (analysis, visualization, ML, etc.)
2. `pricing_subscription_tiers` - Subscription tier configuration
3. `pricing_services` - One-time service pricing (pay-per-analysis, consultation)
4. `pricing_rules` - Dynamic pricing rules (size/complexity multipliers, feature addons)

## Implementation Steps

### Step 1: Database Schema ✅
- [x] Create pricing configuration tables
- [ ] Run database migration

### Step 2: Admin API Endpoints
Create endpoints in `server/routes/admin/`:
- `GET /api/admin/pricing/components` - List all components
- `POST /api/admin/pricing/components` - Create component
- `PUT /api/admin/pricing/components/:id` - Update component
- `GET /api/admin/pricing/subscription-tiers` - List tiers
- `PUT /api/admin/pricing/subscription-tiers/:id` - Update tier
- `GET /api/admin/pricing/services` - List services
- `PUT /api/admin/pricing/services/:id` - Update service
- `GET /api/admin/pricing/rules` - List rules
- `POST /api/admin/pricing/rules` - Create rule
- `PUT /api/admin/pricing/rules/:id` - Update rule

### Step 3: Public API Endpoints
Create endpoints for frontend consumption:
- `GET /api/pricing/components` - Get active components
- `GET /api/pricing/subscription-tiers` - Get active tiers
- `GET /api/pricing/services` - Get active services
- `POST /api/pricing/calculate` - Calculate price for configuration

### Step 4: Admin UI
Create admin pages in `client/src/pages/admin/`:
- `/admin/pricing/components` - Component pricing management
- `/admin/pricing/subscriptions` - Subscription tier management
- `/admin/pricing/services` - Service pricing management
- `/admin/pricing/rules` - Pricing rules management

### Step 5: Frontend Updates
Update all frontend pages to fetch pricing from API:
- Update `client/src/pages/pricing.tsx` to fetch from API
- Update `client/src/pages/pay-per-analysis.tsx` to use dynamic pricing
- Update `client/src/pages/expert-consultation.tsx` to use dynamic pricing
- Remove all hardcoded pricing values

## Pricing Calculation Logic

### Minimum Feature Rate
As requested, the minimum feature rate should be calculated as:
```
minimum_feature_price = min(component_prices for selected_features)
```

### Dynamic Pricing
Prices calculated based on:
- Base component prices
- Data size multipliers
- Complexity multipliers
- Feature addons
- Progressive discounts (multiple features)

## Files to Update

### Backend
1. `server/routes/admin.ts` - Add pricing management endpoints
2. `server/routes/pricing.ts` - Update to fetch from database
3. `server/services/pricing-calculator.ts` - Price calculation service
4. `server/services/pricing-admin.ts` - Admin pricing management

### Frontend
1. `client/src/pages/pricing.tsx` - Fetch from API
2. `client/src/pages/pay-per-analysis.tsx` - Use dynamic pricing
3. `client/src/pages/expert-consultation.tsx` - Use dynamic pricing
4. `client/src/pages/admin/pricing-*.tsx` - Admin management pages
5. Remove all hardcoded pricing constants

## Testing
- Test admin can configure pricing
- Test pricing displays correctly on frontend
- Test price calculations with different configurations
- Test Stripe integration with database prices


